const PHONE = "+20 19144";
const EMAIL = "reservations@cairoscan.com.eg";
const ADDRESS = "Cairo, Egypt";
const HOURS = "8:00 AM - 11:00 PM";

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
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang, t } = useLang();

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
      {(centerSettings || true) && (
        <div className="border-b border-[#0E7C7B]/20 bg-gradient-to-r from-[#0E7C7B]/5 to-[#3FD6C7]/5 px-4 py-2.5 text-xs font-medium text-[#475467] dark:text-[#9CA3AF] sm:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex flex-wrap items-center gap-4">
              {phone && (
                <span className="flex items-center gap-2 transition-colors hover:text-[#0E7C7B]">
                  <Phone className="h-3.5 w-3.5 text-[#0E7C7B]" />
                  <a href={`tel:${phone.replace(/\s+/g, "")}`}>{phone}</a>
                </span>
              )}
              {email && (
                <span className="flex items-center gap-2 transition-colors hover:text-[#0E7C7B]">
                  <Mail className="h-3.5 w-3.5 text-[#0E7C7B]" />
                  <a href={`mailto:${email}`}>{email}</a>
                </span>
              )}
              {address && (
                <span className="hidden items-center gap-2 lg:flex">
                  <MapPin className="h-3.5 w-3.5 text-[#0E7C7B]" />
                  <span className="max-w-xs truncate">{address}</span>
                </span>
              )}
            </div>
            {hours && (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[#0E7C7B]" />
                <span>{hours}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="border-b border-[#0E7C7B]/10 bg-white/95 shadow-soft backdrop-blur-xl dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            {centerSettings?.logo_url ? (
              <img
                src={centerSettings.logo_url}
                alt={displayBrand}
                className="h-10 w-10 rounded-xl border border-[#0E7C7B]/20 object-cover shadow-md"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0E7C7B] to-[#0B5E5D] text-white shadow-md">
                <Activity className="h-5 w-5" strokeWidth={2.5} />
              </span>
            )}
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight text-[#0E2A47] dark:text-white">
                {displayBrand}
              </span>
              <span className="hidden rounded-full bg-gradient-to-r from-[#0E7C7B]/10 to-[#3FD6C7]/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0E7C7B] sm:inline">
                {suffix ?? t(suffixKey)}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-[#475467] transition-all hover:bg-[#0E7C7B]/5 hover:text-[#0E7C7B] dark:text-[#D1D5DB] dark:hover:bg-[#0E7C7B]/10 dark:hover:text-[#3FD6C7]"
              >
                {label(l)}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLang}
              aria-label={t("ui.language")}
              title={t("ui.language")}
              className="hidden h-9 items-center gap-2 rounded-full border border-[#0E7C7B]/20 bg-white px-3 text-xs font-semibold text-[#475467] shadow-soft transition-all hover:-translate-y-px hover:border-[#0E7C7B]/40 hover:bg-[#0E7C7B]/5 hover:text-[#0E7C7B] sm:inline-flex dark:border-[#0E7C7B]/30 dark:bg-slate-800 dark:text-[#D1D5DB]"
            >
              <Languages className="h-4 w-4" />
              {lang === "en" ? "العربية" : "English"}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t("ui.theme")}
              title={t("ui.theme")}
              className="hidden h-9 w-9 place-items-center rounded-full border border-[#0E7C7B]/20 bg-white text-[#475467] shadow-soft transition-all hover:-translate-y-px hover:border-[#0E7C7B]/40 hover:bg-[#0E7C7B]/5 hover:text-[#0E7C7B] sm:grid dark:border-[#0E7C7B]/30 dark:bg-slate-800 dark:text-[#D1D5DB]"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="hidden items-center gap-2 md:flex">
              {secondaryCta && (
                <Link
                  to={secondaryCta.to}
                  className="rounded-full border border-[#0E7C7B]/20 bg-white px-5 py-2 text-sm font-semibold text-[#0E2A47] shadow-soft transition-all hover:-translate-y-px hover:border-[#0E7C7B] hover:bg-[#0E7C7B]/5 dark:border-[#0E7C7B]/30 dark:bg-slate-800 dark:text-white"
                >
                  {label(secondaryCta)}
                </Link>
              )}
              {primaryCta && (
                <Link
                  to={primaryCta.to}
                  className="rounded-full bg-gradient-to-r from-[#0E7C7B] to-[#0B5E5D] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#0E7C7B]/20 transition-all hover:-translate-y-px hover:from-[#0B5E5D] hover:to-[#0E7C7B] hover:shadow-lg"
                >
                  {label(primaryCta)}
                </Link>
              )}
            </div>

            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#0E7C7B]/20 bg-white text-[#0E2A47] shadow-soft transition-all hover:-translate-y-px hover:border-[#0E7C7B] hover:bg-[#0E7C7B]/5 dark:border-[#0E7C7B]/30 dark:bg-slate-800 dark:text-white md:hidden"
              onClick={() => setOpen((prev: boolean) => !prev)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-[#0E7C7B]/10 bg-white/95 backdrop-blur md:hidden dark:bg-slate-900/95">
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#475467] hover:bg-[#0E7C7B]/5 hover:text-[#0E7C7B] dark:text-[#D1D5DB]"
                >
                  {label(l)}
                </a>
              ))}
              <div className="mt-2 flex items-center gap-2 border-t border-[#0E7C7B]/10 pt-3 sm:hidden">
                <button
                  type="button"
                  onClick={toggleLang}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#0E7C7B]/20 bg-white px-3 py-2 text-xs font-semibold text-[#0E2A47] shadow-soft"
                >
                  <Languages className="h-3.5 w-3.5" />
                  {lang === "en" ? "العربية" : "English"}
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#0E7C7B]/20 bg-white px-3 py-2 text-xs font-semibold text-[#0E2A47] shadow-soft"
                >
                  {theme === "dark" ? (
                    <>
                      <Sun className="h-3.5 w-3.5" />
                      <span>{t("ui.theme")}</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-3.5 w-3.5" />
                      <span>{t("ui.theme")}</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {secondaryCta && (
                  <Link
                    to={secondaryCta.to}
                    className="rounded-full border border-[#0E7C7B]/20 bg-white px-5 py-2.5 text-center text-sm font-semibold text-[#0E2A47] shadow-soft"
                  >
                    {label(secondaryCta)}
                  </Link>
                )}
                {primaryCta && (
                  <Link
                    to={primaryCta.to}
                    className="rounded-full bg-gradient-to-r from-[#0E7C7B] to-[#0B5E5D] px-5 py-2.5 text-center text-sm font-semibold text-white shadow-md"
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
