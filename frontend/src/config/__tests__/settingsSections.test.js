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
        expect(canAccessSettingsSection('pacs', { ...user, permissions: ['MANAGE_PACS'] })).toBe(true);
    });

    it('matches the backend Developer superuser bypass', () => {
        const developer = { role: 'Developer', permissions: [] };
        expect(canAccessSettingsSection('pacs', developer)).toBe(true);
        expect(canAccessSettingsSection('ai', developer)).toBe(true);
        expect(canAccessSettingsSection('developer', developer)).toBe(true);
    });

    it('exposes audit logs to a non-admin holding the audit-trail permission', () => {
        // Migration 087 grants VIEW_AUDIT_TRAILS to Accountants on purpose so
        // they can reconcile finance against the trail.
        expect(canAccessSettingsSection('auditLogs', {
            role: 'Accountant',
            permissions: ['VIEW_AUDIT_TRAILS'],
        })).toBe(true);

        // The broader admin role still works without the explicit claim.
        expect(canAccessSettingsSection('auditLogs', {
            role: 'Admin',
            permissions: [],
        })).toBe(true);
    });

    it('does not open the full audit trail for the narrower activity-log claim', () => {
        // VIEW_AUDIT_LOGS is the limited "staff activity" permission and is not
        // a substitute for VIEW_AUDIT_TRAILS.
        expect(canAccessSettingsSection('auditLogs', {
            role: 'HR',
            permissions: ['VIEW_AUDIT_LOGS'],
        })).toBe(false);

        // Holding an unrelated permission must not help either.
        expect(canAccessSettingsSection('auditLogs', {
            role: 'HR',
            permissions: ['VIEW_PATIENTS'],
        })).toBe(false);
    });
});

