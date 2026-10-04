import React from 'react';

const AmountBlock = ({ label, value, tone = 'default' }) => {
    const tones = {
        default: 'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-ink)]',
        cyan: 'border border-[var(--VIARA-info-border)] bg-[var(--VIARA-info-soft)] text-[var(--VIARA-info)]',
        amber: 'border border-[var(--VIARA-warning-border)] bg-[var(--VIARA-warning-soft)] text-[var(--VIARA-warning)]',
        emerald: 'border border-[var(--VIARA-success-border)] bg-[var(--VIARA-success-soft)] text-[var(--VIARA-success)]',
        accent: 'border border-[rgba(var(--VIARA-accent-rgb),0.28)] bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent-dark)]',
    };
    return (
        <div className={`rounded-xl px-4 py-3 ${tones[tone] || tones.default}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--VIARA-muted)]">{label}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums ltr-embed" dir="ltr">
                {Number(value || 0).toFixed(2)}
            </p>
        </div>
    );
};

export default AmountBlock;
