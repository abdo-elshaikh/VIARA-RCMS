import React, { useState } from 'react';
import { Clock, CreditCard, Printer, Tag, FileText } from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import StatusBadge from '../ui/StatusBadge';
import PriorityBadge from '../ui/PriorityBadge';
import StatusPill from '../ui/StatusPill';

const sourceTranslationKeys = {
    'Walk-in': 'booking.walkIn',
    Phone: 'booking.phone',
    Website: 'booking.website',
    'Patient Portal': 'booking.patientPortal',
    'Doctor Portal': 'booking.doctorPortal',
    'Call Center': 'booking.callCenter',
};

const translateSource = (source, t) => t(sourceTranslationKeys[source] || 'booking.walkIn', { defaultValue: source || t('booking.walkIn') });

const ReceptionAppointmentCard = ({ appointment, locale, onInvoice, invoice, onArrive, t }) => {
    const user = useSelector(selectCurrentUser);
    const effectivePermissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    const hasPermission = (permission) => user?.role === 'Developer' || effectivePermissions.has(permission);

    const canPrintLabels = hasPermission('PRINT_LABELS');
    const canPrintReceipts = hasPermission('PRINT_RECEIPTS');
    const queueStage = appointment.queue_stage;
    const hasTerminalExam = ['Finalized', 'Delivered', 'Cancelled'].includes(queueStage) || ['Completed', 'Cancelled'].includes(appointment.status);
    const canArrive = appointment.exam_id && queueStage === 'Scheduled' && !hasTerminalExam;

    const [showPrintMenu, setShowPrintMenu] = useState(false);

    const handlePrintSticker = () => {
        // Let's ask for copies using a simple prompt for now, or default to 1.
        const copies = window.prompt("How many sticker copies?", "1");
        if (copies && parseInt(copies, 10) > 0) {
            window.open(`/print/sticker/${appointment.appointment_id}?copies=${parseInt(copies, 10)}`, '_blank');
        }
        setShowPrintMenu(false);
    };

    const handlePrintReceipt = () => {
        window.open(`/print/receipt/${appointment.appointment_id}`, '_blank');
        setShowPrintMenu(false);
    };

    return (
        <article className="p-4 relative">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Clock size={14} className="shrink-0 text-teal-600" />
                        <span className="font-mono text-sm font-black text-slate-900">{new Date(appointment.start_time).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <h3 className="mt-2 truncate font-bold text-slate-900">{appointment.patient_name || t('table.patientFallback')}</h3>
                    <p className="font-mono text-[11px] text-slate-400 ltr-embed">{appointment.mrn}</p>
                </div>
                <StatusBadge status={appointment.status} />
            </div>
            <div className="mt-3 rounded-none bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-none border border-teal-100 bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700">{appointment.machine_name || t('booking.noMachine')}</span>
                    <PriorityBadge priority={appointment.priority} />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600">{appointment.exam_type_name || t('table.noExamType')}</p>
                {appointment.order_number && <p className="mt-1 font-mono text-[10px] text-slate-400 ltr-embed">{appointment.order_number}</p>}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 relative">
                <span className="text-[11px] font-semibold text-slate-400">{translateSource(appointment.appointment_source, t)}</span>
                
                <div className="flex items-center gap-2">
                    {(canPrintLabels || canPrintReceipts) && (
                        <div className="relative">
                            <button 
                                type="button" 
                                onClick={() => setShowPrintMenu(!showPrintMenu)}
                                className="inline-flex items-center justify-center rounded-none bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 active:scale-95 transition-colors"
                                title="Print Options"
                            >
                                <Printer size={16} />
                            </button>
                            
                            {showPrintMenu && (
                                <div className="absolute bottom-full end-0 mb-2 w-48 rounded-none border border-slate-100 bg-white p-1 shadow-lg z-10">
                                    {canPrintLabels && (
                                        <button 
                                            onClick={handlePrintSticker}
                                            className="flex w-full items-center gap-2 rounded-none p-2 text-start text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Tag size={14} className="text-slate-400" />
                                            Print Sticker(s)
                                        </button>
                                    )}
                                    {canPrintReceipts && (
                                        <button 
                                            onClick={handlePrintReceipt}
                                            className="flex w-full items-center gap-2 rounded-none p-2 text-start text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <FileText size={14} className="text-slate-400" />
                                            Print Receipt
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {invoice ? (
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Invoice:</span>
                            <StatusPill status={invoice.invoice_status} />
                        </div>
                    ) : (
                        <button type="button" onClick={onInvoice} className="inline-flex items-center gap-1.5 rounded-none border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 active:scale-95 transition-colors">
                            <CreditCard size={13} />{t('table.createInvoice')}
                        </button>
                    )}

                    {appointment.exam_id && (
                        canArrive ? (
                            <button
                                type="button"
                                onClick={onArrive}
                                className="inline-flex items-center gap-1.5 rounded-none border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 active:scale-95 transition-colors"
                            >
                                {t('queue.arrived', { defaultValue: 'Arrive' })}
                            </button>
                        ) : queueStage ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                                {t(`queue.stages.${queueStage}`, { defaultValue: queueStage })}
                            </span>
                        ) : appointment.status === 'Checked-in' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                {t('queue.stages.Arrived', { defaultValue: 'Arrived' })}
                            </span>
                        ) : null
                    )}
                </div>
            </div>
        </article>
    );
};

export default ReceptionAppointmentCard;
