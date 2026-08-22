import { useState } from 'react';
import { CalendarCheck, MapPin, Phone, Clock, Navigation, Search } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePortalIdentity } from '../../../lib/portal-identity';
import { PortalBrand } from '../ui/PortalBrand';

export interface BranchInfo {
  id: string;
  nameAr: string;
  nameEn: string;
  region: 'cairo' | 'delta' | 'upper';
  addressAr: string;
  addressEn: string;
  phone: string;
  hoursAr: string;
  hoursEn: string;
  statusAr: string;
  statusEn: string;
  mapsUrl: string;
}

const BRANCHES: BranchInfo[] = [
  {
    id: 'downtown',
    nameAr: 'فرع وسط المدينة — المركز الرئيسي',
    nameEn: 'Downtown Diagnostic Hub (Flagship)',
    region: 'cairo',
    addressAr: '14 شارع الجمهورية، برج الرعاية الطبية، وسط البلد',
    addressEn: '14 Healthcare Tower, Downtown Medical Hub',
    phone: '+20 2 2450 1000',
    hoursAr: 'مفتوح 24/7 طوال أيام الأسبوع',
    hoursEn: 'Open 24/7 All Days',
    statusAr: 'مفتوح الآن 24 ساعة',
    statusEn: 'Open Now 24/7',
    mapsUrl: 'https://maps.google.com',
  },
  {
    id: 'zayed',
    nameAr: 'فرع الشيخ زايد وأكتوبر',
    nameEn: 'Sheikh Zayed & West Cairo Center',
    region: 'cairo',
    addressAr: 'ميدان جهينة، مول المعز الطبي، الشيخ زايد',
    addressEn: 'Juhayna Square, Al Moez Medical Mall, Sheikh Zayed',
    phone: '+20 2 3850 2000',
    hoursAr: 'السبت – الخميس: 8:00 ص – 11:00 م',
    hoursEn: 'Sat – Thu: 8:00 AM – 11:00 PM',
    statusAr: 'مفتوح اليوم',
    statusEn: 'Open Today',
    mapsUrl: 'https://maps.google.com',
  },
  {
    id: 'tagamoa',
    nameAr: 'فرع القاهرة الجديدة والتجمع',
    nameEn: 'New Cairo & Tagamoa Center',
    region: 'cairo',
    addressAr: 'شارع التسعين الشمالي، مجمع المستشفيات والمراكز التخصصية',
    addressEn: 'North 90th Street, Specialized Medical Zone',
    phone: '+20 2 2810 3000',
    hoursAr: 'يومياً: 8:00 ص – 12:00 منتصف الليل',
    hoursEn: 'Daily: 8:00 AM – 12:00 Midnight',
    statusAr: 'مفتوح اليوم',
    statusEn: 'Open Today',
    mapsUrl: 'https://maps.google.com',
  },
  {
    id: 'alex',
    nameAr: 'فرع الإسكندرية — سموحة',
    nameEn: 'Alexandria — Smouha Diagnostic Hub',
    region: 'delta',
    addressAr: 'طريق 14 مايو، أبراج سموحة الطبية',
    addressEn: '14th May Avenue, Smouha Medical Towers',
    phone: '+20 3 4200 100',
    hoursAr: 'يومياً: 8:30 ص – 10:30 م',
    hoursEn: 'Daily: 8:30 AM – 10:30 PM',
    statusAr: 'مفتوح اليوم',
    statusEn: 'Open Today',
    mapsUrl: 'https://maps.google.com',
  },
  {
    id: 'mansoura',
    nameAr: 'فرع المنصورة والدلتا',
    nameEn: 'Mansoura & Delta Diagnostic Hub',
    region: 'delta',
    addressAr: 'شارع المشاية السفلية، أمام حديقة شجرة الدر',
    addressEn: 'Lower Mashaya Street, Mansoura Center',
    phone: '+20 50 230 4000',
    hoursAr: 'السبت – الخميس: 9:00 ص – 10:00 م',
    hoursEn: 'Sat – Thu: 9:00 AM – 10:00 PM',
    statusAr: 'مفتوح اليوم',
    statusEn: 'Open Today',
    mapsUrl: 'https://maps.google.com',
  },
  {
    id: 'assiut',
    nameAr: 'فرع أسيوط والصعيد',
    nameEn: 'Assiut & Upper Egypt Hub',
    region: 'upper',
    addressAr: 'شارع الهلالي، مجمع الأطباء الاستشاريين',
    addressEn: 'Helaly Street, Consultants Medical Complex',
    phone: '+20 88 234 5000',
    hoursAr: 'يومياً: 9:00 ص – 9:00 م',
    hoursEn: 'Daily: 9:00 AM – 9:00 PM',
    statusAr: 'مفتوح اليوم',
    statusEn: 'Open Today',
    mapsUrl: 'https://maps.google.com',
  },
];

interface BranchDirectoryProps {
  onBookBranch?: (branchId: string) => void;
}

export const BranchDirectory = ({ onBookBranch }: BranchDirectoryProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const reduceMotion = useReducedMotion();
  const identity = usePortalIdentity();

  const [regionFilter, setRegionFilter] = useState<'all' | 'cairo' | 'delta' | 'upper'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('downtown');

  const filteredBranches = BRANCHES.filter((b) => {
    const matchesRegion = regionFilter === 'all' || b.region === regionFilter;
    const matchesSearch =
      !searchQuery ||
      b.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.addressAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.addressEn.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRegion && matchesSearch;
  });

  const selectedBranch = BRANCHES.find((b) => b.id === selectedBranchId) || BRANCHES[0];

  return (
    <section id="locations" className="bg-[#EFF8F6] py-16 dark:bg-background sm:py-20 lg:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary mb-3">
          <MapPin className="h-3.5 w-3.5" />
          <span>{isRtl ? 'فروع ومراكز فيارا' : 'Branch Network'}</span>
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          {isRtl ? 'ابحث عن أقرب فرع إليك' : 'Find Your Nearest Diagnostic Center'}
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          {isRtl
            ? 'فروع متكاملة مجهزة بأحدث أجهزة الرنين والمقطعية في القاهرة والمحافظات.'
            : 'Explore our modern diagnostic locations across Cairo, Alexandria, Delta, and Upper Egypt.'}
        </p>
      </div>

      {/* 55% Map / 45% Searchable Branch Panel */}
      <div className="grid gap-7 lg:grid-cols-12 lg:gap-10">
        {/* 55% Visual Map Column */}
        <motion.div
          initial={false}
          whileHover={reduceMotion ? undefined : { scale: 1.003 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7 relative rounded-2xl overflow-hidden min-h-[380px] lg:min-h-[500px] border border-border/80 bg-canvas"
        >
          <motion.img
            src="/images/viara-branch-map-v2.jpg"
            alt={`${identity.center.name} branch network map`}
            className="h-full w-full object-cover"
            decoding="async"
            animate={reduceMotion ? undefined : { scale: selectedBranchId === 'downtown' ? 1 : 1.025 }}
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

          {/* Map Overlay Badge */}
          <div className="absolute bottom-5 inset-x-5 bg-surface/92 backdrop-blur-md rounded-2xl p-4 border border-border shadow-lg flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedBranch.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-xs font-black text-primary uppercase tracking-wider">
                {isRtl ? selectedBranch.statusAr : selectedBranch.statusEn}
              </p>
              <h4 className="text-sm font-extrabold text-foreground mt-0.5">
                {isRtl ? selectedBranch.nameAr : selectedBranch.nameEn}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isRtl ? selectedBranch.addressAr : selectedBranch.addressEn}
              </p>
            </motion.div>
            </AnimatePresence>
            <div className="flex shrink-0 gap-2">
              <a href={selectedBranch.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs font-bold text-foreground transition hover:border-primary/40 hover:text-primary">
                <Navigation className="h-3.5 w-3.5" />
                <span>{isRtl ? 'الاتجاهات' : 'Directions'}</span>
              </a>
              <button type="button" onClick={() => onBookBranch?.(selectedBranch.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-primary-dark">
                <CalendarCheck className="h-3.5 w-3.5" />
                <span>{isRtl ? 'احجز' : 'Book'}</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* 45% Searchable Branch Panel Column */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          {/* Region Tabs */}
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setRegionFilter('all')}
              className={`rounded-lg py-2 transition cursor-pointer ${
                regionFilter === 'all' ? 'bg-surface text-primary shadow-sm font-black' : 'text-muted-foreground'
              }`}
            >
              {isRtl ? 'الكل' : 'All'}
            </button>
            <button
              type="button"
              onClick={() => setRegionFilter('cairo')}
              className={`rounded-lg py-2 transition cursor-pointer ${
                regionFilter === 'cairo' ? 'bg-surface text-primary shadow-sm font-black' : 'text-muted-foreground'
              }`}
            >
              {isRtl ? 'القاهرة' : 'Cairo'}
            </button>
            <button
              type="button"
              onClick={() => setRegionFilter('delta')}
              className={`rounded-lg py-2 transition cursor-pointer ${
                regionFilter === 'delta' ? 'bg-surface text-primary shadow-sm font-black' : 'text-muted-foreground'
              }`}
            >
              {isRtl ? 'الدلتا' : 'Delta'}
            </button>
            <button
              type="button"
              onClick={() => setRegionFilter('upper')}
              className={`rounded-lg py-2 transition cursor-pointer ${
                regionFilter === 'upper' ? 'bg-surface text-primary shadow-sm font-black' : 'text-muted-foreground'
              }`}
            >
              {isRtl ? 'الصعيد' : 'Upper'}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'ابحث باسم الفرع أو المنطقة...' : 'Search branch or street...'}
              className="w-full rounded-xl border border-input bg-surface ps-10 pe-4 py-2 text-xs font-semibold text-foreground outline-none transition focus:border-primary"
            />
          </div>

          {/* Branch List */}
          <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2.5 pe-1">
            {filteredBranches.map((branch) => {
              const isSelected = branch.id === selectedBranchId;
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
                      {isRtl ? branch.nameAr : branch.nameEn}
                    </h4>
                    <span className="shrink-0 rounded-md bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-black uppercase">
                      {isRtl ? branch.statusAr : branch.statusEn}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {isRtl ? branch.addressAr : branch.addressEn}
                  </p>

                  <p className="mt-2 text-[10px] font-semibold text-primary">MRI · CT · Digital X-Ray</p>

                  <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-border/60">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>{isRtl ? branch.hoursAr : branch.hoursEn}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        <span>{isRtl ? 'اتصل' : 'Call'}</span>
                      </a>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {filteredBranches.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-surface/70 px-5 py-10 text-center text-sm text-muted-foreground">
                {isRtl ? 'لا توجد فروع مطابقة. جرّب منطقة أو عبارة بحث أخرى.' : 'No matching centers. Try another region or search term.'}
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
