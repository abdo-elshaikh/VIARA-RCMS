jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn(async () => undefined),
}));

jest.mock('../src/services/notificationJobService', () => ({
    triggerEventForRole: jest.fn(async () => undefined),
}));

const {
    updateProvider,
    updateContract,
    updatePolicy,
    updateCoverageRule,
    updateApprovalStatus,
    getPolicies
} = require('../src/controllers/insuranceController');

const {
    updateClaimStatus,
    exportClaims
} = require('../src/controllers/claimsController');

describe('insurance lifecycle and contract controls', () => {
    describe('provider updates', () => {
        test('updates provider fields successfully', async () => {
            const client = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                    if (text.includes('SELECT * FROM insurance_providers')) {
                        return { rows: [{ provider_id: 'prov-1', name: 'Original Health Payer', payer_code: 'PAY-01' }] };
                    }
                    if (text.includes('UPDATE insurance_providers')) {
                        return { rows: [{ provider_id: 'prov-1', name: 'Updated Health Payer', payer_code: 'PAY-99' }] };
                    }
                    throw new Error(`Unhandled SQL: ${text}`);
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client) };

            const req = {
                params: { id: 'prov-1' },
                body: { name: 'Updated Health Payer', payerCode: 'PAY-99', isActive: true },
                user: { user_id: 'user-1' },
                ip: '127.0.0.1'
            };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await updateProvider(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                provider_id: 'prov-1',
                name: 'Updated Health Payer'
            }));
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('contract updates', () => {
        test('validates start and end date logic and updates contract', async () => {
            const client = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                    if (text.includes('SELECT * FROM contracts')) {
                        return { rows: [{ contract_id: 'c-1', entity_name: 'Corp', entity_type: 'Insurance_Provider', start_date: '2026-01-01', end_date: '2026-12-31', is_active: true }] };
                    }
                    if (text.includes('contract_id <> $1') || text.includes('daterange(')) {
                        return { rows: [] }; // no overlapping
                    }
                    if (text.includes('UPDATE contracts')) {
                        return { rows: [{ contract_id: 'c-1', contract_name: 'Premium 2026' }] };
                    }
                    throw new Error(`Unhandled SQL: ${text}`);
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client) };

            const req = {
                params: { id: 'c-1' },
                body: { contractName: 'Premium 2026', commissionPercentage: 15 },
                user: { user_id: 'user-1' },
                ip: '127.0.0.1'
            };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await updateContract(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                contract_id: 'c-1',
                contract_name: 'Premium 2026'
            }));
            expect(client.release).toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('policy updates', () => {
        test('updates patient policy and enforces primary policy uniqueness', async () => {
            const client = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                    if (text.includes('SELECT * FROM patient_insurance_policies')) {
                        return { rows: [{ policy_id: 'pol-1', patient_id: 'p-1', valid_from: '2026-01-01', valid_to: '2026-12-31' }] };
                    }
                    if (text.includes('SET is_primary = false')) {
                        return { rows: [] };
                    }
                    if (text.includes('UPDATE patient_insurance_policies')) {
                        return { rows: [{ policy_id: 'pol-1', plan_name: 'Gold Corporate' }] };
                    }
                    throw new Error(`Unhandled SQL: ${text}`);
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client) };

            const req = {
                params: { id: 'pol-1' },
                body: { planName: 'Gold Corporate', isPrimary: true },
                user: { user_id: 'user-1' },
                ip: '127.0.0.1'
            };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await updatePolicy(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                policy_id: 'pol-1',
                plan_name: 'Gold Corporate'
            }));
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('coverage rule updates', () => {
        test('updates coverage rule ceilings and percentages', async () => {
            const client = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                    if (text.includes('SELECT * FROM insurance_coverage_rules')) {
                        return { rows: [{ rule_id: 'r-1', provider_id: 'prov-1', effective_from: '2026-01-01', effective_to: '2026-12-31' }] };
                    }
                    if (text.includes('UPDATE insurance_coverage_rules')) {
                        return { rows: [{ rule_id: 'r-1', coverage_percentage: 90, copay_amount: 50 }] };
                    }
                    throw new Error(`Unhandled SQL: ${text}`);
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client) };

            const req = {
                params: { id: 'r-1' },
                body: { coveragePercentage: 90, copayAmount: 50 },
                user: { user_id: 'user-1' },
                ip: '127.0.0.1'
            };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await updateCoverageRule(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                rule_id: 'r-1',
                coverage_percentage: 90
            }));
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('clinical approval external decision recording', () => {
        test('allows Insurance_Staff to record insurer decision even if they requested it', async () => {
            const client = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                    if (text.includes('SELECT * FROM insurance_approvals')) {
                        return {
                            rows: [{
                                approval_id: 'appr-1',
                                requested_by: 'staff-user',
                                requested_amount: '500.00',
                                status: 'Pending'
                            }]
                        };
                    }
                    if (text.includes('UPDATE insurance_approvals')) {
                        return {
                            rows: [{
                                approval_id: 'appr-1',
                                status: 'Approved',
                                approval_number: 'AUTH-12345',
                                approved_amount: '450.00'
                            }]
                        };
                    }
                    throw new Error(`Unhandled SQL: ${text}`);
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client) };

            const req = {
                params: { approvalId: 'appr-1' },
                body: { status: 'Approved', approvalNumber: 'AUTH-12345', approvedAmount: 450 },
                user: { user_id: 'staff-user', role: 'Insurance_Staff' },
                ip: '127.0.0.1'
            };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await updateApprovalStatus(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                approval_id: 'appr-1',
                status: 'Approved'
            }));
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('claims contractual deductions and settlement', () => {
        test('permits claim status Paid when received amount + deduction equals expected amount', async () => {
            const client = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) {
                        return { rows: [] };
                    }
                    if (text.includes('SELECT * FROM insurance_claims')) {
                        return {
                            rows: [{
                                claim_id: '00000000-0000-4000-8000-000000000101',
                                claim_number: 'CLM-20260905-001',
                                status: 'Submitted',
                                expected_amount: '1000.00',
                                received_amount: '0.00',
                                deduction_amount: '0.00',
                                patient_id: 'p-1',
                                provider_id: 'prov-1',
                                branch_id: '00000000-0000-4000-8000-000000000001',
                                currency_code: 'EGP'
                            }]
                        };
                    }
                    if (text.includes('AS business_date')) {
                        return { rows: [{ business_date: '2026-09-05' }] };
                    }
                    if (text.includes('FROM financial_periods')) {
                        return { rows: [] };
                    }
                    if (text.includes('SELECT * FROM claim_receipts WHERE idempotency_key')) {
                        return { rows: [] };
                    }
                    if (text.includes('INSERT INTO claim_receipts')) {
                        return {
                            rows: [{
                                claim_receipt_id: 'cr-1',
                                business_date: '2026-09-05',
                                branch_id: '00000000-0000-4000-8000-000000000001',
                                currency_code: 'EGP'
                            }]
                        };
                    }
                    if (text.includes('SELECT batch_id FROM journal_batches')) {
                        return { rows: [] };
                    }
                    if (text.includes('INSERT INTO journal_batches')) {
                        return { rows: [{ batch_id: 'b-1' }] };
                    }
                    if (text.includes('INSERT INTO journal_entries')) {
                        return { rows: [] };
                    }
                    if (text.includes('UPDATE insurance_claims')) {
                        return {
                            rows: [{
                                claim_id: '00000000-0000-4000-8000-000000000101',
                                status: 'Paid',
                                received_amount: '800.00',
                                deduction_amount: '200.00',
                                deduction_reason: 'Contractual 20% discount'
                            }]
                        };
                    }
                    throw new Error(`Unhandled SQL: ${text}`);
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn().mockResolvedValue(client) };

            const req = {
                params: { id: '00000000-0000-4000-8000-000000000101' },
                body: {
                    status: 'Paid',
                    receivedAmount: 800,
                    deductionAmount: 200,
                    deductionReason: 'Contractual 20% discount'
                },
                get: jest.fn((header) => {
                    if (header === 'Idempotency-Key') return 'a0000000-0000-4000-8000-000000000001';
                    return null;
                }),
                user: { user_id: 'user-acc', role: 'Accountant' },
                ip: '127.0.0.1'
            };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await updateClaimStatus(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'Paid',
                received_amount: '800.00',
                deduction_amount: '200.00'
            }));
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('claims export', () => {
        test('exports claims in JSON format', async () => {
            const db = {
                query: jest.fn().mockResolvedValueOnce({
                    rows: [{
                        claim_id: 'c-1',
                        claim_number: 'CLM-001',
                        status: 'Paid',
                        expected_amount: '500.00',
                        received_amount: '500.00',
                        provider_name: 'GlobeMed'
                    }]
                })
            };

            const req = {
                query: { status: 'Paid', format: 'json' }
            };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await exportClaims(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ claim_number: 'CLM-001', provider_name: 'GlobeMed' })
            ]));
        });

        test('exports claims in CSV format', async () => {
            const db = {
                query: jest.fn().mockResolvedValueOnce({
                    rows: [{
                        claim_id: 'c-1',
                        claim_number: 'CLM-001',
                        claim_reference_number: 'REF-77',
                        status: 'Paid',
                        provider_name: 'GlobeMed',
                        payer_code: 'GM01',
                        mrn: 'MRN-101',
                        first_name: 'Ahmed',
                        last_name: 'Ali',
                        invoice_number: 'INV-101',
                        policy_number: 'POL-99',
                        plan_name: 'Corporate A',
                        expected_amount: '500.00',
                        received_amount: '400.00',
                        deduction_amount: '100.00',
                        deduction_reason: 'Copay deduction',
                        created_at: '2026-09-01T10:00:00Z',
                        submitted_at: '2026-09-02T10:00:00Z',
                        paid_at: '2026-09-05T10:00:00Z'
                    }]
                })
            };

            const req = {
                query: { format: 'csv' }
            };
            const res = {
                setHeader: jest.fn(),
                send: jest.fn()
            };
            const next = jest.fn();

            await exportClaims(db)(req, res, next);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('CLM-001'));
            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('GlobeMed'));
        });

        test('export claims query does not query p.first_name and decrypts patient names', async () => {
            const db = {
                query: jest.fn(async (sql) => {
                    expect(sql).not.toContain('p.first_name,');
                    expect(sql).toContain('p.first_name_enc');
                    return {
                        rows: [{
                            claim_id: 'c-1',
                            claim_number: 'CLM-002',
                            provider_name: 'MetLife',
                            mrn: 'MRN-303',
                            first_name_enc: null,
                            last_name_enc: null,
                            expected_amount: '300.00',
                            received_amount: '300.00',
                            deduction_amount: '0.00',
                            status: 'Paid'
                        }]
                    };
                })
            };

            const req = { query: { format: 'json' } };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await exportClaims(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ claim_number: 'CLM-002' })
            ]));
            expect(next).not.toHaveBeenCalled();
        });

        test('exports claims filtered by provider with provider name in Content-Disposition', async () => {
            const db = {
                query: jest.fn(async (sql, params) => {
                    expect(sql).toContain('c.provider_id =');
                    return {
                        rows: [{
                            claim_id: 'c-10',
                            claim_number: 'CLM-010',
                            provider_name: 'Allianz Care',
                            payer_code: 'ALZ',
                            mrn: 'MRN-777',
                            first_name_enc: null,
                            last_name_enc: null,
                            expected_amount: '1200.00',
                            received_amount: '1200.00',
                            deduction_amount: '0.00',
                            status: 'Paid'
                        }]
                    };
                })
            };

            const req = {
                query: { providerId: '00000000-0000-4000-8000-000000000099', format: 'csv' }
            };
            const res = {
                setHeader: jest.fn(),
                send: jest.fn()
            };
            const next = jest.fn();

            await exportClaims(db)(req, res, next);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
            expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('Allianz_Care'));
            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('CLM-010'));
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('patient policies retrieval', () => {
        test('retrieves patient policies and handles encrypted patient names without column errors', async () => {
            const db = {
                query: jest.fn(async (sql) => {
                    expect(sql).not.toContain('p.first_name,');
                    expect(sql).toContain('p.first_name_enc');
                    return {
                        rows: [{
                            policy_id: 'pol-1',
                            policy_number: 'POL-12345',
                            provider_name: 'Bupa',
                            mrn: 'MRN-2026',
                            first_name_enc: null,
                            last_name_enc: null,
                            holder_name: 'Sara Ahmed',
                            contract_number: 'CNT-01',
                            contract_name: 'Bupa VIP'
                        }]
                    };
                })
            };

            const req = { query: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await getPolicies(db)(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({
                    policy_id: 'pol-1',
                    policy_number: 'POL-12345',
                    provider_name: 'Bupa',
                    patient_name: 'Sara Ahmed'
                })
            ]));
            expect(next).not.toHaveBeenCalled();
        });
    });
});
