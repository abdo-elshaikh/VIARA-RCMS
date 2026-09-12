import { describe, expect, it } from 'vitest';
import { canAccessRouteTarget, getAccessibleNavigationTree, getNavigationTree, resolveWorkspaceNavigation } from '../routes';
import { canAccessSettingsSection, SETTINGS_SECTION_ACCESS } from '../settingsSections';
import en from '../../i18n/locales/en/navigation.json';
import ar from '../../i18n/locales/ar/navigation.json';

const tabs = (path, user) => getAccessibleNavigationTree(user).find((route) => route.to === path)?.children.map((child) => new URLSearchParams(child.to.split('?')[1]).get('tab')) || [];

describe('workspace navigation policy', () => {
    it('checks granted child permissions, not the required permissions themselves', () => {
        expect(tabs('/reception', { role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS'] })).toEqual(['schedule']);
        expect(tabs('/reception', { role: 'Receptionist', permissions: ['VIEW_INVOICES'] })).toEqual(['billing']);
        expect(tabs('/reception', { role: 'Receptionist', permissions: ['PROCESS_PAYMENTS'] })).toEqual(['cashier']);
    });

    it('requires the parent permission even when a child permission is granted', () => {
        expect(tabs('/reception', { role: 'Receptionist', permissions: ['VIEW_PATIENTS'] })).toEqual([]);
    });

    it('enforces child roles without changing read-only maintenance access', () => {
        expect(tabs('/inventory', { role: 'Technician', permissions: ['VIEW_INVENTORY'] })).not.toContain('suppliers');
        expect(tabs('/equipment', { role: 'Technician', permissions: ['VIEW_EQUIPMENT'] })).toContain('maintenance');
        expect(tabs('/equipment', { role: 'Receptionist', permissions: ['VIEW_EQUIPMENT'] })).not.toContain('maintenance');
        expect(tabs('/equipment', { role: 'Receptionist', permissions: ['VIEW_EQUIPMENT'] })).toContain('downtime');
        expect(tabs('/marketing', { role: 'HR', permissions: ['VIEW_CRM'] })).toEqual(['dashboard', 'tasks']);
    });

    it('uses the dedicated cashier workspace and its shift permissions', () => {
        expect(tabs('/reception', { role: 'Cashier', permissions: ['VIEW_INVOICES', 'CLOSE_CASHIER_SHIFT'] })).toEqual(['billing', 'reconciliation']);
        expect(tabs('/reception', { role: 'Cashier', permissions: ['VIEW_INVOICES', 'APPROVE_SHIFT_VARIANCE'] })).toEqual(['billing', 'supervisor']);
    });

    it('preserves legacy role-only access and the Developer override', () => {
        expect(tabs('/inventory', { role: 'Admin' })).toContain('suppliers');
        expect(tabs('/inventory', { role: 'Admin', permissions: [] })).toEqual([]);
        expect(tabs('/inventory', { role: 'Developer', permissions: [] })).toContain('suppliers');
    });

    it('honors active emergency grants and drops expired grants', () => {
        const user = { role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS'], emergencyAccessId: 'access', elevatedPermissions: ['PROCESS_PAYMENTS'], breakGlassExpiry: Date.now() + 60000 };
        expect(tabs('/reception', user)).toContain('cashier');
        expect(tabs('/reception', { ...user, breakGlassExpiry: Date.now() - 1 })).not.toContain('cashier');
    });

    it.each(['Developer', 'Admin', 'HR', 'Receptionist', 'Cashier', 'Accountant', 'Technician', 'Nurse', 'Radiologist', 'Marketing', 'Insurance_Staff'])('shares every settings section policy for %s', (role) => {
        const user = { role, permissions: ['VIEW_AUDIT_LOGS', 'MANAGE_SETTINGS'] };
        expect(tabs('/settings', user)).toEqual(Object.keys(SETTINGS_SECTION_ACCESS).filter((section) => canAccessSettingsSection(section, user)));
    });

    it('canonicalizes invalid and forbidden sections while retaining filters', () => {
        const user = { role: 'Receptionist', permissions: ['VIEW_INVOICES'] };
        expect(resolveWorkspaceNavigation('/reception', '?tab=schedule&invoiceId=123', user).redirect).toBe('/reception?tab=billing&invoiceId=123');
        expect(resolveWorkspaceNavigation('/reception', '?tab=unknown', user).redirect).toBe('/reception?tab=billing');
        expect(resolveWorkspaceNavigation('/reception', '?tab=billing', user).redirect).toBeNull();
        expect(resolveWorkspaceNavigation('/reception', '', { role: 'Nurse', permissions: [] }).redirect).toBe('/unauthorized');
    });

    it('supports old clinical settings links and payroll deep links', () => {
        expect(resolveWorkspaceNavigation('/settings', '?tab=clinicalOperations', { role: 'Developer' }).redirect).toBe('/settings?tab=clinical');
        expect(resolveWorkspaceNavigation('/payroll', '?tab=rules', { role: 'HR', permissions: ['VIEW_PAYROLL'] }).active.key).toBe('payrollRules');
        expect(resolveWorkspaceNavigation('/patients/123', '', { role: 'Developer' })).toBeNull();
    });

    it('shares exact query-target access with search and help, including explicit grants', () => {
        expect(canAccessRouteTarget('/settings?tab=backups#restore', 'Admin', [])).toBe(false);
        expect(canAccessRouteTarget('/settings?tab=backups#restore', 'Admin', ['MANAGE_BACKUPS'])).toBe(true);
        expect(canAccessRouteTarget('/inventory?tab=unknown', { role: 'Developer' })).toBe(false);
        expect(canAccessRouteTarget('/reception?tab=schedule', { role: 'Cashier', permissions: ['VIEW_INVOICES'] })).toBe(false);
    });

    it('has unique, translated destinations in Arabic and English', () => {
        for (const user of [{ role: 'Developer' }, { role: 'Cashier' }]) {
            for (const route of getNavigationTree(user)) {
                expect(new Set(route.children.map((child) => child.to)).size).toBe(route.children.length);
                for (const child of route.children) {
                    expect(en.items[child.key]).toBeTruthy();
                    expect(ar.items[child.key]).toBeTruthy();
                }
            }
        }
    });
});
