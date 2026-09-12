import { ArrowRight, CalendarCheck, CheckCircle2, Phone, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePortalIdentity } from '../../../lib/portal-identity';
import { useLandingContent } from '../../../hooks/use-landing-content';

interface CareSupportBandProps {
  onBook?: () => void;
}

export const CareSupportBand = ({ onBook }: CareSupportBandProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const reduceMotion = useReducedMotion();
  const identity = usePortalIdentity();
  const { contactPhone } = useLandingContent();

  return (
    <section id="support-section" className="scroll-mt-24 overflow-hidden bg-[#EEF7F5] pb-28 pt-12 dark:bg-[#0A1729] md:py-14">
      <div className="mx-auto grid max-w-7xl items-center gap-9 px-4 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14 lg:px-8" dir="ltr">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: -18 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative h-64 overflow-hidden rounded-2xl sm:h-72 lg:h-[330px]"
        >
          <motion.img
            src="/images/viara-support-agent.jpg"
            alt={`${identity.center.name} patient support specialist`}
            loading="lazy"
            width="1200"
            height="900"
            className="h-full w-full object-cover object-center"
            decoding="async"
            initial={false}
            whileHover={reduceMotion ? undefined : { scale: 1.025 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B2348]/55 via-transparent to-transparent" />
          <div className="absolute inset-x-5 bottom-5 flex items-center justify-between gap-3 text-white">
            <span className="text-xs font-semibold">{isRtl ? 'دعم واضح قبل زيارتك' : 'Clear support before your visit'}</span>
            <span className="rounded-full border border-white/25 bg-[#0B2348]/55 px-3 py-1 text-xs font-bold backdrop-blur-md">{isRtl ? 'فريق المركز' : 'Center team'}</span>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-xl"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            {isRtl ? 'التواصل مع المركز' : 'Contact the center'}
          </span>
          <h2 className="mt-3 text-3xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-4xl">
            {isRtl ? 'هل تحتاج مساعدة قبل الزيارة؟' : 'Need help before your visit?'}
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
            {isRtl ? 'تواصل مع المركز لتأكيد الموقع والموعد وتعليمات التحضير الخاصة بطلب طبيبك.' : "Contact the center to confirm the location, appointment time, and preparation instructions for your doctor's request."}
          </p>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#365268] dark:text-slate-300">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />{isRtl ? 'تأكيد الموقع والموعد' : 'Location and time confirmation'}</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />{isRtl ? 'شرح التحضير قبل الموعد' : 'Preparation guidance'}</span>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {contactPhone && (
              <a href={`tel:${contactPhone.replace(/\s/g, '')}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark">
                <Phone className="h-4 w-4" />
                <span>{isRtl ? 'تحدث معنا' : 'Talk to our team'}</span>
                <span dir="ltr" className="text-white/80">{contactPhone}</span>
              </a>
            )}
            <button type="button" onClick={onBook} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#C9DDD8] bg-white px-5 text-sm font-bold text-[#0B2348] transition hover:border-primary/45 hover:text-primary dark:border-border dark:bg-surface dark:text-white">
              <CalendarCheck className="h-4 w-4 text-primary" />
              {isRtl ? 'احجز موعدك' : 'Book an appointment'}
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CareSupportBand;
