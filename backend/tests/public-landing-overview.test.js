const { getPublicLandingOverview, lookupPublicCaseStatus } = require('../src/controllers/publicLandingController');

const createResponse = () => {
    const response = { set: jest.fn(), json: jest.fn(), status: jest.fn() };
    response.status.mockReturnValue(response);
    return response;
};

describe('public landing overview', () => {
    test('returns privacy-safe aggregate operational data', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({
                    rows: [{
                        studies_today: 25,
                        pending_reports: 7,
                        waiting_today: 3,
                        completed_today: 20,
                        studies_this_week: 110,
                        registration_minutes: 4,
                        imaging_minutes: 18,
                        reporting_minutes: 36,
                        delivery_minutes: 6,
                        active_modalities: 5,
                    }],
                })
                .mockResolvedValueOnce({ rows: [{ open_claims: 9 }] })
                .mockResolvedValueOnce({ rows: [{ delivered_today: 14 }] }),
        };
        const res = createResponse();
        const next = jest.fn();

        await getPublicLandingOverview(db)({}, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            metrics: {
                studiesToday: 25,
                pendingReports: 7,
                activeModalities: 5,
                completionRate: 80,
            },
            services: expect.objectContaining({
                waitingToday: 3,
                openClaims: 9,
                deliveredToday: 14,
            }),
            workflow: {
                registrationMinutes: 4,
                imagingMinutes: 18,
                reportingMinutes: 36,
                deliveryMinutes: 6,
            },
        }));

        const payload = res.json.mock.calls[0][0];
        expect(JSON.stringify(payload)).not.toMatch(/patient|staff|revenue|name|mrn/i);
    });

    test('returns null for optional feeds when their tables are unavailable', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ studies_today: 0, completed_today: 0 }] })
                .mockRejectedValueOnce(new Error('claims unavailable'))
                .mockRejectedValueOnce(new Error('deliveries unavailable')),
        };
        const res = createResponse();

        await getPublicLandingOverview(db)({}, res, jest.fn());

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            metrics: expect.objectContaining({ completionRate: 0 }),
            services: expect.objectContaining({ openClaims: null, deliveredToday: null }),
        }));
    });
});

describe('public last-case lookup', () => {
    test('returns only a finalized last report without patient identity fields', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{
            exam_id: 'exam-private-id',
            status: 'Finalized',
            report_status: 'Finalized',
            report_sections: { findings: '<p>No acute abnormality.</p>', impression: 'Normal study.' },
            report_content: '<p>fallback</p>',
            report_finalized_at: new Date('2026-08-01T09:00:00Z'),
            exam_completed_at: new Date('2026-08-01T08:00:00Z'),
            modality_name: 'MRI',
            exam_type_name: 'Brain MRI',
            digital_signature_name: 'Reporting radiologist',
            digital_signature_role: 'Consultant Radiologist',
        }] }) };
        const res = createResponse();

        await lookupPublicCaseStatus(db)({ body: { mrn: 'pat-000001' } }, res, jest.fn());

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPPER(p.mrn) = $1'), ['PAT-000001']);
        expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
        const payload = res.json.mock.calls[0][0];
        expect(payload).toEqual(expect.objectContaining({ found: true, completed: true }));
        expect(payload.report.sections).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'findings', content: 'No acute abnormality.' }),
            expect.objectContaining({ key: 'impression', content: 'Normal study.' }),
        ]));
        expect(JSON.stringify(payload)).not.toMatch(/PAT-000001|exam-private-id|patient_name|phone|date_of_birth/i);
    });

    test('returns a historical turnaround estimate for an unfinished report', async () => {
        const completedAt = new Date(Date.now() - 30 * 60 * 1000);
        const db = { query: jest.fn().mockResolvedValue({ rows: [{
            status: 'Reporting',
            report_status: 'Draft',
            queue_stage: 'Reporting',
            exam_completed_at: completedAt,
            reporting_started_at: completedAt,
            modality_name: 'CT',
            exam_type_name: 'Chest CT',
            average_report_seconds: 7200,
        }] }) };
        const res = createResponse();

        await lookupPublicCaseStatus(db)({ body: { mrn: 'PAT-000002' } }, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload).toEqual(expect.objectContaining({ found: true, completed: false }));
        expect(payload.case.status).toEqual(expect.objectContaining({ code: 'reporting', progress: 72 }));
        expect(payload.estimate.basedOn).toBe('recent_modality_turnaround');
        expect(new Date(payload.estimate.estimatedCompletionAt).getTime()).toBe(completedAt.getTime() + 7200 * 1000);
    });

    test('uses a generic not-found response and rejects malformed MRNs', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const notFound = createResponse();
        await lookupPublicCaseStatus(db)({ body: { mrn: 'PAT-404' } }, notFound, jest.fn());
        expect(notFound.json).toHaveBeenCalledWith({ found: false });

        const invalid = createResponse();
        await lookupPublicCaseStatus(db)({ body: { mrn: '**' } }, invalid, jest.fn());
        expect(invalid.status).toHaveBeenCalledWith(400);
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});
