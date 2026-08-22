import React from 'react';
import toast from 'react-hot-toast';
import {
    Accessibility,
    Activity,
    Check,
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
import { SEMANTIC_PALETTE_DEFAULTS } from '../../utils/themePalette';

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

const fieldPanel = 'rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90';

const safeHex = (value, fallback = '#087F5B') => (/^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback);

const AppearanceSettings = () => {
    const { t } = useTranslation('settings');
    const dispatch = useDispatch();
    const stored = useSelector(selectPreferences) || {};
    const preferences = { ...DEFAULT_APPEARANCE, ...stored };
    const [updatePreferences, { isLoading }] = useUpdatePreferencesMutation();

    const persist = async (changes) => {
        const previous = preferences;
        const next = { ...preferences, ...changes };
        dispatch(updateAllPreferences(next));
        try {
            await updatePreferences(next).unwrap();
            toast.success(t('settings.appearance.saved', { defaultValue: 'Appearance settings updated.' }));
        } catch (error) {
            dispatch(updateAllPreferences(previous));
            toast.error(getErrorMessage(error, t('settings.errors.preferenceSaveFailed', { defaultValue: 'Failed to save appearance settings.' })));
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

    return (
        <div className="space-y-6">
            {/* Overview Header & Live Interactive Specimen Preview */}
            <section className={`${fieldPanel} relative overflow-hidden p-6 sm:p-8`}>
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
                            <Fact label={t('settings.appearance.textSize', { defaultValue: 'Font Scale' })} value={preferences.fontScale} />
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <SyncBadge loading={isLoading} t={t} />
                            <button
                                type="button"
                                onClick={reset}
                                disabled={isLoading}
                                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <RotateCcw size={14} aria-hidden="true" />
                                {t('settings.appearance.reset', { defaultValue: 'Reset Defaults' })}
                            </button>
                        </div>
                    </div>

                    <AppearancePreview preferences={preferences} color={selectedColor} t={t} />
                </div>
            </section>

            <div className="grid min-w-0 gap-6">
                <div className="space-y-6">
                    {/* Theme Mode Selector */}
                    <Panel icon={Sun} title={t('settings.themeMode', { defaultValue: 'Interface Theme Mode' })} description={t('settings.appearance.themeDescription', { defaultValue: 'Switch between Light, Dark, or Automatic System Theme.' })}>
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
                    <Panel icon={Palette} title={t('settings.primaryColor', { defaultValue: 'Medical Accent Palette' })} description={t('settings.appearance.colorDescription', { defaultValue: 'Choose primary highlight colors for icons, active buttons, and progress meters.' })}>
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
                                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('settings.appearance.customColorLabel', { defaultValue: 'Custom hex color' })}</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="color" 
                                            value={safeHex(preferences.customColor)}
                                            onChange={(e) => persist({ customColor: e.target.value })}
                                            className="h-8 w-12 cursor-pointer rounded bg-transparent p-0 outline-none"
                                        />
                                        <input 
                                            type="text"
                                            value={preferences.customColor || '#087F5B'}
                                            onBlur={(e) => persist({ customColor: safeHex(e.target.value) })}
                                            onChange={(e) => dispatch(updateAllPreferences({ ...preferences, customColor: e.target.value }))}
                                            className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-mono font-bold text-slate-900 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </Panel>

                    <Panel
                        icon={SlidersHorizontal}
                        title={t('settings.appearance.semanticPalette.title', { defaultValue: 'Advanced semantic palette' })}
                        description={t('settings.appearance.semanticPalette.description', { defaultValue: 'Customize every interface surface and state color independently for light and dark mode. Unchanged colors inherit the audited VIARA defaults.' })}
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
                                                <label key={key} className="grid min-h-11 min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-2 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 py-2 text-[11px] font-bold text-[var(--VIARA-ink)]">
                                                    <input
                                                        type="color"
                                                        value={value}
                                                        onChange={(event) => updateSemanticColor(mode, key, event.target.value)}
                                                        disabled={isLoading}
                                                        className="h-7 w-9 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-wait"
                                                        aria-label={t(`settings.appearance.semanticPalette.colors.${key}`, { defaultValue: fallbackLabel })}
                                                    />
                                                    <span className="min-w-0 break-words leading-4">
                                                        {t(`settings.appearance.semanticPalette.colors.${key}`, { defaultValue: fallbackLabel })}
                                                    </span>
                                                </label>
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
                    <Panel icon={Gauge} title={t('settings.density', { defaultValue: 'UI Layout Density' })} description={t('settings.appearance.densityDescription', { defaultValue: 'Adjust row padding and spacing density for tables and data grids.' })}>
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
                                    Component Border Radius
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
                                            <span className="mt-2 block text-[10px] font-bold text-slate-500 dark:text-slate-400">{radius.name}</span>
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
                    <Panel icon={Type} title={t('settings.appearance.textSize', { defaultValue: 'Typography & Font Scale' })} description={t('settings.appearance.textSizeDescription', { defaultValue: 'Scale base text size across clinical records and forms.' })}>
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
                                        <span className="mt-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400 capitalize">{scaleObj.id} ({scaleObj.scale})</span>
                                    </ChoiceButton>
                                ))}
                            </div>
                            
                            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <h4 className="mb-3 text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <Type size={14} className="text-slate-400" />
                                    Font Family
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
                                            <span className="mt-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">{font.name}</span>
                                        </ChoiceButton>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Panel>

                    {/* High Contrast & Motion Accessibility */}
                    <Panel icon={Accessibility} title={t('settings.appearance.motion', { defaultValue: 'Accessibility & Motion' })} description={t('settings.appearance.motionDescription', { defaultValue: 'Configure high contrast borders and reduced animation effects.' })}>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">High Contrast Enforced</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Increase border contrast for low-light diagnostic rooms</p>
                                </div>
                                <Toggle
                                    label="High Contrast"
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

const Panel = ({ icon: Icon, title, description, children }) => (
    <section className={`${fieldPanel} p-4 sm:p-5`}>
        <div className="mb-4 flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Icon size={16} aria-hidden="true" />
            </span>
            <div>
                <h3 className="text-sm font-black text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            </div>
        </div>
        {children}
    </section>
);

const ChoiceButton = ({ selected, disabled, onClick, compact, center, children }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`relative flex ${compact ? 'flex-row items-center gap-3' : 'flex-col'} ${center ? 'items-center text-center' : 'items-start text-start'} rounded-2xl border p-3.5 transition-all ${selected
                ? 'border-cyan-500 bg-cyan-50/50 shadow-md ring-2 ring-cyan-500/20 dark:border-cyan-500 dark:bg-cyan-950/40'
                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/50'
            } disabled:opacity-50`}
    >
        {children}
        {selected && (
            <span className="absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-white shadow-sm dark:bg-cyan-500">
                <Check size={12} strokeWidth={3} />
            </span>
        )}
    </button>
);

const Fact = ({ label, value }) => (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-950/50">
        <span className="text-[10px] font-bold uppercase text-slate-400">{label}</span>
        <p className="mt-0.5 break-words text-xs font-black leading-5 text-slate-900 dark:text-white">{value}</p>
    </div>
);

const SyncBadge = ({ loading }) => (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-955/30 dark:text-emerald-300">
        {loading ? <Sparkles size={13} className="animate-spin text-emerald-600" /> : <CheckCircle2 size={13} />}
        {loading ? 'Saving...' : 'Appearance Synced'}
    </span>
);

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

const AppearancePreview = ({ preferences, color }) => (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color.value }} />
                    <span className="text-xs font-extrabold text-white">Live Specimen Box</span>
                </div>
                <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300">
                    {preferences.theme}
                </span>
            </div>

            <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-3">
                    <div>
                        <p className="text-xs font-bold text-white">Brain MRI with Contrast</p>
                        <p className="text-[10px] font-mono text-slate-400">CPT: 70553 · 45 min</p>
                    </div>
                    <button
                        type="button"
                        className="rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: color.value }}
                    >
                        Action
                    </button>
                </div>

                <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold text-slate-400">
                        <span>Workstation Sync</span>
                        <span>100%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: '100%', backgroundColor: color.value }} />
                    </div>
                </div>
            </div>
        </div>

        <div className="mt-4 border-t border-slate-800 pt-3 flex flex-wrap gap-2 text-[10px] text-slate-400 items-center">
            <span>Font: <strong className="text-white capitalize">{preferences.fontScale} {preferences.fontFamily}</strong></span>
            <span>Radius: <strong className="text-white capitalize">{preferences.borderRadius}</strong></span>
            <span>Density: <strong className="text-white capitalize">{preferences.density}</strong></span>
        </div>
    </div>
);

const Toggle = ({ label, checked, disabled, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-cyan-600' : 'bg-slate-200 dark:bg-slate-800'
            } disabled:opacity-50`}
    >
        <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'
                }`}
        />
    </button>
);

export default AppearanceSettings;
