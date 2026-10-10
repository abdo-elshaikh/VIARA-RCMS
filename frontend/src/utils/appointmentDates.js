export const toDateInput = (date = new Date()) => {
    const value = new Date(date);
    value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
    return value.toISOString().slice(0, 10);
};

export const getRange = (anchorDate, viewMode, firstDayOfWeek = 1) => {
    const anchor = new Date(`${anchorDate}T00:00:00`);
    const start = new Date(anchor);
    const end = new Date(anchor);

    if (viewMode === 'week') {
        const day = start.getDay();
        const normalizedFirstDay = [0, 1, 6].includes(Number(firstDayOfWeek)) ? Number(firstDayOfWeek) : 1;
        const diff = -((day - normalizedFirstDay + 7) % 7);
        start.setDate(start.getDate() + diff);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 6);
    } else if (viewMode === 'month') {
        start.setDate(1);
        end.setMonth(start.getMonth() + 1, 0);
    }

    return { startDate: toDateInput(start), endDate: toDateInput(end) };
};

export const shiftAnchorDate = (value, viewMode, direction) => {
    const next = new Date(`${value}T00:00:00`);
    if (viewMode === 'month') {
        const preferredDay = next.getDate();
        next.setDate(1);
        next.setMonth(next.getMonth() + direction);
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(preferredDay, lastDay));
    } else {
        next.setDate(next.getDate() + direction * (viewMode === 'week' ? 7 : 1));
    }
    return toDateInput(next);
};
