import React from 'react';
import { RefreshCw, Server, ShieldCheck, Database, Layers, GitBranch, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetSystemUpdateStatusQuery, useGetSystemUpdateHistoryQuery } from '../../store/api';

const SystemUpdateSettings = () => {
    const { i18n } = useTranslation(['settings', 'common']);
    const ar = i18n.dir() === 'rtl';
    const { data: status, isLoading, isError, refetch } = useGetSystemUpdateStatusQuery();
    const { data: history = [], refetch: refreshHistory } = useGetSystemUpdateHistoryQuery(20);

    return (
        <section className="space-y-5" aria-busy={isLoading}>
            <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-6 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-accent)]">
                            <Server size={20} aria-hidden="true" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-xl font-bold text-[var(--VIARA-ink)]">
                                    {ar ? 'إصدار النظام' : 'System Release'}
                                </h2>
                                {status?.currentVersion && (
                                    <span className="rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-0.5 font-mono text-xs font-semibold text-[var(--VIARA-ink)]">
                                        v{status.currentVersion}
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
                        className="ds-button ds-button-secondary ds-button-sm"
                        disabled={isLoading}
                        onClick={() => { refetch(); refreshHistory(); }}
                    >
                        <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
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

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="settings-fact rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3.5 shadow-2xs">
                        <div className="flex items-center gap-2 text-[var(--VIARA-muted)]">
                            <Layers size={15} aria-hidden="true" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                                {ar ? 'بيئة التشغيل' : 'Environment'}
                            </span>
                        </div>
                        <p className="mt-1 font-mono text-sm font-bold text-[var(--VIARA-ink)]">
                            {status?.environment || '—'}
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
                            {status?.migrationsCount ?? '—'}
                        </p>
                    </div>

                    <div className="settings-fact rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3.5 shadow-2xs">
                        <div className="flex items-center gap-2 text-[var(--VIARA-muted)]">
                            <GitBranch size={15} aria-hidden="true" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                                {ar ? 'آخر ترحيل' : 'Last Migration'}
                            </span>
                        </div>
                        <p className="mt-1 break-all font-mono text-xs font-bold text-[var(--VIARA-ink)]" title={status?.lastMigration?.version || ''}>
                            {status?.lastMigration?.version || '—'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-6 shadow-2xs">
                <div className="flex items-center gap-2.5">
                    <History size={18} className="text-[var(--VIARA-muted)]" aria-hidden="true" />
                    <h3 className="text-base font-bold text-[var(--VIARA-ink)]">
                        {ar ? 'سجل التحديثات' : 'Historical Records'}
                    </h3>
                </div>
                <p className="mt-1 text-xs text-[var(--VIARA-muted)]">
                    {ar
                        ? 'السجلات التاريخية توثق عمليات الترقية السابقة وتغييرات المخطط المطبقة على قاعدة البيانات.'
                        : 'Historical records document previous upgrades and database schema changes.'}
                </p>

                {!history.length ? (
                    <div className="mt-4 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-6 text-center text-xs text-[var(--VIARA-muted)]">
                        {ar ? 'لا توجد سجلات ترقية سابقة.' : 'No historical upgrade records.'}
                    </div>
                ) : (
                    <ul className="mt-4 divide-y divide-[var(--VIARA-line)] rounded-xl border border-[var(--VIARA-line)]">
                        {history.map(row => (
                            <li key={row.update_id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs">
                                <div className="flex items-center gap-2 font-mono">
                                    <span className="font-semibold text-[var(--VIARA-muted)]">{row.from_version || 'v1.0.0'}</span>
                                    <span>→</span>
                                    <span className="font-bold text-[var(--VIARA-ink)]">{row.to_version}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="rounded-full bg-[var(--VIARA-success-soft)] px-2.5 py-0.5 font-semibold text-[var(--VIARA-success)]">
                                        {row.status || 'applied'}
                                    </span>
                                    <time className="text-[var(--VIARA-muted)]">
                                        {row.applied_at ? new Date(row.applied_at).toLocaleString(i18n.language) : '—'}
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
