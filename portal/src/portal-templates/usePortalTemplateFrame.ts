import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LandingContent, PortalSectionConfig } from "../hooks/use-landing-content";
import {
  buildPortalSectionNodes,
  isSectionEmpty,
  type PortalSectionHandlers,
} from "./sectionNodes";
import { portalPreviewToken } from "../lib/portal-preview";

export interface PortalTemplateFrame {
  nodes: Record<string, ReactNode>;
  visibleSections: PortalSectionConfig[];
  emptySections: PortalSectionConfig[];
  isRtl: boolean;
  preview: boolean;
  render: (id: string) => ReactNode;
}

export const usePortalTemplateFrame = (
  content: LandingContent,
  handlers: PortalSectionHandlers,
): PortalTemplateFrame => {
  const { i18n } = useTranslation();
  const nodes = buildPortalSectionNodes(content, handlers);
  const preview = Boolean(portalPreviewToken);
  const visibleSections = content.sections.filter(
    (section) => section.enabled && !isSectionEmpty(content, section.id),
  );
  return {
    nodes,
    visibleSections,
    emptySections: preview
      ? content.sections.filter((section) => section.enabled && isSectionEmpty(content, section.id))
      : [],
    isRtl: !!i18n.language?.startsWith("ar"),
    preview,
    render: (id) => nodes[id] ?? null,
  };
};
