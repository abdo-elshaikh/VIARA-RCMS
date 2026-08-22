import React from 'react';

const metricTones = {
    cyan: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-[rgba(var(--VIARA-accent-rgb),0.18)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.16)] dark:text-[var(--VIARA-accent-text)] dark:ring-[rgba(var(--VIARA-accent-rgb),0.24)]',
    blue: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-[rgba(var(--VIARA-accent-rgb),0.18)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.16)] dark:text-[var(--VIARA-accent-text)] dark:ring-[rgba(var(--VIARA-accent-rgb),0.24)]',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-emerald-100/70 dark:ring-emerald-900/50',
    violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 ring-violet-100/70 dark:ring-violet-900/50',
    rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 ring-rose-100/70 dark:ring-rose-900/50',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 ring-amber-100/70 dark:ring-amber-900/50',
};

const ChangeBadge = ({ value }) => {
    if (!value) return null;
    const numeric = parseFloat(value);
    const positive = numeric > 0;
    const negative = numeric < 0;
    const tone = positive ? 'bg-emerald-50 dark:bg-emerald-400/12 text-emerald-700 dark:text-emerald-300' : negative ? 'bg-rose-50 dark:bg-rose-400/12 text-rose-700 dark:text-rose-300' : 'bg-slate-100 dark:bg-[var(--VIARA-surface-muted)] text-slate-600 dark:text-[var(--VIARA-muted)]';
    return <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-extrabold ${tone}`}>{value}</span>;
};

const MetricCard = ({ icon: Icon, tone = 'cyan', label, value, detail, change, loading, onClick }) => {
    const Component = onClick ? 'button' : 'article';
    return (
        <Component {...(onClick ? { type: 'button', onClick } : {})} className={`group relative min-w-0 w-full overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]/80 p-4 text-start transition-all duration-200 sm:p-5 ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[rgba(var(--VIARA-accent-rgb),0.42)] dark:hover:border-[rgba(var(--VIARA-accent-rgb),0.38)] hover:shadow-lg hover:shadow-[rgba(var(--VIARA-accent-rgb),0.08)]' : ''}`}>
            <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-teal-450/70 to-transparent opacity-0 transition group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase leading-4 tracking-[.12em] text-slate-400 sm:text-[11px]">{label}</p>
                    {loading ? (
                        <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-slate-100 dark:bg-[var(--VIARA-surface-muted)]" />
                    ) : (
                        <p className="mt-2 truncate text-2xl font-extrabold tracking-tight text-slate-950 dark:text-[var(--VIARA-ink)] sm:text-3xl">{value}</p>
                    )}
                </div>
                {Icon && (
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-4 ${metricTones[tone] || metricTones.cyan} transition-transform duration-300 group-hover:scale-105`}>
                        <Icon size={22} />
                    </span>
                )}
            </div>
            {(detail || change) && (
                <div className="mt-3 flex min-h-[24px] flex-wrap items-center gap-2 sm:mt-4">
                    {change && <ChangeBadge value={change} />}
                    {detail && <p className="text-xs font-semibold text-slate-500 dark:text-[var(--VIARA-muted)]">{detail}</p>}
                </div>
            )}
        </Component>
    );
};

export default MetricCard;
