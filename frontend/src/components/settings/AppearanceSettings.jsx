import React from 'react';
import toast from 'react-hot-toast';
import { useEffect, useState } from 'react';
import {
    Accessibility,
    Activity,
    CheckCircle2,
    Eye,
    Gauge,
    Laptop,
    LayoutList,
    Moon,
    Palette,
    RotateCcw,
    SlidersHorizontal,
    Sparkles,
    Sun,
    Type,
    Zap,
    Hexagon,
    Square
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { DEFAULT_PREFERENCES, selectPreferences, updateAllPreferences } from '../../store/preferencesSlice';
import { useUpdatePreferencesMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { getContrastColor, mixHexColors, SEMANTIC_PALETTE_DEFAULTS } from '../../utils/themePalette';
import {
    SettingsChoice as ChoiceButton,
    SettingsFact as Fact,
    SettingsPanel as Panel,
    SettingsSwitch as Toggle,
    SettingsSyncStatus,
    settingsPanelClass,
} from './SettingsControls';

const DEFAULT_APPEARANCE = DEFAULT_PREFERENCES;

const THEMES = [
    { id: 'light', icon: Sun },
    { id: 'dark', icon: Moon },
    { id: 'system', icon: Laptop }
];

const COLORS = [
    { id: 'emerald', name: 'VIARA Emerald', value: '#087F5B', bg: 'bg-emerald-700', ring: 'ring-emerald-600', text: 'text-emerald-700 dark:text-emerald-300' },
    { id: 'cyan', name: 'VIARA Emerald Legacy', value: '#087F5B', bg: 'bg-emerald-700', ring: 'ring-emerald-600', text: 'text-emerald-700 dark:text-emerald-300' },
    { id: 'indigo', name: 'Clinical Neutral', value: '#5F6F6B', bg: 'bg-slate-600', ring: 'ring-slate-500', text: 'text-slate-600 dark:text-slate-300' },
    { id: 'rose', name: 'Critical Coral', value: '#D95757', bg: 'bg-rose-600', ring: 'ring-rose-500', text: 'text-rose-600 dark:text-rose-400' },
    { id: 'amber', name: 'AI Amber', value: '#F4B942', bg: 'bg-amber-500', ring: 'ring-amber-400', text: 'text-amber-700 dark:text-amber-300' },
    { id: 'slate', name: 'Clinical Charcoal', value: '#172326', bg: 'bg-slate-900', ring: 'ring-slate-700', text: 'text-slate-800 dark:text-slate-300' },
    { id: 'custom', name: 'Custom Hex', value: 'custom', bg: 'bg-slate-900', ring: 'ring-slate-800', text: 'text-slate-900 dark:text-slate-100' }
];

const FONT_FAMILIES = [
    { id: 'inter', name: 'Inter (Default)', class: 'font-sans' },
    { id: 'system', name: 'System UI', class: 'font-sans' },
    { id: 'mono', name: 'Monospace', class: 'font-mono' },
    { id: 'dyslexic', name: 'Readable', class: 'font-sans' }
];

const BORDER_RADII = [
    { id: 'sharp', name: 'Sharp', value: '0px', class: 'rounded-none' },
    { id: 'small', name: 'Subtle', value: '4px', class: 'rounded' },
    { id: 'medium', name: 'Default', value: '12px', class: 'rounded-xl' },
    { id: 'large', name: 'Smooth', value: '16px', class: 'rounded-2xl' },
    { id: 'full', name: 'Pill', value: '9999px', class: 'rounded-full' }
];

const FONT_SCALES = [
    { id: 'small', px: 12, scale: '85%' },
    { id: 'normal', px: 14, scale: '100%' },
    { id: 'large', px: 16, scale: '115%' },
    { id: 'xlarge', px: 18, scale: '130%' }
];

const DENSITIES = [
    { id: 'compact', py: 'py-1 px-2', gap: 'gap-1' },
    { id: 'comfortable', py: 'py-2 px-3', gap: 'gap-2' },
    { id: 'spacious', py: 'py-3 px-4', gap: 'gap-3' }
];

const SEMANTIC_COLOR_OPTIONS = [
    ['canvas', 'Canvas'],
    ['surface', 'Surface'],
    ['surfaceSecondary', 'Secondary surface'],
    ['surfaceMuted', 'Muted surface'],
    ['border', 'Border'],
    ['borderStrong', 'Strong border'],
    ['text', 'Primary text'],
    ['textSecondary', 'Secondary text'],
    ['textMuted', 'Muted text'],
    ['success', 'Success'],
    ['warning', 'Warning'],
    ['danger', 'Danger'],
    ['info', 'Information'],
    ['viewerBackground', 'Viewer canvas'],
    ['viewerPanel', 'Viewer panel'],
];

const safeHex = (value, fallback = '#087F5B') => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);
const isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(value || '');

const AppearanceSettings = () => {
    const { t } = useTranslation('settings');
    const dispatch = useDispatch();
    const stored = useSelector(selectPreferences) || {};
    const preferences = { ...DEFAULT_APPEARANCE, ...stored };
    const [updatePreferences, { isLoading }] = useUpdatePreferencesMutation();
    const [customColorDraft, setCustomColorDraft] = useState(preferences.customColor || DEFAULT_APPEARANCE.customColor);

    useEffect(() => {
        setCustomColorDraft(preferences.customColor || DEFAULT_APPEARANCE.customColor);
    }, [preferences.customColor]);

    const persist = async (changes) => {
        const previous = preferences;
        const next = { ...preferences, ...changes };
        dispatch(updateAllPreferences(next));
        try {
            await updatePreferences(next).unwrap();
            toast.success(t('settings.appearance.saved', { defaultValue: 'Appearance settings updated.' }));
            return true;
        } catch (error) {
            dispatch(updateAllPreferences(previous));
            toast.error(getErrorMessage(error, t('settings.errors.preferenceSaveFailed', { defaultValue: 'Failed to save appearance settings.' })));
            return false;
        }
    };

    const reset = () => persist({
        theme: DEFAULT_APPEARANCE.theme,
        primaryColor: DEFAULT_APPEARANCE.primaryColor,
        customColor: DEFAULT_APPEARANCE.customColor,
        colorOverrides: DEFAULT_APPEARANCE.colorOverrides,
        density: DEFAULT_APPEARANCE.density,
        fontScale: DEFAULT_APPEARANCE.fontScale,
        fontFamily: DEFAULT_APPEARANCE.fontFamily,
        borderRadius: DEFAULT_APPEARANCE.borderRadius,
        highContrast: DEFAULT_APPEARANCE.highContrast,
        motion: DEFAULT_APPEARANCE.motion,
        compactSidebar: DEFAULT_APPEARANCE.compactSidebar
    });

    const selectedColor = preferences.primaryColor === 'custom'
        ? { ...COLORS.find(c => c.id === 'custom'), value: safeHex(preferences.customColor) }
        : (COLORS.find(c => c.id === preferences.primaryColor) || COLORS[0]);
    const semanticOverrideCount = ['light', 'dark'].reduce(
        (count, mode) => count + Object.keys(preferences.colorOverrides?.[mode] || {}).length,
        0
    );

    const updateSemanticColor = (mode, key, value) => persist({
        colorOverrides: {
            ...preferences.colorOverrides,
            [mode]: {
                ...(preferences.colorOverrides?.[mode] || {}),
                [key]: safeHex(value, SEMANTIC_PALETTE_DEFAULTS[mode][key]),
            },
        },
    });

    const resetSemanticPalette = (mode) => persist({
        colorOverrides: {
            ...preferences.colorOverrides,
            [mode]: {},
        },
    });

    const resetSemanticColor = (mode, key) => {
        const nextMode = { ...(preferences.colorOverrides?.[mode] || {}) };
        delete nextMode[key];
        return persist({
            colorOverrides: {
                ...preferences.colorOverrides,
                [mode]: nextMode,
            },
        });
    };

    const commitCustomColor = () => {
        if (!isHexColor(customColorDraft)) {
            setCustomColorDraft(preferences.customColor || DEFAULT_APPEARANCE.customColor);
            toast.error(t('settings.appearance.invalidColor', { defaultValue: 'Enter a complete six-digit hex color.' }));
            return;
        }
        const normalized = customColorDraft.toUpperCase();
        setCustomColorDraft(normalized);
        if (normalized !== preferences.customColor) persist({ customColor: normalized, primaryColor: 'custom' });
    };

    return (
        <div className="space-y-6">
            {/* Overview Header & Live Interactive Specimen Preview */}
            <section className={`${settingsPanelClass} relative overflow-hidden p-5 sm:p-7`}>
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3.5">
                            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                                <Palette size={26} aria-hidden="true" />
                            </div>
                            <div>
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Sparkles size={11} />
                                    <span>{t('settings.appearance.previewEyebrow', { defaultValue: 'Personalization engine' })}</span>
                                </span>
                                <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                    {t('settings.appearance.previewTitle', { defaultValue: 'Theme & Visual Styling Engine' })}
                                </h1>
                                <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                    {t('settings.appearance.previewDescription', { defaultValue: 'Customize UI themes, medical color palettes, display densities, typography sizes, and motion preferences.' })}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                            <Fact label={t('settings.themeMode', { defaultValue: 'Theme' })} value={t(`settings.appearance.themes.${preferences.theme}`, { defaultValue: preferences.theme })} />
                            <Fact label={t('settings.primaryColor', { defaultValue: 'Accent Color' })} value={t(`settings.appearance.colors.${selectedColor.id}`, { defaultValue: selectedColor.name })} />
                            <Fact label={t('settings.density', { defaultValue: 'Layout Density' })} value={t(`settings.appearance.densities.${preferences.density}.label`, { defaultValue: preferences.density })} />
                            <Fact label={t('settings.appearance.textSize', { defaultValue: 'Font Scale' })} value={t(`settings.appearance.fontScales.${preferences.fontScale}`, { defaultValue: preferences.fontScale })} />
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <SettingsSyncStatus
                                loading={isLoading}
                                label={t('settings.appearance.applied', { defaultValue: 'Appearance is active' })}
                                loadingLabel={t('settings.appearance.applying', { defaultValue: 'Applying and synchronizing...' })}
                            />
                            <button
                                type="button"
                                onClick={reset}
                                disabled={isLoading}
                                className="ds-button ds-button-secondary ds-button-sm"
                            >
                                <RotateCcw size={14} aria-hidden="true" />
                                {t('settings.appearance.reset', { defaultValue: 'Reset Defaults' })}
                            </button>
                        </div>
                    </div>
                    <AppearancePreview preferences={preferences} color={selectedColor} t={t} />
                </div>
            </section>

            <nav className="flex flex-wrap gap-2" aria-label={t('settings.appearance.sectionsLabel', { defaultValue: 'Appearance setting sections' })}>
                {[
                    ['appearance-theme', Sun, t('settings.themeMode', { defaultValue: 'Theme' })],
                    ['appearance-colors', Palette, t('settings.primaryColor', { defaultValue: 'Colors' })],
                    ['appearance-layout', Gauge, t('settings.density', { defaultValue: 'Layout' })],
                    ['appearance-type', Type, t('settings.appearance.textSize', { defaultValue: 'Typography' })],
                    ['appearance-accessibility', Accessibility, t('settings.appearance.motion', { defaultValue: 'Accessibility' })],
                ].map(([id, Icon, label]) => (
                    <a key={id} href={`#${id}`} className="settings-jump-link inline-flex min-h-9 items-center gap-2 px-3 text-xs font-bold">
                        <Icon size={14} aria-hidden="true" />
                        {label}
                    </a>
                ))}
            </nav>

            <div className="grid min-w-0 gap-6">
                <div className="space-y-6">
                    {/* Theme Mode Selector */}
                    <Panel id="appearance-theme" icon={Sun} title={t('settings.themeMode', { defaultValue: 'Interface Theme Mode' })} description={t('settings.appearance.themeDescription', { defaultValue: 'Switch between Light, Dark, or Automatic System Theme.' })}>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {THEMES.map(({ id, icon: Icon }) => (
                                <ChoiceButton
                                    key={id}
                                    selected={preferences.theme === id}
                                    disabled={isLoading}
                                    onClick={() => persist({ theme: id })}
                                >
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        <Icon size={18} aria-hidden="true" />
                                    </span>
                                    <span className="mt-3 block text-sm font-black text-slate-900 dark:text-white">
                                        {t(`settings.appearance.themes.${id}`, { defaultValue: id })}
                                    </span>
                                    <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                                        {t(`settings.appearance.themeHelp.${id}`, { defaultValue: `Use ${id} mode across the workstation` })}
                                    </span>
                                </ChoiceButton>
                            ))}
                        </div>
                    </Panel>

                    {/* Medical Accent Color Palette */}
                    <Panel id="appearance-colors" icon={Palette} title={t('settings.primaryColor', { defaultValue: 'Medical Accent Palette' })} description={t('settings.appearance.colorDescription', { defaultValue: 'Choose primary highlight colors for icons, active buttons, and progress meters.' })}>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {COLORS.map(color => (
                                    <ChoiceButton
                                        key={color.id}
                                        selected={preferences.primaryColor === color.id}
                                        disabled={isLoading}
                                        onClick={() => persist({ primaryColor: color.id })}
                                        compact
                                    >
                                        <span
                                            className="h-8 w-8 shrink-0 rounded-lg shadow-sm ring-1 ring-black/10 flex items-center justify-center overflow-hidden"
                                            style={{ backgroundColor: color.id === 'custom' ? (preferences.customColor || '#087F5B') : color.value }}
                                        >
                                            {color.id === 'custom' && <Palette size={14} className="text-white drop-shadow-md" />}
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t(`settings.appearance.colors.${color.id}`, { defaultValue: color.name })}</span>
                                    </ChoiceButton>
                                ))}
                            </div>

                            {preferences.primaryColor === 'custom' && (
                                <div className="settings-color-field flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                                    <label htmlFor="appearance-custom-color-text" className="text-xs font-bold text-[var(--VIARA-ink)]">{t('settings.appearance.customColorLabel', { defaultValue: 'Custom hex color' })}</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={safeHex(preferences.customColor)}
                                            onChange={(e) => {
                                                setCustomColorDraft(e.target.value.toUpperCase());
                                                persist({ customColor: e.target.value.toUpperCase(), primaryColor: 'custom' });
                                            }}
                                            disabled={isLoading}
                                            className="h-9 w-12 cursor-pointer rounded bg-transparent p-0 outline-none disabled:cursor-wait"
                                            aria-label={t('settings.appearance.customColorPicker', { defaultValue: 'Choose custom accent color' })}
                                        />
                                        <input
                                            id="appearance-custom-color-text"
                                            type="text"
                                            value={customColorDraft}
                                            maxLength={7}
                                            spellCheck="false"
                                            inputMode="text"
                                            onBlur={commitCustomColor}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    commitCustomColor();
                                                }
                                                if (event.key === 'Escape') {
                                                    setCustomColorDraft(preferences.customColor || DEFAULT_APPEARANCE.customColor);
                                                    event.currentTarget.blur();
                                                }
                                            }}
                                            onChange={(e) => setCustomColorDraft(e.target.value)}
                                            aria-invalid={!isHexColor(customColorDraft)}
                                            disabled={isLoading}
                                            className={`ds-field min-h-9 w-28 py-1 text-xs font-mono font-bold uppercase ${!isHexColor(customColorDraft) ? 'ds-field-error' : ''}`}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </Panel>

                    <Panel
                        id="appearance-semantic-colors"
                        icon={SlidersHorizontal}
                        title={t('settings.appearance.semanticPalette.title', { defaultValue: 'Advanced semantic palette' })}
                        description={t('settings.appearance.semanticPalette.description', { defaultValue: 'Customize every interface surface and state color independently for light and dark mode. Unchanged colors inherit the audited VIARA defaults.' })}
                        action={(
                            <span className={`ds-status inline-flex border px-2.5 py-1 text-[10px] font-black ${semanticOverrideCount ? 'ds-status-accent' : 'ds-status-neutral'}`}>
                                {t('settings.appearance.semanticPalette.overrideCount', { count: semanticOverrideCount, defaultValue: `${semanticOverrideCount} overrides` })}
                            </span>
                        )}
                    >
                        <div className="grid gap-4 xl:grid-cols-2">
                            {['light', 'dark'].map((mode) => (
                                <section key={mode} className="min-w-0 rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-3 sm:p-4">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                        <h3 className="text-sm font-black text-[var(--VIARA-ink)]">
                                            {t(`settings.appearance.semanticPalette.${mode}`, { defaultValue: mode === 'light' ? 'Light palette' : 'Dark palette' })}
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => resetSemanticPalette(mode)}
                                            disabled={isLoading}
                                            className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--VIARA-muted)] transition hover:border-[var(--VIARA-accent)] hover:text-[var(--VIARA-accent)] disabled:opacity-50"
                                        >
                                            {t('settings.appearance.semanticPalette.resetMode', { defaultValue: 'Restore mode' })}
                                        </button>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {SEMANTIC_COLOR_OPTIONS.map(([key, fallbackLabel]) => {
                                            const value = preferences.colorOverrides?.[mode]?.[key]
                                                || SEMANTIC_PALETTE_DEFAULTS[mode][key];
                                            return (
                                                <div key={key} className="settings-color-field flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2">
                                                    <label className="grid min-w-0 flex-1 cursor-pointer grid-cols-[36px_minmax(0,1fr)] items-center gap-2 text-[11px] font-bold text-[var(--VIARA-ink)]">
                                                        <input
                                                            type="color"
                                                            value={value}
                                                            onChange={(event) => updateSemanticColor(mode, key, event.target.value)}
                                                            disabled={isLoading}
                                                            className="h-8 w-9 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-wait"
                                                            aria-label={t(`settings.appearance.semanticPalette.colors.${key}`, { defaultValue: fallbackLabel })}
                                                        />
                                                        <span className="min-w-0 break-words leading-4">
                                                            {t(`settings.appearance.semanticPalette.colors.${key}`, { defaultValue: fallbackLabel })}
                                                            <code className="mt-0.5 block text-[9px] font-semibold uppercase text-[var(--VIARA-muted)]">{value}</code>
                                                        </span>
                                                    </label>
                                                    {preferences.colorOverrides?.[mode]?.[key] && (
                                                        <button
                                                            type="button"
                                                            onClick={() => resetSemanticColor(mode, key)}
                                                            disabled={isLoading}
                                                            className="ds-button ds-button-ghost ds-button-sm !min-h-8 !px-2 text-[10px]"
                                                            aria-label={t('settings.appearance.semanticPalette.resetColor', { color: fallbackLabel, defaultValue: `Restore ${fallbackLabel}` })}
                                                            title={t('settings.appearance.semanticPalette.resetColor', { color: fallbackLabel, defaultValue: `Restore ${fallbackLabel}` })}
                                                        >
                                                            <RotateCcw size={12} aria-hidden="true" />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </Panel>
                </div>

                <div className="space-y-4">
                    {/* UI Layout Density */}
                    <Panel id="appearance-layout" icon={Gauge} title={t('settings.density', { defaultValue: 'UI Layout Density' })} description={t('settings.appearance.densityDescription', { defaultValue: 'Adjust row padding and spacing density for tables and data grids.' })}>
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                                {DENSITIES.map(d => (
                                    <ChoiceButton
                                        key={d.id}
                                        selected={preferences.density === d.id}
                                        disabled={isLoading}
                                        onClick={() => persist({ density: d.id })}
                                    >
                                        <DensityPreview mode={d.id} />
                                        <span className="mt-3 block text-xs font-extrabold capitalize text-slate-900 dark:text-white">
                                            {t(`settings.appearance.densities.${d.id}.label`, { defaultValue: d.id })}
                                        </span>
                                    </ChoiceButton>
                                ))}
                            </div>

                            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <h4 className="mb-3 text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <Square size={14} className="text-slate-400" />
                                    {t('settings.appearance.radiusTitle', { defaultValue: 'Component border radius' })}
                                </h4>
                                <div className="grid grid-cols-5 gap-2">
                                    {BORDER_RADII.map(radius => (
                                        <ChoiceButton
                                            key={radius.id}
                                            selected={preferences.borderRadius === radius.id}
                                            disabled={isLoading}
                                            onClick={() => persist({ borderRadius: radius.id })}
                                            center
                                        >
                                            <div className={`h-8 w-8 border-2 border-slate-300 dark:border-slate-600 ${radius.class}`} />
                                            <span className="mt-2 block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                {t(`settings.appearance.radii.${radius.id}`, { defaultValue: radius.name })}
                                            </span>
                                        </ChoiceButton>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Panel>

                    <Panel icon={LayoutList} title={t('settings.appearance.workspaceTitle', { defaultValue: 'Workspace chrome' })} description={t('settings.appearance.workspaceDescription', { defaultValue: 'Tune navigation and settings surfaces for repeated operational work.' })}>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">{t('settings.appearance.compactSidebar', { defaultValue: 'Compact settings sidebar by default' })}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t('settings.appearance.compactSidebarHelp', { defaultValue: 'Start settings in icon-only navigation on wide screens.' })}</p>
                                </div>
                                <Toggle
                                    label={t('settings.appearance.compactSidebar', { defaultValue: 'Compact settings sidebar' })}
                                    checked={Boolean(preferences.compactSidebar)}
                                    disabled={isLoading}
                                    onChange={checked => persist({ compactSidebar: checked })}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                {DENSITIES.map(mode => (
                                    <div key={mode.id} className={`rounded-lg border border-slate-200 bg-white text-center text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900 ${mode.id === preferences.density ? 'ring-2 ring-cyan-500/30' : ''}`}>
                                        <div className={mode.id === 'compact' ? 'py-1' : mode.id === 'spacious' ? 'py-3' : 'py-2'}>{t(`settings.appearance.densities.${mode.id}.label`, { defaultValue: mode.id })}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Panel>

                    {/* Font Scale & Typography */}
                    <Panel id="appearance-type" icon={Type} title={t('settings.appearance.textSize', { defaultValue: 'Typography & Font Scale' })} description={t('settings.appearance.textSizeDescription', { defaultValue: 'Scale base text size across clinical records and forms.' })}>
                        <div className="space-y-4">
                            <div className="grid grid-cols-4 gap-2">
                                {FONT_SCALES.map((scaleObj) => (
                                    <ChoiceButton
                                        key={scaleObj.id}
                                        selected={preferences.fontScale === scaleObj.id}
                                        disabled={isLoading}
                                        onClick={() => persist({ fontScale: scaleObj.id })}
                                        center
                                    >
                                        <span className="font-black text-slate-900 dark:text-white" style={{ fontSize: `${scaleObj.px}px` }}>Aa</span>
                                        <span className="mt-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                            {t(`settings.appearance.fontScales.${scaleObj.id}`, { defaultValue: scaleObj.id })} ({scaleObj.scale})
                                        </span>
                                    </ChoiceButton>
                                ))}
                            </div>

                            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <h4 className="mb-3 text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <Type size={14} className="text-slate-400" />
                                    {t('settings.appearance.fontFamilyTitle', { defaultValue: 'Font family' })}
                                </h4>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {FONT_FAMILIES.map(font => (
                                        <ChoiceButton
                                            key={font.id}
                                            selected={preferences.fontFamily === font.id}
                                            disabled={isLoading}
                                            onClick={() => persist({ fontFamily: font.id })}
                                            center
                                        >
                                            <span className={`text-base font-bold text-slate-900 dark:text-white ${font.class}`}>Aa</span>
                                            <span className="mt-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                {t(`settings.appearance.fontFamilies.${font.id}`, { defaultValue: font.name })}
                                            </span>
                                        </ChoiceButton>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Panel>

                    {/* High Contrast & Motion Accessibility */}
                    <Panel id="appearance-accessibility" icon={Accessibility} title={t('settings.appearance.motion', { defaultValue: 'Accessibility & Motion' })} description={t('settings.appearance.motionDescription', { defaultValue: 'Configure high contrast borders and reduced animation effects.' })}>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">{t('settings.appearance.highContrastTitle', { defaultValue: 'Enforce high contrast' })}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t('settings.appearance.highContrastHelp', { defaultValue: 'Increase border contrast for low-light diagnostic rooms.' })}</p>
                                </div>
                                <Toggle
                                    label={t('settings.appearance.highContrastTitle', { defaultValue: 'High contrast' })}
                                    checked={Boolean(preferences.highContrast)}
                                    disabled={isLoading}
                                    onChange={checked => persist({ highContrast: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div>
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">{t('settings.appearance.reduceMotion', { defaultValue: 'Reduce UI Animations' })}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t('settings.appearance.reduceMotionHelp', { defaultValue: 'Minimize transit transitions and pulse keyframes' })}</p>
                                </div>
                                <Toggle
                                    label={t('settings.appearance.reduceMotion', { defaultValue: 'Reduce Motion' })}
                                    checked={preferences.motion === 'reduced'}
                                    disabled={isLoading}
                                    onChange={checked => persist({ motion: checked ? 'reduced' : 'system' })}
                                />
                            </div>
                        </div>
                    </Panel>
                </div>
            </div >
        </div >
    );
};

const DensityPreview = ({ mode }) => (
    <div className="w-full space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
        <div className={`flex items-center justify-between rounded bg-slate-200 dark:bg-slate-800 ${mode === 'compact' ? 'p-1' : mode === 'spacious' ? 'p-2.5' : 'p-1.5'}`}>
            <div className="h-2 w-12 rounded bg-slate-400" />
            <div className="h-2 w-4 rounded bg-slate-400" />
        </div>
        <div className={`flex items-center justify-between rounded bg-white dark:bg-slate-900 ${mode === 'compact' ? 'p-1' : mode === 'spacious' ? 'p-2.5' : 'p-1.5'}`}>
            <div className="h-2 w-16 rounded bg-cyan-500" />
            <div className="h-2 w-6 rounded bg-slate-300 dark:bg-slate-700" />
        </div>
    </div>
);

const PREVIEW_RADIUS = { sharp: '0px', small: '6px', medium: '10px', large: '14px', full: '24px' };
const PREVIEW_DENSITY = {
    compact: { shell: 7, row: 6, gap: 6 },
    comfortable: { shell: 10, row: 8, gap: 8 },
    spacious: { shell: 13, row: 11, gap: 10 }
};
const PREVIEW_FONT_SCALE = { small: 0.85, normal: 1, large: 1.15, xlarge: 1.3 };
const PREVIEW_FONT_FAMILY = {
    inter: 'Inter, ui-sans-serif, system-ui, sans-serif',
    system: 'ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    dyslexic: 'Arial, Verdana, ui-sans-serif, sans-serif'
};

const AppearancePreview = ({ preferences, color, t }) => {
    const [systemDark, setSystemDark] = useState(() => (
        typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    ));

    useEffect(() => {
        if (preferences.theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return undefined;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const updateResolvedMode = () => setSystemDark(media.matches);
        updateResolvedMode();
        media.addEventListener?.('change', updateResolvedMode);
        return () => media.removeEventListener?.('change', updateResolvedMode);
    }, [preferences.theme]);

    const mode = preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme;
    const palette = {
        ...SEMANTIC_PALETTE_DEFAULTS[mode],
        ...(preferences.colorOverrides?.[mode] || {})
    };
    const radius = PREVIEW_RADIUS[preferences.borderRadius] || PREVIEW_RADIUS.medium;
    const density = PREVIEW_DENSITY[preferences.density] || PREVIEW_DENSITY.comfortable;
    const fontScale = PREVIEW_FONT_SCALE[preferences.fontScale] || 1;
    const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const defaultFont = isRtl
        ? "'Cairo', 'Readex Pro', 'Noto Sans Arabic', ui-sans-serif, system-ui, sans-serif"
        : PREVIEW_FONT_FAMILY.inter;
    const fontFamily = preferences.fontFamily === 'inter'
        ? defaultFont
        : (PREVIEW_FONT_FAMILY[preferences.fontFamily] || defaultFont);
    const lineColor = preferences.highContrast ? palette.borderStrong : palette.border;
    const accentSoft = mixHexColors(color.value, palette.surface, mode === 'dark' ? 0.78 : 0.88);
    const successSoft = mixHexColors(palette.success, palette.surface, mode === 'dark' ? 0.8 : 0.88);
    const warningSoft = mixHexColors(palette.warning, palette.surface, mode === 'dark' ? 0.8 : 0.86);
    const accentContrast = getContrastColor(color.value);
    const cardStyle = { backgroundColor: palette.surface, borderColor: lineColor, borderRadius: radius };

    return (
        <section
            aria-label={t('settings.appearance.specimen.ariaLabel', { defaultValue: 'Live appearance preview' })}
            className="overflow-hidden border shadow-xl transition-colors duration-300"
            style={{ backgroundColor: palette.canvas, borderColor: lineColor, borderRadius: radius, color: palette.text, fontFamily, fontSize: `${12 * fontScale}px` }}
        >
            <div className="flex items-center justify-between border-b px-3 py-2" style={{ backgroundColor: palette.surface, borderColor: lineColor }}>
                <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color.value }} />
                    <span className="truncate font-extrabold" style={{ color: palette.text }}>
                        {t('settings.appearance.specimen.title', { defaultValue: 'Live specimen' })}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="rounded-md border px-1.5 py-0.5 font-mono text-[0.75em] font-bold uppercase" style={{ borderColor: lineColor, color: palette.textSecondary }}>
                        {t(`settings.appearance.themes.${preferences.theme}`, { defaultValue: preferences.theme })}
                    </span>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: successSoft, color: palette.success }}>
                        <CheckCircle2 size={11} aria-hidden="true" />
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-[38px_minmax(0,1fr)]">
                <aside className="flex flex-col items-center gap-2 border-e py-3" style={{ backgroundColor: palette.surfaceSecondary, borderColor: lineColor }} aria-hidden="true">
                    <span className="grid h-7 w-7 place-items-center font-black" style={{ backgroundColor: color.value, borderRadius: radius, color: accentContrast }}>V</span>
                    {[LayoutList, Activity, Eye].map((Icon, index) => (
                        <span
                            key={Icon.displayName || index}
                            className="grid h-7 w-7 place-items-center border"
                            style={{ backgroundColor: index === 0 ? accentSoft : palette.surface, borderColor: index === 0 ? color.value : lineColor, borderRadius: radius, color: index === 0 ? color.value : palette.textMuted }}
                        >
                            <Icon size={12} />
                        </span>
                    ))}
                </aside>

                <div className="min-w-0" style={{ padding: density.shell }}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <p className="font-black leading-tight" style={{ color: palette.text }}>{t('settings.appearance.specimen.workspace', { defaultValue: 'Clinical workspace' })}</p>
                            <p className="mt-0.5 text-[0.75em]" style={{ color: palette.textMuted }}>{t('settings.appearance.specimen.today', { defaultValue: 'Today · live operations' })}</p>
                        </div>
                        <span className="rounded-full px-2 py-1 text-[0.75em] font-black" style={{ backgroundColor: successSoft, color: palette.success }}>
                            {t('settings.appearance.specimen.online', { defaultValue: 'Online' })}
                        </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2 border px-2.5 py-2" style={{ ...cardStyle, backgroundColor: palette.surfaceMuted }}>
                        <Eye size={12} style={{ color: palette.textMuted }} aria-hidden="true" />
                        <span className="truncate text-[0.75em]" style={{ color: palette.textMuted }}>{t('settings.appearance.specimen.search', { defaultValue: 'Search patient, MRN, or examination…' })}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2" style={{ gap: density.gap }}>
                        <div className="border p-2" style={cardStyle}>
                            <p className="text-[0.75em] font-bold" style={{ color: palette.textMuted }}>{t('settings.appearance.specimen.todayExams', { defaultValue: 'Today exams' })}</p>
                            <p className="mt-1 text-[1.333em] font-black leading-none" style={{ color: palette.text }}>24</p>
                        </div>
                        <div className="border p-2" style={{ ...cardStyle, backgroundColor: accentSoft }}>
                            <p className="text-[0.75em] font-bold" style={{ color: palette.textSecondary }}>{t('settings.appearance.specimen.ready', { defaultValue: 'Ready' })}</p>
                            <p className="mt-1 text-[1.333em] font-black leading-none" style={{ color: color.value }}>18</p>
                        </div>
                    </div>

                    <div className="mt-2 overflow-hidden border" style={cardStyle}>
                        <div className="flex items-center justify-between border-b px-2.5 py-2" style={{ borderColor: lineColor, backgroundColor: palette.surfaceSecondary }}>
                            <span className="text-[0.75em] font-black" style={{ color: palette.text }}>{t('settings.appearance.specimen.worklist', { defaultValue: 'Live worklist' })}</span>
                            <span className="font-mono text-[0.75em] font-bold" style={{ color: palette.textMuted }}>2/6</span>
                        </div>
                        <PreviewWorklistRow
                            name={t('settings.appearance.specimen.patient', { defaultValue: 'Patient 1042' })}
                            meta="MRI · MRN-8421"
                            status={t('settings.appearance.specimen.completed', { defaultValue: 'Completed' })}
                            statusColor={palette.success}
                            statusBackground={successSoft}
                            palette={palette}
                            lineColor={lineColor}
                            rowPadding={density.row}
                            withBorder
                        />
                        <PreviewWorklistRow
                            name={t('settings.appearance.specimen.patientTwo', { defaultValue: 'Patient 1058' })}
                            meta="CT · MRN-8490"
                            status={t('settings.appearance.specimen.pending', { defaultValue: 'Pending' })}
                            statusColor={palette.warning}
                            statusBackground={warningSoft}
                            palette={palette}
                            rowPadding={density.row}
                        />
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2" style={{ borderColor: lineColor }}>
                        <span className="text-[0.667em] font-bold" style={{ color: palette.textMuted }}>{t('settings.appearance.specimen.sync', { defaultValue: 'Workspace synchronized' })}</span>
                        <span className="px-2.5 py-1.5 text-[0.75em] font-black shadow-sm" style={{ backgroundColor: color.value, borderRadius: radius, color: accentContrast }}>
                            {t('settings.appearance.specimen.action', { defaultValue: 'Open worklist' })}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-[0.667em]" style={{ backgroundColor: palette.surface, borderColor: lineColor, color: palette.textMuted }}>
                <span>{t('settings.appearance.specimen.font', { defaultValue: 'Font' })}: <strong style={{ color: palette.text }}>{t(`settings.appearance.fontScales.${preferences.fontScale}`, { defaultValue: preferences.fontScale })} · {t(`settings.appearance.fontFamilies.${preferences.fontFamily}`, { defaultValue: preferences.fontFamily })}</strong></span>
                <span>{t('settings.appearance.specimen.radius', { defaultValue: 'Radius' })}: <strong style={{ color: palette.text }}>{t(`settings.appearance.radii.${preferences.borderRadius}`, { defaultValue: preferences.borderRadius })}</strong></span>
                <span>{t('settings.appearance.specimen.density', { defaultValue: 'Density' })}: <strong style={{ color: palette.text }}>{t(`settings.appearance.densities.${preferences.density}.label`, { defaultValue: preferences.density })}</strong></span>
            </div>
        </section>
    );
};

const PreviewWorklistRow = ({ name, meta, status, statusColor, statusBackground, palette, lineColor, rowPadding, withBorder = false }) => (
    <div className={`flex items-center justify-between gap-2 px-2.5 ${withBorder ? 'border-b' : ''}`} style={{ borderColor: lineColor, paddingBlock: rowPadding }}>
        <div className="min-w-0">
            <p className="truncate text-[0.833em] font-black" style={{ color: palette.text }}>{name}</p>
            <p dir="ltr" className="mt-0.5 truncate font-mono text-[0.667em]" style={{ color: palette.textMuted }}>{meta}</p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-1 text-[0.667em] font-black" style={{ backgroundColor: statusBackground, color: statusColor }}>{status}</span>
    </div>
);

export default AppearanceSettings;
