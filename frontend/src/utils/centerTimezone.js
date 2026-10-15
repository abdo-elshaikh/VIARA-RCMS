const DEFAULT_CENTER_TIMEZONE = 'Africa/Cairo';

const getZonedParts = (date, timezone) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

export const getCenterTimezone = (timezone) => timezone || DEFAULT_CENTER_TIMEZONE;

export const dateInputInTimezone = (date = new Date(), timezone = DEFAULT_CENTER_TIMEZONE) => {
    const parts = getZonedParts(date, timezone);
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const addDaysToDateInput = (date, days) => {
    const [year, month, day] = date.split('-').map(Number);
    const result = new Date(Date.UTC(year, month - 1, day + days));
    return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
};

export const nextTimeInTimezone = (date = new Date(), timezone = DEFAULT_CENTER_TIMEZONE) => {
    const parts = getZonedParts(date, timezone);
    const rounded = new Date(Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute) + 30
    ));
    const remainder = rounded.getUTCMinutes() % 15;
    if (remainder) rounded.setUTCMinutes(rounded.getUTCMinutes() + 15 - remainder);
    return `${String(rounded.getUTCHours()).padStart(2, '0')}:${String(rounded.getUTCMinutes()).padStart(2, '0')}`;
};

export const dateTimeInTimezone = (date, time, timezone = DEFAULT_CENTER_TIMEZONE) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(`${date}T${time}`);
    if (!match) return null;

    const [, year, month, day, hour, minute] = match.map(Number);
    const wallTime = Date.UTC(year, month - 1, day, hour, minute);
    let instant = wallTime;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = getZonedParts(new Date(instant), timezone);
        const representedWallTime = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute)
        );
        const adjustment = wallTime - representedWallTime;
        if (!adjustment) break;
        instant += adjustment;
    }

    const result = new Date(instant);
    const parts = getZonedParts(result, timezone);
    if (
        Number(parts.year) !== year ||
        Number(parts.month) !== month ||
        Number(parts.day) !== day ||
        Number(parts.hour) !== hour ||
        Number(parts.minute) !== minute
    ) {
        return null;
    }

    return result;
};

export const centerDayBounds = (date, timezone = DEFAULT_CENTER_TIMEZONE) => {
    const start = dateTimeInTimezone(date, '00:00', timezone);
    const nextDay = addDaysToDateInput(date, 1);
    const end = dateTimeInTimezone(nextDay, '00:00', timezone);
    return start && end ? { start: start.toISOString(), end: end.toISOString() } : null;
};
