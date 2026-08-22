import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Quote, ShieldCheck, Star } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export const TestimonialsSection = () => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);

  const testimonials = [
    {
      name: isRtl ? 'أحمد الشناوي' : 'Ahmed El-Shennawy',
      role: isRtl ? 'مريض رنين مغناطيسي' : 'MRI patient',
      topic: isRtl ? 'تجربة هادئة وواضحة' : 'A calm, clear experience',
      quote: isRtl ? 'تجربة الفحص كانت مريحة للغاية، والكابينة واسعة. استلمت التقرير الرقمي والصور على هاتفي في نفس المساء.' : 'The scan felt calm and comfortable, and the wide-bore MRI made a real difference. My report and images arrived on my phone that evening.',
    },
    {
      name: isRtl ? 'مروة عبد الرحمن' : 'Marwa Abdelrahman',
      role: isRtl ? 'مريضة ماموجرام' : 'Mammography patient',
      topic: isRtl ? 'خصوصية واهتمام في كل خطوة' : 'Privacy and care at every step',
      quote: isRtl ? 'كل خطوة كانت واضحة ومنظمة. فريق الطبيبات تعامل بلطف واحترافية وشعرت بالخصوصية والاطمئنان طوال الزيارة.' : 'Every step was clear and organized. The female care team was gentle and professional, and I felt reassured throughout the visit.',
    },
    {
      name: isRtl ? 'د. محمود فهمي' : 'Dr. Mahmoud Fahmy',
      role: isRtl ? 'استشاري جراحة عظام' : 'Consultant orthopedic surgeon',
      topic: isRtl ? 'صور أوضح وقرار أسرع' : 'Clearer imaging, faster decisions',
      quote: isRtl ? 'وضوح صور الرنين وسهولة الوصول إلى الدراسة والتقرير يساعدانني على اتخاذ القرار العلاجي بسرعة وثقة.' : 'The imaging clarity and immediate access to the full study and report help me make clinical decisions quickly and confidently.',
    },
  ];

  const selectTestimonial = (nextIndex: number) => {
    setDirection(nextIndex > activeIndex ? 1 : -1);
    setActiveIndex((nextIndex + testimonials.length) % testimonials.length);
  };

  const move = (step: number) => {
    setDirection(step);
    setActiveIndex((current) => (current + step + testimonials.length) % testimonials.length);
  };

  useEffect(() => {
    if (paused || reduceMotion) return undefined;
    const timer = window.setInterval(() => {
      setDirection(1);
      setActiveIndex((current) => (current + 1) % 3);
    }, 7200);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion]);

  const active = testimonials[activeIndex];

  return (
    <section id="testimonials" className="overflow-hidden bg-white py-16 dark:bg-background sm:py-20 lg:py-24">
      <div
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div className="grid items-center gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16">
          <div>
            <span className="text-xs font-semibold text-primary">{isRtl ? 'آراء المرضى والأطباء' : 'Patient and physician stories'}</span>
            <h2 className="mt-2 max-w-md text-3xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-4xl">{isRtl ? 'تجارب نعتز بثقتها' : 'Experiences built on trust'}</h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
              {isRtl ? 'الرعاية الجيدة تظهر في التفاصيل التي يتذكرها المريض بعد انتهاء الزيارة.' : 'Good care is reflected in the details patients remember after their visit.'}
            </p>

            <div className="mt-8 hidden border-y border-[#E2ECE9] dark:border-border lg:block">
              {testimonials.map((testimonial, index) => (
                <button
                  key={testimonial.name}
                  type="button"
                  onClick={() => selectTestimonial(index)}
                  className={`flex w-full items-center gap-3 border-b border-[#E2ECE9] px-2 py-4 text-start transition last:border-b-0 dark:border-border ${index === activeIndex ? 'text-primary' : 'text-muted-foreground hover:text-[#0B2348] dark:hover:text-white'}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${index === activeIndex ? 'bg-primary text-white' : 'bg-[#EDF5F3] text-primary dark:bg-surface'}`}>{testimonial.name.charAt(0)}</span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-bold text-[#0B2348] dark:text-white">{testimonial.name}</strong>
                    <small className="mt-0.5 block text-[11px]">{testimonial.role}</small>
                  </span>
                  <span className={`ms-auto h-1.5 rounded-full bg-primary transition-all duration-500 ${index === activeIndex ? 'w-8 opacity-100' : 'w-1.5 opacity-25'}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="relative min-h-[390px] rounded-[24px] bg-[#EFF8F6] p-6 dark:bg-surface sm:min-h-[420px] sm:p-10 lg:p-12">
            <Quote className="absolute end-6 top-6 h-20 w-20 text-primary/10 sm:end-10 sm:top-9 sm:h-28 sm:w-28" aria-hidden="true" />
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.figure
                key={activeIndex}
                custom={direction}
                initial={reduceMotion ? false : { opacity: 0, x: direction * (isRtl ? -24 : 24) }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: direction * (isRtl ? 18 : -18) }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex min-h-[330px] flex-col justify-between sm:min-h-[340px]"
                aria-live="polite"
              >
                <div>
                  <div className="flex gap-1 text-amber-500" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-4 w-4 fill-current" />)}
                  </div>
                  <p className="mt-5 text-xs font-bold text-primary">{active.topic}</p>
                  <blockquote className="mt-4 max-w-2xl text-xl font-medium leading-[1.9] text-[#0B2348] dark:text-white sm:text-2xl lg:text-[26px]">“{active.quote}”</blockquote>
                </div>

                <figcaption className="mt-8 flex items-center gap-3 border-t border-primary/10 pe-24 pt-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold text-primary shadow-sm dark:bg-background">{active.name.charAt(0)}</span>
                  <span className="text-start">
                    <strong className="flex items-center gap-1.5 text-sm font-bold text-[#0B2348] dark:text-white">{active.name}<ShieldCheck className="h-3.5 w-3.5 text-primary" /></strong>
                    <small className="mt-1 block text-[11px] font-medium text-muted-foreground">{active.role}</small>
                  </span>
                  <span className="ms-auto text-xs font-semibold tabular-nums text-muted-foreground">{String(activeIndex + 1).padStart(2, '0')} / {String(testimonials.length).padStart(2, '0')}</span>
                </figcaption>
              </motion.figure>
            </AnimatePresence>

            <div className="absolute bottom-6 end-6 flex gap-2 sm:bottom-10 sm:end-10">
              <button type="button" onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/15 bg-white text-[#0B2348] transition hover:border-primary/45 hover:text-primary dark:bg-background dark:text-white" aria-label={isRtl ? 'الرأي السابق' : 'Previous story'}><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /></button>
              <button type="button" onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark" aria-label={isRtl ? 'الرأي التالي' : 'Next story'}><ArrowRight className="h-4 w-4 rtl:-scale-x-100" /></button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
