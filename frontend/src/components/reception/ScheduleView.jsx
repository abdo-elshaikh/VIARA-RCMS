import React, { Suspense, lazy, useCallback, useState } from 'react';
import { useGetWaitingListQuery } from '../../store/api';
import DailyOperationsTable from './DailyOperationsTable';

const ModernWaitlistPanel = lazy(() => import('./ModernWaitlistPanel'));
const ReceptionCaseDetailsModal = lazy(() => import('./ReceptionCaseDetailsModal'));

const PanelFallback = () => (
    <div className="min-h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/80" />
);

const ScheduleView = ({
    displayDate,
    appointments = [],
    appLoading,
    scheduleSummary,
    invoices = [],
    createAppointmentInvoice,
    moveQueue,
    i18n,
    t,
    selectedDate,
    queueItems = [],
    queueKpis,
    canManageQueue,
    canDeliverResults,
    canViewInvoices = false,
    canManageWaitlist,
    canCreateAppointments,
    onQueueMove,
    onPickup,
    onRequestReport,
    isRequestingReport = false,
    onDeferReport,
    onOpenPayment,
    partialPaymentExceptions,
    onRequestPartialPaymentException,
    quickFilter = null,
    externalDesk = null,
    externalScope = null,
    externalRooms = null,
    externalModalities = null,
    onDeskChange = null,
    onScopeChange = null,
    hasActiveReceptionShift = true
}) => {
    const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
    const [selectedCase, setSelectedCase] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);

    const { data: waitingList = [] } = useGetWaitingListQuery({
        active: 'true',
        date: selectedDate
    }, {
        skip: !canManageWaitlist,
        refetchOnFocus: false,
    });

    const toggleWaitlist = useCallback(() => setIsWaitlistOpen((prev) => !prev), []);
    const handleSelectCase = useCallback((row, opts) => {
        setSelectedCase(row);
        setIsEditMode(Boolean(opts?.editMode));
    }, []);
    const handleCloseCase = useCallback(() => {
        setSelectedCase(null);
        setIsEditMode(false);
    }, []);

    return (
        <div className="space-y-3">
            <div className={`grid w-full min-w-0 gap-3 ${isWaitlistOpen
                ? '2xl:grid-cols-[minmax(0,1fr)_320px] 2xl:items-start'
                : 'grid-cols-1'
            }`}>
                <div className="min-w-0">
                    <DailyOperationsTable
                        appointments={appointments}
                        queueItems={queueItems}
                        queueKpis={queueKpis}
                        invoices={invoices}
                        appLoading={appLoading}
                        canManageQueue={canManageQueue}
                        canDeliverResults={canDeliverResults}
                        canViewInvoices={canViewInvoices}
                        createAppointmentInvoice={createAppointmentInvoice}
                        onMove={onQueueMove || moveQueue}
                        onPickup={onPickup}
                        onRequestReport={onRequestReport}
                        isRequestingReport={isRequestingReport}
                        onDeferReport={onDeferReport}
                        onOpenPayment={onOpenPayment}
                        partialPaymentExceptions={partialPaymentExceptions}
                        onRequestPartialPaymentException={onRequestPartialPaymentException}
                        i18n={i18n}
                        t={t}
                        onSelectCase={handleSelectCase}
                        isWaitlistOpen={isWaitlistOpen}
                        onToggleWaitlist={canManageWaitlist ? toggleWaitlist : undefined}
                        waitlistCount={waitingList?.length || 0}
                        quickFilter={quickFilter}
                        externalDesk={externalDesk}
                        externalScope={externalScope}
                        externalRooms={externalRooms}
                        externalModalities={externalModalities}
                        onDeskChange={onDeskChange}
                        onScopeChange={onScopeChange}
                        hasActiveReceptionShift={hasActiveReceptionShift}
                    />
                </div>

                {isWaitlistOpen && (
                    <aside className="min-w-0 2xl:sticky 2xl:top-3">
                        <Suspense fallback={<PanelFallback />}>
                            <ModernWaitlistPanel
                                selectedDate={selectedDate}
                                t={t}
                                canManage={canManageWaitlist}
                                canCreateAppointments={canCreateAppointments}
                                onClose={toggleWaitlist}
                            />
                        </Suspense>
                    </aside>
                )}
            </div>

            {selectedCase && (
                <Suspense fallback={null}>
                    <ReceptionCaseDetailsModal
                        isOpen={Boolean(selectedCase)}
                        onClose={handleCloseCase}
                        caseItem={selectedCase}
                        initialEditMode={isEditMode}
                        onMove={onQueueMove || moveQueue}
                        onOpenPayment={onOpenPayment}
                        createAppointmentInvoice={createAppointmentInvoice}
                        canCreateInvoices={Boolean(createAppointmentInvoice)}
                        onPickup={onPickup}
                        canManageQueue={canManageQueue}
                        canDeliverResults={canDeliverResults}
                        canViewInvoices={canViewInvoices}
                        locale={i18n?.language}
                        workstationDesk={externalDesk}
                        workstationScope={externalScope}
                        workstationRooms={externalRooms}
                        workstationModalities={externalModalities}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default ScheduleView;
