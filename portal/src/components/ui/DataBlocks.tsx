import React from "react";
import { LucideIcon } from "lucide-react";

export interface InfoBlockProps {
  label: string;
  value?: React.ReactNode;
}

export const InfoBlock = ({ label, value }: InfoBlockProps) => (
  <div className="min-w-0 rounded-lg border border-border bg-surface p-4">
    <p className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-xs sm:text-sm font-extrabold text-foreground break-words">
      {value || "-"}
    </p>
  </div>
);

export interface DetailRowProps {
  label: string;
  value?: React.ReactNode;
}

export const DetailRow = ({ label, value }: DetailRowProps) => (
  <div className="min-w-0 rounded-lg border border-border bg-surface p-3">
    <dt className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </dt>
    <dd className="mt-1 text-xs font-semibold text-foreground break-words">{value || "-"}</dd>
  </div>
);

export interface MoneyBlockProps {
  label: string;
  value?: React.ReactNode;
  strong?: boolean;
}

export const MoneyBlock = ({ label, value, strong = false }: MoneyBlockProps) => (
  <div className="min-w-0 rounded-lg border border-border bg-surface p-3">
    <p className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`mt-1 font-black ${strong ? "text-lg text-primary" : "text-sm text-foreground"}`}>
      {value || "-"}
    </p>
  </div>
);

export interface SummaryCardProps {
  icon: LucideIcon;
  label: string;
  value?: React.ReactNode;
}

export const SummaryCard = ({ icon: Icon, label, value }: SummaryCardProps) => (
  <div className="min-w-0 rounded-lg border border-border bg-surface p-4">
    <div className="flex items-center justify-between gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon size={18} />
      </span>
      <p className="text-xl font-black text-foreground">{value || "-"}</p>
    </div>
    <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  </div>
);
