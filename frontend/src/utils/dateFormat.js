export const formatShortDate = (value, locale) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale, {
        month: 'short', day: 'numeric', year: 'numeric'
    });
};

export const formatRelativeTime = (value, locale) => {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '';
    const seconds = Math.round((timestamp - Date.now()) / 1000);
    const units = [
        ['year', 31536000], ['month', 2592000], ['week', 604800],
        ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]
    ];
    const [unit, divisor] = units.find(([, size]) => Math.abs(seconds) >= size) || units.at(-1);
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
};

export const formatDuration = (minutes, locale = 'en') => {
    const totalMinutes = Math.max(0, Math.round(Number(minutes) || 0));
    const formatter = (value, unit) => new Intl.NumberFormat(locale, {
        style: 'unit', unit, unitDisplay: 'long'
    }).format(value);

    if (totalMinutes < 60) return formatter(totalMinutes, 'minute');
    if (totalMinutes < 24 * 60) {
        const hours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        return remainingMinutes ? `${formatter(hours, 'hour')} ${formatter(remainingMinutes, 'minute')}` : formatter(hours, 'hour');
    }
    if (totalMinutes < 7 * 24 * 60) {
        const days = Math.floor(totalMinutes / (24 * 60));
        const remainingHours = Math.floor((totalMinutes % (24 * 60)) / 60);
        return remainingHours ? `${formatter(days, 'day')} ${formatter(remainingHours, 'hour')}` : formatter(days, 'day');
    }

    const weeks = Math.floor(totalMinutes / (7 * 24 * 60));
    const remainingDays = Math.floor((totalMinutes % (7 * 24 * 60)) / (24 * 60));
    return remainingDays ? `${formatter(weeks, 'week')} ${formatter(remainingDays, 'day')}` : formatter(weeks, 'week');
};
