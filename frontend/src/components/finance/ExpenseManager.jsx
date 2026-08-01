import { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CreditCard, Plus, Receipt, RotateCcw, Tag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreateExpenseMutation, useDeleteExpenseMutation, useGetExpenseCategoriesQuery, useGetExpensesQuery, useGetSuppliersQuery } from '../../store/api';
import { formatFinancialCurrency, formatFinancialDate } from '../../utils/financialFormat';

const initialForm = () => ({
    categoryId: '',
    supplierId: '',
    amount: '',
    taxAmount: '0',
    expenseDate: new Date().toISOString().substring(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: ''
});

const ExpenseManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    const { data: expenses = [], isLoading, isError } = useGetExpensesQuery();
    const { data: categories = [] } = useGetExpenseCategoriesQuery();
    const { data: suppliers = [] } = useGetSuppliersQuery();
    const [createExpense, { isLoading: isCreating }] = useCreateExpenseMutation();
    const [deleteExpense, { isLoading: isReversing }] = useDeleteExpenseMutation();
    const [showNew, setShowNew] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [reverseDraft, setReverseDraft] = useState({ expense: null, reason: '' });

    const totals = useMemo(() => expenses.reduce((sum, expense) => ({
        amount: sum.amount + Number(expense.amount || 0),
        tax: sum.tax + Number(expense.tax_amount || 0)
    }), { amount: 0, tax: 0 }), [expenses]);

    const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            await createExpense({
                ...form,
                amount: parseFloat(form.amount),
                taxAmount: parseFloat(form.taxAmount || 0),
                supplierId: form.supplierId || null
            }).unwrap();
            toast.success(t('finance.expenses.success'));
            setShowNew(false);
            setForm(initialForm());
        } catch (error) {
            toast.error(error?.data?.message || t('finance.expenses.saveError'));
        }
    };

    const handleReverse = async (event) => {
        event.preventDefault();
        const reason = reverseDraft.reason.trim();
        if (reason.length < 5) {
            toast.error(t('finance.expenses.reverseReasonShort', { defaultValue: 'Reason must be at least 5 characters.' }));
            return;
        }
        try {
            await deleteExpense({ id: reverseDraft.expense.expense_id, reason }).unwrap();
            toast.success(t('finance.expenses.reverseSuccess', { defaultValue: 'Expense reversed.' }));
            setReverseDraft({ expense: null, reason: '' });
        } catch (error) {
            toast.error(error?.data?.message || t('finance.expenses.reverseError', { defaultValue: 'Unable to reverse expense.' }));
        }
    };

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-white/5 dark:bg-white/5">
                <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 ring-1 ring-rose-200 shadow-md dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
                        <Receipt size={22} />
                    </span>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">
                            {t('finance.expenses.title')}
                        </h2>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                            {t('finance.expenses.description')}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setShowNew((value) => !value)}
                    aria-expanded={showNew}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-cyan-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                    {showNew ? <X size={16} /> : <Plus size={16} />}
                    {showNew ? t('finance.expenses.closeForm') : t('finance.expenses.openForm')}
                </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 gap-4 border-b border-slate-100/80 p-5 dark:border-white/5 min-[480px]:grid-cols-3">
                <ExpenseMetric label={t('finance.expenses.records')} value={expenses.length.toLocaleString(i18n.language)} />
                <ExpenseMetric label={t('finance.expenses.recordedAmount')} value={money(totals.amount)} tone="rose" />
                <ExpenseMetric label={t('finance.expenses.includedTax')} value={money(totals.tax)} />
            </div>

            {/* Form */}
            {showNew && (
                <form onSubmit={handleSubmit} className="border-b border-slate-200/80 bg-rose-50/40 p-5 backdrop-blur-md dark:border-white/5 dark:bg-rose-950/20 sm:p-6">
                    <div className="mb-5">
                        <h3 className="font-black text-slate-900 dark:text-white text-base">{t('finance.expenses.newTitle')}</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('finance.expenses.formHelp')}</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <Field label={t('finance.expenses.category')}>
                            <select
                                required
                                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
                                value={form.categoryId}
                                onChange={(event) => setField('categoryId', event.target.value)}
                            >
                                <option value="">{t('finance.expenses.selectCategory')}</option>
                                {categories.map((category) => (
                                    <option key={category.category_id} value={category.category_id}>{category.name}</option>
                                ))}
                            </select>
                        </Field>

                        <Field label={t('finance.common.amount')}>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                required
                                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 font-mono text-xs font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
                                value={form.amount}
                                onChange={(event) => setField('amount', event.target.value)}
                                placeholder="0.00"
                            />
                        </Field>

                        <Field label={t('finance.expenses.includedTax')}>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 font-mono text-xs font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
                                value={form.taxAmount}
                                onChange={(event) => setField('taxAmount', event.target.value)}
                            />
                        </Field>

                        <Field label={t('finance.expenses.supplier')}>
                            <select
                                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
                                value={form.supplierId}
                                onChange={(event) => setField('supplierId', event.target.value)}
                            >
                                <option value="">{t('finance.expenses.noSupplier')}</option>
                                {suppliers.map((supplier) => (
                                    <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.name}</option>
                                ))}
                            </select>
                        </Field>

                        <Field label={t('finance.expenses.expenseDate')}>
                            <input
                                type="date"
                                required
                                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
                                value={form.expenseDate}
                                onChange={(event) => setField('expenseDate', event.target.value)}
                            />
                        </Field>

                        <Field label={t('finance.expenses.paymentMethod')}>
                            <select
                                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
                                value={form.paymentMethod}
                                onChange={(event) => setField('paymentMethod', event.target.value)}
                            >
                                {['Cash', 'Credit Card', 'Bank Transfer', 'Check'].map((method) => (
                                    <option key={method} value={method}>{t(`finance.methods.${method}`)}</option>
                                ))}
                            </select>
                        </Field>

                        <Field label={t('finance.expenses.reference')}>
                            <input
                                type="text"
                                maxLength="100"
                                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
                                value={form.referenceNumber}
                                onChange={(event) => setField('referenceNumber', event.target.value)}
                                placeholder={t('finance.expenses.referencePlaceholder')}
                            />
                        </Field>

                        <div className="md:col-span-2">
                            <Field label={t('finance.expenses.notes')}>
                                <input
                                    type="text"
                                    maxLength="500"
                                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
                                    value={form.notes}
                                    onChange={(event) => setField('notes', event.target.value)}
                                    placeholder={t('finance.expenses.notesPlaceholder')}
                                />
                            </Field>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={() => setShowNew(false)}
                            className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-white/5"
                        >
                            {t('finance.common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating}
                            className="rounded-xl bg-rose-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition hover:bg-rose-700 disabled:opacity-50"
                        >
                            {isCreating ? t('finance.expenses.saving') : t('finance.expenses.save')}
                        </button>
                    </div>
                </form>
            )}

            {/* List */}
            {isLoading ? (
                <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{t('finance.expenses.loading')}</div>
            ) : isError ? (
                <div role="alert" className="p-12 text-center text-sm font-bold text-rose-600 dark:text-rose-400">{t('finance.expenses.error')}</div>
            ) : expenses.length === 0 ? (
                <div className="p-12 text-center">
                    <Receipt className="mx-auto text-slate-300 dark:text-slate-600" size={40} />
                    <p className="mt-3 font-black text-slate-700 dark:text-slate-300">{t('finance.expenses.emptyTitle')}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('finance.expenses.emptyDescription')}</p>
                </div>
            ) : (
                <>
                    <div className="divide-y divide-slate-100/80 dark:divide-white/5 md:hidden">
                        {expenses.map((expense) => (
                            <ExpenseCard
                                key={expense.expense_id}
                                expense={expense}
                                onReverse={() => setReverseDraft({ expense, reason: '' })}
                            />
                        ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[720px] text-start text-sm">
                            <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                                <tr>
                                    {[t('finance.common.date'), t('finance.expenses.tableCategory'), t('finance.expenses.tableSupplier')].map((label) => (
                                        <th key={label} scope="col" className="p-4 text-start text-xs font-black uppercase tracking-wider">{label}</th>
                                    ))}
                                    <th scope="col" className="p-4 text-end text-xs font-black uppercase tracking-wider">{t('finance.common.amount')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                {expenses.map((expense) => (
                                    <ExpenseRow
                                        key={expense.expense_id}
                                        expense={expense}
                                        onReverse={() => setReverseDraft({ expense, reason: '' })}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {reverseDraft.expense ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                    <form onSubmit={handleReverse} className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950">
                        <div className="flex items-start gap-3 border-b border-slate-100 p-5 dark:border-white/10">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                <AlertTriangle size={18} />
                            </span>
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {t('finance.expenses.reverseTitle', { defaultValue: 'Reverse expense' })}
                                </h3>
                                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {reverseDraft.expense.category_name || t('finance.expenses.uncategorized')} - {money(reverseDraft.expense.amount)}
                                </p>
                            </div>
                        </div>
                        <div className="p-5">
                            <Field label={t('finance.expenses.reverseReason', { defaultValue: 'Reversal reason' })}>
                                <textarea
                                    required
                                    minLength={5}
                                    maxLength={500}
                                    rows={4}
                                    className="mt-1.5 w-full resize-none rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-amber-500 dark:focus:ring-amber-500/20"
                                    value={reverseDraft.reason}
                                    onChange={(event) => setReverseDraft((current) => ({ ...current, reason: event.target.value }))}
                                    placeholder={t('finance.expenses.reverseReasonPlaceholder', { defaultValue: 'Explain why this expense is being reversed' })}
                                />
                            </Field>
                        </div>
                        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-4 dark:border-white/10 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setReverseDraft({ expense: null, reason: '' })}
                                className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                            >
                                {t('finance.common.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={isReversing}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/20 transition hover:bg-amber-700 disabled:opacity-50"
                            >
                                <RotateCcw size={15} />
                                {isReversing
                                    ? t('finance.expenses.reversing', { defaultValue: 'Reversing...' })
                                    : t('finance.expenses.confirmReverse', { defaultValue: 'Reverse expense' })}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}
        </div>
    );
};

const Field = ({ label, children }) => (
    <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const ExpenseMetric = ({ label, value, tone }) => (
    <div className="min-w-0 rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 dark:border-white/5 dark:bg-white/[0.02]">
        <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`mt-2 truncate text-xl font-black ${tone === 'rose' ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{value}</p>
    </div>
);

const ExpenseCard = ({ expense, onReverse }) => {
    const { t, i18n } = useTranslation('workspace');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    return (
        <article className="p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Tag size={12} />
                        {expense.category_name || t('finance.expenses.uncategorized')}
                    </span>
                    <h3 className="mt-2 font-black text-slate-900 dark:text-white">{expense.supplier_name || t('finance.expenses.generalExpense')}</h3>
                </div>
                <p className="font-mono font-black text-rose-600 dark:text-rose-400">{money(expense.amount)}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                    <Calendar size={13} />
                    {formatFinancialDate(expense.expense_date, i18n.language)}
                </span>
                <span className="flex items-center gap-1">
                    <CreditCard size={13} />
                    {expense.payment_method ? t(`finance.methods.${expense.payment_method}`, { defaultValue: expense.payment_method }) : '—'}
                </span>
                {Number(expense.tax_amount) > 0 ? (
                    <span>{t('finance.expenses.tax', { amount: money(expense.tax_amount) })}</span>
                ) : null}
            </div>
            {expense.notes ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">{expense.notes}</p> : null}
            <button
                type="button"
                onClick={onReverse}
                className="mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15"
                title={t('finance.expenses.reverse', { defaultValue: 'Reverse' })}
            >
                <RotateCcw size={14} />
                {t('finance.expenses.reverse', { defaultValue: 'Reverse' })}
            </button>
        </article>
    );
};

const ExpenseRow = ({ expense, onReverse }) => {
    const { t, i18n } = useTranslation('workspace');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    const method = expense.payment_method ? t(`finance.methods.${expense.payment_method}`, { defaultValue: expense.payment_method }) : '';
    return (
        <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
            <td className="p-4 text-slate-600 dark:text-slate-400 font-semibold">
                <span className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {formatFinancialDate(expense.expense_date, i18n.language)}
                </span>
            </td>
            <td className="p-4">
                <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <Tag size={12} />
                    {expense.category_name || t('finance.expenses.uncategorized')}
                </span>
            </td>
            <td className="p-4">
                <p className="font-bold text-slate-900 dark:text-white">{expense.supplier_name || t('finance.expenses.generalExpense')}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{[expense.notes, method].filter(Boolean).join(' · ') || '—'}</p>
            </td>
            <td className="p-4 text-end">
                <p className="font-mono font-black text-rose-600 dark:text-rose-400">{money(expense.amount)}</p>
                {Number(expense.tax_amount) > 0 ? (
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{t('finance.expenses.includesTax', { amount: money(expense.tax_amount) })}</p>
                ) : null}
                <button
                    type="button"
                    onClick={onReverse}
                    className="mt-2 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-black text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15"
                    title={t('finance.expenses.reverse', { defaultValue: 'Reverse' })}
                >
                    <RotateCcw size={13} />
                    {t('finance.expenses.reverse', { defaultValue: 'Reverse' })}
                </button>
            </td>
        </tr>
    );
};

export default ExpenseManager;
