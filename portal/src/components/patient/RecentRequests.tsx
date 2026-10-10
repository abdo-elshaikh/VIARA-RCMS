import { useMemo } from "react";
import { Loading, Empty } from "../ui/StateIndicators";
import StatusBadge from "../ui/StatusBadge";

export interface RecentRequestsProps {
  requests: any[];
  loading?: boolean;
  formatDate: (date: any) => string;
  translateStatus: (status: string) => string;
  t: any;
}

export const RecentRequests = ({
  requests = [],
  loading = false,
  formatDate,
  translateStatus,
  t,
}: RecentRequestsProps) => {
  const newestRequests = useMemo(
    () =>
      [...requests].sort((a, b) => {
        const first = Date.parse(a.created_at || a.preferred_date) || 0;
        const second = Date.parse(b.created_at || b.preferred_date) || 0;
        return second - first;
      }),
    [requests],
  );

  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground">
        {t("patient.appointment.recentRequests", "Recent requests")}
      </h3>
      {loading && !newestRequests.length ? (
        <Loading compact label={t("patient.requests.loading", "Loading requests")} />
      ) : newestRequests.length === 0 ? (
        <Empty>{t("patient.empty.requests", "No appointment requests yet.")}</Empty>
      ) : (
        <div className="mt-3 grid gap-2">
          {newestRequests.slice(0, 5).map((request) => (
            <div
              key={request.request_id || `${request.preferred_date}-${request.modality_type}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-foreground">
                  {request.modality_type ||
                    request.exam_type_name ||
                    t("patient.appointment.fallback", "Appointment request")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(request.preferred_date || request.created_at)}
                </p>
              </div>
              <StatusBadge status={request.status} label={translateStatus(request.status)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentRequests;
