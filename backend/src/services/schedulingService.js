const { AppError } = require('../middleware/errorHandler');

const DEFAULT_WORKING_HOURS = { start: 0, end: 24, holidays: [], workingDays: [0, 1, 2, 3, 4, 5, 6] };

const parseWorkingHours = (raw) => {
    if (!raw) return { ...DEFAULT_WORKING_HOURS };
    let value;
    try {
        value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return { ...DEFAULT_WORKING_HOURS };
    }
    return {
        start: Number(value.start ?? value.startHour ?? DEFAULT_WORKING_HOURS.start),
        end: Number(value.end ?? value.endHour ?? DEFAULT_WORKING_HOURS.end),
        holidays: Array.isArray(value.holidays) ? value.holidays : [],
        workingDays: Array.isArray(value.workingDays)
            ? value.workingDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
            : [...DEFAULT_WORKING_HOURS.workingDays]
    };
};

const getWorkingHours = async (client) => {
    try {
        const settings = await client.query(`
            SELECT setting_key, setting_value
            FROM system_settings
            WHERE setting_key IN ('center.working_hours', 'center.timezone')
        `);
        const values = Object.fromEntries(
            (settings.rows || []).map(row => [row.setting_key, row.setting_value])
        );
        if (values['center.working_hours']) {
            return {
                ...parseWorkingHours(values['center.working_hours']),
                timezone: values['center.timezone'] || 'UTC'
            };
        }
    } catch {
        // Older deployments may only have center_settings; fall through to it.
    }

    try {
        const result = await client.query('SELECT working_hours FROM center_settings LIMIT 1');
        return parseWorkingHours(result.rows[0]?.working_hours);
    } catch {
        return { ...DEFAULT_WORKING_HOURS };
    }
};

const getLocalDateParts = (date, timezone = 'UTC') => {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone || 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday);
        return {
            date: `${values.year}-${values.month}-${values.day}`,
            weekday,
            hour: Number(values.hour) + Number(values.minute) / 60
        };
    } catch {
        return {
            date: date.toISOString().slice(0, 10),
            weekday: date.getUTCDay(),
            hour: date.getUTCHours() + date.getUTCMinutes() / 60
        };
    }
};

const assertWithinWorkingHours = (startTime, endTime, workingHours) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const {
        start: hourStart = 0,
        end: hourEnd = 24,
        holidays = [],
        workingDays = DEFAULT_WORKING_HOURS.workingDays,
        timezone = 'UTC'
    } = workingHours || {};
    const localStart = getLocalDateParts(start, timezone);
    const localEnd = getLocalDateParts(end, timezone);

    if (holidays.includes(localStart.date) || holidays.includes(localEnd.date)) {
        throw new AppError('Appointments cannot be scheduled on a center holiday.', 400);
    }
    if (!workingDays.includes(localStart.weekday) || !workingDays.includes(localEnd.weekday)) {
        throw new AppError('Appointments cannot be scheduled on a non-working day.', 400);
    }

    // Support 24/7 radiology operations & flexible appointment booking
    // Only enforce if restrictive range is explicitly configured (e.g. non-24h)
    // and both start and end are restricted.
    if (hourStart === 0 && hourEnd >= 24) {
        return;
    }

    if (localStart.date !== localEnd.date || localStart.hour < hourStart || localEnd.hour > hourEnd) {
        throw new AppError(`Appointments must be within configured working hours (${hourStart}:00-${hourEnd}:00).`, 400);
    }
};

module.exports = {
    DEFAULT_WORKING_HOURS,
    getWorkingHours,
    assertWithinWorkingHours,
    parseWorkingHours,
    getLocalDateParts
};
