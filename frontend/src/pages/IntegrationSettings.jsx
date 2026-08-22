import React, { useState } from 'react';
import {
    useGetIntegrationsQuery,
    useUpdateIntegrationMutation,
    useTestIntegrationMutation,
    useGetIntegrationLogsQuery,
    useRetryIntegrationEventMutation,
    useGetDeadLetterEventsQuery,
    useRetryDeadLetterEventMutation
} from '../store/api';
import { Network, Settings, Activity, RefreshCw, Key, Link as LinkIcon, Save, CheckCircle, XCircle, AlertCircle, Download, RotateCcw, Send, BookOpen, FlaskConical, ListChecks, ExternalLink, Search, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import { formatRelativeTime } from '../utils/dateFormat';
import PageHeader from '../components/ui/PageHeader';

const IntegrationSettings = () => {
    const { t, i18n } = useTranslation('integrations');
    const { data: integrations, isLoading: isIntegrationsLoading } = useGetIntegrationsQuery();
    const { data: logs, isLoading: isLogsLoading } = useGetIntegrationLogsQuery();
    const { data: deadLetters = [], isLoading: isDeadLettersLoading, refetch: refetchDeadLetters } = useGetDeadLetterEventsQuery();

    const [updateIntegration] = useUpdateIntegrationMutation();
    const [testIntegration, { isLoading: isTesting }] = useTestIntegrationMutation();
    const [retryEvent, { isLoading: isRetrying }] = useRetryIntegrationEventMutation();
    const [retryDeadLetter, { isLoading: isRequeuing }] = useRetryDeadLetterEventMutation();

    const [activeTab, setActiveTab] = useState('config'); // 'config', 'logs', or 'dead-letter'
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    const [showGuide, setShowGuide] = useState(false);
    const [deadLetterSearch, setDeadLetterSearch] = useState('');
    const [deadLetterFilter, setDeadLetterFilter] = useState('all');

    const providerGuide = (name) => {
        const key = String(name || '').trim().toLowerCase();
        if (key.includes('stripe')) return { env: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], steps: ['Create a Stripe account', 'Add publishable and secret keys', 'Configure webhook endpoint', 'Enable payment_intent events'], docs: 'https://docs.stripe.com/connect' };
        if (key.includes('twilio') || key.includes('sms')) return { env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'], steps: ['Create a Twilio project', 'Copy Account SID and Auth Token', 'Buy or verify a sending number', 'Set status callback URL'], docs: 'https://www.twilio.com/docs/sms' };
        if (key.includes('whatsapp')) return { env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'], steps: ['Enable WhatsApp in Twilio console', 'Use the same Twilio credentials', 'Set the WhatsApp sender number', 'Configure delivery callback URL'], docs: 'https://www.twilio.com/docs/whatsapp' };
        if (key.includes('quickbooks')) return { env: ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET', 'QUICKBOOKS_REDIRECT_URI'], steps: ['Create an Intuit Developer app', 'Enable QuickBooks Online scope', 'Add redirect URI in developer portal', 'Paste client ID and secret here'], docs: 'https://developer.intuit.com/app/developer/qbo/docs/api' };
        if (key.includes('pacs') || key.includes('orthanc')) return { env: ['ORTHANC_URL', 'ORTHANC_API_USER', 'ORTHANC_API_PASSWORD'], steps: ['Deploy Orthanc server', 'Enable REST API and DICOMweb', 'Create API user and password', 'Set webhook callback for PACS events'], docs: 'https://orthanc.uclouvain.be/book/' };
        return { env: ['PROVIDER_API_KEY', 'PROVIDER_API_SECRET', 'PROVIDER_WEBHOOK_URL'], steps: ['Create provider account', 'Generate API credentials', 'Configure callback URL', 'Test connection from this page'], docs: null };
    };

    const handleEdit = (integration) => {
        setEditingId(integration.integration_id);
        setEditForm({
            api_key: '',
            api_secret: '',
            webhook_url: integration.webhook_url || '',
            is_active: integration.is_active
        });
    };

    const handleSave = async (id) => {
        try {
            const payload = { id, webhook_url: editForm.webhook_url, is_active: editForm.is_active };
            if (editForm.api_key?.trim()) payload.api_key = editForm.api_key.trim();
            if (editForm.api_secret?.trim()) payload.api_secret = editForm.api_secret.trim();
            await updateIntegration(payload).unwrap();
            toast.success(t('updated'));
            setEditingId(null);
        } catch (error) {
            toast.error(error?.data?.error || t('updateError'));
        }
    };

    const handleRetry = async (logId) => {
        try {
            await retryEvent(logId).unwrap();
            toast.success(t('retried'));
        } catch (error) {
            toast.error(error?.data?.error || t('retryError'));
        }
    };

    const handleTest = async (integrationId, providerName) => {
        try {
            const result = await testIntegration(integrationId).unwrap();
            if (String(result.status || '').toUpperCase() === 'UNHEALTHY') {
                throw new Error(result.message || `${providerName} health check failed`);
            }
            toast.success(result.message || `${providerName} connection is healthy.`);
        } catch (error) {
            toast.error(error?.data?.error || error.message || `Unable to test ${providerName}.`);
        }
    };

    const handleExportAccounting = async () => {
        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const url = `${baseUrl}/integrations/export-accounting`;
        toast(t('exporting', { defaultValue: 'Exporting accounting records...' }), { icon: '⬇️' });
        try {
            await downloadAuthenticatedFile(url, 'accounting-export.csv');
        } catch (error) {
            toast.error(error.message);
        }
    };

    // UI Helper
    const getStatusBadge = (status) => {
        switch (String(status || '').toLowerCase()) {
            case 'success': return <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><CheckCircle size={13} /> {t('statuses.Success', { defaultValue: 'Success' })}</span>;
            case 'failed': return <span className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><XCircle size={13} /> {t('statuses.Failed', { defaultValue: 'Failed' })}</span>;
            case 'retried': return <span className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><RefreshCw size={13} /> {t('statuses.Retried', { defaultValue: 'Retried' })}</span>;
            default: return <span className="bg-slate-100/80 text-slate-700 dark:text-slate-300 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 w-max"><Activity size={13} /> {t('statuses.Pending', { defaultValue: 'Pending' })}</span>;
        }
    };

    // Telemetry Facts
    const totalProviders = integrations?.length || 0;
    const activeProviders = integrations?.filter(i => i.is_active)?.length || 0;
    const totalLogs = logs?.length || 0;
    const deadLetterCount = deadLetters?.length || 0;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* VIARA Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Network size={26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                <LinkIcon size={11} />
                                <span>External Connectors & Webhooks</span>
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
                            <span>{showGuide ? 'Hide Setup Guide' : 'Setup Checklist'}</span>
                        </button>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-100/80 px-4 py-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Network size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Connectors</p>
                            <p className="font-mono text-base font-black text-slate-900 dark:text-white">{totalProviders}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-emerald-700 dark:text-emerald-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">Active & Syncing</p>
                            <p className="font-mono text-base font-black text-emerald-900 dark:text-white">{activeProviders}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-sky-700 dark:text-sky-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Activity size={16} className="text-sky-600 dark:text-sky-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">Event Logs</p>
                            <p className="font-mono text-base font-black text-sky-900 dark:text-white">{totalLogs}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-amber-700 dark:text-amber-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">Dead-Letter Queue</p>
                            <p className="font-mono text-base font-black text-amber-900 dark:text-white">{deadLetterCount}</p>
                        </div>
                    </div>
                </div>

                {showGuide && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                        <GuideCard name="Stripe" items={['Create Stripe account', 'Add publishable and secret keys', 'Set webhook endpoint', 'Enable payment_intent events']} envs={['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']} docs="https://docs.stripe.com/connect" />
                        <GuideCard name="Twilio" items={['Create Twilio project', 'Copy Account SID and Auth Token', 'Buy or verify a sending number', 'Set status callback URL']} envs={['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']} docs="https://www.twilio.com/docs/sms" />
                        <GuideCard name="WhatsApp" items={['Enable WhatsApp in Twilio console', 'Use the same Twilio credentials', 'Set the WhatsApp sender number', 'Configure delivery callback URL']} envs={['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']} docs="https://www.twilio.com/docs/whatsapp" />
                        <GuideCard name="QuickBooks" items={['Create an Intuit Developer app', 'Enable QuickBooks Online scope', 'Add redirect URI in developer portal', 'Paste client ID and secret here']} envs={['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET', 'QUICKBOOKS_REDIRECT_URI']} docs="https://developer.intuit.com/app/developer/qbo/docs/api" />
                        <GuideCard name="PACS / Orthanc" items={['Deploy Orthanc server', 'Enable REST API and DICOMweb', 'Create API user and password', 'Set webhook callback for PACS events']} envs={['ORTHANC_URL', 'ORTHANC_API_USER', 'ORTHANC_API_PASSWORD']} docs="https://orthanc.uclouvain.be/book/" />
                    </div>
                )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 w-fit">
                <button
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${activeTab === 'config' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    onClick={() => setActiveTab('config')}
                >
                    <Settings size={14} /> {t('tabs.config', { defaultValue: 'Providers Configuration' })}
                </button>
                <button
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${activeTab === 'logs' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    onClick={() => setActiveTab('logs')}
                >
                    <Activity size={14} /> {t('tabs.logs', { defaultValue: 'Activity Logs' })}
                </button>
                <button
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${activeTab === 'dead-letter' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    onClick={() => { setActiveTab('dead-letter'); refetchDeadLetters(); }}
                >
                    <AlertCircle size={14} />
                    <span>{t('deadLetterTitle', 'Dead-letter Queue')}</span>
                    {deadLetterCount > 0 && (
                        <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-black text-amber-800 dark:text-amber-300">
                            {deadLetterCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Content: Configuration */}
            {activeTab === 'config' && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 flex items-start gap-3 text-sky-900 dark:text-sky-200">
                        <AlertCircle className="shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" size={18} />
                        <div className="text-xs font-medium">
                            <strong className="font-bold">{t('mockNoteLabel', { defaultValue: 'Enterprise Security Note:' })}</strong> {t('mockNote', { defaultValue: 'API secrets and webhook tokens are encrypted at rest with AES-256-GCM. Live credentials are never logged.' })}
                        </div>
                    </div>

                    {isIntegrationsLoading ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 font-medium">{t('loadingProviders')}</div>
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
                                                {integration.provider_name === 'QuickBooks' && (
                                                    <button
                                                        onClick={handleExportAccounting}
                                                        className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20 hover:bg-emerald-200 dark:hover:bg-emerald-900/40 px-2 py-1 rounded transition"
                                                    >
                                                        <Download size={14} /> {t('export')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${integration.is_active ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                                {integration.is_active ? t('active') : t('disabled')}
                                            </span>
                                        </div>
                                    </div>

                                    {editingId === integration.integration_id ? (
                                        <div className="bg-slate-50/50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-4 mt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Key size={14} /> {t('apiKey')}</label>
                                                    <input
                                                        type="text"
                                                        value={editForm.api_key}
                                                        onChange={e => setEditForm({ ...editForm, api_key: e.target.value })}
                                                        className="input-field w-full rounded-lg border border-slate-200/60 px-3 py-2 text-sm font-mono outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-750 dark:bg-slate-900/60 dark:text-slate-202"
                                                        placeholder={integration.has_api_key ? t('credentialConfigured', 'Configured — enter to replace') : 'sk_test_...'}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Key size={14} /> {t('secret')}</label>
                                                    <input
                                                        type="password"
                                                        value={editForm.api_secret}
                                                        onChange={e => setEditForm({ ...editForm, api_secret: e.target.value })}
                                                        className="input-field w-full rounded-lg border border-slate-200/60 px-3 py-2 text-sm font-mono outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-750 dark:bg-slate-900/60 dark:text-slate-202"
                                                        placeholder={integration.has_api_secret ? t('credentialConfigured', 'Configured — enter to replace') : ''}
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><LinkIcon size={14} /> {t('webhook')}</label>
                                                    <input
                                                        type="text"
                                                        value={editForm.webhook_url}
                                                        onChange={e => setEditForm({ ...editForm, webhook_url: e.target.value })}
                                                        className="input-field w-full rounded-lg border border-slate-200/60 px-3 py-2 text-sm font-mono outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-750 dark:bg-slate-900/60 dark:text-slate-202"
                                                        placeholder="https://"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={editForm.is_active}
                                                        onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                                                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                                    />
                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('enable')}</span>
                                                </label>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition">{t('cancel')}</button>
                                                    <button onClick={() => handleSave(integration.integration_id)} className="px-3 py-1.5 text-sm font-bold text-white bg-gradient-to-r from-indigo-650 to-indigo-750 hover:brightness-110 active:scale-[0.98] rounded-lg flex items-center gap-1 transition">
                                                        <Save size={16} /> {t('save')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                                            <button
                                                type="button"
                                                onClick={() => handleTest(integration.integration_id, integration.provider_name)}
                                                disabled={!integration.is_active || isTesting}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                            >
                                                <Send size={13} className={isTesting ? 'animate-pulse' : ''} />
                                                {isTesting ? 'Testing...' : 'Test connection'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleEdit(integration)}
                                                className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                                            >
                                                <Settings size={16} /> {t('configure')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Content: Logs */}
            {activeTab === 'logs' && (
                <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/50 rounded-2xl shadow-sm overflow-hidden">
                    {isLogsLoading ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 font-medium">{t('loadingLogs')}</div>
                    ) : logs?.length === 0 ? (
                        <div className="text-center py-16 bg-slate-50 dark:bg-slate-900/50">
                            <Activity size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">{t('emptyTitle')}</h3>
                            <p className="text-slate-500 dark:text-slate-400">{t('emptyDescription')}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-start text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">{t('table.date')}</th>
                                        <th className="px-4 py-3 font-bold">{t('table.provider')}</th>
                                        <th className="px-4 py-3 font-bold">{t('table.event')}</th>
                                        <th className="px-4 py-3 font-bold">{t('table.status')}</th>
                                        <th className="px-4 py-3 font-bold">{t('table.details')}</th>
                                        <th className="px-4 py-3 font-bold text-end">{t('table.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {logs?.map(log => (
                                        <tr key={log.log_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                                {new Date(log.created_at).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB')}
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
                                                <div className="truncate max-w-xs" title={JSON.stringify(log.payload)}>
                                                    {JSON.stringify(log.payload)}
                                                </div>
                                                {log.error_message && <div className="text-red-500 dark:text-red-400 mt-1 truncate max-w-xs">{log.error_message}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-end">
                                                {String(log.status || '').toLowerCase() === 'failed' && (
                                                    <button
                                                        onClick={() => handleRetry(log.log_id)}
                                                        disabled={isRetrying}
                                                        className="ms-auto flex items-center justify-end gap-1 rounded-lg p-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-400 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20"
                                                        title={t('retryTitle')}
                                                    >
                                                        <RefreshCw size={14} className={isRetrying ? "animate-spin" : ""} /> {t('retry')}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
            {/* Content: Dead-letter queue */}
            {activeTab === 'dead-letter' && (
                <div className="bg-white/70 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/50 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-sm font-black text-slate-950 dark:text-white">{t('deadLetterTitle', 'Dead-letter queue')}</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('deadLetterDescription', 'Events that exhausted all retry attempts. Review and manually retry if needed.')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder={t('search', 'Search dead letters...')}
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
                                <option value="all">{t('allStatuses', 'All')}</option>
                                <option value="payment">Payment</option>
                                <option value="sms">SMS</option>
                                <option value="whatsapp">WhatsApp</option>
                            </select>
                        </div>
                    </div>
                    {isDeadLettersLoading ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 font-medium">{t('loadingLogs')}</div>
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
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('emptyTitle', 'No outbound events yet')}</p>
                                    <p className="text-xs text-slate-400 mt-1">{query ? t('searchClear', 'Try clearing your search') : t('emptyDescription', 'Integration logs will appear here when an event is triggered.')}</p>
                                    {query && (
                                        <button type="button" onClick={() => setDeadLetterSearch('')} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                            <RotateCcw size={12} /> {t('retry', 'Retry')}
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
                                            <th className="px-4 py-3 font-bold">{t('table.date')}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.provider')}</th>
                                            <th className="px-4 py-3 font-bold">{t('table.event')}</th>
                                            <th className="px-4 py-3 font-bold">Retries</th>
                                            <th className="px-4 py-3 font-bold">Reason</th>
                                            <th className="px-4 py-3 font-bold text-end">{t('table.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filtered.map(log => (
                                            <tr key={log.log_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
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
                                                            onClick={async () => {
                                                                try {
                                                                    await retryEvent(log.log_id).unwrap();
                                                                    toast.success(t('retried'));
                                                                    refetchDeadLetters();
                                                                } catch (error) {
                                                                    toast.error(error?.data?.error || t('retryError'));
                                                                }
                                                            }}
                                                            disabled={isRetrying}
                                                            className="inline-flex items-center gap-1 rounded-lg p-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-400 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20"
                                                            title={t('retryTitle')}
                                                        >
                                                            <RefreshCw size={13} className={isRetrying ? "animate-spin" : ""} /> {t('retry')}
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await retryDeadLetter(log.log_id).unwrap();
                                                                    toast.success(t('requeueSuccess'));
                                                                    refetchDeadLetters();
                                                                } catch (error) {
                                                                    toast.error(error?.data?.error || t('requeueError'));
                                                                }
                                                            }}
                                                            disabled={isRequeuing}
                                                            className="inline-flex items-center gap-1 rounded-lg p-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                                            title={t('requeueTitle', 'Move back to pending queue')}
                                                        >
                                                            <RotateCcw size={13} className={isRequeuing ? "animate-spin" : ""} /> {t('requeue')}
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
        </div>
    );
};

const GuideCard = ({ name, items, envs, docs }) => (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/30">
        <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-slate-950 dark:text-white">{name}</h4>
            {docs && <a href={docs} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1">Docs <ExternalLink size={11} /></a>}
        </div>
        <ol className="mt-3 list-decimal list-inside space-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {items.map((step, idx) => <li key={idx}>{step}</li>)}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
            {envs.map(env => <span key={env} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{env}</span>)}
        </div>
    </div>
);

export default IntegrationSettings;
