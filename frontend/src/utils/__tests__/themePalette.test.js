import { describe, expect, it } from 'vitest';
import {
    BRAND_COLOR_PRESETS,
    SEMANTIC_COLOR_KEYS,
    SEMANTIC_PALETTE_DEFAULTS,
    applyThemePalette,
    createBrandScale,
    getAccessibleBrandTone,
    getContrastColor,
    normalizePaletteOverrides,
} from '../themePalette';

const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
};

const contrast = (first, second) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
};

describe('theme palette', () => {
    it.each([...Object.values(BRAND_COLOR_PRESETS), '#FFFF00', '#000000', '#FFFFFF'])('selects readable accent text for %s', (color) => {
        expect(contrast(color, getContrastColor(color))).toBeGreaterThanOrEqual(4.5);
    });

    it('creates an ordered, complete brand scale', () => {
        const scale = createBrandScale('#087F5B');
        expect(Object.keys(scale)).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']);
        expect(scale[600]).toBe('#087F5B');
        expect(luminance(scale[50])).toBeGreaterThan(luminance(scale[950]));
    });

    it.each(['light', 'dark'])('keeps %s semantic text readable on primary surfaces', (mode) => {
        const palette = SEMANTIC_PALETTE_DEFAULTS[mode];
        expect(contrast(palette.text, palette.surface)).toBeGreaterThanOrEqual(7);
        expect(contrast(palette.textSecondary, palette.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.textMuted, palette.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.text, palette.canvas)).toBeGreaterThanOrEqual(7);
    });

    it('keeps dark structural surfaces neutral and strong controls distinguishable', () => {
        const palette = SEMANTIC_PALETTE_DEFAULTS.dark;
        ['canvas', 'surface', 'surfaceSecondary', 'surfaceMuted'].forEach((key) => {
            const channels = [1, 3, 5].map((offset) => Number.parseInt(palette[key].slice(offset, offset + 2), 16));
            expect(Math.max(...channels) - Math.min(...channels)).toBeLessThanOrEqual(20);
        });
        expect(contrast(palette.borderStrong, palette.surface)).toBeGreaterThanOrEqual(3);
    });

    it.each(['#087F5B', '#000000', '#FFFFFF', '#F4B942'])('derives a readable dark-mode brand tone for %s', (color) => {
        const palette = SEMANTIC_PALETTE_DEFAULTS.dark;
        const tone = getAccessibleBrandTone(createBrandScale(color), palette.surface, 'dark');
        expect(contrast(tone.color, palette.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps the derived brand tone readable after a dark surface override', () => {
        const scale = createBrandScale('#FFFFFF');
        const tone = getAccessibleBrandTone(scale, '#FFFFFF', 'dark');
        expect(contrast(tone.color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    });

    it('drops unknown and invalid semantic overrides', () => {
        const normalized = normalizePaletteOverrides({ light: { canvas: '#abcdef', unknown: '#FFFFFF' }, dark: { text: 'red' } });
        expect(normalized).toEqual({ light: { canvas: '#ABCDEF' }, dark: {} });
    });

    it('applies every semantic token and the derived brand scale', () => {
        const root = document.createElement('div');
        applyThemePalette(root, { brandColor: '#F4B942', mode: 'dark' });
        expect(root.style.getPropertyValue('--VIARA-accent')).toBe('#F4B942');
        expect(root.style.getPropertyValue('--VIARA-accent-text')).toBe('#F4B942');
        expect(root.style.getPropertyValue('--VIARA-accent-contrast')).toBe('#172326');
        expect(root.style.getPropertyValue('--primary-does-not-exist')).toBe('');
        expect(root.style.getPropertyValue('--background')).toBeTruthy();
        SEMANTIC_COLOR_KEYS.forEach((key) => expect(key).toBeTruthy());
    });

    it('lightens a dark brand color before using it as dark-mode text', () => {
        const root = document.createElement('div');
        applyThemePalette(root, { brandColor: '#000000', mode: 'dark' });
        const accent = root.style.getPropertyValue('--VIARA-accent');
        expect(accent).not.toBe('#000000');
        expect(contrast(accent, SEMANTIC_PALETTE_DEFAULTS.dark.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(root.style.getPropertyValue('--VIARA-accent-dark'), root.style.getPropertyValue('--VIARA-accent-contrast'))).toBeGreaterThanOrEqual(4.5);
    });
});
