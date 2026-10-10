jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn(async () => undefined),
}));
jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn(async () => ({ scheduled: 0 })),
    triggerEventForRole: jest.fn(async () => ({ recipients: 0, scheduled: 0 })),
}));

const {
    createStaff,
    updateStaff,
    deleteStaff
} = require('../src/controllers/staffController');
const {
    getEmployeeProfiles,
    createShift,
    createLeaveRequest,
    getLeaveBalances,
    getStaffCredentials,
    createStaffCredential,
    getProductivityReport,
    _hrInternals
} = require('../src/controllers/hrController');
const { createStaffCredentialSchema } = require('../src/schemas/hrSchema');

const USER_ID = '00000000-0000-4000-8000-000000000b01';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000b02';
const OTHER_EMPLOYEE_ID = '00000000-0000-4000-8000-000000000b03';
const SHIFT_ID = '00000000-0000-4000-8000-000000000b04';
const LEAVE_ID = '00000000-0000-4000-8000-000000000b05';
const CREDENTIAL_ID = '00000000-0000-4000-8000-000000000b06';

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
});

const makeReq = (overrides = {}) => ({
    params: {},
    body: {},
    query: {},
    user: { user_id: USER_ID, role: 'HR' },
    ip: '127.0.0.1',
    ...overrides
});

const ok = (rows = []) => ({ rows });

const makeClient = (routes) => {
    const calls = [];
    const query = jest.fn(async (sql, params) => {
        const text = String(sql);
        calls.push({ text, params });
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return ok();
        if (text.includes('pg_advisory_xact_lock')) return ok();
        for (const [fragment, handler] of routes) {
            if (text.includes(fragment)) return handler(params, text);
        }
        throw new Error(`Unexpected SQL: ${text.slice(0, 140)}`);
    });
    return { query, calls, release: jest.fn() };
};

describe('HR hardening', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('staff lifecycle and payroll visibility', () => {
        test('createStaff seeds the employee profile in the same transaction', async () => {
            let profileParams = null;
            const client = makeClient([
                ['INSERT INTO users', () => ok([{ user_id: EMPLOYEE_ID }])],
                ['INSERT INTO employee_profiles', (params) => {
                    profileParams = params;
                    return ok([]);
                }],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();

            await createStaff(db)(makeReq({
                body: { fullName: 'New Hire', email: 'new@viara.test', role: 'Nurse', password: 'secret123', department: 'Nursing', jobTitle: 'Staff Nurse' },
                user: { user_id: USER_ID, role: 'HR', full_name: 'HR Manager' }
            }), res, jest.fn());

            expect(res.status).toHaveBeenCalledWith(201);
            expect(profileParams).toBeTruthy();
            expect(profileParams[0]).toBe(EMPLOYEE_ID);
            expect(profileParams[1]).toBe('Nursing');
            expect(profileParams[2]).toBe('Staff Nurse');
            expect(profileParams[3]).toBe('Full-Time');
            const insertCall = client.calls.find((call) => call.text.includes('INSERT INTO employee_profiles'));
            expect(insertCall.text).toContain('CURRENT_DATE');
        });

        test('deactivation stamps the termination date once', async () => {
            const client = makeClient([
                ['SELECT user_id, role, is_active FROM users', () => ok([{ user_id: EMPLOYEE_ID, role: 'Nurse', is_active: true }])],
                ['UPDATE users SET is_active = false', () => ok([{ user_id: EMPLOYEE_ID }])],
                ['UPDATE employee_profiles', () => ok([])],
                ['UPDATE refresh_tokens', () => ok([])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();

            await deleteStaff(db)(makeReq({ params: { id: EMPLOYEE_ID } }), res, jest.fn());

            const stampCall = client.calls.find((call) => call.text.includes('termination_date = COALESCE(termination_date, CURRENT_DATE)'));
            expect(stampCall).toBeTruthy();
        });

        test('reactivation clears the termination date', async () => {
            const client = makeClient([
                ['SELECT user_id, role, is_active FROM users', () => ok([{ user_id: EMPLOYEE_ID, role: 'Nurse', is_active: false }])],
                ['UPDATE users SET', () => ok([{ user_id: EMPLOYEE_ID, is_active: true }])],
                ['SET termination_date = NULL', () => ok([])],
                ['UPDATE refresh_tokens', () => ok([])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };

            await updateStaff(db)(makeReq({ params: { id: EMPLOYEE_ID }, body: { isActive: true } }), createResponse(), jest.fn());

            const clearCall = client.calls.find((call) => call.text.includes('SET termination_date = NULL'));
            expect(clearCall).toBeTruthy();
        });

        test('getEmployeeProfiles applies optional filters and a limit', async () => {
            let capturedParams = null;
            let capturedSql = null;
            const db = {
                query: jest.fn(async (sql, params) => {
                    capturedSql = String(sql);
                    capturedParams = params;
                    return ok([]);
                })
            };

            await getEmployeeProfiles(db)(makeReq({ query: { department: 'Radiology', isActive: 'true', limit: '50' } }), createResponse(), jest.fn());

            expect(capturedSql).toContain('AND p.department = $2');
            expect(capturedSql).toContain('AND u.is_active = $3');
            expect(capturedSql).toContain('LIMIT $4');
            expect(capturedParams[1]).toBe('Radiology');
            expect(capturedParams[2]).toBe(true);
            expect(capturedParams[3]).toBe(50);
        });
    });

    describe('leave balances', () => {
        test('computes entitlement minus approved working days', async () => {
            const db = {
                query: jest.fn(async (sql, params) => {
                    const text = String(sql);
                    if (text.includes('FROM leave_balances')) return ok([]);
                    if (text.includes('FROM leave_requests')) return ok([
                        // 2026-09-01 (Tue) .. 2026-09-04 (Fri) => 4 working days minus Friday = 3
                        { user_id: EMPLOYEE_ID, leave_type: 'Vacation', start_date: '2026-09-01', end_date: '2026-09-04' }
                    ]);
                    if (text.includes('FROM users WHERE is_active')) return ok([{ user_id: EMPLOYEE_ID }]);
                    throw new Error(`Unexpected SQL: ${text.slice(0, 100)}`);
                })
            };
            const res = createResponse();

            await getLeaveBalances(db)(makeReq({
                query: { year: '2026' },
                user: { user_id: EMPLOYEE_ID, role: 'Nurse' }
            }), res, jest.fn());

            const payload = res.json.mock.calls[0][0];
            expect(payload).toHaveLength(1);
            const vacation = payload[0].balances.find((entry) => entry.leaveType === 'Vacation');
            expect(vacation.entitlementDays).toBe(21);
            expect(vacation.usedDays).toBe(3);
            expect(vacation.remainingDays).toBe(18);
        });

        test('rejects a request that overdraws the annual balance', async () => {
            const client = makeClient([
                ['SELECT user_id, full_name FROM users', () => ok([{ user_id: EMPLOYEE_ID, full_name: 'Nurse One', role: 'Nurse' }])],
                ['FROM leave_balances', () => ok([])],
                ['FROM leave_requests', (params, text) => {
                    if (text.includes('request_id')) return ok([]);
                    if (text.includes("status = 'Approved'")) {
                        // Already used 19 working days of vacation.
                        return ok([{ user_id: EMPLOYEE_ID, leave_type: 'Vacation', start_date: '2026-08-02', end_date: '2026-08-28' }]);
                    }
                    throw new Error('unexpected');
                }],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const next = jest.fn();

            await createLeaveRequest(db)(makeReq({
                body: { startDate: '2026-09-01', endDate: '2026-09-10', leaveType: 'Vacation', reason: 'family' },
                user: { user_id: EMPLOYEE_ID, role: 'Nurse' }
            }), createResponse(), next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                statusCode: 409,
                message: expect.stringContaining('Insufficient Vacation leave balance')
            }));
            expect(client.calls.some((call) => call.text.includes('INSERT INTO leave_requests'))).toBe(false);
        });

        test('unpaid leave is exempt from balance checks', async () => {
            const client = makeClient([
                ['SELECT user_id, full_name FROM users', () => ok([{ user_id: EMPLOYEE_ID, full_name: 'Nurse One', role: 'Nurse' }])],
                ['FROM leave_requests', (params, text) => {
                    if (text.includes('request_id')) return ok([]);
                    return ok([]);
                }],
                ['INSERT INTO leave_requests', () => ok([{ request_id: LEAVE_ID, status: 'Pending' }])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await createLeaveRequest(db)(makeReq({
                body: { startDate: '2026-09-01', endDate: '2026-12-31', leaveType: 'Unpaid', reason: 'extended break' },
                user: { user_id: EMPLOYEE_ID, role: 'Nurse' }
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
        });
    });

    describe('shift scheduling over approved leave', () => {
        test('creates the shift but returns a loud warning', async () => {
            const client = makeClient([
                ['SELECT user_id, role FROM users', () => ok([{ user_id: EMPLOYEE_ID, role: 'Technician' }])],
                ['SELECT shift_id FROM staff_shifts', () => ok([])],
                ['INSERT INTO staff_shifts', () => ok([{ shift_id: SHIFT_ID, user_id: EMPLOYEE_ID, room_id: null }])],
                ['FROM leave_requests', (params, text) => {
                    if (text.includes("status = 'Approved'")) {
                        return ok([{ start_date: '2026-09-10', end_date: '2026-09-15', leave_type: 'Vacation' }]);
                    }
                    return ok([]);
                }],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await createShift(db)(makeReq({
                body: { userId: EMPLOYEE_ID, startTime: '2026-09-11T08:00:00Z', endTime: '2026-09-11T16:00:00Z' },
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                shift_id: SHIFT_ID,
                leave_warning: expect.objectContaining({
                    leave: expect.objectContaining({ leave_type: 'Vacation' })
                })
            }));
        });
    });

    describe('room over-staffing guard', () => {
        const ROOM_ID = '00000000-0000-4000-8000-000000000b07';

        test('warns when the same role covers the same room during an overlapping window', async () => {
            const client = makeClient([
                ['SELECT user_id, role FROM users', () => ok([{ user_id: EMPLOYEE_ID, role: 'Technician' }])],
                ['SELECT shift_id FROM staff_shifts', () => ok([])],
                ['INSERT INTO staff_shifts', () => ok([{ shift_id: SHIFT_ID, user_id: EMPLOYEE_ID, room_id: ROOM_ID }])],
                ['FROM leave_requests', () => ok([])],
                ['FROM staff_shifts s', (params, text) => {
                    if (text.includes('u.role = $3')) {
                        return ok([{ shift_id: 'other-shift', full_name: 'Second Technician', room_name: 'CT Room', start_time: '2026-09-11T08:00:00Z', end_time: '2026-09-11T16:00:00Z' }]);
                    }
                    return ok([]);
                }],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await createShift(db)(makeReq({
                body: { userId: EMPLOYEE_ID, startTime: '2026-09-11T10:00:00Z', endTime: '2026-09-11T18:00:00Z', roomId: ROOM_ID },
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                coverage_warning: expect.objectContaining({
                    room: 'CT Room',
                    employees: ['Second Technician']
                })
            }));
        });

        test('stays silent when no room is assigned or no overlap exists', async () => {
            const client = makeClient([
                ['SELECT user_id, role FROM users', () => ok([{ user_id: EMPLOYEE_ID, role: 'Technician' }])],
                ['SELECT shift_id FROM staff_shifts', () => ok([])],
                ['INSERT INTO staff_shifts', () => ok([{ shift_id: SHIFT_ID, user_id: EMPLOYEE_ID, room_id: null }])],
                ['FROM leave_requests', () => ok([])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await createShift(db)(makeReq({
                body: { userId: EMPLOYEE_ID, startTime: '2026-09-11T08:00:00Z', endTime: '2026-09-11T16:00:00Z' },
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ coverage_warning: null }));
        });
    });

    describe('staff credentials', () => {
        test('creates a credential for an eligible employee', async () => {
            const client = makeClient([
                ['SELECT user_id FROM users', () => ok([{ user_id: EMPLOYEE_ID }])],
                ['INSERT INTO staff_credentials', (params) => ok([{ credential_id: CREDENTIAL_ID, expires_at: params[6] }])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();

            await createStaffCredential(db)(makeReq({
                body: { userId: EMPLOYEE_ID, credentialType: 'Radiology License', credentialNumber: 'RL-5521', expiresAt: '2027-06-30' },
            }), res, jest.fn());

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ credential_id: CREDENTIAL_ID }));
        });

        test('rejects an expiry earlier than the issue date', () => {
            const result = createStaffCredentialSchema.safeParse({
                userId: EMPLOYEE_ID,
                credentialType: 'Radiology License',
                issuedDate: '2027-01-01',
                expiresAt: '2026-12-31'
            });
            expect(result.success).toBe(false);
        });

        test('scopes non-managers to their own credentials', async () => {
            let capturedSql = null;
            const db = {
                query: jest.fn(async (sql) => {
                    capturedSql = String(sql);
                    return ok([]);
                })
            };

            await getStaffCredentials(db)(makeReq({ user: { user_id: EMPLOYEE_ID, role: 'Nurse' } }), createResponse(), jest.fn());

            expect(capturedSql).toContain('FROM staff_credentials');
        });
    });

    describe('productivity report', () => {
        test('uses a bounded default window, LEFT JOINs, and enriches rows with effort metrics', async () => {
            const effortRow = {
                user_id: EMPLOYEE_ID,
                worked_hours: '160.0',
                late_minutes: '25',
                scheduled_hours: '176.0'
            };
            const outputRow = {
                user_id: EMPLOYEE_ID,
                full_name: 'Nurse One',
                role: 'Technician',
                metric_count: '80',
                metric_name: 'Exams Completed',
                avg_exam_minutes: '22.5'
            };
            const db = {
                query: jest.fn(async (sql, params) => {
                    const text = String(sql);
                    if (text.includes("u.role = 'Technician'")) return ok([outputRow]);
                    if (text.includes('FROM users u')) return ok([]);
                    if (text.includes('FULL OUTER JOIN sch')) return ok([effortRow]);
                    throw new Error(`Unexpected SQL: ${text.slice(0, 100)}`);
                })
            };
            const res = createResponse();
            const next = jest.fn();

            await getProductivityReport(db)(makeReq({ query: {} }), res, next);

            expect(next).not.toHaveBeenCalled();
            // 5 queries: four role queries plus the effort rollup.
            expect(db.query).toHaveBeenCalledTimes(5);
            const params = db.query.mock.calls.map((call) => call[1]);
            expect(params[0][0]).not.toBe('1970-01-01');

            const payload = res.json.mock.calls[0][0];
            expect(payload).toHaveLength(1);
            const row = payload[0];
            expect(row.metric_count).toBe(80);
            expect(row.worked_hours).toBe(160);
            expect(row.scheduled_hours).toBe(176);
            expect(row.late_minutes).toBe(25);
            expect(row.output_per_hour).toBe(0.5);
            expect(row.utilization_percent).toBe(91);
            expect(row.avg_exam_minutes).toBe('22.5');
        });

        test('handles staff with output but no attendance gracefully', async () => {
            const db = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text.includes('FROM users u')) {
                        return ok([{ user_id: OTHER_EMPLOYEE_ID, full_name: 'Cashier One', role: 'Cashier', metric_count: '12', metric_name: 'Payments Processed', total_collected: '3000' }]);
                    }
                    if (text.includes('FULL OUTER JOIN sch')) return ok([]);
                    throw new Error(`Unexpected SQL: ${text.slice(0, 100)}`);
                })
            };
            const res = createResponse();
            const next = jest.fn();

            await getProductivityReport(db)(makeReq({ query: {} }), res, next);

            expect(next).not.toHaveBeenCalled();
            const row = res.json.mock.calls[0][0][0];
            expect(row.worked_hours).toBe(0);
            expect(row.output_per_hour).toBeNull();
            expect(row.utilization_percent).toBeNull();
        });
    });

    describe('working day helpers', () => {
        test('excludes Fridays and Saturdays', () => {
            // 2026-09-04 is a Friday, 2026-09-05 a Saturday.
            expect(_hrInternals.workingDays('2026-09-01', '2026-09-06')).toBe(4);
            expect(_hrInternals.workingDays('2026-09-07', '2026-09-07')).toBe(1);
        });

        test('splits cross-year ranges per year', () => {
            const segments = _hrInternals.workingDaysByYear('2026-12-30', '2027-01-04');
            expect(segments).toHaveLength(2);
            expect(segments[0].year).toBe(2026);
            expect(segments[1].year).toBe(2027);
        });
    });
});
