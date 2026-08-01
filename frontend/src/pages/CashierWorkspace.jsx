import React, { useMemo, useState } from 'react';
import { CircleDollarSign, LockKeyhole, WalletCards } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import BillingTab from '../components/reception/BillingTab';
import ShiftSupervisorPanel from '../components/reception/ShiftSupervisorPanel';
import CashDrawerReconciliation from '../components/reception/CashDrawerReconciliation';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { selectCurrentUser } from '../store/authSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useReceptionPermissions } from '../hooks/useReceptionPermissions';
import { useShiftFlow } from '../hooks/useShiftFlow';

/**
 * CashierWorkspace — dedicated view for users with the Cashier role.
 *
 * Uses useReceptionPermissions for the permission model and
 * useShiftFlow for current-shift state + API mutations.
 * Keeps its own inline form state (openingBalance / countedCash / reason)
 * because the inline Modal UI differs from the ShiftActionModal used elsewhere.
 */
const CashierWorkspace = () => {
    const { t } = useTranslation('reception');
    const user = useSelector(selectCurrentUser);

    // Permissions
    const {
        canProcessPayments,
        canOpenCashierShift: canOpenShift,
        canCloseCashierShift: canCloseShift,
    } = useReceptionPermissions();

    // Shift state + mutations (shared hook — single source of truth for currentShift)
    const {
        currentShift,
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
    } = useShiftFlow({ skip: !canProcessPayments });

    const canChangeShift = currentShift ? canCloseShift : canOpenShift;

    // Gate permission before submitting
    const onSubmit = async (e) => {
        e.preventDefault();
        if ((shiftAction === 'open' && !canOpenShift) || (shiftAction === 'close' && !canCloseShift)) {
            toast.error(t('billing.shiftPermissionRequired'));
            return;
        }
        await handleShiftAction(e);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0b1426] p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-6">

                <PageHeader
                    icon={CircleDollarSign}
                    eyebrow={t('cashier.commandCenter', 'Payment operations')}
                    title={t('cashier.workspaceTitle', 'Cashier workspace')}
                    description={t('cashier.workspaceDescription', 'Collect patient payments, process approved refunds, and reconcile your assigned drawer.')}
                    actions={(
                        <div className={`rounded-2xl border px-5 py-4 ${
                            currentShift
                                ? 'border-emerald-400/30 bg-emerald-400/10'
                                : 'border-amber-400/30 bg-amber-400/10'
                        }`}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                {t('cashier.signedInAs', 'Signed in as')}
                            </p>
                            <p className="mt-1 font-bold">
                                {user?.name || user?.fullName || t('cashier.cashier', 'Cashier')}
                            </p>
                        </div>
                    )}
                />

                {/* Shift Status Banner */}
                <section className={`rounded-2xl border p-5 shadow-sm ${
                    currentShift
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20'
                        : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20'
                }`}>
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div className="flex items-start gap-3">
                            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                                currentShift
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                            }`}>
                                {currentShift ? <WalletCards size={20} /> : <LockKeyhole size={20} />}
                            </span>
                            <div>
                                <h2 className="font-black text-slate-900 dark:text-white">
                                    {currentShift ? t('billing.shiftOpen') : t('billing.shiftClosedStatus')}
                                </h2>
                                <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                                    {isLoadingShift
                                        ? t('billing.loadingShift')
                                        : currentShift
                                            ? t('billing.shiftSummary', {
                                                count: currentShift.payment_count || 0,
                                                amount: Number(currentShift.collected_amount || 0).toFixed(2),
                                                time: new Date(currentShift.opened_at).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                }),
                                            })
                                            : t('billing.openShiftHelp')}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={isLoadingShift || !canChangeShift}
                            title={!canChangeShift ? t('billing.shiftPermissionRequired') : undefined}
                            onClick={() => openShiftDialog(currentShift ? 'close' : 'open')}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <CircleDollarSign size={17} />
                            {currentShift ? t('billing.closeShift') : t('billing.openShift')}
                        </button>
                    </div>
                </section>

                <BillingTab />

                {/* Shift Supervisor Panel — for admins */}
                <ShiftSupervisorPanel
                    currentShift={currentShift}
                    onOpenShift={() => openShiftDialog('open')}
                    onCloseShift={() => openShiftDialog('close')}
                    onViewAuditLog={() => toast.info(t('cashier.auditLogComingSoon', 'Audit log integration coming soon'))}
                    t={t}
                />

                {/* Cash Drawer Reconciliation */}
                <CashDrawerReconciliation
                    currentShift={currentShift}
                    onReconcile={(data) => {
                        toast.success(t('cashier.reconciled', 'Drawer reconciled successfully'));
                    }}
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
            </div>

            {/* Shift Modal */}
            <Modal
                isOpen={Boolean(shiftAction)}
                onClose={() => !isBusy && closeShiftDialog()}
                title={shiftAction === 'open' ? t('billing.openShift') : t('billing.closeShift')}
            >
                <form onSubmit={onSubmit} className="space-y-5">
                    {shiftAction === 'open' ? (
                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                                {t('billing.openingBalance')}
                            </label>
                            <input
                                type="number" min="0" step="0.01" required
                                value={openingBalance}
                                onChange={(e) => setOpeningBalance(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800 dark:bg-[#0b1426] dark:text-white"
                                dir="ltr"
                            />
                        </div>
                    ) : (
                        <>
                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-medium text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300">
                                {t('billing.blindCountHelp', 'Count the physical cash before submitting. The expected amount remains hidden until the drawer is closed.')}
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                                    {t('billing.countedCash')}
                                </label>
                                <input
                                    type="number" min="0" step="0.01" required
                                    value={countedCash}
                                    onChange={(e) => setCountedCash(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800 dark:bg-[#0b1426] dark:text-white"
                                    dir="ltr"
                                />
                            </div>
                        </>
                    )}
                    <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                            {shiftAction === 'close'
                                ? t('billing.varianceReason', 'Count note / variance reason')
                                : t('billing.shiftNotes')}
                        </label>
                        <textarea
                            rows="3"
                            minLength={shiftAction === 'close' ? 3 : undefined}
                            required={shiftAction === 'close'}
                            value={shiftNotes}
                            onChange={(e) => setShiftNotes(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800 dark:bg-[#0b1426] dark:text-white"
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={closeShiftDialog}
                            className="flex-1 rounded-xl border border-slate-200 py-3 font-bold text-slate-700 dark:border-slate-800 dark:text-slate-300"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isBusy || (shiftAction === 'close' && (!countedCash || shiftNotes.trim().length < 3))}
                            className="flex-1 rounded-xl bg-slate-900 py-3 font-bold text-white disabled:opacity-50 dark:bg-teal-700"
                        >
                            {isBusy ? t('billing.processing') : t('confirm')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default CashierWorkspace;
