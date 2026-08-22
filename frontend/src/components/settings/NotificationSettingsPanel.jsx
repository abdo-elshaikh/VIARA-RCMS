import React, { useEffect, useMemo, useState } from 'react';
import {
    Bell,
    BellRing,
    Check,
    Clock3,
    Eye,
    EyeOff,
    Mail,
    MessageSquare,
    MonitorSmartphone,
    ShieldCheck,
    ShieldAlert,
    Users,
    Volume2,
    BarChart3,
    Inbox,
    RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser } from '../../store/authSlice';
import { selectPreferences, updateAllPreferences } from '../../store/preferencesSlice';
import { useUpdatePreferencesMutation } from '../../store/api';
import {
    useGetMyNotificationsQuery,
    useMarkMyNotificationReadMutation,
    useMarkAllMyNotificationsReadMutation,
    useGetStaffPreferencesQuery,
    useUpdateStaffPreferencesMutation,
    useGetNotificationAnalyticsQuery
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { NotificationTemplates, NotificationJobs } from '../../pages/NotificationSettings';
import { VIARA_BRAND } from '../../config/brand';

const DEFAULTS = {
    showNotificationBadge: true,
    notificationSound: false,
    soundVolume: 0.5,
    desktopNotifications: false,
    desktopNotificationPreview: false,
    desktopSystemNotifications: true,
    desktopMessageNotifications: true,
    notificationQuietHours: false,
    notificationQuietStart: '22:00',
    notificationQuietEnd: '07:00',
    criticalNotificationBypass: true
};

const notificationAdminRoles = new Set(['Developer', 'Admin']);
const analyticsRoles = new Set(['Developer', 'Admin', 'Receptionist', 'Marketing']);
const panelClass = 'rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6';

const EVENT_CATEGORIES = [
    { key: 'notify_security_event', labelKey: 'settings.notifications.categories.security', defaultLabel: 'Security events', icon: ShieldAlert, descKey: 'settings.notifications.categories.securityDesc', defaultDesc: 'Login failures, lockouts, token reuse, and permission denials.' },
    { key: 'notify_staff_lifecycle', labelKey: 'settings.notifications.categories.staffLifecycle', defaultLabel: 'Staff lifecycle', icon: Users, descKey: 'settings.notifications.categories.staffLifecycleDesc', defaultDesc: 'New hires, role changes, and deactivations.' },
    { key: 'notify_order_events', labelKey: 'settings.notifications.categories.orderEvents', defaultLabel: 'Order & exam events', icon: Bell, descKey: 'settings.notifications.categories.orderEventsDesc', defaultDesc: 'New orders, exams created, scheduled, and status changes.' },
    { key: 'notify_queue_change', labelKey: 'settings.notifications.categories.queueChange', defaultLabel: 'Queue changes', icon: Bell, descKey: 'settings.notifications.categories.queueChangeDesc', defaultDesc: 'Patient flow, waiting list, and appointment no-shows.' },
    { key: 'notify_pacs_alert', labelKey: 'settings.notifications.categories.pacsAlert', defaultLabel: 'PACS & imaging', icon: Bell, descKey: 'settings.notifications.categories.pacsAlertDesc', defaultDesc: 'Study imports, exports, AI analysis, and viewer access.' },
    { key: 'notify_backup_status', labelKey: 'settings.notifications.categories.backupStatus', defaultLabel: 'Backup status', icon: Bell, descKey: 'settings.notifications.categories.backupStatusDesc', defaultDesc: 'Backup completion, failures, and retention alerts.' },
    { key: 'notify_privacy_request', labelKey: 'settings.notifications.categories.privacyRequest', defaultLabel: 'Privacy requests', icon: ShieldCheck, descKey: 'settings.notifications.categories.privacyRequestDesc', defaultDesc: 'Data exports, consent revocations, and privacy resolutions.' },
    { key: 'notify_chat_message', labelKey: 'settings.notifications.categories.chatMessage', defaultLabel: 'Chat messages', icon: MessageSquare, descKey: 'settings.notifications.categories.chatMessageDesc', defaultDesc: 'Staff chat, patient portal, and doctor inquiry messages.' },
    { key: 'notify_inventory_expiry', labelKey: 'settings.notifications.categories.inventoryExpiry', defaultLabel: 'Inventory expiry', icon: Bell, descKey: 'settings.notifications.categories.inventoryExpiryDesc', defaultDesc: 'Expired items, purchase orders, and stock alerts.' },
    { key: 'notify_claim_update', labelKey: 'settings.notifications.categories.claimUpdate', defaultLabel: 'Claim updates', icon: Bell, descKey: 'settings.notifications.categories.claimUpdateDesc', defaultDesc: 'Submitted, approved, rejected, and paid claims.' },
    { key: 'notify_payment_update', labelKey: 'settings.notifications.categories.paymentUpdate', defaultLabel: 'Payment updates', icon: Bell, descKey: 'settings.notifications.categories.paymentUpdateDesc', defaultDesc: 'Payments received, refunds processed, and invoice events.' }
];

const DELIVERY_CHANNELS = [
    { key: 'email_enabled', labelKey: 'settings.notifications.channels.email', defaultLabel: 'Email', icon: Mail },
    { key: 'sms_enabled', labelKey: 'settings.notifications.channels.sms', defaultLabel: 'SMS', icon: MessageSquare },
    { key: 'whatsapp_enabled', labelKey: 'settings.notifications.channels.whatsapp', defaultLabel: 'WhatsApp', icon: MessageSquare },
    { key: 'inapp_enabled', labelKey: 'settings.notifications.channels.inApp', defaultLabel: 'In-app', icon: Inbox }
];

export default function NotificationSettingsPanel() {
    const { t } = useTranslation(['settings', 'common']);
    const dispatch = useDispatch();
    const currentUser = useSelector(selectCurrentUser);
    const stored = useSelector(selectPreferences);
    const preferences = useMemo(() => ({ ...DEFAULTS, ...(stored || {}) }), [stored]);
    const [permission, setPermission] = useState(
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
    );
    const [updatePreferences, { isLoading: isPrefsLoading }] = useUpdatePreferencesMutation();

    const canAdminister = notificationAdminRoles.has(currentUser?.role);
    const canViewAnalytics = analyticsRoles.has(currentUser?.role);

    const {
        data: staffPrefs,
        isLoading: isStaffLoading,
        isError: isStaffError,
        refetch: refetchStaffPrefs
    } = useGetStaffPreferencesQuery();
    const [updateStaffPrefs, { isLoading: isStaffUpdating }] = useUpdateStaffPreferencesMutation();

    const {
        data: myNotifications,
        isLoading: isNotifLoading,
        isError: isNotifError,
        refetch: refetchNotifs
    } = useGetMyNotificationsQuery({ limit: 20 });
    const [markRead, { isLoading: isMarkingRead }] = useMarkMyNotificationReadMutation();
    const [markAllRead, { isLoading: isMarkingAllRead }] = useMarkAllMyNotificationsReadMutation();

    const {
        data: analytics,
        isLoading: isAnalyticsLoading,
        isError: isAnalyticsError,
        refetch: refetchAnalytics
    } = useGetNotificationAnalyticsQuery(
        { startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] },
        { skip: !canViewAnalytics }
    );

    const [staffForm, setStaffForm] = useState({});
    const [savedStaffForm, setSavedStaffForm] = useState({});

    useEffect(() => {
        if (!staffPrefs) return;
        const next = {
            email_enabled: !!staffPrefs.email_enabled,
            sms_enabled: !!staffPrefs.sms_enabled,
            whatsapp_enabled: !!staffPrefs.whatsapp_enabled,
            inapp_enabled: !!staffPrefs.inapp_enabled,
            notify_security_event: !!staffPrefs.notify_security_event,
            notify_staff_lifecycle: !!staffPrefs.notify_staff_lifecycle,
            notify_order_events: !!staffPrefs.notify_order_events,
            notify_queue_change: !!staffPrefs.notify_queue_change,
            notify_pacs_alert: !!staffPrefs.notify_pacs_alert,
            notify_backup_status: !!staffPrefs.notify_backup_status,
            notify_privacy_request: !!staffPrefs.notify_privacy_request,
            notify_chat_message: !!staffPrefs.notify_chat_message,
            notify_inventory_expiry: !!staffPrefs.notify_inventory_expiry,
            notify_claim_update: !!staffPrefs.notify_claim_update,
            notify_payment_update: !!staffPrefs.notify_payment_update,
            quiet_hours_enabled: !!staffPrefs.quiet_hours_enabled,
            quiet_hours_start: String(staffPrefs.quiet_hours_start ?? 22).padStart(2, '0') + ':00',
            quiet_hours_end: String(staffPrefs.quiet_hours_end ?? 7).padStart(2, '0') + ':00'
        };
        setStaffForm(next);
        setSavedStaffForm(next);
    }, [staffPrefs]);

    const persistStaffPrefs = async (changes) => {
        if (isStaffError || !staffPrefs) {
            toast.error(t('settings.notifications.preferencesUnavailable', { defaultValue: 'Notification preferences are unavailable. Reload them before saving.' }));
            return;
        }
        const previous = staffForm;
        const next = { ...staffForm, ...changes };
        setStaffForm(next);
        try {
            await updateStaffPrefs(next).unwrap();
            setSavedStaffForm(next);
            toast.success(t('settings.notifications.saved', { defaultValue: 'Notification settings saved.' }));
        } catch (error) {
            setStaffForm(previous);
            toast.error(getErrorMessage(error, t('settings.notifications.saveFailed', { defaultValue: 'Notification settings could not be saved.' })));
        }
    };

    const handleDesktopPersist = async (changes) => {
        const previous = preferences;
        const next = { ...preferences, ...changes };
        dispatch(updateAllPreferences(next));
        try {
            await updatePreferences(next).unwrap();
            toast.success(t('settings.notifications.saved', { defaultValue: 'Notification settings saved.' }));
        } catch (error) {
            dispatch(updateAllPreferences(previous));
            toast.error(getErrorMessage(error, t('settings.notifications.saveFailed', { defaultValue: 'Notification settings could not be saved.' })));
        }
    };

    const requestDesktopPermission = async () => {
        if (!('Notification' in window)) {
            toast.error(t('settings.notifications.unsupported', { defaultValue: 'Desktop notifications are not supported by this browser.' }));
            return;
        }

        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            if (result === 'granted') {
                await handleDesktopPersist({ desktopNotifications: true });
                new Notification(t('settings.notifications.testTitle', { defaultValue: `${VIARA_BRAND.name} notifications enabled` }), {
                    body: t('settings.notifications.testBody', { defaultValue: 'Windows desktop alerts are ready for this workstation.' }),
                    tag: 'VIARA-permission-test'
                });
            } else {
                await handleDesktopPersist({ desktopNotifications: false });
            }
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.notifications.permissionFailed', { defaultValue: 'Could not request desktop permission.' })));
        }
    };

    const testSound = () => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            toast.error(t('settings.notifications.soundUnavailable', { defaultValue: 'Audio is unavailable in this browser.' }));
            return;
        }

        const context = new AudioContextClass();
        const volume = Number(preferences.soundVolume) || 0.5;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 740;
        gain.gain.setValueAtTime(volume * 0.08, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.22);
        window.setTimeout(() => context.close().catch(() => { }), 350);
    };

    const handleMarkRead = async (id) => {
        try {
            await markRead(id).unwrap();
            refetchNotifs();
        } catch {
            toast.error(t('settings.notifications.markReadFailed', { defaultValue: 'Could not mark notification as read.' }));
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllRead().unwrap();
            refetchNotifs();
            toast.success(t('settings.notifications.allMarkedRead', { defaultValue: 'All notifications marked as read.' }));
        } catch {
            toast.error(t('settings.notifications.markAllReadFailed', { defaultValue: 'Could not mark all notifications as read.' }));
        }
    };

    const enabledDesktopSummary = useMemo(() => {
        const enabled = [
            preferences.desktopNotifications,
            preferences.desktopSystemNotifications,
            preferences.desktopMessageNotifications,
            preferences.showNotificationBadge,
            preferences.notificationSound
        ].filter(Boolean).length;
        return `${enabled}/5`;
    }, [preferences]);

    const enabledStaffSummary = useMemo(() => {
        const enabled = [
            staffForm.email_enabled,
            staffForm.sms_enabled,
            staffForm.whatsapp_enabled,
            staffForm.inapp_enabled
        ].filter(Boolean).length;
        return `${enabled}/4`;
    }, [staffForm]);

    const unreadCount = myNotifications?.counts?.unread ?? 0;

    const deliveryRate = useMemo(() => {
        if (!analytics?.delivery) return null;
        const { total, delivered } = analytics.delivery;
        if (!total) return null;
        return Math.round((delivered / total) * 100);
    }, [analytics]);

    return (
        <div className="space-y-6">
            {/* Top Notification Control Hero Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <BellRing size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Bell size={11} />
                                    <span>{t('settings.notifications.eyebrow', { defaultValue: 'System Communications' })}</span>
                                </span>
                                {unreadCount > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                                        <span>{t('settings.notifications.unreadAlerts', { count: unreadCount, defaultValue: '{{count}} unread alerts' })}</span>
                                    </span>
                                )}
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('settings.notifications.title', { defaultValue: 'Notification Control Center' })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('settings.notifications.description', { defaultValue: 'Control in-app badges, chimes, Windows desktop alerts, delivery channels, and quiet hours.' })}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                        <Fact label={t('settings.notifications.unreadLabel', { defaultValue: 'Unread' })} value={String(unreadCount)} />
                        <Fact label={t('settings.notifications.desktopRules', { defaultValue: 'Desktop' })} value={enabledDesktopSummary} />
                        <Fact label={t('settings.notifications.channelRules', { defaultValue: 'Channels' })} value={enabledStaffSummary} />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-4">
                    <section className={panelClass}>
                        <SectionHeader
                            icon={MonitorSmartphone}
                            title={t('settings.notifications.desktopTitle', { defaultValue: 'Windows desktop alerts' })}
                            description={t('settings.notifications.desktopDesc', { defaultValue: 'Use browser notifications to show Windows system alerts while VIARA is open.' })}
                        />
                        <div className="space-y-3">
                            <SettingRow
                                icon={Bell}
                                title={t('settings.notifications.desktopMaster', { defaultValue: 'Enable desktop notifications' })}
                                description={permission === 'granted'
                                    ? t('settings.notifications.desktopGranted', { defaultValue: 'Permission granted for this browser profile.' })
                                    : t('settings.notifications.desktopNeedsPermission', { defaultValue: 'Windows alerts require browser permission first.' })}
                                checked={Boolean(preferences.desktopNotifications) && permission === 'granted'}
                                disabled={permission !== 'granted' || isPrefsLoading}
                                onChange={(checked) => handleDesktopPersist({ desktopNotifications: checked })}
                            />
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={requestDesktopPermission}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-cyan-900 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                                >
                                    <MonitorSmartphone size={15} />
                                    {permission === 'granted'
                                        ? t('settings.notifications.sendTest', { defaultValue: 'Send test alert' })
                                        : t('settings.notifications.enableWindows', { defaultValue: 'Enable Windows alerts' })}
                                </button>
                            </div>
                        </div>
                    </section>

                    {isStaffError && (
                        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                            <p className="text-xs font-semibold">
                                {t('settings.notifications.preferencesLoadFailed', { defaultValue: 'Notification preferences could not be loaded. Changes are disabled to protect your saved settings.' })}
                            </p>
                            <button
                                type="button"
                                onClick={refetchStaffPrefs}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold transition hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-900/40"
                            >
                                <RefreshCw size={13} />
                                {t('common.retry', 'Retry')}
                            </button>
                        </div>
                    )}

                    <section className={panelClass}>
                        <SectionHeader
                            icon={Mail}
                            title={t('settings.notifications.channelsTitle', { defaultValue: 'Delivery channels' })}
                            description={t('settings.notifications.channelsDesc', { defaultValue: 'Choose how you receive notifications across email, SMS, WhatsApp, and in-app.' })}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            {DELIVERY_CHANNELS.map(channel => (
                                <SettingRow
                                    key={channel.key}
                                    icon={channel.icon}
                                    title={t(channel.labelKey, channel.defaultLabel)}
                                    description={t('settings.notifications.channelToggleDesc', { defaultValue: 'Deliver notifications via this channel.' })}
                                    checked={!!staffForm[channel.key]}
                                    disabled={isStaffUpdating || isStaffLoading || isStaffError}
                                    onChange={(checked) => persistStaffPrefs({ [channel.key]: checked })}
                                />
                            ))}
                        </div>
                    </section>

                    <section className={panelClass}>
                        <SectionHeader
                            icon={Bell}
                            title={t('settings.notifications.categoriesTitle', { defaultValue: 'Event categories' })}
                            description={t('settings.notifications.categoriesDesc', { defaultValue: 'Granular opt-in for clinical, operational, and safety notifications.' })}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            {EVENT_CATEGORIES.map(cat => (
                                <SettingRow
                                    key={cat.key}
                                    icon={cat.icon}
                                    title={t(cat.labelKey, cat.defaultLabel)}
                                    description={t(cat.descKey, cat.defaultDesc)}
                                    checked={!!staffForm[cat.key]}
                                    disabled={isStaffUpdating || isStaffLoading || isStaffError}
                                    onChange={(checked) => persistStaffPrefs({ [cat.key]: checked })}
                                />
                            ))}
                        </div>
                    </section>

                    <section className={panelClass}>
                        <SectionHeader
                            icon={Clock3}
                            title={t('settings.notifications.quietTitle', { defaultValue: 'Quiet hours' })}
                            description={t('settings.notifications.quietDesc', { defaultValue: 'Suppress non-critical alerts during after-hours windows.' })}
                        />
                        <div className="space-y-3">
                            <SettingRow
                                icon={Clock3}
                                title={t('settings.notifications.quietMaster', { defaultValue: 'Enable quiet hours' })}
                                description={t('settings.notifications.quietMasterDesc', { defaultValue: 'Non-critical notifications are deferred to the end time.' })}
                                checked={Boolean(staffForm.quiet_hours_enabled)}
                                disabled={isStaffUpdating || isStaffLoading || isStaffError}
                                onChange={(checked) => persistStaffPrefs({ quiet_hours_enabled: checked })}
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <TimeField
                                    label={t('settings.notifications.quietStart', { defaultValue: 'Start' })}
                                    value={staffForm.quiet_hours_start || '22:00'}
                                    disabled={!staffForm.quiet_hours_enabled || isStaffUpdating || isStaffLoading || isStaffError}
                                    onChange={(value) => persistStaffPrefs({ quiet_hours_start: value })}
                                />
                                <TimeField
                                    label={t('settings.notifications.quietEnd', { defaultValue: 'End' })}
                                    value={staffForm.quiet_hours_end || '07:00'}
                                    disabled={!staffForm.quiet_hours_enabled || isStaffUpdating || isStaffLoading || isStaffError}
                                    onChange={(value) => persistStaffPrefs({ quiet_hours_end: value })}
                                />
                            </div>
                        </div>
                    </section>
                </div>

                <div className="space-y-4">
                    <section className={panelClass}>
                        <SectionHeader
                            icon={Volume2}
                            title={t('settings.notifications.soundTitle', { defaultValue: 'Sound and badges' })}
                            description={t('settings.notifications.soundDesc', { defaultValue: 'Control the in-app notification badge and alert chime.' })}
                        />
                        <div className="space-y-3">
                            <SettingRow
                                icon={Bell}
                                title={t('settings.notifications.badge', { defaultValue: 'Unread badge counter' })}
                                description={t('settings.notifications.badgeDesc', { defaultValue: 'Show unread totals in the top bar.' })}
                                checked={Boolean(preferences.showNotificationBadge)}
                                disabled={isPrefsLoading}
                                onChange={(checked) => handleDesktopPersist({ showNotificationBadge: checked })}
                            />
                            <SettingRow
                                icon={Volume2}
                                title={t('settings.notifications.chime', { defaultValue: 'Notification chime' })}
                                description={t('settings.notifications.chimeDesc', { defaultValue: 'Play a short tone when new unread notifications arrive.' })}
                                checked={Boolean(preferences.notificationSound)}
                                disabled={isPrefsLoading}
                                onChange={(checked) => handleDesktopPersist({ notificationSound: checked })}
                            />
                            <label className="block rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                                    <span>{t('settings.notifications.volume', { defaultValue: 'Chime volume' })}: {Math.round((preferences.soundVolume || 0.5) * 100)}%</span>
                                    <button type="button" onClick={testSound} className="text-cyan-700 hover:underline dark:text-cyan-300">
                                        {t('settings.notifications.testSound', { defaultValue: 'Test' })}
                                    </button>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="1"
                                    step="0.05"
                                    value={preferences.soundVolume || 0.5}
                                    disabled={isPrefsLoading}
                                    onChange={(event) => handleDesktopPersist({ soundVolume: Number(event.target.value) })}
                                    className="mt-3 w-full accent-cyan-600"
                                />
                            </label>
                        </div>
                    </section>

                    <section className={panelClass}>
                        <SectionHeader
                            icon={Inbox}
                            title={t('settings.notifications.myNotificationsTitle', { defaultValue: 'My notifications' })}
                            description={t('settings.notifications.myNotificationsDesc', { defaultValue: 'Recent alerts assigned to your account.' })}
                        />
                        <div className="space-y-3">
                            {isNotifLoading ? (
                                <div className="py-6 text-center text-xs font-semibold text-slate-400">{t('common.loading', 'Loading...')}</div>
                            ) : isNotifError ? (
                                <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
                                    <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                                        {t('settings.notifications.notificationsLoadFailed', { defaultValue: 'Your notifications could not be loaded.' })}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={refetchNotifs}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <RefreshCw size={13} />
                                        {t('common.retry', 'Retry')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            {t('settings.notifications.unreadCount', { count: unreadCount, defaultValue: '{{count}} unread' })}
                                        </span>
                                        {unreadCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleMarkAllRead}
                                                disabled={isMarkingAllRead}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                            >
                                                <Check size={13} />
                                                {t('settings.notifications.markAllRead', { defaultValue: 'Mark all read' })}
                                            </button>
                                        )}
                                    </div>
                                    <div className="max-h-80 space-y-2 overflow-y-auto">
                                        {myNotifications?.items?.length === 0 && (
                                            <p className="py-6 text-center text-xs font-semibold text-slate-400">{t('settings.notifications.noNotifications', { defaultValue: 'No notifications yet.' })}</p>
                                        )}
                                        {myNotifications?.items?.map(item => (
                                            <div
                                                key={item.notification_id}
                                                className={`flex items-start gap-3 rounded-xl border p-3 transition ${item.is_read ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/20' : 'border-cyan-200 bg-cyan-50/40 dark:border-cyan-900/60 dark:bg-cyan-950/20'}`}
                                            >
                                                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${item.is_read ? 'bg-slate-300 dark:bg-slate-700' : 'bg-cyan-500'}`} />
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-xs font-semibold ${item.is_read ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                                                        {item.event_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                                    </p>
                                                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                                                        {item.channel} &middot; {new Date(item.created_at).toLocaleString()}
                                                    </p>
                                                </div>
                                                {!item.is_read && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleMarkRead(item.notification_id)}
                                                        disabled={isMarkingRead}
                                                        className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                                    >
                                                        {t('settings.notifications.markRead', { defaultValue: 'Read' })}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    {canViewAnalytics && (
                        <section className={panelClass}>
                            <SectionHeader
                                icon={BarChart3}
                                title={t('settings.notifications.analyticsTitle', { defaultValue: 'Delivery analytics' })}
                                description={t('settings.notifications.analyticsDesc', { defaultValue: 'Last 7 days of notification volume and delivery rates.' })}
                            />
                            {isAnalyticsLoading ? (
                                <div className="py-6 text-center text-xs font-semibold text-slate-400">{t('common.loading', 'Loading...')}</div>
                            ) : isAnalyticsError ? (
                                <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
                                    <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                                        {t('settings.notifications.analyticsLoadFailed', { defaultValue: 'Delivery analytics could not be loaded.' })}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={refetchAnalytics}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <RefreshCw size={13} />
                                        {t('common.retry', 'Retry')}
                                    </button>
                                </div>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Metric
                                        label={t('settings.notifications.totalSent', { defaultValue: 'Total notifications' })}
                                        value={analytics?.delivery?.total ?? 0}
                                    />
                                    <Metric
                                        label={t('settings.notifications.delivered', { defaultValue: 'Delivered' })}
                                        value={analytics?.delivery?.delivered ?? 0}
                                        tone="success"
                                    />
                                    <Metric
                                        label={t('settings.notifications.failed', { defaultValue: 'Failed' })}
                                        value={analytics?.delivery?.failed ?? 0}
                                        tone="danger"
                                    />
                                    <Metric
                                        label={t('settings.notifications.deliveryRate', { defaultValue: 'Delivery rate' })}
                                        value={deliveryRate !== null ? `${deliveryRate}%` : '—'}
                                        tone={deliveryRate !== null && deliveryRate >= 80 ? 'success' : 'neutral'}
                                    />
                                </div>
                            )}
                        </section>
                    )}

                    <section className={panelClass}>
                        <SectionHeader
                            icon={ShieldCheck}
                            title={t('settings.notifications.privacyTitle', { defaultValue: 'Privacy defaults' })}
                            description={t('settings.notifications.privacyDesc', { defaultValue: 'Safer defaults for shared workstations and clinical environments.' })}
                        />
                        <div className="space-y-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
                            <p>{t('settings.notifications.privacyPoint1', { defaultValue: 'Desktop alerts hide message content unless previews are explicitly enabled.' })}</p>
                            <p>{t('settings.notifications.privacyPoint2', { defaultValue: 'In-app notifications keep full details inside the authenticated workspace.' })}</p>
                            <p>{t('settings.notifications.privacyPoint3', { defaultValue: 'Browser permission is per Windows user profile and browser profile.' })}</p>
                        </div>
                    </section>
                </div>
            </div>

            {canAdminister && (
                <div className="space-y-4">
                    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <header className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/30">
                            <h3 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.notifications.templatesTitle', { defaultValue: 'Delivery templates' })}</h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('settings.notifications.templatesDesc', { defaultValue: 'Manage Email, SMS, WhatsApp, and in-app copy used by notification dispatch.' })}</p>
                        </header>
                        <NotificationTemplates />
                    </section>
                    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <header className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/30">
                            <h3 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.notifications.jobsTitle', { defaultValue: 'Dispatch jobs' })}</h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('settings.notifications.jobsDesc', { defaultValue: 'Monitor queued, failed, skipped, and sent notification jobs.' })}</p>
                        </header>
                        <NotificationJobs />
                    </section>
                </div>
            )}
        </div>
    );
}

const SectionHeader = ({ icon: Icon, title, description }) => (
    <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
            <Icon size={16} />
        </span>
        <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-white">{title}</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
    </div>
);

const SettingRow = ({ icon: Icon, title, description, checked, disabled, onChange }) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 transition hover:border-teal-500/40 hover:shadow-2xs dark:border-slate-800 dark:bg-slate-950/30 dark:hover:border-teal-500/30">
        <span className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Icon size={16} />
            </span>
            <span className="min-w-0">
                <span className="block text-xs font-black text-slate-900 dark:text-white">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</span>
            </span>
        </span>
        <Toggle checked={checked} disabled={disabled} onChange={onChange} label={title} />
    </label>
);

const Toggle = ({ checked, disabled, onChange, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
            event.preventDefault();
            onChange(!checked);
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-gradient-to-r from-teal-600 to-cyan-600 shadow-md shadow-teal-500/20' : 'bg-slate-200 dark:bg-slate-800'
            } disabled:cursor-not-allowed disabled:opacity-50`}
    >
        <span className={`h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
);

const TimeField = ({ label, value, disabled, onChange }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
        <input
            type="time"
            step="3600"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200 dark:disabled:bg-slate-900"
        />
    </label>
);

const Fact = ({ label, value }) => (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60 text-center">
        <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <p className="mt-1 truncate text-xs font-black capitalize text-slate-900 dark:text-white">{value}</p>
    </div>
);

const Metric = ({ label, value, tone = 'neutral' }) => (
    <div className={`rounded-2xl border p-3.5 ${tone === 'success' ? 'border-emerald-200/60 bg-emerald-50/30 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200' : tone === 'danger' ? 'border-rose-200/60 bg-rose-50/30 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200' : 'border-slate-200/60 bg-slate-50/30 text-slate-750 dark:border-slate-800/60 dark:bg-slate-900/30 dark:text-slate-200'}`}>
        <p className="text-2xl font-black leading-none">{value}</p>
        <p className="mt-1 text-xs font-bold">{label}</p>
    </div>
);
