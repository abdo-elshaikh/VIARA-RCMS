import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAnalyticsReport, sanitizeSpreadsheetCell } from '../analyticsReportExport';

describe('analyticsReportExport', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockReportData = {
        title: 'تقرير التحليلات التنفيذي',
        subtitle: 'مركز الأشعة التشخيصية',
        filename: 'test-analytics-report',
        generatedAt: '2026-08-24 10:00 AM',
        isArabic: true,
        range: { startDate: '2026-08-01', endDate: '2026-08-24' },
        insights: [
            { title: 'الرؤى والملاحظات التنفيذية الذكية', detail: 'تفاصيل الملاحظة الاستراتيجية' }
        ],
        summary: [
            { label: 'إجمالي الفحوصات', value: '1,250' },
            { label: 'إجمالي الإيرادات', value: '250,000 ج.م' },
            { label: 'متوسط زمن الإنجاز', value: '3.5 ساعة' }
        ],
        sections: [
            {
                title: 'استخدام الأجهزة',
                shortTitle: 'الأجهزة',
                columns: [
                    { key: 'modality_name', header: 'اسم الجهاز' },
                    { key: 'study_count', header: 'عدد الفحوصات' },
                    { key: 'utilization_pct', header: 'نسبة الاستخدام' }
                ],
                rows: [
                    { modality_name: 'MRI 1.5T', study_count: 320, utilization_pct: '85.4%' },
                    { modality_name: 'CT 128 Slice', study_count: 410, utilization_pct: '92.1%' }
                ]
            }
        ]
    };

    it('sanitizes spreadsheet formula injection risks', () => {
        expect(sanitizeSpreadsheetCell('=1+1')).toBe("'=1+1");
        expect(sanitizeSpreadsheetCell('+cmd|')).toBe("'+cmd|");
        expect(sanitizeSpreadsheetCell('-danger')).toBe("'-danger");
        expect(sanitizeSpreadsheetCell('@execute')).toBe("'@execute");
        expect(sanitizeSpreadsheetCell('Normal Text')).toBe('Normal Text');
    });

    it('exports CSV with UTF-8 BOM and localized headers', async () => {
        let createdBlob = null;
        global.Blob = class MockBlob {
            constructor(content, options) {
                this.content = content;
                this.options = options;
                createdBlob = this;
            }
        };

        const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
        const revokeObjectURLMock = vi.fn();
        global.URL.createObjectURL = createObjectURLMock;
        global.URL.revokeObjectURL = revokeObjectURLMock;

        const clickMock = vi.fn();
        const appendChildMock = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
        const removeMock = vi.fn();

        vi.spyOn(document, 'createElement').mockReturnValue({
            click: clickMock,
            remove: removeMock,
            set href(val) {},
            set download(val) {}
        });

        await exportAnalyticsReport(mockReportData, 'csv');

        expect(createdBlob).not.toBeNull();
        expect(createdBlob.content[0]).toContain('\uFEFF');
        expect(createdBlob.content[0]).toContain('تقرير التحليلات التنفيذي');
        expect(createdBlob.content[0]).toContain('استخدام الأجهزة');
        expect(createdBlob.content[0]).toContain('MRI 1.5T');
        expect(clickMock).toHaveBeenCalled();
    });

    it('opens print window with structured HTML for PDF export', async () => {
        const printMock = vi.fn();
        const writeMock = vi.fn();
        const closeMock = vi.fn();
        const focusMock = vi.fn();

        vi.spyOn(window, 'open').mockReturnValue({
            document: {
                write: writeMock,
                close: closeMock
            },
            focus: focusMock,
            print: printMock
        });

        await exportAnalyticsReport(mockReportData, 'pdf');

        expect(window.open).toHaveBeenCalledWith('', '_blank', 'noopener,noreferrer');
        expect(writeMock).toHaveBeenCalled();
        const writtenHtml = writeMock.mock.calls[0][0];
        expect(writtenHtml).toContain('dir="rtl"');
        expect(writtenHtml).toContain('تقرير التحليلات التنفيذي');
        expect(writtenHtml).toContain('إجمالي الفحوصات');
        expect(writtenHtml).toContain('MRI 1.5T');
        expect(writtenHtml).toContain('الرؤى والملاحظات التنفيذية الذكية');
        expect(writtenHtml).toContain('المدير الطبي والتشغيلي');
    });
});
