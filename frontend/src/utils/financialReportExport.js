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

const escapeHtml = (value) => normalize(value)
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
    const rows = [
        [report.title],
        [report.subtitle],
        ['Generated at', report.generatedAt],
        [],
        ['Summary'],
        ['Metric', 'Value'],
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

const buildHtmlReport = (report) => `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    h2 { margin: 28px 0 10px; font-size: 15px; text-transform: uppercase; letter-spacing: .08em; }
    p { margin: 0; color: #475569; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; page-break-inside: avoid; }
    th { background: #f1f5f9; color: #334155; text-align: left; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 12px; vertical-align: top; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
    .metric { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; background: #f8fafc; }
    .metric strong { display: block; margin-top: 4px; font-size: 16px; color: #0f172a; }
    @media print { body { margin: 14mm; } .no-print { display: none; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 12px;border:0;border-radius:8px;background:#0f172a;color:white;font-weight:700">Print / Save PDF</button>
  <h1>${escapeHtml(report.title)}</h1>
  <p>${escapeHtml(report.subtitle)}</p>
  <p>${escapeHtml(report.generatedAt)}</p>
  <section class="summary">
    ${(report.summary || []).map((item) => `<div class="metric">${escapeHtml(item.label)}<strong>${escapeHtml(item.value)}</strong></div>`).join('')}
  </section>
  ${(report.sections || []).map((section) => `
    <h2>${escapeHtml(section.title)}</h2>
    <table>
      <thead><tr>${section.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('')}</tr></thead>
      <tbody>
        ${(section.rows || []).map((row) => `<tr>${section.columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `).join('')}
</body>
</html>`;

const exportExcelWorkbook = async (report, filename) => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
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
        [{ value: 'Generated at', fontWeight: 'bold' }, sanitizeSpreadsheetCell(report.generatedAt)],
        [],
        [headerCell('Metric'), headerCell('Value')],
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
        const csv = `\uFEFF${sectionRowsForCsv(report).map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
        downloadBlob(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
        return;
    }

    if (format === 'excel') {
        await exportExcelWorkbook(report, filename);
        return;
    }

    if (format === 'pdf') {
        const html = buildHtmlReport(report);
        const printWindow = window.open('', '_blank', 'noopener,noreferrer');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 350);
        } else {
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
