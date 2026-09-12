import {
  Activity,
  ArrowRight,
  Atom,
  HeartPulse,
  Radio,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLandingContent, matchesActiveModalities } from "../../../hooks/use-landing-content";
import { LandingSectionSkeleton, LandingRetryBox } from "./LandingStates";

/**
 * Service catalog. Cards are marketing copy for exam *categories*; they are
 * only rendered when the center's real equipment registry (public landing
 * overview) contains a matching active modality, so the page can never
 * advertise a service nobody operates. Exam durations were removed — they
 * were unsourced estimates presented as fact.
 */

const SERVICES = [
  {
    id: "mri",
    matchers: ["mri", "magnetic", "رنين", "مغناطيسي"],
    nameAr: "الرنين المغناطيسي",
    nameEn: "MRI",
    descAr: "صور عالية الدقة للأعصاب والمفاصل والأنسجة، دون استخدام الإشعاع المؤين.",
    descEn: "High-detail neuro, joint, and soft-tissue imaging without ionizing radiation.",
    benefitAr: "دون إشعاع",
    benefitEn: "Radiation-free",
    code: "MRI",
    icon: ScanLine,
    image: "/images/scans/service-mri-card-v2.jpg",
    featured: true,
  },
  {
    id: "ct",
    matchers: ["ct", "computed", "مقطعية"],
    nameAr: "الأشعة المقطعية",
    nameEn: "CT",
    descAr: "تصوير سريع ودقيق للقلب والصدر والجسم.",
    descEn: "Fast, precise cardiac, chest, and body imaging.",
    benefitAr: "تصوير سريع",
    benefitEn: "Fast imaging",
    code: "CT",
    icon: Radio,
    image: "/images/scans/service-ct-card-v2.jpg",
  },
  {
    id: "ultrasound",
    matchers: ["ultrasound", "doppler", "سونار", "موجات"],
    nameAr: "السونار والدوبلر",
    nameEn: "Ultrasound & Doppler",
    descAr: "تقييم لحظي للأنسجة وتدفق الدم بأمان.",
    descEn: "Safe, real-time tissue and blood-flow assessment.",
    benefitAr: "فحص لحظي",
    benefitEn: "Real-time exam",
    code: "US / DOPPLER",
    icon: Waves,
    image: "/images/scans/service-ultrasound-card-v2.jpg",
  },
  {
    id: "xray",
    matchers: ["x-ray", "xray", "radiography", "radiograph", "سينية", "أشعة رقمية"],
    nameAr: "الأشعة الرقمية",
    nameEn: "Digital X-Ray",
    descAr: "صور فورية عالية الوضوح للصدر والعظام.",
    descEn: "Immediate high-clarity chest and bone images.",
    benefitAr: "نتيجة أسرع",
    benefitEn: "Faster results",
    code: "DIGITAL DR",
    icon: Activity,
    image: "/images/scans/service-xray-card-v2.jpg",
  },
  {
    id: "mammography",
    matchers: ["mammo", "breast", "ماموجرام", "الثدي"],
    nameAr: "ماموجرام",
    nameEn: "Mammography",
    descAr: "تصوير متخصص للكشف المبكر بدقة وخصوصية.",
    descEn: "Precise, private imaging for early detection.",
    benefitAr: "كشف مبكر",
    benefitEn: "Early detection",
    code: "BREAST",
    icon: Sparkles,
    image: "/images/scans/service-mammography-card-v2.jpg",
  },
];

const SPECIALIZED_SERVICES = [
  {
    id: "nuclear",
    matchers: ["nuclear", "pet", "ذري", "بوزيتروني"],
    nameAr: "الطب النووي",
    nameEn: "Nuclear Medicine",
    descAr: "تصوير وظيفي متخصص بتقنيات النظائر المشعة.",
    descEn: "Specialized functional imaging using radioisotope tracers.",
    code: "NM",
    icon: Atom,
  },
  {
    id: "spect",
    matchers: ["spect", "pet/ct", "spect/ct"],
    nameAr: "SPECT/CT",
    nameEn: "SPECT/CT",
    descAr: "تصوير مدمج يجمع الوظيفي والتشريحي.",
    descEn: "Combined functional and anatomical imaging.",
    code: "SPECT/CT",
    icon: Atom,
  },
  {
    id: "echo",
    matchers: ["echo", "cardiac", "قلب", "إيكو", "ايكو"],
    nameAr: "إيكو القلب",
    nameEn: "Echocardiography",
    descAr: "تقييم غير جراحي لوظائف القلب وصماماته.",
    descEn: "Non-invasive assessment of heart function and valves.",
    code: "ECHO",
    icon: HeartPulse,
  },
  {
    id: "fluoroscopy",
    matchers: ["fluoro", "تألقي", "التنظير"],
    nameAr: "التصوير التألقي",
    nameEn: "Fluoroscopy",
    descAr: "تصوير حي متتابع لإجراءات التشخيص والتوجيه.",
    descEn: "Live sequential imaging for diagnostic and guided procedures.",
    code: "FLUORO",
    icon: Radio,
  },
];

const placementClasses: Record<string, string> = {
  ct: "lg:col-start-1 lg:row-start-1",
  ultrasound: "lg:col-start-1 lg:row-start-2",
  xray: "lg:col-start-3 lg:row-start-1",
  mammography: "lg:col-start-3 lg:row-start-2",
};

interface ServicesSectionProps {
  onSelectService?: (serviceId: string) => void;
  onViewAllServices?: () => void;
}

export const ServicesSection = ({ onSelectService, onViewAllServices }: ServicesSectionProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const reduceMotion = useReducedMotion();
  const { activeModalityNames, overviewLoaded, overviewError, refetchOverview, isLoading } = useLandingContent();

  const services = overviewLoaded
    ? SERVICES.filter((service) => matchesActiveModalities(activeModalityNames, service.matchers))
    : [];
  const specializedServices = overviewLoaded
    ? SPECIALIZED_SERVICES.filter((service) => matchesActiveModalities(activeModalityNames, service.matchers))
    : [];

  if (overviewError) {
    return (
      <section id="services-section" className="scroll-mt-24 border-y border-[#E3EEEB] bg-[#F7FBFA] py-14 dark:border-border dark:bg-surface sm:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <LandingRetryBox
            onRetry={refetchOverview}
            messageAr="تعذر تحميل قائمة الخدمات حالياً."
            messageEn="The services list could not load right now."
          />
        </div>
      </section>
    );
  }

  // Still loading — keep the layout stable with a skeleton.
  if (isLoading || !overviewLoaded) {
    return (
      <section id="services-section" className="scroll-mt-24 border-y border-[#E3EEEB] bg-[#F7FBFA] py-14 dark:border-border dark:bg-surface sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingSectionSkeleton rows={3} minHeight="min-h-[420px]" />
        </div>
      </section>
    );
  }

  // Nothing verified to show — hide the whole section rather than guess.
  if (!services.length && !specializedServices.length) return null;

  const featured = services.find((service) => service.featured) || services[0];
  const standard = services.filter((service) => service !== featured);

  return (
    <section
      id="services-section"
      className="scroll-mt-24 overflow-hidden border-y border-[#E3EEEB] bg-[#F7FBFA] py-14 dark:border-border dark:bg-surface sm:py-16 lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-primary">
              <span className="h-1.5 w-1.5 bg-primary" aria-hidden="true" />
              {isRtl ? "خدمات التصوير لدينا" : "Our imaging services"}
            </span>
            <h2 className="mt-3 max-w-full break-words text-2xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-3xl lg:text-4xl">
              {isRtl ? "الفحص المناسب، بمعلومة أوضح" : "The right exam, explained clearly"}
            </h2>
            <p className="mt-3 max-w-xl break-words text-sm leading-7 text-muted-foreground">
              {isRtl
                ? "تعرف سريعاً على فحوصات التصوير المتاحة لدينا، ثم اختر الخدمة التي تناسب احتياجك."
                : "Quickly compare the imaging exams we operate, then choose the service that fits your needs."}
            </p>
          </div>

          <button
            type="button"
            onClick={onViewAllServices}
            className="group inline-flex min-h-11 items-center gap-2 self-start border-b border-primary/30 px-0.5 text-sm font-bold text-primary transition hover:border-primary sm:self-auto"
          >
            {isRtl ? "اطلب فحصاً" : "Request an exam"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
          </button>
        </div>

        {services.length > 0 && (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.28fr)_minmax(0,0.82fr)] lg:grid-rows-2 lg:gap-4">
            {/* Featured service */}
            <motion.button
              key={featured.id}
              type="button"
              aria-label={`${isRtl ? featured.nameAr : featured.nameEn}: ${isRtl ? "عرض تفاصيل الفحص" : "View exam details"}`}
              onClick={() => onSelectService?.(featured.id)}
              initial={reduceMotion ? false : { opacity: 1, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              whileHover={reduceMotion ? undefined : { y: -4 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="group relative order-first flex min-h-[390px] min-w-0 w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-primary/30 bg-white text-start shadow-[0_16px_38px_rgba(11,35,72,0.09)] transition hover:border-primary/55 hover:shadow-[0_20px_46px_rgba(11,35,72,0.13)] focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.995] dark:bg-background sm:col-span-2 sm:max-w-full lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1"
            >
              <div className="relative flex h-52 shrink-0 items-center justify-center overflow-hidden border-b border-[#DDEBE7] bg-[#EAF6F3] dark:border-border dark:bg-primary-soft/15 lg:h-[21rem]">
                <img
                  src={featured.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width="900"
                  height="650"
                  sizes="(min-width: 1024px) 430px, (min-width: 640px) 80vw, 100vw"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]"
                />
                <div
                  className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0B2348]/15 to-transparent"
                  aria-hidden="true"
                />
              </div>

              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold uppercase text-primary">
                      {featured.code}
                    </span>
                    <h3 className="mt-1 text-xl font-bold text-[#0B2348] dark:text-white">
                      {isRtl ? featured.nameAr : featured.nameEn}
                    </h3>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <featured.icon className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">
                  {isRtl ? featured.descAr : featured.descEn}
                </p>

                <div className="mt-5 border-y border-[#E1ECE9] py-3 dark:border-border">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#38516B] dark:text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {isRtl ? featured.benefitAr : featured.benefitEn}
                  </span>
                </div>

                <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-primary">
                  {isRtl ? "اعرف التفاصيل واحجز" : "View details and book"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
                </span>
              </div>
            </motion.button>

            {/* Standard service cards */}
            {standard.map((service, index) => {
              const Icon = service.icon;
              const name = isRtl ? service.nameAr : service.nameEn;
              const description = isRtl ? service.descAr : service.descEn;
              const benefit = isRtl ? service.benefitAr : service.benefitEn;

              return (
                <motion.button
                  key={service.id}
                  type="button"
                  aria-label={`${name}: ${isRtl ? "عرض تفاصيل الفحص" : "View exam details"}`}
                  onClick={() => onSelectService?.(service.id)}
                  initial={reduceMotion ? false : { opacity: 1, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  whileHover={reduceMotion ? undefined : { y: -3 }}
                  transition={{
                    duration: 0.45,
                    delay: reduceMotion ? 0 : index * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`group flex min-w-0 w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-[#DDE9E6] bg-white text-start transition hover:border-primary/40 hover:shadow-[0_12px_30px_rgba(11,35,72,0.08)] focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.995] dark:border-border dark:bg-background sm:max-w-full ${placementClasses[service.id] || ""}`}
                >
                  <div className="relative flex h-32 shrink-0 items-center justify-center overflow-hidden border-b border-[#E3EEEB] bg-[#EEF6F4] dark:border-border dark:bg-primary-soft/10 lg:h-36">
                    <img
                      src={service.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width="600"
                      height="420"
                      sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                    />
                    <span className="absolute start-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/80 bg-white/90 text-primary shadow-sm dark:border-border dark:bg-surface">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <span className="mb-1.5 text-xs font-bold uppercase text-primary/80">
                      {service.code}
                    </span>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[15px] font-bold leading-5 text-[#0B2348] dark:text-white">
                        {name}
                      </h3>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                      {description}
                    </p>
                    <div className="mt-auto border-t border-[#E5EEEC] pt-3 text-xs font-bold text-primary dark:border-border">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{benefit}</span>
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {specializedServices.length > 0 && (
          <div className="mt-9 sm:mt-11">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase text-primary">
                  {isRtl ? "خدمات تخصصية" : "Specialized services"}
                </span>
                <h3 className="mt-1 text-lg font-bold text-[#0B2348] dark:text-white sm:text-xl">
                  {isRtl ? "مزيد من الفحوص في مكان واحد" : "More diagnostic exams in one place"}
                </h3>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block">
                {isRtl ? "اختر الخدمة لبدء الطلب" : "Select a service to start a request"}
              </span>
            </div>

            <div className="grid gap-px overflow-hidden rounded-lg border border-[#DCE8E5] bg-[#DCE8E5] dark:border-border dark:bg-border sm:grid-cols-2 lg:grid-cols-4">
              {specializedServices.map((service, index) => {
                const Icon = service.icon;
                return (
                  <motion.button
                    key={service.id}
                    type="button"
                    onClick={() => onSelectService?.(service.id)}
                    initial={reduceMotion ? false : { opacity: 1, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    whileHover={reduceMotion ? undefined : { y: -2 }}
                    transition={{ duration: 0.4, delay: reduceMotion ? 0 : index * 0.05 }}
                    className="group flex min-h-[112px] items-start gap-3 bg-white p-4 text-start transition hover:bg-[#F3F9F7] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/35 dark:bg-background dark:hover:bg-primary-soft/10"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E9F6F2] text-primary transition group-hover:bg-primary group-hover:text-white dark:bg-primary-soft/20">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold uppercase text-primary/75">
                        {service.code}
                      </span>
                      <span className="mt-1 block text-sm font-bold text-[#0B2348] dark:text-white">
                        {isRtl ? service.nameAr : service.nameEn}
                      </span>
                      <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                        {isRtl ? service.descAr : service.descEn}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default ServicesSection;
