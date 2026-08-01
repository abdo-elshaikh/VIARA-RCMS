import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, Clock, Edit3, Mail, MessageSquare, Play, Plus, RefreshCw, RotateCcw, Save, Search, Settings as SettingsIcon, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    useGetNotificationPreferencesQuery,
    useUpdateNotificationPreferencesMutation,
    useGetNotificationTemplatesQuery,
    useCreateNotificationTemplateMutation,
    useUpdateNotificationTemplateMutation,
    useGetNotificationJobsQuery,
    useRetryNotificationJobMutation,
    useProcessNotificationJobsMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';

const NOTIFICATION_EVENT_IDS = [
    'notifyAppointmentCreated',
    'notifyAppointmentReminder',
    'notifyAppointmentRescheduled',
    'notifyAppointmentCancelled',
    'notifyPrepInstructions',
    'notifyPaymentDue',
    'notifyReportReady',
    'notifyResultDelivered',
    'notifyFollowupReminder',
    'notifyMarketing'
];

const inputClass = 'h-10 rounded-lg border border-slate-200/60 bg-white/80 px-3 text-sm font-medium text-slate-850 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-405 dark:border-slate-800/60 dark:bg-slate-900/50 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-800';
const primaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-slate-900 to-slate-955 px-4 text-sm font-semibold text-white transition hover:bg-slate-850 disabled:cursor-not-allowed disabled:opacity-50 dark:from-slate-100 dark:to-white dark:text-slate-950 dark:hover:brightness-110 shadow-sm';
const secondaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-white/80 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800/60 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-800/80';

const CHANNELS = [
    { id: 'emailEnabled', label: 'Email alerts', icon: Mail },
    { id: 'smsEnabled', label: 'SMS alerts', icon: MessageSquare },
    { id: 'whatsappEnabled', label: 'WhatsApp alerts', icon: MessageSquare },
];

const TEMPLATE_CHANNELS = ['Email', 'SMS', 'WhatsApp', 'InApp'];

export const NotificationPreferences = ({ patientId, doctorId }) => {
    const { t } = useTranslation(['settings', 'common']);
    const events = [
        { id: 'notifyAppointmentCreated', label: t('settings.events.notifyAppointmentCreated', 'Appointment created') },
        { id: 'notifyAppointmentReminder', label: t('settings.events.notifyAppointmentReminder', 'Appointment reminder') },
        { id: 'notifyAppointmentRescheduled', label: t('settings.events.notifyAppointmentRescheduled', 'Appointment rescheduled') },
        { id: 'notifyAppointmentCancelled', label: t('settings.events.notifyAppointmentCancelled', 'Appointment cancelled') },
        { id: 'notifyPrepInstructions', label: t('settings.events.notifyPrepInstructions', 'Prep instructions') },
        { id: 'notifyPaymentDue', label: t('settings.events.notifyPaymentDue', 'Payment due') },
        { id: 'notifyReportReady', label: t('settings.events.notifyReportReady', 'Report ready') },
        { id: 'notifyResultDelivered', label: t('settings.events.notifyResultDelivered', 'Result delivered') },
        { id: 'notifyFollowupReminder', label: t('settings.events.notifyFollowupReminder', 'Follow-up reminder') },
        { id: 'notifyMarketing', label: t('settings.events.notifyMarketing', 'Marketing and news') }
    ];

    const owner = patientId ? { patientId } : doctorId ? { doctorId } : null;
    const { data: prefs, isLoading } = useGetNotificationPreferencesQuery(owner || {}, { skip: !owner });
    const [updatePrefs, { isLoading: isUpdating }] = useUpdateNotificationPreferencesMutation();
    const [form, setForm] = useState({});
    const [savedForm, setSavedForm] = useState({});

    useEffect(() => {
        if (!prefs) return;
        const nextForm = {
            emailEnabled: !!prefs.email_enabled,
            smsEnabled: !!prefs.sms_enabled,
            whatsappEnabled: !!prefs.whatsapp_enabled,
            ...Object.fromEntries(NOTIFICATION_EVENT_IDS.map(eventId => {
                const responseKey = eventId.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                return [eventId, !!prefs[responseKey]];
            }))
        };
        setForm(nextForm);
        setSavedForm(nextForm);
    }, [prefs]);

    const handleToggle = key => setForm(current => ({ ...current, [key]: !current[key] }));

    const handleSave = async () => {
        try {
            await updatePrefs({ ...owner, ...form }).unwrap();
            setSavedForm(form);
            toast.success(t('settings.success.prefsSaved', 'Notification preferences saved.'));
        } catch (err) {
            toast.error(getErrorMessage(err, t('settings.errors.prefsSaveFailed', 'Failed to save preferences.')));
        }
    };

    if (isLoading) {
        return <div className="p-6 text-sm font-semibold text-slate-500">{t('common.loading', 'Loading...')}</div>;
    }

    const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

    return (
        <section className="mt-6 rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
            <div className="flex flex-col gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Bell size={18} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('settings.notificationPrefs', 'Notification preferences')}</h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.notificationPrefsDesc', 'Manage approved channels and event reminders.')}</p>
                    </div>
                </div>
                <button type="button" onClick={handleSave} disabled={!isDirty || isUpdating} className={primaryButton}>
                    {isUpdating ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    {isUpdating ? t('common.saving', 'Saving...') : t('settings.savePrefsBtn', 'Save preferences')}
                </button>
            </div>

            <div className="space-y-5 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                    {CHANNELS.map(channel => (
                        <ToggleCard
                            key={channel.id}
                            icon={channel.icon}
                            label={t(`settings.${channel.id}`, channel.label)}
                            checked={!!form[channel.id]}
                            onChange={() => handleToggle(channel.id)}
                        />
                    ))}
                </div>

                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('settings.eventTriggers', 'Event triggers')}</h3>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {events.map(event => (
                            <label key={event.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-white/80 p-3 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/50 dark:hover:border-slate-700 dark:hover:bg-slate-900/80">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{event.label}</span>
                                <input
                                    type="checkbox"
                                    checked={!!form[event.id]}
                                    onChange={() => handleToggle(event.id)}
                                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-800"
                                />
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export const NotificationTemplates = () => {
    const { t } = useTranslation(['settings', 'common']);
    const { data: templates = [], isLoading, isFetching, refetch } = useGetNotificationTemplatesQuery();
    const [createTpl, { isLoading: isCreating }] = useCreateNotificationTemplateMutation();
    const [updateTpl, { isLoading: isUpdating }] = useUpdateNotificationTemplateMutation();
    const [query, setQuery] = useState('');
    const [channelFilter, setChannelFilter] = useState('all');
    const [editor, setEditor] = useState(null);

    const filteredTemplates = useMemo(() => {
        const term = query.trim().toLowerCase();
        return templates.filter(tpl => {
            const channelMatch = channelFilter === 'all' || tpl.channel === channelFilter;
            const text = [tpl.event_type, tpl.channel, tpl.language, tpl.subject, tpl.body].filter(Boolean).join(' ').toLowerCase();
            return channelMatch && (!term || text.includes(term));
        });
    }, [channelFilter, query, templates]);

    const stats = useMemo(() => ({
        total: templates.length,
        active: templates.filter(tpl => tpl.is_active).length,
        channels: new Set(templates.map(tpl => tpl.channel)).size
    }), [templates]);

    const startCreate = () => setEditor({
        mode: 'create',
        eventType: '',
        channel: 'Email',
        language: 'en',
        subject: '',
        body: '',
        isActive: true
    });

    const startEdit = tpl => setEditor({
        mode: 'edit',
        id: tpl.template_id,
        eventType: tpl.event_type,
        channel: tpl.channel,
        language: tpl.language || 'en',
        subject: tpl.subject || '',
        body: tpl.body || '',
        isActive: tpl.is_active
    });

    const saveTemplate = async event => {
        event.preventDefault();
        try {
            if (editor.mode === 'create') {
                await createTpl({
                    eventType: editor.eventType.trim(),
                    channel: editor.channel,
                    language: editor.language.trim() || 'en',
                    subject: editor.channel === 'Email' ? editor.subject.trim() || undefined : undefined,
                    body: editor.body.trim(),
                    isActive: editor.isActive
                }).unwrap();
                toast.success(t('settings.templatesCreated', 'Template created.'));
            } else {
                await updateTpl({
                    id: editor.id,
                    ...(editor.channel === 'Email' ? { subject: editor.subject.trim() || undefined } : {}),
                    body: editor.body.trim(),
                    isActive: editor.isActive
                }).unwrap();
                toast.success(t('settings.templatesSaved', 'Template saved.'));
            }
            setEditor(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.templatesSaveFailed', 'Template could not be saved.')));
        }
    };

    if (isLoading) {
        return <div className="p-6 text-sm font-semibold text-slate-500">{t('common.loading', 'Loading...')}</div>;
    }

    return (
        <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <SettingsIcon size={18} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('settings.templates', 'Notification templates')}</h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.templatesDesc', 'Manage Email, SMS, and WhatsApp message content.')}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={refetch} className={secondaryButton}>
                        <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                        {t('common.refresh', 'Refresh')}
                    </button>
                    <button type="button" onClick={startCreate} className={primaryButton}>
                        <Plus size={16} />
                        {t('settings.newTemplate', 'New template')}
                    </button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Metric label={t('settings.templatesTotal', 'Templates')} value={stats.total} />
                <Metric label={t('settings.templatesActive', 'Active')} value={stats.active} tone="success" />
                <Metric label={t('settings.templatesChannels', 'Channels')} value={stats.channels} />
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                <div className="relative">
                    <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder={t('settings.searchTemplates', 'Search event, subject, or body...')}
                        className={`${inputClass} w-full ps-9 pe-9`}
                    />
                    {query ? (
                        <button type="button" onClick={() => setQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('common.clear', 'Clear')}>
                            <X size={14} />
                        </button>
                    ) : null}
                </div>
                <select value={channelFilter} onChange={event => setChannelFilter(event.target.value)} className={inputClass}>
                    <option value="all">{t('settings.allChannels', 'All channels')}</option>
                    {TEMPLATE_CHANNELS.map(channel => <option key={channel} value={channel}>{channel === 'InApp' ? 'In-app' : channel}</option>)}
                </select>
            </div>

            {editor && (
                <form onSubmit={saveTemplate} className="rounded-xl border border-slate-200/60 bg-slate-50/30 p-4 dark:border-slate-800/60 dark:bg-slate-900/30">
                    <div className="grid gap-3 lg:grid-cols-3">
                        <input value={editor.eventType} onChange={event => setEditor(current => ({ ...current, eventType: event.target.value }))} disabled={editor.mode === 'edit'} required placeholder={t('settings.eventType', 'Event type')} className={inputClass} />
                        <select value={editor.channel} onChange={event => setEditor(current => ({ ...current, channel: event.target.value, subject: event.target.value === 'Email' ? current.subject : '' }))} disabled={editor.mode === 'edit'} className={inputClass}>
                            {TEMPLATE_CHANNELS.map(channel => <option key={channel}>{channel}</option>)}
                        </select>
                        <input value={editor.language} onChange={event => setEditor(current => ({ ...current, language: event.target.value }))} disabled={editor.mode === 'edit'} placeholder="en" className={inputClass} />
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                        {editor.channel === 'Email' ? (
                            <input value={editor.subject} onChange={event => setEditor(current => ({ ...current, subject: event.target.value }))} placeholder={t('settings.subjectPreview', 'Subject')} className={inputClass} />
                        ) : (
                            <div />
                        )}
                        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            <input type="checkbox" checked={!!editor.isActive} onChange={() => setEditor(current => ({ ...current, isActive: !current.isActive }))} />
                            {t('settings.active', 'Active')}
                        </label>
                    </div>
                    <textarea value={editor.body} onChange={event => setEditor(current => ({ ...current, body: event.target.value }))} required rows={5} placeholder={t('settings.bodyTemplate', 'Message body. Use {{patient_name}} style variables.')} className={`${inputClass} mt-3 h-auto min-h-32 w-full py-2 leading-6`} />
                    <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={() => setEditor(null)} className={secondaryButton}>{t('common.cancel', 'Cancel')}</button>
                        <button type="submit" disabled={isCreating || isUpdating} className={primaryButton}>
                            {(isCreating || isUpdating) ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                            {t('common.save', 'Save')}
                        </button>
                    </div>
                </form>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-start text-sm text-slate-600 dark:text-slate-300">
                        <thead className="border-b border-slate-200/60 bg-slate-50/45 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/30 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3 text-start">{t('settings.table.eventType', 'Event type')}</th>
                                <th className="px-4 py-3 text-start">{t('settings.table.channel', 'Channel')}</th>
                                <th className="px-4 py-3 text-start">{t('settings.table.preview', 'Subject / preview')}</th>
                                <th className="px-4 py-3 text-end">{t('settings.table.status', 'Status')}</th>
                                <th className="px-4 py-3 text-end">{t('settings.table.actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {filteredTemplates.map(tpl => (
                                <tr key={tpl.template_id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="px-4 py-4 font-semibold text-slate-800 dark:text-slate-100">{tpl.event_type}</td>
                                    <td className="px-4 py-4"><ChannelBadge channel={tpl.channel} /></td>
                                    <td className="max-w-xs px-4 py-4">
                                        {tpl.channel === 'Email' && <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">{tpl.subject}</span>}
                                        <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" title={tpl.body}>{tpl.body}</div>
                                    </td>
                                    <td className="px-4 py-4 text-end">
                                        <button
                                            type="button"
                                            onClick={() => updateTpl({ id: tpl.template_id, isActive: !tpl.is_active })}
                                            className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition ${tpl.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                                        >
                                            {tpl.is_active ? t('settings.active', 'Active') : t('settings.disabled', 'Disabled')}
                                        </button>
                                    </td>
                                    <td className="px-4 py-4 text-end">
                                        <button type="button" onClick={() => startEdit(tpl)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                                            <Edit3 size={14} />
                                            {t('settings.edit', 'Edit')}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredTemplates.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-sm font-semibold text-slate-400">
                                        {t('settings.noTemplates', 'No notification templates match the current filters.')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export const NotificationJobs = () => {
    const { t } = useTranslation(['settings', 'common']);
    const [statusFilter, setStatusFilter] = useState('Failed');
    const { data: jobs = [], isLoading, isFetching, refetch } = useGetNotificationJobsQuery(
        { status: statusFilter || undefined, limit: 100 },
        { pollingInterval: 60000 }
    );
    const [retryJob] = useRetryNotificationJobMutation();
    const [processJobs, { isLoading: isProcessing }] = useProcessNotificationJobsMutation();

    const deadLetterIds = new Set(
        jobs.filter(j => j.status === 'Failed' && j.retry_count >= j.max_retries).map(j => j.job_id)
    );

    const handleRetry = async (id) => {
        try {
            await retryJob(id).unwrap();
            toast.success(t('settings.jobRetried', 'Job queued for retry.'));
        } catch {
            toast.error(t('settings.jobRetryFailed', 'Retry failed.'));
        }
    };

    const handleProcess = async () => {
        try {
            const r = await processJobs().unwrap();
            toast.success(t('settings.jobsProcessed', `Processed ${r.processed} of ${r.total} jobs.`));
        } catch {
            toast.error(t('settings.jobsProcessFailed', 'Processing failed.'));
        }
    };

    const STATUS_FILTERS = ['', 'Pending', 'Processing', 'Sent', 'Failed', 'Skipped'];

    return (
        <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Clock size={18} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('settings.notificationJobs', 'Notification jobs')}</h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.notificationJobsDesc', 'Monitor and retry queued notification jobs.')}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputClass}>
                        {STATUS_FILTERS.map(s => <option key={s} value={s}>{s || t('settings.allStatuses', 'All statuses')}</option>)}
                    </select>
                    <button type="button" onClick={refetch} className={secondaryButton}>
                        <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                        {t('common.refresh', 'Refresh')}
                    </button>
                    <button type="button" onClick={handleProcess} disabled={isProcessing} className={primaryButton}>
                        {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                        {t('settings.processNow', 'Process now')}
                    </button>
                </div>
            </div>

            {deadLetterIds.size > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-red-200/60 bg-red-50/40 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/20">
                    <AlertTriangle size={16} className="shrink-0 text-red-500 dark:text-red-400" />
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                        {t('settings.deadLetterWarning', `${deadLetterIds.size} dead-letter job(s) — retries exhausted.`)}
                    </p>
                </div>
            )}

            {isLoading ? (
                <div className="py-10 text-center text-sm font-semibold text-slate-400">{t('common.loading', 'Loading...')}</div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-start text-sm text-slate-600 dark:text-slate-300">
                            <thead className="border-b border-slate-200/60 bg-slate-50/45 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/30 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start">{t('settings.table.eventType', 'Event type')}</th>
                                    <th className="px-4 py-3 text-start">{t('settings.table.channel', 'Channel')}</th>
                                    <th className="px-4 py-3 text-start">{t('settings.table.status', 'Status')}</th>
                                    <th className="px-4 py-3 text-start">{t('settings.table.retries', 'Retries')}</th>
                                    <th className="px-4 py-3 text-start">{t('settings.table.scheduled', 'Scheduled')}</th>
                                    <th className="px-4 py-3 text-end">{t('settings.table.actions', 'Actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {jobs.map(job => {
                                    const isDead = deadLetterIds.has(job.job_id);
                                    return (
                                        <tr key={job.job_id} className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isDead ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
                                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{job.event_type}</td>
                                            <td className="px-4 py-3"><ChannelBadge channel={job.channel} /></td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                                    isDead
                                                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                                                        : job.status === 'Sent'
                                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                            : job.status === 'Failed'
                                                                ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300'
                                                                : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                }`}>
                                                    {isDead && <AlertTriangle size={10} />}
                                                    {isDead ? t('settings.deadLetter', 'Dead letter') : job.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{job.retry_count}/{job.max_retries}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{new Date(job.scheduled_for).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-end">
                                                {job.status === 'Failed' && (
                                                    <button type="button" onClick={() => handleRetry(job.job_id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                                                        <RotateCcw size={13} />
                                                        {t('common.retry', 'Retry')}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {jobs.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-slate-400">
                                            {t('settings.noJobs', 'No notification jobs match the current filter.')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

const ToggleCard = ({ icon: Icon, label, checked, onChange }) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-white/80 p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/50 dark:hover:border-slate-700">
        <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Icon size={17} aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
        </span>
        <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-800" />
    </label>
);

const Metric = ({ label, value, tone = 'neutral' }) => (
    <div className={`rounded-xl border p-3 ${tone === 'success' ? 'border-emerald-200/60 bg-emerald-50/30 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200' : 'border-slate-200/60 bg-slate-50/30 text-slate-750 dark:border-slate-800/60 dark:bg-slate-900/30 dark:text-slate-200'}`}>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs font-medium">{label}</p>
    </div>
);

const ChannelBadge = ({ channel }) => {
    const tone = channel === 'Email'
        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300'
        : channel === 'SMS'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
            : 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300';

    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{channel === 'InApp' ? 'In-app' : channel}</span>;
};
