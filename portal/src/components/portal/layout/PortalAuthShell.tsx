import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import LanguageToggle from "../../ui/LanguageToggle";
import ThemeToggle from "../../ui/ThemeToggle";
import { PortalLayout } from "./PortalLayout";

interface PortalAuthShellProps {
  role: "patient" | "doctor";
  language?: "en" | "ar" | string;
  centerName: string;
  centerLogo?: string | null;
  centerInitials?: string;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  benefits?: string[];
  children: React.ReactNode;
}

const roleCopy = {
  en: {
    patient: {
      badge: "Patient portal",
      visualTitle: "Your reports and diagnostic images, ready when you need them.",
      visualBody:
        "Access finalized reports, review your imaging history, and keep every part of your diagnostic journey in one secure place.",
      switchLead: "Are you a referring physician?",
      switchLabel: "Open the doctor portal",
    },
    doctor: {
      badge: "Referring doctor portal",
      visualTitle: "A clearer clinical view of every referred case.",
      visualBody:
        "Follow case progress, open finalized reports and DICOM studies, and stay connected with the radiology team.",
      switchLead: "Looking for your personal scan results?",
      switchLabel: "Open the patient portal",
    },
    secure: "Secure medical access",
    home: "Back to home",
    session: "Protected medical session",
    sessionBody: "Your credentials and clinical records are encrypted throughout this session.",
    trust: ["Verified identity", "Signed reports", "Encrypted records"],
  },
  ar: {
    patient: {
      badge: "بوابة المرضى",
      visualTitle: "تقاريرك وصور فحوصاتك متاحة عندما تحتاج إليها.",
      visualBody:
        "اطّلع على التقارير النهائية وسجل فحوصاتك، وتابع رحلتك التشخيصية كاملة من مكان واحد وآمن.",
      switchLead: "هل أنت طبيب محول؟",
      switchLabel: "الدخول إلى بوابة الأطباء",
    },
    doctor: {
      badge: "بوابة الأطباء المحولين",
      visualTitle: "رؤية سريرية أوضح لكل حالة محولة.",
      visualBody:
        "تابع تقدم الحالات، وراجع التقارير النهائية وصور DICOM، وتواصل مع فريق الأشعة بسهولة.",
      switchLead: "تبحث عن نتائج فحوصاتك الشخصية؟",
      switchLabel: "الدخول إلى بوابة المرضى",
    },
    secure: "وصول طبي آمن",
    home: "العودة للرئيسية",
    session: "جلسة طبية محمية",
    sessionBody: "يتم تشفير بيانات الدخول والسجلات الطبية طوال هذه الجلسة.",
    trust: ["هوية موثقة", "تقارير معتمدة", "بيانات مشفرة"],
  },
};

export const PortalAuthShell = ({
  role,
  language = "en",
  centerName,
  centerLogo,
  centerInitials,
  title,
  subtitle,
  benefits = [],
  children,
}: PortalAuthShellProps) => {
  const copy = (roleCopy as Record<string, typeof roleCopy.en>)[language] || roleCopy.en;
  const roleText = copy[role];
  const isRtl = language === "ar";
  const switchTo = role === "patient" ? "/doctor/login" : "/patient/login";
  const RoleIcon = role === "patient" ? FileCheck2 : Stethoscope;
  const reduceMotion = useReducedMotion();

  return (
    <PortalLayout
      showFooter={false}
      showHeader={false}
      showContactActions={false}
      portalType={role}
    >
      <div className="portal-theme relative isolate min-h-screen w-full max-w-full overflow-x-hidden bg-[#F4FAF8] text-[#0B2348] antialiased dark:bg-[#071224] dark:text-white">
        <div className="absolute inset-0 -z-20">
          <img
            src="/images/viara-hero-mri-room.jpg"
            alt=""
            className="h-full w-full object-cover object-center"
            fetchPriority="high"
            decoding="async"
          />
          <div className="absolute inset-0 bg-white/78 dark:bg-[#071224]/86" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#F4FAF8]/25 via-[#F4FAF8]/68 to-[#F4FAF8] dark:from-[#071224]/35 dark:via-[#071224]/80 dark:to-[#071224]" />
        </div>

        <header className="absolute inset-x-0 top-0 z-30 px-3 py-3 sm:px-6 sm:py-4">
          <div className="mx-auto grid min-h-16 w-full min-w-0 max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-white/70 bg-white/82 px-2.5 shadow-[0_14px_38px_rgba(11,35,72,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0A1728]/82 sm:gap-3 sm:px-4">
            <Link
              to="/"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#DCE8E5] bg-white px-3 text-xs font-bold text-[#0B2348] transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              aria-label={copy.home}
            >
              {isRtl ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              <span className="hidden md:inline">{copy.home}</span>
            </Link>

            <Link
              to="/"
              className="flex min-w-0 items-center justify-self-center gap-2.5"
              aria-label={centerName}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/15 bg-white shadow-sm">
                {centerLogo ? (
                  <img src={centerLogo} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <span className="text-[10px] font-black text-primary">
                    {centerInitials || "RC"}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <strong className="block max-w-[112px] truncate text-[11px] font-extrabold text-[#0B2348] dark:text-white sm:max-w-52 sm:text-sm">
                  {centerName}
                </strong>
                <span className="mt-0.5 hidden text-[9px] font-bold text-primary sm:block">
                  {roleText.badge}
                </span>
              </span>
            </Link>

            <div className="flex items-center justify-end gap-2">
              <ThemeToggle className="h-10 w-10 rounded-lg" />
              <LanguageToggle variant="compact" className="rounded-lg" />
            </div>
          </div>
        </header>

        <div className="mx-auto grid min-h-screen w-full min-w-0 max-w-7xl items-center gap-10 px-4 pb-10 pt-28 sm:px-6 sm:pb-14 sm:pt-32 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.82fr)] lg:px-8 lg:pt-28">
          <motion.aside
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="hidden max-w-2xl lg:block"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/80 px-4 py-2 text-xs font-semibold text-primary shadow-sm backdrop-blur dark:bg-white/[0.06]">
              <LockKeyhole className="h-3.5 w-3.5" />
              {copy.secure}
            </span>

            <h2 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.18] text-[#0B2348] dark:text-white xl:text-5xl">
              {roleText.visualTitle}
            </h2>
            <p className="mt-5 max-w-xl text-base font-medium leading-8 text-[#5F7187] dark:text-slate-300">
              {roleText.visualBody}
            </p>

            {benefits.length > 0 && (
              <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                {benefits.slice(0, 3).map((benefit, index) => (
                  <div
                    key={benefit}
                    className="flex min-w-0 items-start gap-2.5 border-s-2 border-primary/25 ps-3"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#E6F5F0] text-primary dark:bg-primary/15">
                      {index === 0 ? (
                        <RoleIcon className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="text-xs font-semibold leading-6 text-[#38516B] dark:text-slate-300">
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-9 flex items-center gap-3 text-sm text-[#5F7187] dark:text-slate-300">
              <span>{roleText.switchLead}</span>
              <Link
                to={switchTo}
                className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline"
              >
                {roleText.switchLabel}
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            </div>
          </motion.aside>

          <motion.section
            aria-labelledby={`auth-title-${role}`}
            initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: reduceMotion ? 0 : 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: "min(31rem, calc(100vw - 2rem))" }}
            className="mx-auto min-w-0 max-w-full overflow-hidden rounded-lg border border-[#DCE8E5] bg-white/94 shadow-[0_22px_60px_rgba(11,35,72,0.13)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0A1728]/94"
          >
            <div className="min-w-0 border-b border-[#E2ECE9] bg-[#F2F8F6] px-6 py-6 dark:border-white/10 dark:bg-white/[0.035] sm:px-8 sm:py-7">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-primary">
                <RoleIcon className="h-4 w-4" />
                {roleText.badge}
              </span>
              <h1
                id={`auth-title-${role}`}
                className="mt-2 text-2xl font-extrabold leading-tight text-[#0B2348] dark:text-white sm:text-3xl"
              >
                {title}
              </h1>
              <p className="mt-2 break-words text-sm leading-6 text-[#687B91] dark:text-slate-300">
                {subtitle}
              </p>

              {benefits.length > 0 && (
                <div className="mt-4 hidden min-w-0 flex-wrap gap-x-4 gap-y-2 sm:flex lg:hidden">
                  {benefits.slice(0, 2).map((benefit) => (
                    <span
                      key={benefit}
                      className="inline-flex min-w-0 items-start gap-1.5 break-words text-[11px] font-semibold leading-5 text-[#38516B] dark:text-slate-300"
                    >
                      <Check className="h-3.5 w-3.5 text-primary" />
                      {benefit}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0 overflow-hidden px-6 py-6 sm:px-8 sm:py-7">{children}</div>

            <div className="grid min-w-0 gap-4 border-t border-[#E2ECE9] bg-[#FAFCFB] px-6 py-5 dark:border-white/10 dark:bg-white/[0.025] sm:px-8">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-bold text-[#0B2348] dark:text-white">{copy.session}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                    {copy.sessionBody}
                  </p>
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground lg:hidden">
                {roleText.switchLead}{" "}
                <Link to={switchTo} className="font-bold text-primary hover:underline">
                  {roleText.switchLabel}
                </Link>
              </p>
            </div>
          </motion.section>
        </div>

        <div className="absolute inset-x-0 bottom-3 hidden text-center text-[10px] font-medium text-[#6A7E91] lg:block dark:text-slate-400">
          © {new Date().getFullYear()} {centerName}
        </div>
      </div>
    </PortalLayout>
  );
};
