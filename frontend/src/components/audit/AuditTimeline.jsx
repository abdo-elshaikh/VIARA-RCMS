import React from 'react';
import { useGetAuditLogsQuery } from '../../store/api';
import { AlertCircle, Clock, User, Shield, Info, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const AuditTimeline = ({ resourceId, resourceTable }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const locale = isAr ? 'ar-EG' : 'en-EG';

    // Fetch audit entries for this specific resource
    const { data, isLoading, isError, refetch } = useGetAuditLogsQuery({ resourceId, targetType: resourceTable, limit: 100 });
    const logs = data?.logs || [];
    const total = Number(data?.total || 0);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center gap-2 py-8 text-center text-xs font-bold text-slate-400">
                <RefreshCw size={15} className="animate-spin text-teal-600 dark:text-teal-400" />
                <span>{t('audit.loading', { defaultValue: 'Loading audit history...' })}</span>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                <span className="flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0 text-rose-600" />
                    <span>{t('audit.loadError', { defaultValue: 'Unable to load audit history.' })}</span>
                </span>
                <button type="button" onClick={refetch} className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300">
                    {t('audit.retry', { defaultValue: 'Retry' })}
                </button>
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs font-semibold text-slate-400 dark:border-slate-800">
                <Shield size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p>{t('audit.emptyFiltered', { defaultValue: 'No audit records recorded for this resource.' })}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {total > logs.length ? (
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                    {isAr
                        ? `عرض أحدث ${logs.length} من أصل ${total} حدث مسجل.`
                        : `Showing the latest ${logs.length} of ${total} audit entries.`}
                </p>
            ) : null}

            <div className="relative ms-3 space-y-5 border-s-2 border-slate-200/80 py-1 ps-5 dark:border-slate-800">
                {logs.map((log) => (
                    <div key={log.log_id} className="relative">
                        <div className="absolute -start-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-teal-500 bg-white ring-4 ring-teal-500/10 dark:bg-slate-900" />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-xs">
                                <Shield size={13} className="text-teal-600 dark:text-teal-400" />
                                <span className="font-mono">{log.event_code || log.action}</span>
                                {log.outcome && log.outcome !== 'success' && (
                                    <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-black uppercase text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                                        {log.outcome}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                                <Clock size={11} />
                                <span>{log.timestamp ? new Date(log.timestamp).toLocaleString(locale) : '—'}</span>
                            </div>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <span className="flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                                <User size={13} className="text-slate-400" />
                                {log.actor_name || log.user_name || t('audit.system', { defaultValue: 'SYSTEM' })}
                            </span>
                            {(log.actor_role || log.user_role) && (
                                <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                                    {log.actor_role || log.user_role}
                                </span>
                            )}
                            {log.ip_address && (
                                <span className="font-mono text-[10px] text-slate-400">
                                    IP: {log.ip_address}
                                </span>
                            )}
                        </div>

                        {log.details && Object.keys(log.details).length > 0 && (
                            <div className="mt-2 flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 text-[11px] font-mono text-slate-600 dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
                                <Info size={13} className="mt-0.5 shrink-0 text-slate-400" />
                                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all leading-relaxed">
                                    {JSON.stringify(log.details, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AuditTimeline;
