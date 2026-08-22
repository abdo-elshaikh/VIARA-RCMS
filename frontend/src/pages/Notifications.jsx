import React, { useMemo, useState, useEffect } from 'react';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Bell,
    Check,
    CheckCheck,
    Clock,
    Clock3,
    Copy,
    Filter,
    FilterX,
    Mail,
    MessageSquare,
    Phone,
    RefreshCw,
    Search,
    Send,
    Settings,
    Smartphone,
    Sparkles,
    User,
    X,
    Zap,
    ExternalLink
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
import Pagination from '../components/ui/Pagination';
import { getPaginationState } from '../utils/pagination';

const CHANNELS = ['all', 'Email', 'SMS', 'WhatsApp', 'InApp'];
const STATUSES = ['all', 'Sent', 'Delivered', 'Pending', 'Failed'];
const SEND_CHANNELS = ['Email', 'SMS', 'WhatsApp'];
const MANUAL_ROLES = new Set(['Developer', 'Admin']);

const ar = {
    eyebrow: 'مركز الرسائل والتنبيهات السريرية',
    title: 'مركز الإشعارات والتواصل',
    description: 'متابعة سجل إرسال الرسائل والتنبيهات، الرسائل غير المقروءة، حالات الفشل، وإرسال تنبيهات مباشرة للمرضى والأطباء.',
    all: 'جميع الإشعارات',
    unread: 'تنبيهات غير مقروءة',
    failed: 'تعذر الإرسال',
    pending: 'قيد الإرسال',
    sent: 'تم التسليم بنجاح',
    markAllRead: 'تحديد الكل كمقروء',
    markRead: 'تحديد كمقروء',
    composeTitle: 'إرسال إشعار مباشر جديد',
    composeHint: 'اختر القناة المناسبة واكتب نص الرسالة أو اختر قالباً جاهزاً.',
    recipient: 'المستلم (البريد الإلكتروني أو الهاتف)',
    channel: 'قناة الإرسال',
    subject: 'عنوان الإشعار (اختياري)',
    message: 'نص الرسالة...',
    send: 'إرسال الإشعار',
    sending: 'جاري الإرسال...',
    copied: 'تم النسخ إلى الحافظة',
    copy: 'نسخ المحتوى',
    templates: 'قوالب سريرية سريعة',
    tplReminder: 'تذكير بالموعد',
    tplReady: 'التقرير جاهز للاستلام',
    tplPrep: 'تعليمات التحضير للفحص',
    tplPayment: 'تأكيد السداد',
    today: 'اليوم',
    yesterday: 'أمس',
    week: 'هذا الأسبوع',
    older: 'أقدم من ذلك',
    settings: 'إعدادات الإشعارات',
    refresh: 'تحديث السجل'
};

const tr = (t, key, defaultEn, defaultAr, isAr) => t(key, { defaultValue: isAr ? defaultAr : defaultEn });

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

const fieldClass = 'h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100';

export default function Notifications() {
    const { t, i18n } = useTranslation(['system', 'common']);
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const effectivePermissions = new Set([...(currentUser?.permissions || []), ...(currentUser?.elevatedPermissions || [])]);
    const canSendManual = MANUAL_ROLES.has(currentUser?.role) || effectivePermissions.has('MANAGE_NOTIFICATIONS');
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const language = i18n.language;

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
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const params = useMemo(() => ({
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        view: activeTab,
        ...(channel !== 'all' ? { channel } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(query.trim() ? { q: query.trim() } : {})
    }), [activeTab, channel, currentPage, pageSize, query, status]);

    const {
        data,
        isLoading,
        isFetching,
        isError,
        error,
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
        return [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }, [data]);

    const counts = useMemo(() => {
        const fallback = {
            all: notifications.length,
            unread: notifications.filter((item) => !item.is_read).length,
            failed: notifications.filter((item) => item.status === 'Failed').length,
            pending: notifications.filter((item) => item.status === 'Pending').length,
            sent: notifications.filter((item) => item.status === 'Sent').length,
            delivered: notifications.filter((item) => item.status === 'Delivered').length
        };
        return { ...fallback, ...(data?.counts || {}) };
    }, [data, notifications]);
    const filteredTotal = Number(data?.total || 0);

    useEffect(() => {
        setCurrentPage(1);
    }, [query, channel, status, activeTab, pageSize]);

    const { pageCount, startIndex, endIndex } = useMemo(
        () => getPaginationState(Number(data?.total || 0), currentPage, pageSize),
        [currentPage, data?.total, pageSize]
    );

    const pagedNotifications = notifications;

    useEffect(() => {
        if (currentPage > pageCount) setCurrentPage(pageCount);
    }, [currentPage, pageCount]);

    const grouped = useMemo(() => {
        const buckets = { today: [], yesterday: [], week: [], older: [] };
        pagedNotifications.forEach((item) => buckets[getGroupKey(item.created_at)].push(item));
        return Object.entries(buckets).filter(([, items]) => items.length > 0);
    }, [pagedNotifications]);

    const handleMarkAll = async () => {
        try {
            await markAllRead().unwrap();
            toast.success(isAr ? 'تم تحديد جميع الإشعارات كمقروءة' : 'All notifications marked as read');
        } catch (error) {
            toast.error(getErrorMessage(error, isAr ? 'فشلت العملية' : 'Action failed'));
        }
    };

    const handleMarkRead = async (id) => {
        try {
            await markRead(id).unwrap();
            toast.success(isAr ? 'تم تحديد الإشعار كمقروء' : 'Notification marked as read');
        } catch (error) {
            toast.error(getErrorMessage(error, isAr ? 'فشلت العملية' : 'Action failed'));
        }
    };

    const handleCopy = async (item) => {
        try {
            await navigator.clipboard.writeText([item.subject, item.recipient, item.content].filter(Boolean).join('\n\n'));
            toast.success(isAr ? ar.copied : 'Copied to clipboard');
        } catch {
            toast.error('Could not copy notification');
        }
    };

    const applyTemplate = (type) => {
        if (type === 'reminder') {
            setManualForm((prev) => ({
                ...prev,
                subject: isAr ? 'تذكير بموعد الفحص الإشعاعي' : 'Radiology Appointment Reminder',
                body: isAr
                    ? 'نود تذكيركم بموعد الفحص الإشعاعي الخاص بكم لدى مركز فيارا. يُرجى الحضور قبل الموعد بـ 15 دقيقة مصطحبين الهوية والتقارير السابقة.'
                    : 'This is a friendly reminder for your upcoming radiology appointment at VIARA. Please arrive 15 minutes early with your ID and prior records.'
            }));
        } else if (type === 'ready') {
            setManualForm((prev) => ({
                ...prev,
                subject: isAr ? 'تقرير الفحص الإشعاعي جاهز' : 'Radiology Diagnostic Report Ready',
                body: isAr
                    ? 'نود إبلاغكم بأن التقرير الطبي لفحصكم الإشعاعي تم اعتماده وأصبح جاهزاً للاستلام عبر بوابة المريض أو من قسم الاستقبال.'
                    : 'Your diagnostic radiology report has been finalized and is now available for download via the patient portal or front desk.'
            }));
        } else if (type === 'prep') {
            setManualForm((prev) => ({
                ...prev,
                subject: isAr ? 'تعليمات التحضير للفحص الإشعاعي' : 'Important Exam Preparation Guidelines',
                body: isAr
                    ? 'يُرجى الصيام لمدة 6 ساعات قبل موعد الفحص، مع شرب كمية كافية من الماء، وتجنب ارتداء أي مشغولات أو معادن.'
                    : 'Please fast for 6 hours prior to your scheduled exam. Drink plenty of water and avoid wearing metallic jewelry or accessories.'
            }));
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
            toast.success(isAr ? 'تم إرسال الإشعار بنجاح' : 'Notification sent successfully');
            setManualForm({ recipient: '', channel: 'Email', subject: '', body: '' });
            setComposerOpen(false);
        } catch (error) {
            toast.error(getErrorMessage(error, isAr ? 'تعذر إرسال الإشعار' : 'Could not send notification'));
        }
    };

    const activeFilterCount = Number(channel !== 'all') + Number(status !== 'all') + Number(Boolean(query.trim()));

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-14" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Top Notifications Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Bell size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Activity size={11} />
                                    <span>{tr(t, 'notifications.managementEyebrow', 'Communications Deck', ar.eyebrow, isAr)}</span>
                                </span>
                                {(counts.unread || 0) > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                                        <span>{counts.unread} {isAr ? 'تنبيه جديد' : 'New Alerts'}</span>
                                    </span>
                                )}
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {tr(t, 'notifications.managementTitle', 'Notifications & Messaging Hub', ar.title, isAr)}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {tr(t, 'notifications.managementDescription', 'Review multi-channel message delivery logs, unread alerts, and dispatch direct notifications.', ar.description, isAr)}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/settings?tab=notifications')}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <Settings size={15} />
                            <span>{tr(t, 'notifications.settings', 'Settings', ar.settings, isAr)}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            <span>{tr(t, 'notifications.refresh', 'Refresh', ar.refresh, isAr)}</span>
                        </button>
                        {canSendManual && (
                            <button
                                type="button"
                                onClick={() => setComposerOpen((current) => !current)}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                            >
                                <Send size={14} />
                                <span>{tr(t, 'notifications.manual', 'New Notification', ar.composeTitle, isAr)}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Metric Summary Cards */}
            <section className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
                <MetricCard tone="slate" label={tr(t, 'notifications.tabs.all', 'All Dispatches', ar.all, isAr)} value={formatNumber(counts.all || 0, language)} detail="Total communication records" />
                <MetricCard tone="cyan" label={tr(t, 'notifications.tabs.unread', 'Unread Alerts', ar.unread, isAr)} value={formatNumber(counts.unread || 0, language)} detail="Requires team follow-up" />
                <MetricCard tone="rose" label={tr(t, 'notifications.tabs.failed', 'Failed Deliveries', ar.failed, isAr)} value={formatNumber(counts.failed || 0, language)} detail="Provider dispatch errors" />
                <MetricCard tone="amber" label={tr(t, 'notifications.status.Pending', 'Queued / Pending', ar.pending, isAr)} value={formatNumber(counts.pending || 0, language)} detail="In dispatch queue" />
                <MetricCard tone="emerald" label={tr(t, 'notifications.status.Delivered', 'Delivered', ar.sent, isAr)} value={formatNumber(counts.delivered || 0, language)} detail="Provider-confirmed delivery" />
            </section>

            {/* Manual Composer Panel */}
            {composerOpen && canSendManual && (
                <form onSubmit={handleSendManual} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 animate-in slide-in-from-top-2 duration-200">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
                                <Send size={15} />
                            </span>
                            <div>
                                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                    {tr(t, 'notifications.composeTitle', 'Manual Notification Dispatcher', ar.composeTitle, isAr)}
                                </h2>
                                <p className="text-[10px] font-semibold text-slate-400">
                                    {tr(t, 'notifications.composeHint', 'Send direct messages via Email, SMS, or WhatsApp.', ar.composeHint, isAr)}
                                </p>
                            </div>
                        </div>
                        <button type="button" onClick={() => setComposerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Quick Clinical Templates */}
                    <div className="mb-3">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                            {tr(t, 'notifications.templates', 'Clinical Quick Templates', ar.templates, isAr)}:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => applyTemplate('reminder')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                            >
                                <Clock size={12} className="text-teal-600" />
                                <span>{tr(t, 'notifications.tplReminder', 'Appointment Reminder', ar.tplReminder, isAr)}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => applyTemplate('ready')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                            >
                                <Sparkles size={12} className="text-teal-600" />
                                <span>{tr(t, 'notifications.tplReady', 'Report Ready', ar.tplReady, isAr)}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => applyTemplate('prep')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                            >
                                <AlertCircle size={12} className="text-teal-600" />
                                <span>{tr(t, 'notifications.tplPrep', 'Preparation Instructions', ar.tplPrep, isAr)}</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                        <input
                            value={manualForm.recipient}
                            onChange={(event) => setManualForm((current) => ({ ...current, recipient: event.target.value }))}
                            required
                            type={manualForm.channel === 'Email' ? 'email' : 'tel'}
                            placeholder={manualForm.channel === 'Email' ? 'patient@example.com' : '+20 100 000 0000'}
                            className={fieldClass}
                        />
                        <select
                            value={manualForm.channel}
                            onChange={(event) => setManualForm((current) => ({ ...current, channel: event.target.value, subject: event.target.value === 'Email' ? current.subject : '' }))}
                            className={fieldClass}
                        >
                            {SEND_CHANNELS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                            ))}
                        </select>
                    </div>

                    {manualForm.channel === 'Email' && (
                        <input
                            value={manualForm.subject}
                            onChange={(event) => setManualForm((current) => ({ ...current, subject: event.target.value }))}
                            placeholder={tr(t, 'notifications.subject', 'Email Subject', ar.subject, isAr)}
                            className={`${fieldClass} mt-3 w-full`}
                        />
                    )}

                    <textarea
                        value={manualForm.body}
                        onChange={(event) => setManualForm((current) => ({ ...current, body: event.target.value }))}
                        required
                        rows={3}
                        maxLength={2000}
                        placeholder={tr(t, 'notifications.message', 'Message body...', ar.message, isAr)}
                        className={`${fieldClass} mt-3 h-auto min-h-24 w-full py-2.5 leading-relaxed`}
                    />

                    <div className="mt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={sendingManual || !manualForm.recipient.trim() || !manualForm.body.trim()}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 disabled:opacity-40"
                        >
                            {sendingManual ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                            <span>{sendingManual ? tr(t, 'notifications.sending', 'Sending...', ar.sending, isAr) : tr(t, 'notifications.send', 'Dispatch Message', ar.send, isAr)}</span>
                        </button>
                    </div>
                </form>
            )}

            {/* Filter & Notification List Workbench */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                {/* Search and Filters Bar */}
                <div className="border-b border-slate-100 p-4 space-y-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30">
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                        <div className="relative">
                            <Search size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={tr(t, 'notifications.search', 'Search recipient, subject, or message content...', 'بحث بالمستلم، العنوان، أو المحتوى...', isAr)}
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
                                    {item === 'all' ? tr(t, 'notifications.channels.all', 'All Channels', 'جميع القنوات', isAr) : item}
                                </option>
                            ))}
                        </select>

                        <select value={status} onChange={(event) => setStatus(event.target.value)} className={fieldClass}>
                            {STATUSES.map((item) => (
                                <option key={item} value={item}>
                                    {item === 'all' ? tr(t, 'notifications.status.all', 'All Statuses', 'جميع الحالات', isAr) : item}
                                </option>
                            ))}
                        </select>

                        <div className="flex items-center gap-2">
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { setQuery(''); setChannel('all'); setStatus('all'); }}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-rose-950/30"
                                >
                                    <FilterX size={14} />
                                    <span>{tr(t, 'notifications.filters.reset', 'Reset', 'مسح الفلاتر', isAr)}</span>
                                </button>
                            )}
                            {(counts.unread || 0) > 0 && (
                                <button
                                    type="button"
                                    onClick={handleMarkAll}
                                    disabled={markingAll}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 text-xs font-bold text-teal-700 transition hover:bg-teal-500/20 disabled:opacity-50 dark:text-teal-300"
                                >
                                    {markingAll ? <RefreshCw size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                                    <span>{tr(t, 'notifications.markRead', 'Mark all read', ar.markAllRead, isAr)}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Category Filter Pills */}
                    <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-950/50">
                        {['all', 'unread', 'failed'].map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                                    activeTab === tab
                                        ? 'bg-white text-teal-800 shadow-xs dark:bg-slate-800 dark:text-teal-300'
                                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                                }`}
                            >
                                {tab === 'all' ? ar.all : tab === 'unread' ? ar.unread : ar.failed}
                                {Number(counts[tab]) > 0 && (
                                    <span className="ms-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-black tabular-nums">
                                        {formatNumber(counts[tab], language)}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Notifications Feed */}
                <div className="min-h-[440px] p-4">
                    {isLoading ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-slate-400">
                            <RefreshCw size={24} className="animate-spin text-teal-600" />
                            <p className="mt-3 text-xs font-extrabold text-slate-500">Loading notifications...</p>
                        </div>
                    ) : isError ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
                            <AlertCircle size={28} className="text-rose-500" />
                            <p className="mt-3 text-sm font-extrabold text-slate-800 dark:text-white">Unable to load notifications</p>
                            <p className="mt-1 max-w-sm text-xs font-semibold text-slate-400">{getErrorMessage(error, 'The notification service could not be reached.')}</p>
                            <button type="button" onClick={refetch} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-900">Retry</button>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-center p-8">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 mb-3">
                                <Bell size={24} />
                            </div>
                            <p className="text-sm font-extrabold text-slate-800 dark:text-white">No notifications found</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400 max-w-sm">No notification records match the selected filters or search query.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {grouped.map(([groupKey, items]) => (
                                <section key={groupKey} className="space-y-2.5">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                                        <Clock3 size={12} className="text-teal-600 dark:text-teal-400" />
                                        <span>{groupKey === 'today' ? ar.today : groupKey === 'yesterday' ? ar.yesterday : groupKey === 'week' ? ar.week : ar.older}</span>
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
                                                isAr={isAr}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>

                {data?.searchLimited ? (
                    <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                        Search was limited to the newest {data.searchScanLimit} visible notifications. Narrow the filters for exhaustive results.
                    </p>
                ) : null}

                {/* Pagination Footer */}
                {!isError && filteredTotal > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-3.5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <span>
                                {isAr
                                    ? `عرض ${startIndex + 1} - ${Math.min(endIndex, filteredTotal)} من إجمالي ${filteredTotal} إشعار`
                                    : `Showing ${startIndex + 1} - ${Math.min(endIndex, filteredTotal)} of ${filteredTotal} notifications`}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">{isAr ? 'لكل صفحة:' : 'Per page:'}</span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                {[10, 25, 50, 100].map((size) => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>

                        <Pagination
                            currentPage={currentPage}
                            pageCount={pageCount}
                            onPageChange={setCurrentPage}
                            isRtl={isRtl}
                        />
                    </div>
                )}
            </section>
        </div>
    );
}

const NotificationRow = ({ item, expanded, onToggle, onMarkRead, onCopy, marking, language, t, isAr }) => {
    const ChannelIcon = channelIcons[item.channel] || Bell;
    const title = item.subject || item.event_type || item.channel;
    const statusClass = getStatusClass(item.status);
    const badgeStyle = channelStyles[item.channel] || channelStyles.InApp;

    return (
        <article className={`overflow-hidden rounded-2xl border bg-white/90 p-3.5 transition-all duration-150 backdrop-blur-xl dark:bg-slate-900/90 ${
            item.is_read
                ? 'border-slate-200/80 dark:border-slate-800'
                : 'border-teal-500/60 ring-2 ring-teal-500/15 dark:border-teal-500/50'
        }`}>
            <div className="flex items-start gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${badgeStyle}`}>
                    <ChannelIcon size={16} />
                </span>
                <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-start outline-none">
                    <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                            {!item.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500 animate-pulse" />}
                            <span className="truncate text-xs font-black text-slate-900 dark:text-white">{title}</span>
                        </span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass}`}>
                            {item.status}
                        </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                        <span className="text-teal-700 dark:text-teal-400 font-bold">{item.channel}</span>
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
                        <p className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300">{item.content}</p>
                    )}
                </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5 ps-12">
                <div className="flex items-center gap-2">
                    {item.action_url && (
                        <a
                            href={item.action_url}
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 text-[10px] font-bold text-teal-700 hover:bg-teal-500/20 transition dark:text-teal-300"
                        >
                            <ExternalLink size={11} />
                            <span>{isAr ? 'فتح السجل' : 'Open Record'}</span>
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={() => onCopy(item)}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                    >
                        <Copy size={12} />
                        <span>{isAr ? ar.copy : 'Copy'}</span>
                    </button>
                    {!item.is_read && (
                        <button
                            type="button"
                            onClick={() => onMarkRead(item.notification_id)}
                            disabled={marking}
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 text-[10px] font-black text-teal-700 transition hover:bg-teal-500 hover:text-white disabled:opacity-50 dark:text-teal-300"
                        >
                            <Check size={12} />
                            <span>{isAr ? ar.markRead : 'Mark read'}</span>
                        </button>
                    )}
                </div>
            </div>

            {expanded && (
                <div className="mt-3 space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 sm:ms-12">
                    {item.content && <p className="whitespace-pre-wrap font-medium">{item.content}</p>}
                    {item.event_type && <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Event: {item.event_type}</p>}
                    {item.status === 'Failed' && item.error_message && (
                        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
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
    if (status === 'Failed') return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
    if (status === 'Pending') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    if (status === 'Sent' || status === 'Delivered') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
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
