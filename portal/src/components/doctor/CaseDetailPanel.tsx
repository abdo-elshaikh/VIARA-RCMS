import React from "react";
import { FileText, MessageCircle, Stethoscope } from "lucide-react";
import { DetailRow } from "../ui/DataBlocks";
import StatusBadge from "../ui/StatusBadge";

interface CaseDetailPanelProps {
  item: any;
  onReport: (examId: string) => void;
  onMessage: (caseItem: any) => void;
  formatDateTime: (date: any) => string;
  t: any;
}

const CaseDetailPanel: React.FC<CaseDetailPanelProps> = ({
  item,
  onReport,
  onMessage,
  formatDateTime,
  t,
}) => (
  <aside className="rounded-xl border border-border bg-surface p-5 shadow-sm xl:sticky xl:top-24 xl:self-start">
    {!item ? (
      <div className="flex min-h-[360px] flex-col items-center justify-center text-center p-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 shadow-inner dark:bg-primary-400/10 dark:text-primary-300">
          <Stethoscope className="h-7 w-7" />
        </div>
        <h3 className="text-sm font-extrabold text-foreground">
          {t("doctor.cases.emptyTitle", { defaultValue: "Select a referral case" })}
        </h3>
        <p className="mt-1.5 max-w-xs text-xs font-medium leading-relaxed text-muted-foreground">
          {t("doctor.cases.emptyHint", {
            defaultValue:
              "Click any patient referral study from the clinical list on the left to inspect DICOM details, status, and reports.",
          })}
        </p>
      </div>
    ) : (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div className="min-w-0 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
              {t("doctor.caseDetail", { defaultValue: "Case Details" })}
            </span>
            <h2 className="truncate font-sans text-lg font-extrabold text-foreground">
              {item.patient_name || item.patient_mrn || "-"}
            </h2>
            <p
              className="font-mono text-xs font-bold text-primary-700 dark:text-primary-300"
              dir="ltr"
            >
              MRN {item.patient_mrn || "-"}
            </p>
          </div>
          <StatusBadge status={item.appointment_status || item.exam_status} t={t} />
        </div>

        <dl className="grid gap-3.5 text-xs">
          <DetailRow
            label={t("doctor.report.modality", "Modality")}
            value={[item.modality, item.machine_name].filter(Boolean).join(" - ")}
          />
          <DetailRow
            label={t("doctor.report.titleFallback", "Study Name")}
            value={item.exam_type_name || item.body_part || "-"}
          />
          <DetailRow
            label={t("doctor.cases.order", { number: item.order_number || "-" })}
            value={formatDateTime(item.start_time)}
          />
          <DetailRow
            label={t("doctor.report.finalized", "Finalized Date")}
            value={formatDateTime(item.finalized_at)}
          />
          <DetailRow
            label={t("doctor.report.report", "Report Status")}
            value={item.report_status || t("common.pending", "Pending")}
          />
          <DetailRow
            label={t("doctor.contrast", { defaultValue: "Contrast" })}
            value={
              item.contrast_required === true
                ? t("common.required", "Required")
                : item.contrast_required === false
                  ? t("doctor.notRequired", { defaultValue: "Not required" })
                  : "-"
            }
          />
        </dl>

        {item.clinical_indication && (
          <section className="space-y-1.5 rounded-lg border border-border bg-background p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("doctor.cases.clinical", "Clinical Indication")}
            </p>
            <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-foreground">
              {item.clinical_indication}
            </p>
          </section>
        )}

        <div className="grid gap-3 pt-2">
          {item.report_status === "Finalized" && item.exam_id ? (
            <button
              type="button"
              onClick={() => onReport(item.exam_id)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary-700 active:scale-[0.98]"
            >
              <FileText className="h-4 w-4" />
              {t("doctor.cases.viewReport", "View Finalized Report")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onMessage(item)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-5 text-xs font-bold text-foreground transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800"
          >
            <MessageCircle className="h-4 w-4" />
            {t("doctor.messages.compose", "Send Message to Radiologist")}
          </button>
        </div>
      </div>
    )}
  </aside>
);

export default CaseDetailPanel;
