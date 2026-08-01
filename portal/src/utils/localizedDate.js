const getStoredPreferences = () => {
    try { return JSON.parse(localStorage.getItem('rcms_preferences') || '{}'); }
    catch { return {}; }
};

export const getPreferredTimeZone = () => {
    const timezone = getStoredPreferences().timezone;
    return timezone && timezone !== 'auto' ? timezone : undefined;
};

export const withPreferredTimeZone = (options = {}) => {
    const timeZone = getPreferredTimeZone();
    return timeZone ? { ...options, timeZone } : options;
};

export const formatLocalizedDate = (value, locale, options = {}) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, withPreferredTimeZone(options)).format(date);
};
