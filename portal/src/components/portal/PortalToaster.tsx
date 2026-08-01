import { Toaster } from "sonner";

import { useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function PortalToaster() {
  const { dir } = useLang();
  const { theme } = useTheme();

  return (
    <Toaster
      closeButton
      richColors
      expand
      theme={theme}
      dir={dir}
      position={dir === "rtl" ? "top-left" : "top-right"}
      visibleToasts={4}
      duration={4200}
      mobileOffset={{ top: 72, left: 12, right: 12 }}
      offset={{ top: 76, left: 24, right: 24 }}
      containerAriaLabel="Portal notifications"
      toastOptions={{
        classNames: {
          toast:
            "border-border bg-surface text-foreground shadow-elevated font-sans data-[type=success]:border-success/30 data-[type=error]:border-destructive/30 data-[type=info]:border-info/30 data-[type=warning]:border-warning/30",
          title: "text-sm font-semibold text-foreground",
          description: "text-xs leading-5 text-muted-foreground",
          closeButton:
            "border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-foreground",
        },
      }}
      style={{ zIndex: 9999 }}
    />
  );
}
