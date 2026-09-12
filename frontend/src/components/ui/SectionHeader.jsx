import React from 'react';

const SectionHeader = ({ icon: Icon, title, color = 'text-[var(--VIARA-muted)]' }) => (
    <div className="ds-section-header flex items-center gap-2 border-b px-4 py-3">
        {Icon && <Icon size={16} className={color} aria-hidden="true" />}
        <span className="text-[11px] font-bold uppercase tracking-widest">{title}</span>
    </div>
);

export default SectionHeader;
