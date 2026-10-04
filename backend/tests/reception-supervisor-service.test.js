const { hasReceptionSupervision, assertReceptionSupervision } = require('../src/services/receptionSupervisorService');

describe('reception supervision scope', () => {
    const user = { user_id: 'supervisor-1', role: 'Receptionist' };

    test('requires an active assignment for the exact employee and capability', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
        expect(await hasReceptionSupervision(db, user, 'employee-1', 'manage_handovers')).toBe(true);
        expect(db.query.mock.calls[0][0]).toContain('a.can_manage_handovers = TRUE');
        expect(db.query.mock.calls[0][0]).toContain('a.revoked_at IS NULL');
        expect(db.query.mock.calls[0][1]).toEqual(['supervisor-1', 'employee-1']);
    });

    test('denies an unassigned employee', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        expect(await hasReceptionSupervision(db, user, 'employee-2', 'view_shifts')).toBe(false);
        await expect(assertReceptionSupervision(db, user, 'employee-2', 'view_shifts')).rejects.toMatchObject({ statusCode: 403 });
    });

    test('does not accept a different operational role', async () => {
        const db = { query: jest.fn() };
        expect(await hasReceptionSupervision(db, { ...user, role: 'Nurse' }, 'employee-1', 'view_shifts')).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });
});
