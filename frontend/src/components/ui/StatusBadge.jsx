import React from 'react';
import { useTranslation } from 'react-i18next';

const statusConfig = {
    Confirmed: 'ds-status-success',
    Scheduled: 'ds-status-accent',
    Cancelled: 'ds-status-danger',
    Pending: 'ds-status-warning',
    Completed: 'ds-status-success',
    'No-Show': 'ds-status-warning',
    'Checked-in': 'ds-status-info',
    Arrived: 'ds-status-info',
};

const StatusBadge = ({ status }) => {
    const { t } = useTranslation('reception');
    const cls = statusConfig[status] || 'ds-status-neutral';
    return (
        <span className={`ds-status inline-flex border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
            {t(`status.${status}`, { defaultValue: status })}
        </span>
    );
};

export default StatusBadge;
