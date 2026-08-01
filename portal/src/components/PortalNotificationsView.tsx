import React, { useMemo } from 'react';
import { Bell, Check, CheckCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetDoctorNotificationsQuery,
    useGetDoctorNotificationUnreadCountQuery,
    useGetMyPortalNotificationsQuery,
    useGetMyPortalNotificationUnreadCountQuery,
    useMarkAllDoctorNotificationsReadMutation,
    useMarkAllMyPortalNotificationsReadMutation,
    useMarkDoctorNotificationReadMutation,
    useMarkMyPortalNotificationReadMutation,
} from '../store/api';
import { Loading, EmptyState } from './ui/StateIndicators';
import StatusBadge from './ui/StatusBadge';
import { getErrorMessage } from '@/utils/getErrorMessage';

const formatNotificationTime = (value: any, locale?: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export interface PortalNotificationsViewProps {
    role?: string;
    portalType?: string;
    locale?: string;
    t?: any;
}

const PortalNotificationsView: React.FC<PortalNotificationsViewProps> = ({
    role,
    portalType,
    locale = 'en-US',
    t = (key: string, options?: any) => options?.defaultValue || key,
}) => {
    const effectiveRole = role || portalType || 'patient';
    const isDoctor = effectiveRole === 'doctor';
    const patientQuery = useGetMyPortalNotificationsQuery(undefined, { skip: isDoctor, pollingInterval: 15000 });
    const doctorQuery = useGetDoctorNotificationsQuery(undefined, { skip: !isDoctor, pollingInterval: 15000 });
    const patientUnreadQuery = useGetMyPortalNotificationUnreadCountQuery(undefined, { skip: isDoctor, pollingInterval: 15000 });
    const doctorUnreadQuery = useGetDoctorNotificationUnreadCountQuery(undefined, { skip: !isDoctor, pollingInterval: 15000 });
    const [markPatientRead, patientReadState] = useMarkMyPortalNotificationReadMutation();
    const [markDoctorRead, doctorReadState] = useMarkDoctorNotificationReadMutation();
    const [markAllPatientRead, patientAllState] = useMarkAllMyPortalNotificationsReadMutation();
    const [markAllDoctorRead, doctorAllState] = useMarkAllDoctorNotificationsReadMutation();

    const query = isDoctor ? doctorQuery : patientQuery;
    const unreadQuery = isDoctor ? doctorUnreadQuery : patientUnreadQuery;
    const markRead = isDoctor ? markDoctorRead : markPatientRead;
    const markAllRead = isDoctor ? markAllDoctorRead : markAllPatientRead;
    const isMarking = patientReadState.isLoading || doctorReadState.isLoading;
    const isMarkingAll = patientAllState.isLoading || doctorAllState.isLoading;
    const notifications = query.data || [];
    const unreadCount = unreadQuery.data?.unreadCount || 0;

    const newestNotifications = useMemo(() => [...notifications].sort((a: any, b: any) => {
        const first = Date.parse(a.created_at) || 0;
        const second = Date.parse(b.created_at) || 0;
        return second - first;
    }), [notifications]);

    const handleMarkRead = async (notification: any) => {
        if (notification.is_read) return;
        try {
            await markRead(notification.notification_id).unwrap();
        } catch (error) {
            toast.error(getErrorMessage(error, t('notifications.readError', { defaultValue: 'Could not mark notification as read.' })));
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllRead(undefined).unwrap();
            toast.success(t('notifications.allRead', { defaultValue: 'All notifications marked as read.' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('notifications.readError', { defaultValue: 'Could not update notifications.' })));
        }
    };

    return (
        <section className="rounded-3xl border border-slate-200/50 bg-white/50 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#0b1426]/50">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-primary-700 dark:text-primary-300">
                        {t('notifications.inboxEyebrow', { defaultValue: 'Notification inbox' })}
                    </p>
                    <h2 className="font-display mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                        {t('notifications.title', { defaultValue: 'Notifications' })}
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {t('notifications.unreadSummary', { defaultValue: '{{count}} unread updates', count: unreadCount })}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => query.refetch()}
                        disabled={query.isFetching}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-muted-foreground transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-60"
                    >
                        <RefreshCw size={13} className={query.isFetching ? 'animate-spin' : ''} />
                        {t('common.refresh', { defaultValue: 'Refresh' })}
                    </button>
                    <button
                        type="button"
                        onClick={handleMarkAllRead}
                        disabled={!unreadCount || isMarkingAll}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary-700 px-3 text-xs font-bold text-white transition hover:bg-primary-800 disabled:opacity-60"
                    >
                        {isMarkingAll ? <RefreshCw size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                        {t('notifications.markAllRead', { defaultValue: 'Mark all read' })}
                    </button>
                </div>
            </div>

            {query.isLoading ? (
                <Loading label={t('notifications.loading', { defaultValue: 'Loading notifications...' })} />
            ) : newestNotifications.length === 0 ? (
                <EmptyState
                    icon={Bell}
                    title={t('notifications.emptyTitle', { defaultValue: 'No notifications' })}
                    description={t('notifications.emptyDescription', { defaultValue: 'Appointment, report, billing, and portal updates will appear here.' })}
                />
            ) : (
                <div className="mt-5 grid gap-3">
                    {newestNotifications.map((notification) => (
                        <button
                            type="button"
                            key={notification.notification_id}
                            onClick={() => handleMarkRead(notification)}
                            disabled={notification.is_read || isMarking}
                            className={`flex w-full items-start gap-3 rounded-lg border p-4 text-start transition ${
                                notification.is_read
                                    ? 'border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300'
                                    : 'border-primary-200 bg-primary-50 text-foreground shadow-sm dark:border-primary-400/20 dark:bg-primary-400/10'
                            } disabled:cursor-default`}
                        >
                            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${notification.is_read ? 'bg-background text-muted-foreground' : 'bg-primary-700 text-white'}`}>
                                {notification.is_read ? <Check size={16} /> : <Bell size={16} />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-display text-sm font-semibold">{notification.subject || t('notifications.updateFallback', { defaultValue: 'Portal update' })}</span>
                                    <StatusBadge status={notification.status || (notification.is_read ? 'Completed' : 'Pending')} label={notification.is_read ? t('notifications.read', { defaultValue: 'Read' }) : t('notifications.unread', { defaultValue: 'Unread' })} />
                                </span>
                                {notification.content && <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-6">{notification.content}</span>}
                                <span className="mt-2 block text-[10px] font-semibold text-slate-400">
                                    {formatNotificationTime(notification.created_at, locale)}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
};

export default PortalNotificationsView;
