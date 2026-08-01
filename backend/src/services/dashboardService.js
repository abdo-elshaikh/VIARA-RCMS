/**
 * Dashboard Service - Data Aggregation Layer
 * Handles complex queries for dashboard statistics
 */
const logger = require('../config/logger');

class DashboardService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get receptionist-specific statistics
     */
    async getReceptionistStats() {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Today's check-ins count
            const checkInsQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE DATE(arrived_at) = $1
            `;
            const checkInsResult = await this.db.query(checkInsQuery, [today]);
            const todayCheckIns = parseInt(checkInsResult.rows[0].count);

            // Yesterday's check-ins for comparison
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const yesterdayCheckInsResult = await this.db.query(checkInsQuery, [yesterday]);
            const yesterdayCheckIns = parseInt(yesterdayCheckInsResult.rows[0].count);

            // Appointments count and pending
            const appointmentsQuery = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'Confirmed' THEN 1 END) as pending
                FROM appointments
                WHERE DATE(start_time) = $1
            `;
            const appointmentsResult = await this.db.query(appointmentsQuery, [today]);
            const appointments = appointmentsResult.rows[0];

            // Waiting room count (checked-in but not yet scanning/completed)
            const waitingQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE status IN ('Checked-in', 'Scheduled')
                AND DATE(created_at) = $1
            `;
            const waitingResult = await this.db.query(waitingQuery, [today]);
            const waitingRoom = parseInt(waitingResult.rows[0].count);

            // Completed today
            const completedQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE status = 'Finalized'
                AND DATE(report_finalized_at) = $1
            `;
            const completedResult = await this.db.query(completedQuery, [today]);
            const completed = parseInt(completedResult.rows[0].count);

            const yesterdayCompletedResult = await this.db.query(completedQuery, [yesterday]);
            const yesterdayCompleted = parseInt(yesterdayCompletedResult.rows[0].count);

            const averageWaitQuery = `
                SELECT COALESCE(
                    ROUND(AVG(EXTRACT(EPOCH FROM (exam_started_at - arrived_at)) / 60)),
                    0
                ) as minutes
                FROM examinations
                WHERE DATE(COALESCE(arrived_at, created_at)) = $1
                AND arrived_at IS NOT NULL
                AND exam_started_at IS NOT NULL
                AND exam_started_at >= arrived_at
            `;
            const averageWaitResult = await this.db.query(averageWaitQuery, [today]);

            // Patient flow data (hourly breakdown)
            const flowQuery = `
                SELECT 
                    TO_CHAR(start_time, 'HH24:00') as time,
                    COUNT(CASE WHEN e.status IN ('Scheduled', 'Checked-in') THEN 1 END) as waiting,
                    COUNT(CASE WHEN e.status IN ('Scanning', 'Reporting') THEN 1 END) as in_progress,
                    COUNT(CASE WHEN e.status = 'Finalized' THEN 1 END) as completed
                FROM appointments a
                LEFT JOIN examinations e ON a.appointment_id = e.appointment_id
                WHERE DATE(a.start_time) = $1
                GROUP BY TO_CHAR(start_time, 'HH24:00')
                ORDER BY time
            `;
            const flowResult = await this.db.query(flowQuery, [today]);

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
                    completion: 'e.report_finalized_at',
                    cycleStart: 'e.exam_completed_at',
                    cycleMetric: 'report'
                },
                Technician: {
                    join: 'JOIN appointments a ON e.appointment_id = a.appointment_id',
                    assignment: 'a.technician_id = $1',
                    completion: 'e.exam_completed_at',
                    cycleStart: 'e.exam_started_at',
                    cycleMetric: 'scan'
                },
                Nurse: {
                    join: 'JOIN appointments a ON e.appointment_id = a.appointment_id',
                    assignment: 'a.nurse_id = $1',
                    completion: 'e.prep_completed_at',
                    cycleStart: 'e.prep_started_at',
                    cycleMetric: 'preparation'
                }
            }[role] || null;

            if (!roleConfig) throw new Error(`Unsupported clinical dashboard role: ${role}`);

            const pendingCondition = `${roleConfig.completion} IS NULL AND e.status != 'Finalized'`;
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

            const today = new Date().toISOString().split('T')[0];
            const completedTodayQuery = `
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND DATE(${roleConfig.completion}) = $2
            `;
            const completedTodayResult = await this.db.query(completedTodayQuery, [userId, today]);
            const completedToday = parseInt(completedTodayResult.rows[0].count);

            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const completedYesterdayResult = await this.db.query(completedTodayQuery, [userId, yesterday]);
            const completedYesterday = parseInt(completedYesterdayResult.rows[0].count);

            const weekStartQuery = `
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND ${roleConfig.completion} >= DATE_TRUNC('week', CURRENT_DATE)
            `;
            const weekResult = await this.db.query(weekStartQuery, [userId]);
            const thisWeek = parseInt(weekResult.rows[0].count);

            const previousWeekQuery = `
                SELECT COUNT(*) as count
                FROM examinations e
                ${roleConfig.join}
                WHERE ${roleConfig.assignment}
                AND ${roleConfig.completion} >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
                AND ${roleConfig.completion} < DATE_TRUNC('week', CURRENT_DATE)
            `;
            const previousWeekResult = await this.db.query(previousWeekQuery, [userId]);
            const previousWeek = parseInt(previousWeekResult.rows[0].count);

            const turnaroundQuery = `
                SELECT
                    COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (${roleConfig.completion} - ${roleConfig.cycleStart})) / 3600)
                        FILTER (WHERE ${roleConfig.completion} >= DATE_TRUNC('week', CURRENT_DATE) AND ${roleConfig.cycleStart} IS NOT NULL))::numeric, 1), 0) as avg_hours,
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

            return {
                cycleMetric: roleConfig.cycleMetric,
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
     * Get admin-specific statistics
     */
    async getAdminStats() {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Total scans this week
            const scansQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
            `;
            const scansResult = await this.db.query(scansQuery);
            const totalScans = parseInt(scansResult.rows[0].count);

            const previousScansQuery = `
                SELECT COUNT(*) as count
                FROM examinations
                WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
                AND created_at < DATE_TRUNC('week', CURRENT_DATE)
            `;
            const previousScansResult = await this.db.query(previousScansQuery);
            const previousScans = parseInt(previousScansResult.rows[0].count);

            // Net collections (this week)
            const revenueQuery = `
                SELECT
                    COALESCE((SELECT SUM(amount) FROM payments
                              WHERE business_date >= DATE_TRUNC('week', CURRENT_DATE)::date
                                AND payment_status = 'Completed'), 0)
                    + COALESCE((SELECT SUM(amount) FROM claim_receipts
                                WHERE business_date >= DATE_TRUNC('week', CURRENT_DATE)::date), 0)
                    - COALESCE((SELECT SUM(amount) FROM refunds
                                WHERE business_date >= DATE_TRUNC('week', CURRENT_DATE)::date
                                  AND status = 'Processed'), 0) AS total
            `;
            const revenueResult = await this.db.query(revenueQuery);
            const revenue = parseFloat(revenueResult.rows[0].total);

            const previousRevenueQuery = `
                SELECT
                    COALESCE((SELECT SUM(amount) FROM payments
                              WHERE business_date >= (DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days')::date
                                AND business_date < DATE_TRUNC('week', CURRENT_DATE)::date
                                AND payment_status = 'Completed'), 0)
                    + COALESCE((SELECT SUM(amount) FROM claim_receipts
                                WHERE business_date >= (DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days')::date
                                  AND business_date < DATE_TRUNC('week', CURRENT_DATE)::date), 0)
                    - COALESCE((SELECT SUM(amount) FROM refunds
                                WHERE business_date >= (DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days')::date
                                  AND business_date < DATE_TRUNC('week', CURRENT_DATE)::date
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
                    COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as scans_today
                FROM examinations
            `;
            const operationalResult = await this.db.query(operationalQuery);

            const leaveQuery = `
                SELECT COUNT(DISTINCT user_id) as count
                FROM leave_requests
                WHERE status = 'Approved'
                AND CURRENT_DATE BETWEEN start_date AND end_date
            `;
            const leaveResult = await this.db.query(leaveQuery);

            // Weekly scan volume data with revenue
            const weeklyDataQuery = `
                WITH days AS (
                    SELECT generate_series(DATE_TRUNC('week', CURRENT_DATE)::date, CURRENT_DATE, '1 day')::date AS day
                ), cash AS (
                    SELECT business_date AS day, SUM(amount) AS amount FROM (
                        SELECT business_date, amount FROM payments WHERE payment_status = 'Completed'
                        UNION ALL SELECT business_date, amount FROM claim_receipts
                        UNION ALL SELECT business_date, -amount FROM refunds WHERE status = 'Processed'
                    ) activity
                    WHERE business_date >= DATE_TRUNC('week', CURRENT_DATE)::date
                    GROUP BY business_date
                )
                SELECT d.day AS date, TO_CHAR(d.day, 'Dy') AS name,
                       COALESCE((SELECT COUNT(*) FROM examinations e WHERE e.created_at::date = d.day), 0)::int AS scans,
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
                WHERE e.created_at >= DATE_TRUNC('week', CURRENT_DATE)
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
     * Get recent activity timeline
     */
    async getRecentActivity(limit = 5) {
        try {
            const query = `
                SELECT 
                    'scan' as type,
                    'success' as status,
                    p.mrn,
                    m.type as modality,
                    e.report_finalized_at as timestamp
                FROM examinations e
                JOIN patients p ON e.patient_id = p.patient_id
                LEFT JOIN modalities m ON e.modality_id = m.modality_id
                WHERE e.status = 'Finalized'
                AND e.report_finalized_at IS NOT NULL
                ORDER BY e.report_finalized_at DESC
                LIMIT $1
            `;
            const result = await this.db.query(query, [limit]);

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
                    WHERE start_time >= CURRENT_DATE - INTERVAL '7 days'
                    GROUP BY DATE(start_time)
                    ORDER BY date
                `;
            } else if (type === 'reports' && userId) {
                query = `
                    SELECT DATE(report_finalized_at) as date, COUNT(*) as value
                    FROM examinations
                    WHERE performing_radiologist_id = $1
                    AND report_finalized_at >= CURRENT_DATE - INTERVAL '7 days'
                    GROUP BY DATE(report_finalized_at)
                    ORDER BY date
                `;
                params.push(userId);
            } else if (type === 'scans') {
                query = `
                    SELECT DATE(created_at) as date, COUNT(*) as value
                    FROM examinations
                    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
                    GROUP BY DATE(created_at)
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
                    WHERE business_date >= CURRENT_DATE - 6
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
