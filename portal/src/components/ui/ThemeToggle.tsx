import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from '../../../node_modules/react-i18next';
import { selectTheme, setTheme } from '../../store/preferencesSlice';
import { resolveTheme } from '../../utils/theme';

const ThemeToggle = ({ variant = 'default', className = '' }) => {
    const dispatch = useDispatch();
    const { t } = useTranslation('landing');
    const theme = useSelector(selectTheme);
    const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(theme));
    const isDark = resolvedTheme === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';
    const label = t(isDark ? 'nav.lightMode' : 'nav.darkMode', {
        defaultValue: isDark ? 'Switch to light mode' : 'Switch to dark mode',
    });
    const isDarkVariant = variant === 'dark';

    useEffect(() => {
        const sync = () => setResolvedTheme(resolveTheme(theme));
        sync();

        if (theme !== 'system' || typeof window.matchMedia !== 'function') return undefined;

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener?.('change', sync);
        return () => media.removeEventListener?.('change', sync);
    }, [theme]);

    return (
        <button
            type="button"
            onClick={() => dispatch(setTheme(nextTheme))}
            title={label}
            aria-label={label}
            aria-pressed={isDark}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-bold shadow-sm transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 ${
                isDarkVariant
                    ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-primary-300/40 hover:bg-white/[0.08] hover:text-white'
                    : 'border-border bg-surface text-muted-foreground hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white'
            } ${className}`}
        >
            {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
        </button>
    );
};

export default ThemeToggle;
