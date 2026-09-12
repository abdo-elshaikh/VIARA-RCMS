const { AppError } = require('../middleware/errorHandler');
const { decrypt } = require('../utils/crypto');
const { getInvoicePaymentPosition } = require('../services/partialPaymentExceptionService');
const { triggerEvent, triggerEventForRole } = require('../services/notificationJobService');

const getUserId = (req) => req.user?.user_id || req.user?.userId || null;

const withPatientName = (row) => {
    const { first_name_enc, last_name_enc, ...rest } = row;
    return {
        ...rest,
        patient_name: [first_name_enc ? decrypt(first_name_enc) : '', last_name_enc ? decrypt(last_name_enc) : '']
            .filter(Boolean)
            .join(' ')
    };
};

const getExceptionVariables = (request, status, reviewNotes) => ({
    invoice_number: request.invoice_number || request.invoice_id || '',
    patient_name: request.patient_name || '',
    order_number: request.order_number || '',
    amount: request.requested_balance_amount || request.balance_amount || 0,
    reason: request.reason || '',
    status,
    review_notes: reviewNotes || '',
    target_stage: request.metadata?.targetStage || '',
});

const getPartialPaymentExceptions = (db) => async (req, res, next) => {
    try {
        const clauses = [];
        const params = [];
        let param = 1;

        if (req.query.status) {
            clauses.push(`ppe.status = $${param++}`);
            params.push(req.query.status);
        }
        if (req.query.transactionType) {
            clauses.push(`ppe.transaction_type = $${param++}`);
            params.push(req.query.transactionType);
        }
        if (req.query.invoiceId) {
            clauses.push(`ppe.invoice_id = $${param++}`);
            params.push(req.query.invoiceId);
        }

        const limit = Number(req.query.limit || 100);
        const offset = Number(req.query.offset || 0);
        params.push(limit, offset);

        const result = await db.query(`
            SELECT ppe.*,
                   i.invoice_number,
                   i.invoice_status,
                   p.mrn,
                   p.first_name_enc,
                   p.last_name_enc,
                   requester.full_name AS requested_by_name,
                   reviewer.full_name AS reviewed_by_name,
                   responsible.full_name AS responsible_party_name
            FROM partial_payment_exceptions ppe
            JOIN invoices i ON i.invoice_id = ppe.invoice_id
            LEFT JOIN patients p ON p.patient_id = ppe.patient_id
            LEFT JOIN users requester ON requester.user_id = ppe.requested_by
            LEFT JOIN users reviewer ON reviewer.user_id = ppe.reviewed_by
            LEFT JOIN users responsible ON responsible.user_id = ppe.responsible_party_id
            ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
            ORDER BY
                CASE ppe.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END,
                ppe.requested_at DESC
            LIMIT $${param++} OFFSET $${param++}
        `, params);

        res.json(result.rows.map(withPatientName));
    } catch (error) {
        next(error);
    }
};

const requestPartialPaymentException = (db) => async (req, res, next) => {
    let client;

    try {
        client = await db.connect();
        await client.query('BEGIN');

        const position = await getInvoicePaymentPosition(client, req.params.id);
        if (!position || position.invoice_status === 'Voided') {
            throw new AppError('Invoice is unavailable for partial payment exception', 404);
        }
        if (position.balance_amount <= 0.005) {
            throw new AppError('Invoice has no outstanding balance requiring an exception', 409);
        }
        if (position.net_paid_amount <= 0.005) {
            throw new AppError('Collect a partial payment before requesting a partial payment exception', 409);
        }

        const result = await client.query(`
            INSERT INTO partial_payment_exceptions (
                invoice_id, patient_id, appointment_id, exam_id, transaction_type,
                reason, requested_balance_amount, net_paid_amount, responsible_party_id,
                requested_by, expires_at, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
            RETURNING *
        `, [
            position.invoice_id,
            position.patient_id,
            position.appointment_id,
            position.exam_id,
            req.body.transactionType,
            req.body.reason,
            position.balance_amount,
            position.net_paid_amount,
            req.body.responsiblePartyId || null,
            getUserId(req),
            req.body.expiresAt || null,
            JSON.stringify({ ...(req.body.metadata || {}), targetStage: req.body.targetStage })
        ]);

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);

        const requestVariables = getExceptionVariables(withPatientName({
            ...position,
            ...result.rows[0],
        }), 'Pending');

        triggerEventForRole(db, 'PartialPaymentException', 'Accountant', {
            priority: 'Warning',
            entityType: 'PartialPaymentException',
            entityId: result.rows[0].exception_id,
            occurrenceKey: `partial-payment-exception:${result.rows[0].exception_id}:pending:accountant`,
            variables: requestVariables,
        }).catch(() => {});

        triggerEventForRole(db, 'PartialPaymentException', 'Admin', {
            priority: 'Warning',
            entityType: 'PartialPaymentException',
            entityId: result.rows[0].exception_id,
            occurrenceKey: `partial-payment-exception:${result.rows[0].exception_id}:pending:admin`,
            variables: requestVariables,
        }).catch(() => {});
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error.code === '23505') {
            return next(new AppError(
                'A pending exception already exists for this invoice and transaction',
                409,
                true,
                'PARTIAL_PAYMENT_EXCEPTION_PENDING',
                {
                    status: 'Pending',
                    invoiceId: req.params.id,
                    transactionType: req.body.transactionType,
                    targetStage: req.body.targetStage
                }
            ));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const reviewPartialPaymentException = (db) => async (req, res, next) => {
    let client;

    try {
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query(`
            SELECT ppe.*,
                   i.invoice_number,
                   requester.role::text AS requested_by_role,
                   p.first_name_enc,
                   p.last_name_enc,
                   a.nurse_id,
                   a.technician_id,
                   e.order_number
            FROM partial_payment_exceptions ppe
            JOIN invoices i ON i.invoice_id = ppe.invoice_id
            LEFT JOIN users requester ON requester.user_id = ppe.requested_by
            LEFT JOIN patients p ON p.patient_id = ppe.patient_id
            LEFT JOIN appointments a ON a.appointment_id = ppe.appointment_id
            LEFT JOIN examinations e ON e.exam_id = ppe.exam_id
            WHERE ppe.exception_id = $1
            FOR UPDATE
        `, [req.params.id]);

        if (!existing.rows.length) {
            throw new AppError('Partial payment exception request not found', 404);
        }

        const request = withPatientName(existing.rows[0]);
        if (request.status !== 'Pending') {
            throw new AppError('This partial payment exception has already been reviewed', 409);
        }
        if (req.user.role !== 'Developer' && request.requested_by === getUserId(req)) {
            throw new AppError('Requester cannot approve their own partial payment exception', 403);
        }

        const result = await client.query(`
            UPDATE partial_payment_exceptions
            SET status = $1::varchar(20),
                reviewed_by = $2,
                reviewed_at = NOW(),
                review_notes = $3,
                expires_at = CASE
                    WHEN $1::varchar(20) = 'Approved' THEN COALESCE($4::timestamptz, expires_at, NOW() + INTERVAL '24 hours')
                    ELSE expires_at
                END
            WHERE exception_id = $5
            RETURNING *
        `, [
            req.body.status,
            getUserId(req),
            req.body.reviewNotes,
            req.body.expiresAt || null,
            req.params.id
        ]);

        await client.query('COMMIT');
        res.json(result.rows[0]);

        const variables = getExceptionVariables(request, req.body.status, req.body.reviewNotes);
        const notificationBase = {
            priority: 'Warning',
            entityType: 'PartialPaymentException',
            entityId: request.exception_id,
            variables,
        };

        if (request.requested_by && request.requested_by_role) {
            triggerEvent(db, 'PartialPaymentException', {
                ...notificationBase,
                staffId: request.requested_by,
                staffRole: request.requested_by_role,
                occurrenceKey: `partial-payment-exception:${request.exception_id}:${req.body.status}:requester`,
            }).catch(() => {});
        }

        if (req.body.status === 'Approved') {
            const targetStage = request.metadata?.targetStage;
            const destinationRole = targetStage === 'Prep Pending'
                ? 'Nurse'
                : ['Ready for Exam', 'In Exam'].includes(targetStage)
                    ? 'Technician'
                    : null;
            const destinationUserId = destinationRole === 'Nurse'
                ? request.nurse_id
                : destinationRole === 'Technician'
                    ? request.technician_id
                    : null;

            if (destinationRole && String(destinationUserId || '') !== String(request.requested_by || '')) {
                const destinationPayload = {
                    ...notificationBase,
                    occurrenceKey: `partial-payment-exception:${request.exception_id}:approved:${destinationRole.toLowerCase()}`,
                };
                if (destinationUserId) {
                    triggerEvent(db, 'PartialPaymentException', {
                        ...destinationPayload,
                        staffId: destinationUserId,
                        staffRole: destinationRole,
                    }).catch(() => {});
                } else {
                    triggerEventForRole(db, 'PartialPaymentException', destinationRole, destinationPayload).catch(() => {});
                }
            }
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

module.exports = {
    getPartialPaymentExceptions,
    requestPartialPaymentException,
    reviewPartialPaymentException
};
