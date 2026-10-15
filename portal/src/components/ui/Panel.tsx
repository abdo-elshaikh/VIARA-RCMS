import React from "react";
import type { LucideIcon } from "lucide-react";

interface PanelProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const Panel = ({
  icon: Icon,
  title,
  description,
  action,
  children,
  className = "",
}: PanelProps) => (
  <section
    className={`portal-panel portal-surface rounded-xl border border-border bg-surface shadow-sm ${className}`}
  >
    <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="portal-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 ring-1 ring-primary-100 dark:bg-primary-400/10 dark:text-primary-200 dark:ring-primary-300/15">
            <Icon size={19} />
          </span>
        )}
        <div className="min-w-0 pt-0.5">
          <h2 className="font-display text-base font-bold leading-tight text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

export default Panel;
