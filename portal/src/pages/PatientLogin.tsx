import { useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { usePatientLoginMutation, useGetPublicCenterSettingsQuery } from "../store/api";
import { setCredentials } from "../store/authSlice";
import { getErrorMessage } from "../utils/getErrorMessage";
import { useLoginThrottle } from "../hooks/use-login-throttle";
import { PortalAuthShell } from "../components/portal/layout/PortalAuthShell";
import { resolvePortalIdentity } from "../lib/portal-identity";

interface PatientLoginFields {
  mrn: string;
  password: string;
}

const PatientLogin = () => {
  const [searchParams] = useSearchParams();
  const initialMrn = searchParams.get("mrn") || "";
  const openRecordsAfterLogin = searchParams.get("records") === "1";
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<PatientLoginFields>({
    defaultValues: { mrn: initialMrn, password: "" },
  });
  const [login, { isLoading }] = usePatientLoginMutation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const throttle = useLoginThrottle("patient");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(["auth", "common", "landing"]);
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const isRtl = language === "ar";
  const { data: publicSettings } = useGetPublicCenterSettingsQuery(undefined);
  const identity = resolvePortalIdentity({ settings: publicSettings || {}, language });
  const centerName = [identity.center.name, identity.branch.name].filter(Boolean).join(" · ");
  const hotline = identity.contacts.hotline || identity.contacts.phone;
  const benefits = t("patient.benefits", { returnObjects: true });
  const displayBenefits = Array.isArray(benefits)
    ? benefits
    : [
        isRtl ? "عرض التقارير الطبية والصور بدقة عالية" : "View medical records securely",
        isRtl ? "حجز وإدارة المواعيد أونلاين" : "Book and manage appointments",
        isRtl ? "التواصل المباشر مع فريق المركز" : "Message the center directly",
      ];

  useEffect(() => {
    if (initialMrn) setValue("mrn", initialMrn, { shouldDirty: false });
  }, [initialMrn, setValue]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${t("patient.signIn", "Patient sign in")} | ${centerName}`;
    return () => {
      document.title = previousTitle;
    };
  }, [centerName, t]);

  const onSubmit: SubmitHandler<PatientLoginFields> = async (data) => {
    setErrorMsg(null);
    try {
      const result = await login({ mrn: data.mrn.trim(), password: data.password }).unwrap();
      throttle.registerSuccess();
      dispatch(setCredentials({ ...result }));
      navigate(openRecordsAfterLogin ? "/patient/dashboard?tab=records" : "/patient/dashboard");
    } catch (error) {
      throttle.registerFailure();
      // Show a generic message for auth rejections so the endpoint cannot be
      // used to enumerate which MRNs exist; technical errors (network, 5xx)
      // keep their descriptive message.
      const status = (error as any)?.status;
      const generic = t("patient.error");
      setErrorMsg(
        status === 400 || status === 401 || status === 403
          ? generic
          : getErrorMessage(error, generic),
      );
    }
  };

  const inputClass =
    "h-12 w-full rounded-xl border border-[#DCE8E5] bg-[#F8FBFA] text-sm font-medium text-[#0B2348] outline-none transition duration-200 placeholder:text-[#8A9AAD] hover:border-primary/45 hover:bg-white focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500 dark:hover:bg-white/[0.06] dark:focus:bg-white/[0.06]";

  return (
    <PortalAuthShell
      role="patient"
      language={language}
      centerName={centerName}
      centerLogo={identity.center.logoUrl}
      centerInitials={identity.center.initials}
      title={t("patient.signIn", "Welcome back")}
      subtitle={t(
        "patient.formHint",
        "Use the medical record number provided by the center to securely access your care.",
      )}
      benefits={displayBenefits as string[]}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {!throttle.locked && errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold leading-5 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {throttle.locked && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs font-semibold leading-5 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t("errors.tooManyAttempts", {
                count: Math.ceil(throttle.lockRemainingMs / 1000),
                defaultValue: "Too many failed attempts. Try again in {{count}} seconds.",
              })}
            </span>
          </div>
        )}

        <div>
          <label
            htmlFor="patient-mrn"
            className="block text-xs font-bold text-[#0B2348] dark:text-white"
          >
            {t("patient.mrn", "Medical record number")}
          </label>
          <div className="relative mt-2">
            <FileText className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-primary" />
            <input
              id="patient-mrn"
              {...register("mrn", {
                required: t("errors.mrnRequired", "Medical record number is required."),
              })}
              type="text"
              placeholder={t("patient.mrnPlaceholder", "e.g. PAT-12345")}
              className={`${inputClass} px-10 text-left`}
              dir="ltr"
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck="false"
              aria-invalid={Boolean(errors.mrn)}
              aria-describedby={errors.mrn ? "patient-mrn-error" : undefined}
            />
          </div>
          {errors.mrn && (
            <p
              id="patient-mrn-error"
              className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
            >
              {errors.mrn.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="patient-password"
            className="block text-xs font-bold text-[#0B2348] dark:text-white"
          >
            {t("patient.password", "Password")}
          </label>
          <div className="relative mt-2">
            <LockKeyhole className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-primary" />
            <input
              id="patient-password"
              {...register("password", {
                required: t("errors.passwordRequired", "Password is required."),
              })}
              type={showPassword ? "text" : "password"}
              placeholder={t("patient.passwordPlaceholder", "Enter your password")}
              className={`${inputClass} ps-10 pe-12 text-left`}
              dir="ltr"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "patient-password-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 end-2 my-auto flex h-8 w-8 items-center justify-center rounded-md text-[#7A8CA0] transition hover:bg-[#EAF5F1] hover:text-primary dark:hover:bg-white/[0.07]"
              aria-label={
                showPassword
                  ? t("login.hidePassword", "Hide password")
                  : t("login.showPassword", "Show password")
              }
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p
              id="patient-password-error"
              className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
            >
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || throttle.locked}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(8,120,95,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-[0_14px_28px_rgba(8,120,95,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("patient.verifying", "Verifying securely…")}
            </>
          ) : (
            <>
              <span>{t("patient.submit", "Continue to portal")}</span>
              {isRtl ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </>
          )}
        </button>

        {hotline && (
          <p className="text-center text-[11px] font-medium leading-5 text-muted-foreground">
            {isRtl ? "تواجه مشكلة في تسجيل الدخول؟" : "Need help signing in?"}{" "}
            <a href={`tel:${hotline}`} className="font-bold text-primary hover:underline" dir="ltr">
              {hotline}
            </a>
          </p>
        )}
      </form>
    </PortalAuthShell>
  );
};

export default PatientLogin;
