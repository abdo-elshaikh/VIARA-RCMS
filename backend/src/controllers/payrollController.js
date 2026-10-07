const { AppError } = require('../middleware/errorHandler');
const Decimal = require('decimal.js');
const { logAction } = require('../services/auditService');
const { triggerEvent, triggerEventForRole } = require('../services/notificationJobService');
const {
    DEFAULT_BRANCH_ID,
    DEFAULT_CURRENCY,
    lockFinancialBusinessDate,
    moneyNumber,
    postJournalBatch
} = require('../services/financialPostingService');

const getUserId = (req) => req.user?.user_id || req.user?.userId || req.user?.id || null;
const getBranchId = (req, source = {}) => (
    source.branchId || req.query?.branchId || req.user?.branch_id || req.user?.branchId || DEFAULT_BRANCH_ID
);

const assertBranchAccess = (req, branchId) => {
    const userBranchId = req.user?.branch_id || req.user?.branchId;
    if (req.user?.role !== 'Developer' && userBranchId && userBranchId !== branchId) {
        throw new AppError('You cannot access payroll data for another branch', 403);
    }
};

const boundedInteger = (value, fallback = 100, max = 500) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(1, parsed));
};

const {
    DAY_MS,
    INSTALLMENT_DEDUCTION_TYPES,
    PAYROLL_EMPLOYEE_ROLES,
    DEDUCTION_STATUS_TRANSITIONS,
    MAKER_CHECKER_STATUS_FIELD,
    dateOnly,
    roundMoney,
    inclusiveDays,
    overlapDays,
    capLineAmounts,
    sumAmount,
    calculateRuleAmount,
    ruleLineType,
    assertMakerChecker,
    paymentAccount,
    payrollPaymentJournalEntries,
    groupRowsByUser,
    cairoDateKey,
    enumerateWeekdays,
    enumerateDates,
    laterDate,
    earlierDate,
    payableDaysForRange,
    payableDaysForProfile,
    payableShiftsForProfile,
    monthlyAccrualFactor,
    proratedMonthlyAmount,
    calculateCompensationAmount,
    dateFallsWithin,
    netCollectionsForProfile,
    paidLeaveHoursForProfile,
    unpaidLeaveDeductionForProfile,
    summarizeAttendance,
    loadCalculationInputs,
    calculateDeductionAmount,
    applyPaidDeductionBalances
} = require('../services/payrollCalculationService');


const getPayrollEmployees = (db) => async (req, res, next) => {
    try {
        const branchId = getBranchId(req);
        assertBranchAccess(req, branchId);
        const result = await db.query(`
            SELECT u.user_id, u.full_name, u.email, u.role, u.is_active,
                   ep.employee_id, ep.department, ep.job_title, ep.hire_date,
                   ep.termination_date, ep.employment_status, ep.payroll_branch_id
            FROM users u
            JOIN employee_profiles ep ON ep.user_id = u.user_id
            WHERE u.role = ANY($1::user_role[])
              AND ep.payroll_branch_id = $2::uuid
              AND (u.is_active = TRUE OR ep.termination_date IS NOT NULL)
            ORDER BY u.full_name ASC
        `, [PAYROLL_EMPLOYEE_ROLES, branchId]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getPayrollOverview = (db) => async (req, res, next) => {
    try {
        const { currencyCode, periodId } = req.query;
        const branchId = getBranchId(req);
        assertBranchAccess(req, branchId);
        const params = [branchId];
        let filters = `WHERE status != 'Cancelled' AND branch_id = $1::uuid`;
        const branchPlaceholder = '$1';
        let currencyPlaceholder = null;
        if (currencyCode) {
            params.push(currencyCode);
            currencyPlaceholder = `$${params.length}`;
            filters += ` AND currency_code = $${params.length}`;
        }
        if (periodId) {
            params.push(periodId);
            filters += ` AND period_id = $${params.length}::uuid`;
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
                    SELECT COUNT(*) FROM employee_penalties
                    WHERE (
                        status IN ('Draft', 'Pending Approval')
                        OR (status = 'Approved' AND remaining_amount > 0 AND payroll_period_id IS NULL)
                    )
                      AND branch_id = ${branchPlaceholder}::uuid
                      ${currencyPlaceholder ? `AND currency_code = ${currencyPlaceholder}` : ''}
                ), 0)::int AS pending_penalties,
                COALESCE((
                    SELECT COUNT(*) FROM employee_deductions
                    WHERE status IN ('Draft', 'Paused')
                      AND branch_id = ${branchPlaceholder}::uuid
                      ${currencyPlaceholder ? `AND currency_code = ${currencyPlaceholder}` : ''}
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
        const { status, startDate, endDate, limit = 100 } = req.query;
        const branchId = getBranchId(req);
        assertBranchAccess(req, branchId);
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
        params.push(branchId);
        query += ` AND p.branch_id = $${params.length}::uuid`;
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
        const branchId = getBranchId(req, data);
        assertBranchAccess(req, branchId);
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
        assertBranchAccess(req, existing.rows[0].branch_id || DEFAULT_BRANCH_ID);
        if (existing.rows[0].status !== 'Draft') {
            throw new AppError('Only a Draft period without a payroll run can be cancelled here', 409);
        }
        const run = await client.query('SELECT run_id FROM payroll_runs WHERE period_id = $1::uuid', [periodId]);
        if (run.rows.length) throw new AppError('Cancel this period through its payroll run workflow', 409);

        const updated = await client.query(`
            UPDATE payroll_periods
            SET status = 'Cancelled', notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $2::text), updated_at = CURRENT_TIMESTAMP
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
        const { userId, currencyCode, limit = 100 } = req.query;
        const branchId = getBranchId(req);
        assertBranchAccess(req, branchId);
        const pageLimit = boundedInteger(limit);
        const params = [PAYROLL_EMPLOYEE_ROLES, branchId];
        let query = `
            SELECT cp.*, u.full_name AS employee_name, u.email, u.role
            FROM employee_compensation_profiles cp
            JOIN users u ON u.user_id = cp.user_id
            WHERE u.role = ANY($1::user_role[])
              AND cp.branch_id = $2::uuid
        `;
        if (userId) {
            params.push(userId);
            query += ` AND cp.user_id = $${params.length}::uuid`;
        }
        if (currencyCode) {
            params.push(currencyCode);
            query += ` AND cp.currency_code = $${params.length}`;
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
        const branchId = getBranchId(req, data);
        assertBranchAccess(req, branchId);
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11703))', [data.userId]);
        const employee = await client.query(`
            SELECT u.user_id
            FROM users u
            JOIN employee_profiles ep ON ep.user_id = u.user_id
            WHERE u.user_id = $1 AND u.role = ANY($2::user_role[])
              AND ep.payroll_branch_id = $3::uuid
        `, [data.userId, PAYROLL_EMPLOYEE_ROLES, branchId]);
        if (!employee.rows.length) throw new AppError('Eligible employee not found', 400);
        const overlap = await client.query(`
            SELECT profile_id
            FROM employee_compensation_profiles
            WHERE user_id = $1
              AND branch_id = $4::uuid
              AND is_active = TRUE
              AND daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]')
                  && daterange($2::date, COALESCE($3::date, '9999-12-31'::date), '[]')
            LIMIT 1
        `, [data.userId, data.effectiveFrom, data.effectiveTo || null, branchId]);
        if (overlap.rows.length) {
            throw new AppError('Employee already has an active compensation profile in this date range', 409);
        }

        const result = await client.query(`
            INSERT INTO employee_compensation_profiles (
                user_id, salary_type, base_salary, hourly_rate, standard_hours_per_day,
                standard_days_per_period, effective_from, effective_to, is_active, notes, created_by,
                branch_id, currency_code, daily_rate, shift_rate, case_rate, percentage_rate
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::uuid, $13, $14, $15, $16, $17)
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
            getUserId(req),
            branchId,
            data.currencyCode,
            data.dailyRate,
            data.shiftRate,
            data.caseRate,
            data.percentageRate
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
            details: { userId: data.userId, salaryType: data.salaryType, effectiveFrom: data.effectiveFrom, branchId, currencyCode: data.currencyCode }, required: true
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
        assertBranchAccess(req, existing.rows[0].branch_id || DEFAULT_BRANCH_ID);
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
        const { status, currencyCode } = req.query;
        const branchId = getBranchId(req);
        assertBranchAccess(req, branchId);
        const params = [branchId];
        let filters = 'WHERE r.branch_id = $1::uuid';
        if (status) {
            params.push(status);
            filters += ` AND r.status = $${params.length}::varchar(30)`;
        }
        if (currencyCode) {
            params.push(currencyCode);
            filters += ` AND r.currency_code = $${params.length}`;
        }
        const result = await db.query(`
            SELECT r.*, creator.full_name AS created_by_name, approver.full_name AS approved_by_name
            FROM payroll_rules r
            LEFT JOIN users creator ON creator.user_id = r.created_by
            LEFT JOIN users approver ON approver.user_id = r.approved_by
            ${filters}
            ORDER BY r.status ASC, r.is_active DESC, r.rule_type ASC, r.name ASC
        `, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createPayrollRule = (db) => async (req, res, next) => {
    let client;
    try {
        const data = req.body;
        const branchId = getBranchId(req, data);
        assertBranchAccess(req, branchId);
        const status = 'Pending Approval';
        const isActive = false;
        client = await db.connect();
        await client.query('BEGIN');
        const targetUserIds = [...new Set(data.targetUserIds || [])];
        if (data.ruleType === 'Bonus' && targetUserIds.length) {
            const eligibleTargets = await client.query(`
                SELECT COUNT(DISTINCT u.user_id)::int AS count
                FROM users u
                JOIN employee_profiles ep ON ep.user_id = u.user_id
                WHERE u.user_id = ANY($1::uuid[])
                  AND u.role = ANY($2::user_role[])
                  AND ep.payroll_branch_id = $3::uuid
            `, [targetUserIds, PAYROLL_EMPLOYEE_ROLES, branchId]);
            if (eligibleTargets.rows[0].count !== targetUserIds.length) {
                throw new AppError('One or more bonus targets are not eligible employees in this branch', 400);
            }
        }
        const metadata = {
            ...(data.metadata || {}),
            ...(data.ruleType === 'Bonus' ? {
                targetUserIds,
                targetRoles: data.targetRoles || [],
                bonusFrequency: data.bonusFrequency || 'OneTime'
            } : {})
        };
        const result = await client.query(`
            INSERT INTO payroll_rules (
                rule_type, name, calculation_method, value, taxable, requires_approval,
                effective_from, effective_to, is_active, status, metadata, created_by,
                approved_by, approved_at, branch_id, currency_code
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::varchar(30), $11::jsonb, $12, $13, $14, $15::uuid, $16)
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
            JSON.stringify(metadata),
            getUserId(req),
            null,
            null,
            branchId,
            data.currencyCode
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
        assertBranchAccess(req, rule.branch_id || DEFAULT_BRANCH_ID);
        const validTransition = (rule.status === 'Pending Approval' && ['Approved', 'Rejected'].includes(status))
            || (rule.status === 'Approved' && status === 'Cancelled');
        if (!validTransition) {
            throw new AppError(`Payroll rule cannot move from ${rule.status} to ${status}`, 409);
        }
        if (rule.status === 'Pending Approval' && req.user?.role !== 'Developer' && rule.created_by === userId) {
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
        const { userId, status, currencyCode, limit = 100 } = req.query;
        const branchId = getBranchId(req);
        assertBranchAccess(req, branchId);
        const pageLimit = boundedInteger(limit);
        const params = [PAYROLL_EMPLOYEE_ROLES, branchId];
        let query = `
            SELECT d.*, u.full_name AS employee_name, creator.full_name AS created_by_name, approver.full_name AS approved_by_name
            FROM employee_deductions d
            JOIN users u ON u.user_id = d.user_id
            LEFT JOIN users creator ON creator.user_id = d.created_by
            LEFT JOIN users approver ON approver.user_id = d.approved_by
            WHERE u.role = ANY($1::user_role[])
              AND d.branch_id = $2::uuid
        `;
        if (userId) {
            params.push(userId);
            query += ` AND d.user_id = $${params.length}::uuid`;
        }
        if (status) {
            params.push(status);
            query += ` AND d.status = $${params.length}::varchar`;
        }
        if (currencyCode) {
            params.push(currencyCode);
            query += ` AND d.currency_code = $${params.length}`;
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
        const branchId = getBranchId(req, data);
        assertBranchAccess(req, branchId);
        client = await db.connect();
        await client.query('BEGIN');
        const employee = await client.query(`
            SELECT u.user_id
            FROM users u
            JOIN employee_profiles ep ON ep.user_id = u.user_id
            WHERE u.user_id = $1 AND u.role = ANY($2::user_role[])
              AND ep.payroll_branch_id = $3::uuid
        `, [data.userId, PAYROLL_EMPLOYEE_ROLES, branchId]);
        if (!employee.rows.length) throw new AppError('Eligible employee not found', 400);
        const result = await client.query(`
            INSERT INTO employee_deductions (
                user_id, name, deduction_type, amount, percentage, total_amount,
                remaining_amount, start_date, end_date, status, notes, created_by, approved_by, approved_at,
                branch_id, currency_code, recurrence_type, max_occurrences
            )
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, $6, $4), $8, $9, $10, $11, $12, $13, $14,
                    $15::uuid, $16, $17, $18)
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
            null,
            branchId,
            data.currencyCode,
            data.recurrenceType,
            data.maxOccurrences || null
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
        assertBranchAccess(req, deduction.branch_id || DEFAULT_BRANCH_ID);
        const allowedStatuses = DEDUCTION_STATUS_TRANSITIONS[deduction.status] || new Set();
        if (!allowedStatuses.has(status)) {
            throw new AppError(`Deduction cannot move from ${deduction.status} to ${status}`, 409);
        }
        if (deduction.payroll_period_id && status !== 'Approved') {
            throw new AppError('Deduction is reserved by a calculated payroll period; cancel or recalculate that run first', 409);
        }
        // Blocks Draft -> Approved and Paused -> Approved alike: resuming a
        // paused deduction re-opens payroll impact, so the maker cannot also
        // be the checker.
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
        const { userId, status, currencyCode, limit = 100 } = req.query;
        const branchId = getBranchId(req);
        assertBranchAccess(req, branchId);
        const pageLimit = boundedInteger(limit);
        const params = [PAYROLL_EMPLOYEE_ROLES, branchId];
        let query = `
            SELECT p.*, u.full_name AS employee_name, creator.full_name AS created_by_name, approver.full_name AS approved_by_name
            FROM employee_penalties p
            JOIN users u ON u.user_id = p.user_id
            LEFT JOIN users creator ON creator.user_id = p.created_by
            LEFT JOIN users approver ON approver.user_id = p.approved_by
            WHERE u.role = ANY($1::user_role[])
              AND p.branch_id = $2::uuid
        `;
        if (userId) {
            params.push(userId);
            query += ` AND p.user_id = $${params.length}::uuid`;
        }
        if (status) {
            params.push(status);
            query += ` AND p.status = $${params.length}::varchar`;
        }
        if (currencyCode) {
            params.push(currencyCode);
            query += ` AND p.currency_code = $${params.length}`;
        }
        params.push(pageLimit);
        query += ` ORDER BY p.created_at DESC LIMIT $${params.length}::int`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getMyPayrollPenalties = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT penalty_id, penalty_type, amount, reason, source, status,
                   incident_date, created_at, acknowledgement_status,
                   employee_acknowledged_at, disputed_at, dispute_reason,
                   dispute_resolution, dispute_resolved_at, remaining_amount,
                   currency_code
            FROM employee_penalties
            WHERE user_id = $1::uuid
            ORDER BY incident_date DESC, created_at DESC
            LIMIT 100
        `, [getUserId(req)]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createPenalty = (db) => async (req, res, next) => {
    let client;
    try {
        const data = req.body;
        const branchId = getBranchId(req, data);
        assertBranchAccess(req, branchId);
        client = await db.connect();
        await client.query('BEGIN');
        const employee = await client.query(`
            SELECT u.user_id
            FROM users u
            JOIN employee_profiles ep ON ep.user_id = u.user_id
            WHERE u.user_id = $1 AND u.role = ANY($2::user_role[])
              AND ep.payroll_branch_id = $3::uuid
        `, [data.userId, PAYROLL_EMPLOYEE_ROLES, branchId]);
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
                `SELECT period_id FROM payroll_periods
                 WHERE period_id = $1::uuid AND branch_id = $2::uuid AND currency_code = $3
                   AND status IN ('Draft', 'Calculated') FOR UPDATE`,
                [data.payrollPeriodId, branchId, data.currencyCode]
            );
            if (!period.rows.length) throw new AppError('Penalty can only target an open Draft or Calculated payroll period', 409);
        }
        const result = await client.query(`
            INSERT INTO employee_penalties (
                user_id, attendance_id, payroll_period_id, penalty_type, amount, reason,
                source, status, remaining_amount, created_by, approved_by, approved_at,
                branch_id, currency_code, incident_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending Approval', $5, $8, NULL, NULL, $9::uuid, $10, $11)
            RETURNING *
        `, [
            data.userId,
            data.attendanceId || null,
            data.payrollPeriodId || null,
            data.penaltyType,
            data.amount,
            data.reason,
            data.source,
            getUserId(req),
            branchId,
            data.currencyCode,
            data.incidentDate
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

        // Lock the target period (if any) before the penalty itself so the
        // lock order matches calculatePayroll (period -> penalties); the two
        // transactions can no longer deadlock on each other.
        const periodProbe = await client.query(
            'SELECT payroll_period_id FROM employee_penalties WHERE penalty_id = $1::uuid',
            [penaltyId]
        );
        if (!periodProbe.rows.length) throw new AppError('Payroll penalty not found', 404);
        if (periodProbe.rows[0].payroll_period_id) {
            await client.query(
                'SELECT period_id FROM payroll_periods WHERE period_id = $1::uuid FOR UPDATE',
                [periodProbe.rows[0].payroll_period_id]
            );
        }

        const existing = await client.query(
            'SELECT * FROM employee_penalties WHERE penalty_id = $1::uuid FOR UPDATE',
            [penaltyId]
        );
        if (!existing.rows.length) throw new AppError('Payroll penalty not found', 404);
        const penalty = existing.rows[0];
        assertBranchAccess(req, penalty.branch_id || DEFAULT_BRANCH_ID);

        const allowedPenaltyTransitions = {
            'Pending Approval': new Set(['Approved', 'Rejected', 'Cancelled']),
            Approved: new Set(['Cancelled'])
        };
        const allowedTargets = allowedPenaltyTransitions[penalty.status] || new Set();
        if (!allowedTargets.has(status)) {
            throw new AppError(`Penalty cannot move from ${penalty.status} to ${status}`, 409);
        }
        if (status === 'Cancelled' && String(notes || '').trim().length < 3) {
            throw new AppError('A reason of at least 3 characters is required to cancel a penalty', 400);
        }
        if (status === 'Cancelled' && penalty.payroll_period_id) {
            // An approved penalty can only be cancelled while its reserving
            // run can still be recalculated or cancelled.
            const period = await client.query(
                "SELECT status FROM payroll_periods WHERE period_id = $1::uuid",
                [penalty.payroll_period_id]
            );
            if (!period.rows.length || !['Draft', 'Calculated', 'Reviewed'].includes(period.rows[0].status)) {
                throw new AppError('Penalty is reserved by a payroll run that can no longer be changed; cancel that run first', 409);
            }
        }
        if (req.user?.role !== 'Developer' && penalty.created_by === userId) {
            throw new AppError('The penalty creator cannot approve, reject, or cancel their own request', 403);
        }

        const updated = await client.query(`
            UPDATE employee_penalties
            SET status = $2::varchar(30),
                approved_by = CASE WHEN $2::varchar(30) = 'Approved' THEN $3::uuid ELSE approved_by END,
                approved_at = CASE WHEN $2::varchar(30) = 'Approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
                remaining_amount = CASE WHEN $2::varchar(30) = 'Cancelled' THEN 0 ELSE remaining_amount END,
                payroll_period_id = CASE WHEN $2::varchar(30) = 'Cancelled' THEN NULL ELSE payroll_period_id END,
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

        // The affected employee learns about an imposed penalty; payroll
        // stakeholders learn when one is withdrawn.
        if (status === 'Approved') {
            db.query('SELECT role FROM users WHERE user_id = $1', [penalty.user_id])
                .then(({ rows }) => rows[0]?.role && triggerEvent(db, 'PenaltyImposed', {
                    staffId: penalty.user_id,
                    staffRole: rows[0].role,
                    entityType: 'EmployeePenalty',
                    entityId: penaltyId,
                    variables: {
                        penalty_type: penalty.penalty_type,
                        amount: penalty.amount,
                        reason: penalty.reason
                    }
                }))
                .catch(() => {});
        }
        if (status === 'Cancelled') {
            for (const role of ['Admin', 'HR', 'Accountant']) {
                triggerEventForRole(db, 'PenaltyCancelled', role, {
                    entityType: 'EmployeePenalty',
                    entityId: penaltyId,
                    variables: {
                        penalty_type: penalty.penalty_type,
                        amount: penalty.amount,
                        reason: notes || ''
                    }
                }).catch(() => {});
            }
        }

        res.json(updated.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

const acknowledgePenalty = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { penaltyId } = req.params;
        const data = req.body;
        const userId = getUserId(req);
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT * FROM employee_penalties WHERE penalty_id = $1::uuid FOR UPDATE',
            [penaltyId]
        );
        if (!existing.rows.length) throw new AppError('Payroll penalty not found', 404);
        const penalty = existing.rows[0];
        if (String(penalty.user_id) !== String(userId)) {
            throw new AppError('Employees can only acknowledge their own penalties', 403);
        }
        if (penalty.status !== 'Approved') {
            throw new AppError('Only approved penalties can be acknowledged or disputed', 409);
        }
        if (data.status === 'Acknowledged' && penalty.acknowledgement_status === 'Disputed') {
            throw new AppError('This penalty is under dispute review; acknowledge after the dispute is resolved', 409);
        }
        if (data.status === 'Disputed' && penalty.acknowledgement_status === 'Resolved') {
            throw new AppError('This dispute was already resolved', 409);
        }

        const updated = await client.query(`
            UPDATE employee_penalties
            SET acknowledgement_status = $2::varchar(20),
                employee_acknowledged_at = CURRENT_TIMESTAMP,
                disputed_at = CASE WHEN $2::varchar(20) = 'Disputed' THEN CURRENT_TIMESTAMP ELSE disputed_at END,
                dispute_reason = CASE WHEN $2::varchar(20) = 'Disputed' THEN $3 ELSE dispute_reason END,
                updated_at = CURRENT_TIMESTAMP
            WHERE penalty_id = $1::uuid
            RETURNING *
        `, [penaltyId, data.status, data.reason || null]);

        await client.query(`
            INSERT INTO payroll_audit_log (
                entity_type, entity_id, action, new_status, details, changed_by
            )
            VALUES ('employee_penalty', $1::uuid, 'ACKNOWLEDGEMENT', $2::varchar(20), $3::jsonb, $4::uuid)
        `, [penaltyId, data.status, JSON.stringify({ reason: data.reason || null, previousStatus: penalty.acknowledgement_status }), userId]);

        await logAction(client, {
            userId,
            action: 'PAYROLL_PENALTY_ACKNOWLEDGED',
            resourceId: penaltyId,
            resourceTable: 'employee_penalties',
            ipAddress: req.ip,
            details: { acknowledgementStatus: data.status, reason: data.reason || null },
            required: true
        });

        await client.query('COMMIT');

        // A dispute freezes the penalty out of payroll calculation until HR
        // resolves it, so HR must hear about it immediately.
        if (data.status === 'Disputed') {
            for (const role of ['Admin', 'HR']) {
                triggerEventForRole(db, 'PenaltyDisputed', role, {
                    entityType: 'EmployeePenalty',
                    entityId: penaltyId,
                    variables: {
                        penalty_type: penalty.penalty_type,
                        amount: penalty.amount,
                        dispute_reason: data.reason || ''
                    }
                }).catch(() => {});
            }
        }

        res.json(updated.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

const resolvePenaltyDispute = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { penaltyId } = req.params;
        const data = req.body;
        const userId = getUserId(req);
        await client.query('BEGIN');

        // Match the calculatePayroll lock order when the penalty is reserved.
        const periodProbe = await client.query(
            'SELECT payroll_period_id FROM employee_penalties WHERE penalty_id = $1::uuid',
            [penaltyId]
        );
        if (!periodProbe.rows.length) throw new AppError('Payroll penalty not found', 404);
        if (periodProbe.rows[0].payroll_period_id) {
            await client.query(
                'SELECT period_id FROM payroll_periods WHERE period_id = $1::uuid FOR UPDATE',
                [periodProbe.rows[0].payroll_period_id]
            );
        }

        const existing = await client.query(
            'SELECT * FROM employee_penalties WHERE penalty_id = $1::uuid FOR UPDATE',
            [penaltyId]
        );
        if (!existing.rows.length) throw new AppError('Payroll penalty not found', 404);
        const penalty = existing.rows[0];
        assertBranchAccess(req, penalty.branch_id || DEFAULT_BRANCH_ID);
        if (penalty.acknowledgement_status !== 'Disputed') {
            throw new AppError('Only disputed penalties can be resolved', 409);
        }
        if (penalty.status !== 'Approved') {
            throw new AppError(`A ${penalty.status} penalty cannot be resolved through dispute review`, 409);
        }
        if (data.status === 'Rejected' && penalty.payroll_period_id) {
            const period = await client.query(
                "SELECT status FROM payroll_periods WHERE period_id = $1::uuid",
                [penalty.payroll_period_id]
            );
            if (!period.rows.length || !['Draft', 'Calculated', 'Reviewed'].includes(period.rows[0].status)) {
                throw new AppError('Penalty is reserved by a payroll run that can no longer be changed; cancel that run first', 409);
            }
        }

        const updated = await client.query(`
            UPDATE employee_penalties
            SET acknowledgement_status = 'Resolved',
                dispute_resolved_at = CURRENT_TIMESTAMP,
                dispute_resolution = $2,
                status = $3::varchar(30),
                remaining_amount = CASE WHEN $3::varchar(30) = 'Rejected' THEN 0 ELSE remaining_amount END,
                payroll_period_id = CASE WHEN $3::varchar(30) = 'Rejected' THEN NULL ELSE payroll_period_id END,
                updated_at = CURRENT_TIMESTAMP
            WHERE penalty_id = $1::uuid
            RETURNING *
        `, [penaltyId, data.resolution, data.status]);

        await client.query(`
            INSERT INTO payroll_audit_log (
                entity_type, entity_id, action, previous_status, new_status, details, changed_by
            )
            VALUES ('employee_penalty', $1::uuid, 'DISPUTE_RESOLVED', 'Disputed', $2::varchar(20), $3::jsonb, $4::uuid)
        `, [penaltyId, data.status, JSON.stringify({ resolution: data.resolution }), userId]);

        await logAction(client, {
            userId,
            action: 'PAYROLL_PENALTY_DISPUTE_RESOLVED',
            resourceId: penaltyId,
            resourceTable: 'employee_penalties',
            ipAddress: req.ip,
            details: { outcome: data.status, resolution: data.resolution },
            required: true
        });

        await client.query('COMMIT');

        db.query('SELECT role FROM users WHERE user_id = $1', [penalty.user_id])
            .then(({ rows }) => rows[0]?.role && triggerEvent(db, 'PenaltyDisputeResolved', {
                staffId: penalty.user_id,
                staffRole: rows[0].role,
                entityType: 'EmployeePenalty',
                entityId: penaltyId,
                variables: {
                    outcome: data.status,
                    penalty_type: penalty.penalty_type,
                    resolution: data.resolution
                }
            }))
            .catch(() => {});

        res.json(updated.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

const getMyPayrollHistory = (db) => async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const result = await db.query(`
            SELECT i.item_id, i.run_id, p.name AS period_name, p.start_date, p.end_date,
                   p.status AS period_status, p.currency_code, p.paid_at,
                   i.gross_earnings, i.total_deductions, i.total_penalties,
                   i.total_employer_contributions, i.net_pay,
                   COALESCE(jsonb_agg(jsonb_build_object(
                       'type', li.item_type, 'description', li.description,
                       'amount', li.amount, 'taxable', li.taxable
                   ) ORDER BY li.created_at) FILTER (WHERE li.line_item_id IS NOT NULL), '[]'::jsonb) AS line_items
            FROM payroll_employee_items i
            JOIN payroll_runs r ON r.run_id = i.run_id
            JOIN payroll_periods p ON p.period_id = r.period_id
            LEFT JOIN payroll_line_items li ON li.payroll_employee_item_id = i.item_id
            WHERE i.user_id = $1::uuid
              AND r.status IN ('Paid', 'Locked')
            GROUP BY i.item_id, p.period_id
            ORDER BY p.start_date DESC
            LIMIT 36
        `, [userId]);
        res.json(result.rows);
    } catch (error) {
        next(error);
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
        assertBranchAccess(req, runResult.rows[0].branch_id || DEFAULT_BRANCH_ID);

        const items = await db.query(`
            SELECT i.*, u.full_name AS employee_name, u.email, u.role,
                   ep.employee_id,
                   COALESCE(jsonb_agg(to_jsonb(li) ORDER BY li.created_at) FILTER (WHERE li.line_item_id IS NOT NULL), '[]'::jsonb) AS line_items
            FROM payroll_employee_items i
            JOIN users u ON u.user_id = i.user_id
            LEFT JOIN employee_profiles ep ON ep.user_id = i.user_id
            LEFT JOIN payroll_line_items li ON li.payroll_employee_item_id = i.item_id
            WHERE i.run_id = $1
            GROUP BY i.item_id, u.user_id, ep.employee_id
            ORDER BY u.full_name ASC
        `, [runResult.rows[0].run_id]);

        res.json({ ...runResult.rows[0], items: items.rows });
    } catch (error) {
        next(error);
    }
};



const calculatePayroll = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { periodId } = req.body;
        await client.query('BEGIN');

        const periodResult = await client.query('SELECT * FROM payroll_periods WHERE period_id = $1::uuid FOR UPDATE', [periodId]);
        if (!periodResult.rows.length) throw new AppError('Payroll period not found', 404);
        const period = periodResult.rows[0];
        assertBranchAccess(req, period.branch_id || DEFAULT_BRANCH_ID);
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

        // Employees without an active in-scope compensation profile cannot be
        // paid, but they must not block the whole branch either. They are
        // skipped, recorded on the run, audited, and escalated to HR/Admin —
        // the reviewer sees the exclusions before approving payment.
        const skippedEmployees = inputs.employees
            .filter((employee) => !(inputs.compensationByUser.get(employee.user_id) || []).length)
            .map((employee) => ({
                userId: employee.user_id,
                fullName: employee.full_name,
                reason: 'missing_compensation_profile'
            }));
        const payableEmployees = inputs.employees.filter(
            (employee) => {
                const profiles = inputs.compensationByUser.get(employee.user_id) || [];
                const caseMetrics = inputs.caseMetricsByUser.get(employee.user_id) || [];
                return profiles.some((profile) => {
                    const segmentStart = laterDate(period.start_date, profile.effective_from, employee.hire_date);
                    const segmentEnd = earlierDate(period.end_date, profile.effective_to, employee.termination_date);
                    if (overlapDays(period.start_date, period.end_date, segmentStart, segmentEnd) > 0) return true;
                    return profile.salary_type === 'Percentage'
                        && netCollectionsForProfile({ caseMetrics, profile, employee, payrollEndDate: period.end_date }) > 0;
                });
            }
        );

        for (const employee of payableEmployees) {
            const attendance = inputs.attendanceByUser.get(employee.user_id) || {
                log_count: 0,
                days_worked: 0,
                hours_worked: 0,
                logs: []
            };
            const compensationProfiles = inputs.compensationByUser.get(employee.user_id) || [];
            const hoursWorked = Number(attendance.hours_worked || 0);
            const periodDays = inclusiveDays(period.start_date, period.end_date);
            const caseMetrics = inputs.caseMetricsByUser.get(employee.user_id) || [];
            const completedCases = new Set(caseMetrics
                .filter((metric) => dateFallsWithin(metric.eligible_date, period.start_date, period.end_date))
                .map((metric) => metric.exam_id)).size;
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
                const profileCases = new Set(caseMetrics
                    .filter((metric) => dateFallsWithin(metric.eligible_date, segmentStart, segmentEnd))
                    .map((metric) => metric.exam_id)).size;
                const profileShifts = payableShiftsForProfile({ profile, attendance, employee, period });
                const profileDays = payableDaysForProfile({ profile, attendance, employee, period });
                const profileNetCollections = netCollectionsForProfile({
                    caseMetrics,
                    profile,
                    employee,
                    payrollEndDate: period.end_date
                });
                const amount = calculateCompensationAmount(profile, {
                    segmentStart,
                    segmentEnd,
                    profileHoursWorked: profile.profile_hours_worked,
                    paidLeaveHours,
                    payableDays: profileDays,
                    paidShifts: profileShifts,
                    completedCases: profileCases,
                    netCollections: profileNetCollections
                });
                return {
                    type: 'Earning',
                    sourceType: 'employee_compensation_profiles',
                    sourceId: profile.profile_id,
                    description: `${profile.salary_type} compensation`,
                    amount,
                    taxable: true,
                    segmentDays,
                    proration,
                    paidLeaveHours,
                    salaryType: profile.salary_type,
                    payableDays: profileDays,
                    payableShifts: profileShifts,
                    completedCases: profileCases,
                    netCollections: profileNetCollections
                };
            });
            const netCollections = roundMoney(Math.max(0, caseMetrics.reduce(
                (sum, metric) => sum + Number(metric.net_collection_amount || 0),
                0
            )));
            const baseGross = sumAmount(profileEarningLines);
            const monthlyProfiles = compensationProfiles.filter((profile) => profile.salary_type === 'Monthly');
            const hourlyProfiles = compensationProfiles.filter((profile) => profile.salary_type === 'Hourly');
            const payableDays = monthlyProfiles.reduce((sum, profile) => sum + overlapDays(
                period.start_date,
                period.end_date,
                laterDate(profile.effective_from, employee.hire_date),
                earlierDate(profile.effective_to || period.end_date, employee.termination_date || period.end_date)
            ), 0);
            const salaryTypes = [...new Set(compensationProfiles.map((profile) => profile.salary_type))];
            const salaryType = salaryTypes.length === 1 ? salaryTypes[0] : 'Mixed';
            const hourlyBase = hourlyProfiles.reduce((sum, profile) => {
                const paidLeaveHours = paidLeaveHoursForProfile({ profile, attendance, employee, period });
                return sum + Number(profile.hourly_rate || 0) * (Number(profile.profile_hours_worked || 0) + paidLeaveHours);
            }, 0);
            const hourlyProfileHours = hourlyProfiles.reduce((sum, profile) => (
                sum + Number(profile.profile_hours_worked || 0)
                + paidLeaveHoursForProfile({ profile, attendance, employee, period })
            ), 0);
            const monthlyBaseHourlyRate = compensationProfiles.reduce((sum, profile) => {
                if (profile.salary_type !== 'Monthly') return sum;
                const denominator = Number(profile.standard_days_per_period || 22)
                    * Number(profile.standard_hours_per_day || 8);
                return sum + (denominator > 0 ? Number(profile.base_salary || 0) / denominator : 0);
            }, 0);
            const hourlyRate = hourlyProfileHours > 0
                ? hourlyBase / hourlyProfileHours
                : monthlyBaseHourlyRate;
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
            const commissionOnly = Boolean(
                employee.termination_date
                && dateOnly(employee.termination_date) < dateOnly(period.start_date)
            );
            const contextBase = {
                baseGross,
                gross: baseGross,
                hourlyRate,
                overtimeHours: Math.max(0, hoursWorked - standardHours),
                absenceDays: Number(attendance.unexcused_absent_days || 0) + Number(attendance.half_days || 0),
                lateMinutes: Number(attendance.late_minutes || 0),
                earlyLeaveMinutes: Number(attendance.early_leave_minutes || 0),
                dailyRate: standardDays > 0 ? roundMoney(baseGross / standardDays) : 0,
                payableDays: payableDaysForRange(attendance, period.start_date, period.end_date),
                paidShifts: Number(attendance.paid_shift_units?.reduce((sum, shift) => sum + Number(shift.units || 0), 0) || 0),
                completedCases,
                netCollections
            };
            const applicableRules = inputs.rules.filter((rule) => {
                if (commissionOnly) return false;
                const metadata = typeof rule.metadata === 'string' ? JSON.parse(rule.metadata) : (rule.metadata || {});
                const targetUserIds = Array.isArray(metadata.targetUserIds) ? metadata.targetUserIds : [];
                const targetRoles = Array.isArray(metadata.targetRoles) ? metadata.targetRoles : [];
                if ((targetUserIds.length || targetRoles.length)
                    && !targetUserIds.includes(employee.user_id)
                    && !targetRoles.includes(employee.role)) return false;
                if (rule.rule_type === 'Bonus'
                    && metadata.bonusFrequency === 'OneTime'
                    && (rule.paid_user_ids || []).includes(employee.user_id)) return false;
                return true;
            });
            const ruleEarningLines = applicableRules
                .filter((rule) => ['Allowance', 'Bonus', 'Overtime'].includes(rule.rule_type))
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
            const ruleControlLines = applicableRules
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
            const employerContributionLines = applicableRules
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

            const employeeDeductions = commissionOnly ? [] : (inputs.deductionsByUser.get(employee.user_id) || []);
            const employeePenalties = commissionOnly ? [] : (inputs.penaltiesByUser.get(employee.user_id) || []);
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
                amount: calculateDeductionAmount(deduction, baseGross),
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
                        dailyRate: Number(profile.daily_rate || 0),
                        shiftRate: Number(profile.shift_rate || 0),
                        caseRate: Number(profile.case_rate || 0),
                        percentageRate: Number(profile.percentage_rate || 0),
                        effectiveFrom: profile.effective_from,
                        effectiveTo: profile.effective_to,
                        hoursWorked: Number(profile.profile_hours_worked || 0),
                        paidLeaveHours: paidLeaveHoursForProfile({ profile, attendance, employee, period })
                    })),
                    weightedMonthlySalary,
                    baseGross,
                    hourlyRate,
                    completedCases,
                    netCollections,
                    paidShifts: contextBase.paidShifts,
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
                skipped_employees = $8::jsonb,
                status = 'Calculated',
                updated_at = CURRENT_TIMESTAMP
            WHERE run_id = $1
            RETURNING *
        `, [run.run_id, totals.employeeCount, roundMoney(totals.gross), roundMoney(totals.deductions), roundMoney(totals.penalties), roundMoney(totals.net), roundMoney(totals.employerContributions), JSON.stringify(skippedEmployees)]);

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
        `, [run.run_id, period.status, JSON.stringify({ ...totals, skippedEmployees }), getUserId(req)]);

        if (skippedEmployees.length) {
            await client.query(`
                INSERT INTO payroll_audit_log (entity_type, entity_id, action, new_status, details, changed_by)
                VALUES ('payroll_run', $1, 'EMPLOYEES_SKIPPED', 'Calculated', $2::jsonb, $3)
            `, [run.run_id, JSON.stringify({ skippedEmployees }), getUserId(req)]);
        }

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

        // Skipped employees are an approval-blocking visibility issue: make
        // sure HR hears about it the moment the run is calculated.
        if (skippedEmployees.length) {
            for (const role of ['Admin', 'HR']) {
                triggerEventForRole(db, 'PayrollEmployeesSkipped', role, {
                    entityType: 'PayrollRun',
                    entityId: run.run_id,
                    variables: {
                        period_name: period.name || '',
                        skipped_count: skippedEmployees.length,
                        employee_names: skippedEmployees.map((item) => item.fullName).join(', ')
                    }
                }).catch(() => {});
            }
        }

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
        assertBranchAccess(req, run.branch_id || DEFAULT_BRANCH_ID);
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

        // Notify the payroll stakeholders at each hand-off so a run cannot
        // stall silently between maker-checker stages.
        if (['Reviewed', 'Approved', 'Paid', 'Locked', 'Cancelled'].includes(data.status)) {
            for (const role of ['Admin', 'Accountant', 'HR']) {
                triggerEventForRole(db, 'PayrollRunStatusChanged', role, {
                    entityType: 'PayrollRun',
                    entityId: runId,
                    variables: {
                        period_name: run.period_name || '',
                        status: data.status,
                        total_net: moneyNumber(run.total_net),
                        currency_code: run.currency_code || DEFAULT_CURRENCY
                    }
                }).catch(() => {});
            }
        }

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
    getMyPayrollPenalties,
    createPenalty,
    updatePenaltyStatus,
    acknowledgePenalty,
    resolvePenaltyDispute,
    getMyPayrollHistory,
    getPayrollRun,
    calculatePayroll,
    updatePayrollRunStatus,
    _private: {
        assertMakerChecker,
        calculateDeductionAmount,
        calculateCompensationAmount,
        calculateRuleAmount,
        capLineAmounts,
        inclusiveDays,
        loadCalculationInputs,
        monthlyAccrualFactor,
        overlapDays,
        payrollPaymentJournalEntries,
        paidLeaveHoursForProfile,
        proratedMonthlyAmount,
        summarizeAttendance,
        unpaidLeaveDeductionForProfile
    }
};
