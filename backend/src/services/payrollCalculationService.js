const Decimal = require('decimal.js');
const { AppError } = require('../middleware/errorHandler');
const {
    DEFAULT_BRANCH_ID,
    DEFAULT_CURRENCY,
    moneyNumber
} = require('./financialPostingService');

const roundMoney = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    try {
        const amount = new Decimal(value);
        if (!amount.isFinite()) throw new AppError('Invalid monetary value encountered during payroll calculation', 500);
        return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('Invalid monetary value encountered during payroll calculation', 500);
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
    if (rule.calculation_method === 'PercentageOfCollections') {
        return roundMoney(Number(context.netCollections || 0) * (value / 100));
    }
    if (rule.calculation_method === 'HourlyMultiplier') {
        return roundMoney(context.overtimeHours * context.hourlyRate * Math.max(0, value - 1));
    }
    if (rule.calculation_method === 'PerDay') {
        if (rule.rule_type === 'Absence') return roundMoney(context.absenceDays * context.dailyRate * value);
        return roundMoney(Number(context.payableDays || 0) * value);
    }
    if (rule.calculation_method === 'PerShift') return roundMoney(Number(context.paidShifts || 0) * value);
    if (rule.calculation_method === 'PerCase') return roundMoney(Number(context.completedCases || 0) * value);
    if (rule.calculation_method === 'PerMinute') {
        const minutes = rule.rule_type === 'EarlyLeave' ? context.earlyLeaveMinutes : context.lateMinutes;
        return roundMoney(minutes * value);
    }
    return 0;
};

const ruleLineType = (ruleType) => {
    if (['Allowance', 'Bonus', 'Overtime'].includes(ruleType)) return 'Earning';
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
    if (method === 'BankTransfer') return ['1010', 'Bank transfer clearing'];
    throw new AppError('Unsupported payroll payment method', 400);
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

const calculateCompensationAmount = (profile, context) => {
    switch (profile.salary_type) {
        case 'Monthly':
            return proratedMonthlyAmount(profile.base_salary, context.segmentStart, context.segmentEnd);
        case 'Hourly':
            return roundMoney(Number(profile.hourly_rate || 0) * (
                Number(context.profileHoursWorked || 0) + Number(context.paidLeaveHours || 0)
            ));
        case 'Daily':
            return roundMoney(Number(profile.daily_rate || 0) * Number(context.payableDays || 0));
        case 'PerShift':
            return roundMoney(Number(profile.shift_rate || 0) * Number(context.paidShifts || 0));
        case 'PerCase':
            return roundMoney(Number(profile.case_rate || 0) * Number(context.completedCases || 0));
        case 'ShiftAndCase':
            return roundMoney(
                Number(profile.shift_rate || 0) * Number(context.paidShifts || 0)
                + Number(profile.case_rate || 0) * Number(context.completedCases || 0)
            );
        case 'Percentage':
            return roundMoney(Math.max(0, Number(context.netCollections || 0)) * Number(profile.percentage_rate || 0) / 100);
        default:
            throw new Error(`Unsupported compensation type: ${profile.salary_type}`);
    }
};

const dateFallsWithin = (value, startDate, endDate) => {
    const date = dateOnly(value);
    return date >= dateOnly(startDate) && date <= dateOnly(endDate);
};

const netCollectionsForProfile = ({ caseMetrics, profile, employee, payrollEndDate }) => {
    const eligibleFrom = laterDate(profile.effective_from, employee.hire_date);
    const eligibleTo = earlierDate(profile.effective_to, employee.termination_date) || payrollEndDate;
    return roundMoney(Math.max(0, caseMetrics
        .filter((metric) => (
            metric.collection_date
            && dateFallsWithin(metric.eligible_date, eligibleFrom, eligibleTo)
        ))
        .reduce((sum, metric) => sum + Number(metric.net_collection_amount || 0), 0)));
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

const payableDaysForRange = (attendance, segmentStart, segmentEnd) => {
    const workUnits = (attendance.worked_day_units || [])
        .filter((item) => dateFallsWithin(item.date, segmentStart, segmentEnd))
        .reduce((sum, item) => sum + Number(item.units || 0), 0);
    const leaveDates = new Set((attendance.paid_leave_shifts || [])
        .map((shift) => cairoDateKey(shift.start_time))
        .filter((date) => dateFallsWithin(date, segmentStart, segmentEnd)));
    const workedDates = new Set((attendance.worked_day_units || []).map((item) => item.date));
    return workUnits + [...leaveDates].filter((date) => !workedDates.has(date)).length;
};

const payableDaysForProfile = ({ profile, attendance, employee, period }) => {
    const segmentStart = laterDate(period.start_date, profile.effective_from, employee.hire_date);
    const segmentEnd = earlierDate(period.end_date, profile.effective_to, employee.termination_date);
    return payableDaysForRange(attendance, segmentStart, segmentEnd);
};

const payableShiftsForProfile = ({ profile, attendance, employee, period }) => {
    const segmentStart = laterDate(period.start_date, profile.effective_from, employee.hire_date);
    const segmentEnd = earlierDate(period.end_date, profile.effective_to, employee.termination_date);
    return (attendance.paid_shift_units || [])
        .filter((item) => dateFallsWithin(item.date, segmentStart, segmentEnd))
        .reduce((sum, item) => sum + Number(item.units || 0), 0);
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
    const paidShiftUnits = [];
    const workedDayUnitsByDate = new Map();
    for (const log of logs) {
        if (!log.clockIn || !log.clockOut || log.status === 'Absent') continue;
        const date = cairoDateKey(log.clockIn);
        const units = log.status === 'Half-Day' ? 0.5 : 1;
        workedDayUnitsByDate.set(date, Math.max(workedDayUnitsByDate.get(date) || 0, units));
    }
    for (const shift of shifts) {
        const shiftDate = cairoDateKey(shift.start_time);
        const shiftStart = new Date(shift.start_time).getTime();
        const shiftEnd = new Date(shift.end_time).getTime();
        const coveredLogs = logs.filter((log) => {
            if (!log.clockOut || log.status === 'Absent') return false;
            if (log.shiftId && log.shiftId === shift.shift_id) return true;
            const logStart = new Date(log.clockIn).getTime();
            const logEnd = new Date(log.clockOut).getTime();
            return logStart < shiftEnd && logEnd > shiftStart;
        });
        const covered = coveredLogs.length > 0;
        if (covered) {
            paidShiftUnits.push({
                date: shiftDate,
                units: coveredLogs.every((log) => log.status === 'Half-Day') ? 0.5 : 1
            });
        }
        if (paidLeaveDates.has(shiftDate)) {
            if (!covered) {
                paidLeaveShifts.push(shift);
                paidShiftUnits.push({ date: shiftDate, units: 1 });
            }
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
        paid_shift_units: paidShiftUnits,
        worked_day_units: [...workedDayUnitsByDate].map(([date, units]) => ({ date, units })),
        logs
    };
};

const loadCalculationInputs = async (client, period) => {
    const branchId = period.branch_id || DEFAULT_BRANCH_ID;
    const currencyCode = period.currency_code || DEFAULT_CURRENCY;

    const employees = await client.query(`
        SELECT u.user_id, u.full_name, u.email, u.role,
               ep.hire_date, ep.termination_date, ep.employment_status
        FROM users u
        JOIN employee_profiles ep ON ep.user_id = u.user_id
        WHERE u.role = ANY($3::user_role[])
          AND ep.payroll_branch_id = $4::uuid
          AND (u.is_active = TRUE OR ep.termination_date IS NOT NULL)
          AND (ep.hire_date IS NULL OR ep.hire_date <= $2::date)
        ORDER BY u.full_name ASC
    `, [period.start_date, period.end_date, PAYROLL_EMPLOYEE_ROLES, branchId]);

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
        WHERE (cp.is_active = TRUE OR cp.salary_type = 'Percentage')
          AND cp.branch_id = $3::uuid
          AND cp.currency_code = $4
          AND (
              (cp.salary_type = 'Monthly' AND cp.base_salary > 0)
              OR (cp.salary_type = 'Hourly' AND cp.hourly_rate > 0)
              OR (cp.salary_type = 'Daily' AND cp.daily_rate > 0)
              OR (cp.salary_type = 'PerShift' AND cp.shift_rate > 0)
              OR (cp.salary_type = 'PerCase' AND cp.case_rate > 0)
              OR (cp.salary_type = 'ShiftAndCase' AND cp.shift_rate > 0 AND cp.case_rate > 0)
              OR (cp.salary_type = 'Percentage' AND cp.percentage_rate > 0)
          )
          AND cp.effective_from <= $2::date
          AND (
              cp.effective_to IS NULL
              OR cp.effective_to >= $1::date
              OR cp.salary_type = 'Percentage'
          )
          AND (ep.hire_date IS NULL OR ep.hire_date <= $2::date)
        ORDER BY cp.user_id, cp.effective_from ASC, cp.created_at ASC
    `, [period.start_date, period.end_date, branchId, currencyCode]);

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
        WHERE a.user_id IN (SELECT ep2.user_id FROM employee_profiles ep2 WHERE ep2.payroll_branch_id = $3::uuid)
          AND a.clock_in < b.period_end
          AND (a.clock_out IS NULL OR a.clock_out > b.period_start)
        GROUP BY a.user_id
    `, [period.start_date, period.end_date, branchId]);

    const shifts = await client.query(`
        SELECT s.*,
               GREATEST(s.start_time, ($1::date::timestamp AT TIME ZONE 'Africa/Cairo')) AS period_start_time,
               LEAST(s.end_time, (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo')) AS period_end_time
        FROM staff_shifts s
        WHERE s.user_id IN (SELECT ep2.user_id FROM employee_profiles ep2 WHERE ep2.payroll_branch_id = $3::uuid)
          AND s.start_time < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo')
          AND s.end_time > ($1::date::timestamp AT TIME ZONE 'Africa/Cairo')
        ORDER BY s.start_time ASC
    `, [period.start_date, period.end_date, branchId]);

    const leaves = await client.query(`
        SELECT l.* FROM leave_requests l
        WHERE l.status = 'Approved' AND l.start_date <= $2::date AND l.end_date >= $1::date
          AND l.user_id IN (SELECT ep2.user_id FROM employee_profiles ep2 WHERE ep2.payroll_branch_id = $3::uuid)
        ORDER BY l.start_date ASC
    `, [period.start_date, period.end_date, branchId]);

    const caseMetrics = await client.query(`
        WITH eligible_cases AS (
            SELECT assignments.exam_id, assignments.user_id, MIN(assignments.eligible_at) AS eligible_at
            FROM (
                SELECT e.exam_id, a.technician_id AS user_id, e.exam_completed_at AS eligible_at
                FROM examinations e
                JOIN appointments a ON a.appointment_id = e.appointment_id
                WHERE a.technician_id IS NOT NULL
                  AND e.exam_completed_at IS NOT NULL
                  AND e.exam_completed_at < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo')
                UNION ALL
                SELECT e.exam_id, a.nurse_id AS user_id, e.exam_completed_at AS eligible_at
                FROM examinations e
                JOIN appointments a ON a.appointment_id = e.appointment_id
                WHERE a.nurse_id IS NOT NULL
                  AND e.exam_completed_at IS NOT NULL
                  AND e.exam_completed_at < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo')
                UNION ALL
                SELECT e.exam_id, e.performing_radiologist_id AS user_id, e.report_finalized_at AS eligible_at
                FROM examinations e
                WHERE e.performing_radiologist_id IS NOT NULL
                  AND e.report_finalized_at IS NOT NULL
                  AND e.report_status = 'Finalized'
                  AND e.report_finalized_at < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Cairo')
            ) assignments
            GROUP BY assignments.exam_id, assignments.user_id
        ),
        cash_flows AS (
            SELECT p.invoice_id, p.business_date, p.amount::numeric AS amount
            FROM payments p
            WHERE p.payment_status = 'Completed'
              AND p.business_date BETWEEN $1::date AND $2::date
            UNION ALL
            SELECT COALESCE(cr.invoice_id, ic.invoice_id), cr.business_date, cr.amount::numeric
            FROM claim_receipts cr
            JOIN insurance_claims ic ON ic.claim_id = cr.claim_id
            WHERE cr.business_date BETWEEN $1::date AND $2::date
              AND COALESCE(cr.invoice_id, ic.invoice_id) IS NOT NULL
            UNION ALL
            SELECT r.invoice_id, r.business_date, -r.amount::numeric
            FROM refunds r
            WHERE r.status = 'Processed'
              AND r.business_date BETWEEN $1::date AND $2::date
            UNION ALL
            SELECT cn.invoice_id, cn.business_date, -cn.net_amount::numeric
            FROM credit_notes cn
            WHERE cn.reversed_at IS NULL
              AND cn.refund_id IS NULL
              AND cn.business_date BETWEEN $1::date AND $2::date
        ),
        allocated_collections AS (
            SELECT ec.user_id, ec.exam_id, ec.eligible_at,
                   cf.business_date,
                   SUM(
                       cf.amount
                       * GREATEST(i.subtotal_amount - COALESCE(i.discount_amount, 0), 0)
                       / NULLIF(i.total_amount, 0)
                       * GREATEST(ii.total_amount, 0)
                       / NULLIF(i.subtotal_amount, 0)
                   )::numeric AS net_collection_amount
            FROM eligible_cases ec
            JOIN invoice_items ii ON ii.exam_id = ec.exam_id
            JOIN invoices i ON i.invoice_id = ii.invoice_id
            JOIN cash_flows cf ON cf.invoice_id = i.invoice_id
            WHERE i.branch_id = $3::uuid
              AND i.currency_code = $4
              AND i.invoice_status <> 'Voided'
              AND i.total_amount > 0
              AND i.subtotal_amount > 0
            GROUP BY ec.user_id, ec.exam_id, ec.eligible_at, cf.business_date
        )
        SELECT ec.user_id, ec.exam_id, ec.eligible_at::date AS eligible_date,
               ac.business_date AS collection_date,
               COALESCE(ac.net_collection_amount, 0)::numeric AS net_collection_amount
        FROM eligible_cases ec
        LEFT JOIN allocated_collections ac
          ON ac.user_id = ec.user_id
         AND ac.exam_id = ec.exam_id
         AND ac.eligible_at = ec.eligible_at
        WHERE ec.user_id IN (
            SELECT ep2.user_id FROM employee_profiles ep2 WHERE ep2.payroll_branch_id = $3::uuid
        )
    `, [period.start_date, period.end_date, branchId, currencyCode]);

    const deductions = await client.query(`
        SELECT * FROM employee_deductions
        WHERE status = 'Approved'
          AND branch_id = $4::uuid
          AND currency_code = $5
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
          AND (recurrence_type <> 'Recurring' OR max_occurrences IS NULL OR applied_occurrences < max_occurrences)
          AND start_date <= $2::date
          AND (end_date IS NULL OR end_date >= $1::date)
          AND (payroll_period_id IS NULL OR payroll_period_id = $3::uuid)
        ORDER BY created_at ASC
        FOR UPDATE
    `, [period.start_date, period.end_date, period.period_id, branchId, currencyCode]);

    const penalties = await client.query(`
        SELECT * FROM employee_penalties
        WHERE status = 'Approved'
          AND remaining_amount > 0
          AND branch_id = $2::uuid
          AND currency_code = $3
          AND COALESCE(acknowledgement_status, 'Pending') <> 'Disputed'
          AND (payroll_period_id IS NULL OR payroll_period_id = $1::uuid)
        ORDER BY created_at ASC
        FOR UPDATE
    `, [period.period_id, branchId, currencyCode]);

    const rules = await client.query(`
        SELECT r.*,
               COALESCE((
                   SELECT jsonb_agg(paid.user_id)
                   FROM (
                       SELECT DISTINCT pei.user_id
                       FROM payroll_line_items li
                       JOIN payroll_employee_items pei ON pei.item_id = li.payroll_employee_item_id
                       JOIN payroll_runs pr ON pr.run_id = li.run_id
                       WHERE li.source_type = 'payroll_rules'
                         AND li.source_id = r.rule_id
                         AND pr.status IN ('Paid', 'Locked')
                   ) paid
               ), '[]'::jsonb) AS paid_user_ids
        FROM payroll_rules r
        WHERE r.is_active = TRUE AND r.status = 'Approved'
          AND r.branch_id = $3::uuid
          AND r.currency_code = $4
          AND r.value > 0
          AND (r.calculation_method <> 'HourlyMultiplier' OR r.value > 1)
          AND (
              (r.rule_type = 'Overtime' AND r.calculation_method IN ('HourlyMultiplier', 'FixedAmount', 'PercentageOfBase'))
              OR (r.rule_type IN ('Late', 'EarlyLeave') AND r.calculation_method IN ('PerMinute', 'FixedAmount'))
              OR (r.rule_type = 'Absence' AND r.calculation_method IN ('PerDay', 'FixedAmount'))
              OR (r.rule_type IN ('Allowance', 'Bonus')
                  AND r.calculation_method IN (
                      'FixedAmount', 'PercentageOfBase', 'PercentageOfGross',
                      'PercentageOfCollections', 'PerDay', 'PerShift', 'PerCase'
                  ))
              OR (r.rule_type IN ('Deduction', 'Penalty', 'EmployerContribution')
                  AND r.calculation_method IN ('FixedAmount', 'PercentageOfBase', 'PercentageOfGross'))
          )
          AND r.effective_from <= $2::date
          AND (r.effective_to IS NULL OR r.effective_to >= $1::date)
        ORDER BY r.rule_type ASC, r.created_at ASC
    `, [period.start_date, period.end_date, branchId, currencyCode]);

    const attendanceMap = new Map(attendance.rows.map((row) => [row.user_id, row]));
    const shiftsByUser = groupRowsByUser(shifts.rows);
    const leavesByUser = groupRowsByUser(leaves.rows);
    return {
        employees: employees.rows,
        rules: rules.rows,
        caseMetricsByUser: groupRowsByUser(caseMetrics.rows),
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

const calculateDeductionAmount = (deduction, baseGross) => {
    if (deduction.deduction_type === 'Percentage') {
        return roundMoney(baseGross * (Number(deduction.percentage || 0) / 100));
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
                applied_occurrences = d.applied_occurrences + 1,
                status = CASE
                    WHEN d.recurrence_type = 'OneTime' THEN 'Completed'
                    WHEN d.deduction_type IN ('Installment', 'Advance', 'Loan')
                     AND GREATEST(0::numeric, COALESCE(d.remaining_amount, d.total_amount, d.amount) - applied.applied_amount) <= 0
                        THEN 'Completed'
                    WHEN d.recurrence_type = 'Recurring'
                     AND d.max_occurrences IS NOT NULL
                     AND d.applied_occurrences + 1 >= d.max_occurrences
                        THEN 'Completed'
                    ELSE d.status
                END,
                payroll_period_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            FROM applied
            WHERE d.deduction_id = applied.deduction_id
              AND (
                  d.deduction_type IN ('Installment', 'Advance', 'Loan')
                                    OR d.recurrence_type IN ('OneTime', 'Recurring')
              )
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

module.exports = {
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
};
