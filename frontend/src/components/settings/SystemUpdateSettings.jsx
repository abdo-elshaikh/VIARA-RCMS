import React from 'react';
import { RefreshCw, Server, ShieldCheck, Database, Layers, GitBranch, History, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetSystemUpdateStatusQuery, useGetSystemUpdateHistoryQuery } from '../../store/api';

const SystemUpdateSettings = () => {
    const { i18n } = useTranslation(['settings', 'common']);
    const ar = i18n.dir() === 'rtl';
    const { data: status, isLoading, isFetching, isError, refetch } = useGetSystemUpdateStatusQuery();
    const { data: history = [], isLoading: historyLoading, isFetching: historyFetching, isError: historyError, refetch: refreshHistory } = useGetSystemUpdateHistoryQuery(20);
    const refreshing = isLoading || isFetching || historyLoading || historyFetching;
    const environmentLabels = ar ? { production: 'الإنتاج', development: 'التطوير', staging: 'الاختبار قبل النشر', test: 'الاختبارات' } : { production: 'Production', development: 'Development', staging: 'Staging', test: 'Test' };
    const formatDate = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString(i18n.language) : '—';
    const pending = ar ? 'جارٍ التحميل…' : 'Loading…';

    return (
        <section className="min-w-0 space-y-5" aria-busy={refreshing}>
            <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-accent)]">
                            <Server size={20} aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h2 className="text-xl font-bold text-[var(--VIARA-ink)]">
                                    {ar ? 'إصدار النظام' : 'System Release'}
                                </h2>
                                {status?.currentVersion && (
                                    <span className="rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-0.5 font-mono text-xs font-semibold text-[var(--VIARA-ink)]">
                                        <bdi>v{status.currentVersion}</bdi>
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--VIARA-muted)]">
                                {ar ? 'متابعة إصدار المنظومة الحالي وحالة الترحيلات' : 'Monitor running system release and database migrations'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="ds-button ds-button-secondary min-h-11"
                        disabled={refreshing}
                        onClick={() => { refetch(); refreshHistory(); }}
                    >
                        <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
                        <span>{ar ? 'تحديث الحالة' : 'Refresh status'}</span>
                    </button>
                </div>

                {isError && (
                    <div role="alert" className="mt-4 rounded-xl border border-[var(--VIARA-danger-border)] bg-[var(--VIARA-danger-soft)] p-3 text-xs text-[var(--VIARA-danger)]">
                        {ar ? 'تعذر تحميل حالة الإصدار. يرجى إعادة المحاولة.' : 'Release status could not be loaded. Try again.'}
                    </div>
                )}

                <div className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-4 text-[var(--VIARA-ink)]">
                    <ShieldCheck size={22} className="mt-0.5 shrink-0 text-[var(--VIARA-accent)]" aria-hidden="true" />
                    <div>
                        <h3 className="text-sm font-bold">
                            {ar ? 'تعتمد التحديثات على نشر الإصدارات المعتمدة' : 'Updates use an approved release deployment'}
                        </h3>
                        <p className="mt-1 text-xs leading-6 text-[var(--VIARA-muted)]">
                            {ar
                                ? 'يقوم مسؤول العمليات بنشر الإصدارات المعتمدة بعد إنشاء نسخة احتياطية كاملة والتحقق من سلامة استعادتها. رفع الحزم والتثبيت المباشر من داخل الواجهة غير متاحين حفاظاً على استقرار البيئة التشغيلية.'
                                : 'The operations administrator deploys releases after creating a backup and testing recovery. Package uploads and in-app installation are unavailable in this release.'}
                        </p>
                    </div>
                </div>

                <div className="mt-5 grid min-w-0 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
                    <div className="settings-fact rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3.5 shadow-2xs">
                        <div className="flex items-center gap-2 text-[var(--VIARA-muted)]">
                            <Layers size={15} aria-hidden="true" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                                {ar ? 'بيئة التشغيل' : 'Environment'}
                            </span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-[var(--VIARA-ink)]">
                            {isLoading ? pending : environmentLabels[status?.environment] || <bdi>{status?.environment || '—'}</bdi>}
                        </p>
                    </div>

                    <div className="settings-fact rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3.5 shadow-2xs">
                        <div className="flex items-center gap-2 text-[var(--VIARA-muted)]">
                            <Database size={15} aria-hidden="true" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                                {ar ? 'الترحيلات المسجلة' : 'Recorded Migrations'}
                            </span>
                        </div>
                        <p className="mt-1 font-mono text-sm font-bold text-[var(--VIARA-ink)]">
                            <bdi>{isLoading ? pending : status?.migrationsCount ?? '—'}</bdi>
                        </p>
                    </div>

                    <div className="settings-fact rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3.5 shadow-2xs">
                        <div className="flex items-center gap-2 text-[var(--VIARA-muted)]">
                            <GitBranch size={15} aria-hidden="true" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                                {ar ? 'آخر ترحيل' : 'Last Migration'}
                            </span>
                        </div>
                        <p dir="ltr" className="mt-2 break-all text-start font-mono text-xs font-bold leading-6 text-[var(--VIARA-ink)]" title={status?.lastMigration?.version || ''}>
                            {isLoading ? pending : status?.lastMigration?.version || '—'}
                        </p>
                        {status?.lastMigration?.applied_at && <p className="mt-1 text-xs text-[var(--VIARA-muted)]"><bdi>{formatDate(status.lastMigration.applied_at)}</bdi></p>}
                    </div>
                </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-4 shadow-sm sm:p-6" aria-busy={historyLoading || historyFetching}>
                <div className="flex items-center gap-2.5">
                    <History size={18} className="text-[var(--VIARA-muted)]" aria-hidden="true" />
                    <h3 className="text-base font-bold text-[var(--VIARA-ink)]">
                        {ar ? 'سجل التحديثات' : 'Historical Records'}
                    </h3>
                </div>
                <p className="mt-1 text-xs text-[var(--VIARA-muted)]">
                    {ar
                        ? 'عمليات نشر الإصدارات المسجلة في النظام. تُعرض ترحيلات قاعدة البيانات بصورة مستقلة أعلاه.'
                        : 'Release deployments recorded in the system. Database migrations are shown separately above.'}
                </p>

                {historyLoading ? (
                    <p role="status" className="mt-4 animate-pulse rounded-xl bg-[var(--VIARA-surface-muted)] p-6 text-center text-sm text-[var(--VIARA-muted)]">{pending}</p>
                ) : historyError ? (
                    <div role="alert" className="mt-4 rounded-xl border border-[var(--VIARA-danger-border)] bg-[var(--VIARA-danger-soft)] p-4 text-[var(--VIARA-danger)]">
                        <p className="flex items-start gap-2 text-sm"><AlertCircle size={18} className="shrink-0" aria-hidden="true" />{ar ? 'تعذر تحميل سجل التحديثات.' : 'Update history could not be loaded.'}</p>
                        <button type="button" onClick={refreshHistory} disabled={historyFetching} className="ds-button ds-button-secondary mt-3 min-h-11">{ar ? 'إعادة المحاولة' : 'Retry'}</button>
                    </div>
                ) : !history.length ? (
                    <div className="mt-4 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-6 text-center text-xs text-[var(--VIARA-muted)]">
                        {ar ? 'لم تُسجّل عمليات نشر للإصدارات هنا بعد.' : 'No release deployments have been recorded here yet.'}
                    </div>
                ) : (
                    <ul className="mt-4 divide-y divide-[var(--VIARA-line)] rounded-xl border border-[var(--VIARA-line)]">
                        {history.map(row => (
                            <li key={row.update_id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs">
                                <div dir="ltr" className="flex min-w-0 flex-wrap items-center gap-2 break-all font-mono">
                                    <span className="font-semibold text-[var(--VIARA-muted)]">{row.from_version || '—'}</span>
                                    <span>→</span>
                                    <span className="font-bold text-[var(--VIARA-ink)]">{row.to_version}</span>
                                </div>
                                <div className="flex min-w-0 flex-wrap items-center gap-3">
                                    <span className={`rounded-full px-2.5 py-1 font-semibold ${['applied', 'completed', 'success'].includes(row.status?.toLowerCase()) ? 'bg-[var(--VIARA-success-soft)] text-[var(--VIARA-success)]' : ['failed', 'error'].includes(row.status?.toLowerCase()) ? 'bg-[var(--VIARA-danger-soft)] text-[var(--VIARA-danger)]' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]'}`}>
                                        {ar ? ({ applied: 'مطبّق', completed: 'مكتمل', success: 'ناجح', failed: 'فشل', error: 'خطأ', pending: 'قيد الانتظار', running: 'قيد التنفيذ' }[row.status?.toLowerCase()] || row.status || '—') : row.status || '—'}
                                    </span>
                                    <time className="text-[var(--VIARA-muted)]">
                                        <bdi>{formatDate(row.applied_at)}</bdi>
                                    </time>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};

export default SystemUpdateSettings;
