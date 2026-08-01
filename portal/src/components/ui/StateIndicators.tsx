import React from 'react';
import { Inbox, RefreshCw } from 'lucide-react';

export const Loading = ({ label, compact = false }) => (
    <div className={`portal-state flex flex-col items-center justify-center rounded-2xl border border-slate-200/70 bg-slate-50/80 p-6 text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 ${compact ? 'min-h-28' : 'min-h-[150px]'}`} aria-live="polite">
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-200">
            <RefreshCw size={21} className="animate-spin" />
        </span>
        <p className="text-sm font-semibold">{label}</p>
    </div>
);

export const Empty = ({ children }) => (
    <div className="portal-state flex min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center text-sm font-medium leading-6 text-slate-500 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-300">
        {children}
    </div>
);

export const EmptyState = ({ icon: Icon = Inbox, title, description }) => (
    <div className="portal-state flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-14 text-center dark:border-white/10 dark:bg-white/[0.025]">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-primary-700 shadow-sm ring-1 ring-border dark:text-primary-200">
            <Icon size={25} strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    </div>
);
