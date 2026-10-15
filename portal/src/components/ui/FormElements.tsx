import React from "react";
import type { LucideIcon } from "lucide-react";

interface FieldProps {
  label: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const Field = ({ label, required = false, className = "", children }: FieldProps) => (
  <label className={`portal-field-group block ${className}`}>
    <span className="mb-2 block text-xs font-semibold tracking-wide text-foreground">
      {label}
      {required && (
        <span className="ms-1 text-rose-500" aria-hidden="true">
          *
        </span>
      )}
    </span>
    {children}
  </label>
);

interface ActionButtonProps {
  icon?: LucideIcon;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export const ActionButton = ({
  icon: Icon,
  disabled = false,
  onClick,
  children,
}: ActionButtonProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="portal-button portal-button-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-bold text-foreground transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:border-primary-400/40 dark:hover:bg-primary-400/10 dark:hover:text-primary-200"
  >
    {Icon && <Icon size={16} />}
    {children}
  </button>
);
