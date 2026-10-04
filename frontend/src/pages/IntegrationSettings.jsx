import React, { useState } from 'react';
import {
    useGetIntegrationsQuery,
    useUpdateIntegrationMutation,
    useTestIntegrationMutation,
    useGetIntegrationLogsQuery,
    useRetryIntegrationEventMutation,
    useGetDeadLetterEventsQuery,
    useRetryDeadLetterEventMutation,
    useSeedIntegrationsMutation
} from '../store/api';
import {
    Network, Settings, Activity, RefreshCw, Key, Link as LinkIcon, Save,
    CheckCircle, XCircle, AlertCircle, Download, RotateCcw, Send, BookOpen,
    ExternalLink, Search, Inbox, Eye, EyeOff, Clock3, ShieldCheck,
    Copy, Check, FileText, Calendar, X, Filter, ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import { formatRelativeTime } from '../utils/dateFormat';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const IntegrationSettings = ({ embedded = false }) => {
    const { t, i18n } = useTranslation('integrations');
    const [activeTab, setActiveTab] = useState('config');
    const {
        data: integrations = [],
        isLoading: isIntegrationsLoading,
        isError: integrationsFailed,
        refetch: refetchIntegrations
    } = useGetIntegrationsQuery();

    const [logStatusFilter, setLogStatusFilter] = useState('all');
    const [logProviderFilter, setLogProviderFilter] = useState('all');
    const [logSearch, setLogSearch] = useState('');
    const [logPage, setLogPage] = useState(1);
    const logsPerPage = 15;

    const {
        data: logs = [],
        isLoading: isLogsLoading,
        isError: logsFailed,
        refetch: refetchLogs
    } = useGetIntegrationLogsQuery(
        {
            status: logStatusFilter !== 'all' ? logStatusFilter : undefined,
            provider: logProviderFilter !== 'all' ? logProviderFilter : undefined,
            event_type: logSearch.trim() || undefined,
            limit: 500
        },
        { skip: activeTab !== 'logs' }
    );
    const {
        data: deadLetters = [],
        isLoading: isDeadLettersLoading,
        isError: deadLettersFailed,
        refetch: refetchDeadLetters
    } = useGetDeadLetterEventsQuery(undefined, { skip: activeTab !== 'dead-letter' });

    const [updateIntegration, { isLoading: isSaving }] = useUpdateIntegrationMutation();
    const [testIntegration, { isLoading: isTesting }] = useTestIntegrationMutation();
    const [retryEvent, { isLoading: isRetrying }] = useRetryIntegrationEventMutation();
    const [retryDeadLetter, { isLoading: isRequeuing }] = useRetryDeadLetterEventMutation();
    const [seedIntegrations, { isLoading: isSeeding }] = useSeedIntegrationsMutation();

    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [showSecrets, setShowSecrets] = useState({});
    const [testingId, setTestingId] = useState(null);
    const [retryingId, setRetryingId] = useState(null);
    const [pendingRequeue, setPendingRequeue] = useState(null);
    const [selectedLogDetails, setSelectedLogDetails] = useState(null);
    const [copiedKey, setCopiedKey] = useState(null);

    const [showExportModal, setShowExportModal] = useState(false);
    const [exportStartDate, setExportStartDate] = useState('');
    const [exportEndDate, setExportEndDate] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    const [showGuide, setShowGuide] = useState(false);
    const [deadLetterSearch, setDeadLetterSearch] = useState('');
    const [deadLetterFilter, setDeadLetterFilter] = useState('all');

    const handleEdit = (integration) => {
        setEditingId(integration.integration_id);
        setEditForm({
            api_key: '',
            api_secret: '',
            webhook_url: integration.webhook_url || '',
            webhook_secret: '',
            sender_identity: integration.sender_identity || '',
            is_active: integration.is_active,
            config_version: integration.config_version,
            realm_id: integration.extra_config?.realm_id || '',
            environment: integration.extra_config?.environment || 'sandbox',
            clear_fields: []
        });
    };

    const toggleClearField = (field) => {
        setEditForm((current) => ({
            ...current,
            clear_fields: current.clear_fields.includes(field)
                ? current.clear_fields.filter((item) => item !== field)
                : [...current.clear_fields, field]
        }));
    };

    const handleSave = async (id) => {
        try {
            const integration = integrations.find((item) => item.integration_id === id);
            const payload = {
                id,
                webhook_url: editForm.webhook_url,
                is_active: editForm.is_active,
                config_version: editForm.config_version,
                clear_fields: editForm.clear_fields
            };
            if (editForm.api_key?.trim()) payload.api_key = editForm.api_key.trim();
            if (editForm.api_secret?.trim()) payload.api_secret = editForm.api_secret.trim();
            if (editForm.webhook_secret?.trim()) payload.webhook_secret = editForm.webhook_secret.trim();
            if (['Twilio', 'WhatsApp'].includes(integration?.provider_name)) {
                payload.sender_identity = editForm.sender_identity?.trim() || '';
            }
            if (integration?.provider_name === 'QuickBooks') {
                payload.extra_config = {
                    realm_id: editForm.realm_id?.trim() || '',
                    environment: editForm.environment || 'sandbox'
                };
            }
            await updateIntegration(payload).unwrap();
            toast.success(t('updated'));
            setEditingId(null);
        } catch (error) {
            toast.error(error?.data?.error || t('updateError'));
        }
    };

    const handleRetry = async (logId) => {
        setRetryingId(logId);
        try {
            await retryEvent(logId).unwrap();
            toast.success(t('retried'));
            refetchLogs();
        } catch (error) {
            toast.error(error?.data?.error || t('retryError'));
        } finally {
            setRetryingId(null);
        }
    };

    const handleTest = async (integrationId, providerName) => {
        setTestingId(integrationId);
        try {
            const result = await testIntegration(integrationId).unwrap();
            if (String(result.status || '').toUpperCase() === 'UNHEALTHY') {
                throw new Error(result.message || `${providerName} health check failed`);
            }
            toast.success(result.message || `${providerName} connection is healthy.`);
            refetchIntegrations();
        } catch (error) {
            toast.error(error?.data?.error || error.message || `Unable to test ${providerName}.`);
        } finally {
            setTestingId(null);
        }
    };

    const copyInboundEndpoint = (providerName) => {
        const origin = window.location.origin;
        let endpoint = '';
        if (providerName === 'Stripe') endpoint = `${origin}/api/webhooks/stripe`;
        else if (['Twilio', 'WhatsApp'].includes(providerName)) endpoint = `${origin}/api/webhooks/twilio`;
        else if (providerName === 'PACS_Orthanc') endpoint = `${origin}/api/pacs/webhook/orthanc`;
        else endpoint = `${origin}/api/webhooks/${providerName.toLowerCase()}`;

        navigator.clipboard.writeText(endpoint);
        setCopiedKey(providerName);
        toast.success(t('endpointCopied', { defaultValue: 'Webhook listener URL copied to clipboard' }));
        setTimeout(() => setCopiedKey(null), 2500);
    };

    const triggerExportAccounting = async () => {
        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const params = new URLSearchParams();
        if (exportStartDate) params.append('startDate', exportStartDate);
        if (exportEndDate) params.append('endDate', exportEndDate);

        const url = `${baseUrl}/integrations/export-accounting${params.toString() ? `?${params.toString()}` : ''}`;
        setIsExporting(true);
        try {
            await downloadAuthenticatedFile(url, `accounting-export-${exportStartDate || 'all'}-${exportEndDate || 'all'}.csv`);
            toast.success(t('exportSuccess', { defaultValue: 'Accounting records exported successfully' }));
            setShowExportModal(false);
        } catch (error) {
            toast.error(error.message || t('exportError', { defaultValue: 'Failed to export accounting records' }));
        } finally {
            setIsExporting(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (String(status || '').toLowerCase()) {
            case 'success': return <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><CheckCircle size={13} /> {t('statuses.Success', { defaultValue: 'Success' })}</span>;
            case 'failed': return <span className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><XCircle size={13} /> {t('statuses.Failed', { defaultValue: 'Failed' })}</span>;
            case 'healthfailed': return <span className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><XCircle size={13} /> {t('statuses.HealthFailed', { defaultValue: 'Health Failed' })}</span>;
            case 'deadletter': return <span className="bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><AlertCircle size={13} /> {t('statuses.DeadLetter', { defaultValue: 'Dead-letter' })}</span>;
            case 'processing': return <span className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><RefreshCw size={13} className="animate-spin" /> {t('statuses.Processing', { defaultValue: 'Processing' })}</span>;
            case 'retried': return <span className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><RefreshCw size={13} /> {t('statuses.Retried', { defaultValue: 'Retried' })}</span>;
            default: return <span className="bg-slate-100/80 text-slate-700 dark:text-slate-300 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><Activity size={13} /> {t('statuses.Pending', { defaultValue: 'Pending' })}</span>;
        }
    };

    const getHealthBadge = (integration) => {
        const status = String(integration.health_status || (integration.is_active ? 'Healthy' : 'Disabled'));
        const tone = {
            Healthy: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            Unhealthy: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
            Degraded: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300',
            Disabled: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
            NotConfigured: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
            Unknown: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
        }[status] || 'border-slate-300 bg-slate-100 text-slate-600';
        const Icon = status === 'Healthy' ? CheckCircle : status === 'Unhealthy' ? XCircle : Clock3;
        return (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}>
                <Icon size={12} /> {t(`health.${status}`, { defaultValue: status })}
            </span>
        );
    };

    const totalProviders = integrations?.length || 0;
    const activeProviders = integrations?.filter(i => i.is_active)?.length || 0;
    const deadLetterCount = deadLetters?.length || 0;
    const configuredProviders = integrations.filter((item) => item.has_api_key || item.has_api_secret || item.has_webhook_secret || item.webhook_url || item.sender_identity || item.extra_config?.realm_id || item.extra_config?.orthanc_url).length;

    const rawLogs = Array.isArray(logs) ? logs : [];
    const filteredLogs = rawLogs.filter((log) => {
        const query = logSearch.trim().toLowerCase();
        const matchesQuery = !query || [log.provider_name, log.event_type, log.error_message].some(v => String(v || '').toLowerCase().includes(query));
        const matchesStatus = logStatusFilter === 'all' || String(log.status || '').toLowerCase() === logStatusFilter.toLowerCase();
        const matchesProvider = logProviderFilter === 'all' || String(log.provider_name || '').toLowerCase() === logProviderFilter.toLowerCase();
        return matchesQuery && matchesStatus && matchesProvider;
    });

    const totalLogPages = Math.ceil(filteredLogs.length / logsPerPage) || 1;
    const paginatedLogs = filteredLogs.slice((logPage - 1) * logsPerPage, logPage * logsPerPage);

    return (
        <div className={embedded ? 'space-y-5 pb-0' : 'mx-auto max-w-7xl space-y-6 pb-10'}>
            <div className="relative space-y-4 overflow-hidden rounded-[var(--VIARA-radius-surface)] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-[var(--VIARA-density-card-padding)] shadow-[var(--shadow-sm)]">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-[rgba(var(--VIARA-accent-rgb),0.1)] blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Network size={26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                <LinkIcon size={11} />
                                <span>{t('eyebrow', { defaultValue: 'Connected Services & Webhooks' })}</span>
                            </span>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('title', { defaultValue: 'System Integrations & APIs' })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('description', { defaultValue: 'Configure external EHR/PACS connectors, payment gateways, messaging services, and webhooks.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setShowGuide(v => !v)}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <BookOpen size={14} />
                            <span>{showGuide ? t('hideGuide', { defaultValue: 'Hide Setup Guide' }) : t('showGuide', { defaultValue: 'Setup Checklist' })}</span>
                        </button>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-100/80 px-4 py-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Network size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('metrics.total', { defaultValue: 'Total Providers' })}</p>
                            <p className="font-mono text-base font-black text-slate-900 dark:text-white">{totalProviders}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-emerald-700 dark:text-emerald-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">{t('metrics.enabled', { defaultValue: 'Active & Syncing' })}</p>
                            <p className="font-mono text-base font-black text-emerald-900 dark:text-white">{activeProviders}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-sky-700 dark:text-sky-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <ShieldCheck size={16} className="text-sky-600 dark:text-sky-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">{t('metrics.configured', { defaultValue: 'Configured' })}</p>
                            <p className="font-mono text-base font-black text-sky-900 dark:text-white">{configuredProviders}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-amber-700 dark:text-amber-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">{t('deadLetterTitle', { defaultValue: 'Dead-Letter Queue' })}</p>
                            <p className="font-mono text-base font-black text-amber-900 dark:text-white">{deadLetterCount}</p>
                        </div>
                    </div>
                </div>

                {showGuide && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                        <GuideCard name="Stripe" items={t('guides.stripe.steps', { returnObjects: true })} envs={['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']} docs="https://docs.stripe.com/connect" docsLabel={t('docs', { defaultValue: 'Documentation' })} />
                        <GuideCard name="Twilio" items={t('guides.twilio.steps', { returnObjects: true })} envs={['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']} docs="https://www.twilio.com/docs/sms" docsLabel={t('docs', { defaultValue: 'Documentation' })} />
                        <GuideCard name="WhatsApp" items={t('guides.whatsapp.steps', { returnObjects: true })} envs={['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']} docs="https://www.twilio.com/docs/whatsapp" docsLabel={t('docs', { defaultValue: 'Documentation' })} />
                        <GuideCard name="QuickBooks" items={t('guides.quickbooks.steps', { returnObjects: true })} envs={['QUICKBOOKS_ACCESS_TOKEN', 'QUICKBOOKS_REALM_ID']} docs="https://developer.intuit.com/app/developer/qbo/docs/api" docsLabel={t('docs', { defaultValue: 'Documentation' })} />
                        <GuideCard name="PACS / Orthanc" items={t('guides.orthanc.steps', { returnObjects: true })} envs={['ORTHANC_URL', 'ORTHANC_API_USER', 'ORTHANC_API_PASSWORD']} docs="https://orthanc.uclouvain.be/book/" docsLabel={t('docs', { defaultValue: 'Documentation' })} />
                    </div>
                )}
            </div>

            <div role="tablist" aria-label={t('tabs.label', { defaultValue: 'Integration Sections' })} className="flex w-fit flex-wrap items-center gap-2 rounded-[var(--VIARA-radius-surface)] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-1.5">
                <button
                    type="button" role="tab" aria-selected={activeTab === 'config'}
                    className={`flex items-center gap-2 rounded-[var(--VIARA-radius-control)] px-4 py-2 text-xs font-bold transition-all ${activeTab === 'config' ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm' : 'text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)]'}`}
                    onClick={() => setActiveTab('config')}
                >
                    <Settings size={14} /> {t('tabs.config', { defaultValue: 'Providers Configuration' })}
                </button>
                <button
                    type="button" role="tab" aria-selected={activeTab === 'logs'}
                    className={`flex items-center gap-2 rounded-[var(--VIARA-radius-control)] px-4 py-2 text-xs font-bold transition-all ${activeTab === 'logs' ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm' : 'text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)]'}`}
                    onClick={() => { setActiveTab('logs'); setLogPage(1); refetchLogs(); }}
                >
                    <Activity size={14} /> {t('tabs.logs', { defaultValue: 'Activity Logs' })}
                </button>
                <button
                    type="button" role="tab" aria-selected={activeTab === 'dead-letter'}
                    className={`flex items-center gap-2 rounded-[var(--VIARA-radius-control)] px-4 py-2 text-xs font-bold transition-all ${activeTab === 'dead-letter' ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm' : 'text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)]'}`}
                    onClick={() => { setActiveTab('dead-letter'); refetchDeadLetters(); }}
                >
                    <AlertCircle size={14} />
                    <span>{t('deadLetterTitle', { defaultValue: 'Dead-letter Queue' })}</span>
                    {deadLetterCount > 0 && (
                        <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-black text-amber-800 dark:text-amber-300">
                            {deadLetterCount}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === 'config' && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 flex items-start gap-3 text-sky-900 dark:text-sky-200">
                        <AlertCircle className="shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" size={18} />
                        <div className="text-xs font-medium">
                            <strong className="font-bold">{t('mockNoteLabel', { defaultValue: 'Enterprise Security Note:' })}</strong> {t('mockNote', { defaultValue: 'API secrets and webhook tokens are encrypted at rest with AES-256-GCM. Live credentials are never logged.' })}
                        </div>
                    </div>

                    {isIntegrationsLoading ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 font-medium">{t('loadingProviders', { defaultValue: 'Loading providers...' })}</div>
                    ) : integrationsFailed ? (
                        <InlineState
                            icon={AlertCircle}
                            title={t('errors.providersTitle', { defaultValue: 'Providers could not be loaded' })}
                            description={t('errors.providersDescription', { defaultValue: 'Check the API connection and your integration permissions, then retry.' })}
                            action={t('refresh', { defaultValue: 'Refresh' })}
                            onAction={refetchIntegrations}
                        />
                    ) : integrations.length === 0 ? (
                        <InlineState
                            icon={Network}
                            title={t('noProvidersTitle', { defaultValue: 'No integration providers initialized' })}
                            description={t('noProvidersDescription', { defaultValue: 'Initialize the default providers (Twilio, WhatsApp, Stripe, QuickBooks, PACS Orthanc) to configure external connectors.' })}
                            action={isSeeding ? t('initializing', { defaultValue: 'Initializing...' }) : t('initializeProviders', { defaultValue: 'Initialize Default Providers' })}
                            onAction={async () => {
                                try {
                                    await seedIntegrations().unwrap();
                                    toast.success(t('initialized', { defaultValue: 'Default providers initialized successfully' }));
                                    refetchIntegrations();
                                } catch (error) {
                                    toast.error(error?.data?.error || t('initializeError', { defaultValue: 'Failed to initialize providers' }));
                                }
                            }}
                            disabled={isSeeding}
                        />
                    ) : (
                        <div className="grid gap-4">
                            {integrations?.map(integration => (
                                <div key={integration.integration_id} className="bg-white/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 dark:bg-slate-900/90 rounded-3xl p-6 shadow-sm">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-gradient-to-br from-teal-500/20 to-sky-500/20 ring-1 ring-teal-500/30 rounded-2xl flex items-center justify-center text-teal-700 dark:text-teal-300 font-black text-xl">
                                                {integration.provider_name.charAt(0)}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{integration.provider_name}</h3>
                                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{t('type', { type: integration.type })}</p>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                                    {integration.sender_identity && (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                            <Send size={10} /> {integration.sender_identity}
                                                        </span>
                                                    )}
                                                    {integration.has_webhook_secret && (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                                                            <Key size={10} /> {t('webhookSecretConfigured', { defaultValue: 'Webhook signature configured' })}
                                                        </span>
                                                    )}
                                                    {['Stripe', 'Twilio', 'WhatsApp', 'PACS_Orthanc'].includes(integration.provider_name) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => copyInboundEndpoint(integration.provider_name)}
                                                            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
                                                            title={t('copyEndpointTitle', { defaultValue: 'Copy inbound webhook listener URL for this provider' })}
                                                        >
                                                            {copiedKey === integration.provider_name ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
                                                            <span>{t('copyEndpoint', { defaultValue: 'Inbound Webhook URL' })}</span>
                                                        </button>
                                                    )}
                                                </div>
                                                {integration.provider_name === 'QuickBooks' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowExportModal(true)}
                                                        className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                                                    >
                                                        <Download size={13} /> {t('export', { defaultValue: 'Download accounting CSV' })}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            {getHealthBadge(integration)}
                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${integration.is_active ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                                {integration.is_active ? t('active', { defaultValue: 'Active' }) : t('disabled', { defaultValue: 'Disabled' })}
                                            </span>
                                        </div>
                                    </div>

                                    {editingId === integration.integration_id ? (
                                        <div className="bg-slate-50/50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-4 mt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {integration.provider_name !== 'Stripe' && (
                                                    <CredentialField
                                                        id={`${integration.integration_id}-api-key`}
                                                        label={integration.provider_name === 'QuickBooks' ? t('accessToken', { defaultValue: 'OAuth Access Token' }) : t('apiKey', { defaultValue: 'API Key / SID' })}
                                                        value={editForm.api_key}
                                                        configured={integration.has_api_key}
                                                        cleared={editForm.clear_fields?.includes('api_key')}
                                                        visible={showSecrets[`${integration.integration_id}:api_key`]}
                                                        onToggleVisibility={() => setShowSecrets((value) => ({ ...value, [`${integration.integration_id}:api_key`]: !value[`${integration.integration_id}:api_key`] }))}
                                                        onChange={(value) => setEditForm({ ...editForm, api_key: value })}
                                                        onClear={() => toggleClearField('api_key')}
                                                        t={t}
                                                    />
                                                )}
                                                {integration.provider_name !== 'QuickBooks' && (
                                                    <CredentialField
                                                        id={`${integration.integration_id}-api-secret`}
                                                        label={t('secret', { defaultValue: 'API Secret / Auth Token' })}
                                                        value={editForm.api_secret}
                                                        configured={integration.has_api_secret}
                                                        cleared={editForm.clear_fields?.includes('api_secret')}
                                                        visible={showSecrets[`${integration.integration_id}:api_secret`]}
                                                        onToggleVisibility={() => setShowSecrets((value) => ({ ...value, [`${integration.integration_id}:api_secret`]: !value[`${integration.integration_id}:api_secret`] }))}
                                                        onChange={(value) => setEditForm({ ...editForm, api_secret: value })}
                                                        onClear={() => toggleClearField('api_secret')}
                                                        t={t}
                                                    />
                                                )}
                                                {integration.provider_name === 'Stripe' && (
                                                    <CredentialField
                                                        id={`${integration.integration_id}-webhook-secret`}
                                                        label={t('webhookSecret', { defaultValue: 'Webhook Signing Secret (whsec_...)' })}
                                                        value={editForm.webhook_secret}
                                                        configured={integration.has_webhook_secret}
                                                        cleared={editForm.clear_fields?.includes('webhook_secret')}
                                                        visible={showSecrets[`${integration.integration_id}:webhook_secret`]}
                                                        onToggleVisibility={() => setShowSecrets((value) => ({ ...value, [`${integration.integration_id}:webhook_secret`]: !value[`${integration.integration_id}:webhook_secret`] }))}
                                                        onChange={(value) => setEditForm({ ...editForm, webhook_secret: value })}
                                                        onClear={() => toggleClearField('webhook_secret')}
                                                        t={t}
                                                    />
                                                )}
                                                {['Twilio', 'WhatsApp'].includes(integration.provider_name) && (
                                                    <LabeledInput
                                                        id={`${integration.integration_id}-sender`}
                                                        label={t('senderIdentity', { defaultValue: 'Sender Identity / Phone Number' })}
                                                        value={editForm.sender_identity}
                                                        onChange={(value) => setEditForm({ ...editForm, sender_identity: value })}
                                                        placeholder={t('senderPlaceholder', { defaultValue: '+1234567890 or whatsapp:+1234567890' })}
                                                    />
                                                )}
                                                {integration.provider_name === 'PACS_Orthanc' && (
                                                    <LabeledInput
                                                        id={`${integration.integration_id}-url`}
                                                        label={t('orthancUrl', { defaultValue: 'Orthanc Server URL' })}
                                                        type="url"
                                                        value={editForm.webhook_url}
                                                        onChange={(value) => setEditForm({ ...editForm, webhook_url: value })}
                                                        placeholder="http://orthanc:8042"
                                                        className="md:col-span-2"
                                                    />
                                                )}
                                                {integration.provider_name === 'QuickBooks' && (
                                                    <>
                                                        <LabeledInput
                                                            id={`${integration.integration_id}-realm`}
                                                            label={t('realmId', { defaultValue: 'QuickBooks Realm ID' })}
                                                            value={editForm.realm_id}
                                                            onChange={(value) => setEditForm({ ...editForm, realm_id: value })}
                                                        />
                                                        <div>
                                                            <label htmlFor={`${integration.integration_id}-environment`} className="mb-1 block text-xs font-bold text-[var(--VIARA-ink)]">{t('environment', { defaultValue: 'Environment' })}</label>
                                                            <select id={`${integration.integration_id}-environment`} value={editForm.environment} onChange={(event) => setEditForm({ ...editForm, environment: event.target.value })} className="min-h-11 w-full rounded-[var(--VIARA-radius-control)] border border-[var(--VIARA-line)] bg-[var(--VIARA-field)] px-3 text-sm text-[var(--VIARA-ink)] outline-none focus:border-[var(--VIARA-accent)]">
                                                                <option value="sandbox">{t('sandbox', { defaultValue: 'Sandbox' })}</option>
                                                                <option value="production">{t('production', { defaultValue: 'Production' })}</option>
                                                            </select>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={editForm.is_active}
                                                        onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                                                        className="h-4 w-4 cursor-pointer rounded accent-[var(--VIARA-accent)]"
                                                    />
                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('enable', { defaultValue: 'Enable this integration' })}</span>
                                                </label>
                                                <div className="flex gap-2">
                                                    <button type="button" disabled={isSaving} onClick={() => setEditingId(null)} className="rounded-[var(--VIARA-radius-control)] px-3 py-2 text-sm font-bold text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface-hover)]">{t('cancel', { defaultValue: 'Cancel' })}</button>
                                                    <button type="button" disabled={isSaving} onClick={() => handleSave(integration.integration_id)} className="flex items-center gap-1 rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-accent)] px-3 py-2 text-sm font-bold text-[var(--VIARA-accent-contrast)] transition hover:bg-[var(--VIARA-accent-dark)] disabled:opacity-50">
                                                        <Save size={16} /> {isSaving ? t('saving', { defaultValue: 'Saving...' }) : t('save', { defaultValue: 'Save configuration' })}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                                            <button
                                                type="button"
                                                onClick={() => handleTest(integration.integration_id, integration.provider_name)}
                                                disabled={isTesting}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                            >
                                                <Send size={13} className={testingId === integration.integration_id ? 'animate-pulse' : ''} />
                                                {testingId === integration.integration_id ? t('testing', { defaultValue: 'Testing...' }) : t('testConnection', { defaultValue: 'Test connection' })}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleEdit(integration)}
                                                className="inline-flex items-center gap-1 text-sm font-bold text-[var(--VIARA-accent-text)] hover:text-[var(--VIARA-accent-dark)]"
                                            >
                                                <Settings size={16} /> {t('configure', { defaultValue: 'Configure provider' })}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'logs' && (
                <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/50 rounded-2xl shadow-sm overflow-hidden space-y-3">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder={t('search', { defaultValue: 'Search events or errors...' })}
                                    value={logSearch}
                                    onChange={e => { setLogSearch(e.target.value); setLogPage(1); }}
                                    className="h-8 rounded-lg border border-slate-200 bg-white ps-8 pe-3 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>
                            <select
                                value={logStatusFilter}
                                onChange={e => { setLogStatusFilter(e.target.value); setLogPage(1); }}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                            >
                                <option value="all">{t('allStatuses', { defaultValue: 'All Statuses' })}</option>
                                <option value="Success">{t('statuses.Success', { defaultValue: 'Success' })}</option>
                                <option value="Failed">{t('statuses.Failed', { defaultValue: 'Failed' })}</option>
                                <option value="Retried">{t('statuses.Retried', { defaultValue: 'Retried' })}</option>
                                <option value="Pending">{t('statuses.Pending', { defaultValue: 'Pending' })}</option>
                                <option value="DeadLetter">{t('statuses.DeadLetter', { defaultValue: 'Dead-letter' })}</option>
                            </select>
                            <select
                                value={logProviderFilter}
                                onChange={e => { setLogProviderFilter(e.target.value); setLogPage(1); }}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                            >
                                <option value="all">{t('allProviders', { defaultValue: 'All Providers' })}</option>
                                <option value="Twilio">Twilio</option>
                                <option value="WhatsApp">WhatsApp</option>
                                <option value="Stripe">Stripe</option>
                                <option value="QuickBooks">QuickBooks</option>
                                <option value="PACS_Orthanc">PACS Orthanc</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={() => refetchLogs()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={12} className={isLogsLoading ? 'animate-spin' : ''} /> {t('refresh', { defaultValue: 'Refresh' })}
                        </button>
                    </div>

                    {isLogsLoading ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 font-medium">{t('loadingLogs', { defaultValue: 'Loading logs...' })}</div>
                    ) : logsFailed ? (
                        <InlineState icon={AlertCircle} title={t('errors.logsTitle', { defaultValue: 'Logs could not be loaded' })} description={t('errors.logsDescription', { defaultValue: 'The log service is temporarily unavailable.' })} action={t('refresh', { defaultValue: 'Refresh' })} onAction={refetchLogs} />
                    ) : paginatedLogs.length === 0 ? (
                        <div className="text-center py-16 bg-slate-50 dark:bg-slate-900/50">
                            <Activity size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">{t('emptyTitle', { defaultValue: 'No integration events yet' })}</h3>
                            <p className="text-slate-500 dark:text-slate-400">{t('emptyDescription', { defaultValue: 'Delivery and health events will appear here when providers are used or tested.' })}</p>
                        </div>
                    ) : (
                        <div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-start text-sm">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3 font-bold">{t('table.date', { defaultValue: 'Date and time' })}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.provider', { defaultValue: 'Provider' })}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.event', { defaultValue: 'Event' })}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.status', { defaultValue: 'Status' })}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.details', { defaultValue: 'Details' })}</th>
                                            <th className="px-4 py-3 font-bold text-end">{t('table.actions', { defaultValue: 'Actions' })}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {paginatedLogs.map(log => (
                                            <tr key={log.log_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                                                    <div>{new Date(log.created_at).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB')}</div>
                                                    <div className="text-[10px] text-slate-400">{formatRelativeTime(log.created_at, i18n.language)}</div>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">
                                                    {log.provider_name}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-medium">
                                                    {log.event_type}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {getStatusBadge(log.status)}
                                                </td>
                                                <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLogDetails(log)}
                                                        className="text-start hover:text-indigo-600 dark:hover:text-indigo-400 transition underline truncate max-w-xs block"
                                                        title="Click to view full payload and response details"
                                                    >
                                                        {log.error_message || JSON.stringify(log.payload) || 'View details'}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-end">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedLogDetails(log)}
                                                            className="rounded-lg p-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                            title={t('viewDetails', { defaultValue: 'View Details' })}
                                                        >
                                                            <FileText size={14} />
                                                        </button>
                                                        {String(log.status || '').toLowerCase() === 'failed'
                                                            && ['Outbound SMS', 'Outbound WhatsApp'].includes(log.event_type) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRetry(log.log_id)}
                                                                disabled={isRetrying}
                                                                className="flex items-center gap-1 rounded-lg p-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-400 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20"
                                                                title={t('retryTitle', { defaultValue: 'Retry event' })}
                                                            >
                                                                <RefreshCw size={14} className={retryingId === log.log_id ? "animate-spin" : ""} /> {t('retry', { defaultValue: 'Retry' })}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {totalLogPages > 1 && (
                                <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                                    <span>{t('showingPage', { defaultValue: `Page ${logPage} of ${totalLogPages} (${filteredLogs.length} events)` })}</span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            disabled={logPage <= 1}
                                            onClick={() => setLogPage(p => p - 1)}
                                            className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                                        >
                                            <ChevronLeft size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={logPage >= totalLogPages}
                                            onClick={() => setLogPage(p => p + 1)}
                                            className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'dead-letter' && (
                <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/50 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-sm font-black text-slate-950 dark:text-white">{t('deadLetterTitle', { defaultValue: 'Dead-letter queue' })}</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('deadLetterDescription', { defaultValue: 'Events that exhausted all retry attempts. Review and manually retry if needed.' })}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder={t('search', { defaultValue: 'Search dead letters...' })}
                                    value={deadLetterSearch}
                                    onChange={e => setDeadLetterSearch(e.target.value)}
                                    className="h-8 rounded-lg border border-slate-200 bg-white ps-8 pe-3 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>
                            <select
                                value={deadLetterFilter}
                                onChange={e => setDeadLetterFilter(e.target.value)}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                            >
                                <option value="all">{t('allStatuses', { defaultValue: 'All event types' })}</option>
                                <option value="payment">{t('filters.payment', { defaultValue: 'Payments' })}</option>
                                <option value="sms">{t('filters.sms', { defaultValue: 'SMS' })}</option>
                                <option value="whatsapp">{t('filters.whatsapp', { defaultValue: 'WhatsApp' })}</option>
                            </select>
                        </div>
                    </div>
                    {isDeadLettersLoading ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 font-medium">{t('loadingLogs', { defaultValue: 'Loading logs...' })}</div>
                    ) : deadLettersFailed ? (
                        <InlineState icon={AlertCircle} title={t('errors.deadLettersTitle', { defaultValue: 'Dead-letter queue could not be loaded' })} description={t('errors.deadLettersDescription', { defaultValue: 'Retry after checking the API and database connection.' })} action={t('refresh', { defaultValue: 'Refresh' })} onAction={refetchDeadLetters} />
                    ) : (() => {
                        const query = deadLetterSearch.trim().toLowerCase();
                        const filtered = deadLetters.filter(log => {
                            const matchesSearch = !query || [
                                log.provider_name,
                                log.event_type,
                                log.dead_letter_reason,
                                log.error_message
                            ].some(val => String(val || '').toLowerCase().includes(query));
                            const matchesFilter = deadLetterFilter === 'all' || String(log.event_type || '').toLowerCase().includes(deadLetterFilter);
                            return matchesSearch && matchesFilter;
                        });
                        if (!filtered.length) {
                            return (
                                <div className="p-8 text-center">
                                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                                        <Inbox size={24} />
                                    </div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('emptyTitle', { defaultValue: 'No outbound events in dead-letter queue' })}</p>
                                    <p className="text-xs text-slate-400 mt-1">{query ? t('searchClear', { defaultValue: 'Try clearing your search' }) : t('emptyDescription', { defaultValue: 'Integration logs will appear here when an event is triggered.' })}</p>
                                    {query && (
                                        <button type="button" onClick={() => setDeadLetterSearch('')} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                            <RotateCcw size={12} /> {t('clearSearch', { defaultValue: 'Clear search' })}
                                        </button>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <div className="overflow-x-auto">
                                <table className="w-full text-start text-sm">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3 font-bold">{t('table.date', { defaultValue: 'Date and time' })}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.provider', { defaultValue: 'Provider' })}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.event', { defaultValue: 'Event' })}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.retries', { defaultValue: 'Attempts' })}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.reason', { defaultValue: 'Failure reason' })}</th>
                                            <th className="px-4 py-3 font-bold text-end">{t('table.actions', { defaultValue: 'Actions' })}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filtered.map(log => (
                                            <tr key={log.log_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                                                    <div>{new Date(log.created_at).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB')}</div>
                                                    <div className="text-[10px] text-slate-400">{formatRelativeTime(log.created_at, i18n.language)}</div>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{log.provider_name}</td>
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-medium">{log.event_type}</td>
                                                <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                                                    <span className="font-bold">{log.retry_count || 0}</span>
                                                    <span className="text-slate-400"> / {log.max_retries || 3}</span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-red-500 dark:text-red-400 max-w-xs">
                                                    <div className="truncate" title={log.dead_letter_reason || log.error_message}>{log.dead_letter_reason || log.error_message}</div>
                                                </td>
                                                <td className="px-4 py-3 text-end">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingRequeue(log)}
                                                            disabled={isRequeuing}
                                                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-500/10 hover:bg-amber-500/20 dark:text-amber-300 transition-colors"
                                                            title={t('requeueTitle', { defaultValue: 'Move back to pending queue' })}
                                                        >
                                                            <RotateCcw size={13} className={isRequeuing ? "animate-spin" : ""} /> {t('requeue', { defaultValue: 'Requeue' })}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            )}

            {selectedLogDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {selectedLogDetails.provider_name} — {selectedLogDetails.event_type}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    ID: {selectedLogDetails.log_id}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedLogDetails(null)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="mt-4 space-y-3 max-h-96 overflow-y-auto font-mono text-xs">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Status</span>
                                <div>{getStatusBadge(selectedLogDetails.status)}</div>
                            </div>
                            {selectedLogDetails.error_message && (
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block mb-1">Error Message</span>
                                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300">
                                        {selectedLogDetails.error_message}
                                    </div>
                                </div>
                            )}
                            {selectedLogDetails.payload && (
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Payload</span>
                                    <pre className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 overflow-x-auto">
                                        {JSON.stringify(selectedLogDetails.payload, null, 2)}
                                    </pre>
                                </div>
                            )}
                            {selectedLogDetails.provider_response && (
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Provider Response</span>
                                    <pre className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 overflow-x-auto">
                                        {JSON.stringify(selectedLogDetails.provider_response, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                        <div className="mt-5 flex justify-end border-t border-slate-200 pt-3 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setSelectedLogDetails(null)}
                                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showExportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <Download size={18} className="text-emerald-600" />
                                {t('exportAccountingTitle', { defaultValue: 'Export Accounting Records' })}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowExportModal(false)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="mt-4 space-y-3">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('exportModalDescription', { defaultValue: 'Download finalized invoice records in QuickBooks-compatible CSV format. Filter by date or leave blank to export all records.' })}
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                                        <Calendar size={12} /> {t('startDate', { defaultValue: 'Start Date' })}
                                    </label>
                                    <input
                                        type="date"
                                        value={exportStartDate}
                                        onChange={e => setExportStartDate(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                                        <Calendar size={12} /> {t('endDate', { defaultValue: 'End Date' })}
                                    </label>
                                    <input
                                        type="date"
                                        value={exportEndDate}
                                        onChange={e => setExportEndDate(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setShowExportModal(false)}
                                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {t('cancel', { defaultValue: 'Cancel' })}
                            </button>
                            <button
                                type="button"
                                onClick={triggerExportAccounting}
                                disabled={isExporting}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                            >
                                <Download size={14} className={isExporting ? 'animate-bounce' : ''} />
                                {isExporting ? t('exporting', { defaultValue: 'Exporting...' }) : t('downloadCsv', { defaultValue: 'Download CSV' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={Boolean(pendingRequeue)}
                onClose={() => setPendingRequeue(null)}
                title={t('requeueConfirmTitle', { defaultValue: 'Requeue this event?' })}
                message={t('requeueConfirmMessage', { provider: pendingRequeue?.provider_name, event: pendingRequeue?.event_type, defaultValue: 'The event will be returned to the pending queue for processing.' })}
                confirmLabel={t('requeue', { defaultValue: 'Requeue' })}
                cancelLabel={t('cancel', { defaultValue: 'Cancel' })}
                variant="warning"
                isLoading={isRequeuing}
                onConfirm={async () => {
                    try {
                        await retryDeadLetter(pendingRequeue.log_id).unwrap();
                        toast.success(t('requeueSuccess', { defaultValue: 'Event requeued successfully' }));
                        await refetchDeadLetters();
                        return true;
                    } catch (error) {
                        toast.error(error?.data?.error || t('requeueError', { defaultValue: 'Failed to requeue event' }));
                        return false;
                    }
                }}
            />
        </div>
    );
};

const fieldClassName = 'min-h-11 w-full rounded-[var(--VIARA-radius-control)] border border-[var(--VIARA-line)] bg-[var(--VIARA-field)] px-3 text-sm text-[var(--VIARA-ink)] outline-none transition placeholder:text-[var(--VIARA-muted)] focus:border-[var(--VIARA-accent)] focus:ring-2 focus:ring-[rgba(var(--VIARA-accent-rgb),0.14)]';

const LabeledInput = ({ id, label, value, onChange, type = 'text', placeholder = '', className = '' }) => (
    <div className={className}>
        <label htmlFor={id} className="mb-1 block text-xs font-bold text-[var(--VIARA-ink)]">{label}</label>
        <input
            id={id}
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={fieldClassName}
        />
    </div>
);

const CredentialField = ({ id, label, value, configured, cleared, visible, onToggleVisibility, onChange, onClear, t }) => (
    <div>
        <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor={id} className="flex items-center gap-1 text-xs font-bold text-[var(--VIARA-ink)]"><Key size={14} />{label}</label>
            {configured && (
                <button type="button" onClick={onClear} className={`text-[10px] font-bold ${cleared ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                    {cleared ? t('keepCredential', { defaultValue: 'Keep saved value' }) : t('clearCredential', { defaultValue: 'Remove saved value' })}
                </button>
            )}
        </div>
        <div className="relative">
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={value}
                disabled={cleared}
                onChange={(event) => onChange(event.target.value)}
                placeholder={configured ? t('credentialConfigured', { defaultValue: 'Configured — leave blank to keep' }) : t('credentialMissing', { defaultValue: 'Not configured yet' })}
                className={`${fieldClassName} pe-10 font-mono disabled:opacity-50`}
            />
            <button type="button" onClick={onToggleVisibility} aria-label={visible ? t('hideCredential', { defaultValue: 'Hide credential' }) : t('showCredential', { defaultValue: 'Show credential' })} className="absolute end-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)]">
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
        </div>
    </div>
);

const InlineState = ({ icon: Icon, title, description, action, onAction, disabled = false }) => (
    <div className="rounded-[var(--VIARA-radius-surface)] border border-dashed border-[var(--VIARA-line-strong)] bg-[var(--VIARA-surface-muted)] p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--VIARA-radius-surface)] bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] shadow-sm"><Icon size={22} /></span>
        <h3 className="mt-3 text-sm font-black text-[var(--VIARA-ink)]">{title}</h3>
        <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-[var(--VIARA-muted)]">{description}</p>
        {action && <button type="button" disabled={disabled} onClick={onAction} className="mt-4 min-h-10 rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-accent)] px-4 text-xs font-bold text-[var(--VIARA-accent-contrast)] disabled:opacity-50">{action}</button>}
    </div>
);

const GuideCard = ({ name, items = [], envs, docs, docsLabel }) => (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/30">
        <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-slate-950 dark:text-white">{name}</h4>
            {docs && <a href={docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--VIARA-accent-text)] hover:underline">{docsLabel} <ExternalLink size={11} /></a>}
        </div>
        <ol className="mt-3 list-decimal list-inside space-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {Array.isArray(items) && items.map((step, idx) => <li key={idx}>{step}</li>)}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
            {envs.map(env => <span key={env} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{env}</span>)}
        </div>
    </div>
);

export default IntegrationSettings;
