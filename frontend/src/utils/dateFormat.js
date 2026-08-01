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
    const numMinutes = Number(minutes) || 0;
    if (numMinutes < 60) {
        return new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(numMinutes);
    } else if (numMinutes < 24 * 60) {
        const hours = Math.round(numMinutes / 60);
        return new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'long' }).format(hours);
    } else if (numMinutes < 7 * 24 * 60) {
        const days = Math.round(numMinutes / (24 * 60));
        return new Intl.NumberFormat(locale, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(days);
    } else if (numMinutes < 30 * 24 * 60) {
        const weeks = Math.round(numMinutes / (7 * 24 * 60));
        return new Intl.NumberFormat(locale, { style: 'unit', unit: 'week', unitDisplay: 'long' }).format(weeks);
    } else if (numMinutes < 365 * 24 * 60) {
        const months = Math.round(numMinutes / (30 * 24 * 60));
        return new Intl.NumberFormat(locale, { style: 'unit', unit: 'month', unitDisplay: 'long' }).format(months);
    } else {
        const years = Math.round(numMinutes / (365 * 24 * 60));
        return new Intl.NumberFormat(locale, { style: 'unit', unit: 'year', unitDisplay: 'long' }).format(years);
    }
};
