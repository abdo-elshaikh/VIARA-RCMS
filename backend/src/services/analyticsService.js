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
     * Get performance metrics (Wait Times, Turnaround Time, Cancellations)
     */
    async getPerformanceMetrics(startDate, endDate) {
        const { start, end } = this.normalizeRange(startDate, endDate);

        // 1. Average Turnaround Time (Completion to Finalized Report) in hours
        const tatQuery = `
            SELECT AVG(EXTRACT(EPOCH FROM (report_finalized_at - exam_completed_at))/3600) as avg_tat_hours
            FROM examinations
            WHERE status = 'Finalized' AND report_finalized_at >= $1::date AND report_finalized_at < ($2::date + INTERVAL '1 day')
        `;

        // 2. Cancellation Rate
        const cancelQuery = `
            SELECT
                COUNT(*) as total_appointments,
                COUNT(CASE WHEN status = 'Cancelled' OR status = 'No-Show' THEN 1 END) as cancelled_count
            FROM appointments
            WHERE start_time >= $1::date AND start_time < ($2::date + INTERVAL '1 day')
        `;

        // 3. Average Wait Time (Check-in to Scanning) in minutes
        const waitQuery = `
            SELECT AVG(EXTRACT(EPOCH FROM (exam_started_at - arrived_at))/60) as avg_wait_minutes
            FROM examinations
            WHERE exam_started_at IS NOT NULL AND arrived_at IS NOT NULL AND arrived_at >= $1::date AND arrived_at < ($2::date + INTERVAL '1 day')
        `;

        const [tatRes, cancelRes, waitRes] = await Promise.all([
            this.db.query(tatQuery, [start, end]),
            this.db.query(cancelQuery, [start, end]),
            this.db.query(waitQuery, [start, end])
        ]);

        const totalApps = parseInt(cancelRes.rows[0].total_appointments, 10) || 0;
        const cancelledApps = parseInt(cancelRes.rows[0].cancelled_count) || 0;

        return {
            averageTurnaroundTimeHours: parseFloat(tatRes.rows[0].avg_tat_hours || 0).toFixed(2),
            averageWaitTimeMinutes: parseFloat(waitRes.rows[0].avg_wait_minutes || 0).toFixed(2),
            cancellationRatePercentage: (totalApps > 0 ? (cancelledApps / totalApps) * 100 : 0).toFixed(2),
            totalAppointments: totalApps,
            cancelledAppointments: cancelledApps
        };
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
        // We join examinations -> invoices to get total revenue generated by each doctor
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
            SELECT v.full_name AS doctor_name, v.clinic_hospital AS clinic_name,
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
                doctorName: row.doctor_name,
                clinicName: row.clinic_name,
                totalExams: parseInt(row.total_exams, 10),
                totalRevenue: parseFloat(row.total_revenue || 0)
            }))
        };
    }
}

module.exports = AnalyticsService;
