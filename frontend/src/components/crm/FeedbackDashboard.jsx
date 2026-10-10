import { useMemo, useState } from 'react';
import { AlertTriangle, MessageCircle, Plus, Quote, RefreshCw, Search, Star, ThumbsUp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGetFeedbackQuery, useGetPatientsQuery, useSubmitFeedbackMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-amber-600 focus:ring-4 focus:ring-amber-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const FeedbackDashboard = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`marketing.feedback.${key}`, options);
    const isArabic = i18n.language?.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const { data: feedbackList = [], isLoading, isError, refetch, isFetching } = useGetFeedbackQuery();
    const [submitFeedback, { isLoading: isSubmitting }] = useSubmitFeedbackMutation();

    const [ratingFilter, setRatingFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showNewModal, setShowNewModal] = useState(false);

    // New feedback form state
    const [feedbackForm, setFeedbackForm] = useState({
        patientId: '',
        rating: 5,
        comments: '',
        source: 'Phone'
    });
    const [patientSearch, setPatientSearch] = useState('');
    const { data: patientsData } = useGetPatientsQuery(
        { limit: 20, q: patientSearch.trim() || undefined },
        { skip: !showNewModal }
    );
    const patientOptions = Array.isArray(patientsData)
        ? patientsData
        : Array.isArray(patientsData?.data)
            ? patientsData.data
            : [];

    const selectedPatient = patientOptions.find(p => (p.patient_id || p.id) === feedbackForm.patientId);

    const handleCreateFeedback = async (e) => {
        e.preventDefault();
        if (!feedbackForm.patientId) {
            toast.error(isArabic ? 'يرجى اختيار المريض أولاً' : 'Please select a patient first');
            return;
        }
        try {
            await submitFeedback({
                patientId: feedbackForm.patientId,
                rating: Number(feedbackForm.rating),
                comments: feedbackForm.comments.trim() || undefined,
                source: feedbackForm.source
            }).unwrap();
            toast.success(isArabic ? 'تم تسجيل تقييم المريض بنجاح' : 'Feedback submitted successfully');
            setShowNewModal(false);
            setFeedbackForm({ patientId: '', rating: 5, comments: '', source: 'Phone' });
            setPatientSearch('');
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'تعذر تسجيل التقييم' : 'Failed to submit feedback'));
        }
    };

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
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="relative min-w-[200px] flex-1 sm:flex-none">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>
                        <select value={ratingFilter} onChange={event => setRatingFilter(event.target.value)} className={`${inputClass} w-auto`}>
                            <option value="all">{copy('allRatings')}</option>
                            {[5, 4, 3, 2, 1].map(stars => <option key={stars} value={stars}>{copy('stars', { count: stars })}</option>)}
                        </select>
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {copy('refresh')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowNewModal(true)}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700 transition shadow-xs"
                        >
                            <Plus size={16} />
                            <span>{isArabic ? 'تسجيل تقييم جديد' : 'Log Feedback'}</span>
                        </button>
                    </div>
                </header>

                {/* Log Feedback Modal */}
                {showNewModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
                        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="rounded-xl bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                        <Star size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-slate-900 dark:text-white">
                                            {isArabic ? 'تسجيل تقييم مريض جديد' : 'Log New Patient Feedback'}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {isArabic ? 'تسجيل تقييم شفهي أو هاتفي أو استبيان مباشر' : 'Record feedback from call, visit, or survey'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowNewModal(false)}
                                    className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleCreateFeedback} className="mt-5 space-y-4">
                                {/* Patient search & pick */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {isArabic ? 'اختيار المريض *' : 'Select Patient *'}
                                    </label>
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={patientSearch}
                                            onChange={(e) => setPatientSearch(e.target.value)}
                                            placeholder={isArabic ? 'بحث بالاسم أو الرقم الطبي (MRN)...' : 'Search by name or MRN...'}
                                            className={inputClass}
                                        />
                                        {patientOptions.length > 0 && (
                                            <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-1 dark:border-slate-700 dark:bg-slate-800/80">
                                                {patientOptions.map(p => {
                                                    const pId = p.patient_id || p.id;
                                                    const pName = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.patient_name || 'Patient';
                                                    const isSelected = feedbackForm.patientId === pId;
                                                    return (
                                                        <button
                                                            key={pId}
                                                            type="button"
                                                            onClick={() => {
                                                                setFeedbackForm(curr => ({ ...curr, patientId: pId }));
                                                                setPatientSearch(pName);
                                                            }}
                                                            className={`w-full text-start rounded-lg px-3 py-2 text-xs font-bold transition flex items-center justify-between ${
                                                                isSelected
                                                                    ? 'bg-amber-600 text-white'
                                                                    : 'hover:bg-white dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                                                            }`}
                                                        >
                                                            <span>{pName}</span>
                                                            <span className="font-mono text-[11px] opacity-75">{p.mrn}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {selectedPatient && (
                                            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                                ✓ {isArabic ? 'المريض المحدد:' : 'Selected:'} {selectedPatient.name || `${selectedPatient.first_name || ''} ${selectedPatient.last_name || ''}`} ({selectedPatient.mrn})
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Rating (Interactive Stars) */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {isArabic ? 'التقييم (1-5) *' : 'Rating (1-5) *'}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                type="button"
                                                onClick={() => setFeedbackForm(curr => ({ ...curr, rating: star }))}
                                                className="p-1 transition hover:scale-110"
                                            >
                                                <Star
                                                    size={28}
                                                    className={star <= feedbackForm.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'}
                                                />
                                            </button>
                                        ))}
                                        <span className="ms-2 font-mono text-lg font-black text-amber-600 dark:text-amber-300">
                                            {feedbackForm.rating} / 5
                                        </span>
                                    </div>
                                </div>

                                {/* Source */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {isArabic ? 'مصدر التقييم *' : 'Feedback Source *'}
                                    </label>
                                    <select
                                        value={feedbackForm.source}
                                        onChange={(e) => setFeedbackForm(curr => ({ ...curr, source: e.target.value }))}
                                        className={inputClass}
                                    >
                                        <option value="Phone">{isArabic ? 'مكالمة هاتفية' : 'Phone'}</option>
                                        <option value="Survey">{isArabic ? 'استبيان رسمي' : 'Survey'}</option>
                                        <option value="Kiosk">{isArabic ? 'كشك أو جهاز الخدمة' : 'Kiosk'}</option>
                                        <option value="Portal">{isArabic ? 'بوابة المريض' : 'Portal'}</option>
                                    </select>
                                </div>

                                {/* Comments */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {isArabic ? 'ملاحظات وتعليق المريض' : 'Comments & Notes'}
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={feedbackForm.comments}
                                        onChange={(e) => setFeedbackForm(curr => ({ ...curr, comments: e.target.value }))}
                                        placeholder={isArabic ? 'ماذا قال المريض عن الخدمة، الطاقم، سرعة النتائج...' : 'Patient feedback notes, comments, suggestions...'}
                                        className={inputClass}
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewModal(false)}
                                        className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        {isArabic ? 'إلغاء' : 'Cancel'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !feedbackForm.patientId}
                                        className="rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 shadow-xs"
                                    >
                                        {isSubmitting ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : (isArabic ? 'حفظ التقييم' : 'Submit Feedback')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

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
const FeedbackCard = ({ feedback, copy, formatDate }) => {
    const isLow = Number(feedback.rating) <= 2;
    const isDelighted = Number(feedback.rating) === 5;

    return (
        <article className={`relative rounded-2xl border p-5 shadow-sm transition-all ${
            isLow
                ? 'border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20'
                : isDelighted
                    ? 'border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/15'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'
        }`}>
            <Quote size={34} className="absolute end-4 top-4 text-slate-100 dark:text-slate-800" />
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${
                        isLow
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                            : isDelighted
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                                : 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300'
                    }`}>
                        {feedback.patient_name?.[0] || '?'}
                    </span>
                    <div>
                        <p className="font-black text-slate-900 dark:text-white">{feedback.patient_name || copy('unknownPatient')}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatDate(feedback.created_at)} <span aria-hidden="true">&bull;</span> {feedback.source || copy('unknownSource')}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(i => (
                            <Star
                                key={i}
                                size={14}
                                className={i <= Number(feedback.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'}
                            />
                        ))}
                    </div>
                    {isLow && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                            ⚠️ تم تصعيد الشكوى تلقائياً
                        </span>
                    )}
                    {isDelighted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                            ⭐ مريض متميز (+20 نقطة)
                        </span>
                    )}
                </div>
            </div>
            {feedback.comments && (
                <p className="relative z-10 mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {feedback.comments}
                </p>
            )}
        </article>
    );
};
const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{label}</div>;
const ErrorState = ({ label, retry, onRetry }) => <div role="alert" className="p-10 text-center"><p className="font-bold text-rose-600">{label}</p><button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">{retry}</button></div>;
const Empty = ({ title, description, compact }) => <div className={`${compact ? 'p-8' : 'p-12'} text-center`}><MessageCircle size={34} className="mx-auto text-slate-300" /><p className="mt-3 font-black text-slate-800 dark:text-white">{title}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>;

export default FeedbackDashboard;
