import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../../store/authSlice';
import {
    useGetInvoiceQuery,
    useGetPartialPaymentExceptionsQuery,
    useGetStockMovementsQuery,
    useRequestPartialPaymentExceptionMutation
} from '../../store/api';
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
    Sparkles,
    CheckCircle2,
    Clock,
    Activity,
    AlertTriangle,
    CreditCard,
    ArrowLeft,
    ArrowRight,
    Users,
    Filter,
    Search,
    ChevronLeft,
    ChevronRight,
    ShieldCheck
} from 'lucide-react';

import { useReceptionPermissions } from '../../hooks/useReceptionPermissions';
import { useReceptionData } from '../../hooks/useReceptionData';
import { usePaymentFlow } from '../../hooks/usePaymentFlow';
import { useShiftFlow } from '../../hooks/useShiftFlow';
import { usePatientRegistration } from '../../hooks/usePatientRegistration';
import { buildReceptionTabs, shiftLocalDateInput, toLocalDateInput } from './receptionLogic';
import ReceptionTabNav from './ReceptionTabNav';
import ScheduleView from './ScheduleView';
import PatientDirectory from './PatientDirectory';
import CashierQueueTab from './CashierQueueTab';
import BillingTab from './BillingTab';
import ShiftActionModal from './ShiftActionModal';
import PaymentCollectionModal from './PaymentCollectionModal';
import PatientRegistrationModal from './PatientRegistrationModal';
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
    const isArabic = i18n.language?.startsWith('ar');
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const user = useSelector(selectCurrentUser);
    const [activeTab, setActiveTab] = useState(() => {
        try {
            return searchParams.get('tab') || sessionStorage.getItem('VIARA.reception.activeTab') || 'schedule';
        } catch {
            return 'schedule';
        }
    });
    const [selectedDate, setSelectedDate] = useState(toLocalDateInput);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewingPatientId, setViewingPatientId] = useState(null);
    const [partialExceptionTarget, setPartialExceptionTarget] = useState(null);
    const linkedInvoiceId = searchParams.get('invoiceId');
    const { data: linkedInvoice } = useGetInvoiceQuery(linkedInvoiceId, { skip: !linkedInvoiceId });

    const permissions = useReceptionPermissions();
    const { has, canProcessPayments, canOpenCashierShift, canCloseCashierShift, canDiscount, canAppendSupplies, canManageQueue, canDeliverResults } = permissions;
    const shiftFlow = useShiftFlow({ skip: !permissions.canProcessPayments && !permissions.canReconcileShifts });
    const receptionData = useReceptionData({ selectedDate });
    const {
        appointments,
        queueItems,
        queueKpis,
        invoices,
        cashierPending,
        scheduleSummary,
        dataErrors,
        hasDataError,
        appLoading,
        isWorkspaceFetching,
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
    const { openPayment } = paymentFlow;
    const stockMovementParams = useMemo(() => ({
        referenceType: 'Exam',
        referenceIds: queueItems.map((item) => item.exam_id).filter(Boolean).join(','),
        limit: 1000,
    }), [queueItems]);
    const { data: stockMovements = [], isFetching: isStockRefreshing, refetch: refetchStockMovements } = useGetStockMovementsQuery(stockMovementParams, {
        pollingInterval: 30000,
        skip: !canProcessPayments || !stockMovementParams.referenceIds,
    });
    const registration = usePatientRegistration({ navigate, selectedDate });
    const [requestPartialPaymentException, partialExceptionMutation] = useRequestPartialPaymentExceptionMutation();
    const canUsePartialPaymentExceptions = has('REQUEST_PARTIAL_PAYMENT_EXCEPTION');
    const { data: approvedPartialPaymentExceptions = [], refetch: refetchApprovedExceptions } = useGetPartialPaymentExceptionsQuery({
        status: 'Approved',
        transactionType: 'ClinicalQueueTransition',
        limit: 500,
    }, {
        skip: !canUsePartialPaymentExceptions,
        pollingInterval: 15000,
    });

    const tabs = useMemo(
        () => buildReceptionTabs({ canProcessPayments, t }).map((tab) => ({ ...tab, icon: TAB_ICONS[tab.id] })),
        [canProcessPayments, t]
    );

    useEffect(() => {
        if (!tabs.some((tab) => tab.id === activeTab)) {
            setActiveTab(tabs[0]?.id || 'schedule');
        }
    }, [activeTab, tabs]);

    useEffect(() => {
        try {
            sessionStorage.setItem('VIARA.reception.activeTab', activeTab);
        } catch {
            // Session storage may be unavailable in privacy-restricted browsers.
        }
    }, [activeTab]);

    useEffect(() => {
        const requestedInvoiceId = searchParams.get('invoiceId');
        if (!requestedInvoiceId) return;
        const requestedInvoice = linkedInvoice || invoices.find((invoice) => invoice.invoice_id === requestedInvoiceId);
        if (!requestedInvoice) return;
        if (canProcessPayments) setActiveTab('cashier');
        openPayment(requestedInvoice);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('invoiceId');
        setSearchParams(nextParams, { replace: true });
    }, [canProcessPayments, invoices, linkedInvoice, openPayment, searchParams, setSearchParams]);

    const handleRefresh = useCallback(async () => {
        await Promise.all([
            refreshWorkspace(),
            canProcessPayments ? refetchStockMovements() : Promise.resolve(),
            canUsePartialPaymentExceptions ? refetchApprovedExceptions() : Promise.resolve(),
        ]);
    }, [canProcessPayments, canUsePartialPaymentExceptions, refetchApprovedExceptions, refetchStockMovements, refreshWorkspace]);

    const handleTabChange = useCallback((nextTab) => {
        if (!tabs.some((tab) => tab.id === nextTab)) return;
        setActiveTab(nextTab);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', nextTab);
        setSearchParams(nextParams, { replace: true });
    }, [searchParams, setSearchParams, tabs]);

    const submitPartialPaymentException = useCallback(async (reason) => {
        if (!partialExceptionTarget?.invoice?.invoice_id) return false;
        try {
            await requestPartialPaymentException({
                invoiceId: partialExceptionTarget.invoice.invoice_id,
                transactionType: partialExceptionTarget.transactionType,
                targetStage: partialExceptionTarget.targetStage,
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
            isArabic ? 'ar-EG' : 'en-US',
            { weekday: 'long', month: 'long', day: 'numeric' }
        ),
        [isArabic, selectedDate]
    );

    // Quick Date Shift Helper
    const shiftDate = (days) => {
        setSelectedDate(shiftLocalDateInput(selectedDate, days));
    };

    const isToday = selectedDate === toLocalDateInput();

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
            {hasDataError && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-black">
                            {isArabic ? 'تعذر تحميل بعض بيانات الاستقبال' : 'Some reception data could not be loaded'}
                        </p>
                        <p className="mt-1 text-xs font-medium">
                            {isArabic
                                ? `المصادر المتأثرة: ${dataErrors.map(({ source }) => source).join('، ')}. لا تعتمد على الأرقام الصفرية قبل إعادة المحاولة.`
                                : `Affected sources: ${dataErrors.map(({ source }) => source).join(', ')}. Do not treat zero values as authoritative until refresh succeeds.`}
                        </p>
                    </div>
                </div>
            )}
            {/* Top Reception Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Building2 size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Sparkles size={11} />
                                    <span>{t('command.live', { defaultValue: 'Reception Command Center' })}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                                    <span className="relative flex h-2 w-2">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                    </span>
                                    <span>{isWorkspaceFetching || isRefreshing
                                        ? (isArabic ? 'جاري التحديث' : 'Updating')
                                        : (isArabic ? 'مزامنة مباشرة' : 'Live Sync')}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('title', { defaultValue: 'Patient Reception & Operations' })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {displayDate} · {t('command.signedIn', { name: user?.name || user?.fullName || (isArabic ? 'موظف الاستقبال' : 'Reception Staff') })}
                            </p>
                        </div>
                    </div>

                    {/* Date Navigation & Primary Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Quick Date Stepper */}
                        <div className="flex items-center rounded-2xl border border-slate-200/80 bg-white/90 p-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <button
                                type="button"
                                onClick={() => shiftDate(-1)}
                                title={isArabic ? 'اليوم السابق' : 'Previous Day'}
                                aria-label={isArabic ? 'اليوم السابق' : 'Previous Day'}
                                className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                <ChevronLeft size={16} className="rtl:rotate-180" />
                            </button>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                                required
                                className="h-8 border-none bg-transparent px-2 text-xs font-black text-slate-800 outline-hidden dark:text-slate-200"
                            />
                            <button
                                type="button"
                                onClick={() => shiftDate(1)}
                                title={isArabic ? 'اليوم التالي' : 'Next Day'}
                                aria-label={isArabic ? 'اليوم التالي' : 'Next Day'}
                                className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                <ChevronRight size={16} className="rtl:rotate-180" />
                            </button>
                            {!isToday && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedDate(toLocalDateInput())}
                                    className="ms-1 rounded-xl bg-teal-500/10 px-2.5 py-1 text-[10.5px] font-black text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition"
                                >
                                    {isArabic ? 'اليوم' : 'Today'}
                                </button>
                            )}
                        </div>

                        {has('CREATE_PATIENTS') && <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={isRefreshing || isStockRefreshing || isWorkspaceFetching}
                            title={t('command.refresh', { defaultValue: 'Refresh' })}
                            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={15} className={isRefreshing || isStockRefreshing || isWorkspaceFetching ? 'animate-spin' : ''} />
                        </button>}

                        {has('CREATE_APPOINTMENTS') && <button
                            type="button"
                            onClick={registration.open}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <UserPlus size={15} />
                            <span>{t('command.addPatient', { defaultValue: 'Add Patient' })}</span>
                        </button>}

                        <button
                            type="button"
                            onClick={() => navigate(`/appointments/new?date=${encodeURIComponent(selectedDate)}`)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                        >
                            <CalendarPlus size={15} />
                            <span>{t('booking.title', { defaultValue: 'Book Appointment' })}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 5-Tile High-Contrast Telemetry Metrics HUD */}
            <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
                {[
                    { label: t('overview.booked', { defaultValue: 'Today Bookings' }), value: scheduleSummary.booked || 0, icon: CalendarCheck2, color: 'teal', detail: isArabic ? 'إجمالي الحالات المجدولة' : 'Scheduled exams' },
                    { label: t('overview.ready', { defaultValue: 'Arrived & In Prep' }), value: scheduleSummary.ready || 0, icon: CheckCircle2, color: 'emerald', detail: isArabic ? 'حاضرون بالاستقبال' : 'Checked-in patients' },
                    { label: isArabic ? 'داخل غرف الأشعة' : 'In Examination', value: (queueItems.filter(q => (q.queue_stage || q.queueStage) === 'In Exam').length) || 0, icon: Activity, color: 'indigo', detail: isArabic ? 'فحوصات جارية حالياً' : 'Active modality scans' },
                    { label: t('overview.priority', { defaultValue: 'Priority & STAT' }), value: scheduleSummary.urgent || 0, icon: AlertTriangle, color: 'amber', detail: isArabic ? 'حالات طارئة وعاجلة' : 'High-priority cases' },
                    { label: isArabic ? 'التحصيل المعلق' : 'Cashier Pending', value: cashierPending.length || 0, icon: CreditCard, color: 'purple', detail: isArabic ? 'فواتير غير مسددة' : 'Awaiting payment' },
                ].map((m) => {
                    const Icon = m.icon;
                    return (
                        <div key={m.label} className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{m.label}</p>
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                                    <Icon size={16} />
                                </span>
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">{m.value}</p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{m.detail}</p>
                        </div>
                    );
                })}
            </section>

            {/* Sub-Tabs Nav */}
            <ReceptionTabNav
                activeTab={activeTab}
                cashierPending={cashierPending.length}
                onTabChange={handleTabChange}
                tabs={tabs}
                t={t}
            />

            {/* Main Tab Workspaces */}
            <main
                id={`reception-panel-${activeTab}`}
                className="w-full"
                role="tabpanel"
                aria-labelledby={`reception-tab-${activeTab}`}
                tabIndex={0}
            >
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
                        canManageWaitlist={has('MANAGE_WAITLIST')}
                        canCreateAppointments={has('CREATE_APPOINTMENTS')}
                        onQueueMove={moveQueue}
                        onPickup={setPickupTarget}
                        onOpenPayment={paymentFlow.openPayment}
                        approvedPartialPaymentExceptions={approvedPartialPaymentExceptions}
                        onRequestPartialPaymentException={canUsePartialPaymentExceptions ? setPartialExceptionTarget : undefined}
                    />
                )}

                {activeTab === 'patients' && (
                    <PatientDirectory
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        onBook={has('CREATE_APPOINTMENTS') ? (pat) => navigate(`/appointments/new?patientId=${encodeURIComponent(pat.patient_id || pat.id)}&date=${encodeURIComponent(selectedDate)}`) : undefined}
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

            {/* Modals & Dialogs */}
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
                cancelLabel={t('pickup.cancel', { defaultValue: 'Cancel' })}
                validationMessage={t('billing.exceptionReasonRequired', { defaultValue: 'Enter at least 5 characters.' })}
                validate={(value) => value.trim().length < 5 ? t('billing.exceptionReasonRequired', { defaultValue: 'Enter at least 5 characters.' }) : ''}
                inputProps={{ maxLength: 1000 }}
                isLoading={partialExceptionMutation.isLoading}
            />

            <TextPromptDialog
                isOpen={Boolean(pickupTarget)}
                onClose={() => setPickupTarget(null)}
                onConfirm={confirmPickup}
                title={t('pickup.title', { defaultValue: 'Confirm Report Delivery' })}
                message={t('pickup.description', {
                    patient: pickupTarget?.patient_name || (isArabic ? 'المريض' : 'Patient'),
                    mrn: pickupTarget?.mrn || '-',
                })}
                label={t('pickup.recipient', { defaultValue: 'Recipient Name' })}
                placeholder={t('pickup.recipientPlaceholder', { defaultValue: 'Name of the person receiving the report...' })}
                initialValue={pickupTarget?.patient_name || ''}
                confirmLabel={t('pickup.confirm', { defaultValue: 'Confirm Delivery' })}
                cancelLabel={t('pickup.cancel', { defaultValue: 'Cancel' })}
                validationMessage={t('pickup.recipientRequired', { defaultValue: 'Recipient name is required.' })}
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
