const {
    getReportStatusForSave,
    getReportTransitionError
} = require('../src/utils/reportWorkflow');

describe('report workflow', () => {
    test('saving content promotes a draft once and preserves later workflow stages', () => {
        expect(getReportStatusForSave('Draft')).toBe('Typed');
        expect(getReportStatusForSave('Typed')).toBe('Typed');
        expect(getReportStatusForSave('Reviewed')).toBe('Reviewed');
        expect(getReportStatusForSave('Approved')).toBe('Approved');
    });

    test('allows same-stage saves and sequential advancement', () => {
        expect(getReportTransitionError('Typed', 'Typed')).toBeNull();
        expect(getReportTransitionError('Typed', 'Reviewed')).toBeNull();
        expect(getReportTransitionError('Reviewed', 'Approved')).toBeNull();
    });

    test('rejects skipped and backward status changes', () => {
        expect(getReportTransitionError('Draft', 'Reviewed')).toMatch(/Typed/);
        expect(getReportTransitionError('Approved', 'Typed')).toMatch(/backward/);
    });

    test('allows explicit finalization from an editable stage', () => {
        expect(getReportTransitionError('Typed', 'Finalized', { finalizing: true })).toBeNull();
    });

    test('controller rejects a skipped workflow stage before opening a transaction', async () => {
        const { updateReport } = require('../src/controllers/examController');
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [{
                    status: 'Reporting',
                    appointment_id: 'appointment-1',
                    report_locked: false,
                    report_sections: { findings: 'Finding', impression: 'Impression' },
                    report_content: 'Existing report',
                    report_status: 'Draft'
                }]
            }),
            connect: jest.fn()
        };
        const next = jest.fn();

        await updateReport(db)({
            body: {
                examId: 'exam-1',
                reportStatus: 'Approved',
                sections: { findings: 'Finding', impression: 'Impression' },
                status: 'Reporting'
            },
            user: { user_id: 'radiologist-1', role: 'Radiologist' }
        }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
        expect(db.connect).not.toHaveBeenCalled();
    });
});
