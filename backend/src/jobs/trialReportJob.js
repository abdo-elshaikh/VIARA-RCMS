// Weekly trial engagement digest for the VIARA sales team.
//
// trialAnalyticsService already records which features a prospect used, which
// ones were blocked, and how often quota limits were hit. This job turns that
// raw stream into one actionable email per week so sales can rank trials by
// real engagement instead of guessing.
//
// Behaviour
// ---------
//   - Only runs for a trial edition (a paid install has nothing to report).
//   - Skips silently when TRIAL_REPORT_TO is unset, so a demo/dev install
//     never sends mail.
//   - Throttled to one digest per reporting window via a marker row in
//     trial_analytics_events, so restarts and overlapping ticks cannot spam
//     the sales inbox.
//   - Fails soft: a reporting problem must never take the clinical API down.
'use strict';

const logger      = require('../config/logger');
const { getLicense } = require('../services/licenseService');
const { getTrialDashboardStats, getWeeklySummary, EVENT_TYPE } = require('../services/trialAnalyticsService');
const { sendEmail } = require('../services/notificationService');

const INTERVAL_MS = Number(process.env.TRIAL_REPORT_INTERVAL_MS || 7 * 24 * 60 * 60 * 1000);
const DIGEST_EVENT_TYPE = 'trial_digest_sent';

// Engagement bands used to rank a trial in the digest. Thresholds are
// intentionally conservative: a prospect who hit several blocked-feature
// gates is a stronger signal than raw click volume.
const HOT_THRESHOLD      = 60;
const WARM_THRESHOLD     = 20;
const HOT_BLOCKED_MIN    = 3;

const parseRecipients = (raw) => String(raw || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

const recipients = () => parseRecipients(process.env.TRIAL_REPORT_TO);

// ── Formatting ───────────────────────────────────────────────────────────────

const formatTopFeatures = (rows, fallbackLabel) => {
    const list = (rows || [])
        .filter(row => row && row.feature)
        .slice(0, 5);
    if (!list.length) return `- ${fallbackLabel}: none recorded`;
    return list
        .map(row => `- ${row.feature}: ${row.count} use(s), ${row.unique_users} user(s)`)
        .join('\n');
};

const formatBlockedFeatures = (rows) => {
    const list = (rows || []).slice(0, 5);
    if (!list.length) return '- No blocked features — the prospect never hit a paywall.';
    return list
        .map(row => `- ${row.feature || 'unknown'}: ${row.attempts} blocked attempt(s)`)
        .join('\n');
};

/**
 * Classify the trial so sales knows who to call first.
 *
 * @param {object} stats  - getTrialDashboardStats() output
 * @returns {'hot'|'warm'|'cold'}
 */
const classifyEngagement = (stats) => {
    const score = Number(stats?.engagementScore || 0);
    const blocked = Number(stats?.topBlockedFeatures?.length || 0);
    if (score >= HOT_THRESHOLD || (score >= WARM_THRESHOLD && blocked >= HOT_BLOCKED_MIN)) return 'hot';
    if (score >= WARM_THRESHOLD) return 'warm';
    return 'cold';
};

const buildDigestBody = (license, stats, summary) => {
    const band = classifyEngagement(stats);
    const daysLeft = stats?.daysRemaining;

    const bandLine = {
        hot:  'HOT — strong engagement with paywalls hit. Contact this week.',
        warm: 'WARM — active but shallow. Worth a follow-up call.',
        cold: 'COLD — little activity. Likely stalled; check the blocker before spending more time.',
    }[band];

    const daysLine = daysLeft === null || daysLeft === undefined
        ? 'No expiry date recorded.'
        : daysLeft <= 0
            ? 'The trial has EXPIRED.'
            : `${daysLeft} day(s) remaining.`;

    return [
        `Trial engagement digest — customer ${license?.customerId || 'UNKNOWN'}`,
        '',
        'Engagement band',
        `  ${band}`,
        `  ${bandLine}`,
        '',
        'Trial status',
        `  Edition:   ${license?.edition || 'unknown'}`,
        `  Expiry:    ${daysLine}`,
        '',
        'Activity (last 7 days)',
        `  Total actions:        ${stats?.actionsLast7Days ?? 0}`,
        `  Active users today:   ${stats?.dauToday ?? 0}`,
        `  Engagement score:     ${stats?.engagementScore ?? 0} / 100`,
        '',
        'Features actually used',
        formatTopFeatures(summary?.featuresUsed, 'No feature usage recorded'),
        '',
        'Features blocked by the license (conversion signals)',
        formatBlockedFeatures(stats?.topBlockedFeatures),
        '',
        `Quota blocks in the last 7 days: ${summary?.quotaBlocked?.reduce((sum, row) => sum + (row?.count || 0), 0) || 0}`,
        '',
        'This digest is generated from the local trial analytics log. No patient data is included.',
    ].join('\n');
};

// ── Throttling ───────────────────────────────────────────────────────────────

/**
 * Reserve the right to send this week's digest. Returns the claimed row id, or
 * null when a digest already went out inside the window.
 *
 * Implemented as a conditional INSERT so two overlapping ticks cannot both
 * win the race.
 *
 * @returns {Promise<number|null>}
 */
const claimDigestSlot = async (pool) => {
    const { rows } = await pool.query(`
        INSERT INTO trial_analytics_events (event_type, feature, metadata)
        SELECT $1, 'weekly_digest', $2::jsonb
        WHERE NOT EXISTS (
            SELECT 1 FROM trial_analytics_events
            WHERE event_type = $1
              AND occurred_at >= NOW() - ($3::bigint * INTERVAL '1 millisecond')
        )
        RETURNING id
    `, [
        DIGEST_EVENT_TYPE,
        JSON.stringify({ customerId: getLicense()?.customerId || null }),
        INTERVAL_MS,
    ]);
    return rows.length > 0 ? rows[0].id : null;
};

const releaseDigestSlot = async (pool, id) => {
    if (id === null || id === undefined) return;
    try {
        await pool.query('DELETE FROM trial_analytics_events WHERE id = $1', [id]);
    } catch (error) {
        logger.warn('trialReportJob: could not release digest slot', { error: error.message });
    }
};

// ── Main routine ─────────────────────────────────────────────────────────────

const runOnce = async (pool) => {
    const license = getLicense();

    if (!license || license.edition !== 'trial') {
        return { skipped: true, reason: 'not_trial_edition' };
    }

    const to = recipients();
    if (!to.length) {
        return { skipped: true, reason: 'no_recipients_configured' };
    }

    // The analytics service owns its table and can be absent on some
    // installations; bail out quietly rather than failing the job.
    const [stats, summary] = await Promise.all([
        getTrialDashboardStats(pool),
        getWeeklySummary(pool),
    ]);

    if (!stats) {
        return { skipped: true, reason: 'analytics_unavailable' };
    }

    const body = buildDigestBody(license, stats, summary);

    let claimedId = null;
    try {
        claimedId = await claimDigestSlot(pool);
    } catch (error) {
        // Throttle bookkeeping must not block a useful report.
        logger.warn('trialReportJob: digest throttle unavailable, sending anyway', { error: error.message });
    }

    if (claimedId === null) {
        return { skipped: true, reason: 'digest_already_sent_this_window' };
    }

    try {
        const subject = `[VIARA Trial] ${classifyEngagement(stats).toUpperCase()} — ${license.customerId} — ${stats.actionsLast7Days || 0} actions`;
        const result = await sendEmail(
            to.join(', '),
            subject,
            body,
            pool,
            { eventType: 'TrialWeeklyDigest', entityType: 'TrialLicense' }
        );

        logger.info('Trial engagement digest sent', {
            customerId: license.customerId,
            recipients: to.length,
            engagement: classifyEngagement(stats),
            messageId: result?.messageId || null,
        });

        return {
            sent: true,
            customerId: license.customerId,
            engagement: classifyEngagement(stats),
            actionsLast7Days: stats.actionsLast7Days,
        };
    } catch (error) {
        logger.error('Trial engagement digest failed', { error: error.message, stack: error.stack });
        // Give the slot back so a transient SMTP outage does not silently
        // suppress the digest for the rest of the window.
        await releaseDigestSlot(pool, claimedId);
        return { error: error.message };
    }
};

let inFlight = false;

const safeRunOnce = async (pool) => {
    if (inFlight) return { skipped: true, reason: 'already_running' };
    inFlight = true;
    try {
        return await runOnce(pool);
    } finally {
        inFlight = false;
    }
};

const startTrialReportJob = (pool) => {
    if (String(process.env.TRIAL_REPORT_ENABLED || 'true').toLowerCase() === 'false') {
        logger.info('Trial report job disabled (TRIAL_REPORT_ENABLED=false)');
        return () => {};
    }

    const edition = getLicense()?.edition;
    if (edition !== 'trial') {
        logger.info('Trial report job skipped — not a trial edition');
        return () => {};
    }

    if (!recipients().length) {
        logger.warn('Trial report job not started — set TRIAL_REPORT_TO to enable the weekly sales digest');
        return () => {};
    }

    logger.info(`Trial report job started. Digesting every ${Math.round(INTERVAL_MS / 86400000)} day(s).`);

    const timeout  = setTimeout(() => safeRunOnce(pool), 10 * 60 * 1000);
    const interval = setInterval(() => safeRunOnce(pool), INTERVAL_MS);

    return () => {
        clearTimeout(timeout);
        clearInterval(interval);
    };
};

module.exports = {
    startTrialReportJob,
    runOnce: safeRunOnce,
    buildDigestBody,
    classifyEngagement,
    parseRecipients,
    formatTopFeatures,
    formatBlockedFeatures,
    INTERVAL_MS,
    DIGEST_EVENT_TYPE,
    EVENT_TYPE,
};
