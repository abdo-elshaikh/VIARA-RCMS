import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import {
    AlertTriangle,
    ArrowRight,
    Banknote,
    CheckCircle2,
    ClipboardList,
    Clock3,
    FileCheck2,
    FileText,
    FlaskConical,
    LockKeyhole,
    Microscope,
    MoreHorizontal,
    PackageCheck,
    Printer,
    Radio,
    Search,
    Stethoscope,
    Tag,
    Users,
    XCircle,
} from 'lucide-react';
import PriorityBadge from '../ui/PriorityBadge';
import { selectCurrentUser } from '../../store/authSlice';
import { formatDuration } from '../../utils/dateFormat';
import { getEffectivePermissions } from '../../utils/effectivePermissions';
import { getValidQueueTransitions } from './receptionLogic';

const ALL_STAGES = [
    'Registered', 'Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending',
    'Ready for Exam', 'In Exam', 'Reporting', 'Finalized', 'Delivered',
];

const priorityTone = {
    Emergency: 'border-s-4 border-s-rose-500',
    Urgent:    'border-s-4 border-s-amber-500',
    Routine:   'border-s-4 border-slate-300 dark:border-slate-700',
};

const STAGE_BADGE = {
    Scheduled:        'bg-slate-100/70   text-slate-700  ring-slate-300/60  dark:bg-slate-800/40  dark:text-slate-300  dark:ring-slate-700/60',
    Arrived:          'bg-teal-50         text-teal-800   ring-teal-200      dark:bg-teal-500/15   dark:text-teal-300   dark:ring-teal-500/25',
    'Payment Pending':'bg-amber-50        text-amber-800  ring-amber-200     dark:bg-amber-500/15  dark:text-amber-300  dark:ring-amber-500/25',
    'Prep Pending':   'bg-amber-50        text-amber-800  ring-amber-200     dark:bg-amber-500/15  dark:text-amber-300  dark:ring-amber-500/25',
    'Ready for Exam': 'bg-cyan-50         text-cyan-800   ring-cyan-200      dark:bg-cyan-500/15   dark:text-cyan-300   dark:ring-cyan-500/25',
    'In Exam':        'bg-indigo-50       text-indigo-800 ring-indigo-200    dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25',
    Reporting:        'bg-violet-50       text-violet-800 ring-violet-200    dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25',
    Finalized:        'bg-emerald-50      text-emerald-800 ring-emerald-200  dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25',
    Delivered:        'bg-slate-100/70   text-slate-700  ring-slate-300/60  dark:bg-slate-800/40  dark:text-slate-300  dark:ring-slate-700/60',
};

// Primary action button colour + icon per next-stage
const STAGE_ACTION = {
    Arrived:          { icon: CheckCircle2,  btnClass: 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm shadow-teal-600/20 dark:bg-teal-500 dark:hover:bg-teal-400' },
    'Payment Pending':{ icon: Banknote,      btnClass: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/20' },
    'Prep Pending':   { icon: FlaskConical,  btnClass: 'bg-cyan-600  text-white hover:bg-cyan-700  shadow-sm shadow-cyan-600/20  dark:bg-cyan-500  dark:hover:bg-cyan-400' },
    'Ready for Exam': { icon: Stethoscope,   btnClass: 'bg-cyan-600  text-white hover:bg-cyan-700  shadow-sm dark:bg-cyan-500 dark:hover:bg-cyan-400' },
    'In Exam':        { icon: Radio,         btnClass: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 dark:bg-indigo-500 dark:hover:bg-indigo-400' },
    Reporting:        { icon: Microscope,    btnClass: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-600/20 dark:bg-violet-500 dark:hover:bg-violet-400' },
    Finalized:        { icon: FileCheck2,    btnClass: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20' },
    Delivered:        { icon: PackageCheck,  btnClass: 'bg-slate-700 text-white hover:bg-slate-800 shadow-sm dark:bg-slate-600 dark:hover:bg-slate-500' },
    Cancelled:        { icon: XCircle,       btnClass: 'bg-rose-50 text-rose-700 hover:bg-rose-100 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/50' },
};

const QueueBoard = ({ items = [], onMove, onPickup, canManageQueue = false, canDeliverResults = false }) => {
    const { t, i18n } = useTranslation('reception');
    const isRtl = i18n?.language?.startsWith('ar');
    const user  = useSelector(selectCurrentUser);

    const [activeStageMenu, setActiveStageMenu] = useState(null);
    const [activePrintMenu, setActivePrintMenu] = useState(null);
    const [searchTerm, setSearchTerm]           = useState('');

    const permissions    = getEffectivePermissions(user);
    const hasPermission  = (p) => user?.role === 'Developer' || permissions.has(p);
    const canPrintLabels = hasPermission('PRINT_LABELS');
    const canPrintReceipts = hasPermission('PRINT_RECEIPTS');

    const filteredItems = useMemo(() => {
        const query = searchTerm.trim().toLocaleLowerCase();
        if (!query) return items;
        return items.filter((item) =>
            [item.patient_name, item.mrn, item.exam_type_name, item.modality_name]
                .filter(Boolean)
                .some((v) => String(v).toLocaleLowerCase().includes(query))
        );
    }, [items, searchTerm]);

    const overdueCount = filteredItems.filter((i) => i.is_overdue).length;
    const activeCount  = filteredItems.filter((i) => !['Delivered', 'Finalized'].includes(i.queue_stage)).length;

    const stageLabel = (stage) => t(`queue.stages.${stage}`, { defaultValue: stage });

    const handlePrint = (item, type) => {
        const url = type === 'sticker'
            ? `/print/sticker/${item.appointment_id}?copies=1`
            : `/print/receipt/${item.appointment_id}`;
        window.open(url, '_blank');
        setActivePrintMenu(null);
    };

    // ── Smart stage cell ───────────────────────────────────────────────────────
    const renderStageCell = (item) => {
        const stage       = item.queue_stage;
        const validStages = getValidQueueTransitions(stage).filter((s) => ALL_STAGES.includes(s));
        const badgeClass  = STAGE_BADGE[stage] || STAGE_BADGE.Scheduled;

        // Read-only: just show the badge
        if (!canManageQueue || validStages.length === 0) {
            return (
                <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10.5px] font-extrabold ring-1 ${badgeClass}`}>
                    {stageLabel(stage)}
                </span>
            );
        }

        const primaryNext   = validStages.find((s) => s !== 'Cancelled');
        const secondaryList = validStages.filter((s) => s !== primaryNext);
        const primaryCfg    = primaryNext ? STAGE_ACTION[primaryNext] : null;
        const PrimaryIcon   = primaryCfg?.icon ?? ArrowRight;

        return (
            <div className="flex min-w-0 items-center gap-1.5">
                {/* Current stage badge */}
                <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold ring-1 ${badgeClass}`}>
                    {stageLabel(stage)}
                </span>

                {/* Primary next-stage action */}
                {primaryNext && (
                    <button
                        type="button"
                        title={`${t('queue.transitionTo', { defaultValue: 'Move to' })}: ${stageLabel(primaryNext)}`}
                        onClick={() => { onMove(item, primaryNext); setActiveStageMenu(null); }}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-black transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${primaryCfg?.btnClass ?? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm'}`}
                    >
                        <PrimaryIcon size={11} className="shrink-0" />
                        <span className="hidden xl:inline">{stageLabel(primaryNext)}</span>
                        <ArrowRight size={10} className="shrink-0 opacity-70 hidden xl:inline" />
                    </button>
                )}

                {/* More options button */}
                {secondaryList.length > 0 && (
                    <div className="relative">
                        <button
                            type="button"
                            title={t('queue.moreOptions', { defaultValue: 'More stage options' })}
                            onClick={() => {
                                setActivePrintMenu(null);
                                setActiveStageMenu(activeStageMenu === item.exam_id ? null : item.exam_id);
                            }}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                        >
                            <MoreHorizontal size={13} />
                        </button>

                        {activeStageMenu === item.exam_id && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setActiveStageMenu(null)} />
                                <div className="absolute bottom-full end-0 z-40 mb-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
                                    <p className="border-b border-slate-100 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
                                        {t('queue.otherOptions', { defaultValue: 'Other transitions' })}
                                    </p>
                                    <div className="p-1.5">
                                        {secondaryList.map((next) => {
                                            const cfg      = STAGE_ACTION[next];
                                            const ListIcon = cfg?.icon ?? ArrowRight;
                                            const isCancel = next === 'Cancelled';
                                            return (
                                                <button
                                                    key={next}
                                                    type="button"
                                                    onClick={() => { onMove(item, next); setActiveStageMenu(null); }}
                                                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-xs font-bold transition ${
                                                        isCancel
                                                            ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30'
                                                            : 'text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                                                        isCancel ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/40' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                    }`}>
                                                        <ListIcon size={12} />
                                                    </span>
                                                    <span className="truncate">{stageLabel(next)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <section
            className="app-panel overflow-hidden backdrop-blur-xl bg-white/70 shadow-sm border border-slate-200/60 dark:bg-slate-900/50 dark:border-slate-800/60"
            aria-labelledby="live-queue-title"
        >
            {/* ── Header ── */}
            <header className="border-b border-slate-200/50 px-4 py-4 dark:border-slate-800/50 sm:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-gradient-to-br from-cyan-400/20 to-cyan-500/20 text-cyan-700 ring-1 ring-cyan-200/50 dark:from-cyan-400/10 dark:to-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20">
                            <ClipboardList size={19} />
                        </span>
                        <div className="min-w-0">
                            <h2 id="live-queue-title" className="text-base font-black text-slate-950 dark:text-white">
                                {t('queue.title', { defaultValue: 'Live patient queue' })}
                            </h2>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {t('queue.summary', { total: filteredItems.length, overdue: overdueCount, defaultValue: '{{total}} active cases across the care journey' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200/50 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700/50">
                            <Users size={14} /> {activeCount} {t('queue.active', { defaultValue: 'active' })}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold shadow-sm ring-1 ${
                            overdueCount
                                ? 'bg-rose-50/80 text-rose-700 ring-rose-200/50 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20'
                                : 'bg-emerald-50/80 text-emerald-700 ring-emerald-200/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
                        }`}>
                            <AlertTriangle size={14} /> {overdueCount} {t('queue.overdue', { defaultValue: 'overdue' })}
                        </span>
                        {!canManageQueue && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/60 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200/50 dark:bg-slate-800/50 dark:text-slate-400 dark:ring-slate-700/50">
                                <LockKeyhole size={14} /> {t('queue.readOnly', { defaultValue: 'Read only' })}
                            </span>
                        )}
                        <label className="relative min-w-[15rem] flex-1 xl:flex-none">
                            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <span className="sr-only">{t('queue.search', { defaultValue: 'Search queue' })}</span>
                            <input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t('queue.searchPlaceholder', { defaultValue: 'Search patient, MRN, or exam' })}
                                className="h-9 w-full rounded-xl border border-slate-200/70 bg-white/80 ps-9 pe-3 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-white"
                            />
                        </label>
                    </div>
                </div>
            </header>

            {/* ── Table ── */}
            <div className="overflow-x-auto">
                <table className="min-w-[860px] w-full text-start">
                    <thead className="border-b border-slate-200/50 bg-slate-50/50 dark:border-slate-800/50 dark:bg-slate-900/30">
                        <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <th className="px-4 py-3 font-black sm:px-6">{t('queue.columns.patient', { defaultValue: 'Patient' })}</th>
                            <th className="px-3 py-3 font-black">{t('queue.columns.exam', { defaultValue: 'Examination' })}</th>
                            <th className="px-3 py-3 font-black">{t('queue.columns.priority', { defaultValue: 'Priority' })}</th>
                            <th className="px-3 py-3 font-black">{t('queue.columns.status', { defaultValue: 'Status & Action' })}</th>
                            <th className="px-3 py-3 font-black">{t('queue.columns.wait', { defaultValue: 'Wait time' })}</th>
                            <th className="px-4 py-3 text-end font-black sm:px-6">{t('queue.columns.actions', { defaultValue: 'Actions' })}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/50">
                        {filteredItems.map((item) => (
                            <tr
                                key={item.exam_id}
                                className={`group transition-all duration-150 hover:bg-white/60 dark:hover:bg-slate-800/40 ${
                                    item.is_overdue ? 'bg-rose-50/30 dark:bg-rose-500/5' : 'bg-transparent'
                                }`}
                            >
                                {/* Patient */}
                                <td className={`px-4 py-3 sm:px-6 ${priorityTone[item.priority] || priorityTone.Routine}`}>
                                    <div className="min-w-[180px]">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-black text-slate-900 dark:text-white">
                                                {item.patient_name || t('fallback.unnamed')}
                                            </span>
                                            {item.is_on_hold && (
                                                <span className="rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[9px] font-black text-amber-800 ring-1 ring-amber-200/50 dark:bg-amber-500/20 dark:text-amber-300">
                                                    {t('common.onHold', { defaultValue: 'On hold' })}
                                                </span>
                                            )}
                                        </div>
                                        <span className="mt-0.5 block font-mono text-[10px] text-slate-400 ltr-embed">
                                            {item.mrn || '-'}
                                        </span>
                                    </div>
                                </td>

                                {/* Exam */}
                                <td className="max-w-[200px] px-3 py-3">
                                    <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-300">
                                        {item.exam_type_name || item.modality_name || '-'}
                                    </p>
                                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                                        {item.machine_name || item.modality_name || ''}
                                    </p>
                                </td>

                                {/* Priority */}
                                <td className="px-3 py-3">
                                    <PriorityBadge priority={item.priority} />
                                </td>

                                {/* Status + smart action */}
                                <td className="px-3 py-3">
                                    {renderStageCell(item)}
                                </td>

                                {/* Wait */}
                                <td className="px-3 py-3">
                                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-black tabular-nums ${
                                        item.is_overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'
                                    }`}>
                                        <Clock3 size={13} />
                                        {formatDuration(item.waiting_minutes || 0, i18n.language)}
                                    </span>
                                </td>

                                {/* Actions */}
                                <td className="px-4 py-3 sm:px-6">
                                    <div className="flex items-center justify-end gap-1.5">
                                        {/* Pickup (Finalized) */}
                                        {canDeliverResults && item.queue_stage === 'Finalized' && (
                                            <button
                                                type="button"
                                                onClick={() => onPickup(item)}
                                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10.5px] font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                                            >
                                                <PackageCheck size={12} />
                                                {t('queue.pickup', { defaultValue: 'Pickup' })}
                                            </button>
                                        )}

                                        {/* Print */}
                                        {(canPrintLabels || canPrintReceipts) && (
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveStageMenu(null);
                                                        setActivePrintMenu(activePrintMenu === item.exam_id ? null : item.exam_id);
                                                    }}
                                                    title={t('queue.print', { defaultValue: 'Print documents' })}
                                                    aria-label={t('queue.print', { defaultValue: 'Print documents' })}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                                                >
                                                    <Printer size={14} />
                                                </button>
                                                {activePrintMenu === item.exam_id && (
                                                    <>
                                                        <div className="fixed inset-0 z-30" onClick={() => setActivePrintMenu(null)} />
                                                        <div className="absolute bottom-full end-0 z-40 mb-1.5 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
                                                            <div className="p-1.5">
                                                                {canPrintLabels && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handlePrint(item, 'sticker')}
                                                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs font-bold text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                                                    >
                                                                        <Tag size={13} className="text-teal-600 dark:text-teal-400" />
                                                                        {t('queue.sticker', { defaultValue: 'Sticker' })}
                                                                    </button>
                                                                )}
                                                                {canPrintReceipts && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handlePrint(item, 'receipt')}
                                                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs font-bold text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                                                    >
                                                                        <FileText size={13} className="text-cyan-600 dark:text-cyan-400" />
                                                                        {t('queue.receipt', { defaultValue: 'Receipt' })}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* Read-only indicator */}
                                        {!canManageQueue && !canDeliverResults && !canPrintLabels && !canPrintReceipts && (
                                            <span title={t('queue.readOnlyHint', { defaultValue: 'Read-only queue' })} className="text-slate-400/70">
                                                <LockKeyhole size={15} />
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Empty state */}
                {filteredItems.length === 0 && (
                    <div className="flex min-h-[16rem] flex-col items-center justify-center px-6 text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50/60 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:ring-emerald-500/20">
                            <CheckCircle2 size={28} className="text-emerald-500" />
                        </div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {t('queue.empty', { defaultValue: 'No queue cases found' })}
                        </p>
                        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                            {searchTerm
                                ? t('queue.emptySearch', { defaultValue: 'Try a different search.' })
                                : t('queue.emptyHint',   { defaultValue: 'The live queue is clear.' })
                            }
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
};

export default QueueBoard;
