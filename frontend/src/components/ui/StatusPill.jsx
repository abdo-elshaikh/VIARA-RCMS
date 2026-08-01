import React from 'react';
import { useTranslation } from 'react-i18next';

const STATUS_STYLES = {
    Paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    Pending: 'bg-amber-50  text-amber-700  border-amber-100',
    Partial: 'bg-blue-50   text-blue-700   border-blue-100',
    Voided: 'bg-slate-100 text-slate-500  border-slate-200',
    Refunded: 'bg-rose-50   text-rose-700   border-rose-100',
};

const StatusPill = ({ status }) => {
    const { t } = useTranslation('reception');
    const label = t(`billing.statuses.${status}`, { defaultValue: status });
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[status] || STATUS_STYLES.Voided}`}>
            {label}
        </span>
    );
};

export default StatusPill;
