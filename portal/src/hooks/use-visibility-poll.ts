import { useEffect } from "react";

/**
 * Runs `callback` on `intervalMs`, but only while the document is visible.
 * Callback is not invoked immediately — call it manually if you also want an initial run.
 */
export function useVisibilityPoll(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    if (typeof document === "undefined") return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") {
          void callback();
        }
      }, intervalMs);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (document.visibilityState === "visible") start();

    const onVis = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, [callback, intervalMs, enabled]);
}
