import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LandingContent } from "../../hooks/use-landing-content";
import { PORTAL_TEMPLATE_REGISTRY } from "../registry";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("../../lib/portal-preview", () => ({ portalPreviewToken: "" }));
vi.mock("../sectionNodes", () => ({
  buildPortalSectionNodes: (content: LandingContent) =>
    Object.fromEntries(content.sections.map((section) => [section.id, <span>{section.id}</span>])),
  isSectionEmpty: (_content: LandingContent, id: string) => id === "testimonials",
}));

describe("complete portal layouts", () => {
  it.each(["clinical", "modern", "doctor", "minimal"] as const)(
    "%s respects component order and visibility",
    (template) => {
      const content = {
        sections: ["faq", "services", "hero", "support", "testimonials", "locations"].map(
          (id, order) => ({ id, order, enabled: id !== "locations" }),
        ),
      } as LandingContent;
      const Template = PORTAL_TEMPLATE_REGISTRY[template];
      const { container } = render(
        <MemoryRouter>
          <Template content={content} onBook={vi.fn()} onResults={vi.fn()} onService={vi.fn()} />
        </MemoryRouter>,
      );
      expect(
        [...container.querySelectorAll("[data-portal-section]")].map((node) =>
          node.getAttribute("data-portal-section"),
        ),
      ).toEqual(["faq", "services", "hero", "support"]);
    },
  );
});
