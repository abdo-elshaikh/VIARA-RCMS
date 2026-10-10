'use strict';

/**
 * licenseService.test.js
 * ----------------------
 * Unit tests for the VIARA license engine.
 *
 * Tests cover:
 *  - Developer fallback (no LICENSE_KEY set)
 *  - Valid trial license: payload parsing, daysRemaining, allowedModules
 *  - Valid standard license: module list expansion
 *  - Expired license detection
 *  - Tampered signature rejection
 *  - Hardware fingerprint binding (first activation + mismatch)
 *  - licenseAllows() feature-gate helper
 */

const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const crypto = require('crypto');

const ORIGINAL_DATE_NOW = Date.now.bind(Date);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a real ECDSA-signed license key for use in tests */
function makeKey({ edition = 'trial', daysFromNow = 30, maxUsers = 3, allowedModules = null, overrides = {} } = {}) {
    // Generate a fresh keypair for each test run
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const issuedAt  = new Date().toISOString();
    const expiresAt = new Date(ORIGINAL_DATE_NOW() + daysFromNow * 86400000).toISOString();

    const payload = {
        v: 1,
        customerId:     'TEST-CLIENT',
        edition,
        issuedAt,
        expiresAt,
        maxUsers,
        fingerprint:    null,
        allowedModules,
        ...overrides,
    };

    const data      = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = crypto.sign('SHA256', data, privateKey).toString('base64');

    const token = Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');

    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

    return { token, publicKeyPem, payload };
}

// ── Module under test ────────────────────────────────────────────────────────

describe('licenseService', () => {
    let licenseService;
    let activationFile;
    let storageFile;

    beforeEach(() => {
        // Always ensure Date.now is restored
        Date.now = ORIGINAL_DATE_NOW;

        // Reset module registry so each test gets a fresh singleton
        jest.resetModules();

        // Use temp files for activation and storage state
        activationFile = path.join(os.tmpdir(), `.viara-activation-test-${ORIGINAL_DATE_NOW()}-${Math.random()}`);
        storageFile = path.join(os.tmpdir(), `.viara-license-test-${ORIGINAL_DATE_NOW()}-${Math.random()}`);

        // Set env vars before requiring the module
        process.env.NODE_ENV = 'test';
        delete process.env.LICENSE_KEY;
        delete process.env.LICENSE_PUBLIC_KEY;

        process.env.LICENSE_ACTIVATION_FILE = activationFile;
        process.env.LICENSE_STORAGE_FILE = storageFile;
        process.env.__VIARA_ACTIVATION_PATH = activationFile;

        licenseService = require('../../src/services/licenseService');
    });

    afterEach(() => {
        Date.now = ORIGINAL_DATE_NOW;
        // Clean up temp files
        try { fs.unlinkSync(activationFile); } catch { /* may not exist */ }
        try { fs.unlinkSync(storageFile); } catch { /* may not exist */ }
    });

    // ── 1. Developer fallback ─────────────────────────────────────────────

    describe('security boundaries', () => {
        test.each(['development', 'test', 'production'])('rejects forged signatures in %s', (environment) => {
            const { token, publicKeyPem } = makeKey();
            const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
            decoded.payload.maxUsers = 999;
            const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');
            process.env.NODE_ENV = environment;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            process.env.LICENSE_KEY = forged;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            expect(() => svc.loadLicense()).toThrow(/signature/i);
            expect(svc.inspectLicenseKey(forged).valid).toBe(false);
            expect(() => svc.applyLicenseKey(forged, { persist: false })).toThrow();
        });
        test.each([
            { expiresAt: null }, { maxUsers: 0 }, { maxUsers: -2 }, { allowedModules: '*' },
        ])('rejects signed invalid trial payload %j', (overrides) => {
            const { token, publicKeyPem } = makeKey({ overrides });
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            process.env.LICENSE_KEY = token;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            expect(() => svc.loadLicense()).toThrow();
            expect(svc.inspectLicenseKey(token).valid).toBe(false);
        });
        test('does not grant developer access before production initialization', () => {
            process.env.NODE_ENV = 'production';
            expect(() => licenseService.getLicense()).toThrow(/loaded/);
        });
    });

    describe('developer fallback (no LICENSE_KEY)', () => {
        it('returns edition=developer with all modules only in local/test environments', () => {
            process.env.NODE_ENV = 'test';
            const lic = licenseService.loadLicense();
            expect(lic.edition).toBe('developer');
            expect(lic.allowedModules).toContain('*');
            expect(lic.daysRemaining).toBeNull();
        });

        it('blocks developer fallback in hosted or staging environments', () => {
            process.env.NODE_ENV = 'staging';
            expect(() => licenseService.loadLicense()).toThrow(/LICENSE_KEY is required|local development/i);
        });

        it('licenseAllows() returns true for any feature in developer mode', () => {
            process.env.NODE_ENV = 'test';
            licenseService.loadLicense();
            expect(licenseService.licenseAllows('pacs')).toBe(true);
            expect(licenseService.licenseAllows('finance')).toBe(true);
            expect(licenseService.licenseAllows('nonexistent')).toBe(true);
        });
    });

    // ── 2. Valid trial license ────────────────────────────────────────────

    describe('valid trial license', () => {
        it('parses edition, customerId, daysRemaining, and allowedModules', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'trial', daysFromNow: 30 });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');

            const lic = svc.loadLicense();

            expect(lic.edition).toBe('trial');
            expect(lic.customerId).toBe('TEST-CLIENT');
            expect(lic.daysRemaining).toBeGreaterThan(28);
            expect(lic.daysRemaining).toBeLessThanOrEqual(30);
            expect(lic.allowedModules).toContain('appointments');
            // Trial must operate the front desk: reception shifts require an
            // attendance clock-in ('hr') and booking patients implies billing
            // them ('finance'). Premium modules stay gated so the trial is still
            // a limited edition.
            expect(lic.allowedModules).toContain('hr');
            expect(lic.allowedModules).toContain('finance');
            expect(lic.allowedModules).not.toContain('analytics');
            expect(lic.allowedModules).not.toContain('pacs');
        });

        it('getLicense() returns the same object after loadLicense()', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'trial', daysFromNow: 15 });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');

            const a = svc.loadLicense();
            const b = svc.getLicense();
            expect(a).toBe(b);
        });
    });

    // ── 3. Valid standard license ─────────────────────────────────────────

    describe('valid standard license', () => {
        it('includes finance, hr, insurance in allowedModules', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'standard', daysFromNow: 365 });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');

            const lic = svc.loadLicense();

            expect(lic.edition).toBe('standard');
            expect(lic.allowedModules).toContain('finance');
            expect(lic.allowedModules).toContain('hr');
            expect(lic.allowedModules).toContain('insurance');
        });
    });

    // ── 4. Expired license ────────────────────────────────────────────────

    describe('expired trial license', () => {
        it('throws on loadLicense() when license has expired', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'trial', daysFromNow: -1 });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            process.env.NODE_ENV           = 'production';
            jest.resetModules();
            const svc = require('../../src/services/licenseService');

            expect(() => svc.loadLicense()).toThrow(/expir/i);
        });

        it('also throws in test environment (license is always enforced)', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'trial', daysFromNow: -5 });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            process.env.NODE_ENV           = 'test';
            jest.resetModules();
            const svc = require('../../src/services/licenseService');

            // licenseService throws on expired keys regardless of environment
            // (tests should use developer edition or a future-dated trial key)
            expect(() => svc.loadLicense()).toThrow(/expir/i);
        });
    });

    // ── 4b. Expiry that happens while the process is running ──────────────
    //
    // The cases above only cover a key that is *already* expired at load time,
    // which throws. The dangerous case is a valid key that expires later: the
    // server is already running, so nothing re-reads it. `daysRemaining` used
    // to be captured once at load and cached, which froze the countdown at its
    // initial value — so trialGuard's 402 branch could never fire and an expired
    // trial was served indefinitely.

    describe('expiry occurring after load', () => {
        const DAY_MS = 86400000;
        let realNow;

        beforeEach(() => { realNow = Date.now; });
        afterEach(() => { Date.now = realNow; });

        function loadTwoDayTrial() {
            const { token, publicKeyPem } = makeKey({ edition: 'trial', daysFromNow: 2 });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            process.env.NODE_ENV           = 'production';
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            svc.loadLicense();
            return svc;
        }

        it('daysRemaining counts down as time passes', () => {
            const svc = loadTwoDayTrial();
            expect(svc.getLicense().daysRemaining).toBe(2);

            Date.now = () => realNow() + 1 * DAY_MS;
            expect(svc.getLicense().daysRemaining).toBe(1);

            Date.now = () => realNow() + 2 * DAY_MS;
            expect(svc.getLicense().daysRemaining).toBe(0);
        });

        it('reaches zero once the licence actually expires', () => {
            const svc = loadTwoDayTrial();

            Date.now = () => realNow() + 3 * DAY_MS;
            expect(svc.getLicense().daysRemaining).toBe(0);
        });

        it('never reports a negative count', () => {
            const svc = loadTwoDayTrial();

            Date.now = () => realNow() + 400 * DAY_MS;
            expect(svc.getLicense().daysRemaining).toBe(0);
        });

        it('trialGuard blocks a request once the trial has expired', () => {
            const svc = loadTwoDayTrial();
            const trialGuard = require('../../src/middleware/trialGuard');

            Date.now = () => realNow() + 3 * DAY_MS;

            let nextCalled = false;
            let status = null;
            trialGuard(
                { method: 'GET', path: '/api/patients', originalUrl: '/api/patients', ip: '::1' },
                { setHeader() {}, status(s) { status = s; return this; }, json() { return this; } },
                () => { nextCalled = true; }
            );

            expect(nextCalled).toBe(false);
            expect(status).toBe(402);
        });

        it('trialGuard still serves the request while the trial is live', () => {
            const svc = loadTwoDayTrial();
            const trialGuard = require('../../src/middleware/trialGuard');

            let nextCalled = false;
            let status = null;
            trialGuard(
                { method: 'GET', path: '/api/patients', originalUrl: '/api/patients', ip: '::1' },
                { setHeader() {}, status(s) { status = s; return this; }, json() { return this; } },
                () => { nextCalled = true; }
            );

            expect(nextCalled).toBe(true);
            expect(status).toBeNull();
        });

        it('leaves /api/license/* readable after expiry so the banner can render', () => {
            // Locking this would leave the user on a bare 402 with no way to
            // see why, since the SPA reads the licence to explain itself.
            loadTwoDayTrial();
            const trialGuard = require('../../src/middleware/trialGuard');

            Date.now = () => realNow() + 3 * DAY_MS;

            // Mounted via app.use('/api', trialGuard), Express strips the mount
            // point, so req.path is '/license/info' while originalUrl keeps
            // '/api/license/info'. Both shapes must be let through.
            for (const path of ['/license/info', '/api/license/info', '/license/activate']) {
                let nextCalled = false;
                trialGuard(
                    { method: 'GET', path, originalUrl: `/api${path}`, ip: '::1' },
                    { setHeader() {}, status() { return this; }, json() { return this; } },
                    () => { nextCalled = true; }
                );
                expect({ path, nextCalled }).toEqual({ path, nextCalled: true });
            }
        });

        it('lets an expired trial establish a session', () => {
            // Regression: trialGuard blocked /api/auth/login once the trial
            // expired. The user could not sign in, so the SPA never booted and
            // the expiry banner and upgrade CTA were unreachable — they just
            // saw a bare 402 on the login screen. Both licence routes require a
            // bearer token, so a session has to be obtainable first.
            loadTwoDayTrial();
            const trialGuard = require('../../src/middleware/trialGuard');

            Date.now = () => realNow() + 3 * DAY_MS;

            for (const path of [
                '/auth/login',
                '/auth/refresh',
                '/auth/logout',
                '/auth/passkeys/authenticate/options',
                '/auth/passkeys/authenticate/verify',
            ]) {
                let nextCalled = false;
                trialGuard(
                    { method: 'POST', path, originalUrl: `/api${path}`, ip: '::1' },
                    { setHeader() {}, status() { return this; }, json() { return this; } },
                    () => { nextCalled = true; }
                );
                expect({ path, nextCalled }).toEqual({ path, nextCalled: true });
            }
        });

        it('does not open other auth-adjacent paths to an expired trial', () => {
            // The exemption is an explicit allowlist, not a prefix match.
            loadTwoDayTrial();
            const trialGuard = require('../../src/middleware/trialGuard');

            Date.now = () => realNow() + 3 * DAY_MS;

            for (const path of ['/auth/register', '/auth/admin/reset-password', '/auth', '/authx/login']) {
                let nextCalled = false;
                trialGuard(
                    { method: 'POST', path, originalUrl: `/api${path}`, ip: '::1' },
                    { setHeader() {}, status() { return this; }, json() { return this; } },
                    () => { nextCalled = true; }
                );
                expect({ path, nextCalled }).toEqual({ path, nextCalled: false });
            }
        });

        it('still blocks non-licence endpoints after expiry', () => {
            // Guards against the exemption above being too permissive.
            loadTwoDayTrial();
            const trialGuard = require('../../src/middleware/trialGuard');

            Date.now = () => realNow() + 3 * DAY_MS;

            let nextCalled = false;
            trialGuard(
                { method: 'GET', path: '/licenses', originalUrl: '/api/licenses', ip: '::1' },
                { setHeader() {}, status() { return this; }, json() { return this; } },
                () => { nextCalled = true; }
            );
            expect(nextCalled).toBe(false);
        });
    });

    // ── 5. Tampered signature ─────────────────────────────────────────────

    describe('tampered license', () => {
        it('throws on signature mismatch', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'trial' });

            // Decode and tamper the payload
            const parsed = JSON.parse(Buffer.from(token, 'base64url').toString());
            parsed.payload.edition = 'enterprise'; // tamper!
            const tampered = Buffer.from(JSON.stringify(parsed)).toString('base64url');

            process.env.LICENSE_KEY        = tampered;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            process.env.NODE_ENV           = 'production';
            jest.resetModules();
            const svc = require('../../src/services/licenseService');

            expect(() => svc.loadLicense()).toThrow(/invalid|tamper|signature/i);
        });
    });

    // ── 6. licenseAllows() feature-gate helper ────────────────────────────

    describe('licenseAllows()', () => {
        it('returns false for premium features on trial license', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'trial' });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            svc.loadLicense();

            expect(svc.licenseAllows('pacs')).toBe(false);
            expect(svc.licenseAllows('insurance')).toBe(false);
            expect(svc.licenseAllows('crm')).toBe(false);
            expect(svc.licenseAllows('inventory')).toBe(false);
            expect(svc.licenseAllows('equipment')).toBe(false);
            expect(svc.licenseAllows('appointments')).toBe(true);
        });

        it('returns true for all features on standard license', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'standard' });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            svc.loadLicense();

            expect(svc.licenseAllows('finance')).toBe(true);
            expect(svc.licenseAllows('hr')).toBe(true);
            expect(svc.licenseAllows('backup')).toBe(true);
            expect(svc.licenseAllows('export')).toBe(true);
        });

        it('returns true for export on enterprise license', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'enterprise' });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            svc.loadLicense();

            expect(svc.licenseAllows('export')).toBe(true);
            expect(svc.licenseAllows('sso')).toBe(true);
            expect(svc.licenseAllows('multi-branch')).toBe(true);
        });
    });

    // ── 7. Export feature gating (Phase: trial watermark & export gate) ────

    describe('export feature gating', () => {
        it('trial license cannot export analytics, audit, or backup data', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'trial' });
            process.env.LICENSE_KEY        = token;
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            svc.loadLicense();

            expect(svc.licenseAllows('export')).toBe(false);
        });

        it('standard and enterprise licenses can export', () => {
            for (const edition of ['standard', 'enterprise']) {
                const { token, publicKeyPem } = makeKey({ edition });
                process.env.LICENSE_KEY        = token;
                process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
                jest.resetModules();
                const svc = require('../../src/services/licenseService');
                svc.loadLicense();

                expect(svc.licenseAllows('export')).toBe(true);
            }
        });
    });

    // ── 8. inspectLicenseKey & applyLicenseKey runtime activation ──────────

    describe('inspectLicenseKey & applyLicenseKey', () => {
        it('persists activation and reloads it instead of a stale environment key', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'standard' });
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            svc.applyLicenseKey(token);
            expect(fs.readFileSync(storageFile, 'utf8')).toBe(token);
            process.env.LICENSE_KEY = 'stale-environment-key';
            jest.resetModules();
            expect(require('../../src/services/licenseService').loadLicense().edition).toBe('standard');
        });

        it('keeps the current license when persistence fails', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'standard' });
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');
            svc.loadLicense();
            const previousKey = process.env.LICENSE_KEY;
            process.env.LICENSE_STORAGE_FILE = path.join(storageFile, 'missing-directory', 'license');
            expect(() => svc.applyLicenseKey(token)).toThrow(/persist/);
            expect(svc.getLicense().edition).toBe('developer');
            expect(process.env.LICENSE_KEY).toBe(previousKey);
        });
        it('inspectLicenseKey verifies valid key and extracts payload without activating', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'standard', daysFromNow: 45, maxUsers: 10 });
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            delete process.env.LICENSE_KEY;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');

            const res = svc.inspectLicenseKey(token);
            expect(res.valid).toBe(true);
            expect(res.payload.edition).toBe('standard');
            expect(res.payload.customerId).toBe('TEST-CLIENT');
            expect(res.payload.maxUsers).toBe(10);
            expect(res.payload.daysRemaining).toBeGreaterThan(40);

            // Active license should still be developer fallback
            expect(svc.getLicense().edition).toBe('developer');
        });

        it('inspectLicenseKey rejects malformed or corrupted key string', () => {
            const svc = require('../../src/services/licenseService');
            const res = svc.inspectLicenseKey('invalid-garbage-key');
            expect(res.valid).toBe(false);
            expect(res.reason).toBeTruthy();
        });

        it('applyLicenseKey activates and persists a new license at runtime', () => {
            const { token, publicKeyPem } = makeKey({ edition: 'standard', daysFromNow: 60, maxUsers: 5 });
            process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
            delete process.env.LICENSE_KEY;
            jest.resetModules();
            const svc = require('../../src/services/licenseService');

            const activated = svc.applyLicenseKey(token, { persist: false });
            expect(activated.edition).toBe('standard');
            expect(activated.customerId).toBe('TEST-CLIENT');
            expect(svc.getLicense().edition).toBe('standard');
            expect(svc.licenseAllows('finance')).toBe(true);
        });
    });
});
