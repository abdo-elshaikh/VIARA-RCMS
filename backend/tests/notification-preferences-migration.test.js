const fs = require('fs');
const path = require('path');

describe('notification preference owner repair migration', () => {
    const migrationPath = path.resolve(
        __dirname,
        '../../database/migrations/122_notification_preferences_owner_security.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    test('normalizes existing data before enforcing exactly one owner', () => {
        const cleanupPosition = sql.indexOf('DELETE FROM notification_preferences');
        const constraintPosition = sql.indexOf('CHECK (num_nonnulls(patient_id, doctor_id, staff_user_id) = 1)');

        expect(cleanupPosition).toBeGreaterThan(-1);
        expect(sql).toContain('WHERE num_nonnulls(patient_id, doctor_id, staff_user_id) > 1');
        expect(sql).toContain('PARTITION BY staff_user_id');
        expect(constraintPosition).toBeGreaterThan(cleanupPosition);
    });

    test('aligns staff defaults without replacing explicit false values', () => {
        expect(sql).toContain('notify_security_event = COALESCE(notify_security_event, TRUE)');
        expect(sql).toContain('ALTER COLUMN notify_security_event SET DEFAULT TRUE');
        expect(sql).not.toMatch(/SET\s+notify_security_event\s*=\s*TRUE\s*[,\n]/);
    });
});
