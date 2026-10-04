'use strict';

const insuranceReportService = require('../services/insuranceReportService');

const formatCsvCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
};

const sendCsvResponse = (res, filename, headers, rows) => {
    const csvContent = '\uFEFF' + [
        headers.map(formatCsvCell).join(','),
        ...rows.map(row => row.map(formatCsvCell).join(','))
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send(csvContent);
};

// 1. Claims Summary Report Controller
const getClaimsSummary = (db) => async (req, res, next) => {
    try {
        const report = await insuranceReportService.getClaimsSummaryReport(db, req.query);

        if (req.query.format === 'csv') {
            const dateStr = new Date().toISOString().slice(0, 10);
            const headers = [
                'Provider Name', 'Payer Code', 'Total Claims', 'Expected Amount (EGP)',
                'Received Amount (EGP)', 'Deductions (EGP)', 'Outstanding Balance (EGP)',
                'Paid Claims', 'Rejected Claims', 'Pending Claims', 'Collection Rate (%)'
            ];
            const rows = report.by_provider.map(p => [
                p.provider_name,
                p.payer_code,
                p.claims_count,
                p.expected_amount,
                p.received_amount,
                p.deduction_amount,
                p.outstanding_amount,
                p.paid_claims,
                p.rejected_claims,
                p.pending_claims,
                `${p.collection_rate}%`
            ]);
            return sendCsvResponse(res, `insurance-claims-summary-${dateStr}`, headers, rows);
        }

        res.json(report);
    } catch (error) {
        next(error);
    }
};

// 2. Payer Statement of Account & Remittance Controller
const getPayerStatement = (db) => async (req, res, next) => {
    try {
        const statement = await insuranceReportService.getPayerStatementOfAccount(db, req.query);

        if (req.query.format === 'csv') {
            const dateStr = new Date().toISOString().slice(0, 10);
            const safeName = (statement.provider.name || 'payer').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
            const headers = [
                'Date', 'Claim Number', 'Reference', 'Invoice Number', 'Patient MRN',
                'Patient Name', 'Policy', 'Status', 'Expected Amount (Debit)',
                'Received Amount (Credit)', 'Deductions (Credit)', 'Deduction Reason',
                'Outstanding Claim', 'Running Account Balance'
            ];
            const rows = statement.transactions.map(t => [
                t.date,
                t.claim_number,
                t.claim_reference_number,
                t.invoice_number,
                t.patient_mrn,
                t.patient_name,
                t.policy_number,
                t.status,
                t.expected_amount,
                t.received_amount,
                t.deduction_amount,
                t.deduction_reason,
                t.outstanding_amount,
                t.running_balance
            ]);
            return sendCsvResponse(res, `statement-of-account-${safeName}-${dateStr}`, headers, rows);
        }

        res.json(statement);
    } catch (error) {
        next(error);
    }
};

// 3. Insurance Aging Report Controller
const getInsuranceAging = (db) => async (req, res, next) => {
    try {
        const report = await insuranceReportService.getInsuranceAgingReport(db, req.query);

        if (req.query.format === 'csv') {
            const dateStr = new Date().toISOString().slice(0, 10);
            const headers = [
                'Insurance Provider', 'Payer Code', 'Active Claims',
                '0-30 Days (EGP)', '31-60 Days (EGP)', '61-90 Days (EGP)',
                '90+ Days (EGP)', 'Total Outstanding (EGP)'
            ];
            const rows = report.providers.map(p => [
                p.provider_name,
                p.payer_code,
                p.active_claims_count,
                p.bucket_0_30,
                p.bucket_31_60,
                p.bucket_61_90,
                p.bucket_90_plus,
                p.total_outstanding
            ]);
            return sendCsvResponse(res, `insurance-receivables-aging-${dateStr}`, headers, rows);
        }

        res.json(report);
    } catch (error) {
        next(error);
    }
};

// 4. Contracts Performance Report Controller
const getContractsPerformance = (db) => async (req, res, next) => {
    try {
        const report = await insuranceReportService.getContractsPerformanceReport(db, req.query);

        if (req.query.format === 'csv') {
            const dateStr = new Date().toISOString().slice(0, 10);
            const headers = [
                'Contract Number', 'Entity Name', 'Entity Type', 'Provider / Payer',
                'Commission %', 'Active', 'Unique Patients', 'Invoices Count',
                'Total Billed (EGP)', 'Insurance Covered (EGP)', 'Patient Copay (EGP)',
                'Claims Count', 'Collected (EGP)', 'Deductions (EGP)'
            ];
            const rows = report.contracts.map(c => [
                c.contract_number,
                c.entity_name,
                c.entity_type,
                c.provider_name,
                `${c.commission_percentage}%`,
                c.is_active ? 'Yes' : 'No',
                c.unique_patients,
                c.invoices_count,
                c.total_gross_billed,
                c.total_insurance_covered,
                c.total_patient_copay,
                c.claims_count,
                c.claims_collected,
                c.claims_deductions
            ]);
            return sendCsvResponse(res, `contracts-performance-${dateStr}`, headers, rows);
        }

        res.json(report);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getClaimsSummary,
    getPayerStatement,
    getInsuranceAging,
    getContractsPerformance
};
