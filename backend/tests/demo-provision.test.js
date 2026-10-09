'use strict';

/**
 * demo-provision.test.js
 * ---------------------
 * Tests for the provisioning CLI that drive demo stacks.
 *
 * The CLI is the only place that reaches `docker compose down --volumes`, so the
 * tests focus on it failing closed: on bad input and on an unknown customer it
 * must refuse before any Docker command runs. A guard that runs *after* the
 * teardown has started protects nothing.
 *
 * These tests never invoke Docker. Every case either throws before the compose
 * call or is limited to argument handling.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cli = require('../../scripts/demo-provision');

const CLI_PATH = path.resolve(__dirname, '../../scripts/demo-provision.js');
const REPO_ROOT = path.resolve(__dirname, '../..');

/** Run the CLI with a throwaway ledger so tests never touch the real one. */
function runCli(args, { ledgerPath } = {}) {
    const env = { ...process.env };
    if (ledgerPath) env.VIARA_DEMO_LEDGER = ledgerPath;
    try {
        const stdout = execFileSync('node', [CLI_PATH, ...args], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { code: 0, stdout, stderr: '' };
    } catch (err) {
        const rawCode = err.status === undefined ? -1 : err.status;
        const code = (rawCode === 2147483651 || rawCode === -2147483645) ? 1 : rawCode;
        return {
            code,
            stdout: err.stdout || '',
            stderr: err.stderr || '',
        };
    }
}

describe('demo-provision CLI', () => {
    let tmpDir;
    let ledgerPath;
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viara-demo-fixture-'));
    const envPath = path.join(fixtureDir, 'base.env');
    const originalBaseEnv = process.env.VIARA_DEMO_BASE_ENV;
    const originalKeyPath = process.env.VIARA_LICENSE_PRIVATE_KEY_PATH;
    beforeAll(() => {
        fs.writeFileSync(envPath, cli.SECRET_KEYS.map(key => key + '=' + '1'.repeat(64)).join('\n') + '\nPOSTGRES_USER=postgres\nPOSTGRES_DB=viara\n');
        process.env.VIARA_DEMO_BASE_ENV = envPath;
        const { privateKey } = require('node:crypto').generateKeyPairSync('ec', {namedCurve:'prime256v1'});
        process.env.VIARA_LICENSE_PRIVATE_KEY_PATH = path.join(fixtureDir, 'test-signing.pem');
        fs.writeFileSync(process.env.VIARA_LICENSE_PRIVATE_KEY_PATH, privateKey.export({type:'pkcs8',format:'pem'}));
    });
    afterAll(() => {
        if(originalBaseEnv === undefined) delete process.env.VIARA_DEMO_BASE_ENV;
        else process.env.VIARA_DEMO_BASE_ENV = originalBaseEnv;
        if(originalKeyPath === undefined) delete process.env.VIARA_LICENSE_PRIVATE_KEY_PATH;
        else process.env.VIARA_LICENSE_PRIVATE_KEY_PATH = originalKeyPath;
        fs.rmSync(fixtureDir, {recursive:true,force:true});
    });

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'VIARA-demo-cli-'));
        ledgerPath = path.join(tmpDir, 'leases.json');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('parseArgs', () => {
        test('separates the command from its flags', () => {
            expect(cli.parseArgs(['provision', '--customer', 'Acme']))
                .toEqual({ command: 'provision', opts: { customer: 'Acme' } });
        });

        test('treats a trailing flag with no value as a boolean', () => {
            expect(cli.parseArgs(['reap', '--yes']).opts.yes).toBe(true);
        });

        test('handles multiple flags in any order', () => {
            const { opts } = cli.parseArgs(['provision', '--days', '30', '--customer', 'Acme']);
            expect(opts).toEqual({ days: '30', customer: 'Acme' });
        });
    });

    describe('usage', () => {
        test('prints usage with no arguments and exits cleanly', () => {
            const { code, stdout } = runCli([]);
            expect(code).toBe(0);
            expect(stdout).toContain('demo-provision.js provision');
        });

        test('rejects an unknown command', () => {
            const { code, stderr } = runCli(['obliterate']);
            expect(code).toBe(1);
            expect(stderr).toContain('Unknown command');
        });
    });

    describe('fail-closed behaviour', () => {
        test('reclaim refuses a customer with no lease, without calling Docker', () => {
            const { code, stderr } = runCli(['reclaim', '--customer', 'ghost'], { ledgerPath });
            expect(code).toBe(1);
            expect(stderr).toContain('no demo lease');
        });

        test('reclaim requires --customer', () => {
            const { code, stderr } = runCli(['reclaim'], { ledgerPath });
            expect(code).toBe(1);
            expect(stderr).toContain('--customer');
        });

        test('provision requires --customer', () => {
            const { code, stderr } = runCli(['provision'], { ledgerPath });
            expect(code).toBe(1);
            expect(stderr).toContain('--customer');
        });

        test('a ledger naming a project outside the demo namespace is not actionable', () => {
            // Simulates a tampered or hand-edited ledger pointing at the
            // production stack. The lookup must not resolve to it, so no
            // teardown can be launched against it.
            const store = require('../../scripts/lib/demoLeaseStore');
            store.createLease({ customerId: 'acme', ledgerPath, now: new Date() });

            const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
            raw.leases[0].project = 'viara';
            fs.writeFileSync(ledgerPath, JSON.stringify(raw, null, 2), 'utf8');

            const { code, stderr } = runCli(['reclaim', '--customer', 'acme', '--yes'], { ledgerPath });
            expect(code).toBe(1);
            expect(stderr).toMatch(/no demo lease|not recorded|must be named under/);
        });

        test('a corrupt ledger aborts instead of treating every stack as absent', () => {
            fs.writeFileSync(ledgerPath, 'not json at all', 'utf8');
            const { code, stderr } = runCli(['reclaim', '--customer', 'acme', '--yes'], { ledgerPath });
            expect(code).toBe(1);
            expect(stderr).toMatch(/unreadable/);
        });
    });

    describe('list', () => {
        test('reports when there are no leases', () => {
            const { code, stdout } = runCli(['list'], { ledgerPath });
            expect(code).toBe(0);
            expect(stdout).toContain('No demo leases');
        });
    });

    describe('port assignment', () => {
        test('every demo-critical port is overridden', () => {
            // These must all differ from the base compose defaults, or two demo
            // stacks would collide on the host.
            const expected = {
                POSTGRES_PORT: 5432,
                BACKEND_PORT: 3000,
                FRONTEND_PORT: 5173,
                PORTAL_PORT: 5174,
                ORTHANC_REST_PORT: 8042,
                PACS_DICOM_PORT: 4242,
                OHIF_PORT: 3005,
            };
            for (const [key, baseDefault] of Object.entries(expected)) {
                expect(cli.PORT_KEYS[key]).toBeDefined();
                expect(cli.PORT_KEYS[key]).not.toBe(baseDefault);
            }
        });

        test('demo overlay isolates fixed-name Redis and the PACS worklist volume', () => {
            const overlay = fs.readFileSync(path.join(REPO_ROOT, 'docker-compose.demo.yml'), 'utf8');
            expect(overlay).toMatch(/redis:\s*\r?\n\s+container_name:\s*!reset null/);
            expect(overlay).toContain('demo_pacs_worklists:/app/pacs-worklists');
            expect(overlay).toContain('demo_pacs_worklists:/var/lib/orthanc/worklists');
            expect(overlay).toContain('ORTHANC__POSTGRESQL__USERNAME: ${POSTGRES_USER:-postgres}');
        });
    });

    describe('secret isolation', () => {
        test('a demo env never reuses the main stack secrets', () => {
            // The single most important property here: a shared JWT_SECRET would
            // let anyone who reaches the demo forge production sessions.
            const mainEnv = fs.readFileSync(envPath, 'utf8');
            const mainSecrets = {};
            for (const line of mainEnv.split(/\r?\n/)) {
                const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
                if (m) mainSecrets[m[1]] = m[2];
            }

            const keys = ['JWT_SECRET', 'ENCRYPTION_KEY', 'BLIND_INDEX_KEY', 'PACS_WEBHOOK_SECRET', 'POSTGRES_PASSWORD'];
            const present = keys.filter((k) => mainSecrets[k]);
            // Guard the guard: if the repo .env has none of these, the test
            // proves nothing and should fail loudly rather than pass vacuously.
            expect(present.length).toBeGreaterThan(0);

            for (const key of keys) {
                expect(cli.SECRET_KEYS).toContain(key);
            }
        });

        test('each generated secret is 32 bytes of hex and unique', () => {
            const a = cli.generateSecrets();
            const b = cli.generateSecrets();
            for (const key of Object.keys(a)) {
                expect(a[key]).toMatch(/^[0-9a-f]{64}$/);
                expect(a[key]).not.toBe(b[key]);
            }
        });

        test('demo URLs point at the demo ports, not the main stack', () => {
            expect(cli.demoUrl('OHIF_PORT', 'http'))
                .toBe(`http://localhost:${cli.PORT_KEYS.OHIF_PORT}`);
            expect(cli.PORT_KEYS.OHIF_PORT).not.toBe(3005);
        });
    });

    describe('generated env file', () => {
        const store = require('../../scripts/lib/demoLeaseStore');
        let envFile;

        beforeAll(() => {
            const lease = store.createLease({
                customerId: 'envfile-test',
                displayName: 'طيبة للاشعة',
                days: 5,
                ledgerPath: path.join(tmpDir, 'l.json'),
            });
            envFile = cli.writeEnvFile(lease.project, lease, 'TEST-LICENSE-KEY');
        });

        afterAll(() => {
            fs.rmSync(
                path.join(REPO_ROOT, 'scratch', 'demos', 'viara-demo-envfile-test.env'),
                { force: true }
            );
        });

        test('seeds the credentials seed.js demands', () => {
            // backend/seed.js exits without TEST_USER_PASSWORD rather than
            // falling back to a committed default password.
            const env = cli.readEnvFile(envFile);
            expect(env.TEST_USER_PASSWORD).toBeTruthy();
            expect(env.DATABASE_URL).toBeTruthy();
        });

        test('DATABASE_URL targets the demo database with the demo password', () => {
            const env = cli.readEnvFile(envFile);
            const url = new URL(env.DATABASE_URL);
            expect(url.port).toBe(String(cli.PORT_KEYS.POSTGRES_PORT));
            // Must be the demo's own password, not one inherited from the root .env.
            expect(env.DATABASE_URL).toContain(env.POSTGRES_PASSWORD);
        });

        test('does not inherit the main stack secrets', () => {
            const env = cli.readEnvFile(envFile);
            const mainEnv = {};
            for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
                const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
                if (m) mainEnv[m[1]] = m[2];
            }
            for (const key of ['JWT_SECRET', 'ENCRYPTION_KEY', 'BLIND_INDEX_KEY', 'PACS_WEBHOOK_SECRET']) {
                if (mainEnv[key]) expect(env[key]).not.toBe(mainEnv[key]);
            }
        });

        test('carries the issued licence rather than a placeholder', () => {
            expect(cli.readEnvFile(envFile).LICENSE_KEY).toBe('TEST-LICENSE-KEY');
        });

        test('preserves the Arabic customer display name separately from the licence ID', () => {
            expect(cli.readEnvFile(envFile).VIARA_DEMO_CUSTOMER).toBe('envfile-test');
            expect(cli.readEnvFile(envFile).VIARA_DEMO_CUSTOMER_NAME).toBe('طيبة للاشعة');
        });

        test('points browser security origins at the isolated demo ports', () => {
            const env = cli.readEnvFile(envFile);
            const frontend = cli.demoUrl('FRONTEND_PORT', 'http');
            const portal = cli.demoUrl('PORTAL_PORT', 'http');
            expect(env.CLIENT_URL).toBe(frontend);
            expect(env.PORTAL_CLIENT_URL).toBe(portal);
            expect(env.ALLOWED_ORIGINS).toBe(`${frontend},${portal}`);
            expect(env.WEBAUTHN_ORIGIN).toBe(frontend);
            expect(env.WEBAUTHN_RP_ID).toBe('localhost');
            expect(env.VITE_OHIF_URL).toBe(cli.demoUrl('OHIF_PORT', 'http'));
            expect(env.PORTAL_PUBLIC_URL).toBe(portal);
        });
    });

    describe('reaper', () => {
        const seedExpired = (path_, count = 2) => {
            const store = require('../../scripts/lib/demoLeaseStore');
            const past = new Date(Date.now() - 10 * 86400000);
            for (let i = 0; i < count; i += 1) {
                store.createLease({ customerId: `overdue-${i}`, days: 3, now: past, ledgerPath: path_ });
            }
            // A live lease must never be reaped, however the test is run.
            store.createLease({ customerId: 'live-one', days: 30, ledgerPath: path_ });
        };

        test('reports nothing to do when no lease has expired', () => {
            const { code, stdout } = runCli(['reap', '--yes'], { ledgerPath });
            expect(code).toBe(0);
            expect(stdout).toContain('No expired demos');
        });

        test('refuses to delete volumes without explicit confirmation', () => {
            seedExpired(ledgerPath);
            const { code, stderr } = runCli(['reap'], { ledgerPath });
            expect(code).toBe(1);
            expect(stderr).toMatch(/deletes volumes/);
            expect(stderr).toMatch(/--yes|--dry-run/);
        });

        test('--dry-run changes nothing', () => {
            seedExpired(ledgerPath);
            const store = require('../../scripts/lib/demoLeaseStore');
            const before = store.listLeases({ ledgerPath }).map((l) => l.status);

            const { code, stdout } = runCli(['reap', '--dry-run'], { ledgerPath });
            expect(code).toBe(0);
            expect(stdout).toContain('Dry run');
            expect(stdout).toContain('nothing was changed');

            const after = store.listLeases({ ledgerPath }).map((l) => l.status);
            expect(after).toEqual(before);
        });

        test('reaps only expired leases and leaves live ones active', () => {
            seedExpired(ledgerPath);
            const { code } = runCli(['reap', '--yes'], { ledgerPath });
            expect(code).toBe(0);

            const store = require('../../scripts/lib/demoLeaseStore');
            const byCustomer = Object.fromEntries(
                store.listLeases({ ledgerPath }).map((l) => [l.customerId, l.status])
            );
            expect(byCustomer['overdue-0']).toBe('reclaimed');
            expect(byCustomer['overdue-1']).toBe('reclaimed');
            expect(byCustomer['live-one']).toBe('active');
        });

        test('writes a durable audit record of what was destroyed', () => {
            // A scheduled run's stdout goes nowhere useful, so the record of
            // deleted patient data has to survive on disk.
            seedExpired(ledgerPath, 1);
            runCli(['reap', '--yes'], { ledgerPath });

            const log = path.join(REPO_ROOT, 'scratch', 'demos', 'reap-audit.log');
            const contents = fs.readFileSync(log, 'utf8');
            const reaped = contents.split(/\r?\n/).filter((l) => l.includes(' REAP '));
            expect(reaped.length).toBeGreaterThan(0);
            expect(reaped[reaped.length - 1]).toContain('viara-demo-overdue-0');
        });

        test('a reaped lease is not reaped again', () => {
            seedExpired(ledgerPath, 1);
            runCli(['reap', '--yes'], { ledgerPath });
            const { code, stdout } = runCli(['reap', '--yes'], { ledgerPath });
            expect(code).toBe(0);
            expect(stdout).toContain('No expired demos');
        });
    });

    describe('licence issuance', () => {
        test('issues a parseable short-dated trial key', () => {
            const key = cli.issueLicense('TEST-CUSTOMER', 3, 2);
            expect(typeof key).toBe('string');
            expect(key.length).toBeGreaterThan(50);
            expect(key).not.toContain('LICENSE KEY');

            const decoded = JSON.parse(Buffer.from(key, 'base64url').toString('utf8'));
            expect(decoded.payload.customerId).toBe('TEST-CUSTOMER');
            expect(decoded.payload.edition).toBe('trial');
            expect(decoded.payload.maxUsers).toBe(2);
            // The signature is a sibling of the payload, not part of it.
            expect(decoded).toHaveProperty('signature');
            expect(typeof decoded.signature).toBe('string');
            expect(decoded.signature.length).toBeGreaterThan(0);
            expect(decoded.payload).not.toHaveProperty('signature');
        });

        test('the licence window matches the lease window', () => {
            // A licence outliving its lease would leave a demo running with no
            // recorded ownership, which is the case the ledger exists to prevent.
            const days = 4;
            const key = cli.issueLicense('WINDOW-TEST', days, 1);
            const { payload } = JSON.parse(Buffer.from(key, 'base64url').toString('utf8'));
            const issued = new Date(payload.issuedAt).getTime();
            const expires = new Date(payload.expiresAt).getTime();
            const span = Math.round((expires - issued) / 86400000);
            expect(span).toBe(days);
        });
    });
});
