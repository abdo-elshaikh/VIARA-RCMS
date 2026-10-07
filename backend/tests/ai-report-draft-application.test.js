jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined)
}));

const { markAiReportDraftApplied } = require('../src/controllers/examController');

describe('AI report draft application tracking', () => {
    test('records persisted draft use after the report is locked', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ exam_id: 'exam-1', report_locked: true }] })
                .mockResolvedValueOnce({
                    rows: [{
                        draft_id: 'draft-1',
                        status: 'Applied',
                        apply_mode: 'replace',
                        applied_at: '2026-10-05T00:00:00.000Z'
                    }]
                })
        };
        const req = {
            params: { id: 'exam-1', draftId: 'draft-1' },
            body: { mode: 'replace' },
            user: { role: 'Radiologist', user_id: 'user-1' }
        };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await markAiReportDraftApplied(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            draft: expect.objectContaining({ status: 'Applied', apply_mode: 'replace' })
        }));
    });
});
