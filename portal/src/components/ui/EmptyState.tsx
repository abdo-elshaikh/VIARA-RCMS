import React from "react";
import { AlertCircle, FileSearch, Inbox, Plus, Search, LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";

const variantIcons: Record<string, LucideIcon> = {
  default: Inbox,
  search: FileSearch,
  error: AlertCircle,
};
const variantColors: Record<string, string> = {
  default: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
  search: "bg-primary-50 text-primary-600 dark:bg-primary-400/10 dark:text-primary-300",
  error: "bg-red-50 text-red-500 dark:bg-red-400/10 dark:text-red-300",
};

export interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  subtitle?: string;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "default" | "search" | "error";
  compact?: boolean;
  className?: string;
}

export const EmptyState = ({
  icon,
  title,
  description,
  subtitle,
  action,
  actionLabel,
  onAction,
  variant = "default",
  compact = false,
  className = "",
}: EmptyStateProps) => {
  const { t } = useTranslation("common");
  const DisplayIcon = icon || variantIcons[variant] || Inbox;
  const supportingText = description || subtitle;

  return (
    <div
      className={`flex flex-col items-center justify-center px-4 text-center ${compact ? "py-7" : "py-12"} ${className}`}
    >
      <div
        className={`${compact ? "mb-3 h-12 w-12" : "mb-5 h-16 w-16"} flex items-center justify-center rounded-2xl ring-8 ring-slate-50 dark:ring-slate-800/60 ${variantColors[variant] || variantColors.default}`}
      >
        <DisplayIcon className={compact ? "h-5 w-5" : "h-7 w-7"} aria-hidden="true" />
      </div>
      <h3 className={`${compact ? "text-sm" : "text-lg"} font-semibold text-foreground`}>
        {title || t("empty.defaultTitle", "No items found")}
      </h3>
      {supportingText && (
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{supportingText}</p>
      )}
      {action ||
        (onAction && (
          <Button onClick={onAction} variant="default" size="default" className="mt-6">
            <Plus className="h-4 w-4" />
            {actionLabel || t("empty.create", "Create")}
          </Button>
        ))}
    </div>
  );
};

export default EmptyState;
