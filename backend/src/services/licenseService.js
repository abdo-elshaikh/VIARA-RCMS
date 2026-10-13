/**
 * licenseService.js
 * -----------------
 * Core license engine for VIARA RCMS.
 *
 * ARCHITECTURE
 * ============
 * Licenses are signed JSON payloads encoded as Base64.
 * The payload is signed with an ECDSA P-256 private key that lives ONLY with
 * the vendor.  The corresponding public key is embedded below and used by the
 * application to verify authenticity without being able to forge a new key.
 *
 * LICENSE PAYLOAD SCHEMA
 * ======================
 * {
 *   v:          1                          // schema version
 *   customerId: "ORG-abc123"               // client identifier
 *   edition:    "trial"|"standard"|"enterprise"
 *   issuedAt:   "2026-01-01T00:00:00Z"
 *   expiresAt:  "2026-12-31T23:59:59Z"    // null = perpetual
 *   maxUsers:   3                          // -1 = unlimited
 *   fingerprint: "sha256hex..."            // null = no hardware lock
 *   allowedModules: ["appointments",...]   // null = use edition defaults
 * }
 *
 * GENERATING A KEY PAIR (one-time setup — run as vendor)
 * ======================================================
 *   node scripts/generate-keypair.js
 * → Copy the public key PEM output into LICENSE_PUBLIC_KEY below.
 * → Store the private key securely (never commit it).
 *
 * GENERATING A LICENSE KEY (vendor tool)
 * =======================================
 *   node scripts/generate-license.js --edition trial --days 30 --max-users 3
 *
 * ACTIVATION FLOW
 * ===============
 * 1. Server starts → loadLicense() reads LICENSE_KEY from .env
 * 2. Signature is verified with the embedded public key
 * 3. Expiry and hardware fingerprint are checked
 * 4. Result is stored in app.locals.license (set by server.js)
 * 5. trialGuard.js and checkFeature() read from app.locals.license
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');
const { getFingerprint } = require('../utils/hardwareFingerprint');
const { editionHasFeature, EDITION_FEATURES } = require('../config/featureFlags');

// ---------------------------------------------------------------------------
// Embedded vendor public key (ECDSA P-256).
// Replace this placeholder with the real PEM after running generate-keypair.js
// ---------------------------------------------------------------------------
const LICENSE_PUBLIC_KEY_PEM = process.env.LICENSE_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIxwkGOCkh/vLEK2zgbWpi5s0u++E
uZjlZ8hz+k58FLRcxN+07BtGRdriObVdxsdmSn7D8imUKeB0KyU4VgcLlw==
-----END PUBLIC KEY-----`;

// ---------------------------------------------------------------------------
// Path where hardware-lock activation data is persisted
// ---------------------------------------------------------------------------
function getActivationFile() {
    return path.resolve(
        process.env.__VIARA_ACTIVATION_PATH ||
        process.env.LICENSE_ACTIVATION_FILE ||
        path.join(__dirname, '../../../.viara-activation')
    );
}

// ---------------------------------------------------------------------------
// Path where uploaded/activated license key is persisted
// ---------------------------------------------------------------------------
function getLicenseStorageFile() {
    return path.resolve(
        process.env.LICENSE_STORAGE_FILE ||
        path.join(__dirname, '../../../.viara-license')
    );
}

function isLocalDevelopmentEnvironment() {
    const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
    const appEnv = String(process.env.APP_ENV || process.env.VIARA_ENV || '').toLowerCase();
    const localOverride = String(process.env.VIARA_LOCAL_DEVELOPMENT || process.env.VIARA_ALLOW_DEV_LICENSE || '').toLowerCase();
    const configuredHost = [
        process.env.HOST,
        process.env.API_HOST,
        process.env.CLIENT_URL,
        process.env.PORTAL_CLIENT_URL,
        process.env.WEBAUTHN_ORIGIN,
        process.env.BASE_URL,
        process.env.APP_URL,
    ].filter(Boolean).join(' ').toLowerCase();

    const isLocalHost = /(^|[/:.])localhost(:|\/|$)|127\.0\.0\.1|::1|0\.0\.0\.0|\[::1\]/.test(configuredHost);
    const isTrustedNodeEnv = ['test', 'development', 'dev', 'local'].includes(nodeEnv) || ['test', 'development', 'dev', 'local'].includes(appEnv);
    const isExplicitOverride = ['true', '1', 'yes', 'local', 'localhost'].includes(localOverride);

    return isExplicitOverride || (isTrustedNodeEnv && (isLocalHost || !configuredHost));
}

function getBlankDeveloperLicense() {
    return {
        edition: 'developer',
        customerId: 'DEVELOPER',
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        maxUsers: -1,
        maxBranches: -1,
        multiBranchAllowed: true,
        allowedModules: ['*'],
        daysRemaining: null,
        _source: 'dev-fallback',
    };
}

// ---------------------------------------------------------------------------
// In-memory cache of the verified license (populated at startup)
// ---------------------------------------------------------------------------
let _license = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode and parse the Base64-encoded license payload.
 * @param {string} licenseKey
 * @returns {{ payload: object, signature: Buffer }}
 */
function _decodeLicenseKey(licenseKey) {
    let raw;
    try {
        raw = JSON.parse(Buffer.from(licenseKey.trim(), 'base64url').toString('utf8'));
    } catch {
        try {
            raw = JSON.parse(Buffer.from(licenseKey.trim(), 'base64').toString('utf8'));
        } catch {
            throw new Error('License key is not valid Base64 JSON');
        }
    }

    if (!raw || typeof raw !== 'object' || !raw.payload || !raw.signature) {
        throw new Error('License key is malformed (missing payload or signature)');
    }

    return {
        payload: raw.payload,
        signature: Buffer.from(raw.signature, 'base64'),
    };
}

/**
 * Verify the ECDSA signature over the stringified payload.
 * @param {object} payload
 * @param {Buffer} signature
 * @returns {boolean}
 */
function _verifySignature(payload, signature) {
    try {
        const data = Buffer.from(JSON.stringify(payload), 'utf8');
        const pubKey = process.env.LICENSE_PUBLIC_KEY || LICENSE_PUBLIC_KEY_PEM;
        const publicKey = crypto.createPublicKey(pubKey);
        return crypto.verify('SHA256', data, publicKey, signature);
    } catch {
        return false;
    }
}

const DEFAULT_GRACE_PERIOD_DAYS = 14;

/**
 * Compute real-time validity, daysRemaining, grace period status, and expiration (MBT-309).
 * Standard and Enterprise production licenses grant a 14-day continuity-of-care grace period.
 * Trial licenses have 0 days grace period by default.
 *
 * @param {object} payload
 * @returns {{ daysRemaining: number|null, inGracePeriod: boolean, graceDaysRemaining: number|null, isExpired: boolean }}
 */
function _calculateValidity(payload) {
    let daysRemaining = null;
    let inGracePeriod = false;
    let graceDaysRemaining = null;
    let isExpired = false;

    if (payload.expiresAt) {
        const expiry = new Date(payload.expiresAt);
        const msLeft = expiry.getTime() - Date.now();
        const graceDays = payload.gracePeriodDays !== undefined
            ? payload.gracePeriodDays
            : (payload.edition === 'trial' ? 0 : DEFAULT_GRACE_PERIOD_DAYS);
        const graceMs = graceDays * 86400000;

        if (msLeft >= 0) {
            daysRemaining = Math.max(0, Math.ceil(msLeft / 86400000));
            inGracePeriod = false;
            graceDaysRemaining = null;
            isExpired = false;
        } else if (graceMs > 0 && Math.abs(msLeft) <= graceMs) {
            daysRemaining = 0;
            inGracePeriod = true;
            graceDaysRemaining = Math.max(0, Math.ceil((graceMs - Math.abs(msLeft)) / 86400000));
            isExpired = false;
        } else {
            daysRemaining = 0;
            inGracePeriod = false;
            graceDaysRemaining = 0;
            isExpired = true;
        }
    }

    return { daysRemaining, inGracePeriod, graceDaysRemaining, isExpired };
}

/**
 * Validate the semantic fields of a decoded payload.
 * @param {object} payload
 * @returns {{ valid: boolean, reason?: string, inGracePeriod?: boolean, graceDaysRemaining?: number|null, expired?: boolean }}
 */
function _validatePayload(payload) {
    if (payload.edition === 'trial' && !payload.expiresAt) {
        return { valid: false, reason: 'Trial licenses must have an expiresAt date' };
    }
    if (payload.allowedModules != null && (!Array.isArray(payload.allowedModules)
        || payload.allowedModules.some(module => typeof module !== 'string'))) {
        return { valid: false, reason: 'allowedModules must be an array of strings' };
    }
    if (!payload.edition || !['trial', 'standard', 'enterprise', 'developer'].includes(payload.edition)) {
        return { valid: false, reason: `Unknown edition: ${payload.edition}` };
    }

    if (payload.expiresAt) {
        const expiry = new Date(payload.expiresAt);
        if (isNaN(expiry.getTime())) {
            return { valid: false, reason: 'expiresAt is not a valid ISO date' };
        }
        const { isExpired } = _calculateValidity(payload);
        if (isExpired) {
            return { valid: false, reason: 'License has expired', expired: true };
        }
    }

    if (payload.maxUsers !== undefined && payload.maxUsers !== -1
        && (!Number.isInteger(payload.maxUsers) || payload.maxUsers < 1)) {
        return { valid: false, reason: 'maxUsers must be an integer or -1' };
    }

    if (payload.maxBranches !== undefined && payload.maxBranches !== -1
        && (!Number.isInteger(payload.maxBranches) || payload.maxBranches < 1)) {
        return { valid: false, reason: 'maxBranches must be an integer >= 1 or -1' };
    }

    const { inGracePeriod, graceDaysRemaining } = _calculateValidity(payload);
    return { valid: true, ...(inGracePeriod ? { inGracePeriod: true, graceDaysRemaining } : {}) };
}

/**
 * Check (and persist) hardware fingerprint binding.
 * Supports High Availability (HA) standby nodes and clustered deployments (MBT-310).
 *
 * @param {object} payload  – Decoded license payload
 */
function _checkHardwareBinding(payload) {
    const clusterKey = process.env.HA_CLUSTER_KEY;
    const allowedFingerprints = (process.env.HA_ALLOWED_FINGERPRINTS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    // If the license explicitly includes a fingerprint, verify either the primary machine
    // or an authorized HA standby node / cluster key (MBT-310).
    if (payload.fingerprint) {
        const current = getFingerprint();
        const matchesPrimary = current === payload.fingerprint;
        const matchesHaList = Array.isArray(payload.haFingerprints) && payload.haFingerprints.includes(current);
        const matchesHaNodes = Array.isArray(payload.haNodes) && payload.haNodes.includes(current);
        const matchesEnvList = allowedFingerprints.includes(current);
        const matchesCluster = Boolean(clusterKey && payload.clusterKey && payload.clusterKey === clusterKey);

        if (!matchesPrimary && !matchesHaList && !matchesHaNodes && !matchesEnvList && !matchesCluster) {
            throw new Error(
                'License is locked to a different machine. ' +
                'Contact VIARA support to transfer your license or authorize HA standby nodes.'
            );
        }
        return;
    }

    // No fingerprint in license → use activation-file based binding.
    // (Skip binding for developer edition so devs can run freely.)
    if (payload.edition === 'developer') return;

    const current = getFingerprint();
    const activationFile = getActivationFile();

    if (fs.existsSync(activationFile)) {
        const saved = fs.readFileSync(activationFile, 'utf8').trim();
        const matchesSaved = saved === current;
        const matchesEnvList = allowedFingerprints.includes(current);
        const matchesCluster = Boolean(clusterKey && (saved === clusterKey || process.env.CLUSTER_NODE_ID));

        if (!matchesSaved && !matchesEnvList && !matchesCluster) {
            if (isLocalDevelopmentEnvironment()) {
                logger.warn(`⚠️ Hardware fingerprint updated for local development environment (${saved.slice(0, 8)}... -> ${current.slice(0, 8)}...)`);
                try {
                    fs.writeFileSync(activationFile, current, { encoding: 'utf8', mode: 0o600 });
                } catch (err) {
                    logger.warn(`⚠️ Could not persist hardware activation: ${err.message}`);
                }
                return;
            }
            throw new Error(
                'This installation has been activated on a different machine. ' +
                'Contact VIARA support to transfer your license.'
            );
        }
    } else {
        // First activation — record the fingerprint
        try {
            fs.writeFileSync(activationFile, current, { encoding: 'utf8', mode: 0o600 });
            logger.info(`✅ License activated and bound to this machine (fingerprint saved)`);
        } catch (err) {
            // Non-fatal on systems where we cannot write (read-only volumes etc.)
            logger.warn(`⚠️  Could not persist hardware activation: ${err.message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load, verify, and cache the license from the LICENSE_KEY environment variable.
 *
 * This function should be called ONCE at startup before the HTTP server begins
 * accepting requests.  It stores the result in module-level `_license`.
 *
 * @returns {object}  The verified license object (also available via getLicense())
 * @throws  {Error}   If the license is missing, invalid, tampered with, or expired
 */
function loadLicense() {
    let rawKey = process.env.LICENSE_KEY;
    const storageFile = getLicenseStorageFile();

    // Check saved license file if not present in environment
    if (fs.existsSync(storageFile)) {
        try {
            const savedKey = fs.readFileSync(storageFile, 'utf8').trim();
            if (savedKey) {
                rawKey = savedKey;
                process.env.LICENSE_KEY = rawKey;
            }
        } catch (err) {
            logger.warn(`⚠️ Could not read ${storageFile}: ${err.message}`);
        }
    }

    // -----------------------------------------------------------------------
    // Developer / Test fallback
    // ONLY allow unrestricted developer mode for true local/test environments.
    // Hosted or staging deployments must always provide a valid LICENSE_KEY.
    // -----------------------------------------------------------------------
    if (!rawKey) {
        if (!isLocalDevelopmentEnvironment()) {
            throw new Error(
                '❌ LICENSE_KEY is required in this environment. ' +
                'Developer fallback is only allowed in local development.'
            );
        }

        logger.warn('⚠️  No LICENSE_KEY set — running in local DEVELOPER mode');
        _license = getBlankDeveloperLicense();
        return _license;
    }

    // -----------------------------------------------------------------------
    // Decode
    // -----------------------------------------------------------------------
    const { payload, signature } = _decodeLicenseKey(rawKey);

    // -----------------------------------------------------------------------
    // Verify signature
    // -----------------------------------------------------------------------
    // In development, skip the real cryptographic check so teams can use a
    // simple unsigned test key without needing the private key infrastructure.
    const signatureOk = _verifySignature(payload, signature);

    if (!signatureOk) {
        {
            throw new Error(
                '❌ License signature verification failed. ' +
                'The key may have been tampered with or issued by an unknown party.'
            );
        }
    }

    // -----------------------------------------------------------------------
    // Validate payload fields
    // -----------------------------------------------------------------------
    const { valid, reason, expired } = _validatePayload(payload);
    if (!valid) {
        if (expired) {
            throw new Error(`❌ License expired. ${reason}`);
        }
        throw new Error(`❌ Invalid license: ${reason}`);
    }

    // -----------------------------------------------------------------------
    // Hardware binding check
    // -----------------------------------------------------------------------
    _checkHardwareBinding(payload);

    // -----------------------------------------------------------------------
    // Compute derived fields
    // -----------------------------------------------------------------------
    const { daysRemaining, inGracePeriod, graceDaysRemaining, isExpired } = _calculateValidity(payload);

    const allowedModules = payload.allowedModules ||
        (EDITION_FEATURES[payload.edition] || EDITION_FEATURES.trial);

    const multiBranchAllowed = Boolean(
        allowedModules.includes('multi-branch') ||
        allowedModules.includes('*') ||
        payload.edition === 'developer'
    );

    let maxBranches = 1;
    if (payload.maxBranches !== undefined) {
        maxBranches = payload.maxBranches;
    } else if (payload.edition === 'developer') {
        maxBranches = -1;
    } else if (payload.edition === 'enterprise' && multiBranchAllowed) {
        maxBranches = -1;
    } else {
        maxBranches = 1;
    }

    // -----------------------------------------------------------------------
    // Cache and return
    // -----------------------------------------------------------------------
    _license = {
        ...payload,
        allowedModules,
        daysRemaining,
        inGracePeriod,
        graceDaysRemaining,
        isExpired,
        maxBranches,
        multiBranchAllowed,
        _source: 'verified',
    };

    logger.info(
        `✅ License verified — edition: ${_license.edition}, ` +
        `customer: ${_license.customerId}, ` +
        `expires: ${_license.expiresAt || 'never'}`
    );

    if (_license.edition === 'trial' && daysRemaining !== null && daysRemaining <= 7) {
        logger.warn(`⚠️  Trial license expires in ${daysRemaining} day(s)`);
    }

    return _license;
}

/**
 * Inspect a raw license key string without applying it.
 * Pre-flight verification for UI preview when uploading a .txt file or pasting a key.
 *
 * @param {string} rawKey
 * @returns {{ valid: boolean, reason?: string, expired?: boolean, payload?: object }}
 */
function inspectLicenseKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') {
        return { valid: false, reason: 'مفتاح الترخيص فارغ أو غير صالح' };
    }

    try {
        const trimmed = rawKey.trim();
        const { payload, signature } = _decodeLicenseKey(trimmed);
        const signatureOk = _verifySignature(payload, signature);

        if (!signatureOk) {
            return { valid: false, reason: 'فشل التحقق من التوقيع الرقمي للمفتاح — المفتاح غير معتمد أو تم تعديله' };
        }

        const { valid, reason, expired } = _validatePayload(payload);
        if (!valid) {
            return { valid: false, reason: expired ? 'انتهت صلاحية هذا الترخيص' : reason, expired };
        }

        const { daysRemaining, inGracePeriod, graceDaysRemaining, isExpired } = _calculateValidity(payload);

        const allowedModules = payload.allowedModules ||
            (EDITION_FEATURES[payload.edition] || EDITION_FEATURES.trial);

        const multiBranchAllowed = Boolean(
            allowedModules.includes('multi-branch') ||
            allowedModules.includes('*') ||
            payload.edition === 'developer'
        );

        let maxBranches = 1;
        if (payload.maxBranches !== undefined) {
            maxBranches = payload.maxBranches;
        } else if (payload.edition === 'developer') {
            maxBranches = -1;
        } else if (payload.edition === 'enterprise' && multiBranchAllowed) {
            maxBranches = -1;
        } else {
            maxBranches = 1;
        }

        return {
            valid: true,
            payload: {
                customerId: payload.customerId,
                organizationId: payload.organizationId || null,
                edition: payload.edition,
                issuedAt: payload.issuedAt,
                expiresAt: payload.expiresAt,
                daysRemaining,
                inGracePeriod,
                graceDaysRemaining,
                isExpired,
                maxUsers: payload.maxUsers,
                maxBranches,
                multiBranchAllowed,
                allowedModules,
                isTrial: payload.edition === 'trial',
            }
        };
    } catch (err) {
        return { valid: false, reason: err.message || 'تعذّر قراءة أو فك تشفير مفتاح الترخيص' };
    }
}

/**
 * Apply and activate a new license key at runtime.
 * Updates in-memory license cache immediately and persists to disk.
 *
 * @param {string} rawKey
 * @param {{ persist?: boolean }} options
 * @returns {object} The newly activated license object
 */
function applyLicenseKey(rawKey, { persist = true } = {}) {
    if (!rawKey || typeof rawKey !== 'string') {
        throw new Error('مفتاح الترخيص فارغ أو غير صالح');
    }

    const trimmed = rawKey.trim();
    const { payload, signature } = _decodeLicenseKey(trimmed);
    const signatureOk = _verifySignature(payload, signature);

    if (!signatureOk) {
        {
            throw new Error('فشل التحقق من التوقيع الرقمي للترخيص — المفتاح غير معتمد أو تم تعديله');
        }
    }

    const { valid, reason, expired } = _validatePayload(payload);
    if (!valid) {
        if (expired) {
            throw new Error(`انتهت صلاحية هذا الترخيص: ${reason}`);
        }
        throw new Error(`مفتاح الترخيص غير صالح: ${reason}`);
    }

    _checkHardwareBinding(payload);

    const { daysRemaining, inGracePeriod, graceDaysRemaining, isExpired } = _calculateValidity(payload);

    const allowedModules = payload.allowedModules ||
        (EDITION_FEATURES[payload.edition] || EDITION_FEATURES.trial);

    // Persist before publishing the new license. A failed disk write must not
    // report successful activation or replace the current in-memory key.
    if (persist) {
        const storageFile = getLicenseStorageFile();
        const temporaryFile = `${storageFile}.${crypto.randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporaryFile, trimmed, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            fs.renameSync(temporaryFile, storageFile);
        } catch (err) {
            try { fs.unlinkSync(temporaryFile); } catch { /* already absent */ }
            throw new Error('Could not persist license activation', { cause: err });
        }
    }

    const multiBranchAllowed = Boolean(
        allowedModules.includes('multi-branch') ||
        allowedModules.includes('*') ||
        payload.edition === 'developer'
    );

    let maxBranches = 1;
    if (payload.maxBranches !== undefined) {
        maxBranches = payload.maxBranches;
    } else if (payload.edition === 'developer') {
        maxBranches = -1;
    } else if (payload.edition === 'enterprise' && multiBranchAllowed) {
        maxBranches = -1;
    } else {
        maxBranches = 1;
    }

    _license = {
        ...payload,
        allowedModules,
        daysRemaining,
        inGracePeriod,
        graceDaysRemaining,
        isExpired,
        maxBranches,
        multiBranchAllowed,
        _source: 'activated',
    };
    process.env.LICENSE_KEY = trimmed;

    logger.info(
        `✅ License successfully activated at runtime — edition: ${_license.edition}, ` +
        `customer: ${_license.customerId}, expires: ${_license.expiresAt || 'never'}`
    );

    return _license;
}

/**
 * Return the cached license loaded at startup.
 * Returns a safe developer fallback if loadLicense() was never called
 * (e.g. during Jest unit tests).
 *
 * @returns {object}
 */
function getLicense() {
    if (!_license) {
        if (!isLocalDevelopmentEnvironment()) {
            throw new Error('License must be loaded before serving requests in this environment');
        }
        return {
            ...getBlankDeveloperLicense(),
            _source: 'test-fallback',
        };
    }

    // Recompute on every read rather than trusting the value captured at load
    // time. Caching it meant a long-running server never noticed its own trial
    // had expired: daysRemaining stayed frozen, trialGuard's 402 branch could
    // never fire, and an expired trial was served indefinitely. The countdown
    // banner showed the same stale number for the life of the process.
    if (_license.expiresAt) {
        const { daysRemaining, inGracePeriod, graceDaysRemaining, isExpired } = _calculateValidity(_license);
        _license.daysRemaining = daysRemaining;
        _license.inGracePeriod = inGracePeriod;
        _license.graceDaysRemaining = graceDaysRemaining;
        _license.isExpired = isExpired;
    }

    return _license;
}

/**
 * Convenience: check whether the active license allows a specific feature.
 *
 * @param {string} feature
 * @returns {boolean}
 */
function licenseAllows(feature) {
    const lic = getLicense();
    if (!lic) return false;
    if (lic.allowedModules.includes('*')) return true;
    return lic.allowedModules.includes(feature);
}

module.exports = { loadLicense, getLicense, licenseAllows, inspectLicenseKey, applyLicenseKey, getLicenseStorageFile, getActivationFile };
