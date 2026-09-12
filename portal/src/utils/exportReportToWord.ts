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
    slateDark: '1E293B',
    body: '334155',
    muted: '64748B',
    faint: '94A3B8',
    surface: 'F8FAFC',
    panel: 'F1F5F9',
    border: 'CBD5E1',
    softBorder: 'E2E8F0',
    brandTeal: '0F766E',
    brandTealDark: '115E59',
    brandTealSoft: 'F0FDFA',
    brandEmerald: '047857',
    danger: 'B91C1C',
    dangerFill: 'FEF2F2',
    dangerBorder: 'FECACA',
    warning: 'B45309',
    warningFill: 'FFFBEB',
    success: '047857',
    successFill: 'ECFDF5',
    successBorder: 'A7F3D0'
};

const STATUS_TONES: Record<string, { fill: string; color: string; label: string }> = {
    Finalized: { fill: 'DCFCE7', color: '166534', label: 'FINALIZED' },
    Amended: { fill: 'FFEDD5', color: '9A3412', label: 'AMENDED' },
    Approved: { fill: 'CCFBF1', color: '0F766E', label: 'APPROVED' },
    Reviewed: { fill: 'FEF3C7', color: '92400E', label: 'REVIEWED' },
    Typed: { fill: 'DBEAFE', color: '1D4ED8', label: 'TYPED' },
    Draft: { fill: 'FEE2E2', color: '991B1B', label: 'DRAFT' }
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
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);

const colorHex = (value: any, fallback = '0F766E') => {
    const clean = String(value || '').replace('#', '').toUpperCase();
    return /^[0-9A-F]{6}$/.test(clean) ? clean : fallback;
};

const tintHex = (value: any, amount = 0.93) => {
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
            transformation: { width: 72, height: 44 },
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
    const themeColor = colorHex(center.print_settings?.themeColor, '0F766E');
    const font = rtl ? (center.print_settings?.fontFamily || 'Segoe UI') : (center.print_settings?.fontFamily || 'Aptos');
    const reportStatus = exam.report_status || (exam.report_locked ? 'Finalized' : 'Draft');
    const finalized = Boolean(exam.report_locked || ['Finalized', 'Amended'].includes(reportStatus));
    const includeHeader = documentSettings.includeHeader !== false;
    const includeFooter = documentSettings.includeFooter !== false;
    const includeSignature = documentSettings.includeSignature !== false;
    const statusTone = STATUS_TONES[reportStatus] || STATUS_TONES.Draft;
    const logoRun = includeHeader ? await loadLogoRun(center.logo_url) : null;
    const logoText = String(center.center_name || 'VIARA').trim().slice(0, 4).toUpperCase();
    const tr = (key: string, fallback: string) => typeof t === 'function'
        ? t(key, { defaultValue: fallback })
        : fallback;

    const labels = {
        subtitle: tr('editor.word.subtitle', rtl ? 'تقرير الفحص الشعاعي التشخيصي' : 'Diagnostic Imaging Report'),
        confidential: tr('editor.word.confidential', rtl ? 'سجل طبي سري ومحمي قانونياً' : 'Confidential Medical Record'),
        draft: tr('editor.word.draft', rtl ? 'مسودة غير معتمدة — لم يتم التوقيع بعد' : 'DRAFT - NOT YET SIGNED'),
        patient: tr('details.patientName', rtl ? 'اسم المريض' : 'Patient Name'),
        mrn: tr('details.mrn', rtl ? 'الرقم الطبي (MRN)' : 'MRN'),
        nationalId: tr('details.nationalId', rtl ? 'الرقم القومي / الهوية' : 'National ID'),
        dob: tr('editor.word.dob', rtl ? 'تاريخ الميلاد' : 'Date of Birth'),
        age: tr('details.age', rtl ? 'العمر' : 'Age'),
        gender: tr('editor.word.gender', rtl ? 'الجنس' : 'Gender'),
        accession: tr('details.accessionNumber', rtl ? 'رقم الطلب / الفحص' : 'Accession / Order #'),
        examination: tr('details.examination', rtl ? 'نوع الفحص' : 'Examination'),
        modality: tr('details.modality', rtl ? 'الجهاز / التقنية' : 'Modality'),
        bodyPart: tr('details.bodyPart', rtl ? 'العضو / المنطقة' : 'Body Region'),
        studyDate: tr('details.studyDate', rtl ? 'تاريخ الفحص' : 'Study Date'),
        priority: tr('details.priority', rtl ? 'الأولوية' : 'Priority'),
        referrer: tr('details.referrer', rtl ? 'الطبيب المعالج' : 'Referring Physician'),
        radiologist: tr('details.radiologist', rtl ? 'طبيب الأشعة المشخص' : 'Reporting Radiologist'),
        clinicalHistory: tr('sections.clinicalHistory', rtl ? 'التاريخ المرضي والشكوى السريرية' : 'Clinical History & Indication'),
        technique: tr('sections.technique', rtl ? 'التقنية والبروتوكول المستخدم' : 'Technique & Protocol'),
        comparison: tr('sections.comparison', rtl ? 'المقارنة مع دراسات سابقة' : 'Comparison Studies'),
        findings: tr('sections.findings', rtl ? 'النتائج والمشاهدات التفصيلية' : 'Findings & Observations'),
        impression: tr('sections.impression', rtl ? 'الخلاصة والتشخيص النهائي' : 'Impression & Conclusion'),
        recommendations: tr('sections.recommendations', rtl ? 'التوصيات والمتابعة' : 'Recommendations & Follow-up'),
        authentication: tr('editor.word.signature', rtl ? 'الاعتماد والتوقيع الإلكتروني' : 'Electronic Authentication & Verification'),
        signedBy: tr('editor.word.signedBy', rtl ? 'طبيب الأشعة المعتمد' : 'Reported By'),
        signedAt: tr('editor.word.signedAt', rtl ? 'تاريخ ووقت الاعتماد' : 'Signed At'),
        verification: tr('editor.word.electronic', rtl ? 'حالة التوثيق الرقمي' : 'Digital Verification'),
        verified: tr('editor.word.verified', rtl ? 'تم التحقق والتوقيع الرقمي بنجاح' : 'Digitally signed and verified'),
        notSigned: tr('editor.word.notSigned', rtl ? 'هذا التقرير مسودة أولية وغير موقع بعد.' : 'This report is a preliminary draft and has not been finalized or signed.'),
        generated: tr('editor.word.generated', rtl ? 'تاريخ الإصدار' : 'Generated'),
        page: tr('editor.word.page', rtl ? 'صفحة' : 'Page'),
        of: tr('editor.word.of', rtl ? 'من' : 'of')
    };

    const statusText = tr(`statuses.${reportStatus}`, statusTone.label);
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
        borders: options.borders || NO_BORDERS,
        shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
        margins: options.margins || { top: 120, bottom: 120, left: 140, right: 140 },
        verticalAlign: options.verticalAlign,
        children: Array.isArray(children) ? children : [children]
    });

    const richLineRuns = (value: any, options: any = {}) => {
        let line = String(value || '').trim();
        const isBullet = /^(?:•|[-*])\s+/.test(line);
        if (isBullet) line = line.replace(/^(?:•|[-*])\s+/, '');
        const output = isBullet ? [run('•  ', { ...options, bold: true, color: themeColor })] : [];

        const parts = line.split('**');
        parts.forEach((part, index) => {
            if (part) output.push(run(part, { ...options, bold: options.bold || index % 2 === 1 }));
        });
        return output.length ? output : [run(' ', options)];
    };

    const infoCell = (label: string, value: any, options: any = {}) => cell([
        paragraph(run(label, { size: 14, color: COLORS.muted, bold: true, allCaps: true }), {
            spacing: { after: 25 },
            keepNext: true
        }),
        paragraph(run(value, {
            size: options.compact ? 18 : 19,
            color: options.valueColor || COLORS.ink,
            bold: options.bold != null ? options.bold : true
        }), { spacing: { after: 0 }, keepLines: true })
    ], {
        width: options.width || 25,
        columnSpan: options.columnSpan,
        fill: options.fill,
        borders: options.borders || NO_BORDERS,
        margins: options.margins || { top: 100, bottom: 100, left: 0, right: 140 }
    });

    const sectionHeading = (title: string, important = false) => paragraph(
        [
            run(title, {
                size: 19,
                color: important ? themeColor : COLORS.ink,
                bold: true,
                allCaps: true
            })
        ],
        {
            spacing: { before: 240, after: 70 },
            keepNext: true,
            border: {
                bottom: border(important ? themeColor : COLORS.softBorder, important ? 10 : 4)
            }
        }
    );

    const sectionBlock = (title: string, value: any, options: any = {}) => {
        if (!String(value || '').trim()) return [];
        const lines = String(value).trim().split(/\r?\n/).filter(line => line.trim().length > 0);
        const content = lines.map((line) => paragraph(
            richLineRuns(line, {
                size: options.important ? 22 : 21,
                color: options.important ? COLORS.ink : COLORS.body,
                bold: options.important && lines.length === 1
            }),
            {
                spacing: { after: 70, line: 320 },
                keepLines: true
            }
        ));

        if (!options.important) {
            return [
                sectionHeading(title),
                ...content
            ];
        }

        return [
            sectionHeading(title, true),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: NO_BORDERS,
                rows: [new TableRow({
                    children: [cell(content, {
                        width: 100,
                        fill: tintHex(themeColor, 0.94),
                        borders: {
                            top: { style: BorderStyle.NONE },
                            bottom: { style: BorderStyle.NONE },
                            left: rtl ? { style: BorderStyle.NONE } : border(themeColor, 20),
                            right: rtl ? border(themeColor, 20) : { style: BorderStyle.NONE }
                        },
                        margins: { top: 150, bottom: 140, left: 180, right: 180 }
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
                        margins: { top: 110, bottom: 110, left: 60, right: 60 }
                    }),
                    cell([
                        paragraph(run(facilityName, { size: 24, color: COLORS.ink, bold: true }), {
                            spacing: { after: headerDetails ? 24 : 0 },
                            keepLines: true
                        }),
                        ...(headerDetails ? [paragraph(
                            headerDetails.split('\n').map((line, idx) => run(line, {
                                size: 15,
                                color: COLORS.muted,
                                break: idx > 0 ? 1 : undefined
                            })),
                            { spacing: { after: 0, line: 220 }, keepLines: true }
                        )] : [])
                    ], {
                        width: 60,
                        borders: NO_BORDERS,
                        margins: { top: 70, bottom: 70, left: 140, right: 140 }
                    }),
                    cell([
                        paragraph(run(labels.subtitle, { size: 14, color: COLORS.muted, bold: true, allCaps: true }), {
                            alignment: endAlignment,
                            spacing: { after: 30 }
                        }),
                        paragraph(run(exam.order_number || exam.accession_number || exam.exam_id, { size: 18, color: themeColor, bold: true }), {
                            alignment: endAlignment,
                            spacing: { after: 0 },
                            keepLines: true
                        })
                    ], {
                        width: 28,
                        fill: COLORS.surface,
                        borders: NO_BORDERS,
                        margins: { top: 100, bottom: 100, left: 120, right: 120 }
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
                        margins: { top: 90, bottom: 0, left: 0, right: 120 }
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
                        margins: { top: 90, bottom: 0, left: 120, right: 0 }
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
                        spacing: { after: 30 },
                        keepLines: true
                    }),
                    paragraph(run(labels.confidential, { size: 15, color: COLORS.muted }), {
                        spacing: { after: 0 }
                    })
                ], {
                    width: 74,
                    borders: NO_BORDERS,
                    margins: { top: 120, bottom: 100, left: 0, right: 160 }
                }),
                cell(paragraph([
                    run('● ', { size: 13, color: statusTone.color }),
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
                    width: 26,
                    fill: statusTone.fill,
                    borders: NO_BORDERS,
                    margins: { top: 110, bottom: 110, left: 80, right: 80 }
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
                            spacing: { after: 35 }
                        }),
                        paragraph(run(radiologistName, { size: 21, color: COLORS.ink, bold: true }), {
                            spacing: { after: exam.digital_signature_role ? 25 : 0 },
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
                        margins: { top: 140, bottom: 140, left: 160, right: 160 }
                    }),
                    cell([
                        paragraph(run(labels.verification, { size: 15, color: COLORS.muted, bold: true, allCaps: true }), {
                            spacing: { after: 35 }
                        }),
                        paragraph(run(finalized ? labels.verified : labels.notSigned, {
                            size: 18,
                            color: finalized ? COLORS.success : COLORS.danger,
                            bold: true
                        }), { spacing: { after: finalized ? 30 : 0 }, keepLines: true }),
                        ...(finalized ? [
                            paragraph(run(`${labels.signedAt}: ${formatDate(signedAt, locale)}`, {
                                size: 15,
                                color: COLORS.muted
                            }), { spacing: { after: 25 } }),
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
                        margins: { top: 140, bottom: 140, left: 160, right: 160 }
                    })
                ]
            })]
        })
    ] : [];

    const customSectionBlocks: any[] = [];
    const standardKeys = ['clinicalHistory', 'technique', 'comparison', 'findings', 'impression', 'recommendations'];
    const mergedSections = {
        ...(exam.report_sections || {}),
        ...(sections || {})
    };
    Object.entries(mergedSections).forEach(([key, val]) => {
        if (!standardKeys.includes(key) && val && String(val).trim()) {
            const readableTitle = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
            customSectionBlocks.push(...sectionBlock(readableTitle, val));
        }
    });

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
        ...sectionBlock(labels.clinicalHistory, mergedSections.clinicalHistory || exam.clinical_indication),
        ...sectionBlock(labels.technique, mergedSections.technique),
        ...sectionBlock(labels.comparison, mergedSections.comparison),
        ...sectionBlock(labels.findings, mergedSections.findings),
        ...sectionBlock(labels.impression, mergedSections.impression, { important: true }),
        ...sectionBlock(labels.recommendations, mergedSections.recommendations),
        ...customSectionBlocks,
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
    anchor.download = `${safeFilename(exam.patient_name || 'Patient')}_${safeFilename(exam.exam_type_name || labels.subtitle)}_${safeFilename(exam.order_number || exam.mrn || exam.exam_id)}.docx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};
