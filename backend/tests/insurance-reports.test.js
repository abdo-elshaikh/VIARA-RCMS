'use strict';

const {
    getClaimsSummaryReport,
    getPayerStatementOfAccount,
    getInsuranceAgingReport,
    getContractsPerformanceReport
} = require('../src/services/insuranceReportService');
const {
    getClaimsSummary,
    getPayerStatement,
    getInsuranceAging,
    getContractsPerformance
} = require('../src/controllers/insuranceReportController');

describe('insurance and contracts reporting suite', () => {
    describe('getClaimsSummaryReport', () => {
        test('computes correct totals and rates for claims summary', async () => {
            const db = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text.includes('AS total_claims')) {
                        return {
                            rows: [{
                                total_claims: 20,
                                total_expected: '100000.00',
                                total_received: '80000.00',
                                total_deductions: '5000.00',
                                total_outstanding: '15000.00',
                                paid_count: 14,
                                partially_paid_count: 2,
                                rejected_count: 2,
                                submitted_count: 1,
                                pending_count: 1,
                                written_off_count: 0
                            }]
                        };
                    }
                    if (text.includes('FROM insurance_providers ip')) {
                        return {
                            rows: [{
                                provider_id: '00000000-0000-4000-8000-000000000001',
                                provider_name: 'Bupa Global',
                                payer_code: 'BUPA',
                                claims_count: 15,
                                expected_amount: '75000.00',
                                received_amount: '60000.00',
                                deduction_amount: '3000.00',
                                outstanding_amount: '12000.00',
                                paid_claims: 10,
                                rejected_claims: 2,
                                pending_claims: 3
                            }]
                        };
                    }
                    if (text.includes('GROUP BY c.status')) {
                        return {
                            rows: [
                                { status: 'Paid', count: 14, total_expected: '70000.00', total_received: '70000.00' },
                                { status: 'Rejected', count: 2, total_expected: '10000.00', total_received: '0.00' }
                            ]
                        };
                    }
                    if (text.includes("c.status = 'Rejected'")) {
                        return {
                            rows: [
                                { rejection_reason: 'Missing pre-authorization', count: 2, total_rejected_amount: '10000.00' }
                            ]
                        };
                    }
                    if (text.includes('c.deduction_amount > 0')) {
                        return {
                            rows: [
                                { deduction_reason: 'Contractual copay discount', count: 3, total_deducted_amount: '5000.00' }
                            ]
                        };
                    }
                    throw new Error(`Unhandled query: ${text}`);
                })
            };

            const result = await getClaimsSummaryReport(db, {
                startDate: '2026-01-01',
                endDate: '2026-03-31'
            });

            expect(result.summary.total_claims).toBe(20);
            expect(result.summary.total_expected_amount).toBe(100000);
            expect(result.summary.total_received_amount).toBe(80000);
            expect(result.summary.collection_rate_percentage).toBe(80);
            expect(result.by_provider).toHaveLength(1);
            expect(result.by_provider[0].provider_name).toBe('Bupa Global');
            expect(result.top_rejection_reasons[0].reason).toBe('Missing pre-authorization');
        });
    });

    describe('getPayerStatementOfAccount', () => {
        test('computes running balance for payer statement', async () => {
            const providerId = '00000000-0000-4000-8000-000000000001';
            const db = {
                query: jest.fn(async (sql, params) => {
                    const text = String(sql);
                    if (text.includes('FROM insurance_providers WHERE provider_id')) {
                        return {
                            rows: [{
                                provider_id: providerId,
                                name: 'AXA Insurance',
                                payer_code: 'AXA-01',
                                phone: '0100000000',
                                email: 'claims@axa.com'
                            }]
                        };
                    }
                    if (text.includes('AS opening_balance')) {
                        return {
                            rows: [{ opening_balance: '12000.00', prior_claims_count: 3 }]
                        };
                    }
                    if (text.includes('FROM insurance_claims c') && text.includes('JOIN patients p')) {
                        return {
                            rows: [{
                                claim_id: 'claim-1',
                                claim_number: 'CLM-100',
                                claim_reference_number: 'REF-999',
                                status: 'Paid',
                                expected_amount: '5000.00',
                                received_amount: '4500.00',
                                deduction_amount: '500.00',
                                deduction_reason: 'Contractual tier discount',
                                rejection_reason: null,
                                created_at: new Date('2026-02-15'),
                                invoice_number: 'INV-2026-001',
                                mrn: 'MRN-101',
                                first_name_enc: null,
                                last_name_enc: null,
                                policy_number: 'POL-77',
                                plan_name: 'Gold'
                            }]
                        };
                    }
                    throw new Error(`Unhandled query: ${text}`);
                })
            };

            const result = await getPayerStatementOfAccount(db, {
                providerId,
                startDate: '2026-02-01',
                endDate: '2026-02-28'
            });

            expect(result.provider.name).toBe('AXA Insurance');
            expect(result.opening_balance).toBe(12000);
            expect(result.period_claims_total).toBe(5000);
            expect(result.period_receipts_total).toBe(4500);
            expect(result.period_deductions_total).toBe(500);
            // 12000 + 5000 - 4500 - 500 = 12000
            expect(result.closing_balance).toBe(12000);
            expect(result.transactions[0].claim_number).toBe('CLM-100');
        });
    });

    describe('getInsuranceAgingReport', () => {
        test('buckets balances by aging days', async () => {
            const db = {
                query: jest.fn(async () => ({
                    rows: [{
                        provider_id: '00000000-0000-4000-8000-000000000001',
                        provider_name: 'MetLife',
                        payer_code: 'MET',
                        active_claims_count: 5,
                        bucket_0_30: '10000.00',
                        bucket_31_60: '5000.00',
                        bucket_61_90: '2000.00',
                        bucket_90_plus: '1000.00',
                        total_outstanding: '18000.00'
                    }]
                }))
            };

            const result = await getInsuranceAgingReport(db, { asOfDate: '2026-03-31' });

            expect(result.summary.grand_total_outstanding).toBe(18000);
            expect(result.summary.bucket_0_30).toBe(10000);
            expect(result.summary.bucket_31_60).toBe(5000);
            expect(result.summary.bucket_61_90).toBe(2000);
            expect(result.summary.bucket_90_plus).toBe(1000);
            expect(result.providers[0].provider_name).toBe('MetLife');
        });
    });

    describe('getContractsPerformanceReport', () => {
        test('evaluates contract volume and financial breakdown', async () => {
            const db = {
                query: jest.fn(async () => ({
                    rows: [{
                        contract_id: '00000000-0000-4000-8000-000000000010',
                        contract_number: 'CNT-2026-VIP',
                        entity_name: 'Petroleum Medical Syndicate',
                        entity_type: 'Corporate',
                        commission_percentage: '10.00',
                        is_active: true,
                        provider_name: 'Direct / Corporate',
                        unique_patients: 45,
                        invoices_count: 60,
                        total_gross_billed: '150000.00',
                        total_insurance_covered: '120000.00',
                        total_patient_copay: '30000.00',
                        claims_count: 60,
                        claims_collected: '110000.00',
                        claims_deductions: '5000.00'
                    }]
                }))
            };

            const result = await getContractsPerformanceReport(db, {
                startDate: '2026-01-01',
                endDate: '2026-03-31'
            });

            expect(result.total_contracts).toBe(1);
            expect(result.contracts[0].entity_name).toBe('Petroleum Medical Syndicate');
            expect(result.contracts[0].total_gross_billed).toBe(150000);
            expect(result.contracts[0].total_insurance_covered).toBe(120000);
            expect(result.contracts[0].total_patient_copay).toBe(30000);
        });
    });

    describe('controller CSV streaming', () => {
        test('streams CSV with UTF-8 BOM when format=csv requested', async () => {
            const db = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text.includes('AS total_claims')) {
                        return { rows: [{ total_claims: 1, total_expected: '1000', total_received: '800', total_deductions: '100', total_outstanding: '100' }] };
                    }
                    if (text.includes('FROM insurance_providers ip')) {
                        return { rows: [{ provider_name: 'Allianz', payer_code: 'ALZ', claims_count: 1, expected_amount: '1000', received_amount: '800', deduction_amount: '100', outstanding_amount: '100', collection_rate: 80 }] };
                    }
                    return { rows: [] };
                })
            };

            const req = {
                query: { format: 'csv', startDate: '2026-01-01', endDate: '2026-01-31' }
            };
            const res = {
                setHeader: jest.fn(),
                send: jest.fn()
            };
            const next = jest.fn();

            await getClaimsSummary(db)(req, res, next);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
            expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('insurance-claims-summary'));
            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('\uFEFF'));
            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Allianz'));
        });
    });
});
