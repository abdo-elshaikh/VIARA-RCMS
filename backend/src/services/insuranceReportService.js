'use strict';

const { AppError } = require('../middleware/errorHandler');
const { decrypt } = require('../utils/crypto');
const { DEFAULT_BRANCH_ID, moneyNumber } = require('./financialPostingService');
const { normalizeRange } = require('./financialReportService');

const safeDecrypt = (text) => {
    if (!text) return '';
    try {
        return decrypt(text) || '';
    } catch {
        return '';
    }
};

/**
 * 1. Comprehensive Claims Performance & Analytics Summary
 * Aggregates claims by global metrics, by provider, by status, and details rejection/deduction reasons.
 */
const getClaimsSummaryReport = async (db, options = {}) => {
    const range = normalizeRange(options);
    const values = [range.start, range.end, range.branchId];
    let param = 4;
    let providerFilter = '';

    if (options.providerId) {
        providerFilter = ` AND c.provider_id = $${param++}::uuid`;
        values.push(options.providerId);
    }

    // A. Global Totals
    const totalsQuery = `
        SELECT
            COUNT(*)::int AS total_claims,
            COALESCE(SUM(c.expected_amount), 0) AS total_expected,
            COALESCE(SUM(c.received_amount), 0) AS total_received,
            COALESCE(SUM(c.deduction_amount), 0) AS total_deductions,
            COALESCE(SUM(
                CASE WHEN c.status IN ('Paid', 'Written Off') THEN 0
                     ELSE GREATEST(0, c.expected_amount - c.received_amount - COALESCE(c.deduction_amount, 0))
                END
            ), 0) AS total_outstanding,
            COUNT(*) FILTER (WHERE c.status = 'Paid')::int AS paid_count,
            COUNT(*) FILTER (WHERE c.status = 'Partially Paid')::int AS partially_paid_count,
            COUNT(*) FILTER (WHERE c.status = 'Rejected')::int AS rejected_count,
            COUNT(*) FILTER (WHERE c.status = 'Submitted')::int AS submitted_count,
            COUNT(*) FILTER (WHERE c.status = 'Pending Approval')::int AS pending_count,
            COUNT(*) FILTER (WHERE c.status = 'Written Off')::int AS written_off_count
        FROM insurance_claims c
        WHERE c.branch_id = $3
          AND c.created_at::date BETWEEN $1::date AND $2::date
          ${providerFilter}
    `;
    const totalsRes = await db.query(totalsQuery, values);
    const totalsRow = totalsRes.rows[0];

    const totalExpected = moneyNumber(totalsRow.total_expected);
    const totalReceived = moneyNumber(totalsRow.total_received);
    const totalDeductions = moneyNumber(totalsRow.total_deductions);
    const totalOutstanding = moneyNumber(totalsRow.total_outstanding);
    const totalSettled = moneyNumber(totalReceived + totalDeductions);
    const collectionRate = totalExpected > 0 ? moneyNumber((totalReceived / totalExpected) * 100) : 0;
    const deductionRate = totalExpected > 0 ? moneyNumber((totalDeductions / totalExpected) * 100) : 0;

    // B. Breakdown by Provider
    const providersQuery = `
        SELECT
            ip.provider_id,
            ip.name AS provider_name,
            ip.payer_code,
            COUNT(c.claim_id)::int AS claims_count,
            COALESCE(SUM(c.expected_amount), 0) AS expected_amount,
            COALESCE(SUM(c.received_amount), 0) AS received_amount,
            COALESCE(SUM(c.deduction_amount), 0) AS deduction_amount,
            COALESCE(SUM(
                CASE WHEN c.status IN ('Paid', 'Written Off') THEN 0
                     ELSE GREATEST(0, c.expected_amount - c.received_amount - COALESCE(c.deduction_amount, 0))
                END
            ), 0) AS outstanding_amount,
            COUNT(*) FILTER (WHERE c.status = 'Paid')::int AS paid_claims,
            COUNT(*) FILTER (WHERE c.status = 'Rejected')::int AS rejected_claims,
            COUNT(*) FILTER (WHERE c.status IN ('Submitted', 'Resubmitted'))::int AS pending_claims
        FROM insurance_providers ip
        LEFT JOIN insurance_claims c
               ON ip.provider_id = c.provider_id
              AND c.branch_id = $3
              AND c.created_at::date BETWEEN $1::date AND $2::date
              ${providerFilter}
        WHERE (c.claim_id IS NOT NULL OR ip.is_active = true)
        GROUP BY ip.provider_id, ip.name, ip.payer_code
        ORDER BY expected_amount DESC, claims_count DESC
    `;
    const providersRes = await db.query(providersQuery, values);
    const byProvider = providersRes.rows.map(r => {
        const expected = moneyNumber(r.expected_amount);
        const received = moneyNumber(r.received_amount);
        const deductions = moneyNumber(r.deduction_amount);
        const outstanding = moneyNumber(r.outstanding_amount);
        return {
            provider_id: r.provider_id,
            provider_name: r.provider_name,
            payer_code: r.payer_code || '',
            claims_count: r.claims_count,
            expected_amount: expected,
            received_amount: received,
            deduction_amount: deductions,
            outstanding_amount: outstanding,
            paid_claims: r.paid_claims,
            rejected_claims: r.rejected_claims,
            pending_claims: r.pending_claims,
            collection_rate: expected > 0 ? moneyNumber((received / expected) * 100) : 0
        };
    });

    // C. Breakdown by Status
    const statusQuery = `
        SELECT
            c.status,
            COUNT(*)::int AS count,
            COALESCE(SUM(c.expected_amount), 0) AS total_expected,
            COALESCE(SUM(c.received_amount), 0) AS total_received
        FROM insurance_claims c
        WHERE c.branch_id = $3
          AND c.created_at::date BETWEEN $1::date AND $2::date
          ${providerFilter}
        GROUP BY c.status
        ORDER BY count DESC
    `;
    const statusRes = await db.query(statusQuery, values);
    const byStatus = statusRes.rows.map(r => ({
        status: r.status,
        count: r.count,
        total_expected: moneyNumber(r.total_expected),
        total_received: moneyNumber(r.total_received)
    }));

    // D. Rejection Analysis
    const rejectionsQuery = `
        SELECT
            c.rejection_reason,
            COUNT(*)::int AS count,
            COALESCE(SUM(c.expected_amount), 0) AS total_rejected_amount
        FROM insurance_claims c
        WHERE c.branch_id = $3
          AND c.status = 'Rejected'
          AND c.created_at::date BETWEEN $1::date AND $2::date
          ${providerFilter}
          AND c.rejection_reason IS NOT NULL
        GROUP BY c.rejection_reason
        ORDER BY count DESC
        LIMIT 10
    `;
    const rejectionsRes = await db.query(rejectionsQuery, values);

    // E. Deduction Analysis
    const deductionsQuery = `
        SELECT
            c.deduction_reason,
            COUNT(*)::int AS count,
            COALESCE(SUM(c.deduction_amount), 0) AS total_deducted_amount
        FROM insurance_claims c
        WHERE c.branch_id = $3
          AND c.deduction_amount > 0
          AND c.created_at::date BETWEEN $1::date AND $2::date
          ${providerFilter}
        GROUP BY c.deduction_reason
        ORDER BY total_deducted_amount DESC
        LIMIT 10
    `;
    const deductionsRes = await db.query(deductionsQuery, values);

    return {
        start_date: range.start,
        end_date: range.end,
        branch_id: range.branchId,
        summary: {
            total_claims: totalsRow.total_claims,
            total_expected_amount: totalExpected,
            total_received_amount: totalReceived,
            total_deduction_amount: totalDeductions,
            total_settled_amount: totalSettled,
            total_outstanding_amount: totalOutstanding,
            collection_rate_percentage: collectionRate,
            deduction_rate_percentage: deductionRate,
            counts_by_status: {
                paid: totalsRow.paid_count,
                partially_paid: totalsRow.partially_paid_count,
                rejected: totalsRow.rejected_count,
                submitted: totalsRow.submitted_count,
                pending_approval: totalsRow.pending_count,
                written_off: totalsRow.written_off_count
            }
        },
        by_provider: byProvider,
        by_status: byStatus,
        top_rejection_reasons: rejectionsRes.rows.map(r => ({
            reason: r.rejection_reason,
            count: r.count,
            amount: moneyNumber(r.total_rejected_amount)
        })),
        top_deduction_reasons: deductionsRes.rows.map(r => ({
            reason: r.deduction_reason || 'Unspecified',
            count: r.count,
            amount: moneyNumber(r.total_deducted_amount)
        }))
    };
};

/**
 * 2. Payer Statement of Account & Remittance Statement (كشف حساب ومطالبات الجهة المتعاقدة)
 * Produces an exact financial ledger statement for an insurance company or corporate entity.
 */
const getPayerStatementOfAccount = async (db, options = {}) => {
    if (!options.providerId) {
        throw new AppError('Provider ID is required for a statement of account', 400);
    }
    const range = normalizeRange(options);

    // Fetch Provider Info
    const providerRes = await db.query(
        'SELECT * FROM insurance_providers WHERE provider_id = $1::uuid',
        [options.providerId]
    );
    if (!providerRes.rows.length) {
        throw new AppError('Insurance provider not found', 404);
    }
    const provider = providerRes.rows[0];

    // A. Opening Balance (prior to range.start)
    // Outstanding from prior claims: expected - received - deductions
    const openingRes = await db.query(`
        SELECT
            COALESCE(SUM(
                CASE WHEN c.status = 'Written Off' THEN 0
                     ELSE GREATEST(0, c.expected_amount - c.received_amount - COALESCE(c.deduction_amount, 0))
                END
            ), 0) AS opening_balance,
            COUNT(*)::int AS prior_claims_count
        FROM insurance_claims c
        WHERE c.provider_id = $1::uuid
          AND c.branch_id = $2
          AND c.created_at::date < $3::date
    `, [options.providerId, range.branchId, range.start]);
    const openingBalance = moneyNumber(openingRes.rows[0]?.opening_balance || 0);

    // B. Period Transactions (Claims, Receipts, Deductions)
    // We select claims created in period
    const claimsQuery = `
        SELECT
            c.claim_id,
            c.claim_number,
            c.claim_reference_number,
            c.status,
            c.expected_amount,
            c.received_amount,
            c.deduction_amount,
            c.deduction_reason,
            c.rejection_reason,
            c.created_at,
            c.submitted_at,
            c.paid_at,
            i.invoice_number,
            p.mrn,
            p.first_name_enc,
            p.last_name_enc,
            pol.policy_number,
            pol.plan_name
        FROM insurance_claims c
        JOIN patients p ON c.patient_id = p.patient_id
        LEFT JOIN invoices i ON c.invoice_id = i.invoice_id
        LEFT JOIN patient_insurance_policies pol ON c.policy_id = pol.policy_id
        WHERE c.provider_id = $1::uuid
          AND c.branch_id = $2
          AND c.created_at::date BETWEEN $3::date AND $4::date
        ORDER BY c.created_at ASC
    `;
    const claimsRes = await db.query(claimsQuery, [
        options.providerId,
        range.branchId,
        range.start,
        range.end
    ]);

    let runningBalance = openingBalance;
    let periodClaimsTotal = 0;
    let periodReceiptsTotal = 0;
    let periodDeductionsTotal = 0;

    const lineItems = claimsRes.rows.map(row => {
        const firstName = safeDecrypt(row.first_name_enc);
        const lastName = safeDecrypt(row.last_name_enc);
        const patientName = [firstName, lastName].filter(Boolean).join(' ') || 'Patient';

        const expected = moneyNumber(row.expected_amount);
        const received = moneyNumber(row.received_amount);
        const deduction = moneyNumber(row.deduction_amount || 0);
        const outstanding = row.status === 'Written Off' ? 0 : Math.max(0, expected - received - deduction);

        periodClaimsTotal += expected;
        periodReceiptsTotal += received;
        periodDeductionsTotal += deduction;

        // Debit: expected (increases debt), Credit: received + deduction (reduces debt)
        runningBalance = moneyNumber(runningBalance + expected - received - deduction);

        return {
            claim_id: row.claim_id,
            claim_number: row.claim_number,
            claim_reference_number: row.claim_reference_number || '',
            date: row.created_at?.toISOString?.().slice(0, 10) || '',
            invoice_number: row.invoice_number || '',
            patient_mrn: row.mrn,
            patient_name: patientName,
            policy_number: row.policy_number || '',
            plan_name: row.plan_name || '',
            status: row.status,
            expected_amount: expected,
            received_amount: received,
            deduction_amount: deduction,
            deduction_reason: row.deduction_reason || '',
            outstanding_amount: outstanding,
            running_balance: runningBalance
        };
    });

    const closingBalance = runningBalance;

    return {
        provider: {
            provider_id: provider.provider_id,
            name: provider.name,
            payer_code: provider.payer_code || '',
            phone: provider.phone || '',
            email: provider.email || '',
            address: provider.address || ''
        },
        start_date: range.start,
        end_date: range.end,
        branch_id: range.branchId,
        opening_balance: openingBalance,
        period_claims_total: moneyNumber(periodClaimsTotal),
        period_receipts_total: moneyNumber(periodReceiptsTotal),
        period_deductions_total: moneyNumber(periodDeductionsTotal),
        closing_balance: moneyNumber(closingBalance),
        items_count: lineItems.length,
        transactions: lineItems
    };
};

/**
 * 3. Insurance Receivables Aging Report (تقرير أعمار ديون شركات التأمين)
 * Buckets outstanding insurance claims by age: 0-30, 31-60, 61-90, 90+ days.
 */
const getInsuranceAgingReport = async (db, options = {}) => {
    const range = normalizeRange(options);

    const query = `
        WITH claim_balances AS (
            SELECT
                c.claim_id,
                c.provider_id,
                ip.name AS provider_name,
                ip.payer_code,
                c.created_at::date AS claim_date,
                ($1::date - c.created_at::date) AS age_days,
                GREATEST(0, c.expected_amount - c.received_amount - COALESCE(c.deduction_amount, 0)) AS balance
            FROM insurance_claims c
            JOIN insurance_providers ip ON c.provider_id = ip.provider_id
            WHERE c.branch_id = $2
              AND c.status NOT IN ('Paid', 'Written Off')
              AND c.created_at::date <= $1::date
        ),
        provider_buckets AS (
            SELECT
                provider_id,
                provider_name,
                payer_code,
                COUNT(*)::int AS active_claims_count,
                COALESCE(SUM(balance) FILTER (WHERE age_days <= 30), 0) AS bucket_0_30,
                COALESCE(SUM(balance) FILTER (WHERE age_days BETWEEN 31 AND 60), 0) AS bucket_31_60,
                COALESCE(SUM(balance) FILTER (WHERE age_days BETWEEN 61 AND 90), 0) AS bucket_61_90,
                COALESCE(SUM(balance) FILTER (WHERE age_days > 90), 0) AS bucket_90_plus,
                COALESCE(SUM(balance), 0) AS total_outstanding
            FROM claim_balances
            WHERE balance > 0
            GROUP BY provider_id, provider_name, payer_code
        )
        SELECT * FROM provider_buckets
        ORDER BY total_outstanding DESC
    `;

    const result = await db.query(query, [range.asOf, range.branchId]);

    let sum0To30 = 0;
    let sum31To60 = 0;
    let sum61To90 = 0;
    let sum90Plus = 0;
    let grandTotal = 0;
    let totalActiveClaims = 0;

    const rows = result.rows.map(r => {
        const b0 = moneyNumber(r.bucket_0_30);
        const b31 = moneyNumber(r.bucket_31_60);
        const b61 = moneyNumber(r.bucket_61_90);
        const b90 = moneyNumber(r.bucket_90_plus);
        const total = moneyNumber(r.total_outstanding);

        sum0To30 += b0;
        sum31To60 += b31;
        sum61To90 += b61;
        sum90Plus += b90;
        grandTotal += total;
        totalActiveClaims += r.active_claims_count;

        return {
            provider_id: r.provider_id,
            provider_name: r.provider_name,
            payer_code: r.payer_code || '',
            active_claims_count: r.active_claims_count,
            bucket_0_30: b0,
            bucket_31_60: b31,
            bucket_61_90: b61,
            bucket_90_plus: b90,
            total_outstanding: total
        };
    });

    return {
        as_of_date: range.asOf,
        branch_id: range.branchId,
        summary: {
            providers_with_debt: rows.length,
            total_active_claims: totalActiveClaims,
            bucket_0_30: moneyNumber(sum0To30),
            bucket_31_60: moneyNumber(sum31To60),
            bucket_61_90: moneyNumber(sum61To90),
            bucket_90_plus: moneyNumber(sum90Plus),
            grand_total_outstanding: moneyNumber(grandTotal)
        },
        providers: rows
    };
};

/**
 * 4. Contracts Performance & Utilization Report (تقرير أداء وإنتاجية العقود)
 * Evaluates patient count, invoiced volume, pre-authorizations, and profitability per contract.
 */
const getContractsPerformanceReport = async (db, options = {}) => {
    const range = normalizeRange(options);

    const query = `
        SELECT
            c.contract_id,
            c.contract_number,
            c.entity_name,
            c.entity_type,
            c.commission_percentage,
            c.is_active,
            ip.name AS provider_name,
            COUNT(DISTINCT i.patient_id)::int AS unique_patients,
            COUNT(DISTINCT i.invoice_id)::int AS invoices_count,
            COALESCE(SUM(i.subtotal_amount - i.discount_amount), 0) AS total_gross_billed,
            COALESCE(SUM(i.insurance_covered_amount), 0) AS total_insurance_covered,
            COALESCE(SUM(i.patient_payable_amount), 0) AS total_patient_copay,
            COUNT(DISTINCT cl.claim_id)::int AS claims_count,
            COALESCE(SUM(cl.received_amount), 0) AS claims_collected,
            COALESCE(SUM(cl.deduction_amount), 0) AS claims_deductions
        FROM contracts c
        LEFT JOIN insurance_providers ip ON c.provider_id = ip.provider_id
        LEFT JOIN patient_insurance_policies pol ON pol.contract_id = c.contract_id
        LEFT JOIN invoices i
               ON i.insurance_policy_id = pol.policy_id
              AND i.invoice_status <> 'Voided'
              AND i.branch_id = $3
              AND i.business_date BETWEEN $1::date AND $2::date
        LEFT JOIN insurance_claims cl
               ON cl.invoice_id = i.invoice_id
              AND cl.branch_id = $3
        GROUP BY c.contract_id, c.contract_number, c.entity_name, c.entity_type,
                 c.commission_percentage, c.is_active, ip.name
        ORDER BY total_gross_billed DESC, unique_patients DESC
    `;

    const result = await db.query(query, [range.start, range.end, range.branchId]);

    const contracts = result.rows.map(r => ({
        contract_id: r.contract_id,
        contract_number: r.contract_number || '-',
        entity_name: r.entity_name,
        entity_type: r.entity_type,
        provider_name: r.provider_name || 'Direct / Corporate',
        commission_percentage: Number(r.commission_percentage || 0),
        is_active: r.is_active,
        unique_patients: r.unique_patients,
        invoices_count: r.invoices_count,
        total_gross_billed: moneyNumber(r.total_gross_billed),
        total_insurance_covered: moneyNumber(r.total_insurance_covered),
        total_patient_copay: moneyNumber(r.total_patient_copay),
        claims_count: r.claims_count,
        claims_collected: moneyNumber(r.claims_collected),
        claims_deductions: moneyNumber(r.claims_deductions)
    }));

    return {
        start_date: range.start,
        end_date: range.end,
        branch_id: range.branchId,
        total_contracts: contracts.length,
        contracts
    };
};

module.exports = {
    getClaimsSummaryReport,
    getPayerStatementOfAccount,
    getInsuranceAgingReport,
    getContractsPerformanceReport
};
