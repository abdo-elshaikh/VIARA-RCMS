import {
  Activity,
  ArrowRight,
  Atom,
  Clock3,
  HeartPulse,
  Radio,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";

const SERVICES = [
  {
    id: "mri",
    nameAr: "الرنين المغناطيسي 3 تسلا",
    nameEn: "3.0T MRI",
    descAr: "صور عالية الدقة للأعصاب والمفاصل والأنسجة، دون استخدام الإشعاع المؤين.",
    descEn: "High-detail neuro, joint, and soft-tissue imaging without ionizing radiation.",
    benefitAr: "دون إشعاع",
    benefitEn: "Radiation-free",
    durationAr: "30-45 دقيقة",
    durationEn: "30-45 min",
    code: "MRI 3.0T",
    icon: ScanLine,
    image: "/images/scans/service-mri-card-v2.jpg",
    featured: true,
  },
  {
    id: "ct",
    nameAr: "الأشعة المقطعية",
    nameEn: "CT 128 Slice",
    descAr: "تصوير سريع ودقيق للقلب والصدر والجسم.",
    descEn: "Fast, precise cardiac, chest, and body imaging.",
    benefitAr: "جرعة محسّنة",
    benefitEn: "Dose optimized",
    durationAr: "5-10 دقائق",
    durationEn: "5-10 min",
    code: "CT 128",
    icon: Radio,
    image: "/images/scans/service-ct-card-v2.jpg",
  },
  {
    id: "ultrasound",
    nameAr: "السونار والدوبلر",
    nameEn: "Ultrasound & Doppler",
    descAr: "تقييم لحظي للأنسجة وتدفق الدم بأمان.",
    descEn: "Safe, real-time tissue and blood-flow assessment.",
    benefitAr: "فحص لحظي",
    benefitEn: "Real-time exam",
    durationAr: "15-30 دقيقة",
    durationEn: "15-30 min",
    code: "US / DOPPLER",
    icon: Waves,
    image: "/images/scans/service-ultrasound-card-v2.jpg",
  },
  {
    id: "xray",
    nameAr: "الأشعة الرقمية",
    nameEn: "Digital X-Ray",
    descAr: "صور فورية عالية الوضوح للصدر والعظام.",
    descEn: "Immediate high-clarity chest and bone images.",
    benefitAr: "نتيجة أسرع",
    benefitEn: "Faster results",
    durationAr: "5-10 دقائق",
    durationEn: "5-10 min",
    code: "DIGITAL DR",
    icon: Activity,
    image: "/images/scans/service-xray-card-v2.jpg",
  },
  {
    id: "mammography",
    nameAr: "ماموجرام ثلاثي الأبعاد",
    nameEn: "3D Mammography",
    descAr: "تصوير متخصص للكشف المبكر بدقة وخصوصية.",
    descEn: "Precise, private imaging for early detection.",
    benefitAr: "كشف مبكر",
    benefitEn: "Early detection",
    durationAr: "15-20 دقيقة",
    durationEn: "15-20 min",
    code: "3D BREAST",
    icon: Sparkles,
    image: "/images/scans/service-mammography-card-v2.jpg",
  },
];

const SPECIALIZED_SERVICES = [
  {
    id: "nuclear",
    nameAr: "المسح الذري",
    nameEn: "Nuclear Medicine Scan",
    descAr: "تصوير وظيفي للعظام والغدة الدرقية والكلى وأعضاء أخرى.",
    descEn: "Functional imaging for bones, thyroid, kidneys, and other organs.",
    code: "GAMMA SCAN",
    icon: Atom,
  },
  {
    id: "spect",
    nameAr: "المسح الذري المقطعي",
    nameEn: "SPECT / CT",
    descAr: "دمج النشاط الوظيفي والتفاصيل التشريحية في فحص واحد.",
    descEn: "Functional activity and anatomical detail combined in one exam.",
    code: "SPECT / CT",
    icon: ScanLine,
  },
  {
    id: "echo",
    nameAr: "إيكو القلب",
    nameEn: "Echocardiography",
    descAr: "تقييم حركة عضلة القلب والصمامات وكفاءة الضخ دون إشعاع.",
    descEn: "Radiation-free assessment of heart motion, valves, and pumping function.",
    code: "CARDIAC ECHO",
    icon: HeartPulse,
  },
  {
    id: "fluoroscopy",
    nameAr: "التصوير التألقي",
    nameEn: "Fluoroscopy",
    descAr: "أشعة متحركة لحظية لدعم فحوص الجهاز الهضمي والمفاصل.",
    descEn: "Real-time X-ray imaging for gastrointestinal and joint examinations.",
    code: "FLUOROSCOPY",
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
              {isRtl ? "الخدمات الأكثر طلباً" : "Most requested services"}
            </span>
            <h2 className="mt-3 max-w-full break-words text-2xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-3xl lg:text-4xl">
              {isRtl ? "الفحص المناسب، بمعلومة أوضح" : "The right exam, explained clearly"}
            </h2>
            <p className="mt-3 max-w-xl break-words text-sm leading-7 text-muted-foreground">
              {isRtl
                ? "تعرف سريعاً على أشهر فحوصات التصوير، ثم اختر الخدمة التي تناسب احتياجك."
                : "Quickly compare our most common imaging exams, then choose the service that fits your needs."}
            </p>
          </div>

          <button
            type="button"
            onClick={onViewAllServices}
            className="group inline-flex min-h-11 items-center gap-2 self-start border-b border-primary/30 px-0.5 text-sm font-bold text-primary transition hover:border-primary sm:self-auto"
          >
            {isRtl ? "استعرض كل الخدمات" : "Explore all services"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
          </button>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.28fr)_minmax(0,0.82fr)] lg:grid-rows-2 lg:gap-4">
          {SERVICES.map((service, index) => {
            const Icon = service.icon;
            const name = isRtl ? service.nameAr : service.nameEn;
            const description = isRtl ? service.descAr : service.descEn;
            const benefit = isRtl ? service.benefitAr : service.benefitEn;

            if (service.featured) {
              return (
                <motion.button
                  key={service.id}
                  type="button"
                  aria-label={`${name}: ${isRtl ? "عرض تفاصيل الفحص" : "View exam details"}`}
                  onClick={() => onSelectService?.(service.id)}
                  initial={reduceMotion ? false : { opacity: 1, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  className="group relative order-first flex min-h-[390px] min-w-0 w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-primary/30 bg-white text-start shadow-[0_16px_38px_rgba(11,35,72,0.09)] transition hover:border-primary/55 hover:shadow-[0_20px_46px_rgba(11,35,72,0.13)] focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.995] dark:bg-background sm:col-span-2 sm:max-w-full lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1"
                >
                  <div className="relative flex h-52 shrink-0 items-center justify-center overflow-hidden border-b border-[#DDEBE7] bg-[#EAF6F3] dark:border-border dark:bg-primary-soft/15 lg:h-[21rem]">
                    <img
                      src={service.image}
                      alt=""
                      decoding="async"
                      sizes="(min-width: 1024px) 430px, (min-width: 640px) 80vw, 100vw"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]"
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0B2348]/15 to-transparent"
                      aria-hidden="true"
                    />
                    <span className="absolute start-4 top-4 inline-flex items-center gap-2 rounded-md bg-[#0B2348] px-3 py-1.5 text-[10px] font-bold text-white shadow-sm">
                      <Sparkles className="h-3.5 w-3.5 text-[#76D6B5]" />
                      {isRtl ? "الأكثر حجزاً" : "Most booked"}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-primary">
                          {service.code}
                        </span>
                        <h3 className="mt-1 text-xl font-bold text-[#0B2348] dark:text-white">
                          {name}
                        </h3>
                      </div>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                    <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>

                    <div className="mt-5 grid grid-cols-2 border-y border-[#E1ECE9] py-3 dark:border-border">
                      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#38516B] dark:text-muted-foreground">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        {benefit}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 border-s border-[#E1ECE9] ps-4 text-xs font-semibold text-[#38516B] dark:border-border dark:text-muted-foreground">
                        <Clock3 className="h-4 w-4 text-primary" />
                        {isRtl ? service.durationAr : service.durationEn}
                      </span>
                    </div>

                    <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-primary">
                      {isRtl ? "اعرف التفاصيل واحجز" : "View details and book"}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
                    </span>
                  </div>
                </motion.button>
              );
            }

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
                    decoding="async"
                    sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  />
                  <span className="absolute start-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/80 bg-white/90 text-primary shadow-sm dark:border-border dark:bg-surface">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <span className="mb-1.5 text-[9px] font-bold uppercase text-primary/80">
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
                  <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#E5EEEC] pt-3 text-[10px] font-bold text-primary dark:border-border">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{benefit}</span>
                    </span>
                    <span className="flex min-w-0 items-center justify-end gap-1.5 text-[#536B7D] dark:text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">
                        {isRtl ? service.durationAr : service.durationEn}
                      </span>
                    </span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-9 sm:mt-11">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase text-primary">
                {isRtl ? "خدمات تخصصية" : "Specialized services"}
              </span>
              <h3 className="mt-1 text-lg font-bold text-[#0B2348] dark:text-white sm:text-xl">
                {isRtl ? "مزيد من الفحوص في مكان واحد" : "More diagnostic exams in one place"}
              </h3>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:block">
              {isRtl ? "اختر الخدمة لبدء الحجز" : "Select a service to start booking"}
            </span>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-[#DCE8E5] bg-[#DCE8E5] dark:border-border dark:bg-border sm:grid-cols-2 lg:grid-cols-4">
            {SPECIALIZED_SERVICES.map((service, index) => {
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
                    <span className="block text-[9px] font-bold uppercase text-primary/75">
                      {service.code}
                    </span>
                    <span className="mt-1 block text-sm font-bold text-[#0B2348] dark:text-white">
                      {isRtl ? service.nameAr : service.nameEn}
                    </span>
                    <span className="mt-1.5 line-clamp-2 block text-[11px] leading-5 text-muted-foreground">
                      {isRtl ? service.descAr : service.descEn}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
