import { EmptySectionNotice, SectionHost } from "../templateShared";
import { usePortalTemplateFrame } from "../usePortalTemplateFrame";
import type { PortalTemplateShellProps } from "../templateShared";

/**
 * Minimal: a narrow, typography-first column. Marketing flourishes are dropped;
 * only the hero, the primary action path and verified facts remain, in admin
 * order, with tight vertical rhythm.
 */
export const MinimalTemplate = ({
  content,
  onBook,
  onResults,
  onService,
}: PortalTemplateShellProps) => {
  const frame = usePortalTemplateFrame(content, { onBook, onResults, onService });
  const { render, visibleSections, emptySections, isRtl } = frame;

  return (
    <div className="portal-minimal" data-layout="minimal">
      <div className="portal-minimal__column">
        {visibleSections.map((section) => (
          <SectionHost key={section.id} id={section.id}>
            {render(section.id)}
          </SectionHost>
        ))}
      </div>
      {emptySections.map((section) => (
        <EmptySectionNotice key={section.id} id={section.id} isRtl={isRtl} />
      ))}
    </div>
  );
};

export default MinimalTemplate;
