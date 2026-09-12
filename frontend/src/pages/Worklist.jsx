import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowDownUp,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    Eye,
    FileText,
    FilterX,
    Gauge,
    Layers3,
    LayoutGrid,
    ListChecks,
    Loader2,
    LockKeyhole,
    Monitor,
    PenLine,
    Radio,
    RefreshCcw,
    Search,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Stethoscope,
    TimerReset,
    UserRound,
    Users,
    X,
    Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { PageHeader, Scheduler } from '../components/ui';
import { TextPromptDialog } from '../components/ui';
import Pagination from '../components/ui/Pagination';
import ClinicalTaskScope, { AssignmentBadge } from '../components/clinical/ClinicalTaskScope';
import { selectCurrentUser } from '../store/authSlice';
import {
    useGetAppointmentsQuery,
    useClaimQueueTaskMutation,
    useGetQueueQuery,
    useReleaseQueueTaskAssignmentMutation,
    useTransitionQueueMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import {
    getRange,
    shiftAnchorDate,
    toDateInput
} from '../utils/appointmentDates';
import { formatLocalizedDate } from '../utils/localizedDate';
import { formatDuration } from '../utils/dateFormat';
import { getPaginationState } from '../utils/pagination';
import { inputClass, primaryBtn, secondaryBtn } from '../utils/designTokens';

// ─── Role & Priority Config ─────────────────────────────────────────

const roleConfig = {
    Radiologist: { icon: Stethoscope, color: 'indigo', label: 'Radiologist' },
    Technician: { icon: Monitor, color: 'cyan', label: 'Technician' },
    Nurse: { icon: ShieldCheck, color: 'emerald', label: 'Nurse' },
    Admin: { icon: Activity, color: 'violet', label: 'Admin' }
};

const priorityRank = { Emergency: 0, Urgent: 1, Routine: 2 };

const focusModes = ['all', 'priority', 'ready', 'overdue', 'holds', 'safety', 'followUp'];

const roleReadyStages = {
    Radiologist: ['Reporting'],
    Technician: ['Ready for Exam', 'In Exam'],
    Nurse: ['Arrived', 'Payment Pending', 'Prep Pending'],
    Admin: ['Arrived', 'Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting'],
    Developer: ['Arrived', 'Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting']
};

const defaultStageOptions = [
    'Scheduled',
    'Registered',
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Reporting',
    'Finalized',
    'Delivered',
    'Cancelled'
];

// ─── Color System & Semantic Tokens ─────────────────────────────────

const priorityToneStyles = {
    Emergency: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20',
    Urgent: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20',
    Routine: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
};

const priorityPillSolid = {
    Emergency: 'bg-rose-600 text-white shadow-xs',
    Urgent: 'bg-amber-500 text-white shadow-xs',
    Routine: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
};

const stageStyles = {
    Scheduled: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300',
    Registered: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    Arrived: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    'Payment Pending': 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
    'Prep Pending': 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    'Ready for Exam': 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
    'In Exam': 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    Reporting: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    Finalized: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    Delivered: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
    Cancelled: 'border-rose-300/60 bg-rose-50 text-rose-500 line-through dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300'
};

const metricTones = {
    neutral: 'border-slate-200 bg-slate-50/70 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
};

// ─── Utilities ──────────────────────────────────────────────────────

const formatTime = (value, locale) =>
    formatLocalizedDate(value, locale, { hour: '2-digit', minute: '2-digit' });

const matchesSearch = (item, search) => {
    if (!search) return true;
    const text = [
        item.patient_name,
        item.mrn,
        item.order_number,
        item.exam_type_name,
        item.modality_name,
        item.modality_type,
        item.machine_name,
        item.body_part
    ].filter(Boolean).join(' ').toLowerCase();
    return text.includes(search);
};

const hasSafetyRisk = (item) => [
    item.pregnancy_safety_status,
    item.implant_safety_status,
    item.renal_safety_status
].some((value) => value === 'At Risk');

const isPriorityCase = (item) => ['Emergency', 'Urgent'].includes(item.priority);

const isReadyForRole = (item, role) => (roleReadyStages[role] || roleReadyStages.Admin).includes(item.queue_stage);

const riskScore = (item, role) => {
    let score = priorityRank[item.priority] === 0 ? 100 : priorityRank[item.priority] === 1 ? 70 : 30;
    if (item.is_overdue) score += 45;
    if (item.is_on_hold) score += 25;
    if (hasSafetyRisk(item)) score += 30;
    if (isReadyForRole(item, role)) score += 15;
    score += Math.min(Number(item.waiting_minutes || 0), 180) / 6;
    return score;
};

const formatCount = (value, locale) => new Intl.NumberFormat(locale).format(Number(value || 0));

// ─── Sub-Components ─────────────────────────────────────────────────

const Badge = React.memo(({ children, tone = 'neutral', className = '' }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${metricTones[tone]} ${className}`}>
        {children}
    </span>
));

const IconButton = React.memo(({ icon: Icon, label, onClick, disabled, tone = 'default' }) => {
    const base = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';
    const styles = {
        default: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
        danger: 'border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white dark:text-rose-400',
        primary: 'border-teal-500/30 bg-teal-500/10 text-teal-700 hover:bg-teal-600 hover:text-white dark:text-teal-300'
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className={`${base} ${styles[tone]}`}
        >
            <Icon size={15} strokeWidth={2} />
        </button>
    );
});

// ─── Safety Summary ─────────────────────────────────────────────────

const SafetySummary = React.memo(({ item, t }) => {
    const checks = [
        ['Pregnancy', item.pregnancy_safety_status],
        ['Implant', item.implant_safety_status],
        ['Renal', item.renal_safety_status]
    ];
    const risks = checks.filter(([, v]) => v === 'At Risk');

    if (!risks.length) {
        return (
            <Badge tone="success">
                <ShieldCheck size={12} strokeWidth={2.5} />
                <span>{t('roleCommand.safetyClear', { defaultValue: 'Safety Clear' })}</span>
            </Badge>
        );
    }

    return (
        <Badge tone="danger">
            <ShieldAlert size={12} strokeWidth={2.5} />
            <span>
                {t('roleCommand.safetyRisks', {
                    count: risks.length,
                    defaultValue: `${risks.length} Risk${risks.length > 1 ? 's' : ''}`
                })}
            </span>
        </Badge>
    );
});

// ─── Stage Tabs ─────────────────────────────────────────────────────

const StageTabs = React.memo(({ options, counts, value, onChange, t }) => {
    const total = Object.values(counts).reduce((s, c) => s + c, 0);

    return (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
                type="button"
                onClick={() => onChange('all')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-black transition-all ${
                    value === 'all'
                        ? 'border-slate-900 bg-slate-900 text-white shadow-xs dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-200/80 bg-white/90 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
            >
                <LayoutGrid size={14} />
                <span>{t('filters.all', { defaultValue: 'All Stages' })}</span>
                <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                    value === 'all'
                        ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                    {total}
                </span>
            </button>

            {options.map((stg) => {
                const count = counts[stg] || 0;
                const isActive = value === stg;
                return (
                    <button
                        key={stg}
                        type="button"
                        onClick={() => onChange(stg)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-black transition-all ${
                            isActive
                                ? 'border-teal-600 bg-teal-600 text-white shadow-xs dark:border-teal-500 dark:bg-teal-500 dark:text-slate-950'
                                : 'border-slate-200/80 bg-white/90 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                    >
                        <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-white' : 'bg-teal-500'}`} />
                        <span>{t(`roleCommand.stages.${stg}`, { defaultValue: stg })}</span>
                        {count > 0 && (
                            <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                                isActive
                                    ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
});

// ─── Focus Chips ────────────────────────────────────────────────────

const FocusChips = React.memo(({ value, onChange, counts, t }) => (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {focusModes.map((mode) => {
            const isActive = value === mode;
            const count = counts[mode] || 0;
            return (
                <button
                    key={mode}
                    type="button"
                    onClick={() => onChange(mode)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-extrabold transition-all ${
                        isActive
                            ? 'border-teal-600 bg-teal-600 text-white shadow-xs dark:border-teal-500 dark:bg-teal-500 dark:text-slate-950'
                            : 'border-slate-200/80 bg-white/90 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                >
                    <span>{t(`focus.${mode}`)}</span>
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                        isActive
                            ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                        {count}
                    </span>
                </button>
            );
        })}
    </div>
));

const DensityToggle = React.memo(({ value, onChange, t }) => (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50/80 p-1 dark:border-slate-800 dark:bg-slate-900/80">
        {['comfortable', 'compact'].map((mode) => (
            <button
                key={mode}
                type="button"
                onClick={() => onChange(mode)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    value === mode
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
                {t(`density.${mode}`)}
            </button>
        ))}
    </div>
));

// ─── Telemetry Insight Panel ────────────────────────────────────────

const QueueInsightPanel = React.memo(({ metrics, nextCase, locale, t, onOpen, onFocus, activeFocus, isArabic }) => {
    const metricItems = [
        { key: 'all', label: t('roleCommand.metrics.assigned'), value: formatCount(metrics.total, locale), icon: Activity, style: 'bg-teal-500/10 text-teal-700 ring-teal-500/20 dark:text-teal-300' },
        { key: 'priority', label: t('roleCommand.metrics.priority'), value: formatCount(metrics.priority, locale), icon: AlertTriangle, style: metrics.priority ? 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300' : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700' },
        { key: 'overdue', label: t('focus.overdue'), value: formatCount(metrics.overdue, locale), icon: TimerReset, style: metrics.overdue ? 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300' : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700' },
        { key: null, label: t('roleCommand.metrics.averageWait'), value: formatDuration(metrics.averageWait, locale), icon: Clock3, style: 'bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300' }
    ];

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90" aria-label={t('insights.title')}>
            <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(300px,.72fr)]">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4">
                    {metricItems.map(({ key, label, value, icon: Icon, style }) => {
                        const Component = key ? 'button' : 'div';
                        const active = key && activeFocus === key;
                        return (
                            <Component
                                key={label}
                                {...(key ? { type: 'button', onClick: () => onFocus(key), 'aria-pressed': active } : {})}
                                className={`flex min-w-0 items-center gap-3 border-b border-slate-200/70 p-4 text-start transition last:border-b-0 dark:border-slate-800 sm:[&:nth-child(odd)]:border-e sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:border-e lg:last:border-e-0 ${key ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''} ${active ? 'bg-teal-50/70 dark:bg-teal-950/20' : ''}`}
                            >
                                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${style}`}>
                                    <Icon size={17} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-[9px] font-black uppercase tracking-[.1em] text-slate-400 dark:text-slate-500">{label}</span>
                                    <span className="mt-0.5 block text-lg font-black tabular-nums text-slate-950 dark:text-white">{value}</span>
                                </span>
                            </Component>
                        );
                    })}
                </div>

                {nextCase ? (
                    <button
                        type="button"
                        onClick={() => onOpen(nextCase)}
                        className="group flex min-h-[84px] items-center justify-between gap-3 border-t border-teal-500/20 bg-gradient-to-br from-teal-50/90 via-emerald-50/50 to-white/90 p-4 text-start transition hover:bg-teal-50 dark:border-teal-500/20 dark:from-teal-950/40 dark:via-slate-900/80 dark:to-slate-900 xl:border-s xl:border-t-0"
                    >
                        <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.1em] text-teal-700 dark:text-teal-300">
                                <Zap size={13} className="animate-pulse" />
                                {t('insights.nextBest')}
                            </span>
                            <span className="mt-1 block truncate text-sm font-black text-slate-950 dark:text-white">{nextCase.patient_name || t('fallback.patient')}</span>
                            <span className="block truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">{nextCase.exam_type_name || nextCase.modality_name || t('fallback.unspecifiedExam')}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                            <span className={`rounded-lg border px-2 py-0.5 text-[9px] font-black ${priorityToneStyles[nextCase.priority] || priorityToneStyles.Routine}`}>
                                {t(`priorities.${nextCase.priority || 'Routine'}`)}
                            </span>
                            <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-600 text-white transition-transform group-hover:scale-105">
                                <ChevronRight size={16} className={isArabic ? 'rotate-180' : ''} />
                            </span>
                        </span>
                    </button>
                ) : (
                    <div className="flex min-h-[84px] items-center gap-3 border-t border-slate-200/70 p-4 text-slate-500 dark:border-slate-800 dark:text-slate-400 xl:border-s xl:border-t-0">
                        <CheckCircle2 size={18} className="text-emerald-500" />
                        <span className="text-xs font-bold">{t('insights.empty')}</span>
                    </div>
                )}
            </div>
        </section>
    );
});

const DataCell = React.memo(({ icon: Icon, label, value, alert = false }) => (
    <div className="min-w-0">
        <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
            <Icon size={12} strokeWidth={2} />
            <span>{label}</span>
        </p>
        <p className={`mt-0.5 truncate text-xs font-bold ${alert ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
            {value || '—'}
        </p>
    </div>
));

// ─── Patient Block ──────────────────────────────────────────────────

const PatientBlock = React.memo(({ item, t, onClick, compact = false, showExam = true }) => {
    return (
        <button
            type="button"
            onClick={onClick}
            className="-m-2 flex items-start gap-3 rounded-xl p-2 text-start transition-colors hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
        >
            <div className={`grid ${compact ? 'h-9 w-9' : 'h-11 w-11'} shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 font-black text-sm`}>
                <UserRound size={compact ? 17 : 20} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-black text-slate-900 dark:text-white">
                        {item.patient_name || t('fallback.patient')}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${priorityToneStyles[item.priority] || priorityToneStyles.Routine}`}>
                        {t(`priorities.${item.priority || 'Routine'}`)}
                    </span>
                    {item.is_follow_up && (
                        <span className="inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900/60">
                            {t('details.followUp', { defaultValue: 'Follow-up' })}
                        </span>
                    )}
                    {item.is_overdue && (
                        <span className="inline-flex rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60 animate-pulse">
                            {t('focus.overdue')}
                        </span>
                    )}
                </div>
                {showExam && (
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {item.exam_type_name || item.modality_name || t('fallback.unspecifiedExam')}
                    </p>
                )}
                <p className="mt-0.5 font-mono text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    MRN: {item.mrn || '—'} · #{item.order_number || item.exam_id}
                </p>
            </div>
        </button>
    );
});

// ─── Queue Table Row ────────────────────────────────────────────────

const QueueRow = React.memo(({
    item,
    role,
    locale,
    t,
    isMoving,
    isClaiming,
    isReleasingAssignment,
    onAdvance,
    onClaim,
    onReturn,
    onOpen,
    onViewCase,
    onNavigate,
    density = 'comfortable',
    index = 0,
    focused = false,
    isArabic
}) => {
    const nextAction = useMemo(() => {
        if (role === 'Nurse') {
            if (['Arrived', 'Payment Pending'].includes(item.queue_stage))
                return { stage: 'Prep Pending', label: t('roleCommand.actions.Prep Pending') };
            if (item.queue_stage === 'Prep Pending')
                return { stage: 'Ready for Exam', label: t('roleCommand.actions.Ready for Exam') };
        }
        if (role === 'Technician') {
            if (item.queue_stage === 'Ready for Exam')
                return { stage: 'In Exam', label: t('roleCommand.actions.In Exam') };
            if (item.queue_stage === 'In Exam')
                return { stage: 'Reporting', label: t('roleCommand.actions.Reporting') };
        }
        if (['Receptionist', 'Admin', 'Developer'].includes(role)) {
            if (item.queue_stage === 'Scheduled')
                return { stage: 'Arrived', label: t('roleCommand.actions.Arrived', { defaultValue: t('roleCommand.stages.Arrived') }) };
            if (item.queue_stage === 'Registered')
                return { stage: 'Scheduled', label: t('roleCommand.actions.Scheduled', { defaultValue: t('roleCommand.stages.Scheduled') }) };
        }
        return null;
    }, [role, item.queue_stage, t]);

    const canReport = role === 'Radiologist' && item.queue_stage === 'Reporting';
    const hasImages = Boolean(
        item.images_available === true ||
        item.has_images === true ||
        (Number(item.image_count) > 0) ||
        (item.pacs_status && !['No Images', 'Not Received', 'Pending', 'No Study', 'None'].includes(item.pacs_status))
    );
    const isCritical = item.priority === 'Emergency' || item.is_overdue;
    const isUrgent = item.priority === 'Urgent';
    const compact = density === 'compact';
    const rowPadding = compact ? 'px-4 py-2.5 ps-6' : 'px-5 py-4 ps-6';

    return (
        <article
            data-row-index={index}
            className={`group relative border-b border-slate-100 transition-colors hover:bg-slate-50/90 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                isCritical ? 'bg-rose-50/25 dark:bg-rose-950/15' : ''
            } ${focused ? 'bg-teal-50/50 ring-1 ring-inset ring-teal-500/40 dark:bg-teal-950/20' : ''}`}
        >
            {/* Priority acuity rail */}
            <div
                className={`absolute inset-y-2 start-1.5 w-1 rounded-full ${
                    isCritical ? 'bg-rose-500' : isUrgent ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
                }`}
            />

            <div className={rowPadding}>
                {/* Mobile: stacked layout */}
                <div className="flex flex-col gap-4 xl:hidden">
                    <PatientBlock item={item} t={t} onClick={() => onOpen(item)} compact={compact} />

                    <div className="grid grid-cols-2 gap-3">
                        <DataCell icon={Monitor} label={t('roleCommand.machine')} value={item.modality_name || item.modality_type || t('fallback.unassigned')} />
                        <DataCell icon={Clock3} label={t('roleCommand.scheduled')} value={formatTime(item.start_time, locale)} />
                        <DataCell icon={Activity} label={t('roleCommand.bodyPart')} value={item.body_part} />
                        <DataCell icon={TimerReset} label={t('roleCommand.waiting', { defaultValue: 'Waiting' })} value={formatDuration(item.waiting_minutes || 0, locale)} alert={item.is_overdue} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-xl border px-2.5 py-0.5 text-[10.5px] font-bold ${stageStyles[item.queue_stage] || stageStyles.Delivered}`}>
                            {t(`roleCommand.stages.${item.queue_stage}`, { defaultValue: item.queue_stage })}
                        </span>
                        <SafetySummary item={item} t={t} />
                        <AssignmentBadge status={item.assignment_status} t={t} />
                        {isReadyForRole(item, role) && (
                            <Badge tone="info">
                                <ClipboardCheck size={12} />
                                <span>{t('focus.ready')}</span>
                            </Badge>
                        )}
                        <div className="ms-auto flex items-center gap-1.5">
                            {item.assignment_status !== 'Unassigned' && item.exam_id && hasImages && (
                                <button
                                    type="button"
                                    onClick={() => onNavigate(`/pacs/viewer?examId=${item.exam_id}`)}
                                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 text-xs font-black text-sky-700 hover:bg-sky-500 hover:text-white dark:text-sky-300 transition shadow-xs"
                                    title={t('pacs.viewImages', { defaultValue: 'Open PACS DICOM Viewer' })}
                                >
                                    <Eye size={13} />
                                    <span>DICOM</span>
                                </button>
                            )}
                            {item.assignment_status !== 'Unassigned' && <button
                                type="button"
                                onClick={() => onViewCase(item)}
                                className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition"
                                    title={t('caseReports.row.viewCase', { defaultValue: 'Open Case Details' })}
                                >
                                    <Activity size={13} className="text-teal-600 dark:text-teal-400" />
                                    <span>{t('caseReports.row.caseFile')}</span>
                                </button>}
                            <IconButton icon={Eye} label={t('modal.details')} onClick={() => onOpen(item)} />
                            {item.assignment_status === 'Unassigned' ? (
                                <button
                                    type="button"
                                    disabled={isClaiming}
                                    onClick={() => onClaim(item)}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-black text-white shadow-xs transition hover:bg-amber-400 disabled:opacity-50"
                                >
                                    <UserRound size={13} />
                                    <span>{t('taskScope.accept')}</span>
                                </button>
                            ) : (nextAction || canReport) && (
                                <button
                                    type="button"
                                    disabled={isMoving || item.is_on_hold}
                                    onClick={() => (canReport ? onOpen(item, true) : onAdvance(item, nextAction.stage))}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 disabled:opacity-50"
                                >
                                    {canReport ? <PenLine size={13} /> : <ChevronRight size={14} className={isArabic ? 'rotate-180' : ''} />}
                                    <span>{canReport ? t('reporting.report') : nextAction.label}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {item.is_on_hold && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>{t('roleCommand.onHold', { defaultValue: 'On Hold' })}{item.hold_reason ? ` · ${item.hold_reason}` : ''}</span>
                        </div>
                    )}
                </div>

                {/* Desktop: clear patient, study, SLA, and action columns */}
                <div className="hidden xl:grid xl:grid-cols-[minmax(240px,1.05fr)_minmax(210px,.8fr)_minmax(240px,.9fr)_minmax(190px,.72fr)] xl:items-center xl:gap-4">
                    {/* Patient identity column */}
                    <PatientBlock item={item} t={t} onClick={() => onOpen(item)} compact={compact} showExam={false} />

                    {/* Study context column */}
                    <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                            {item.exam_type_name || item.modality_name || t('fallback.unspecifiedExam')}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            <Monitor size={11} className="shrink-0 text-teal-600 dark:text-teal-300" />
                            {item.modality_name || item.modality_type || t('fallback.unassigned')}
                            <span aria-hidden="true">·</span>
                            {item.body_part || t('fallback.unassigned')}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            <Clock3 size={11} />
                            {formatTime(item.start_time, locale)}
                        </p>
                    </div>

                    {/* Queue state and SLA column */}
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center rounded-xl border px-2.5 py-0.5 text-[10px] font-black ${stageStyles[item.queue_stage] || stageStyles.Delivered}`}>
                                {t(`roleCommand.stages.${item.queue_stage}`, { defaultValue: item.queue_stage })}
                            </span>
                            <SafetySummary item={item} t={t} />
                            <AssignmentBadge status={item.assignment_status} t={t} />
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[10px] font-bold">
                            <span className={`inline-flex items-center gap-1 ${item.is_overdue ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
                                <TimerReset size={11} />
                                {formatDuration(item.waiting_minutes || 0, locale)}
                            </span>
                            {isReadyForRole(item, role) && (
                                <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300">
                                    <ClipboardCheck size={11} />
                                    {t('focus.ready')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Focused actions column */}
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {item.assignment_status !== 'Unassigned' && item.exam_id && hasImages && (
                            <button
                                type="button"
                                onClick={() => onNavigate(`/pacs/viewer?examId=${item.exam_id}`)}
                                className="inline-flex h-8 items-center gap-1 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 text-xs font-black text-sky-700 hover:bg-sky-500 hover:text-white dark:text-sky-300 transition shadow-xs"
                                title={t('pacs.viewImages', { defaultValue: 'Open PACS DICOM Viewer' })}
                            >
                                <Eye size={13} />
                                <span>DICOM</span>
                            </button>
                        )}

                        {item.assignment_status !== 'Unassigned' && <IconButton icon={Activity} label={t('caseReports.row.viewCase')} onClick={() => onViewCase(item)} />}
                        <IconButton icon={Eye} label={t('modal.details')} onClick={() => onOpen(item)} />

                        {/* Primary Action Button (Report or Advance Stage) */}
                        {item.assignment_status === 'Unassigned' ? (
                            <button
                                type="button"
                                disabled={isClaiming}
                                onClick={() => onClaim(item)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-black text-white shadow-xs transition hover:bg-amber-400 disabled:opacity-50"
                            >
                                <UserRound size={13} />
                                <span>{t('taskScope.accept')}</span>
                            </button>
                        ) : <>
                        {(nextAction || canReport) && (
                            <button
                                type="button"
                                disabled={isMoving || item.is_on_hold}
                                onClick={() => (canReport ? onOpen(item, true) : onAdvance(item, nextAction.stage))}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 disabled:opacity-50"
                            >
                                {canReport ? <PenLine size={13} /> : <ChevronRight size={14} className={isArabic ? 'rotate-180' : ''} />}
                                <span>{canReport ? t('reporting.report') : nextAction.label}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={isReleasingAssignment}
                            onClick={() => onReturn(item)}
                            className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                            {t('taskScope.return')}
                        </button>
                        </>}
                    </div>
                </div>

                {/* On-hold banner (desktop) */}
                {item.is_on_hold && (
                    <div className="mt-3 hidden items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300 xl:flex">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>{t('roleCommand.onHold', { defaultValue: 'On Hold' })}{item.hold_reason ? ` · ${item.hold_reason}` : ''}</span>
                    </div>
                )}
            </div>
        </article>
    );
});

// ─── Queue Skeleton & Table Container ───────────────────────────────

const QueueSkeleton = () => (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="h-10 w-10 shrink-0 rounded-2xl bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="hidden lg:block h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="hidden lg:block h-8 w-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
            </div>
        ))}
    </section>
);

const QueueTable = React.memo((props) => (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        {/* Desktop Header */}
        <div className="hidden border-b border-slate-100 bg-slate-50/80 px-6 py-2.5 xl:grid xl:grid-cols-[minmax(240px,1.05fr)_minmax(210px,.8fr)_minmax(240px,.9fr)_minmax(190px,.72fr)] xl:gap-4 dark:border-slate-800 dark:bg-slate-950/40">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {props.t('table.patient')}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {props.t('table.study')}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {props.t('table.queueState')}
            </span>
            <span className="text-end text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {props.t('table.actions')}
            </span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {props.items.map((item, index) => (
                <QueueRow
                    key={item.exam_id}
                    item={item}
                    index={index}
                    focused={props.focusedRowIndex === index}
                    {...props}
                />
            ))}
        </div>
    </section>
));

// ─── Detail Slide-over Drawer ───────────────────────────────────────

const DetailSection = React.memo(({ title, icon: Icon, children, className = '' }) => (
    <section className={`rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 ${className}`}>
        {title && (
            <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                {Icon && <Icon size={15} className="text-teal-600 dark:text-teal-400" />}
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">{title}</h3>
            </div>
        )}
        <div>{children}</div>
    </section>
));

const DetailField = ({ label, value, highlight = false }) => (
    <div className="min-w-0 py-2">
        <p className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">{label}</p>
        <p className={`mt-0.5 break-words text-xs font-bold ${highlight ? 'text-teal-600 dark:text-teal-400' : 'text-slate-800 dark:text-slate-200'}`}>
            {value || '—'}
        </p>
    </div>
);

const DetailGroup = React.memo(({ title, icon, items }) => (
    <DetailSection title={title} icon={icon}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 divide-y divide-slate-100 sm:divide-y-0 dark:divide-slate-800">
            {items.map(([label, value, highlight]) => (
                <DetailField key={label} label={label} value={value} highlight={highlight} />
            ))}
        </div>
    </DetailSection>
));

const SummaryPill = React.memo(({ icon: Icon, label, value, tone = 'neutral' }) => (
    <div className={`flex items-center gap-2.5 rounded-xl border p-3 ${metricTones[tone]}`}>
        <Icon size={16} strokeWidth={2} className="shrink-0 opacity-80" />
        <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-wider opacity-70">{label}</p>
            <p className="mt-0.5 truncate text-xs font-black">{value || '—'}</p>
        </div>
    </div>
));

const AppointmentDetails = ({
    item,
    onClose,
    locale,
    t,
    isRtl,
    role,
    onNavigate,
    onViewCase,
    onAdvance,
    onOpenReport,
    isMoving
}) => {
    const [detailTab, setDetailTab] = useState('overview');

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && item) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [item, onClose]);

    if (!item) return null;

    const startTime = formatLocalizedDate(item.start_time, locale, { dateStyle: 'medium', timeStyle: 'short' });
    const endTime = formatLocalizedDate(item.end_time, locale, { dateStyle: 'medium', timeStyle: 'short' });
    const priorityLabel = t(`priorities.${item.priority || 'Routine'}`);
    const statusLabel = t(`statuses.${item.status}`, { defaultValue: item.status });
    const stageLabel = t(`roleCommand.stages.${item.queue_stage}`, { defaultValue: item.queue_stage });
    const priorityTone = item.priority === 'Emergency' ? 'danger' : item.priority === 'Urgent' ? 'warning' : 'neutral';

    const hasImages = Boolean(
        item.images_available === true ||
        item.has_images === true ||
        (Number(item.image_count) > 0) ||
        (item.pacs_status && !['No Images', 'Not Received', 'Pending', 'No Study', 'None'].includes(item.pacs_status))
    );

    const safetyChecks = [
        { label: t('drawer.safety.pregnancy'), status: item.pregnancy_safety_status },
        { label: t('drawer.safety.implant'), status: item.implant_safety_status },
        { label: t('drawer.safety.renal'), status: item.renal_safety_status }
    ];

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex justify-end"
            role="presentation"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity animate-in fade-in" />

            <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="detail-title"
                className={`relative h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl backdrop-blur-2xl dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800 flex flex-col ${
                    isRtl ? 'animate-in slide-in-from-left duration-250' : 'animate-in slide-in-from-right duration-250'
                }`}
            >
                {/* Header */}
                <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3.5">
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 font-black text-lg">
                                <UserRound size={22} />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                        {t('modal.details')}
                                    </span>
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.2 text-[9px] font-black uppercase ${priorityToneStyles[item.priority] || priorityToneStyles.Routine}`}>
                                        {priorityLabel}
                                    </span>
                                </div>
                                <h2 id="detail-title" className="mt-0.5 truncate text-lg font-black text-slate-900 dark:text-white">
                                    {item.patient_name || t('fallback.patient')}
                                </h2>
                                <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {item.exam_type_name || item.modality_name || t('fallback.unspecifiedExam')} · MRN: {item.mrn || '—'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Summary Pills Deck */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <SummaryPill icon={ShieldCheck} label={t('details.priority')} value={priorityLabel} tone={priorityTone} />
                        <SummaryPill icon={Activity} label={t('details.status')} value={statusLabel} tone="info" />
                        <SummaryPill icon={ListChecks} label={t('filters.stage')} value={stageLabel} />
                        <SummaryPill icon={TimerReset} label={t('overview.visible')} value={formatDuration(item.waiting_minutes || 0, locale)} tone={item.is_overdue ? 'danger' : 'neutral'} />
                    </div>

                    {/* Drawer Sub-Tabs */}
                    <div className="flex gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                        {[
                            { id: 'overview', label: t('drawer.tabs.overview'), icon: FileText },
                            { id: 'safety', label: t('drawer.tabs.safety'), icon: ShieldCheck },
                            { id: 'clinical', label: t('drawer.tabs.clinical'), icon: Stethoscope }
                        ].map((tab) => {
                            const Icon = tab.icon;
                            const isActive = detailTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setDetailTab(tab.id)}
                                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition-all ${
                                        isActive
                                            ? 'bg-teal-600 text-white shadow-xs'
                                            : 'border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <Icon size={13} />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </header>

                {/* Body Content */}
                <div className="flex-1 space-y-4 p-6 overflow-y-auto">
                    {item.is_on_hold && (
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-semibold text-amber-800 dark:text-amber-300">
                            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                            <span>{t('roleCommand.onHold', { defaultValue: 'On Hold' })}{item.hold_reason ? ` — ${item.hold_reason}` : ''}</span>
                        </div>
                    )}

                    {item.is_follow_up && (
                        <DetailSection title={t('details.followUpContext', { defaultValue: 'Follow-up Context' })} icon={Clock3}>
                            <div className="grid gap-2 text-xs sm:grid-cols-2">
                                <p className="font-bold text-slate-700 dark:text-slate-300">{item.prior_exam_type_name || t('details.priorStudy', { defaultValue: 'Prior study' })}</p>
                                <p className="font-mono text-[11px] text-slate-500 sm:text-end">{item.prior_order_number || item.prior_exam_id}</p>
                            </div>
                            {item.follow_up_reason && (
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                                    {item.follow_up_reason}
                                </p>
                            )}
                        </DetailSection>
                    )}

                    {detailTab === 'overview' && (
                        <div className="space-y-4">
                            <DetailGroup
                                title={t('details.order', { defaultValue: 'Order Information' })}
                                icon={FileText}
                                items={[
                                    [t('details.mrn'), item.mrn],
                                    [t('details.order'), item.order_number || item.appointment_id],
                                    [t('details.status'), statusLabel, true],
                                    [t('details.priority'), priorityLabel]
                                ]}
                            />

                            <DetailGroup
                                title={t('details.exam')}
                                icon={Monitor}
                                items={[
                                    [t('details.exam'), item.exam_type_name || item.modality_name],
                                    [t('details.machine'), item.machine_name || item.modality_name],
                                    [t('details.modality', { defaultValue: 'Modality' }), item.modality_type],
                                    [t('roleCommand.bodyPart'), item.body_part],
                                    [t('details.start'), startTime],
                                    [t('details.end'), endTime]
                                ]}
                            />
                        </div>
                    )}

                    {detailTab === 'safety' && (
                        <div className="space-y-4">
                            {/* Safety Checklist Deck */}
                            <DetailSection title={t('drawer.safety.title')} icon={ShieldCheck}>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {safetyChecks.map((chk) => {
                                        const isAtRisk = chk.status === 'At Risk';
                                        return (
                                            <div
                                                key={chk.label}
                                                className={`flex items-center gap-2 rounded-xl border p-3 ${
                                                    isAtRisk
                                                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                                }`}
                                            >
                                                {isAtRisk ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                                                <div>
                                                    <p className="text-[10px] font-black uppercase">{chk.label}</p>
                                                    <p className="text-xs font-bold">{isAtRisk ? t('drawer.safety.atRisk') : t('drawer.safety.clear')}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </DetailSection>

                            <DetailSection title={t('details.preparation')} icon={ClipboardCheck}>
                                <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                    {item.preparation_instructions || item.notes || t('drawer.emptyPreparation')}
                                </p>
                            </DetailSection>
                        </div>
                    )}

                    {detailTab === 'clinical' && (
                        <div className="space-y-4">
                            <DetailSection title={t('details.clinical')} icon={Stethoscope}>
                                <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                    {item.clinical_indication || t('drawer.emptyClinical')}
                                </p>
                            </DetailSection>

                            <DetailGroup
                                title={t('form.staff', { defaultValue: 'Care Team' })}
                                icon={Users}
                                items={[
                                    [t('form.radiologist'), item.radiologist_name],
                                    [t('form.technician'), item.technician_name],
                                    [t('form.nurse'), item.nurse_name],
                                    [t('details.preparation'), item.preparation_status]
                                ]}
                            />
                        </div>
                    )}
                </div>

                {/* Sticky Action Command Footer */}
                <footer className="sticky bottom-0 z-10 border-t border-slate-100 bg-white/95 p-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        {/* 1-Click DICOM Viewer (Only if images exist) */}
                        {item.assignment_status !== 'Unassigned' && item.exam_id && hasImages && onNavigate && (
                            <button
                                type="button"
                                onClick={() => onNavigate(`/pacs/viewer?examId=${item.exam_id}`)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-black text-sky-700 hover:bg-sky-500 hover:text-white dark:text-sky-300 transition shadow-xs"
                                title={t('pacs.viewImages', { defaultValue: 'Open PACS DICOM Viewer' })}
                            >
                                <Eye size={14} />
                                <span>DICOM</span>
                            </button>
                        )}

                        {/* View Full Case Details */}
                        {item.assignment_status !== 'Unassigned' && item.exam_id && onViewCase && (
                            <button
                                type="button"
                                onClick={() => onViewCase(item)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition"
                            >
                                <Activity size={14} className="text-teal-600 dark:text-teal-400" />
                                <span>{t('caseReports.row.caseFile')}</span>
                            </button>
                        )}

                        {/* Write / Edit Report Button */}
                        {item.assignment_status !== 'Unassigned' && item.exam_id && onOpenReport && (
                            <button
                                type="button"
                                onClick={() => onOpenReport(item, true)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-black text-white hover:bg-teal-500 shadow-xs transition"
                            >
                                <PenLine size={14} />
                                <span>{t('reporting.report')}</span>
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        {t('modal.close')}
                    </button>
                </footer>
            </aside>
        </div>,
        document.body
    );
};

// ─── Filter Select Component ────────────────────────────────────────

const FilterSelect = React.memo(({ label, value, onChange, options, t, translation }) => (
    <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {label}
        </span>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
            {options.map((opt) => (
                <option key={opt} value={opt}>
                    {opt === 'all'
                        ? t('filters.all', { defaultValue: 'All' })
                        : translation
                        ? t(`${translation}.${opt}`, { defaultValue: opt })
                        : opt}
                </option>
            ))}
        </select>
    </label>
));

// ─── Loading & Empty States ─────────────────────────────────────────

const LoadingState = React.memo(({ t }) => (
    <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <Loader2 size={32} className="animate-spin text-teal-600 dark:text-teal-400" />
        <p className="mt-4 text-sm font-bold text-slate-600 dark:text-slate-400">
            {t('calendar.loading', { defaultValue: 'Loading clinical workspace...' })}
        </p>
    </div>
));

const EmptyQueue = React.memo(({ role, t, hasFilters = false, onClearFilters, taskScope = 'mine' }) => (
    <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <div className={`grid h-16 w-16 place-items-center rounded-2xl border ${
            hasFilters
                ? 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        }`}>
            <CheckCircle2 size={30} strokeWidth={2} />
        </div>
        <p className="mt-4 text-base font-black text-slate-900 dark:text-white">
            {hasFilters
                ? t('roleCommand.noFilteredResults', { defaultValue: 'No matching cases' })
                : t(`taskScope.${taskScope === 'all' ? 'allEmpty' : taskScope === 'available' ? 'availableEmpty' : 'myEmpty'}`, {
                    defaultValue: t(`roleCommand.${role}.empty`, { defaultValue: t('reporting.empty') })
                })}
        </p>
        <p className="mt-1.5 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            {hasFilters
                ? t('roleCommand.noFilteredHelp', { defaultValue: 'Try adjusting or clearing your active filters.' })
                : t('roleCommand.emptyHelp')}
        </p>
        {hasFilters && onClearFilters && (
            <button
                type="button"
                onClick={onClearFilters}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
                <FilterX size={14} strokeWidth={2} />
                <span>{t('filters.clear')}</span>
            </button>
        )}
    </div>
));

// ─── Main Worklist View Tabs ────────────────────────────────────────

const ViewTabs = React.memo(({ tab, onChange, counts, t, role }) => {
    return (
        <div className="flex w-full overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-950/40 xl:w-auto">
            <button
                type="button"
                onClick={() => onChange('queue')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                    tab === 'queue'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
                <ListChecks size={15} />
                <span>{t(`roleCommand.${role}.title`, { defaultValue: 'Clinical Queue' })}</span>
                <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                    tab === 'queue' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                    {counts.queue}
                </span>
            </button>

            <button
                type="button"
                onClick={() => onChange('schedule')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                    tab === 'schedule'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
                <CalendarDays size={15} />
                <span>{t('filters.calendar', { defaultValue: 'Schedule & Calendar' })}</span>
                <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                    tab === 'schedule' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                    {counts.schedule}
                </span>
            </button>
        </div>
    );
});

// ─── Main Worklist Page ─────────────────────────────────────────────

const Worklist = () => {
    const { t, i18n } = useTranslation('worklist');
    const navigate = useNavigate();
    const user = useSelector(selectCurrentUser);

    const role = user?.role || 'Radiologist';
    const roleCfg = roleConfig[role] || roleConfig.Admin;
    const RoleIcon = roleCfg.icon;
    const isArabic = i18n.resolvedLanguage?.startsWith('ar') || i18n.language?.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-US';

    // View States
    const [tab, setTab] = useState('queue');
    const [viewMode, setViewMode] = useState('day');
    const [date, setDate] = useState(toDateInput());
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef(null);
    const [status, setStatus] = useState('all');
    const [priority, setPriority] = useState('all');
    const [modality, setModality] = useState('all');
    const [stage, setStage] = useState('all');
    const [focusMode, setFocusMode] = useState(role === 'Radiologist' ? 'ready' : 'all');
    const [sortMode, setSortMode] = useState('risk');
    const [density, setDensity] = useState('comfortable');
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState(null);
    const isClinicalTaskRole = ['Radiologist', 'Technician', 'Nurse'].includes(role);
    const [taskScope, setTaskScope] = useState('all');
    const [releaseAssignmentItem, setReleaseAssignmentItem] = useState(null);
    const canSwitchScope = ['Developer', 'Admin'].includes(role);
    const [allCenter, setAllCenter] = useState(canSwitchScope);
    const [focusedRowIndex, setFocusedRowIndex] = useState(-1);

    // Queue pagination
    const [queuePage, setQueuePage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Data fetching
    const effectiveRangeView = viewMode === 'agenda' ? 'week' : viewMode;
    const range = useMemo(() => getRange(date, effectiveRangeView), [date, effectiveRangeView]);

    const appointmentParams = viewMode === 'day'
        ? { date, assignedStaffId: (allCenter || ['Developer', 'Admin'].includes(role)) ? undefined : user?.user_id, limit: 500 }
        : { startDate: range.startDate, endDate: range.endDate, assignedStaffId: (allCenter || ['Developer', 'Admin'].includes(role)) ? undefined : user?.user_id, limit: 500 };

    const {
        data: appointments = [],
        isLoading: scheduleLoading,
        isError: scheduleError,
        refetch: refetchSchedule
    } = useGetAppointmentsQuery(appointmentParams, { pollingInterval: 60000 });

    const {
        data: queueResponse,
        isLoading: queueLoading,
        isError: queueError,
        refetch: refetchQueue
    } = useGetQueueQuery({ includeDelivered: 'false', limit: 500 }, { pollingInterval: 30000 });

    const [transitionQueue, { isLoading: isMoving }] = useTransitionQueueMutation();
    const [claimQueueTask, { isLoading: isClaiming }] = useClaimQueueTaskMutation();
    const [releaseAssignment, { isLoading: isReleasingAssignment }] = useReleaseQueueTaskAssignmentMutation();

    const queue = useMemo(() => queueResponse?.data || [], [queueResponse?.data]);
    const taskKpis = queueResponse?.kpis || {};
    const scopedQueue = useMemo(() => !isClinicalTaskRole || taskScope === 'all'
        ? queue
        : queue.filter((item) => taskScope === 'available'
            ? item.assignment_status === 'Unassigned'
            : item.is_assigned_to_me), [isClinicalTaskRole, queue, taskScope]);

    const queueWithScores = useMemo(
        () => scopedQueue.map((item) => ({ ...item, __riskScore: riskScore(item, role) })),
        [scopedQueue, role]
    );

    const normalizedSearch = debouncedSearch.trim().toLowerCase();

    const handleSearch = useCallback((event) => {
        const value = event.target.value;
        setSearch(value);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 180);
    }, []);

    // Derived Lists
    const modalities = useMemo(() => [
        ...new Set([
            ...appointments.map((i) => i.machine_name || i.modality_type),
            ...queue.map((i) => i.modality_name || i.modality_type)
        ].filter(Boolean))
    ].sort(), [appointments, queue]);

    const stageOptions = useMemo(() => [
        ...new Set([
            ...defaultStageOptions,
            ...queue.map((i) => i.queue_stage).filter(Boolean)
        ])
    ].filter((s) => queue.some((q) => q.queue_stage === s) || ['Scheduled', 'Registered', 'Arrived', 'Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting'].includes(s)), [queue]);

    const visibleAppointments = useMemo(() => appointments.filter((item) => {
        if (!matchesSearch(item, normalizedSearch)) return false;
        if (status !== 'all' && item.status !== status) return false;
        if (priority !== 'all' && (item.priority || 'Routine') !== priority) return false;
        return modality === 'all' || (item.machine_name || item.modality_type) === modality;
    }), [appointments, modality, normalizedSearch, priority, status]);

    const visibleQueue = useMemo(() => queueWithScores
        .filter((item) => {
            if (!matchesSearch(item, normalizedSearch)) return false;
            if (priority !== 'all' && (item.priority || 'Routine') !== priority) return false;
            if (stage !== 'all' && item.queue_stage !== stage) return false;
            if (focusMode === 'priority' && !isPriorityCase(item)) return false;
            if (focusMode === 'ready' && !isReadyForRole(item, role)) return false;
            if (focusMode === 'overdue' && !item.is_overdue) return false;
            if (focusMode === 'holds' && !item.is_on_hold) return false;
            if (focusMode === 'safety' && !hasSafetyRisk(item)) return false;
            if (focusMode === 'followUp' && !item.is_follow_up) return false;
            return modality === 'all' || (item.modality_name || item.modality_type) === modality;
        })
        .sort((a, b) => {
            if (sortMode === 'risk') return b.__riskScore - a.__riskScore;
            if (sortMode === 'wait') return Number(b.waiting_minutes || 0) - Number(a.waiting_minutes || 0);
            if (sortMode === 'time') return new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime();
            if (sortMode === 'newest') return new Date(b.created_at || b.start_time || 0).getTime() - new Date(a.created_at || a.start_time || 0).getTime();
            if (sortMode === 'patient') return String(a.patient_name || '').localeCompare(String(b.patient_name || ''), i18n.language);
            return (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3) || Number(b.waiting_minutes || 0) - Number(a.waiting_minutes || 0);
        }), [focusMode, i18n.language, modality, normalizedSearch, priority, queueWithScores, role, sortMode, stage]);

    const stageCounts = useMemo(() => queue.reduce((acc, item) => ({ ...acc, [item.queue_stage]: (acc[item.queue_stage] || 0) + 1 }), {}), [queue]);

    const focusCounts = useMemo(() => queue.reduce((acc, item) => {
        acc.all += 1;
        acc.priority += isPriorityCase(item) ? 1 : 0;
        acc.ready += isReadyForRole(item, role) ? 1 : 0;
        acc.overdue += item.is_overdue ? 1 : 0;
        acc.holds += item.is_on_hold ? 1 : 0;
        acc.safety += hasSafetyRisk(item) ? 1 : 0;
        acc.followUp += item.is_follow_up ? 1 : 0;
        return acc;
    }, { all: 0, priority: 0, ready: 0, overdue: 0, holds: 0, safety: 0, followUp: 0 }), [queue, role]);

    const queueMetrics = useMemo(() => {
        const waitTotal = queue.reduce((sum, item) => sum + Number(item.waiting_minutes || 0), 0);
        return {
            total: queue.length,
            visible: visibleQueue.length,
            priority: focusCounts.priority,
            ready: focusCounts.ready,
            overdue: focusCounts.overdue,
            holds: focusCounts.holds,
            safety: focusCounts.safety,
            averageWait: queue.length ? Math.round(waitTotal / queue.length) : 0
        };
    }, [focusCounts, queue, visibleQueue.length]);

    const nextBestCase = useMemo(() => [...visibleQueue].sort((a, b) => b.__riskScore - a.__riskScore)[0], [visibleQueue]);

    const hasFilters = Boolean(search || status !== 'all' || priority !== 'all' || modality !== 'all' || stage !== 'all' || focusMode !== 'all' || sortMode !== 'risk');
    const activeFilterCount = [
        search.trim(),
        status !== 'all',
        priority !== 'all',
        modality !== 'all',
        stage !== 'all',
        focusMode !== 'all',
        sortMode !== 'risk'
    ].filter(Boolean).length;

    // Reset queue page on filter/sort change
    useEffect(() => { setQueuePage(1); }, [normalizedSearch, priority, stage, focusMode, modality, sortMode, pageSize, taskScope]);
    useEffect(() => { setAllCenter(canSwitchScope); }, [canSwitchScope]);
    useEffect(() => { setFocusMode(role === 'Radiologist' ? 'ready' : 'all'); }, [role]);

    // Reset keyboard focus
    useEffect(() => { setFocusedRowIndex(-1); }, [queuePage]);

    const { pageCount: queuePageCount, startIndex: queueStart, endIndex: queueEnd } = useMemo(
        () => getPaginationState(visibleQueue.length, queuePage, pageSize),
        [visibleQueue.length, queuePage, pageSize]
    );
    const pagedQueue = useMemo(() => visibleQueue.slice(queueStart, queueEnd), [visibleQueue, queueStart, queueEnd]);

    // Actions
    const selectFocus = useCallback((mode) => {
        setFocusMode(mode);
        setStage('all');
    }, []);

    const selectStage = useCallback((nextStage) => {
        setStage(nextStage);
        if (nextStage !== 'all') setFocusMode('all');
    }, []);

    const clearFilters = useCallback(() => {
        setSearch('');
        setDebouncedSearch('');
        setStatus('all');
        setPriority('all');
        setModality('all');
        setStage('all');
        setFocusMode('all');
        setSortMode('risk');
    }, []);

    const refresh = useCallback(() => {
        refetchSchedule();
        refetchQueue();
    }, [refetchSchedule, refetchQueue]);

    const advance = useCallback(async (item, toStage) => {
        try {
            await transitionQueue({ examId: item.exam_id, toStage }).unwrap();
            toast.success(t('roleCommand.transitionSuccess', { stage: t(`roleCommand.stages.${toStage}`, { defaultValue: toStage }) }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('roleCommand.transitionError')));
        }
    }, [transitionQueue, t]);

    const claim = useCallback(async (item) => {
        try {
            await claimQueueTask(item.exam_id).unwrap();
            setTaskScope('mine');
            toast.success(t('taskScope.claimed'));
        } catch (error) {
            toast.error(error?.data?.code === 'TASK_ALREADY_ASSIGNED'
                ? t('taskScope.claimConflict')
                : getErrorMessage(error, t('roleCommand.transitionError')));
        }
    }, [claimQueueTask, t]);

    const returnToPool = useCallback(async (reason) => {
        try {
            await releaseAssignment({ examId: releaseAssignmentItem.exam_id, reason }).unwrap();
            setReleaseAssignmentItem(null);
            toast.success(t('taskScope.released'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('roleCommand.transitionError')));
            return false;
        }
    }, [releaseAssignment, releaseAssignmentItem, t]);

    const openItem = useCallback((item, report = false) => {
        if (report || (role === 'Radiologist' && item.exam_id && item.queue_stage === 'Reporting')) {
            navigate(`/reports/editor/${item.exam_id}`, { state: { exam: item } });
            return;
        }
        setSelected(item);
    }, [role, navigate]);

    const shift = useCallback((direction) => setDate(shiftAnchorDate(date, effectiveRangeView, direction)), [date, effectiveRangeView]);

    const onNavigate = useCallback((path) => navigate(path), [navigate]);
    const onViewCase = useCallback((item) => navigate(`/cases/${item.exam_id}`), [navigate]);

    const roleTitle = t(`header.roles.${role}.title`, { defaultValue: t('header.title') });
    const roleDescription = t(`header.roles.${role}.description`, { defaultValue: t('header.description') });

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            // Never hijack browser/system combos (Ctrl+R reload, Ctrl+F find, ...)
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            switch (e.key.toLowerCase()) {
                case '/':
                    e.preventDefault();
                    document.getElementById('worklist-search-input')?.focus();
                    break;
                case 'r':
                    e.preventDefault();
                    refresh();
                    break;
                case 'f':
                    e.preventDefault();
                    setShowFilters((prev) => !prev);
                    break;
                case 'q':
                    e.preventDefault();
                    setTab('queue');
                    break;
                case 's':
                    e.preventDefault();
                    setTab('schedule');
                    break;
                case 'escape':
                    e.preventDefault();
                    setSelected(null);
                    break;
                case 'arrowdown':
                    if (tab === 'queue') {
                        e.preventDefault();
                        setFocusedRowIndex((prev) => {
                            const next = Math.min(pagedQueue.length - 1, prev + 1);
                            document.querySelector(`[data-row-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
                            return next;
                        });
                    }
                    break;
                case 'arrowup':
                    if (tab === 'queue') {
                        e.preventDefault();
                        setFocusedRowIndex((prev) => {
                            const next = Math.max(0, prev - 1);
                            document.querySelector(`[data-row-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
                            return next;
                        });
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [refresh, tab, pagedQueue.length]);

    return (
        <main className="mx-auto max-w-[1540px] space-y-4 pb-12" dir={isArabic ? 'rtl' : 'ltr'}>
            <PageHeader
                icon={RoleIcon}
                eyebrow={t(`roleCommand.${role}.eyebrow`, { defaultValue: t('header.title') })}
                title={roleTitle}
                description={roleDescription}
                meta={(
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${scheduleError || queueError ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                            {scheduleError || queueError ? <AlertTriangle size={12} /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                            {scheduleError || queueError ? t('roleCommand.loadError') : t('overview.live')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            <ListChecks size={12} className="text-teal-600 dark:text-teal-300" />
                            {t('roleCommand.metrics.visible', { count: formatCount(queueMetrics.visible, locale) })}
                        </span>
                    </div>
                )}
                actions={(
                    <button
                        type="button"
                        onClick={refresh}
                        className={secondaryBtn}
                    >
                        <RefreshCcw size={15} strokeWidth={2} />
                        <span>{t('roleCommand.refresh', { defaultValue: 'Refresh' })}</span>
                    </button>
                )}
                metricsLabel={t('overview.label')}
                metrics={[
                    {
                        key: 'assigned',
                        icon: ListChecks,
                        tone: 'teal',
                        value: formatCount(isClinicalTaskRole ? taskKpis.assignedToMe : queueMetrics.total, locale),
                        label: t('roleCommand.metrics.assigned'),
                        detail: t('roleCommand.metrics.visible', { count: formatCount(queueMetrics.visible, locale) })
                    },
                    {
                        key: 'ready',
                        icon: CheckCircle2,
                        tone: 'emerald',
                        value: formatCount(isClinicalTaskRole ? taskKpis.pending : queueMetrics.ready, locale),
                        label: isClinicalTaskRole ? t('taskScope.status.Assigned') : t('roleCommand.metrics.ready'),
                        detail: isClinicalTaskRole ? t('taskScope.myEmpty') : t('roleCommand.metrics.readyHelp')
                    },
                    {
                        key: 'priority',
                        icon: AlertTriangle,
                        tone: 'amber',
                        value: formatCount(isClinicalTaskRole ? taskKpis.inProgress : queueMetrics.priority, locale),
                        label: isClinicalTaskRole ? t('taskScope.status.In Progress') : t('roleCommand.metrics.priority'),
                        detail: isClinicalTaskRole ? t('roleCommand.metrics.active') : t('roleCommand.metrics.priorityHelp')
                    },
                    {
                        key: 'wait',
                        icon: Clock3,
                        tone: 'sky',
                        value: formatCount(isClinicalTaskRole ? taskKpis.available : queueMetrics.averageWait, locale),
                        label: isClinicalTaskRole ? t('taskScope.available') : t('roleCommand.metrics.averageWait'),
                        detail: isClinicalTaskRole ? t('taskScope.availableEmpty') : t('roleCommand.metrics.averageWaitHelp')
                    }
                ]}
            />

            {/* Error Notice */}
            {(scheduleError || queueError) && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <span>{t('roleCommand.loadError', { defaultValue: 'Some worklist data could not be loaded. Refresh to try again.' })}</span>
                </div>
            )}

            {/* Master Toolbar */}
            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    {/* View mode switcher */}
                    <ViewTabs
                        tab={tab}
                        onChange={setTab}
                        counts={{ schedule: visibleAppointments.length, queue: visibleQueue.length }}
                        t={t}
                        role={role}
                    />

                    {/* Search bar */}
                    <div className="relative min-w-0 flex-1">
                        <Search size={16} strokeWidth={2} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            id="worklist-search-input"
                            value={search}
                            onChange={handleSearch}
                            placeholder={t('filters.search', { defaultValue: 'Search patient name, MRN, exam modality, accession #...' })}
                            className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 py-2 ps-10 pe-10 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-700/80 dark:bg-slate-950/40 dark:text-white dark:focus:bg-slate-900"
                        />
                        {search && (
                            <button
                                type="button"
                                aria-label={t('filters.clearSearch')}
                                onClick={() => { setSearch(''); setDebouncedSearch(''); }}
                                className="absolute end-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowFilters((c) => !c)}
                        aria-expanded={showFilters}
                        className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition ${
                            showFilters || hasFilters
                                ? 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                    >
                        <SlidersHorizontal size={15} strokeWidth={2} />
                        <span>{t('filters.title')}</span>
                        {activeFilterCount > 0 && (
                            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-teal-600 px-1 font-mono text-[9px] text-white dark:bg-teal-400 dark:text-slate-950">
                                {formatCount(activeFilterCount, locale)}
                            </span>
                        )}
                    </button>

                    {/* Scope toggle (Center-Wide vs My Cases) */}
                    {canSwitchScope ? (
                        <button
                            type="button"
                            onClick={() => setAllCenter((prev) => !prev)}
                            className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition ${
                                allCenter
                                    ? 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                            }`}
                            title={allCenter ? t('filters.showingAllCenter') : t('filters.showingMyCases')}
                        >
                            <Users size={15} strokeWidth={2} />
                            <span>{allCenter ? t('filters.centerCases') : t('filters.myCases')}</span>
                        </button>
                    ) : isClinicalTaskRole ? (
                        <ClinicalTaskScope value={taskScope} onChange={setTaskScope} assignedCount={taskKpis.assignedToMe || 0} availableCount={taskKpis.available || 0} t={t} />
                    ) : (
                        <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                            <UserRound size={15} strokeWidth={2} />
                            {t('filters.assignedCases')}
                        </span>
                    )}

                    {tab === 'queue' && <DensityToggle value={density} onChange={setDensity} t={t} />}
                </div>

                {/* Collapsible Advanced Filters */}
                {showFilters && (
                    <div className="grid gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        <FilterSelect
                            label={t('filters.status')}
                            value={status}
                            onChange={setStatus}
                            options={['all', 'Scheduled', 'Confirmed', 'Arrived', 'Completed', 'Cancelled', 'No-Show']}
                            t={t}
                            translation="statuses"
                        />
                        <FilterSelect
                            label={t('details.priority')}
                            value={priority}
                            onChange={setPriority}
                            options={['all', 'Routine', 'Urgent', 'Emergency']}
                            t={t}
                            translation="priorities"
                        />
                        <FilterSelect
                            label={t('filters.stage')}
                            value={stage}
                            onChange={selectStage}
                            options={['all', ...stageOptions]}
                            t={t}
                            translation="roleCommand.stages"
                        />
                        <FilterSelect
                            label={t('filters.modalities')}
                            value={modality}
                            onChange={setModality}
                            options={['all', ...modalities]}
                            t={t}
                        />
                        <FilterSelect
                            label={t('filters.sort')}
                            value={sortMode}
                            onChange={setSortMode}
                            options={['risk', 'priority', 'wait', 'time', 'newest', 'patient']}
                            t={t}
                            translation="filters.sortOptions"
                        />
                        <div className="flex items-end">
                            <button
                                type="button"
                                disabled={!hasFilters}
                                onClick={clearFilters}
                                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                            >
                                <FilterX size={14} strokeWidth={2} />
                                <span>{t('filters.clear')}</span>
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* Schedule View */}
            {tab === 'schedule' ? (
                scheduleLoading ? (
                    <LoadingState t={t} />
                ) : (
                    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <Scheduler
                            appointments={visibleAppointments}
                            currentDate={new Date(`${date}T00:00:00`)}
                            viewMode={viewMode}
                            onViewChange={setViewMode}
                            onPrevDate={() => shift(-1)}
                            onNextDate={() => shift(1)}
                            onToday={() => setDate(toDateInput())}
                            onSelectEvent={setSelected}
                            t={t}
                            locale={locale}
                        />
                    </section>
                )
            ) : (
                /* Clinical Queue View */
                <section className="space-y-3">
                    {/* Telemetry Insight HUD & Next Best Case */}
                    <QueueInsightPanel
                        metrics={queueMetrics}
                        nextCase={nextBestCase}
                        locale={locale}
                        t={t}
                        onOpen={openItem}
                        onFocus={selectFocus}
                        activeFocus={focusMode}
                        isArabic={isArabic}
                    />

                    {/* Focus & Stage Filter Chips */}
                    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-2.5">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <FocusChips value={focusMode} onChange={selectFocus} counts={focusCounts} t={t} />
                            <Badge tone="neutral" className="self-start lg:self-auto">
                                <ArrowDownUp size={12} strokeWidth={2} />
                                <span>{t(`filters.sortOptions.${sortMode}`, { defaultValue: sortMode })}</span>
                            </Badge>
                        </div>
                        <StageTabs options={stageOptions} counts={stageCounts} value={stage} onChange={selectStage} t={t} />
                    </section>

                    {/* Queue Master Table */}
                    {queueLoading ? (
                        <QueueSkeleton />
                    ) : visibleQueue.length === 0 ? (
                        <EmptyQueue role={role} t={t} hasFilters={hasFilters} onClearFilters={clearFilters} taskScope={taskScope} />
                    ) : (
                        <>
                            <QueueTable
                                items={pagedQueue}
                                role={role}
                                locale={locale}
                                t={t}
                                isMoving={isMoving}
                                isClaiming={isClaiming}
                                isReleasingAssignment={isReleasingAssignment}
                                onAdvance={advance}
                                onClaim={claim}
                                onReturn={setReleaseAssignmentItem}
                                onOpen={openItem}
                                onViewCase={onViewCase}
                                onNavigate={onNavigate}
                                density={density}
                                focusedRowIndex={focusedRowIndex}
                                isArabic={isArabic}
                            />

                            {/* Pagination and page size bar */}
                            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    <span>{t('pagination.showing', {
                                        start: formatCount(queueStart + 1, locale),
                                        end: formatCount(Math.min(queueEnd, visibleQueue.length), locale),
                                        total: formatCount(visibleQueue.length, locale)
                                    })}</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-bold uppercase">{t('pagination.perPage')}</span>
                                        {[10, 20, 50, 100].map((size) => (
                                            <button
                                                key={size}
                                                type="button"
                                                onClick={() => setPageSize(size)}
                                                className={`rounded-lg px-2 py-0.5 text-xs font-black transition ${
                                                    pageSize === size
                                                        ? 'bg-teal-600 text-white'
                                                        : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                }`}
                                            >
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <Pagination
                                    currentPage={queuePage}
                                    pageCount={queuePageCount}
                                    onPageChange={setQueuePage}
                                    isRtl={isArabic}
                                />
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* Appointment Details Slide-over Drawer */}
            <AppointmentDetails
                item={selected}
                onClose={() => setSelected(null)}
                locale={locale}
                t={t}
                isRtl={isArabic}
                role={role}
                onNavigate={onNavigate}
                onViewCase={onViewCase}
                onAdvance={advance}
                onOpenReport={openItem}
                isMoving={isMoving}
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
                cancelLabel={t('modal.close')}
                validationMessage={t('taskScope.releaseRequired')}
                validate={(value) => value.length < 3 ? t('taskScope.releaseRequired') : ''}
                inputProps={{ minLength: 3, maxLength: 1000 }}
                isLoading={isReleasingAssignment}
            />
        </main>
    );
};

export default Worklist;
