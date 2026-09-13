const crypto = require('node:crypto');
const { AppError } = require('../middleware/errorHandler');
const {
    calculateInvoiceTotals,
    invoiceDiscountComponents,
    moneyNumber,
    postJournalBatch
} = require('./financialPostingService');

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

module.exports = {
    requireDiscountPermission,
    legacyStatus,
    invoiceJournalEntries,
    invoiceAdjustmentEntries,
    withInvoiceCommission,
    mapInputItem,
    getDefaultInvoiceSource,
    resolveInvoiceInsurancePolicy,
    getOpenShiftId,
    updateInvoicePaymentStatus,
    recalculateInvoiceAfterItemChange
};
