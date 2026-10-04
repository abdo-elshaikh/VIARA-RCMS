import {
    forwardRef,
    useDeferredValue,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    AlertOctagon,
    AlertTriangle,
    Bell,
    Calendar,
    Check,
    CheckCheck,
    ChevronDown,
    Copy,
    CreditCard,
    ExternalLink,
    Filter,
    Flame,
    Mail,
    MessageSquare,
    Moon,
    RefreshCw,
    Search,
    Send,
    ShieldCheck,
    Smartphone,
    Stethoscope,
    Volume2,
    VolumeX,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetMyNotificationsQuery,
    useMarkAllMyNotificationsReadMutation,
    useMarkMyNotificationReadMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { playHospitalChime } from '../utils/audioChime';

const CHANNELS = ['all', 'Email', 'SMS', 'WhatsApp', 'InApp'];
const STATUSES = ['all', 'Sent', 'Delivered', 'Pending', 'Failed'];
const TABS = ['all', 'unread', 'critical', 'failed'];
const GROUPS = ['today', 'yesterday', 'week', 'older'];

const CATEGORY_CHIPS = [
    { id: 'all', defaultEn: 'All', defaultAr: 'الكل' },
    { id: 'clinical', defaultEn: 'Clinical', defaultAr: 'إكلينيكي', icon: Stethoscope },
    { id: 'appointments', defaultEn: 'Appointments', defaultAr: 'مواعيد', icon: Calendar },
    { id: 'billing', defaultEn: 'Billing', defaultAr: 'مالية', icon: CreditCard },
    { id: 'system', defaultEn: 'System', defaultAr: 'نظام', icon: ShieldCheck }
];

const CHANNEL_ICONS = {
    Email: Mail,
    SMS: Smartphone,
    WhatsApp: MessageSquare,
    InApp: Bell
};

const cx = (...classes) => classes.filter(Boolean).join(' ');

const getLocale = (language) => (language?.startsWith('ar') ? 'ar-EG' : 'en-GB');

const isWithinQuietHours = (preferences) => {
    if (!preferences?.notificationQuietHours) return false;
    const start = preferences?.notificationQuietStart || '22:00';
    const end = preferences?.notificationQuietEnd || '07:00';
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;
    return startMins <= endMins
        ? currentMins >= startMins && currentMins < endMins
        : currentMins >= startMins || currentMins < endMins;
};

const getNotificationPriority = (notification) => {
    if (notification.priority) {
        const p = String(notification.priority).toLowerCase();
        if (p === 'critical' || p === 'stat') return 'Critical';
        if (p === 'high' || p === 'urgent') return 'High';
        return 'Normal';
    }
    const evt = String(notification.event_type || '').toUpperCase();
    if (evt.includes('CRITICAL') || evt.includes('STAT') || evt.includes('PANIC') || evt.includes('EMERGENCY')) {
        return 'Critical';
    }
    if (evt.includes('CANCEL') || evt.includes('URGENT') || evt.includes('DELAY')) {
        return 'High';
    }
    return 'Normal';
};

const getNotificationCategory = (notification) => {
    if (notification.category) {
        const cat = String(notification.category).toLowerCase();
        if (cat.includes('clinic') || cat.includes('exam') || cat.includes('pacs') || cat.includes('report') || cat.includes('lab')) return 'clinical';
        if (cat.includes('appoint') || cat.includes('sched')) return 'appointments';
        if (cat.includes('bill') || cat.includes('pay') || cat.includes('cash')) return 'billing';
        if (cat.includes('sys') || cat.includes('auth') || cat.includes('sec')) return 'system';
    }
    const evt = String(notification.event_type || '').toUpperCase();
    if (evt.includes('EXAM') || evt.includes('REPORT') || evt.includes('STUDY') || evt.includes('IMAGE') || evt.includes('DICOM') || evt.includes('RESULT') || evt.includes('LAB')) {
        return 'clinical';
    }
    if (evt.includes('APPOINTMENT') || evt.includes('SCHEDULE') || evt.includes('BOOK')) {
        return 'appointments';
    }
    if (evt.includes('PAYMENT') || evt.includes('INVOICE') || evt.includes('CASH') || evt.includes('BILL') || evt.includes('FINANCIAL')) {
        return 'billing';
    }
    return 'system';
};

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

const formatFullDate = (value, language) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(getLocale(language), {
        dateStyle: 'medium',
        timeStyle: 'short'
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

const IconButton = forwardRef(({ label, children, className, active, ...props }, ref) => (
    <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        data-active={active ? 'true' : undefined}
        className={cx('vx-icon-btn !h-8 !w-8', className)}
        {...props}
    >
        {children}
    </button>
));

IconButton.displayName = 'IconButton';

const FilterSelect = ({ label, value, onChange, children }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--VIARA-muted)]">{label}</span>
        <select value={value} onChange={onChange} className="vx-field">
            {children}
        </select>
    </label>
);

const NotificationItem = ({
    notification,
    expanded,
    language,
    isArabic,
    marking,
    onCopy,
    onCopyMrn,
    onMarkRead,
    onToggle,
    onNavigate,
    t
}) => {
    const priority = getNotificationPriority(notification);
    const category = getNotificationCategory(notification);
    const ChannelIcon = CHANNEL_ICONS[notification.channel] || Bell;
    const isCritical = priority === 'Critical';
    const isHigh = priority === 'High';
    const isUnread = !notification.is_read;
    const contentId = `notification-content-${notification.notification_id}`;
    const title = notification.subject || notification.event_type || notification.channel;
    const timeLabel = formatTime(notification.created_at, t, language);
    const fullDateLabel = formatFullDate(notification.created_at, language);

    return (
        <article
            className="vx-notif-item"
            data-critical={isCritical ? 'true' : undefined}
        >
            <span className="vx-notif-icon" data-state={isCritical ? 'critical' : isUnread ? 'unread' : undefined}>
                {isCritical
                    ? <Flame size={16} className="motion-safe:animate-pulse" aria-hidden="true" />
                    : <ChannelIcon size={16} aria-hidden="true" />}
            </span>

            <div className="min-w-0 flex-1">
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    onClick={onToggle}
                    className="block w-full rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)]"
                >
                    <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                            {isUnread && (
                                <span
                                    className="vx-unread-dot"
                                    data-critical={isCritical ? 'true' : undefined}
                                    role="img"
                                    aria-label={t('notifications.unread', { defaultValue: 'Unread' })}
                                />
                            )}
                            <span className={cx('truncate text-[13px] leading-5 text-[var(--VIARA-ink)]', isUnread ? 'font-bold' : 'font-semibold')}>
                                {title}
                            </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--VIARA-muted)]">
                            <time dateTime={notification.created_at} title={fullDateLabel}>{timeLabel}</time>
                            <ChevronDown
                                size={14}
                                className={cx('transition-transform duration-200', expanded && 'rotate-180')}
                                aria-hidden="true"
                            />
                        </span>
                    </span>

                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--VIARA-muted)]">
                        {isCritical && (
                            <span className="vx-tag" data-tone="danger">{isArabic ? 'طارئ' : 'STAT'}</span>
                        )}
                        {!isCritical && isHigh && (
                            <span className="vx-tag" data-tone="warn">{isArabic ? 'عاجل' : 'Urgent'}</span>
                        )}
                        <span className="font-medium">{t(`notifications.channels.${notification.channel}`, { defaultValue: notification.channel })}</span>
                        {category && category !== 'system' && (
                            <span>{t(`notifications.categories.${category}`, { defaultValue: category })}</span>
                        )}
                        {notification.recipient && (
                            <span className="max-w-[120px] truncate">{notification.recipient}</span>
                        )}
                        {notification.patient_mrn && (
                            <span dir="ltr" className="font-semibold tabular-nums text-[var(--VIARA-ink)]">MRN {notification.patient_mrn}</span>
                        )}
                    </span>
                </button>

                {notification.content && !expanded && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-[var(--VIARA-muted)]">
                        {notification.content}
                    </p>
                )}

                {(notification.action_url || isUnread) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {notification.action_url && (
                            <button type="button" data-tone="accent" onClick={() => onNavigate(notification.action_url)} className="vx-text-btn">
                                <ExternalLink size={13} aria-hidden="true" />
                                {t('notifications.openResource', { defaultValue: isArabic ? 'فتح السجل' : 'Open record' })}
                            </button>
                        )}
                        {isUnread && (
                            <button
                                type="button"
                                onClick={() => onMarkRead(notification.notification_id)}
                                disabled={marking}
                                className="vx-text-btn"
                            >
                                {marking ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                                {t('notifications.markSingle', { defaultValue: isArabic ? 'تحديد كمقروء' : 'Mark read' })}
                            </button>
                        )}
                    </div>
                )}

                {expanded && (
                    <div id={contentId} className="vx-notif-detail">
                        {notification.content && <p className="whitespace-pre-wrap">{notification.content}</p>}

                        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--VIARA-muted)]">
                            {notification.event_type && (
                                <span>{t('notifications.eventType', { defaultValue: 'Event' })}: {notification.event_type}</span>
                            )}
                            <span>{fullDateLabel}</span>
                        </p>

                        {notification.acknowledgement_status === 'Pending' && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--danger-bg,#ffe4e6)] p-2 text-xs font-semibold text-[var(--danger,#e11d48)]" role="alert">
                                <AlertOctagon size={15} className="shrink-0" aria-hidden="true" />
                                <span>{isArabic ? 'يتطلب تأكيد استلام إكلينيكي عاجل' : 'Urgent clinical acknowledgement pending'}</span>
                            </div>
                        )}

                        {notification.status === 'Failed' && notification.error_message && (
                            <div className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--danger-bg,#ffe4e6)] p-2 text-xs font-semibold text-[var(--danger,#e11d48)]" role="alert">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                                <span>{notification.error_message}</span>
                            </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => onCopy(notification)} className="vx-text-btn">
                                <Copy size={13} aria-hidden="true" />
                                {t('notifications.copy', { defaultValue: isArabic ? 'نسخ التفاصيل' : 'Copy details' })}
                            </button>
                            {notification.patient_mrn && (
                                <button type="button" onClick={() => onCopyMrn(notification.patient_mrn)} className="vx-text-btn">
                                    <Copy size={13} aria-hidden="true" />
                                    {isArabic ? 'نسخ الرقم الطبي' : 'Copy MRN'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
};

const NotificationCenter = ({
    isOpen,
    onClose,
    unreadCount = 0,
    canSendManual = false,
    preferences,
    onUpdatePreference
}) => {
    const { t, i18n } = useTranslation(['system', 'common']);
    const navigate = useNavigate();
    const titleId = useId();
    const panelRef = useRef(null);
    const closeButtonRef = useRef(null);
    const previousFocusRef = useRef(null);
    const isRtl = i18n.dir ? i18n.dir() === 'rtl' : String(i18n.language || '').startsWith('ar');
    const isArabic = Boolean(String(i18n?.resolvedLanguage || i18n?.language || '').startsWith('ar'));

    const [activeTab, setActiveTab] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [channelFilter, setChannelFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [markingId, setMarkingId] = useState(null);

    const deferredSearchTerm = useDeferredValue(searchTerm);

    const isQuietActive = useMemo(() => isWithinQuietHours(preferences), [preferences]);
    const isSoundActive = Boolean(preferences?.notificationSound);

    const {
        data: notificationsResponse,
        isLoading,
        isFetching,
        isError,
        error,
        refetch
    } = useGetMyNotificationsQuery(
        { limit: 120 },
        {
            skip: !isOpen,
            pollingInterval: isOpen ? 30000 : 0,
            refetchOnFocus: true,
            refetchOnReconnect: true
        }
    );

    const [markAllRead, { isLoading: markingAll }] = useMarkAllMyNotificationsReadMutation();
    const [markRead] = useMarkMyNotificationReadMutation();

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
        const base = {
            all: notifications.length,
            unread: notifications.filter((item) => !item.is_read).length,
            critical: notifications.filter((item) => getNotificationPriority(item) === 'Critical' && !item.is_read).length,
            failed: notifications.filter((item) => item.status === 'Failed').length,
            categories: {
                clinical: notifications.filter((item) => getNotificationCategory(item) === 'clinical' && !item.is_read).length,
                appointments: notifications.filter((item) => getNotificationCategory(item) === 'appointments' && !item.is_read).length,
                billing: notifications.filter((item) => getNotificationCategory(item) === 'billing' && !item.is_read).length,
                system: notifications.filter((item) => getNotificationCategory(item) === 'system' && !item.is_read).length
            }
        };

        return {
            ...base,
            ...(notificationsResponse?.counts || {})
        };
    }, [notifications, notificationsResponse]);

    const effectiveUnreadCount = notificationsResponse
        ? Math.max(0, Number(counts.unread) || 0)
        : Math.max(0, Number(unreadCount) || 0);

    const hasCriticalAlerts = Number(counts.critical) > 0;

    useEffect(() => {
        if (!isOpen) return undefined;

        previousFocusRef.current = document.activeElement;
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
        setSelectedCategory('all');
        setShowFilters(false);
        setMarkingId(null);
    }, [isOpen]);

    const filteredNotifications = useMemo(() => {
        const normalizedTerm = deferredSearchTerm.trim().toLocaleLowerCase(getLocale(i18n.language));

        return notifications.filter((notification) => {
            const priority = getNotificationPriority(notification);
            const category = getNotificationCategory(notification);

            const matchesTab =
                activeTab === 'all' ||
                (activeTab === 'unread' && !notification.is_read) ||
                (activeTab === 'critical' && priority === 'Critical') ||
                (activeTab === 'failed' && notification.status === 'Failed');

            const matchesCategory =
                selectedCategory === 'all' || category === selectedCategory;

            const matchesChannel =
                channelFilter === 'all' || notification.channel === channelFilter;

            const matchesStatus =
                statusFilter === 'all' || notification.status === statusFilter;

            const matchesSearch =
                !normalizedTerm ||
                String(notification.subject || '').toLocaleLowerCase(getLocale(i18n.language)).includes(normalizedTerm) ||
                String(notification.content || '').toLocaleLowerCase(getLocale(i18n.language)).includes(normalizedTerm) ||
                String(notification.recipient || '').toLocaleLowerCase(getLocale(i18n.language)).includes(normalizedTerm) ||
                String(notification.patient_mrn || '').toLocaleLowerCase(getLocale(i18n.language)).includes(normalizedTerm);

            return matchesTab && matchesCategory && matchesChannel && matchesStatus && matchesSearch;
        });
    }, [activeTab, channelFilter, deferredSearchTerm, i18n.language, notifications, selectedCategory, statusFilter]);

    const groupedNotifications = useMemo(() => {
        const groups = {
            today: [],
            yesterday: [],
            week: [],
            older: []
        };

        filteredNotifications.forEach((notification) => {
            const groupKey = getGroupKey(notification.created_at);
            groups[groupKey].push(notification);
        });

        return GROUPS.map((groupKey) => [groupKey, groups[groupKey]]).filter(
            ([, items]) => items.length > 0
        );
    }, [filteredNotifications]);

    const activeFilterCount = (channelFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (selectedCategory !== 'all' ? 1 : 0);

    const handleMarkAllRead = async () => {
        try {
            await markAllRead().unwrap();
            toast.success(t('notifications.allMarkedRead', { defaultValue: isArabic ? 'تم تحديد كل الإشعارات كمقروءة' : 'All notifications marked as read' }));
        } catch (markError) {
            toast.error(getErrorMessage(markError, t('notifications.markAllError', { defaultValue: 'Failed to mark notifications read' })));
        }
    };

    const handleMarkRead = async (notificationId) => {
        try {
            setMarkingId(notificationId);
            await markRead(notificationId).unwrap();
        } catch (markError) {
            toast.error(getErrorMessage(markError, t('notifications.markOneError', { defaultValue: 'Failed to mark notification read' })));
        } finally {
            setMarkingId(null);
        }
    };

    const handleNavigate = (url) => {
        onClose();
        navigate(url);
    };

    const handleCopy = async (notification) => {
        const text = [
            notification.subject,
            notification.content,
            notification.recipient && `Recipient: ${notification.recipient}`,
            notification.patient_mrn && `MRN: ${notification.patient_mrn}`
        ].filter(Boolean).join('\n');

        try {
            await navigator.clipboard.writeText(text);
            toast.success(t('notifications.copied', { defaultValue: isArabic ? 'تم نسخ نص الإشعار' : 'Copied notification details' }));
        } catch {
            toast.error(t('notifications.copyError', { defaultValue: 'Could not copy to clipboard' }));
        }
    };

    const handleCopyMrn = async (mrn) => {
        try {
            await navigator.clipboard.writeText(String(mrn));
            toast.success(isArabic ? `تم نسخ الرقم الطبي ${mrn}` : `Copied MRN ${mrn}`);
        } catch {
            toast.error(t('notifications.copyError', { defaultValue: 'Could not copy to clipboard' }));
        }
    };

    const handleToggleSound = () => {
        const nextState = !isSoundActive;
        if (typeof onUpdatePreference === 'function') {
            onUpdatePreference({ notificationSound: nextState });
        }
        if (nextState) {
            playHospitalChime('call');
            toast.success(isArabic ? 'تم تفعيل التنبيهات الصوتية' : 'Notification sounds enabled');
        } else {
            toast(isArabic ? 'تم كتم التنبيهات الصوتية' : 'Notification sounds muted', { icon: '🔕' });
        }
    };

    const resetFilters = () => {
        setChannelFilter('all');
        setStatusFilter('all');
        setSelectedCategory('all');
    };

    if (!isOpen || typeof document === 'undefined') return null;

    const emptyMessage = searchTerm || activeFilterCount
        ? t('notifications.empty.filtered', { defaultValue: isArabic ? 'لا توجد إشعارات تطابق التصفية الحالية.' : 'No notifications match the current filters.' })
        : t(`notifications.empty.${activeTab}`, { defaultValue: isArabic ? 'لا توجد إشعارات لعرضها حالياً.' : 'No notifications to display.' });

    return createPortal(
        <div className="fixed inset-0 z-[70]">
            <button
                type="button"
                tabIndex={-1}
                aria-label={t('notifications.close', { defaultValue: 'Close notifications' })}
                onClick={onClose}
                className="absolute inset-0 h-full w-full cursor-default bg-slate-950/20"
            />

            <aside
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                dir={isRtl ? 'rtl' : 'ltr'}
                className="vx-notif absolute end-2 top-[4.75rem] z-50 animate-in fade-in zoom-in-95 duration-150 sm:end-6"
            >
                {/* Header */}
                <header className="vx-notif-section flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id={titleId} className="truncate text-base font-bold leading-6 text-[var(--VIARA-ink)]">
                            {t('notifications.title', { defaultValue: isArabic ? 'الإشعارات' : 'Notifications' })}
                        </h2>
                        <p className="flex items-center gap-2 text-xs text-[var(--VIARA-muted)]">
                            {isQuietActive && (
                                <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400" title={isArabic ? 'وضع ساعات الهدوء نشط' : 'Quiet hours active'}>
                                    <Moon size={12} aria-hidden="true" /> {isArabic ? 'وضع الهدوء' : 'Quiet'}
                                </span>
                            )}
                            <span>
                                {effectiveUnreadCount > 0
                                    ? (isArabic ? `${effectiveUnreadCount} غير مقروء` : `${effectiveUnreadCount} unread`)
                                    : (isArabic ? 'لا جديد لديك' : 'You are all caught up')}
                            </span>
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                        {typeof onUpdatePreference === 'function' && (
                            <IconButton
                                label={isSoundActive
                                    ? (isArabic ? 'كتم التنبيهات الصوتية' : 'Mute notification chime')
                                    : (isArabic ? 'تشغيل التنبيهات الصوتية' : 'Enable notification chime')}
                                onClick={handleToggleSound}
                                active={isSoundActive}
                            >
                                {isSoundActive ? <Volume2 size={16} /> : <VolumeX size={16} />}
                            </IconButton>
                        )}
                        <IconButton label={t('notifications.refresh', { defaultValue: 'Refresh' })} onClick={() => refetch()} disabled={isFetching}>
                            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                        </IconButton>
                        {effectiveUnreadCount > 0 && (
                            <IconButton
                                label={t('notifications.markRead', { defaultValue: 'Mark all as read' })}
                                onClick={handleMarkAllRead}
                                disabled={markingAll}
                            >
                                {markingAll ? <RefreshCw size={16} className="animate-spin" /> : <CheckCheck size={17} />}
                            </IconButton>
                        )}
                        <IconButton ref={closeButtonRef} label={t('notifications.close', { defaultValue: 'Close' })} onClick={onClose}>
                            <X size={17} />
                        </IconButton>
                    </div>
                </header>

                {/* Search, tabs, categories */}
                <div className="vx-notif-section space-y-3">
                    <div className="flex items-center gap-2">
                        <label className="relative min-w-0 flex-1">
                            <span className="sr-only">{t('notifications.search', { defaultValue: 'Search notifications' })}</span>
                            <Search size={15} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--VIARA-muted)]" />
                            <input
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder={t('notifications.search', { defaultValue: isArabic ? 'ابحث في الإشعارات' : 'Search notifications' })}
                                className="vx-field !ps-9 !pe-9"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    aria-label={t('notifications.clearSearch', { defaultValue: 'Clear search' })}
                                    className="absolute end-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </label>

                        <button
                            type="button"
                            aria-expanded={showFilters}
                            aria-label={t('notifications.filters.title', { defaultValue: isArabic ? 'تصفية' : 'Filters' })}
                            title={t('notifications.filters.title', { defaultValue: isArabic ? 'تصفية' : 'Filters' })}
                            onClick={() => setShowFilters((current) => !current)}
                            data-active={showFilters || activeFilterCount ? 'true' : undefined}
                            className="vx-icon-btn !h-10 !w-10 border !border-[var(--VIARA-line)]"
                        >
                            <Filter size={16} />
                            {activeFilterCount > 0 && (
                                <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#0f766e] px-1 text-[10px] font-bold text-white">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="vx-seg" role="tablist">
                        {TABS.map((tab) => {
                            const isSelected = activeTab === tab;
                            const countVal = counts[tab];
                            return (
                                <button
                                    key={tab}
                                    type="button"
                                    role="tab"
                                    aria-selected={isSelected}
                                    data-alert={tab === 'critical' && Number(countVal) > 0 ? 'true' : undefined}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab === 'critical'
                                        ? (isArabic ? 'طارئ' : 'STAT')
                                        : t(`notifications.tabs.${tab}`, { defaultValue: tab.charAt(0).toUpperCase() + tab.slice(1) })}
                                    {Number(countVal) > 0 && <span className="vx-count">{countVal}</span>}
                                </button>
                            );
                        })}
                    </div>

                    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
                        {CATEGORY_CHIPS.map((chip) => {
                            const isSelected = selectedCategory === chip.id;
                            const unreadCategoryCount = chip.id !== 'all' ? (counts.categories?.[chip.id] || 0) : 0;
                            const ChipIcon = chip.icon;
                            return (
                                <button
                                    key={chip.id}
                                    type="button"
                                    data-testid={`category-chip-${chip.id}`}
                                    aria-pressed={isSelected}
                                    onClick={() => setSelectedCategory(chip.id)}
                                    className="vx-pill"
                                >
                                    {ChipIcon && <ChipIcon size={13} aria-hidden="true" />}
                                    <span>{isArabic ? chip.defaultAr : chip.defaultEn}</span>
                                    {unreadCategoryCount > 0 && <span className="vx-count">{unreadCategoryCount}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {showFilters && (
                        <div className="grid grid-cols-2 gap-2">
                            <FilterSelect
                                label={t('notifications.filters.channel', { defaultValue: isArabic ? 'القناة' : 'Channel' })}
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
                                label={t('notifications.filters.status', { defaultValue: isArabic ? 'الحالة' : 'Status' })}
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
                    )}
                </div>

                {/* STAT banner */}
                {hasCriticalAlerts && activeTab !== 'critical' && (
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('critical');
                            setSelectedCategory('all');
                        }}
                        className="flex w-full flex-none items-center justify-between gap-3 border-b border-[var(--VIARA-line)] bg-[var(--danger-bg,#ffe4e6)] px-4 py-2.5 text-start text-[13px] font-semibold text-[var(--danger,#e11d48)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--danger,#e11d48)]"
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-60 motion-safe:animate-ping" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                            </span>
                            <span className="truncate">
                                {isArabic
                                    ? `${counts.critical} إشعار طارئ يحتاج مراجعة فورية (STAT)`
                                    : `${counts.critical} critical / STAT alert${Number(counts.critical) === 1 ? '' : 's'} need action`}
                            </span>
                        </span>
                        <span className="shrink-0 underline">{isArabic ? 'عرض' : 'View'}</span>
                    </button>
                )}

                {/* List */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {isLoading && (
                        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-[var(--VIARA-muted)]" role="status">
                            <RefreshCw size={20} className="animate-spin" aria-hidden="true" />
                            <p className="text-sm font-medium">{t('notifications.loading', { defaultValue: 'Loading notifications...' })}</p>
                        </div>
                    )}

                    {!isLoading && isError && (
                        <div className="flex min-h-[200px] flex-col items-center justify-center px-6 text-center" role="alert">
                            <AlertTriangle size={22} className="text-[var(--danger,#e11d48)]" aria-hidden="true" />
                            <p className="mt-2 text-sm font-bold text-[var(--VIARA-ink)]">
                                {t('notifications.loadError', { defaultValue: 'Notifications could not be loaded' })}
                            </p>
                            <p className="mt-1 text-[13px] text-[var(--VIARA-muted)]">
                                {getErrorMessage(error, t('notifications.retryHint', { defaultValue: 'Check your connection and try again.' }))}
                            </p>
                            <button type="button" onClick={() => refetch()} className="vx-btn vx-btn-primary mt-4 !w-auto">
                                <RefreshCw size={15} aria-hidden="true" />
                                {t('notifications.retry', { defaultValue: 'Retry' })}
                            </button>
                        </div>
                    )}

                    {!isLoading && !isError && filteredNotifications.length === 0 && (
                        <div className="flex min-h-[200px] flex-col items-center justify-center px-6 text-center">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]">
                                <Bell size={22} aria-hidden="true" />
                            </span>
                            <p className="mt-3 text-sm font-bold text-[var(--VIARA-ink)]">
                                {t('notifications.emptyTitle', { defaultValue: isArabic ? 'لا توجد إشعارات' : 'Nothing here yet' })}
                            </p>
                            <p className="mt-1 max-w-[240px] text-[13px] leading-5 text-[var(--VIARA-muted)]">{emptyMessage}</p>
                            {(searchTerm || activeFilterCount > 0) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchTerm('');
                                        resetFilters();
                                    }}
                                    className="vx-btn vx-btn-ghost mt-4 !w-auto"
                                >
                                    {t('notifications.clearFilters', { defaultValue: isArabic ? 'مسح التصفية والبحث' : 'Clear search and filters' })}
                                </button>
                            )}
                        </div>
                    )}

                    {!isLoading && groupedNotifications.map(([groupKey, items]) => (
                        <section key={groupKey} aria-label={t(`notifications.groups.${groupKey}`, { defaultValue: groupKey })}>
                            <div className="vx-notif-group">
                                <span>
                                    {t(`notifications.groups.${groupKey}`, {
                                        defaultValue: groupKey.charAt(0).toUpperCase() + groupKey.slice(1)
                                    })}
                                </span>
                                <span className="tabular-nums">{items.length}</span>
                            </div>

                            {items.map((notification) => (
                                <NotificationItem
                                    key={notification.notification_id}
                                    notification={notification}
                                    expanded={expandedId === notification.notification_id}
                                    language={i18n.language}
                                    isArabic={isArabic}
                                    marking={markingId === notification.notification_id}
                                    onToggle={() => setExpandedId((current) => (
                                        current === notification.notification_id ? null : notification.notification_id
                                    ))}
                                    onMarkRead={handleMarkRead}
                                    onCopy={handleCopy}
                                    onCopyMrn={handleCopyMrn}
                                    onNavigate={handleNavigate}
                                    t={t}
                                />
                            ))}
                        </section>
                    ))}
                </div>

                {/* Footer */}
                <footer className="flex flex-none items-center justify-between gap-3 border-t border-[var(--VIARA-line)] px-4 py-2.5">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                navigate('/notifications');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-semibold text-[var(--VIARA-accent-dark)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)]"
                        >
                            {isArabic ? 'عرض كل الإشعارات' : 'View all notifications'}
                            <ExternalLink size={13} aria-hidden="true" className="rtl:-scale-x-100" />
                        </button>

                        {canSendManual && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    navigate('/notifications?action=compose');
                                }}
                                className="vx-text-btn"
                            >
                                <Send size={13} aria-hidden="true" className="rtl:-scale-x-100" />
                                {isArabic ? 'إرسال' : 'Send'}
                            </button>
                        )}
                    </div>

                    <span className="text-xs tabular-nums text-[var(--VIARA-muted)]">
                        {filteredNotifications.length} {isArabic ? 'إشعار' : 'items'}
                    </span>
                </footer>
            </aside>
        </div>,
        document.body
    );
};

export default NotificationCenter;