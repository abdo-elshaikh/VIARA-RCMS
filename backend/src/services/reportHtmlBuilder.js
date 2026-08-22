const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const parseJSONSafe = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
};

const enabledUnlessFalse = (value) => value !== false && String(value).toLowerCase() !== 'false';

const lineBreaks = (value = '') => escapeHtml(value).replace(/\n/g, '<br>');

const safeArray = (val, fallback = []) => Array.isArray(val) ? val : fallback;
const safeObject = (val, fallback = {}) => (val && typeof val === 'object' && !Array.isArray(val)) ? val : fallback;

const normalizeCenterSettings = (settings = {}) => {
    const print = parseJSONSafe(settings.print_settings) || settings.print_settings || {};

    let enabled = settings.enabledFields || print.enabledFields;
    if (typeof enabled === 'string') {
        enabled = enabled.split(',').map(s => s.trim()).filter(Boolean);
    }

    return {
        center_name: settings.center_name || settings['center.name'] || 'Radiology Center',
        branch_name: settings.branch_name || settings['center.branch'] || '',
        logo_url: settings.logo_url || settings['center.logo_url'] || '',
        phone: settings.phone || settings['center.phone'] || '',
        email: settings.email || settings['center.email'] || '',
        address: settings.address || settings['center.address'] || '',
        report_header: settings.report_header || settings['center.report_header'] || '',
        report_footer: settings.report_footer || settings['center.report_footer'] || '',
        themeColor: settings.themeColor || print.themeColor || '',
        fontFamily: settings.fontFamily || print.fontFamily || '',
        templateStyle: (settings.templateStyle || print.templateStyle || 'modern').toLowerCase(),
        density: settings.density || print.density || 'comfortable',
        direction: (settings.direction || print.direction || 'ltr').toLowerCase() === 'rtl' ? 'rtl' : 'ltr',
        enabledFields: safeArray(enabled, ['patient_name', 'mrn', 'study_date', 'referring_doctor']),
        customFields: safeObject(settings.customFields || print.customFields, {}),
        customLabels: safeObject(settings.customLabels || print.customLabels, {}),
        showWatermark: print.showWatermark !== false && settings.showWatermark !== false,
        includeHeader: enabledUnlessFalse(settings.includeHeader),
        includeFooter: enabledUnlessFalse(settings.includeFooter),
        includeSignature: enabledUnlessFalse(settings.includeSignature),
        print_settings: print
    };
};

const reportHeaderText = (center) => center.report_header || [
    center.address,
    center.phone && `Tel: ${center.phone}`,
    center.email && `Email: ${center.email}`
].filter(Boolean).join('\n');

const reportFooterText = (center) => center.report_footer
    || `${center.center_name} • Diagnostic Medical Imaging Report • Confidential`;

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
                const readableTitle = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                customSections.push({ title: readableTitle, value: val });
            }
        });
    }

    return { standard, customSections };
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
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

const METADATA_CATALOG = [
    { id: 'patient_name', defaultLabel: 'Patient Name', getValue: r => r.patient_name },
    { id: 'mrn', defaultLabel: 'MRN', getValue: r => r.mrn },
    { id: 'study_date', defaultLabel: 'Study date', getValue: r => formatDate(r.start_time || r.created_at) },
    { id: 'referring_doctor', defaultLabel: 'Referring doctor', getValue: r => r.referring_doctor_name },
    { id: 'dob', defaultLabel: 'DOB', getValue: r => formatDateOnly(r.date_of_birth) },
    { id: 'gender', defaultLabel: 'Gender', getValue: r => r.gender },
    { id: 'modality', defaultLabel: 'Modality', getValue: r => r.modality_type || r.modality_name },
    { id: 'priority', defaultLabel: 'Priority', getValue: r => r.priority },
    { id: 'accession', defaultLabel: 'Order / Accession #', getValue: r => r.order_number || r.accession_number },
    { id: 'room', defaultLabel: 'Room', getValue: r => r.room_number },
    { id: 'radiologist', defaultLabel: 'Radiologist', getValue: r => r.radiologist_name || r.digital_signature_name }
];

// Each theme is a self-contained token set (color + type) rather than a single accent swap,
// so switching templates changes the report's whole personality, not just a highlight color.
const THEMES = {
    modern: {
        name: 'Modern Executive',
        description: 'Emerald accent, geometric sans, the VIARA clinical style',
        swatch: ['#0891b2', '#2563eb'],
        accent: '#0891b2',
        accentSecondary: '#2563eb',
        sheetBg: '#ffffff', textColor: '#0f172a', mutedText: '#64748b',
        cardBg: '#f8fafc', border: '#e2e8f0',
        impressionBg: '#ecfeff', impressionBorder: '#0891b2',
        headingFont: "'Inter', -apple-system, sans-serif",
        bodyFont: "'Inter', -apple-system, sans-serif",
        radius: '10px', dark: false
    },
    classic: {
        name: 'Classic Hospital',
        description: 'Navy serif headings for institutional gravitas',
        swatch: ['#1e3a8a', '#334155'],
        accent: '#1e3a8a',
        accentSecondary: '#334155',
        sheetBg: '#ffffff', textColor: '#0f172a', mutedText: '#5b6472',
        cardBg: '#f8fafc', border: '#cbd5e1',
        impressionBg: '#eff6ff', impressionBorder: '#1e3a8a',
        headingFont: "'Source Serif 4', Georgia, serif",
        bodyFont: "'Inter', Georgia, serif",
        radius: '4px', dark: false
    },
    minimal: {
        name: 'Minimal Clean',
        description: 'Near-white canvas, hairline rules, quiet confidence',
        swatch: ['#0f172a', '#94a3b8'],
        accent: '#0f172a',
        accentSecondary: '#475569',
        sheetBg: '#ffffff', textColor: '#111827', mutedText: '#6b7280',
        cardBg: '#ffffff', border: '#e5e7eb',
        impressionBg: '#f9fafb', impressionBorder: '#0f172a',
        headingFont: "'Outfit', sans-serif",
        bodyFont: "'Outfit', sans-serif",
        radius: '2px', dark: false
    },
    clinical: {
        name: 'Clinical Emerald',
        description: 'Soft green cards, calm and reassuring tone',
        swatch: ['#059669', '#10b981'],
        accent: '#059669',
        accentSecondary: '#10b981',
        sheetBg: '#ffffff', textColor: '#0f172a', mutedText: '#5f6b66',
        cardBg: '#f0fdf4', border: '#a7f3d0',
        impressionBg: '#ecfdf5', impressionBorder: '#059669',
        headingFont: "'Inter', sans-serif",
        bodyFont: "'Inter', sans-serif",
        radius: '10px', dark: false
    },
    corporate: {
        name: 'Royal Corporate',
        description: 'Indigo, boxed sections, private-hospital polish',
        swatch: ['#4f46e5', '#7c3aed'],
        accent: '#4f46e5',
        accentSecondary: '#7c3aed',
        sheetBg: '#ffffff', textColor: '#0f172a', mutedText: '#635f7a',
        cardBg: '#f5f3ff', border: '#c7d2fe',
        impressionBg: '#eef2ff', impressionBorder: '#4f46e5',
        headingFont: "'Inter', sans-serif",
        bodyFont: "'Inter', sans-serif",
        radius: '12px', dark: false
    },
    midnight: {
        name: 'Midnight Reading',
        description: 'Dark reading-room screen view; prints on white',
        swatch: ['#38bdf8', '#0b1220'],
        accent: '#38bdf8',
        accentSecondary: '#818cf8',
        sheetBg: '#0b1220', textColor: '#e2e8f0', mutedText: '#94a3b8',
        cardBg: '#131c2e', border: '#1f2b41',
        impressionBg: '#0e2338', impressionBorder: '#38bdf8',
        headingFont: "'Inter', sans-serif",
        bodyFont: "'Inter', sans-serif",
        radius: '10px', dark: true
    },
    sandstone: {
        name: 'Warm Sandstone',
        description: 'Terracotta warmth for patient-facing summaries',
        swatch: ['#c2703d', '#92400e'],
        accent: '#c2703d',
        accentSecondary: '#92400e',
        sheetBg: '#fffdfa', textColor: '#292018', mutedText: '#7a6a58',
        cardBg: '#fbf3ea', border: '#eaddcb',
        impressionBg: '#fdf1e6', impressionBorder: '#c2703d',
        headingFont: "'Outfit', sans-serif",
        bodyFont: "'Inter', sans-serif",
        radius: '14px', dark: false
    },
    urgent: {
        name: 'Urgent Crimson',
        description: 'High-alert red for STAT / critical findings',
        swatch: ['#dc2626', '#0f172a'],
        accent: '#dc2626',
        accentSecondary: '#0f172a',
        sheetBg: '#ffffff', textColor: '#0f172a', mutedText: '#64748b',
        cardBg: '#fef2f2', border: '#fecaca',
        impressionBg: '#fef2f2', impressionBorder: '#dc2626',
        headingFont: "'Inter', sans-serif",
        bodyFont: "'Inter', sans-serif",
        radius: '8px', dark: false
    }
};

const sectionBlock = (title, value, options = {}) => {
    if (!String(value || '').trim()) return '';
    return `
        <section class="report-section ${options.important ? 'important-section' : ''}">
            <h2 class="section-title">
                <span class="title-bar"></span>
                <span class="title-text" data-editable="text">${escapeHtml(title)}</span>
            </h2>
            <div class="section-body" data-editable="text">${lineBreaks(String(value).trim())}</div>
        </section>
    `;
};

const buildReportHtml = (report, centerSettings = {}) => {
    const center = normalizeCenterSettings(centerSettings);
    const { standard: sections, customSections } = reportSections(report);

    const styleKey = THEMES[center.templateStyle] ? center.templateStyle : (THEMES[report.template_style] ? report.template_style : 'modern');
    const theme = THEMES[styleKey];
    const primaryColor = /^#[0-9a-f]{6}$/i.test(center.themeColor) ? center.themeColor : theme.accent;
    const bodyFont = center.fontFamily || theme.bodyFont;
    const dir = center.direction;

    const facilityName = [center.center_name, center.branch_name].filter(Boolean).join(' - ');
    const logoText = String(center.center_name || 'Center').trim().slice(0, 4).toUpperCase();
    const finalized = ['Finalized', 'Amended'].includes(report.report_status) || report.report_locked || report.status === 'Finalized';
    const isUrgent = ['STAT', 'Urgent', 'Critical'].includes(report.priority);

    const verificationHash = report.digital_signature_hash || (finalized
        ? `VIARA-VERIFIED-${String(report.exam_id || '').slice(0, 8).toUpperCase()}`
        : 'Pending Signature');

    const rawCatalog = METADATA_CATALOG.map(f => ({
        id: f.id,
        label: center.customLabels[f.id] || f.defaultLabel,
        value: f.getValue(report) || '-'
    }));

    return `<!doctype html>
<html lang="en" dir="${dir}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Diagnostic Report ${escapeHtml(report.order_number || report.exam_id || '')}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800&family=Source+Serif+4:wght@400;600;700&family=Space+Mono:wght@400;700&family=Roboto:wght@400;500;700&display=swap');
        @page { size: A4; margin: 12mm 12mm 16mm; }
        * { box-sizing: border-box; }

        :root {
            --accent: ${primaryColor};
            --accent-2: ${theme.accentSecondary};
            --sheet-bg: ${theme.sheetBg};
            --text: ${theme.textColor};
            --muted: ${theme.mutedText};
            --card-bg: ${theme.cardBg};
            --border: ${theme.border};
            --impression-bg: ${theme.impressionBg};
            --impression-border: ${theme.impressionBorder};
            --radius: ${theme.radius};
            --heading-font: ${theme.headingFont};
            --body-font: ${bodyFont};
            --base-font-size: 12px;
            --line-height: 1.65;
            --section-gap: 20px;
            --card-pad: 12px 14px;
        }

        [data-density="compact"] { --section-gap: 13px; --card-pad: 9px 12px; --base-font-size: 11.5px; --line-height: 1.5; }

        html { color-scheme: ${theme.dark ? 'dark' : 'light'}; }

        body {
            margin: 0;
            background: #1e293b;
            color: var(--text);
            font-family: var(--body-font);
            font-size: var(--base-font-size);
            line-height: var(--line-height);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        a { color: var(--accent); }
        :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

        /* ============ Live Customize Panel ============ */
        .customize-panel {
            position: fixed;
            top: 16px;
            inset-inline-end: 16px;
            z-index: 9999;
            width: 380px;
            max-height: 92vh;
            display: flex;
            flex-direction: column;
            background: rgba(13, 18, 30, 0.96);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 18px;
            color: #f8fafc;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
            font-family: 'Inter', sans-serif;
            transition: width .25s cubic-bezier(.4,0,.2,1), height .25s cubic-bezier(.4,0,.2,1);
        }

        .customize-panel.collapsed { width: 52px; height: 52px; border-radius: 50%; overflow: hidden; }
        .customize-panel.collapsed .cp-header h3 span.cp-title-text { display: none; }
        .customize-panel.collapsed .cp-body, .customize-panel.collapsed .cp-tabs, .customize-panel.collapsed .cp-actions { display: none; }

        .cp-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;
        }
        .cp-header h3 { margin: 0; font-size: 13.5px; font-weight: 800; color: #7dd3fc; display: flex; align-items: center; gap: 8px; }
        .cp-toggle-btn {
            background: rgba(255,255,255,0.08); border: 0; color: #94a3b8; width: 26px; height: 26px;
            border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .cp-toggle-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }

        .cp-tabs { display: flex; gap: 4px; padding: 10px 12px 0; flex-shrink: 0; }
        .cp-tab {
            flex: 1; text-align: center; padding: 7px 4px; border-radius: 8px 8px 0 0; font-size: 10px;
            font-weight: 800; letter-spacing: .04em; text-transform: uppercase; cursor: pointer; color: #94a3b8;
            background: transparent; border: 0; border-bottom: 2px solid transparent;
        }
        .cp-tab.active { color: #fff; border-bottom-color: var(--accent); background: rgba(255,255,255,0.05); }
        .cp-tab:hover { color: #e2e8f0; }

        .cp-body { padding: 14px 16px 4px; overflow-y: auto; flex: 1; }
        .cp-pane { display: none; }
        .cp-pane.active { display: block; }

        .cp-section { margin-bottom: 16px; }
        .cp-label {
            display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px;
            font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8;
        }
        .cp-hint { font-size: 10.5px; color: #64748b; margin: -3px 0 8px; line-height: 1.4; }

        .cp-select, .cp-input {
            width: 100%; height: 36px; background: rgba(30,41,59,0.9); border: 1px solid rgba(255,255,255,0.15);
            border-radius: 8px; padding: 0 10px; color: #f8fafc; font-size: 12px; font-weight: 600; outline: none;
        }
        .cp-select:focus, .cp-input:focus { border-color: var(--accent); }

        .cp-row { display: flex; gap: 8px; align-items: center; }
        .cp-range { width: 100%; accent-color: var(--accent); cursor: pointer; }
        .cp-color-picker { width: 42px; height: 36px; border: 0; border-radius: 8px; padding: 2px; background: transparent; cursor: pointer; }

        /* Template swatch grid */
        .cp-theme-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
        .cp-theme-card {
            text-align: start; padding: 8px; border-radius: 10px; border: 1.5px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.03); cursor: pointer; transition: border-color .15s;
        }
        .cp-theme-card:hover { border-color: rgba(255,255,255,0.3); }
        .cp-theme-card.active { border-color: var(--accent); background: rgba(255,255,255,0.08); }
        .cp-theme-swatch { display: flex; height: 20px; border-radius: 6px; overflow: hidden; margin-bottom: 6px; }
        .cp-theme-swatch span { flex: 1; }
        .cp-theme-card-name { font-size: 11px; font-weight: 800; color: #f1f5f9; }
        .cp-theme-card-desc { font-size: 9.5px; color: #8b95a5; margin-top: 2px; line-height: 1.3; }

        .cp-fields-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; max-height: 200px; overflow-y: auto; padding-inline-end: 4px; }
        .cp-checkbox-label {
            display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.04); padding: 7px 8px;
            border-radius: 6px; font-size: 11px; cursor: pointer; user-select: none;
        }
        .cp-checkbox-label:hover { background: rgba(255,255,255,0.08); }
        .cp-checkbox-label input { accent-color: var(--accent); cursor: pointer; }

        .cp-density-toggle { display: flex; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); }
        .cp-density-toggle button {
            flex: 1; padding: 7px; background: rgba(30,41,59,0.9); color: #cbd5e1; border: 0; font-size: 11px;
            font-weight: 700; cursor: pointer;
        }
        .cp-density-toggle button.active { background: var(--accent); color: #fff; }

        .cp-add-form { display: flex; gap: 6px; margin-top: 6px; }
        .cp-btn-add { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 0 12px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .cp-btn-add:hover { filter: brightness(1.1); }

        .cp-actions { padding: 12px 16px 16px; display: flex; gap: 8px; flex-shrink: 0; border-top: 1px solid rgba(255,255,255,0.08); }
        .cp-btn-print {
            flex: 1; height: 42px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff;
            border: 0; border-radius: 10px; font-size: 12px; font-weight: 800; cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .cp-btn-print:hover { transform: translateY(-1px); }
        .cp-btn-secondary { background: rgba(255,255,255,0.1); color: #f8fafc; border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 0 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .cp-btn-secondary:hover { background: rgba(255,255,255,0.2); }

        /* ============ Report Sheet ============ */
        .page-wrapper { padding: 28px 0 60px; }

        .sheet {
            position: relative; width: 210mm; min-height: 297mm; margin: 0 auto;
            padding: 16mm 16mm 18mm; background: var(--sheet-bg); border-radius: 6px;
            box-shadow: 0 25px 60px rgba(0,0,0,0.35); overflow: hidden; transition: background .2s;
        }
        .sheet::before { content: ""; position: absolute; top: 0; inset-inline: 0; height: 4.5mm; background: linear-gradient(90deg, var(--accent), var(--accent-2)); }
        .sheet.priority-flag::after {
            content: ""; position: absolute; top: 4.5mm; inset-inline-end: 0; width: 3px; height: calc(100% - 4.5mm);
            background: #dc2626;
        }

        .watermark {
            display: ${center.showWatermark ? 'block' : 'none'};
            position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-25deg);
            color: color-mix(in srgb, var(--text) 4%, transparent);
            font-size: 68px; font-weight: 900; letter-spacing: .1em; pointer-events: none;
            text-transform: uppercase; white-space: nowrap;
        }

        header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 2px solid var(--border); }
        .brand-box { display: flex; align-items: center; gap: 14px; }
        .logo-img { max-width: 130px; max-height: 55px; object-fit: contain; }
        .logo-avatar {
            display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: var(--radius);
            background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; font-family: 'Space Mono', monospace;
            font-size: 15px; font-weight: 800; box-shadow: 0 4px 12px rgba(0,0,0,0.2); flex-shrink: 0;
        }
        .brand-details h1 { margin: 0; color: var(--text); font-family: var(--heading-font); font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
        .brand-details p { margin: 3px 0 0; color: var(--muted); font-size: 10px; font-weight: 500; line-height: 1.4; white-space: pre-wrap; }

        .document-tag { text-align: end; flex-shrink: 0; }
        .doc-title-row { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
        .document-tag .doc-title {
            display: inline-block; padding: 3px 10px; border-radius: 20px;
            background: ${finalized ? 'color-mix(in srgb, #059669 15%, var(--card-bg))' : 'color-mix(in srgb, #ea580c 15%, var(--card-bg))'};
            color: ${finalized ? '#059669' : '#c2410c'};
            border: 1px solid ${finalized ? '#a7f3d0' : '#fed7aa'};
            font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
        }
        .document-tag .priority-pill {
            display: ${isUrgent ? 'inline-block' : 'none'}; padding: 3px 9px; border-radius: 20px; background: #dc2626;
            color: #fff; font-size: 9.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
        }
        .document-tag .exam-name { margin-top: 6px; color: var(--text); font-family: var(--heading-font); font-size: 15px; font-weight: 800; }

        .meta-grid { display: grid; gap: 1px; margin-top: 18px; background: var(--border); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
        .meta-item { padding: 10px 14px; background: var(--sheet-bg); position: relative; }
        .meta-item .btn-remove-custom { position: absolute; top: 4px; inset-inline-end: 4px; background: none; border: 0; color: var(--muted); font-size: 12px; cursor: pointer; display: none; }
        .meta-item:hover .btn-remove-custom { display: block; }
        .meta-item .btn-remove-custom:hover { color: #ef4444; }
        .meta-label { display: block; margin-bottom: 3px; color: var(--muted); font-size: 9.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
        .meta-val { display: block; color: var(--text); font-size: 12.5px; font-weight: 700; word-break: break-word; }

        main { margin-top: var(--section-gap); }
        .report-section { margin-top: var(--section-gap); page-break-inside: avoid; break-inside: avoid; }
        .section-title { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-family: var(--heading-font); font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); page-break-after: avoid; break-after: avoid; }
        .title-bar { width: 4px; height: 14px; border-radius: 4px; background-color: var(--accent); flex-shrink: 0; }
        .section-body { padding: var(--card-pad); border: 1px solid var(--border); border-radius: var(--radius); background: var(--card-bg); color: var(--text); font-size: 12.5px; line-height: var(--line-height); white-space: pre-wrap; outline: none; }
        [data-editable="text"][contenteditable="true"] { cursor: text; }
        [contenteditable="true"]:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent) !important; border-color: var(--accent) !important; }

        .report-section.important-section .section-title { color: var(--text); }
        .report-section.important-section .section-body { background: var(--impression-bg); border: 1.5px solid var(--impression-border); color: var(--text); font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }

        .signature-container { display: grid; grid-template-columns: 1fr minmax(220px, .8fr); gap: 20px; margin-top: 32px; padding-top: 20px; border-top: 2px dashed var(--border); page-break-inside: avoid; break-inside: avoid; }
        .sig-details h4 { margin: 0; color: var(--text); font-family: var(--heading-font); font-size: 14px; font-weight: 800; }
        .sig-details p { margin: 3px 0 0; color: var(--muted); font-size: 11px; font-weight: 600; }
        .sig-line { width: 200px; height: 40px; margin-top: 12px; border-bottom: 1px solid var(--muted); }
        .verify-badge { padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card-bg); }
        .verify-badge .v-label { display: block; color: var(--muted); font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
        .verify-badge .v-hash { display: block; margin-top: 4px; color: var(--accent); font-family: 'Space Mono', monospace; font-size: 9.5px; font-weight: 700; word-break: break-all; }

        footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: 9px; font-weight: 600; }

        /* ============ Responsive ============ */
        @media (max-width: 900px) {
            .page-wrapper { padding: 12px 12px 84px !important; }
            .sheet { width: 100% !important; max-width: 100% !important; min-height: auto !important; padding: 20px 16px 24px !important; border-radius: 12px !important; box-shadow: 0 10px 30px rgba(0,0,0,0.3) !important; }
            .customize-panel { top: auto !important; bottom: 12px !important; inset-inline: 12px !important; width: auto !important; max-height: 78vh !important; border-radius: 20px !important; }
            .customize-panel.collapsed { top: auto !important; inset-inline-start: auto !important; bottom: 16px !important; inset-inline-end: 16px !important; width: 50px !important; height: 50px !important; }
        }
        @media (max-width: 640px) {
            header { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
            .document-tag { text-align: start !important; width: 100% !important; display: flex !important; align-items: center !important; justify-content: space-between !important; border-top: 1px dashed var(--border) !important; padding-top: 10px !important; }
            .meta-grid { grid-template-columns: 1fr !important; }
            .signature-container { grid-template-columns: 1fr !important; gap: 16px !important; }
            .sig-line { width: 100% !important; }
            .cp-fields-grid, .cp-theme-grid { grid-template-columns: 1fr !important; }
        }

        @media print {
            :root { --sheet-bg: #ffffff; --text: #0f172a; --muted: #475569; --card-bg: #f8fafc; --border: #e2e8f0; --impression-bg: #ecfeff; }
            body { background: #ffffff !important; }
            .page-wrapper { padding: 0 !important; }
            .sheet { width: 100% !important; min-height: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
            .customize-panel { display: none !important; }
        }
    </style>
</head>
<body data-theme="${styleKey}" data-density="${center.density}">

    <!-- Live Customize Panel (screen-only, hidden on print) -->
    <div class="customize-panel" id="customizePanel" role="region" aria-label="Report style customizer">
        <div class="cp-header">
            <h3>
                <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                <span class="cp-title-text">Report Customizer</span>
            </h3>
            <button type="button" class="cp-toggle-btn" onclick="toggleCustomizePanel()" aria-label="Collapse or expand customizer panel" title="Collapse / Expand">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 12H6"/></svg>
            </button>
        </div>

        <div class="cp-tabs" role="tablist">
            <button type="button" class="cp-tab active" data-pane="style" onclick="switchCpTab('style')" role="tab" aria-selected="true">Style</button>
            <button type="button" class="cp-tab" data-pane="fields" onclick="switchCpTab('fields')" role="tab" aria-selected="false">Fields</button>
            <button type="button" class="cp-tab" data-pane="layout" onclick="switchCpTab('layout')" role="tab" aria-selected="false">Layout</button>
        </div>

        <div class="cp-body">
            <!-- STYLE PANE -->
            <div class="cp-pane active" id="pane-style">
                <div class="cp-section">
                    <span class="cp-label">Template</span>
                    <div class="cp-theme-grid" id="themeGrid"><!-- populated by JS --></div>
                </div>
                <div class="cp-section">
                    <span class="cp-label">Accent Override</span>
                    <div class="cp-row">
                        <input type="color" class="cp-color-picker" id="accentColorPicker" value="${primaryColor}" onchange="changeAccentColor(this.value)" title="Pick a custom accent color" aria-label="Custom accent color">
                        <span class="cp-hint" style="margin:0;">Overrides the template's default accent</span>
                    </div>
                </div>
                <div class="cp-section">
                    <span class="cp-label"><span>Typography</span><span id="fontSizeVal">12px</span></span>
                    <select class="cp-select" id="fontSelect" onchange="changeFontFamily(this.value)" style="margin-bottom:6px;" aria-label="Body font">
                        <option value="theme">Match template</option>
                        <option value="'Inter', sans-serif">Inter — Clean Medical</option>
                        <option value="'Outfit', sans-serif">Outfit — Modern Tech</option>
                        <option value="'Roboto', sans-serif">Roboto — Standard</option>
                        <option value="'Source Serif 4', Georgia, serif">Source Serif — Editorial</option>
                        <option value="'Space Mono', monospace">Space Mono — Digital</option>
                    </select>
                    <input type="range" class="cp-range" min="10" max="16" step="0.5" value="12" oninput="changeFontSize(this.value)" aria-label="Base font size">
                </div>
            </div>

            <!-- FIELDS PANE -->
            <div class="cp-pane" id="pane-fields">
                <div class="cp-section">
                    <span class="cp-label">Visible Metadata</span>
                    <p class="cp-hint">Choose which patient/study details appear in the header grid.</p>
                    <div class="cp-fields-grid" id="fieldsChecklist"><!-- populated by JS --></div>
                </div>
                <div class="cp-section">
                    <span class="cp-label">Add Custom Field</span>
                    <div class="cp-add-form">
                        <input type="text" class="cp-input" id="newFieldName" placeholder="Label (e.g. Insurance)" style="flex:1;" aria-label="Custom field label">
                        <input type="text" class="cp-input" id="newFieldValue" placeholder="Value" style="flex:1;" aria-label="Custom field value">
                        <button type="button" class="cp-btn-add" onclick="handleAddCustomField()">+ Add</button>
                    </div>
                </div>
            </div>

            <!-- LAYOUT PANE -->
            <div class="cp-pane" id="pane-layout">
                <div class="cp-section">
                    <span class="cp-label">Density</span>
                    <div class="cp-density-toggle">
                        <button type="button" class="active" id="densityComfortable" onclick="setDensity('comfortable')">Comfortable</button>
                        <button type="button" id="densityCompact" onclick="setDensity('compact')">Compact</button>
                    </div>
                </div>
                <div class="cp-section">
                    <span class="cp-label">Sections</span>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label class="cp-checkbox-label" style="background: color-mix(in srgb, var(--accent) 18%, transparent); color:#7dd3fc; font-weight:700;">
                            <input type="checkbox" id="toggleDirectEdit" onchange="toggleDirectDocumentEditing(this.checked)">
                            Enable direct text editing on document
                        </label>
                        <label class="cp-checkbox-label"><input type="checkbox" id="toggleHeader" checked onchange="toggleElement('siteHeader', this.checked)"> Show header</label>
                        <label class="cp-checkbox-label"><input type="checkbox" id="toggleFooter" checked onchange="toggleElement('siteFooter', this.checked)"> Show footer</label>
                        <label class="cp-checkbox-label"><input type="checkbox" id="toggleWatermark" ${center.showWatermark ? 'checked' : ''} onchange="toggleElement('siteWatermark', this.checked)"> Show watermark</label>
                        <label class="cp-checkbox-label"><input type="checkbox" id="toggleSignature" checked onchange="toggleElement('siteSignature', this.checked)"> Show digital signature</label>
                    </div>
                </div>
            </div>
        </div>

        <div class="cp-actions">
            <button type="button" class="cp-btn-secondary" onclick="saveUserPreset()">Save Preset</button>
            <button type="button" class="cp-btn-print" onclick="window.print()">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
                Print Report PDF
            </button>
        </div>
    </div>

    <!-- Paper Container -->
    <div class="page-wrapper">
        <div class="sheet ${isUrgent ? 'priority-flag' : ''}" id="reportSheet">
            <div class="watermark" id="siteWatermark">${escapeHtml(logoText)}</div>

            ${center.includeHeader ? `
            <header id="siteHeader">
                <div class="brand-box">
                    ${center.logo_url
                ? `<img class="logo-img" src="${escapeHtml(center.logo_url)}" alt="${escapeHtml(center.center_name)} logo">`
                : `<div class="logo-avatar" id="brandLogoAvatar" aria-hidden="true">${escapeHtml(logoText)}</div>`
            }
                    <div class="brand-details">
                        <h1 id="brandTitle" data-editable="text">${escapeHtml(facilityName)}</h1>
                        <p id="brandSubtitle" data-editable="text">${lineBreaks(reportHeaderText(center))}</p>
                    </div>
                </div>
                <div class="document-tag">
                    <div class="doc-title-row">
                        <span class="priority-pill">${escapeHtml(report.priority || 'STAT')}</span>
                        <span class="doc-title">${escapeHtml(report.report_status || report.status || 'Finalized')}</span>
                    </div>
                    <div class="exam-name">${escapeHtml(report.exam_type_name || report.modality_name || 'Radiology Study')}</div>
                </div>
            </header>
            ` : ''}

            <div class="meta-grid" id="metaGridContainer"><!-- rendered dynamically by JS --></div>

            <main>
                ${sectionBlock('Clinical History', sections.clinicalHistory)}
                ${sectionBlock('Technique & Protocol', sections.technique)}
                ${sectionBlock('Findings', sections.findings)}
                ${sectionBlock('Impression & Conclusion', sections.impression, { important: true })}
                ${sectionBlock('Recommendations', sections.recommendations)}

                ${customSections.map(s => sectionBlock(s.title, s.value)).join('')}

                ${center.includeSignature ? `
                <div class="signature-container" id="siteSignature">
                    <div class="sig-details">
                        <h4 id="sigName" data-editable="text">${escapeHtml(report.digital_signature_name || report.radiologist_name || 'Reporting Radiologist')}</h4>
                        <p id="sigRole" data-editable="text">${escapeHtml(report.digital_signature_role || 'Consultant Radiologist')}</p>
                        <div class="sig-line"></div>
                    </div>
                    <div class="verify-badge">
                        <span class="v-label">Digital Verification Code</span>
                        <strong class="v-hash" id="verifyHashEl">${escapeHtml(verificationHash)}</strong>
                        <span class="v-label" style="margin-top: 8px;">Date Generated</span>
                        <strong class="v-hash">${escapeHtml(formatDate(new Date()))}</strong>
                    </div>
                </div>
                ` : ''}
            </main>

            ${center.includeFooter ? `
            <footer id="siteFooter">
                <div id="footerText" data-editable="text">${escapeHtml(reportFooterText(center))}</div>
                <div>Order #${escapeHtml(report.order_number || report.exam_id || '')}</div>
            </footer>
            ` : ''}
        </div>
    </div>

    <!-- Client-side Interactive Customizer -->
    <script>
        window.THEMES_CONFIG = ${JSON.stringify(THEMES)};
        window.RAW_CATALOG = ${JSON.stringify(rawCatalog)};
        window.activeEnabledIds = ${JSON.stringify(center.enabledFields)};
        window.activeExtraFields = ${JSON.stringify(center.customFields)};
        window.activeThemeKey = ${JSON.stringify(styleKey)};

        window.toggleCustomizePanel = function() {
            var panel = document.getElementById('customizePanel');
            if (panel) panel.classList.toggle('collapsed');
        };

        window.switchCpTab = function(pane) {
            document.querySelectorAll('.cp-tab').forEach(function(t) {
                var active = t.getAttribute('data-pane') === pane;
                t.classList.toggle('active', active);
                t.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            document.querySelectorAll('.cp-pane').forEach(function(p) {
                p.classList.toggle('active', p.id === 'pane-' + pane);
            });
        };

        window.renderThemeGrid = function() {
            var container = document.getElementById('themeGrid');
            if (!container) return;
            container.innerHTML = '';
            Object.keys(window.THEMES_CONFIG).forEach(function(key) {
                var t = window.THEMES_CONFIG[key];
                var card = document.createElement('button');
                card.type = 'button';
                card.className = 'cp-theme-card' + (key === window.activeThemeKey ? ' active' : '');
                card.setAttribute('aria-pressed', key === window.activeThemeKey ? 'true' : 'false');
                card.onclick = function() { window.changeTemplateStyle(key); };
                card.innerHTML =
                    '<span class="cp-theme-swatch"><span style="background:' + t.accent + '"></span><span style="background:' + t.accentSecondary + '"></span></span>' +
                    '<div class="cp-theme-card-name">' + t.name + '</div>' +
                    '<div class="cp-theme-card-desc">' + t.description + '</div>';
                container.appendChild(card);
            });
        };

        window.renderFieldsChecklist = function() {
            var container = document.getElementById('fieldsChecklist');
            if (!container) return;
            container.innerHTML = '';
            window.RAW_CATALOG.forEach(function(item) {
                var checked = window.activeEnabledIds.indexOf(item.id) !== -1 ? 'checked' : '';
                var label = document.createElement('label');
                label.className = 'cp-checkbox-label';
                label.innerHTML = '<input type="checkbox" ' + checked + ' onchange="window.toggleFieldId(\\'' + item.id + '\\', this.checked)"> ' + item.label;
                container.appendChild(label);
            });
        };

        window.toggleFieldId = function(id, checked) {
            if (checked) {
                if (window.activeEnabledIds.indexOf(id) === -1) window.activeEnabledIds.push(id);
            } else {
                window.activeEnabledIds = window.activeEnabledIds.filter(function(x) { return x !== id; });
            }
            window.renderMetaGridDOM();
        };

        window.handleAddCustomField = function() {
            var nameEl = document.getElementById('newFieldName');
            var valEl = document.getElementById('newFieldValue');
            if (!nameEl || !valEl) return;
            var key = nameEl.value.trim();
            var val = valEl.value.trim();
            if (!key || !val) return;
            window.activeExtraFields[key] = val;
            nameEl.value = '';
            valEl.value = '';
            window.renderMetaGridDOM();
        };

        window.removeCustomExtraField = function(key) {
            delete window.activeExtraFields[key];
            window.renderMetaGridDOM();
        };

        window.renderMetaGridDOM = function() {
            var container = document.getElementById('metaGridContainer');
            if (!container) return;

            var itemsToRender = [];
            window.RAW_CATALOG.forEach(function(item) {
                if (window.activeEnabledIds.indexOf(item.id) !== -1) {
                    itemsToRender.push({ label: item.label, value: item.value, isCustom: false });
                }
            });
            Object.keys(window.activeExtraFields).forEach(function(k) {
                var v = window.activeExtraFields[k];
                if (v) itemsToRender.push({ label: k, value: String(v), isCustom: true, key: k });
            });

            if (itemsToRender.length === 0) { container.style.display = 'none'; return; }

            container.style.display = 'grid';
            var cols = itemsToRender.length <= 2 ? 2 : itemsToRender.length === 3 ? 3 : itemsToRender.length <= 4 ? 2 : 3;
            container.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';

            container.innerHTML = '';
            itemsToRender.forEach(function(item) {
                var div = document.createElement('div');
                div.className = 'meta-item';
                if (item.isCustom) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn-remove-custom';
                    btn.innerHTML = '&times;';
                    btn.setAttribute('aria-label', 'Remove ' + item.label + ' field');
                    btn.onclick = function() { window.removeCustomExtraField(item.key); };
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

        window.changeTemplateStyle = function(key) {
            var theme = window.THEMES_CONFIG[key] || window.THEMES_CONFIG.modern;
            window.activeThemeKey = key;
            var root = document.documentElement.style;
            root.setProperty('--accent', theme.accent);
            root.setProperty('--accent-2', theme.accentSecondary);
            root.setProperty('--sheet-bg', theme.sheetBg);
            root.setProperty('--text', theme.textColor);
            root.setProperty('--muted', theme.mutedText);
            root.setProperty('--card-bg', theme.cardBg);
            root.setProperty('--border', theme.border);
            root.setProperty('--impression-bg', theme.impressionBg);
            root.setProperty('--impression-border', theme.impressionBorder);
            root.setProperty('--radius', theme.radius);
            root.setProperty('--heading-font', theme.headingFont);
            var fontSelect = document.getElementById('fontSelect');
            if (fontSelect && fontSelect.value === 'theme') root.setProperty('--body-font', theme.bodyFont);
            document.body.setAttribute('data-theme', key);
            document.documentElement.style.setProperty('color-scheme', theme.dark ? 'dark' : 'light');
            var picker = document.getElementById('accentColorPicker');
            if (picker) picker.value = theme.accent;
            window.renderThemeGrid();
        };

        window.changeAccentColor = function(colorHex) {
            document.documentElement.style.setProperty('--accent', colorHex);
        };

        window.changeFontFamily = function(value) {
            var theme = window.THEMES_CONFIG[window.activeThemeKey] || window.THEMES_CONFIG.modern;
            document.documentElement.style.setProperty('--body-font', value === 'theme' ? theme.bodyFont : value);
        };

        window.changeFontSize = function(px) {
            document.documentElement.style.setProperty('--base-font-size', px + 'px');
            var valEl = document.getElementById('fontSizeVal');
            if (valEl) valEl.innerText = px + 'px';
        };

        window.setDensity = function(mode) {
            document.body.setAttribute('data-density', mode);
            document.getElementById('densityComfortable').classList.toggle('active', mode === 'comfortable');
            document.getElementById('densityCompact').classList.toggle('active', mode === 'compact');
        };

        window.toggleDirectDocumentEditing = function(enabled) {
            document.querySelectorAll('[data-editable="text"]').forEach(function(el) {
                el.contentEditable = enabled ? 'true' : 'false';
            });
        };

        window.toggleElement = function(elementId, visible) {
            var el = document.getElementById(elementId);
            if (el) el.style.display = visible ? '' : 'none';
        };

        window.saveUserPreset = function() {
            var preset = {
                themeKey: window.activeThemeKey,
                activeEnabledIds: window.activeEnabledIds,
                activeExtraFields: window.activeExtraFields,
                accentColor: document.getElementById('accentColorPicker').value,
                fontFamily: document.getElementById('fontSelect').value,
                fontSize: document.getElementById('fontSizeVal').innerText,
                density: document.body.getAttribute('data-density')
            };
            try {
                localStorage.setItem('VIARA_report_preset', JSON.stringify(preset));
                alert('Customized template preset saved successfully!');
            } catch (e) {
                alert('Could not save preset in this browser context.');
            }
        };

        document.addEventListener('DOMContentLoaded', function() {
            window.renderThemeGrid();
            window.renderFieldsChecklist();
            window.renderMetaGridDOM();
        });
        window.renderThemeGrid();
        window.renderFieldsChecklist();
        window.renderMetaGridDOM();
    </script>
</body>
</html>`;
};

export default {
    buildReportHtml,
    THEMES
};
