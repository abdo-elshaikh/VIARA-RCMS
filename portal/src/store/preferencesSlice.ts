import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface PreferencesState {
    theme: 'light' | 'dark' | 'system';
    primaryColor: 'cyan' | 'indigo' | 'rose' | 'emerald' | string;
    density: 'compact' | 'comfortable';
    fontScale: 'small' | 'normal' | 'large';
    motion: 'system' | 'reduced';
    language: string;
    timezone: string;
    showNotificationBadge: boolean;
    notificationSound: boolean;
    emailNotifications: {
        dailySummary: boolean;
        systemAlerts: boolean;
        promotionalUpdates: boolean;
    };
    [key: string]: any;
}

const loadInitialState = (): PreferencesState => {
    const defaults: PreferencesState = {
        theme: 'system',
        primaryColor: 'cyan',
        density: 'comfortable',
        fontScale: 'normal',
        motion: 'system',
        language: 'en',
        timezone: 'auto',
        showNotificationBadge: true,
        notificationSound: false,
        emailNotifications: {
            dailySummary: true,
            systemAlerts: true,
            promotionalUpdates: false,
        },
    };

    try {
        const saved = localStorage.getItem('rcms_preferences');
        const legacyTheme = localStorage.getItem('theme');
        const validLegacyTheme = legacyTheme && ['light', 'dark'].includes(legacyTheme) ? (legacyTheme as 'light' | 'dark') : undefined;
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...defaults, ...parsed, theme: parsed.theme || validLegacyTheme || defaults.theme };
        }
        return { ...defaults, theme: validLegacyTheme || defaults.theme };
    } catch (e) {
        console.warn('Could not load preferences from localStorage', e);
    }

    return defaults;
};

const initialState = loadInitialState();

const preferencesSlice = createSlice({
    name: 'preferences',
    initialState,
    reducers: {
        setTheme: (state, action: PayloadAction<'light' | 'dark' | 'system'>) => {
            state.theme = action.payload;
            localStorage.setItem('rcms_preferences', JSON.stringify(state));
            localStorage.removeItem('theme');
        },
        setPrimaryColor: (state, action: PayloadAction<string>) => {
            state.primaryColor = action.payload;
            localStorage.setItem('rcms_preferences', JSON.stringify(state));
        },
        setDensity: (state, action: PayloadAction<'compact' | 'comfortable'>) => {
            state.density = action.payload;
            localStorage.setItem('rcms_preferences', JSON.stringify(state));
        },
        setFontScale: (state, action: PayloadAction<'small' | 'normal' | 'large'>) => {
            state.fontScale = action.payload;
            localStorage.setItem('rcms_preferences', JSON.stringify(state));
        },
        setMotion: (state, action: PayloadAction<'system' | 'reduced'>) => {
            state.motion = action.payload;
            localStorage.setItem('rcms_preferences', JSON.stringify(state));
        },
        setLanguage: (state, action: PayloadAction<string>) => {
            state.language = action.payload;
            localStorage.setItem('rcms_preferences', JSON.stringify(state));
        },
        updateAllPreferences: (state, action: PayloadAction<Partial<PreferencesState>>) => {
            Object.assign(state, action.payload);
            localStorage.setItem('rcms_preferences', JSON.stringify(state));
        }
    }
});

export const { setTheme, setPrimaryColor, setDensity, setFontScale, setMotion, setLanguage, updateAllPreferences } = preferencesSlice.actions;

export const selectPreferences = (state: { preferences: PreferencesState }) => state.preferences;
export const selectTheme = (state: { preferences: PreferencesState }) => state.preferences.theme;
export const selectPrimaryColor = (state: { preferences: PreferencesState }) => state.preferences.primaryColor;
export const selectDensity = (state: { preferences: PreferencesState }) => state.preferences.density;

export default preferencesSlice.reducer;
