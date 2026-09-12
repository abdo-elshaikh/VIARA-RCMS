import React, { useMemo, useState } from 'react';
import {
    CheckCircle2,
    PauseCircle,
    Play,
    PlayCircle,
    RefreshCcw,
    ScanLine,
    Timer,
    AlertTriangle,
    Inbox,
    Zap,
    Activity,
    Printer,
    Search,
    X,
    Filter,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    Clock,
    ArrowUpDown,
    RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    useClaimQueueTaskMutation,
    useGetQueueQuery,
    useReleaseQueueTaskAssignmentMutation,
    useTransitionQueueMutation,
    api
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import SafetyFormModal from '../components/clinical/SafetyFormModal';
import HoldReasonDialog from '../components/clinical/HoldReasonDialog';
import EditSafetyDialog from '../components/clinical/EditSafetyDialog';
import { formatDuration } from '../utils/dateFormat';
import PageHeader from '../components/ui/PageHeader';
import { TextPromptDialog } from '../components/ui';
import ClinicalTaskScope, { AssignmentBadge } from '../components/clinical/ClinicalTaskScope';
import ClinicalPaymentExceptionNotice from '../components/clinical/ClinicalPaymentExceptionNotice';
import useClinicalPaymentExceptionFlow from '../hooks/useClinicalPaymentExceptionFlow';

const cardClass = 'overflow-hidden rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-sm';

const ACUITY = {
    Emergency: { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', ring: 'ring-rose-200 dark:ring-rose-900/50', bg: 'bg-rose-50 dark:bg-rose-950/30', dot: 'bg-rose-500' },
    Urgent: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', ring: 'ring-amber-200 dark:ring-amber-900/50', bg: 'bg-amber-50 dark:bg-amber-950/30', dot: 'bg-amber-500' },
    Routine: { bar: 'bg-slate-300 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', ring: 'ring-slate-200 dark:ring-slate-800', bg: 'bg-slate-50 dark:bg-slate-900/50', dot: 'bg-slate-300 dark:bg-slate-600' },
};

const metricTones = {
    teal: { text: 'text-[var(--VIARA-accent)]', bg: 'bg-[var(--VIARA-accent-soft)]', ring: 'ring-[rgba(var(--VIARA-accent-rgb),.2)]' },
    blue: { text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40', ring: 'ring-blue-100 dark:ring-blue-900' },
    rose: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40', ring: 'ring-rose-100 dark:ring-rose-900' },
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

const PriorityBadge = ({ priority = 'Routine', t }) => {
    const acuity = ACUITY[priority] || ACUITY.Routine;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${acuity.bg} ${acuity.text} ${acuity.ring}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${acuity.dot}`} />
            {t ? t(`common.priority.${priority}`, { defaultValue: priority }) : priority}
        </span>
    );
};

const QueueStageTracker = ({ stage, t }) => {
    const order = ['Ready for Exam', 'In Exam', 'Reporting'];
    const idx = order.indexOf(stage);
    return (
        <div className="flex items-center gap-1">
            {order.map((s, i) => {
                const done = idx !== -1 && i <= idx;
                const isCurrent = i === idx;
                return (
                    <span
                        key={s}
                        title={t ? t(`common.stages.${s}`, { defaultValue: s }) : s}
                        className={`h-1.5 rounded-full transition-all ${isCurrent ? 'w-4 bg-[var(--VIARA-accent)]' : done ? 'w-1.5 bg-[var(--VIARA-accent-soft)]' : 'w-1.5 bg-[var(--VIARA-line)] dark:bg-slate-800'}`}
                    />
                );
            })}
        </div>
    );
};

const EmptyState = ({ icon: Icon = Inbox, title, subtitle, action }) => (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] ring-1 ring-[var(--VIARA-line)]">
            <Icon size={24} />
        </div>
        <p className="text-sm font-semibold text-[var(--VIARA-ink)]">{title}</p>
        {subtitle && <p className="max-w-xs text-xs text-[var(--VIARA-muted)]">{subtitle}</p>}
        {action}
    </div>
);

const PatientAvatar = ({ exam }) => (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${exam.is_overdue ? 'bg-rose-600' : 'bg-[var(--VIARA-accent)]'}`}>
        {(exam.patient_name || exam.mrn || 'P')[0]?.toUpperCase()}
    </span>
);

const ActionButton = ({ icon: Icon, label, tone, disabled, onClick, solid = false }) => {
    const tones = {
        teal: solid
            ? 'bg-[var(--VIARA-accent)] text-white shadow-sm hover:brightness-110 active:scale-[0.98]'
            : 'bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] ring-1 ring-[var(--VIARA-line)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-ink)] dark:text-[var(--VIARA-accent)] dark:ring-slate-800',
        blue: solid
            ? 'bg-blue-600 text-white shadow-sm hover:brightness-110 active:scale-[0.98]'
            : 'bg-[var(--VIARA-surface)] text-blue-700 ring-1 ring-[var(--VIARA-line)] hover:bg-blue-50 dark:text-blue-400 dark:ring-slate-800',
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

const Modality = () => {
    const { t, i18n } = useTranslation('clinicalQueues');
    const isRtl = i18n.language?.startsWith('ar');

    // Keep active work visible by default; users can explicitly narrow to today.
    const [dateMode, setDateMode] = useState('all'); // 'today' | 'all' | 'custom'
    const [customDate, setCustomDate] = useState(getTodayDateString);

    const activeQueryDate = useMemo(() => {
        if (dateMode === 'today') return getTodayDateString();
        if (dateMode === 'custom') return customDate;
        return undefined; // 'all' fetches all active items
    }, [dateMode, customDate]);

    const queueQuery = {
        station: 'Modality',
        limit: 100,
        ...(activeQueryDate ? { date: activeQueryDate } : {}),
    };

    const {
        data: queueResponse,
        isLoading,
        isFetching,
        refetch
    } = useGetQueueQuery(
        queueQuery,
        { pollingInterval: 15000 }
    );

    const [transitionQueue, { isLoading: isMoving }] = useTransitionQueueMutation();
    const [claimQueueTask, { isLoading: isClaiming }] = useClaimQueueTaskMutation();
    const [releaseAssignment, { isLoading: isReleasingAssignment }] = useReleaseQueueTaskAssignmentMutation();
    const [getTemplates] = api.endpoints.getSafetyTemplates.useLazyQuery();

    const [safetyExam, setSafetyExam] = useState(null);
    const [safetyTemplate, setSafetyTemplate] = useState(null);
    const [safetyStatusExam, setSafetyStatusExam] = useState(null);
    const [holdExam, setHoldExam] = useState(null);
    const [taskScope, setTaskScope] = useState('all');
    const [releaseAssignmentExam, setReleaseAssignmentExam] = useState(null);

    // Advanced Filters State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStage, setSelectedStage] = useState('all'); // 'all' | 'Ready for Exam' | 'In Exam' | 'On Hold' | 'Overdue'
    const [selectedPriority, setSelectedPriority] = useState('all'); // 'all' | 'Emergency' | 'Urgent' | 'Routine'
    const [selectedModality, setSelectedModality] = useState('all');
    const [selectedSafety, setSelectedSafety] = useState('all'); // 'all' | 'needs_attention' | 'cleared'
    const [sortBy, setSortBy] = useState('wait_desc'); // 'wait_desc' | 'wait_asc' | 'priority' | 'time'

    const activeExams = useMemo(() => queueResponse?.data || [], [queueResponse?.data]);
    const taskKpis = queueResponse?.kpis || {};
    const {
        requestTarget: paymentExceptionTarget,
        requestException: requestPaymentException,
        closeRequest: closePaymentExceptionRequest,
        submitException: submitPaymentException,
        isRequesting: isRequestingPaymentException,
    } = useClinicalPaymentExceptionFlow({
        items: activeExams,
        targetStage: 'In Exam',
        isArabic: isRtl,
        refetch,
    });

    // Available modalities dynamically extracted from current active exams
    const availableModalities = useMemo(() => {
        const set = new Set();
        activeExams.forEach((exam) => {
            if (exam.modality_name) set.add(exam.modality_name);
            else if (exam.modality_type) set.add(exam.modality_type);
        });
        return Array.from(set).sort();
    }, [activeExams]);

    // Scope filtering
    const visibleExams = useMemo(() => {
        if (taskScope === 'all') return activeExams;
        return activeExams.filter((exam) =>
            taskScope === 'available'
                ? exam.assignment_status === 'Unassigned'
                : exam.is_assigned_to_me
        );
    }, [activeExams, taskScope]);

    // Multi-dimensional filtering and sorting
    const filteredExams = useMemo(() => {
        let result = visibleExams;

        // Search query
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter((exam) => {
                const name = (exam.patient_name || '').toLowerCase();
                const mrn = (exam.mrn || '').toLowerCase();
                const order = (exam.order_number || '').toLowerCase();
                const type = (exam.exam_type_name || '').toLowerCase();
                const mod = (exam.modality_name || '').toLowerCase();
                return name.includes(q) || mrn.includes(q) || order.includes(q) || type.includes(q) || mod.includes(q);
            });
        }

        // Stage filter
        if (selectedStage !== 'all') {
            if (selectedStage === 'On Hold') {
                result = result.filter((exam) => exam.is_on_hold);
            } else if (selectedStage === 'Overdue') {
                result = result.filter((exam) => exam.is_overdue);
            } else {
                result = result.filter((exam) => exam.queue_stage === selectedStage);
            }
        }

        // Priority filter
        if (selectedPriority !== 'all') {
            result = result.filter((exam) => exam.priority === selectedPriority);
        }

        // Modality filter
        if (selectedModality !== 'all') {
            result = result.filter((exam) =>
                exam.modality_name === selectedModality || exam.modality_type === selectedModality
            );
        }

        // Safety filter
        if (selectedSafety !== 'all') {
            result = result.filter((exam) => {
                const statuses = [exam.pregnancy_safety_status, exam.implant_safety_status, exam.renal_safety_status];
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
    }, [visibleExams, searchQuery, selectedStage, selectedPriority, selectedModality, selectedSafety, sortBy]);

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

    const handleShiftDate = (days) => {
        setDateMode('custom');
        setCustomDate((prev) => shiftDateInput(prev || getTodayDateString(), days));
    };

    const summary = useMemo(() => ({
        ready: activeExams.filter((exam) => exam.is_assigned_to_me && exam.queue_stage === 'Ready for Exam').length,
        scanning: Number(taskKpis.inProgress || 0),
        overdue: activeExams.filter((exam) => exam.is_assigned_to_me && exam.is_overdue).length,
    }), [activeExams, taskKpis.inProgress]);

    const claim = async (exam) => {
        try {
            await claimQueueTask(exam.exam_id).unwrap();
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
            await releaseAssignment({ examId: releaseAssignmentExam.exam_id, reason }).unwrap();
            toast.success(t('taskScope.released'));
            setReleaseAssignmentExam(null);
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('common.updateFailed')));
            return false;
        }
    };

    const move = async (exam, payload) => {
        if (payload.toStage === 'In Exam') {
            const safetyCleared = [
                exam.pregnancy_safety_status,
                exam.implant_safety_status,
                exam.renal_safety_status,
            ].every((status) => ['Cleared', 'Not Applicable'].includes(status));
            if (exam.priority !== 'Emergency' && !safetyCleared) {
                setSafetyStatusExam(exam);
                return;
            }

            if (!exam.modality_id) {
                toast.error(t('modality.modalityMissing', { defaultValue: 'This exam is not linked to a modality. Refresh the queue or correct the appointment before starting.' }));
                return;
            }

            try {
                const templates = await getTemplates(exam.modality_id).unwrap();
                if (templates && templates.length > 0) {
                    setSafetyTemplate(templates[0]);
                    setSafetyExam(exam);
                    return;
                }
            } catch (err) {
                console.error(t('modality.templateError', { defaultValue: 'Failed to fetch safety templates' }), err);
                toast.error(t('modality.templateError', { defaultValue: 'Safety requirements could not be loaded.' }));
                return;
            }
        }
        return executeTransition(exam, payload);
    };

    const executeTransition = async (exam, payload) => {
        try {
            await transitionQueue({ examId: exam.exam_id, ...payload }).unwrap();
            toast.success(payload.action === 'update_safety'
                ? t('modality.safetyUpdated', { defaultValue: 'Safety checks updated.' })
                : payload.action === 'hold'
                    ? t('common.held')
                    : payload.action === 'release'
                        ? t('common.released')
                        : t('common.moved', { stage: t(`common.stages.${payload.toStage}`, { defaultValue: payload.toStage }) }));
            return true;
        } catch (error) {
            const errorCode = error?.data?.code || error?.data?.details?.code;
            if (errorCode === 'PARTIAL_PAYMENT_EXCEPTION_REQUIRED') {
                requestPaymentException(exam);
                toast(isRtl
                    ? 'تحتاج هذه الحالة إلى اعتماد استثناء مالي قبل بدء الفحص.'
                    : 'This case needs a financial exception approval before the exam can start.', { icon: '🛡️' });
                return false;
            }
            toast.error(getErrorMessage(error, t('common.updateFailed')));
            return false;
        }
    };

    return (
        <div className="app-page">
            <div className="mx-auto max-w-screen-2xl pb-0">
                <PageHeader
                    icon={ScanLine}
                    eyebrow={t('modality.eyebrow')}
                    title={t('modality.title')}
                    description={t('modality.description')}
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
                                className="group inline-flex items-center gap-2 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--VIARA-ink)] outline-none transition hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),.2)]"
                                title={t('filters.refreshQueue', { defaultValue: 'Refresh queue' })}
                            >
                                <RefreshCcw size={15} className={`transition-transform duration-500 ${isFetching ? 'animate-spin' : 'group-hover:rotate-180'}`} />
                                <span className="hidden sm:inline">{t('common.refresh')}</span>
                            </button>
                        </div>
                    }
                    metrics={[
                        { key: 'ready', icon: Zap, label: t('modality.ready'), value: summary.ready, tone: 'teal', loading: isLoading },
                        { key: 'exam', icon: Activity, label: t('modality.inExam'), value: summary.scanning, tone: 'blue', loading: isLoading },
                        { key: 'overdue', icon: AlertTriangle, label: t('modality.overdue'), value: summary.overdue, tone: summary.overdue ? 'rose' : 'emerald', loading: isLoading },
                    ]}
                    metricsLabel={t('modality.metricsLabel', { defaultValue: 'Modality queue record indicators' })}
                />
            </div>

            <div className="mx-auto max-w-screen-2xl space-y-4">
                {/* Modern Clinical Filter Bar */}
                <section className={`${cardClass} p-3.5 sm:p-4 space-y-3.5`}>
                    {/* First Row: Date Mode & Quick Search */}
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* Date Navigation & Today's Cases Selector */}
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

                    {/* Second Row: Stage Tabs & Secondary Dropdowns */}
                    <div className="flex flex-col gap-3 border-t border-[var(--VIARA-line)] pt-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* Modality Workflow Stage Tabs */}
                        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                            {[
                                { id: 'all', label: t('filters.stageAll', { defaultValue: 'All Stages' }) },
                                { id: 'Ready for Exam', label: t('common.stages.Ready for Exam', { defaultValue: 'Ready for exam' }) },
                                { id: 'In Exam', label: t('common.stages.In Exam', { defaultValue: 'In exam' }) },
                                { id: 'On Hold', label: t('common.onHold', { defaultValue: 'On hold' }) },
                                { id: 'Overdue', label: t('modality.overdue', { defaultValue: 'Overdue' }) },
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

                        {/* Dropdown Filters & Sorting */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Priority Selector */}
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

                            {/* Modality Scanner Filter */}
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

                            {/* Reset Button */}
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
                                count: filteredExams.length,
                                total: activeExams.length,
                                defaultValue: `Showing ${filteredExams.length} of ${activeExams.length} cases`
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

                {/* Queue List Table / Cards */}
                <section className={cardClass}>
                    <div className="flex items-center justify-between border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/55 px-5 py-3.5">
                        <div className="flex items-center gap-2">
                            <ScanLine size={15} className="text-[var(--VIARA-muted)]" />
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--VIARA-ink)]">
                                {t('modality.assigned', { defaultValue: 'Assigned Modality Queue' })}
                            </h2>
                        </div>
                        <div className="rounded-md bg-[var(--VIARA-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--VIARA-ink)]">
                            <span className="tabular-nums">{filteredExams.length}</span>{' '}
                            <span className="font-medium opacity-70">{t('common.active', { count: filteredExams.length, defaultValue: 'Active' })}</span>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="space-y-3 p-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--VIARA-surface-muted)]" />
                            ))}
                        </div>
                    ) : filteredExams.length === 0 ? (
                        <EmptyState
                            icon={Inbox}
                            title={hasActiveFilters ? t('filters.noMatchTitle', { defaultValue: 'No matching cases' }) : t(`taskScope.${taskScope === 'all' ? 'allEmpty' : taskScope === 'mine' ? 'myEmpty' : 'availableEmpty'}`)}
                            subtitle={hasActiveFilters ? t('filters.noMatchDescription', { defaultValue: 'No cases match your filters.' }) : taskScope === 'mine' ? t('modality.emptyDescription') : undefined}
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
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden overflow-x-auto md:block">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/55">
                                            <th className="w-[180px] px-5 py-3.5 text-start text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('common.stage')}</th>
                                            <th className="px-5 py-3.5 text-start text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('common.patient')}</th>
                                            <th className="px-5 py-3.5 text-start text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('common.modality')}</th>
                                            <th className="px-5 py-3.5 text-start text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('common.wait')}</th>
                                            <th className="px-5 py-3.5 text-end text-xs font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--VIARA-line)]">
                                        {filteredExams.map((exam) => {
                                            const acuity = ACUITY[exam.priority] || ACUITY.Routine;
                                            const apptTime = formatAppointmentTime(exam.start_time, i18n.language);

                                            return (
                                                <tr key={exam.exam_id} className="group relative align-top transition-colors hover:bg-[var(--VIARA-surface-hover)]">
                                                    <td className="relative px-5 py-4">
                                                        <span className={`absolute inset-y-2 start-0 w-1 rounded-full ${acuity.bar} ${exam.is_overdue ? 'animate-pulse' : ''}`} aria-hidden="true" />
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--VIARA-muted)]">
                                                            {t(`common.stages.${exam.queue_stage}`, { defaultValue: exam.queue_stage })}
                                                        </span>
                                                        <div className="mt-2">
                                                            <QueueStageTracker stage={exam.queue_stage} t={t} />
                                                        </div>
                                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                                            <PriorityBadge priority={exam.priority} t={t} />
                                                            <AssignmentBadge status={exam.assignment_status} t={t} />
                                                            {exam.is_on_hold && (
                                                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/50">
                                                                    <PauseCircle size={11} /> {t('common.onHold')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <PatientAvatar exam={exam} />
                                                            <div className="min-w-0">
                                                                <div className="truncate font-semibold text-[var(--VIARA-ink)]">{exam.patient_name || t('common.patientFallback')}</div>
                                                                <div className="mt-0.5 font-mono text-[11px] font-medium text-[var(--VIARA-muted)] ltr-embed">{exam.mrn}</div>
                                                                <div className="mt-0.5 flex items-center gap-2">
                                                                    {exam.order_number && (
                                                                        <span className="font-mono text-[10px] text-[var(--VIARA-muted)] ltr-embed">{exam.order_number}</span>
                                                                    )}
                                                                    {apptTime && (
                                                                        <span className="inline-flex items-center gap-1 rounded bg-[var(--VIARA-accent-soft)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--VIARA-accent)]">
                                                                            <Calendar size={10} />
                                                                            {apptTime}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="max-w-xs px-5 py-4">
                                                        <div className="font-semibold text-[var(--VIARA-ink)]">{exam.modality_name}</div>
                                                        <div className="mt-0.5 text-xs font-medium text-[var(--VIARA-muted)]">{exam.exam_type_name || exam.modality_type || t('common.unknownModality')}{exam.body_part ? ` — ${exam.body_part}` : ''}</div>
                                                        {exam.clinical_indication && (
                                                            <div className="mt-2 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-2 text-xs leading-relaxed text-[var(--VIARA-muted)]">
                                                                <span className="font-semibold text-[var(--VIARA-ink)]">{t('modality.indication', { defaultValue: 'Indication' })}:</span> {exam.clinical_indication}
                                                            </div>
                                                        )}
                                                         {exam.is_on_hold && exam.hold_reason && (
                                                             <div className="mt-1.5 rounded-lg border border-amber-100 bg-amber-50/70 p-2 text-[11px] font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                                                                 <span className="font-semibold">{t('common.onHold')}:</span> {exam.hold_reason}
                                                             </div>
                                                         )}
                                                        <ClinicalPaymentExceptionNotice
                                                            item={exam}
                                                            targetStage="In Exam"
                                                            isArabic={isRtl}
                                                            canRequest={exam.is_assigned_to_me}
                                                            onRequest={requestPaymentException}
                                                        />
                                                     </td>
                                                    <td className="px-5 py-4">
                                                        <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${exam.is_overdue ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] ring-[var(--VIARA-line)] dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'}`}>
                                                            <Timer size={12} />
                                                            {formatDuration(exam.waiting_minutes || 0, i18n.language)}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 text-end">
                                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                                                            {exam.assignment_status === 'Unassigned' ? (
                                                                <ActionButton icon={Inbox} label={t('taskScope.accept')} tone="teal" solid disabled={isClaiming} onClick={() => claim(exam)} />
                                                            ) : (
                                                                <>
                                                                    {exam.is_on_hold ? (
                                                                        <ActionButton icon={PlayCircle} label={t('common.release')} tone="emerald" disabled={isMoving} onClick={() => move(exam, { action: 'release' })} />
                                                                    ) : (
                                                                        <ActionButton icon={PauseCircle} label={t('common.hold')} tone="amber" disabled={isMoving} onClick={() => setHoldExam(exam)} />
                                                                    )}
                                                                    {exam.queue_stage === 'Ready for Exam' && (
                                                                        <ActionButton icon={Play} label={t('modality.start')} tone="teal" solid disabled={isMoving || exam.is_on_hold} onClick={() => move(exam, { toStage: 'In Exam' })} />
                                                                    )}
                                                                    {exam.queue_stage === 'In Exam' && (
                                                                        <ActionButton icon={CheckCircle2} label={t('modality.complete')} tone="blue" solid disabled={isMoving || exam.is_on_hold} onClick={() => move(exam, { toStage: 'Reporting' })} />
                                                                    )}
                                                                    <ActionButton icon={Inbox} label={t('taskScope.return')} tone="slate" disabled={isReleasingAssignment} onClick={() => setReleaseAssignmentExam(exam)} />
                                                                    <ActionButton
                                                                        icon={Printer}
                                                                        label={t('common.printSticker', { defaultValue: 'Print Sticker' })}
                                                                        tone="slate"
                                                                        onClick={() => {
                                                                            const copies = window.prompt(t('common.stickerCopiesPrompt'), t('common.stickerCopiesDefault'));
                                                                            if (copies && parseInt(copies, 10) > 0) {
                                                                                window.open(`/print/sticker/${exam.appointment_id}?copies=${parseInt(copies, 10)}`, '_blank');
                                                                            }
                                                                        }}
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile View */}
                            <div className="divide-y divide-[var(--VIARA-line)] md:hidden">
                                {filteredExams.map((exam) => (
                                    <ModalityQueueCard
                                        key={exam.exam_id}
                                        exam={exam}
                                        t={t}
                                        locale={i18n.language}
                                        isMoving={isMoving}
                                        onRelease={() => move(exam, { action: 'release' })}
                                        onHold={() => setHoldExam(exam)}
                                        onStart={() => move(exam, { toStage: 'In Exam' })}
                                        onComplete={() => move(exam, { toStage: 'Reporting' })}
                                        onClaim={() => claim(exam)}
                                        onReturn={() => setReleaseAssignmentExam(exam)}
                                        onRequestPaymentException={() => requestPaymentException(exam)}
                                        isArabic={isRtl}
                                        isClaiming={isClaiming}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </section>
            </div>

            {/* Modals & Dialogs */}
            <SafetyFormModal
                isOpen={!!safetyExam}
                onClose={() => { setSafetyExam(null); setSafetyTemplate(null); }}
                examId={safetyExam?.exam_id}
                template={safetyTemplate}
                onComplete={async () => {
                    const transitioned = await executeTransition(safetyExam, { toStage: 'In Exam' });
                    if (!transitioned) return false;
                    setSafetyExam(null);
                    setSafetyTemplate(null);
                    return true;
                }}
            />

            <EditSafetyDialog
                isOpen={Boolean(safetyStatusExam)}
                patientName={safetyStatusExam?.patient_name}
                initialSafety={{
                    pregnancy: safetyStatusExam?.pregnancy_safety_status,
                    implant: safetyStatusExam?.implant_safety_status,
                    renal: safetyStatusExam?.renal_safety_status,
                }}
                isSaving={isMoving}
                onClose={() => setSafetyStatusExam(null)}
                onConfirm={async (safety) => {
                    const safetyCleared = [safety.pregnancy, safety.implant, safety.renal]
                        .every((status) => ['Cleared', 'Not Applicable'].includes(status));
                    if (!safetyCleared) {
                        toast.error(t('modality.safetyClearanceRequired', { defaultValue: 'Clear or mark every safety check as not applicable before starting the exam.' }));
                        return;
                    }

                    const exam = safetyStatusExam;
                    const saved = await executeTransition(exam, {
                        action: 'update_safety',
                        pregnancySafetyStatus: safety.pregnancy,
                        implantSafetyStatus: safety.implant,
                        renalSafetyStatus: safety.renal,
                    });
                    if (!saved) return;

                    setSafetyStatusExam(null);
                    await move({
                        ...exam,
                        pregnancy_safety_status: safety.pregnancy,
                        implant_safety_status: safety.implant,
                        renal_safety_status: safety.renal,
                    }, { toStage: 'In Exam' });
                }}
            />

            <HoldReasonDialog
                isOpen={Boolean(holdExam)}
                patientName={holdExam?.patient_name}
                isSaving={isMoving}
                onClose={() => setHoldExam(null)}
                onConfirm={async (reason) => {
                    const succeeded = await executeTransition(holdExam, { action: 'hold', reason });
                    if (succeeded) setHoldExam(null);
                }}
            />

            <TextPromptDialog
                isOpen={Boolean(paymentExceptionTarget)}
                onClose={closePaymentExceptionRequest}
                onConfirm={submitPaymentException}
                title={isRtl ? 'طلب استثناء مالي لبدء الفحص' : 'Request financial exception'}
                message={isRtl
                    ? `سيُرسل الطلب لاعتماد بدء فحص ${paymentExceptionTarget?.patient_name || 'الحالة'}. الفاتورة: ${paymentExceptionTarget?.invoice_number || '—'}`
                    : `This requests approval to start the exam for ${paymentExceptionTarget?.patient_name || 'the patient'}. Invoice: ${paymentExceptionTarget?.invoice_number || '—'}`}
                label={isRtl ? 'سبب بدء الفحص قبل استكمال السداد' : 'Reason for starting before full payment'}
                placeholder={isRtl ? 'اكتب سببًا واضحًا للمراجع المالي...' : 'Enter a clear reason for the financial reviewer...'}
                confirmLabel={isRtl ? 'إرسال الطلب' : 'Send request'}
                cancelLabel={t('common.cancel')}
                validationMessage={isRtl ? 'يرجى كتابة سبب لا يقل عن 5 أحرف' : 'Please enter at least 5 characters'}
                validate={(value) => value.length < 5 ? (isRtl ? 'يرجى كتابة سبب لا يقل عن 5 أحرف' : 'Please enter at least 5 characters') : ''}
                inputProps={{ minLength: 5, maxLength: 1000 }}
                isLoading={isRequestingPaymentException}
            />

            <TextPromptDialog
                isOpen={Boolean(releaseAssignmentExam)}
                onClose={() => setReleaseAssignmentExam(null)}
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
    );
};

const ModalityQueueCard = ({ exam, t, locale, isMoving, isClaiming, onRelease, onHold, onStart, onComplete, onClaim, onReturn, onRequestPaymentException, isArabic }) => {
    const acuity = ACUITY[exam.priority] || ACUITY.Routine;
    const apptTime = formatAppointmentTime(exam.start_time, locale);

    return (
        <article className={`relative overflow-hidden p-4 ${cardClass}`}>
            <span className={`absolute inset-y-0 start-0 w-1 ${acuity.bar} ${exam.is_overdue ? 'animate-pulse' : ''}`} aria-hidden="true" />

            <div className="flex items-start justify-between gap-3 ps-2">
                <div className="flex min-w-0 items-center gap-3">
                    <PatientAvatar exam={exam} />
                    <div className="min-w-0">
                        <h2 className="truncate text-[15px] font-bold text-[var(--VIARA-ink)]">{exam.patient_name || t('common.patientFallback')}</h2>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] font-medium text-[var(--VIARA-muted)] ltr-embed">{exam.mrn}</span>
                            {apptTime && (
                                <span className="inline-flex items-center gap-1 rounded bg-[var(--VIARA-accent-soft)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--VIARA-accent)]">
                                    <Calendar size={10} />
                                    {apptTime}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${exam.is_overdue ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-ink)] ring-[var(--VIARA-line)] dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'}`}>
                    <Timer size={12} />
                    {formatDuration(exam.waiting_minutes || 0, locale)}
                </span>
            </div>

            <div className="mt-3 rounded-xl bg-[var(--VIARA-surface-muted)] p-3 ps-2 ring-1 ring-[var(--VIARA-line)]">
                <p className="font-semibold text-[var(--VIARA-ink)]">{exam.exam_type_name || exam.modality_type || t('common.unknownModality')}</p>
                <p className="mt-0.5 text-xs font-medium text-[var(--VIARA-muted)]">{exam.modality_name}{exam.body_part ? ` — ${exam.body_part}` : ''}</p>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--VIARA-line)] pt-3">
                    <QueueStageTracker stage={exam.queue_stage} t={t} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--VIARA-muted)]">
                        {t(`common.stages.${exam.queue_stage}`, { defaultValue: exam.queue_stage })}
                    </span>
                </div>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5 ps-2">
                <PriorityBadge priority={exam.priority} t={t} />
                <AssignmentBadge status={exam.assignment_status} t={t} />
                {exam.is_on_hold && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/50">
                        <PauseCircle size={11} /> {t('common.onHold')}
                    </span>
                )}
            </div>

            {exam.clinical_indication && (
                <div className="mt-2.5 ms-2 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-2.5 text-xs leading-relaxed text-[var(--VIARA-muted)]">
                    <span className="font-semibold text-[var(--VIARA-ink)]">{t('modality.indication', { defaultValue: 'Indication' })}:</span> {exam.clinical_indication}
                </div>
            )}

            {exam.is_on_hold && exam.hold_reason && (
                <div className="mt-2.5 ms-2 rounded-lg border border-amber-100 bg-amber-50/70 p-2.5 text-[11px] font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                    <span className="font-semibold">{t('common.onHold')}:</span> {exam.hold_reason}
                </div>
            )}

            <ClinicalPaymentExceptionNotice
                item={exam}
                targetStage="In Exam"
                isArabic={isArabic}
                canRequest={exam.is_assigned_to_me}
                onRequest={onRequestPaymentException}
            />

            <div className="mt-3.5 flex flex-wrap gap-2 ps-2">
                {exam.assignment_status === 'Unassigned' ? (
                    <button disabled={isClaiming} onClick={onClaim} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--VIARA-accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:brightness-110 disabled:opacity-40">
                        <Inbox size={14} /> {t('taskScope.accept')}
                    </button>
                ) : (
                    <>
                        {exam.is_on_hold ? (
                            <button disabled={isMoving} onClick={onRelease} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--VIARA-surface)] px-3 py-2.5 text-xs font-semibold text-emerald-700 ring-1 ring-[var(--VIARA-line)] transition-colors hover:bg-emerald-50 disabled:opacity-40 dark:bg-slate-900 dark:text-emerald-400 dark:ring-slate-800">
                                <PlayCircle size={14} /> {t('common.release')}
                            </button>
                        ) : (
                            <button disabled={isMoving} onClick={onHold} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--VIARA-surface)] px-3 py-2.5 text-xs font-semibold text-amber-700 ring-1 ring-[var(--VIARA-line)] transition-colors hover:bg-amber-50 disabled:opacity-40 dark:bg-slate-900 dark:text-amber-400 dark:ring-slate-800">
                                <PauseCircle size={14} /> {t('common.hold')}
                            </button>
                        )}
                        {exam.queue_stage === 'Ready for Exam' && (
                            <button disabled={isMoving || exam.is_on_hold} onClick={onStart} className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-[var(--VIARA-accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:brightness-110 disabled:opacity-40">
                                <Play size={14} /> {t('modality.start')}
                            </button>
                        )}
                        {exam.queue_stage === 'In Exam' && (
                            <button disabled={isMoving || exam.is_on_hold} onClick={onComplete} className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-40">
                                <CheckCircle2 size={14} /> {t('modality.complete')}
                            </button>
                        )}
                        <button disabled={isMoving} onClick={onReturn} className="flex items-center justify-center rounded-lg bg-[var(--VIARA-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--VIARA-muted)] ring-1 ring-[var(--VIARA-line)] transition-colors hover:text-[var(--VIARA-ink)] disabled:opacity-40">
                            {t('taskScope.return')}
                        </button>
                        <button
                            onClick={() => {
                                const copies = window.prompt(t('common.stickerCopiesPrompt'), t('common.stickerCopiesDefault'));
                                if (copies && parseInt(copies, 10) > 0) {
                                    window.open(`/print/sticker/${exam.appointment_id}?copies=${parseInt(copies, 10)}`, '_blank');
                                }
                            }}
                            className="flex items-center justify-center rounded-lg bg-[var(--VIARA-surface)] px-3 py-2.5 text-[var(--VIARA-muted)] ring-1 ring-[var(--VIARA-line)] transition-colors hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)] dark:bg-slate-900 dark:ring-slate-800"
                            title={t('common.printSticker', { defaultValue: 'Print Sticker' })}
                        >
                            <Printer size={14} />
                        </button>
                    </>
                )}
            </div>
        </article>
    );
};

export default Modality;
