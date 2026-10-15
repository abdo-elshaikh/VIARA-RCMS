import React from "react";
import { LucideIcon } from "lucide-react";

export interface DoctorMetric {
  key: string;
  value: number | string;
  icon: LucideIcon;
  tone: "cyan" | "emerald" | "amber" | "violet";
}

export interface MetricCardProps {
  metric: DoctorMetric;
  t: any;
}

export const MetricCard = ({ metric, t }: MetricCardProps) => {
  const Icon = metric.icon;
  const tones: Record<string, string> = {
    cyan: "bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
    violet: "bg-info/10 text-info dark:bg-info/15 dark:text-info",
  };
  const toneClass = tones[metric.tone] || tones.cyan;

  return (
    <article className="group relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:border-primary-400/40 hover:shadow-md">
      <div className="relative z-10 flex items-center justify-between gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${toneClass}`}
        >
          <Icon size={20} />
        </span>
        <p className="font-sans text-3xl font-black text-foreground transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">
          {metric.value}
        </p>
      </div>
      <p className="relative z-10 mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-primary-600 dark:group-hover:text-primary-300">
        {t(`doctor.metrics.${metric.key}`)}
      </p>
    </article>
  );
};

export default MetricCard;
