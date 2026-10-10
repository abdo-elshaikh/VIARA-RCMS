import { useEffect, useRef } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const MAX_RECONNECT_DELAY_MS = 30_000;

const getCsrfToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export interface PortalRealtimeEvent {
  type?: string;
  event?: string;
  data?: any;
  status?: string;
}

/** Dispatch complete SSE frames that carry a JSON "data:" payload. */
const handleSseFrame = (frame: string, onEvent: (event: PortalRealtimeEvent) => void): void => {
  const dataBuffer: string[] = [];
  let eventName = "message";

  frame.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith(":")) return;
    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    const value = colonIndex === -1 ? "" : line.slice(colonIndex + 1).replace(/^ /, "");
    if (field === "data") dataBuffer.push(value);
    else if (field === "event") eventName = value;
  });

  if (eventName && eventName !== "message" && eventName !== "PING" && eventName !== "CONNECTED")
    return;
  if (!dataBuffer.length) return;

  const data = dataBuffer.join("\n");
  try {
    const parsed = JSON.parse(data) as PortalRealtimeEvent;
    if (parsed.type === "PING" || parsed.type === "CONNECTED") return;
    onEvent(parsed);
  } catch {
    // Ignore malformed frames — the stream stays alive for the next payload.
  }
};

export const usePortalRealtime = (
  enabled: boolean,
  onEvent: (event: PortalRealtimeEvent) => void,
) => {
  const callbackRef = useRef(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return undefined;

    let controller: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let reconnectAttempt = 0;

    const clearConnection = () => {
      controller?.abort();
      controller = null;
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer || !navigator.onLine) return;
      const baseDelay = Math.min(1_000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
      const jitter = Math.round(baseDelay * Math.random() * 0.2);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, baseDelay + jitter);
    };

    const connect = async () => {
      if (cancelled || !navigator.onLine || document.visibilityState === "hidden") return;
      clearConnection();
      const token = sessionStorage.getItem("token");
      if (!token) return;

      controller = new AbortController();
      try {
        const csrfToken = getCsrfToken();
        const sessionResponse = await fetch(`${API_BASE_URL}/realtime/session`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
        });
        if (!sessionResponse.ok)
          throw new Error(`Realtime session failed (${sessionResponse.status})`);
        const session = await sessionResponse.json();
        if (cancelled || !session?.token) return;

        // The stream token is sent in the Authorization header rather than the
        // URL query string so it never leaks into access/proxy logs.
        const streamResponse = await fetch(`${API_BASE_URL}/realtime/stream`, {
          credentials: "include",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!streamResponse.ok || !streamResponse.body) {
          throw new Error(`Realtime stream failed (${streamResponse.status})`);
        }

        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const frames = buffer.split(/\r?\n\r?\n/);
            buffer = frames.pop() || "";
            // Only a successfully dispatched real event marks the connection as
            // healthy; backoff stays elevated while the stream opens and dies
            // without delivering anything.
            frames.forEach((frame) =>
              handleSseFrame(frame, (event) => {
                reconnectAttempt = 0;
                callbackRef.current(event);
              }),
            );
          }
        } finally {
          reader.releaseLock();
        }

        // Stream closed cleanly by the server — reconnect.
        if (!cancelled) scheduleReconnect();
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          scheduleReconnect();
        }
      }
    };

    const reconnectNow = () => {
      if (cancelled || !navigator.onLine || document.visibilityState === "hidden") return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectAttempt = 0;
      void connect();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") reconnectNow();
      else clearConnection();
    };

    void connect();
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearConnection();
    };
  }, [enabled]);
};
