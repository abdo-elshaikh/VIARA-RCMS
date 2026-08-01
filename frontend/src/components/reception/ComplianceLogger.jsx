import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FileText,
    ShieldCheck,
    Clock3,
    User,
    Activity,
    Download,
    RefreshCw,
    Search,
    Filter,
    Loader2,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import { useReceptionPermissions } from '../../hooks/useReceptionPermissions';

const AuditLogEntry = React.memo(({ entry }) => {
    const locale = typeof window !== 'undefined' && window.navigator.language?.startsWith('ar') ? 'ar-EG' : 'en-US';

    return (
        <div className="flex items-start gap-3 rounded-none border border-slate-100 bg-white p-3 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-slate-100 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <Activity size={14} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                    {entry.action_label || entry.action}
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {entry.details || entry.description || ''}
                </p>
                <div className="mt-1 flex items-center gap-3 text-[10px] font-medium text-slate-400">
                    <span className="flex items-center gap-1">
                        <User size={10} />
                        {entry.performed_by || entry.user_name || '-'}
                    </span>
                    <span className="flex items-center gap-1">
                        <Clock3 size={10} />
                        {new Date(entry.created_at).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </span>
                    {entry.ip_address && (
                        <span className="font-mono text-[9px]">{entry.ip_address}</span>
                    )}
                </div>
            </div>
        </div>
    );
});

AuditLogEntry.displayName = 'AuditLogEntry';

const ComplianceLogger = ({
    auditLogs = [],
    onRefresh,
    isLoading,
    onExport,
    t,
}) => {
    const user = useSelector(selectCurrentUser);
    const permissions = useReceptionPermissions();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterAction, setFilterAction] = useState('All');
    const [expandedEntry, setExpandedEntry] = useState(null);

    const actionLabels = useMemo(() => [
        'All',
        'shift_open',
        'shift_close',
        'payment_received',
        'payment_refunded',
        'invoice_created',
        'invoice_voided',
        'queue_moved',
        'drawer_reconciled',
        'discount_applied',
        'result_delivered',
        'user_login',
        'user_logout',
    ], []);

    const filteredLogs = useMemo(() => {
        const query = searchTerm.trim().toLocaleLowerCase();
        let result = auditLogs;

        if (filterAction !== 'All') {
            result = result.filter((entry) => entry.action === filterAction || entry.action_label === filterAction);
        }

        if (query) {
            result = result.filter((entry) =>
                [entry.action, entry.action_label, entry.details, entry.description, entry.performed_by, entry.user_name]
                    .filter(Boolean)
                    .some((field) => field.toLocaleLowerCase().includes(query))
            );
        }

        return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [auditLogs, searchTerm, filterAction]);

    const handleExport = useCallback(() => {
        onExport?.(filteredLogs);
    }, [onExport, filteredLogs]);

    return (
        <section className="rounded-none border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label={t('compliance.title', { defaultValue: 'Compliance & Audit Log' })}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-none bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:ring-cyan-800">
                        <FileText size={18} />
                    </span>
                    <div>
                        <h3 className="text-sm font-black text-slate-950 dark:text-white">
                            {t('compliance.title', 'Compliance & Audit Log')}
                        </h3>
                        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            {t('compliance.totalEntries', { count: auditLogs.length, defaultValue: '{{count}} audit entries' })}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {onExport && (
                        <button type="button" onClick={handleExport} className="inline-flex h-8 items-center gap-1.5 rounded-none border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" title={t('compliance.export', 'Export audit log')}>
                            <Download size={12} />
                            {t('compliance.exportShort', 'Export')}
                        </button>
                    )}
                    {onRefresh && (
                        <button type="button" onClick={onRefresh} disabled={isLoading} className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" title={t('compliance.refresh', 'Refresh')}>
                            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                    )}
                </div>
            </div>

            {permissions.has('VIEW_AUDIT_LOGS') && (
                <>
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t('compliance.search', { defaultValue: 'Search audit entries...' })}
                                className="h-8 w-full rounded-none border border-slate-200 bg-white/80 ps-9 pe-3 text-xs font-medium text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                        <select
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                            className="h-8 rounded-none border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-cyan-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            {actionLabels.map((label) => (
                                <option key={label} value={label}>{label === 'All' ? t('compliance.allActions', 'All Actions') : label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="max-h-80 space-y-2 overflow-y-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 size={20} className="animate-spin text-slate-400" />
                            </div>
                        ) : filteredLogs.length > 0 ? (
                            filteredLogs.map((entry) => (
                                <AuditLogEntry key={entry.id || `${entry.action}-${entry.created_at}`} entry={entry} />
                            ))
                        ) : (
                            <div className="py-8 text-center">
                                <p className="text-xs font-medium text-slate-400">
                                    {t('compliance.noEntries', 'No audit entries found')}
                                </p>
                            </div>
                        )}
                    </div>
                </>
            )}

            {!permissions.has('VIEW_AUDIT_LOGS') && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ShieldCheck size={28} className="mb-2 text-slate-300" />
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {t('compliance.noAccess', 'You do not have permission to view audit logs')}
                    </p>
                </div>
            )}
        </section>
    );
};

export default ComplianceLogger;
