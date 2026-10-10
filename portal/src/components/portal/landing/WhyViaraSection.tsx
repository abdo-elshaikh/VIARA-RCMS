import {
  Cpu,
  FileText,
  MapPin,
  ShieldCheck,
  Activity,
  CheckCircle2,
  Timer,
  Database,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePortalIdentity } from "../../../lib/portal-identity";
import { useLandingContent } from "../../../hooks/use-landing-content";

/**
 * Trust section. The bottom metrics band renders ONLY real, live numbers from
 * the public landing overview (active equipment, today's studies, completion
 * rate, average imaging time). When the overview is unavailable the band is
 * omitted entirely — no invented "3.0T / 128-slice / 24-7" style claims.
 */
interface WhyViaraSectionProps {
  heading?: string;
  subheading?: string;
}

export const WhyViaraSection = ({ heading, subheading }: WhyViaraSectionProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const reduceMotion = useReducedMotion();
  const identity = usePortalIdentity();
  const centerName = identity.center.name || (isRtl ? "مركز الأشعة" : "Radiology Center");
  const { overview, overviewLoaded, branches } = useLandingContent();

  const reasons = [
    {
      icon: ShieldCheck,
      titleAr: "وصول محمي للنتائج",
      titleEn: "Protected result access",
      descAr: "لا تظهر حالة الفحص أو التقرير إلا بعد رمز تحقق قصير العمر.",
      descEn: "Case status and reports appear only after short-lived verification.",
    },
    {
      icon: Cpu,
      titleAr: "خدمات مرتبطة بسجل المركز",
      titleEn: "Center-managed services",
      descAr: "تعرض الصفحة أنواع التصوير المسجلة كنشطة لدى المركز فقط.",
      descEn: "The page lists only imaging types marked active by the center.",
    },
    {
      icon: FileText,
      titleAr: "رحلة رقمية واضحة",
      titleEn: "A clear digital journey",
      descAr: "طلب موعد برقم متابعة وحالة فحص معروضة خطوة بخطوة.",
      descEn: "Trackable appointment requests and step-by-step case status.",
    },
    ...(branches.length > 1
      ? [
          {
            icon: MapPin,
            titleAr: "رعاية أقرب إليك",
            titleEn: "Care closer to you",
            descAr: "أكثر من موقع وخيارات حجز ووصول أكثر سهولة.",
            descEn: "Multiple locations with simpler booking and access.",
          },
        ]
      : []),
  ];

  const facts = overview
    ? [
        ...(overview.activeModalities != null
          ? [
              {
                icon: Database,
                value: String(overview.activeModalities),
                ar: "أجهزة تصوير نشطة",
                en: "active imaging systems",
              },
            ]
          : []),
        ...(overview.studiesToday != null
          ? [
              {
                icon: Activity,
                value: String(overview.studiesToday),
                ar: "دراسات اليوم",
                en: "studies today",
              },
            ]
          : []),
        ...(overview.completionRate != null
          ? [
              {
                icon: CheckCircle2,
                value: `${overview.completionRate}%`,
                ar: "نسبة إنجاز دراسات اليوم",
                en: "today's completion rate",
              },
            ]
          : []),
        ...(overview.imagingMinutes != null
          ? [
              {
                icon: Timer,
                value: `~${overview.imagingMinutes}`,
                ar: "دقيقة متوسط زمن التصوير",
                en: "min average imaging time",
              },
            ]
          : []),
      ]
    : [];

  return (
    <section id="why-viara" className="bg-[#F2F8FB] py-16 dark:bg-[#0A1729] sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14" dir="ltr">
          <motion.div
            whileHover={reduceMotion ? undefined : { scale: 1.005 }}
            transition={{ duration: 0.3 }}
            className="relative min-h-[420px] overflow-hidden rounded-[28px]"
            dir={isRtl ? "rtl" : "ltr"}
          >
            <img
              src="/images/viara-doctor-patient.jpg"
              alt="Radiologist speaking with a patient"
              loading="lazy"
              decoding="async"
              width="1200"
              height="900"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B2348]/72 via-transparent to-transparent" />
            <p className="absolute bottom-6 inset-x-6 max-w-sm text-sm font-semibold leading-7 text-white">
              {isRtl
                ? "الوضوح التشخيصي يبدأ من التقنية، ويكتمل بخبرة الطبيب واهتمام الفريق."
                : "Diagnostic clarity starts with technology and is completed by medical expertise and attentive care."}
            </p>
          </motion.div>

          <div dir={isRtl ? "rtl" : "ltr"}>
            <span className="text-xs font-semibold text-primary">
              {isRtl ? `لماذا ${centerName}؟` : `Why ${centerName}?`}
            </span>
            <h2 className="mt-2 max-w-xl text-3xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-4xl">
              {heading ||
                (isRtl ? (
                  <>
                    دقة تبدأ من التقنية،<span className="block">وتكتمل بخبرة الطبيب.</span>
                  </>
                ) : (
                  <>
                    Technology brings detail.
                    <span className="block">Medical expertise brings meaning.</span>
                  </>
                ))}
            </h2>
            <p className="mt-4 max-w-xl text-sm font-normal leading-7 text-muted-foreground">
              {subheading ||
                (isRtl
                  ? "نصمم التجربة كاملة حول سؤال واحد: كيف نمنح المريض وطبيبه إجابة أوضح بأقل قدر من القلق والانتظار؟"
                  : "Every part of the experience answers one question: how can we give patients and physicians clearer answers with less anxiety and delay?")}
            </p>

            <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {reasons.map((reason) => {
                const Icon = reason.icon;
                return (
                  <motion.div
                    key={reason.titleEn}
                    whileHover={reduceMotion ? undefined : { x: isRtl ? -2 : 2 }}
                    transition={{ duration: 0.2 }}
                    className="flex gap-3"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary dark:bg-surface">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#0B2348] dark:text-white">
                        {isRtl ? reason.titleAr : reason.titleEn}
                      </h3>
                      <p className="mt-1 text-xs font-normal leading-6 text-muted-foreground">
                        {isRtl ? reason.descAr : reason.descEn}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {overviewLoaded && facts.length > 0 && (
          <div className="mt-12 grid grid-cols-2 border-y border-[#DCE8E8] py-6 sm:grid-cols-4 dark:border-border">
            {facts.map((fact, index) => {
              const Icon = fact.icon;
              return (
                <div
                  key={fact.en}
                  className={`px-3 text-center ${index > 0 ? "border-s border-[#DCE8E8] dark:border-border" : ""}`}
                >
                  <Icon className="mx-auto h-4 w-4 text-primary" aria-hidden="true" />
                  <strong className="mt-1.5 block text-2xl font-bold text-[#0B2348] dark:text-white sm:text-3xl">
                    {fact.value}
                  </strong>
                  <span className="mt-1 block text-xs font-medium text-muted-foreground">
                    {isRtl ? fact.ar : fact.en}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default WhyViaraSection;
