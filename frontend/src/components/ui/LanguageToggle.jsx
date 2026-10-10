import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { setLanguage } from '../../store/preferencesSlice';

const LanguageToggle = ({ variant = 'default', className = '' }) => {
    const { i18n, t } = useTranslation('common');
    const dispatch = useDispatch();
    const [isChanging, setIsChanging] = useState(false);
    const current = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
    const next = current === 'ar' ? 'en' : 'ar';
    const isDark = variant === 'dark';

    const changeTo = async (code) => {
        if (code === current || isChanging) return;
        setIsChanging(true);
        try {
            await i18n.changeLanguage(code);
            dispatch(setLanguage(code));
        } catch {
            // Keep the active language when its resource chunk cannot be loaded.
        } finally {
            setIsChanging(false);
        }
    };

    if (variant === 'compact' || variant === 'dark') {
        const label = next === 'ar' ? 'العربية' : 'English';
        return (
            <button
                type="button"
                onClick={() => changeTo(next)}
                disabled={isChanging}
                aria-busy={isChanging || undefined}
                title={t('language.switchTo')}
                aria-label={`${t('language.switchTo')}: ${label}`}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] ${isDark
                        ? 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-ink)] hover:border-[var(--VIARA-accent)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent-text)]'
                        : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] shadow-xs hover:border-[var(--VIARA-accent)] hover:text-[var(--VIARA-accent-dark)]'
                    } ${className}`}
            >
                <Languages size={16} aria-hidden="true" />
                <span lang={next}>{next === 'ar' ? 'ع' : 'EN'}</span>
            </button>
        );
    }

    return (
        <div role="group" aria-label={t('language.label')} className={`inline-flex h-10 items-center rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-1 ${className}`}>
            {SUPPORTED_LANGUAGES.map((language) => {
                const active = current === language.code;
                return (
                    <button
                        key={language.code}
                        type="button"
                        onClick={() => changeTo(language.code)}
                        disabled={isChanging}
                        aria-busy={isChanging || undefined}
                        aria-pressed={active}
                        aria-label={language.label}
                        className={`h-8 rounded-lg px-2.5 text-[11px] font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] ${active ? 'bg-[var(--VIARA-surface)] text-[var(--VIARA-accent-dark)] shadow-xs' : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'}`}
                    >
                        {language.code === 'en' ? 'EN' : 'ع'}
                    </button>
                );
            })}
        </div>
    );
};

export default LanguageToggle;
