import { useMemo, useState } from 'react';
import {
    CalendarOff, CheckCircle2, Clock, Plus, RefreshCw, Search, X, XCircle,
    Calendar, User, AlertCircle, FileText, DoorOpen, Clock3, ShieldCheck
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useCancelLeaveRequestMutation,
    useCreateLeaveRequestMutation,
    useGetAttendancePermissionsQuery,
    useGetEmployeeProfilesQuery,
    useGetLeaveBalancesQuery,
    useGetLeaveRequestsQuery,
    useUpdateAttendancePermissionStatusMutation,
    useUpdateLeaveBalanceMutation,
    useUpdateLeaveStatusMutation
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../../utils/roles';
import ConfirmDialog from '../ui/ConfirmDialog';
import { AttendancePermissionModal } from './attendance';

const emptyForm = { userId: '', startDate: '', endDate: '', leaveType: 'Sick', reason: '' };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-teal-500 dark:focus:ring-teal-500/20';
const parseDateOnly = value => new Date(`${String(value).substring(0, 10)}T00:00:00`);

// Working days (excludes Friday and Saturday, consistent with backend and payroll)
const countWorkingDays = (start, end) => {
    if (!start || !end) return 0;
    const s = parseDateOnly(start);
    const e = parseDateOnly(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    let count = 0;
    const cursor = new Date(s);
    while (cursor <= e) {
        const weekday = cursor.getDay();
        if (weekday !== 5 && weekday !== 6) count++;
        cursor.setDate(cursor.getDate() + 1);
    }
    return count;
};

const LeaveManager = ({ selfServiceOnly = false }) => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`hr.leave.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const isArabic = i18n.language.startsWith('ar');

    const { user } = useSelector(state => state.auth);
    const isReviewer = !selfServiceOnly && (hasDeveloperOrAdminRole(user?.role) || user?.role === 'HR');

    // Leave queries & mutations
    const { data: leaves = [], isLoading, isError, isFetching, refetch } = useGetLeaveRequestsQuery(isReviewer ? {} : { userId: user?.user_id }, { skip: !user });
    const { data: balanceRows = [] } = useGetLeaveBalancesQuery({ year: String(new Date().getFullYear()) }, { skip: !user });
    const { data: staffProfiles = [] } = useGetEmployeeProfilesQuery(undefined, { skip: !isReviewer });
    const [createLeave, { isLoading: isCreating }] = useCreateLeaveRequestMutation();
    const [updateStatus, { isLoading: isReviewing }] = useUpdateLeaveStatusMutation();
    const [cancelLeave, { isLoading: isCancelling }] = useCancelLeaveRequestMutation();
    const [updateBalance, { isLoading: isUpdatingBalance }] = useUpdateLeaveBalanceMutation();

    // Attendance permission queries & mutations
    const {
        data: permissions = [],
        isLoading: isPermissionsLoading,
        isError: isPermissionsError,
        isFetching: isPermissionsFetching,
        refetch: refetchPermissions
    } = useGetAttendancePermissionsQuery(isReviewer ? {} : { userId: user?.user_id }, { skip: !user });
    const [updatePermissionStatus, { isLoading: isReviewingPermission }] = useUpdateAttendancePermissionStatusMutation();

    // View & state management
    const [activeTab, setActiveTab] = useState('leaves'); // 'leaves' | 'permissions'
    const [showNew, setShowNew] = useState(false);
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [showAdjustBalance, setShowAdjustBalance] = useState(false);
    const [balanceForm, setBalanceForm] = useState({ userId: '', leaveType: 'Vacation', entitlementDays: 21, notes: '' });
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [form, setForm] = useState(emptyForm);
    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [permissionReviewTarget, setPermissionReviewTarget] = useState(null);
    const [permissionReviewNotes, setPermissionReviewNotes] = useState('');
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelNotes, setCancelNotes] = useState('');

    const calculatedDays = useMemo(() => countWorkingDays(form.startDate, form.endDate), [form.startDate, form.endDate]);

    // Balances for the target user (self or employee selected by reviewer)
    const targetUserId = form.userId || user?.user_id;
    const myBalances = useMemo(() => {
        const target = balanceRows.find(row => String(row.userId) === String(targetUserId));
        return target?.balances || [];
    }, [balanceRows, targetUserId]);
    const balanceFor = (leaveType) => myBalances.find(entry => entry.leaveType === leaveType);

    const visibleLeaves = useMemo(() => {
        const query = search.trim().toLowerCase();
        return leaves.filter(leave => {
            if (statusFilter !== 'all' && leave.status !== statusFilter) return false;
            return !query || [leave.employee_name, leave.leave_type, leave.reason, leave.status].filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [leaves, search, statusFilter]);

    const visiblePermissions = useMemo(() => {
        const query = search.trim().toLowerCase();
        return permissions.filter(perm => {
            if (statusFilter !== 'all' && perm.status !== statusFilter) return false;
            return !query || [
                perm.employee_name,
                perm.permission_type,
                perm.reason,
                perm.status,
                perm.reviewer_name,
                perm.review_notes
            ].filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [permissions, search, statusFilter]);

    const summary = useMemo(() => ({
        pending: leaves.filter(leave => leave.status === 'Pending').length,
        approved: leaves.filter(leave => leave.status === 'Approved').length,
        rejected: leaves.filter(leave => leave.status === 'Rejected').length,
        days: leaves.filter(leave => leave.status === 'Approved').reduce((total, leave) => total + countWorkingDays(leave.start_date, leave.end_date), 0)
    }), [leaves]);

    const permissionSummary = useMemo(() => ({
        pending: permissions.filter(p => p.status === 'Pending').length,
        approved: permissions.filter(p => p.status === 'Approved').length,
        rejected: permissions.filter(p => p.status === 'Rejected').length,
        totalMinutes: permissions.filter(p => p.status === 'Approved').reduce((total, p) => total + (Number(p.minutes_granted) || 0), 0)
    }), [permissions]);

    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));
    const closeForm = () => { if (!isCreating) { setShowNew(false); setForm(emptyForm); } };

    const handleSubmit = async event => {
        event.preventDefault();
        if (form.endDate < form.startDate) {
            toast.error(copy('endBeforeStart'));
            return;
        }
        const balance = balanceFor(form.leaveType);
        if (balance && calculatedDays > balance.remainingDays) {
            toast.error(copy('insufficientBalance', { remaining: balance.remainingDays, requested: calculatedDays, type: copy(`types.${form.leaveType}`) }));
            return;
        }
        try {
            await createLeave({
                ...form,
                userId: isReviewer && form.userId ? form.userId : undefined,
                reason: form.reason.trim() || undefined
            }).unwrap();
            toast.success(copy('createSuccess'));
            closeForm();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };

    const handleAdjustBalance = async (event) => {
        event.preventDefault();
        if (!balanceForm.userId) {
            toast.error(t('hr.leave.selectEmployeeRequired', { defaultValue: 'Please select an employee' }));
            return;
        }
        try {
            await updateBalance({
                userId: balanceForm.userId,
                leaveType: balanceForm.leaveType,
                entitlementDays: Number(balanceForm.entitlementDays),
                notes: balanceForm.notes.trim() || undefined,
                year: new Date().getFullYear()
            }).unwrap();
            toast.success(t('hr.leave.balanceUpdated', { defaultValue: 'Leave balance updated successfully' }));
            setShowAdjustBalance(false);
            setBalanceForm({ userId: '', leaveType: 'Vacation', entitlementDays: 21, notes: '' });
        } catch (error) {
            toast.error(getErrorMessage(error, t('hr.leave.balanceUpdateFailed', { defaultValue: 'Failed to update leave balance' })));
        }
    };

    const confirmReview = async () => {
        if (!reviewTarget) return false;
        try {
            await updateStatus({
                id: reviewTarget.leave.request_id,
                status: reviewTarget.status,
                notes: reviewNotes.trim() || undefined
            }).unwrap();
            toast.success(copy(reviewTarget.status === 'Approved' ? 'approveSuccess' : 'rejectSuccess'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, copy('reviewError')));
            return false;
        }
    };

    const confirmPermissionReview = async () => {
        if (!permissionReviewTarget) return false;
        try {
            await updatePermissionStatus({
                id: permissionReviewTarget.permission.permission_id,
                status: permissionReviewTarget.status,
                reviewNotes: permissionReviewNotes.trim() || undefined
            }).unwrap();
            toast.success(isArabic
                ? (permissionReviewTarget.status === 'Approved' ? 'تمت الموافقة على إذن الانصراف بنجاح' : 'تم رفض إذن الانصراف')
                : (permissionReviewTarget.status === 'Approved' ? 'Permission approved successfully' : 'Permission rejected')
            );
            setPermissionReviewTarget(null);
            setPermissionReviewNotes('');
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'تعذر تحديث حالة الإذن' : 'Failed to update permission status'));
            return false;
        }
    };

    const startReview = target => {
        setReviewNotes('');
        setReviewTarget(target);
    };

    const confirmCancel = async () => {
        if (!cancelTarget) return false;
        if (cancelTarget.status === 'Approved' && cancelNotes.trim().length < 3) {
            toast.error(copy('cancelReasonRequired'));
            return false;
        }
        try {
            await cancelLeave({ id: cancelTarget.request_id, notes: cancelNotes.trim() || undefined }).unwrap();
            toast.success(copy('cancelSuccess'));
            setCancelTarget(null);
            setCancelNotes('');
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, copy('cancelError')));
            return false;
        }
    };

    const formatDate = value => {
        if (!value) return copy('notAvailable');
        const date = parseDateOnly(value);
        return Number.isNaN(date.getTime()) ? copy('notAvailable') : date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const isCurrentFetching = activeTab === 'leaves' ? isFetching : isPermissionsFetching;
    const handleRefresh = () => {
        if (activeTab === 'leaves') {
            refetch();
        } else {
            refetchPermissions();
        }
    };

    return (
        <div className="space-y-4">
            {/* View Switcher Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/90 p-1 dark:border-slate-800 dark:bg-slate-900/80">
                    <button
                        type="button"
                        onClick={() => setActiveTab('leaves')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                            activeTab === 'leaves'
                                ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-800 dark:text-teal-300'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                    >
                        <CalendarOff size={15} />
                        <span>{isArabic ? 'طلبات الإجازات' : 'Leave Requests'}</span>
                        <span className="rounded-full bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-700">
                            {leaves.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('permissions')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                            activeTab === 'permissions'
                                ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-800 dark:text-emerald-300'
                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                    >
                        <DoorOpen size={15} />
                        <span>{isArabic ? 'أذونات الانصراف والحضور' : 'Departure & Attendance'}</span>
                        <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                            permissionSummary.pending > 0
                                ? 'bg-amber-100 font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-200/70 dark:bg-slate-700'
                        }`}>
                            {permissions.length}
                        </span>
                    </button>
                </div>

                {/* Quick Action: File Departure Permission */}
                <button
                    type="button"
                    onClick={() => setShowPermissionModal(true)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-3.5 text-xs font-black text-emerald-800 shadow-xs transition hover:border-emerald-400 hover:from-emerald-100 hover:to-teal-100 dark:border-emerald-700/60 dark:from-emerald-950/40 dark:to-teal-950/30 dark:text-emerald-300 dark:hover:border-emerald-600"
                >
                    <DoorOpen size={15} className="text-emerald-600 dark:text-emerald-400" />
                    <span>{isArabic ? 'طلب إذن انصراف / حضور' : 'Request Departure Permission'}</span>
                </button>
            </div>

            {/* Summary Cards */}
            {activeTab === 'leaves' ? (
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={copy('summaryLabel')}>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[10px] font-black uppercase text-slate-400">{copy('pending')}</p>
                        <p className="mt-1 font-mono text-xl font-black text-amber-600 dark:text-amber-400">{summary.pending}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[10px] font-black uppercase text-slate-400">{copy('approved')}</p>
                        <p className="mt-1 font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">{summary.approved}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[10px] font-black uppercase text-slate-400">{copy('rejected')}</p>
                        <p className="mt-1 font-mono text-xl font-black text-rose-600 dark:text-rose-400">{summary.rejected}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[10px] font-black uppercase text-slate-400">{copy('approvedDays')}</p>
                        <p className="mt-1 font-mono text-xl font-black text-teal-600 dark:text-teal-400">{summary.days} {copy('daysValue', { count: summary.days })}</p>
                    </div>
                </section>
            ) : (
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Permissions summary">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[10px] font-black uppercase text-slate-400">{isArabic ? 'أذونات قيد المراجعة' : 'Pending Permissions'}</p>
                        <p className="mt-1 font-mono text-xl font-black text-amber-600 dark:text-amber-400">{permissionSummary.pending}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[10px] font-black uppercase text-slate-400">{isArabic ? 'أذونات مقبولة' : 'Approved Permissions'}</p>
                        <p className="mt-1 font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">{permissionSummary.approved}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[10px] font-black uppercase text-slate-400">{isArabic ? 'أذونات مرفوضة' : 'Rejected Permissions'}</p>
                        <p className="mt-1 font-mono text-xl font-black text-rose-600 dark:text-rose-400">{permissionSummary.rejected}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[10px] font-black uppercase text-slate-400">{isArabic ? 'إجمالي الدقائق المصرحة' : 'Total Granted Minutes'}</p>
                        <p className="mt-1 font-mono text-xl font-black text-teal-600 dark:text-teal-400">
                            {permissionSummary.totalMinutes} {isArabic ? 'دقيقة' : 'mins'}
                        </p>
                    </div>
                </section>
            )}

            {/* Main Panel */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <header className="border-b border-slate-100 p-4 dark:border-slate-800">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* Title & Info */}
                        <div className="flex items-center gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                activeTab === 'leaves'
                                    ? 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60'
                                    : 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60'
                            }`}>
                                {activeTab === 'leaves' ? <CalendarOff size={20} /> : <DoorOpen size={20} />}
                            </span>
                            <div>
                                <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white sm:text-lg">
                                    {activeTab === 'leaves'
                                        ? copy('title')
                                        : (isArabic ? 'أذونات الانصراف والحضور' : 'Departure & Attendance Permissions')}
                                </h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {activeTab === 'leaves'
                                        ? copy(isReviewer ? 'reviewerDescription' : 'employeeDescription')
                                        : (isArabic
                                            ? (isReviewer ? 'مراجعة واعتماد أذونات الانصراف المبكر والحضور المتأخر للموظفين' : 'سجل أذونات الانصراف والحضور الخاصة بك ومتابعة حالات الاعتماد')
                                            : (isReviewer ? 'Review and manage staff departure and attendance requests' : 'Track your departure and attendance requests and approval status'))}
                                </p>
                            </div>
                        </div>

                        {/* Search & Actions Bar */}
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="relative min-w-[200px] flex-1 sm:flex-initial">
                                <span className="sr-only">{copy('search')}</span>
                                <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder={copy('searchPlaceholder')}
                                    className={`${inputClass} h-9 ps-9 text-xs`}
                                />
                            </label>

                            <select
                                value={statusFilter}
                                onChange={event => setStatusFilter(event.target.value)}
                                aria-label={copy('filterStatus')}
                                className={`${inputClass} h-9 w-auto text-xs`}
                            >
                                <option value="all">{copy('allStatuses')}</option>
                                {['Pending', 'Approved', 'Rejected', 'Cancelled'].map(status => (
                                    <option key={status} value={status}>{copy(`statuses.${status}`)}</option>
                                ))}
                            </select>

                            <button
                                type="button"
                                onClick={handleRefresh}
                                disabled={isCurrentFetching}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <RefreshCw size={14} className={isCurrentFetching ? 'animate-spin text-teal-600' : ''} />
                            </button>

                            {activeTab === 'leaves' && isReviewer && (
                                <button
                                    type="button"
                                    onClick={() => setShowAdjustBalance(true)}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/60 px-3 text-xs font-bold text-teal-700 shadow-xs transition hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300"
                                >
                                    <Calendar size={14} />
                                    {t('hr.leave.adjustBalance', { defaultValue: 'Adjust Balance' })}
                                </button>
                            )}

                            {activeTab === 'leaves' ? (
                                <button
                                    type="button"
                                    onClick={() => setShowNew(value => !value)}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700"
                                >
                                    {showNew ? <X size={15} /> : <Plus size={15} />}
                                    {showNew ? copy('closeForm') : copy('requestLeave')}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowPermissionModal(true)}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
                                >
                                    <Plus size={15} />
                                    {isArabic ? 'طلب إذن جديد' : 'New Permission'}
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {/* Create Request Overlay for Leaves */}
                {activeTab === 'leaves' && showNew && (
                    <form onSubmit={handleSubmit} className="border-b border-amber-200/80 bg-amber-50/40 p-4 dark:border-slate-800 dark:bg-amber-950/10">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            {isReviewer && (
                                <Field label={t('hr.leave.selectEmployee', { defaultValue: 'Employee (On Behalf)' })}>
                                    <select
                                        value={form.userId || ''}
                                        onChange={event => setField('userId', event.target.value)}
                                        className={inputClass}
                                    >
                                        <option value="">{t('hr.leave.self', { defaultValue: 'Myself' })} ({user?.full_name})</option>
                                        {staffProfiles.map(emp => (
                                            <option key={emp.user_id} value={emp.user_id}>
                                                {emp.full_name} ({emp.role})
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            )}

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
                        </div>

                        {calculatedDays > 0 && (
                            <div className="mt-3 flex items-center gap-2 text-xs font-black text-amber-800 dark:text-amber-300">
                                <Calendar size={14} />
                                <span>{t('hr.leave.duration', { defaultValue: 'Calculated Duration:' })} {calculatedDays} {copy('daysValue', { count: calculatedDays })}</span>
                            </div>
                        )}

                        {myBalances.length > 0 && (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                                {myBalances.map(entry => (
                                    <div key={entry.leaveType} className={`rounded-xl border p-2.5 text-center ${form.leaveType === entry.leaveType ? 'border-teal-400/60 bg-teal-50/70 dark:border-teal-500/40 dark:bg-teal-500/10' : 'border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40'}`}>
                                        <p className="text-[10px] font-black uppercase text-slate-400">{copy(`types.${entry.leaveType}`)}</p>
                                        <p className={`mt-0.5 font-mono text-sm font-black ${entry.remainingDays <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>{entry.remainingDays}</p>
                                        <p className="text-[9px] font-bold text-slate-400">{copy('ofDays', { total: entry.entitlementDays })}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button type="button" onClick={closeForm} disabled={isCreating} className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800">
                                {copy('cancel')}
                            </button>
                            <button type="submit" disabled={isCreating} className="rounded-xl bg-teal-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700 disabled:opacity-50">
                                {isCreating ? copy('submitting') : copy('submit')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Content: Leaves or Permissions */}
                {activeTab === 'leaves' ? (
                    isLoading ? (
                        <Loading label={copy('loading')} />
                    ) : isError ? (
                        <ErrorState copy={copy} onRetry={refetch} />
                    ) : visibleLeaves.length === 0 ? (
                        <Empty copy={copy} filtered={Boolean(search || statusFilter !== 'all')} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[850px] border-collapse text-start text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">
                                        <th className="px-4 py-3 text-start">{copy('employee')}</th>
                                        <th className="px-3 py-3 text-start">{copy('dates')}</th>
                                        <th className="px-3 py-3 text-start">{copy('typeReason')}</th>
                                        <th className="px-3 py-3 text-start">{copy('status')}</th>
                                        <th className="px-4 py-3 text-end">{copy('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {visibleLeaves.map(leave => (
                                        <LeaveRow
                                            key={leave.request_id}
                                            leave={leave}
                                            copy={copy}
                                            formatDate={formatDate}
                                            currentUserId={user?.user_id}
                                            onReview={startReview}
                                            onCancel={setCancelTarget}
                                            reviewer={isReviewer}
                                            reviewing={isReviewing}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    /* Permissions Tab Content */
                    isPermissionsLoading ? (
                        <Loading label={isArabic ? 'جاري تحميل سجل أذونات الانصراف والحضور...' : 'Loading permissions...'} />
                    ) : isPermissionsError ? (
                        <div role="alert" className="p-8 text-center">
                            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                {isArabic ? 'تعذر تحميل سجل الأذونات' : 'Failed to load permissions'}
                            </p>
                            <button
                                type="button"
                                onClick={() => refetchPermissions()}
                                className="mt-2.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300"
                            >
                                {copy('retry')}
                            </button>
                        </div>
                    ) : visiblePermissions.length === 0 ? (
                        <div className="p-10 text-center">
                            <DoorOpen size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
                            <p className="mt-2 text-sm font-black text-slate-900 dark:text-white">
                                {isArabic ? 'لا توجد أذونات انصراف أو حضور' : 'No attendance permissions found'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {isArabic
                                    ? 'يمكنك تقديم طلب إذن انصراف مبكر أو حضور متأخر باستخدام زر "طلب إذن انصراف / حضور".'
                                    : 'You can submit early departure or late arrival permission requests anytime.'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[850px] border-collapse text-start text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">
                                        <th className="px-4 py-3 text-start">{copy('employee')}</th>
                                        <th className="px-3 py-3 text-start">{isArabic ? 'نوع الإذن' : 'Permission Type'}</th>
                                        <th className="px-3 py-3 text-start">{isArabic ? 'التاريخ والوقت' : 'Date & Time'}</th>
                                        <th className="px-3 py-3 text-start">{isArabic ? 'المدة والسبب' : 'Duration & Reason'}</th>
                                        <th className="px-3 py-3 text-start">{copy('status')}</th>
                                        <th className="px-4 py-3 text-end">{copy('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {visiblePermissions.map(perm => (
                                        <PermissionRow
                                            key={perm.permission_id}
                                            permission={perm}
                                            isArabic={isArabic}
                                            formatDate={formatDate}
                                            currentUserId={user?.user_id}
                                            reviewer={isReviewer}
                                            reviewing={isReviewingPermission}
                                            onReview={(p, status) => {
                                                setPermissionReviewNotes('');
                                                setPermissionReviewTarget({ permission: p, status });
                                            }}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </section>

            {/* Leave Review Confirm Dialog */}
            <ConfirmDialog
                isOpen={Boolean(reviewTarget)}
                onClose={() => { setReviewTarget(null); setReviewNotes(''); }}
                onConfirm={confirmReview}
                title={copy(reviewTarget?.status === 'Approved' ? 'approveTitle' : 'rejectTitle')}
                message={copy(reviewTarget?.status === 'Approved' ? 'approveMessage' : 'rejectMessage', {
                    employee: reviewTarget?.leave?.employee_name || '',
                    dates: reviewTarget?.leave ? `${formatDate(reviewTarget.leave.start_date)} - ${formatDate(reviewTarget.leave.end_date)}` : ''
                })}
                confirmLabel={copy(reviewTarget?.status === 'Approved' ? 'approveAction' : 'rejectAction')}
                cancelLabel={copy('cancel')}
                isLoading={isReviewing}
                variant={reviewTarget?.status === 'Approved' ? 'info' : 'warning'}
            >
                <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{copy('reviewNotes')}</span>
                    <textarea
                        value={reviewNotes}
                        onChange={event => setReviewNotes(event.target.value)}
                        maxLength={500}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-teal-500 dark:focus:ring-teal-500/20"
                        placeholder={copy('reviewNotesPlaceholder')}
                    />
                </label>
            </ConfirmDialog>

            {/* Attendance Permission Review Confirm Dialog */}
            <ConfirmDialog
                isOpen={Boolean(permissionReviewTarget)}
                onClose={() => { setPermissionReviewTarget(null); setPermissionReviewNotes(''); }}
                onConfirm={confirmPermissionReview}
                title={isArabic
                    ? (permissionReviewTarget?.status === 'Approved' ? 'اعتماد إذن الانصراف / الحضور' : 'رفض طلب الإذن')
                    : (permissionReviewTarget?.status === 'Approved' ? 'Approve Attendance Permission' : 'Reject Permission Request')}
                message={isArabic
                    ? `هل أنت متأكد من ${permissionReviewTarget?.status === 'Approved' ? 'الموافقة على' : 'رفض'} طلب الإذن الخاص بالموظف ${permissionReviewTarget?.permission?.employee_name || ''}؟`
                    : `Are you sure you want to ${permissionReviewTarget?.status?.toLowerCase()} the permission request for ${permissionReviewTarget?.permission?.employee_name || 'this employee'}?`}
                confirmLabel={isArabic
                    ? (permissionReviewTarget?.status === 'Approved' ? 'تأكيد الموافقة' : 'تأكيد الرفض')
                    : (permissionReviewTarget?.status === 'Approved' ? 'Approve' : 'Reject')}
                cancelLabel={copy('cancel')}
                isLoading={isReviewingPermission}
                variant={permissionReviewTarget?.status === 'Approved' ? 'info' : 'warning'}
            >
                <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {isArabic ? 'ملاحظات المراجعة (اختياري عند القبول / إلزامي عند الرفض)' : 'Review Notes'}
                    </span>
                    <textarea
                        value={permissionReviewNotes}
                        onChange={event => setPermissionReviewNotes(event.target.value)}
                        maxLength={500}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20"
                        placeholder={isArabic ? 'اكتب ملاحظات أو أسباب القرار...' : 'Add decision notes or explanation...'}
                    />
                </label>
            </ConfirmDialog>

            {/* Cancel Leave Request Dialog */}
            <ConfirmDialog
                isOpen={Boolean(cancelTarget)}
                onClose={() => { setCancelTarget(null); setCancelNotes(''); }}
                onConfirm={confirmCancel}
                title={copy('cancelTitle')}
                message={copy('cancelMessage', { dates: cancelTarget ? `${formatDate(cancelTarget.start_date)} - ${formatDate(cancelTarget.end_date)}` : '' })}
                confirmLabel={copy('cancelAction')}
                cancelLabel={copy('cancel')}
                isLoading={isCancelling}
                variant="warning"
            >
                <textarea
                    value={cancelNotes}
                    onChange={event => setCancelNotes(event.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    placeholder={copy('cancelNotesPlaceholder')}
                />
            </ConfirmDialog>

            {/* Adjust Leave Balance Dialog */}
            <ConfirmDialog
                isOpen={showAdjustBalance}
                onClose={() => { setShowAdjustBalance(false); }}
                onConfirm={handleAdjustBalance}
                title={t('hr.leave.adjustBalanceTitle', { defaultValue: 'Adjust Annual Leave Entitlement' })}
                message={t('hr.leave.adjustBalanceDesc', { defaultValue: 'Override the default annual leave entitlement for an employee for the current year.' })}
                confirmLabel={t('common.save', { defaultValue: 'Save Changes' })}
                cancelLabel={copy('cancel')}
                isLoading={isUpdatingBalance}
                variant="info"
            >
                <div className="mt-2 space-y-3">
                    <Field label={t('hr.leave.selectEmployee', { defaultValue: 'Employee' })}>
                        <select
                            required
                            value={balanceForm.userId}
                            onChange={e => setBalanceForm(prev => ({ ...prev, userId: e.target.value }))}
                            className={inputClass}
                        >
                            <option value="">-- {t('hr.leave.selectEmployee', { defaultValue: 'Select Employee' })} --</option>
                            {staffProfiles.map(emp => (
                                <option key={emp.user_id} value={emp.user_id}>
                                    {emp.full_name} ({emp.role})
                                </option>
                            ))}
                        </select>
                    </Field>

                    <div className="grid grid-cols-2 gap-2">
                        <Field label={copy('leaveType')}>
                            <select
                                value={balanceForm.leaveType}
                                onChange={e => setBalanceForm(prev => ({ ...prev, leaveType: e.target.value }))}
                                className={inputClass}
                            >
                                {['Vacation', 'Sick', 'Personal'].map(type => (
                                    <option key={type} value={type}>{copy(`types.${type}`)}</option>
                                ))}
                            </select>
                        </Field>

                        <Field label={t('hr.leave.entitlementDays', { defaultValue: 'Entitlement (Days)' })}>
                            <input
                                type="number"
                                min="0"
                                max="365"
                                step="0.5"
                                required
                                value={balanceForm.entitlementDays}
                                onChange={e => setBalanceForm(prev => ({ ...prev, entitlementDays: e.target.value }))}
                                className={inputClass}
                            />
                        </Field>
                    </div>

                    <Field label={t('common.notes', { defaultValue: 'Notes / Reason' })}>
                        <input
                            type="text"
                            maxLength={500}
                            placeholder={t('hr.leave.adjustmentReason', { defaultValue: 'e.g. Contract renewal, additional seniority' })}
                            value={balanceForm.notes}
                            onChange={e => setBalanceForm(prev => ({ ...prev, notes: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                </div>
            </ConfirmDialog>

            {/* Attendance Permission Modal */}
            <AttendancePermissionModal
                isOpen={showPermissionModal}
                onClose={() => setShowPermissionModal(false)}
                staff={staffProfiles}
            />
        </div>
    );
};

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const Status = ({ leave, copy }) => {
    const Icon = leave.status === 'Approved' ? CheckCircle2 : leave.status === 'Rejected' ? XCircle : leave.status === 'Cancelled' ? XCircle : Clock;
    const tone = leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
        : ['Rejected', 'Cancelled'].includes(leave.status) ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
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

const ReviewActions = ({ leave, copy, currentUserId, onReview, onCancel, reviewer, reviewing }) => {
    if (leave.status === 'Pending' && String(leave.user_id) === String(currentUserId)) {
        return <button type="button" disabled={reviewing} onClick={() => onCancel(leave)} className="text-end text-[11px] font-bold text-amber-700 hover:underline dark:text-amber-300">{copy('withdraw')}</button>;
    }
    if (leave.status === 'Approved' && reviewer) {
        return <button type="button" disabled={reviewing} onClick={() => onCancel(leave)} className="text-end text-[11px] font-bold text-rose-700 hover:underline dark:text-rose-300">{copy('cancelApproved')}</button>;
    }
    if (leave.status !== 'Pending') return null;
    if (String(leave.user_id) === String(currentUserId)) {
        return <p className="text-end text-[11px] font-bold text-slate-400">{copy('ownRequest')}</p>;
    }
    return (
        <div className="flex flex-wrap justify-end gap-1.5">
            <button
                type="button"
                disabled={reviewing}
                onClick={() => onReview({ leave, status: 'Approved' })}
                className="inline-flex h-7 items-center rounded-lg bg-emerald-600 px-3 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
            >
                {copy('approve')}
            </button>
            <button
                type="button"
                disabled={reviewing}
                onClick={() => onReview({ leave, status: 'Rejected' })}
                className="inline-flex h-7 items-center rounded-lg border border-rose-200 bg-white px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300"
            >
                {copy('reject')}
            </button>
        </div>
    );
};

const LeaveRow = ({ leave, copy, formatDate, reviewer, currentUserId, onReview, onCancel, reviewing }) => {
    const days = countWorkingDays(leave.start_date, leave.end_date);

    return (
        <tr className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
            <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-teal-600 text-xs font-black text-white shadow-xs">
                        {leave.employee_name?.[0]?.toUpperCase() || '?'}
                    </span>
                    <p className="truncate font-black text-slate-900 dark:text-white">{leave.employee_name}</p>
                </div>
            </td>
            <td className="px-3 py-3 font-medium text-slate-600 dark:text-slate-400">
                <p className="font-bold text-slate-800 dark:text-slate-200">{formatDate(leave.start_date)} - {formatDate(leave.end_date)}</p>
                <p className="text-[11px] font-bold text-teal-600 dark:text-teal-400">{days} {copy('daysValue', { count: days })}</p>
            </td>
            <td className="px-3 py-3">
                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {copy(`types.${leave.leave_type}`)}
                </span>
                {leave.reason && (
                    <p className="mt-1 max-w-xs truncate text-[11px] text-slate-500 dark:text-slate-400">{leave.reason}</p>
                )}
            </td>
            <td className="px-3 py-3"><Status leave={leave} copy={copy} /></td>
            <td className="px-4 py-3 text-end"><ReviewActions leave={leave} copy={copy} currentUserId={currentUserId} onReview={onReview} onCancel={onCancel} reviewer={reviewer} reviewing={reviewing} /></td>
        </tr>
    );
};

const PermissionRow = ({ permission, isArabic, formatDate, reviewer, currentUserId, onReview, reviewing }) => {
    const isEarlyDeparture = permission.permission_type === 'EarlyDeparture';
    const isLateArrival = permission.permission_type === 'LateArrival';

    const typeIcon = isEarlyDeparture ? DoorOpen : isLateArrival ? Clock3 : ShieldCheck;
    const TypeIcon = typeIcon;

    const typeBadge = isEarlyDeparture
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
        : isLateArrival
            ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300'
            : 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300';

    const typeLabel = isEarlyDeparture
        ? (isArabic ? 'إذن انصراف مبكر' : 'Early Departure')
        : isLateArrival
            ? (isArabic ? 'إذن حضور متأخر' : 'Late Arrival')
            : (isArabic ? 'إذن دخول طارئ' : 'Emergency Access');

    const statusTone = permission.status === 'Approved'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
        : permission.status === 'Rejected'
            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';

    const StatusIcon = permission.status === 'Approved' ? CheckCircle2 : permission.status === 'Rejected' ? XCircle : Clock;

    const statusLabel = permission.status === 'Approved'
        ? (isArabic ? 'معتمد' : 'Approved')
        : permission.status === 'Rejected'
            ? (isArabic ? 'مرفوض' : 'Rejected')
            : (isArabic ? 'قيد المراجعة' : 'Pending');

    const isOwnRequest = String(permission.user_id) === String(currentUserId);

    return (
        <tr className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
            {/* Employee */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-black text-white shadow-xs">
                        {permission.employee_name?.[0]?.toUpperCase() || '?'}
                    </span>
                    <div>
                        <p className="truncate font-black text-slate-900 dark:text-white">{permission.employee_name}</p>
                        {permission.employee_role && (
                            <p className="text-[10px] font-semibold text-slate-400">{permission.employee_role}</p>
                        )}
                    </div>
                </div>
            </td>

            {/* Permission Type */}
            <td className="px-3 py-3">
                <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-black ${typeBadge}`}>
                    <TypeIcon size={13} />
                    {typeLabel}
                </span>
            </td>

            {/* Date & Time */}
            <td className="px-3 py-3 font-medium text-slate-600 dark:text-slate-400">
                <p className="font-bold text-slate-800 dark:text-slate-200">{formatDate(permission.effective_date)}</p>
                {permission.allowed_time ? (
                    <p className="text-[11px] font-bold text-teal-600 dark:text-teal-400">
                        {isArabic ? 'الساعة: ' : 'Time: '}{permission.allowed_time}
                    </p>
                ) : permission.shift_start ? (
                    <p className="text-[10px] text-slate-400">
                        {isArabic ? 'وردية: ' : 'Shift: '}{permission.shift_start.slice(0, 5)} - {permission.shift_end?.slice(0, 5)}
                    </p>
                ) : null}
            </td>

            {/* Duration & Reason */}
            <td className="px-3 py-3">
                <div className="flex items-center gap-1.5">
                    <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {permission.minutes_granted || 0} {isArabic ? 'دقيقة' : 'mins'}
                    </span>
                </div>
                {permission.reason && (
                    <p className="mt-1 max-w-xs truncate text-[11px] text-slate-500 dark:text-slate-400" title={permission.reason}>
                        {permission.reason}
                    </p>
                )}
            </td>

            {/* Status */}
            <td className="px-3 py-3">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusTone}`}>
                    <StatusIcon size={12} />
                    {statusLabel}
                </span>
                {permission.reviewer_name && (
                    <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                        {isArabic ? `بواسطة: ${permission.reviewer_name}` : `By: ${permission.reviewer_name}`}
                    </p>
                )}
                {permission.review_notes && (
                    <p className="mt-0.5 max-w-xs truncate text-[10px] text-slate-500 dark:text-slate-400" title={permission.review_notes}>
                        {permission.review_notes}
                    </p>
                )}
            </td>

            {/* Actions */}
            <td className="px-4 py-3 text-end">
                {permission.status === 'Pending' ? (
                    reviewer && !isOwnRequest ? (
                        <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                                type="button"
                                disabled={reviewing}
                                onClick={() => onReview(permission, 'Approved')}
                                className="inline-flex h-7 items-center rounded-lg bg-emerald-600 px-3 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {isArabic ? 'موافقة' : 'Approve'}
                            </button>
                            <button
                                type="button"
                                disabled={reviewing}
                                onClick={() => onReview(permission, 'Rejected')}
                                className="inline-flex h-7 items-center rounded-lg border border-rose-200 bg-white px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300"
                            >
                                {isArabic ? 'رفض' : 'Reject'}
                            </button>
                        </div>
                    ) : (
                        <p className="text-end text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            {isArabic ? 'قيد المراجعة' : 'In review'}
                        </p>
                    )
                ) : (
                    <p className="text-end text-[11px] font-bold text-slate-400">
                        {isArabic ? 'مكتمل' : 'Completed'}
                    </p>
                )}
            </td>
        </tr>
    );
};

const Loading = ({ label }) => <div className="animate-pulse p-10 text-center text-xs font-bold text-slate-400">{label}</div>;

const ErrorState = ({ copy, onRetry }) => (
    <div role="alert" className="p-8 text-center">
        <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{copy('loadError')}</p>
        <button type="button" onClick={onRetry} className="mt-2.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300">
            {copy('retry')}
        </button>
    </div>
);

const Empty = ({ copy, filtered }) => (
    <div className="p-10 text-center">
        <CalendarOff size={32} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-2 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default LeaveManager;
