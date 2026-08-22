import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { ClipboardList, PauseCircle, PlayCircle, UserCheck, Syringe, Clock, AlertTriangle, Edit3, Users, Stethoscope, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { useGetQueueQuery, useTransitionQueueMutation, useGetStockMovementsQuery } from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import ConsumeItemModal from '../components/inventory/ConsumeItemModal';
import HoldReasonDialog from '../components/clinical/HoldReasonDialog';
import EditComplaintDialog from '../components/clinical/EditComplaintDialog';
import EditSafetyDialog from '../components/clinical/EditSafetyDialog';
import { formatDuration } from '../utils/dateFormat';
import PageHeader from '../components/ui/PageHeader';

const cardClass = 'overflow-hidden rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-sm';

const ACUITY = {
    Emergency: { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', ring: 'ring-rose-200 dark:ring-rose-900/50', bg: 'bg-rose-50 dark:bg-rose-950/30' },
    Urgent: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', ring: 'ring-amber-200 dark:ring-amber-900/50', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    Routine: { bar: 'bg-slate-300 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', ring: 'ring-slate-200 dark:ring-slate-800', bg: 'bg-slate-50 dark:bg-slate-900/50' },
};

const Nurse = () => {
    const { t, i18n } = useTranslation('clinicalQueues');
    const { data: queueResponse, isLoading } = useGetQueueQuery({ station: 'Nurse', limit: 100 });
    const [transitionQueue, { isLoading: isMoving }] = useTransitionQueueMutation();
    const { data: stockMovements = [] } = useGetStockMovementsQuery();
    const [consumeExamId, setConsumeExamId] = useState(null);
    const [holdItem, setHoldItem] = useState(null);
    const [editComplaintItem, setEditComplaintItem] = useState(null);
    const [editSafetyItem, setEditSafetyItem] = useState(null);
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const items = queueResponse?.data || [];

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
            toast.error(getErrorMessage(error, t('common.updateFailed')));
            return false;
        }
    };

    const total = queueResponse?.kpis?.total || 0;
    const overdue = queueResponse?.kpis?.overdue || 0;
    const onHold = items.filter((i) => i.is_on_hold).length;
    const toggleExpanded = (examId) => setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(examId)) next.delete(examId);
        else next.add(examId);
        return next;
    });

    return (
        <div className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-4">
                <PageHeader
                    icon={Stethoscope}
                    title={t('nurse.title')}
                    description={t('nurse.description')}
                    actions={(
                        <div className="flex flex-wrap items-center gap-2">
                            <StatChip icon={Users} label={t('nurse.active')} value={total} />
                            <StatChip icon={AlertTriangle} label={t('nurse.overdue')} value={overdue} alert={overdue > 0} />
                            <StatChip icon={PauseCircle} label={t('common.onHold')} value={onHold} muted />
                        </div>
                    )}
                />
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
                            ) : items.length === 0 ? (
                                <tr><td colSpan={5}><EmptyState label={t('nurse.emptyTitle')} /></td></tr>
                            ) : items.map((item) => {
                                const acuity = ACUITY[item.priority] || ACUITY.Routine;
                                const consumed = stockMovements.filter((m) => m.reference_type === 'Exam' && m.reference_id === item.exam_id);
                                const consumedTotal = consumed.reduce((sum, movement) => sum + Number(movement.total_amount || (Math.abs(Number(movement.quantity_change || 0)) * Number(movement.unit_price || 0))), 0);
                                const expanded = expandedIds.has(item.exam_id);
                                return (
                                    <React.Fragment key={item.exam_id}>
                                        <tr className="group relative align-top transition-colors hover:bg-[var(--VIARA-surface-hover)]">
                                            <td className="relative py-4 pe-4 ps-5">
                                                <span className={`absolute inset-y-2 start-0 w-1 rounded-full ${acuity.bar} ${item.is_overdue ? 'animate-pulse' : ''}`} aria-hidden="true" />
                                                <div className="font-semibold text-[var(--VIARA-ink)]">{item.patient_name || t('common.patientFallback')}</div>
                                                <div className="mt-0.5 font-mono text-[11px] font-medium tracking-wide text-[var(--VIARA-muted)] ltr-embed">{item.mrn}</div>
                                                <div className="mt-0.5 font-mono text-[10px] font-medium uppercase text-[var(--VIARA-muted)]/80">{item.order_number}</div>
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
                                                    <SafetyChecklistBadge type="Pregnancy" status={item.pregnancy_safety_status} onClick={() => setEditSafetyItem(item)} t={t} />
                                                    <SafetyChecklistBadge type="Implant" status={item.implant_safety_status} onClick={() => setEditSafetyItem(item)} t={t} />
                                                    <SafetyChecklistBadge type="Renal" status={item.renal_safety_status} onClick={() => setEditSafetyItem(item)} t={t} />
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
                                                    <button
                                                        onClick={() => setEditComplaintItem(item)}
                                                        className="mt-0.5 shrink-0 rounded-md p-1.5 text-[var(--VIARA-muted)] opacity-0 outline-none transition-all hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),.2)] group-hover:opacity-100"
                                                        title={t('nurse.editComplaint')}
                                                    >
                                                        <Edit3 size={14} strokeWidth={2.25} />
                                                    </button>
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
                                                </div>
                                                {item.is_on_hold && (
                                                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50">
                                                        <PauseCircle size={12} /> {item.hold_reason || t('nurse.noHoldReason')}
                                                    </div>
                                                )}
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
                                                    {item.is_on_hold ? (
                                                        <ActionButton icon={PlayCircle} label={t('common.release')} tone="emerald" disabled={isMoving} onClick={() => move(item, { action: 'release' })} />
                                                    ) : (
                                                        <ActionButton icon={PauseCircle} label={t('common.hold')} tone="amber" disabled={isMoving} onClick={() => setHoldItem(item)} />
                                                    )}
                                                    {item.queue_stage !== 'Prep Pending' && (
                                                        <ActionButton icon={ClipboardList} label={t('nurse.startPrep')} tone="slate" disabled={isMoving || item.is_on_hold} onClick={() => move(item, { toStage: 'Prep Pending' })} />
                                                    )}
                                                    {item.queue_stage === 'Prep Pending' && (
                                                        <ActionButton icon={Syringe} label={t('nurse.consumeSupplies')} tone="slate" disabled={item.is_on_hold} onClick={() => setConsumeExamId(item.exam_id)} />
                                                    )}
                                                    <ActionButton icon={UserCheck} label={t('nurse.ready')} tone="teal" solid disabled={isMoving || item.is_on_hold} onClick={() => move(item, { toStage: 'Ready for Exam' })} />
                                                </div>
                                            </td>
                                        </tr>
                                        {expanded && <tr className="bg-[var(--VIARA-surface-muted)]/55"><td colSpan={5} className="px-5 py-3"><div className="grid gap-3 md:grid-cols-3"><DetailBlock label={t('nurse.complaint', { defaultValue: 'Complaint' })} value={item.clinical_indication || t('nurse.notRecorded', { defaultValue: 'Not recorded' })} /><DetailBlock label={t('nurse.instructions', { defaultValue: 'Instructions' })} value={item.preparation_instructions || t('nurse.notRecorded', { defaultValue: 'Not recorded' })} /><DetailBlock label={t('nurse.supplies', { defaultValue: 'Consumed supplies' })} value={consumed.length ? consumed.map((m) => t('nurse.quantity', { name: m.item_name, count: Math.abs(m.quantity_change) })).join(', ') : t('nurse.none', { defaultValue: 'None recorded' })} /></div></td></tr>}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </section>

                <section className="space-y-3 md:hidden">
                    {isLoading ? (
                        <div className={`${cardClass}`}><LoadingState label={t('nurse.loading')} /></div>
                    ) : items.length === 0 ? (
                        <div className={`${cardClass}`}><EmptyState label={t('nurse.emptyTitle')} /></div>
                    ) : items.map((item) => (
                        <NurseQueueCard
                            key={item.exam_id}
                            item={item}
                            t={t}
                            locale={i18n.language}
                            isMoving={isMoving}
                            stockMovements={stockMovements}
                            onRelease={() => move(item, { action: 'release' })}
                            onHold={() => setHoldItem(item)}
                            onStartPrep={() => move(item, { toStage: 'Prep Pending' })}
                            onConsume={() => setConsumeExamId(item.exam_id)}
                            onReady={() => move(item, { toStage: 'Ready for Exam' })}
                            onEditComplaint={() => setEditComplaintItem(item)}
                            onEditSafety={() => setEditSafetyItem(item)}
                            expanded={expandedIds.has(item.exam_id)}
                            onToggleDetails={() => toggleExpanded(item.exam_id)}
                        />
                    ))}
                </section>

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

            </div>
        </div>
    );
};

const StatChip = ({ icon: Icon, label, value, alert, muted }) => (
    <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${alert
            ? 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30'
            : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]'
            }`}
    >
        <Icon size={15} className={alert ? 'text-rose-600 dark:text-rose-400' : muted ? 'text-[var(--VIARA-muted)]' : 'text-[var(--VIARA-accent)]'} />
        <div className="leading-tight">
            <div className={`text-sm font-bold ${alert ? 'text-rose-700 dark:text-rose-400' : 'text-[var(--VIARA-ink)]'}`}>{value}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--VIARA-muted)]">{label}</div>
        </div>
    </div>
);

const LoadingState = ({ label }) => (
    <div className="flex flex-col items-center gap-2 p-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--VIARA-line)] border-t-[var(--VIARA-accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--VIARA-muted)]">{label}</span>
    </div>
);

const EmptyState = ({ label }) => (
    <div className="flex flex-col items-center gap-2 p-16 text-center">
        <UserCheck size={28} className="text-[var(--VIARA-muted)]" />
        <span className="text-sm font-medium text-[var(--VIARA-muted)]">{label}</span>
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

const NurseQueueCard = ({ item, t, locale, isMoving, stockMovements, onRelease, onHold, onStartPrep, onConsume, onReady, onEditComplaint, onEditSafety, expanded, onToggleDetails }) => {
    const acuity = ACUITY[item.priority] || ACUITY.Routine;
    const consumed = stockMovements?.filter((m) => m.reference_type === 'Exam' && m.reference_id === item.exam_id) || [];
    const consumedTotal = consumed.reduce((sum, movement) => sum + Number(movement.total_amount || (Math.abs(Number(movement.quantity_change || 0)) * Number(movement.unit_price || 0))), 0);

    return (
        <article className={`relative overflow-hidden p-4 ${cardClass}`}>
            <span className={`absolute inset-y-0 start-0 w-1 ${acuity.bar} ${item.is_overdue ? 'animate-pulse' : ''}`} aria-hidden="true" />

            <div className="flex items-start justify-between gap-3 ps-2">
                <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-bold text-[var(--VIARA-ink)]">{item.patient_name || t('common.patientFallback')}</h2>
                    <p className="mt-0.5 font-mono text-[11px] font-medium tracking-wide text-[var(--VIARA-muted)] ltr-embed">{item.mrn}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${item.is_overdue ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-ink)] ring-[var(--VIARA-line)] dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'}`}>
                    <Clock size={12} />
                    {formatDuration(item.waiting_minutes || 0, locale)}
                </span>
                <button type="button" onClick={onToggleDetails} aria-expanded={expanded} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-black text-[var(--VIARA-muted)] ring-1 ring-[var(--VIARA-line)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)] dark:text-slate-300 dark:ring-slate-800">
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {t(expanded ? 'nurse.hideDetails' : 'nurse.showDetails', { defaultValue: expanded ? 'Hide details' : 'Details' })}
                </button>
            </div>

            <div className="mt-3 rounded-xl bg-[var(--VIARA-surface-muted)] p-3 ps-2 ring-1 ring-[var(--VIARA-line)]">
                <p className="font-semibold text-[var(--VIARA-ink)]">{item.exam_type_name || item.modality_name}</p>
                <p className="mt-0.5 text-xs font-medium text-[var(--VIARA-muted)]">{item.modality_name}{item.body_part ? ` — ${item.body_part}` : ''}</p>

                <div className={`${expanded ? '' : 'hidden'} mt-2 text-xs font-medium text-[var(--VIARA-muted)]`}>
                    {item.technician_name ? `${t('nurse.tech')}: ${item.technician_name}` : t('nurse.noTech')} · {item.radiologist_name ? `${t('nurse.radiologist')}: ${item.radiologist_name}` : t('nurse.noRadiologist')}
                </div>

                <div className={`${expanded ? '' : 'hidden'} mt-2.5 flex flex-wrap gap-1.5`}>
                    <SafetyChecklistBadge type="Pregnancy" status={item.pregnancy_safety_status} onClick={onEditSafety} t={t} />
                    <SafetyChecklistBadge type="Implant" status={item.implant_safety_status} onClick={onEditSafety} t={t} />
                    <SafetyChecklistBadge type="Renal" status={item.renal_safety_status} onClick={onEditSafety} t={t} />
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
                </div>
            </div>

            <div className={`${expanded ? '' : 'hidden'} mt-3 flex items-start gap-1.5 ps-2`}>
                <div className="flex-1 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 text-xs leading-relaxed text-[var(--VIARA-muted)]">
                    <span className="font-semibold uppercase tracking-wide text-[var(--VIARA-muted)] text-[10px]">{t('nurse.complaint')}</span>
                    <p className="mt-0.5">{item.clinical_indication || <span className="italic text-[var(--VIARA-muted)]">{t('nurse.notRecorded')}</span>}</p>
                </div>
                <button
                    onClick={onEditComplaint}
                    className="mt-0.5 rounded-md p-1.5 text-[var(--VIARA-muted)] outline-none transition-colors hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)] focus-visible:ring-2 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),.2)]"
                    title={t('nurse.editComplaint')}
                >
                    <Edit3 size={14} strokeWidth={2.25} />
                </button>
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

            <div className="mt-3.5 flex flex-wrap gap-1.5 ps-2">
                {item.is_on_hold ? (
                    <ActionButton icon={PlayCircle} label={t('common.release')} tone="emerald" disabled={isMoving} onClick={onRelease} />
                ) : (
                    <ActionButton icon={PauseCircle} label={t('common.hold')} tone="amber" disabled={isMoving} onClick={onHold} />
                )}
                {item.queue_stage !== 'Prep Pending' && (
                    <ActionButton icon={ClipboardList} label={t('nurse.startPrep')} tone="slate" disabled={isMoving || item.is_on_hold} onClick={onStartPrep} />
                )}
                {item.queue_stage === 'Prep Pending' && (
                    <ActionButton icon={Syringe} label={t('nurse.consumeSupplies')} tone="slate" disabled={item.is_on_hold} onClick={onConsume} />
                )}
                <ActionButton icon={UserCheck} label={t('nurse.ready')} tone="teal" solid disabled={isMoving || item.is_on_hold} onClick={onReady} />
                <ActionButton icon={Printer} label={t('common.printSticker', { defaultValue: 'Print Sticker' })} tone="slate" onClick={() => {
                    const copies = window.prompt(t('common.stickerCopiesPrompt'), t('common.stickerCopiesDefault'));
                    if (copies && parseInt(copies, 10) > 0) {
                        window.open(`/print/sticker/${item.appointment_id}?copies=${parseInt(copies, 10)}`, '_blank');
                    }
                }} />
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
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),.2)] ${SAFETY_TONES[status] || SAFETY_TONES.Unknown} ${status === 'At Risk' ? 'animate-pulse' : ''}`}
    >
        {t ? t(`nurse.safety.${type}`, { defaultValue: type }) : type}: {t ? t(`nurse.safetyStatus.${status || 'Unknown'}`, { defaultValue: status || 'Unknown' }) : status || 'Unknown'}
    </button>
);

export default Nurse;
