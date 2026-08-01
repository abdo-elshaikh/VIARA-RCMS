const crypto = require('node:crypto');
const Decimal = require('decimal.js');
const { AppError } = require('../middleware/errorHandler');

const DEFAULT_BRANCH_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_CURRENCY = 'EGP';
// Fallback commission rate applied to referring doctors that have no
// commission_percentage configured. Centralized here so reporting, payout
// balance checks, and the journal backfill all agree on the same default.
const DEFAULT_COMMISSION_PERCENTAGE = 10;

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const decimal = (value) => {
    try {
        return new Decimal(value ?? 0);
    } catch {
        return new Decimal(0);
    }
};

const moneyDecimal = (value) => decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const moneyNumber = (value) => moneyDecimal(value).toNumber();
const moneyString = (value) => moneyDecimal(value).toFixed(2);

const normalizeBusinessDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') {
        const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
        if (isoDate) return isoDate[1];
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new AppError('Invalid financial business date', 400);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const calculateInvoiceTotals = (
    items,
    fixedDiscountAmount = 0,
    discountPercentage = 0,
    taxRate = 0,
    insuranceCoveredAmount = 0
) => {
    const subtotal = moneyDecimal(items.reduce(
        (sum, item) => sum.plus(decimal(item.totalAmount)),
        new Decimal(0)
    ));
    const percentage = decimal(discountPercentage).clamp(0, 100);
    const requestedFixed = moneyDecimal(fixedDiscountAmount).clamp(0, subtotal);
    const percentageDiscount = moneyDecimal(subtotal.mul(percentage).div(100));
    const fixedDiscount = Decimal.min(requestedFixed, Decimal.max(0, subtotal.minus(percentageDiscount)));
    const discount = moneyDecimal(Decimal.min(subtotal, fixedDiscount.plus(percentageDiscount)));
    const taxable = Decimal.max(0, subtotal.minus(discount));
    const tax = moneyDecimal(taxable.mul(decimal(taxRate).clamp(0, 100)).div(100));
    const total = moneyDecimal(taxable.plus(tax));
    const insurance = moneyDecimal(Decimal.min(total, moneyDecimal(insuranceCoveredAmount).clamp(0, total)));
    const patientPayable = moneyDecimal(Decimal.max(0, total.minus(insurance)));

    return {
        subtotal: subtotal.toNumber(),
        fixedDiscount: moneyNumber(fixedDiscount),
        percentageDiscount: moneyNumber(percentageDiscount),
        discount: moneyNumber(discount),
        tax: tax.toNumber(),
        total: total.toNumber(),
        insurance: insurance.toNumber(),
        patientPayable: patientPayable.toNumber()
    };
};

const invoiceDiscountComponents = (invoice) => {
    const subtotal = moneyDecimal(invoice.subtotal_amount);
    const percentage = decimal(invoice.discount_percentage).clamp(0, 100);
    const calculatedPercentage = moneyDecimal(subtotal.mul(percentage).div(100));
    const percentageDiscount = invoice.percentage_discount_amount == null
        ? calculatedPercentage
        : moneyDecimal(invoice.percentage_discount_amount);
    const fixedDiscount = invoice.fixed_discount_amount == null
        ? Decimal.max(0, moneyDecimal(invoice.discount_amount).minus(percentageDiscount))
        : moneyDecimal(invoice.fixed_discount_amount);

    return {
        fixedDiscount: moneyNumber(fixedDiscount),
        percentageDiscount: moneyNumber(percentageDiscount)
    };
};

const requestFingerprint = (payload) => crypto
    .createHash('sha256')
    .update(JSON.stringify(payload || {}))
    .digest('hex');

const lockFinancialBusinessDate = async (
    client,
    { businessDate = null, branchId = DEFAULT_BRANCH_ID } = {}
) => {
    const normalizedBusinessDate = normalizeBusinessDate(businessDate);
    const dateResult = await client.query(
        'SELECT COALESCE($1::date, CURRENT_DATE)::text AS business_date',
        [normalizedBusinessDate]
    );
    const resolvedDate = dateResult.rows[0].business_date;
    await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`financial-period:${branchId}:${resolvedDate}`]
    );

    const locked = await client.query(`
        SELECT 1
        FROM financial_periods
        WHERE branch_id = $1
          AND status = 'Finalized'
          AND $2::date BETWEEN start_date AND end_date
        UNION ALL
        SELECT 1
        FROM financial_closures
        WHERE closure_date = $2::date AND status = 'Finalized'
        LIMIT 1
    `, [branchId, resolvedDate]);
    if (locked.rows.length) {
        throw new AppError(`Financial period ${resolvedDate} is finalized and cannot be changed`, 409);
    }

    return { businessDate: resolvedDate, branchId };
};

const issueRefundCreditNote = async (client, { refund, invoice, userId }) => {
    const existing = await client.query('SELECT * FROM credit_notes WHERE refund_id = $1', [refund.refund_id]);
    if (existing.rows.length) return existing.rows[0];

    const gross = moneyDecimal(refund.amount);
    const invoiceTotal = moneyDecimal(invoice.total_amount);
    const invoiceTax = moneyDecimal(invoice.tax_amount);
    const priorTaxResult = await client.query(`
        SELECT COALESCE(SUM(tax_amount), 0) AS tax_amount
        FROM credit_notes
        WHERE invoice_id = $1 AND reversed_at IS NULL
    `, [invoice.invoice_id]);
    const remainingTax = Decimal.max(0, invoiceTax.minus(moneyDecimal(priorTaxResult.rows[0]?.tax_amount)));
    const proportionalTax = invoiceTotal.gt(0)
        ? moneyDecimal(gross.mul(invoiceTax).div(invoiceTotal))
        : new Decimal(0);
    const tax = Decimal.min(gross, remainingTax, proportionalTax);
    const net = moneyDecimal(gross.minus(tax));

    const result = await client.query(`
        INSERT INTO credit_notes (
            invoice_id, refund_id, gross_amount, net_amount, tax_amount,
            patient_amount, insurance_amount, reason, business_date,
            branch_id, currency_code, issued_by
        )
        VALUES ($1, $2, $3, $4, $5, $3, 0, $6, $7, $8, $9, $10)
        RETURNING *
    `, [
        invoice.invoice_id,
        refund.refund_id,
        gross.toFixed(2),
        net.toFixed(2),
        moneyString(tax),
        refund.reason,
        refund.business_date,
        refund.branch_id || invoice.branch_id || DEFAULT_BRANCH_ID,
        refund.currency_code || invoice.currency_code || DEFAULT_CURRENCY,
        userId
    ]);
    return result.rows[0];
};

const recordClaimReceipt = async (client, {
    claim,
    amount,
    cumulativeAmount,
    userId,
    referenceNumber,
    idempotencyKey
}) => {
    const receiptAmount = moneyDecimal(amount);
    if (receiptAmount.lte(0)) return null;

    const lockedDate = await lockFinancialBusinessDate(client, {
        branchId: claim.branch_id || DEFAULT_BRANCH_ID
    });
    if (idempotencyKey) {
        const replay = await client.query(
            'SELECT * FROM claim_receipts WHERE idempotency_key = $1 FOR UPDATE',
            [idempotencyKey]
        );
        if (replay.rows.length) {
            if (replay.rows[0].claim_id !== claim.claim_id
                || moneyString(replay.rows[0].cumulative_amount) !== moneyString(cumulativeAmount)) {
                throw new AppError('Idempotency key was already used for a different claim receipt', 409);
            }
            return replay.rows[0];
        }
    }
    const result = await client.query(`
        INSERT INTO claim_receipts (
            claim_id, invoice_id, amount, business_date, branch_id,
            currency_code, reference_number, cumulative_amount, received_by, idempotency_key
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (claim_id, cumulative_amount) DO UPDATE
        SET cumulative_amount = EXCLUDED.cumulative_amount
        RETURNING *
    `, [
        claim.claim_id,
        claim.invoice_id,
        receiptAmount.toFixed(2),
        lockedDate.businessDate,
        claim.branch_id || DEFAULT_BRANCH_ID,
        claim.currency_code || DEFAULT_CURRENCY,
        referenceNumber || claim.claim_reference_number || null,
        moneyString(cumulativeAmount),
        userId,
        idempotencyKey || null
    ]);
    return result.rows[0];
};

const postJournalBatch = async (client, {
    sourceType,
    sourceId,
    businessDate,
    branchId = DEFAULT_BRANCH_ID,
    currencyCode = DEFAULT_CURRENCY,
    description,
    userId,
    entries
}) => {
    const debit = entries.reduce((sum, entry) => sum.plus(decimal(entry.debit)), new Decimal(0));
    const credit = entries.reduce((sum, entry) => sum.plus(decimal(entry.credit)), new Decimal(0));
    if (!moneyDecimal(debit).equals(moneyDecimal(credit))) {
        throw new AppError(`Unbalanced journal batch: debit ${debit.toFixed(2)} does not equal credit ${credit.toFixed(2)}`, 500);
    }

    const existing = await client.query(
        'SELECT batch_id FROM journal_batches WHERE source_type = $1 AND source_id = $2',
        [sourceType, sourceId]
    );
    if (existing.rows.length) return existing.rows[0];

    const batch = await client.query(`
        INSERT INTO journal_batches (
            source_type, source_id, business_date, branch_id,
            currency_code, description, posted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `, [sourceType, sourceId, businessDate, branchId, currencyCode, description || null, userId]);

    for (const entry of entries) {
        await client.query(`
            INSERT INTO journal_entries (
                batch_id, account_code, account_name, debit, credit,
                patient_id, doctor_id, payer_id, modality_id, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            batch.rows[0].batch_id,
            entry.accountCode,
            entry.accountName,
            moneyString(entry.debit),
            moneyString(entry.credit),
            entry.patientId || null,
            entry.doctorId || null,
            entry.payerId || null,
            entry.modalityId || null,
            JSON.stringify(entry.metadata || {})
        ]);
    }
    return batch.rows[0];
};

module.exports = {
    DEFAULT_BRANCH_ID,
    DEFAULT_CURRENCY,
    DEFAULT_COMMISSION_PERCENTAGE,
    calculateInvoiceTotals,
    invoiceDiscountComponents,
    issueRefundCreditNote,
    lockFinancialBusinessDate,
    moneyDecimal,
    moneyNumber,
    moneyString,
    normalizeBusinessDate,
    postJournalBatch,
    recordClaimReceipt,
    requestFingerprint
};
