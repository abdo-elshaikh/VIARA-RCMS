import { describe, expect, it } from 'vitest';
import {
    ROUTE_METADATA,
    canAccessRoute,
    canAccessRouteTarget,
    getAccessibleNavigationRoutes,
    getNavigationRoutes,
    getRoutePermissions,
    getRouteRoles,
    getSearchRoutes,
} from '../routes';

describe('route metadata role matrix', () => {
    it.each([
        ['/referring-doctors', 'Receptionist', true],
        ['/referring-doctors', 'Accountant', true],
        ['/referring-doctors', 'Marketing', false],
        ['/referring-doctors', 'Radiologist', false],
        ['/referring-doctors/:doctorId', 'Radiologist', false],
        ['/users', 'HR', true],
        ['/users', 'Receptionist', false],
        ['/nurse', 'Radiologist', true],
        ['/nurse', 'Technician', true],
        ['/analytics', 'Marketing', true],
        ['/patients', 'Marketing', true],
        ['/insurance', 'Insurance_Staff', true],
        ['/leave', 'Technician', true],
        ['/leave', 'Cashier', true],
        ['/leave', 'Referring_Doctor', false],
        ['/admin', 'Developer', true],
        ['/notifications', 'Developer', true],
        ['/notifications', 'Radiologist', true],
        ['/notifications', 'Cashier', true],
        ['/notifications', 'Accountant', true],
        ['/notifications', 'Technician', true],
        ['/notifications', 'Nurse', true],
        ['/notifications', 'Insurance_Staff', true],
        ['/payroll', 'Receptionist', false],
    ])('%s access for %s is %s', (path, role, expected) => {
        expect(canAccessRoute(path, role)).toBe(expected);
    });

    it('uses registry roles unchanged in sidebar metadata', () => {
        getNavigationRoutes().forEach(({ to, roles }) => {
            expect(roles).toBe(getRouteRoles(to));
        });
    });

    it('filters navigation by both role and granted or elevated permissions', () => {
        const baseUser = { role: 'Receptionist', permissions: ['VIEW_PATIENTS', 'VIEW_APPOINTMENTS'] };
        const visiblePaths = getAccessibleNavigationRoutes(baseUser).map(({ to }) => to);

        expect(visiblePaths).toContain('/patients');
        expect(visiblePaths).toContain('/appointments');
        expect(visiblePaths).not.toContain('/communications');
        expect(visiblePaths).not.toContain('/financials');

        const elevatedPaths = getAccessibleNavigationRoutes({
            ...baseUser,
            emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
            elevatedPermissions: ['MANAGE_CHAT'],
            breakGlassExpiry: Date.now() + 60_000,
        }).map(({ to }) => to);
        expect(elevatedPaths).toContain('/communications');
    });

    it('keeps role-only compatibility for legacy sessions without permission claims', () => {
        expect(canAccessRoute('/patients', 'Receptionist')).toBe(true);
        expect(canAccessRoute('/patients', { role: 'Receptionist', permissions: [] })).toBe(false);
        expect(getRoutePermissions('/patients')).toEqual(['VIEW_PATIENTS']);
    });

    it('uses registry roles unchanged in search metadata', () => {
        getSearchRoutes().forEach(({ to, roles }) => {
            expect(roles).toBe(getRouteRoles(to.split('?')[0]));
        });
    });

    it('has one referring-doctors list route definition', () => {
        expect(Object.keys(ROUTE_METADATA).filter((path) => path === '/referring-doctors')).toHaveLength(1);
    });
});

describe('permission-aware route filtering', () => {
    it('requires a matching permission when the session carries permission claims', () => {
        expect(canAccessRoute('/patients', { role: 'Receptionist', permissions: [] })).toBe(false);
        expect(canAccessRoute('/patients', { role: 'Receptionist', permissions: ['VIEW_PATIENTS'] })).toBe(true);
    });

    it('grants access when any of the required permissions is held', () => {
        expect(canAccessRoute('/approvals', { role: 'Accountant', permissions: ['APPROVE_PAYROLL'] })).toBe(true);
        expect(canAccessRoute('/approvals', { role: 'Accountant', permissions: ['VIEW_PAYROLL'] })).toBe(false);
    });

    it('honours elevatedPermissions as an additional grant source', () => {
        const grant = { emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac', breakGlassExpiry: Date.now() + 60_000 };
        expect(canAccessRoute('/worklist', { role: 'Nurse', permissions: [], elevatedPermissions: ['VIEW_EXAMS'], ...grant })).toBe(true);
        expect(canAccessRoute('/worklist', { role: 'Nurse', permissions: [], elevatedPermissions: ['MANAGE_QUEUE'], ...grant })).toBe(false);
        expect(canAccessRoute('/worklist', { role: 'Nurse', permissions: [], elevatedPermissions: ['VIEW_EXAMS'], ...grant, breakGlassExpiry: Date.now() - 1 })).toBe(false);
    });

    it('falls back to role-based access for legacy sessions without permission claims', () => {
        expect(canAccessRoute('/worklist', { role: 'Technician' })).toBe(true);
        expect(canAccessRoute('/worklist', { role: 'Receptionist' })).toBe(false);
    });

    it('leaves routes without permission requirements ungated', () => {
        expect(canAccessRoute('/dashboard', { role: 'Marketing', permissions: [] })).toBe(true);
    });

    it('matches the backend Developer permission bypass', () => {
        expect(canAccessRoute('/worklist', { role: 'Developer', permissions: [] })).toBe(true);
        expect(canAccessRoute('/pacs/reconciliation', { role: 'Developer', permissions: [] })).toBe(true);
    });
});

describe('navigation and search route sources', () => {
    it('checks query-backed tabs instead of only the parent route', () => {
        expect(canAccessRouteTarget('/settings?tab=backups', { role: 'Admin', permissions: [] })).toBe(false);
        expect(canAccessRouteTarget('/settings?tab=backups', { role: 'Admin', permissions: ['MANAGE_BACKUPS'] })).toBe(true);
        expect(canAccessRouteTarget('/reception?tab=cashier', { role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS'] })).toBe(false);
        expect(canAccessRouteTarget('/reception?tab=cashier', { role: 'Receptionist', permissions: ['PROCESS_PAYMENTS'] })).toBe(true);
    });

    it('exposes the user-activity navigation metadata', () => {
        const nav = getNavigationRoutes().find(({ to }) => to === '/user-activity');
        expect(nav).toBeTruthy();
        expect(nav.key).toBe('userActivity');
        expect(nav.roles).toEqual(['Admin', 'HR']);
        expect(nav.permissions).toEqual(['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS']);
    });

    it('includes user-activity as a search destination with permission metadata', () => {
        const search = getSearchRoutes().find(({ to }) => to === '/user-activity');
        expect(search).toBeTruthy();
        expect(search.key).toBe('userActivity');
        expect(search.permissions).toEqual(['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS']);
    });

    it('derives accessible navigation from both roles and permissions', () => {
        const routes = getAccessibleNavigationRoutes({ role: 'Admin', permissions: ['VIEW_PATIENTS', 'VIEW_USERS'] });
        expect(routes.some(({ to }) => to === '/patients')).toBe(true);
        expect(routes.some(({ to }) => to === '/users')).toBe(true);
        expect(routes.some(({ to }) => to === '/financials')).toBe(false);
        expect(routes.some(({ to }) => to === '/user-activity')).toBe(false);
    });

    it('keeps role-based access for legacy sessions in navigation', () => {
        const routes = getAccessibleNavigationRoutes({ role: 'Accountant' });
        expect(routes.some(({ to }) => to === '/financials')).toBe(true);
    });
});
