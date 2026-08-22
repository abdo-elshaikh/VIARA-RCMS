const crypto = require('node:crypto');
const { AppError } = require('../middleware/errorHandler');
const { triggerEvent, triggerEventForRole } = require('../services/notificationJobService');
const { logAction } = require('../services/auditService');
const { resolveDocumentIdentity } = require('../services/documentIdentityService');
const settingsService = require('../services/settingsService');
const { decrypt, hash } = require('../utils/crypto');
const { permissionCache, refreshPermissionCache } = require('../middleware/rbacMiddleware');
const { validateEnum, VALID_INVOICE_STATUSES, validateSearchQuery } = require('../utils/queryValidator');
const {
    calculateInvoiceTotals,
    invoiceDiscountComponents,
    issueRefundCreditNote,
    lockFinancialBusinessDate,
    moneyNumber,
    postJournalBatch,
    requestFingerprint
} = require('../services/financialPostingService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireDiscountPermission = async (client, user) => {
    if (user.role === 'Developer') return;
    const result = await client.query(`
        SELECT 1
        FROM role_permissions rp
        JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE rp.role_name = $1 AND p.name = 'APPLY_DISCOUNTS'
        LIMIT 1
    `, [user.role]);
    if (result.rows.length === 0) {
        throw new AppError('APPLY_DISCOUNTS permission is required', 403);
    }
};

const legacyStatus = (invoiceStatus) => {
    if (invoiceStatus === 'Paid') return 'Paid';
    if (invoiceStatus === 'Partial') return 'Partial';
    if (invoiceStatus === 'Refunded') return 'Refunded';
    return 'Pending';
};

const invoiceJournalEntries = (values, patientId) => [
    { accountCode: '1100', accountName: 'Patient receivables', debit: values.patientPayable, credit: 0, patientId },
    { accountCode: '1110', accountName: 'Insurance receivables', debit: values.insurance, credit: 0, patientId },
    { accountCode: '4090', accountName: 'Sales discounts', debit: values.discount, credit: 0, patientId },
    { accountCode: '4000', accountName: 'Imaging service revenue', debit: 0, credit: values.subtotal, patientId },
    { accountCode: '2100', accountName: 'Tax payable', debit: 0, credit: values.tax, patientId },
    { accountCode: '5000', accountName: 'Referring doctor commission expense', debit: values.commission, credit: 0, patientId, doctorId: values.doctorId },
    { accountCode: '2200', accountName: 'Commission payable', debit: 0, credit: values.commission, patientId, doctorId: values.doctorId }
].filter(entry => moneyNumber(entry.debit) > 0 || moneyNumber(entry.credit) > 0);

const invoiceAdjustmentEntries = (before, after, patientId) => {
    const definitions = [
        ['1100', 'Patient receivables', 'debit', before.patientPayable, after.patientPayable],
        ['1110', 'Insurance receivables', 'debit', before.insurance, after.insurance],
        ['4090', 'Sales discounts', 'debit', before.discount, after.discount],
        ['4000', 'Imaging service revenue', 'credit', before.subtotal, after.subtotal],
        ['2100', 'Tax payable', 'credit', before.tax, after.tax],
        ['5000', 'Referring doctor commission expense', 'debit', before.commission, after.commission],
        ['2200', 'Commission payable', 'credit', before.commission, after.commission]
    ];

    return definitions.flatMap(([accountCode, accountName, normalSide, oldValue, newValue]) => {
        const change = moneyNumber(newValue) - moneyNumber(oldValue);
        if (Math.abs(change) < 0.005) return [];
        const debitEntry = (change > 0 && normalSide === 'debit')
            || (change < 0 && normalSide === 'credit');
        return [{
            accountCode,
            accountName,
            debit: debitEntry ? Math.abs(change) : 0,
            credit: debitEntry ? 0 : Math.abs(change),
            patientId,
            doctorId: after.doctorId || before.doctorId || null
        }];
    });
};

const withInvoiceCommission = async (client, invoiceId, values) => {
    const result = await client.query(`
        SELECT rd.doctor_id, COALESCE(rd.commission_percentage, 10) AS commission_percentage
        FROM invoices i
        JOIN examinations e ON e.exam_id = i.exam_id
        JOIN appointments a ON a.appointment_id = e.appointment_id
        JOIN referring_doctors rd ON rd.doctor_id = a.referring_doctor_id
        WHERE i.invoice_id = $1
    `, [invoiceId]);
    const doctor = result.rows[0];
    return {
        ...values,
        doctorId: doctor?.doctor_id || null,
        commission: doctor
            ? moneyNumber((moneyNumber(values.subtotal) - moneyNumber(values.discount)) * Number(doctor.commission_percentage) / 100)
            : 0
    };
};

/**
 * Rebuild an invoice after its line items change. Inventory consumption and
 * other append-only workflows must use this function instead of incrementing
 * totals directly so discounts, tax, insurance, commission and the ledger stay
 * in sync.
 */
const recalculateInvoiceAfterItemChange = async (client, invoiceId, userId) => {
    const invoiceResult = await client.query(`
        SELECT *
        FROM invoices
        WHERE invoice_id = $1
        FOR UPDATE
    `, [invoiceId]);
    const invoice = invoiceResult.rows[0];
    if (!invoice || invoice.invoice_status === 'Voided') {
        throw new AppError('Active invoice not found', 404);
    }

    const subtotalResult = await client.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS subtotal_amount
        FROM invoice_items
        WHERE invoice_id = $1
    `, [invoiceId]);
    const subtotal = moneyNumber(subtotalResult.rows[0]?.subtotal_amount);
    const existingDiscount = invoiceDiscountComponents({ ...invoice, subtotal_amount: subtotal });
    const recalculated = calculateInvoiceTotals(
        [{ totalAmount: subtotal }],
        existingDiscount.fixedDiscount,
        Number(invoice.discount_percentage ?? 0),
        Number(invoice.tax_rate ?? 0),
        moneyNumber(invoice.insurance_covered_amount)
    );

    const beforePosting = await withInvoiceCommission(client, invoiceId, {
        subtotal: invoice.subtotal_amount,
        discount: invoice.discount_amount,
        tax: invoice.tax_amount,
        insurance: invoice.insurance_covered_amount,
        patientPayable: invoice.patient_payable_amount
    });
    const afterPosting = await withInvoiceCommission(client, invoiceId, recalculated);

    const result = await client.query(`
        UPDATE invoices
        SET subtotal_amount = $1,
            discount_amount = $2,
            fixed_discount_amount = $3,
            percentage_discount_amount = $4,
            tax_amount = $5,
            total_amount = $6,
            insurance_covered_amount = $7,
            patient_payable_amount = $8
        WHERE invoice_id = $9
        RETURNING *
    `, [
        recalculated.subtotal,
        recalculated.discount,
        recalculated.fixedDiscount,
        recalculated.percentageDiscount,
        recalculated.tax,
        recalculated.total,
        recalculated.insurance,
        recalculated.patientPayable,
        invoiceId
    ]);

    await postJournalBatch(client, {
        sourceType: 'Invoice',
        sourceId: invoiceId,
        businessDate: invoice.business_date || invoice.generated_at,
        branchId: invoice.branch_id,
        currencyCode: invoice.currency_code,
        description: `Invoice ${invoice.invoice_number}`,
        userId,
        entries: invoiceJournalEntries(beforePosting, invoice.patient_id)
    });
    const adjustmentEntries = invoiceAdjustmentEntries(beforePosting, afterPosting, invoice.patient_id);
    if (adjustmentEntries.length) {
        await postJournalBatch(client, {
            sourceType: `InvoiceAdjustment:${crypto.randomUUID().slice(0, 8)}`,
            sourceId: invoiceId,
            businessDate: invoice.business_date || invoice.generated_at,
            branchId: invoice.branch_id,
            currencyCode: invoice.currency_code,
            description: `Line item adjustment ${invoice.invoice_number}`,
            userId,
            entries: adjustmentEntries
        });
    }

    await updateInvoicePaymentStatus(client, invoiceId);
    return result.rows[0];
};

const mapInputItem = (item) => {
    const quantity = Number(item.quantity || 1);
    const unitPrice = moneyNumber(item.unitPrice ?? item.unit_price);
    const discountAmount = moneyNumber(item.discountAmount ?? item.discount_amount);
    const taxAmount = moneyNumber(item.taxAmount ?? item.tax_amount);
    const storedTotal = item.total_amount;
    const totalAmount = storedTotal == null
        ? moneyNumber(Math.max(0, quantity * unitPrice - discountAmount + taxAmount))
        : moneyNumber(storedTotal);

    return {
        ...item,
        quantity,
        unitPrice,
        discountAmount,
        taxAmount,
        totalAmount,
        examId: item.examId ?? item.exam_id,
        examTypeId: item.examTypeId ?? item.exam_type_id
    };
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
})[character]);

const formatMoney = (value) => moneyNumber(value).toFixed(2);

const parseJSONSafe = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const lineBreaks = (value = '') => escapeHtml(value).replace(/\n/g, '<br>');

const normalizeInvoiceCenterSettings = (settings = {}, invoice = {}) => {
    const printSettings = parseJSONSafe(settings.print_settings || settings['center.print_settings']);
    const identity = resolveDocumentIdentity(settings, invoice);
    return {
        centerName: identity.centerName,
        branchName: identity.branchName,
        logoUrl: identity.logoUrl,
        phone: identity.phone,
        email: identity.email,
        address: identity.address,
        hotline: identity.hotline,
        website: identity.website,
        taxId: identity.taxNumber,
        commercialRegistration: identity.commercialRegistration,
        medicalLicense: identity.medicalLicense,
        contactPerson: settings.contact_person || settings['center.contact_person'] || '',
        otherDetails: settings.other_details || settings['center.other_details'] || '',
        invoiceTerms: printSettings.invoiceTerms || '',
        themeColor: /^#[0-9a-f]{6}$/i.test(printSettings.themeColor || '') ? printSettings.themeColor : identity.primaryColor,
        fontFamily: printSettings.fontFamily || 'Inter',
        headerLayout: printSettings.headerLayout || 'classic'
    };
};

const invoiceCenterLines = (center) => [
    center.address,
    center.phone && `Phone: ${center.phone}`,
    center.email && `Email: ${center.email}`,
    center.contactPerson && `Contact: ${center.contactPerson}`,
    center.otherDetails
].filter(Boolean).join('\n');

const roleHasAnyPermission = async (client, role, permissionNames = []) => {
        if (!role || !Array.isArray(permissionNames) || permissionNames.length === 0) return false;
        const result = await client.query(`
                SELECT 1
                FROM role_permissions rp
                JOIN permissions p ON p.permission_id = rp.permission_id
                WHERE rp.role_name = $1
                    AND p.name = ANY($2::text[])
                LIMIT 1
        `, [role, permissionNames]);
        return result.rows.length > 0;
};

const claimFinancialOperation = async (client, req, operationType, resourceId) => {
    const idempotencyKey = req.get('Idempotency-Key');
    if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
        throw new AppError('A valid UUID Idempotency-Key header is required', 400);
    }
        const fingerprint = crypto.createHash('sha256')
        .update(JSON.stringify(req.body || {}))
        .digest('hex');

    const inserted = await client.query(`
        INSERT INTO financial_operation_keys (idempotency_key, actor_id, operation_type, resource_id, request_fingerprint)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (actor_id, operation_type, idempotency_key) DO NOTHING
        RETURNING operation_key_id
    `, [idempotencyKey, req.user.user_id, operationType, resourceId, fingerprint]);
    if (inserted.rows.length) return { id: inserted.rows[0].operation_key_id, replay: null };

    const existing = await client.query(`
        SELECT operation_key_id, resource_id, request_fingerprint, response_status, response_body
        FROM financial_operation_keys
        WHERE actor_id = $1 AND operation_type = $2 AND idempotency_key = $3
        FOR UPDATE
    `, [req.user.user_id, operationType, idempotencyKey]);
    if (!existing.rows.length || existing.rows[0].resource_id !== resourceId) {
        throw new AppError('Idempotency key was already used for a different resource', 409);
    }
    if (existing.rows[0].request_fingerprint !== fingerprint) {
        throw new AppError('Idempotency key was already used with a different request', 409);
    }
    if (!existing.rows[0].response_body) throw new AppError('The original operation is still being processed', 409);
    return { id: existing.rows[0].operation_key_id, replay: existing.rows[0] };
};

const completeFinancialOperation = (client, operationId, status, body) => client.query(`
    UPDATE financial_operation_keys SET response_status = $1, response_body = $2 WHERE operation_key_id = $3
`, [status, JSON.stringify(body), operationId]);

const getDefaultInvoiceSource = async (client, { appointmentId, examId, patientId }) => {
    if (!appointmentId && !examId) {
        if (!patientId) throw new AppError('Patient is required', 400);
        return {
            patient_id: patientId,
            appointment_id: null,
            exam_id: null,
            items: []
        };
    }

    const result = await client.query(`
        SELECT a.appointment_id, a.patient_id, a.payment_amount, e.exam_id,
               et.type_id as exam_type_id, et.name as exam_type_name, et.price
        FROM appointments a
        LEFT JOIN examinations e ON e.appointment_id = a.appointment_id
        LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
        WHERE ($1::uuid IS NOT NULL AND a.appointment_id = $1::uuid)
           OR ($2::uuid IS NOT NULL AND e.exam_id = $2::uuid)
        LIMIT 1
    `, [appointmentId || null, examId || null]);

    if (result.rows.length === 0) {
        throw new AppError('Appointment or exam not found', 404);
    }

    const row = result.rows[0];
    const price = Number(row.payment_amount ?? row.price ?? 0);
    const supplyResult = row.exam_id ? await client.query(`
        SELECT sm.item_id,
               i.name,
               i.unit,
               SUM(ABS(sm.quantity_change))::numeric AS quantity,
               COALESCE(MAX(NULLIF(sm.unit_price, 0)), i.unit_price, 0)::numeric AS unit_price,
               COALESCE(SUM(COALESCE(NULLIF(sm.total_amount, 0), ABS(sm.quantity_change) * COALESCE(NULLIF(sm.unit_price, 0), i.unit_price, 0))), 0)::numeric AS total_amount
        FROM stock_movements sm
        JOIN inventory_items i ON i.item_id = sm.item_id
        WHERE sm.reference_type = 'Exam'
          AND sm.reference_id = $1
          AND sm.movement_type = 'Consume'
        GROUP BY sm.item_id, i.name, i.unit, i.unit_price
        ORDER BY i.name ASC
    `, [row.exam_id]) : { rows: [] };

    const supplyItems = supplyResult.rows.map((supply) => ({
        examId: row.exam_id,
        description: `Exam supply: ${supply.name}`,
        quantity: Number(supply.quantity || 0),
        unitPrice: Number(supply.unit_price || 0),
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: Number(supply.total_amount || 0)
    })).filter((item) => item.quantity > 0 && item.totalAmount > 0);

    return {
        patient_id: row.patient_id,
        appointment_id: row.appointment_id,
        exam_id: row.exam_id,
        items: [
            ...(price > 0 ? [{
            examId: row.exam_id,
            examTypeId: row.exam_type_id,
            description: row.exam_type_name || 'Radiology examination',
            quantity: 1,
            unitPrice: price,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: price
            }] : []),
            ...supplyItems
        ]
    };
};

const resolveInvoiceInsurancePolicy = async (client, {
    patientId,
    serviceDate,
    requestedPolicyId = null
}) => {
    const result = await client.query(`
        SELECT pip.policy_id
        FROM patient_insurance_policies pip
        JOIN insurance_providers ip ON ip.provider_id = pip.provider_id
        WHERE pip.patient_id = $1
          AND ($2::uuid IS NULL OR pip.policy_id = $2::uuid)
          AND COALESCE(ip.is_active, true) = true
          AND (pip.valid_from IS NULL OR pip.valid_from <= $3::date)
          AND (pip.valid_to IS NULL OR pip.valid_to >= $3::date)
        ORDER BY (pip.policy_id = $2::uuid) DESC, pip.is_primary DESC, pip.created_at DESC
        LIMIT 1
        FOR UPDATE OF pip
    `, [patientId, requestedPolicyId, serviceDate]);

    if (!result.rows.length) {
        throw new AppError(requestedPolicyId
            ? 'The selected insurance policy is not active for this invoice service date'
            : 'Active insurance policy is required when insurance coverage is greater than zero', 409);
    }
    return result.rows[0].policy_id;
};

const getOpenShiftId = async (client, cashierId, branchId) => {
    const result = await client.query(`
        SELECT shift_id
        FROM cashier_shifts
        WHERE cashier_id = $1 AND branch_id = $2 AND status = 'Open'
        ORDER BY opened_at DESC
        LIMIT 1
        FOR UPDATE
    `, [cashierId, branchId]);

    return result.rows[0]?.shift_id || null;
};

const updateInvoicePaymentStatus = async (client, invoiceId) => {
    await client.query('SELECT invoice_id FROM invoices WHERE invoice_id = $1 FOR UPDATE', [invoiceId]);
    const result = await client.query(`
        WITH totals AS (
            SELECT i.patient_payable_amount,
                   COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'Completed'), 0) as paid_amount,
                   COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0) as refunded_amount,
                   COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c
                             WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL), 0) as credited_amount
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.invoice_id
            WHERE i.invoice_id = $1
            GROUP BY i.invoice_id
        )
        SELECT patient_payable_amount, paid_amount, refunded_amount, credited_amount
        FROM totals
    `, [invoiceId]);

    if (result.rows.length === 0) return null;

    const totals = result.rows[0];
    const netPaid = Number(totals.paid_amount || 0) - Number(totals.refunded_amount || 0);
    const payable = Math.max(0,
        Number(totals.patient_payable_amount || 0) - Number(totals.credited_amount || 0));
    const invoiceStatus = Number(totals.refunded_amount || 0) > 0 && payable <= 0 && netPaid <= 0.005
        ? 'Refunded'
        : payable <= 0
            ? 'Paid'
        : netPaid <= 0
            ? 'Pending'
            : netPaid < payable
                ? 'Partial'
                : 'Paid';

    const update = await client.query(`
        UPDATE invoices
        SET invoice_status = $1,
            status = $2
        WHERE invoice_id = $3
        RETURNING *
    `, [invoiceStatus, legacyStatus(invoiceStatus), invoiceId]);

    return update.rows[0];
};

const createInvoice = (db) => async (req, res, next) => {
    let client;

    try {
        client = await db.connect();
        await client.query('BEGIN');

        const idempotencyKey = req.get('Idempotency-Key');
        if (!idempotencyKey || !UUID_PATTERN.test(idempotencyKey)) {
            throw new AppError('A valid UUID Idempotency-Key header is required', 400);
        }
        const fingerprint = requestFingerprint(req.body);
        await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`create-invoice:${idempotencyKey}`]
        );
        const replay = await client.query(
            'SELECT * FROM invoices WHERE idempotency_key = $1 FOR UPDATE',
            [idempotencyKey]
        );
        if (replay.rows.length) {
            if (replay.rows[0].request_fingerprint !== fingerprint) {
                throw new AppError('Idempotency key was already used with a different request', 409);
            }
            await client.query('COMMIT');
            return res.status(200).json(replay.rows[0]);
        }

        const postingDate = await lockFinancialBusinessDate(client);

        const source = await getDefaultInvoiceSource(client, req.body);
        const items = (req.body.items?.length ? req.body.items.map(mapInputItem) : source.items);

        if (items.length === 0) {
            throw new AppError('At least one invoice item or priced appointment is required', 400);
        }

        const totals = calculateInvoiceTotals(
            items,
            req.body.discountAmount,
            req.body.discountPercentage,
            req.body.taxRate,
            req.body.insuranceCoveredAmount
        );
        const invoicePatientId = req.body.patientId || source.patient_id;
        const insurancePolicyId = totals.insurance > 0
            ? await resolveInvoiceInsurancePolicy(client, {
                patientId: invoicePatientId,
                serviceDate: postingDate.businessDate,
                requestedPolicyId: req.body.insurancePolicyId || null
            })
            : null;

        if (totals.discount > 0) {
            await requireDiscountPermission(client, req.user);
            if (!req.body.discountReason?.trim()) {
                throw new AppError('A discount reason is required', 400);
            }
        }

        if (source.exam_id || source.appointment_id) {
            const existingSource = await client.query(`
                SELECT invoice_id, invoice_number
                FROM invoices
                WHERE invoice_status <> 'Voided'
                  AND (($1::uuid IS NOT NULL AND exam_id = $1::uuid)
                    OR ($2::uuid IS NOT NULL AND appointment_id = $2::uuid))
                LIMIT 1
                FOR UPDATE
            `, [source.exam_id || null, source.appointment_id || null]);
            if (existingSource.rows.length) {
                throw new AppError(`An active invoice already exists for this order (${existingSource.rows[0].invoice_number})`, 409);
            }
        }

        const invoiceResult = await client.query(`
            INSERT INTO invoices (
                appointment_id, exam_id, patient_id, invoice_status, subtotal_amount, total_amount,
                insurance_covered_amount, patient_payable_amount, discount_amount, discount_percentage,
                fixed_discount_amount, percentage_discount_amount,
                discount_reason, discount_approved_by, tax_rate, tax_amount, package_code, package_name,
                due_date, notes, status, business_date, service_date, branch_id, currency_code,
                idempotency_key, request_fingerprint, insurance_policy_id
            )
            VALUES (
                $1, $2, $3, 'Pending', $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'Pending',
                $20, $20, $21, $22, $23, $24, $25
            )
            RETURNING *
        `, [
            source.appointment_id,
            source.exam_id || items[0]?.examId || null,
            invoicePatientId,
            totals.subtotal,
            totals.total,
            totals.insurance,
            totals.patientPayable,
            totals.discount,
            req.body.discountPercentage || 0,
            totals.fixedDiscount,
            totals.percentageDiscount,
            req.body.discountReason || null,
            req.body.discountAmount || req.body.discountPercentage ? req.user.user_id : null,
            req.body.taxRate || 0,
            totals.tax,
            req.body.packageCode || null,
            req.body.packageName || null,
            req.body.dueDate || null,
            req.body.notes || null,
            postingDate.businessDate,
            postingDate.branchId,
            'EGP',
            idempotencyKey,
            fingerprint,
            insurancePolicyId
        ]);

        const invoice = invoiceResult.rows[0];

        for (const item of items) {
            await client.query(`
                INSERT INTO invoice_items (
                    invoice_id, exam_id, exam_type_id, description, quantity, unit_price,
                    discount_amount, tax_amount, total_amount
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                invoice.invoice_id,
                item.examId || null,
                item.examTypeId || null,
                item.description,
                item.quantity,
                item.unitPrice,
                item.discountAmount,
                item.taxAmount,
                item.totalAmount
            ]);
        }


        const invoicePosting = await withInvoiceCommission(client, invoice.invoice_id, totals);
        await postJournalBatch(client, {
            sourceType: 'Invoice',
            sourceId: invoice.invoice_id,
            businessDate: postingDate.businessDate,
            branchId: postingDate.branchId,
            currencyCode: invoice.currency_code,
            description: `Invoice ${invoice.invoice_number}`,
            userId: req.user.user_id,
            entries: invoiceJournalEntries(invoicePosting, invoice.patient_id)
        });

        await logAction(client, {
            userId: req.user.user_id,
            action: totals.discount > 0 ? 'INVOICE_CREATED_WITH_DISCOUNT' : 'INVOICE_CREATED',
            resourceId: invoice.invoice_id,
            resourceTable: 'invoices',
            ipAddress: req.ip,
            details: {
                totalAmount: totals.total,
                patientPayableAmount: totals.patientPayable,
                discountAmount: totals.discount,
                discountReason: totals.discount > 0 ? req.body.discountReason : null
            },
            required: true
        });

        await client.query('COMMIT');

        // Fire PaymentDue notification when patient owes money
        if (invoice.patient_payable_amount > 0) {
            triggerEvent(db, 'PaymentDue', {
                patientId: invoice.patient_id,
                entityType: 'Invoice',
                entityId: invoice.invoice_id,
                channels: ['Email', 'SMS'],
                variables: {
                    invoice_number: invoice.invoice_number || '',
                    amount: `${invoice.patient_payable_amount}`,
                    due_date: invoice.due_date
                        ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'Upon receipt'
                }
            });
        }

        res.status(201).json(invoice);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error.code === '23505' && ['idx_invoices_active_exam_unique', 'idx_invoices_active_appointment_unique'].includes(error.constraint)) {
            return next(new AppError('An active invoice already exists for this order', 409));
        }
        if (error.code === '23505' && error.constraint === 'idx_invoices_idempotency') {
            return next(new AppError('Invoice creation was already submitted', 409));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getInvoices = (db) => async (req, res, next) => {
    try {
        const {
            status, patientId, q, startDate, endDate, appointmentDate,
            openOnly = false, includeMeta = false, sortBy = 'date', sortDirection = 'desc',
            limit = 100, offset = 0
        } = req.query;
        const pageLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 100));
        const pageOffset = Math.max(0, Number.parseInt(offset, 10) || 0);

        validateEnum(status, VALID_INVOICE_STATUSES, 'status');
        validateSearchQuery(q);

        const values = [];
        let param = 1;
        let query = `
            SELECT i.*, p.mrn, p.first_name_enc, p.last_name_enc, a.order_number,
                   COALESCE(e.contrast_required, a.contrast_required, et.contrast_required, false) AS contrast_required,
                   et.name AS exam_type_name,
                   ins.provider_name, ins.policy_number, ins.member_number, ins.plan_name, ins.payer_code,
                   COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status = 'Completed'), 0) as paid_amount,
                   COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0) as refunded_amount,
                   COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL), 0) as credited_amount,
                   GREATEST(
                       i.patient_payable_amount
                       - COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL), 0)
                       - COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status = 'Completed'), 0)
                       + COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0),
                       0
                   ) as balance_amount,
                   COUNT(*) OVER()::integer AS filtered_count
            FROM invoices i
            JOIN patients p ON i.patient_id = p.patient_id
            LEFT JOIN appointments a ON i.appointment_id = a.appointment_id
            LEFT JOIN examinations e ON i.exam_id = e.exam_id OR a.appointment_id = e.appointment_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id OR e.exam_type_id = et.type_id
            LEFT JOIN payments pay ON pay.invoice_id = i.invoice_id
            LEFT JOIN LATERAL (
                SELECT pip.policy_number, pip.member_number, pip.plan_name, ip.name AS provider_name, ip.payer_code
                FROM patient_insurance_policies pip
                JOIN insurance_providers ip ON pip.provider_id = ip.provider_id
                WHERE pip.policy_id = i.insurance_policy_id
                  AND i.insurance_covered_amount > 0
                  AND COALESCE(ip.is_active, true) = true
                  AND (pip.valid_from IS NULL OR pip.valid_from <= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
                  AND (pip.valid_to IS NULL OR pip.valid_to >= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
                ORDER BY pip.is_primary DESC, pip.created_at DESC
                LIMIT 1
            ) ins ON true
            WHERE 1=1
        `;

        if (status) {
            query += ` AND i.invoice_status = $${param++}::varchar`;
            values.push(status);
        }

        if (patientId) {
            query += ` AND i.patient_id = $${param++}::uuid`;
            values.push(patientId);
        }

        if (q) {
            const textSearchParam = `$${param++}`;
            values.push(`%${q}%`);
            const tokens = String(q).trim().split(/\s+/).filter(Boolean).slice(0, 5);
            const nameClauses = tokens.map((token) => {
                const tokenParam = `$${param++}`;
                values.push(hash(token));
                return `(p.first_name_hash = ${tokenParam} OR p.last_name_hash = ${tokenParam})`;
            });
            query += ` AND (
                i.invoice_number ILIKE ${textSearchParam}::text
                OR p.mrn ILIKE ${textSearchParam}::text
                OR a.order_number ILIKE ${textSearchParam}::text
                ${nameClauses.length ? `OR (${nameClauses.join(' AND ')})` : ''}
            )`;
        }

        if (startDate) {
            query += ` AND i.business_date >= $${param++}::date`;
            values.push(startDate);
        }

        if (endDate) {
            query += ` AND i.business_date <= $${param++}::date`;
            values.push(endDate);
        }

        if (appointmentDate) {
            query += ` AND a.start_time::date = $${param++}::date`;
            values.push(appointmentDate);
        }

        query += `
            GROUP BY i.invoice_id, p.mrn, p.first_name_enc, p.last_name_enc, a.order_number, e.contrast_required, a.contrast_required, et.contrast_required, et.name, ins.provider_name, ins.policy_number, ins.member_number, ins.plan_name, ins.payer_code
        `;

        if (openOnly) {
            query += `
                HAVING i.invoice_status <> 'Voided'
                   AND GREATEST(
                       i.patient_payable_amount
                       - COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL), 0)
                       - COALESCE(SUM(pay.amount) FILTER (WHERE pay.payment_status = 'Completed'), 0)
                       + COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0),
                       0
                   ) > 0
            `;
        }

        const sortColumns = {
            number: 'i.invoice_number',
            date: 'i.generated_at',
            total: 'i.patient_payable_amount',
            paid: 'paid_amount',
            balance: 'balance_amount',
            status: 'i.invoice_status'
        };
        const orderColumn = sortColumns[sortBy] || sortColumns.date;
        const orderDirection = sortDirection === 'asc' ? 'ASC' : 'DESC';
        query += `
            ORDER BY ${orderColumn} ${orderDirection}, i.invoice_id ${orderDirection}
            LIMIT $${param++}::int OFFSET $${param}::int
        `;
        values.push(pageLimit, pageOffset);

        const result = await db.query(query, values);
        const items = result.rows.map(({ first_name_enc, last_name_enc, filtered_count, ...invoice }) => ({
            ...invoice,
            patient_name: [decrypt(first_name_enc), decrypt(last_name_enc)].filter(Boolean).join(' ')
        }));
        if (includeMeta) {
            return res.json({
                items,
                meta: {
                    total: Number(result.rows[0]?.filtered_count || 0),
                    limit: pageLimit,
                    offset: pageOffset
                }
            });
        }
        res.json(items);
    } catch (error) {
        next(error);
    }
};

const getInvoiceSummary = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            WITH payment_totals AS (
                SELECT invoice_id,
                       COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Completed'), 0) AS paid_amount
                FROM payments GROUP BY invoice_id
            ), refund_totals AS (
                SELECT invoice_id, COALESCE(SUM(amount) FILTER (WHERE status = 'Processed'), 0) AS refunded_amount
                FROM refunds GROUP BY invoice_id
            ), credit_totals AS (
                SELECT invoice_id, COALESCE(SUM(patient_amount) FILTER (WHERE reversed_at IS NULL), 0) AS credited_amount
                FROM credit_notes GROUP BY invoice_id
            ), positions AS (
                SELECT i.invoice_id, i.invoice_status, i.patient_payable_amount, i.discount_amount,
                       COALESCE(p.paid_amount, 0) AS paid_amount,
                       COALESCE(r.refunded_amount, 0) AS refunded_amount,
                       GREATEST(i.patient_payable_amount - COALESCE(c.credited_amount, 0)
                           - COALESCE(p.paid_amount, 0) + COALESCE(r.refunded_amount, 0), 0) AS balance_amount
                FROM invoices i
                LEFT JOIN payment_totals p ON p.invoice_id = i.invoice_id
                LEFT JOIN refund_totals r ON r.invoice_id = i.invoice_id
                LEFT JOIN credit_totals c ON c.invoice_id = i.invoice_id
            )
            SELECT
                COUNT(*)::integer AS total_count,
                COALESCE(SUM(patient_payable_amount) FILTER (WHERE invoice_status <> 'Voided'), 0) AS gross_billed,
                COALESCE(SUM(GREATEST(paid_amount - refunded_amount, 0)) FILTER (WHERE invoice_status <> 'Voided'), 0) AS collected,
                COALESCE(SUM(balance_amount) FILTER (WHERE invoice_status <> 'Voided'), 0) AS outstanding,
                COALESCE(SUM(discount_amount) FILTER (WHERE invoice_status <> 'Voided'), 0) AS discounts,
                COUNT(*) FILTER (WHERE balance_amount > 0 AND invoice_status <> 'Voided')::integer AS open_count,
                COUNT(*) FILTER (WHERE invoice_status = 'Paid')::integer AS paid_count,
                COUNT(*) FILTER (WHERE invoice_status = 'Partial')::integer AS partial_count,
                COUNT(*) FILTER (WHERE invoice_status = 'Pending')::integer AS pending_count,
                COUNT(*) FILTER (WHERE invoice_status = 'Refunded')::integer AS refunded_count,
                COUNT(*) FILTER (WHERE invoice_status = 'Voided')::integer AS voided_count
            FROM positions
        `);
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getInvoiceById = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const invoiceResult = await db.query(`
            SELECT i.*, p.mrn, p.first_name_enc, p.last_name_enc, a.order_number,
                   COALESCE(e.contrast_required, a.contrast_required, et.contrast_required, false) AS contrast_required,
                   et.name AS exam_type_name,
                   ins.provider_name, ins.policy_number, ins.member_number, ins.plan_name, ins.payer_code,
                   ins.holder_name, ins.valid_from, ins.valid_to, ins.approval_document_url, ins.notes as policy_notes
            FROM invoices i
            JOIN patients p ON i.patient_id = p.patient_id
            LEFT JOIN appointments a ON i.appointment_id = a.appointment_id
            LEFT JOIN examinations e ON i.exam_id = e.exam_id OR a.appointment_id = e.appointment_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id OR e.exam_type_id = et.type_id
            LEFT JOIN LATERAL (
                SELECT pip.*, ip.name AS provider_name, ip.payer_code
                FROM patient_insurance_policies pip
                JOIN insurance_providers ip ON pip.provider_id = ip.provider_id
                WHERE pip.policy_id = i.insurance_policy_id
                  AND i.insurance_covered_amount > 0
                  AND COALESCE(ip.is_active, true) = true
                  AND (pip.valid_from IS NULL OR pip.valid_from <= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
                  AND (pip.valid_to IS NULL OR pip.valid_to >= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
                ORDER BY pip.is_primary DESC, pip.created_at DESC
                LIMIT 1
            ) ins ON true
            WHERE i.invoice_id::text = $1 OR i.invoice_number = $1
        `, [id]);

        if (invoiceResult.rows.length === 0) {
            return next(new AppError('Invoice not found', 404));
        }

        const { first_name_enc, last_name_enc, ...invoice } = invoiceResult.rows[0];
        const [items, payments, refunds, creditNotes] = await Promise.all([
            db.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at', [invoice.invoice_id]),
            db.query('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY transaction_date DESC', [invoice.invoice_id]),
            db.query('SELECT * FROM refunds WHERE invoice_id = $1 ORDER BY created_at DESC', [invoice.invoice_id]),
            db.query('SELECT * FROM credit_notes WHERE invoice_id = $1 AND reversed_at IS NULL ORDER BY issued_at DESC', [invoice.invoice_id])
        ]);

        const paidAmount = payments.rows.filter(payment => payment.payment_status === 'Completed')
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const refundedAmount = refunds.rows.filter(refund => refund.status === 'Processed')
            .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
        const creditedAmount = creditNotes.rows
            .reduce((sum, creditNote) => sum + Number(creditNote.patient_amount || 0), 0);

        res.json({
            ...invoice,
            patient_name: [decrypt(first_name_enc), decrypt(last_name_enc)].filter(Boolean).join(' '),
            paid_amount: paidAmount,
            refunded_amount: refundedAmount,
            credited_amount: creditedAmount,
            balance_amount: Math.max(0, Number(invoice.patient_payable_amount || 0) - creditedAmount - paidAmount + refundedAmount),
            items: items.rows,
            payments: payments.rows,
            refunds: refunds.rows,
            credit_notes: creditNotes.rows
        });
    } catch (error) {
        next(error);
    }
};

const updateInvoice = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query(
            'SELECT * FROM invoices WHERE invoice_id::text = $1 OR invoice_number = $1 FOR UPDATE',
            [id]
        );

        if (existing.rows.length === 0) {
            throw new AppError('Invoice not found', 404);
        }

        const invoice = existing.rows[0];
        await lockFinancialBusinessDate(client, {
            businessDate: invoice.business_date || invoice.generated_at,
            branchId: invoice.branch_id
        });
        const requestedStatus = req.body.invoiceStatus;

        const totalsResult = await client.query(`
            SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'Completed'), 0) AS paid_amount,
                   COALESCE((SELECT SUM(r.amount) FROM refunds r
                             WHERE r.invoice_id = $1 AND r.status = 'Processed'), 0) AS refunded_amount
            FROM payments p
            WHERE p.invoice_id = $1
        `, [invoice.invoice_id]);
        const netPaid = Math.max(0,
            Number(totalsResult.rows[0]?.paid_amount || 0)
            - Number(totalsResult.rows[0]?.refunded_amount || 0));

        const changesDiscount = req.body.discountAmount !== undefined
            || req.body.discountPercentage !== undefined;
        if (changesDiscount) {
            await requireDiscountPermission(client, req.user);
        }
        if (requestedStatus === 'Voided') {
            const canVoid = await roleHasAnyPermission(client, req.user.role, ['VOID_INVOICES']);
            if (!canVoid) throw new AppError('VOID_INVOICES permission is required', 403);
        }
        if (requestedStatus === 'Voided' && netPaid > 0.005) {
            throw new AppError('Refund collected funds before voiding this invoice', 409);
        }

        // #3 — Recalculate financial totals whenever discount/tax/insurance changes
        const subtotal = moneyNumber(invoice.subtotal_amount);
        const existingDiscount = invoiceDiscountComponents(invoice);
        const newFixedDiscount = req.body.discountAmount !== undefined
            ? moneyNumber(req.body.discountAmount)
            : existingDiscount.fixedDiscount;
        const newDiscountPct = req.body.discountPercentage !== undefined
            ? Number(req.body.discountPercentage)
            : Number(invoice.discount_percentage || 0);
        const newTaxRate = req.body.taxRate !== undefined
            ? Number(req.body.taxRate)
            : Number(invoice.tax_rate || 0);
        const newInsurance = req.body.insuranceCoveredAmount !== undefined
            ? moneyNumber(req.body.insuranceCoveredAmount)
            : moneyNumber(invoice.insurance_covered_amount);

        const recalculated = calculateInvoiceTotals(
            [{ totalAmount: subtotal }],
            newFixedDiscount,
            newDiscountPct,
            newTaxRate,
            newInsurance
        );
        let insurancePolicyId = null;
        if (recalculated.insurance > 0) {
            const coverageChanged = req.body.insuranceCoveredAmount !== undefined
                || req.body.insurancePolicyId !== undefined
                || !invoice.insurance_policy_id;
            insurancePolicyId = coverageChanged
                ? await resolveInvoiceInsurancePolicy(client, {
                    patientId: invoice.patient_id,
                    serviceDate: invoice.service_date || invoice.business_date || invoice.generated_at,
                    requestedPolicyId: req.body.insurancePolicyId || invoice.insurance_policy_id || null
                })
                : invoice.insurance_policy_id;
        }

        if (recalculated.patientPayable + 0.005 < netPaid) {
            throw new AppError('Invoice changes cannot reduce the payable amount below net collected funds', 409);
        }

        const invoiceStatus = requestedStatus === 'Voided'
            ? 'Voided'
            : invoice.invoice_status;

        const result = await client.query(`
            UPDATE invoices
            SET invoice_status = $1::varchar(20),
                status = $2,
                insurance_covered_amount = $3,
                discount_amount = $4,
                discount_percentage = $5,
                fixed_discount_amount = $6,
                percentage_discount_amount = $7,
                discount_reason = COALESCE($8, discount_reason),
                tax_rate = $9,
                tax_amount = $10,
                total_amount = $11,
                patient_payable_amount = $12,
                package_code = $13,
                package_name = $14,
                due_date = $15,
                notes = $16,
                void_reason = CASE WHEN $1::varchar(20) = 'Voided' THEN $17 ELSE void_reason END,
                voided_by = CASE WHEN $1::varchar(20) = 'Voided' THEN $18 ELSE voided_by END,
                voided_at = CASE WHEN $1::varchar(20) = 'Voided' AND voided_at IS NULL THEN NOW() ELSE voided_at END,
                insurance_policy_id = $19
            WHERE invoice_id = $20
            RETURNING *
        `, [
            invoiceStatus,
            legacyStatus(invoiceStatus),
            recalculated.insurance,
            recalculated.discount,
            newDiscountPct,
            recalculated.fixedDiscount,
            recalculated.percentageDiscount,
            req.body.discountReason ?? null,
            newTaxRate,
            recalculated.tax,
            recalculated.total,
            recalculated.patientPayable,
            req.body.packageCode ?? invoice.package_code,
            req.body.packageName ?? invoice.package_name,
            req.body.dueDate ?? invoice.due_date,
            req.body.notes ?? invoice.notes,
            req.body.voidReason || null,
            req.user.user_id,
            insurancePolicyId,
            invoice.invoice_id
        ]);

        const beforePosting = await withInvoiceCommission(client, invoice.invoice_id, {
            subtotal: invoice.subtotal_amount,
            discount: invoice.discount_amount,
            tax: invoice.tax_amount,
            insurance: invoice.insurance_covered_amount,
            patientPayable: invoice.patient_payable_amount
        });
        const afterPosting = invoiceStatus === 'Voided'
            ? { ...beforePosting, subtotal: 0, discount: 0, tax: 0, insurance: 0, patientPayable: 0, commission: 0 }
            : await withInvoiceCommission(client, invoice.invoice_id, recalculated);
        await postJournalBatch(client, {
            sourceType: 'Invoice',
            sourceId: invoice.invoice_id,
            businessDate: invoice.business_date || invoice.generated_at,
            branchId: invoice.branch_id,
            currencyCode: invoice.currency_code,
            description: `Invoice ${invoice.invoice_number}`,
            userId: req.user.user_id,
            entries: invoiceJournalEntries(beforePosting, invoice.patient_id)
        });
        const adjustmentEntries = invoiceAdjustmentEntries(beforePosting, afterPosting, invoice.patient_id);
        if (adjustmentEntries.length) {
            await postJournalBatch(client, {
                sourceType: `InvoiceAdjustment:${crypto.randomUUID().slice(0, 8)}`,
                sourceId: invoice.invoice_id,
                businessDate: invoice.business_date || invoice.generated_at,
                branchId: invoice.branch_id,
                currencyCode: invoice.currency_code,
                description: `${invoiceStatus === 'Voided' ? 'Void' : 'Adjustment'} ${invoice.invoice_number}`,
                userId: req.user.user_id,
                entries: adjustmentEntries
            });
        }

        const updatedInvoice = invoiceStatus === 'Voided'
            ? result.rows[0]
            : await updateInvoicePaymentStatus(client, invoice.invoice_id);

        await logAction(client, {
            userId: req.user.user_id,
            action: invoiceStatus === 'Voided' ? 'INVOICE_VOIDED' : 'INVOICE_UPDATED',
            resourceId: invoice.invoice_id,
            resourceTable: 'invoices',
            ipAddress: req.ip,
            details: {
                discountChanged: changesDiscount,
                discountReason: changesDiscount ? req.body.discountReason : null,
                voidReason: invoiceStatus === 'Voided' ? req.body.voidReason : null
            },
            required: true
        });
        await client.query('COMMIT');
        res.json(updatedInvoice);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const collectPayment = (db) => async (req, res, next) => {
    let client;

    try {
        const { id } = req.params;
        const { amount, method, paymentReference, discountAmount = 0, discountReason, verificationChecklist } = req.body;
        const idempotencyKey = req.body?.idempotencyKey || req.get('Idempotency-Key') || null;
        client = await db.connect();
        await client.query('BEGIN');

        const invoiceResult = await client.query('SELECT * FROM invoices WHERE invoice_id::text = $1 OR invoice_number = $1 FOR UPDATE', [id]);
        if (invoiceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Invoice not found', 404));
        }

        let invoice = invoiceResult.rows[0];
        if (invoice.invoice_status === 'Voided') {
            await client.query('ROLLBACK');
            return next(new AppError('Voided invoices cannot be paid', 409));
        }

        const coverageResult = await client.query(`
            SELECT i.insurance_covered_amount, pip.policy_number, pip.member_number
            FROM invoices i
            LEFT JOIN LATERAL (
                SELECT policy_number, member_number
                FROM patient_insurance_policies
                WHERE policy_id = i.insurance_policy_id
                  AND i.insurance_covered_amount > 0
                  AND (valid_from IS NULL OR valid_from <= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
                  AND (valid_to IS NULL OR valid_to >= COALESCE(i.service_date, i.business_date, CURRENT_DATE))
                ORDER BY is_primary DESC, created_at DESC
                LIMIT 1
            ) pip ON true
            WHERE i.invoice_id = $1
        `, [invoice.invoice_id]);
        const coverage = coverageResult.rows[0] || {};
        if (Number(coverage.insurance_covered_amount || 0) > 0) {
            const requiredChecks = ['card', 'referral', 'patient_copay_sign'];
            if (Number(coverage.insurance_covered_amount || 0) > 0) requiredChecks.push('preauth');
            const missingCheck = requiredChecks.find((key) => verificationChecklist?.[key] !== true);
            if (missingCheck) {
                await client.query('ROLLBACK');
                return next(new AppError('Required insurance or contract verification must be completed before collecting payment', 409));
            }
        }

        const operation = await claimFinancialOperation(client, req, 'collect_payment', invoice.invoice_id);
        if (operation.replay) {
            await logAction(client, {
                userId: req.user.user_id,
                action: 'PAYMENT_SERVED_FROM_REPLAY',
                resourceId: invoice.invoice_id,
                resourceTable: 'invoices',
                ipAddress: req.ip,
                details: { idempotencyKey, operationId: operation.id }, required: true
            });
            await client.query('COMMIT');
            return res.status(operation.replay.response_status || 201).json(operation.replay.response_body);
        }

        // Check if examination requires contrast and ensure contrast supply is added before collecting payment
        {
            const contrastCheck = await client.query(`
                SELECT COALESCE(e.contrast_required, a.contrast_required, et.contrast_required, false) AS contrast_required,
                         EXISTS (
                            SELECT 1
                            FROM stock_movements sm
                            JOIN inventory_items inventory_item ON inventory_item.item_id = sm.item_id
                            WHERE sm.reference_type = 'Exam'
                              AND (sm.reference_id = $2 OR sm.reference_id = e.exam_id)
                              AND sm.movement_type = 'Consume'
                              AND sm.quantity_change < 0
                              AND inventory_item.is_contrast_agent = true
                        ) AS has_verified_contrast
                FROM invoices i
                LEFT JOIN appointments a ON i.appointment_id = a.appointment_id
                LEFT JOIN examinations e ON i.exam_id = e.exam_id OR a.appointment_id = e.appointment_id
                LEFT JOIN examination_types et ON a.exam_type_id = et.type_id OR e.exam_type_id = et.type_id
                WHERE i.invoice_id = $1
                LIMIT 1
            `, [invoice.invoice_id, invoice.exam_id || null]);

            if (contrastCheck.rows.length > 0 && contrastCheck.rows[0].contrast_required) {
                const hasContrast = contrastCheck.rows[0].has_verified_contrast;
                if (!hasContrast) {
                    await client.query('ROLLBACK');
                    return next(new AppError('هذا الفحص يتطلب صبغة وريدية. يجب تسجيل وإضافة صبغة ومستلزمات الفحص إلى الفاتورة أولاً قبل إتمام التحصيل.', 400));
                }
            }
        }

        const paymentTotalsResult = await client.query(`
            SELECT
                COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'Completed'), 0) AS paid_amount,
                COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.invoice_id = $1 AND r.status = 'Processed'), 0) AS refunded_amount,
                COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c WHERE c.invoice_id = $1 AND c.reversed_at IS NULL), 0) AS credited_amount
            FROM payments p
            WHERE p.invoice_id = $1
        `, [invoice.invoice_id]);
        const paidAmount = moneyNumber(paymentTotalsResult.rows[0]?.paid_amount);
        const refundedAmount = moneyNumber(paymentTotalsResult.rows[0]?.refunded_amount);
        const creditedAmount = moneyNumber(paymentTotalsResult.rows[0]?.credited_amount);
        const netPaid = moneyNumber(Math.max(0, paidAmount - refundedAmount));
        const appliedDiscount = moneyNumber(discountAmount);

        if (appliedDiscount > 0) {
            await lockFinancialBusinessDate(client, {
                businessDate: invoice.business_date || invoice.generated_at,
                branchId: invoice.branch_id
            });
            // #6 — If role not in cache, fall back to a fresh DB query before making the decision
            if (!permissionCache.has(req.user.role)) await refreshPermissionCache(db);
            let canApplyDiscount = req.user.role === 'Developer'
                || permissionCache.get(req.user.role)?.has('APPLY_DISCOUNTS');
            if (!canApplyDiscount) {
                // One-time DB verification as a safety net
                const permCheck = await client.query(`
                    SELECT 1 FROM role_permissions rp
                    JOIN permissions p ON rp.permission_id = p.permission_id
                    WHERE rp.role_name = $1 AND p.name = 'APPLY_DISCOUNTS'
                    LIMIT 1
                `, [req.user.role]);
                canApplyDiscount = permCheck.rows.length > 0;
            }
            if (!canApplyDiscount) {
                await client.query('ROLLBACK');
                return next(new AppError('APPLY_DISCOUNTS permission is required', 403));
            }

            const existingDiscount = invoiceDiscountComponents(invoice);
            // #12 — Use the capped value for storage so discount_amount never exceeds subtotal
            const recalculated = calculateInvoiceTotals(
                [{ totalAmount: invoice.subtotal_amount }],
                moneyNumber(existingDiscount.fixedDiscount + appliedDiscount),
                invoice.discount_percentage,
                invoice.tax_rate,
                invoice.insurance_covered_amount
            );
            const totalDiscount = recalculated.discount;

            if (recalculated.patientPayable + 0.005 < netPaid) {
                await client.query('ROLLBACK');
                return next(new AppError('Discount cannot reduce the invoice below the amount already collected', 409));
            }

            const beforeDiscountPosting = await withInvoiceCommission(client, invoice.invoice_id, {
                subtotal: invoice.subtotal_amount,
                discount: invoice.discount_amount,
                tax: invoice.tax_amount,
                insurance: invoice.insurance_covered_amount,
                patientPayable: invoice.patient_payable_amount
            });
            const afterDiscountPosting = await withInvoiceCommission(client, invoice.invoice_id, recalculated);
            const discountResult = await client.query(`
                UPDATE invoices
                SET discount_amount = $1,
                    fixed_discount_amount = $2,
                    percentage_discount_amount = $3,
                    discount_reason = $4,
                    discount_approved_by = $5,
                    tax_amount = $6,
                    total_amount = $7,
                    insurance_covered_amount = $8,
                    patient_payable_amount = $9
                WHERE invoice_id = $10
                RETURNING *
            `, [
                totalDiscount,    // #12 — store the capped value, not the raw accumulator
                recalculated.fixedDiscount,
                recalculated.percentageDiscount,
                discountReason,
                req.user.user_id,
                recalculated.tax,
                recalculated.total,
                recalculated.insurance,
                recalculated.patientPayable,
                invoice.invoice_id
            ]);
            invoice = discountResult.rows[0];
            await postJournalBatch(client, {
                sourceType: 'Invoice',
                sourceId: invoice.invoice_id,
                businessDate: invoice.business_date || invoice.generated_at,
                branchId: invoice.branch_id,
                currencyCode: invoice.currency_code,
                description: `Invoice ${invoice.invoice_number}`,
                userId: req.user.user_id,
                entries: invoiceJournalEntries(beforeDiscountPosting, invoice.patient_id)
            });
            const adjustmentEntries = invoiceAdjustmentEntries(
                beforeDiscountPosting,
                afterDiscountPosting,
                invoice.patient_id
            );
            if (adjustmentEntries.length) {
                await postJournalBatch(client, {
                    sourceType: `InvoiceAdjustment:${crypto.randomUUID().slice(0, 8)}`,
                    sourceId: invoice.invoice_id,
                    businessDate: invoice.business_date || invoice.generated_at,
                    branchId: invoice.branch_id,
                    currencyCode: invoice.currency_code,
                    description: `Payment-time discount ${invoice.invoice_number}`,
                    userId: req.user.user_id,
                    entries: adjustmentEntries
                });
            }
        }

        const outstandingBalance = moneyNumber(Math.max(
            0,
            moneyNumber(invoice.patient_payable_amount) - creditedAmount - netPaid
        ));
        const paymentAmount = moneyNumber(amount);
        if (paymentAmount > outstandingBalance + 0.005) {
            await client.query('ROLLBACK');
            return next(new AppError('Payment amount exceeds the outstanding invoice balance', 409));
        }

        const shiftId = await getOpenShiftId(client, req.user.user_id, invoice.branch_id);
        if (paymentAmount > 0 && !shiftId) {
            await client.query('ROLLBACK');
            return next(new AppError('Open a cashier shift before collecting payments', 409));
        }
        const paymentDate = paymentAmount > 0
            ? await lockFinancialBusinessDate(client, { branchId: invoice.branch_id })
            : null;
        const paymentResult = paymentAmount > 0
            ? await client.query(`
                INSERT INTO payments (
                    invoice_id, amount, method, processed_by, cashier_shift_id, payment_reference,
                    business_date, branch_id, currency_code
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                invoice.invoice_id,
                paymentAmount,
                method,
                req.user.user_id,
                shiftId,
                paymentReference || null,
                paymentDate.businessDate,
                paymentDate.branchId,
                invoice.currency_code || 'EGP'
            ])
            : { rows: [null] };

        if (paymentResult.rows[0]) {
            const cashAccount = method === 'Cash'
                ? ['1000', 'Cash on hand']
                : ['1010', `${method} clearing`];
            await postJournalBatch(client, {
                sourceType: 'Payment',
                sourceId: paymentResult.rows[0].payment_id,
                businessDate: paymentDate.businessDate,
                branchId: paymentDate.branchId,
                currencyCode: invoice.currency_code,
                description: `Payment for ${invoice.invoice_number}`,
                userId: req.user.user_id,
                entries: [
                    { accountCode: cashAccount[0], accountName: cashAccount[1], debit: paymentAmount, credit: 0, patientId: invoice.patient_id },
                    { accountCode: '1100', accountName: 'Patient receivables', debit: 0, credit: paymentAmount, patientId: invoice.patient_id }
                ]
            });
        }

        const updatedInvoice = await updateInvoicePaymentStatus(client, invoice.invoice_id);
        const reportReadyResult = updatedInvoice?.invoice_status === 'Paid'
            ? await client.query(`
                WITH ready AS (
                    SELECT e.exam_id, e.appointment_id, e.patient_id, e.order_number, p.mrn
                    FROM examinations e
                    JOIN patients p ON p.patient_id = e.patient_id
                    WHERE (e.exam_id = $1 OR e.appointment_id = $2)
                      AND (e.report_status IN ('Finalized', 'Amended') OR e.report_locked = TRUE OR e.status = 'Finalized')
                    LIMIT 1
                ), inserted AS (
                    INSERT INTO result_deliveries (
                        exam_id, appointment_id, patient_id, delivery_method,
                        recipient_name, delivery_status, delivered_by, notes
                    )
                    SELECT exam_id, appointment_id, patient_id, 'Patient Portal',
                           mrn, 'Delivered', $3, 'Released to patient portal after invoice settlement'
                    FROM ready
                    WHERE NOT EXISTS (
                        SELECT 1 FROM result_deliveries rd
                        WHERE rd.exam_id = ready.exam_id
                          AND rd.delivery_method = 'Patient Portal'
                          AND rd.delivery_status = 'Delivered'
                    )
                    RETURNING exam_id, patient_id
                )
                SELECT ready.exam_id, ready.patient_id, ready.order_number,
                       EXISTS (SELECT 1 FROM inserted) AS newly_released
                FROM ready
            `, [invoice.exam_id, invoice.appointment_id, req.user.user_id])
            : { rows: [] };
        const responseBody = { payment: paymentResult.rows[0], invoice: updatedInvoice };
        await completeFinancialOperation(client, operation.id, 201, responseBody);
        await logAction(client, {
            userId: req.user.user_id,
            action: appliedDiscount > 0 ? 'PAYMENT_COLLECTED_WITH_DISCOUNT' : 'PAYMENT_COLLECTED',
            resourceId: invoice.invoice_id,
            resourceTable: 'invoices',
            ipAddress: req.ip,
            details: {
                amount: paymentAmount,
                method,
                paymentReference: paymentReference || null,
                discountAmount: appliedDiscount,
                discountReason: appliedDiscount > 0 ? discountReason : null,
                invoiceStatus: updatedInvoice?.invoice_status,
                verificationChecklist: verificationChecklist || null,
                verificationAttestedBy: req.user.user_id,
                verificationAttestedAt: new Date().toISOString()
            },
            required: true
        });
        await client.query('COMMIT');

        const releasedReport = reportReadyResult.rows[0];
        if (releasedReport?.newly_released) {
            triggerEvent(db, 'ReportReady', {
                patientId: releasedReport.patient_id,
                entityType: 'Exam',
                entityId: releasedReport.exam_id,
                channels: ['Email', 'SMS'],
                variables: { order_number: releasedReport.order_number || '' }
            }).catch(() => {});
        }

        res.status(201).json(responseBody);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const refundInvoice = (db) => async (req, res, next) => {
    let client;

    try {
        const { id } = req.params;
        const { paymentId, amount, method = 'Cash', reason } = req.body;
        const idempotencyKey = req.get('Idempotency-Key');
        client = await db.connect();
        await client.query('BEGIN');

        const invoiceResult = await client.query('SELECT * FROM invoices WHERE invoice_id::text = $1 OR invoice_number = $1 FOR UPDATE', [id]);
        if (invoiceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Invoice not found', 404));
        }

        const invoice = invoiceResult.rows[0];
        if (invoice.invoice_status === 'Voided') {
            await client.query('ROLLBACK');
            return next(new AppError('Voided invoices cannot be refunded', 409));
        }

        const operation = await claimFinancialOperation(client, req, 'request_refund', invoice.invoice_id);
        if (operation.replay) {
            await logAction(client, {
                userId: req.user.user_id,
                action: 'REFUND_SERVED_FROM_REPLAY',
                resourceId: invoice.invoice_id,
                resourceTable: 'invoices',
                ipAddress: req.ip,
                details: { idempotencyKey, operationId: operation.id }, required: true
            });
            await client.query('COMMIT');
            return res.status(operation.replay.response_status || 201).json(operation.replay.response_body);
        }
        const canRequestRefund = await roleHasAnyPermission(client, req.user.role, ['REQUEST_REFUNDS', 'ISSUE_REFUNDS']);
        if (!canRequestRefund) {
            await client.query('ROLLBACK');
            return next(new AppError('REQUEST_REFUNDS permission is required', 403));
        }

        const totalsResult = await client.query(`
            SELECT
                COALESCE((SELECT SUM(p.amount) FROM payments p
                          WHERE p.invoice_id = $1 AND p.payment_status = 'Completed'), 0) AS paid_amount,
                COALESCE((SELECT SUM(r.amount) FROM refunds r
                          WHERE r.invoice_id = $1 AND r.status <> 'Rejected'), 0) AS reserved_refund_amount
        `, [invoice.invoice_id]);
        const paidAmount = Number(totalsResult.rows[0]?.paid_amount || 0);
        const reservedRefundAmount = Number(totalsResult.rows[0]?.reserved_refund_amount || 0);
        if (Number(amount) > paidAmount - reservedRefundAmount + 0.005) {
            await client.query('ROLLBACK');
            return next(new AppError('Refund amount exceeds the unrefunded collected amount', 409));
        }

        if (paymentId) {
            const paymentResult = await client.query(`
                SELECT * FROM payments
                WHERE payment_id = $1 AND invoice_id = $2
                FOR UPDATE
            `, [paymentId, invoice.invoice_id]);
            const payment = paymentResult.rows[0];
            if (!payment || payment.payment_status !== 'Completed') {
                await client.query('ROLLBACK');
                return next(new AppError('Completed payment not found for this invoice', 404));
            }

            const paymentRefundsResult = await client.query(`
                SELECT COALESCE(SUM(amount), 0) AS reserved_amount
                FROM refunds
                WHERE payment_id = $1 AND status <> 'Rejected'
            `, [paymentId]);
            const paymentReserved = Number(paymentRefundsResult.rows[0]?.reserved_amount || 0);
            if (Number(amount) > Number(payment.amount) - paymentReserved + 0.005) {
                await client.query('ROLLBACK');
                return next(new AppError('Refund amount exceeds the remaining amount for this payment', 409));
            }
        }

        const refundStatus = 'Pending';
        const refundResult = await client.query(`
            INSERT INTO refunds (
                invoice_id, payment_id, amount, method, reason, status,
                requested_by, approved_by, processed_by, cashier_shift_id, processed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::varchar(20), $7, $8, $9, $10,
                    CASE WHEN $6::varchar(20) = 'Processed' THEN NOW() ELSE NULL END)
            RETURNING *
        `, [
            invoice.invoice_id,
            paymentId || null,
            amount,
            method,
            reason,
            refundStatus,
            req.user.user_id,
            null,
            null,
            null
        ]);

        const updatedInvoice = invoice;
        const responseBody = { refund: refundResult.rows[0], invoice: updatedInvoice };
        await completeFinancialOperation(client, operation.id, 201, responseBody);
        await logAction(client, {
            userId: req.user.user_id,
            action: 'REFUND_REQUESTED',
            resourceId: invoice.invoice_id,
            resourceTable: 'invoices',
            ipAddress: req.ip,
            details: {
                refundId: refundResult.rows[0].refund_id,
                paymentId: paymentId || null,
                amount: Number(amount),
                method,
                reason,
                status: refundStatus
            },
            required: true
        });
        await client.query('COMMIT');

        triggerEvent(db, 'RefundRequested', {
            patientId: invoice.patient_id,
            entityType: 'Invoice',
            entityId: invoice.invoice_id,
            channels: ['InApp'],
            priority: 'Normal',
            variables: {
                invoice_number: invoice.invoice_number || '',
                amount,
                payment_method: method,
                payment_date: new Date().toLocaleDateString('en-GB')
            }
        }).catch(() => {});

        triggerEventForRole(db, 'RefundRequested', 'Cashier', {
            priority: 'Normal',
            variables: {
                invoice_number: invoice.invoice_number || '',
                amount,
                payment_method: method
            }
        }).catch(() => {});

        triggerEventForRole(db, 'RefundRequested', 'Accountant', {
            priority: 'Normal',
            variables: {
                invoice_number: invoice.invoice_number || '',
                amount,
                payment_method: method
            }
        }).catch(() => {});

        triggerEventForRole(db, 'RefundRequested', 'Admin', {
            priority: 'Normal',
            variables: {
                invoice_number: invoice.invoice_number || '',
                amount,
                payment_method: method
            }
        }).catch(() => {});

        res.status(201).json(responseBody);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getRefunds = (db) => async (req, res, next) => {
    try {
        const { status, startDate, endDate, limit = 100, offset = 0 } = req.query;
        const pageLimit = Math.min(250, Math.max(1, Number.parseInt(limit, 10) || 100));
        const pageOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
        const canReviewRefunds = await roleHasAnyPermission(db, req.user.role, ['APPROVE_REFUNDS', 'PROCESS_REFUNDS', 'ISSUE_REFUNDS']);
        const scopeToRequester = !canReviewRefunds;

        const values = [];
        let param = 1;
        let where = 'WHERE 1=1';
        if (status) {
            where += ` AND r.status = $${param++}::varchar`;
            values.push(status);
        }
        if (startDate) {
            where += ` AND COALESCE(r.business_date, r.created_at::date) >= $${param++}::date`;
            values.push(startDate);
        }
        if (endDate) {
            where += ` AND COALESCE(r.business_date, r.created_at::date) <= $${param++}::date`;
            values.push(endDate);
        }
        if (scopeToRequester) {
            where += ` AND r.requested_by = $${param++}::uuid`;
            values.push(req.user.user_id);
        }

        const result = await db.query(`
            SELECT r.*, i.invoice_number, i.invoice_status, p.mrn,
                   p.first_name_enc, p.last_name_enc,
                   pay.receipt_number, pay.payment_reference,
                   requester.full_name AS requested_by_name,
                   reviewer.full_name AS reviewed_by_name
            FROM refunds r
            JOIN invoices i ON i.invoice_id = r.invoice_id
            JOIN patients p ON p.patient_id = i.patient_id
            LEFT JOIN payments pay ON pay.payment_id = r.payment_id
            LEFT JOIN users requester ON requester.user_id = r.requested_by
            LEFT JOIN users reviewer ON reviewer.user_id = r.reviewed_by
            ${where}
            ORDER BY CASE WHEN r.status = 'Pending' THEN 0 ELSE 1 END, r.created_at DESC
            LIMIT $${param++}::int OFFSET $${param}::int
        `, [...values, pageLimit, pageOffset]);

        res.json(result.rows.map(({ first_name_enc, last_name_enc, ...refund }) => ({
            ...refund,
            patient_name: [decrypt(first_name_enc), decrypt(last_name_enc)].filter(Boolean).join(' ')
        })));
    } catch (error) {
        next(error);
    }
};

const reviewRefund = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const { status, reason } = req.body;
        client = await db.connect();
        await client.query('BEGIN');

        const refundResult = await client.query('SELECT * FROM refunds WHERE refund_id = $1 FOR UPDATE', [id]);
        if (refundResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Refund request not found', 404));
        }
        const refund = refundResult.rows[0];
        const approving = refund.status === 'Pending' && ['Approved', 'Rejected'].includes(status);
        const processing = refund.status === 'Approved' && status === 'Processed';
        if (!approving && !processing) throw new AppError(`Refund cannot move from ${refund.status} to ${status}`, 409);

        if (approving) {
            const canApprove = await roleHasAnyPermission(client, req.user.role, ['APPROVE_REFUNDS', 'ISSUE_REFUNDS']);
            if (!canApprove) throw new AppError('APPROVE_REFUNDS permission is required', 403);
            if (req.user.role !== 'Developer' && refund.requested_by === req.user.user_id) {
                throw new AppError('Requester cannot approve or reject their own refund request', 403);
            }
        }
        if (processing) {
            const canProcess = await roleHasAnyPermission(client, req.user.role, ['PROCESS_REFUNDS', 'ISSUE_REFUNDS']);
            if (!canProcess) throw new AppError('PROCESS_REFUNDS permission is required', 403);
        }

        const invoiceResult = await client.query('SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE', [refund.invoice_id]);
        const invoice = invoiceResult.rows[0];
        if (!invoice || invoice.invoice_status === 'Voided') {
            await client.query('ROLLBACK');
            return next(new AppError('The invoice is unavailable for refund processing', 409));
        }

        if (processing) {
            const totalsResult = await client.query(`
                SELECT
                    COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = $1 AND payment_status = 'Completed'), 0) AS paid_amount,
                    COALESCE((SELECT SUM(amount) FROM refunds WHERE invoice_id = $1 AND status = 'Processed'), 0) AS processed_amount
            `, [refund.invoice_id]);
            const available = Number(totalsResult.rows[0]?.paid_amount || 0)
                - Number(totalsResult.rows[0]?.processed_amount || 0);
            if (Number(refund.amount) > available + 0.005) {
                await client.query('ROLLBACK');
                return next(new AppError('Collected funds are no longer sufficient for this refund', 409));
            }

            if (refund.payment_id) {
                const paymentResult = await client.query('SELECT * FROM payments WHERE payment_id = $1 AND invoice_id = $2 FOR UPDATE', [refund.payment_id, refund.invoice_id]);
                const payment = paymentResult.rows[0];
                const paymentRefunds = await client.query(`
                    SELECT COALESCE(SUM(amount), 0) AS processed_amount
                    FROM refunds WHERE payment_id = $1 AND status = 'Processed'
                `, [refund.payment_id]);
                if (!payment || payment.payment_status !== 'Completed'
                    || Number(refund.amount) > Number(payment.amount) - Number(paymentRefunds.rows[0]?.processed_amount || 0) + 0.005) {
                    await client.query('ROLLBACK');
                    return next(new AppError('The original payment is no longer refundable', 409));
                }
            }
        }

        const shiftId = processing ? await getOpenShiftId(client, req.user.user_id, invoice.branch_id) : null;
        if (processing && !shiftId) {
            await client.query('ROLLBACK');
            return next(new AppError('Open a cashier shift before processing refunds', 409));
        }
        const processingDate = processing
            ? await lockFinancialBusinessDate(client, { branchId: invoice.branch_id })
            : null;

        const updateResult = await client.query(`
            UPDATE refunds
            SET status = $1::varchar(20),
                reviewed_by = CASE WHEN $1::varchar(20) IN ('Approved', 'Rejected') THEN $2 ELSE reviewed_by END,
                review_reason = CASE WHEN $1::varchar(20) IN ('Approved', 'Rejected') THEN $3 ELSE review_reason END,
                reviewed_at = CASE WHEN $1::varchar(20) IN ('Approved', 'Rejected') THEN NOW() ELSE reviewed_at END,
                approved_by = CASE WHEN $1::varchar(20) = 'Approved' THEN $2 ELSE approved_by END,
                processed_by = CASE WHEN $1::varchar(20) = 'Processed' THEN $2 ELSE processed_by END,
                cashier_shift_id = CASE WHEN $1::varchar(20) = 'Processed' THEN $5 ELSE cashier_shift_id END,
                processed_at = CASE WHEN $1::varchar(20) = 'Processed' THEN NOW() ELSE processed_at END,
                business_date = CASE WHEN $1::varchar(20) = 'Processed' THEN $6::date ELSE business_date END,
                branch_id = CASE WHEN $1::varchar(20) = 'Processed' THEN $7::uuid ELSE branch_id END,
                currency_code = CASE WHEN $1::varchar(20) = 'Processed' THEN $8 ELSE currency_code END
            WHERE refund_id = $4
            RETURNING *
        `, [
            status,
            req.user.user_id,
            reason,
            refund.refund_id,
            shiftId,
            processingDate?.businessDate || null,
            processingDate?.branchId || invoice.branch_id,
            invoice.currency_code || 'EGP'
        ]);

        if (processing) {
            const processedRefund = updateResult.rows[0];
            const creditNote = await issueRefundCreditNote(client, {
                refund: processedRefund,
                invoice,
                userId: req.user.user_id
            });
            const cashAccount = processedRefund.method === 'Cash'
                ? ['1000', 'Cash on hand']
                : ['1010', `${processedRefund.method} clearing`];
            await postJournalBatch(client, {
                sourceType: 'Refund',
                sourceId: processedRefund.refund_id,
                businessDate: processingDate.businessDate,
                branchId: processingDate.branchId,
                currencyCode: invoice.currency_code,
                description: `Refund for ${invoice.invoice_number}`,
                userId: req.user.user_id,
                entries: [
                    { accountCode: '4050', accountName: 'Sales returns', debit: creditNote.net_amount, credit: 0, patientId: invoice.patient_id },
                    ...(moneyNumber(creditNote.tax_amount) > 0 ? [{ accountCode: '2100', accountName: 'Tax payable', debit: creditNote.tax_amount, credit: 0, patientId: invoice.patient_id }] : []),
                    { accountCode: cashAccount[0], accountName: cashAccount[1], debit: 0, credit: processedRefund.amount, patientId: invoice.patient_id }
                ]
            });
        }

        const updatedInvoice = processing
            ? await updateInvoicePaymentStatus(client, refund.invoice_id)
            : invoice;
        await logAction(client, {
            userId: req.user.user_id,
            action: status === 'Approved' ? 'REFUND_APPROVED' : (status === 'Processed' ? 'REFUND_PROCESSED' : 'REFUND_REJECTED'),
            resourceId: refund.invoice_id,
            resourceTable: 'invoices',
            ipAddress: req.ip,
            details: { refundId: refund.refund_id, amount: Number(refund.amount), reason, status },
            required: true
        });
        await client.query('COMMIT');

        if (status === 'Processed') {
            triggerEvent(db, 'RefundProcessed', {
                patientId: invoice.patient_id,
                entityType: 'Invoice',
                entityId: invoice.invoice_id,
                channels: ['InApp', 'Email'],
                priority: 'Normal',
                variables: {
                    invoice_number: invoice.invoice_number || '',
                    amount: refund.amount,
                    reason: reason || ''
                }
            }).catch(() => {});

            triggerEventForRole(db, 'RefundProcessed', 'Cashier', {
                priority: 'Normal',
                variables: {
                    invoice_number: invoice.invoice_number || '',
                    amount: refund.amount,
                    reason: reason || ''
                }
            }).catch(() => {});

            triggerEventForRole(db, 'RefundProcessed', 'Accountant', {
                priority: 'Normal',
                variables: {
                    invoice_number: invoice.invoice_number || '',
                    amount: refund.amount,
                    reason: reason || ''
                }
            }).catch(() => {});

            triggerEventForRole(db, 'RefundProcessed', 'Admin', {
                priority: 'Normal',
                variables: {
                    invoice_number: invoice.invoice_number || '',
                    amount: refund.amount,
                    reason: reason || ''
                }
            }).catch(() => {});
        }

        res.json({ refund: updateResult.rows[0], invoice: updatedInvoice });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getInvoicePdf = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const invoiceReq = { params: req.params };
        let payload;
        await getInvoiceById(db)(invoiceReq, { json: (data) => { payload = data; } }, next);
        if (!payload) return;

        const center = normalizeInvoiceCenterSettings(await settingsService.getAll(), payload);
        const facilityName = [center.centerName, center.branchName].filter(Boolean).join(' - ');
        const logoText = String(center.centerName || 'Center').trim().slice(0, 4).toUpperCase();
        const fontStack = center.fontFamily === 'Outfit'
            ? 'Outfit, Arial, "Noto Sans Arabic", sans-serif'
            : center.fontFamily === 'Space Mono'
                ? '"Space Mono", Consolas, monospace'
                : center.fontFamily === 'Arial'
                    ? 'Arial, "Noto Sans Arabic", sans-serif'
                    : 'Inter, Arial, "Noto Sans Arabic", sans-serif';
        const centerLines = invoiceCenterLines(center);
        const lang = req.query.lang || 'both';
        const t = {
            title: lang === 'ar' ? 'فاتورة' : (lang === 'en' ? 'Invoice' : 'Invoice / فاتورة'),
            invoice: lang === 'ar' ? 'رقم الفاتورة' : (lang === 'en' ? 'Invoice' : 'Invoice / رقم الفاتورة'),
            mrn: lang === 'ar' ? 'رقم الملف' : (lang === 'en' ? 'MRN' : 'MRN / رقم الملف'),
            status: lang === 'ar' ? 'الحالة' : (lang === 'en' ? 'Status' : 'Status / الحالة'),
            desc: lang === 'ar' ? 'الوصف' : (lang === 'en' ? 'Description' : 'Description / الوصف'),
            qty: lang === 'ar' ? 'الكمية' : (lang === 'en' ? 'Qty' : 'Qty / الكمية'),
            unit: lang === 'ar' ? 'سعر الوحدة' : (lang === 'en' ? 'Unit' : 'Unit / سعر الوحدة'),
            total: lang === 'ar' ? 'المجموع' : (lang === 'en' ? 'Total' : 'Total / المجموع'),
            grandTotal: lang === 'ar' ? 'الإجمالي' : (lang === 'en' ? 'Total' : 'Total / الإجمالي'),
            payable: lang === 'ar' ? 'المطلوب من المريض' : (lang === 'en' ? 'Patient payable' : 'Patient payable / المطلوب من المريض')
        };
        const dir = lang === 'ar' ? 'rtl' : 'ltr';
        const label = (english, arabic) => lang === 'ar' ? arabic : (lang === 'en' ? english : `${english} / ${arabic}`);
        const receipt = {
            patient: label('Patient', 'المريض'),
            date: label('Date', 'التاريخ'),
            subtotal: label('Subtotal', 'الإجمالي قبل الخصم'),
            discount: label('Discount', 'الخصم'),
            discountReason: label('Discount reason', 'سبب الخصم'),
            tax: label('Tax', 'الضريبة'),
            insurance: label('Insurance coverage', 'تغطية التأمين'),
            paid: label('Paid', 'المدفوع'),
            balance: label('Balance due', 'الرصيد المستحق'),
            payments: label('Payment history', 'سجل الدفعات'),
            method: label('Method', 'الطريقة'),
            reference: label('Reference', 'المرجع'),
            noPayments: label('No payments recorded', 'لا توجد دفعات مسجلة')
        };

        const isInsuranceCase = Number(payload.insurance_covered_amount || 0) > 0 || Boolean(payload.provider_name);
        const caseClassification = !isInsuranceCase
            ? label('Self-Pay / Private', 'حساب خاص (نقدي)')
            : String(payload.provider_name || '').toLowerCase().includes('نقابة') || String(payload.provider_name || '').toLowerCase().includes('شركة') || String(payload.provider_name || '').toLowerCase().includes('contract')
                ? label(`Corporate Contract (${payload.provider_name})`, `تعاقد جهة / نقابة (${payload.provider_name})`)
                : label(`Health Insurance (${payload.provider_name || 'Insurance'})`, `تأمين صحي (${payload.provider_name || 'تأمين'})`);

        const html = `
            <!doctype html>
            <html dir="${dir}" lang="${lang === 'both' ? 'en' : lang}">
            <head><meta charset="utf-8"><title>${escapeHtml(payload.invoice_number)}</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');@page{margin:18mm}*{box-sizing:border-box}body{font-family:${fontStack};margin:0;color:#0f172a;font-size:13px}.header{display:flex;justify-content:space-between;gap:20px;padding-bottom:20px;border-bottom:3px solid ${center.themeColor}}.brand-block{display:flex;align-items:flex-start;gap:14px;min-width:0}.logo{max-width:92px;max-height:56px;object-fit:contain}.mark{display:grid;width:54px;height:54px;place-items:center;border-radius:10px;background:${center.themeColor};color:white;font-weight:800;letter-spacing:.04em}.brand{color:${center.themeColor};margin:0;font-size:20px}.doc-title{margin:4px 0 0;color:#0f172a;font-size:13px;font-weight:800}.meta{margin:4px 0;color:#475569}.center-lines{white-space:pre-wrap;line-height:1.45}.patient{margin:20px 0;padding:14px 16px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}.section-title{margin:24px 0 8px;font-size:15px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e2e8f0;padding:9px;text-align:start}th{background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase}.right{text-align:end}.totals{width:min(100%,390px);margin:18px 0 0 auto}.totals td{padding:6px 8px}.grand td{border-top:2px solid #0f172a;font-weight:800;font-size:15px}.balance td{color:#b45309;font-weight:800}.reason,.terms{margin-top:10px;padding:10px;border-inline-start:3px solid ${center.themeColor};background:#f8fafc;color:#334155}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #e2e8f0;color:#64748b;font-size:10px}@media print{.no-print{display:none}}</style></head>
            <body>
                <header class="header"><div class="brand-block">${center.logoUrl ? `<img class="logo" src="${escapeHtml(center.logoUrl)}" alt="">` : `<div class="mark">${escapeHtml(logoText)}</div>`}<div><h1 class="brand">${escapeHtml(facilityName || center.centerName)}</h1><p class="doc-title">${t.title}</p>${centerLines ? `<p class="meta center-lines">${lineBreaks(centerLines)}</p>` : ''}${center.taxId ? `<p class="meta"><strong>Tax ID:</strong> ${escapeHtml(center.taxId)}</p>` : ''}</div></div><div><p class="meta"><strong>${t.invoice}:</strong> ${escapeHtml(payload.invoice_number)}</p><p class="meta"><strong>${receipt.date}:</strong> ${escapeHtml(new Date(payload.generated_at || payload.created_at).toLocaleString())}</p><p class="meta"><strong>${t.status}:</strong> ${escapeHtml(payload.invoice_status)}</p></div></header>
                <div class="patient">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div>
                            <strong>${receipt.patient}:</strong> ${escapeHtml(payload.patient_name || '')}<br>
                            <strong>${t.mrn}:</strong> ${escapeHtml(payload.mrn || '')}
                        </div>
                        <div style="text-align:end;">
                            <strong>${label('Case Type', 'نوع الحالة')}:</strong> <span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#e2e8f0;font-weight:700;">${caseClassification}</span><br>
                            ${payload.policy_number ? `<strong>${label('Policy #', 'رقم الوثيقة')}:</strong> ${escapeHtml(payload.policy_number)}<br>` : ''}
                            ${payload.member_number ? `<strong>${label('Card #', 'رقم الكارنيه')}:</strong> ${escapeHtml(payload.member_number)}` : ''}
                        </div>
                    </div>
                </div>
                <table><thead><tr><th>${t.desc}</th><th class="right">${t.qty}</th><th class="right">${t.unit}</th><th class="right">${t.total}</th></tr></thead><tbody>
                    ${payload.items.map(item => `<tr><td>${escapeHtml(item.description)}</td><td class="right">${escapeHtml(item.quantity)}</td><td class="right">${formatMoney(item.unit_price)}</td><td class="right">${formatMoney(item.total_amount)}</td></tr>`).join('')}
                </tbody></table>
                <table class="totals"><tbody><tr><td>${receipt.subtotal}</td><td class="right">EGP ${formatMoney(payload.subtotal_amount)}</td></tr><tr><td>${receipt.discount}</td><td class="right">- EGP ${formatMoney(payload.discount_amount)}</td></tr><tr><td>${receipt.tax}</td><td class="right">EGP ${formatMoney(payload.tax_amount)}</td></tr><tr><td>${t.grandTotal}</td><td class="right">EGP ${formatMoney(payload.total_amount)}</td></tr><tr><td>${receipt.insurance}</td><td class="right">- EGP ${formatMoney(payload.insurance_covered_amount)}</td></tr><tr class="grand"><td>${t.payable}</td><td class="right">EGP ${formatMoney(payload.patient_payable_amount)}</td></tr><tr><td>${receipt.paid}</td><td class="right">EGP ${formatMoney(payload.paid_amount)}</td></tr><tr class="balance"><td>${receipt.balance}</td><td class="right">EGP ${formatMoney(payload.balance_amount)}</td></tr></tbody></table>
                ${payload.discount_reason ? `<div class="reason"><strong>${receipt.discountReason}:</strong> ${escapeHtml(payload.discount_reason)}</div>` : ''}
                ${center.invoiceTerms ? `<div class="terms">${lineBreaks(center.invoiceTerms)}</div>` : ''}
                <h2 class="section-title">${receipt.payments}</h2>
                ${payload.payments.length ? `<table><thead><tr><th>${receipt.date}</th><th>${receipt.method}</th><th>${receipt.reference}</th><th class="right">${t.total}</th></tr></thead><tbody>${payload.payments.map(payment => `<tr><td>${escapeHtml(new Date(payment.transaction_date).toLocaleString())}</td><td>${escapeHtml(payment.method)}</td><td>${escapeHtml(payment.payment_reference || '-')}</td><td class="right">EGP ${formatMoney(payment.amount)}</td></tr>`).join('')}</tbody></table>` : `<p class="meta">${receipt.noPayments}</p>`}
                <p class="footer">${escapeHtml(facilityName || center.centerName)} - ${escapeHtml(payload.invoice_number)}</p>
                <script>window.print()</script>
            </body></html>
        `;

        await logAction(db, {
            userId: req.user?.user_id,
            action: 'INVOICE_PRINT',
            resourceId: id,
            resourceTable: 'invoices',
            ipAddress: req.ip,
            details: { invoiceNumber: payload.invoice_number }
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createInvoice,
    getInvoices,
    getInvoiceSummary,
    getInvoiceById,
    updateInvoice,
    collectPayment,
    refundInvoice,
    getRefunds,
    reviewRefund,
    getInvoicePdf,
    updateInvoicePaymentStatus,
    recalculateInvoiceAfterItemChange
};
