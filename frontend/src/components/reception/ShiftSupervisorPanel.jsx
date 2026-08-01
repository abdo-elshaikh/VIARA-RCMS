import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ClipboardCheck,
    Clock3,
    LockKeyhole,
    ShieldCheck,
    UserCheck,
    WalletCards,
    FileText,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    TrendingUp,
    Loader2,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import { useReceptionPermissions } from '../../hooks/useReceptionPermissions';
import Modal from '../ui/Modal';
import StatusPill from '../ui/StatusPill';
import { formatDuration } from '../../utils/dateFormat';
import { roundFinancialAmount, toFinancialNumber } from '../../utils/financialFormat';

const SHIFT_STATUS_COLORS = {
    Open: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800',
    Closed: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    PendingReview: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800',
    Reconciled: 'bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:ring-cyan-800',
};

const ShiftSupervisorPanel = ({
    currentShift,
    onOpenShift,
    onCloseShift,
    onReviewClosure,
    onViewReceipts,
    onViewAuditLog,
    t,
}) => {
    const user = useSelector(selectCurrentUser);
    const permissions = useReceptionPermissions();
    const [reviewNotes, setReviewNotes] = useState('');
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [selectedClosure, setSelectedClosure] = useState(null);

    const handleReviewOpen = useCallback((closure) => {
        setSelectedClosure(closure);
        setReviewNotes('');
        setShowReviewModal(true);
    }, []);

    const handleReviewSubmit = useCallback(async () => {
        if (!selectedClosure || !reviewNotes.trim()) return;
        await onReviewClosure(selectedClosure, reviewNotes);
        setShowReviewModal(false);
        setSelectedClosure(null);
        setReviewNotes('');
    }, [onReviewClosure, selectedClosure, reviewNotes]);

    if (!currentShift && !permissions.canOpenCashierShift) {
        return null;
    }

    return (
        <section className="rounded-none border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label={t('shift.supervisorPanel', 'Shift Supervisor Panel')}>
            <div className="flex items-center gap-3 mb-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-none bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:ring-cyan-800">
                    <ShieldCheck size={18} />
                </span>
                <div>
                    <h3 className="text-sm font-black text-slate-950 dark:text-white">{t('shift.supervisorPanel', 'Shift Supervisor')}</h3>
                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{t('shift.roleDescription', 'Oversee shift operations and compliance')}</p>
                </div>
            </div>

            {currentShift ? (
                <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-none bg-slate-50/60 p-3 dark:bg-slate-950/40">
                        <div className="flex items-center gap-3">
                            <WalletCards size={16} className="text-slate-400" />
                            <div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white">{t('shift.activeShift', 'Active Shift')}</p>
                                <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                    {t('shift.openedAt', { time: new Date(currentShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                                </p>
                            </div>
                        </div>
                        <StatusPill status="Open" />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-none bg-slate-50/60 p-2.5 text-center dark:bg-slate-950/40">
                            <p className="text-[10px] font-black uppercase text-slate-400">{t('shift.transactions', 'Txns')}</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white">{currentShift.transaction_count || 0}</p>
                        </div>
                        <div className="rounded-none bg-slate-50/60 p-2.5 text-center dark:bg-slate-950/40">
                            <p className="text-[10px] font-black uppercase text-slate-400">{t('shift.collected', 'Collected')}</p>
                            <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{roundFinancialAmount(Number(currentShift.collected_amount || 0)).toFixed(2)}</p>
                        </div>
                        <div className="rounded-none bg-slate-50/60 p-2.5 text-center dark:bg-slate-950/40">
                            <p className="text-[10px] font-black uppercase text-slate-400">{t('shift.uptime', 'Uptime')}</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white">{formatDuration(currentShift.duration_minutes || 0)}</p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {permissions.canCloseCashierShift && (
                            <button type="button" onClick={onCloseShift} className="flex-1 rounded-none bg-gradient-to-b from-rose-600 to-rose-700 py-2.5 text-xs font-black text-white shadow-sm transition hover:from-rose-700 hover:to-rose-800">
                                {t('shift.closeShift', 'Close Shift')}
                            </button>
                        )}
                        {permissions.canManageQueue && onViewReceipts && (
                            <button type="button" onClick={onViewReceipts} className="flex-1 rounded-none border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                {t('shift.viewReceipts', 'Receipts')}
                            </button>
                        )}
                        {permissions.has('VIEW_AUDIT_LOGS') && onViewAuditLog && (
                            <button type="button" onClick={onViewAuditLog} className="flex-1 rounded-none border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                {t('shift.auditLog', 'Audit Log')}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-none bg-amber-50/60 p-3 dark:bg-amber-900/10">
                        <Clock3 size={16} className="text-amber-600" />
                        <div>
                            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">{t('shift.noActiveShift', 'No Active Shift')}</p>
                            <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400">{t('shift.openToBegin', 'Open a shift to begin processing payments')}</p>
                        </div>
                    </div>

                    {permissions.canOpenCashierShift && (
                        <button type="button" onClick={onOpenShift} className="w-full rounded-none bg-gradient-to-b from-emerald-600 to-emerald-700 py-2.5 text-xs font-black text-white shadow-sm transition hover:from-emerald-700 hover:to-emerald-800">
                            {t('shift.openShift', 'Open Cashier Shift')}
                        </button>
                    )}
                </div>
            )}

            {selectedClosure && (
                <Modal
                    isOpen={showReviewModal}
                    onClose={() => { setShowReviewModal(false); setSelectedClosure(null); }}
                    title={t('shift.reviewClosure', 'Review Shift Closure')}
                >
                    <div className="space-y-4">
                        <div className="rounded-none border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
                            {t('shift.reviewHelp', 'Review the closure details and add notes before confirming.')}
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-600 dark:text-slate-400">{t('shift.expected', 'Expected Cash')}</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-white">{roundFinancialAmount(Number(selectedClosure.expected_cash || 0)).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-600 dark:text-slate-400">{t('shift.counted', 'Counted Cash')}</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-white">{roundFinancialAmount(Number(selectedClosure.counted_cash || 0)).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-600 dark:text-slate-400">{t('shift.variance', 'Variance')}</span>
                                <span className={`font-mono font-bold ${Math.abs(Number(selectedClosure.variance || 0)) < 0.01 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                    {roundFinancialAmount(Number(selectedClosure.variance || 0)).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                                {t('shift.reviewNotes', 'Supervisor Notes')}
                            </label>
                            <textarea rows="3" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} className="w-full rounded-none border border-slate-200 bg-white/80 px-4 py-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" />
                        </div>

                        <div className="flex gap-3">
                            <button type="button" onClick={() => { setShowReviewModal(false); setSelectedClosure(null); setReviewNotes(''); }} className="flex-1 rounded-none border border-slate-200 bg-white/80 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
                                {t('common.cancel', 'Cancel')}
                            </button>
                            <button type="button" onClick={handleReviewSubmit} className="flex-1 rounded-none bg-gradient-to-b from-cyan-600 to-cyan-700 py-2.5 text-xs font-black text-white shadow-sm transition hover:from-cyan-700 hover:to-cyan-800">
                                {t('shift.confirmReview', 'Confirm Review')}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
};

export default ShiftSupervisorPanel;
