const { calculateCoverage } = require('../services/coverageService');
const { logAction } = require('../services/auditService');
const { AppError } = require('../middleware/errorHandler');

const money = (value) => Number(value || 0);

const getProviders = (db) => async (req, res, next) => {
    try {
        const result = await db.query('SELECT * FROM insurance_providers ORDER BY is_active DESC, name ASC');
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createProvider = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const result = await db.query(`
            INSERT INTO insurance_providers (
                name, payer_code, phone, email, address, notes, is_active, contact_info
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            data.name,
            data.payerCode || null,
            data.phone || null,
            data.email || null,
            data.address || null,
            data.notes || null,
            data.isActive ?? true,
            JSON.stringify({ phone: data.phone || null, email: data.email || null })
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getContracts = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT c.*, ip.name as provider_name
            FROM contracts c
            LEFT JOIN insurance_providers ip ON c.provider_id = ip.provider_id
            ORDER BY c.is_active DESC, c.entity_name ASC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createContract = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const overlap = await db.query(`
            SELECT contract_id
            FROM contracts
            WHERE is_active = true
              AND entity_type = $1
              AND lower(entity_name) = lower($2)
              AND provider_id IS NOT DISTINCT FROM $3::uuid
              AND daterange(COALESCE(start_date, '-infinity'::date), COALESCE(end_date, 'infinity'::date), '[]')
                  && daterange(COALESCE($4::date, '-infinity'::date), COALESCE($5::date, 'infinity'::date), '[]')
            LIMIT 1
        `, [
            data.entityType,
            data.entityName,
            data.providerId || null,
            data.startDate || null,
            data.endDate || null
        ]);
        if (overlap.rows.length) {
            throw new AppError('An active overlapping contract already exists for this payer/entity', 409);
        }

        const result = await db.query(`
            INSERT INTO contracts (
                provider_id, entity_name, entity_type, contract_number, commission_percentage,
                start_date, end_date, is_active, coverage_notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            data.providerId || null,
            data.entityName,
            data.entityType,
            data.contractNumber || null,
            data.commissionPercentage || null,
            data.startDate || null,
            data.endDate || null,
            data.isActive ?? true,
            data.coverageNotes || null
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getPolicies = (db) => async (req, res, next) => {
    try {
        const { patientId } = req.query;
        const values = [];
        let query = `
            SELECT pip.*, ip.name as provider_name
            FROM patient_insurance_policies pip
            JOIN insurance_providers ip ON pip.provider_id = ip.provider_id
            WHERE 1=1
        `;

        if (patientId) {
            query += ' AND pip.patient_id = $1';
            values.push(patientId);
        }

        query += ' ORDER BY pip.is_primary DESC, pip.created_at DESC';
        const result = await db.query(query, values);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createPolicy = (db) => async (req, res, next) => {
    let client;
    try {
        const data = req.body;
        client = await db.connect();
        await client.query('BEGIN');

        if (data.isPrimary ?? true) {
            await client.query(`
                UPDATE patient_insurance_policies
                SET is_primary = false, updated_at = NOW()
                WHERE patient_id = $1
            `, [data.patientId]);
        }

        const result = await client.query(`
            INSERT INTO patient_insurance_policies (
                patient_id, provider_id, policy_number, member_number, plan_name, holder_name,
                relationship_to_holder, valid_from, valid_to, is_primary, approval_document_url, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            data.patientId,
            data.providerId,
            data.policyNumber,
            data.memberNumber || null,
            data.planName || null,
            data.holderName || null,
            data.relationshipToHolder || null,
            data.validFrom || null,
            data.validTo || null,
            data.isPrimary ?? true,
            data.approvalDocumentUrl || null,
            data.notes || null
        ]);
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const createCoverageRule = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        if (data.contractId) {
            const contract = await db.query('SELECT provider_id, is_active FROM contracts WHERE contract_id = $1', [data.contractId]);
            if (!contract.rows.length) throw new AppError('Contract not found', 404);
            if (contract.rows[0].provider_id && contract.rows[0].provider_id !== data.providerId) {
                throw new AppError('Coverage rule provider must match the selected contract provider', 409);
            }
            if (!contract.rows[0].is_active) {
                throw new AppError('Coverage rules cannot be added to inactive contracts', 409);
            }
        }

        const overlap = await db.query(`
            SELECT rule_id
            FROM insurance_coverage_rules
            WHERE is_active = true
              AND provider_id = $1
              AND contract_id IS NOT DISTINCT FROM $2::uuid
              AND exam_type_id IS NOT DISTINCT FROM $3::uuid
              AND COALESCE(lower(modality_type), '') = COALESCE(lower($4::varchar), '')
              AND daterange(COALESCE(effective_from, '-infinity'::date), COALESCE(effective_to, 'infinity'::date), '[]')
                  && daterange(COALESCE($5::date, '-infinity'::date), COALESCE($6::date, 'infinity'::date), '[]')
            LIMIT 1
        `, [
            data.providerId,
            data.contractId || null,
            data.examTypeId || null,
            data.modalityType || null,
            data.effectiveFrom || null,
            data.effectiveTo || null
        ]);
        if (overlap.rows.length) {
            throw new AppError('An active overlapping coverage rule already exists for this scope', 409);
        }

        const result = await db.query(`
            INSERT INTO insurance_coverage_rules (
                provider_id, contract_id, exam_type_id, modality_type, coverage_percentage,
                coverage_ceiling, copay_amount, preauthorization_required,
                effective_from, effective_to, is_active, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            data.providerId,
            data.contractId || null,
            data.examTypeId || null,
            data.modalityType || null,
            data.coveragePercentage || 0,
            data.coverageCeiling || null,
            data.copayAmount || 0,
            data.preauthorizationRequired || false,
            data.effectiveFrom || null,
            data.effectiveTo || null,
            data.isActive ?? true,
            data.notes || null
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getCoverageRules = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT r.*, ip.name as provider_name, et.name as exam_type_name
            FROM insurance_coverage_rules r
            JOIN insurance_providers ip ON r.provider_id = ip.provider_id
            LEFT JOIN examination_types et ON r.exam_type_id = et.type_id
            ORDER BY r.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const previewCoverage = (db) => async (req, res, next) => {
    try {
        const result = await calculateCoverage(db, req.query);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

const createApproval = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        let providerId = data.providerId || null;
        if (data.policyId) {
            const policy = await db.query(`
                SELECT patient_id, provider_id, valid_to
                FROM patient_insurance_policies
                WHERE policy_id = $1
            `, [data.policyId]);
            if (!policy.rows.length) throw new AppError('Insurance policy not found', 404);
            if (policy.rows[0].patient_id !== data.patientId) {
                throw new AppError('Approval policy does not belong to the selected patient', 409);
            }
            if (providerId && providerId !== policy.rows[0].provider_id) {
                throw new AppError('Approval provider must match the selected policy provider', 409);
            }
            providerId = policy.rows[0].provider_id;
            if (policy.rows[0].valid_to && new Date(policy.rows[0].valid_to) < new Date(new Date().toDateString())) {
                throw new AppError('Cannot create an approval for an expired policy', 409);
            }
        }
        if (!providerId && data.status !== 'Not Required') {
            throw new AppError('Provider or policy is required for insurance approval', 400);
        }
        if (data.status === 'Approved' && money(data.requestedAmount) > 0 && money(data.approvedAmount) <= 0) {
            throw new AppError('Approved authorizations require an approved amount', 400);
        }

        const result = await db.query(`
            INSERT INTO insurance_approvals (
                patient_id, policy_id, provider_id, appointment_id, exam_id, exam_type_id,
                status, approval_number, requested_amount, approved_amount, document_url,
                rejection_reason, expires_at, requested_by, decided_by, decided_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7::varchar(30), $8, $9, $10, $11, $12, $13, $14,
                CASE WHEN $7::varchar(30) IN ('Approved', 'Rejected', 'Expired') THEN $14::uuid ELSE NULL END,
                CASE WHEN $7::varchar(30) IN ('Approved', 'Rejected', 'Expired') THEN NOW() ELSE NULL END
            )
            RETURNING *
        `, [
            data.patientId,
            data.policyId || null,
            providerId,
            data.appointmentId || null,
            data.examId || null,
            data.examTypeId || null,
            data.status || 'Pending',
            data.approvalNumber || null,
            data.requestedAmount || 0,
            data.approvedAmount || 0,
            data.documentUrl || null,
            data.rejectionReason || null,
            data.expiresAt || null,
            req.user.user_id
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getApprovals = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT ia.*, ip.name as provider_name, p.mrn, et.name as exam_type_name
            FROM insurance_approvals ia
            JOIN patients p ON ia.patient_id = p.patient_id
            LEFT JOIN insurance_providers ip ON ia.provider_id = ip.provider_id
            LEFT JOIN examination_types et ON ia.exam_type_id = et.type_id
            ORDER BY ia.requested_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const updateApprovalStatus = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query(
            'SELECT * FROM insurance_approvals WHERE approval_id = $1::uuid FOR UPDATE',
            [req.params.approvalId]
        );
        if (!existing.rows.length) throw new AppError('Insurance authorization not found', 404);
        const approval = existing.rows[0];
        if (approval.status !== 'Pending') {
            throw new AppError('Insurance authorization has already been decided', 409);
        }

        const userId = req.user.user_id || req.user.userId;
        if (req.user.role !== 'Developer' && approval.requested_by === userId) {
            throw new AppError('The requester cannot decide their own authorization', 403);
        }

        const approvedAmount = req.body.status === 'Approved'
            ? money(req.body.approvedAmount ?? approval.requested_amount)
            : 0;
        if (approvedAmount > money(approval.requested_amount)) {
            throw new AppError('Approved amount cannot exceed requested amount', 400);
        }

        const updated = await client.query(`
            UPDATE insurance_approvals
            SET status = $2::varchar(30),
                approval_number = CASE WHEN $2::varchar(30) = 'Approved' THEN $3::varchar(100) ELSE NULL END,
                approved_amount = CASE WHEN $2::varchar(30) = 'Approved' THEN $4::numeric ELSE 0::numeric END,
                rejection_reason = CASE WHEN $2::varchar(30) = 'Rejected' THEN $5::text ELSE NULL END,
                decided_by = $6::uuid,
                decided_at = CURRENT_TIMESTAMP
            WHERE approval_id = $1::uuid
            RETURNING *
        `, [
            req.params.approvalId,
            req.body.status,
            req.body.approvalNumber || null,
            approvedAmount,
            req.body.rejectionReason || null,
            userId
        ]);

        await logAction(client, {
            userId,
            action: `INSURANCE_AUTHORIZATION_${req.body.status.toUpperCase()}`,
            resourceId: req.params.approvalId,
            resourceTable: 'insurance_approvals',
            ipAddress: req.ip,
            details: {
                previousStatus: approval.status,
                newStatus: req.body.status,
                requestedAmount: money(approval.requested_amount),
                approvedAmount,
                rejectionReason: req.body.rejectionReason || null
            },
            required: true
        });

        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

module.exports = {
    getProviders,
    createProvider,
    getContracts,
    createContract,
    getPolicies,
    createPolicy,
    getCoverageRules,
    createCoverageRule,
    previewCoverage,
    getApprovals,
    createApproval,
    updateApprovalStatus
};
