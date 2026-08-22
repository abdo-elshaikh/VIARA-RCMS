import {
    DEFAULT_CENTER_IDENTITY,
    buildDocumentFooter,
    buildDocumentHeader,
    resolveDocumentIdentity
} from './documentIdentity';

const DEFAULT_CENTER_SETTINGS = {
    center_id: DEFAULT_CENTER_IDENTITY.center_id,
    center_name: DEFAULT_CENTER_IDENTITY.center_name,
    center_name_ar: '',
    legal_name: '',
    legal_name_ar: '',
    branch_id: '',
    branch_code: '',
    branch_name: '',
    branch_name_ar: '',
    branch_display_name: '',
    branch_display_name_ar: '',
    logo_url: '',
    logo_dark_url: '',
    logo_light_url: '',
    favicon_url: '',
    primary_color: DEFAULT_CENTER_IDENTITY.primary_color,
    secondary_color: DEFAULT_CENTER_IDENTITY.secondary_color,
    accent_color: DEFAULT_CENTER_IDENTITY.accent_color,
    contact_person: '',
    other_details: '',
    tax_id: '',
    tax_number: '',
    commercial_registration: '',
    medical_license: '',
    phone: '',
    alternative_phone: '',
    hotline: '',
    whatsapp: '',
    email: '',
    support_email: '',
    website: '',
    address: '',
    address_ar: '',
    country: '',
    governorate: '',
    city: '',
    postal_code: '',
    invoice_prefix: 'INV-',
    report_header: '',
    report_footer: '',
    footer_text: '',
    footer_text_ar: '',
    report_disclaimer: '',
    report_disclaimer_ar: '',
    invoice_footer: '',
    invoice_footer_ar: '',
    receipt_footer: '',
    receipt_footer_ar: '',
    portal_welcome_message: '',
    portal_welcome_message_ar: '',
    default_language: 'en',
    timezone: 'Africa/Cairo',
    currency: 'EGP',
    vat_enabled: false,
    vat_rate: 0,
    showPoweredByViara: true,
    working_hours: { start: 6, end: 22, workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] },
    print_settings: {
        stickerWidth: '3.8in',
        stickerHeight: '1.8in',
        receiptWidth: '80mm',
        receiptHeader: '',
        receiptFooter: '',
        showQR: true,
        themeColor: DEFAULT_CENTER_IDENTITY.primary_color,
        fontFamily: 'Inter',
        invoiceTerms: '',
        showWatermark: true,
        headerLayout: 'classic'
    },
    homepage_settings: {
        enabled: true,
        heroTitle: 'Advanced diagnostic imaging with clear, compassionate care.',
        heroSubtitle: 'Book MRI, CT, ultrasound, X-ray, mammography, and specialized radiology services with a team focused on comfort, accuracy, and fast report delivery.',
        announcement: 'Same-day appointments available for selected studies',
        heroImageUrl: '/images/radiology-scan-montage.png',
        accentColor: DEFAULT_CENTER_IDENTITY.primary_color,
        primaryCtaLabel: 'Book appointment',
        primaryCtaUrl: '#contact',
        secondaryCtaLabel: 'Patient portal',
        secondaryCtaUrl: '/patient',
        services: [
            { title: 'MRI imaging', description: 'High-resolution neurological, musculoskeletal, abdominal, and vascular MRI studies.' },
            { title: 'CT scanning', description: 'Fast cross-sectional imaging for urgent, chest, abdomen, and trauma evaluations.' },
            { title: 'Ultrasound', description: 'Comfortable real-time imaging for abdominal, pelvic, vascular, and soft-tissue exams.' },
            { title: 'X-ray and fluoroscopy', description: 'Efficient digital radiography and guided dynamic imaging for everyday diagnostics.' },
            { title: 'Mammography', description: 'Breast imaging workflows designed for screening, diagnosis, and follow-up.' },
            { title: 'Report delivery', description: 'Secure patient and referring doctor access to finalized reports and documents.' }
        ],
        stats: [
            { value: '24/7', label: 'patient portal access' },
            { value: '06+', label: 'imaging services' },
            { value: '02', label: 'secure portals' },
            { value: '01', label: 'connected care team' }
        ],
        highlights: ['Consultant radiologists', 'Digital reports', 'Arabic and English support', 'Insurance-ready workflows']
    }
};

export const normalizeCenterSettings = (settings = {}) => {
    const workingHours = settings.working_hours || {};
    const printSettings = settings.print_settings || {};
    const homepageSettings = settings.homepage_settings || {};

    return {
        ...DEFAULT_CENTER_SETTINGS,
        ...settings,
        center_name: settings.center_name || DEFAULT_CENTER_SETTINGS.center_name,
        working_hours: {
            ...DEFAULT_CENTER_SETTINGS.working_hours,
            ...workingHours,
            workingDays: Array.isArray(workingHours.workingDays)
                ? workingHours.workingDays
                : (Array.isArray(workingHours.days) ? workingHours.days : [0, 1, 2, 3, 4, 5, 6]),
            holidays: Array.isArray(workingHours.holidays) ? workingHours.holidays : []
        },
        print_settings: {
            ...DEFAULT_CENTER_SETTINGS.print_settings,
            ...printSettings,
            showQR: printSettings.showQR !== false,
            showWatermark: printSettings.showWatermark !== false
        },
        homepage_settings: {
            ...DEFAULT_CENTER_SETTINGS.homepage_settings,
            ...homepageSettings,
            enabled: homepageSettings.enabled !== false,
            heroTitle: homepageSettings.heroTitle || DEFAULT_CENTER_SETTINGS.homepage_settings.heroTitle,
            heroSubtitle: homepageSettings.heroSubtitle || DEFAULT_CENTER_SETTINGS.homepage_settings.heroSubtitle,
            announcement: homepageSettings.announcement || DEFAULT_CENTER_SETTINGS.homepage_settings.announcement,
            heroImageUrl: homepageSettings.heroImageUrl || DEFAULT_CENTER_SETTINGS.homepage_settings.heroImageUrl,
            accentColor: homepageSettings.accentColor || DEFAULT_CENTER_SETTINGS.homepage_settings.accentColor,
            primaryCtaLabel: homepageSettings.primaryCtaLabel || DEFAULT_CENTER_SETTINGS.homepage_settings.primaryCtaLabel,
            primaryCtaUrl: homepageSettings.primaryCtaUrl || DEFAULT_CENTER_SETTINGS.homepage_settings.primaryCtaUrl,
            secondaryCtaLabel: homepageSettings.secondaryCtaLabel || DEFAULT_CENTER_SETTINGS.homepage_settings.secondaryCtaLabel,
            secondaryCtaUrl: homepageSettings.secondaryCtaUrl || DEFAULT_CENTER_SETTINGS.homepage_settings.secondaryCtaUrl,
            services: Array.isArray(homepageSettings.services) && homepageSettings.services.length
                ? homepageSettings.services
                : DEFAULT_CENTER_SETTINGS.homepage_settings.services,
            stats: Array.isArray(homepageSettings.stats) && homepageSettings.stats.length
                ? homepageSettings.stats
                : DEFAULT_CENTER_SETTINGS.homepage_settings.stats,
            highlights: Array.isArray(homepageSettings.highlights) && homepageSettings.highlights.length
                ? homepageSettings.highlights
                : DEFAULT_CENTER_SETTINGS.homepage_settings.highlights
        }
    };
};

export const getCenterDisplayName = (settings = {}) => {
    const identity = resolveDocumentIdentity(settings);
    return identity.displayName;
};

export const buildReceiptHeader = (settings = {}) => {
    const normalized = normalizeCenterSettings(settings);
    if (normalized.print_settings.receiptHeader?.trim()) return normalized.print_settings.receiptHeader;
    return buildDocumentHeader(normalized, {}, { kind: 'receipt' });
};

export const buildReceiptFooter = (settings = {}) => {
    const normalized = normalizeCenterSettings(settings);
    return normalized.print_settings.receiptFooter?.trim()
        || buildDocumentFooter(normalized, {}, { kind: 'receipt' });
};

export const buildReportHeader = (settings = {}) => {
    const normalized = normalizeCenterSettings(settings);
    return normalized.report_header?.trim()
        || buildDocumentHeader(normalized, {}, { kind: 'report' });
};

export const buildReportFooter = (settings = {}) => {
    const normalized = normalizeCenterSettings(settings);
    return normalized.report_footer?.trim()
        || buildDocumentFooter(normalized, {}, { kind: 'report' });
};

export {
    buildDocumentFooter,
    buildDocumentHeader,
    resolveDocumentIdentity
};
