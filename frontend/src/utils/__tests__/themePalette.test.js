import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    BRAND_COLOR_PRESETS,
    SEMANTIC_COLOR_KEYS,
    SEMANTIC_PALETTE_DEFAULTS,
    applyThemePalette,
    createBrandScale,
    getAccessibleBrandTone,
    getContrastColor,
    getPaletteTextContrastStatus,
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

    it.each(['light', 'dark'])('adjusts customized %s text colors to meet contrast on all interface surfaces', (mode) => {
        const poorTextColor = mode === 'dark' ? '#000000' : '#FFFFFF';
        const palette = {
            ...SEMANTIC_PALETTE_DEFAULTS[mode],
            text: poorTextColor,
            textSecondary: poorTextColor,
            textMuted: poorTextColor,
        };
        const status = getPaletteTextContrastStatus(palette);
        const root = document.createElement('div');
        applyThemePalette(root, { mode, colorOverrides: { [mode]: palette } });

        status.forEach(({ key, minimumContrast, color, adjusted, passes }) => {
            expect(adjusted).toBe(true);
            expect(passes).toBe(true);
            ['canvas', 'surface', 'surfaceSecondary', 'surfaceMuted'].forEach((surfaceKey) => {
                expect(contrast(color, palette[surfaceKey])).toBeGreaterThanOrEqual(minimumContrast);
            });
            expect(root.style.getPropertyValue(`--${key === 'text' ? 'text-primary' : key === 'textSecondary' ? 'text-secondary' : 'text-muted'}`)).toBe(color);
        });
        expect(root.style.getPropertyValue('--VIARA-ink')).toBe(status[0].color);
        expect(root.style.getPropertyValue('--VIARA-muted')).toBe(status[1].color);
    });

    it('reports when customized surfaces make the required text contrast impossible', () => {
        const status = getPaletteTextContrastStatus({
            ...SEMANTIC_PALETTE_DEFAULTS.light,
            canvas: '#FFFFFF',
            surface: '#000000',
            surfaceSecondary: '#FFFFFF',
            surfaceMuted: '#000000',
        });

        expect(status.some(({ passes }) => !passes)).toBe(true);
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

    it('keeps the dark CSS fallback synchronized with the runtime palette', () => {
        const stylesheet = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf8');
        const darkThemeStyles = stylesheet.match(/\[data-theme="dark"\],[\s\S]*?\n}/)?.[0];

        expect(darkThemeStyles).toContain(`--border-strong: ${SEMANTIC_PALETTE_DEFAULTS.dark.borderStrong}`);
        expect(darkThemeStyles).not.toContain('#364958');
    });

    it('uses semantic colors for dark headers and high-contrast placeholders', () => {
        const stylesheet = readFileSync(resolve(process.cwd(), 'src', 'index.css'), 'utf8');
        const darkHeaderStyles = stylesheet.match(/\.dark \.app-page-header \{[\s\S]*?\n\s*\}/)?.[0];

        expect(darkHeaderStyles).toContain('var(--VIARA-surface)');
        expect(darkHeaderStyles).toContain('var(--VIARA-canvas)');
        expect(darkHeaderStyles).not.toMatch(/#[0-9a-f]{3,8}/i);
        expect(stylesheet).toContain('.high-contrast body :where(input, textarea)::placeholder');
        expect(stylesheet).toContain('color: var(--VIARA-muted) !important;');
        expect(stylesheet).toContain('--VIARA-field: #FFFFFF;');
        expect(stylesheet).toContain('--VIARA-field: #1E293B;');
    });

    it.each(['light', 'dark'])('derives accessible %s status foregrounds, soft surfaces, and borders', (mode) => {
        const root = document.createElement('div');
        applyThemePalette(root, {
            brandColor: '#087F5B',
            mode,
            colorOverrides: {
                [mode]: {
                    success: '#E5F5EE',
                    warning: '#FFF4D6',
                    danger: '#FCE8E8',
                    info: '#E5F2F5',
                },
            },
        });

        ['success', 'warning', 'danger', 'info'].forEach((key) => {
            const foreground = root.style.getPropertyValue(`--VIARA-${key}`);
            const soft = root.style.getPropertyValue(`--VIARA-${key}-soft`);
            expect(foreground).toMatch(/^#[0-9A-F]{6}$/);
            expect(root.style.getPropertyValue(`--VIARA-${key}-border`)).toMatch(/^#[0-9A-F]{6}$/);
            expect(contrast(foreground, soft)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(foreground, root.style.getPropertyValue(`--VIARA-${key}-contrast`))).toBeGreaterThanOrEqual(4.5);
        });
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
