const { AppError } = require('../middleware/errorHandler');
const { decrypt } = require('../utils/crypto');

const safeDecrypt = (text) => {
    if (!text) return '';
    try {
        return decrypt(text) || '';
    } catch {
        return '';
    }
};
const { logAction } = require('../services/auditService');
const {
    DEFAULT_BRANCH_ID,
    lockFinancialBusinessDate,
    moneyNumber,
    postJournalBatch,
    recordClaimReceipt
} = require('../services/financialPostingService');
const { triggerEventForRole } = require('../services/notificationJobService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLAIM_TRANSITIONS = {
    Draft: new Set(['Pending Approval', 'Written Off']),
    'Pending Approval': new Set(['Approved', 'Rejected', 'Written Off']),
    Approved: new Set(['Submitted', 'Written Off']),
    Submitted: new Set(['Paid', 'Partially Paid', 'Rejected']),
    'Partially Paid': new Set(['Paid', 'Rejected', 'Written Off']),
    Rejected: new Set(['Resubmitted', 'Written Off']),
    Resubmitted: new Set(['Paid', 'Partially Paid', 'Rejected']),
    Paid: new Set(),
    'Written Off': new Set()
};

const boundedInteger = (value, fallback, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(0, parsed));
};

const getClaims = (db) => async (req, res, next) => {
    try {
        const { status, providerId, patientId, rejectedOnly, branchId, limit = 100, offset = 0 } = req.query;
        const pageLimit = Math.max(1, boundedInteger(limit, 100, 500));
        const pageOffset = boundedInteger(offset, 0, Number.MAX_SAFE_INTEGER);
        const values = [];
        let param = 1;
        let query = `
            SELECT c.*, ip.name as provider_name, p.mrn, p.first_name_enc, p.last_name_enc, i.invoice_number
            FROM insurance_claims c
            JOIN insurance_providers ip ON c.provider_id = ip.provider_id
            JOIN patients p ON c.patient_id = p.patient_id
            LEFT JOIN invoices i ON c.invoice_id = i.invoice_id
            WHERE 1=1
        `;

        const userBranchId = req.user?.branch_id || req.user?.branchId;
        const isGlobalUser = ['Developer', 'Admin'].includes(req.user?.role);
        const targetBranchId = (isGlobalUser && branchId) ? branchId : userBranchId;
        if (targetBranchId) {
            query += ` AND c.branch_id = $${param++}::uuid`;
            values.push(targetBranchId);
        }

        if (rejectedOnly === 'true') {
            query += ` AND c.status = 'Rejected'`;
        } else if (status) {
            query += ` AND c.status = $${param++}::varchar`;
            values.push(status);
        }

        if (providerId) {
            query += ` AND c.provider_id = $${param++}::uuid`;
            values.push(providerId);
        }

        if (patientId) {
            query += ` AND c.patient_id = $${param++}::uuid`;
            values.push(patientId);
        }

        query += ` ORDER BY c.updated_at DESC LIMIT $${param++}::int OFFSET $${param}::int`;
        values.push(pageLimit, pageOffset);

        const result = await db.query(query, values);
        const rows = result.rows.map(row => {
            const firstName = row.first_name || safeDecrypt(row.first_name_enc);
            const lastName = row.last_name || safeDecrypt(row.last_name_enc);
            const patientName = row.patient_name || [firstName, lastName].filter(Boolean).join(' ') || '';
            const { first_name_enc, last_name_enc, ...cleanRow } = row;
            return {
                ...cleanRow,
                first_name: firstName,
                last_name: lastName,
                patient_name: patientName,
            };
        });
        res.json(rows);
    } catch (error) {
        next(error);
    }
};

const createClaim = (db) => async (req, res, next) => {
    let client;
    try {
        const data = req.body;
        client = await db.connect();
        await client.query('BEGIN');

        let expectedAmount = moneyNumber(data.expectedAmount);
        let invoice = null;
        let patientId = data.patientId;
        let policyId = data.policyId || null;
        if (data.invoiceId) {
            const invoiceResult = await client.query(
                'SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE',
                [data.invoiceId]
            );
            invoice = invoiceResult.rows[0];
            if (!invoice || invoice.invoice_status === 'Voided') {
                throw new AppError('An active invoice is required for this claim', 409);
            }
            if (data.patientId && data.patientId !== invoice.patient_id) {
                throw new AppError('Claim patient does not match the invoice patient', 409);
            }
            patientId = invoice.patient_id;
            expectedAmount = expectedAmount || moneyNumber(invoice.insurance_covered_amount);
            if (expectedAmount > moneyNumber(invoice.insurance_covered_amount) + 0.005) {
                throw new AppError('Expected claim amount exceeds the invoice insurance coverage', 409);
            }
            if (invoice.insurance_policy_id && policyId && policyId !== invoice.insurance_policy_id) {
                throw new AppError('Claim policy must match the policy recorded on the invoice', 409);
            }
            policyId = invoice.insurance_policy_id || policyId;
        }
        if (expectedAmount <= 0) throw new AppError('Expected claim amount must be greater than zero', 400);

        if (policyId) {
            const policyResult = await client.query(`
                SELECT patient_id, provider_id, valid_to
                FROM patient_insurance_policies
                WHERE policy_id = $1
            `, [policyId]);
            const policy = policyResult.rows[0];
            if (!policy) throw new AppError('Insurance policy not found', 404);
            if (policy.patient_id !== patientId) {
                throw new AppError('Claim policy does not belong to the claim patient', 409);
            }
            if (policy.provider_id !== data.providerId) {
                throw new AppError('Claim provider must match the selected policy provider', 409);
            }
            if (policy.valid_to && new Date(policy.valid_to) < new Date(new Date().toDateString())) {
                throw new AppError('Cannot create a claim for an expired policy', 409);
            }
        }

        if (data.approvalId) {
            const approvalResult = await client.query(`
                SELECT patient_id, provider_id, policy_id, status, approval_number, approved_amount, expires_at
                FROM insurance_approvals
                WHERE approval_id = $1
            `, [data.approvalId]);
            const approval = approvalResult.rows[0];
            if (!approval) throw new AppError('Insurance approval not found', 404);
            if (approval.patient_id !== patientId) {
                throw new AppError('Claim approval does not belong to the claim patient', 409);
            }
            if (approval.provider_id && approval.provider_id !== data.providerId) {
                throw new AppError('Claim provider must match the selected approval provider', 409);
            }
            if (policyId && approval.policy_id && approval.policy_id !== policyId) {
                throw new AppError('Claim approval must match the selected policy', 409);
            }
            if (approval.status !== 'Approved') {
                throw new AppError('Claims can only reference approved authorizations', 409);
            }
            if (!approval.approval_number) {
                throw new AppError('Approved authorization is missing an approval number', 409);
            }
            if (approval.expires_at && new Date(approval.expires_at) < new Date(new Date().toDateString())) {
                throw new AppError('Cannot create a claim from an expired authorization', 409);
            }
            const approvedAmount = moneyNumber(approval.approved_amount);
            if (approvedAmount > 0 && expectedAmount > approvedAmount + 0.005) {
                throw new AppError('Expected claim amount exceeds the approved authorization amount', 409);
            }
        }

        const result = await client.query(`
            INSERT INTO insurance_claims (
                invoice_id, patient_id, provider_id, policy_id, approval_id,
                claim_reference_number, expected_amount, created_by, updated_by,
                branch_id, currency_code
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10)
            RETURNING *
        `, [
            data.invoiceId || null,
            patientId,
            data.providerId,
            policyId,
            data.approvalId || null,
            data.claimReferenceNumber || null,
            expectedAmount,
            req.user.user_id,
            invoice?.branch_id || data.branchId || req.user?.branch_id || req.user?.branchId || DEFAULT_BRANCH_ID,
            invoice?.currency_code || 'EGP'
        ]);

        await client.query('COMMIT');
        await logAction(client, {
            userId: req.user.user_id,
            action: 'CLAIM_CREATED',
            resourceId: result.rows[0].claim_id,
            resourceTable: 'insurance_claims',
            ipAddress: req.ip,
            details: {
                invoiceId: data.invoiceId || null,
                patientId,
                providerId: data.providerId,
                policyId,
                approvalId: data.approvalId || null,
                expectedAmount,
                branchId: invoice?.branch_id || DEFAULT_BRANCH_ID
            }
        });

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error.code === '23505' && error.constraint === 'idx_insurance_claims_active_invoice_unique') {
            return next(new AppError('An active insurance claim already exists for this invoice', 409));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateClaimStatus = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = req.body;
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT * FROM insurance_claims WHERE claim_id::text = $1 OR claim_number = $1 FOR UPDATE',
            [id]
        );
        if (existing.rows.length === 0) {
            throw new AppError('Claim not found', 404);
        }

        const claim = existing.rows[0];
        if (data.status !== claim.status && !CLAIM_TRANSITIONS[claim.status]?.has(data.status)) {
            throw new AppError(`Claim cannot move from ${claim.status} to ${data.status}`, 409);
        }
        if (
            claim.status === 'Pending Approval'
            && ['Approved', 'Rejected'].includes(data.status)
            && req.user?.role !== 'Developer'
            && claim.created_by === req.user?.user_id
        ) {
            throw new AppError('The claim creator cannot approve or reject their own request', 403);
        }

        const receivedAmount = data.receivedAmount !== undefined
            ? moneyNumber(data.receivedAmount)
            : moneyNumber(claim.received_amount);
        const previousReceivedAmount = moneyNumber(claim.received_amount);

        const deductionAmount = data.deductionAmount !== undefined
            ? moneyNumber(data.deductionAmount)
            : moneyNumber(claim.deduction_amount || 0);
        const previousDeductionAmount = moneyNumber(claim.deduction_amount || 0);
        const deductionReason = data.deductionReason !== undefined
            ? data.deductionReason
            : claim.deduction_reason;

        const expectedAmount = moneyNumber(claim.expected_amount);

        if (receivedAmount + 0.005 < previousReceivedAmount) {
            throw new AppError('Received amount cannot be reduced; record a reversal instead', 409);
        }
        if (deductionAmount < 0) {
            throw new AppError('Deduction amount cannot be negative', 400);
        }
        if (deductionAmount > 0 && !deductionReason?.trim()) {
            throw new AppError('A deduction reason is required when a contractual deduction is recorded', 400);
        }
        if (deductionAmount + 0.005 < previousDeductionAmount) {
            throw new AppError('Deduction amount cannot be reduced; record a reversal instead', 409);
        }

        const totalSettled = moneyNumber(receivedAmount + deductionAmount);
        if (totalSettled > expectedAmount + 0.005) {
            throw new AppError('Total settled amount (received + deductions) cannot exceed the expected claim amount', 409);
        }
        if (data.status === 'Paid' && totalSettled + 0.005 < expectedAmount) {
            throw new AppError('A paid claim must include the full expected amount (received plus deductions)', 400);
        }
        if (data.status === 'Partially Paid' && (totalSettled <= 0 || totalSettled >= expectedAmount - 0.005)) {
            throw new AppError('A partially paid claim must be above zero and below the expected amount', 400);
        }
        if (data.status === 'Rejected' && !data.rejectionReason?.trim()) {
            throw new AppError('A rejection reason is required', 400);
        }
        if (data.status === 'Resubmitted' && !data.resubmissionNotes?.trim()) {
            throw new AppError('Resubmission notes are required', 400);
        }
        if (['Submitted', 'Resubmitted'].includes(data.status)
            && !(data.claimReferenceNumber || claim.claim_reference_number)) {
            throw new AppError('A provider claim reference is required before submission', 400);
        }

        const receiptDelta = moneyNumber(receivedAmount - previousReceivedAmount);
        let claimReceipt = null;
        if (receiptDelta > 0) {
            const idempotencyKey = req.get('Idempotency-Key');
            if (!idempotencyKey || !UUID_PATTERN.test(idempotencyKey)) {
                throw new AppError('A valid UUID Idempotency-Key header is required when recording claim receipts', 400);
            }
            claimReceipt = await recordClaimReceipt(client, {
                claim,
                amount: receiptDelta,
                cumulativeAmount: receivedAmount,
                userId: req.user.user_id,
                referenceNumber: data.claimReferenceNumber,
                idempotencyKey
            });
            await postJournalBatch(client, {
                sourceType: 'ClaimReceipt',
                sourceId: claimReceipt.claim_receipt_id,
                businessDate: claimReceipt.business_date,
                branchId: claimReceipt.branch_id,
                currencyCode: claimReceipt.currency_code,
                description: `Insurance receipt for ${claim.claim_number}`,
                userId: req.user.user_id,
                entries: [
                    { accountCode: '1020', accountName: 'Insurance clearing', debit: receiptDelta, credit: 0, patientId: claim.patient_id, payerId: claim.provider_id },
                    { accountCode: '1110', accountName: 'Insurance receivables', debit: 0, credit: receiptDelta, patientId: claim.patient_id, payerId: claim.provider_id }
                ]
            });
        }

        const deductionDelta = moneyNumber(deductionAmount - previousDeductionAmount);
        if (deductionDelta > 0) {
            const lockedPeriod = await lockFinancialBusinessDate(client, { branchId: claim.branch_id || DEFAULT_BRANCH_ID });
            await postJournalBatch(client, {
                sourceType: 'ClaimDeduction',
                sourceId: `${claim.claim_id}:${deductionAmount}`,
                businessDate: lockedPeriod.businessDate,
                branchId: claim.branch_id || DEFAULT_BRANCH_ID,
                currencyCode: claim.currency_code || 'EGP',
                description: `Insurance deduction for ${claim.claim_number}: ${deductionReason || 'Contractual deduction'}`,
                userId: req.user.user_id,
                entries: [
                    { accountCode: '4090', accountName: 'Insurance contractual deductions', debit: deductionDelta, credit: 0, patientId: claim.patient_id, payerId: claim.provider_id },
                    { accountCode: '1110', accountName: 'Insurance receivables', debit: 0, credit: deductionDelta, patientId: claim.patient_id, payerId: claim.provider_id }
                ]
            });
        }

        const result = await client.query(`
            UPDATE insurance_claims
            SET status = $1::varchar(50),
                claim_reference_number = COALESCE($2, claim_reference_number),
                received_amount = COALESCE($3, received_amount),
                deduction_amount = COALESCE($4, deduction_amount),
                deduction_reason = COALESCE($5, deduction_reason),
                rejection_reason = CASE WHEN $1::varchar(50) = 'Rejected' THEN $6 ELSE rejection_reason END,
                resubmission_notes = CASE WHEN $1::varchar(50) = 'Resubmitted' THEN $7 ELSE resubmission_notes END,
                submitted_at = CASE WHEN $1::varchar(50) IN ('Submitted', 'Resubmitted') THEN COALESCE(submitted_at, NOW()) ELSE submitted_at END,
                paid_at = CASE WHEN $1::varchar(50) = 'Paid' THEN NOW() ELSE paid_at END,
                written_off_at = CASE WHEN $1::varchar(50) = 'Written Off' THEN COALESCE(written_off_at, NOW()) ELSE written_off_at END,
                updated_by = $8,
                updated_at = NOW()
            WHERE claim_id = $9
            RETURNING *
        `, [
            data.status,
            data.claimReferenceNumber || null,
            receivedAmount,
            deductionAmount,
            deductionReason || null,
            data.rejectionReason || null,
            data.resubmissionNotes || null,
            req.user.user_id,
            existing.rows[0].claim_id
        ]);

        await client.query('COMMIT');
        await logAction(client, {
            userId: req.user.user_id,
            action: 'CLAIM_STATUS_UPDATED',
            resourceId: existing.rows[0].claim_id,
            resourceTable: 'insurance_claims',
            ipAddress: req.ip,
            details: {
                previousStatus: claim.status,
                newStatus: data.status,
                previousReceivedAmount,
                newReceivedAmount: receivedAmount,
                previousDeductionAmount,
                newDeductionAmount: deductionAmount,
                deductionReason: deductionReason || null,
                claimReceiptId: claimReceipt?.claim_receipt_id || null,
                rejectionReason: data.rejectionReason || null,
                resubmissionNotes: data.resubmissionNotes || null
            }
        });

        if (data.status === 'Approved') {
            triggerEventForRole(db, 'ClaimApproved', 'Accountant', {
                priority: 'Normal',
                variables: {
                    claim_id: existing.rows[0].claim_id,
                    patient_id: claim.patient_id,
                    approved_amount: expectedAmount
                }
            }).catch(() => {});

            triggerEventForRole(db, 'ClaimApproved', 'Admin', {
                priority: 'Normal',
                variables: {
                    claim_id: existing.rows[0].claim_id,
                    patient_id: claim.patient_id,
                    approved_amount: expectedAmount
                }
            }).catch(() => {});
        }

        if (['Submitted', 'Resubmitted'].includes(data.status)) {
            for (const role of ['Accountant', 'Admin']) {
                triggerEventForRole(db, 'ClaimSubmitted', role, {
                    priority: 'Normal',
                    variables: {
                        claim_id: existing.rows[0].claim_id,
                        patient_id: claim.patient_id,
                        provider_name: claim.provider_id || '',
                        amount: expectedAmount
                    }
                }).catch(() => {});
            }
        }

        if (data.status === 'Rejected') {
            triggerEventForRole(db, 'ClaimRejected', 'Accountant', {
                priority: 'Action',
                variables: {
                    claim_id: existing.rows[0].claim_id,
                    patient_id: claim.patient_id,
                    rejection_reason: data.rejectionReason || ''
                }
            }).catch(() => {});

            triggerEventForRole(db, 'ClaimRejected', 'Admin', {
                priority: 'Action',
                variables: {
                    claim_id: existing.rows[0].claim_id,
                    patient_id: claim.patient_id,
                    rejection_reason: data.rejectionReason || ''
                }
            }).catch(() => {});
        }

        if (data.status === 'Paid') {
            triggerEventForRole(db, 'ClaimPaid', 'Accountant', {
                priority: 'Normal',
                variables: {
                    claim_id: existing.rows[0].claim_id,
                    patient_id: claim.patient_id,
                    paid_amount: receivedAmount
                }
            }).catch(() => {});

            triggerEventForRole(db, 'ClaimPaid', 'Admin', {
                priority: 'Normal',
                variables: {
                    claim_id: existing.rows[0].claim_id,
                    patient_id: claim.patient_id,
                    paid_amount: receivedAmount
                }
            }).catch(() => {});
        }

        res.json({ ...result.rows[0], claim_receipt: claimReceipt });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const exportClaims = (db) => async (req, res, next) => {
    try {
        const { status, providerId, patientId, startDate, endDate, format = 'json', branchId } = req.query;
        const values = [];
        let param = 1;
        let query = `
            SELECT c.claim_id, c.claim_number, c.claim_reference_number, c.status,
                   c.expected_amount, c.received_amount, c.deduction_amount, c.deduction_reason,
                   c.rejection_reason, c.resubmission_notes,
                   c.created_at, c.submitted_at, c.paid_at, c.written_off_at,
                   ip.name as provider_name, ip.payer_code,
                   p.mrn, p.first_name_enc, p.last_name_enc,
                   i.invoice_number,
                   pol.policy_number, pol.plan_name
            FROM insurance_claims c
            JOIN insurance_providers ip ON c.provider_id = ip.provider_id
            JOIN patients p ON c.patient_id = p.patient_id
            LEFT JOIN invoices i ON c.invoice_id = i.invoice_id
            LEFT JOIN patient_insurance_policies pol ON c.policy_id = pol.policy_id
            WHERE 1=1
        `;

        const userBranchId = req.user?.branch_id || req.user?.branchId;
        const isGlobalUser = ['Developer', 'Admin'].includes(req.user?.role);
        const targetBranchId = (isGlobalUser && branchId) ? branchId : userBranchId;
        if (targetBranchId) {
            query += ` AND c.branch_id = $${param++}::uuid`;
            values.push(targetBranchId);
        }

        if (status) {
            query += ` AND c.status = $${param++}::varchar`;
            values.push(status);
        }
        if (providerId) {
            query += ` AND c.provider_id = $${param++}::uuid`;
            values.push(providerId);
        }
        if (patientId) {
            query += ` AND c.patient_id = $${param++}::uuid`;
            values.push(patientId);
        }
        if (startDate) {
            query += ` AND c.created_at >= $${param++}::timestamptz`;
            values.push(startDate);
        }
        if (endDate) {
            query += ` AND c.created_at <= $${param++}::timestamptz`;
            values.push(endDate);
        }

        query += ` ORDER BY c.created_at DESC`;
        const result = await db.query(query, values);

        const decryptedRows = result.rows.map(r => {
            const firstName = r.first_name || safeDecrypt(r.first_name_enc);
            const lastName = r.last_name || safeDecrypt(r.last_name_enc);
            const patientName = r.patient_name || [firstName, lastName].filter(Boolean).join(' ') || '';
            const { first_name_enc, last_name_enc, ...cleanRow } = r;
            return {
                ...cleanRow,
                first_name: firstName,
                last_name: lastName,
                patient_name: patientName,
            };
        });

        if (format === 'csv') {
            const headers = [
                'Claim Number', 'Reference', 'Status', 'Provider', 'Payer Code',
                'Patient MRN', 'Patient Name', 'Invoice', 'Policy Number', 'Plan',
                'Expected Amount', 'Received Amount', 'Deduction Amount', 'Deduction Reason',
                'Created At', 'Submitted At', 'Paid At'
            ];
            const rows = decryptedRows.map(r => [
                r.claim_number,
                r.claim_reference_number || '',
                r.status,
                `"${(r.provider_name || '').replace(/"/g, '""')}"`,
                r.payer_code || '',
                r.mrn,
                `"${(r.patient_name || '').replace(/"/g, '""')}"`,
                r.invoice_number || '',
                r.policy_number || '',
                `"${(r.plan_name || '').replace(/"/g, '""')}"`,
                r.expected_amount,
                r.received_amount,
                r.deduction_amount || 0,
                `"${(r.deduction_reason || '').replace(/"/g, '""')}"`,
                r.created_at?.toISOString?.() || r.created_at || '',
                r.submitted_at?.toISOString?.() || r.submitted_at || '',
                r.paid_at?.toISOString?.() || r.paid_at || ''
            ]);

            const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
            let safeProviderName = providerId ? 'provider' : 'all-providers';
            if (providerId) {
                if (decryptedRows[0]?.provider_name) {
                    safeProviderName = decryptedRows[0].provider_name.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
                } else {
                    try {
                        const pRes = await db.query('SELECT name FROM insurance_providers WHERE provider_id = $1', [providerId]);
                        if (pRes.rows[0]?.name) {
                            safeProviderName = pRes.rows[0].name.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
                        }
                    } catch (e) {
                        // ignore and keep fallback 'provider'
                    }
                }
            }
            const dateStr = new Date().toISOString().slice(0, 10);
            const filename = `insurance-claims-${safeProviderName}-${dateStr}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(csvContent);
        }

        res.json(decryptedRows);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getClaims,
    createClaim,
    updateClaimStatus,
    exportClaims
};
