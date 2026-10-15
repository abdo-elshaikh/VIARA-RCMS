const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { getLicense } = require('./licenseService');
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

/**
 * Returns true when the currently loaded license is a trial edition.
 * Used to stamp a non-removable "TRIAL" overlay on every printed page so
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

const COLORS = {
    navy: '#0B2348',
    slateDark: '#1E293B',
    emerald: '#087F5B',
    emeraldDark: '#056247',
    emeraldSoft: '#E8F6F1',
    emeraldBorder: '#A7F3D0',
    ink: '#0F172A',
    body: '#334155',
    muted: '#64748B',
    faint: '#94A3B8',
    line: '#E2E8F0',
    surface: '#F8FAFC',
    panel: '#F1F5F9',
    amber: '#B45309',
    amberSoft: '#FFFBEB',
    amberBorder: '#FDE68A',
    danger: '#B91C1C',
    dangerSoft: '#FEF2F2',
    white: '#FFFFFF',
};

const PAGE = { width: 595.28, height: 841.89, marginX: 42, top: 38, bottom: 48 };
const CONTENT_WIDTH = PAGE.width - (PAGE.marginX * 2);

const plainText = (value = '') => String(value)
    .replace(/<br\s*\/?>/gi, '\n')
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
    const finalized = ['Finalized', 'Amended'].includes(report.report_status)
        && Boolean(report.report_locked)
        && Boolean(report.report_finalized_at);
    const statusLabel = report.report_status || (finalized ? 'Finalized' : 'Draft');
    const verificationHash = report.digital_signature_hash || (finalized
        ? `VIARA-VERIFIED-${String(report.exam_id || report.order_number || '').slice(0, 12).toUpperCase()}`
        : 'PENDING SIGNATURE');
    const verificationPayload = buildVerificationPayload(report, verificationHash);
    const portalBaseUrl = (process.env.PORTAL_CLIENT_URL || process.env.PORTAL_PUBLIC_URL || center.website || 'http://localhost:5174').replace(/\/+$/, '');
    const qrVerificationUrl = `${portalBaseUrl}/verify?code=${encodeURIComponent(verificationHash)}`;
    const qrPayload = finalized ? qrVerificationUrl : verificationPayload;
    
    let qrBuffer = null;
    try {
        qrBuffer = await QRCode.toBuffer(qrPayload, {
            type: 'png',
            width: 240,
            margin: 1,
            color: { dark: COLORS.navy, light: COLORS.white },
        });
    } catch {
        qrBuffer = null;
    }

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
        // Top accent line (emerald + navy gradient aesthetic)
        doc.rect(0, 0, PAGE.width * 0.55, 4).fill(COLORS.emerald);
        doc.rect(PAGE.width * 0.55, 0, PAGE.width * 0.45, 4).fill(COLORS.navy);

        // Trial edition overlay — drawn on every page, cannot be removed by
        // the client customization panel, and never shown for paid editions.
        if (isTrialEdition()) {
            doc.save();
            doc.fillColor(COLORS.danger).opacity(0.45);
            doc.font('Helvetica-Bold').fontSize(13);
            const label = 'TRIAL';
            const labelWidth = doc.widthOfString(label);
            const cx = PAGE.width / 2;
            const cy = PAGE.height / 2;
            doc.save();
            doc.translate(cx, cy);
            doc.rotate(-30);
            // Bordered badge so it survives print-to-PDF and copy/paste
            const padX = 10;
            const padY = 4;
            doc.roundedRect(-labelWidth / 2 - padX, -13 / 2 - padY, labelWidth + padX * 2, 13 + padY * 2, 4)
                .lineWidth(1.2).stroke(COLORS.danger);
            doc.text(label, -labelWidth / 2, -13 / 2 + 1, { width: labelWidth, align: 'center' });
            doc.restore();
            doc.opacity(1);
            doc.restore();
        }
        doc.restore();
    };

    const ensureSpace = (height) => {
        if (doc.y + height <= PAGE.height - PAGE.bottom - 24) return;
        doc.addPage();
        addPageFrame();
        doc.y = PAGE.top;
    };

    const roundedBox = (x, y, width, height, fill, stroke = null, radius = 6) => {
        doc.save().lineWidth(0.8).roundedRect(x, y, width, height, radius);
        if (fill && stroke) doc.fillAndStroke(fill, stroke);
        else if (fill) doc.fill(fill);
        else if (stroke) doc.stroke(stroke);
        doc.restore();
    };

    const drawLabel = (label, x, y, width) => {
        doc.font('Helvetica-Bold').fontSize(6.8).fillColor(COLORS.muted)
            .text(String(label || '').toUpperCase(), x, y, { width, characterSpacing: 0.4 });
    };

    const drawSection = (label, value, important = false) => {
        const content = plainText(value);
        if (!content) return;
        const headingHeight = 18;
        doc.font(important ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
        const bodyHeight = doc.heightOfString(content, { width: CONTENT_WIDTH - 24, lineGap: 2.8 });
        const totalHeight = headingHeight + bodyHeight + 24;
        ensureSpace(Math.min(totalHeight, 260));

        const y = doc.y;
        doc.roundedRect(PAGE.marginX, y + 1, 4, 14, 2).fill(important ? COLORS.emerald : COLORS.navy);
        doc.font('Helvetica-Bold').fontSize(9.2).fillColor(important ? COLORS.emeraldDark : COLORS.ink)
            .text(String(label).toUpperCase(), PAGE.marginX + 12, y + 2, { characterSpacing: 0.5 });
        const bodyY = y + headingHeight;
        
        roundedBox(
            PAGE.marginX,
            bodyY,
            CONTENT_WIDTH,
            bodyHeight + 18,
            important ? COLORS.emeraldSoft : COLORS.surface,
            important ? COLORS.emeraldBorder : COLORS.line,
            6
        );
        
        doc.font(important ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(COLORS.ink)
            .text(content, PAGE.marginX + 12, bodyY + 9, { width: CONTENT_WIDTH - 24, lineGap: 2.8 });
        doc.y = bodyY + bodyHeight + 28;
    };

    addPageFrame();

    // ── Header Band ────────────────────────────────────────────────────────
    const logo = decodeDataImage(center.logo_url);
    const headerY = PAGE.top;
    if (logo) {
        try {
            doc.image(logo, PAGE.marginX, headerY, { fit: [46, 46], align: 'center', valign: 'center' });
        } catch { /* Ignore logo rendering errors */ }
    }
    const identityX = PAGE.marginX + (logo ? 56 : 0);
    doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.navy)
        .text(center.center_name || 'Diagnostic Imaging Center', identityX, headerY + 2, { width: 250 });
    const branchLine = [center.branch_name, plainText(reportHeaderText(center))].filter(Boolean).join('  |  ');
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
        .text(branchLine || 'Confidential Medical Record', identityX, headerY + 22, { width: 280, lineGap: 1.4 });

    // Status pill
    const statusBoxWidth = 88;
    const statusBoxX = PAGE.width - PAGE.marginX - statusBoxWidth;
    roundedBox(statusBoxX, headerY, statusBoxWidth, 20, finalized ? COLORS.emeraldSoft : COLORS.dangerSoft, finalized ? COLORS.emeraldBorder : '#FECACA', 6);
    doc.circle(statusBoxX + 12, headerY + 10, 3).fill(finalized ? COLORS.emerald : COLORS.danger);
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(finalized ? COLORS.emeraldDark : COLORS.danger)
        .text(statusLabel.toUpperCase(), statusBoxX + 20, headerY + 6.5, { width: 62 });
    
    // Exam title under status
    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.ink)
        .text(title, PAGE.width - PAGE.marginX - 240, headerY + 26, { width: 240, align: 'right' });

    // Divider rule
    doc.moveTo(PAGE.marginX, 95).lineTo(PAGE.width - PAGE.marginX, 95)
        .lineWidth(1).strokeColor(COLORS.line).stroke();

    // ── Demographics Matrix (4 Columns x 2 Rows) ──────────────────────────
    const metadataY = 104;
    const metaGap = 6;
    const metaCols = 4;
    const metaWidth = (CONTENT_WIDTH - metaGap * (metaCols - 1)) / metaCols;
    const metaHeight = 44;

    const patientAge = report.patient_age || report.age || '';
    const patientSex = report.gender || report.patient_sex || '';
    const ageSexValue = [patientAge ? `${patientAge}Y` : '', patientSex].filter(Boolean).join(' / ') || '-';

    const demographicFields = [
        // Row 1
        ['Patient Name', report.patient_name || 'Patient Record', true],
        ['MRN / ID', report.mrn || report.patient_id || '-', true],
        ['Age / Sex', ageSexValue, false],
        ['Study Date', formatDate(report.start_time || report.created_at) || '-', false],
        // Row 2
        ['Accession / Order #', report.order_number || report.accession_number || report.exam_id || '-', true],
        ['Modality', report.modality_type || report.modality_name || '-', false],
        ['Body Region', report.body_part || report.body_region || title, false],
        ['Referring Physician', report.referring_doctor_name || '-', false],
    ];

    demographicFields.forEach(([label, value, isPrimary], index) => {
        const col = index % metaCols;
        const row = Math.floor(index / metaCols);
        const x = PAGE.marginX + col * (metaWidth + metaGap);
        const y = metadataY + row * (metaHeight + metaGap);

        roundedBox(x, y, metaWidth, metaHeight, COLORS.surface, COLORS.line, 5);
        drawLabel(label, x + 8, y + 7, metaWidth - 16);
        doc.font(isPrimary ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.4).fillColor(COLORS.ink)
            .text(plainText(value), x + 8, y + 20, { width: metaWidth - 16, height: 18, ellipsis: true });
    });

    doc.y = metadataY + (metaHeight + metaGap) * 2 + 10;

    // ── Clinical Consistency Alert (if any) ───────────────────────────────
    if (mismatch) {
        const warningText = plainText(mismatch);
        doc.font('Helvetica').fontSize(8.5);
        const warningHeight = Math.max(38, doc.heightOfString(warningText, { width: CONTENT_WIDTH - 50, lineGap: 1.4 }) + 20);
        const warningY = doc.y;
        roundedBox(PAGE.marginX, warningY, CONTENT_WIDTH, warningHeight, COLORS.amberSoft, COLORS.amberBorder, 6);
        doc.circle(PAGE.marginX + 16, warningY + 16, 8).fill('#FDE7B0');
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.amber)
            .text('!', PAGE.marginX + 14, warningY + 10.5, { width: 5, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.amber)
            .text('CLINICAL CONSISTENCY NOTICE', PAGE.marginX + 32, warningY + 8);
        doc.font('Helvetica').fontSize(8.5).fillColor('#78350F')
            .text(warningText, PAGE.marginX + 32, warningY + 20, { width: CONTENT_WIDTH - 44, lineGap: 1.4 });
        doc.y = warningY + warningHeight + 12;
    }

    // ── Clinical Narrative Sections ───────────────────────────────────────
    const sections = [
        ['Clinical History & Indication', standard.clinicalHistory, false],
        ['Technique & Protocol', standard.technique, false],
        ['Findings', standard.findings, false],
        ['Impression & Conclusion', standard.impression, true],
        ['Recommendations & Follow-up', standard.recommendations, false],
        ...customSections.map((item) => [item.title, item.value, false]),
    ];
    sections.forEach(([label, value, important]) => drawSection(label, value, important));

    // ── Signature & Digital Verification Panel ────────────────────────────
    ensureSpace(120);
    const verificationY = Math.max(doc.y + 6, PAGE.height - PAGE.bottom - 110);
    const sigPanelWidth = (CONTENT_WIDTH - 12) / 2;
    const radiologistPanelX = PAGE.marginX;
    const verifyCardX = PAGE.marginX + sigPanelWidth + 12;
    const panelHeight = 84;

    doc.moveTo(PAGE.marginX, verificationY - 8).lineTo(PAGE.width - PAGE.marginX, verificationY - 8)
        .dash(3, { space: 3 }).lineWidth(0.7).strokeColor(COLORS.line).stroke().undash();

    // Left Panel: Radiologist Signoff
    roundedBox(radiologistPanelX, verificationY, sigPanelWidth, panelHeight, COLORS.surface, COLORS.line, 6);
    drawLabel('Reporting Radiologist', radiologistPanelX + 12, verificationY + 10, sigPanelWidth - 24);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink)
        .text(report.digital_signature_name || report.radiologist_name || 'Reporting Radiologist', radiologistPanelX + 12, verificationY + 24, { width: sigPanelWidth - 24 });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text(report.digital_signature_role || 'Diagnostic Radiologist', radiologistPanelX + 12, verificationY + 40, { width: sigPanelWidth - 24 });
    doc.moveTo(radiologistPanelX + 12, verificationY + 66).lineTo(radiologistPanelX + 130, verificationY + 66)
        .lineWidth(0.8).strokeColor(COLORS.faint).stroke();

    if (finalized) {
        const stampX = radiologistPanelX + sigPanelWidth - 36;
        const stampY = verificationY + 42;
        doc.circle(stampX, stampY, 26).lineWidth(1.2).strokeColor('#0284C7').stroke();
        doc.circle(stampX, stampY, 23).dash(2, { space: 1.5 }).lineWidth(0.6).strokeColor('#0284C7').stroke().undash();
        doc.circle(stampX, stampY, 15).lineWidth(0.8).strokeColor('#0284C7').stroke();
        doc.font('Helvetica-Bold').fontSize(4.8).fillColor('#0284C7')
            .text('OFFICIALLY', stampX - 18, stampY - 6.5, { width: 36, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(4.8).fillColor('#0284C7')
            .text('VERIFIED', stampX - 18, stampY - 0.5, { width: 36, align: 'center' });
        doc.font('Helvetica').fontSize(3.8).fillColor('#0369A1')
            .text('VIARA SEAL', stampX - 18, stampY + 5.5, { width: 36, align: 'center' });
    }

    // Right Panel: Digital Verification + QR
    roundedBox(verifyCardX, verificationY, sigPanelWidth, panelHeight, finalized ? COLORS.emeraldSoft : COLORS.surface, finalized ? COLORS.emeraldBorder : COLORS.line, 6);
    if (qrBuffer) {
        doc.image(qrBuffer, verifyCardX + 8, verificationY + 8, { width: 68, height: 68 });
    }
    const infoX = verifyCardX + (qrBuffer ? 82 : 12);
    const infoWidth = sigPanelWidth - (qrBuffer ? 92 : 24);

    doc.circle(infoX + 4, verificationY + 14, 2.5).fill(finalized ? COLORS.emerald : COLORS.amber);
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(finalized ? COLORS.emeraldDark : COLORS.amber)
        .text(finalized ? 'DIGITALLY VERIFIED' : 'PENDING SIGNATURE', infoX + 10, verificationY + 10.5, { width: infoWidth - 10 });

    drawLabel('Verification Fingerprint', infoX, verificationY + 26, infoWidth);
    doc.font('Courier-Bold').fontSize(6.5).fillColor(COLORS.ink)
        .text(String(verificationHash), infoX, verificationY + 36, { width: infoWidth, height: 20, ellipsis: true });
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
        .text(`Generated ${formatDate(new Date())}`, infoX, verificationY + 64, { width: infoWidth });

    // ── Multi-page Footers ────────────────────────────────────────────────
    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
        doc.switchToPage(pages.start + index);
        const footerY = PAGE.height - PAGE.bottom + 8;
        doc.moveTo(PAGE.marginX, footerY - 6).lineTo(PAGE.width - PAGE.marginX, footerY - 6)
            .lineWidth(0.6).strokeColor(COLORS.line).stroke();
        doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
            .text(plainText(reportFooterText(center)), PAGE.marginX, footerY, { width: CONTENT_WIDTH - 90, height: 16, ellipsis: true });
        doc.text(`Page ${index + 1} of ${pages.count}`, PAGE.width - PAGE.marginX - 80, footerY, { width: 80, align: 'right' });
    }

    doc.end();
    return completed;
};

module.exports = { buildReportPdf, plainText, cleanFilenamePart };
