import { Cpu, FileText, MapPin, Stethoscope } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePortalIdentity } from '../../../lib/portal-identity';

export const WhyViaraSection = () => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const reduceMotion = useReducedMotion();
  const identity = usePortalIdentity();
  const centerName = identity.center.name || (isRtl ? 'مركز الأشعة' : 'Radiology Center');

  const reasons = [
    { icon: Stethoscope, titleAr: 'استشاريون متخصصون', titleEn: 'Specialist consultants', descAr: 'مراجعة دقيقة لكل فحص وربط النتائج بالسياق الطبي.', descEn: 'Careful review of each exam within its clinical context.' },
    { icon: Cpu, titleAr: 'تقنيات تصوير متقدمة', titleEn: 'Advanced imaging', descAr: 'تفاصيل أوضح مع بروتوكولات تراعي الراحة والأمان.', descEn: 'Clearer detail with protocols built around comfort and safety.' },
    { icon: FileText, titleAr: 'نتائج رقمية في مكان واحد', titleEn: 'Digital results in one place', descAr: 'التقرير والصور متاحان بأمان للمريض والطبيب.', descEn: 'Secure reports and images for both patient and physician.' },
    { icon: MapPin, titleAr: 'رعاية أقرب إليك', titleEn: 'Care closer to you', descAr: 'فروع متعددة وخيارات حجز ووصول أكثر سهولة.', descEn: 'Multiple centers with simpler booking and access.' },
  ];

  const facts = [
    { value: '3.0T', ar: 'رنين عالي المجال', en: 'High-field MRI' },
    { value: '128', ar: 'شريحة مقطعية', en: 'CT slices' },
    { value: '24/7', ar: 'دعم المركز الرئيسي', en: 'Flagship support' },
    { value: 'DICOM', ar: 'صور وتقارير رقمية', en: 'Digital studies' },
  ];

  return (
    <section id="why-viara" className="bg-[#F2F8FB] py-16 dark:bg-[#0A1729] sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14" dir="ltr">
          <motion.div
            whileHover={reduceMotion ? undefined : { scale: 1.005 }}
            transition={{ duration: 0.3 }}
            className="relative min-h-[420px] overflow-hidden rounded-[28px]"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <img src="/images/viara-doctor-patient.jpg" alt="Radiologist speaking with a patient" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B2348]/72 via-transparent to-transparent" />
            <p className="absolute bottom-6 inset-x-6 max-w-sm text-sm font-semibold leading-7 text-white">
              {isRtl ? 'الوضوح التشخيصي يبدأ من التقنية، ويكتمل بخبرة الطبيب واهتمام الفريق.' : 'Diagnostic clarity starts with technology and is completed by medical expertise and attentive care.'}
            </p>
          </motion.div>

          <div dir={isRtl ? 'rtl' : 'ltr'}>
            <span className="text-xs font-semibold text-primary">
              {isRtl ? `لماذا ${centerName}؟` : `Why ${centerName}?`}
            </span>
            <h2 className="mt-2 max-w-xl text-3xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-4xl">
              {isRtl ? <>دقة تبدأ من التقنية،<span className="block">وتكتمل بخبرة الطبيب.</span></> : <>Technology brings detail.<span className="block">Medical expertise brings meaning.</span></>}
            </h2>
            <p className="mt-4 max-w-xl text-sm font-normal leading-7 text-muted-foreground">
              {isRtl ? 'نصمم التجربة كاملة حول سؤال واحد: كيف نمنح المريض وطبيبه إجابة أوضح بأقل قدر من القلق والانتظار؟' : 'Every part of the experience answers one question: how can we give patients and physicians clearer answers with less anxiety and delay?'}
            </p>

            <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {reasons.map((reason) => {
                const Icon = reason.icon;
                return (
                  <motion.div key={reason.titleEn} whileHover={reduceMotion ? undefined : { x: isRtl ? -2 : 2 }} transition={{ duration: 0.2 }} className="flex gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary dark:bg-surface"><Icon className="h-[18px] w-[18px]" /></span>
                    <div>
                      <h3 className="text-sm font-bold text-[#0B2348] dark:text-white">{isRtl ? reason.titleAr : reason.titleEn}</h3>
                      <p className="mt-1 text-xs font-normal leading-6 text-muted-foreground">{isRtl ? reason.descAr : reason.descEn}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 border-y border-[#DCE8E8] py-6 sm:grid-cols-4 dark:border-border">
          {facts.map((fact, index) => (
            <div key={fact.value} className={`px-3 text-center ${index > 0 ? 'border-s border-[#DCE8E8] dark:border-border' : ''}`}>
              <strong className="block text-2xl font-bold text-[#0B2348] dark:text-white sm:text-3xl">{fact.value}</strong>
              <span className="mt-1 block text-[11px] font-medium text-muted-foreground">{isRtl ? fact.ar : fact.en}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyViaraSection;
