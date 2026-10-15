'use strict';

/**
 * feature-gate-mounting.test.js
 * -----------------------------
 * A structural guard, not a behavioural one.
 *
 * `checkFeature` decides purely from the licence module list; it never looks at
 * the request path. Mounted correctly, that is what you want. Mounted on the
 * bare '/api' prefix — as four routers were — it silently runs for every route
 * registered after it, so a trial licence was refused on settings, clinical,
 * reception, display, notifications, chat and even /api/license/info, all with
 * a misleading "feature_not_licensed: finance".
 *
 * The blast radius was invisible to every existing test, because they exercise
 * routes directly and never start the real server. This test reads server.js
 * and asserts the mistake cannot come back.
 */

const fs = require('fs');
const path = require('path');

const SERVER = path.resolve(__dirname, '../src/server.js');

// [file, feature key, name of the constant holding the router's own prefixes]
const CASES = [
    ['financeRoutes.js', 'finance', 'FINANCE_PATHS'],
    ['insuranceRoutes.js', 'insurance', 'INSURANCE_PATHS'],
    ['hrRoutes.js', 'hr', 'HR_PATHS'],
    ['inventoryRoutes.js', 'inventory', 'INVENTORY_PATHS'],
    ['equipmentRoutes.js', 'equipment', 'EQUIPMENT_PATHS'],
];

const readRoute = (file) =>
    fs.readFileSync(path.resolve(__dirname, '../src/routes', file), 'utf8');

describe('feature gate mounting', () => {
    const source = fs.readFileSync(SERVER, 'utf8');

    test('no checkFeature is mounted on the bare /api prefix', () => {
        const offending = source.split(/\r?\n/)
            .map((line, i) => ({ line: i + 1, text: line }))
            .filter(({ text }) => /app\.use\(\s*'\/api'\s*,/.test(text) && /checkFeature\(/.test(text));

        expect(offending).toEqual([]);
    });

    test('every checkFeature mount uses a specific path prefix', () => {
        const mounts = source.split(/\r?\n/)
            .map((line, i) => ({ line: i + 1, text: line }))
            .filter(({ text }) => /checkFeature\(/.test(text) && /app\.use\(/.test(text));

        expect(mounts.length).toBeGreaterThan(0);
        for (const m of mounts) {
            const prefix = /app\.use\(\s*'([^']+)'/.exec(m.text);
            expect(prefix).not.toBeNull();
            // A mount at '/api' is the failure mode; anything deeper is scoped.
            expect(prefix[1]).not.toBe('/api');
            expect(prefix[1].length).toBeGreaterThan('/api'.length);
        }
    });

    test('the routers that previously leaked the gate gate themselves', () => {
        // Each of these was mounted as app.use('/api', checkFeature(x), ...).
        // If the gate is not inside the router, nothing gates those paths.
        for (const [file, feature] of CASES) {
            const src = readRoute(file);
            expect(src).toMatch(
                new RegExp(`router\\.use\\(\\s*\\w+_PATHS\\s*,\\s*checkFeature\\('${feature}'\\)\\)`)
            );
        }
    });

    test('every route of a gated router sits under a gated prefix', () => {
        // This is the invariant that makes the prefix list safe. The routers are
        // mounted on the bare '/api', so a route added under a prefix missing
        // from the list would reach a trial licence ungated — the exact failure
        // this file exists to prevent. Fail the build instead.
        for (const [file, feature, constant] of CASES) {
            const src = readRoute(file);

            const listMatch = new RegExp(`const ${constant} = \\[([^\\]]*)\\]`).exec(src);
            expect(listMatch).not.toBeNull();
            const gated = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
            expect(gated.length).toBeGreaterThan(0);

            const routeRe = /router\.(?:get|post|put|patch|delete)\(\s*'([^']*)'/g;
            const routes = [...src.matchAll(routeRe)].map((m) => m[1]);
            expect(routes.length).toBeGreaterThan(0);

            for (const route of routes) {
                const first = `/${route.split('/')[1]}`;
                expect({ file, route, first, gated: gated.includes(first) })
                    .toEqual({ file, route, first, gated: true });
            }
        }
    });

    test('each gated router applies the gate before declaring any route', () => {
        // router.use() only affects routes declared after it, so ordering is
        // load-bearing: a gate placed at the end of the file gates nothing.
        for (const [file, feature] of CASES) {
            const src = readRoute(file);
            const gateAt = src.search(/router\.use\(\s*\w+_PATHS\s*,\s*checkFeature/);
            const firstRoute = src.search(/router\.(get|post|put|patch|delete)\(/);
            expect(gateAt).toBeGreaterThan(-1);
            expect(firstRoute).toBeGreaterThan(-1);
            expect(gateAt).toBeLessThan(firstRoute);
        }
    });
});
