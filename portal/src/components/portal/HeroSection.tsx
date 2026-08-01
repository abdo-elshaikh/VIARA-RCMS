import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bone,
  CalendarCheck,
  Clock,
  FileText,
  HeartPulse,
  Lock,
  Radio,
  ScanLine,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Waves,
  Star,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { getCenterName, type PublicCenterSettings } from "@/hooks/use-center-settings";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const MODALITIES = [
  {
    id: "mri",
    icon: ScanLine,
    labelKey: "svc.mri",
    fallback: "MRI",
    image: "/images/mri_brain_scan_1784928343350.png",
  },
  {
    id: "ct",
    icon: Radio,
    labelKey: "svc.ct",
    fallback: "CT",
    image: "/images/ct_axial_scan_1784930854716.png",
  },
  {
    id: "xray",
    icon: Bone,
    labelKey: "svc.xray",
    fallback: "X-Ray",
    image: "/images/xray_chest_scan_1784930867793.png",
  },
  {
    id: "ultrasound",
    icon: Waves,
    labelKey: "svc.us",
    fallback: "Ultrasound",
    image: "/images/ultrasound_scan_1784930877073.png",
  },
] as const;

const ACCESS_CARDS = [
  { icon: UserRound, labelKey: "cta.openPortal", fallback: "Patient portal", to: "/patient/login" },
  { icon: Stethoscope, labelKey: "cta.openDoctor", fallback: "Doctor portal", to: "/doctor/login" },
  { icon: CalendarCheck, labelKey: "cta.book", fallback: "Book imaging", to: "#book" },
] as const;

const TRUST_ITEMS: readonly { Icon: any; label: string; highlight?: boolean }[] = [
  { Icon: ShieldCheck, label: "Board-certified radiologists", highlight: true },
  { Icon: Lock, label: "HIPAA-compliant security", highlight: false },
  { Icon: Clock, label: "Reports within 24 hours", highlight: false },
  { Icon: Star, label: "4.9/5 patient rating", highlight: false },
  { Icon: CheckCircle2, label: "100% subspecialist review", highlight: false },
  { Icon: Zap, label: "Same-day appointments", highlight: false },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function TrustBadges() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
      {TRUST_ITEMS.map(({ Icon, label, highlight }) => (
        <div
          key={label}
          className={`flex items-center gap-2.5 rounded-xl border p-3 text-xs font-semibold backdrop-blur-sm transition-all duration-200 hover:shadow-md ${highlight
              ? "border-accent/40 bg-accent/5 text-accent hover:border-accent/60 hover:bg-accent/10"
              : "border-border/40 bg-surface/40 text-muted-foreground hover:border-accent/20 hover:bg-surface hover:text-foreground"
            }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${highlight ? "bg-accent/15 text-accent" : "bg-accent/10 text-accent"}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate leading-tight">{label}</span>
        </div>
      ))}
    </div>
  );
}

function HeroQuickLookup({ lang }: { lang: string }) {
  const [quickMrn, setQuickMrn] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const isRtl = lang === "ar";

  return (
      <div className="mt-8 rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0E7C7B] dark:text-[#3FD6C7]">
          <FileText className="h-4 w-4 text-[#FF6B57]" />
          {isRtl ? "استعلام سريع عن نتائج الفحوصات" : "Online Scan Results Lookup"}
        </span>
        <span className="rounded-full bg-[#0E7C7B]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0E7C7B] dark:bg-[#3FD6C7]/20 dark:text-[#3FD6C7]">
          {isRtl ? "تسليم فوري 24/7" : "Instant 24/7 Access"}
        </span>
      </div>
      <form
        onSubmit={(e: any) => {
          e.preventDefault();
          if (quickMrn.trim()) {
            window.location.href = `/patient/login?mrn=${encodeURIComponent(quickMrn.trim())}`;
          }
        }}
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input
          type="text"
          value={quickMrn}
          onChange={(e: any) => setQuickMrn(e.target.value)}
          placeholder={isRtl ? "رقم الملف الطبي MRN" : "Medical Record No. (MRN)"}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#0E7C7B] focus:bg-white focus:ring-2 focus:ring-[#0E7C7B]/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
        />
        <input
          type="password"
          value={quickPhone}
          onChange={(e: any) => setQuickPhone(e.target.value)}
          placeholder={isRtl ? "كلمة المرور / الموبايل" : "Password / Phone"}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#0E7C7B] focus:bg-white focus:ring-2 focus:ring-[#0E7C7B]/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
        />
        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0E7C7B] to-[#0B5E5D] px-5 py-3 text-xs font-bold text-white shadow-md shadow-[#0E7C7B]/20 transition hover:bg-[#0B5E5D]"
        >
          <span>{isRtl ? "استعلام" : "Find Result"}</span>
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
        </button>
      </form>
    </div>
  );
}

function HeroCtas({ lang, t }: { lang: string; t: (key: string, fallback: string) => string }) {
  return (
    <div className="mt-8 flex flex-col gap-3.5 sm:flex-row sm:flex-wrap">
      <a
        href="#book"
        className="group relative inline-flex min-h-14 items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0E7C7B] to-[#0B5E5D] px-8 text-sm font-bold text-white shadow-lg shadow-[#0E7C7B]/25 transition-all hover:bg-[#0B5E5D] hover:shadow-xl hover:-translate-y-0.5"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
        <CalendarCheck className="relative z-10 h-5 w-5" aria-hidden="true" />
        <span className="relative z-10">{t("cta.book", "Book appointment")}</span>
        <span className="relative z-10 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          {lang === "ar" ? "متاح" : "Same-week"}
        </span>
        <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100" aria-hidden="true" />
      </a>
      <Link
        to="/patient/login"
        className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white/80 px-8 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#0E7C7B] hover:bg-white dark:border-white/10 dark:bg-slate-900/60 dark:text-white dark:hover:border-[#3FD6C7]"
      >
        {t("cta.openPortal", "Open patient portal")}
        <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
      </Link>
    </div>
  );
}

function ModalitySelector({
  activeId,
  onSelect,
  lang,
  t,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  lang: string;
  t: (key: string, fallback: string) => string;
}) {
  const activeIndex = MODALITIES.findIndex((item) => item.id === activeId);
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const active = MODALITIES[currentIndex];

  const handlePrev = () => {
    const nextIdx = (currentIndex - 1 + MODALITIES.length) % MODALITIES.length;
    onSelect(MODALITIES[nextIdx].id);
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % MODALITIES.length;
    onSelect(MODALITIES[nextIdx].id);
  };

  return (
    <div className="relative rounded-3xl border border-slate-200/80 bg-slate-900 shadow-2xl overflow-hidden dark:border-white/10">
      <div className="absolute top-0 right-0 w-48 h-48 bg-[#0E7C7B]/20 rounded-full blur-3xl" aria-hidden />
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#3FD6C7]/10 rounded-full blur-2xl" aria-hidden />

      {/* Header */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-t-2xl bg-[#061B2E] px-5 py-4 text-white">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#3FD6C7]">
            {active.labelKey && t(active.labelKey, active.fallback)}
          </p>
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl text-white">
            {lang === "ar" ? "أحدث الأجهزة والتجهيزات الطبية" : "Clinical Facility & Equipment"}
          </h2>
        </div>
        <span className="relative inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5 text-[11px] font-bold text-[#3FD6C7] backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B57] animate-pulse" />
          {t(active.labelKey, active.fallback)}
        </span>
      </div>

      {/* Image + Modality buttons */}
      <div className="grid min-w-0 gap-3 p-2 sm:p-3 md:grid-cols-[1fr_10.5rem]">
        <div className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-2xl bg-slate-950">
          <img
            src={active.image}
            alt=""
            className="h-full w-full object-cover transition-all duration-700 opacity-90 group-hover:scale-[1.03]"
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#04111D] via-transparent to-transparent" aria-hidden />

          {/* Side Arrow Navigation */}
          <button
            type="button"
            onClick={handlePrev}
            className="absolute start-3 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/60 text-white backdrop-blur border border-white/10 transition hover:bg-[#0E7C7B]"
            aria-label="Previous modality"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="absolute end-3 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/60 text-white backdrop-blur border border-white/10 transition hover:bg-[#0E7C7B]"
            aria-label="Next modality"
          >
            ›
          </button>

          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="rounded-xl bg-slate-950/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md border border-white/10">
              {t(active.labelKey, active.fallback)}
            </span>
          </div>

          <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-xl bg-slate-900/90 px-4 py-2.5 text-xs font-bold text-white shadow-lg backdrop-blur-md border border-white/10">
            <active.icon className="h-4 w-4 text-[#3FD6C7]" />
            {lang === "ar" ? "جاهز للمراجعة" : "Ready for review"}
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          {MODALITIES.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-xs font-bold transition-all duration-200 hover:-translate-y-px rtl:text-right ${isActive
                    ? "border-[#0E7C7B] bg-[#0E7C7B] text-white shadow-md shadow-[#0E7C7B]/20"
                    : "border-white/10 bg-slate-800/80 text-slate-300 hover:border-[#0E7C7B]/40 hover:bg-slate-800"
                  }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(item.labelKey, item.fallback)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AccessCards({ lang, t }: { lang: string; t: (key: string, fallback: string) => string }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {ACCESS_CARDS.map((card) => {
        const Icon = card.icon;
        const className =
          "group flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-2xl border-2 border-border bg-surface p-3.5 text-sm font-bold shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:bg-accent-soft/30 hover:shadow-lg";
        const content = (
          <>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-sm transition-transform duration-200 group-hover:scale-110">
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate">{t(card.labelKey, card.fallback)}</span>
          </>
        );

        return card.to.startsWith("#") ? (
          <a key={card.labelKey} href={card.to} className={className}>
            {content}
          </a>
        ) : (
          <Link
            key={card.labelKey}
            to={card.to as "/doctor/login" | "/patient/login"}
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile Floating CTA Bar                                            */
/* ------------------------------------------------------------------ */

export function MobileFloatingCta({ isRtl }: { isRtl: boolean }) {
  const bookLabel = isRtl ? "حجز فحص" : "Book Scan";
  const portalLabel = isRtl ? "بوابة المريض" : "Patient Portal";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0E7C7B]/20 bg-white/98 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl backdrop-blur-xl lg:hidden">
      <div className="flex gap-3">
        <a
          href="#book"
          className="flex-1 rounded-xl bg-gradient-to-r from-[#0E7C7B] to-[#0B5E5D] px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
        >
          <span className="flex items-center justify-center gap-2">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            {bookLabel}
          </span>
        </a>
        <Link
          to="/patient/login"
          className="flex-1 rounded-xl border border-[#0E7C7B]/20 bg-[#0E2A47] px-5 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:border-[#0E7C7B]/40 hover:bg-[#0E7C7B]/10 dark:border-[#0E7C7B]/30 dark:bg-slate-800"
        >
          <span className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#3FD6C7]" aria-hidden="true" />
            {portalLabel}
          </span>
        </Link>
      </div>
    </div>
  );
}

export function HeroSection({ centerSettings }: { centerSettings?: PublicCenterSettings | null }) {
  const { t, lang } = useLang();
  const [activeId, setActiveId] = useState<string>("mri");
  const centerName = getCenterName(centerSettings);

  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-canvas">
      <div className="absolute inset-0 gradient-hero" aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops)] from-transparent via-[#0E7C7B]/20 to-[#3FD6C7]/30)" aria-hidden />

      <div className="relative mx-auto grid min-w-0 max-w-7xl gap-12 xl:gap-20 px-4 pt-16 pb-12 sm:px-6 sm:pt-20 sm:pb-16 xl:px-8 xl:pt-24 xl:pb-20">
        {/* Left column */}
        <div className="min-w-0 fade-in-up">
          <span className="eyebrow text-[#0E7C7B] dark:text-[#3FD6C7]">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-[#0E7C7B] opacity-75 animate-ping" />
              <span className="relative rounded-full bg-[#0E7C7B] h-2 w-2" />
            </span>
            {t("hero.eyebrow", "Diagnostic imaging portal")}
          </span>

          <h1 className="mt-8 max-w-3xl text-balance text-[clamp(2.75rem,12vw,5rem)] font-extrabold leading-[0.92] tracking-[-0.035em] text-foreground">
            {t("hero.title.a", "Your scans.")}{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-[#0E7C7B]">{t("hero.title.b", "Your results.")}</span>
              <span className="absolute bottom-1 left-0 right-0 h-3 bg-[#0E7C7B]/15 -skew-x-3" aria-hidden="true" />
            </span>
            <br className="hidden sm:block" />
            {t("hero.title.c", "Your control.")}
          </h1>

          <p className="mt-8 max-w-xl border-s-2 border-[#0E7C7B]/50 ps-5 text-base font-semibold leading-relaxed text-muted-foreground sm:text-lg">
            {t(
              "hero.subtitle",
              "3T MRI, 128-slice CT, and digital X-ray with consultant-signed reports. Access your DICOM images and results anytime, anywhere.",
            )}
          </p>

          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#475467]/80">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{lang === "ar" ? "متاح للحجز الآن" : "Available for same-week appointments"}</span>
          </div>

          <HeroQuickLookup lang={lang} />
          <HeroCtas lang={lang} t={t} />
          <div className="mt-6">
            <TrustBadges />
          </div>
        </div>

        {/* Right column */}
        <div className="relative min-w-0 fade-in-up" style={{ animationDelay: "140ms" }}>
          <div className="group">
            <ModalitySelector activeId={activeId} onSelect={setActiveId} lang={lang} t={t} />
          </div>
          <AccessCards lang={lang} t={t} />
        </div>
      </div>

      {/* Mobile Floating CTA Bar */}
      <MobileFloatingCta isRtl={lang === "ar"} />
    </section>
  );
}
