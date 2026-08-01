export interface ExportReportOptions {
    exam?: any;
    sections?: any;
    t?: any;
    locale?: string;
    centerSettings?: any;
    documentSettings?: any;
}

export function exportReportToWord(options: ExportReportOptions): Promise<void>;
