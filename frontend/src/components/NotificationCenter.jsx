import {
    useCallback,
    useDeferredValue,
    forwardRef,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    AlertTriangle,
    Bell,
    Check,
    CheckCheck,
    ChevronDown,
    Clock3,
    Copy,
    Filter,
    Mail,
    MessageSquare,
    RefreshCw,
    Search,
    Send,
    Smartphone,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetNotificationsQuery,
    useMarkAllNotificationsReadMutation,
    useMarkNotificationReadMutation,
    useSendManualNotificationMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';

const CHANNELS = ['all', 'Email', 'SMS', 'WhatsApp', 'InApp'];
const SEND_CHANNELS = ['Email', 'SMS', 'WhatsApp'];
const STATUSES = ['all', 'Sent', 'Delivered', 'Pending', 'Failed'];
const TABS = ['all', 'unread', 'failed'];
const GROUPS = ['today', 'yesterday', 'week', 'older'];

const CHANNEL_ICONS = {
    Email: Mail,
    SMS: Smartphone,
    WhatsApp: MessageSquare,
    InApp: Bell
};

const STATUS_STYLES = {
    Sent: {
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
        icon: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20'
    },
    Delivered: {
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
        icon: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20'
    },
    Pending: {
        badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
        icon: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20'
    },
    Failed: {
        badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
        icon: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20'
    },
    default: {
        badge: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300',
        icon: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10'
    }
};

const EMPTY_MANUAL_FORM = {
    recipient: '',
    subject: '',
    body: '',
    channel: 'Email'
};

const cx = (...classes) => classes.filter(Boolean).join(' ');

const fieldClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-field)] dark:text-[var(--rcms-ink)] dark:focus:ring-cyan-500/15';

const getStatusStyle = (status) => STATUS_STYLES[status] || STATUS_STYLES.default;

const getLocale = (language) => (language?.startsWith('ar') ? 'ar-EG' : 'en-GB');

const formatTime = (value, t, language) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));

    if (elapsedMinutes < 1) {
        return t('notifications.time.now', { defaultValue: 'Now' });
    }

    if (elapsedMinutes < 60) {
        return t('notifications.time.minutes', {
            count: elapsedMinutes,
            defaultValue: `${elapsedMinutes}m ago`
        });
    }

    if (elapsedMinutes < 1440) {
        const hours = Math.floor(elapsedMinutes / 60);
        return t('notifications.time.hours', {
            count: hours,
            defaultValue: `${hours}h ago`
        });
    }

    return new Intl.DateTimeFormat(getLocale(language), {
        day: '2-digit',
        month: 'short',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    }).format(date);
};

const getGroupKey = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'older';

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfItem = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.round((startOfToday - startOfItem) / 86400000);

    if (daysAgo <= 0) return 'today';
    if (daysAgo === 1) return 'yesterday';
    if (daysAgo < 7) return 'week';
    return 'older';
};

const IconButton = forwardRef(({ label, children, className, ...props }, ref) => (
    <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cx(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition',
            'hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-muted)] dark:hover:bg-[var(--rcms-surface-hover)] dark:hover:text-[var(--rcms-ink)] dark:focus-visible:ring-offset-[var(--rcms-canvas)]',
            className
        )}
        {...props}
    >
        {children}
    </button>
));

IconButton.displayName = 'IconButton';

const FilterSelect = ({ label, value, onChange, children }) => (
    <label className="block">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        <select value={value} onChange={onChange} className={fieldClass}>
            {children}
        </select>
    </label>
);

const NotificationItem = ({
    notification,
    expanded,
    language,
    marking,
    onCopy,
    onMarkRead,
    onToggle,
    t
}) => {
    const ChannelIcon = CHANNEL_ICONS[notification.channel] || Bell;
    const statusStyle = getStatusStyle(notification.status);
    const contentId = `notification-content-${notification.notification_id}`;
    const title = notification.subject || notification.event_type || notification.channel;
    const timeLabel = formatTime(notification.created_at, t, language);

    return (
        <article
            className={cx(
                'group rounded-lg border bg-white p-3 transition dark:bg-[var(--rcms-surface-raised)]',
                notification.is_read
                    ? 'border-slate-200 hover:border-slate-300 dark:border-[var(--rcms-line)] dark:hover:border-[var(--rcms-line-strong)]'
                    : 'border-slate-300 ring-1 ring-slate-200 dark:border-cyan-300/25 dark:ring-cyan-300/15'
            )}
        >
            <div className="flex items-start gap-3">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-muted)]">
                    <ChannelIcon size={16} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                    <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={contentId}
                        onClick={onToggle}
                        className="block w-full rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
                    >
                        <span className="flex items-start gap-2">
                            {!notification.is_read && (
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-900 dark:bg-white" aria-label={t('notifications.unread', { defaultValue: 'Unread' })} />
                            )}
                            <span className="min-w-0 flex-1">
                                <span className={cx('block truncate text-sm text-slate-900 dark:text-[var(--rcms-ink)]', notification.is_read ? 'font-semibold' : 'font-bold')}>
                                    {title}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    <span>{t(`notifications.channels.${notification.channel}`, { defaultValue: notification.channel })}</span>
                                    <span aria-hidden="true">/</span>
                                    <span>{timeLabel}</span>
                                    {notification.recipient ? <span className="max-w-[180px] truncate text-slate-600 dark:text-slate-300">{notification.recipient}</span> : null}
                                    {notification.patient_mrn ? <span dir="ltr">MRN {notification.patient_mrn}</span> : null}
                                </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                                <span className={cx('hidden rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:inline-flex', statusStyle.badge)}>
                                    {t(`notifications.status.${notification.status}`, { defaultValue: notification.status })}
                                </span>
                                <ChevronDown size={15} className={cx('mt-0.5 text-slate-400 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                            </span>
                        </span>
                    </button>

                    {notification.content && !expanded && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{notification.content}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onCopy(notification)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-[var(--rcms-line)] dark:text-[var(--rcms-muted)] dark:hover:bg-[var(--rcms-surface-hover)]"
                        >
                            <Copy size={13} />
                            {t('notifications.copy', { defaultValue: 'Copy' })}
                        </button>

                        {!notification.is_read && (
                            <button
                                type="button"
                                onClick={() => onMarkRead(notification.notification_id)}
                                disabled={marking}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                            >
                                {marking ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                                {t('notifications.markSingle', { defaultValue: 'Mark read' })}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {expanded && (
                <div
                    id={contentId}
                    className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-5 text-slate-600 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)] dark:text-[var(--rcms-muted)] sm:ms-11"
                >
                    {notification.content && <p className="whitespace-pre-wrap font-medium">{notification.content}</p>}

                    {notification.event_type && (
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {t('notifications.eventType', { defaultValue: 'Event type' })}: {notification.event_type}
                        </p>
                    )}

                    {notification.status === 'Failed' && notification.error_message && (
                        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold leading-5 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                            <span>{notification.error_message}</span>
                        </div>
                    )}
                </div>
            )}
        </article>
    );
};

const NotificationCenter = ({ isOpen, onClose, unreadCount = 0, canSendManual = false }) => {
    const { t, i18n } = useTranslation('system');
    const titleId = useId();
    const panelRef = useRef(null);
    const closeButtonRef = useRef(null);
    const previousFocusRef = useRef(null);

    const [activeTab, setActiveTab] = useState('all');
    const [channelFilter, setChannelFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [showManualSend, setShowManualSend] = useState(false);
    const [markingId, setMarkingId] = useState(null);
    const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);

    const deferredSearchTerm = useDeferredValue(searchTerm);

    const {
        data: notificationsResponse,
        isLoading,
        isFetching,
        refetch
    } = useGetNotificationsQuery(
        { limit: 120 },
        {
            skip: !isOpen,
            pollingInterval: isOpen ? 30000 : 0,
            refetchOnFocus: true,
            refetchOnReconnect: true
        }
    );

    const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
    const [markRead] = useMarkNotificationReadMutation();
    const [sendManual, { isLoading: isSending }] = useSendManualNotificationMutation();

    const notifications = useMemo(() => {
        const items = Array.isArray(notificationsResponse)
            ? notificationsResponse
            : Array.isArray(notificationsResponse?.items)
                ? notificationsResponse.items
                : [];

        return [...items].sort((a, b) => (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
    }, [notificationsResponse]);

    const counts = useMemo(() => {
        const fallback = {
            all: notifications.length,
            unread: notifications.filter((item) => !item.is_read).length,
            failed: notifications.filter((item) => item.status === 'Failed').length,
            pending: notifications.filter((item) => item.status === 'Pending').length,
            sent: notifications.filter((item) => item.status === 'Sent').length
        };

        return {
            ...fallback,
            ...(notificationsResponse?.counts || {})
        };
    }, [notifications, notificationsResponse]);

    const effectiveUnreadCount = Math.max(Number(counts.unread) || 0, Number(unreadCount) || 0);

    useEffect(() => {
        if (!isOpen) return undefined;

        previousFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== 'Tab' || !panelRef.current) return;

            const focusableElements = panelRef.current.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            );

            if (!focusableElements.length) return;

            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) return;

        setExpandedId(null);
        setSearchTerm('');
        setChannelFilter('all');
        setStatusFilter('all');
        setActiveTab('all');
        setShowFilters(false);
        setShowManualSend(false);
        setManualForm(EMPTY_MANUAL_FORM);
        setMarkingId(null);
    }, [isOpen]);

    const filteredNotifications = useMemo(() => {
        const normalizedTerm = deferredSearchTerm.trim().toLocaleLowerCase(getLocale(i18n.language));

        return notifications.filter((notification) => {
            const matchesTab =
                activeTab === 'all' ||
                (activeTab === 'unread' && !notification.is_read) ||
                (activeTab === 'failed' && notification.status === 'Failed');

            const matchesChannel = channelFilter === 'all' || notification.channel === channelFilter;
            const matchesStatus = statusFilter === 'all' || notification.status === statusFilter;

            if (!matchesTab || !matchesChannel || !matchesStatus) return false;
            if (!normalizedTerm) return true;

            const searchableText = [
                notification.subject,
                notification.event_type,
                notification.channel,
                notification.status,
                notification.recipient,
                notification.content,
                notification.patient_mrn
            ]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase(getLocale(i18n.language));

            return searchableText.includes(normalizedTerm);
        });
    }, [activeTab, channelFilter, deferredSearchTerm, i18n.language, notifications, statusFilter]);

    const groupedNotifications = useMemo(() => {
        const grouped = GROUPS.reduce((accumulator, key) => {
            accumulator[key] = [];
            return accumulator;
        }, {});

        filteredNotifications.forEach((notification) => {
            grouped[getGroupKey(notification.created_at)].push(notification);
        });

        return GROUPS.map((key) => [key, grouped[key]]).filter(([, items]) => items.length > 0);
    }, [filteredNotifications]);

    const activeFilterCount = Number(channelFilter !== 'all') + Number(statusFilter !== 'all');

    const handleMarkAllRead = useCallback(async () => {
        try {
            await markAllRead().unwrap();
            toast.success(t('notifications.allRead', { defaultValue: 'All notifications marked as read' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('notifications.failed', { defaultValue: 'Action failed' })));
        }
    }, [markAllRead, t]);

    const handleMarkRead = useCallback(async (notificationId) => {
        setMarkingId(notificationId);

        try {
            await markRead(notificationId).unwrap();
            toast.success(t('notifications.read', { defaultValue: 'Notification marked as read' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('notifications.failed', { defaultValue: 'Action failed' })));
        } finally {
            setMarkingId(null);
        }
    }, [markRead, t]);

    const handleCopy = useCallback(async (notification) => {
        const text = [notification.subject, notification.recipient, notification.content]
            .filter(Boolean)
            .join('\n\n');

        try {
            await navigator.clipboard.writeText(text);
            toast.success(t('notifications.copied', { defaultValue: 'Copied to clipboard' }));
        } catch {
            toast.error(t('notifications.copyFailed', { defaultValue: 'Could not copy notification' }));
        }
    }, [t]);

    const handleManualSend = useCallback(async (event) => {
        event.preventDefault();

        const recipient = manualForm.recipient.trim();
        const body = manualForm.body.trim();

        if (!recipient || !body) return;

        const payload = {
            channel: manualForm.channel,
            subject: manualForm.channel === 'Email' ? manualForm.subject.trim() || undefined : undefined,
            body,
            ...(manualForm.channel === 'Email'
                ? { recipientEmail: recipient }
                : { recipientPhone: recipient })
        };

        try {
            await sendManual(payload).unwrap();
            toast.success(t('notifications.sent', { defaultValue: 'Notification sent' }));
            setManualForm(EMPTY_MANUAL_FORM);
            setShowManualSend(false);
        } catch (error) {
            toast.error(getErrorMessage(error, t('notifications.sendFailed', { defaultValue: 'Could not send notification' })));
        }
    }, [manualForm, sendManual, t]);

    const resetFilters = () => {
        setChannelFilter('all');
        setStatusFilter('all');
    };

    if (!isOpen || typeof document === 'undefined') return null;

    const emptyMessage = searchTerm || activeFilterCount
        ? t('notifications.empty.filtered', { defaultValue: 'No notifications match the current filters.' })
        : t(`notifications.empty.${activeTab}`, { defaultValue: 'No notifications to display.' });

    const recipientPlaceholder = manualForm.channel === 'Email'
        ? t('notifications.recipientEmail', { defaultValue: 'Recipient email' })
        : t('notifications.recipientPhone', { defaultValue: 'Recipient phone' });

    return createPortal(
        <div className="fixed inset-0 z-[70]">
            <button
                type="button"
                tabIndex={-1}
                aria-label={t('notifications.close', { defaultValue: 'Close notifications' })}
                onClick={onClose}
                className="absolute inset-0 h-full w-full cursor-default bg-slate-950/35 dark:bg-slate-950/68"
            />

            <aside
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-white dark:bg-[var(--rcms-surface)] sm:inset-y-3 sm:end-3 sm:start-auto sm:w-[min(520px,calc(100vw-24px))] sm:rounded-lg sm:border sm:border-slate-200 sm:shadow-md dark:sm:border-[var(--rcms-line)]"
            >
                <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)] sm:px-5 sm:pt-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-cyan-400/12 dark:text-cyan-100 dark:ring-1 dark:ring-cyan-300/20">
                                <Bell size={20} />
                            </span>
                            <div className="min-w-0">
                                <h2 id={titleId} className="truncate text-base font-semibold text-slate-950 dark:text-[var(--rcms-ink)]">
                                    {t('notifications.title', { defaultValue: 'Notification center' })}
                                </h2>
                                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {effectiveUnreadCount > 0
                                        ? t('notifications.summaryUnread', {
                                            count: effectiveUnreadCount,
                                            defaultValue: `${effectiveUnreadCount} unread`
                                        })
                                        : t('notifications.allCaughtUp', { defaultValue: 'You are all caught up' })}
                                    <span aria-hidden="true" className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>
                                    {counts.pending > 0
                                        ? t('notifications.summaryPending', {
                                            count: counts.pending,
                                            defaultValue: `${counts.pending} pending`
                                        })
                                        : t('notifications.summaryTotal', {
                                            count: counts.all,
                                            defaultValue: `${counts.all} total`
                                        })}
                                </p>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                            {canSendManual && (
                                <IconButton
                                    label={t('notifications.manual', { defaultValue: 'Send notification' })}
                                    aria-pressed={showManualSend}
                                    onClick={() => setShowManualSend((current) => !current)}
                                    className={showManualSend ? 'border-slate-900 bg-slate-900 text-white dark:border-cyan-300/30 dark:bg-cyan-300/15 dark:text-cyan-50' : ''}
                                >
                                    <Send size={16} />
                                </IconButton>
                            )}
                            <IconButton
                                label={t('notifications.refresh', { defaultValue: 'Refresh' })}
                                onClick={() => refetch()}
                                disabled={isFetching}
                            >
                                <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                            </IconButton>
                            {effectiveUnreadCount > 0 && (
                                <IconButton
                                    label={t('notifications.markRead', { defaultValue: 'Mark all as read' })}
                                    onClick={handleMarkAllRead}
                                    disabled={markingAll}
                                    className="text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-300 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/30"
                                >
                                    {markingAll ? <RefreshCw size={16} className="animate-spin" /> : <CheckCheck size={16} />}
                                </IconButton>
                            )}
                            <IconButton
                                ref={closeButtonRef}
                                label={t('notifications.close', { defaultValue: 'Close' })}
                                onClick={onClose}
                            >
                                <X size={17} />
                            </IconButton>
                        </div>
                    </div>
                </header>

                {canSendManual && showManualSend && (
                    <form
                        onSubmit={handleManualSend}
                        className="shrink-0 space-y-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)]/70 sm:px-5"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-[var(--rcms-ink)]">
                                    {t('notifications.composeTitle', { defaultValue: 'New notification' })}
                                </h3>
                                <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {t('notifications.composeHint', { defaultValue: 'Send a direct message through the selected channel.' })}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowManualSend(false)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-[var(--rcms-surface-hover)] dark:hover:text-[var(--rcms-ink)]"
                                aria-label={t('notifications.closeComposer', { defaultValue: 'Close composer' })}
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_128px]">
                            <input
                                value={manualForm.recipient}
                                onChange={(event) => setManualForm((current) => ({ ...current, recipient: event.target.value }))}
                                placeholder={recipientPlaceholder}
                                type={manualForm.channel === 'Email' ? 'email' : 'tel'}
                                autoComplete={manualForm.channel === 'Email' ? 'email' : 'tel'}
                                required
                                className="h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-field)] dark:text-[var(--rcms-ink)] dark:focus:ring-cyan-500/15"
                            />
                            <select
                                value={manualForm.channel}
                                onChange={(event) => setManualForm((current) => ({
                                    ...current,
                                    channel: event.target.value,
                                    subject: event.target.value === 'Email' ? current.subject : ''
                                }))}
                                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-field)] dark:text-[var(--rcms-ink)] dark:focus:ring-cyan-500/15"
                            >
                                {SEND_CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}
                            </select>
                        </div>

                        {manualForm.channel === 'Email' && (
                            <input
                                value={manualForm.subject}
                                onChange={(event) => setManualForm((current) => ({ ...current, subject: event.target.value }))}
                                placeholder={t('notifications.subject', { defaultValue: 'Subject' })}
                                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-field)] dark:text-[var(--rcms-ink)] dark:focus:ring-cyan-500/15"
                            />
                        )}

                        <div className="relative">
                            <textarea
                                value={manualForm.body}
                                onChange={(event) => setManualForm((current) => ({ ...current, body: event.target.value }))}
                                placeholder={t('notifications.message', { defaultValue: 'Message' })}
                                required
                                maxLength={2000}
                                rows={3}
                                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 pb-7 pt-2.5 text-xs font-medium leading-5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-field)] dark:text-[var(--rcms-ink)] dark:focus:ring-cyan-500/15"
                            />
                            <span className="pointer-events-none absolute bottom-2 end-3 text-[10px] font-bold text-slate-400">
                                {manualForm.body.length}/2000
                            </span>
                        </div>

                        <button
                            type="submit"
                            disabled={isSending || !manualForm.recipient.trim() || !manualForm.body.trim()}
                            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200 dark:focus-visible:ring-offset-[var(--rcms-canvas)]"
                        >
                            {isSending ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                            {isSending
                                ? t('notifications.sending', { defaultValue: 'Sending...' })
                                : t('notifications.send', { defaultValue: 'Send notification' })}
                        </button>
                    </form>
                )}

                <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)] sm:px-5">
                    <div className="flex items-center gap-2">
                        <label className="relative min-w-0 flex-1">
                            <span className="sr-only">{t('notifications.search', { defaultValue: 'Search notifications' })}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder={t('notifications.search', { defaultValue: 'Search notifications' })}
                                className="h-11 w-full rounded-lg border border-slate-200 bg-white ps-10 pe-9 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-field)] dark:text-[var(--rcms-ink)] dark:focus:ring-cyan-500/15"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    aria-label={t('notifications.clearSearch', { defaultValue: 'Clear search' })}
                                    className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </label>

                        <button
                            type="button"
                            aria-expanded={showFilters}
                            onClick={() => setShowFilters((current) => !current)}
                            className={cx(
                                'relative inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                                showFilters || activeFilterCount
                                    ? 'border-slate-900 bg-slate-900 text-white dark:border-cyan-300/30 dark:bg-cyan-300/15 dark:text-cyan-50'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-muted)] dark:hover:bg-[var(--rcms-surface-hover)]'
                            )}
                        >
                            <Filter size={15} />
                            <span className="hidden sm:inline">{t('notifications.filters.title', { defaultValue: 'Filters' })}</span>
                            {activeFilterCount > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[9px] text-current">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1 dark:bg-[var(--rcms-surface-muted)]" role="tablist">
                        {TABS.map((tab) => (
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab}
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cx(
                                    'rounded-lg px-2 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                                    activeTab === tab
                                        ? 'bg-white text-slate-950 dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-ink)]'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-[var(--rcms-muted)] dark:hover:text-[var(--rcms-ink)]'
                                )}
                            >
                                {t(`notifications.tabs.${tab}`, { defaultValue: tab.charAt(0).toUpperCase() + tab.slice(1) })}
                                {Number(counts[tab]) > 0 && <span className="ms-1 opacity-70">{counts[tab]}</span>}
                            </button>
                        ))}
                    </div>

                    {showFilters && (
                        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)]/70">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {t('notifications.filters.advanced', { defaultValue: 'Advanced filters' })}
                                </p>
                                {activeFilterCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="text-[11px] font-bold text-cyan-700 hover:underline dark:text-cyan-300"
                                    >
                                        {t('notifications.filters.reset', { defaultValue: 'Reset' })}
                                    </button>
                                )}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <FilterSelect
                                    label={t('notifications.filters.channel', { defaultValue: 'Channel' })}
                                    value={channelFilter}
                                    onChange={(event) => setChannelFilter(event.target.value)}
                                >
                                    {CHANNELS.map((channel) => (
                                        <option key={channel} value={channel}>
                                            {channel === 'all'
                                                ? t('notifications.channels.all', { defaultValue: 'All channels' })
                                                : t(`notifications.channels.${channel}`, { defaultValue: channel })}
                                        </option>
                                    ))}
                                </FilterSelect>

                                <FilterSelect
                                    label={t('notifications.filters.status', { defaultValue: 'Status' })}
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value)}
                                >
                                    {STATUSES.map((status) => (
                                        <option key={status} value={status}>
                                            {status === 'all'
                                                ? t('notifications.status.all', { defaultValue: 'All statuses' })
                                                : t(`notifications.status.${status}`, { defaultValue: status })}
                                        </option>
                                    ))}
                                </FilterSelect>
                            </div>
                        </div>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-3 py-3 dark:bg-[var(--rcms-canvas)] sm:px-4">
                    {isLoading && (
                        <div className="flex min-h-[280px] flex-col items-center justify-center text-slate-400">
                            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white dark:bg-[var(--rcms-surface-raised)]">
                                <RefreshCw size={21} className="animate-spin" />
                            </span>
                            <p className="mt-3 text-sm font-bold">
                                {t('notifications.loading', { defaultValue: 'Loading notifications...' })}
                            </p>
                        </div>
                    )}

                    {!isLoading && filteredNotifications.length === 0 && (
                        <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-muted)]">
                                <Bell size={23} />
                            </span>
                            <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-[var(--rcms-ink)]">
                                {t('notifications.emptyTitle', { defaultValue: 'Nothing here yet' })}
                            </p>
                            <p className="mt-1 max-w-xs text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
                                {emptyMessage}
                            </p>
                            {(searchTerm || activeFilterCount) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchTerm('');
                                        resetFilters();
                                    }}
                                    className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-ink)] dark:hover:bg-[var(--rcms-surface-hover)]"
                                >
                                    {t('notifications.clearFilters', { defaultValue: 'Clear search and filters' })}
                                </button>
                            )}
                        </div>
                    )}

                    {!isLoading && groupedNotifications.map(([groupKey, items]) => (
                        <section key={groupKey} className="mb-4 last:mb-0">
                            <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:bg-[var(--rcms-canvas)] dark:text-[var(--rcms-muted)]">
                                <Clock3 size={12} />
                                {t(`notifications.groups.${groupKey}`, {
                                    defaultValue: groupKey.charAt(0).toUpperCase() + groupKey.slice(1)
                                })}
                                <span className="ms-auto rounded-full bg-slate-200 px-2 py-0.5 text-[9px] text-slate-500 dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-muted)]">
                                    {items.length}
                                </span>
                            </div>

                            <div className="space-y-2.5">
                                {items.map((notification) => (
                                    <NotificationItem
                                        key={notification.notification_id}
                                        notification={notification}
                                        expanded={expandedId === notification.notification_id}
                                        language={i18n.language}
                                        marking={markingId === notification.notification_id}
                                        onToggle={() => setExpandedId((current) => (
                                            current === notification.notification_id ? null : notification.notification_id
                                        ))}
                                        onMarkRead={handleMarkRead}
                                        onCopy={handleCopy}
                                        t={t}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>

                <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5 text-[10px] font-semibold text-slate-400 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)] sm:px-5">
                    <span>
                        {t('notifications.resultsCount', {
                            count: filteredNotifications.length,
                            defaultValue: `${filteredNotifications.length} results`
                        })}
                    </span>
                    <span aria-live="polite">
                        {isFetching && !isLoading
                            ? t('notifications.refreshing', { defaultValue: 'Refreshing...' })
                            : t('notifications.autoRefresh', { defaultValue: 'Auto-refresh every 30s' })}
                    </span>
                </footer>
            </aside>
        </div>,
        document.body
    );
};

export default NotificationCenter;
