import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  type PortalNotification,
  useGetDoctorNotificationsQuery,
  useGetMyPortalNotificationsQuery,
  useLazyGetDoctorNotificationsQuery,
  useLazyGetMyPortalNotificationsQuery,
  useMarkAllDoctorNotificationsReadMutation,
  useAcknowledgeDoctorCriticalResultMutation,
  useMarkAllMyPortalNotificationsReadMutation,
  useMarkDoctorNotificationReadMutation,
  useMarkMyPortalNotificationReadMutation,
} from "../store/api";
import { Loading, EmptyState } from "./ui/StateIndicators";
import { getErrorMessage } from "@/utils/getErrorMessage";

const PAGE_SIZE = 20;

const formatNotificationTime = (value: string, locale?: string) => {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const priorityClass: Record<string, string> = {
  Critical: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200",
  Warning:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  Action:
    "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200",
  Normal: "border-border bg-background text-muted-foreground",
};

export interface PortalNotificationsViewProps {
  role?: string;
  portalType?: string;
  locale?: string;
  t?: any;
  onNavigate?: (target: string, entityId?: string | null) => void;
}

const PortalNotificationsView: React.FC<PortalNotificationsViewProps> = ({
  role,
  portalType,
  locale = "en-US",
  t = (key: string, options?: any) => options?.defaultValue || key,
  onNavigate,
}) => {
  const effectiveRole = role || portalType || "patient";
  const isDoctor = effectiveRole === "doctor";
  const pageParams = { limit: PAGE_SIZE, offset: 0 };
  const patientQuery = useGetMyPortalNotificationsQuery(pageParams, {
    skip: isDoctor,
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const doctorQuery = useGetDoctorNotificationsQuery(pageParams, {
    skip: !isDoctor,
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const [loadPatientPage] = useLazyGetMyPortalNotificationsQuery();
  const [loadDoctorPage] = useLazyGetDoctorNotificationsQuery();
  const [markPatientRead] = useMarkMyPortalNotificationReadMutation();
  const [markDoctorRead] = useMarkDoctorNotificationReadMutation();
  const [markAllPatientRead, patientAllState] = useMarkAllMyPortalNotificationsReadMutation();
  const [markAllDoctorRead, doctorAllState] = useMarkAllDoctorNotificationsReadMutation();
  const [acknowledgeDoctorCritical] = useAcknowledgeDoctorCriticalResultMutation();
  const [additionalItems, setAdditionalItems] = useState<PortalNotification[]>([]);
  const [readOverrides, setReadOverrides] = useState<Set<string>>(() => new Set());
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(() => new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const firstPageSignatureRef = useRef<string | null>(null);
  const nextOffsetRef = useRef<number | null>(null);

  const query = isDoctor ? doctorQuery : patientQuery;
  const firstPage = query.data;
  const markRead = isDoctor ? markDoctorRead : markPatientRead;
  const markAllRead = isDoctor ? markAllDoctorRead : markAllPatientRead;
  const loadPage = isDoctor ? loadDoctorPage : loadPatientPage;
  const isMarkingAll = patientAllState.isLoading || doctorAllState.isLoading;

  useEffect(() => {
    setAdditionalItems([]);
    setReadOverrides(new Set());
    setLoadMoreError(null);
  }, [effectiveRole]);

  useEffect(() => {
    if (!firstPage) return;
    setUnreadCount(firstPage.unreadCount);
    const signature = firstPage.items.map((item) => item.notification_id).join(":");
    if (firstPageSignatureRef.current && firstPageSignatureRef.current !== signature) {
      setAdditionalItems([]);
      setLoadMoreError(null);
      nextOffsetRef.current = firstPage.pagination?.nextOffset ?? firstPage.items.length;
    } else if (nextOffsetRef.current === null) {
      nextOffsetRef.current = firstPage.pagination?.nextOffset ?? firstPage.items.length;
    }
    firstPageSignatureRef.current = signature;
  }, [firstPage]);

  const notifications = useMemo(() => {
    const byId = new Map<string, PortalNotification>();
    [...(firstPage?.items || []), ...additionalItems].forEach((item) => {
      if (!byId.has(item.notification_id)) byId.set(item.notification_id, item);
    });
    return [...byId.values()]
      .map((item) =>
        readOverrides.has(item.notification_id) ? { ...item, is_read: true } : item,
      )
      .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  }, [additionalItems, firstPage?.items, readOverrides]);

  const total = firstPage?.pagination.total || notifications.length;
  const hasMore = notifications.length < total;

  const handleMarkRead = async (notification: PortalNotification) => {
    if (notification.is_read || pendingReadIds.has(notification.notification_id)) return;
    const id = notification.notification_id;
    setReadOverrides((current) => new Set(current).add(id));
    setPendingReadIds((current) => new Set(current).add(id));
    setUnreadCount((current) => Math.max(0, current - 1));
    try {
      await markRead(id).unwrap();
    } catch (error) {
      setReadOverrides((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      // Revert only the decrement made for this item instead of restoring the
      // full first-page value, which would clobber concurrent optimistic updates.
      setUnreadCount((current) => current + 1);
      toast.error(
        getErrorMessage(
          error,
          t("notifications.readError", { defaultValue: "Could not mark notification as read." }),
        ),
      );
    } finally {
      setPendingReadIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((item) => !item.is_read).map((item) => item.notification_id);
    const previousUnreadCount = unreadCount;
    setReadOverrides((current) => new Set([...current, ...unreadIds]));
    setUnreadCount(0);
    try {
      await markAllRead(undefined).unwrap();
      toast.success(
        t("notifications.allRead", { defaultValue: "All notifications marked as read." }),
      );
    } catch (error) {
      setReadOverrides((current) => {
        const next = new Set(current);
        unreadIds.forEach((id) => next.delete(id));
        return next;
      });
      setUnreadCount(previousUnreadCount);
      toast.error(
        getErrorMessage(
          error,
          t("notifications.readError", { defaultValue: "Could not update notifications." }),
        ),
      );
    }
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const offset = nextOffsetRef.current ?? notifications.length;
    try {
      const page = await loadPage({ limit: PAGE_SIZE, offset }, false).unwrap();
      setAdditionalItems((current) => {
        const seen = new Set(current.map((item) => item.notification_id));
        return [...current, ...page.items.filter((item) => !seen.has(item.notification_id))];
      });
      nextOffsetRef.current = page.pagination?.nextOffset ?? offset + page.items.length;
    } catch (error) {
      setLoadMoreError(
        getErrorMessage(
          error,
          t("notifications.loadMoreError", {
            defaultValue: "Could not load more notifications. Try again.",
          }),
        ),
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleAcknowledge = async (notification: PortalNotification) => {
    if (!isDoctor || !notification.entity_id) return;
    try {
      await acknowledgeDoctorCritical({ id: notification.entity_id }).unwrap();
      toast.success(t("notifications.acknowledged", { defaultValue: "Critical result acknowledged." }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("notifications.acknowledgeError", { defaultValue: "Could not acknowledge this result." })));
    }
  };

  const handleRefresh = async () => {
    setAdditionalItems([]);
    setLoadMoreError(null);
    nextOffsetRef.current = null;
    await query.refetch();
  };

  const isArabicLocale = locale.toLowerCase().startsWith("ar");
  const priorityLabels: Record<string, string> = isArabicLocale
    ? { Critical: "حرج", Warning: "تحذير", Action: "إجراء مطلوب", Normal: "عادي" }
    : { Critical: "Critical", Warning: "Warning", Action: "Action", Normal: "Normal" };
  const categoryLabels: Record<string, string> = isArabicLocale
    ? {
        appointment: "موعد",
        report: "تقرير",
        message: "رسالة",
        billing: "فوترة",
        document: "مستند",
        account: "حساب",
        critical: "نتيجة حرجة",
        system: "النظام",
      }
    : {
        appointment: "Appointment",
        report: "Report",
        message: "Message",
        billing: "Billing",
        document: "Document",
        account: "Account",
        critical: "Critical result",
        system: "System",
      };

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm" aria-labelledby={`${effectiveRole}-notifications-title`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-primary-700 dark:text-primary-300">
            {t("notifications.inboxEyebrow", { defaultValue: "Notification inbox" })}
          </p>
          <h2 id={`${effectiveRole}-notifications-title`} className="mt-1 font-display text-lg font-semibold text-foreground">
            {t("notifications.title", { defaultValue: "Notifications" })}
          </h2>
          <p className="mt-1 text-xs font-semibold text-muted-foreground" aria-live="polite">
            {t("notifications.unreadSummary", {
              defaultValue: "{{count}} unread updates",
              count: unreadCount,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={query.isFetching}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-muted-foreground transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
          >
            <RefreshCw size={13} className={query.isFetching ? "animate-spin" : ""} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </button>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={!unreadCount || isMarkingAll}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition hover:bg-primary-700 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
          >
            {isMarkingAll ? <RefreshCw size={13} className="animate-spin" /> : <CheckCheck size={13} />}
            {t("notifications.markAllRead", { defaultValue: "Mark all read" })}
          </button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="mt-5">
          <Loading label={t("notifications.loading", { defaultValue: "Loading notifications..." })} />
        </div>
      ) : query.isError ? (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900 dark:bg-red-950/20">
          <AlertCircle className="mx-auto h-7 w-7 text-red-600" />
          <h3 className="mt-2 text-sm font-bold text-foreground">
            {t("notifications.errorTitle", { defaultValue: "Notifications could not be loaded" })}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {getErrorMessage(query.error, t("notifications.errorDescription", { defaultValue: "Check your connection and try again." }))}
          </p>
          <button type="button" onClick={() => query.refetch()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary/30">
            <RefreshCw size={13} />
            {t("common.retry", { defaultValue: "Retry" })}
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={Bell}
            title={t("notifications.emptyTitle", { defaultValue: "No notifications" })}
            description={t("notifications.emptyDescription", {
              defaultValue: "Your portal updates will appear here as they arrive.",
            })}
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-3" role="list" aria-busy={query.isFetching || isLoadingMore}>
          {notifications.map((notification) => {
            const isPending = pendingReadIds.has(notification.notification_id);
            return (
              <article
                key={notification.notification_id}
                role="listitem"
                tabIndex={0}
                className={`flex w-full items-start gap-3 rounded-lg border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  notification.is_read
                    ? "border-border bg-background text-muted-foreground"
                    : "border-primary-200 bg-primary-50 text-foreground shadow-sm dark:border-primary-400/20 dark:bg-primary-400/10"
                }`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${notification.is_read ? "bg-surface text-muted-foreground" : "bg-primary-700 text-white"}`} aria-hidden="true">
                  {notification.is_read ? <Check size={16} /> : <Bell size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-sm font-semibold">
                      {notification.subject || t("notifications.updateFallback", { defaultValue: "Portal update" })}
                    </h3>
                    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {notification.is_read ? t("notifications.read", { defaultValue: "Read" }) : t("notifications.unread", { defaultValue: "Unread" })}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${priorityClass[notification.priority] || priorityClass.Normal}`}>
                      {priorityLabels[notification.priority] || notification.priority}
                    </span>
                  </div>
                  {notification.content && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{notification.content}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-muted-foreground">
                    {notification.category && (
                      <span>{categoryLabels[notification.category.toLowerCase()] || notification.category}</span>
                    )}
                    {notification.event_type && <span>{notification.event_type}</span>}
                    <time dateTime={notification.created_at}>{formatNotificationTime(notification.created_at, locale)}</time>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!notification.is_read && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(notification)}
                        disabled={isPending}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary-200 bg-surface px-3 text-xs font-bold text-primary-700 transition hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
                      >
                        {isPending ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                        {t("notifications.markRead", { defaultValue: "Mark as read" })}
                      </button>
                    )}
                    {notification.action && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleMarkRead(notification);
                          onNavigate?.(notification.action!.target, notification.action!.entityId);
                        }}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition hover:bg-primary-700 focus-visible:ring-2 focus-visible:ring-primary/30"
                      >
                        {t(`notifications.actions.${notification.action.target}`, {
                          defaultValue: notification.action.label,
                        })}
                        <ArrowRight size={12} className="rtl:rotate-180" />
                      </button>
                    )}
                    {isDoctor && notification.acknowledgement_status === "Pending" && notification.entity_id && (
                      <button
                        type="button"
                        onClick={() => void handleAcknowledge(notification)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                      >
                        <Check size={12} />
                        {t("notifications.acknowledge", { defaultValue: "Acknowledge" })}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {loadMoreError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
              {loadMoreError}
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="mx-auto mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-xs font-bold text-foreground transition hover:border-primary-300 hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
            >
              {isLoadingMore && <RefreshCw size={13} className="animate-spin" />}
              {isLoadingMore
                ? t("notifications.loadingMore", { defaultValue: "Loading more..." })
                : t("notifications.loadMore", { defaultValue: "Load more" })}
            </button>
          )}
          <p className="text-center text-[10px] font-semibold text-muted-foreground" aria-live="polite">
            {t("notifications.showing", {
              defaultValue: "Showing {{shown}} of {{total}} notifications",
              shown: notifications.length,
              total,
            })}
          </p>
        </div>
      )}
    </section>
  );
};

export default PortalNotificationsView;
