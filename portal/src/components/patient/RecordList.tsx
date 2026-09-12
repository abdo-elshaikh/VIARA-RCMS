import React from "react";
import { FileText, ChevronDown, Printer, FileDown, Copy, Eye, Award, Calendar, Download } from "lucide-react";
import { Empty } from "../ui/StateIndicators";
import { InfoBlock } from "../ui/DataBlocks";
import { ActionButton } from "../ui/FormElements";
import StatusBadge from "../ui/StatusBadge";
import { isFinalizedRecord } from "../../utils/recordStatus";

interface RecordListProps {
  records: any[];
  emptyLabel: string;
  expandedRecordId: string | null;
  setExpandedRecordId: (id: string | null) => void;
  getRecordKey: (record: any) => string;
  examName: (record: any) => string;
  translateStatus: (status: string) => string;
  formatDate: (date: any, short?: boolean) => string;
  onPreviewReport: (record: any) => void;
  onPrintReport: (record: any) => void;
  onDownloadPdf?: (record: any) => void;
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
  onPreviewReport,
  onPrintReport,
  onDownloadPdf,
  onExportWord,
  onCopyReport,
  t,
}) => {
  if (!records || !records.length) return <Empty>{emptyLabel}</Empty>;

  return (
    <div className="grid gap-4">
      {records.map((record) => {
        const recordKey = getRecordKey(record);
        const isOpen = expandedRecordId === recordKey;
        const isFinalized = isFinalizedRecord(record);
        const reportText = isFinalized
          ? record.report_content || record.report_sections?.findings || ""
          : "";
        const canUseReport = Boolean(record.exam_id && isFinalized);
        const pacsViewerUrl = record.pacs_viewer_url || record.dicom_viewer_url;

        return (
          <article
            key={recordKey}
            className={`overflow-hidden rounded-xl border transition-all duration-200 ${
              isOpen
                ? "border-primary bg-primary-50 shadow-sm ring-1 ring-primary/20 dark:bg-primary-400/10"
                : "border-border bg-surface shadow-sm hover:border-primary-300 hover:shadow-md"
            }`}
          >
            <button
              type="button"
              onClick={() => setExpandedRecordId(isOpen ? null : recordKey)}
              aria-expanded={isOpen}
              aria-controls={`record-details-${recordKey}`}
              className="group flex w-full flex-col gap-4 p-5 text-start outline-none transition hover:bg-primary-50/60 dark:hover:bg-primary-400/10 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-200 group-hover:scale-105 ${
                    isFinalized
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-900/50"
                      : "border-primary-200/80 bg-primary-500/10 text-primary-700 dark:border-primary-900/50 dark:bg-primary-400/20 dark:text-primary-300"
                  }`}
                >
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-sans text-base font-extrabold text-foreground transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">
                      {examName(record)}
                    </h3>
                    {record.modality && (
                      <span className="rounded-md border border-border bg-background px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
                        {record.modality}
                      </span>
                    )}
                  </div>
                  <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 text-primary-600 dark:text-primary-300" />
                    <span>
                      {formatDate(
                        record.start_time || record.appointment_date || record.created_at,
                        true,
                      )}
                    </span>
                    {record.order_number && (
                      <>
                        <span>•</span>
                        <span className="font-mono font-bold text-foreground">
                          {record.order_number}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3.5 self-end sm:self-center">
                <StatusBadge
                  status={record.exam_status || record.appointment_status}
                  label={translateStatus(record.exam_status || record.appointment_status)}
                />
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-background text-muted-foreground transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-180 text-primary-700 dark:text-primary-300" : ""}`}
                  />
                </span>
              </div>
            </button>

            {isOpen && (
              <div
                id={`record-details-${recordKey}`}
                role="region"
                aria-label={`${examName(record)} ${t("records.detailsLabel", "details")}`}
                className="space-y-5 border-t border-border bg-background p-5"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoBlock
                    label={t("records.bodyPart", "Body Part")}
                    value={record.exam_body_part || record.body_part || "-"}
                  />
                  <InfoBlock
                    label={t("records.clinicalIndication", "Clinical Indication")}
                    value={record.exam_clinical_indication || record.clinical_indication || "-"}
                  />
                  <InfoBlock
                    label={t("records.orderNumber", "Order ID")}
                    value={record.order_number || record.appointment_id || "-"}
                  />
                </div>

                {reportText && (
                  <div className="space-y-3 rounded-lg border border-border bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
                        <Award className="h-4 w-4" />
                        {t("records.report", "Finalized Diagnostic Report")}
                      </span>
                      {record.radiologist_name && (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                          Dr. {record.radiologist_name}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-foreground">
                      {reportText}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {pacsViewerUrl && (
                    <a
                      href={pacsViewerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary-700 active:scale-[0.98]"
                    >
                      <Eye className="h-4 w-4" />
                      {t("records.viewImages", "Open Interactive PACS Web Viewer")}
                    </a>
                  )}
                  <ActionButton
                    disabled={!canUseReport}
                    onClick={() => onPreviewReport(record)}
                    icon={FileText}
                  >
                    {t("records.previewReport", "Preview final report")}
                  </ActionButton>
                  <ActionButton
                    disabled={!canUseReport}
                    onClick={() => onPrintReport(record)}
                    icon={Printer}
                  >
                    {t("records.printReport", "Print final report")}
                  </ActionButton>
                  {onDownloadPdf && (
                    <ActionButton
                      disabled={!canUseReport}
                      onClick={() => onDownloadPdf(record)}
                      icon={Download}
                    >
                      {t("records.downloadPdf", "Download PDF Report")}
                    </ActionButton>
                  )}
                  <ActionButton
                    disabled={!canUseReport}
                    onClick={() => onExportWord(record)}
                    icon={FileDown}
                  >
                    {t("records.wordTitle", "Export Word Doc")}
                  </ActionButton>
                  <ActionButton
                    disabled={!canUseReport}
                    onClick={() => onCopyReport(reportText)}
                    icon={Copy}
                  >
                    {t("common.copy", "Copy Report Text")}
                  </ActionButton>
                </div>
                {!isFinalized && (
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {t(
                      "records.notReady",
                      "Preview, print, and export become available after the final report is approved.",
                    )}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};

export default RecordList;
