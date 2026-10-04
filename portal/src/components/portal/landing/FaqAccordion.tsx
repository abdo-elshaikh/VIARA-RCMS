import { useState } from 'react';
import { ChevronDown, HelpCircle, Phone } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLandingContent } from '../../../hooks/use-landing-content';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS_EN: FaqItem[] = [
  {
    q: 'How should I prepare for my MRI scan?',
    a: 'Preparation depends on the type of MRI and whether contrast is planned. Follow the instructions sent with your appointment, remove metal items before the scan, and tell the team about implants, pregnancy, or claustrophobia in advance.',
  },
  {
    q: 'When will my diagnostic report be ready?',
    a: 'Turnaround varies by exam type and clinical priority. Your appointment confirmation will show the expected timing, and the report will appear in the patient portal as soon as it is reviewed and signed.',
  },
  {
    q: 'Can I view and download my imaging studies online?',
    a: 'Available reports and imaging studies can be opened securely through the patient portal. Your treating physician can also access shared studies when the appropriate permissions are provided.',
  },
  {
    q: 'How can I confirm whether a home service is available?',
    a: 'Home-service availability depends on the center, examination, and location. Submit an appointment request or contact the center to confirm whether the requested service covers your area.',
  },
  {
    q: 'Are examinations covered by health insurance?',
    a: 'Coverage depends on your insurer, plan, examination, and approval requirements. Share your insurance details before the visit so the center can confirm eligibility and any documents you may need.',
  },
];

const FAQS_AR: FaqItem[] = [
  {
    q: 'كيف أتحضر لفحص الرنين المغناطيسي؟',
    a: 'يختلف التحضير حسب نوع الفحص والحاجة إلى الصبغة. اتبع التعليمات المرسلة مع الموعد، وانزع المقتنيات المعدنية، وأبلغ الفريق مسبقاً عن أي أجهزة مزروعة أو حمل أو شعور بضيق الأماكن.',
  },
  {
    q: 'متى يمكنني استلام التقرير الطبي؟',
    a: 'تختلف مدة إصدار التقرير حسب نوع الفحص والأولوية الطبية. يظهر الوقت المتوقع مع تأكيد الموعد، ويتاح التقرير في بوابة المريض فور مراجعته واعتماده.',
  },
  {
    q: 'هل يمكنني الاطلاع على صور الأشعة أونلاين؟',
    a: 'يمكن فتح التقارير والصور المتاحة بأمان من خلال بوابة المريض، كما يمكن مشاركة الدراسة مع الطبيب المعالج بعد منح الصلاحيات المناسبة.',
  },
  {
    q: 'كيف أتأكد من توفر خدمة منزلية؟',
    a: 'يعتمد توفر الخدمة المنزلية على المركز ونوع الفحص والمنطقة. أرسل طلب موعد أو تواصل مع المركز للتأكد من تغطية الخدمة المطلوبة لموقعك.',
  },
  {
    q: 'هل يغطي التأمين الصحي تكلفة الفحص؟',
    a: 'تختلف التغطية حسب شركة التأمين والبرنامج ونوع الفحص ومتطلبات الموافقة. أرسل بيانات التأمين قبل الزيارة ليتحقق المركز من التغطية والمستندات المطلوبة.',
  },
];

interface FaqAccordionProps {
  heading?: string;
  subheading?: string;
}

export const FaqAccordion = ({ heading, subheading }: FaqAccordionProps = {}) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const reduceMotion = useReducedMotion();
  const { faqs: managedFaqs, contactPhone } = useLandingContent();
  // Curated FAQs from homepage_settings win; otherwise the built-in generic,
  // carefully hedged guidance is used. No fabricated operational claims.
  const faqs = managedFaqs.length ? managedFaqs : (isRtl ? FAQS_AR : FAQS_EN);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-[#F7FAFA] py-16 dark:bg-surface sm:py-20 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16 lg:px-8">
        <div>
          <div className="lg:sticky lg:top-28">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
              <HelpCircle className="h-4 w-4" />
              {isRtl ? 'إرشادات المريض' : 'Patient guidance'}
            </span>
            <h2 className="mt-3 max-w-md text-3xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-4xl">
              {heading || (isRtl ? 'إجابات واضحة قبل زيارتك' : 'Clear answers before your visit')}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
              {subheading ||
                (isRtl
                  ? 'معلومات أساسية حول التحضير والنتائج والخدمات المنزلية والتأمين.'
                  : 'Essential information about preparation, results, home services, and insurance.')}
            </p>

            <div className="mt-8 border-t border-[#DCE8E5] pt-6 dark:border-border">
              <span className="block text-xs text-muted-foreground">{isRtl ? 'هل لديك سؤال آخر؟' : 'Still have a question?'}</span>
              {contactPhone ? (
                <a href={`tel:${contactPhone.replace(/\s/g, '')}`} className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[#0B2348] transition hover:text-primary dark:text-white">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E7F5F1] text-primary dark:bg-primary-soft"><Phone className="h-4 w-4" /></span>
                  <span>{isRtl ? 'تحدث مع فريق الدعم' : 'Talk to patient support'}</span>
                  <span dir="ltr" className="text-primary">{contactPhone}</span>
                </a>
              ) : (
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  {isRtl ? 'تواصل معنا من صفحة الاتصال وسنجيب على استفساراتك.' : 'Reach us from the contact details below and we will answer your questions.'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-y border-[#DCE8E5] dark:border-border">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const answerId = `faq-answer-${index}`;
            return (
              <div key={faq.q} className="border-b border-[#DCE8E5] last:border-b-0 dark:border-border">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                  className="group flex w-full items-center gap-4 py-5 text-start sm:py-6"
                >
                  <span className={`text-xs font-bold tabular-nums transition-colors ${isOpen ? 'text-primary' : 'text-muted-foreground'}`}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={`flex-1 text-sm font-bold transition-colors sm:text-base ${isOpen ? 'text-primary' : 'text-[#0B2348] group-hover:text-primary dark:text-white'}`}>{faq.q}</span>
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25 }} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${isOpen ? 'bg-primary text-white' : 'bg-white text-muted-foreground dark:bg-background'}`}>
                    <ChevronDown className="h-4 w-4" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={answerId}
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 ps-9 pe-12 text-sm leading-7 text-muted-foreground sm:pe-16">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FaqAccordion;
