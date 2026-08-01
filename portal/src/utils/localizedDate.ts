const getStoredPreferences = (): Record<string, any> => {
    try { return JSON.parse(localStorage.getItem('rcms_preferences') || '{}'); }
    catch { return {}; }
};

export const getPreferredTimeZone = (): string | undefined => {
    const timezone = getStoredPreferences().timezone;
    return timezone && timezone !== 'auto' ? timezone : undefined;
};

export const withPreferredTimeZone = (options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions => {
    const timeZone = getPreferredTimeZone();
    return timeZone ? { ...options, timeZone } : options;
};

export const formatLocalizedDate = (value: string | number | Date | null | undefined, locale?: string, options: Intl.DateTimeFormatOptions = {}): string => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, withPreferredTimeZone(options)).format(date);
};
