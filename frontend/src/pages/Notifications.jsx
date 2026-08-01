import React, { useMemo, useState } from 'react';
import {
    AlertTriangle,
    Bell,
    Check,
    CheckCheck,
    Clock3,
    Copy,
    Filter,
    FilterX,
    Mail,
    MessageSquare,
    RefreshCw,
    Search,
    Send,
    Settings,
    Smartphone,
    X,
    Sparkles,
    Activity
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../store/authSlice';
import {
    useGetNotificationsQuery,
    useMarkAllNotificationsReadMutation,
    useMarkNotificationReadMutation,
    useSendManualNotificationMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import PageHeader from '../components/ui/PageHeader';
import MetricCard from '../components/ui/MetricCard';

const CHANNELS = ['all', 'Email', 'SMS', 'WhatsApp', 'InApp'];
const STATUSES = ['all', 'Sent', 'Delivered', 'Pending', 'Failed'];
const SEND_CHANNELS = ['Email', 'SMS', 'WhatsApp'];
const MANUAL_ROLES = new Set(['Developer', 'Admin', 'Receptionist', 'Marketing']);

const channelIcons = {
    Email: Mail,
    SMS: Smartphone,
    WhatsApp: MessageSquare,
    InApp: Bell
};

const channelStyles = {
    Email: 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border-sky-200/80 dark:border-sky-900/50',
    SMS: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-900/50',
    WhatsApp: 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-200/80 dark:border-green-900/50',
    InApp: 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400 border-cyan-200/80 dark:border-cyan-900/50'
};

const fieldClass = 'h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-100';

export default function Notifications() {
    const { t, i18n } = useTranslation(['system', 'common']);
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const canSendManual = MANUAL_ROLES.has(currentUser?.role);

    const [query, setQuery] = useState('');
    const [channel, setChannel] = useState('all');
    const [status, setStatus] = useState('all');
    const [activeTab, setActiveTab] = useState('all');
    const [expandedId, setExpandedId] = useState(null);
    const [composerOpen, setComposerOpen] = useState(false);
    const [manualForm, setManualForm] = useState({
        recipient: '',
        channel: 'Email',
        subject: '',
        body: ''
    });

    const params = useMemo(() => ({
        limit: 200,
        ...(channel !== 'all' ? { channel } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(query.trim() ? { q: query.trim() } : {})
    }), [channel, query, status]);

    const {
        data,
        isLoading,
        isFetching,
        refetch
    } = useGetNotificationsQuery(params, {
        pollingInterval: 30000,
        refetchOnFocus: true,
        refetchOnReconnect: true
    });

    const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
    const [markRead, { isLoading: markingOne }] = useMarkNotificationReadMutation();
    const [sendManual, { isLoading: sendingManual }] = useSendManualNotificationMutation();

    const notifications = useMemo(() => {
        const items = Array.isArray(data?.items) ? data.items : [];
        const filtered = items.filter((item) => (
            activeTab === 'all' ||
            (activeTab === 'unread' && !item.is_read) ||
            (activeTab === 'failed' && item.status === 'Failed')
        ));

        return [...filtered].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }, [activeTab, data]);

    const counts = useMemo(() => {
        const fallback = {
            all: notifications.length,
            unread: notifications.filter((item) => !item.is_read).length,
            failed: notifications.filter((item) => item.status === 'Failed').length,
            pending: notifications.filter((item) => item.status === 'Pending').length,
            sent: notifications.filter((item) => ['Sent', 'Delivered'].includes(item.status)).length
        };
        return { ...fallback, ...(data?.counts || {}) };
    }, [data, notifications]);

    const grouped = useMemo(() => {
        const buckets = { today: [], yesterday: [], week: [], older: [] };
        notifications.forEach((item) => buckets[getGroupKey(item.created_at)].push(item));
        return Object.entries(buckets).filter(([, items]) => items.length > 0);
    }, [notifications]);

    const handleMarkAll = async () => {
        try {
            await markAllRead().unwrap();
            toast.success(t('notifications.allRead', { defaultValue: 'All notifications marked as read' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('notifications.failed', { defaultValue: 'Action failed' })));
        }
    };

    const handleMarkRead = async (id) => {
        try {
            await markRead(id).unwrap();
            toast.success(t('notifications.read', { defaultValue: 'Notification marked as read' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('notifications.failed', { defaultValue: 'Action failed' })));
        }
    };

    const handleCopy = async (item) => {
        try {
            await navigator.clipboard.writeText([item.subject, item.recipient, item.content].filter(Boolean).join('\n\n'));
            toast.success(t('notifications.copied', { defaultValue: 'Copied to clipboard' }));
        } catch {
            toast.error(t('notifications.copyFailed', { defaultValue: 'Could not copy notification' }));
        }
    };

    const handleSendManual = async (event) => {
        event.preventDefault();
        const recipient = manualForm.recipient.trim();
        const body = manualForm.body.trim();
        if (!recipient || !body) return;

        try {
            await sendManual({
                channel: manualForm.channel,
                body,
                subject: manualForm.channel === 'Email' ? manualForm.subject.trim() || undefined : undefined,
                ...(manualForm.channel === 'Email' ? { recipientEmail: recipient } : { recipientPhone: recipient })
            }).unwrap();
            toast.success(t('notifications.sent', { defaultValue: 'Notification sent' }));
            setManualForm({ recipient: '', channel: 'Email', subject: '', body: '' });
            setComposerOpen(false);
        } catch (error) {
            toast.error(getErrorMessage(error, t('notifications.sendFailed', { defaultValue: 'Could not send notification' })));
        }
    };

    const activeFilterCount = Number(channel !== 'all') + Number(status !== 'all') + Number(Boolean(query.trim()));
    const language = i18n.language;

    return (
        <div className="space-y-5">
            {/* Hero Header */}
            <PageHeader
                icon={Bell}
                eyebrowIcon={Activity}
                eyebrow={t('notifications.managementEyebrow', { defaultValue: 'Operational inbox' })}
                title={t('notifications.managementTitle', { defaultValue: 'Notifications Center' })}
                description={t('notifications.managementDescription', { defaultValue: 'Review message delivery, unread alerts, failed sends, and system notification history from one workspace.' })}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/settings?tab=notifications')}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <Settings size={15} />
                            {t('notifications.settings', { defaultValue: 'Settings' })}
                        </button>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {t('notifications.refresh', { defaultValue: 'Refresh' })}
                        </button>
                        {canSendManual && (
                            <button
                                type="button"
                                onClick={() => setComposerOpen((current) => !current)}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-5 text-xs font-extrabold text-white shadow-md shadow-teal-600/20 transition hover:scale-[1.02] active:scale-95"
                            >
                                <Send size={15} />
                                {t('notifications.manual', { defaultValue: 'Send Notification' })}
                            </button>
                        )}
                    </div>
                }
            />

            {/* Metric Summary Cards */}
            <section className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
                <MetricCard tone="slate" label={t('notifications.tabs.all', { defaultValue: 'All Notifications' })} value={formatNumber(counts.all || 0, language)} detail={t('notifications.metrics.total', { defaultValue: 'Total logged notifications' })} />
                <MetricCard tone="cyan" label={t('notifications.tabs.unread', { defaultValue: 'Unread Alerts' })} value={formatNumber(counts.unread || 0, language)} detail={t('notifications.metrics.unread', { defaultValue: 'Requires team review' })} />
                <MetricCard tone="rose" label={t('notifications.tabs.failed', { defaultValue: 'Failed Sends' })} value={formatNumber(counts.failed || 0, language)} detail={t('notifications.metrics.failed', { defaultValue: 'Delivery errors' })} />
                <MetricCard tone="amber" label={t('notifications.status.Pending', { defaultValue: 'Pending Queue' })} value={formatNumber(counts.pending || 0, language)} detail={t('notifications.metrics.pending', { defaultValue: 'Queued for delivery' })} />
                <MetricCard tone="emerald" label={t('notifications.status.Sent', { defaultValue: 'Sent & Delivered' })} value={formatNumber(counts.sent || 0, language)} detail={t('notifications.metrics.sent', { defaultValue: 'Successfully dispatched' })} />
            </section>

            {/* Manual Composer Panel */}
            {composerOpen && canSendManual && (
                <form onSubmit={handleSendManual} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-xs backdrop-blur-2xl dark:border-slate-800/80 dark:bg-[#070e1a] animate-in slide-in-from-top-2 duration-200">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400">
                                <Send size={16} />
                            </span>
                            <div>
                                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">{t('notifications.composeTitle', { defaultValue: 'New Notification' })}</h2>
                                <p className="text-[11px] font-semibold text-slate-400">{t('notifications.composeHint', { defaultValue: 'Send a direct message through the selected channel.' })}</p>
                            </div>
                        </div>
                        <button type="button" onClick={() => setComposerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                        <input
                            value={manualForm.recipient}
                            onChange={(event) => setManualForm((current) => ({ ...current, recipient: event.target.value }))}
                            required
                            type={manualForm.channel === 'Email' ? 'email' : 'tel'}
                            placeholder={manualForm.channel === 'Email' ? t('notifications.recipientEmail', { defaultValue: 'Recipient email address' }) : t('notifications.recipientPhone', { defaultValue: 'Recipient phone number' })}
                            className={fieldClass}
                        />
                        <select
                            value={manualForm.channel}
                            onChange={(event) => setManualForm((current) => ({ ...current, channel: event.target.value, subject: event.target.value === 'Email' ? current.subject : '' }))}
                            className={fieldClass}
                        >
                            {SEND_CHANNELS.map((item) => (
                                <option key={item} value={item}>
                                    {t(`notifications.channels.${item}`, { defaultValue: item })}
                                </option>
                            ))}
                        </select>
                    </div>

                    {manualForm.channel === 'Email' && (
                        <input
                            value={manualForm.subject}
                            onChange={(event) => setManualForm((current) => ({ ...current, subject: event.target.value }))}
                            placeholder={t('notifications.subject', { defaultValue: 'Subject (optional)' })}
                            className={`${fieldClass} mt-3 w-full`}
                        />
                    )}

                    <textarea
                        value={manualForm.body}
                        onChange={(event) => setManualForm((current) => ({ ...current, body: event.target.value }))}
                        required
                        rows={3}
                        maxLength={2000}
                        placeholder={t('notifications.message', { defaultValue: 'Message body...' })}
                        className={`${fieldClass} mt-3 h-auto min-h-24 w-full py-3 leading-6`}
                    />

                    <div className="mt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={sendingManual || !manualForm.recipient.trim() || !manualForm.body.trim()}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-6 text-xs font-extrabold text-white shadow-md shadow-teal-600/20 transition hover:scale-[1.01] active:scale-95 disabled:opacity-40"
                        >
                            {sendingManual ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                            {sendingManual ? t('notifications.sending', { defaultValue: 'Sending...' }) : t('notifications.send', { defaultValue: 'Send Notification' })}
                        </button>
                    </div>
                </form>
            )}

            {/* Filter & Notification List Workbench */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-2xl dark:border-slate-800/80 dark:bg-[#070e1a]">
                {/* Search and Filters Bar */}
                <div className="border-b border-slate-100 dark:border-slate-800/80 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                        <div className="relative">
                            <Search size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t('notifications.search', { defaultValue: 'Search notifications...' })}
                                className={`${fieldClass} w-full ps-10 pe-9`}
                            />
                            {query && (
                                <button type="button" onClick={() => setQuery('')} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700 transition">
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <select value={channel} onChange={(event) => setChannel(event.target.value)} className={fieldClass}>
                            {CHANNELS.map((item) => (
                                <option key={item} value={item}>
                                    {item === 'all' ? t('notifications.channels.all', { defaultValue: 'All channels' }) : t(`notifications.channels.${item}`, { defaultValue: item })}
                                </option>
                            ))}
                        </select>

                        <select value={status} onChange={(event) => setStatus(event.target.value)} className={fieldClass}>
                            {STATUSES.map((item) => (
                                <option key={item} value={item}>
                                    {item === 'all' ? t('notifications.status.all', { defaultValue: 'All statuses' }) : t(`notifications.status.${item}`, { defaultValue: item })}
                                </option>
                            ))}
                        </select>

                        <div className="flex items-center gap-2">
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { setQuery(''); setChannel('all'); setStatus('all'); }}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-slate-800 dark:bg-[#0b1426] dark:hover:bg-rose-950/30"
                                >
                                    <FilterX size={14} />
                                    {t('notifications.filters.reset', { defaultValue: 'Reset filters' })}
                                </button>
                            )}
                            {(counts.unread || 0) > 0 && (
                                <button
                                    type="button"
                                    onClick={handleMarkAll}
                                    disabled={markingAll}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-500/10 border border-teal-200/80 px-4 text-xs font-extrabold text-teal-700 transition hover:bg-teal-600 hover:text-white disabled:opacity-50 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-600"
                                >
                                    {markingAll ? <RefreshCw size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                                    {t('notifications.markRead', { defaultValue: 'Mark all as read' })}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Category Filter Pills */}
                    <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-900">
                        {['all', 'unread', 'failed'].map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all ${
                                    activeTab === tab
                                        ? 'bg-white text-teal-800 shadow-2xs dark:bg-[#0b1426] dark:text-teal-300'
                                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                                }`}
                            >
                                {t(`notifications.tabs.${tab}`, { defaultValue: tab.charAt(0).toUpperCase() + tab.slice(1) })}
                                {Number(counts[tab]) > 0 && (
                                    <span className="ms-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-black tabular-nums">
                                        {formatNumber(counts[tab], language)}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {data?.searchLimited && (
                    <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <span>
                            {t('notifications.searchLimited', {
                                defaultValue: `Search scanned the latest ${data.searchScanLimit || 1000} visible notifications. Narrow the filters or date range for older matches.`
                            })}
                        </span>
                    </div>
                )}

                {/* Notifications Log List */}
                <div className="min-h-[440px] bg-slate-50/40 p-4 dark:bg-[#070e1a]">
                    {isLoading ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-slate-400">
                            <RefreshCw size={24} className="animate-spin text-teal-600" />
                            <p className="mt-3 text-xs font-extrabold text-slate-500">{t('notifications.loading', { defaultValue: 'Loading notifications...' })}</p>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-center p-8">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 mb-3">
                                <Bell size={24} />
                            </div>
                            <p className="text-sm font-extrabold text-slate-800 dark:text-white">{t('notifications.emptyTitle', { defaultValue: 'No notifications found' })}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400 max-w-sm">{t('notifications.empty.filtered', { defaultValue: 'No notifications match the current search or filters.' })}</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {grouped.map(([groupKey, items]) => (
                                <section key={groupKey} className="space-y-2.5">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                                        <Clock3 size={12} className="text-teal-600 dark:text-teal-400" />
                                        <span>{t(`notifications.groups.${groupKey}`, { defaultValue: groupKey })}</span>
                                        <span className="ms-auto rounded-full bg-slate-200/80 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400 tabular-nums">
                                            {formatNumber(items.length, language)}
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {items.map((item) => (
                                            <NotificationRow
                                                key={item.notification_id}
                                                item={item}
                                                expanded={expandedId === item.notification_id}
                                                onToggle={() => setExpandedId((current) => current === item.notification_id ? null : item.notification_id)}
                                                onMarkRead={handleMarkRead}
                                                onCopy={handleCopy}
                                                marking={markingOne}
                                                language={language}
                                                t={t}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

const NotificationRow = ({ item, expanded, onToggle, onMarkRead, onCopy, marking, language, t }) => {
    const ChannelIcon = channelIcons[item.channel] || Bell;
    const title = item.subject || item.event_type || item.channel;
    const statusClass = getStatusClass(item.status);
    const badgeStyle = channelStyles[item.channel] || channelStyles.InApp;

    return (
        <article className={`overflow-hidden rounded-xl border bg-white p-3.5 transition-all duration-150 dark:bg-[#0b1426] ${
            item.is_read
                ? 'border-slate-200/80 dark:border-slate-800'
                : 'border-teal-400/80 ring-1 ring-teal-400/30 dark:border-teal-500/60 dark:ring-teal-500/20'
        }`}>
            <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${badgeStyle}`}>
                    <ChannelIcon size={16} />
                </span>
                <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-start outline-none">
                    <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                            {!item.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" />}
                            <span className="truncate text-xs font-black text-slate-900 dark:text-white">{title}</span>
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass}`}>
                            {t(`notifications.status.${item.status}`, { defaultValue: item.status })}
                        </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                        <span className="text-teal-700 dark:text-teal-400 font-bold">{t(`notifications.channels.${item.channel}`, { defaultValue: item.channel })}</span>
                        <span>•</span>
                        <span>{formatDate(item.created_at, language)}</span>
                        {item.recipient && (
                            <>
                                <span>•</span>
                                <span className="max-w-[240px] truncate text-slate-600 dark:text-slate-300 font-mono">{item.recipient}</span>
                            </>
                        )}
                        {item.patient_mrn && (
                            <>
                                <span>•</span>
                                <span dir="ltr" className="font-mono text-teal-600 dark:text-teal-400 font-bold">MRN {item.patient_mrn}</span>
                            </>
                        )}
                    </span>
                    {item.content && !expanded && (
                        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{item.content}</p>
                    )}
                </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2.5 ps-12">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onCopy(item)}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                        <Copy size={12} />
                        {t('notifications.copy', { defaultValue: 'Copy' })}
                    </button>
                    {!item.is_read && (
                        <button
                            type="button"
                            onClick={() => onMarkRead(item.notification_id)}
                            disabled={marking}
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-teal-500/10 border border-teal-200/80 px-2.5 text-[10px] font-extrabold text-teal-700 transition hover:bg-teal-600 hover:text-white disabled:opacity-50 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-300"
                        >
                            <Check size={12} />
                            {t('notifications.markSingle', { defaultValue: 'Mark read' })}
                        </button>
                    )}
                </div>
            </div>

            {expanded && (
                <div className="mt-3 space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300 sm:ms-12">
                    {item.content && <p className="whitespace-pre-wrap font-semibold">{item.content}</p>}
                    {item.event_type && <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('notifications.eventType', { defaultValue: 'Event type' })}: {item.event_type}</p>}
                    {item.status === 'Failed' && item.error_message && (
                        <div className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/80 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-500" />
                            <span>{item.error_message}</span>
                        </div>
                    )}
                </div>
            )}
        </article>
    );
};

const getStatusClass = (status) => {
    if (status === 'Failed') return 'border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300';
    if (status === 'Pending') return 'border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
    if (status === 'Sent' || status === 'Delivered') return 'border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300';
};

const getGroupKey = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'older';
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startItem = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.round((startToday - startItem) / 86400000);
    if (daysAgo <= 0) return 'today';
    if (daysAgo === 1) return 'yesterday';
    if (daysAgo < 7) return 'week';
    return 'older';
};

const formatDate = (value, language) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(language?.startsWith('ar') ? 'ar-EG' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const formatNumber = (value, language) => {
    return new Intl.NumberFormat(language?.startsWith('ar') ? 'ar-EG' : 'en-US').format(Number(value) || 0);
};
