import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGetPublicCenterSettingsQuery, useGetPublicLandingOverviewQuery } from "../store/api";
import {
  usePortalIdentity,
  resolvePortalBranches,
  type PortalBranchSummary,
} from "../lib/portal-identity";

/**
 * Landing-page content gateway.
 *
 * Single source for everything the landing page renders that is a *fact*
 * about the business: real branches (from settings), real active equipment
 * (from the public landing overview), real contact channels, and optional
 * curated content (testimonials / FAQs) managed via homepage_settings.
 *
 * Hard rule implemented here: no fabricated fallbacks. When the backend has
 * no data for something, the value is empty and the section hides itself.
 */

export interface LandingTestimonial {
  name: string;
  role: string;
  quote: string;
  rating?: number;
}

export interface LandingFaq {
  q: string;
  a: string;
}

export type PortalTemplateId = "clinical" | "modern" | "doctor" | "minimal";
export type PortalAudience = "patients" | "doctors";

export interface PortalSectionConfig {
  id: string;
  enabled: boolean;
  order: number;
  heading: string;
  headingAr: string;
  subheading: string;
  subheadingAr: string;
}

export interface PortalLayout {
  container: "wide" | "boxed" | "narrow";
  spacing: "compact" | "comfortable" | "spacious";
  heroHeight: "compact" | "standard" | "tall";
  cardStyle: "soft" | "outlined" | "elevated";
  navStyle: "floating" | "solid";
}

export interface PortalNavLink {
  id: string;
  label: string;
  href: string;
}

export interface PortalFooterOptions {
  note: string;
  showServices: boolean;
  showPatients: boolean;
  showContact: boolean;
}

const DEFAULT_LAYOUT: PortalLayout = {
  container: "wide",
  spacing: "comfortable",
  heroHeight: "standard",
  cardStyle: "soft",
  navStyle: "floating",
};

const normalizeLayout = (raw: unknown): PortalLayout => {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    container: pick(
      source.container,
      ["wide", "boxed", "narrow"] as const,
      DEFAULT_LAYOUT.container,
    ),
    spacing: pick(
      source.spacing,
      ["compact", "comfortable", "spacious"] as const,
      DEFAULT_LAYOUT.spacing,
    ),
    heroHeight: pick(
      source.heroHeight,
      ["compact", "standard", "tall"] as const,
      DEFAULT_LAYOUT.heroHeight,
    ),
    cardStyle: pick(
      source.cardStyle,
      ["soft", "outlined", "elevated"] as const,
      DEFAULT_LAYOUT.cardStyle,
    ),
    navStyle: pick(source.navStyle, ["floating", "solid"] as const, DEFAULT_LAYOUT.navStyle),
  };
};

export interface PortalAnnouncement {
  enabled: boolean;
  text: string;
  url: string;
}

export interface PortalSeo {
  title: string;
  description: string;
  ogImageUrl: string;
}

export const DEFAULT_SECTION_ORDER = [
  "hero",
  "services",
  "why",
  "journey",
  "locations",
  "testimonials",
  "faq",
  "support",
] as const;

const PORTAL_TEMPLATES: PortalTemplateId[] = ["clinical", "modern", "doctor", "minimal"];

const normalizeTemplate = (raw: unknown): PortalTemplateId =>
  PORTAL_TEMPLATES.includes(raw as PortalTemplateId) ? (raw as PortalTemplateId) : "clinical";

const normalizePortalSections = (raw: unknown): PortalSectionConfig[] => {
  const byId = new Map<string, PortalSectionConfig>();
  if (Array.isArray(raw)) {
    raw.forEach((item: any, index: number) => {
      const id = asString(item?.id);
      if (!id || !(DEFAULT_SECTION_ORDER as readonly string[]).includes(id)) return;
      byId.set(id, {
        id,
        enabled: item?.enabled !== false,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index + 1,
        heading: asString(item?.heading),
        headingAr: asString(item?.headingAr),
        subheading: asString(item?.subheading),
        subheadingAr: asString(item?.subheadingAr),
      });
    });
  }
  // Fill any section absent from the stored config with its default position.
  return DEFAULT_SECTION_ORDER.map((id, index) => {
    const existing = byId.get(id);
    return (
      existing || {
        id,
        enabled: true,
        order: index + 1,
        heading: "",
        headingAr: "",
        subheading: "",
        subheadingAr: "",
      }
    );
  }).sort((a, b) => a.order - b.order);
};

const normalizeNavLinks = (raw: unknown, isRtl: boolean): PortalNavLink[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any): PortalNavLink | null => {
      const href = asString(item?.href);
      if (!href) return null;
      const label = isRtl
        ? asString(item?.labelAr) || asString(item?.label)
        : asString(item?.label) || asString(item?.labelAr);
      if (!label) return null;
      return { id: asString(item?.id) || href, label, href };
    })
    .filter((item): item is PortalNavLink => item !== null)
    .slice(0, 8);
};

const normalizeFooterOptions = (raw: unknown, isRtl: boolean): PortalFooterOptions => {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    note: isRtl
      ? asString(source.noteAr) || asString(source.note)
      : asString(source.note) || asString(source.noteAr),
    showServices: source.showServices !== false,
    showPatients: source.showPatients !== false,
    showContact: source.showContact !== false,
  };
};

const normalizeAnnouncement = (raw: unknown, isRtl: boolean): PortalAnnouncement | null => {
  if (!raw) return null;
  if (typeof raw === "string") {
    const text = asString(raw);
    return text ? { enabled: true, text, url: "" } : null;
  }
  const text = isRtl
    ? asString((raw as any)?.textAr) || asString((raw as any)?.text)
    : asString((raw as any)?.text) || asString((raw as any)?.textAr);
  if (!text) return null;
  return { enabled: (raw as any)?.enabled !== false, text, url: asString((raw as any)?.url) };
};

const normalizeSeo = (raw: unknown, isRtl: boolean): PortalSeo => {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    title: isRtl
      ? asString(source.titleAr) || asString(source.title)
      : asString(source.title) || asString(source.titleAr),
    description: isRtl
      ? asString(source.descriptionAr) || asString(source.description)
      : asString(source.description) || asString(source.descriptionAr),
    ogImageUrl: asString(source.ogImageUrl),
  };
};

export interface LandingOverviewModality {
  id: number | string;
  name: string;
  type: string;
}

export interface LandingContent {
  /** Settings query state (identity, contacts, curated content). */
  isLoading: boolean;
  isError: boolean;
  identity: ReturnType<typeof usePortalIdentity>;
  /** Real branches resolved from center settings; empty array = hide section. */
  branches: PortalBranchSummary[];
  /** Real, currently active equipment names; empty array = hide inventory sections. */
  activeModalityNames: string[];
  /** True once the overview loaded (even to an empty list). */
  overviewLoaded: boolean;
  /** True when the overview request failed; sections offer a retry. */
  overviewError: boolean;
  /** Re-run the overview query (used by retry affordances). */
  refetchOverview: () => void;
  overview: {
    studiesToday: number | null;
    activeModalities: number | null;
    completionRate: number | null;
    imagingMinutes: number | null;
    deliveredToday: number | null;
  } | null;
  /** Curated testimonials from homepage_settings; empty = hide section. */
  testimonials: LandingTestimonial[];
  /** Curated FAQs from homepage_settings; empty = use built-in generic guidance. */
  faqs: LandingFaq[];
  /** Real contact channels; empty = the channel must not be rendered. */
  contactPhone: string;
  whatsappNumber: string;
  /** Selected public portal template (falls back to `clinical`). */
  template: PortalTemplateId;
  /** Whether the admin has published portal content; false hides the whole landing. */
  published: boolean;
  /** Admin-ordered, admin-enabled sections (merged for the active audience). */
  sections: PortalSectionConfig[];
  /** Look up a section by id (undefined = not enabled for this audience). */
  getSection: (id: string) => PortalSectionConfig | undefined;
  /** Optional announcement banner; null = not shown. */
  announcement: PortalAnnouncement | null;
  /** Admin-managed SEO metadata; empty fields fall back to defaults. */
  seo: PortalSeo;
  /** Audience whose overrides are currently active. */
  audience: PortalAudience;
  /** Resolved hero title (audience override > section content > legacy). */
  heroTitle: string;
  /** Resolved hero subtitle (audience override > section content > legacy). */
  heroSubtitle: string;
  /** Layout options (container width, spacing, hero height, card style, nav style). */
  layout: PortalLayout;
  /** Admin-managed header navigation; empty = use sensible defaults. */
  navigation: PortalNavLink[];
  /** Admin-managed footer options (note text + which groups to show). */
  footer: PortalFooterOptions;
  /** Read a section's localized heading/subheading. */
  sectionCopy: (id: string) => { heading: string; subheading: string };
}

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeTestimonials = (raw: unknown, isRtl: boolean): LandingTestimonial[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any): LandingTestimonial | null => {
      const name = isRtl
        ? asString(item?.nameAr) || asString(item?.name)
        : asString(item?.nameEn) || asString(item?.name);
      const quote = isRtl
        ? asString(item?.quoteAr) || asString(item?.quote)
        : asString(item?.quoteEn) || asString(item?.quote);
      if (!name || !quote) return null;
      const rating = Number(item?.rating);
      return {
        name,
        role: isRtl
          ? asString(item?.roleAr) || asString(item?.role)
          : asString(item?.roleEn) || asString(item?.role),
        quote,
        rating:
          Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : undefined,
      };
    })
    .filter((item): item is LandingTestimonial => item !== null);
};

const normalizeFaqs = (raw: unknown, isRtl: boolean): LandingFaq[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any): LandingFaq | null => {
      const q = isRtl
        ? asString(item?.qAr) || asString(item?.q)
        : asString(item?.qEn) || asString(item?.q);
      const a = isRtl
        ? asString(item?.aAr) || asString(item?.a)
        : asString(item?.aEn) || asString(item?.a);
      if (!q || !a) return null;
      return { q, a };
    })
    .filter((item): item is LandingFaq => item !== null);
};

export const useLandingContent = (audience: PortalAudience = "patients"): LandingContent => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || "en";
  const isRtl = language.split("-")[0] === "ar";

  const settingsQuery = useGetPublicCenterSettingsQuery();
  const overviewQuery = useGetPublicLandingOverviewQuery();
  const identity = usePortalIdentity();

  const settings = useMemo(() => settingsQuery.data || {}, [settingsQuery.data]);
  const homepage = useMemo(() => settings.homepage_settings || {}, [settings]);
  const overview = overviewQuery.data;
  const managedTestimonials = homepage.testimonials;
  const managedFaqs = homepage.faqs;
  const overviewLoaded = overviewQuery.isSuccess;
  const overviewError = overviewQuery.isError;
  const refetchOverview = overviewQuery.refetch;

  return useMemo(() => {
    const modalities: LandingOverviewModality[] = Array.isArray(overview?.modalities)
      ? overview.modalities
      : [];

    const overviewMetrics = overview
      ? {
          studiesToday: overview.metrics?.studiesToday ?? null,
          activeModalities: overview.metrics?.activeModalities ?? null,
          completionRate: overview.metrics?.completionRate ?? null,
          imagingMinutes: overview.workflow?.imagingMinutes ?? null,
          deliveredToday: overview.services?.deliveredToday ?? null,
        }
      : null;

    const override = homepage.audience?.[audience];
    const pickLocalized = (latin?: unknown, arabic?: unknown) =>
      isRtl ? asString(arabic) || asString(latin) : asString(latin) || asString(arabic);
    const baseSections = normalizePortalSections(homepage.sections);
    const heroSection = baseSections.find((section) => section.id === "hero");
    const heroTitle =
      pickLocalized(override?.hero?.title, override?.hero?.titleAr) ||
      pickLocalized(heroSection?.heading, heroSection?.headingAr) ||
      pickLocalized(homepage.heroTitle, homepage.heroTitleAr);
    const heroSubtitle =
      pickLocalized(override?.hero?.subtitle, override?.hero?.subtitleAr) ||
      pickLocalized(heroSection?.subheading, heroSection?.subheadingAr) ||
      pickLocalized(homepage.heroSubtitle, homepage.heroSubtitleAr);
    // Audience overrides arrive as `{ id, heading, ... }` objects (only enabled ones).
    // They act as an allow-list and may replace a section's heading/subheading copy.
    const overrideSections: any[] = Array.isArray(override?.sections) ? override.sections : [];
    const sections: PortalSectionConfig[] = Array.isArray(override?.sections)
      ? overrideSections
          .map((item, index) => {
            const section = baseSections.find(
              (section) => section.id === (typeof item === "string" ? item : item?.id),
            );
            if (!section) return null;
            const match = typeof item === "string" ? {} : item;
            const heading = asString(match?.heading);
            const headingAr = asString(match?.headingAr);
            const subheading = asString(match?.subheading);
            const subheadingAr = asString(match?.subheadingAr);
            return {
              ...section,
              order: index + 1,
              enabled: true,
              heading: heading || section.heading,
              headingAr: headingAr || section.headingAr,
              subheading: subheading || section.subheading,
              subheadingAr: subheadingAr || section.subheadingAr,
            };
          })
          .filter((section): section is PortalSectionConfig => section !== null)
      : baseSections;
    const sectionMap = new Map(sections.map((section) => [section.id, section]));
    const sectionCopy = (id: string) => {
      const section = sectionMap.get(id);
      return {
        heading: pickLocalized(section?.heading, section?.headingAr),
        subheading: pickLocalized(section?.subheading, section?.subheadingAr),
      };
    };

    return {
      isLoading: settingsQuery.isLoading,
      isError: settingsQuery.isError,
      identity,
      branches: resolvePortalBranches({ settings, language }),
      activeModalityNames: modalities.map((item) => item.name).filter(Boolean),
      overviewLoaded,
      overviewError,
      refetchOverview: () => {
        void refetchOverview();
      },
      overview: overviewMetrics,
      testimonials: normalizeTestimonials(managedTestimonials, isRtl),
      faqs: normalizeFaqs(managedFaqs, isRtl),
      contactPhone: identity.contacts.hotline || identity.contacts.phone || "",
      whatsappNumber: identity.contacts.whatsapp || "",
      template: normalizeTemplate(
        override?.templateId === "professional"
          ? "doctor"
          : override?.templateId || homepage.template,
      ),
      published: homepage.enabled !== false,
      sections,
      getSection: (id: string) => sectionMap.get(id),
      announcement: normalizeAnnouncement(homepage.announcement, isRtl),
      seo: normalizeSeo(homepage.seo, isRtl),
      audience,
      heroTitle,
      heroSubtitle,
      layout: normalizeLayout(override?.layout || homepage.layout),
      navigation: normalizeNavLinks(
        override?.navigation?.links ?? homepage.navigation?.links,
        isRtl,
      ),
      footer: normalizeFooterOptions(override?.footer || homepage.footer, isRtl),
      sectionCopy,
    };
  }, [
    settingsQuery.isLoading,
    settingsQuery.isError,
    overviewLoaded,
    overviewError,
    refetchOverview,
    settings,
    overview,
    identity,
    language,
    isRtl,
    managedTestimonials,
    managedFaqs,
    homepage,
    audience,
  ]);
};

/**
 * Case-insensitive keyword match against the real active modality names.
 * Used to keep marketing cards honest: a card is only shown when the center
 * actually operates a matching modality.
 */
export const matchesActiveModalities = (activeNames: string[], keywords: string[]): boolean => {
  if (!activeNames.length) return false;
  const haystack = activeNames.join(" ").toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
};
