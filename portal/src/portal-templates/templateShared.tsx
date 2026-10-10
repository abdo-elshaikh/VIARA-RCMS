import type { ReactNode } from "react";
import type { LandingContent } from "../hooks/use-landing-content";
import type { PortalSectionHandlers } from "./sectionNodes";

export interface PortalTemplateShellProps extends PortalSectionHandlers {
  content: LandingContent;
}

export const SectionHost = ({ id, children }: { id: string; children: ReactNode }) => (
  <div data-portal-section={id}>{children}</div>
);

export const EmptySectionNotice = ({ id, isRtl }: { id: string; isRtl: boolean }) => (
  <p className="mx-auto my-4 max-w-6xl rounded-xl border border-dashed border-amber-400 p-4 text-sm">
    {isRtl
      ? `القسم ${id} مخفي عن الزوار لعدم وجود بيانات معتمدة.`
      : `${id} is hidden from visitors because no approved data is available.`}
  </p>
);
