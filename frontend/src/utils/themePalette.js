export const BRAND_COLOR_PRESETS = Object.freeze({
    emerald: '#087F5B',
    cyan: '#087F5B',
    indigo: '#5F6F6B',
    rose: '#D95757',
    amber: '#F4B942',
    slate: '#172326',
});

export const SEMANTIC_PALETTE_DEFAULTS = Object.freeze({
    light: Object.freeze({
        canvas: '#F7FAF9',
        surface: '#FFFFFF',
        surfaceSecondary: '#F0F5F3',
        surfaceMuted: '#E9F0ED',
        border: '#DCE7E3',
        borderStrong: '#C3D2CD',
        text: '#172326',
        textSecondary: '#5F6F6B',
        textMuted: '#697874',
        success: '#16865F',
        warning: '#B7790B',
        danger: '#C94848',
        info: '#327C92',
        viewerBackground: '#070A09',
        viewerPanel: '#111615',
    }),
    dark: Object.freeze({
        canvas: '#0B0F12',
        surface: '#12181D',
        surfaceSecondary: '#182027',
        surfaceMuted: '#1F2A33',
        border: '#26333D',
        borderStrong: '#526678',
        text: '#F0F6FC',
        textSecondary: '#C5D1DE',
        textMuted: '#8292A2',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#F43F5E',
        info: '#38BDF8',
        viewerBackground: '#070A0C',
        viewerPanel: '#0F1418',
    }),
});

export const SEMANTIC_COLOR_KEYS = Object.freeze(Object.keys(SEMANTIC_PALETTE_DEFAULTS.light));

const CSS_TOKEN_MAP = Object.freeze({
    canvas: '--background',
    surface: '--surface',
    surfaceSecondary: '--surface-secondary',
    surfaceMuted: '--surface-muted',
    border: '--border',
    borderStrong: '--border-strong',
    text: '--text-primary',
    textSecondary: '--text-secondary',
    textMuted: '--text-muted',
    success: '--success',
    warning: '--warning',
    danger: '--danger',
    info: '--info',
    viewerBackground: '--viewer-bg',
    viewerPanel: '--viewer-panel',
});

export const normalizeHexColor = (value, fallback = '#087F5B') => (
    /^#[0-9a-f]{6}$/i.test(value || '') ? value.toUpperCase() : fallback
);

const hexToChannels = (hex) => {
    const value = Number.parseInt(normalizeHexColor(hex).slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const channelsToHex = (channels) => `#${channels
    .map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();

export const mixHexColors = (foreground, background, backgroundWeight = 0.5) => {
    const front = hexToChannels(foreground);
    const back = hexToChannels(background);
    return channelsToHex(front.map((channel, index) => (
        channel * (1 - backgroundWeight) + back[index] * backgroundWeight
    )));
};

const relativeLuminance = (hex) => {
    const channels = hexToChannels(hex).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
};

const contrastRatio = (first, second) => {
    const brighter = Math.max(relativeLuminance(first), relativeLuminance(second));
    const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
    return (brighter + 0.05) / (darker + 0.05);
};

const getPaletteTextBackgrounds = (palette) => [
    palette.canvas,
    palette.surface,
    palette.surfaceSecondary,
    palette.surfaceMuted,
];

export const getAccessibleTextTone = (source, backgrounds, minimumContrast = 4.5) => {
    const normalizedSource = normalizeHexColor(source, '#172326');
    const surfaces = backgrounds.map((background) => normalizeHexColor(background, '#FFFFFF'));
    const candidates = [normalizedSource];

    ['#000000', '#FFFFFF'].forEach((target) => {
        for (let step = 1; step <= 100; step += 1) {
            candidates.push(mixHexColors(normalizedSource, target, step / 100));
        }
    });

    const ranked = [...new Set(candidates)].map((color) => ({
        color,
        minimum: Math.min(...surfaces.map((surface) => contrastRatio(color, surface))),
    }));
    const readable = ranked
        .filter(({ minimum }) => minimum >= minimumContrast)
        .sort((first, second) => (
            Math.abs(luminanceDistance(first.color, normalizedSource))
            - Math.abs(luminanceDistance(second.color, normalizedSource))
        ));
    const chosen = readable[0] || ranked.sort((first, second) => second.minimum - first.minimum)[0];

    return {
        color: chosen.color,
        minimumContrast: chosen.minimum,
        passes: chosen.minimum >= minimumContrast,
    };
};

const luminanceDistance = (first, second) => (
    Math.abs(relativeLuminance(first) - relativeLuminance(second))
);

export const getPaletteTextContrastStatus = (palette) => {
    const backgrounds = getPaletteTextBackgrounds(palette);
    return [
        { key: 'text', minimumContrast: 7 },
        { key: 'textSecondary', minimumContrast: 4.5 },
        { key: 'textMuted', minimumContrast: 4.5 },
    ].map(({ key, minimumContrast }) => {
        const result = getAccessibleTextTone(palette[key], backgrounds, minimumContrast);
        return {
            key,
            minimumContrast,
            ...result,
            adjusted: result.color !== normalizeHexColor(palette[key], '#172326'),
        };
    });
};

const getAccessibleSemanticTone = (source, background, fallback) => {
    if (contrastRatio(source, background) >= 4.5) return source;
    const candidate = [0.18, 0.32, 0.46, 0.6, 0.74, 0.88]
        .map((weight) => mixHexColors(source, fallback, weight))
        .find((color) => contrastRatio(color, background) >= 4.5);
    return candidate || fallback;
};

export const getAccessibleBrandTone = (scale, background, mode = 'light') => {
    const preferredSteps = mode === 'dark'
        ? [600, 500, 400, 300, 200, 100, 50, 700, 800, 900, 950]
        : [600, 700, 800, 900, 950, 500, 400, 300, 200, 100, 50];
    const step = preferredSteps.find((candidate) => contrastRatio(scale[candidate], background) >= 4.5);
    const fallback = ['#FFFFFF', '#172326', '#000000']
        .find((candidate) => contrastRatio(candidate, background) >= 4.5) || '#000000';

    return step ? { color: scale[step], step } : { color: fallback, step: null };
};

export const getContrastColor = (background) => {
    const candidates = ['#FFFFFF', '#172326', '#000000'];
    return candidates.find((candidate) => contrastRatio(background, candidate) >= 4.5) || '#000000';
};

export const createBrandScale = (source) => {
    const base = normalizeHexColor(source);
    return {
        50: mixHexColors(base, '#FFFFFF', 0.92),
        100: mixHexColors(base, '#FFFFFF', 0.84),
        200: mixHexColors(base, '#FFFFFF', 0.68),
        300: mixHexColors(base, '#FFFFFF', 0.50),
        400: mixHexColors(base, '#FFFFFF', 0.26),
        500: mixHexColors(base, '#FFFFFF', 0.10),
        600: base,
        700: mixHexColors(base, '#000000', 0.16),
        800: mixHexColors(base, '#000000', 0.28),
        900: mixHexColors(base, '#000000', 0.40),
        950: mixHexColors(base, '#000000', 0.52),
    };
};

export const resolveBrandColor = (preferences = {}) => {
    if (preferences.primaryColor === 'custom') {
        return normalizeHexColor(preferences.customColor);
    }
    return BRAND_COLOR_PRESETS[preferences.primaryColor] || BRAND_COLOR_PRESETS.emerald;
};

export const normalizePaletteOverrides = (value = {}) => {
    const raw = value && typeof value === 'object' ? value : {};
    return ['light', 'dark'].reduce((result, mode) => {
        const palette = raw[mode] && typeof raw[mode] === 'object' ? raw[mode] : {};
        result[mode] = SEMANTIC_COLOR_KEYS.reduce((colors, key) => {
            if (/^#[0-9a-f]{6}$/i.test(palette[key] || '')) colors[key] = palette[key].toUpperCase();
            return colors;
        }, {});
        return result;
    }, {});
};

export const applyThemePalette = (root, { brandColor, mode = 'light', colorOverrides = {} } = {}) => {
    if (!root?.style) return;

    const resolvedMode = mode === 'dark' ? 'dark' : 'light';
    const palette = {
        ...SEMANTIC_PALETTE_DEFAULTS[resolvedMode],
        ...normalizePaletteOverrides(colorOverrides)[resolvedMode],
    };
    const textColors = getPaletteTextContrastStatus(palette)
        .reduce((result, entry) => ({ ...result, [entry.key]: entry.color }), {});
    const scale = createBrandScale(brandColor);
    const accessibleTone = getAccessibleBrandTone(scale, palette.surface, resolvedMode);
    const accent = accessibleTone.color;
    const accentContrast = getContrastColor(accent);
    const darkInteractionSteps = [300, 200, 100, 50, 400, 500, 600];
    const findInteractionTone = (steps, fallback) => steps
        .map((step) => scale[step])
        .find((color) => color !== accent && contrastRatio(color, accentContrast) >= 4.5) || fallback;
    const accentHover = resolvedMode === 'dark'
        ? findInteractionTone(darkInteractionSteps, accent)
        : findInteractionTone([700, 800, 900, 950, 600], accent);
    const accentActive = resolvedMode === 'dark'
        ? findInteractionTone(darkInteractionSteps.filter((step) => scale[step] !== accentHover), accentHover)
        : findInteractionTone([800, 900, 950, 700, 600].filter((step) => scale[step] !== accentHover), accentHover);
    const accentSoft = resolvedMode === 'dark'
        ? mixHexColors(scale[600], palette.canvas, 0.76)
        : scale[50];

    Object.entries(CSS_TOKEN_MAP).forEach(([key, cssVariable]) => {
        root.style.setProperty(cssVariable, textColors[key] || palette[key]);
    });
    root.style.setProperty('--text-secondary', textColors.textSecondary);
    root.style.setProperty('--text-muted', textColors.textMuted);
    root.style.setProperty('--VIARA-ink', textColors.text);
    root.style.setProperty('--VIARA-muted', textColors.textSecondary);
    Object.entries(scale).forEach(([step, color]) => {
        root.style.setProperty(`--viara-primary-${step}`, color);
        root.style.setProperty(`--viara-primary-${step}-rgb`, hexToChannels(color).join(' '));
    });

    const rgb = hexToChannels(accent).join(', ');
    root.style.setProperty('--viara-primary', accent);
    root.style.setProperty('--viara-primary-hover', accentHover);
    root.style.setProperty('--viara-primary-active', accentActive);
    root.style.setProperty('--viara-primary-dark', scale[900]);
    root.style.setProperty('--viara-primary-light', accentSoft);
    root.style.setProperty('--viara-primary-rgb', rgb);
    root.style.setProperty('--VIARA-accent', accent);
    root.style.setProperty('--VIARA-accent-text', accent);
    root.style.setProperty('--VIARA-accent-dark', accentHover);
    root.style.setProperty('--VIARA-accent-active', accentActive);
    root.style.setProperty('--VIARA-accent-soft', accentSoft);
    root.style.setProperty('--VIARA-accent-contrast', accentContrast);
    root.style.setProperty('--VIARA-accent-rgb', rgb);

    const semanticSurfaceWeight = resolvedMode === 'dark' ? 0.82 : 0.88;
    ['success', 'warning', 'danger', 'info'].forEach((key) => {
        const soft = mixHexColors(palette[key], palette.surface, semanticSurfaceWeight);
        const border = mixHexColors(palette[key], palette.surface, resolvedMode === 'dark' ? 0.62 : 0.7);
        const foreground = getAccessibleSemanticTone(palette[key], soft, palette.text);
        root.style.setProperty(`--${key}-bg`, soft);
        root.style.setProperty(`--VIARA-${key}`, foreground);
        root.style.setProperty(`--VIARA-${key}-soft`, soft);
        root.style.setProperty(`--VIARA-${key}-border`, border);
        root.style.setProperty(`--VIARA-${key}-contrast`, getContrastColor(foreground));
    });
};
