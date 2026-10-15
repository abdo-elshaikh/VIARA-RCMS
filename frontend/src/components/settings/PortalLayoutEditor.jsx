import React from 'react';
import { useTranslation } from 'react-i18next';

import { TEMPLATE_LAYOUTS } from '../../config/portalTemplateLayouts';

export function TemplateDiagram({ id, sections, color = '#087F5B' }) {
  return (
    <div
      aria-hidden="true"
      className={`mb-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2 ${id === 'minimal' ? 'mx-auto max-w-[180px]' : ''}`}
    >
      <div className="mb-2 flex justify-between rounded bg-white p-1.5">
        <span className="h-2 w-7 rounded" style={{ background: color }} />
        <span className="h-2 w-16 rounded bg-slate-200" />
      </div>
      <div
        className={`mb-2 grid gap-1 rounded p-2 ${id === 'modern' ? 'grid-cols-2 h-16' : 'h-10'}`}
        style={{ background: `${color}18` }}
      >
        <div className="space-y-1">
          <div className="h-2 w-3/4 rounded" style={{ background: color }} />
          <div className="h-1.5 w-full rounded bg-slate-200" />
        </div>
        {id === 'modern' && <div className="rounded" style={{ background: `${color}40` }} />}
      </div>
      <div
        className={`grid gap-1 ${id === 'professional' ? 'grid-cols-2' : id === 'minimal' ? 'grid-cols-1' : 'grid-cols-3'}`}
      >
        {(sections || [1, 2, 3, 4, 5, 6]).map((section, index) => (
          <div key={section.id || index} className="h-5 rounded border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="mt-2 h-3 rounded" style={{ background: color }} />
    </div>
  );
}

export default function PortalLayoutEditor({ page, onChange }) {
  const { t } = useTranslation('settings');
  const tr = (key) => t(`settings.portalBuilder.layout.${key}`);
  const layout = page.layout || TEMPLATE_LAYOUTS.clinical;
  const navigation = page.navigation || { links: [] };
  const footer = page.footer || {
    note: { ar: '', en: '' },
    showServices: true,
    showPatients: true,
    showContact: true,
  };
  const controls = [
    ['container', ['wide', 'boxed', 'narrow']],
    ['spacing', ['compact', 'comfortable', 'spacious']],
    ['heroHeight', ['compact', 'standard', 'tall']],
    ['cardStyle', ['soft', 'outlined', 'elevated']],
    ['navStyle', ['floating', 'solid']],
  ];
  const bilingual = (title, value, change, maxLength = 60) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {['ar', 'en'].map((lang) => (
          <label key={lang} className="text-xs">
            {lang === 'ar' ? 'العربية' : 'English'}
            <input
              className="input-field w-full"
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              value={value?.[lang] || ''}
              maxLength={maxLength}
              onChange={(event) => change({ ...value, [lang]: event.target.value })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <section
      id="portal-layout"
      className="scroll-mt-32 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
    >
      <h3 className="text-lg font-bold">{tr('title')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {controls.map(([key, values]) => (
          <label key={key} className="space-y-2 text-sm">
            <span>{tr(key)}</span>
            <select
              className="input-field w-full"
              value={layout[key]}
              onChange={(event) => onChange({ layout: { ...layout, [key]: event.target.value } })}
            >
              {values.map((value) => (
                <option key={value} value={value}>
                  {tr(value)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <h4 className="font-bold">{tr('navigation')}</h4>
      <p className="text-xs text-slate-500">{tr('navigationHelp')}</p>
      {navigation.links.map((link, index) => (
        <div key={link.id} className="space-y-3 rounded-xl border p-3">
          {bilingual(tr('linkLabel'), link.label, (value) =>
            onChange({
              navigation: {
                links: navigation.links.map((item, i) =>
                  i === index ? { ...item, label: value } : item
                ),
              },
            })
          )}
          <label className="block text-sm">
            {tr('linkHref')}
            <input
              dir="ltr"
              className="input-field w-full"
              value={link.href}
              maxLength={300}
              placeholder="#services-section"
              onChange={(event) =>
                onChange({
                  navigation: {
                    links: navigation.links.map((item, i) =>
                      i === index ? { ...item, href: event.target.value } : item
                    ),
                  },
                })
              }
            />
          </label>
          <button
            type="button"
            className="text-sm text-red-600"
            onClick={() =>
              onChange({ navigation: { links: navigation.links.filter((_, i) => i !== index) } })
            }
          >
            {tr('removeLink')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary"
        disabled={navigation.links.length >= 8}
        onClick={() =>
          onChange({
            navigation: {
              links: [
                ...navigation.links,
                { id: crypto.randomUUID(), label: { ar: '', en: '' }, href: '' },
              ],
            },
          })
        }
      >
        {tr('addLink')}
      </button>
      <h4 className="font-bold">{tr('footer')}</h4>
      {bilingual(tr('footerNote'), footer.note, (note) => onChange({ footer: { ...footer, note } }), 300)}
      <div className="flex flex-wrap gap-5">
        {[
          ['showServices', tr('showServices')],
          ['showPatients', tr('showPatients')],
          ['showContact', tr('showContact')],
        ].map(([key, title]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={footer[key]}
              onChange={(event) => onChange({ footer: { ...footer, [key]: event.target.checked } })}
            />
            {title}
          </label>
        ))}
      </div>
    </section>
  );
}