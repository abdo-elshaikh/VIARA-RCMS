import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    ShieldCheck, ClipboardCheck, Wallet, Calendar, Clock,
    Users, Plus, Trash2, CheckCircle2, XCircle, AlertCircle,
    Building, ArrowRightLeft, Award, TrendingDown,
    Search, RefreshCw, UserCheck, Timer, ChevronRight
} from 'lucide-react';
import { getErrorMessage } from '../../utils/getErrorMessage';
import {
    useGetStaffSupervisorAssignmentsQuery,
    useGetSupervisorInboxQuery,
    useReviewSupervisorRequestMutation,
    useGetSupervisorRecommendationsQuery,
    useCreateSupervisorRecommendationMutation,
    useGetShiftsQuery,
    useCreateShiftMutation,
    useUpdateShiftMutation,
    useDeleteShiftMutation,
    useGetRoomsQuery,
    useGetAttendanceQuery,
} from '../../store/api';
import Modal from '../ui/Modal';

/* ─── Role Labels Dictionary ────────────────────────────────────────── */
const ROLE_LABELS = {
    Receptionist: { ar: 'استقبال', en: 'Receptionist', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
    Nurse: { ar: 'تمريض', en: 'Nursing', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
    Technician: { ar: 'فني أشعة', en: 'Radiology Tech', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
    Radiologist: { ar: 'طبيب أشعة', en: 'Radiologist', color: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-800' },
    Cashier: { ar: 'خزينة وفوترة', en: 'Cashier', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
    Accountant: { ar: 'محاسب مالي', en: 'Accountant', color: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
    Insurance_Staff: { ar: 'تأمين طبي', en: 'Insurance Staff', color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800' },
    Marketing: { ar: 'تسويق وعلاقات', en: 'Marketing', color: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300 border-pink-200 dark:border-pink-800' },
    HR: { ar: 'موارد بشرية', en: 'HR', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
    Admin: { ar: 'إدارة النظام', en: 'Admin', color: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
};

/* ─── Main Staff Supervision Deck ───────────────────────────────────── */
const StaffSupervisionProfile = () => {
    const { i18n } = useTranslation();
    const ar = i18n.language.startsWith('ar');
    const say = (arabic, english) => (ar ? arabic : english);

    // Active Tab State: 'inbox' | 'shifts' | 'recommendations' | 'team'
    const [activeTab, setActiveTab] = useState('inbox');
    const [inboxFilter, setInboxFilter] = useState('ALL'); // 'ALL' | 'leave' | 'attendance' | 'shifts'

    // Shift filters
    const [shiftEmployeeFilter, setShiftEmployeeFilter] = useState('');
    const [shiftSearch, setShiftSearch] = useState('');

    // Queries
    const {
        data: assignments = [],
        isLoading: loadingAssignments,
        isError: assignmentError,
        refetch: refetchAssignments,
    } = useGetStaffSupervisorAssignmentsQuery();

    const {
        data: inbox = [],
        isLoading: loadingInbox,
        isError: inboxError,
        refetch: refetchInbox,
    } = useGetSupervisorInboxQuery();

    const {
        data: recommendations = [],
        isLoading: loadingRecommendations,
        refetch: refetchRecommendations,
    } = useGetSupervisorRecommendationsQuery();

    const {
        data: shifts = [],
        isLoading: loadingShifts,
        refetch: refetchShifts,
    } = useGetShiftsQuery({ team: 'true' });

    const {
        data: attendanceData = [],
        isLoading: loadingAttendance,
    } = useGetAttendanceQuery({ team: 'true' });

    const { data: roomsData } = useGetRoomsQuery();
    const rooms = Array.isArray(roomsData) ? roomsData : (roomsData?.data || []);

    // Mutations
    const [reviewRequest, { isLoading: reviewing }] = useReviewSupervisorRequestMutation();
    const [createRecommendation, { isLoading: recommending }] = useCreateSupervisorRecommendationMutation();
    const [createShift, { isLoading: creatingShift }] = useCreateShiftMutation();
    const [updateShift, { isLoading: updatingShift }] = useUpdateShiftMutation();
    const [deleteShift, { isLoading: deletingShift }] = useDeleteShiftMutation();

    // Modals state
    const [decisionModal, setDecisionModal] = useState(null); // { item, status: 'Approved' | 'Rejected' }
    const [decisionNotes, setDecisionNotes] = useState('');

    const [shiftModalOpen, setShiftModalOpen] = useState(false);
    const [editingShiftItem, setEditingShiftItem] = useState(null);
    const [shiftForm, setShiftForm] = useState({
        userId: '',
        startTime: '',
        endTime: '',
        roomId: '',
        notes: '',
    });

    const [deleteShiftTarget, setDeleteShiftTarget] = useState(null);

    const [recForm, setRecForm] = useState({
        employeeId: '',
        type: 'Incentive',
        amount: '',
        reason: '',
    });

    // Active Supervision Scope
    const activeAssignments = useMemo(() => {
        const now = new Date();
        return (Array.isArray(assignments) ? assignments : []).filter((item) => {
            const started = new Date(item.starts_at) <= now;
            const notEnded = !item.ends_at || new Date(item.ends_at) > now;
            return started && notEnded;
        });
    }, [assignments]);

    // Capability staff groups
    const shiftStaff = useMemo(() => activeAssignments.filter((a) => a.can_approve_shifts), [activeAssignments]);
    const adjustmentStaff = useMemo(() => activeAssignments.filter((a) => a.can_recommend_adjustments), [activeAssignments]);

    // Request Types Localization
    const requestTypes = {
        Sick: say('إجازة مرضية', 'Sick leave'),
        Vacation: say('إجازة سنوية/اعتيادية', 'Annual Vacation'),
        Unpaid: say('إجازة دون راتب', 'Unpaid leave'),
        Personal: say('إجازة عارضة/شخصية', 'Casual/Personal leave'),
        EarlyDeparture: say('إذن انصراف مبكر', 'Early departure permission'),
        LateArrival: say('إذن تأخر عن الحضور', 'Late arrival permission'),
        EmergencyAccess: say('إذن طارئ ومأمورية', 'Emergency/Mission permission'),
        Swap: say('طلب تبديل وردية مع زميل', 'Shift swap request'),
        Modification: say('تعديل موعد الوردية', 'Shift change request'),
        Drop: say('التنازل عن الوردية', 'Shift drop request'),
    };

    // Filtered Inbox items
    const filteredInbox = useMemo(() => {
        const list = Array.isArray(inbox) ? inbox : [];
        if (inboxFilter === 'ALL') return list;
        return list.filter((item) => item.kind === inboxFilter);
    }, [inbox, inboxFilter]);

    // Live Clocked-In Supervised Team
    const liveTeamOnDuty = useMemo(() => {
        const attendanceList = Array.isArray(attendanceData) ? attendanceData : (attendanceData?.data || []);
        const supervisedIds = new Set(activeAssignments.map((a) => a.employee_id));
        return attendanceList.filter((att) => {
            const isSupervised = supervisedIds.has(att.user_id);
            const isActive = att.clock_in && !att.clock_out;
            return isSupervised && isActive;
        });
    }, [attendanceData, activeAssignments]);

    // Filtered Shifts List
    const filteredShifts = useMemo(() => {
        const list = Array.isArray(shifts) ? shifts : [];
        return list.filter((s) => {
            if (shiftEmployeeFilter && s.user_id !== shiftEmployeeFilter) return false;
            if (shiftSearch) {
                const term = shiftSearch.toLowerCase();
                const emp = (s.employee_name || '').toLowerCase();
                const room = (s.room_name || '').toLowerCase();
                const notes = (s.notes || '').toLowerCase();
                if (!emp.includes(term) && !room.includes(term) && !notes.includes(term)) return false;
            }
            return true;
        }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }, [shifts, shiftEmployeeFilter, shiftSearch]);

    // Handle Review Decision Submission
    const handleSubmitDecision = async () => {
        if (!decisionModal) return;
        if (decisionModal.status === 'Rejected' && decisionNotes.trim().length < 3) {
            toast.error(say('يرجى كتابة سبب الرفض بوضوح (3 أحرف على الأقل).', 'Please enter a rejection reason (at least 3 characters).'));
            return;
        }

        try {
            await reviewRequest({
                kind: decisionModal.item.kind,
                id: decisionModal.item.id,
                status: decisionModal.status,
                notes: decisionNotes.trim() || undefined,
            }).unwrap();

            toast.success(
                decisionModal.status === 'Approved'
                    ? say('تمت الموافقة على الطلب بنجاح.', 'Request approved successfully.')
                    : say('تم تسجيل رفض الطلب مع السبب.', 'Request rejected with reason.')
            );
            setDecisionModal(null);
            setDecisionNotes('');
            refetchInbox();
        } catch (error) {
            toast.error(getErrorMessage(error, say('تعذر تسجيل القرار الإشرافي.', 'Could not record supervisory decision.')));
        }
    };

    // Handle Financial Recommendation Submission
    const handleSubmitRecommendation = async (e) => {
        e.preventDefault();
        if (!recForm.employeeId) {
            toast.error(say('يرجى اختيار الموظف أولاً.', 'Please select an employee.'));
            return;
        }
        const amt = Number(recForm.amount);
        if (Number.isNaN(amt) || amt <= 0) {
            toast.error(say('يرجى إدخال مبلغ صحيح.', 'Please enter a valid amount.'));
            return;
        }

        try {
            await createRecommendation({
                employeeId: recForm.employeeId,
                type: recForm.type,
                amount: amt,
                reason: recForm.reason.trim(),
            }).unwrap();

            toast.success(say('تم إرسال التوصية المالية للإدارة العليا للمراجعة.', 'Financial recommendation submitted to management.'));
            setRecForm({ employeeId: '', type: 'Incentive', amount: '', reason: '' });
            refetchRecommendations();
        } catch (error) {
            toast.error(getErrorMessage(error, say('تعذر إرسال التوصية المالية.', 'Could not submit financial recommendation.')));
        }
    };

    // Handle Shift Form Submission (Create or Edit)
    const handleSaveShift = async (e) => {
        e.preventDefault();
        if (!shiftForm.userId) {
            toast.error(say('يرجى اختيار الموظف.', 'Please select an employee.'));
            return;
        }
        if (!shiftForm.startTime || !shiftForm.endTime) {
            toast.error(say('يرجى تحديد بداية ونهاية الوردية.', 'Please specify shift start and end times.'));
            return;
        }
        const start = new Date(shiftForm.startTime);
        const end = new Date(shiftForm.endTime);
        if (end <= start) {
            toast.error(say('موعد نهاية الوردية يجب أن يكون بعد موعد البداية.', 'Shift end time must be after start time.'));
            return;
        }

        try {
            const payload = {
                userId: shiftForm.userId,
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                roomId: shiftForm.roomId ? shiftForm.roomId : null,
                notes: shiftForm.notes.trim() || undefined,
            };

            if (editingShiftItem) {
                await updateShift({ id: editingShiftItem.shift_id, ...payload }).unwrap();
                toast.success(say('تم تحديث موعد الوردية بنجاح.', 'Shift schedule updated successfully.'));
            } else {
                await createShift(payload).unwrap();
                toast.success(say('تم جدولة الوردية وإسنادها للموظف بنجاح.', 'Shift scheduled successfully.'));
            }

            setShiftModalOpen(false);
            setEditingShiftItem(null);
            setShiftForm({ userId: '', startTime: '', endTime: '', roomId: '', notes: '' });
            refetchShifts();
        } catch (error) {
            toast.error(getErrorMessage(error, say('تعذر حفظ بيانات الوردية.', 'Could not save shift.')));
        }
    };

    // Open Edit Shift Modal
    const handleOpenEditShift = (shift) => {
        const toLocalDatetime = (isoStr) => {
            if (!isoStr) return '';
            const d = new Date(isoStr);
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        setEditingShiftItem(shift);
        setShiftForm({
            userId: shift.user_id,
            startTime: toLocalDatetime(shift.start_time),
            endTime: toLocalDatetime(shift.end_time),
            roomId: shift.room_id || '',
            notes: shift.notes || '',
        });
        setShiftModalOpen(true);
    };

    // Handle Delete Shift
    const handleConfirmDeleteShift = async () => {
        if (!deleteShiftTarget) return;
        try {
            await deleteShift(deleteShiftTarget.shift_id).unwrap();
            toast.success(say('تم إلغاء وحذف الوردية من الجدول.', 'Shift deleted from roster.'));
            setDeleteShiftTarget(null);
            refetchShifts();
        } catch (error) {
            toast.error(getErrorMessage(error, say('تعذر حذف الوردية.', 'Could not delete shift.')));
        }
    };

    const inputClasses = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-teal-400';

    return (
        <div className="space-y-6">
            {/* ── 1. SUPERVISOR COMMAND HEADER & KPI STRIP ───────────────── */}
            <div className="relative overflow-hidden rounded-3xl border border-teal-200/80 bg-gradient-to-br from-teal-50/60 via-emerald-50/40 to-white p-6 shadow-sm backdrop-blur dark:border-teal-900/60 dark:from-slate-900 dark:via-teal-950/20 dark:to-slate-900 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500">
                            <ShieldCheck size={30} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                                    {say('مركز الإشراف الإداري والتشغيلي', 'Executive Supervisory Deck')}
                                </h2>
                                <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-100/80 px-2.5 py-0.5 text-xs font-bold text-teal-800 dark:border-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
                                    {say('نشط', 'Active')}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
                                {say(
                                    'إدارة طلبات الفريق (إجازات، غياب، أذونات انصراف، تبديل ورديات)، ضبط الجداول والمناوبات، ورفع التوصيات المالية للإدارة.',
                                    'Review team requests (leave, early departure, shift swaps), manage shift rosters, and submit financial recommendations.'
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Quick Refresh */}
                    <button
                        type="button"
                        onClick={() => {
                            refetchInbox();
                            refetchAssignments();
                            refetchShifts();
                            refetchRecommendations();
                            toast.success(say('تم تحديث البيانات الإشرافية.', 'Supervisory data refreshed.'));
                        }}
                        className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800 sm:self-auto"
                    >
                        <RefreshCw size={14} className={loadingInbox || loadingShifts ? 'animate-spin' : ''} />
                        {say('تحديث البيانات', 'Refresh Data')}
                    </button>
                </div>

                {/* ── KPI Metrics Grid ────────────────────────────────────────── */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                    {/* KPI 1: Direct Supervised Team */}
                    <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>{say('أعضاء الفريق', 'Team Members')}</span>
                            <Users size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                            {activeAssignments.length}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                            {say('تحت تكليفك المباشر', 'Under direct assignment')}
                        </p>
                    </div>

                    {/* KPI 2: Pending Approval Inbox */}
                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm backdrop-blur dark:border-amber-900/40 dark:bg-amber-950/20">
                        <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
                            <span>{say('طلبات معلقة', 'Pending Requests')}</span>
                            <ClipboardCheck size={16} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <p className="mt-2 text-2xl font-black text-amber-900 dark:text-amber-100">
                            {Array.isArray(inbox) ? inbox.length : 0}
                        </p>
                        <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/80">
                            {say('بانتظار قرارك الإشرافي', 'Awaiting your review')}
                        </p>
                    </div>

                    {/* KPI 3: Live On-Duty Team */}
                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-sm backdrop-blur dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                            <span>{say('متواجدون بالوردية الآن', 'On Duty Now')}</span>
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                        </div>
                        <p className="mt-2 text-2xl font-black text-emerald-900 dark:text-emerald-100">
                            {liveTeamOnDuty.length}
                        </p>
                        <p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                            {say('حضور مسجل بالمركز', 'Checked in actively')}
                        </p>
                    </div>

                    {/* KPI 4: Financial Recommendations */}
                    <div className="rounded-2xl border border-purple-200/80 bg-purple-50/50 p-4 shadow-sm backdrop-blur dark:border-purple-900/40 dark:bg-purple-950/20">
                        <div className="flex items-center justify-between text-xs text-purple-800 dark:text-purple-300">
                            <span>{say('توصيات للإدارة', 'Recommendations')}</span>
                            <Wallet size={16} className="text-purple-600 dark:text-purple-400" />
                        </div>
                        <p className="mt-2 text-2xl font-black text-purple-900 dark:text-purple-100">
                            {Array.isArray(recommendations) ? recommendations.length : 0}
                        </p>
                        <p className="mt-1 text-[11px] text-purple-700/80 dark:text-purple-300/80">
                            {say('حوافز وخصومات مرفوعة', 'Incentives & deductions')}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── 2. EXECUTIVE TABS NAVIGATION ───────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => setActiveTab('inbox')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                        activeTab === 'inbox'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500'
                            : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <ClipboardCheck size={16} />
                    <span>{say('صندوق الطلبات الإشرافية', 'Request Inbox')}</span>
                    {Array.isArray(inbox) && inbox.length > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-black ${
                            activeTab === 'inbox' ? 'bg-white text-teal-800' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                            {inbox.length}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('shifts')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                        activeTab === 'shifts'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500'
                            : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Calendar size={16} />
                    <span>{say('إدارة وجدول الورديات', 'Shift Roster & Management')}</span>
                    {filteredShifts.length > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            activeTab === 'shifts' ? 'bg-teal-700 text-teal-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                            {filteredShifts.length}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('recommendations')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                        activeTab === 'recommendations'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500'
                            : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Wallet size={16} />
                    <span>{say('التوصيات المالية للإدارة', 'Financial Recommendations')}</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('team')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                        activeTab === 'team'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500'
                            : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Users size={16} />
                    <span>{say('دليل الفريق والصلاحيات', 'Team Directory & Permissions')}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {activeAssignments.length}
                    </span>
                </button>
            </div>

            {/* ── 3. TAB CONTENT 1: REQUEST INBOX ────────────────────────── */}
            {activeTab === 'inbox' && (
                <div className="space-y-4">
                    {/* Sub-Filters Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                {say('تصفية حسب النوع:', 'Filter by Type:')}
                            </span>
                            {[
                                { key: 'ALL', label: say('الكل', 'All') },
                                { key: 'leave', label: say('الإجازات والغياب', 'Leaves & Absence') },
                                { key: 'attendance', label: say('أذونات الحضور والانصراف', 'Attendance Permissions') },
                                { key: 'shifts', label: say('تبديل وتعديل الورديات', 'Shift Swaps') },
                            ].map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setInboxFilter(f.key)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                        inboxFilter === f.key
                                            ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {say(`إجمالي الطلبات المعروضة: ${filteredInbox.length}`, `Showing ${filteredInbox.length} requests`)}
                        </p>
                    </div>

                    {/* Loading & Error States */}
                    {loadingInbox && (
                        <div className="flex items-center justify-center p-12 text-slate-500">
                            <RefreshCw className="mr-2 h-5 w-5 animate-spin text-teal-600" />
                            <span className="text-sm font-semibold">{say('جارٍ تحميل طلبات الفريق...', 'Loading team requests...')}</span>
                        </div>
                    )}

                    {inboxError && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                            <div className="flex items-center gap-3">
                                <AlertCircle size={20} className="shrink-0" />
                                <div className="text-sm font-bold">
                                    {say('تعذر تحميل الطلبات المعلقة.', 'Failed to load pending requests.')}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={refetchInbox}
                                className="mt-3 rounded-lg bg-rose-700 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-800"
                            >
                                {say('إعادة المحاولة', 'Retry')}
                            </button>
                        </div>
                    )}

                    {/* Empty State */}
                    {!loadingInbox && !inboxError && filteredInbox.length === 0 && (
                        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                                <CheckCircle2 size={32} />
                            </div>
                            <h4 className="mt-4 text-base font-black text-slate-900 dark:text-white">
                                {say('لا توجد طلبات معلقة تتطلب اتخاذ قرار', 'No pending requests requiring your decision')}
                            </h4>
                            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                                {say('تمت مراجعة جميع طلبات الإجازات والأذونات وتبديل الورديات الخاصة بفريقك بنجاح.', 'All leaves, attendance permissions, and shift swap requests for your team have been processed.')}
                            </p>
                        </div>
                    )}

                    {/* Requests Cards List */}
                    <div className="grid gap-4">
                        {filteredInbox.map((item) => {
                            const roleTheme = ROLE_LABELS[item.employee_role] || { ar: item.employee_role || 'موظف', en: item.employee_role || 'Staff', color: 'bg-slate-100 text-slate-700 border-slate-200' };

                            return (
                                <article
                                    key={`${item.kind}:${item.id}`}
                                    className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-700"
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                        {/* Employee & Request Meta */}
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="text-base font-black text-slate-900 dark:text-white">
                                                    {item.employee_name}
                                                </h4>
                                                <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${roleTheme.color}`}>
                                                    {say(roleTheme.ar, roleTheme.en)}
                                                </span>
                                                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                                                    {requestTypes[item.type] || item.type}
                                                </span>
                                            </div>

                                            {/* Details: Dates / Times / Specifics */}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                                                {item.start_date && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Calendar size={13} className="text-slate-400" />
                                                        <strong>{say('من:', 'From:')}</strong> {new Date(item.start_date).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}
                                                        {item.end_date && item.end_date !== item.start_date && (
                                                            <> <strong>{say('إلى:', 'To:')}</strong> {new Date(item.end_date).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}</>
                                                        )}
                                                    </span>
                                                )}

                                                {item.minutes_granted && (
                                                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                                                        <Timer size={13} />
                                                        {say(`المدة: ${item.minutes_granted} دقيقة`, `Duration: ${item.minutes_granted} mins`)}
                                                    </span>
                                                )}

                                                {item.allowed_time && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock size={13} className="text-slate-400" />
                                                        <strong>{say('الوقت:', 'Time:')}</strong> {item.allowed_time}
                                                    </span>
                                                )}

                                                {item.target_user_name && (
                                                    <span className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300">
                                                        <ArrowRightLeft size={13} />
                                                        <strong>{say('الزميل البديل:', 'Swap partner:')}</strong> {item.target_user_name}
                                                    </span>
                                                )}

                                                <span className="text-slate-400">
                                                    • {new Date(item.created_at).toLocaleString(ar ? 'ar-EG' : 'en-GB')}
                                                </span>
                                            </div>

                                            {/* Reason provided */}
                                            {item.reason && (
                                                <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                                                    <span className="font-bold text-slate-500 dark:text-slate-400">
                                                        {say('السبب الموضح:', 'Reason:')}{' '}
                                                    </span>
                                                    {item.reason}
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2 self-end lg:self-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDecisionModal({ item, status: 'Approved' });
                                                    setDecisionNotes('');
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                                            >
                                                <CheckCircle2 size={15} />
                                                {say('موافقة إشرافية', 'Approve')}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDecisionModal({ item, status: 'Rejected' });
                                                    setDecisionNotes('');
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50 active:scale-95 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                                            >
                                                <XCircle size={15} />
                                                {say('رفض الطلب', 'Reject')}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── 4. TAB CONTENT 2: SHIFT MANAGEMENT & ROSTER ────────────── */}
            {activeTab === 'shifts' && (
                <div className="space-y-5">
                    {/* Controls & Schedule Action Bar */}
                    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-1 flex-wrap items-center gap-3">
                            {/* Search */}
                            <div className="relative min-w-[200px] flex-1">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3" />
                                <input
                                    type="text"
                                    value={shiftSearch}
                                    onChange={(e) => setShiftSearch(e.target.value)}
                                    placeholder={say('بحث باسم الموظف أو القاعة...', 'Search by employee or room...')}
                                    className={`${inputClasses} pl-9 rtl:pl-3 rtl:pr-9`}
                                />
                            </div>

                            {/* Employee Dropdown Filter */}
                            <select
                                value={shiftEmployeeFilter}
                                onChange={(e) => setShiftEmployeeFilter(e.target.value)}
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                <option value="">{say('جميع أعضاء الفريق', 'All Team Members')}</option>
                                {activeAssignments.map((a) => (
                                    <option key={a.employee_id} value={a.employee_id}>
                                        {a.employee_name} ({ROLE_LABELS[a.department_role]?.ar || a.department_role})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Schedule New Shift Button */}
                        <button
                            type="button"
                            onClick={() => {
                                setEditingShiftItem(null);
                                setShiftForm({
                                    userId: shiftStaff[0]?.employee_id || activeAssignments[0]?.employee_id || '',
                                    startTime: '',
                                    endTime: '',
                                    roomId: '',
                                    notes: '',
                                });
                                setShiftModalOpen(true);
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 dark:bg-teal-500"
                        >
                            <Plus size={16} />
                            {say('إسناد وجدولة وردية جديدة', 'Schedule New Shift')}
                        </button>
                    </div>

                    {/* Live Team Presence Indicator Banner */}
                    {liveTeamOnDuty.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                            <div className="flex items-center gap-3">
                                <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                                <div>
                                    <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-200">
                                        {say('أعضاء الفريق المتواجدون بالوردية الآن:', 'Team members currently clocked in:')}
                                    </h4>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                        {liveTeamOnDuty.map((att) => (
                                            <span
                                                key={att.attendance_id || att.user_id}
                                                className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs font-bold text-emerald-800 shadow-sm dark:bg-slate-900 dark:text-emerald-300"
                                            >
                                                <UserCheck size={12} className="text-emerald-600" />
                                                {att.full_name || att.user_name}
                                                <span className="text-[10px] text-slate-500">
                                                    ({new Date(att.clock_in).toLocaleTimeString(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })})
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Shifts List Grid */}
                    {loadingShifts && (
                        <div className="flex items-center justify-center p-12 text-slate-500">
                            <RefreshCw className="mr-2 h-5 w-5 animate-spin text-teal-600" />
                            <span className="text-sm font-semibold">{say('جارٍ تحميل جدول الورديات...', 'Loading shifts roster...')}</span>
                        </div>
                    )}

                    {!loadingShifts && filteredShifts.length === 0 && (
                        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                            <Calendar size={32} className="text-slate-400" />
                            <h4 className="mt-4 text-base font-black text-slate-900 dark:text-white">
                                {say('لا توجد ورديات مجدولة مطابقة للمحددات', 'No scheduled shifts match your filters')}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {say('يمكنك جدولة وردية جديدة لأي من أعضاء فريقك في أي وقت.', 'You can schedule a new shift for any of your team members at any time.')}
                            </p>
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredShifts.map((shift) => {
                            const now = new Date();
                            const start = new Date(shift.start_time);
                            const end = new Date(shift.end_time);
                            const isCurrent = now >= start && now <= end;
                            const isPast = now > end;
                            const isFuture = now < start;

                            const roleMeta = ROLE_LABELS[shift.role] || { ar: shift.role, en: shift.role, color: 'bg-slate-100 text-slate-700' };

                            return (
                                <div
                                    key={shift.shift_id}
                                    className={`relative flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition ${
                                        isCurrent
                                            ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20'
                                            : isPast
                                            ? 'border-slate-200 bg-slate-50/50 opacity-75 dark:border-slate-800 dark:bg-slate-900/40'
                                            : 'border-slate-200 bg-white hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h5 className="font-black text-slate-900 dark:text-white">
                                                    {shift.employee_name}
                                                </h5>
                                                <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${roleMeta.color}`}>
                                                    {say(roleMeta.ar, roleMeta.en)}
                                                </span>
                                            </div>

                                            {/* Status Badge */}
                                            {isCurrent && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                    {say('جارية الآن', 'Active')}
                                                </span>
                                            )}
                                            {isFuture && (
                                                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                                    {say('مجدولة', 'Scheduled')}
                                                </span>
                                            )}
                                            {isPast && (
                                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                                    {say('منتهية', 'Completed')}
                                                </span>
                                            )}
                                        </div>

                                        {/* Shift Schedule Timing */}
                                        <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar size={13} className="text-teal-600 dark:text-teal-400" />
                                                <span>{start.toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={13} className="text-teal-600 dark:text-teal-400" />
                                                <span>
                                                    {start.toLocaleTimeString(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            {shift.room_name && (
                                                <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                                                    <Building size={13} />
                                                    <span className="font-semibold">{shift.room_name} {shift.room_number ? `(${shift.room_number})` : ''}</span>
                                                </div>
                                            )}
                                            {shift.notes && (
                                                <p className="mt-1 line-clamp-2 rounded bg-slate-100/80 p-1.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                    {shift.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons for Future Shifts */}
                                    {isFuture && (
                                        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenEditShift(shift)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                            >
                                                {say('تعديل', 'Edit')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteShiftTarget(shift)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
                                            >
                                                <Trash2 size={13} />
                                                {say('إلغاء', 'Cancel')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── 5. TAB CONTENT 3: FINANCIAL RECOMMENDATIONS ────────────── */}
            {activeTab === 'recommendations' && (
                <div className="space-y-6">
                    {/* Submission Card */}
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                <Award size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {say('رفع توصية مالية للإدارة (حافز / خصم / جزاء)', 'Submit Financial Recommendation (Incentive / Deduction / Penalty)')}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {say('تُحال التوصية للإدارة المالية والموارد البشرية للمراجعة والاعتماد الرسمي.', 'Recommendations are forwarded to Management & HR for official audit and payroll inclusion.')}
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmitRecommendation} className="mt-5 grid gap-4 sm:grid-cols-2">
                            {/* Employee */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {say('الموظف المعني', 'Target Employee')} <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    required
                                    value={recForm.employeeId}
                                    onChange={(e) => setRecForm((f) => ({ ...f, employeeId: e.target.value }))}
                                    className={`mt-1.5 ${inputClasses}`}
                                >
                                    <option value="">{say('اختر موظفاً من فريقك...', 'Select team member...')}</option>
                                    {(adjustmentStaff.length > 0 ? adjustmentStaff : activeAssignments).map((emp) => (
                                        <option key={emp.employee_id} value={emp.employee_id}>
                                            {emp.employee_name} ({ROLE_LABELS[emp.department_role]?.ar || emp.department_role})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Type */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {say('نوع التوصية', 'Recommendation Type')} <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    value={recForm.type}
                                    onChange={(e) => setRecForm((f) => ({ ...f, type: e.target.value }))}
                                    className={`mt-1.5 ${inputClasses}`}
                                >
                                    <option value="Incentive">{say('حافز تميز وأداء استثنائي', 'Incentive / Bonus')}</option>
                                    <option value="Deduction">{say('خصم إداري', 'Administrative Deduction')}</option>
                                    <option value="Penalty">{say('جزاء تأديبي ومخالفة', 'Disciplinary Penalty')}</option>
                                </select>
                            </div>

                            {/* Amount */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {say('المبلغ المقترح (جنيه مصري - EGP)', 'Proposed Amount (EGP)')} <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    max="500000"
                                    step="0.01"
                                    placeholder={say('مثال: 500', 'e.g. 500')}
                                    value={recForm.amount}
                                    onChange={(e) => setRecForm((f) => ({ ...f, amount: e.target.value }))}
                                    className={`mt-1.5 ${inputClasses}`}
                                />
                            </div>

                            {/* Reason */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {say('مبررات وأسباب التوصية بالتفصيل', 'Justification & Detailed Reason')} <span className="text-rose-500">*</span>
                                </label>
                                <textarea
                                    required
                                    minLength={10}
                                    maxLength={2000}
                                    rows={3}
                                    placeholder={say('يرجى توضيح سبب الحافز أو المخالفة بالتفصيل لتمكين الإدارة من اتخاذ القرار...', 'Detail the reason for this bonus or disciplinary action...')}
                                    value={recForm.reason}
                                    onChange={(e) => setRecForm((f) => ({ ...f, reason: e.target.value }))}
                                    className={`mt-1.5 ${inputClasses}`}
                                />
                            </div>

                            {/* Submit Button */}
                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={recommending}
                                    className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-50 dark:bg-purple-500"
                                >
                                    <Wallet size={16} />
                                    {recommending ? say('جارٍ الإرسال للإدارة...', 'Submitting...') : say('إرسال التوصية للإدارة', 'Submit Recommendation')}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Previous Recommendations Ledger */}
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <h4 className="text-base font-black text-slate-900 dark:text-white">
                            {say('سجل التوصيات المرفوعة للإدارة ومتابعة قراراتها', 'Recommendations Ledger & Status')}
                        </h4>

                        {loadingRecommendations && (
                            <p className="mt-4 text-xs text-slate-500">{say('جارٍ تحميل السجل...', 'Loading ledger...')}</p>
                        )}

                        {!loadingRecommendations && recommendations.length === 0 && (
                            <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-800">
                                {say('لم تقم برفع أي توصيات مالية بعد.', 'No financial recommendations recorded yet.')}
                            </p>
                        )}

                        {recommendations.length > 0 && (
                            <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                                {recommendations.map((rec) => {
                                    const isApproved = rec.status === 'Approved';
                                    const isRejected = rec.status === 'Rejected';
                                    const isPending = rec.status === 'Pending';

                                    return (
                                        <div key={rec.recommendation_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900 dark:text-white">
                                                        {rec.employee_name}
                                                    </span>
                                                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                                                        rec.recommendation_type === 'Incentive'
                                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                                    }`}>
                                                        {rec.recommendation_type === 'Incentive' ? say('حافز', 'Incentive') : say('خصم/جزاء', 'Deduction/Penalty')}
                                                    </span>
                                                    <span className="font-black text-purple-700 dark:text-purple-300 text-xs">
                                                        {rec.amount} {say('ج.م', 'EGP')}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-600 dark:text-slate-300">
                                                    {rec.reason}
                                                </p>
                                                {rec.review_notes && (
                                                    <p className="text-xs text-amber-700 dark:text-amber-300">
                                                        <strong>{say('ملاحظات الإدارة:', 'Admin Notes:')}</strong> {rec.review_notes}
                                                    </p>
                                                )}
                                                <p className="text-[11px] text-slate-400">
                                                    {new Date(rec.created_at).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}
                                                </p>
                                            </div>

                                            {/* Status Badge */}
                                            <div>
                                                {isApproved && (
                                                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                        {say('معتمدة من الإدارة', 'Approved')}
                                                    </span>
                                                )}
                                                {isRejected && (
                                                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                                        {say('مرفوضة من الإدارة', 'Rejected')}
                                                    </span>
                                                )}
                                                {isPending && (
                                                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                                        {say('قيد المراجعة بالإدارة', 'Pending Management Review')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── 6. TAB CONTENT 4: TEAM DIRECTORY & CAPABILITIES ────────── */}
            {activeTab === 'team' && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {say('أعضاء الفريق وصلاحيات الإشراف الممنوحة لك', 'Direct Team Roster & Granted Supervisory Powers')}
                                </h3>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {say('توضح هذه البطاقات كل موظف يقع تحت إشرافك المباشر والصلاحيات المفوضة لك إزاءه.', 'Shows team members currently under your supervision and the specific authorities delegated to you.')}
                                </p>
                            </div>
                            <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-black text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                {activeAssignments.length} {say('موظف نشط', 'Active Staff')}
                            </span>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {activeAssignments.map((emp) => {
                            const roleInfo = ROLE_LABELS[emp.department_role] || { ar: emp.department_role, en: emp.department_role, color: 'bg-slate-100 text-slate-700' };

                            return (
                                <div
                                    key={emp.assignment_id}
                                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 font-bold text-white shadow-sm">
                                            {emp.employee_name?.split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || 'U'}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="truncate font-black text-slate-900 dark:text-white">
                                                {emp.employee_name}
                                            </h4>
                                            <span className={`inline-block mt-0.5 rounded px-2 py-0.5 text-xs font-semibold ${roleInfo.color}`}>
                                                {say(roleInfo.ar, roleInfo.en)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Capabilities Chips */}
                                    <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                                        <p className="text-[11px] font-bold text-slate-400">
                                            {say('صلاحياتك الإشرافية المعتمدة:', 'Approved Supervisory Powers:')}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                [emp.can_approve_leave, say('اعتماد الإجازات', 'Leave Approval')],
                                                [emp.can_approve_attendance, say('أذونات الانصراف والحضور', 'Attendance & Permits')],
                                                [emp.can_approve_shifts, say('إدارة وجدولة الورديات', 'Shift Management')],
                                                [emp.can_recommend_adjustments, say('رفع التوصيات المالية', 'Financial Recommendations')],
                                            ].map(([granted, label]) => (
                                                <span
                                                    key={label}
                                                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                                        granted
                                                            ? 'bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
                                                            : 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-600'
                                                    }`}
                                                >
                                                    {label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Dates */}
                                    <p className="mt-4 text-[10px] text-slate-400">
                                        {say('تاريخ بدء التكليف:', 'Assignment start:')} {new Date(emp.starts_at).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── 7. DECISION CONFIRMATION MODAL ─────────────────────────── */}
            <Modal
                isOpen={Boolean(decisionModal)}
                onClose={() => !reviewing && setDecisionModal(null)}
                title={
                    decisionModal?.status === 'Approved'
                        ? say('تأكيد الموافقة على الطلب', 'Confirm Request Approval')
                        : say('تأكيد رفض الطلب مع السبب', 'Confirm Request Rejection')
                }
            >
                <div className="space-y-4 p-5">
                    {/* Item Summary */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="flex items-center justify-between">
                            <span className="font-black text-slate-900 dark:text-white">
                                {decisionModal?.item?.employee_name}
                            </span>
                            <span className="rounded-md bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                {requestTypes[decisionModal?.item?.type] || decisionModal?.item?.type}
                            </span>
                        </div>
                        {decisionModal?.item?.reason && (
                            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                                <strong>{say('سبب الطلب:', 'Reason:')}</strong> {decisionModal.item.reason}
                            </p>
                        )}
                    </div>

                    {/* Decision Notes */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {decisionModal?.status === 'Rejected' ? (
                                <span className="text-rose-600 dark:text-rose-400">
                                    {say('سبب الرفض (إلزامي للشفافية والإشراف)', 'Rejection Reason (Required)')} *
                                </span>
                            ) : (
                                <span>{say('ملاحظات وتوجيهات إشرافية (اختياري)', 'Supervisory Notes (Optional)')}</span>
                            )}
                        </label>
                        <textarea
                            rows={3}
                            maxLength={500}
                            placeholder={
                                decisionModal?.status === 'Rejected'
                                    ? say('يرجى توضيح سبب الرفض للموظف والإدارة...', 'State the clear reason for rejection...')
                                    : say('أضف أي ملاحظات أو توجيهات للموظف إن وجدت...', 'Optional notes for the employee...')
                            }
                            value={decisionNotes}
                            onChange={(e) => setDecisionNotes(e.target.value)}
                            className={`mt-1.5 ${inputClasses}`}
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            disabled={reviewing}
                            onClick={() => setDecisionModal(null)}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {say('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={reviewing}
                            onClick={handleSubmitDecision}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-black text-white shadow-sm transition disabled:opacity-50 ${
                                decisionModal?.status === 'Approved'
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-rose-600 hover:bg-rose-700'
                            }`}
                        >
                            {reviewing ? (
                                <RefreshCw size={14} className="animate-spin" />
                            ) : decisionModal?.status === 'Approved' ? (
                                <CheckCircle2 size={14} />
                            ) : (
                                <XCircle size={14} />
                            )}
                            {decisionModal?.status === 'Approved'
                                ? say('تأكيد الموافقة', 'Confirm Approval')
                                : say('تأكيد الرفض', 'Confirm Rejection')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── 8. CREATE / EDIT SHIFT MODAL ───────────────────────────── */}
            <Modal
                isOpen={shiftModalOpen}
                onClose={() => !creatingShift && !updatingShift && setShiftModalOpen(false)}
                title={
                    editingShiftItem
                        ? say('تعديل وردية مجدولة', 'Edit Scheduled Shift')
                        : say('إسناد وجدولة وردية جديدة', 'Schedule New Team Shift')
                }
            >
                <form onSubmit={handleSaveShift} className="space-y-4 p-5">
                    {/* Employee */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {say('الموظف', 'Employee')} <span className="text-rose-500">*</span>
                        </label>
                        <select
                            required
                            disabled={Boolean(editingShiftItem)}
                            value={shiftForm.userId}
                            onChange={(e) => setShiftForm((f) => ({ ...f, userId: e.target.value }))}
                            className={`mt-1.5 ${inputClasses} disabled:bg-slate-100 dark:disabled:bg-slate-800`}
                        >
                            <option value="">{say('اختر موظفاً من فريقك...', 'Select team member...')}</option>
                            {(shiftStaff.length > 0 ? shiftStaff : activeAssignments).map((a) => (
                                <option key={a.employee_id} value={a.employee_id}>
                                    {a.employee_name} ({ROLE_LABELS[a.department_role]?.ar || a.department_role})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Room Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {say('مكان الوردية / القاعة (اختياري)', 'Room / Location (Optional)')}
                        </label>
                        <select
                            value={shiftForm.roomId}
                            onChange={(e) => setShiftForm((f) => ({ ...f, roomId: e.target.value }))}
                            className={`mt-1.5 ${inputClasses}`}
                        >
                            <option value="">{say('بدون تخصيص قاعة محددة', 'No specific room')}</option>
                            {rooms.map((r) => (
                                <option key={r.room_id} value={r.room_id}>
                                    {r.name} {r.room_number ? `(${r.room_number})` : ''} - {r.type || ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Timing */}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                {say('موعد بداية الوردية', 'Shift Start Time')} <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                required
                                value={shiftForm.startTime}
                                onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                                className={`mt-1.5 ${inputClasses}`}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                {say('موعد نهاية الوردية', 'Shift End Time')} <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                required
                                value={shiftForm.endTime}
                                onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                                className={`mt-1.5 ${inputClasses}`}
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {say('ملاحظات الوردية والتعليمات', 'Shift Instructions / Notes')}
                        </label>
                        <textarea
                            rows={2}
                            maxLength={250}
                            placeholder={say('أضف أي تعليمات تشغيلية لهذه الوردية...', 'Optional notes or instructions for this shift...')}
                            value={shiftForm.notes}
                            onChange={(e) => setShiftForm((f) => ({ ...f, notes: e.target.value }))}
                            className={`mt-1.5 ${inputClasses}`}
                        />
                    </div>

                    {/* Submit Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            disabled={creatingShift || updatingShift}
                            onClick={() => setShiftModalOpen(false)}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {say('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={creatingShift || updatingShift}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500"
                        >
                            {(creatingShift || updatingShift) && <RefreshCw size={14} className="animate-spin" />}
                            {editingShiftItem ? say('حفظ التعديلات', 'Save Changes') : say('حفظ وجدولة الوردية', 'Schedule Shift')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ── 9. CONFIRM DELETE SHIFT MODAL ──────────────────────────── */}
            <Modal
                isOpen={Boolean(deleteShiftTarget)}
                onClose={() => !deletingShift && setDeleteShiftTarget(null)}
                title={say('تأكيد إلغاء وحذف الوردية', 'Confirm Shift Cancellation')}
            >
                <div className="space-y-4 p-5">
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                        {say(
                            `هل أنت متأكد من رغبتك في إلغاء وحذف وردية ${deleteShiftTarget?.employee_name} المجدولة في ${deleteShiftTarget?.start_time ? new Date(deleteShiftTarget.start_time).toLocaleString(ar ? 'ar-EG' : 'en-GB') : ''}؟`,
                            `Are you sure you want to cancel the shift for ${deleteShiftTarget?.employee_name} scheduled at ${deleteShiftTarget?.start_time ? new Date(deleteShiftTarget.start_time).toLocaleString('en-GB') : ''}?`
                        )}
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            disabled={deletingShift}
                            onClick={() => setDeleteShiftTarget(null)}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {say('تراجع', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={deletingShift}
                            onClick={handleConfirmDeleteShift}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                        >
                            {deletingShift && <RefreshCw size={14} className="animate-spin" />}
                            {say('تأكيد الحذف والإلغاء', 'Confirm Deletion')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default StaffSupervisionProfile;
