import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Award, BadgeCheck, CalendarClock, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    useCreateStaffCredentialMutation,
    useDeleteStaffCredentialMutation,
    useGetEmployeeProfilesQuery,
    useGetStaffCredentialsQuery,
    useUpdateStaffCredentialMutation
} from '../../store/api';
import ConfirmDialog from '../ui/ConfirmDialog';
import { getErrorMessage } from '../../utils/getErrorMessage';

const emptyForm = { userId: '', credentialType: '', credentialNumber: '', issuingAuthority: '', issuedDate: '', expiresAt: '', notes: '' };

const daysLeft = (date) => Math.ceil((new Date(date) - Date.now()) / (24 * 60 * 60 * 1000));

const CredentialsManager = () => {
    const { t } = useTranslation('workspace');
    const [form, setForm] = useState(emptyForm);
    const [editTarget, setEditTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [filter, setFilter] = useState('all');

    const { data: credentials = [], isFetching, refetch } = useGetStaffCredentialsQuery(filter === 'expiring' ? { expiringWithinDays: 30 } : {});
    const { data: allCredentials = [] } = useGetStaffCredentialsQuery();
    const { data: staffProfiles = [] } = useGetEmployeeProfilesQuery();
    const [createCredential, { isLoading: isCreating }] = useCreateStaffCredentialMutation();
    const [updateCredential, { isLoading: isUpdating }] = useUpdateStaffCredentialMutation();
    const [deleteCredential, { isLoading: isDeleting }] = useDeleteStaffCredentialMutation();

    const employees = useMemo(() => {
        const seen = new Map();
        for (const row of staffProfiles) {
            if (row.user_id) seen.set(row.user_id, { userId: row.user_id, fullName: row.full_name, role: row.role });
        }
        for (const row of allCredentials) {
            if (row.user_id && !seen.has(row.user_id)) {
                seen.set(row.user_id, { userId: row.user_id, fullName: row.employee_name, role: row.employee_role });
            }
        }
        return [...seen.values()].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    }, [staffProfiles, allCredentials]);

    const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const closeForm = () => { if (!isCreating && !isUpdating) { setForm(emptyForm); setEditTarget(null); } };

    const submit = async (event) => {
        event.preventDefault();
        const payload = {
            userId: form.userId,
            credentialType: form.credentialType.trim(),
            credentialNumber: form.credentialNumber.trim() || null,
            issuingAuthority: form.issuingAuthority.trim() || null,
            issuedDate: form.issuedDate || null,
            expiresAt: form.expiresAt,
            notes: form.notes.trim() || null,
        };
        try {
            if (editTarget) {
                await updateCredential({ id: editTarget.credential_id, ...payload }).unwrap();
                toast.success(t('hr.credentials.toast.updated'));
            } else {
                await createCredential(payload).unwrap();
                toast.success(t('hr.credentials.toast.created'));
            }
            closeForm();
        } catch (error) {
            toast.error(getErrorMessage(error, t('hr.credentials.toast.failed')));
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return false;
        try {
            await deleteCredential(deleteTarget.credential_id).unwrap();
            toast.success(t('hr.credentials.toast.deleted'));
            setDeleteTarget(null);
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('hr.credentials.toast.failed')));
            return false;
        }
    };

    const startEdit = (row) => {
        setEditTarget(row);
        setForm({
            userId: row.user_id,
            credentialType: row.credential_type,
            credentialNumber: row.credential_number || '',
            issuingAuthority: row.issuing_authority || '',
            issuedDate: row.issued_date ? String(row.issued_date).slice(0, 10) : '',
            expiresAt: String(row.expires_at).slice(0, 10),
            notes: row.notes || '',
        });
    };

    const inputClass = 'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200';
    const labelClass = 'mb-1 block text-xs font-bold text-slate-500';

    const expiryTone = (row) => {
        const left = daysLeft(row.expires_at);
        if (left < 0) return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
        if (left <= 30) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
            <form onSubmit={submit} className="h-fit rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <BadgeCheck size={16} className="text-teal-600" />
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                        {editTarget ? t('hr.credentials.editTitle') : t('hr.credentials.addTitle')}
                    </h2>
                </div>
                <label className="block">
                    <span className={labelClass}>{t('hr.credentials.fields.employee')}</span>
                    <select required disabled={Boolean(editTarget)} value={form.userId} onChange={(e) => setField('userId', e.target.value)} className={`${inputClass} disabled:opacity-60`}>
                        <option value="">{t('hr.credentials.fields.employeePlaceholder')}</option>
                        {employees.map((emp) => (
                            <option key={emp.userId} value={emp.userId}>{emp.fullName} — {emp.role}</option>
                        ))}
                    </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className={labelClass}>{t('hr.credentials.fields.type')}</span>
                        <input required maxLength={100} value={form.credentialType} onChange={(e) => setField('credentialType', e.target.value)} placeholder={t('hr.credentials.fields.typePlaceholder')} className={inputClass} />
                    </label>
                    <label className="block">
                        <span className={labelClass}>{t('hr.credentials.fields.number')}</span>
                        <input maxLength={100} value={form.credentialNumber} onChange={(e) => setField('credentialNumber', e.target.value)} className={inputClass} dir="ltr" />
                    </label>
                </div>
                <label className="block">
                    <span className={labelClass}>{t('hr.credentials.fields.authority')}</span>
                    <input maxLength={150} value={form.issuingAuthority} onChange={(e) => setField('issuingAuthority', e.target.value)} className={inputClass} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className={labelClass}>{t('hr.credentials.fields.issuedDate')}</span>
                        <input type="date" value={form.issuedDate} onChange={(e) => setField('issuedDate', e.target.value)} className={inputClass} />
                    </label>
                    <label className="block">
                        <span className={labelClass}>{t('hr.credentials.fields.expiresAt')}</span>
                        <input type="date" required value={form.expiresAt} onChange={(e) => setField('expiresAt', e.target.value)} className={inputClass} />
                    </label>
                </div>
                <label className="block">
                    <span className={labelClass}>{t('hr.credentials.fields.notes')}</span>
                    <textarea rows={2} maxLength={500} value={form.notes} onChange={(e) => setField('notes', e.target.value)} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" />
                </label>
                <div className="flex gap-2">
                    {editTarget && (
                        <button type="button" onClick={closeForm} disabled={isUpdating} className="h-9 flex-1 rounded-xl border border-slate-200 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                            {t('cancel')}
                        </button>
                    )}
                    <button type="submit" disabled={isCreating || isUpdating} className="h-9 flex-[1.4] rounded-xl bg-teal-600 text-xs font-black text-white shadow-xs hover:bg-teal-500 disabled:opacity-50">
                        {isCreating || isUpdating ? t('hr.credentials.saving') : (editTarget ? t('hr.credentials.update') : t('hr.credentials.save'))}
                    </button>
                </div>
            </form>

            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={16} className="text-teal-600" />
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">{t('hr.credentials.listTitle')}</h2>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{credentials.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                            <option value="all">{t('hr.credentials.filters.all')}</option>
                            <option value="expiring">{t('hr.credentials.filters.expiring')}</option>
                        </select>
                        <button type="button" onClick={refetch} className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
                <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pe-1">
                    {credentials.map((row) => {
                        const left = daysLeft(row.expires_at);
                        return (
                            <div key={row.credential_id} className="group rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-teal-500/40 hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-black text-slate-900 dark:text-white">{row.employee_name}</p>
                                        <p className="text-[10px] font-bold text-slate-400">{row.employee_role}</p>
                                        <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                                            <Award size={12} className="shrink-0 text-teal-600" />
                                            {row.credential_type}
                                            {row.credential_number && <span className="font-mono text-[10px] text-slate-400" dir="ltr">#{row.credential_number}</span>}
                                        </p>
                                        {row.issuing_authority && <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{row.issuing_authority}</p>}
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black ${expiryTone(row)}`}>
                                            {left < 0 ? <AlertTriangle size={11} /> : <CalendarClock size={11} />}
                                            {left < 0 ? t('hr.credentials.expired', { days: Math.abs(left) }) : t('hr.credentials.daysLeft', { days: left })}
                                        </span>
                                        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                                            <button type="button" onClick={() => startEdit(row)} className="grid h-7 w-7 place-items-center rounded-lg text-teal-600 transition hover:bg-teal-50 dark:hover:bg-teal-950/40" aria-label={t('hr.credentials.edit')}>
                                                <Pencil size={13} />
                                            </button>
                                            <button type="button" onClick={() => setDeleteTarget(row)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300" aria-label={t('hr.credentials.delete')}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {!credentials.length && (
                        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                            <BadgeCheck className="mx-auto text-slate-300" size={24} />
                            <p className="mt-2 text-xs font-bold text-slate-500">{t('hr.credentials.empty')}</p>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                isOpen={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title={t('hr.credentials.deleteTitle')}
                message={t('hr.credentials.deleteMessage', { type: deleteTarget?.credential_type || '' })}
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                isLoading={isDeleting}
                variant="danger"
            />
        </div>
    );
};

export default CredentialsManager;
