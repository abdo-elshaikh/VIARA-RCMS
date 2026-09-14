import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { CalendarDays, CheckCircle2, CheckSquare, Clock, Mail, MessageSquare, Phone, RefreshCw, Search, User, Users, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetCrmActivitiesQuery, useUpdateCrmActivityMutation } from '../../store/api';
import { selectCurrentUser } from '../../store/authSlice';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../../utils/roles';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const TaskBoard = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`marketing.tasks.${key}`, options);
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const user = useSelector(selectCurrentUser);
    const canViewAll = hasDeveloperOrAdminRole(user?.role) || user?.role === 'Marketing';
    const [scope, setScope] = useState(canViewAll ? 'all' : 'mine');
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const queryParams = useMemo(() => ({
        ...(scope === 'mine' && user?.user_id ? { assignedTo: user.user_id } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    }), [scope, statusFilter, user?.user_id]);
    const { data: activities = [], isLoading, isError, isFetching, refetch } = useGetCrmActivitiesQuery(queryParams);
    const [updateActivity, { isLoading: isUpdating }] = useUpdateCrmActivityMutation();

    const now = Date.now();
    const visibleActivities = useMemo(() => {
        const q = search.trim().toLowerCase();
        return activities.filter(activity => !q || [
            activity.patient_name,
            activity.patient_phone,
            activity.activity_type,
            activity.status,
            activity.notes,
            activity.assignee_name,
        ].filter(Boolean).join(' ').toLowerCase().includes(q));
    }, [activities, search]);

    const summary = useMemo(() => ({
        pending: activities.filter(activity => activity.status === 'Pending').length,
        overdue: activities.filter(activity => activity.status === 'Pending' && isOverdue(activity.due_date, now)).length,
        completed: activities.filter(activity => activity.status === 'Completed').length,
        cancelled: activities.filter(activity => activity.status === 'Cancelled').length,
    }), [activities, now]);

    const grouped = useMemo(() => ({
        pending: visibleActivities.filter(activity => activity.status === 'Pending'),
        completed: visibleActivities.filter(activity => activity.status === 'Completed'),
        cancelled: visibleActivities.filter(activity => activity.status === 'Cancelled'),
    }), [visibleActivities]);

    const handleStatus = async (activity, status) => {
        try {
            await updateActivity({ id: activity.activity_id, status }).unwrap();
            toast.success(copy(status === 'Completed' ? 'completeSuccess' : 'cancelSuccess'));
        } catch (error) {
            toast.error(getErrorMessage(error, copy('statusError')));
        }
    };

    const formatDateTime = value => {
        if (!value) return copy('noDueDate');
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? copy('noDueDate') : date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    };

    return (
        <div className="space-y-5">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label={copy('summaryLabel')}>
                <Metric icon={Clock} label={copy('pending')} value={summary.pending} tone="blue" />
                <Metric icon={CalendarDays} label={copy('overdue')} value={summary.overdue} tone="rose" />
                <Metric icon={CheckCircle2} label={copy('completed')} value={summary.completed} tone="emerald" />
                <Metric icon={XCircle} label={copy('cancelled')} value={summary.cancelled} tone="slate" />
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <header className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/70 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <h2 className="font-black text-slate-900 dark:text-white">{copy('title')}</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy('description')}</p>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_130px_130px_auto]">
                        <label className="relative">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>
                        {canViewAll && <select value={scope} onChange={event => setScope(event.target.value)} className={inputClass}><option value="all">{copy('allTasks')}</option><option value="mine">{copy('myTasks')}</option></select>}
                        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={inputClass}><option value="all">{copy('allStatuses')}</option>{['Pending', 'Completed', 'Cancelled'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}</select>
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />{copy('refresh')}</button>
                    </div>
                </header>

                {isLoading ? <Loading label={copy('loading')} /> : isError ? <ErrorState label={copy('loadError')} retry={copy('retry')} onRetry={refetch} /> : visibleActivities.length === 0 ? <Empty title={copy('empty')} description={copy('emptyDescription')} /> : (
                    <div className="grid gap-4 p-4 xl:grid-cols-3">
                        <Column title={copy('pendingColumn', { count: grouped.pending.length })} tone="blue">{grouped.pending.length ? grouped.pending.map(activity => <TaskCard key={activity.activity_id} activity={activity} copy={copy} formatDateTime={formatDateTime} onStatus={handleStatus} updating={isUpdating} now={now} />) : <ColumnEmpty>{copy('nonePending')}</ColumnEmpty>}</Column>
                        <Column title={copy('completedColumn', { count: grouped.completed.length })} tone="emerald">{grouped.completed.length ? grouped.completed.map(activity => <TaskCard key={activity.activity_id} activity={activity} copy={copy} formatDateTime={formatDateTime} now={now} />) : <ColumnEmpty>{copy('noneCompleted')}</ColumnEmpty>}</Column>
                        <Column title={copy('cancelledColumn', { count: grouped.cancelled.length })} tone="slate">{grouped.cancelled.length ? grouped.cancelled.map(activity => <TaskCard key={activity.activity_id} activity={activity} copy={copy} formatDateTime={formatDateTime} now={now} />) : <ColumnEmpty>{copy('noneCancelled')}</ColumnEmpty>}</Column>
                    </div>
                )}
            </section>
        </div>
    );
};

const isOverdue = (value, now = Date.now()) => value ? new Date(value).getTime() < now : false;
const typeIcons = { WhatsApp: MessageSquare, Call: Phone, Email: Mail, Visit: CalendarDays, 'Feedback Follow-up': MessageSquare, 'Patient Reminder': CalendarDays };
const toneClass = { blue: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300', rose: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300', emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300', slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
const statusClass = { Pending: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300', Completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300', Cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
const Metric = ({ icon: Icon, label, value, tone }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-black uppercase leading-4 tracking-wider text-slate-400">{label}</p><span className={`hidden h-9 w-9 items-center justify-center rounded-xl sm:flex ${toneClass[tone]}`}><Icon size={17} /></span></div><p className="mt-2 font-mono text-2xl font-black text-slate-950 dark:text-white whitespace-nowrap">{value}</p></article>;
const Column = ({ title, tone, children }) => <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50"><h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-200"><span className={`h-2.5 w-2.5 rounded-full ${tone === 'blue' ? 'bg-blue-500' : tone === 'emerald' ? 'bg-emerald-500' : 'bg-slate-400'}`} />{title}</h3><div className="max-h-[650px] space-y-3 overflow-y-auto pe-1">{children}</div></section>;
const TaskCard = ({ activity, copy, formatDateTime, onStatus, updating, now }) => { const Icon = typeIcons[activity.activity_type] || CalendarDays; const overdue = activity.status === 'Pending' && isOverdue(activity.due_date, now); return <article className={`rounded-xl border p-4 shadow-sm ${overdue ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-400/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2 font-black text-slate-900 dark:text-white"><Icon size={16} className={overdue ? 'text-rose-600' : 'text-cyan-600'} />{copy(`types.${activity.activity_type}`)}</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${overdue ? 'bg-rose-100 text-rose-700 dark:bg-rose-400/20 dark:text-rose-200' : statusClass[activity.status]}`}>{overdue ? copy('overdue') : copy(`statuses.${activity.status}`)}</span></div><div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><User size={14} className="text-slate-400" />{activity.patient_name || copy('unknownPatient')}{activity.patient_phone && <span className="text-xs text-slate-400 ltr-embed">({activity.patient_phone})</span>}</div>{activity.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{activity.notes}</p>}<div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${overdue ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'}`}><Clock size={12} />{formatDateTime(activity.due_date)}</span>{activity.assignee_name && <span className="text-xs text-slate-400">{copy('assignedTo', { name: activity.assignee_name })}</span>}{activity.status === 'Pending' && onStatus && <div className="flex gap-2"><button type="button" onClick={() => onStatus(activity, 'Completed')} disabled={updating} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-400/10 dark:text-emerald-300"><CheckCircle2 size={13} />{copy('done')}</button><button type="button" onClick={() => onStatus(activity, 'Cancelled')} disabled={updating} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"><XCircle size={13} />{copy('cancelTask')}</button></div>}</div></article>; };
const ColumnEmpty = ({ children }) => <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-400 dark:border-slate-700">{children}</div>;
const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{label}</div>;
const ErrorState = ({ label }) => <div role="alert" className="p-12 text-center text-sm font-bold text-red-500">{label}</div>;
const Empty = ({ title, description, icon: Icon = CheckSquare }) => (
    <div className="p-12 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">
            <Icon size={28} />
        </div>
        <p className="text-base font-black text-slate-800 dark:text-white">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Users size={14} className="text-cyan-600" />
                <span>يمكنك جدولة متابعات وتذكيرات المرضى مباشرة من ملف المريض</span>
            </span>
        </div>
    </div>
);

export default TaskBoard;
