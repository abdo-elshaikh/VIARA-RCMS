const { z } = require('zod');

const sectionIds = [
  'hero',
  'services',
  'why',
  'journey',
  'locations',
  'testimonials',
  'faq',
  'support',
];
const localized = (max) =>
  z.object({ ar: z.string().max(max).default(''), en: z.string().max(max).default('') }).strict();
const safeUrl = z
  .string()
  .max(1000)
  .refine(
    (value) =>
      !value ||
      (/^\/(?!\/)/.test(value) && !/[\\\s]/.test(value)) ||
      (() => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password;
        } catch {
          return false;
        }
      })(),
    'Use a relative path or an HTTPS URL'
  );
// In-page anchors, relative paths, or HTTPS links are allowed for navigation.
const navUrl = z
  .string()
  .max(300)
  .refine(
    (value) =>
      !value ||
      /^#[a-z0-9_-]+$/i.test(value) ||
      (/^\/(?!\/)/.test(value) && !/[\\\s]/.test(value)) ||
      (() => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password;
        } catch {
          return false;
        }
      })(),
    'Use an in-page anchor, a relative path, or an HTTPS URL'
  );
const EMPTY_TEXT = { ar: '', en: '' };
const hero = z
  .object({ title: localized(220), subtitle: localized(700), imageUrl: safeUrl.default('') })
  .strict();
const sectionItem = z
  .object({
    id: z.enum(sectionIds),
    enabled: z.boolean(),
    heading: localized(160).default(EMPTY_TEXT),
    subheading: localized(400).default(EMPTY_TEXT),
  })
  .strict();
const sections = z
  .array(sectionItem)
  .length(sectionIds.length)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === sectionIds.length,
    'Each section must occur exactly once'
  );
const template = z.enum(['clinical', 'modern', 'professional', 'minimal']);
const DEFAULT_LAYOUT = {
  container: 'wide',
  spacing: 'comfortable',
  heroHeight: 'standard',
  cardStyle: 'soft',
  navStyle: 'floating',
};
const layoutSchema = z
  .object({
    container: z.enum(['wide', 'boxed', 'narrow']).default('wide'),
    spacing: z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'),
    heroHeight: z.enum(['compact', 'standard', 'tall']).default('standard'),
    cardStyle: z.enum(['soft', 'outlined', 'elevated']).default('soft'),
    navStyle: z.enum(['floating', 'solid']).default('floating'),
  })
  .strict()
  .default(DEFAULT_LAYOUT);
const navLink = z
  .object({ id: z.string().min(1).max(40), label: localized(60), href: navUrl })
  .strict();
const navigationSchema = z.object({ links: z.array(navLink).max(8) }).strict().default({ links: [] });
const DEFAULT_FOOTER = { note: EMPTY_TEXT, showServices: true, showPatients: true, showContact: true };
const footerSchema = z
  .object({
    note: localized(300).default(EMPTY_TEXT),
    showServices: z.boolean().default(true),
    showPatients: z.boolean().default(true),
    showContact: z.boolean().default(true),
  })
  .strict()
  .default(DEFAULT_FOOTER);
const override = z
  .object({
    templateId: template.optional(),
    hero: hero.optional(),
    sections: sections.optional(),
    layout: layoutSchema.optional(),
    navigation: navigationSchema.optional(),
    footer: footerSchema.optional(),
  })
  .strict();
const portalPageSchema = z
  .object({
    schemaVersion: z.literal(2),
    enabled: z.boolean(),
    templateId: template,
    theme: z
      .object({
        accentColor: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .or(z.literal('')),
        density: z.enum(['comfortable', 'compact']),
      })
      .strict(),
    layout: layoutSchema,
    navigation: navigationSchema,
    footer: footerSchema,
    hero,
    sections,
    announcement: z.object({ enabled: z.boolean(), text: localized(220), url: safeUrl }).strict(),
    seo: z
      .object({ title: localized(220), description: localized(700), ogImageUrl: safeUrl })
      .strict(),
    faqs: z.array(z.object({ question: localized(400), answer: localized(2000) }).strict()).max(30),
    testimonials: z
      .array(
        z
          .object({
            name: localized(160),
            role: localized(160),
            quote: localized(1200),
            rating: z.number().int().min(1).max(5).optional(),
          })
          .strict()
      )
      .max(20),
    audienceOverrides: z
      .object({ patients: override.optional(), doctors: override.optional() })
      .strict(),
  })
  .strict();
const revisionSchema = z.number().int().nonnegative();
const draftSchema = z.object({ revision: revisionSchema, page: portalPageSchema }).strict();
const publishSchema = z.object({ revision: revisionSchema }).strict();
const restoreSchema = z
  .object({ revision: revisionSchema, versionId: z.number().int().positive() })
  .strict();

const text = (ar = '', en = '') => ({
  ar: typeof ar === 'string' ? ar : '',
  en: typeof en === 'string' ? en : '',
});
const validUrl = (value) => (safeUrl.safeParse(value || '').success ? value || '' : '');
function migrateLegacy(raw = {}) {
  const current = portalPageSchema.safeParse(raw);
  if (current.success) return current.data;
  const stored = Array.isArray(raw.sections) ? raw.sections : [];
  const legacyHero = stored.find((item) => item.id === 'hero')?.content || {};
  const ordered = [...stored]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item) => item.id)
    .filter((id) => sectionIds.includes(id));
  const ids = [...new Set([...ordered, ...sectionIds])];
  return portalPageSchema.parse({
    schemaVersion: 2,
    enabled: raw.enabled !== false,
    templateId:
      raw.template === 'doctor'
        ? 'professional'
        : ['clinical', 'modern', 'minimal'].includes(raw.template)
          ? raw.template
          : 'clinical',
    theme: {
      accentColor: /^#[0-9a-f]{6}$/i.test(raw.theme?.accentColor || raw.accentColor || '')
        ? raw.theme?.accentColor || raw.accentColor
        : '',
      density: raw.theme?.density === 'compact' ? 'compact' : 'comfortable',
    },
    hero: {
      title: text(legacyHero.titleAr || raw.heroTitleAr, legacyHero.title || raw.heroTitle),
      subtitle: text(
        legacyHero.subtitleAr || raw.heroSubtitleAr,
        legacyHero.subtitle || raw.heroSubtitle
      ),
      imageUrl: validUrl(raw.heroImageUrl),
    },
    sections: ids.map((id) => {
      const storedItem = stored.find((item) => item.id === id);
      const content = storedItem?.content || {};
      return {
        id,
        enabled: storedItem?.enabled !== false,
        heading: text(content.headingAr || content.titleAr, content.heading || content.title),
        subheading: text(content.subheadingAr || content.subtitleAr, content.subheading || content.subtitle),
      };
    }),
    announcement: {
      enabled:
        typeof raw.announcement === 'string'
          ? Boolean(raw.announcement)
          : raw.announcement?.enabled === true,
      text: text(
        raw.announcement?.textAr,
        typeof raw.announcement === 'string' ? raw.announcement : raw.announcement?.text
      ),
      url: validUrl(raw.announcement?.url),
    },
    seo: {
      title: text(raw.seo?.titleAr, raw.seo?.title),
      description: text(raw.seo?.descriptionAr, raw.seo?.description),
      ogImageUrl: validUrl(raw.seo?.ogImageUrl),
    },
    faqs: (Array.isArray(raw.faqs) ? raw.faqs : [])
      .slice(0, 30)
      .map((item) => ({
        question: text(item.qAr, item.qEn || item.q),
        answer: text(item.aAr, item.aEn || item.a),
      })),
    testimonials: (Array.isArray(raw.testimonials) ? raw.testimonials : [])
      .slice(0, 20)
      .map((item) => ({
        name: text(item.nameAr, item.nameEn || item.name),
        role: text(item.roleAr, item.roleEn || item.role),
        quote: text(item.quoteAr, item.quoteEn || item.quote),
        ...(Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5
          ? { rating: item.rating }
          : {}),
      })),
    audienceOverrides: Object.fromEntries(
      ['patients', 'doctors']
        .filter((key) => raw.audience?.[key])
        .map((key) => {
          const value = raw.audience[key];
          return [
            key,
            {
              ...(value.hero
                ? {
                    hero: {
                      title: text(value.hero.titleAr, value.hero.title),
                      subtitle: text(value.hero.subtitleAr, value.hero.subtitle),
                      imageUrl: '',
                    },
                  }
                : {}),
              ...(Array.isArray(value.sections)
                ? {
                    sections: [
                      ...new Set([
                        ...value.sections.filter((id) => sectionIds.includes(id)),
                        ...sectionIds,
                      ]),
                    ].map((id) => ({ id, enabled: value.sections.includes(id) })),
                  }
                : {}),
            },
          ];
        })
    ),
  });
}

// Compatibility projection for existing landing components. Never exposes draft metadata.
function publicProjection(page) {
  const parsed = portalPageSchema.parse(page);
  const flattenHero = (value) => ({
    title: value.title.en,
    titleAr: value.title.ar,
    subtitle: value.subtitle.en,
    subtitleAr: value.subtitle.ar,
    imageUrl: value.imageUrl,
  });
  return {
    ...parsed,
    template: parsed.templateId === 'professional' ? 'doctor' : parsed.templateId,
    heroTitle: parsed.hero.title.en,
    heroTitleAr: parsed.hero.title.ar,
    heroSubtitle: parsed.hero.subtitle.en,
    heroSubtitleAr: parsed.hero.subtitle.ar,
    heroImageUrl: parsed.hero.imageUrl,
    layout: parsed.layout,
    navigation: {
      links: parsed.navigation.links.map((link) => ({
        id: link.id,
        label: link.label.en,
        labelAr: link.label.ar,
        href: link.href,
      })),
    },
    footer: {
      note: parsed.footer.note.en,
      noteAr: parsed.footer.note.ar,
      showServices: parsed.footer.showServices,
      showPatients: parsed.footer.showPatients,
      showContact: parsed.footer.showContact,
    },
    sections: parsed.sections.map((item, index) => ({
      id: item.id,
      enabled: item.enabled,
      order: index + 1,
      heading: item.heading.en,
      headingAr: item.heading.ar,
      subheading: item.subheading.en,
      subheadingAr: item.subheading.ar,
    })),
    announcement: {
      enabled: parsed.announcement.enabled,
      text: parsed.announcement.text.en,
      textAr: parsed.announcement.text.ar,
      url: parsed.announcement.url,
    },
    seo: {
      title: parsed.seo.title.en,
      titleAr: parsed.seo.title.ar,
      description: parsed.seo.description.en,
      descriptionAr: parsed.seo.description.ar,
      ogImageUrl: parsed.seo.ogImageUrl,
    },
    faqs: parsed.faqs.map((item) => ({
      qAr: item.question.ar,
      qEn: item.question.en,
      aAr: item.answer.ar,
      aEn: item.answer.en,
    })),
    testimonials: parsed.testimonials.map((item) => ({
      nameAr: item.name.ar,
      nameEn: item.name.en,
      roleAr: item.role.ar,
      roleEn: item.role.en,
      quoteAr: item.quote.ar,
      quoteEn: item.quote.en,
      rating: item.rating,
    })),
    audience: Object.fromEntries(
      Object.entries(parsed.audienceOverrides).map(([key, value]) => [
        key,
        {
          ...value,
          hero: value.hero ? flattenHero(value.hero) : undefined,
          layout: value.layout,
          navigation: value.navigation
            ? {
                links: value.navigation.links.map((link) => ({
                  id: link.id,
                  label: link.label.en,
                  labelAr: link.label.ar,
                  href: link.href,
                })),
              }
            : undefined,
          footer: value.footer
            ? {
                note: value.footer.note.en,
                noteAr: value.footer.note.ar,
                showServices: value.footer.showServices,
                showPatients: value.footer.showPatients,
                showContact: value.footer.showContact,
              }
            : undefined,
          sections: value.sections
            ?.filter((item) => item.enabled)
            .map((item) => ({
              id: item.id,
              heading: item.heading.en,
              headingAr: item.heading.ar,
              subheading: item.subheading.en,
              subheadingAr: item.subheading.ar,
            })),
        },
      ])
    ),
  };
}
module.exports = {
  sectionIds,
  portalPageSchema,
  draftSchema,
  publishSchema,
  restoreSchema,
  migrateLegacy,
  publicProjection,
};
