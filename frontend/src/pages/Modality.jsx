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
    XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useGetQueueQuery, useTransitionQueueMutation, api } from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import SafetyFormModal from '../components/clinical/SafetyFormModal';
import HoldReasonDialog from '../components/clinical/HoldReasonDialog';
import CancelReasonDialog from '../components/clinical/CancelReasonDialog';
import { formatDuration } from '../utils/dateFormat';
import PageHeader from '../components/ui/PageHeader';

/*
  Shares its design system with the Nurse queue page:
  - single teal accent for primary actions, restrained neutrals elsewhere
  - "acuity rail" (color-coded left edge) encodes priority + overdue state
  - system UI type, no decorative gradients — this is a tool read at speed
*/

const cardClass = 'rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50';

const ACUITY = {
    Emergency: { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', ring: 'ring-rose-200 dark:ring-rose-900/50', bg: 'bg-rose-50 dark:bg-rose-950/30', dot: 'bg-rose-500' },
    Urgent: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', ring: 'ring-amber-200 dark:ring-amber-900/50', bg: 'bg-amber-50 dark:bg-amber-950/30', dot: 'bg-amber-500' },
    Routine: { bar: 'bg-slate-300 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', ring: 'ring-slate-200 dark:ring-slate-800', bg: 'bg-slate-50 dark:bg-slate-900/50', dot: 'bg-slate-300 dark:bg-slate-600' },
};

const metricTones = {
    teal: { text: 'text-teal-700 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/40', ring: 'ring-teal-100 dark:ring-teal-900' },
    blue: { text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40', ring: 'ring-blue-100 dark:ring-blue-900' },
    rose: { text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40', ring: 'ring-rose-100 dark:ring-rose-900' },
};

/* ── Priority ── */
const PriorityBadge = ({ priority = 'Routine', t }) => {
    const acuity = ACUITY[priority] || ACUITY.Routine;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${acuity.bg} ${acuity.text} ${acuity.ring}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${acuity.dot}`} />
            {t ? t(`common.priority.${priority}`, { defaultValue: priority }) : priority}
        </span>
    );
};

/* ── Stage progress ── */
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
                        className={`h-1.5 rounded-full transition-all ${isCurrent ? 'w-4 bg-teal-600 dark:bg-teal-400' : done ? 'w-1.5 bg-teal-300 dark:bg-teal-700' : 'w-1.5 bg-slate-200 dark:bg-slate-800'}`}
                    />
                );
            })}
        </div>
    );
};

/* ── Empty / loading states ── */
const EmptyState = ({ icon: Icon, title, subtitle }) => (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <Icon size={28} className="text-slate-300 dark:text-slate-700" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</p>
        {subtitle && <p className="text-xs font-medium text-slate-400">{subtitle}</p>}
    </div>
);

/* ── Metric card ── */
const ModalityMetric = ({ icon: Icon, label, value, tone }) => {
    const c = metricTones[tone];
    return (
        <article className={`flex items-center gap-3.5 p-4 ${cardClass}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${c.bg} ${c.ring}`}>
                <Icon size={19} className={c.text} />
            </span>
            <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-slate-900 dark:text-white">{value}</p>
            </div>
        </article>
    );
};

const PatientAvatar = ({ exam }) => (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${exam.is_overdue ? 'bg-rose-600' : 'bg-slate-700 dark:bg-slate-600'}`}>
        {(exam.patient_name || exam.mrn || 'P')[0]?.toUpperCase()}
    </span>
);

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════ */
const Modality = () => {
    const { t, i18n } = useTranslation('clinicalQueues');
    const { data: queueResponse, isLoading, refetch } = useGetQueueQuery({ station: 'Modality', limit: 100 });
    const [transitionQueue, { isLoading: isMoving }] = useTransitionQueueMutation();
    const [getTemplates] = api.endpoints.getSafetyTemplates.useLazyQuery();

    const [safetyExam, setSafetyExam] = useState(null);
    const [safetyTemplate, setSafetyTemplate] = useState(null);
    const [holdExam, setHoldExam] = useState(null);
    const [cancelExam, setCancelExam] = useState(null);

    const activeExams = useMemo(() => queueResponse?.data || [], [queueResponse?.data]);

    const summary = useMemo(() => ({
        ready: activeExams.filter((exam) => exam.queue_stage === 'Ready for Exam').length,
        scanning: activeExams.filter((exam) => exam.queue_stage === 'In Exam').length,
        overdue: activeExams.filter((exam) => exam.is_overdue).length,
    }), [activeExams]);

    const move = async (exam, payload) => {
        if (payload.toStage === 'In Exam') {
            try {
                const templates = await getTemplates(exam.modality_id).unwrap();
                if (templates && templates.length > 0) {
                    setSafetyTemplate(templates[0]); // Use first active template for this modality
                    setSafetyExam(exam);
                    return; // Stop transition and wait for modal completion
                }
            } catch (err) {
                console.error(t('modality.templateError', { defaultValue: 'Failed to fetch safety templates' }), err);
            }
        }
        executeTransition(exam, payload);
    };

    const executeTransition = async (exam, payload) => {
        try {
            await transitionQueue({ examId: exam.exam_id, ...payload }).unwrap();
            toast.success(payload.action === 'hold'
                ? t('common.held')
                : payload.action === 'release'
                    ? t('common.released')
                    : t('common.moved', { stage: t(`common.stages.${payload.toStage}`, { defaultValue: payload.toStage }) }));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('common.updateFailed')));
            return false;
        }
    };

    return (
        <div className="app-page">
            <div className="mx-auto max-w-screen-2xl pb-0">
                <PageHeader
                    icon={ScanLine}
                    eyebrow={t('modality.subtitle', { defaultValue: 'Clinical Operations' })}
                    title={t('modality.title')}
                    actions={(
                        <button
                            type="button"
                            onClick={refetch}
                            className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 outline-none transition-colors hover:bg-slate-50 hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                        >
                            <RefreshCcw size={15} className="transition-transform duration-500 group-hover:rotate-180" />
                            <span className="hidden sm:inline">{t('common.refresh')}</span>
                        </button>
                    )}
                />
            </div>
            {/* ── MAIN ── */}
            <div className="mx-auto max-w-screen-2xl space-y-4">

                <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <ModalityMetric icon={Zap} label={t('modality.ready')} value={summary.ready} tone="teal" />
                    <ModalityMetric icon={Activity} label={t('modality.inExam')} value={summary.scanning} tone="blue" />
                    <ModalityMetric icon={AlertTriangle} label={t('modality.overdue')} value={summary.overdue} tone="rose" />
                </section>

                <section className={`overflow-hidden ${cardClass}`}>
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/40">
                        <div className="flex items-center gap-2">
                            <ScanLine size={15} className="text-slate-400" />
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{t('modality.assigned', { defaultValue: 'Assigned Modality Queue' })}</h2>
                        </div>
                        <div className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <span className="tabular-nums">{activeExams.length}</span>{' '}
                            <span className="font-medium opacity-70">{t('common.active', { count: activeExams.length, defaultValue: 'Active' })}</span>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="space-y-3 p-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
                            ))}
                        </div>
                    ) : activeExams.length === 0 ? (
                        <EmptyState icon={Inbox} title={t('modality.emptyTitle')} subtitle={t('modality.emptyDescription')} />
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden overflow-x-auto md:block">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-250/50 bg-slate-50/50 dark:border-slate-800/50 dark:bg-slate-900/30">
                                            <th className="w-[180px] px-5 py-3.5 text-start text-xs font-black uppercase tracking-wide text-slate-450 dark:text-slate-400">{t('common.stage')}</th>
                                            <th className="px-5 py-3.5 text-start text-xs font-black uppercase tracking-wide text-slate-450 dark:text-slate-400">{t('common.patient')}</th>
                                            <th className="px-5 py-3.5 text-start text-xs font-black uppercase tracking-wide text-slate-450 dark:text-slate-400">{t('common.modality')}</th>
                                            <th className="px-5 py-3.5 text-start text-xs font-black uppercase tracking-wide text-slate-450 dark:text-slate-400">{t('common.wait')}</th>
                                            <th className="px-5 py-3.5 text-end text-xs font-black uppercase tracking-wide text-slate-450 dark:text-slate-400">{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                        {activeExams.map((exam) => {
                                            const acuity = ACUITY[exam.priority] || ACUITY.Routine;
                                            return (
                                                <tr key={exam.exam_id} className="group relative align-top transition-colors hover:bg-white/60 dark:hover:bg-slate-800/30">
                                                    <td className="relative px-5 py-4">
                                                        <span className={`absolute inset-y-2 left-0 w-1 rounded-full ${acuity.bar} ${exam.is_overdue ? 'animate-pulse' : ''}`} aria-hidden="true" />
                                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                            {t(`common.stages.${exam.queue_stage}`, { defaultValue: exam.queue_stage })}
                                                        </span>
                                                        <div className="mt-2">
                                                            <QueueStageTracker stage={exam.queue_stage} t={t} />
                                                        </div>
                                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                                            <PriorityBadge priority={exam.priority} t={t} />
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
                                                                <div className="truncate font-semibold text-slate-900 dark:text-white">{exam.patient_name || t('common.patientFallback')}</div>
                                                                <div className="mt-0.5 font-mono text-[11px] font-medium text-slate-400 ltr-embed">{exam.mrn}</div>
                                                                {exam.order_number && <div className="mt-0.5 font-mono text-[10px] text-slate-400 ltr-embed">{exam.order_number}</div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="max-w-xs px-5 py-4">
                                                        <div className="font-semibold text-slate-800 dark:text-slate-100">{exam.modality_name}</div>
                                                        <div className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{exam.exam_type_name || exam.modality_type || t('common.unknownModality')}{exam.body_part ? ` — ${exam.body_part}` : ''}</div>
                                                        {exam.clinical_indication && (
                                                            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                                                                <span className="font-semibold text-slate-700 dark:text-slate-200">{t('modality.indication', { defaultValue: 'Indication' })}:</span> {exam.clinical_indication}
                                                            </div>
                                                        )}
                                                        {exam.is_on_hold && exam.hold_reason && (
                                                            <div className="mt-1.5 rounded-lg border border-amber-100 bg-amber-50/70 p-2 text-[11px] font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                                                                <span className="font-semibold">{t('common.onHold')}:</span> {exam.hold_reason}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${exam.is_overdue ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50' : 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'}`}>
                                                            <Timer size={12} />
                                                            {formatDuration(exam.waiting_minutes || 0, i18n.language)}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 text-end">
                                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                                                            <ActionButton icon={XCircle} label={t('common.cancel', { defaultValue: 'Cancel' })} tone="rose" disabled={isMoving} onClick={() => setCancelExam(exam)} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile cards */}
                            <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                                {activeExams.map((exam) => (
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
                                        onCancel={() => setCancelExam(exam)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </section>
            </div>

            <SafetyFormModal
                isOpen={!!safetyExam}
                onClose={() => { setSafetyExam(null); setSafetyTemplate(null); }}
                examId={safetyExam?.exam_id}
                template={safetyTemplate}
                onComplete={() => {
                    executeTransition(safetyExam, { toStage: 'In Exam' });
                    setSafetyExam(null);
                    setSafetyTemplate(null);
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

            <CancelReasonDialog
                isOpen={Boolean(cancelExam)}
                patientName={cancelExam?.patient_name}
                isSaving={isMoving}
                onClose={() => setCancelExam(null)}
                onConfirm={async (reason) => {
                    const succeeded = await executeTransition(cancelExam, { toStage: 'Cancelled', reason });
                    if (succeeded) setCancelExam(null);
                }}
            />
        </div>
    );
};

/* ── Action button (shared visual language with Nurse page) ── */
const ActionButton = ({ icon: Icon, label, tone, disabled, onClick, solid = false }) => {
    const tones = {
        teal: solid
            ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm hover:brightness-110 active:scale-[0.98]'
            : 'bg-white/80 text-teal-700 ring-1 ring-slate-200 hover:bg-teal-50 hover:text-teal-900 dark:bg-slate-900/80 dark:text-teal-400 dark:ring-slate-800',
        blue: solid
            ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm hover:brightness-110 active:scale-[0.98]'
            : 'bg-white/80 text-blue-700 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-900 dark:bg-slate-900/80 dark:text-blue-400 dark:ring-slate-800',
        emerald: 'bg-white/80 text-emerald-700 ring-1 ring-slate-200 hover:bg-emerald-50 hover:text-emerald-900 dark:bg-slate-900/80 dark:text-emerald-400 dark:ring-slate-800',
        amber: 'bg-white/80 text-amber-700 ring-1 ring-slate-200 hover:bg-amber-50 hover:text-amber-900 dark:bg-slate-900/80 dark:text-amber-400 dark:ring-slate-800',
        rose: solid
            ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm hover:brightness-110 active:scale-[0.98]'
            : 'bg-white/80 text-rose-700 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-900 dark:bg-slate-900/80 dark:text-rose-400 dark:ring-slate-800',
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

const ModalityQueueCard = ({ exam, t, locale, isMoving, onRelease, onHold, onStart, onComplete, onCancel }) => {
    const acuity = ACUITY[exam.priority] || ACUITY.Routine;
    return (
        <article className={`relative overflow-hidden p-4 ${exam.is_overdue ? 'bg-rose-50/20 dark:bg-rose-950/10' : 'bg-white dark:bg-[#0a0f1c]'}`}>
            <span className={`absolute inset-y-0 left-0 w-1 ${acuity.bar} ${exam.is_overdue ? 'animate-pulse' : ''}`} aria-hidden="true" />

            <div className="flex items-start justify-between gap-3 pl-2">
                <div className="flex min-w-0 items-center gap-3">
                    <PatientAvatar exam={exam} />
                    <div className="min-w-0">
                        <h2 className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{exam.patient_name || t('common.patientFallback')}</h2>
                        <p className="mt-0.5 font-mono text-[11px] font-medium text-slate-400 ltr-embed">{exam.mrn}</p>
                    </div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${exam.is_overdue ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50' : 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'}`}>
                    <Timer size={12} />
                    {formatDuration(exam.waiting_minutes || 0, locale)}
                </span>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50/80 p-3 pl-2 ring-1 ring-slate-100 dark:bg-slate-900/50 dark:ring-slate-800">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{exam.exam_type_name || exam.modality_type || t('common.unknownModality')}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{exam.modality_name}{exam.body_part ? ` — ${exam.body_part}` : ''}</p>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200/60 pt-3 dark:border-slate-800">
                    <QueueStageTracker stage={exam.queue_stage} t={t} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {t(`common.stages.${exam.queue_stage}`, { defaultValue: exam.queue_stage })}
                    </span>
                </div>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5 pl-2">
                <PriorityBadge priority={exam.priority} t={t} />
                {exam.is_on_hold && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/50">
                        <PauseCircle size={11} /> {t('common.onHold')}
                    </span>
                )}
            </div>

            {exam.clinical_indication && (
                <div className="mt-2.5 ml-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{t('modality.indication', { defaultValue: 'Indication' })}:</span> {exam.clinical_indication}
                </div>
            )}

            {exam.is_on_hold && exam.hold_reason && (
                <div className="mt-2.5 ml-2 rounded-lg border border-amber-100 bg-amber-50/70 p-2.5 text-[11px] font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                    <span className="font-semibold">{t('common.onHold')}:</span> {exam.hold_reason}
                </div>
            )}

            <div className="mt-3.5 flex gap-2 pl-2">
                {exam.is_on_hold ? (
                    <button disabled={isMoving} onClick={onRelease} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2.5 text-xs font-semibold text-emerald-700 ring-1 ring-slate-200 transition-colors hover:bg-emerald-50 disabled:opacity-40 dark:bg-slate-900 dark:text-emerald-400 dark:ring-slate-800">
                        <PlayCircle size={14} /> {t('common.release')}
                    </button>
                ) : (
                    <button disabled={isMoving} onClick={onHold} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2.5 text-xs font-semibold text-amber-700 ring-1 ring-slate-200 transition-colors hover:bg-amber-50 disabled:opacity-40 dark:bg-slate-900 dark:text-amber-400 dark:ring-slate-800">
                        <PauseCircle size={14} /> {t('common.hold')}
                    </button>
                )}
                {exam.queue_stage === 'Ready for Exam' && (
                    <button disabled={isMoving || exam.is_on_hold} onClick={onStart} className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-40">
                        <Play size={14} /> {t('modality.start')}
                    </button>
                )}
                {exam.queue_stage === 'In Exam' && (
                    <button disabled={isMoving || exam.is_on_hold} onClick={onComplete} className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-40">
                        <CheckCircle2 size={14} /> {t('modality.complete')}
                    </button>
                )}
                <button disabled={isMoving} onClick={onCancel} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2.5 text-xs font-semibold text-rose-700 ring-1 ring-slate-200 transition-colors hover:bg-rose-50 disabled:opacity-40 dark:bg-slate-900 dark:text-rose-400 dark:ring-slate-800">
                    <XCircle size={14} /> {t('common.cancel', { defaultValue: 'Cancel' })}
                </button>
                <button onClick={() => {
                    const copies = window.prompt(t('common.stickerCopiesPrompt'), t('common.stickerCopiesDefault'));
                    if (copies && parseInt(copies, 10) > 0) {
                        window.open(`/print/sticker/${exam.appointment_id}?copies=${parseInt(copies, 10)}`, '_blank');
                    }
                }} className="flex items-center justify-center rounded-lg bg-white px-3 py-2.5 text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800" title={t('common.printSticker', { defaultValue: 'Print Sticker' })}>
                    <Printer size={14} />
                </button>
            </div>
        </article>
    );
};

export default Modality;
