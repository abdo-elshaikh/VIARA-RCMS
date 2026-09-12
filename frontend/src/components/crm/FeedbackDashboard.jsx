import { useMemo, useState } from 'react';
import { AlertTriangle, MessageCircle, Quote, RefreshCw, Search, Star, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetFeedbackQuery } from '../../store/api';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-amber-600 focus:ring-4 focus:ring-amber-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const FeedbackDashboard = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`marketing.feedback.${key}`, options);
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const { data: feedbackList = [], isLoading, isError, refetch, isFetching } = useGetFeedbackQuery();
    const [ratingFilter, setRatingFilter] = useState('all');
    const [search, setSearch] = useState('');

    const visibleFeedback = useMemo(() => {
        const q = search.trim().toLowerCase();
        return feedbackList.filter(feedback => {
            if (ratingFilter !== 'all' && Number(feedback.rating) !== Number(ratingFilter)) return false;
            return !q || [feedback.patient_name, feedback.patient_phone, feedback.source, feedback.comments].filter(Boolean).join(' ').toLowerCase().includes(q);
        });
    }, [feedbackList, ratingFilter, search]);

    const summary = useMemo(() => {
        const total = feedbackList.length;
        const average = total ? feedbackList.reduce((acc, item) => acc + Number(item.rating || 0), 0) / total : 0;
        const promoters = feedbackList.filter(item => Number(item.rating) >= 4).length;
        const low = feedbackList.filter(item => Number(item.rating) <= 2).length;
        return { total, average, promoters, low, comments: feedbackList.filter(item => item.comments).length };
    }, [feedbackList]);

    const countByRating = stars => feedbackList.filter(feedback => Number(feedback.rating) === stars).length;
    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

    return (
        <div className="space-y-5">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label={copy('summaryLabel')}>
                <Metric icon={Star} label={copy('average')} value={summary.average.toFixed(1)} tone="amber" />
                <Metric icon={MessageCircle} label={copy('reviews')} value={summary.total} tone="blue" />
                <Metric icon={ThumbsUp} label={copy('promoters')} value={summary.promoters} tone="emerald" />
                <Metric icon={AlertTriangle} label={copy('lowRatings')} value={summary.low} tone="rose" />
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <header className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/70 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"><MessageCircle size={19} /></span>
                        <div>
                            <h2 className="font-black text-slate-900 dark:text-white">{copy('title')}</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy('description')}</p>
                        </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_auto]">
                        <label className="relative">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>
                        <select value={ratingFilter} onChange={event => setRatingFilter(event.target.value)} className={inputClass}>
                            <option value="all">{copy('allRatings')}</option>
                            {[5, 4, 3, 2, 1].map(stars => <option key={stars} value={stars}>{copy('stars', { count: stars })}</option>)}
                        </select>
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />{copy('refresh')}</button>
                    </div>
                </header>

                {isLoading ? <Loading label={copy('loading')} /> : isError ? <ErrorState label={copy('loadError')} retry={copy('retry')} onRetry={refetch} /> : feedbackList.length === 0 ? <Empty title={copy('empty')} description={copy('emptyDescription')} /> : (
                    <div className="grid gap-5 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                        <aside className="space-y-4">
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-center dark:border-amber-900 dark:bg-amber-400/10">
                                <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">{copy('average')}</p>
                                <p className="mt-2 text-5xl font-black text-amber-600 dark:text-amber-300">{summary.average.toFixed(1)}</p>
                                <div className="mt-2 flex justify-center gap-1">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={20} className={i <= Math.round(summary.average) ? 'fill-amber-400 text-amber-400' : 'text-amber-200'} />)}</div>
                                <p className="mt-3 text-xs font-bold text-amber-800 dark:text-amber-200">{copy('basedOn', { count: summary.total })}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                                <h3 className="font-black text-slate-800 dark:text-white">{copy('breakdown')}</h3>
                                <div className="mt-4 space-y-3">{[5, 4, 3, 2, 1].map(stars => { const count = countByRating(stars); const percent = summary.total ? count / summary.total * 100 : 0; return <div key={stars} className="flex items-center gap-3"><div className="flex w-12 items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300">{stars}<Star size={12} className="fill-slate-400 text-slate-400" /></div><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className={`h-full ${stars >= 4 ? 'bg-emerald-500' : stars === 3 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${percent}%` }} /></div><div className="w-8 text-end text-xs font-black text-slate-500">{count}</div></div>; })}</div>
                            </div>
                        </aside>

                        <div>
                            <h3 className="mb-3 font-black text-slate-900 dark:text-white">{copy('commentsTitle', { count: visibleFeedback.filter(item => item.comments).length })}</h3>
                            {visibleFeedback.filter(item => item.comments).length === 0 ? <Empty title={copy('noComments')} description={copy('noCommentsDescription')} compact /> : <div className="grid max-h-[680px] gap-3 overflow-y-auto pe-1">{visibleFeedback.filter(item => item.comments).map(feedback => <FeedbackCard key={feedback.feedback_id} feedback={feedback} copy={copy} formatDate={formatDate} />)}</div>}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

const toneClass = { amber: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300', blue: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300', emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300', rose: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300' };
const Metric = ({ icon: Icon, label, value, tone }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-black uppercase leading-4 tracking-wider text-slate-400">{label}</p><span className={`hidden h-9 w-9 items-center justify-center rounded-xl sm:flex ${toneClass[tone]}`}><Icon size={17} /></span></div><p className="mt-2 font-mono text-2xl font-black text-slate-950 dark:text-white whitespace-nowrap">{value}</p></article>;
const FeedbackCard = ({ feedback, copy, formatDate }) => <article className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><Quote size={34} className="absolute end-4 top-4 text-slate-100 dark:text-slate-800" /><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">{feedback.patient_name?.[0] || '?'}</span><div><p className="font-black text-slate-900 dark:text-white">{feedback.patient_name || copy('unknownPatient')}</p><p className="mt-1 text-xs text-slate-400">{formatDate(feedback.created_at)} <span aria-hidden="true">&bull;</span> {feedback.source || copy('unknownSource')}</p></div></div><div className="flex gap-1">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={14} className={i <= Number(feedback.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />)}</div></div><p className="relative z-10 mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{feedback.comments}</p></article>;
const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{label}</div>;
const ErrorState = ({ label, retry, onRetry }) => <div role="alert" className="p-10 text-center"><p className="font-bold text-rose-600">{label}</p><button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">{retry}</button></div>;
const Empty = ({ title, description, compact }) => <div className={`${compact ? 'p-8' : 'p-12'} text-center`}><MessageCircle size={34} className="mx-auto text-slate-300" /><p className="mt-3 font-black text-slate-800 dark:text-white">{title}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>;

export default FeedbackDashboard;
