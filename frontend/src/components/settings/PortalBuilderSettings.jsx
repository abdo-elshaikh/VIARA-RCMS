import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Eye,
  Globe,
  HelpCircle,
  History,
  Image as ImageIcon,
  Laptop,
  Maximize2,
  MessageSquare,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  X
} from 'lucide-react';
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

const MEDICAL_COLOR_PRESETS = [
  { hex: '#087F5B', label: 'الزمردي الطبي (Emerald)' },
  { hex: '#0284C7', label: 'أزرق الرعاية (Sky Blue)' },
  { hex: '#1D4ED8', label: 'كحلي ملكي (Royal Navy)' },
  { hex: '#0D9488', label: 'تيل تخصصي (Clinical Teal)' },
  { hex: '#6366F1', label: 'نيلي حديث (Modern Indigo)' },
];

function LocalizedField({ label, value, onChange, multiline = false, maxLength }) {
  const { t } = useTranslation('settings');
  const Input = multiline ? 'textarea' : 'input';
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {['ar', 'en'].map((language) => {
          const currentVal = value?.[language] || '';
          const count = currentVal.length;
          return (
            <label className="space-y-1 text-xs text-slate-500" key={language}>
              <div className="flex items-center justify-between">
                <span>{t(`settings.portalBuilder.${language}`)}</span>
                {maxLength && (
                  <span
                    aria-hidden="true"
                    className={`font-mono text-[10px] ${
                      count >= maxLength
                        ? 'font-bold text-rose-500'
                        : count > maxLength * 0.85
                        ? 'text-amber-500'
                        : 'text-slate-400'
                    }`}
                  >
                    {count}/{maxLength}
                  </span>
                )}
              </div>
              <Input
                aria-label={t(`settings.portalBuilder.${language}`)}
                dir={language === 'ar' ? 'rtl' : 'ltr'}
                value={currentVal}
                maxLength={maxLength}
                rows={multiline ? 3 : undefined}
                onChange={(event) => onChange({ ...value, [language]: event.target.value })}
                className={inputClass}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ImageFieldWithPreview({ label, value, onChange, placeholder = 'https://...', tr }) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    setHasError(false);
  }, [value]);

  return (
    <div className="space-y-2 text-sm">
      <label className="block text-sm font-semibold">
        <span>{label}</span>
        <input
          className={inputClass}
          dir="ltr"
          maxLength={1000}
          value={value || ''}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {value && value.trim().length > 5 && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/50">
          {!hasError ? (
            <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700">
              <img
                src={value}
                alt="Preview"
                className="h-full w-full object-cover"
                onError={() => setHasError(true)}
              />
            </div>
          ) : (
            <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-500 text-[10px] text-center p-1 font-semibold dark:border-rose-900/50 dark:bg-rose-950/50">
              <AlertCircle size={14} className="mx-auto" />
            </div>
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-bold text-slate-700 dark:text-slate-300">
              {hasError ? tr('invalidImage') : tr('imagePreview')}
            </p>
            <p className="font-mono text-[10px] text-slate-400 truncate" dir="ltr">
              {value}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
            title="Clear image"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function PortalBuilderSettings() {
  const { t, i18n } = useTranslation('settings');
  const ar = i18n.language.startsWith('ar');
  const tr = useCallback((key, params) => t(`settings.portalBuilder.${key}`, params), [t]);
  const langKey = ar ? 'ar' : 'en';

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
  const [previewViewport, setPreviewViewport] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

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

  const override = audience === 'shared' ? null : page?.audienceOverrides?.[audience];
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

  const moveToExtreme = (index, toTop = true) => {
    const items = [...effective.sections];
    const [target] = items.splice(index, 1);
    if (toTop) {
      items.unshift(target);
    } else {
      items.push(target);
    }
    updateAudience({ sections: items });
  };

  const toggleAllSections = (enable) => {
    const sections = effective.sections.map((item) => ({ ...item, enabled: enable }));
    updateAudience({ sections });
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

  const resetTemplateDefaults = () => {
    if (!window.confirm(tr('resetToTemplate') + '?')) return;
    applyTemplate(effective.templateId);
    toast.success(tr('resetToTemplate'));
  };

  const handleConfirmPublish = async () => {
    await run(async () => {
      const next = await persist();
      accept(await publish({ revision: next.revision }).unwrap());
      await versions.refetch();
      setIsPublishModalOpen(false);
      toast.success(tr('published'));
    });
  };

  if (query.isLoading || (!page && !query.isError))
    return (
      <div role="status" className="p-8 text-center text-sm font-bold text-slate-400">
        <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-teal-600" />
        <span>{tr('loading')}</span>
      </div>
    );

  if (query.isError)
    return (
      <div role="alert" className="space-y-3 p-8 text-center">
        <p className="text-sm font-bold text-rose-600">{tr('failed')}</p>
        <button className="btn-secondary text-xs" onClick={query.refetch}>
          {tr('reload')}
        </button>
      </div>
    );

  const heroTitleText = effective?.hero?.title?.[langKey] || (ar ? 'مركز فيارا التخصصي للأشعة والتشخيص الطبي' : 'VIARA Medical Imaging & Diagnostics Center');
  const heroSubtitleText = effective?.hero?.subtitle?.[langKey] || (ar ? 'رعاية تشخيصية متقدمة بأحدث أجهزة التصوير الطبي الرقمي وتقارير سريرية معتمدة' : 'Advanced diagnostic care with cutting-edge medical imaging modalities and certified radiology reports.');
  const accentColor = page?.theme?.accentColor || '#087F5B';

  return (
    <div className="space-y-6" aria-busy={busy}>
      {/* Top Glassmorphic Control Deck */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 shadow-xs">
            <Palette size={22} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white sm:text-xl">
              {tr('title')}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                dirty
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              }`}>
                {dirty ? <Clock size={11} /> : <CheckCircle2 size={11} />}
                <span>{dirty ? tr('unsavedState') : tr('savedState')}</span>
              </span>
              <span>·</span>
              <span className="font-mono">
                {tr('publishedVersion')}: #{record.published_version_id || '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs font-bold"
            disabled={busy || !dirty || conflict}
            onClick={() =>
              run(async () => {
                await persist();
                toast.success(tr('saved'));
              })
            }
          >
            <Save size={15} />
            <span>{tr('save')}</span>
          </button>

          <button
            type="button"
            className="btn-secondary text-xs font-bold"
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
            <Eye size={15} />
            <span>{tr('preview')}</span>
          </button>

          <button
            type="button"
            className="btn-primary text-xs font-bold"
            disabled={busy || conflict}
            onClick={() => setIsPublishModalOpen(true)}
          >
            <Globe size={15} />
            <span>{tr('publish')}</span>
          </button>
        </div>
      </div>

      {/* Guide Banner with Anchor Links */}
      <div className="rounded-3xl border border-teal-500/20 bg-gradient-to-l from-teal-500/10 via-white to-sky-500/5 p-5 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:from-slate-900 dark:to-slate-850">
        <p className="font-black text-slate-900 dark:text-white text-sm sm:text-base">
          {ar
            ? 'صمّم تجربة متكاملة لزوار المركز'
            : 'Design a complete experience for your visitors'}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {ar
            ? 'اختر قالبًا، خصّص التخطيط والمكونات، ثم عاين المسودة قبل النشر. يمكنك تخصيص تجربة المرضى والأطباء بشكل مستقل.'
            : 'Choose a template, customize its layout and components, then preview before publishing. Patients and doctors can have their own experience.'}
        </p>
        <nav
          className="mt-3.5 flex flex-wrap gap-2"
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
              className="rounded-xl border border-teal-500/20 bg-white/90 px-3 py-1.5 text-xs font-bold text-teal-800 shadow-2xs transition hover:bg-teal-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-teal-300"
            >
              {title}
            </a>
          ))}
        </nav>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50/90 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          <p>{error}</p>
          {conflict && (
            <button
              type="button"
              className="mt-2.5 inline-flex items-center gap-1 font-bold text-rose-900 underline dark:text-rose-100"
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
              <RefreshCw size={13} />
              <span>{tr('reload')}</span>
            </button>
          )}
        </div>
      )}

      {/* Embedded Live Preview Frame with Viewport Switcher */}
      {previewUrl && (
        <div className="space-y-3 rounded-3xl border border-teal-500/30 bg-teal-500/5 p-5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-500/20 pb-3">
            <div className="flex items-center gap-3">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-black text-teal-800 underline dark:text-teal-300">
                <ExternalLink size={14} />
                <span>{tr('openPreview')}</span>
              </a>
              <span className="text-slate-300">|</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">{tr('previewHelp')}</p>
            </div>

            <div className="flex items-center gap-2">
              {/* Responsive Viewport Switcher */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setPreviewViewport('desktop')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    previewViewport === 'desktop'
                      ? 'bg-teal-500 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                  title={tr('viewport.desktop')}
                >
                  <Laptop size={14} />
                  <span className="hidden sm:inline">{tr('viewport.desktop')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport('tablet')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    previewViewport === 'tablet'
                      ? 'bg-teal-500 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                  title={tr('viewport.tablet')}
                >
                  <Tablet size={14} />
                  <span className="hidden sm:inline">{tr('viewport.tablet')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport('mobile')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    previewViewport === 'mobile'
                      ? 'bg-teal-500 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                  title={tr('viewport.mobile')}
                >
                  <Smartphone size={14} />
                  <span className="hidden sm:inline">{tr('viewport.mobile')}</span>
                </button>
              </div>

              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white p-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                onClick={() => setPreviewUrl('')}
                title={tr('closePreview')}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Iframe Viewport Container */}
          <div className="flex justify-center transition-all duration-300">
            <div
              className={`w-full transition-all duration-300 ${
                previewViewport === 'tablet'
                  ? 'max-w-[768px] rounded-3xl border-4 border-slate-800 shadow-2xl p-1 bg-slate-900'
                  : previewViewport === 'mobile'
                  ? 'max-w-[390px] rounded-3xl border-8 border-slate-800 shadow-2xl p-1 bg-slate-900'
                  : 'w-full'
              }`}
            >
              <iframe
                title={tr('previewFrameTitle')}
                src={previewUrl}
                className="h-[72vh] w-full rounded-2xl border border-slate-200 bg-white"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Form Body */}
      <fieldset disabled={busy} className="grid min-w-0 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* SECTION 1: Design & Hero */}
          <section
            id="portal-design"
            className="scroll-mt-32 space-y-5 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90"
          >
            <label className="block space-y-2 text-sm font-semibold">
              <span className="font-bold text-slate-900 dark:text-white">{tr('audience')}</span>
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
              <div className="flex items-center justify-between gap-3 text-xs rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {override ? tr('customized') : tr('inherited')}
                </span>
                {override && (
                  <button
                    type="button"
                    className="font-bold text-rose-600 hover:underline"
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

            {/* Template Selector Cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((id) => (
                <button
                  type="button"
                  key={id}
                  disabled={busy}
                  aria-pressed={effective.templateId === id}
                  onClick={() => applyTemplate(id)}
                  className={`rounded-2xl border p-4 text-start transition-all ${
                    effective.templateId === id
                      ? 'border-teal-500 bg-teal-500/10 text-teal-950 dark:text-teal-200 shadow-xs'
                      : 'border-slate-200 bg-white/60 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-850'
                  }`}
                >
                  <TemplateDiagram
                    id={id}
                    color={
                      /^#[0-9a-f]{6}$/i.test(page.theme.accentColor)
                        ? page.theme.accentColor
                        : undefined
                    }
                  />
                  <span className="block font-black text-sm">{tr(`templates.${id}`)}</span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {tr(`templates.${id}Description`)}
                  </span>
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

            <ImageFieldWithPreview
              label={tr('heroImage')}
              value={effective.hero.imageUrl}
              onChange={(imageUrl) => updateAudience({ hero: { ...effective.hero, imageUrl } })}
              tr={tr}
            />

            {/* Live Hero Banner Simulator Card */}
            <div className="mt-4 rounded-3xl border border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Sparkles size={14} className="text-teal-600 dark:text-teal-400" />
                  <span>{tr('livePreviewCard')}</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {tr(audience)}
                </span>
              </div>

              <div
                className="relative overflow-hidden rounded-2xl p-6 text-white shadow-lg transition-all"
                style={{
                  background: effective.hero.imageUrl
                    ? `linear-gradient(rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0.9)), url(${effective.hero.imageUrl}) center/cover`
                    : `linear-gradient(135deg, ${accentColor}, #0f172a)`
                }}
              >
                <div className="max-w-md space-y-2">
                  <h4 className="text-lg font-black leading-snug break-words">
                    {heroTitleText}
                  </h4>
                  <p className="text-xs text-white/80 leading-relaxed break-words">
                    {heroSubtitleText}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <span
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-xs"
                      style={{ backgroundColor: accentColor }}
                    >
                      {ar ? 'احجز موعد فحص' : 'Book Appointment'}
                    </span>
                    <span className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-xs">
                      {ar ? 'استعلام عن نتيجة فحص' : 'Check Results'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2: Layout Editor */}
          <PortalLayoutEditor page={effective} onChange={updateAudience} />

          {/* SECTION 3: Components Reordering & Controls */}
          <section
            id="portal-components"
            className="scroll-mt-32 space-y-4 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  {tr('sections')}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {tr('sectionsHelp')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-teal-500/10 border border-teal-500/30 px-2.5 py-0.5 font-mono text-[11px] font-bold text-teal-700 dark:text-teal-300">
                  {tr('activeSectionsCount', {
                    enabled: effective.sections.filter((s) => s.enabled).length,
                    total: effective.sections.length,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => toggleAllSections(true)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {tr('enableAll')}
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllSections(false)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {tr('disableAll')}
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {effective.sections.map((section, index) => (
                <div
                  key={section.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50 shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2.5 cursor-pointer">
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
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {tr(`sectionLabels.${section.id}`)}
                      </span>
                    </label>

                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      section.enabled
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-200/60 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {section.enabled ? tr('activeOnPage') : tr('hiddenFromVisitors')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      aria-label={`${tr('moveToTop')} ${tr(`sectionLabels.${section.id}`)}`}
                      onClick={() => moveToExtreme(index, true)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      title={tr('moveToTop')}
                    >
                      <ArrowUpToLine size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      aria-label={`${tr('up')} ${tr(`sectionLabels.${section.id}`)}`}
                      onClick={() => move(index, -1)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === effective.sections.length - 1}
                      aria-label={`${tr('down')} ${tr(`sectionLabels.${section.id}`)}`}
                      onClick={() => move(index, 1)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === effective.sections.length - 1}
                      aria-label={`${tr('moveToBottom')} ${tr(`sectionLabels.${section.id}`)}`}
                      onClick={() => moveToExtreme(index, false)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      title={tr('moveToBottom')}
                    >
                      <ArrowDownToLine size={14} />
                    </button>
                  </div>

                  {section.id !== 'hero' && (
                    <details className="w-full pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-teal-700 dark:hover:text-teal-300">
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
            </div>
          </section>

          {/* SECTION 4: Urgent Announcement */}
          <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <h3 id="portal-content" className="scroll-mt-32 font-black text-slate-900 dark:text-white text-base">
              {tr('announcement')}
            </h3>
            <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={page.announcement.enabled}
                onChange={(event) =>
                  update({ announcement: { ...page.announcement, enabled: event.target.checked } })
                }
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>{tr('enabled')}</span>
            </label>
            <LocalizedField
              label={tr('announcement')}
              value={page.announcement.text}
              maxLength={220}
              onChange={(text) => update({ announcement: { ...page.announcement, text } })}
            />
            <label className="block space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>{tr('link')}</span>
              <input
                dir="ltr"
                className={inputClass}
                placeholder="https://... or /patient/booking"
                value={page.announcement.url}
                onChange={(event) =>
                  update({ announcement: { ...page.announcement, url: event.target.value } })
                }
              />
            </label>
          </section>

          {/* SECTION 5: FAQs */}
          <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-black text-slate-900 dark:text-white text-base">{tr('faq')}</h3>
              <button
                type="button"
                disabled={page.faqs.length >= 30}
                className="ds-button ds-button-secondary ds-button-sm text-xs font-bold flex items-center gap-1.5"
                onClick={() =>
                  update({ faqs: [...page.faqs, { question: EMPTY_TEXT, answer: EMPTY_TEXT }] })
                }
              >
                <Plus size={14} />
                <span>{tr('add')}</span>
              </button>
            </div>
            {page.faqs.map((item, index) => (
              <div key={index} className="space-y-3.5 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 shadow-2xs">
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
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-800"
                    onClick={() => update({ faqs: page.faqs.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={14} />
                    <span>{tr('remove')}</span>
                  </button>
                </div>
              </div>
            ))}

            {/* Interactive FAQ Live Accordion Simulator */}
            {page.faqs.length > 0 && page.faqs.some((f) => f.question[langKey]) && (
              <div className="mt-4 rounded-3xl border border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40 space-y-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  <HelpCircle size={14} className="text-teal-600 dark:text-teal-400" />
                  <span>{tr('livePreviewCard')} (FAQ)</span>
                </span>
                <div className="divide-y divide-slate-200/80 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                  {page.faqs.map((faq, idx) => {
                    const q = faq.question[langKey] || faq.question.ar || faq.question.en;
                    const a = faq.answer[langKey] || faq.answer.ar || faq.answer.en;
                    if (!q) return null;
                    const isOpen = openFaqIndex === idx;
                    return (
                      <div key={idx} className="p-3">
                        <button
                          type="button"
                          onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                          className="flex w-full items-center justify-between text-start text-xs font-bold text-slate-800 dark:text-slate-200"
                        >
                          <span>{q}</span>
                          <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isOpen && (
                          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 pt-2 dark:border-slate-800">
                            {a}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* SECTION 6: Testimonials */}
          <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  {tr('testimonials')}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {tr('testimonialHelp')}
                </p>
              </div>
              <button
                type="button"
                disabled={page.testimonials.length >= 20}
                className="ds-button ds-button-secondary ds-button-sm text-xs font-bold flex items-center gap-1.5"
                onClick={() =>
                  update({
                    testimonials: [
                      ...page.testimonials,
                      { name: EMPTY_TEXT, role: EMPTY_TEXT, quote: EMPTY_TEXT },
                    ],
                  })
                }
              >
                <Plus size={14} />
                <span>{tr('add')}</span>
              </button>
            </div>
            {page.testimonials.map((item, index) => (
              <div key={index} className="space-y-3.5 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 shadow-2xs">
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
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-800"
                    onClick={() =>
                      update({ testimonials: page.testimonials.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 size={14} />
                    <span>{tr('remove')}</span>
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* SECTION 7: SEO & Social Sharing with Google & Social Simulators */}
          <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <h3 id="portal-seo" className="scroll-mt-32 font-black text-slate-900 dark:text-white text-base">
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
            <ImageFieldWithPreview
              label={tr('shareImage')}
              value={page.seo.ogImageUrl}
              onChange={(ogImageUrl) => update({ seo: { ...page.seo, ogImageUrl } })}
              tr={tr}
            />

            {/* Google Search Result Simulator */}
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Search size={14} className="text-teal-600 dark:text-teal-400" />
                <span>{tr('googlePreview')}</span>
              </span>
              <p className="text-[11px] text-slate-500">{tr('searchResultSim')}</p>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-2xs space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400" dir="ltr">
                  <div className="grid h-4 w-4 place-items-center rounded-full bg-teal-500/20 text-teal-700 dark:text-teal-300 text-[10px] font-bold">
                    V
                  </div>
                  <span>viara.health › portal</span>
                </div>
                <h4 className="text-base font-bold text-blue-600 hover:underline cursor-pointer dark:text-blue-400">
                  {page.seo.title[langKey] || effective.hero.title[langKey] || heroTitleText}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {page.seo.description[langKey] || effective.hero.subtitle[langKey] || heroSubtitleText}
                </p>
              </div>

              {/* Social Share Preview Card (WhatsApp / X) */}
              <div className="pt-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  <Share2 size={14} className="text-sky-600 dark:text-sky-400" />
                  <span>{tr('socialPreview')}</span>
                </span>
                <p className="text-[11px] text-slate-500 mb-2">{tr('socialResultSim')}</p>
                <div className="max-w-md rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-sm">
                  {page.seo.ogImageUrl && (
                    <div className="h-32 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <img src={page.seo.ogImageUrl} alt={page.seo.title?.[langKey] ? `${page.seo.title[langKey]} — social preview image` : 'Social preview image'} className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="p-3 space-y-1">
                    <p className="text-[10px] font-mono uppercase text-slate-400" dir="ltr">VIARA.HEALTH</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                      {page.seo.title[langKey] || effective.hero.title[langKey] || heroTitleText}
                    </p>
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {page.seo.description[langKey] || effective.hero.subtitle[langKey] || heroSubtitleText}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* SIDEBAR: Blueprint, Colors & Versions */}
        <aside className="space-y-6">
          {/* Blueprint */}
          <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-slate-900 dark:text-white text-sm">
                {ar ? 'مخطط الصفحة' : 'Page structure'}
              </h3>
              <button
                type="button"
                onClick={resetTemplateDefaults}
                className="text-[11px] font-bold text-teal-700 hover:underline dark:text-teal-300 flex items-center gap-1"
                title={tr('resetToTemplate')}
              >
                <RotateCcw size={12} />
                <span>{ar ? 'استعادة' : 'Reset'}</span>
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
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
            <ol className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              {effective.sections
                .filter((section) => section.enabled)
                .map((section, index) => (
                  <li key={section.id} className="flex items-center gap-2">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-mono font-bold dark:bg-slate-800">
                      {index + 1}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {tr(`sectionLabels.${section.id}`)}
                    </span>
                  </li>
                ))}
            </ol>
          </section>

          {/* Display & Medical Color Presets */}
          <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <h3 className="font-black text-slate-900 dark:text-white text-sm">{tr('display')}</h3>
            <label className="flex items-center gap-3 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={page.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>{tr('portalEnabled')}</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">{tr('disabledHelp')}</p>

            {/* Accent Color with Visual Picker & Presets */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {tr('accent')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={page.theme.accentColor || '#087F5B'}
                  onChange={(event) =>
                    update({ theme: { ...page.theme, accentColor: event.target.value } })
                  }
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-slate-700 dark:bg-slate-950"
                  title="Choose custom color"
                />
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
              </div>

              {/* Medical Color Presets */}
              <div className="pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  {tr('colorPresets')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {MEDICAL_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => update({ theme: { ...page.theme, accentColor: preset.hex } })}
                      className="group relative h-6 w-6 rounded-lg border border-slate-200 shadow-2xs transition hover:scale-110 dark:border-slate-700"
                      style={{ backgroundColor: preset.hex }}
                      title={preset.label}
                    >
                      {page.theme.accentColor === preset.hex && (
                        <Check size={12} className="mx-auto text-white" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{tr('inheritColor')}</p>
            </div>
          </section>

          {/* Versions History & 1-Click Rollback */}
          <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <h3 className="flex items-center gap-2 font-black text-slate-900 dark:text-white text-sm">
              <History size={17} className="text-teal-600 dark:text-teal-400" />
              <span>{tr('versions')}</span>
            </h3>
            {versions.isError ? (
              <button type="button" className="btn-secondary text-xs" onClick={versions.refetch}>
                {tr('reload')}
              </button>
            ) : (
              (versions.data || []).map((version) => (
                <div className="rounded-2xl border border-slate-200 bg-white/60 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/50 shadow-2xs" key={version.version_id}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      #{version.version_id}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(version.published_at).toLocaleString(undefined, {
                        timeZone: 'Africa/Cairo',
                      })}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mt-2.5 text-xs font-bold text-teal-700 underline hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-100"
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
              <p className="text-xs text-slate-500 dark:text-slate-400">{tr('noVersions')}</p>
            )}
          </section>
        </aside>
      </fieldset>

      {/* PUBLISH CONFIRMATION MODAL */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-teal-500/30 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Globe size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {tr('confirmPublish.title')}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-slate-600 dark:text-slate-300">
              <p className="leading-relaxed font-semibold">
                {tr('confirmPublish.message')}
              </p>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/60 space-y-2">
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {tr('confirmPublish.summaryTitle')}
                </p>
                <div className="flex justify-between text-slate-500">
                  <span>{tr('confirmPublish.template')}:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {tr(`templates.${effective.templateId}`)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>{tr('confirmPublish.sections')}:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {effective.sections.filter((s) => s.enabled).length} / {effective.sections.length}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>{tr('audience')}:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {tr(audience)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="ds-button ds-button-secondary ds-button-sm text-xs font-bold"
              >
                {tr('confirmPublish.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={busy}
                className="ds-button ds-button-primary ds-button-sm text-xs font-bold flex items-center gap-1.5"
              >
                {busy ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}
                <span>{tr('confirmPublish.confirmAction')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
