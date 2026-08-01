import React from 'react';

export const InfoBlock = ({ label, value }) => (
    <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/40">
        <p className="font-medium text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
        <p className="font-sans mt-1 text-sm font-semibold text-slate-900 dark:text-white break-words">{value || '-'}</p>
    </div>
);

export const DetailRow = ({ label, value }) => (
    <div className="min-w-0 rounded-xl border border-slate-200/60 bg-white/80 p-3 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/40">
        <dt className="font-medium text-[10px] uppercase tracking-wider text-slate-400">{label}</dt>
        <dd className="font-medium mt-1 text-xs text-slate-900 dark:text-slate-100 break-words">{value || '-'}</dd>
    </div>
);

export const MoneyBlock = ({ label, value, strong = false }) => (
    <div className="min-w-0 rounded-xl border border-slate-200/50 bg-white/80 p-3 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
        <p className="font-medium text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-300">{label}</p>
        <p className={`font-sans mt-1 ${strong ? 'text-lg' : 'text-sm'} font-semibold text-slate-900 dark:text-white`}>{value}</p>
    </div>
);

export const SummaryCard = ({ icon: Icon, label, value }) => (
    <div className="min-w-0 rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-center justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300"><Icon size={17} /></span>
            <p className="font-sans text-xl font-semibold text-slate-900 dark:text-white">{value}</p>
        </div>
        <p className="font-medium mt-3 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-300">{label}</p>
    </div>
);
