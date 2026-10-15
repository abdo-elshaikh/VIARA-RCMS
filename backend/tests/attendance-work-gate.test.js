const { requireActiveAttendance } = require('../src/middleware/attendanceWorkGate');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const request = (role, method, path) => ({ user: { role, user_id: 'staff-1' }, method, originalUrl: path });

describe('attendance work gate', () => {
    test.each(['Receptionist', 'Nurse', 'Technician'])('blocks %s writes before clock-in', async (role) => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = response();
        const next = jest.fn();

        await requireActiveAttendance(db, request(role, 'POST', '/api/reception/shifts/open'), res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ATTENDANCE_CLOCK_IN_REQUIRED' }));
        expect(next).not.toHaveBeenCalled();
    });

    test('allows work only with a current open attendance record', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
        const next = jest.fn();
        await requireActiveAttendance(db, request('Technician', 'PATCH', '/api/clinical/exams/1'), response(), next);
        expect(db.query.mock.calls[0][0]).toContain('clock_out IS NULL');
        expect(db.query.mock.calls[0][0]).toContain("INTERVAL '24 hours'");
        expect(next).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['GET', '/api/reception/shifts'],
        ['POST', '/api/hr/attendance/clock-in'],
        ['POST', '/api/hr/attendance/clock-out'],
        ['POST', '/api/hr/attendance/permissions'],
        ['POST', '/api/hr/attendance-permissions'],
        ['POST', '/api/hr/shifts/requests'],
        ['POST', '/api/hr/leave'],
        ['PATCH', '/api/profile/preferences'],
    ])('keeps self-service available: %s %s', async (method, path) => {
        const db = { query: jest.fn() };
        const next = jest.fn();
        await requireActiveAttendance(db, request('Nurse', method, path), response(), next);
        expect(db.query).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('does not restrict other roles', async () => {
        const db = { query: jest.fn() };
        const next = jest.fn();
        await requireActiveAttendance(db, request('Admin', 'POST', '/api/reception/shifts/open'), response(), next);
        expect(db.query).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });
});
