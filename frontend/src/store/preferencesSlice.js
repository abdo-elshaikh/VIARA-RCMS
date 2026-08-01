import { createSlice } from '@reduxjs/toolkit';

export const DEFAULT_PREFERENCES = {
    // Appearance
    theme: 'system', // 'light', 'dark', 'system'
    primaryColor: 'cyan', // 'cyan', 'indigo', 'rose', 'emerald', 'amber', 'slate', 'custom'
    customColor: '#0ea5e9', // Used when primaryColor is 'custom'
    density: 'comfortable', // 'compact', 'comfortable', 'spacious'
    fontScale: 'normal', // 'small', 'normal', 'large', 'xlarge'
    fontFamily: 'inter', // 'inter', 'system', 'mono', 'dyslexic'
    borderRadius: 'medium', // 'sharp', 'small', 'medium', 'large', 'full'
    motion: 'system', // 'system', 'reduced'
    highContrast: false,

    // Preferences
    language: 'en',
    timezone: 'auto',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    firstDayOfWeek: 0, // 0: Sunday, 1: Monday
    startPage: '/dashboard',
    sessionTimeout: 15, // in minutes
    calendarView: 'week',
    compactSidebar: false,

    // Notifications
    showNotificationBadge: true,
    notificationSound: false,
    soundVolume: 0.5,
    desktopNotifications: false,
    desktopNotificationPreview: false,
    desktopSystemNotifications: true,
    desktopMessageNotifications: true,
    notificationQuietHours: false,
    notificationQuietStart: '22:00',
    notificationQuietEnd: '07:00',
    criticalNotificationBypass: true,
    emailNotifications: {
        dailySummary: true,
        systemAlerts: true,
        promotionalUpdates: false,
    },
};

const persistState = (state) => {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('rcms_preferences', JSON.stringify(state));
        }
    } catch (e) {
        console.warn('Could not save preferences to localStorage', e);
    }
};

const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const toBool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const toNumber = (value, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const toSafePath = (value, fallback) => (
    typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback
);
const toTime = (value, fallback) => (/^\d{2}:\d{2}$/.test(value || '') ? value : fallback);
const toHex = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);

export const normalizePreferences = (value = {}) => {
    const raw = value && typeof value === 'object' ? value : {};
    const email = raw.emailNotifications && typeof raw.emailNotifications === 'object' ? raw.emailNotifications : {};

    return {
        ...DEFAULT_PREFERENCES,
        theme: pick(raw.theme, ['light', 'dark', 'system'], DEFAULT_PREFERENCES.theme),
        primaryColor: pick(raw.primaryColor, ['cyan', 'indigo', 'rose', 'emerald', 'amber', 'slate', 'custom'], DEFAULT_PREFERENCES.primaryColor),
        customColor: toHex(raw.customColor, DEFAULT_PREFERENCES.customColor),
        density: pick(raw.density, ['compact', 'comfortable', 'spacious'], DEFAULT_PREFERENCES.density),
        fontScale: pick(raw.fontScale, ['small', 'normal', 'large', 'xlarge'], DEFAULT_PREFERENCES.fontScale),
        fontFamily: pick(raw.fontFamily, ['inter', 'system', 'roboto', 'mono', 'dyslexic'], DEFAULT_PREFERENCES.fontFamily),
        borderRadius: pick(raw.borderRadius, ['sharp', 'small', 'medium', 'large', 'full'], DEFAULT_PREFERENCES.borderRadius),
        motion: pick(raw.motion, ['system', 'reduced'], DEFAULT_PREFERENCES.motion),
        highContrast: toBool(raw.highContrast, DEFAULT_PREFERENCES.highContrast),
        language: pick(raw.language, ['en', 'ar'], DEFAULT_PREFERENCES.language),
        timezone: typeof raw.timezone === 'string' ? raw.timezone : DEFAULT_PREFERENCES.timezone,
        dateFormat: pick(raw.dateFormat, ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], DEFAULT_PREFERENCES.dateFormat),
        timeFormat: pick(raw.timeFormat, ['12h', '24h'], DEFAULT_PREFERENCES.timeFormat),
        firstDayOfWeek: pick(Number(raw.firstDayOfWeek), [0, 1, 6], DEFAULT_PREFERENCES.firstDayOfWeek),
        startPage: toSafePath(raw.startPage, DEFAULT_PREFERENCES.startPage),
        sessionTimeout: pick(Number(raw.sessionTimeout), [0, 5, 15, 30], DEFAULT_PREFERENCES.sessionTimeout),
        calendarView: pick(raw.calendarView, ['day', 'week', 'month'], DEFAULT_PREFERENCES.calendarView),
        compactSidebar: toBool(raw.compactSidebar, DEFAULT_PREFERENCES.compactSidebar),
        showNotificationBadge: toBool(raw.showNotificationBadge, DEFAULT_PREFERENCES.showNotificationBadge),
        notificationSound: toBool(raw.notificationSound, DEFAULT_PREFERENCES.notificationSound),
        soundVolume: toNumber(raw.soundVolume, DEFAULT_PREFERENCES.soundVolume, { min: 0.1, max: 1 }),
        desktopNotifications: toBool(raw.desktopNotifications, DEFAULT_PREFERENCES.desktopNotifications),
        desktopNotificationPreview: toBool(raw.desktopNotificationPreview, DEFAULT_PREFERENCES.desktopNotificationPreview),
        desktopSystemNotifications: toBool(raw.desktopSystemNotifications, DEFAULT_PREFERENCES.desktopSystemNotifications),
        desktopMessageNotifications: toBool(raw.desktopMessageNotifications, DEFAULT_PREFERENCES.desktopMessageNotifications),
        notificationQuietHours: toBool(raw.notificationQuietHours, DEFAULT_PREFERENCES.notificationQuietHours),
        notificationQuietStart: toTime(raw.notificationQuietStart, DEFAULT_PREFERENCES.notificationQuietStart),
        notificationQuietEnd: toTime(raw.notificationQuietEnd, DEFAULT_PREFERENCES.notificationQuietEnd),
        criticalNotificationBypass: toBool(raw.criticalNotificationBypass, DEFAULT_PREFERENCES.criticalNotificationBypass),
        emailNotifications: {
            dailySummary: toBool(email.dailySummary, DEFAULT_PREFERENCES.emailNotifications.dailySummary),
            systemAlerts: toBool(email.systemAlerts, DEFAULT_PREFERENCES.emailNotifications.systemAlerts),
            promotionalUpdates: toBool(email.promotionalUpdates, DEFAULT_PREFERENCES.emailNotifications.promotionalUpdates)
        }
    };
};

// Load initial state from localStorage if available
const loadInitialState = () => {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES;
        const saved = localStorage.getItem('rcms_preferences');
        if (saved) return normalizePreferences(JSON.parse(saved));
    } catch (e) {
        console.warn('Could not load preferences from localStorage', e);
    }

    return DEFAULT_PREFERENCES;
};

const initialState = loadInitialState();

const preferencesSlice = createSlice({
    name: 'preferences',
    initialState,
    reducers: {
        setTheme: (state, action) => {
            state.theme = action.payload;
            persistState(state);
        },
        setPrimaryColor: (state, action) => {
            state.primaryColor = action.payload;
            persistState(state);
        },
        setDensity: (state, action) => {
            state.density = action.payload;
            persistState(state);
        },
        setFontScale: (state, action) => {
            state.fontScale = action.payload;
            persistState(state);
        },
        setMotion: (state, action) => {
            state.motion = action.payload;
            persistState(state);
        },
        setLanguage: (state, action) => {
            state.language = action.payload;
            persistState(state);
        },
        updateAllPreferences: (state, action) => {
            Object.assign(state, normalizePreferences({ ...state, ...action.payload }));
            persistState(state);
        }
    }
});

export const { setTheme, setPrimaryColor, setDensity, setFontScale, setMotion, setLanguage, updateAllPreferences } = preferencesSlice.actions;

export const selectPreferences = (state) => state.preferences || initialState;
export const selectTheme = (state) => (state.preferences || initialState).theme;
export const selectPrimaryColor = (state) => (state.preferences || initialState).primaryColor;
export const selectDensity = (state) => (state.preferences || initialState).density;

export default preferencesSlice.reducer;
