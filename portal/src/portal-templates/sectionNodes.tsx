import type { ReactNode } from "react";
import type { LandingContent } from "../hooks/use-landing-content";
import { HeroSection } from "../components/portal/landing/HeroSection";
import { ServicesSection } from "../components/portal/landing/ServicesSection";
import { WhyViaraSection } from "../components/portal/landing/WhyViaraSection";
import { PatientJourney } from "../components/portal/landing/PatientJourney";
import { TestimonialsSection } from "../components/portal/landing/TestimonialsSection";
import { BranchDirectory } from "../components/portal/landing/BranchDirectory";
import { FaqAccordion } from "../components/portal/landing/FaqAccordion";
import { CareSupportBand } from "../components/portal/landing/CareSupportBand";

export interface PortalSectionHandlers {
  onBook: (serviceId?: string) => void;
  onResults: () => void;
  onService: (id: string) => void;
}

/**
 * Builds one React node per admin-managed section, wiring the admin-supplied
 * heading/subheading copy into every section that has an editable header.
 * Sections with no verified backing data still return a node; templates decide
 * whether to hide them (visitor view) or explain them (draft preview).
 */
export const buildPortalSectionNodes = (
  content: LandingContent,
  handlers: PortalSectionHandlers,
): Record<string, ReactNode> => {
  const copy = (id: string) => content.sectionCopy(id);
  const services = copy("services");
  const why = copy("why");
  const journey = copy("journey");
  const testimonials = copy("testimonials");
  const locations = copy("locations");
  const faq = copy("faq");
  const support = copy("support");

  return {
    hero: (
      <HeroSection
        title={content.heroTitle}
        subtitle={content.heroSubtitle}
        audience={content.audience}
        variant={content.template}
        showServices={
          content.getSection("services")?.enabled && content.activeModalityNames.length > 0
        }
        onBook={() => handlers.onBook()}
        onCheckResults={handlers.onResults}
        onFindBranch={
          content.getSection("locations")?.enabled && content.branches.length > 0
            ? () => document.getElementById("locations")?.scrollIntoView({ behavior: "smooth" })
            : undefined
        }
      />
    ),
    services: (
      <ServicesSection
        heading={services.heading}
        subheading={services.subheading}
        onSelectService={handlers.onService}
        onViewAllServices={() => handlers.onBook()}
      />
    ),
    why: <WhyViaraSection heading={why.heading} subheading={why.subheading} />,
    journey: (
      <PatientJourney
        heading={journey.heading}
        subheading={journey.subheading}
        onBook={() => handlers.onBook()}
        onCheckResults={handlers.onResults}
      />
    ),
    locations: <BranchDirectory heading={locations.heading} subheading={locations.subheading} />,
    testimonials: (
      <TestimonialsSection heading={testimonials.heading} subheading={testimonials.subheading} />
    ),
    faq: <FaqAccordion heading={faq.heading} subheading={faq.subheading} />,
    support: (
      <CareSupportBand
        heading={support.heading}
        subheading={support.subheading}
        onBook={() => handlers.onBook()}
      />
    ),
  };
};

/** True when a section would show nothing to visitors without verified data. */
export const isSectionEmpty = (content: LandingContent, id: string): boolean => {
  if (id === "testimonials") return !content.testimonials.length;
  if (id === "locations") return !content.branches.length;
  if (id === "services" || id === "why") {
    return content.overviewLoaded && !content.activeModalityNames.length;
  }
  return false;
};
