import React, { useState, useCallback, useMemo } from 'react';
import {
    Calculator,
    AlertTriangle,
    CheckCircle2,
    Download,
    RefreshCw,
    Lock,
    Eye,
    EyeOff,
    ShieldCheck,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import { buildPermissionModel } from './receptionLogic';
import { roundFinancialAmount, toFinancialNumber } from '../../utils/financialFormat';

const CashDrawerReconciliation = ({
    currentShift,
    reconciliationData,
    onReconcile,
    onExport,
    onRefresh,
    isLoading,
    isSubmitting = false,
    t,
}) => {
    const user = useSelector(selectCurrentUser);
    const [countedCash, setCountedCash] = useState('');
    const [varianceNotes, setVarianceNotes] = useState('');
    const [showReview, setShowReview] = useState(false);
    const [supervisorRevealed, setSupervisorRevealed] = useState(false);

    const permModel = useMemo(() => buildPermissionModel(user), [user]);
    const isSupervisor = Boolean(
        user?.role === 'Developer' ||
        user?.role === 'Admin' ||
        user?.role === 'Financial Manager' ||
        permModel.canReviewShiftVariance ||
        permModel.canReconcileShifts
    );

    const isBlindCountActive = !showReview && !(isSupervisor && supervisorRevealed);

    const expectedCash = useMemo(() => {
        if (!currentShift && !reconciliationData?.expected) return 0;
        return toFinancialNumber(currentShift?.expected_cash || reconciliationData?.expected || 0);
    }, [currentShift, reconciliationData?.expected]);

    const counted = useMemo(() => toFinancialNumber(countedCash), [countedCash]);
    const variance = useMemo(() => roundFinancialAmount(counted - expectedCash), [counted, expectedCash]);
    const isWithinTolerance = useMemo(() => Math.abs(variance) < 0.01, [variance]);
    const hasVariance = useMemo(() => !isWithinTolerance, [isWithinTolerance]);

    const handleReconcile = useCallback(async () => {
        if (countedCash === '' || counted < 0 || isSubmitting) return;
        const persisted = await onReconcile({
            countedCash: counted,
            expectedCash,
            variance,
            notes: varianceNotes.trim() || undefined,
        });
        if (persisted !== false) {
            setShowReview(false);
            setCountedCash('');
            setVarianceNotes('');
            setSupervisorRevealed(false);
        }
    }, [counted, countedCash, expectedCash, isSubmitting, onReconcile, variance, varianceNotes]);

    const handleExport = useCallback(() => {
        onExport?.({
            shiftId: currentShift?.shift_id,
            expectedCash,
            countedCash: counted,
            variance,
            timestamp: new Date().toISOString(),
            cashierName: user?.name || user?.fullName,
        });
    }, [currentShift?.shift_id, expectedCash, counted, variance, user, onExport]);

    return (
        <section className="rounded-none border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label={t('reconciliation.title', { defaultValue: 'Cash Drawer Reconciliation' })}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-none bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:ring-cyan-800">
                        <Calculator size={18} />
                    </span>
                    <div>
                        <h3 className="text-sm font-black text-slate-950 dark:text-white">
                            {t('reconciliation.title', 'Cash Drawer Reconciliation')}
                        </h3>
                        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            {currentShift ? t('reconciliation.activeShift', 'Active session') : t('reconciliation.noActiveShift', 'No active shift')}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {onExport && (
                        <button type="button" onClick={handleExport} className="inline-flex min-h-11 items-center gap-1.5 rounded-none border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" title={t('reconciliation.export', 'Export report')}>
                            <Download size={12} />
                            {t('reconciliation.exportShort', 'Export')}
                        </button>
                    )}
                    {onRefresh && (
                        <button type="button" onClick={onRefresh} disabled={isLoading} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-none border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" title={t('reconciliation.refresh', 'Refresh')}>
                            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                    )}
                </div>
            </div>

            {currentShift && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-none bg-slate-50 p-3 text-center dark:bg-slate-950/40">
                            <p className="text-[10px] font-black uppercase text-slate-400">{t('reconciliation.expected', 'Expected')}</p>
                            {isBlindCountActive ? (
                                <div className="mt-1 flex items-center justify-center gap-1 text-slate-400 dark:text-slate-500">
                                    <Lock size={13} />
                                    <span className="text-[11px] font-bold">{t('reconciliation.confidentialAmount', 'محمي (جرد أعمى)')}</span>
                                </div>
                            ) : (
                                <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{roundFinancialAmount(expectedCash).toFixed(2)}</p>
                            )}
                            {isSupervisor && !showReview && (
                                <button
                                    type="button"
                                    onClick={() => setSupervisorRevealed(!supervisorRevealed)}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-700 dark:text-cyan-400 hover:underline"
                                >
                                    {supervisorRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
                                    {supervisorRevealed ? t('reconciliation.hideSupervisor', 'إخفاء المتوقع') : t('reconciliation.revealSupervisor', 'كشف المتوقع (مشرف)')}
                                </button>
                            )}
                        </div>
                        <div className="rounded-none bg-slate-50 p-3 text-center dark:bg-slate-950/40">
                            <p className="text-[10px] font-black uppercase text-slate-400">{t('reconciliation.collected', 'Collected')}</p>
                            {isBlindCountActive ? (
                                <div className="mt-1 flex items-center justify-center gap-1 text-slate-400 dark:text-slate-500">
                                    <Lock size={13} />
                                    <span className="text-[11px] font-bold">{t('reconciliation.confidentialAmount', 'محمي (جرد أعمى)')}</span>
                                </div>
                            ) : (
                                <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{roundFinancialAmount(Number(currentShift.collected_amount || 0)).toFixed(2)}</p>
                            )}
                        </div>
                        <div className="rounded-none bg-slate-50 p-3 text-center dark:bg-slate-950/40">
                            <p className="text-[10px] font-black uppercase text-slate-400">{t('reconciliation.transactions', 'Txns')}</p>
                            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{currentShift.transaction_count || 0}</p>
                        </div>
                    </div>

                    {!showReview ? (
                        <div className="rounded-none border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950">
                            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                                {t('reconciliation.countedCash', { defaultValue: 'Counted Cash Amount' })}
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                value={countedCash}
                                onChange={(e) => setCountedCash(e.target.value)}
                                className="w-full rounded-none border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                dir="ltr"
                                placeholder="0.00"
                            />

                            {isSupervisor && supervisorRevealed ? (
                                <div className="mt-4 flex items-center justify-between rounded-none bg-white/60 p-3 dark:bg-slate-900/40">
                                    <div className="flex items-center gap-2">
                                        {hasVariance ? (
                                            <AlertTriangle size={16} className="text-amber-500" />
                                        ) : (
                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                        )}
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                            {t('reconciliation.variance', { defaultValue: 'Variance' })}
                                        </span>
                                    </div>
                                    <span className={`text-sm font-black ${hasVariance ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                                        {variance > 0 ? '+' : ''}{roundFinancialAmount(variance).toFixed(2)}
                                    </span>
                                </div>
                            ) : (
                                <div className="mt-4 flex items-start gap-2.5 rounded-none border border-cyan-200 bg-cyan-50/60 p-3 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200">
                                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
                                    <div className="text-[11px] leading-relaxed">
                                        <span className="font-bold block mb-0.5">{t('reconciliation.blindCountTitle', 'جرد أعمى (محمي)')}</span>
                                        <p className="text-slate-600 dark:text-slate-300">
                                            {t('reconciliation.blindCountNotice', 'نظام الجرد الأعمى نشط: يرجى إحصاء النقدية الفعلية بالدرج بدقة وإدخالها. سيتم تدقيق الرصيد الدفتري واحتساب الفارق في خطوة المراجعة التالية.')}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={() => setShowReview(true)}
                                disabled={countedCash === '' || counted < 0 || isSubmitting}
                                className="mt-4 w-full rounded-none bg-gradient-to-b from-cyan-600 to-cyan-700 py-2.5 text-xs font-black text-white shadow-sm transition hover:from-cyan-700 hover:to-cyan-800 disabled:opacity-50"
                            >
                                {t('reconciliation.reviewAndVerify', { defaultValue: 'مراجعة وتدقيق الجرد' })}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className={`rounded-none border p-4 ${isWithinTolerance ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/10' : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10'}`}>
                                <div className="flex items-center gap-2">
                                    {isWithinTolerance ? (
                                        <CheckCircle2 size={20} className="text-emerald-500" />
                                    ) : (
                                        <AlertTriangle size={20} className="text-amber-500" />
                                    )}
                                    <span className={`text-sm font-black ${isWithinTolerance ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                                        {isWithinTolerance ? t('reconciliation.reconciled', 'Drawer is balanced') : t('reconciliation.varianceDetected', 'Variance detected')}
                                    </span>
                                </div>
                                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                                    {t('reconciliation.reconciliationSummary', {
                                        counted: roundFinancialAmount(counted).toFixed(2),
                                        expected: roundFinancialAmount(expectedCash).toFixed(2),
                                        variance: roundFinancialAmount(variance).toFixed(2),
                                        defaultValue: `Counted: ${roundFinancialAmount(counted).toFixed(2)} | Expected: ${roundFinancialAmount(expectedCash).toFixed(2)} | Variance: ${roundFinancialAmount(variance).toFixed(2)}`,
                                    })}
                                </p>
                                {hasVariance && (
                                    <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                        {t('reconciliation.supervisorVarianceApprovalRequired', 'تنبيه: يوجد فارق نقدي، وسيتطلب إقفال الوردية اعتماد ومراجعة المشرف المالي.')}
                                    </p>
                                )}
                            </div>

                            {hasVariance && (
                                <div className="rounded-none border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950">
                                    <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                                        {t('reconciliation.varianceNotes', { defaultValue: 'ملاحظات ومبررات الفرق' })}
                                    </label>
                                    <textarea
                                        rows="2"
                                        value={varianceNotes}
                                        onChange={(e) => setVarianceNotes(e.target.value)}
                                        placeholder={t('reconciliation.varianceNotes', 'ملاحظات ومبررات الفرق')}
                                        className="w-full rounded-none border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                                    />
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowReview(false)} className="flex-1 rounded-none border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                    {t('common.adjust', 'تعديل العد')}
                                </button>
                                <button type="button" onClick={handleReconcile} disabled={isSubmitting} className="flex-1 rounded-none bg-gradient-to-b from-emerald-600 to-emerald-700 py-2.5 text-xs font-black text-white shadow-sm transition hover:from-emerald-700 hover:to-emerald-800 disabled:cursor-wait disabled:opacity-60">
                                    {isSubmitting ? t('reconciliation.processing', { defaultValue: 'Saving...' }) : t('reconciliation.confirmReconciliation', { defaultValue: 'Confirm Reconciliation' })}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!currentShift && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Calculator size={32} className="mb-3 text-slate-300" />
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {t('reconciliation.noActiveShift', 'No active shift to reconcile')}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        {t('reconciliation.openShiftFirst', { defaultValue: 'Open a cashier shift to begin reconciliation' })}
                    </p>
                </div>
            )}
        </section>
    );
};

export default CashDrawerReconciliation;
