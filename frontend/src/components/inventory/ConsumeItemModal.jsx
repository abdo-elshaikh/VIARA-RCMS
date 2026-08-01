import { useMemo, useState } from 'react';
import { PackageMinus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useConsumeStockMutation, useGetInventoryQuery } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Modal from '../ui/Modal';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10';

const ConsumeItemModal = ({ examId, onClose }) => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`inventory.consume.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const { data: inventory = [], isLoading, isError, refetch } = useGetInventoryQuery();
    const [consumeStock, { isLoading: isConsuming }] = useConsumeStockMutation();
    const [form, setForm] = useState({ itemId: '', quantity: '1', batchId: '', notes: '' });

    const availableItems = useMemo(() => inventory.filter(item => Number(item.quantity) > 0), [inventory]);
    const selectedItem = inventory.find(item => item.item_id === form.itemId);
    const activeBatches = selectedItem?.active_batches || [];
    const selectedBatch = activeBatches.find(batch => batch.batch_id === form.batchId);
    const maxQuantity = Number(selectedBatch?.quantity ?? selectedItem?.quantity ?? 0);
    const unitPrice = Number(selectedItem?.unit_price || 0);
    const totalAmount = Number(form.quantity || 0) * unitPrice;
    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : copy('noExpiry');
    const safeClose = () => { if (!isConsuming) onClose(); };

    const handleSubmit = async event => {
        event.preventDefault();
        const quantity = Number(form.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
            toast.error(copy('invalidQuantity', { max: maxQuantity }));
            return;
        }
        try {
            await consumeStock({ itemId: form.itemId, quantity, batchId: form.batchId || undefined, referenceType: 'Exam', referenceId: examId, notes: form.notes.trim() || undefined }).unwrap();
            toast.success(copy('success'));
            onClose();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('error')));
        }
    };

    return (
        <Modal isOpen onClose={safeClose} title={copy('title')} size="sm">
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-blue-900"><PackageMinus size={20} className="mt-0.5 shrink-0" /><div><p className="text-sm font-bold">{copy('auditTitle')}</p><p className="mt-1 text-xs leading-5 text-blue-700">{copy('auditDescription')}</p></div></div>
            {isLoading ? <p className="animate-pulse py-8 text-center text-sm font-bold text-slate-400">{copy('loading')}</p> : isError ? <div role="alert" className="py-8 text-center"><p className="text-sm font-semibold text-rose-600">{copy('loadError')}</p><button type="button" onClick={refetch} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">{copy('retry')}</button></div> : availableItems.length === 0 ? <div className="py-8 text-center"><p className="font-bold text-slate-800">{copy('empty')}</p><p className="mt-1 text-sm text-slate-500">{copy('emptyDescription')}</p></div> : <form onSubmit={handleSubmit} className="space-y-4">
                <Field label={copy('item')}><select required disabled={isConsuming} value={form.itemId} onChange={event => setForm(current => ({ ...current, itemId: event.target.value, batchId: '', quantity: '1' }))} className={inputClass}><option value="">{copy('selectItem')}</option>{availableItems.map(item => <option key={item.item_id} value={item.item_id}>{copy('itemOption', { name: item.name, quantity: item.quantity, unit: item.unit || copy('units') })}</option>)}</select></Field>
                {selectedItem && <><div className="grid gap-4 sm:grid-cols-2"><Field label={copy('quantity', { unit: selectedItem.unit || copy('units') })}><input type="number" min="1" max={maxQuantity} step="1" required disabled={isConsuming} value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} className={inputClass} /></Field><Field label={copy('batch')}><select disabled={isConsuming} value={form.batchId} onChange={event => setForm(current => ({ ...current, batchId: event.target.value, quantity: '1' }))} className={inputClass}><option value="">{copy('fifo')}</option>{activeBatches.map(batch => <option key={batch.batch_id} value={batch.batch_id}>{copy('batchOption', { lot: batch.lot_number || copy('noLot'), quantity: batch.quantity, date: formatDate(batch.expiry_date) })}</option>)}</select></Field></div><div className="grid grid-cols-2 gap-3 rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 dark:border-cyan-900/40 dark:bg-cyan-950/20"><div><p className="text-[10px] font-black uppercase tracking-wide text-cyan-700">{copy('unitPrice')}</p><p className="mt-1 font-mono text-sm font-black text-slate-900 dark:text-white" dir="ltr">{unitPrice.toFixed(2)}</p></div><div className="text-end"><p className="text-[10px] font-black uppercase tracking-wide text-cyan-700">{copy('totalAmount')}</p><p className="mt-1 font-mono text-sm font-black text-cyan-800 dark:text-cyan-300" dir="ltr">{totalAmount.toFixed(2)}</p></div></div></>}
                <Field label={copy('notes')}><textarea maxLength={500} rows={3} disabled={isConsuming} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder={copy('notesPlaceholder')} className={`${inputClass} resize-y`} /></Field>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={safeClose} disabled={isConsuming} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">{copy('cancel')}</button><button type="submit" disabled={isConsuming || !selectedItem} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{isConsuming ? copy('saving') : copy('confirm')}</button></div>
            </form>}
        </Modal>
    );
};

const Field = ({ label, children }) => <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;

export default ConsumeItemModal;
