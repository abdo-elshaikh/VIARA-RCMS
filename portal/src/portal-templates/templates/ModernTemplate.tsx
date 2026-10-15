import { type ReactNode } from "react";
import type { PortalSectionConfig } from "../../hooks/use-landing-content";
import { EmptySectionNotice, SectionHost } from "../templateShared";
import { usePortalTemplateFrame } from "../usePortalTemplateFrame";
import type { PortalTemplateShellProps } from "../templateShared";

/**
 * Modern: an editorial two-column canvas. Services, why, testimonials, faq and
 * support are paired side by side inside a bounded grid, while hero, journey and
 * locations stay full-bleed because they carry the primary action or data.
 */
const FULL_WIDTH: PortalSectionConfig["id"][] = ["hero", "journey", "locations"];

export const ModernTemplate = ({
  content,
  onBook,
  onResults,
  onService,
}: PortalTemplateShellProps) => {
  const frame = usePortalTemplateFrame(content, { onBook, onResults, onService });
  const { render, visibleSections, emptySections, isRtl } = frame;
  const cell = (section: PortalSectionConfig): ReactNode => (
    <SectionHost key={section.id} id={section.id}>
      {render(section.id)}
    </SectionHost>
  );

  return (
    <div className="portal-modern" data-layout="modern">
      <div className="portal-modern__grid">
        {visibleSections.map((section) => (
          <div
            key={section.id}
            className={`portal-modern__cell ${FULL_WIDTH.includes(section.id) ? "portal-modern__cell--full" : ""}`}
          >
            {cell(section)}
          </div>
        ))}
      </div>
      {emptySections.map((section) => (
        <EmptySectionNotice key={section.id} id={section.id} isRtl={isRtl} />
      ))}
    </div>
  );
};

export default ModernTemplate;
