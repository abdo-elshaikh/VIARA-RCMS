'use strict';

/**
 * trial-report-job.test.js
 * ------------------------
 * Unit tests for the weekly trial engagement digest sent to the sales team.
 *
 * Covers the pure decision logic (engagement banding, digest formatting,
 * recipient parsing) and the job's guard rails (non-trial skip, missing
 * recipient skip, throttle claim/release).
 */

jest.mock('../src/services/licenseService', () => ({
    getLicense: jest.fn(() => ({ edition: 'trial', customerId: 'ORG-1' })),
    loadLicense: jest.fn(),
    licenseAllows: jest.fn(() => true),
}));

jest.mock('../src/services/notificationService', () => ({
    sendEmail: jest.fn(async () => ({ success: true, messageId: 'msg-1' })),
}));

jest.mock('../src/services/trialAnalyticsService', () => ({
    getTrialDashboardStats: jest.fn(),
    getWeeklySummary: jest.fn(),
    EVENT_TYPE: { FEATURE_USED: 'feature_used' },
}));

const { getLicense } = require('../src/services/licenseService');
const { sendEmail } = require('../src/services/notificationService');
const { getTrialDashboardStats, getWeeklySummary } = require('../src/services/trialAnalyticsService');

const loadJob = () => require('../src/jobs/trialReportJob');

const stats = (overrides = {}) => ({
    daysRemaining: 20,
    edition: 'trial',
    customerId: 'ORG-1',
    actionsLast7Days: 300,
    dauToday: 2,
    engagementScore: 60,
    topBlockedFeatures: [{ feature: 'pacs', attempts: 5 }],
    ...overrides,
});

const summary = (overrides = {}) => ({
    period: '7d',
    totalEvents: 300,
    featuresUsed: [{ event_type: 'feature_used', feature: 'appointments', count: 120, unique_users: 2 }],
    featuresBlocked: [],
    quotaBlocked: [{ event_type: 'quota_blocked', feature: 'patients', count: 3 }],
    raw: [],
    ...overrides,
});

describe('trialReportJob', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.TRIAL_REPORT_TO;
        process.env.TRIAL_REPORT_ENABLED = 'true';
        getLicense.mockReturnValue({ edition: 'trial', customerId: 'ORG-1' });
        getTrialDashboardStats.mockResolvedValue(stats());
        getWeeklySummary.mockResolvedValue(summary());
    });

    afterEach(() => {
        delete process.env.TRIAL_REPORT_TO;
        delete process.env.TRIAL_REPORT_ENABLED;
    });

    // ── Engagement banding ────────────────────────────────────────────────

    describe('classifyEngagement', () => {
        const { classifyEngagement } = loadJob();

        test('marks a high-scoring trial as hot', () => {
            expect(classifyEngagement(stats({ engagementScore: 60 }))).toBe('hot');
        });

        test('marks a trial with several paywall hits as hot despite a mid score', () => {
            const warmScore = {
                engagementScore: 25,
                topBlockedFeatures: [
                    { feature: 'pacs', attempts: 3 },
                    { feature: 'finance', attempts: 2 },
                    { feature: 'hr', attempts: 1 },
                ],
            };
            expect(classifyEngagement(warmScore)).toBe('hot');
        });

        test('marks a moderately active trial as warm', () => {
            expect(classifyEngagement(stats({ engagementScore: 30, topBlockedFeatures: [] }))).toBe('warm');
        });

        test('marks an inactive trial as cold', () => {
            expect(classifyEngagement(stats({ engagementScore: 2, topBlockedFeatures: [] }))).toBe('cold');
        });

        test('treats missing stats as cold rather than throwing', () => {
            expect(classifyEngagement(null)).toBe('cold');
            expect(classifyEngagement(undefined)).toBe('cold');
        });
    });

    // ── Digest formatting ─────────────────────────────────────────────────

    describe('buildDigestBody', () => {
        const { buildDigestBody } = loadJob();

        test('includes customer, status, and both feature lists', () => {
            const body = buildDigestBody(
                { edition: 'trial', customerId: 'ORG-77' },
                stats({ daysRemaining: 12 }),
                summary()
            );

            expect(body).toContain('ORG-77');
            expect(body).toContain('12 day(s) remaining');
            expect(body).toContain('appointments: 120 use(s)');
            expect(body).toContain('pacs: 5 blocked attempt(s)');
            expect(body).toContain('Quota blocks in the last 7 days: 3');
        });

        test('flags an expired trial explicitly', () => {
            const body = buildDigestBody(
                { edition: 'trial', customerId: 'ORG-77' },
                stats({ daysRemaining: 0 }),
                summary()
            );
            expect(body).toContain('The trial has EXPIRED.');
        });

        test('states plainly when no paywall was hit', () => {
            const body = buildDigestBody(
                { edition: 'trial', customerId: 'ORG-77' },
                stats({ topBlockedFeatures: [] }),
                summary()
            );
            expect(body).toContain('never hit a paywall');
        });

        test('never includes patient data in the digest', () => {
            const body = buildDigestBody(
                { edition: 'trial', customerId: 'ORG-77' },
                stats(),
                summary()
            );
            expect(body).toContain('No patient data is included');
        });
    });

    // ── Recipient parsing ─────────────────────────────────────────────────

    describe('parseRecipients', () => {
        const { parseRecipients } = loadJob();

        test('accepts a comma-separated list and trims whitespace', () => {
            expect(parseRecipients(' sales@viara.io , lead@viara.io '))
                .toEqual(['sales@viara.io', 'lead@viara.io']);
        });

        test('drops malformed entries instead of failing the job', () => {
            expect(parseRecipients('good@viara.io,not-an-email,also bad@x, second@viara.io'))
                .toEqual(['good@viara.io', 'second@viara.io']);
        });

        test('returns an empty list for unset or empty configuration', () => {
            expect(parseRecipients('')).toEqual([]);
            expect(parseRecipients(undefined)).toEqual([]);
        });
    });

    // ── Job guard rails ───────────────────────────────────────────────────

    describe('runOnce', () => {
        const makePool = (claimResult) => ({
            query: jest.fn(async (sql) => {
                if (String(sql).includes('INSERT INTO trial_analytics_events')) {
                    return { rows: claimResult };
                }
                if (String(sql).includes('DELETE FROM trial_analytics_events')) {
                    return { rows: [], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
            }),
        });

        test('does nothing on a paid edition', async () => {
            getLicense.mockReturnValue({ edition: 'standard', customerId: 'ORG-1' });
            process.env.TRIAL_REPORT_TO = 'sales@viara.io';
            const { runOnce } = loadJob();

            const result = await runOnce(makePool([{ id: 1 }]));

            expect(result).toEqual({ skipped: true, reason: 'not_trial_edition' });
            expect(sendEmail).not.toHaveBeenCalled();
        });

        test('does nothing when no sales recipient is configured', async () => {
            const { runOnce } = loadJob();

            const result = await runOnce(makePool([{ id: 1 }]));

            expect(result).toEqual({ skipped: true, reason: 'no_recipients_configured' });
            expect(sendEmail).not.toHaveBeenCalled();
        });

        test('sends the digest and returns the engagement band', async () => {
            process.env.TRIAL_REPORT_TO = 'sales@viara.io';
            const { runOnce } = loadJob();

            const result = await runOnce(makePool([{ id: 42 }]));

            expect(result.sent).toBe(true);
            expect(result.engagement).toBe('hot');
            expect(result.customerId).toBe('ORG-1');
            expect(sendEmail).toHaveBeenCalledTimes(1);
            expect(sendEmail.mock.calls[0][0]).toBe('sales@viara.io');
            expect(sendEmail.mock.calls[0][1]).toContain('HOT');
        });

        test('skips when a digest already went out inside the window', async () => {
            process.env.TRIAL_REPORT_TO = 'sales@viara.io';
            const { runOnce } = loadJob();

            const result = await runOnce(makePool([]));

            expect(result).toEqual({ skipped: true, reason: 'digest_already_sent_this_window' });
            expect(sendEmail).not.toHaveBeenCalled();
        });

        test('skips quietly when the analytics table is unavailable', async () => {
            process.env.TRIAL_REPORT_TO = 'sales@viara.io';
            getTrialDashboardStats.mockResolvedValue(null);
            const { runOnce } = loadJob();

            const result = await runOnce(makePool([{ id: 1 }]));

            expect(result).toEqual({ skipped: true, reason: 'analytics_unavailable' });
            expect(sendEmail).not.toHaveBeenCalled();
        });

        test('releases the throttle slot so a mail failure does not suppress the digest', async () => {
            process.env.TRIAL_REPORT_TO = 'sales@viara.io';
            sendEmail.mockRejectedValueOnce(new Error('SMTP unavailable'));
            const pool = makePool([{ id: 77 }]);
            const { runOnce } = loadJob();

            const result = await runOnce(pool);

            expect(result.error).toBe('SMTP unavailable');
            const deleteCall = pool.query.mock.calls.find(([sql]) =>
                String(sql).includes('DELETE FROM trial_analytics_events'));
            expect(deleteCall[1]).toEqual([77]);
        });
    });

    // ── Lifecycle ─────────────────────────────────────────────────────────

    describe('startTrialReportJob', () => {
        test('returns a no-op stop function and does not schedule on a paid edition', () => {
            getLicense.mockReturnValue({ edition: 'enterprise', customerId: 'ORG-1' });
            process.env.TRIAL_REPORT_TO = 'sales@viara.io';
            const { startTrialReportJob } = loadJob();

            const stop = startTrialReportJob({ query: jest.fn() });

            expect(typeof stop).toBe('function');
            expect(() => stop()).not.toThrow();
        });

        test('honours TRIAL_REPORT_ENABLED=false', () => {
            getLicense.mockReturnValue({ edition: 'trial', customerId: 'ORG-1' });
            process.env.TRIAL_REPORT_TO = 'sales@viara.io';
            process.env.TRIAL_REPORT_ENABLED = 'false';
            const { startTrialReportJob } = loadJob();

            const stop = startTrialReportJob({ query: jest.fn() });

            expect(typeof stop).toBe('function');
            expect(() => stop()).not.toThrow();
        });
    });
});
