import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ClipboardList,
    Clock3,
    FileText,
    LockKeyhole,
    Printer,
    Search,
    Tag,
    Users,
} from 'lucide-react';
import PriorityBadge from '../ui/PriorityBadge';
import { selectCurrentUser } from '../../store/authSlice';
import { formatDuration } from '../../utils/dateFormat';
import { getValidQueueTransitions } from './receptionLogic';

const ALL_STAGES = [
    'Registered', 'Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending',
    'Ready for Exam', 'In Exam', 'Reporting', 'Finalized', 'Delivered'
];

const priorityTone = {
    Emergency: 'border-s-4 border-s-rose-500',
    Urgent: 'border-s-4 border-s-amber-500',
    Routine: 'border-s-4 border-slate-300 dark:border-slate-700',
};

const stageTone = {
    'Scheduled': 'bg-slate-100/50 text-slate-700 ring-slate-300/50 dark:bg-slate-800/30 dark:text-slate-300 dark:ring-slate-700/50',
    'Arrived': 'bg-cyan-100/50 text-cyan-800 ring-cyan-300/50 dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-cyan-500/30',
    'Payment Pending': 'bg-amber-100/50 text-amber-800 ring-amber-300/50 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30',
    'Prep Pending': 'bg-amber-100/50 text-amber-800 ring-amber-300/50 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30',
    'Ready for Exam': 'bg-cyan-100/50 text-cyan-800 ring-cyan-300/50 dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-cyan-500/30',
    'In Exam': 'bg-teal-100/50 text-teal-800 ring-teal-300/50 dark:bg-teal-500/20 dark:text-teal-300 dark:ring-teal-500/30',
    'Reporting': 'bg-cyan-100/50 text-cyan-800 ring-cyan-300/50 dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-cyan-500/30',
    'Finalized': 'bg-emerald-100/50 text-emerald-800 ring-emerald-300/50 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30',
    'Delivered': 'bg-slate-100/50 text-slate-800 ring-slate-300/50 dark:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-500/30'
};

const QueueBoard = ({ items = [], onMove, onPickup, canManageQueue = false, canDeliverResults = false }) => {
    const { t, i18n } = useTranslation('reception');
    const user = useSelector(selectCurrentUser);
    const [activeStageMenu, setActiveStageMenu] = useState(null);
    const [activePrintMenu, setActivePrintMenu] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const permissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    const hasPermission = (permission) => user?.role === 'Developer' || permissions.has(permission);
    const canPrintLabels = hasPermission('PRINT_LABELS');
    const canPrintReceipts = hasPermission('PRINT_RECEIPTS');

    const filteredItems = useMemo(() => {
        const query = searchTerm.trim().toLocaleLowerCase();
        if (!query) return items;
        return items.filter((item) => [item.patient_name, item.mrn, item.exam_type_name, item.modality_name]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase().includes(query)));
    }, [items, searchTerm]);

    const overdueCount = filteredItems.filter((item) => item.is_overdue).length;
    const activeCount = filteredItems.filter((item) => !['Delivered', 'Finalized'].includes(item.queue_stage)).length;

    const handlePrint = (item, type) => {
        const url = type === 'sticker'
            ? `/print/sticker/${item.appointment_id}?copies=1`
            : `/print/receipt/${item.appointment_id}`;
        window.open(url, '_blank');
        setActivePrintMenu(null);
    };

    const stageLabel = (stage) => t(`queue.stages.${stage}`, { defaultValue: stage });

    return (
        <section 
            className="app-panel overflow-hidden backdrop-blur-xl bg-white/70 shadow-sm border border-slate-200/60 dark:bg-slate-900/50 dark:border-slate-800/60" 
            aria-labelledby="live-queue-title"
        >
            <header className="border-b border-slate-200/50 px-4 py-4 dark:border-slate-800/50 sm:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-gradient-to-br from-cyan-400/20 to-cyan-500/20 text-cyan-700 ring-1 ring-cyan-200/50 dark:from-cyan-400/10 dark:to-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20 shadow-inner">
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
                        <span className="inline-flex items-center gap-1.5 rounded-none bg-white/60 px-2.5 py-2 text-[11px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200/50 backdrop-blur-md dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700/50">
                            <Users size={14} /> {activeCount} {t('queue.active', { defaultValue: 'active' })}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-none px-2.5 py-2 text-[11px] font-bold shadow-sm ring-1 backdrop-blur-md ${
                            overdueCount 
                                ? 'bg-rose-50/80 text-rose-700 ring-rose-200/50 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20' 
                                : 'bg-emerald-50/80 text-emerald-700 ring-emerald-200/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
                        }`}>
                            <AlertTriangle size={14} /> {overdueCount} {t('queue.overdue', { defaultValue: 'overdue' })}
                        </span>
                        {!canManageQueue && (
                            <span 
                                title={t('queue.readOnlyHint', { defaultValue: 'You do not have permission to change queue status' })} 
                                className="inline-flex items-center gap-1.5 rounded-none bg-slate-100/50 px-2.5 py-2 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200/50 backdrop-blur-md dark:bg-slate-800/50 dark:text-slate-400 dark:ring-slate-700/50"
                            >
                                <LockKeyhole size={14} /> {t('queue.readOnly', { defaultValue: 'Read only' })}
                            </span>
                        )}
                        <label className="relative min-w-[15rem] flex-1 xl:flex-none">
                            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <span className="sr-only">{t('queue.search', { defaultValue: 'Search queue' })}</span>
                            <input 
                                value={searchTerm} 
                                onChange={(event) => setSearchTerm(event.target.value)} 
                                placeholder={t('queue.searchPlaceholder', { defaultValue: 'Search patient, MRN, or exam' })} 
                                className="h-9 w-full rounded-none border border-slate-200/60 bg-white/80 ps-9 pe-3 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-white dark:focus:bg-slate-900 shadow-inner backdrop-blur-sm" 
                            />
                        </label>
                    </div>
                </div>
            </header>

            <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full text-start">
                    <thead className="border-b border-slate-200/50 bg-slate-50/50 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/30">
                        <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <th className="px-4 py-3 font-black sm:px-6">{t('queue.columns.patient', { defaultValue: 'Patient' })}</th>
                            <th className="px-3 py-3 font-black">{t('queue.columns.exam', { defaultValue: 'Examination' })}</th>
                            <th className="px-3 py-3 font-black">{t('queue.columns.priority', { defaultValue: 'Priority' })}</th>
                            <th className="px-3 py-3 font-black">{t('queue.columns.status', { defaultValue: 'Status' })}</th>
                            <th className="px-3 py-3 font-black">{t('queue.columns.wait', { defaultValue: 'Wait time' })}</th>
                            <th className="px-4 py-3 text-end font-black sm:px-6">{t('queue.columns.actions', { defaultValue: 'Actions' })}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/50">
                        {filteredItems.map((item) => {
                            const isOverdue = item.is_overdue;
                            const statusTone = stageTone[item.queue_stage] || stageTone.Scheduled;
                            const validStages = getValidQueueTransitions(item.queue_stage).filter((stage) => ALL_STAGES.includes(stage));
                            const canChangeStage = canManageQueue && validStages.length > 0 && !(item.queue_stage === 'Finalized' && canDeliverResults);
                            return (
                                <tr 
                                    key={item.exam_id} 
                                    className={`group transition-all duration-200 hover:bg-white/60 dark:hover:bg-slate-800/40 hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] ${
                                        isOverdue ? 'bg-rose-50/30 dark:bg-rose-500/5' : 'bg-transparent'
                                    }`}
                                >
                                    <td className={`px-4 py-3 sm:px-6 ${priorityTone[item.priority] || priorityTone.Routine}`}>
                                        <div className="min-w-[190px]">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm font-black text-slate-900 dark:text-white">
                                                    {item.patient_name || t('fallback.unnamed')}
                                                </span>
                                                {item.is_on_hold && (
                                                    <span className="rounded-none bg-amber-100/80 px-1.5 py-0.5 text-[9px] font-black text-amber-800 ring-1 ring-amber-200/50 dark:bg-amber-500/20 dark:text-amber-300">
                                                        {t('common.onHold', { defaultValue: 'On hold' })}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="mt-1 block font-mono text-[10px] text-slate-400 ltr-embed">
                                                {item.mrn || '-'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="max-w-[210px] px-3 py-3">
                                        <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-300">
                                            {item.exam_type_name || item.modality_name || '-'}
                                        </p>
                                        <p className="mt-1 truncate text-[10px] text-slate-400">
                                            {item.machine_name || item.modality_name || ''}
                                        </p>
                                    </td>
                                    <td className="px-3 py-3">
                                        <PriorityBadge priority={item.priority} />
                                    </td>
                                    <td className="px-3 py-3">
                                        {canChangeStage ? (
                                            <div className="relative w-fit">
                                                <button 
                                                    type="button" 
                                                    onClick={() => { 
                                                        setActivePrintMenu(null); 
                                                        setActiveStageMenu(activeStageMenu === item.exam_id ? null : item.exam_id); 
                                                    }} 
                                                    title={t('queue.moveTo', { defaultValue: 'Change queue status' })} 
                                                    className={`inline-flex items-center gap-1.5 rounded-none px-2.5 py-1.5 text-[10px] font-black ring-1 transition hover:brightness-95 hover:shadow-sm ${statusTone}`}
                                                >
                                                    {stageLabel(item.queue_stage)} <ChevronDown size={12} />
                                                </button>
                                                {activeStageMenu === item.exam_id && (
                                                    <div className="absolute bottom-full start-0 z-30 mb-1 max-h-64 w-48 overflow-y-auto rounded-none border border-slate-200/60 bg-white/90 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/90">
                                                        <p className="border-b border-slate-100/50 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800/50">
                                                            {t('queue.moveTo', { defaultValue: 'Change status' })}
                                                        </p>
                                                        {validStages.map((stage) => (
                                                            <button 
                                                                key={stage} 
                                                                type="button" 
                                                                onClick={() => { 
                                                                    onMove(item, stage); 
                                                                    setActiveStageMenu(null); 
                                                                }} 
                                                                className={`flex w-full items-center rounded-none px-2 py-2 text-start text-[10px] font-bold transition-colors ${
                                                                    item.queue_stage === stage 
                                                                        ? 'bg-cyan-50/80 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300' 
                                                                        : 'text-slate-700 hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/80'
                                                                }`}
                                                            >
                                                                {stageLabel(stage)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className={`inline-flex rounded-none px-2.5 py-1.5 text-[10px] font-black ring-1 shadow-sm ${statusTone}`}>
                                                {stageLabel(item.queue_stage)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-black tabular-nums ${
                                            isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'
                                        }`}>
                                            <Clock3 size={13} />
                                            {formatDuration(item.waiting_minutes || 0, i18n.language)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-end sm:px-6">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {canManageQueue && item.queue_stage === 'Scheduled' && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => onMove(item, 'Arrived')} 
                                                    className="rounded-none bg-gradient-to-b from-cyan-400 to-cyan-500 px-3 py-1.5 text-[10px] font-black text-white shadow-sm ring-1 ring-cyan-500/50 transition-all hover:brightness-110 active:scale-95"
                                                >
                                                    {t('queue.arrived', { defaultValue: 'Arrive' })}
                                                </button>
                                            )}
                                            {canManageQueue && item.queue_stage === 'Arrived' && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => onMove(item, 'Payment Pending')} 
                                                    className="rounded-none bg-gradient-to-b from-amber-400 to-amber-500 px-3 py-1.5 text-[10px] font-black text-white shadow-sm ring-1 ring-amber-500/50 transition-all hover:brightness-110 active:scale-95"
                                                >
                                                    {t('queue.cashier', { defaultValue: 'To cashier' })}
                                                </button>
                                            )}
                                            {canDeliverResults && item.queue_stage === 'Finalized' && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => onPickup(item)} 
                                                    className="rounded-none bg-gradient-to-b from-slate-800 to-slate-900 px-3 py-1.5 text-[10px] font-black text-white shadow-sm ring-1 ring-slate-950/50 transition-all hover:brightness-110 active:scale-95 dark:from-cyan-600 dark:to-cyan-700 dark:ring-cyan-600/50"
                                                >
                                                    {t('queue.pickup', { defaultValue: 'Pickup' })}
                                                </button>
                                            )}
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
                                                        className="app-icon-button h-8 w-8 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    >
                                                        <Printer size={14} />
                                                    </button>
                                                    {activePrintMenu === item.exam_id && (
                                                        <div className="absolute bottom-full end-0 z-30 mb-1 w-36 rounded-none border border-slate-200/60 bg-white/90 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/90">
                                                            {canPrintLabels && (
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => handlePrint(item, 'sticker')} 
                                                                    className="flex w-full items-center gap-2 rounded-none px-2 py-2 text-start text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
                                                                >
                                                                    <Tag size={13} />
                                                                    {t('queue.sticker', { defaultValue: 'Sticker' })}
                                                                </button>
                                                            )}
                                                            {canPrintReceipts && (
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => handlePrint(item, 'receipt')} 
                                                                    className="flex w-full items-center gap-2 rounded-none px-2 py-2 text-start text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
                                                                >
                                                                    <FileText size={13} />
                                                                    {t('queue.receipt', { defaultValue: 'Receipt' })}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {(!canManageQueue && !canDeliverResults && !canPrintLabels && !canPrintReceipts) && (
                                                <span 
                                                    title={t('queue.readOnlyHint', { defaultValue: 'Read-only queue' })} 
                                                    className="text-slate-400/70"
                                                >
                                                    <LockKeyhole size={15} />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filteredItems.length === 0 && (
                    <div className="flex min-h-[16rem] flex-col items-center justify-center px-6 text-center">
                        <div className="mb-4 rounded-none bg-emerald-50/50 p-4 ring-1 ring-emerald-100/50 dark:bg-emerald-500/5 dark:ring-emerald-500/10">
                            <CheckCircle2 size={32} className="text-emerald-500" />
                        </div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {t('queue.empty', { defaultValue: 'No queue cases found' })}
                        </p>
                        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                            {searchTerm 
                                ? t('queue.emptySearch', { defaultValue: 'Try a different search.' }) 
                                : t('queue.emptyHint', { defaultValue: 'The live queue is clear.' })
                            }
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
};

export default QueueBoard;
