import React from 'react';

const MetricCard = ({ metric, t }) => {
    const Icon = metric.icon;
    const tones = {
        cyan: 'bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300',
        emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
        amber: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
        violet: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
    };
    return (
        <article className="group relative overflow-hidden rounded-2xl border border-border bg-surface/85 p-5 shadow-md backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary-400/40 hover:shadow-xl dark:hover:border-primary-400/50 dark:hover:shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/0 via-transparent to-primary-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:to-primary-400/10"></div>
            <div className="relative z-10 flex items-center justify-between gap-3">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg ${tones[metric.tone]}`}>
                    <Icon size={20} />
                </span>
                <p className="font-sans text-3xl font-black text-foreground transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">{metric.value}</p>
            </div>
            <p className="relative z-10 mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-primary-600 dark:group-hover:text-primary-300">{t(`doctor.metrics.${metric.key}`)}</p>
        </article>
    );
};

export default MetricCard;
