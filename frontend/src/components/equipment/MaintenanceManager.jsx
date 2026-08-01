import { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, FileText, Plus, RefreshCw, Wrench, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    useCreateEquipmentMaintenanceMutation,
    useCreateServiceContractMutation,
    useGetEquipmentMaintenanceQuery,
    useGetMachinesQuery,
    useGetServiceContractsQuery,
    useUpdateEquipmentMaintenanceMutation,
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../../utils/roles';
import { selectCurrentUser } from '../../store/authSlice';
import Modal from '../ui/Modal';

const emptyMaintenance = { modalityId: '', maintenanceType: 'Routine', scheduledDate: '', performedBy: '', cost: '', notes: '' };
const emptyContract = { modalityId: '', providerName: '', contactInfo: '', startDate: '', endDate: '', cost: '', status: 'Active', notes: '' };
const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10';

const MaintenanceManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const user = useSelector(selectCurrentUser);
    const copy = (key, options) => t(`equipment.maintenance.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const canManageContracts = hasDeveloperOrAdminRole(user?.role);
    const { data: machines = [], isLoading: machinesLoading } = useGetMachinesQuery();
    const { data: records = [], isLoading, isError, isFetching, refetch } = useGetEquipmentMaintenanceQuery();
    const { data: contracts = [], isLoading: contractsLoading, isError: contractsError, refetch: refetchContracts } = useGetServiceContractsQuery(undefined, { skip: !canManageContracts });
    const [createRecord, { isLoading: isCreating }] = useCreateEquipmentMaintenanceMutation();
    const [updateRecord, { isLoading: isUpdating }] = useUpdateEquipmentMaintenanceMutation();
    const [createContract, { isLoading: isCreatingContract }] = useCreateServiceContractMutation();
    const [showNew, setShowNew] = useState(false);
    const [contractOpen, setContractOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [form, setForm] = useState(emptyMaintenance);
    const [contractForm, setContractForm] = useState(emptyContract);

    const today = new Date().toISOString().substring(0, 10);
    const activeContracts = useMemo(() => contracts.filter(contract => contract.status === 'Active'), [contracts]);
    const visibleRecords = useMemo(() => records.filter(record => statusFilter === 'all' || record.status === statusFilter), [records, statusFilter]);
    const summary = useMemo(() => ({
        scheduled: records.filter(record => record.status === 'Scheduled').length,
        inProgress: records.filter(record => record.status === 'In Progress').length,
        overdue: records.filter(record => record.status === 'Scheduled' && record.scheduled_date?.substring(0, 10) < today).length,
        contracts: activeContracts.length,
    }), [activeContracts.length, records, today]);

    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));
    const setContractField = (field, value) => setContractForm(current => ({ ...current, [field]: value }));
    const closeMaintenanceForm = () => { setShowNew(false); setForm(emptyMaintenance); };
    const closeContractForm = () => { if (!isCreatingContract) { setContractOpen(false); setContractForm(emptyContract); } };

    const handleCreate = async event => {
        event.preventDefault();
        try {
            await createRecord({
                ...form,
                performedBy: form.performedBy.trim() || undefined,
                cost: form.cost ? Number(form.cost) : undefined,
            }).unwrap();
            toast.success(copy('createSuccess'));
            closeMaintenanceForm();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };
    const handleStatusChange = async (record, status) => {
        try {
            await updateRecord({ id: record.maintenance_id, status, completedDate: status === 'Completed' ? today : undefined }).unwrap();
            toast.success(copy('statusSuccess'));
        } catch (error) {
            toast.error(getErrorMessage(error, copy('statusError')));
        }
    };
    const handleContractCreate = async event => {
        event.preventDefault();
        if (!canManageContracts) return;
        if (contractForm.endDate < contractForm.startDate) {
            toast.error(copy('contractDateError'));
            return;
        }
        try {
            await createContract({ ...contractForm, cost: contractForm.cost ? Number(contractForm.cost) : undefined }).unwrap();
            toast.success(copy('contractSuccess'));
            closeContractForm();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('contractError')));
        }
    };
    const refreshAll = () => {
        refetch();
        if (canManageContracts) refetchContracts();
    };
    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
    const formatMoney = value => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(Number(value || 0));

    return (
        <div className="space-y-5">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label={copy('summaryLabel')}>
                <Metric icon={Calendar} label={copy('scheduled')} value={summary.scheduled} tone="blue" />
                <Metric icon={Wrench} label={copy('inProgress')} value={summary.inProgress} tone="amber" />
                <Metric icon={AlertTriangle} label={copy('overdue')} value={summary.overdue} tone="rose" />
                <Metric icon={FileText} label={copy('activeContracts')} value={summary.contracts} tone="emerald" />
            </section>

            <div className={`grid items-start gap-5 ${canManageContracts ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <header className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100"><Wrench size={19} /></span><div><h2 className="font-black text-slate-900">{copy('title')}</h2><p className="mt-1 text-sm text-slate-500">{copy('description')}</p></div></div><div className="flex flex-col gap-2 sm:flex-row"><label><span className="sr-only">{copy('filterStatus')}</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={inputClass}><option value="all">{copy('allStatuses')}</option>{['Scheduled', 'In Progress', 'Completed', 'Cancelled'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}</select></label><button type="button" onClick={refreshAll} disabled={isFetching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />{copy('refresh')}</button><button type="button" onClick={() => setShowNew(value => !value)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-cyan-800">{showNew ? <X size={16} /> : <Plus size={16} />}{showNew ? copy('closeForm') : copy('schedule')}</button></div></header>

                    {showNew && <form onSubmit={handleCreate} className="grid gap-4 border-b border-amber-100 bg-amber-50/40 p-5 sm:grid-cols-2"><Field label={copy('machine')}><select required disabled={machinesLoading} value={form.modalityId} onChange={event => setField('modalityId', event.target.value)} className={inputClass}><option value="">{copy('selectMachine')}</option>{machines.map(machine => <option key={machine.modality_id} value={machine.modality_id}>{machine.name} ({machine.type})</option>)}</select></Field><Field label={copy('type')}><select required value={form.maintenanceType} onChange={event => setField('maintenanceType', event.target.value)} className={inputClass}>{['Routine', 'Repair', 'Calibration', 'Inspection'].map(type => <option key={type} value={type}>{copy(`types.${type}`)}</option>)}</select></Field><Field label={copy('scheduledDate')}><input type="date" required value={form.scheduledDate} onChange={event => setField('scheduledDate', event.target.value)} className={inputClass} /></Field><Field label={copy('performedBy')}><input maxLength={255} value={form.performedBy} onChange={event => setField('performedBy', event.target.value)} placeholder={copy('performedByPlaceholder')} className={inputClass} /></Field><Field label={copy('cost')}><input type="number" min="0" step="0.01" value={form.cost} onChange={event => setField('cost', event.target.value)} className={inputClass} /></Field><Field label={copy('notes')}><input maxLength={500} value={form.notes} onChange={event => setField('notes', event.target.value)} placeholder={copy('notesPlaceholder')} className={inputClass} /></Field><div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeMaintenanceForm} disabled={isCreating} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-white disabled:opacity-50">{copy('cancel')}</button><button type="submit" disabled={isCreating} className="min-h-11 rounded-xl bg-amber-600 px-5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50">{isCreating ? copy('saving') : copy('saveSchedule')}</button></div></form>}

                    {isLoading ? <Loading label={copy('loading')} /> : isError ? <ErrorState label={copy('loadError')} retry={copy('retry')} onRetry={refetch} /> : visibleRecords.length === 0 ? <Empty title={copy(statusFilter === 'all' ? 'empty' : 'filteredEmpty')} description={copy(statusFilter === 'all' ? 'emptyDescription' : 'filteredEmptyDescription')} /> : <><div className="divide-y divide-slate-100 md:hidden">{visibleRecords.map(record => <MaintenanceCard key={record.maintenance_id} record={record} copy={copy} formatDate={formatDate} formatMoney={formatMoney} onStatus={handleStatusChange} updating={isUpdating} />)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[860px] text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr>{['machine', 'type', 'scheduledDate', 'cost', 'status'].map(key => <th key={key} className="px-4 py-3 text-start text-xs font-black uppercase tracking-wider">{copy(key)}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visibleRecords.map(record => <MaintenanceRow key={record.maintenance_id} record={record} copy={copy} formatDate={formatDate} formatMoney={formatMoney} onStatus={handleStatusChange} updating={isUpdating} />)}</tbody></table></div></>}
                </section>

                {canManageContracts && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><FileText size={19} /></span><div><h2 className="font-black text-slate-900">{copy('contractsTitle')}</h2><p className="mt-1 text-sm text-slate-500">{copy('contractsDescription')}</p></div></div><button type="button" onClick={() => setContractOpen(true)} aria-label={copy('addContract')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-white hover:bg-indigo-800"><Plus size={16} /></button></header>{contractsLoading ? <Loading label={copy('contractsLoading')} /> : contractsError ? <ErrorState label={copy('contractsError')} retry={copy('retry')} onRetry={refetchContracts} /> : activeContracts.length === 0 ? <Empty title={copy('noContracts')} description={copy('noContractsDescription')} /> : <div className="space-y-3 p-4">{activeContracts.map(contract => <ContractCard key={contract.contract_id} contract={contract} copy={copy} formatDate={formatDate} formatMoney={formatMoney} />)}</div>}</section>}
            </div>

            {canManageContracts && <Modal isOpen={contractOpen} onClose={closeContractForm} title={copy('newContractTitle')} size="default"><form onSubmit={handleContractCreate} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label={copy('machine')}><select required disabled={machinesLoading} value={contractForm.modalityId} onChange={event => setContractField('modalityId', event.target.value)} className={inputClass}><option value="">{copy('selectMachine')}</option>{machines.map(machine => <option key={machine.modality_id} value={machine.modality_id}>{machine.name}</option>)}</select></Field><Field label={copy('provider')}><input required maxLength={255} value={contractForm.providerName} onChange={event => setContractField('providerName', event.target.value)} className={inputClass} /></Field><Field label={copy('contact')}><input maxLength={255} value={contractForm.contactInfo} onChange={event => setContractField('contactInfo', event.target.value)} className={inputClass} /></Field><Field label={copy('cost')}><input type="number" min="0" step="0.01" value={contractForm.cost} onChange={event => setContractField('cost', event.target.value)} className={inputClass} /></Field><Field label={copy('startDate')}><input type="date" required value={contractForm.startDate} onChange={event => setContractField('startDate', event.target.value)} className={inputClass} /></Field><Field label={copy('endDate')}><input type="date" required min={contractForm.startDate || undefined} value={contractForm.endDate} onChange={event => setContractField('endDate', event.target.value)} className={inputClass} /></Field><Field label={copy('contractNotes')} className="sm:col-span-2"><textarea rows={3} value={contractForm.notes} onChange={event => setContractField('notes', event.target.value)} className={`${inputClass} resize-y`} /></Field></div><div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={closeContractForm} disabled={isCreatingContract} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">{copy('cancel')}</button><button type="submit" disabled={isCreatingContract} className="min-h-11 rounded-xl bg-indigo-700 px-5 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-50">{isCreatingContract ? copy('contractSaving') : copy('saveContract')}</button></div></form></Modal>}
        </div>
    );
};

const tones = { blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700', emerald: 'bg-emerald-50 text-emerald-700' };
const Metric = ({ icon: Icon, label, value, tone }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-black uppercase leading-4 tracking-wider text-slate-400">{label}</p><span className={`hidden h-9 w-9 items-center justify-center rounded-xl sm:flex ${tones[tone]}`}><Icon size={17} /></span></div><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></article>;
const Field = ({ label, className = '', children }) => <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
const StatusSelect = ({ record, copy, onStatus, updating }) => <select aria-label={copy('statusFor', { machine: record.modality_name })} disabled={updating} value={record.status} onChange={event => onStatus(record, event.target.value)} className={`min-h-9 rounded-lg border px-2 text-xs font-bold outline-none disabled:opacity-50 ${record.status === 'Completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : record.status === 'In Progress' ? 'border-amber-200 bg-amber-50 text-amber-700' : record.status === 'Cancelled' ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{['Scheduled', 'In Progress', 'Completed', 'Cancelled'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}</select>;
const MaintenanceCard = ({ record, copy, formatDate, formatMoney, onStatus, updating }) => <article className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-900">{record.modality_name}</h3><p className="mt-1 text-xs text-slate-500">{copy(`types.${record.maintenance_type}`)}</p></div><StatusSelect record={record} copy={copy} onStatus={onStatus} updating={updating} /></div><div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700"><span className="inline-flex items-center gap-2"><Calendar size={14} />{formatDate(record.scheduled_date)}</span>{record.performed_by && <><span aria-hidden="true">&bull;</span><span>{record.performed_by}</span></>}{Number(record.cost || 0) > 0 && <><span aria-hidden="true">&bull;</span><span>{formatMoney(record.cost)}</span></>}</div>{record.notes && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{record.notes}</p>}</article>;
const MaintenanceRow = ({ record, copy, formatDate, formatMoney, onStatus, updating }) => <tr className="hover:bg-slate-50/60"><td className="px-4 py-4 font-black text-slate-900">{record.modality_name}</td><td className="px-4 py-4"><p className="font-semibold text-slate-700">{copy(`types.${record.maintenance_type}`)}</p>{record.performed_by && <p className="mt-1 text-xs font-semibold text-slate-500">{record.performed_by}</p>}{record.notes && <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{record.notes}</p>}</td><td className="px-4 py-4 text-slate-600">{formatDate(record.scheduled_date)}</td><td className="px-4 py-4 text-slate-600">{Number(record.cost || 0) > 0 ? formatMoney(record.cost) : '-'}</td><td className="px-4 py-4"><StatusSelect record={record} copy={copy} onStatus={onStatus} updating={updating} /></td></tr>;
const ContractCard = ({ contract, copy, formatDate, formatMoney }) => <article className="rounded-xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">{contract.modality_name}</h3><p className="mt-1 text-xs font-semibold text-slate-600">{contract.provider_name}</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{copy('contractActive')}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-400">{copy('expires')}</dt><dd className="mt-1 font-bold text-slate-700">{formatDate(contract.end_date)}</dd></div><div><dt className="text-slate-400">{copy('cost')}</dt><dd className="mt-1 font-bold text-slate-700">{formatMoney(contract.cost)}</dd></div></dl>{contract.contact_info && <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{contract.contact_info}</p>}</article>;
const Loading = ({ label }) => <div className="animate-pulse p-10 text-center text-sm font-bold text-slate-400">{label}</div>;
const ErrorState = ({ label, retry, onRetry }) => <div role="alert" className="p-8 text-center"><p className="text-sm font-semibold text-rose-600">{label}</p><button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">{retry}</button></div>;
const Empty = ({ title, description }) => <div className="p-8 text-center"><CheckCircle2 size={32} className="mx-auto text-emerald-400" /><p className="mt-3 font-black text-slate-800">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div>;

export default MaintenanceManager;
