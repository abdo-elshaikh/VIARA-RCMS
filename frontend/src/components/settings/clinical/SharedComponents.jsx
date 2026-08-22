import React from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Signal = ({ icon: Icon, label, value }) => (
    <div className="flex min-w-[140px] flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">
            <Icon size={18} />
        </span>
        <span className="min-w-0">
            <span className="block text-xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</span>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        </span>
    </div>
);

export const CatalogState = ({ loading, error, empty, retry, t: propT, children }) => {
    const { t: hookT } = useTranslation('settings');
    const t = typeof propT === 'function' ? propT : hookT;

    if (loading) {
        return (
            <div className="flex flex-col items-center gap-3 p-16 text-center">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-700 dark:border-cyan-900 dark:border-t-cyan-400" />
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500">
                    {t('settings.clinical.loading', { defaultValue: 'Loading clinical records...' })}
                </p>
            </div>
        );
    }
    if (error) {
        return (
            <div className="p-16 text-center">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
                    <AlertTriangle size={22} />
                </span>
                <p className="font-bold text-rose-600 dark:text-rose-300">{t('settings.clinical.loadError', { defaultValue: 'Failed to fetch settings from server' })}</p>
                <button
                    type="button"
                    onClick={retry}
                    className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-cyan-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-cyan-300 dark:hover:bg-slate-800"
                >
                    {t('settings.clinical.retry', { defaultValue: 'Try Again' })}
                </button>
            </div>
        );
    }
    if (empty) {
        return (
            <div className="p-16 text-center">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <Activity size={22} />
                </span>
                <p className="font-bold text-slate-600 dark:text-slate-300">{t('settings.clinical.empty', { defaultValue: 'No items match the current search or filters' })}</p>
            </div>
        );
    }
    return children;
};

export const Detail = ({ label, value, wide }) => (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50 ${wide ? 'col-span-2' : ''}`}>
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
        <dd className="mt-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{value || '-'}</dd>
    </div>
);

export const Status = ({ value, t: propT }) => {
    const { t: hookT } = useTranslation('settings');
    const t = typeof propT === 'function' ? propT : hookT;

    const activeStyles = value === 'Active'
        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/50'
        : value === 'Under Maintenance'
            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-800/50'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700/50';

    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${activeStyles}`}>
            {t(`settings.clinical.statuses.${value}`, { defaultValue: value })}
        </span>
    );
};

export const Field = ({ label, value, onChange, required, type = 'text', placeholder, ...props }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">
            {label}
            {required && <span className="text-rose-500"> *</span>}
        </span>
        <input
            type={type}
            required={required}
            value={value}
            placeholder={placeholder}
            onChange={event => onChange(event.target.value)}
            className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
            {...props}
        />
    </label>
);

export const Select = ({ label, value, onChange, options, render = value => value, required }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">
            {label}
            {required && <span className="text-rose-500"> *</span>}
        </span>
        <select
            required={required}
            value={value}
            onChange={event => onChange(event.target.value)}
            className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
        >
            <option value="" disabled>Select option</option>
            {options.map(option => (
                <option key={option} value={option}>{render(option)}</option>
            ))}
        </select>
    </label>
);

export const Check = ({ label, checked, onChange }) => (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-4 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60">
        <span>{label}</span>
        <input
            type="checkbox"
            checked={checked}
            onChange={event => onChange(event.target.checked)}
            className="h-5 w-5 cursor-pointer rounded accent-cyan-600"
        />
    </label>
);

export const Actions = ({ busy, onClose, t: propT }) => {
    const { t: hookT } = useTranslation('settings');
    const t = typeof propT === 'function' ? propT : hookT;

    return (
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
            <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="min-h-[42px] rounded-xl px-5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                {t('settings.clinical.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-xl bg-cyan-700 px-6 text-xs font-bold text-white shadow-sm transition-all hover:bg-cyan-600 active:scale-95 disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500"
            >
                {busy
                    ? t('settings.clinical.saving', { defaultValue: 'Applying Changes...' })
                    : t('settings.clinical.save', { defaultValue: 'Apply Configurations' })
                }
            </button>
        </div>
    );
};
