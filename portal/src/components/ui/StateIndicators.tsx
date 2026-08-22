import React from 'react';
import { Inbox, RefreshCw, LucideIcon } from 'lucide-react';

export interface LoadingProps {
  label?: string;
  compact?: boolean;
}

export const Loading = ({ label = 'Loading...', compact = false }: LoadingProps) => (
  <div
    className={`flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-6 text-muted-foreground ${
      compact ? 'min-h-28' : 'min-h-[150px]'
    }`}
    aria-live="polite"
  >
    <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
      <RefreshCw size={20} className="animate-spin" />
    </span>
    <p className="text-xs font-bold text-foreground">{label}</p>
  </div>
);

export interface EmptyProps {
  children: React.ReactNode;
}

export const Empty = ({ children }: EmptyProps) => (
  <div className="flex min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-border bg-background p-6 text-center text-xs font-semibold text-muted-foreground">
    {children}
  </div>
);

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export const EmptyState = ({ icon: Icon = Inbox, title, description }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background px-5 py-12 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-primary shadow-sm ring-1 ring-border">
      <Icon size={24} strokeWidth={1.7} />
    </span>
    <h3 className="mt-3 text-sm font-extrabold text-foreground">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>}
  </div>
);

export default EmptyState;
