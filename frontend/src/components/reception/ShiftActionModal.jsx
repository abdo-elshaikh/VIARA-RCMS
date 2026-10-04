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
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <label className="mb-2 block text-xs font-black text-slate-700 dark:text-slate-300">
                        {t('billing.openingBalance', { defaultValue: 'Opening Balance' })}
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={openingBalance}
                        onChange={(event) => onOpeningBalanceChange(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        dir="ltr"
                    />
                </div>
            ) : (
                <>
                    <div className="flex gap-3 rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50 to-white p-4 text-sm font-medium leading-relaxed text-teal-900 dark:border-teal-900/60 dark:from-teal-950/45 dark:to-slate-900 dark:text-teal-200">
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300">i</span>
                        <span>
                        {t('billing.blindCountHelp', { defaultValue: 'Count the physical cash before submitting. The expected amount remains hidden until the drawer is closed.' })}
                        </span>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                        <label className="mb-2 block text-xs font-black text-slate-700 dark:text-slate-300">
                            {t('billing.countedCash', { defaultValue: 'Counted Cash' })}
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={countedCash}
                            onChange={(event) => onCountedCashChange(event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            dir="ltr"
                        />
                    </div>
                </>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <label className="mb-2 block text-xs font-black text-slate-700 dark:text-slate-300">
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
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-950"
                />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:gap-3 dark:border-slate-800">
                <button type="button" disabled={isBusy} onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                </button>
                <button
                    type="submit"
                    disabled={isBusy || (action === 'close' && (countedCash === '' || shiftNotes.trim().length < 3))}
                    className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 py-3 text-sm font-black text-white shadow-sm transition hover:from-teal-700 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isBusy ? t('billing.processing', { defaultValue: 'Processing...' }) : t('common.confirm', { defaultValue: 'Confirm' })}
                </button>
            </div>
        </form>
    </Modal>
);

export default ShiftActionModal;
