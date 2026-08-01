import React, { useState } from 'react';
import { 
    useGetIntegrationsQuery, 
    useUpdateIntegrationMutation, 
    useGetIntegrationLogsQuery, 
    useRetryIntegrationEventMutation 
} from '../store/api';
import { Network, Settings, Activity, RefreshCw, Key, Link as LinkIcon, Save, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import PageHeader from '../components/ui/PageHeader';

const IntegrationSettings = () => {
    const { t, i18n } = useTranslation('integrations');
    const { data: integrations, isLoading: isIntegrationsLoading } = useGetIntegrationsQuery();
    const { data: logs, isLoading: isLogsLoading } = useGetIntegrationLogsQuery();
    
    const [updateIntegration] = useUpdateIntegrationMutation();
    const [retryEvent, { isLoading: isRetrying }] = useRetryIntegrationEventMutation();

    const [activeTab, setActiveTab] = useState('config'); // 'config' or 'logs'
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

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

    const handleExportAccounting = async () => {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        const url = `${baseUrl}/integrations/export-accounting`;
        toast(t('exporting'), { icon: '⬇️' });
        try {
            await downloadAuthenticatedFile(url, 'accounting-export.csv');
        } catch (error) {
            toast.error(error.message);
        }
    };

    // UI Helper
    const getStatusBadge = (status) => {
        switch (status) {
            case 'Success': return <span className="bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-max"><CheckCircle size={12}/> {t('statuses.Success')}</span>;
            case 'Failed': return <span className="bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-max"><XCircle size={12}/> {t('statuses.Failed')}</span>;
            case 'Retried': return <span className="bg-cyan-100 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-max"><RefreshCw size={12}/> {t('statuses.Retried')}</span>;
            default: return <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 w-max"><Activity size={12}/> {t('statuses.Pending')}</span>;
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <PageHeader
                icon={Network}
                eyebrow={t('tabs.config')}
                title={t('title')}
                description={t('description')}
            />

            {/* Tabs */}
            <div className="flex border-b border-slate-200/60 dark:border-slate-800/60">
                <button 
                    className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === 'config' ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    onClick={() => setActiveTab('config')}
                >
                    <div className="flex items-center gap-2"><Settings size={18} /> {t('tabs.config')}</div>
                </button>
                <button 
                    className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === 'logs' ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    onClick={() => setActiveTab('logs')}
                >
                    <div className="flex items-center gap-2"><Activity size={18} /> {t('tabs.logs')}</div>
                </button>
            </div>

            {/* Content: Configuration */}
            {activeTab === 'config' && (
                <div className="space-y-4">
                    <div className="bg-blue-50/40 border border-blue-200/60 dark:border-blue-900/30 rounded-xl p-4 flex gap-3 text-blue-800 dark:text-blue-300">
                        <AlertCircle className="shrink-0 mt-0.5" size={20} />
                        <div className="text-sm font-medium">
                            <strong>{t('mockNoteLabel')}</strong> {t('mockNote')}
                        </div>
                    </div>

                    {isIntegrationsLoading ? (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400 font-medium">{t('loadingProviders')}</div>
                    ) : (
                        <div className="grid gap-4">
                            {integrations?.map(integration => (
                                <div key={integration.integration_id} className="bg-white/70 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 dark:bg-slate-900/50 rounded-2xl p-5 shadow-sm">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 font-black text-xl">
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
                                                        <Download size={14}/> {t('export')}
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
                                        <div className="bg-slate-50/30 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60 space-y-4 mt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Key size={14}/> {t('apiKey')}</label>
                                                    <input 
                                                        type="text" 
                                                        value={editForm.api_key} 
                                                        onChange={e => setEditForm({...editForm, api_key: e.target.value})} 
                                                        className="input-field w-full rounded-lg border border-slate-200/60 px-3 py-2 text-sm font-mono outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-750 dark:bg-slate-900/60 dark:text-slate-202" 
                                                        placeholder={integration.has_api_key ? t('credentialConfigured', 'Configured — enter to replace') : 'sk_test_...'}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><Key size={14}/> {t('secret')}</label>
                                                    <input 
                                                        type="password" 
                                                        value={editForm.api_secret} 
                                                        onChange={e => setEditForm({...editForm, api_secret: e.target.value})} 
                                                        className="input-field w-full rounded-lg border border-slate-200/60 px-3 py-2 text-sm font-mono outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-750 dark:bg-slate-900/60 dark:text-slate-202" 
                                                        placeholder={integration.has_api_secret ? t('credentialConfigured', 'Configured — enter to replace') : ''}
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"><LinkIcon size={14}/> {t('webhook')}</label>
                                                    <input 
                                                        type="text" 
                                                        value={editForm.webhook_url} 
                                                        onChange={e => setEditForm({...editForm, webhook_url: e.target.value})} 
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
                                                        onChange={e => setEditForm({...editForm, is_active: e.target.checked})}
                                                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                                    />
                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('enable')}</span>
                                                </label>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition">{t('cancel')}</button>
                                                    <button onClick={() => handleSave(integration.integration_id)} className="px-3 py-1.5 text-sm font-bold text-white bg-gradient-to-r from-indigo-650 to-indigo-750 hover:brightness-110 active:scale-[0.98] rounded-lg flex items-center gap-1 transition">
                                                        <Save size={16}/> {t('save')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                            <button 
                                                onClick={() => handleEdit(integration)}
                                                className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
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
                                                {log.status === 'Failed' && (
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
        </div>
    );
};

export default IntegrationSettings;
