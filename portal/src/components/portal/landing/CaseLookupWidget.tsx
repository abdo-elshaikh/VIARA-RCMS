import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ensureCsrfToken,
  useLookupPublicCaseStatusMutation,
  useRefreshPublicCaseStatusMutation,
  useVerifyPublicCaseStatusMutation,
} from "../../../store/api";
import { printWhenReady, sanitizePrintableHtml } from "../../../utils/printableReport";

type WorkflowState = "completed" | "current" | "pending";
interface CaseLookupResult {
  found: boolean;
  completed?: boolean;
  session?: { statusToken: string; expiresInSeconds: number };
  case?: {
    examType?: string;
    modality?: string | null;
    studyDate?: string | null;
    lastUpdatedAt?: string | null;
    status?: { code: string; label?: string; progress: number };
    workflow?: Array<{ code: string; state: WorkflowState; at?: string | null }>;
  };
  estimate?: {
    estimatedCompletionAt?: string | null;
    remainingMinutes?: number;
    delayed?: boolean;
  };
  report?: { available?: boolean; accessToken?: string; expiresInSeconds?: number };
}

const statusLabels: Record<string, { ar: string; en: string }> = {
  scheduled: { ar: "تم جدولة الموعد", en: "Appointment scheduled" },
  arrived: { ar: "تم تسجيل الوصول", en: "Visit checked in" },
  preparation: { ar: "جارٍ التحضير للفحص", en: "Preparing for imaging" },
  imaging: { ar: "الفحص جارٍ الآن", en: "Imaging in progress" },
  awaiting_report: {
    ar: "اكتمل التصوير وبانتظار التقرير",
    en: "Imaging complete, awaiting report",
  },
  reporting: { ar: "جارٍ إعداد التقرير", en: "Report in progress" },
  typing: { ar: "تم إعداد التقرير للمراجعة", en: "Report prepared for review" },
  review: { ar: "التقرير قيد المراجعة النهائية", en: "Report under final review" },
  approval: { ar: "بانتظار التوقيع النهائي", en: "Awaiting final signature" },
  completed: { ar: "التقرير النهائي جاهز", en: "Final report ready" },
};
const workflowLabels: Record<string, { ar: string; en: string }> = {
  scheduled: { ar: "الموعد", en: "Scheduled" },
  preparation: { ar: "التحضير", en: "Preparation" },
  imaging: { ar: "التصوير", en: "Imaging" },
  reporting: { ar: "التقرير", en: "Reporting" },
  completed: { ar: "جاهز", en: "Ready" },
};

const CHALLENGE_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 30;
const AUTO_REFRESH_MS = 30_000;

const errorMessageFrom = (error: unknown, fallback: string): string => {
  const data = (error as { data?: { error?: unknown; message?: unknown } } | undefined)?.data;
  const message = data?.error ?? data?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
};

const mmss = (totalSeconds: number) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const CaseLookupWidget = () => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const locale = isRtl ? "ar-EG" : "en-GB";
  const reduceMotion = useReducedMotion();
  const [identifier, setIdentifier] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [codeExpiresIn, setCodeExpiresIn] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [caseResult, setCaseResult] = useState<CaseLookupResult | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reportAction, setReportAction] = useState<"preview" | "print" | "download" | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startLookup, { isLoading: isRequesting }] = useLookupPublicCaseStatusMutation();
  const [startResend, { isLoading: isResending }] = useLookupPublicCaseStatusMutation();
  const [verifyCase, { isLoading: isVerifying }] = useVerifyPublicCaseStatusMutation();
  const [refreshStatus] = useRefreshPublicCaseStatusMutation();
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  const currentCase = caseResult?.case;
  const currentStatus = currentCase?.status;
  const finalized = Boolean(caseResult?.completed || caseResult?.report?.available);
  const progress = Math.min(100, Math.max(0, Number(currentStatus?.progress || 0)));
  const statusToken = caseResult?.session?.statusToken || null;
  const inCodeStep = Boolean(challengeId) && !caseResult;

  const formatDateTime = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };
  const remainingLabel = useMemo(() => {
    const minutes = Number(caseResult?.estimate?.remainingMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    if (minutes < 60) return isRtl ? `حوالي ${minutes} دقيقة` : `About ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return isRtl ? `حوالي ${hours} ساعة` : `About ${hours} hr`;
  }, [caseResult?.estimate?.remainingMinutes, isRtl]);

  // Countdowns: OTP validity, resend cooldown.
  const countdownActive = inCodeStep || resendCooldown > 0;
  useEffect(() => {
    if (!countdownActive) return undefined;
    const timer = window.setInterval(() => {
      setCodeExpiresIn((current) => (current === null ? null : Math.max(0, current - 1)));
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdownActive]);

  // Auto-focus the OTP input when the code step opens.
  useEffect(() => {
    if (inCodeStep) codeInputRef.current?.focus();
  }, [inCodeStep]);

  const applyChallenge = (result: {
    challengeId?: string;
    expiresInSeconds?: number;
    devCode?: string;
  }) => {
    setChallengeId(result.challengeId || null);
    setCodeExpiresIn(
      Number.isFinite(Number(result.expiresInSeconds))
        ? Number(result.expiresInSeconds)
        : CHALLENGE_TTL_SECONDS,
    );
    setDevCode(import.meta.env.DEV && result.devCode ? String(result.devCode) : null);
    setAttemptsLeft(null);
    setCode("");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!identifier.trim()) return;
    setFormError(null);
    setCaseResult(null);
    setCode("");
    setDevCode(null);
    setSessionExpired(false);
    try {
      const result = await startLookup({
        mrn: identifier.trim(),
        language: isRtl ? "ar" : "en",
      }).unwrap();
      applyChallenge(result as any);
    } catch (error) {
      setFormError(
        errorMessageFrom(
          error,
          isRtl
            ? "تعذر بدء التحقق الآن. راجع الرقم وحاول لاحقاً."
            : "Verification could not be started. Check the number and try later.",
        ),
      );
    }
  };

  const resendCode = async () => {
    if (!identifier.trim() || resendCooldown > 0) return;
    setFormError(null);
    try {
      const result = await startResend({
        mrn: identifier.trim(),
        language: isRtl ? "ar" : "en",
        resend: true,
      }).unwrap();
      applyChallenge(result as any);
    } catch (error) {
      setFormError(
        errorMessageFrom(
          error,
          isRtl
            ? "تعذر إرسال رمز جديد الآن. حاول بعد قليل."
            : "A new code could not be sent. Try again shortly.",
        ),
      );
    }
  };

  const confirmCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!challengeId || !/^\d{6}$/.test(code)) return;
    setFormError(null);
    try {
      const result = await verifyCase({ challengeId, code }).unwrap();
      setCaseResult(result as CaseLookupResult);
      setLastRefreshedAt(Date.now());
      setCodeExpiresIn(null);
      setDevCode(null);
    } catch (error) {
      const remaining = (error as { data?: { attemptsRemaining?: unknown } } | undefined)?.data
        ?.attemptsRemaining;
      setAttemptsLeft(Number.isFinite(Number(remaining)) ? Number(remaining) : null);
      setFormError(
        errorMessageFrom(
          error,
          isRtl
            ? "الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزاً جديداً."
            : "The code is incorrect or expired. Request a new code.",
        ),
      );
    }
  };

  const runStatusRefresh = useCallback(async () => {
    if (!statusToken || isRefreshing || finalized || sessionExpired) return;
    setIsRefreshing(true);
    try {
      const result = await refreshStatus({ statusToken }).unwrap();
      setCaseResult(result as CaseLookupResult);
      setLastRefreshedAt(Date.now());
    } catch {
      // Sliding session lapsed (or network error) — require re-verification.
      setSessionExpired(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [statusToken, isRefreshing, finalized, sessionExpired, refreshStatus]);

  // Follow the case: auto-refresh while the tab is visible and the report is
  // not ready yet. The server slides the session forward on each refresh.
  useEffect(() => {
    if (!statusToken || finalized || sessionExpired) return undefined;
    const tick = () => {
      if (document.visibilityState === "visible") void runStatusRefresh();
    };
    const timer = window.setInterval(tick, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [statusToken, finalized, sessionExpired, runStatusRefresh]);

  const restart = (keepIdentifier = true) => {
    setChallengeId(null);
    setCode("");
    setCaseResult(null);
    setFormError(null);
    setDevCode(null);
    setCodeExpiresIn(null);
    setAttemptsLeft(null);
    setSessionExpired(false);
    setLastRefreshedAt(null);
    if (!keepIdentifier) setIdentifier("");
  };

  const openPublicReport = async (action: "preview" | "print" | "download") => {
    const accessToken = caseResult?.report?.accessToken;
    if (!accessToken || reportAction) return;
    const popup =
      action === "preview" || action === "print" ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    setReportAction(action);
    setFormError(null);
    try {
      const csrfToken = await ensureCsrfToken();
      if (!csrfToken) throw new Error("CSRF_UNAVAILABLE");
      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
      const response = await fetch(`${baseUrl}/public/final-report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(
          action === "download"
            ? { accessToken, format: "pdf", disposition: "attachment" }
            : { accessToken },
        ),
      });
      if (!response.ok) throw new Error("REPORT_ACCESS_FAILED");
      if (action === "download") {
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "Diagnostic-Report.pdf";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const html = sanitizePrintableHtml(await response.text());
        const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
        if (popup && !popup.closed) {
          popup.location.href = url;
          if (action === "print") printWhenReady(popup);
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch {
      if (popup && !popup.closed) popup.close();
      setFormError(
        isRtl
          ? "تعذر فتح التقرير. أعد التحقق ثم حاول مرة أخرى."
          : "The report could not be opened. Verify again and retry.",
      );
    } finally {
      setReportAction(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-2xl">
      <div className="border-b border-border bg-primary/5 px-5 pb-6 pt-7 text-center sm:px-8 sm:pt-8">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" />
          {isRtl ? "استعلام محمي بخطوتين" : "Two-step secure lookup"}
        </span>
        <h2 className="mx-auto mt-2 max-w-xl text-2xl font-bold text-foreground sm:text-3xl">
          {isRtl ? "تابع حالة الفحص والتقرير" : "Track your scan and report"}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
          {isRtl
            ? "أدخل رقمك ثم أكّد رمز التحقق المرسل إلى وسيلة التواصل المسجلة."
            : "Enter your number, then confirm the code sent to the registered contact."}
        </p>
      </div>
      <div className="p-5 sm:p-8">
        {!challengeId && !caseResult && (
          <form
            onSubmit={requestCode}
            className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="case-identifier" className="sr-only">
              {isRtl ? "الرقم الطبي أو رقم الطلب" : "Medical record or order number"}
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-4 w-4 text-muted-foreground" />
              <input
                id="case-identifier"
                required
                autoFocus
                autoComplete="off"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder={isRtl ? "الرقم الطبي أو رقم الطلب" : "Medical record or order number"}
                aria-describedby="case-identifier-hint"
                className="w-full rounded-xl border border-border bg-background py-3.5 pe-4 ps-11 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <button
              type="submit"
              disabled={isRequesting}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white disabled:opacity-60"
            >
              {isRequesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              )}
              {isRtl ? "إرسال رمز التحقق" : "Send verification code"}
            </button>
          </form>
        )}

        {inCodeStep && (
          <motion.form
            onSubmit={confirmCode}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-md text-center"
          >
            <LockKeyhole className="mx-auto h-8 w-8 text-primary" />
            <h3 className="mt-3 text-lg font-bold text-foreground">
              {isRtl ? "أدخل رمز التحقق" : "Enter the verification code"}
            </h3>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              {isRtl
                ? "إذا تطابقت البيانات، أرسلنا رمزاً من 6 أرقام إلى وسيلة التواصل المسجلة."
                : "If the details match, a six-digit code was sent to the registered contact."}
            </p>

            {devCode && (
              <p
                className="mx-auto mt-3 w-fit rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                dir="ltr"
              >
                DEV code: {devCode}
              </p>
            )}

            <input
              ref={codeInputRef}
              aria-label={isRtl ? "رمز التحقق" : "Verification code"}
              aria-describedby={formError ? "case-lookup-error" : undefined}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                if (pasted) {
                  event.preventDefault();
                  setCode(pasted);
                }
              }}
              className="mt-5 w-full rounded-xl border border-border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.45em] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              dir="ltr"
            />

            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              {codeExpiresIn !== null && codeExpiresIn > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <TimerReset className="h-3.5 w-3.5 text-primary" />
                  {isRtl ? "ينتهي خلال" : "Expires in"}{" "}
                  <span className="font-mono font-bold" dir="ltr">
                    {mmss(codeExpiresIn)}
                  </span>
                </span>
              )}
              {codeExpiresIn === 0 && (
                <span className="font-bold text-red-600 dark:text-red-400">
                  {isRtl
                    ? "انتهت صلاحية الرمز — اطلب رمزاً جديداً."
                    : "The code has expired — request a new one."}
                </span>
              )}
              {attemptsLeft !== null && attemptsLeft > 0 && (
                <span>
                  {isRtl ? `${attemptsLeft} محاولات متبقية` : `${attemptsLeft} attempts left`}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifying || code.length !== 6 || codeExpiresIn === 0}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white disabled:opacity-60"
            >
              {isVerifying && <Loader2 className="h-4 w-4 animate-spin" />}
              {isRtl ? "تأكيد وعرض الحالة" : "Verify and show status"}
            </button>

            <div className="mt-3 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={resendCode}
                disabled={resendCooldown > 0 || isResending}
                className="text-xs font-bold text-primary disabled:cursor-not-allowed disabled:text-muted-foreground"
              >
                {isResending
                  ? isRtl
                    ? "جاري الإرسال..."
                    : "Sending..."
                  : resendCooldown > 0
                    ? isRtl
                      ? `رمز جديد بعد ${resendCooldown}ث`
                      : `New code in ${resendCooldown}s`
                    : isRtl
                      ? "إعادة إرسال الرمز"
                      : "Resend code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeId(null);
                  setCode("");
                  setDevCode(null);
                  setCodeExpiresIn(null);
                }}
                className="text-xs font-bold text-muted-foreground transition hover:text-foreground"
              >
                {isRtl ? "تغيير الرقم" : "Change number"}
              </button>
            </div>
          </motion.form>
        )}

        {formError && (
          <div
            id="case-lookup-error"
            role="alert"
            className="mx-auto mt-5 flex max-w-2xl items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {sessionExpired && caseResult && (
          <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
              {isRtl ? "انتهت جلسة المتابعة" : "The tracking session has expired"}
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300/90">
              {isRtl
                ? "لأمانك، أعد التحقق برمز جديد لمتابعة الحالة."
                : "For your safety, verify again with a new code to keep tracking."}
            </p>
            <button
              type="button"
              onClick={() => restart(true)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-white"
            >
              {isRtl ? "إعادة التحقق" : "Verify again"}
              <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
            </button>
          </div>
        )}

        {caseResult?.found && currentCase && currentStatus && !sessionExpired && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-6 max-w-2xl overflow-hidden rounded-2xl border border-border bg-background"
          >
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {currentCase.examType ||
                        currentCase.modality ||
                        (isRtl ? "فحص تشخيصي" : "Diagnostic study")}
                    </p>
                    {currentCase.studyDate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(currentCase.studyDate)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span
                    aria-live="polite"
                    className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${finalized ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}
                  >
                    {finalized ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    {statusLabels[currentStatus.code]?.[isRtl ? "ar" : "en"] || currentStatus.label}
                  </span>
                  {!finalized && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => void runStatusRefresh()}
                        disabled={isRefreshing}
                        className="inline-flex items-center gap-1 font-bold text-primary disabled:opacity-60"
                      >
                        <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                        {isRtl ? "تحديث" : "Refresh"}
                      </button>
                      {lastRefreshedAt && (
                        <span>
                          · {isRtl ? "تحديث تلقائي كل 30 ثانية" : "auto-refreshes every 30s"}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div
                className="mt-5 h-2 overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-valuetext={
                  statusLabels[currentStatus.code]?.[isRtl ? "ar" : "en"] || currentStatus.label
                }
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <ol
                className="mt-5 grid grid-cols-5 gap-1"
                aria-label={isRtl ? "مراحل الفحص" : "Exam stages"}
              >
                {(currentCase.workflow || []).map((step) => (
                  <li key={step.code} className="min-w-0 text-center">
                    <span
                      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border ${step.state === "completed" ? "border-primary bg-primary text-white" : step.state === "current" ? "border-primary text-primary ring-4 ring-primary/10" : "border-border text-muted-foreground"}`}
                    >
                      {step.state === "completed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span className="mt-1.5 block truncate text-xs text-muted-foreground">
                      {workflowLabels[step.code]?.[isRtl ? "ar" : "en"] || step.code}
                    </span>
                  </li>
                ))}
              </ol>
              {!finalized && caseResult.estimate && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary/15 bg-surface p-4">
                  <CalendarClock className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      {isRtl ? "الوقت التقديري لإكمال التقرير" : "Estimated report completion"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(caseResult.estimate.estimatedCompletionAt)}
                      {remainingLabel ? ` · ${remainingLabel}` : ""}
                    </p>
                  </div>
                </div>
              )}
              {finalized && (
                <div className="mt-5 border-t border-border pt-5">
                  <p className="text-sm font-bold text-foreground">
                    {isRtl ? "التقرير النهائي معتمد وجاهز" : "The signed final report is ready"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isRtl
                      ? "الرابط قصير العمر وغير قابل للمشاركة. أعد التحقق عند انتهاء الجلسة."
                      : "Access is short-lived and not shareable. Verify again after it expires."}
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => openPublicReport("preview")}
                      disabled={Boolean(reportAction)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white"
                    >
                      {reportAction === "preview" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {isRtl ? "معاينة" : "Preview"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openPublicReport("download")}
                      disabled={Boolean(reportAction)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-bold text-foreground"
                    >
                      {reportAction === "download" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 text-primary" />
                      )}
                      {isRtl ? "تنزيل PDF" : "Download PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openPublicReport("print")}
                      disabled={Boolean(reportAction)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-bold text-foreground"
                    >
                      {reportAction === "print" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4 text-primary" />
                      )}
                      {isRtl ? "طباعة" : "Print"}
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => restart(true)}
                className="mt-5 text-xs font-bold text-primary"
              >
                {isRtl ? "التحقق من حالة أخرى" : "Check another case"}
              </button>
            </div>
          </motion.div>
        )}
        <div className="mx-auto mt-6 flex max-w-2xl items-center justify-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
          <LockKeyhole className="h-4 w-4 text-primary" />
          {isRtl
            ? "لن تظهر أي بيانات قبل إثبات الوصول إلى وسيلة التواصل المسجلة."
            : "No case data is shown until access to the registered contact is proven."}
        </div>
      </div>
    </div>
  );
};

export default CaseLookupWidget;
