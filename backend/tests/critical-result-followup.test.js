jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined)
}));

const { logAction } = require('../src/services/auditService');
const {
    getOpenFollowups,
    completeFollowup
} = require('../src/controllers/criticalResultFollowupController');
const { completeCriticalResultFollowupSchema } = require('../src/schemas/criticalResultFollowupSchema');

const TASK_ID = '00000000-0000-4000-8000-000000000014';
const EXAM_ID = '00000000-0000-4000-8000-000000000004';

const makeResponse = () => ({
    json: jest.fn()
});

describe('critical result administrative follow-up', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        logAction.mockResolvedValue(undefined);
    });

    test('lists open tasks with examination identifiers', async () => {
        const rows = [{ task_id: TASK_ID, exam_id: EXAM_ID, order_number: 'ORD-100' }];
        const db = { query: jest.fn().mockResolvedValue({ rows }) };
        const res = makeResponse();
        const next = jest.fn();

        await getOpenFollowups(db)({}, res, next);

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining("task.status = 'Open'"));
        expect(res.json).toHaveBeenCalledWith({ items: rows });
        expect(next).not.toHaveBeenCalled();
    });

    test('requires a contacted party and meaningful follow-up notes', () => {
        expect(completeCriticalResultFollowupSchema.safeParse({
            contactedParty: 'Dr Smith',
            followUpNotes: 'Spoke with clinician; urgent review arranged.'
        }).success).toBe(true);
        expect(completeCriticalResultFollowupSchema.safeParse({
            contactedParty: '',
            followUpNotes: 'Short'
        }).success).toBe(false);
    });

    test('completes an open task and commits only after required audit logging', async () => {
        const timeline = [];
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                timeline.push(text);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('UPDATE critical_result_admin_followup_tasks')) {
                    return { rows: [{
                        task_id: TASK_ID,
                        exam_id: EXAM_ID,
                        status: 'Completed',
                        contacted_party: 'On-call clinic',
                        follow_up_notes: 'Urgent result relayed; clinician will review now.',
                        completed_at: new Date('2026-10-10T12:00:00.000Z')
                    }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        logAction.mockImplementation(async () => {
            timeline.push('AUDIT');
        });
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const res = makeResponse();
        const next = jest.fn();

        await completeFollowup(db)({
            params: { id: TASK_ID },
            body: {
                contactedParty: 'On-call clinic',
                followUpNotes: 'Urgent result relayed; clinician will review now.'
            },
            user: { user_id: '00000000-0000-4000-8000-000000000007' },
            ip: '127.0.0.1'
        }, res, next);

        expect(timeline.indexOf('AUDIT')).toBeGreaterThan(timeline.indexOf('BEGIN'));
        expect(timeline.indexOf('AUDIT')).toBeLessThan(timeline.indexOf('COMMIT'));
        expect(logAction).toHaveBeenCalledWith(client, expect.objectContaining({
            action: 'CRITICAL_RESULT_ADMIN_FOLLOWUP_COMPLETED',
            resourceId: TASK_ID,
            required: true
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            task: expect.objectContaining({ status: 'Completed' })
        }));
        expect(client.release).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('rolls back when required audit logging fails', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                if (String(sql).includes('UPDATE critical_result_admin_followup_tasks')) {
                    return { rows: [{ task_id: TASK_ID, exam_id: EXAM_ID, status: 'Completed' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        logAction.mockRejectedValue(new Error('audit store unavailable'));
        const next = jest.fn();

        await completeFollowup({ connect: jest.fn().mockResolvedValue(client) })({
            params: { id: TASK_ID },
            body: { contactedParty: 'On-call clinic', followUpNotes: 'Urgent result relayed to clinician.' },
            user: { user_id: '00000000-0000-4000-8000-000000000007' }
        }, makeResponse(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query).not.toHaveBeenCalledWith('COMMIT');
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'audit store unavailable' }));
        expect(client.release).toHaveBeenCalled();
    });

    test('returns explicit not-found and already-completed errors', async () => {
        for (const [existingRows, expectedStatus] of [[[], 404], [[{ task_id: TASK_ID }], 409]]) {
            const client = {
                query: jest.fn(async (sql) => {
                    if (String(sql).includes('UPDATE critical_result_admin_followup_tasks')) return { rows: [] };
                    if (String(sql).includes('SELECT 1 FROM critical_result_admin_followup_tasks')) return { rows: existingRows };
                    return { rows: [] };
                }),
                release: jest.fn()
            };
            const next = jest.fn();

            await completeFollowup({ connect: jest.fn().mockResolvedValue(client) })({
                params: { id: TASK_ID },
                body: { contactedParty: 'On-call clinic', followUpNotes: 'Urgent result relayed to clinician.' },
                user: { user_id: '00000000-0000-4000-8000-000000000007' }
            }, makeResponse(), next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: expectedStatus }));
            expect(client.query).toHaveBeenCalledWith('ROLLBACK');
            expect(client.release).toHaveBeenCalled();
        }
    });
});
