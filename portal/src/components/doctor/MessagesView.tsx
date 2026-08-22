import React, { useState, useMemo, FormEvent } from "react";
import { RefreshCw, Search, X, MessageCircle, Send } from "lucide-react";
import { Loading, EmptyState } from "../ui/StateIndicators";
import { Field } from "../ui/FormElements";
import { inputClass } from "../../utils/designTokens";

export interface DoctorMessageFormState {
  subject: string;
  body: string;
  appointmentId: string;
  examId: string;
}

export interface MessagesViewProps {
  messages: any[];
  loading?: boolean;
  onRefresh?: () => void;
  form: DoctorMessageFormState;
  setForm: React.Dispatch<React.SetStateAction<DoctorMessageFormState>>;
  onSubmit: (e: FormEvent) => void;
  sending?: boolean;
  locale?: string;
  t: any;
}

export const MessagesView = ({
  messages = [],
  loading = false,
  onRefresh,
  form,
  setForm,
  onSubmit,
  sending = false,
  locale = "en-GB",
  t,
}: MessagesViewProps) => {
  const [query, setQuery] = useState("");
  const [senderFilter, setSenderFilter] = useState("all");
  const quickSubjects = ["caseFollowUp", "reportQuestion", "urgentScheduling"];

  const newestMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const first = Date.parse(a.created_at) || 0;
        const second = Date.parse(b.created_at) || 0;
        return second - first;
      }),
    [messages],
  );

  const filteredMessages = useMemo(() => {
    const term = query.trim().toLowerCase();
    return newestMessages.filter((message: any) => {
      const senderMatch = senderFilter === "all" || message.sender_role === senderFilter;
      const text = [message.subject, message.body, message.staff_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return senderMatch && (!term || text.includes(term));
    });
  }, [newestMessages, query, senderFilter]);

  const stats = {
    all: messages.length,
    staff: messages.filter((message: any) => message.sender_role === "Staff").length,
    doctor: messages.filter((message: any) => message.sender_role === "Doctor").length,
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              {t("doctor.messages.secureThread", "Clinical Communications")}
            </p>
            <h2 className="text-base font-extrabold text-foreground">
              {t("doctor.messages.thread", "Messages & Queries")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-bold text-muted-foreground hover:bg-muted transition"
            title={t("actions.refresh", "Refresh")}
          >
            <RefreshCw size={12} />
            <span>{t("actions.refresh", "Refresh")}</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["all", stats.all],
            ["Staff", stats.staff],
            ["Doctor", stats.doctor],
          ].map(([key, value]) => (
            <button
              type="button"
              key={String(key)}
              onClick={() => setSenderFilter(key === "all" ? "all" : String(key))}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-start transition ${
                senderFilter === (key === "all" ? "all" : key)
                  ? "border-primary bg-primary-soft text-primary font-bold"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <p className="font-bold text-[10px] uppercase">
                {t(`doctor.messages.filters.${key}`, String(key))}
              </p>
              <p className="mt-0.5 text-lg font-black leading-none">{value}</p>
            </button>
          ))}
        </div>

        <div className="relative mt-4">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground start-3"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("doctor.messages.search", "Search messages...")}
            className={`${inputClass} px-9`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground end-2"
              title={t("doctor.messages.clearSearch", "Clear")}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {loading ? (
          <Loading label={t("doctor.messages.loading", "Loading messages...")} />
        ) : filteredMessages.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title={t("doctor.messages.emptyTitle", "No messages")}
            description={
              messages.length
                ? t("doctor.messages.emptyFiltered", "No messages match your search filter.")
                : t("doctor.messages.emptyDescription", "Send a query to the center team.")
            }
          />
        ) : (
          <div className="mt-5 flex max-h-[620px] flex-col gap-4 overflow-y-auto pe-1">
            {filteredMessages.map((message: any) => {
              const mine = message.sender_role === "Doctor";
              return (
                <article
                  key={message.message_id}
                  className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl px-4 py-3 shadow-sm ${
                      mine
                        ? "bg-primary text-white"
                        : "bg-background border border-border text-foreground"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase opacity-80">
                      <MessageCircle size={12} />
                      <span>
                        {mine
                          ? t("doctor.messages.you", "You (Doctor)")
                          : message.staff_name || t("doctor.messages.centerTeam", "Center Team")}
                      </span>
                    </div>
                    {message.subject && <p className="mb-1 text-xs font-bold">{message.subject}</p>}
                    <p className="whitespace-pre-wrap text-xs leading-relaxed">{message.body}</p>
                  </div>
                  <p className="mt-1 px-1 text-[10px] text-muted-foreground">
                    {new Date(message.created_at).toLocaleString(locale, {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-24">
        <h2 className="font-extrabold text-sm text-foreground">
          {t("doctor.messages.compose", "Compose Message")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {quickSubjects.map((key) => (
            <button
              type="button"
              key={key}
              onClick={() =>
                setForm((current: DoctorMessageFormState) => ({
                  ...current,
                  subject: t(`doctor.messages.quickSubjects.${key}`, key),
                }))
              }
              className="rounded-lg border border-border bg-background px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:border-primary/40 hover:text-primary transition"
            >
              {t(`doctor.messages.quickSubjects.${key}`, key)}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <Field label={t("doctor.messages.subject", "Subject")}>
            <input
              value={form.subject}
              onChange={(event) =>
                setForm((current: DoctorMessageFormState) => ({
                  ...current,
                  subject: event.target.value,
                }))
              }
              placeholder={t("doctor.messages.subjectPlaceholder", "Subject / Topic")}
              className={inputClass}
            />
          </Field>
          <Field label={t("doctor.messages.body", "Message Body")} required>
            <textarea
              value={form.body}
              onChange={(event) =>
                setForm((current: DoctorMessageFormState) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
              placeholder={t(
                "doctor.messages.bodyPlaceholder",
                "Write clinical question or follow-up note...",
              )}
              rows={5}
              required
              className={`${inputClass} h-auto py-3`}
            />
          </Field>
          {(form.appointmentId || form.examId) && (
            <div className="rounded-xl border border-primary/20 bg-primary-soft p-3 text-xs font-bold text-primary">
              {t("doctor.messages.linkedCase", "Linked to selected case.")}
            </div>
          )}
          <button
            type="submit"
            disabled={sending || !form.body.trim()}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
          >
            {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            <span>
              {sending
                ? t("doctor.messages.sending", "Sending...")
                : t("doctor.messages.send", "Send Message")}
            </span>
          </button>
        </form>
      </section>
    </div>
  );
};

export default MessagesView;
