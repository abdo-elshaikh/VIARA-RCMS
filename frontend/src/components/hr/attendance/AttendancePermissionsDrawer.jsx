import React, { useState, useMemo } from 'react';
import {
    CheckCircle2, XCircle, Clock, Calendar, UserCheck, Search,
    Filter, RefreshCw, AlertTriangle, ShieldCheck, X, FileText, ChevronDown, Check, MessageSquare
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../../ui/Modal';
import {
    useGetAttendancePermissionsQuery,
    useUpdateAttendancePermissionStatusMutation
} from '../../../store/api';
import { getErrorMessage } from '../../../utils/getErrorMessage';

const TYPE_CONFIG = {
    EarlyDeparture: {
        ar: 'انصراف مبكر',
        en: 'Early Departure',
        style: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
    },
    LateArrival: {
        ar: 'حضور متأخر',
        en: 'Late Arrival',
        style: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800'
    },
    EmergencyAccess: {
        ar: 'دخول طارئ',
        en: 'Emergency Access',
        style: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
    }
};

const STATUS_CONFIG = {
    Pending: {
        ar: 'قيد المراجعة',
        en: 'Pending Review',
        badge: 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400'
    },
    Approved: {
        ar: 'معتمد',
        en: 'Approved',
        badge: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400'
    },
    Rejected: {
        ar: 'مرفوض',
        en: 'Rejected',
        badge: 'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400'
    },
    Cancelled: {
        ar: 'ملغي',
        en: 'Cancelled',
        badge: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-400'
    }
};

export const AttendancePermissionsDrawer = ({ isOpen, onClose, canManage = true }) => {
    const { i18n, t } = useTranslation('workspace');
    const isArabic = i18n.language.startsWith('ar');

    const [statusFilter, setStatusFilter] = useState('All');
    const [typeFilter, setTypeFilter] = useState('All');
    const [search, setSearch] = useState('');
    const [reviewingId, setReviewingId] = useState(null);
    const [reviewAction, setReviewAction] = useState(null); // 'Approved' | 'Rejected'
    const [reviewNotes, setReviewNotes] = useState('');

    const queryParams = useMemo(() => {
        const p = {};
        if (statusFilter !== 'All') p.status = statusFilter;
        if (typeFilter !== 'All') p.permissionType = typeFilter;
        return p;
    }, [statusFilter, typeFilter]);

    const {
        data: permissions = [],
        isLoading,
        isFetching,
        refetch
    } = useGetAttendancePermissionsQuery(queryParams, { skip: !isOpen });

    const [updateStatus, { isLoading: isUpdating }] = useUpdateAttendancePermissionStatusMutation();

    const filteredList = useMemo(() => {
        if (!search.trim()) return permissions;
        const q = search.toLowerCase();
        return permissions.filter((p) => {
            const name = (p.employee_name || '').toLowerCase();
            const reason = (p.reason || '').toLowerCase();
            const role = (p.employee_role || '').toLowerCase();
            return name.includes(q) || reason.includes(q) || role.includes(q);
        });
    }, [permissions, search]);

    const pendingCount = useMemo(() => {
        return permissions.filter((p) => p.status === 'Pending').length;
    }, [permissions]);

    const handleOpenReview = (permission, action) => {
        setReviewingId(permission.permission_id);
        setReviewAction(action);
        setReviewNotes(action === 'Approved' ? 'تمت الموافقة الإدارية' : '');
    };

    const handleConfirmReview = async () => {
        if (!reviewingId || !reviewAction) return;
        try {
            await updateStatus({
                id: reviewingId,
                status: reviewAction,
                reviewNotes: reviewNotes.trim() || undefined
            }).unwrap();

            toast.success(
                isArabic
                    ? `تم ${reviewAction === 'Approved' ? 'اعتماد' : 'رفض'} طلب الإذن بنجاح`
                    : `Permission request ${reviewAction.toLowerCase()} successfully`
            );
            setReviewingId(null);
            setReviewAction(null);
            setReviewNotes('');
        } catch (err) {
            toast.error(getErrorMessage(err, isArabic ? 'تعذر تحديث حالة الإذن' : 'Failed to update permission status'));
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-2.5">
                    <UserCheck className="text-teal-600 dark:text-teal-400" size={20} />
                    <span>{isArabic ? 'إدارة أذونات وتصاريح الحضور' : 'Attendance Permissions & Exceptions'}</span>
                    {pendingCount > 0 && (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-black text-amber-600 dark:text-amber-400">
                            {pendingCount} {isArabic ? 'معلق' : 'pending'}
                        </span>
                    )}
                </div>
            }
            size="wide"
        >
            <div className="space-y-4 p-1 text-slate-800 dark:text-slate-200">
                {/* Filter Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                    {/* Status Tabs */}
                    <div className="flex flex-wrap gap-1">
                        {['All', 'Pending', 'Approved', 'Rejected'].map((st) => (
                            <button
                                key={st}
                                type="button"
                                onClick={() => setStatusFilter(st)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${statusFilter === st ? 'bg-teal-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                            >
                                {st === 'All' ? (isArabic ? 'الكل' : 'All') : isArabic ? STATUS_CONFIG[st]?.ar : STATUS_CONFIG[st]?.en}
                            </button>
                        ))}
                    </div>

                    {/* Permission Type Filter */}
                    <div className="flex items-center gap-2">
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="h-8 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 dark:border-slate-800 dark:bg-slate-900"
                        >
                            <option value="All">{isArabic ? 'جميع أنواع الأذونات' : 'All Types'}</option>
                            <option value="EarlyDeparture">{isArabic ? 'انصراف مبكر' : 'Early Departure'}</option>
                            <option value="LateArrival">{isArabic ? 'حضور متأخر' : 'Late Arrival'}</option>
                            <option value="EmergencyAccess">{isArabic ? 'دخول طارئ' : 'Emergency Access'}</option>
                        </select>

                        <button
                            type="button"
                            onClick={() => refetch()}
                            className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900"
                        >
                            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="flex w-full min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900 sm:w-auto">
                        <Search size={13} className="text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={isArabic ? 'بحث باسم الموظف أو المبرر...' : 'Search staff or reason...'}
                            className="w-full bg-transparent text-xs font-semibold outline-none"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')}>
                                <X size={12} className="text-slate-400" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Permissions List */}
                {isLoading ? (
                    <div className="flex h-48 items-center justify-center">
                        <RefreshCw className="h-7 w-7 animate-spin text-teal-600" />
                    </div>
                ) : filteredList.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                        <UserCheck className="mx-auto mb-2 text-slate-400" size={32} />
                        <p className="text-xs font-bold text-slate-500">
                            {isArabic ? 'لا توجد طلبات أذونات مطابقة للمعايير المحددة' : 'No permission requests found matching criteria'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredList.map((item) => {
                            const typeInfo = TYPE_CONFIG[item.permission_type] || { ar: item.permission_type, en: item.permission_type, style: 'bg-slate-100 text-slate-800' };
                            const statusInfo = STATUS_CONFIG[item.status] || { ar: item.status, en: item.status, badge: 'bg-slate-100 text-slate-700' };
                            const isPending = item.status === 'Pending';
                            const isThisBeingReviewed = reviewingId === item.permission_id;

                            return (
                                <div
                                    key={item.permission_id}
                                    className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-teal-500/50 dark:border-slate-800 dark:bg-slate-900"
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        {/* Left / Main Info */}
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${typeInfo.style}`}>
                                                    {isArabic ? typeInfo.ar : typeInfo.en}
                                                </span>
                                                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${statusInfo.badge}`}>
                                                    {isArabic ? statusInfo.ar : statusInfo.en}
                                                </span>
                                                <span className="text-[11px] font-mono font-bold text-slate-400">
                                                    #{item.permission_id.slice(0, 8)}
                                                </span>
                                            </div>

                                            <div>
                                                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                                                    {item.employee_name}
                                                    <span className="ms-2 text-xs font-bold text-slate-400">
                                                        ({item.employee_role})
                                                    </span>
                                                </h4>
                                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                                    {item.reason}
                                                </p>
                                            </div>

                                            {/* Details Badges */}
                                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                                <span className="inline-flex items-center gap-1">
                                                    <Calendar size={12} className="text-teal-600" />
                                                    {item.effective_date}
                                                </span>
                                                {item.minutes_granted > 0 && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock size={12} className="text-teal-600" />
                                                        {item.minutes_granted} {isArabic ? 'دقيقة مصرح بها' : 'permitted mins'}
                                                    </span>
                                                )}
                                                {item.allowed_time && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock size={12} className="text-teal-600" />
                                                        {item.allowed_time}
                                                    </span>
                                                )}
                                                {item.shift_start && (
                                                    <span className="text-[10px] text-slate-400">
                                                        ({isArabic ? 'الوردية' : 'Shift'}: {new Date(item.shift_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(item.shift_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                                    </span>
                                                )}
                                            </div>

                                            {/* Reviewer audit notes if reviewed */}
                                            {item.reviewed_by && (
                                                <div className="mt-2 rounded-xl bg-slate-50 p-2.5 text-[11px] dark:bg-slate-950/60">
                                                    <span className="font-bold text-slate-500">
                                                        {isArabic ? 'المراجع' : 'Reviewed by'}: {item.reviewer_name || item.reviewed_by} ·{' '}
                                                        {new Date(item.reviewed_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                    </span>
                                                    {item.review_notes && (
                                                        <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                                                            {item.review_notes}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Right / Actions */}
                                        {isPending && canManage && (
                                            <div className="flex shrink-0 items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenReview(item, 'Approved')}
                                                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-black text-white shadow-2xs transition hover:bg-emerald-700 active:scale-95"
                                                >
                                                    <Check size={14} />
                                                    <span>{isArabic ? 'قبول' : 'Approve'}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenReview(item, 'Rejected')}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 active:scale-95 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
                                                >
                                                    <X size={14} />
                                                    <span>{isArabic ? 'رفض' : 'Reject'}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Inline Review Decision Form */}
                                    {isThisBeingReviewed && (
                                        <div className="mt-3 rounded-xl border border-teal-500/30 bg-teal-50/40 p-3 dark:bg-teal-950/20">
                                            <p className="text-xs font-black text-teal-950 dark:text-teal-200">
                                                {reviewAction === 'Approved'
                                                    ? (isArabic ? 'تأكيد اعتماد طلب الإذن' : 'Confirm Permission Approval')
                                                    : (isArabic ? 'تأكيد رفض طلب الإذن' : 'Confirm Permission Rejection')}
                                            </p>
                                            <div className="mt-2 space-y-2">
                                                <input
                                                    type="text"
                                                    value={reviewNotes}
                                                    onChange={(e) => setReviewNotes(e.target.value)}
                                                    placeholder={isArabic ? 'ملاحظات المراجعة والاعتماد (اختياري)...' : 'Reviewer notes (optional)...'}
                                                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900"
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setReviewingId(null)}
                                                        className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200/50"
                                                    >
                                                        {isArabic ? 'إلغاء' : 'Cancel'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleConfirmReview}
                                                        disabled={isUpdating}
                                                        className={`rounded-xl px-4 py-1.5 text-xs font-black text-white shadow-2xs ${reviewAction === 'Approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                                                    >
                                                        {isUpdating ? (isArabic ? 'جارٍ الحفظ...' : 'Saving...') : (isArabic ? 'تأكيد القرار' : 'Confirm Decision')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AttendancePermissionsDrawer;
