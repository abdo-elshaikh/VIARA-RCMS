import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, X, Send, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import {
  useGetMyMessagesQuery,
  useSendPortalMessageMutation,
  useGetDoctorMessagesQuery,
  useGetDoctorUnreadCountQuery,
  useSendDoctorMessageMutation,
} from "../store/api";
import { getErrorMessage } from "../utils/getErrorMessage";
import { useFocusTrap } from "../hooks/use-focus-trap";

export default function PortalChatBubble({ role = "patient" }) {
  const { t, i18n } = useTranslation("portal");
  const dateLocale = (i18n.resolvedLanguage || i18n.language || "en").startsWith("ar")
    ? "ar-EG"
    : "en-GB";
  const isDoctor = role === "doctor";

  const [open, setOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [unseen, setUnseen] = useState(0);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useFocusTrap(panelRef, open);

  // Patient hooks
  const patientQuery = useGetMyMessagesQuery(undefined, {
    skip: isDoctor || !open,
    pollingInterval: 8000,
    skipPollingIfUnfocused: true,
  });
  const [sendPortalMessage, patientSend] = useSendPortalMessageMutation();

  // Doctor hooks
  const doctorQuery = useGetDoctorMessagesQuery(undefined, {
    skip: !isDoctor || !open,
    pollingInterval: 8000,
    skipPollingIfUnfocused: true,
  });
  const { data: doctorUnread } = useGetDoctorUnreadCountQuery(undefined, {
    skip: !isDoctor,
    pollingInterval: 15000,
    skipPollingIfUnfocused: true,
  });
  const [sendDoctorMessage, doctorSend] = useSendDoctorMessageMutation();

  const sortedMessages = useMemo(() => {
    const messages = isDoctor ? doctorQuery.data || [] : patientQuery.data || [];
    return [...messages].sort((a, b) => {
      const first = Date.parse(a.created_at) || 0;
      const second = Date.parse(b.created_at) || 0;
      return first - second;
    });
  }, [doctorQuery.data, isDoctor, patientQuery.data]);
  const latestMessage = sortedMessages[sortedMessages.length - 1];
  const isSending = isDoctor ? doctorSend.isLoading : patientSend.isLoading;

  // Badge: doctor uses the backend unread count; patient uses a local unseen counter
  const badge = open ? 0 : isDoctor ? doctorUnread?.unreadCount || 0 : unseen;

  // Auto-scroll without dragging the user away from earlier history.
  const threadRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);

  const handleThreadScroll = () => {
    const container = threadRef.current;
    if (!container) return;
    isNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 160;
  };

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.requestAnimationFrame(() => {
        const container = threadRef.current;
        if (container) container.scrollTop = container.scrollHeight;
        panelRef.current?.querySelector<HTMLElement>("input, button, textarea")?.focus();
      });
    } else {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const last = sortedMessages[sortedMessages.length - 1];
    const lastId = last ? String(last.message_id ?? last.created_at) : null;
    const isNewMessage = lastId !== lastMessageIdRef.current;
    lastMessageIdRef.current = lastId;
    if (!last || !isNewMessage) return;

    const container = threadRef.current;
    const isNearBottom =
      isNearBottomRef.current ||
      (container ? container.scrollHeight - container.scrollTop - container.clientHeight < 160 : true);
    const ownLatest = isDoctor ? last.sender_role === "Doctor" : last.sender_role === "Patient";
    if (isNearBottom || ownLatest) {
      messageEndRef.current?.scrollIntoView({ behavior: ownLatest ? "auto" : "smooth" });
    }
  }, [open, sortedMessages, isDoctor]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Patient SSE relay increments the unseen counter while the panel is closed
  useEffect(() => {
    if (isDoctor) return;
    const handler = () => {
      if (!open) setUnseen((n) => n + 1);
    };
    window.addEventListener("SSE_PATIENT_MESSAGE_UPDATE", handler);
    return () => window.removeEventListener("SSE_PATIENT_MESSAGE_UPDATE", handler);
  }, [isDoctor, open]);

  // Reading the full messages view also clears the bubble badge
  useEffect(() => {
    if (isDoctor) return;
    const handler = () => setUnseen(0);
    window.addEventListener("VIARA_PORTAL_MESSAGES_VIEWED", handler);
    return () => window.removeEventListener("VIARA_PORTAL_MESSAGES_VIEWED", handler);
  }, [isDoctor]);

  useEffect(() => {
    if (open) setUnseen(0);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    try {
      if (isDoctor) await sendDoctorMessage({ body: messageText }).unwrap();
      else await sendPortalMessage({ body: messageText }).unwrap();
      setMessageText("");
    } catch (error) {
      toast.error(getErrorMessage(error, t("chat.sendFailed", "Failed to send message")));
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t("chat.bubbleOpen", "Open support chat")}
          aria-label={t("chat.bubbleOpen", "Open support chat")}
          aria-expanded={open}
          aria-controls="portal-support-chat"
          className="fixed bottom-24 end-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary-900/20 transition hover:-translate-y-0.5 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 md:bottom-6 md:end-6 dark:focus:ring-offset-background"
        >
          <MessageCircle size={24} />
          {badge > 0 && (
            <span className="absolute -end-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[11px] font-bold text-white dark:border-slate-950">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          id="portal-support-chat"
          role="dialog"
          aria-modal="false"
          aria-labelledby="portal-support-chat-title"
          className="fixed bottom-24 end-4 z-[70] flex h-[32rem] max-h-[calc(100vh-8rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl md:bottom-6 md:end-6 md:max-h-[calc(100vh-3rem)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-primary-800 bg-primary px-4 py-3 text-primary-foreground">
            <div className="min-w-0">
              <h3 id="portal-support-chat-title" className="truncate text-sm font-bold">
                {t("chat.title", "Radiology Support Chat")}
              </h3>
              <p className="truncate text-[10px] text-white/75">
                {latestMessage
                  ? t("chat.lastActivity", {
                      defaultValue: "Latest message {{time}}",
                      time: new Date(latestMessage.created_at).toLocaleString(dateLocale, {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })
                  : t(
                      "chat.subtitle",
                      "Ask questions regarding your preparation instructions, booking status, or receipts.",
                    )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title={t("chat.bubbleClose", "Close chat")}
              aria-label={t("chat.bubbleClose", "Close chat")}
              className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-white/15"
            >
              <X size={16} />
            </button>
          </div>

          {/* Thread */}
          <div
            ref={threadRef}
            onScroll={handleThreadScroll}
            className="flex-1 space-y-3 overflow-y-auto bg-background p-4"
            aria-live="polite"
          >
            {sortedMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <MessageCircle size={26} className="mb-2 text-primary-600 opacity-40" />
                <p className="text-[11px] font-semibold">
                  {t(
                    "chat.emptyState",
                    "Send a message to our support desk to get help with your appointments or reports.",
                  )}
                </p>
              </div>
            ) : (
              sortedMessages.map((msg, i) => {
                const isMe = isDoctor
                  ? msg.sender_role === "Doctor"
                  : msg.sender_role === "Patient";
                const time = new Date(msg.created_at).toLocaleTimeString(dateLocale, {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={msg.message_id || i}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                  >
                    <div className="mb-1 flex items-center gap-1.5 px-1">
                      <span className="text-[9px] font-bold text-muted-foreground">
                        {isMe
                          ? t("chat.you", "You")
                          : msg.staff_name || t("chat.supportAgent", "Support Agent")}
                      </span>
                      <span className="text-[8px] text-muted-foreground">{time}</span>
                    </div>
                    <div
                      className={`max-w-[80%] rounded-xl px-3.5 py-2 text-xs leading-relaxed shadow-sm ${isMe ? "rounded-tr-none bg-primary-600 text-white rtl:rounded-tl-none rtl:rounded-tr-xl" : "rounded-tl-none border border-border bg-surface text-foreground rtl:rounded-tr-none rtl:rounded-tl-xl"}`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messageEndRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-border bg-surface p-3"
          >
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              maxLength={1500}
              placeholder={t("chat.placeholder", "Type your message...")}
              aria-label={t("chat.placeholder", "Type your message...")}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-xs text-foreground outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-600/10"
            />
            <button
              type="submit"
              disabled={!messageText.trim() || isSending}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary-700 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
              title={t("chat.send", "Send")}
              aria-label={t("chat.send", "Send")}
            >
              {isSending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Send size={15} className="rtl:-scale-x-100" />
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
