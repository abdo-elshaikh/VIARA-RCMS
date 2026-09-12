import { VIARA_BRAND } from '../config/brand';

export const DEFAULT_CENTER_IDENTITY = {
    center_id: 'default',
    center_name: 'Radiology Center',
    center_name_ar: '',
    legal_name: '',
    legal_name_ar: '',
    branch_id: '',
    branch_code: '',
    branch_name: '',
    branch_name_ar: '',
    branch_display_name: '',
    branch_display_name_ar: '',
    logo_url: VIARA_BRAND.centerLogoUrl || '/center-logo.png',
    logo_dark_url: '',
    logo_light_url: '',
    favicon_url: '',
    primary_color: '#087F5B',
    secondary_color: '#327C92',
    accent_color: '#F4B942',
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
    tax_id: '',
    tax_number: '',
    commercial_registration: '',
    medical_license: '',
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
    showPoweredByViara: true
};

const SNAPSHOT_KEYS = [
    'brand_snapshot',
    'branding_snapshot',
    'organization_snapshot',
    'document_identity',
    'documentIdentity',
    'identity_snapshot',
    'identitySnapshot',
    'center_identity',
    'centerIdentity',
    'branch_identity',
    'branchIdentity'
];

const parseJSONSafe = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || '';

const pickLocalized = (base, ar, language) => {
    const isArabic = String(language || '').toLowerCase().startsWith('ar');
    return firstValue(isArabic ? ar : '', base, ar);
};

const extractSnapshot = (entity = {}) => {
    for (const key of SNAPSHOT_KEYS) {
        const parsed = parseJSONSafe(entity?.[key]);
        if (parsed) return parsed;
    }
    return {};
};

const extractBranchOverride = (entity = {}) => ({
    branch_id: entity.branch_id,
    branch_code: entity.branch_code,
    branch_name: entity.branch_name || entity.branchName,
    branch_name_ar: entity.branch_name_ar || entity.branchNameAr,
    branch_display_name: entity.branch_display_name || entity.branchDisplayName,
    branch_display_name_ar: entity.branch_display_name_ar || entity.branchDisplayNameAr,
    logo_url: entity.branch_logo_url || entity.branchLogoUrl,
    phone: entity.branch_phone || entity.branchPhone,
    alternative_phone: entity.branch_alternative_phone || entity.branchAlternativePhone,
    hotline: entity.branch_hotline || entity.branchHotline,
    whatsapp: entity.branch_whatsapp || entity.branchWhatsapp,
    email: entity.branch_email || entity.branchEmail,
    address: entity.branch_address || entity.branchAddress,
    address_ar: entity.branch_address_ar || entity.branchAddressAr,
    country: entity.branch_country || entity.branchCountry,
    governorate: entity.branch_governorate || entity.branchGovernorate,
    city: entity.branch_city || entity.branchCity,
    postal_code: entity.branch_postal_code || entity.branchPostalCode,
    tax_id: entity.branch_tax_id || entity.branchTaxId || entity.branch_tax_number,
    commercial_registration: entity.branch_commercial_registration || entity.branchCommercialRegistration,
    medical_license: entity.branch_medical_license || entity.branchMedicalLicense,
    invoice_footer: entity.branch_invoice_footer || entity.branchInvoiceFooter,
    receipt_footer: entity.branch_receipt_footer || entity.branchReceiptFooter,
    report_disclaimer: entity.branch_report_footer || entity.branchReportFooter
});

const normalizeRawSettings = (settings = {}) => {
    const printSettings = parseJSONSafe(settings.print_settings) || settings.print_settings || {};
    const homepageSettings = parseJSONSafe(settings.homepage_settings) || settings.homepage_settings || {};

    return {
        ...DEFAULT_CENTER_IDENTITY,
        ...settings,
        center_id: firstValue(settings.center_id, settings.centerId, DEFAULT_CENTER_IDENTITY.center_id),
        center_name: firstValue(settings.center_name, settings['center.name'], DEFAULT_CENTER_IDENTITY.center_name),
        center_name_ar: firstValue(settings.center_name_ar, settings['center.name_ar']),
        legal_name: firstValue(settings.legal_name, settings.legalName),
        legal_name_ar: firstValue(settings.legal_name_ar, settings.legalNameAr),
        branch_id: firstValue(settings.branch_id, settings.branchId),
        branch_code: firstValue(settings.branch_code, settings.branchCode),
        branch_name: firstValue(settings.branch_name, settings['center.branch']),
        branch_name_ar: firstValue(settings.branch_name_ar, settings.branchNameAr),
        branch_display_name: firstValue(settings.branch_display_name, settings.branchDisplayName),
        branch_display_name_ar: firstValue(settings.branch_display_name_ar, settings.branchDisplayNameAr),
        logo_url: firstValue(settings.logo_url, settings['center.logo_url'], settings.logoUrl),
        logo_dark_url: firstValue(settings.logo_dark_url, settings.logoDarkUrl),
        logo_light_url: firstValue(settings.logo_light_url, settings.logoLightUrl),
        primary_color: firstValue(settings.primary_color, settings.primaryColor, printSettings.themeColor, DEFAULT_CENTER_IDENTITY.primary_color),
        secondary_color: firstValue(settings.secondary_color, settings.secondaryColor, DEFAULT_CENTER_IDENTITY.secondary_color),
        accent_color: firstValue(settings.accent_color, settings.accentColor, homepageSettings.accentColor, DEFAULT_CENTER_IDENTITY.accent_color),
        phone: firstValue(settings.phone, settings['center.phone']),
        alternative_phone: firstValue(settings.alternative_phone, settings.alternativePhone),
        hotline: firstValue(settings.hotline),
        whatsapp: firstValue(settings.whatsapp),
        email: firstValue(settings.email, settings['center.email']),
        support_email: firstValue(settings.support_email, settings.supportEmail),
        website: firstValue(settings.website),
        address: firstValue(settings.address, settings['center.address']),
        address_ar: firstValue(settings.address_ar, settings.addressAr),
        tax_id: firstValue(settings.tax_id, settings.taxNumber, settings.tax_number),
        tax_number: firstValue(settings.tax_number, settings.taxNumber, settings.tax_id),
        commercial_registration: firstValue(settings.commercial_registration, settings.commercialRegistration),
        medical_license: firstValue(settings.medical_license, settings.medicalLicense),
        print_settings: {
            themeColor: DEFAULT_CENTER_IDENTITY.primary_color,
            fontFamily: 'Inter',
            ...printSettings
        },
        homepage_settings: homepageSettings
    };
};

const mergeIdentity = (base, override = {}) => {
    const next = { ...base };
    Object.entries(override || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            next[key] = value;
        }
    });
    return next;
};

export const resolveDocumentIdentity = (settings = {}, entity = {}, options = {}) => {
    if (settings?.__identityResolved) return settings;

    const language = options.language || options.locale || 'en';
    const organization = normalizeRawSettings(settings);
    const snapshot = extractSnapshot(entity);
    const branchOverride = extractBranchOverride(entity);
    const resolved = mergeIdentity(mergeIdentity(organization, snapshot), branchOverride);

    const centerName = pickLocalized(resolved.center_name, resolved.center_name_ar, language);
    const branchName = pickLocalized(
        firstValue(resolved.branch_display_name, resolved.branch_name),
        firstValue(resolved.branch_display_name_ar, resolved.branch_name_ar),
        language
    );
    const address = pickLocalized(resolved.address, resolved.address_ar, language);
    const footer = pickLocalized(resolved.footer_text, resolved.footer_text_ar, language);

    return {
        ...resolved,
        __identityResolved: true,
        centerName,
        centerNameAr: resolved.center_name_ar,
        branchName,
        branchNameAr: resolved.branch_name_ar,
        displayName: [centerName, branchName].filter(Boolean).join(' - '),
        logoUrl: firstValue(resolved.logo_url, resolved.logoUrl, VIARA_BRAND.centerLogoUrl || '/center-logo.png'),
        logoDarkUrl: firstValue(resolved.logo_dark_url, resolved.logoDarkUrl),
        logoLightUrl: firstValue(resolved.logo_light_url, resolved.logoLightUrl),
        primaryColor: firstValue(resolved.primary_color, resolved.primaryColor, DEFAULT_CENTER_IDENTITY.primary_color),
        secondaryColor: firstValue(resolved.secondary_color, resolved.secondaryColor, DEFAULT_CENTER_IDENTITY.secondary_color),
        accentColor: firstValue(resolved.accent_color, resolved.accentColor, DEFAULT_CENTER_IDENTITY.accent_color),
        phone: firstValue(resolved.phone),
        hotline: firstValue(resolved.hotline),
        whatsapp: firstValue(resolved.whatsapp),
        email: firstValue(resolved.email, resolved.support_email),
        website: firstValue(resolved.website),
        address,
        taxNumber: firstValue(resolved.tax_id, resolved.tax_number),
        commercialRegistration: firstValue(resolved.commercial_registration),
        medicalLicense: firstValue(resolved.medical_license),
        footer,
        poweredBy: resolved.showPoweredByViara === false ? '' : `Powered by ${VIARA_BRAND.name}`
    };
};

export const buildDocumentHeader = (settings = {}, entity = {}, options = {}) => {
    const identity = resolveDocumentIdentity(settings, entity, options);
    return [
        identity.displayName || identity.centerName,
        identity.address,
        identity.hotline && `Hotline: ${identity.hotline}`,
        identity.phone && `Phone: ${identity.phone}`,
        identity.email && `Email: ${identity.email}`,
        identity.website,
        identity.medicalLicense && `Medical license: ${identity.medicalLicense}`
    ].filter(Boolean).join('\n');
};

export const buildDocumentFooter = (settings = {}, entity = {}, options = {}) => {
    const identity = resolveDocumentIdentity(settings, entity, options);
    const customFooter = options.kind === 'invoice'
        ? pickLocalized(identity.invoice_footer, identity.invoice_footer_ar, options.language)
        : options.kind === 'receipt'
            ? pickLocalized(identity.receipt_footer, identity.receipt_footer_ar, options.language)
            : pickLocalized(identity.report_disclaimer, identity.report_disclaimer_ar, options.language);

    return [
        customFooter || identity.footer || `${identity.centerName} - Confidential medical document`,
        identity.poweredBy
    ].filter(Boolean).join('\n');
};

export const createIdentitySnapshot = (settings = {}, entity = {}, options = {}) => {
    const identity = resolveDocumentIdentity(settings, entity, options);
    return {
        centerName: identity.centerName,
        branchName: identity.branchName,
        logoUrl: identity.logoUrl,
        address: identity.address,
        phone: identity.phone,
        hotline: identity.hotline,
        email: identity.email,
        website: identity.website,
        taxNumber: identity.taxNumber,
        commercialRegistration: identity.commercialRegistration,
        medicalLicense: identity.medicalLicense,
        primaryColor: identity.primaryColor
    };
};
