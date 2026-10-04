import { useState } from 'react';
import { CalendarCheck, MapPin, Phone, Clock, Navigation, Search } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLandingContent } from '../../../hooks/use-landing-content';
import { PortalBrand } from '../ui/PortalBrand';
import { LandingSectionSkeleton } from './LandingStates';

/**
 * Branch directory driven exclusively by real center settings
 * (resolvePortalBranches). When the backend has no branch/location data the
 * section hides itself instead of showing invented addresses, phone numbers,
 * or opening hours.
 */
interface BranchDirectoryProps {
  onBookBranch?: (branchId: string) => void;
  heading?: string;
  subheading?: string;
}

export const BranchDirectory = ({ onBookBranch, heading, subheading }: BranchDirectoryProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const reduceMotion = useReducedMotion();
  const { branches, isLoading, identity } = useLandingContent();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Keep the layout stable with a skeleton while settings load.
  if (isLoading) {
    return (
      <section id="locations" className="bg-[#EFF8F6] py-16 dark:bg-background sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LandingSectionSkeleton rows={2} minHeight="min-h-[420px]" />
        </div>
      </section>
    );
  }

  if (!branches.length) return null;

  const filteredBranches = branches.filter((branch) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      branch.name.toLowerCase().includes(query) ||
      branch.address.toLowerCase().includes(query) ||
      branch.tag.toLowerCase().includes(query)
    );
  });

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
  const telHref = selectedBranch.phone ? `tel:${selectedBranch.phone.replace(/[^\d+]/g, '')}` : '';

  return (
    <section id="locations" className="bg-[#EFF8F6] py-16 dark:bg-background sm:py-20 lg:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary mb-3">
          <MapPin className="h-3.5 w-3.5" />
          <span>{isRtl ? 'مواقعنا' : 'Our Locations'}</span>
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          {heading ||
            (branches.length > 1
              ? isRtl
                ? 'ابحث عن أقرب مركز إليك'
                : 'Find Your Nearest Center'
              : isRtl
                ? 'موقعنا'
                : 'Our Location')}
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          {subheading ||
            (isRtl
              ? 'بيانات المواقع وأوقات العمل وأرقام التواصل مباشرة من سجلات المركز.'
              : 'Location details, working hours, and contact numbers come straight from the center records.')}
        </p>
      </div>

      <div className={`grid gap-7 lg:gap-10 ${branches.length > 1 ? 'lg:grid-cols-12' : ''}`}>
        {/* Location visual column */}
        <motion.div
          initial={false}
          whileHover={reduceMotion ? undefined : { scale: 1.003 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={`${branches.length > 1 ? 'lg:col-span-7' : ''} relative rounded-2xl overflow-hidden min-h-[380px] lg:min-h-[500px] border border-border/80 bg-canvas`}
        >
          <motion.img
            src="/images/viara-branch-map-v2.jpg"
            alt={`${identity.center.name} ${branches.length > 1 ? 'locations map' : 'location'}`}
            loading="lazy"
            width="1200"
            height="900"
            className="h-full w-full object-cover"
            decoding="async"
            initial={false}
            animate={reduceMotion ? undefined : { scale: selectedBranchId ? 1.025 : 1 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-deep/80 via-transparent to-transparent pointer-events-none" />

          <div className="absolute start-5 top-5 flex items-center gap-2.5 rounded-xl border border-white/70 bg-white/88 px-3 py-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-surface/88">
            <PortalBrand
              isRtl={isRtl}
              showSubtitle={false}
              logoClassName="h-8 w-8 text-sm"
              textClassName="hidden max-w-[9rem] sm:block"
              nameClassName="text-xs"
            />
          </div>

          {/* Selected location overlay */}
          <div className="absolute bottom-5 inset-x-5 bg-surface/92 backdrop-blur-md rounded-2xl p-4 border border-border shadow-lg flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedBranch.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="min-w-0"
            >
              {selectedBranch.tag && (
                <p className="text-xs font-black text-primary uppercase tracking-wider">
                  {selectedBranch.tag}
                </p>
              )}
              <h4 className="text-sm font-extrabold text-foreground mt-0.5">
                {selectedBranch.name}
              </h4>
              {selectedBranch.address && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedBranch.address}
                </p>
              )}
            </motion.div>
            </AnimatePresence>
            <div className="flex shrink-0 gap-2">
              {selectedBranch.mapsUrl && (
                <a
                  href={selectedBranch.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs font-bold text-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  <span>{isRtl ? 'الاتجاهات' : 'Directions'}</span>
                </a>
              )}
              <button type="button" onClick={() => onBookBranch?.(selectedBranch.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-primary-dark">
                <CalendarCheck className="h-3.5 w-3.5" />
                <span>{isRtl ? 'احجز' : 'Book'}</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Branch list column */}
        <div className={`${branches.length > 1 ? 'lg:col-span-5' : ''} flex flex-col space-y-4`}>
          {branches.length > 1 && (
            <div className="relative">
              <label htmlFor="branch-search" className="sr-only">{isRtl ? 'ابحث باسم الفرع أو المنطقة' : 'Search branch or area'}</label>
              <Search className="absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                id="branch-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRtl ? 'ابحث باسم الفرع أو المنطقة...' : 'Search branch or area...'}
                aria-label={isRtl ? 'ابحث باسم الفرع أو المنطقة' : 'Search branch or area'}
                className="w-full rounded-xl border border-input bg-surface ps-10 pe-4 py-2 text-xs font-semibold text-foreground outline-none transition focus:border-primary"
              />
            </div>
          )}

          <div className="flex-1 space-y-2.5 pe-1">
            {filteredBranches.map((branch) => {
              const isSelected = branch.id === selectedBranch.id;
              const branchTel = branch.phone ? `tel:${branch.phone.replace(/[^\d+]/g, '')}` : '';
              return (
                <motion.div
                  key={branch.id}
                  onClick={() => setSelectedBranchId(branch.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedBranchId(branch.id);
                  }}
                  role="button"
                  tabIndex={0}
                  layout
                  whileHover={reduceMotion ? undefined : { x: isRtl ? -2 : 2 }}
                  className={`rounded-xl border p-4 transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary-soft/40 shadow-sm ring-1 ring-primary/30'
                      : 'border-border bg-surface hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-foreground">
                      {branch.name}
                    </h4>
                    {branch.tag && (
                      <span className="shrink-0 rounded-md bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 px-2 py-0.5 text-xs font-black uppercase">
                        {branch.tag}
                      </span>
                    )}
                  </div>

                  {branch.address && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {branch.address}
                    </p>
                  )}

                  {branch.modalities.length > 0 && (
                    <p className="mt-2 text-xs font-semibold text-primary">
                      {branch.modalities.join(' · ')}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-border/60">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>{branch.hours || (isRtl ? 'راجع أوقات العمل مع فريق الحجز' : 'Confirm hours with the booking team')}</span>
                    </div>

                    {branchTel && (
                      <a
                        href={branchTel}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        <span>{isRtl ? 'اتصل' : 'Call'}</span>
                      </a>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {filteredBranches.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-surface/70 px-5 py-10 text-center text-sm text-muted-foreground">
                {isRtl ? 'لا توجد فروع مطابقة. جرّب عبارة بحث أخرى.' : 'No matching centers. Try another search term.'}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
};

export default BranchDirectory;
