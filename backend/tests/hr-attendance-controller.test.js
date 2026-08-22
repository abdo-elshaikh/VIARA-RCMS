jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(null)
}));

const { logAction } = require('../src/services/auditService');
const { clockIn, clockOut, getShifts, getProductivityReport, updateLeaveStatus } = require('../src/controllers/hrController');
const { updateAttendanceSchema } = require('../src/schemas/hrSchema');

const USER_ID = '00000000-0000-4000-8000-000000000001';

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

const makeReq = (overrides = {}) => ({
    body: {},
    ip: '127.0.0.1',
    user: { user_id: USER_ID, role: 'Technician' },
    ...overrides
});

const makeClient = (handlers) => {
    const client = {
        query: jest.fn(async (sql, params) => {
            const text = String(sql);
            for (const [matcher, handler] of Object.entries(handlers)) {
                if (text.includes(matcher)) return handler(sql, params);
            }
            return { rows: [] };
        }),
        release: jest.fn()
    };
    return client;
};

const makeDb = (client) => ({
    connect: jest.fn().mockResolvedValue(client)
});

describe('HR attendance controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('attendance corrections require a reason and ordered timestamps', () => {
        const valid = {
            clockIn: '2026-08-20T08:00:00.000Z',
            clockOut: '2026-08-20T16:00:00.000Z',
            status: 'Present',
            notes: 'Corrected against the access log'
        };
        expect(updateAttendanceSchema.safeParse(valid).success).toBe(true);
        expect(updateAttendanceSchema.safeParse({ ...valid, notes: '' }).success).toBe(false);
        expect(updateAttendanceSchema.safeParse({
            ...valid,
            clockOut: '2026-08-20T07:59:00.000Z'
        }).success).toBe(false);
    });

    test('clock-in creates an attendance row for the authenticated user', async () => {
        let captureInsertParams = null;
        const client = makeClient({
            'SELECT user_id FROM users': () => ({ rows: [{ user_id: USER_ID }] }),
            'SELECT * FROM attendance_logs': () => ({ rows: [] }),
            'INSERT INTO attendance_logs': (sql, params) => {
                captureInsertParams = params;
                return { rows: [{ log_id: 'log-1', user_id: USER_ID, clock_out: null }] };
            },
            'log_action': () => ({ rows: [] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await clockIn(db)(makeReq(), res, next);

        expect(captureInsertParams).toEqual([USER_ID, null, null, undefined]);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ log_id: 'log-1' }));
        expect(next).not.toHaveBeenCalled();
    });

    test('duplicate clock-in returns the active session instead of failing', async () => {
        const active = { log_id: 'log-1', user_id: USER_ID, clock_out: null };
        const client = makeClient({
            'SELECT user_id FROM users': () => ({ rows: [{ user_id: USER_ID }] }),
            'SELECT * FROM attendance_logs': () => ({ rows: [active] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await clockIn(db)(makeReq({ user: { userId: USER_ID, role: 'Technician' } }), res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            log_id: 'log-1',
            already_clocked_in: true
        }));
        expect(res.status).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    test('clock-out with no active session returns a settled state instead of failing', async () => {
        const client = makeClient({
            'UPDATE attendance_logs': () => ({ rows: [] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await clockOut(db)(makeReq(), res, next);

        expect(res.json).toHaveBeenCalledWith({
            clocked_in: false,
            message: 'No active clock-in session found'
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('shift roster returns shifts overlapping the requested range', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = createResponse();
        const next = jest.fn();

        await getShifts(db)(makeReq({
            query: {
                startDate: '2026-08-03T00:00:00.000Z',
                endDate: '2026-08-10T00:00:00.000Z'
            }
        }), res, next);

        expect(db.query.mock.calls[0][0]).toContain('s.end_time > $1');
        expect(db.query.mock.calls[0][0]).toContain('s.start_time < $2');
        expect(db.query.mock.calls[0][1]).toEqual([
            '2026-08-03T00:00:00.000Z',
            '2026-08-10T00:00:00.000Z',
            USER_ID,
            500
        ]);
        expect(res.json).toHaveBeenCalledWith([]);
        expect(next).not.toHaveBeenCalled();
    });

    test('leave status review cannot be performed by the requester', async () => {
        const client = makeClient({
            'SELECT request_id, user_id, status': () => ({ rows: [{ request_id: 'leave-1', user_id: USER_ID, status: 'Pending' }] }),
            'ROLLBACK': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await updateLeaveStatus(db)(makeReq({
            params: { id: 'leave-1' },
            body: { status: 'Approved' },
            user: { user_id: USER_ID, role: 'HR' }
        }), res, next);

        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE leave_requests'))).toBe(false);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('leave status review records optional audit notes', async () => {
        const client = makeClient({
            'SELECT request_id, user_id, status': () => ({ rows: [{ request_id: 'leave-1', user_id: '00000000-0000-4000-8000-000000000002', status: 'Pending' }] }),
            'UPDATE leave_requests': () => ({ rows: [{ request_id: 'leave-1', status: 'Approved', approved_by: USER_ID }] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await updateLeaveStatus(db)(makeReq({
            params: { id: 'leave-1' },
            body: { status: 'Approved', notes: 'covered by standby staff' },
            user: { user_id: USER_ID, role: 'HR' }
        }), res, next);

        expect(logAction).toHaveBeenCalledWith(client, expect.objectContaining({
            details: expect.objectContaining({ notes: 'covered by standby staff' })
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ request_id: 'leave-1' }));
        expect(next).not.toHaveBeenCalled();
    });

    test('productivity report includes the full selected end date', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
        };
        const res = createResponse();
        const next = jest.fn();

        await getProductivityReport(db)(makeReq({
            query: { startDate: '2026-08-01', endDate: '2026-08-09' },
            user: { user_id: USER_ID, role: 'HR' }
        }), res, next);

        expect(db.query.mock.calls[0][0]).toContain("i.generated_at < ($2::date + interval '1 day')");
        expect(db.query.mock.calls[1][0]).toContain("e.completed_at < ($2::date + interval '1 day')");
        expect(db.query.mock.calls[0][1]).toEqual(['2026-08-01', '2026-08-09']);
        expect(res.json).toHaveBeenCalledWith([]);
        expect(next).not.toHaveBeenCalled();
    });
});
