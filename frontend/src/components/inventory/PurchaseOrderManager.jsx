import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDollarSign, Clock, PackageSearch, Plus, RefreshCw, Search, Trash2, Truck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import {
    useCreatePurchaseOrderMutation,
    useGetInventoryQuery,
    useGetPurchaseOrderByIdQuery,
    useGetPurchaseOrdersQuery,
    useGetSuppliersQuery,
    useReceiveStockMutation,
} from '../../store/api';
import { selectCurrentUser } from '../../store/authSlice';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Modal from '../ui/Modal';

const emptyLine = () => ({ itemId: '', orderedQuantity: '1', unitPrice: '0' });
const emptyPo = () => ({ poNumber: '', supplierId: '', expectedDate: '', notes: '', items: [emptyLine()] });
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-cyan-500 dark:focus:ring-cyan-500/20';

const PurchaseOrderManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`inventory.purchaseOrders.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const user = useSelector(selectCurrentUser);
    const effectivePermissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    const elevated = ['Developer', 'Admin'].includes(user?.role);
    const canManagePurchaseOrders = elevated || effectivePermissions.has('MANAGE_PURCHASE_ORDERS');
    const canReceiveStock = canManagePurchaseOrders || effectivePermissions.has('MANAGE_INVENTORY');

    const { data: pos = [], isLoading, isError, isFetching, refetch } = useGetPurchaseOrdersQuery();
    const { data: suppliers = [] } = useGetSuppliersQuery();
    const { data: inventory = [] } = useGetInventoryQuery();

    const [createPO, { isLoading: creating }] = useCreatePurchaseOrderMutation();
    const [receiveStock, { isLoading: receiving }] = useReceiveStockMutation();

    const [showAdd, setShowAdd] = useState(false);
    const [receiveId, setReceiveId] = useState(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [poForm, setPoForm] = useState(emptyPo);
    const [receiveForm, setReceiveForm] = useState([]);

    const { data: receiveDetails, isFetching: fetchingPo, isError: receiveError, refetch: refetchReceive } = useGetPurchaseOrderByIdQuery(receiveId, { skip: !receiveId });

    useEffect(() => {
        if (receiveDetails) {
            setReceiveForm(receiveDetails.items.map(item => ({
                poItemId: item.po_item_id,
                receivedQuantity: String(Math.max(0, Number(item.ordered_quantity) - Number(item.received_quantity))),
                lotNumber: '',
                expiryDate: '',
            })));
        }
    }, [receiveDetails]);

    const activeSuppliers = suppliers.filter(supplier => supplier.status === 'Active');

    const visibleOrders = useMemo(() => {
        const query = search.trim().toLowerCase();
        return pos.filter(po => {
            if (statusFilter !== 'all' && po.status !== statusFilter) return false;
            return !query || [po.po_number, po.supplier_name, po.status].filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [pos, search, statusFilter]);

    const summary = useMemo(() => ({
        open: pos.filter(po => ['Sent', 'Partially Received'].includes(po.status)).length,
        partial: pos.filter(po => po.status === 'Partially Received').length,
        completed: pos.filter(po => po.status === 'Completed').length,
        value: pos.filter(po => po.status !== 'Cancelled').reduce((total, po) => total + Number(po.total_amount || 0), 0),
    }), [pos]);

    const orderTotal = poForm.items.reduce((total, item) => total + Number(item.orderedQuantity || 0) * Number(item.unitPrice || 0), 0);

    const setPoField = (field, value) => setPoForm(current => ({ ...current, [field]: value }));
    const setLine = (index, field, value) => setPoForm(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
    const addLine = () => setPoForm(current => ({ ...current, items: [...current.items, emptyLine()] }));
    const removeLine = index => setPoForm(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));

    const closeCreate = () => { if (!creating) { setShowAdd(false); setPoForm(emptyPo()); } };
    const closeReceive = () => { if (!receiving) { setReceiveId(null); setReceiveForm([]); } };

    const handleCreate = async event => {
        event.preventDefault();
        if (!canManagePurchaseOrders) return;
        const itemIds = poForm.items.map(item => item.itemId);
        if (new Set(itemIds).size !== itemIds.length) {
            toast.error(copy('duplicateItems'));
            return;
        }
        try {
            await createPO({
                poNumber: poForm.poNumber.trim(),
                supplierId: poForm.supplierId,
                status: 'Sent',
                expectedDate: poForm.expectedDate || undefined,
                notes: poForm.notes.trim() || undefined,
                items: poForm.items.map(item => ({ itemId: item.itemId, orderedQuantity: Number(item.orderedQuantity), unitPrice: Number(item.unitPrice) })),
            }).unwrap();
            toast.success(copy('createSuccess'));
            closeCreate();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };

    const handleReceive = async event => {
        event.preventDefault();
        if (!canReceiveStock) return;
        const lines = receiveForm.map((item, index) => ({ item, detail: receiveDetails?.items?.[index] })).filter(({ item }) => Number(item.receivedQuantity) > 0);
        if (!lines.length) {
            toast.error(copy('receiveAtLeastOne'));
            return;
        }
        const invalid = lines.find(({ item, detail }) => Number(item.receivedQuantity) > Number(detail.ordered_quantity) - Number(detail.received_quantity));
        if (invalid) {
            toast.error(copy('receiveExceedsRemaining'));
            return;
        }
        try {
            await receiveStock({
                id: receiveId,
                items: lines.map(({ item }) => ({
                    poItemId: item.poItemId,
                    receivedQuantity: Number(item.receivedQuantity),
                    lotNumber: item.lotNumber.trim() || undefined,
                    expiryDate: item.expiryDate || undefined
                }))
            }).unwrap();
            toast.success(copy('receiveSuccess'));
            closeReceive();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('receiveError')));
        }
    };

    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const money = value => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', minimumFractionDigits: 2 }).format(Number(value || 0));

    return (
        <div className="space-y-6">
            {/* Top Metrics Grid */}
            <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label={copy('summaryLabel')}>
                <Metric icon={Truck} label={copy('openOrders')} value={summary.open} />
                <Metric icon={Clock} label={copy('partialOrders')} value={summary.partial} />
                <Metric icon={CheckCircle2} label={copy('completedOrders')} value={summary.completed} />
                <Metric icon={CircleDollarSign} label={copy('orderedValue')} value={money(summary.value)} />
            </section>

            {/* Main PO Panel */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <header className="flex flex-col gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 shadow-md dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30">
                            <Truck size={22} />
                        </span>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">{copy('title')}</h2>
                            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">{copy('description')}</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2.5 sm:flex-row">
                        <label className="relative sm:w-64">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>

                        <label>
                            <span className="sr-only">{copy('filterStatus')}</span>
                            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={inputClass}>
                                <option value="all">{copy('allStatuses')}</option>
                                {['Draft', 'Sent', 'Partially Received', 'Completed', 'Cancelled'].map(status => (
                                    <option key={status} value={status}>{copy(`statuses.${status}`)}</option>
                                ))}
                            </select>
                        </label>

                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {copy('refresh')}
                        </button>

                        {canManagePurchaseOrders && (
                            <button type="button" onClick={() => setShowAdd(value => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white shadow-md transition hover:bg-emerald-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                                {showAdd ? <X size={16} /> : <Plus size={16} />}
                                {showAdd ? copy('closeForm') : copy('create')}
                            </button>
                        )}
                    </div>
                </header>

                {/* Create PO Overlay */}
                {showAdd && (
                    <form onSubmit={handleCreate} className="space-y-5 border-b border-emerald-200/80 bg-emerald-50/30 p-5 backdrop-blur-md dark:border-white/5 dark:bg-emerald-950/20">
                        <div className="grid gap-4 md:grid-cols-3">
                            <Field label={copy('poNumber')}>
                                <input required maxLength={50} value={poForm.poNumber} onChange={event => setPoField('poNumber', event.target.value)} className={inputClass} />
                            </Field>
                            <Field label={copy('supplier')}>
                                <select required value={poForm.supplierId} onChange={event => setPoField('supplierId', event.target.value)} className={inputClass}>
                                    <option value="">{copy('selectSupplier')}</option>
                                    {activeSuppliers.map(supplier => <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.name}</option>)}
                                </select>
                            </Field>
                            <Field label={copy('expectedDate')}>
                                <input type="date" value={poForm.expectedDate} onChange={event => setPoField('expectedDate', event.target.value)} className={inputClass} />
                            </Field>
                        </div>

                        <Field label={copy('notes')}>
                            <input value={poForm.notes} onChange={event => setPoField('notes', event.target.value)} placeholder={copy('notesPlaceholder')} className={inputClass} />
                        </Field>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-slate-900 dark:text-white sm:text-sm">{copy('lineItems')}</h3>
                                <span className="font-mono text-xs font-black text-emerald-700 dark:text-emerald-400">{copy('orderTotal', { total: money(orderTotal) })}</span>
                            </div>

                            {poForm.items.map((line, index) => (
                                <div key={index} className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:grid-cols-[minmax(0,1fr)_120px_150px_auto]">
                                    <Field label={copy('item')}>
                                        <select required value={line.itemId} onChange={event => setLine(index, 'itemId', event.target.value)} className={inputClass}>
                                            <option value="">{copy('selectItem')}</option>
                                            {inventory.map(item => <option key={item.item_id} value={item.item_id}>{item.name} ({item.unit || copy('units')})</option>)}
                                        </select>
                                    </Field>
                                    <Field label={copy('quantity')}>
                                        <input required type="number" min="1" step="1" value={line.orderedQuantity} onChange={event => setLine(index, 'orderedQuantity', event.target.value)} className={inputClass} />
                                    </Field>
                                    <Field label={copy('unitPrice')}>
                                        <input required type="number" min="0" step="0.01" value={line.unitPrice} onChange={event => setLine(index, 'unitPrice', event.target.value)} className={inputClass} />
                                    </Field>
                                    <button type="button" onClick={() => removeLine(index)} disabled={poForm.items.length === 1} aria-label={copy('removeLine', { number: index + 1 })} className="mt-auto flex h-10 w-full items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 disabled:opacity-30 dark:hover:bg-rose-950/40 sm:w-10">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button type="button" onClick={addLine} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-white px-3.5 text-xs font-bold text-emerald-700 shadow-sm hover:bg-emerald-50 dark:border-emerald-500/20 dark:bg-slate-900 dark:text-emerald-300">
                            <Plus size={15} />
                            {copy('addLine')}
                        </button>

                        <div className="flex flex-col-reverse gap-2 border-t border-emerald-200/80 pt-4 dark:border-white/5 sm:flex-row sm:justify-end">
                            <button type="button" onClick={closeCreate} disabled={creating} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-white/5">
                                {copy('cancel')}
                            </button>
                            <button type="submit" disabled={creating || !activeSuppliers.length || !inventory.length} className="rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-800 disabled:opacity-50">
                                {creating ? copy('saving') : copy('sendOrder')}
                            </button>
                        </div>
                    </form>
                )}

                {/* Orders Content */}
                {isLoading ? (
                    <Loading label={copy('loading')} />
                ) : isError ? (
                    <ErrorState copy={copy} onRetry={refetch} />
                ) : visibleOrders.length === 0 ? (
                    <Empty copy={copy} filtered={Boolean(search || statusFilter !== 'all')} />
                ) : (
                    <>
                        <div className="grid gap-4 p-5 md:hidden">
                            {visibleOrders.map(po => (
                                <OrderCard key={po.po_id} po={po} copy={copy} formatDate={formatDate} money={money} onReceive={setReceiveId} canReceive={canReceiveStock} />
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[850px] text-xs">
                                <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                                    <tr>
                                        {['details', 'supplier', 'amount', 'status'].map(key => (
                                            <th key={key} className="px-4 py-3.5 text-start text-xs font-black uppercase tracking-wider">{copy(key)}</th>
                                        ))}
                                        <th className="px-4 py-3.5 text-end text-xs font-black uppercase tracking-wider">{copy('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                    {visibleOrders.map(po => (
                                        <OrderRow key={po.po_id} po={po} copy={copy} formatDate={formatDate} money={money} onReceive={setReceiveId} canReceive={canReceiveStock} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>

            {/* Receive Stock Modal */}
            <Modal isOpen={Boolean(receiveId)} onClose={closeReceive} title={copy('receiveTitle')} size="wide">
                <div className="mb-5 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4 text-xs font-bold text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                    {fetchingPo ? copy('loadingDetails') : copy('receiveContext', { po: receiveDetails?.po_number || '', supplier: receiveDetails?.supplier_name || '' })}
                </div>

                {fetchingPo ? (
                    <Loading label={copy('loadingItems')} />
                ) : receiveError ? (
                    <div role="alert" className="py-8 text-center">
                        <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{copy('receiveLoadError')}</p>
                        <button type="button" onClick={refetchReceive} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
                            {copy('retry')}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleReceive} className="space-y-4">
                        <div className="space-y-3">
                            {receiveDetails?.items?.map((line, index) => {
                                const pending = Math.max(0, Number(line.ordered_quantity) - Number(line.received_quantity));
                                return (
                                    <article key={line.po_item_id} className={`rounded-2xl border p-4 transition-colors ${
                                        pending ? 'border-slate-200/80 bg-white/80 dark:border-white/10 dark:bg-slate-900/60' : 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-950/20'
                                    }`}>
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-black text-slate-900 dark:text-white text-xs">{line.item_name}</h3>
                                                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                                    {copy('lineProgress', { ordered: line.ordered_quantity, received: line.received_quantity, remaining: pending, unit: line.unit || copy('units') })}
                                                </p>
                                            </div>
                                            {pending === 0 && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                                                    <CheckCircle2 size={13} />
                                                    {copy('fullyReceived')}
                                                </span>
                                            )}
                                        </div>

                                        {pending > 0 && (
                                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                <Field label={copy('receivingNow')}>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={pending}
                                                        step="1"
                                                        value={receiveForm[index]?.receivedQuantity ?? '0'}
                                                        onChange={event => setReceiveForm(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, receivedQuantity: event.target.value } : item))}
                                                        className={inputClass}
                                                    />
                                                </Field>
                                                <Field label={copy('lotNumber')}>
                                                    <input
                                                        maxLength={100}
                                                        value={receiveForm[index]?.lotNumber || ''}
                                                        onChange={event => setReceiveForm(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, lotNumber: event.target.value } : item))}
                                                        placeholder={copy('optional')}
                                                        className={inputClass}
                                                    />
                                                </Field>
                                                <Field label={copy('expiryDate')}>
                                                    <input
                                                        type="date"
                                                        value={receiveForm[index]?.expiryDate || ''}
                                                        onChange={event => setReceiveForm(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, expiryDate: event.target.value } : item))}
                                                        className={inputClass}
                                                    />
                                                </Field>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-slate-100/80 pt-4 dark:border-white/5 sm:flex-row sm:justify-end">
                            <button type="button" onClick={closeReceive} disabled={receiving} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5">
                                {copy('cancel')}
                            </button>
                            <button type="submit" disabled={receiving} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-800 disabled:opacity-50">
                                {receiving ? copy('processing') : copy('confirmReceipt')}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

const Metric = ({ icon: Icon, label, value }) => (
    <article className="rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-lg shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
        <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-500/20 dark:text-emerald-300">
                <Icon size={17} />
            </span>
        </div>
        <p className="mt-2 truncate font-mono text-2xl font-black text-slate-900 dark:text-white">{value}</p>
    </article>
);

const Field = ({ label, children }) => (
    <label className="block min-w-0">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const Status = ({ value, copy }) => {
    const tone = value === 'Completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
        : value === 'Sent' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300'
        : value === 'Partially Received' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
        : value === 'Cancelled' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${tone}`}>
            {copy(`statuses.${value}`)}
        </span>
    );
};

const ReceiveButton = ({ po, copy, onReceive, canReceive }) => (
    canReceive && ['Sent', 'Partially Received'].includes(po.status) ? (
        <button
            type="button"
            onClick={() => onReceive(po.po_id)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
            <Truck size={14} />
            {copy('receive')}
        </button>
    ) : null
);

const OrderCard = ({ po, copy, formatDate, money, onReceive, canReceive }) => (
    <article className="rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all dark:border-white/10 dark:bg-slate-900/60">
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="font-mono font-black text-slate-900 dark:text-white text-xs">{po.po_number}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{formatDate(po.order_date)} · {copy('lineCount', { count: po.item_count })}</p>
            </div>
            <Status value={po.status} copy={copy} />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-100/80 bg-slate-50/70 p-3.5 dark:border-white/5 dark:bg-white/5">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{po.supplier_name}</p>
            <p className="mt-1 font-mono text-base font-black text-emerald-700 dark:text-emerald-400">{money(po.total_amount)}</p>
        </div>
        <div className="mt-3 text-end">
            <ReceiveButton po={po} copy={copy} onReceive={onReceive} canReceive={canReceive} />
        </div>
    </article>
);

const OrderRow = ({ po, copy, formatDate, money, onReceive, canReceive }) => (
    <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
        <td className="px-4 py-4">
            <p className="font-mono font-black text-slate-900 dark:text-white">{po.po_number}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{formatDate(po.order_date)} · {copy('lineCount', { count: po.item_count })}</p>
        </td>
        <td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-200">{po.supplier_name}</td>
        <td className="px-4 py-4 font-mono font-black text-slate-900 dark:text-white">{money(po.total_amount)}</td>
        <td className="px-4 py-4"><Status value={po.status} copy={copy} /></td>
        <td className="px-4 py-4 text-end"><ReceiveButton po={po} copy={copy} onReceive={onReceive} canReceive={canReceive} /></td>
    </tr>
);

const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-xs font-bold text-slate-400">{label}</div>;
const ErrorState = ({ copy, onRetry }) => (
    <div role="alert" className="p-10 text-center">
        <PackageSearch size={32} className="mx-auto text-rose-300 dark:text-rose-500" />
        <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-400">{copy('loadError')}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
            {copy('retry')}
        </button>
    </div>
);
const Empty = ({ copy, filtered }) => (
    <div className="p-12 text-center">
        <PackageSearch size={34} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-3 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default PurchaseOrderManager;
