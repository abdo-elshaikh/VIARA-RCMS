import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Banknote,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    CreditCard,
    DollarSign,
    FileText,
    History,
    Layers,
    Lock,
    LockKeyhole,
    Receipt,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    TrendingUp,
    User,
    UserCheck,
    Wallet,
    WalletCards,
    X,
    Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useReviewCashierClosureMutation } from '../store/api';
import BillingTab from '../components/reception/BillingTab';
import ShiftSupervisorPanel from '../components/reception/ShiftSupervisorPanel';
import CashDrawerReconciliation from '../components/reception/CashDrawerReconciliation';
import Modal from '../components/ui/Modal';
import { selectCurrentUser } from '../store/authSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useShiftFlow } from '../hooks/useShiftFlow';
import CashierQueueTab from '../components/reception/CashierQueueTab';
import PaymentCollectionModal from '../components/reception/PaymentCollectionModal';
import { useReceptionData } from '../hooks/useReceptionData';
import { usePaymentFlow } from '../hooks/usePaymentFlow';
import { useReceptionPermissions } from '../hooks/useReceptionPermissions';
import { toLocalDateInput } from '../components/reception/receptionLogic';

const CashierWorkspace = () => {
    const { t, i18n } = useTranslation(['reception', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const user = useSelector(selectCurrentUser);
    const [searchParams, setSearchParams] = useSearchParams();

    const requestedTab = searchParams.get('tab');
    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewNotes, setReviewNotes] = useState('');

    // Permissions
    const permissions = useReceptionPermissions();
    const {
        canProcessPayments,
        canReconcileShifts,
        canOpenCashierShift: canOpenShift,
        canCloseCashierShift: canCloseShift,
        canReviewShiftVariance,
    } = permissions;

    const canCollectPayments = canProcessPayments && permissions.canViewInvoices;
    const fallbackTab = canCollectPayments
        ? 'collection'
        : permissions.canViewInvoices
            ? 'billing'
            : canReviewShiftVariance
                ? 'supervisor'
                : canCloseShift
                    ? 'reconciliation'
                    : 'billing';
    const normalizedRequestedTab = ['billing', 'collection', 'reconciliation', 'supervisor'].includes(requestedTab)
        ? requestedTab
        : fallbackTab;
    const activeTab = normalizedRequestedTab === 'collection' && !canCollectPayments
        ? fallbackTab
        : normalizedRequestedTab === 'billing' && !permissions.canViewInvoices
            ? fallbackTab
        : normalizedRequestedTab === 'reconciliation' && !canCloseShift
        ? fallbackTab
        : normalizedRequestedTab === 'supervisor' && !canReviewShiftVariance
            ? fallbackTab
            : normalizedRequestedTab;

    const [reviewCashierClosure, { isLoading: isReviewing }] = useReviewCashierClosureMutation();

    // Shift state + mutations
    const {
        currentShift,
        pendingReviewShift,
        isLoadingShift,
        isBusy,
        openShiftDialog,
        handleShiftAction,
        setOpeningBalance,
        setCountedCash,
        setShiftNotes,
        openingBalance,
        countedCash,
        shiftNotes,
        shiftAction,
        closeShiftDialog,
        handleReconciliation,
    } = useShiftFlow({
        skip: !canProcessPayments && !canReconcileShifts && !canReviewShiftVariance,
        includeAllForReview: canReviewShiftVariance,
    });

    const canChangeShift = currentShift ? canCloseShift : canOpenShift;
    const handleTabChange = useCallback((tab) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', tab);
        setSearchParams(nextParams);
    }, [searchParams, setSearchParams]);
    useEffect(() => {
        if (requestedTab !== activeTab && requestedTab !== null) handleTabChange(activeTab);
    }, [activeTab, requestedTab, handleTabChange]);

    const receptionData = useReceptionData({
        selectedDate: toLocalDateInput(),
        canViewAppointments: permissions.has('VIEW_APPOINTMENTS'),
        canViewQueue: permissions.has('VIEW_APPOINTMENTS') && permissions.canViewExams,
        canViewInvoices: permissions.canViewInvoices,
    });
    const paymentFlow = usePaymentFlow({
        currentShift,
        queueItems: receptionData.queueItems,
        refreshWorkspace: receptionData.refreshWorkspace,
        canManageQueue: permissions.canManageQueue,
    });

    const onSubmit = async (e) => {
        e.preventDefault();
        if ((shiftAction === 'open' && !canOpenShift) || (shiftAction === 'close' && !canCloseShift)) {
            toast.error(isAr ? 'عفواً، لا تملك الصلاحية الكافية لتعديل حالة الوردية.' : t('billing.shiftPermissionRequired'));
            return;
        }
        await handleShiftAction(e);
    };

    const handleConfirmReview = async (e) => {
        e.preventDefault();
        if (!reviewTarget) return;
        try {
            await reviewCashierClosure({
                id: reviewTarget.closure_id,
                reviewNotes: reviewNotes.trim() || 'Reviewed & Approved by Manager',
            }).unwrap();
            toast.success(isAr ? 'تم اعتماد ومراجعة الفارق المالي بنجاح' : 'Shift variance closure approved successfully');
            setReviewTarget(null);
            setReviewNotes('');
        } catch (error) {
            toast.error(getErrorMessage(error, isAr ? 'فشل اعتماد الفارق المالي' : 'Failed to approve variance closure'));
        }
    };

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Top Cashier Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl dark:bg-amber-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-amber-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <CircleDollarSign size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Zap size={11} />
                                    <span>{t('cashier.commandCenter')}</span>
                                </span>
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                                    currentShift
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                        : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                }`}>
                                    <span className="relative flex h-2 w-2">
                                        {currentShift && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                                        <span className={`relative inline-flex h-2 w-2 rounded-full ${currentShift ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                    </span>
                                    <span>{currentShift ? t('billing.shiftOpen') : t('billing.shiftClosedStatus')}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('cashier.workspaceTitle')}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('cashier.signedInAs', { defaultValue: isAr ? 'أمين الصندوق الحالي' : 'Signed in as' })}: {user?.name || user?.fullName || t('cashier.cashier')} · {t('cashier.workspaceDescription')}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            type="button"
                            disabled={isLoadingShift || !canChangeShift}
                            onClick={() => openShiftDialog(currentShift ? 'close' : 'open')}
                            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-xs font-black text-white shadow-xs transition active:scale-95 disabled:opacity-50 ${
                                currentShift
                                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                                    : 'bg-teal-600 hover:bg-teal-500 shadow-teal-600/20'
                            }`}
                        >
                            {currentShift ? <LockKeyhole size={15} /> : <WalletCards size={15} />}
                            <span>{currentShift ? t('billing.closeShift') : t('billing.openShift')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Pending Shift Variance Review Banner */}
            {pendingReviewShift && !currentShift && (
                <div className="relative overflow-hidden rounded-3xl border border-amber-300 bg-amber-50/90 p-5 shadow-sm dark:border-amber-700/50 dark:bg-amber-950/30">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3.5">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30 shadow-inner">
                                <AlertTriangle size={22} />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-black text-amber-950 dark:text-amber-200">
                                        {isAr ? 'إغلاق وردية معلق بانتظار اعتماد المشرف' : 'Shift Variance Closure Requires Manager Approval'}
                                    </h4>
                                    <span className="rounded-full bg-amber-200/80 px-2 py-0.5 font-mono text-[10px] font-black text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                                        {Number(pendingReviewShift.variance || 0).toFixed(2)} EGP
                                    </span>
                                </div>
                                <p className="mt-1 text-xs font-medium text-amber-800/90 dark:text-amber-300/90">
                                    {isAr
                                        ? `وردية سابقة بتاريخ (${new Date(pendingReviewShift.business_date || pendingReviewShift.opened_at).toLocaleDateString()}) أُغلقت بفارق مالي (${Number(pendingReviewShift.variance || 0).toFixed(2)} ج.م). يجب اعتماد هذا الإغلاق قبل التمكن من فتح وردية جديدة.`
                                        : `Your previous shift closed on ${new Date(pendingReviewShift.business_date || pendingReviewShift.opened_at).toLocaleDateString()} with a variance of ${Number(pendingReviewShift.variance || 0).toFixed(2)} EGP. A manager or supervisor must review and approve this closure before a new shift can be opened.`
                                    }
                                </p>
                                {pendingReviewShift.variance_reason && (
                                    <p className="mt-1 text-xs italic text-amber-700 dark:text-amber-400">
                                        {isAr ? `السبب المسجل: "${pendingReviewShift.variance_reason}"` : `Recorded Reason: "${pendingReviewShift.variance_reason}"`}
                                    </p>
                                )}
                            </div>
                        </div>

                        {canReviewShiftVariance && (
                            <button
                                type="button"
                                onClick={() => { setReviewTarget(pendingReviewShift); setReviewNotes(''); }}
                                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-amber-500 active:scale-95"
                            >
                                <ShieldCheck size={16} />
                                <span>{isAr ? 'مراجعة واعتماد الفارق' : 'Review & Approve Variance'}</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 4-Tile Telemetry Shift Status HUD */}
            <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                {/* 1. Shift Status */}
                <div className={`rounded-3xl border p-4 shadow-sm backdrop-blur-xl transition-all ${
                    currentShift
                        ? 'border-emerald-500/30 bg-emerald-500/10 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                        : 'border-amber-500/30 bg-amber-500/10 dark:border-amber-900/50 dark:bg-amber-950/20'
                }`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t('cashier.shiftMetrics.status')}
                        </p>
                        <span className={`grid h-8 w-8 place-items-center rounded-xl ${
                            currentShift
                                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                                : 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                        }`}>
                            {currentShift ? <CheckCircle2 size={16} /> : <Lock size={16} />}
                        </span>
                    </div>
                    <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">
                        {currentShift ? t('billing.shiftOpen') : t('billing.shiftClosedStatus')}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {currentShift ? (currentShift.opened_at ? new Date(currentShift.opened_at).toLocaleTimeString(isAr ? 'ar-EG' : 'en-EG') : 'Active') : 'Closed'}
                    </p>
                </div>

                {/* 2. Collected Amount */}
                <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {t('billing.netCollected')}
                        </p>
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300">
                            <Banknote size={16} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                        {Number(currentShift?.collected_amount || 0).toLocaleString(isAr ? 'ar-EG' : 'en-EG')} <span className="text-xs font-bold text-slate-400">{currentShift?.currency_code || 'EGP'}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {t('cashier.shiftMetrics.collectedDetail')}
                    </p>
                </div>

                {/* 3. Payments Count */}
                <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {t('billing.paymentCount')}
                        </p>
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                            <Receipt size={16} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                        {currentShift?.payment_count || 0}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {t('cashier.shiftMetrics.countDetail')}
                    </p>
                </div>

                {/* 4. Opening Balance */}
                <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {t('billing.openingBalance')}
                        </p>
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <Wallet size={16} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                        {Number(currentShift?.opening_balance || 0).toLocaleString(isAr ? 'ar-EG' : 'en-EG')} <span className="text-xs font-bold text-slate-400">{currentShift?.currency_code || 'EGP'}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {t('cashier.shiftMetrics.openingDetail')}
                    </p>
                </div>
            </section>

            {/* Workspace Navigation Tabs */}
<div data-workspace-tabs className="flex flex-wrap items-center gap-1.5 rounded-3xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                {canCollectPayments && <button
                    type="button"
                    onClick={() => handleTabChange('collection')}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all ${
                        activeTab === 'collection'
                            ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <CreditCard size={15} />
                    <span>{t('cashier.subTabs.queue', { defaultValue: isAr ? 'مهام التحصيل' : 'Collection Tasks' })}</span>
                </button>}
                {permissions.canViewInvoices && <button
                    type="button"
                    onClick={() => handleTabChange('billing')}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all ${
                        activeTab === 'billing'
                            ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Receipt size={15} />
                    <span>{t('billing.title', { defaultValue: isAr ? 'الفواتير والتحصيل المالي' : 'Billing & Payments' })}</span>
                </button>}

                {canCloseShift && <button
                    type="button"
                    onClick={() => handleTabChange('reconciliation')}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all ${
                        activeTab === 'reconciliation'
                            ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <History size={15} />
                    <span>{t('cashier.subTabs.reconciliation', { defaultValue: isAr ? 'مطابقة وجرد الخزينة' : 'Cash Drawer Reconciliation' })}</span>
                </button>}

                {canReviewShiftVariance && <button
                    type="button"
                    onClick={() => handleTabChange('supervisor')}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all ${
                        activeTab === 'supervisor'
                            ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <ShieldCheck size={15} />
                    <span>{t('cashier.subTabs.supervisor', { defaultValue: isAr ? 'لوحة المشرف المالي' : 'Finance Supervisor' })}</span>
                </button>}
            </div>

            {/* Tab Contents */}
            {activeTab === 'collection' && canCollectPayments && (
                <CashierQueueTab
                    canAppendSupplies={permissions.canAppendSupplies}
                    canCloseShift={canCloseShift}
                    canOpenShift={canOpenShift}
                    canReconcileShifts={canReconcileShifts}
                    canReviewShiftVariance={canReviewShiftVariance}
                    currentShift={currentShift}
                    currentUserId={user?.user_id || user?.id}
                    invoices={receptionData.invoices}
                    isLoadingShift={isLoadingShift}
                    items={receptionData.cashierPending}
                    locale={i18n.language}
                    onCreateInvoice={permissions.has('CREATE_INVOICES') ? receptionData.createAppointmentInvoice : undefined}
                    onMoveQueue={permissions.canManageQueue ? receptionData.moveQueue : undefined}
                    onOpenPayment={paymentFlow.openPayment}
                    onReconcile={handleReconciliation}
                    onRefresh={receptionData.refreshWorkspace}
                    onSupplyConsumed={receptionData.refreshWorkspace}
                    onShiftAction={openShiftDialog}
                    receptionScope="all"
                    t={t}
                />
            )}
            {activeTab === 'billing' && permissions.canViewInvoices && <BillingTab receptionShift={currentShift} onOpenPayment={paymentFlow.openPayment} />}

            {activeTab === 'reconciliation' && canCloseShift && (
                <CashDrawerReconciliation
                    currentShift={currentShift}
                    onReconcile={handleReconciliation}
                    isSubmitting={isBusy}
                    onExport={(data) => {
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `reconciliation-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                    }}
                    t={t}
                />
            )}

            {activeTab === 'supervisor' && canReviewShiftVariance && (
                <ShiftSupervisorPanel
                    currentShift={currentShift}
                    onOpenShift={() => openShiftDialog('open')}
                    onCloseShift={() => openShiftDialog('close')}
                    onViewAuditLog={() => toast.info(isAr ? 'سجل التدقيق المالي متوفر في لوحة التقارير' : 'Audit log available in reports')}
                    t={t}
                />
            )}

            {/* Shift Modal Dialog */}
            <Modal
                isOpen={Boolean(shiftAction)}
                onClose={() => !isBusy && closeShiftDialog()}
                title={
                    <span className="flex items-center gap-2">
                        {shiftAction === 'open' ? <WalletCards size={18} className="text-teal-600" /> : <LockKeyhole size={18} className="text-rose-600" />}
                        <span>{shiftAction === 'open' ? t('billing.openShiftTitle', { defaultValue: isAr ? 'فتح وردية أمين الصندوق' : 'Open Cashier Shift' }) : t('billing.closeShiftTitle', { defaultValue: isAr ? 'إغلاق وردية أمين الصندوق' : 'Close Cashier Shift' })}</span>
                    </span>
                }
                size="default"
                footer={
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={closeShiftDialog}
                            className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                        >
                            {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            form="cashier-shift-form"
                            disabled={isBusy || (shiftAction === 'close' && countedCash === '')}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-5 text-xs font-black text-white transition disabled:opacity-50 ${
                                shiftAction === 'open'
                                    ? 'bg-teal-600 hover:bg-teal-500'
                                    : 'bg-rose-600 hover:bg-rose-500'
                            }`}
                        >
                            {isBusy ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            <span>{isBusy ? (isAr ? 'جاري المعالجة...' : 'Processing...') : (isAr ? 'تأكيد وحفظ' : 'Confirm & Save')}</span>
                        </button>
                    </div>
                }
            >
                <form id="cashier-shift-form" onSubmit={onSubmit} className="space-y-4 text-xs">
                    {shiftAction === 'open' ? (
                        <div>
                            <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                                {t('billing.openingBalance', { defaultValue: isAr ? 'الرصيد الافتتاحي' : 'Opening Cash Float' })}
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                value={openingBalance}
                                onChange={(e) => setOpeningBalance(e.target.value)}
                                placeholder="0.00"
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-mono font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                dir="ltr"
                            />
                        </div>
                    ) : (
                        <>
                            <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-3.5 text-xs font-medium text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                                {t('billing.blindCountHelp', { defaultValue: isAr ? 'عُد النقد الفعلي قبل الإرسال. يظل المبلغ المتوقع مخفيًا حتى إغلاق الصندوق.' : 'Count physical cash before submitting. Expected amount remains hidden until the drawer is closed.' })}
                            </div>
                            <div>
                                <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                                    {t('billing.countedCash', { defaultValue: isAr ? 'النقد الفعلي المعدود' : 'Counted Cash' })}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                    value={countedCash}
                                    onChange={(e) => setCountedCash(e.target.value)}
                                    placeholder="0.00"
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-mono font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    dir="ltr"
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                            {shiftAction === 'close' ? t('billing.varianceReason', { defaultValue: isAr ? '\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u062c\u0631\u062f / \u0633\u0628\u0628 \u0627\u0644\u0641\u0627\u0631\u0642 \u0627\u0644\u0645\u0627\u0644\u064a' : 'Count Note / Variance Reason' }) : t('billing.shiftNotes', { defaultValue: isAr ? '\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0648\u0631\u062f\u064a\u0629' : 'Shift Notes' })}
                            {shiftAction === 'close' && <span className="text-slate-400 ms-1">({isAr ? '\u0645\u0637\u0644\u0648\u0628 \u0639\u0646\u062f \u0648\u062c\u0648\u062f \u0641\u0631\u0642' : 'required if a variance exists'})</span>}
                        </label>
                        <textarea
                            rows={3}
                            value={shiftNotes}
                            onChange={(e) => setShiftNotes(e.target.value)}
                            placeholder={shiftAction === 'close'
                                ? t('billing.varianceReason', { defaultValue: isAr ? '\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u062c\u0631\u062f / \u0633\u0628\u0628 \u0627\u0644\u0641\u0627\u0631\u0642 \u0627\u0644\u0645\u0627\u0644\u064a' : 'Count Note / Variance Reason' })
                                : t('billing.shiftNotesPlaceholder', { defaultValue: isAr ? '\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0625\u0636\u0627\u0641\u064a\u0629 \u0639\u0646 \u0627\u0644\u0648\u0631\u062f\u064a\u0629...' : 'Optional notes...' })}
                            className={`w-full rounded-xl border p-3 text-xs text-slate-900 outline-none focus:bg-white dark:bg-slate-950 dark:text-white ${shiftAction === 'close' && countedCash !== '' && Math.abs(Number(countedCash) - (Number(currentShift?.opening_balance || 0) + Number(currentShift?.payment_totals?.Cash || 0))) > 0.01 && (!shiftNotes || shiftNotes.trim().length < 3) ? 'border-amber-500 bg-amber-50/40 focus:border-amber-600' : 'border-slate-200 bg-slate-50 focus:border-teal-500 dark:border-slate-700'}`}
                        />
                    </div>
                </form>
            </Modal>

            <PaymentCollectionModal
                {...paymentFlow.paymentModalProps}
                canDiscount={permissions.canDiscount}
            />

            {/* Shift Variance Review Modal */}
            <Modal
                isOpen={Boolean(reviewTarget)}
                onClose={() => !isReviewing && setReviewTarget(null)}
                title={
                    <span className="flex items-center gap-2">
                        <ShieldCheck size={18} className="text-amber-600" />
                        <span>{isAr ? 'اعتماد ومراجعة إغلاق الوردية' : 'Approve & Reconcile Shift Variance'}</span>
                    </span>
                }
                size="default"
                footer={
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            disabled={isReviewing}
                            onClick={() => setReviewTarget(null)}
                            className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                        >
                            {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmReview}
                            disabled={isReviewing}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                            {isReviewing ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            <span>{isReviewing ? (isAr ? 'جاري الاعتماد...' : 'Approving...') : (isAr ? 'اعتماد الإغلاق' : 'Approve Closure')}</span>
                        </button>
                    </div>
                }
            >
                {reviewTarget && (
                    <div className="space-y-4 text-xs">
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                            <div className="grid grid-cols-2 gap-3 text-start">
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Date</p>
                                    <p className="font-bold text-slate-900 dark:text-white">
                                        {new Date(reviewTarget.business_date || reviewTarget.opened_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Variance Amount</p>
                                    <p className="font-mono text-sm font-black text-amber-700 dark:text-amber-300">
                                        {Number(reviewTarget.variance || 0).toFixed(2)} EGP
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Expected Cash</p>
                                    <p className="font-mono font-bold text-slate-700 dark:text-slate-300">
                                        {Number(reviewTarget.expected_cash || 0).toFixed(2)} EGP
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Counted Cash</p>
                                    <p className="font-mono font-bold text-slate-700 dark:text-slate-300">
                                        {Number(reviewTarget.counted_cash || 0).toFixed(2)} EGP
                                    </p>
                                </div>
                            </div>
                            {reviewTarget.variance_reason && (
                                <div className="mt-3 border-t border-amber-200/60 pt-2.5 dark:border-amber-900/40">
                                    <p className="text-[10px] font-black uppercase text-slate-400">Cashier Reason</p>
                                    <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                                        {reviewTarget.variance_reason}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                                {isAr ? 'ملاحظات المشرف المالي (اختياري)' : 'Manager Review Notes'}
                            </label>
                            <textarea
                                rows={3}
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder={isAr ? 'سبب الموافقة أو تسوية الفارق...' : 'e.g. Discrepancy investigated and accepted'}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default CashierWorkspace;
