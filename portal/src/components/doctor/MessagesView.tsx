import React, { useState, useMemo } from 'react';
import { RefreshCw, Search, X, MessageCircle, Send } from 'lucide-react';
import { Loading, EmptyState } from '../ui/StateIndicators';
import { Field } from '../ui/FormElements';
import { inputClass } from '../../utils/designTokens';

const MessagesView = ({ messages, loading, onRefresh, form, setForm, onSubmit, sending, locale, t }) => {
    const [query, setQuery] = useState('');
    const [senderFilter, setSenderFilter] = useState('all');
    const quickSubjects = ['caseFollowUp', 'reportQuestion', 'urgentScheduling'];
    const newestMessages = useMemo(() => [...messages].sort((a, b) => {
        const first = Date.parse(a.created_at) || 0;
        const second = Date.parse(b.created_at) || 0;
        return second - first;
    }), [messages]);

    const filteredMessages = useMemo(() => {
        const term = query.trim().toLowerCase();
        return newestMessages.filter(message => {
            const senderMatch = senderFilter === 'all' || message.sender_role === senderFilter;
            const text = [message.subject, message.body, message.staff_name].filter(Boolean).join(' ').toLowerCase();
            return senderMatch && (!term || text.includes(term));
        });
    }, [newestMessages, query, senderFilter]);
    
    const stats = {
        all: messages.length,
        staff: messages.filter(message => message.sender_role === 'Staff').length,
        doctor: messages.filter(message => message.sender_role === 'Doctor').length,
    };

    return (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-3xl border border-slate-200/50 bg-white/50 backdrop-blur-md p-5 shadow-sm dark:border-white/10 dark:bg-[#0b1426]/50">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-primary-700 dark:text-primary-300">{t('doctor.messages.secureThread')}</p>
                        <h2 className="font-display mt-1 text-lg font-semibold text-slate-950 dark:text-white">{t('doctor.messages.thread')}</h2>
                    </div>
                    <button type="button" onClick={onRefresh} className="font-display inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900/50" title={t('actions.refresh', { ns: 'common', defaultValue: 'Refresh' })}>
                        <RefreshCw size={12} />
                        {t('actions.refresh', { ns: 'common', defaultValue: 'Refresh' })}
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                        ['all', stats.all],
                        ['Staff', stats.staff],
                        ['Doctor', stats.doctor],
                    ].map(([key, value]) => (
                        <button
                            type="button"
                            key={key}
                            onClick={() => setSenderFilter(key === 'all' ? 'all' : key)}
                            className={`rounded-xl border px-3 py-2 text-start transition ${senderFilter === (key === 'all' ? 'all' : key) ? 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-200' : 'border-border bg-background text-muted-foreground hover:bg-primary-50 hover:text-primary-800'}`}
                        >
                            <p className="font-medium text-[10px] uppercase">{t(`doctor.messages.filters.${key}`)}</p>
                            <p className="font-display mt-0.5 text-lg font-semibold leading-none">{value}</p>
                        </button>
                    ))}
                </div>

                <div className="relative mt-4">
                    <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 start-3" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('doctor.messages.search')}
                        className={`${inputClass} px-9`}
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery('')} className="absolute top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 end-2 dark:hover:bg-white/10 dark:hover:text-slate-200" title={t('doctor.messages.clearSearch')}>
                            <X size={13} />
                        </button>
                    )}
                </div>

                {loading ? <Loading label={t('doctor.messages.loading')} /> : filteredMessages.length === 0 ? (
                    <EmptyState icon={MessageCircle} title={t('doctor.messages.emptyTitle')} description={messages.length ? t('doctor.messages.emptyFiltered') : t('doctor.messages.emptyDescription')} />
                ) : (
                    <div className="mt-5 flex max-h-[620px] flex-col gap-4 overflow-y-auto pe-1">
                        {filteredMessages.map(message => {
                            const mine = message.sender_role === 'Doctor';
                            return (
                                <article key={message.message_id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${mine ? 'bg-gradient-to-r from-primary-600 to-primary-900 text-white' : 'bg-background text-foreground'}`}>
                                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase opacity-75">
                                            <MessageCircle size={12} />
                                            {mine ? t('doctor.messages.you') : (message.staff_name || t('doctor.messages.centerTeam'))}
                                        </div>
                                        {message.subject && <p className="mb-1 text-xs font-black">{message.subject}</p>}
                                        <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                                    </div>
                                    <p className="mt-1 px-1 text-[10px] text-slate-400">{new Date(message.created_at).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-slate-200/50 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0b1426] lg:sticky lg:top-24">
                <h2 className="font-black text-slate-950 dark:text-white">{t('doctor.messages.compose')}</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                    {quickSubjects.map(key => (
                        <button
                            type="button"
                            key={key}
                            onClick={() => setForm(current => ({ ...current, subject: t(`doctor.messages.quickSubjects.${key}`) }))}
                            className="rounded-xl border border-border bg-background px-3 py-1.5 text-[10px] font-black text-muted-foreground transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 dark:hover:bg-primary-900/20"
                        >
                            {t(`doctor.messages.quickSubjects.${key}`)}
                        </button>
                    ))}
                </div>
                <form onSubmit={onSubmit} className="mt-5 space-y-4">
                    <Field label={t('doctor.messages.subject')}>
                        <input value={form.subject} onChange={(event) => setForm(current => ({ ...current, subject: event.target.value }))} placeholder={t('doctor.messages.subjectPlaceholder')} className={inputClass} />
                    </Field>
                    <Field label={t('doctor.messages.body')} required>
                        <textarea value={form.body} onChange={(event) => setForm(current => ({ ...current, body: event.target.value }))} placeholder={t('doctor.messages.bodyPlaceholder')} rows={6} required className={`${inputClass} h-auto py-3`} />
                    </Field>
                    {(form.appointmentId || form.examId) && (
                        <div className="rounded-xl border border-primary-100 bg-primary-50 p-3 text-xs font-semibold text-primary-900 dark:border-primary-900/50 dark:bg-primary-900/20 dark:text-primary-200">
                            {t('doctor.messages.linkedCase', { defaultValue: 'Linked to selected case.' })}
                        </div>
                    )}
                    <button type="submit" disabled={sending || !form.body.trim()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-900 text-sm font-black text-white shadow-md shadow-primary-900/20 transition hover:from-primary-500 hover:to-primary-800 disabled:opacity-60">
                        {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                        {sending ? t('doctor.messages.sending') : t('doctor.messages.send')}
                    </button>
                </form>
                <p className="mt-4 rounded-xl border border-primary-100 bg-primary-50 p-3 text-xs leading-5 text-primary-900 dark:border-primary-900/50 dark:bg-primary-900/20 dark:text-primary-300"><strong>{t('doctor.messages.noteLabel')}</strong> {t('doctor.messages.note')}</p>
            </section>
        </div>
    );
};

export default MessagesView;
