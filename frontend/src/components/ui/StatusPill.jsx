import React from 'react';
import { useTranslation } from 'react-i18next';

const STATUS_STYLES = {
    Paid: 'ds-status-success',
    Pending: 'ds-status-warning',
    Partial: 'ds-status-accent',
    Voided: 'ds-status-neutral',
    Refunded: 'ds-status-danger',
};

const StatusPill = ({ status }) => {
    const { t } = useTranslation('reception');
    const label = t(`billing.statuses.${status}`, { defaultValue: status });
    return (
        <span className={`ds-status inline-flex items-center border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[status] || STATUS_STYLES.Voided}`}>
            {label}
        </span>
    );
};

export default StatusPill;
