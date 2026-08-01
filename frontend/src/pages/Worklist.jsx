import React, { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
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
    ListChecks,
    Monitor,
    PauseCircle,
    RefreshCcw,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    Stethoscope,
    TimerReset,
    UserRound,
    X,
    Zap,
    LayoutGrid
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { PageHeader, Scheduler } from '../components/ui';
import { selectCurrentUser } from '../store/authSlice';
import {
    useGetAppointmentsQuery,
    useGetQueueQuery,
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
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Reporting',
    'Finalized',
    'Delivered'
];

// ─── Design Tokens (aligned with the app-wide solid-surface system) ─

const tokens = {
    // Surfaces
    panel: 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]',
    panelHover: 'transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md dark:hover:border-teal-300/30',
    card: 'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]',

    // Buttons
    btnSoft: secondaryBtn,
    btnPrimary: primaryBtn,
    btnAccent: primaryBtn,

    // Inputs
    input: inputClass,

    // Typography
    label: 'text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500',
    heading: 'text-lg font-black tracking-tight text-slate-900 dark:text-[var(--rcms-ink)]',
    subheading: 'text-sm font-bold text-slate-700 dark:text-slate-300',
    body: 'text-sm font-semibold text-slate-600 dark:text-slate-400',
    caption: 'text-xs font-semibold text-slate-400 dark:text-slate-500',

    // Badges
    badge: 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1'
};

// ─── Color System (semantic tint tones, matching MetricCard) ────────

const priorityStyles = {
    Emergency: 'bg-rose-600 text-white shadow-sm shadow-rose-600/25',
    Urgent: 'bg-amber-500 text-white shadow-sm shadow-amber-500/25',
    Routine: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
};

const stageStyles = {
    Arrived: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/70 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900/50',
    'Payment Pending': 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200/70 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:ring-fuchsia-900/50',
    'Prep Pending': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50',
    'Ready for Exam': 'bg-teal-50 text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-900/50',
    'In Exam': 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/70 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-900/50',
    Reporting: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/70 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900/50',
    Finalized: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/50',
    Delivered: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-400 dark:ring-slate-700/50'
};

const metricTones = {
    neutral: 'bg-slate-100 text-slate-600 ring-slate-200/70 dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-muted)] dark:ring-[var(--rcms-line)]',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-900/50',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-900/50',
    danger: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-900/50',
    info: 'bg-cyan-50 text-cyan-700 ring-cyan-200/70 dark:bg-cyan-900/20 dark:text-cyan-300 dark:ring-cyan-900/50'
};

// ─── Utilities ──────────────────────────────────────────────────────

const formatTime = (value, locale) =>
    formatLocalizedDate(value, locale, { hour: '2-digit', minute: '2-digit' });

const matchesSearch = (item, search) => {
    if (!search) return true;
    const text = [
        item.patient_name, item.mrn, item.order_number,
        item.exam_type_name, item.modality_name,
        item.modality_type, item.machine_name, item.body_part
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

const Badge = ({ children, tone = 'neutral', className = '' }) => (
    <span className={`${tokens.badge} ${metricTones[tone]} ${className}`}>
        {children}
    </span>
);

const IconButton = ({ icon: Icon, label, onClick, disabled, tone = 'default' }) => {
    const base = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40';
    const styles = {
        default: 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-[var(--rcms-surface-hover)] dark:hover:text-slate-300',
        danger: 'text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40',
        primary: 'text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40'
    };
    return (
        <button type="button" onClick={onClick} disabled={disabled}
            aria-label={label} title={label}
            className={`${base} ${styles[tone]}`}>
            <Icon size={17} strokeWidth={2} />
        </button>
    );
};

// ─── Safety Summary ─────────────────────────────────────────────────

const SafetySummary = ({ item, t }) => {
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
                {t('roleCommand.safetyClear', { defaultValue: 'Safety Clear' })}
            </Badge>
        );
    }

    return (
        <Badge tone="danger">
            <AlertTriangle size={12} strokeWidth={2.5} />
            {t('roleCommand.safetyRisks', {
                count: risks.length,
                defaultValue: `${risks.length} Risk${risks.length > 1 ? 's' : ''}`
            })}
        </Badge>
    );
};

// ─── Stage Tabs ─────────────────────────────────────────────────────

const StageTabs = ({ options, counts, value, onChange, t }) => {
    const total = Object.values(counts).reduce((s, c) => s + c, 0);
    const chipBase = 'shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30';
    const activeChip = 'bg-teal-700 text-white shadow-sm dark:bg-teal-600';
    const idleChip = 'bg-white text-slate-600 ring-1 ring-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-[var(--rcms-surface-raised)] dark:text-slate-400 dark:ring-[var(--rcms-line)] dark:hover:bg-[var(--rcms-surface-hover)]';

    return (
        <div className="relative">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                <button
                    type="button"
                    onClick={() => onChange('all')}
                    className={`${chipBase} ${value === 'all' ? activeChip : idleChip}`}
                >
                    <LayoutGrid size={15} />
                    {t('filters.all', { defaultValue: 'All' })}
                    <span className={`ml-1 rounded-md px-2 py-0.5 text-[10px] font-black ${value === 'all' ? 'bg-white/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                        {total}
                    </span>
                </button>

                {options.map((stage) => {
                    const count = counts[stage] || 0;
                    const isActive = value === stage;
                    return (
                        <button
                            key={stage}
                            type="button"
                            onClick={() => onChange(stage)}
                            className={`${chipBase} ${isActive ? activeChip : idleChip}`}
                        >
                            <span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-white/70' : 'bg-slate-300 dark:bg-slate-600'}`} />
                            {t(`roleCommand.stages.${stage}`, { defaultValue: stage })}
                            {count > 0 && (
                                <span className={`ml-1 rounded-md px-2 py-0.5 text-[10px] font-black ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Queue Data Cell ────────────────────────────────────────────────

const QueueMetric = ({ icon: Icon, label, value, detail, tone = 'neutral' }) => (
    <div className={`${tokens.card} min-w-0 p-4`}>
        <div className="flex items-start justify-between gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${metricTones[tone]}`}>
                <Icon size={18} strokeWidth={2.25} />
            </div>
            <p className="text-2xl font-black tabular-nums text-slate-950 dark:text-[var(--rcms-ink)]">{value}</p>
        </div>
        <p className="mt-3 truncate text-xs font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
);

const FocusChips = ({ value, onChange, counts, t }) => (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
        {focusModes.map((mode) => {
            const isActive = value === mode;
            return (
                <button
                    key={mode}
                    type="button"
                    onClick={() => onChange(mode)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 ${isActive
                        ? 'bg-slate-950 text-white shadow-sm dark:bg-teal-600'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-[var(--rcms-surface-raised)] dark:text-slate-400 dark:ring-[var(--rcms-line)] dark:hover:bg-[var(--rcms-surface-hover)]'
                    }`}
                >
                    {t(`focus.${mode}`)}
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                        {counts[mode] || 0}
                    </span>
                </button>
            );
        })}
    </div>
);

const DensityToggle = ({ value, onChange, t }) => (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-[var(--rcms-surface-muted)]">
        {['comfortable', 'compact'].map((mode) => (
            <button
                key={mode}
                type="button"
                onClick={() => onChange(mode)}
                className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${value === mode
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-ink)]'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
                {t(`density.${mode}`)}
            </button>
        ))}
    </div>
);

const QueueInsightPanel = ({ metrics, nextCase, locale, t, onOpen }) => (
    <section className={`${tokens.panel} p-4`}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <h3 className={tokens.heading}>{t('insights.title')}</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('insights.description')}</p>
                    </div>
                    <Badge tone={metrics.overdue > 0 ? 'danger' : 'success'}>
                        <Gauge size={12} />
                        {metrics.overdue > 0 ? t('insights.attention') : t('insights.stable')}
                    </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <QueueMetric icon={ListChecks} label={t('roleCommand.metrics.assigned')} value={formatCount(metrics.total, locale)} detail={t('roleCommand.metrics.visible', { count: formatCount(metrics.visible, locale) })} tone="info" />
                    <QueueMetric icon={Zap} label={t('roleCommand.metrics.priority')} value={formatCount(metrics.priority, locale)} detail={t('roleCommand.metrics.priorityHelp')} tone={metrics.priority > 0 ? 'warning' : 'neutral'} />
                    <QueueMetric icon={TimerReset} label={t('roleCommand.metrics.averageWait')} value={formatDuration(metrics.averageWait, locale)} detail={t('roleCommand.metrics.averageWaitHelp')} tone={metrics.overdue > 0 ? 'danger' : 'neutral'} />
                    <QueueMetric icon={ShieldCheck} label={t('roleCommand.metrics.safety')} value={formatCount(metrics.safety, locale)} detail={t('roleCommand.safetyAlert')} tone={metrics.safety > 0 ? 'danger' : 'success'} />
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)]">
                <p className={tokens.label}>{t('insights.nextBest')}</p>
                {nextCase ? (
                    <button type="button" onClick={() => onOpen(nextCase)}
                        className="mt-3 block w-full rounded-xl bg-white p-4 text-start shadow-sm ring-1 ring-slate-200 transition hover:ring-teal-300 dark:bg-[var(--rcms-surface-raised)] dark:ring-[var(--rcms-line)]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-950 dark:text-[var(--rcms-ink)]">{nextCase.patient_name || t('fallback.patient')}</p>
                                <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{nextCase.exam_type_name || nextCase.modality_name || t('fallback.unspecifiedExam')}</p>
                            </div>
                            <span className={`inline-flex shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${priorityStyles[nextCase.priority] || priorityStyles.Routine}`}>
                                {t(`priorities.${nextCase.priority || 'Routine'}`)}
                            </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge tone={nextCase.is_overdue ? 'danger' : 'neutral'}>
                                <TimerReset size={12} />
                                {formatDuration(nextCase.waiting_minutes || 0, locale)}
                            </Badge>
                            <Badge tone={hasSafetyRisk(nextCase) ? 'danger' : 'success'}>
                                <ShieldCheck size={12} />
                                {hasSafetyRisk(nextCase) ? t('focus.safety') : t('roleCommand.safetyClear', { defaultValue: 'Safety Clear' })}
                            </Badge>
                            {nextCase.is_on_hold && (
                                <Badge tone="warning">
                                    <PauseCircle size={12} />
                                    {t('roleCommand.onHold')}
                                </Badge>
                            )}
                        </div>
                    </button>
                ) : (
                    <p className="mt-3 rounded-xl bg-white p-4 text-sm font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-[var(--rcms-surface-raised)] dark:text-slate-400 dark:ring-[var(--rcms-line)]">
                        {t('insights.empty')}
                    </p>
                )}
            </div>
        </div>
    </section>
);

const DataCell = ({ icon: Icon, label, value, alert = false }) => (
    <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
            <Icon size={12} strokeWidth={2} />
            {label}
        </p>
        <p className={`mt-1 truncate text-sm font-semibold ${alert ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
            {value || '—'}
        </p>
    </div>
);

// ─── Queue Row ──────────────────────────────────────────────────────

const QueueRow = ({ item, role, locale, t, isMoving, onAdvance, onOpen, onViewCase, density = 'comfortable' }) => {
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
        return null;
    }, [role, item.queue_stage, t]);

    const canReport = role === 'Radiologist' && item.queue_stage === 'Reporting';
    const isCritical = item.priority === 'Emergency' || item.is_overdue;
    const isUrgent = item.priority === 'Urgent';
    const compact = density === 'compact';
    const rowPadding = compact ? 'px-4 py-3 ps-6' : 'px-5 py-5 ps-6';
    const avatarSize = compact ? 'h-9 w-9' : 'h-11 w-11';
    const avatarIcon = compact ? 17 : 19;

    return (
        <article className={`group relative border-b border-slate-100 transition-colors duration-200 hover:bg-slate-50 dark:border-[var(--rcms-line)] dark:hover:bg-[var(--rcms-surface-hover)] ${isCritical ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}`}>
            {/* Priority indicator stripe */}
            <div className={`absolute inset-y-4 start-0 w-1 rounded-e-full ${isCritical ? 'bg-rose-500' : isUrgent ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`} />

            <div className={rowPadding}>
                {/* Mobile: stacked layout */}
                <div className="flex flex-col gap-4 lg:hidden">
                    <button type="button" onClick={() => onOpen(item)}
                        className="flex items-start gap-3 text-start">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-[var(--rcms-surface-muted)] dark:text-slate-400">
                            <UserRound size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-bold text-slate-900 dark:text-[var(--rcms-ink)]">
                                    {item.patient_name || t('fallback.patient')}
                                </span>
                                <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityStyles[item.priority] || priorityStyles.Routine}`}>
                                    {t(`priorities.${item.priority || 'Routine'}`)}
                                </span>
                                {item.is_follow_up && <span className="inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900/60">{t('details.followUp', { defaultValue: 'Follow-up' })}</span>}
                                {item.is_overdue && <span className="inline-flex rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60">{t('focus.overdue')}</span>}
                            </div>
                            <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                                {item.exam_type_name || item.modality_name || t('fallback.unspecifiedExam')}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                {item.mrn || '—'} · {item.order_number || item.exam_id}
                            </p>
                        </div>
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                        <DataCell icon={Monitor} label={t('roleCommand.machine')} value={item.modality_name || item.modality_type || t('fallback.unassigned')} />
                        <DataCell icon={Clock3} label={t('roleCommand.scheduled')} value={formatTime(item.start_time, locale)} />
                        <DataCell icon={Activity} label={t('roleCommand.bodyPart')} value={item.body_part} />
                        <DataCell icon={TimerReset} label={t('roleCommand.waiting', { defaultValue: 'Waiting' })} value={formatDuration(item.waiting_minutes || 0, locale)} alert={item.is_overdue} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-bold ${stageStyles[item.queue_stage] || stageStyles.Delivered}`}>
                            {t(`roleCommand.stages.${item.queue_stage}`, { defaultValue: item.queue_stage })}
                        </span>
                        <SafetySummary item={item} t={t} />
                        {isReadyForRole(item, role) && (
                            <Badge tone="info">
                                <ClipboardCheck size={12} />
                                {t('focus.ready')}
                            </Badge>
                        )}
                        <div className="ms-auto flex items-center gap-1">
                            <IconButton icon={Eye} label={t('modal.details')} onClick={() => onOpen(item)} />
                            <IconButton icon={Activity} label={t('caseReports.row.viewCase', { defaultValue: 'View Case' })} onClick={() => onViewCase(item)} />
                            {(nextAction || canReport) && (
                                <button type="button" disabled={isMoving || item.is_on_hold}
                                    onClick={() => canReport ? onOpen(item, true) : onAdvance(item, nextAction.stage)}
                                    className={tokens.btnAccent}>
                                    {canReport ? <FileText size={15} /> : <ChevronRight size={15} className="rtl:rotate-180" />}
                                    {canReport ? t('reporting.report') : nextAction.label}
                                </button>
                            )}
                        </div>
                    </div>

                    {item.is_on_hold && (
                        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:ring-amber-900/40">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>{t('roleCommand.onHold', { defaultValue: 'On Hold' })}{item.hold_reason ? ` · ${item.hold_reason}` : ''}</span>
                        </div>
                    )}
                </div>

                {/* Desktop: grid layout */}
                <div className="hidden lg:grid lg:grid-cols-[minmax(260px,1.2fr)_minmax(380px,1.6fr)_minmax(280px,1fr)] lg:items-center lg:gap-6">
                    {/* Patient column */}
                    <button type="button" onClick={() => onOpen(item)}
                        className="-m-2 flex items-start gap-3 rounded-xl p-2 text-start transition-colors hover:bg-slate-100/60 dark:hover:bg-[var(--rcms-surface-muted)]">
                        <div className={`flex ${avatarSize} shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-[var(--rcms-surface-muted)] dark:text-slate-400`}>
                            <UserRound size={avatarIcon} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-bold text-slate-900 dark:text-[var(--rcms-ink)]">
                                    {item.patient_name || t('fallback.patient')}
                                </span>
                                <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityStyles[item.priority] || priorityStyles.Routine}`}>
                                    {t(`priorities.${item.priority || 'Routine'}`)}
                                </span>
                                {item.is_follow_up && <span className="inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900/60">{t('details.followUp', { defaultValue: 'Follow-up' })}</span>}
                                {item.is_overdue && <span className="inline-flex rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60">{t('focus.overdue')}</span>}
                            </div>
                            <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                                {item.exam_type_name || item.modality_name || t('fallback.unspecifiedExam')}
                            </p>
                            <p className="mt-1 font-mono text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                {item.mrn || '—'} · {item.order_number || item.exam_id}
                            </p>
                        </div>
                    </button>

                    {/* Details column */}
                    <div className="grid grid-cols-4 gap-x-4 gap-y-2">
                        <DataCell icon={Monitor} label={t('roleCommand.machine')} value={item.modality_name || item.modality_type || t('fallback.unassigned')} />
                        <DataCell icon={Clock3} label={t('roleCommand.scheduled')} value={formatTime(item.start_time, locale)} />
                        <DataCell icon={Activity} label={t('roleCommand.bodyPart')} value={item.body_part} />
                        <DataCell icon={TimerReset} label={t('roleCommand.waiting', { defaultValue: 'Waiting' })} value={formatDuration(item.waiting_minutes || 0, locale)} alert={item.is_overdue} />
                    </div>

                    {/* Actions column */}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-bold ${stageStyles[item.queue_stage] || stageStyles.Delivered}`}>
                            {t(`roleCommand.stages.${item.queue_stage}`, { defaultValue: item.queue_stage })}
                        </span>
                        <SafetySummary item={item} t={t} />
                        {isReadyForRole(item, role) && (
                            <Badge tone="info">
                                <ClipboardCheck size={12} />
                                {t('focus.ready')}
                            </Badge>
                        )}
                        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
                        <IconButton icon={Eye} label={t('modal.details')} onClick={() => onOpen(item)} />
                        <IconButton icon={Activity} label={t('caseReports.row.viewCase', { defaultValue: 'View Case' })} onClick={() => onViewCase(item)} />
                        {(nextAction || canReport) && (
                            <button type="button" disabled={isMoving || item.is_on_hold}
                                onClick={() => canReport ? onOpen(item, true) : onAdvance(item, nextAction.stage)}
                                className={tokens.btnAccent}>
                                {canReport ? <FileText size={15} /> : <ChevronRight size={15} className="rtl:rotate-180" />}
                                {canReport ? t('reporting.report') : nextAction.label}
                            </button>
                        )}
                    </div>
                </div>

                {/* On-hold banner (desktop) */}
                {item.is_on_hold && (
                    <div className="mt-3 hidden items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 lg:flex dark:bg-amber-950/20 dark:text-amber-300 dark:ring-amber-900/40">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>{t('roleCommand.onHold', { defaultValue: 'On Hold' })}{item.hold_reason ? ` · ${item.hold_reason}` : ''}</span>
                    </div>
                )}
            </div>
        </article>
    );
};

// ─── Queue Table Container ──────────────────────────────────────────

const QueueTable = (props) => (
    <section className={`${tokens.panel} overflow-hidden`}>
        {/* Desktop header */}
        <div className="hidden border-b border-slate-100 bg-slate-50/60 px-5 py-3 lg:grid lg:grid-cols-[minmax(260px,1.2fr)_minmax(380px,1.6fr)_minmax(280px,1fr)] lg:gap-6 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)]">
            <span className="ps-6 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">{props.t('patient', { defaultValue: 'Patient' })}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">{props.t('details.exam')}</span>
            <span className="pe-5 text-end text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">{props.t('actions', { defaultValue: 'Actions' })}</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-[var(--rcms-line)]">
            {props.items.map((item) => (
                <QueueRow key={item.exam_id} item={item} {...props} />
            ))}
        </div>
    </section>
);

// ─── Detail Panel Components ────────────────────────────────────────

const DetailSection = ({ title, children, className = '' }) => (
    <section className={`${tokens.panel} p-5 ${className}`}>
        <h3 className={tokens.label}>{title}</h3>
        <div className="mt-3">{children}</div>
    </section>
);

const DetailField = ({ label, value, highlight = false }) => (
    <div className="min-w-0 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">{label}</p>
        <p className={`mt-1 break-words text-sm font-semibold ${highlight ? 'text-teal-600 dark:text-teal-400' : 'text-slate-800 dark:text-slate-200'}`}>
            {value || '—'}
        </p>
    </div>
);

const DetailGroup = ({ title, items }) => (
    <DetailSection title={title}>
        <div className="divide-y divide-slate-100 dark:divide-[var(--rcms-line)]">
            {items.map(([label, value, highlight]) => (
                <DetailField key={label} label={label} value={value} highlight={highlight} />
            ))}
        </div>
    </DetailSection>
);

const SummaryPill = ({ icon: Icon, label, value, tone = 'neutral' }) => (
    <div className={`flex items-center gap-3 rounded-xl p-3.5 ring-1 ${metricTones[tone]}`}>
        <Icon size={18} strokeWidth={2} className="shrink-0 opacity-70" />
        <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.06em] opacity-70">{label}</p>
            <p className="mt-0.5 truncate text-sm font-black">{value || '—'}</p>
        </div>
    </div>
);

// ─── Detail Slide-over ──────────────────────────────────────────────

const AppointmentDetails = ({ item, onClose, locale, t }) => {
    if (!item) return null;

    const startTime = formatLocalizedDate(item.start_time, locale, { dateStyle: 'medium', timeStyle: 'short' });
    const endTime = formatLocalizedDate(item.end_time, locale, { dateStyle: 'medium', timeStyle: 'short' });
    const priorityLabel = t(`priorities.${item.priority || 'Routine'}`);
    const statusLabel = t(`statuses.${item.status}`, { defaultValue: item.status });
    const stageLabel = t(`roleCommand.stages.${item.queue_stage}`, { defaultValue: item.queue_stage });
    const priorityTone = item.priority === 'Emergency' ? 'danger' : item.priority === 'Urgent' ? 'warning' : 'neutral';

    return createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end" role="presentation"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity" />

            <aside role="dialog" aria-modal="true" aria-labelledby="detail-title"
                className="relative h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-right duration-300 dark:bg-[var(--rcms-surface-raised)]">

                {/* Header */}
                <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-5 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-slate-700">
                                <UserRound size={22} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-teal-600 dark:text-teal-400">{t('modal.details')}</p>
                                <h2 id="detail-title" className="mt-1 truncate text-xl font-black text-slate-950 dark:text-[var(--rcms-ink)]">{item.patient_name || t('fallback.patient')}</h2>
                                <p className="mt-0.5 truncate text-sm font-medium text-slate-500 dark:text-slate-400">{item.exam_type_name || item.modality_name || t('fallback.unspecifiedExam')}</p>
                            </div>
                        </div>
                        <IconButton icon={X} label={t('modal.close')} onClick={onClose} tone="default" />
                    </div>

                    {/* Summary pills */}
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <SummaryPill icon={ShieldCheck} label={t('details.priority')} value={priorityLabel} tone={priorityTone} />
                        <SummaryPill icon={Activity} label={t('details.status')} value={statusLabel} tone="info" />
                        <SummaryPill icon={ListChecks} label={t('filters.stage')} value={stageLabel} />
                        <SummaryPill icon={TimerReset} label={t('overview.visible')} value={formatDuration(item.waiting_minutes || 0, locale)} tone={item.is_overdue ? 'danger' : 'neutral'} />
                    </div>
                </header>

                {/* Content */}
                <div className="space-y-4 p-6">
                    {item.is_on_hold && (
                        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:ring-amber-900/40">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                            <span>{t('roleCommand.onHold', { defaultValue: 'On Hold' })}{item.hold_reason ? ` — ${item.hold_reason}` : ''}</span>
                        </div>
                    )}

                    {item.is_follow_up && (
                        <DetailSection title={t('details.followUpContext', { defaultValue: 'Follow-up context' })}>
                            <div className="grid gap-2 text-sm sm:grid-cols-2">
                                <p className="font-semibold text-slate-700 dark:text-slate-300">{item.prior_exam_type_name || t('details.priorStudy', { defaultValue: 'Prior study' })}</p>
                                <p className="font-mono text-xs text-slate-500 sm:text-end">{item.prior_order_number || item.prior_exam_id}</p>
                            </div>
                            {item.follow_up_reason && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.follow_up_reason}</p>}
                        </DetailSection>
                    )}

                    <div className="grid gap-4">
                        <DetailGroup title={t('details.order', { defaultValue: 'Order Information' })} items={[
                            [t('details.mrn'), item.mrn],
                            [t('details.order'), item.order_number || item.appointment_id],
                            [t('details.status'), statusLabel, true],
                            [t('details.priority'), priorityLabel]
                        ]} />

                        <DetailGroup title={t('details.exam')} items={[
                            [t('details.exam'), item.exam_type_name || item.modality_name],
                            [t('details.machine'), item.machine_name || item.modality_name],
                            [t('details.modality', { defaultValue: 'Modality' }), item.modality_type],
                            [t('roleCommand.bodyPart'), item.body_part],
                            [t('details.start'), startTime],
                            [t('details.end'), endTime]
                        ]} />

                        <DetailGroup title={t('form.staff', { defaultValue: 'Care Team' })} items={[
                            [t('form.radiologist'), item.radiologist_name],
                            [t('form.technician'), item.technician_name],
                            [t('form.nurse'), item.nurse_name],
                            [t('details.preparation'), item.preparation_status]
                        ]} />
                    </div>

                    <DetailSection title={t('details.clinical')}>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                            {item.clinical_indication || 'No clinical indication provided.'}
                        </p>
                    </DetailSection>

                    <DetailSection title={t('details.preparation')}>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                            {item.preparation_instructions || item.notes || 'No preparation instructions.'}
                        </p>
                    </DetailSection>
                </div>
            </aside>
        </div>,
        document.body
    );
};

// ─── Filter Components ──────────────────────────────────────────────

const FilterSelect = ({ label, value, onChange, options, t, translation }) => (
    <label className="block">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={tokens.input}>
            {options.map((opt) => (
                <option key={opt} value={opt}>
                    {opt === 'all' ? t('filters.all', { defaultValue: 'All' }) : translation ? t(`${translation}.${opt}`, { defaultValue: opt }) : opt}
                </option>
            ))}
        </select>
    </label>
);

// ─── Loading & Empty States ─────────────────────────────────────────

const LoadingState = ({ t }) => (
    <div className={`${tokens.panel} flex min-h-[400px] flex-col items-center justify-center`}>
        <RefreshCcw size={28} className="animate-spin text-teal-600 dark:text-teal-400" />
        <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">{t('calendar.loading', { defaultValue: 'Loading workspace...' })}</p>
    </div>
);

const EmptyQueue = ({ role, t }) => (
    <div className={`${tokens.panel} flex min-h-[360px] flex-col items-center justify-center px-8 text-center`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40">
            <CheckCircle2 size={28} strokeWidth={2} />
        </div>
        <p className="mt-5 text-lg font-black text-slate-900 dark:text-[var(--rcms-ink)]">{t(`roleCommand.${role}.empty`, { defaultValue: t('reporting.empty') })}</p>
        <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">{t('roleCommand.emptyHelp')}</p>
    </div>
);

// ─── Tab Switcher ───────────────────────────────────────────────────

const ViewTabs = ({ tab, onChange, counts, t, role }) => {
    const tabBase = 'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200';
    const activeTab = 'bg-white text-slate-900 shadow-sm dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-ink)]';
    const idleTab = 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200';
    const countBadge = (active) => `ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${active ? 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300' : 'bg-slate-200/60 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`;

    return (
        <div className="inline-flex rounded-2xl bg-slate-100 p-1.5 dark:bg-[var(--rcms-surface-muted)]">
            <button type="button" onClick={() => onChange('schedule')}
                className={`${tabBase} ${tab === 'schedule' ? activeTab : idleTab}`}>
                <CalendarDays size={16} strokeWidth={2} />
                {t('filters.calendar')}
                <span className={countBadge(tab === 'schedule')}>{counts.schedule}</span>
            </button>
            <button type="button" onClick={() => onChange('queue')}
                className={`${tabBase} ${tab === 'queue' ? activeTab : idleTab}`}>
                <ListChecks size={16} strokeWidth={2} />
                {t(`roleCommand.${role}.title`, { defaultValue: t('reporting.title') })}
                <span className={countBadge(tab === 'queue')}>{counts.queue}</span>
            </button>
        </div>
    );
};

// ─── Main Worklist Component ────────────────────────────────────────

const Worklist = () => {
    const { t, i18n } = useTranslation('worklist');
    const navigate = useNavigate();
    const user = useSelector(selectCurrentUser);

    const role = user?.role || 'Radiologist';
    const roleCfg = roleConfig[role] || roleConfig.Admin;
    const RoleIcon = roleCfg.icon;
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US';

    // State
    const [tab, setTab] = useState(role === 'Radiologist' ? 'queue' : 'schedule');
    const [viewMode, setViewMode] = useState('day');
    const [date, setDate] = useState(toDateInput());
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [priority, setPriority] = useState('all');
    const [modality, setModality] = useState('all');
    const [stage, setStage] = useState('all');
    const [focusMode, setFocusMode] = useState('all');
    const [sortMode, setSortMode] = useState('risk');
    const [density, setDensity] = useState('comfortable');
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState(null);

    // Data fetching
    const effectiveRangeView = viewMode === 'agenda' ? 'week' : viewMode;
    const range = useMemo(() => getRange(date, effectiveRangeView), [date, effectiveRangeView]);

    const appointmentParams = viewMode === 'day'
        ? { date, assignedStaffId: ['Developer', 'Admin'].includes(role) ? undefined : user?.user_id, limit: 500 }
        : { startDate: range.startDate, endDate: range.endDate, assignedStaffId: ['Developer', 'Admin'].includes(role) ? undefined : user?.user_id, limit: 500 };

    const { data: appointments = [], isLoading: scheduleLoading, isError: scheduleError, refetch: refetchSchedule } = useGetAppointmentsQuery(appointmentParams, { pollingInterval: 60000 });
    const { data: queueResponse, isLoading: queueLoading, isError: queueError, refetch: refetchQueue } = useGetQueueQuery({ includeDelivered: 'false', limit: 500 }, { pollingInterval: 30000 });
    const [transitionQueue, { isLoading: isMoving }] = useTransitionQueueMutation();

    const queue = useMemo(() => queueResponse?.data || [], [queueResponse?.data]);
    const normalizedSearch = search.trim().toLowerCase();

    // Derived data
    const modalities = useMemo(() => [...new Set([
        ...appointments.map((i) => i.machine_name || i.modality_type),
        ...queue.map((i) => i.modality_name || i.modality_type)
    ].filter(Boolean))].sort(), [appointments, queue]);

    const stageOptions = useMemo(() => [...new Set([
        ...defaultStageOptions,
        ...queue.map((i) => i.queue_stage).filter(Boolean)
    ])].filter((s) => queue.some((q) => q.queue_stage === s) || ['Arrived', 'Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting'].includes(s)), [queue]);

    const visibleAppointments = useMemo(() => appointments.filter((item) => {
        if (!matchesSearch(item, normalizedSearch)) return false;
        if (status !== 'all' && item.status !== status) return false;
        if (priority !== 'all' && (item.priority || 'Routine') !== priority) return false;
        return modality === 'all' || (item.machine_name || item.modality_type) === modality;
    }), [appointments, modality, normalizedSearch, priority, status]);

    const visibleQueue = useMemo(() => queue
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
            if (sortMode === 'risk') return riskScore(b, role) - riskScore(a, role);
            if (sortMode === 'wait') return Number(b.waiting_minutes || 0) - Number(a.waiting_minutes || 0);
            if (sortMode === 'time') return new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime();
            if (sortMode === 'newest') return new Date(b.created_at || b.start_time || 0).getTime() - new Date(a.created_at || a.start_time || 0).getTime();
            if (sortMode === 'patient') return String(a.patient_name || '').localeCompare(String(b.patient_name || ''), i18n.language);
            return (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3) || Number(b.waiting_minutes || 0) - Number(a.waiting_minutes || 0);
        }), [focusMode, i18n.language, modality, normalizedSearch, priority, queue, role, sortMode, stage]);

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

    const nextBestCase = useMemo(() => [...visibleQueue].sort((a, b) => riskScore(b, role) - riskScore(a, role))[0], [role, visibleQueue]);

    const hasFilters = Boolean(search || status !== 'all' || priority !== 'all' || modality !== 'all' || stage !== 'all' || focusMode !== 'all' || sortMode !== 'risk');

    // Actions
    const clearFilters = useCallback(() => {
        setSearch(''); setStatus('all'); setPriority('all'); setModality('all'); setStage('all'); setFocusMode('all'); setSortMode('risk');
    }, []);

    const refresh = useCallback(() => { refetchSchedule(); refetchQueue(); }, [refetchSchedule, refetchQueue]);

    const advance = useCallback(async (item, toStage) => {
        try {
            await transitionQueue({ examId: item.exam_id, toStage }).unwrap();
            toast.success(t('roleCommand.transitionSuccess', { stage: t(`roleCommand.stages.${toStage}`, { defaultValue: toStage }) }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('roleCommand.transitionError')));
        }
    }, [transitionQueue, t]);

    const openItem = useCallback((item, report = false) => {
        if (report || (role === 'Radiologist' && item.exam_id && item.queue_stage === 'Reporting')) {
            navigate(`/reports/editor/${item.exam_id}`, { state: { exam: item } });
            return;
        }
        setSelected(item);
    }, [role, navigate]);

    const shift = useCallback((direction) => setDate(shiftAnchorDate(date, effectiveRangeView, direction)), [date, effectiveRangeView]);

    const roleTitle = t(`header.roles.${role}.title`, { defaultValue: t('header.title') });
    const roleDescription = t(`header.roles.${role}.description`, { defaultValue: t('header.description') });

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[var(--rcms-canvas)]">
            {/* Header */}
            <PageHeader
                icon={RoleIcon}
                eyebrow={t(`roleCommand.${role}.eyebrow`, { defaultValue: t('header.title') })}
                title={roleTitle}
                description={roleDescription}
                meta={
                    <Badge tone="success">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        {t('overview.live')}
                    </Badge>
                }
                actions={
                    <button type="button" onClick={refresh} className={tokens.btnSoft}>
                        <RefreshCcw size={15} strokeWidth={2} />
                        {t('roleCommand.refresh', { defaultValue: 'Refresh' })}
                    </button>
                }
            />

            {/* Main Content */}
            <main className="mx-auto max-w-[1600px] space-y-5 py-5">
                {/* Toolbar */}
                <section className={`${tokens.panel} p-4`}>
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                        <ViewTabs tab={tab} onChange={setTab} counts={{ schedule: visibleAppointments.length, queue: visibleQueue.length }} t={t} role={role} />

                        <div className="relative min-w-0 flex-1">
                            <Search size={17} strokeWidth={2} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('filters.search')}
                                className={`${tokens.input} ps-11 pe-10`} />
                            {search && (
                                <button type="button" aria-label={t('filters.clearSearch')} onClick={() => setSearch('')}
                                    className="absolute end-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[var(--rcms-surface-hover)] dark:hover:text-slate-200">
                                    <X size={15} />
                                </button>
                            )}
                        </div>

                        <button type="button" onClick={() => setShowFilters((c) => !c)}
                            className={`${tokens.btnSoft} ${showFilters || hasFilters ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300' : ''}`}>
                            <SlidersHorizontal size={15} strokeWidth={2} />
                            {t('filters.title')}
                            {hasFilters && <span className="h-2 w-2 rounded-full bg-teal-500" />}
                        </button>

                        {tab === 'queue' && <DensityToggle value={density} onChange={setDensity} t={t} />}
                    </div>

                    {/* Filters Panel */}
                    {showFilters && (
                        <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 dark:border-[var(--rcms-line)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            <FilterSelect label={t('filters.status')} value={status} onChange={setStatus}
                                options={['all', 'Scheduled', 'Confirmed', 'Arrived', 'Completed', 'Cancelled', 'No-Show']} t={t} translation="statuses" />
                            <FilterSelect label={t('details.priority')} value={priority} onChange={setPriority}
                                options={['all', 'Routine', 'Urgent', 'Emergency']} t={t} translation="priorities" />
                            <FilterSelect label={t('filters.stage')} value={stage} onChange={setStage}
                                options={['all', ...stageOptions]} t={t} translation="roleCommand.stages" />
                            <FilterSelect label={t('filters.modalities')} value={modality} onChange={setModality}
                                options={['all', ...modalities]} t={t} />
                            <FilterSelect label={t('filters.sort')} value={sortMode} onChange={setSortMode}
                                options={['risk', 'priority', 'wait', 'time', 'newest', 'patient']} t={t} translation="filters.sortOptions" />
                            <div className="flex items-end">
                                <button type="button" disabled={!hasFilters} onClick={clearFilters} className={`${tokens.btnSoft} w-full`}>
                                    <FilterX size={14} strokeWidth={2} />
                                    {t('filters.clear')}
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                {/* Error Banner */}
                {(scheduleError || queueError) && (
                    <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-5 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:ring-rose-900/40">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                        {t('roleCommand.loadError', { defaultValue: 'Some worklist data could not be loaded. Refresh to try again.' })}
                    </div>
                )}

                {/* Schedule View */}
                {tab === 'schedule' ? (
                    scheduleLoading ? <LoadingState t={t} /> : (
                        <section className={`${tokens.panel} p-4`}>
                            <Scheduler appointments={visibleAppointments} currentDate={new Date(`${date}T00:00:00`)} viewMode={viewMode}
                                onViewChange={setViewMode} onPrevDate={() => shift(-1)} onNextDate={() => shift(1)}
                                onToday={() => setDate(toDateInput())} onSelectEvent={setSelected} t={t} locale={locale} />
                        </section>
                    )
                ) : (
                    /* Queue View */
                    <section className="space-y-5">
                        <QueueInsightPanel metrics={queueMetrics} nextCase={nextBestCase} locale={locale} t={t} onOpen={openItem} />

                        {/* Stage Tabs */}
                        <section className={`${tokens.panel} p-4`}>
                            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h2 className={tokens.heading}>{t(`roleCommand.${role}.title`, { defaultValue: t('reporting.title') })}</h2>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t(`roleCommand.${role}.description`, { defaultValue: t('reporting.description') })}</p>
                                </div>
                                <Badge tone="neutral">
                                    <ArrowDownUp size={12} strokeWidth={2} />
                                    {t(`filters.sortOptions.${sortMode}`, { defaultValue: sortMode })}
                                </Badge>
                            </div>
                            <div className="mb-4">
                                <FocusChips value={focusMode} onChange={setFocusMode} counts={focusCounts} t={t} />
                            </div>
                            <StageTabs options={stageOptions} counts={stageCounts} value={stage} onChange={setStage} t={t} />
                        </section>

                        {/* Queue List */}
                        {queueLoading ? <LoadingState t={t} /> : visibleQueue.length === 0 ? <EmptyQueue role={role} t={t} /> : (
                            <QueueTable items={visibleQueue} role={role} locale={locale} t={t} isMoving={isMoving} onAdvance={advance} onOpen={openItem} onViewCase={(item) => navigate(`/cases/${item.exam_id}`)} density={density} />
                        )}
                    </section>
                )}
            </main>

            {/* Detail Panel */}
            <AppointmentDetails item={selected} onClose={() => setSelected(null)} locale={locale} t={t} />
        </div>
    );
};

export default Worklist;
