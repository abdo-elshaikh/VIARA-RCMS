const { getRequestQuery } = require('../utils/requestQuery');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { triggerEventForRole } = require('../services/notificationJobService');
const { DEFAULT_BRANCH_ID, lockFinancialBusinessDate } = require('../services/financialPostingService');
const { ensureActiveAttendanceClockIn } = require('./hrController');
const { decrypt } = require('../utils/crypto');

const getVarianceThreshold = () => {
    const value = Number(process.env.CASH_VARIANCE_THRESHOLD ?? 5);
    return Number.isFinite(value) && value >= 0 ? value : 5;
};

const getCashHandoverTolerance = () => {
    const value = Number(process.env.CASH_HANDOVER_TOLERANCE ?? 0.01);
    return Number.isFinite(value) && value >= 0 ? value : 0.01;
};

const openShift = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const requestedBranchId = req.body.branchId || req.user.branch_id || req.user.branchId || DEFAULT_BRANCH_ID;
        const postingDate = await lockFinancialBusinessDate(client, {
            branchId: requestedBranchId
        });
        const existing = await client.query(`
            SELECT shift_id
            FROM cashier_shifts
            WHERE cashier_id = $1 AND branch_id = $2 AND status = 'Open'
            LIMIT 1
        `, [req.user.user_id, postingDate.branchId]);

        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return next(new AppError('You already have an open cashier shift', 409));
        }

        const pendingReview = await client.query(`
            SELECT c.closure_id
            FROM cashier_closures c
            JOIN cashier_shifts s ON s.shift_id = c.shift_id
            WHERE s.cashier_id = $1
              AND s.branch_id = $2
              AND c.review_status = 'Requires Review'
            LIMIT 1
        `, [req.user.user_id, postingDate.branchId]);

        if (pendingReview.rows.length > 0) {
            await client.query('ROLLBACK');
            return next(new AppError('You have an unreviewed shift variance closure that requires manager approval before opening a new shift', 403));
        }

        const previousShift = await client.query(`
            SELECT shift_id, closing_balance, closed_at
            FROM cashier_shifts
            WHERE cashier_id = $1
              AND branch_id = $2
              AND status = 'Closed'
              AND closing_balance IS NOT NULL
            ORDER BY closed_at DESC NULLS LAST, opened_at DESC
            LIMIT 1
            FOR UPDATE
        `, [req.user.user_id, postingDate.branchId]);
        const openingBalance = Number(req.body.openingBalance || 0);
        const previousClosingBalance = previousShift.rows[0]
            ? Number(previousShift.rows[0].closing_balance)
            : null;
        const handoverDifference = previousClosingBalance === null
            ? 0
            : openingBalance - previousClosingBalance;
        const handoverMismatch = previousClosingBalance !== null
            && Math.abs(handoverDifference) > getCashHandoverTolerance();
        if (handoverMismatch && (!req.body.notes || String(req.body.notes).trim().length < 3)) {
            await client.query('ROLLBACK');
            return next(new AppError('A handover note is required when the opening cash differs from the previous closing balance', 400));
        }
        const openingNotes = handoverMismatch
            ? `[handover] Previous closing balance: ${previousClosingBalance}; opening balance: ${openingBalance}; difference: ${handoverDifference}. ${String(req.body.notes).trim()}`
            : (req.body.notes || null);

        const activeAttendance = await client.query(`
            SELECT log_id, clock_in, shift_id
            FROM attendance_logs
            WHERE user_id = $1 AND clock_out IS NULL
            ORDER BY clock_in DESC
            LIMIT 1
            FOR SHARE
        `, [req.user.user_id]);

        if (!activeAttendance.rows.length) {
            await client.query('ROLLBACK');
            return next(new AppError(
                'Attendance clock-in is required before opening an operational shift. Please register attendance first. | يجب تسجيل الحضور أولاً قبل فتح وردية الخزينة بناءً على جدول وردياتك المعتمد.',
                403,
                true,
                'ATTENDANCE_REQUIRED_BEFORE_SHIFT'
            ));
        }

        const attendanceSession = activeAttendance.rows[0];
        const isStale = new Date(attendanceSession.clock_in) < new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (isStale) {
            await client.query('ROLLBACK');
            return next(new AppError(
                'Your previous attendance session is stale (exceeded 24 hours). Please settle and conclude it before opening a new shift. | جلسة الحضور السابقة معلقة وتجاوزت 24 ساعة. يرجى تسوية الانصراف أولاً.',
                403,
                true,
                'ATTENDANCE_STALE_SESSION'
            ));
        }

        const result = await client.query(`
            INSERT INTO cashier_shifts (
                cashier_id, opening_balance, notes, business_date, branch_id, currency_code
            )
            VALUES ($1, $2, $3, $4, $5, 'EGP')
            RETURNING *
        `, [
            req.user.user_id,
            openingBalance,
            openingNotes,
            postingDate.businessDate,
            postingDate.branchId
        ]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'CASHIER_SHIFT_OPENED',
            resourceId: result.rows[0].shift_id,
            resourceTable: 'cashier_shifts',
            ipAddress: req.ip,
            details: {
                openingBalance,
                previousClosingBalance,
                handoverDifference,
                handoverMismatch,
            },
            required: true
        });
        await client.query('COMMIT');
        currentCashierShiftCache.clear();

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
        }
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
            SELECT s.*, u.full_name AS cashier_name
            FROM cashier_shifts s
            JOIN users u ON u.user_id = s.cashier_id
            WHERE s.shift_id = $1
            FOR UPDATE OF s
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
        const userBranchId = req.user.branch_id || req.user.branchId;
        if (userBranchId && shift.branch_id !== userBranchId) {
            await client.query('ROLLBACK');
            return next(new AppError('You cannot close a cashier shift from another branch', 403));
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
        currentCashierShiftCache.clear();

        if (materialVariance) {
            const variancePayload = {
                entityType: 'CashierClosure',
                entityId: closureResult.rows[0].closure_id,
                variables: {
                    cashier_name: shift.cashier_name || '',
                    expected_cash: expectedCash,
                    counted_cash: Number(countedCash),
                    variance,
                    business_date: shift.business_date,
                }
            };
            for (const role of ['Admin', 'Accountant', 'Developer']) {
                triggerEventForRole(db, 'CASHIER_VARIANCE_REQUIRES_REVIEW', role, variancePayload);
            }
        }

        res.json({
            shift: closeResult.rows[0],
            closure: closureResult.rows[0]
        });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
        }
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
        const userBranchId = req.user.branch_id || req.user.branchId;
        if (userBranchId && closure.branch_id !== userBranchId && req.user.role !== 'Developer') {
            throw new AppError('You cannot review a cashier closure from another branch', 403);
        }
        if (closure.review_status !== 'Requires Review') throw new AppError('This cashier closure does not require review', 409);
        if (closure.cashier_id === req.user.user_id && req.user.role !== 'Developer') throw new AppError('Cashier cannot approve their own variance', 403);

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
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getReconciliation = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = getRequestQuery(req);
        const branchId = getRequestQuery(req).branchId || req.user.branch_id || req.user.branchId || DEFAULT_BRANCH_ID;

        const supervisorPermissions = await db.query(`
            SELECT 1
            FROM role_permissions rp
            JOIN permissions p ON p.permission_id = rp.permission_id
            WHERE rp.role_name = $1
              AND p.name IN ('RECONCILE_SHIFTS', 'APPROVE_SHIFT_VARIANCE')
            LIMIT 1
        `, [req.user.role]);
        const canReviewAllShifts = supervisorPermissions.rows.length > 0
            || req.user.role === 'Developer';
        const cashierId = canReviewAllShifts ? (getRequestQuery(req).cashierId || null) : (req.user.user_id || null);
        const values = [];
        let param = 1;

        let shiftWhere = `WHERE s.branch_id = $${param++}::uuid`;
        values.push(branchId);
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

        const shiftIds = (result.rows || []).map((r) => r.shift_id).filter(Boolean);
        const paymentsByShift = new Map();
        if (shiftIds.length > 0) {
            try {
                const paymentsResult = await db.query(`
                    SELECT p.payment_id, p.invoice_id, p.amount, p.method, p.payment_reference, p.payment_status,
                           p.transaction_date, p.transaction_date AS created_at, p.cashier_shift_id,
                           i.invoice_number, i.patient_id,
                           pt.mrn, pt.first_name_enc, pt.last_name_enc
                    FROM payments p
                    JOIN invoices i ON i.invoice_id = p.invoice_id
                    JOIN patients pt ON pt.patient_id = i.patient_id
                    WHERE p.cashier_shift_id = ANY($1::uuid[]) AND p.payment_status = 'Completed'
                    ORDER BY p.transaction_date DESC
                `, [shiftIds]);

                (paymentsResult?.rows || []).forEach((row) => {
                    const list = paymentsByShift.get(row.cashier_shift_id) || [];
                    list.push({
                        ...row,
                        patient_name: [decrypt(row.first_name_enc), decrypt(row.last_name_enc)].filter(Boolean).join(' ') || 'المريض'
                    });
                    paymentsByShift.set(row.cashier_shift_id, list);
                });
            } catch {
                // Graceful fallback if database mock or table does not support batch query
            }
        }

        const rowsWithPayments = (result.rows || []).map((row) => ({
            ...row,
            payments: paymentsByShift.get(row.shift_id) || []
        }));

        const summary = rowsWithPayments.reduce((acc, row) => {
            acc.collectedAmount += Number(row.collected_amount || 0);
            acc.paymentCount += Number(row.payment_count || 0);
            acc.variance += Number(row.variance || 0);
            acc.openShifts += row.status === 'Open' ? 1 : 0;
            return acc;
        }, { collectedAmount: 0, paymentCount: 0, variance: 0, openShifts: 0 });

        res.json({
            data: rowsWithPayments,
            summary
        });
    } catch (error) {
        next(error);
    }
};

const CURRENT_CASHIER_SHIFT_CACHE_TTL_MS = 3000;
const currentCashierShiftCache = new Map();

const getCurrentCashierShift = (db) => async (req, res, next) => {
    try {
        const branchId = getRequestQuery(req)?.branchId || req.user?.branch_id || req.user?.branchId || DEFAULT_BRANCH_ID;
        const userId = req.user?.user_id || req.user?.userId || req.user?.id;
        const cacheKey = `${userId}:${branchId}`;
        const now = Date.now();
        if (process.env.NODE_ENV !== 'test') {
            const cached = currentCashierShiftCache.get(cacheKey);
            if (cached && (now - cached.timestamp < CURRENT_CASHIER_SHIFT_CACHE_TTL_MS)) {
                return res.json(cached.data);
            }
        }

        const result = await db.query(`
            SELECT s.*, u.full_name AS cashier_name,
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
            JOIN users u ON u.user_id = s.cashier_id
            WHERE s.cashier_id = $1 AND s.branch_id = $2 AND s.status = 'Open'
            ORDER BY s.opened_at DESC
            LIMIT 1
        `, [userId, branchId]);

        if (!result.rows[0]) {
            if (process.env.NODE_ENV !== 'test') {
                currentCashierShiftCache.set(cacheKey, { timestamp: now, data: null });
            }
            return res.json(null);
        }

        const shift = { ...result.rows[0] };
        try {
            const paymentsResult = await db.query(`
                SELECT p.payment_id, p.invoice_id, p.amount, p.method, p.payment_reference, p.payment_status,
                       p.transaction_date, p.transaction_date AS created_at, p.cashier_shift_id,
                       i.invoice_number, i.patient_id,
                       pt.mrn, pt.first_name_enc, pt.last_name_enc
                FROM payments p
                JOIN invoices i ON i.invoice_id = p.invoice_id
                JOIN patients pt ON pt.patient_id = i.patient_id
                WHERE p.cashier_shift_id = $1 AND p.payment_status = 'Completed'
                ORDER BY p.transaction_date DESC
            `, [shift.shift_id]);

            shift.payments = (paymentsResult?.rows || []).map((row) => ({
                ...row,
                patient_name: [decrypt(row.first_name_enc), decrypt(row.last_name_enc)].filter(Boolean).join(' ') || 'المريض'
            }));
        } catch {
            shift.payments = shift.payments || [];
        }

        if (process.env.NODE_ENV !== 'test') {
            currentCashierShiftCache.set(cacheKey, { timestamp: now, data: shift });
            if (currentCashierShiftCache.size > 200) {
                const oldest = currentCashierShiftCache.keys().next().value;
                currentCashierShiftCache.delete(oldest);
            }
        }

        res.json(shift);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCurrentCashierShift,
    openShift,
    closeShift,
    getReconciliation,
    reviewCashierClosure
};
