import { useMemo, useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  Activity,
  AlertTriangle,
  Bell,
  Briefcase,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  MessageCircle,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  useCreateDoctorOrderMutation,
  useGetDoctorCasesQuery,
  useGetDoctorMessagesQuery,
  useGetDoctorNotificationUnreadCountQuery,
  useGetDoctorReportQuery,
  useGetDoctorUnreadCountQuery,
  useGetCenterSettingsQuery,
  useSendDoctorMessageMutation,
} from "../store/api";
import { logOut, selectCurrentUser } from "../store/authSlice";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { inputClass, primaryBtn, secondaryBtn } from "@/utils/designTokens";
import { Loading, EmptyState } from "../components/ui/StateIndicators";
import { InfoBlock } from "../components/ui/DataBlocks";
import CaseCard from "../components/doctor/CaseCard";
import CaseDetailPanel from "../components/doctor/CaseDetailPanel";
import ReportsView from "../components/doctor/ReportsView";
import OrderView from "../components/doctor/OrderView";
import MessagesView from "../components/doctor/MessagesView";
import PortalChatBubble from "../components/PortalChatBubble";
import PortalNotificationsView from "../components/PortalNotificationsView";
import { DashboardLayout } from "../components/portal/layout/DashboardLayout";
import {
  WorkspacePageHeader,
  WorkspaceStat,
} from "../components/portal/layout/WorkspacePageHeader";
import { normalizeCenterSettings } from "@/utils/centerSettings";
import { useAppDispatch, useAppSelector } from "../store/store";
import { PortalIdentityProvider, resolvePortalIdentity } from "../lib/portal-identity";
import { usePortalRealtime } from "../hooks/use-portal-realtime";
import { useDebounce } from "../hooks/use-debounce";
import { useFocusTrap } from "../hooks/use-focus-trap";
import { openPrintableReport } from "../utils/printableReport";
import { isPastDate } from "../utils/date";
import { fetchWithAuthRetry } from "../lib/api";

const emptyOrder = {
  patientMrn: "",
  modalityType: "",
  clinicalNotes: "",
  preferredDate: "",
  preferredTimeWindow: "",
  contactPhone: "",
};

// status tones now handled in StatusBadge

const STATUS_OPTIONS = [
  "Scheduled",
  "Confirmed",
  "Arrived",
  "In Progress",
  "Finalized",
  "Completed",
  "Cancelled",
];
const DoctorPortal = () => {
  const { t, i18n } = useTranslation(["portal", "common", "auth"]);
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const user = useAppSelector(selectCurrentUser);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = searchParams.get("tab");
    return ["cases", "reports", "order", "notifications", "messages"].includes(requestedTab || "")
      ? requestedTab!
      : "cases";
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedCaseKey, setSelectedCaseKey] = useState<string | null>(() => searchParams.get("entityId"));
  const [selectedExamId, setSelectedExamId] = useState<string | null>(() => (
    searchParams.get("tab") === "reports" ? searchParams.get("entityId") : null
  ));
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [messageForm, setMessageForm] = useState({
    subject: "",
    body: "",
    appointmentId: "",
    examId: "",
  });
  const debouncedSearch = useDebounce(search, 300);
  const locale = i18n.language?.startsWith("ar") ? "ar-EG" : "en-GB";

  const {
    data: cases = [],
    isLoading: casesLoading,
    isFetching: casesFetching,
    refetch: refetchCases,
  } = useGetDoctorCasesQuery({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    limit: 100,
  });
  const {
    data: messages = [],
    isLoading: messagesLoading,
    refetch: refetchMessages,
  } = useGetDoctorMessagesQuery(undefined);
  const { data: unreadData } = useGetDoctorUnreadCountQuery(undefined);
  const { data: notificationUnreadData } = useGetDoctorNotificationUnreadCountQuery(undefined, {
    pollingInterval: 15000,
    skipPollingIfUnfocused: true,
  });
  const { data: rawCenterSettings } = useGetCenterSettingsQuery(undefined);
  const [sendMessage, { isLoading: isSending }] = useSendDoctorMessageMutation();
  const [createOrder, { isLoading: isOrdering }] = useCreateDoctorOrderMutation();

  usePortalRealtime(Boolean(user), ({ event: realtimeEvent, data }) => {
    if (realtimeEvent === "NEW_DOCTOR_PORTAL_MESSAGE") {
      dispatch(api.util.invalidateTags(["DoctorMessages"]));
      toast.success(
        t("doctor.messages.newReply", { defaultValue: "New message reply from staff." }),
      );
    } else if (realtimeEvent === "NEW_NOTIFICATION") {
      dispatch(api.util.invalidateTags(["DoctorNotifications"]));
      toast(data?.content || t("doctor.notifications.newUpdate", { defaultValue: "New portal update." }), {
        icon: <Bell size={16} />,
      });
    }
  });

  const openPortalTab = (tab: string, entityId?: string | null) => {
    setActiveTab(tab);
    if (entityId && tab === "reports") setSelectedExamId(entityId);
    if (entityId && tab === "cases") setSelectedCaseKey(entityId);
    setSearchParams(entityId ? { tab, entityId } : { tab }, { replace: true });
  };

  const centerSettings = useMemo(
    () => normalizeCenterSettings(rawCenterSettings || {}, language),
    [rawCenterSettings, language],
  );
  const portalIdentity = useMemo(
    () => resolvePortalIdentity({ settings: rawCenterSettings || {}, language }),
    [rawCenterSettings, language],
  );
  const centerName =
    [portalIdentity.center.name, portalIdentity.branch.name].filter(Boolean).join(" - ") ||
    t("doctor.brand");
  const centerInitials = portalIdentity.center.initials;
  const unreadCount = unreadData?.unreadCount || 0;
  const sortedCases = useMemo(
    () =>
      [...cases].sort(
        (a: any, b: any) =>
          new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime(),
      ),
    [cases],
  );
  const selectedCase = useMemo(() => {
    if (!sortedCases.length) return null;
    return sortedCases.find((item: any) => getCaseKey(item) === selectedCaseKey) || sortedCases[0];
  }, [selectedCaseKey, sortedCases]);
  const finalizedCases = useMemo(
    () => sortedCases.filter((item: any) => item.report_status === "Finalized"),
    [sortedCases],
  );
  const pendingCases = useMemo(
    () =>
      sortedCases.filter(
        (item: any) =>
          !["Finalized", "Completed", "Cancelled"].includes(
            item.report_status || item.appointment_status,
          ),
      ),
    [sortedCases],
  );
  const activeCases = useMemo(
    () =>
      sortedCases.filter(
        (item: any) => !["Cancelled", "Completed"].includes(item.appointment_status),
      ),
    [sortedCases],
  );
  const todayCases = useMemo(
    () => sortedCases.filter((item: any) => isToday(item.start_time)),
    [sortedCases],
  );

  useEffect(() => {
    document.title = `${centerName} · ${t("doctor.product")}`;
  }, [centerName, t]);

  const handleCloseReportDetail = () => {
    setSelectedExamId(null);
    if (searchParams.has("entityId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("entityId");
      setSearchParams(next, { replace: true });
    }
  };

  const tabs = [
    { id: "cases", label: t("doctor.tabs.cases"), icon: Briefcase, count: activeCases.length },
    {
      id: "reports",
      label: t("doctor.tabs.reports"),
      icon: FileText,
      count: finalizedCases.length,
    },
    { id: "order", label: t("doctor.tabs.order"), icon: Plus },
    {
      id: "notifications",
      label: t("tabs.notifications", "Notifications"),
      icon: Bell,
      count: notificationUnreadData?.unreadCount || null,
    },
    {
      id: "messages",
      label: t("doctor.tabs.messages"),
      icon: MessageCircle,
      count: unreadCount || null,
    },
  ];

  const formatDate = (value: any, options: Intl.DateTimeFormatOptions = {}) =>
    value
      ? new Date(value).toLocaleDateString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          ...options,
        })
      : "-";

  const formatDateTime = (value: any) =>
    value
      ? new Date(value).toLocaleString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

  const handleLogout = async () => {
    try {
      await dispatch(api.endpoints.logout.initiate(undefined)).unwrap();
    } catch (_) {
      // Local logout should still work if the network is unavailable.
    }
    dispatch(api.util.resetApiState());
    dispatch(logOut());
    navigate("/doctor/login");
  };

  const startCaseMessage = (item: any) => {
    setMessageForm({
      subject: item?.order_number
        ? `Order ${item.order_number}`
        : `${item?.patient_mrn || ""} case follow-up`.trim(),
      body: "",
      appointmentId: item?.appointment_id || "",
      examId: item?.exam_id || "",
    });
    setActiveTab("messages");
  };

  const submitMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!messageForm.body.trim()) return;
    try {
      await sendMessage({
        subject: messageForm.subject.trim() || undefined,
        body: messageForm.body.trim(),
        appointmentId: messageForm.appointmentId || undefined,
        examId: messageForm.examId || undefined,
      }).unwrap();
      setMessageForm({ subject: "", body: "", appointmentId: "", examId: "" });
      toast.success(t("doctor.messages.success"));
      refetchMessages();
    } catch (error) {
      toast.error(getErrorMessage(error, t("doctor.messages.error")));
    }
  };

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orderForm.patientMrn.trim()) {
      toast.error(t("doctor.order.mrnRequired"));
      return;
    }
    if (!orderForm.modalityType && !orderForm.clinicalNotes.trim()) {
      toast.error(t("doctor.order.detailsRequired"));
      return;
    }
    if (isPastDate(orderForm.preferredDate)) {
      toast.error(t("doctor.order.pastDate", { defaultValue: "The preferred date cannot be in the past." }));
      return;
    }
    try {
      await createOrder({
        ...orderForm,
        patientMrn: orderForm.patientMrn.trim().toUpperCase(),
        contactPhone: orderForm.contactPhone.trim() || undefined,
      }).unwrap();
      toast.success(t("doctor.order.success"));
      setOrderForm(emptyOrder);
      setActiveTab("cases");
      refetchCases();
    } catch (error) {
      toast.error(getErrorMessage(error, t("doctor.order.error")));
    }
  };

  const primaryActionClass = `${primaryBtn} px-4 text-xs`;
  const secondaryActionClass = `${secondaryBtn} px-4 text-xs`;

  return (
    <PortalIdentityProvider authenticated>
      <DashboardLayout
        icon={Stethoscope}
        title={centerName}
        subtitle={t("doctor.product")}
        userName={user?.name || t("doctor.roleFallback")}
        centerName={user?.specialty || user?.clinicHospital || t("doctor.roleFallback")}
        centerLogo={portalIdentity.center.logoUrl || undefined}
        centerInitials={centerInitials}
        onLogout={handleLogout}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={openPortalTab}
      >
        {selectedExamId && (
          <ReportDetail
            examId={selectedExamId}
            onClose={handleCloseReportDetail}
            locale={locale}
            t={t}
          />
        )}
        {activeTab === "cases" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={Stethoscope}
              eyebrow={t("doctor.product")}
              title={t("doctor.heroTitle", { defaultValue: "Clinical referral workspace" })}
              description={t("doctor.heroDescription", {
                defaultValue:
                  "Track referred cases, open finalized reports, submit new orders, and coordinate securely with the radiology center.",
              })}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab("order")}
                    className={primaryActionClass}
                  >
                    <Plus size={15} />
                    {t("doctor.order.title")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("reports")}
                    className={secondaryActionClass}
                  >
                    <FileText size={15} />
                    {t("doctor.tabs.reports")}
                  </button>
                </>
              }
              aside={
                <div className="rounded-xl border border-primary-100 bg-primary-50/80 p-4 dark:border-primary-900/50 dark:bg-primary-900/20">
                  <p className="text-[10px] font-black uppercase tracking-[.12em] text-primary-700 dark:text-primary-300">
                    {t("doctor.today", { defaultValue: "Today" })}
                  </p>
                  <div className="mt-1 flex items-end justify-between gap-4">
                    <div>
                      <strong className="text-3xl font-black text-foreground">
                        {todayCases.length}
                      </strong>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("doctor.todayCases", { defaultValue: "scheduled or active cases" })}
                      </p>
                    </div>
                    <Activity
                      className={`h-7 w-7 text-primary-600 ${casesFetching ? "animate-pulse" : ""}`}
                    />
                  </div>
                </div>
              }
            />

            <section
              aria-label={t("doctor.summary", { defaultValue: "Clinical summary" })}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <WorkspaceStat
                icon={Briefcase}
                label={t("doctor.metrics.referrals")}
                value={sortedCases.length}
                hint={t("doctor.metrics.referralsHint", { defaultValue: "All referred cases" })}
              />
              <WorkspaceStat
                icon={CheckCircle2}
                label={t("doctor.metrics.reports")}
                value={finalizedCases.length}
                hint={t("doctor.metrics.reportsHint", { defaultValue: "Final reports available" })}
                tone="success"
                onClick={() => setActiveTab("reports")}
              />
              <WorkspaceStat
                icon={Clock}
                label={t("doctor.metrics.pending")}
                value={pendingCases.length}
                hint={t("doctor.metrics.pendingHint", { defaultValue: "Awaiting completion" })}
                tone="warning"
              />
              <WorkspaceStat
                icon={MessageCircle}
                label={t("doctor.metrics.messages")}
                value={unreadCount}
                hint={t("doctor.metrics.messagesHint", { defaultValue: "Unread conversations" })}
                tone="violet"
                onClick={() => setActiveTab("messages")}
              />
            </section>

            <CasesView
              cases={sortedCases}
              selectedCase={selectedCase}
              loading={casesLoading}
              fetching={casesFetching}
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onRefresh={refetchCases}
              onClear={() => {
                setSearch("");
                setStatusFilter("");
              }}
              queryPending={search !== debouncedSearch || casesFetching}
              onSelect={(item: any) => setSelectedCaseKey(getCaseKey(item))}
              onReport={setSelectedExamId}
              onMessage={startCaseMessage}
              formatDate={formatDate}
              formatDateTime={formatDateTime}
              t={t}
            />
          </div>
        )}

        {activeTab === "reports" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={FileText}
              eyebrow={t("doctor.reports.eyebrow", { defaultValue: "Diagnostic archive" })}
              title={t("doctor.tabs.reports")}
              description={t("doctor.reports.description", {
                defaultValue:
                  "Review and download consultant-finalized reports for your referred patients.",
              })}
              aside={
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-400/10">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    {t("doctor.report.finalized")}
                  </p>
                  <strong className="mt-1 block text-2xl font-black text-foreground">
                    {finalizedCases.length}
                  </strong>
                </div>
              }
            />
            <ReportsView
              cases={finalizedCases}
              onReport={setSelectedExamId}
              formatDate={formatDate}
              t={t}
            />
          </div>
        )}

        {activeTab === "order" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={Plus}
              eyebrow={t("doctor.order.eyebrow", { defaultValue: "New referral" })}
              title={t("doctor.order.title")}
              description={t("doctor.order.description")}
            />
            <OrderView
              form={orderForm}
              setForm={setOrderForm}
              onSubmit={submitOrder}
              loading={isOrdering}
              t={t}
            />
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={Bell}
              eyebrow={t("doctor.notifications.eyebrow", { defaultValue: "Clinical updates" })}
              title={t("tabs.notifications", "Notifications")}
              description={t("doctor.notifications.description", {
                defaultValue: "Track case status changes, report completion, and center updates.",
              })}
            />
            <PortalNotificationsView role="doctor" locale={locale} t={t} onNavigate={openPortalTab} />
          </div>
        )}

        {activeTab === "messages" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={MessageCircle}
              eyebrow={t("doctor.messages.secureThread")}
              title={t("doctor.tabs.messages")}
              description={t("doctor.messages.description", {
                defaultValue:
                  "Coordinate securely with reception and the radiology team about referred cases.",
              })}
            />
            <MessagesView
              messages={messages}
              loading={messagesLoading}
              onRefresh={refetchMessages}
              form={messageForm}
              setForm={setMessageForm}
              onSubmit={submitMessage}
              sending={isSending}
              locale={locale}
              t={t}
            />
          </div>
        )}
        <PortalChatBubble role="doctor" />
      </DashboardLayout>
    </PortalIdentityProvider>
  );
};

const ReportDetail = ({
  examId,
  onClose,
  locale,
  t,
}: {
  examId: string;
  onClose: () => void;
  locale: string;
  t: any;
}) => {
  const { data: report, isLoading, error } = useGetDoctorReportQuery(examId, { skip: !examId });
  const formatDate = (value: any) =>
    value
      ? new Date(value).toLocaleDateString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";
  const sections = normalizeReportSections(report);
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      if (dialogRef.current) {
        const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), textarea, input, select',
        );
        (firstFocusable || dialogRef.current).focus();
      }
    });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  const printReport = async () => {
    try {
      const response = await fetchWithAuthRetry(
        `/doctor-portal/reports/${encodeURIComponent(examId)}/pdf`,
      );
      if (!response.ok) throw new Error();
      const htmlText = await response.text();
      openPrintableReport(htmlText, {
        printImmediately: true,
        fallbackFileName: `report_${examId}.html`,
      });
    } catch {
      toast.error(t("doctor.report.downloadError"));
    }
  };

  const downloadPdf = async () => {
    try {
      const response = await fetchWithAuthRetry(
        `/doctor-portal/reports/${encodeURIComponent(examId)}/pdf?format=pdf&disposition=attachment`,
      );
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const orderNum = report?.order_number || examId;
      link.download = `Diagnostic-Report-${orderNum}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(t("doctor.report.downloaded"));
    } catch {
      toast.error(t("doctor.report.downloadError"));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:p-4"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="doctor-report-title"
        className="flex max-h-[100dvh] min-h-0 w-full max-w-5xl flex-col overflow-hidden border border-border bg-surface shadow-2xl outline-none sm:max-h-[92dvh] sm:rounded-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface/95 p-4 backdrop-blur sm:p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-primary-700 dark:text-primary-300">
              {t("doctor.brand")}
            </p>
            <h2
              id="doctor-report-title"
              className="mt-1 truncate text-xl font-black tracking-tight text-foreground sm:text-2xl"
            >
              {report?.exam_type_name || t("doctor.report.titleFallback")}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
              {report?.order_number
                ? t("doctor.cases.order", { number: report.order_number })
                : "-"}{" "}
              · {formatDate(report?.start_time)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <>
                <button
                  type="button"
                  onClick={printReport}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-black text-foreground transition hover:bg-surface sm:px-4"
                  title={t("records.printReport", "Print Report")}
                >
                  <Printer size={15} />
                  <span className="hidden sm:inline">{t("records.printReport", "Print")}</span>
                </button>
                <button
                  type="button"
                  onClick={downloadPdf}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-700 px-3 text-xs font-black text-white transition hover:bg-primary-800 sm:px-4"
                  title={t("doctor.report.download", "Download PDF")}
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">{t("doctor.report.download", "Download PDF")}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-muted-foreground transition hover:bg-primary-50 hover:text-primary-800"
              aria-label={t("actions.close", { ns: "common", defaultValue: "Close" })}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {isLoading && <Loading label={t("doctor.report.loading")} />}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-900 dark:bg-red-950/30">
              <AlertTriangle className="mx-auto mb-3" size={28} />
              <p className="text-sm font-semibold">{t("doctor.report.error")}</p>
            </div>
          )}
          {report && (
            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              <aside className="grid gap-3 sm:grid-cols-2 lg:block lg:space-y-3">
                <InfoBlock label={t("doctor.report.patientMrn")} value={report.patient_mrn} />
                <InfoBlock label={t("doctor.report.modality")} value={report.modality} />
                <InfoBlock label={t("doctor.report.radiologist")} value={report.radiologist_name} />
                <InfoBlock
                  label={t("doctor.report.finalized")}
                  value={formatDate(report.finalized_at)}
                />
                {report.patient_name && (
                  <InfoBlock label={t("doctor.cases.patient")} value={report.patient_name} />
                )}
              </aside>
              <div className="space-y-4">
                {report.clinical_indication && (
                  <section className="rounded-2xl border border-primary-100 bg-primary-50 p-4 dark:border-primary-900/50 dark:bg-primary-900/20">
                    <h3 className="text-xs font-black uppercase tracking-[.12em] text-primary-800 dark:text-primary-300">
                      {t("doctor.report.clinical")}
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-300">
                      {report.clinical_indication}
                    </p>
                  </section>
                )}
                {sections.length > 0 ? (
                  <section className="rounded-2xl border border-border bg-surface p-4">
                    <h3 className="text-xs font-black uppercase tracking-[.12em] text-slate-500">
                      {t("doctor.report.report")}
                    </h3>
                    <div className="mt-4 space-y-4">
                      {sections.map(([key, value]) => (
                        <div key={key}>
                          <p className="text-[10px] font-black uppercase tracking-[.12em] text-primary-700 dark:text-primary-300">
                            {labelize(key)}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-200">
                            {String(value ?? "")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="rounded-2xl border border-border bg-surface p-4">
                    <h3 className="text-xs font-black uppercase tracking-[.12em] text-slate-500">
                      {t("doctor.report.report")}
                    </h3>
                    <div className="mt-3 whitespace-pre-wrap rounded-xl bg-background p-4 text-sm leading-8 text-foreground">
                      {renderReportContent(report.report_content)}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const CasesView = ({
  cases,
  selectedCase,
  loading,
  fetching,
  queryPending,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  onRefresh,
  onClear,
  onSelect,
  onReport,
  onMessage,
  formatDate,
  formatDateTime,
  t,
}: any) => (
  <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <div className="group relative">
            <Search
              size={17}
              className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-300"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("doctor.cases.search")}
              className={`${inputClass} ps-10`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute end-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={t("doctor.cases.clearSearch", { defaultValue: "Clear search" })}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="relative">
            <Filter
              size={15}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`${inputClass} ps-9`}
            >
              <option value="">{t("doctor.cases.allStatuses")}</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`, { defaultValue: status })}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-xs font-black text-muted-foreground transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800"
          >
            <RefreshCw size={14} className={queryPending ? "animate-spin" : ""} />
            {t("actions.refresh", { ns: "common", defaultValue: "Refresh" })}
          </button>
        </div>
        <div className="mt-3 flex min-h-7 flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-[11px] font-semibold text-muted-foreground">
            {t("doctor.cases.resultCount", {
              defaultValue: `${cases.length} cases`,
              count: cases.length,
            })}
          </p>
          {(search || statusFilter) && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1.5 text-[11px] font-black text-primary-700 hover:text-primary-900 dark:text-primary-300"
            >
              <X size={13} />
              {t("doctor.cases.clearFilters", { defaultValue: "Clear filters" })}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Loading label={t("doctor.cases.loading")} />
      ) : cases.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={Briefcase}
            title={t("doctor.cases.emptyTitle")}
            description={t("doctor.cases.emptyDescription")}
          />
        </div>
      ) : (
        <div
          className={`grid gap-3 transition-opacity ${queryPending ? "opacity-65" : "opacity-100"}`}
          aria-busy={queryPending}
        >
          {cases.map((item: any) => (
            <CaseCard
              key={getCaseKey(item)}
              item={item}
              selected={getCaseKey(item) === getCaseKey(selectedCase)}
              onSelect={() => onSelect(item)}
              onReport={onReport}
              formatDate={formatDate}
              t={t}
            />
          ))}
        </div>
      )}
    </div>

    <CaseDetailPanel
      item={selectedCase}
      onReport={onReport}
      onMessage={onMessage}
      formatDateTime={formatDateTime}
      t={t}
    />
  </section>
);

const getCaseKey = (item: any) =>
  item ? String(item.exam_id || item.appointment_id || item.order_number || item.patient_mrn) : "";
const isToday = (value: any) =>
  value ? new Date(value).toDateString() === new Date().toDateString() : false;

const normalizeReportSections = (report: any) => {
  let sections = report?.report_sections;
  if (typeof sections === "string") {
    try {
      sections = JSON.parse(sections);
    } catch {
      return [];
    }
  }
  if (!sections || typeof sections !== "object") return [];
  return Object.entries(sections).filter(([, value]) => value && String(value).trim());
};

const renderReportContent = (content: any) => {
  if (!content) return "-";
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
};

const labelize = (value: any) =>
  String(value)
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());

export default DoctorPortal;
