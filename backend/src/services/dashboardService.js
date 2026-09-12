/**
 * Dashboard Service - Data Aggregation Layer
 * Handles complex queries for dashboard statistics
 */
const logger = require('../config/logger');
const { DEFAULT_BRANCH_ID } = require('./financialPostingService');

// Keep all dashboard day/week boundaries aligned with the center setting,
// independently of the Node or PostgreSQL host timezone.
const CENTER_BUSINESS_DATE_SQL = `(CURRENT_TIMESTAMP AT TIME ZONE COALESCE(
    NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''),
    'Africa/Cairo'
))::date`;

class DashboardService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get receptionist-specific statistics
     */
    async getReceptionistStats() {
        try {
            // Today's check-ins count
            const checkInsQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE arrived_at::date = ${CENTER_BUSINESS_DATE_SQL}
            `;
            const checkInsResult = await this.db.query(checkInsQuery);
            const todayCheckIns = parseInt(checkInsResult.rows[0].count);

            // Yesterday's check-ins for comparison
            const yesterdayCheckInsResult = await this.db.query(`
                SELECT COUNT(*) as count
                FROM examinations
                WHERE arrived_at::date = ${CENTER_BUSINESS_DATE_SQL} - 1
            `);
            const yesterdayCheckIns = parseInt(yesterdayCheckInsResult.rows[0].count);

            // Appointments count and pending
            const appointmentsQuery = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'Confirmed' THEN 1 END) as pending
                FROM appointments
                WHERE start_time::date = ${CENTER_BUSINESS_DATE_SQL}
            `;
            const appointmentsResult = await this.db.query(appointmentsQuery);
            const appointments = appointmentsResult.rows[0];

            // Waiting room count (checked-in but not yet scanning/completed)
            const waitingQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE arrived_at::date = ${CENTER_BUSINESS_DATE_SQL}
                  AND exam_started_at IS NULL
                  AND status <> 'Finalized'
            `;
            const waitingResult = await this.db.query(waitingQuery);
            const waitingRoom = parseInt(waitingResult.rows[0].count);

            // Completed today
            const completedQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE status = 'Finalized'
                AND report_finalized_at::date = ${CENTER_BUSINESS_DATE_SQL}
            `;
            const completedResult = await this.db.query(completedQuery);
            const completed = parseInt(completedResult.rows[0].count);

            const yesterdayCompletedResult = await this.db.query(`
                SELECT COUNT(*) as count
                FROM examinations
                WHERE status = 'Finalized'
                  AND report_finalized_at::date = ${CENTER_BUSINESS_DATE_SQL} - 1
            `);
            const yesterdayCompleted = parseInt(yesterdayCompletedResult.rows[0].count);

            const averageWaitQuery = `
                SELECT COALESCE(
                    ROUND(AVG(EXTRACT(EPOCH FROM (exam_started_at - arrived_at)) / 60)),
                    0
                ) as minutes
                FROM examinations
                WHERE arrived_at::date = ${CENTER_BUSINESS_DATE_SQL}
                AND arrived_at IS NOT NULL
                AND exam_started_at IS NOT NULL
                AND exam_started_at >= arrived_at
            `;
            const averageWaitResult = await this.db.query(averageWaitQuery);

            // Patient flow data (hourly breakdown)
            const flowQuery = `
                SELECT 
                    TO_CHAR(start_time, 'HH24:00') as time,
                    COUNT(CASE WHEN e.status IN ('Scheduled', 'Checked-in') THEN 1 END) as waiting,
                    COUNT(CASE WHEN e.status IN ('Scanning', 'Reporting') THEN 1 END) as in_progress,
                    COUNT(CASE WHEN e.status = 'Finalized' THEN 1 END) as completed
                FROM appointments a
                LEFT JOIN examinations e ON a.appointment_id = e.appointment_id
                WHERE a.start_time::date = ${CENTER_BUSINESS_DATE_SQL}
                GROUP BY TO_CHAR(start_time, 'HH24:00')
                ORDER BY time
            `;
            const flowResult = await this.db.query(flowQuery);

            return {
                todayCheckIns,
                checkInsChange: this.calculatePercentageChange(todayCheckIns, yesterdayCheckIns),
                appointments: parseInt(appointments.total),
                appointmentsPending: parseInt(appointments.pending),
                waitingRoom,
                completed,
                completedChange: this.calculatePercentageChange(completed, yesterdayCompleted),
                averageWaitMinutes: parseInt(averageWaitResult.rows[0].minutes),
                patientFlowData: flowResult.rows,
                sparklineData: await this.getWeeklySparkline('appointments')
            };
        } catch (error) {
            logger.error('Error in getReceptionistStats:', error);
            throw error;
        }
    }

    /**
     * Get assignment-aware clinical statistics for radiologists, technicians, and nurses.
     */
    async getClinicalStats(userId, role = 'Radiologist') {
        try {
            const roleConfig = {
                Radiologist: {
                    join: '',
                    assignment: 'e.performing_radiologist_id = $1',
                    assigneeColumn: 'e.performing_radiologist_id',
                    assignedAt: 'e.radiologist_assigned_at',
                    availableAt: 'e.radiologist_task_available_at',
                    startedAt: 'e.radiologist_task_started_at',
                    station: 'Radiologist',
                    taskRole: 'Radiologist',
                    slaMinutes: 120,
                    completion: 'e.report_finalized_at',
                    cycleStart: 'e.exam_completed_at',
                    cycleMetric: 'report'
                },
                Technician: {
                    join: 'JOIN appointments a ON e.appointment_id = a.appointment_id',
                    assignment: 'a.technician_id = $1',
                    assigneeColumn: 'a.technician_id',
                    assignedAt: 'a.technician_assigned_at',
                    availableAt: 'a.technician_task_available_at',
                    startedAt: 'a.technician_task_started_at',
                    station: 'Modality',
                    taskRole: 'Technician',
                    slaMinutes: 60,
                    completion: 'e.exam_completed_at',
                    cycleStart: 'e.exam_started_at',
                    cycleMetric: 'scan'
                },
                Nurse: {
                    join: 'JOIN appointments a ON e.appointment_id = a.appointment_id',
                    assignment: 'a.nurse_id = $1',
                    assigneeColumn: 'a.nurse_id',
                    assignedAt: 'a.nurse_assigned_at',
                    availableAt: 'a.nurse_task_available_at',
                    startedAt: 'a.nurse_task_started_at',
                    station: 'Nurse',
                    taskRole: 'Nurse',
                    slaMinutes: 30,
                    completion: 'e.prep_completed_at',
                    cycleStart: 'e.prep_started_at',
                    cycleMetric: 'preparation'
                }
            }[role] || null;

            if (!roleConfig) throw new Error(`Unsupported clinical dashboard role: ${role}`);

            const pendingCondition = `${roleConfig.completion} IS NULL
                AND e.status != 'Finalized'
                AND e.queue_stage NOT IN ('Cancelled', 'Delivered')
                AND e.current_station = '${roleConfig.station}'`;
            const pendingQuery = `
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND ${pendingCondition}
            `;
            const pendingResult = await this.db.query(pendingQuery, [userId]);
            const pendingReports = parseInt(pendingResult.rows[0].count);

            const urgentQuery = `
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND ${pendingCondition}
                AND e.created_at < NOW() - INTERVAL '24 hours'
            `;
            const urgentResult = await this.db.query(urgentQuery, [userId]);
            const urgentCases = parseInt(urgentResult.rows[0].count);

            const completedTodayQuery = `
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND DATE(${roleConfig.completion}) = ${CENTER_BUSINESS_DATE_SQL}
            `;
            const completedTodayResult = await this.db.query(completedTodayQuery, [userId]);
            const completedToday = parseInt(completedTodayResult.rows[0].count);

            const completedYesterdayResult = await this.db.query(`
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND DATE(${roleConfig.completion}) = ${CENTER_BUSINESS_DATE_SQL} - 1
            `, [userId]);
            const completedYesterday = parseInt(completedYesterdayResult.rows[0].count);

            const weekStartQuery = `
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND ${roleConfig.completion} >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
            `;
            const weekResult = await this.db.query(weekStartQuery, [userId]);
            const thisWeek = parseInt(weekResult.rows[0].count);

            const previousWeekQuery = `
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND ${roleConfig.completion} >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL}) - INTERVAL '7 days'
                AND ${roleConfig.completion} < DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
            `;
            const previousWeekResult = await this.db.query(previousWeekQuery, [userId]);
            const previousWeek = parseInt(previousWeekResult.rows[0].count);

            const turnaroundQuery = `
                SELECT
                    COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (${roleConfig.completion} - ${roleConfig.cycleStart})) / 3600)
                        FILTER (WHERE ${roleConfig.completion} >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL}) AND ${roleConfig.cycleStart} IS NOT NULL))::numeric, 1), 0) as avg_hours,
                    COALESCE(ROUND((MAX(EXTRACT(EPOCH FROM (NOW() - e.created_at)) / 3600)
                        FILTER (WHERE ${pendingCondition}))::numeric, 1), 0) as oldest_pending_hours
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
            `;
            const turnaroundResult = await this.db.query(turnaroundQuery, [userId]);

            const workloadQuery = `
                SELECT 
                    m.type as name,
                    COUNT(*) as value
                FROM examinations e
                ${roleConfig.join}
                JOIN modalities m ON e.modality_id = m.modality_id
                WHERE ${roleConfig.assignment}
                AND ${pendingCondition}
                GROUP BY m.type
            `;
            const workloadResult = await this.db.query(workloadQuery, [userId]);

            const taskSnapshotResult = await this.db.query(`
                SELECT
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND e.current_station = $2
                          AND ${roleConfig.completion} IS NULL
                    )::int AS total_assigned,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND e.current_station = $2
                          AND ${roleConfig.completion} IS NULL
                          AND ${roleConfig.startedAt} IS NULL
                          AND NOT e.is_on_hold
                    )::int AS pending,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND e.current_station = $2
                          AND ${roleConfig.completion} IS NULL
                          AND ${roleConfig.startedAt} IS NOT NULL
                          AND NOT e.is_on_hold
                    )::int AS in_progress,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND e.current_station = $2
                          AND ${roleConfig.completion} IS NULL
                          AND e.is_on_hold
                    )::int AS on_hold,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} IS NULL
                          AND e.current_station = $2
                          AND ${roleConfig.completion} IS NULL
                    )::int AS available,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND ${roleConfig.assignedAt} >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
                    )::int AS assigned_this_week,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND ${roleConfig.assignedAt} >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
                          AND ${roleConfig.completion} >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
                    )::int AS completed_assigned_this_week,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND ${roleConfig.completion} >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
                    )::int AS sla_completed,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND ${roleConfig.completion} >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
                          AND EXTRACT(EPOCH FROM (${roleConfig.completion} - ${roleConfig.cycleStart})) / 60 <= $3
                    )::int AS sla_met,
                    COUNT(*) FILTER (
                        WHERE ${roleConfig.assigneeColumn} = $1
                          AND e.current_station = $2
                          AND ${roleConfig.completion} IS NULL
                          AND NOT e.is_on_hold
                          AND NOW()
                              - COALESCE(${roleConfig.startedAt}, GREATEST(${roleConfig.assignedAt}, ${roleConfig.availableAt}), ${roleConfig.assignedAt}, ${roleConfig.availableAt}, e.created_at)
                              - COALESCE((
                                  SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(h.released_at, NOW()) - h.started_at))) * INTERVAL '1 second'
                                  FROM clinical_task_hold_intervals h
                                  WHERE h.exam_id = e.exam_id AND h.queue_stage = e.queue_stage
                                ), INTERVAL '0 seconds')
                              > CASE e.queue_stage
                                  WHEN 'Prep Pending' THEN INTERVAL '30 minutes'
                                  WHEN 'Ready for Exam' THEN INTERVAL '20 minutes'
                                  WHEN 'In Exam' THEN INTERVAL '60 minutes'
                                  WHEN 'Reporting' THEN INTERVAL '120 minutes'
                                  ELSE INTERVAL '60 minutes'
                                END
                    )::int AS overdue,
                    COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${roleConfig.startedAt} - COALESCE(GREATEST(${roleConfig.assignedAt}, ${roleConfig.availableAt}), ${roleConfig.assignedAt}, ${roleConfig.availableAt}))) / 60)
                        FILTER (WHERE ${roleConfig.assigneeColumn} = $1 AND ${roleConfig.startedAt} IS NOT NULL)), 0)::int AS average_start_delay_minutes
                FROM examinations e
                ${roleConfig.join}
            `, [userId, roleConfig.station, roleConfig.slaMinutes]);
            const taskSnapshot = taskSnapshotResult.rows[0] || {};

            const stageDistributionResult = await this.db.query(`
                SELECT e.queue_stage AS name, COUNT(*)::int AS value
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                  AND e.current_station = $2
                  AND ${roleConfig.completion} IS NULL
                GROUP BY e.queue_stage
                ORDER BY e.queue_stage
            `, [userId, roleConfig.station]);

            const assignmentMetricsResult = await this.db.query(`
                SELECT
                    COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (created_at - available_at)) / 60)
                        FILTER (WHERE action = 'Claim' AND available_at IS NOT NULL)), 0)::int AS average_acceptance_minutes,
                    COUNT(*) FILTER (
                        WHERE action IN ('Release', 'Transfer')
                          AND created_at >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
                    )::int AS reassignments_week
                FROM (
                    SELECT action, created_at, available_at
                    FROM clinical_task_assignment_events
                    WHERE task_role = $1
                      AND (new_user_id = $2 OR previous_user_id = $2)
                ) events
            `, [roleConfig.taskRole, userId]);
            const assignmentMetrics = assignmentMetricsResult.rows[0] || {};
            const assignedThisWeek = Number(taskSnapshot.assigned_this_week || 0);
            const completedAssignedThisWeek = Number(taskSnapshot.completed_assigned_this_week || 0);
            const completionRate = assignedThisWeek > 0
                ? Math.round((completedAssignedThisWeek / assignedThisWeek) * 100)
                : 0;
            const slaCompleted = Number(taskSnapshot.sla_completed || 0);
            const slaCompliance = slaCompleted > 0
                ? Math.round((Number(taskSnapshot.sla_met || 0) / slaCompleted) * 100)
                : 100;

            return {
                cycleMetric: roleConfig.cycleMetric,
                totalAssigned: Number(taskSnapshot.total_assigned || 0),
                pending: Number(taskSnapshot.pending || 0),
                inProgress: Number(taskSnapshot.in_progress || 0),
                onHold: Number(taskSnapshot.on_hold || 0),
                availableTasks: Number(taskSnapshot.available || 0),
                overdueTasks: Number(taskSnapshot.overdue || 0),
                averageAcceptanceMinutes: Number(assignmentMetrics.average_acceptance_minutes || 0),
                averageStartDelayMinutes: Number(taskSnapshot.average_start_delay_minutes || 0),
                reassignmentsWeek: Number(assignmentMetrics.reassignments_week || 0),
                completionRate,
                slaCompliance,
                stageDistribution: Object.fromEntries(stageDistributionResult.rows.map((row) => [row.name, Number(row.value || 0)])),
                pendingReports,
                urgentCases,
                completedToday,
                completedTodayChange: this.calculatePercentageChange(completedToday, completedYesterday),
                thisWeek,
                weekChange: this.calculatePercentageChange(thisWeek, previousWeek),
                averageTurnaroundHours: parseFloat(turnaroundResult.rows[0].avg_hours),
                oldestPendingHours: parseFloat(turnaroundResult.rows[0].oldest_pending_hours),
                modalityDistribution: workloadResult.rows,
                sparklineData: role === 'Radiologist' ? await this.getWeeklySparkline('reports', userId) : []
            };
        } catch (error) {
            logger.error('Error in getClinicalStats:', error);
            throw error;
        }
    }

    async getRadiologistStats(radiologistId) {
        return this.getClinicalStats(radiologistId, 'Radiologist');
    }

    /**
     * Finance dashboard statistics. Cashiers only see their own collections,
     * while accountants receive branch-wide aggregates. Patient identifiers
     * are intentionally excluded from this contract.
     */
    async getFinanceStats({ cashierId = null, branchId = DEFAULT_BRANCH_ID } = {}) {
        const paymentParams = [cashierId, branchId];
        const paymentsResult = await this.db.query(`
            SELECT
                COALESCE(SUM(amount) FILTER (
                    WHERE business_date = ${CENTER_BUSINESS_DATE_SQL} AND payment_status = 'Completed'
                ), 0) AS collected_today,
                COALESCE(SUM(amount) FILTER (
                    WHERE business_date >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date
                      AND payment_status = 'Completed'
                ), 0) AS collected_week,
                COUNT(*) FILTER (
                    WHERE business_date = ${CENTER_BUSINESS_DATE_SQL} AND payment_status = 'Completed'
                )::int AS transactions_today
            FROM payments
            WHERE ($1::uuid IS NULL OR processed_by = $1::uuid)
              AND branch_id = $2::uuid
        `, paymentParams);

        const invoiceResult = await this.db.query(`
            WITH payment_totals AS (
                SELECT invoice_id,
                       COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Completed'), 0) AS paid_amount
                FROM payments
                GROUP BY invoice_id
            ), refund_totals AS (
                SELECT invoice_id,
                       COALESCE(SUM(amount) FILTER (WHERE status = 'Processed'), 0) AS refunded_amount
                FROM refunds
                GROUP BY invoice_id
            ), credit_totals AS (
                SELECT invoice_id,
                       COALESCE(SUM(patient_amount) FILTER (WHERE reversed_at IS NULL), 0) AS credited_amount
                FROM credit_notes
                GROUP BY invoice_id
            ), positions AS (
                SELECT i.invoice_id, i.invoice_status,
                       GREATEST(
                           i.patient_payable_amount - COALESCE(c.credited_amount, 0)
                           - COALESCE(p.paid_amount, 0) + COALESCE(r.refunded_amount, 0),
                           0
                       ) AS balance_amount
                FROM invoices i
                LEFT JOIN payment_totals p ON p.invoice_id = i.invoice_id
                LEFT JOIN refund_totals r ON r.invoice_id = i.invoice_id
                LEFT JOIN credit_totals c ON c.invoice_id = i.invoice_id
                WHERE i.invoice_status <> 'Voided'
                  AND i.branch_id = $1::uuid
            )
            SELECT
                COUNT(*) FILTER (WHERE balance_amount > 0)::int AS open_invoices,
                COALESCE(SUM(balance_amount), 0) AS outstanding_amount
            FROM positions
        `, [branchId]);

        const refundResult = await this.db.query(`
            SELECT COUNT(*)::int AS pending_refunds
            FROM refunds
            WHERE status IN ('Pending', 'Approved')
              AND branch_id = $1::uuid
        `, [branchId]);

        const shiftResult = cashierId
            ? await this.db.query(`
                SELECT EXISTS (
                    SELECT 1 FROM cashier_shifts
                    WHERE cashier_id = $1 AND branch_id = $2::uuid AND status = 'Open'
                ) AS shift_open
            `, [cashierId, branchId])
            : { rows: [{ shift_open: false }] };

        const payments = paymentsResult.rows[0];
        const invoices = invoiceResult.rows[0];
        return {
            collectedToday: parseFloat(payments.collected_today),
            collectedWeek: parseFloat(payments.collected_week),
            transactionsToday: parseInt(payments.transactions_today),
            openInvoices: parseInt(invoices.open_invoices),
            outstandingAmount: parseFloat(invoices.outstanding_amount),
            pendingRefunds: parseInt(refundResult.rows[0].pending_refunds),
            shiftOpen: Boolean(shiftResult.rows[0].shift_open)
        };
    }

    /** HR-only workforce aggregates. */
    async getHRStats() {
        const result = await this.db.query(`
            SELECT
                (SELECT COUNT(*) FROM users WHERE is_active = TRUE)::int AS active_staff,
                (SELECT COUNT(DISTINCT user_id) FROM attendance_logs
                    WHERE clock_in::date = ${CENTER_BUSINESS_DATE_SQL})::int AS present_today,
                (SELECT COUNT(DISTINCT user_id) FROM leave_requests
                    WHERE status = 'Approved'
                      AND ${CENTER_BUSINESS_DATE_SQL} BETWEEN start_date AND end_date)::int AS on_leave_today,
                (SELECT COUNT(*) FROM leave_requests WHERE status = 'Pending')::int AS pending_leave
        `);
        const row = result.rows[0];
        return {
            activeStaff: parseInt(row.active_staff),
            presentToday: parseInt(row.present_today),
            onLeaveToday: parseInt(row.on_leave_today),
            pendingLeave: parseInt(row.pending_leave)
        };
    }

    /** Insurance-only claim and preauthorization aggregates without patient data. */
    async getInsuranceStats(branchId = DEFAULT_BRANCH_ID) {
        const result = await this.db.query(`
            SELECT
                (SELECT COUNT(*) FROM insurance_approvals WHERE status = 'Pending')::int AS pending_approvals,
                (SELECT COUNT(*) FROM insurance_claims
                    WHERE branch_id = $1::uuid
                      AND status IN ('Draft', 'Pending Approval', 'Approved', 'Submitted', 'Partially Paid', 'Resubmitted'))::int AS open_claims,
                (SELECT COUNT(*) FROM insurance_claims WHERE branch_id = $1::uuid AND status = 'Rejected')::int AS rejected_claims,
                (SELECT COALESCE(SUM(GREATEST(expected_amount - received_amount, 0)), 0)
                    FROM insurance_claims
                    WHERE branch_id = $1::uuid AND status NOT IN ('Paid', 'Written Off')) AS outstanding_claims,
                (SELECT COALESCE(SUM(amount), 0) FROM claim_receipts
                    WHERE branch_id = $1::uuid
                      AND business_date >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date) AS received_week
        `, [branchId]);
        const row = result.rows[0];
        return {
            pendingApprovals: parseInt(row.pending_approvals),
            openClaims: parseInt(row.open_claims),
            rejectedClaims: parseInt(row.rejected_claims),
            outstandingClaims: parseFloat(row.outstanding_claims),
            receivedWeek: parseFloat(row.received_week)
        };
    }

    /**
     * Get admin-specific statistics
     */
    async getAdminStats() {
        try {
            // Completed scans this week
            const scansQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE exam_completed_at >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
            `;
            const scansResult = await this.db.query(scansQuery);
            const totalScans = parseInt(scansResult.rows[0].count);

            const previousScansQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE exam_completed_at >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL}) - INTERVAL '7 days'
                AND exam_completed_at < DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
            `;
            const previousScansResult = await this.db.query(previousScansQuery);
            const previousScans = parseInt(previousScansResult.rows[0].count);

            // Net collections (this week)
            const revenueQuery = `
                SELECT
                    COALESCE((SELECT SUM(amount) FROM payments
                              WHERE business_date >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date
                                AND payment_status = 'Completed'), 0)
                    + COALESCE((SELECT SUM(amount) FROM claim_receipts
                                WHERE business_date >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date), 0)
                    - COALESCE((SELECT SUM(amount) FROM refunds
                                WHERE business_date >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date
                                  AND status = 'Processed'), 0) AS total
            `;
            const revenueResult = await this.db.query(revenueQuery);
            const revenue = parseFloat(revenueResult.rows[0].total);

            const previousRevenueQuery = `
                SELECT
                    COALESCE((SELECT SUM(amount) FROM payments
                              WHERE business_date >= (DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL}) - INTERVAL '7 days')::date
                                AND business_date < DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date
                                AND payment_status = 'Completed'), 0)
                    + COALESCE((SELECT SUM(amount) FROM claim_receipts
                                WHERE business_date >= (DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL}) - INTERVAL '7 days')::date
                                  AND business_date < DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date), 0)
                    - COALESCE((SELECT SUM(amount) FROM refunds
                                WHERE business_date >= (DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL}) - INTERVAL '7 days')::date
                                  AND business_date < DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date
                                  AND status = 'Processed'), 0) AS total
            `;
            const previousRevenueResult = await this.db.query(previousRevenueQuery);
            const previousRevenue = parseFloat(previousRevenueResult.rows[0].total);

            // Active staff count
            const staffQuery = `
                SELECT COUNT(*) as count
                FROM users
                WHERE is_active = true
            `;
            const staffResult = await this.db.query(staffQuery);
            const activeStaff = parseInt(staffResult.rows[0].count);

            const operationalQuery = `
                SELECT
                    COUNT(*) FILTER (WHERE status != 'Finalized') as open_work,
                    COUNT(*) FILTER (WHERE exam_completed_at::date = ${CENTER_BUSINESS_DATE_SQL}) as scans_today
                FROM examinations
            `;
            const operationalResult = await this.db.query(operationalQuery);

            const leaveQuery = `
                SELECT COUNT(DISTINCT user_id) as count
                FROM leave_requests
                WHERE status = 'Approved'
                AND ${CENTER_BUSINESS_DATE_SQL} BETWEEN start_date AND end_date
            `;
            const leaveResult = await this.db.query(leaveQuery);

            // Weekly scan volume data with revenue
            const weeklyDataQuery = `
                WITH days AS (
                    SELECT generate_series(DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date, ${CENTER_BUSINESS_DATE_SQL}, '1 day')::date AS day
                ), cash AS (
                    SELECT business_date AS day, SUM(amount) AS amount FROM (
                        SELECT business_date, amount FROM payments WHERE payment_status = 'Completed'
                        UNION ALL SELECT business_date, amount FROM claim_receipts
                        UNION ALL SELECT business_date, -amount FROM refunds WHERE status = 'Processed'
                    ) activity
                    WHERE business_date >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})::date
                    GROUP BY business_date
                )
                SELECT d.day AS date, TO_CHAR(d.day, 'Dy') AS name,
                       COALESCE((SELECT COUNT(*) FROM examinations e WHERE e.exam_completed_at::date = d.day), 0)::int AS scans,
                       COALESCE(c.amount, 0) AS revenue
                FROM days d LEFT JOIN cash c ON c.day = d.day
                ORDER BY d.day
            `;
            const weeklyDataResult = await this.db.query(weeklyDataQuery);

            // Modality distribution
            const modalityQuery = `
                SELECT 
                    m.type as name,
                    COUNT(*) as value,
                    COUNT(*) as exams
                FROM examinations e
                JOIN modalities m ON e.modality_id = m.modality_id
                WHERE e.exam_completed_at >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
                GROUP BY m.type
            `;
            const modalityResult = await this.db.query(modalityQuery);

            // Add colors to modality data
            const colorMap = {
                'MRI': '#3b82f6',
                'CT': '#8b5cf6',
                'X-Ray': '#06b6d4',
                'Ultrasound': '#10b981',
                'PET': '#f59e0b'
            };
            const modalityData = modalityResult.rows.map(row => ({
                ...row,
                color: colorMap[row.name] || '#64748b'
            }));

            return {
                totalScans,
                scansChange: this.calculatePercentageChange(totalScans, previousScans),
                revenue: Math.round(revenue / 1000),
                revenueAmount: revenue,
                revenueChange: this.calculatePercentageChange(revenue, previousRevenue),
                activeStaff,
                staffOnLeave: parseInt(leaveResult.rows[0].count),
                openWork: parseInt(operationalResult.rows[0].open_work),
                scansToday: parseInt(operationalResult.rows[0].scans_today),
                scanVolumeData: weeklyDataResult.rows,
                modalityData,
                sparklineScans: await this.getWeeklySparkline('scans'),
                sparklineRevenue: await this.getWeeklySparkline('revenue')
            };
        } catch (error) {
            logger.error('Error in getAdminStats:', error);
            throw error;
        }
    }

    /**
     * Actual scanner occupancy and measured turnaround stages. No patient
     * identifiers are returned from this operational snapshot.
     */
    async getOperationalSnapshot() {
        const modalitiesResult = await this.db.query(`
            SELECT
                m.modality_id AS id,
                m.name,
                m.type,
                m.status AS equipment_status,
                CASE
                    WHEN active_exam.exam_id IS NOT NULL THEN 'in_use'
                    WHEN m.status = 'Active' THEN 'ready'
                    WHEN m.status = 'Under Maintenance' THEN 'maintenance'
                    ELSE 'out_of_service'
                END AS workflow_status,
                active_exam.started_at,
                CASE WHEN active_exam.started_at IS NOT NULL
                    THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - active_exam.started_at)) / 60)::int
                    ELSE NULL
                END AS elapsed_minutes,
                m.updated_at
            FROM modalities m
            LEFT JOIN LATERAL (
                SELECT e.exam_id, e.exam_started_at AS started_at
                FROM examinations e
                WHERE e.modality_id = m.modality_id
                  AND e.exam_started_at IS NOT NULL
                  AND e.exam_completed_at IS NULL
                  AND e.status <> 'Finalized'
                ORDER BY e.exam_started_at DESC
                LIMIT 1
            ) active_exam ON TRUE
            ORDER BY m.type, m.name
        `);

        const turnaroundResult = await this.db.query(`
            SELECT
                ROUND(AVG(EXTRACT(EPOCH FROM (exam_started_at - arrived_at)) / 60)
                    FILTER (WHERE arrived_at IS NOT NULL AND exam_started_at >= arrived_at), 1) AS checkin_minutes,
                COUNT(*) FILTER (WHERE arrived_at IS NOT NULL AND exam_started_at >= arrived_at)::int AS checkin_samples,
                ROUND(AVG(EXTRACT(EPOCH FROM (prep_completed_at - prep_started_at)) / 60)
                    FILTER (WHERE prep_started_at IS NOT NULL AND prep_completed_at >= prep_started_at), 1) AS prep_minutes,
                COUNT(*) FILTER (WHERE prep_started_at IS NOT NULL AND prep_completed_at >= prep_started_at)::int AS prep_samples,
                ROUND(AVG(EXTRACT(EPOCH FROM (exam_completed_at - exam_started_at)) / 60)
                    FILTER (WHERE exam_started_at IS NOT NULL AND exam_completed_at >= exam_started_at), 1) AS acquisition_minutes,
                COUNT(*) FILTER (WHERE exam_started_at IS NOT NULL AND exam_completed_at >= exam_started_at)::int AS acquisition_samples,
                ROUND(AVG(EXTRACT(EPOCH FROM (report_finalized_at - exam_completed_at)) / 60)
                    FILTER (WHERE exam_completed_at IS NOT NULL AND report_finalized_at >= exam_completed_at), 1) AS reporting_minutes,
                COUNT(*) FILTER (WHERE exam_completed_at IS NOT NULL AND report_finalized_at >= exam_completed_at)::int AS reporting_samples
            FROM examinations
            WHERE COALESCE(report_finalized_at, exam_completed_at, exam_started_at, arrived_at, created_at)
                >= DATE_TRUNC('week', ${CENTER_BUSINESS_DATE_SQL})
        `);

        const measured = turnaroundResult.rows[0] || {};
        const stageDefinitions = [
            ['checkin', measured.checkin_minutes, measured.checkin_samples, 10],
            ['preparation', measured.prep_minutes, measured.prep_samples, 15],
            ['acquisition', measured.acquisition_minutes, measured.acquisition_samples, 25],
            ['reporting', measured.reporting_minutes, measured.reporting_samples, 45]
        ];

        return {
            liveModalities: modalitiesResult.rows.map(row => ({
                id: row.id,
                name: row.name,
                type: row.type,
                equipmentStatus: row.equipment_status,
                status: row.workflow_status,
                startedAt: row.started_at,
                elapsedMinutes: row.elapsed_minutes === null ? null : parseInt(row.elapsed_minutes),
                updatedAt: row.updated_at
            })),
            turnaroundStages: stageDefinitions
                .map(([key, averageMinutes, sampleSize, targetMinutes]) => ({
                    key,
                    averageMinutes: averageMinutes === null ? null : parseFloat(averageMinutes),
                    sampleSize: parseInt(sampleSize || 0),
                    targetMinutes,
                    withinTarget: averageMinutes === null ? null : parseFloat(averageMinutes) <= targetMinutes
                }))
                .filter(stage => stage.sampleSize > 0)
        };
    }

    /**
     * Get recent activity timeline
     */
    async getRecentActivity(limit = 5, { role = 'Admin', userId = null } = {}) {
        try {
            const params = [limit];
            let assignmentFilter = '';
            let timestampColumn = 'e.report_finalized_at';
            let activityType = 'report';

            if (role === 'Receptionist') {
                timestampColumn = 'e.arrived_at';
                activityType = 'checkin';
            } else if (role === 'Radiologist') {
                params.push(userId);
                assignmentFilter = 'AND e.performing_radiologist_id = $2';
            } else if (role === 'Technician') {
                params.push(userId);
                assignmentFilter = 'AND a.technician_id = $2';
                timestampColumn = 'e.exam_completed_at';
                activityType = 'scan';
            } else if (role === 'Nurse') {
                params.push(userId);
                assignmentFilter = 'AND a.nurse_id = $2';
                timestampColumn = 'e.prep_completed_at';
                activityType = 'preparation';
            }

            const query = `
                SELECT 
                    '${activityType}' as type,
                    'success' as status,
                    p.mrn,
                    m.type as modality,
                    ${timestampColumn} as timestamp
                FROM examinations e
                LEFT JOIN appointments a ON e.appointment_id = a.appointment_id
                JOIN patients p ON e.patient_id = p.patient_id
                LEFT JOIN modalities m ON e.modality_id = m.modality_id
                WHERE ${timestampColumn} IS NOT NULL
                ${assignmentFilter}
                ORDER BY ${timestampColumn} DESC
                LIMIT $1
            `;
            const result = await this.db.query(query, params);

            return result.rows.map(row => ({
                type: row.type,
                status: row.status,
                mrn: row.mrn,
                modality: row.modality,
                timestamp: row.timestamp,
                time: this.getRelativeTime(row.timestamp)
            }));
        } catch (error) {
            logger.error('Error in getRecentActivity:', error);
            return [];
        }
    }

    /**
     * Helper: Calculate percentage change
     */
    calculatePercentageChange(current, previous) {
        if (previous === 0) return current > 0 ? '+100%' : '0%';
        const change = ((current - previous) / previous) * 100;
        return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
    }

    /**
     * Helper: Get weekly sparkline data
     */
    async getWeeklySparkline(type, userId = null) {
        try {
            let query = '';
            const params = [];

            if (type === 'appointments') {
                query = `
                    SELECT DATE(start_time) as date, COUNT(*) as value
                    FROM appointments
                    WHERE start_time >= ${CENTER_BUSINESS_DATE_SQL} - INTERVAL '7 days'
                    GROUP BY DATE(start_time)
                    ORDER BY date
                `;
            } else if (type === 'reports' && userId) {
                query = `
                    SELECT DATE(report_finalized_at) as date, COUNT(*) as value
                    FROM examinations
                    WHERE performing_radiologist_id = $1
                    AND report_finalized_at >= ${CENTER_BUSINESS_DATE_SQL} - INTERVAL '7 days'
                    GROUP BY DATE(report_finalized_at)
                    ORDER BY date
                `;
                params.push(userId);
            } else if (type === 'scans') {
                query = `
                    SELECT DATE(exam_completed_at) as date, COUNT(*) as value
                    FROM examinations
                    WHERE exam_completed_at >= ${CENTER_BUSINESS_DATE_SQL} - INTERVAL '7 days'
                    GROUP BY DATE(exam_completed_at)
                    ORDER BY date
                `;
            } else if (type === 'revenue') {
                query = `
                    SELECT business_date AS date, COALESCE(SUM(amount), 0) / 1000 AS value
                    FROM (
                        SELECT business_date, amount FROM payments WHERE payment_status = 'Completed'
                        UNION ALL SELECT business_date, amount FROM claim_receipts
                        UNION ALL SELECT business_date, -amount FROM refunds WHERE status = 'Processed'
                    ) activity
                    WHERE business_date >= ${CENTER_BUSINESS_DATE_SQL} - 6
                    GROUP BY business_date
                    ORDER BY business_date
                `;
            }

            const result = await this.db.query(query, params);
            return result.rows.map(row => ({ value: parseFloat(row.value) }));
        } catch (error) {
            logger.error('Error in getWeeklySparkline:', error);
            return [];
        }
    }

    /**
     * Helper: Get relative time string
     */
    getRelativeTime(timestamp) {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
}

module.exports = DashboardService;
