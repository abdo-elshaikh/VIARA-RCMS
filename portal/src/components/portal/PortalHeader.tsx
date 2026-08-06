import { getCenterHours, getCenterName, getCenterPhone, PublicCenterSettings } from "@/hooks/use-center-settings";
import { useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Activity, Clock, Languages, Mail, MapPin, Menu, Moon, Phone, Sun, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const PHONE = "+20 19144";
const EMAIL = "reservations@cairoscan.com.eg";
const ADDRESS = "Cairo, Egypt";
const HOURS = "8:00 AM - 11:00 PM";

type NavLink = { href: string; labelKey?: string; label?: string };

export function PortalHeader({
  brand = "CairoScan",
  suffix,
  suffixKey = "brand.suffix",
  navLinks = [],
  primaryCta,
  secondaryCta,
  centerSettings,
}: {
  brand?: string;
  suffix?: string;
  suffixKey?: string;
  navLinks?: NavLink[];
  primaryCta?: { labelKey?: string; label?: string; to: string };
  secondaryCta?: { labelKey?: string; label?: string; to: string };
  centerSettings?: PublicCenterSettings | null;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang, t } = useLang();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const label = (item: { labelKey?: string; label?: string }) =>
    item.labelKey ? t(item.labelKey, item.label) : (item.label ?? "");

  const displayBrand = centerSettings ? getCenterName(centerSettings) : brand;
  const phone = centerSettings ? getCenterPhone(centerSettings) || PHONE : PHONE;
  const hours = centerSettings ? getCenterHours(centerSettings) || HOURS : HOURS;
  const address = centerSettings?.address || ADDRESS;
  const email = centerSettings?.email || EMAIL;

  return (
    <header className="sticky top-0 z-50 flex flex-col">
      {/* Top Contact Bar */}
      <div 
        className={`origin-top transition-all duration-300 ${
          scrolled ? "h-0 overflow-hidden opacity-0" : "h-10 opacity-100"
        } hidden bg-gradient-to-r from-primary/5 to-primary-soft/10 text-xs font-medium text-muted-foreground dark:from-primary/10 dark:to-primary-soft/5 dark:text-slate-300 sm:block`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-5">
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className="flex items-center gap-2 transition-colors hover:text-primary">
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span>{phone}</span>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-2 transition-colors hover:text-primary">
                <Mail className="h-3.5 w-3.5 text-primary" />
                <span>{email}</span>
              </a>
            )}
          </div>
          <div className="flex items-center gap-5">
            {address && (
              <span className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span className="max-w-[200px] truncate">{address}</span>
              </span>
            )}
            {hours && (
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>{hours}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div 
        className={`transition-all duration-300 ${
          scrolled 
            ? "border-b border-border/50 bg-surface/80 shadow-sm backdrop-blur-xl" 
            : "border-b border-border/30 bg-surface/95 backdrop-blur-md"
        }`}
      >
        <div className={`mx-auto flex transition-all duration-300 ${scrolled ? "h-16" : "h-20"} max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8`}>
          <Link to="/" className="flex min-w-0 items-center gap-3 transition-transform hover:scale-[1.02]">
            {centerSettings?.logo_url ? (
              <img
                src={centerSettings.logo_url}
                alt={displayBrand}
                className="h-10 w-10 rounded-xl border border-primary/20 bg-surface shadow-sm"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-md shadow-primary/20">
                <Activity className="h-5 w-5" strokeWidth={2.5} />
              </span>
            )}
            <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
              <span className="text-lg font-bold tracking-tight text-foreground">
                {displayBrand}
              </span>
              <span className="hidden rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary sm:inline-block">
                {suffix ?? t(suffixKey)}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="relative rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary before:absolute before:inset-0 before:scale-95 before:rounded-full before:bg-primary/5 before:opacity-0 before:transition-all hover:before:scale-100 hover:before:opacity-100"
              >
                <span className="relative z-10">{label(l)}</span>
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={toggleLang}
                aria-label={t("ui.language")}
                title={t("ui.language")}
                className="group flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground shadow-sm transition-all hover:-translate-y-px hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <Languages className="h-4 w-4 transition-transform group-hover:scale-110" />
                {lang === "en" ? "العربية" : "English"}
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={t("ui.theme")}
                title={t("ui.theme")}
                className="group grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm transition-all hover:-translate-y-px hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4 transition-transform group-hover:rotate-45" />
                ) : (
                  <Moon className="h-4 w-4 transition-transform group-hover:-rotate-12" />
                )}
              </button>
            </div>

            <div className="hidden items-center gap-2 md:flex ml-2 border-l border-border pl-4">
              {secondaryCta && (
                <Link
                  to={secondaryCta.to}
                  className="rounded-full border border-border bg-surface px-5 py-2 text-sm font-semibold text-foreground shadow-sm transition-all hover:-translate-y-px hover:border-primary hover:bg-primary/5"
                >
                  {label(secondaryCta)}
                </Link>
              )}
              {primaryCta && (
                <Link
                  to={primaryCta.to}
                  className="rounded-full bg-gradient-to-r from-primary to-primary-dark px-5 py-2 text-sm font-semibold text-white shadow-md shadow-primary/20 transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-primary/30"
                >
                  {label(primaryCta)}
                </Link>
              )}
            </div>

            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-foreground shadow-sm transition-all hover:bg-primary/5 hover:text-primary md:hidden"
              onClick={() => setOpen((prev: boolean) => !prev)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="absolute inset-x-0 top-full border-b border-border/50 bg-surface/95 backdrop-blur-xl md:hidden shadow-lg">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-sm font-bold text-muted-foreground hover:bg-primary/5 hover:text-primary"
                >
                  {label(l)}
                </a>
              ))}
              <div className="mt-2 flex items-center gap-3 border-t border-border pt-4 sm:hidden">
                <button
                  type="button"
                  onClick={toggleLang}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-foreground shadow-sm hover:bg-primary/5 hover:text-primary"
                >
                  <Languages className="h-4 w-4" />
                  {lang === "en" ? "العربية" : "English"}
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-foreground shadow-sm hover:bg-primary/5 hover:text-primary"
                >
                  {theme === "dark" ? (
                    <>
                      <Sun className="h-4 w-4" />
                      <span>{t("ui.theme")}</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4" />
                      <span>{t("ui.theme")}</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {secondaryCta && (
                  <Link
                    to={secondaryCta.to}
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-border bg-surface px-5 py-3 text-center text-sm font-bold text-foreground shadow-sm hover:bg-primary/5"
                  >
                    {label(secondaryCta)}
                  </Link>
                )}
                {primaryCta && (
                  <Link
                    to={primaryCta.to}
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-gradient-to-r from-primary to-primary-dark px-5 py-3 text-center text-sm font-bold text-white shadow-md shadow-primary/20"
                  >
                    {label(primaryCta)}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
