import React from 'react';
import { FileText, ChevronDown, Printer, FileDown, Copy, Eye, Award, Calendar, Sparkles, Activity } from 'lucide-react';
import { Empty } from '../ui/StateIndicators';
import { InfoBlock } from '../ui/DataBlocks';
import { ActionButton } from '../ui/FormElements';
import StatusBadge from '../ui/StatusBadge';

interface RecordListProps {
    records: any[];
    emptyLabel: string;
    expandedRecordId: string | null;
    setExpandedRecordId: (id: string | null) => void;
    getRecordKey: (record: any) => string;
    examName: (record: any) => string;
    translateStatus: (status: string) => string;
    formatDate: (date: any, short?: boolean) => string;
    onDownloadReport: (record: any) => void;
    onExportWord: (record: any) => void;
    onCopyReport: (text: string) => void;
    t: any;
}

const RecordList: React.FC<RecordListProps> = ({
    records,
    emptyLabel,
    expandedRecordId,
    setExpandedRecordId,
    getRecordKey,
    examName,
    translateStatus,
    formatDate,
    onDownloadReport,
    onExportWord,
    onCopyReport,
    t
}) => {
    if (!records || !records.length) return <Empty>{emptyLabel}</Empty>;

    return (
        <div className="grid gap-4">
            {records.map((record) => {
                const recordKey = getRecordKey(record);
                const isOpen = expandedRecordId === recordKey;
                const reportText = record.report_content || record.report_sections?.findings || '';
                const isFinalized = record.exam_status === 'Finalized' || record.report_status === 'Finalized';
                const canUseReport = record.exam_id && (isFinalized || reportText);
                const pacsViewerUrl = record.pacs_viewer_url || record.dicom_viewer_url;

                return (
                    <article
                        key={recordKey}
                        className={`overflow-hidden rounded-3xl border transition-all duration-300 ${
                            isOpen
                                ? 'border-primary-500/60 bg-gradient-to-b from-primary-500/5 via-white to-white shadow-xl shadow-primary-900/5 ring-1 ring-primary-500/20 dark:border-primary-400/40 dark:from-[#07111f] dark:via-slate-900/90 dark:to-slate-900'
                                : 'border-border bg-surface/90 shadow-sm hover:border-primary-300 hover:shadow-md backdrop-blur-md'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => setExpandedRecordId(isOpen ? null : recordKey)}
                            className="flex w-full flex-col gap-4 p-5 text-start transition hover:bg-slate-50/50 dark:hover:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between outline-none group"
                        >
                            <div className="flex min-w-0 items-start gap-4">
                                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-200 group-hover:scale-105 ${
                                    isFinalized
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-900/50'
                                        : 'border-primary-200/80 bg-primary-500/10 text-primary-700 dark:border-primary-900/50 dark:bg-primary-400/20 dark:text-primary-300'
                                }`}>
                                    <FileText className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="truncate font-sans text-base font-extrabold text-foreground transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">
                                            {examName(record)}
                                        </h3>
                                        {record.modality && (
                                            <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60">
                                                {record.modality}
                                            </span>
                                        )}
                                    </div>
                                    <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        <Calendar className="h-3.5 w-3.5 text-primary-600 dark:text-primary-300" />
                                        <span>{formatDate(record.start_time || record.appointment_date || record.created_at, true)}</span>
                                        {record.order_number && (
                                            <>
                                                <span>•</span>
                                                <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">{record.order_number}</span>
                                            </>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3.5 self-end sm:self-center">
                                <StatusBadge status={record.exam_status || record.appointment_status} label={translateStatus(record.exam_status || record.appointment_status)} />
                                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-background text-muted-foreground transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">
                                    <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary-700 dark:text-primary-300' : ''}`} />
                                </span>
                            </div>
                        </button>

                        {isOpen && (
                            <div className="border-t border-slate-100 p-5 dark:border-slate-800/80 space-y-5 bg-slate-50/50 dark:bg-slate-950/40">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <InfoBlock label={t('records.bodyPart', 'Body Part')} value={record.exam_body_part || record.body_part || '-'} />
                                    <InfoBlock label={t('records.clinicalIndication', 'Clinical Indication')} value={record.exam_clinical_indication || record.clinical_indication || '-'} />
                                    <InfoBlock label={t('records.orderNumber', 'Order ID')} value={record.order_number || record.appointment_id || '-'} />
                                </div>

                                {reportText && (
                                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07111f] space-y-3">
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                                            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
                                                <Award className="h-4 w-4" />
                                                {t('records.report', 'Finalized Diagnostic Report')}
                                            </span>
                                            {record.radiologist_name && (
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                                                    Dr. {record.radiologist_name}
                                                </span>
                                            )}
                                        </div>
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200 font-sans font-medium">{reportText}</p>
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                    {pacsViewerUrl && (
                                        <a
                                            href={pacsViewerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-900 px-5 text-xs font-bold text-white shadow-md shadow-primary-900/20 transition-all hover:-translate-y-0.5 hover:from-primary-500 hover:to-primary-800 active:translate-y-0"
                                        >
                                            <Eye className="h-4 w-4" />
                                            {t('records.viewImages', 'Open Interactive PACS Web Viewer')}
                                        </a>
                                    )}
                                    <ActionButton disabled={!record.exam_id} onClick={() => onDownloadReport(record)} icon={Printer}>
                                        {t('records.openReport', 'Download PDF Report')}
                                    </ActionButton>
                                    <ActionButton disabled={!record.exam_id} onClick={() => onExportWord(record)} icon={FileDown}>
                                        {t('records.wordTitle', 'Export Word Doc')}
                                    </ActionButton>
                                    <ActionButton disabled={!canUseReport} onClick={() => onCopyReport(reportText)} icon={Copy}>
                                        {t('common.copy', 'Copy Report Text')}
                                    </ActionButton>
                                </div>
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
};

export default RecordList;
