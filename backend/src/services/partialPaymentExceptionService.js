const { AppError } = require('../middleware/errorHandler');

const RESTRICTED_PARTIAL_PAYMENT_TRANSACTIONS = Object.freeze({
    ClinicalQueueTransition: 'ClinicalQueueTransition'
});

const normalizeMoney = (value) => Number(Number(value || 0).toFixed(2));

const getInvoicePaymentPosition = async (db, invoiceId) => {
    const result = await db.query(`
        WITH totals AS (
            SELECT i.invoice_id,
                   i.invoice_number,
                   i.invoice_status,
                   i.patient_id,
                   i.appointment_id,
                   i.exam_id,
                   i.patient_payable_amount,
                   COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'Completed'), 0) AS paid_amount,
                   COALESCE((SELECT SUM(r.amount) FROM refunds r
                             WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0) AS refunded_amount,
                   COALESCE((SELECT SUM(cn.patient_amount) FROM credit_notes cn
                             WHERE cn.invoice_id = i.invoice_id AND cn.reversed_at IS NULL), 0) AS credited_amount
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.invoice_id
            WHERE i.invoice_id = $1
            GROUP BY i.invoice_id
        )
        SELECT *,
               GREATEST(paid_amount - refunded_amount, 0) AS net_paid_amount,
               GREATEST(patient_payable_amount - credited_amount - paid_amount + refunded_amount, 0) AS balance_amount
        FROM totals
    `, [invoiceId]);

    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
        ...row,
        paid_amount: normalizeMoney(row.paid_amount),
        refunded_amount: normalizeMoney(row.refunded_amount),
        credited_amount: normalizeMoney(row.credited_amount),
        net_paid_amount: normalizeMoney(row.net_paid_amount),
        balance_amount: normalizeMoney(row.balance_amount)
    };
};

const getApprovedPartialPaymentException = async (db, invoiceId, transactionType) => {
    const result = await db.query(`
        SELECT *
        FROM partial_payment_exceptions
        WHERE invoice_id = $1
          AND transaction_type = $2
          AND status = 'Approved'
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY reviewed_at DESC NULLS LAST, requested_at DESC
        LIMIT 1
    `, [invoiceId, transactionType]);

    return result.rows[0] || null;
};

const assertInvoiceTransactionAllowed = async (db, {
    invoiceId,
    transactionType,
    transactionLabel = 'this transaction'
}) => {
    if (!Object.values(RESTRICTED_PARTIAL_PAYMENT_TRANSACTIONS).includes(transactionType)) {
        throw new AppError('Unsupported partial payment restricted transaction', 500);
    }

    const position = await getInvoicePaymentPosition(db, invoiceId);
    if (!position || position.invoice_status === 'Voided') {
        throw new AppError('Invoice is unavailable for payment validation', 409);
    }

    if (position.balance_amount <= 0.005) {
        return { allowed: true, position, exception: null };
    }

    if (position.net_paid_amount <= 0.005) {
        const error = new AppError(`Payment must be collected before ${transactionLabel}`, 409);
        error.details = {
            code: 'PAYMENT_REQUIRED',
            invoiceId,
            transactionType,
            balanceAmount: position.balance_amount
        };
        throw error;
    }

    const exception = await getApprovedPartialPaymentException(db, invoiceId, transactionType);
    if (exception) {
        return { allowed: true, position, exception };
    }

    const error = new AppError(`Partial payment exception approval is required before ${transactionLabel}`, 409);
    error.details = {
        code: 'PARTIAL_PAYMENT_EXCEPTION_REQUIRED',
        invoiceId,
        transactionType,
        invoiceNumber: position.invoice_number,
        netPaidAmount: position.net_paid_amount,
        balanceAmount: position.balance_amount
    };
    throw error;
};

const assertInvoiceFullyPaid = async (db, {
    invoiceId,
    transactionType = 'FinalDelivery',
    transactionLabel = 'final delivery'
}) => {
    const position = await getInvoicePaymentPosition(db, invoiceId);
    if (!position || position.invoice_status === 'Voided') {
        throw new AppError('Invoice is unavailable for payment validation', 409);
    }

    if (position.balance_amount <= 0.005) {
        return { allowed: true, position };
    }

    const error = new AppError(`Remaining balance must be paid before ${transactionLabel}`, 409);
    error.details = {
        code: 'FINAL_DELIVERY_BALANCE_REQUIRED',
        invoiceId,
        transactionType,
        invoiceNumber: position.invoice_number,
        netPaidAmount: position.net_paid_amount,
        balanceAmount: position.balance_amount
    };
    throw error;
};

module.exports = {
    RESTRICTED_PARTIAL_PAYMENT_TRANSACTIONS,
    assertInvoiceTransactionAllowed,
    assertInvoiceFullyPaid,
    getApprovedPartialPaymentException,
    getInvoicePaymentPosition
};
