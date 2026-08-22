const { getPublicLandingOverview, lookupPublicCaseStatus, authorizePublicFinalReport } = require('../src/controllers/publicLandingController');

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
                        imaging_queue: 4,
                        reporting_queue: 6,
                        priority_today: 2,
                        completed_today: 20,
                        delayed_reports: 1,
                        studies_this_week: 110,
                        registration_minutes: 4,
                        imaging_minutes: 18,
                        reporting_minutes: 36,
                        delivery_minutes: 6,
                        active_modalities: 5,
                    }],
                })
                .mockResolvedValueOnce({ rows: [{ open_claims: 9 }] })
                .mockResolvedValueOnce({ rows: [{ delivered_today: 14 }] })
                .mockResolvedValueOnce({ rows: [{ label: 'CT', count: 12 }, { label: 'MRI', count: 8 }] }),
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
                imagingQueue: 4,
                reportingQueue: 6,
                priorityToday: 2,
                delayedReports: 1,
            }),
            workflow: {
                registrationMinutes: 4,
                imagingMinutes: 18,
                reportingMinutes: 36,
                deliveryMinutes: 6,
            },
        }));

        const payload = res.json.mock.calls[0][0];
        expect(payload.pipeline).toEqual([
            { code: 'waiting', count: 3 },
            { code: 'imaging', count: 4 },
            { code: 'reporting', count: 6 },
            { code: 'delivered', count: 14 },
        ]);
        expect(payload.modalityMix).toEqual([{ label: 'CT', count: 12 }, { label: 'MRI', count: 8 }]);
        expect(payload.workload).toEqual(expect.objectContaining({
            priorityToday: 2,
            delayedReports: 1,
            pressureScore: 24,
        }));
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
    test('returns finalized status without clinical or signer content', async () => {
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
        expect(payload.case.status).toEqual(expect.objectContaining({ code: 'completed', progress: 100 }));
        expect(payload.case.workflow.at(-1)).toEqual(expect.objectContaining({ code: 'completed', state: 'current' }));
        expect(payload.report).toEqual(expect.objectContaining({
            available: true,
            access: 'public_token',
            accessToken: expect.any(String),
            expiresInSeconds: 600,
        }));
        expect(payload.report.accessToken).not.toContain('exam-private-id');
        expect(JSON.stringify(payload)).not.toMatch(/PAT-000001|exam-private-id|patient_name|phone|date_of_birth|acute abnormality|normal study|reporting radiologist|consultant radiologist/i);

        const accessRequest = { body: { accessToken: payload.report.accessToken }, params: {} };
        const accessResponse = createResponse();
        const accessNext = jest.fn();
        authorizePublicFinalReport(accessRequest, accessResponse, accessNext);
        expect(accessNext).toHaveBeenCalled();
        expect(accessRequest.params.id).toBe('exam-private-id');
        expect(accessRequest.user).toEqual({ role: 'PublicReport' });

        const sharedRequest = { body: {}, params: { accessToken: payload.report.accessToken } };
        const sharedNext = jest.fn();
        authorizePublicFinalReport(sharedRequest, createResponse(), sharedNext);
        expect(sharedNext).toHaveBeenCalled();
        expect(sharedRequest.params.id).toBe('exam-private-id');
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
        expect(payload.case.workflow.find((step) => step.code === 'reporting')).toEqual(expect.objectContaining({ state: 'current' }));
        expect(payload.estimate.basedOn).toBe('recent_modality_turnaround');
        expect(payload.estimate.remainingMinutes).toBeGreaterThan(0);
        expect(new Date(payload.estimate.estimatedCompletionAt).getTime()).toBe(completedAt.getTime() + 7200 * 1000);
    });

    test('uses the real report workflow state and includes imaging time in early estimates', async () => {
        const examStartedAt = new Date(Date.now() - 5 * 60 * 1000);
        const db = { query: jest.fn().mockResolvedValue({ rows: [{
            status: 'Scanning',
            report_status: 'Draft',
            queue_stage: 'In Exam',
            exam_started_at: examStartedAt,
            modality_name: 'MRI',
            average_exam_seconds: 1800,
            average_report_seconds: 3600,
            exam_sample_count: 8,
            report_sample_count: 12,
        }] }) };
        const res = createResponse();

        await lookupPublicCaseStatus(db)({ body: { mrn: 'PAT-000003' } }, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload.case.status).toEqual(expect.objectContaining({ code: 'imaging', phase: 'imaging', progress: 46 }));
        expect(payload.report.available).toBe(false);
        expect(payload.estimate.confidence).toBe('high');
        expect(new Date(payload.estimate.estimatedCompletionAt).getTime()).toBe(examStartedAt.getTime() + 5400 * 1000);
    });

    test('distinguishes typed, reviewed, and approved report states', async () => {
        const expected = [
            ['Typed', 'typing', 80],
            ['Reviewed', 'review', 88],
            ['Approved', 'approval', 94],
        ];

        for (const [reportStatus, code, progress] of expected) {
            const db = { query: jest.fn().mockResolvedValue({ rows: [{
                status: 'Reporting',
                report_status: reportStatus,
                queue_stage: 'Reporting',
                exam_completed_at: new Date(),
                reporting_started_at: new Date(),
            }] }) };
            const res = createResponse();
            await lookupPublicCaseStatus(db)({ body: { mrn: 'PAT-000004' } }, res, jest.fn());
            expect(res.json.mock.calls[0][0].case.status).toEqual(expect.objectContaining({ code, progress }));
        }
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
