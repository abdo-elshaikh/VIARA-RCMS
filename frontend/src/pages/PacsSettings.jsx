import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import {
    Activity,
    AlertCircle,
    AlertTriangle,
    BrainCircuit,
    CheckCircle2,
    ClipboardList,
    Database,
    Edit3,
    Eye,
    Lock,
    Monitor,
    Network,
    Plus,
    PlayCircle,
    RefreshCw,
    RotateCcw,
    Save,
    Server,
    ShieldCheck,
    Trash2,
    XCircle
} from 'lucide-react';

import {
    useCreateMachineMutation,
    useDeleteMachineMutation,
    useGetPacsAiAnalysisQueueQuery,
    useGetMachinesQuery,
    useGetOrthancSystemQuery,
    useGetPacsAuditQuery,
    useGetPacsConfigQuery,
    useGetPacsDiagnosticsQuery,
    useGetPacsRequestsQuery,
    useGetPacsStorageSummaryQuery,
    useGetPacsWorklistPreviewQuery,
    usePingModalityDicomMutation,
    useProcessPacsAiAnalysisQueueMutation,
    useRefreshPacsWorklistMutation,
    useRunPacsTieringMutation,
    useSyncModalityDicomMutation,
    useUpdateMachineMutation,
    useUpdatePacsConfigMutation,
    useRetryPacsAiJobMutation,
    useCancelPacsAiJobMutation,
    useDeletePacsAiJobMutation,
    useRetryAllPacsAiJobsMutation,
    useCancelAllPacsAiJobsMutation
} from '../store/api';

const DEFAULT_CONFIG = {
    pacs_server_aet: '',
    pacs_server_ip: '',
    pacs_server_port: '4242',
    orthanc_api_url: '',
    orthanc_username: '',
    orthanc_password: '',
    is_pacs_enabled: false,
    auto_import_dicom: true
};

const DEFAULT_MACHINE = {
    aet_title: '',
    modality_type: 'CT',
    name: '',
    ip_address: '',
    port: 104,
    location: '',
    manufacturer: '',
    is_active: true
};

const MODALITY_OPTIONS = ['CT', 'MR', 'XR', 'US', 'MG', 'DX', 'CR', 'NM', 'PT', 'XA', 'OT'];

const panelClass = "rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90";
const inputClass = "w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-teal-400";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800";
const primaryButtonClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-teal-500 disabled:opacity-50";

const fieldClass = (error) => `${inputClass} ${error ? 'border-rose-300 dark:border-rose-900 focus:border-rose-500 focus:ring-rose-500/20' : ''}`;

const toneIconClass = (tone = 'slate') => {
    switch (tone) {
        case 'emerald':
            return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400';
        case 'amber':
            return 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400';
        case 'rose':
            return 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400';
        case 'teal':
            return 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400';
        case 'cyan':
            return 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400';
        default:
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
};

const SummaryMetric = ({ icon: Icon, label, value, tone = 'slate' }) => (
    <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/50 p-3.5 dark:border-slate-800/60 dark:bg-slate-950/30">
        <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneIconClass(tone)}`}>
            <Icon size={18} />
        </span>
    </div>
);

const FieldError = ({ message }) => (
    message ? <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{message}</p> : null
);

const StatusBadge = ({ tone = 'slate', children }) => {
    const tones = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400',
        amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400',
        rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-400',
        teal: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-400',
        cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-400',
        slate: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
    };
    return (
        <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${tones[tone] || tones.slate}`}>
            {children}
        </span>
    );
};

const formatNumber = (value) => (
    typeof value === 'number' && !Number.isNaN(value)
        ? new Intl.NumberFormat().format(value)
        : value || '0'
);

const PacsDiagnosticsPanel = ({ diagnostics = {}, loading = false, onRefresh = () => {}, reveal = () => ({}), t = (key) => key }) => {
    const checks = diagnostics.checks || [];
    const okChecks = checks.filter((c) => c.status === 'ok').length;
    const warningChecks = checks.filter((c) => c.status === 'warning').length;
    const errorChecks = checks.filter((c) => c.status === 'error').length;
    const summaryTone = errorChecks > 0 ? 'rose' : warningChecks > 0 ? 'amber' : 'emerald';

    return (
        <section className={panelClass} {...reveal(220)}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">
                        {t('admin:pacsSettings.diagnostics.title', { defaultValue: 'System diagnostics & health' })}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {t('admin:pacsSettings.diagnostics.help', { defaultValue: 'Real-time connectivity and configuration checks for DICOM server, REST API, storage, and worker queues.' })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <StatusBadge tone={summaryTone}>
                        {errorChecks > 0
                            ? t('admin:pacsSettings.diagnostics.errorsFound', { defaultValue: '{{count}} issue(s)', count: errorChecks })
                            : warningChecks > 0
                                ? t('admin:pacsSettings.diagnostics.warningsFound', { defaultValue: '{{count}} warning(s)', count: warningChecks })
                                : t('admin:pacsSettings.diagnostics.allOk', { defaultValue: 'All checks passed' })}
                    </StatusBadge>
                    <button type="button" onClick={onRefresh} disabled={loading} className={buttonClass}>
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                    </button>
                </div>
            </div>

            {loading ? (
                <PageState icon={Activity} spin title={t('admin:pacsSettings.diagnostics.loading', { defaultValue: 'Running system diagnostics...' })} />
            ) : checks.length === 0 ? (
                <PageState icon={ShieldCheck} title={t('admin:pacsSettings.diagnostics.empty', { defaultValue: 'No diagnostic checks available' })} />
            ) : (
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {checks.map((check) => (
                        <DiagnosticCheckCard key={check.id} check={check} t={t} />
                    ))}
                </div>
            )}
        </section>
    );
};

const DiagnosticCheckCard = ({ check, t }) => {
    const tone = check.status === 'ok' ? 'emerald' : check.status === 'warning' ? 'amber' : 'rose';
    const Icon = check.status === 'ok' ? CheckCircle2 : check.status === 'warning' ? AlertTriangle : AlertCircle;

    return (
        <div className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-3.5 dark:border-slate-800/60 dark:bg-slate-950/20">
            <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneIconClass(tone)}`}>
                    <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{check.name}</p>
                        <StatusBadge tone={tone}>{check.status}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{check.detail || '-'}</p>
                </div>
            </div>
        </div>
    );
};

const PacsConfigPanel = ({ reveal = () => ({}) }) => {
    const { t } = useTranslation(['admin', 'common']);
    const { data: configData = DEFAULT_CONFIG, isLoading: isConfigLoading, refetch: refetchConfig } = useGetPacsConfigQuery();
    const { data: stats = {}, isError: isHealthError, isFetching: isFetchingSystem, refetch: refetchSystem } = useGetOrthancSystemQuery();
    const { data: diagnostics = {}, isFetching: isFetchingDiagnostics, refetch: refetchDiagnostics } = useGetPacsDiagnosticsQuery();
    const [updatePacsConfig, { isLoading: isSaving }] = useUpdatePacsConfigMutation();

    const [form, setForm] = useState(DEFAULT_CONFIG);
    const [validationErrors, setValidationErrors] = useState({});

    useEffect(() => {
        if (configData) {
            setForm({
                pacs_server_aet: configData.pacs_server_aet || '',
                pacs_server_ip: configData.pacs_server_ip || '',
                pacs_server_port: configData.pacs_server_port != null ? String(configData.pacs_server_port) : '4242',
                orthanc_api_url: configData.orthanc_api_url || '',
                orthanc_username: configData.orthanc_username || '',
                orthanc_password: '',
                is_pacs_enabled: Boolean(configData.is_pacs_enabled),
                auto_import_dicom: configData.auto_import_dicom ?? true
            });
            setValidationErrors({});
        }
    }, [configData]);

    const hasStoredPassword = Boolean(configData?.has_orthanc_password);

    const dirty = useMemo(() => {
        if (!configData) return false;
        return (
            form.pacs_server_aet !== (configData.pacs_server_aet || '') ||
            form.pacs_server_ip !== (configData.pacs_server_ip || '') ||
            form.pacs_server_port !== (configData.pacs_server_port != null ? String(configData.pacs_server_port) : '4242') ||
            form.orthanc_api_url !== (configData.orthanc_api_url || '') ||
            form.orthanc_username !== (configData.orthanc_username || '') ||
            Boolean(form.orthanc_password) ||
            form.is_pacs_enabled !== Boolean(configData.is_pacs_enabled) ||
            form.auto_import_dicom !== (configData.auto_import_dicom ?? true)
        );
    }, [form, configData]);

    const updateField = (field) => (event) => {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
        if (validationErrors[field]) {
            setValidationErrors((prev) => ({ ...prev, [field]: null }));
        }
    };

    const validateForm = () => {
        const errors = {};
        if (form.is_pacs_enabled) {
            if (!form.pacs_server_aet.trim()) errors.pacs_server_aet = t('admin:pacsSettings.validation.aetRequired', { defaultValue: 'AET title is required' });
            if (!form.pacs_server_ip.trim()) errors.pacs_server_ip = t('admin:pacsSettings.validation.ipRequired', { defaultValue: 'Server host/IP is required' });
            const port = Number(form.pacs_server_port);
            if (!port || port < 1 || port > 65535) errors.pacs_server_port = t('admin:pacsSettings.validation.portInvalid', { defaultValue: 'Valid port (1-65535) required' });
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSaveConfig = async (event) => {
        event.preventDefault();
        if (!validateForm()) return;

        try {
            const payload = {
                ...form,
                pacs_server_port: Number(form.pacs_server_port) || 4242
            };
            if (!payload.orthanc_password) {
                delete payload.orthanc_password;
            }
            await updatePacsConfig(payload).unwrap();
            toast.success(t('admin:pacsSettings.configSaved', { defaultValue: 'PACS configuration saved successfully' }));
            refetchConfig();
            refetchSystem();
            refetchDiagnostics();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.configSaveError', { defaultValue: 'Failed to save PACS configuration' }));
        }
    };

    const handleRefreshSystem = () => {
        refetchSystem();
        refetchDiagnostics();
    };

    const applyRestHostEndpoint = () => {
        try {
            if (!form.orthanc_api_url) return;
            const parsed = new URL(form.orthanc_api_url);
            setForm((prev) => ({ ...prev, pacs_server_ip: parsed.hostname }));
        } catch {
            toast.error(t('admin:pacsSettings.invalidUrl', { defaultValue: 'Invalid REST API URL format' }));
        }
    };

    if (isConfigLoading) {
        return <PageState icon={Activity} spin title={t('admin:pacsSettings.loadingConfig', { defaultValue: 'Loading PACS configuration...' })} />;
    }

    return (
        <div className="space-y-5">
            {isHealthError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" />
                        <p>{t('admin:pacsSettings.healthWarning', { defaultValue: 'Orthanc server health check failing. Check REST URL, credentials, or DICOM service status.' })}</p>
                    </div>
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" {...reveal(240)}>
                <SummaryMetric icon={Server} label={t('admin:pacsSettings.stats.version', { defaultValue: 'Orthanc version' })} value={stats.version || '-'} tone={isHealthError ? 'rose' : 'teal'} />
                <SummaryMetric icon={Network} label={t('admin:pacsSettings.stats.aet', { defaultValue: 'Server AET' })} value={stats.aet || '-'} tone={isHealthError ? 'rose' : 'emerald'} />
                <SummaryMetric icon={Monitor} label={t('admin:pacsSettings.stats.studies', { defaultValue: 'Studies' })} value={formatNumber(stats.countStudies)} />
                <SummaryMetric icon={Database} label={t('admin:pacsSettings.stats.disk', { defaultValue: 'Archive MB' })} value={formatNumber(stats.totalDiskSizeMB)} />
            </div>

            <PacsDiagnosticsPanel
                diagnostics={diagnostics}
                loading={isFetchingDiagnostics}
                onRefresh={refetchDiagnostics}
                reveal={reveal}
                t={t}
            />

            <form onSubmit={handleSaveConfig} className={panelClass} {...reveal(300)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.globalConfigTitle', { defaultValue: 'PACS configuration' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.globalConfigDesc', { defaultValue: 'Settings used for DICOM networking and Orthanc REST API access.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={dirty ? 'amber' : 'emerald'}>
                            {dirty
                                ? t('admin:pacsSettings.unsaved', { defaultValue: 'Unsaved changes' })
                                : t('admin:pacsSettings.saved', { defaultValue: 'Saved' })}
                        </StatusBadge>
                        <StatusBadge tone={hasStoredPassword || form.orthanc_password ? 'emerald' : 'slate'}>
                            {hasStoredPassword || form.orthanc_password
                                ? t('admin:pacsSettings.passwordSet', { defaultValue: 'Password set' })
                                : t('admin:pacsSettings.passwordMissing', { defaultValue: 'No password' })}
                        </StatusBadge>
                        <button type="button" onClick={handleRefreshSystem} disabled={isFetchingSystem} className={buttonClass}>
                            <RefreshCw size={14} className={isFetchingSystem ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                    </div>
                </div>

                <div className="grid gap-6 p-4 lg:grid-cols-2">
                    <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                                <Network size={16} className="text-teal-700 dark:text-teal-300" />
                                {t('admin:pacsSettings.dicomProtocol', { defaultValue: 'DICOM protocol' })}
                            </div>
                            <button type="button" onClick={applyRestHostEndpoint} className={buttonClass}>
                                {t('admin:pacsSettings.useRestHost', { defaultValue: 'Use REST host' })}
                            </button>
                        </div>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {t('admin:pacsSettings.serverAet', { defaultValue: 'PACS server AET' })}
                            </span>
                            <input required maxLength={50} value={form.pacs_server_aet} onChange={updateField('pacs_server_aet')} className={fieldClass(validationErrors.pacs_server_aet)} placeholder="ORTHANC" autoCapitalize="characters" />
                            <FieldError message={validationErrors.pacs_server_aet} />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.serverHost', { defaultValue: 'Server host/IP' })}
                                </span>
                                <input required value={form.pacs_server_ip} onChange={updateField('pacs_server_ip')} className={fieldClass(validationErrors.pacs_server_ip)} placeholder="127.0.0.1 or orthanc" />
                                <FieldError message={validationErrors.pacs_server_ip} />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.serverPort', { defaultValue: 'DICOM port' })}
                                </span>
                                <input required type="number" min={1} max={65535} value={form.pacs_server_port} onChange={updateField('pacs_server_port')} className={fieldClass(validationErrors.pacs_server_port)} placeholder="4242" />
                                <FieldError message={validationErrors.pacs_server_port} />
                            </label>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                            <Server size={16} className="text-teal-700 dark:text-teal-300" />
                            {t('admin:pacsSettings.restApiConfig', { defaultValue: 'Orthanc REST API' })}
                        </div>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {t('admin:pacsSettings.apiUrl', { defaultValue: 'REST API base URL' })}
                            </span>
                            <input value={form.orthanc_api_url} onChange={updateField('orthanc_api_url')} className={fieldClass(validationErrors.orthanc_api_url)} placeholder="http://127.0.0.1:8042" />
                            <FieldError message={validationErrors.orthanc_api_url} />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.username', { defaultValue: 'Username' })}
                                </span>
                                <input value={form.orthanc_username} onChange={updateField('orthanc_username')} className={inputClass} placeholder="orthanc" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.password', { defaultValue: 'Password' })}
                                </span>
                                <input type="password" value={form.orthanc_password} onChange={updateField('orthanc_password')} className={inputClass} placeholder={hasStoredPassword ? '•••••••• (unchanged)' : 'Enter password'} />
                            </label>
                        </div>
                    </section>
                </div>

                <div className="grid gap-4 border-t border-slate-200/60 p-4 dark:border-slate-800/60 md:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800/60 dark:bg-slate-950/20">
                        <input type="checkbox" checked={form.is_pacs_enabled} onChange={updateField('is_pacs_enabled')} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                        <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{t('admin:pacsSettings.enablePacs', { defaultValue: 'Enable PACS integration' })}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('admin:pacsSettings.enablePacsHelp', { defaultValue: 'Activates DICOM routing and modality worklist querying.' })}</p>
                        </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800/60 dark:bg-slate-950/20">
                        <input type="checkbox" checked={form.auto_import_dicom} onChange={updateField('auto_import_dicom')} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                        <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{t('admin:pacsSettings.autoImport', { defaultValue: 'Auto-import DICOM instances' })}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('admin:pacsSettings.autoImportHelp', { defaultValue: 'Automatically index new instances into VIARA studies and reports.' })}</p>
                        </div>
                    </label>
                </div>

                <div className="flex items-center justify-end border-t border-slate-200/60 p-4 dark:border-slate-800/60">
                    <button type="submit" disabled={isSaving || !dirty} className={primaryButtonClass}>
                        <Save size={14} className={isSaving ? 'animate-spin' : ''} />
                        {t('common:actions.save', { defaultValue: 'Save configuration' })}
                    </button>
                </div>
            </form>
        </div>
    );
};

const PacsModalitiesPanel = ({ reveal = () => ({}) }) => {
    const { t } = useTranslation(['admin', 'common']);
    const { data: machines = [], isLoading, isFetching, refetch } = useGetMachinesQuery();
    const [createMachine, { isLoading: isCreating }] = useCreateMachineMutation();
    const [updateMachine, { isLoading: isUpdating }] = useUpdateMachineMutation();
    const [deleteMachine, { isLoading: isDeleting }] = useDeleteMachineMutation();
    const [pingModality, { isLoading: isPinging }] = usePingModalityDicomMutation();
    const [syncModality, { isLoading: isSyncing }] = useSyncModalityDicomMutation();

    const [editingMachine, setEditingMachine] = useState(null);
    const [form, setForm] = useState(DEFAULT_MACHINE);
    const [showModal, setShowModal] = useState(false);

    const openCreateModal = () => {
        setEditingMachine(null);
        setForm(DEFAULT_MACHINE);
        setShowModal(true);
    };

    const openEditModal = (machine) => {
        setEditingMachine(machine);
        setForm({
            aet_title: machine.aet_title || '',
            modality_type: machine.modality_type || 'CT',
            name: machine.name || '',
            ip_address: machine.ip_address || '',
            port: machine.port || 104,
            location: machine.location || '',
            manufacturer: machine.manufacturer || '',
            is_active: machine.is_active ?? true
        });
        setShowModal(true);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            if (editingMachine) {
                await updateMachine({ id: editingMachine.machine_id, ...form }).unwrap();
                toast.success(t('admin:pacsSettings.modalityUpdated', { defaultValue: 'Modality updated successfully' }));
            } else {
                await createMachine(form).unwrap();
                toast.success(t('admin:pacsSettings.modalityCreated', { defaultValue: 'Modality added successfully' }));
            }
            setShowModal(false);
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.modalitySaveError', { defaultValue: 'Failed to save modality' }));
        }
    };

    const handleDelete = async (id) => {
        if (!confirm(t('admin:pacsSettings.confirmDeleteModality', { defaultValue: 'Are you sure you want to remove this DICOM modality?' }))) return;
        try {
            await deleteMachine(id).unwrap();
            toast.success(t('admin:pacsSettings.modalityDeleted', { defaultValue: 'Modality removed' }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.modalityDeleteError', { defaultValue: 'Failed to remove modality' }));
        }
    };

    const handlePing = async (machine) => {
        try {
            const res = await pingModality(machine.machine_id).unwrap();
            if (res.status === 'ok') {
                toast.success(t('admin:pacsSettings.pingSuccess', { defaultValue: 'Echo successful ({{rtt}}ms)', rtt: res.rtt || 0 }));
            } else {
                toast.error(res.message || t('admin:pacsSettings.pingFailed', { defaultValue: 'DICOM C-ECHO failed' }));
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.pingFailed', { defaultValue: 'DICOM C-ECHO failed' }));
        }
    };

    const handleSync = async (machine) => {
        try {
            await syncModality(machine.machine_id).unwrap();
            toast.success(t('admin:pacsSettings.syncedWithOrthanc', { defaultValue: 'Synced modality with Orthanc' }));
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.syncError', { defaultValue: 'Failed to sync with Orthanc' }));
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3" {...reveal(200)}>
                <div>
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                        {t('admin:pacsSettings.modalitiesTitle', { defaultValue: 'DICOM Modalities & Machines' })}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t('admin:pacsSettings.modalitiesDesc', { defaultValue: 'Configure scanner AE titles and remote DICOM nodes for PACS routing.' })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                        {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                    </button>
                    <button type="button" onClick={openCreateModal} className={primaryButtonClass}>
                        <Plus size={14} />
                        {t('admin:pacsSettings.addModality', { defaultValue: 'Add modality' })}
                    </button>
                </div>
            </div>

            <section className={panelClass} {...reveal(260)}>
                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.loadingModalities', { defaultValue: 'Loading DICOM modalities...' })} />
                ) : machines.length === 0 ? (
                    <PageState icon={Network} title={t('admin:pacsSettings.noModalities', { defaultValue: 'No DICOM modalities registered yet' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.aet', { defaultValue: 'AET Title' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.name', { defaultValue: 'Name' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.modality', { defaultValue: 'Modality' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.endpoint', { defaultValue: 'Host:Port' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.status', { defaultValue: 'Status' })}</th>
                                    <th className="px-4 py-3 text-end font-black">{t('common:actions.actions', { defaultValue: 'Actions' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {machines.map((machine) => (
                                    <tr key={machine.machine_id} className="align-top text-slate-700 dark:text-slate-200">
                                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white">
                                            {machine.aet_title}
                                        </td>
                                        <td className="px-4 py-3 font-bold">{machine.name}</td>
                                        <td className="px-4 py-3">
                                            <StatusBadge tone="teal">{machine.modality_type}</StatusBadge>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {machine.ip_address}:{machine.port}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge tone={machine.is_active ? 'emerald' : 'slate'}>
                                                {machine.is_active
                                                    ? t('common:status.active', { defaultValue: 'Active' })
                                                    : t('common:status.inactive', { defaultValue: 'Inactive' })}
                                            </StatusBadge>
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button type="button" onClick={() => handlePing(machine)} disabled={isPinging} className={buttonClass} title="Ping DICOM C-ECHO">
                                                    <Activity size={13} />
                                                    <span className="sr-only sm:not-sr-only sm:ms-1">Echo</span>
                                                </button>
                                                <button type="button" onClick={() => handleSync(machine)} disabled={isSyncing} className={buttonClass} title="Sync with Orthanc">
                                                    <RefreshCw size={13} />
                                                    <span className="sr-only sm:not-sr-only sm:ms-1">Sync</span>
                                                </button>
                                                <button type="button" onClick={() => openEditModal(machine)} className={buttonClass} title="Edit modality">
                                                    <Edit3 size={13} />
                                                </button>
                                                <button type="button" onClick={() => handleDelete(machine.machine_id)} disabled={isDeleting} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-900 dark:hover:text-rose-400" title="Delete modality">
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-4 dark:border-slate-800/60">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                {editingMachine ? t('admin:pacsSettings.editModality', { defaultValue: 'Edit DICOM modality' }) : t('admin:pacsSettings.addModality', { defaultValue: 'Add DICOM modality' })}
                            </h3>
                            <button type="button" onClick={() => setShowModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                                <XCircle size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">AET Title</span>
                                    <input required maxLength={50} value={form.aet_title} onChange={(e) => setForm({ ...form, aet_title: e.target.value })} className={inputClass} placeholder="SCANNER_CT1" autoCapitalize="characters" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Display Name</span>
                                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="CT Room 1" />
                                </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Modality Type</span>
                                    <select value={form.modality_type} onChange={(e) => setForm({ ...form, modality_type: e.target.value })} className={inputClass}>
                                        {MODALITY_OPTIONS.map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Location</span>
                                    <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} placeholder="Building A, Room 102" />
                                </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">IP Address / Host</span>
                                    <input required value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} className={inputClass} placeholder="192.168.1.50" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">DICOM Port</span>
                                    <input required type="number" min={1} max={65535} value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} className={inputClass} placeholder="104" />
                                </label>
                            </div>

                            <label className="flex items-center gap-2 pt-2">
                                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active DICOM node</span>
                            </label>

                            <div className="flex items-center justify-end gap-2 border-t border-slate-200/60 pt-4 dark:border-slate-800/60">
                                <button type="button" onClick={() => setShowModal(false)} className={buttonClass}>
                                    {t('common:actions.cancel', { defaultValue: 'Cancel' })}
                                </button>
                                <button type="submit" disabled={isCreating || isUpdating} className={primaryButtonClass}>
                                    <Save size={14} />
                                    {t('common:actions.save', { defaultValue: 'Save' })}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const PacsOperationsPanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data: audit = [], isLoading: auditLoading, isFetching: auditFetching, refetch: refetchAudit } = useGetPacsAuditQuery({ limit: 80 });
    const { data: requests = [], isLoading: requestsLoading, isFetching: requestsFetching, refetch: refetchRequests } = useGetPacsRequestsQuery({ limit: 80 });
    const [expandedId, setExpandedId] = useState(null);

    const pendingRequests = requests.filter((item) => item.status === 'Pending').length;
    const failedEvents = audit.filter((item) => String(item.event_type || '').includes('FAILED') || String(item.event_type || '').includes('QUARANTINED')).length;
    const imageViews = audit.filter((item) => item.event_type === 'IMAGE_VIEW').length;
    const loading = auditLoading || requestsLoading;

    const refresh = () => {
        refetchAudit();
        refetchRequests();
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4" {...reveal(200)}>
                <SummaryMetric icon={ClipboardList} label={t('admin:pacsSettings.ops.events', { defaultValue: 'Audit events' })} value={audit.length} tone="teal" />
                <SummaryMetric icon={AlertTriangle} label={t('admin:pacsSettings.ops.attention', { defaultValue: 'Needs attention' })} value={failedEvents} tone={failedEvents ? 'amber' : 'emerald'} />
                <SummaryMetric icon={Eye} label={t('admin:pacsSettings.ops.views', { defaultValue: 'Image views' })} value={imageViews} />
                <SummaryMetric icon={Activity} label={t('admin:pacsSettings.ops.pendingRequests', { defaultValue: 'Pending requests' })} value={pendingRequests} tone={pendingRequests ? 'amber' : 'emerald'} />
            </div>

            <section className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.ops.requestStream', { defaultValue: 'PACS request stream' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.ops.requestHelp', { defaultValue: 'Recent machine receives, imports, quarantines, viewer access, and configuration checks.' })}
                        </p>
                    </div>
                    <button type="button" onClick={refresh} disabled={auditFetching || requestsFetching} className={buttonClass}>
                        <RefreshCw size={14} className={(auditFetching || requestsFetching) ? 'animate-spin' : ''} />
                        {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                    </button>
                </div>

                {loading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.ops.loading', { defaultValue: 'Loading PACS activity' })} />
                ) : requests.length === 0 ? (
                    <PageState icon={ClipboardList} title={t('admin:pacsSettings.ops.empty', { defaultValue: 'No PACS activity recorded yet' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.time', { defaultValue: 'Time' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.type', { defaultValue: 'Type' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.order', { defaultValue: 'Order' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.source', { defaultValue: 'Source' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.status', { defaultValue: 'Status' })}</th>
                                    <th className="px-4 py-3 text-end font-black">{t('audit.details', { defaultValue: 'Details' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {requests.map((item) => (
                                    <PacsRequestRow
                                        key={`${item.source}-${item.id}`}
                                        item={item}
                                        locale={i18n.language}
                                        expanded={expandedId === `${item.source}-${item.id}`}
                                        onToggle={() => setExpandedId((current) => current === `${item.source}-${item.id}` ? null : `${item.source}-${item.id}`)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

const AI_QUEUE_STATUSES = ['', 'Queued', 'Running', 'Completed', 'Failed', 'Canceled'];

const PacsAiQueuePanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const [statusFilter, setStatusFilter] = useState('');
    const { data, isLoading, isFetching, refetch } = useGetPacsAiAnalysisQueueQuery(
        { limit: 100, status: statusFilter },
        {
            pollingInterval: 5000,
            skipPollingIfUnfocused: true,
            refetchOnFocus: true,
            refetchOnReconnect: true
        }
    );
    const [processQueue, { isLoading: isProcessing }] = useProcessPacsAiAnalysisQueueMutation();
    const [retryAll, { isLoading: isRetryingAll }] = useRetryAllPacsAiJobsMutation();
    const [cancelAll, { isLoading: isCancelingAll }] = useCancelAllPacsAiJobsMutation();

    const jobs = data?.jobs || [];
    const totals = data?.totals || {};
    const processor = data?.processor || {};
    const queued = Number(totals.Queued || 0);
    const running = Number(totals.Running || 0);
    const failed = Number(totals.Failed || 0);
    const completed = Number(totals.Completed || 0);

    const handleRetryAll = async () => {
        try {
            if (confirm(t('admin:pacsSettings.aiQueue.retryAllConfirm', { defaultValue: 'Are you sure you want to re-queue all failed and canceled jobs?' }))) {
                const res = await retryAll().unwrap();
                toast.success(t('admin:pacsSettings.aiQueue.retryAllSuccess', { defaultValue: 'Successfully re-queued {{count}} jobs', count: res.count || 0 }));
                refetch();
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.retryAllError', { defaultValue: 'Failed to re-queue jobs' }));
        }
    };

    const handleCancelAll = async () => {
        try {
            if (confirm(t('admin:pacsSettings.aiQueue.cancelAllConfirm', { defaultValue: 'Are you sure you want to stop/cancel all queued and running jobs?' }))) {
                const res = await cancelAll().unwrap();
                toast.success(t('admin:pacsSettings.aiQueue.cancelAllSuccess', { defaultValue: 'Stopped {{count}} active jobs', count: res.count || 0 }));
                refetch();
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.cancelAllError', { defaultValue: 'Failed to stop jobs' }));
        }
    };

    const runQueue = async () => {
        try {
            const result = await processQueue(3).unwrap();
            if (result.skipped && result.reason === 'missing_worker_url') {
                toast(t('admin:pacsSettings.aiQueue.missingWorker', {
                    defaultValue: 'PACS AI is queue-only. Add a worker URL in AI settings before processing jobs.'
                }), { icon: '!' });
            } else if (result.skipped && result.reason === 'disabled') {
                toast(t('admin:pacsSettings.aiQueue.disabled', {
                    defaultValue: 'PACS image AI is disabled. Enable it in AI settings first.'
                }), { icon: '!' });
            } else {
                toast.success(t('admin:pacsSettings.aiQueue.processed', {
                    defaultValue: 'Processed {{processed}} job(s): {{completed}} completed, {{failed}} failed',
                    processed: result.processed || 0,
                    completed: result.completed || 0,
                    failed: result.failed || 0
                }));
            }
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.processError', { defaultValue: 'Failed to process PACS AI queue' }));
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4" {...reveal(200)}>
                <SummaryMetric icon={BrainCircuit} label={t('admin:pacsSettings.aiQueue.queued', { defaultValue: 'Queued' })} value={queued} tone={queued ? 'amber' : 'emerald'} />
                <SummaryMetric icon={Activity} label={t('admin:pacsSettings.aiQueue.running', { defaultValue: 'Running' })} value={running} tone={running ? 'teal' : 'slate'} />
                <SummaryMetric icon={AlertTriangle} label={t('admin:pacsSettings.aiQueue.failed', { defaultValue: 'Failed' })} value={failed} tone={failed ? 'rose' : 'emerald'} />
                <SummaryMetric icon={CheckCircle2} label={t('admin:pacsSettings.aiQueue.completed', { defaultValue: 'Completed' })} value={completed} tone="emerald" />
            </div>

            <section className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.aiQueue.title', { defaultValue: 'PACS AI analysis queue' })}
                        </h2>
                        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.aiQueue.help', { defaultValue: 'Monitor image-analysis jobs created from reports, dispatch queued work to the configured worker, and review failures before radiologist use.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${inputClass} w-auto min-w-36`}>
                            {AI_QUEUE_STATUSES.map((status) => (
                                <option key={status || 'all'} value={status}>
                                    {status || t('admin:pacsSettings.aiQueue.allStatuses', { defaultValue: 'All statuses' })}
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                        {(failed > 0 || totals.Canceled > 0) && (
                            <button type="button" onClick={handleRetryAll} disabled={isRetryingAll} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-emerald-950/20">
                                <RotateCcw size={13} className={isRetryingAll ? 'animate-spin' : ''} />
                                <span>Retry failed ({failed + (totals.Canceled || 0)})</span>
                            </button>
                        )}
                        {(queued > 0 || running > 0) && (
                            <button type="button" onClick={handleCancelAll} disabled={isCancelingAll} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/20">
                                <XCircle size={13} className={isCancelingAll ? 'animate-spin' : ''} />
                                <span>Stop queue ({queued + running})</span>
                            </button>
                        )}
                        <button type="button" onClick={runQueue} disabled={isProcessing || (!queued && !running)} className={primaryButtonClass}>
                            <PlayCircle size={14} className={isProcessing ? 'animate-pulse' : ''} />
                            {t('admin:pacsSettings.aiQueue.processNow', { defaultValue: 'Process now' })}
                        </button>
                    </div>
                </div>

                {!isLoading && (
                    <div className={`border-b border-slate-200/60 px-4 py-3 text-xs font-semibold leading-5 dark:border-slate-800/60 ${
                        processor.status === 'ready'
                            ? 'bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200'
                            : processor.status === 'missing_worker_url'
                                ? 'bg-amber-50/80 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200'
                                : 'bg-rose-50/70 text-rose-800 dark:bg-rose-950/20 dark:text-rose-200'
                    }`}>
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-2">
                                {processor.status === 'ready' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                                <span>
                                    {processor.message || 'PACS AI processor state is unknown.'}
                                    {processor.status !== 'ready' && (
                                        <Link to="/settings?tab=ai" className="ms-2 font-black underline underline-offset-2">
                                            Configure AI
                                        </Link>
                                    )}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                                <span>{processor.provider || 'provider:none'}</span>
                                <span>{processor.model || 'model:none'}</span>
                                <span>{processor.workerConfigured ? `worker:${processor.workerUrl}` : 'worker:none'}</span>
                            </div>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.aiQueue.loading', { defaultValue: 'Loading PACS AI queue' })} />
                ) : jobs.length === 0 ? (
                    <PageState icon={BrainCircuit} title={t('admin:pacsSettings.aiQueue.empty', { defaultValue: 'No PACS AI jobs match this filter' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.order', { defaultValue: 'Order' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.aiQueue.analysis', { defaultValue: 'Analysis' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.modality', { defaultValue: 'Modality' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.status', { defaultValue: 'Status' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.aiQueue.result', { defaultValue: 'Result' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.time', { defaultValue: 'Time' })}</th>
                                    <th className="px-4 py-3 text-end font-black">{t('common:actions.open', { defaultValue: 'Open' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {jobs.map((job) => (
                                    <PacsAiQueueRow key={job.job_id} job={job} locale={i18n.language} processor={processor} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

const PacsAiQueueRow = ({ job, locale, processor }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [retryJob, { isLoading: isRetrying }] = useRetryPacsAiJobMutation();
    const [cancelJob, { isLoading: isCanceling }] = useCancelPacsAiJobMutation();
    const [deleteJob, { isLoading: isDeleting }] = useDeletePacsAiJobMutation();

    const handleRetry = async () => {
        try {
            await retryJob(job.job_id).unwrap();
            toast.success(t('admin:pacsSettings.aiQueue.jobRetried', { defaultValue: 'Job re-queued successfully' }));
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.retryError', { defaultValue: 'Failed to retry job' }));
        }
    };

    const handleCancel = async () => {
        try {
            if (confirm(t('admin:pacsSettings.aiQueue.cancelConfirm', { defaultValue: 'Are you sure you want to cancel this analysis job?' }))) {
                await cancelJob(job.job_id).unwrap();
                toast.success(t('admin:pacsSettings.aiQueue.jobCanceled', { defaultValue: 'Job canceled' }));
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.cancelError', { defaultValue: 'Failed to cancel job' }));
        }
    };

    const handleDelete = async () => {
        try {
            if (confirm(t('admin:pacsSettings.aiQueue.deleteConfirm', { defaultValue: 'Are you sure you want to delete this job row?' }))) {
                await deleteJob(job.job_id).unwrap();
                toast.success(t('admin:pacsSettings.aiQueue.jobDeleted', { defaultValue: 'Job deleted' }));
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.deleteError', { defaultValue: 'Failed to delete job' }));
        }
    };

    const statusTone = job.status === 'Completed'
        ? 'emerald'
        : job.status === 'Running'
            ? 'teal'
            : job.status === 'Failed'
                ? 'rose'
                : job.status === 'Queued'
                    ? 'amber'
                    : 'slate';
    const priorityTone = job.priority === 'Emergency' ? 'rose' : job.priority === 'Urgent' ? 'amber' : 'slate';
    const createdAt = job.created_at
        ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(job.created_at))
        : '-';
    const queuedReason = job.status === 'Queued'
        ? processor?.status === 'disabled'
            ? t('admin:pacsSettings.aiQueue.waitingDisabled', { defaultValue: 'Waiting: PACS AI is disabled' })
            : processor?.status === 'missing_worker_url'
                ? t('admin:pacsSettings.aiQueue.waitingWorkerUrl', { defaultValue: 'Waiting: add PACS AI worker URL' })
                : processor?.status === 'ready'
                    ? t('admin:pacsSettings.aiQueue.waitingProcessor', { defaultValue: 'Waiting for background processor' })
                    : t('admin:pacsSettings.aiQueue.waitingStatus', { defaultValue: 'Waiting for processor status' })
        : null;
    const effectiveProvider = job.provider || processor?.provider || 'local-worker';
    const effectiveModel = job.model || processor?.model || 'worker-default';
    const effectiveModelVersion = job.model_version || processor?.modelVersion || '';

    return (
        <tr className="align-top text-slate-700 dark:text-slate-200">
            <td className="px-4 py-3">
                <p className="font-mono text-xs font-bold">{job.order_number || '-'}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">{job.mrn || '-'}</p>
            </td>
            <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={priorityTone}>
                        {t(`admin:pacsSettings.aiQueue.priority.${String(job.priority || 'Routine').toLowerCase()}`, { defaultValue: job.priority || 'Routine' })}
                    </StatusBadge>
                    <span className="font-mono text-xs font-bold">{job.analysis_type || '-'}</span>
                </div>
                <p className="mt-1 max-w-64 truncate text-xs text-slate-500 dark:text-slate-400">
                    {[effectiveProvider, effectiveModel, effectiveModelVersion].filter(Boolean).join(' / ')}
                </p>
            </td>
            <td className="px-4 py-3">
                <p className="text-xs font-bold">{job.exam_type_name || '-'}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {job.modality_type || job.modality_name || '-'} / {t('admin:pacsSettings.aiQueue.imageCount', { defaultValue: '{{count}} image(s)', count: job.image_count || 0 })}
                </p>
            </td>
            <td className="px-4 py-3">
                <StatusBadge tone={statusTone}>
                    {t(`admin:pacsSettings.aiQueue.status.${String(job.status || '').toLowerCase()}`, { defaultValue: job.status })}
                </StatusBadge>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {job.radiologist_status || t('admin:pacsSettings.aiQueue.pendingReview', { defaultValue: 'Pending review' })}
                </p>
            </td>
            <td className="px-4 py-3">
                <p className={`max-w-md text-xs leading-5 ${job.error_message ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'}`}>
                    {job.error_message || job.result_summary || queuedReason || t('admin:pacsSettings.aiQueue.waitingResult', { defaultValue: 'Waiting for worker result' })}
                </p>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <p>{createdAt}</p>
                {job.completed_at && <p className="mt-1">{t('admin:pacsSettings.aiQueue.done', { defaultValue: 'Done' })}: {formatStorageDate(job.completed_at, locale, true)}</p>}
            </td>
            <td className="px-4 py-3 text-end">
                <div className="flex items-center justify-end gap-1.5">
                    <Link to={`/reports/editor/${job.exam_id}`} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" title={t('admin:pacsSettings.aiQueue.openEditor', { defaultValue: 'Open in editor' })}>
                        <Eye size={13} />
                        <span className="sr-only sm:not-sr-only sm:ms-1">{t('common:actions.open', { defaultValue: 'Open' })}</span>
                    </Link>
                    {(job.status === 'Queued' || job.status === 'Running') && (
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isCanceling}
                            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/20"
                            title={t('admin:pacsSettings.aiQueue.cancelJob', { defaultValue: 'Cancel job' })}
                        >
                            <XCircle size={13} className={isCanceling ? 'animate-spin' : ''} />
                            <span className="sr-only sm:not-sr-only sm:ms-1">{t('common:actions.cancel', { defaultValue: 'Cancel' })}</span>
                        </button>
                    )}
                    {(job.status === 'Failed' || job.status === 'Canceled') && (
                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={isRetrying}
                            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-white px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                            title={t('admin:pacsSettings.aiQueue.retryJob', { defaultValue: 'Re-queue job' })}
                        >
                            <RotateCcw size={13} className={isRetrying ? 'animate-spin' : ''} />
                            <span className="sr-only sm:not-sr-only sm:ms-1">{t('admin:pacsSettings.aiQueue.retry', { defaultValue: 'Retry' })}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-900 dark:hover:text-rose-400"
                        title={t('admin:pacsSettings.aiQueue.deleteJob', { defaultValue: 'Delete job entry' })}
                    >
                        <Trash2 size={13} className={isDeleting ? 'animate-spin' : ''} />
                    </button>
                </div>
            </td>
        </tr>
    );
};

const PacsWorklistPanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const today = new Date().toISOString().slice(0, 10);
    const [date, setDate] = useState(today);
    const { data, isLoading, isFetching, refetch } = useGetPacsWorklistPreviewQuery({ date, includeInvalid: true });
    const [refreshWorklist, { isLoading: isRefreshing }] = useRefreshPacsWorklistMutation();
    const items = data?.items || [];

    const regenerate = async () => {
        try {
            const result = await refreshWorklist().unwrap();
            toast.success(t('admin:pacsSettings.worklist.regenerated', {
                defaultValue: `Worklist regenerated: ${result.written || 0} written, ${result.pruned || 0} pruned`,
                written: result.written || 0,
                pruned: result.pruned || 0
            }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.worklist.regenerateError', { defaultValue: 'Failed to regenerate modality worklist' }));
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3" {...reveal(200)}>
                <SummaryMetric icon={ClipboardList} label={t('admin:pacsSettings.worklist.total', { defaultValue: 'Scheduled items' })} value={data?.total ?? 0} tone="teal" />
                <SummaryMetric icon={CheckCircle2} label={t('admin:pacsSettings.worklist.valid', { defaultValue: 'Valid for MWL' })} value={data?.valid ?? 0} tone="emerald" />
                <SummaryMetric icon={AlertTriangle} label={t('admin:pacsSettings.worklist.warnings', { defaultValue: 'Warnings' })} value={data?.warnings ?? 0} tone={data?.warnings ? 'amber' : 'emerald'} />
            </div>

            <section className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.worklist.title', { defaultValue: 'Modality Worklist preview' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.worklist.help', { defaultValue: 'Preview scheduled orders that Orthanc writes as MWL files for scanners. Accession/order number is required for reliable image matching.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                        <button type="button" onClick={regenerate} disabled={isRefreshing} className={primaryButtonClass}>
                            <Database size={14} className={isRefreshing ? 'animate-pulse' : ''} />
                            {t('admin:pacsSettings.worklist.regenerate', { defaultValue: 'Regenerate MWL' })}
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.worklist.loading', { defaultValue: 'Loading worklist preview' })} />
                ) : items.length === 0 ? (
                    <PageState icon={ClipboardList} title={t('admin:pacsSettings.worklist.empty', { defaultValue: 'No scheduled worklist items for this date' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.order', { defaultValue: 'Order' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.mrn', { defaultValue: 'MRN' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.worklist.procedure', { defaultValue: 'Procedure' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.modality', { defaultValue: 'Modality' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.time', { defaultValue: 'Time' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.status', { defaultValue: 'Status' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {items.map((item) => (
                                    <tr key={item.exam_id} className="align-top text-slate-700 dark:text-slate-200">
                                        <td className="px-4 py-3 font-mono text-xs">{item.order_number || '-'}</td>
                                        <td className="px-4 py-3 font-mono text-xs">{item.mrn || '-'}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-bold">{item.procedure_name || '-'}</p>
                                            <p className="mt-0.5 text-xs text-slate-500">{item.procedure_code || item.body_part || '-'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-xs font-bold">{item.dicom_modality}</span>
                                            <p className="mt-0.5 text-xs text-slate-500">{item.modality_type || '-'}</p>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                                            {item.scheduled_datetime ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.scheduled_datetime)) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge tone={item.valid ? 'emerald' : 'amber'}>
                                                {item.valid
                                                    ? t('admin:pacsSettings.worklist.validLabel', { defaultValue: 'Valid' })
                                                    : t('admin:pacsSettings.worklist.warningLabel', { defaultValue: 'Warning' })}
                                            </StatusBadge>
                                            {!item.valid && <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">{item.warnings.join(', ')}</p>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {data?.worklist_dir && (
                    <div className="border-t border-slate-200/60 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-400">
                        {t('admin:pacsSettings.worklist.directory', { defaultValue: 'Worklist directory' })}: <span className="font-mono">{data.worklist_dir}</span>
                    </div>
                )}
            </section>
        </div>
    );
};

const formatBytes = (bytes = 0) => {
    const value = Number(bytes || 0);
    if (!value) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatStorageDate = (value, locale, withTime = false) => (
    value
        ? new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value))
        : '-'
);

const PacsStoragePanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data, isLoading, isFetching, refetch } = useGetPacsStorageSummaryQuery();
    const [runTiering, { isLoading: isTiering }] = useRunPacsTieringMutation();
    const tiers = data?.tiers || {};
    const index = data?.index || {};
    const orthanc = data?.orthanc || {};
    const tiering = data?.tiering || {};
    const totals = data?.totals || {};
    const totalIndexedBytes = Number(totals.indexed_bytes || 0);
    const indexedInstances = Number(totals.indexed_instances || index.instance_count || 0);
    const eligibleInstances = Number(tiering.eligible_instances || 0);
    const instanceGap = Number(totals.instance_gap || 0);
    const storageTone = data?.status === 'ok' ? 'emerald' : data?.status === 'attention' ? 'amber' : data?.status ? 'rose' : 'slate';
    const canRunTiering = Boolean(tiering.enabled) && eligibleInstances > 0 && !isTiering;

    const tierSweep = async () => {
        const confirmed = window.confirm(t('admin:pacsSettings.storage.confirmTiering', {
            defaultValue: 'Run a tiering sweep for eligible hot instances? This updates VIARA storage bookkeeping; it does not delete Orthanc files unless a deployment archiver is configured.'
        }));
        if (!confirmed) return;

        try {
            const result = await runTiering().unwrap();
            toast.success(t('admin:pacsSettings.storage.tiered', {
                defaultValue: `Tiering complete: ${result.migrated || 0} instance(s) migrated`,
                count: result.migrated || 0
            }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.storage.tierError', { defaultValue: 'Failed to run tiering sweep' }));
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" {...reveal(200)}>
                <SummaryMetric icon={ShieldCheck} label={t('admin:pacsSettings.storage.status', { defaultValue: 'Storage status' })} value={(data?.status || 'Loading').toUpperCase()} tone={storageTone} />
                <SummaryMetric icon={Database} label={t('admin:pacsSettings.storage.orthancDisk', { defaultValue: 'Orthanc disk' })} value={orthanc.totalDiskSizeMB != null ? `${orthanc.totalDiskSizeMB} MB` : '-'} tone={data?.orthanc_error ? 'amber' : 'teal'} />
                <SummaryMetric icon={Monitor} label={t('admin:pacsSettings.storage.indexedData', { defaultValue: 'Indexed data' })} value={formatBytes(totalIndexedBytes)} />
                <SummaryMetric icon={AlertTriangle} label={t('admin:pacsSettings.storage.eligibleCold', { defaultValue: 'Eligible for cold' })} value={eligibleInstances} tone={eligibleInstances ? 'amber' : 'emerald'} />
            </div>

            <section className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.storage.title', { defaultValue: 'Archive storage' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.storage.help', { defaultValue: 'Manage Orthanc hot storage visibility, VIARA archive index health, and tiering bookkeeping for long-term retention.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                        <button type="button" onClick={tierSweep} disabled={!canRunTiering} className={primaryButtonClass}>
                            <Database size={14} className={isTiering ? 'animate-pulse' : ''} />
                            {t('admin:pacsSettings.storage.runTiering', { defaultValue: 'Run tiering sweep' })}
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.storage.loading', { defaultValue: 'Loading PACS storage state' })} />
                ) : (
                    <div className="space-y-6 p-4">
                        {instanceGap > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                <div className="flex items-center gap-2 font-bold">
                                    <AlertTriangle size={15} className="shrink-0" />
                                    <span>{t('admin:pacsSettings.storage.gapTitle', { defaultValue: 'Storage indexing gap detected' })}</span>
                                </div>
                                <p className="mt-1 leading-5">
                                    {t('admin:pacsSettings.storage.gapHelp', {
                                        defaultValue: 'Orthanc reports {{orthanc}} DICOM instances, but VIARA archive index tracks {{indexed}}. New arrivals might still be indexing.',
                                        orthanc: orthanc.countInstances || 0,
                                        indexed: indexedInstances
                                    })}
                                </p>
                            </div>
                        )}

                        <div>
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('admin:pacsSettings.storage.retentionTiers', { defaultValue: 'Retention tiers' })}
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2">
                                <StorageTierCard tier="hot" data={tiers.hot || {}} locale={i18n.language} totalBytes={totalIndexedBytes} totalInstances={indexedInstances} />
                                <StorageTierCard tier="cold" data={tiers.cold || {}} locale={i18n.language} totalBytes={totalIndexedBytes} totalInstances={indexedInstances} />
                            </div>
                        </div>

                        <div>
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('admin:pacsSettings.storage.healthMetrics', { defaultValue: 'Health & subsystem details' })}
                            </h3>
                            <div className="grid gap-4 md:grid-cols-3">
                                <StorageInfoCard
                                    icon={Server}
                                    title={t('admin:pacsSettings.storage.orthancServer', { defaultValue: 'Orthanc server' })}
                                    tone={data?.orthanc_error ? 'rose' : 'teal'}
                                    rows={[
                                        [t('admin:pacsSettings.storage.diskMb', { defaultValue: 'Total disk MB' }), formatNumber(orthanc.totalDiskSizeMB)],
                                        [t('admin:pacsSettings.storage.studiesCount', { defaultValue: 'Studies' }), formatNumber(orthanc.countStudies)],
                                        [t('admin:pacsSettings.storage.seriesCount', { defaultValue: 'Series' }), formatNumber(orthanc.countSeries)],
                                        [t('admin:pacsSettings.storage.instancesCount', { defaultValue: 'Instances' }), formatNumber(orthanc.countInstances)]
                                    ]}
                                />
                                <StorageInfoCard
                                    icon={Monitor}
                                    title={t('admin:pacsSettings.storage.viaraIndex', { defaultValue: 'VIARA archive index' })}
                                    tone="emerald"
                                    rows={[
                                        [t('admin:pacsSettings.storage.indexedStudies', { defaultValue: 'Indexed studies' }), formatNumber(index.study_count)],
                                        [t('admin:pacsSettings.storage.indexedSeries', { defaultValue: 'Indexed series' }), formatNumber(index.series_count)],
                                        [t('admin:pacsSettings.storage.indexedInstances', { defaultValue: 'Indexed instances' }), formatNumber(indexedInstances)],
                                        [t('admin:pacsSettings.storage.indexedVolume', { defaultValue: 'Indexed volume' }), formatBytes(totalIndexedBytes)]
                                    ]}
                                />
                                <StorageInfoCard
                                    icon={ShieldCheck}
                                    title={t('admin:pacsSettings.storage.tieringConfig', { defaultValue: 'Tiering policy' })}
                                    tone={tiering.enabled ? 'amber' : 'slate'}
                                    rows={[
                                        [t('admin:pacsSettings.storage.policyState', { defaultValue: 'Policy state' }), tiering.enabled ? t('common:status.enabled', { defaultValue: 'Enabled' }) : t('common:status.disabled', { defaultValue: 'Disabled' })],
                                        [t('admin:pacsSettings.storage.thresholdDays', { defaultValue: 'Cold threshold' }), `${tiering.hot_threshold_days || 90} days`],
                                        [t('admin:pacsSettings.storage.eligibleInstances', { defaultValue: 'Eligible instances' }), formatNumber(eligibleInstances)],
                                        [t('admin:pacsSettings.storage.eligibleVolume', { defaultValue: 'Eligible volume' }), formatBytes(tiering.eligible_bytes)]
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

const StorageInfoCard = ({ icon: Icon, title, tone = 'slate', rows = [] }) => (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-800/60 dark:bg-slate-950/25">
        <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-950 dark:text-white">{title}</p>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneIconClass(tone)}`}>
                <Icon size={16} />
            </span>
        </div>
        <div className="mt-4 space-y-2">
            {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 text-xs">
                    <span className="break-words text-slate-500 dark:text-slate-400">{label}</span>
                    <span className="break-all text-end font-mono font-bold text-slate-900 dark:text-slate-100">{value}</span>
                </div>
            ))}
        </div>
    </div>
);

const StorageTierCard = ({ tier, data, locale, totalBytes = 0, totalInstances = 0 }) => {
    const { t } = useTranslation(['admin', 'common']);
    const bytes = Number(data.bytes || 0);
    const instances = Number(data.instances || 0);
    const bytePercent = totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0;
    const instancePercent = totalInstances > 0 ? Math.round((instances / totalInstances) * 100) : 0;
    const tone = tier === 'hot' ? 'teal' : tier === 'cold' ? 'cyan' : 'slate';
    const tierLabel = t(`admin:pacsSettings.storage.tiers.${tier}`, { defaultValue: tier });

    return (
        <div className="rounded-xl border border-slate-200/60 bg-white/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/40">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black capitalize text-slate-950 dark:text-white">{tierLabel}</p>
                <StatusBadge tone={tone}>{instances} / {instancePercent}%</StatusBadge>
            </div>
            <p className="mt-3 font-mono text-xl font-black text-slate-900 dark:text-slate-100">{formatBytes(bytes)}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                    className={`h-full rounded-full ${tier === 'hot' ? 'bg-teal-500' : tier === 'cold' ? 'bg-cyan-500' : 'bg-slate-400'}`}
                    style={{ width: `${Math.max(bytePercent, bytes > 0 ? 3 : 0)}%` }}
                />
            </div>
            <div className="mt-3 grid gap-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <p>{bytePercent}% {tier === 'cold'
                    ? t('admin:pacsSettings.storage.coldArchiveReference', { defaultValue: 'cold archive reference' })
                    : t('admin:pacsSettings.storage.indexedStorageBytes', { defaultValue: 'indexed storage bytes' })}</p>
                <p>{t('admin:pacsSettings.storage.oldest', { defaultValue: 'Oldest' })}: {formatStorageDate(data.oldest_instance_at, locale)}</p>
                <p>{t('admin:pacsSettings.storage.newest', { defaultValue: 'Newest' })}: {formatStorageDate(data.newest_instance_at, locale)}</p>
            </div>
        </div>
    );
};

const PacsRequestRow = ({ item, locale, expanded, onToggle }) => {
    const { t } = useTranslation(['admin', 'common']);
    const type = item.type || item.event_type || '-';
    const tone =
        item.status === 'Pending' || String(type).includes('FAILED') || String(type).includes('MISMATCH') || String(type).includes('QUARANTINED')
            ? 'amber'
            : String(type).includes('OK') || String(type).includes('RECONCILE') || String(type).includes('IMPORTED')
                ? 'emerald'
                : 'slate';
    const fallbackStatus = item.status || (String(type).includes('FAILED') ? 'Failed' : 'Recorded');
    const statusKey = String(fallbackStatus).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const status = t(`admin:pacsSettings.requests.status.${statusKey}`, { defaultValue: fallbackStatus });

    return (
        <>
            <tr className="align-top text-slate-700 dark:text-slate-200">
                <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {item.created_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created_at)) : '-'}
                </td>
                <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold">{type}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{item.accession_number || '-'}</td>
                <td className="px-4 py-3 text-xs">{item.remote_ip || item.source || '-'}</td>
                <td className="px-4 py-3"><StatusBadge tone={tone}>{status}</StatusBadge></td>
                <td className="px-4 py-3 text-end">
                    <button type="button" onClick={onToggle} className={buttonClass}>
                        {expanded
                            ? t('admin:pacsSettings.requests.hide', { defaultValue: 'Hide' })
                            : t('admin:pacsSettings.requests.view', { defaultValue: 'View' })}
                    </button>
                </td>
            </tr>
            {expanded && (
                <tr>
                    <td colSpan={6} className="bg-slate-50/70 px-4 py-3 dark:bg-slate-950/40">
                        <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                            {JSON.stringify(item.detail || {}, null, 2)}
                        </pre>
                    </td>
                </tr>
            )}
        </>
    );
};

const PageState = ({ icon: Icon, title, spin = false }) => (
    <div className="flex min-h-40 flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-slate-400">
        <Icon size={24} className={spin ? 'animate-spin' : ''} />
        <p className="mt-3 text-sm font-bold">{title}</p>
    </div>
);

const PacsSettings = () => {
    const { t } = useTranslation(['admin', 'common']);
    const [activeTab, setActiveTab] = useState('overview');

    const tabs = [
        { id: 'overview', label: t('admin:pacsSettings.tabs.overview', { defaultValue: 'Overview & Config' }), icon: Server },
        { id: 'modalities', label: t('admin:pacsSettings.tabs.modalities', { defaultValue: 'DICOM Modalities' }), icon: Network },
        { id: 'aiQueue', label: t('admin:pacsSettings.tabs.aiQueue', { defaultValue: 'PACS AI Queue' }), icon: BrainCircuit },
        { id: 'worklist', label: t('admin:pacsSettings.tabs.worklist', { defaultValue: 'Modality Worklist' }), icon: ClipboardList },
        { id: 'storage', label: t('admin:pacsSettings.tabs.storage', { defaultValue: 'Archive Storage' }), icon: Database },
        { id: 'operations', label: t('admin:pacsSettings.tabs.operations', { defaultValue: 'Activity & Audit' }), icon: Activity }
    ];

    const reveal = (delay = 0) => ({
        style: {
            animation: `fadeIn 0.3s ease-out ${delay}ms both`
        }
    });

    return (
        <div className="space-y-6">
            {/* VIARA Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Server size={26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                <Network size={11} />
                                <span>DICOM Engine & Imaging Archive</span>
                            </span>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('admin:pacsSettings.title', { defaultValue: 'PACS & DICOM Server Network' })}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('admin:pacsSettings.subtitle', { defaultValue: 'Orthanc server endpoints, scanner AET nodes, AI analysis queue, Modality Worklist, storage tiering, and DICOM audit logs.' })}
                            </p>
                        </div>
                    </div>
                </div>

                <nav className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/40 w-fit">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-bold transition-all ${
                                    isActive
                                        ? 'bg-teal-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                <Icon size={14} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            <main className="mt-6">
                {activeTab === 'overview' && <PacsConfigPanel reveal={reveal} />}
                {activeTab === 'modalities' && <PacsModalitiesPanel reveal={reveal} />}
                {activeTab === 'aiQueue' && <PacsAiQueuePanel reveal={reveal} />}
                {activeTab === 'worklist' && <PacsWorklistPanel reveal={reveal} />}
                {activeTab === 'storage' && <PacsStoragePanel reveal={reveal} />}
                {activeTab === 'operations' && <PacsOperationsPanel reveal={reveal} />}
            </main>
        </div>
    );
};

export default PacsSettings;
