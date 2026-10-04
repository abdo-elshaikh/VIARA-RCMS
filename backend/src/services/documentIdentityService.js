const DEFAULT_CENTER_IDENTITY = {
    center_id: 'default',
    center_name: 'Radiology Center',
    center_name_ar: '',
    branch_id: '',
    branch_code: '',
    branch_name: '',
    branch_name_ar: '',
    branch_display_name: '',
    branch_display_name_ar: '',
    logo_url: '',
    logo_dark_url: '',
    logo_light_url: '',
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
    receipt_footer_ar: ''
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
        if (parsed) {
            const branchName = parsed.branch_name || parsed.branchName;
            const branchNameAr = parsed.branch_name_ar || parsed.branchNameAr;
            return {
                ...parsed,
                branch_name: branchName,
                branch_name_ar: branchNameAr,
                branch_display_name: parsed.branch_display_name || parsed.branchDisplayName || branchName,
                branch_display_name_ar: parsed.branch_display_name_ar || parsed.branchDisplayNameAr || branchNameAr
            };
        }
    }
    return {};
};

const extractBranchOverride = (entity = {}) => {
    const branchName = entity.branch_name || entity.branchName;
    const branchNameAr = entity.branch_name_ar || entity.branchNameAr;
    return {
        branch_id: entity.branch_id,
        branch_code: entity.branch_code,
        branch_name: branchName,
        branch_name_ar: branchNameAr,
        branch_display_name: entity.branch_display_name || entity.branchDisplayName || branchName,
        branch_display_name_ar: entity.branch_display_name_ar || entity.branchDisplayNameAr || branchNameAr,
        logo_url: entity.branch_logo_url || entity.branchLogoUrl,
        phone: entity.branch_phone || entity.branchPhone,
        hotline: entity.branch_hotline || entity.branchHotline,
        whatsapp: entity.branch_whatsapp || entity.branchWhatsapp,
        email: entity.branch_email || entity.branchEmail,
        address: entity.branch_address || entity.branchAddress,
        address_ar: entity.branch_address_ar || entity.branchAddressAr,
        tax_id: entity.branch_tax_id || entity.branchTaxId || entity.branch_tax_number,
        commercial_registration: entity.branch_commercial_registration || entity.branchCommercialRegistration,
        medical_license: entity.branch_medical_license || entity.branchMedicalLicense
    };
};

const normalizeOrganizationSettings = (settings = {}) => {
    const print = parseJSONSafe(settings.print_settings) || settings.print_settings || {};
    const branchName = firstValue(settings['center.branch'], settings['center.branch_name'], settings.branch_name);
    const branchNameAr = firstValue(settings['center.branch_name_ar'], settings['center.branch_display_name_ar'], settings.branch_name_ar, settings.branchNameAr);

    return {
        ...DEFAULT_CENTER_IDENTITY,
        ...settings,
        center_id: firstValue(settings['center.id'], settings.center_id, settings.centerId, DEFAULT_CENTER_IDENTITY.center_id),
        center_name: firstValue(settings['center.name'], settings.center_name, DEFAULT_CENTER_IDENTITY.center_name),
        center_name_ar: firstValue(settings['center.name_ar'], settings.center_name_ar),
        branch_id: firstValue(settings['center.branch_id'], settings.branch_id, settings.branchId),
        branch_code: firstValue(settings['center.branch_code'], settings.branch_code, settings.branchCode),
        branch_name: branchName,
        branch_name_ar: branchNameAr,
        branch_display_name: firstValue(settings['center.branch_display_name'], settings.branch_display_name, branchName),
        branch_display_name_ar: firstValue(settings['center.branch_display_name_ar'], settings.branch_display_name_ar, branchNameAr),
        logo_url: firstValue(settings['center.logo_url'], settings['center.logo_light_url'], settings.logo_url, settings.logoUrl),
        phone: firstValue(settings['center.phone'], settings.phone),
        hotline: firstValue(settings['center.hotline'], settings.hotline),
        whatsapp: firstValue(settings['center.whatsapp'], settings.whatsapp),
        email: firstValue(settings['center.email'], settings.email),
        support_email: firstValue(settings['center.support_email'], settings.support_email, settings.supportEmail),
        website: firstValue(settings['center.website'], settings.website),
        address: firstValue(settings['center.address'], settings.address),
        address_ar: firstValue(settings['center.address_ar'], settings.address_ar),
        tax_id: firstValue(settings['center.tax_id'], settings.tax_id, settings.taxNumber, settings.tax_number),
        tax_number: firstValue(settings.tax_number, settings['center.tax_id'], settings.tax_id),
        commercial_registration: firstValue(settings['center.commercial_registration'], settings.commercial_registration),
        medical_license: firstValue(settings['center.medical_license'], settings.medical_license),
        primary_color: firstValue(settings['center.primary_color'], settings.primary_color, settings.primaryColor, print.themeColor, DEFAULT_CENTER_IDENTITY.primary_color),
        print_settings: print
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

const resolveDocumentIdentity = (settings = {}, entity = {}, options = {}) => {
    if (settings?.__identityResolved) return settings;

    const language = options.language || options.locale || 'en';
    const resolved = mergeIdentity(
        mergeIdentity(normalizeOrganizationSettings(settings), extractSnapshot(entity)),
        extractBranchOverride(entity)
    );
    const centerNameAr = firstValue(resolved.center_name_ar, resolved.center_name);
    const centerNameEn = firstValue(resolved.center_name, resolved.center_name_ar);
    const branchNameAr = firstValue(resolved.branch_display_name_ar, resolved.branch_name_ar);
    const branchNameEn = firstValue(resolved.branch_display_name, resolved.branch_name);

    const centerName = pickLocalized(resolved.center_name, resolved.center_name_ar, language) || centerNameAr || centerNameEn;
    const branchName = pickLocalized(branchNameEn, branchNameAr, language) || (language.startsWith('ar') ? branchNameAr : branchNameEn);
    const address = pickLocalized(resolved.address, resolved.address_ar, language) || firstValue(resolved.address_ar, resolved.address);

    return {
        ...resolved,
        __identityResolved: true,
        centerName,
        branchName,
        centerNameAr,
        centerNameEn,
        branchNameAr,
        branchNameEn,
        displayName: [centerName, branchName].filter(Boolean).join(' - '),
        displayNameAr: [centerNameAr, branchNameAr].filter(Boolean).join(' - '),
        displayNameEn: [centerNameEn, branchNameEn].filter(Boolean).join(' - '),
        logoUrl: firstValue(resolved.logo_url, resolved.logoUrl),
        primaryColor: firstValue(resolved.primary_color, DEFAULT_CENTER_IDENTITY.primary_color),
        phone: firstValue(resolved.phone),
        hotline: firstValue(resolved.hotline),
        whatsapp: firstValue(resolved.whatsapp),
        email: firstValue(resolved.email, resolved.support_email),
        website: firstValue(resolved.website),
        address,
        taxNumber: firstValue(resolved.tax_id, resolved.tax_number),
        commercialRegistration: firstValue(resolved.commercial_registration),
        medicalLicense: firstValue(resolved.medical_license)
    };
};

const createIdentitySnapshot = (settings = {}, entity = {}, options = {}) => {
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

module.exports = {
    DEFAULT_CENTER_IDENTITY,
    createIdentitySnapshot,
    normalizeOrganizationSettings,
    resolveDocumentIdentity
};
