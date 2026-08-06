const { clockIn, clockOut } = require('../src/controllers/hrController');

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
    test('clock-in creates an attendance row for the authenticated user', async () => {
        let captureInsertParams = null;
        const client = makeClient({
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

        expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO attendance_logs'), [USER_ID, undefined]);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ log_id: 'log-1' }));
        expect(next).not.toHaveBeenCalled();
    });

    test('duplicate clock-in returns the active session instead of failing', async () => {
        const active = { log_id: 'log-1', user_id: USER_ID, clock_out: null };
        const client = makeClient({
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
});
