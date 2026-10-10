const { getRequestQuery } = require('../utils/requestQuery');
const { z } = require('zod');
const crypto = require('node:crypto');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { validateEnum, validateUUID, VALID_FINANCE_STATUSES } = require('../utils/queryValidator');
const {
    createExpenseCategorySchema, updateExpenseCategorySchema,
    createExpenseSchema, updateExpenseSchema, payCommissionSchema,
    createClosureSchema, finalizeClosureSchema
} = require('../schemas/financeSchema');
const financialReportService = require('../services/financialReportService');
const {
    DEFAULT_COMMISSION_PERCENTAGE,
    DEFAULT_BRANCH_ID,
    lockFinancialBusinessDate,
    moneyNumber,
    normalizeBusinessDate,
    postJournalBatch
} = require('../services/financialPostingService');

const assertPeriodOpen = (client, date, branchId = DEFAULT_BRANCH_ID) => lockFinancialBusinessDate(
    client,
    { businessDate: date, branchId }
);

const expenseJournalEntries = (expense, reverse = false) => {
    const gross = moneyNumber(expense.amount);
    const tax = moneyNumber(expense.tax_amount);
    const net = moneyNumber(gross - tax);
    const settlementAccount = expense.payment_method === 'Cash'
        ? ['1000', 'Cash on hand']
        : ['1010', `${expense.payment_method || 'Expense'} clearing`];
    const entries = [
        { accountCode: '6000', accountName: 'Operating expenses', debit: net, credit: 0 },
        ...(tax > 0 ? [{ accountCode: '1200', accountName: 'Recoverable input tax', debit: tax, credit: 0 }] : []),
        { accountCode: settlementAccount[0], accountName: settlementAccount[1], debit: 0, credit: gross }
    ];
    if (!reverse) return entries;
    return entries.map(entry => ({ ...entry, debit: entry.credit, credit: entry.debit }));
};

const getClosurePreflight = async (client, closureDate, branchId) => {
    const result = await client.query(`
        SELECT
            COALESCE((SELECT COUNT(*)
                      FROM cashier_shifts
                      WHERE status = 'Open'
                        AND branch_id = $2
                        AND business_date <= $1::date), 0)::int AS open_shifts,
            COALESCE((SELECT COUNT(*)
                      FROM cashier_closures cc
                      JOIN cashier_shifts cs ON cs.shift_id = cc.shift_id
                       WHERE cc.review_status = 'Requires Review'
                         AND cc.branch_id = $2
                         AND cs.business_date = $1::date), 0)::int AS unresolved_variances,
            COALESCE((SELECT COUNT(*)
                      FROM refunds
                       WHERE status IN ('Pending', 'Approved')
                         AND branch_id = $2
                         AND business_date <= $1::date), 0)::int AS pending_refunds
    `, [closureDate, branchId]);
    return result.rows[0] || { open_shifts: 0, unresolved_variances: 0, pending_refunds: 0 };
};

const assertClosureReady = async (client, closureDate, branchId) => {
    const preflight = await getClosurePreflight(client, closureDate, branchId);
    const blockers = [
        Number(preflight.open_shifts || 0) > 0 && `${preflight.open_shifts} open cashier shift(s)`,
        Number(preflight.unresolved_variances || 0) > 0 && `${preflight.unresolved_variances} unresolved cashier variance(s)`,
        Number(preflight.pending_refunds || 0) > 0 && `${preflight.pending_refunds} pending or approved refund(s)`,
    ].filter(Boolean);
    if (blockers.length) {
        throw new AppError(`Financial period cannot be finalized: ${blockers.join(', ')}`, 409);
    }
    return preflight;
};

// ─── Expense Categories ──────────────────────────────────────────────────────

const getExpenseCategories = (db) => async (req, res, next) => {
    try {
        const result = await db.query('SELECT * FROM expense_categories ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createExpenseCategory = (db) => async (req, res, next) => {
    try {
        const data = createExpenseCategorySchema.parse(req.body);
        const result = await db.query(`
            INSERT INTO expense_categories (name, description)
            VALUES ($1, $2) RETURNING *
        `, [data.name, data.description]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error.code === '23505') return next(new AppError('Category name already exists.', 409));
        next(error);
    }
};

const updateExpenseCategory = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateExpenseCategorySchema.parse(req.body);
        
        const existing = await db.query('SELECT * FROM expense_categories WHERE category_id = $1', [id]);
        if (existing.rows.length === 0) return next(new AppError('Category not found', 404));
        const curr = existing.rows[0];

        const updated = {
            name: data.name ?? curr.name,
            description: data.description ?? curr.description
        };

        const result = await db.query(`
            UPDATE expense_categories 
            SET name = $1, description = $2 
            WHERE category_id = $3 RETURNING *
        `, [updated.name, updated.description, id]);
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error.code === '23505') return next(new AppError('Category name already exists.', 409));
        next(error);
    }
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

const getExpenses = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, categoryId } = getRequestQuery(req);
        const branchId = getRequestQuery(req).branchId || req.user.branch_id || req.user.branchId || DEFAULT_BRANCH_ID;
        
        validateUUID(categoryId, 'categoryId');
        
        let query = `
            SELECT e.*, c.name as category_name, s.name as supplier_name, u.full_name as logged_by_name
            FROM expenses e
            LEFT JOIN expense_categories c ON e.category_id = c.category_id
            LEFT JOIN suppliers s ON e.supplier_id = s.supplier_id
            LEFT JOIN users u ON e.logged_by = u.user_id
            WHERE e.reversed_at IS NULL
        `;
        const params = [];
        let paramCount = 1;

        if (startDate) {
            query += ` AND e.expense_date >= $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND e.expense_date <= $${paramCount++}`;
            params.push(endDate);
        }
        if (categoryId) {
            query += ` AND e.category_id = $${paramCount++}`;
            params.push(categoryId);
        }
        query += ` AND e.branch_id = $${paramCount++}::uuid`;
        params.push(branchId);

        query += ` ORDER BY e.expense_date DESC, e.created_at DESC`;
        
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createExpense = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createExpenseSchema.parse(req.body);
        const userId = req.user.user_id;
        client = await db.connect();
        await client.query('BEGIN');
        const requestFingerprint = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`expense:${data.idempotencyKey}`]);
        const replay = await client.query(
            'SELECT * FROM expenses WHERE idempotency_key = $1',
            [data.idempotencyKey]
        );
        if (replay.rows.length) {
            if (replay.rows[0].request_fingerprint && replay.rows[0].request_fingerprint !== requestFingerprint) {
                throw new AppError('Idempotency key was already used with a different expense request', 409);
            }
            await client.query('COMMIT');
            return res.json(replay.rows[0]);
        }
        const postingDate = await assertPeriodOpen(client, data.expenseDate, data.branchId || DEFAULT_BRANCH_ID);

        const result = await client.query(`
            INSERT INTO expenses (
                category_id, supplier_id, amount, tax_amount, expense_date, payment_method,
                reference_number, receipt_url, notes, logged_by, branch_id, currency_code,
                idempotency_key, request_fingerprint
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'EGP', $12, $13) RETURNING *
        `, [
            data.categoryId, data.supplierId || null, data.amount, data.taxAmount, data.expenseDate,
            data.paymentMethod, data.referenceNumber, data.receiptUrl, data.notes, userId,
            postingDate.branchId, data.idempotencyKey, requestFingerprint
        ]);
        await postJournalBatch(client, {
            sourceType: 'Expense',
            sourceId: result.rows[0].expense_id,
            businessDate: data.expenseDate,
            branchId: postingDate.branchId,
            currencyCode: result.rows[0].currency_code,
            description: result.rows[0].notes || 'Operating expense',
            userId,
            entries: expenseJournalEntries(result.rows[0])
        });
        await logAction(client, {
            userId, action: 'EXPENSE_CREATED', resourceId: result.rows[0].expense_id,
            resourceTable: 'expenses', ipAddress: req.ip,
            details: { amount: Number(data.amount), expenseDate: data.expenseDate }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateExpense = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = updateExpenseSchema.parse(req.body);

        const keys = Object.keys(data);
        if (keys.length === 0) return res.status(400).json({ message: 'No data provided' });
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query('SELECT * FROM expenses WHERE expense_id = $1 FOR UPDATE', [id]);
        if (existing.rows.length === 0) throw new AppError('Expense not found', 404);
        if (existing.rows[0].reversed_at) throw new AppError('A reversed expense cannot be edited', 409);
        const current = existing.rows[0];
        const changesPostedValue = (data.amount !== undefined && moneyNumber(data.amount) !== moneyNumber(current.amount))
            || (data.taxAmount !== undefined && moneyNumber(data.taxAmount) !== moneyNumber(current.tax_amount))
            || (data.expenseDate !== undefined && data.expenseDate !== normalizeBusinessDate(current.expense_date))
            || (data.paymentMethod !== undefined && data.paymentMethod !== current.payment_method);
        if (changesPostedValue) {
            throw new AppError('Posted expense amounts, dates, and payment methods are immutable; reverse and recreate the expense', 409);
        }
        await assertPeriodOpen(client, current.expense_date, current.branch_id);
        
        const setClauses = keys.map((k, i) => {
            const dbKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            return `${dbKey} = $${i + 1}`;
        });
        const values = Object.values(data);
        values.push(id);
        
        const result = await client.query(`
            UPDATE expenses 
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE expense_id = $${values.length} RETURNING *
        `, values);
        
        await logAction(client, {
            userId: req.user.user_id, action: 'EXPENSE_UPDATED', resourceId: id,
            resourceTable: 'expenses', ipAddress: req.ip,
            details: { changedFields: keys }, required: true
        });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const deleteExpense = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query('SELECT * FROM expenses WHERE expense_id = $1 FOR UPDATE', [id]);
        if (existing.rows.length === 0) throw new AppError('Expense not found', 404);
        if (existing.rows[0].reversed_at) throw new AppError('Expense is already reversed', 409);
        await assertPeriodOpen(client, existing.rows[0].expense_date, existing.rows[0].branch_id);
        const result = await client.query(`
            UPDATE expenses
            SET reversed_at = NOW(), reversed_by = $1, reversal_reason = $2, updated_at = NOW()
            WHERE expense_id = $3
            RETURNING *
        `, [req.user.user_id, req.body.reason, id]);
        await postJournalBatch(client, {
            sourceType: 'ExpenseReversal',
            sourceId: id,
            businessDate: existing.rows[0].expense_date,
            branchId: existing.rows[0].branch_id,
            currencyCode: existing.rows[0].currency_code,
            description: req.body.reason || 'Expense reversal',
            userId: req.user.user_id,
            entries: expenseJournalEntries(existing.rows[0], true)
        });
        await logAction(client, {
            userId: req.user.user_id, action: 'EXPENSE_REVERSED', resourceId: id,
            resourceTable: 'expenses', ipAddress: req.ip,
            details: { amount: Number(existing.rows[0].amount), reason: req.body.reason }, required: true
        });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

// ─── Commission Payables ──────────────────────────────────────────────────────

const getCommissionPayables = (db) => async (req, res, next) => {
    try {
        const branchId = getRequestQuery(req).branchId || req.user.branch_id || req.user.branchId || DEFAULT_BRANCH_ID;
        const result = await db.query(`
            SELECT cp.*, 
                   COALESCE(rd.full_name, u.full_name) as doctor_name
            FROM commission_payables cp
            LEFT JOIN referring_doctors rd ON cp.doctor_id = rd.doctor_id
            LEFT JOIN users u ON cp.doctor_id = u.user_id
            WHERE cp.branch_id = $1
            ORDER BY cp.created_at DESC
        `, [branchId]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const payCommission = (db) => async (req, res, next) => {
    let client;
    try {
        const data = payCommissionSchema.parse(req.body);
        const branchId = data.branchId || DEFAULT_BRANCH_ID;
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [data.doctorId]);

        const existingRequest = await client.query(
            'SELECT * FROM commission_payables WHERE idempotency_key = $1',
            [data.idempotencyKey]
        );
        if (existingRequest.rows.length) {
            const existing = existingRequest.rows[0];
            if (existing.doctor_id !== data.doctorId
                || existing.branch_id !== branchId
                || moneyNumber(existing.amount) !== moneyNumber(data.amount)) {
                throw new AppError('Idempotency key was already used with a different commission payment', 409);
            }
            await client.query('COMMIT');
            return res.json(existing);
        }

        const balance = await client.query(`
            WITH earned AS (
                SELECT COALESCE(SUM(GREATEST(0,
                    i.subtotal_amount - i.discount_amount
                    - COALESCE((SELECT SUM(c.net_amount) FROM credit_notes c
                                WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL), 0)
                ) * (COALESCE(rd.commission_percentage, $2) / 100.0)), 0) AS amount
                FROM examinations e
                JOIN appointments a ON a.appointment_id = e.appointment_id
                JOIN referring_doctors rd ON rd.doctor_id = a.referring_doctor_id
                JOIN invoices i ON i.exam_id = e.exam_id
                WHERE rd.doctor_id = $1
                  AND i.branch_id = $3
                  AND COALESCE(i.invoice_status, i.status::text) <> 'Voided'
            ), paid AS (
                SELECT COALESCE(SUM(amount), 0) AS amount
                FROM commission_payables
                WHERE doctor_id = $1 AND branch_id = $3 AND status = 'Paid'
            )
            SELECT earned.amount - paid.amount AS pending
            FROM earned, paid
        `, [data.doctorId, DEFAULT_COMMISSION_PERCENTAGE, branchId]);
        const pending = Number(balance.rows[0]?.pending || 0);
        if (Number(data.amount) > pending + 0.005) {
            throw new AppError('Commission payment exceeds the verified pending balance', 409);
        }

        const paidDate = data.paidDate || new Date().toISOString();
        const postingDate = await assertPeriodOpen(client, paidDate, branchId);
        const result = await client.query(`
            INSERT INTO commission_payables (
                doctor_id, amount, status, transaction_ref, paid_date, idempotency_key, paid_by,
                business_date, branch_id, currency_code
            )
            VALUES ($1, $2, 'Paid', $3, $4, $5, $6, $7, $8, 'EGP') RETURNING *
        `, [
            data.doctorId, data.amount, data.transactionRef || null, paidDate,
            data.idempotencyKey, req.user.user_id, postingDate.businessDate, postingDate.branchId
        ]);

        await postJournalBatch(client, {
            sourceType: 'CommissionPayment',
            sourceId: result.rows[0].payable_id,
            businessDate: postingDate.businessDate,
            branchId: postingDate.branchId,
            currencyCode: result.rows[0].currency_code,
            description: 'Referring doctor commission payment',
            userId: req.user.user_id,
            entries: [
                { accountCode: '2200', accountName: 'Commission payable', debit: data.amount, credit: 0, doctorId: data.doctorId },
                { accountCode: '1010', accountName: 'Commission payment clearing', debit: 0, credit: data.amount, doctorId: data.doctorId }
            ]
        });

        await logAction(client, {
            userId: req.user.user_id, action: 'COMMISSION_PAID',
            resourceId: result.rows[0].payable_id, resourceTable: 'commission_payables',
            ipAddress: req.ip,
            details: { doctorId: data.doctorId, amount: Number(data.amount), idempotencyKey: data.idempotencyKey },
            required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

// ─── Financial Closures ─────────────────────────────────────────────────────

const getFinancialClosures = (db) => async (req, res, next) => {
    try {
        const { status, startDate, endDate, branchId = DEFAULT_BRANCH_ID } = getRequestQuery(req);
        
        validateEnum(status, VALID_FINANCE_STATUSES, 'status');
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if (startDate && !datePattern.test(startDate)) throw new AppError('Invalid startDate format', 400);
        if (endDate && !datePattern.test(endDate)) throw new AppError('Invalid endDate format', 400);

        let query = `
            SELECT fc.*, u.full_name as closed_by_name,
                   preflight.open_shifts,
                   preflight.unresolved_variances,
                   preflight.pending_refunds
            FROM financial_closures fc
            LEFT JOIN users u ON fc.closed_by = u.user_id
            LEFT JOIN LATERAL (
                SELECT
                    COALESCE((SELECT COUNT(*)
                              FROM cashier_shifts
                              WHERE status = 'Open'
                                AND branch_id = fc.branch_id
                                AND business_date <= fc.closure_date::date), 0)::int AS open_shifts,
                    COALESCE((SELECT COUNT(*)
                              FROM cashier_closures cc
                              JOIN cashier_shifts cs ON cs.shift_id = cc.shift_id
                               WHERE cc.review_status = 'Requires Review'
                                AND cc.branch_id = fc.branch_id
                                AND cs.business_date = fc.closure_date::date), 0)::int AS unresolved_variances,
                    COALESCE((SELECT COUNT(*)
                              FROM refunds
                               WHERE status IN ('Pending', 'Approved')
                                AND branch_id = fc.branch_id
                                AND business_date <= fc.closure_date::date), 0)::int AS pending_refunds
            ) preflight ON TRUE
            WHERE fc.branch_id = $1::uuid
        `;
        const params = [branchId];
        let paramCount = 2;

        if (status) {
            query += ` AND fc.status = $${paramCount++}`;
            params.push(status);
        }
        if (startDate) {
            query += ` AND fc.closure_date >= $${paramCount++}::date`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND fc.closure_date <= $${paramCount++}::date`;
            params.push(endDate);
        }

        query += ` ORDER BY fc.closure_date DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createFinancialClosure = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createClosureSchema.parse(req.body);
        const userId = req.user.user_id;
        client = await db.connect();
        await client.query('BEGIN');
        const postingDate = await assertPeriodOpen(client, data.closureDate, data.branchId || DEFAULT_BRANCH_ID);

        const existing = await client.query(
            'SELECT closure_id FROM financial_closures WHERE closure_date = $1 AND branch_id = $2 FOR UPDATE',
            [data.closureDate, postingDate.branchId]
        );
        if (existing.rows.length > 0) {
            throw new AppError('A financial closure already exists for this date', 409);
        }

        const cash = await financialReportService.getCashSummary(client, {
            startDate: data.closureDate,
            endDate: data.closureDate,
            branchId: postingDate.branchId
        });
        const totalRevenue = cash.net_collections;
        const totalExpenses = moneyNumber(cash.expenses_paid + cash.commissions_paid);
        const netProfit = cash.net_cash_flow;
        const preflight = await getClosurePreflight(client, data.closureDate, postingDate.branchId);

        const result = await client.query(`
            INSERT INTO financial_closures (closure_date, total_revenue, total_expenses, net_profit, status, closed_by, branch_id)
            VALUES ($1, $2, $3, $4, 'Draft', $5, $6) RETURNING *
        `, [data.closureDate, totalRevenue, totalExpenses, netProfit, userId, postingDate.branchId]);

        await client.query('COMMIT');
        res.status(201).json({ ...result.rows[0], preflight });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error.code === '23505') return next(new AppError('Closure for this date already exists', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const finalizeFinancialClosure = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = finalizeClosureSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM financial_closures WHERE closure_id = $1 FOR UPDATE', [id]);
        if (existing.rows.length === 0) throw new AppError('Financial closure not found', 404);
        if (existing.rows[0].status === 'Finalized') throw new AppError('Closure is already finalized', 409);
        const closureDate = normalizeBusinessDate(existing.rows[0].closure_date);
        const postingDate = await assertPeriodOpen(client, closureDate, existing.rows[0].branch_id || DEFAULT_BRANCH_ID);
        await assertClosureReady(client, closureDate, postingDate.branchId);
        const reportOptions = {
            startDate: closureDate,
            endDate: closureDate,
            asOfDate: closureDate,
            branchId: postingDate.branchId
        };
        const [profitAndLoss, tax, aging] = await Promise.all([
            financialReportService.getProfitAndLoss(client, reportOptions),
            financialReportService.getTaxSummary(client, reportOptions),
            financialReportService.getReceivablesAging(client, reportOptions)
        ]);
        const cash = profitAndLoss.cash_summary;
        const revenue = cash.net_collections;
        const expenses = moneyNumber(cash.expenses_paid + cash.commissions_paid);
        const snapshot = {
            basis: 'cash-close-with-accrual-disclosures',
            close_basis: 'cash',
            cash,
            profit_and_loss: profitAndLoss,
            tax,
            receivables: aging
        };
        const countsResult = await client.query(`
            SELECT
                (SELECT COUNT(*) FROM invoices WHERE branch_id = $2 AND business_date = $1::date AND invoice_status <> 'Voided')::int AS invoices,
                (SELECT COUNT(*) FROM payments WHERE branch_id = $2 AND business_date = $1::date AND payment_status = 'Completed')::int AS payments,
                (SELECT COUNT(*) FROM refunds WHERE branch_id = $2 AND business_date = $1::date AND status = 'Processed')::int AS refunds,
                (SELECT COUNT(*) FROM claim_receipts WHERE branch_id = $2 AND business_date = $1::date)::int AS claim_receipts,
                (SELECT COUNT(*) FROM expenses WHERE branch_id = $2 AND expense_date = $1::date AND reversed_at IS NULL)::int AS expenses
        `, [closureDate, postingDate.branchId]);
        const sourceCounts = countsResult.rows[0];
        const checksum = crypto.createHash('sha256')
            .update(JSON.stringify({ closureDate, snapshot, sourceCounts }))
            .digest('hex');

        const result = await client.query(`
            UPDATE financial_closures
            SET status = $1::varchar(50), closed_by = $2, updated_at = CURRENT_TIMESTAMP,
                total_revenue = $3::numeric,
                total_expenses = $4::numeric,
                net_profit = $3::numeric - $4::numeric
            WHERE closure_id = $5 RETURNING *
        `, [data.status, req.user.user_id, revenue, expenses, id]);

        if (data.status === 'Finalized') {
            await client.query(`
                INSERT INTO financial_periods (
                    period_type, start_date, end_date, branch_id, currency_code,
                    status, totals_snapshot, source_counts, snapshot_checksum,
                    closed_by, approved_by, closed_at
                )
                VALUES ('Daily', $1, $1, $2, 'EGP', 'Finalized', $3, $4, $5, $6, $6, NOW())
                ON CONFLICT (period_type, start_date, end_date, branch_id)
                DO UPDATE SET status = 'Finalized', totals_snapshot = EXCLUDED.totals_snapshot,
                              source_counts = EXCLUDED.source_counts,
                              snapshot_checksum = EXCLUDED.snapshot_checksum,
                              closed_by = EXCLUDED.closed_by,
                              approved_by = EXCLUDED.approved_by,
                              closed_at = NOW(), updated_at = NOW()
            `, [
                closureDate,
                postingDate.branchId,
                JSON.stringify(snapshot),
                JSON.stringify(sourceCounts),
                checksum,
                req.user.user_id
            ]);
        }

        await logAction(client, {
            userId: req.user.user_id, action: 'FINANCIAL_PERIOD_FINALIZED', resourceId: id,
            resourceTable: 'financial_closures', ipAddress: req.ip,
            details: { closureDate, revenue, expenses, checksum, sourceCounts }, required: true
        });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

module.exports = {
    getExpenseCategories, createExpenseCategory, updateExpenseCategory,
    getExpenses, createExpense, updateExpense, deleteExpense,
    getCommissionPayables, payCommission,
    getFinancialClosures, createFinancialClosure, finalizeFinancialClosure
};
