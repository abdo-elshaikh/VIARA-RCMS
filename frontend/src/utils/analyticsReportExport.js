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

const safeFilename = (value) => String(value || 'analytics-report')
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

/**
 * Format sections into multi-table CSV with UTF-8 BOM
 */
const buildCsvContent = (report) => {
    const rows = [
        [report.title],
        [report.subtitle],
        ['Generated At / تاريخ التوليد', report.generatedAt],
        ['Date Range / الفترة الزمنية', `${report.range?.startDate || '-'} -> ${report.range?.endDate || '-'}`],
        [],
        ['=== 1. EXECUTIVE STRATEGIC INSIGHTS / الرؤى والملاحظات الاستراتيجية ==='],
        ...(report.insights || []).map((ins, i) => [`${i + 1}. ${ins.title || ''}`, ins.detail || '']),
        [],
        ['=== 2. EXECUTIVE SUMMARY / الملخص التنفيذي ==='],
        ['المؤشر (Metric)', 'القيمة (Value)'],
        ...(report.summary || []).map(item => [item.label, item.value]),
        [],
    ];

    (report.sections || []).forEach((section) => {
        rows.push([`=== ${section.title} ===`]);
        rows.push(section.columns.map(c => c.header));
        (section.rows || []).forEach((row) => {
            rows.push(section.columns.map(c => row[c.key]));
        });
        rows.push([]);
    });

    return `\uFEFF${rows.map(row => row.map(escapeCsv).join(',')).join('\r\n')}`;
};

/**
 * Build Multi-Sheet Excel Workbook (Clean & Simple)
 */
const exportExcelWorkbook = async (report, filename) => {
    const { default: writeExcelFile } = await import('write-excel-file/browser');

    const titleCell = (value) => ({
        value: sanitizeSpreadsheetCell(value),
        fontWeight: 'bold',
        fontSize: 14,
        color: '#0F172A'
    });

    const headerCell = (value) => ({
        value: sanitizeSpreadsheetCell(value),
        fontWeight: 'bold',
        color: '#0F172A',
        backgroundColor: '#F1F5F9',
        align: 'center',
        wrap: true
    });

    const subHeaderCell = (value) => ({
        value: sanitizeSpreadsheetCell(value),
        fontWeight: 'bold',
        color: '#334155',
        backgroundColor: '#F8FAFC',
        wrap: true
    });

    const isRtl = report.isArabic;

    // Sheet 1: Summary & Insights
    const summarySheetData = [
        [titleCell(report.title)],
        [{ value: sanitizeSpreadsheetCell(report.subtitle), color: '#64748B', fontSize: 10 }],
        [{ value: isRtl ? 'الفترة:' : 'Range:', fontWeight: 'bold' }, { value: `${report.range?.startDate || ''} ~ ${report.range?.endDate || ''}` }],
        [{ value: isRtl ? 'تاريخ التوليد:' : 'Generated:', fontWeight: 'bold' }, { value: sanitizeSpreadsheetCell(report.generatedAt) }],
        [],
        [headerCell(isRtl ? 'المؤشر' : 'Metric'), headerCell(isRtl ? 'القيمة' : 'Value')],
        ...(report.summary || []).map(item => [
            subHeaderCell(item.label),
            { value: sanitizeSpreadsheetCell(item.value), fontWeight: 'bold', align: 'center' }
        ]),
        [],
        ...(report.insights && report.insights.length > 0 ? [
            [headerCell(isRtl ? 'الرؤية والملاحظة' : 'Insight'), headerCell(isRtl ? 'التفاصيل' : 'Detail')],
            ...report.insights.map(ins => [
                subHeaderCell(ins.title),
                { value: sanitizeSpreadsheetCell(ins.detail), wrap: true }
            ])
        ] : [])
    ];

    const sheets = [{
        data: summarySheetData,
        sheet: isRtl ? 'الملخص' : 'Summary',
        columns: [{ width: 36 }, { width: 44 }],
        stickyRowsCount: 5,
        rightToLeft: isRtl,
        orientation: 'landscape'
    }];

    (report.sections || []).forEach((section, idx) => {
        const sheetName = String(section.shortTitle || section.title || `Sheet ${idx + 1}`)
            .replace(/[\\/*?:[\]]/g, ' ')
            .trim()
            .slice(0, 31);

        sheets.push({
            data: [
                section.columns.map(col => headerCell(col.header)),
                ...(section.rows || []).map(row =>
                    section.columns.map(col => ({
                        value: sanitizeSpreadsheetCell(row[col.key]),
                        align: col.align || 'start'
                    }))
                )
            ],
            sheet: sheetName,
            columns: section.columns.map(col => ({
                width: Math.max(14, Math.min(38, String(col.header).length + 6))
            })),
            stickyRowsCount: 1,
            rightToLeft: isRtl,
            orientation: 'landscape'
        });
    });

    await writeExcelFile(sheets, { fontFamily: 'Segoe UI, Arial', fontSize: 10 }).toFile(`${filename}.xlsx`);
};

/**
 * Build Clean & Simple Printable HTML / PDF
 */
const buildHtmlReport = (report) => {
    const isRtl = report.isArabic;
    return `<!doctype html>
<html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    @page { size: A4; margin: 12mm 15mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; background: #f8fafc; font-size: 11px; line-height: 1.5; }
    .page-container { max-width: 1000px; margin: 0 auto; padding: 32px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    
    /* Header */
    .header { border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header-title h1 { margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
    .header-title p { margin: 4px 0 0; color: #64748b; font-size: 12px; }
    .header-meta { text-align: ${isRtl ? 'left' : 'right'}; font-size: 11px; color: #64748b; }
    .header-meta strong { color: #334155; }
    
    /* Insights Note */
    .insights-box { background: #f8fafc; border-${isRtl ? 'right' : 'left'}: 3px solid #0f766e; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px; }
    .insights-box h3 { margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #0f766e; text-transform: uppercase; letter-spacing: 0.05em; }
    .insights-list { margin: 0; padding: 0; list-style: none; }
    .insights-list li { margin-bottom: 4px; font-size: 11px; color: #334155; }
    .insights-list li strong { color: #0f172a; }
    
    /* KPI Simple Grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 24px; }
    .kpi-cell { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #ffffff; }
    .kpi-cell .label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .kpi-cell .value { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 2px; }

    /* Tables */
    .section-block { margin-bottom: 28px; }
    .section-title { font-size: 12px; font-weight: 700; color: #0f172a; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.03em; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { background: #f8fafc; color: #475569; font-weight: 600; text-align: ${isRtl ? 'right' : 'left'}; padding: 6px 10px; border: 1px solid #e2e8f0; }
    td { padding: 6px 10px; border: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
    tr:nth-child(even) td { background: #fafafa; }
    
    /* Signatures */
    .signatures { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; text-align: center; }
    .sig-role { font-weight: 600; color: #475569; font-size: 10.5px; }
    .sig-space { height: 35px; border-bottom: 1px dashed #cbd5e1; margin-bottom: 6px; }
    
    /* Action Bar */
    .action-bar { margin-bottom: 16px; display: flex; justify-content: flex-end; }
    .btn-print { background: #0f172a; color: #ffffff; border: 0; padding: 7px 16px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; }
    .btn-print:hover { background: #334155; }
    
    @media print {
      body { background: #ffffff; padding: 0; font-size: 10px; }
      .page-container { border: 0; box-shadow: none; padding: 0; max-width: 100%; }
      .action-bar { display: none !important; }
      .section-block { page-break-inside: avoid; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="page-container">
    <div class="action-bar">
      <button class="btn-print" onclick="window.print()">${isRtl ? 'طباعة التقرير (Print / PDF)' : 'Print / Save PDF'}</button>
    </div>

    <header class="header">
      <div class="header-title">
        <h1>${escapeHtml(report.title)}</h1>
        <p>${escapeHtml(report.subtitle)}</p>
      </div>
      <div class="header-meta">
        <div><strong>${isRtl ? 'الفترة:' : 'Period:'}</strong> ${report.range?.startDate || '-'} ~ ${report.range?.endDate || '-'}</div>
        <div><strong>${isRtl ? 'التاريخ:' : 'Date:'}</strong> ${report.generatedAt}</div>
      </div>
    </header>

    ${report.insights && report.insights.length > 0 ? `
      <div class="insights-box">
        <h3>${isRtl ? 'الرؤى والملاحظات التنفيذية الذكية' : 'Executive Insights & Highlights'}</h3>
        <ul class="insights-list">
          ${report.insights.map(ins => `
            <li><strong>${escapeHtml(ins.title)}:</strong> ${escapeHtml(ins.detail)}</li>
          `).join('')}
        </ul>
      </div>
    ` : ''}

    <div class="kpi-grid">
      ${(report.summary || []).map(item => `
        <div class="kpi-cell">
          <div class="label">${escapeHtml(item.label)}</div>
          <div class="value">${escapeHtml(item.value)}</div>
        </div>
      `).join('')}
    </div>

    ${(report.sections || []).map(section => `
      <div class="section-block">
        <h2 class="section-title">${escapeHtml(section.title)}</h2>
        <table>
          <thead>
            <tr>${section.columns.map(c => `<th>${escapeHtml(c.header)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${(section.rows || []).map(r => `
              <tr>${section.columns.map(c => `<td>${escapeHtml(r[c.key])}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}

    <div class="signatures">
      <div>
        <div class="sig-space"></div>
        <div class="sig-role">${isRtl ? 'إعداد: مسؤول التحليلات' : 'Prepared by: BI Analyst'}</div>
      </div>
      <div>
        <div class="sig-space"></div>
        <div class="sig-role">${isRtl ? 'المدير الطبي والتشغيلي' : 'Medical & Clinical Director'}</div>
      </div>
      <div>
        <div class="sig-space"></div>
        <div class="sig-role">${isRtl ? 'اعتماد: المدير التنفيذي' : 'Approved by: CEO'}</div>
      </div>
    </div>
  </main>
</body>
</html>`;
};

/**
 * Build Simple & Clean Word Document (.docx)
 */
const exportWordDocument = async (report, filename) => {
    const isRtl = report.isArabic;
    const border = { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' };

    const cell = (text, bold = false, bg = null, align = isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT) => new TableCell({
        borders: { top: border, bottom: border, left: border, right: border },
        shading: bg ? { fill: bg } : undefined,
        children: [new Paragraph({
            alignment: align,
            children: [new TextRun({ text: normalize(text), bold, size: 18, font: 'Segoe UI' })]
        })],
    });

    const tables = (report.sections || []).flatMap((section) => [
        new Paragraph({
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: section.title, bold: true, size: 20, color: '0F172A', font: 'Segoe UI' })],
            spacing: { before: 200, after: 60 }
        }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: section.columns.map(col => cell(col.header, true, 'F8FAFC', AlignmentType.CENTER))
                }),
                ...(section.rows || []).map(row => new TableRow({
                    children: section.columns.map(col => cell(row[col.key], false, undefined, isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT))
                }))
            ]
        })
    ]);

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    children: [new TextRun({ text: report.title, bold: true, size: 28, color: '0F172A', font: 'Segoe UI' })],
                    spacing: { after: 40 }
                }),
                new Paragraph({
                    alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    children: [new TextRun({ text: report.subtitle, color: '64748B', size: 18, font: 'Segoe UI' })]
                }),
                new Paragraph({
                    alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    children: [new TextRun({
                        text: `${isRtl ? 'الفترة:' : 'Range:'} ${report.range?.startDate || ''} -> ${report.range?.endDate || ''} | ${isRtl ? 'التاريخ:' : 'Date:'} ${report.generatedAt}`,
                        color: '94A3B8',
                        size: 15,
                        font: 'Segoe UI'
                    })],
                    spacing: { after: 140 }
                }),

                // Executive KPIs
                new Paragraph({
                    alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    children: [new TextRun({ text: isRtl ? 'الملخص التنفيذي ومؤشرات الأداء' : 'Executive Key Performance Indicators', bold: true, size: 20, color: '0F172A', font: 'Segoe UI' })],
                    spacing: { after: 60 }
                }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: (report.summary || []).map((item) => new TableRow({
                        children: [
                            cell(item.label, true, 'F8FAFC'),
                            cell(item.value, true, undefined, AlignmentType.CENTER),
                        ],
                    })),
                }),
                ...tables,

                // Sign-off section
                new Paragraph({ text: '', spacing: { before: 200 } }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({
                            children: [
                                cell(isRtl ? 'إعداد: مسؤول التحليلات' : 'Prepared by: BI Analyst', true, 'FAFAFA', AlignmentType.CENTER),
                                cell(isRtl ? 'المدير الطبي والتشغيلي' : 'Medical & Clinical Director', true, 'FAFAFA', AlignmentType.CENTER),
                                cell(isRtl ? 'اعتماد: المدير التنفيذي' : 'Approved by: CEO', true, 'FAFAFA', AlignmentType.CENTER),
                            ]
                        })
                    ]
                })
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${filename}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
};

/**
 * Main Analytics Export Orchestrator
 */
export const exportAnalyticsReport = async (dashboardData, format) => {
    const filename = safeFilename(`${dashboardData.filename || dashboardData.title || 'analytics-report'}-${new Date().toISOString().slice(0, 10)}`);

    if (format === 'csv') {
        const csv = buildCsvContent(dashboardData);
        downloadBlob(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
        return;
    }

    if (format === 'excel' || format === 'xlsx') {
        await exportExcelWorkbook(dashboardData, filename);
        return;
    }

    if (format === 'pdf' || format === 'print') {
        const html = buildHtmlReport(dashboardData);
        if (!openPrintDocument(html)) {
            downloadBlob(html, `${filename}-print.html`, 'text/html;charset=utf-8');
        }
        return;
    }

    if (format === 'word' || format === 'docx') {
        await exportWordDocument(dashboardData, filename);
    }
};
