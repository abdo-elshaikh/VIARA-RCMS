const { getRequestQuery } = require('../utils/requestQuery');
const { decrypt } = require('../utils/crypto');
const financialReportService = require('../services/financialReportService');
const { DEFAULT_COMMISSION_PERCENTAGE } = require('../services/financialPostingService');

const getRevenueReport = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getRevenue(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

const getOutstandingClaims = (db) => async (req, res, next) => {
    try {
        const range = financialReportService.normalizeRange(getRequestQuery(req));
        const query = `
            SELECT i.invoice_id, p.mrn, p.first_name_enc, p.last_name_enc,
                   i.branch_id,
                   i.insurance_covered_amount,
                   GREATEST(0, i.insurance_covered_amount
                     - COALESCE((SELECT SUM(cr.amount) FROM claim_receipts cr
                                 WHERE cr.invoice_id = i.invoice_id AND cr.business_date <= $2::date), 0)
                     - COALESCE((SELECT SUM(c.insurance_amount) FROM credit_notes c
                                 WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL
                                   AND c.business_date <= $2::date), 0)
                     - COALESCE((SELECT SUM(ic.expected_amount) FROM insurance_claims ic
                                 WHERE ic.invoice_id = i.invoice_id AND ic.status = 'Written Off'), 0)
                   ) AS outstanding_amount,
                   i.business_date AS generated_at,
                   $2::date AS as_of_date
            FROM invoices i
            JOIN patients p ON i.patient_id = p.patient_id
            WHERE i.invoice_status <> 'Voided'
              AND i.branch_id = $1
              AND i.business_date BETWEEN $3::date AND $2::date
              AND i.insurance_covered_amount > 0
              AND GREATEST(0, i.insurance_covered_amount
                    - COALESCE((SELECT SUM(cr.amount) FROM claim_receipts cr
                                WHERE cr.invoice_id = i.invoice_id AND cr.business_date <= $2::date), 0)
                    - COALESCE((SELECT SUM(c.insurance_amount) FROM credit_notes c
                                WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL
                                  AND c.business_date <= $2::date), 0)
                    - COALESCE((SELECT SUM(ic.expected_amount) FROM insurance_claims ic
                                WHERE ic.invoice_id = i.invoice_id AND ic.status = 'Written Off'), 0)
                  ) > 0
            ORDER BY i.business_date ASC
        `;
        const result = await db.query(query, [range.branchId, range.asOf, range.start]);

        const mappedRows = result.rows.map(row => {
            const mapped = { ...row };
            if (row.first_name_enc || row.last_name_enc) {
                mapped.patient_name = [decrypt(row.first_name_enc), decrypt(row.last_name_enc)]
                    .filter(Boolean)
                    .join(' ');
            }
            delete mapped.first_name_enc;
            delete mapped.last_name_enc;
            return mapped;
        });

        res.json(mappedRows);
    } catch (error) {
        next(error);
    }
};

// Phase 15: Receivables Aging Report
const getReceivablesAging = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getReceivablesAging(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

// Phase 15: Doctor Commissions with Payables Integration
const getDoctorCommissions = (db) => async (req, res, next) => {
    try {
        const range = financialReportService.normalizeRange(getRequestQuery(req));

        const query = `
            WITH period_activity AS (
                SELECT
                    rd.doctor_id,
                    COALESCE(rd.full_name, 'Unassigned') as doctor_name,
                    1 AS exam_count,
                    (i.subtotal_amount - i.discount_amount) AS exam_value,
                    (i.subtotal_amount - i.discount_amount) * (COALESCE(rd.commission_percentage, $4) / 100.0) AS commission_amount
                FROM examinations e
                JOIN appointments a ON e.appointment_id = a.appointment_id
                JOIN referring_doctors rd ON a.referring_doctor_id = rd.doctor_id
                JOIN invoices i ON e.exam_id = i.exam_id
                WHERE i.invoice_status <> 'Voided'
                  AND i.business_date BETWEEN $1::date AND $2::date
                  AND i.branch_id = $3
                UNION ALL
                SELECT rd.doctor_id, COALESCE(rd.full_name, 'Unassigned'), 0,
                       -c.net_amount,
                       -c.net_amount * (COALESCE(rd.commission_percentage, $4) / 100.0)
                FROM credit_notes c
                JOIN invoices i ON i.invoice_id = c.invoice_id
                JOIN examinations e ON e.exam_id = i.exam_id
                JOIN appointments a ON e.appointment_id = a.appointment_id
                JOIN referring_doctors rd ON a.referring_doctor_id = rd.doctor_id
                WHERE c.reversed_at IS NULL
                  AND c.business_date BETWEEN $1::date AND $2::date
                  AND c.branch_id = $3
            ), period_earned AS (
                SELECT doctor_id, doctor_name,
                       SUM(exam_count)::int AS total_exams,
                       COALESCE(SUM(exam_value), 0) AS total_exam_value,
                       COALESCE(SUM(commission_amount), 0) AS commission_est
                FROM period_activity
                GROUP BY doctor_id, doctor_name
            ),
            period_paid AS (
                SELECT
                    doctor_id,
                    SUM(amount) as total_paid
                FROM commission_payables
                WHERE status = 'Paid'
                  AND business_date BETWEEN $1::date AND $2::date
                  AND branch_id = $3
                GROUP BY doctor_id
            ), lifetime_earned AS (
                SELECT rd.doctor_id, MAX(COALESCE(rd.full_name, 'Unassigned')) AS doctor_name,
                       COALESCE(SUM(GREATEST(0,
                           i.subtotal_amount - i.discount_amount
                           - COALESCE((SELECT SUM(c.net_amount)
                                       FROM credit_notes c
                                       WHERE c.invoice_id = i.invoice_id
                                         AND c.reversed_at IS NULL), 0)
                       ) * (COALESCE(rd.commission_percentage, $4) / 100.0)), 0) AS commission_est
                FROM invoices i
                JOIN examinations e ON e.exam_id = i.exam_id
                JOIN appointments a ON a.appointment_id = e.appointment_id
                JOIN referring_doctors rd ON rd.doctor_id = a.referring_doctor_id
                WHERE i.invoice_status <> 'Voided' AND i.branch_id = $3
                GROUP BY rd.doctor_id
            ), lifetime_paid AS (
                SELECT doctor_id, COALESCE(SUM(amount), 0) AS total_paid
                FROM commission_payables
                WHERE status = 'Paid' AND branch_id = $3
                GROUP BY doctor_id
            )
            SELECT
                le.doctor_id,
                le.doctor_name,
                COALESCE(pe.total_exams, 0) AS total_exams,
                COALESCE(pe.total_exam_value, 0) AS total_exam_value,
                COALESCE(pe.commission_est, 0) AS commission_est,
                COALESCE(pp.total_paid, 0) AS commission_paid,
                GREATEST(0, le.commission_est - COALESCE(lp.total_paid, 0)) AS commission_pending
            FROM lifetime_earned le
            LEFT JOIN period_earned pe ON le.doctor_id = pe.doctor_id
            LEFT JOIN period_paid pp ON le.doctor_id = pp.doctor_id
            LEFT JOIN lifetime_paid lp ON le.doctor_id = lp.doctor_id
            ORDER BY commission_pending DESC, commission_est DESC
        `;
        const result = await db.query(query, [range.start, range.end, range.branchId, DEFAULT_COMMISSION_PERCENTAGE]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

// Phase 15: Tax Summary
const getTaxSummary = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getTaxSummary(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

// Phase 15: Profit & Loss
const getProfitAndLoss = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getProfitAndLoss(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

// Advanced: Profit & Loss as a day/month/year time series
const getProfitAndLossSeries = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getProfitAndLossSeries(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

// Advanced: cash flow as a day/month/year time series
const getCashFlowSeries = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getCashFlowSeries(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

// Advanced: discount detection report with governance anomaly flags
const getDiscountReport = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getDiscountReport(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

const getTrialBalance = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getTrialBalance(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

const getJournalLedger = (db) => async (req, res, next) => {
    try {
        res.json(await financialReportService.getJournalLedger(db, getRequestQuery(req)));
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRevenueReport,
    getOutstandingClaims,
    getDoctorCommissions,
    getReceivablesAging,
    getTaxSummary,
    getProfitAndLoss,
    getProfitAndLossSeries,
    getCashFlowSeries,
    getDiscountReport,
    getTrialBalance,
    getJournalLedger
};
