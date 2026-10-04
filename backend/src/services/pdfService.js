const { resolveDocumentIdentity } = require('./documentIdentityService');
const { getLicense } = require('./licenseService');

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/**
 * Returns true when the currently loaded license is a trial edition.
 * Used to inject a non-removable "TRIAL" overlay on every printed report so
 * trial output can never be mistaken for a production clinical document.
 *
 * @returns {boolean}
 */
const isTrialEdition = () => {
    try {
        const lic = getLicense();
        return !!(lic && lic.edition === 'trial');
    } catch {
        return false;
    }
};

const parseJSONSafe = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
};

const enabledUnlessFalse = (value) => value !== false && String(value).toLowerCase() !== 'false';

const lineBreaks = (value = '') => escapeHtml(value).replace(/\n/g, '<br>');

const safeArray = (val, fallback = []) => Array.isArray(val) ? val : fallback;

const safeObject = (val, fallback = {}) => (val && typeof val === 'object' && !Array.isArray(val)) ? val : fallback;

const normalizeCenterSettings = (settings = {}, entity = {}) => {
    const print = parseJSONSafe(settings.print_settings) || settings.print_settings || {};
    let enabled = settings.enabledFields || print.enabledFields;
    if (typeof enabled === 'string') {
        enabled = enabled.split(',').map(s => s.trim()).filter(Boolean);
    }
    let visibleSections = settings.visibleSections || print.visibleSections;
    if (typeof visibleSections === 'string') {
        visibleSections = visibleSections.split(',').map(s => s.trim()).filter(Boolean);
    }
    const hasArabicText = (text = '') => /[\u0600-\u06FF]/.test(String(text));
    const isArabic = Boolean(
        String(settings.language || settings.lang || print.language || '').toLowerCase().startsWith('ar')
        || (settings['center.default_language'] === 'ar')
        || (settings.center_name_ar && hasArabicText(entity.patient_name || ''))
        || hasArabicText(entity.patient_name || '')
        || hasArabicText(entity.first_name || '')
        || hasArabicText(entity.patient_name_enc || '')
    );
    const language = isArabic ? 'ar' : (settings.language || 'en');
    const identity = resolveDocumentIdentity(settings, entity, { language });
    return {
        ...settings,
        isArabic,
        language,
        center_name: identity.centerName,
        center_name_ar: identity.centerNameAr,
        center_name_en: identity.centerNameEn,
        branch_name: identity.branchName,
        branch_name_ar: identity.branchNameAr,
        branch_name_en: identity.branchNameEn,
        display_name: identity.displayName,
        display_name_ar: identity.displayNameAr,
        display_name_en: identity.displayNameEn,
        logo_url: identity.logoUrl,
        phone: identity.phone,
        email: identity.email,
        address: identity.address,
        hotline: identity.hotline,
        website: identity.website,
        tax_id: identity.taxNumber,
        commercial_registration: identity.commercialRegistration,
        medical_license: identity.medicalLicense,
        report_header: settings.report_header || settings['center.report_header'] || '',
        report_footer: settings.report_footer || settings['center.report_footer'] || '',
        themeColor: settings.themeColor || print.themeColor || identity.primaryColor,
        fontFamily: settings.fontFamily || print.fontFamily || (isArabic ? 'Cairo, Tajawal, Inter' : 'Inter'),
        templateStyle: settings.templateStyle || print.templateStyle || 'modern',
        enabledFields: safeArray(enabled, ['patient_name', 'mrn', 'dob', 'gender', 'study_date', 'accession', 'modality', 'referring_doctor']),
        customFields: safeObject(settings.customFields || print.customFields, {}),
        customLabels: safeObject(settings.customLabels || print.customLabels, {}),
        visibleSections: safeArray(visibleSections, [
            'clinicalHistory', 'technique', 'findings', 'impression', 'recommendations'
        ]),
        showCustomizePanel: settings.showCustomizePanel !== false && print.showCustomizePanel !== false,
        showWatermark: print.showWatermark !== false && settings.showWatermark !== false,
        includeHeader: enabledUnlessFalse(settings.includeHeader),
        includeFooter: enabledUnlessFalse(settings.includeFooter),
        includeSignature: enabledUnlessFalse(settings.includeSignature),
        print_settings: print
    };
};

const cleanTemplateText = (value = '') => String(value)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const renderCenterTemplate = (template, center) => {
    const values = {
        center_name: center.center_name,
        branch_name: center.branch_name,
        phone: center.phone,
        hotline: center.hotline,
        email: center.email,
        website: center.website,
        address: center.address,
        tax_id: center.tax_id,
        commercial_registration: center.commercial_registration,
        medical_license: center.medical_license,
    };

    return cleanTemplateText(String(template || '')
        .replace(/\{\{?\s*([a-z0-9_.]+)\s*\}?\}/gi, (_match, key) => values[key] || '')
        .replace(/\{[^{}]+\}/g, ''));
};

const stripHeaderIdentity = (value, center) => {
    const names = [
        center.display_name_ar,
        center.display_name_en,
        center.display_name,
        [center.center_name, center.branch_name].filter(Boolean).join(' - '),
        center.center_name_ar,
        center.center_name,
    ].filter(Boolean).sort((a, b) => b.length - a.length);

    return cleanTemplateText(String(value || '').split('\n').map((line) => {
        const trimmed = line.trim();
        const match = names.find((name) => trimmed.toLowerCase().startsWith(String(name).toLowerCase()));
        return match ? trimmed.slice(String(match).length).replace(/^[\s|,;:-]+/, '').trim() : trimmed;
    }).filter(Boolean).join('\n'));
};

const defaultHeaderText = (center) => [
    center.address,
    center.phone && `Tel: ${center.phone}`,
    center.hotline && `Hotline: ${center.hotline}`,
    center.email && `Email: ${center.email}`
].filter(Boolean).join('\n');

const reportHeaderText = (center) => {
    const configured = stripHeaderIdentity(renderCenterTemplate(center.report_header, center), center);
    return configured || defaultHeaderText(center);
};

const reportFooterText = (center) => renderCenterTemplate(center.report_footer, center)
    || [center.website, center.phone && `Tel: ${center.phone}`, center.address].filter(Boolean).join(' | ')
    || `${center.display_name || center.center_name} | Confidential diagnostic imaging report`;

const reportSections = (report) => {
    const sections = report.report_sections || {};
    const fallback = report.report_content || '';
    const standardKeys = ['clinicalHistory', 'technique', 'findings', 'impression', 'recommendations'];
    const standard = {
        clinicalHistory: sections.clinicalHistory || report.clinical_indication || '',
        technique: sections.technique || '',
        findings: sections.findings || (!sections.impression ? fallback : ''),
        impression: sections.impression || '',
        recommendations: sections.recommendations || ''
    };
    const customSections = [];
    if (sections && typeof sections === 'object') {
        Object.entries(sections).forEach(([key, val]) => {
            if (!standardKeys.includes(key) && val && String(val).trim()) {
                const readableTitle = key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();
                customSections.push({ key, title: readableTitle, value: val });
            }
        });
    }
    return { standard, customSections };
};

const BODY_REGION_TERMS = [
    { key: 'spine', label: 'spine', terms: ['spine', 'spinal', 'lumbar', 'thoracic', 'cervical', 'vertebra'] },
    { key: 'knee', label: 'knee', terms: ['knee', 'patella', 'tibiofemoral'] },
    { key: 'chest', label: 'chest', terms: ['chest', 'lung', 'pulmonary', 'pleural'] },
    { key: 'brain', label: 'brain/head', terms: ['brain', 'cranial', 'intracranial', 'head'] },
    { key: 'shoulder', label: 'shoulder', terms: ['shoulder', 'glenohumeral'] },
    { key: 'hip', label: 'hip/pelvis', terms: ['hip', 'pelvis', 'acetabul'] },
    { key: 'ankle', label: 'ankle', terms: ['ankle', 'tibiotalar'] },
    { key: 'wrist', label: 'wrist', terms: ['wrist', 'carpal'] },
    { key: 'breast', label: 'breast/mammography', terms: ['breast', 'mammograph', 'bi-rads', 'fibroglandular', 'nipple', 'areola'] },
    { key: 'abdomen', label: 'abdomen/pelvis/biliary', terms: ['liver', 'gallbladder', 'spleen', 'pancreas', 'biliary', 'mrcp', 'kidney', 'urinary', 'renal'] },
];

const countTermMatches = (text, terms) => terms.reduce((total, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return total + ((text.match(new RegExp(`\\b${escaped}`, 'gi')) || []).length);
}, 0);

const detectClinicalContentMismatch = (examTitle, sections) => {
    const title = String(examTitle || '').toLowerCase();
    const expected = BODY_REGION_TERMS.find((region) => countTermMatches(title, region.terms) > 0);
    if (!expected) return null;

    const narrative = Object.values(sections || {}).filter(Boolean).join(' ').toLowerCase();
    if (!narrative || countTermMatches(narrative, expected.terms) > 0) return null;

    const unexpected = BODY_REGION_TERMS
        .filter((region) => region.key !== expected.key)
        .map((region) => ({ ...region, score: countTermMatches(narrative, region.terms) }))
        .sort((a, b) => b.score - a.score)[0];

    if (!unexpected || unexpected.score < 2) return null;
    return `The study is labeled ${examTitle}, while the report narrative repeatedly references the ${unexpected.label}. Clinical review is required before relying on this document.`;
};

const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const formatDateOnly = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
};

const calculateAge = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const ageDiffMs = Date.now() - date.getTime();
    const ageDate = new Date(ageDiffMs);
    const years = Math.abs(ageDate.getUTCFullYear() - 1970);
    return years > 0 ? `${years} Y` : '< 1 Y';
};

const METADATA_CATALOG = [
    { id: 'patient_name', defaultLabel: 'Patient Name', arLabel: 'اسم المريض', group: 'patient', getValue: r => r.patient_name },
    { id: 'mrn', defaultLabel: 'MRN', arLabel: 'الرقم الطبي', group: 'patient', getValue: r => r.mrn },
    { id: 'patient_id', defaultLabel: 'Patient ID', arLabel: 'معرّف المريض', group: 'patient', getValue: r => r.patient_id },
    { id: 'dob', defaultLabel: 'Date of Birth', arLabel: 'تاريخ الميلاد والعمر', group: 'patient', getValue: r => {
        const d = formatDateOnly(r.date_of_birth);
        const age = calculateAge(r.date_of_birth);
        return d ? (age ? `${d} (${age})` : d) : '';
    }},
    { id: 'gender', defaultLabel: 'Sex', arLabel: 'النوع', group: 'patient', getValue: r => {
        const g = String(r.gender || '').trim();
        if (/^m(ale)?$/i.test(g)) return 'Male · ذكر';
        if (/^f(emale)?$/i.test(g)) return 'Female · أنثى';
        return g;
    }},
    { id: 'study_date', defaultLabel: 'Study Date', arLabel: 'تاريخ الفحص', group: 'exam', getValue: r => formatDate(r.start_time || r.created_at) },
    { id: 'referring_doctor', defaultLabel: 'Referring Physician', arLabel: 'الطبيب المحول', group: 'exam', getValue: r => r.referring_doctor_name },
    { id: 'modality', defaultLabel: 'Modality', arLabel: 'التقنية / الجهاز', group: 'exam', getValue: r => r.modality_type || r.modality_name },
    { id: 'body_part', defaultLabel: 'Body Part / Region', arLabel: 'المنطقة المراد فحصها', group: 'exam', getValue: r => r.body_part || r.body_region },
    { id: 'priority', defaultLabel: 'Priority', arLabel: 'درجة الأولوية', group: 'exam', getValue: r => r.priority },
    { id: 'accession', defaultLabel: 'Order / Accession #', arLabel: 'رقم الطلب والفحص', group: 'exam', getValue: r => r.order_number || r.accession_number },
    { id: 'exam_id', defaultLabel: 'Exam ID', arLabel: 'معرف الفحص', group: 'exam', getValue: r => r.exam_id },
    { id: 'room', defaultLabel: 'Room / Suite', arLabel: 'غرفة الفحص', group: 'exam', getValue: r => r.room_number },
    { id: 'radiologist', defaultLabel: 'Reporting Radiologist', arLabel: 'طبيب الأشعة', group: 'exam', getValue: r => r.radiologist_name || r.digital_signature_name }
];

const SECTION_CATALOG = [
    { id: 'clinicalHistory', title: 'Clinical History' },
    { id: 'technique', title: 'Technique & Protocol' },
    { id: 'findings', title: 'Findings' },
    { id: 'impression', title: 'Impression & Conclusion' },
    { id: 'recommendations', title: 'Recommendations' }
];

/**
 * Theme catalog. Every theme fully controls surface + text colors so genuinely
 * dark themes ("group: dark") render correctly on screen, while the print
 * stylesheet always forces a light, ink-safe layout regardless of theme.
 */
const THEMES = {
    modern: {
        name: 'Modern Executive', group: 'light',
        primary: '#087F5B', primaryDark: '#064E3B', border: '#DCE7E3',
        cardBg: '#F7FAF9', impressionBg: '#DDF4EA', impressionBorder: '#087F5B',
        metaBg: '#ffffff', accentSoft: 'rgba(8, 127, 91, 0.08)',
        font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        radius: '12px', headerStyle: 'underline'
    },
    teal: {
        name: 'Clinical Emerald', group: 'light',
        primary: '#087F5B', primaryDark: '#064E3B', border: '#9CDCC1',
        cardBg: '#F7FAF9', impressionBg: '#DDF4EA', impressionBorder: '#087F5B',
        metaBg: '#ffffff', accentSoft: 'rgba(8, 127, 91, 0.08)',
        font: "'Inter', system-ui, sans-serif",
        radius: '10px', headerStyle: 'underline'
    },
    classic: {
        name: 'Classic Hospital', group: 'light',
        primary: '#1e3a8a', primaryDark: '#1e40af', border: '#cbd5e1',
        cardBg: '#f8fafc', impressionBg: '#eff6ff', impressionBorder: '#1e3a8a',
        metaBg: '#ffffff', accentSoft: 'rgba(30, 58, 138, 0.06)',
        font: "'Inter', Georgia, 'Times New Roman', serif",
        radius: '8px', headerStyle: 'underline'
    },
    minimal: {
        name: 'Minimal Clean', group: 'light',
        primary: '#0f172a', primaryDark: '#020617', border: '#e2e8f0',
        cardBg: '#ffffff', impressionBg: '#f1f5f9', impressionBorder: '#0f172a',
        metaBg: '#fafafa', accentSoft: 'rgba(15, 23, 42, 0.04)',
        font: "'Outfit', 'Inter', sans-serif",
        radius: '6px', headerStyle: 'none'
    },
    clinical: {
        name: 'Clinical Emerald', group: 'light',
        primary: '#059669', primaryDark: '#047857', border: '#a7f3d0',
        cardBg: '#f0fdf4', impressionBg: '#ecfdf5', impressionBorder: '#059669',
        metaBg: '#ffffff', accentSoft: 'rgba(5, 150, 105, 0.07)',
        font: "'Inter', system-ui, sans-serif",
        radius: '10px', headerStyle: 'underline'
    },
    corporate: {
        name: 'Royal Corporate', group: 'light',
        primary: '#4f46e5', primaryDark: '#4338ca', border: '#c7d2fe',
        cardBg: '#f5f3ff', impressionBg: '#eef2ff', impressionBorder: '#4f46e5',
        metaBg: '#ffffff', accentSoft: 'rgba(79, 70, 229, 0.07)',
        font: "'Inter', system-ui, sans-serif",
        radius: '12px', headerStyle: 'underline'
    },
    slate: {
        name: 'Slate Professional', group: 'light',
        primary: '#334155', primaryDark: '#1e293b', border: '#cbd5e1',
        cardBg: '#f8fafc', impressionBg: '#f1f5f9', impressionBorder: '#334155',
        metaBg: '#ffffff', accentSoft: 'rgba(51, 65, 85, 0.06)',
        font: "'Inter', system-ui, sans-serif",
        radius: '8px', headerStyle: 'underline'
    },
    aurora: {
        name: 'Aurora Soft', group: 'light',
        primary: '#7c3aed', primaryDark: '#6d28d9', border: '#ddd6fe',
        cardBg: '#faf5ff', impressionBg: '#f5f3ff', impressionBorder: '#7c3aed',
        metaBg: '#ffffff', accentSoft: 'rgba(124, 58, 237, 0.07)',
        font: "'Outfit', 'Inter', sans-serif",
        radius: '14px', headerStyle: 'underline'
    },
    midnight: {
        name: 'Midnight Precision', group: 'light',
        primary: '#0369a1', primaryDark: '#075985', border: '#bae6fd',
        cardBg: '#f0f9ff', impressionBg: '#e0f2fe', impressionBorder: '#0369a1',
        metaBg: '#ffffff', accentSoft: 'rgba(3, 105, 161, 0.08)',
        font: "'Inter', system-ui, sans-serif",
        radius: '10px', headerStyle: 'underline'
    },
    paper: {
        name: 'Paper Classic', group: 'light',
        primary: '#78716c', primaryDark: '#57534e', border: '#d6d3d1',
        cardBg: '#fafaf9', impressionBg: '#f5f5f4', impressionBorder: '#78716c',
        metaBg: '#ffffff', accentSoft: 'rgba(120, 113, 108, 0.06)',
        font: "Georgia, 'Times New Roman', serif",
        radius: '4px', headerStyle: 'double'
    },
    healthcare: {
        name: 'Healthcare Blue', group: 'light',
        primary: '#2563eb', primaryDark: '#1d4ed8', border: '#bfdbfe',
        cardBg: '#eff6ff', impressionBg: '#dbeafe', impressionBorder: '#2563eb',
        metaBg: '#ffffff', accentSoft: 'rgba(37, 99, 235, 0.07)',
        font: "'Inter', system-ui, sans-serif",
        radius: '10px', headerStyle: 'underline'
    },
    amber: {
        name: 'Amber Warmth', group: 'light',
        primary: '#c2410c', primaryDark: '#9a3412', border: '#fed7aa',
        cardBg: '#fff7ed', impressionBg: '#ffedd5', impressionBorder: '#c2410c',
        metaBg: '#ffffff', accentSoft: 'rgba(194, 65, 12, 0.07)',
        font: "'Inter', system-ui, sans-serif",
        radius: '10px', headerStyle: 'underline'
    },
    graphite: {
        name: 'Graphite Mono', group: 'light',
        primary: '#111827', primaryDark: '#000000', border: '#d1d5db',
        cardBg: '#f9fafb', impressionBg: '#f3f4f6', impressionBorder: '#111827',
        metaBg: '#ffffff', accentSoft: 'rgba(17, 24, 39, 0.06)',
        font: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace",
        radius: '4px', headerStyle: 'none'
    },
    nocturne: {
        name: 'Nocturne Reading Room', group: 'dark', dark: true,
        primary: '#22d3ee', primaryDark: '#06b6d4', border: '#1f2c40',
        cardBg: '#131c2e', impressionBg: '#0c2b3a', impressionBorder: '#22d3ee',
        metaBg: '#111a2b', accentSoft: 'rgba(34, 211, 238, 0.12)',
        font: "'Inter', system-ui, sans-serif",
        radius: '12px', headerStyle: 'underline',
        surface: '#0b1220', text: '#e6edf6', textMuted: '#93a4c3', textSoft: '#5f7095'
    }
};

const sectionBlock = (id, title, value, options = {}) => {
    if (!String(value || '').trim()) return '';
    const isImportant = !!options.important;
    const hidden = options.hidden ? ' style="display:none"' : '';
    return `
        <section class="report-section ${isImportant ? 'important-section' : ''}" id="sec-${escapeHtml(id)}" data-section-id="${escapeHtml(id)}" data-section="${escapeHtml(title)}"${hidden}>
            <h2 class="section-title" dir="auto">
                <span class="title-bar" aria-hidden="true"></span>
                <span class="title-text">${escapeHtml(title)}</span>
            </h2>
            <div class="section-body"${isImportant ? ' role="status"' : ''} dir="auto">${lineBreaks(String(value).trim())}</div>
        </section>
    `;
};

/** Simple stable checksum for offline integrity (djb2 → 8 hex chars) */
const computeChecksum = (value = '') => {
    let h = 5381;
    const s = String(value);
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
        h |= 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
};

/**
 * Build a stable verification payload for QR + hash display.
 * Format: VIARA1|<hash>|E:<exam>|O:<order>|MRN:<mrn>|TS:<iso>|C:<checksum>
 * Checksum covers everything before the C: segment for offline integrity checks.
 */
const buildVerificationPayload = (report, verificationHash) => {
    const ts = new Date().toISOString().slice(0, 19) + 'Z';
    const body = [
        'VIARA1',
        String(verificationHash || ''),
        report.exam_id ? `E:${report.exam_id}` : '',
        (report.order_number || report.accession_number)
            ? `O:${report.order_number || report.accession_number}`
            : '',
        report.mrn ? `MRN:${report.mrn}` : '',
        `TS:${ts}`
    ].filter(Boolean).join('|');
    return `${body}|C:${computeChecksum(body)}`;
};

/**
 * Parse + validate a verification payload offline (no network).
 * Returns { valid, version, hash, examId, order, mrn, timestamp, checksum, errors[] }
 */
const parseVerificationPayload = (payload = '') => {
    const errors = [];
    const raw = String(payload || '').trim();
    if (!raw) {
        return { valid: false, errors: ['Empty payload'] };
    }
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.includes('/verify') || raw.includes('code=')) {
        const codeMatch = raw.match(/[?&]code=([^&#]+)/);
        const codeVal = codeMatch ? decodeURIComponent(codeMatch[1]) : '';
        return {
            valid: Boolean(codeVal),
            version: 'URL',
            hash: codeVal,
            examId: '',
            order: '',
            mrn: '',
            timestamp: '',
            checksum: '',
            errors: codeVal ? [] : ['Missing verification code in URL']
        };
    }
    const parts = raw.split('|');
    if (parts[0] !== 'VIARA1' && parts[0] !== 'VIARA-VERIFY') {
        errors.push('Unknown payload prefix (expected VIARA1)');
    }
    const result = {
        valid: false,
        version: parts[0] || '',
        hash: '',
        examId: '',
        order: '',
        mrn: '',
        timestamp: '',
        checksum: '',
        errors
    };
    if (parts[0] === 'VIARA1') {
        result.hash = parts[1] || '';
        parts.slice(2).forEach(p => {
            if (p.startsWith('E:')) result.examId = p.slice(2);
            else if (p.startsWith('O:')) result.order = p.slice(2);
            else if (p.startsWith('MRN:')) result.mrn = p.slice(4);
            else if (p.startsWith('TS:')) result.timestamp = p.slice(3);
            else if (p.startsWith('C:')) result.checksum = p.slice(2);
        });
        const body = raw.replace(/\|C:[A-F0-9]+$/i, '');
        const expected = computeChecksum(body);
        if (!result.checksum) errors.push('Missing checksum');
        else if (result.checksum.toUpperCase() !== expected) {
            errors.push('Checksum mismatch — payload may be altered');
        }
        if (!result.hash) errors.push('Missing verification hash');
    } else if (parts[0] === 'VIARA-VERIFY') {
        // Legacy format without checksum
        result.hash = parts[1] || '';
        parts.slice(2).forEach(p => {
            if (p.startsWith('E:')) result.examId = p.slice(2);
            else if (p.startsWith('O:')) result.order = p.slice(2);
            else if (p.startsWith('MRN:')) result.mrn = p.slice(4);
        });
        if (!result.hash) errors.push('Missing verification hash');
    }
    result.valid = errors.length === 0;
    return result;
};

const validateVerificationPayload = (payload, expected = {}) => {
    const parsed = parseVerificationPayload(payload);
    if (expected.hash && parsed.hash && expected.hash !== parsed.hash) {
        parsed.errors.push('Hash does not match this report');
        parsed.valid = false;
    }
    if (parsed.version !== 'URL') {
        if (expected.examId && parsed.examId && expected.examId !== parsed.examId) {
            parsed.errors.push('Exam ID does not match this report');
            parsed.valid = false;
        }
        if (expected.order && parsed.order && expected.order !== parsed.order) {
            parsed.errors.push('Order number does not match this report');
            parsed.valid = false;
        }
        if (expected.mrn && parsed.mrn && expected.mrn !== parsed.mrn) {
            parsed.errors.push('MRN does not match this report');
            parsed.valid = false;
        }
    }
    parsed.valid = parsed.errors.length === 0;
    return parsed;
};

const buildReportHtml = (report, centerSettings = {}) => {
    const center = normalizeCenterSettings(centerSettings, report);
    const { standard: sections, customSections } = reportSections(report);
    const styleKey = (center.templateStyle || report.template_style || 'modern').toLowerCase();
    const theme = THEMES[styleKey] || THEMES.modern;
    const primaryColor = /^#[0-9a-f]{6}$/i.test(center.themeColor) ? center.themeColor : theme.primary;
    const facilityNameAr = center.display_name_ar || [center.center_name_ar, center.branch_name_ar].filter(Boolean).join(' - ');
    const facilityNameEn = center.display_name_en || [center.center_name_en || center.center_name, center.branch_name_en || center.branch_name].filter(Boolean).join(' - ');

    const primaryFacility = center.isArabic && facilityNameAr ? facilityNameAr : (facilityNameEn || facilityNameAr);
    const secondaryFacility = (center.isArabic && facilityNameAr && facilityNameEn && facilityNameEn !== facilityNameAr)
        ? facilityNameEn
        : (!center.isArabic && facilityNameAr && facilityNameAr !== facilityNameEn ? facilityNameAr : '');
    const facilityName = facilityNameEn || primaryFacility;
    const logoText = String(center.center_name_en || center.center_name || 'Center').trim().slice(0, 4).toUpperCase();
    const finalized = ['Finalized', 'Amended'].includes(report.report_status)
        && Boolean(report.report_locked)
        && Boolean(report.report_finalized_at);
    const verificationHash = report.digital_signature_hash || (finalized
        ? `VIARA-VERIFIED-${String(report.exam_id || report.order_number || '').slice(0, 10).toUpperCase()}`
        : 'Pending Signature');
    const verifyPayload = buildVerificationPayload(report, verificationHash);
    const portalBaseUrl = (process.env.PORTAL_URL || process.env.VITE_PORTAL_URL || center.website || 'http://localhost:5174').replace(/\/+$/, '');
    const qrVerificationUrl = `${portalBaseUrl}/verify?code=${encodeURIComponent(verificationHash)}`;
    const qrPayload = finalized ? qrVerificationUrl : verifyPayload;
    const statusLabel = report.report_status || report.status || (finalized ? 'Finalized' : 'Draft');
    const examTitle = report.exam_type_name || report.modality_name || 'Radiology Study';
    const generatedAt = formatDate(new Date());
    const headerText = reportHeaderText(center);
    const footerText = reportFooterText(center);
    const clinicalContentWarning = detectClinicalContentMismatch(examTitle, sections);

    const rawCatalog = METADATA_CATALOG.map(f => ({
        id: f.id,
        label: center.customLabels[f.id] || (center.isArabic && f.arLabel ? `${f.arLabel} · ${f.defaultLabel}` : f.defaultLabel),
        value: f.getValue(report) || '—',
        group: f.group || 'exam'
    }));

    const initialEnabled = center.enabledFields.filter(id =>
        rawCatalog.some(c => c.id === id)
    );
    const initialMetaItems = [
        ...rawCatalog.filter(c => initialEnabled.includes(c.id)),
        ...Object.entries(center.customFields || {}).map(([k, v]) => ({
            id: `custom_${k}`,
            label: k,
            value: String(v || '—'),
            isCustom: true,
            group: 'custom'
        }))
    ];

    const visibleSet = new Set(center.visibleSections);
    const sectionDefs = [
        { id: 'clinicalHistory', title: center.isArabic ? 'التاريخ المرضي والسريري · Clinical History' : 'Clinical History', value: sections.clinicalHistory, important: false },
        { id: 'technique', title: center.isArabic ? 'التقنية والبروتوكول · Technique & Protocol' : 'Technique & Protocol', value: sections.technique, important: false },
        { id: 'findings', title: center.isArabic ? 'النتائج والملاحظات الشعاعية · Findings' : 'Findings', value: sections.findings, important: false },
        { id: 'impression', title: center.isArabic ? 'الخلاصة والتشخيص · Impression & Conclusion' : 'Impression & Conclusion', value: sections.impression, important: true },
        { id: 'recommendations', title: center.isArabic ? 'التوصيات والمتابعة · Recommendations' : 'Recommendations', value: sections.recommendations, important: false },
        ...customSections.map(s => ({
            id: s.key,
            title: s.title,
            value: s.value,
            important: false,
            custom: true
        }))
    ].filter(s => String(s.value || '').trim());

    const offlineValidation = validateVerificationPayload(qrPayload, {
        hash: verificationHash,
        examId: report.exam_id || '',
        order: report.order_number || report.accession_number || '',
        mrn: report.mrn || ''
    });

    const surfaceColor = theme.surface || '#ffffff';
    const textColor = theme.text || '#0f172a';
    const textMutedColor = theme.textMuted || '#64748b';
    const textSoftColor = theme.textSoft || '#94a3b8';

    const themeOptionsHtml = (group) => Object.entries(THEMES)
        .filter(([, t]) => t.group === group)
        .map(([key, t]) => `<option value="${key}" ${styleKey === key ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
        .join('');

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Diagnostic Report — ${escapeHtml(report.order_number || report.exam_id || examTitle)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&family=Roboto:wght@400;500;700&display=swap');

        @page { size: A4 portrait; margin: 8mm 10mm 8mm 10mm; }
        * { box-sizing: border-box; }

        :root {
            --primary: ${primaryColor};
            --primary-dark: ${theme.primaryDark};
            --border: ${theme.border};
            --card-bg: ${theme.cardBg};
            --impression-bg: ${theme.impressionBg};
            --impression-border: ${theme.impressionBorder};
            --meta-bg: ${theme.metaBg};
            --accent-soft: ${theme.accentSoft};
            --radius: ${theme.radius};
            --base-font-size: 12px;
            --line-height: 1.55;
            --text: ${textColor};
            --text-muted: ${textMutedColor};
            --text-soft: ${textSoftColor};
            --surface: ${surfaceColor};
            --page-bg: #0b1220;
            --space-1: 4px;
            --space-2: 8px;
            --space-3: 12px;
            --space-4: 16px;
            --space-5: 20px;
            --space-6: 24px;
            --space-7: 32px;
        }

        html { -webkit-text-size-adjust: 100%; }

        body {
            margin: 0;
            background: var(--page-bg);
            color: var(--text);
            font-family: ${theme.font};
            font-size: var(--base-font-size);
            line-height: var(--line-height);
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        :focus-visible {
            outline: 2.5px solid var(--primary);
            outline-offset: 2px;
            border-radius: 3px;
        }
        [contenteditable="true"]:focus-visible { outline: none; }

        /* ── Toast ──────────────────────────────────────────────────────── */
        .VIARA-toast {
            position: fixed; left: 50%; bottom: 26px; z-index: 10001;
            transform: translate(-50%, 16px); opacity: 0;
            background: rgba(15, 23, 42, 0.96); color: #f8fafc;
            padding: 11px 20px; border-radius: 999px; font-size: 12.5px;
            font-weight: 700; font-family: 'Inter', system-ui, sans-serif;
            box-shadow: 0 12px 30px -8px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.12);
            transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease;
            pointer-events: none; max-width: 90vw; text-align: center;
        }
        .VIARA-toast.tone-error { background: rgba(153, 27, 27, 0.96); }
        .VIARA-toast.show { transform: translate(-50%, 0); opacity: 1; }

        /* ── Customizer ─────────────────────────────────────────────────── */
        .customize-panel {
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 9999;
            width: 400px;
            max-height: 92vh;
            overflow: hidden;
            background: rgba(15, 23, 42, 0.97);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 20px;
            padding: 18px;
            color: #f8fafc;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.55);
            font-family: 'Inter', system-ui, sans-serif;
            display: flex; flex-direction: column;
            transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                        height 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                        padding 0.28s ease,
                        border-radius 0.28s ease;
        }
        .customize-panel.collapsed {
            width: 52px; height: 52px; padding: 0;
            border-radius: 50%;
        }
        .customize-panel.collapsed .cp-header h3,
        .customize-panel.collapsed .cp-tabs,
        .customize-panel.collapsed #cpBody { display: none; }
        .customize-panel.collapsed .cp-toggle-btn {
            width: 100%; height: 100%; border-radius: 50%; background: transparent;
        }
        .cp-header {
            display: flex; align-items: center; justify-content: space-between;
            padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); gap: 10px;
            flex-shrink: 0;
        }
        .cp-header h3 {
            margin: 0; font-size: 13.5px; font-weight: 800; color: #38bdf8;
            display: flex; align-items: center; gap: 8px;
        }
        .cp-toggle-btn {
            flex-shrink: 0; background: rgba(255,255,255,0.08); border: 0; color: #94a3b8;
            width: 30px; height: 30px; border-radius: 9px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
        }
        .cp-toggle-btn:hover { background: rgba(255,255,255,0.16); color: #fff; }

        .cp-tabs {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
            margin-top: 12px; padding: 3px; background: rgba(255,255,255,0.05);
            border-radius: 11px; flex-shrink: 0;
        }
        .cp-tab-btn {
            background: transparent; border: 0; color: #94a3b8;
            font-size: 10.5px; font-weight: 800; letter-spacing: 0.02em;
            padding: 7px 4px; border-radius: 8px; cursor: pointer;
            text-transform: uppercase;
        }
        .cp-tab-btn:hover { color: #e2e8f0; }
        .cp-tab-btn.active { background: #0ea5e9; color: #fff; box-shadow: 0 2px 8px rgba(14,165,233,0.4); }

        #cpBody {
            margin-top: 14px; overflow-y: auto; overflow-x: hidden; flex: 1;
            scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent;
        }
        #cpBody::-webkit-scrollbar { width: 6px; }
        #cpBody::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 99px; }
        .cp-tab-panel[hidden] { display: none; }

        .cp-section { margin-top: 16px; }
        .cp-section:first-child { margin-top: 0; }
        .cp-label {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 7px; font-size: 10px; font-weight: 800;
            text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8;
        }
        .cp-hint { font-size: 10.5px; color: #64748b; margin: -4px 0 10px; line-height: 1.4; }
        .cp-select, .cp-input {
            width: 100%; height: 38px; background: rgba(30,41,59,0.95);
            border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
            padding: 0 12px; color: #f8fafc; font-size: 12.5px; font-weight: 600; outline: none;
        }
        .cp-select:focus, .cp-input:focus {
            border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,0.2);
        }
        .cp-row { display: flex; gap: 8px; align-items: center; }
        .cp-range { width: 100%; height: 6px; accent-color: #0ea5e9; cursor: pointer; }
        .cp-color-picker {
            width: 44px; height: 38px; border: 0; border-radius: 10px;
            padding: 3px; background: transparent; cursor: pointer; flex-shrink: 0;
        }
        .cp-swatches { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .cp-swatch {
            width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
            border: 2px solid rgba(255,255,255,0.25); padding: 0;
        }
        .cp-swatch:hover { transform: scale(1.12); }
        .cp-fields-grid {
            display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px; max-height: 220px; overflow-y: auto; padding-right: 4px;
        }
        .cp-sections-grid {
            display: flex; flex-direction: column; gap: 5px;
            max-height: 260px; overflow-y: auto;
        }
        .cp-checkbox-label {
            display: flex; align-items: center; gap: 7px;
            background: rgba(255,255,255,0.04); padding: 7px 9px; border-radius: 8px;
            font-size: 11.5px; cursor: pointer; user-select: none; line-height: 1.3;
        }
        .cp-checkbox-label:hover { background: rgba(255,255,255,0.09); }
        .cp-checkbox-label input {
            accent-color: #0ea5e9; width: 14px; height: 14px; flex-shrink: 0;
        }
        .cp-add-form { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
        .cp-btn-add {
            background: #0ea5e9; color: #fff; border: 0; border-radius: 9px;
            padding: 0 14px; height: 38px; font-size: 11.5px; font-weight: 700;
            cursor: pointer; white-space: nowrap;
        }
        .cp-btn-add:hover { background: #0284c7; }
        .cp-actions {
            margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.1);
            display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0;
        }
        .cp-btn-print {
            flex: 1; min-width: 140px; height: 42px;
            background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #fff;
            border: 0; border-radius: 11px; font-size: 12.5px; font-weight: 800;
            cursor: pointer; box-shadow: 0 4px 14px rgba(14,165,233,0.35);
            display: flex; align-items: center; justify-content: center; gap: 7px;
        }
        .cp-btn-print:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(14,165,233,0.45);
        }
        .cp-btn-secondary {
            background: rgba(255,255,255,0.08); color: #f8fafc;
            border: 1px solid rgba(255,255,255,0.12); border-radius: 11px;
            padding: 0 14px; height: 42px; font-size: 11.5px; font-weight: 700; cursor: pointer;
        }
        .cp-btn-secondary:hover { background: rgba(255,255,255,0.15); }
        .cp-btn-ghost {
            background: transparent; color: #94a3b8;
            border: 1px solid rgba(255,255,255,0.1); border-radius: 11px;
            padding: 0 12px; height: 42px; font-size: 11px; font-weight: 700; cursor: pointer;
        }
        .cp-btn-ghost:hover { color: #f87171; border-color: rgba(248,113,113,0.4); }

        /* ── Document shell ─────────────────────────────────────────────── */
        .page-wrapper { padding: 28px 16px 72px; min-height: 100vh; }
        .sheet {
            position: relative; width: 210mm; min-height: 297mm; margin: 0 auto;
            padding: 0; background: var(--surface); border-radius: 6px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
            overflow: hidden; display: flex; flex-direction: column;
            transition: background 0.2s ease;
        }
        .sheet-accent {
            height: 4px; flex-shrink: 0; margin-bottom: 0;
            background-color: var(--primary);
            background: linear-gradient(90deg, var(--primary), var(--primary-dark), #2563eb);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .sheet-body {
            flex: 1; display: flex; flex-direction: column;
            padding: 14mm 15mm 12mm; position: relative; z-index: 1;
        }
        .watermark {
            display: ${center.showWatermark ? 'block' : 'none'};
            position: absolute; top: 48%; left: 50%;
            transform: translate(-50%, -50%) rotate(-28deg);
            color: color-mix(in srgb, var(--text) 4%, transparent);
            font-size: 72px; font-weight: 900;
            letter-spacing: 0.12em; pointer-events: none; text-transform: uppercase;
            white-space: nowrap; user-select: none; z-index: 0;
        }

        /* Trial edition overlay — printed on every page, cannot be removed by
           the client customization panel, and never shown for paid editions.
           position: fixed repeats the element on every printed page. */
        .trial-watermark {
            display: ${isTrialEdition() ? 'block' : 'none'};
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            color: #b91c1c;
            font-size: 18px; font-weight: 900;
            letter-spacing: 0.35em; pointer-events: none;
            text-transform: uppercase;
            white-space: nowrap; user-select: none; z-index: 3;
            opacity: 0.55;
            border: 2px solid #b91c1c;
            border-radius: 6px;
            padding: 4px 10px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        /* Zone 1: Identity */
        .zone-identity {
            display: grid; grid-template-columns: 1fr auto;
            gap: var(--space-4) var(--space-6); align-items: start;
            padding-bottom: var(--space-4);
            border-bottom: ${theme.headerStyle === 'double'
            ? '3px double var(--border)'
            : theme.headerStyle === 'none' ? 'none' : '2px solid var(--border)'};
            flex-shrink: 0;
        }
        .brand-box { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .logo-img { max-width: 120px; max-height: 52px; object-fit: contain; flex-shrink: 0; }
        .logo-avatar {
            display: flex; align-items: center; justify-content: center;
            width: 48px; height: 48px; border-radius: 12px;
            background: linear-gradient(135deg, var(--primary), var(--primary-dark));
            color: #fff; font-family: 'Space Mono', ui-monospace, monospace;
            font-size: 14px; font-weight: 800; letter-spacing: -0.02em;
            box-shadow: 0 4px 12px rgba(0,0,0,0.12); flex-shrink: 0;
        }
        .brand-details { min-width: 0; }
        .brand-details h1 {
            margin: 0; color: var(--text); font-size: clamp(15.5px, 1.4vw + 10px, 19px); font-weight: 800;
            letter-spacing: -0.025em; line-height: 1.25;
        }
        .brand-subname {
            margin: 2px 0 0; color: var(--text-muted); font-size: 11px;
            font-weight: 700; line-height: 1.35; letter-spacing: 0.01em;
        }
        .brand-details p {
            margin: 4px 0 0; color: var(--text-muted); font-size: 10.5px;
            font-weight: 500; line-height: 1.45; white-space: pre-wrap;
        }
        .doc-meta { text-align: right; flex-shrink: 0; max-width: 240px; }
        .doc-status {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 4px 11px; border-radius: 999px;
            background: ${finalized ? '#ecfdf5' : '#fff7ed'};
            color: ${finalized ? '#047857' : '#c2410c'};
            border: 1px solid ${finalized ? '#a7f3d0' : '#fed7aa'};
            font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
        }
        .doc-status::before {
            content: ""; width: 6px; height: 6px; border-radius: 50%;
            background: currentColor; opacity: 0.85;
        }
        .doc-exam-title {
            margin-top: 8px; color: var(--text); font-size: 14px; font-weight: 800;
            letter-spacing: -0.02em; line-height: 1.3;
        }

        /* Zone 2: Metadata */
        .zone-meta { margin-top: var(--space-4); flex-shrink: 0; }
        .meta-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1px; background: var(--border);
            border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;
        }
        .meta-item {
            padding: 9px 12px; background: var(--meta-bg); position: relative;
            min-height: 46px; display: flex; flex-direction: column; justify-content: center;
        }
        .meta-item .btn-remove-custom {
            position: absolute; top: 2px; right: 4px; background: none; border: 0;
            color: var(--text-soft); font-size: 14px; line-height: 1; cursor: pointer;
            display: none; padding: 2px 4px; border-radius: 4px;
        }
        .meta-item:hover .btn-remove-custom { display: block; }
        .meta-item .btn-remove-custom:hover {
            color: #ef4444; background: rgba(239,68,68,0.08);
        }
        .meta-label {
            display: block; margin-bottom: 2px; color: var(--text-muted);
            font-size: 8.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
        }
        .meta-val {
            display: block; color: var(--text); font-size: 12.5px; font-weight: 700;
            word-break: break-word; line-height: 1.35;
        }

        /* Zone 3: Clinical */
        .zone-clinical {
            margin-top: var(--space-5); flex: 0 0 auto;
            display: flex; flex-direction: column; min-height: 0;
        }
        .clinical-consistency-alert {
            margin-top: var(--space-4);
            padding: 10px 12px;
            border: 1px solid #f59e0b;
            border-inline-start: 4px solid #d97706;
            border-radius: calc(var(--radius) - 2px);
            background: #fffbeb;
            color: #78350f;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .clinical-consistency-alert strong {
            display: block;
            margin-bottom: 2px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }
        .clinical-consistency-alert span { font-size: 11px; line-height: 1.5; font-weight: 600; }
        .report-section {
            margin-top: var(--space-4);
            page-break-inside: avoid; break-inside: avoid;
        }
        .report-section.is-first-visible { margin-top: 0 !important; }
        .section-title {
            display: flex; align-items: center; gap: 8px; margin: 0 0 6px;
            font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em;
            text-transform: uppercase; color: var(--primary);
            page-break-after: avoid; break-after: avoid;
        }
        .important-section .section-title { color: var(--text); }
        .title-bar {
            width: 3.5px; height: 12px; border-radius: 3px;
            background-color: var(--primary); flex-shrink: 0;
        }
        .section-body {
            padding: 10px 12px; border: 1px solid var(--border);
            border-radius: calc(var(--radius) - 2px); background: var(--card-bg);
            color: var(--text); font-size: 12.5px; line-height: 1.6;
            white-space: pre-wrap; outline: none;
        }
        [contenteditable="true"]:focus {
            box-shadow: 0 0 0 2.5px rgba(14,165,233,0.35) !important;
            border-color: var(--primary) !important;
        }
        .report-section.important-section .section-body {
            background: var(--impression-bg);
            border: 1.5px solid var(--impression-border);
            color: var(--text); font-weight: 600;
            box-shadow: 0 2px 8px var(--accent-soft);
        }

        /* Zone 4: Signature + Digital Verification with QR */
        .signature-block { flex-shrink: 0; }
        .zone-signature {
            margin-top: var(--space-6);
            padding-top: var(--space-5);
            border-top: 2px dashed var(--border);
            display: grid;
            grid-template-columns: 1fr minmax(260px, 1.05fr);
            gap: var(--space-5);
            align-items: stretch;
            page-break-inside: avoid;
            break-inside: avoid;
            flex-shrink: 0;
        }
        .sig-details {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            position: relative;
            min-height: 84px;
        }
        .sig-author {
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            z-index: 1;
        }
        .sig-details h4 {
            margin: 0; color: var(--text); font-size: 13.5px;
            font-weight: 800; letter-spacing: -0.01em;
        }
        .sig-details p {
            margin: 3px 0 0; color: var(--text-muted); font-size: 11px; font-weight: 600;
        }
        .sig-line {
            width: 170px; height: 32px; margin-top: 10px;
            border-bottom: 1.5px solid var(--text-soft);
        }
        .official-stamp-seal {
            flex-shrink: 0;
            color: #0284c7;
            opacity: 0.88;
            transform: rotate(-6deg);
            pointer-events: none;
            user-select: none;
            margin-inline-start: 10px;
        }
        .official-stamp-seal svg {
            display: block;
            width: 82px;
            height: 82px;
        }

        .verify-card {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 12px;
            align-items: center;
            padding: 12px;
            border: 1px solid var(--border);
            border-radius: calc(var(--radius) - 1px);
            background: var(--card-bg);
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        }
        .verify-qr-wrap {
            flex-shrink: 0;
            width: 88px;
            height: 88px;
            padding: 4px;
            background: #fff;
            border: 1px solid var(--border);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .verify-qr-wrap canvas {
            width: 80px;
            height: 80px;
            display: block;
            image-rendering: pixelated;
        }
        .verify-qr-fallback {
            width: 80px; height: 80px;
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; color: var(--text-soft); text-align: center;
            padding: 6px; line-height: 1.3;
        }
        .verify-offline-status {
            display: flex;
            align-items: center;
            gap: 5px;
            margin-top: 6px;
            font-size: 9px;
            font-weight: 700;
        }
        .verify-offline-status.ok { color: #047857; }
        .verify-offline-status.fail { color: #b91c1c; }
        .verify-offline-status .dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: currentColor; flex-shrink: 0;
        }
        .verify-info { min-width: 0; }
        .verify-info .v-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 8px;
            border-radius: 999px;
            background: ${finalized ? 'rgba(16, 185, 129, 0.12)' : 'rgba(251, 146, 60, 0.15)'};
            color: ${finalized ? '#047857' : '#c2410c'};
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 6px;
        }
        .verify-info .v-badge::before {
            content: "";
            width: 5px; height: 5px; border-radius: 50%;
            background: currentColor;
        }
        .verify-info .v-label {
            display: block; color: var(--text-muted);
            font-size: 8.5px; font-weight: 800;
            letter-spacing: 0.08em; text-transform: uppercase;
        }
        .verify-info .v-hash-row {
            display: flex; align-items: center; gap: 6px;
            margin-top: 2px; margin-bottom: 6px;
        }
        .verify-info .v-hash {
            color: var(--primary);
            font-family: 'Space Mono', ui-monospace, monospace;
            font-size: 9px; font-weight: 700;
            word-break: break-all; line-height: 1.35;
        }
        .v-copy-btn {
            flex-shrink: 0; background: var(--accent-soft); color: var(--primary);
            border: 1px solid var(--border); border-radius: 6px;
            font-size: 8.5px; font-weight: 800; text-transform: uppercase;
            letter-spacing: 0.04em; padding: 3px 7px; cursor: pointer;
        }
        .v-copy-btn:hover { background: var(--impression-bg); }
        .verify-info .v-meta {
            display: flex; flex-wrap: wrap; gap: 8px 12px;
            margin-top: 2px;
        }
        .verify-info .v-meta span {
            color: var(--text-soft);
            font-size: 9px; font-weight: 600;
        }
        .verify-info .v-meta strong {
            color: var(--text-muted);
            font-weight: 700;
        }

        /* Zone 5: Footer */
        .zone-footer {
            margin-top: auto; padding-top: var(--space-3);
            border-top: 1px solid var(--border);
            display: flex; justify-content: space-between; align-items: center;
            gap: var(--space-3); color: var(--text-soft);
            font-size: 9px; font-weight: 600; flex-shrink: 0;
        }
        .zone-footer > div { min-width: 0; }

        /* Responsive */
        @media (max-width: 960px) {
            .page-wrapper { padding: 14px 12px 88px !important; }
            .sheet {
                width: 100% !important; max-width: 100% !important;
                min-height: auto !important; border-radius: 14px !important;
            }
            .sheet-body { padding: 20px 18px 22px !important; }
            .customize-panel {
                top: auto !important; bottom: 12px !important;
                right: 12px !important; left: 12px !important;
                width: auto !important; max-height: 76vh !important;
                border-radius: 18px !important;
            }
            .customize-panel.collapsed {
                top: auto !important; left: auto !important;
                bottom: 16px !important; right: 16px !important;
                width: 52px !important; height: 52px !important;
            }
        }
        @media (max-width: 640px) {
            .zone-identity { grid-template-columns: 1fr !important; gap: var(--space-3) !important; }
            .doc-meta {
                text-align: left !important; max-width: none !important; width: 100%;
                display: flex; align-items: center; justify-content: space-between;
                flex-wrap: wrap; gap: 8px;
                border-top: 1px dashed var(--border); padding-top: 12px;
            }
            .doc-exam-title { margin-top: 0; }
            .zone-signature { grid-template-columns: 1fr !important; gap: var(--space-4) !important; }
            .verify-card { grid-template-columns: auto 1fr; }
            .sig-line { width: 100% !important; }
            .cp-fields-grid { grid-template-columns: 1fr !important; }
            .cp-tabs { grid-template-columns: repeat(2, 1fr); }
            .brand-details h1 { font-size: 16px; }
        }

        @media print {
            :root {
                --text: #0f172a !important;
                --text-muted: #475569 !important;
                --text-soft: #64748b !important;
                --surface: #ffffff !important;
                --card-bg: #f8fafc !important;
                --meta-bg: #ffffff !important;
                --space-1: 2px !important;
                --space-2: 4px !important;
                --space-3: 6px !important;
                --space-4: 8px !important;
                --space-5: 10px !important;
                --space-6: 12px !important;
                --space-7: 16px !important;
            }
            html, body {
                background: #ffffff !important;
                color: #0f172a !important;
                font-size: 9.5pt !important;
                line-height: 1.4 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .page-wrapper {
                padding: 0 !important;
                min-height: auto !important;
            }
            .sheet {
                width: 100% !important;
                min-height: auto !important;
                margin: 0 !important;
                box-shadow: none !important;
                border: 0 !important;
                border-radius: 0 !important;
                background: #ffffff !important;
                overflow: visible !important;
            }
            .sheet-body {
                padding: 0 !important;
                overflow: visible !important;
            }
            .sheet-accent {
                height: 3.5px !important;
                margin-bottom: 0 !important;
                background-color: var(--primary) !important;
                background: linear-gradient(90deg, var(--primary), var(--primary-dark), #2563eb) !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                border-top: 3.5px solid var(--primary);
            }
            .watermark {
                opacity: 0.03 !important;
                color: #000000 !important;
                font-size: 60px !important;
            }
            .customize-panel, .VIARA-toast, .v-copy-btn, .btn-remove-custom {
                display: none !important;
            }
            .zone-identity {
                padding-bottom: 6px !important;
                margin-bottom: 0 !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            .brand-box { gap: 10px !important; }
            .logo-img { max-height: 40px !important; }
            .logo-avatar { width: 36px !important; height: 36px !important; font-size: 11px !important; }
            .brand-details h1 { font-size: 13pt !important; }
            .brand-details p { font-size: 8pt !important; margin-top: 2px !important; }
            .doc-status { padding: 2px 7px !important; font-size: 7.5pt !important; }
            .doc-exam-title { font-size: 10.5pt !important; margin-top: 3px !important; }

            .zone-meta {
                margin-top: 6px !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            .meta-grid {
                gap: 1px !important;
                grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            }
            .meta-item {
                padding: 4px 7px !important;
                min-height: 30px !important;
                background: #f8fafc !important;
            }
            .meta-label {
                font-size: 6.5pt !important;
                margin-bottom: 1px !important;
                color: #64748b !important;
            }
            .meta-val {
                font-size: 8pt !important;
                color: #0f172a !important;
            }

            .zone-clinical {
                margin-top: 6px !important;
            }
            .clinical-consistency-alert {
                padding: 5px 8px !important;
                margin-top: 5px !important;
                background: #fffbeb !important;
                border: 1px solid #f59e0b !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            .report-section {
                margin-top: 5px !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            .section-title {
                font-size: 7.5pt !important;
                margin-bottom: 2px !important;
                break-after: avoid !important;
                page-break-after: avoid !important;
            }
            .section-body {
                padding: 5px 8px !important;
                font-size: 8.5pt !important;
                line-height: 1.4 !important;
                background: #ffffff !important;
                border: 1px solid #e2e8f0 !important;
                border-radius: 4px !important;
            }
            .important-section .section-body {
                background: #f8fafc !important;
                border: 1.5px solid var(--primary) !important;
                font-weight: 600 !important;
            }

            .signature-block {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            .zone-signature {
                margin-top: 8px !important;
                padding-top: 6px !important;
                border-top: 1px dashed #cbd5e1 !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            .sig-details {
                min-height: 52px !important;
                display: flex !important;
                align-items: flex-end !important;
                justify-content: space-between !important;
            }
            .sig-details h4 { font-size: 8.5pt !important; }
            .sig-details p { font-size: 7pt !important; margin-top: 1px !important; }
            .sig-line { width: 110px !important; height: 14px !important; margin-top: 3px !important; }
            .official-stamp-seal {
                opacity: 0.95 !important;
                color: #0369a1 !important;
                transform: rotate(-6deg) !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .official-stamp-seal svg {
                width: 58px !important;
                height: 58px !important;
            }

            .verify-card {
                padding: 5px 7px !important;
                background: #f8fafc !important;
                border: 1px solid #cbd5e1 !important;
                border-radius: 6px !important;
                gap: 7px !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            .verify-qr-wrap {
                width: 54px !important;
                height: 54px !important;
                padding: 2px !important;
                border-radius: 4px !important;
            }
            .verify-qr-wrap canvas {
                width: 50px !important;
                height: 50px !important;
            }
            .verify-info .v-badge {
                padding: 1px 5px !important;
                font-size: 6.5pt !important;
                margin-bottom: 2px !important;
            }
            .verify-info .v-label {
                font-size: 6pt !important;
            }
            .verify-info .v-hash-row {
                margin-top: 1px !important;
                margin-bottom: 2px !important;
            }
            .verify-info .v-hash {
                font-size: 7pt !important;
                line-height: 1.15 !important;
            }
            .verify-info .v-meta {
                gap: 3px 6px !important;
                margin-top: 1px !important;
            }
            .verify-info .v-meta span {
                font-size: 6.5pt !important;
            }
            .verify-offline-status {
                margin-top: 2px !important;
                font-size: 6.5pt !important;
            }

            .zone-footer {
                margin-top: 6px !important;
                padding-top: 3px !important;
                font-size: 6.5pt !important;
                border-top: 1px solid #e2e8f0 !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
            a { color: inherit; text-decoration: none; }
        }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                transition-duration: 0.01ms !important;
                animation-duration: 0.01ms !important;
            }
        }
    </style>
</head>
<body>
    ${center.showCustomizePanel ? `
    <aside class="customize-panel" id="customizePanel" aria-label="Report customizer">
        <div class="cp-header">
            <h3>
                <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
                Live Report Customizer
            </h3>
            <button type="button" class="cp-toggle-btn" onclick="toggleCustomizePanel()" title="Collapse / Expand" aria-label="Toggle customizer panel">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 12H6"/></svg>
            </button>
        </div>

        <nav class="cp-tabs" role="tablist" aria-label="Customizer sections">
            <button type="button" class="cp-tab-btn active" role="tab" aria-selected="true" data-tab="design" onclick="window.switchCPTab('design')">Design</button>
            <button type="button" class="cp-tab-btn" role="tab" aria-selected="false" data-tab="fields" onclick="window.switchCPTab('fields')">Fields</button>
            <button type="button" class="cp-tab-btn" role="tab" aria-selected="false" data-tab="sections" onclick="window.switchCPTab('sections')">Sections</button>
            <button type="button" class="cp-tab-btn" role="tab" aria-selected="false" data-tab="display" onclick="window.switchCPTab('display')">Display</button>
        </nav>

        <div id="cpBody">
            <div class="cp-tab-panel" data-panel="design">
                <div class="cp-section">
                    <span class="cp-label">Template</span>
                    <select class="cp-select" id="templateSelect" onchange="changeTemplateStyle(this.value)" aria-label="Template style">
                        <optgroup label="Light templates">${themeOptionsHtml('light')}</optgroup>
                        <optgroup label="Dark / reading-room">${themeOptionsHtml('dark')}</optgroup>
                    </select>
                </div>
                <div class="cp-section">
                    <span class="cp-label">Accent Color</span>
                    <div class="cp-row">
                        <input type="color" class="cp-color-picker" id="accentColorPicker" value="${primaryColor}" onchange="changeAccentColor(this.value)" title="Custom accent color" aria-label="Accent color">
                        <span class="cp-hint" style="margin:0;">Overrides the template's default accent</span>
                    </div>
                    <div class="cp-swatches" id="accentSwatches" role="group" aria-label="Quick accent colors"></div>
                </div>
                <div class="cp-section">
                    <span class="cp-label">
                        <span>Typeface</span>
                    </span>
                    <select class="cp-select" id="fontSelect" onchange="changeFontFamily(this.value)" aria-label="Font family">
                        <option value="'Inter', system-ui, sans-serif">Inter (Medical)</option>
                        <option value="'Outfit', system-ui, sans-serif">Outfit (Modern)</option>
                        <option value="'Roboto', system-ui, sans-serif">Roboto (Standard)</option>
                        <option value="'Space Mono', ui-monospace, monospace">Space Mono (Digital)</option>
                        <option value="Georgia, 'Times New Roman', serif">Georgia (Classic)</option>
                    </select>
                </div>
                <div class="cp-section">
                    <span class="cp-label">
                        <span>Base Text Size</span>
                        <span id="fontSizeVal">12px</span>
                    </span>
                    <input type="range" class="cp-range" min="10" max="15" step="0.5" value="12" oninput="changeFontSize(this.value)" aria-label="Base font size">
                </div>
            </div>

            <div class="cp-tab-panel" data-panel="fields" hidden>
                <div class="cp-section">
                    <span class="cp-label">Metadata Fields</span>
                    <p class="cp-hint">Choose which patient and exam fields appear in the header strip.</p>
                    <div class="cp-fields-grid" id="fieldsChecklist" role="group" aria-label="Toggle metadata fields"></div>
                </div>
                <div class="cp-section">
                    <span class="cp-label">Add Custom Field</span>
                    <div class="cp-add-form">
                        <input type="text" class="cp-input" id="newFieldName" placeholder="Label (e.g. Insurance)" style="flex:1; min-width:0;" aria-label="Custom field label">
                        <input type="text" class="cp-input" id="newFieldValue" placeholder="Value" style="flex:1; min-width:0;" aria-label="Custom field value">
                        <button type="button" class="cp-btn-add" onclick="handleAddCustomField()">+ Add</button>
                    </div>
                </div>
            </div>

            <div class="cp-tab-panel" data-panel="sections" hidden>
                <div class="cp-section">
                    <span class="cp-label">Report Sections</span>
                    <p class="cp-hint">Show or hide clinical sections on this report only.</p>
                    <div class="cp-sections-grid" id="sectionsChecklist" role="group" aria-label="Toggle report sections"></div>
                </div>
            </div>

            <div class="cp-tab-panel" data-panel="display" hidden>
                <div class="cp-section">
                    <span class="cp-label">Layout & Editing</span>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        <label class="cp-checkbox-label" style="background: rgba(56,189,248,0.12); color:#7dd3fc; font-weight:700;">
                            <input type="checkbox" id="toggleDirectEdit" onchange="toggleDirectDocumentEditing(this.checked)">
                            Enable direct text editing
                        </label>
                        <label class="cp-checkbox-label"><input type="checkbox" id="toggleHeader" checked onchange="toggleElement('zoneIdentity', this.checked)"> Show identity band</label>
                        <label class="cp-checkbox-label"><input type="checkbox" id="toggleFooter" checked onchange="toggleElement('zoneFooter', this.checked)"> Show footer</label>
                        <label class="cp-checkbox-label"><input type="checkbox" id="toggleWatermark" ${center.showWatermark ? 'checked' : ''} onchange="toggleElement('siteWatermark', this.checked)"> Show watermark</label>
                        <label class="cp-checkbox-label"><input type="checkbox" id="toggleSignature" checked onchange="toggleElement('zoneSignature', this.checked)"> Show signature &amp; QR</label>
                    </div>
                </div>
            </div>
        </div>

        <div class="cp-actions">
            <button type="button" class="cp-btn-print" onclick="window.print()">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
                Print / PDF
            </button>
            <button type="button" class="cp-btn-secondary" onclick="saveUserPreset()">Save Preset</button>
            <button type="button" class="cp-btn-ghost" onclick="window.resetToDefaults()" title="Reset to default appearance">Reset</button>
        </div>
    </aside>
    ` : ''}

    <div class="page-wrapper">
        <article class="sheet" id="reportSheet" aria-label="Diagnostic imaging report">
            <div class="sheet-accent" aria-hidden="true"></div>
            <div class="sheet-body">
                <div class="watermark" id="siteWatermark" aria-hidden="true">${escapeHtml(logoText)}</div>
                ${isTrialEdition() ? '<div class="trial-watermark" id="trialWatermark" aria-hidden="true">TRIAL</div>' : ''}

                ${center.includeHeader ? `
                <header class="zone-identity" id="zoneIdentity">
                    <div class="brand-box">
                        ${center.logo_url
                ? `<img class="logo-img" src="${escapeHtml(center.logo_url)}" alt="${escapeHtml(center.center_name || 'Center')} logo">`
                : `<div class="logo-avatar" id="brandLogoAvatar" aria-hidden="true">${escapeHtml(logoText)}</div>`
            }
                        <div class="brand-details">
                            <h1 id="brandTitle" dir="auto">${escapeHtml(primaryFacility)}</h1>
                            ${secondaryFacility ? `<div class="brand-subname" id="brandSubname" dir="auto">${escapeHtml(secondaryFacility)}</div>` : ''}
                            ${headerText ? `<p id="brandSubtitle" dir="auto">${lineBreaks(headerText)}</p>` : ''}
                        </div>
                    </div>
                    <div class="doc-meta">
                        <span class="doc-status">${escapeHtml(statusLabel)}</span>
                        <div class="doc-exam-title" dir="auto">${escapeHtml(examTitle)}</div>
                    </div>
                </header>
                ` : ''}

                <div class="zone-meta" id="zoneMeta">
                    <div class="meta-grid" id="metaGridContainer" role="list" aria-label="Patient and exam metadata">
                        ${initialMetaItems.map(item => `
                            <div class="meta-item" role="listitem" data-group="${escapeHtml(item.group || 'exam')}">
                                ${item.isCustom ? `<button type="button" class="btn-remove-custom" onclick="removeCustomExtraField('${escapeHtml(item.label)}')" aria-label="Remove field">&times;</button>` : ''}
                                <span class="meta-label" dir="auto">${escapeHtml(item.label)}</span>
                                <strong class="meta-val" dir="auto">${escapeHtml(item.value)}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>

                ${clinicalContentWarning ? `
                <aside class="clinical-consistency-alert" role="alert">
                    <strong>Clinical consistency review required</strong>
                    <span>${escapeHtml(clinicalContentWarning)}</span>
                </aside>
                ` : ''}

                <main class="zone-clinical" id="zoneClinical">
                    ${sectionDefs.map(s => sectionBlock(
                s.id,
                s.title,
                s.value,
                {
                    important: s.important,
                    hidden: s.custom ? false : !visibleSet.has(s.id)
                }
            )).join('')}
                </main>

                ${center.includeSignature ? `
                <div class="signature-block">
                    <div class="zone-signature" id="zoneSignature">
                        <div class="sig-details">
                            <div class="sig-author">
                                <h4 id="sigName" dir="auto">${escapeHtml(report.digital_signature_name || report.radiologist_name || 'Reporting Radiologist')}</h4>
                                <p id="sigRole" dir="auto">${escapeHtml(report.digital_signature_role || 'Consultant Radiologist')}</p>
                                <div class="sig-line" aria-hidden="true"></div>
                            </div>
                            ${finalized ? `
                            <div class="official-stamp-seal" title="Official Center Stamp & Digital Verification" aria-label="Official Digital Stamp">
                                <svg viewBox="0 0 160 160" width="82" height="82" aria-hidden="true">
                                    <defs>
                                        <path id="stamp-arc-top" d="M 18,80 A 62,62 0 1,1 142,80" fill="none" />
                                        <path id="stamp-arc-bottom" d="M 142,80 A 62,62 0 0,1 18,80" fill="none" />
                                    </defs>
                                    <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" stroke-width="2.5" />
                                    <circle cx="80" cy="80" r="68" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4,2.5" />
                                    <circle cx="80" cy="80" r="48" fill="none" stroke="currentColor" stroke-width="1.8" />
                                    <text font-family="'Cairo', 'Inter', sans-serif" font-size="8" font-weight="bold" fill="currentColor" letter-spacing="1">
                                        <textPath href="#stamp-arc-top" startOffset="50%" text-anchor="middle">★ ${escapeHtml((center.center_name || 'VIARA DIAGNOSTIC').toUpperCase().slice(0, 24))} ★</textPath>
                                    </text>
                                    <text font-family="'Inter', sans-serif" font-size="7" font-weight="bold" fill="currentColor" letter-spacing="0.8">
                                        <textPath href="#stamp-arc-bottom" startOffset="50%" text-anchor="middle">OFFICIALLY VERIFIED</textPath>
                                    </text>
                                    <g transform="translate(80, 72) scale(0.9)">
                                        <path d="M-12,-16 L12,-16 Q14,4 0,16 Q-14,4 -12,-16 Z" fill="none" stroke="currentColor" stroke-width="1.5" />
                                        <path d="M-6,-2 L-2,3 L6,-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                    </g>
                                    <text x="80" y="103" text-anchor="middle" font-family="'Cairo', sans-serif" font-size="9" font-weight="800" fill="currentColor">معتمد رسمياً</text>
                                    <text x="80" y="115" text-anchor="middle" font-family="'Inter', sans-serif" font-size="6" font-weight="700" fill="currentColor" letter-spacing="0.5">DIGITAL SEAL</text>
                                </svg>
                            </div>
                            ` : ''}
                        </div>
                        <div class="verify-card" id="verifyCard" role="group" aria-label="Digital verification">
                            <div class="verify-qr-wrap" id="verifyQrWrap" title="Scan to verify authenticity via portal or camera">
                                <canvas id="verifyQrCanvas" width="80" height="80" aria-label="Verification QR code"></canvas>
                            </div>
                            <div class="verify-info">
                                <span class="v-badge">${finalized ? 'Digitally Verified' : 'Pending Signature'}</span>
                                <span class="v-label">Verification Code</span>
                                <div class="v-hash-row">
                                    <strong class="v-hash" id="verifyHashEl">${escapeHtml(verificationHash)}</strong>
                                    <button type="button" class="v-copy-btn" onclick="window.copyVerificationCode()" aria-label="Copy verification code">Copy</button>
                                </div>
                                <div class="v-meta">
                                    <span>Generated <strong>${escapeHtml(generatedAt)}</strong></span>
                                    ${report.order_number || report.exam_id
                ? `<span>Ref <strong>${escapeHtml(report.order_number || report.exam_id)}</strong></span>`
                : ''}
                                </div>
                                <div class="verify-offline-status ${offlineValidation.valid ? 'ok' : 'fail'}" id="verifyOfflineStatus" role="status" aria-live="polite" title="${escapeHtml((offlineValidation.errors || []).join('; '))}">
                                    <span class="dot" aria-hidden="true"></span>
                                    <span id="verifyOfflineLabel">${offlineValidation.valid
                ? 'Offline integrity OK'
                : 'Integrity check failed'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}

                ${center.includeFooter ? `
                <footer class="zone-footer" id="zoneFooter">
                    <div id="footerText" dir="auto">${escapeHtml(footerText)}</div>
                    <div>Order #${escapeHtml(report.order_number || report.exam_id || '—')}</div>
                </footer>
                ` : ''}
            </div>
        </article>
    </div>

    <script>
        window.THEMES_CONFIG = ${JSON.stringify(THEMES)};
        window.RAW_CATALOG = ${JSON.stringify(rawCatalog)};
        window.SECTION_DEFS = ${JSON.stringify(sectionDefs.map(s => ({ id: s.id, title: s.title, custom: !!s.custom })))};
        window.activeEnabledIds = ${JSON.stringify(center.enabledFields)};
        window.activeExtraFields = ${JSON.stringify(center.customFields)};
        window.activeVisibleSections = ${JSON.stringify([...visibleSet])};
        window.VERIFY_PAYLOAD = ${JSON.stringify(qrPayload)};
        window.VERIFY_EXPECTED = ${JSON.stringify({
                    hash: verificationHash,
                    examId: report.exam_id || '',
                    order: report.order_number || report.accession_number || '',
                    mrn: report.mrn || ''
                })};
        window.DEFAULTS = {
            enabledIds: window.activeEnabledIds.slice(),
            extraFields: Object.assign({}, window.activeExtraFields),
            visibleSections: window.activeVisibleSections.slice(),
            templateStyle: ${JSON.stringify(styleKey)},
            accentColor: ${JSON.stringify(primaryColor)},
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '12'
        };
        window.ACCENT_SWATCHES = ['#0ea5e9', '#0d9488', '#059669', '#4f46e5', '#7c3aed', '#2563eb', '#c2410c', '#334155', '#111827', '#22d3ee'];

        /* ── Toast ─────────────────────────────────────────────────────── */
        window.showToast = function (message, opts) {
            opts = opts || {};
            var existing = document.getElementById('VIARAToast');
            if (existing) existing.remove();
            var toast = document.createElement('div');
            toast.id = 'VIARAToast';
            toast.className = 'VIARA-toast' + (opts.tone === 'error' ? ' tone-error' : '');
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            toast.textContent = message;
            document.body.appendChild(toast);
            requestAnimationFrame(function () { toast.classList.add('show'); });
            setTimeout(function () {
                toast.classList.remove('show');
                setTimeout(function () { toast.remove(); }, 250);
            }, opts.duration || 2200);
        };

        window.copyVerificationCode = function () {
            var el = document.getElementById('verifyHashEl');
            var text = el ? el.textContent : '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    window.showToast('Verification code copied');
                }).catch(function () {
                    window.showToast('Could not copy — select manually', { tone: 'error' });
                });
            } else {
                window.showToast('Clipboard unavailable in this browser', { tone: 'error' });
            }
        };

        /* ── Tabs ──────────────────────────────────────────────────────── */
        window.switchCPTab = function (tabId) {
            document.querySelectorAll('.cp-tab-btn').forEach(function (btn) {
                var active = btn.getAttribute('data-tab') === tabId;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            document.querySelectorAll('.cp-tab-panel').forEach(function (panel) {
                panel.hidden = panel.getAttribute('data-panel') !== tabId;
            });
        };

        /* ── Offline verification (parse + checksum) ─────────────────────── */
        window.computeChecksum = function (value) {
            var h = 5381, s = String(value || '');
            for (var i = 0; i < s.length; i++) {
                h = ((h << 5) + h) ^ s.charCodeAt(i);
                h |= 0;
            }
            return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
        };

        window.parseVerificationPayload = function (payload) {
            var errors = [];
            var raw = String(payload || '').trim();
            if (!raw) return { valid: false, errors: ['Empty payload'] };
            if (raw.indexOf('/verify') !== -1 || raw.indexOf('code=') !== -1 || raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0) {
                var codeMatch = raw.match(/[?&]code=([^&#]+)/);
                var codeVal = codeMatch ? decodeURIComponent(codeMatch[1]) : '';
                return {
                    valid: !!codeVal,
                    version: 'URL',
                    hash: codeVal,
                    examId: '',
                    order: '',
                    mrn: '',
                    timestamp: '',
                    checksum: '',
                    errors: codeVal ? [] : ['Missing verification code in URL']
                };
            }
            var parts = raw.split('|');
            var result = {
                valid: false, version: parts[0] || '', hash: '', examId: '',
                order: '', mrn: '', timestamp: '', checksum: '', errors: errors
            };
            if (parts[0] !== 'VIARA1' && parts[0] !== 'VIARA-VERIFY') {
                errors.push('Unknown payload prefix (expected VIARA1)');
            }
            if (parts[0] === 'VIARA1') {
                result.hash = parts[1] || '';
                for (var i = 2; i < parts.length; i++) {
                    var p = parts[i];
                    if (p.indexOf('E:') === 0) result.examId = p.slice(2);
                    else if (p.indexOf('O:') === 0) result.order = p.slice(2);
                    else if (p.indexOf('MRN:') === 0) result.mrn = p.slice(4);
                    else if (p.indexOf('TS:') === 0) result.timestamp = p.slice(3);
                    else if (p.indexOf('C:') === 0) result.checksum = p.slice(2);
                }
                var body = raw.replace(/\\|C:[A-F0-9]+$/i, '');
                var expected = window.computeChecksum(body);
                if (!result.checksum) errors.push('Missing checksum');
                else if (result.checksum.toUpperCase() !== expected) {
                    errors.push('Checksum mismatch — payload may be altered');
                }
                if (!result.hash) errors.push('Missing verification hash');
            } else if (parts[0] === 'VIARA-VERIFY') {
                result.hash = parts[1] || '';
                for (var j = 2; j < parts.length; j++) {
                    var q = parts[j];
                    if (q.indexOf('E:') === 0) result.examId = q.slice(2);
                    else if (q.indexOf('O:') === 0) result.order = q.slice(2);
                    else if (q.indexOf('MRN:') === 0) result.mrn = q.slice(4);
                }
                if (!result.hash) errors.push('Missing verification hash');
            }
            result.valid = errors.length === 0;
            return result;
        };

        window.validateVerificationPayload = function (payload, expected) {
            expected = expected || {};
            var parsed = window.parseVerificationPayload(payload);
            if (expected.hash && parsed.hash && expected.hash !== parsed.hash) {
                parsed.errors.push('Hash does not match this report');
            }
            if (parsed.version !== 'URL') {
                if (expected.examId && parsed.examId && expected.examId !== parsed.examId) {
                    parsed.errors.push('Exam ID does not match this report');
                }
                if (expected.order && parsed.order && expected.order !== parsed.order) {
                    parsed.errors.push('Order number does not match this report');
                }
                if (expected.mrn && parsed.mrn && expected.mrn !== parsed.mrn) {
                    parsed.errors.push('MRN does not match this report');
                }
            }
            parsed.valid = parsed.errors.length === 0;
            return parsed;
        };

        window.runOfflineValidation = function () {
            var result = window.validateVerificationPayload(
                window.VERIFY_PAYLOAD,
                window.VERIFY_EXPECTED
            );
            var el = document.getElementById('verifyOfflineStatus');
            var label = document.getElementById('verifyOfflineLabel');
            if (!el || !label) return result;
            el.className = 'verify-offline-status ' + (result.valid ? 'ok' : 'fail');
            el.title = (result.errors || []).join('; ');
            label.textContent = result.valid
                ? 'Offline integrity OK'
                : 'Integrity check failed';
            return result;
        };

        /* ── Offline QR code generator (pure JS, no network) ───────────────
           Compact QR encoder supporting byte mode, ECC level M, versions 1–10.
           Sufficient for VIARA verification payloads (~80–150 chars).
        ──────────────────────────────────────────────────────────────────── */
        window.VIARA_QR = (function () {
            // GF(256) tables for Reed-Solomon
            var EXP = new Array(512), LOG = new Array(256);
            (function () {
                var x = 1;
                for (var i = 0; i < 255; i++) {
                    EXP[i] = x;
                    LOG[x] = i;
                    x <<= 1;
                    if (x & 0x100) x ^= 0x11d;
                }
                for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
            })();

            function gfMul(a, b) {
                if (a === 0 || b === 0) return 0;
                return EXP[LOG[a] + LOG[b]];
            }

            function rsGenerator(ecLen) {
                var g = [1];
                for (var i = 0; i < ecLen; i++) {
                    var next = new Array(g.length + 1).fill(0);
                    for (var j = 0; j < g.length; j++) {
                        next[j] ^= g[j];
                        next[j + 1] ^= gfMul(g[j], EXP[i]);
                    }
                    g = next;
                }
                return g;
            }

            function rsEncode(data, ecLen) {
                var gen = rsGenerator(ecLen);
                var res = new Array(ecLen).fill(0);
                for (var i = 0; i < data.length; i++) {
                    var factor = data[i] ^ res[0];
                    res.shift();
                    res.push(0);
                    if (factor !== 0) {
                        for (var j = 0; j < gen.length - 1; j++) {
                            res[j] ^= gfMul(gen[j + 1], factor);
                        }
                    }
                }
                return res;
            }

            // ECC M capacity (data codewords) per version 1–10
            var CAP_M = [0, 16, 28, 44, 64, 86, 108, 124, 154, 182, 216];
            var EC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
            var EC_BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 4, 6];

            function alignmentPositions(ver) {
                if (ver === 1) return [];
                var intervals = [
                    null, null, 18, 22, 26, 30, 34, 22, 24, 26, 28
                ];
                var n = Math.floor(ver / 7) + 2;
                var pos = [6];
                if (ver >= 2) {
                    var step = intervals[ver];
                    var size = ver * 4 + 17;
                    var last = size - 7;
                    for (var i = n - 2; i >= 1; i--) {
                        pos.push(last - step * i);
                    }
                    pos.push(last);
                }
                return pos;
            }

            function encodeByteData(text, ver) {
                var bytes = [];
                for (var i = 0; i < text.length; i++) {
                    var c = text.charCodeAt(i);
                    if (c < 128) bytes.push(c);
                    else if (c < 2048) {
                        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
                    } else {
                        bytes.push(
                            0xe0 | (c >> 12),
                            0x80 | ((c >> 6) & 0x3f),
                            0x80 | (c & 0x3f)
                        );
                    }
                }
                var bitLen = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
                var totalData = CAP_M[ver];
                var totalBits = totalData * 8;
                if (bitLen + 4 > totalBits) return null;

                var bits = [];
                function put(val, len) {
                    for (var b = len - 1; b >= 0; b--) bits.push((val >> b) & 1);
                }
                put(0x4, 4); // byte mode
                put(bytes.length, ver < 10 ? 8 : 16);
                for (var k = 0; k < bytes.length; k++) put(bytes[k], 8);

                // terminator
                var remain = totalBits - bits.length;
                put(0, Math.min(4, remain));
                while (bits.length % 8 !== 0) bits.push(0);
                var padBytes = [0xec, 0x11];
                var pi = 0;
                while (bits.length / 8 < totalData) {
                    put(padBytes[pi % 2], 8);
                    pi++;
                }

                var codewords = [];
                for (var n = 0; n < bits.length; n += 8) {
                    var v = 0;
                    for (var m = 0; m < 8; m++) v = (v << 1) | bits[n + m];
                    codewords.push(v);
                }
                return codewords;
            }

            function interleave(dataCw, ver) {
                var ecLen = EC_M[ver];
                var blocks = EC_BLOCKS_M[ver];
                var totalData = CAP_M[ver];
                var shortBlockLen = Math.floor(totalData / blocks);
                var numLong = totalData % blocks;
                var dataBlocks = [];
                var ecBlocks = [];
                var offset = 0;
                for (var i = 0; i < blocks; i++) {
                    var len = shortBlockLen + (i < blocks - numLong ? 0 : 1);
                    // Actually longer blocks come last
                    len = shortBlockLen + (i >= blocks - numLong ? 1 : 0);
                    var block = dataCw.slice(offset, offset + len);
                    offset += len;
                    dataBlocks.push(block);
                    ecBlocks.push(rsEncode(block, ecLen));
                }
                var result = [];
                var maxData = Math.max.apply(null, dataBlocks.map(function (b) { return b.length; }));
                for (var d = 0; d < maxData; d++) {
                    for (var bi = 0; bi < blocks; bi++) {
                        if (d < dataBlocks[bi].length) result.push(dataBlocks[bi][d]);
                    }
                }
                for (var e = 0; e < ecLen; e++) {
                    for (var bj = 0; bj < blocks; bj++) result.push(ecBlocks[bj][e]);
                }
                return result;
            }

            function buildMatrix(ver, data) {
                var size = ver * 4 + 17;
                var mat = [];
                var reserved = [];
                for (var r = 0; r < size; r++) {
                    mat[r] = new Array(size).fill(null);
                    reserved[r] = new Array(size).fill(false);
                }
                function setReserved(row, col, val) {
                    if (row < 0 || col < 0 || row >= size || col >= size) return;
                    mat[row][col] = val ? 1 : 0;
                    reserved[row][col] = true;
                }
                function finder(x, y) {
                    for (var dy = -1; dy <= 7; dy++) {
                        for (var dx = -1; dx <= 7; dx++) {
                            var rr = y + dy, cc = x + dx;
                            if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
                            var on = (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6) &&
                                (dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
                                 (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
                            setReserved(rr, cc, on);
                        }
                    }
                }
                finder(0, 0);
                finder(size - 7, 0);
                finder(0, size - 7);

                // timing
                for (var i = 8; i < size - 8; i++) {
                    setReserved(6, i, i % 2 === 0);
                    setReserved(i, 6, i % 2 === 0);
                }
                // dark module
                setReserved(size - 8, 8, true);

                // alignment
                var aligns = alignmentPositions(ver);
                for (var a = 0; a < aligns.length; a++) {
                    for (var b = 0; b < aligns.length; b++) {
                        var cx = aligns[a], cy = aligns[b];
                        if (reserved[cy][cx]) continue;
                        for (var dy = -2; dy <= 2; dy++) {
                            for (var dx = -2; dx <= 2; dx++) {
                                var on = Math.max(Math.abs(dx), Math.abs(dy)) !== 1 || (dx === 0 && dy === 0);
                                // Correct: outer border + center
                                on = (Math.abs(dx) === 2 || Math.abs(dy) === 2 || (dx === 0 && dy === 0));
                                setReserved(cy + dy, cx + dx, on);
                            }
                        }
                    }
                }

                // format info reserved
                for (var f = 0; f < 8; f++) {
                    setReserved(8, f === 6 ? 7 : f, false);
                    setReserved(f === 6 ? 7 : f, 8, false);
                    setReserved(8, size - 1 - f, false);
                    setReserved(size - 1 - f, 8, false);
                }
                setReserved(8, 8, false);

                // version info reserved for ver >= 7
                if (ver >= 7) {
                    for (var vi = 0; vi < 6; vi++) {
                        for (var vj = 0; vj < 3; vj++) {
                            setReserved(vi, size - 11 + vj, false);
                            setReserved(size - 11 + vj, vi, false);
                        }
                    }
                }

                // place data
                var bitIdx = 0;
                var bits = [];
                for (var di = 0; di < data.length; di++) {
                    for (var db = 7; db >= 0; db--) bits.push((data[di] >> db) & 1);
                }
                var upward = true;
                for (var col = size - 1; col > 0; col -= 2) {
                    if (col === 6) col = 5;
                    for (var t = 0; t < size; t++) {
                        var row = upward ? size - 1 - t : t;
                        for (var c2 = 0; c2 < 2; c2++) {
                            var cc = col - c2;
                            if (mat[row][cc] !== null) continue;
                            mat[row][cc] = bitIdx < bits.length ? bits[bitIdx++] : 0;
                        }
                    }
                    upward = !upward;
                }

                // mask 0: (r+c)%2==0 → flip; evaluate only mask 0 for simplicity + apply format
                function applyMask(maskId) {
                    var out = mat.map(function (row, r) {
                        return row.map(function (val, c) {
                            if (reserved[r][c]) return val;
                            var flip = false;
                            if (maskId === 0) flip = (r + c) % 2 === 0;
                            else if (maskId === 1) flip = r % 2 === 0;
                            return flip ? (val ? 0 : 1) : val;
                        });
                    });
                    return out;
                }

                // Format bits for ECC M (01) + mask 0 (000) → BCH
                // Precomputed format info strings for mask 0–7 at ECC M
                var FORMAT_M = [
                    0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0
                ];
                var maskId = 0;
                var masked = applyMask(maskId);
                var fmt = FORMAT_M[maskId];
                for (var fi = 0; fi < 15; fi++) {
                    var bit = (fmt >> fi) & 1;
                    // horizontal near finder
                    if (fi < 6) masked[8][fi] = bit;
                    else if (fi < 8) masked[8][fi + 1] = bit;
                    else masked[8][size - 15 + fi] = bit;
                    // vertical
                    if (fi < 8) masked[size - 1 - fi][8] = bit;
                    else if (fi < 9) masked[15 - fi][8] = bit;
                    else masked[14 - fi][8] = bit;
                }
                return masked;
            }

            function selectVersion(text) {
                for (var v = 1; v <= 10; v++) {
                    if (encodeByteData(text, v)) return v;
                }
                return 10;
            }

            function renderToCanvas(text, canvas, opts) {
                opts = opts || {};
                var ver = selectVersion(text);
                var dataCw = encodeByteData(text, ver);
                if (!dataCw) {
                    return false;
                }
                var interleaved = interleave(dataCw, ver);
                var matrix = buildMatrix(ver, interleaved);
                var size = matrix.length;
                var margin = opts.margin != null ? opts.margin : 2;
                var px = opts.size || 80;
                var scale = Math.floor(px / (size + margin * 2));
                if (scale < 1) scale = 1;
                var dim = (size + margin * 2) * scale;
                canvas.width = dim;
                canvas.height = dim;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, dim, dim);
                ctx.fillStyle = '#0f172a';
                for (var r = 0; r < size; r++) {
                    for (var c = 0; c < size; c++) {
                        if (matrix[r][c]) {
                            ctx.fillRect(
                                (c + margin) * scale,
                                (r + margin) * scale,
                                scale,
                                scale
                            );
                        }
                    }
                }
                return true;
            }

            return { renderToCanvas: renderToCanvas, selectVersion: selectVersion };
        })();

        window.renderOfflineQR = function () {
            var canvas = document.getElementById('verifyQrCanvas');
            var wrap = document.getElementById('verifyQrWrap');
            if (!canvas || !window.VERIFY_PAYLOAD) return;
            var ok = false;
            try {
                ok = window.VIARA_QR.renderToCanvas(window.VERIFY_PAYLOAD, canvas, {
                    size: 80,
                    margin: 2
                });
            } catch (e) {
                ok = false;
            }
            if (!ok && wrap) {
                canvas.style.display = 'none';
                if (!wrap.querySelector('.verify-qr-fallback')) {
                    var fallback = document.createElement('div');
                    fallback.className = 'verify-qr-fallback';
                    fallback.textContent = 'QR unavailable — use verification code';
                    wrap.appendChild(fallback);
                }
            }
        };

        window.toggleCustomizePanel = function () {
            var panel = document.getElementById('customizePanel');
            if (panel) panel.classList.toggle('collapsed');
        };

        window.renderAccentSwatches = function () {
            var container = document.getElementById('accentSwatches');
            if (!container) return;
            container.innerHTML = '';
            window.ACCENT_SWATCHES.forEach(function (hex) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cp-swatch';
                btn.style.background = hex;
                btn.setAttribute('aria-label', 'Set accent color ' + hex);
                btn.onclick = function () {
                    var picker = document.getElementById('accentColorPicker');
                    if (picker) picker.value = hex;
                    window.changeAccentColor(hex);
                };
                container.appendChild(btn);
            });
        };

        window.renderFieldsChecklist = function () {
            var container = document.getElementById('fieldsChecklist');
            if (!container) return;
            container.innerHTML = '';
            window.RAW_CATALOG.forEach(function (item) {
                var checked = window.activeEnabledIds.indexOf(item.id) !== -1 ? 'checked' : '';
                var label = document.createElement('label');
                label.className = 'cp-checkbox-label';
                label.innerHTML = '<input type="checkbox" ' + checked + ' onchange="window.toggleFieldId(\\'' + item.id + '\\', this.checked)"> ' + item.label;
                container.appendChild(label);
            });
        };

        window.renderSectionsChecklist = function () {
            var container = document.getElementById('sectionsChecklist');
            if (!container) return;
            container.innerHTML = '';
            window.SECTION_DEFS.forEach(function (sec) {
                var checked = window.activeVisibleSections.indexOf(sec.id) !== -1 || sec.custom ? 'checked' : '';
                if (sec.custom && window.activeVisibleSections.indexOf(sec.id) === -1) {
                    if (document.getElementById('sec-' + sec.id)) {
                        checked = document.getElementById('sec-' + sec.id).style.display !== 'none' ? 'checked' : '';
                    }
                }
                var label = document.createElement('label');
                label.className = 'cp-checkbox-label';
                label.innerHTML = '<input type="checkbox" ' + checked + ' onchange="window.toggleSectionId(\\'' + sec.id + '\\', this.checked)"> ' + sec.title;
                container.appendChild(label);
            });
        };

        window.toggleFieldId = function (id, checked) {
            if (checked) {
                if (window.activeEnabledIds.indexOf(id) === -1) window.activeEnabledIds.push(id);
            } else {
                window.activeEnabledIds = window.activeEnabledIds.filter(function (x) { return x !== id; });
            }
            window.renderMetaGridDOM();
        };

        window.toggleSectionId = function (id, checked) {
            if (checked) {
                if (window.activeVisibleSections.indexOf(id) === -1) window.activeVisibleSections.push(id);
            } else {
                window.activeVisibleSections = window.activeVisibleSections.filter(function (x) { return x !== id; });
            }
            var el = document.getElementById('sec-' + id);
            if (el) el.style.display = checked ? '' : 'none';
            window.refreshFirstVisibleSection();
        };

        window.refreshFirstVisibleSection = function () {
            var sections = document.querySelectorAll('.zone-clinical .report-section');
            var found = false;
            sections.forEach(function (sec) {
                sec.classList.remove('is-first-visible');
                if (!found && sec.style.display !== 'none') {
                    sec.classList.add('is-first-visible');
                    found = true;
                }
            });
        };

        window.handleAddCustomField = function () {
            var nameEl = document.getElementById('newFieldName');
            var valEl = document.getElementById('newFieldValue');
            if (!nameEl || !valEl) return;
            var key = nameEl.value.trim();
            var val = valEl.value.trim();
            if (!key || !val) {
                window.showToast('Enter both a label and a value', { tone: 'error' });
                return;
            }
            window.activeExtraFields[key] = val;
            nameEl.value = '';
            valEl.value = '';
            window.renderMetaGridDOM();
            window.showToast('Field added');
        };

        window.removeCustomExtraField = function (key) {
            delete window.activeExtraFields[key];
            window.renderMetaGridDOM();
        };

        window.renderMetaGridDOM = function () {
            var container = document.getElementById('metaGridContainer');
            if (!container) return;
            var itemsToRender = [];
            window.RAW_CATALOG.forEach(function (item) {
                if (window.activeEnabledIds.indexOf(item.id) !== -1) {
                    itemsToRender.push({ label: item.label, value: item.value, isCustom: false, group: item.group });
                }
            });
            Object.keys(window.activeExtraFields).forEach(function (k) {
                var v = window.activeExtraFields[k];
                if (v) itemsToRender.push({ label: k, value: String(v), isCustom: true, key: k, group: 'custom' });
            });
            var zoneMeta = document.getElementById('zoneMeta');
            if (itemsToRender.length === 0) {
                container.style.display = 'none';
                if (zoneMeta) zoneMeta.style.display = 'none';
                return;
            }
            if (zoneMeta) zoneMeta.style.display = '';
            container.style.display = 'grid';
            container.innerHTML = '';
            itemsToRender.forEach(function (item) {
                var div = document.createElement('div');
                div.className = 'meta-item';
                div.setAttribute('role', 'listitem');
                if (item.group) div.setAttribute('data-group', item.group);
                if (item.isCustom) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn-remove-custom';
                    btn.innerHTML = '&times;';
                    btn.setAttribute('aria-label', 'Remove ' + item.label);
                    btn.onclick = function () { window.removeCustomExtraField(item.key); };
                    div.appendChild(btn);
                }
                var span = document.createElement('span');
                span.className = 'meta-label';
                span.textContent = item.label;
                var strong = document.createElement('strong');
                strong.className = 'meta-val';
                strong.textContent = item.value;
                div.appendChild(span);
                div.appendChild(strong);
                container.appendChild(div);
            });
        };

        window.changeTemplateStyle = function (styleKey) {
            var theme = window.THEMES_CONFIG[styleKey] || window.THEMES_CONFIG.modern;
            document.body.classList.toggle('theme-dark', !!theme.dark);
            document.body.style.fontFamily = theme.font;
            var root = document.documentElement.style;
            root.setProperty('--primary', theme.primary);
            root.setProperty('--primary-dark', theme.primaryDark);
            root.setProperty('--border', theme.border);
            root.setProperty('--card-bg', theme.cardBg);
            root.setProperty('--impression-bg', theme.impressionBg);
            root.setProperty('--impression-border', theme.impressionBorder);
            root.setProperty('--meta-bg', theme.metaBg);
            root.setProperty('--accent-soft', theme.accentSoft);
            root.setProperty('--radius', theme.radius);
            root.setProperty('--surface', theme.surface || '#ffffff');
            root.setProperty('--text', theme.text || '#0f172a');
            root.setProperty('--text-muted', theme.textMuted || '#64748b');
            root.setProperty('--text-soft', theme.textSoft || '#94a3b8');
            window.changeAccentColor(theme.primary);
            var picker = document.getElementById('accentColorPicker');
            if (picker) picker.value = theme.primary;
        };

        window.changeAccentColor = function (colorHex) {
            document.documentElement.style.setProperty('--primary', colorHex);
            var verifyHashEl = document.getElementById('verifyHashEl');
            if (verifyHashEl) verifyHashEl.style.color = colorHex;
            var logoAvatar = document.getElementById('brandLogoAvatar');
            if (logoAvatar) {
                logoAvatar.style.background = 'linear-gradient(135deg, ' + colorHex + ', #2563eb)';
            }
            document.querySelectorAll('.title-bar').forEach(function (bar) {
                bar.style.backgroundColor = colorHex;
            });
            document.querySelectorAll('.section-title').forEach(function (t) {
                if (!t.closest('.important-section')) t.style.color = colorHex;
            });
        };

        window.changeFontFamily = function (fontFamily) {
            document.body.style.fontFamily = fontFamily;
        };

        window.changeFontSize = function (px) {
            document.documentElement.style.setProperty('--base-font-size', px + 'px');
            var valEl = document.getElementById('fontSizeVal');
            if (valEl) valEl.textContent = px + 'px';
        };

        window.toggleDirectDocumentEditing = function (enabled) {
            var selectors = ['.section-body', '.title-text', '#brandTitle', '#brandSubtitle', '#sigName', '#sigRole', '#footerText', '.meta-val'];
            selectors.forEach(function (sel) {
                document.querySelectorAll(sel).forEach(function (el) {
                    el.contentEditable = enabled ? 'true' : 'false';
                });
            });
        };

        window.toggleElement = function (elementId, visible) {
            var el = document.getElementById(elementId);
            if (el) el.style.display = visible ? '' : 'none';
        };

        window.resetToDefaults = function () {
            var d = window.DEFAULTS;
            window.activeEnabledIds = d.enabledIds.slice();
            window.activeExtraFields = Object.assign({}, d.extraFields);
            window.activeVisibleSections = d.visibleSections.slice();

            var templateSel = document.getElementById('templateSelect');
            if (templateSel) templateSel.value = d.templateStyle;
            window.changeTemplateStyle(d.templateStyle);

            var picker = document.getElementById('accentColorPicker');
            if (picker) picker.value = d.accentColor;
            window.changeAccentColor(d.accentColor);

            var fontSel = document.getElementById('fontSelect');
            if (fontSel) fontSel.value = d.fontFamily;
            window.changeFontFamily(d.fontFamily);

            var range = document.querySelector('.cp-range');
            if (range) range.value = d.fontSize;
            window.changeFontSize(d.fontSize);

            window.SECTION_DEFS.forEach(function (sec) {
                var el = document.getElementById('sec-' + sec.id);
                if (el) el.style.display = window.activeVisibleSections.indexOf(sec.id) !== -1 ? '' : 'none';
            });

            window.renderFieldsChecklist();
            window.renderSectionsChecklist();
            window.renderMetaGridDOM();
            window.refreshFirstVisibleSection();

            try { localStorage.removeItem('VIARA_report_preset'); } catch (e) { /* ignore */ }
            window.showToast('Reset to default appearance');
        };

        window.saveUserPreset = function () {
            var preset = {
                activeEnabledIds: window.activeEnabledIds,
                activeExtraFields: window.activeExtraFields,
                activeVisibleSections: window.activeVisibleSections,
                templateStyle: document.getElementById('templateSelect').value,
                accentColor: document.getElementById('accentColorPicker').value,
                fontFamily: document.getElementById('fontSelect').value,
                fontSize: document.getElementById('fontSizeVal').textContent
            };
            try {
                localStorage.setItem('VIARA_report_preset', JSON.stringify(preset));
                window.showToast('Preset saved');
            } catch (e) {
                window.showToast('Could not save preset — storage unavailable', { tone: 'error' });
            }
        };

        function applySavedPreset() {
            try {
                var raw = localStorage.getItem('VIARA_report_preset');
                if (!raw) return;
                var preset = JSON.parse(raw);
                if (preset.activeEnabledIds) window.activeEnabledIds = preset.activeEnabledIds;
                if (preset.activeExtraFields) window.activeExtraFields = preset.activeExtraFields;
                if (preset.activeVisibleSections) {
                    window.activeVisibleSections = preset.activeVisibleSections;
                    window.SECTION_DEFS.forEach(function (sec) {
                        var el = document.getElementById('sec-' + sec.id);
                        if (el) {
                            var show = window.activeVisibleSections.indexOf(sec.id) !== -1;
                            el.style.display = show ? '' : 'none';
                        }
                    });
                }
                if (preset.templateStyle) {
                    var sel = document.getElementById('templateSelect');
                    if (sel) { sel.value = preset.templateStyle; window.changeTemplateStyle(preset.templateStyle); }
                }
                if (preset.accentColor) {
                    var picker = document.getElementById('accentColorPicker');
                    if (picker) { picker.value = preset.accentColor; window.changeAccentColor(preset.accentColor); }
                }
                if (preset.fontFamily) {
                    var fs = document.getElementById('fontSelect');
                    if (fs) { fs.value = preset.fontFamily; window.changeFontFamily(preset.fontFamily); }
                }
                if (preset.fontSize) {
                    var px = parseFloat(preset.fontSize);
                    if (!isNaN(px)) {
                        var range = document.querySelector('.cp-range');
                        if (range) range.value = px;
                        window.changeFontSize(px);
                    }
                }
            } catch (e) { /* ignore */ }
        }

        document.addEventListener('DOMContentLoaded', function () {
            applySavedPreset();
            window.renderAccentSwatches();
            window.renderFieldsChecklist();
            window.renderSectionsChecklist();
            window.renderMetaGridDOM();
            window.refreshFirstVisibleSection();
            window.renderOfflineQR();
            window.runOfflineValidation();
            window.switchCPTab('design');
        });
        window.renderAccentSwatches();
        window.renderFieldsChecklist();
        window.renderSectionsChecklist();
        window.renderMetaGridDOM();
        window.refreshFirstVisibleSection();
        window.renderOfflineQR();
        window.runOfflineValidation();
    </script>
</body>
</html>`;
};

const pdfService = {
    buildReportHtml,
    THEMES,
    METADATA_CATALOG,
    SECTION_CATALOG,
    normalizeCenterSettings,
    reportSections,
    formatDate,
    formatDateOnly,
    reportHeaderText,
    reportFooterText,
    detectClinicalContentMismatch,
    buildVerificationPayload,
    parseVerificationPayload,
    validateVerificationPayload,
    computeChecksum
};

module.exports = pdfService;
module.exports.default = pdfService;
