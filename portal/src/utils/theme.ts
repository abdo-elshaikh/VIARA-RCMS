export const THEME_STORAGE_KEY = 'VIARA_preferences';

export type ThemeMode = 'system' | 'dark' | 'light';

export const getSystemPrefersDark = (): boolean => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
);

export const resolveTheme = (theme: string = 'system'): 'dark' | 'light' => {
    if (theme === 'dark' || theme === 'light') return theme;
    return getSystemPrefersDark() ? 'dark' : 'light';
};

export const getStoredTheme = (): ThemeMode => {
    try {
        const saved = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || '{}');
        if (saved.theme) return saved.theme;
        if (localStorage.theme === 'dark' || localStorage.theme === 'light') return localStorage.theme;
    } catch (_) {
        if (localStorage.theme === 'dark' || localStorage.theme === 'light') return localStorage.theme;
    }
    return 'system';
};

export const applyPortalTheme = (theme: string = 'system'): 'dark' | 'light' => {
    if (typeof document === 'undefined') return 'light';

    const resolvedTheme = resolveTheme(theme);
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.theme = theme;
    root.dataset.resolvedTheme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', resolvedTheme === 'dark' ? '#0d1424' : '#F6F3ED');
    }

    return resolvedTheme;
};
