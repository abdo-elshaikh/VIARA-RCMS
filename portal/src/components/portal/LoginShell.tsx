import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Languages,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useCenterSettings } from "@/hooks/use-center-settings";

export function LoginShell({
  children,
  eyebrow,
  title,
  subtitle,
  backTo,
  backLabel,
  role,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  backTo: string;
  backLabel: string;
  role: "patient" | "doctor";
}) {
  const { lang, toggle: toggleLang, t } = useLang();
  const { theme, toggle: toggleTheme } = useTheme();
  const { centerName, logoUrl, phone, hours } = useCenterSettings();

  return (
    <div className="grid min-h-screen overflow-hidden bg-background lg:grid-cols-[0.88fr_1.12fr]">
      <aside className="relative hidden min-h-screen overflow-hidden border-r border-white/10 p-10 text-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url("/images/radiology_clinic_bg_1784928355651.png")' }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-slate-950/45" aria-hidden />
        <div className="absolute inset-0 gradient-hero opacity-90 mix-blend-multiply" aria-hidden />
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden />

        <div className="relative flex items-center justify-between gap-3">
          <Link
            to="/"
            className="portal-button inline-flex items-center gap-2 border-white/25 bg-white/95 px-3 py-2 text-sm font-semibold text-foreground"
          >
            <ArrowLeft className="h-4 w-4 rotate-on-rtl" />
            {t("login.backToRCMS", "Back to RCMS")}
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/95 px-3 py-1 text-xs font-semibold shadow-soft hover:bg-primary-soft"
            >
              <Languages className="h-3.5 w-3.5" />
              {lang === "en" ? "AR" : "EN"}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-white/95 text-xs shadow-soft hover:bg-primary-soft"
              aria-label={t("ui.theme", "Theme")}
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        <div className="relative max-w-xl">
          <div className="mb-10 flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={centerName}
                className="h-12 w-12 rounded-2xl border border-white/25 object-cover shadow-soft"
              />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/95 text-primary shadow-soft">
                <ShieldCheck className="h-6 w-6" />
              </span>
            )}
            <div>
              <p className="text-lg font-semibold text-white">{centerName}</p>
              {(phone || hours) && (
                <p className="mt-0.5 text-xs font-medium text-white/75">
                  {[phone, hours].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">
            <LockKeyhole className="h-3.5 w-3.5" />
            {t("login.encrypted", "End-to-end encrypted")}
          </span>
          <h2 className="mt-6 max-w-lg text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.03em] text-white xl:text-6xl">
            {t("login.heroTitle", "A clearer way to reach your radiology records.")}
          </h2>
          <p className="mt-5 max-w-lg text-sm font-medium leading-relaxed text-white/78">
            {t(
              "login.heroSub",
              "Only finalized, specialist-signed reports are released to your portal. Visits, documents, and receipts stay in one secure workspace.",
            )}
          </p>
          <div className="mt-8 grid gap-3">
            {[
              [FileCheck2, t("portal.reports", "Specialist-signed reports")],
              [Clock3, t("portal.appointments", "Appointments and visit preparation")],
              [CheckCircle2, t("portal.messages", "One secure record of communication")],
            ].map(([Icon, label]) => (
              <div
                key={String(label)}
                className="flex items-center gap-3 text-sm font-semibold text-white/90"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/12">
                  <Icon className="h-4 w-4" />
                </span>
                <span>{label as string}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs font-semibold text-white/80">
          © {new Date().getFullYear()} {centerName}
        </div>
      </aside>

      <main className="relative flex min-h-screen flex-col justify-center px-4 py-6 sm:px-8 sm:py-10 lg:px-14 xl:px-20">
        <div className="absolute inset-0 gradient-mesh opacity-75" aria-hidden />
        <div className="absolute inset-0 grid-pattern opacity-35" aria-hidden />
        <div className="relative mx-auto w-full max-w-lg rounded-2xl border border-border/90 bg-surface/96 p-5 shadow-elevated backdrop-blur-xl sm:p-8 lg:p-10 ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={centerName}
                className="h-11 w-11 rounded-xl border border-border object-cover shadow-soft"
              />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                <ShieldCheck className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{centerName}</p>
              {(phone || hours) && (
                <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
                  {[phone, hours].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Link
              to={backTo}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5 rotate-on-rtl" />
              {backLabel}
            </Link>
            <div className="flex items-center gap-1 sm:hidden">
              <button
                type="button"
                onClick={toggleLang}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold shadow-soft"
              >
                {lang === "en" ? "AR" : "EN"}
              </button>
            </div>
          </div>
          <span className="eyebrow mt-6">{eyebrow}</span>
          <h1 className="mt-5 text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm font-medium leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
          {children}
          <p className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
            {role === "patient"
              ? t("login.notPatient", "Referring clinician?")
              : t("login.patientAccess", "Looking for your patient records?")}{" "}
            <Link
              to={role === "patient" ? "/doctor/login" : "/patient/login"}
              className="font-semibold text-primary hover:underline"
            >
              {role === "patient"
                ? t("login.doctorLink", "Open doctor sign in")
                : t("login.patientLink", "Open patient sign in")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <div className="relative mt-2">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80 rtl:left-auto rtl:right-3.5" />
        {children}
      </div>
    </label>
  );
}
