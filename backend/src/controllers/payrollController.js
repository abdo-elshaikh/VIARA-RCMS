const { AppError } = require('../middleware/errorHandler');
const Decimal = require('decimal.js');
const { logAction } = require('../services/auditService');
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

const roundMoney = (value) => {
    try {
        return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    } catch {
        return 0;
    }
};
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALLMENT_DEDUCTION_TYPES = new Set(['Installment', 'Advance', 'Loan']);
const PAYROLL_EMPLOYEE_ROLES = Object.freeze([
    'Admin', 'HR', 'Receptionist', 'Radiologist', 'Technician', 'Nurse',
    'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'
]);
const DEDUCTION_STATUS_TRANSITIONS = Object.freeze({
    Draft: new Set(['Approved', 'Cancelled']),
    Approved: new Set(['Paused', 'Cancelled']),
    Paused: new Set(['Approved', 'Cancelled'])
});
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
    if (rule.rule_type === 'Late' && context.lateMinutes <= 0) return 0;
    if (rule.rule_type === 'EarlyLeave' && context.earlyLeaveMinutes <= 0) return 0;
    if (rule.calculation_method === 'FixedAmount') return roundMoney(value);
    if (rule.calculation_method === 'PercentageOfBase') return roundMoney(context.baseGross * (value / 100));
    if (rule.calculation_method === 'PercentageOfGross') return roundMoney(context.gross * (value / 100));
    if (rule.calculation_method === 'HourlyMultiplier') {
        return roundMoney(context.overtimeHours * context.hourlyRate * Math.max(0, value - 1));
    }
    if (rule.calculation_method === 'PerDay') return roundMoney(context.absenceDays * context.dailyRate * value);
    if (rule.calculation_method === 'PerMinute') {
        const minutes = rule.rule_type === 'EarlyLeave' ? context.earlyLeaveMinutes : context.lateMinutes;
        return roundMoney(minutes * value);
    }
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
    const employerContributions = moneyNumber(run.total_employer_contributions);
    const net = moneyNumber(run.total_net);
    const [settlementCode, settlementName] = paymentAccount(paymentMethod);
    return [
        gross > 0 && { accountCode: '6100', accountName: 'Salaries and wages expense', debit: gross, credit: 0 },
        net > 0 && { accountCode: settlementCode, accountName: settlementName, debit: 0, credit: net },
        deductions > 0 && { accountCode: '2150', accountName: 'Payroll deductions payable', debit: 0, credit: deductions },
        penalties > 0 && { accountCode: '4200', accountName: 'Staff penalty recoveries', debit: 0, credit: penalties },
        employerContributions > 0 && { accountCode: '6110', accountName: 'Employer payroll contributions expense', debit: employerContributions, credit: 0 },
        employerContributions > 0 && { accountCode: '2160', accountName: 'Employer contributions payable', debit: 0, credit: employerContributions }
    ].filter(Boolean);
};

const getPayrollEmployees = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT u.user_id, u.full_name, u.email, u.role, u.is_active,
                   ep.employee_id, ep.department, ep.job_title, ep.hire_date,
                   ep.termination_date, ep.employment_status
            FROM users u
            JOIN employee_profiles ep ON ep.user_id = u.user_id
            WHERE u.role = ANY($1::user_role[])
            ORDER BY u.full_name ASC
        `, [PAYROLL_EMPLOYEE_ROLES]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getPayrollOverview = (db) => async (req, res, next) => {
    try {
        const { currencyCode, branchId } = req.query;
        const params = [];
        let filters = `WHERE status != 'Cancelled'`;
        if (currencyCode) {
            params.push(currencyCode);
            filters += ` AND currency_code = $${params.length}`;
        }
        if (branchId) {
            params.push(branchId);
            filters += ` AND branch_id = $${params.length}::uuid`;
        }
        const result = await db.query(`
            SELECT
                COUNT(*)::int AS periods,
                COUNT(*) FILTER (WHERE status IN ('Draft', 'Calculated', 'Reviewed'))::int AS open_periods,
                COALESCE(SUM(total_gross), 0)::numeric AS total_gross,
                COALESCE(SUM(total_deductions), 0)::numeric AS total_deductions,
                COALESCE(SUM(total_penalties), 0)::numeric AS total_penalties,
                COALESCE(SUM(total_employer_contributions), 0)::numeric AS total_employer_contributions,
                COALESCE(SUM(total_net), 0)::numeric AS total_net,
                COALESCE((
                    SELECT COUNT(*) FROM employee_penalties WHERE status IN ('Draft', 'Pending Approval')
                ), 0)::int AS pending_penalties,
                COALESCE((
                    SELECT COUNT(*) FROM employee_deductions WHERE status IN ('Draft', 'Paused')
                ), 0)::int AS pending_deductions
            FROM payroll_periods
            ${filters}
        `, params);
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
                   r.total_penalties AS run_total_penalties,
                   r.total_employer_contributions AS run_total_employer_contributions,
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
    let client;
    try {
        const data = req.body;
        const branchId = data.branchId || DEFAULT_BRANCH_ID;
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11704))', [branchId]);
        const overlap = await client.query(`
            SELECT period_id, name
            FROM payroll_periods
            WHERE status != 'Cancelled'
              AND branch_id = $3::uuid
              AND daterange(start_date, end_date, '[]') && daterange($1::date, $2::date, '[]')
            LIMIT 1
        `, [data.startDate, data.endDate, branchId]);
        if (overlap.rows.length) {
            throw new AppError(`Payroll period overlaps with ${overlap.rows[0].name}`, 409);
        }

        const finalizedOverlap = await client.query(`
            SELECT 1
            FROM financial_periods
            WHERE status = 'Finalized'
              AND branch_id = $3::uuid
              AND daterange(start_date, end_date, '[]') && daterange($1::date, $2::date, '[]')
            LIMIT 1
        `, [data.startDate, data.endDate, branchId]);
        if (finalizedOverlap.rows.length) {
            throw new AppError('Payroll period overlaps with a finalized financial period', 409);
        }

        const result = await client.query(`
            INSERT INTO payroll_periods (name, start_date, end_date, currency_code, notes, created_by, branch_id)
            VALUES ($1, $2, $3, UPPER($4), $5, $6, $7::uuid)
            RETURNING *
        `, [data.name, data.startDate, data.endDate, data.currencyCode, data.notes, getUserId(req), branchId]);
        await logAction(client, {
            userId: getUserId(req), action: 'PAYROLL_PERIOD_CREATED', resourceId: result.rows[0].period_id,
            resourceTable: 'payroll_periods', ipAddress: req.ip,
            details: { name: data.name, startDate: data.startDate, endDate: data.endDate, branchId }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error?.code === '23P01') return next(new AppError('Payroll period overlaps an existing active period', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const cancelPayrollPeriod = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { periodId } = req.params;
        const userId = getUserId(req);
        await client.query('BEGIN');
        const existing = await client.query(
            'SELECT * FROM payroll_periods WHERE period_id = $1::uuid FOR UPDATE',
            [periodId]
        );
        if (!existing.rows.length) throw new AppError('Payroll period not found', 404);
        if (existing.rows[0].status !== 'Draft') {
            throw new AppError('Only a Draft period without a payroll run can be cancelled here', 409);
        }
        const run = await client.query('SELECT run_id FROM payroll_runs WHERE period_id = $1::uuid', [periodId]);
        if (run.rows.length) throw new AppError('Cancel this period through its payroll run workflow', 409);

        const updated = await client.query(`
            UPDATE payroll_periods
            SET status = 'Cancelled', notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $2), updated_at = CURRENT_TIMESTAMP
            WHERE period_id = $1::uuid
            RETURNING *
        `, [periodId, req.body.notes]);
        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, previous_status, new_status, details, changed_by)
            VALUES ('payroll_period', $1::uuid, 'STATUS_CHANGE', 'Draft', 'Cancelled', $2::jsonb, $3::uuid)
        `, [periodId, JSON.stringify({ notes: req.body.notes }), userId]);
        await logAction(client, {
            userId,
            action: 'PAYROLL_PERIOD_CANCELLED',
            resourceId: periodId,
            resourceTable: 'payroll_periods',
            ipAddress: req.ip,
            details: { previousStatus: 'Draft', notes: req.body.notes },
            required: true
        });
        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

const getCompensationProfiles = (db) => async (req, res, next) => {
    try {
        const { userId, limit = 100 } = req.query;
        const pageLimit = boundedInteger(limit);
        const params = [PAYROLL_EMPLOYEE_ROLES];
        let query = `
            SELECT cp.*, u.full_name AS employee_name, u.email, u.role
            FROM employee_compensation_profiles cp
            JOIN users u ON u.user_id = cp.user_id
            WHERE u.role = ANY($1::user_role[])
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
    let client;
    try {
        const data = req.body;
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11703))', [data.userId]);
        const employee = await client.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND role = ANY($2::user_role[])',
            [data.userId, PAYROLL_EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Eligible employee not found', 400);
        const overlap = await client.query(`
            SELECT profile_id
            FROM employee_compensation_profiles
            WHERE user_id = $1
              AND is_active = TRUE
              AND daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]')
                  && daterange($2::date, COALESCE($3::date, '9999-12-31'::date), '[]')
            LIMIT 1
        `, [data.userId, data.effectiveFrom, data.effectiveTo || null]);
        if (overlap.rows.length) {
            throw new AppError('Employee already has an active compensation profile in this date range', 409);
        }

        const result = await client.query(`
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
        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, new_status, details, changed_by)
            VALUES ('compensation_profile', $1, 'CREATED', $2, $3::jsonb, $4)
        `, [result.rows[0].profile_id, data.isActive ? 'Active' : 'Inactive', JSON.stringify({
            userId: data.userId,
            salaryType: data.salaryType,
            effectiveFrom: data.effectiveFrom,
            effectiveTo: data.effectiveTo || null
        }), getUserId(req)]);
        await logAction(client, {
            userId: getUserId(req), action: 'COMPENSATION_PROFILE_CREATED', resourceId: result.rows[0].profile_id,
            resourceTable: 'employee_compensation_profiles', ipAddress: req.ip,
            details: { userId: data.userId, salaryType: data.salaryType, effectiveFrom: data.effectiveFrom }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error?.code === '23P01') return next(new AppError('Employee already has an active compensation profile in this date range', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateCompensationProfile = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { profileId } = req.params;
        const data = req.body;
        const userId = getUserId(req);
        await client.query('BEGIN');
        const existing = await client.query(
            'SELECT * FROM employee_compensation_profiles WHERE profile_id = $1::uuid FOR UPDATE',
            [profileId]
        );
        if (!existing.rows.length) throw new AppError('Compensation profile not found', 404);
        if (dateOnly(data.effectiveTo) < dateOnly(existing.rows[0].effective_from)) {
            throw new AppError('Effective end date must be on or after effective start date', 400);
        }
        const updated = await client.query(`
            UPDATE employee_compensation_profiles
            SET effective_to = $2::date,
                is_active = $3,
                notes = COALESCE($4, notes),
                updated_at = CURRENT_TIMESTAMP
            WHERE profile_id = $1::uuid
            RETURNING *
        `, [profileId, data.effectiveTo, data.isActive, data.notes || null]);
        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, previous_status, new_status, details, changed_by)
            VALUES ('compensation_profile', $1, 'CLOSED', $2, $3, $4::jsonb, $5)
        `, [profileId, existing.rows[0].is_active ? 'Active' : 'Inactive', data.isActive ? 'Active' : 'Inactive', JSON.stringify({
            previousEffectiveTo: existing.rows[0].effective_to,
            effectiveTo: data.effectiveTo,
            notes: data.notes || null
        }), userId]);
        await logAction(client, {
            userId, action: 'COMPENSATION_PROFILE_UPDATED', resourceId: profileId,
            resourceTable: 'employee_compensation_profiles', ipAddress: req.ip,
            details: { effectiveTo: data.effectiveTo, isActive: data.isActive }, required: true
        });
        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        if (error?.code === '23P01') return next(new AppError('Compensation end date overlaps another active profile', 409));
        next(error);
    } finally {
        client.release();
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
    let client;
    try {
        const data = req.body;
        const status = 'Pending Approval';
        const isActive = false;
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(`
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
            null,
            null
        ]);
        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, new_status, details, changed_by)
            VALUES ('payroll_rule', $1, 'CREATED', 'Pending Approval', $2::jsonb, $3)
        `, [result.rows[0].rule_id, JSON.stringify({ ruleType: data.ruleType, calculationMethod: data.calculationMethod, value: data.value }), getUserId(req)]);
        await logAction(client, {
            userId: getUserId(req), action: 'PAYROLL_RULE_CREATED', resourceId: result.rows[0].rule_id,
            resourceTable: 'payroll_rules', ipAddress: req.ip,
            details: { ruleType: data.ruleType, calculationMethod: data.calculationMethod }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
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
        if (req.user?.role !== 'Developer' && rule.created_by === userId) {
            throw new AppError('The payroll rule creator cannot approve or reject their own request', 403);
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

        await logAction(client, {
            userId,
            action: 'PAYROLL_RULE_STATUS_CHANGED',
            resourceId: ruleId,
            resourceTable: 'payroll_rules',
            ipAddress: req.ip,
            details: { previousStatus: rule.status, newStatus: status, notes: notes || null },
            required: true
        });

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
        const params = [PAYROLL_EMPLOYEE_ROLES];
        let query = `
            SELECT d.*, u.full_name AS employee_name, creator.full_name AS created_by_name, approver.full_name AS approved_by_name
            FROM employee_deductions d
            JOIN users u ON u.user_id = d.user_id
            LEFT JOIN users creator ON creator.user_id = d.created_by
            LEFT JOIN users approver ON approver.user_id = d.approved_by
            WHERE u.role = ANY($1::user_role[])
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
    let client;
    try {
        const data = req.body;
        client = await db.connect();
        await client.query('BEGIN');
        const employee = await client.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND role = ANY($2::user_role[])',
            [data.userId, PAYROLL_EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Eligible employee not found', 400);
        const result = await client.query(`
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
            null,
            null
        ]);
        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, new_status, details, changed_by)
            VALUES ('employee_deduction', $1, 'CREATED', 'Draft', $2::jsonb, $3)
        `, [result.rows[0].deduction_id, JSON.stringify({ userId: data.userId, deductionType: data.deductionType, amount: data.amount, percentage: data.percentage }), getUserId(req)]);
        await logAction(client, {
            userId: getUserId(req), action: 'PAYROLL_DEDUCTION_CREATED', resourceId: result.rows[0].deduction_id,
            resourceTable: 'employee_deductions', ipAddress: req.ip,
            details: { userId: data.userId, deductionType: data.deductionType }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
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
        const allowedStatuses = DEDUCTION_STATUS_TRANSITIONS[deduction.status] || new Set();
        if (!allowedStatuses.has(status)) {
            throw new AppError(`Deduction cannot move from ${deduction.status} to ${status}`, 409);
        }
        if (deduction.payroll_period_id && status !== 'Approved') {
            throw new AppError('Deduction is reserved by a calculated payroll period; cancel or recalculate that run first', 409);
        }
        if (deduction.status === 'Draft' && req.user?.role !== 'Developer' && deduction.created_by === userId) {
            throw new AppError('The deduction creator cannot approve or reject their own request', 403);
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

        await logAction(client, {
            userId,
            action: 'PAYROLL_DEDUCTION_STATUS_CHANGED',
            resourceId: deductionId,
            resourceTable: 'employee_deductions',
            ipAddress: req.ip,
            details: { previousStatus: deduction.status, newStatus: status, notes: notes || null },
            required: true
        });

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
        const params = [PAYROLL_EMPLOYEE_ROLES];
        let query = `
            SELECT p.*, u.full_name AS employee_name, creator.full_name AS created_by_name, approver.full_name AS approved_by_name
            FROM employee_penalties p
            JOIN users u ON u.user_id = p.user_id
            LEFT JOIN users creator ON creator.user_id = p.created_by
            LEFT JOIN users approver ON approver.user_id = p.approved_by
            WHERE u.role = ANY($1::user_role[])
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
    let client;
    try {
        const data = req.body;
        client = await db.connect();
        await client.query('BEGIN');
        const employee = await client.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND role = ANY($2::user_role[])',
            [data.userId, PAYROLL_EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Eligible employee not found', 400);
        if (data.attendanceId) {
            const attendance = await client.query(
                'SELECT 1 FROM attendance_logs WHERE log_id = $1::uuid AND user_id = $2::uuid',
                [data.attendanceId, data.userId]
            );
            if (!attendance.rows.length) throw new AppError('Attendance record does not belong to the selected employee', 400);
        }
        if (data.payrollPeriodId) {
            const period = await client.query(
                "SELECT period_id FROM payroll_periods WHERE period_id = $1::uuid AND status IN ('Draft', 'Calculated') FOR UPDATE",
                [data.payrollPeriodId]
            );
            if (!period.rows.length) throw new AppError('Penalty can only target an open Draft or Calculated payroll period', 409);
        }
        const result = await client.query(`
            INSERT INTO employee_penalties (
                user_id, attendance_id, payroll_period_id, penalty_type, amount, reason,
                source, status, remaining_amount, created_by, approved_by, approved_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending Approval', $5, $8, NULL, NULL)
            RETURNING *
        `, [
            data.userId,
            data.attendanceId || null,
            data.payrollPeriodId || null,
            data.penaltyType,
            data.amount,
            data.reason,
            data.source,
            getUserId(req)
        ]);
        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, new_status, details, changed_by)
            VALUES ('employee_penalty', $1, 'CREATED', 'Pending Approval', $2::jsonb, $3)
        `, [result.rows[0].penalty_id, JSON.stringify({ userId: data.userId, amount: data.amount, source: data.source }), getUserId(req)]);
        await logAction(client, {
            userId: getUserId(req), action: 'PAYROLL_PENALTY_CREATED', resourceId: result.rows[0].penalty_id,
            resourceTable: 'employee_penalties', ipAddress: req.ip,
            details: { userId: data.userId, amount: data.amount, source: data.source }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
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
        if (status === 'Approved' && penalty.payroll_period_id) {
            const period = await client.query(
                "SELECT period_id FROM payroll_periods WHERE period_id = $1::uuid AND status IN ('Draft', 'Calculated') FOR UPDATE",
                [penalty.payroll_period_id]
            );
            if (!period.rows.length) throw new AppError('Penalty target payroll period is no longer open for calculation', 409);
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

        await logAction(client, {
            userId,
            action: 'PAYROLL_PENALTY_STATUS_CHANGED',
            resourceId: penaltyId,
            resourceTable: 'employee_penalties',
            ipAddress: req.ip,
            details: { previousStatus: penalty.status, newStatus: status, notes: notes || null },
            required: true
        });

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

const groupRowsByUser = (rows) => rows.reduce((map, row) => {
    map.set(row.user_id, [...(map.get(row.user_id) || []), row]);
    return map;
}, new Map());

const cairoDateKey = (value) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const enumerateWeekdays = (startDate, endDate) => {
    const dates = [];
    const cursor = dateOnly(startDate);
    const end = dateOnly(endDate);
    while (cursor <= end) {
        const day = cursor.getUTCDay();
        if (day !== 5 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
};

const enumerateDates = (startDate, endDate) => {
    const dates = [];
    const cursor = dateOnly(startDate);
    const end = dateOnly(endDate);
    while (cursor <= end) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
};

const laterDate = (...values) => values
    .filter(Boolean)
    .map(dateOnly)
    .reduce((latest, value) => (!latest || value > latest ? value : latest), null);

const earlierDate = (...values) => values
    .filter(Boolean)
    .map(dateOnly)
    .reduce((earliest, value) => (!earliest || value < earliest ? value : earliest), null);

const monthlyAccrualFactor = (startDate, endDate) => {
    const start = dateOnly(startDate);
    const end = dateOnly(endDate);
    if (end < start) return 0;
    let total = new Decimal(0);
    const cursor = new Date(start);
    while (cursor <= end) {
        const daysInMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
        total = total.plus(new Decimal(1).div(daysInMonth));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return total.toNumber();
};

const proratedMonthlyAmount = (baseSalary, startDate, endDate) => {
    return roundMoney(new Decimal(baseSalary || 0).times(monthlyAccrualFactor(startDate, endDate)));
};

const dateFallsWithin = (value, startDate, endDate) => {
    const date = dateOnly(value);
    return date >= dateOnly(startDate) && date <= dateOnly(endDate);
};

const paidLeaveHoursForProfile = ({ profile, attendance, employee, period }) => {
    const segmentStart = laterDate(period.start_date, profile.effective_from, employee.hire_date);
    const segmentEnd = earlierDate(period.end_date, profile.effective_to, employee.termination_date);
    return roundMoney((attendance.paid_leave_shifts || []).reduce((sum, shift) => {
        const shiftDate = cairoDateKey(shift.start_time);
        if (!dateFallsWithin(shiftDate, segmentStart, segmentEnd)) return sum;
        const start = new Date(shift.period_start_time || shift.start_time);
        const end = new Date(shift.period_end_time || shift.end_time);
        return sum + Math.max(0, end - start) / 3600000;
    }, 0));
};

const unpaidLeaveDeductionForProfile = ({ profile, attendance, employee, period }) => {
    const segmentStart = laterDate(period.start_date, profile.effective_from, employee.hire_date);
    const segmentEnd = earlierDate(period.end_date, profile.effective_to, employee.termination_date);
    const eligibleDays = (attendance.unpaid_leave_dates || [])
        .filter((date) => dateFallsWithin(date, segmentStart, segmentEnd)).length;
    if (!eligibleDays || profile.salary_type !== 'Monthly') return 0;
    return roundMoney(new Decimal(profile.base_salary || 0)
        .div(Number(profile.standard_days_per_period || 22))
        .times(eligibleDays));
};

const summarizeAttendance = ({ attendance, shifts, leaves, periodStart, periodEnd }) => {
    const logs = Array.isArray(attendance?.logs) ? attendance.logs : [];
    const paidLeaveDates = new Set();
    const unpaidLeaveDates = new Set();
    const unpaidLeaveAllDates = new Set();
    for (const leave of leaves) {
        const clippedStart = laterDate(leave.start_date, periodStart);
        const clippedEnd = earlierDate(leave.end_date, periodEnd);
        if (clippedStart && clippedEnd && clippedStart <= clippedEnd) {
            if (leave.leave_type === 'Unpaid') {
                enumerateDates(clippedStart, clippedEnd).forEach((date) => unpaidLeaveAllDates.add(date));
                enumerateWeekdays(clippedStart, clippedEnd).forEach((date) => unpaidLeaveDates.add(date));
            } else {
                enumerateDates(clippedStart, clippedEnd).forEach((date) => paidLeaveDates.add(date));
            }
        }
    }

    const absentDates = new Set(unpaidLeaveDates);
    const unexcusedAbsentDates = new Set();
    const paidLeaveShifts = [];
    for (const shift of shifts) {
        const shiftDate = cairoDateKey(shift.start_time);
        const shiftStart = new Date(shift.start_time).getTime();
        const shiftEnd = new Date(shift.end_time).getTime();
        const covered = logs.some((log) => {
            if (!log.clockOut || log.status === 'Absent') return false;
            if (log.shiftId && log.shiftId === shift.shift_id) return true;
            const logStart = new Date(log.clockIn).getTime();
            const logEnd = new Date(log.clockOut).getTime();
            return logStart < shiftEnd && logEnd > shiftStart;
        });
        if (paidLeaveDates.has(shiftDate)) {
            if (!covered) paidLeaveShifts.push(shift);
            continue;
        }
        if (unpaidLeaveAllDates.has(shiftDate)) {
            if (!covered) {
                absentDates.add(shiftDate);
                unpaidLeaveDates.add(shiftDate);
            }
            continue;
        }
        if (!covered) {
            absentDates.add(shiftDate);
            unexcusedAbsentDates.add(shiftDate);
        }
    }

    return {
        ...attendance,
        hours_worked: Number(attendance?.hours_worked || 0),
        scheduled_hours: shifts.reduce((sum, shift) => sum + Math.max(
            0,
            new Date(shift.period_end_time || shift.end_time) - new Date(shift.period_start_time || shift.start_time)
        ) / 3600000, 0),
        absent_days: absentDates.size,
        unexcused_absent_days: unexcusedAbsentDates.size,
        half_days: Number(attendance?.half_days || 0),
        late_minutes: Number(attendance?.late_minutes || 0),
        early_leave_minutes: Number(attendance?.early_leave_minutes || 0),
        unpaid_leave_days: unpaidLeaveDates.size,
        unpaid_leave_dates: [...unpaidLeaveDates].sort(),
        approved_leave_days: paidLeaveDates.size,
        paid_leave_shifts: paidLeaveShifts,
        logs
    };
};

const loadCalculationInputs = async (client, period) => {
    const employees = await client.query(`
        SELECT u.user_id, u.full_name, u.email, u.role,
               ep.hire_date, ep.termination_date, ep.employment_status
        FROM users u
        JOIN employee_profiles ep ON ep.user_id = u.user_id
        WHERE u.role = ANY($3::user_role[])
          AND (ep.hire_date IS NULL OR ep.hire_date <= $2::date)
          AND (ep.termination_date IS NULL OR ep.termination_date >= $1::date)
        ORDER BY u.full_name ASC
    `, [period.start_date, period.end_date, PAYROLL_EMPLOYEE_ROLES]);

    const compensation = await client.query(`
        WITH bounds AS (
            SELECT ($1::date::timestamp AT TIME ZONE 'Africa/Cairo') AS period_start,
                   (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo') AS period_end
        )
        SELECT cp.*,
               COALESCE((
                   SELECT SUM(
                       GREATEST(0, EXTRACT(EPOCH FROM (
                           LEAST(
                               a.clock_out,
                               b.period_end,
                               ((COALESCE(cp.effective_to, $2::date) + 1)::timestamp AT TIME ZONE 'Africa/Cairo'),
                               ((COALESCE(ep.termination_date, $2::date) + 1)::timestamp AT TIME ZONE 'Africa/Cairo')
                           )
                           - GREATEST(
                               a.clock_in,
                               b.period_start,
                               (cp.effective_from::timestamp AT TIME ZONE 'Africa/Cairo'),
                               (COALESCE(ep.hire_date, $1::date)::timestamp AT TIME ZONE 'Africa/Cairo')
                           )
                       )) / 3600)
                   )
                   FROM attendance_logs a
                   WHERE a.user_id = cp.user_id
                     AND a.clock_out IS NOT NULL
                     AND a.status <> 'Absent'
                     AND a.clock_in < b.period_end
                     AND a.clock_out > b.period_start
               ), 0)::numeric AS profile_hours_worked
        FROM employee_compensation_profiles cp
        JOIN employee_profiles ep ON ep.user_id = cp.user_id
        CROSS JOIN bounds b
        WHERE cp.is_active = TRUE
          AND ((cp.salary_type = 'Monthly' AND cp.base_salary > 0)
               OR (cp.salary_type = 'Hourly' AND cp.hourly_rate > 0))
          AND cp.effective_from <= $2::date
          AND (cp.effective_to IS NULL OR cp.effective_to >= $1::date)
          AND (ep.hire_date IS NULL OR ep.hire_date <= $2::date)
          AND (ep.termination_date IS NULL OR ep.termination_date >= $1::date)
        ORDER BY cp.user_id, cp.effective_from ASC, cp.created_at ASC
    `, [period.start_date, period.end_date]);

    const attendance = await client.query(`
        WITH bounds AS (
            SELECT ($1::date::timestamp AT TIME ZONE 'Africa/Cairo') AS period_start,
                   (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo') AS period_end
        )
        SELECT a.user_id,
               COUNT(*)::int AS log_count,
               (COUNT(DISTINCT (a.clock_in AT TIME ZONE 'Africa/Cairo')::date)
                   FILTER (WHERE a.clock_out IS NOT NULL AND a.status <> 'Absent'))::int AS days_worked,
               COUNT(*) FILTER (WHERE a.status = 'Half-Day')::numeric * 0.5 AS half_days,
               COALESCE(SUM(CASE WHEN a.clock_out IS NULL OR a.status = 'Absent' THEN 0 ELSE
                   GREATEST(0, EXTRACT(EPOCH FROM (LEAST(a.clock_out, b.period_end) - GREATEST(a.clock_in, b.period_start))) / 3600)
               END), 0)::numeric AS hours_worked,
               COALESCE(SUM(a.late_minutes), 0)::numeric AS late_minutes,
               COALESCE(SUM(a.early_leave_minutes), 0)::numeric AS early_leave_minutes,
               COALESCE(jsonb_agg(jsonb_build_object(
                   'logId', a.log_id, 'shiftId', a.shift_id,
                   'clockIn', a.clock_in, 'clockOut', a.clock_out, 'status', a.status
               ) ORDER BY a.clock_in), '[]'::jsonb) AS logs
        FROM attendance_logs a
        CROSS JOIN bounds b
        WHERE a.clock_in < b.period_end
          AND (a.clock_out IS NULL OR a.clock_out > b.period_start)
        GROUP BY a.user_id
    `, [period.start_date, period.end_date]);

    const shifts = await client.query(`
        SELECT s.*,
               GREATEST(s.start_time, ($1::date::timestamp AT TIME ZONE 'Africa/Cairo')) AS period_start_time,
               LEAST(s.end_time, (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo')) AS period_end_time
        FROM staff_shifts s
        WHERE s.start_time < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo')
          AND s.end_time > ($1::date::timestamp AT TIME ZONE 'Africa/Cairo')
        ORDER BY s.start_time ASC
    `, [period.start_date, period.end_date]);

    const leaves = await client.query(`
        SELECT * FROM leave_requests
        WHERE status = 'Approved' AND start_date <= $2::date AND end_date >= $1::date
        ORDER BY start_date ASC
    `, [period.start_date, period.end_date]);

    const deductions = await client.query(`
        SELECT * FROM employee_deductions
        WHERE status = 'Approved'
          AND (
              (deduction_type = 'Percentage' AND percentage > 0 AND amount = 0)
              OR (
                  deduction_type <> 'Percentage' AND amount > 0
                  AND (
                      deduction_type NOT IN ('Installment', 'Advance', 'Loan')
                      OR (total_amount > 0
                          AND COALESCE(remaining_amount, total_amount) >= amount
                          AND COALESCE(remaining_amount, total_amount) <= total_amount)
                  )
              )
          )
          AND start_date <= $2::date
          AND (end_date IS NULL OR end_date >= $1::date)
          AND (payroll_period_id IS NULL OR payroll_period_id = $3::uuid)
        ORDER BY created_at ASC
        FOR UPDATE
    `, [period.start_date, period.end_date, period.period_id]);

    const penalties = await client.query(`
        SELECT * FROM employee_penalties
        WHERE status = 'Approved'
          AND remaining_amount > 0
          AND (payroll_period_id IS NULL OR payroll_period_id = $1::uuid)
        ORDER BY created_at ASC
        FOR UPDATE
    `, [period.period_id]);

    const rules = await client.query(`
        SELECT * FROM payroll_rules
        WHERE is_active = TRUE AND status = 'Approved'
          AND value > 0
          AND (calculation_method <> 'HourlyMultiplier' OR value > 1)
          AND (
              (rule_type = 'Overtime' AND calculation_method IN ('HourlyMultiplier', 'FixedAmount', 'PercentageOfBase'))
              OR (rule_type IN ('Late', 'EarlyLeave') AND calculation_method IN ('PerMinute', 'FixedAmount'))
              OR (rule_type = 'Absence' AND calculation_method IN ('PerDay', 'FixedAmount'))
              OR (rule_type IN ('Allowance', 'Deduction', 'Penalty', 'EmployerContribution')
                  AND calculation_method IN ('FixedAmount', 'PercentageOfBase', 'PercentageOfGross'))
          )
          AND effective_from <= $2::date
          AND (effective_to IS NULL OR effective_to >= $1::date)
        ORDER BY rule_type ASC, created_at ASC
    `, [period.start_date, period.end_date]);

    const attendanceMap = new Map(attendance.rows.map((row) => [row.user_id, row]));
    const shiftsByUser = groupRowsByUser(shifts.rows);
    const leavesByUser = groupRowsByUser(leaves.rows);
    return {
        employees: employees.rows,
        rules: rules.rows,
        compensationByUser: groupRowsByUser(compensation.rows),
        attendanceByUser: new Map(employees.rows.map((employee) => [employee.user_id, summarizeAttendance({
            attendance: attendanceMap.get(employee.user_id),
            shifts: shiftsByUser.get(employee.user_id) || [],
            leaves: leavesByUser.get(employee.user_id) || [],
            periodStart: period.start_date,
            periodEnd: period.end_date
        })])),
        deductionsByUser: groupRowsByUser(deductions.rows),
        penaltiesByUser: groupRowsByUser(penalties.rows)
    };
};

const calculateDeductionAmount = (deduction, gross) => {
    if (deduction.deduction_type === 'Percentage') {
        return roundMoney(gross * (Number(deduction.percentage || 0) / 100));
    }
    if (['Installment', 'Advance', 'Loan'].includes(deduction.deduction_type)) {
        const installment = Number(deduction.amount || 0);
        const remaining = Number(deduction.remaining_amount ?? deduction.total_amount ?? installment);
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
                payroll_period_id = NULL,
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
    await client.query(`
        UPDATE employee_deductions d
        SET payroll_period_id = NULL, updated_at = CURRENT_TIMESTAMP
        FROM payroll_line_items li
        WHERE li.run_id = $1::uuid
          AND li.source_type = 'employee_deductions'
          AND li.source_id = d.deduction_id
          AND d.deduction_type NOT IN ('Installment', 'Advance', 'Loan')
    `, [runId]);
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
            employerContributions: 0,
            net: 0
        };
        const claimedPenaltyIds = [];
        const claimedDeductionIds = [];

        const missingCompensation = inputs.employees.filter(
            (employee) => !(inputs.compensationByUser.get(employee.user_id) || []).length
        );
        if (missingCompensation.length) {
            const names = missingCompensation.slice(0, 5).map((employee) => employee.full_name).join(', ');
            throw new AppError(`Missing compensation profiles for ${names}${missingCompensation.length > 5 ? ' and others' : ''}`, 409);
        }

        for (const employee of inputs.employees) {
            const attendance = inputs.attendanceByUser.get(employee.user_id) || {
                log_count: 0,
                days_worked: 0,
                hours_worked: 0,
                logs: []
            };
            const compensationProfiles = inputs.compensationByUser.get(employee.user_id) || [];
            const hoursWorked = Number(attendance.hours_worked || 0);
            const periodDays = inclusiveDays(period.start_date, period.end_date);
            const profileEarningLines = compensationProfiles.map((profile) => {
                const segmentStart = laterDate(period.start_date, profile.effective_from, employee.hire_date);
                const segmentEnd = earlierDate(period.end_date, profile.effective_to, employee.termination_date);
                const segmentDays = overlapDays(
                    period.start_date,
                    period.end_date,
                    segmentStart,
                    segmentEnd
                );
                const proration = segmentDays / periodDays;
                const paidLeaveHours = profile.salary_type === 'Hourly'
                    ? paidLeaveHoursForProfile({ profile, attendance, employee, period })
                    : 0;
                const amount = profile.salary_type === 'Hourly'
                    ? roundMoney(Number(profile.hourly_rate || 0) * (Number(profile.profile_hours_worked || 0) + paidLeaveHours))
                    : proratedMonthlyAmount(profile.base_salary, segmentStart, segmentEnd);
                return {
                    type: 'Earning',
                    sourceType: 'employee_compensation_profiles',
                    sourceId: profile.profile_id,
                    description: profile.salary_type === 'Hourly' ? 'Hourly earnings' : 'Base salary',
                    amount,
                    taxable: true,
                    segmentDays,
                    proration,
                    paidLeaveHours,
                    salaryType: profile.salary_type
                };
            });
            const baseGross = sumAmount(profileEarningLines);
            const monthlyProfiles = compensationProfiles.filter((profile) => profile.salary_type === 'Monthly');
            const hourlyProfiles = compensationProfiles.filter((profile) => profile.salary_type === 'Hourly');
            const payableDays = monthlyProfiles.reduce((sum, profile) => sum + overlapDays(
                period.start_date,
                period.end_date,
                laterDate(profile.effective_from, employee.hire_date),
                earlierDate(profile.effective_to || period.end_date, employee.termination_date || period.end_date)
            ), 0);
            const salaryType = monthlyProfiles.length && hourlyProfiles.length ? 'Mixed'
                : hourlyProfiles.length ? 'Hourly' : 'Monthly';
            const hourlyBase = hourlyProfiles.reduce((sum, profile) => {
                const paidLeaveHours = paidLeaveHoursForProfile({ profile, attendance, employee, period });
                return sum + Number(profile.hourly_rate || 0) * (Number(profile.profile_hours_worked || 0) + paidLeaveHours);
            }, 0);
            const hourlyProfileHours = hourlyProfiles.reduce((sum, profile) => (
                sum + Number(profile.profile_hours_worked || 0)
                + paidLeaveHoursForProfile({ profile, attendance, employee, period })
            ), 0);
            const hourlyRate = hourlyProfileHours > 0 ? hourlyBase / hourlyProfileHours : 0;
            const standardDays = compensationProfiles.reduce((sum, profile) => {
                const segmentStart = laterDate(profile.effective_from, employee.hire_date, period.start_date);
                const segmentEnd = earlierDate(profile.effective_to || period.end_date, employee.termination_date || period.end_date, period.end_date);
                const segmentDays = overlapDays(
                    period.start_date,
                    period.end_date,
                    segmentStart,
                    segmentEnd
                );
                const segmentFactor = profile.salary_type === 'Monthly'
                    ? monthlyAccrualFactor(segmentStart, segmentEnd)
                    : segmentDays / periodDays;
                return sum + Number(profile.standard_days_per_period || 22) * segmentFactor;
            }, 0);
            const profileStandardHours = compensationProfiles.reduce((sum, profile) => {
                const segmentStart = laterDate(profile.effective_from, employee.hire_date, period.start_date);
                const segmentEnd = earlierDate(profile.effective_to || period.end_date, employee.termination_date || period.end_date, period.end_date);
                const segmentDays = overlapDays(
                    period.start_date,
                    period.end_date,
                    segmentStart,
                    segmentEnd
                );
                const segmentFactor = profile.salary_type === 'Monthly'
                    ? monthlyAccrualFactor(segmentStart, segmentEnd)
                    : segmentDays / periodDays;
                return sum + Number(profile.standard_hours_per_day || 8) * Number(profile.standard_days_per_period || 22) * segmentFactor;
            }, 0);
            const standardHours = Number(attendance.scheduled_hours || 0) > 0
                ? Number(attendance.scheduled_hours)
                : profileStandardHours;
            const weightedMonthlySalary = monthlyProfiles.reduce((sum, profile) => sum + Number(profile.base_salary || 0), 0);
            const contextBase = {
                baseGross,
                gross: baseGross,
                hourlyRate,
                overtimeHours: Math.max(0, hoursWorked - standardHours),
                absenceDays: Number(attendance.unexcused_absent_days || 0) + Number(attendance.half_days || 0),
                lateMinutes: Number(attendance.late_minutes || 0),
                earlyLeaveMinutes: Number(attendance.early_leave_minutes || 0),
                dailyRate: standardDays > 0 ? roundMoney(baseGross / standardDays) : 0
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
            const unpaidLeaveLines = monthlyProfiles.map((profile) => ({
                type: 'Deduction',
                sourceType: 'unpaid_leave',
                sourceId: null,
                description: 'Unpaid leave deduction',
                amount: unpaidLeaveDeductionForProfile({ profile, attendance, employee, period }),
                taxable: false
            })).filter((line) => line.amount > 0);
            const requestedDeductionLines = [
                ...unpaidLeaveLines,
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
                amount: roundMoney(penalty.remaining_amount ?? penalty.amount),
                taxable: false
                })),
                ...ruleControlLines.filter((line) => line.type === 'Penalty')
            ].filter((line) => line.amount > 0);
            const deductionLines = capLineAmounts(requestedDeductionLines, gross);
            const totalDeductions = sumAmount(deductionLines);
            const penaltyLines = capLineAmounts(requestedPenaltyLines, roundMoney(gross - totalDeductions));

            const totalPenalties = sumAmount(penaltyLines);
            const totalEmployerContributions = sumAmount(employerContributionLines);
            const netPay = Math.max(0, roundMoney(gross - totalDeductions - totalPenalties));
            const unappliedControls = roundMoney(
                [...deductionLines, ...penaltyLines].reduce((sum, line) => sum + Number(line.unappliedAmount || 0), 0)
            );

            const itemResult = await client.query(`
                INSERT INTO payroll_employee_items (
                    run_id, user_id, compensation_profile_id, gross_earnings, total_deductions,
                    total_penalties, total_employer_contributions, net_pay, attendance_snapshot, calculation_snapshot
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
                RETURNING *
            `, [
                run.run_id,
                employee.user_id,
                compensationProfiles.at(-1)?.profile_id || null,
                gross,
                totalDeductions,
                totalPenalties,
                totalEmployerContributions,
                netPay,
                JSON.stringify(attendance),
                JSON.stringify({
                    salaryType,
                    compensationProfiles: compensationProfiles.map((profile) => ({
                        profileId: profile.profile_id,
                        salaryType: profile.salary_type,
                        baseSalary: Number(profile.base_salary || 0),
                        hourlyRate: Number(profile.hourly_rate || 0),
                        effectiveFrom: profile.effective_from,
                        effectiveTo: profile.effective_to,
                        hoursWorked: Number(profile.profile_hours_worked || 0),
                        paidLeaveHours: paidLeaveHoursForProfile({ profile, attendance, employee, period })
                    })),
                    weightedMonthlySalary,
                    baseGross,
                    hourlyRate,
                    hoursWorked,
                    paidLeaveHours: hourlyProfileHours - hourlyProfiles.reduce((sum, profile) => sum + Number(profile.profile_hours_worked || 0), 0),
                    payableDays,
                    periodDays,
                    overtimeHours: contextBase.overtimeHours,
                    absenceDays: contextBase.absenceDays,
                    lateMinutes: contextBase.lateMinutes,
                    earlyLeaveMinutes: contextBase.earlyLeaveMinutes,
                    employerContributions: totalEmployerContributions,
                    requestedDeductions: sumAmount(requestedDeductionLines),
                    requestedPenalties: sumAmount(requestedPenaltyLines),
                    unappliedControls,
                    formula: 'sum(monthly_profile_salary / calendar_month_days for each eligible day) + sum(hourly_profile_rate * clipped_profile_hours)'
                })
            ]);
            const item = itemResult.rows[0];

            const earningLines = profileEarningLines;

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

            claimedPenaltyIds.push(...penaltyLines
                .filter((line) => line.sourceType === 'employee_penalties' && Number(line.amount) > 0)
                .map((line) => line.sourceId));
            claimedDeductionIds.push(...deductionLines
                .filter((line) => line.sourceType === 'employee_deductions' && Number(line.amount) > 0)
                .map((line) => line.sourceId));
            totals.employeeCount += 1;
            totals.gross += gross;
            totals.deductions += totalDeductions;
            totals.penalties += totalPenalties;
            totals.employerContributions += totalEmployerContributions;
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
        if (claimedDeductionIds.length) {
            await client.query(`
                UPDATE employee_deductions
                SET payroll_period_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE deduction_id = ANY($2::uuid[]) AND payroll_period_id IS NULL
            `, [periodId, claimedDeductionIds]);
        }
        await client.query(`
            UPDATE employee_penalties
            SET payroll_period_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE payroll_period_id = $1::uuid
              AND NOT (penalty_id = ANY($2::uuid[]))
              AND status = 'Approved'
        `, [periodId, claimedPenaltyIds]);
        await client.query(`
            UPDATE employee_deductions
            SET payroll_period_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE payroll_period_id = $1::uuid
              AND NOT (deduction_id = ANY($2::uuid[]))
              AND status = 'Approved'
        `, [periodId, claimedDeductionIds]);

        const updatedRun = await client.query(`
            UPDATE payroll_runs
            SET employee_count = $2,
                total_gross = $3,
                total_deductions = $4,
                total_penalties = $5,
                total_net = $6,
                total_employer_contributions = $7,
                status = 'Calculated',
                updated_at = CURRENT_TIMESTAMP
            WHERE run_id = $1
            RETURNING *
        `, [run.run_id, totals.employeeCount, roundMoney(totals.gross), roundMoney(totals.deductions), roundMoney(totals.penalties), roundMoney(totals.net), roundMoney(totals.employerContributions)]);

        await client.query(`
            UPDATE payroll_periods
            SET status = 'Calculated',
                total_gross = $2,
                total_deductions = $3,
                total_penalties = $4,
                total_net = $5,
                total_employer_contributions = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE period_id = $1
        `, [periodId, roundMoney(totals.gross), roundMoney(totals.deductions), roundMoney(totals.penalties), roundMoney(totals.net), roundMoney(totals.employerContributions)]);

        await client.query(`
            INSERT INTO payroll_audit_log (entity_type, entity_id, action, previous_status, new_status, details, changed_by)
            VALUES ('payroll_run', $1, 'CALCULATE_PAYROLL', $2, 'Calculated', $3::jsonb, $4)
        `, [run.run_id, period.status, JSON.stringify(totals), getUserId(req)]);

        await logAction(client, {
            userId: getUserId(req),
            action: 'PAYROLL_CALCULATED',
            resourceId: run.run_id,
            resourceTable: 'payroll_runs',
            ipAddress: req.ip,
            details: { periodId, ...totals },
            required: true
        });

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
                SET remaining_amount = GREATEST(0, p.remaining_amount - li.amount),
                    status = CASE WHEN GREATEST(0, p.remaining_amount - li.amount) = 0 THEN 'Applied' ELSE 'Approved' END,
                    applied_at = CASE WHEN GREATEST(0, p.remaining_amount - li.amount) = 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
                    payroll_period_id = CASE WHEN GREATEST(0, p.remaining_amount - li.amount) = 0 THEN p.payroll_period_id ELSE NULL END,
                    updated_at = CURRENT_TIMESTAMP
                FROM payroll_line_items li
                WHERE li.source_type = 'employee_penalties'
                  AND li.source_id = p.penalty_id
                  AND li.run_id = $1::uuid
                  AND p.status = 'Approved'
            `, [runId]);
        }
        if (data.status === 'Cancelled') {
            await client.query(`
                UPDATE employee_penalties
                SET payroll_period_id = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE payroll_period_id = $1::uuid AND status = 'Approved'
            `, [run.period_id]);
            await client.query(`
                UPDATE employee_deductions
                SET payroll_period_id = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE payroll_period_id = $1::uuid AND status = 'Approved'
            `, [run.period_id]);
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

        await logAction(client, {
            userId,
            action: 'PAYROLL_RUN_STATUS_CHANGED',
            resourceId: runId,
            resourceTable: 'payroll_runs',
            ipAddress: req.ip,
            details: { previousStatus: run.status, newStatus: data.status, notes: data.notes || null },
            required: true
        });

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
    getPayrollEmployees,
    getPayrollOverview,
    getPayrollPeriods,
    createPayrollPeriod,
    cancelPayrollPeriod,
    getCompensationProfiles,
    createCompensationProfile,
    updateCompensationProfile,
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
        monthlyAccrualFactor,
        overlapDays,
        payrollPaymentJournalEntries,
        paidLeaveHoursForProfile,
        proratedMonthlyAmount,
        summarizeAttendance,
        unpaidLeaveDeductionForProfile
    }
};
