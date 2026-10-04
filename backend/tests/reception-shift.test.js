jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn(async () => undefined),
}));

const {
    buildShiftMetrics,
    openReceptionShift,
    closeReceptionShift,
} = require('../src/controllers/receptionShiftController');
const { renewReceptionTaskLeases } = require('../src/services/receptionTaskService');

const userId = '00000000-0000-4000-8000-000000000601';
const sessionId = '00000000-0000-4000-8000-000000000602';
const user = { user_id: userId, role: 'Receptionist' };

const metricDb = (active = 0) => ({
    query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('FROM reception_work_items')) {
            return { rows: [{ claimed: 7, completed: 5, released: 2, active, transferred: 1, average_handling_minutes: 8.5 }] };
        }
        if (text.includes('FROM appointments')) return { rows: [{ appointments_created: 4 }] };
        if (text.includes('FROM payments')) return { rows: [{ payment_count: 3, collected_amount: 450, by_method: { Cash: 300, Card: 150 } }] };
        throw new Error(`Unexpected SQL: ${text}`);
    }),
});

describe('reception operational shift controls', () => {
    test('builds attributable operational and collection metrics', async () => {
        const db = metricDb();
        const metrics = await buildShiftMetrics(db, {
            session_id: sessionId,
            user_id: userId,
            started_at: '2026-09-05T08:00:00Z',
            ended_at: null,
        });

        expect(metrics).toEqual(expect.objectContaining({
            claimed: 7,
            completed: 5,
            released: 2,
            transferred: 1,
            appointmentsCreated: 4,
            paymentCount: 3,
            collectedAmount: 450,
        }));
    });

    test('rejects an overlapping desk or work scope when opening a shift', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) return { rows: [] };
                if (text.includes('WHERE user_id = $1 AND status = \'Open\'')) return { rows: [] };
                if (text.includes('LOWER(desk_identifier)')) {
                    return { rows: [{ session_id: sessionId, user_id: 'other', desk_identifier: 'شباك 2', scope: 'modalities' }] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            }),
            release: jest.fn(),
        };
        const db = { connect: jest.fn(async () => client) };
        const next = jest.fn();

        await openReceptionShift(db)({
            user,
            body: { desk: 'شباك 2', scope: 'modalities', modalities: ['MRI'] },
            ip: '127.0.0.1',
        }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            code: 'RECEPTION_SCOPE_CONFLICT',
        }));
        expect(client.release).toHaveBeenCalled();
    });

    test('returns the existing open shift so another browser tab can restore it', async () => {
        const existingShift = {
            session_id: sessionId,
            desk_identifier: 'شباك 1 - الاستقبال العام',
            room_ids: [],
            modality_ids: [],
            scope: 'all',
            status: 'Open',
            started_at: '2026-09-05T08:00:00Z',
        };
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) return { rows: [] };
                if (text.includes("WHERE user_id = $1 AND status = 'Open'")) return { rows: [existingShift] };
                throw new Error(`Unexpected SQL: ${text}`);
            }),
            release: jest.fn(),
        };
        const next = jest.fn();

        await openReceptionShift({ connect: jest.fn(async () => client) })({
            user,
            body: { desk: 'شباك 1 - الاستقبال العام', scope: 'all' },
            ip: '127.0.0.1',
        }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            code: 'RECEPTION_SHIFT_ALREADY_OPEN',
            details: expect.objectContaining({ status: 'Open', shift: existingShift }),
        }));
        expect(client.release).toHaveBeenCalled();
    });

    test('blocks employee shift closure until active tasks are transferred or released', async () => {
        const metrics = metricDb(1);
        const client = {
            query: jest.fn(async (sql, values) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('reception_shift_sessions') && text.includes('WHERE session_id = $1')) {
                    return { rows: [{ session_id: sessionId, user_id: userId, status: 'Open', started_at: '2026-09-05T08:00:00Z' }] };
                }
                if (text.includes('FROM cashier_shifts')) return { rows: [] };
                return metrics.query(sql, values);
            }),
            release: jest.fn(),
        };
        const db = { connect: jest.fn(async () => client) };
        const next = jest.fn();

        await closeReceptionShift(db)({
            user,
            params: { sessionId },
            body: {},
            ip: '127.0.0.1',
        }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            code: 'ACTIVE_RECEPTION_TASKS',
        }));
    });

    test('renews owned leases and updates the open workstation session', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('WITH expired AS')) return { rows: [] };
                if (text.includes('UPDATE reception_work_items rwi')) {
                    return { rows: [{ work_item_id: 'wi-1', appointment_id: 'appt-1', lease_expires_at: '2026-09-05T09:15:00Z' }] };
                }
                if (text.includes('UPDATE reception_shift_sessions')) {
                    return { rows: [{ session_id: sessionId, last_heartbeat_at: '2026-09-05T09:00:00Z' }] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            }),
        };

        const result = await renewReceptionTaskLeases(client, {
            user,
            desk: 'شباك 2',
            scope: 'modalities',
            modalities: ['MRI'],
        });

        expect(result.renewed).toBe(1);
        expect(result.shift.session_id).toBe(sessionId);
    });

    test('rejects opening reception shift if attendance clock-in is missing', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) return { rows: [] };
                if (text.includes("WHERE user_id = $1 AND status = 'Open'")) return { rows: [] };
                if (text.includes('LOWER(desk_identifier)')) return { rows: [] };
                if (text.includes('FROM attendance_logs')) return { rows: [] }; // No active attendance
                throw new Error(`Unexpected SQL: ${text}`);
            }),
            release: jest.fn(),
        };
        const db = { connect: jest.fn(async () => client) };
        const next = jest.fn();

        await openReceptionShift(db)({
            user,
            body: { desk: 'شباك 1', scope: 'all' },
            ip: '127.0.0.1',
        }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 403,
            code: 'ATTENDANCE_REQUIRED_BEFORE_SHIFT',
        }));
        expect(client.release).toHaveBeenCalled();
    });

    test('rejects opening reception shift if active attendance session is stale (> 24 hours)', async () => {
        const staleClockIn = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) return { rows: [] };
                if (text.includes("WHERE user_id = $1 AND status = 'Open'")) return { rows: [] };
                if (text.includes('LOWER(desk_identifier)')) return { rows: [] };
                if (text.includes('FROM attendance_logs')) {
                    return { rows: [{ log_id: 'log-stale', clock_in: staleClockIn, shift_id: null }] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            }),
            release: jest.fn(),
        };
        const db = { connect: jest.fn(async () => client) };
        const next = jest.fn();

        await openReceptionShift(db)({
            user,
            body: { desk: 'شباك 1', scope: 'all' },
            ip: '127.0.0.1',
        }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 403,
            code: 'ATTENDANCE_STALE_SESSION',
        }));
        expect(client.release).toHaveBeenCalled();
    });

    test('successfully opens reception shift when valid attendance session exists', async () => {
        const freshClockIn = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const openedShift = {
            session_id: sessionId,
            user_id: userId,
            desk_identifier: 'شباك 1',
            scope: 'all',
            room_ids: [],
            modality_ids: [],
            status: 'Open',
        };
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text.includes('pg_advisory_xact_lock')) return { rows: [] };
                if (text.includes("WHERE user_id = $1 AND status = 'Open'")) return { rows: [] };
                if (text.includes('LOWER(desk_identifier)')) return { rows: [] };
                if (text.includes('FROM attendance_logs')) {
                    return { rows: [{ log_id: 'log-1', clock_in: freshClockIn, shift_id: 'shift-1' }] };
                }
                if (text.includes('INSERT INTO reception_shift_sessions')) {
                    return { rows: [openedShift] };
                }
                if (text.includes('UPDATE reception_work_items')) return { rows: [] };
                throw new Error(`Unexpected SQL: ${text}`);
            }),
            release: jest.fn(),
        };
        const db = { connect: jest.fn(async () => client) };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await openReceptionShift(db)({
            user,
            body: { desk: 'شباك 1', scope: 'all' },
            ip: '127.0.0.1',
        }, res, next);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(openedShift);
        expect(client.release).toHaveBeenCalled();
    });
});

