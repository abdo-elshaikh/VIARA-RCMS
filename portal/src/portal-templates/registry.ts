import ClinicalTemplate from "./templates/ClinicalTemplate";
import ModernTemplate from "./templates/ModernTemplate";
import ProfessionalTemplate from "./templates/ProfessionalTemplate";
import MinimalTemplate from "./templates/MinimalTemplate";
import type { PortalTemplateId } from "../hooks/use-landing-content";
import type { PortalTemplateShellProps } from "./templateShared";

/**
 * Component registry. Admin-selectable templates are code-registered rather
 * than rendered from stored markup, so a template choice can never inject
 * arbitrary HTML into the public page.
 */
export const PORTAL_TEMPLATE_REGISTRY: Record<
  PortalTemplateId,
  (props: PortalTemplateShellProps) => JSX.Element
> = {
  clinical: ClinicalTemplate,
  modern: ModernTemplate,
  doctor: ProfessionalTemplate,
  minimal: MinimalTemplate,
};

export const PORTAL_TEMPLATE_OPTIONS: {
  id: PortalTemplateId;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
}[] = [
  {
    id: "clinical",
    labelAr: "سريري",
    labelEn: "Clinical",
    descriptionAr: "عمود واحد واسع بإيقاع واضح، البديل المرجعي.",
    descriptionEn: "A single wide column with a clear rhythm. The reference layout.",
  },
  {
    id: "modern",
    labelAr: "حديث",
    labelEn: "Modern",
    descriptionAr: "شبكة تحريرية بعمودين للأقسام القصيرة مع أقسام كاملة العرض.",
    descriptionEn: "An editorial two-column grid with full-bleed sections.",
  },
  {
    id: "doctor",
    labelAr: "احترافي",
    labelEn: "Professional",
    descriptionAr: "يبدأ ببوابة الطبيب والمريض ثم يعرض المحتوى بشكل مكثف.",
    descriptionEn: "Leads with the doctor portal and keeps cases information-dense.",
  },
  {
    id: "minimal",
    labelAr: "بسيط",
    labelEn: "Minimal",
    descriptionAr: "عمود ضيق يعتمد على النص والإجراء الأساسي فقط.",
    descriptionEn: "A narrow column built on text and the primary action only.",
  },
];
