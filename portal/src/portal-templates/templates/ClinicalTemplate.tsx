import { EmptySectionNotice, SectionHost } from "../templateShared";
import { usePortalTemplateFrame } from "../usePortalTemplateFrame";
import type { PortalTemplateShellProps } from "../templateShared";

/**
 * Clinical: the reference layout. One wide, centered column per section in the
 * admin-defined order, with the most generous vertical rhythm of all templates.
 */
export const ClinicalTemplate = ({
  content,
  onBook,
  onResults,
  onService,
}: PortalTemplateShellProps) => {
  const frame = usePortalTemplateFrame(content, { onBook, onResults, onService });
  const { render, visibleSections, emptySections, isRtl } = frame;

  return (
    <div className="portal-stack portal-stack--clinical" data-layout="clinical">
      {visibleSections.map((section) => (
        <SectionHost key={section.id} id={section.id}>
          {render(section.id)}
        </SectionHost>
      ))}
      {emptySections.map((section) => (
        <EmptySectionNotice key={section.id} id={section.id} isRtl={isRtl} />
      ))}
    </div>
  );
};

export default ClinicalTemplate;
