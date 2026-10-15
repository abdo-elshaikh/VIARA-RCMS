import React, { useState, useMemo, useEffect } from 'react';
import {
    DoorClosed,
    CheckCircle2,
    AlertTriangle,
    Banknote,
    FileText,
    ArrowRight,
    ArrowLeft,
    Clock,
    UserCheck,
    LogOut,
    Check,
    Loader2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import {
    useCloseReceptionShiftMutation,
    useCloseCashierShiftMutation,
    useCreateShiftHandoverMutation,
    useClockOutMutation
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';

const UnifiedShiftCloseWizardModal = ({
    isOpen,
    onClose,
    currentReceptionShift,
    currentCashierShift,
    activeTasksCount = 0,
    onSuccess,
    isRtl = true
}) => {
    const { t } = useTranslation(['reception', 'billing', 'common']);
    const isAr = isRtl;

    // Mutations
    const [closeReceptionShift, { isLoading: isClosingReception }] = useCloseReceptionShiftMutation();
    const [closeCashierShift, { isLoading: isClosingCashier }] = useCloseCashierShiftMutation();
    const [createShiftHandover, { isLoading: isCreatingHandover }] = useCreateShiftHandoverMutation();
    const [clockOut, { isLoading: isClockingOut }] = useClockOutMutation();

    // Form state
    const [step, setStep] = useState(1);
    const [countedCash, setCountedCash] = useState('');
    const [cashierNotes, setCashierNotes] = useState('');
    const [handoverNotes, setHandoverNotes] = useState('');
    const [closingNotes, setClosingNotes] = useState('');
    const [alsoClockOut, setAlsoClockOut] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Closing the cashier and reception shifts uses separate server transactions.
    // Remember committed steps so a retry can resume safely if the later step fails.
    const [cashierClosedForSession, setCashierClosedForSession] = useState(false);
    const [handoverCreatedForSession, setHandoverCreatedForSession] = useState(false);
    const [partialCloseNotice, setPartialCloseNotice] = useState('');

    useEffect(() => {
        setStep(1);
        setCountedCash('');
        setCashierNotes('');
        setHandoverNotes('');
        setClosingNotes('');
        setAlsoClockOut(false);
        setCashierClosedForSession(false);
        setHandoverCreatedForSession(false);
        setPartialCloseNotice('');
    }, [currentReceptionShift?.session_id]);

    // Derived states
    const hasCashierShift = Boolean(!cashierClosedForSession && currentCashierShift && ['Open', 'Active'].includes(currentCashierShift.status));
    const totalSteps = hasCashierShift ? 3 : 2;

    const expectedCash = useMemo(() => {
        if (!currentCashierShift) return 0;
        const openBal = Number(currentCashierShift.opening_balance || 0);
        const cashTotal = Number(currentCashierShift.payment_totals?.Cash || 0);
        return openBal + cashTotal;
    }, [currentCashierShift]);

    const parsedCountedCash = countedCash.trim() === '' ? null : Number(countedCash);
    const hasValidCountedCash = parsedCountedCash !== null
        && Number.isFinite(parsedCountedCash)
        && parsedCountedCash >= 0;

    const cashDiff = useMemo(() => {
        if (!hasValidCountedCash) return 0;
        return parsedCountedCash - expectedCash;
    }, [hasValidCountedCash, parsedCountedCash, expectedCash]);

    const handleNext = () => {
        if (step === 1 && hasCashierShift) {
            if (!hasValidCountedCash) {
                toast.error(t('shiftClose.cashAmountRequired'));
                return;
            }
            if (Math.abs(cashDiff) > 0.01 && cashierNotes.trim().length < 3) {
                toast.error(t('shiftClose.varianceRequired'));
                return;
            }
        }
        setStep((s) => Math.min(s + 1, totalSteps));
    };

    const handleBack = () => {
        setStep((s) => Math.max(s - 1, 1));
    };

    const handleExecuteClose = async () => {
        if (!currentReceptionShift?.session_id) return;
        if (activeTasksCount > 0) {
            toast.error(t('shiftClose.activeTasksBlocked', { count: activeTasksCount }));
            return;
        }
        if (hasCashierShift && !hasValidCountedCash) {
            setStep(1);
            toast.error(t('shiftClose.cashAmountRequired'));
            return;
        }
        setIsSubmitting(true);
        let cashierClosedThisAttempt = cashierClosedForSession;
        let handoverCreatedThisAttempt = handoverCreatedForSession;

        try {
            // 1. Close Cashier Shift if open
            if (hasCashierShift) {
                await closeCashierShift({
                    id: currentCashierShift.shift_id,
                    countedCash: parsedCountedCash,
                    varianceReason: cashierNotes.trim() || undefined,
                    notes: cashierNotes.trim() || undefined
                }).unwrap();
                cashierClosedThisAttempt = true;
                setCashierClosedForSession(true);
                setStep(2);
                toast.success(t('shiftClose.closedCashier'));
            }

            // 2. Create Handover if notes exist
            if (handoverNotes.trim() && !handoverCreatedThisAttempt) {
                await createShiftHandover({
                    sessionId: currentReceptionShift.session_id,
                    notes: handoverNotes.trim()
                }).unwrap();
                handoverCreatedThisAttempt = true;
                setHandoverCreatedForSession(true);
            }

            // 3. Close Reception Shift
            const closedShift = await closeReceptionShift({
                sessionId: currentReceptionShift.session_id,
                notes: closingNotes.trim() || undefined
            }).unwrap();

            toast.success(t('shiftClose.closedReception'));

            // 4. Optionally clock out HR attendance
            if (alsoClockOut) {
                try {
                    await clockOut({ notes: t('shiftClose.clockOutNote') }).unwrap();
                    toast.success(t('shiftClose.clockedOut'));
                } catch (hrErr) {
                    toast.error(getErrorMessage(hrErr, t('shiftClose.clockOutFailed')));
                }
            }

            onSuccess?.(closedShift);
            onClose();
        } catch (error) {
            if (cashierClosedThisAttempt) {
                setPartialCloseNotice(isAr
                    ? 'أُغلقت وردية الخزينة بالفعل. عالج سبب تعذر إغلاق الاستقبال ثم أعد المحاولة؛ ستُستكمل الخطوات المتبقية دون تكرار التسليم.'
                    : 'The cashier shift is already closed. Resolve the reception close issue and retry; completed steps will not be repeated.');
            }
            toast.error(getErrorMessage(error, t('shiftClose.closeFailed')));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => !isSubmitting && onClose()}
            title={t('shiftClose.title')}
            size="default"
        >
            <div className="space-y-6 py-1" dir={isRtl ? 'rtl' : 'ltr'}>
                {partialCloseNotice && (
                    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                        {partialCloseNotice}
                    </div>
                )}
                {activeTasksCount > 0 && (
                    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span>{t('shiftClose.activeTasksBlocked', { count: activeTasksCount })}</span>
                    </div>
                )}
                {/* Stepper Progress Bar */}
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                            step === 1 ? 'bg-teal-600 text-white' : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                        }`}>
                            1
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {hasCashierShift ? t('shiftClose.cashier') : t('shiftClose.handover')}
                        </span>
                    </div>

                    <div className="h-0.5 flex-1 bg-slate-200 mx-3 dark:bg-slate-800" />

                    <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                            step === 2 ? 'bg-teal-600 text-white' : step > 2 ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}>
                            2
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {hasCashierShift ? t('shiftClose.handover') : t('shiftClose.confirmation')}
                        </span>
                    </div>

                    {hasCashierShift && (
                        <>
                            <div className="h-0.5 flex-1 bg-slate-200 mx-3 dark:bg-slate-800" />
                            <div className="flex items-center gap-2">
                                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                    step === 3 ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                }`}>
                                    3
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {t('shiftClose.confirmation')}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {/* Step 1: Cashier reconciliation (if open) */}
                {step === 1 && hasCashierShift && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                            <div className="flex items-start gap-2.5">
                                <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <div>
                                    <p className="font-bold">{t('shiftClose.cashSettlement')}</p>
                                    <p className="mt-0.5 text-amber-800/90 dark:text-amber-300">
                                        {t('shiftClose.cashSettlementHint')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                {t('shiftClose.countedCash')}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                value={countedCash}
                                onChange={(e) => setCountedCash(e.target.value)}
                                placeholder="0.00"
                                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                dir="ltr"
                            />
                        </div>

                        {countedCash !== '' && Math.abs(cashDiff) > 0.01 && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                                <p className="font-bold">
                                    {isAr
                                        ? t('shiftClose.variance', { kind: cashDiff > 0 ? t('shiftClose.surplus') : t('shiftClose.shortage'), amount: Math.abs(cashDiff).toFixed(2) })
                                        : t('shiftClose.variance', { kind: '', amount: cashDiff.toFixed(2) })}
                                </p>
                                <label className="mt-2 block font-semibold">
                                    {t('shiftClose.varianceReason')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={cashierNotes}
                                    onChange={(e) => setCashierNotes(e.target.value)}
                                    placeholder={t('shiftClose.variancePlaceholder')}
                                    className="mt-1 w-full rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none dark:border-rose-800 dark:bg-slate-900 dark:text-slate-100"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Handover Notes Step */}
                {((step === 1 && !hasCashierShift) || (step === 2 && hasCashierShift)) && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                            <div className="flex items-start gap-2.5">
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                <div>
                                    <p className="font-bold">{t('shiftClose.handoverTitle')}</p>
                                    <p className="mt-0.5 text-blue-800/90 dark:text-blue-300">
                                        {t('shiftClose.handoverHint')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                {t('shiftClose.handoverLabel')}
                            </label>
                            <textarea
                                rows={4}
                                value={handoverNotes}
                                onChange={(e) => setHandoverNotes(e.target.value)}
                                placeholder={t('shiftClose.handoverPlaceholder')}
                                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                        </div>
                    </div>
                )}

                {/* Final Confirmation Step */}
                {((step === 2 && !hasCashierShift) || (step === 3 && hasCashierShift)) && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                                <div>
                                    <p className="font-bold text-sm">{t('shiftClose.readyTitle')}</p>
                                    <p className="mt-1 leading-relaxed text-emerald-800 dark:text-emerald-300">
                                        {t('shiftClose.readyHint')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                {t('shiftClose.closingNotes')}
                            </label>
                            <textarea
                                rows={2}
                                value={closingNotes}
                                onChange={(e) => setClosingNotes(e.target.value)}
                                placeholder={t('shiftClose.closingPlaceholder')}
                                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                        </div>

                        {/* Optional HR clock out checkbox */}
                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer hover:bg-slate-100 transition dark:border-slate-800 dark:bg-slate-900/60">
                            <input
                                type="checkbox"
                                checked={alsoClockOut}
                                onChange={(e) => setAlsoClockOut(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <div>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <LogOut size={13} className="text-teal-600" />
                                    {t('shiftClose.clockOut')}
                                </span>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    {t('shiftClose.clockOutHint')}
                                </span>
                            </div>
                        </label>
                    </div>
                )}

                {/* Footer Controls */}
                <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
                    {step > 1 ? (
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={handleBack}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            {isAr ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                            {t('shiftClose.back')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={onClose}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            {t('shiftClose.cancel')}
                        </button>
                    )}

                    {step < totalSteps ? (
                        <button
                            type="button"
                            onClick={handleNext}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-700 transition"
                        >
                            {t('shiftClose.next')}
                            {isAr ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={isSubmitting || activeTasksCount > 0}
                            onClick={handleExecuteClose}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:from-teal-700 hover:to-emerald-700 transition disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>{t('shiftClose.closing')}</span>
                                </>
                            ) : (
                                <>
                                    <Check size={14} />
                                    <span>{t('shiftClose.confirmClose')}</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default UnifiedShiftCloseWizardModal;
