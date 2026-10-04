/**
 * quotaService.js
 * ---------------
 * Enforces hard usage limits for trial-edition licenses.
 * For non-trial editions all checks return true immediately.
 *
 * Checked quotas (Trial only):
 *   - Total patients    ≤ TRIAL_QUOTAS.MAX_PATIENTS  (default 50)
 *   - Appointments/month ≤ TRIAL_QUOTAS.MAX_APPOINTMENTS_PER_MONTH (default 100)
 *   - Active users      ≤ TRIAL_QUOTAS.MAX_USERS     (default 3)
 *   - Reports/day       ≤ TRIAL_QUOTAS.MAX_REPORTS_PER_DAY (default 10)
 *
 * Usage
 * =====
 *   const { assertQuota } = require('../services/quotaService');
 *
 *   // In a controller, before creating a record:
 *   await assertQuota(pool, 'patients');       // throws 402 if over limit
 *   await assertQuota(pool, 'appointments');
 *   await assertQuota(pool, 'users');
 *   await assertQuota(pool, 'reports');
 *
 * Or use the ready-made Express middleware factories:
 *   router.post('/', quotaMiddleware(pool, 'patients'), createPatient(pool));
 */

'use strict';

const { getLicense } = require('./licenseService');
const { TRIAL_QUOTAS } = require('../config/featureFlags');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const UPGRADE_URL = process.env.UPGRADE_URL || 'https://viara.net/upgrade';

// ---------------------------------------------------------------------------
// Internal helpers — count current usage from DB
// ---------------------------------------------------------------------------

async function _countPatients(pool) {
    const r = await pool.query('SELECT COUNT(*) AS n FROM patients WHERE is_active = TRUE');
    return parseInt(r.rows[0]?.n || '0', 10);
}

async function _countAppointmentsThisMonth(pool) {
    const r = await pool.query(`
        SELECT COUNT(*) AS n
        FROM   appointments
        WHERE  DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
    `);
    return parseInt(r.rows[0]?.n || '0', 10);
}

async function _countActiveUsers(pool) {
    const r = await pool.query('SELECT COUNT(*) AS n FROM users WHERE is_active = TRUE');
    return parseInt(r.rows[0]?.n || '0', 10);
}

async function _countReportsToday(pool) {
    const r = await pool.query(`
        SELECT COUNT(*) AS n
        FROM   examinations
        WHERE  report_finalized_at >= CURRENT_DATE
    `);
    return parseInt(r.rows[0]?.n || '0', 10);
}

// ---------------------------------------------------------------------------
// Quota registry
// ---------------------------------------------------------------------------

/** @type {Record<string, { count: (pool: any) => Promise<number>, limit: number, label: string }>} */
const QUOTA_REGISTRY = {
    patients: {
        count: _countPatients,
        get limit() { return TRIAL_QUOTAS.MAX_PATIENTS; },
        label: 'patients',
        message: `لقد وصلت إلى الحد الأقصى للمرضى في النسخة التجريبية (${TRIAL_QUOTAS.MAX_PATIENTS} مرضى).`,
    },
    appointments: {
        count: _countAppointmentsThisMonth,
        get limit() { return TRIAL_QUOTAS.MAX_APPOINTMENTS_PER_MONTH; },
        label: 'appointments/month',
        message: `لقد وصلت إلى الحد الأقصى للمواعيد هذا الشهر في النسخة التجريبية (${TRIAL_QUOTAS.MAX_APPOINTMENTS_PER_MONTH} مواعيد).`,
    },
    users: {
        count: _countActiveUsers,
        get limit() { return TRIAL_QUOTAS.MAX_USERS; },
        label: 'active users',
        message: `لقد وصلت إلى الحد الأقصى للمستخدمين في النسخة التجريبية (${TRIAL_QUOTAS.MAX_USERS} مستخدمين).`,
    },
    reports: {
        count: _countReportsToday,
        get limit() { return TRIAL_QUOTAS.MAX_REPORTS_PER_DAY; },
        label: 'reports/day',
        message: `لقد وصلت إلى الحد الأقصى للتقارير اليومية في النسخة التجريبية (${TRIAL_QUOTAS.MAX_REPORTS_PER_DAY} تقارير).`,
    },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a named quota and throw an AppError (402) if the trial limit is hit.
 * For non-trial editions this function is a no-op.
 *
 * @param {import('pg').Pool} pool
 * @param {'patients'|'appointments'|'users'|'reports'} quotaName
 * @throws {AppError} HTTP 402 with quota details
 */
async function assertQuota(pool, quotaName, { transaction = false } = {}) {
    const license = getLicense();

    // Only enforce quotas for trial edition
    if (!license || license.edition !== 'trial') return;

    const quota = QUOTA_REGISTRY[quotaName];
    if (!quota) {
        logger.warn(`quotaService: unknown quota name "${quotaName}"`);
        return;
    }

    let current;
    try {
        // A transaction-scoped lock serializes count + insert across backend
        // processes. Callers must hold this same client until COMMIT/ROLLBACK.
        if (transaction) {
            await pool.query('SELECT pg_advisory_xact_lock($1, $2)', [
                867421, Object.keys(QUOTA_REGISTRY).indexOf(quotaName),
            ]);
        }
        current = await quota.count(pool);
    } catch (dbErr) {
        logger.warn(`quotaService: quota verification unavailable [${quota.label}]`, { error: dbErr.message });
        throw new AppError('Trial quota verification is temporarily unavailable. Please retry.', 503, {
            code: 'trial_quota_unavailable', quota: quotaName,
        });
    }

    const limit = license.maxUsers !== undefined && quotaName === 'users'
        ? license.maxUsers   // honour per-license user cap if set
        : quota.limit;

    logger.debug(`Quota check [${quota.label}]: ${current}/${limit}`);

    if (limit !== -1 && current >= limit) {
        logger.warn(`Trial quota exceeded [${quota.label}]: ${current}/${limit}`);
        throw new AppError(
            `${quota.message} يرجى الترقية للاستمرار.`,
            402,
            {
                code: 'trial_quota_exceeded',
                quota: quotaName,
                current,
                limit,
                upgradeUrl: UPGRADE_URL,
            }
        );
    }
}

/**
 * Express middleware factory — checks a quota before the route handler runs.
 *
 * @param {import('pg').Pool} pool
 * @param {'patients'|'appointments'|'users'|'reports'} quotaName
 * @returns {import('express').RequestHandler}
 *
 * @example
 *   router.post('/patients', quotaMiddleware(pool, 'patients'), createPatient(pool));
 */
function quotaMiddleware(pool, quotaName) {
    return async (req, res, next) => {
        try {
            await assertQuota(pool, quotaName);
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Returns current usage stats for all quotas (trial only).
 * Used by the admin dashboard to show usage gauges.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<Record<string, { current: number, limit: number, percent: number }>>}
 */
async function getQuotaStats(pool) {
    const license = getLicense();
    if (!license || license.edition !== 'trial') return {};

    const results = {};
    for (const [name, quota] of Object.entries(QUOTA_REGISTRY)) {
        const current = await quota.count(pool);
        const limit = name === 'users' && license.maxUsers > 0
            ? license.maxUsers
            : quota.limit;
        results[name] = {
            current,
            limit,
            percent: Math.round((current / limit) * 100),
        };
    }
    return results;
}

async function withQuotaTransaction(pool, name, operation) {
    if (getLicense()?.edition !== 'trial') return operation(pool);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await assertQuota(client, name, { transaction: true });
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* retain original error */ }
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { assertQuota, quotaMiddleware, getQuotaStats, withQuotaTransaction };
