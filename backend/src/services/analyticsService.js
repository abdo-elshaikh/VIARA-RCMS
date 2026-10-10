const financialReportService = require('./financialReportService');

class AnalyticsService {
    constructor(db) {
        this.db = db;
    }

    normalizeRange(startDate, endDate) {
        return {
            end: endDate || new Date().toISOString().split('T')[0],
            start: startDate || new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        };
    }

    /**
     * Get study volume grouped by a specific dimension over a date range
     */
    async getStudyVolume(startDate, endDate, groupBy = 'date') {
        const { start, end } = this.normalizeRange(startDate, endDate);

        let query = '';
        const params = [start, end];

        if (groupBy === 'date') {
            query = `
                SELECT DATE(e.exam_started_at) as label, COUNT(*) as value
                FROM examinations e
                WHERE e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                GROUP BY DATE(e.exam_started_at)
                ORDER BY DATE(e.exam_started_at) ASC
            `;
        } else if (groupBy === 'modality') {
            query = `
                SELECT m.name as label, COUNT(e.exam_id) as value
                FROM examinations e
                JOIN modalities m ON e.modality_id = m.modality_id
                WHERE e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                GROUP BY m.name
                ORDER BY value DESC
            `;
        } else if (groupBy === 'doctor') {
            query = `
                SELECT u.full_name as label, COUNT(e.exam_id) as value
                FROM examinations e
                JOIN appointments a ON e.appointment_id = a.appointment_id
                JOIN users u ON e.performing_radiologist_id = u.user_id
                WHERE e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                GROUP BY u.full_name
                ORDER BY value DESC
            `;
        } else if (groupBy === 'payer') {
            query = `
                SELECT COALESCE(p.name, 'Self Pay') AS label, COUNT(DISTINCT e.exam_id)::int AS value
                FROM examinations e
                JOIN appointments a ON a.appointment_id = e.appointment_id
                LEFT JOIN invoices i ON i.exam_id = e.exam_id AND i.invoice_status <> 'Voided'
                LEFT JOIN LATERAL (
                    SELECT ic.provider_id FROM insurance_claims ic
                    WHERE ic.invoice_id = i.invoice_id ORDER BY ic.created_at DESC LIMIT 1
                ) claim ON TRUE
                LEFT JOIN insurance_providers p ON p.provider_id = claim.provider_id
                WHERE e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                GROUP BY COALESCE(p.name, 'Self Pay')
                ORDER BY value DESC
            `;
        } else if (groupBy === 'room' || groupBy === 'reception') {
            const dimension = groupBy === 'room'
                ? "COALESCE(r.name, m.room_number, 'Unassigned room')"
                : "COALESCE(NULLIF(a.receptionist_desk, ''), 'Unassigned reception')";
            query = `
                WITH activity AS (
                    SELECT ${dimension} AS label, i.subtotal_amount - i.discount_amount AS value
                    FROM invoices i
                    JOIN examinations e ON i.exam_id = e.exam_id
                    JOIN modalities m ON e.modality_id = m.modality_id
                    LEFT JOIN rooms r ON m.room_id = r.room_id
                    LEFT JOIN appointments a ON e.appointment_id = a.appointment_id
                    WHERE i.business_date BETWEEN $1::date AND $2::date AND i.invoice_status <> 'Voided'
                    UNION ALL
                    SELECT ${dimension}, -cn.net_amount
                    FROM credit_notes cn
                    JOIN invoices i ON i.invoice_id = cn.invoice_id
                    JOIN examinations e ON i.exam_id = e.exam_id
                    JOIN modalities m ON e.modality_id = m.modality_id
                    LEFT JOIN rooms r ON m.room_id = r.room_id
                    LEFT JOIN appointments a ON e.appointment_id = a.appointment_id
                    WHERE cn.business_date BETWEEN $1::date AND $2::date AND cn.reversed_at IS NULL
                )
                SELECT label, COALESCE(SUM(value), 0) AS value
                FROM activity
                GROUP BY label
                ORDER BY value DESC
            `;
        }

        const result = await this.db.query(query, params);
        return result.rows;
    }

    /**
     * Get revenue metrics
     */
    async getRevenueMetrics(startDate, endDate, groupBy = 'date') {
        const { start, end } = this.normalizeRange(startDate, endDate);

        let query = '';
        const params = [start, end];

        if (groupBy === 'date') {
            const rows = await financialReportService.getRevenue(this.db, {
                startDate: start,
                endDate: end,
                groupBy: 'day'
            });
            return rows.map(row => ({
                label: row.date,
                value: Number(row.net_revenue || 0),
                basis: row.basis
            }));
        } else if (groupBy === 'payer') {
            query = `
                WITH activity AS (
                    SELECT COALESCE(p.name, 'Self Pay') AS label,
                           i.subtotal_amount - i.discount_amount AS value
                    FROM invoices i
                    LEFT JOIN LATERAL (
                        SELECT ic.provider_id FROM insurance_claims ic
                        WHERE ic.invoice_id = i.invoice_id ORDER BY ic.created_at DESC LIMIT 1
                    ) claim ON TRUE
                    LEFT JOIN insurance_providers p ON p.provider_id = claim.provider_id
                    WHERE i.business_date BETWEEN $1::date AND $2::date AND i.invoice_status <> 'Voided'
                    UNION ALL
                    SELECT COALESCE(p.name, 'Self Pay'), -cn.net_amount
                    FROM credit_notes cn
                    JOIN invoices i ON i.invoice_id = cn.invoice_id
                    LEFT JOIN LATERAL (
                        SELECT ic.provider_id FROM insurance_claims ic
                        WHERE ic.invoice_id = i.invoice_id ORDER BY ic.created_at DESC LIMIT 1
                    ) claim ON TRUE
                    LEFT JOIN insurance_providers p ON p.provider_id = claim.provider_id
                    WHERE cn.business_date BETWEEN $1::date AND $2::date AND cn.reversed_at IS NULL
                )
                SELECT label, COALESCE(SUM(value), 0) AS value FROM activity GROUP BY label
                ORDER BY value DESC
            `;
        } else if (groupBy === 'modality') {
            query = `
                WITH activity AS (
                    SELECT m.name AS label, i.subtotal_amount - i.discount_amount AS value
                    FROM invoices i
                    JOIN examinations e ON i.exam_id = e.exam_id
                    JOIN modalities m ON e.modality_id = m.modality_id
                    WHERE i.business_date BETWEEN $1::date AND $2::date AND i.invoice_status <> 'Voided'
                    UNION ALL
                    SELECT m.name, -cn.net_amount
                    FROM credit_notes cn
                    JOIN invoices i ON i.invoice_id = cn.invoice_id
                    JOIN examinations e ON i.exam_id = e.exam_id
                    JOIN modalities m ON e.modality_id = m.modality_id
                    WHERE cn.business_date BETWEEN $1::date AND $2::date AND cn.reversed_at IS NULL
                )
                SELECT label, COALESCE(SUM(value), 0) AS value FROM activity GROUP BY label
                ORDER BY value DESC
            `;
        }

        const result = await this.db.query(query, params);
        return result.rows;
    }

    /**
     * Get performance metrics (Multi-stage TAT, SLA compliance, Cancellations, Wait Times)
     */
    async getPerformanceMetrics(startDate, endDate, modalityId = null) {
        const { start, end } = this.normalizeRange(startDate, endDate);

        const modalityFilter = modalityId ? 'AND e.modality_id = $3' : '';
        const params = modalityId ? [start, end, modalityId] : [start, end];

        // 1. Multi-stage Turnaround Times & SLA Compliance
        const tatQuery = `
            SELECT
                AVG(GREATEST(0, EXTRACT(EPOCH FROM (e.report_finalized_at - e.exam_completed_at))/3600)) as avg_tat_hours,
                AVG(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(e.reporting_started_at, e.typed_at, e.reviewed_at, e.report_finalized_at) - e.exam_completed_at))/3600)) as avg_draft_hours,
                AVG(GREATEST(0, EXTRACT(EPOCH FROM (e.report_finalized_at - COALESCE(e.reporting_started_at, e.typed_at, e.reviewed_at, e.exam_completed_at)))/3600)) as avg_sign_hours,
                AVG(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(e.exam_completed_at, e.exam_started_at + INTERVAL '20 minutes') - e.exam_started_at))/60)) as avg_scan_minutes,
                COUNT(CASE WHEN a.priority::text IN ('Urgent', 'Emergency', 'STAT') THEN 1 END) as stat_count,
                COUNT(CASE WHEN a.priority::text IN ('Urgent', 'Emergency', 'STAT') AND EXTRACT(EPOCH FROM (e.report_finalized_at - e.exam_completed_at))/3600 <= 2 THEN 1 END) as stat_on_time_count,
                COUNT(CASE WHEN a.priority::text NOT IN ('Urgent', 'Emergency', 'STAT') OR a.priority IS NULL THEN 1 END) as routine_count,
                COUNT(CASE WHEN (a.priority::text NOT IN ('Urgent', 'Emergency', 'STAT') OR a.priority IS NULL) AND EXTRACT(EPOCH FROM (e.report_finalized_at - e.exam_completed_at))/3600 <= 24 THEN 1 END) as routine_on_time_count
            FROM examinations e
            LEFT JOIN appointments a ON e.appointment_id = a.appointment_id
            WHERE e.status = 'Finalized'
              AND e.report_finalized_at >= $1::date
              AND e.report_finalized_at < ($2::date + INTERVAL '1 day')
              ${modalityFilter}
        `;

        // 2. Cancellation Rate
        const cancelQuery = `
            SELECT
                COUNT(*) as total_appointments,
                COUNT(CASE WHEN status = 'Cancelled' OR status = 'No-Show' THEN 1 END) as cancelled_count
            FROM appointments
            WHERE start_time >= $1::date AND start_time < ($2::date + INTERVAL '1 day')
        `;

        // 3. Average Wait Time (Check-in to Scanning) in minutes & Contrast Metrics
        const waitAndSafetyQuery = `
            SELECT
                AVG(GREATEST(0, EXTRACT(EPOCH FROM (e.exam_started_at - e.arrived_at))/60)) as avg_wait_minutes,
                COUNT(e.exam_id) as total_scans,
                COUNT(CASE WHEN e.contrast_required = TRUE OR et.contrast_required = TRUE THEN 1 END) as contrast_count,
                COUNT(CASE WHEN (e.contrast_required = TRUE OR et.contrast_required = TRUE) AND (e.renal_safety_status IS NOT NULL OR e.pregnancy_safety_status IS NOT NULL OR e.implant_safety_status IS NOT NULL) THEN 1 END) as contrast_safety_checked_count
            FROM examinations e
            LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
            WHERE e.exam_started_at IS NOT NULL
              AND e.arrived_at IS NOT NULL
              AND e.arrived_at >= $1::date
              AND e.arrived_at < ($2::date + INTERVAL '1 day')
              ${modalityFilter}
        `;

        const [tatRes, cancelRes, waitRes] = await Promise.all([
            this.db.query(tatQuery, params),
            this.db.query(cancelQuery, [start, end]),
            this.db.query(waitAndSafetyQuery, params)
        ]);

        const tatRow = tatRes.rows[0] || {};
        const waitRow = waitRes.rows[0] || {};
        const totalApps = parseInt(cancelRes.rows[0]?.total_appointments, 10) || 0;
        const cancelledApps = parseInt(cancelRes.rows[0]?.cancelled_count, 10) || 0;

        const statTotal = parseInt(tatRow.stat_count, 10) || 0;
        const statOnTime = parseInt(tatRow.stat_on_time_count, 10) || 0;
        const routineTotal = parseInt(tatRow.routine_count, 10) || 0;
        const routineOnTime = parseInt(tatRow.routine_on_time_count, 10) || 0;

        const totalScans = parseInt(waitRow.total_scans, 10) || 0;
        const contrastCount = parseInt(waitRow.contrast_count, 10) || 0;
        const contrastSafeCount = parseInt(waitRow.contrast_safety_checked_count, 10) || 0;

        return {
            averageTurnaroundTimeHours: parseFloat(tatRow.avg_tat_hours || 0).toFixed(2),
            averageDraftTimeHours: parseFloat(tatRow.avg_draft_hours || 0).toFixed(2),
            averageSignTimeHours: parseFloat(tatRow.avg_sign_hours || 0).toFixed(2),
            averageScanMinutes: parseFloat(tatRow.avg_scan_minutes || 0).toFixed(1),
            averageWaitTimeMinutes: parseFloat(waitRow.avg_wait_minutes || 0).toFixed(2),
            cancellationRatePercentage: (totalApps > 0 ? (cancelledApps / totalApps) * 100 : 0).toFixed(2),
            totalAppointments: totalApps,
            cancelledAppointments: cancelledApps,
            statSlaCompliancePct: (statTotal > 0 ? (statOnTime / statTotal) * 100 : 100).toFixed(1),
            routineSlaCompliancePct: (routineTotal > 0 ? (routineOnTime / routineTotal) * 100 : 100).toFixed(1),
            contrastCount,
            contrastRatioPct: (totalScans > 0 ? (contrastCount / totalScans) * 100 : 0).toFixed(1),
            contrastSafetyCompliancePct: (contrastCount > 0 ? (contrastSafeCount / contrastCount) * 100 : 100).toFixed(1)
        };
    }

    /**
     * Get real peak hours distribution across 24 hours and calculate capacity utilization
     */
    async getPeakHoursMetrics(startDate, endDate, modalityId = null) {
        const { start, end } = this.normalizeRange(startDate, endDate);
        const params = [start, end];
        let modalityClause = '';
        if (modalityId) {
            params.push(modalityId);
            modalityClause = 'AND e.modality_id = $3';
        }

        const query = `
            WITH hours AS (
                SELECT generate_series(7, 21) AS hr
            ), hourly_scans AS (
                SELECT
                    EXTRACT(HOUR FROM e.exam_started_at)::int AS scan_hour,
                    COUNT(e.exam_id)::int AS study_count,
                    AVG(EXTRACT(EPOCH FROM (COALESCE(e.exam_completed_at, e.exam_started_at + INTERVAL '20 minutes') - e.exam_started_at))/60) AS avg_duration_min
                FROM examinations e
                WHERE e.exam_started_at >= $1::date
                  AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                  ${modalityClause}
                GROUP BY EXTRACT(HOUR FROM e.exam_started_at)::int
            ), active_days AS (
                SELECT GREATEST(1, COUNT(DISTINCT DATE(e.exam_started_at)))::int AS days_count
                FROM examinations e
                WHERE e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
            )
            SELECT
                LPAD(h.hr::text, 2, '0') || ':00' AS hour,
                COALESCE(ROUND(hs.study_count::numeric / NULLIF(d.days_count, 0), 1), 0)::float AS avg_studies,
                COALESCE(hs.study_count, 0) AS total_studies,
                COALESCE(ROUND(hs.avg_duration_min::numeric, 0), 20)::int AS avg_duration_minutes,
                LEAST(100, ROUND(COALESCE(hs.study_count::numeric / NULLIF(d.days_count * 4.0, 0) * 100, 0), 1))::float AS capacity_percentage
            FROM hours h
            CROSS JOIN active_days d
            LEFT JOIN hourly_scans hs ON hs.scan_hour = h.hr
            ORDER BY h.hr ASC
        `;

        const result = await this.db.query(query, params);
        const rows = result.rows;

        // Find peak window
        let peakHour = '11:00';
        let maxStudies = 0;
        rows.forEach(r => {
            if (r.total_studies > maxStudies) {
                maxStudies = r.total_studies;
                peakHour = r.hour;
            }
        });

        return {
            hourlyData: rows.map(r => ({
                hour: r.hour,
                studies: r.total_studies,
                avgStudiesPerDay: r.avg_studies,
                capacity: r.capacity_percentage,
                avgDurationMinutes: r.avg_duration_minutes
            })),
            peakHour,
            peakWindowAr: '10:00 ص - 04:00 م',
            peakWindowEn: '10:00 AM - 04:00 PM'
        };
    }

    /**
     * Get machine/equipment utilization metrics
     */
    async getEquipmentUtilization(startDate, endDate) {
        const { start, end } = this.normalizeRange(startDate, endDate);

        const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000)) + 1);
        const operatingHoursPerDay = 12;
        const totalAvailableHours = days * operatingHoursPerDay;

        const query = `
            WITH exam_stats AS (
                SELECT
                    m.modality_id,
                    m.name AS modality_name,
                    m.type AS modality_type,
                    COUNT(e.exam_id)::int AS study_count,
                    COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(e.exam_completed_at, e.exam_started_at + INTERVAL '25 minutes') - e.exam_started_at))/3600), 0) AS busy_hours,
                    AVG(EXTRACT(EPOCH FROM (COALESCE(e.exam_completed_at, e.exam_started_at + INTERVAL '25 minutes') - e.exam_started_at))/60) AS avg_duration_min
                FROM modalities m
                LEFT JOIN examinations e ON e.modality_id = m.modality_id
                    AND e.exam_started_at >= $1::date
                    AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                GROUP BY m.modality_id, m.name, m.type
            ), revenue_stats AS (
                SELECT
                    e.modality_id,
                    SUM(i.subtotal_amount - i.discount_amount) AS net_revenue
                FROM invoices i
                JOIN examinations e ON e.exam_id = i.exam_id
                WHERE i.invoice_status <> 'Voided'
                  AND i.business_date BETWEEN $1::date AND $2::date
                GROUP BY e.modality_id
            )
            SELECT
                es.modality_id,
                es.modality_name,
                es.modality_type,
                es.study_count,
                ROUND(es.busy_hours::numeric, 1)::float AS busy_hours,
                ROUND(es.avg_duration_min::numeric, 0)::int AS avg_duration_minutes,
                LEAST(100, ROUND((es.busy_hours / NULLIF($3::numeric, 0)) * 100, 1))::float AS utilization_pct,
                COALESCE(rs.net_revenue, 0)::float AS total_revenue,
                CASE WHEN es.study_count > 0 THEN ROUND((COALESCE(rs.net_revenue, 0) / es.study_count)::numeric, 0)::float ELSE 0 END AS revenue_per_study
            FROM exam_stats es
            LEFT JOIN revenue_stats rs ON rs.modality_id = es.modality_id
            ORDER BY es.study_count DESC, es.modality_name ASC
        `;

        const result = await this.db.query(query, [start, end, totalAvailableHours]);
        return result.rows;
    }

    /**
     * Get top requested procedures/exam types
     */
    async getTopProcedures(startDate, endDate, limit = 10) {
        const { start, end } = this.normalizeRange(startDate, endDate);

        const query = `
            WITH exam_activity AS (
                SELECT
                    et.type_id AS exam_type_id,
                    et.name AS exam_name,
                    et.code AS exam_code,
                    m.name AS modality_name,
                    COUNT(e.exam_id)::int AS study_count,
                    AVG(EXTRACT(EPOCH FROM (COALESCE(e.exam_completed_at, e.exam_started_at + INTERVAL '20 minutes') - e.exam_started_at))/60) AS avg_duration_min,
                    COUNT(CASE WHEN et.contrast_required = TRUE OR e.contrast_required = TRUE THEN 1 END)::int AS contrast_count
                FROM examinations e
                JOIN examination_types et ON e.exam_type_id = et.type_id
                LEFT JOIN modalities m ON e.modality_id = m.modality_id
                WHERE e.exam_started_at >= $1::date
                  AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                GROUP BY et.type_id, et.name, et.code, m.name
            ), revenue_activity AS (
                SELECT
                    e.exam_type_id,
                    SUM(i.subtotal_amount - i.discount_amount) AS net_revenue
                FROM invoices i
                JOIN examinations e ON e.exam_id = i.exam_id
                WHERE i.invoice_status <> 'Voided'
                  AND i.business_date BETWEEN $1::date AND $2::date
                GROUP BY e.exam_type_id
            ), totals AS (
                SELECT GREATEST(1, COUNT(exam_id)) AS total_all_studies FROM examinations
                WHERE exam_started_at >= $1::date AND exam_started_at < ($2::date + INTERVAL '1 day')
            )
            SELECT
                ea.exam_type_id,
                ea.exam_name,
                ea.exam_code,
                ea.modality_name,
                ea.study_count,
                ROUND(ea.avg_duration_min::numeric, 0)::int AS avg_duration_minutes,
                ea.contrast_count,
                COALESCE(ra.net_revenue, 0)::float AS total_revenue,
                ROUND((ea.study_count::numeric / t.total_all_studies * 100), 1)::float AS volume_share_pct,
                CASE WHEN ea.study_count > 0 THEN ROUND((COALESCE(ra.net_revenue, 0) / ea.study_count)::numeric, 0)::float ELSE 0 END AS revenue_per_study
            FROM exam_activity ea
            CROSS JOIN totals t
            LEFT JOIN revenue_activity ra ON ra.exam_type_id = ea.exam_type_id
            ORDER BY ea.study_count DESC
            LIMIT $3
        `;

        const result = await this.db.query(query, [start, end, limit]);
        return result.rows;
    }

    /**
     * Get referral and marketing metrics
     */
    async getReferralMetrics(startDate, endDate) {
        const { start, end } = this.normalizeRange(startDate, endDate);

        // 1. Volume by Appointment Source (Walk-in, Phone, etc.)
        const sourceQuery = `
            SELECT a.appointment_source as label, COUNT(e.exam_id) as value
            FROM examinations e
            JOIN appointments a ON a.appointment_id = e.appointment_id
            WHERE e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
            GROUP BY a.appointment_source
            ORDER BY value DESC
        `;

        // 2. Volume and Revenue by Referring Doctor
        const docQuery = `
            WITH volume AS (
                SELECT d.doctor_id, d.full_name, d.clinic_hospital,
                       COUNT(DISTINCT e.exam_id)::int AS total_exams
                FROM referring_doctors d
                JOIN appointments a ON a.referring_doctor_id = d.doctor_id
                LEFT JOIN examinations e ON e.appointment_id = a.appointment_id
                WHERE e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                GROUP BY d.doctor_id, d.full_name, d.clinic_hospital
            ), activity AS (
                SELECT a.referring_doctor_id AS doctor_id,
                       i.subtotal_amount - i.discount_amount AS amount
                FROM invoices i
                JOIN examinations e ON e.exam_id = i.exam_id
                JOIN appointments a ON a.appointment_id = e.appointment_id
                WHERE i.invoice_status <> 'Voided'
                  AND e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
                UNION ALL
                SELECT a.referring_doctor_id, -c.net_amount
                FROM credit_notes c
                JOIN invoices i ON i.invoice_id = c.invoice_id
                JOIN examinations e ON e.exam_id = i.exam_id
                JOIN appointments a ON a.appointment_id = e.appointment_id
                WHERE c.reversed_at IS NULL
                  AND e.exam_started_at >= $1::date AND e.exam_started_at < ($2::date + INTERVAL '1 day')
            ), revenue AS (
                SELECT doctor_id, SUM(amount) AS total_revenue FROM activity GROUP BY doctor_id
            )
            SELECT v.doctor_id, v.full_name AS doctor_name, v.clinic_hospital AS clinic_name,
                   v.total_exams, COALESCE(r.total_revenue, 0) AS total_revenue
            FROM volume v
            LEFT JOIN revenue r ON r.doctor_id = v.doctor_id
            ORDER BY total_revenue DESC NULLS LAST
        `;

        const [sourceRes, docRes] = await Promise.all([
            this.db.query(sourceQuery, [start, end]),
            this.db.query(docQuery, [start, end])
        ]);

        return {
            sources: sourceRes.rows.map(row => ({
                label: row.label || 'Walk-in',
                value: parseInt(row.value, 10)
            })),
            topDoctors: docRes.rows.map(row => ({
                doctorId: row.doctor_id,
                doctorName: row.doctor_name,
                clinicName: row.clinic_name,
                totalExams: parseInt(row.total_exams, 10),
                totalRevenue: parseFloat(row.total_revenue || 0)
            }))
        };
    }
}

module.exports = AnalyticsService;
