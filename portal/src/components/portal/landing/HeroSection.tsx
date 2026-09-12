import { CalendarCheck, Check, ChevronDown, FileText, MapPin, ShieldCheck, ListChecks, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePortalIdentity } from '../../../lib/portal-identity';

interface HeroSectionProps {
  onBook?: () => void;
  onCheckResults?: () => void;
  onFindBranch?: () => void;
}

export const HeroSection = ({ onBook, onCheckResults, onFindBranch }: HeroSectionProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const reduceMotion = useReducedMotion();
  const identity = usePortalIdentity();

  const trustItems = [
    { icon: ListChecks, ar: 'طلب موعد واضح', en: 'Clear appointment requests' },
    { icon: ShieldCheck, ar: 'تحقق آمن للنتائج', en: 'Secure result verification' },
    { icon: RefreshCw, ar: 'بيانات محدثة من المركز', en: 'Center-managed information' },
  ];

  const quickActions = [
    { icon: CalendarCheck, title: isRtl ? 'احجز فحصاً' : 'Book an exam', desc: isRtl ? 'اختر الفحص والموعد المناسب' : 'Choose your exam and time', action: onBook, primary: true },
    { icon: FileText, title: isRtl ? 'استلم نتيجتك' : 'Access results', desc: isRtl ? 'تابع التقرير والصور الرقمية' : 'View reports and images', action: onCheckResults },
    { icon: MapPin, title: isRtl ? 'أقرب فرع' : 'Find a location', desc: isRtl ? 'ابحث عن المركز الأقرب إليك' : 'Locate your nearest center', action: onFindBranch },
  ];

  return (
    <section className="relative isolate overflow-hidden bg-[#F4FAF8] pb-10 pt-8 dark:bg-background sm:pb-12 lg:pt-10">
      <div className="absolute inset-x-0 top-0 -z-20 h-[92%] overflow-hidden">
        <motion.img
          src="/images/viara-hero-mri-room.jpg"
          alt={`${identity.center.name} diagnostic imaging suite`}
          className="h-full w-full object-cover object-center"
          decoding="async"
          initial={reduceMotion ? false : { scale: 1.02 }}
          animate={reduceMotion ? undefined : { scale: 1.045 }}
          transition={{ duration: 12, ease: 'easeOut' }}
        />
        <div className="absolute inset-0 bg-white/76 dark:bg-[#071224]/82" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#F4FAF8]/45 via-[#F4FAF8]/72 to-[#F4FAF8] dark:from-[#071224]/45 dark:via-[#071224]/75 dark:to-[#071224]" />
      </div>

      <div className="mx-auto flex min-h-[620px] max-w-7xl flex-col justify-between px-4 sm:min-h-[680px] sm:px-6 lg:min-h-[720px] lg:px-8">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center pb-10 pt-12 text-center sm:pt-16"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/82 px-4 py-2 text-xs font-semibold text-primary shadow-sm backdrop-blur-md dark:bg-surface/80">
            <Check className="h-3.5 w-3.5" />
            {isRtl ? 'من طلب الموعد إلى النتيجة في مسار واضح' : 'A clear path from appointment request to results'}
          </span>

          <h1 className="mt-7 max-w-[760px] break-words text-[34px] font-extrabold leading-[1.12] text-[#0B2348] sm:text-[56px] lg:text-[70px] dark:text-white">
            {isRtl ? (
              <>تصوير تشخيصي<span className="mt-1 block">أوضح. أدق. <span className="text-primary">أقرب إليك.</span></span></>
            ) : (
              <>Diagnostic imaging<span className="mt-1 block">Clearer. Precise. <span className="text-primary">Closer.</span></span></>
            )}
          </h1>

          <p className="mt-6 max-w-2xl text-base font-medium leading-8 text-[#5F7187] sm:text-lg dark:text-muted-foreground">
            {isRtl
              ? 'تعرّف على الخدمات المتاحة، أرسل طلب موعد، وتابع حالة التقرير بعد تحقق يحمي خصوصيتك.'
              : 'See available services, request an appointment, and track report status after privacy-protecting verification.'}
          </p>

          <div className="mt-8 flex w-full max-w-lg flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={onBook} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(8,120,95,0.2)] transition hover:-translate-y-0.5 hover:bg-primary-dark">
              <CalendarCheck className="h-4 w-4" />
              {isRtl ? 'احجز موعدك' : 'Book an appointment'}
            </button>
            <button type="button" onClick={onCheckResults} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#D9E7E3] bg-white/88 px-6 py-3 text-sm font-bold text-[#0B2348] shadow-sm backdrop-blur-md transition hover:border-primary/35 hover:text-primary dark:border-border dark:bg-surface/88 dark:text-white">
              <FileText className="h-4 w-4 text-primary" />
              {isRtl ? 'عرض النتائج' : 'View results'}
            </button>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs font-semibold text-[#4E6178] dark:text-muted-foreground">
            {trustItems.map((item) => {
              const Icon = item.icon;
              return <span key={item.en} className="inline-flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{isRtl ? item.ar : item.en}</span>;
            })}
          </div>

          <a href="#services-section" className="mt-9 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-primary">
            {isRtl ? 'اكتشف خدماتنا' : 'Explore our services'}
            <ChevronDown className="h-4 w-4" />
          </a>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="grid overflow-hidden rounded-2xl border border-[#E2ECE9] bg-white/92 shadow-[0_12px_38px_rgba(11,35,72,0.08)] backdrop-blur-xl sm:grid-cols-3 dark:border-border dark:bg-surface/92"
        >
          {quickActions.map((item, index) => {
            const Icon = item.icon;
            return (
              <button key={item.title} type="button" onClick={item.action} className={`group flex min-h-[104px] items-center gap-4 px-5 py-4 text-start transition hover:bg-[#F5FAF8] dark:hover:bg-primary-soft/20 ${index > 0 ? 'border-t border-[#E2ECE9] sm:border-s sm:border-t-0 dark:border-border' : ''}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.primary ? 'bg-primary text-white' : 'bg-[#EDF8F4] text-primary dark:bg-primary-soft'}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <strong className="block text-sm font-bold text-[#0B2348] transition group-hover:text-primary dark:text-white">{item.title}</strong>
                  <small className="mt-1 block text-xs font-medium leading-5 text-muted-foreground">{item.desc}</small>
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
