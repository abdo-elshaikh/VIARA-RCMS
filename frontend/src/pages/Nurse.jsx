import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    ClipboardList,
    PauseCircle,
    PlayCircle,
    UserCheck,
    Syringe,
    Clock,
    AlertTriangle,
    Bell,
    Edit3,
    Users,
    Stethoscope,
    Printer,
    ChevronDown,
    ChevronUp,
    Search,
    X,
    Filter,
    Calendar,
    ChevronLeft,
    ChevronRight,
    RefreshCcw,
    Sparkles,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    ArrowUpDown,
    CheckCircle2,
    RotateCcw
} from 'lucide-react';
import {
    useClaimQueueTaskMutation,
    useGetQueueQuery,
    useReleaseQueueTaskAssignmentMutation,
    useTransitionQueueMutation,
    useGetStockMovementsQuery,
    useBroadcastPatientCallMutation,
    useGetEquipmentDowntimeQuery
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { playHospitalChime } from '../utils/audioChime';
import ConsumeItemModal from '../components/inventory/ConsumeItemModal';
import HoldReasonDialog from '../components/clinical/HoldReasonDialog';
import EditComplaintDialog from '../components/clinical/EditComplaintDialog';
import EditSafetyDialog from '../components/clinical/EditSafetyDialog';
import { formatDuration } from '../utils/dateFormat';
import PageHeader from '../components/ui/PageHeader';
import { TextPromptDialog } from '../components/ui';
import ClinicalTaskScope, { AssignmentBadge } from '../components/clinical/ClinicalTaskScope';
import ClinicalPaymentExceptionNotice from '../components/clinical/ClinicalPaymentExceptionNotice';
import useClinicalPaymentExceptionFlow from '../hooks/useClinicalPaymentExceptionFlow';

const cardClass = 'overflow-hidden rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-sm';

const ACUITY = {
    Emergency: { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', ring: 'ring-rose-200 dark:ring-rose-900/50', bg: 'bg-rose-50 dark:bg-rose-950/30' },
    Urgent: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', ring: 'ring-amber-200 dark:ring-amber-900/50', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    Routine: { bar: 'bg-slate-300 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', ring: 'ring-slate-200 dark:ring-slate-800', bg: 'bg-slate-50 dark:bg-slate-900/50' },
};

const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const shiftDateInput = (dateStr, days) => {
    const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
    if (Number.isNaN(base.getTime())) return getTodayDateString();
    base.setDate(base.getDate() + days);
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatAppointmentTime = (dateStr, locale) => {
    if (!dateStr) return null;
    try {
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleTimeString(locale?.startsWith('ar') ? 'ar-EG' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return null;
    }
};

const Nurse = () => {
    const { t, i18n } = useTranslation('clinicalQueues');
    const isRtl = i18n.language?.startsWith('ar');

    // Keep active preparation work visible by default; users can explicitly narrow to today.
    const [dateMode, setDateMode] = useState('all'); // 'today' | 'all' | 'custom'
    const [customDate, setCustomDate] = useState(getTodayDateString);

    const activeQueryDate = useMemo(() => {
        if (dateMode === 'today') return getTodayDateString();
        if (dateMode === 'custom') return customDate;
        return undefined; // 'all' fetches all active items
    }, [dateMode, customDate]);

    const queueQuery = {
        station: 'Nurse',
        limit: 100,
        ...(activeQueryDate ? { date: activeQueryDate } : {}),
    };

    const {
        data: queueResponse,
        isLoading,
        isFetching,
        isError,
        error,
        refetch
    } = useGetQueueQuery(
        queueQuery,
        { pollingInterval: 15000 }
    );

    const [transitionQueue, { isLoading: isMoving }] = useTransitionQueueMutation();
    const [claimQueueTask, { isLoading: isClaiming }] = useClaimQueueTaskMutation();
    const [releaseAssignment, { isLoading: isReleasingAssignment }] = useReleaseQueueTaskAssignmentMutation();
    const [broadcastPatientCall] = useBroadcastPatientCallMutation();
    const { data: stockMovements = [] } = useGetStockMovementsQuery();
    const { data: downtimeRecords = [] } = useGetEquipmentDowntimeQuery(undefined, { pollingInterval: 30000 });

    const activeDowntimes = useMemo(() => {
        return (Array.isArray(downtimeRecords) ? downtimeRecords : []).filter(r => r.status !== 'Resolved');
    }, [downtimeRecords]);

    const handleCallPatient = async (item) => {
        const token = item.order_number || item.accession_number || String(item.exam_id);
        const patName = item.patient_name || '';
        const room = isRtl ? 'غرفة التحضير' : 'Preparation Room';
        try {
            await broadcastPatientCall({
                orderNumber: token,
                patientName: patName,
                queueNumber: item.queue_number || null,
                roomName: room,
                deskIdentifier: 'غرفة التحضير',
                modalityId: item.modality_id || null,
                callByName: Boolean(patName),
            }).unwrap();
            playHospitalChime();
            toast.success(isRtl
                ? `🔔 تم نداء المريض ${patName || token} للتوجه إلى غرفة التحضير`
                : `🔔 Patient ${patName || token} called to Preparation Room`
            );
        } catch (error) {
            toast.error(isRtl ? '\u062a\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0646\u062f\u0627\u0621. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.' : (error?.data?.message || 'Could not send the patient call. Please try again.'));
        }
    };

    const [consumeExamId, setConsumeExamId] = useState(null);
    const [holdItem, setHoldItem] = useState(null);
    const [editComplaintItem, setEditComplaintItem] = useState(null);
    const [editSafetyItem, setEditSafetyItem] = useState(null);
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const [taskScope, setTaskScope] = useState('all');
    const [releaseAssignmentItem, setReleaseAssignmentItem] = useState(null);

    // Advanced Filters State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStage, setSelectedStage] = useState('all'); // 'all' | 'Prep Pending' | 'Ready for Exam' | 'On Hold' | 'Overdue'
    const [selectedPriority, setSelectedPriority] = useState('all'); // 'all' | 'Emergency' | 'Urgent' | 'Routine'
    const [selectedModality, setSelectedModality] = useState('all');
    const [selectedSafety, setSelectedSafety] = useState('all'); // 'all' | 'needs_attention' | 'cleared'
    const [sortBy, setSortBy] = useState('wait_desc'); // 'wait_desc' | 'wait_asc' | 'priority' | 'time'

    const items = useMemo(() => queueResponse?.data || [], [queueResponse?.data]);
    const taskKpis = queueResponse?.kpis || {};
    const {
        requestTarget: paymentExceptionTarget,
        requestException: requestPaymentException,
        closeRequest: closePaymentExceptionRequest,
        submitException: submitPaymentException,
        isRequesting: isRequestingPaymentException,
    } = useClinicalPaymentExceptionFlow({
        items,
        targetStage: 'Ready for Exam',
        isArabic: isRtl,
        refetch,
    });

    // Available modalities extracted dynamically from active queue
    const availableModalities = useMemo(() => {
        const set = new Set();
        items.forEach((item) => {
            if (item.modality_name) set.add(item.modality_name);
            else if (item.modality_type) set.add(item.modality_type);
        });
        return Array.from(set).sort();
    }, [items]);

    // Scope filtering (All, Mine, Available)
    const visibleItems = useMemo(() => {
        if (taskScope === 'all') return items;
        return items.filter((item) =>
            taskScope === 'available'
                ? item.assignment_status === 'Unassigned'
                : item.is_assigned_to_me
        );
    }, [items, taskScope]);

    // Multi-dimensional filtering and sorting
    const filteredItems = useMemo(() => {
        let result = visibleItems;

        // Search filter (patient name, MRN, order number, exam type, modality)
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter((item) => {
                const name = (item.patient_name || '').toLowerCase();
                const mrn = (item.mrn || '').toLowerCase();
                const order = (item.order_number || '').toLowerCase();
                const exam = (item.exam_type_name || '').toLowerCase();
                const mod = (item.modality_name || '').toLowerCase();
                return name.includes(q) || mrn.includes(q) || order.includes(q) || exam.includes(q) || mod.includes(q);
            });
        }

        // Stage filter
        if (selectedStage !== 'all') {
            if (selectedStage === 'On Hold') {
                result = result.filter((item) => item.is_on_hold);
            } else if (selectedStage === 'Overdue') {
                result = result.filter((item) => item.is_overdue);
            } else {
                result = result.filter((item) => item.queue_stage === selectedStage);
            }
        }

        // Priority filter
        if (selectedPriority !== 'all') {
            result = result.filter((item) => item.priority === selectedPriority);
        }

        // Modality filter
        if (selectedModality !== 'all') {
            result = result.filter((item) =>
                item.modality_name === selectedModality || item.modality_type === selectedModality
            );
        }

        // Safety filter
        if (selectedSafety !== 'all') {
            result = result.filter((item) => {
                const statuses = [item.pregnancy_safety_status, item.implant_safety_status, item.renal_safety_status];
                const needsAttention = statuses.some((s) => s === 'At Risk' || s === 'Unknown');
                if (selectedSafety === 'needs_attention') return needsAttention;
                if (selectedSafety === 'cleared') return !needsAttention && statuses.some((s) => s === 'Cleared');
                return true;
            });
        }

        // Sorting
        const priorityScore = { Emergency: 3, Urgent: 2, Routine: 1 };
        return [...result].sort((a, b) => {
            if (sortBy === 'wait_desc') {
                return (b.waiting_minutes || 0) - (a.waiting_minutes || 0);
            }
            if (sortBy === 'wait_asc') {
                return (a.waiting_minutes || 0) - (b.waiting_minutes || 0);
            }
            if (sortBy === 'priority') {
                const diff = (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0);
                if (diff !== 0) return diff;
                return (b.waiting_minutes || 0) - (a.waiting_minutes || 0);
            }
            if (sortBy === 'time') {
                const timeA = new Date(a.start_time || a.arrived_at || a.created_at || 0).getTime();
                const timeB = new Date(b.start_time || b.arrived_at || b.created_at || 0).getTime();
                return timeA - timeB;
            }
            return 0;
        });
    }, [visibleItems, searchQuery, selectedStage, selectedPriority, selectedModality, selectedSafety, sortBy]);

    const hasActiveFilters = Boolean(
        searchQuery.trim() ||
        selectedStage !== 'all' ||
        selectedPriority !== 'all' ||
        selectedModality !== 'all' ||
        selectedSafety !== 'all' ||
        sortBy !== 'wait_desc'
    );

    const resetFilters = () => {
        setSearchQuery('');
        setSelectedStage('all');
        setSelectedPriority('all');
        setSelectedModality('all');
        setSelectedSafety('all');
        setSortBy('wait_desc');
    };

    const move = async (item, payload) => {
        try {
            await transitionQueue({ examId: item.exam_id, ...payload }).unwrap();
            toast.success(payload.action === 'hold'
                ? t('common.held')
                : payload.action === 'release'
                    ? t('common.released')
                    : t('common.moved', { stage: t(`common.stages.${payload.toStage}`, { defaultValue: payload.toStage }) }));
            return true;
        } catch (error) {
            const errorCode = error?.data?.code || error?.data?.details?.code;
            if (errorCode === 'PARTIAL_PAYMENT_EXCEPTION_REQUIRED') {
                requestPaymentException(item);
                toast(isRtl
                    ? 'تحتاج هذه الحالة إلى اعتماد استثناء مالي قبل تحويلها لجهاز الفحص.'
                    : 'This case needs a financial exception approval before it can move to the modality.', { icon: '🛡️' });
                return false;
            }
            toast.error(getErrorMessage(error, t('common.updateFailed')));
            return false;
        }
    };

    const total = taskKpis.assignedToMe || 0;
    const overdue = items.filter((i) => i.is_assigned_to_me && i.is_overdue).length;

    const claim = async (item) => {
        try {
            await claimQueueTask(item.exam_id).unwrap();
            setTaskScope('mine');
            toast.success(t('taskScope.claimed'));
        } catch (error) {
            toast.error(error?.data?.code === 'TASK_ALREADY_ASSIGNED'
                ? t('taskScope.claimConflict')
                : getErrorMessage(error, t('common.updateFailed')));
        }
    };

    const returnToPool = async (reason) => {
        try {
            await releaseAssignment({ examId: releaseAssignmentItem.exam_id, reason }).unwrap();
            toast.success(t('taskScope.released'));
            setReleaseAssignmentItem(null);
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('common.updateFailed')));
            return false;
        }
    };

    const toggleExpanded = (examId) => setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(examId)) next.delete(examId);
        else next.add(examId);
        return next;
    });

    const handleShiftDate = (days) => {
        setDateMode('custom');
        setCustomDate((prev) => shiftDateInput(prev || getTodayDateString(), days));
    };

    return (
        <div className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-4">
                {/* Top Header */}
                <PageHeader
                    icon={Stethoscope}
                    eyebrow={t('nurse.eyebrow')}
                    title={t('nurse.title')}
                    description={t('nurse.description')}
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            <ClinicalTaskScope
                                value={taskScope}
                                onChange={setTaskScope}
                                assignedCount={taskKpis.assignedToMe || 0}
                                availableCount={taskKpis.available || 0}
                                t={t}
                            />
                            <button
                                type="button"
                                onClick={() => refetch()}
                                className="group inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-semibold text-[var(--VIARA-ink)] outline-none transition hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),.2)]"
                                title={t('filters.refreshQueue', { defaultValue: 'Refresh queue' })}
                            >
                                <RefreshCcw size={14} className={`transition-transform duration-500 ${isFetching ? 'animate-spin' : 'group-hover:rotate-180'}`} />
                                <span className="hidden sm:inline">{t('common.refresh')}</span>
                            </button>
                        </div>
                    }
                    metrics={[
                        { key: 'active', icon: Users, label: t('taskScope.totalAssigned'), value: total, tone: 'teal', loading: isLoading },
                        { key: 'pending', icon: ClipboardList, label: t('taskScope.pending'), value: taskKpis.pending || 0, tone: 'slate', loading: isLoading },
                        { key: 'progress', icon: Stethoscope, label: t('taskScope.inProgress'), value: taskKpis.inProgress || 0, tone: 'blue', loading: isLoading },
                        { key: 'overdue', icon: AlertTriangle, label: t('nurse.overdue'), value: overdue, tone: overdue > 0 ? 'rose' : 'emerald', loading: isLoading },
                    ]}
                    metricsLabel={t('nurse.recordIndicators', { defaultValue: 'Nursing queue record indicators' })}
                />

                {/* Equipment Downtime Warning Banner */}
                {activeDowntimes.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs font-semibold text-amber-950 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                <AlertTriangle size={18} />
                            </div>
                            <div>
                                <p className="font-black text-slate-900 dark:text-white">
                                    {isRtl
                                        ? `تنبيه صيانة الأجهزة: يوجد (${activeDowntimes.length}) جهاز في حالة توقف أو صيانة حالياً.`
                                        : `Equipment Maintenance Alert: (${activeDowntimes.length}) machine(s) currently under maintenance.`}
                                </p>
                                <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                                    {isRtl
                                        ? 'يرجى التنسيق مع فنيي الأشعة والتأكد من جاهزية الجهاز قبل بدء تحضير المريض أو تركيب الكانيولا وحقن الصبغة.'
                                        : 'Please coordinate with radiology technicians before contrast injection or patient preparation.'}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/equipment?tab=downtime"
                            className="inline-flex items-center justify-center shrink-0 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-black text-white shadow-xs hover:bg-amber-700 transition"
                        >
                            {isRtl ? 'سجل الأعطال والصيانة' : 'View Maintenance'}
                        </Link>
                    </div>
                )}

                {/* Filter & Command Control Bar */}
                <section className={`${cardClass} p-3.5 sm:p-4 space-y-3.5`}>
                    {/* First Row: Date Mode Switcher & Search Bar */}
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* Date Navigation & Today's Cases Toggle */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-1">
                                <button
                                    type="button"
                                    onClick={() => setDateMode('today')}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-all ${
                                        dateMode === 'today'
                                            ? 'bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] shadow-sm ring-1 ring-[var(--VIARA-line)]'
                                            : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'
                                    }`}
                                >
                                    <Sparkles size={13} className={dateMode === 'today' ? 'text-[var(--VIARA-accent)] animate-pulse' : ''} />
                                    <span>{t('filters.todayCases', { defaultValue: "Today's Cases" })}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setDateMode('all')}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-all ${
                                        dateMode === 'all'
                                            ? 'bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] shadow-sm ring-1 ring-[var(--VIARA-line)]'
                                            : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'
                                    }`}
                                >
                                    <Clock size={13} />
                                    <span>{t('filters.allCases', { defaultValue: 'All Active' })}</span>
                                </button>
                            </div>

                            {/* Custom Date Navigator */}
                            <div className="flex items-center gap-1 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-1.5 py-1">
                                <button
                                    type="button"
                                    onClick={() => handleShiftDate(-1)}
                                    className="rounded-lg p-1.5 text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface)] hover:text-[var(--VIARA-ink)]"
                                    title={t('filters.previousDay', { defaultValue: 'Previous Day' })}
                                    aria-label="Previous day"
                                >
                                    {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                                </button>

                                <div className="flex items-center gap-1.5 px-1.5">
                                    <Calendar size={13} className="text-[var(--VIARA-accent)]" />
                                    <input
                                        type="date"
                                        value={dateMode === 'today' ? getTodayDateString() : customDate}
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                setCustomDate(e.target.value);
                                                setDateMode('custom');
                                            }
                                        }}
                                        className="bg-transparent text-xs font-semibold text-[var(--VIARA-ink)] outline-none cursor-pointer"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleShiftDate(1)}
                                    className="rounded-lg p-1.5 text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface)] hover:text-[var(--VIARA-ink)]"
                                    title={t('filters.nextDay', { defaultValue: 'Next Day' })}
                                    aria-label="Next day"
                                >
                                    {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                                </button>
                            </div>
                        </div>

                        {/* Search Input Box */}
                        <div className="relative min-w-[240px] flex-1 lg:max-w-md">
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--VIARA-muted)]" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('filters.searchPlaceholder', { defaultValue: 'Search by patient, MRN, order #, exam...' })}
                                className="h-10 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] pe-9 ps-9 text-xs font-medium text-[var(--VIARA-ink)] outline-none transition placeholder:text-[var(--VIARA-muted)] focus:border-[var(--VIARA-accent)] focus:bg-[var(--VIARA-surface)] focus:ring-2 focus:ring-[rgba(var(--VIARA-accent-rgb),.15)]"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]"
                                    title={t('common.cancel')}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Second Row: Stage Tabs and Multi-Dropdown Filters */}
                    <div className="flex flex-col gap-3 border-t border-[var(--VIARA-line)] pt-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* Quick Stage Filter Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                            {[
                                { id: 'all', label: t('filters.stageAll', { defaultValue: 'All Stages' }) },
                                { id: 'Prep Pending', label: t('common.stages.Prep Pending', { defaultValue: 'Prep pending' }) },
                                { id: 'Ready for Exam', label: t('common.stages.Ready for Exam', { defaultValue: 'Ready for exam' }) },
                                { id: 'On Hold', label: t('common.onHold', { defaultValue: 'On hold' }) },
                                { id: 'Overdue', label: t('nurse.overdue', { defaultValue: 'Overdue' }) },
                            ].map((tab) => {
                                const active = selectedStage === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setSelectedStage(tab.id)}
                                        className={`inline-flex h-7 items-center rounded-lg px-2.5 text-[11px] font-bold transition-all ${
                                            active
                                                ? 'bg-[var(--VIARA-accent)] text-white shadow-xs'
                                                : 'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-[var(--VIARA-accent)] hover:text-[var(--VIARA-ink)]'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Filter Dropdowns & Sorting */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Priority Select */}
                            <div className="relative">
                                <select
                                    value={selectedPriority}
                                    onChange={(e) => setSelectedPriority(e.target.value)}
                                    className="h-8 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] pe-7 ps-2.5 text-[11px] font-semibold text-[var(--VIARA-ink)] outline-none hover:border-[var(--VIARA-accent)] focus:border-[var(--VIARA-accent)]"
                                >
                                    <option value="all">{t('filters.priorityAll', { defaultValue: 'All Priorities' })}</option>
                                    <option value="Emergency">{t('common.priority.Emergency', { defaultValue: 'Emergency' })}</option>
                                    <option value="Urgent">{t('common.priority.Urgent', { defaultValue: 'Urgent' })}</option>
                                    <option value="Routine">{t('common.priority.Routine', { defaultValue: 'Routine' })}</option>
                                </select>
                            </div>

                            {/* Modality Filter */}
                            {availableModalities.length > 0 && (
                                <div className="relative">
                                    <select
                                        value={selectedModality}
                                        onChange={(e) => setSelectedModality(e.target.value)}
                                        className="h-8 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] pe-7 ps-2.5 text-[11px] font-semibold text-[var(--VIARA-ink)] outline-none hover:border-[var(--VIARA-accent)] focus:border-[var(--VIARA-accent)]"
                                    >
                                        <option value="all">{t('filters.modalityAll', { defaultValue: 'All Modalities' })}</option>
                                        {availableModalities.map((mod) => (
                                            <option key={mod} value={mod}>{mod}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Safety Filter */}
                            <div className="relative">
                                <select
                                    value={selectedSafety}
                                    onChange={(e) => setSelectedSafety(e.target.value)}
                                    className="h-8 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] pe-7 ps-2.5 text-[11px] font-semibold text-[var(--VIARA-ink)] outline-none hover:border-[var(--VIARA-accent)] focus:border-[var(--VIARA-accent)]"
                                >
                                    <option value="all">{t('filters.safetyAll', { defaultValue: 'All Safety' })}</option>
                                    <option value="needs_attention">{t('filters.safetyNeedsReview', { defaultValue: 'Safety Review Needed' })}</option>
                                    <option value="cleared">{t('filters.safetyCleared', { defaultValue: 'Safety Cleared' })}</option>
                                </select>
                            </div>

                            {/* Sort Selector */}
                            <div className="relative flex items-center">
                                <ArrowUpDown size={12} className="pointer-events-none absolute start-2 text-[var(--VIARA-muted)]" />
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="h-8 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] pe-7 ps-6 text-[11px] font-semibold text-[var(--VIARA-ink)] outline-none hover:border-[var(--VIARA-accent)] focus:border-[var(--VIARA-accent)]"
                                >
                                    <option value="wait_desc">{t('filters.sortLongestWait', { defaultValue: 'Longest wait' })}</option>
                                    <option value="wait_asc">{t('filters.sortShortestWait', { defaultValue: 'Shortest wait' })}</option>
                                    <option value="priority">{t('filters.sortPriority', { defaultValue: 'Highest priority' })}</option>
                                    <option value="time">{t('filters.sortAppointmentTime', { defaultValue: 'Appointment time' })}</option>
                                </select>
                            </div>

                            {/* Reset Active Filters */}
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
                                >
                                    <RotateCcw size={12} />
                                    <span>{t('filters.resetFilters', { defaultValue: 'Reset' })}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Results Counter Sub-bar */}
                    <div className="flex items-center justify-between text-[11px] text-[var(--VIARA-muted)] border-t border-[var(--VIARA-line)]/60 pt-2">
                        <span>
                            {t('filters.showingCount', {
                                count: filteredItems.length,
                                total: items.length,
                                defaultValue: `Showing ${filteredItems.length} of ${items.length} cases`
                            })}
                            {dateMode === 'today' && ` · ${t('filters.todayCases', { defaultValue: "Today's Cases" })}`}
                        </span>
                        {dateMode !== 'today' && dateMode !== 'all' && (
                            <span className="font-mono font-medium text-[var(--VIARA-accent)]">
                                {customDate}
                            </span>
                        )}
                    </div>
                </section>

                {/* Desktop Table View */}
                <section className={`hidden overflow-hidden md:block ${cardClass}`}>
                    <table className="min-w-full text-start text-sm">
                        <thead>
                            <tr className="border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/55">
                                <th scope="col" className="py-3.5 pe-4 ps-5 text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('nurse.patientDetails')}</th>
                                <th scope="col" className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('nurse.studyInstructions')}</th>
                                <th scope="col" className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('nurse.stagePriority')}</th>
                                <th scope="col" className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('common.wait')}</th>
                                <th scope="col" className="py-3.5 pe-5 ps-4 text-end text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--VIARA-line)]">
                            {isLoading ? (
                                <tr><td colSpan={5}><LoadingState label={t('nurse.loading')} /></td></tr>
                            ) : isError ? (
                                <tr>
                                    <td colSpan={5}>
                                        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-800">
                                                <AlertTriangle size={24} />
                                            </div>
                                            <p className="text-sm font-bold text-[var(--VIARA-ink)]">
                                                {isRtl ? 'حدث خطأ أثناء تحميل مهام التمريض' : 'Failed to load nursing queue'}
                                            </p>
                                            <p className="max-w-md text-xs text-[var(--VIARA-muted)]">
                                                {getErrorMessage(error) || (isRtl ? 'تعذر جلب البيانات من الخادم، يرجى إعادة المحاولة أو التحقق من الصلاحيات.' : 'Could not fetch data from server.')}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => refetch()}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--VIARA-accent)] px-3.5 py-1.5 text-xs font-bold text-white transition hover:brightness-105"
                                            >
                                                <RefreshCcw size={13} />
                                                <span>{t('common.refresh', { defaultValue: 'Retry' })}</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={5}>
                                        <EmptyState
                                            title={hasActiveFilters ? t('filters.noMatchTitle', { defaultValue: 'No matching cases' }) : t(taskScope === 'all' ? 'taskScope.allEmpty' : taskScope === 'mine' ? 'taskScope.myEmpty' : 'taskScope.availableEmpty')}
                                            subtitle={hasActiveFilters ? t('filters.noMatchDescription', { defaultValue: 'No cases in the queue match your current filter criteria.' }) : undefined}
                                            action={hasActiveFilters ? (
                                                <button
                                                    type="button"
                                                    onClick={resetFilters}
                                                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--VIARA-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--VIARA-accent)] hover:brightness-95"
                                                >
                                                    <RotateCcw size={13} />
                                                    {t('filters.clearAll', { defaultValue: 'Clear filters' })}
                                                </button>
                                            ) : null}
                                        />
                                    </td>
                                </tr>
                            ) : filteredItems.map((item) => {
                                const acuity = ACUITY[item.priority] || ACUITY.Routine;
                                const consumed = stockMovements.filter((m) => m.reference_type === 'Exam' && m.reference_id === item.exam_id);
                                const consumedTotal = consumed.reduce((sum, movement) => sum + Number(movement.total_amount || (Math.abs(Number(movement.quantity_change || 0)) * Number(movement.unit_price || 0))), 0);
                                const expanded = expandedIds.has(item.exam_id);
                                const apptTime = formatAppointmentTime(item.start_time, i18n.language);

                                return (
                                    <React.Fragment key={item.exam_id}>
                                        <tr className="group relative align-top transition-colors hover:bg-[var(--VIARA-surface-hover)]">
                                            <td className="relative py-4 pe-4 ps-5">
                                                <span className={`absolute inset-y-2 start-0 w-1 rounded-full ${acuity.bar} ${item.is_overdue ? 'animate-pulse' : ''}`} aria-hidden="true" />
                                                <div className="font-semibold text-[var(--VIARA-ink)]">{item.patient_name || t('common.patientFallback')}</div>
                                                <div className="mt-0.5 font-mono text-[11px] font-medium tracking-wide text-[var(--VIARA-muted)] ltr-embed">{item.mrn}</div>
                                                <div className="mt-0.5 flex items-center gap-2">
                                                    <span className="font-mono text-[10px] font-medium uppercase text-[var(--VIARA-muted)]/80">{item.order_number}</span>
                                                    {apptTime && (
                                                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-[var(--VIARA-accent)] bg-[var(--VIARA-accent-soft)] px-1.5 py-0.5 rounded">
                                                            <Calendar size={10} />
                                                            {apptTime}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="max-w-sm px-4 py-4">
                                                <div className="font-semibold text-[var(--VIARA-ink)]">{item.exam_type_name || item.modality_name}</div>
                                                <div className="mt-0.5 text-xs font-medium text-[var(--VIARA-muted)]">{item.modality_name}{item.body_part ? ` — ${item.body_part}` : ''}</div>

                                                <div className={`${expanded ? '' : 'hidden'} mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-[var(--VIARA-muted)]`}>
                                                    <span>{item.technician_name ? `${t('nurse.tech')}: ${item.technician_name}` : t('nurse.noTech')}</span>
                                                    <span className="text-[var(--VIARA-line)]">·</span>
                                                    <span>{item.radiologist_name ? `${t('nurse.radiologist')}: ${item.radiologist_name}` : t('nurse.noRadiologist')}</span>
                                                </div>

                                                <div className={`${expanded ? '' : 'hidden'} mt-2.5 flex flex-wrap gap-1.5`}>
                                                    <SafetyChecklistBadge type="Pregnancy" status={item.pregnancy_safety_status} onClick={item.is_assigned_to_me ? () => setEditSafetyItem(item) : undefined} t={t} />
                                                    <SafetyChecklistBadge type="Implant" status={item.implant_safety_status} onClick={item.is_assigned_to_me ? () => setEditSafetyItem(item) : undefined} t={t} />
                                                    <SafetyChecklistBadge type="Renal" status={item.renal_safety_status} onClick={item.is_assigned_to_me ? () => setEditSafetyItem(item) : undefined} t={t} />
                                                </div>

                                                {expanded && consumed.length > 0 && (
                                                    <div className="mt-2.5">
                                                        <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--VIARA-muted)]">{t('nurse.supplies')}</span><span className="font-mono text-[10px] font-black text-[var(--VIARA-accent)]" dir="ltr">{consumedTotal.toFixed(2)}</span></div>
                                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                                            {consumed.map((m) => (
                                                                <span key={m.movement_id} className="inline-flex items-center rounded-md border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--VIARA-muted)]">
                                                                    {t('nurse.quantity', { name: m.item_name, count: Math.abs(m.quantity_change) })}
                                                                </span>
                              ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className={`${expanded ? '' : 'hidden'} mt-2.5 flex items-start gap-1.5`}>
                                                    <div className="flex-1 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 text-xs leading-relaxed text-[var(--VIARA-muted)]">
                                                        <span className="font-semibold uppercase tracking-wide text-[var(--VIARA-muted)] text-[10px]">{t('nurse.complaint')}</span>
                                                        <p className="mt-0.5">{item.clinical_indication || <span className="italic text-[var(--VIARA-muted)]">{t('nurse.notRecorded')}</span>}</p>
                                                    </div>
                                                    {item.is_assigned_to_me && (
                                                        <button
                                                            onClick={() => setEditComplaintItem(item)}
                                                            className="mt-0.5 shrink-0 rounded-md p-1.5 text-[var(--VIARA-muted)] opacity-0 outline-none transition-all hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),.2)] group-hover:opacity-100"
                                                            title={t('nurse.editComplaint')}
                                                        >
                                                            <Edit3 size={14} strokeWidth={2.25} />
                                                        </button>
                                                    )}
                                                </div>

                                                {expanded && item.preparation_instructions && (
                                                    <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-1.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                                                        <span className="font-semibold">{t('nurse.instructions')}:</span> {item.preparation_instructions}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-4 py-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    <QueuePill stage={item.queue_stage} t={t} />
                                                    <PriorityBadge priority={item.priority} label={t(`common.priority.${item.priority || 'Routine'}`, { defaultValue: item.priority || 'Routine' })} />
                                                    <AssignmentBadge status={item.assignment_status} t={t} />
                                                </div>
                                                 {item.is_on_hold && (
                                                     <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50">
                                                         <PauseCircle size={12} /> {item.hold_reason || t('nurse.noHoldReason')}
                                                     </div>
                                                 )}
                                                <ClinicalPaymentExceptionNotice
                                                    item={item}
                                                    targetStage="Ready for Exam"
                                                    isArabic={isRtl}
                                                    canRequest={item.is_assigned_to_me}
                                                    onRequest={requestPaymentException}
                                                />
                                             </td>

                                            <td className="px-4 py-4">
                                                <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${item.is_overdue ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-ink)] ring-[var(--VIARA-line)] dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'}`}>
                                                    <Clock size={12} />
                                                    {formatDuration(item.waiting_minutes || 0, i18n.language)}
                                                </span>
                                            </td>

                                            <td className="py-4 pe-5 ps-4">
                                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                                    <ActionButton icon={expanded ? ChevronUp : ChevronDown} label={t(expanded ? 'nurse.hideDetails' : 'nurse.showDetails', { defaultValue: expanded ? 'Hide details' : 'Details' })} tone="slate" onClick={() => toggleExpanded(item.exam_id)} />
                                                    {item.assignment_status === 'Unassigned' ? (
                                                        item.queue_stage === 'Prep Pending' ? (
                                                            <ActionButton icon={UserCheck} label={t('taskScope.accept')} tone="teal" solid disabled={isClaiming} onClick={() => claim(item)} />
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                                {t('nurse.awaitingPrepStage', { defaultValue: 'بانتظار وصول الحالة للتمريض' })}
                                                            </span>
                                                        )
                                                    ) : (
                                                        <>
                                                            {item.is_on_hold ? (
                                                                <ActionButton icon={PlayCircle} label={t('common.release')} tone="emerald" disabled={isMoving} onClick={() => move(item, { action: 'release' })} />
                                                            ) : (
                                                                <ActionButton icon={PauseCircle} label={t('common.hold')} tone="amber" disabled={isMoving} onClick={() => setHoldItem(item)} />
                                                            )}
                                                            {item.queue_stage === 'Prep Pending' && !item.task_started_at && (
                                                                <ActionButton icon={ClipboardList} label={t('nurse.startPrep')} tone="slate" disabled={isMoving || item.is_on_hold} onClick={() => move(item, { action: 'start_task' })} />
                                                            )}
                                                            {item.queue_stage === 'Prep Pending' && (
                                                                <ActionButton icon={Syringe} label={t('nurse.consumeSupplies')} tone="slate" disabled={item.is_on_hold || !item.task_started_at} onClick={() => setConsumeExamId(item.exam_id)} />
                                                            )}
                                                            <ActionButton icon={UserCheck} label={t('nurse.ready')} tone="teal" solid disabled={isMoving || item.is_on_hold || !item.task_started_at} onClick={() => move(item, { toStage: 'Ready for Exam' })} />
                                                            <ActionButton icon={Users} label={t('taskScope.return')} tone="slate" disabled={isReleasingAssignment} onClick={() => setReleaseAssignmentItem(item)} />
                                                            <ActionButton
                                                                icon={Printer}
                                                                label={t('common.printSticker', { defaultValue: 'Print Sticker' })}
                                                                tone="slate"
                                                                onClick={() => {
                                                                    const copies = window.prompt(t('common.stickerCopiesPrompt'), t('common.stickerCopiesDefault'));
                                                                    if (copies && parseInt(copies, 10) > 0) {
                                                                        window.open(`/print/sticker/${item.appointment_id}?copies=${parseInt(copies, 10)}`, '_blank');
                                                                    }
                                                                }}
                                                            />
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {expanded && (
                                            <tr className="bg-[var(--VIARA-surface-muted)]/55">
                                                <td colSpan={5} className="px-5 py-3">
                                                    <div className="grid gap-3 md:grid-cols-3">
                                                        <DetailBlock label={t('nurse.complaint', { defaultValue: 'Complaint' })} value={item.clinical_indication || t('nurse.notRecorded', { defaultValue: 'Not recorded' })} />
                                                        <DetailBlock label={t('nurse.instructions', { defaultValue: 'Instructions' })} value={item.preparation_instructions || t('nurse.notRecorded', { defaultValue: 'Not recorded' })} />
                                                        <DetailBlock label={t('nurse.supplies', { defaultValue: 'Consumed supplies' })} value={consumed.length ? consumed.map((m) => t('nurse.quantity', { name: m.item_name, count: Math.abs(m.quantity_change) })).join(', ') : t('nurse.none', { defaultValue: 'None recorded' })} />
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </section>

                {/* Mobile Cards View */}
                <section className="space-y-3 md:hidden">
                    {isLoading ? (
                        <div className={cardClass}><LoadingState label={t('nurse.loading')} /></div>
                    ) : isError ? (
                        <div className={`${cardClass} p-8 text-center flex flex-col items-center justify-center gap-3`}>
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-800">
                                <AlertTriangle size={24} />
                            </div>
                            <p className="text-sm font-bold text-[var(--VIARA-ink)]">
                                {isRtl ? 'حدث خطأ أثناء تحميل مهام التمريض' : 'Failed to load nursing queue'}
                            </p>
                            <p className="max-w-xs text-xs text-[var(--VIARA-muted)]">
                                {getErrorMessage(error) || (isRtl ? 'تعذر جلب البيانات من الخادم، يرجى إعادة المحاولة أو التحقق من الصلاحيات.' : 'Could not fetch data from server.')}
                            </p>
                            <button
                                type="button"
                                onClick={() => refetch()}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--VIARA-accent)] px-3.5 py-1.5 text-xs font-bold text-white transition hover:brightness-105"
                            >
                                <RefreshCcw size={13} />
                                <span>{t('common.refresh', { defaultValue: 'Retry' })}</span>
                            </button>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className={cardClass}>
                            <EmptyState
                                title={hasActiveFilters ? t('filters.noMatchTitle', { defaultValue: 'No matching cases' }) : t(taskScope === 'all' ? 'taskScope.allEmpty' : taskScope === 'mine' ? 'taskScope.myEmpty' : 'taskScope.availableEmpty')}
                                subtitle={hasActiveFilters ? t('filters.noMatchDescription', { defaultValue: 'No cases match your filters.' }) : undefined}
                                action={hasActiveFilters ? (
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--VIARA-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--VIARA-accent)] hover:brightness-95"
                                    >
                                        <RotateCcw size={13} />
                                        {t('filters.clearAll', { defaultValue: 'Clear filters' })}
                                    </button>
                                ) : null}
                            />
                        </div>
                    ) : filteredItems.map((item) => (
                        <NurseQueueCard
                            key={item.exam_id}
                            item={item}
                            t={t}
                            locale={i18n.language}
                            isMoving={isMoving}
                            stockMovements={stockMovements}
                            onRelease={() => move(item, { action: 'release' })}
                            onHold={() => setHoldItem(item)}
                            onStartPrep={() => move(item, { action: 'start_task' })}
                            onConsume={() => setConsumeExamId(item.exam_id)}
                            onReady={() => move(item, { toStage: 'Ready for Exam' })}
                            onEditComplaint={() => setEditComplaintItem(item)}
                            onEditSafety={() => setEditSafetyItem(item)}
                            onClaim={() => claim(item)}
                            onReturn={() => setReleaseAssignmentItem(item)}
                            onRequestPaymentException={() => requestPaymentException(item)}
                            onCallPatient={handleCallPatient}
                            isArabic={isRtl}
                             isClaiming={isClaiming}
                            isReleasingAssignment={isReleasingAssignment}
                            expanded={expandedIds.has(item.exam_id)}
                            onToggleDetails={() => toggleExpanded(item.exam_id)}
                        />
                    ))}
                </section>

                {/* Dialogs and Modals */}
                {consumeExamId && (
                    <ConsumeItemModal examId={consumeExamId} onClose={() => setConsumeExamId(null)} />
                )}

                <HoldReasonDialog
                    isOpen={Boolean(holdItem)}
                    patientName={holdItem?.patient_name}
                    isSaving={isMoving}
                    onClose={() => setHoldItem(null)}
                    onConfirm={async (reason) => {
                        const succeeded = await move(holdItem, { action: 'hold', reason });
                        if (succeeded) setHoldItem(null);
                    }}
                />

                <EditComplaintDialog
                    isOpen={Boolean(editComplaintItem)}
                    patientName={editComplaintItem?.patient_name}
                    initialComplaint={editComplaintItem?.clinical_indication}
                    isSaving={isMoving}
                    onClose={() => setEditComplaintItem(null)}
                    onConfirm={async (complaint) => {
                        const succeeded = await move(editComplaintItem, { action: 'update_complaint', complaint });
                        if (succeeded) setEditComplaintItem(null);
                    }}
                />

                <EditSafetyDialog
                    isOpen={Boolean(editSafetyItem)}
                    patientName={editSafetyItem?.patient_name}
                    initialSafety={{
                        pregnancy: editSafetyItem?.pregnancy_safety_status,
                        implant: editSafetyItem?.implant_safety_status,
                        renal: editSafetyItem?.renal_safety_status,
                    }}
                    isSaving={isMoving}
                    onClose={() => setEditSafetyItem(null)}
                    onConfirm={async (safety) => {
                        const succeeded = await move(editSafetyItem, {
                            action: 'update_safety',
                            pregnancySafetyStatus: safety.pregnancy,
                            implantSafetyStatus: safety.implant,
                            renalSafetyStatus: safety.renal,
                        });
                        if (succeeded) setEditSafetyItem(null);
                    }}
                />

                <TextPromptDialog
                    isOpen={Boolean(paymentExceptionTarget)}
                    onClose={closePaymentExceptionRequest}
                    onConfirm={submitPaymentException}
                    title={isRtl ? 'طلب استثناء مالي للمرحلة التالية' : 'Request financial exception'}
                    message={isRtl
                        ? `سيُرسل الطلب لاعتماد نقل ${paymentExceptionTarget?.patient_name || 'الحالة'} إلى جهاز الفحص. الفاتورة: ${paymentExceptionTarget?.invoice_number || '—'}`
                        : `This requests approval to move ${paymentExceptionTarget?.patient_name || 'the patient'} to the modality. Invoice: ${paymentExceptionTarget?.invoice_number || '—'}`}
                    label={isRtl ? 'سبب متابعة الحالة قبل استكمال السداد' : 'Reason for continuing before full payment'}
                    placeholder={isRtl ? 'اكتب سببًا واضحًا للمراجع المالي...' : 'Enter a clear reason for the financial reviewer...'}
                    confirmLabel={isRtl ? 'إرسال الطلب' : 'Send request'}
                    cancelLabel={t('common.cancel')}
                    validationMessage={isRtl ? 'يرجى كتابة سبب لا يقل عن 5 أحرف' : 'Please enter at least 5 characters'}
                    validate={(value) => value.length < 5 ? (isRtl ? 'يرجى كتابة سبب لا يقل عن 5 أحرف' : 'Please enter at least 5 characters') : ''}
                    inputProps={{ minLength: 5, maxLength: 1000 }}
                    isLoading={isRequestingPaymentException}
                />

                <TextPromptDialog
                    isOpen={Boolean(releaseAssignmentItem)}
                    onClose={() => setReleaseAssignmentItem(null)}
                    onConfirm={returnToPool}
                    title={t('taskScope.releaseTitle')}
                    message={t('taskScope.releaseDescription')}
                    label={t('taskScope.releaseReason')}
                    placeholder={t('taskScope.releasePlaceholder')}
                    confirmLabel={t('taskScope.releaseConfirm')}
                    cancelLabel={t('common.cancel')}
                    validationMessage={t('taskScope.releaseRequired')}
                    validate={(value) => value.length < 3 ? t('taskScope.releaseRequired') : ''}
                    inputProps={{ minLength: 3, maxLength: 1000 }}
                    isLoading={isReleasingAssignment}
                />
            </div>
        </div>
    );
};

const LoadingState = ({ label }) => (
    <div className="flex flex-col items-center gap-2 p-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--VIARA-line)] border-t-[var(--VIARA-accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--VIARA-muted)]">{label}</span>
    </div>
);

const EmptyState = ({ title, subtitle, action }) => (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] ring-1 ring-[var(--VIARA-line)]">
            <UserCheck size={24} />
        </div>
        <p className="text-sm font-semibold text-[var(--VIARA-ink)]">{title}</p>
        {subtitle && <p className="max-w-xs text-xs text-[var(--VIARA-muted)]">{subtitle}</p>}
        {action}
    </div>
);

const ActionButton = ({ icon: Icon, label, tone, disabled, onClick, solid = false }) => {
    const tones = {
        teal: solid
            ? 'bg-[var(--VIARA-accent)] text-white shadow-sm hover:brightness-110 active:scale-[0.98]'
            : 'bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] ring-1 ring-[var(--VIARA-line)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-ink)] dark:text-[var(--VIARA-accent)] dark:ring-slate-800',
        emerald: 'bg-[var(--VIARA-surface)] text-emerald-700 ring-1 ring-[var(--VIARA-line)] hover:bg-emerald-50 dark:text-emerald-400 dark:ring-slate-800',
        amber: 'bg-[var(--VIARA-surface)] text-amber-700 ring-1 ring-[var(--VIARA-line)] hover:bg-amber-50 dark:text-amber-400 dark:ring-slate-800',
        rose: solid
            ? 'bg-rose-600 text-white shadow-sm hover:brightness-110 active:scale-[0.98]'
            : 'bg-[var(--VIARA-surface)] text-rose-700 ring-1 ring-[var(--VIARA-line)] hover:bg-rose-50 dark:text-rose-400 dark:ring-slate-800',
        slate: 'bg-[var(--VIARA-surface)] text-slate-700 ring-1 ring-[var(--VIARA-line)] hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-800',
    };

    return (
        <button
            disabled={disabled}
            onClick={onClick}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold outline-none transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
        >
            <Icon size={14} strokeWidth={2.25} /> {label}
        </button>
    );
};

const NurseQueueCard = ({
    item,
    t,
    locale,
    isMoving,
    isClaiming,
    isReleasingAssignment,
    stockMovements,
    onRelease,
    onHold,
    onStartPrep,
    onConsume,
    onReady,
    onEditComplaint,
    onEditSafety,
    onClaim,
    onReturn,
    onRequestPaymentException,
    onCallPatient,
    isArabic,
    expanded,
    onToggleDetails
}) => {
    const acuity = ACUITY[item.priority] || ACUITY.Routine;
    const consumed = stockMovements?.filter((m) => m.reference_type === 'Exam' && m.reference_id === item.exam_id) || [];
    const consumedTotal = consumed.reduce((sum, movement) => sum + Number(movement.total_amount || (Math.abs(Number(movement.quantity_change || 0)) * Number(movement.unit_price || 0))), 0);
    const apptTime = formatAppointmentTime(item.start_time, locale);

    return (
        <article className={`relative overflow-hidden p-4 ${cardClass}`}>
            <span className={`absolute inset-y-0 start-0 w-1 ${acuity.bar} ${item.is_overdue ? 'animate-pulse' : ''}`} aria-hidden="true" />

            <div className="flex items-start justify-between gap-3 ps-2">
                <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-bold text-[var(--VIARA-ink)]">{item.patient_name || t('common.patientFallback')}</h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-medium tracking-wide text-[var(--VIARA-muted)] ltr-embed">{item.mrn}</span>
                        {apptTime && (
                            <span className="inline-flex items-center gap-1 rounded bg-[var(--VIARA-accent-soft)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--VIARA-accent)]">
                                <Calendar size={10} />
                                {apptTime}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${item.is_overdue ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-ink)] ring-[var(--VIARA-line)] dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'}`}>
                        <Clock size={12} />
                        {formatDuration(item.waiting_minutes || 0, locale)}
                    </span>
                    <button
                        type="button"
                        onClick={onToggleDetails}
                        aria-expanded={expanded}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-black text-[var(--VIARA-muted)] ring-1 ring-[var(--VIARA-line)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)] dark:text-slate-300 dark:ring-slate-800"
                    >
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {t(expanded ? 'nurse.hideDetails' : 'nurse.showDetails', { defaultValue: expanded ? 'Hide details' : 'Details' })}
                    </button>
                </div>
            </div>

            <div className="mt-3 rounded-xl bg-[var(--VIARA-surface-muted)] p-3 ps-2 ring-1 ring-[var(--VIARA-line)]">
                <p className="font-semibold text-[var(--VIARA-ink)]">{item.exam_type_name || item.modality_name}</p>
                <p className="mt-0.5 text-xs font-medium text-[var(--VIARA-muted)]">{item.modality_name}{item.body_part ? ` — ${item.body_part}` : ''}</p>

                <div className={`${expanded ? '' : 'hidden'} mt-2 text-xs font-medium text-[var(--VIARA-muted)]`}>
                    {item.technician_name ? `${t('nurse.tech')}: ${item.technician_name}` : t('nurse.noTech')} · {item.radiologist_name ? `${t('nurse.radiologist')}: ${item.radiologist_name}` : t('nurse.noRadiologist')}
                </div>

                <div className={`${expanded ? '' : 'hidden'} mt-2.5 flex flex-wrap gap-1.5`}>
                    <SafetyChecklistBadge type="Pregnancy" status={item.pregnancy_safety_status} onClick={item.is_assigned_to_me ? onEditSafety : undefined} t={t} />
                    <SafetyChecklistBadge type="Implant" status={item.implant_safety_status} onClick={item.is_assigned_to_me ? onEditSafety : undefined} t={t} />
                    <SafetyChecklistBadge type="Renal" status={item.renal_safety_status} onClick={item.is_assigned_to_me ? onEditSafety : undefined} t={t} />
                </div>

                {expanded && consumed.length > 0 && (
                    <div className="mt-2.5">
                        <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--VIARA-muted)]">{t('nurse.supplies')}</span><span className="font-mono text-[10px] font-black text-[var(--VIARA-accent)]" dir="ltr">{consumedTotal.toFixed(2)}</span></div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {consumed.map((m) => (
                                <span key={m.movement_id} className="inline-flex items-center rounded-md border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--VIARA-muted)]">
                                    {t('nurse.quantity', { name: m.item_name, count: Math.abs(m.quantity_change) })}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className={`${expanded ? '' : 'hidden'} mt-2.5 flex flex-wrap gap-1.5`}>
                    <QueuePill stage={item.queue_stage} t={t} />
                    <PriorityBadge priority={item.priority} label={t(`common.priority.${item.priority || 'Routine'}`, { defaultValue: item.priority || 'Routine' })} />
                    <AssignmentBadge status={item.assignment_status} t={t} />
                </div>
            </div>

            <div className={`${expanded ? '' : 'hidden'} mt-3 flex items-start gap-1.5 ps-2`}>
                <div className="flex-1 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 text-xs leading-relaxed text-[var(--VIARA-muted)]">
                    <span className="font-semibold uppercase tracking-wide text-[var(--VIARA-muted)] text-[10px]">{t('nurse.complaint')}</span>
                    <p className="mt-0.5">{item.clinical_indication || <span className="italic text-[var(--VIARA-muted)]">{t('nurse.notRecorded')}</span>}</p>
                </div>
                {item.is_assigned_to_me && (
                    <button
                        onClick={onEditComplaint}
                        className="mt-0.5 rounded-md p-1.5 text-[var(--VIARA-muted)] outline-none transition-colors hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),.2)]"
                        title={t('nurse.editComplaint')}
                    >
                        <Edit3 size={14} strokeWidth={2.25} />
                    </button>
                )}
            </div>

            {expanded && item.preparation_instructions && (
                <div className="mt-2.5 ms-2 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-1.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                    <span className="font-semibold">{t('nurse.instructions')}:</span> {item.preparation_instructions}
                </div>
            )}

            {item.is_on_hold && (
                <div className="mt-2.5 ms-2 inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50">
                    <PauseCircle size={13} /> {item.hold_reason || t('nurse.noHoldReason')}
                </div>
            )}

            <ClinicalPaymentExceptionNotice
                item={item}
                targetStage="Ready for Exam"
                isArabic={isArabic}
                canRequest={item.is_assigned_to_me}
                onRequest={onRequestPaymentException}
            />

            <div className="mt-3.5 flex flex-wrap gap-1.5 ps-2">
                {item.assignment_status === 'Unassigned' ? (
                    item.queue_stage === 'Prep Pending' ? (
                        <ActionButton icon={UserCheck} label={t('taskScope.accept')} tone="teal" solid disabled={isClaiming} onClick={onClaim} />
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {t('nurse.awaitingPrepStage', { defaultValue: 'بانتظار وصول الحالة للتمريض' })}
                        </span>
                    )
                ) : (
                    <>
                        {item.is_on_hold ? (
                            <ActionButton icon={PlayCircle} label={t('common.release')} tone="emerald" disabled={isMoving} onClick={onRelease} />
                        ) : (
                            <ActionButton icon={PauseCircle} label={t('common.hold')} tone="amber" disabled={isMoving} onClick={onHold} />
                        )}
                        {item.queue_stage === 'Prep Pending' && !item.task_started_at && (
                            <ActionButton icon={ClipboardList} label={t('nurse.startPrep')} tone="slate" disabled={isMoving || item.is_on_hold} onClick={onStartPrep} />
                        )}
                        {item.queue_stage === 'Prep Pending' && (
                            <ActionButton icon={Syringe} label={t('nurse.consumeSupplies')} tone="slate" disabled={item.is_on_hold || !item.task_started_at} onClick={onConsume} />
                        )}
                        <ActionButton icon={UserCheck} label={t('nurse.ready')} tone="teal" solid disabled={isMoving || item.is_on_hold || !item.task_started_at} onClick={onReady} />
                        <ActionButton icon={Users} label={t('taskScope.return')} tone="slate" disabled={isReleasingAssignment} onClick={onReturn} />
                        <ActionButton
                            icon={Printer}
                            label={t('common.printSticker', { defaultValue: 'Print Sticker' })}
                            tone="slate"
                            onClick={() => {
                                const copies = window.prompt(t('common.stickerCopiesPrompt'), t('common.stickerCopiesDefault'));
                                if (copies && parseInt(copies, 10) > 0) {
                                    window.open(`/print/sticker/${item.appointment_id}?copies=${parseInt(copies, 10)}`, '_blank');
                                }
                            }}
                        />
                        {onCallPatient && (
                            <button
                                type="button"
                                onClick={() => onCallPatient(item)}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 transition active:scale-95 shadow-2xs"
                                title={isArabic ? 'نداء المريض إلى غرفة التحضير على شاشات العرض' : 'Call patient to Preparation Room on display board'}
                                aria-label={isArabic ? 'نداء المريض إلى غرفة التحضير' : 'Call patient to Preparation Room'}
                            >
                                <Bell size={14} />
                            </button>
                        )}
                    </>
                )}
            </div>
        </article>
    );
};

const QueuePill = ({ stage, t }) => (
    <span className="inline-flex items-center rounded-md bg-[var(--VIARA-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--VIARA-accent)] ring-1 ring-[rgba(var(--VIARA-accent-rgb),.2)]">
        {t ? t(`common.stages.${stage}`, { defaultValue: stage }) : stage}
    </span>
);

const DetailBlock = ({ label, value }) => (
    <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 py-2.5">
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--VIARA-ink)]">{value}</p>
    </div>
);

const PriorityBadge = ({ priority = 'Routine', label = priority }) => {
    const acuity = ACUITY[priority] || ACUITY.Routine;
    return (
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${acuity.bg} ${acuity.text} ${acuity.ring}`}>
            {label}
        </span>
    );
};

const SAFETY_TONES = {
    Cleared: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50',
    'At Risk': 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50',
    Unknown: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50',
    'Not Applicable': 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-800',
};

const SafetyChecklistBadge = ({ type, status, onClick, t }) => (
    <button
        type="button"
        disabled={!onClick}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold outline-none transition-colors enabled:hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),.2)] disabled:cursor-default ${SAFETY_TONES[status] || SAFETY_TONES.Unknown} ${status === 'At Risk' ? 'animate-pulse' : ''}`}
    >
        {t ? t(`nurse.safety.${type}`, { defaultValue: type }) : type}: {t ? t(`nurse.safetyStatus.${status || 'Unknown'}`, { defaultValue: status || 'Unknown' }) : status || 'Unknown'}
    </button>
);

export default Nurse;
