const { z } = require('zod');

const isValidCalendarDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
};

const calendarDateSchema = (message = 'Invalid calendar date') => z.string()
    .refine(isValidCalendarDate, message);

module.exports = { isValidCalendarDate, calendarDateSchema };
