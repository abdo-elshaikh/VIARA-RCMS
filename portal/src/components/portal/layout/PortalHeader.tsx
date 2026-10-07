import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Menu, X, CalendarCheck, FileText, LockKeyhole, Sparkles, LogIn } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import LanguageToggle from "../../ui/LanguageToggle";
import ThemeToggle from "../../ui/ThemeToggle";
import { PortalBrand } from "../ui/PortalBrand";
import {
  findPreviouslyFocused,
  focusInitialElement,
  restoreFocus,
  useFocusTrap,
} from "../../../hooks/use-focus-trap";

interface PortalHeaderProps {
  navLinks?: Array<{ label: string; href: string }>;
  isRtl?: boolean;
  onBook?: () => void;
  onCheckResults?: () => void;
  onLogin?: () => void;
  /** Admin layout option: translucent floating bar (default) or solid bar. */
  navStyle?: "floating" | "solid";
}

export const PortalHeader = ({
  navLinks,
  isRtl = false,
  onBook,
  onCheckResults,
  onLogin,
  navStyle = "floating",
}: PortalHeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState("#main-content");
  const reduceMotion = useReducedMotion();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mobileMenuRef, menuOpen);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 96);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    const sections = ["#main-content", "#services-section", "#why-viara", "#locations", "#faq"];

    const updateActiveSection = () => {
      const marker = Math.min(220, window.innerHeight * 0.28);
      let current = sections[0];
      sections.forEach((href) => {
        const section = document.querySelector(href);
        if (section && section.getBoundingClientRect().top <= marker) current = href;
      });
      setActiveHref(current);
    };

    const handleScroll = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    const initialHash = window.location.hash;
    if (sections.includes(initialHash)) {
      animationFrame = window.requestAnimationFrame(() => {
        const target = document.querySelector(initialHash);
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 92;
          window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
          updateActiveSection();
        }
      });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previouslyFocused = findPreviouslyFocused();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => focusInitialElement(mobileMenuRef));
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      restoreFocus(previouslyFocused);
    };
  }, [menuOpen]);

  const navigateToSection = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#")) return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    setMenuOpen(false);
    setActiveHref(href);
    window.history.pushState(null, "", href);
    const top = target.getBoundingClientRect().top + window.scrollY - 92;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
  };

  const defaultLinks = [
    { label: isRtl ? "الرئيسية" : "Home", href: "#main-content" },
    { label: isRtl ? "خدماتنا" : "Services", href: "#services-section" },
    { label: isRtl ? "عن المركز" : "About", href: "#why-viara" },
    { label: isRtl ? "الفروع" : "Branches", href: "#locations" },
    { label: isRtl ? "الأسئلة الشائعة" : "FAQ", href: "#faq" },
  ];

  const links = navLinks ?? defaultLinks;

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        navStyle === "solid"
          ? "border-b border-border bg-surface/96 backdrop-blur-xl py-2"
          : "py-3 sm:py-4"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={`pointer-events-auto relative flex items-center justify-between gap-3 rounded-2xl border px-3 backdrop-blur-2xl transition-all duration-300 sm:gap-4 sm:px-5 ${
            navStyle === "solid" ? "border-border/80 bg-surface" : "bg-white/92 dark:bg-surface/92"
          } ${
            scrolled
              ? "h-[3.25rem] border-border/80 shadow-[0_14px_40px_rgba(11,35,72,0.13)] sm:h-14"
              : "h-14 border-white/75 shadow-[0_10px_34px_rgba(11,35,72,0.10)] sm:h-16"
          }`}
        >
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-foreground lg:hidden"
            aria-label={isRtl ? "فتح قائمة التنقل" : "Toggle navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="portal-mobile-navigation"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Brand Logo */}
          <Link
            to="/"
            className="absolute left-1/2 max-w-[calc(100%-7rem)] shrink-0 -translate-x-1/2 outline-none lg:static lg:max-w-[15rem] lg:translate-x-0"
          >
            <PortalBrand
              isRtl={isRtl}
              logoClassName="h-9 w-9 text-base sm:h-10 sm:w-10"
              textClassName="max-w-[6.5rem] sm:max-w-[9rem] lg:max-w-[11rem]"
              nameClassName="text-xs lg:text-sm"
              subtitleClassName="hidden text-xs lg:block"
            />
          </Link>

          {/* Center Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(event) => navigateToSection(event, link.href)}
                aria-current={activeHref === link.href ? "page" : undefined}
                className={`relative rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                  activeHref === link.href
                    ? "bg-primary-soft/70 text-primary"
                    : "text-foreground/80 hover:bg-primary-soft/40 hover:text-primary"
                }`}
              >
                {link.label}
                <span
                  className={`absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full bg-primary transition-transform duration-300 ${activeHref === link.href ? "scale-x-100" : "scale-x-0"}`}
                />
              </a>
            ))}
          </nav>

          {/* Right Action Utilities */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden xl:flex items-center gap-1.5">
              <LanguageToggle />
              <ThemeToggle />
            </div>

            <button
              type="button"
              onClick={onCheckResults}
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>{isRtl ? "النتائج" : "Results"}</span>
            </button>

            {/* Primary Login CTA */}
            {onLogin ? (
              <button
                type="button"
                onClick={onLogin}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary p-0 text-xs font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-700 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] sm:h-auto sm:w-auto sm:px-5 sm:py-2.5 sm:text-sm cursor-pointer"
                aria-label={isRtl ? "تسجيل الدخول" : "Login"}
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">{isRtl ? "تسجيل الدخول" : "Login"}</span>
              </button>
            ) : (
              <Link
                to="/patient/login"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary p-0 text-xs font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-700 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] sm:h-auto sm:w-auto sm:px-5 sm:py-2.5 sm:text-sm cursor-pointer"
                aria-label={isRtl ? "تسجيل الدخول" : "Login"}
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">{isRtl ? "تسجيل الدخول" : "Login"}</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.button
              type="button"
              aria-label={isRtl ? "إغلاق القائمة" : "Close navigation"}
              onClick={() => setMenuOpen(false)}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              className="pointer-events-auto fixed inset-0 z-40 bg-[#0B2348]/18 backdrop-blur-[2px] lg:hidden"
            />
            <motion.div
              id="portal-mobile-navigation"
              ref={mobileMenuRef}
              role="dialog"
              aria-modal="true"
              aria-label={isRtl ? "قائمة التنقل" : "Navigation menu"}
              tabIndex={-1}
              initial={reduceMotion ? false : { opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.985 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto lg:hidden fixed inset-x-4 top-20 z-50 rounded-2xl bg-surface/96 backdrop-blur-2xl border border-border p-5 shadow-2xl space-y-4"
            >
              <nav className="flex flex-col gap-2">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={(event) => navigateToSection(event, link.href)}
                    aria-current={activeHref === link.href ? "page" : undefined}
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition ${activeHref === link.href ? "bg-primary-soft text-primary" : "text-foreground hover:bg-primary-soft/60"}`}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              <div className="pt-4 border-t border-border flex flex-col gap-2.5">
                <div className="flex items-center justify-center gap-2 pb-1">
                  <LanguageToggle />
                  <ThemeToggle />
                </div>
                <Link
                  to="/patient/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-bold text-foreground"
                >
                  <LockKeyhole className="h-4 w-4 text-primary" />
                  <span>{isRtl ? "بوابة المريض" : "Patient Portal"}</span>
                </Link>
                <Link
                  to="/doctor/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-bold text-foreground"
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>{isRtl ? "بوابة الطبيب" : "Doctor Portal"}</span>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};

export default PortalHeader;
