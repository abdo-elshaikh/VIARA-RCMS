export const isValidTimezone = (tz) => {
    if (!tz || typeof tz !== 'string') return false;
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
    } catch {
        return false;
    }
};

export const getTimezoneOffsetString = (tz, date = new Date()) => {
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(date);
        return parts.find(part => part.type === 'timeZoneName')?.value || 'GMT+00:00';
    } catch {
        return 'GMT+00:00';
    }
};

export const getTimezoneOffsetMinutes = (tz, date = new Date()) => {
    const match = getTimezoneOffsetString(tz, date).match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!match) return 0;
    return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
};

export const formatZonedTime = (tz, date = new Date(), is24h = true) => {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: is24h ? 'h23' : 'h12'
        }).format(date);
    } catch {
        return '--:--';
    }
};
