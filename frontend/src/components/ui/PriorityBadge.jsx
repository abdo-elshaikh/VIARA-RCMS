import React from 'react';
import { useTranslation } from 'react-i18next';

const priorityConfig = {
    Emergency: { dot: 'bg-rose-500', badge: 'bg-rose-50 border-rose-200 text-rose-700' },
    Urgent: { dot: 'bg-amber-500', badge: 'bg-amber-50 border-amber-200 text-amber-700' },
    Routine: { dot: 'bg-slate-300', badge: 'bg-slate-50 border-slate-200 text-slate-500' },
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
