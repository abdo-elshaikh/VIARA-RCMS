import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useLandingContent, type PortalAudience } from "../hooks/use-landing-content";
import { useGetPublicCenterSettingsQuery } from "../store/api";
import { portalPreviewToken } from "../lib/portal-preview";
import { layoutClasses } from "./layout";
import { PORTAL_TEMPLATE_REGISTRY } from "./registry";

interface Props {
  onBook: (serviceId?: string) => void;
  onResults: () => void;
  onService: (id: string) => void;
  audience: PortalAudience;
  onAudienceChange: (audience: PortalAudience) => void;
}

export default function PortalTemplateContent({
  onBook,
  onResults,
  onService,
  audience,
  onAudienceChange,
}: Props) {
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith("ar");
  const content = useLandingContent(audience);
  const { data: settings } = useGetPublicCenterSettingsQuery();
  const Template = PORTAL_TEMPLATE_REGISTRY[content.template];
  const classes = layoutClasses(content.layout, content.template);

  if (content.isError)
    return (
      <div role="alert" className="mx-auto max-w-3xl p-12 text-center">
        {ar
          ? "تعذر تحميل إعدادات البوابة. أعد تحميل الصفحة."
          : "Unable to load portal settings. Reload this page."}
      </div>
    );
  if (content.isLoading)
    return (
      <div role="status" className="p-12 text-center">
        {ar ? "جارٍ تحميل البوابة…" : "Loading portal…"}
      </div>
    );
  if (!content.published)
    return (
      <section className="mx-auto max-w-3xl space-y-6 p-12 text-center">
        <h1 className="text-3xl font-bold">{content.identity.center.name}</h1>
        <p>
          {ar
            ? "للحجز والاستفسار، تواصل مع المركز أو ادخل إلى حسابك."
            : "Contact the center or sign in to your account."}
        </p>
        <div className="flex flex-wrap justify-center gap-5">
          <Link to="/patient/login">{ar ? "دخول المريض" : "Patient sign in"}</Link>
          <Link to="/doctor/login">{ar ? "دخول الطبيب" : "Doctor sign in"}</Link>
          {content.contactPhone && (
            <a href={`tel:${content.contactPhone.replace(/[^\d+]/g, "")}`}>
              {content.contactPhone}
            </a>
          )}
        </div>
      </section>
    );

  return (
    <div
      className={`${classes.root} ${
        settings?.homepage_settings?.theme?.density === "compact" ? "portal-density-compact" : ""
      }`}
      data-template={content.template}
      data-container={content.layout.container}
    >
      {portalPreviewToken && (
        <div role="status" className="bg-amber-100 p-3 text-center text-sm text-amber-950">
          {ar ? "معاينة مسودة — غير منشورة" : "Draft preview — unpublished"}
        </div>
      )}
      {content.announcement?.enabled && (
        <aside className="bg-primary p-3 text-center text-white">
          {content.announcement.url ? (
            <a href={content.announcement.url}>{content.announcement.text}</a>
          ) : (
            content.announcement.text
          )}
        </aside>
      )}
      <div
        className="mx-auto flex max-w-7xl flex-wrap justify-center gap-3 px-4 py-5"
        role="group"
        aria-label={ar ? "نوع الزائر" : "Visitor audience"}
      >
        {(["patients", "doctors"] as const).map((target) => (
          <button
            type="button"
            key={target}
            aria-pressed={audience === target}
            onClick={() => onAudienceChange(target)}
            className={`rounded-full border px-6 py-3 text-sm font-semibold ${
              audience === target
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface"
            }`}
          >
            {target === "patients"
              ? ar
                ? "أنا مريض"
                : "I am a patient"
              : ar
                ? "أنا طبيب"
                : "I am a doctor"}
          </button>
        ))}
      </div>
      <Template content={content} onBook={onBook} onResults={onResults} onService={onService} />
    </div>
  );
}
