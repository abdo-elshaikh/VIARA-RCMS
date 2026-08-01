const { AppError } = require('../middleware/errorHandler');

const DEFAULT_WORKING_HOURS = { start: 6, end: 22, holidays: [] };

const parseWorkingHours = (raw) => {
    if (!raw) return { ...DEFAULT_WORKING_HOURS };
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
        start: Number(value.start ?? value.startHour ?? DEFAULT_WORKING_HOURS.start),
        end: Number(value.end ?? value.endHour ?? DEFAULT_WORKING_HOURS.end),
        holidays: Array.isArray(value.holidays) ? value.holidays : []
    };
};

const getWorkingHours = async (client) => {
    try {
        const result = await client.query('SELECT working_hours FROM center_settings LIMIT 1');
        return parseWorkingHours(result.rows[0]?.working_hours);
    } catch {
        return { ...DEFAULT_WORKING_HOURS };
    }
};

const isHoliday = (date, holidays) => {
    const day = date.toISOString().slice(0, 10);
    return holidays.includes(day);
};

const assertWithinWorkingHours = (startTime, endTime, workingHours) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const { start: hourStart, end: hourEnd, holidays } = workingHours;

    // #5 — Use UTC hours so the check is timezone-consistent regardless of server process timezone.
    // Center working_hours config values are interpreted as UTC hours.
    if (isHoliday(start, holidays) || isHoliday(end, holidays)) {
        throw new AppError('Appointments cannot be scheduled on a center holiday.', 400);
    }

    const startHour = start.getUTCHours();
    const endHour = end.getUTCHours();
    const endMin = end.getUTCMinutes();

    if (startHour < hourStart || endHour > hourEnd
        || (endHour === hourEnd && endMin > 0)) {
        throw new AppError(`Appointments must be scheduled between ${hourStart}:00 and ${hourEnd}:00 UTC.`, 400);
    }
};

module.exports = {
    DEFAULT_WORKING_HOURS,
    getWorkingHours,
    assertWithinWorkingHours,
    parseWorkingHours
};
