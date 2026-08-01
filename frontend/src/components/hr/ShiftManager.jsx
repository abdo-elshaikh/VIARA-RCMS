import { useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreateShiftMutation, useDeleteShiftMutation, useGetEmployeeProfilesQuery, useGetShiftsQuery } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import ConfirmDialog from '../ui/ConfirmDialog';

const mondayFor = (date = new Date()) => {
    const copy = new Date(date);
    const day = copy.getDay();
    copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
};

const emptyForm = { userId: '', startTime: '', endTime: '', notes: '' };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20';

const ShiftManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`hr.shifts.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';

    const [weekStart, setWeekStart] = useState(() => mondayFor());
    const weekEnd = useMemo(() => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + 7);
        return date;
    }, [weekStart]);

    const query = { startDate: weekStart.toISOString(), endDate: weekEnd.toISOString() };
    const { data: shifts = [], isLoading, isError, isFetching, refetch } = useGetShiftsQuery(query);
    const { data: staff = [] } = useGetEmployeeProfilesQuery();

    const [createShift, { isLoading: isCreating }] = useCreateShiftMutation();
    const [deleteShift, { isLoading: isDeleting }] = useDeleteShiftMutation();

    const [showNew, setShowNew] = useState(false);
    const [employeeFilter, setEmployeeFilter] = useState('all');
    const [form, setForm] = useState(emptyForm);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const visibleShifts = useMemo(() => shifts.filter(shift => employeeFilter === 'all' || shift.user_id === employeeFilter), [employeeFilter, shifts]);

    const summary = useMemo(() => ({
        shifts: shifts.length,
        staff: new Set(shifts.map(shift => shift.user_id)).size,
        hours: shifts.reduce((total, shift) => total + Math.max(0, new Date(shift.end_time) - new Date(shift.start_time)) / 3600000, 0),
        onCall: shifts.filter(shift => /on[- ]?call/i.test(shift.notes || '')).length,
    }), [shifts]);

    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));
    const closeForm = () => { if (!isCreating) { setShowNew(false); setForm(emptyForm); } };

    const moveWeek = direction => setWeekStart(current => {
        const next = new Date(current);
        next.setDate(next.getDate() + direction * 7);
        return next;
    });

    const handleCreate = async event => {
        event.preventDefault();
        const start = new Date(form.startTime);
        const end = new Date(form.endTime);
        if (end <= start) {
            toast.error(copy('endAfterStart'));
            return;
        }
        try {
            await createShift({
                userId: form.userId,
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                notes: form.notes.trim() || undefined
            }).unwrap();
            toast.success(copy('createSuccess'));
            closeForm();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return false;
        try {
            await deleteShift(deleteTarget.shift_id).unwrap();
            toast.success(copy('deleteSuccess'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, copy('deleteError')));
            return false;
        }
    };

    const formatDay = value => new Date(value).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
    const formatTime = value => new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const weekLabel = `${formatDay(weekStart)} – ${formatDay(new Date(weekEnd.getTime() - 86400000))}`;

    return (
        <div className="space-y-6">
            {/* Summary Metrics */}
            <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label={copy('summaryLabel')}>
                <Metric label={copy('shiftCount')} value={summary.shifts} />
                <Metric label={copy('staffCovered')} value={summary.staff} />
                <Metric label={copy('scheduledHours')} value={copy('hoursValue', { value: summary.hours.toFixed(1) })} />
                <Metric label={copy('onCall')} value={summary.onCall} />
            </section>

            {/* Main Panel */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <header className="flex flex-col gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200 shadow-md dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30">
                            <CalendarClock size={22} />
                        </span>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">{copy('title')}</h2>
                            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">{copy('description')}</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2.5 sm:flex-row">
                        {/* Week Navigator */}
                        <div className="flex min-h-10 items-center rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-900">
                            <button type="button" onClick={() => moveWeek(-1)} aria-label={copy('previousWeek')} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400">
                                <ChevronLeft className="rtl:rotate-180" size={17} />
                            </button>
                            <button type="button" onClick={() => setWeekStart(mondayFor())} className="min-w-40 px-2 text-xs font-black text-slate-800 dark:text-slate-200">
                                {weekLabel}
                            </button>
                            <button type="button" onClick={() => moveWeek(1)} aria-label={copy('nextWeek')} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400">
                                <ChevronRight className="rtl:rotate-180" size={17} />
                            </button>
                        </div>

                        <label>
                            <span className="sr-only">{copy('filterEmployee')}</span>
                            <select value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)} className={inputClass}>
                                <option value="all">{copy('allEmployees')}</option>
                                {staff.map(employee => <option key={employee.user_id} value={employee.user_id}>{employee.full_name}</option>)}
                            </select>
                        </label>

                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {copy('refresh')}
                        </button>

                        <button type="button" onClick={() => setShowNew(value => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white shadow-md transition hover:bg-indigo-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                            {showNew ? <X size={16} /> : <Plus size={16} />}
                            {showNew ? copy('closeForm') : copy('schedule')}
                        </button>
                    </div>
                </header>

                {/* Create Shift Form Overlay */}
                {showNew && (
                    <form onSubmit={handleCreate} className="grid gap-4 border-b border-indigo-200/80 bg-indigo-50/30 p-5 backdrop-blur-md dark:border-white/5 dark:bg-indigo-950/20 md:grid-cols-2 xl:grid-cols-4">
                        <Field label={copy('employee')}>
                            <select required value={form.userId} onChange={event => setField('userId', event.target.value)} className={inputClass}>
                                <option value="">{copy('selectEmployee')}</option>
                                {staff.filter(employee => employee.is_active !== false).map(employee => (
                                    <option key={employee.user_id} value={employee.user_id}>{employee.full_name} ({employee.role})</option>
                                ))}
                            </select>
                        </Field>

                        <Field label={copy('start')}>
                            <input type="datetime-local" required value={form.startTime} onChange={event => setField('startTime', event.target.value)} className={inputClass} />
                        </Field>

                        <Field label={copy('end')}>
                            <input type="datetime-local" required min={form.startTime || undefined} value={form.endTime} onChange={event => setField('endTime', event.target.value)} className={inputClass} />
                        </Field>

                        <Field label={copy('notes')}>
                            <input maxLength={500} value={form.notes} onChange={event => setField('notes', event.target.value)} placeholder={copy('notesPlaceholder')} className={inputClass} />
                        </Field>

                        <div className="flex flex-col-reverse gap-2 md:col-span-2 md:flex-row md:justify-end xl:col-span-4">
                            <button type="button" onClick={closeForm} disabled={isCreating} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-white/5">
                                {copy('cancel')}
                            </button>
                            <button type="submit" disabled={isCreating} className="rounded-xl bg-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-indigo-800 disabled:opacity-50">
                                {isCreating ? copy('saving') : copy('save')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Shift Grid */}
                {isLoading ? (
                    <Loading label={copy('loading')} />
                ) : isError ? (
                    <ErrorState copy={copy} onRetry={refetch} />
                ) : visibleShifts.length === 0 ? (
                    <Empty copy={copy} filtered={employeeFilter !== 'all'} />
                ) : (
                    <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {visibleShifts.map(shift => (
                            <ShiftCard key={shift.shift_id} shift={shift} copy={copy} formatDay={formatDay} formatTime={formatTime} onDelete={setDeleteTarget} />
                        ))}
                    </div>
                )}
            </section>

            <ConfirmDialog isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} title={copy('deleteTitle')} message={copy('deleteMessage', { employee: deleteTarget?.employee_name || '', date: deleteTarget ? formatDay(deleteTarget.start_time) : '' })} confirmLabel={copy('deleteAction')} cancelLabel={copy('cancel')} isLoading={isDeleting} variant="danger" />
        </div>
    );
};

const Metric = ({ label, value }) => (
    <article className="rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-lg shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">{value}</p>
    </article>
);

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const ShiftCard = ({ shift, copy, formatDay, formatTime, onDelete }) => {
    const start = new Date(shift.start_time);
    const end = new Date(shift.end_time);
    const duration = Math.max(0, end - start) / 3600000;
    return (
        <article className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/60">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-sm">{shift.employee_name}</h3>
                    <span className="mt-1 inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">
                        {shift.role}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => onDelete(shift)}
                    aria-label={copy('deleteFor', { employee: shift.employee_name })}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                >
                    <Trash2 size={15} />
                </button>
            </div>

            <dl className="mt-4 space-y-2.5 rounded-2xl border border-slate-100/80 bg-slate-50/70 p-3.5 text-xs dark:border-white/5 dark:bg-white/5">
                <div className="flex items-center justify-between gap-3">
                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{copy('date')}</dt>
                    <dd className="font-bold text-slate-800 dark:text-slate-200">{formatDay(shift.start_time)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{copy('time')}</dt>
                    <dd className="font-bold text-slate-800 dark:text-slate-200">{formatTime(shift.start_time)} – {formatTime(shift.end_time)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{copy('duration')}</dt>
                    <dd className="inline-flex items-center gap-1 font-mono font-black text-indigo-600 dark:text-indigo-400">
                        <Clock size={13} />
                        {copy('hoursValue', { value: duration.toFixed(1) })}
                    </dd>
                </div>
            </dl>

            {shift.notes && (
                <p className="mt-3 rounded-xl bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-600 dark:bg-white/5 dark:text-slate-300">
                    {shift.notes}
                </p>
            )}
        </article>
    );
};

const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-xs font-bold text-slate-400">{label}</div>;
const ErrorState = ({ copy, onRetry }) => (
    <div role="alert" className="p-10 text-center">
        <Users size={32} className="mx-auto text-rose-300 dark:text-rose-500" />
        <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-400">{copy('loadError')}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
            {copy('retry')}
        </button>
    </div>
);
const Empty = ({ copy, filtered }) => (
    <div className="p-12 text-center">
        <CalendarClock size={34} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-3 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default ShiftManager;
