import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Phone, ArrowUpRight, ArrowRight, ShieldCheck, Clock, MapPin, CalendarCheck, UserRound, Stethoscope } from 'lucide-react';

import LanguageToggle from '../../ui/LanguageToggle';
import ThemeToggle from '../../ui/ThemeToggle';

interface PortalHeaderProps {
  navLinks?: Array<{ label: string; href: string }>;
  portalType?: string;
  center?: Record<string, any> | null;
  text?: Record<string, any>;
  isRtl?: boolean;
  onBook?: () => void;
}

export const PortalHeader = ({ navLinks = [], portalType = 'public', center, text, isRtl = false, onBook }: PortalHeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeHref, setActiveHref] = useState(navLinks[0]?.href || '#main-content');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const updateScrollState = () => {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setScrolled(window.scrollY > 12);
      setScrollProgress(Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)));
      scrollFrameRef.current = null;
    };
    const onScroll = () => {
      if (scrollFrameRef.current === null) scrollFrameRef.current = window.requestAnimationFrame(updateScrollState);
    };
    updateScrollState();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const sectionLinks = navLinks
      .filter(({ href }) => href?.startsWith('#'))
      .map(({ href }) => ({ href, element: document.querySelector<HTMLElement>(href) }))
      .filter((item): item is { href: string; element: HTMLElement } => Boolean(item.element))
      .sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);
    if (!sectionLinks.length) return undefined;

    const updateActiveSection = () => {
      const marker = window.scrollY + 170;
      let current = sectionLinks[0].href;
      sectionLinks.forEach(({ href, element }) => {
        if (element.getBoundingClientRect().top + window.scrollY <= marker) current = href;
      });
      setActiveHref(current);
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, [navLinks]);

  useEffect(() => {
    if (!menuOpen) return;
    const getFocusable = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || []);
    getFocusable()[0]?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => { if (event.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const centerName = [center?.center_name, center?.branch_name].filter(Boolean).join(' · ') || center?.name || 'RCMS Radiology';
  const initials = String(center?.center_name || center?.initials || 'RCMS').trim().slice(0, 4).toUpperCase();
  const logo = center?.logo_url || center?.logoUrl;
  const hotline = center?.phone || '19144';
  const address = center?.address || '';
  const configuredStart = Number(center?.working_hours?.start);
  const configuredEnd = Number(center?.working_hours?.end);
  const hoursStart = Number.isFinite(configuredStart) ? configuredStart : 6;
  const hoursEnd = Number.isFinite(configuredEnd) ? configuredEnd : 22;
  const workingHours = `${String(hoursStart).padStart(2, '0')}:00–${String(hoursEnd).padStart(2, '0')}:00`;
  const isPublic = portalType === 'public';

  const openBooking = () => {
    setMenuOpen(false);
    if (onBook) onBook();
    else document.querySelector('#book')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="portal-site-header fixed inset-x-0 top-0 z-50 font-sans transition-all duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className={`portal-header-utility overflow-hidden border-b px-4 text-xs transition-all duration-300 sm:px-6 lg:px-8 ${scrolled ? 'max-h-0 border-transparent py-0 opacity-0' : 'max-h-12 py-2 opacity-100'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <a href={`tel:${hotline}`} className="portal-header-hotline group flex min-w-0 items-center gap-2 font-bold transition-colors">
              <span className="portal-header-hotline-label flex h-5 shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider shadow-sm">
                <Phone className="h-3 w-3" />
                {isRtl ? 'الخط الساخن' : 'Hotline'}
              </span>
              <span className="portal-header-hotline-number truncate font-mono text-sm tracking-wider" dir="ltr">{hotline}</span>
            </a>
            <span className="portal-header-meta hidden items-center gap-2 text-[10px] font-semibold md:flex">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
              <Clock className="h-3.5 w-3.5" />
              <span>{isRtl ? 'مفتوح يومياً' : 'Open daily'}</span><b dir="ltr" className="font-bold text-white">{workingHours}</b>
            </span>
          </div>

          <div className="portal-header-controls flex shrink-0 items-center gap-2 sm:gap-3">
            <a href={address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '/#locations'} target={address ? '_blank' : undefined} rel={address ? 'noreferrer' : undefined} className="portal-header-meta hidden items-center gap-1.5 text-[10px] font-semibold transition hover:text-white lg:flex">
              <MapPin className="h-3.5 w-3.5" />
              <span className="max-w-52 truncate">{address || (isRtl ? 'اعثر على أقرب مركز' : 'Find your nearest center')}</span>
            </a>
            <div className="portal-header-divider hidden h-4 w-px sm:block" />
            <ThemeToggle variant="dark" className="portal-header-theme-toggle !h-8 !w-8 !rounded-lg" />
            <LanguageToggle variant="dark" className="portal-header-language-toggle !h-8 !rounded-lg !px-2.5" />
          </div>
        </div>
      </div>

      <nav
        className={`portal-header-nav border-b transition-all duration-300 ${scrolled
            ? 'portal-header-nav--scrolled shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:shadow-slate-950/40'
            : 'backdrop-blur-md'
          }`}
        aria-label={text?.primaryNav || 'Primary navigation'}
      >
        <div className={`mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-[height] duration-300 sm:px-6 lg:px-8 ${scrolled ? 'h-14' : 'h-16'}`}>
          <Link to="/" className="group flex min-w-0 items-center gap-3">
            <span className={`portal-header-brand-mark relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/60 bg-white text-[11px] font-black text-[#082761] shadow-md transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg dark:border-white/15 ${scrolled ? 'h-9 w-9' : 'h-11 w-11'}`}>
              {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" /> : initials}
            </span>
            <span className="min-w-0 text-left rtl:text-right">
              <bdi className="portal-header-brand-name block max-w-52 truncate font-sans text-sm font-black tracking-tight transition-colors xl:max-w-60">{centerName}</bdi>
              <span className="portal-header-brand-subtitle mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                <ShieldCheck className="h-3 w-3" />
                {text?.brandSuffix || (isRtl ? 'مراكز الأشعة والتشخيص المعتمدة' : 'Diagnostic Centers')}
              </span>
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden items-center gap-0.5 lg:flex">
            {navLinks.map((link) => {
              const active = activeHref === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'location' : undefined}
                  className={`portal-header-nav-link group relative rounded-lg px-2 py-2 text-[10.5px] font-extrabold transition-all xl:px-2.5 xl:text-[11px] ${active ? 'is-active' : ''}`}
                >
                  <span>{link.label}</span>
                  <span className={`absolute inset-x-2 -bottom-1.5 mx-auto h-0.5 rounded-full bg-[#075cb7] transition-all duration-200 ${active ? 'w-[calc(100%-1rem)] opacity-100' : 'w-0 opacity-0 group-hover:w-4 group-hover:opacity-100'}`} aria-hidden="true" />
                </a>
              );
            })}
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            {isPublic && <button type="button" onClick={openBooking} aria-label={isRtl ? 'احجز موعداً' : 'Book appointment'} className="portal-header-book inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-[10.5px] font-extrabold text-white shadow-md transition hover:-translate-y-0.5 xl:px-4"><CalendarCheck className="h-4 w-4" /><span className="hidden xl:inline">{isRtl ? 'احجز موعداً' : 'Book appointment'}</span></button>}
            <div className="portal-header-portal-group flex items-center gap-0.5 rounded-xl border p-1">
              <Link
                to="/patient/login"
                aria-label={text?.patientPortal || 'Patient Portal'}
                title={text?.patientPortal || (isRtl ? 'بوابة المرضى' : 'Patient Portal')}
                className="portal-header-portal-link inline-flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-[10px] font-extrabold transition xl:px-3"
              >
                <UserRound className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{text?.patientPortal || (isRtl ? 'المرضى' : 'Patients')}</span>
              </Link>
              {isPublic && <span className="h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />}
              {isPublic && (
                <Link
                  to="/doctor/login"
                  aria-label={text?.doctorPortal || 'Doctor Portal'}
                  title={text?.doctorPortal || (isRtl ? 'بوابة الأطباء' : 'Doctor Portal')}
                  className="portal-header-portal-link inline-flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-[10px] font-extrabold transition xl:px-3"
                >
                  <Stethoscope className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">{text?.doctorPortal || (isRtl ? 'الأطباء' : 'Doctors')}</span>
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="portal-mobile-menu"
              aria-label={menuOpen ? (text?.menu?.close || 'Close menu') : (text?.menu?.open || 'Open menu')}
              className="portal-header-menu-button flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[2px] overflow-hidden bg-transparent" aria-hidden="true">
        <span className="block h-full bg-gradient-to-r from-[#075cb7] via-[#28a7d8] to-[#19a78c] transition-[width] duration-150" style={{ width: `${scrollProgress}%` }} />
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label={text?.menu?.close || 'Close menu'}
            className="portal-header-backdrop fixed inset-0 z-[60] lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <div id="portal-mobile-menu" ref={menuRef} role="dialog" aria-modal="true" aria-label={text?.primaryNav || 'Primary navigation'} className="portal-header-mobile-menu portal-header-drawer fixed inset-y-0 end-0 z-[70] flex w-[min(90vw,23rem)] flex-col overflow-y-auto border-s px-5 py-5 shadow-2xl lg:hidden">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700">
              <Link to="/" onClick={() => setMenuOpen(false)} className="flex min-w-0 items-center gap-3">
                <span className="portal-header-brand-mark flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white shadow-md">{logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1.5" /> : <span className="text-xs font-extrabold tracking-wider">{initials}</span>}</span>
                <span className="min-w-0"><bdi className="portal-header-brand-name block max-w-48 truncate text-sm font-black">{centerName}</bdi><small className="portal-header-brand-subtitle mt-0.5 block text-[8px] font-black uppercase tracking-wider">{isRtl ? 'مركز الأشعة التشخيصية' : 'Diagnostic Imaging Center'}</small></span>
              </Link>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label={text?.menu?.close || 'Close menu'} className="portal-header-menu-button flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 flex flex-1 flex-col">
              <p className="px-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-400">{isRtl ? 'تصفح الموقع' : 'Explore'}</p>
              <nav className="mt-2 flex flex-col gap-1.5" aria-label={text?.primaryNav || 'Primary navigation'}>
                {navLinks.map((link) => {
                  const active = activeHref === link.href;
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? 'location' : undefined}
                      className={`portal-header-mobile-link group flex min-h-12 items-center justify-between rounded-xl px-4 py-3 text-sm font-extrabold transition-all ${active ? 'is-active' : ''}`}
                    >
                      <span className="flex items-center gap-3"><span className={`h-1.5 w-1.5 rounded-full transition ${active ? 'bg-[#075cb7]' : 'bg-slate-300 group-hover:bg-[#075cb7] dark:bg-slate-600'}`} />{link.label}</span>
                      <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                    </a>
                  );
                })}
              </nav>
              {isPublic && (
                <button
                  type="button"
                  onClick={openBooking}
                  className="portal-header-book mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold text-white shadow-lg"
                >
                  <CalendarCheck className="h-4 w-4" />
                  {isRtl ? 'احجز موعداً' : 'Book appointment'}
                </button>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to="/patient/login"
                  onClick={() => setMenuOpen(false)}
                  className="portal-header-secondary flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-center text-xs font-extrabold transition-colors"
                >
                  <UserRound className="h-4 w-4" />
                  {text?.patientPortal || (isRtl ? 'نتائج المرضى' : 'Patient Portal')}
                </Link>
                <Link
                  to="/doctor/login"
                  onClick={() => setMenuOpen(false)}
                  className="portal-header-secondary flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-center text-xs font-extrabold transition-colors"
                >
                  <Stethoscope className="h-4 w-4" />
                  {text?.doctorPortal || (isRtl ? 'بوابة الأطباء' : 'Doctor Portal')}
                </Link>
              </div>

              <div className="mt-auto pt-6">
                <div className="rounded-2xl border border-[#d8e6f1] bg-[#f5f9fd] p-4 dark:border-slate-700 dark:bg-slate-800/70">
                  <a href={`tel:${hotline}`} className="portal-header-mobile-hotline flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs font-bold"><span className="flex items-center gap-2"><Phone className="h-4 w-4" />{isRtl ? 'الخط الساخن' : 'Hotline'}</span><b className="font-mono text-sm" dir="ltr">{hotline}</b></a>
                  <p className="portal-header-meta mt-3 flex items-center gap-2 text-[10px] font-semibold"><Clock className="h-3.5 w-3.5" /><span>{isRtl ? 'مفتوح يومياً' : 'Open daily'}</span><b dir="ltr">{workingHours}</b></p>
                  <a href="/#locations" onClick={() => setMenuOpen(false)} className="portal-header-meta mt-2 flex items-center gap-2 text-[10px] font-semibold"><MapPin className="h-3.5 w-3.5" />{isRtl ? 'الفروع والاتجاهات' : 'Locations and directions'}<ArrowUpRight className="ms-auto h-3.5 w-3.5 rtl:-scale-x-100" /></a>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
};
