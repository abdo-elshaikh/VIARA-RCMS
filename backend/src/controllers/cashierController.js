const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { lockFinancialBusinessDate } = require('../services/financialPostingService');

const getVarianceThreshold = () => {
    const value = Number(process.env.CASH_VARIANCE_THRESHOLD ?? 5);
    return Number.isFinite(value) && value >= 0 ? value : 5;
};

const openShift = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const postingDate = await lockFinancialBusinessDate(client);
        const existing = await client.query(`
            SELECT shift_id
            FROM cashier_shifts
            WHERE cashier_id = $1 AND status = 'Open'
            LIMIT 1
        `, [req.user.user_id]);

        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return next(new AppError('You already have an open cashier shift', 409));
        }

        const pendingReview = await client.query(`
            SELECT c.closure_id
            FROM cashier_shift_closures c
            JOIN cashier_shifts s ON s.shift_id = c.shift_id
            WHERE s.cashier_id = $1 AND c.review_status = 'Requires Review'
            LIMIT 1
        `, [req.user.user_id]);

        if (pendingReview.rows.length > 0) {
            await client.query('ROLLBACK');
            return next(new AppError('You have an unreviewed shift variance closure that requires manager approval before opening a new shift', 403));
        }

        const result = await client.query(`
            INSERT INTO cashier_shifts (
                cashier_id, opening_balance, notes, business_date, branch_id, currency_code
            )
            VALUES ($1, $2, $3, $4, $5, 'EGP')
            RETURNING *
        `, [
            req.user.user_id,
            req.body.openingBalance || 0,
            req.body.notes || null,
            postingDate.businessDate,
            postingDate.branchId
        ]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'CASHIER_SHIFT_OPENED',
            resourceId: result.rows[0].shift_id,
            resourceTable: 'cashier_shifts',
            ipAddress: req.ip,
            details: { openingBalance: Number(req.body.openingBalance || 0) },
            required: true
        });
        await client.query('COMMIT');

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error.code === '23505') {
            return next(new AppError('You already have an open cashier shift', 409));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const closeShift = (db) => async (req, res, next) => {
    let client;

    try {
        const { id } = req.params;
        const { countedCash, varianceReason, notes } = req.body;

        client = await db.connect();
        await client.query('BEGIN');

        const shiftResult = await client.query(`
            SELECT *
            FROM cashier_shifts
            WHERE shift_id = $1
            FOR UPDATE
        `, [id]);

        if (shiftResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Cashier shift not found', 404));
        }

        const shift = shiftResult.rows[0];
        if (shift.status === 'Closed') {
            await client.query('ROLLBACK');
            return next(new AppError('Cashier shift is already closed', 409));
        }

        if (!['Developer', 'Admin'].includes(req.user.role) && shift.cashier_id !== req.user.user_id) {
            await client.query('ROLLBACK');
            return next(new AppError('You cannot close another cashier shift', 403));
        }
        await lockFinancialBusinessDate(client, {
            businessDate: shift.business_date,
            branchId: shift.branch_id
        });

        const totalsResult = await client.query(`
            SELECT method, COALESCE(SUM(net_amount), 0) as total
            FROM (
                SELECT method, amount AS net_amount
                FROM payments
                WHERE cashier_shift_id = $1 AND payment_status = 'Completed'
                UNION ALL
                SELECT method, -amount AS net_amount
                FROM refunds
                WHERE cashier_shift_id = $1 AND status = 'Processed'
            ) transactions
            GROUP BY method
        `, [id]);

        const totals = totalsResult.rows.reduce((acc, row) => {
            acc[row.method] = Number(row.total || 0);
            return acc;
        }, {});
        const cashTotal = Number(totals.Cash || 0);
        const expectedCash = Number(shift.opening_balance || 0) + cashTotal;
        const variance = Number(countedCash) - expectedCash;
        const materialVariance = Math.abs(variance) > getVarianceThreshold();
        if (materialVariance && (!varianceReason || varianceReason.trim().length < 3)) {
            await client.query('ROLLBACK');
            return next(new AppError('A variance reason is required when the cash difference exceeds the configured threshold', 400));
        }

        const closeResult = await client.query(`
            UPDATE cashier_shifts
            SET status = 'Closed',
                closing_balance = $1,
                closed_at = NOW(),
                notes = COALESCE($2, notes)
            WHERE shift_id = $3
            RETURNING *
        `, [
            countedCash,
            notes || null,
            id
        ]);

        const closureResult = await client.query(`
            INSERT INTO cashier_closures (
                shift_id, totals, expected_cash, counted_cash, variance,
                variance_reason, review_status, closed_by, business_date, branch_id, currency_code
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            id,
            JSON.stringify(totals),
            expectedCash,
            countedCash,
            variance,
            materialVariance ? varianceReason.trim() : (varianceReason?.trim() || null),
            materialVariance ? 'Requires Review' : 'Accepted',
            req.user.user_id,
            shift.business_date,
            shift.branch_id,
            shift.currency_code || 'EGP'
        ]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'CASHIER_SHIFT_CLOSED',
            resourceId: id,
            resourceTable: 'cashier_shifts',
            ipAddress: req.ip,
            details: { expectedCash, countedCash: Number(countedCash), variance, materialVariance },
            required: true
        });

        await client.query('COMMIT');
        res.json({
            shift: closeResult.rows[0],
            closure: closureResult.rows[0]
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const reviewCashierClosure = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(`
            SELECT c.*, s.cashier_id
            FROM cashier_closures c
            JOIN cashier_shifts s ON s.shift_id = c.shift_id
            WHERE c.closure_id::text = $1
            FOR UPDATE OF c
        `, [req.params.id]);
        if (!result.rows.length) throw new AppError('Cashier closure not found', 404);
        const closure = result.rows[0];
        if (closure.review_status !== 'Requires Review') throw new AppError('This cashier closure does not require review', 409);
        if (closure.cashier_id === req.user.user_id) throw new AppError('Cashier cannot approve their own variance', 403);

        const updated = await client.query(`
            UPDATE cashier_closures
            SET review_status = 'Reviewed', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
            WHERE closure_id = $3
            RETURNING *
        `, [req.user.user_id, req.body.reviewNotes, closure.closure_id]);
        await logAction(client, {
            userId: req.user.user_id,
            action: 'CASHIER_VARIANCE_REVIEWED',
            resourceId: closure.closure_id,
            resourceTable: 'cashier_closures',
            ipAddress: req.ip,
            details: { variance: Number(closure.variance), reviewNotes: req.body.reviewNotes },
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

const getReconciliation = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const cashierId = req.user.role === 'Cashier' ? req.user.user_id : req.query.cashierId;
        const values = [];
        let param = 1;

        let shiftWhere = 'WHERE 1=1';
        if (startDate) {
            shiftWhere += ` AND s.business_date >= $${param++}::date`;
            values.push(startDate);
        }
        if (endDate) {
            shiftWhere += ` AND s.business_date <= $${param++}::date`;
            values.push(endDate);
        }
        if (cashierId) {
            shiftWhere += ` AND s.cashier_id = $${param++}::uuid`;
            values.push(cashierId);
        }

        const result = await db.query(`
            SELECT s.*, u.full_name as cashier_name,
                   c.closure_id, c.totals, c.expected_cash, c.counted_cash, c.variance,
                   c.variance_reason, c.review_status, c.review_notes, c.reviewed_at,
                   reviewer.full_name AS reviewed_by_name,
                   COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.cashier_shift_id = s.shift_id AND p.payment_status = 'Completed'), 0)
                     - COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.cashier_shift_id = s.shift_id AND r.status = 'Processed'), 0) AS collected_amount,
                   (SELECT COUNT(*) FROM payments p WHERE p.cashier_shift_id = s.shift_id AND p.payment_status = 'Completed') AS payment_count,
                   (SELECT COUNT(*) FROM refunds r WHERE r.cashier_shift_id = s.shift_id AND r.status = 'Processed') AS refund_count,
                   COALESCE((
                       SELECT jsonb_object_agg(method, total)
                       FROM (
                           SELECT method, SUM(net_amount) AS total
                           FROM (
                               SELECT method, amount AS net_amount FROM payments WHERE cashier_shift_id = s.shift_id AND payment_status = 'Completed'
                               UNION ALL
                               SELECT method, -amount AS net_amount FROM refunds WHERE cashier_shift_id = s.shift_id AND status = 'Processed'
                           ) tx
                           GROUP BY method
                       ) method_summary
                   ), '{}'::jsonb) AS payment_totals
            FROM cashier_shifts s
            JOIN users u ON s.cashier_id = u.user_id
            LEFT JOIN cashier_closures c ON c.shift_id = s.shift_id
            LEFT JOIN users reviewer ON reviewer.user_id = c.reviewed_by
            ${shiftWhere}
            ORDER BY s.opened_at DESC
        `, values);

        const summary = result.rows.reduce((acc, row) => {
            acc.collectedAmount += Number(row.collected_amount || 0);
            acc.paymentCount += Number(row.payment_count || 0);
            acc.variance += Number(row.variance || 0);
            acc.openShifts += row.status === 'Open' ? 1 : 0;
            return acc;
        }, { collectedAmount: 0, paymentCount: 0, variance: 0, openShifts: 0 });

        res.json({
            data: result.rows,
            summary
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    openShift,
    closeShift,
    getReconciliation,
    reviewCashierClosure
};
