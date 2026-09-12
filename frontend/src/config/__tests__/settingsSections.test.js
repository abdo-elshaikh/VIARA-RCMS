import { describe, expect, it } from 'vitest';
import { canAccessSettingsSection } from '../settingsSections';

describe('settings section RBAC registry', () => {
    it('keeps personal settings available to authenticated staff', () => {
        const user = { role: 'Nurse', permissions: [] };
        expect(canAccessSettingsSection('appearance', user)).toBe(true);
        expect(canAccessSettingsSection('preferences', user)).toBe(true);
        expect(canAccessSettingsSection('notifications', user)).toBe(true);
    });

    it('filters administrative sections using explicit permission claims', () => {
        const user = { role: 'Admin', permissions: ['MANAGE_SETTINGS'] };
        expect(canAccessSettingsSection('facility', user)).toBe(true);
        expect(canAccessSettingsSection('pacs', user)).toBe(false);
        expect(canAccessSettingsSection('backups', user)).toBe(false);
    });

    it('matches the backend Developer superuser bypass', () => {
        const developer = { role: 'Developer', permissions: [] };
        expect(canAccessSettingsSection('pacs', developer)).toBe(true);
        expect(canAccessSettingsSection('ai', developer)).toBe(true);
        expect(canAccessSettingsSection('developer', developer)).toBe(true);
    });

    it('allows an audit permission to expose audit logs without an admin role', () => {
        expect(canAccessSettingsSection('auditLogs', {
            role: 'HR',
            permissions: ['VIEW_AUDIT_LOGS'],
        })).toBe(true);
    });
});

