export const VIARA_BRAND = {
    name: import.meta.env.VITE_APP_NAME || 'VIARA',
    descriptor: import.meta.env.VITE_APP_DESCRIPTOR || 'Healthcare technology platform',
    tagline: import.meta.env.VITE_APP_TAGLINE || 'A Better Way to Care.',
    staffEmailPlaceholder: import.meta.env.VITE_APP_STAFF_EMAIL_PLACEHOLDER || 'user@viara.health',
    logoUrl: import.meta.env.VITE_APP_LOGO_URL || '/logo.png',
    // Theme-specific logos: light_logo.png for use on dark backgrounds,
    // dark_logo.png for use on light backgrounds.
    lightLogoUrl: import.meta.env.VITE_APP_LIGHT_LOGO_URL || '/logo.png',
    darkLogoUrl: import.meta.env.VITE_APP_DARK_LOGO_URL || '/logo.png',
    iconUrl: import.meta.env.VITE_APP_ICON_URL || '/logo.png',
};
