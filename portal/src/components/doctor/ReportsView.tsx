import { FileText, CheckCircle, Clock, Download } from "lucide-react";
import { EmptyState } from "../ui/StateIndicators";
import StatusBadge from "../ui/StatusBadge";

export interface ReportsViewProps {
  cases: any[];
  onReport: (examId: string) => void;
  formatDate: (date: any) => string;
  t: any;
}

export const ReportsView = ({ cases = [], onReport, formatDate, t }: ReportsViewProps) =>
  cases.length === 0 ? (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <EmptyState
        icon={FileText}
        title={t("doctor.cases.emptyTitle", "No finalized reports")}
        description={t(
          "doctor.cases.emptyDescription",
          "Signed clinical reports will appear here as soon as they are finalized.",
        )}
      />
    </div>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cases.map((item) => (
        <button
          type="button"
          key={item.exam_id}
          onClick={() => onReport(item.exam_id)}
          className="cursor-pointer rounded-xl border border-border bg-surface p-5 text-start shadow-sm transition hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-start justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
              <CheckCircle size={18} />
            </span>
            <StatusBadge status={item.report_status} t={t} />
          </div>
          <h3 className="font-extrabold text-sm text-foreground mt-4">
            {item.exam_type_name ||
              item.modality ||
              t("doctor.report.titleFallback", "Diagnostic Study")}
          </h3>
          <p className="font-mono text-[10px] text-muted-foreground mt-1" dir="ltr">
            {t("doctor.cases.mrn", "MRN")}: {item.patient_mrn}
          </p>
          {item.patient_name && (
            <p className="truncate text-xs font-semibold text-foreground/80 mt-1">
              {item.patient_name}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-border">
            <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
              <Clock size={12} />
              {formatDate(item.finalized_at || item.start_time)}
            </span>
            <span className="flex items-center gap-1.5 font-bold text-primary">
              <Download size={12} />
              {t("doctor.cases.viewReport", "View Report")}
            </span>
          </div>
        </button>
      ))}
    </div>
  );

export default ReportsView;
