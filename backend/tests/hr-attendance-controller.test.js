jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(null)
}));
jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn().mockResolvedValue({ scheduled: 0 }),
    triggerEventForRole: jest.fn().mockResolvedValue({ recipients: 0, scheduled: 0 })
}));

const { logAction } = require('../src/services/auditService');
const { triggerEvent } = require('../src/services/notificationJobService');
const {
    clockIn, clockOut, getShifts, getProductivityReport,
    updateLeaveStatus, recordManualAttendance, upsertLeaveBalance, createLeaveRequest,
    getAttendanceSettings, updateAttendanceSettings,
    getAttendancePermissions, createAttendancePermission, updateAttendancePermissionStatus,
    getAttendanceAuditLedger
} = require('../src/controllers/hrController');
const {
    updateAttendanceSchema, manualAttendanceSchema, updateLeaveBalanceSchema,
    createAttendancePermissionSchema, updateAttendancePermissionStatusSchema, updateAttendanceSettingsSchema
} = require('../src/schemas/hrSchema');
const { invalidateAttendanceConfigCache } = require('../src/services/attendanceConfigCache');

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
        invalidateAttendanceConfigCache();
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

        expect(captureInsertParams).toEqual([USER_ID, null, 0, 'Present', undefined, 'Unscheduled', null, null]);
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
            'FROM leave_requests': () => ({ rows: [{ request_id: 'leave-1', user_id: USER_ID, status: 'Pending', requester_role: 'HR' }] }),
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
            'FROM leave_requests': () => ({ rows: [{ request_id: 'leave-1', user_id: '00000000-0000-4000-8000-000000000002', status: 'Pending', requester_role: 'Technician' }] }),
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

    test('productivity report includes the full selected end date across all 4 departments', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
        };
        const res = createResponse();
        const next = jest.fn();

        await getProductivityReport(db)(makeReq({
            query: { startDate: '2026-08-01', endDate: '2026-08-09' },
            user: { user_id: USER_ID, role: 'HR' }
        }), res, next);

        expect(db.query.mock.calls[0][0]).toContain("rwi.completed_at < ($2::date + interval '1 day')");
        expect(db.query.mock.calls[1][0]).toContain("a.start_time < ($2::date + interval '1 day')");
        expect(db.query.mock.calls[2][0]).toContain("e.approved_at < ($2::date + interval '1 day')");
        expect(db.query.mock.calls[3][0]).toContain("p.transaction_date < ($2::date + interval '1 day')");
        expect(db.query.mock.calls[0][1]).toEqual(['2026-08-01', '2026-08-09']);
        expect(res.json).toHaveBeenCalledWith([]);
        expect(next).not.toHaveBeenCalled();
    });

    test('manual attendance validation succeeds with valid entry and fails with empty notes', () => {
        const valid = {
            userId: '00000000-0000-4000-8000-000000000002',
            clockIn: '2026-08-20T08:00:00.000Z',
            clockOut: '2026-08-20T16:00:00.000Z',
            status: 'Present',
            notes: 'Added from manual paper timesheet'
        };
        expect(manualAttendanceSchema.safeParse(valid).success).toBe(true);
        expect(manualAttendanceSchema.safeParse({ ...valid, notes: '  ' }).success).toBe(false);
        expect(manualAttendanceSchema.safeParse({ ...valid, clockOut: '2026-08-20T07:00:00.000Z' }).success).toBe(false);
    });

    test('recordManualAttendance inserts attendance log with audit record', async () => {
        const client = makeClient({
            'FROM users': () => ({ rows: [{ user_id: '00000000-0000-4000-8000-000000000002', full_name: 'Dr. John' }] }),
            'FROM staff_shifts': () => ({ rows: [] }),
            'INSERT INTO attendance_logs': () => ({ rows: [{ log_id: 'att-manual-1', status: 'Present' }] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await recordManualAttendance(db)(makeReq({
            body: {
                userId: '00000000-0000-4000-8000-000000000002',
                clockIn: '2026-08-20T08:00:00.000Z',
                clockOut: '2026-08-20T16:00:00.000Z',
                status: 'Present',
                notes: 'Manual timesheet entry'
            },
            user: { user_id: USER_ID, role: 'HR' }
        }), res, next);

        expect(logAction).toHaveBeenCalledWith(client, expect.objectContaining({
            action: 'ATTENDANCE_MANUAL_RECORDED',
            details: expect.objectContaining({ targetUserId: '00000000-0000-4000-8000-000000000002' })
        }));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ log_id: 'att-manual-1' }));
        expect(next).not.toHaveBeenCalled();
    });

    test('leave balance upsert updates entitlement days and records audit', async () => {
        const client = makeClient({
            'FROM users': () => ({ rows: [{ user_id: '00000000-0000-4000-8000-000000000002', full_name: 'Dr. John' }] }),
            'INSERT INTO leave_balances': () => ({ rows: [{ user_id: '00000000-0000-4000-8000-000000000002', entitlement_days: 25 }] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await upsertLeaveBalance(db)(makeReq({
            params: { userId: '00000000-0000-4000-8000-000000000002' },
            body: {
                year: 2026,
                leaveType: 'Vacation',
                entitlementDays: 25,
                notes: 'Contract adjustment'
            },
            user: { user_id: USER_ID, role: 'HR' }
        }), res, next);

        expect(logAction).toHaveBeenCalledWith(client, expect.objectContaining({
            action: 'LEAVE_BALANCE_UPDATED',
            details: expect.objectContaining({ entitlementDays: 25, leaveType: 'Vacation' })
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ entitlement_days: 25 }));
        expect(next).not.toHaveBeenCalled();
    });

    test('supervisor can submit leave request on behalf of staff member', async () => {
        const client = makeClient({
            'FROM users': () => ({ rows: [{ user_id: '00000000-0000-4000-8000-000000000002', full_name: 'Dr. John' }] }),
            'FROM leave_requests': () => ({ rows: [] }),
            'FROM leave_balances': () => ({ rows: [] }),
            'INSERT INTO leave_requests': () => ({ rows: [{ request_id: 'leave-on-behalf-1', user_id: '00000000-0000-4000-8000-000000000002' }] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await createLeaveRequest(db)(makeReq({
            body: {
                userId: '00000000-0000-4000-8000-000000000002',
                startDate: '2026-09-01',
                endDate: '2026-09-02',
                leaveType: 'Unpaid',
                reason: 'Family emergency'
            },
            user: { user_id: USER_ID, role: 'HR' }
        }), res, next);

        expect(logAction).toHaveBeenCalledWith(client, expect.objectContaining({
            action: 'LEAVE_REQUEST_CREATED',
            details: expect.objectContaining({ targetUserId: '00000000-0000-4000-8000-000000000002', onBehalf: true })
        }));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ request_id: 'leave-on-behalf-1' }));
        expect(next).not.toHaveBeenCalled();
    });

    test('non-supervisor cannot submit leave request on behalf of someone else', async () => {
        const client = makeClient({});
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await createLeaveRequest(db)(makeReq({
            body: {
                userId: '00000000-0000-4000-8000-000000000002',
                startDate: '2026-09-01',
                endDate: '2026-09-02',
                leaveType: 'Unpaid',
                reason: 'Family emergency'
            },
            user: { user_id: USER_ID, role: 'Technician' }
        }), res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('clock-in within grace period marks status Present with zero late minutes', async () => {
        let captureInsertParams = null;
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const client = makeClient({
            'SELECT user_id FROM users': () => ({ rows: [{ user_id: USER_ID }] }),
            'SELECT * FROM attendance_logs': () => ({ rows: [] }),
            'SELECT setting_key': () => ({
                rows: [
                    { setting_key: 'hr.attendance.grace_period_late_minutes', setting_value: '15' },
                    { setting_key: 'hr.attendance.deduct_full_delay_after_grace', setting_value: 'true' }
                ]
            }),
            'SELECT shift_id, start_time': () => ({
                rows: [{ shift_id: 'shift-101', start_time: tenMinutesAgo, end_time: new Date(Date.now() + 8 * 3600 * 1000).toISOString() }]
            }),
            'FROM attendance_permissions': () => ({ rows: [] }),
            'INSERT INTO attendance_logs': (sql, params) => {
                captureInsertParams = params;
                return { rows: [{ log_id: 'log-grace-1', user_id: USER_ID, status: 'Present', late_minutes: 0 }] };
            },
            'INSERT INTO attendance_audit_ledger': () => ({ rows: [] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await clockIn(db)(makeReq(), res, next);

        expect(captureInsertParams[2]).toBe(0); // late_minutes = 0
        expect(captureInsertParams[3]).toBe('Present'); // status = Present
        expect(captureInsertParams[5]).toBe('Auto'); // shift_link_type = Auto
        expect(res.status).toHaveBeenCalledWith(201);
        expect(next).not.toHaveBeenCalled();
    });

    test('clock-out before shift end without approved permission is blocked with EARLY_DEPARTURE_PROHIBITED', async () => {
        const twoHoursLater = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
        const client = makeClient({
            'cashier_shifts': () => ({ rows: [] }),
            'reception_shift_sessions': () => ({ rows: [] }),
            'SELECT * FROM attendance_logs': () => ({
                rows: [{
                    log_id: 'log-early-1',
                    user_id: USER_ID,
                    clock_in: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
                    shift_id: 'shift-101',
                    scheduled_end_snapshot: twoHoursLater
                }]
            }),
            'FROM users': () => ({ rows: [{ full_name: 'Dr. Jane' }] }),
            'SELECT setting_key': () => ({
                rows: [
                    { setting_key: 'hr.attendance.grace_period_early_minutes', setting_value: '10' },
                    { setting_key: 'hr.attendance.require_early_leave_approval', setting_value: 'true' }
                ]
            }),
            'FROM attendance_permissions': () => ({ rows: [] }), // no approved permission
            'INSERT INTO attendance_audit_ledger': () => ({ rows: [] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await clockOut(db)(makeReq({ user: { user_id: USER_ID, role: 'Technician' } }), res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            code: 'EARLY_DEPARTURE_PROHIBITED',
            statusCode: 403
        }));
    });

    test('clock-out before shift end with approved EarlyDeparture permission succeeds', async () => {
        const twoHoursLater = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
        const client = makeClient({
            'cashier_shifts': () => ({ rows: [] }),
            'reception_shift_sessions': () => ({ rows: [] }),
            'SELECT * FROM attendance_logs WHERE user_id': () => ({
                rows: [{
                    log_id: 'log-early-1',
                    user_id: USER_ID,
                    clock_in: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
                    shift_id: 'shift-101',
                    scheduled_end_snapshot: twoHoursLater
                }]
            }),
            'FROM users': () => ({ rows: [{ full_name: 'Dr. Jane' }] }),
            'SELECT setting_key': () => ({
                rows: [
                    { setting_key: 'hr.attendance.grace_period_early_minutes', setting_value: '10' },
                    { setting_key: 'hr.attendance.require_early_leave_approval', setting_value: 'true' }
                ]
            }),
            'FROM attendance_permissions': () => ({
                rows: [{ permission_id: 'perm-1', minutes_granted: 120, status: 'Approved' }]
            }),
            'UPDATE attendance_logs': () => ({
                rows: [{ log_id: 'log-early-1', clock_out: new Date().toISOString(), early_leave_minutes: 0 }]
            }),
            'INSERT INTO attendance_audit_ledger': () => ({ rows: [] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await clockOut(db)(makeReq({ user: { user_id: USER_ID, role: 'Technician' } }), res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            log_id: 'log-early-1',
            early_leave_minutes: 0
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('attendance settings schema validation and retrieval', async () => {
        const validSettings = {
            gracePeriodLateMinutes: 20,
            gracePeriodEarlyMinutes: 15,
            deductFullDelayAfterGrace: true,
            requireEarlyLeaveApproval: true,
            enforceShiftLoginRestriction: false
        };
        expect(updateAttendanceSettingsSchema.safeParse(validSettings).success).toBe(true);

        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    { setting_key: 'hr.attendance.grace_period_late_minutes', setting_value: '20' },
                    { setting_key: 'hr.attendance.grace_period_early_minutes', setting_value: '15' },
                    { setting_key: 'hr.attendance.deduct_full_delay_after_grace', setting_value: 'true' }
                ]
            })
        };
        const res = createResponse();
        const next = jest.fn();

        await getAttendanceSettings(db)(makeReq(), res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            gracePeriodLateMinutes: 20,
            gracePeriodEarlyMinutes: 15,
            deductFullDelayAfterGrace: true
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('attendance permission request validation and creation', async () => {
        const validReq = {
            permissionType: 'EarlyDeparture',
            effectiveDate: '2026-09-10',
            minutesGranted: 60,
            reason: 'Medical appointment'
        };
        expect(createAttendancePermissionSchema.safeParse(validReq).success).toBe(true);

        const client = makeClient({
            'FROM users': () => ({ rows: [{ full_name: 'Ahmed Hassan', role: 'Technician' }] }),
            'INSERT INTO attendance_permissions': () => ({ rows: [{ permission_id: 'perm-new-1', status: 'Pending' }] }),
            'COMMIT': () => ({ rows: [] })
        });
        const db = makeDb(client);
        const res = createResponse();
        const next = jest.fn();

        await createAttendancePermission(db)(makeReq({ body: validReq, user: { user_id: USER_ID, role: 'Technician' } }), res, next);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ permission_id: 'perm-new-1', status: 'Pending' }));
        expect(next).not.toHaveBeenCalled();
    });

    test('attendance audit ledger endpoint returns filtered activity', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [{
                    audit_id: 'audit-1',
                    action_type: 'CLOCK_IN',
                    employee_name: 'Dr. John',
                    is_violation: false
                }]
            })
        };
        const res = createResponse();
        const next = jest.fn();

        await getAttendanceAuditLedger(db)(makeReq({
            query: { isViolation: 'false', limit: '50' },
            user: { user_id: USER_ID, role: 'HR' }
        }), res, next);

        expect(db.query.mock.calls[0][0]).toContain('FROM attendance_audit_ledger');
        expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ audit_id: 'audit-1', action_type: 'CLOCK_IN' })
        ]));
        expect(next).not.toHaveBeenCalled();
    });
});
