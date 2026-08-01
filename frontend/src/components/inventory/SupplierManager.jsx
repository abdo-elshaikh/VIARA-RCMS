import { useMemo, useState } from 'react';
import { Building2, Mail, MapPin, Pencil, Phone, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreateSupplierMutation, useGetSuppliersQuery, useUpdateSupplierMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';

const emptyForm = { name: '', contactName: '', email: '', phone: '', address: '', taxId: '', status: 'Active' };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-cyan-500 dark:focus:ring-cyan-500/20';

const SupplierManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`inventory.suppliers.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';

    const { data: suppliers = [], isLoading, isError, isFetching, refetch } = useGetSuppliersQuery();
    const [createSupplier, { isLoading: isCreating }] = useCreateSupplierMutation();
    const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation();

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [formOpen, setFormOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [statusTarget, setStatusTarget] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const visibleSuppliers = useMemo(() => {
        const query = search.trim().toLowerCase();
        return suppliers.filter(supplier => {
            if (statusFilter !== 'all' && supplier.status !== statusFilter) return false;
            return !query || [supplier.name, supplier.contact_name, supplier.email, supplier.phone, supplier.tax_id, supplier.address]
                .filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [search, statusFilter, suppliers]);

    const activeCount = suppliers.filter(supplier => supplier.status === 'Active').length;
    const completeCount = suppliers.filter(supplier => supplier.email && supplier.phone && supplier.contact_name).length;
    const busy = isCreating || isUpdating;

    const openCreate = () => { setEditingSupplier(null); setForm(emptyForm); setFormOpen(true); };
    const openEdit = supplier => {
        setEditingSupplier(supplier);
        setForm({
            name: supplier.name || '',
            contactName: supplier.contact_name || '',
            email: supplier.email || '',
            phone: supplier.phone || '',
            address: supplier.address || '',
            taxId: supplier.tax_id || '',
            status: supplier.status || 'Active'
        });
        setFormOpen(true);
    };

    const closeForm = () => { if (!busy) { setFormOpen(false); setEditingSupplier(null); setForm(emptyForm); } };
    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));

    const saveSupplier = async event => {
        event.preventDefault();
        try {
            if (editingSupplier) await updateSupplier({ id: editingSupplier.supplier_id, ...form }).unwrap();
            else await createSupplier(form).unwrap();
            toast.success(copy(editingSupplier ? 'updateSuccess' : 'createSuccess'));
            closeForm();
        } catch (error) {
            toast.error(getErrorMessage(error, copy(editingSupplier ? 'updateError' : 'createError')));
        }
    };

    const changeStatus = async supplier => {
        const nextStatus = supplier.status === 'Active' ? 'Inactive' : 'Active';
        try {
            await updateSupplier({ id: supplier.supplier_id, status: nextStatus }).unwrap();
            toast.success(copy(nextStatus === 'Active' ? 'activated' : 'deactivated'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, copy('statusError')));
            return false;
        }
    };

    const requestStatusChange = async supplier => {
        if (supplier.status === 'Active') setStatusTarget(supplier);
        else await changeStatus(supplier);
    };

    const confirmDeactivate = async () => statusTarget ? changeStatus(statusTarget) : false;
    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return (
        <div className="space-y-6">
            {/* Top Metrics Grid */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <Metric label={copy('total')} value={suppliers.length} />
                <Metric label={copy('active')} value={activeCount} />
                <Metric label={copy('completeProfiles')} value={completeCount} wide />
            </section>

            {/* Supplier Panel */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <header className="flex flex-col gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200 shadow-md dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30">
                            <Building2 size={22} />
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
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>

                        <label>
                            <span className="sr-only">{copy('filterStatus')}</span>
                            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={inputClass}>
                                <option value="all">{copy('allStatuses')}</option>
                                <option value="Active">{copy('statuses.Active')}</option>
                                <option value="Inactive">{copy('statuses.Inactive')}</option>
                            </select>
                        </label>

                        <button type="button" onClick={() => refetch()} disabled={isFetching} aria-label={copy('refresh')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {copy('refresh')}
                        </button>

                        <button type="button" onClick={openCreate} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white shadow-md transition hover:bg-amber-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                            <Plus size={16} />
                            {copy('newSupplier')}
                        </button>
                    </div>
                </header>

                {/* Content */}
                {isLoading ? (
                    <Loading label={copy('loading')} />
                ) : isError ? (
                    <ErrorState copy={copy} onRetry={refetch} />
                ) : visibleSuppliers.length === 0 ? (
                    <Empty copy={copy} filtered={Boolean(search || statusFilter !== 'all')} />
                ) : (
                    <>
                        <div className="grid gap-4 p-5 md:hidden">
                            {visibleSuppliers.map(supplier => (
                                <SupplierCard key={supplier.supplier_id} supplier={supplier} copy={copy} formatDate={formatDate} onEdit={openEdit} onStatus={requestStatusChange} updating={isUpdating} />
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[850px] text-xs">
                                <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                                    <tr>
                                        {['supplier', 'contactDetails', 'status'].map(key => (
                                            <th key={key} className="px-4 py-3.5 text-start text-xs font-black uppercase tracking-wider">{copy(key)}</th>
                                        ))}
                                        <th className="px-4 py-3.5 text-end text-xs font-black uppercase tracking-wider">{copy('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                    {visibleSuppliers.map(supplier => (
                                        <SupplierRow key={supplier.supplier_id} supplier={supplier} copy={copy} formatDate={formatDate} onEdit={openEdit} onStatus={requestStatusChange} updating={isUpdating} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>

            {/* Create/Edit Modal */}
            <Modal isOpen={formOpen} onClose={closeForm} title={copy(editingSupplier ? 'editTitle' : 'createTitle')} size="default">
                <form onSubmit={saveSupplier} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={copy('name')}>
                            <input required maxLength={255} value={form.name} onChange={event => setField('name', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('contactName')}>
                            <input maxLength={255} value={form.contactName} onChange={event => setField('contactName', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('email')}>
                            <input type="email" value={form.email} onChange={event => setField('email', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('phone')}>
                            <input type="tel" maxLength={50} value={form.phone} onChange={event => setField('phone', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('taxId')}>
                            <input maxLength={100} value={form.taxId} onChange={event => setField('taxId', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('status')}>
                            <select value={form.status} onChange={event => setField('status', event.target.value)} className={inputClass}>
                                <option value="Active">{copy('statuses.Active')}</option>
                                <option value="Inactive">{copy('statuses.Inactive')}</option>
                            </select>
                        </Field>
                        <Field label={copy('address')} className="sm:col-span-2">
                            <textarea rows={3} value={form.address} onChange={event => setField('address', event.target.value)} className={`${inputClass} h-auto py-2.5 resize-y`} />
                        </Field>
                    </div>

                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100/80 pt-4 dark:border-white/5 sm:flex-row sm:justify-end">
                        <button type="button" onClick={closeForm} disabled={busy} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5">
                            {copy('cancel')}
                        </button>
                        <button type="submit" disabled={busy} className="rounded-xl bg-amber-700 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-amber-800 disabled:opacity-50">
                            {busy ? copy('saving') : copy('save')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog isOpen={Boolean(statusTarget)} onClose={() => setStatusTarget(null)} onConfirm={confirmDeactivate} title={copy('deactivateTitle')} message={copy('deactivateMessage', { supplier: statusTarget?.name || '' })} confirmLabel={copy('deactivateAction')} cancelLabel={copy('cancel')} isLoading={isUpdating} variant="warning" />
        </div>
    );
};

const Metric = ({ label, value, wide }) => (
    <article className={`rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-lg shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">{value}</p>
    </article>
);

const Field = ({ label, className = '', children }) => (
    <label className={`block ${className}`}>
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const Status = ({ value, copy }) => (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${value === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
        {copy(`statuses.${value}`)}
    </span>
);

const Actions = ({ supplier, copy, onEdit, onStatus, updating }) => (
    <div className="flex flex-wrap justify-end gap-1.5">
        <button type="button" onClick={() => onEdit(supplier)} className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/90 px-3 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
            <Pencil size={13} />
            {copy('edit')}
        </button>
        <button type="button" disabled={updating} onClick={() => onStatus(supplier)} className={`min-h-8 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-50 ${
            supplier.status === 'Active'
                ? 'border-amber-200/80 bg-amber-50/90 text-amber-800 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                : 'border-emerald-200/80 bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
        }`}>
            {copy(supplier.status === 'Active' ? 'deactivate' : 'activate')}
        </button>
    </div>
);

const Contact = ({ supplier, copy }) => (
    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
        <p className="font-bold text-slate-800 dark:text-slate-200">{supplier.contact_name || copy('notSet')}</p>
        {supplier.email && <p className="flex items-center gap-1.5"><Mail size={13} />{supplier.email}</p>}
        {supplier.phone && <p className="flex items-center gap-1.5"><Phone size={13} />{supplier.phone}</p>}
        {supplier.address && <p className="flex items-center gap-1.5"><MapPin size={13} />{supplier.address}</p>}
    </div>
);

const SupplierCard = ({ supplier, copy, formatDate, onEdit, onStatus, updating }) => (
    <article className="rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all dark:border-white/10 dark:bg-slate-900/60">
        <div className="flex items-start justify-between gap-3">
            <div>
                <h3 className="font-black text-slate-900 dark:text-white text-sm">{supplier.name}</h3>
                <p className="mt-0.5 text-xs text-slate-400">{copy('added', { date: formatDate(supplier.created_at) })}</p>
            </div>
            <Status value={supplier.status} copy={copy} />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-100/80 bg-slate-50/70 p-3.5 dark:border-white/5 dark:bg-white/5">
            <Contact supplier={supplier} copy={copy} />
        </div>
        {supplier.tax_id && <p className="mt-3 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">{copy('taxId')}: {supplier.tax_id}</p>}
        <div className="mt-4">
            <Actions supplier={supplier} copy={copy} onEdit={onEdit} onStatus={onStatus} updating={updating} />
        </div>
    </article>
);

const SupplierRow = ({ supplier, copy, formatDate, onEdit, onStatus, updating }) => (
    <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
        <td className="px-4 py-4">
            <p className="font-bold text-slate-900 dark:text-white">{supplier.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">{copy('added', { date: formatDate(supplier.created_at) })}</p>
            {supplier.tax_id && <p className="mt-1 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">{copy('taxId')}: {supplier.tax_id}</p>}
        </td>
        <td className="px-4 py-4"><Contact supplier={supplier} copy={copy} /></td>
        <td className="px-4 py-4"><Status value={supplier.status} copy={copy} /></td>
        <td className="px-4 py-4"><Actions supplier={supplier} copy={copy} onEdit={onEdit} onStatus={onStatus} updating={updating} /></td>
    </tr>
);

const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-xs font-bold text-slate-400">{label}</div>;
const ErrorState = ({ copy, onRetry }) => (
    <div role="alert" className="p-10 text-center">
        <ShieldCheck size={32} className="mx-auto text-rose-300 dark:text-rose-500" />
        <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-400">{copy('loadError')}</p>
        <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
            {copy('retry')}
        </button>
    </div>
);
const Empty = ({ copy, filtered }) => (
    <div className="p-12 text-center">
        <Building2 size={34} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-3 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default SupplierManager;
