import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { CalendarDays, CheckCircle2, CheckSquare, Clock, Mail, MessageSquare, Phone, Plus, RefreshCw, Search, User, Users, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCreateCrmActivityMutation, useGetCrmActivitiesQuery, useGetPatientsQuery, useUpdateCrmActivityMutation } from '../../store/api';
import { selectCurrentUser } from '../../store/authSlice';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../../utils/roles';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const TaskBoard = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`marketing.tasks.${key}`, options);
    const isArabic = i18n.language?.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const user = useSelector(selectCurrentUser);
    const currentUserId = user?.id || user?.user_id || user?.userId;
    const canViewAll = hasDeveloperOrAdminRole(user?.role) || user?.role === 'Marketing';
    const [scope, setScope] = useState(canViewAll ? 'all' : 'mine');
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showNewModal, setShowNewModal] = useState(false);

    // New task form state
    const [taskForm, setTaskForm] = useState({
        patientId: '',
        activityType: 'Call',
        dueDate: '',
        notes: ''
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
    const selectedPatient = patientOptions.find(p => (p.patient_id || p.id) === taskForm.patientId);

    const queryParams = useMemo(() => ({
        ...(scope === 'mine' && currentUserId ? { assignedTo: currentUserId } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    }), [currentUserId, scope, statusFilter]);

    const { data: activities = [], isLoading, isError, isFetching, refetch } = useGetCrmActivitiesQuery(queryParams);
    const [createActivity, { isLoading: isCreating }] = useCreateCrmActivityMutation();
    const [updateActivity, { isLoading: isUpdating }] = useUpdateCrmActivityMutation();

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!taskForm.patientId) {
            toast.error(isArabic ? 'يرجى اختيار المريض أولاً' : 'Please select a patient first');
            return;
        }
        if (taskForm.activityType === 'Patient Reminder' && !taskForm.dueDate) {
            toast.error(isArabic ? 'تذكير المريض يتطلب تحديد موعد' : 'Patient reminder requires a due date');
            return;
        }
        try {
            await createActivity({
                patientId: taskForm.patientId,
                assignedTo: currentUserId,
                activityType: taskForm.activityType,
                notes: taskForm.notes.trim() || undefined,
                dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : undefined
            }).unwrap();
            toast.success(isArabic ? 'تم إنشاء مهمة المتابعة بنجاح' : 'CRM Task created successfully');
            setShowNewModal(false);
            setTaskForm({ patientId: '', activityType: 'Call', dueDate: '', notes: '' });
            setPatientSearch('');
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'تعذر إنشاء المهمة' : 'Failed to create task'));
        }
    };

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
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="relative min-w-[200px] flex-1 sm:flex-none">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>
                        {canViewAll && (
                            <select value={scope} onChange={event => setScope(event.target.value)} className={`${inputClass} w-auto`}>
                                <option value="all">{copy('allTasks')}</option>
                                <option value="mine">{copy('myTasks')}</option>
                            </select>
                        )}
                        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={`${inputClass} w-auto`}>
                            <option value="all">{copy('allStatuses')}</option>
                            {['Pending', 'Completed', 'Cancelled'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}
                        </select>
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {copy('refresh')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowNewModal(true)}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-bold text-white hover:bg-cyan-800 transition shadow-xs whitespace-nowrap"
                        >
                            <Plus size={16} />
                            <span>{isArabic ? 'مهمة متابعة جديدة' : 'New CRM Task'}</span>
                        </button>
                    </div>
                </header>

                {/* New CRM Task Modal */}
                {showNewModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
                        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                                        <CheckSquare size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-slate-900 dark:text-white">
                                            {isArabic ? 'إنشاء مهمة متابعة CRM جديدة' : 'New CRM Follow-Up Task'}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {isArabic ? 'جدولة اتصال أو تذكير أو زيارة لمريض' : 'Schedule call, reminder, or follow-up for a patient'}
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

                            <form onSubmit={handleCreateTask} className="mt-5 space-y-4">
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
                                                    const isSelected = taskForm.patientId === pId;
                                                    return (
                                                        <button
                                                            key={pId}
                                                            type="button"
                                                            onClick={() => {
                                                                setTaskForm(curr => ({ ...curr, patientId: pId }));
                                                                setPatientSearch(pName);
                                                            }}
                                                            className={`w-full text-start rounded-lg px-3 py-2 text-xs font-bold transition flex items-center justify-between ${
                                                                isSelected
                                                                    ? 'bg-cyan-700 text-white'
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
                                            <p className="text-[11px] font-bold text-cyan-700 dark:text-cyan-300">
                                                ✓ {isArabic ? 'المريض المحدد:' : 'Selected:'} {selectedPatient.name || `${selectedPatient.first_name || ''} ${selectedPatient.last_name || ''}`} ({selectedPatient.mrn})
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Activity Type */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {isArabic ? 'نوع النشاط *' : 'Activity Type *'}
                                    </label>
                                    <select
                                        value={taskForm.activityType}
                                        onChange={(e) => setTaskForm(curr => ({ ...curr, activityType: e.target.value }))}
                                        className={inputClass}
                                    >
                                        {['Call', 'WhatsApp', 'Visit', 'Email', 'Feedback Follow-up', 'Patient Reminder'].map(type => (
                                            <option key={type} value={type}>{copy(`types.${type}`)}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Due Date */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {isArabic ? 'موعد الاستحقاق' : 'Due Date & Time'}
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={taskForm.dueDate}
                                        onChange={(e) => setTaskForm(curr => ({ ...curr, dueDate: e.target.value }))}
                                        className={inputClass}
                                    />
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {isArabic ? 'ملاحظات وتفاصيل المتابعة' : 'Notes & Instructions'}
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={taskForm.notes}
                                        onChange={(e) => setTaskForm(curr => ({ ...curr, notes: e.target.value }))}
                                        placeholder={isArabic ? 'تعليمات الاتصال، سبب المتابعة، أي تفاصيل خاصة...' : 'Call instructions, follow-up reason, specific notes...'}
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
                                        disabled={isCreating || !taskForm.patientId}
                                        className="rounded-xl bg-cyan-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-cyan-800 disabled:opacity-50 shadow-xs"
                                    >
                                        {isCreating ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : (isArabic ? 'إنشاء المهمة' : 'Create Task')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

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
const TaskCard = ({ activity, copy, formatDateTime, onStatus, updating, now }) => {
    const Icon = typeIcons[activity.activity_type] || CalendarDays;
    const overdue = activity.status === 'Pending' && isOverdue(activity.due_date, now);
    const isEscalation = activity.activity_type === 'Feedback Follow-up' || activity.notes?.includes('⚠️') || activity.notes?.includes('تصعيد');

    return (
        <article className={`relative rounded-xl border p-4 shadow-sm transition-all ${
            isEscalation && activity.status === 'Pending'
                ? 'border-amber-400 bg-amber-50/70 dark:border-amber-700/60 dark:bg-amber-950/20 ring-1 ring-amber-400/50'
                : overdue
                    ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-400/10'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'
        }`}>
            {isEscalation && activity.status === 'Pending' && (
                <div className="mb-2.5 flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:text-amber-300">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                    </span>
                    <span>تصعيد عاجل لمتابعة رضا المريض (SLA)</span>
                </div>
            )}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
                    <Icon size={16} className={isEscalation ? 'text-amber-600 dark:text-amber-400' : overdue ? 'text-rose-600' : 'text-cyan-600'} />
                    {copy(`types.${activity.activity_type}`)}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                    isEscalation && activity.status === 'Pending'
                        ? 'bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
                        : overdue
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-400/20 dark:text-rose-200'
                            : statusClass[activity.status]
                }`}>
                    {overdue ? copy('overdue') : copy(`statuses.${activity.status}`)}
                </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <User size={14} className="text-slate-400" />
                {activity.patient_name || copy('unknownPatient')}
                {activity.patient_phone && <span className="text-xs text-slate-400 ltr-embed">({activity.patient_phone})</span>}
            </div>
            {activity.notes && (
                <p className={`mt-3 rounded-xl p-3 text-sm ${
                    isEscalation && activity.status === 'Pending'
                        ? 'bg-white/80 text-amber-950 font-medium dark:bg-slate-900/90 dark:text-amber-200 border border-amber-200/60 dark:border-amber-800/40'
                        : 'bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                }`}>
                    {activity.notes}
                </p>
            )}
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${overdue ? 'text-rose-700 dark:text-rose-300' : isEscalation ? 'text-amber-700 dark:text-amber-300 font-bold' : 'text-slate-500'}`}>
                    <Clock size={12} />
                    {formatDateTime(activity.due_date)}
                </span>
                {activity.assignee_name && (
                    <span className="text-xs text-slate-400">{copy('assignedTo', { name: activity.assignee_name })}</span>
                )}
                {activity.status === 'Pending' && onStatus && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => onStatus(activity, 'Completed')}
                            disabled={updating}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-400/10 dark:text-emerald-300"
                        >
                            <CheckCircle2 size={13} />
                            {copy('done')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onStatus(activity, 'Cancelled')}
                            disabled={updating}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                        >
                            <XCircle size={13} />
                            {copy('cancelTask')}
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
};
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
