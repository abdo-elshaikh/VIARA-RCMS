import React, { useState } from 'react';
import { useGetWaitingListQuery } from '../../store/api';
import ModernWaitlistPanel from './ModernWaitlistPanel';
import DailyOperationsTable from './DailyOperationsTable';
import ReceptionCaseDetailsModal from './ReceptionCaseDetailsModal';

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
    canManageWaitlist,
    canCreateAppointments,
    onQueueMove,
    onPickup,
    onOpenPayment,
    partialPaymentExceptions,
    onRequestPartialPaymentException,
    quickFilter = null,
    externalDesk = null,
    externalScope = null,
    externalRooms = null,
    externalModalities = null,
    onDeskChange = null,
    onScopeChange = null
}) => {
    const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
    const [selectedCase, setSelectedCase] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);

    const { data: waitingList = [] } = useGetWaitingListQuery({
        active: 'true',
        date: selectedDate
    });

    const toggleWaitlist = () => setIsWaitlistOpen((prev) => !prev);

    return (
        <div className="space-y-6">
            <div className={`grid w-full min-w-0 gap-5 transition-all duration-200 ${isWaitlistOpen
                    ? 'xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start'
                    : 'grid-cols-1'
                }`}>
                {/* Main Operations Table */}
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
                        partialPaymentExceptions={partialPaymentExceptions}
                        onRequestPartialPaymentException={onRequestPartialPaymentException}
                        i18n={i18n}
                        t={t}
                        onSelectCase={(row, opts) => {
                            setSelectedCase(row);
                            setIsEditMode(Boolean(opts?.editMode));
                        }}
                        isWaitlistOpen={isWaitlistOpen}
                        onToggleWaitlist={toggleWaitlist}
                        waitlistCount={waitingList?.length || 0}
                        quickFilter={quickFilter}
                        externalDesk={externalDesk}
                        externalScope={externalScope}
                        externalRooms={externalRooms}
                        externalModalities={externalModalities}
                        onDeskChange={onDeskChange}
                        onScopeChange={onScopeChange}
                    />
                </div>

                {/* Collapsible Waitlist Side Panel */}
                {isWaitlistOpen && (
                    <div className="min-w-0 xl:sticky xl:top-[88px] transition-all duration-200">
                        <ModernWaitlistPanel
                            selectedDate={selectedDate}
                            t={t}
                            canManage={canManageWaitlist}
                            canCreateAppointments={canCreateAppointments}
                            onClose={toggleWaitlist}
                        />
                    </div>
                )}
            </div>

            {/* Comprehensive Case Details Modal */}
            {selectedCase && (
                <ReceptionCaseDetailsModal
                    isOpen={Boolean(selectedCase)}
                    onClose={() => {
                        setSelectedCase(null);
                        setIsEditMode(false);
                    }}
                    caseItem={selectedCase}
                    initialEditMode={isEditMode}
                    onMove={onQueueMove || moveQueue}
                    onOpenPayment={onOpenPayment}
                    createAppointmentInvoice={createAppointmentInvoice}
                    canCreateInvoices={Boolean(createAppointmentInvoice)}
                    onPickup={onPickup}
                    canManageQueue={canManageQueue}
                    canDeliverResults={canDeliverResults}
                    locale={i18n?.language}
                    workstationDesk={externalDesk}
                    workstationScope={externalScope}
                    workstationRooms={externalRooms}
                    workstationModalities={externalModalities}
                />
            )}
        </div>
    );
};

export default ScheduleView;
