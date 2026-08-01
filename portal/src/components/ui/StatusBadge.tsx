import React from 'react';

export const statusTones: Record<string, { badge: string; dot: string }> = {
    'Scheduled': {
        badge: 'border-sky-500/20 bg-sky-50/80 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300',
        dot: 'bg-sky-500',
    },
    'Confirmed': {
        badge: 'border-emerald-500/20 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
    'Arrived': {
        badge: 'border-indigo-500/20 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300',
        dot: 'bg-indigo-500',
    },
    'In Progress': {
        badge: 'border-amber-500/20 bg-amber-50/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
        dot: 'bg-amber-500 animate-pulse',
    },
    'Completed': {
        badge: 'border-emerald-500/20 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
    'Finalized': {
        badge: 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold shadow-sm',
        dot: 'bg-emerald-500',
    },
    'Cancelled': {
        badge: 'border-rose-500/20 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
        dot: 'bg-rose-500',
    },
    'STAT': {
        badge: 'border-rose-500/40 bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 font-bold animate-pulse shadow-sm',
        dot: 'bg-rose-600',
    },
    'No Show': {
        badge: 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
        dot: 'bg-slate-400',
    },
    'Pending': {
        badge: 'border-amber-500/20 bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
        dot: 'bg-amber-400',
    },
    'Approved': {
        badge: 'border-emerald-500/20 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
    'Rejected': {
        badge: 'border-rose-500/20 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
        dot: 'bg-rose-500',
    },
    'Paid': {
        badge: 'border-emerald-500/20 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
    'Draft': {
        badge: 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 text-slate-600 dark:text-slate-400',
        dot: 'bg-slate-400',
    },
    'Typed': {
        badge: 'border-sky-500/20 bg-sky-50/80 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300',
        dot: 'bg-sky-500',
    },
};

interface StatusBadgeProps {
    value?: string | null;
    label?: React.ReactNode;
    status?: string | null;
    t?: (key: string, options?: Record<string, unknown>) => string;
}

const StatusBadge = ({ value, label, status, t }: StatusBadgeProps) => {
    const activeStatus = value || status || 'Pending';
    const displayLabel = label || (t ? t(`status.${activeStatus}`, { defaultValue: activeStatus || t('common.pending', { defaultValue: 'Pending' }) }) : activeStatus);
    const toneConfig = statusTones[activeStatus as keyof typeof statusTones] || {
        badge: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
        dot: 'bg-slate-400',
    };
    
    return (
        <span className={`inline-flex min-h-[22px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase leading-none backdrop-blur-xs transition-colors ${toneConfig.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${toneConfig.dot}`} />
            <span>{displayLabel}</span>
        </span>
    );
};

export default StatusBadge;
