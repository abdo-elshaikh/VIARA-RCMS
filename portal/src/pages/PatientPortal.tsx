import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  Activity,
  Award,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  Download,
  FileText,
  Heart,
  Info,
  Mail,
  MessageSquare,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  useCreatePortalAppointmentRequestMutation,
  useCreatePortalProfileUpdateRequestMutation,
  useGetMyAppointmentRequestsQuery,
  useGetMyPortalDocumentsQuery,
  useGetMyPortalInvoicesQuery,
  useGetMyRecordsQuery,
  useGetMyPortalProfileQuery,
  useGetMyPortalNotificationUnreadCountQuery,
  useGetCenterSettingsQuery,
  useLazyDownloadPortalDocumentQuery,
} from "../store/api";
import { logOut, selectCurrentUser } from "../store/authSlice";
import { getErrorMessage } from "../utils/getErrorMessage";
import { normalizeCenterSettings } from "../utils/centerSettings";
import { inputClass, primaryBtn, secondaryBtn } from "../utils/designTokens";
import { formatLocalizedDate } from "../utils/localizedDate";
import { todayLocalISO, isPastDate } from "../utils/date";
import { openPrintableReport } from "../utils/printableReport";
import { isFinalizedRecord } from "../utils/recordStatus";
import { fetchWithAuthRetry } from "../lib/api";
import { PortalIdentityProvider, resolvePortalIdentity } from "../lib/portal-identity";

import Panel from "../components/ui/Panel";
import StatusBadge from "../components/ui/StatusBadge";
import { MoneyBlock } from "../components/ui/DataBlocks";
import { Loading, Empty } from "../components/ui/StateIndicators";
import { Field } from "../components/ui/FormElements";
import { DashboardLayout } from "../components/portal/layout/DashboardLayout";
import {
  WorkspacePageHeader,
  WorkspaceStat,
} from "../components/portal/layout/WorkspacePageHeader";
import RecordList from "../components/patient/RecordList";
import RecentRequests from "../components/patient/RecentRequests";
import ActivityList from "../components/patient/ActivityList";
import ProfileGrid from "../components/patient/ProfileGrid";
import PatientMessagesView from "../components/patient/PatientMessagesView";
import PortalChatBubble from "../components/PortalChatBubble";
import PortalNotificationsView from "../components/PortalNotificationsView";
import { useAppDispatch, useAppSelector } from "../store/store";
import { usePortalRealtime } from "../hooks/use-portal-realtime";

const emptyRequestForm = {
  preferredDate: "",
  preferredTimeWindow: "",
  modalityType: "",
  clinicalNotes: "",
  contactPhone: "",
  contactEmail: "",
};

const emptyProfileForm = {
  phone: "",
  email: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  preferredLanguage: "",
  communicationPreference: "Phone",
};

const PATIENT_MODALITIES = [
  "MRI",
  "CT",
  "X-Ray",
  "Ultrasound",
  "Mammography",
  "PET/CT",
  "Dental & Panoramic",
  "Other",
];

const getLoyaltyTier = (points: number = 0) => {
  if (points >= 1500)
    return { key: "platinum", label: "Platinum", tone: "from-slate-950 to-slate-700", next: 0 };
  if (points >= 800)
    return { key: "gold", label: "Gold", tone: "from-amber-700 to-orange-600", next: 1500 };
  if (points >= 300)
    return { key: "silver", label: "Silver", tone: "from-slate-600 to-slate-400", next: 800 };
  return { key: "bronze", label: "Bronze", tone: "from-orange-800 to-amber-600", next: 300 };
};

const PatientPortal = () => {
  const { t, i18n } = useTranslation("portal");
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppSelector(selectCurrentUser);
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const locale = i18n.language?.startsWith("ar") ? "ar-EG" : "en-GB";

  const {
    data: records = [],
    isLoading: isLoadingRecords,
    isFetching: isFetchingRecords,
    refetch: refetchRecords,
  } = useGetMyRecordsQuery(undefined);
  const { data: invoices = [], isFetching: isFetchingInvoices } =
    useGetMyPortalInvoicesQuery(undefined);
  const { data: documents = [], isFetching: isFetchingDocuments } =
    useGetMyPortalDocumentsQuery(undefined);
  const {
    data: requests = [],
    isFetching: isFetchingRequests,
    refetch: refetchRequests,
  } = useGetMyAppointmentRequestsQuery(undefined);
  const { data: notificationUnreadData } = useGetMyPortalNotificationUnreadCountQuery(undefined, {
    pollingInterval: 15000,
    skipPollingIfUnfocused: true,
  });
  const { data: profileData, isLoading: isLoadingProfile } = useGetMyPortalProfileQuery(undefined);
  const { data: rawCenterSettings } = useGetCenterSettingsQuery(undefined);
  const [downloadDocument] = useLazyDownloadPortalDocumentQuery();
  const [createAppointmentRequest, { isLoading: isRequestingAppointment }] =
    useCreatePortalAppointmentRequestMutation();
  const [createProfileUpdateRequest, { isLoading: isRequestingProfileUpdate }] =
    useCreatePortalProfileUpdateRequestMutation();

  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = searchParams.get("tab");
    return ["overview", "records", "invoices", "crm", "documents", "requests", "notifications", "messages"].includes(requestedTab || "")
      ? requestedTab!
      : "overview";
  });
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(() => searchParams.get("entityId"));
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);

  usePortalRealtime(Boolean(user), ({ event: realtimeEvent }) => {
    if (realtimeEvent === "NEW_NOTIFICATION") {
      dispatch(api.util.invalidateTags(["PortalNotifications"]));
    } else if (realtimeEvent === "NEW_PORTAL_MESSAGE") {
      dispatch(api.util.invalidateTags(["PatientMessages"]));
      // The full messages tab already shows the new message (and resets the
      // badge on entry); only notify the floating bubble when it is not visible.
      if (activeTab !== "messages") {
        window.dispatchEvent(new CustomEvent("SSE_PATIENT_MESSAGE_UPDATE"));
      }
    }
  });

  const openPortalTab = (tab: string, entityId?: string | null) => {
    setActiveTab(tab);
    if (tab === "records" && entityId) setExpandedRecordId(entityId);
    setSearchParams(entityId ? { tab, entityId } : { tab }, { replace: true });
  };

  useEffect(() => {
    if (activeTab === "messages") {
      window.dispatchEvent(new Event("VIARA_PORTAL_MESSAGES_VIEWED"));
    }
  }, [activeTab]);

  const centerSettings = useMemo(
    () => normalizeCenterSettings(rawCenterSettings || {}, language),
    [rawCenterSettings, language],
  );
  const portalIdentity = useMemo(
    () => resolvePortalIdentity({ settings: rawCenterSettings || {}, language }),
    [rawCenterSettings, language],
  );
  const centerDisplayName = [portalIdentity.center.name, portalIdentity.branch.name]
    .filter(Boolean)
    .join(" · ");
  const centerInitials = portalIdentity.center.initials;
  const patient = profileData?.profile || {};
  const activities = profileData?.activities || [];
  const finalizedRecords = useMemo(() => records.filter(isFinalizedRecord), [records]);

  useEffect(() => {
    document.title = `${t("patient.brand", "Patient Portal")} | ${centerDisplayName || "VIARA"}`;
  }, [centerDisplayName, t]);
  const upcomingRecords = useMemo(
    () =>
      records
        .filter((record: any) => ["Scheduled", "Confirmed"].includes(record.appointment_status))
        .sort(
          (a: any, b: any) =>
            new Date(a.start_time || a.appointment_date || 0).getTime() -
            new Date(b.start_time || b.appointment_date || 0).getTime(),
        ),
    [records],
  );
  const instructions = useMemo(
    () => records.filter((record: any) => record.preparation_instructions),
    [records],
  );
  const invoiceBalance = useMemo(
    () =>
      invoices.reduce(
        (sum: number, invoice: any) => sum + Number(invoice.balance_amount || invoice.balance || 0),
        0,
      ),
    [invoices],
  );
  const invoiceTotal = useMemo(
    () =>
      invoices.reduce(
        (sum: number, invoice: any) => sum + Number(invoice.total_amount || invoice.total || 0),
        0,
      ),
    [invoices],
  );
  const invoicePaid = useMemo(
    () =>
      invoices.reduce(
        (sum: number, invoice: any) => sum + Number(invoice.paid_amount || invoice.paid || 0),
        0,
      ),
    [invoices],
  );
  const nextAppointment = upcomingRecords[0] || null;
  const tier = getLoyaltyTier(Number(patient.loyalty_points || 0));
  const tierProgress = tier.next
    ? Math.min(100, Math.round((Number(patient.loyalty_points || 0) / tier.next) * 100))
    : 100;

  useEffect(() => {
    if (!profileData?.profile) return;
    setProfileForm({
      phone: patient.phone || "",
      email: patient.email || "",
      address: patient.address || "",
      emergencyContactName: patient.emergency_contact_name || "",
      emergencyContactPhone: patient.emergency_contact_phone || "",
      preferredLanguage: patient.preferred_language || language,
      communicationPreference: patient.communication_preference || "Phone",
    });
  }, [
    language,
    patient.address,
    patient.communication_preference,
    patient.email,
    patient.emergency_contact_name,
    patient.emergency_contact_phone,
    patient.phone,
    patient.preferred_language,
    profileData?.profile,
  ]);

  const formatDate = (dateStr: any, showTime = false) => {
    if (!dateStr) return "—";
    const options: Intl.DateTimeFormatOptions = showTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" };
    return formatLocalizedDate(dateStr, locale, options);
  };

  const formatMoney = (amount: any) =>
    Number(amount || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const currency = t("patient.currency", "EGP");
  const examName = (record: any) =>
    record?.exam_type_name ||
    record?.modality ||
    record?.modality_type ||
    t("patient.examFallback", "Imaging exam");
  const translateStatus = (value: string) =>
    t(`status.${value || "Pending"}`, { defaultValue: value || t("common.pending", "Pending") });
  const getRecordKey = (record: any) =>
    String(
      record.exam_id ||
        record.appointment_id ||
        record.order_number ||
        `${record.start_time}-${examName(record)}`,
    );

  const tabs = [
    { key: "overview", label: t("tabs.overview", "Overview"), icon: Activity },
    {
      key: "records",
      label: t("tabs.records", "Medical Records"),
      icon: FileText,
      count: records.length,
    },
    {
      key: "invoices",
      label: t("tabs.invoices", "Billing"),
      icon: Receipt,
      count: invoices.length,
    },
    { key: "crm", label: t("tabs.crm", "Care Club"), icon: Award },
    {
      key: "documents",
      label: t("tabs.documents", "Documents"),
      icon: Download,
      count: documents.length,
    },
    {
      key: "requests",
      label: t("tabs.requests", "Requests"),
      icon: Calendar,
      count: requests.length,
    },
    {
      key: "notifications",
      label: t("tabs.notifications", "Notifications"),
      icon: Bell,
      count: notificationUnreadData?.unreadCount || null,
    },
    { key: "messages", label: t("tabs.messages", "Support Chat"), icon: MessageSquare },
  ];

  const handleLogout = async () => {
    try {
      await dispatch(api.endpoints.logout.initiate(undefined)).unwrap();
    } catch (_) {}
    dispatch(api.util.resetApiState());
    dispatch(logOut());
    navigate("/patient/login");
  };

  const normalizeSections = (record: any) => ({
    clinicalHistory:
      record.report_sections?.clinicalHistory ||
      record.exam_clinical_indication ||
      record.clinical_indication ||
      "",
    technique: record.report_sections?.technique || "",
    findings: record.report_sections?.findings || record.report_content || "",
    impression: record.report_sections?.impression || "",
    recommendations: record.report_sections?.recommendations || "",
  });

  const copyReport = async (textValue: string) => {
    try {
      await navigator.clipboard.writeText(textValue || "");
      toast.success(t("common.copied", { defaultValue: "Copied" }));
    } catch {
      toast.error(t("common.copyError", { defaultValue: "Failed to copy" }));
    }
  };

  const handleExportWord = async (record: any) => {
    if (!isFinalizedRecord(record)) {
      toast.error(t("records.notReady", "The final report is not available yet."));
      return;
    }

    try {
      const { exportReportToWord } = await import("../utils/exportReportToWord");
      const exam = {
        ...record,
        exam_id: record.exam_id,
        patient_name: patient.full_name || user?.name,
        mrn: patient.mrn,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        report_locked: true,
        report_status: record.report_status || "Finalized",
        body_part: record.exam_body_part || record.body_part,
        clinical_indication: record.exam_clinical_indication || record.clinical_indication,
      };
      await exportReportToWord({
        exam,
        sections: normalizeSections(record),
        t,
        locale,
        centerSettings,
      });
      toast.success(t("records.wordTitle", "Download Word report"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("patient.documentError", "Unable to open document")));
    }
  };

  const fetchFinalReportHtml = async (record: any) => {
    if (!record.exam_id || !isFinalizedRecord(record)) {
      throw new Error(t("records.notReady", "The final report is not available yet."));
    }

    const response = await fetchWithAuthRetry(
      `/exams/${encodeURIComponent(record.exam_id)}/report/pdf?customize=false`,
    );
    if (!response.ok) throw new Error(t("patient.documentError", "Unable to open document"));
    return response.text();
  };

  const handlePreviewReport = async (record: any) => {
    try {
      openPrintableReport(await fetchFinalReportHtml(record));
    } catch (error) {
      toast.error(getErrorMessage(error, t("patient.documentError", "Unable to open document")));
    }
  };

  const handlePrintReport = async (record: any) => {
    try {
      openPrintableReport(await fetchFinalReportHtml(record), { printImmediately: true });
    } catch (error) {
      toast.error(getErrorMessage(error, t("patient.documentError", "Unable to open document")));
    }
  };

  const handleDownloadPdf = async (record: any) => {
    if (!record.exam_id || !isFinalizedRecord(record)) {
      toast.error(t("records.notReady", "The final report is not available yet."));
      return;
    }

    try {
      const response = await fetchWithAuthRetry(
        `/exams/${encodeURIComponent(record.exam_id)}/report/pdf?format=pdf&disposition=attachment`,
      );
      if (!response.ok) throw new Error(t("patient.documentError", "Unable to open document"));

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const orderNum = record.order_number || record.appointment_id || record.exam_id;
      link.download = `Diagnostic-Report-${orderNum}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(t("records.downloadPdfSuccess", "Report PDF downloaded successfully"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("patient.documentError", "Unable to open document")));
    }
  };

  const submitAppointmentRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requestForm.preferredDate) {
      toast.error(t("patient.appointment.dateRequired", "Choose a preferred date."));
      return;
    }
    if (isPastDate(requestForm.preferredDate)) {
      toast.error(t("patient.appointment.pastDate", "The preferred date cannot be in the past."));
      return;
    }
    try {
      await createAppointmentRequest({
        ...requestForm,
        clinicalNotes: requestForm.clinicalNotes.trim() || undefined,
        contactPhone: requestForm.contactPhone.trim() || undefined,
        contactEmail: requestForm.contactEmail.trim() || undefined,
      }).unwrap();
      setRequestForm(emptyRequestForm);
      toast.success(t("patient.appointment.success", "Your appointment request was sent."));
      refetchRequests();
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("patient.appointment.error", "Unable to send the request.")),
      );
    }
  };

  const submitProfileUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createProfileUpdateRequest(profileForm).unwrap();
      toast.success(
        t("patient.profileUpdate.success", "Your profile update request was sent for review."),
      );
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          t("patient.profileUpdate.error", "Unable to send the profile update request."),
        ),
      );
    }
  };

  const handleDownloadDocument = async (document: any) => {
    const documentId = String(document.document_id || document.id || "");
    if (!documentId && !document.file_url) return;
    try {
      if (document.file_url) {
        window.open(document.file_url, "_blank", "noopener,noreferrer");
        return;
      }
      const result = await downloadDocument(documentId).unwrap();
      const url =
        typeof result === "string"
          ? result
          : result?.file_url || result?.url || result?.download_url;
      if (!url) throw new Error(t("patient.documentError", "Unable to open document"));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(getErrorMessage(error, t("patient.documentError", "Unable to open document")));
    }
  };

  const primaryActionClass = `${primaryBtn} px-4 text-xs`;
  const secondaryActionClass = `${secondaryBtn} px-4 text-xs`;

  return (
    <PortalIdentityProvider authenticated>
      <DashboardLayout
        icon={Activity}
        title={t("patient.brand", "Patient Portal")}
        subtitle={patient.mrn || user?.mrn || "MRN"}
        userName={user?.name || patient.full_name || t("patient.patientFallback", "Patient")}
        centerName={centerDisplayName}
        centerLogo={portalIdentity.center.logoUrl || undefined}
        centerInitials={centerInitials}
        onLogout={handleLogout}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={openPortalTab}
      >
        {activeTab === "overview" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={ShieldCheck}
              eyebrow={centerDisplayName || t("patient.brand", "Patient Portal")}
              title={t("patient.welcome", {
                name: patient.full_name || user?.name || t("patient.patientFallback", "Patient"),
                defaultValue: "Welcome, {{name}}",
              })}
              description={t(
                "patient.heroDescription",
                "Track visits, open finalized reports, manage billing, and request updates from one secure workspace.",
              )}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab("records")}
                    className={primaryActionClass}
                  >
                    <FileText size={15} />
                    {t("patient.openRecords", "Open medical records")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("requests")}
                    className={secondaryActionClass}
                  >
                    <Calendar size={15} />
                    {t("patient.requestAppointment", "Request appointment")}
                  </button>
                </>
              }
              aside={
                nextAppointment ? (
                  <div className="rounded-xl border border-primary-100 bg-primary-50/80 p-4 dark:border-primary-900/50 dark:bg-primary-900/20">
                    <p className="text-[10px] font-black uppercase tracking-[.12em] text-primary-700 dark:text-primary-300">
                      {t("patient.nextAppointment", "Next appointment")}
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-foreground">
                      {examName(nextAppointment)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(
                        nextAppointment.start_time || nextAppointment.appointment_date,
                        true,
                      )}
                    </p>
                    <div className="mt-3">
                      <StatusBadge
                        status={nextAppointment.appointment_status}
                        label={translateStatus(nextAppointment.appointment_status)}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab("requests")}
                    className="w-full rounded-xl border border-dashed border-primary-200 bg-primary-50/60 p-4 text-start transition hover:border-primary-400 dark:border-primary-800 dark:bg-primary-900/15"
                  >
                    <p className="text-xs font-black text-primary-800 dark:text-primary-300">
                      {t("patient.noUpcoming", "No upcoming appointment")}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      {t("patient.bookNext", "Request your next visit")}
                      <ChevronRight size={13} className="rtl:rotate-180" />
                    </p>
                  </button>
                )
              }
            />

            <section
              aria-label={t("patient.summary.label", "Account summary")}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <WorkspaceStat
                icon={FileText}
                label={t("patient.summary.records", "Studies")}
                value={records.length}
                hint={t("patient.summary.recordsHint", "All imaging records")}
                onClick={() => setActiveTab("records")}
              />
              <WorkspaceStat
                icon={CheckCircle2}
                label={t("patient.summary.finalized", "Final reports")}
                value={finalizedRecords.length}
                hint={t("patient.summary.readyHint", "Ready to view")}
                tone="success"
                onClick={() => setActiveTab("records")}
              />
              <WorkspaceStat
                icon={CreditCard}
                label={t("patient.summary.balance", "Outstanding")}
                value={`${formatMoney(invoiceBalance)} ${currency}`}
                hint={t("patient.summary.balanceHint", "Current balance")}
                tone={invoiceBalance > 0 ? "warning" : "success"}
                onClick={() => setActiveTab("invoices")}
              />
              <WorkspaceStat
                icon={Calendar}
                label={t("patient.summary.requests", "Requests")}
                value={requests.length}
                hint={t("patient.summary.requestsHint", "Appointment requests")}
                tone="violet"
                onClick={() => setActiveTab("requests")}
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
              <Panel
                icon={FileText}
                title={t("patient.recentRecords", "Recent imaging records")}
                description={t(
                  "patient.recentRecordsHint",
                  "Open a study to view status, report details, and downloads.",
                )}
                action={
                  <button
                    type="button"
                    onClick={() => setActiveTab("records")}
                    className={secondaryActionClass}
                  >
                    {t("common.viewAll", "View all")}
                    <ChevronRight size={14} className="rtl:rotate-180" />
                  </button>
                }
              >
                {isLoadingRecords ? (
                  <Loading compact label={t("patient.records.loading", "Loading records")} />
                ) : (
                  <RecordList
                    records={records.slice(0, 3)}
                    emptyLabel={t("patient.empty.records", "No medical records found.")}
                    expandedRecordId={expandedRecordId}
                    setExpandedRecordId={setExpandedRecordId}
                    getRecordKey={getRecordKey}
                    examName={examName}
                    translateStatus={translateStatus}
                    formatDate={formatDate}
                    onPreviewReport={handlePreviewReport}
                    onPrintReport={handlePrintReport}
                    onDownloadPdf={handleDownloadPdf}
                    onExportWord={handleExportWord}
                    onCopyReport={copyReport}
                    t={t}
                  />
                )}
              </Panel>

              <div className="space-y-5">
                <Panel
                  icon={ClipboardList}
                  title={t("patient.quickActions", "Quick actions")}
                  description={t("patient.quickActionsHint", "Common tasks, one tap away.")}
                >
                  <div className="grid gap-2.5">
                    {[
                      {
                        icon: Calendar,
                        label: t("patient.requestAppointment", "Request appointment"),
                        tab: "requests",
                      },
                      { icon: Download, label: t("tabs.documents", "Documents"), tab: "documents" },
                      { icon: Receipt, label: t("tabs.invoices", "Billing"), tab: "invoices" },
                      {
                        icon: MessageSquare,
                        label: t("tabs.messages", "Support chat"),
                        tab: "messages",
                      },
                    ].map(({ icon: Icon, label, tab }) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className="group flex min-h-11 items-center gap-3 rounded-xl border border-border bg-background px-3.5 text-start text-xs font-bold text-foreground transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800"
                      >
                        <Icon size={16} className="text-primary-600" />
                        <span className="flex-1">{label}</span>
                        <ChevronRight
                          size={14}
                          className="text-muted-foreground transition group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                        />
                      </button>
                    ))}
                  </div>
                </Panel>

                {instructions.length > 0 && (
                  <Panel icon={Info} title={t("patient.preparation", "Preparation guidance")}>
                    <div className="space-y-3">
                      {instructions.slice(0, 2).map((record: any) => (
                        <div
                          key={getRecordKey(record)}
                          className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"
                        >
                          <strong className="block">{examName(record)}</strong>
                          <span>{record.preparation_instructions}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === "records" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={FileText}
              eyebrow={t("patient.records.eyebrow", "Clinical archive")}
              title={t("tabs.records", "Medical records")}
              description={t(
                "patient.records.description",
                "Review study progress and open finalized diagnostic reports securely.",
              )}
              actions={
                <button
                  type="button"
                  onClick={() => refetchRecords()}
                  className={secondaryActionClass}
                >
                  <RefreshCw size={15} className={isFetchingRecords ? "animate-spin" : ""} />
                  {t("common.refresh", "Refresh")}
                </button>
              }
            />
            {isLoadingRecords ? (
              <Loading label={t("patient.records.loading", "Loading records")} />
            ) : (
              <RecordList
                records={records}
                emptyLabel={t("patient.empty.records", "No medical records found.")}
                expandedRecordId={expandedRecordId}
                setExpandedRecordId={setExpandedRecordId}
                getRecordKey={getRecordKey}
                examName={examName}
                translateStatus={translateStatus}
                formatDate={formatDate}
                onPreviewReport={handlePreviewReport}
                onPrintReport={handlePrintReport}
                onDownloadPdf={handleDownloadPdf}
                onExportWord={handleExportWord}
                onCopyReport={copyReport}
                t={t}
              />
            )}
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={Receipt}
              eyebrow={t("patient.billing.eyebrow", "Financial overview")}
              title={t("tabs.invoices", "Billing")}
              description={t(
                "patient.billing.description",
                "Review invoice totals, payments, outstanding balances, and due dates.",
              )}
            />
            <section className="grid gap-3 sm:grid-cols-3">
              <WorkspaceStat
                icon={Receipt}
                label={t("patient.billing.total", "Total billed")}
                value={`${formatMoney(invoiceTotal)} ${currency}`}
              />
              <WorkspaceStat
                icon={CheckCircle2}
                label={t("patient.billing.paid", "Paid")}
                value={`${formatMoney(invoicePaid)} ${currency}`}
                tone="success"
              />
              <WorkspaceStat
                icon={CreditCard}
                label={t("patient.billing.outstanding", "Outstanding")}
                value={`${formatMoney(invoiceBalance)} ${currency}`}
                tone={invoiceBalance > 0 ? "warning" : "success"}
              />
            </section>
            <Panel
              icon={CreditCard}
              title={t("patient.billing.invoices", "Invoices")}
              description={t(
                "patient.billing.invoiceHint",
                "Amounts and payment status for your visits.",
              )}
            >
              {isFetchingInvoices && !invoices.length ? (
                <Loading compact label={t("patient.billing.loading", "Loading invoices")} />
              ) : !invoices.length ? (
                <Empty>{t("patient.empty.invoices", "No invoices available.")}</Empty>
              ) : (
                <div className="grid gap-3">
                  {invoices.map((invoice: any) => {
                    const balance = Number(invoice.balance_amount || invoice.balance || 0);
                    return (
                      <article
                        key={invoice.invoice_id || invoice.id || invoice.invoice_number}
                        className="grid gap-4 rounded-2xl border border-border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-black text-foreground">
                              {invoice.invoice_number || t("patient.billing.invoice", "Invoice")}
                            </h3>
                            <StatusBadge
                              status={invoice.status || (balance > 0 ? "Pending" : "Paid")}
                              label={translateStatus(
                                invoice.status || (balance > 0 ? "Pending" : "Paid"),
                              )}
                            />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(invoice.issue_date || invoice.created_at)}
                            {invoice.due_date
                              ? ` · ${t("patient.billing.due", "Due")} ${formatDate(invoice.due_date)}`
                              : ""}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:min-w-[17rem]">
                          <MoneyBlock
                            label={t("patient.billing.total", "Total")}
                            value={`${formatMoney(invoice.total_amount || invoice.total)} ${currency}`}
                          />
                          <MoneyBlock
                            label={t("patient.billing.balance", "Balance")}
                            value={`${formatMoney(balance)} ${currency}`}
                            strong={balance > 0}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={Download}
              eyebrow={t("patient.documents.eyebrow", "Secure files")}
              title={t("tabs.documents", "Documents")}
              description={t(
                "patient.documents.description",
                "Access referrals, consent forms, receipts, and other files shared with you.",
              )}
            />
            {isFetchingDocuments && !documents.length ? (
              <Loading label={t("patient.documents.loading", "Loading documents")} />
            ) : !documents.length ? (
              <Empty>{t("patient.empty.documents", "No documents available.")}</Empty>
            ) : (
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {documents.map((document: any) => (
                  <article
                    key={document.document_id || document.id}
                    className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300">
                      <FileText size={19} />
                    </span>
                    <h2 className="mt-4 truncate text-sm font-black text-foreground">
                      {document.title ||
                        document.file_name ||
                        document.document_type ||
                        t("patient.documents.file", "Medical document")}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(document.created_at || document.uploaded_at)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDownloadDocument(document)}
                      className={`${secondaryActionClass} mt-5 w-full`}
                    >
                      <Download size={15} />
                      {t("common.download", "Download")}
                    </button>
                  </article>
                ))}
              </section>
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={Calendar}
              eyebrow={t("patient.appointment.eyebrow", "Visit planning")}
              title={t("tabs.requests", "Appointment requests")}
              description={t(
                "patient.appointment.description",
                "Share your preferred scan and timing; reception will confirm the final appointment.",
              )}
            />
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]">
              <Panel
                icon={Send}
                title={t("patient.appointment.newRequest", "New appointment request")}
              >
                <form onSubmit={submitAppointmentRequest} className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("patient.appointment.modality", "Service")}>
                    <select
                      value={requestForm.modalityType}
                      onChange={(event) =>
                        setRequestForm((current) => ({
                          ...current,
                          modalityType: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">
                        {t("patient.appointment.selectService", "Select a service")}
                      </option>
                      {PATIENT_MODALITIES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("patient.appointment.date", "Preferred date")} required>
                    <input
                      type="date"
                      min={todayLocalISO()}
                      value={requestForm.preferredDate}
                      onChange={(event) =>
                        setRequestForm((current) => ({
                          ...current,
                          preferredDate: event.target.value,
                        }))
                      }
                      className={inputClass}
                      required
                    />
                  </Field>
                  <Field label={t("patient.appointment.time", "Preferred time")}>
                    <select
                      value={requestForm.preferredTimeWindow}
                      onChange={(event) =>
                        setRequestForm((current) => ({
                          ...current,
                          preferredTimeWindow: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">
                        {t("patient.appointment.anyTime", "Any available time")}
                      </option>
                      <option value="Morning (8am-12pm)">{t("patient.appointment.timeWindows.morning")}</option>
                      <option value="Afternoon (12pm-4pm)">{t("patient.appointment.timeWindows.afternoon")}</option>
                      <option value="Evening (4pm-7pm)">{t("patient.appointment.timeWindows.evening")}</option>
                    </select>
                  </Field>
                  <Field label={t("patient.appointment.phone", "Contact phone")}>
                    <input
                      value={requestForm.contactPhone}
                      onChange={(event) =>
                        setRequestForm((current) => ({
                          ...current,
                          contactPhone: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={patient.phone || ""}
                    />
                  </Field>
                  <Field label={t("patient.appointment.email", "Contact email")}>
                    <input
                      type="email"
                      value={requestForm.contactEmail}
                      onChange={(event) =>
                        setRequestForm((current) => ({
                          ...current,
                          contactEmail: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder={patient.email || ""}
                    />
                  </Field>
                  <Field
                    label={t("patient.appointment.notes", "Clinical notes")}
                    className="sm:col-span-2"
                  >
                    <textarea
                      rows={4}
                      value={requestForm.clinicalNotes}
                      onChange={(event) =>
                        setRequestForm((current) => ({
                          ...current,
                          clinicalNotes: event.target.value,
                        }))
                      }
                      className={`${inputClass} h-auto py-3`}
                      placeholder={t(
                        "patient.appointment.notesPlaceholder",
                        "Symptoms, body area, or special scheduling needs",
                      )}
                    />
                  </Field>
                  <button
                    type="submit"
                    disabled={isRequestingAppointment}
                    className={`${primaryActionClass} sm:col-span-2`}
                  >
                    {isRequestingAppointment ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    {isRequestingAppointment
                      ? t("patient.appointment.sending", "Sending request")
                      : t("patient.appointment.submit", "Send appointment request")}
                  </button>
                </form>
              </Panel>
              <Panel
                icon={Clock}
                title={t("patient.appointment.recentRequests", "Recent requests")}
              >
                <RecentRequests
                  requests={requests}
                  loading={isFetchingRequests}
                  formatDate={formatDate}
                  translateStatus={translateStatus}
                  t={t}
                />
              </Panel>
            </section>
          </div>
        )}

        {activeTab === "crm" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={Award}
              eyebrow={t("patient.crm.eyebrow", "Care Club")}
              title={t("tabs.crm", "Care Club & profile")}
              description={t(
                "patient.crm.description",
                "View your membership progress and keep your contact preferences current.",
              )}
            />
            <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div
                className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${tier.tone} p-6 text-white shadow-lg`}
              >
                <Heart className="absolute -end-5 -top-5 h-32 w-32 opacity-10" />
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/70">
                  {t("patient.crm.membership", "Membership tier")}
                </p>
                <h2 className="mt-2 text-3xl font-black">
                  {t(`patient.tiers.${tier.key}`, tier.label)}
                </h2>
                <p className="mt-1 text-sm text-white/75">
                  {Number(patient.loyalty_points || 0).toLocaleString(locale)}{" "}
                  {t("patient.crm.points", "points")}
                </p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${tierProgress}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-white/70">
                  {tier.next
                    ? t("patient.crm.nextTier", {
                        count: Math.max(0, tier.next - Number(patient.loyalty_points || 0)),
                        defaultValue: "{{count}} points to the next tier",
                      })
                    : t("patient.crm.topTier", "You reached the highest tier")}
                </p>
              </div>
              <Panel
                icon={User}
                title={t("patient.profileInfo.title", "Patient profile")}
                description={t(
                  "patient.profileInfo.description",
                  "Clinical identity details held by the center.",
                )}
              >
                {isLoadingProfile ? (
                  <Loading compact label={t("patient.profileInfo.loading", "Loading profile")} />
                ) : (
                  <ProfileGrid patient={patient} formatDate={formatDate} t={t} language={language} />
                )}
              </Panel>
            </section>
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
              <Panel
                icon={Mail}
                title={t("patient.profileUpdate.title", "Request contact detail changes")}
                description={t(
                  "patient.profileUpdate.description",
                  "Changes are reviewed before updating your medical record.",
                )}
              >
                <form onSubmit={submitProfileUpdate} className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("patient.profileInfo.phone", "Phone")}>
                    <input
                      value={profileForm.phone}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, phone: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("patient.profileInfo.email", "Email")}>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, email: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label={t("patient.profileInfo.address", "Address")}
                    className="sm:col-span-2"
                  >
                    <input
                      value={profileForm.address}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, address: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("patient.profileInfo.emergencyName", "Emergency contact")}>
                    <input
                      value={profileForm.emergencyContactName}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          emergencyContactName: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("patient.profileInfo.emergencyPhone", "Emergency phone")}>
                    <input
                      value={profileForm.emergencyContactPhone}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          emergencyContactPhone: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("patient.profileInfo.communication", "Preferred contact")}>
                    <select
                      value={profileForm.communicationPreference}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          communicationPreference: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="Phone">{t("patient.profileInfo.contactOptions.phone")}</option>
                      <option value="Email">{t("patient.profileInfo.contactOptions.email")}</option>
                      <option value="WhatsApp">{t("patient.profileInfo.contactOptions.whatsapp")}</option>
                    </select>
                  </Field>
                  <Field label={t("patient.profileInfo.language", "Preferred language")}>
                    <select
                      value={profileForm.preferredLanguage}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          preferredLanguage: event.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="en">{t("patient.profileInfo.languageOptions.en")}</option>
                      <option value="ar">{t("patient.profileInfo.languageOptions.ar")}</option>
                    </select>
                  </Field>
                  <button
                    type="submit"
                    disabled={isRequestingProfileUpdate}
                    className={`${primaryActionClass} sm:col-span-2`}
                  >
                    {isRequestingProfileUpdate ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    {t("patient.profileUpdate.submit", "Submit changes for review")}
                  </button>
                </form>
              </Panel>
              <Panel icon={Activity} title={t("patient.activity.title", "Recent care activity")}>
                <ActivityList activities={activities} formatDate={formatDate} t={t} />
              </Panel>
            </section>
          </div>
        )}

        {activeTab === "messages" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={MessageSquare}
              eyebrow={t("patient.messages.eyebrow", "Secure support")}
              title={t("tabs.messages", "Support chat")}
              description={t(
                "patient.messages.description",
                "Ask reception about appointments, reports, billing, or preparation guidance.",
              )}
            />
            <PatientMessagesView onRequestAppointment={() => setActiveTab("requests")} />
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-5">
            <WorkspacePageHeader
              icon={Bell}
              eyebrow={t("patient.notifications.eyebrow", "Updates")}
              title={t("tabs.notifications", "Notifications")}
              description={t(
                "patient.notifications.description",
                "Stay informed about appointments, reports, documents, and messages.",
              )}
            />
            <PortalNotificationsView portalType="patient" locale={locale} t={t} onNavigate={openPortalTab} />
          </div>
        )}

        <PortalChatBubble role="patient" />
      </DashboardLayout>
    </PortalIdentityProvider>
  );
};

export default PatientPortal;
