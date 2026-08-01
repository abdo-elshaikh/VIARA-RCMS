const { AppError } = require('../middleware/errorHandler');
const {
    DEFAULT_BRANCH_ID,
    DEFAULT_CURRENCY,
    lockFinancialBusinessDate,
    moneyNumber,
    postJournalBatch
} = require('../services/financialPostingService');

const getUserId = (req) => req.user?.user_id || req.user?.userId || req.user?.id || null;

const boundedInteger = (value, fallback = 100, max = 500) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(1, parsed));
};

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALLMENT_DEDUCTION_TYPES = new Set(['Installment', 'Advance', 'Loan']);
const MAKER_CHECKER_STATUS_FIELD = {
    Reviewed: 'calculated_by',
    Approved: 'reviewed_by',
    Paid: 'approved_by',
    Locked: 'paid_by'
};

const dateOnly = (value) => {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const inclusiveDays = (start, end) => {
    const from = dateOnly(start);
    const to = dateOnly(end);
    return Math.max(1, Math.round((to - from) / DAY_MS) + 1);
};

const overlapDays = (startA, endA, startB, endB) => {
    const from = new Date(Math.max(dateOnly(startA), dateOnly(startB)));
    const to = new Date(Math.min(dateOnly(endA), dateOnly(endB)));
    if (to < from) return 0;
    return Math.round((to - from) / DAY_MS) + 1;
};

const capLineAmounts = (lines, availableAmount) => {
    let available = roundMoney(availableAmount);
    return lines.map((line) => {
        const requestedAmount = roundMoney(line.amount);
        const appliedAmount = roundMoney(Math.min(requestedAmount, Math.max(0, available)));
        available = roundMoney(available - appliedAmount);
        return {
            ...line,
            requestedAmount,
            amount: appliedAmount,
            unappliedAmount: roundMoney(requestedAmount - appliedAmount)
        };
    });
};

const sumAmount = (lines) => roundMoney(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0));

const calculateRuleAmount = (rule, context) => {
    const value = Number(rule.value || 0);
    if (value <= 0) return 0;
    if (rule.rule_type === 'Overtime' && context.overtimeHours <= 0) return 0;
    if (rule.rule_type === 'Absence' && context.absenceDays <= 0) return 0;
    if (['Late', 'EarlyLeave'].includes(rule.rule_type) && context.lateMinutes <= 0) return 0;
    if (rule.calculation_method === 'FixedAmount') return roundMoney(value);
    if (rule.calculation_method === 'PercentageOfBase') return roundMoney(context.baseGross * (value / 100));
    if (rule.calculation_method === 'PercentageOfGross') return roundMoney(context.gross * (value / 100));
    if (rule.calculation_method === 'HourlyMultiplier') {
        return roundMoney(context.overtimeHours * context.hourlyRate * Math.max(0, value - 1));
    }
    if (rule.calculation_method === 'PerDay') return roundMoney(context.absenceDays * context.dailyRate * value);
    if (rule.calculation_method === 'PerMinute') return roundMoney(context.lateMinutes * value);
    return 0;
};

const ruleLineType = (ruleType) => {
    if (['Allowance', 'Overtime'].includes(ruleType)) return 'Earning';
    if (['Deduction', 'Late', 'EarlyLeave', 'Absence'].includes(ruleType)) return 'Deduction';
    if (ruleType === 'Penalty') return 'Penalty';
    if (ruleType === 'EmployerContribution') return 'EmployerContribution';
    return 'Adjustment';
};

const assertMakerChecker = ({ run, status, userId, role, notes }) => {
    if (role === 'Developer') {
        const priorActor = MAKER_CHECKER_STATUS_FIELD[status] ? run[MAKER_CHECKER_STATUS_FIELD[status]] : null;
        if (priorActor && priorActor === userId && String(notes || '').trim().length < 10) {
            throw new AppError('Developer maker-checker override requires a reason of at least 10 characters', 400);
        }
        return Boolean(priorActor && priorActor === userId);
    }

    const priorField = MAKER_CHECKER_STATUS_FIELD[status];
    if (priorField && run[priorField] && run[priorField] === userId) {
        throw new AppError(`Maker-checker control prevents the same user from moving payroll to ${status}`, 403);
    }
    return false;
};

const paymentAccount = (method) => {
    if (method === 'Cash') return ['1000', 'Cash on hand'];
    if (method === 'Check') return ['1015', 'Checks clearing'];
    if (method === 'Wallet') return ['1020', 'Wallet clearing'];
    return ['1010', 'Bank transfer clearing'];
};

const payrollPaymentJournalEntries = (run, paymentMethod) => {
    const gross = moneyNumber(run.total_gross);
    const deductions = moneyNumber(run.total_deductions);
    const penalties = moneyNumber(run.total_penalties);
    const net = moneyNumber(run.total_net);
    const [settlementCode, settlementName] = paymentAccount(paymentMethod);
    return [
        gross > 0 && { accountCode: '6100', accountName: 'Salaries and wages expense', debit: gross, credit: 0 },
        net > 0 && { accountCode: settlementCode, accountName: settlementName, debit: 0, credit: net },
        deductions > 0 && { accountCode: '2150', accountName: 'Payroll deductions payable', debit: 0, credit: deductions },
        penalties > 0 && { accountCode: '4200', accountName: 'Staff penalty recoveries', debit: 0, credit: penalties }
    ].filter(Boolean);
};

const getPayrollOverview = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT
                COUNT(*)::int AS periods,
                COUNT(*) FILTER (WHERE status IN ('Draft', 'Calculated', 'Reviewed'))::int AS open_periods,
                COALESCE(SUM(total_gross), 0)::numeric AS total_gross,
                COALESCE(SUM(total_deductions), 0)::numeric AS total_deductions,
                COALESCE(SUM(total_penalties), 0)::numeric AS total_penalties,
                COALESCE(SUM(total_net), 0)::numeric AS total_net,
                COALESCE((
                    SELECT COUNT(*) FROM employee_penalties WHERE status IN ('Draft', 'Pending Approval')
                ), 0)::int AS pending_penalties,
                COALESCE((
                    SELECT COUNT(*) FROM employee_deductions WHERE status IN ('Draft', 'Paused')
                ), 0)::int AS pending_deductions
            FROM payroll_periods
            WHERE status != 'Cancelled'
        `);
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getPayrollPeriods = (db) => async (req, res, next) => {
    try {
        const { status, startDate, endDate, branchId, limit = 100 } = req.query;
        const pageLimit = boundedInteger(limit);
        const params = [];
        let query = `
            SELECT p.*, r.run_id, r.employee_count, r.total_gross, r.total_deductions,
                   r.total_net, r.status AS run_status,
                   creator.full_name AS created_by_name,
                   reviewer.full_name AS reviewed_by_name,
                   approver.full_name AS approved_by_name,
                   payer.full_name AS paid_by_name
            FROM payroll_periods p
            LEFT JOIN payroll_runs r ON r.period_id = p.period_id
            LEFT JOIN users creator ON creator.user_id = p.created_by
            LEFT JOIN users reviewer ON reviewer.user_id = p.reviewed_by
            LEFT JOIN users approver ON approver.user_id = p.approved_by
            LEFT JOIN users payer ON payer.user_id = p.paid_by
            WHERE 1=1
        `;
        if (status) {
            params.push(status);
            query += ` AND p.status = $${params.length}::varchar`;
        }
        if (startDate) {
            params.push(startDate);
            query += ` AND p.end_date >= $${params.length}::date`;
        }
        if (endDate) {
            params.push(endDate);
            query += ` AND p.start_date <= $${params.length}::date`;
        }
        if (branchId) {
            params.push(branchId);
            query += ` AND p.branch_id = $${params.length}::uuid`;
        }
        params.push(pageLimit);
        query += ` ORDER BY p.start_date DESC, p.created_at DESC LIMIT $${params.length}::int`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createPayrollPeriod = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const branchId = data.branchId || DEFAULT_BRANCH_ID;
        const overlap = await db.query(`
            SELECT period_id, name
            FROM payroll_periods
            WHERE status != 'Cancelled'
              AND branch_id = $3::uuid
              AND daterange(start_date, end_date, '[]') && daterange($1::date, $2::date, '[]')
            LIMIT 1
        `, [data.startDate, data.endDate, branchId]);
        if (overlap.rows.length) {
            return next(new AppError(`Payroll period overlaps with ${overlap.rows[0].name}`, 409));
        }

        const result = await db.query(`
            INSERT INTO payroll_periods (name, start_date, end_date, currency_code, notes, created_by, branch_id)
            VALUES ($1, $2, $3, UPPER($4), $5, $6, $7::uuid)
            RETURNING *
        `, [data.name, data.startDate, data.endDate, data.currencyCode, data.notes, getUserId(req), branchId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getCompensationProfiles = (db) => async (req, res, next) => {
    try {
        const { userId, limit = 100 } = req.query;
        const pageLimit = boundedInteger(limit);
        const params = [];
        let query = `
            SELECT cp.*, u.full_name AS employee_name, u.email, u.role
            FROM employee_compensation_profiles cp
            JOIN users u ON u.user_id = cp.user_id
            WHERE 1=1
        `;
        if (userId) {
            params.push(userId);
            query += ` AND cp.user_id = $${params.length}::uuid`;
        }
        params.push(pageLimit);
        query += ` ORDER BY cp.is_active DESC, cp.effective_from DESC, cp.created_at DESC LIMIT $${params.length}::int`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createCompensationProfile = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const overlap = await db.query(`
            SELECT profile_id
            FROM employee_compensation_profiles
            WHERE user_id = $1
              AND is_active = TRUE
              AND daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]')
                  && daterange($2::date, COALESCE($3::date, '9999-12-31'::date), '[]')
            LIMIT 1
        `, [data.userId, data.effectiveFrom, data.effectiveTo || null]);
        if (overlap.rows.length) {
            return next(new AppError('Employee already has an active compensation profile in this date range', 409));
        }

        const result = await db.query(`
            INSERT INTO employee_compensation_profiles (
                user_id, salary_type, base_salary, hourly_rate, standard_hours_per_day,
                standard_days_per_period, effective_from, effective_to, is_active, notes, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            data.userId,
            data.salaryType,
            data.baseSalary,
            data.hourlyRate,
            data.standardHoursPerDay,
            data.standardDaysPerPeriod,
            data.effectiveFrom,
            data.effectiveTo || null,
            data.isActive,
            data.notes,
            getUserId(req)
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getPayrollRules = (db) => async (req, res, next) => {
    try {
        const { status } = req.query;
        const params = [];
        const result = await db.query(`
            SELECT r.*, creator.full_name AS created_by_name, approver.full_name AS approved_by_name
            FROM payroll_rules r
            LEFT JOIN users creator ON creator.user_id = r.created_by
            LEFT JOIN users approver ON approver.user_id = r.approved_by
            WHERE 1=1
            ${status ? `AND r.status = $1::varchar(30)` : ''}
            ORDER BY r.status ASC, r.is_active DESC, r.rule_type ASC, r.name ASC
        `, status ? [status] : params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createPayrollRule = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const needsApproval = Boolean(data.requiresApproval);
        const status = needsApproval ? 'Pending Approval' : 'Approved';
        const isActive = needsApproval ? false : data.isActive;
        const result = await db.query(`
            INSERT INTO payroll_rules (
                rule_type, name, calculation_method, value, taxable, requires_approval,
                effective_from, effective_to, is_active, status, metadata, created_by,
                approved_by, approved_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::varchar(30), $11::jsonb, $12, $13, $14)
            RETURNING *
        `, [
            data.ruleType,
            data.name,
            data.calculationMethod,
            data.value,
            data.taxable,
            data.requiresApproval,
            data.effectiveFrom,
            data.effectiveTo || null,
            isActive,
            status,
            JSON.stringify(data.metadata || {}),
            getUserId(req),
            status === 'Approved' ? getUserId(req) : null,
            status === 'Approved' ? new Date() : null
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updatePayrollRuleStatus = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { ruleId } = req.params;
        const { status, notes } = req.body;
        const userId = getUserId(req);
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT * FROM payroll_rules WHERE rule_id = $1::uuid FOR UPDATE',
            [ruleId]
        );
        if (!existing.rows.length) throw new AppError('Payroll rule not found', 404);
        const rule = existing.rows[0];
        if (rule.status !== 'Pending Approval') {
            throw new AppError(`Payroll rule cannot move from ${rule.status} to ${status}`, 409);
        }
        if (status === 'Approved' && req.user?.role !== 'Developer' && rule.created_by === userId) {
            throw new AppError('The payroll rule creator cannot approve their own request', 403);
        }

        const updated = await client.query(`
            UPDATE payroll_rules
            SET status = $2::varchar(30),
                is_active = CASE WHEN $2::varchar(30) = 'Approved' THEN TRUE ELSE FALSE END,
                approved_by = CASE WHEN $2::varchar(30) = 'Approved' THEN $3::uuid ELSE NULL END,
                approved_at = CASE WHEN $2::varchar(30) = 'Approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            WHERE rule_id = $1::uuid
            RETURNING *
        `, [ruleId, status, userId]);

        await client.query(`
            INSERT INTO payroll_audit_log (
                entity_type, entity_id, action, previous_status, new_status, details, changed_by
            )
            VALUES ('payroll_rule', $1::uuid, 'STATUS_CHANGE', $2::varchar(30), $3::varchar(30), $4::jsonb, $5::uuid)
        `, [
            ruleId,
            rule.status,
            status,
            JSON.stringify({
                notes: notes || null,
                ruleType: rule.rule_type,
                name: rule.name,
                calculationMethod: rule.calculation_method,
                value: rule.value
            }),
            userId
        ]);

        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

const getDeductions = (db) => async (req, res, next) => {
    try {
        const { userId, status, limit = 100 } = req.query;
        const pageLimit = boundedInteger(limit);
        const params = [];
        let query = `
            SELECT d.*, u.full_name AS employee_name, creator.full_name AS created_by_name, approver.full_name AS approved_by_name
            FROM employee_deductions d
            JOIN users u ON u.user_id = d.user_id
            LEFT JOIN users creator ON creator.user_id = d.created_by
            LEFT JOIN users approver ON approver.user_id = d.approved_by
            WHERE 1=1
        `;
        if (userId) {
            params.push(userId);
            query += ` AND d.user_id = $${params.length}::uuid`;
        }
        if (status) {
            params.push(status);
            query += ` AND d.status = $${params.length}::varchar`;
        }
        params.push(pageLimit);
        query += ` ORDER BY d.created_at DESC LIMIT $${params.length}::int`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createDeduction = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const approved = data.status === 'Approved';
        const result = await db.query(`
            INSERT INTO employee_deductions (
                user_id, name, deduction_type, amount, percentage, total_amount,
                remaining_amount, start_date, end_date, status, notes, created_by, approved_by, approved_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, $6), $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [
            data.userId,
            data.name,
            data.deductionType,
            data.amount,
            data.percentage,
            data.totalAmount || null,
            data.remainingAmount || null,
            data.startDate,
            data.endDate || null,
            data.status,
            data.notes,
            getUserId(req),
            approved ? getUserId(req) : null,
            approved ? new Date() : null
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updateDeductionStatus = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { deductionId } = req.params;
        const { status, notes } = req.body;
        const userId = getUserId(req);
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT * FROM employee_deductions WHERE deduction_id = $1::uuid FOR UPDATE',
            [deductionId]
        );
        if (!existing.rows.length) throw new AppError('Payroll deduction not found', 404);
        const deduction = existing.rows[0];
        if (!['Draft', 'Paused'].includes(deduction.status)) {
            throw new AppError(`Deduction cannot move from ${deduction.status} to ${status}`, 409);
        }
        if (status === 'Approved' && req.user?.role !== 'Developer' && deduction.created_by === userId) {
            throw new AppError('The deduction creator cannot approve their own request', 403);
        }

        const updated = await client.query(`
            UPDATE employee_deductions
            SET status = $2::varchar(30),
                approved_by = CASE WHEN $2::varchar(30) = 'Approved' THEN $3::uuid ELSE approved_by END,
                approved_at = CASE WHEN $2::varchar(30) = 'Approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE deduction_id = $1::uuid
            RETURNING *
        `, [deductionId, status, userId]);

        await client.query(`
            INSERT INTO payroll_audit_log (
                entity_type, entity_id, action, previous_status, new_status, details, changed_by
            )
            VALUES ('employee_deduction', $1::uuid, 'STATUS_CHANGE', $2::varchar(30), $3::varchar(30), $4::jsonb, $5::uuid)
        `, [
            deductionId,
            deduction.status,
            status,
            JSON.stringify({ notes: notes || null }),
            userId
        ]);

        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

const getPenalties = (db) => async (req, res, next) => {
    try {
        const { userId, status, limit = 100 } = req.query;
        const pageLimit = boundedInteger(limit);
        const params = [];
        let query = `
            SELECT p.*, u.full_name AS employee_name, creator.full_name AS created_by_name, approver.full_name AS approved_by_name
            FROM employee_penalties p
            JOIN users u ON u.user_id = p.user_id
            LEFT JOIN users creator ON creator.user_id = p.created_by
            LEFT JOIN users approver ON approver.user_id = p.approved_by
            WHERE 1=1
        `;
        if (userId) {
            params.push(userId);
            query += ` AND p.user_id = $${params.length}::uuid`;
        }
        if (status) {
            params.push(status);
            query += ` AND p.status = $${params.length}::varchar`;
        }
        params.push(pageLimit);
        query += ` ORDER BY p.created_at DESC LIMIT $${params.length}::int`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createPenalty = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const approved = data.status === 'Approved';
        const result = await db.query(`
            INSERT INTO employee_penalties (
                user_id, attendance_id, payroll_period_id, penalty_type, amount, reason,
                source, status, created_by, approved_by, approved_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            data.userId,
            data.attendanceId || null,
            data.payrollPeriodId || null,
            data.penaltyType,
            data.amount,
            data.reason,
            data.source,
            data.status,
            getUserId(req),
            approved ? getUserId(req) : null,
            approved ? new Date() : null
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updatePenaltyStatus = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { penaltyId } = req.params;
        const { status, notes } = req.body;
        const userId = getUserId(req);
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT * FROM employee_penalties WHERE penalty_id = $1::uuid FOR UPDATE',
            [penaltyId]
        );
        if (!existing.rows.length) throw new AppError('Payroll penalty not found', 404);
        const penalty = existing.rows[0];
        if (penalty.status !== 'Pending Approval') {
            throw new AppError(`Penalty cannot move from ${penalty.status} to ${status}`, 409);
        }
        if (req.user?.role !== 'Developer' && penalty.created_by === userId) {
            throw new AppError('The penalty creator cannot approve or reject their own request', 403);
        }

        const updated = await client.query(`
            UPDATE employee_penalties
            SET status = $2::varchar(30),
                approved_by = CASE WHEN $2::varchar(30) = 'Approved' THEN $3::uuid ELSE NULL END,
                approved_at = CASE WHEN $2::varchar(30) = 'Approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            WHERE penalty_id = $1::uuid
            RETURNING *
        `, [penaltyId, status, userId]);

        await client.query(`
            INSERT INTO payroll_audit_log (
                entity_type, entity_id, action, previous_status, new_status, details, changed_by
            )
            VALUES ('employee_penalty', $1::uuid, 'STATUS_CHANGE', $2::varchar(30), $3::varchar(30), $4::jsonb, $5::uuid)
        `, [
            penaltyId,
            penalty.status,
            status,
            JSON.stringify({ notes: notes || null }),
            userId
        ]);

        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

const getPayrollRun = (db) => async (req, res, next) => {
    try {
        const { periodId } = req.params;
        const runResult = await db.query(`
            SELECT r.*, p.name AS period_name, p.start_date, p.end_date, p.currency_code, p.branch_id
            FROM payroll_runs r
            JOIN payroll_periods p ON p.period_id = r.period_id
            WHERE r.period_id = $1
        `, [periodId]);
        if (!runResult.rows.length) return next(new AppError('Payroll run not found', 404));

        const items = await db.query(`
            SELECT i.*, u.full_name AS employee_name, u.email, u.role,
                   COALESCE(jsonb_agg(to_jsonb(li) ORDER BY li.created_at) FILTER (WHERE li.line_item_id IS NOT NULL), '[]'::jsonb) AS line_items
            FROM payroll_employee_items i
            JOIN users u ON u.user_id = i.user_id
            LEFT JOIN payroll_line_items li ON li.payroll_employee_item_id = i.item_id
            WHERE i.run_id = $1
            GROUP BY i.item_id, u.user_id
            ORDER BY u.full_name ASC
        `, [runResult.rows[0].run_id]);

        res.json({ ...runResult.rows[0], items: items.rows });
    } catch (error) {
        next(error);
    }
};

const loadCalculationInputs = async (client, period) => {
    const employees = await client.query(`
        SELECT u.user_id, u.full_name, u.email, u.role,
               COALESCE(ep.salary, 0) AS legacy_salary,
               cp.profile_id, cp.salary_type, cp.base_salary, cp.hourly_rate,
               cp.standard_hours_per_day, cp.standard_days_per_period,
               cp.effective_from, cp.effective_to
        FROM users u
        LEFT JOIN employee_profiles ep ON ep.user_id = u.user_id
        LEFT JOIN LATERAL (
            SELECT *
            FROM employee_compensation_profiles cp
            WHERE cp.user_id = u.user_id
              AND cp.is_active = TRUE
              AND cp.effective_from <= $2::date
              AND (cp.effective_to IS NULL OR cp.effective_to >= $1::date)
            ORDER BY cp.effective_from DESC, cp.created_at DESC
            LIMIT 1
        ) cp ON TRUE
        WHERE u.is_active = TRUE
          AND u.role NOT IN ('Patient', 'Referring_Doctor', 'Developer')
        ORDER BY u.full_name ASC
    `, [period.start_date, period.end_date]);

    const attendance = await client.query(`
        SELECT user_id,
               COUNT(*)::int AS log_count,
               COUNT(DISTINCT clock_in::date)::int AS days_worked,
               COUNT(*) FILTER (WHERE status = 'Absent')::numeric AS absent_days,
               COUNT(*) FILTER (WHERE status = 'Half-Day')::numeric * 0.5 AS half_days,
               COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out, clock_in) - clock_in)) / 3600), 0)::numeric AS hours_worked,
               COALESCE(jsonb_agg(jsonb_build_object(
                   'logId', log_id,
                   'clockIn', clock_in,
                   'clockOut', clock_out,
                   'status', status
               ) ORDER BY clock_in), '[]'::jsonb) AS logs
        FROM attendance_logs
        WHERE clock_in::date BETWEEN $1::date AND $2::date
        GROUP BY user_id
    `, [period.start_date, period.end_date]);

    const deductions = await client.query(`
        SELECT *
        FROM employee_deductions
        WHERE status = 'Approved'
          AND start_date <= $2::date
          AND (end_date IS NULL OR end_date >= $1::date)
        ORDER BY created_at ASC
    `, [period.start_date, period.end_date]);

    const penalties = await client.query(`
        SELECT *
        FROM employee_penalties
        WHERE status = 'Approved'
          AND (payroll_period_id IS NULL OR payroll_period_id = $3)
        ORDER BY created_at ASC
    `, [period.start_date, period.end_date, period.period_id]);

    const rules = await client.query(`
        SELECT *
        FROM payroll_rules
        WHERE is_active = TRUE
          AND status = 'Approved'
          AND effective_from <= $2::date
          AND (effective_to IS NULL OR effective_to >= $1::date)
        ORDER BY rule_type ASC, created_at ASC
    `, [period.start_date, period.end_date]);

    return {
        employees: employees.rows,
        rules: rules.rows,
        attendanceByUser: new Map(attendance.rows.map((row) => [row.user_id, row])),
        deductionsByUser: deductions.rows.reduce((map, row) => {
            map.set(row.user_id, [...(map.get(row.user_id) || []), row]);
            return map;
        }, new Map()),
        penaltiesByUser: penalties.rows.reduce((map, row) => {
            map.set(row.user_id, [...(map.get(row.user_id) || []), row]);
            return map;
        }, new Map())
    };
};

const calculateDeductionAmount = (deduction, gross) => {
    if (deduction.deduction_type === 'Percentage') {
        return roundMoney(gross * (Number(deduction.percentage || 0) / 100));
    }
    if (['Installment', 'Advance', 'Loan'].includes(deduction.deduction_type)) {
        const installment = Number(deduction.amount || 0);
        const remaining = Number(deduction.remaining_amount || deduction.total_amount || installment);
        return roundMoney(Math.min(installment, remaining));
    }
    return roundMoney(deduction.amount);
};

const applyPaidDeductionBalances = async (client, runId, userId) => {
    await client.query(`
        WITH applied AS (
            SELECT source_id AS deduction_id, SUM(amount)::numeric AS applied_amount
            FROM payroll_line_items
            WHERE run_id = $1::uuid
              AND source_type = 'employee_deductions'
              AND source_id IS NOT NULL
            GROUP BY source_id
        ),
        updated AS (
            UPDATE employee_deductions d
            SET remaining_amount = GREATEST(
                    0::numeric,
                    COALESCE(d.remaining_amount, d.total_amount, d.amount) - applied.applied_amount
                ),
                status = CASE
                    WHEN d.deduction_type IN ('Installment', 'Advance', 'Loan')
                     AND GREATEST(0::numeric, COALESCE(d.remaining_amount, d.total_amount, d.amount) - applied.applied_amount) <= 0
                        THEN 'Completed'
                    ELSE d.status
                END,
                updated_at = CURRENT_TIMESTAMP
            FROM applied
            WHERE d.deduction_id = applied.deduction_id
              AND d.deduction_type IN ('Installment', 'Advance', 'Loan')
            RETURNING d.deduction_id, applied.applied_amount, d.remaining_amount, d.status
        )
        INSERT INTO payroll_audit_log (entity_type, entity_id, action, previous_status, new_status, details, changed_by)
        SELECT 'employee_deduction',
               deduction_id,
               'DEDUCTION_APPLIED',
               NULL,
               status,
               jsonb_build_object('runId', $1::uuid, 'appliedAmount', applied_amount, 'remainingAmount', remaining_amount),
               $2::uuid
        FROM updated
    `, [runId, userId]);
};

const calculatePayroll = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { periodId } = req.body;
        await client.query('BEGIN');

        const periodResult = await client.query('SELECT * FROM payroll_periods WHERE period_id = $1::uuid FOR UPDATE', [periodId]);
        if (!periodResult.rows.length) throw new AppError('Payroll period not found', 404);
        const period = periodResult.rows[0];
        if (!['Draft', 'Calculated'].includes(period.status)) {
            throw new AppError(`Payroll period cannot be recalculated while status is ${period.status}`, 409);
        }

        const runResult = await client.query(`
            INSERT INTO payroll_runs (period_id, status, calculated_by, calculated_at)
            VALUES ($1, 'Calculated', $2, CURRENT_TIMESTAMP)
            ON CONFLICT (period_id) DO UPDATE SET
                status = 'Calculated',
                calculated_by = EXCLUDED.calculated_by,
                calculated_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [periodId, getUserId(req)]);
        const run = runResult.rows[0];

        await client.query('DELETE FROM payroll_employee_items WHERE run_id = $1::uuid', [run.run_id]);

        const inputs = await loadCalculationInputs(client, period);
        const totals = {
            employeeCount: 0,
            gross: 0,
            deductions: 0,
            penalties: 0,
            net: 0
        };
        const claimedPenaltyIds = [];

        for (const employee of inputs.employees) {
            const attendance = inputs.attendanceByUser.get(employee.user_id) || {
                log_count: 0,
                days_worked: 0,
                hours_worked: 0,
                logs: []
            };
            const salaryType = employee.salary_type || 'Monthly';
            const baseSalary = Number(employee.base_salary || employee.legacy_salary || 0);
            const hourlyRate = Number(employee.hourly_rate || 0);
            const hoursWorked = Number(attendance.hours_worked || 0);
            const periodDays = inclusiveDays(period.start_date, period.end_date);
            const profileFrom = employee.effective_from || period.start_date;
            const profileTo = employee.effective_to || period.end_date;
            const payableDays = salaryType === 'Monthly'
                ? overlapDays(period.start_date, period.end_date, profileFrom, profileTo)
                : periodDays;
            const prorationFactor = salaryType === 'Monthly' ? payableDays / periodDays : 1;
            const baseGross = salaryType === 'Hourly'
                ? roundMoney(hourlyRate * hoursWorked)
                : roundMoney(baseSalary * prorationFactor);
            const standardHours = Number(employee.standard_hours_per_day || 8) * Number(employee.standard_days_per_period || 22);
            const standardDays = Number(employee.standard_days_per_period || periodDays);
            const contextBase = {
                baseGross,
                gross: baseGross,
                hourlyRate,
                overtimeHours: Math.max(0, hoursWorked - standardHours),
                absenceDays: Number(attendance.absent_days || 0) + Number(attendance.half_days || 0),
                lateMinutes: 0,
                dailyRate: standardDays > 0 ? roundMoney(baseSalary / standardDays) : 0
            };
            const ruleEarningLines = inputs.rules
                .filter((rule) => ['Allowance', 'Overtime'].includes(rule.rule_type))
                .map((rule) => ({
                    type: 'Earning',
                    sourceType: 'payroll_rules',
                    sourceId: rule.rule_id,
                    description: rule.name,
                    amount: calculateRuleAmount(rule, contextBase),
                    taxable: Boolean(rule.taxable)
                }))
                .filter((line) => line.amount > 0);
            const gross = roundMoney(baseGross + sumAmount(ruleEarningLines));
            const contextWithGross = { ...contextBase, gross };
            const ruleControlLines = inputs.rules
                .filter((rule) => ['Deduction', 'Late', 'EarlyLeave', 'Absence', 'Penalty'].includes(rule.rule_type))
                .map((rule) => ({
                    type: ruleLineType(rule.rule_type),
                    sourceType: 'payroll_rules',
                    sourceId: rule.rule_id,
                    description: rule.name,
                    amount: calculateRuleAmount(rule, contextWithGross),
                    taxable: Boolean(rule.taxable)
                }))
                .filter((line) => line.amount > 0);
            const employerContributionLines = inputs.rules
                .filter((rule) => rule.rule_type === 'EmployerContribution')
                .map((rule) => ({
                    type: 'EmployerContribution',
                    sourceType: 'payroll_rules',
                    sourceId: rule.rule_id,
                    description: rule.name,
                    amount: calculateRuleAmount(rule, contextWithGross),
                    taxable: Boolean(rule.taxable)
                }))
                .filter((line) => line.amount > 0);

            const employeeDeductions = inputs.deductionsByUser.get(employee.user_id) || [];
            const employeePenalties = inputs.penaltiesByUser.get(employee.user_id) || [];
            const requestedDeductionLines = [
                ...employeeDeductions.map((deduction) => ({
                type: 'Deduction',
                sourceType: 'employee_deductions',
                sourceId: deduction.deduction_id,
                description: deduction.name,
                amount: calculateDeductionAmount(deduction, gross),
                taxable: false
                })),
                ...ruleControlLines.filter((line) => line.type === 'Deduction')
            ].filter((line) => line.amount > 0);
            const requestedPenaltyLines = [
                ...employeePenalties.map((penalty) => ({
                type: 'Penalty',
                sourceType: 'employee_penalties',
                sourceId: penalty.penalty_id,
                description: penalty.penalty_type,
                amount: roundMoney(penalty.amount),
                taxable: false
                })),
                ...ruleControlLines.filter((line) => line.type === 'Penalty')
            ].filter((line) => line.amount > 0);
            const deductionLines = capLineAmounts(requestedDeductionLines, gross);
            const totalDeductions = sumAmount(deductionLines);
            const penaltyLines = capLineAmounts(requestedPenaltyLines, roundMoney(gross - totalDeductions));

            const totalPenalties = sumAmount(penaltyLines);
            const netPay = Math.max(0, roundMoney(gross - totalDeductions - totalPenalties));
            const unappliedControls = roundMoney(
                [...deductionLines, ...penaltyLines].reduce((sum, line) => sum + Number(line.unappliedAmount || 0), 0)
            );

            const itemResult = await client.query(`
                INSERT INTO payroll_employee_items (
                    run_id, user_id, compensation_profile_id, gross_earnings, total_deductions,
                    total_penalties, net_pay, attendance_snapshot, calculation_snapshot
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
                RETURNING *
            `, [
                run.run_id,
                employee.user_id,
                employee.profile_id || null,
                gross,
                totalDeductions,
                totalPenalties,
                netPay,
                JSON.stringify(attendance),
                JSON.stringify({
                    salaryType,
                    baseSalary,
                    baseGross,
                    hourlyRate,
                    hoursWorked,
                    prorationFactor,
                    payableDays,
                    periodDays,
                    overtimeHours: contextBase.overtimeHours,
                    absenceDays: contextBase.absenceDays,
                    requestedDeductions: sumAmount(requestedDeductionLines),
                    requestedPenalties: sumAmount(requestedPenaltyLines),
                    unappliedControls,
                    formula: salaryType === 'Hourly' ? 'hourly_rate * hours_worked' : 'base_salary * proration_factor'
                })
            ]);
            const item = itemResult.rows[0];

            const earningLines = [{
                type: 'Earning',
                sourceType: employee.profile_id ? 'employee_compensation_profiles' : 'employee_profiles',
                sourceId: employee.profile_id || null,
                description: salaryType === 'Hourly' ? 'Hourly earnings' : 'Base salary',
                amount: baseGross,
                taxable: true
            }];

            for (const line of [...earningLines, ...ruleEarningLines, ...deductionLines, ...penaltyLines, ...employerContributionLines]) {
                if (Number(line.amount || 0) <= 0) continue;
                await client.query(`
                    INSERT INTO payroll_line_items (
                        run_id, payroll_employee_item_id, user_id, item_type, source_type,
                        source_id, description, amount, taxable
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [run.run_id, item.item_id, employee.user_id, line.type, line.sourceType, line.sourceId, line.description, line.amount, line.taxable]);
            }

            claimedPenaltyIds.push(...penaltyLines.map((line) => line.sourceId).filter(Boolean));
            totals.employeeCount += 1;
            totals.gross += gross;
            totals.deductions += totalDeductions;
            totals.penalties += totalPenalties;
            totals.net += netPay;
        }

        if (claimedPenaltyIds.length) {
            await client.query(`
                UPDATE employee_penalties
                SET payroll_period_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE penalty_id = ANY($2::uuid[])
                  AND payroll_period_id IS NULL
            `, [periodId, claimedPenaltyIds]);
        }

        const updatedRun = await client.query(`
            UPDATE payroll_runs
            SET employee_count = $2,
                total_gross = $3,
                total_deductions = $4,
                total_penalties = $5,
                total_net = $6,
                status = 'Calculated',
                updated_at = CURRENT_TIMESTAMP
            WHERE run_id = $1
            RETURNING *
        `, [run.run_id, totals.employeeCount, roundMoney(totals.gross), roundMoney(totals.deductions), roundMoney(totals.penalties), roundMoney(totals.net)]);

        await client.query(`
            UPDATE payroll_periods
            SET status = 'Calculated',
                total_gross = $2,
                total_deductions = $3,
                total_penalties = $4,
                total_net = $5,
                updated_at = CURRENT_TIMESTAMP
            WHERE period_id = $1
        `, [periodId, roundMoney(totals.gross), roundMoney(totals.deductions), roundMoney(totals.penalties), roundMoney(totals.net)]);

        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, previous_status, new_status, details, changed_by)
            VALUES ('payroll_run', $1, 'CALCULATE_PAYROLL', $2, 'Calculated', $3::jsonb, $4)
        `, [run.run_id, period.status, JSON.stringify(totals), getUserId(req)]);

        await client.query('COMMIT');
        res.json(updatedRun.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

const transitionMap = {
    Reviewed: ['Calculated'],
    Approved: ['Reviewed'],
    Paid: ['Approved'],
    Locked: ['Paid'],
    Cancelled: ['Draft', 'Calculated', 'Reviewed']
};

const updatePayrollRunStatus = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { runId } = req.params;
        const data = req.body;
        await client.query('BEGIN');

        const runResult = await client.query(`
            SELECT r.*, p.period_id, p.status AS period_status, p.branch_id, p.currency_code, p.name AS period_name
            FROM payroll_runs r
            JOIN payroll_periods p ON p.period_id = r.period_id
            WHERE r.run_id = $1::uuid
            FOR UPDATE
        `, [runId]);
        if (!runResult.rows.length) throw new AppError('Payroll run not found', 404);
        const run = runResult.rows[0];
        if (data.status === 'Paid' && run.status === 'Paid') {
            const replay = await client.query(
                'SELECT * FROM payroll_payments WHERE idempotency_key = $1::uuid AND run_id = $2::uuid FOR UPDATE',
                [data.idempotencyKey, runId]
            );
            if (replay.rows.length) {
                await client.query('COMMIT');
                return res.json(run);
            }
        }
        const allowedFrom = transitionMap[data.status] || [];
        if (!allowedFrom.includes(run.status)) {
            throw new AppError(`Cannot move payroll from ${run.status} to ${data.status}`, 409);
        }
        if (run.period_status !== run.status) {
            throw new AppError('Payroll period and run statuses are out of sync; recalculate or repair before transition', 409);
        }

        const userId = getUserId(req);
        const makerCheckerOverride = assertMakerChecker({
            run,
            status: data.status,
            userId,
            role: req.user?.role,
            notes: data.notes
        });
        if (data.status === 'Paid') {
            const amount = roundMoney(data.paidAmount ?? run.total_net);
            if (amount !== roundMoney(run.total_net)) {
                throw new AppError('Paid amount must match payroll net total', 400);
            }
            const existingPayment = await client.query(
                'SELECT * FROM payroll_payments WHERE idempotency_key = $1::uuid FOR UPDATE',
                [data.idempotencyKey]
            );
            if (existingPayment.rows.length
                && (existingPayment.rows[0].run_id !== runId || roundMoney(existingPayment.rows[0].paid_amount) !== amount)) {
                throw new AppError('Idempotency key was already used for a different payroll payment', 409);
            }

            const paymentMethod = data.paymentMethod || 'BankTransfer';
            const paidDate = data.paidDate || new Date().toISOString().slice(0, 10);
            const postingDate = await lockFinancialBusinessDate(client, {
                businessDate: paidDate,
                branchId: run.branch_id || DEFAULT_BRANCH_ID
            });
            const paymentResult = existingPayment.rows.length
                ? existingPayment
                : await client.query(`
                    INSERT INTO payroll_payments (
                        run_id, payment_method, reference_number, paid_amount, paid_by,
                        idempotency_key, notes, business_date, branch_id, currency_code
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING *
                `, [
                    runId,
                    paymentMethod,
                    data.referenceNumber || null,
                    amount,
                    userId,
                    data.idempotencyKey,
                    data.notes || null,
                    postingDate.businessDate,
                    postingDate.branchId,
                    run.currency_code || DEFAULT_CURRENCY
                ]);
            const payment = paymentResult.rows[0];

            const journalEntries = payrollPaymentJournalEntries(run, paymentMethod);
            if (journalEntries.length) {
                const batch = await postJournalBatch(client, {
                    sourceType: 'PayrollPayment',
                    sourceId: payment.payment_id,
                    businessDate: postingDate.businessDate,
                    branchId: postingDate.branchId,
                    currencyCode: payment.currency_code || run.currency_code || DEFAULT_CURRENCY,
                    description: `Payroll payment - ${run.period_name || run.period_id}`,
                    userId,
                    entries: journalEntries
                });
                await client.query(
                    'UPDATE payroll_payments SET journal_batch_id = $1 WHERE payment_id = $2',
                    [batch.batch_id, payment.payment_id]
                );
            }

            await client.query(`
                UPDATE payroll_employee_items SET status = 'Paid', updated_at = CURRENT_TIMESTAMP WHERE run_id = $1::uuid
            `, [runId]);
            await applyPaidDeductionBalances(client, runId, userId);
            await client.query(`
                UPDATE employee_penalties p
                SET status = 'Applied', applied_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                FROM payroll_line_items li
                WHERE li.source_type = 'employee_penalties'
                  AND li.source_id = p.penalty_id
                  AND li.run_id = $1::uuid
                  AND p.status = 'Approved'
            `, [runId]);
        }

        const columnByStatus = {
            Reviewed: ['reviewed_by', 'reviewed_at'],
            Approved: ['approved_by', 'approved_at'],
            Paid: ['paid_by', 'paid_at'],
            Locked: ['locked_by', 'locked_at']
        };
        const statusColumns = columnByStatus[data.status];
        let runUpdate = `
            UPDATE payroll_runs
            SET status = $2::varchar(30),
                updated_at = CURRENT_TIMESTAMP
        `;
        const params = [runId, data.status];
        if (statusColumns) {
            params.push(userId);
            runUpdate += `, ${statusColumns[0]} = $${params.length}::uuid`;
            runUpdate += `, ${statusColumns[1]} = CURRENT_TIMESTAMP`;
        }
        runUpdate += ` WHERE run_id = $1::uuid RETURNING *`;
        const updatedRun = await client.query(runUpdate, params);

        let periodUpdate = `
            UPDATE payroll_periods
            SET status = $2::varchar(30),
                updated_at = CURRENT_TIMESTAMP
        `;
        const periodParams = [run.period_id, data.status];
        if (statusColumns) {
            periodParams.push(userId);
            periodUpdate += `, ${statusColumns[0]} = $${periodParams.length}::uuid`;
            periodUpdate += `, ${statusColumns[1]} = CURRENT_TIMESTAMP`;
        }
        periodUpdate += ` WHERE period_id = $1::uuid`;
        await client.query(periodUpdate, periodParams);

        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, previous_status, new_status, details, changed_by)
            VALUES ('payroll_run', $1::uuid, 'STATUS_CHANGE', $2::varchar(30), $3::varchar(30), $4::jsonb, $5::uuid)
        `, [
            runId,
            run.status,
            data.status,
            JSON.stringify({
                paymentMethod: data.paymentMethod,
                referenceNumber: data.referenceNumber,
                notes: data.notes,
                makerCheckerOverride
            }),
            userId
        ]);

        await client.query('COMMIT');
        res.json(updatedRun.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

module.exports = {
    getPayrollOverview,
    getPayrollPeriods,
    createPayrollPeriod,
    getCompensationProfiles,
    createCompensationProfile,
    getPayrollRules,
    createPayrollRule,
    updatePayrollRuleStatus,
    getDeductions,
    createDeduction,
    updateDeductionStatus,
    getPenalties,
    createPenalty,
    updatePenaltyStatus,
    getPayrollRun,
    calculatePayroll,
    updatePayrollRunStatus,
    _private: {
        assertMakerChecker,
        calculateDeductionAmount,
        calculateRuleAmount,
        capLineAmounts,
        inclusiveDays,
        overlapDays,
        payrollPaymentJournalEntries
    }
};
