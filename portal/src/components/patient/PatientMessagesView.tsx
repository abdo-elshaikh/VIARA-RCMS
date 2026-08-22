import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  X,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { useGetMyMessagesQuery, useSendPortalMessageMutation } from "../../store/api";
import { getErrorMessage } from "@/utils/getErrorMessage";

interface PatientMessagesViewProps {
  onRequestAppointment?: () => void;
}

export default function PatientMessagesView({ onRequestAppointment }: PatientMessagesViewProps) {
  const { t, i18n } = useTranslation("portal");
  const [messageText, setMessageText] = useState("");
  const [query, setQuery] = useState("");
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const dateLocale = (i18n.resolvedLanguage || i18n.language || "en").startsWith("ar")
    ? "ar-EG"
    : undefined;
  const maxLength = 1500;
  const quickMessages = [
    {
      key: "appointment",
      icon: Calendar,
      label: t("chat.quickLabels.appointment", "Appointment"),
      text: t("chat.quick.appointment", "I need help with booking or changing an appointment."),
    },
    {
      key: "preparation",
      icon: CheckCircle2,
      label: t("chat.quickLabels.preparation", "Preparation"),
      text: t("chat.quick.preparation", "Please confirm the preparation instructions for my scan."),
    },
    {
      key: "report",
      icon: MessageSquare,
      label: t("chat.quickLabels.report", "Report access"),
      text: t("chat.quick.report", "I have a question about my report or document access."),
    },
  ];

  const {
    data: messages = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetMyMessagesQuery(undefined, {
    pollingInterval: 8000,
  });
  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const first = Date.parse(a.created_at) || 0;
        const second = Date.parse(b.created_at) || 0;
        return first - second;
      }),
    [messages],
  );
  const latestMessage = sortedMessages[sortedMessages.length - 1];
  const filteredMessages = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sortedMessages;
    return sortedMessages.filter((message) =>
      [message.body, message.staff_name, message.sender_role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, sortedMessages]);
  const stats = useMemo(
    () => ({
      total: sortedMessages.length,
      support: sortedMessages.filter((message) => message.sender_role === "Staff").length,
      patient: sortedMessages.filter((message) => message.sender_role === "Patient").length,
    }),
    [sortedMessages],
  );
  const [sendPortalMessage, { isLoading: isSending }] = useSendPortalMessageMutation();

  useEffect(() => {
    if (!query.trim()) messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [query, sortedMessages]);

  useEffect(() => {
    const handleMessageUpdate = () => {
      refetch();
    };
    window.addEventListener("SSE_PATIENT_MESSAGE_UPDATE", handleMessageUpdate);
    return () => window.removeEventListener("SSE_PATIENT_MESSAGE_UPDATE", handleMessageUpdate);
  }, [refetch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = messageText.trim();
    if (!body) return;

    try {
      await sendPortalMessage({ body }).unwrap();
      setMessageText("");
    } catch (error) {
      toast.error(getErrorMessage(error, t("chat.sendFailed", "Failed to send message")));
    }
  };

  const addQuickMessage = (text: string) => {
    setMessageText((current) =>
      (current ? `${current.trim()}\n${text}` : text).slice(0, maxLength),
    );
  };

  const formatDay = (value: string) =>
    new Date(value).toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-[36rem] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-background p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("chat.secureThread", "Encrypted Diagnostic Support")}
              </span>
              <h3 className="mt-1 font-sans text-xl font-extrabold text-foreground">
                {t("chat.title", "Radiology Desk Chat")}
              </h3>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
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
                      "Ask questions regarding your scan preparation, booking status, or report delivery.",
                    )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground start-3"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("chat.search", "Search messages")}
                  className="h-10 w-full min-w-[210px] rounded-xl border border-border bg-surface px-9 text-xs font-semibold text-foreground outline-none transition focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-primary-50 hover:text-primary-800 end-2"
                    title={t("chat.clearSearch", "Clear search")}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-xs font-bold text-foreground transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 disabled:opacity-60"
                title={t("chat.refreshTitle", "Refresh Chat")}
              >
                <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
                {t("common.refresh", "Refresh")}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["total", stats.total, t("chat.metrics.total", "Messages")],
              ["support", stats.support, t("chat.metrics.support", "Desk replies")],
              ["patient", stats.patient, t("chat.metrics.patient", "Sent by you")],
            ].map(([key, value, label]) => (
              <div
                key={key as string}
                className="rounded-lg border border-border bg-surface px-4 py-2.5 shadow-sm"
              >
                <p className="font-sans text-xl font-extrabold leading-none text-foreground">
                  {value}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-background p-5">
          {filteredMessages.length === 0 ? (
            <div className="flex min-h-[22rem] flex-col items-center justify-center text-center text-muted-foreground">
              <MessageSquare size={32} className="mb-3 text-primary-600 opacity-70" />
              <p className="text-sm font-bold text-foreground">
                {query
                  ? t("chat.noSearchResults", "No messages match your search.")
                  : t(
                      "chat.emptyState",
                      "Send a message to our radiology support team for guidance with appointments or reports.",
                    )}
              </p>
            </div>
          ) : (
            filteredMessages.map((msg, i) => {
              const isMe = msg.sender_role === "Patient";
              const time = new Date(msg.created_at).toLocaleTimeString(dateLocale, {
                hour: "2-digit",
                minute: "2-digit",
              });
              const day = formatDay(msg.created_at);
              const previousDay = i > 0 ? formatDay(filteredMessages[i - 1].created_at) : null;

              return (
                <React.Fragment key={msg.message_id || i}>
                  {day !== previousDay && (
                    <div className="flex justify-center my-2">
                      <span className="rounded-full border border-border bg-surface px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-sm">
                        {day}
                      </span>
                    </div>
                  )}
                  <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className="mb-1 flex items-center gap-1.5 px-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {isMe
                          ? t("chat.you", "You")
                          : msg.staff_name || t("chat.supportAgent", "Radiology Desk Agent")}
                      </span>
                      <span className="text-[9px] font-semibold text-muted-foreground">{time}</span>
                    </div>
                    <div
                      className={`max-w-[82%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                        isMe
                          ? "rounded-tr-none bg-primary text-primary-foreground"
                          : "rounded-tl-none border border-border bg-surface text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
          <div ref={messageEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 border-t border-border bg-surface p-5">
          <div className="flex flex-wrap gap-2">
            {quickMessages.map(({ key, icon: Icon, label, text }) => (
              <button
                key={key}
                type="button"
                onClick={() => addQuickMessage(text)}
                className="inline-flex h-8 items-center gap-2 rounded-xl border border-border bg-background px-3 text-[11px] font-bold text-muted-foreground transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 dark:hover:bg-primary-900/20"
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) handleSubmit(event);
                }}
                maxLength={maxLength}
                rows={3}
                placeholder={t("chat.placeholder", "Type your message...")}
                className="h-auto min-h-[5rem] w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15"
              />
              <p className="mt-1 text-end text-[10px] font-semibold text-muted-foreground">
                {messageText.length}/{maxLength}
              </p>
            </div>
            <button
              type="submit"
              disabled={!messageText.trim() || isSending}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:bg-primary-700 active:scale-[0.98] disabled:opacity-50"
              title={t("chat.send", "Send")}
            >
              {isSending ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Send size={18} className="rtl:-scale-x-100" />
              )}
            </button>
          </div>
        </form>
      </section>

      <aside className="space-y-5">
        <section className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-primary-700 dark:text-primary-300">
            {t("chat.side.status", "Support status")}
          </span>
          <h3 className="font-sans text-base font-extrabold text-foreground">
            {t("chat.side.ready", "Care team active")}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(
              "chat.side.description",
              "Share appointment, preparation, billing, or report questions here.",
            )}
          </p>
          <div className="flex items-start gap-2.5 rounded-2xl border border-primary-100 bg-primary-50/70 p-3.5 text-xs font-semibold leading-relaxed text-primary-800 dark:border-primary-900/50 dark:bg-primary-900/30 dark:text-primary-300">
            <Clock size={16} className="shrink-0 mt-0.5" />
            <span>
              {t(
                "chat.side.responseNote",
                "For urgent clinical concerns, please call our 24/7 center hotline directly.",
              )}
            </span>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("chat.side.shortcuts", "Quick Shortcuts")}
          </span>
          <div className="grid gap-2.5">
            {onRequestAppointment && (
              <button
                type="button"
                onClick={onRequestAppointment}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary-700"
              >
                <Calendar size={15} />
                {t("patient.panels.appointmentRequest", "Request an appointment")}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                addQuickMessage(
                  t("chat.quick.billing", "I need help with billing, payment, or receipt details."),
                )
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-xs font-bold text-foreground transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800"
            >
              <MessageSquare size={15} />
              {t("chat.side.billing", "Ask about billing")}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
