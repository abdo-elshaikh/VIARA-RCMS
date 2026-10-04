import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { EmptySectionNotice, SectionHost } from "../templateShared";
import { usePortalTemplateFrame } from "../usePortalTemplateFrame";
import type { PortalTemplateShellProps } from "../templateShared";

interface PortalCard {
  title: string;
  body: string;
  href: string;
  featured?: boolean;
}

/**
 * Professional: the referring-physician layout. It leads with the two portal
 * entry points and keeps the marketing sections in a compact, information-dense
 * single column so clinical readers reach the sign-in path immediately.
 */
export const ProfessionalTemplate = ({
  content,
  onBook,
  onResults,
  onService,
}: PortalTemplateShellProps) => {
  const frame = usePortalTemplateFrame(content, { onBook, onResults, onService });
  const { render, visibleSections, emptySections, isRtl } = frame;

  const cards: PortalCard[] = [
    {
      title: isRtl ? "بوابة الطبيب" : "Doctor portal",
      body: isRtl
        ? "ادخل لمتابعة الحالات والتقارير المصرح بها."
        : "Sign in to review authorized cases and reports.",
      href: "/doctor/login",
      featured: true,
    },
    {
      title: isRtl ? "بوابة المريض" : "Patient portal",
      body: isRtl
        ? "ادخل إلى حسابك للاطلاع على الفحوصات والتقارير المتاحة."
        : "Sign in to see your available studies and reports.",
      href: "/patient/login",
    },
  ];

  const cell = (id: string): ReactNode => (
    <SectionHost key={id} id={id}>
      {render(id)}
    </SectionHost>
  );

  return (
    <div className="portal-professional" data-layout="professional">
      <section className="portal-professional__entry">
        <div className="portal-professional__entry-grid">
          {cards.map((card) => (
            <Link
              key={card.href}
              to={card.href}
              className={`portal-professional__card${card.featured ? " portal-professional__card--featured" : ""}`}
            >
              <h2>{card.title}</h2>
              <p>{card.body}</p>
              <span className="portal-professional__cta">{isRtl ? "تسجيل الدخول" : "Sign in"}</span>
            </Link>
          ))}
        </div>
      </section>
      {visibleSections.map((section) => cell(section.id))}
      {emptySections.map((section) => (
        <EmptySectionNotice key={section.id} id={section.id} isRtl={isRtl} />
      ))}
    </div>
  );
};

export default ProfessionalTemplate;
