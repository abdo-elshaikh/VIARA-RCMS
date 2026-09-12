import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Quote, ShieldCheck, Star } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLandingContent } from '../../../hooks/use-landing-content';
import { LandingSectionSkeleton } from './LandingStates';

/**
 * Renders only real, curated testimonials provided through homepage_settings.
 * There is no built-in fallback content: fabricated patient stories are a
 * trust and legal hazard for a medical business, so the whole section hides
 * itself when nothing is configured.
 */
export const TestimonialsSection = () => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const reduceMotion = useReducedMotion();
  const { testimonials, isLoading } = useLandingContent();
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  // Real data can arrive after mount — keep the index inside bounds.
  useEffect(() => {
    if (activeIndex >= testimonials.length) {
      setActiveIndex(0);
      setDirection(1);
    }
  }, [testimonials.length, activeIndex]);

  // Skeleton while settings load; once loaded, an empty curated list hides
  // the section by design (no fabricated testimonials).
  if (isLoading) {
    return (
      <section id="testimonials" className="bg-white py-16 dark:bg-background sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingSectionSkeleton rows={1} minHeight="min-h-[260px]" />
        </div>
      </section>
    );
  }

  if (!testimonials.length) return null;

  const count = testimonials.length;

  const selectTestimonial = (nextIndex: number) => {
    setDirection(nextIndex > activeIndex ? 1 : -1);
    setActiveIndex((nextIndex + count) % count);
  };

  const move = (step: number) => {
    setDirection(step);
    setActiveIndex((current) => (current + step + count) % count);
  };

  const active = testimonials[activeIndex];

  return (
    <section id="testimonials" className="overflow-hidden bg-white py-16 dark:bg-background sm:py-20 lg:py-24">
      <div
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        <div className="grid items-center gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16">
          <div>
            <span className="text-xs font-semibold text-primary">{isRtl ? 'آراء المرضى والأطباء' : 'Patient and physician stories'}</span>
            <h2 className="mt-2 max-w-md text-3xl font-bold leading-tight text-[#0B2348] dark:text-white sm:text-4xl">{isRtl ? 'تجارب نعتز بثقتها' : 'Experiences built on trust'}</h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
              {isRtl ? 'آراء حقيقية تشاركها تجارب مرضانا وأطبائنا المعالجين.' : 'Real feedback shared by our patients and treating physicians.'}
            </p>

            <div className="mt-8 hidden border-y border-[#E2ECE9] dark:border-border lg:block">
              {testimonials.map((testimonial, index) => (
                <button
                  key={testimonial.name}
                  type="button"
                  onClick={() => selectTestimonial(index)}
                  className={`flex w-full items-center gap-3 border-b border-[#E2ECE9] px-2 py-4 text-start transition last:border-b-0 dark:border-border ${index === activeIndex ? 'text-primary' : 'text-muted-foreground hover:text-[#0B2348] dark:hover:text-white'}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                    {testimonial.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-bold">{testimonial.name}</strong>
                    {testimonial.role && <small className="block truncate text-xs text-muted-foreground">{testimonial.role}</small>}
                  </span>
                  {index === activeIndex && <ArrowRight className="ms-auto h-4 w-4 shrink-0 rtl:-scale-x-100" />}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Quote className="absolute -top-3 end-2 h-16 w-16 text-primary/10" aria-hidden="true" />
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.figure
                key={activeIndex}
                custom={direction}
                initial={reduceMotion ? false : { opacity: 0, x: isRtl ? -28 : 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: isRtl ? 28 : -28 }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-2xl border border-[#E2ECE9] bg-gradient-to-br from-white to-[#F6FBF9] p-7 shadow-sm dark:border-border dark:from-surface dark:to-background sm:p-9"
              >
                {typeof active.rating === 'number' ? (
                  <div className="flex items-center gap-1" aria-label={`${active.rating} / 5`}>
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <Star
                        key={starIndex}
                        className={`h-4 w-4 ${starIndex < (active.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                      />
                    ))}
                  </div>
                ) : (
                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                )}
                <blockquote className="mt-4 text-lg font-medium leading-8 text-[#0B2348] dark:text-white sm:text-xl sm:leading-9">
                  “{active.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-[#E2ECE9] pt-5 dark:border-border">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary lg:hidden">
                    {active.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
                  </span>
                  <span>
                    <strong className="block text-sm font-bold text-[#0B2348] dark:text-white">{active.name}</strong>
                    {active.role && <small className="block text-xs font-medium text-muted-foreground">{active.role}</small>}
                  </span>
                </figcaption>
              </motion.figure>
            </AnimatePresence>

            {count > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="flex gap-2" role="tablist" aria-label={isRtl ? 'اختر التجربة' : 'Select a story'}>
                  {testimonials.map((testimonial, index) => (
                    <button
                      key={`dot-${testimonial.name}`}
                      type="button"
                      role="tab"
                      aria-selected={index === activeIndex}
                      aria-label={testimonial.name}
                      onClick={() => selectTestimonial(index)}
                      className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-primary' : 'w-2 bg-primary/25 hover:bg-primary/45'}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => move(-1)}
                    aria-label={isRtl ? 'التالي' : 'Previous'}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2ECE9] bg-white text-[#0B2348] transition hover:border-primary/40 hover:text-primary dark:border-border dark:bg-surface dark:text-white"
                  >
                    <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(1)}
                    aria-label={isRtl ? 'السابق' : 'Next'}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2ECE9] bg-white text-[#0B2348] transition hover:border-primary/40 hover:text-primary dark:border-border dark:bg-surface dark:text-white"
                  >
                    <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
