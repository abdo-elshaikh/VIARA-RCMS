import { useMemo, useState } from 'react';
import { CalendarOff, CheckCircle2, Clock, Plus, RefreshCw, Search, X, XCircle } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreateLeaveRequestMutation, useGetLeaveRequestsQuery, useUpdateLeaveStatusMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../../utils/roles';
import ConfirmDialog from '../ui/ConfirmDialog';

const emptyForm = { startDate: '', endDate: '', leaveType: 'Sick', reason: '' };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-amber-500 dark:focus:ring-amber-500/20';

const LeaveManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`hr.leave.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';

    const { user } = useSelector(state => state.auth);
    const isReviewer = hasDeveloperOrAdminRole(user?.role) || user?.role === 'HR';

    const { data: leaves = [], isLoading, isError, isFetching, refetch } = useGetLeaveRequestsQuery(isReviewer ? {} : { userId: user?.user_id }, { skip: !user });
    const [createLeave, { isLoading: isCreating }] = useCreateLeaveRequestMutation();
    const [updateStatus, { isLoading: isReviewing }] = useUpdateLeaveStatusMutation();

    const [showNew, setShowNew] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [form, setForm] = useState(emptyForm);
    const [reviewTarget, setReviewTarget] = useState(null);

    const visibleLeaves = useMemo(() => {
        const query = search.trim().toLowerCase();
        return leaves.filter(leave => {
            if (statusFilter !== 'all' && leave.status !== statusFilter) return false;
            return !query || [leave.employee_name, leave.leave_type, leave.reason, leave.status].filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [leaves, search, statusFilter]);

    const summary = useMemo(() => ({
        pending: leaves.filter(leave => leave.status === 'Pending').length,
        approved: leaves.filter(leave => leave.status === 'Approved').length,
        rejected: leaves.filter(leave => leave.status === 'Rejected').length,
        days: leaves.filter(leave => leave.status === 'Approved').reduce((total, leave) => total + daysBetween(leave.start_date, leave.end_date), 0)
    }), [leaves]);

    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));
    const closeForm = () => { if (!isCreating) { setShowNew(false); setForm(emptyForm); } };

    const handleSubmit = async event => {
        event.preventDefault();
        if (form.endDate < form.startDate) {
            toast.error(copy('endBeforeStart'));
            return;
        }
        try {
            await createLeave({ ...form, reason: form.reason.trim() || undefined }).unwrap();
            toast.success(copy('createSuccess'));
            closeForm();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };

    const confirmReview = async () => {
        if (!reviewTarget) return false;
        try {
            await updateStatus({ id: reviewTarget.leave.request_id, status: reviewTarget.status }).unwrap();
            toast.success(copy(reviewTarget.status === 'Approved' ? 'approveSuccess' : 'rejectSuccess'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, copy('reviewError')));
            return false;
        }
    };

    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return (
        <div className="space-y-6">
            {/* Top Metrics Grid */}
            <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label={copy('summaryLabel')}>
                <Metric label={copy('pending')} value={summary.pending} tone="amber" />
                <Metric label={copy('approved')} value={summary.approved} tone="emerald" />
                <Metric label={copy('rejected')} value={summary.rejected} tone="rose" />
                <Metric label={copy('approvedDays')} value={summary.days} tone="blue" />
            </section>

            {/* Main Leave Panel */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <header className="flex flex-col gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200 shadow-md dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30">
                            <CalendarOff size={22} />
                        </span>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">{copy('title')}</h2>
                            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">{copy(isReviewer ? 'reviewerDescription' : 'employeeDescription')}</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2.5 sm:flex-row">
                        <label className="relative sm:w-64">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>

                        <label>
                            <span className="sr-only">{copy('filterStatus')}</span>
                            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={inputClass}>
                                <option value="all">{copy('allStatuses')}</option>
                                {['Pending', 'Approved', 'Rejected'].map(status => (
                                    <option key={status} value={status}>{copy(`statuses.${status}`)}</option>
                                ))}
                            </select>
                        </label>

                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {copy('refresh')}
                        </button>

                        <button type="button" onClick={() => setShowNew(value => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white shadow-md transition hover:bg-amber-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                            {showNew ? <X size={16} /> : <Plus size={16} />}
                            {showNew ? copy('closeForm') : copy('requestLeave')}
                        </button>
                    </div>
                </header>

                {/* Create Request Overlay */}
                {showNew && (
                    <form onSubmit={handleSubmit} className="grid gap-4 border-b border-amber-200/80 bg-amber-50/30 p-5 backdrop-blur-md dark:border-white/5 dark:bg-amber-950/20 md:grid-cols-2">
                        <Field label={copy('startDate')}>
                            <input type="date" required value={form.startDate} onChange={event => setField('startDate', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('endDate')}>
                            <input type="date" required min={form.startDate || undefined} value={form.endDate} onChange={event => setField('endDate', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('leaveType')}>
                            <select value={form.leaveType} onChange={event => setField('leaveType', event.target.value)} className={inputClass}>
                                {['Sick', 'Vacation', 'Personal', 'Unpaid'].map(type => (
                                    <option key={type} value={type}>{copy(`types.${type}`)}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label={copy('reason')}>
                            <input maxLength={500} value={form.reason} onChange={event => setField('reason', event.target.value)} placeholder={copy('reasonPlaceholder')} className={inputClass} />
                        </Field>

                        <div className="flex flex-col-reverse gap-2 md:col-span-2 md:flex-row md:justify-end">
                            <button type="button" onClick={closeForm} disabled={isCreating} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-white/5">
                                {copy('cancel')}
                            </button>
                            <button type="submit" disabled={isCreating} className="rounded-xl bg-amber-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-amber-800 disabled:opacity-50">
                                {isCreating ? copy('submitting') : copy('submit')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Content Cards / Table */}
                {isLoading ? (
                    <Loading label={copy('loading')} />
                ) : isError ? (
                    <ErrorState copy={copy} onRetry={refetch} />
                ) : visibleLeaves.length === 0 ? (
                    <Empty copy={copy} filtered={Boolean(search || statusFilter !== 'all')} />
                ) : (
                    <>
                        <div className="grid gap-4 p-5 md:hidden">
                            {visibleLeaves.map(leave => (
                                <LeaveCard key={leave.request_id} leave={leave} copy={copy} formatDate={formatDate} reviewer={isReviewer} onReview={setReviewTarget} reviewing={isReviewing} />
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[850px] text-xs">
                                <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                                    <tr>
                                        {['employee', 'dates', 'typeReason', 'status'].map(key => (
                                            <th key={key} className="px-4 py-3.5 text-start text-xs font-black uppercase tracking-wider">{copy(key)}</th>
                                        ))}
                                        {isReviewer && <th className="px-4 py-3.5 text-end text-xs font-black uppercase tracking-wider">{copy('actions')}</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                    {visibleLeaves.map(leave => (
                                        <LeaveRow key={leave.request_id} leave={leave} copy={copy} formatDate={formatDate} reviewer={isReviewer} onReview={setReviewTarget} reviewing={isReviewing} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>

            <ConfirmDialog isOpen={Boolean(reviewTarget)} onClose={() => setReviewTarget(null)} onConfirm={confirmReview} title={copy(reviewTarget?.status === 'Approved' ? 'approveTitle' : 'rejectTitle')} message={copy(reviewTarget?.status === 'Approved' ? 'approveMessage' : 'rejectMessage', { employee: reviewTarget?.leave?.employee_name || '', dates: reviewTarget?.leave ? `${formatDate(reviewTarget.leave.start_date)} – ${formatDate(reviewTarget.leave.end_date)}` : '' })} confirmLabel={copy(reviewTarget?.status === 'Approved' ? 'approveAction' : 'rejectAction')} cancelLabel={copy('cancel')} isLoading={isReviewing} variant={reviewTarget?.status === 'Approved' ? 'info' : 'warning'} />
        </div>
    );
};

const daysBetween = (start, end) => Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);

const toneClasses = {
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    blue: 'text-cyan-600 dark:text-cyan-400'
};

const Metric = ({ label, value, tone }) => (
    <article className="rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-lg shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-2 font-mono text-2xl font-black ${toneClasses[tone]}`}>{value}</p>
    </article>
);

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const Status = ({ leave, copy }) => {
    const Icon = leave.status === 'Approved' ? CheckCircle2 : leave.status === 'Rejected' ? XCircle : Clock;
    const tone = leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
        : leave.status === 'Rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300';
    return (
        <div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${tone}`}>
                <Icon size={12} />
                {copy(`statuses.${leave.status}`)}
            </span>
            {leave.approved_by_name && (
                <p className="mt-1 text-[10px] font-medium text-slate-400">{copy('reviewedBy', { name: leave.approved_by_name })}</p>
            )}
        </div>
    );
};

const ReviewActions = ({ leave, copy, onReview, reviewing }) => (
    leave.status === 'Pending' ? (
        <div className="flex flex-wrap justify-end gap-1.5">
            <button type="button" disabled={reviewing} onClick={() => onReview({ leave, status: 'Approved' })} className="min-h-8 rounded-xl bg-emerald-100 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-500/20 dark:text-emerald-300">
                {copy('approve')}
            </button>
            <button type="button" disabled={reviewing} onClick={() => onReview({ leave, status: 'Rejected' })} className="min-h-8 rounded-xl bg-rose-100 px-3 text-xs font-bold text-rose-800 hover:bg-rose-200 disabled:opacity-50 dark:bg-rose-500/20 dark:text-rose-300">
                {copy('reject')}
            </button>
        </div>
    ) : null
);

const LeaveCard = ({ leave, copy, formatDate, reviewer, onReview, reviewing }) => (
    <article className="rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all dark:border-white/10 dark:bg-slate-900/60">
        <div className="flex items-start justify-between gap-3">
            <div>
                <h3 className="font-black text-slate-900 dark:text-white text-sm">{leave.employee_name}</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {copy(`types.${leave.leave_type}`)} · {copy('daysValue', { count: daysBetween(leave.start_date, leave.end_date) })}
                </p>
            </div>
            <Status leave={leave} copy={copy} />
        </div>
        <p className="mt-4 rounded-2xl border border-slate-100/80 bg-slate-50/70 p-3 text-xs font-bold text-slate-800 dark:border-white/5 dark:bg-white/5 dark:text-slate-200">
            {formatDate(leave.start_date)} – {formatDate(leave.end_date)}
        </p>
        {leave.reason && <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-400">{leave.reason}</p>}
        {reviewer && <div className="mt-4"><ReviewActions leave={leave} copy={copy} onReview={onReview} reviewing={reviewing} /></div>}
    </article>
);

const LeaveRow = ({ leave, copy, formatDate, reviewer, onReview, reviewing }) => (
    <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
        <td className="px-4 py-4 font-bold text-slate-900 dark:text-white">{leave.employee_name}</td>
        <td className="px-4 py-4 font-medium text-slate-600 dark:text-slate-400">
            <p>{formatDate(leave.start_date)} – {formatDate(leave.end_date)}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{copy('daysValue', { count: daysBetween(leave.start_date, leave.end_date) })}</p>
        </td>
        <td className="px-4 py-4">
            <p className="font-bold text-slate-800 dark:text-slate-200">{copy(`types.${leave.leave_type}`)}</p>
            <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500 dark:text-slate-400">{leave.reason || '—'}</p>
        </td>
        <td className="px-4 py-4"><Status leave={leave} copy={copy} /></td>
        {reviewer && <td className="px-4 py-4"><ReviewActions leave={leave} copy={copy} onReview={onReview} reviewing={reviewing} /></td>}
    </tr>
);

const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-xs font-bold text-slate-400">{label}</div>;
const ErrorState = ({ copy, onRetry }) => (
    <div role="alert" className="p-10 text-center">
        <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{copy('loadError')}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
            {copy('retry')}
        </button>
    </div>
);
const Empty = ({ copy, filtered }) => (
    <div className="p-12 text-center">
        <CalendarOff size={34} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-3 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default LeaveManager;
