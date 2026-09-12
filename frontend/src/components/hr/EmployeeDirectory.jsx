import { useMemo, useState } from 'react';
import { Briefcase, Calendar, CheckCircle2, Filter, LayoutGrid, List, Mail, Pencil, Phone, RefreshCw, Search, ShieldCheck, UserCheck, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGetEmployeeProfilesQuery, useUpdateEmployeeProfileMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Modal from '../ui/Modal';

const emptyForm = { employeeId: '', department: '', jobTitle: '', hireDate: '', terminationDate: '', employmentStatus: 'Full-Time' };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-teal-500 dark:focus:ring-teal-500/20';

const asNullableText = value => {
    const trimmed = value.trim();
    return trimmed || null;
};

const formatDateOnly = (value, locale, fallback) => {
    if (!value) return fallback;
    const date = new Date(`${String(value).substring(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
};

const calculateCompletion = (employee) => {
    let score = 0;
    if (employee.full_name) score += 20;
    if (employee.email) score += 20;
    if (employee.employee_id) score += 20;
    if (employee.department) score += 20;
    if (employee.job_title && employee.hire_date) score += 20;
    return score;
};

const EmployeeDirectory = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`hr.directory.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';

    const { data: profiles = [], isLoading, isError, isFetching, refetch } = useGetEmployeeProfilesQuery();
    const [updateProfile, { isLoading: isUpdating }] = useUpdateEmployeeProfileMutation();

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const departments = useMemo(() => [...new Set(profiles.map(profile => profile.department).filter(Boolean))].sort(), [profiles]);
    const roles = useMemo(() => [...new Set(profiles.map(profile => profile.role).filter(Boolean))].sort(), [profiles]);

    const visibleProfiles = useMemo(() => {
        const query = search.trim().toLowerCase();
        return profiles.filter(profile => {
            if (roleFilter !== 'all' && profile.role !== roleFilter) return false;
            if (departmentFilter !== 'all' && profile.department !== departmentFilter) return false;
            return !query || [profile.full_name, profile.email, profile.role, profile.employee_id, profile.department, profile.job_title, profile.phone]
                .filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [departmentFilter, profiles, roleFilter, search]);

    const openEdit = employee => {
        setEditingEmployee(employee);
        setForm({
            employeeId: employee.employee_id || '',
            department: employee.department || '',
            jobTitle: employee.job_title || '',
            hireDate: employee.hire_date ? employee.hire_date.substring(0, 10) : '',
            terminationDate: employee.termination_date ? employee.termination_date.substring(0, 10) : '',
            employmentStatus: employee.employment_status || 'Full-Time'
        });
    };

    const closeEdit = () => { if (!isUpdating) { setEditingEmployee(null); setForm(emptyForm); } };
    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));

    const handleSave = async event => {
        event.preventDefault();
        if (!editingEmployee) return;
        const payload = {
            id: editingEmployee.user_id,
            employeeId: asNullableText(form.employeeId),
            department: asNullableText(form.department),
            jobTitle: asNullableText(form.jobTitle),
            hireDate: form.hireDate || null,
            terminationDate: form.terminationDate || null,
            employmentStatus: form.employmentStatus
        };
        try {
            await updateProfile(payload).unwrap();
            toast.success(copy('updateSuccess'));
            closeEdit();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('updateError')));
        }
    };

    const formatDate = value => formatDateOnly(value, locale, copy('unknown'));

    return (
        <div className="space-y-4">
            {/* Main Container Card */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Header & Controls */}
                <header className="border-b border-slate-100 p-4 dark:border-slate-800">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* Title & Stats badge */}
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60">
                                <Users size={20} />
                            </span>
                            <div>
                                <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white sm:text-lg">{copy('title')}</h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {copy('description')}
                                </p>
                            </div>
                        </div>

                        {/* Search & Actions Bar */}
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="relative min-w-[220px] flex-1 sm:flex-initial">
                                <span className="sr-only">{copy('search')}</span>
                                <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder={copy('searchPlaceholder')}
                                    className={`${inputClass} h-9 ps-9 text-xs`}
                                />
                            </label>

                            <select
                                value={departmentFilter}
                                onChange={event => setDepartmentFilter(event.target.value)}
                                aria-label={copy('filterDepartment')}
                                className={`${inputClass} h-9 w-auto text-xs`}
                            >
                                <option value="all">{copy('allDepartments')}</option>
                                {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            </select>

                            {/* View Mode Toggle */}
                            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('grid')}
                                    aria-label="Grid View"
                                    className={`rounded-lg p-1.5 transition ${viewMode === 'grid' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                >
                                    <LayoutGrid size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    aria-label="Table View"
                                    className={`rounded-lg p-1.5 transition ${viewMode === 'table' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                >
                                    <List size={15} />
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => refetch()}
                                disabled={isFetching}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <RefreshCw size={14} className={isFetching ? 'animate-spin text-teal-600' : ''} />
                                {copy('refresh')}
                            </button>
                        </div>
                    </div>

                    {/* Role Filter Pills */}
                    {roles.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                            <span className="text-[11px] font-bold text-slate-400 me-1">
                                {t('common.filter', { defaultValue: 'Role:' })}
                            </span>
                            <button
                                type="button"
                                onClick={() => setRoleFilter('all')}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                    roleFilter === 'all'
                                        ? 'bg-teal-600 text-white shadow-xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                            >
                                {t('common.all', { defaultValue: 'All' })} ({profiles.length})
                            </button>
                            {roles.map(role => {
                                const count = profiles.filter(p => p.role === role).length;
                                return (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => setRoleFilter(role)}
                                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                            roleFilter === role
                                                ? 'bg-teal-600 text-white shadow-xs'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                        }`}
                                    >
                                        {t(`roles.${role}`, role)} ({count})
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </header>

                {/* Directory Content */}
                {isLoading ? (
                    <Loading label={copy('loading')} />
                ) : isError ? (
                    <ErrorState copy={copy} onRetry={refetch} />
                ) : visibleProfiles.length === 0 ? (
                    <Empty copy={copy} filtered={Boolean(search || departmentFilter !== 'all' || roleFilter !== 'all')} />
                ) : viewMode === 'grid' ? (
                    <div className="grid gap-3.5 p-4 sm:grid-cols-2 xl:grid-cols-3">
                        {visibleProfiles.map(employee => (
                            <EmployeeCard
                                key={employee.user_id}
                                employee={employee}
                                copy={copy}
                                formatDate={formatDate}
                                onEdit={openEdit}
                                t={t}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px] border-collapse text-start text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/40">
                                    <th className="px-4 py-3 text-start">{copy('employee')}</th>
                                    <th className="px-3 py-3 text-start">{copy('role', { defaultValue: 'Role' })}</th>
                                    <th className="px-3 py-3 text-start">{copy('department')}</th>
                                    <th className="px-3 py-3 text-start">{copy('jobTitle')}</th>
                                    <th className="px-3 py-3 text-start">{copy('employmentStatus')}</th>
                                    <th className="px-3 py-3 text-start">{copy('hireDate')}</th>
                                    <th className="px-4 py-3 text-end">{copy('actions', { defaultValue: 'Actions' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {visibleProfiles.map(employee => (
                                    <tr key={employee.user_id} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-xs font-black text-white shadow-xs">
                                                    {employee.full_name?.[0]?.toUpperCase() || '?'}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-black text-slate-900 dark:text-white">{employee.full_name}</p>
                                                    <p className="truncate text-[11px] font-semibold text-slate-400">{employee.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className="inline-flex rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-black uppercase text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                                                {t(`roles.${employee.role}`, employee.role)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300">
                                            {employee.department || <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-300">
                                            {employee.job_title || <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                {copy(`statuses.${employee.employment_status || 'Full-Time'}`)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 font-medium text-slate-500">
                                            {formatDate(employee.hire_date)}
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(employee)}
                                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 shadow-xs hover:border-teal-400 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                            >
                                                <Pencil size={12} />
                                                <span>{copy('edit', { defaultValue: 'Edit' })}</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Edit Profile Modal */}
            <Modal isOpen={Boolean(editingEmployee)} onClose={closeEdit} title={copy('editTitle', { employee: editingEmployee?.full_name || '' })} size="default">
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-teal-200/80 bg-teal-50/80 p-3.5 dark:border-teal-500/20 dark:bg-teal-500/10">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-sm font-black text-white">
                            {editingEmployee?.full_name?.[0]?.toUpperCase() || '?'}
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-black text-teal-950 dark:text-teal-100">{editingEmployee?.full_name}</p>
                            <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-300">{editingEmployee?.role} · {editingEmployee?.email}</p>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={copy('employeeId')}>
                            <input maxLength={50} value={form.employeeId} onChange={event => setField('employeeId', event.target.value)} className={inputClass} placeholder="e.g. EMP-1042" />
                        </Field>
                        <Field label={copy('department')}>
                            <input maxLength={100} value={form.department} onChange={event => setField('department', event.target.value)} className={inputClass} placeholder="e.g. Radiology / Clinical" />
                        </Field>
                        <Field label={copy('jobTitle')}>
                            <input maxLength={100} value={form.jobTitle} onChange={event => setField('jobTitle', event.target.value)} className={inputClass} placeholder="e.g. Senior MRI Specialist" />
                        </Field>
                        <Field label={copy('employmentStatus')}>
                            <select value={form.employmentStatus} onChange={event => setField('employmentStatus', event.target.value)} className={inputClass}>
                                {['Full-Time', 'Part-Time', 'Contract'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}
                            </select>
                        </Field>
                        <Field label={copy('hireDate')}>
                            <input type="date" value={form.hireDate} onChange={event => setField('hireDate', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('terminationDate', { defaultValue: 'Termination date' })}>
                            <input type="date" min={form.hireDate || undefined} value={form.terminationDate} onChange={event => setField('terminationDate', event.target.value)} className={inputClass} />
                        </Field>
                    </div>

                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:flex-row sm:justify-end">
                        <button type="button" onClick={closeEdit} disabled={isUpdating} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800">
                            {copy('cancel')}
                        </button>
                        <button type="submit" disabled={isUpdating} className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50">
                            {isUpdating ? copy('saving') : copy('save')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const EmployeeCard = ({ employee, copy, formatDate, onEdit, t }) => {
    const completion = calculateCompletion(employee);
    const isActive = employee.is_active !== false;

    return (
        <article className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-500/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80">
            <div>
                {/* Header info */}
                <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="relative">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-sm font-black text-white shadow-xs">
                                {employee.full_name?.[0]?.toUpperCase() || '?'}
                            </span>
                            <span className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate font-black text-slate-900 dark:text-white text-sm">{employee.full_name}</h3>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                                    {t(`roles.${employee.role}`, employee.role)}
                                </span>
                                {employee.employee_id && (
                                    <span className="text-[10px] font-bold text-slate-400">
                                        #{employee.employee_id}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onEdit(employee)}
                        aria-label={copy('editEmployee', { employee: employee.full_name })}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-300"
                    >
                        <Pencil size={14} />
                    </button>
                </div>

                {/* Contact & Meta */}
                <div className="mt-3.5 space-y-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <p className="flex items-center gap-2 truncate">
                        <Mail size={13} className="shrink-0 text-slate-400" />
                        <span className="truncate">{employee.email}</span>
                    </p>
                    {employee.job_title && (
                        <p className="flex items-center gap-2 truncate">
                            <Briefcase size={13} className="shrink-0 text-slate-400" />
                            <span className="truncate">{employee.job_title}</span>
                        </p>
                    )}
                </div>

                {/* Details Pills */}
                <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] font-bold dark:border-slate-800">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {employee.department || copy('unassigned')}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {copy(`statuses.${employee.employment_status || 'Full-Time'}`)}
                    </span>
                    <span className="ms-auto flex items-center gap-1 text-[10px] text-slate-400">
                        <Calendar size={11} />
                        {formatDate(employee.hire_date)}
                    </span>
                </div>
            </div>

            {/* Profile Completion Bar */}
            <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                    <span>{copy('profileComplete', { defaultValue: 'Profile' })}</span>
                    <span>{completion}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                        className={`h-full rounded-full transition-all ${
                            completion >= 80 ? 'bg-teal-500' : completion >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${completion}%` }}
                    />
                </div>
            </div>
        </article>
    );
};

const Loading = ({ label }) => <div className="animate-pulse p-10 text-center text-xs font-bold text-slate-400">{label}</div>;

const ErrorState = ({ copy, onRetry }) => (
    <div role="alert" className="p-8 text-center">
        <ShieldCheck size={28} className="mx-auto text-rose-400" />
        <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-400">{copy('loadError')}</p>
        <button type="button" onClick={onRetry} className="mt-2.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300">
            {copy('retry')}
        </button>
    </div>
);

const Empty = ({ copy, filtered }) => (
    <div className="p-10 text-center">
        <Users size={32} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-2 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default EmployeeDirectory;
