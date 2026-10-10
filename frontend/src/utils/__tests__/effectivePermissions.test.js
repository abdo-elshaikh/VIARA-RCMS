import { describe, expect, it } from 'vitest';
import { getEffectivePermissions, hasEffectivePermission, isEmergencyAccessActive } from '../effectivePermissions';

const activeGrant = {
    emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
    elevatedPermissions: ['VIEW_EXAMS'],
    breakGlassExpiry: 2_000,
};

describe('effective emergency permissions', () => {
    it('includes a database-attributable, unexpired emergency grant', () => {
        const user = { role: 'Nurse', permissions: ['MANAGE_QUEUE'], ...activeGrant };
        expect(isEmergencyAccessActive(user, 1_000)).toBe(true);
        expect(getEffectivePermissions(user, 1_000)).toEqual(new Set(['MANAGE_QUEUE', 'VIEW_EXAMS']));
    });

    it('ignores expired or unattributable elevated claims', () => {
        expect(getEffectivePermissions({ ...activeGrant, breakGlassExpiry: 500 }, 1_000).has('VIEW_EXAMS')).toBe(false);
        expect(getEffectivePermissions({ elevatedPermissions: ['VIEW_EXAMS'], breakGlassExpiry: 2_000 }, 1_000).has('VIEW_EXAMS')).toBe(false);
    });

    it('keeps Developer superuser behavior without elevating other roles', () => {
        expect(hasEffectivePermission({ role: 'Developer' }, 'MANAGE_PACS')).toBe(true);
        expect(hasEffectivePermission({ role: 'Nurse', permissions: [] }, 'MANAGE_PACS')).toBe(false);
    });
});
