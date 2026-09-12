jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn(async () => undefined),
}));
jest.mock('../src/services/systemAuditService', () => ({
    logSystemAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn(async () => ({ scheduled: 1 })),
}));
jest.mock('../src/services/receptionTaskService', () => ({
    cleanupExpiredReceptionTasks: jest.fn(async () => ({ rows: [] })),
}));

const { logSystemAuditEvent } = require('../src/services/systemAuditService');
const { triggerEvent } = require('../src/services/notificationJobService');
const { cleanupExpiredReceptionTasks } = require('../src/services/receptionTaskService');
const {
    settleStaleAttendanceSessions,
    settleUnattendedShifts,
    closeAbandonedReceptionShifts,
    flagAbandonedCashierShifts,
    RECEPTION_ABANDONED_MINUTES,
} = require('../src/jobs/shiftGuardJob');

const USER_ID = '00000000-0000-4000-8000-000000000701';
const LOG_ID = '00000000-0000-4000-8000-000000000702';
const SESSION_ID = '00000000-0000-4000-8000-000000000703';

const staleHeartbeat = new Date(Date.now() - (RECEPTION_ABANDONED_MINUTES + 30) * 60 * 1000).toISOString();

describe('shift guard job', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('stale attendance sessions', () => {
        test('caps an abandoned open session and notifies the employee', async () => {
            let updateSql = null;
            const db = {
                query: jest.fn(async () => ({
                    rows: [{ log_id: LOG_ID, user_id: USER_ID, role: 'Technician', full_name: 'Technician One' }]
                })),
                connect: jest.fn(async () => ({
                    query: jest.fn(async (sql, params) => {
                        const text = String(sql);
                        if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
                        if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
                        if (text.includes('UPDATE attendance_logs')) {
                            updateSql = text;
                            return { rows: [{ log_id: LOG_ID, clock_in: '2026-09-03T08:00:00Z', clock_out: '2026-09-04T00:00:00Z' }] };
                        }
                        throw new Error(`Unexpected SQL: ${text}`);
                    }),
                    release: jest.fn(),
                })),
            };

            const result = await settleStaleAttendanceSessions(db);

            expect(result).toEqual({ scanned: 1, settled: 1 });
            expect(updateSql).toContain("a.clock_in + interval '16 hours'");
            expect(updateSql).toContain('WHERE a.log_id = $1');
            expect(logSystemAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                details: expect.objectContaining({ action: 'ATTENDANCE_STALE_SESSION_CLOSED', userId: USER_ID }),
            }));
            expect(triggerEvent).toHaveBeenCalledWith(expect.anything(), 'ATTENDANCE_SESSION_AUTO_CAPPED', expect.objectContaining({
                staffId: USER_ID,
                staffRole: 'Technician',
            }));
        });

        test('ignores sessions closed by the employee while the sweep runs', async () => {
            const db = {
                query: jest.fn(async () => ({ rows: [{ log_id: LOG_ID, user_id: USER_ID, role: 'Nurse', full_name: 'Nurse One' }] })),
                connect: jest.fn(async () => ({
                    query: jest.fn(async (sql) => {
                        const text = String(sql);
                        if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
                        if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
                        if (text.includes('UPDATE attendance_logs')) return { rows: [] };
                        throw new Error(`Unexpected SQL: ${text}`);
                    }),
                    release: jest.fn(),
                })),
            };

            const result = await settleStaleAttendanceSessions(db);

            expect(result).toEqual({ scanned: 1, settled: 0 });
            expect(logSystemAuditEvent).not.toHaveBeenCalled();
            expect(triggerEvent).not.toHaveBeenCalled();
        });
    });

    describe('abandoned reception shifts', () => {
        const shiftRow = {
            session_id: SESSION_ID,
            user_id: USER_ID,
            desk_identifier: 'شباك 1',
            scope: 'all',
            status: 'Open',
            started_at: '2026-09-05T08:00:00Z',
            ended_at: null,
            last_heartbeat_at: staleHeartbeat,
        };

        const makeClient = (overrides = {}) => ({
            query: jest.fn(async (sql, params) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT * FROM reception_shift_sessions')) {
                    return { rows: [overrides.shift || shiftRow] };
                }
                if (text.includes('SELECT COUNT(*)::int AS active')) {
                    return { rows: [{ active: overrides.activeTaskCount || 0 }] };
                }
                if (text.includes('FROM reception_work_items')) {
                    return { rows: [{ claimed: 3, completed: 3, released: 0, active: overrides.active || 0, transferred: 0, average_handling_minutes: 5 }] };
                }
                if (text.includes('FROM appointments')) return { rows: [{ appointments_created: 2 }] };
                if (text.includes('FROM payments')) return { rows: [{ payment_count: 1, collected_amount: 200, by_method: { Cash: 200 } }] };
                if (text.includes('UPDATE reception_shift_sessions')) {
                    overrides.capturedUpdate = { sql: text, params };
                    return { rows: [{ session_id: SESSION_ID, status: 'Closed' }] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            }),
            release: jest.fn(),
        });

        test('closes a shift whose heartbeat expired and releases the desk', async () => {
            const overrides = {};
            const client = makeClient(overrides);
            const db = { query: jest.fn(async () => ({ rows: [{ session_id: SESSION_ID }] })), connect: jest.fn(async () => client) };

            const result = await closeAbandonedReceptionShifts(db);

            expect(result).toEqual({ scanned: 1, closed: 1, skipped: [] });
            expect(cleanupExpiredReceptionTasks).toHaveBeenCalled();
            expect(overrides.capturedUpdate.params[1]).toContain('[shift-guard]');
            expect(client.query).toHaveBeenCalledWith('COMMIT');
            expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
            expect(logSystemAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                details: expect.objectContaining({ action: 'RECEPTION_SHIFT_AUTO_CLOSED', desk: 'شباك 1' }),
            }));
            expect(triggerEvent).toHaveBeenCalledWith(expect.anything(), 'RECEPTION_SHIFT_AUTO_CLOSED', expect.objectContaining({
                staffId: USER_ID,
                staffRole: 'Receptionist',
            }));
        });

        test('leaves shifts with live active tasks for a supervisor', async () => {
            const overrides = { activeTaskCount: 1 };
            const client = makeClient(overrides);
            const db = { query: jest.fn(async () => ({ rows: [{ session_id: SESSION_ID }] })), connect: jest.fn(async () => client) };

            const result = await closeAbandonedReceptionShifts(db);

            expect(result.closed).toBe(0);
            expect(result.skipped).toEqual([{ sessionId: SESSION_ID, activeTasks: 1 }]);
            expect(overrides.capturedUpdate).toBeUndefined();
            expect(triggerEvent).not.toHaveBeenCalled();
        });

        test('skips a shift whose heartbeat was renewed while waiting for the lock', async () => {
            const overrides = {
                shift: { ...shiftRow, last_heartbeat_at: new Date().toISOString() },
            };
            const client = makeClient(overrides);
            const db = { query: jest.fn(async () => ({ rows: [{ session_id: SESSION_ID }] })), connect: jest.fn(async () => client) };

            const result = await closeAbandonedReceptionShifts(db);

            expect(result.closed).toBe(0);
            expect(result.skipped).toEqual([]);
            expect(overrides.capturedUpdate).toBeUndefined();
        });
    });

    describe('abandoned cashier shifts', () => {
        test('flags shifts open across business date boundaries or exceeding abandonment threshold', async () => {
            const db = {
                query: jest.fn(async () => ({
                    rows: [{
                        shift_id: 'cashier-shift-1',
                        cashier_id: USER_ID,
                        cashier_name: 'Cashier User',
                        business_date: '2026-09-04',
                        opened_at: '2026-09-04T08:00:00Z',
                    }]
                }))
            };

            const result = await flagAbandonedCashierShifts(db);

            expect(result.scanned).toBe(1);
            expect(result.flagged).toBe(1);
        });
    });

    describe('unattended concluded shifts', () => {
        test('marks ended shifts with no attendance as Absent and triggers compliance notification', async () => {
            let capturedInsert = null;
            const db = {
                query: jest.fn(async () => ({
                    rows: [{
                        shift_id: 'shift-missed-1',
                        user_id: USER_ID,
                        role: 'Technician',
                        full_name: 'Technician One',
                        start_time: '2026-09-04T08:00:00Z',
                        end_time: '2026-09-04T16:00:00Z'
                    }]
                })),
                connect: jest.fn(async () => ({
                    query: jest.fn(async (sql, params) => {
                        const text = String(sql);
                        if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
                        if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
                        if (text.includes('SELECT log_id FROM attendance_logs')) return { rows: [] };
                        if (text.includes('INSERT INTO attendance_logs')) {
                            capturedInsert = params;
                            return { rows: [{ log_id: 'auto-absent-log-1', status: 'Absent' }] };
                        }
                        if (text.includes('INSERT INTO attendance_audit_ledger')) return { rows: [] };
                        throw new Error(`Unexpected SQL: ${text}`);
                    }),
                    release: jest.fn(),
                })),
            };

            const result = await settleUnattendedShifts(db);

            expect(result).toEqual({ scanned: 1, marked: 1 });
            expect(capturedInsert[0]).toBe(USER_ID);
            expect(capturedInsert[3]).toBe('shift-missed-1');
            expect(triggerEvent).toHaveBeenCalledWith(expect.anything(), 'AttendanceAutoAbsent', expect.objectContaining({
                staffId: USER_ID,
                staffRole: 'Technician'
            }));
        });
    });
});
