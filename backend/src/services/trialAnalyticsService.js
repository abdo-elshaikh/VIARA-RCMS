/**
 * trialAnalyticsService.js
 * ------------------------
 * Phase 6 — Trial Usage Analytics
 * =================================
 * Tracks how trial customers interact with VIARA so the sales team can:
 *   1. Identify engaged prospects vs cold trials
 *   2. See which blocked features they tried to access (conversion signals)
 *   3. Get a weekly summary email per active trial
 *
 * Architecture
 * ------------
 * Events are written to the `trial_analytics_events` table (created by
 * the migration in database/migrations/trial_analytics.sql).
 *
 * If the table does not exist (non-trial production systems) all writes
 * are silently skipped — no errors propagate to the caller.
 *
 * Public API
 * ----------
 *   trackEvent(pool, event)          — record one event (fire-and-forget)
 *   getWeeklySummary(pool)           — returns aggregated stats for the week
 *   getTrialDashboardStats(pool)     — current usage + engagement score
 */

'use strict';

const logger    = require('../config/logger');
const { getLicense } = require('./licenseService');

// ---------------------------------------------------------------------------
// Schema bootstrap (idempotent)
// ---------------------------------------------------------------------------

let schemaEnsured = false;

async function ensureSchema(pool) {
    if (schemaEnsured) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS trial_analytics_events (
                id            BIGSERIAL PRIMARY KEY,
                occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                event_type    TEXT        NOT NULL,
                feature       TEXT,
                user_id       INTEGER,
                ip_address    TEXT,
                metadata      JSONB
            )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_trial_analytics_occurred
                ON trial_analytics_events (occurred_at DESC)
        `);
        schemaEnsured = true;
    } catch (err) {
        // Non-fatal — silently skip if DB user lacks DDL rights
        logger.debug('trialAnalyticsService: schema setup skipped', { error: err.message });
        schemaEnsured = true; // don't retry on every request
    }
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** @enum {string} */
const EVENT_TYPE = {
    FEATURE_USED:       'feature_used',
    FEATURE_BLOCKED:    'feature_blocked',
    QUOTA_BLOCKED:      'quota_blocked',
    PAGE_VISIT:         'page_visit',
    LOGIN:              'login',
    TRIAL_BANNER_SEEN:  'trial_banner_seen',
    UPGRADE_CLICK:      'upgrade_click',
};

// ---------------------------------------------------------------------------
// Core write
// ---------------------------------------------------------------------------

/**
 * Record a single analytics event.
 * Silently no-ops for non-trial editions to avoid overhead.
 *
 * @param {import('pg').Pool} pool
 * @param {{ eventType: string, feature?: string, userId?: number, ip?: string, metadata?: object }} event
 */
async function trackEvent(pool, event) {
    const lic = getLicense();
    if (!lic || lic.edition !== 'trial') return; // only track trial usage

    try {
        await ensureSchema(pool);
        await pool.query(
            `INSERT INTO trial_analytics_events
                (event_type, feature, user_id, ip_address, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                event.eventType,
                event.feature   || null,
                event.userId    || null,
                event.ip        || null,
                event.metadata  ? JSON.stringify(event.metadata) : null,
            ]
        );
    } catch (err) {
        logger.debug('trialAnalyticsService.trackEvent failed (non-fatal)', { error: err.message });
    }
}

// ---------------------------------------------------------------------------
// Analytics read
// ---------------------------------------------------------------------------

/**
 * Returns aggregated statistics for the last 7 days.
 * @param {import('pg').Pool} pool
 * @returns {Promise<object>}
 */
async function getWeeklySummary(pool) {
    const lic = getLicense();
    if (!lic || lic.edition !== 'trial') return {};

    try {
        await ensureSchema(pool);

        const { rows } = await pool.query(`
            SELECT
                event_type,
                feature,
                COUNT(*)::int              AS count,
                COUNT(DISTINCT user_id)::int AS unique_users
            FROM trial_analytics_events
            WHERE occurred_at >= NOW() - INTERVAL '7 days'
            GROUP BY event_type, feature
            ORDER BY count DESC
        `);

        // Separate blocked vs used
        const featuresUsed    = rows.filter(r => r.event_type === EVENT_TYPE.FEATURE_USED);
        const featuresBlocked = rows.filter(r => r.event_type === EVENT_TYPE.FEATURE_BLOCKED);
        const quotaBlocked    = rows.filter(r => r.event_type === EVENT_TYPE.QUOTA_BLOCKED);
        const totalEvents     = rows.reduce((s, r) => s + r.count, 0);

        return {
            period:         '7d',
            totalEvents,
            featuresUsed,
            featuresBlocked,
            quotaBlocked,
            raw:            rows,
        };
    } catch (err) {
        logger.debug('trialAnalyticsService.getWeeklySummary failed', { error: err.message });
        return {};
    }
}

/**
 * Returns a concise dashboard-ready stats object for admin use.
 * @param {import('pg').Pool} pool
 */
async function getTrialDashboardStats(pool) {
    const lic = getLicense();
    if (!lic || lic.edition !== 'trial') return null;

    try {
        await ensureSchema(pool);

        const [activityRow, blockedRow, dau] = await Promise.all([
            // Total actions in last 7 days
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM trial_analytics_events
                WHERE occurred_at >= NOW() - INTERVAL '7 days'
            `),
            // Top 5 blocked features
            pool.query(`
                SELECT feature, COUNT(*)::int AS attempts
                FROM trial_analytics_events
                WHERE event_type = 'feature_blocked'
                  AND occurred_at >= NOW() - INTERVAL '7 days'
                GROUP BY feature
                ORDER BY attempts DESC
                LIMIT 5
            `),
            // Daily active users for today
            pool.query(`
                SELECT COUNT(DISTINCT user_id)::int AS dau
                FROM trial_analytics_events
                WHERE occurred_at >= CURRENT_DATE
            `),
        ]);

        // Simple engagement score: 0-100
        const totalActions   = activityRow.rows[0]?.total || 0;
        const engagementScore = Math.min(100, Math.round(totalActions / 5));

        return {
            daysRemaining:    lic.daysRemaining,
            edition:          lic.edition,
            customerId:       lic.customerId,
            actionsLast7Days: totalActions,
            dauToday:         dau.rows[0]?.dau || 0,
            engagementScore,
            topBlockedFeatures: blockedRow.rows,
        };
    } catch (err) {
        logger.debug('trialAnalyticsService.getTrialDashboardStats failed', { error: err.message });
        return null;
    }
}

// ---------------------------------------------------------------------------
// Express middleware — auto-track feature-blocked events
// ---------------------------------------------------------------------------

/**
 * Returns a middleware that records a feature_blocked event whenever
 * checkFeature() returns a 403.
 * Wrap your checkFeature() call with this to get automatic tracking.
 *
 * @param {import('pg').Pool} pool
 * @param {string} featureName
 * @returns {import('express').RequestHandler}
 */
function trackFeatureBlock(pool, featureName) {
    return (req, res, next) => {
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode === 403 && body?.error === 'feature_not_licensed') {
                trackEvent(pool, {
                    eventType: EVENT_TYPE.FEATURE_BLOCKED,
                    feature:   featureName,
                    userId:    req.user?.user_id,
                    ip:        req.ip,
                }).catch(() => {});
            }
            return originalJson(body);
        };
        next();
    };
}

module.exports = {
    trackEvent,
    getWeeklySummary,
    getTrialDashboardStats,
    trackFeatureBlock,
    EVENT_TYPE,
};
