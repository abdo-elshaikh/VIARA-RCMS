import { describe, expect, it } from 'vitest';
import {
    ROUTE_METADATA,
    canAccessRoute,
    getNavigationRoutes,
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
        ['/payroll', 'Receptionist', false],
    ])('%s access for %s is %s', (path, role, expected) => {
        expect(canAccessRoute(path, role)).toBe(expected);
    });

    it('uses registry roles unchanged in sidebar metadata', () => {
        getNavigationRoutes().forEach(({ to, roles }) => {
            expect(roles).toBe(getRouteRoles(to));
        });
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
