import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, DollarSign, MinusCircle, Package, Plus, PlusCircle, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAddItemMutation, useAdjustStockMutation, useGetInventoryQuery, useUpdateStockMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Modal from '../ui/Modal';

const emptyItem = { name: '', category: '', quantity: 0, unit: '', minLevel: 10, unitPrice: '0', isContrastAgent: false };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-cyan-500 dark:focus:ring-cyan-500/20';

const InventoryCatalog = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`inventory.catalog.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';

    const { data: inventory = [], isLoading, isError, refetch } = useGetInventoryQuery();
    const [addItem, { isLoading: isAdding }] = useAddItemMutation();
    const [adjustStock, { isLoading: isAdjusting }] = useAdjustStockMutation();
    const [updateStock, { isLoading: isUpdatingPrice }] = useUpdateStockMutation();

    const [showAdd, setShowAdd] = useState(false);
    const [newItem, setNewItem] = useState(emptyItem);
    const [search, setSearch] = useState('');
    const [lowOnly, setLowOnly] = useState(false);
    const [adjustment, setAdjustment] = useState(null);
    const [adjustmentForm, setAdjustmentForm] = useState({ quantity: '', reason: '', batchId: '' });
    const [priceItem, setPriceItem] = useState(null);
    const [unitPrice, setUnitPrice] = useState('');

    const visibleItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        return inventory.filter(item => {
            if (lowOnly && Number(item.quantity) > Number(item.min_level)) return false;
            return !query || [item.name, item.category, item.unit].filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [inventory, lowOnly, search]);

    const lowCount = useMemo(() => inventory.filter(item => Number(item.quantity) <= Number(item.min_level)).length, [inventory]);

    const handleCreate = async event => {
        event.preventDefault();
        try {
            await addItem({
                ...newItem,
                quantity: Number(newItem.quantity),
                minLevel: Number(newItem.minLevel),
                unitPrice: Number(newItem.unitPrice || 0)
            }).unwrap();
            toast.success(copy('createSuccess'));
            setShowAdd(false);
            setNewItem(emptyItem);
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };

    const openAdjustment = (item, direction) => {
        setAdjustment({ item, direction });
        setAdjustmentForm({ quantity: '', reason: '', batchId: item.active_batches?.length === 1 ? item.active_batches[0].batch_id : '' });
    };

    const closeAdjustment = () => {
        if (!isAdjusting) {
            setAdjustment(null);
            setAdjustmentForm({ quantity: '', reason: '', batchId: '' });
        }
    };

    const handleAdjustment = async event => {
        event.preventDefault();
        if (!adjustment) return;
        const quantity = Number(adjustmentForm.quantity);
        if (adjustment.direction < 0 && quantity > Number(adjustment.item.quantity)) {
            toast.error(copy('insufficientStock'));
            return;
        }
        if (adjustment.item.active_batches?.length && !adjustmentForm.batchId) {
            toast.error(copy('batchRequired'));
            return;
        }
        const batch = adjustment.item.active_batches?.find(item => item.batch_id === adjustmentForm.batchId);
        if (adjustment.direction < 0 && batch && quantity > Number(batch.quantity)) {
            toast.error(copy('insufficientBatchStock'));
            return;
        }
        try {
            await adjustStock({
                itemId: adjustment.item.item_id,
                quantityChange: quantity * adjustment.direction,
                batchId: adjustmentForm.batchId || undefined,
                notes: adjustmentForm.reason.trim()
            }).unwrap();
            toast.success(copy('adjustSuccess'));
            closeAdjustment();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('adjustError')));
        }
    };

    const openPriceEditor = item => {
        setPriceItem(item);
        setUnitPrice(String(item.unit_price ?? 0));
    };

    const closePriceEditor = () => {
        if (!isUpdatingPrice) {
            setPriceItem(null);
            setUnitPrice('');
        }
    };

    const handlePriceUpdate = async event => {
        event.preventDefault();
        try {
            await updateStock({ itemId: priceItem.item_id, unitPrice: Number(unitPrice) }).unwrap();
            toast.success(copy('priceUpdateSuccess'));
            closePriceEditor();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('priceUpdateError')));
        }
    };

    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : copy('noExpiry');

    return (
        <div className="space-y-6">
            {/* Top Metric Strip */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <Metric label={copy('totalItems')} value={inventory.length} />
                <Metric label={copy('lowStock')} value={lowCount} danger={lowCount > 0} />
                <Metric label={copy('visibleItems')} value={visibleItems.length} wide />
            </section>

            {/* Catalog Main Panel */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <header className="flex flex-col gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 shadow-md dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-cyan-500/30">
                            <Package size={22} />
                        </span>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">{copy('title')}</h2>
                            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">{copy('description')}</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2.5 sm:flex-row">
                        <label className="relative sm:w-72">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                placeholder={copy('searchPlaceholder')}
                                className={`${inputClass} ps-10`}
                            />
                        </label>

                        <button
                            type="button"
                            onClick={() => setLowOnly(value => !value)}
                            aria-pressed={lowOnly}
                            className={`min-h-10 rounded-2xl border px-4 text-xs font-bold transition-all ${
                                lowOnly
                                    ? 'border-rose-300/80 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
                                    : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                        >
                            <AlertTriangle size={15} className="me-1.5 inline" />
                            {copy('lowOnly')}
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowAdd(value => !value)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white shadow-md transition hover:bg-cyan-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                        >
                            {showAdd ? <X size={16} /> : <Plus size={16} />}
                            {showAdd ? copy('closeForm') : copy('newItem')}
                        </button>
                    </div>
                </header>

                {/* Add New Item Form Overlay */}
                {showAdd && (
                    <form onSubmit={handleCreate} className="grid gap-4 border-b border-slate-200/80 bg-cyan-50/40 p-5 backdrop-blur-md dark:border-white/5 dark:bg-cyan-950/20 sm:grid-cols-2 xl:grid-cols-6">
                        <Field label={copy('itemName')} className="xl:col-span-2">
                            <input required value={newItem.name} onChange={event => setNewItem(current => ({ ...current, name: event.target.value }))} className={inputClass} />
                        </Field>
                        <Field label={copy('category')}>
                            <input value={newItem.category} onChange={event => setNewItem(current => ({ ...current, category: event.target.value }))} className={inputClass} />
                        </Field>
                        <Field label={copy('unit')}>
                            <input value={newItem.unit} onChange={event => setNewItem(current => ({ ...current, unit: event.target.value }))} placeholder={copy('unitPlaceholder')} className={inputClass} />
                        </Field>
                        <Field label={copy('minLevel')}>
                            <input type="number" min="0" required value={newItem.minLevel} onChange={event => setNewItem(current => ({ ...current, minLevel: event.target.value }))} className={inputClass} />
                        </Field>
                        <Field label={copy('unitPrice')}>
                            <input type="number" min="0" step="0.01" required value={newItem.unitPrice} onChange={event => setNewItem(current => ({ ...current, unitPrice: event.target.value }))} className={inputClass} />
                        </Field>
                        <label className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs font-bold text-cyan-900 dark:border-cyan-900/50 dark:bg-slate-900 dark:text-cyan-200 xl:col-span-2">
                            <input
                                type="checkbox"
                                checked={newItem.isContrastAgent}
                                onChange={event => setNewItem(current => ({ ...current, isContrastAgent: event.target.checked }))}
                            />
                            {copy('contrastAgent', { defaultValue: 'Contrast agent (required for contrast workflow)' })}
                        </label>

                        <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end xl:col-span-6">
                            <button
                                type="button"
                                onClick={() => { setShowAdd(false); setNewItem(emptyItem); }}
                                disabled={isAdding}
                                className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-white/5"
                            >
                                {copy('cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={isAdding}
                                className="rounded-xl bg-cyan-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-cyan-800 disabled:opacity-50"
                            >
                                {isAdding ? copy('saving') : copy('saveItem')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Content Table / Cards */}
                {isLoading ? (
                    <Loading label={copy('loading')} />
                ) : isError ? (
                    <ErrorState copy={copy} onRetry={refetch} />
                ) : visibleItems.length === 0 ? (
                    <Empty copy={copy} filtered={Boolean(search || lowOnly)} />
                ) : (
                    <>
                        <div className="grid gap-4 p-5 md:hidden">
                            {visibleItems.map(item => (
                                <ItemCard key={item.item_id} item={item} copy={copy} formatDate={formatDate} onAdjust={openAdjustment} onEditPrice={openPriceEditor} adjusting={isAdjusting || isUpdatingPrice} />
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[850px] text-xs">
                                <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                                    <tr>
                                        {['item', 'stock', 'unitPrice', 'batches', 'adjust'].map(key => (
                                            <th key={key} className={`px-4 py-3.5 text-xs font-black uppercase tracking-wider ${key === 'adjust' ? 'text-end' : 'text-start'}`}>
                                                {copy(key)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                    {visibleItems.map(item => (
                                        <ItemRow key={item.item_id} item={item} copy={copy} formatDate={formatDate} onAdjust={openAdjustment} onEditPrice={openPriceEditor} adjusting={isAdjusting || isUpdatingPrice} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>

            {/* Adjust Stock Modal */}
            <Modal isOpen={Boolean(adjustment)} onClose={closeAdjustment} title={copy(adjustment?.direction > 0 ? 'addTitle' : 'deductTitle', { item: adjustment?.item?.name || '' })} size="sm">
                <form onSubmit={handleAdjustment} className="space-y-4">
                    <div className={`rounded-2xl border p-4 text-xs font-semibold ${
                        adjustment?.direction > 0
                            ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                            : 'border-rose-200/80 bg-rose-50/90 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
                    }`}>
                        {copy('currentStock', { quantity: adjustment?.item?.quantity || 0, unit: adjustment?.item?.unit || '' })}
                    </div>

                    <Field label={copy('quantity')}>
                        <input
                            autoFocus
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={adjustmentForm.quantity}
                            onChange={event => setAdjustmentForm(current => ({ ...current, quantity: event.target.value }))}
                            className={inputClass}
                        />
                    </Field>

                    {adjustment?.item?.active_batches?.length > 0 && (
                        <Field label={copy('batch')}>
                            <select
                                required
                                value={adjustmentForm.batchId}
                                onChange={event => setAdjustmentForm(current => ({ ...current, batchId: event.target.value }))}
                                className={inputClass}
                            >
                                <option value="">{copy('selectBatch')}</option>
                                {adjustment.item.active_batches.map(batch => (
                                    <option key={batch.batch_id} value={batch.batch_id}>
                                        {batch.lot_number || copy('noLot')} · {batch.quantity} {adjustment.item.unit || ''} · {formatDate(batch.expiry_date)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    )}

                    <Field label={copy('reason')}>
                        <textarea
                            required
                            maxLength={500}
                            rows={3}
                            value={adjustmentForm.reason}
                            onChange={event => setAdjustmentForm(current => ({ ...current, reason: event.target.value }))}
                            placeholder={copy('reasonPlaceholder')}
                            className={`${inputClass} h-auto py-2.5 resize-y`}
                        />
                    </Field>

                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100/80 pt-4 dark:border-white/5 sm:flex-row sm:justify-end">
                        <button type="button" onClick={closeAdjustment} disabled={isAdjusting} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5">
                            {copy('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isAdjusting}
                            className={`rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-50 ${
                                adjustment?.direction > 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                            }`}
                        >
                            {isAdjusting ? copy('adjusting') : copy('confirmAdjustment')}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={Boolean(priceItem)} onClose={closePriceEditor} title={copy('priceTitle', { item: priceItem?.name || '' })} size="sm">
                <form onSubmit={handlePriceUpdate} className="space-y-4">
                    <Field label={copy('unitPrice')}>
                        <input autoFocus type="number" min="0" step="0.01" required value={unitPrice} onChange={event => setUnitPrice(event.target.value)} className={inputClass} />
                    </Field>
                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100/80 pt-4 dark:border-white/5 sm:flex-row sm:justify-end">
                        <button type="button" onClick={closePriceEditor} disabled={isUpdatingPrice} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5">
                            {copy('cancel')}
                        </button>
                        <button type="submit" disabled={isUpdatingPrice} className="rounded-xl bg-cyan-700 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-cyan-800 disabled:opacity-50">
                            {isUpdatingPrice ? copy('saving') : copy('savePrice')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

const Metric = ({ label, value, danger, wide }) => (
    <article className={`rounded-3xl border p-5 shadow-lg shadow-slate-200/30 backdrop-blur-xl transition-all dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none ${
        danger
            ? 'border-rose-300/80 bg-rose-50/90 dark:border-rose-500/20 dark:bg-rose-500/10'
            : 'border-slate-200/80 bg-white/80'
    } ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-2 font-mono text-2xl font-black ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{value}</p>
    </article>
);

const Field = ({ label, className = '', children }) => (
    <label className={`block ${className}`}>
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const AdjustButtons = ({ item, copy, onAdjust, onEditPrice, adjusting }) => (
    <div className="flex justify-end gap-1.5">
        <button
            type="button"
            disabled={adjusting}
            onClick={() => onEditPrice(item)}
            aria-label={copy('editPriceFor', { item: item.name })}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 hover:bg-cyan-200 disabled:opacity-50 dark:bg-cyan-500/20 dark:text-cyan-300"
        >
            <DollarSign size={16} />
        </button>
        <button
            type="button"
            disabled={adjusting}
            onClick={() => onAdjust(item, 1)}
            aria-label={copy('addStockFor', { item: item.name })}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-500/20 dark:text-emerald-300"
        >
            <PlusCircle size={16} />
        </button>
        <button
            type="button"
            disabled={adjusting || Number(item.quantity) <= 0}
            onClick={() => onAdjust(item, -1)}
            aria-label={copy('deductStockFor', { item: item.name })}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-50 dark:bg-rose-500/20 dark:text-rose-300"
        >
            <MinusCircle size={16} />
        </button>
    </div>
);

const BatchList = ({ item, copy, formatDate }) => (
    item.active_batches?.length ? (
        <div className="space-y-1.5">
            {item.active_batches.map(batch => (
                <div key={batch.batch_id} className="flex flex-wrap gap-x-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold dark:border-white/5 dark:bg-white/[0.02]">
                    <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300">{batch.lot_number || copy('noLot')}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{batch.quantity} {item.unit}</span>
                    <span className={batch.expiry_date && new Date(batch.expiry_date) < new Date() ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}>
                        {formatDate(batch.expiry_date)}
                    </span>
                </div>
            ))}
        </div>
    ) : (
        <span className="text-xs font-medium text-slate-400">{copy('noBatches')}</span>
    )
);

const ItemCard = ({ item, copy, formatDate, onAdjust, onEditPrice, adjusting }) => {
    const low = Number(item.quantity) <= Number(item.min_level);
    return (
        <article className={`rounded-3xl border p-5 transition-all ${
            low
                ? 'border-rose-300/80 bg-rose-50/60 dark:border-rose-500/20 dark:bg-rose-950/20'
                : 'border-slate-200/80 bg-white/80 dark:border-white/10 dark:bg-slate-900/60'
        }`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-sm">{item.name}</h3>
                    <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{item.category || copy('uncategorized')}</p>
                </div>
                {low ? (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
                        {copy('lowBadge')}
                    </span>
                ) : (
                    <CheckCircle2 size={18} className="text-emerald-500" />
                )}
            </div>

            <div className="my-4 rounded-2xl border border-slate-100/80 bg-slate-50/70 p-3.5 text-center shadow-inner dark:border-white/5 dark:bg-white/5">
                <p className={`font-mono text-2xl font-black ${low ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{item.quantity}</p>
                <p className="text-[10px] font-bold text-slate-400">{item.unit || copy('units')}</p>
                <p className="mt-2 font-mono text-xs font-black text-cyan-700 dark:text-cyan-300">{Number(item.unit_price || 0).toFixed(2)} EGP / {item.unit || copy('units')}</p>
            </div>

            <BatchList item={item} copy={copy} formatDate={formatDate} />
            <div className="mt-4">
                <AdjustButtons item={item} copy={copy} onAdjust={onAdjust} onEditPrice={onEditPrice} adjusting={adjusting} />
            </div>
        </article>
    );
};

const ItemRow = ({ item, copy, formatDate, onAdjust, onEditPrice, adjusting }) => {
    const low = Number(item.quantity) <= Number(item.min_level);
    return (
        <tr className={`transition-colors ${low ? 'bg-rose-50/40 dark:bg-rose-950/20' : 'hover:bg-slate-50/50 dark:hover:bg-white/[0.02]'}`}>
            <td className="px-4 py-4">
                <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{item.category || copy('uncategorized')}</p>
                {low && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
                        <AlertTriangle size={11} />
                        {copy('lowBadge')}
                    </span>
                )}
            </td>
            <td className="px-4 py-4">
                <p className={`font-mono text-lg font-black ${low ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{item.quantity}</p>
                <p className="text-xs font-semibold text-slate-400">{item.unit || copy('units')} · {copy('minimum', { value: item.min_level })}</p>
            </td>
            <td className="px-4 py-4 font-mono font-black text-cyan-700 dark:text-cyan-300">
                {Number(item.unit_price || 0).toFixed(2)} EGP
            </td>
            <td className="max-w-md px-4 py-4">
                <BatchList item={item} copy={copy} formatDate={formatDate} />
            </td>
            <td className="px-4 py-4">
                <AdjustButtons item={item} copy={copy} onAdjust={onAdjust} onEditPrice={onEditPrice} adjusting={adjusting} />
            </td>
        </tr>
    );
};

const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-xs font-bold text-slate-400">{label}</div>;
const ErrorState = ({ copy, onRetry }) => (
    <div role="alert" className="p-10 text-center">
        <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{copy('loadError')}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
            {copy('retry')}
        </button>
    </div>
);
const Empty = ({ copy, filtered }) => (
    <div className="p-12 text-center">
        <Package size={34} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-3 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default InventoryCatalog;
