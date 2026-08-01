import React from 'react';

const receptionMetricTones = {
    teal: 'bg-teal-50 text-teal-700 ring-teal-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    blue: 'bg-teal-50 text-teal-700 ring-teal-100',
};

const ReceptionMetric = ({ icon: Icon, label, value, tone }) => (
    <article className="min-w-0 rounded-none border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-none ring-1 ${receptionMetricTones[tone] || receptionMetricTones.teal}`}>
                <Icon size={17} />
            </span>
        </div>
        <p className="mt-4 truncate text-2xl font-black tabular-nums text-slate-950">{value}</p>
    </article>
);

export default ReceptionMetric;
