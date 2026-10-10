import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  FileText,
  ScanLine,
  Stethoscope,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";

const STEPS = [
  {
    step: "01",
    icon: CalendarCheck,
    titleAr: "احجز موعدك",
    titleEn: "Book your visit",
    descAr: "اختر الفحص والفرع والموعد المناسب، وسيتواصل الفريق لتأكيد التفاصيل.",
    descEn: "Choose your exam, center, and preferred time. The team will confirm the details.",
    pointsAr: ["اختيار الفحص المناسب", "تحديد الفرع والموعد", "تأكيد سريع عبر الهاتف"],
    pointsEn: ["Select the right exam", "Choose center and time", "Quick phone confirmation"],
    action: "book" as const,
  },
  {
    step: "02",
    icon: ScanLine,
    titleAr: "استعد وأجرِ الفحص",
    titleEn: "Prepare and complete your scan",
    descAr: "تصلك تعليمات التحضير مسبقاً، ثم يستقبلك الفريق لتجربة منظمة وهادئة.",
    descEn: "Receive preparation guidance in advance, followed by an organized, calm visit.",
    pointsAr: ["تعليمات تحضير واضحة", "تسجيل وصول سريع", "فحص بإشراف متخصص"],
    pointsEn: ["Clear preparation guidance", "Fast check-in", "Specialist-supervised exam"],
    action: "book" as const,
  },
  {
    step: "03",
    icon: FileText,
    titleAr: "استلم تقريرك وصورك",
    titleEn: "Receive your report and images",
    descAr: "بعد المراجعة الطبية يصبح التقرير النهائي والصور متاحين رقمياً للمعاينة والطباعة.",
    descEn:
      "After clinical review, your final report and images are available digitally to view and print.",
    pointsAr: ["تقرير طبي نهائي", "صور الفحص الرقمية", "معاينة وتنزيل وطباعة"],
    pointsEn: ["Final clinical report", "Digital study images", "View, download, and print"],
    action: "results" as const,
  },
  {
    step: "04",
    icon: Stethoscope,
    titleAr: "تابع مع طبيبك",
    titleEn: "Follow up with your doctor",
    descAr: "استخدم بوابة المريض أو وصول الطبيب الآمن لدعم المتابعة واتخاذ القرار الطبي.",
    descEn:
      "Use the patient portal or secure doctor access to support follow-up and clinical decisions.",
    pointsAr: ["وصول موثّق للنتائج", "خصوصية أثناء المتابعة", "قرار مبني على التقرير"],
    pointsEn: ["Verified result access", "Private follow-up", "Report-informed decisions"],
    action: "results" as const,
  },
];

interface PatientJourneyProps {
  onBook?: () => void;
  onCheckResults?: () => void;
  heading?: string;
  subheading?: string;
}

export const PatientJourney = ({
  onBook,
  onCheckResults,
  heading,
  subheading,
}: PatientJourneyProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStep = STEPS[activeIndex];
  const ActiveIcon = activeStep.icon;

  const move = (direction: number) => {
    setActiveIndex((current) => (current + direction + STEPS.length) % STEPS.length);
  };

  const handleAction = () => {
    if (activeStep.action === "results") onCheckResults?.();
    else onBook?.();
  };

  return (
    <section
      id="patient-journey"
      className="border-y border-[#E2ECE9] bg-white py-14 dark:border-border dark:bg-surface sm:py-16 lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
          <span className="text-xs font-semibold text-primary">
            {isRtl ? "رحلتك معنا" : "Your patient journey"}
          </span>
          <h2 className="mt-2 text-3xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-4xl">
            {heading ||
              (isRtl
                ? "كل خطوة واضحة، من الحجز إلى النتيجة"
                : "Every step is clear, from booking to results")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            {subheading ||
              (isRtl
                ? "مسار واحد منظم يساعدك على معرفة ما يحدث الآن، وما الذي يأتي بعده."
                : "One organized journey that shows what is happening now and what comes next.")}
          </p>
        </div>

        <div className="mx-auto w-full min-w-0 max-w-6xl overflow-hidden rounded-lg border border-[#DCE8E5] bg-[#F8FBFA] shadow-[0_18px_45px_rgba(11,35,72,0.08)] dark:border-border dark:bg-background">
          <div className="relative grid min-w-0 grid-cols-2 border-b border-[#DCE8E5] bg-white dark:border-border dark:bg-surface lg:grid-cols-4">
            <div
              className="absolute inset-x-0 bottom-0 h-0.5 bg-[#E1ECE9] dark:bg-border"
              aria-hidden="true"
            >
              <motion.div
                className="h-full bg-primary"
                animate={{ width: `${((activeIndex + 1) / STEPS.length) * 100}%` }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === activeIndex;
              const isComplete = index < activeIndex;
              return (
                <button
                  key={step.step}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-current={isActive ? "step" : undefined}
                  className={`relative flex min-h-[82px] min-w-0 items-center gap-3 border-[#E5EEEC] px-4 text-start transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 lg:min-h-[92px] lg:px-5 ${
                    index % 2 === 0 ? "border-e" : ""
                  } ${index < 2 ? "border-b lg:border-b-0" : ""} ${index < STEPS.length - 1 ? "lg:border-e" : "lg:border-e-0"} ${
                    isActive
                      ? "bg-[#F0F8F5] dark:bg-[var(--VIARA-surface-muted)]"
                      : "hover:bg-[#F8FBFA] dark:hover:bg-background"
                  }`}
                >
                  <motion.span
                    animate={{ scale: isActive ? 1.06 : 1 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary text-white shadow-[0_8px_20px_rgba(8,120,95,0.22)]"
                        : isComplete
                          ? "bg-[#DDF2EB] text-primary"
                          : "bg-[#F1F6F5] text-primary dark:bg-background"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </motion.span>
                  <span className="min-w-0">
                    <span
                      className={`block text-xs font-bold ${isActive ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {step.step}
                    </span>
                    <span
                      className={`mt-0.5 block text-xs font-bold leading-5 sm:text-sm ${isActive ? "text-primary" : "text-[#0B2348] dark:text-white"}`}
                    >
                      {isRtl ? step.titleAr : step.titleEn}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeStep.step}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="grid min-w-0 lg:grid-cols-[0.88fr_1.12fr]"
            >
              <div className="relative overflow-hidden bg-[#0B2348] px-6 py-8 text-white sm:px-8 lg:min-h-[300px] lg:px-10 lg:py-10">
                <span
                  className="absolute -end-3 -top-10 select-none text-[150px] font-bold leading-none text-white/[0.045]"
                  aria-hidden="true"
                >
                  {activeStep.step}
                </span>
                <div className="relative">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-[#80D9BD]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#80D9BD]" />
                    {isRtl
                      ? `الخطوة ${activeIndex + 1} من ${STEPS.length}`
                      : `Step ${activeIndex + 1} of ${STEPS.length}`}
                  </span>
                  <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-[#80D9BD] ring-1 ring-white/15">
                    <ActiveIcon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold leading-tight sm:text-3xl">
                    {isRtl ? activeStep.titleAr : activeStep.titleEn}
                  </h3>
                  <p className="mt-3 max-w-lg break-words text-sm leading-7 text-white/70">
                    {isRtl ? activeStep.descAr : activeStep.descEn}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-col bg-white px-6 py-8 dark:bg-surface sm:px-8 lg:px-10 lg:py-10">
                <span className="text-xs font-bold text-primary">
                  {isRtl ? "ما الذي تتوقعه؟" : "What to expect"}
                </span>
                <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {(isRtl ? activeStep.pointsAr : activeStep.pointsEn).map((point, index) => (
                    <motion.div
                      key={point}
                      initial={reduceMotion ? false : { opacity: 0, x: isRtl ? 8 : -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduceMotion ? 0 : 0.08 + index * 0.07, duration: 0.35 }}
                      className="flex items-start gap-2.5"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-xs font-semibold leading-6 text-[#38516B] dark:text-muted-foreground">
                        {point}
                      </span>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-auto flex flex-col gap-4 border-t border-[#E3ECEA] pt-6 dark:border-border sm:flex-row sm:items-center sm:justify-between lg:mt-7">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => move(isRtl ? 1 : -1)}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D7E5E1] text-[#0B2348] transition hover:border-primary/40 hover:text-primary dark:border-border dark:text-white"
                      aria-label={isRtl ? "الخطوة السابقة" : "Previous step"}
                    >
                      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
                    </button>
                    <span className="min-w-14 text-center text-xs font-bold tabular-nums text-muted-foreground">
                      {activeStep.step} / {String(STEPS.length).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      onClick={() => move(isRtl ? -1 : 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D7E5E1] text-[#0B2348] transition hover:border-primary/40 hover:text-primary dark:border-border dark:text-white"
                      aria-label={isRtl ? "الخطوة التالية" : "Next step"}
                    >
                      <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAction}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    {activeStep.action === "results" ? (
                      <FileText className="h-4 w-4" />
                    ) : (
                      <CalendarCheck className="h-4 w-4" />
                    )}
                    {activeStep.action === "results"
                      ? isRtl
                        ? "اعرض نتائجك"
                        : "View your results"
                      : isRtl
                        ? "احجز موعدك"
                        : "Book your visit"}
                    <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};

export default PatientJourney;
