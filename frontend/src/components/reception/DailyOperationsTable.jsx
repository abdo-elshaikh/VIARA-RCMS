import React, { useMemo, useState, useEffect } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    CheckCircle2,
    ChevronDown,
    Clock3,
    FileText,
    Filter,
    Layers,
    LockKeyhole,
    Printer,
    Search,
    SlidersHorizontal,
    Tag,
    X,
    User,
    Activity,
    CreditCard
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import PriorityBadge from '../ui/PriorityBadge';
import StatusPill from '../ui/StatusPill';
import EmptyState from '../ui/EmptyState';
import Pagination from '../ui/Pagination';
import { formatDuration } from '../../utils/dateFormat';
import { getPaginationState } from '../../utils/pagination';
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
    'In Exam': 'bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25',
    Reporting: 'bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25',
    Finalized: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25',
    Delivered: 'bg-slate-100 text-slate-800 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
};

const PRIORITY_ORDER = { Emergency: 0, Urgent: 1, Routine: 2 };
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const ROLE_STAGE_PERMISSIONS = {
    Receptionist: ['Registered', 'Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam', 'Cancelled'],
    Accountant: ['Payment Pending', 'Prep Pending', 'Ready for Exam', 'Cancelled'],
    Nurse: ['Prep Pending', 'Ready for Exam'],
    Technician: ['In Exam', 'Reporting'],
    Radiologist: ['Reporting', 'Finalized'],
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
    approvedPartialPaymentExceptions = [],
    onRequestPartialPaymentException,
    i18n,
    t,
}) => {
    const user = useSelector(selectCurrentUser);
    const [searchTerm, setSearchTerm] = useState('');
    const [stageFilter, setStageFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [sortField, setSortField] = useState('time');
    const [sortDirection, setSortDirection] = useState('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [stageMenu, setStageMenu] = useState(null);
    const [printMenu, setPrintMenu] = useState(null);

    const isRtl = i18n?.language?.startsWith('ar');
    const locale = isRtl ? 'ar-EG' : 'en-US';

    const permissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    const has = (permission) => user?.role === 'Developer' || permissions.has(permission);
    const canMoveTo = (stage) => ['Developer', 'Admin'].includes(user?.role)
        || Boolean(ROLE_STAGE_PERMISSIONS[user?.role]?.includes(stage));

    // Build merged rows from appointments, queueItems, and invoices
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

    // Stage counts for quick filter chips
    const filterCounts = useMemo(() => {
        const counts = {
            all: rows.length,
            Arrived: 0,
            'Payment Pending': 0,
            'Prep Pending': 0,
            'Ready for Exam': 0,
            'In Exam': 0,
            Reporting: 0,
            Finalized: 0,
            overdue: 0,
            urgent: 0,
        };

        rows.forEach(({ appointment, queue }) => {
            const stage = queue?.queue_stage || appointment?.queue_stage;
            if (stage && counts[stage] !== undefined) {
                counts[stage]++;
            }
            if (queue?.is_overdue) {
                counts.overdue++;
            }
            const priority = appointment?.priority || queue?.priority;
            if (['Emergency', 'Urgent'].includes(priority)) {
                counts.urgent++;
            }
        });

        return counts;
    }, [rows]);

    // Filter and Sort rows
    const filteredAndSorted = useMemo(() => {
        let list = [...rows];

        // 1. Search Query Filter
        const query = searchTerm.trim().toLocaleLowerCase();
        if (query) {
            list = list.filter(({ appointment, queue, invoice }) =>
                [
                    appointment?.patient_name,
                    appointment?.mrn,
                    appointment?.exam_type_name,
                    appointment?.machine_name,
                    queue?.patient_name,
                    queue?.mrn,
                    queue?.exam_type_name,
                    queue?.modality_name,
                    invoice?.invoice_number
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLocaleLowerCase()
                    .includes(query)
            );
        }

        // 2. Stage Filter
        if (stageFilter === 'overdue') {
            list = list.filter(({ queue }) => queue?.is_overdue);
        } else if (stageFilter === 'urgent') {
            list = list.filter(({ appointment, queue }) =>
                ['Emergency', 'Urgent'].includes(appointment?.priority || queue?.priority)
            );
        } else if (stageFilter !== 'all') {
            list = list.filter(({ appointment, queue }) => {
                const stage = queue?.queue_stage || appointment?.queue_stage;
                return stage === stageFilter;
            });
        }

        // 3. Priority Filter
        if (priorityFilter !== 'all') {
            list = list.filter(({ appointment, queue }) => {
                const priority = appointment?.priority || queue?.priority;
                return priority === priorityFilter;
            });
        }

        // 4. Sorting
        list.sort((a, b) => {
            let valA, valB;
            const apptA = a.appointment || a.queue;
            const apptB = b.appointment || b.queue;

            switch (sortField) {
                case 'time':
                    valA = new Date(apptA?.start_time || 0).getTime();
                    valB = new Date(apptB?.start_time || 0).getTime();
                    break;
                case 'patient':
                    valA = (apptA?.patient_name || '').toLowerCase();
                    valB = (apptB?.patient_name || '').toLowerCase();
                    break;
                case 'exam':
                    valA = (apptA?.exam_type_name || apptA?.modality_name || '').toLowerCase();
                    valB = (apptB?.exam_type_name || apptB?.modality_name || '').toLowerCase();
                    break;
                case 'priority':
                    valA = PRIORITY_ORDER[apptA?.priority] ?? 99;
                    valB = PRIORITY_ORDER[apptB?.priority] ?? 99;
                    break;
                case 'wait':
                    valA = Number(a.queue?.waiting_minutes || 0);
                    valB = Number(b.queue?.waiting_minutes || 0);
                    break;
                case 'stage':
                    valA = (a.queue?.queue_stage || a.appointment?.queue_stage || '').toLowerCase();
                    valB = (b.queue?.queue_stage || b.appointment?.queue_stage || '').toLowerCase();
                    break;
                default:
                    valA = new Date(apptA?.start_time || 0).getTime();
                    valB = new Date(apptB?.start_time || 0).getTime();
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [rows, searchTerm, stageFilter, priorityFilter, sortField, sortDirection]);

    // Reset pagination to page 1 on filter/search change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, stageFilter, priorityFilter, pageSize]);

    // Pagination State
    const paginationState = useMemo(() => {
        return getPaginationState(filteredAndSorted.length, currentPage, pageSize);
    }, [filteredAndSorted.length, currentPage, pageSize]);

    const paginatedRows = useMemo(() => {
        return filteredAndSorted.slice(paginationState.startIndex, paginationState.endIndex);
    }, [filteredAndSorted, paginationState.startIndex, paginationState.endIndex]);

    const stageLabel = (stage) => t(`queue.stages.${stage}`, { defaultValue: stage || t('queue.notStarted', { defaultValue: 'Not started' }) });
    const formatTime = (value) => value ? new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '-';
    const hasApprovedPaymentException = (invoiceId, targetStage) => approvedPartialPaymentExceptions.some((exception) => {
        const metadata = typeof exception.metadata === 'string'
            ? (() => { try { return JSON.parse(exception.metadata); } catch { return {}; } })()
            : (exception.metadata || {});
        const notExpired = !exception.expires_at || new Date(exception.expires_at).getTime() > Date.now();
        return exception.invoice_id === invoiceId
            && exception.status === 'Approved'
            && exception.transaction_type === 'ClinicalQueueTransition'
            && metadata.targetStage === targetStage
            && notExpired;
    });

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const print = (row, type) => {
        const appointmentId = row.appointment?.appointment_id || row.queue?.appointment_id;
        if (!appointmentId) return;
        window.open(type === 'sticker' ? `/print/sticker/${appointmentId}?copies=1` : `/print/receipt/${appointmentId}`, '_blank');
        setPrintMenu(null);
    };

    const renderStatus = (row, menuPlacement = 'top') => {
        const { appointment, queue, invoice } = row;
        const examId = queue?.exam_id || appointment?.exam_id;
        const stage = queue?.queue_stage || appointment?.queue_stage;
        const hasBalance = invoice && Number(invoice.balance_amount || 0) > 0;
        const menuKey = examId || appointment?.appointment_id;

        if (!stage) {
            return (
                <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-[10.5px] font-extrabold ring-1 bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                    {t('queue.notStarted', { defaultValue: 'Not started' })}
                </span>
            );
        }

        const validStages = getValidQueueTransitions(stage)
            .filter((next) => STAGES.includes(next) && canMoveTo(next));

        if (!canManageQueue || stage === 'Finalized' || stage === 'Delivered' || validStages.length === 0) {
            return (
                <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10.5px] font-extrabold ring-1 ${STAGE_TONES[stage] || STAGE_TONES.Scheduled}`}>
                    {stageLabel(stage)}
                </span>
            );
        }

        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setStageMenu(stageMenu === menuKey ? null : menuKey)}
                    className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-extrabold ring-1 transition-all hover:brightness-95 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${STAGE_TONES[stage] || STAGE_TONES.Scheduled}`}
                >
                    <span className="truncate">{stageLabel(stage)}</span>
                    <ChevronDown size={12} className="shrink-0 opacity-70" />
                </button>
                {stageMenu === menuKey && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setStageMenu(null)} />
                        <div className={`absolute start-0 z-40 max-h-64 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 ${menuPlacement === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
                            <p className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                {t('queue.transitionTo', { defaultValue: 'Transition to:' })}
                            </p>
                            {validStages.map((next) => {
                                const requiresPayment = ['Prep Pending', 'Ready for Exam', 'In Exam'].includes(next)
                                    && hasBalance
                                    && appointment?.priority !== 'Emergency'
                                    && !hasApprovedPaymentException(invoice?.invoice_id, next);
                                return (
                                    <button
                                        key={next}
                                        type="button"
                                        disabled={requiresPayment}
                                        title={requiresPayment ? t('billing.paymentOrExceptionRequired', { defaultValue: 'Collect payment or obtain a partial-payment exception first.' }) : undefined}
                                        onClick={() => {
                                            onMove({ exam_id: examId, appointment_id: appointment?.appointment_id, queue_stage: stage }, next);
                                            setStageMenu(null);
                                        }}
                                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs font-bold transition ${requiresPayment
                                                ? 'text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30'
                                                : 'text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_TONES[next] ? 'bg-teal-500' : 'bg-slate-400'}`} />
                                            <span className="truncate">{stageLabel(next)}</span>
                                        </div>
                                        {requiresPayment && (
                                            <span className="text-[9px] font-black text-amber-600 dark:text-amber-400">
                                                {isRtl ? 'سداد' : 'Pay'}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        );
    };

    const renderWait = (queue) => queue ? (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-black tabular-nums text-xs ${queue.is_overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
            {queue.is_overdue && <AlertTriangle size={13} className="animate-pulse text-rose-500" />}
            {formatDuration(queue.waiting_minutes || 0, i18n?.language)}
        </span>
    ) : (
        <span className="text-slate-400 text-xs">-</span>
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
        const hasNurse = Boolean(
            queue?.nurse_name ||
            queue?.nurse_id ||
            appointment?.nurse_name ||
            appointment?.nurse_id
        );
        const partialExceptionTargetStage = hasNurse ? 'Prep Pending' : 'Ready for Exam';
        if (!invoice && appointment && !['Cancelled', 'Completed'].includes(appointment?.status) && has('CREATE_INVOICES')) {
            primaryAction = { label: t('table.createInvoice', { defaultValue: 'Create Invoice' }), onClick: () => createAppointmentInvoice(appointment), style: 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-3' };
        } else if (invoice && !examId && !['Cancelled', 'Completed'].includes(appointment?.status) && !stage && canManageQueue) {
            primaryAction = { label: t('queue.arrived', { defaultValue: 'Arrive' }), onClick: () => onMove(queueTarget, 'Arrived'), style: 'bg-teal-700 text-white hover:bg-teal-800 shadow-sm dark:bg-teal-600 dark:hover:bg-teal-500 px-3.5' };
        } else if (stage === 'Arrived' && canManageQueue) {
            const nextStage = hasBalance ? 'Payment Pending' : (hasNurse ? 'Prep Pending' : 'Ready for Exam');
            const label = hasBalance ? t('queue.sendToCashier', { defaultValue: 'Send to Cashier' }) : (hasNurse ? t('queue.prepComplete', { defaultValue: 'Send to Prep' }) : t('queue.readyForExam', { defaultValue: 'Ready for Exam' }));
            primaryAction = { label, onClick: () => onMove(queueTarget, nextStage), style: 'bg-teal-700 text-white hover:bg-teal-800 shadow-sm dark:bg-teal-600 dark:hover:bg-teal-500 px-3.5' };
        } else if (stage === 'Payment Pending' && canManageQueue
            && (!hasBalance || hasApprovedPaymentException(invoice?.invoice_id, partialExceptionTargetStage))) {
            const nextStage = hasNurse ? 'Prep Pending' : 'Ready for Exam';
            primaryAction = { label: hasNurse ? t('queue.prepComplete', { defaultValue: 'Send to Prep' }) : t('queue.readyForExam', { defaultValue: 'Ready for Exam' }), onClick: () => onMove(queueTarget, nextStage), style: 'bg-teal-700 text-white hover:bg-teal-800 shadow-sm dark:bg-teal-600 dark:hover:bg-teal-500 px-3.5' };
        } else if (stage === 'Prep Pending' && canManageQueue) {
            primaryAction = { label: t('queue.prepComplete', { defaultValue: 'Prep Complete' }), onClick: () => onMove(queueTarget, 'Ready for Exam'), style: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm px-3.5' };
        } else if (stage === 'Ready for Exam' && canManageQueue && canMoveTo('In Exam')) {
            primaryAction = { label: t('queue.startExam', { defaultValue: 'Start Exam' }), onClick: () => onMove(queueTarget, 'In Exam'), style: 'bg-teal-700 text-white hover:bg-teal-800 shadow-sm dark:bg-teal-600 dark:hover:bg-teal-500 px-3.5' };
        } else if (stage === 'In Exam' && canManageQueue && canMoveTo('Reporting')) {
            primaryAction = { label: t('queue.endExam', { defaultValue: 'End Exam' }), onClick: () => onMove(queueTarget, 'Reporting'), style: 'bg-cyan-700 text-white hover:bg-cyan-800 shadow-sm px-3.5' };
        } else if (stage === 'Reporting' && canManageQueue && canMoveTo('Finalized')) {
            primaryAction = { label: t('queue.finalize', { defaultValue: 'Finalize' }), onClick: () => onMove(queueTarget, 'Finalized'), style: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm px-3.5' };
        } else if (finalDeliveryBlocked && onOpenPayment) {
            primaryAction = { label: t('billing.payRemainingBalance', { defaultValue: 'Pay balance' }), onClick: () => onOpenPayment(invoice), style: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm px-3.5' };
        } else if (stage === 'Finalized' && canDeliverResults && onPickup && examId) {
            primaryAction = { label: t('queue.pickup', { defaultValue: 'Pickup' }), onClick: () => onPickup(queue || appointment), style: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm px-3.5' };
        }

        return (
            <div className={`flex flex-wrap items-center gap-1.5 ${align === 'start' ? 'justify-start' : 'justify-end'}`}>
                {primaryAction && (
                    <button
                        type="button"
                        onClick={primaryAction.onClick}
                        className={`inline-flex min-h-8 items-center justify-center rounded-lg py-1 text-xs font-black transition active:scale-95 ${primaryAction.style}`}
                    >
                        {primaryAction.label}
                    </button>
                )}

                {hasBalance && onOpenPayment && !finalDeliveryBlocked && (
                    <button
                        type="button"
                        onClick={() => onOpenPayment(invoice)}
                        className="inline-flex min-h-8 items-center justify-center rounded-lg bg-emerald-600 px-3 py-1 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
                    >
                        <CreditCard size={12} className="me-1" />
                        {t('billing.collectPayment', { defaultValue: 'Pay' })}
                    </button>
                )}

                {canRequestPartialException && (
                    <button
                        type="button"
                        onClick={() => onRequestPartialPaymentException({
                            invoice,
                            transactionType: 'ClinicalQueueTransition',
                            targetStage: partialExceptionTargetStage,
                        })}
                        className="inline-flex min-h-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-black text-red-700 transition hover:bg-red-100 active:scale-95 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                    >
                        {t('billing.requestException', { defaultValue: 'Exception' })}
                    </button>
                )}

                {(has('PRINT_LABELS') || has('PRINT_RECEIPTS')) && appointmentId && (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setPrintMenu(printMenu === menuKey ? null : menuKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                            title={t('queue.print', { defaultValue: 'Print documents' })}
                        >
                            <Printer size={13} />
                        </button>
                        {printMenu === menuKey && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setPrintMenu(null)} />
                                <div className="absolute end-0 top-full z-40 mt-1 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                                    {has('PRINT_LABELS') && (
                                        <button
                                            type="button"
                                            onClick={() => print(row, 'sticker')}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs font-bold transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <Tag size={13} className="text-teal-600 dark:text-teal-400" />
                                            {t('queue.sticker', { defaultValue: 'Sticker' })}
                                        </button>
                                    )}
                                    {has('PRINT_RECEIPTS') && (
                                        <button
                                            type="button"
                                            onClick={() => print(row, 'receipt')}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs font-bold transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <FileText size={13} className="text-cyan-600 dark:text-cyan-400" />
                                            {t('queue.receipt', { defaultValue: 'Receipt' })}
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {!canManageQueue && !canDeliverResults && (
                    <LockKeyhole size={14} className="text-slate-400/70" title={t('queue.readOnly', { defaultValue: 'Read only' })} />
                )}
            </div>
        );
    };

    const SortableHeader = ({ field, label, width, className = '' }) => {
        const isCurrent = sortField === field;
        return (
            <th className={`${width} px-3 py-3 text-start ${className}`}>
                <button
                    type="button"
                    onClick={() => handleSort(field)}
                    className="group inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition hover:text-slate-900 focus-visible:outline-none dark:text-slate-400 dark:hover:text-white"
                >
                    <span>{label}</span>
                    {isCurrent ? (
                        sortDirection === 'asc' ? (
                            <ArrowUp size={12} className="text-teal-600 dark:text-teal-400" />
                        ) : (
                            <ArrowDown size={12} className="text-teal-600 dark:text-teal-400" />
                        )
                    ) : (
                        <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                    )}
                </button>
            </th>
        );
    };

    return (
        <section
            className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90"
            aria-labelledby="daily-operations-title"
        >
            {/* Header & Search */}
            <header className="border-b border-slate-100 bg-white/90 p-5 dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3.5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                            <Clock3 size={20} />
                        </span>
                        <div className="min-w-0">
                            <h2 id="daily-operations-title" className="text-base font-black text-slate-950 dark:text-white">
                                {t('command.dailyView', { defaultValue: 'Daily operations' })}
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {t('queue.unifiedSummary', { count: filteredAndSorted.length, defaultValue: '{{count}} appointments and active cases in one workspace' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                        <label className="relative w-full sm:w-72 lg:w-80">
                            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <span className="sr-only">{t('queue.search', { defaultValue: 'Search operations' })}</span>
                            <input
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder={t('queue.searchPlaceholder', { defaultValue: 'Search patient, MRN, or exam...' })}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 ps-9 pe-8 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                            {searchTerm && (
                                 <button
                                     type="button"
                                     onClick={() => setSearchTerm('')}
                                     aria-label={t('clear', { defaultValue: 'Clear search' })}
                                     className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                 >
                                    <X size={12} />
                                </button>
                            )}
                        </label>

                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            aria-label="Filter by priority"
                            className="h-9 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        >
                            <option value="all">{t('filters.allPriorities', { defaultValue: 'All Priorities' })}</option>
                            <option value="Emergency">{t('priority.Emergency', { defaultValue: 'Emergency' })}</option>
                            <option value="Urgent">{t('priority.Urgent', { defaultValue: 'Urgent' })}</option>
                            <option value="Routine">{t('priority.Routine', { defaultValue: 'Routine' })}</option>
                        </select>
                    </div>
                </div>

                {/* Filter Chips Bar */}
                <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <FilterChip
                        label={t('filters.all', { defaultValue: 'All' })}
                        count={filterCounts.all}
                        active={stageFilter === 'all'}
                        onClick={() => setStageFilter('all')}
                    />
                    <FilterChip
                        label={t('queue.stages.Arrived', { defaultValue: 'Arrived' })}
                        count={filterCounts.Arrived}
                        active={stageFilter === 'Arrived'}
                        onClick={() => setStageFilter('Arrived')}
                        dotColor="bg-teal-500"
                    />
                    <FilterChip
                        label={t('queue.stages.Payment Pending', { defaultValue: 'Payment Pending' })}
                        count={filterCounts['Payment Pending']}
                        active={stageFilter === 'Payment Pending'}
                        onClick={() => setStageFilter('Payment Pending')}
                        dotColor="bg-amber-500"
                    />
                    <FilterChip
                        label={t('queue.stages.Ready for Exam', { defaultValue: 'Ready' })}
                        count={filterCounts['Ready for Exam']}
                        active={stageFilter === 'Ready for Exam'}
                        onClick={() => setStageFilter('Ready for Exam')}
                        dotColor="bg-cyan-500"
                    />
                    <FilterChip
                        label={t('queue.stages.In Exam', { defaultValue: 'In Exam' })}
                        count={filterCounts['In Exam']}
                        active={stageFilter === 'In Exam'}
                        onClick={() => setStageFilter('In Exam')}
                        dotColor="bg-indigo-500"
                    />
                    <FilterChip
                        label={t('queue.stages.Reporting', { defaultValue: 'Reporting' })}
                        count={filterCounts.Reporting}
                        active={stageFilter === 'Reporting'}
                        onClick={() => setStageFilter('Reporting')}
                        dotColor="bg-violet-500"
                    />
                    <FilterChip
                        label={t('queue.stages.Finalized', { defaultValue: 'Finalized' })}
                        count={filterCounts.Finalized}
                        active={stageFilter === 'Finalized'}
                        onClick={() => setStageFilter('Finalized')}
                        dotColor="bg-emerald-500"
                    />
                    {filterCounts.overdue > 0 && (
                        <FilterChip
                            label={t('focus.overdue', { defaultValue: 'Overdue' })}
                            count={filterCounts.overdue}
                            active={stageFilter === 'overdue'}
                            onClick={() => setStageFilter('overdue')}
                            tone="rose"
                        />
                    )}
                </div>
            </header>

            {/* Mobile View (Cards) */}
            <div className="lg:hidden">
                {appLoading ? (
                    <div className="space-y-3 p-4">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="h-36 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                        ))}
                    </div>
                ) : paginatedRows.length > 0 ? (
                    <div className="divide-y divide-slate-100 p-2 dark:divide-slate-800">
                        {paginatedRows.map((row) => {
                            const { appointment, queue, invoice } = row;
                            const examId = queue?.exam_id || appointment?.exam_id;
                            const appointmentId = appointment?.appointment_id || queue?.appointment_id;
                            const patient = appointment?.patient_name || queue?.patient_name || t('table.patientFallback');

                            return (
                                <article
                                    key={examId || appointmentId}
                                    className={`rounded-xl p-3.5 transition ${queue?.is_overdue ? 'bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 my-1.5' : 'bg-white dark:bg-slate-900'}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-black text-slate-950 dark:text-white text-sm">{patient}</p>
                                            {(appointment?.is_follow_up || queue?.is_follow_up) && (
                                                <p className="mt-0.5 text-[10px] font-black uppercase text-teal-700 dark:text-teal-300">
                                                    {t('table.followUp', { defaultValue: 'Follow-up' })} / {appointment?.prior_order_number || queue?.prior_order_number || t('table.priorStudy', { defaultValue: 'Prior study' })}
                                                </p>
                                            )}
                                            <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-400 ltr-embed">
                                                {appointment?.mrn || queue?.mrn || '-'}
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {formatTime(appointment?.start_time)}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/40">
                                            <div className="flex items-center justify-between gap-1">
                                                <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">{t('table.machineExam')}</p>
                                                {(appointment?.contrast_required || queue?.contrast_required || invoice?.contrast_required) && (
                                                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8.5px] font-black text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                        <AlertTriangle size={9} className="text-amber-600" />
                                                        {isRtl ? 'صبغة' : 'Contrast'}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 line-clamp-2 font-bold text-slate-700 dark:text-slate-300 text-xs">
                                                {appointment?.exam_type_name || queue?.exam_type_name || queue?.modality_name || '-'}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/40">
                                            <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">{t('queue.columns.wait', { defaultValue: 'Wait' })}</p>
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

            {/* Desktop View (Table) */}
            <div className="hidden lg:block overflow-x-auto">
                <table className="w-full table-fixed text-start text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40">
                        <tr>
                            <SortableHeader field="time" label={t('table.time')} width="w-[90px]" className="ps-5" />
                            <SortableHeader field="patient" label={t('table.patient')} width="w-[20%]" />
                            <SortableHeader field="exam" label={t('table.machineExam')} width="w-[21%]" />
                            <SortableHeader field="priority" label={t('queue.columns.priority', { defaultValue: 'Priority' })} width="w-[11%]" />
                            <SortableHeader field="stage" label={t('table.status')} width="w-[20%]" />
                            <SortableHeader field="wait" label={t('queue.columns.wait', { defaultValue: 'Wait' })} width="w-[90px]" />
                            <th className="w-[19%] px-4 py-3 pe-5 text-end text-[10px] font-black uppercase tracking-wider text-slate-400">
                                {t('table.actions')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {appLoading ? (
                            <tr>
                                <td colSpan={7} className="p-6">
                                    <div className="space-y-3">
                                        {Array.from({ length: 5 }).map((_, index) => (
                                            <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ) : paginatedRows.map((row) => {
                            const { appointment, queue, invoice } = row;
                            const examId = queue?.exam_id || appointment?.exam_id;
                            const patient = appointment?.patient_name || queue?.patient_name || t('table.patientFallback');
                            const appointmentId = appointment?.appointment_id || queue?.appointment_id;

                            return (
                                <tr
                                    key={examId || appointmentId}
                                    className={`group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50 ${queue?.is_overdue ? 'bg-rose-50/50 dark:bg-rose-950/15' : 'bg-transparent'
                                        }`}
                                >
                                    <td className="px-3 py-3.5 ps-5">
                                        <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">
                                            {formatTime(appointment?.start_time)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3.5">
                                        <p className="truncate font-black text-slate-900 dark:text-white text-xs">{patient}</p>
                                        {(appointment?.is_follow_up || queue?.is_follow_up) && (
                                            <p className="mt-0.5 truncate text-[9.5px] font-black uppercase text-teal-700 dark:text-teal-300">
                                                {t('table.followUp', { defaultValue: 'Follow-up' })} / {appointment?.prior_order_number || queue?.prior_order_number || t('table.priorStudy', { defaultValue: 'Prior study' })}
                                            </p>
                                        )}
                                        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400 ltr-embed">
                                            {appointment?.mrn || queue?.mrn || '-'}
                                        </p>
                                    </td>
                                    <td className="px-3 py-3.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="truncate font-bold text-slate-800 dark:text-slate-200">
                                                {appointment?.exam_type_name || queue?.exam_type_name || queue?.modality_name || '-'}
                                            </p>
                                            {(appointment?.contrast_required || queue?.contrast_required || invoice?.contrast_required) && (
                                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                    <AlertTriangle size={10} className="text-amber-600" />
                                                    {isRtl ? 'يتطلب صبغة' : 'Contrast'}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                                            {appointment?.machine_name || queue?.machine_name || queue?.modality_name || ''}
                                        </p>
                                    </td>
                                    <td className="px-3 py-3.5">
                                        <PriorityBadge priority={appointment?.priority || queue?.priority} />
                                    </td>
                                    <td className="px-3 py-3.5">
                                        {renderStatus(row)}
                                    </td>
                                    <td className="px-3 py-3.5">
                                        {renderWait(queue)}
                                    </td>
                                    <td className="px-4 py-3.5 pe-5 text-end">
                                        {renderActions(row)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {!appLoading && filteredAndSorted.length === 0 && (
                    <div className="p-10">
                        <EmptyState
                            icon={CheckCircle2}
                            title={t('queue.empty', { defaultValue: 'No operations found' })}
                            subtitle={searchTerm ? t('queue.emptySearch', { defaultValue: 'Try a different search.' }) : t('empty.noAppointments')}
                        />
                    </div>
                )}
            </div>

            {/* Pagination Footer */}
            {filteredAndSorted.length > 0 && (
                <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:px-6">
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                        <span>
                            {t('pagination.showing', {
                                from: paginationState.startIndex + 1,
                                to: paginationState.endIndex,
                                total: filteredAndSorted.length,
                                defaultValue: `Showing ${paginationState.startIndex + 1}–${paginationState.endIndex} of ${filteredAndSorted.length}`
                            })}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold">{t('pagination.perPage', { defaultValue: 'Rows:' })}</span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                aria-label={t('pagination.selectPageSize', { defaultValue: 'Rows per page' })}
                            >
                                {PAGE_SIZE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <Pagination
                        currentPage={paginationState.currentPage}
                        pageCount={paginationState.pageCount}
                        onPageChange={setCurrentPage}
                        isRtl={isRtl}
                    />
                </footer>
            )}
        </section>
    );
};

const FilterChip = ({ active, count = 0, dotColor, label, onClick, tone = 'default' }) => {
    const base = 'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-extrabold transition-all focus-visible:outline-none';
    const styles = {
        default: active
            ? 'bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900'
            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700',
        rose: active
            ? 'bg-rose-600 text-white shadow-xs'
            : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300',
    }[tone];

    return (
        <button type="button" onClick={onClick} className={`${base} ${styles}`}>
            {dotColor && <span className={`h-2 w-2 rounded-full ${dotColor}`} />}
            <span>{label}</span>
            {count > 0 && (
                <span className={`rounded-md px-1.5 py-0.2 text-[9.5px] font-black ${active ? 'bg-white/20 text-white dark:bg-slate-300 dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {count}
                </span>
            )}
        </button>
    );
};

export default DailyOperationsTable;
