import { useMemo, useState } from 'react';
import { Clock3, Pencil, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGetAttendanceQuery, useGetEmployeeProfilesQuery, useUpdateAttendanceMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Modal from '../ui/Modal';

const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200';
const toDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const toDateTimeLocal = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const AttendanceManager = () => {
    const { i18n } = useTranslation('workspace');
    const isArabic = i18n.language.startsWith('ar');
    const now = new Date();
    const [filters, setFilters] = useState({
        startDate: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: toDateInput(now),
        userId: '',
        limit: 500
    });
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ clockIn: '', clockOut: '', status: 'Present', notes: '' });
    const query = { ...filters, userId: filters.userId || undefined };
    const rangeInvalid = filters.startDate > filters.endDate;
    const { data: records = [], isLoading, isFetching, isError, refetch } = useGetAttendanceQuery(query, { skip: rangeInvalid });
    const { data: staff = [] } = useGetEmployeeProfilesQuery();
    const [updateAttendance, { isLoading: saving }] = useUpdateAttendanceMutation();

    const summary = useMemo(() => ({
        records: records.length,
        active: records.filter((record) => !record.clock_out).length,
        late: records.filter((record) => record.status === 'Late' || Number(record.late_minutes || 0) > 0).length,
        hours: records.reduce((sum, record) => {
            if (!record.clock_out || record.status === 'Absent') return sum;
            return sum + Math.max(0, new Date(record.clock_out) - new Date(record.clock_in)) / 3600000;
        }, 0)
    }), [records]);

    const openEdit = (record) => {
        setEditing(record);
        setForm({
            clockIn: toDateTimeLocal(record.clock_in),
            clockOut: toDateTimeLocal(record.clock_out),
            status: record.status || 'Present',
            notes: record.notes || ''
        });
    };

    const save = async (event) => {
        event.preventDefault();
        if (!editing) return;
        try {
            await updateAttendance({
                id: editing.log_id,
                clockIn: new Date(form.clockIn).toISOString(),
                clockOut: form.clockOut ? new Date(form.clockOut).toISOString() : null,
                status: form.status,
                notes: form.notes.trim() || undefined
            }).unwrap();
            toast.success(isArabic ? 'تم تصحيح سجل الحضور' : 'Attendance record corrected');
            setEditing(null);
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'تعذر تصحيح السجل' : 'Could not correct attendance'));
        }
    };

    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const formatDateTime = (value) => value
        ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
        : '—';

    return (
        <div className="space-y-6">
            <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label={isArabic ? 'ملخص الحضور' : 'Attendance summary'}>
                <Metric label={isArabic ? 'السجلات' : 'Records'} value={summary.records} />
                <Metric label={isArabic ? 'جلسات مفتوحة' : 'Open sessions'} value={summary.active} />
                <Metric label={isArabic ? 'حالات تأخير' : 'Late records'} value={summary.late} />
                <Metric label={isArabic ? 'ساعات مسجلة' : 'Recorded hours'} value={summary.hours.toFixed(2)} />
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
                <header className="flex flex-col gap-3 border-b border-slate-100 p-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-base font-black text-slate-900 dark:text-white">{isArabic ? 'سجل الحضور والانصراف' : 'Attendance ledger'}</h2>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{isArabic ? 'مراجعة وتصحيح الساعات والحالات المسجلة.' : 'Review and correct recorded times and classifications.'}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                        <input aria-label={isArabic ? 'من تاريخ' : 'Start date'} type="date" className={inputClass} value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
                        <input aria-label={isArabic ? 'إلى تاريخ' : 'End date'} type="date" className={inputClass} value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
                        <select aria-label={isArabic ? 'الموظف' : 'Employee'} className={inputClass} value={filters.userId} onChange={(event) => setFilters({ ...filters, userId: event.target.value })}>
                            <option value="">{isArabic ? 'كل الموظفين' : 'All employees'}</option>
                            {staff.map((employee) => <option key={employee.user_id} value={employee.user_id}>{employee.full_name}</option>)}
                        </select>
                        <button type="button" onClick={() => refetch()} disabled={isFetching || rangeInvalid} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black dark:border-slate-700">
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {isArabic ? 'تحديث' : 'Refresh'}
                        </button>
                    </div>
                </header>

                {rangeInvalid ? <State text={isArabic ? 'نطاق التاريخ غير صحيح' : 'Invalid date range'} error />
                    : isLoading ? <State text={isArabic ? 'جارٍ تحميل الحضور...' : 'Loading attendance…'} />
                        : isError ? <State text={isArabic ? 'تعذر تحميل سجلات الحضور' : 'Could not load attendance records'} error />
                            : records.length === 0 ? <State text={isArabic ? 'لا توجد سجلات في هذه الفترة' : 'No records in this period'} />
                                : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[900px] text-xs">
                                            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950/50">
                                                <tr>{[
                                                    isArabic ? 'الموظف' : 'Employee',
                                                    isArabic ? 'الحضور' : 'Clock in',
                                                    isArabic ? 'الانصراف' : 'Clock out',
                                                    isArabic ? 'الحالة' : 'Status',
                                                    isArabic ? 'التأخير/المبكر' : 'Late/Early',
                                                    isArabic ? 'الإجراء' : 'Action'
                                                ].map((label) => <th key={label} className="px-4 py-3 text-start font-black">{label}</th>)}</tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {records.map((record) => (
                                                    <tr key={record.log_id}>
                                                        <td className="px-4 py-3 font-black text-slate-900 dark:text-white">{record.employee_name}</td>
                                                        <td className="px-4 py-3">{formatDateTime(record.clock_in)}</td>
                                                        <td className="px-4 py-3">{formatDateTime(record.clock_out)}</td>
                                                        <td className="px-4 py-3 font-bold">{record.status}</td>
                                                        <td className="px-4 py-3 font-mono">{Number(record.late_minutes || 0).toFixed(0)} / {Number(record.early_leave_minutes || 0).toFixed(0)} min</td>
                                                        <td className="px-4 py-3">
                                                            <button type="button" onClick={() => openEdit(record)} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 font-black text-white"><Pencil size={12} />{isArabic ? 'تصحيح' : 'Correct'}</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
            </section>

            <Modal isOpen={Boolean(editing)} onClose={() => !saving && setEditing(null)} title={isArabic ? 'تصحيح سجل الحضور' : 'Correct attendance record'}>
                <form onSubmit={save} className="space-y-4">
                    <label className="block text-xs font-bold">{isArabic ? 'الحضور' : 'Clock in'}<input required type="datetime-local" className={`${inputClass} mt-1`} value={form.clockIn} onChange={(event) => setForm({ ...form, clockIn: event.target.value })} /></label>
                    <label className="block text-xs font-bold">{isArabic ? 'الانصراف' : 'Clock out'}<input type="datetime-local" min={form.clockIn || undefined} className={`${inputClass} mt-1`} value={form.clockOut} onChange={(event) => setForm({ ...form, clockOut: event.target.value })} /></label>
                    <label className="block text-xs font-bold">{isArabic ? 'الحالة' : 'Status'}<select className={`${inputClass} mt-1`} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{['Present', 'Late', 'Absent', 'Half-Day'].map((status) => <option key={status}>{status}</option>)}</select></label>
                    <label className="block text-xs font-bold">{isArabic ? 'سبب التصحيح' : 'Correction notes'}<textarea required maxLength={500} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                    <button type="submit" disabled={saving} className="w-full rounded-xl bg-cyan-700 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? (isArabic ? 'جارٍ الحفظ...' : 'Saving…') : (isArabic ? 'حفظ التصحيح' : 'Save correction')}</button>
                </form>
            </Modal>
        </div>
    );
};

const Metric = ({ label, value }) => <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">{value}</p></article>;
const State = ({ text, error = false }) => <div role={error ? 'alert' : undefined} className={`p-10 text-center text-xs font-bold ${error ? 'text-rose-600' : 'text-slate-500'}`}><Clock3 className="mx-auto mb-2" size={24} />{text}</div>;

export default AttendanceManager;
