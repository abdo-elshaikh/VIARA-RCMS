import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useReviewCashierClosureMutation, useGetCashierReconciliationQuery } from '../store/api';
import BillingTab from '../components/reception/BillingTab';
import ShiftSupervisorPanel from '../components/reception/ShiftSupervisorPanel';
import CashDrawerReconciliation from '../components/reception/CashDrawerReconciliation';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { selectCurrentUser } from '../store/authSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useReceptionPermissions } from '../hooks/useReceptionPermissions';
import { useShiftFlow } from '../hooks/useShiftFlow';

const ar = {
    eyebrow: 'إدارة عمليات الدفع والتحصيل المالي',
    title: 'مساحة عمل أمين الصندوق (الخزينة)',
    description: 'تسجيل وتحصيل مدفوعات المرضى، معالجة المبالغ المستردة، ومطابقة وجرد درج الخزينة للوردية الحالية.',
    signedInAs: 'أمين الصندوق الحالي',
    shiftOpen: 'الوردية مفتوحة ونشطة',
    shiftClosedStatus: 'الوردية مغلقة حالياً',
    openShift: 'فتح وردية جديدة',
    closeShift: 'إغلاق الوردية وجرد الدرج',
    loadingShift: 'جاري تحميل بيانات الوردية...',
    shiftSummary: 'تم تحصيل {{amount}} ج.م عبر {{count}} عملية دفع منذ {{time}}',
    openShiftHelp: 'يُرجى فتح وردية جديدة وبدء تسجيل الرصيد الافتتاحي للدرج لتتمكن من استلام المدفوعات.',
    openingBalance: 'الرصيد الافتتاحي بالدرج (Opening Balance)',
    countedCash: 'المبلغ الفعلي المعدود بالدرج (Physical Counted Cash)',
    shiftNotes: 'ملاحظات الوردية',
    varianceReason: 'ملاحظات الجرد / سبب الفارق المالي (إن وجد)',
    blindCountHelp: 'يُرجى جرد النقدية الفعلية داخل الدرج وكتابة المبلغ بدقة. المبلغ المتوقع بالنظام يبقى مخفياً لضمان دقة الجرد.',
    tabs: {
        billing: 'الفواتير والتحصيل المالي',
        reconciliation: 'مطابقة وجرد الخزينة',
        supervisor: 'لوحة المشرف المالي'
    },
    metrics: {
        status: 'حالة الوردية',
        collected: 'المتحصلات النقدية',
        count: 'عدد العمليات',
        opening: 'الرصيد الافتتاحي'
    }
};

const tr = (t, key, defaultEn, defaultAr, isAr) => t(key, { defaultValue: isAr ? defaultAr : defaultEn });

const CashierWorkspace = () => {
    const { t, i18n } = useTranslation(['reception', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const user = useSelector(selectCurrentUser);
    const [searchParams, setSearchParams] = useSearchParams();

    const [activeTab, setActiveTab] = useState(() => {
        const requested = searchParams.get('tab');
        return ['billing', 'reconciliation', 'supervisor'].includes(requested) ? requested : 'billing';
    });
    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewNotes, setReviewNotes] = useState('');

    // Permissions
    const {
        canProcessPayments,
        canReconcileShifts,
        canOpenCashierShift: canOpenShift,
        canCloseCashierShift: canCloseShift,
        canReviewShiftVariance,
    } = useReceptionPermissions();

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
        setActiveTab(tab);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', tab);
        setSearchParams(nextParams, { replace: true });
    }, [searchParams, setSearchParams]);
    useEffect(() => {
        const unauthorized = (activeTab === 'reconciliation' && !canCloseShift)
            || (activeTab === 'supervisor' && !canReviewShiftVariance);
        if (unauthorized) handleTabChange('billing');
    }, [activeTab, canCloseShift, canReviewShiftVariance, handleTabChange]);

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
                                    <span>{tr(t, 'cashier.commandCenter', 'Payment & Cash Operations', ar.eyebrow, isAr)}</span>
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
                                    <span>{currentShift ? ar.shiftOpen : ar.shiftClosedStatus}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {tr(t, 'cashier.workspaceTitle', 'Cashier & Treasury Workspace', ar.title, isAr)}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {ar.signedInAs}: {user?.name || user?.fullName || 'Cashier'} · {tr(t, 'cashier.workspaceDescription', 'Collect patient fees and reconcile active shifts.', ar.description, isAr)}
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
                            <span>{currentShift ? ar.closeShift : ar.openShift}</span>
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
                            {ar.metrics.status}
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
                        {currentShift ? ar.shiftOpen : ar.shiftClosedStatus}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {currentShift ? (currentShift.opened_at ? new Date(currentShift.opened_at).toLocaleTimeString() : 'Active') : 'Closed'}
                    </p>
                </div>

                {/* 2. Collected Amount */}
                <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {ar.metrics.collected}
                        </p>
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300">
                            <Banknote size={16} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                        {Number(currentShift?.collected_amount || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">EGP</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {isAr ? 'صافي المقبوضات بكل وسائل الدفع' : 'Net receipts across all payment methods'}
                    </p>
                </div>

                {/* 3. Payments Count */}
                <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {ar.metrics.count}
                        </p>
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                            <Receipt size={16} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                        {currentShift?.payment_count || 0}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {isAr ? 'عمليات الدفع المسجلة' : 'Completed transactions'}
                    </p>
                </div>

                {/* 4. Opening Balance */}
                <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {ar.metrics.opening}
                        </p>
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <Wallet size={16} />
                        </span>
                    </div>
                    <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                        {Number(currentShift?.opening_balance || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">EGP</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {isAr ? 'العهدة النقدية بالدرج' : 'Initial drawer float'}
                    </p>
                </div>
            </section>

            {/* Workspace Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-3xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <button
                    type="button"
                    onClick={() => handleTabChange('billing')}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black transition-all ${
                        activeTab === 'billing'
                            ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Receipt size={15} />
                    <span>{ar.tabs.billing}</span>
                </button>

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
                    <span>{ar.tabs.reconciliation}</span>
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
                    <span>{ar.tabs.supervisor}</span>
                </button>}
            </div>

            {/* Tab Contents */}
            {activeTab === 'billing' && <BillingTab />}

            {activeTab === 'reconciliation' && (
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

            {activeTab === 'supervisor' && (
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
                        <span>{shiftAction === 'open' ? ar.openShift : ar.closeShift}</span>
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
                                {ar.openingBalance}
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
                                {ar.blindCountHelp}
                            </div>
                            <div>
                                <label className="mb-1.5 block font-bold text-slate-700 dark:text-slate-300">
                                    {ar.countedCash}
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
                            {shiftAction === 'close' ? ar.varianceReason : ar.shiftNotes}
                        </label>
                        <textarea
                            rows={3}
                            value={shiftNotes}
                            onChange={(e) => setShiftNotes(e.target.value)}
                            placeholder={isAr ? 'ملاحظات إضافية عن الوردية...' : 'Optional notes...'}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </div>
                </form>
            </Modal>

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
