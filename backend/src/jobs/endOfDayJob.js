const logger = require('../config/logger');
const { getPendingExams, getDaySummary } = require('../services/endOfDayService');
const { logSystemAuditEvent } = require('../services/systemAuditService');
const { AUDIT_EVENT_CODES } = require('../services/auditTaxonomy');
const { triggerEventForRole } = require('../services/notificationJobService');

const getHour = () => Math.min(Math.max(Number(process.env.EOD_JOB_CRON_HOUR || 20), 0), 23);
const getDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const runEndOfDaySweep = async (pool, date = getDate()) => {
    const pending = await getPendingExams(pool, { date, limit: 500 });
    const summary = await getDaySummary(pool, date);
    const details = { date, pendingCount: pending.total, summary };
    await logSystemAuditEvent(pool, {
        eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED,
        jobName: 'end-of-day-pending-exams',
        sourceSystem: 'end-of-day-job',
        target: { type: 'daily-exam-review', id: date },
        details,
        riskScore: pending.total > 5 ? 50 : pending.total ? 30 : 0,
        riskReason: pending.total ? `Found ${pending.total} pending examination(s)` : 'No pending examinations'
    });
    if (pending.total > 0) {
        const variables = {
            receptionist_name: 'System', pending_count: pending.total,
            total_today: summary.total, completed_today: summary.completed,
            completion_rate: summary.completionRate, shift_date: date, force_delivery: true,
            review_url: `/reception?tab=end-of-day&date=${encodeURIComponent(date)}`
        };
        await Promise.all(['Admin', 'Receptionist'].map((role) => triggerEventForRole(pool, 'SHIFT_CLOSED_WITH_PENDING_EXAMS', role, {
            entityType: 'DailyEndOfDayReview',
            occurrenceKey: date,
            priority: 'Warning',
            variables
        }).catch(() => {})));
    }
    return details;
};

const startEndOfDayJob = (pool) => {
    const intervalMs = 60 * 1000;
    const hour = getHour();
    let inFlight = false;
    let lastRunDate = null;
    const runIfDue = async () => {
        if (inFlight) return;
        const now = new Date();
        const date = getDate();
        if (now.getHours() < hour || lastRunDate === date) return;
        inFlight = true;
        try { await runEndOfDaySweep(pool, date); lastRunDate = date; }
        catch (error) { logger.error('End-of-day sweep failed', { error: error.message }); }
        finally { inFlight = false; }
    };
    const timer = setInterval(runIfDue, intervalMs);
    runIfDue().catch(() => {});
    return () => clearInterval(timer);
};

module.exports = { startEndOfDayJob, runEndOfDaySweep };
