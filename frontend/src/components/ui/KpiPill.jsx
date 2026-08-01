import React from 'react';

const KpiPill = ({ label, value, accent = false }) => (
    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ${accent ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
        <span className="tabular-nums">{value}</span>
        <span className="font-semibold opacity-70">{label}</span>
    </div>
);

export default KpiPill;
