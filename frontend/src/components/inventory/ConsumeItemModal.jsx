import { useMemo, useState } from 'react';
import { PackageMinus, Tag, ShieldCheck, Layers, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useConsumeStockMutation, useGetInventoryQuery } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Modal from '../ui/Modal';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

const ConsumeItemModal = ({ examId, onClose }) => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`inventory.consume.${key}`, options);
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const isRtl = i18n.language?.startsWith('ar');

    const { data: inventory = [], isLoading, isError, refetch } = useGetInventoryQuery();
    const [consumeStock, { isLoading: isConsuming }] = useConsumeStockMutation();
    const [form, setForm] = useState({ itemId: '', quantity: '1', batchId: '', notes: '' });

    const availableItems = useMemo(() => inventory.filter(item => Number(item.quantity) > 0), [inventory]);
    const selectedItem = inventory.find(item => item.item_id === form.itemId);
    const activeBatches = selectedItem?.active_batches || [];
    const selectedBatch = activeBatches.find(batch => batch.batch_id === form.batchId);
    const maxQuantity = Number(selectedBatch?.quantity ?? selectedItem?.quantity ?? 0);

    const effectiveUnitPrice = Number(selectedItem?.unit_price || 0);
    const totalAmount = (Number(form.quantity) || 0) * (Number.isFinite(effectiveUnitPrice) ? effectiveUnitPrice : 0);

    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : (isRtl ? 'بدون تاريخ انتهاء' : 'No Expiry');
    const safeClose = () => { if (!isConsuming) onClose(); };

    const handleItemChange = (event) => {
        const newItemId = event.target.value;
        setForm(curr => ({
            ...curr,
            itemId: newItemId,
            batchId: '',
            quantity: '1'
        }));
    };

    const handleSubmit = async event => {
        event.preventDefault();
        const quantity = Number(form.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
            toast.error(copy('invalidQuantity', { max: maxQuantity, defaultValue: `الكمية يجب أن تكون بين 1 و ${maxQuantity}` }));
            return;
        }

        const price = effectiveUnitPrice;
        if (isNaN(price) || price < 0) {
            toast.error(isRtl ? 'يرجى إدخال سعر وحدة صحيح' : 'Please enter a valid unit price');
            return;
        }

        try {
            await consumeStock({
                itemId: form.itemId,
                quantity,
                batchId: form.batchId || undefined,
                referenceType: examId ? 'Exam' : 'Manual',
                referenceId: examId || undefined,
                notes: form.notes.trim() || undefined
            }).unwrap();

            toast.success(isRtl ? 'تم تسجيل استهلاك المستلزم بنجاح وإضافته للفاتورة' : 'Supply consumed and billed successfully');
            onClose();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('error', { defaultValue: 'فشل تسجيل استهلاك المستلزم' })));
        }
    };

    return (
        <Modal isOpen onClose={safeClose} title={isRtl ? 'تسجيل استهلاك مستلزمات الفحص' : copy('title', { defaultValue: 'Record Exam Supply Consumption' })} size="sm">
            {/* Header info badge */}
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-teal-200/80 bg-teal-50/70 p-3.5 text-teal-950 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-200">
                <PackageMinus size={20} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
                <div className="min-w-0 text-xs">
                    <p className="font-black text-teal-900 dark:text-teal-200">
                        {isRtl ? 'صرف مستلزمات طبية للفحص' : 'Exam Supply Consumption & Billing'}
                    </p>
                    <p className="mt-0.5 text-teal-700 dark:text-teal-300">
                        {isRtl ? 'سيتم خصم الكمية من المخزون وإدراج سعر المستلزم تلقائياً في فاتورة الفحص والحساب المالي.' : 'Deducts physical stock and automatically appends the item price to the exam invoice.'}
                    </p>
                </div>
            </div>

            {isLoading ? (
                <p className="animate-pulse py-8 text-center text-sm font-bold text-slate-400">
                    {copy('loading', { defaultValue: 'جاري تحميل قائمة المخزون...' })}
                </p>
            ) : isError ? (
                <div role="alert" className="py-8 text-center">
                    <p className="text-sm font-semibold text-rose-600">
                        {copy('loadError', { defaultValue: 'تعذر تحميل عناصر المخزون' })}
                    </p>
                    <button type="button" onClick={refetch} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">
                        {copy('retry', { defaultValue: 'إعادة المحاولة' })}
                    </button>
                </div>
            ) : availableItems.length === 0 ? (
                <div className="py-8 text-center">
                    <AlertCircle size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                        {copy('empty', { defaultValue: 'لا توجد مستلزمات متاحة بالمخزن' })}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                        {copy('emptyDescription', { defaultValue: 'يرجى مراجعة إدارة المخازن لإضافة أرصدة جديدة.' })}
                    </p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Item Selection */}
                    <Field label={isRtl ? 'المستلزم الطبي / الصنف' : copy('item', { defaultValue: 'Medical Item / Supply' })}>
                        <select
                            required
                            disabled={isConsuming}
                            value={form.itemId}
                            onChange={handleItemChange}
                            className={inputClass}
                        >
                            <option value="">{isRtl ? '-- اختر المستلزم من القائمة --' : copy('selectItem', { defaultValue: 'Select Item' })}</option>
                            {availableItems.map(item => (
                                <option key={item.item_id} value={item.item_id}>
                                    {item.name} ({item.quantity} {item.unit || (isRtl ? 'وحدة' : 'units')}) - {Number(item.unit_price || 0).toFixed(2)} EGP
                                </option>
                            ))}
                        </select>
                    </Field>

                    {selectedItem && (
                        <>
                            {/* Quantity & Unit Price Inputs */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label={isRtl ? `الكمية المستهلكة (${selectedItem.unit || 'وحدة'})` : copy('quantity', { unit: selectedItem.unit || 'units', defaultValue: 'Quantity' })}>
                                    <input
                                        type="number"
                                        min="1"
                                        max={maxQuantity}
                                        step="1"
                                        required
                                        disabled={isConsuming}
                                        value={form.quantity}
                                        onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))}
                                        className={inputClass}
                                        dir="ltr"
                                    />
                                </Field>

                                <Field label={isRtl ? 'سعر الوحدة (ج.م)' : 'Unit Price (EGP)'}>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            readOnly
                                            value={effectiveUnitPrice.toFixed(2)}
                                            className={`${inputClass} cursor-not-allowed bg-slate-50 dark:bg-slate-900`}
                                            dir="ltr"
                                        />
                                        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-bold text-slate-400">
                                            EGP
                                        </span>
                                    </div>
                                </Field>
                            </div>

                            {/* Batch Selection (if multiple batches exist) */}
                            {activeBatches.length > 0 && (
                                <Field label={isRtl ? 'رقم التشغيلة / الدفعة (اختياري)' : copy('batch', { defaultValue: 'Batch / Lot Number' })}>
                                    <select
                                        disabled={isConsuming}
                                        value={form.batchId}
                                        onChange={event => setForm(current => ({ ...current, batchId: event.target.value, quantity: '1' }))}
                                        className={inputClass}
                                    >
                                        <option value="">{isRtl ? 'صرف تلقائي حسب الأقدمية (FIFO)' : copy('fifo', { defaultValue: 'Automatic (FIFO)' })}</option>
                                        {activeBatches.map(batch => (
                                            <option key={batch.batch_id} value={batch.batch_id}>
                                                Lot: {batch.lot_number || (isRtl ? 'بدون رقم' : 'N/A')} - ({batch.quantity} {selectedItem.unit || 'وحدة'}) - Exp: {formatDate(batch.expiry_date)}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            )}

                            {/* Live Financial Matrix Breakdown */}
                            <div className="rounded-2xl border border-teal-200/80 bg-teal-50/50 p-3.5 dark:border-teal-900/50 dark:bg-teal-950/20">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wide text-teal-800 dark:text-teal-300">
                                            {isRtl ? 'سعر الوحدة المحدد' : 'Unit Rate'}
                                        </p>
                                        <p className="mt-1 font-mono text-base font-black text-slate-900 dark:text-white" dir="ltr">
                                            {effectiveUnitPrice.toFixed(2)} <span className="text-xs font-bold text-slate-400">EGP</span>
                                        </p>
                                    </div>
                                    <div className="text-end">
                                        <p className="text-[10px] font-black uppercase tracking-wide text-teal-800 dark:text-teal-300">
                                            {isRtl ? 'إجمالي التكلفة / الإضافة' : 'Total Addition'}
                                        </p>
                                        <p className="mt-1 font-mono text-lg font-black text-teal-700 dark:text-teal-300" dir="ltr">
                                            +{totalAmount.toFixed(2)} <span className="text-xs font-bold text-teal-600">EGP</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2.5 flex items-center gap-1.5 border-t border-teal-200/60 pt-2 text-[11px] font-medium text-teal-800 dark:text-teal-300">
                                    <ShieldCheck size={13} className="shrink-0 text-teal-600" />
                                    <span>{isRtl ? 'يتم تحديث إجمالي الفاتورة وقائمة الحسابات تلقائياً عند التأكيد' : 'Auto-updates exam invoice ledger and outstanding balance.'}</span>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Notes Field */}
                    <Field label={isRtl ? 'ملاحظات الصرف والاستخدام الطبي (اختياري)' : copy('notes', { defaultValue: 'Clinical Usage Notes' })}>
                        <textarea
                            maxLength={500}
                            rows={2}
                            disabled={isConsuming}
                            value={form.notes}
                            onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}
                            placeholder={isRtl ? 'مثال: تم استخدام صبغة إضافية للفحص بناء على تعليمات الطبيب...' : copy('notesPlaceholder', { defaultValue: 'e.g. Additional contrast agent used per radiologist instruction...' })}
                            className={`${inputClass} resize-y`}
                        />
                    </Field>

                    {/* Modal Actions */}
                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={safeClose}
                            disabled={isConsuming}
                            className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {copy('cancel', { defaultValue: 'إلغاء' })}
                        </button>
                        <button
                            type="submit"
                            disabled={isConsuming || !selectedItem}
                            className="min-h-11 rounded-xl bg-teal-600 px-6 text-sm font-black text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
                        >
                            {isConsuming ? copy('saving', { defaultValue: 'جاري الحفظ...' }) : (isRtl ? 'تأكيد الصرف والإضافة للفاتورة' : copy('confirm', { defaultValue: 'Confirm & Append to Invoice' }))}
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {label}
        </span>
        {children}
    </label>
);

export default ConsumeItemModal;
