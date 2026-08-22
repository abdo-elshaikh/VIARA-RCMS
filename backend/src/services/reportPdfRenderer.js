const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const {
    normalizeCenterSettings,
    reportSections,
    formatDate,
    formatDateOnly,
    reportHeaderText,
    reportFooterText,
    detectClinicalContentMismatch,
    buildVerificationPayload,
} = require('./pdfService');

const COLORS = {
    navy: '#0B2348',
    emerald: '#087F5B',
    emeraldDark: '#056247',
    emeraldSoft: '#E8F6F1',
    ink: '#13233A',
    muted: '#687A91',
    line: '#D9E5E2',
    surface: '#F6F9F8',
    amber: '#B45309',
    amberSoft: '#FFF7E6',
    white: '#FFFFFF',
};

const PAGE = { width: 595.28, height: 841.89, marginX: 48, top: 46, bottom: 58 };
const CONTENT_WIDTH = PAGE.width - (PAGE.marginX * 2);

const plainText = (value = '') => String(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const decodeDataImage = (value) => {
    const match = String(value || '').match(/^data:image\/(?:png|jpe?g);base64,(.+)$/i);
    if (!match) return null;
    try { return Buffer.from(match[1], 'base64'); } catch { return null; }
};

const cleanFilenamePart = (value) => String(value || '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const buildReportPdf = async (report, centerSettings = {}) => {
    const center = normalizeCenterSettings(centerSettings, report);
    const { standard, customSections } = reportSections(report);
    const title = plainText(report.exam_type_name || report.procedure_name || report.modality_name || 'Diagnostic Imaging Report');
    const mismatch = detectClinicalContentMismatch(title, standard);
    const verificationHash = report.digital_signature_hash || 'PENDING';
    const verificationPayload = buildVerificationPayload(report, verificationHash);
    const qrBuffer = await QRCode.toBuffer(verificationPayload, {
        type: 'png',
        width: 220,
        margin: 1,
        color: { dark: COLORS.navy, light: COLORS.white },
    });

    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.marginX, right: PAGE.marginX },
        bufferPages: true,
        info: {
            Title: `Diagnostic Report - ${report.order_number || report.mrn || report.exam_id || ''}`,
            Author: center.center_name || 'Diagnostic Imaging Center',
            Subject: title,
            Keywords: 'diagnostic imaging, medical report, radiology',
        },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const completed = new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    const addPageFrame = () => {
        doc.save();
        doc.rect(0, 0, PAGE.width, 4).fill(COLORS.emerald);
        doc.rect(PAGE.width * 0.48, 0, PAGE.width * 0.52, 4).fill(COLORS.navy);
        doc.restore();
    };

    const ensureSpace = (height) => {
        if (doc.y + height <= PAGE.height - PAGE.bottom - 22) return;
        doc.addPage();
        addPageFrame();
        doc.y = PAGE.top;
    };

    const roundedBox = (x, y, width, height, fill, stroke = null, radius = 7) => {
        doc.save().lineWidth(0.8).roundedRect(x, y, width, height, radius);
        if (fill && stroke) doc.fillAndStroke(fill, stroke);
        else if (fill) doc.fill(fill);
        else if (stroke) doc.stroke(stroke);
        doc.restore();
    };

    const drawLabel = (label, x, y, width) => {
        doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.muted)
            .text(String(label || '').toUpperCase(), x, y, { width, characterSpacing: 0.35 });
    };

    const drawSection = (label, value, important = false) => {
        const content = plainText(value);
        if (!content) return;
        const headingHeight = 18;
        doc.font(important ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.2);
        const bodyHeight = doc.heightOfString(content, { width: CONTENT_WIDTH - 28, lineGap: 2.6 });
        const totalHeight = headingHeight + bodyHeight + 26;
        ensureSpace(Math.min(totalHeight, 250));

        const y = doc.y;
        doc.roundedRect(PAGE.marginX, y + 1, 4, 14, 2).fill(important ? COLORS.navy : COLORS.emerald);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(important ? COLORS.navy : COLORS.emeraldDark)
            .text(String(label).toUpperCase(), PAGE.marginX + 14, y + 2, { characterSpacing: 0.55 });
        const bodyY = y + headingHeight;
        roundedBox(
            PAGE.marginX,
            bodyY,
            CONTENT_WIDTH,
            bodyHeight + 20,
            important ? COLORS.emeraldSoft : COLORS.surface,
            important ? COLORS.emerald : COLORS.line,
            7
        );
        doc.font(important ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.2).fillColor(COLORS.ink)
            .text(content, PAGE.marginX + 14, bodyY + 10, { width: CONTENT_WIDTH - 28, lineGap: 2.6 });
        doc.y = bodyY + bodyHeight + 32;
    };

    addPageFrame();

    const logo = decodeDataImage(center.logo_url);
    const headerY = PAGE.top;
    if (logo) {
        try {
            doc.image(logo, PAGE.marginX, headerY, { fit: [42, 42], align: 'center', valign: 'center' });
        } catch { /* A malformed optional logo should not prevent report delivery. */ }
    }
    const identityX = PAGE.marginX + (logo ? 54 : 0);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.navy)
        .text(center.center_name || 'Diagnostic Imaging Center', identityX, headerY + 3, { width: 225 });
    const branchLine = [center.branch_name, plainText(reportHeaderText(center))].filter(Boolean).join('  |  ');
    doc.font('Helvetica').fontSize(7.8).fillColor(COLORS.muted)
        .text(branchLine || 'Confidential diagnostic imaging service', identityX, headerY + 26, { width: 265, lineGap: 1.5 });

    roundedBox(PAGE.width - PAGE.marginX - 83, headerY, 83, 22, COLORS.emeraldSoft, '#9EDBC5', 7);
    doc.circle(PAGE.width - PAGE.marginX - 70, headerY + 11, 3).fill(COLORS.emerald);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.emeraldDark)
        .text('FINALIZED', PAGE.width - PAGE.marginX - 61, headerY + 7.5, { width: 55 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.navy)
        .text(title, PAGE.width - PAGE.marginX - 220, headerY + 31, { width: 220, align: 'right' });

    doc.moveTo(PAGE.marginX, 101).lineTo(PAGE.width - PAGE.marginX, 101)
        .lineWidth(1).strokeColor(COLORS.line).stroke();

    const metadataY = 113;
    const metaGap = 7;
    const metaWidth = (CONTENT_WIDTH - metaGap * 3) / 4;
    const metadata = [
        ['Patient name', report.patient_name || 'Patient Record'],
        ['MRN', report.mrn || '-'],
        ['Study date', formatDate(report.start_time || report.created_at) || '-'],
        ['Referring physician', report.referring_doctor_name || '-'],
    ];
    metadata.forEach(([label, value], index) => {
        const x = PAGE.marginX + index * (metaWidth + metaGap);
        roundedBox(x, metadataY, metaWidth, 52, COLORS.white, COLORS.line, 7);
        drawLabel(label, x + 10, metadataY + 10, metaWidth - 20);
        doc.font('Helvetica-Bold').fontSize(index === 2 ? 8.4 : 9.1).fillColor(COLORS.ink)
            .text(plainText(value), x + 10, metadataY + 26, { width: metaWidth - 20, height: 20, ellipsis: true });
    });
    doc.y = metadataY + 68;

    if (mismatch) {
        const warningText = plainText(mismatch);
        doc.font('Helvetica').fontSize(8.7);
        const warningHeight = Math.max(42, doc.heightOfString(warningText, { width: CONTENT_WIDTH - 58, lineGap: 1.5 }) + 21);
        const warningY = doc.y;
        roundedBox(PAGE.marginX, warningY, CONTENT_WIDTH, warningHeight, COLORS.amberSoft, '#F2C680', 7);
        doc.circle(PAGE.marginX + 18, warningY + 18, 9).fill('#FDE7B0');
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.amber)
            .text('!', PAGE.marginX + 15.7, warningY + 11.7, { width: 5, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(7.6).fillColor(COLORS.amber)
            .text('CLINICAL CONSISTENCY NOTICE', PAGE.marginX + 37, warningY + 9);
        doc.font('Helvetica').fontSize(8.7).fillColor('#6F4612')
            .text(warningText, PAGE.marginX + 37, warningY + 21, { width: CONTENT_WIDTH - 51, lineGap: 1.5 });
        doc.y = warningY + warningHeight + 13;
    }

    const sections = [
        ['Clinical History', standard.clinicalHistory, false],
        ['Technique & Protocol', standard.technique, false],
        ['Findings', standard.findings, false],
        ['Impression & Conclusion', standard.impression, true],
        ['Recommendations', standard.recommendations, false],
        ...customSections.map((item) => [item.title, item.value, false]),
    ];
    sections.forEach(([label, value, important]) => drawSection(label, value, important));

    ensureSpace(135);
    const verificationY = Math.max(doc.y + 5, PAGE.height - PAGE.bottom - 126);
    const signatureWidth = 215;
    const verificationX = PAGE.width - PAGE.marginX - 238;

    doc.moveTo(PAGE.marginX, verificationY - 10).lineTo(PAGE.width - PAGE.marginX, verificationY - 10)
        .dash(3, { space: 3 }).lineWidth(0.7).strokeColor(COLORS.line).stroke().undash();
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.ink)
        .text(report.digital_signature_name || report.radiologist_name || 'Reporting Radiologist', PAGE.marginX, verificationY + 34, { width: signatureWidth });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text(report.digital_signature_role || 'Reporting Radiologist', PAGE.marginX, verificationY + 50, { width: signatureWidth });
    doc.moveTo(PAGE.marginX, verificationY + 77).lineTo(PAGE.marginX + 132, verificationY + 77)
        .lineWidth(0.8).strokeColor('#9AA9BA').stroke();

    roundedBox(verificationX, verificationY, 238, 91, COLORS.surface, COLORS.line, 7);
    doc.image(qrBuffer, verificationX + 9, verificationY + 11, { width: 66, height: 66 });
    roundedBox(verificationX + 86, verificationY + 10, 91, 16, COLORS.emeraldSoft, null, 7);
    doc.circle(verificationX + 96, verificationY + 18, 2.5).fill(COLORS.emerald);
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(COLORS.emeraldDark)
        .text('DIGITALLY VERIFIED', verificationX + 103, verificationY + 14, { width: 70 });
    drawLabel('Verification code', verificationX + 86, verificationY + 34, 130);
    doc.font('Courier-Bold').fontSize(6.3).fillColor(COLORS.emeraldDark)
        .text(String(verificationHash), verificationX + 86, verificationY + 45, { width: 140, height: 24, ellipsis: true });
    doc.font('Helvetica').fontSize(6.6).fillColor(COLORS.muted)
        .text(`Order ${report.order_number || report.accession_number || cleanFilenamePart(report.exam_id) || '-'}`, verificationX + 86, verificationY + 72, { width: 140 });

    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
        doc.switchToPage(pages.start + index);
        const footerY = PAGE.height - PAGE.bottom - 12;
        doc.moveTo(PAGE.marginX, footerY - 8).lineTo(PAGE.width - PAGE.marginX, footerY - 8)
            .lineWidth(0.6).strokeColor(COLORS.line).stroke();
        doc.font('Helvetica').fontSize(6.8).fillColor(COLORS.muted)
            .text(plainText(reportFooterText(center)), PAGE.marginX, footerY, { width: CONTENT_WIDTH - 80, height: 17, ellipsis: true });
        doc.text(`Page ${index + 1} of ${pages.count}`, PAGE.width - PAGE.marginX - 72, footerY, { width: 72, align: 'right' });
    }

    doc.end();
    return completed;
};

module.exports = { buildReportPdf, plainText, cleanFilenamePart };
