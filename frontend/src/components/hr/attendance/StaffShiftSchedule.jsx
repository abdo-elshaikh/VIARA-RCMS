import React, { useState, useMemo } from 'react';
import {
    Calendar, Clock, ArrowLeftRight, Edit3, CheckCircle2,
    XCircle, AlertCircle, Sparkles, Send, Filter, Plus,
    UserCheck, ChevronRight, Activity, ShieldCheck, RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../../../store/authSlice';
import {
    useGetShiftsQuery,
    useGetShiftRequestsQuery,
    useCreateShiftRequestMutation,
    useGetStaffQuery
} from '../../../store/api';
import Modal from '../../ui/Modal';
import { getErrorMessage } from '../../../utils/getErrorMessage';

const formatShiftTime = (isoString, isArabic) => {
    if (!isoString) return '—';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return isoString;
    }
};

const formatShiftDate = (isoString, isArabic) => {
    if (!isoString) return '—';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString(isArabic ? 'ar-EG' : 'en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch {
        return isoString;
    }
};

const calculateShiftDurationHours = (start, end) => {
    if (!start || !end) return 0;
    try {
        const diffMs = new Date(end) - new Date(start);
        return Math.max(0, (diffMs / (1000 * 60 * 60)).toFixed(1));
    } catch {
        return 0;
    }
};

export const StaffShiftSchedule = ({ userId: targetUserId, selfService = true }) => {
    const { t, i18n } = useTranslation(['workspace', 'common']);
    const isArabic = i18n.language.startsWith('ar');
    const currentUser = useSelector(selectCurrentUser);

    const effectiveUserId = targetUserId || currentUser?.id || currentUser?.user_id || currentUser?.userId;

    // Queries
    const {
        data: shiftsData,
        isLoading: isShiftsLoading,
        refetch: refetchShifts
    } = useGetShiftsQuery(effectiveUserId ? { userId: effectiveUserId } : undefined);

    const {
        data: requestsData,
        isLoading: isRequestsLoading,
        refetch: refetchRequests
    } = useGetShiftRequestsQuery(effectiveUserId ? { userId: effectiveUserId } : undefined);

    const { data: staffList = [] } = useGetStaffQuery();
    const [createShiftRequest, { isLoading: isSubmittingRequest }] = useCreateShiftRequestMutation();

    // Modals
    const [swapModalOpen, setSwapModalOpen] = useState(false);
    const [modModalOpen, setModModalOpen] = useState(false);
    const [selectedTab, setSelectedTab] = useState('upcoming'); // 'upcoming' | 'requests'

    // Form states
    const [swapForm, setSwapForm] = useState({
        shift_id: '',
        target_user_id: '',
        target_shift_id: '',
        reason: ''
    });

    const [modForm, setModForm] = useState({
        shift_id: '',
        proposed_date: '',
        proposed_start_time: '',
        proposed_end_time: '',
        reason: ''
    });

    // Extract shifts array
    const shifts = useMemo(() => {
        const raw = shiftsData?.items || shiftsData?.shifts || (Array.isArray(shiftsData) ? shiftsData : []);
        // Filter by user if targetUserId provided and not filtered by backend
        const list = effectiveUserId
            ? raw.filter(s => String(s.user_id) === String(effectiveUserId))
            : raw;
        // Sort upcoming first
        return [...list].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }, [shiftsData, effectiveUserId]);

    // Extract requests array
    const requests = useMemo(() => {
        const raw = requestsData?.items || requestsData?.requests || (Array.isArray(requestsData) ? requestsData : []);
        return [...raw].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [requestsData]);

    // Next upcoming shift
    const nextShift = useMemo(() => {
        const now = new Date();
        return shifts.find(s => new Date(s.end_time) >= now);
    }, [shifts]);

    // Colleagues list (excluding target employee)
    const colleagues = useMemo(() => {
        return staffList.filter(s => String(s.user_id) !== String(effectiveUserId));
    }, [staffList, effectiveUserId]);

    // Open swap modal with pre-selected shift
    const handleOpenSwap = (shiftId = '') => {
        setSwapForm({
            shift_id: shiftId || (shifts[0]?.shift_id ? String(shifts[0].shift_id) : ''),
            target_user_id: '',
            target_shift_id: '',
            reason: ''
        });
        setSwapModalOpen(true);
    };

    // Open mod modal with pre-selected shift
    const handleOpenMod = (shift = null) => {
        const target = shift || shifts[0];
        const startDate = target?.start_time ? new Date(target.start_time).toISOString().slice(0, 10) : '';
        const startTime = target?.start_time ? new Date(target.start_time).toTimeString().slice(0, 5) : '09:00';
        const endTime = target?.end_time ? new Date(target.end_time).toTimeString().slice(0, 5) : '17:00';

        setModForm({
            shift_id: target?.shift_id ? String(target.shift_id) : '',
            proposed_date: startDate,
            proposed_start_time: startTime,
            proposed_end_time: endTime,
            reason: ''
        });
        setModModalOpen(true);
    };

    // Submit Swap Request
    const handleSubmitSwap = async (e) => {
        e.preventDefault();
        if (!swapForm.shift_id) {
            toast.error(isArabic ? 'يرجى اختيار الوردية المراد تبديلها' : 'Please select your shift to swap');
            return;
        }
        if (!swapForm.target_user_id) {
            toast.error(isArabic ? 'يرجى اختيار الزميل المراد التبديل معه' : 'Please select the colleague to swap with');
            return;
        }
        if (!swapForm.reason || swapForm.reason.trim().length < 3) {
            toast.error(isArabic ? 'يرجى توضيح سبب طلب التبديل' : 'Please enter a valid reason for the swap');
            return;
        }

        try {
            await createShiftRequest({
                request_type: 'Swap',
                shift_id: Number(swapForm.shift_id),
                target_user_id: Number(swapForm.target_user_id),
                target_shift_id: swapForm.target_shift_id ? Number(swapForm.target_shift_id) : undefined,
                reason: swapForm.reason.trim()
            }).unwrap();

            toast.success(isArabic ? 'تم تقديم طلب تبديل الوردية بنجاح' : 'Shift swap request submitted successfully');
            setSwapModalOpen(false);
            refetchRequests();
        } catch (err) {
            toast.error(getErrorMessage(err, isArabic ? 'تعذر تقديم طلب التبديل' : 'Failed to submit swap request'));
        }
    };

    // Submit Modification Request
    const handleSubmitMod = async (e) => {
        e.preventDefault();
        if (!modForm.shift_id) {
            toast.error(isArabic ? 'يرجى اختيار الوردية المراد تعديلها' : 'Please select the shift to modify');
            return;
        }
        if (!modForm.proposed_date || !modForm.proposed_start_time || !modForm.proposed_end_time) {
            toast.error(isArabic ? 'يرجى تحديد التاريخ ومواعيد البداية والنهاية المقترحة' : 'Please specify proposed date and start/end times');
            return;
        }
        if (!modForm.reason || modForm.reason.trim().length < 3) {
            toast.error(isArabic ? 'يرجى توضيح سبب طلب التعديل' : 'Please enter a valid reason for modification');
            return;
        }

        try {
            const proposedStartIso = new Date(`${modForm.proposed_date}T${modForm.proposed_start_time}:00`).toISOString();
            const proposedEndIso = new Date(`${modForm.proposed_date}T${modForm.proposed_end_time}:00`).toISOString();

            await createShiftRequest({
                request_type: 'Modification',
                shift_id: Number(modForm.shift_id),
                proposed_start_time: proposedStartIso,
                proposed_end_time: proposedEndIso,
                reason: modForm.reason.trim()
            }).unwrap();

            toast.success(isArabic ? 'تم تقديم طلب تعديل الوردية بنجاح' : 'Shift modification request submitted successfully');
            setModModalOpen(false);
            refetchRequests();
        } catch (err) {
            toast.error(getErrorMessage(err, isArabic ? 'تعذر تقديم طلب التعديل' : 'Failed to submit modification request'));
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'Approved':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800">
                        <CheckCircle2 size={12} />
                        {isArabic ? 'تمت الموافقة' : 'Approved'}
                    </span>
                );
            case 'Rejected':
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800">
                        <XCircle size={12} />
                        {isArabic ? 'مرفوض' : 'Rejected'}
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800">
                        <Clock size={12} />
                        {isArabic ? 'قيد المراجعة' : 'Pending Review'}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Next Shift Highlight Card */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-teal-50/30 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-teal-950/20 sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-400 dark:ring-teal-800">
                                <Calendar size={20} />
                            </span>
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                    {isArabic ? 'جدول المواعيد والعمل' : 'Workforce & Rosters'}
                                </span>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                    {isArabic ? 'جدول ورديات العمل المخصصة' : 'Assigned Shifts & Schedule'}
                                </h3>
                            </div>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {isArabic
                                ? 'استعراض مواعيد الورديات، وتقديم طلبات رسمية لتبديل أو تعديل الورديات مع الزملاء.'
                                : 'View your scheduled shifts, and submit official requests to swap or modify shifts.'}
                        </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => handleOpenSwap()}
                            disabled={shifts.length === 0}
                            className="inline-flex items-center gap-2 rounded-xl border border-teal-200/80 bg-teal-50/80 px-3.5 py-2.5 text-xs font-bold text-teal-800 shadow-xs transition-all hover:bg-teal-100/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/60"
                        >
                            <ArrowLeftRight size={15} />
                            {isArabic ? 'طلب تبديل وردية' : 'Request Shift Swap'}
                        </button>

                        <button
                            type="button"
                            onClick={() => handleOpenMod()}
                            disabled={shifts.length === 0}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <Edit3 size={15} />
                            {isArabic ? 'طلب تعديل وردية' : 'Request Modification'}
                        </button>

                        <button
                            type="button"
                            onClick={() => { refetchShifts(); refetchRequests(); }}
                            title={isArabic ? 'تحديث' : 'Refresh'}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-xs hover:bg-slate-50 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                        >
                            <RefreshCw size={15} className={isShiftsLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Next Shift Banner */}
                {nextShift && (
                    <div className="mt-5 rounded-2xl border border-teal-200/60 bg-gradient-to-r from-teal-50/60 to-emerald-50/60 p-4 dark:border-teal-800/40 dark:from-teal-950/20 dark:to-emerald-950/20">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
                                    <Clock size={18} />
                                </span>
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
                                        {isArabic ? 'الوردية القادمة' : 'Next Upcoming Shift'}
                                    </span>
                                    <p className="text-sm font-black text-slate-900 dark:text-white">
                                        {formatShiftDate(nextShift.start_time, isArabic)} · {formatShiftTime(nextShift.start_time, isArabic)} — {formatShiftTime(nextShift.end_time, isArabic)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1 text-xs font-bold text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                    {calculateShiftDurationHours(nextShift.start_time, nextShift.end_time)} {isArabic ? 'ساعات' : 'hrs'}
                                </span>
                                {nextShift.modality && (
                                    <span className="rounded-xl bg-teal-100 px-3 py-1 text-xs font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                        {nextShift.modality}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Sub-tabs: Shifts vs Requests */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => setSelectedTab('upcoming')}
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                        selectedTab === 'upcoming'
                            ? 'bg-slate-900 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
                    }`}
                >
                    {isArabic ? `جدول الورديات (${shifts.length})` : `Assigned Shifts (${shifts.length})`}
                </button>
                <button
                    type="button"
                    onClick={() => setSelectedTab('requests')}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                        selectedTab === 'requests'
                            ? 'bg-slate-900 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
                    }`}
                >
                    <span>{isArabic ? 'طلبات التبديل والتعديل' : 'Shift Requests'}</span>
                    {requests.filter(r => r.status === 'Pending').length > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-white">
                            {requests.filter(r => r.status === 'Pending').length}
                        </span>
                    )}
                </button>
            </div>

            {/* TAB 1: Assigned Shifts */}
            {selectedTab === 'upcoming' && (
                <div className="space-y-3">
                    {isShiftsLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw size={24} className="animate-spin text-teal-600" />
                        </div>
                    ) : shifts.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                            <Calendar size={36} className="mx-auto text-slate-400" />
                            <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                                {isArabic ? 'لا توجد ورديات مجدولة حالياً' : 'No shifts currently scheduled'}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {isArabic ? 'يتم تعيين الورديات من قبل مسؤول الموارد البشرية أو رئيس القسم.' : 'Shifts are assigned by your department supervisor or HR.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                            {shifts.map((shift) => {
                                const isPast = new Date(shift.end_time) < new Date();
                                const isNow = new Date() >= new Date(shift.start_time) && new Date() <= new Date(shift.end_time);

                                return (
                                    <div
                                        key={shift.shift_id || shift.id}
                                        className={`group relative overflow-hidden rounded-2xl border p-4 transition-all hover:shadow-md ${
                                            isNow
                                                ? 'border-emerald-500/80 bg-emerald-50/40 ring-2 ring-emerald-500/20 dark:border-emerald-500/60 dark:bg-emerald-950/20'
                                                : isPast
                                                    ? 'border-slate-200/60 bg-slate-50/50 opacity-70 dark:border-slate-800/60 dark:bg-slate-950/30'
                                                    : 'border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900/80'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                    {formatShiftDate(shift.start_time, isArabic)}
                                                </span>
                                                <h4 className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">
                                                    {formatShiftTime(shift.start_time, isArabic)} — {formatShiftTime(shift.end_time, isArabic)}
                                                </h4>
                                            </div>
                                            {isNow ? (
                                                <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white shadow-xs animate-pulse">
                                                    {isArabic ? 'جارية الآن' : 'Live Now'}
                                                </span>
                                            ) : isPast ? (
                                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                    {isArabic ? 'منتهية' : 'Ended'}
                                                </span>
                                            ) : (
                                                <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                                                    {isArabic ? 'قادمة' : 'Upcoming'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                                                    {calculateShiftDurationHours(shift.start_time, shift.end_time)} {isArabic ? 'س' : 'h'}
                                                </span>
                                                {shift.modality && (
                                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                        {shift.modality}
                                                    </span>
                                                )}
                                            </div>

                                            {!isPast && (
                                                <div className="flex items-center gap-1 opacity-90 transition-opacity group-hover:opacity-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenSwap(String(shift.shift_id || shift.id))}
                                                        title={isArabic ? 'تبديل هذه الوردية' : 'Swap this shift'}
                                                        className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
                                                    >
                                                        <ArrowLeftRight size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenMod(shift)}
                                                        title={isArabic ? 'تعديل موعد هذه الوردية' : 'Modify this shift'}
                                                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: Requests History */}
            {selectedTab === 'requests' && (
                <div className="space-y-3">
                    {isRequestsLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw size={24} className="animate-spin text-teal-600" />
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                            <ArrowLeftRight size={36} className="mx-auto text-slate-400" />
                            <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                                {isArabic ? 'لا توجد طلبات تبديل أو تعديل سابقة' : 'No shift requests filed yet'}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {isArabic ? 'يمكنك تقديم طلب جديد عبر الأزرار بالأعلى.' : 'You can submit a new request using the buttons above.'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <div className="overflow-x-auto">
                                <table className="w-full text-start text-xs">
                                    <thead className="border-b border-slate-100 bg-slate-50/80 font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                                        <tr>
                                            <th className="p-3 text-start">{isArabic ? 'نوع الطلب' : 'Type'}</th>
                                            <th className="p-3 text-start">{isArabic ? 'الوردية الأصلية' : 'Original Shift'}</th>
                                            <th className="p-3 text-start">{isArabic ? 'التفاصيل / المقترح' : 'Proposed / Target'}</th>
                                            <th className="p-3 text-start">{isArabic ? 'السبب' : 'Reason'}</th>
                                            <th className="p-3 text-start">{isArabic ? 'الحالة' : 'Status'}</th>
                                            <th className="p-3 text-start">{isArabic ? 'تاريخ التقديم' : 'Filed At'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {requests.map((req) => (
                                            <tr key={req.request_id || req.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                                <td className="p-3 font-bold">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-black ${
                                                        req.request_type === 'Swap'
                                                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                                                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                                    }`}>
                                                        {req.request_type === 'Swap' ? <ArrowLeftRight size={13} /> : <Edit3 size={13} />}
                                                        {req.request_type === 'Swap'
                                                            ? (isArabic ? 'تبديل وردية' : 'Swap')
                                                            : (isArabic ? 'تعديل وردية' : 'Modification')}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <p className="font-bold text-slate-900 dark:text-white">
                                                        {formatShiftDate(req.current_start_time, isArabic)}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">
                                                        {formatShiftTime(req.current_start_time, isArabic)} — {formatShiftTime(req.current_end_time, isArabic)}
                                                    </p>
                                                </td>
                                                <td className="p-3">
                                                    {req.request_type === 'Swap' ? (
                                                        <div>
                                                            <p className="font-bold text-slate-900 dark:text-white">
                                                                {isArabic ? 'مع الزميل: ' : 'With: '}
                                                                <span className="text-teal-600 dark:text-teal-400">
                                                                    {req.target_user_name || req.target_user_id}
                                                                </span>
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <p className="font-bold text-slate-900 dark:text-white">
                                                                {formatShiftDate(req.proposed_start_time, isArabic)}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500">
                                                                {formatShiftTime(req.proposed_start_time, isArabic)} — {formatShiftTime(req.proposed_end_time, isArabic)}
                                                            </p>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="max-w-[200px] truncate p-3 text-slate-600 dark:text-slate-300" title={req.reason}>
                                                    {req.reason || '—'}
                                                </td>
                                                <td className="p-3">
                                                    {getStatusBadge(req.status)}
                                                </td>
                                                <td className="p-3 text-slate-400">
                                                    {req.created_at ? new Date(req.created_at).toLocaleDateString(isArabic ? 'ar-EG' : 'en-US') : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL 1: Shift Swap Request */}
            <Modal
                isOpen={swapModalOpen}
                onClose={() => setSwapModalOpen(false)}
                title={isArabic ? 'تقديم طلب تبديل وردية مع زميل' : 'Submit Shift Swap Request'}
                size="default"
            >
                <form onSubmit={handleSubmitSwap} className="space-y-4 p-1 text-slate-800 dark:text-slate-200">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {isArabic ? 'وردية العمل المراد تبديلها' : 'Your Shift to Swap'}
                        </label>
                        <select
                            value={swapForm.shift_id}
                            onChange={(e) => setSwapForm({ ...swapForm, shift_id: e.target.value })}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        >
                            <option value="">{isArabic ? '-- اختر الوردية --' : '-- Select Shift --'}</option>
                            {shifts.map((s) => (
                                <option key={s.shift_id || s.id} value={s.shift_id || s.id}>
                                    {formatShiftDate(s.start_time, isArabic)} ({formatShiftTime(s.start_time, isArabic)} - {formatShiftTime(s.end_time, isArabic)})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {isArabic ? 'الزميل المراد التبديل معه' : 'Colleague to Swap With'}
                        </label>
                        <select
                            value={swapForm.target_user_id}
                            onChange={(e) => setSwapForm({ ...swapForm, target_user_id: e.target.value })}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        >
                            <option value="">{isArabic ? '-- اختر الزميل --' : '-- Select Colleague --'}</option>
                            {colleagues.map((col) => (
                                <option key={col.user_id} value={col.user_id}>
                                    {col.full_name} ({col.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {isArabic ? 'سبب طلب التبديل' : 'Reason for Swap'}
                        </label>
                        <textarea
                            rows={3}
                            value={swapForm.reason}
                            onChange={(e) => setSwapForm({ ...swapForm, reason: e.target.value })}
                            placeholder={isArabic ? 'اكتب تفاصيل وسبب طلب تبديل الوردية...' : 'Explain the reason for requesting this shift swap...'}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setSwapModalOpen(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                        >
                            {isArabic ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmittingRequest}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-xs hover:bg-teal-700 active:scale-95 disabled:opacity-50"
                        >
                            <Send size={14} />
                            {isSubmittingRequest ? (isArabic ? 'جارِ الإرسال...' : 'Submitting...') : (isArabic ? 'إرسال الطلب' : 'Submit Request')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL 2: Shift Modification Request */}
            <Modal
                isOpen={modModalOpen}
                onClose={() => setModModalOpen(false)}
                title={isArabic ? 'تقديم طلب تعديل موعد وردية' : 'Submit Shift Modification Request'}
                size="default"
            >
                <form onSubmit={handleSubmitMod} className="space-y-4 p-1 text-slate-800 dark:text-slate-200">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {isArabic ? 'الوردية المراد تعديلها' : 'Shift to Modify'}
                        </label>
                        <select
                            value={modForm.shift_id}
                            onChange={(e) => setModForm({ ...modForm, shift_id: e.target.value })}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        >
                            <option value="">{isArabic ? '-- اختر الوردية --' : '-- Select Shift --'}</option>
                            {shifts.map((s) => (
                                <option key={s.shift_id || s.id} value={s.shift_id || s.id}>
                                    {formatShiftDate(s.start_time, isArabic)} ({formatShiftTime(s.start_time, isArabic)} - {formatShiftTime(s.end_time, isArabic)})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                {isArabic ? 'التاريخ المقترح' : 'Proposed Date'}
                            </label>
                            <input
                                type="date"
                                value={modForm.proposed_date}
                                onChange={(e) => setModForm({ ...modForm, proposed_date: e.target.value })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                {isArabic ? 'وقت البداية المقترح' : 'Proposed Start'}
                            </label>
                            <input
                                type="time"
                                value={modForm.proposed_start_time}
                                onChange={(e) => setModForm({ ...modForm, proposed_start_time: e.target.value })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                {isArabic ? 'وقت النهاية المقترح' : 'Proposed End'}
                            </label>
                            <input
                                type="time"
                                value={modForm.proposed_end_time}
                                onChange={(e) => setModForm({ ...modForm, proposed_end_time: e.target.value })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {isArabic ? 'سبب طلب التعديل' : 'Reason for Modification'}
                        </label>
                        <textarea
                            rows={3}
                            value={modForm.reason}
                            onChange={(e) => setModForm({ ...modForm, reason: e.target.value })}
                            placeholder={isArabic ? 'اكتب مبررات تعديل توقيت أو موعد الوردية...' : 'Explain the reason for modifying shift schedule...'}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setModModalOpen(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                        >
                            {isArabic ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmittingRequest}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-xs hover:bg-teal-700 active:scale-95 disabled:opacity-50"
                        >
                            <Send size={14} />
                            {isSubmittingRequest ? (isArabic ? 'جارِ الإرسال...' : 'Submitting...') : (isArabic ? 'إرسال الطلب' : 'Submit Request')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default StaffShiftSchedule;
