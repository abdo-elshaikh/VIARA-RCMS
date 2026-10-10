const { getReportStatusForSave, getReportTransitionError } = require('../src/utils/reportWorkflow');

describe('report workflow', () => {
    test('pending electronic delivery does not count as delivered or leave the not-delivered queue', async () => {
        const { getCaseReports } = require('../src/controllers/examController');
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getCaseReports(db, { queue: 'notDelivered' })({
            user: { role: 'Admin', user_id: 'admin-1' }
        }, res, next);

        const query = db.query.mock.calls[0][0];
        expect(query).toContain("last_delivery.delivery_status NOT IN ('Delivered', 'Picked Up', 'Accessed', 'Printed', 'Acknowledged')");
        expect(query).toContain("'Delivered', 'Picked Up', 'Accessed', 'Printed', 'Acknowledged'");
        expect(query).not.toContain('last_delivery.delivery_status IS NOT NULL');
        expect(next).not.toHaveBeenCalled();
    });

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

    test('allows finalization only after approval', () => {
        expect(getReportTransitionError('Typed', 'Finalized', { finalizing: true })).toMatch(/Approved/);
        expect(getReportTransitionError('Approved', 'Finalized', { finalizing: true })).toBeNull();
    });

    test('controller rejects a skipped workflow stage within a transaction', async () => {
        const { updateReport } = require('../src/controllers/examController');

        const mockClient = {
            query: jest.fn().mockImplementation(async (sql, params) => {
                const text = String(sql || '');

                if (text === 'BEGIN') return { rows: [] };
                if (text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT e.status') && text.includes('FROM examinations e')) {
                    return {
                        rows: [{
                            status: 'Reporting',
                            appointment_id: 'appointment-1',
                            report_locked: false,
                            report_sections: { findings: 'Finding', impression: 'Impression' },
                            report_content: 'Existing report',
                            report_status: 'Draft'
                        }]
                    };
                }
                if (text.includes('INSERT INTO order_status_history')) return { rows: [] };
                if (text.includes('INSERT INTO queue_events')) return { rows: [] };
                if (text.includes('INSERT INTO report_versions')) return { rows: [] };
                if (text.includes('INSERT INTO result_deliveries')) return { rows: [] };
                if (text.includes('UPDATE examinations')) return { rows: [] };
                if (text.includes('UPDATE appointments')) return { rows: [] };

                return { rows: [] };
            }),
            release: jest.fn()
        };

        const db = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            connect: jest.fn().mockResolvedValue(mockClient)
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
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
    });

    test('controller rejects finalization when the linked PACS study has no images', async () => {
        const { updateReport } = require('../src/controllers/examController');
        const mockClient = {
            query: jest.fn().mockImplementation(async sql => {
                const text = String(sql || '');
                if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT e.status') && text.includes('FROM examinations e')) {
                    return {
                        rows: [{
                            status: 'Reporting',
                            appointment_id: 'appointment-1',
                            report_locked: false,
                            report_sections: { findings: 'Finding', impression: 'Impression' },
                            report_content: 'Existing report',
                            report_status: 'Approved',
                            report_request_status: 'Requested',
                            queue_stage: 'Reporting',
                            is_on_hold: false,
                            exam_completed_at: new Date(),
                            images_ready_at: new Date(),
                            images_available: true,
                            image_count: 1,
                            study_instance_uid: '2.25.301'
                        }]
                    };
                }
                if (text.includes('FROM pacs_series ps')) return { rows: [{ image_count: 0 }] };
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const next = jest.fn();

        await updateReport({ connect: jest.fn().mockResolvedValue(mockClient) })({
            body: {
                examId: 'exam-1',
                status: 'Finalized',
                reportStatus: 'Finalized',
                sections: { findings: 'Finding', impression: 'Impression' }
            },
            user: { user_id: 'radiologist-1', role: 'Radiologist' }
        }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            code: 'PACS_STUDY_NOT_READY'
        }));
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE examinations'))).toBe(false);
        expect(mockClient.release).toHaveBeenCalled();
    });
});
