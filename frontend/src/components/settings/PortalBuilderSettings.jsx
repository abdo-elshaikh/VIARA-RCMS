import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Eye, Globe, History, Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useGetPortalBuilderQuery,
  useGetPortalVersionsQuery,
  useSavePortalDraftMutation,
  usePublishPortalMutation,
  useRestorePortalMutation,
  usePreviewPortalMutation,
} from '../../store/api/portalBuilderApi';
import { getPortalUrl } from '../../utils/portalUrls';
import { registerNavigationGuard } from '../../utils/navigationGuard';
import PortalLayoutEditor, { TemplateDiagram } from './PortalLayoutEditor';
import { TEMPLATE_LAYOUTS } from '../../config/portalTemplateLayouts';

const EMPTY_TEXT = { ar: '', en: '' };
const TEMPLATES = ['clinical', 'modern', 'professional', 'minimal'];
const ORDERS = {
  clinical: ['hero', 'services', 'why', 'journey', 'locations', 'testimonials', 'faq', 'support'],
  modern: ['hero', 'services', 'locations', 'why', 'testimonials', 'journey', 'faq', 'support'],
  professional: [
    'hero',
    'services',
    'faq',
    'support',
    'locations',
    'why',
    'journey',
    'testimonials',
  ],
  minimal: ['hero', 'services', 'locations', 'support', 'faq', 'why', 'journey', 'testimonials'],
};
const inputClass = 'input-field w-full';
function LocalizedField({ label, value, onChange, multiline = false, maxLength }) {
  const { t } = useTranslation('settings');
  const Input = multiline ? 'textarea' : 'input';
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {['ar', 'en'].map((language) => (
          <label className="space-y-1 text-xs text-slate-500" key={language}>
            <span>{t(`settings.portalBuilder.${language}`)}</span>
            <Input
              dir={language === 'ar' ? 'rtl' : 'ltr'}
              value={value?.[language] || ''}
              maxLength={maxLength}
              rows={multiline ? 3 : undefined}
              onChange={(event) => onChange({ ...value, [language]: event.target.value })}
              className={inputClass}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function PortalBuilderSettings() {
  const { t, i18n } = useTranslation('settings');
  const ar = i18n.language.startsWith('ar');
  const tr = useCallback((key) => t(`settings.portalBuilder.${key}`), [t]);
  const query = useGetPortalBuilderQuery();
  const versions = useGetPortalVersionsQuery();
  const [save] = useSavePortalDraftMutation();
  const [publish] = usePublishPortalMutation();
  const [restore] = useRestorePortalMutation();
  const [preview] = usePreviewPortalMutation();
  const [record, setRecord] = useState(null);
  const [page, setPage] = useState(null);
  const [audience, setAudience] = useState('shared');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const dirty = Boolean(record && page && JSON.stringify(record.draft) !== JSON.stringify(page));
  useEffect(() => {
    if (query.data && !record) {
      setRecord(query.data);
      setPage(query.data.draft);
    }
  }, [query.data, record]);
  useEffect(
    () => registerNavigationGuard(() => !dirty || window.confirm(tr('unsaved'))),
    [dirty, tr]
  );
  useEffect(() => {
    const handler = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const update = (patch) => {
    setPage((current) => ({ ...current, ...patch }));
    setPreviewUrl('');
  };
  const accept = (next) => {
    setRecord(next);
    setPage(next.draft);
    setPreviewUrl('');
    setConflict(false);
  };
  const run = async (work) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setConflict(failure.status === 409);
      const details = failure.data?.details
        ?.map((item) => `${item.path}: ${item.message}`)
        .join(' · ');
      setError(
        failure.status === 409 ? tr('conflict') : details || failure.data?.message || tr('failed')
      );
    } finally {
      setBusy(false);
    }
  };
  const persist = async () => {
    if (!dirty) return record;
    const next = await save({ revision: record.revision, page }).unwrap();
    accept(next);
    return next;
  };
  const override = audience === 'shared' ? null : page?.audienceOverrides[audience];
  const effective = page ? { ...page, ...override } : null;
  const updateAudience = (patch) =>
    audience === 'shared'
      ? update(patch)
      : update({
          audienceOverrides: { ...page.audienceOverrides, [audience]: { ...override, ...patch } },
        });
  const move = (index, delta) => {
    const items = [...effective.sections];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    updateAudience({ sections: items });
  };
  const applyTemplate = (templateId) => {
    const sections = ORDERS[templateId].map((id) => ({
      ...effective.sections.find((item) => item.id === id),
      id,
      enabled:
        templateId === 'minimal'
          ? ['hero', 'services', 'locations', 'support'].includes(id)
          : effective.sections.find((item) => item.id === id)?.enabled !== false,
    }));
    updateAudience({ templateId, sections, layout: TEMPLATE_LAYOUTS[templateId] });
  };
  if (query.isLoading || (!page && !query.isError))
    return (
      <div role="status" className="p-8">
        {tr('loading')}
      </div>
    );
  if (query.isError)
    return (
      <div role="alert" className="space-y-3 p-8">
        <p>{tr('failed')}</p>
        <button className="btn-secondary" onClick={query.refetch}>
          {tr('reload')}
        </button>
      </div>
    );
  return (
    <div className="space-y-6" aria-busy={busy}>
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div>
          <h2 className="text-xl font-bold">{tr('title')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {dirty ? tr('unsavedState') : tr('savedState')} · {tr('publishedVersion')}:{' '}
            {record.published_version_id || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || !dirty || conflict}
            onClick={() =>
              run(async () => {
                await persist();
                toast.success(tr('saved'));
              })
            }
          >
            <Save size={16} />
            {tr('save')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || conflict}
            onClick={() =>
              run(async () => {
                const next = await persist();
                const session = await preview({ revision: next.revision }).unwrap();
                setPreviewUrl(
                  getPortalUrl(
                    `/?target=${audience === 'doctors' ? 'doctors' : 'patients'}#preview=${session.token}`
                  )
                );
              })
            }
          >
            <Eye size={16} />
            {tr('preview')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || conflict}
            onClick={() =>
              run(async () => {
                const next = await persist();
                accept(await publish({ revision: next.revision }).unwrap());
                await versions.refetch();
                toast.success(tr('published'));
              })
            }
          >
            <Globe size={16} />
            {tr('publish')}
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-50 to-white p-5 dark:border-slate-700 dark:from-slate-900 dark:to-slate-800">
        <p className="font-semibold">
          {ar
            ? 'صمّم تجربة متكاملة لزوار المركز'
            : 'Design a complete experience for your visitors'}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {ar
            ? 'اختر قالبًا، خصّص التخطيط والمكونات، ثم عاين المسودة قبل النشر. يمكنك تخصيص تجربة المرضى والأطباء بشكل مستقل.'
            : 'Choose a template, customize its layout and components, then preview before publishing. Patients and doctors can have their own experience.'}
        </p>
        <nav
          className="mt-4 flex flex-wrap gap-2"
          aria-label={ar ? 'أقسام محرر البوابة' : 'Portal editor sections'}
        >
          {[
            ['portal-design', ar ? 'القالب والمقدمة' : 'Template and hero'],
            ['portal-layout', ar ? 'تخطيط الصفحة' : 'Page layout'],
            ['portal-components', ar ? 'المكونات' : 'Components'],
            ['portal-content', ar ? 'المحتوى' : 'Content'],
            ['portal-seo', ar ? 'البحث والمشاركة' : 'Search and sharing'],
          ].map(([id, title]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
            >
              {title}
            </a>
          ))}
        </nav>
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
          <p>{error}</p>
          {conflict && (
            <button
              type="button"
              className="mt-3 underline"
              onClick={() =>
                run(async () => {
                  if (window.confirm(tr('unsaved'))) {
                    const result = await query.refetch();
                    if (result.data) {
                      accept(result.data);
                      setError('');
                    }
                  }
                })
              }
            >
              {tr('reload')}
            </button>
          )}
        </div>
      )}
      {previewUrl && (
        <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <div className="flex flex-wrap items-center gap-3">
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">
              {tr('openPreview')}
            </a>
            <button type="button" className="text-sm underline" onClick={() => setPreviewUrl('')}>
              {tr('closePreview')}
            </button>
          </div>
          <p className="text-sm">{tr('previewHelp')}</p>
          <iframe
            title={tr('previewFrameTitle')}
            src={previewUrl}
            className="h-[70vh] w-full rounded-xl border border-emerald-200 bg-white"
            loading="lazy"
          />
        </div>
      )}
      <fieldset disabled={busy} className="grid min-w-0 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section
            id="portal-design"
            className="scroll-mt-32 space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-700"
          >
            <label className="block space-y-2 text-sm font-semibold">
              {tr('audience')}
              <select
                className={inputClass}
                value={audience}
                disabled={busy}
                onChange={(event) => {
                  setAudience(event.target.value);
                  setPreviewUrl('');
                }}
              >
                {['shared', 'patients', 'doctors'].map((value) => (
                  <option key={value} value={value}>
                    {tr(value)}
                  </option>
                ))}
              </select>
            </label>
            {audience !== 'shared' && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{override ? tr('customized') : tr('inherited')}</span>
                {override && (
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => {
                      const overrides = { ...page.audienceOverrides };
                      delete overrides[audience];
                      update({ audienceOverrides: overrides });
                    }}
                  >
                    {tr('resetAudience')}
                  </button>
                )}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((id) => (
                <button
                  type="button"
                  key={id}
                  disabled={busy}
                  aria-pressed={effective.templateId === id}
                  onClick={() => applyTemplate(id)}
                  className={`rounded-xl border p-4 text-start ${effective.templateId === id ? 'border-emerald-600 bg-emerald-50 text-emerald-950' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <TemplateDiagram
                    id={id}
                    color={
                      /^#[0-9a-f]{6}$/i.test(page.theme.accentColor)
                        ? page.theme.accentColor
                        : undefined
                    }
                  />
                  <span className="block font-bold">{tr(`templates.${id}`)}</span>
                  <span className="mt-2 block text-xs">{tr(`templates.${id}Description`)}</span>
                </button>
              ))}
            </div>
            <LocalizedField
              label={tr('heroTitle')}
              value={effective.hero.title}
              maxLength={220}
              onChange={(title) => updateAudience({ hero: { ...effective.hero, title } })}
            />
            <LocalizedField
              label={tr('heroSubtitle')}
              value={effective.hero.subtitle}
              maxLength={700}
              multiline
              onChange={(subtitle) => updateAudience({ hero: { ...effective.hero, subtitle } })}
            />
            <label className="block space-y-2 text-sm">
              {tr('heroImage')}
              <input
                className={inputClass}
                dir="ltr"
                maxLength={1000}
                value={effective.hero.imageUrl}
                onChange={(event) =>
                  updateAudience({ hero: { ...effective.hero, imageUrl: event.target.value } })
                }
              />
            </label>
          </section>
          <PortalLayoutEditor page={effective} onChange={updateAudience} />
          <section
            id="portal-components"
            className="scroll-mt-32 space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-700"
          >
            <h3 className="font-bold">{tr('sections')}</h3>
            <p className="text-sm text-slate-500">{tr('sectionsHelp')}</p>
            {effective.sections.map((section, index) => (
              <div
                key={section.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    onChange={(event) =>
                      updateAudience({
                        sections: effective.sections.map((item) =>
                          item.id === section.id ? { ...item, enabled: event.target.checked } : item
                        ),
                      })
                    }
                  />
                  {tr(`sectionLabels.${section.id}`)}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    aria-label={`${tr('up')} ${tr(`sectionLabels.${section.id}`)}`}
                    onClick={() => move(index, -1)}
                    className="rounded-lg border p-2 disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === effective.sections.length - 1}
                    aria-label={`${tr('down')} ${tr(`sectionLabels.${section.id}`)}`}
                    onClick={() => move(index, 1)}
                    className="rounded-lg border p-2 disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
                {section.id !== 'hero' && (
                  <details className="w-full">
                    <summary className="cursor-pointer text-sm text-slate-500">
                      {ar
                        ? 'تخصيص عنوان ووصف المكون'
                        : 'Customize component heading and description'}
                    </summary>
                    <div className="mt-3 grid w-full gap-3 sm:grid-cols-2">
<LocalizedField
                      label={tr('sectionHeading')}
                      value={section.heading || EMPTY_TEXT}
                      maxLength={160}
                        onChange={(heading) =>
                          updateAudience({
                            sections: effective.sections.map((item) =>
                              item.id === section.id ? { ...item, heading } : item
                            ),
                          })
                        }
                      />
<LocalizedField
                      label={tr('sectionDescription')}
                      value={section.subheading || EMPTY_TEXT}
                      maxLength={400}
                        onChange={(subheading) =>
                          updateAudience({
                            sections: effective.sections.map((item) =>
                              item.id === section.id ? { ...item, subheading } : item
                            ),
                          })
                        }
                      />
                    </div>
                  </details>
                )}
              </div>
            ))}
          </section>
          <section className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
            <h3 id="portal-content" className="scroll-mt-32 font-bold">
              {tr('announcement')}
            </h3>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={page.announcement.enabled}
                onChange={(event) =>
                  update({ announcement: { ...page.announcement, enabled: event.target.checked } })
                }
              />
              {tr('enabled')}
            </label>
            <LocalizedField
              label={tr('announcement')}
              value={page.announcement.text}
              maxLength={220}
              onChange={(text) => update({ announcement: { ...page.announcement, text } })}
            />
            <label className="block space-y-2 text-sm">
              {tr('link')}
              <input
                dir="ltr"
                className={inputClass}
                value={page.announcement.url}
                onChange={(event) =>
                  update({ announcement: { ...page.announcement, url: event.target.value } })
                }
              />
            </label>
          </section>
          <section className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
            <div className="flex justify-between">
              <h3 className="font-bold">{tr('faq')}</h3>
              <button
                type="button"
                disabled={page.faqs.length >= 30}
                className="btn-secondary"
                onClick={() =>
                  update({ faqs: [...page.faqs, { question: EMPTY_TEXT, answer: EMPTY_TEXT }] })
                }
              >
                <Plus size={16} />
                {tr('add')}
              </button>
            </div>
            {page.faqs.map((item, index) => (
              <div key={index} className="space-y-4 rounded-xl border p-4">
                <LocalizedField
                  label={tr('question')}
                  value={item.question}
                  maxLength={220}
                  onChange={(question) =>
                    update({
                      faqs: page.faqs.map((entry, i) =>
                        i === index ? { ...entry, question } : entry
                      ),
                    })
                  }
                />
                <LocalizedField
                  label={tr('answer')}
                  value={item.answer}
                  maxLength={2000}
                  multiline
                  onChange={(answer) =>
                    update({
                      faqs: page.faqs.map((entry, i) =>
                        i === index ? { ...entry, answer } : entry
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm text-red-600"
                  onClick={() => update({ faqs: page.faqs.filter((_, i) => i !== index) })}
                >
                  <Trash2 size={16} />
                  {tr('remove')}
                </button>
              </div>
            ))}
          </section>
          <section className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
            <div className="flex justify-between">
              <h3 className="font-bold">{tr('testimonials')}</h3>
              <button
                type="button"
                disabled={page.testimonials.length >= 20}
                className="btn-secondary"
                onClick={() =>
                  update({
                    testimonials: [
                      ...page.testimonials,
                      { name: EMPTY_TEXT, role: EMPTY_TEXT, quote: EMPTY_TEXT },
                    ],
                  })
                }
              >
                <Plus size={16} />
                {tr('add')}
              </button>
            </div>
            <p className="text-sm text-slate-500">{tr('testimonialHelp')}</p>
            {page.testimonials.map((item, index) => (
              <div key={index} className="space-y-4 rounded-xl border p-4">
                {['name', 'role', 'quote'].map((field) => (
                  <LocalizedField
                    key={field}
                    label={tr(field)}
                    value={item[field]}
                    maxLength={field === 'quote' ? 1000 : 160}
                    multiline={field === 'quote'}
                    onChange={(value) =>
                      update({
                        testimonials: page.testimonials.map((entry, i) =>
                          i === index ? { ...entry, [field]: value } : entry
                        ),
                      })
                    }
                  />
                ))}
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm text-red-600"
                  onClick={() =>
                    update({ testimonials: page.testimonials.filter((_, i) => i !== index) })
                  }
                >
                  <Trash2 size={16} />
                  {tr('remove')}
                </button>
              </div>
            ))}
          </section>
          <section className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
            <h3 id="portal-seo" className="scroll-mt-32 font-bold">
              {tr('seo')}
            </h3>
            <LocalizedField
              label={tr('seoTitle')}
              value={page.seo.title}
              maxLength={220}
              onChange={(title) => update({ seo: { ...page.seo, title } })}
            />
            <LocalizedField
              label={tr('seoDescription')}
              value={page.seo.description}
              maxLength={700}
              multiline
              onChange={(description) => update({ seo: { ...page.seo, description } })}
            />
            <label className="block space-y-2 text-sm">
              {tr('shareImage')}
              <input
                className={inputClass}
                dir="ltr"
                value={page.seo.ogImageUrl}
                onChange={(event) =>
                  update({ seo: { ...page.seo, ogImageUrl: event.target.value } })
                }
              />
            </label>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-4 font-bold">{ar ? 'مخطط الصفحة' : 'Page structure'}</h3>
            <p className="mb-3 text-xs text-slate-500">
              {ar
                ? 'مخطط مبسّط لترتيب المكونات. استخدم المعاينة لفتح الصفحة الفعلية.'
                : 'A schematic of component order. Use Preview to open the actual page.'}
            </p>
            <TemplateDiagram
              id={effective.templateId}
              sections={effective.sections.filter((section) => section.enabled)}
              color={
                /^#[0-9a-f]{6}$/i.test(page.theme.accentColor) ? page.theme.accentColor : undefined
              }
            />
            <ol className="space-y-2 text-sm">
              {effective.sections
                .filter((section) => section.enabled)
                .map((section, index) => (
                  <li key={section.id}>
                    {index + 1}. {tr(`sectionLabels.${section.id}`)}
                  </li>
                ))}
            </ol>
          </section>
          <section className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
            <h3 className="font-bold">{tr('display')}</h3>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={page.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
              {tr('portalEnabled')}
            </label>
            <p className="text-xs text-slate-500">{tr('disabledHelp')}</p>
            <label className="block space-y-2 text-sm">
              {tr('accent')}
              <input
                className={inputClass}
                dir="ltr"
                placeholder="#087F5B"
                maxLength={7}
                value={page.theme.accentColor}
                onChange={(event) =>
                  update({ theme: { ...page.theme, accentColor: event.target.value } })
                }
              />
            </label>
            <p className="text-xs text-slate-500">{tr('inheritColor')}</p>
          </section>
          <section className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
            <h3 className="flex items-center gap-2 font-bold">
              <History size={18} />
              {tr('versions')}
            </h3>
            {versions.isError ? (
              <button type="button" className="btn-secondary" onClick={versions.refetch}>
                {tr('reload')}
              </button>
            ) : (
              (versions.data || []).map((version) => (
                <div className="rounded-xl border p-3 text-sm" key={version.version_id}>
                  <p>
                    #{version.version_id} ·{' '}
                    {new Date(version.published_at).toLocaleString(undefined, {
                      timeZone: 'Africa/Cairo',
                    })}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-emerald-700 underline"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        if (dirty && !window.confirm(tr('unsaved'))) return;
                        accept(
                          await restore({
                            revision: record.revision,
                            versionId: Number(version.version_id),
                          }).unwrap()
                        );
                        toast.success(tr('restored'));
                      })
                    }
                  >
                    {tr('restore')}
                  </button>
                </div>
              ))
            )}
            {versions.data?.length === 0 && (
              <p className="text-sm text-slate-500">{tr('noVersions')}</p>
            )}
          </section>
        </aside>
      </fieldset>
    </div>
  );
}
