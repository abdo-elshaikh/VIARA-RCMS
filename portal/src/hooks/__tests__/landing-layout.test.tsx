import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLandingContent } from "../use-landing-content";

const state = vi.hoisted(() => ({ home: {} as Record<string, unknown> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" } }) }));
vi.mock("../../store/api", () => ({
  useGetPublicCenterSettingsQuery: () => ({
    data: { homepage_settings: state.home },
    isLoading: false,
    isError: false,
  }),
  useGetPublicLandingOverviewQuery: () => ({
    data: { modalities: [] },
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../lib/portal-identity", () => ({
  usePortalIdentity: () => ({ contacts: {} }),
  resolvePortalBranches: () => [],
}));
describe("audience layout overrides", () => {
  beforeEach(() => {
    state.home = {
      sections: [
        { id: "hero", enabled: true, order: 1 },
        { id: "faq", enabled: true, order: 2 },
      ],
    };
  });
  it("uses audience order and component copy with isolated layout and footer", () => {
    state.home.audience = {
      doctors: {
        sections: [{ id: "faq", heading: "Doctor questions" }, { id: "hero" }],
        layout: { container: "boxed" },
        footer: { showContact: false },
        navigation: { links: [{ id: "login", href: "/doctor/login", label: "Doctor account" }] },
      },
    };
    const { result } = renderHook(() => useLandingContent("doctors"));
    expect(result.current.sections.map((section) => section.id)).toEqual(["faq", "hero"]);
    expect(result.current.sectionCopy("faq").heading).toBe("Doctor questions");
    expect(result.current.layout.container).toBe("boxed");
    expect(result.current.footer.showContact).toBe(false);
    expect(result.current.navigation[0].href).toBe("/doctor/login");
  });
  it("does not fall back to shared sections when all audience sections are disabled", () => {
    state.home.audience = { doctors: { sections: [] } };
    const { result } = renderHook(() => useLandingContent("doctors"));
    expect(result.current.sections).toEqual([]);
  });
});
