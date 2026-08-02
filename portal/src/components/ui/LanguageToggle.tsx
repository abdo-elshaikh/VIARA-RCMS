import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../../i18n';

const LanguageToggle = ({ variant = 'default', className = '' }) => {
    const { i18n, t } = useTranslation('common');
    const current = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
    const next = current === 'ar' ? 'en' : 'ar';
    const isDark = variant === 'dark';

    const changeTo = (code) => {
        if (code !== current) i18n.changeLanguage(code);
    };

    if (variant === 'compact' || variant === 'dark') {
        const label = next === 'ar' ? 'العربية' : 'English';
        return (
            <button
                type="button"
                onClick={() => changeTo(next)}
                title={t('language.switchTo')}
                aria-label={`${t('language.switchTo')}: ${label}`}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                    isDark
                        ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-primary-300/30 hover:bg-white/[0.07] hover:text-white'
                        : 'border-border bg-surface text-muted-foreground shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800'
                } ${className}`}
            >
                <Languages size={16} aria-hidden="true" />
                <span lang={next}>{next === 'ar' ? 'ع' : 'EN'}</span>
            </button>
        );
    }

    return (
        <div role="group" aria-label={t('language.label')} className={`inline-flex h-10 items-center rounded-xl border border-border bg-background p-1 ${className}`}>
            {SUPPORTED_LANGUAGES.map((language) => {
                const active = current === language.code;
                return (
                    <button
                        key={language.code}
                        type="button"
                        onClick={() => changeTo(language.code)}
                        aria-pressed={active}
                        aria-label={language.label}
                        className={`h-8 rounded-lg px-2.5 text-[11px] font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${active ? 'bg-surface text-primary-800 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {language.code === 'en' ? 'EN' : 'ع'}
                    </button>
                );
            })}
        </div>
    );
};

export default LanguageToggle;
