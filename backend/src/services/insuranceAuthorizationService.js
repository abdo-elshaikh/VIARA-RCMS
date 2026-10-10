const { AppError } = require('../middleware/errorHandler');

const findMatchingApprovedAuthorization = async (db, invoiceId) => {
    const requirement = await db.query(`
        SELECT COALESCE(selected_rule.preauthorization_required, false) AS preauthorization_required
        FROM invoices i
        LEFT JOIN appointments a ON a.appointment_id = i.appointment_id
        LEFT JOIN examinations e ON e.exam_id = i.exam_id
            OR (i.exam_id IS NULL AND e.appointment_id = i.appointment_id)
        LEFT JOIN examination_types et ON et.type_id = COALESCE(e.exam_type_id, a.exam_type_id)
        LEFT JOIN modalities m ON m.modality_id = COALESCE(e.modality_id, a.modality_id)
        LEFT JOIN patient_insurance_policies pip
          ON pip.policy_id = i.insurance_policy_id
         AND pip.patient_id = i.patient_id
         AND (pip.valid_from IS NULL OR pip.valid_from <= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
         AND (pip.valid_to IS NULL OR pip.valid_to >= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
        LEFT JOIN LATERAL (
            SELECT r.preauthorization_required
            FROM insurance_coverage_rules r
            WHERE r.provider_id = pip.provider_id
              AND r.is_active = true
              AND (r.contract_id IS NOT DISTINCT FROM pip.contract_id
                   OR (pip.contract_id IS NOT NULL AND r.contract_id IS NULL))
              AND (r.exam_type_id = COALESCE(e.exam_type_id, a.exam_type_id) OR r.exam_type_id IS NULL)
              AND (r.modality_type = m.type OR r.modality_type IS NULL)
              AND (r.effective_from IS NULL OR r.effective_from <= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
              AND (r.effective_to IS NULL OR r.effective_to >= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
            ORDER BY
              CASE WHEN r.contract_id IS NOT DISTINCT FROM pip.contract_id THEN 1 ELSE 2 END,
              CASE WHEN r.exam_type_id = COALESCE(e.exam_type_id, a.exam_type_id) THEN 1 ELSE 2 END,
              CASE WHEN r.modality_type = m.type THEN 1 ELSE 2 END,
              r.created_at DESC
            LIMIT 1
        ) selected_rule ON true
        WHERE i.invoice_id = $1
          AND i.insurance_covered_amount > 0
    `, [invoiceId]);

    if (!requirement.rows[0]?.preauthorization_required) return null;

    const result = await db.query(`
        SELECT ia.approval_id
        FROM invoices i
        LEFT JOIN appointments a ON a.appointment_id = i.appointment_id
        LEFT JOIN examinations e ON e.exam_id = i.exam_id
            OR (i.exam_id IS NULL AND e.appointment_id = i.appointment_id)
        LEFT JOIN patient_insurance_policies pip
          ON pip.policy_id = i.insurance_policy_id
         AND pip.patient_id = i.patient_id
         AND (pip.valid_from IS NULL OR pip.valid_from <= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
         AND (pip.valid_to IS NULL OR pip.valid_to >= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
        JOIN insurance_approvals ia
          ON ia.patient_id = i.patient_id
         AND ia.status = 'Approved'
         AND NULLIF(BTRIM(ia.approval_number), '') IS NOT NULL
         AND (ia.expires_at IS NULL OR ia.expires_at::date >= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
         AND (
            (COALESCE(i.appointment_id, e.appointment_id) IS NOT NULL AND ia.appointment_id = COALESCE(i.appointment_id, e.appointment_id))
            OR (COALESCE(i.exam_id, e.exam_id) IS NOT NULL AND ia.exam_id = COALESCE(i.exam_id, e.exam_id))
         )
         AND (ia.policy_id IS NULL OR ia.policy_id = i.insurance_policy_id)
         AND ia.provider_id = pip.provider_id
         AND (ia.exam_type_id IS NULL OR ia.exam_type_id = COALESCE(e.exam_type_id, a.exam_type_id))
         AND COALESCE(ia.approved_amount, 0) + 0.005 >= i.insurance_covered_amount
        WHERE i.invoice_id = $1
          AND i.insurance_covered_amount > 0
        ORDER BY ia.decided_at DESC NULLS LAST, ia.requested_at DESC
        LIMIT 1
    `, [invoiceId]);

    return result.rows[0] || null;
};

const assertInsuranceAuthorization = async (db, invoiceId) => {
    const authorization = await findMatchingApprovedAuthorization(db, invoiceId);
    if (!authorization) {
        throw new AppError(
            'A valid approved insurance authorization matching this examination and coverage amount is required',
            409,
            true,
            'INSURANCE_AUTHORIZATION_REQUIRED',
            { invoiceId }
        );
    }
    return authorization;
};

const syncInvoicesAfterAppointmentReschedule = async (client, appointmentId, serviceStartTime) => {
    const invoices = await client.query(`
        SELECT i.invoice_id, COALESCE(i.insurance_covered_amount, 0) > 0 AS has_insurance_coverage
        FROM invoices i
        WHERE i.invoice_status <> 'Voided'
          AND (i.appointment_id = $1 OR i.exam_id IN (
              SELECT e.exam_id FROM examinations e WHERE e.appointment_id = $1
          ))
        FOR UPDATE OF i
    `, [appointmentId]);
    if (!invoices.rows.length) return [];

    const invoiceIds = invoices.rows.map((invoice) => invoice.invoice_id);
    const claims = await client.query(`
        SELECT invoice_id, status
        FROM insurance_claims
        WHERE invoice_id = ANY($1::uuid[])
        FOR UPDATE
    `, [invoiceIds]);
    if (claims.rows.some((claim) => !['Draft', 'Pending Approval'].includes(claim.status))) {
        throw new AppError(
            'This appointment has an insurance claim that has moved beyond draft. Resolve or retract the claim before rescheduling.',
            409,
            true,
            'RESCHEDULE_CLAIM_REVIEW_REQUIRED'
        );
    }

    await client.query(`
        UPDATE invoices i
        SET service_date = ($2::timestamptz AT TIME ZONE COALESCE(NULLIF((
            SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'
        ), ''), 'Africa/Cairo'))::date
        WHERE i.invoice_id = ANY($1::uuid[])
    `, [invoiceIds, serviceStartTime]);

    const invalidPolicy = await client.query(`
        SELECT i.invoice_id
        FROM invoices i
        LEFT JOIN patient_insurance_policies pip ON pip.policy_id = i.insurance_policy_id
        WHERE i.invoice_id = ANY($1::uuid[])
          AND COALESCE(i.insurance_covered_amount, 0) > 0
          AND (
              pip.policy_id IS NULL
              OR (pip.valid_from IS NOT NULL AND pip.valid_from > i.service_date)
              OR (pip.valid_to IS NOT NULL AND pip.valid_to < i.service_date)
          )
        LIMIT 1
    `, [invoiceIds]);
    if (invalidPolicy.rows.length) {
        throw new AppError(
            'The linked insurance policy is not valid on the new appointment date. Update the policy or invoice before rescheduling.',
            409,
            true,
            'RESCHEDULE_INSURANCE_POLICY_INVALID'
        );
    }

    for (const invoice of invoices.rows) {
        if (invoice.has_insurance_coverage) {
            await assertInsuranceAuthorization(client, invoice.invoice_id);
        }
    }
    return invoices.rows;
};

module.exports = {
    assertInsuranceAuthorization,
    findMatchingApprovedAuthorization,
    syncInvoicesAfterAppointmentReschedule
};
