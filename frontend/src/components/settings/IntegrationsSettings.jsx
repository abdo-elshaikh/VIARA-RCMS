import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertCircle,
    Blocks,
    CheckCircle2,
    Clock,
    CreditCard,
    Eye,
    EyeOff,
    Key,
    Link,
    ListFilter,
    Lock,
    MessageCircle,
    MessageSquare,
    RefreshCw,
    RotateCcw,
    Send,
    Server,
    ShieldCheck,
    Sliders,
    X,
    Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    useGetIntegrationsQuery,
    useUpdateIntegrationMutation,
    useTestIntegrationMutation,
    useGetIntegrationLogsQuery,
    useRetryIntegrationEventMutation
} from '../../store/api';
import { formatRelativeTime } from '../../utils/dateFormat';
import { getErrorMessage } from '../../utils/getErrorMessage';

const PROVIDER_META = {
    stripe: {
        icon: CreditCard,
        desc: 'Process patient payments, manage payment links, and generate automated invoice receipts.',
        category: 'Payments & Billing'
    },
    twilio: {
        icon: MessageSquare,
        desc: 'Send automated SMS appointment reminders, emergency notifications, and verification codes.',
        category: 'SMS Messaging'
    },
    whatsapp: {
        icon: MessageCircle,
        desc: 'Engage patients via WhatsApp Business API for appointment confirmations and interactive chat.',
        category: 'WhatsApp Gateway'
    },
    quickbooks: {
        icon: Blocks,
        desc: 'Sync financial ledgers, tax totals, and invoice entries automatically to accounting software.',
        category: 'Financial Accounting'
    },
    pacs_orthanc: {
        icon: Server,
        desc: 'Connect DICOM Modality Worklist (MWL) and PACS imaging server for automated study queries.',
        category: 'PACS / DICOM'
    }
};

const getProviderMeta = name => {
    const key = name?.toLowerCase()?.replace(/\s+/g, '_');
    return PROVIDER_META[key] || {
        icon: Blocks,
        desc: 'Connect a third-party healthcare service or external API.',
        category: 'Integration Service'
    };
};

const IntegrationsSettings = () => {
    const { t } = useTranslation(['settings', 'common']);
    const { data: apps = [], isLoading, refetch: refetchApps } = useGetIntegrationsQuery();
    const { data: logs = [], isLoading: isLoadingLogs, refetch: refetchLogs } = useGetIntegrationLogsQuery();
    
    const [selectedAppForConfig, setSelectedAppForConfig] = useState(null);
    const [showLogsDrawer, setShowLogsDrawer] = useState(false);

    const connected = apps.filter(app => app.is_active).length;

    return (
        <div className="space-y-4">
            {/* Overview Header Card */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                            <Blocks size={18} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-slate-950 dark:text-white">
                                {t('settings.integrationsTitle', { defaultValue: 'Connected Apps & Service Gateways' })}
                            </h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                {t('settings.integrationsDesc', { defaultValue: 'Configure API keys, webhooks, and live status connections for third-party medical and financial gateways.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setShowLogsDrawer(prev => !prev)}
                            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${
                                showLogsDrawer
                                    ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                            }`}
                        >
                            <Activity size={15} />
                            {showLogsDrawer ? 'Hide Event Logs' : 'Webhook & Event Logs'}
                        </button>
                    </div>
                </div>

                {/* Metrics Bar */}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-4">
                    <Metric label="Available Gateways" value={apps.length} icon={Blocks} />
                    <Metric label="Active Connections" value={connected} icon={CheckCircle2} tone="emerald" />
                    <Metric label="API Keys Configured" value={apps.filter(a => a.has_api_key).length} icon={Key} tone="cyan" />
                    <Metric label="Recent Events Logged" value={logs.length} icon={Activity} />
                </div>
            </section>

            {/* App Directory Grid */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
                <header className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-955/50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Zap size={17} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-sm font-black text-slate-950 dark:text-white">App Directory & Credentials</h2>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Toggle integrations or configure API credentials and webhook endpoints.</p>
                    </div>
                </header>

                <div className="p-4 sm:p-5">
                    {isLoading ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            {[1, 2, 3, 4].map(item => (
                                <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
                            ))}
                        </div>
                    ) : apps.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                                <Blocks size={24} aria-hidden="true" />
                            </span>
                            <p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">No integrations configured</p>
                            <p className="mt-1 text-xs text-slate-400">Contact your system administrator to enable provider integration modules.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {apps.map(app => (
                                <IntegrationCard
                                    key={app.integration_id}
                                    app={app}
                                    onConfigure={() => setSelectedAppForConfig(app)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Webhook & Delivery Logs Drawer */}
            {showLogsDrawer && (
                <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
                    <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-955/50">
                        <div className="flex items-center gap-2.5">
                            <Activity size={17} className="text-slate-500" />
                            <h2 className="text-sm font-black text-slate-950 dark:text-white">Live Webhook & Delivery Logs</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => refetchLogs()}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={13} /> Refresh Logs
                        </button>
                    </header>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {isLoadingLogs ? (
                            <div className="p-6 text-center text-xs font-medium text-slate-400">Loading delivery logs...</div>
                        ) : logs.length === 0 ? (
                            <div className="p-8 text-center text-xs font-medium text-slate-400">No integration webhook events logged yet.</div>
                        ) : (
                            logs.map(log => (
                                <LogItem key={log.log_id} log={log} onRetried={() => { refetchLogs(); refetchApps(); }} />
                            ))
                        )}
                    </div>
                </section>
            )}

            {/* Security Note */}
            <section className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
                <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">
                    <span className="font-bold text-slate-900 dark:text-slate-200">Security & Encryption Policy: </span>
                    API Keys and Secret Auth Tokens are encrypted using AES-256 before persistence in PostgreSQL. Credentials are never transmitted in plain text or logged in audit trails.
                </p>
            </section>

            {/* Configuration Slide-over / Modal */}
            {selectedAppForConfig && (
                <ConfigModal
                    app={selectedAppForConfig}
                    onClose={() => setSelectedAppForConfig(null)}
                    onUpdated={() => {
                        refetchApps();
                        setSelectedAppForConfig(null);
                    }}
                />
            )}
        </div>
    );
};

const IntegrationCard = ({ app, onConfigure }) => {
    const meta = getProviderMeta(app.provider_name);
    const Icon = meta.icon;
    const [updateIntegration] = useUpdateIntegrationMutation();
    const [testIntegration, { isLoading: isTesting }] = useTestIntegrationMutation();
    const [isProcessing, setIsProcessing] = useState(false);

    const handleToggle = async () => {
        setIsProcessing(true);
        try {
            await updateIntegration({ id: app.integration_id, is_active: !app.is_active }).unwrap();
            if (!app.is_active) toast.success(`${app.provider_name} activated.`);
            else toast(`${app.provider_name} deactivated.`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update integration state.'));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleTestConnection = async () => {
        try {
            const res = await testIntegration(app.integration_id).unwrap();
            toast.success(res.message || `Connection test passed for ${app.provider_name}!`);
        } catch (error) {
            toast.error(getErrorMessage(error, `Failed to connect to ${app.provider_name}.`));
        }
    };

    return (
        <article className={`rounded-2xl border p-4.5 transition-all ${
            app.is_active
                ? 'border-cyan-200/80 bg-cyan-50/30 shadow-sm dark:border-cyan-900/50 dark:bg-cyan-950/20'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30'
        }`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Icon size={20} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-black text-slate-950 dark:text-white">{app.provider_name}</h3>
                            {app.is_active ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <CheckCircle2 size={11} aria-hidden="true" />
                                    Active
                                </span>
                            ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    Inactive
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{meta.category}</p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{meta.desc}</p>
                    </div>
                </div>
                <Toggle checked={app.is_active} onChange={handleToggle} disabled={isProcessing} />
            </div>

            {/* Bottom Actions Row */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span className={`h-2 w-2 rounded-full ${app.has_api_key ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                    <span>{app.has_api_key ? 'Credentials Saved' : 'No Keys Configured'}</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || !app.is_active}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <Send size={12} className={isTesting ? 'animate-pulse' : ''} />
                        {isTesting ? 'Testing...' : 'Test Connection'}
                    </button>

                    <button
                        type="button"
                        onClick={onConfigure}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-cyan-900 active:scale-95 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                    >
                        <Sliders size={12} />
                        Configure
                    </button>
                </div>
            </div>
        </article>
    );
};

const ConfigModal = ({ app, onClose, onUpdated }) => {
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [webhookUrl, setWebhookUrl] = useState(app.webhook_url || '');

    const [showApiKey, setShowApiKey] = useState(false);
    const [showApiSecret, setShowApiSecret] = useState(false);

    const [updateIntegration, { isLoading: isSaving }] = useUpdateIntegrationMutation();
    const [testIntegration, { isLoading: isTesting }] = useTestIntegrationMutation();

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const body = {
                id: app.integration_id,
                webhook_url: webhookUrl
            };
            if (apiKey.trim()) body.api_key = apiKey.trim();
            if (apiSecret.trim()) body.api_secret = apiSecret.trim();

            await updateIntegration(body).unwrap();
            toast.success(`${app.provider_name} settings updated securely.`);
            onUpdated();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save integration credentials.'));
        }
    };

    const handleTest = async () => {
        try {
            const res = await testIntegration(app.integration_id).unwrap();
            toast.success(res.message || `Test connection succeeded for ${app.provider_name}.`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Test connection failed.'));
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                <header className="shrink-0 flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                            <Sliders size={18} />
                        </span>
                        <div>
                            <h3 className="text-base font-black text-slate-950 dark:text-white">
                                Configure {app.provider_name}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Update encrypted API credentials & webhook routing.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                        <X size={18} />
                    </button>
                </header>

                <form onSubmit={handleSave} className="p-6 space-y-4">
                    {/* API Key */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            API Public Key / Client ID
                        </label>
                        <div className="relative">
                            <input
                                type={showApiKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                placeholder={app.has_api_key ? '•••••••••••••••• (Key Configured)' : 'Enter API Key...'}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white pe-10 ps-3.5 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(v => !v)}
                                className="absolute inset-y-0 end-3 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                                {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    {/* API Secret */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            API Secret Token / Auth Secret
                        </label>
                        <div className="relative">
                            <input
                                type={showApiSecret ? 'text' : 'password'}
                                value={apiSecret}
                                onChange={e => setApiSecret(e.target.value)}
                                placeholder={app.has_api_secret ? '•••••••••••••••• (Secret Configured)' : 'Enter API Secret...'}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white pe-10 ps-3.5 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiSecret(v => !v)}
                                className="absolute inset-y-0 end-3 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                                {showApiSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    {/* Webhook URL */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Webhook Callback Endpoint URL
                        </label>
                        <div className="relative">
                            <input
                                type="url"
                                value={webhookUrl}
                                onChange={e => setWebhookUrl(e.target.value)}
                                placeholder="https://api.clinic.com/api/webhooks/provider"
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white ps-3.5 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            />
                        </div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                        Leave credential fields empty if you do not wish to overwrite existing encrypted keys in PostgreSQL database.
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={isTesting}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <Send size={14} className={isTesting ? 'animate-pulse' : ''} />
                            {isTesting ? 'Testing...' : 'Test Connection'}
                        </button>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="h-10 rounded-xl px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-cyan-900 active:scale-95 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                            >
                                {isSaving ? 'Saving Credentials...' : 'Save Credentials'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

const LogItem = ({ log, onRetried }) => {
    const [retryEvent, { isLoading }] = useRetryIntegrationEventMutation();

    const handleRetry = async () => {
        try {
            await retryEvent(log.log_id).unwrap();
            toast.success('Integration event retried successfully.');
            onRetried();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to retry event.'));
        }
    };

    const isSuccess = log.status === 'SUCCESS';

    return (
        <div className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between text-xs">
            <div className="flex items-center gap-3 min-w-0">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isSuccess
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                }`}>
                    {isSuccess ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                </span>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{log.provider_name || 'System'}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {log.event_type}
                        </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {log.response_body || 'No payload log'}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] text-slate-400">{formatRelativeTime(log.created_at)}</span>
                {!isSuccess && (
                    <button
                        type="button"
                        onClick={handleRetry}
                        disabled={isLoading}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                        <RotateCcw size={11} className={isLoading ? 'animate-spin' : ''} />
                        Retry
                    </button>
                )}
            </div>
        </div>
    );
};

const Toggle = ({ checked, onChange, disabled }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-40 ${checked ? 'bg-cyan-600 dark:bg-cyan-500' : 'bg-slate-300 dark:bg-slate-700'}`}
    >
        <span className={`pointer-events-none h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'} mt-1 shadow-sm`} />
    </button>
);

const Metric = ({ label, value, icon: Icon, tone = 'slate' }) => (
    <div className="rounded-xl border border-slate-150/80 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-950/30">
        <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
            <Icon size={14} className="text-slate-400" />
        </div>
        <p className={`mt-1 text-sm font-bold ${
            tone === 'emerald'
                ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30'
                : tone === 'cyan'
                ? 'text-cyan-700 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950/30'
                : 'text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-800'
        } inline-block rounded-md px-2 py-0.5`}>
            {value}
        </p>
    </div>
);

export default IntegrationsSettings;
