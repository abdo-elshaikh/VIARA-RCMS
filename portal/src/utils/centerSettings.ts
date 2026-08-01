export interface WorkingHours {
    start: number;
    end: number;
    holidays: string[];
}

export interface PrintSettings {
    stickerWidth: string;
    stickerHeight: string;
    receiptWidth: string;
    receiptHeader: string;
    receiptFooter: string;
    showQR: boolean;
    themeColor: string;
    fontFamily: string;
    invoiceTerms: string;
    showWatermark: boolean;
    headerLayout: string;
}

export interface ServiceItem {
    title: string;
    description: string;
}

export interface StatItem {
    value: string;
    label: string;
}

export interface HomepageSettings {
    enabled: boolean;
    heroTitle: string;
    heroSubtitle: string;
    announcement: string;
    heroImageUrl: string;
    accentColor: string;
    primaryCtaLabel: string;
    primaryCtaUrl: string;
    secondaryCtaLabel: string;
    secondaryCtaUrl: string;
    services: ServiceItem[];
    stats: StatItem[];
    highlights: string[];
}

export interface CenterSettings {
    center_name: string;
    center_name_ar?: string;
    branch_name: string;
    branch_name_ar?: string;
    logo_url?: string | null;
    contact_person?: string;
    other_details?: string;
    tax_id?: string;
    phone?: string;
    email?: string;
    address?: string;
    invoice_prefix?: string;
    report_header?: string;
    report_footer?: string;
    working_hours: WorkingHours;
    print_settings: PrintSettings;
    homepage_settings: HomepageSettings;
}

const DEFAULT_CENTER_SETTINGS: CenterSettings = {
    center_name: 'RCMS Radiology Center',
    branch_name: '',
    logo_url: '',
    contact_person: '',
    other_details: '',
    tax_id: '',
    phone: '',
    email: '',
    address: '',
    invoice_prefix: 'INV-',
    report_header: '',
    report_footer: '',
    working_hours: { start: 6, end: 22, holidays: [] },
    print_settings: {
        stickerWidth: '3.8in',
        stickerHeight: '1.8in',
        receiptWidth: '80mm',
        receiptHeader: '',
        receiptFooter: '',
        showQR: true,
        themeColor: '#0f766e',
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
        accentColor: '#0891b2',
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

export const normalizeCenterSettings = (settings: Record<string, any> = {}, language: string = 'en'): CenterSettings => {
    const workingHours = settings.working_hours || {};
    const printSettings = settings.print_settings || {};
    const homepageSettings = settings.homepage_settings || {};

    const isRtl = language === 'ar';
    const centerName = (isRtl && settings.center_name_ar) ? settings.center_name_ar : (settings.center_name || DEFAULT_CENTER_SETTINGS.center_name);
    const branchName = (isRtl && settings.branch_name_ar) ? settings.branch_name_ar : (settings.branch_name || DEFAULT_CENTER_SETTINGS.branch_name);

    return {
        ...DEFAULT_CENTER_SETTINGS,
        ...settings,
        center_name: centerName,
        branch_name: branchName,
        working_hours: {
            ...DEFAULT_CENTER_SETTINGS.working_hours,
            ...workingHours,
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

export const getCenterDisplayName = (settings: Record<string, any> = {}): string => {
    const normalized = normalizeCenterSettings(settings);
    return [normalized.center_name, normalized.branch_name].filter(Boolean).join(' - ');
};

export const buildReceiptHeader = (settings: Record<string, any> = {}): string => {
    const normalized = normalizeCenterSettings(settings);
    if (normalized.print_settings.receiptHeader?.trim()) return normalized.print_settings.receiptHeader;

    return [
        normalized.center_name,
        normalized.branch_name,
        normalized.address,
        normalized.phone && `Phone: ${normalized.phone}`,
        normalized.email && `Email: ${normalized.email}`,
        normalized.contact_person && `Contact: ${normalized.contact_person}`,
        normalized.other_details
    ].filter(Boolean).join('\n');
};

export const buildReceiptFooter = (settings: Record<string, any> = {}): string => {
    const normalized = normalizeCenterSettings(settings);
    return normalized.print_settings.receiptFooter?.trim()
        || `Thank you for choosing ${normalized.center_name}.`;
};

export const buildReportHeader = (settings: Record<string, any> = {}): string => {
    const normalized = normalizeCenterSettings(settings);
    return normalized.report_header?.trim()
        || [
            getCenterDisplayName(normalized),
            normalized.address,
            normalized.phone && `Phone: ${normalized.phone}`,
            normalized.email && `Email: ${normalized.email}`
        ].filter(Boolean).join('\n');
};

export const buildReportFooter = (settings: Record<string, any> = {}): string => {
    const normalized = normalizeCenterSettings(settings);
    return normalized.report_footer?.trim()
        || `${normalized.center_name} - Confidential medical report`;
};
