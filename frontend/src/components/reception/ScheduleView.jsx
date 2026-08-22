import React from 'react';
import ModernWaitlistPanel from './ModernWaitlistPanel';
import DailyOperationsTable from './DailyOperationsTable';

const ScheduleView = ({
    displayDate,
    appointments,
    appLoading,
    scheduleSummary,
    invoices,
    createAppointmentInvoice,
    moveQueue,
    i18n,
    t,
    selectedDate,
    queueItems,
    queueKpis,
    canManageQueue,
    canDeliverResults,
    canManageWaitlist,
    canCreateAppointments,
    onQueueMove,
    onPickup,
    onOpenPayment,
    approvedPartialPaymentExceptions,
    onRequestPartialPaymentException
}) => (
    <div className="space-y-6">
        <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
            <div className="min-w-0">
                <DailyOperationsTable
                    appointments={appointments}
                    queueItems={queueItems}
                    queueKpis={queueKpis}
                    invoices={invoices}
                    appLoading={appLoading}
                    canManageQueue={canManageQueue}
                    canDeliverResults={canDeliverResults}
                    createAppointmentInvoice={createAppointmentInvoice}
                    onMove={onQueueMove || moveQueue}
                    onPickup={onPickup}
                    onOpenPayment={onOpenPayment}
                    approvedPartialPaymentExceptions={approvedPartialPaymentExceptions}
                    onRequestPartialPaymentException={onRequestPartialPaymentException}
                    i18n={i18n}
                    t={t}
                />
            </div>
            <div className="min-w-0 xl:sticky xl:top-[88px]">
                <ModernWaitlistPanel
                    selectedDate={selectedDate}
                    t={t}
                    canManage={canManageWaitlist}
                    canCreateAppointments={canCreateAppointments}
                />
            </div>
        </div>
    </div>
);

export default ScheduleView;
