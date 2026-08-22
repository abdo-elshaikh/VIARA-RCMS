import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { setLanguage } from '../../store/preferencesSlice';

const LanguageToggle = ({ variant = 'default', className = '' }) => {
    const { i18n, t } = useTranslation('common');
    const dispatch = useDispatch();
    const current = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
    const next = current === 'ar' ? 'en' : 'ar';
    const isDark = variant === 'dark';

    const changeTo = (code) => {
        if (code !== current) {
            dispatch(setLanguage(code));
            i18n.changeLanguage(code);
        }
    };

    if (variant === 'compact' || variant === 'dark') {
        const label = next === 'ar' ? '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' : 'English';
        return (
            <button
                type="button"
                onClick={() => changeTo(next)}
                title={t('language.switchTo')}
                aria-label={`${t('language.switchTo')}: ${label}`}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] ${isDark
                        ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-[rgba(var(--VIARA-accent-rgb),0.34)] hover:bg-white/[0.07] hover:text-white'
                        : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-[rgba(var(--VIARA-accent-rgb),0.34)] hover:text-[var(--VIARA-accent)]'
                    } ${className}`}
            >
                <Languages size={16} aria-hidden="true" />
                <span lang={next}>{next === 'ar' ? '\u0639' : 'EN'}</span>
            </button>
        );
    }

    return (
        <div role="group" aria-label={t('language.label')} className={`inline-flex h-10 items-center rounded-xl border border-slate-200 bg-slate-100/70 p-1 ${className}`}>
            {SUPPORTED_LANGUAGES.map((language) => {
                const active = current === language.code;
                return (
                    <button
                        key={language.code}
                        type="button"
                        onClick={() => changeTo(language.code)}
                        aria-pressed={active}
                        aria-label={language.label}
                        className={`h-8 rounded-lg px-2.5 text-[11px] font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] ${active ? 'bg-white text-[var(--VIARA-accent)] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        {language.code === 'en' ? 'EN' : '\u0639'}
                    </button>
                );
            })}
        </div>
    );
};

export default LanguageToggle;
