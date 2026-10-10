const LEAVE_TYPES_WITH_BALANCE = Object.freeze(['Sick', 'Vacation', 'Personal']);
const DEFAULT_LEAVE_ENTITLEMENTS = Object.freeze({
    Vacation: Number(process.env.LEAVE_VACATION_DAYS || 21),
    Sick: Number(process.env.LEAVE_SICK_DAYS || 14),
    Personal: Number(process.env.LEAVE_PERSONAL_DAYS || 7)
});

const toDateOnlyString = (value) => {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const str = String(value);
    return str.slice(0, 10);
};

// Working days (Friday and Saturday excluded), consistent with how payroll
// counts unpaid-leave deduction days, so balances and payslips agree.
const workingDays = (startDate, endDate) => {
    const sStr = toDateOnlyString(startDate);
    const eStr = toDateOnlyString(endDate);
    if (!sStr || !eStr) return 0;
    let count = 0;
    const cursor = new Date(`${sStr}T00:00:00Z`);
    const last = new Date(`${eStr}T00:00:00Z`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) return 0;
    while (cursor <= last) {
        const weekday = cursor.getUTCDay();
        if (weekday !== 5 && weekday !== 6) count += 1;
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
};

// Split a leave range into per-year segments so a request crossing New Year
// consumes from both years' balances.
const workingDaysByYear = (startDate, endDate) => {
    const sStr = toDateOnlyString(startDate);
    const eStr = toDateOnlyString(endDate);
    if (!sStr || !eStr) return [];
    const segments = [];
    let cursor = sStr;
    while (cursor <= eStr) {
        const year = Number(cursor.slice(0, 4));
        const yearEnd = `${year}-12-31`;
        segments.push({ year, days: workingDays(cursor, eStr < yearEnd ? eStr : yearEnd) });
        cursor = `${year + 1}-01-01`;
    }
    return segments;
};

const getLeaveEntitlement = (overrides, leaveType, year) => {
    const override = (overrides || []).find((row) => row.year === year && row.leave_type === leaveType);
    return Number(override?.entitlement_days ?? DEFAULT_LEAVE_ENTITLEMENTS[leaveType] ?? 0);
};

const computeLeaveBalances = async (db, userIds, year) => {
    const users = Array.isArray(userIds) && userIds.length ? userIds : null;
    const overrides = await db.query(`
        SELECT user_id, year, leave_type, entitlement_days
        FROM leave_balances
        WHERE year = $1
          ${users ? 'AND user_id = ANY($2::uuid[])' : ''}
    `, users ? [year, users] : [year]);
    const used = await db.query(`
        SELECT user_id, leave_type, start_date, end_date
        FROM leave_requests
        WHERE status = 'Approved'
          AND leave_type = ANY($1::varchar[])
          AND start_date <= make_date($2::int, 12, 31)
          AND end_date >= make_date($2::int, 1, 1)
          ${users ? 'AND user_id = ANY($3::uuid[])' : ''}
    `, users ? [LEAVE_TYPES_WITH_BALANCE, year, users] : [LEAVE_TYPES_WITH_BALANCE, year]);

    const usedByUser = new Map();
    for (const row of used.rows) {
        const perUser = usedByUser.get(row.user_id) || new Map();
        for (const segment of workingDaysByYear(row.start_date, row.end_date)) {
            if (segment.year !== year) continue;
            perUser.set(row.leave_type, (perUser.get(row.leave_type) || 0) + segment.days);
        }
        usedByUser.set(row.user_id, perUser);
    }

    return (users || []).map((userId) => {
        const userOverrides = overrides.rows.filter((row) => row.user_id === userId);
        const usedMap = usedByUser.get(userId) || new Map();
        return {
            userId,
            year,
            balances: LEAVE_TYPES_WITH_BALANCE.map((leaveType) => {
                const entitlement = getLeaveEntitlement(userOverrides, leaveType, year);
                const usedDays = usedMap.get(leaveType) || 0;
                return {
                    leaveType,
                    entitlementDays: entitlement,
                    usedDays,
                    remainingDays: Number((entitlement - usedDays).toFixed(1))
                };
            })
        };
    });
};

module.exports = {
    LEAVE_TYPES_WITH_BALANCE,
    DEFAULT_LEAVE_ENTITLEMENTS,
    toDateOnlyString,
    workingDays,
    workingDaysByYear,
    getLeaveEntitlement,
    computeLeaveBalances
};
