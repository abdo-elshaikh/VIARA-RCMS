import React from 'react';

const AmountBlock = ({ label, value, tone = 'default' }) => {
    const tones = {
        default: 'bg-slate-50 text-slate-700',
        cyan: 'bg-slate-100 text-slate-900',
        amber: 'bg-amber-50 text-amber-700',
        emerald: 'bg-emerald-50 text-emerald-700',
    };
    return (
        <div className={`rounded-xl px-4 py-3 ${tones[tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums ltr-embed" dir="ltr">
                {Number(value || 0).toFixed(2)}
            </p>
        </div>
    );
};

export default AmountBlock;
