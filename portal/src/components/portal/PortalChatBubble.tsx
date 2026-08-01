import React, { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Bot, User, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  fetchPatientChatMessages,
  sendPatientChatMessage,
  fetchDoctorMessages,
  sendDoctorMessageApi,
} from "@/lib/api";
import { useCenterSettings } from "@/hooks/use-center-settings";

interface PortalChatBubbleProps {
  role?: "patient" | "doctor";
}

interface ChatMessage {
  id: string;
  sender: string;
  role: string;
  text: string;
  time: string;
  isMe: boolean;
}

export function PortalChatBubble({ role = "patient" }: PortalChatBubbleProps) {
  const { t, lang } = useLang();
  const { centerName } = useCenterSettings();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isDoctor = role === "doctor";

  // Load chat messages from backend API
  const loadChat = useCallback(async () => {
    try {
      if (isDoctor) {
        const msgs = await fetchDoctorMessages();
        if (Array.isArray(msgs)) {
          setMessages(
            msgs.map((m) => ({
              id: String(m.message_id || m.id),
              sender: m.sender_name || (m.sender_role === "Doctor" ? "You" : "Radiologist"),
              role: m.sender_role || "Staff",
              text: m.body || m.text || "",
              time: m.created_at || "",
              isMe: m.sender_role === "Doctor",
            })),
          );
        }
      } else {
        const msgs = await fetchPatientChatMessages();
        if (Array.isArray(msgs)) {
          setMessages(
            msgs.map((m) => ({
              id: String(m.message_id || m.id),
              sender: m.sender_role === "Patient" ? "You" : m.staff_name || centerName,
              role: m.sender_role || "Staff",
              text: m.body || m.text || "",
              time: m.created_at || "",
              isMe: m.sender_role === "Patient",
            })),
          );
        }
      }
    } catch {
      /* ignore unavailable backend data */
    }
  }, [centerName, isDoctor]);

  useEffect(() => {
    if (open) {
      loadChat();
      setUnreadCount(0);
    }
  }, [open, loadChat]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // Background polling every 12 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadChat();
    }, 12000);
    return () => clearInterval(interval);
  }, [loadChat]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const txt = input;
    setSending(true);

    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender: "You",
      role: isDoctor ? "Doctor" : "Patient",
      text: txt,
      time: new Date().toISOString(),
      isMe: true,
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput("");

    try {
      if (isDoctor) {
        await sendDoctorMessageApi(txt);
      } else {
        await sendPatientChatMessage(txt);
      }
      toast.success(t("toast.messageSent", "Message sent to reading room"));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(txt);
      toast.error(t("toast.messageFailed", "Failed to send message"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-24 right-4 z-[60] md:bottom-6 md:right-6 rtl:right-auto rtl:left-4 md:rtl:left-6">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open support chat"
          className="relative grid h-14 w-14 place-items-center rounded-full gradient-hero text-primary-foreground shadow-elevated transition hover:scale-105 active:scale-95"
        >
          <MessageCircle className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-background bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </button>
      ) : (
        <div className="flex h-[min(450px,calc(100vh-8rem))] w-[calc(100vw-2rem)] max-w-96 flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-elevated fade-in-up sm:w-96">
          {/* Widget Header */}
          <div className="flex items-center justify-between border-b border-border gradient-hero px-5 py-3.5 text-primary-foreground">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/15 backdrop-blur">
                <Bot className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold">
                  {isDoctor
                    ? t("portal.readingRoomChat", "Reading Room Chat")
                    : t("portal.supportChat", `${centerName} Support`)}
                </p>
                <p className="text-[10px] opacity-80 uppercase tracking-widest">
                  {t("portal.onlineDesk", "Radiology Desk Active")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={loadChat}
                className="grid h-7 w-7 place-items-center rounded-lg text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground transition"
                title="Refresh messages"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-lg text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-alt/50">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <MessageCircle className="h-8 w-8 opacity-30 mb-2" />
                <p className="text-xs font-semibold">{t("portal.startChat", "No messages yet")}</p>
                <p className="text-[11px] mt-0.5">
                  {t(
                    "portal.chatHint",
                    "Send a message to consult with our desk or reading room staff.",
                  )}
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.isMe ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-2xl p-3 text-xs leading-relaxed ${
                      m.isMe
                        ? "bg-primary text-primary-foreground rounded-br-none shadow-soft"
                        : "bg-surface border border-border text-foreground rounded-bl-none shadow-soft"
                    }`}
                  >
                    {!m.isMe && (
                      <p className="text-[10px] font-semibold text-primary mb-0.5">{m.sender}</p>
                    )}
                    <p>{m.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="flex gap-2 border-t border-border bg-surface p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("portal.messagePlaceholder", "Type your message...")}
              className="h-10 flex-1 rounded-full border border-input bg-surface-alt px-4 text-xs outline-none transition focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
