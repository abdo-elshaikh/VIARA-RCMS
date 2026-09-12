const getStoredPreferences = () => {
    try { return JSON.parse(localStorage.getItem('VIARA_preferences') || '{}'); }
    catch { return {}; }
};

export const getPreferredTimeZone = () => {
    const timezone = getStoredPreferences().timezone;
    return timezone && timezone !== 'auto' ? timezone : undefined;
};

export const withPreferredTimeZone = (options = {}) => {
    const preferences = getStoredPreferences();
    const timeZone = getPreferredTimeZone();
    const next = timeZone ? { ...options, timeZone } : { ...options };
    const includesTime = ['hour', 'minute', 'second', 'timeStyle'].some((key) => key in next);
    if (includesTime && !('hour12' in next) && !('hourCycle' in next)) {
        if (preferences.timeFormat === '12h') next.hour12 = true;
        if (preferences.timeFormat === '24h') next.hour12 = false;
    }
    return next;
};

export const formatPreferredNumericDate = (value, locale) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const preferences = getStoredPreferences();
    const formatter = new Intl.DateTimeFormat(locale, withPreferredTimeZone({
        day: '2-digit', month: '2-digit', year: 'numeric'
    }));
    const parts = Object.fromEntries(
        formatter.formatToParts(date)
            .filter(({ type }) => ['day', 'month', 'year'].includes(type))
            .map(({ type, value: partValue }) => [type, partValue])
    );
    const order = preferences.dateFormat === 'MM/DD/YYYY'
        ? ['month', 'day', 'year']
        : preferences.dateFormat === 'YYYY-MM-DD'
            ? ['year', 'month', 'day']
            : ['day', 'month', 'year'];
    const separator = preferences.dateFormat === 'YYYY-MM-DD' ? '-' : '/';
    return order.map((key) => parts[key]).join(separator);
};

export const formatLocalizedDate = (value, locale, options = {}) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    if (Object.keys(options).length === 0) return formatPreferredNumericDate(date, locale);
    return new Intl.DateTimeFormat(locale, withPreferredTimeZone(options)).format(date);
};

export const formatDateTime = (value, locale) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const datePart = formatPreferredNumericDate(date, locale);
    const timePart = new Intl.DateTimeFormat(locale, withPreferredTimeZone({
        hour: '2-digit', minute: '2-digit'
    })).format(date);
    return `${datePart} · ${timePart}`;
};
