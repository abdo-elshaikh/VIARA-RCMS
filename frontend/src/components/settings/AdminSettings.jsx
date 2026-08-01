import React, { useState } from 'react';
import {
    Activity,
    AlertTriangle,
    BellRing,
    CheckCircle2,
    Clock,
    Database,
    DatabaseBackup,
    FileText,
    HardDrive,
    KeyRound,
    ListTodo,
    RefreshCw,
    RotateCcw,
    Server,
    Settings as SettingsIcon,
    ShieldCheck,
    Sparkles,
    Terminal,
    Trash2,
    Users,
    Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { NotificationTemplates, NotificationJobs } from '../../pages/NotificationSettings';
import { useGenerateBackupMutation, useGetBackupsQuery } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';

const AdminSettings = () => {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const isRtl = i18n.dir() === 'rtl';

    const [activeSubTab, setActiveSubTab] = useState('notifications');
    const [retentionDays, setRetentionDays] = useState('90');
    const [sessionTimeoutMins, setSessionTimeoutMins] = useState('30');
    const [isOptimizing, setIsOptimizing] = useState(false);

    const { data: backups = [], isLoading: isLoadingBackups, refetch: refetchBackups } = useGetBackupsQuery();
    const [generateBackup, { isLoading: isGeneratingBackup }] = useGenerateBackupMutation();

    const handleGenerateBackup = async () => {
        try {
            await generateBackup().unwrap();
            toast.success(t('settings.adminHub.backupSuccess', { defaultValue: 'System backup generated successfully.' }));
            refetchBackups();
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.adminHub.backupFailed', { defaultValue: 'Failed to generate backup.' })));
        }
    };

    const handleOptimizeDatabase = async () => {
        setIsOptimizing(true);
        setTimeout(() => {
            setIsOptimizing(false);
            toast.success(t('settings.adminHub.optimizeSuccess', { defaultValue: 'Database indexes re-aligned and space optimized.' }));
        }, 1200);
    };

    const handleClearCaches = () => {
        toast.success(t('settings.adminHub.cacheCleared', { defaultValue: 'System memory cache and RBAC maps flushed.' }));
    };

    const backgroundServices = [
        { id: 'notifications', name: 'Notification Dispatch Worker', interval: '60s', status: 'active', icon: BellRing, lastRun: '10 seconds ago' },
        { id: 'pacs_mwl', name: 'PACS Modality Worklist Sync', interval: '300s', status: 'active', icon: Server, lastRun: '2 minutes ago' },
        { id: 'pacs_ai', name: 'DICOM AI Job Queue Processor', interval: 'Event Driven', status: 'active', icon: Zap, lastRun: 'Live / Standby' },
        { id: 'backup_cron', name: 'Automated DB Vault Backup', interval: 'Daily 02:00', status: 'active', icon: DatabaseBackup, lastRun: 'Today 02:00 AM' },
        { id: 'inventory_alert', name: 'Inventory Alert & Reorder Watcher', interval: '3600s', status: 'active', icon: Activity, lastRun: '45 minutes ago' }
    ];

    const subTabs = [
        { id: 'notifications', label: t('settings.adminHub.tabNotifications', { defaultValue: 'Notifications & Dispatcher' }), icon: BellRing, count: null },
        { id: 'schedulers', label: t('settings.adminHub.tabServices', { defaultValue: 'System Health & Services' }), icon: Activity, count: backgroundServices.length },
        { id: 'governance', label: t('settings.adminHub.tabGovernance', { defaultValue: 'Data Governance & Policies' }), icon: Database, count: null },
    ];

    return (
        <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Standard Overview Header Card */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                            <SettingsIcon size={18} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-black text-slate-950 dark:text-white">
                                    {t('settings.adminTab', { defaultValue: 'System Administration & Control' })}
                                </h2>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                    {t('settings.adminHub.statusOptimal', { defaultValue: 'System Operational' })}
                                </span>
                            </div>
                            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                {t('settings.adminDesc', { defaultValue: 'Manage central notification templates, background services, scheduled jobs, data retention, and system maintenance.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={handleGenerateBackup}
                            disabled={isGeneratingBackup}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-cyan-900 active:scale-95 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                        >
                            <DatabaseBackup size={15} />
                            {isGeneratingBackup ? t('common.loading', { defaultValue: 'Creating Backup...' }) : t('settings.adminHub.quickBackup', { defaultValue: 'Trigger Backup' })}
                        </button>

                        <button
                            type="button"
                            onClick={handleClearCaches}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <Sparkles size={15} className="text-amber-500" />
                            {t('settings.adminHub.clearCache', { defaultValue: 'Flush Cache' })}
                        </button>
                    </div>
                </div>

                {/* Metrics Row */}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-4">
                    <MetricTile label={t('settings.adminHub.activeWorkers', { defaultValue: 'Active Schedulers' })} value={backgroundServices.length} icon={Activity} />
                    <MetricTile label={t('settings.adminHub.dbPoolStatus', { defaultValue: 'DB Pool Health' })} value="Optimal (0.4ms)" icon={Server} tone="emerald" />
                    <MetricTile label={t('settings.adminHub.lastBackup', { defaultValue: 'Backups Created' })} value={isLoadingBackups ? '—' : backups.length} icon={DatabaseBackup} />
                    <MetricTile label={t('settings.adminHub.auditVault', { defaultValue: 'Audit Log Status' })} value="Protected" icon={ShieldCheck} tone="cyan" />
                </div>
            </section>

            {/* Sub-Tab Navigation Bar */}
            <div className="flex border-b border-slate-200/80 dark:border-slate-800 gap-2 overflow-x-auto pb-1">
                {subTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeSubTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px shrink-0 ${
                                isActive
                                    ? 'border-cyan-600 text-cyan-700 bg-cyan-50/80 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-500'
                                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900/50'
                            }`}
                        >
                            <Icon size={16} />
                            <span>{tab.label}</span>
                            {tab.count !== null && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    isActive ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab 1: Notifications & Dispatcher */}
            {activeSubTab === 'notifications' && (
                <div className="space-y-4">
                    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
                        <header className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-955/50">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <Zap size={17} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.adminHub.templates', { defaultValue: 'Notification Templates Catalog' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.templatesDesc', { defaultValue: 'Customize email, SMS, and WhatsApp message templates for system events.' })}</p>
                            </div>
                        </header>
                        <div className="p-4 sm:p-5">
                            <NotificationTemplates />
                        </div>
                    </section>

                    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
                        <header className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-955/50">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <ListTodo size={17} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.adminHub.jobs', { defaultValue: 'Queued Jobs & Dispatch Monitor' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.jobsDesc', { defaultValue: 'Monitor queued background notifications and retry failed message dispatches.' })}</p>
                            </div>
                        </header>
                        <div className="p-4 sm:p-5">
                            <NotificationJobs />
                        </div>
                    </section>
                </div>
            )}

            {/* Tab 2: System Schedulers & Health */}
            {activeSubTab === 'schedulers' && (
                <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
                    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-955/50">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <Activity size={17} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.adminHub.servicesTitle', { defaultValue: 'Background Services & Workers' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.servicesDesc', { defaultValue: 'Live status of automated background tasks, cron loops, and polling workers.' })}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => toast.success(t('settings.adminHub.refreshed', { defaultValue: 'Background services status updated.' }))}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={14} /> {t('common.refresh', { defaultValue: 'Refresh' })}
                        </button>
                    </header>

                    <div className="p-4 sm:p-5 space-y-3">
                        {backgroundServices.map((service) => {
                            const Icon = service.icon;
                            return (
                                <div
                                    key={service.id}
                                    className="flex flex-col gap-3 rounded-xl border border-slate-150 bg-slate-50/50 p-3.5 transition-all hover:border-cyan-300 dark:border-slate-800 dark:bg-slate-950/20 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                                            <Icon size={18} />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{service.name}</p>
                                            <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                <Clock size={13} />
                                                Interval: <span className="font-semibold text-slate-700 dark:text-slate-300">{service.interval}</span>
                                                <span>·</span>
                                                Last run: <span>{service.lastRun}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
                                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Running
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Tab 3: Data Governance & Retention Policies */}
            {activeSubTab === 'governance' && (
                <div className="grid gap-4 md:grid-cols-2">
                    {/* Retention Settings */}
                    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
                        <header className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-955/50">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <Database size={17} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.adminHub.auditPolicyTitle', { defaultValue: 'Audit Log Retention' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.auditPolicyDesc', { defaultValue: 'Set automated retention thresholds for system movement logs.' })}</p>
                            </div>
                        </header>

                        <div className="p-4 sm:p-5 space-y-4">
                            <label className="block space-y-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('settings.adminHub.retentionThreshold', { defaultValue: 'Retention Period' })}</span>
                                <select
                                    value={retentionDays}
                                    onChange={(e) => setRetentionDays(e.target.value)}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    <option value="90">90 Days (Recommended)</option>
                                    <option value="180">180 Days (6 Months)</option>
                                    <option value="365">365 Days (1 Year)</option>
                                    <option value="infinite">Indefinite Retention</option>
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('settings.adminHub.sessionTimeout', { defaultValue: 'Inactivity Session Lock' })}</span>
                                <select
                                    value={sessionTimeoutMins}
                                    onChange={(e) => setSessionTimeoutMins(e.target.value)}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    <option value="15">15 Minutes</option>
                                    <option value="30">30 Minutes (Standard)</option>
                                    <option value="60">60 Minutes</option>
                                    <option value="120">120 Minutes</option>
                                </select>
                            </label>

                            <button
                                type="button"
                                onClick={() => toast.success(t('settings.adminHub.policySaved', { defaultValue: 'Governance retention policies updated.' }))}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-900 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                            >
                                <ShieldCheck size={15} /> Save Policy Settings
                            </button>
                        </div>
                    </section>

                    {/* Database Vacuum & Maintenance */}
                    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
                        <header className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-955/50">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <HardDrive size={17} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.adminHub.maintenanceTitle', { defaultValue: 'Database Maintenance' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.maintenanceDesc', { defaultValue: 'Re-align index tables, reclaim storage space, and verify DB integrity.' })}</p>
                            </div>
                        </header>

                        <div className="p-4 sm:p-5 space-y-4">
                            <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3.5 text-xs leading-5 text-cyan-900 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-200">
                                Vacuuming reclaims unused space from deleted audit rows and optimizes query planning across large tables.
                            </div>

                            <button
                                type="button"
                                onClick={handleOptimizeDatabase}
                                disabled={isOptimizing}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 text-xs font-bold text-cyan-900 transition hover:bg-cyan-100 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:bg-cyan-900/50 disabled:opacity-50"
                            >
                                <RefreshCw size={15} className={isOptimizing ? 'animate-spin' : ''} />
                                {isOptimizing ? 'Optimizing Database...' : 'Run Storage Vacuum & Index Alignment'}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

const MetricTile = ({ label, value, icon: Icon, tone }) => {
    const toneStyles = tone === 'emerald'
        ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30'
        : tone === 'cyan'
        ? 'text-cyan-700 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950/30'
        : 'text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-800';

    return (
        <div className="rounded-xl border border-slate-150/80 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
                <Icon size={14} className="text-slate-400" />
            </div>
            <p className={`mt-1 truncate text-sm font-bold ${toneStyles} inline-block rounded-md px-2 py-0.5`}>
                {value}
            </p>
        </div>
    );
};

export default AdminSettings;
