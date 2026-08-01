import { portalTokens } from "@/lib/portal-tokens";
import { cn } from "@/lib/utils";

export function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "info" | "destructive" | "muted";
  children: React.ReactNode;
}) {
  const map: Record<string, string> = {
    success: "bg-success/10 text-success ring-success/20",
    warning: "bg-warning/15 text-amber-700 ring-warning/25 dark:text-warning",
    info: "bg-info/10 text-info ring-info/20",
    destructive: "bg-destructive/10 text-destructive ring-destructive/20",
    muted: "bg-muted text-muted-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ring-1",
        map[tone] || map.muted,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function IconButton({
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="workspace-control-button relative grid h-10 w-10 place-items-center text-muted-foreground hover:text-primary"
    >
      <Icon className="h-4 w-4" />
      {badge && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />}
    </button>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div
      className={cn(
        portalTokens.surface,
        "p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover",
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={portalTokens.iconTile}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(portalTokens.surface, "overflow-hidden")}>
      {(title || subtitle || action) && (
        <div className={portalTokens.sectionHeader}>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/70 p-12 text-center shadow-soft transition-colors hover:border-primary/30">
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
          <Icon className="h-8 w-8" />
        </div>
      )}
      <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mb-6 max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function FilterBar({
  filters,
  activeFilter,
  onFilterChange,
}: {
  filters: Array<{ value: string; label: string }>;
  activeFilter: string;
  onFilterChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onFilterChange(filter.value)}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200",
            activeFilter === filter.value
              ? "bg-primary text-primary-foreground shadow-soft"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export function PortalGreeting({
  role,
  userName,
  stats,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  role: "patient" | "doctor";
  userName: string;
  stats?: Array<{
    label: string;
    value: string | number;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const roleConfig = {
    patient: {
      title: "Welcome back,",
      subtitle: "Your health journey continues",
    },
    doctor: {
      title: "Good morning,",
      subtitle: "Patient care awaits",
    },
  };

  return (
    <div className={cn(portalTokens.surface, "bg-gradient-to-r from-primary/5 to-accent/5 p-8")}>
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {title || roleConfig[role].title} <span className="text-primary">{userName}</span>
          </h2>
          <p className="mt-2 text-muted-foreground">{subtitle || roleConfig[role].subtitle}</p>
        </div>
        {actionLabel && onAction && (
          <button onClick={onAction} className={portalTokens.primaryAction}>
            {actionLabel}
          </button>
        )}
      </div>
      {stats && stats.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl bg-surface/80 p-4 shadow-soft">
              <div className="flex items-center gap-3">
                {stat.icon && (
                  <div className="rounded-lg bg-primary-soft p-2 text-primary">
                    <stat.icon className="h-4 w-4" />
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold">{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className={cn(portalTokens.surface, "animate-pulse p-8")}>
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="mt-3 h-4 w-72 max-w-full rounded bg-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-20 rounded-xl bg-muted/70" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(portalTokens.surface, "h-48 animate-pulse bg-muted/40")} />
        <div className={cn(portalTokens.surface, "h-48 animate-pulse bg-muted/40")} />
      </div>
    </div>
  );
}
