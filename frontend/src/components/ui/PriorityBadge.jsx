import React from 'react';
import { useTranslation } from 'react-i18next';

const priorityConfig = {
    Emergency: { dot: 'bg-[var(--VIARA-danger)]', badge: 'bg-[var(--VIARA-danger-soft)] border-[var(--VIARA-danger-border)] text-[var(--VIARA-danger)]' },
    Urgent: { dot: 'bg-[var(--VIARA-warning)]', badge: 'bg-[var(--VIARA-warning-soft)] border-[var(--VIARA-warning-border)] text-[var(--VIARA-warning)]' },
    Routine: { dot: 'bg-[var(--VIARA-muted)]', badge: 'bg-[var(--VIARA-surface-muted)] border-[var(--VIARA-line)] text-[var(--VIARA-muted)]' },
};

const PriorityBadge = ({ priority = 'Routine' }) => {
    const { t } = useTranslation('reception');
    const cfg = priorityConfig[priority] || priorityConfig.Routine;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.badge}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
            {t(`priority.${priority}`, priority)}
        </span>
    );
};

export default PriorityBadge;
