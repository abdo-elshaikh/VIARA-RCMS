import { useMemo, useState } from 'react';
import { Briefcase, Calendar, Mail, Pencil, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGetEmployeeProfilesQuery, useUpdateEmployeeProfileMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Modal from '../ui/Modal';

const emptyForm = { employeeId: '', department: '', jobTitle: '', hireDate: '', employmentStatus: 'Full-Time', salary: '' };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20';

const EmployeeDirectory = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`hr.directory.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';

    const { data: profiles = [], isLoading, isError, isFetching, refetch } = useGetEmployeeProfilesQuery();
    const [updateProfile, { isLoading: isUpdating }] = useUpdateEmployeeProfileMutation();

    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const departments = useMemo(() => [...new Set(profiles.map(profile => profile.department).filter(Boolean))].sort(), [profiles]);

    const visibleProfiles = useMemo(() => {
        const query = search.trim().toLowerCase();
        return profiles.filter(profile => {
            if (departmentFilter !== 'all' && profile.department !== departmentFilter) return false;
            return !query || [profile.full_name, profile.email, profile.role, profile.employee_id, profile.department, profile.job_title]
                .filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [departmentFilter, profiles, search]);

    const completeProfiles = profiles.filter(profile => profile.employee_id && profile.department && profile.job_title && profile.hire_date).length;
    const activeProfiles = profiles.filter(profile => profile.is_active !== false).length;

    const openEdit = employee => {
        setEditingEmployee(employee);
        setForm({
            employeeId: employee.employee_id || '',
            department: employee.department || '',
            jobTitle: employee.job_title || '',
            hireDate: employee.hire_date ? employee.hire_date.substring(0, 10) : '',
            employmentStatus: employee.employment_status || 'Full-Time',
            salary: employee.salary ?? ''
        });
    };

    const closeEdit = () => { if (!isUpdating) { setEditingEmployee(null); setForm(emptyForm); } };
    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));

    const handleSave = async event => {
        event.preventDefault();
        if (!editingEmployee) return;
        const payload = {
            id: editingEmployee.user_id,
            employeeId: form.employeeId.trim(),
            department: form.department.trim(),
            jobTitle: form.jobTitle.trim(),
            employmentStatus: form.employmentStatus
        };
        if (form.hireDate) payload.hireDate = form.hireDate;
        if (editingEmployee.salary !== undefined && form.salary !== '') payload.salary = Number(form.salary);
        try {
            await updateProfile(payload).unwrap();
            toast.success(copy('updateSuccess'));
            closeEdit();
        } catch (error) {
            toast.error(getErrorMessage(error, copy('updateError')));
        }
    };

    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : copy('unknown');
    const money = value => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', minimumFractionDigits: 2 }).format(Number(value || 0));

    return (
        <div className="space-y-6">
            {/* Top Metrics Grid */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-3" aria-label={copy('summaryLabel')}>
                <Metric label={copy('staffCount')} value={profiles.length} />
                <Metric label={copy('activeStaff')} value={activeProfiles} />
                <Metric label={copy('completeProfiles')} value={completeProfiles} wide />
            </section>

            {/* Main Panel */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <header className="flex flex-col gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200 shadow-md dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30">
                            <Users size={22} />
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
                            <span className="sr-only">{copy('filterDepartment')}</span>
                            <select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} className={inputClass}>
                                <option value="all">{copy('allDepartments')}</option>
                                {departments.map(department => <option key={department} value={department}>{department}</option>)}
                            </select>
                        </label>

                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {copy('refresh')}
                        </button>
                    </div>
                </header>

                {/* Directory Content Grid */}
                {isLoading ? (
                    <Loading label={copy('loading')} />
                ) : isError ? (
                    <ErrorState copy={copy} onRetry={refetch} />
                ) : visibleProfiles.length === 0 ? (
                    <Empty copy={copy} filtered={Boolean(search || departmentFilter !== 'all')} />
                ) : (
                    <div className="grid gap-4 p-5 md:grid-cols-2 2xl:grid-cols-3">
                        {visibleProfiles.map(employee => (
                            <EmployeeCard key={employee.user_id} employee={employee} copy={copy} formatDate={formatDate} money={money} onEdit={openEdit} />
                        ))}
                    </div>
                )}
            </section>

            {/* Edit Profile Modal */}
            <Modal isOpen={Boolean(editingEmployee)} onClose={closeEdit} title={copy('editTitle', { employee: editingEmployee?.full_name || '' })} size="default">
                <form onSubmit={handleSave} className="space-y-5">
                    <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/90 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                        <p className="text-xs font-black text-indigo-950 dark:text-indigo-100">{editingEmployee?.full_name}</p>
                        <p className="mt-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">{editingEmployee?.role} · {editingEmployee?.email}</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={copy('employeeId')}>
                            <input maxLength={50} value={form.employeeId} onChange={event => setField('employeeId', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('department')}>
                            <input maxLength={100} value={form.department} onChange={event => setField('department', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('jobTitle')}>
                            <input maxLength={100} value={form.jobTitle} onChange={event => setField('jobTitle', event.target.value)} className={inputClass} />
                        </Field>
                        <Field label={copy('employmentStatus')}>
                            <select value={form.employmentStatus} onChange={event => setField('employmentStatus', event.target.value)} className={inputClass}>
                                {['Full-Time', 'Part-Time', 'Contract'].map(status => <option key={status} value={status}>{copy(`statuses.${status}`)}</option>)}
                            </select>
                        </Field>
                        <Field label={copy('hireDate')}>
                            <input type="date" value={form.hireDate} onChange={event => setField('hireDate', event.target.value)} className={inputClass} />
                        </Field>
                        {editingEmployee?.salary !== undefined && (
                            <Field label={copy('salary')}>
                                <input type="number" min="0" step="0.01" value={form.salary} onChange={event => setField('salary', event.target.value)} className={inputClass} />
                            </Field>
                        )}
                    </div>

                    <p className="text-[11px] font-medium leading-5 text-slate-500 dark:text-slate-400">{copy('salaryHelp')}</p>

                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100/80 pt-4 dark:border-white/5 sm:flex-row sm:justify-end">
                        <button type="button" onClick={closeEdit} disabled={isUpdating} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5">
                            {copy('cancel')}
                        </button>
                        <button type="submit" disabled={isUpdating} className="rounded-xl bg-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-indigo-800 disabled:opacity-50">
                            {isUpdating ? copy('saving') : copy('save')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

const Metric = ({ label, value, wide }) => (
    <article className={`rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-lg shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">{value}</p>
    </article>
);

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const Detail = ({ label, children }) => (
    <div className="flex items-start justify-between gap-3">
        <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
        <dd className="text-end text-xs font-bold text-slate-700 dark:text-slate-200">{children}</dd>
    </div>
);

const EmployeeCard = ({ employee, copy, formatDate, money, onEdit }) => (
    <article className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/60">
        <div className="absolute inset-y-0 start-0 w-1 bg-indigo-500" />
        <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-600 font-black text-white shadow-md shadow-indigo-500/20 text-base">
                    {employee.full_name?.[0]?.toUpperCase() || '?'}
                </span>
                <div className="min-w-0">
                    <h3 className="truncate font-black text-slate-900 dark:text-white text-sm">{employee.full_name}</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                        <Briefcase size={13} className="text-slate-400" />
                        {employee.job_title || employee.role}
                    </p>
                </div>
            </div>
            <button
                type="button"
                onClick={() => onEdit(employee)}
                aria-label={copy('editEmployee', { employee: employee.full_name })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
            >
                <Pencil size={15} />
            </button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Mail size={13} className="text-slate-400" />
            <span className="truncate">{employee.email}</span>
        </div>

        <dl className="mt-4 space-y-2.5 border-t border-slate-100/80 pt-4 dark:border-white/5">
            <Detail label={copy('employeeId')}>{employee.employee_id || copy('notSet')}</Detail>
            <Detail label={copy('department')}>{employee.department || copy('unassigned')}</Detail>
            <Detail label={copy('hireDate')}>
                <span className="inline-flex items-center gap-1">
                    <Calendar size={13} />
                    {formatDate(employee.hire_date)}
                </span>
            </Detail>
            <Detail label={copy('employmentStatus')}>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {copy(`statuses.${employee.employment_status || 'Full-Time'}`)}
                </span>
            </Detail>
            {employee.salary !== undefined && (
                <Detail label={copy('salary')}>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{money(employee.salary)}</span>
                </Detail>
            )}
        </dl>
    </article>
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
        <Users size={34} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-3 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default EmployeeDirectory;
