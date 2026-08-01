import {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Header,
    ImageRun,
    PageNumber,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType
} from 'docx';
import { formatLocalizedDate } from './localizedDate';
import {
    buildReportFooter,
    buildReportHeader,
    getCenterDisplayName,
    normalizeCenterSettings
} from './centerSettings';

const COLORS = {
    ink: '0F172A',
    body: '334155',
    muted: '64748B',
    faint: '94A3B8',
    surface: 'F8FAFC',
    panel: 'F1F5F9',
    border: 'CBD5E1',
    softBorder: 'E2E8F0',
    danger: 'B91C1C',
    dangerFill: 'FEF2F2',
    success: '047857',
    successFill: 'ECFDF5'
};

const STATUS_TONES: Record<string, { fill: string; color: string }> = {
    Finalized: { fill: 'DCFCE7', color: '166534' },
    Amended: { fill: 'FFEDD5', color: '9A3412' },
    Approved: { fill: 'CCFBF1', color: '0F766E' },
    Reviewed: { fill: 'FEF3C7', color: '92400E' },
    Typed: { fill: 'DBEAFE', color: '1D4ED8' },
    Draft: { fill: 'FEE2E2', color: '991B1B' }
};

const NO_BORDERS = {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.NONE },
    insideVertical: { style: BorderStyle.NONE }
};

const border = (color = COLORS.softBorder, size = 1) => ({
    style: BorderStyle.SINGLE,
    size,
    color
});

const GRID_BORDERS = {
    top: border(),
    bottom: border(),
    left: border(),
    right: border(),
    insideHorizontal: border(),
    insideVertical: border()
};

const ROW_RULES = {
    top: border(COLORS.softBorder, 4),
    bottom: border(COLORS.softBorder, 4),
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
    insideHorizontal: border(COLORS.softBorder, 4),
    insideVertical: { style: BorderStyle.NONE }
};

const PANEL_BORDER = {
    top: border(COLORS.softBorder, 4),
    bottom: border(COLORS.softBorder, 4),
    left: border(COLORS.softBorder, 4),
    right: border(COLORS.softBorder, 4),
    insideHorizontal: { style: BorderStyle.NONE },
    insideVertical: border(COLORS.softBorder, 4)
};

const safeFilename = (value: any) => String(value || 'report')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);

const colorHex = (value: any, fallback = '0F766E') => {
    const clean = String(value || '').replace('#', '').toUpperCase();
    return /^[0-9A-F]{6}$/.test(clean) ? clean : fallback;
};

const tintHex = (value: any, amount = 0.92) => {
    const hex = colorHex(value);
    const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    return channels
        .map((channel) => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
};

const normalizeValue = (value: any) => value == null || value === '' ? '-' : String(value);

const formatDate = (value: any, locale?: string, options = { dateStyle: 'medium', timeStyle: 'short' } as Intl.DateTimeFormatOptions) => (
    value ? formatLocalizedDate(value, locale, options) : '-'
);

const formatSignatureHash = (value: any) => {
    const hash = String(value || '').trim();
    return hash ? (hash.match(/.{1,16}/g) || [hash]).join(' ') : '-';
};

const loadLogoRun = async (logoUrl: string | null | undefined) => {
    if (!logoUrl) return null;
    try {
        const response = await fetch(logoUrl);
        if (!response.ok) return null;
        const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
        const extension = String(logoUrl).split('?')[0].split('.').pop()?.toLowerCase();
        const type = contentType.includes('png') || extension === 'png'
            ? 'png'
            : contentType.includes('gif') || extension === 'gif'
                ? 'gif'
                : contentType.includes('bmp') || extension === 'bmp'
                    ? 'bmp'
                    : contentType.includes('jpeg') || contentType.includes('jpg') || ['jpg', 'jpeg'].includes(extension || '')
                        ? 'jpg'
                        : null;
        if (!type) return null;
        return new ImageRun({
            type,
            data: await response.arrayBuffer(),
            transformation: { width: 68, height: 42 },
            altText: {
                title: 'Facility logo',
                description: 'Facility logo',
                name: 'Facility logo'
            }
        });
    } catch {
        return null;
    }
};

export interface ExportReportOptions {
    exam?: any;
    sections?: any;
    centerSettings?: any;
    documentSettings?: any;
    locale?: string;
    t?: any;
}

export const exportReportToWord = async ({
    exam = {},
    sections = {},
    centerSettings,
    documentSettings = {},
    locale = 'en-US',
    t
}: ExportReportOptions) => {
    const rtl = String(locale).toLowerCase().startsWith('ar');
    const startAlignment = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
    const endAlignment = rtl ? AlignmentType.LEFT : AlignmentType.RIGHT;
    const center = normalizeCenterSettings(centerSettings);
    const facilityName = getCenterDisplayName(center);
    const reportHeader = String(
        documentSettings.reportHeader || buildReportHeader(center) || ''
    ).trim();
    const reportFooter = String(
        documentSettings.reportFooter || buildReportFooter(center) || ''
    ).trim().replace(/\s*\r?\n\s*/g, ' | ');
    const themeColor = colorHex(center.print_settings?.themeColor);
    const font = center.print_settings?.fontFamily || 'Aptos';
    const reportStatus = exam.report_status || (exam.report_locked ? 'Finalized' : 'Draft');
    const finalized = Boolean(exam.report_locked || ['Finalized', 'Amended'].includes(reportStatus));
    const includeHeader = documentSettings.includeHeader !== false;
    const includeFooter = documentSettings.includeFooter !== false;
    const includeSignature = documentSettings.includeSignature !== false;
    const statusTone = STATUS_TONES[reportStatus] || STATUS_TONES.Draft;
    const logoRun = includeHeader ? await loadLogoRun(center.logo_url) : null;
    const logoText = String(center.center_name || 'RCMS').trim().slice(0, 4).toUpperCase();
    const tr = (key: string, fallback: string) => typeof t === 'function'
        ? t(key, { defaultValue: fallback })
        : fallback;

    const labels = {
        subtitle: tr('editor.word.subtitle', 'Diagnostic Imaging Report'),
        confidential: tr('editor.word.confidential', 'Confidential medical record'),
        draft: tr('editor.word.draft', 'DRAFT - NOT YET SIGNED'),
        patient: tr('details.patientName', 'Patient name'),
        mrn: tr('details.mrn', 'MRN'),
        dob: tr('editor.word.dob', 'Date of birth'),
        age: tr('details.age', 'Age'),
        gender: tr('editor.word.gender', 'Gender'),
        accession: tr('details.accessionNumber', 'Accession / order'),
        examination: tr('details.examination', 'Examination'),
        modality: tr('details.modality', 'Modality'),
        bodyPart: tr('details.bodyPart', 'Body part'),
        studyDate: tr('details.studyDate', 'Study date'),
        priority: tr('details.priority', 'Priority'),
        referrer: tr('details.referrer', 'Referring doctor'),
        radiologist: tr('details.radiologist', 'Radiologist'),
        clinicalHistory: tr('sections.clinicalHistory', 'Clinical History'),
        technique: tr('sections.technique', 'Technique'),
        findings: tr('sections.findings', 'Findings'),
        impression: tr('sections.impression', 'Impression'),
        recommendations: tr('sections.recommendations', 'Recommendations'),
        authentication: tr('editor.word.signature', 'Authentication'),
        signedBy: tr('editor.word.signedBy', 'Reported by'),
        signedAt: tr('editor.word.signedAt', 'Signed at'),
        verification: tr('editor.word.electronic', 'Electronic verification'),
        verified: tr('editor.word.verified', 'Digitally signed and verified'),
        notSigned: tr('editor.word.notSigned', 'This report is not final and has not been signed.'),
        generated: tr('editor.word.generated', 'Generated'),
        page: tr('editor.word.page', 'Page'),
        of: tr('editor.word.of', 'of')
    };

    const statusText = tr(`statuses.${reportStatus}`, reportStatus);
    const priorityText = tr(`priorities.${exam.priority || 'Routine'}`, exam.priority || 'Routine');
    const examinationName = exam.exam_type_name || exam.modality_name || labels.subtitle;
    const radiologistName = exam.digital_signature_name || exam.radiologist_name || '-';
    const signedAt = exam.report_locked_at || exam.report_finalized_at || exam.amended_at;
    const patientAge = exam.patient_age || exam.age;
    const patientDob = exam.date_of_birth
        ? formatDate(exam.date_of_birth, locale, { dateStyle: 'medium' })
        : '';
    const ageDobLabel = patientAge && patientDob
        ? `${labels.age} / ${labels.dob}`
        : patientAge
            ? labels.age
            : labels.dob;
    const ageDobValue = [patientAge, patientDob].filter(Boolean).join(' / ') || '-';

    const run = (value: any, options: any = {}) => new TextRun({
        text: normalizeValue(value),
        font: options.font || font,
        size: options.size || 20,
        color: options.color || COLORS.body,
        bold: options.bold,
        italics: options.italics,
        allCaps: options.allCaps,
        break: options.break,
        rightToLeft: rtl
    });

    const paragraph = (children: any, options: any = {}) => new Paragraph({
        children: Array.isArray(children) ? children : [children],
        alignment: options.alignment || startAlignment,
        bidirectional: rtl,
        spacing: options.spacing || { after: 70, line: 300 },
        border: options.border,
        shading: options.shading,
        keepNext: options.keepNext,
        keepLines: options.keepLines,
        indent: options.indent
    });

    const cell = (children: any, options: any = {}) => new TableCell({
        width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
        columnSpan: options.columnSpan,
        borders: options.borders || GRID_BORDERS,
        shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
        margins: options.margins || { top: 125, bottom: 125, left: 150, right: 150 },
        verticalAlign: options.verticalAlign,
        children: Array.isArray(children) ? children : [children]
    });

    const multilineRuns = (value: any, options: any = {}) => {
        const lines = String(value || '').split(/\r?\n/).filter(Boolean);
        return (lines.length ? lines : ['-']).map((line, index) => run(line, {
            ...options,
            break: index > 0 ? 1 : undefined
        }));
    };

    const richLineRuns = (value: any, options: any = {}) => {
        let line = String(value || '').trim();
        const isBullet = /^(?:\u2022|[-*])\s+/.test(line);
        if (isBullet) line = line.replace(/^(?:\u2022|[-*])\s+/, '');
        const output: any[] = isBullet ? [run('\u2022 ', { ...options, bold: true })] : [];
        const parts = line.split('**');
        parts.forEach((part, index) => {
            if (part) output.push(run(part, { ...options, bold: options.bold || index % 2 === 1 }));
        });
        return output.length ? output : [run(' ', options)];
    };

    const infoCell = (label: string, value: any, options: any = {}) => cell([
        paragraph(run(label, { size: 14, color: COLORS.muted, bold: true, allCaps: true }), {
            spacing: { after: 30 },
            keepNext: true
        }),
        paragraph(run(value, {
            size: options.compact ? 18 : 19,
            color: options.valueColor || COLORS.ink,
            bold: options.bold
        }), { spacing: { after: 0 }, keepLines: true })
    ], {
        width: options.width || 25,
        columnSpan: options.columnSpan,
        fill: options.fill,
        borders: options.borders || NO_BORDERS,
        margins: options.margins || { top: 110, bottom: 110, left: 0, right: 150 }
    });

    const sectionHeading = (title: string, important = false) => paragraph(
        run(title, {
            size: 18,
            color: important ? themeColor : COLORS.ink,
            bold: true,
            allCaps: true
        }),
        {
            spacing: { before: 230, after: 65 },
            keepNext: true,
            border: {
                bottom: border(important ? themeColor : COLORS.softBorder, important ? 8 : 4)
            }
        }
    );

    const sectionBlock = (title: string, value: any, options: any = {}) => {
        if (!String(value || '').trim()) return [];
        const lines = String(value).trim().split(/\r?\n/);
        const content = lines.map((line) => paragraph(
            richLineRuns(line, {
                size: options.important ? 22 : 21,
                color: options.important ? COLORS.ink : COLORS.body,
                bold: false
            }),
            {
                spacing: { after: 75, line: 330 },
                keepLines: true
            }
        ));

        if (!options.important) return [sectionHeading(title), ...content];

        return [
            sectionHeading(title, true),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: NO_BORDERS,
                rows: [new TableRow({
                    children: [cell(content, {
                        width: 100,
                        fill: tintHex(themeColor),
                        borders: {
                            top: { style: BorderStyle.NONE },
                            bottom: { style: BorderStyle.NONE },
                            left: rtl ? { style: BorderStyle.NONE } : border(themeColor, 18),
                            right: rtl ? border(themeColor, 18) : { style: BorderStyle.NONE }
                        },
                        margins: { top: 150, bottom: 140, left: 200, right: 200 }
                    })]
                })]
            })
        ];
    };

    const headerDetails = reportHeader
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && line.toLowerCase() !== facilityName.toLowerCase())
        .join('\n');

    const header = includeHeader ? new Header({
        children: [new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                ...NO_BORDERS,
                bottom: border(themeColor, 8)
            },
            rows: [new TableRow({
                children: [
                    cell(paragraph(
                        logoRun || run(logoText, { size: 24, color: 'FFFFFF', bold: true }),
                        { alignment: AlignmentType.CENTER, spacing: { after: 0 } }
                    ), {
                        width: 12,
                        fill: logoRun ? 'FFFFFF' : themeColor,
                        borders: NO_BORDERS,
                        margins: { top: 125, bottom: 125, left: 80, right: 80 }
                    }),
                    cell([
                        paragraph(run(facilityName, { size: 24, color: COLORS.ink, bold: true }), {
                            spacing: { after: headerDetails ? 28 : 0 },
                            keepLines: true
                        }),
                        ...(headerDetails ? [paragraph(multilineRuns(headerDetails, { size: 15, color: COLORS.muted }), {
                            spacing: { after: 0, line: 230 },
                            keepLines: true
                        })] : [])
                    ], {
                        width: 60,
                        borders: NO_BORDERS,
                        margins: { top: 70, bottom: 80, left: 150, right: 150 }
                    }),
                    cell([
                        paragraph(run(labels.subtitle, { size: 14, color: COLORS.muted, bold: true, allCaps: true }), {
                            alignment: endAlignment,
                            spacing: { after: 35 }
                        }),
                        paragraph(run(exam.order_number || exam.exam_id, { size: 18, color: themeColor, bold: true }), {
                            alignment: endAlignment,
                            spacing: { after: 0 },
                            keepLines: true
                        })
                    ], {
                        width: 28,
                        fill: COLORS.surface,
                        borders: NO_BORDERS,
                        margins: { top: 115, bottom: 115, left: 130, right: 130 }
                    })
                ]
            })]
        })]
    }) : undefined;

    const footer = includeFooter ? new Footer({
        children: [new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { ...NO_BORDERS, top: border(COLORS.softBorder, 4) },
            rows: [new TableRow({
                children: [
                    cell(paragraph(run([
                        reportFooter || labels.confidential,
                        `${labels.generated}: ${formatDate(new Date(), locale)}`
                    ].filter(Boolean).join(' | '), { size: 14, color: COLORS.muted }), {
                        spacing: { after: 0 },
                        keepLines: true
                    }), {
                        width: 72,
                        borders: NO_BORDERS,
                        margins: { top: 95, bottom: 0, left: 0, right: 120 }
                    }),
                    cell(paragraph([
                        run(`${labels.page} `, { size: 14, color: COLORS.muted }),
                        PageNumber.CURRENT,
                        run(` ${labels.of} `, { size: 14, color: COLORS.muted }),
                        PageNumber.TOTAL_PAGES
                    ], {
                        alignment: endAlignment,
                        spacing: { after: 0 }
                    }), {
                        width: 28,
                        borders: NO_BORDERS,
                        margins: { top: 95, bottom: 0, left: 120, right: 0 }
                    })
                ]
            })]
        })]
    }) : undefined;

    const titleBlock = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        rows: [new TableRow({
            children: [
                cell([
                    paragraph(run(examinationName, { size: 30, color: COLORS.ink, bold: true }), {
                        spacing: { after: 40 },
                        keepLines: true
                    }),
                    paragraph(run(labels.confidential, { size: 15, color: COLORS.muted }), {
                        spacing: { after: 0 }
                    })
                ], {
                    width: 73,
                    borders: NO_BORDERS,
                    margins: { top: 120, bottom: 110, left: 0, right: 160 }
                }),
                cell(paragraph([
                    run('● ', { size: 12, color: statusTone.color }),
                    run(statusText, {
                        size: 16,
                        color: statusTone.color,
                        bold: true,
                        allCaps: true
                    })
                ], {
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    keepLines: true
                }), {
                    width: 27,
                    fill: statusTone.fill,
                    borders: NO_BORDERS,
                    margins: { top: 120, bottom: 120, left: 100, right: 100 }
                })
            ]
        })]
    });

    const identityGrid = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: ROW_RULES,
        rows: [
            new TableRow({ children: [
                infoCell(labels.patient, exam.patient_name, { width: 50, columnSpan: 2, bold: true }),
                infoCell(labels.mrn, exam.mrn, { width: 25, bold: true }),
                infoCell(ageDobLabel, ageDobValue, { width: 25, compact: true })
            ] }),
            new TableRow({ children: [
                infoCell(labels.accession, exam.order_number || exam.accession_number || exam.exam_id, { width: 25, compact: true }),
                infoCell(labels.studyDate, formatDate(exam.start_time || exam.created_at, locale), { width: 25, compact: true }),
                infoCell(labels.modality, exam.modality_type || exam.modality_name, { width: 25 }),
                infoCell(labels.priority, priorityText, { width: 25 })
            ] }),
            new TableRow({ children: [
                infoCell(labels.examination, examinationName, { width: 50, columnSpan: 2, bold: true }),
                infoCell(labels.bodyPart, exam.body_part, { width: 25 }),
                infoCell(labels.gender, exam.patient_sex || exam.gender, { width: 25 })
            ] }),
            new TableRow({ children: [
                infoCell(labels.referrer, exam.referring_doctor_name, { width: 50, columnSpan: 2, compact: true }),
                infoCell(labels.radiologist, radiologistName, { width: 50, columnSpan: 2, compact: true })
            ] })
        ]
    });

    const signatureChildren = includeSignature ? [
        sectionHeading(labels.authentication),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: PANEL_BORDER,
            rows: [new TableRow({
                children: [
                    cell([
                        paragraph(run(labels.signedBy, { size: 15, color: COLORS.muted, bold: true, allCaps: true }), {
                            spacing: { after: 40 }
                        }),
                        paragraph(run(radiologistName, { size: 21, color: COLORS.ink, bold: true }), {
                            spacing: { after: exam.digital_signature_role ? 28 : 0 },
                            keepLines: true
                        }),
                        ...(exam.digital_signature_role ? [paragraph(run(exam.digital_signature_role, {
                            size: 16,
                            color: COLORS.muted
                        }), { spacing: { after: 0 } })] : [])
                    ], {
                        width: 48,
                        fill: 'FFFFFF',
                        borders: NO_BORDERS,
                        margins: { top: 150, bottom: 150, left: 170, right: 170 }
                    }),
                    cell([
                        paragraph(run(labels.verification, { size: 15, color: COLORS.muted, bold: true, allCaps: true }), {
                            spacing: { after: 40 }
                        }),
                        paragraph(run(finalized ? labels.verified : labels.notSigned, {
                            size: 18,
                            color: finalized ? COLORS.success : COLORS.danger,
                            bold: true
                        }), { spacing: { after: finalized ? 35 : 0 }, keepLines: true }),
                        ...(finalized ? [
                            paragraph(run(`${labels.signedAt}: ${formatDate(signedAt, locale)}`, {
                                size: 15,
                                color: COLORS.muted
                            }), { spacing: { after: 30 } }),
                            paragraph(run(formatSignatureHash(exam.digital_signature_hash), {
                                size: 13,
                                color: COLORS.faint,
                                font: 'Consolas'
                            }), { spacing: { after: 0, line: 240 }, keepLines: true })
                        ] : [])
                    ], {
                        width: 52,
                        fill: finalized ? COLORS.successFill : COLORS.dangerFill,
                        borders: NO_BORDERS,
                        margins: { top: 150, bottom: 150, left: 170, right: 170 }
                    })
                ]
            })]
        })
    ] : [];

    const documentChildren = [
        ...(!finalized ? [new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            rows: [new TableRow({
                children: [cell(paragraph(run(labels.draft, {
                    size: 17,
                    color: COLORS.danger,
                    bold: true,
                    allCaps: true
                }), {
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 }
                }), {
                    width: 100,
                    fill: COLORS.dangerFill,
                    borders: {
                        top: border('FCA5A5', 4),
                        bottom: border('FCA5A5', 4),
                        left: border('FCA5A5', 4),
                        right: border('FCA5A5', 4)
                    },
                    margins: { top: 90, bottom: 90, left: 120, right: 120 }
                })]
            })]
        })] : []),
        titleBlock,
        identityGrid,
        ...sectionBlock(labels.clinicalHistory, sections.clinicalHistory || exam.clinical_indication),
        ...sectionBlock(labels.technique, sections.technique),
        ...sectionBlock(labels.findings, sections.findings),
        ...sectionBlock(labels.impression, sections.impression, { important: true }),
        ...sectionBlock(labels.recommendations, sections.recommendations),
        ...signatureChildren
    ];

    const wordDocument = new Document({
        creator: radiologistName === '-' ? facilityName : radiologistName,
        title: `${labels.subtitle} - ${exam.order_number || exam.exam_id || exam.mrn || ''}`,
        subject: examinationName,
        description: labels.confidential,
        keywords: 'radiology, diagnostic imaging, medical report',
        styles: {
            default: {
                document: {
                    run: { font, size: 20, color: COLORS.body },
                    paragraph: { spacing: { line: 300, after: 60 } }
                }
            }
        },
        sections: [{
            properties: {
                page: {
                    margin: { top: 850, right: 900, bottom: 820, left: 900 },
                    size: { width: 11906, height: 16838 }
                }
            },
            ...(header ? { headers: { default: header } } : {}),
            ...(footer ? { footers: { default: footer } } : {}),
            children: documentChildren
        }]
    });

    const blob = await Packer.toBlob(wordDocument);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFilename(exam.order_number || exam.mrn || exam.exam_id)}-${safeFilename(labels.subtitle)}.docx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};
