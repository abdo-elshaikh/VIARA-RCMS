import React from 'react';
import { useTranslation } from 'react-i18next';

const statusConfig = {
    Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    Scheduled: 'bg-teal-50 text-teal-700 border-teal-100',
    Cancelled: 'bg-rose-50 text-rose-700 border-rose-100',
    Pending: 'bg-amber-50 text-amber-700 border-amber-100',
    Completed: 'bg-teal-50 text-teal-700 border-teal-100',
    'No-Show': 'bg-orange-50 text-orange-700 border-orange-100',
    'Checked-in': 'bg-indigo-50 text-indigo-700 border-indigo-100',
    Arrived: 'bg-indigo-50 text-indigo-700 border-indigo-100',
};

const StatusBadge = ({ status }) => {
    const { t } = useTranslation('reception');
    const cls = statusConfig[status] || 'bg-slate-50 text-slate-600 border-slate-200';
    return (
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
            {t(`status.${status}`, { defaultValue: status })}
        </span>
    );
};

export default StatusBadge;
