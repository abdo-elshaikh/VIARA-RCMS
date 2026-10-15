import React, { useCallback, useState } from 'react';
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Clock3,
    Columns,
    Contrast,
    ExternalLink,
    Loader2,
    Monitor,
    Moon,
    Play,
    RotateCcw,
    Settings,
    SlidersHorizontal,
    Sparkles,
    Sun,
    Volume2,
    VolumeX,
    X,
} from 'lucide-react';

const cx = (...classes) => classes.filter(Boolean).join(' ');

const THEME_OPTIONS = [
    { id: 'light', icon: Sun, labelKey: 'topbar.themeLight', defaultLabel: 'Light' },
    { id: 'dark', icon: Moon, labelKey: 'topbar.themeDark', defaultLabel: 'Dark' },
    { id: 'system', icon: Monitor, labelKey: 'topbar.themeSystem', defaultLabel: 'System' },
];

const ACCENT_COLORS = [
    { id: 'emerald', nameAr: 'زمردي', nameEn: 'Emerald', hex: '#087F5B' },
    { id: 'indigo', nameAr: 'كحلي', nameEn: 'Slate Neutral', hex: '#5F6F6B' },
    { id: 'amber', nameAr: 'كهرماني', nameEn: 'AI Amber', hex: '#F4B942' },
    { id: 'rose', nameAr: 'مرجاني', nameEn: 'Coral', hex: '#D95757' },
    { id: 'slate', nameAr: 'فحمي', nameEn: 'Charcoal', hex: '#172326' },
];

const DENSITY_OPTIONS = [
    { id: 'compact', labelKey: 'topbar.densityCompact', defaultLabel: 'Compact' },
    { id: 'comfortable', labelKey: 'topbar.densityComfortable', defaultLabel: 'Comfort' },
    { id: 'spacious', labelKey: 'topbar.densitySpacious', defaultLabel: 'Spacious' },
];

const FONT_SCALE_OPTIONS = [
    { id: 'small', labelKey: 'topbar.fontScaleSmall', defaultLabel: 'Small', size: '11px', percent: '85%', symbol: 'A-' },
    { id: 'normal', labelKey: 'topbar.fontScaleNormal', defaultLabel: 'Default', size: '13px', percent: '100%', symbol: 'A' },
    { id: 'large', labelKey: 'topbar.fontScaleLarge', defaultLabel: 'Large', size: '15px', percent: '115%', symbol: 'A+' },
    { id: 'xlarge', labelKey: 'topbar.fontScaleXlarge', defaultLabel: 'Extra Large', size: '17px', percent: '130%', symbol: 'A++' },
];

const BORDER_RADIUS_OPTIONS = [
    { id: 'sharp', labelKey: 'topbar.radiusSharp', defaultLabel: 'Sharp', labelAr: 'حاد', value: '0px' },
    { id: 'small', labelKey: 'topbar.radiusSmall', defaultLabel: 'Subtle', labelAr: 'خفيف', value: '4px' },
    { id: 'medium', labelKey: 'topbar.radiusMedium', defaultLabel: 'Default', labelAr: 'افتراضي', value: '10px' },
    { id: 'large', labelKey: 'topbar.radiusLarge', defaultLabel: 'Smooth', labelAr: 'ناعم', value: '16px' },
    { id: 'full', labelKey: 'topbar.radiusFull', defaultLabel: 'Pill', labelAr: 'كبسولة', value: '9999px' },
];

const playQuickChime = (requestedVolume = 0.5) => {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        if (typeof context.addEventListener === 'function') {
            context.addEventListener('error', () => { });
        }
        const normVol = Math.min(1, Math.max(0.1, Number(requestedVolume) || 0.5));

        const playTone = (freq, delay, dur) => {
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, context.currentTime + delay);
            gain.gain.setValueAtTime(normVol * 0.08, context.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + delay + dur);
            osc.connect(gain).connect(context.destination);
            osc.start(context.currentTime + delay);
            osc.stop(context.currentTime + delay + dur);
        };

        playTone(587.33, 0, 0.14); // D5
        playTone(880, 0.12, 0.22); // A5

        setTimeout(() => {
            try {
                context.close().catch(() => {});
            } catch {
                // Ignore
            }
        }, 450);
    } catch {
        // Fallback if browser audio policy blocks autoplay
    }
};

const SwitchRow = ({ icon: Icon, label, checked, onChange, statusLabel }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange} className="vx-row">
        <span>
            <Icon size={17} aria-hidden="true" />
            <span className="truncate">{label}</span>
        </span>
        {statusLabel && <span className="text-xs text-[var(--VIARA-muted)] me-2">{statusLabel}</span>}
        <span className="vx-switch" data-on={checked ? 'true' : 'false'} aria-hidden="true" />
    </button>
);

const QuickPreferencesMenu = ({
    preferences,
    onUpdatePreference,
    onResetDefaults,
    onClose,
    onGoTo,
    isRtl,
    t,
    menuRef,
    saveStatus = 'idle',
    onRetrySave,
}) => {
    const [audioTesting, setAudioTesting] = useState(false);

    const activeTheme = preferences?.theme || 'system';
    const activeColor = preferences?.primaryColor || 'emerald';
    const activeDensity = preferences?.density || 'comfortable';
    const activeFontScale = preferences?.fontScale || 'normal';
    const activeBorderRadius = preferences?.borderRadius || 'medium';
    const isHighContrast = Boolean(preferences?.highContrast);
    const isReducedMotion = preferences?.motion === 'reduced';
    const isCompactSidebar = Boolean(preferences?.compactSidebar);
    const isSoundOn = Boolean(preferences?.notificationSound);
    const timeFormat = preferences?.timeFormat || '12h';

    const activeThemeLabel = t(`topbar.theme${activeTheme.charAt(0).toUpperCase() + activeTheme.slice(1)}`, { defaultValue: activeTheme });
    const activeAccent = ACCENT_COLORS.find((c) => c.id === activeColor);

    const handleTestChime = useCallback((e) => {
        e.stopPropagation();
        setAudioTesting(true);
        playQuickChime(preferences?.soundVolume);
        setTimeout(() => setAudioTesting(false), 500);
    }, [preferences?.soundVolume]);

    return (
        <div
            ref={menuRef}
            role="dialog"
            aria-label={t('topbar.quickPreferences', { defaultValue: 'Quick Preferences' })}
            dir={isRtl ? 'rtl' : 'ltr'}
            className="topbar-quick-prefs-menu vx-prefs absolute end-0 top-full z-50 mt-2 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 ltr:origin-top-right rtl:origin-top-left"
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--VIARA-line)] py-3 ps-4 pe-3">
                <div className="flex min-w-0 items-center gap-2">
                    <SlidersHorizontal size={17} aria-hidden="true" className="shrink-0 text-[var(--VIARA-accent-dark)]" />
                    <h2 className="truncate text-sm font-bold text-[var(--VIARA-ink)]">
                        {t('topbar.quickPreferences', { defaultValue: 'Quick Preferences' })}
                    </h2>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                    <button
                        type="button"
                        onClick={onResetDefaults}
                        title={t('topbar.resetDefaults', { defaultValue: 'Reset to defaults' })}
                        aria-label={t('topbar.resetDefaults', { defaultValue: 'Reset to defaults' })}
                        className="vx-icon-btn !h-8 !w-8"
                    >
                        <RotateCcw size={15} />
                    </button>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            title={t('actions.close', { defaultValue: 'Close' })}
                            aria-label={t('actions.close', { defaultValue: 'Close' })}
                            className="vx-icon-btn !h-8 !w-8"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-4 p-4">
                {/* Theme */}
                <section>
                    <p className="vx-prefs-label">
                        {t('topbar.themeMode', { defaultValue: 'Theme Mode' })}
                        <span>{activeThemeLabel}</span>
                    </p>
                    <div className="vx-seg" role="group" aria-label={t('topbar.themeMode', { defaultValue: 'Theme Mode' })}>
                        {THEME_OPTIONS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    aria-selected={activeTheme === item.id}
                                    aria-pressed={activeTheme === item.id}
                                    onClick={() => onUpdatePreference({ theme: item.id })}
                                >
                                    <span className="vx-seg-inline">
                                        <Icon size={14} aria-hidden="true" />
                                        {t(item.labelKey, { defaultValue: item.defaultLabel })}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Accent */}
                <section>
                    <p className="vx-prefs-label">
                        {t('topbar.primaryColor', { defaultValue: 'Accent Color' })}
                        <span>{isRtl ? (activeAccent?.nameAr || activeColor) : (activeAccent?.nameEn || activeColor)}</span>
                    </p>
                    <div className="vx-swatches" role="group" aria-label={t('topbar.primaryColor', { defaultValue: 'Accent Color' })}>
                        {ACCENT_COLORS.map((color) => {
                            const isSelected = activeColor === color.id;
                            const displayName = isRtl ? color.nameAr : color.nameEn;
                            return (
                                <button
                                    key={color.id}
                                    type="button"
                                    aria-pressed={isSelected}
                                    title={displayName}
                                    aria-label={displayName}
                                    onClick={() => onUpdatePreference({ primaryColor: color.id })}
                                    className="vx-swatch"
                                    style={{ '--sw': color.hex }}
                                >
                                    {isSelected && <Check size={15} strokeWidth={3} aria-hidden="true" />}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Density */}
                <section>
                    <p className="vx-prefs-label">{t('topbar.density', { defaultValue: 'Display Density' })}</p>
                    <div className="vx-seg" role="group" aria-label={t('topbar.density', { defaultValue: 'Display Density' })}>
                        {DENSITY_OPTIONS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                aria-selected={activeDensity === item.id}
                                aria-pressed={activeDensity === item.id}
                                onClick={() => onUpdatePreference({ density: item.id })}
                            >
                                {t(item.labelKey, { defaultValue: item.defaultLabel })}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Border Radius */}
                <section>
                    <p className="vx-prefs-label">
                        {t('topbar.borderRadius', { defaultValue: isRtl ? 'استدارة الحدود' : 'Border Radius' })}
                        <span>{BORDER_RADIUS_OPTIONS.find((r) => r.id === activeBorderRadius)?.[isRtl ? 'labelAr' : 'defaultLabel'] || activeBorderRadius}</span>
                    </p>
                    <div className="vx-seg" role="group" aria-label={t('topbar.borderRadius', { defaultValue: 'Border Radius' })}>
                        {BORDER_RADIUS_OPTIONS.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                aria-selected={activeBorderRadius === item.id}
                                aria-pressed={activeBorderRadius === item.id}
                                onClick={() => onUpdatePreference({ borderRadius: item.id })}
                                title={isRtl ? item.labelAr : item.defaultLabel}
                            >
                                <span className="vx-seg-inline !gap-1">
                                    <span
                                        className="inline-block h-2.5 w-2.5 border border-current"
                                        style={{ borderRadius: item.value }}
                                        aria-hidden="true"
                                    />
                                    {isRtl ? item.labelAr : item.defaultLabel}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Font size */}
                <section>
                    <p className="vx-prefs-label">
                        {t('topbar.textSize', { defaultValue: 'Font Size' })}
                        <span className="tabular-nums">{FONT_SCALE_OPTIONS.find((s) => s.id === activeFontScale)?.percent || '100%'}</span>
                    </p>
                    <div className="vx-seg" role="group" aria-label={t('topbar.textSize', { defaultValue: 'Font Size' })}>
                        {FONT_SCALE_OPTIONS.map((scale) => {
                            const labelText = t(scale.labelKey, { defaultValue: scale.defaultLabel });
                            const fullLabel = `${scale.symbol} ${labelText}`.trim();
                            return (
                                <button
                                    key={scale.id}
                                    type="button"
                                    className="vx-seg-col"
                                    aria-selected={activeFontScale === scale.id}
                                    aria-pressed={activeFontScale === scale.id}
                                    onClick={() => onUpdatePreference({ fontScale: scale.id })}
                                    title={fullLabel}
                                    aria-label={fullLabel}
                                >
                                    <span aria-hidden="true" style={{ fontSize: scale.size, fontWeight: 700 }}>{scale.symbol}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <div className="border-t border-[var(--VIARA-line)]" role="separator" />

                {/* Toggles */}
                <section className="-mx-2 space-y-0.5">
                    <SwitchRow
                        icon={Contrast}
                        label={t('topbar.highContrast', { defaultValue: 'High Contrast' })}
                        checked={isHighContrast}
                        onChange={() => onUpdatePreference({ highContrast: !isHighContrast })}
                    />
                    <SwitchRow
                        icon={Sparkles}
                        label={t('topbar.reduceMotion', { defaultValue: 'Reduce Motion' })}
                        checked={isReducedMotion}
                        onChange={() => onUpdatePreference({ motion: isReducedMotion ? 'system' : 'reduced' })}
                    />
                    <SwitchRow
                        icon={Columns}
                        label={t('topbar.compactSidebar', { defaultValue: 'Compact Sidebar' })}
                        checked={isCompactSidebar}
                        onChange={() => onUpdatePreference({ compactSidebar: !isCompactSidebar })}
                    />
                    <SwitchRow
                        icon={isSoundOn ? Volume2 : VolumeX}
                        label={t('topbar.sound', { defaultValue: 'Notification Sound' })}
                        statusLabel={isSoundOn ? t('common.soundOn', { defaultValue: 'Sound on' }) : t('common.soundOff', { defaultValue: 'Muted' })}
                        checked={isSoundOn}
                        onChange={() => onUpdatePreference({ notificationSound: !isSoundOn })}
                    />
                </section>

                {/* Clock + sound test */}
                <section className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="vx-prefs-label !mb-1.5">
                            <span className="inline-flex items-center gap-1.5 !text-[13px] !font-bold !text-[var(--VIARA-ink)]">
                                <Clock3 size={15} aria-hidden="true" className="text-[var(--VIARA-muted)]" />
                                {t('topbar.timeFormat', { defaultValue: 'Time Format' })}
                            </span>
                        </p>
                        <div className="vx-seg" role="group" aria-label={t('topbar.timeFormat', { defaultValue: 'Time Format' })}>
                            {['12h', '24h'].map((format) => (
                                <button
                                    key={format}
                                    type="button"
                                    aria-selected={timeFormat === format}
                                    aria-pressed={timeFormat === format}
                                    onClick={() => onUpdatePreference({ timeFormat: format === timeFormat ? (format === '12h' ? '24h' : '12h') : format })}
                                >
                                    {format === '12h'
                                        ? t('topbar.time12', { defaultValue: isRtl ? '12 ساعة' : '12-hour' })
                                        : t('topbar.time24', { defaultValue: isRtl ? '24 ساعة' : '24-hour' })}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleTestChime}
                        disabled={audioTesting}
                        className="vx-text-btn self-end !h-10 shrink-0"
                    >
                        <Play size={13} className="fill-current rtl:-scale-x-100" aria-hidden="true" />
                        {t('topbar.testSound', { defaultValue: isRtl ? 'اختبار الصوت' : 'Test Sound' })}
                    </button>
                </section>
            </div>

            {/* Footer */}
            <div className="space-y-2.5 border-t border-[var(--VIARA-line)] p-4">
                <div className="flex items-center justify-between gap-2 text-xs" role="status" aria-live="polite">
                    {saveStatus === 'saving' ? (
                        <span className="flex items-center gap-1.5 font-medium text-[var(--VIARA-muted)]">
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            {t('topbar.savingPreferences', { defaultValue: isRtl ? 'جارِ الحفظ...' : 'Saving...' })}
                        </span>
                    ) : saveStatus === 'error' ? (
                        <button
                            type="button"
                            onClick={onRetrySave}
                            title={t('topbar.retrySave', { defaultValue: isRtl ? 'إعادة محاولة الحفظ' : 'Retry saving' })}
                            className="flex items-center gap-1.5 rounded font-semibold text-[var(--danger,#e11d48)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger,#e11d48)]"
                        >
                            <AlertCircle size={14} aria-hidden="true" />
                            {t('topbar.syncFailedRetry', { defaultValue: isRtl ? 'إعادة محاولة الحفظ' : 'Sync failed (retry)' })}
                        </button>
                    ) : (
                        <span className="flex items-center gap-1.5 font-medium text-[var(--VIARA-muted)]">
                            <CheckCircle2 size={14} className="text-[var(--vx-ok)]" aria-hidden="true" />
                            {t('topbar.autoSaved', { defaultValue: isRtl ? 'تُحفظ التغييرات تلقائياً' : 'Changes save automatically' })}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => onGoTo('/settings?tab=appearance')}
                        className="inline-flex items-center gap-1 rounded font-semibold text-[var(--VIARA-accent-dark)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)]"
                    >
                        {t('topbar.advancedAppearance', { defaultValue: isRtl ? 'مظهر متقدم' : 'Advanced Appearance' })}
                        <ExternalLink size={12} aria-hidden="true" className="rtl:-scale-x-100" />
                    </button>
                </div>

                <button type="button" onClick={() => onGoTo('/settings')} className="vx-btn vx-btn-ghost">
                    <Settings size={15} aria-hidden="true" />
                    {t('topbar.allPreferences', { defaultValue: 'All settings & preferences' })}
                </button>
            </div>
        </div>
    );
};

export default QuickPreferencesMenu;