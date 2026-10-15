export const SESSION_TIMEOUT_OPTIONS = Object.freeze([0, 5, 15, 30]);

export const getEffectiveSessionTimeout = (personalMinutes, organizationMinutes = 30) => {
    const personal = SESSION_TIMEOUT_OPTIONS.includes(Number(personalMinutes)) ? Number(personalMinutes) : 15;
    const organization = Number.isFinite(Number(organizationMinutes)) && Number(organizationMinutes) > 0
        ? Math.min(1440, Number(organizationMinutes))
        : 30;
    return personal === 0 ? organization : Math.min(personal, organization);
};

export const getSessionTimeoutSchedule = (value, fallbackMinutes = 15) => {
    const parsed = Number(value);
    const timeoutMinutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMinutes;
    if (timeoutMinutes === 0) return null;

    const expiryMs = timeoutMinutes * 60 * 1000;
    const warningLeadMs = Math.min(2 * 60 * 1000, Math.max(30 * 1000, expiryMs * 0.2));
    return {
        timeoutMinutes,
        warningMs: Math.max(0, expiryMs - warningLeadMs),
        expiryMs,
    };
};
