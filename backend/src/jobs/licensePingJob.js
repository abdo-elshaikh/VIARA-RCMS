/**
 * licensePingJob.js
 * -----------------
 * Background job — Phase 5
 * ========================
 * Runs every 24 hours to verify the active license is still valid.
 * For cloud-issued licenses it optionally sends a PING to the vendor's
 * license server; for offline licenses it re-validates locally.
 *
 * Failure behaviour
 * -----------------
 *   ≥ 3 consecutive failures → log a WARN (admin notification hook)
 *   ≥ 7 consecutive failures → switch to read-only advisory mode
 *                              (the server stays up but warns on every response)
 *
 * Environment variables
 * ---------------------
 *   LICENSE_PING_INTERVAL_MS  — default: 24 h
 *   LICENSE_PING_URL          — optional cloud ping endpoint
 *   LICENSE_PING_ENABLED      — set to "false" to disable (dev/test)
 */

'use strict';

const logger      = require('../config/logger');
const { getLicense, loadLicense } = require('../services/licenseService');

const INTERVAL_MS       = Number(process.env.LICENSE_PING_INTERVAL_MS || 24 * 60 * 60 * 1000);
const WARN_AFTER        = 3;
const READ_ONLY_AFTER   = 7;
const PING_URL          = process.env.LICENSE_PING_URL || null;

let consecutiveFailures = 0;
let isReadOnlyAdvisory  = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Perform a local re-validation of the cached license.
 * @returns {{ ok: boolean, reason?: string }}
 */
function _localCheck() {
    try {
        const lic = getLicense();
        if (!lic) return { ok: false, reason: 'No license loaded' };

        if (lic.edition === 'developer') return { ok: true };

        if (lic.expiresAt) {
            const daysLeft = Math.ceil(
                (new Date(lic.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            if (daysLeft <= 0) {
                return { ok: false, reason: `License expired ${Math.abs(daysLeft)} day(s) ago` };
            }
        }

        return { ok: true };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
}

/**
 * Send a PING to the vendor's cloud license server (if configured).
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function _cloudPing() {
    if (!PING_URL) return { ok: true }; // no cloud server configured

    const lic = getLicense();
    try {
        const https   = require('https');
        const url     = new URL(PING_URL);
        const body    = JSON.stringify({
            customerId: lic?.customerId,
            edition:    lic?.edition,
            issuedAt:   lic?.issuedAt,
        });

        await new Promise((resolve, reject) => {
            const req = https.request(
                { hostname: url.hostname, path: url.pathname, method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
                (res) => {
                    res.resume();
                    if (res.statusCode === 200) resolve();
                    else reject(new Error(`Ping returned HTTP ${res.statusCode}`));
                }
            );
            req.setTimeout(10000, () => reject(new Error('Ping timed out')));
            req.on('error', reject);
            req.write(body);
            req.end();
        });

        return { ok: true };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
}

// ---------------------------------------------------------------------------
// Main ping routine
// ---------------------------------------------------------------------------

async function runPing(pool) {
    const local = _localCheck();
    const cloud = await _cloudPing();

    const ok = local.ok && cloud.ok;
    const reason = !local.ok ? local.reason : !cloud.ok ? cloud.reason : null;

    if (ok) {
        consecutiveFailures = 0;
        isReadOnlyAdvisory  = false;
        const lic = getLicense();
        logger.info(`✅ License ping OK — edition: ${lic?.edition}, expires: ${lic?.expiresAt || 'never'}`);
    } else {
        consecutiveFailures++;
        logger.warn(`⚠️  License ping failed (attempt ${consecutiveFailures}): ${reason}`);

        if (consecutiveFailures >= READ_ONLY_AFTER) {
            isReadOnlyAdvisory = true;
            logger.error(
                `❌ License ping failed ${consecutiveFailures} consecutive times. ` +
                'Switching to read-only advisory mode.'
            );
        } else if (consecutiveFailures >= WARN_AFTER) {
            logger.warn(
                `⚠️  License ping failed ${consecutiveFailures} times. ` +
                'Check your LICENSE_KEY and internet connectivity.'
            );
        }
    }

    return { ok, reason, consecutiveFailures, isReadOnlyAdvisory };
}

// ---------------------------------------------------------------------------
// Read-only advisory header (used by trialGuard to attach a warning header)
// ---------------------------------------------------------------------------

/** Returns true when the license server is unreachable for too long */
function isLicenseReadOnlyAdvisory() {
    return isReadOnlyAdvisory;
}

// ---------------------------------------------------------------------------
// Job lifecycle
// ---------------------------------------------------------------------------

const startLicensePingJob = (pool) => {
    if (String(process.env.LICENSE_PING_ENABLED || 'true').toLowerCase() === 'false') {
        logger.info('License ping job disabled (LICENSE_PING_ENABLED=false)');
        return () => {};
    }

    const edition = getLicense()?.edition;
    if (edition === 'developer') {
        logger.info('License ping job skipped — developer edition');
        return () => {};
    }

    logger.info(`🔔 License ping job started (every ${Math.round(INTERVAL_MS / 3600000)}h)`);

    // First ping after 5 minutes to allow DB to settle
    const warmup  = setTimeout(() => runPing(pool), 5 * 60 * 1000);
    const interval = setInterval(() => runPing(pool), INTERVAL_MS);

    return () => {
        clearTimeout(warmup);
        clearInterval(interval);
    };
};

module.exports = { startLicensePingJob, isLicenseReadOnlyAdvisory, runPing };
