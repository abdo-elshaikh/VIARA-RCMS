import React, { useState, useMemo } from 'react';
import {
    History, ShieldAlert, ShieldCheck, Download, Search,
    Filter, RefreshCw, AlertTriangle, UserCheck, Clock,
    LogIn, LogOut, Lock, X, ChevronDown, Monitor, Globe, FileSpreadsheet
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../../ui/Modal';
import { useGetAttendanceAuditLedgerQuery } from '../../../store/api';

const ACTION_CONFIG = {
    CLOCK_IN: {
        ar: 'تسجيل حضور',
        en: 'Clock In',
        badge: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
        icon: LogIn
    },
    CLOCK_OUT: {
        ar: 'تسجيل انصراف',
        en: 'Clock Out',
        badge: 'bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300',
        icon: LogOut
    },
    EARLY_DEPARTURE_BLOCKED: {
        ar: 'حظر انصراف مبكر',
        en: 'Early Departure Blocked',
        badge: 'bg-rose-500/20 text-rose-700 border-rose-500/40 dark:text-rose-300',
        icon: Lock
    },
    LATE_ARRIVAL: {
        ar: 'تأخير حضور',
        en: 'Late Arrival',
        badge: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300',
        icon: Clock
    },
    MANUAL_ENTRY: {
        ar: 'تسجيل يدوي',
        en: 'Manual Entry',
        badge: 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300',
        icon: History
    },
    CORRECTION: {
        ar: 'تصحيح إداري',
        en: 'Correction',
        badge: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300',
        icon: History
    },
    PERMISSION_APPROVED: {
        ar: 'اعتماد إذن',
        en: 'Permission Approved',
        badge: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
        icon: ShieldCheck
    },
    PERMISSION_REJECTED: {
        ar: 'رفض إذن',
        en: 'Permission Rejected',
        badge: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300',
        icon: ShieldAlert
    },
    AUTO_ABSENT: {
        ar: 'غياب آلي بالنظام',
        en: 'Auto Shift Absence',
        badge: 'bg-purple-500/15 text-purple-700 border-purple-500/30 dark:text-purple-300',
        icon: AlertTriangle
    }
};

const toDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const AttendanceAuditDrawer = ({ isOpen, onClose }) => {
    const { i18n, t } = useTranslation('workspace');
    const isArabic = i18n.language.startsWith('ar');
    const now = new Date();

    const [filters, setFilters] = useState({
        startDate: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: toDateInput(now),
        actionType: '',
        isViolation: false
    });
    const [search, setSearch] = useState('');
    const [expandedRow, setExpandedRow] = useState(null);

    const queryParams = useMemo(() => {
        const p = {
            startDate: filters.startDate || undefined,
            endDate: filters.endDate || undefined,
            limit: 300
        };
        if (filters.actionType) p.actionType = filters.actionType;
        if (filters.isViolation) p.isViolation = 'true';
        return p;
    }, [filters]);

    const {
        data: auditLogs = [],
        isLoading,
        isFetching,
        refetch
    } = useGetAttendanceAuditLedgerQuery(queryParams, { skip: !isOpen });

    const filteredLogs = useMemo(() => {
        if (!search.trim()) return auditLogs;
        const q = search.toLowerCase();
        return auditLogs.filter((log) => {
            const empName = (log.employee_name || '').toLowerCase();
            const actorName = (log.actor_name || '').toLowerCase();
            const action = (log.action_type || '').toLowerCase();
            const reason = (log.reason || '').toLowerCase();
            const ip = (log.ip_address || '').toLowerCase();
            return empName.includes(q) || actorName.includes(q) || action.includes(q) || reason.includes(q) || ip.includes(q);
        });
    }, [auditLogs, search]);

    const violationsCount = useMemo(() => {
        return auditLogs.filter((l) => l.is_violation).length;
    }, [auditLogs]);

    const exportToCSV = () => {
        if (filteredLogs.length === 0) {
            toast.error(isArabic ? 'لا توجد سجلات تدقيق للتصدير' : 'No audit records to export');
            return;
        }

        const headers = [
            isArabic ? 'معرف التدقيق' : 'Audit ID',
            isArabic ? 'التاريخ والوقت' : 'Timestamp',
            isArabic ? 'نوع الحركة' : 'Action Type',
            isArabic ? 'الموظف' : 'Employee',
            isArabic ? 'الدور' : 'Role',
            isArabic ? 'منفذ الحركة' : 'Actor',
            isArabic ? 'مخالفة' : 'Violation',
            isArabic ? 'الفارق بالدقائق' : 'Deviation (Mins)',
            isArabic ? 'عنوان IP' : 'IP Address',
            isArabic ? 'السبب / الملاحظات' : 'Reason / Notes'
        ];

        const rows = [headers.join(',')];

        filteredLogs.forEach((log) => {
            const actionLabel = ACTION_CONFIG[log.action_type]?.[isArabic ? 'ar' : 'en'] || log.action_type;
            const row = [
                `"${log.audit_id}"`,
                `"${new Date(log.event_timestamp).toLocaleString('en-GB')}"`,
                `"${actionLabel}"`,
                `"${(log.employee_name || '').replace(/"/g, '""')}"`,
                `"${(log.employee_role || '').replace(/"/g, '""')}"`,
                `"${(log.actor_name || '').replace(/"/g, '""')}"`,
                log.is_violation ? 'Yes' : 'No',
                log.deviation_minutes || 0,
                `"${log.ip_address || ''}"`,
                `"${(log.reason || '').replace(/"/g, '""')}"`
            ];
            rows.push(row.join(','));
        });

        const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `VIARA_Attendance_Audit_Ledger_${filters.startDate}_to_${filters.endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(isArabic ? 'تم تصدير سجل التدقيق النهائي بنجاح' : 'Audit ledger exported successfully');
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-2.5">
                    <History className="text-teal-600 dark:text-teal-400" size={20} />
                    <span>{isArabic ? 'سجل التدقيق النهائي للحضور والانصراف (Audit Ledger)' : 'Immutable Attendance Audit Ledger'}</span>
                    <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-mono font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {auditLogs.length}
                    </span>
                    {violationsCount > 0 && (
                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-black text-rose-600 dark:text-rose-400">
                            {violationsCount} {isArabic ? 'مخالفة' : 'violations'}
                        </span>
                    )}
                </div>
            }
            size="wide"
        >
            <div className="space-y-4 p-1 text-slate-800 dark:text-slate-200">
                {/* Header Explainer */}
                <div className="flex items-start justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                    <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                            {isArabic ? 'سجل امتثال وتدقيق رقمي موثوق وغير قابل للتعديل' : 'Digital Compliance & Non-Repudiation Audit Ledger'}
                        </h4>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {isArabic
                                ? 'يوثق هذا السجل جميع حركات البصمة، وتطبيق فترات السماح، وحالات حظر الخروج المبكر، وتفاصيل الأجهزة وعناوين IP للمنفذين.'
                                : 'Records all punch events, grace period applications, early departure blocks, and actor IP/device snapshots.'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={exportToCSV}
                        disabled={filteredLogs.length === 0}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-teal-700 disabled:opacity-40"
                    >
                        <Download size={13} />
                        <span>{isArabic ? 'تصدير السجل CSV' : 'Export CSV'}</span>
                    </button>
                </div>

                {/* Filter Toolbar */}
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                    {/* Date Inputs */}
                    <div className="flex items-center gap-1.5">
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-800 dark:bg-slate-950"
                        />
                        <span className="text-xs text-slate-400">→</span>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-800 dark:bg-slate-950"
                        />
                    </div>

                    {/* Action Filter */}
                    <select
                        value={filters.actionType}
                        onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}
                        className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none dark:border-slate-800 dark:bg-slate-950"
                    >
                        <option value="">{isArabic ? 'جميع الحركات' : 'All Actions'}</option>
                        <option value="CLOCK_IN">{isArabic ? 'تسجيل حضور (Clock In)' : 'Clock In'}</option>
                        <option value="CLOCK_OUT">{isArabic ? 'تسجيل انصراف (Clock Out)' : 'Clock Out'}</option>
                        <option value="EARLY_DEPARTURE_BLOCKED">{isArabic ? 'حظر انصراف مبكر' : 'Early Departure Blocked'}</option>
                        <option value="LATE_ARRIVAL">{isArabic ? 'تأخير حضور' : 'Late Arrival'}</option>
                        <option value="MANUAL_ENTRY">{isArabic ? 'تسجيل يدوي' : 'Manual Entry'}</option>
                        <option value="CORRECTION">{isArabic ? 'تصحيح إداري' : 'Correction'}</option>
                        <option value="PERMISSION_APPROVED">{isArabic ? 'اعتماد إذن' : 'Permission Approved'}</option>
                        <option value="PERMISSION_REJECTED">{isArabic ? 'رفض إذن' : 'Permission Rejected'}</option>
                        <option value="AUTO_ABSENT">{isArabic ? 'غياب آلي بالنظام' : 'Auto Shift Absence'}</option>
                    </select>

                    {/* Violation Toggle */}
                    <button
                        type="button"
                        onClick={() => setFilters({ ...filters, isViolation: !filters.isViolation })}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition ${filters.isViolation ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'}`}
                    >
                        <ShieldAlert size={13} className={filters.isViolation ? 'text-rose-600' : 'text-slate-400'} />
                        <span>{isArabic ? 'المخالفات فقط' : 'Violations Only'}</span>
                    </button>

                    {/* Search */}
                    <div className="flex flex-1 min-w-[180px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-800 dark:bg-slate-950">
                        <Search size={13} className="text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={isArabic ? 'بحث بالموظف، المنفذ، IP...' : 'Search staff, actor, IP...'}
                            className="w-full bg-transparent text-xs font-semibold outline-none"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')}>
                                <X size={12} className="text-slate-400" />
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => refetch()}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-950"
                    >
                        <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Audit Ledger List */}
                {isLoading ? (
                    <div className="flex h-48 items-center justify-center">
                        <RefreshCw className="h-7 w-7 animate-spin text-teal-600" />
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                        <History className="mx-auto mb-2 text-slate-400" size={32} />
                        <p className="text-xs font-bold text-slate-500">
                            {isArabic ? 'لا توجد حركات تدقيق مطابقة للشروط' : 'No audit records match the current filter'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                        <table className="w-full min-w-[950px] text-start text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/50">
                                    <th className="px-4 py-3 text-start">{isArabic ? 'الوقت والتاريخ' : 'Timestamp'}</th>
                                    <th className="px-3 py-3 text-start">{isArabic ? 'نوع الحركة' : 'Action'}</th>
                                    <th className="px-3 py-3 text-start">{isArabic ? 'الموظف المعني' : 'Employee'}</th>
                                    <th className="px-3 py-3 text-start">{isArabic ? 'منفذ الحركة' : 'Actor'}</th>
                                    <th className="px-3 py-3 text-start">{isArabic ? 'الفارق / التفاصيل' : 'Deviation & Notes'}</th>
                                    <th className="px-3 py-3 text-start">{isArabic ? 'البيئة والشبكة' : 'Network / IP'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredLogs.map((log) => {
                                    const actionMeta = ACTION_CONFIG[log.action_type] || {
                                        ar: log.action_type,
                                        en: log.action_type,
                                        badge: 'bg-slate-100 text-slate-700',
                                        icon: History
                                    };
                                    const ActionIcon = actionMeta.icon;
                                    const isExpanded = expandedRow === log.audit_id;

                                    return (
                                        <React.Fragment key={log.audit_id}>
                                            <tr
                                                onClick={() => setExpandedRow(isExpanded ? null : log.audit_id)}
                                                className={`cursor-pointer transition hover:bg-slate-50/90 dark:hover:bg-slate-800/40 ${log.is_violation ? 'bg-rose-50/30 dark:bg-rose-950/15' : ''}`}
                                            >
                                                {/* Timestamp */}
                                                <td className="px-4 py-3 font-mono">
                                                    <div className="font-bold text-slate-800 dark:text-slate-200">
                                                        {new Date(log.event_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {new Date(log.event_timestamp).toLocaleDateString('en-CA')}
                                                    </div>
                                                </td>

                                                {/* Action */}
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${actionMeta.badge}`}>
                                                            <ActionIcon size={11} />
                                                            {isArabic ? actionMeta.ar : actionMeta.en}
                                                        </span>
                                                        {log.is_violation && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-600 px-1.5 py-0.2 text-[9px] font-black text-white" title={isArabic ? 'مخالفة انضباط' : 'Discipline Violation'}>
                                                                !
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Employee */}
                                                <td className="px-3 py-3">
                                                    <div className="font-black text-slate-900 dark:text-white">
                                                        {log.employee_name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {log.employee_role}
                                                    </div>
                                                </td>

                                                {/* Actor */}
                                                <td className="px-3 py-3">
                                                    <div className="font-bold text-slate-700 dark:text-slate-300">
                                                        {log.actor_name === log.employee_name
                                                            ? (isArabic ? 'الموظف نفسه' : 'Self')
                                                            : log.actor_name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {log.actor_role}
                                                    </div>
                                                </td>

                                                {/* Deviation & Reason */}
                                                <td className="px-3 py-3">
                                                    {log.deviation_minutes > 0 && (
                                                        <span className="me-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.2 font-mono text-[10px] font-black text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                                            {log.deviation_minutes} {isArabic ? 'د' : 'm'}
                                                        </span>
                                                    )}
                                                    <span className="truncate text-slate-600 dark:text-slate-300">
                                                        {log.reason || '—'}
                                                    </span>
                                                </td>

                                                {/* Network / IP */}
                                                <td className="px-3 py-3 font-mono text-[11px] text-slate-500">
                                                    <div className="flex items-center gap-1">
                                                        <Globe size={11} className="text-slate-400" />
                                                        <span>{log.ip_address || '—'}</span>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expandable row for raw details */}
                                            {isExpanded && log.details && (
                                                <tr className="bg-slate-50/70 dark:bg-slate-950/50">
                                                    <td colSpan={6} className="px-4 py-3">
                                                        <div className="rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-700 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                            <div className="mb-1 text-[10px] font-black uppercase text-slate-400">
                                                                {isArabic ? 'البيانات الوصفية للحركة (Metadata Snapshot)' : 'Operation Metadata Snapshot'}
                                                            </div>
                                                            <pre className="overflow-x-auto whitespace-pre-wrap text-[11px]">
                                                                {JSON.stringify(log.details, null, 2)}
                                                            </pre>
                                                            {log.user_agent && (
                                                                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                                                                    <Monitor size={11} />
                                                                    <span>User Agent: {log.user_agent}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AttendanceAuditDrawer;
