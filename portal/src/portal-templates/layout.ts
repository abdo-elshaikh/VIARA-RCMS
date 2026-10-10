import type { PortalLayout, PortalTemplateId } from "../hooks/use-landing-content";

/**
 * Layout knobs are presentation-only and additive: every option maps to a class
 * name so an admin value can never be rendered as markup. The same names are
 * applied on the page wrapper (PortalLanding) and on the template wrapper, so a
 * draft preview shows the same geometry a visitor will get.
 */
const CONTAINER_CLASS: Record<PortalLayout["container"], string> = {
  wide: "portal-width-wide",
  boxed: "portal-width-boxed",
  narrow: "portal-width-narrow",
};

const SPACING_CLASS: Record<PortalLayout["spacing"], string> = {
  compact: "portal-spacing-compact",
  comfortable: "portal-spacing-comfortable",
  spacious: "portal-spacing-spacious",
};

const HERO_HEIGHT_CLASS: Record<PortalLayout["heroHeight"], string> = {
  compact: "portal-hero-compact",
  standard: "portal-hero-standard",
  tall: "portal-hero-tall",
};

const CARD_STYLE_CLASS: Record<PortalLayout["cardStyle"], string> = {
  soft: "portal-cards-soft",
  outlined: "portal-cards-outlined",
  elevated: "portal-cards-elevated",
};

export const TEMPLATE_CLASS: Record<PortalTemplateId, string> = {
  clinical: "portal-template-clinical",
  modern: "portal-template-modern",
  doctor: "portal-template-professional",
  minimal: "portal-template-minimal",
};

export interface LayoutClassSet {
  root: string;
  container: string;
  spacing: string;
  heroHeight: string;
  cardStyle: string;
}

export const layoutClasses = (
  layout: PortalLayout,
  template: PortalTemplateId,
): LayoutClassSet => ({
  root: [
    TEMPLATE_CLASS[template],
    SPACING_CLASS[layout.spacing],
    HERO_HEIGHT_CLASS[layout.heroHeight],
    CARD_STYLE_CLASS[layout.cardStyle],
  ].join(" "),
  container: CONTAINER_CLASS[layout.container],
  spacing: SPACING_CLASS[layout.spacing],
  heroHeight: HERO_HEIGHT_CLASS[layout.heroHeight],
  cardStyle: CARD_STYLE_CLASS[layout.cardStyle],
});
