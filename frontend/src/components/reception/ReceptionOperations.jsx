import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../../store/authSlice';
import { useGetStockMovementsQuery, useRequestPartialPaymentExceptionMutation } from '../../store/api';
import {
    Building2,
    CalendarCheck2,
    CalendarDays,
    CalendarPlus,
    CircleDollarSign,
    RefreshCw,
    UserPlus,
    UsersRound,
    WalletCards,
    Wifi,
} from 'lucide-react';

import { useReceptionPermissions } from '../../hooks/useReceptionPermissions';
import { useReceptionData } from '../../hooks/useReceptionData';
import { usePaymentFlow } from '../../hooks/usePaymentFlow';
import { useShiftFlow } from '../../hooks/useShiftFlow';
import { usePatientRegistration } from '../../hooks/usePatientRegistration';
import { buildReceptionTabs, toLocalDateInput } from './receptionLogic';
import PageHeader from '../ui/PageHeader';
import ReceptionTabNav from './ReceptionTabNav';
import ScheduleView from './ScheduleView';
import PatientDirectory from './PatientDirectory';
import CashierQueueTab from './CashierQueueTab';
import BillingTab from './BillingTab';
import ShiftActionModal from './ShiftActionModal';
import PaymentCollectionModal from './PaymentCollectionModal';
import PatientRegistrationModal from './PatientRegistrationModal';
import PatientDetail from '../PatientDetail';
import TextPromptDialog from '../ui/TextPromptDialog';
import { getErrorMessage } from '../../utils/getErrorMessage';

const TAB_ICONS = {
    schedule: CalendarCheck2,
    patients: UsersRound,
    cashier: CircleDollarSign,
    billing: WalletCards,
};

const ReceptionOperations = () => {
    const { t, i18n } = useTranslation('reception');
    const navigate = useNavigate();
    const user = useSelector(selectCurrentUser);
    const [activeTab, setActiveTab] = useState('schedule');
    const [selectedDate, setSelectedDate] = useState(toLocalDateInput);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewingPatientId, setViewingPatientId] = useState(null);
    const [partialExceptionTarget, setPartialExceptionTarget] = useState(null);

    const permissions = useReceptionPermissions();
    const { canProcessPayments, canOpenCashierShift, canCloseCashierShift, canDiscount, canAppendSupplies, canManageQueue, canDeliverResults } = permissions;
    const shiftFlow = useShiftFlow({ skip: !permissions.canProcessPayments && !permissions.canReconcileShifts });
    const receptionData = useReceptionData({ selectedDate });
    const {
        appointments,
        queueItems,
        queueKpis,
        patientList,
        invoices,
        cashierPending,
        scheduleSummary,
        appLoading,
        isPatListLoading,
        isRefreshing,
        isDeliveringResult,
        refreshWorkspace,
        moveQueue,
        createAppointmentInvoice,
        confirmPickup,
        pickupTarget,
        setPickupTarget,
    } = receptionData;

    const paymentFlow = usePaymentFlow({
        currentShift: shiftFlow.currentShift,
        queueItems,
    });
    const { data: stockMovements = [], isFetching: isStockRefreshing, refetch: refetchStockMovements } = useGetStockMovementsQuery(undefined, {
        pollingInterval: 30000,
        skip: !canProcessPayments,
    });
    const registration = usePatientRegistration({ navigate, selectedDate });
    const [requestPartialPaymentException, partialExceptionMutation] = useRequestPartialPaymentExceptionMutation();

    const tabs = useMemo(
        () => buildReceptionTabs({ canProcessPayments, t }).map((tab) => ({ ...tab, icon: TAB_ICONS[tab.id] })),
        [canProcessPayments, t]
    );

    const handleRefresh = useCallback(async () => {
        await Promise.all([
            refreshWorkspace(),
            canProcessPayments ? refetchStockMovements() : Promise.resolve(),
        ]);
    }, [canProcessPayments, refetchStockMovements, refreshWorkspace]);

    const handleTabChange = useCallback((nextTab) => {
        if (tabs.some((tab) => tab.id === nextTab)) setActiveTab(nextTab);
    }, [tabs]);

    const submitPartialPaymentException = useCallback(async (reason) => {
        if (!partialExceptionTarget?.invoice?.invoice_id) return false;
        try {
            await requestPartialPaymentException({
                invoiceId: partialExceptionTarget.invoice.invoice_id,
                transactionType: partialExceptionTarget.transactionType,
                reason,
            }).unwrap();
            toast.success(t('billing.exceptionRequested', { defaultValue: 'Exception request sent for approval.' }));
            setPartialExceptionTarget(null);
            await refreshWorkspace();
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('billing.exceptionRequestFailed', { defaultValue: 'Exception request could not be submitted.' })));
            return false;
        }
    }, [partialExceptionTarget, refreshWorkspace, requestPartialPaymentException, t]);

    const displayDate = useMemo(
        () => new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
            i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US',
            { weekday: 'long', month: 'long', day: 'numeric' }
        ),
        [i18n.language, selectedDate]
    );

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Building2}
                eyebrow={t('command.live')}
                eyebrowIcon={Wifi}
                title={t('title')}
                description={t('command.description')}
                meta={
                    <span className="truncate rounded-none border border-slate-200/60 bg-slate-50/40 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-muted)]">
                        {t('command.signedIn', { name: user?.name || user?.fullName || t('fallback.staff') })}
                    </span>
                }
                actions={
                    <>
                        <label className="flex h-10 items-center gap-2 rounded-none border border-slate-200/60 bg-slate-50/40 px-3 text-sm font-bold text-slate-700 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)] dark:text-slate-300 dark:[color-scheme:dark]" title={t('date')}>
                            <CalendarDays size={16} className="shrink-0 text-slate-450" aria-hidden="true" />
                            <span className="sr-only">{t('date')}</span>
                            <input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} className="w-full bg-transparent outline-none sm:w-[132px]" />
                        </label>
                        <button type="button" onClick={handleRefresh} disabled={isRefreshing || isStockRefreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-none border border-slate-200/60 bg-white/80 px-3 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-800 disabled:opacity-50 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-ink)]">
                            <RefreshCw size={16} className={isRefreshing || isStockRefreshing ? 'animate-spin' : ''} />
                            <span className="hidden sm:inline">{t('command.refresh')}</span>
                        </button>
                        <button type="button" onClick={registration.open} className="inline-flex h-10 items-center justify-center gap-2 rounded-none border border-teal-200/60 bg-teal-50/50 px-4 text-sm font-bold text-teal-800 transition hover:bg-teal-100 dark:border-teal-900/40 dark:bg-teal-950/20 dark:text-teal-300">
                            <UserPlus size={16} />
                            <span className="hidden sm:inline">{t('command.addPatient', { defaultValue: 'Add patient' })}</span>
                        </button>
                        <button type="button" onClick={() => navigate(`/appointments/new?date=${encodeURIComponent(selectedDate)}`)} className="inline-flex h-10 items-center justify-center gap-2 rounded-none bg-teal-700 px-5 text-sm font-black text-white transition hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400">
                            <CalendarPlus size={16} />
                            {t('booking.title', { defaultValue: 'Book' })}
                        </button>
                    </>
                }
            />


            <ReceptionTabNav
                activeTab={activeTab}
                cashierPending={cashierPending.length}
                onTabChange={handleTabChange}
                tabs={tabs}
                t={t}
            />

            <main className="flex-grow mx-auto w-full max-w-screen-2xl">
                {activeTab === 'schedule' && (
                    <ScheduleView
                        displayDate={displayDate}
                        appointments={appointments}
                        appLoading={appLoading}
                        scheduleSummary={scheduleSummary}
                        invoices={invoices}
                        createAppointmentInvoice={createAppointmentInvoice}
                        moveQueue={moveQueue}
                        i18n={i18n}
                        t={t}
                        selectedDate={selectedDate}
                        queueItems={queueItems}
                        queueKpis={queueKpis}
                        canManageQueue={canManageQueue}
                        canDeliverResults={canDeliverResults}
                        onQueueMove={moveQueue}
                        onPickup={setPickupTarget}
                        onOpenPayment={paymentFlow.openPayment}
                        onRequestPartialPaymentException={setPartialExceptionTarget}
                    />
                )}

                {activeTab === 'patients' && (
                    <PatientDirectory
                        patientList={patientList}
                        isLoading={isPatListLoading}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        onBook={(pat) => navigate(`/appointments/new?patientId=${encodeURIComponent(pat.patient_id || pat.id)}&date=${encodeURIComponent(selectedDate)}`)}
                        onViewProfile={(pat) => setViewingPatientId(pat.patient_id || pat.id)}
                    />
                )}

                {activeTab === 'cashier' && (
                    <CashierQueueTab
                        canAppendSupplies={canAppendSupplies}
                        canCloseShift={canCloseCashierShift}
                        canOpenShift={canOpenCashierShift}
                        currentShift={shiftFlow.currentShift}
                        invoices={invoices}
                        isLoadingShift={shiftFlow.isLoadingShift}
                        items={cashierPending}
                        stockMovements={stockMovements}
                        locale={i18n.language}
                        onCreateInvoice={createAppointmentInvoice}
                        onMoveQueue={moveQueue}
                        onOpenPayment={paymentFlow.openPayment}
                        onShiftAction={shiftFlow.openShiftDialog}
                        t={t}
                    />
                )}

                {activeTab === 'billing' && <BillingTab />}
            </main>

            <ShiftActionModal {...shiftFlow.shiftModalProps} />

            <PaymentCollectionModal
                {...paymentFlow.paymentModalProps}
                canDiscount={canDiscount}
            />

            <PatientRegistrationModal {...registration.registrationModalProps} />

            <TextPromptDialog
                isOpen={Boolean(partialExceptionTarget)}
                onClose={() => setPartialExceptionTarget(null)}
                onConfirm={submitPartialPaymentException}
                title={t('billing.requestExceptionTitle', { defaultValue: 'Request partial payment exception' })}
                message={t('billing.requestExceptionMessage', {
                    invoice: partialExceptionTarget?.invoice?.invoice_number || '-',
                    defaultValue: 'Explain why this restricted transaction should continue before the invoice is fully paid.',
                })}
                label={t('billing.exceptionReason', { defaultValue: 'Exception reason' })}
                placeholder={t('billing.exceptionReasonPlaceholder', { defaultValue: 'Responsible party approval context, patient commitment, management instruction...' })}
                confirmLabel={t('billing.submitExceptionRequest', { defaultValue: 'Submit request' })}
                cancelLabel={t('pickup.cancel')}
                validationMessage={t('billing.exceptionReasonRequired', { defaultValue: 'Enter at least 5 characters.' })}
                validate={(value) => value.trim().length < 5 ? t('billing.exceptionReasonRequired', { defaultValue: 'Enter at least 5 characters.' }) : ''}
                inputProps={{ maxLength: 1000 }}
                isLoading={partialExceptionMutation.isLoading}
            />

            <TextPromptDialog
                isOpen={Boolean(pickupTarget)}
                onClose={() => setPickupTarget(null)}
                onConfirm={confirmPickup}
                title={t('pickup.title')}
                message={t('pickup.description', {
                    patient: pickupTarget?.patient_name || t('fallback.unnamed'),
                    mrn: pickupTarget?.mrn || '-',
                })}
                label={t('pickup.recipient')}
                placeholder={t('pickup.recipientPlaceholder')}
                initialValue={pickupTarget?.patient_name || ''}
                confirmLabel={t('pickup.confirm')}
                cancelLabel={t('pickup.cancel')}
                validationMessage={t('pickup.recipientRequired')}
                inputProps={{ maxLength: 150, autoComplete: 'name' }}
                isLoading={isDeliveringResult}
            />

            {viewingPatientId && (
                <PatientDetail
                    patientId={viewingPatientId}
                    onClose={() => setViewingPatientId(null)}
                    onBook={(pat) => {
                        setViewingPatientId(null);
                        navigate(`/appointments/new?patientId=${encodeURIComponent(pat.patient_id)}&date=${encodeURIComponent(selectedDate)}`);
                    }}
                />
            )}
        </div>
    );
};

export default ReceptionOperations;
