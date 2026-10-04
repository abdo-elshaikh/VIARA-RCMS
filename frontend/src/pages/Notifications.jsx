import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
    Activity,
    AlertCircle,
    AlertOctagon,
    AlertTriangle,
    Archive,
    ArrowRight,
    Award,
    Bell,
    Check,
    CheckCheck,
    ChevronDown,
    ChevronUp,
    Clock,
    Clock3,
    Copy,
    DollarSign,
    ExternalLink,
    FileCheck2,
    FileSearch,
    FileText,
    Filter,
    FilterX,
    HardDrive,
    Info,
    Mail,
    MessageCircle,
    MessageSquare,
    Package,
    Phone,
    Radio,
    RefreshCw,
    Search,
    Send,
    Settings,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Stethoscope,
    Tag,
    TrendingUp,
    User,
    UserCheck,
    Users,
    Wrench,
    X,
    Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../store/authSlice';
import {
    useGetNotificationsQuery,
    useGetMyNotificationsQuery,
    useMarkAllNotificationsReadMutation,
    useMarkNotificationReadMutation,
    useMarkAllMyNotificationsReadMutation,
    useMarkMyNotificationReadMutation,
    useAcknowledgeCriticalResultMutation,
    useSendManualNotificationMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getEffectivePermissions } from '../utils/effectivePermissions';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { getPaginationState } from '../utils/pagination';

const CHANNELS = ['all', 'InApp', 'WhatsApp', 'SMS', 'Email'];
const STATUSES = ['all', 'Delivered', 'Sent', 'Pending', 'Failed'];
const PRIORITIES = ['all', 'Normal', 'Action', 'Warning', 'Critical'];
const SEND_CHANNELS = ['Email', 'SMS', 'WhatsApp'];
const MANUAL_ROLES = new Set(['Developer', 'Admin', 'Receptionist', 'Marketing']);
const OUTBOUND_LOG_ROLES = new Set(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']);

const formatEventType = (eventType) => String(eventType || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());

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
    InApp: 'bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400 border-teal-200/80 dark:border-teal-900/50'
};

const priorityStyles = {
    Critical: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 ring-1 ring-rose-500/20',
    Warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    Action: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    Normal: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

const categoryDefinitions = [
    { id: 'all', labelAr: 'جميع الإشعارات', labelEn: 'All Alerts', icon: Bell },
    { id: 'Security', labelAr: 'الأمان', labelEn: 'Security', icon: Shield, tone: 'rose' },
    { id: 'Clinical', labelAr: 'سريري', labelEn: 'Clinical', icon: Stethoscope, tone: 'teal' },
    { id: 'Financial', labelAr: 'مالي', labelEn: 'Financial', icon: DollarSign, tone: 'emerald' },
    { id: 'Operational', labelAr: 'تشغيلي', labelEn: 'Operational', icon: Activity, tone: 'cyan' },
    { id: 'Patient', labelAr: 'المريض', labelEn: 'Patient', icon: Users, tone: 'blue' },
    { id: 'System', labelAr: 'النظام', labelEn: 'System', icon: Settings, tone: 'indigo' }
];

const fieldClass = 'h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100';

export default function Notifications() {
    const { t, i18n } = useTranslation(['common', 'system', 'workspace']);
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const effectivePermissions = getEffectivePermissions(currentUser);
    const canSendManual = MANUAL_ROLES.has(currentUser?.role)
        && (currentUser?.role === 'Developer' || effectivePermissions.has('MANAGE_NOTIFICATIONS'));
    const canViewOutbound = OUTBOUND_LOG_ROLES.has(currentUser?.role);
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const language = i18n.language;

    // Scope: 'personal' (My Notifications) vs 'outbound' (Center Logs)
    const [scope, setScope] = useState('personal');
    const [category, setCategory] = useState('all');
    const [query, setQuery] = useState('');
    const [channel, setChannel] = useState('all');
    const [status, setStatus] = useState('all');
    const [priority, setPriority] = useState('all');
    const [readFilter, setReadFilter] = useState('all'); // 'all', 'unread', 'read'
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

    const serverPaginationEnabled = true;

    // API queries for Personal vs Outbound
    const queryParams = useMemo(() => ({
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        ...(channel !== 'all' ? { channel } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(category !== 'all' ? { category } : {}),
        ...(priority !== 'all' ? { priority } : {}),
        ...(readFilter !== 'all' ? { readState: readFilter } : {}),
        ...(query.trim() ? { q: query.trim() } : {})
    }), [category, channel, currentPage, pageSize, priority, query, readFilter, status]);

    const myNotificationsQuery = useGetMyNotificationsQuery(queryParams, {
        skip: scope !== 'personal',
        pollingInterval: 30000,
        refetchOnFocus: true,
        refetchOnReconnect: true
    });

    const outboundNotificationsQuery = useGetNotificationsQuery(queryParams, {
        skip: scope !== 'outbound' || !canViewOutbound,
        pollingInterval: 30000,
        refetchOnFocus: true,
        refetchOnReconnect: true
    });

    const [markAllRead, { isLoading: markingAllOutbound }] = useMarkAllNotificationsReadMutation();
    const [markRead, { isLoading: markingOneOutbound }] = useMarkNotificationReadMutation();
    const [markAllMyRead, { isLoading: markingAllMy }] = useMarkAllMyNotificationsReadMutation();
    const [markMyRead, { isLoading: markingOneMy }] = useMarkMyNotificationReadMutation();
    const [acknowledgeCriticalResult, { isLoading: acknowledgingCritical }] = useAcknowledgeCriticalResultMutation();
    const [sendManual, { isLoading: sendingManual }] = useSendManualNotificationMutation();

    const activeQuery = scope === 'personal' ? myNotificationsQuery : outboundNotificationsQuery;
    const rawItems = useMemo(
        () => Array.isArray(activeQuery.data?.items) ? activeQuery.data.items : [],
        [activeQuery.data?.items]
    );
    const isLoading = activeQuery.isLoading;
    const isFetching = activeQuery.isFetching;
    const isError = activeQuery.isError;
    const error = activeQuery.error;
    const refetch = activeQuery.refetch;

    const serverTotal = Number.isFinite(Number(activeQuery.data?.total))
        ? Number(activeQuery.data.total)
        : null;
    const searchLimited = Boolean(activeQuery.data?.searchLimited);

    // Filter by category & extra filters
    const filteredItems = useMemo(() => {
        return rawItems.filter((item) => {
            if (channel !== 'all' && item.channel !== channel) return false;
            if (status !== 'all' && item.status !== status) return false;

            // Read filter
            if (readFilter === 'unread' && item.is_read) return false;
            if (readFilter === 'read' && !item.is_read) return false;

            // Priority filter
            if (priority !== 'all') {
                const itemPri = normalizePriority(item.priority).toLowerCase();
                if (itemPri !== priority.toLowerCase()) return false;
            }

            // Category filter
            if (category !== 'all') {
                if (getNotificationCategory(item) !== category) return false;
            }

            return true;
        });
    }, [category, channel, priority, rawItems, readFilter, status]);

    // Aggregate counts
    const counts = useMemo(() => {
        const apiCounts = activeQuery.data?.counts || {};
        const total = serverPaginationEnabled && Number.isFinite(Number(serverTotal)) ? serverTotal : rawItems.length;
        const unread = serverPaginationEnabled && Number.isFinite(Number(apiCounts.unread))
            ? Number(apiCounts.unread)
            : rawItems.filter((i) => !i.is_read).length;
        const critical = Number.isFinite(Number(apiCounts.critical))
            ? Number(apiCounts.critical)
            : rawItems.filter((i) => normalizePriority(i.priority) === 'Critical').length;
        const delivered = Number.isFinite(Number(apiCounts.delivered))
            ? Number(apiCounts.delivered)
            : rawItems.filter((i) => i.status === 'Delivered').length;
        const failed = Number.isFinite(Number(apiCounts.failed))
            ? Number(apiCounts.failed)
            : rawItems.filter((i) => i.status === 'Failed').length;
        const terminal = delivered + failed;
        const deliveryRate = scope === 'outbound' && terminal > 0 ? Math.round((delivered / terminal) * 100) : null;
        return { total, unread, critical, delivered, failed, deliveryRate };
    }, [activeQuery.data, rawItems, scope, serverPaginationEnabled, serverTotal]);

    // Pagination
    useEffect(() => {
        setCurrentPage(1);
    }, [query, channel, status, priority, readFilter, category, scope, pageSize]);

    const totalCount = serverPaginationEnabled && serverTotal !== null ? serverTotal : filteredItems.length;
    const { pageCount, startIndex, endIndex } = useMemo(
        () => getPaginationState(totalCount, currentPage, pageSize),
        [currentPage, totalCount, pageSize]
    );

    const pagedItems = useMemo(() => {
        return serverPaginationEnabled ? filteredItems : filteredItems.slice(startIndex, endIndex);
    }, [filteredItems, serverPaginationEnabled, startIndex, endIndex]);

    // Grouping by Date
    const grouped = useMemo(() => {
        const buckets = { today: [], yesterday: [], week: [], older: [] };
        pagedItems.forEach((item) => buckets[getGroupKey(item.created_at)].push(item));
        return Object.entries(buckets).filter(([, items]) => items.length > 0);
    }, [pagedItems]);

    // Actions
    const handleMarkAll = async () => {
        const scopeLabel = scope === 'personal'
            ? (t('yourPersonalInbox'))
            : (t('theCenterOutboundLog'));
        if (!window.confirm(isAr
            ? `هل تريد تحديد جميع الإشعارات في ${scopeLabel} كمقروءة؟`
            : `Mark all notifications in ${scopeLabel} as read?`)) return;
        try {
            if (scope === 'personal') {
                await markAllMyRead().unwrap();
            } else {
                await markAllRead().unwrap();
            }
            toast.success(t('allNotificationsMarkedAsRead'));
        } catch (err) {
            toast.error(getErrorMessage(err, t('actionFailed')));
        }
    };

    const handleMarkSingleRead = async (id) => {
        try {
            if (scope === 'personal') {
                await markMyRead(id).unwrap();
            } else {
                await markRead(id).unwrap();
            }
            toast.success(t('notificationMarkedAsRead'));
        } catch (err) {
            toast.error(getErrorMessage(err, t('actionFailed')));
        }
    };

    const handleNavigate = (actionUrl) => {
        if (!actionUrl || !String(actionUrl).startsWith('/')) return;
        navigate(actionUrl);
    };

    const handleAcknowledge = async (item) => {
        if (!item?.entity_id) return;
        try {
            await acknowledgeCriticalResult({ examId: item.entity_id }).unwrap();
            toast.success(t('criticalResultAcknowledged'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('couldNotAcknowledgeCriticalResult')));
        }
    };

    const handleCopy = async (item) => {
        try {
            await navigator.clipboard.writeText([item.subject, item.recipient, item.content, item.event_type].filter(Boolean).join('\n\n'));
            toast.success(t('copiedNotificationToClipboard'));
        } catch {
            toast.error(t('couldNotCopy'));
        }
    };

    const applyTemplate = (type) => {
        if (type === 'reminder') {
            setManualForm((prev) => ({
                ...prev,
                subject: t('radiologyAppointmentReminder'),
                body: t('friendlyReminderForYourUpcomingDiagnostic')
            }));
        } else if (type === 'ready') {
            setManualForm((prev) => ({
                ...prev,
                subject: t('diagnosticReportImagesReady'),
                body: t('yourDiagnosticRadiologyReportAndCalibrated')
            }));
        } else if (type === 'prep') {
            setManualForm((prev) => ({
                ...prev,
                subject: t('examPreparationInstructions'),
                body: t('pleaseFastFor6HoursPrior')
            }));
        } else if (type === 'payment') {
            setManualForm((prev) => ({
                ...prev,
                subject: t('paymentReceiptConfirmation'),
                body: t('weConfirmTheSuccessfulReceiptOf')
            }));
        } else if (type === 'urgent') {
            setManualForm((prev) => ({
                ...prev,
                subject: t('urgentClinicalNotification'),
                body: t('urgentClinicalCommunicationRequiringPromptReview')
            }));
        }
    };

    const handleSendManual = async (e) => {
        e.preventDefault();
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
            toast.success(t('notificationDispatchedSuccessfully'));
            setManualForm({ recipient: '', channel: 'Email', subject: '', body: '' });
            setComposerOpen(false);
        } catch (err) {
            toast.error(getErrorMessage(err, t('couldNotDispatchNotification')));
        }
    };

    const activeFilterCount = Number(channel !== 'all') + Number(status !== 'all') + Number(priority !== 'all') + Number(readFilter !== 'all') + Number(Boolean(query.trim()));

    const isMarkingAll = markingAllMy || markingAllOutbound;
    const isMarkingOne = markingOneMy || markingOneOutbound;

    return (
        <main className="mx-auto max-w-[1680px] space-y-4 pb-14" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* 1. Unified PageHeader */}
            <PageHeader
                icon={Bell}
                eyebrowIcon={Activity}
                eyebrow={t('unifiedClinicalOperationalCommunicationsHub')}
                title={t('notificationsSystemAlertsCommunicationsHub')}
                description={t('monitorClinicalStatAlertsSystemWarnings')}
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
                            </span>
                            <span>{t('liveRealtimePushActive')}</span>
                        </span>
                        {counts.unread > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-700 dark:text-rose-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                                <span className="font-mono">{counts.unread}</span>
                                <span>{t('unread')}</span>
                            </span>
                        )}
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {currentUser?.role || (t('staff'))}
                        </span>
                    </div>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {canSendManual && (
                            <button
                                type="button"
                                onClick={() => setComposerOpen((prev) => !prev)}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-xs font-black text-white shadow-md shadow-teal-600/20 transition hover:brightness-110"
                            >
                                <Send size={14} />
                                <span>{t('newDispatch')}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => navigate('/settings?tab=notifications')}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <Settings size={15} />
                            <span>{t('preferences')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={14} className={isFetching ? 'animate-spin text-teal-600' : ''} />
                            <span>{t('refresh')}</span>
                        </button>
                    </div>
                }
                metrics={[
                    {
                        key: 'unread',
                        icon: Bell,
                        label: t('unreadAlerts'),
                        value: counts.unread,
                        detail: counts.unread > 0 ? (t('requiresFollowUp')) : (t('allClear')),
                        tone: counts.unread > 0 ? 'rose' : 'emerald',
                        loading: isLoading,
                        error: isError
                    },
                    {
                        key: 'critical',
                        icon: AlertOctagon,
                        label: t('criticalStatAlerts'),
                        value: counts.critical,
                        detail: counts.critical > 0 ? (t('statPriorityCases')) : (t('noCriticalAlerts')),
                        tone: counts.critical > 0 ? 'rose' : 'slate',
                        loading: isLoading,
                        error: isError
                    },
                    {
                        key: 'deliveryRate',
                        icon: CheckCheck,
                        label: t('deliverySuccessRate'),
                         value: counts.deliveryRate === null ? '—' : `${counts.deliveryRate}%`,
                         detail: scope === 'outbound'
                             ? `${counts.delivered} ${t('deliveredDispatches')}`
                             : (t('availableForOutboundLogsOnly')),
                        tone: counts.deliveryRate >= 90 ? 'emerald' : counts.deliveryRate >= 75 ? 'amber' : 'rose',
                        loading: isLoading,
                        error: isError
                    },
                    {
                        key: 'total',
                        icon: Activity,
                        label: t('totalCommunicationLogs'),
                        value: counts.total,
                         detail: scope === 'outbound'
                             ? `${counts.failed} ${t('failedDispatches')}`
                             : (t('yourPersonalInboxX')),
                        tone: 'indigo',
                        loading: isLoading,
                        error: isError
                    }
                ]}
                metricsLabel={t('notificationMessagingIndicators')}
            />

            {/* 2. Scope Selector Deck: Personal vs Center Outbound Logs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                        type="button"
                        onClick={() => setScope('personal')}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black transition-all ${
                            scope === 'personal'
                                ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-900 dark:text-teal-300'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                    >
                        <UserCheck size={14} />
                        <span>{t('myPersonalWorkflowAlerts')}</span>
                    </button>
                    {canViewOutbound && (
                        <button
                            type="button"
                            onClick={() => setScope('outbound')}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black transition-all ${
                                scope === 'outbound'
                                    ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-900 dark:text-teal-300'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Send size={14} />
                            <span>{t('centerOutboundDispatches')}</span>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {counts.unread > 0 && (
                        <button
                            type="button"
                            onClick={handleMarkAll}
                            disabled={isMarkingAll}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 text-xs font-black text-teal-700 transition hover:bg-teal-500/20 disabled:opacity-50 dark:text-teal-300"
                        >
                            {isMarkingAll ? <RefreshCw size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                            <span>{t('markAllAsRead')}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* 3. Sliding Manual Composer Panel */}
            {composerOpen && canSendManual && (
                <form onSubmit={handleSendManual} className="overflow-hidden rounded-2xl border border-teal-500/30 bg-white/95 p-4 sm:p-5 shadow-lg backdrop-blur-xl dark:border-teal-500/30 dark:bg-slate-900/95 animate-in slide-in-from-top-3 duration-200">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
                                <Send size={16} />
                            </span>
                            <div>
                                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                    {t('directNotificationDispatcher')}
                                </h2>
                                <p className="text-[10px] font-semibold text-slate-400">
                                    {t('dispatchInstantMessagesViaSmsWhatsapp')}
                                </p>
                            </div>
                        </div>
                         <button type="button" onClick={() => setComposerOpen(false)} aria-label={t('closeDispatcher')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                             <X size={16} aria-hidden="true" />
                        </button>
                    </div>

                    {/* Quick Clinical Templates */}
                    <div className="mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                            {t('clinicalQuickTemplates')}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => applyTemplate('reminder')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                            >
                                <Clock size={12} className="text-teal-600" />
                                <span>{t('appointmentReminder')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => applyTemplate('ready')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                            >
                                <Sparkles size={12} className="text-teal-600" />
                                <span>{t('reportReady')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => applyTemplate('prep')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                            >
                                <AlertCircle size={12} className="text-teal-600" />
                                <span>{t('prepGuidelines')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => applyTemplate('payment')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                            >
                                <DollarSign size={12} className="text-teal-600" />
                                <span>{t('paymentConfirmation')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => applyTemplate('urgent')}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 transition"
                            >
                                <AlertOctagon size={12} className="text-rose-600" />
                                <span>{t('urgentAlert')}</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
                        <input
                            value={manualForm.recipient}
                            onChange={(e) => setManualForm((curr) => ({ ...curr, recipient: e.target.value }))}
                            required
                            type={manualForm.channel === 'Email' ? 'email' : 'tel'}
                            placeholder={manualForm.channel === 'Email' ? 'patient@example.com' : '+20 100 000 0000'}
                            className={fieldClass}
                        />
                        <select
                            value={manualForm.channel}
                            onChange={(e) => setManualForm((curr) => ({ ...curr, channel: e.target.value, subject: e.target.value === 'Email' ? curr.subject : '' }))}
                            className={fieldClass}
                        >
                            {SEND_CHANNELS.map((ch) => (
                                <option key={ch} value={ch}>{ch}</option>
                            ))}
                        </select>
                    </div>

                    {manualForm.channel === 'Email' && (
                        <input
                            value={manualForm.subject}
                            onChange={(e) => setManualForm((curr) => ({ ...curr, subject: e.target.value }))}
                            placeholder={t('emailSubject')}
                            className={`${fieldClass} mt-3 w-full`}
                        />
                    )}

                    <textarea
                        value={manualForm.body}
                        onChange={(e) => setManualForm((curr) => ({ ...curr, body: e.target.value }))}
                        required
                        rows={3}
                        maxLength={2000}
                        placeholder={t('typeMessageBodyHere')}
                        className={`${fieldClass} mt-3 h-auto min-h-24 w-full py-2.5 leading-relaxed`}
                    />

                    <div className="mt-4 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 font-mono">
                            {manualForm.body.length} / 2000 {t('chars')}
                        </span>
                        <button
                            type="submit"
                            disabled={sendingManual || !manualForm.recipient.trim() || !manualForm.body.trim()}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 disabled:opacity-40"
                        >
                            {sendingManual ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                            <span>{sendingManual ? (t('sending')) : (t('dispatchNotification'))}</span>
                        </button>
                    </div>
                </form>
            )}

            {/* 4. Segmented Category Filter Bar */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
                <nav aria-label={t('notificationCategories')} className="flex flex-wrap gap-1">
                    {categoryDefinitions.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = category === cat.id;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setCategory(cat.id)}
                                className={`flex min-h-9 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                                    isActive
                                        ? 'bg-teal-700 text-white shadow-sm font-black'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                            >
                                <Icon size={14} />
                                <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            {searchLimited && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200" role="status">
                    {t('searchResultsAreLimitedToThe')}
                </p>
            )}

            {/* 5. Filter & List Workbench */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                {/* Search and Granular Filters Bar */}
                <div className="border-b border-slate-100 p-4 space-y-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30">
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_140px_140px_140px_auto]">
                        {/* Search Input */}
                        <div className="relative">
                            <Search size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t('searchRecipientSubjectContentOrMrn')}
                                className={`${fieldClass} w-full ps-10 pe-9`}
                            />
                             {query && (
                                 <button type="button" onClick={() => setQuery('')} aria-label={t('clearSearch')} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700 transition">
                                     <X size={14} aria-hidden="true" />
                                </button>
                            )}
                        </div>

                        {/* Channel Filter */}
                        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={fieldClass}>
                            {CHANNELS.map((ch) => (
                                <option key={ch} value={ch}>
                                    {ch === 'all' ? (t('allChannels')) : ch}
                                </option>
                            ))}
                        </select>

                        {/* Priority Filter */}
                        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={fieldClass}>
                            {PRIORITIES.map((pri) => (
                                <option key={pri} value={pri}>
                                    {pri === 'all' ? (t('allPriorities')) : (isAr ? translatePriority(pri) : pri)}
                                </option>
                            ))}
                        </select>

                        {/* Status Filter */}
                        <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
                            {STATUSES.map((st) => (
                                <option key={st} value={st}>
                                    {st === 'all' ? (t('allStatuses')) : (isAr ? translateStatus(st) : st)}
                                </option>
                            ))}
                        </select>

                        {/* Quick Actions / Reset */}
                        <div className="flex items-center gap-1.5">
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { setQuery(''); setChannel('all'); setStatus('all'); setPriority('all'); setReadFilter('all'); setCategory('all'); }}
                                    className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-rose-950/30"
                                    title={t('resetFilters')}
                                >
                                    <FilterX size={14} />
                                    <span>{t('reset')}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Secondary Status Pills (All, Unread Only, Read Only) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                         <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                            <span>{t('readState')}</span>
                             <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 dark:bg-slate-800" role="group" aria-label={t('readStateX')}>
                                {[
                                    { id: 'all', labelAr: 'الكل', labelEn: 'All' },
                                    { id: 'unread', labelAr: 'غير مقروء', labelEn: 'Unread' },
                                    { id: 'read', labelAr: 'مقروء', labelEn: 'Read' }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setReadFilter(tab.id)}
                                        className={`rounded-md px-2.5 py-0.5 text-xs font-bold transition ${
                                            readFilter === tab.id
                                                ? 'bg-white text-teal-800 shadow-2xs dark:bg-slate-900 dark:text-teal-300 font-black'
                                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                                        }`}
                                    >
                                        {isAr ? tab.labelAr : tab.labelEn}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <span className="text-[11px] font-bold text-slate-400 font-mono">
                            {filteredItems.length} {t('matchingRecords')}
                        </span>
                    </div>
                </div>

                {/* Notifications Feed */}
                <div className="min-h-[440px] p-4">
                    {isLoading ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-slate-400">
                            <RefreshCw size={24} className="animate-spin text-teal-600" />
                            <p className="mt-3 text-xs font-black text-slate-500">
                                {t('loadingNotificationStream')}
                            </p>
                        </div>
                    ) : isError ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
                            <AlertCircle size={28} className="text-rose-500" />
                            <p className="mt-3 text-sm font-black text-slate-800 dark:text-white">
                                {t('unableToLoadNotifications')}
                            </p>
                            <p className="mt-1 max-w-sm text-xs font-semibold text-slate-400">
                                {getErrorMessage(error, t('theNotificationServiceCouldNotBe'))}
                            </p>
                            <button
                                type="button"
                                onClick={() => refetch()}
                                className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-900"
                            >
                                {t('retry')}
                            </button>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex min-h-[360px] flex-col items-center justify-center text-center p-8">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 mb-3">
                                <Bell size={24} />
                            </div>
                            <p className="text-sm font-black text-slate-800 dark:text-white">
                                {t('noNotificationsFound')}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-400 max-w-sm">
                                {t('noNotificationRecordsMatchTheSelected')}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {grouped.map(([groupKey, items]) => (
                                <section key={groupKey} className="space-y-2.5">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                                        <Clock3 size={12} className="text-teal-600 dark:text-teal-400" />
                                        <span>{translateGroupKey(groupKey, isAr)}</span>
                                        <span className="ms-auto rounded-full bg-slate-200/80 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400 font-mono">
                                            {items.length}
                                        </span>
                                    </div>
                                    <div className="space-y-2.5">
                                        {items.map((item) => (
                                            <NotificationCard
                                                key={item.notification_id}
                                                item={item}
                                                expanded={expandedId === item.notification_id}
                                                onToggle={() => setExpandedId((curr) => curr === item.notification_id ? null : item.notification_id)}
                                                onMarkRead={handleMarkSingleRead}
                                                onCopy={handleCopy}
                                                onNavigate={handleNavigate}
                                                onAcknowledge={handleAcknowledge}
                                                marking={isMarkingOne}
                                                acknowledging={acknowledgingCritical}
                                                language={language}
                                                isAr={isAr}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>

                {/* 6. Numbered Pagination Footer */}
                {!isError && totalCount > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-3.5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
                            <span>
                                {isAr
                                     ? `عرض ${serverPaginationEnabled ? (currentPage - 1) * pageSize + 1 : startIndex + 1} - ${Math.min(serverPaginationEnabled ? (currentPage - 1) * pageSize + pagedItems.length : endIndex, totalCount)} من إجمالي ${totalCount} إشعار`
                                     : `Showing ${serverPaginationEnabled ? (currentPage - 1) * pageSize + 1 : startIndex + 1} - ${Math.min(serverPaginationEnabled ? (currentPage - 1) * pageSize + pagedItems.length : endIndex, totalCount)} of ${totalCount} notifications`}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">{t('perPage')}</span>
                            <select
                                aria-label={t('notificationsPerPage')}
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
        </main>
    );
}

// ─── Notification Card Component ──────────────────────────────────────────

export const NotificationCard = ({ item, expanded, onToggle, onMarkRead, onCopy, onNavigate, onAcknowledge, marking, acknowledging, language, isAr }) => {
    const { t } = useTranslation(['common', 'system', 'workspace']);
    const ChannelIcon = channelIcons[item.channel] || Bell;
    const title = item.subject || formatEventType(item.event_type) || item.channel || (t('systemAlert'));
    const priority = normalizePriority(item.priority, item.event_type);
    const priStyle = priorityStyles[priority] || priorityStyles.Normal;
    const badgeStyle = channelStyles[item.channel] || channelStyles.InApp;
    const statusClass = getStatusClass(item.status);
    const CategoryIcon = getCategoryIcon(item.event_type, item.category);
    const categoryLabel = item.category || getNotificationCategory(item);

    return (
        <article className={`overflow-hidden rounded-2xl border bg-white/90 p-4 transition-all duration-150 backdrop-blur-xl dark:bg-slate-900/90 ${
            !item.is_read
                ? 'border-teal-500/60 ring-2 ring-teal-500/15 dark:border-teal-500/50 shadow-sm'
                : 'border-slate-200/80 dark:border-slate-800'
        }`}>
            <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${badgeStyle}`}>
                    <ChannelIcon size={18} />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            {!item.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500 animate-pulse" />}
                            <h3 className="truncate text-xs font-black text-slate-900 dark:text-white" title={title}>
                                {title}
                            </h3>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${priStyle}`}>
                                {isAr ? translatePriority(priority) : priority}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusClass}`}>
                                {isAr ? translateStatus(item.status) : item.status}
                            </span>
                        </div>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                            <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-bold">
                    <CategoryIcon size={12} aria-hidden="true" />
                            <span>{isAr ? translateCategory(categoryLabel) : categoryLabel}</span>
                        </span>
                        <span>•</span>
                        <span>{item.channel}</span>
                        <span>•</span>
                        <span className="font-mono">{formatDate(item.created_at, language)}</span>
                        {item.recipient && (
                            <>
                                <span>•</span>
                                <span className="max-w-[220px] truncate text-slate-600 dark:text-slate-300 font-mono" title={item.recipient}>
                                    {item.recipient}
                                </span>
                            </>
                        )}
                        {item.patient_mrn && (
                            <>
                                <span>•</span>
                                <span dir="ltr" className="font-mono text-teal-600 dark:text-teal-400 font-bold">
                                    MRN {item.patient_mrn}
                                </span>
                            </>
                        )}
                    </div>

                    {item.content && (
                        <p className={`mt-2 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300 ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                            {item.content}
                        </p>
                    )}

                    {expanded && item.status === 'Failed' && item.error_message && (
                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-500" />
                            <span>{item.error_message}</span>
                        </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            {item.action_url && (
                                <button
                                    type="button"
                                    onClick={() => onNavigate(item.action_url)}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 text-[10px] font-black text-teal-700 hover:bg-teal-500/20 transition dark:text-teal-300"
                                >
                                    <ExternalLink size={11} aria-hidden="true" />
                                    <span>{t('openTargetRecord')}</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => onCopy(item)}
                                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                            >
                                <Copy size={11} />
                                <span>{t('copy')}</span>
                            </button>
                            {!item.is_read && (
                                <button
                                    type="button"
                                    onClick={() => onMarkRead(item.notification_id)}
                                    disabled={marking}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 text-[10px] font-black text-teal-700 transition hover:bg-teal-500 hover:text-white disabled:opacity-50 dark:text-teal-300"
                                >
                                    <Check size={11} />
                                    <span>{t('markRead')}</span>
                                </button>
                            )}
                            {item.acknowledgement_status === 'Pending' && item.entity_id && (
                                <button
                                    type="button"
                                    onClick={() => onAcknowledge(item)}
                                    disabled={acknowledging}
                                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 text-[10px] font-black text-rose-700 transition hover:bg-rose-600 hover:text-white disabled:opacity-50 dark:text-rose-300"
                                >
                                    <ShieldCheck size={11} />
                                    <span>{t('acknowledgeCriticalResult')}</span>
                                </button>
                            )}
                        </div>

                            <button
                                type="button"
                                onClick={onToggle}
                                aria-expanded={expanded}
                                aria-label={expanded ? (t('collapseDetails')) : (t('showDetails'))}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                        >
                            <span>{expanded ? (t('collapse')) : (t('details'))}</span>
                            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
};

// ─── Helpers & Utilities ──────────────────────────────────────────────────

function OUTBOUND_ROLES_CHECK(role) {
    return OUTBOUND_LOG_ROLES.has(role);
}

const normalizePriority = (priority, eventType = '') => {
    const value = String(priority || '').trim().toLowerCase();
    if (value === 'critical') return 'Critical';
    if (value === 'warning') return 'Warning';
    if (value === 'action' || value === 'high') return 'Action';
    if (value === 'normal' || value === 'low') return 'Normal';
    const event = String(eventType).toUpperCase();
    return event.includes('STAT') || event.includes('CRITICAL') ? 'Critical' : 'Normal';
};

const getNotificationCategory = (item = {}) => {
    const metadata = item.category || item.event_category || item.category_metadata?.key || item.category_metadata?.name;
    const knownCategories = ['Security', 'Clinical', 'Financial', 'Operational', 'Patient', 'System'];
    const fromMetadata = knownCategories.find((category) => String(metadata || '').toLowerCase() === category.toLowerCase());
    if (fromMetadata) return fromMetadata;

    const ev = `${item.event_type || ''} ${item.subject || ''} ${item.content || ''}`.toUpperCase();
    if (ev.includes('SECURITY') || ev.includes('LOGIN') || ev.includes('AUTH') || ev.includes('TOKEN') || ev.includes('PERMISSION')) return 'Security';
    if (ev.includes('PAYMENT') || ev.includes('INVOICE') || ev.includes('BILLING') || ev.includes('CLAIM') || ev.includes('REFUND') || ev.includes('PAYROLL')) return 'Financial';
    if (ev.includes('PATIENT') || ev.includes('APPOINTMENTREQUEST') || ev.includes('PROFILEUPDATE') || ev.includes('DOCUMENTDOWNLOADED')) return 'Patient';
    if (ev.includes('EXAM') || ev.includes('REPORT') || ev.includes('PACS') || ev.includes('STUDY') || ev.includes('DIAGNOSTIC')) return 'Clinical';
    if (ev.includes('SYSTEM') || ev.includes('BACKUP') || ev.includes('STAFF_')) return 'System';
    return 'Operational';
};

const getCategoryIcon = (eventType = '', category) => {
    switch (getNotificationCategory({ event_type: eventType, category })) {
        case 'Security': return Shield;
        case 'Financial': return DollarSign;
        case 'Patient': return Users;
        case 'Clinical': return Stethoscope;
        case 'System': return Settings;
        case 'Operational': return Activity;
        default: return AlertOctagon;
    }
};

const translateCategory = (category) => ({
    Security: 'الأمان',
    Clinical: 'سريري',
    Financial: 'مالي',
    Operational: 'تشغيلي',
    Patient: 'المريض',
    System: 'النظام'
}[category] || category);

const getStatusClass = (status) => {
    if (status === 'Failed') return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
    if (status === 'Pending') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    if (status === 'Sent' || status === 'Delivered') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300';
};

const translatePriority = (priority) => {
    switch (priority) {
        case 'Critical': return 'عاجل جداً';
        case 'Warning': return 'تحذير';
        case 'Action': return 'إجراء';
        case 'Normal': return 'عادي';
        // Keep legacy values readable if an older record is returned.
        case 'High': return 'إجراء';
        case 'Low': return 'عادي';
        default: return priority;
    }
};

const translateStatus = (status) => {
    switch (status) {
        case 'Delivered': return 'تم التسليم';
        case 'Sent': return 'تم الإرسال';
        case 'Pending': return 'قيد الانتظار';
        case 'Failed': return 'فشل التسليم';
        default: return status || '—';
    }
};

const translateGroupKey = (key, isAr) => {
    if (!isAr) {
        switch (key) {
            case 'today': return 'Today';
            case 'yesterday': return 'Yesterday';
            case 'week': return 'This Week';
            default: return 'Older';
        }
    }
    switch (key) {
        case 'today': return 'اليوم';
        case 'yesterday': return 'أمس';
        case 'week': return 'هذا الأسبوع';
        default: return 'أقدم من ذلك';
    }
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
