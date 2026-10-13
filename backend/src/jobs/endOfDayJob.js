const logger = require('../config/logger');
const { setBranchContext, clearBranchContext } = require('../utils/branchTransaction');
const { getPendingExams, getDaySummary } = require('../services/endOfDayService');
const { logSystemAuditEvent } = require('../services/systemAuditService');
const { AUDIT_EVENT_CODES } = require('../services/auditTaxonomy');
const { triggerEventForRole } = require('../services/notificationJobService');

const getHour = () => Math.min(Math.max(Number(process.env.EOD_JOB_CRON_HOUR || 20), 0), 23);
const getDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const runEndOfDaySweep = async (pool, date = getDate()) => {
    // Branch-aware sweep (MBT-208)
    const branchesRes = await pool.query(`
        SELECT id, name, code, is_main
        FROM branches
        WHERE is_active = TRUE
        ORDER BY is_main DESC, name ASC
    `);
    const branches = branchesRes.rows || [];

    const branchSummaries = [];
    let totalPendingAllBranches = 0;

    for (const branch of branches) {
        const client = await pool.connect();
        let pending;
        let summary;
        try {
            await setBranchContext(client, { branchId: branch.id });
            pending = await getPendingExams(client, { date, branchId: branch.id, limit: 500 });
            summary = await getDaySummary(client, date, { branchId: branch.id });
        } finally {
            await clearBranchContext(client);
            client.release();
        }
        totalPendingAllBranches += pending.total;

        branchSummaries.push({
            branchId: branch.id,
            branchName: branch.name,
            branchCode: branch.code,
            pendingCount: pending.total,
            summary
        });

        if (pending.total > 0) {
            const variables = {
                receptionist_name: 'System',
                pending_count: pending.total,
                branch_name: branch.name,
                branch_code: branch.code,
                total_today: summary.total,
                completed_today: summary.completed,
                completion_rate: summary.completionRate,
                shift_date: date,
                force_delivery: true,
                review_url: `/reception?tab=end-of-day&date=${encodeURIComponent(date)}&branchId=${branch.id}`
            };
            await Promise.all(['Admin', 'Receptionist'].map((role) => triggerEventForRole(pool, 'SHIFT_CLOSED_WITH_PENDING_EXAMS', role, {
                entityType: 'DailyEndOfDayReview',
                occurrenceKey: `${date}:${branch.id}`,
                priority: 'Warning',
                branchId: branch.id,
                variables
            }).catch(() => {})));
        }
    }

    const overallSummary = await getDaySummary(pool, date);
    const details = {
        date,
        totalPending: totalPendingAllBranches,
        branches: branchSummaries,
        overallSummary
    };

    await logSystemAuditEvent(pool, {
        eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED,
        jobName: 'end-of-day-pending-exams',
        sourceSystem: 'end-of-day-job',
        target: { type: 'daily-exam-review', id: date },
        details,
        riskScore: totalPendingAllBranches > 5 ? 50 : totalPendingAllBranches ? 30 : 0,
        riskReason: totalPendingAllBranches
            ? `Found ${totalPendingAllBranches} pending examination(s) across branches`
            : 'No pending examinations across branches'
    });

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
