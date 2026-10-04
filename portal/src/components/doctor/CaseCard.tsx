import React from "react";
import { CalendarDays, FileText, ArrowRight, AlertCircle } from "lucide-react";
import StatusBadge from "../ui/StatusBadge";
import { isFinalizedRecord } from "../../utils/recordStatus";

interface CaseCardProps {
  item: any;
  selected: boolean;
  onSelect: () => void;
  onReport: (examId: string) => void;
  formatDate: (date: any) => string;
  t: any;
}

const CaseCard: React.FC<CaseCardProps> = ({
  item,
  selected,
  onSelect,
  onReport,
  formatDate,
  t,
}) => {
  const isStat = ["Urgent", "Emergency", "STAT"].includes(item.priority);

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border p-5 transition-all duration-200 ${
        selected
          ? "border-primary bg-primary-50 shadow-sm ring-1 ring-primary/20 dark:bg-primary-400/10"
          : "border-border bg-surface shadow-sm hover:border-primary-300 hover:shadow-md"
      }`}
    >
      {isStat && <div className="absolute top-0 end-0 h-1.5 w-24 rounded-bl-full bg-rose-500" />}

      <button type="button" onClick={onSelect} className="w-full text-start outline-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {item.order_number
                  ? t("doctor.cases.order", { number: item.order_number })
                  : t("doctor.cases.patient", { defaultValue: "Patient" })}
              </span>
              {isStat && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                  <AlertCircle className="h-3 w-3" />
                  STAT
                </span>
              )}
            </div>
            <h2 className="truncate text-base font-extrabold text-foreground transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">
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

        <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3.5">
          <p className="text-xs font-extrabold text-foreground">
            {item.exam_type_name ||
              item.modality ||
              t("doctor.report.titleFallback", { defaultValue: "Diagnostic Study" })}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-primary-600 dark:text-primary-300" />
            <span>{formatDate(item.start_time)}</span>
            {item.modality && (
              <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
                {item.modality}
              </span>
            )}
          </div>
          {item.clinical_indication && (
            <p className="line-clamp-2 text-xs font-medium leading-relaxed text-muted-foreground">
              {item.clinical_indication}
            </p>
          )}
        </div>
      </button>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <StatusBadge
          status={item.report_status || t("common.pending", { defaultValue: "Pending" })}
          t={t}
        />
        {isFinalizedRecord(item) && item.exam_id ? (
          <button
            type="button"
            onClick={() => onReport(item.exam_id)}
            className="group/btn inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 transition hover:text-primary-900 dark:text-primary-300"
          >
            <FileText className="h-4 w-4" />
            <span>{t("doctor.cases.viewReport", { defaultValue: "View Report" })}</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5 rtl:group-hover/btn:-translate-x-0.5 rtl:-scale-x-100" />
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default CaseCard;
