jest.mock('../src/services/notificationService', () => ({
    sendSms: jest.fn().mockResolvedValue({ success: true }),
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../src/services/notificationJobService', () => ({
    triggerEventForRole: jest.fn().mockResolvedValue({ recipients: 1, scheduled: 1 }),
}));

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { encrypt } = require('../src/utils/crypto');
const {
    getPublicLandingOverview,
    lookupPublicCaseStatus,
    verifyPublicCaseStatus,
    refreshPublicCaseStatus,
    createPublicAppointmentRequest,
    authorizePublicFinalReport,
} = require('../src/controllers/publicLandingController');

const createResponse = () => {
    const response = { set: jest.fn(), json: jest.fn(), status: jest.fn() };
    response.status.mockReturnValue(response);
    return response;
};

describe('public landing overview', () => {
    test('returns aggregate data and active modalities without patient details', async () => {
        const db = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ studies_today: 25, pending_reports: 7, waiting_today: 3, imaging_queue: 4, reporting_queue: 6, priority_today: 2, completed_today: 20, delayed_reports: 1, studies_this_week: 110, registration_minutes: 4, imaging_minutes: 18, reporting_minutes: 36, delivery_minutes: 6, active_modalities: 5 }] })
            .mockResolvedValueOnce({ rows: [{ open_claims: 9 }] })
            .mockResolvedValueOnce({ rows: [{ delivered_today: 14 }] })
            .mockResolvedValueOnce({ rows: [{ label: 'CT', count: 12 }] })
            .mockResolvedValueOnce({ rows: [{ id: 'mod-1', name: 'CT', type: 'CT' }] }) };
        const res = createResponse();

        await getPublicLandingOverview(db)({}, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload.metrics).toEqual({ studiesToday: 25, pendingReports: 7, activeModalities: 5, completionRate: 80 });
        expect(payload.modalities).toEqual([{ id: 'mod-1', name: 'CT', type: 'CT' }]);
        expect(payload.pipeline).toEqual([
            { code: 'waiting', count: 3 }, { code: 'imaging', count: 4 },
            { code: 'reporting', count: 6 }, { code: 'delivered', count: 14 },
        ]);
        expect(JSON.stringify(payload)).not.toMatch(/mrn|patient_id|patient_name|phone|date_of_birth|report_content/i);
        expect(res.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    });

    test('returns null for optional feeds when their tables are unavailable', async () => {
        const db = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ studies_today: 0, completed_today: 0 }] })
            .mockRejectedValueOnce(new Error('claims unavailable'))
            .mockRejectedValueOnce(new Error('deliveries unavailable'))
            .mockRejectedValueOnce(new Error('mix unavailable'))
            .mockRejectedValueOnce(new Error('modalities unavailable')) };
        const res = createResponse();
        await getPublicLandingOverview(db)({}, res, jest.fn());
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            metrics: expect.objectContaining({ completionRate: 0 }),
            services: expect.objectContaining({ openClaims: null, deliveredToday: null }),
            modalities: [],
        }));
    });
});

describe('secure public case lookup', () => {
    beforeAll(() => {
        process.env.JWT_SECRET ||= 'test-jwt-secret-that-is-long-enough-for-tests';
    });

    test('returns the same generic challenge response for known and unknown identifiers', async () => {
        const knownDb = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ patient_id: '11111111-1111-4111-8111-111111111111', exam_id: '22222222-2222-4222-8222-222222222222' }] })
            .mockResolvedValueOnce({ rows: [] }) };
        const unknownDb = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] }) };
        const knownRes = createResponse();
        const unknownRes = createResponse();

        await lookupPublicCaseStatus(knownDb)({ body: { mrn: 'PAT-000001' }, ip: '127.0.0.1' }, knownRes, jest.fn());
        await lookupPublicCaseStatus(unknownDb)({ body: { mrn: 'PAT-404' }, ip: '127.0.0.1' }, unknownRes, jest.fn());

        const known = knownRes.json.mock.calls[0][0];
        const unknown = unknownRes.json.mock.calls[0][0];
        expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
        expect(known).toEqual(expect.objectContaining({ verificationRequired: true, challengeId: expect.any(String), expiresInSeconds: 300 }));
        expect(known).not.toHaveProperty('found');
        expect(unknown).not.toHaveProperty('found');
        expect(knownRes.status).toHaveBeenCalledWith(202);
        expect(unknownRes.status).toHaveBeenCalledWith(202);
    });

    test('reuses an unexpired challenge to prevent distributed verification spam', async () => {
        const challengeId = '55555555-5555-4555-8555-555555555555';
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{
            challenge_id: challengeId,
            expires_in_seconds: 240,
        }] }) };
        const res = createResponse();

        await lookupPublicCaseStatus(db)({ body: { mrn: 'PAT-000001' } }, res, jest.fn());

        expect(db.query).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            challengeId,
            expiresInSeconds: 240,
            verificationRequired: true,
        }));
    });

    test('reveals status and issues a report token only after the correct code', async () => {
        jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(123456);
        const row = {
            patient_id: '11111111-1111-4111-8111-111111111111',
            exam_id: '22222222-2222-4222-8222-222222222222',
            status: 'Finalized', report_status: 'Finalized', report_finalized_at: new Date(),
            exam_completed_at: new Date(), modality_name: 'MRI', exam_type_name: 'Brain MRI',
        };
        let challenge;
        const db = { query: jest.fn(async (sql, params) => {
            if (sql.includes('SELECT c.challenge_id')) return { rows: [] };
            if (sql.includes('UPPER(p.mrn)')) return { rows: [row] };
            if (sql.includes('INSERT INTO public_case_verification_challenges')) {
                challenge = { challenge_id: params[0], exam_id: row.exam_id, code_hash: params[4] };
                return { rows: [] };
            }
            if (sql.includes('SET attempts = attempts + 1')) return { rows: [challenge] };
            if (sql.includes('SET verified_at = CURRENT_TIMESTAMP')) return { rows: [] };
            if (sql.includes('e.exam_id = $1')) return { rows: [row] };
            if (sql.includes('SELECT 1')) return { rows: [{ '?column?': 1 }] };
            throw new Error(`Unexpected query: ${sql}`);
        }) };
        const startRes = createResponse();
        await lookupPublicCaseStatus(db)({ body: { mrn: 'PAT-000001' } }, startRes, jest.fn());
        const challengeId = startRes.json.mock.calls[0][0].challengeId;

        const verifyRes = createResponse();
        await verifyPublicCaseStatus(db)({ body: { challengeId, code: '123456' } }, verifyRes, jest.fn());
        const payload = verifyRes.json.mock.calls[0][0];
        expect(payload).toEqual(expect.objectContaining({ found: true, completed: true }));
        expect(payload.report).toEqual(expect.objectContaining({ accessToken: expect.any(String), expiresInSeconds: 300 }));
        expect(JSON.stringify(payload)).not.toMatch(/PAT-000001|patient_id|report_content/i);

        const request = { body: { accessToken: payload.report.accessToken }, params: {} };
        const next = jest.fn();
        await authorizePublicFinalReport(db)(request, createResponse(), next);
        expect(next).toHaveBeenCalledWith();
        expect(request.params.id).toBe(row.exam_id);
        expect(request.user).toEqual({ role: 'PublicReport' });
        crypto.randomInt.mockRestore();
    });

    test('rejects an invalid code without querying the case', async () => {
        const challengeId = '33333333-3333-4333-8333-333333333333';
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{
            challenge_id: challengeId,
            exam_id: '22222222-2222-4222-8222-222222222222',
            code_hash: '0'.repeat(64),
        }] }) };
        const res = createResponse();
        await verifyPublicCaseStatus(db)({ body: { challengeId, code: '999999' } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('resend rotates the code without resetting the attempts budget', async () => {
        const challengeId = '66666666-6666-4666-8666-666666666666';
        let updateSql = '';
        const db = { query: jest.fn(async (sql) => {
            if (sql.includes('SELECT c.challenge_id')) return { rows: [{
                challenge_id: challengeId,
                patient_id: '11111111-1111-4111-8111-111111111111',
                exam_id: '22222222-2222-4222-8222-222222222222',
                delivery_channel: 'SMS',
                phone_enc: null, email_enc: null, preferred_language: 'en',
                expires_in_seconds: 240,
            }] };
            if (sql.includes('SET code_hash')) { updateSql = sql; return { rows: [] }; }
            throw new Error(`Unexpected query: ${sql}`);
        }) };
        const res = createResponse();

        await lookupPublicCaseStatus(db)({ body: { mrn: 'PAT-000001', resend: true } }, res, jest.fn());

        expect(updateSql).toContain('SET code_hash');
        expect(updateSql).not.toMatch(/attempts\s*=\s*0/i);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            challengeId,
            expiresInSeconds: 300,
            verificationRequired: true,
        }));
        // Never leak the code outside local development.
        expect(res.json.mock.calls[0][0]).not.toHaveProperty('devCode');
    });

    test('includes the verification code in the response only in local development', async () => {
        const previousNodeEnv = process.env.NODE_ENV;
        process.env.ENCRYPTION_KEY ||= '1'.repeat(64);
        process.env.NODE_ENV = 'development';
        try {
            jest.resetModules();
            const devController = require('../src/controllers/publicLandingController');
            const { encrypt: devEncrypt } = require('../src/utils/crypto');

            const row = {
                patient_id: '11111111-1111-4111-8111-111111111111',
                exam_id: '22222222-2222-4222-8222-222222222222',
                phone_enc: devEncrypt('+201000000000'), email_enc: null, preferred_language: 'en',
            };
            const db = { query: jest.fn(async (sql) => {
                if (sql.includes('SELECT c.challenge_id')) return { rows: [] };
                if (sql.includes('UPPER(p.mrn)')) return { rows: [row] };
                if (sql.includes('INSERT INTO public_case_verification_challenges')) return { rows: [] };
                throw new Error(`Unexpected query: ${sql}`);
            }) };
            const res = createResponse();

            await devController.lookupPublicCaseStatus(db)({ body: { mrn: 'PAT-000001' }, ip: '127.0.0.1' }, res, jest.fn());

            expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({
                devCode: expect.stringMatching(/^\d{6}$/),
            }));
        } finally {
            process.env.NODE_ENV = previousNodeEnv;
            jest.resetModules();
        }
    });
});

describe('public case status refresh session', () => {
    beforeAll(() => {
        process.env.JWT_SECRET ||= 'test-jwt-secret-that-is-long-enough-for-tests';
    });

    const examId = '22222222-2222-4222-8222-222222222222';
    const challengeId = '77777777-7777-4777-8777-777777777777';
    const inProgressRow = {
        patient_id: '11111111-1111-4111-8111-111111111111',
        exam_id: examId,
        status: 'In Exam', report_status: null, queue_stage: 'in exam',
        report_locked: false, created_at: new Date(), arrived_at: new Date(),
        prep_started_at: null, prep_completed_at: null,
        exam_started_at: new Date(), exam_completed_at: null,
        reporting_started_at: null, report_finalized_at: null, amended_at: null,
        modality_name: 'CT', exam_type_name: 'Chest CT',
    };
    const signStatusToken = () => jwt.sign(
        { scope: 'public-case-status', examId, challengeId },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', audience: 'VIARA-public-case-status', issuer: 'VIARA-public-portal', expiresIn: '30m' },
    );

    test('refreshes status with the session token and returns a fresh sliding session', async () => {
        const db = { query: jest.fn(async (sql) => {
            if (sql.includes("SET expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'")) return { rows: [{ challenge_id: challengeId }] };
            if (sql.includes('e.exam_id = $1')) return { rows: [inProgressRow] };
            throw new Error(`Unexpected query: ${sql}`);
        }) };
        const res = createResponse();

        await refreshPublicCaseStatus(db)({ body: { statusToken: signStatusToken() } }, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload).toEqual(expect.objectContaining({ found: true, completed: false }));
        expect(payload.session).toEqual(expect.objectContaining({ statusToken: expect.any(String), expiresInSeconds: 300 }));
        expect(payload.report).toEqual({ available: false, access: 'patient_portal' });
        expect(payload.estimate).toEqual(expect.objectContaining({ estimatedCompletionAt: expect.any(String) }));
        expect(JSON.stringify(payload)).not.toMatch(/patient_id|report_content|PAT-/i);
    });

    test('rejects the refresh once the verified challenge has lapsed', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = createResponse();
        await refreshPublicCaseStatus(db)({ body: { statusToken: signStatusToken() } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ error: expect.stringContaining('expired') }));
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('rejects a wrong-purpose or forged token', async () => {
        const wrongPurpose = jwt.sign(
            { scope: 'public-final-report', examId, challengeId },
            process.env.JWT_SECRET,
            { algorithm: 'HS256', audience: 'VIARA-public-final-report', issuer: 'VIARA-public-portal', expiresIn: '5m' },
        );
        const res = createResponse();
        await refreshPublicCaseStatus({ query: jest.fn() })({ body: { statusToken: wrongPurpose } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ error: expect.stringContaining('expired') }));
    });
});

describe('public appointment requests', () => {
    beforeAll(() => {
        process.env.ENCRYPTION_KEY ||= '1'.repeat(64);
        process.env.JWT_SECRET ||= 'test-jwt-secret-that-is-long-enough-for-tests';
    });

    test('stores encrypted contact details and returns only a tracking reference', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{
            request_id: '44444444-4444-4444-8444-444444444444',
            request_number: 'WEB-20260908-ABCDEF12', status: 'Pending', created_at: new Date(),
        }] }) };
        const res = createResponse();
        await createPublicAppointmentRequest(db)({
            body: { name: 'Test Patient', phone: '+20 100 000 0000', mode: 'center', service: 'MRI', preferredDate: null, consent: true, website: '' },
            ip: '127.0.0.1', get: () => 'test-agent',
        }, res, jest.fn());

        const insertValues = db.query.mock.calls[0][1];
        expect(insertValues[1]).toMatch(/^v2:/);
        expect(insertValues[2]).toMatch(/^v2:/);
        expect(insertValues[1]).not.toContain('Test Patient');
        expect(insertValues[2]).not.toContain('1000000000');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ requestNumber: 'WEB-20260908-ABCDEF12', status: 'Pending' }));
        expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/Test Patient|100 000/);
    });
});
