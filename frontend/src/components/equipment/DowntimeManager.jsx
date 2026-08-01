import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart2, CheckCircle2, Clock, Plus, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    useCreateEquipmentDowntimeMutation,
    useGetEquipmentDowntimeQuery,
    useGetMachinesQuery,
    useGetUtilizationReportQuery,
    useUpdateEquipmentDowntimeMutation,
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../../utils/roles';
import { selectCurrentUser } from '../../store/authSlice';
import TextPromptDialog from '../ui/TextPromptDialog';

const emptyForm = { modalityId: '', startTime: '', endTime: '', reason: '', status: 'Planned' };
const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10';

const DowntimeManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const user = useSelector(selectCurrentUser);
    const copy = (key, options) => t(`equipment.downtime.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const canViewUtilization = hasDeveloperOrAdminRole(user?.role) || user?.role === 'Receptionist';
    const { data: machines = [], isLoading: machinesLoading } = useGetMachinesQuery();
    const { data: records = [], isLoading, isError, refetch, isFetching } = useGetEquipmentDowntimeQuery();
    const { data: utilization = [], isLoading: utilizationLoading, isError: utilizationError } = useGetUtilizationReportQuery(undefined, { skip: !canViewUtilization });
    const [createRecord, { isLoading: isCreating }] = useCreateEquipmentDowntimeMutation();
    const [updateRecord, { isLoading: isResolving }] = useUpdateEquipmentDowntimeMutation();
    const [showNew, setShowNew] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [resolveTarget, setResolveTarget] = useState(null);

    const activeRecords = useMemo(() => records.filter(record => record.status !== 'Resolved'), [records]);
    const summary = useMemo(() => ({
        active: activeRecords.length,
        unplanned: activeRecords.filter(record => record.status === 'Unplanned').length,
        affected: new Set(activeRecords.map(record => record.modality_id)).size,
        averageUtilization: utilization.length
            ? Math.round(utilization.reduce((total, row) => {
                const uptime = Math.max(0, Number(row.total_available_hours || 0) - Number(row.downtime_hours || 0));
                return total + (uptime > 0 ? Math.min(100, Number(row.scheduled_hours || 0) / uptime * 100) : 0);
            }, 0) / utilization.length)
            : 0,
    }), [activeRecords, utilization]);

    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));
    const closeForm = () => { setShowNew(false); setForm(emptyForm); };

    const handleCreate = async event => {
        event.preventDefault();
        const start = new Date(form.startTime);
        const end = new Date(form.endTime);
        if (end <= start) {
            toast.error(copy('endAfterStart'));
            return;
        }
        try {
            await createRecord({ ...form, startTime: start.toISOString(), endTime: end.toISOString() }).unwrap();
            toast.success(copy('createSuccess'));
            closeForm();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };

    const handleResolve = async notes => {
        if (!resolveTarget) return false;
        try {
            await updateRecord({ id: resolveTarget.downtime_id, status: 'Resolved', resolutionNotes: notes }).unwrap();
            toast.success(copy('resolveSuccess'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, copy('resolveError')));
            return false;
        }
    };

    const formatDateTime = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    };

    return (
        <div className="space-y-5">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label={copy('summaryLabel')}>
                <Metric icon={AlertTriangle} label={copy('active')} value={summary.active} tone="rose" />
                <Metric icon={Activity} label={copy('unplanned')} value={summary.unplanned} tone="amber" />
                <Metric icon={Clock} label={copy('affected')} value={summary.affected} tone="cyan" />
                <Metric icon={BarChart2} label={copy('averageUtilization')} value={`${summary.averageUtilization}%`} tone="blue" />
            </section>

            <div className={`grid items-start gap-5 ${canViewUtilization ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <header className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-100"><AlertTriangle size={19} /></span><div><h2 className="font-black text-slate-900">{copy('title')}</h2><p className="mt-1 text-sm text-slate-500">{copy('description')}</p></div></div>
                        <div className="flex gap-2"><button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />{copy('refresh')}</button><button type="button" onClick={() => setShowNew(value => !value)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-cyan-800 sm:flex-none">{showNew ? <X size={16} /> : <Plus size={16} />}{showNew ? copy('closeForm') : copy('log')}</button></div>
                    </header>

                    {showNew && <form onSubmit={handleCreate} className="grid gap-4 border-b border-rose-100 bg-rose-50/40 p-5 sm:grid-cols-2">
                        <Field label={copy('machine')}><select required disabled={machinesLoading} value={form.modalityId} onChange={event => setField('modalityId', event.target.value)} className={inputClass}><option value="">{copy('selectMachine')}</option>{machines.map(machine => <option key={machine.modality_id} value={machine.modality_id}>{machine.name}</option>)}</select></Field>
                        <Field label={copy('type')}><select required value={form.status} onChange={event => setField('status', event.target.value)} className={inputClass}><option value="Planned">{copy('planned')}</option><option value="Unplanned">{copy('unplannedType')}</option></select></Field>
                        <Field label={copy('start')}><input type="datetime-local" required value={form.startTime} onChange={event => setField('startTime', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('end')}><input type="datetime-local" required min={form.startTime || undefined} value={form.endTime} onChange={event => setField('endTime', event.target.value)} className={inputClass} /></Field>
                        <Field label={copy('reason')} className="sm:col-span-2"><textarea required maxLength={255} rows={3} value={form.reason} onChange={event => setField('reason', event.target.value)} placeholder={copy('reasonPlaceholder')} className={`${inputClass} resize-y`} /></Field>
                        <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeForm} disabled={isCreating} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-white disabled:opacity-50">{copy('cancel')}</button><button type="submit" disabled={isCreating} className="min-h-11 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white shadow-lg shadow-rose-600/15 hover:bg-rose-700 disabled:opacity-50">{isCreating ? copy('logging') : copy('save')}</button></div>
                    </form>}

                    {isLoading ? <Loading label={copy('loading')} /> : isError ? <ErrorState label={copy('loadError')} retry={copy('retry')} onRetry={refetch} /> : records.length === 0 ? <Empty title={copy('empty')} description={copy('emptyDescription')} /> : <>
                        <div className="divide-y divide-slate-100 md:hidden">{records.map(record => <DowntimeCard key={record.downtime_id} record={record} copy={copy} formatDateTime={formatDateTime} onResolve={setResolveTarget} resolving={isResolving} />)}</div>
                        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr>{['machine', 'window', 'reason', 'status'].map(key => <th key={key} className="px-4 py-3 text-start text-xs font-black uppercase tracking-wider">{copy(key)}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{records.map(record => <DowntimeRow key={record.downtime_id} record={record} copy={copy} formatDateTime={formatDateTime} onResolve={setResolveTarget} resolving={isResolving} />)}</tbody></table></div>
                    </>}
                </section>

                {canViewUtilization && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <header className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/70 p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><BarChart2 size={19} /></span><div><h2 className="font-black text-slate-900">{copy('utilizationTitle')}</h2><p className="mt-1 text-sm text-slate-500">{copy('utilizationDescription')}</p></div></header>
                    {utilizationLoading ? <Loading label={copy('utilizationLoading')} /> : utilizationError ? <p role="alert" className="p-6 text-sm font-semibold text-rose-600">{copy('utilizationError')}</p> : utilization.length === 0 ? <Empty title={copy('noUtilization')} description={copy('noUtilizationDescription')} /> : <div className="space-y-3 p-4">{utilization.map(row => <UtilizationCard key={row.modality_id} row={row} copy={copy} locale={locale} />)}</div>}
                </section>}
            </div>

            <TextPromptDialog isOpen={Boolean(resolveTarget)} onClose={() => setResolveTarget(null)} onConfirm={handleResolve} title={copy('resolveTitle')} message={copy('resolveDescription', { machine: resolveTarget?.modality_name || '' })} label={copy('resolutionNotes')} placeholder={copy('resolutionPlaceholder')} confirmLabel={copy('confirmResolve')} cancelLabel={copy('cancel')} validationMessage={copy('resolutionRequired')} inputProps={{ maxLength: 500 }} isLoading={isResolving} />
        </div>
    );
};

const Metric = ({ icon: Icon, label, value, tone }) => { const tones = { rose: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-700', cyan: 'bg-cyan-50 text-cyan-700', blue: 'bg-blue-50 text-blue-700' }; return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-black uppercase leading-4 tracking-wider text-slate-400">{label}</p><span className={`hidden h-9 w-9 items-center justify-center rounded-xl sm:flex ${tones[tone]}`}><Icon size={17} /></span></div><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></article>; };
const Field = ({ label, className = '', children }) => <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
const Status = ({ value, copy }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${value === 'Resolved' ? 'bg-emerald-50 text-emerald-700' : value === 'Unplanned' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{copy(`statuses.${value}`)}</span>;
const ResolveButton = ({ record, copy, onResolve, resolving }) => record.status === 'Resolved' ? null : <button type="button" onClick={() => onResolve(record)} disabled={resolving} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"><CheckCircle2 size={13} />{copy('resolve')}</button>;
const DowntimeCard = ({ record, copy, formatDateTime, onResolve, resolving }) => <article className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-900">{record.modality_name}</h3><p className="mt-1 text-xs text-slate-500">{formatDateTime(record.start_time)}</p></div><Status value={record.status} copy={copy} /></div><p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{record.reason}</p>{record.resolution_notes && <p className="mt-2 text-xs font-semibold text-emerald-700">{copy('resolution')}: {record.resolution_notes}</p>}<ResolveButton record={record} copy={copy} onResolve={onResolve} resolving={resolving} /></article>;
const DowntimeRow = ({ record, copy, formatDateTime, onResolve, resolving }) => <tr className="align-top hover:bg-slate-50/60"><td className="px-4 py-4 font-bold text-slate-900">{record.modality_name}</td><td className="px-4 py-4 text-xs leading-6 text-slate-600"><div>{copy('startShort')}: {formatDateTime(record.start_time)}</div><div>{copy('endShort')}: {formatDateTime(record.end_time)}</div></td><td className="max-w-sm px-4 py-4 text-slate-700"><p>{record.reason}</p>{record.resolution_notes && <p className="mt-1 text-xs font-semibold text-emerald-700">{copy('resolution')}: {record.resolution_notes}</p>}</td><td className="px-4 py-4"><Status value={record.status} copy={copy} /><ResolveButton record={record} copy={copy} onResolve={onResolve} resolving={resolving} /></td></tr>;
const UtilizationCard = ({ row, copy, locale }) => { const available = Number(row.total_available_hours || 0); const downtime = Number(row.downtime_hours || 0); const scheduled = Number(row.scheduled_hours || 0); const uptime = Math.max(0, available - downtime); const percentage = uptime > 0 ? Math.min(100, scheduled / uptime * 100) : 0; const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value); return <article className="rounded-xl border border-slate-100 p-4"><div className="flex items-center justify-between gap-3"><h3 className="truncate text-sm font-black text-slate-900">{row.name}</h3><span className="text-xs font-black text-blue-700">{number(percentage)}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: `${percentage}%` }} /></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">{copy('scheduled')}</dt><dd className="mt-1 font-black text-slate-800">{copy('hours', { value: number(scheduled) })}</dd></div><div className="rounded-lg bg-rose-50 p-2"><dt className="text-rose-600">{copy('downtimeHours')}</dt><dd className="mt-1 font-black text-rose-800">{copy('hours', { value: number(downtime) })}</dd></div></dl></article>; };
const Loading = ({ label }) => <div className="animate-pulse p-10 text-center text-sm font-bold text-slate-400">{label}</div>;
const ErrorState = ({ label, retry, onRetry }) => <div role="alert" className="p-8 text-center"><p className="text-sm font-semibold text-rose-600">{label}</p><button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700">{retry}</button></div>;
const Empty = ({ title, description }) => <div className="p-8 text-center"><CheckCircle2 size={32} className="mx-auto text-emerald-400" /><p className="mt-3 font-black text-slate-800">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div>;

export default DowntimeManager;
