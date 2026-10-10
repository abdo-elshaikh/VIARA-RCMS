jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(true),
}));

const {
    ALLOWED_SUPERVISION_MAP,
    isSupervisionRoleCompatible,
    hasStaffSupervision,
} = require('../src/services/staffSupervisorService');

describe('Cross-Department Supervisory Roles & Permissions', () => {
    describe('isSupervisionRoleCompatible', () => {
        test('allows standard same-role department supervision', () => {
            expect(isSupervisionRoleCompatible('Receptionist', 'Receptionist')).toBe(true);
            expect(isSupervisionRoleCompatible('Nurse', 'Nurse')).toBe(true);
            expect(isSupervisionRoleCompatible('Technician', 'Technician')).toBe(true);
            expect(isSupervisionRoleCompatible('Radiologist', 'Radiologist')).toBe(true);
            expect(isSupervisionRoleCompatible('Accountant', 'Accountant')).toBe(true);
            expect(isSupervisionRoleCompatible('Cashier', 'Cashier')).toBe(true);
            expect(isSupervisionRoleCompatible('Insurance_Staff', 'Insurance_Staff')).toBe(true);
            expect(isSupervisionRoleCompatible('Marketing', 'Marketing')).toBe(true);
        });

        test('allows cross-role supervisory chains within logical departments', () => {
            // Radiologists can supervise technicians
            expect(isSupervisionRoleCompatible('Radiologist', 'Technician')).toBe(true);
            // Reception supervisors can supervise cashiers
            expect(isSupervisionRoleCompatible('Receptionist', 'Cashier')).toBe(true);
            // Accounting supervisors can supervise cashiers
            expect(isSupervisionRoleCompatible('Accountant', 'Cashier')).toBe(true);
        });

        test('allows global management (HR, Admin, Developer) to supervise any operational role', () => {
            const operationalRoles = [
                'Receptionist', 'Nurse', 'Technician', 'Radiologist',
                'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing',
            ];
            for (const supervisor of ['HR', 'Admin', 'Developer']) {
                for (const emp of operationalRoles) {
                    expect(isSupervisionRoleCompatible(supervisor, emp)).toBe(true);
                }
            }
        });

        test('blocks inverted or unauthorized supervisory hierarchies', () => {
            // Technicians cannot supervise radiologists
            expect(isSupervisionRoleCompatible('Technician', 'Radiologist')).toBe(false);
            // Cashiers cannot supervise receptionists
            expect(isSupervisionRoleCompatible('Cashier', 'Receptionist')).toBe(false);
            // Cashiers cannot supervise accountants
            expect(isSupervisionRoleCompatible('Cashier', 'Accountant')).toBe(false);
            // Nursing cannot supervise radiologists
            expect(isSupervisionRoleCompatible('Nurse', 'Radiologist')).toBe(false);
            // Marketing cannot supervise technicians
            expect(isSupervisionRoleCompatible('Marketing', 'Technician')).toBe(false);
        });
    });

    describe('hasStaffSupervision security invariants', () => {
        test('strictly prevents self-supervision regardless of capability', async () => {
            const mockDb = { query: jest.fn() };
            const user = { user_id: '11111111-1111-1111-1111-111111111111', role: 'Radiologist' };
            const result = await hasStaffSupervision(mockDb, user, user.user_id, 'leave');
            expect(result).toBe(false);
            expect(mockDb.query).not.toHaveBeenCalled();
        });

        test('requires valid employeeId and capability', async () => {
            const mockDb = { query: jest.fn() };
            const user = { user_id: '11111111-1111-1111-1111-111111111111', role: 'Radiologist' };
            expect(await hasStaffSupervision(mockDb, user, null, 'leave')).toBe(false);
            await expect(hasStaffSupervision(mockDb, user, '22222222-2222-2222-2222-222222222222', 'unknown_capability'))
                .rejects.toThrow('Unknown staff supervision capability');
        });

        test('queries active, non-revoked assignment with capability enabled', async () => {
            const mockDb = {
                query: jest.fn().mockResolvedValue({ rows: [{ assignment_id: 'assign-123' }] }),
            };
            const supervisor = { user_id: '11111111-1111-1111-1111-111111111111', role: 'Radiologist' };
            const employeeId = '22222222-2222-2222-2222-222222222222';

            const hasShiftsPerm = await hasStaffSupervision(mockDb, supervisor, employeeId, 'shifts');
            expect(hasShiftsPerm).toBe(true);
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('assignment.can_approve_shifts = TRUE'),
                [supervisor.user_id, employeeId]
            );
        });
    });

    describe('createAssignment batch multi-selection', () => {
        const { createAssignment } = require('../src/controllers/staffSupervisorController');

        test('creates assignments for multiple selected employees', async () => {
            const supervisorId = '11111111-1111-1111-1111-111111111111';
            const emp1 = '22222222-2222-2222-2222-222222222222';
            const emp2 = '33333333-3333-3333-3333-333333333333';

            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({}) // BEGIN
                    .mockResolvedValueOnce({}) // LOCK
                    .mockResolvedValueOnce({ // users
                        rows: [
                            { user_id: supervisorId, role: 'Radiologist', full_name: 'Lead Doctor' },
                            { user_id: emp1, role: 'Technician', full_name: 'Tech 1' },
                            { user_id: emp2, role: 'Technician', full_name: 'Tech 2' },
                        ],
                    })
                    .mockResolvedValueOnce({ rows: [] }) // existing check
                    .mockResolvedValueOnce({ rows: [{ assignment_id: 'a1', supervisor_id: supervisorId, employee_id: emp1 }] }) // insert 1
                    .mockResolvedValueOnce({ rows: [{ assignment_id: 'a2', supervisor_id: supervisorId, employee_id: emp2 }] }) // insert 2
                    .mockResolvedValueOnce({}), // COMMIT
                release: jest.fn(),
            };
            const mockDb = { connect: jest.fn().mockResolvedValue(mockClient) };

            const req = {
                body: {
                    supervisorId,
                    employeeIds: [emp1, emp2],
                    canApproveLeave: true,
                    canApproveShifts: true,
                },
                user: { user_id: 'admin-id', role: 'Admin' },
                ip: '127.0.0.1',
            };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };
            const next = jest.fn();

            await createAssignment(mockDb)(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                count: 2,
            }));
            expect(mockClient.release).toHaveBeenCalled();
        });

        test('rejects if supervisor attempts to include themselves in employeeIds', async () => {
            const supervisorId = '11111111-1111-1111-1111-111111111111';
            const mockDb = { connect: jest.fn() };

            const req = {
                body: {
                    supervisorId,
                    employeeIds: [supervisorId, '22222222-2222-2222-2222-222222222222'],
                },
                user: { user_id: 'admin-id', role: 'Admin' },
            };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();

            await createAssignment(mockDb)(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('cannot supervise themselves'),
            }));
        });
    });
});
