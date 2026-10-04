import React from 'react';

const metricTones = {
    cyan: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-[rgba(var(--VIARA-accent-rgb),0.18)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.16)] dark:text-[var(--VIARA-accent-text)] dark:ring-[rgba(var(--VIARA-accent-rgb),0.24)]',
    blue: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-[rgba(var(--VIARA-accent-rgb),0.18)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.16)] dark:text-[var(--VIARA-accent-text)] dark:ring-[rgba(var(--VIARA-accent-rgb),0.24)]',
    emerald: 'bg-[var(--VIARA-success-soft)] text-[var(--VIARA-success)] ring-[var(--VIARA-success-border)] dark:bg-[var(--VIARA-success-soft)] dark:text-[var(--VIARA-success)]',
    violet: 'bg-[var(--VIARA-info-soft)] text-[var(--VIARA-info)] ring-[var(--VIARA-info-border)] dark:bg-[var(--VIARA-info-soft)] dark:text-[var(--VIARA-info)]',
    rose: 'bg-[var(--VIARA-danger-soft)] text-[var(--VIARA-danger)] ring-[var(--VIARA-danger-border)] dark:bg-[var(--VIARA-danger-soft)] dark:text-[var(--VIARA-danger)]',
    amber: 'bg-[var(--VIARA-warning-soft)] text-[var(--VIARA-warning)] ring-[var(--VIARA-warning-border)] dark:bg-[var(--VIARA-warning-soft)] dark:text-[var(--VIARA-warning)]',
};

const ChangeBadge = ({ value }) => {
    if (!value) return null;
    const numeric = parseFloat(value);
    const positive = numeric > 0;
    const negative = numeric < 0;
    const tone = positive 
        ? 'bg-[var(--VIARA-success-soft)] text-[var(--VIARA-success)] border border-[var(--VIARA-success-border)]' 
        : negative 
        ? 'bg-[var(--VIARA-danger-soft)] text-[var(--VIARA-danger)] border border-[var(--VIARA-danger-border)]' 
        : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] border border-[var(--VIARA-line)]';
    return <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold ${tone}`}>{value}</span>;
};

const MetricCard = ({ icon: Icon, tone = 'cyan', label, value, detail, change, loading, onClick }) => {
    const Component = onClick ? 'button' : 'article';
    return (
        <Component {...(onClick ? { type: 'button', onClick } : {})} className={`group relative min-w-0 w-full overflow-hidden rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]/90 shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]/90 p-4 text-start transition-all duration-200 sm:p-5 ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[rgba(var(--VIARA-accent-rgb),0.42)] dark:hover:border-[rgba(var(--VIARA-accent-rgb),0.38)] hover:shadow-lg hover:shadow-[rgba(var(--VIARA-accent-rgb),0.08)]' : ''}`}>
            <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[rgba(var(--VIARA-accent-rgb),0.7)] to-transparent opacity-0 transition group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase leading-4 tracking-[.12em] text-[var(--VIARA-muted)] sm:text-[11px]">{label}</p>
                    {loading ? (
                        <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-[var(--VIARA-surface-muted)]" />
                    ) : (
                        <p className="mt-2 truncate text-2xl font-extrabold tracking-tight text-[var(--VIARA-ink)] sm:text-3xl">{value}</p>
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
                    {detail && <p className="text-xs font-semibold text-[var(--VIARA-muted)]">{detail}</p>}
                </div>
            )}
        </Component>
    );
};

export default MetricCard;
