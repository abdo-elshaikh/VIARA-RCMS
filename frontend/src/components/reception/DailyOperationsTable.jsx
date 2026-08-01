import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, FileText, LockKeyhole, Printer, Search, Tag } from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import PriorityBadge from '../ui/PriorityBadge';
import StatusPill from '../ui/StatusPill';
import EmptyState from '../ui/EmptyState';
import { formatDuration } from '../../utils/dateFormat';
import { getValidQueueTransitions } from './receptionLogic';

const STAGES = [
    'Registered', 'Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending',
    'Ready for Exam', 'In Exam', 'Reporting', 'Finalized', 'Delivered'
];

const STAGE_TONES = {
    Scheduled: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    Arrived: 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/25',
    'Payment Pending': 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25',
    'Prep Pending': 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25',
    'Ready for Exam': 'bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/25',
    'In Exam': 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/25',
    Reporting: 'bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/25',
    Finalized: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25',
    Delivered: 'bg-slate-100 text-slate-800 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
};

const DailyOperationsTable = ({
    appointments = [],
    queueItems = [],
    invoices = [],
    appLoading,
    canManageQueue = false,
    canDeliverResults = false,
    createAppointmentInvoice,
    onMove,
    onPickup,
    onOpenPayment,
    onRequestPartialPaymentException,
    i18n,
    t,
}) => {
    const user = useSelector(selectCurrentUser);
    const [searchTerm, setSearchTerm] = useState('');
    const [stageMenu, setStageMenu] = useState(null);
    const [printMenu, setPrintMenu] = useState(null);

    const permissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    const has = (permission) => user?.role === 'Developer' || permissions.has(permission);

    const rows = useMemo(() => {
        const matched = new Set();
        const result = appointments.map((appointment) => {
            const queue = queueItems.find((item) => item.exam_id === appointment.exam_id || item.appointment_id === appointment.appointment_id);
            if (queue) matched.add(queue.exam_id);
            return {
                appointment,
                queue,
                invoice: invoices.find((invoice) => invoice.appointment_id === appointment.appointment_id || invoice.exam_id === appointment.exam_id)
            };
        });

        queueItems.filter((item) => !matched.has(item.exam_id)).forEach((queue) => {
            result.push({
                queue,
                invoice: invoices.find((invoice) => invoice.exam_id === queue.exam_id || invoice.appointment_id === queue.appointment_id)
            });
        });

        return result;
    }, [appointments, invoices, queueItems]);

    const filtered = useMemo(() => {
        const query = searchTerm.trim().toLocaleLowerCase();
        if (!query) return rows;
        return rows.filter(({ appointment, queue, invoice }) =>
            [appointment?.patient_name, appointment?.mrn, appointment?.exam_type_name, queue?.patient_name, queue?.mrn, queue?.exam_type_name, invoice?.invoice_number]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase()
                .includes(query)
        );
    }, [rows, searchTerm]);

    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US';
    const stageLabel = (stage) => t(`queue.stages.${stage}`, { defaultValue: stage || t('queue.notStarted', { defaultValue: 'Not started' }) });
    const formatTime = (value) => value ? new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '-';

    const print = (row, type) => {
        const appointmentId = row.appointment?.appointment_id || row.queue?.appointment_id;
        if (!appointmentId) return;
        window.open(type === 'sticker' ? `/print/sticker/${appointmentId}?copies=1` : `/print/receipt/${appointmentId}`, '_blank');
        setPrintMenu(null);
    };

    const renderStage = (stage, examId, menuPlacement = 'top') => {
        if (!stage) return null;

        if (!canManageQueue || stage === 'Finalized' || stage === 'Delivered') {
            return (
                <span className={`rounded-none px-2 py-1.5 text-[10px] font-black ring-1 ${STAGE_TONES[stage] || STAGE_TONES.Scheduled}`}>
                    {stageLabel(stage)}
                </span>
            );
        }

        const validStages = getValidQueueTransitions(stage).filter((next) => STAGES.includes(next));

        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setStageMenu(stageMenu === examId ? null : examId)}
                    className={`inline-flex max-w-full items-center gap-1 rounded-none px-2 py-1.5 text-[10px] font-black ring-1 transition hover:brightness-95 ${STAGE_TONES[stage] || STAGE_TONES.Scheduled}`}
                >
                    <span className="truncate">{stageLabel(stage)}</span>
                    <ChevronDown size={12} className="shrink-0" />
                </button>
                {stageMenu === examId && (
                    <div className={`absolute start-0 z-40 max-h-64 w-48 overflow-y-auto rounded-none border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${menuPlacement === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
                        {validStages.map((next) => (
                            <button
                                key={next}
                                type="button"
                                onClick={() => {
                                    onMove({ exam_id: examId, queue_stage: stage }, next);
                                    setStageMenu(null);
                                }}
                                className="flex w-full rounded-none px-2 py-2 text-start text-[10px] font-bold text-slate-700 transition-colors hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {stageLabel(next)}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderWait = (queue) => queue ? (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-black tabular-nums ${queue.is_overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
            {queue.is_overdue && <AlertTriangle size={13} />}
            {formatDuration(queue.waiting_minutes || 0, i18n.language)}
        </span>
    ) : (
        <span className="text-slate-400">-</span>
    );

    const renderActions = (row, align = 'end') => {
        const { appointment, queue, invoice } = row;
        const examId = queue?.exam_id || appointment?.exam_id;
        const stage = queue?.queue_stage || appointment?.queue_stage;
        const appointmentId = appointment?.appointment_id || queue?.appointment_id;
        const menuKey = examId || appointmentId;
        const hasBalance = invoice && Number(invoice.balance_amount || 0) > 0;
        const finalDeliveryBlocked = stage === 'Finalized' && hasBalance;
        const canRequestPartialException = invoice?.invoice_status === 'Partial'
            && hasBalance
            && onRequestPartialPaymentException
            && ['Arrived', 'Payment Pending'].includes(stage);

        let primaryAction = null;
        const queueTarget = { exam_id: examId, appointment_id: appointmentId, queue_stage: stage };
        if (!invoice && appointment && !['Cancelled', 'Completed'].includes(appointment?.status)) {
            primaryAction = { label: t('table.createInvoice', { defaultValue: 'Create Invoice' }), onClick: () => createAppointmentInvoice(appointment), style: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-2.5' };
        } else if (invoice && !examId && !['Cancelled', 'Completed'].includes(appointment?.status) && !stage && canManageQueue) {
            primaryAction = { label: t('queue.arrived', { defaultValue: 'Arrive' }), onClick: () => onMove(queueTarget, 'Arrived'), style: 'bg-teal-700 text-white hover:bg-teal-800 px-3' };
        } else if (stage === 'Arrived' && canManageQueue) {
            const nextStage = hasBalance ? 'Payment Pending' : (queue?.nurse_name ? 'Prep Pending' : 'Ready for Exam');
            const label = hasBalance ? t('queue.sendToCashier', { defaultValue: 'Send to Cashier' }) : (queue?.nurse_name ? t('queue.prepComplete', { defaultValue: 'Send to Prep' }) : t('queue.readyForExam', { defaultValue: 'Ready for Exam' }));
            primaryAction = { label, onClick: () => onMove(queueTarget, nextStage), style: 'bg-teal-700 text-white hover:bg-teal-800 px-3' };
        } else if (stage === 'Payment Pending' && canManageQueue && !hasBalance) {
            const nextStage = queue?.nurse_name ? 'Prep Pending' : 'Ready for Exam';
            primaryAction = { label: t('queue.readyForExam', { defaultValue: 'Ready for Exam' }), onClick: () => onMove(queueTarget, nextStage), style: 'bg-teal-700 text-white hover:bg-teal-800 px-3' };
        } else if (stage === 'Prep Pending' && canManageQueue) {
            primaryAction = { label: t('queue.prepComplete', { defaultValue: 'Prep Complete' }), onClick: () => onMove(queueTarget, 'Ready for Exam'), style: 'bg-emerald-600 text-white hover:bg-emerald-700 px-3' };
        } else if (stage === 'Ready for Exam' && canManageQueue) {
            primaryAction = { label: t('queue.startExam', { defaultValue: 'Start Exam' }), onClick: () => onMove(queueTarget, 'In Exam'), style: 'bg-teal-700 text-white hover:bg-teal-800 px-3' };
        } else if (stage === 'In Exam' && canManageQueue) {
            primaryAction = { label: t('queue.endExam', { defaultValue: 'End Exam' }), onClick: () => onMove(queueTarget, 'Reporting'), style: 'bg-cyan-700 text-white hover:bg-cyan-800 px-3' };
        } else if (stage === 'Reporting' && canManageQueue) {
            primaryAction = { label: t('queue.finalize', { defaultValue: 'Finalize' }), onClick: () => onMove(queueTarget, 'Finalized'), style: 'bg-emerald-600 text-white hover:bg-emerald-700 px-3' };
        } else if (finalDeliveryBlocked && onOpenPayment) {
            primaryAction = { label: t('billing.payRemainingBalance', { defaultValue: 'Pay balance' }), onClick: () => onOpenPayment(invoice), style: 'bg-emerald-600 text-white hover:bg-emerald-700 px-3' };
        } else if (stage === 'Finalized' && canDeliverResults && onPickup && examId) {
            primaryAction = { label: t('queue.pickup', { defaultValue: 'Pickup' }), onClick: () => onPickup(queue || appointment), style: 'bg-emerald-600 text-white hover:bg-emerald-700 px-3' };
        }

        return (
            <div className={`flex flex-wrap items-center gap-1.5 ${align === 'start' ? 'justify-start' : 'justify-end'}`}>
                {primaryAction && (
                    <button
                        type="button"
                        onClick={primaryAction.onClick}
                        className={`min-h-8 rounded-none py-1.5 text-[10px] font-black transition active:scale-95 ${primaryAction.style}`}
                    >
                        {primaryAction.label}
                    </button>
                )}

                {hasBalance && onOpenPayment && !finalDeliveryBlocked && (
                    <button
                        type="button"
                        onClick={() => onOpenPayment(invoice)}
                        className="min-h-8 rounded-none bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white transition hover:bg-emerald-700 active:scale-95"
                    >
                        {t('billing.collectPayment', { defaultValue: 'Pay' })}
                    </button>
                )}

                {canRequestPartialException && (
                    <button
                        type="button"
                        onClick={() => onRequestPartialPaymentException({
                            invoice,
                            transactionType: 'ClinicalQueueTransition',
                        })}
                        className="min-h-8 rounded-none border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black text-red-700 transition hover:bg-red-100 active:scale-95 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                    >
                        {t('billing.requestException', { defaultValue: 'Request exception' })}
                    </button>
                )}

                {(has('PRINT_LABELS') || has('PRINT_RECEIPTS')) && appointmentId && (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setPrintMenu(printMenu === menuKey ? null : menuKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-slate-200 text-slate-500 transition hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            title={t('queue.print', { defaultValue: 'Print documents' })}
                        >
                            <Printer size={14} />
                        </button>
                        {printMenu === menuKey && (
                            <div className="absolute end-0 top-full z-40 mt-1 w-36 rounded-none border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                {has('PRINT_LABELS') && (
                                    <button
                                        type="button"
                                        onClick={() => print(row, 'sticker')}
                                        className="flex w-full items-center gap-2 rounded-none px-2 py-2 text-start text-[10px] font-bold transition-colors hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <Tag size={13} />
                                        {t('queue.sticker', { defaultValue: 'Sticker' })}
                                    </button>
                                )}
                                {has('PRINT_RECEIPTS') && (
                                    <button
                                        type="button"
                                        onClick={() => print(row, 'receipt')}
                                        className="flex w-full items-center gap-2 rounded-none px-2 py-2 text-start text-[10px] font-bold transition-colors hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <FileText size={13} />
                                        {t('queue.receipt', { defaultValue: 'Receipt' })}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {!canManageQueue && !canDeliverResults && (
                    <LockKeyhole size={15} className="text-slate-400/70" title={t('queue.readOnly', { defaultValue: 'Read only' })} />
                )}
            </div>
        );
    };

    const renderStatus = (row, menuPlacement) => {
        const { appointment, queue, invoice } = row;
        const examId = queue?.exam_id || appointment?.exam_id;
        const stage = queue?.queue_stage || appointment?.queue_stage;

        return (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {renderStage(stage, examId, menuPlacement)}
                {invoice ? (
                    <StatusPill status={invoice.invoice_status} />
                ) : (
                    <span className="text-[10px] text-slate-400">
                        {t('table.noInvoice', { defaultValue: 'No invoice' })}
                    </span>
                )}
            </div>
        );
    };

    return (
        <section
            className="rounded-none border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            aria-labelledby="daily-operations-title"
        >
            <header className="border-b border-slate-100 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/20">
                            <Clock3 size={18} />
                        </span>
                        <div className="min-w-0">
                            <h2 id="daily-operations-title" className="text-base font-black text-slate-950 dark:text-white">
                                {t('command.dailyView', { defaultValue: 'Daily operations' })}
                            </h2>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {t('queue.unifiedSummary', { count: filtered.length, defaultValue: '{{count}} appointments and active cases in one workspace' })}
                            </p>
                        </div>
                    </div>

                    <label className="relative w-full lg:max-w-xs">
                        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <span className="sr-only">
                            {t('queue.search', { defaultValue: 'Search operations' })}
                        </span>
                        <input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder={t('queue.searchPlaceholder', { defaultValue: 'Search patient, MRN, or exam' })}
                            className="h-10 w-full rounded-none border border-slate-200 bg-white ps-9 pe-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </label>
                </div>
            </header>

            <div className="lg:hidden">
                {appLoading ? (
                    <div className="space-y-3 p-4">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="h-36 animate-pulse rounded-none bg-slate-100 dark:bg-slate-800" />
                        ))}
                    </div>
                ) : filtered.length > 0 ? (
                    <div className="divide-y divide-slate-100 p-2 dark:divide-slate-800">
                        {filtered.map((row) => {
                            const { appointment, queue } = row;
                            const examId = queue?.exam_id || appointment?.exam_id;
                            const appointmentId = appointment?.appointment_id || queue?.appointment_id;
                            const patient = appointment?.patient_name || queue?.patient_name || t('table.patientFallback');

                            return (
                                <article
                                    key={examId || appointmentId}
                                    className={`rounded-none p-3 ${queue?.is_overdue ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-white dark:bg-slate-900'}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-black text-slate-950 dark:text-white">{patient}</p>
                                            {(appointment?.is_follow_up || queue?.is_follow_up) && <p className="mt-1 text-[10px] font-black uppercase text-teal-700 dark:text-teal-300">{t('table.followUp', { defaultValue: 'Follow-up' })} / {appointment?.prior_order_number || queue?.prior_order_number || t('table.priorStudy', { defaultValue: 'Prior study' })}</p>}
                                            <p className="mt-1 font-mono text-[10px] font-bold text-slate-400 ltr-embed">
                                                {appointment?.mrn || queue?.mrn || '-'}
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-none bg-slate-100 px-2 py-1 text-[10px] font-black tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {formatTime(appointment?.start_time)}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-none bg-slate-50 p-2 dark:bg-slate-950/40">
                                            <p className="text-[10px] font-black uppercase text-slate-400">{t('table.machineExam')}</p>
                                            <p className="mt-1 line-clamp-2 font-bold text-slate-700 dark:text-slate-300">
                                                {appointment?.exam_type_name || queue?.exam_type_name || queue?.modality_name || '-'}
                                            </p>
                                        </div>
                                        <div className="rounded-none bg-slate-50 p-2 dark:bg-slate-950/40">
                                            <p className="text-[10px] font-black uppercase text-slate-400">{t('queue.columns.wait', { defaultValue: 'Wait' })}</p>
                                            <div className="mt-1">{renderWait(queue)}</div>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <PriorityBadge priority={appointment?.priority || queue?.priority} />
                                        {renderStatus(row, 'bottom')}
                                    </div>

                                    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                                        {renderActions(row, 'start')}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-8">
                        <EmptyState
                            icon={CheckCircle2}
                            title={t('queue.empty', { defaultValue: 'No operations found' })}
                            subtitle={searchTerm ? t('queue.emptySearch', { defaultValue: 'Try a different search.' }) : t('empty.noAppointments')}
                        />
                    </div>
                )}
            </div>

            <div className="hidden lg:block">
                <table className="w-full table-fixed text-start text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
                        <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <th className="w-[86px] px-4 py-3 sm:px-6">{t('table.time')}</th>
                            <th className="w-[19%] px-3 py-3">{t('table.patient')}</th>
                            <th className="w-[20%] px-3 py-3">{t('table.machineExam')}</th>
                            <th className="w-[11%] px-3 py-3">{t('queue.columns.priority', { defaultValue: 'Priority' })}</th>
                            <th className="w-[22%] px-3 py-3">{t('table.status')}</th>
                            <th className="w-[94px] px-3 py-3">{t('queue.columns.wait', { defaultValue: 'Wait' })}</th>
                            <th className="w-[20%] px-4 py-3 text-end sm:px-6">{t('table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {appLoading ? (
                            <tr>
                                <td colSpan={7} className="p-6">
                                    <div className="space-y-3">
                                        {Array.from({ length: 5 }).map((_, index) => (
                                            <div key={index} className="h-12 animate-pulse rounded-none bg-slate-100 dark:bg-slate-800" />
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ) : filtered.map((row) => {
                            const { appointment, queue } = row;
                            const examId = queue?.exam_id || appointment?.exam_id;
                            const patient = appointment?.patient_name || queue?.patient_name || t('table.patientFallback');
                            const appointmentId = appointment?.appointment_id || queue?.appointment_id;

                            return (
                                <tr
                                    key={examId || appointmentId}
                                    className={`group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                                        queue?.is_overdue ? 'bg-rose-50/60 dark:bg-rose-500/10' : 'bg-transparent'
                                    }`}
                                >
                                    <td className="px-4 py-3 sm:px-6">
                                        <span className="font-bold tabular-nums text-slate-700 dark:text-slate-300">
                                            {formatTime(appointment?.start_time)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3">
                                        <p className="truncate font-black text-slate-900 dark:text-white">{patient}</p>
                                        {(appointment?.is_follow_up || queue?.is_follow_up) && <p className="mt-1 truncate text-[10px] font-black uppercase text-teal-700 dark:text-teal-300">{t('table.followUp', { defaultValue: 'Follow-up' })} / {appointment?.prior_order_number || queue?.prior_order_number || t('table.priorStudy', { defaultValue: 'Prior study' })}</p>}
                                        <p className="mt-1 truncate font-mono text-[10px] text-slate-400 ltr-embed">
                                            {appointment?.mrn || queue?.mrn || '-'}
                                        </p>
                                    </td>
                                    <td className="px-3 py-3">
                                        <p className="truncate font-bold text-slate-700 dark:text-slate-300">
                                            {appointment?.exam_type_name || queue?.exam_type_name || queue?.modality_name || '-'}
                                        </p>
                                        <p className="mt-1 truncate text-[10px] text-slate-400">
                                            {appointment?.machine_name || queue?.machine_name || queue?.modality_name || ''}
                                        </p>
                                    </td>
                                    <td className="px-3 py-3">
                                        <PriorityBadge priority={appointment?.priority || queue?.priority} />
                                    </td>
                                    <td className="px-3 py-3">
                                        {renderStatus(row)}
                                    </td>
                                    <td className="px-3 py-3">
                                        {renderWait(queue)}
                                    </td>
                                    <td className="px-4 py-3 text-end sm:px-6">
                                        {renderActions(row)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {!appLoading && filtered.length === 0 && (
                    <div className="p-8">
                        <EmptyState
                            icon={CheckCircle2}
                            title={t('queue.empty', { defaultValue: 'No operations found' })}
                            subtitle={searchTerm ? t('queue.emptySearch', { defaultValue: 'Try a different search.' }) : t('empty.noAppointments')}
                        />
                    </div>
                )}
            </div>
        </section>
    );
};

export default DailyOperationsTable;
