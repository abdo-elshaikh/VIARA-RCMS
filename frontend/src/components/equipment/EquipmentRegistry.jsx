import { useCallback, useId, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    ClipboardCheck,
    Eye,
    EyeOff,
    MapPin,
    Network,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Server,
    ShieldAlert,
    ShieldCheck,
    Trash2,
    Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    useCreateMachineMutation,
    useGetEquipmentDowntimeQuery,
    useGetEquipmentMaintenanceQuery,
    useGetMachinesQuery,
    useGetRoomsQuery,
    useGetServiceContractsQuery,
    useDeleteMachineMutation,
    useUpdateMachineMutation,
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../../utils/roles';
import { selectCurrentUser } from '../../store/authSlice';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { MACHINE_TYPES, emptyMachine as emptyForm } from '../../types/equipment';

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const EquipmentRegistry = () => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');
    const user = useSelector(selectCurrentUser);
    const copy = useCallback((key, options) => t(`equipment.registry.${key}`, options), [t]);
    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const permissions = useMemo(() => new Set(user?.permissions || []), [user?.permissions]);
    const hasSystemRole = hasDeveloperOrAdminRole(user?.role);
    const canViewMaintenance = user?.role === 'Admin' || user?.role === 'Technician';
    const canViewContracts = user?.role === 'Admin';
    const canManageEquipment = hasSystemRole || permissions.has('MANAGE_EQUIPMENT');
    const today = new Date().toISOString().substring(0, 10);
    const now = Date.now();
    const warningDate = useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
    }, []);

    const { data: machines = [], isLoading, isError, isFetching, refetch } = useGetMachinesQuery();
    const { data: rooms = [] } = useGetRoomsQuery();
    const { data: maintenance = [] } = useGetEquipmentMaintenanceQuery(undefined, { skip: !canViewMaintenance });
    const { data: downtime = [] } = useGetEquipmentDowntimeQuery();
    const { data: contracts = [] } = useGetServiceContractsQuery(undefined, { skip: !canViewContracts });
    const [createMachine, { isLoading: isCreating }] = useCreateMachineMutation();
    const [deleteMachine] = useDeleteMachineMutation();
    const [updateMachine, { isLoading: isUpdating }] = useUpdateMachineMutation();

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [riskFilter, setRiskFilter] = useState('all');
    const [machineEditor, setMachineEditor] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [showSummary, setShowSummary] = useState(true);
    const [form, setForm] = useState(emptyForm);
    const summaryId = useId();

    const insightByMachine = useMemo(() => {
        const map = new Map();
        const activeDowntime = downtime.filter(record => record.status !== 'Resolved');
        const activeContracts = contracts.filter(contract => contract.status === 'Active');

        machines.forEach(machine => {
            const machineMaintenance = maintenance
                .filter(record => record.modality_id === machine.modality_id && !['Completed', 'Cancelled'].includes(record.status))
                .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
            const nextMaintenance = machineMaintenance[0];
            const machineDowntime = activeDowntime
                .filter(record => record.modality_id === machine.modality_id)
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            const currentDowntime = machineDowntime.find(record => new Date(record.start_time).getTime() <= now && new Date(record.end_time).getTime() >= now);
            const machineContracts = activeContracts
                .filter(contract => contract.modality_id === machine.modality_id)
                .sort((a, b) => new Date(a.end_date) - new Date(b.end_date));
            const contract = machineContracts[0];
            const contractEnd = contract?.end_date ? new Date(contract.end_date) : null;
            const contractExpired = contractEnd ? contractEnd < new Date(today) : false;
            const contractExpiring = contractEnd ? contractEnd <= warningDate && !contractExpired : false;
            const maintenanceOverdue = nextMaintenance?.scheduled_date?.substring(0, 10) < today;
            const incompleteProfile = !machine.serial_number || !machine.location;

            let risk = 'ready';
            let reason = copy('ready');
            if ((machine.status || 'Active') === 'Out of Service' || currentDowntime) {
                risk = 'blocked';
                reason = currentDowntime ? copy('activeDowntime') : copy('statuses.Out of Service');
            } else if ((machine.status || 'Active') === 'Under Maintenance' || maintenanceOverdue || contractExpired || contractExpiring || incompleteProfile) {
                risk = 'watch';
                reason = maintenanceOverdue ? copy('overdueSince', { date: formatDate(nextMaintenance.scheduled_date, locale, copy('notSet')) })
                    : contractExpired ? copy('expiredContract')
                        : contractExpiring ? copy('expiringSoon')
                            : incompleteProfile ? copy('incompleteProfile')
                                : copy('statuses.Under Maintenance');
            }

            map.set(machine.modality_id, { risk, reason, nextMaintenance, downtime: machineDowntime[0], contract });
        });

        return map;
    }, [contracts, copy, downtime, machines, maintenance, now, today, warningDate, locale]);

    const summary = useMemo(() => {
        const insights = machines.map(machine => insightByMachine.get(machine.modality_id));
        return {
            total: machines.length,
            active: machines.filter(machine => (machine.status || 'Active') === 'Active').length,
            maintenance: machines.filter(machine => machine.status === 'Under Maintenance').length,
            attention: insights.filter(insight => insight?.risk === 'watch' || insight?.risk === 'blocked').length,
        };
    }, [insightByMachine, machines]);

    const visibleMachines = useMemo(() => {
        const query = search.trim().toLowerCase();
        return machines.filter(machine => {
            const insight = insightByMachine.get(machine.modality_id);
            if (statusFilter !== 'all' && (machine.status || 'Active') !== statusFilter) return false;
            if (riskFilter !== 'all' && insight?.risk !== riskFilter) return false;
            return !query || [
                machine.name,
                machine.type,
                machine.room_number,
                machine.manufacturer,
                machine.model,
                machine.serial_number,
                machine.location,
                machine.aet,
                machine.ip_address,
                machine.port,
                insight?.reason,
            ].filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [insightByMachine, machines, riskFilter, search, statusFilter]);

    const worklist = useMemo(() => visibleMachines
        .map(machine => ({ machine, insight: insightByMachine.get(machine.modality_id) }))
        .filter(item => item.insight?.risk !== 'ready')
        .sort((a, b) => riskRank(a.insight.risk) - riskRank(b.insight.risk))
        .slice(0, 4), [insightByMachine, visibleMachines]);

    const openCreate = () => {
        if (!canManageEquipment) return;
        setMachineEditor('new');
        setForm(emptyForm);
    };

    const openEdit = machine => {
        if (!canManageEquipment) return;
        setMachineEditor(machine);
        setForm({
            name: machine.name || '',
            type: machine.type || 'MRI',
            roomNumber: machine.room_number || '',
            serialNumber: machine.serial_number || '',
            manufacturer: machine.manufacturer || '',
            model: machine.model || '',
            installationDate: machine.installation_date ? machine.installation_date.substring(0, 10) : '',
            location: machine.location || '',
            status: machine.status || 'Active',
        });
    };

    const closeEditor = () => {
        if (isCreating || isUpdating) return;
        setMachineEditor(null);
        setForm(emptyForm);
    };

    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));

    const handleSave = async event => {
        event.preventDefault();
        if (!canManageEquipment) return;

        const currentMachineId = machineEditor !== 'new' ? machineEditor?.modality_id : null;

        // Anti-duplication check: Machine name
        const duplicateName = machines.some(m =>
            m.name?.trim().toLowerCase() === form.name.trim().toLowerCase() &&
            m.modality_id !== currentMachineId
        );
        if (duplicateName) {
            toast.error(i18n.language.startsWith('ar')
                ? 'يوجد جهاز آخر مسجل بالفعل بنفس الاسم'
                : 'Another machine with this name is already registered.');
            return;
        }

        // Anti-duplication check: Serial number (if provided)
        if (form.serialNumber?.trim()) {
            const duplicateSerial = machines.some(m =>
                m.serial_number?.trim().toLowerCase() === form.serialNumber.trim().toLowerCase() &&
                m.modality_id !== currentMachineId
            );
            if (duplicateSerial) {
                toast.error(i18n.language.startsWith('ar')
                    ? 'الرقم التسلسلي مستخدم بالفعل لجهاز آخر'
                    : 'This serial number is already registered for another machine.');
                return;
            }
        }

        const payload = {
            ...form,
            name: form.name.trim(),
            roomNumber: form.roomNumber.trim() || undefined,
            serialNumber: form.serialNumber.trim() || undefined,
            manufacturer: form.manufacturer.trim() || undefined,
            model: form.model.trim() || undefined,
            installationDate: form.installationDate || undefined,
            location: form.location.trim() || undefined,
        };

        try {
            if (machineEditor === 'new') {
                const { status, ...createPayload } = payload;
                void status;
                await createMachine(createPayload).unwrap();
                toast.success(copy('createSuccess'));
            } else {
                await updateMachine({ id: machineEditor.modality_id, ...payload }).unwrap();
                toast.success(copy('updateSuccess'));
            }
            closeEditor();
        } catch (error) {
            toast.error(getErrorMessage(error, machineEditor === 'new' ? copy('createError') : copy('updateError')));
        }
    };

    const handleDelete = machine => {
        if (!canManageEquipment) return;
        setDeleteTarget(machine);
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteMachine(deleteTarget.modality_id).unwrap();
            toast.success(copy('deleteSuccess'));
            setDeleteTarget(null);
        } catch (error) {
            toast.error(getErrorMessage(error, copy('deleteError')));
        }
    };

    const refresh = () => refetch();
    const saving = isCreating || isUpdating;

    return (
        <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950" aria-label={copy('summaryLabel')}>
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="inline-flex min-w-0 items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300">
                            <Activity size={14} aria-hidden="true" />
                        </span>
                        <span className="truncate">{copy('summaryLabel')}</span>
                    </div>
                    <button
                        type="button"
                        aria-expanded={showSummary}
                        aria-controls={summaryId}
                        onClick={() => setShowSummary(visible => !visible)}
                        className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:border-teal-500/40 hover:bg-teal-500/5 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-teal-300"
                    >
                        {showSummary ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                        <span>{copy(showSummary ? 'hideStats' : 'showStats', { defaultValue: isArabic ? (showSummary ? 'إخفاء الإحصائيات' : 'إظهار الإحصائيات') : (showSummary ? 'Hide statistics' : 'Show statistics') })}</span>
                    </button>
                </div>
                <div id={summaryId} hidden={!showSummary} className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 xl:grid-cols-5">
                    <Metric icon={Server} label={copy('total')} value={summary.total} tone="blue" />
                    <Metric icon={Activity} label={copy('active')} value={summary.active} tone="emerald" />
                    <Metric icon={Wrench} label={copy('maintenance')} value={summary.maintenance} tone="amber" />
                    <Metric icon={Network} label={copy('pacsSynced', { defaultValue: 'PACS synced' })} value={machines.filter(machine => machine.dicom_synced).length} tone="blue" />
                    <Metric icon={AlertTriangle} label={copy('attention')} value={summary.attention} tone="rose" />
                </div>
            </section>

            {worklist.length > 0 && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm dark:border-amber-900/70 dark:bg-amber-400/10">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm dark:bg-slate-900"><ShieldAlert size={18} /></span>
                            <div>
                                <h2 className="font-black text-amber-950 dark:text-amber-100">{copy('worklistTitle')}</h2>
                                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">{copy('worklistDescription')}</p>
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[520px]">
                            {worklist.map(({ machine, insight }) => <WorkItem key={machine.modality_id} machine={machine} insight={insight} copy={copy} onEdit={openEdit} canManage={canManageEquipment} />)}
                        </div>
                    </div>
                </section>
            )}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <header className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/70 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-900"><Server size={19} /></span>
                        <div>
                            <h2 className="font-black text-slate-900 dark:text-white">{copy('title')}</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy('description')}</p>
                        </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_170px_150px_auto_auto] xl:w-auto">
                        <label className="relative min-w-0">
                            <span className="sr-only">{copy('search')}</span>
                            <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy('searchPlaceholder')} className={`${inputClass} ps-10`} />
                        </label>
                        <label>
                            <span className="sr-only">{copy('filterStatus')}</span>
                            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={inputClass}>
                                <option value="all">{copy('allStatuses')}</option>
                                {['Active', 'Under Maintenance', 'Out of Service'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}
                            </select>
                        </label>
                        <label>
                            <span className="sr-only">{copy('filterRisk')}</span>
                            <select value={riskFilter} onChange={event => setRiskFilter(event.target.value)} className={inputClass}>
                                <option value="all">{copy('allRisks')}</option>
                                {['ready', 'watch', 'blocked'].map(risk => <option key={risk} value={risk}>{copy(`risks.${risk}`)}</option>)}
                            </select>
                        </label>
                        <button type="button" onClick={refresh} disabled={isFetching} aria-label={copy('refresh')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />{copy('refresh')}</button>
                        {canManageEquipment && <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-cyan-800"><Plus size={16} />{copy('newMachine')}</button>}
                    </div>
                </header>

                {isLoading ? <Loading label={copy('loading')} /> : isError ? <ErrorState label={copy('loadError')} retry={copy('retry')} onRetry={refetch} /> : visibleMachines.length === 0 ? <Empty filtered={Boolean(search || statusFilter !== 'all' || riskFilter !== 'all')} copy={copy} /> : <>
                    <div className="divide-y divide-slate-100 lg:hidden dark:divide-slate-800">{visibleMachines.map(machine => <MachineCard key={machine.modality_id} machine={machine} insight={insightByMachine.get(machine.modality_id)} copy={copy} locale={locale} onEdit={openEdit} onDelete={handleDelete} canManage={canManageEquipment} />)}</div>
                    <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full min-w-[1140px] text-sm">
                            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                <tr>{['machine', 'identity', 'location', 'availability', 'pacs', 'nextService', 'contract', 'risk'].map(key => <th key={key} className="px-4 py-3 text-start text-xs font-black uppercase tracking-wider">{copy(key, { defaultValue: key === 'pacs' ? 'PACS' : undefined })}</th>)}{canManageEquipment && <th className="px-4 py-3 text-end text-xs font-black uppercase tracking-wider">{copy('actions')}</th>}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {visibleMachines.map(machine => <MachineRow key={machine.modality_id} machine={machine} insight={insightByMachine.get(machine.modality_id)} copy={copy} locale={locale} onEdit={openEdit} onDelete={handleDelete} canManage={canManageEquipment} />)}
                            </tbody>
                        </table>
                    </div>
                </>}
            </section>

            <Modal isOpen={Boolean(machineEditor)} onClose={closeEditor} title={machineEditor === 'new' ? copy('createTitle') : copy('editTitle', { machine: machineEditor?.name || '' })} size="default">
                <form onSubmit={handleSave} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={copy('name')}><input required maxLength={50} value={form.name} onChange={event => setField('name', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('type')}><select required value={form.type} onChange={event => setField('type', event.target.value)} className={inputClass}>{MACHINE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></Field>
                        <Field label={copy('roomNumber')}>
                            <select
                                value={form.roomId || (rooms.find(r => r.room_number === form.roomNumber)?.room_id || '')}
                                onChange={event => {
                                    const selectedId = event.target.value;
                                    const foundRoom = rooms.find(r => r.room_id === selectedId);
                                    setForm(prev => ({
                                        ...prev,
                                        roomId: selectedId,
                                        roomNumber: foundRoom ? foundRoom.room_number : prev.roomNumber,
                                        location: foundRoom?.floor ? (i18n.language.startsWith('ar') ? `الطابق ${foundRoom.floor}` : `Floor ${foundRoom.floor}`) : prev.location
                                    }));
                                }}
                                className={inputClass}
                            >
                                <option value="">{i18n.language.startsWith('ar') ? '— غير محدد / غرفة مخصصة —' : '— Unassigned / Custom Room —'}</option>
                                {rooms.map(r => (
                                    <option key={r.room_id} value={r.room_id}>
                                        {r.name} ({r.room_number}) [{r.type}]
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label={copy('location')}><input maxLength={255} value={form.location} onChange={event => setField('location', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('manufacturer')}><input maxLength={100} value={form.manufacturer} onChange={event => setField('manufacturer', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('model')}><input maxLength={100} value={form.model} onChange={event => setField('model', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('serial')}><input maxLength={100} value={form.serialNumber} onChange={event => setField('serialNumber', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('installed')}><input type="date" value={form.installationDate} onChange={event => setField('installationDate', event.target.value)} className={inputClass} /></Field>
                        {machineEditor !== 'new' && <Field label={copy('status')} className="sm:col-span-2"><select value={form.status} onChange={event => setField('status', event.target.value)} className={inputClass}>{['Active', 'Under Maintenance', 'Out of Service'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}</select></Field>}
                    </div>
                    <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900 dark:border-blue-900 dark:bg-blue-400/10 dark:text-blue-200">{copy('statusHelp')}</p>
                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                        <button type="button" onClick={closeEditor} disabled={saving} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">{copy('cancel')}</button>
                        <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{saving ? copy('saving') : copy(machineEditor === 'new' ? 'create' : 'save')}</button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleConfirmDelete}
                title={copy('deleteConfirmTitle', { defaultValue: isArabic ? 'تأكيد حذف الجهاز' : 'Confirm Machine Deletion' })}
                message={copy('deleteConfirm', { machine: deleteTarget?.name || '' })}
                confirmLabel={copy('delete', { defaultValue: isArabic ? 'حذف' : 'Delete' })}
                cancelLabel={copy('cancel', { defaultValue: isArabic ? 'إلغاء' : 'Cancel' })}
                tone="danger"
            />
        </div>
    );
};

const riskRank = risk => ({ blocked: 0, watch: 1, ready: 2 }[risk] ?? 3);
const formatDate = (value, locale, fallback) => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : fallback;
const tones = { blue: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300', emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300', amber: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300', rose: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300' };
const riskStyles = { ready: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-900', watch: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-900', blocked: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-900' };

const metricTones = {
    blue: 'border-blue-200/80 bg-blue-50/60 text-blue-700 dark:border-blue-900/70 dark:bg-blue-400/[.06] dark:text-blue-300',
    emerald: 'border-emerald-200/80 bg-emerald-50/60 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-400/[.06] dark:text-emerald-300',
    amber: 'border-amber-200/80 bg-amber-50/60 text-amber-700 dark:border-amber-900/70 dark:bg-amber-400/[.06] dark:text-amber-300',
    rose: 'border-rose-200/80 bg-rose-50/60 text-rose-700 dark:border-rose-900/70 dark:bg-rose-400/[.06] dark:text-rose-300',
};
const Metric = ({ icon: Icon, label, value, tone }) => <div className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 ${metricTones[tone] || metricTones.blue}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/80 dark:bg-slate-950/60"><Icon size={14} aria-hidden="true" /></span><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</span><strong className="shrink-0 text-base font-black tabular-nums text-slate-950 dark:text-white">{value}</strong></div>;
const Field = ({ label, className = '', children }) => <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>{children}</label>;
const Status = ({ status = 'Active', copy }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status === 'Active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : status === 'Under Maintenance' ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300'}`}>{copy(`statuses.${status}`)}</span>;
const PacsBadge = ({ machine, copy }) => {
    const configured = Boolean(machine.aet && machine.ip_address && machine.port);
    const tone = machine.dicom_synced ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
        : configured ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    const label = machine.dicom_synced
        ? copy('pacsSynced', { defaultValue: 'PACS synced' })
        : configured
            ? copy('pacsNeedsSync', { defaultValue: 'Needs PACS sync' })
            : copy('pacsNotConfigured', { defaultValue: 'No DICOM' });
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>;
};
const RiskBadge = ({ insight, copy }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${riskStyles[insight?.risk || 'ready']}`}>{copy(`risks.${insight?.risk || 'ready'}`)}</span>;
const ServiceInfo = ({ insight, copy, locale }) => insight?.nextMaintenance ? <span className={insight.nextMaintenance.scheduled_date?.substring(0, 10) < new Date().toISOString().substring(0, 10) ? 'font-bold text-rose-700 dark:text-rose-300' : ''}>{copy(`maintenanceTypes.${insight.nextMaintenance.maintenance_type}`)} <span aria-hidden="true">&bull;</span> {formatDate(insight.nextMaintenance.scheduled_date, locale, copy('notSet'))}</span> : <span className="text-slate-400">{copy('notScheduled')}</span>;
const ContractInfo = ({ insight, copy, locale }) => insight?.contract ? <span>{copy('contractUntil', { date: formatDate(insight.contract.end_date, locale, copy('notSet')) })}</span> : <span className="text-slate-400">{copy('noContract')}</span>;
const WorkItem = ({ machine, insight, copy, onEdit, canManage }) => {
    const content = <><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-black text-slate-900 dark:text-white">{machine.name}</p><RiskBadge insight={insight} copy={copy} /></div><p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{insight.reason}</p></>;
    return canManage ? <button type="button" onClick={() => onEdit(machine)} className="rounded-xl border border-amber-200 bg-white p-3 text-start transition hover:border-amber-400 hover:shadow-sm dark:border-amber-900 dark:bg-slate-950">{content}</button> : <article className="rounded-xl border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-950">{content}</article>;
};
const MachineCard = ({ machine, insight, copy, locale, onEdit, onDelete, canManage }) => <article className="px-4 py-3"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-900 dark:text-white">{machine.name}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{machine.type}{machine.room_number ? <> <span aria-hidden="true">&bull;</span> {copy('room', { room: machine.room_number })}</> : null}</p></div><RiskBadge insight={insight} copy={copy} /></div><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-900"><Info label={copy('availability')} value={<Status status={machine.status} copy={copy} />} /><Info label={copy('pacs', { defaultValue: 'PACS' })} value={<PacsBadge machine={machine} copy={copy} />} /><Info label={copy('identity')} value={[machine.manufacturer, machine.model].filter(Boolean).join(' ') || copy('notSet')} /><Info label={copy('location')} value={machine.location || copy('notSet')} /><Info label={copy('serial')} value={machine.serial_number || copy('notSet')} /><Info label={copy('nextService')} value={<ServiceInfo insight={insight} copy={copy} locale={locale} />} /><Info label={copy('contract')} value={<ContractInfo insight={insight} copy={copy} locale={locale} />} /></dl>{canManage && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onEdit(machine)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-sm font-bold text-blue-800 dark:border-blue-900 dark:bg-blue-400/10 dark:text-blue-200"><Pencil size={14} />{copy('edit')}</button><button type="button" onClick={() => onDelete(machine)} aria-label={copy('deleteMachine', { machine: machine.name })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-400/10 dark:text-rose-300"><Trash2 size={14} />{copy('delete')}</button></div>}</article>;
const MachineRow = ({ machine, insight, copy, locale, onEdit, onDelete, canManage }) => <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-900/60"><td className="px-4 py-4"><p className="font-black text-slate-900 dark:text-white">{machine.name}</p><p className="mt-1 text-xs text-slate-500">{machine.type}{machine.room_number ? <> <span aria-hidden="true">&bull;</span> {copy('room', { room: machine.room_number })}</> : null}</p></td><td className="px-4 py-4"><p className="font-semibold text-slate-700 dark:text-slate-200">{[machine.manufacturer, machine.model].filter(Boolean).join(' ') || copy('notSet')}</p><p className="mt-1 font-mono text-xs text-slate-500">{copy('serialShort')}: {machine.serial_number || copy('notSet')}</p></td><td className="px-4 py-4 text-slate-600 dark:text-slate-300"><span className="inline-flex items-center gap-1.5"><MapPin size={14} />{machine.location || copy('notSet')}</span></td><td className="px-4 py-4"><Status status={machine.status} copy={copy} /></td><td className="px-4 py-4"><PacsBadge machine={machine} copy={copy} /><p className="mt-1 max-w-[160px] truncate font-mono text-xs text-slate-500">{machine.aet || machine.ip_address ? [machine.aet, machine.ip_address, machine.port].filter(Boolean).join(' / ') : copy('notSet')}</p></td><td className="px-4 py-4 text-slate-600 dark:text-slate-300"><ServiceInfo insight={insight} copy={copy} locale={locale} /></td><td className="px-4 py-4 text-slate-600 dark:text-slate-300"><ContractInfo insight={insight} copy={copy} locale={locale} /></td><td className="px-4 py-4"><RiskBadge insight={insight} copy={copy} /><p className="mt-1 max-w-[180px] text-xs text-slate-500">{insight?.reason}</p></td>{canManage && <td className="px-4 py-4 text-end"><div className="flex justify-end gap-1"><button type="button" onClick={() => onEdit(machine)} aria-label={copy('editMachine', { machine: machine.name })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-400/10 dark:hover:text-blue-300"><Pencil size={16} /></button><button type="button" onClick={() => onDelete(machine)} aria-label={copy('deleteMachine', { machine: machine.name })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"><Trash2 size={16} /></button></div></td>}</tr>;
const Info = ({ label, value }) => <div><dt className="text-slate-400">{label}</dt><dd className="mt-1 font-bold text-slate-700 dark:text-slate-200">{value}</dd></div>;
const Loading = ({ label }) => <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{label}</div>;
const ErrorState = ({ label, retry, onRetry }) => <div role="alert" className="p-10 text-center"><ShieldCheck size={32} className="mx-auto text-rose-300" /><p className="mt-3 text-sm font-semibold text-rose-600">{label}</p><button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">{retry}</button></div>;
const Empty = ({ filtered, copy }) => <div className="p-12 text-center"><ClipboardCheck size={34} className="mx-auto text-slate-300" /><p className="mt-3 font-black text-slate-800 dark:text-white">{copy(filtered ? 'filteredEmpty' : 'empty')}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p></div>;

export default EquipmentRegistry;
