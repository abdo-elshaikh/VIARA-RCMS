import { openPrintDocument } from './printDocument';
import {
    AlignmentType,
    BorderStyle,
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
} from 'docx';

const safeFilename = (value) => String(value || 'financial-report')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);

const normalize = (value) => value == null || value === '' ? '-' : String(value);

export const sanitizeSpreadsheetCell = (value) => {
    const text = normalize(value);
    return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
};

export const escapeHtml = (value) => normalize(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeCsv = (value) => {
    const safeText = sanitizeSpreadsheetCell(value);
    return /[",\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
};

const downloadBlob = (content, filename, type) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const sectionRowsForCsv = (report) => {
    const labels = report.exportLabels || {};
    const rows = [
        [report.title],
        [report.subtitle],
        [labels.generatedAt || 'Generated at', report.generatedAt],
        [],
        [labels.summary || 'Summary'],
        [labels.metric || 'Metric', labels.value || 'Value'],
        ...(report.summary || []).map((item) => [item.label, item.value]),
        [],
    ];

    (report.sections || []).forEach((section) => {
        rows.push([section.title]);
        rows.push(section.columns.map((column) => column.header));
        (section.rows || []).forEach((row) => {
            rows.push(section.columns.map((column) => row[column.key]));
        });
        rows.push([]);
    });
    return rows;
};

export const buildFinancialReportCsv = (report) => (
    `\uFEFF${sectionRowsForCsv(report).map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`
);

const buildHtmlReport = (report) => {
    const isRtl = /[\u0600-\u06FF]/.test(`${report.title} ${report.subtitle} ${(report.sections || []).map(section => section.title).join(' ')}`);
    return `
<!doctype html>
<html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, "Noto Sans Arabic", sans-serif; color: #0f172a; margin: 0; padding: clamp(16px, 4vw, 36px); background: #f8fafc; }
    main { width: min(100%, 1180px); margin: 0 auto; padding: clamp(16px, 3vw, 32px); background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 18px 45px rgba(15, 23, 42, .08); }
    h1 { margin: 0 0 6px; font-size: 24px; }
    h2 { margin: 28px 0 10px; font-size: 15px; text-transform: uppercase; letter-spacing: .04em; break-after: avoid; page-break-after: avoid; }
    p { margin: 0; color: #475569; }
    .table-wrap { max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; }
    table { border-collapse: collapse; width: 100%; min-width: 620px; margin-top: 10px; }
    thead { display: table-header-group; }
    th { background: #f1f5f9; color: #334155; text-align: start; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 12px; vertical-align: top; overflow-wrap: anywhere; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
    .metric { min-width: 0; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; background: #f8fafc; break-inside: avoid; }
    .metric strong { display: block; margin-top: 4px; font-size: 16px; color: #0f172a; }
    .no-print { margin-bottom: 16px; padding: 10px 14px; border: 0; border-radius: 9px; background: #0f766e; color: #fff; font-weight: 700; cursor: pointer; }
    @media (max-width: 760px) { .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 440px) { body { padding: 0; } main { border: 0; border-radius: 0; box-shadow: none; } .summary { grid-template-columns: 1fr; } h1 { font-size: 20px; } }
    @media print {
      @page { size: A4 landscape; margin: 12mm; }
      html, body { width: auto; margin: 0; padding: 0; background: #fff; }
      main { width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
      .no-print { display: none !important; }
      .table-wrap { overflow: visible; }
      table { min-width: 0; font-size: 9.5pt; }
      th, td { padding: 6px 7px; font-size: 9pt; }
      .summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <main>
    <button class="no-print" onclick="window.print()">${isRtl ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}</button>
    <h1>${escapeHtml(report.title)}</h1>
    <p>${escapeHtml(report.subtitle)}</p>
    <p>${escapeHtml(report.generatedAt)}</p>
    <section class="summary">
      ${(report.summary || []).map((item) => `<div class="metric">${escapeHtml(item.label)}<strong>${escapeHtml(item.value)}</strong></div>`).join('')}
    </section>
    ${(report.sections || []).map((section) => `
      <section>
        <h2>${escapeHtml(section.title)}</h2>
        <div class="table-wrap" role="region" aria-label="${escapeHtml(section.title)}">
          <table>
            <thead><tr>${section.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('')}</tr></thead>
            <tbody>
              ${(section.rows || []).map((row) => `<tr>${section.columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `).join('')}
  </main>
</body>
</html>`;
};

const exportExcelWorkbook = async (report, filename) => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    const labels = report.exportLabels || {};
    const titleCell = (value) => ({ value: sanitizeSpreadsheetCell(value), fontWeight: 'bold', fontSize: 18, color: '#0F172A' });
    const headerCell = (value) => ({
        value: sanitizeSpreadsheetCell(value),
        fontWeight: 'bold',
        color: '#FFFFFF',
        backgroundColor: '#0F766E',
        align: 'center',
        wrap: true
    });
    const isRtl = /[\u0600-\u06FF]/.test(`${report.title} ${report.subtitle}`);
    const summaryData = [
        [titleCell(report.title)],
        [{ value: sanitizeSpreadsheetCell(report.subtitle), color: '#475569' }],
        [{ value: sanitizeSpreadsheetCell(labels.generatedAt || 'Generated at'), fontWeight: 'bold' }, sanitizeSpreadsheetCell(report.generatedAt)],
        [],
        [headerCell(labels.metric || 'Metric'), headerCell(labels.value || 'Value')],
        ...(report.summary || []).map(item => [sanitizeSpreadsheetCell(item.label), sanitizeSpreadsheetCell(item.value)])
    ];
    const sheets = [{
        data: summaryData,
        sheet: isRtl ? 'الملخص' : 'Summary',
        columns: [{ width: 38 }, { width: 24 }],
        stickyRowsCount: 5,
        rightToLeft: isRtl,
        orientation: 'landscape'
    }];

    (report.sections || []).forEach((section, sectionIndex) => {
        const fallbackName = `Section ${sectionIndex + 1}`;
        const baseName = String(section.title || fallbackName).replace(/[\\/*?:[\]]/g, ' ').trim();
        sheets.push({
            data: [
                section.columns.map(column => headerCell(column.header)),
                ...(section.rows || []).map(row => section.columns.map(column => sanitizeSpreadsheetCell(row[column.key])))
            ],
            sheet: `${sectionIndex + 1} ${(baseName || fallbackName)}`.slice(0, 31),
            columns: section.columns.map(column => ({ width: Math.max(14, Math.min(34, String(column.header).length + 8)) })),
            stickyRowsCount: 1,
            rightToLeft: isRtl,
            orientation: 'landscape'
        });
    });

    await writeExcelFile(sheets, { fontFamily: 'Arial', fontSize: 10 }).toFile(`${filename}.xlsx`);
};

export const exportFinancialReport = async (report, format) => {
    const filename = safeFilename(`${report.filename || report.title}-${new Date().toISOString().slice(0, 10)}`);

    if (format === 'csv') {
        const csv = buildFinancialReportCsv(report);
        downloadBlob(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
        return;
    }

    if (format === 'excel') {
        await exportExcelWorkbook(report, filename);
        return;
    }

    if (format === 'pdf') {
        const html = buildHtmlReport(report);
        if (!openPrintDocument(html)) {
            downloadBlob(html, `${filename}-print.html`, 'text/html;charset=utf-8');
        }
        return;
    }

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };
    const cell = (text, bold = false) => new TableCell({
        borders: { top: border, bottom: border, left: border, right: border },
        children: [new Paragraph({ children: [new TextRun({ text: normalize(text), bold, size: 18 })] })],
    });
    const tables = (report.sections || []).flatMap((section) => [
        new Paragraph({ children: [new TextRun({ text: section.title, bold: true, size: 24 })], spacing: { before: 280, after: 100 } }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({ children: section.columns.map((column) => cell(column.header, true)) }),
                ...(section.rows || []).map((row) => new TableRow({ children: section.columns.map((column) => cell(row[column.key])) })),
            ],
        }),
    ]);

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({ children: [new TextRun({ text: report.title, bold: true, size: 32 })], spacing: { after: 80 } }),
                new Paragraph({ children: [new TextRun({ text: report.subtitle, color: '475569', size: 20 })] }),
                new Paragraph({ children: [new TextRun({ text: report.generatedAt, color: '64748B', size: 18 })], spacing: { after: 220 } }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: (report.summary || []).map((item) => new TableRow({
                        children: [
                            cell(item.label, true),
                            new TableCell({
                                borders: { top: border, bottom: border, left: border, right: border },
                                children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: normalize(item.value), bold: true, size: 20 })] })],
                            }),
                        ],
                    })),
                }),
                ...tables,
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${filename}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
};
