import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";

const FLAGSHIPS = [
  {
    id: "mri",
    label: "MRI 3.0T",
    titleAr: "وضوح أعلى دون إشعاع",
    titleEn: "Sharper detail without radiation",
    descAr: "تصوير دقيق للأعصاب والمفاصل مع تجويف واسع وتقنيات تقلل الضوضاء ووقت الفحص.",
    descEn:
      "High-detail neuro and joint imaging with a wider bore, quieter scanning, and shorter exam times.",
    benefitAr: "راحة أكبر وصور أوضح",
    benefitEn: "More comfort, clearer images",
    image: "/images/scans/equipment-mri-slider-v3.jpg",
  },
  {
    id: "ct",
    label: "CT 128 Slice",
    titleAr: "تفاصيل دقيقة في وقت أقصر",
    titleEn: "Precise detail in less time",
    descAr: "تصوير سريع للقلب والصدر والجسم مع بروتوكولات متقدمة لتقليل الجرعة الإشعاعية.",
    descEn: "Fast cardiac, chest, and body imaging with advanced low-dose radiation protocols.",
    benefitAr: "فحص أسرع وجرعة أقل",
    benefitEn: "Faster scans, lower dose",
    image: "/images/scans/equipment-ct-slider-v3.jpg",
  },
  {
    id: "xray",
    label: "Digital X-Ray",
    titleAr: "صور رقمية فورية عالية الجودة",
    titleEn: "Instant high-quality digital images",
    descAr: "تصوير رقمي للصدر والعظام مع معاينة فورية وإعدادات أمان مناسبة لمختلف الأعمار.",
    descEn:
      "Digital chest and bone imaging with immediate preview and age-appropriate safety settings.",
    benefitAr: "نتيجة أسرع بلا أفلام",
    benefitEn: "Faster, film-free results",
    image: "/images/scans/equipment-xray-slider-v3.jpg",
  },
  {
    id: "ultrasound",
    label: "Ultrasound & Doppler",
    titleAr: "تصوير لحظي بلا إشعاع",
    titleEn: "Real-time imaging without radiation",
    descAr: "سونار ودوبلر متقدم لتقييم البطن والأوعية والأنسجة بصورة مريحة وآمنة.",
    descEn:
      "Advanced ultrasound and Doppler for comfortable, radiation-free abdominal and vascular imaging.",
    benefitAr: "آمن وسريع ومريح",
    benefitEn: "Safe, fast, comfortable",
    image: "/images/scans/equipment-ultrasound-slider-v3.jpg",
  },
  {
    id: "mammography",
    label: "3D Mammography",
    titleAr: "فحص أدق لصحة الثدي",
    titleEn: "More precise breast screening",
    descAr: "تصوير ثلاثي الأبعاد لاكتشاف التفاصيل الدقيقة مع تجربة أكثر خصوصية وراحة.",
    descEn:
      "3D breast imaging designed to reveal subtle findings with greater comfort and privacy.",
    benefitAr: "تفاصيل أدق واطمئنان أكبر",
    benefitEn: "Finer detail, greater reassurance",
    image: "/images/scans/equipment-mammography-slider-v3.jpg",
  },
  {
    id: "petct",
    label: "PET / CT",
    titleAr: "التصوير الوظيفي والتشريحي معاً",
    titleEn: "Functional and anatomical detail together",
    descAr: "دمج التصوير البوزيتروني والمقطعي لدعم تقييم الأورام ومتابعة الاستجابة للعلاج.",
    descEn:
      "Combined PET and CT imaging to support cancer assessment and treatment-response monitoring.",
    benefitAr: "تقييم أدق للنشاط الحيوي",
    benefitEn: "Clearer metabolic assessment",
    image: "/images/scans/equipment-petct-slider-v3.jpg",
  },
  {
    id: "dexa",
    label: "DEXA",
    titleAr: "قياس دقيق لكثافة العظام",
    titleEn: "Precise bone-density measurement",
    descAr: "فحص منخفض الجرعة لتقييم صحة العظام والكشف المبكر عن هشاشة العظام.",
    descEn: "A low-dose exam for bone-health assessment and early detection of osteoporosis.",
    benefitAr: "فحص سريع بجرعة منخفضة",
    benefitEn: "Quick exam, very low dose",
    image: "/images/scans/equipment-dexa-slider-v3.jpg",
  },
  {
    id: "dental",
    label: "Dental Panoramic",
    titleAr: "صورة شاملة للأسنان والفكين",
    titleEn: "A complete view of teeth and jaws",
    descAr: "تصوير بانورامي يدعم تخطيط الزرعات والتقويم وتقييم الأسنان والفكين في لقطة واحدة.",
    descEn:
      "Panoramic imaging for implant planning, orthodontics, and a complete dental assessment.",
    benefitAr: "مجال أوسع في لقطة واحدة",
    benefitEn: "A wider view in one scan",
    image: "/images/scans/equipment-dental-slider-v3.jpg",
  },
] as const;

interface EquipmentGridProps {
  onBookModality?: (modality: string) => void;
}

export const EquipmentGrid = ({ onBookModality }: EquipmentGridProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const move = (direction: number) => {
    setActiveIndex((current) => (current + direction + FLAGSHIPS.length) % FLAGSHIPS.length);
  };

  useEffect(() => {
    if (paused || reduceMotion) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % FLAGSHIPS.length);
    }, 8800);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion]);

  const visibleItems = [-1, 0, 1].map((offset) => ({
    item: FLAGSHIPS[(activeIndex + offset + FLAGSHIPS.length) % FLAGSHIPS.length],
    offset,
  }));

  return (
    <section
      id="equipment-section"
      className="scroll-mt-24 overflow-hidden border-y border-[#E4EEEB] bg-[#F7FBFA] py-14 dark:border-border dark:bg-background sm:py-16 lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
          <span className="text-xs font-semibold text-primary">
            {isRtl ? "التقنية في خدمة التشخيص" : "Technology supporting diagnosis"}
          </span>
          <h2 className="mt-2 text-3xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-4xl">
            {isRtl ? "أحدث الأجهزة والتقنيات الطبية" : "Advanced medical imaging technology"}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            {isRtl
              ? "تقنيات مختارة لتمنحك فحصاً أكثر راحة وصوراً أوضح تساعد الطبيب على الوصول إلى تشخيص أدق."
              : "Technology selected to make every exam more comfortable and every diagnostic image clearer."}
          </p>
        </div>

        <div
          className="relative mx-auto max-w-6xl"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div className="grid items-center gap-4 lg:grid-cols-[0.8fr_1.12fr_0.8fr] lg:gap-5">
            <AnimatePresence initial={false} mode="popLayout">
              {visibleItems.map(({ item, offset }) => {
                const isActive = offset === 0;
                return (
                  <motion.article
                    layout
                    key={item.id}
                    drag={isActive ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.1}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -55) move(isRtl ? -1 : 1);
                      if (info.offset.x > 55) move(isRtl ? 1 : -1);
                    }}
                    initial={reduceMotion ? false : { opacity: 1, scale: 0.98 }}
                    animate={{
                      opacity: isActive ? 1 : 0.76,
                      scale: isActive ? 1 : 0.96,
                      y: isActive ? -5 : 4,
                    }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className={`${isActive ? "block" : "hidden lg:block"} group overflow-hidden rounded-lg border bg-white dark:bg-surface ${isActive ? "border-primary/35 shadow-[0_20px_50px_rgba(11,35,72,0.12)]" : "border-[#DDE9E6] dark:border-border"}`}
                  >
                    <div
                      className={`relative overflow-hidden bg-[#EAF3F1] ${isActive ? "h-56 sm:h-64" : "h-44"}`}
                    >
                      <img
                        src={item.image}
                        alt={isRtl ? item.titleAr : item.titleEn}
                        loading={isActive ? "eager" : "lazy"}
                        decoding="async"
                        sizes={
                          isActive
                            ? "(min-width: 1024px) 42vw, 100vw"
                            : "(min-width: 1024px) 28vw, 100vw"
                        }
                        className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-[1.025]"
                      />
                      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#071B38]/35 to-transparent" />
                      <span className="absolute start-3 top-3 rounded-md border border-white/60 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#0B2348] shadow-sm backdrop-blur dark:bg-surface/90 dark:text-white">
                        {item.label}
                      </span>
                      {isActive && (
                        <span className="absolute end-3 top-3 rounded-md bg-primary px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                          {isRtl ? "تقنية مميزة" : "Featured technology"}
                        </span>
                      )}
                    </div>

                    <div className={isActive ? "p-5 sm:p-6" : "p-4"}>
                      <h3
                        className={`${isActive ? "text-xl" : "text-base"} font-bold leading-snug text-[#0B2348] dark:text-white`}
                      >
                        {isRtl ? item.titleAr : item.titleEn}
                      </h3>
                      <p
                        className={`mt-2 line-clamp-2 text-xs text-muted-foreground ${isActive ? "leading-6" : "leading-5"}`}
                      >
                        {isRtl ? item.descAr : item.descEn}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>{isRtl ? item.benefitAr : item.benefitEn}</span>
                      </div>
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => onBookModality?.(item.id)}
                          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-white transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                          {isRtl ? "احجز هذا الفحص" : "Book this exam"}
                          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                        </button>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => move(isRtl ? 1 : -1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D7E5E1] bg-white text-[#0B2348] transition hover:border-primary/40 hover:text-primary dark:border-border dark:bg-surface dark:text-white"
              aria-label={isRtl ? "التقنية السابقة" : "Previous technology"}
            >
              <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
            </button>

            <div
              className="flex min-w-0 items-center gap-1.5"
              aria-label={`${activeIndex + 1} / ${FLAGSHIPS.length}`}
            >
              {FLAGSHIPS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`${item.label}: ${index + 1} / ${FLAGSHIPS.length}`}
                  aria-current={index === activeIndex ? "true" : undefined}
                  className={`h-1.5 rounded-full transition-all duration-500 ${index === activeIndex ? "w-7 bg-primary" : "w-1.5 bg-[#C5D8D3] hover:bg-primary/50"}`}
                />
              ))}
            </div>

            <span className="min-w-12 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
              {String(activeIndex + 1).padStart(2, "0")} /{" "}
              {String(FLAGSHIPS.length).padStart(2, "0")}
            </span>

            <button
              type="button"
              onClick={() => move(isRtl ? -1 : 1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D7E5E1] bg-white text-[#0B2348] transition hover:border-primary/40 hover:text-primary dark:border-border dark:bg-surface dark:text-white"
              aria-label={isRtl ? "التقنية التالية" : "Next technology"}
            >
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EquipmentGrid;
