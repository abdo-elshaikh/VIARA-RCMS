import React from 'react';

const SectionHeader = ({ icon: Icon, title, color = 'text-slate-400 dark:text-[var(--rcms-muted)]' }) => (
    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)]/70">
        <Icon size={16} className={color} />
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-[var(--rcms-muted)]">{title}</span>
    </div>
);

export default SectionHeader;
