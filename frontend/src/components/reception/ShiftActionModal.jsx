import React from 'react';
import Modal from '../ui/Modal';

const ShiftActionModal = ({
    action,
    countedCash,
    isBusy,
    onClose,
    onCountedCashChange,
    onNotesChange,
    onOpeningBalanceChange,
    onSubmit,
    openingBalance,
    shiftNotes,
    t
}) => (
    <Modal
        isOpen={Boolean(action)}
        onClose={() => !isBusy && onClose()}
        title={action === 'open'
            ? t('billing.openShift', { defaultValue: 'Open Cashier Shift' })
            : t('billing.closeShift', { defaultValue: 'Close Cashier Shift' })}
    >
        <form onSubmit={onSubmit} className="space-y-5">
            {action === 'open' ? (
                <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                        {t('billing.openingBalance', { defaultValue: 'Opening Balance' })}
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={openingBalance}
                        onChange={(event) => onOpeningBalanceChange(event.target.value)}
                        className="w-full rounded-none border border-slate-200/60 bg-white/80 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-950 dark:text-slate-100"
                        dir="ltr"
                    />
                </div>
            ) : (
                <>
                    <div className="rounded-none border border-teal-100/60 bg-teal-50/40 p-4 text-sm font-medium text-teal-800 dark:border-teal-900/40 dark:bg-teal-950/20 dark:text-teal-300">
                        {t('billing.blindCountHelp', { defaultValue: 'Count the physical cash before submitting. The expected amount remains hidden until the drawer is closed.' })}
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                            {t('billing.countedCash', { defaultValue: 'Counted Cash' })}
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={countedCash}
                            onChange={(event) => onCountedCashChange(event.target.value)}
                            className="w-full rounded-none border border-slate-200/60 bg-white/80 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-950 dark:text-slate-100"
                            dir="ltr"
                        />
                    </div>
                </>
            )}
            <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                    {action === 'close'
                        ? t('billing.varianceReason', { defaultValue: 'Count note / variance reason' })
                        : t('billing.shiftNotes', { defaultValue: 'Shift Notes (Optional)' })}
                </label>
                <textarea
                    rows="3"
                    minLength={action === 'close' ? 3 : undefined}
                    required={action === 'close'}
                    value={shiftNotes}
                    onChange={(event) => onNotesChange(event.target.value)}
                    className="w-full rounded-none border border-slate-200/60 bg-white/80 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-950 dark:text-slate-100"
                />
            </div>
            <div className="flex gap-3">
                <button type="button" disabled={isBusy} onClick={onClose} className="flex-1 rounded-none border border-slate-200/60 bg-white/80 py-3 font-bold text-slate-700 dark:border-slate-800/60 dark:bg-slate-900/50 dark:text-slate-300">
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                </button>
                <button
                    type="submit"
                    disabled={isBusy || (action === 'close' && (!countedCash || shiftNotes.trim().length < 3))}
                    className="flex-1 rounded-none bg-gradient-to-b from-slate-800 to-slate-950 py-3 font-bold text-white shadow-sm transition hover:from-slate-900 hover:to-black disabled:opacity-50 dark:from-slate-100 dark:to-slate-200 dark:text-slate-900 dark:hover:from-white dark:hover:to-slate-100"
                >
                    {isBusy ? t('billing.processing', { defaultValue: 'Processing...' }) : t('common.confirm', { defaultValue: 'Confirm' })}
                </button>
            </div>
        </form>
    </Modal>
);

export default ShiftActionModal;
