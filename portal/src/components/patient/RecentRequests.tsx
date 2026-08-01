import React, { useMemo } from 'react';
import { Loading, Empty } from '../ui/StateIndicators';
import StatusBadge from '../ui/StatusBadge';

const RecentRequests = ({ requests, loading, formatDate, translateStatus, t }) => {
    const newestRequests = useMemo(() => [...requests].sort((a, b) => {
        const first = Date.parse(a.created_at || a.preferred_date) || 0;
        const second = Date.parse(b.created_at || b.preferred_date) || 0;
        return second - first;
    }), [requests]);

    return (
        <div className="mt-6 border-t border-slate-200/50 pt-5 dark:border-white/10">
            <h3 className="font-medium text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-300">{t('patient.appointment.recentRequests', 'Recent requests')}</h3>
            {loading && !newestRequests.length ? <Loading compact label={t('patient.requests.loading', 'Loading requests')} /> : newestRequests.length === 0 ? <Empty>{t('patient.empty.requests', 'No appointment requests yet.')}</Empty> : (
                <div className="mt-3 grid gap-2">
                    {newestRequests.slice(0, 5).map((request) => (
                        <div key={request.request_id || `${request.preferred_date}-${request.modality_type}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/50 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                            <div className="min-w-0">
                                <p className="font-display truncate text-sm font-semibold text-slate-900 dark:text-white">{request.modality_type || request.exam_type_name || t('patient.appointment.fallback', 'Appointment request')}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-300">{formatDate(request.preferred_date || request.created_at)}</p>
                            </div>
                            <StatusBadge status={request.status} label={translateStatus(request.status)} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RecentRequests;
