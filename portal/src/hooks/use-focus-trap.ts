import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Keeps keyboard focus inside a modal dialog while it is open. Pair with the
 * dialog's Escape/scroll-lock handling; the caller is responsible for moving
 * focus into the dialog on open and restoring it on close.
 */
export const useFocusTrap = (containerRef: RefObject<HTMLElement | null>, enabled = true): void => {
  useEffect(() => {
    if (!enabled) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [containerRef, enabled]);
};

export const focusInitialElement = (containerRef: RefObject<HTMLElement | null>): void => {
  const container = containerRef.current;
  if (!container) return;
  const focusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  (focusable || container).focus();
};

export const findPreviouslyFocused = (): HTMLElement | null =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null;

export const restoreFocus = (element: HTMLElement | null): void => {
  element?.focus();
};
