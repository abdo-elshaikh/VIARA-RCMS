import { useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { useDoctorLoginMutation, useGetPublicCenterSettingsQuery } from "../store/api";
import { setCredentials } from "../store/authSlice";
import { getErrorMessage } from "../utils/getErrorMessage";
import { useLoginThrottle } from "../hooks/use-login-throttle";
import { PortalAuthShell } from "../components/portal/layout/PortalAuthShell";
import { resolvePortalIdentity } from "../lib/portal-identity";

interface DoctorLoginFields {
  email: string;
  password: string;
}

const DoctorLogin = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DoctorLoginFields>({
    defaultValues: { email: "", password: "" },
  });
  const [login, { isLoading }] = useDoctorLoginMutation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const throttle = useLoginThrottle("doctor");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(["auth", "common", "landing"]);
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const isRtl = language === "ar";
  const benefits = t("doctor.benefits", { returnObjects: true });
  const displayBenefits = Array.isArray(benefits)
    ? benefits
    : [
        isRtl ? "متابعة الإحالات وحالات المرضى مباشرة" : "Track referrals and status",
        isRtl ? "استعراض التقارير النهائية المعتمدة" : "Open finalized reports",
        isRtl ? "التواصل المباشر مع استشاريي الأشعة" : "Coordinate with the center",
      ];
  const { data: publicSettings } = useGetPublicCenterSettingsQuery(undefined);
  const identity = resolvePortalIdentity({ settings: publicSettings || {}, language });
  const centerName = [identity.center.name, identity.branch.name].filter(Boolean).join(" · ");
  const hotline = identity.contacts.hotline || identity.contacts.phone;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${t("doctor.signIn", "Doctor sign in")} | ${centerName}`;
    return () => {
      document.title = previousTitle;
    };
  }, [centerName, t]);

  const onSubmit: SubmitHandler<DoctorLoginFields> = async (data) => {
    setErrorMsg(null);
    try {
      const result = await login({ email: data.email.trim(), password: data.password }).unwrap();
      throttle.registerSuccess();
      dispatch(setCredentials({ user: result.user, token: result.token }));
      navigate("/doctor/dashboard");
    } catch (error) {
      throttle.registerFailure();
      const status = (error as any)?.status;
      const generic = t("doctor.error");
      setErrorMsg(
        status === 400 || status === 401 || status === 403
          ? generic
          : getErrorMessage(error, generic),
      );
    }
  };

  const inputClass =
    "h-12 w-full rounded-lg border border-[#DCE8E5] bg-[#F8FBFA] text-sm font-medium text-[#0B2348] outline-none transition placeholder:text-[#8A9AAD] hover:border-primary/35 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-white/[0.06]";

  return (
    <PortalAuthShell
      role="doctor"
      language={language}
      centerName={centerName}
      centerLogo={identity.center.logoUrl}
      centerInitials={identity.center.initials}
      title={t("doctor.signIn", "Welcome back, doctor")}
      subtitle={t(
        "doctor.formHint",
        "Sign in with your verified clinical account to access referred cases and reports.",
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
            htmlFor="doctor-email"
            className="block text-xs font-bold text-[#0B2348] dark:text-white"
          >
            {t("doctor.email", "Email address")}
          </label>
          <div className="relative mt-2">
            <Mail className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-primary" />
            <input
              id="doctor-email"
              {...register("email", {
                required: t("errors.emailRequired", "Email address is required."),
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: t("errors.emailInvalid", "Enter a valid email address."),
                },
              })}
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="doctor@clinic.com"
              className={`${inputClass} px-10 text-left`}
              dir="ltr"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "doctor-email-error" : undefined}
            />
          </div>
          {errors.email && (
            <p
              id="doctor-email-error"
              className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
            >
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="doctor-password"
            className="block text-xs font-bold text-[#0B2348] dark:text-white"
          >
            {t("doctor.password", "Password")}
          </label>
          <div className="relative mt-2">
            <LockKeyhole className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-primary" />
            <input
              id="doctor-password"
              {...register("password", {
                required: t("errors.passwordRequired", "Password is required."),
              })}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder={t("doctor.passwordPlaceholder", "Enter your password")}
              className={`${inputClass} ps-10 pe-12 text-left`}
              dir="ltr"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "doctor-password-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 end-2 my-auto flex h-8 w-8 items-center justify-center rounded-md text-[#7A8CA0] transition hover:bg-[#EAF5F1] hover:text-primary dark:hover:bg-white/[0.07]"
              aria-label={
                showPassword
                  ? t("common.hidePassword", "Hide password")
                  : t("common.showPassword", "Show password")
              }
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p
              id="doctor-password-error"
              className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
            >
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || throttle.locked}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(8,120,95,0.2)] transition hover:-translate-y-0.5 hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("doctor.signingIn", "Verifying securely…")}
            </>
          ) : (
            <>
              <span>{t("doctor.submit", "Continue to workspace")}</span>
              {isRtl ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </>
          )}
        </button>

        {hotline && (
          <p className="text-center text-[11px] font-medium leading-5 text-muted-foreground">
            {isRtl ? "للدعم وتفعيل حساب الطبيب" : "Clinical account support"}{" "}
            <a href={`tel:${hotline}`} className="font-bold text-primary hover:underline" dir="ltr">
              {hotline}
            </a>
          </p>
        )}
      </form>
    </PortalAuthShell>
  );
};

export default DoctorLogin;
