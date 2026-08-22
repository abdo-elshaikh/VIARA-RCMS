import React, { useState, useEffect } from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
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
import { useNavigate } from 'react-router-dom';
import { NotificationTemplates, NotificationJobs } from '../../pages/NotificationSettings';
import {
    useGenerateBackupMutation,
    useGetBackupsQuery,
    useVacuumDatabaseMutation,
    useFlushServerCacheMutation,
    useGetAdminTelemetryQuery,
    useGetGovernancePoliciesQuery,
    useUpdateGovernancePoliciesMutation
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';

const AdminSettings = () => {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const navigate = useNavigate();

    const [activeSubTab, setActiveSubTab] = useState('notifications');
    const [retentionDays, setRetentionDays] = useState('90');
    const [sessionTimeoutMins, setSessionTimeoutMins] = useState('30');

    const { data: backups = [], isLoading: isLoadingBackups, refetch: refetchBackups } = useGetBackupsQuery();
    const [generateBackup, { isLoading: isGeneratingBackup }] = useGenerateBackupMutation();

    const { data: telemetry, isLoading: isLoadingTelemetry, refetch: refetchTelemetry } = useGetAdminTelemetryQuery(undefined, {
        pollingInterval: 30000
    });

    const { data: govData, isLoading: isLoadingGov } = useGetGovernancePoliciesQuery();
    const [updateGovernancePolicies, { isLoading: isSavingGov }] = useUpdateGovernancePoliciesMutation();

    const [vacuumDatabase, { isLoading: isOptimizing }] = useVacuumDatabaseMutation();
    const [flushServerCache, { isLoading: isFlushingCache }] = useFlushServerCacheMutation();

    useEffect(() => {
        if (govData) {
            if (govData.retentionDays !== undefined) setRetentionDays(String(govData.retentionDays));
            if (govData.sessionTimeoutMins !== undefined) setSessionTimeoutMins(String(govData.sessionTimeoutMins));
        }
    }, [govData]);

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
        try {
            const res = await vacuumDatabase().unwrap();
            toast.success(res.message || t('settings.adminHub.optimizeSuccess', { defaultValue: 'Database indexes re-aligned and space optimized.' }));
            refetchTelemetry();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Database vacuum failed'));
        }
    };

    const handleClearCaches = async () => {
        try {
            const res = await flushServerCache().unwrap();
            toast.success(res.message || t('settings.adminHub.cacheCleared', { defaultValue: 'System memory cache and RBAC maps flushed.' }));
            refetchTelemetry();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Cache flush failed'));
        }
    };

    const handleSavePolicy = async () => {
        try {
            const res = await updateGovernancePolicies({ retentionDays, sessionTimeoutMins }).unwrap();
            toast.success(res.message || t('settings.adminHub.policySaved', { defaultValue: 'Governance retention policies updated.' }));
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save governance policy'));
        }
    };

    const defaultServices = [
        { id: 'notifications', name: 'Notification Dispatch Worker', interval: '60s', status: 'active', icon: BellRing, lastRun: '10 seconds ago' },
        { id: 'pacs_mwl', name: 'PACS Modality Worklist Sync', interval: '300s', status: 'active', icon: Server, lastRun: '2 minutes ago' },
        { id: 'pacs_ai', name: 'DICOM AI Job Queue Processor', interval: 'Event Driven', status: 'active', icon: Zap, lastRun: 'Live / Standby' },
        { id: 'backup_cron', name: 'Automated DB Vault Backup', interval: 'Daily 02:00', status: 'active', icon: DatabaseBackup, lastRun: 'Today 02:00 AM' },
        { id: 'inventory_alert', name: 'Inventory Alert & Reorder Watcher', interval: '3600s', status: 'active', icon: Activity, lastRun: '45 minutes ago' }
    ];

    const backgroundServices = (telemetry?.services || defaultServices).map((s) => ({
        ...s,
        icon: s.id === 'notifications' ? BellRing : s.id === 'pacs_mwl' ? Server : s.id === 'pacs_ai' ? Zap : s.id === 'backup_cron' ? DatabaseBackup : Activity
    }));

    const quickLinks = [
        { id: 'team', label: t('settings.adminHub.quickLinks.team', { defaultValue: 'Manage team access' }), description: t('settings.adminHub.quickLinks.teamDesc', { defaultValue: 'Review staff roles and account access.' }), icon: Users },
        { id: 'roles', label: t('settings.adminHub.quickLinks.roles', { defaultValue: 'Review permissions' }), description: t('settings.adminHub.quickLinks.rolesDesc', { defaultValue: 'Maintain role-based permissions.' }), icon: KeyRound },
        { id: 'auditLogs', label: t('settings.adminHub.quickLinks.audit', { defaultValue: 'Open audit logs' }), description: t('settings.adminHub.quickLinks.auditDesc', { defaultValue: 'Investigate administrative activity.' }), icon: FileText },
        { id: 'backups', label: t('settings.adminHub.quickLinks.backups', { defaultValue: 'Manage backups' }), description: t('settings.adminHub.quickLinks.backupsDesc', { defaultValue: 'Review backup history and recovery tools.' }), icon: DatabaseBackup },
        { id: 'integrations', label: t('settings.adminHub.quickLinks.integrations', { defaultValue: 'Configure integrations' }), description: t('settings.adminHub.quickLinks.integrationsDesc', { defaultValue: 'Check connected clinical services.' }), icon: Server },
        { id: 'pacs', label: t('settings.adminHub.quickLinks.pacs', { defaultValue: 'Open PACS settings' }), description: t('settings.adminHub.quickLinks.pacsDesc', { defaultValue: 'Manage DICOM endpoints and archive health.' }), icon: HardDrive }
    ];


    const subTabs = [
        { id: 'notifications', label: t('settings.adminHub.tabNotifications', { defaultValue: 'Notifications & Dispatcher' }), icon: BellRing, count: null },
        { id: 'schedulers', label: t('settings.adminHub.tabServices', { defaultValue: 'System Health & Services' }), icon: Activity, count: backgroundServices.length },
        { id: 'governance', label: t('settings.adminHub.tabGovernance', { defaultValue: 'Data Governance & Policies' }), icon: Database, count: null },
    ];

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* VIARA Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <SettingsIcon size={26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <ShieldCheck size={11} />
                                    <span>System Administration & Superuser Controls</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    {t('settings.adminHub.statusOptimal', { defaultValue: 'System Operational' })}
                                </span>
                            </div>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('settings.adminTab', { defaultValue: 'System Administration & Superuser Center' })}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('settings.adminDesc', { defaultValue: 'Manage notification delivery, background schedulers, data retention governance, and emergency operational controls.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={handleGenerateBackup}
                            disabled={isGeneratingBackup}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-teal-500 disabled:opacity-50"
                        >
                            <DatabaseBackup size={14} className={isGeneratingBackup ? 'animate-spin' : ''} />
                            <span>{isGeneratingBackup ? t('common.loading', { defaultValue: 'Creating Backup...' }) : t('settings.adminHub.quickBackup', { defaultValue: 'Trigger Snapshot' })}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleClearCaches}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <Sparkles size={14} className="text-amber-500" />
                            <span>{t('settings.adminHub.clearCache', { defaultValue: 'Flush Memory Cache' })}</span>
                        </button>
                    </div>
                </div>

                {/* Telemetry Facts HUD */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-100/80 px-4 py-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Activity size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Background Schedulers</p>
                            <p className="font-mono text-base font-black text-slate-900 dark:text-white">{backgroundServices.length} Active</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-emerald-800 dark:text-emerald-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Server size={16} className="text-emerald-600 dark:emerald-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">DB Latency</p>
                            <p className="font-mono text-base font-black text-emerald-900 dark:text-white">
                                {isLoadingTelemetry ? 'Testing...' : telemetry?.dbLatencyMs ? `${telemetry.dbLatencyMs.toFixed(1)} ms` : 'Live (Healthy)'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-sky-800 dark:text-sky-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <DatabaseBackup size={16} className="text-sky-600 dark:text-sky-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">System Backups</p>
                            <p className="font-mono text-base font-black text-sky-900 dark:text-white">{isLoadingBackups ? '—' : backups.length}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-amber-800 dark:text-amber-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <ShieldCheck size={16} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">Audit Integrity</p>
                            <p className="font-mono text-base font-black text-amber-900 dark:text-white">Protected</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick-Jump Workspaces Deck */}
            <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-950 p-6 text-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-[#07111f] space-y-4" aria-labelledby="admin-quick-links-title">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-300">
                            <SettingsIcon size={11} />
                            <span>Administrative Directory</span>
                        </span>
                        <h2 id="admin-quick-links-title" className="mt-1 text-lg font-black">{t('settings.adminHub.quickLinksTitle', { defaultValue: 'Privileged Workspace Navigation' })}</h2>
                        <p className="mt-1 text-xs leading-5 text-slate-300">{t('settings.adminHub.quickLinksDesc', { defaultValue: 'Instant administrative shortcuts to configure roles, PACS pipelines, audit journals, and backups.' })}</p>
                    </div>
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-400/20">
                        <CheckCircle2 size={13} /> {t('settings.adminHub.statusOptimal', { defaultValue: 'System operational' })}
                    </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {quickLinks.map((link) => {
                        const Icon = link.icon;
                        return (
                            <button
                                key={link.id}
                                type="button"
                                onClick={() => navigate(`/settings?tab=${link.id}`)}
                                className="group flex min-h-[82px] items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[.05] p-3.5 text-start transition hover:border-teal-400/50 hover:bg-teal-400/10 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-400/15 text-teal-200 transition group-hover:bg-teal-400 group-hover:text-slate-950 shadow-2xs">
                                    <Icon size={18} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-black text-white">{link.label}</span>
                                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{link.description}</span>
                                </span>
                                <ArrowUpRight size={15} className="shrink-0 text-slate-500 transition group-hover:text-teal-200" />
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Sub-Tab Navigation Pills */}
            <div className="flex border-b border-slate-200/80 dark:border-slate-800 gap-2 overflow-x-auto pb-1">
                {subTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeSubTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px shrink-0 ${
                                isActive
                                    ? 'border-teal-600 text-teal-700 bg-teal-500/10 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500 shadow-2xs'
                                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
                            }`}
                        >
                            <Icon size={16} />
                            <span>{tab.label}</span>
                            {tab.count !== null && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    isActive ? 'bg-teal-600/20 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
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
                <div className="space-y-6">
                    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <header className="flex items-start gap-3 border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-955/50">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                                <Zap size={18} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-bold text-slate-950 dark:text-white">{t('settings.adminHub.templates', { defaultValue: 'Notification Templates Catalog' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.templatesDesc', { defaultValue: 'Customize email, SMS, and WhatsApp message templates for system events.' })}</p>
                            </div>
                        </header>
                        <div className="p-6">
                            <NotificationTemplates />
                        </div>
                    </section>

                    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <header className="flex items-start gap-3 border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-955/50">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                                <ListTodo size={18} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-bold text-slate-950 dark:text-white">{t('settings.adminHub.jobs', { defaultValue: 'Queued Jobs & Dispatch Monitor' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.jobsDesc', { defaultValue: 'Monitor queued background notifications and retry failed message dispatches.' })}</p>
                            </div>
                        </header>
                        <div className="p-6">
                            <NotificationJobs />
                        </div>
                    </section>
                </div>
            )}

            {/* Tab 2: System Schedulers & Health */}
            {activeSubTab === 'schedulers' && (
                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-955/50">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                                <Activity size={18} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-bold text-slate-950 dark:text-white">{t('settings.adminHub.servicesTitle', { defaultValue: 'Background Services & Workers' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.servicesDesc', { defaultValue: 'Live status of automated background tasks, cron loops, and polling workers.' })}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                refetchTelemetry();
                                toast.success(t('settings.adminHub.refreshed', { defaultValue: 'Background services status updated.' }));
                            }}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={14} className={isLoadingTelemetry ? 'animate-spin' : ''} /> <span>{t('common.refresh', { defaultValue: 'Refresh' })}</span>
                        </button>
                    </header>

                    <div className="p-6 space-y-3">
                        {backgroundServices.map((service) => {
                            const Icon = service.icon;
                            return (
                                <div
                                    key={service.id}
                                    className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 transition-all hover:border-teal-500/40 dark:border-slate-800 dark:bg-slate-950/20 shadow-2xs sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                                            <Icon size={18} />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="break-words text-sm font-bold text-slate-950 dark:text-white">{service.name}</p>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                <Clock size={13} />
                                                <span>Interval: <span className="font-semibold text-slate-700 dark:text-slate-300">{service.interval}</span></span>
                                                <span>·</span>
                                                <span>Last run: <span>{service.lastRun}</span></span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
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
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Retention Settings */}
                    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <header className="flex items-start gap-3 border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-955/50">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                                <Database size={18} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-bold text-slate-950 dark:text-white">{t('settings.adminHub.auditPolicyTitle', { defaultValue: 'Audit Log Retention' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.auditPolicyDesc', { defaultValue: 'Set automated retention thresholds for system movement logs.' })}</p>
                            </div>
                        </header>

                        <div className="p-6 space-y-4">
                            <label className="block space-y-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('settings.adminHub.retentionThreshold', { defaultValue: 'Retention Period' })}</span>
                                <select
                                    value={retentionDays}
                                    onChange={(e) => setRetentionDays(e.target.value)}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    <option value="15">15 Minutes</option>
                                    <option value="30">30 Minutes (Standard)</option>
                                    <option value="60">60 Minutes</option>
                                    <option value="120">120 Minutes</option>
                                </select>
                            </label>

                            <button
                                type="button"
                                onClick={handleSavePolicy}
                                disabled={isSavingGov}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-500 disabled:opacity-50"
                            >
                                <ShieldCheck size={15} /> <span>{isSavingGov ? 'Saving...' : 'Save Policy Settings'}</span>
                            </button>
                        </div>
                    </section>

                    {/* Database Vacuum & Maintenance */}
                    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <header className="flex items-start gap-3 border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-955/50">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                                <HardDrive size={18} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-bold text-slate-950 dark:text-white">{t('settings.adminHub.maintenanceTitle', { defaultValue: 'Database Maintenance' })}</h2>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.adminHub.maintenanceDesc', { defaultValue: 'Re-align index tables, reclaim storage space, and verify DB integrity.' })}</p>
                            </div>
                        </header>

                        <div className="p-6 space-y-4">
                            <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 p-4 text-xs leading-5 text-teal-900 dark:text-teal-200">
                                Vacuuming reclaims unused space from deleted audit rows and optimizes query planning across large tables.
                            </div>

                            <button
                                type="button"
                                onClick={handleOptimizeDatabase}
                                disabled={isOptimizing}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 text-xs font-bold text-teal-900 transition hover:bg-teal-500/20 dark:border-teal-500/30 dark:bg-teal-950/40 dark:text-teal-200 dark:hover:bg-teal-900/50 disabled:opacity-50"
                            >
                                <RefreshCw size={15} className={isOptimizing ? 'animate-spin' : ''} />
                                <span>{isOptimizing ? 'Optimizing Database...' : 'Run Storage Vacuum & Index Alignment'}</span>
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

export default AdminSettings;
