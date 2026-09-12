import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck, FileText, Phone } from "lucide-react";
import { PortalHeader } from "../components/portal/layout/PortalHeader";
import { PortalFooter } from "../components/portal/layout/PortalFooter";
import { HeroSection } from "../components/portal/landing/HeroSection";
import { ServicesSection } from "../components/portal/landing/ServicesSection";
import { WhyViaraSection } from "../components/portal/landing/WhyViaraSection";
import { PatientJourney } from "../components/portal/landing/PatientJourney";
import { TestimonialsSection } from "../components/portal/landing/TestimonialsSection";
import { BranchDirectory } from "../components/portal/landing/BranchDirectory";
import { FaqAccordion } from "../components/portal/landing/FaqAccordion";
import { CareSupportBand } from "../components/portal/landing/CareSupportBand";
import { CaseLookupWidget } from "../components/portal/landing/CaseLookupWidget";
import { QuickBookingCard } from "../components/portal/landing/QuickBookingCard";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { useGetPublicCenterSettingsQuery } from "../store/api";
import { PortalIdentityProvider, resolvePortalIdentity } from "../lib/portal-identity";

export const PortalLanding = () => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const { data: centerSettings } = useGetPublicCenterSettingsQuery();
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
    const description = isRtl
      ? `احجز فحوصاتك وتابع حالة التقرير بأمان لدى ${centerName}.`
      : `Request diagnostic imaging and securely track report status at ${centerName}.`;
    const canonicalUrl = new URL(window.location.pathname, window.location.origin).toString();
    document.title = isRtl ? `${centerName} | الحجز والنتائج` : `${centerName} | Appointments and results`;
    const setMeta = (selector: string, attribute: "name" | "property", key: string, value: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector);
      if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, key); document.head.appendChild(element); }
      element.content = value;
    };
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", document.title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[property="og:image"]', "property", "og:image", new URL("/images/viara-hero-mri-room.jpg", window.location.origin).toString());
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = canonicalUrl;
    let structuredData = document.getElementById("portal-medical-center-schema") as HTMLScriptElement | null;
    if (!structuredData) { structuredData = document.createElement("script"); structuredData.id = "portal-medical-center-schema"; structuredData.type = "application/ld+json"; document.head.appendChild(structuredData); }
    structuredData.text = JSON.stringify({
      "@context": "https://schema.org", "@type": "MedicalClinic", name: centerName, url: canonicalUrl,
      ...(contactChannel ? { telephone: contactChannel } : {}),
      ...(identity.contacts.address ? { address: identity.contacts.address } : {}),
    });
  }, [contactChannel, identity.center.name, identity.contacts.address, isRtl]);

  useEffect(() => {
    const targets = [document.getElementById("support-section"), document.getElementById("page-footer")].filter(Boolean) as Element[];
    if (!targets.length || typeof IntersectionObserver === "undefined") return undefined;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      setShowQuickNav(visible.size === 0);
    }, { threshold: 0.05 });
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
        className="min-h-screen bg-background text-foreground selection:bg-primary/20"
      >
        <a href="#main-content" className="portal-skip-link">
          {isRtl ? "تخطي إلى المحتوى الرئيسي" : "Skip to main content"}
        </a>

        {/* 1. Simplified Floating Header (72px) */}
        <PortalHeader
          isRtl={isRtl}
          onCheckResults={() => setLookupModalOpen(true)}
        />

        <main id="main-content">
          {/* 2. Signature Hero Section + Floating Glass Medical Widget */}
          <HeroSection
            onBook={() => setBookingModalOpen(true)}
            onCheckResults={() => setLookupModalOpen(true)}
            onFindBranch={() =>
              document.getElementById("locations")?.scrollIntoView({ behavior: "smooth" })
            }
          />

          {/* 3. 6 Primary Service Tiles (Clean 3x2 Grid) */}
          <ServicesSection
            onSelectService={handleBookService}
            onViewAllServices={() => setBookingModalOpen(true)}
          />

          {/* 4. Editorial trust story */}
          <WhyViaraSection />

          {/* 5. Patient Journey (01-04 timeline) */}
          <PatientJourney
            onBook={() => setBookingModalOpen(true)}
            onCheckResults={() => setLookupModalOpen(true)}
          />

          {/* 7. Functional locations directory */}
          <BranchDirectory onBookBranch={() => setBookingModalOpen(true)} />

          {/* 8. One focused patient story */}
          <TestimonialsSection />

          {/* 9. Frequently Asked Questions */}
          <FaqAccordion />

          {/* 10. Final patient support call-to-action */}
          <CareSupportBand onBook={() => setBookingModalOpen(true)} />
        </main>

        {/* 11. Centered brand footer */}
        <PortalFooter isRtl={isRtl} />

        {!bookingModalOpen && !lookupModalOpen && showQuickNav && (
          <nav
            aria-label={isRtl ? "إجراءات المريض السريعة" : "Quick patient actions"}
            className="fixed inset-x-3 z-[60] grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-surface/95 p-1.5 shadow-[0_14px_38px_rgba(11,35,72,0.2)] backdrop-blur-xl md:hidden"
            style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))", gridTemplateColumns: contactChannel ? undefined : "1fr 1fr" }}
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
