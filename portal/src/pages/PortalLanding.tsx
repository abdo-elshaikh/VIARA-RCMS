import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck, FileText, Phone } from "lucide-react";
import { PortalHeader } from "../components/portal/layout/PortalHeader";
import { PortalFooter } from "../components/portal/layout/PortalFooter";
import PortalTemplateContent from "../portal-templates/PortalTemplateContent";
import { portalPreviewToken } from "../lib/portal-preview";
import { CaseLookupWidget } from "../components/portal/landing/CaseLookupWidget";
import { QuickBookingCard } from "../components/portal/landing/QuickBookingCard";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { useGetPublicCenterSettingsQuery, useGetPublicLandingOverviewQuery } from "../store/api";
import { useLandingContent, type PortalAudience } from "../hooks/use-landing-content";
import {
  PortalIdentityProvider,
  resolvePortalIdentity,
  resolvePortalBranches,
} from "../lib/portal-identity";

export const PortalLanding = () => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const { data: centerSettings } = useGetPublicCenterSettingsQuery(undefined, {
    pollingInterval: 60000,
  });
  const home = centerSettings?.homepage_settings;
  const { data: overview } = useGetPublicLandingOverviewQuery();
  const [audience, setAudience] = useState<PortalAudience>(
    new URLSearchParams(window.location.search).get("target") === "doctors"
      ? "doctors"
      : "patients",
  );
  const content = useLandingContent(audience);
  const visible = (id: string) => content.published && content.getSection(id)?.enabled !== false;
  const defaultNavLinks = [
    { label: isRtl ? "الرئيسية" : "Home", href: "#main-content" },
    ...(visible("services") && overview?.modalities?.length
      ? [{ label: isRtl ? "الخدمات" : "Services", href: "#services-section" }]
      : []),
    ...(visible("why") && overview?.modalities?.length
      ? [{ label: isRtl ? "عن المركز" : "About", href: "#why-viara" }]
      : []),
    ...(visible("locations") &&
    resolvePortalBranches({ settings: centerSettings, language: i18n.language }).length
      ? [{ label: isRtl ? "الفروع" : "Locations", href: "#locations" }]
      : []),
    ...(visible("faq") ? [{ label: isRtl ? "الأسئلة الشائعة" : "FAQ", href: "#faq" }] : []),
  ];
  const availableAnchors = [
    ...defaultNavLinks.map((link) => link.href),
    ...(visible("hero") ? ["#hero"] : []),
    ...(visible("support") ? ["#support-section"] : []),
    ...(visible("journey") ? ["#patient-journey"] : []),
    ...(visible("testimonials") && content.testimonials.length ? ["#testimonials"] : []),
  ];
  const navLinks = content.navigation.length
    ? content.navigation.filter(
        (link) =>
          link.label &&
          link.href &&
          (!link.href.startsWith("#") || availableAnchors.includes(link.href)),
      )
    : defaultNavLinks;
  const localized = useCallback(
    (en?: string, ar?: string) => (isRtl ? ar || en || "" : en || ar || ""),
    [isRtl],
  );
  const identity = resolvePortalIdentity({ settings: centerSettings, language: i18n.language });
  const contactChannel = identity.contacts.hotline || identity.contacts.phone;

  const requestedAction =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("action");
  const [bookingModalOpen, setBookingModalOpen] = useState(requestedAction === "book");
  const [lookupModalOpen, setLookupModalOpen] = useState(requestedAction === "results");
  const [selectedService, setSelectedService] = useState("");
  const [showQuickNav, setShowQuickNav] = useState(true);

  useEffect(() => {
    const centerName = identity.center.name || (isRtl ? "مركز الأشعة" : "Radiology Center");
    const description =
      localized(home?.seo?.description, home?.seo?.descriptionAr) ||
      (isRtl
        ? `احجز فحوصاتك وتابع حالة التقرير بأمان لدى ${centerName}.`
        : `Request diagnostic imaging and securely track report status at ${centerName}.`);
    const canonicalUrl = new URL(window.location.pathname, window.location.origin).toString();
    document.title =
      localized(home?.seo?.title, home?.seo?.titleAr) ||
      (isRtl ? `${centerName} | الحجز والنتائج` : `${centerName} | Appointments and results`);
    const setMeta = (
      selector: string,
      attribute: "name" | "property",
      key: string,
      value: string,
    ) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = value;
    };
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      portalPreviewToken ? "noindex, nofollow" : "index, follow",
    );
    setMeta('meta[property="og:title"]', "property", "og:title", document.title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta(
      'meta[property="og:image"]',
      "property",
      "og:image",
      new URL(
        home?.seo?.ogImageUrl || "/images/viara-hero-mri-room.jpg",
        window.location.origin,
      ).toString(),
    );
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
    let structuredData = document.getElementById(
      "portal-medical-center-schema",
    ) as HTMLScriptElement | null;
    if (!structuredData) {
      structuredData = document.createElement("script");
      structuredData.id = "portal-medical-center-schema";
      structuredData.type = "application/ld+json";
      document.head.appendChild(structuredData);
    }
    structuredData.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "MedicalClinic",
      name: centerName,
      url: canonicalUrl,
      ...(contactChannel ? { telephone: contactChannel } : {}),
      ...(identity.contacts.address ? { address: identity.contacts.address } : {}),
    });
  }, [
    contactChannel,
    identity.center.name,
    identity.contacts.address,
    isRtl,
    home?.seo,
    localized,
  ]);

  useEffect(() => {
    const targets = [
      document.getElementById("support-section"),
      document.getElementById("page-footer"),
    ].filter(Boolean) as Element[];
    if (!targets.length || typeof IntersectionObserver === "undefined") return undefined;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) =>
          entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target),
        );
        setShowQuickNav(visible.size === 0);
      },
      { threshold: 0.05 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  const handleBookService = (serviceId: string) => {
    const map: Record<string, string> = {
      mri: "MRI",
      ct: "CT",
      xray: "X-Ray",
      ultrasound: "Ultrasound",
      mammography: "Mammography",
      cardiac: "Cardiac",
      petct: "PET/CT",
      dexa: "DEXA",
      dental: "Dental Panoramic",
      nuclear: "Nuclear Medicine",
      spect: "SPECT/CT",
      echo: "Echocardiography",
      fluoroscopy: "Fluoroscopy",
    };
    setSelectedService(map[serviceId] || "");
    setBookingModalOpen(true);
  };

  return (
    <PortalIdentityProvider>
      <div
        dir={isRtl ? "rtl" : "ltr"}
        className={`portal-page portal-page-${content.template} portal-width-${content.layout.container} portal-spacing-${content.layout.spacing} portal-hero-${content.layout.heroHeight} portal-cards-${content.layout.cardStyle} portal-nav-${content.layout.navStyle} relative isolate min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/20`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(66,184,142,0.20),transparent_48%)]" />
        <div className="pointer-events-none absolute right-0 top-24 -z-10 h-80 w-80 rounded-full bg-[#7CC5FF]/10 blur-3xl" />
        <div className="pointer-events-none absolute left-0 top-36 -z-10 h-72 w-72 rounded-full bg-[#42B88E]/10 blur-3xl" />
        <a href="#main-content" className="portal-skip-link">
          {isRtl ? "تخطي إلى المحتوى الرئيسي" : "Skip to main content"}
        </a>

        {/* 1. Simplified Floating Header (72px) */}
        <PortalHeader
          navLinks={navLinks}
          isRtl={isRtl}
          navStyle={content.layout.navStyle}
          onCheckResults={() => setLookupModalOpen(true)}
        />

        <main id="main-content" className="pb-16 pt-20 md:pb-0">
          <PortalTemplateContent
            audience={audience}
            onAudienceChange={setAudience}
            onBook={() => setBookingModalOpen(true)}
            onResults={() => setLookupModalOpen(true)}
            onService={handleBookService}
          />
        </main>

        {/* 11. Centered brand footer */}
        <PortalFooter
          isRtl={isRtl}
          visibleAnchors={availableAnchors}
          serviceNames={
            overview?.modalities?.map((modality: { name: string }) => modality.name) || []
          }
          options={content.footer}
        />

        {home?.enabled !== false && !bookingModalOpen && !lookupModalOpen && showQuickNav && (
          <nav
            aria-label={isRtl ? "إجراءات المريض السريعة" : "Quick patient actions"}
            className="fixed inset-x-3 z-[60] grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-surface/95 p-1.5 shadow-[0_14px_38px_rgba(11,35,72,0.2)] backdrop-blur-xl md:hidden"
            style={{
              bottom: "max(0.75rem, env(safe-area-inset-bottom))",
              gridTemplateColumns: contactChannel ? undefined : "1fr 1fr",
            }}
          >
            <button
              type="button"
              onClick={() => setBookingModalOpen(true)}
              className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-primary text-xs font-bold text-white transition active:scale-[0.97]"
            >
              <CalendarCheck className="h-4 w-4" />
              {isRtl ? "احجز" : "Book"}
            </button>
            <button
              type="button"
              onClick={() => setLookupModalOpen(true)}
              className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-xs font-bold text-foreground transition hover:bg-primary-soft/50 active:scale-[0.97]"
            >
              <FileText className="h-4 w-4 text-primary" />
              {isRtl ? "النتائج" : "Results"}
            </button>
            {contactChannel && (
              <a
                href={`tel:${contactChannel.replace(/[^\d+]/g, "")}`}
                className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-xs font-bold text-foreground transition hover:bg-primary-soft/50 active:scale-[0.97]"
              >
                <Phone className="h-4 w-4 text-primary" />
                {isRtl ? "تواصل" : "Contact"}
              </a>
            )}
          </nav>
        )}

        {/* Booking Dialog Modal */}
        <Dialog open={bookingModalOpen} onOpenChange={setBookingModalOpen}>
          <DialogContent className="max-w-xl p-0 overflow-hidden bg-transparent border-0 shadow-none">
            <DialogTitle className="sr-only">
              {isRtl ? "حجز موعد فحص" : "Book Diagnostic Appointment"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isRtl ? "نموذج حجز فحص أشعة تشخيصية" : "Appointment booking request form"}
            </DialogDescription>
            <QuickBookingCard
              initialService={selectedService}
              onSuccess={() => setBookingModalOpen(false)}
            />
          </DialogContent>
        </Dialog>

        {/* Report / Case Lookup Dialog Modal */}
        <Dialog open={lookupModalOpen} onOpenChange={setLookupModalOpen}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden bg-transparent border-0 shadow-none">
            <DialogTitle className="sr-only">
              {isRtl ? "متابعة حالة التقرير" : "Track Report Status"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isRtl
                ? "الاستعلام عن حالة الفحص والتقرير"
                : "Diagnostic scan and report status lookup"}
            </DialogDescription>
            <CaseLookupWidget />
          </DialogContent>
        </Dialog>
      </div>
    </PortalIdentityProvider>
  );
};

export default PortalLanding;
