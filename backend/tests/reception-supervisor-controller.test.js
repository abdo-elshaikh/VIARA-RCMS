const { createAssignment, updateAssignment, listSupervisedTasks } = require('../src/controllers/receptionSupervisorController');

const UUIDS = {
    supervisor: '8a7f12ef-3e16-4aa6-8c20-97470c3fc1a3',
    employee: 'eb6d131a-4ac1-4923-acb2-11ae66ac9104',
    assignment: '3a39048b-42cf-4b9b-9a0f-80f3aa187ea5',
};

describe('reception supervisor assignment validation', () => {
    test('lists only active tasks inside the requesting supervisor scope', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = { json: jest.fn() };
        await listSupervisedTasks(db)({ user: { user_id: UUIDS.supervisor } }, res, jest.fn());
        expect(db.query.mock.calls[0][0]).toContain('assignment.supervisor_id = $1');
        expect(db.query.mock.calls[0][0]).toContain('assignment.can_transfer_tasks = TRUE');
        expect(db.query.mock.calls[0][0]).toContain('assignment.revoked_at IS NULL');
        expect(db.query.mock.calls[0][1]).toEqual([UUIDS.supervisor]);
        expect(res.json).toHaveBeenCalledWith([]);
    });

    test('rejects a duplicate active assignment for the same pair', async () => {
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] }) // BEGIN
                .mockResolvedValueOnce({ rows: [] }) // advisory lock
                .mockResolvedValueOnce({ rows: [{ user_id: UUIDS.supervisor }, { user_id: UUIDS.employee }] })
                .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
                .mockResolvedValueOnce({ rows: [] }), // ROLLBACK
            release: jest.fn(),
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const req = { body: { supervisorId: UUIDS.supervisor, employeeId: UUIDS.employee }, user: { user_id: UUIDS.supervisor }, ip: '127.0.0.1' };
        const next = jest.fn();

        await createAssignment(db)(req, {}, next);

        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 });
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO reception_supervisor_assignments'))).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });

    test('rejects handover capability without shift visibility', async () => {
        const next = jest.fn();
        await createAssignment({ connect: jest.fn() })({
            body: { supervisorId: UUIDS.supervisor, employeeId: UUIDS.employee,
                canViewShifts: false, canManageHandovers: true },
        }, {}, next);
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
    });

    test('requires an actual change before opening a transaction', async () => {
        const db = { connect: jest.fn() };
        const next = jest.fn();
        await updateAssignment(db)({ params: { assignmentId: UUIDS.assignment }, body: {} }, {}, next);
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
        expect(db.connect).not.toHaveBeenCalled();
    });
});
