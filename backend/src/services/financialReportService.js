const { AppError } = require('../middleware/errorHandler');
const {
    DEFAULT_BRANCH_ID,
    DEFAULT_COMMISSION_PERCENTAGE,
    moneyNumber
} = require('./financialPostingService');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GROUPINGS = new Set(['day', 'week', 'month', 'year']);

const normalizeRange = ({ startDate, endDate, start, end, asOfDate, groupBy = 'day', branchId } = {}) => {
    const today = new Date().toISOString().slice(0, 10);
    const normalizedStart = startDate || start || '1970-01-01';
    const normalizedEnd = endDate || end || today;
    const asOf = asOfDate || normalizedEnd;
    if (![normalizedStart, normalizedEnd, asOf].every(value => DATE_PATTERN.test(value))) {
        throw new AppError('Financial report dates must use YYYY-MM-DD', 400);
    }
    if (normalizedStart > normalizedEnd) throw new AppError('Start date cannot be after end date', 400);
    if (!GROUPINGS.has(groupBy)) throw new AppError('Report grouping must be day, week, month, or year', 400);
    return { start: normalizedStart, end: normalizedEnd, asOf, groupBy, branchId: branchId || DEFAULT_BRANCH_ID };
};

const groupExpression = (groupBy, column) => {
    if (groupBy === 'year') return `date_trunc('year', ${column})::date`;
    if (groupBy === 'month') return `date_trunc('month', ${column})::date`;
    if (groupBy === 'week') return `date_trunc('week', ${column})::date`;
    return `${column}::date`;
};

const getRevenue = async (db, options) => {
    const range = normalizeRange(options);
    const invoiceGroup = groupExpression(range.groupBy, 'i.business_date');
    const creditGroup = groupExpression(range.groupBy, 'c.business_date');
    const paymentGroup = groupExpression(range.groupBy, 'p.business_date');
    const refundGroup = groupExpression(range.groupBy, 'r.business_date');
    // `patient_paid` is now sourced from the payments/refunds ledger (cash actually
    // collected in the period) rather than the billed patient_payable_amount, so a
    // meaningful collection rate can be derived. Accrual columns still come from
    // invoices/credit_notes. The two bases are grouped on the same period key.
    const result = await db.query(`
        WITH activity AS (
            SELECT ${invoiceGroup} AS period,
                   i.subtotal_amount AS gross_services,
                   i.discount_amount AS discounts,
                   (i.subtotal_amount - i.discount_amount) AS net_revenue,
                   i.tax_amount AS tax_amount,
                   i.total_amount AS billed_total,
                   i.patient_payable_amount AS patient_amount,
                   i.insurance_covered_amount AS insurance_amount,
                   0 AS patient_collected,
                   1 AS invoice_count,
                   0 AS credit_note_count
            FROM invoices i
            WHERE i.business_date BETWEEN $1::date AND $2::date
              AND i.branch_id = $3
              AND i.invoice_status <> 'Voided'
            UNION ALL
            SELECT ${creditGroup} AS period,
                   0, 0, -c.net_amount, -c.tax_amount, -c.gross_amount,
                   -c.patient_amount, -c.insurance_amount, 0, 0, 1
            FROM credit_notes c
            WHERE c.business_date BETWEEN $1::date AND $2::date
              AND c.branch_id = $3
              AND c.reversed_at IS NULL
            UNION ALL
            SELECT ${paymentGroup} AS period,
                   0, 0, 0, 0, 0, 0, 0, p.amount, 0, 0
            FROM payments p
            WHERE p.business_date BETWEEN $1::date AND $2::date
              AND p.branch_id = $3
              AND p.payment_status = 'Completed'
            UNION ALL
            SELECT ${refundGroup} AS period,
                   0, 0, 0, 0, 0, 0, 0, -r.amount, 0, 0
            FROM refunds r
            WHERE r.business_date BETWEEN $1::date AND $2::date
              AND r.branch_id = $3
              AND r.status = 'Processed'
        )
        SELECT to_char(period, 'YYYY-MM-DD') AS date,
               COALESCE(SUM(gross_services), 0) AS gross_services,
               COALESCE(SUM(discounts), 0) AS discounts,
               COALESCE(SUM(net_revenue), 0) AS net_revenue,
               COALESCE(SUM(tax_amount), 0) AS tax_amount,
               COALESCE(SUM(net_revenue), 0) AS total_revenue,
               COALESCE(SUM(billed_total), 0) AS billed_total,
               COALESCE(SUM(patient_amount), 0) AS patient_billed,
               COALESCE(SUM(patient_collected), 0) AS patient_paid,
               COALESCE(SUM(insurance_amount), 0) AS insurance_claimable,
               CASE WHEN COALESCE(SUM(patient_amount), 0) > 0
                    THEN ROUND(COALESCE(SUM(patient_collected), 0) / SUM(patient_amount) * 100, 2)
                    ELSE 0 END AS same_period_collection_rate,
               SUM(invoice_count)::int AS invoice_count,
               SUM(credit_note_count)::int AS credit_note_count
        FROM activity
        GROUP BY period
        ORDER BY period
    `, [range.start, range.end, range.branchId]);
    return result.rows.map(row => ({
        ...row,
        collection_rate: row.same_period_collection_rate,
        basis: 'accrual',
        collection_rate_basis: 'payments_collected_in_period_divided_by_patient_amount_billed_in_period',
        group_by: range.groupBy
    }));
};

const shapeCashRow = (row) => {
    const collections = moneyNumber(Number(row.patient_collections) + Number(row.insurer_collections) - Number(row.refunds_paid));
    const outflows = moneyNumber(Number(row.expenses_paid) + Number(row.commissions_paid));
    return {
        patient_collections: moneyNumber(row.patient_collections),
        insurer_collections: moneyNumber(row.insurer_collections),
        refunds_paid: moneyNumber(row.refunds_paid),
        net_collections: collections,
        expenses_paid: moneyNumber(row.expenses_paid),
        commissions_paid: moneyNumber(row.commissions_paid),
        net_cash_flow: moneyNumber(collections - outflows)
    };
};

const getCashSummary = async (db, range) => {
    const result = await db.query(`
        SELECT
            COALESCE((SELECT SUM(amount) FROM payments
                      WHERE payment_status = 'Completed' AND branch_id = $3
                        AND business_date BETWEEN $1::date AND $2::date), 0) AS patient_collections,
            COALESCE((SELECT SUM(amount) FROM claim_receipts
                      WHERE branch_id = $3 AND business_date BETWEEN $1::date AND $2::date), 0) AS insurer_collections,
            COALESCE((SELECT SUM(amount) FROM refunds
                      WHERE status = 'Processed' AND branch_id = $3
                        AND business_date BETWEEN $1::date AND $2::date), 0) AS refunds_paid,
            COALESCE((SELECT SUM(amount) FROM expenses
                      WHERE reversed_at IS NULL AND branch_id = $3
                        AND expense_date BETWEEN $1::date AND $2::date), 0) AS expenses_paid,
            COALESCE((SELECT SUM(amount) FROM commission_payables
                      WHERE status = 'Paid' AND branch_id = $3
                        AND business_date BETWEEN $1::date AND $2::date), 0) AS commissions_paid
    `, [range.start, range.end, range.branchId]);
    return shapeCashRow(result.rows[0]);
};

/**
 * Cash flow as a per-period time series (day/month/year). Each cash stream is
 * independently bucketed on its own business_date, then full-outer-joined on the
 * period key so a period with only outflows (or only collections) still appears.
 */
const getCashFlowSeries = async (db, options) => {
    const range = normalizeRange(options);
    const g = (column) => groupExpression(range.groupBy, column);
    const result = await db.query(`
        WITH streams AS (
            SELECT ${g('p.business_date')} AS period, p.amount AS patient_collections,
                   0 AS insurer_collections, 0 AS refunds_paid, 0 AS expenses_paid, 0 AS commissions_paid
            FROM payments p
            WHERE p.payment_status = 'Completed' AND p.branch_id = $3
              AND p.business_date BETWEEN $1::date AND $2::date
            UNION ALL
            SELECT ${g('cr.business_date')}, 0, cr.amount, 0, 0, 0
            FROM claim_receipts cr
            WHERE cr.branch_id = $3 AND cr.business_date BETWEEN $1::date AND $2::date
            UNION ALL
            SELECT ${g('r.business_date')}, 0, 0, r.amount, 0, 0
            FROM refunds r
            WHERE r.status = 'Processed' AND r.branch_id = $3
              AND r.business_date BETWEEN $1::date AND $2::date
            UNION ALL
            SELECT ${g('e.expense_date')}, 0, 0, 0, e.amount, 0
            FROM expenses e
            WHERE e.reversed_at IS NULL AND e.branch_id = $3
              AND e.expense_date BETWEEN $1::date AND $2::date
            UNION ALL
            SELECT ${g('cp.business_date')}, 0, 0, 0, 0, cp.amount
            FROM commission_payables cp
            WHERE cp.status = 'Paid' AND cp.branch_id = $3
              AND cp.business_date BETWEEN $1::date AND $2::date
        )
        SELECT to_char(period, 'YYYY-MM-DD') AS date,
               COALESCE(SUM(patient_collections), 0) AS patient_collections,
               COALESCE(SUM(insurer_collections), 0) AS insurer_collections,
               COALESCE(SUM(refunds_paid), 0) AS refunds_paid,
               COALESCE(SUM(expenses_paid), 0) AS expenses_paid,
               COALESCE(SUM(commissions_paid), 0) AS commissions_paid
        FROM streams
        GROUP BY period
        ORDER BY period
    `, [range.start, range.end, range.branchId]);
    return result.rows.map((row) => ({
        date: row.date,
        group_by: range.groupBy,
        basis: 'cash',
        ...shapeCashRow(row)
    }));
};

const getProfitAndLoss = async (db, options) => {
    const range = normalizeRange(options);
    const [revenue, expenses, commissions, cash] = await Promise.all([
        db.query(`
            SELECT
                COALESCE((SELECT SUM(i.subtotal_amount - i.discount_amount)
                          FROM invoices i WHERE i.invoice_status <> 'Voided'
                            AND i.branch_id = $3 AND i.business_date BETWEEN $1::date AND $2::date), 0)
                - COALESCE((SELECT SUM(c.net_amount) FROM credit_notes c
                            WHERE c.reversed_at IS NULL AND c.branch_id = $3
                              AND c.business_date BETWEEN $1::date AND $2::date), 0) AS net_revenue
        `, [range.start, range.end, range.branchId]),
        db.query(`
            SELECT COALESCE(SUM(amount - tax_amount), 0) AS operating_expenses
            FROM expenses
            WHERE reversed_at IS NULL AND branch_id = $3
              AND expense_date BETWEEN $1::date AND $2::date
        `, [range.start, range.end, range.branchId]),
        db.query(`
            WITH commission_activity AS (
                SELECT (i.subtotal_amount - i.discount_amount)
                       * COALESCE(rd.commission_percentage, $4) / 100.0 AS commission_amount
                FROM invoices i
                JOIN examinations e ON e.exam_id = i.exam_id
                JOIN appointments a ON a.appointment_id = e.appointment_id
                JOIN referring_doctors rd ON rd.doctor_id = a.referring_doctor_id
                WHERE i.invoice_status <> 'Voided' AND i.branch_id = $3
                  AND i.business_date BETWEEN $1::date AND $2::date
                UNION ALL
                SELECT -c.net_amount * COALESCE(rd.commission_percentage, $4) / 100.0
                FROM credit_notes c
                JOIN invoices i ON i.invoice_id = c.invoice_id
                JOIN examinations e ON e.exam_id = i.exam_id
                JOIN appointments a ON a.appointment_id = e.appointment_id
                JOIN referring_doctors rd ON rd.doctor_id = a.referring_doctor_id
                WHERE c.reversed_at IS NULL AND c.branch_id = $3
                  AND c.business_date BETWEEN $1::date AND $2::date
            )
            SELECT COALESCE(SUM(commission_amount), 0) AS commission_expense
            FROM commission_activity
        `, [range.start, range.end, range.branchId, DEFAULT_COMMISSION_PERCENTAGE]),
        getCashSummary(db, range)
    ]);
    const netRevenue = moneyNumber(revenue.rows[0].net_revenue);
    const operatingExpenses = moneyNumber(expenses.rows[0].operating_expenses);
    const commissionExpense = moneyNumber(commissions.rows[0].commission_expense);
    return {
        basis: 'accrual',
        start_date: range.start,
        end_date: range.end,
        branch_id: range.branchId,
        gross_revenue: netRevenue,
        net_revenue: netRevenue,
        total_expenses: operatingExpenses,
        commission_expense: commissionExpense,
        commission_paid: cash.commissions_paid,
        net_profit: moneyNumber(netRevenue - operatingExpenses - commissionExpense),
        cash_summary: cash
    };
};

/**
 * Accrual P&L as a per-period time series (day/month/year). Net revenue,
 * operating expenses, and accrued commission are each bucketed on their own
 * business/expense date, unioned into a single stream, then summed per period.
 * This is what drives the daily/monthly/yearly trend view — one row per period
 * with revenue, expenses, commission, and derived net profit + margin.
 */
const getProfitAndLossSeries = async (db, options) => {
    const range = normalizeRange(options);
    const g = (column) => groupExpression(range.groupBy, column);
    const result = await db.query(`
        WITH streams AS (
            SELECT ${g('i.business_date')} AS period,
                   (i.subtotal_amount - i.discount_amount) AS net_revenue,
                   0 AS operating_expenses,
                   (i.subtotal_amount - i.discount_amount)
                       * COALESCE(rd.commission_percentage, $4) / 100.0 AS commission_expense
            FROM invoices i
            LEFT JOIN examinations e ON e.exam_id = i.exam_id
            LEFT JOIN appointments a ON a.appointment_id = e.appointment_id
            LEFT JOIN referring_doctors rd ON rd.doctor_id = a.referring_doctor_id
            WHERE i.invoice_status <> 'Voided' AND i.branch_id = $3
              AND i.business_date BETWEEN $1::date AND $2::date
            UNION ALL
            SELECT ${g('c.business_date')},
                   -c.net_amount,
                   0,
                   -c.net_amount * COALESCE(rd.commission_percentage, $4) / 100.0
            FROM credit_notes c
            JOIN invoices i ON i.invoice_id = c.invoice_id
            LEFT JOIN examinations e ON e.exam_id = i.exam_id
            LEFT JOIN appointments a ON a.appointment_id = e.appointment_id
            LEFT JOIN referring_doctors rd ON rd.doctor_id = a.referring_doctor_id
            WHERE c.reversed_at IS NULL AND c.branch_id = $3
              AND c.business_date BETWEEN $1::date AND $2::date
            UNION ALL
            SELECT ${g('ex.expense_date')}, 0, (ex.amount - ex.tax_amount), 0
            FROM expenses ex
            WHERE ex.reversed_at IS NULL AND ex.branch_id = $3
              AND ex.expense_date BETWEEN $1::date AND $2::date
        )
        SELECT to_char(period, 'YYYY-MM-DD') AS date,
               COALESCE(SUM(net_revenue), 0) AS net_revenue,
               COALESCE(SUM(operating_expenses), 0) AS operating_expenses,
               COALESCE(SUM(commission_expense), 0) AS commission_expense
        FROM streams
        GROUP BY period
        ORDER BY period
    `, [range.start, range.end, range.branchId, DEFAULT_COMMISSION_PERCENTAGE]);
    return result.rows.map((row) => {
        const netRevenue = moneyNumber(row.net_revenue);
        const operatingExpenses = moneyNumber(row.operating_expenses);
        const commissionExpense = moneyNumber(row.commission_expense);
        const netProfit = moneyNumber(netRevenue - operatingExpenses - commissionExpense);
        return {
            date: row.date,
            group_by: range.groupBy,
            basis: 'accrual',
            net_revenue: netRevenue,
            gross_revenue: netRevenue,
            operating_expenses: operatingExpenses,
            commission_expense: commissionExpense,
            net_profit: netProfit,
            net_margin: netRevenue > 0 ? moneyNumber(netProfit / netRevenue * 100) : 0
        };
    });
};

/**
 * Discount detection report. Surfaces every non-voided invoice that carries a
 * discount in the period, with the discount split into its fixed and percentage
 * components, the recorded reason, who approved it, and a set of advisory anomaly
 * flags for governance review:
 *   - HIGH_RATE: effective discount rate exceeds the high-rate threshold
 *   - NO_REASON: a discount was applied without a recorded reason
 *   - NO_APPROVAL: a discount was applied without an approver on record
 *   - FULL_WAIVER: the discount wiped out the entire subtotal
 * Returns both the flagged line items and per-approver / per-period summaries so
 * the same endpoint can back a detail table and a trend chart.
 */
const HIGH_DISCOUNT_RATE = 40; // percent of subtotal — advisory governance threshold

const getDiscountReport = async (db, options) => {
    const range = normalizeRange(options);
    const periodExpr = groupExpression(range.groupBy, 'i.business_date');
    const result = await db.query(`
        SELECT
            i.invoice_id,
            i.invoice_number,
            to_char(${periodExpr}, 'YYYY-MM-DD') AS period,
            i.business_date,
            i.subtotal_amount,
            i.discount_amount,
            i.fixed_discount_amount,
            i.percentage_discount_amount,
            i.discount_percentage,
            i.discount_reason,
            i.discount_approved_by,
            u.full_name AS approved_by_name,
            CASE WHEN i.subtotal_amount > 0
                 THEN ROUND(i.discount_amount / i.subtotal_amount * 100, 2)
                 ELSE 0 END AS effective_rate
        FROM invoices i
        LEFT JOIN users u ON u.user_id = i.discount_approved_by
        WHERE i.invoice_status <> 'Voided'
          AND i.branch_id = $3
          AND i.business_date BETWEEN $1::date AND $2::date
          AND i.discount_amount > 0
        ORDER BY i.discount_amount DESC, i.business_date DESC
    `, [range.start, range.end, range.branchId]);

    const items = result.rows.map((row) => {
        const subtotal = moneyNumber(row.subtotal_amount);
        const discount = moneyNumber(row.discount_amount);
        const effectiveRate = Number(row.effective_rate) || 0;
        const flags = [];
        if (effectiveRate >= HIGH_DISCOUNT_RATE) flags.push('HIGH_RATE');
        if (!row.discount_reason || String(row.discount_reason).trim() === '') flags.push('NO_REASON');
        if (!row.discount_approved_by) flags.push('NO_APPROVAL');
        if (subtotal > 0 && discount >= subtotal) flags.push('FULL_WAIVER');
        return {
            invoice_id: row.invoice_id,
            invoice_number: row.invoice_number,
            period: row.period,
            business_date: row.business_date,
            subtotal_amount: subtotal,
            discount_amount: discount,
            fixed_discount_amount: moneyNumber(row.fixed_discount_amount),
            percentage_discount_amount: moneyNumber(row.percentage_discount_amount),
            discount_percentage: Number(row.discount_percentage) || 0,
            effective_rate: effectiveRate,
            discount_reason: row.discount_reason || null,
            approved_by: row.approved_by_name || null,
            flags
        };
    });

    const byPeriodMap = new Map();
    const byApproverMap = new Map();
    let totalSubtotal = 0;
    let totalDiscount = 0;
    let flaggedCount = 0;

    for (const item of items) {
        totalSubtotal += item.subtotal_amount;
        totalDiscount += item.discount_amount;
        if (item.flags.length) flaggedCount += 1;

        const period = byPeriodMap.get(item.period) || {
            period: item.period, discount_total: 0, subtotal_total: 0, invoice_count: 0, flagged_count: 0
        };
        period.discount_total = moneyNumber(period.discount_total + item.discount_amount);
        period.subtotal_total = moneyNumber(period.subtotal_total + item.subtotal_amount);
        period.invoice_count += 1;
        if (item.flags.length) period.flagged_count += 1;
        byPeriodMap.set(item.period, period);

        const approverKey = item.approved_by || '__UNAPPROVED__';
        const approver = byApproverMap.get(approverKey) || {
            approver: item.approved_by || null, discount_total: 0, invoice_count: 0, flagged_count: 0
        };
        approver.discount_total = moneyNumber(approver.discount_total + item.discount_amount);
        approver.invoice_count += 1;
        if (item.flags.length) approver.flagged_count += 1;
        byApproverMap.set(approverKey, approver);
    }

    const byPeriod = [...byPeriodMap.values()]
        .map((row) => ({
            ...row,
            group_by: range.groupBy,
            effective_rate: row.subtotal_total > 0
                ? moneyNumber(row.discount_total / row.subtotal_total * 100)
                : 0
        }))
        .sort((a, b) => (a.period < b.period ? -1 : 1));
    const byApprover = [...byApproverMap.values()].sort((a, b) => b.discount_total - a.discount_total);

    return {
        start_date: range.start,
        end_date: range.end,
        branch_id: range.branchId,
        group_by: range.groupBy,
        high_rate_threshold: HIGH_DISCOUNT_RATE,
        summary: {
            discounted_invoices: items.length,
            flagged_invoices: flaggedCount,
            total_subtotal: moneyNumber(totalSubtotal),
            total_discount: moneyNumber(totalDiscount),
            average_rate: totalSubtotal > 0 ? moneyNumber(totalDiscount / totalSubtotal * 100) : 0
        },
        items,
        by_period: byPeriod,
        by_approver: byApprover
    };
};

const getTaxSummary = async (db, options) => {
    const range = normalizeRange(options);
    const result = await db.query(`
        SELECT
            COALESCE((SELECT SUM(i.tax_amount) FROM invoices i
                      WHERE i.invoice_status <> 'Voided' AND i.branch_id = $3
                        AND i.business_date BETWEEN $1::date AND $2::date), 0)
            - COALESCE((SELECT SUM(c.tax_amount) FROM credit_notes c
                        WHERE c.reversed_at IS NULL AND c.branch_id = $3
                          AND c.business_date BETWEEN $1::date AND $2::date), 0) AS output_tax,
            COALESCE((SELECT SUM(e.tax_amount) FROM expenses e
                      WHERE e.reversed_at IS NULL AND e.branch_id = $3
                        AND e.expense_date BETWEEN $1::date AND $2::date), 0) AS input_tax
    `, [range.start, range.end, range.branchId]);
    const outputTax = moneyNumber(result.rows[0].output_tax);
    const inputTax = moneyNumber(result.rows[0].input_tax);
    return {
        basis: 'accrual',
        tax_collected: outputTax,
        output_tax: outputTax,
        tax_paid: inputTax,
        input_tax: inputTax,
        net_tax_liability: moneyNumber(outputTax - inputTax)
    };
};

const getReceivablesAging = async (db, options) => {
    const range = normalizeRange(options);
    const result = await db.query(`
        WITH balances AS (
            SELECT i.invoice_id, i.business_date,
                   GREATEST(0,
                       i.patient_payable_amount
                       - COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c
                                   WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL
                                     AND c.business_date <= $1::date), 0)
                       - COALESCE((SELECT SUM(p.amount) FROM payments p
                                   WHERE p.invoice_id = i.invoice_id AND p.payment_status = 'Completed'
                                     AND p.business_date <= $1::date), 0)
                       + COALESCE((SELECT SUM(r.amount) FROM refunds r
                                   WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'
                                     AND r.business_date <= $1::date), 0)
                   ) AS patient_balance,
                   GREATEST(0,
                       i.insurance_covered_amount
                       - COALESCE((SELECT SUM(c.insurance_amount) FROM credit_notes c
                                   WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL
                                     AND c.business_date <= $1::date), 0)
                       - COALESCE((SELECT SUM(cr.amount) FROM claim_receipts cr
                                   WHERE cr.invoice_id = i.invoice_id AND cr.business_date <= $1::date), 0)
                       - COALESCE((SELECT SUM(ic.expected_amount) FROM insurance_claims ic
                                   WHERE ic.invoice_id = i.invoice_id AND ic.status = 'Written Off'
                                     AND ic.written_off_at::date <= $1::date), 0)
                   ) AS insurance_balance
            FROM invoices i
            WHERE i.invoice_status <> 'Voided' AND i.branch_id = $2
              AND i.business_date <= $1::date
        ), components AS (
            SELECT business_date, patient_balance AS amount, 'patient' AS component FROM balances
            UNION ALL
            SELECT business_date, insurance_balance, 'insurance' FROM balances
        ), bucketed AS (
            SELECT component, amount, ($1::date - business_date) AS age_days
            FROM components WHERE amount > 0
        )
        SELECT
            COALESCE(SUM(amount) FILTER (WHERE age_days <= 30), 0) AS "0_30",
            COALESCE(SUM(amount) FILTER (WHERE age_days BETWEEN 31 AND 60), 0) AS "31_60",
            COALESCE(SUM(amount) FILTER (WHERE age_days BETWEEN 61 AND 90), 0) AS "61_90",
            COALESCE(SUM(amount) FILTER (WHERE age_days > 90), 0) AS "90_plus",
            COALESCE(SUM(amount), 0) AS total_outstanding,
            COALESCE(SUM(amount) FILTER (WHERE component = 'patient'), 0) AS patient_outstanding,
            COALESCE(SUM(amount) FILTER (WHERE component = 'insurance'), 0) AS insurance_outstanding
        FROM bucketed
    `, [range.asOf, range.branchId]);
    return { ...result.rows[0], as_of_date: range.asOf, branch_id: range.branchId };
};

const getTrialBalance = async (db, options) => {
    const range = normalizeRange(options);
    const result = await db.query(`
        SELECT
            je.account_code,
            je.account_name,
            COALESCE(SUM(je.debit), 0) AS debit,
            COALESCE(SUM(je.credit), 0) AS credit,
            COALESCE(SUM(je.debit - je.credit), 0) AS net_balance
        FROM journal_entries je
        JOIN journal_batches jb ON jb.batch_id = je.batch_id
        WHERE jb.branch_id = $3
          AND jb.business_date BETWEEN $1::date AND $2::date
        GROUP BY je.account_code, je.account_name
        ORDER BY je.account_code, je.account_name
    `, [range.start, range.end, range.branchId]);

    const totals = result.rows.reduce((acc, row) => ({
        debit: moneyNumber(acc.debit + Number(row.debit || 0)),
        credit: moneyNumber(acc.credit + Number(row.credit || 0))
    }), { debit: 0, credit: 0 });

    return {
        start_date: range.start,
        end_date: range.end,
        branch_id: range.branchId,
        rows: result.rows.map((row) => ({
            ...row,
            debit: moneyNumber(row.debit),
            credit: moneyNumber(row.credit),
            net_balance: moneyNumber(row.net_balance)
        })),
        total_debit: totals.debit,
        total_credit: totals.credit,
        difference: moneyNumber(totals.debit - totals.credit),
        is_balanced: Math.abs(moneyNumber(totals.debit - totals.credit)) <= 0.005
    };
};

const getJournalLedger = async (db, options = {}) => {
    const range = normalizeRange(options);
    const limit = Math.min(500, Math.max(1, Number.parseInt(options.limit, 10) || 100));
    const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0);
    const values = [range.start, range.end, range.branchId];
    let param = 4;
    let where = `
        WHERE jb.branch_id = $3
          AND jb.business_date BETWEEN $1::date AND $2::date
    `;

    if (options.accountCode) {
        where += ` AND je.account_code = $${param++}`;
        values.push(options.accountCode);
    }
    if (options.sourceType) {
        where += ` AND jb.source_type = $${param++}`;
        values.push(options.sourceType);
    }
    if (options.sourceTypePrefix) {
        where += ` AND jb.source_type LIKE $${param++}`;
        values.push(`${options.sourceTypePrefix}%`);
    }
    if (options.sourceId) {
        where += ` AND jb.source_id = $${param++}::uuid`;
        values.push(options.sourceId);
    }

    const result = await db.query(`
        SELECT
            jb.batch_id,
            jb.source_type,
            jb.source_id,
            jb.business_date,
            jb.currency_code,
            jb.description,
            jb.posted_at,
            je.entry_id,
            je.account_code,
            je.account_name,
            je.debit,
            je.credit,
            je.patient_id,
            je.doctor_id,
            je.payer_id,
            je.modality_id,
            je.metadata
        FROM journal_entries je
        JOIN journal_batches jb ON jb.batch_id = je.batch_id
        ${where}
        ORDER BY jb.business_date DESC, jb.posted_at DESC, jb.batch_id, je.account_code
        LIMIT $${param++}::int OFFSET $${param}::int
    `, [...values, limit, offset]);

    const countResult = await db.query(`
        SELECT COUNT(*)::int AS count
        FROM journal_entries je
        JOIN journal_batches jb ON jb.batch_id = je.batch_id
        ${where}
    `, values);

    return {
        start_date: range.start,
        end_date: range.end,
        branch_id: range.branchId,
        limit,
        offset,
        total_count: Number(countResult.rows[0]?.count || 0),
        rows: result.rows.map((row) => ({
            ...row,
            debit: moneyNumber(row.debit),
            credit: moneyNumber(row.credit)
        }))
    };
};

module.exports = {
    getCashFlowSeries,
    getCashSummary,
    getDiscountReport,
    getJournalLedger,
    getProfitAndLoss,
    getProfitAndLossSeries,
    getReceivablesAging,
    getRevenue,
    getTaxSummary,
    getTrialBalance,
    normalizeRange
};
