import React, { useCallback, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Calculator,
    CheckCircle2,
    Download,
    Eye,
    EyeOff,
    Lock,
    RefreshCw,
    ShieldCheck,
    WalletCards,
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

    const expectedCash = useMemo(() => {
        if (currentShift) {
            return roundFinancialAmount(
                toFinancialNumber(currentShift.opening_balance)
                + toFinancialNumber(currentShift.payment_totals?.Cash)
            );
        }
        return toFinancialNumber(reconciliationData?.expected);
    }, [currentShift, reconciliationData?.expected]);

    const counted = useMemo(() => toFinancialNumber(countedCash), [countedCash]);
    const variance = useMemo(() => roundFinancialAmount(counted - expectedCash), [counted, expectedCash]);
    const isWithinTolerance = Math.abs(variance) < 0.01;
    const hasVariance = !isWithinTolerance;
    const isBlindCountActive = !showReview && !(isSupervisor && supervisorRevealed);

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
    }, [counted, currentShift?.shift_id, expectedCash, onExport, user, variance]);

    if (!currentShift) {
        return (
            <section className="overflow-hidden rounded-[22px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_18px_50px_-36px_rgba(15,23,42,.42)]">
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]">
                        <Calculator size={23} />
                    </span>
                    <h3 className="mt-3 text-sm font-black text-[var(--VIARA-ink)]">{t('reconciliation.noActiveShift', 'لا توجد وردية خزينة مفتوحة')}</h3>
                    <p className="mt-1 max-w-md text-xs font-medium text-[var(--VIARA-muted)]">{t('reconciliation.openShiftFirst', { defaultValue: 'افتح وردية الخزينة أولاً لبدء الجرد والمطابقة.' })}</p>
                </div>
            </section>
        );
    }

    return (
        <section className="overflow-hidden rounded-[22px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_18px_50px_-36px_rgba(15,23,42,.42)]" aria-label={t('reconciliation.title', { defaultValue: 'Cash Drawer Reconciliation' })}>
            <header className="flex flex-col gap-3 border-b border-[var(--VIARA-line)] bg-gradient-to-br from-cyan-500/[0.06] via-[var(--VIARA-surface)] to-teal-500/[0.03] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm shadow-cyan-600/20">
                        <Calculator size={18} />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-[var(--VIARA-ink)]">{t('reconciliation.title', 'جرد ومطابقة درج الخزينة')}</h3>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{t('reconciliation.activeShift', 'وردية نشطة')}</span>
                        </div>
                        <p className="mt-0.5 text-[10.5px] font-medium text-[var(--VIARA-muted)]">{t('reconciliation.blindCountTitle', 'الجرد الأعمى يحمي دقة العد قبل كشف الرصيد الدفتري.')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onExport && <button type="button" onClick={handleExport} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] px-3 text-[10.5px] font-black text-[var(--VIARA-muted)] transition hover:text-teal-700"><Download size={12} />{t('reconciliation.exportShort', 'تصدير')}</button>}
                    {onRefresh && <button type="button" onClick={onRefresh} disabled={isLoading} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--VIARA-line)] text-[var(--VIARA-muted)] transition hover:text-teal-700"><RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /></button>}
                </div>
            </header>

            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] sm:p-5">
                <div className="space-y-3">
                    <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[var(--VIARA-line)]">
                        <div className="border-e border-[var(--VIARA-line)] p-3 text-center">
                            <p className="text-[9.5px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('reconciliation.expected', 'المتوقع')}</p>
                            {isBlindCountActive ? <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-bold text-[var(--VIARA-muted)]"><Lock size={11} />{t('reconciliation.confidentialAmount', 'محمي')}</div> : <p className="mt-1 font-mono text-base font-black text-[var(--VIARA-ink)]">{roundFinancialAmount(expectedCash).toFixed(2)}</p>}
                        </div>
                        <div className="border-e border-[var(--VIARA-line)] p-3 text-center">
                            <p className="text-[9.5px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('reconciliation.collected', 'المتحصل')}</p>
                            {isBlindCountActive ? <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-bold text-[var(--VIARA-muted)]"><Lock size={11} />{t('reconciliation.confidentialAmount', 'محمي')}</div> : <p className="mt-1 font-mono text-base font-black text-emerald-700 dark:text-emerald-300">{roundFinancialAmount(Number(currentShift.collected_amount || 0)).toFixed(2)}</p>}
                        </div>
                        <div className="p-3 text-center">
                            <p className="text-[9.5px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('reconciliation.transactions', 'العمليات')}</p>
                            <p className="mt-1 font-mono text-base font-black text-[var(--VIARA-ink)]">{currentShift.transaction_count || currentShift.payment_count || 0}</p>
                        </div>
                    </div>

                    {!showReview ? (
                        <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/45 p-4">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs font-black text-[var(--VIARA-ink)]">{t('reconciliation.countedCash', { defaultValue: 'النقدية الفعلية الموجودة بالدرج' })}</label>
                                {isSupervisor && <button type="button" onClick={() => setSupervisorRevealed((v) => !v)} className="inline-flex items-center gap-1 text-[10px] font-black text-cyan-700 dark:text-cyan-300">{supervisorRevealed ? <EyeOff size={11} /> : <Eye size={11} />}{supervisorRevealed ? t('reconciliation.hideSupervisor', 'إخفاء المتوقع') : t('reconciliation.revealSupervisor', 'كشف المتوقع')}</button>}
                            </div>
                            <div className="relative mt-2">
                                <WalletCards size={17} className="absolute start-3 top-1/2 -translate-y-1/2 text-teal-600" />
                                <input type="number" min="0" step="0.01" required value={countedCash} onChange={(e) => setCountedCash(e.target.value)} className="h-14 w-full rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] ps-10 pe-4 font-mono text-xl font-black text-[var(--VIARA-ink)] outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" dir="ltr" placeholder="0.00" autoFocus />
                            </div>
                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 text-[10.5px] font-medium text-slate-600 dark:border-cyan-900/50 dark:bg-cyan-950/20 dark:text-slate-300">
                                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-cyan-600" />
                                <span>{t('reconciliation.blindCountNotice', 'عدّ النقدية الفعلية أولاً. سيتم كشف الرصيد الدفتري والفارق في خطوة المراجعة التالية.')}</span>
                            </div>
                            <button type="button" onClick={() => setShowReview(true)} disabled={countedCash === '' || counted < 0 || isSubmitting} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 text-xs font-black text-white shadow-sm transition hover:bg-teal-500 disabled:opacity-50"><Calculator size={14} />{t('reconciliation.reviewAndVerify', { defaultValue: 'مراجعة ومطابقة الجرد' })}</button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className={`rounded-2xl border p-4 ${isWithinTolerance ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20' : 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20'}`}>
                                <div className="flex items-start gap-3">
                                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isWithinTolerance ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>{isWithinTolerance ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</span>
                                    <div className="min-w-0 flex-1"><h4 className={`text-sm font-black ${isWithinTolerance ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>{isWithinTolerance ? t('reconciliation.reconciled', 'الدرج متطابق') : t('reconciliation.varianceDetected', 'تم اكتشاف فرق')}</h4><p className="mt-1 text-[10.5px] font-medium text-[var(--VIARA-muted)]">{t('reconciliation.reconciliationSummary', { counted: roundFinancialAmount(counted).toFixed(2), expected: roundFinancialAmount(expectedCash).toFixed(2), variance: roundFinancialAmount(variance).toFixed(2), defaultValue: `Counted: ${roundFinancialAmount(counted).toFixed(2)} | Expected: ${roundFinancialAmount(expectedCash).toFixed(2)} | Variance: ${roundFinancialAmount(variance).toFixed(2)}` })}</p></div>
                                </div>
                            </div>
                            {hasVariance && <div className="rounded-2xl border border-[var(--VIARA-line)] p-3"><label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('reconciliation.varianceNotes', { defaultValue: 'ملاحظات ومبررات الفرق' })}</label><textarea rows="3" value={varianceNotes} onChange={(e) => setVarianceNotes(e.target.value)} className="w-full resize-none rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--VIARA-ink)] outline-none focus:border-teal-500" placeholder={t('reconciliation.varianceNotes', 'اذكر سبب الفرق إن كان معروفاً...')} /></div>}
                            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setShowReview(false)} className="h-10 rounded-xl border border-[var(--VIARA-line)] text-xs font-black text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]">{t('common.adjust', 'تعديل العد')}</button><button type="button" onClick={handleReconcile} disabled={isSubmitting} className="h-10 rounded-xl bg-emerald-600 text-xs font-black text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50">{isSubmitting ? t('reconciliation.processing', { defaultValue: 'جاري الحفظ...' }) : t('reconciliation.confirmReconciliation', { defaultValue: 'تأكيد المطابقة' })}</button></div>
                        </div>
                    )}
                </div>

                <aside className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/35 p-4">
                    <h4 className="flex items-center gap-2 text-xs font-black text-[var(--VIARA-ink)]"><ShieldCheck size={14} className="text-teal-600" />{t('reconciliation.reviewSummary', { defaultValue: 'ملخص الجرد' })}</h4>
                    <div className="mt-3 space-y-2 text-[11px]">
                        <div className="flex items-center justify-between rounded-xl bg-[var(--VIARA-surface)] px-3 py-2"><span className="text-[var(--VIARA-muted)]">{t('reconciliation.counted', { defaultValue: 'المعدود' })}</span><strong className="font-mono text-[var(--VIARA-ink)]">{countedCash === '' ? '—' : roundFinancialAmount(counted).toFixed(2)}</strong></div>
                        <div className="flex items-center justify-between rounded-xl bg-[var(--VIARA-surface)] px-3 py-2"><span className="text-[var(--VIARA-muted)]">{t('reconciliation.expected', 'المتوقع')}</span><strong className="font-mono text-[var(--VIARA-ink)]">{showReview || supervisorRevealed ? roundFinancialAmount(expectedCash).toFixed(2) : '••••'}</strong></div>
                        <div className="flex items-center justify-between rounded-xl bg-[var(--VIARA-surface)] px-3 py-2"><span className="text-[var(--VIARA-muted)]">{t('reconciliation.variance', { defaultValue: 'الفرق' })}</span><strong className={`font-mono ${showReview ? (hasVariance ? 'text-amber-700' : 'text-emerald-700') : 'text-[var(--VIARA-muted)]'}`}>{showReview ? `${variance > 0 ? '+' : ''}${roundFinancialAmount(variance).toFixed(2)}` : '—'}</strong></div>
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-[var(--VIARA-muted)]">{hasVariance && showReview ? t('reconciliation.supervisorVarianceApprovalRequired', 'وجود فرق نقدي قد يتطلب اعتماد ومراجعة المشرف المالي قبل إغلاق الوردية.') : t('reconciliation.blindCountNotice', 'لا يتم إظهار الرصيد المتوقع للكاشير قبل إنهاء العد الأولي.')}</p>
                </aside>
            </div>
        </section>
    );
};

export default CashDrawerReconciliation;
