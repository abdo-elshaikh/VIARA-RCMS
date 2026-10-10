import { useCallback, useMemo, useState, useRef } from 'react';
import {
    Clock3, Pencil, RefreshCw, Download, Calendar, Clock, Timer, TrendingDown, TrendingUp,
    LogIn, LogOut, DoorOpen, AlertTriangle, CheckCircle2, Search, Users, UserCheck,
    CalendarClock, History, Printer, Filter, X, ShieldAlert, FileText, ChevronDown,
    Building2, Sparkles, ArrowUpDown, Sliders, ShieldCheck, FileQuestion, KeyRound, Check
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useGetAttendanceQuery,
    useGetEmployeeProfilesQuery,
    useRecordManualAttendanceMutation,
    useUpdateAttendanceMutation,
    useGetAttendancePermissionsQuery
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import Modal from '../ui/Modal';
import {
    AttendanceSettingsModal,
    AttendancePermissionModal,
    AttendancePermissionsDrawer,
    AttendanceAuditDrawer
} from './attendance';

const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-teal-500 dark:focus:ring-teal-500/20';
const filterInputClass = 'h-9 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-teal-500 dark:focus:ring-teal-500/20';

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

const cleanStaffName = (name) => {
    if (!name) return '';
    return String(name).replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
};

const avatarStyle = (name) => {
    const clean = cleanStaffName(name);
    const hue = [...String(clean || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
    return { backgroundColor: `hsl(${hue} 55% 92%)`, color: `hsl(${hue} 60% 25%)`, borderColor: `hsl(${hue} 45% 75%)` };
};

const initialsOf = (name) => {
    const clean = cleanStaffName(name);
    return String(clean || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('');
};

const STATUS_STYLES = {
    Present: 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    Late: 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    Absent: 'bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    'Half-Day': 'bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800'
};

const ROLE_LABELS = {
    Radiologist: { ar: 'أطباء الأشعة', en: 'Radiologists' },
    Technician: { ar: 'فنيو الأشعة', en: 'Technologists' },
    Nurse: { ar: 'التمريض', en: 'Nurses' },
    Receptionist: { ar: 'الاستقبال', en: 'Receptionists' },
    Cashier: { ar: 'الخزينة', en: 'Cashiers' },
    Admin: { ar: 'الإدارة', en: 'Administration' },
    HR: { ar: 'الموارد البشرية', en: 'Human Resources' },
    Marketing: { ar: 'التسويق', en: 'Marketing' },
    Accountant: { ar: 'المحاسبة', en: 'Accounting' },
    Insurance_Staff: { ar: 'مسؤولو التأمين', en: 'Insurance Staff' },
    Doctor: { ar: 'الأطباء', en: 'Doctors' },
    Physician: { ar: 'الأطباء', en: 'Physicians' },
};

/** Detailed punctuality and adherence calculation against linked shift */
const calculatePunctuality = (record) => {
    const clockIn = record.clock_in ? new Date(record.clock_in) : null;
    const clockOut = record.clock_out ? new Date(record.clock_out) : null;
    const start = record.shift_start ? new Date(record.shift_start) : null;
    const end = record.shift_end ? new Date(record.shift_end) : null;

    const lateMinutes = start && clockIn && clockIn > start
        ? Math.max(0, Math.round((clockIn.getTime() - start.getTime()) / 60000))
        : (Number(record.late_minutes) || 0);

    const earlyMinutes = end && clockOut && end > clockOut
        ? Math.max(0, Math.round((end.getTime() - clockOut.getTime()) / 60000))
        : (Number(record.early_leave_minutes) || 0);

    const overtimeMinutes = end && clockOut && clockOut > end
        ? Math.max(0, Math.round((clockOut.getTime() - end.getTime()) / 60000))
        : 0;

    const scheduledHours = start && end ? Math.max(0, (end.getTime() - start.getTime()) / 3600000) : null;

    let workedHours = null;
    if (record.worked_hours !== null && record.worked_hours !== undefined) {
        workedHours = Number(record.worked_hours);
    } else if (clockIn && clockOut && record.status !== 'Absent') {
        workedHours = Math.max(0, (clockOut.getTime() - clockIn.getTime()) / 3600000);
    } else if (clockIn && !clockOut && record.status !== 'Absent') {
        workedHours = Math.max(0, (Date.now() - clockIn.getTime()) / 3600000);
    }

    const varianceMinutes = scheduledHours !== null && workedHours !== null
        ? Math.round((workedHours - scheduledHours) * 60)
        : null;

    return {
        hasShift: Boolean(start && end),
        lateMinutes,
        earlyMinutes,
        overtimeMinutes,
        scheduledHours,
        workedHours,
        varianceMinutes,
        isOnTime: lateMinutes <= 0 && earlyMinutes <= 0,
        isOvertime: overtimeMinutes > 10,
        isUnscheduled: !start
    };
};

const AttendanceManager = () => {
    const { i18n, t } = useTranslation('workspace');
    const aCopy = (key, options) => t(`hr.attendance.${key}`, options);
    const isArabic = i18n.language.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const now = new Date();

    const [filters, setFilters] = useState({
        startDate: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: toDateInput(now),
        userId: '',
        role: '',
        status: ''
    });
    const [quickFilter, setQuickFilter] = useState('all'); // all, active, ontime, late, early, overtime, absent, unscheduled, corrected
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ clockIn: '', clockOut: '', status: 'Present', notes: '' });
    const [detail, setDetail] = useState(null);
    const [showManualModal, setShowManualModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [showPermissionsDrawer, setShowPermissionsDrawer] = useState(false);
    const [showAuditDrawer, setShowAuditDrawer] = useState(false);
    const [employeeSort, setEmployeeSort] = useState('lateMinutes'); // lateMinutes, punctuality, hours, absent
    const [manualForm, setManualForm] = useState({
        userId: '',
        clockIn: toDateTimeLocal(new Date()),
        clockOut: '',
        status: 'Present',
        notes: ''
    });

    const query = {
        ...filters,
        userId: filters.userId || undefined,
        status: filters.status || undefined,
        limit: 500
    };
    const rangeInvalid = filters.startDate > filters.endDate;
    const { data: records = [], isLoading, isFetching, isError, refetch } = useGetAttendanceQuery(query, { skip: rangeInvalid });
    const { data: staff = [] } = useGetEmployeeProfilesQuery();
    const { data: pendingPermissions = [] } = useGetAttendancePermissionsQuery({ status: 'Pending' });
    const pendingPermissionsCount = pendingPermissions.length;
    const [updateAttendance, { isLoading: saving }] = useUpdateAttendanceMutation();
    const [recordManualAttendance, { isLoading: isRecordingManual }] = useRecordManualAttendanceMutation();

    // Map staff roles for dropdown
    const availableRoles = useMemo(() => {
        const rolesSet = new Set();
        staff.forEach((emp) => {
            if (emp.role) rolesSet.add(emp.role);
        });
        records.forEach((rec) => {
            if (rec.role) rolesSet.add(rec.role);
        });
        return Array.from(rolesSet).sort();
    }, [staff, records]);

    // Role translator helper
    const getRoleName = useCallback((roleKey) => {
        if (!roleKey) return '';
        const entry = ROLE_LABELS[roleKey];
        if (entry) return isArabic ? entry.ar : entry.en;
        return roleKey;
    }, [isArabic]);

    // Calculate quick filter counters across current fetched records
    const quickCounts = useMemo(() => {
        let active = 0;
        let ontime = 0;
        let late = 0;
        let early = 0;
        let overtime = 0;
        let absent = 0;
        let unscheduled = 0;
        let corrected = 0;

        for (const record of records) {
            const p = calculatePunctuality(record);
            const isOpen = record.clock_in && !record.clock_out && record.status !== 'Absent';
            if (isOpen) active++;
            if (record.status === 'Present' && p.isOnTime) ontime++;
            if (record.status === 'Late' || p.lateMinutes > 0) late++;
            if (p.earlyMinutes > 0) early++;
            if (p.overtimeMinutes > 10) overtime++;
            if (record.status === 'Absent') absent++;
            if (!record.shift_start) unscheduled++;
            if (record.corrected_by) corrected++;
        }

        return {
            all: records.length,
            active,
            ontime,
            late,
            early,
            overtime,
            absent,
            unscheduled,
            corrected
        };
    }, [records]);

    // Filter records by search text, role, and quickFilter tab
    const filtered = useMemo(() => {
        return records.filter((record) => {
            // Role filter
            if (filters.role && record.role !== filters.role) {
                return false;
            }

            // Quick filter pills
            const p = calculatePunctuality(record);
            const isOpen = record.clock_in && !record.clock_out && record.status !== 'Absent';

            if (quickFilter === 'active' && !isOpen) return false;
            if (quickFilter === 'ontime' && (record.status !== 'Present' || !p.isOnTime)) return false;
            if (quickFilter === 'late' && record.status !== 'Late' && p.lateMinutes <= 0) return false;
            if (quickFilter === 'early' && p.earlyMinutes <= 0) return false;
            if (quickFilter === 'overtime' && p.overtimeMinutes <= 10) return false;
            if (quickFilter === 'absent' && record.status !== 'Absent') return false;
            if (quickFilter === 'unscheduled' && record.shift_start) return false;
            if (quickFilter === 'corrected' && !record.corrected_by) return false;

            // Search query
            if (search.trim()) {
                const q = search.toLowerCase();
                const matchName = (record.employee_name || '').toLowerCase().includes(q);
                const matchRole = (record.role || '').toLowerCase().includes(q) || getRoleName(record.role).toLowerCase().includes(q);
                const matchNotes = (record.notes || '').toLowerCase().includes(q);
                const matchRoom = (record.room_name || '').toLowerCase().includes(q);
                if (!matchName && !matchRole && !matchNotes && !matchRoom) return false;
            }

            return true;
        });
    }, [records, filters.role, quickFilter, search, getRoleName]);

    // High-level KPI metrics summary
    const summary = useMemo(() => {
        let activeCount = 0;
        let lateCount = 0;
        let earlyCount = 0;
        let absentCount = 0;
        let totalHours = 0;
        let totalLateMinutes = 0;
        let totalOvertimeMinutes = 0;
        let correctedCount = 0;
        let onTimeCount = 0;

        for (const record of filtered) {
            const p = calculatePunctuality(record);
            const isOpen = record.clock_in && !record.clock_out && record.status !== 'Absent';
            if (isOpen) activeCount++;
            if (record.status === 'Absent') absentCount++;
            if (record.corrected_by) correctedCount++;

            if (record.status === 'Late' || p.lateMinutes > 0) {
                lateCount++;
                totalLateMinutes += p.lateMinutes;
            } else if (record.status === 'Present' && p.isOnTime) {
                onTimeCount++;
            }

            if (p.earlyMinutes > 0) {
                earlyCount++;
            }

            if (p.overtimeMinutes > 0) {
                totalOvertimeMinutes += p.overtimeMinutes;
            }

            if (p.workedHours !== null && record.status !== 'Absent') {
                totalHours += p.workedHours;
            }
        }

        const validAttendanceEntries = filtered.length - absentCount;
        const punctualityRate = filtered.length > 0
            ? Math.max(0, Math.min(100, Math.round(((filtered.length - lateCount - absentCount) / filtered.length) * 100)))
            : 100;

        const avgHours = validAttendanceEntries > 0 ? totalHours / validAttendanceEntries : 0;

        return {
            totalRecords: filtered.length,
            activeCount,
            lateCount,
            earlyCount,
            absentCount,
            totalHours,
            avgHours,
            totalLateMinutes,
            totalOvertimeMinutes,
            correctedCount,
            punctualityRate
        };
    }, [filtered]);

    // Per-employee attendance commitment rollup & patterns
    const employeeStats = useMemo(() => {
        const byUser = new Map();
        for (const record of records) {
            const p = calculatePunctuality(record);
            const entry = byUser.get(record.user_id) || {
                userId: record.user_id,
                name: record.employee_name,
                role: record.role,
                sessions: 0,
                onTimeSessions: 0,
                lateSessions: 0,
                earlySessions: 0,
                absentDays: 0,
                lateMinutes: 0,
                earlyMinutes: 0,
                overtimeMinutes: 0,
                hours: 0,
                open: false
            };
            entry.sessions += 1;
            entry.open = entry.open || (record.clock_in && !record.clock_out && record.status !== 'Absent');

            if (record.status === 'Absent') {
                entry.absentDays += 1;
            } else {
                if (record.status === 'Late' || p.lateMinutes > 0) {
                    entry.lateSessions += 1;
                    entry.lateMinutes += p.lateMinutes;
                } else if (record.status === 'Present' && p.isOnTime) {
                    entry.onTimeSessions += 1;
                }

                if (p.earlyMinutes > 0) {
                    entry.earlySessions += 1;
                    entry.earlyMinutes += p.earlyMinutes;
                }

                if (p.overtimeMinutes > 0) {
                    entry.overtimeMinutes += p.overtimeMinutes;
                }

                if (p.workedHours !== null) {
                    entry.hours += p.workedHours;
                }
            }
            byUser.set(record.user_id, entry);
        }

        const list = [...byUser.values()].map((e) => {
            const valid = e.sessions - e.absentDays;
            const rate = e.sessions > 0
                ? Math.max(0, Math.min(100, Math.round(((e.sessions - e.lateSessions - e.absentDays) / e.sessions) * 100)))
                : 100;
            return { ...e, punctualityRate: rate };
        });

        // Sorting
        if (employeeSort === 'lateMinutes') {
            return list.sort((a, b) => b.lateMinutes - a.lateMinutes || b.lateSessions - a.lateSessions);
        } else if (employeeSort === 'punctuality') {
            return list.sort((a, b) => a.punctualityRate - b.punctualityRate || b.lateMinutes - a.lateMinutes);
        } else if (employeeSort === 'hours') {
            return list.sort((a, b) => b.hours - a.hours);
        } else if (employeeSort === 'absent') {
            return list.sort((a, b) => b.absentDays - a.absentDays || b.lateSessions - a.lateSessions);
        }
        return list;
    }, [records, employeeSort]);

    // Live staff currently clocked-in
    const activeStaffNow = useMemo(() => {
        return records.filter((record) => record.clock_in && !record.clock_out && record.status !== 'Absent');
    }, [records]);

    const openEdit = (record) => {
        setEditing(record);
        setForm({
            clockIn: toDateTimeLocal(record.clock_in),
            clockOut: toDateTimeLocal(record.clock_out),
            status: record.status || 'Present',
            notes: record.notes || ''
        });
    };

    const handleMatchShiftTimes = () => {
        if (!editing?.shift_start) {
            toast.error(aCopy('noShift'));
            return;
        }
        setForm((prev) => ({
            ...prev,
            clockIn: toDateTimeLocal(editing.shift_start),
            clockOut: toDateTimeLocal(editing.shift_end),
            status: 'Present'
        }));
        toast.success(aCopy('matchShiftTimes'));
    };

    const save = async (event) => {
        event.preventDefault();
        if (!editing) return;
        if (form.clockOut && form.clockOut < form.clockIn) {
            toast.error(isArabic ? 'وقت الانصراف لا يمكن أن يكون قبل وقت الحضور' : 'Clock out cannot be before clock in');
            return;
        }
        try {
            await updateAttendance({
                id: editing.log_id,
                clockIn: new Date(form.clockIn).toISOString(),
                clockOut: form.clockOut ? new Date(form.clockOut).toISOString() : null,
                status: form.status,
                notes: form.notes.trim() || undefined
            }).unwrap();
            toast.success(aCopy('corrected'));
            setEditing(null);
        } catch (error) {
            toast.error(getErrorMessage(error, aCopy('correctError')));
        }
    };

    const handleManualSubmit = async (event) => {
        event.preventDefault();
        if (!manualForm.userId) {
            toast.error(aCopy('selectEmployee'));
            return;
        }
        if (!manualForm.notes || manualForm.notes.trim().length < 3) {
            toast.error(aCopy('manualNoteRequired'));
            return;
        }
        if (manualForm.clockOut && manualForm.clockOut < manualForm.clockIn) {
            toast.error(isArabic ? 'وقت الانصراف لا يمكن أن يكون قبل وقت الحضور' : 'Clock out cannot be before clock in');
            return;
        }
        try {
            await recordManualAttendance({
                userId: manualForm.userId,
                clockIn: new Date(manualForm.clockIn).toISOString(),
                clockOut: manualForm.clockOut ? new Date(manualForm.clockOut).toISOString() : null,
                status: manualForm.status,
                notes: manualForm.notes.trim()
            }).unwrap();
            toast.success(aCopy('manualRecorded'));
            setShowManualModal(false);
            setManualForm({
                userId: '',
                clockIn: toDateTimeLocal(new Date()),
                clockOut: '',
                status: 'Present',
                notes: ''
            });
        } catch (error) {
            toast.error(getErrorMessage(error, aCopy('manualError')));
        }
    };

    const exportToCSV = () => {
        if (filtered.length === 0) {
            toast.error(aCopy('noExportData'));
            return;
        }

        const headers = [
            aCopy('csvEmployee'),
            aCopy('csvRole'),
            aCopy('csvDate'),
            aCopy('csvClockIn'),
            aCopy('csvClockOut'),
            aCopy('csvStatus'),
            aCopy('csvWorkedHours'),
            aCopy('csvLate'),
            aCopy('csvEarly'),
            aCopy('csvShift'),
            aCopy('csvRoom'),
            aCopy('csvCorrected'),
            aCopy('csvNotes')
        ];
        const csvRows = [headers.join(',')];

        filtered.forEach((record) => {
            const p = calculatePunctuality(record);
            const row = [
                `"${cleanStaffName(record.employee_name || '')}"`,
                `"${getRoleName(record.role || '')}"`,
                `"${record.clock_in ? new Date(record.clock_in).toLocaleDateString('en-CA') : ''}"`,
                `"${record.clock_in ? new Date(record.clock_in).toLocaleTimeString('en-GB') : ''}"`,
                `"${record.clock_out ? new Date(record.clock_out).toLocaleTimeString('en-GB') : ''}"`,
                `"${record.status || ''}"`,
                p.workedHours !== null ? p.workedHours.toFixed(2) : '',
                p.lateMinutes.toFixed(0),
                p.earlyMinutes.toFixed(0),
                record.shift_start ? `"${new Date(record.shift_start).toLocaleTimeString('en-GB')}-${new Date(record.shift_end).toLocaleTimeString('en-GB')}"` : '""',
                `"${record.room_name || ''}"`,
                record.corrected_by ? 'yes' : 'no',
                `"${(record.notes || '').replace(/"/g, '""')}"`
            ];
            csvRows.push(row.join(','));
        });

        const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `VIARA_Attendance_Report_${filters.startDate}_to_${filters.endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(aCopy('exported'));
    };

    const handlePrint = () => {
        window.print();
    };

    const applyRangePreset = (preset) => {
        const end = new Date();
        const start = new Date();
        if (preset === 'today') {
            // start is today
        } else if (preset === 'yesterday') {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else if (preset === 'week') {
            start.setDate(start.getDate() - 6);
        } else if (preset === 'month') {
            start.setDate(1);
        } else if (preset === 'lastMonth') {
            start.setMonth(start.getMonth() - 1, 1);
            end.setDate(0); // last day of previous month
        }
        setFilters((current) => ({
            ...current,
            startDate: toDateInput(start),
            endDate: toDateInput(end)
        }));
    };

    const clearAllFilters = () => {
        setFilters({
            startDate: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
            endDate: toDateInput(now),
            userId: '',
            role: '',
            status: ''
        });
        setQuickFilter('all');
        setSearch('');
    };

    const isFiltered = filters.userId || filters.role || filters.status || quickFilter !== 'all' || search;

    const formatDateTime = (value) => value
        ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
        : '—';

    const formatTimeOnly = (value) => value
        ? new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';

    const formatDateOnly = (value) => {
        if (!value) return '—';
        const d = new Date(value);
        const todayStr = toDateInput(new Date());
        const dateStr = toDateInput(d);
        if (dateStr === todayStr) {
            return aCopy('today');
        }
        return d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
    };

    return (
        <div className="space-y-4 print:space-y-2">
            {/* 1. Executive Operations Header */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-900 bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-4.5 text-white shadow-sm dark:border-slate-800 print:hidden">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30">
                            <Clock3 size={24} />
                        </span>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-black tracking-tight text-white sm:text-xl">
                                    {aCopy('ledgerTitle')}
                                </h1>
                                <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/20 px-2.5 py-0.5 text-[10px] font-black text-teal-300 ring-1 ring-teal-400/30">
                                    <Sparkles size={11} />
                                    {isArabic ? 'سجل تشغيلي تفصيلي' : 'Operational Log'}
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs font-semibold text-slate-300">
                                {aCopy('ledgerDescription')}
                            </p>
                        </div>
                    </div>

                    {/* Date Presets & Main Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1 backdrop-blur-md">
                            <button
                                type="button"
                                onClick={() => applyRangePreset('today')}
                                className="rounded-lg px-2.5 py-1 text-xs font-black text-slate-200 hover:bg-white/20 hover:text-white transition"
                            >
                                {aCopy('today')}
                            </button>
                            <button
                                type="button"
                                onClick={() => applyRangePreset('week')}
                                className="rounded-lg px-2.5 py-1 text-xs font-black text-slate-200 hover:bg-white/20 hover:text-white transition"
                            >
                                {aCopy('thisWeek')}
                            </button>
                            <button
                                type="button"
                                onClick={() => applyRangePreset('month')}
                                className="rounded-lg px-2.5 py-1 text-xs font-black text-slate-200 hover:bg-white/20 hover:text-white transition"
                            >
                                {aCopy('thisMonth')}
                            </button>
                            <button
                                type="button"
                                onClick={() => applyRangePreset('lastMonth')}
                                className="rounded-lg px-2.5 py-1 text-xs font-black text-slate-200 hover:bg-white/20 hover:text-white transition"
                            >
                                {aCopy('lastMonth')}
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowPermissionModal(true)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-black text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
                        >
                            <FileQuestion size={14} className="text-teal-300" />
                            <span>{aCopy('requestPermission')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowPermissionsDrawer(true)}
                            className="relative inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-black text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
                        >
                            <UserCheck size={14} className="text-teal-300" />
                            <span>{aCopy('managePermissions')}</span>
                            {pendingPermissionsCount > 0 && (
                                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-slate-950">
                                    {pendingPermissionsCount}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowAuditDrawer(true)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-black text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
                        >
                            <History size={14} className="text-teal-300" />
                            <span>{aCopy('auditLedger')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowSettingsModal(true)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-black text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95"
                            title={aCopy('disciplineSettings')}
                        >
                            <Sliders size={14} className="text-teal-300" />
                            <span className="hidden sm:inline">{aCopy('disciplineSettings')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowManualModal(true)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-teal-500 px-3.5 text-xs font-black text-slate-950 shadow-sm transition hover:bg-teal-400 active:scale-95"
                        >
                            <Clock size={14} />
                            <span>{aCopy('manualEntry')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={exportToCSV}
                            disabled={filtered.length === 0}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-black text-white backdrop-blur-md transition hover:bg-white/25 active:scale-95 disabled:opacity-40"
                        >
                            <Download size={14} />
                            <span>{aCopy('exportCsv')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handlePrint}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
                            title={aCopy('print')}
                        >
                            <Printer size={14} />
                        </button>

                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching || rangeInvalid}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 disabled:opacity-50"
                            title={aCopy('refresh')}
                        >
                            <RefreshCw size={14} className={isFetching ? 'animate-spin text-teal-300' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Live On-Duty Radar (Clocked in staff strip) */}
            {activeStaffNow.length > 0 && (
                <div className="rounded-2xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-3.5 shadow-2xs dark:border-emerald-800/60 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-slate-900 print:hidden">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-black text-emerald-950 dark:text-emerald-200">
                            <span className="relative flex h-3 w-3">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900" />
                            </span>
                            <span>{aCopy('onDutyNow')} ({activeStaffNow.length})</span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400">
                            {isArabic ? 'جلسات حضور نشطة ومفتوحة الآن' : 'Active sessions in progress'}
                        </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-2">
                        {activeStaffNow.map((member) => {
                            const elapsedHours = (Date.now() - new Date(member.clock_in)) / 3600000;
                            return (
                                <button
                                    key={member.log_id}
                                    type="button"
                                    onClick={() => setDetail(member)}
                                    className="group inline-flex items-center gap-2 rounded-xl border border-emerald-200/90 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs transition hover:border-emerald-400 hover:shadow-xs dark:border-emerald-900/60 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    <span className="grid h-6 w-6 place-items-center rounded-full text-[9px] font-black" style={avatarStyle(member.employee_name)}>
                                        {initialsOf(member.employee_name)}
                                    </span>
                                    <div className="text-start">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-black text-slate-900 group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">
                                                {cleanStaffName(member.employee_name)}
                                            </span>
                                            {member.room_name && (
                                                <span className="rounded bg-teal-50 px-1 text-[9px] font-bold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                                    {member.room_name}
                                                </span>
                                            )}
                                        </div>
                                        <p className="font-mono text-[10px] text-slate-400">
                                            {formatTimeOnly(member.clock_in)} · {elapsedHours.toFixed(1)}h {aCopy('active')}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 3. Executive KPI Metric Dashboard (6 Modern Cards) */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-3" aria-label={aCopy('summaryLabel')}>
                {/* 1: Total Logs */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{aCopy('totalLogs')}</span>
                        <Calendar size={13} className="text-slate-400" />
                    </div>
                    <p className="mt-1 font-mono text-2xl font-black text-slate-900 dark:text-white">{summary.totalRecords}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-400">{filters.startDate} → {filters.endDate}</p>
                </div>

                {/* 2: On Duty Now */}
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
                    <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{aCopy('openSessions')}</span>
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    </div>
                    <p className="mt-1 font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">{summary.activeCount}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-emerald-800/70 dark:text-emerald-300/70">{aCopy('onDutyNow')}</p>
                </div>

                {/* 3: Punctuality Rate % with visual progress bar */}
                <div className="rounded-2xl border border-teal-200/80 bg-white p-3.5 shadow-2xs dark:border-teal-900/40 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">{aCopy('punctualityIndex')}</span>
                        <CheckCircle2 size={13} className="text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <p className="font-mono text-2xl font-black text-teal-700 dark:text-teal-300">{summary.punctualityRate}%</p>
                        <span className="text-[10px] font-bold text-slate-400">{aCopy('onTime')}</span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                            className={`h-full transition-all duration-500 ${summary.punctualityRate >= 90 ? 'bg-teal-500' : summary.punctualityRate >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${summary.punctualityRate}%` }}
                        />
                    </div>
                </div>

                {/* 4: Late Arrivals & Minutes */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">{aCopy('lateRecords')}</span>
                        <AlertTriangle size={13} className="text-amber-500" />
                    </div>
                    <p className={`mt-1 font-mono text-2xl font-black ${summary.lateCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                        {summary.lateCount}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                        {summary.totalLateMinutes.toFixed(0)} {aCopy('lateMinutesShort')}
                    </p>
                </div>

                {/* 5: Net Logged Hours */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{aCopy('recordedHours')}</span>
                        <Timer size={13} className="text-teal-600" />
                    </div>
                    <p className="mt-1 font-mono text-2xl font-black text-slate-900 dark:text-white">
                        {summary.totalHours.toFixed(1)}h
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                        {isArabic ? `متوسط ${summary.avgHours.toFixed(1)} س/جلسة` : `Avg ${summary.avgHours.toFixed(1)}h / session`}
                    </p>
                </div>

                {/* 6: Manual Corrections & Audit */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">{aCopy('manualCorrections')}</span>
                        <History size={13} className="text-sky-500" />
                    </div>
                    <p className={`mt-1 font-mono text-2xl font-black ${summary.correctedCount > 0 ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`}>
                        {summary.correctedCount}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-400">{aCopy('auditTrail')}</p>
                </div>
            </section>

            {/* 4. Main Ledger Card */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Quick Status Triage Tabs */}
                <div className="border-b border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-950/40 print:hidden">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        <button
                            type="button"
                            onClick={() => setQuickFilter('all')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'all' ? 'bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                        >
                            <span>{aCopy('quickFilterAll')}</span>
                            <span className="rounded-full bg-black/10 dark:bg-white/20 px-1.5 py-0.2 text-[10px] font-mono">
                                {quickCounts.all}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQuickFilter('active')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-emerald-700 hover:bg-emerald-50 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-slate-800'}`}
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>{aCopy('quickFilterActive')}</span>
                            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.2 text-[10px] font-mono text-emerald-800 dark:text-emerald-300">
                                {quickCounts.active}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQuickFilter('ontime')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'ontime' ? 'bg-teal-600 text-white shadow-xs' : 'bg-white text-teal-700 hover:bg-teal-50 dark:bg-slate-900 dark:text-teal-400 dark:hover:bg-slate-800'}`}
                        >
                            <CheckCircle2 size={12} />
                            <span>{aCopy('quickFilterOnTime')}</span>
                            <span className="rounded-full bg-teal-100 dark:bg-teal-950 px-1.5 py-0.2 text-[10px] font-mono text-teal-800 dark:text-teal-300">
                                {quickCounts.ontime}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQuickFilter('late')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'late' ? 'bg-amber-600 text-white shadow-xs' : 'bg-white text-amber-700 hover:bg-amber-50 dark:bg-slate-900 dark:text-amber-400 dark:hover:bg-slate-800'}`}
                        >
                            <AlertTriangle size={12} />
                            <span>{aCopy('quickFilterLate')}</span>
                            <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-1.5 py-0.2 text-[10px] font-mono text-amber-800 dark:text-amber-300">
                                {quickCounts.late}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQuickFilter('early')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'early' ? 'bg-rose-600 text-white shadow-xs' : 'bg-white text-rose-700 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-slate-800'}`}
                        >
                            <TrendingDown size={12} />
                            <span>{aCopy('quickFilterEarly')}</span>
                            <span className="rounded-full bg-rose-100 dark:bg-rose-950 px-1.5 py-0.2 text-[10px] font-mono text-rose-800 dark:text-rose-300">
                                {quickCounts.early}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQuickFilter('overtime')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'overtime' ? 'bg-sky-600 text-white shadow-xs' : 'bg-white text-sky-700 hover:bg-sky-50 dark:bg-slate-900 dark:text-sky-400 dark:hover:bg-slate-800'}`}
                        >
                            <TrendingUp size={12} />
                            <span>{aCopy('quickFilterOvertime')}</span>
                            <span className="rounded-full bg-sky-100 dark:bg-sky-950 px-1.5 py-0.2 text-[10px] font-mono text-sky-800 dark:text-sky-300">
                                {quickCounts.overtime}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQuickFilter('absent')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'absent' ? 'bg-rose-800 text-white shadow-xs' : 'bg-white text-rose-800 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-slate-800'}`}
                        >
                            <span>{aCopy('quickFilterAbsent')}</span>
                            <span className="rounded-full bg-rose-100 dark:bg-rose-950 px-1.5 py-0.2 text-[10px] font-mono text-rose-900 dark:text-rose-300">
                                {quickCounts.absent}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQuickFilter('unscheduled')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'unscheduled' ? 'bg-slate-700 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                        >
                            <span>{aCopy('quickFilterUnscheduled')}</span>
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                {quickCounts.unscheduled}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQuickFilter('corrected')}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${quickFilter === 'corrected' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-indigo-700 hover:bg-indigo-50 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-slate-800'}`}
                        >
                            <History size={12} />
                            <span>{aCopy('quickFilterCorrected')}</span>
                            <span className="rounded-full bg-indigo-100 dark:bg-indigo-950 px-1.5 py-0.2 text-[10px] font-mono text-indigo-800 dark:text-indigo-300">
                                {quickCounts.corrected}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Filter Controls Row */}
                <header className="border-b border-slate-100 p-3.5 dark:border-slate-800 print:hidden">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Date Pickers */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <input
                                aria-label={aCopy('startDate')}
                                type="date"
                                className={`${filterInputClass} w-[135px]`}
                                value={filters.startDate}
                                onChange={(event) => setFilters({ ...filters, startDate: event.target.value })}
                            />
                            <span className="text-slate-400 font-bold">→</span>
                            <input
                                aria-label={aCopy('endDate')}
                                type="date"
                                className={`${filterInputClass} w-[135px]`}
                                value={filters.endDate}
                                onChange={(event) => setFilters({ ...filters, endDate: event.target.value })}
                            />
                        </div>

                        {/* Role / Department Filter */}
                        <div className="relative shrink-0">
                            <select
                                aria-label={aCopy('role')}
                                className={`${filterInputClass} min-w-[150px]`}
                                value={filters.role}
                                onChange={(event) => setFilters({ ...filters, role: event.target.value })}
                            >
                                <option value="">{aCopy('allRoles')}</option>
                                {availableRoles.map((role) => (
                                    <option key={role} value={role}>
                                        {getRoleName(role)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Specific Employee Selector */}
                        <select
                            aria-label={aCopy('employee')}
                            className={`${filterInputClass} min-w-[160px] shrink-0`}
                            value={filters.userId}
                            onChange={(event) => setFilters({ ...filters, userId: event.target.value })}
                        >
                            <option value="">{aCopy('allEmployees')}</option>
                            {staff.map((employee) => (
                                <option key={employee.user_id} value={employee.user_id}>
                                    {cleanStaffName(employee.full_name)} ({getRoleName(employee.role)})
                                </option>
                            ))}
                        </select>

                        {/* Status Selector */}
                        <select
                            aria-label={aCopy('status')}
                            className={`${filterInputClass} min-w-[110px] shrink-0`}
                            value={filters.status}
                            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
                        >
                            <option value="">{aCopy('allStatuses')}</option>
                            {['Present', 'Late', 'Absent', 'Half-Day'].map((status) => (
                                <option key={status} value={status}>
                                    {aCopy(`statuses.${status}`)}
                                </option>
                            ))}
                        </select>

                        {/* Search Input */}
                        <div className="flex flex-1 min-w-[180px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950">
                            <Search size={13} className="text-slate-400 shrink-0" />
                            <input
                                type="search"
                                aria-label={aCopy('search')}
                                placeholder={aCopy('searchPlaceholder')}
                                className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-700 outline-none placeholder:font-semibold placeholder:text-slate-400 dark:text-slate-200"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                            {search && (
                                <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Reset Filter Button */}
                        {isFiltered && (
                            <button
                                type="button"
                                onClick={clearAllFilters}
                                className="inline-flex h-9 items-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 px-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                            >
                                <X size={12} />
                                <span>{aCopy('clearFilter')}</span>
                            </button>
                        )}
                    </div>
                </header>

                {/* Print Title (Only in browser print) */}
                <div className="hidden print:block p-4 border-b border-slate-200 text-center">
                    <h2 className="text-base font-black text-slate-900">VIARA Medical Diagnostic Imaging Center</h2>
                    <h3 className="text-sm font-bold text-slate-700">{aCopy('ledgerTitle')}</h3>
                    <p className="text-xs text-slate-500">{filters.startDate} — {filters.endDate}</p>
                </div>

                {/* Main Table Display */}
                {rangeInvalid ? (
                    <State text={aCopy('invalidRange')} error />
                ) : isLoading ? (
                    <State text={aCopy('loading')} />
                ) : isError ? (
                    <State text={aCopy('loadError')} error />
                ) : filtered.length === 0 ? (
                    <State text={aCopy('empty')} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px] border-collapse text-start text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/50">
                                    <th className="px-4 py-3 text-start">{aCopy('employee')}</th>
                                    <th className="px-3 py-3 text-start">{aCopy('day')}</th>
                                    <th className="px-3 py-3 text-start">{aCopy('scheduledShift')}</th>
                                    <th className="px-3 py-3 text-start">{aCopy('clockIn')}</th>
                                    <th className="px-3 py-3 text-start">{aCopy('clockOut')}</th>
                                    <th className="px-3 py-3 text-start">{aCopy('worked')}</th>
                                    <th className="px-3 py-3 text-start">{aCopy('punctuality')}</th>
                                    <th className="px-3 py-3 text-start">{aCopy('status')}</th>
                                    <th className="px-4 py-3 text-end print:hidden">{aCopy('actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filtered.map((record) => {
                                    const p = calculatePunctuality(record);
                                    const isOpen = record.clock_in && !record.clock_out && record.status !== 'Absent';
                                    const wasCorrected = Boolean(record.corrected_by);

                                    return (
                                        <tr
                                            key={record.log_id}
                                            className={`transition hover:bg-slate-50/90 dark:hover:bg-slate-800/40 ${wasCorrected ? 'bg-sky-50/30 dark:bg-sky-950/10' : ''}`}
                                        >
                                            {/* 1. Employee */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="relative">
                                                        <span
                                                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[10px] font-black shadow-2xs"
                                                            style={avatarStyle(record.employee_name)}
                                                        >
                                                            {initialsOf(record.employee_name)}
                                                        </span>
                                                        {isOpen && (
                                                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-black text-slate-900 dark:text-white">
                                                            {cleanStaffName(record.employee_name)}
                                                        </p>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                                {getRoleName(record.role)}
                                                            </span>
                                                            {wasCorrected && (
                                                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-sky-600 dark:text-sky-400" title={aCopy('correctedBadge')}>
                                                                    <History size={9} />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 2. Day & Date */}
                                            <td className="px-3 py-3">
                                                <div className="font-bold text-slate-700 dark:text-slate-200">
                                                    {formatDateOnly(record.clock_in)}
                                                </div>
                                                <div className="font-mono text-[10px] text-slate-400">
                                                    {record.clock_in ? new Date(record.clock_in).toLocaleDateString('en-CA') : '—'}
                                                </div>
                                            </td>

                                            {/* 3. Scheduled Shift Window */}
                                            <td className="px-3 py-3">
                                                {record.shift_start ? (
                                                    <div>
                                                        <div className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300" dir="ltr">
                                                            <CalendarClock size={11} className="text-teal-600 dark:text-teal-400" />
                                                            <span>{formatTimeOnly(record.shift_start)} – {formatTimeOnly(record.shift_end)}</span>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                            {p.scheduledHours !== null && (
                                                                <span className="font-mono text-[9px] font-black text-slate-400">
                                                                    {p.scheduledHours.toFixed(1)}h
                                                                </span>
                                                            )}
                                                            {record.room_name && (
                                                                <span className="inline-flex items-center gap-0.5 rounded bg-teal-50 px-1.5 py-0.2 text-[9px] font-bold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                                                    <DoorOpen size={9} />
                                                                    {record.room_name}
                                                                </span>
                                                            )}
                                                            <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-bold ${
                                                                record.shift_link_type === 'Manual'
                                                                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                                                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                            }`}>
                                                                {record.shift_link_type === 'Manual' ? aCopy('shiftLinkManual') : aCopy('shiftLinkAuto')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                        {aCopy('unscheduledBadge')}
                                                    </span>
                                                )}
                                            </td>

                                            {/* 4. Clock In */}
                                            <td className="px-3 py-3">
                                                {record.status === 'Absent' ? (
                                                    <span className="text-slate-400 font-bold">—</span>
                                                ) : (
                                                    <div>
                                                        <span className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-800 dark:text-slate-100">
                                                            <LogIn size={12} className={p.lateMinutes > 0 ? 'text-amber-500' : 'text-emerald-500'} />
                                                            {formatTimeOnly(record.clock_in)}
                                                        </span>
                                                        {p.lateMinutes > 0 && (
                                                            <div className="mt-0.5">
                                                                <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.2 font-mono text-[9px] font-black text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                                                                    +{p.lateMinutes}m {aCopy('lateShort')}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 5. Clock Out */}
                                            <td className="px-3 py-3">
                                                {record.status === 'Absent' ? (
                                                    <span className="text-slate-400 font-bold">—</span>
                                                ) : isOpen ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800">
                                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                        {aCopy('active')}
                                                    </span>
                                                ) : (
                                                    <div>
                                                        <span className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-800 dark:text-slate-100">
                                                            <LogOut size={12} className="text-rose-400" />
                                                            {formatTimeOnly(record.clock_out)}
                                                        </span>
                                                        {p.earlyMinutes > 0 ? (
                                                            <div className="mt-0.5">
                                                                <span className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.2 font-mono text-[9px] font-black text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                                                                    -{p.earlyMinutes}m {aCopy('earlyShort')}
                                                                </span>
                                                            </div>
                                                        ) : p.overtimeMinutes > 10 ? (
                                                            <div className="mt-0.5">
                                                                <span className="inline-flex items-center rounded bg-sky-100 px-1.5 py-0.2 font-mono text-[9px] font-black text-sky-800 dark:bg-sky-950/80 dark:text-sky-300">
                                                                    +{p.overtimeMinutes}m {aCopy('overtimeShort')}
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 6. Net Worked Hours */}
                                            <td className="px-3 py-3">
                                                {record.status === 'Absent' ? (
                                                    <span className="text-slate-400 font-bold">0.00h</span>
                                                ) : p.workedHours !== null ? (
                                                    <div>
                                                        <span className={`font-mono font-black ${isOpen ? 'text-emerald-600 dark:text-emerald-400' : 'text-teal-700 dark:text-teal-300'}`}>
                                                            {p.workedHours.toFixed(2)}h
                                                        </span>
                                                        {p.varianceMinutes !== null && (
                                                            <div className="text-[9px] font-bold font-mono">
                                                                {p.varianceMinutes > 0 ? (
                                                                    <span className="text-teal-600 dark:text-teal-400">+{p.varianceMinutes}m</span>
                                                                ) : p.varianceMinutes < 0 ? (
                                                                    <span className="text-rose-600 dark:text-rose-400">{p.varianceMinutes}m</span>
                                                                ) : (
                                                                    <span className="text-slate-400">0m</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>

                                            {/* 7. Punctuality Badges */}
                                            <td className="px-3 py-3">
                                                {record.status === 'Absent' ? (
                                                    <span className="text-[10px] font-black text-rose-600 dark:text-rose-400">
                                                        {aCopy('statuses.Absent')}
                                                    </span>
                                                ) : p.isOnTime ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                                                        <CheckCircle2 size={12} />
                                                        {aCopy('onTime')}
                                                    </span>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        {p.lateMinutes > 0 && (
                                                            <span className="text-[10px] font-black text-amber-600 dark:text-amber-400">
                                                                {aCopy('lateShort')} {p.lateMinutes}m
                                                            </span>
                                                        )}
                                                        {p.earlyMinutes > 0 && (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[10px] font-black text-rose-600 dark:text-rose-400">
                                                                    {aCopy('earlyShort')} {p.earlyMinutes}m
                                                                </span>
                                                                {record.early_departure_permitted && (
                                                                    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.2 text-[8px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                                        <Check size={8} />
                                                                        {aCopy('approvedPermission')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 8. Status & Notes */}
                                            <td className="px-3 py-3">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${STATUS_STYLES[record.status] || 'bg-slate-100 text-slate-700'}`}>
                                                        {aCopy(`statuses.${record.status}`)}
                                                    </span>
                                                    {record.notes && (
                                                        <span
                                                            className="inline-flex max-w-[150px] items-center gap-1 truncate rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                                            title={record.notes}
                                                        >
                                                            <FileText size={9} className="shrink-0 text-slate-400" />
                                                            <span className="truncate">{record.notes}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 9. Actions */}
                                            <td className="px-4 py-3 text-end print:hidden">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDetail(record)}
                                                        title={aCopy('viewDetails')}
                                                        className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-2xs transition hover:border-teal-400 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                                                    >
                                                        <Search size={12} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(record)}
                                                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 shadow-2xs transition hover:border-teal-400 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                                    >
                                                        <Pencil size={11} />
                                                        <span>{aCopy('correct')}</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* 5. Per-Employee Attendance Patterns & Commitment (تحليلات انضباط الكادر) */}
            {employeeStats.length > 1 && (
                <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:hidden">
                    <header className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/70 p-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-center gap-2">
                            <Users size={16} className="text-teal-600 dark:text-teal-400" />
                            <div>
                                <h3 className="text-xs font-black text-slate-900 dark:text-white">
                                    {aCopy('patternsTitle')}
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400">
                                    {aCopy('patternsHelp')}
                                </p>
                            </div>
                        </div>

                        {/* Sort Selector */}
                        <div className="flex items-center gap-1.5">
                            <ArrowUpDown size={12} className="text-slate-400" />
                            <span className="text-[10px] font-black text-slate-400">{aCopy('sortBy')}:</span>
                            <select
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                value={employeeSort}
                                onChange={(event) => setEmployeeSort(event.target.value)}
                            >
                                <option value="lateMinutes">{aCopy('sortLateMinutes')}</option>
                                <option value="punctuality">{aCopy('sortLowestPunctuality')}</option>
                                <option value="hours">{aCopy('sortMostHours')}</option>
                                <option value="absent">{aCopy('sortMostAbsent')}</option>
                            </select>
                        </div>
                    </header>

                    <div className="grid gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {employeeStats.map((entry) => {
                            const isSelected = filters.userId === entry.userId;
                            return (
                                <button
                                    key={entry.userId}
                                    type="button"
                                    onClick={() => setFilters((current) => ({
                                        ...current,
                                        userId: current.userId === entry.userId ? '' : entry.userId
                                    }))}
                                    className={`group rounded-2xl border p-3.5 text-start transition hover:border-teal-400/80 hover:shadow-xs dark:hover:border-teal-500/50 ${isSelected ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-200 dark:border-teal-500 dark:bg-teal-950/30' : entry.lateMinutes > 30 ? 'border-amber-200/80 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10' : 'border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black" style={avatarStyle(entry.name)}>
                                                {initialsOf(entry.name)}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-black text-slate-900 group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">
                                                    {cleanStaffName(entry.name)}
                                                </p>
                                                <p className="text-[9px] font-bold text-slate-400 truncate">
                                                    {getRoleName(entry.role)} · {aCopy('sessions', { count: entry.sessions })}
                                                </p>
                                            </div>
                                        </div>
                                        {entry.open && (
                                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" title={aCopy('active')} />
                                        )}
                                    </div>

                                    {/* Punctuality Rate Bar */}
                                    <div className="mt-2.5">
                                        <div className="flex items-center justify-between text-[10px] font-bold">
                                            <span className="text-slate-400">{aCopy('punctualityRate')}</span>
                                            <span className={`font-mono font-black ${entry.punctualityRate >= 90 ? 'text-teal-600 dark:text-teal-400' : entry.punctualityRate >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {entry.punctualityRate}%
                                            </span>
                                        </div>
                                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                                            <div
                                                className={`h-full ${entry.punctualityRate >= 90 ? 'bg-teal-500' : entry.punctualityRate >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                style={{ width: `${entry.punctualityRate}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Metric Tiles */}
                                    <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                                        <div className="rounded-lg bg-white/80 py-1 shadow-2xs dark:bg-slate-900/60">
                                            <p className="font-mono text-[11px] font-black text-teal-700 dark:text-teal-300">{entry.hours.toFixed(1)}h</p>
                                            <p className="text-[8px] font-black uppercase text-slate-400">{aCopy('hoursShort')}</p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 py-1 shadow-2xs dark:bg-slate-900/60">
                                            <p className={`font-mono text-[11px] font-black ${entry.lateSessions > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                                                {entry.lateSessions}
                                            </p>
                                            <p className="text-[8px] font-black uppercase text-slate-400">{aCopy('lateShort')}</p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 py-1 shadow-2xs dark:bg-slate-900/60">
                                            <p className={`font-mono text-[11px] font-black ${entry.lateMinutes > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                                                {entry.lateMinutes.toFixed(0)}m
                                            </p>
                                            <p className="text-[8px] font-black uppercase text-slate-400">{aCopy('lateMinutesShort')}</p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 py-1 shadow-2xs dark:bg-slate-900/60">
                                            <p className={`font-mono text-[11px] font-black ${entry.absentDays > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                                                {entry.absentDays}
                                            </p>
                                            <p className="text-[8px] font-black uppercase text-slate-400">{aCopy('absentShort')}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* 6. Comprehensive Detail Modal */}
            <Modal isOpen={Boolean(detail)} onClose={() => setDetail(null)} title={aCopy('detailTitle')} size="default">
                {detail && (() => {
                    const p = calculatePunctuality(detail);
                    return (
                        <div className="space-y-4">
                            {/* Employee Identity Card */}
                            <div className="flex items-center gap-3 rounded-2xl border border-teal-200/80 bg-teal-50/80 p-3.5 dark:border-teal-500/20 dark:bg-teal-500/10">
                                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-sm font-black shadow-xs" style={avatarStyle(detail.employee_name)}>
                                    {initialsOf(detail.employee_name)}
                                </span>
                                <div className="min-w-0">
                                    <h4 className="text-sm font-black text-teal-950 dark:text-teal-100">
                                        {cleanStaffName(detail.employee_name)}
                                    </h4>
                                    <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                                        {getRoleName(detail.role)} · {formatDateTime(detail.clock_in)}
                                    </p>
                                </div>
                            </div>

                            {/* Scheduled vs Actual Visual Timeline Comparison */}
                            <div className="rounded-xl border border-slate-100 p-3.5 dark:border-slate-800 space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {isArabic ? 'مقارنة التوقيت المجدول بالتسجيل الفعلي' : 'Roster vs Actual Timeline'}
                                </p>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/40">
                                        <p className="text-[10px] font-bold text-slate-400">{aCopy('scheduledShift')}</p>
                                        <p className="mt-1 font-mono font-black text-slate-800 dark:text-slate-200" dir="ltr">
                                            {detail.shift_start ? `${formatTimeOnly(detail.shift_start)} – ${formatTimeOnly(detail.shift_end)}` : aCopy('unscheduledBadge')}
                                        </p>
                                        {p.scheduledHours !== null && (
                                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                                                {p.scheduledHours.toFixed(1)} {aCopy('hoursShort')}
                                            </p>
                                        )}
                                    </div>
                                    <div className="rounded-lg bg-teal-50/60 p-2.5 dark:bg-teal-950/20">
                                        <p className="text-[10px] font-bold text-teal-700 dark:text-teal-400">{aCopy('actualAttendance')}</p>
                                        <p className="mt-1 font-mono font-black text-teal-950 dark:text-teal-100" dir="ltr">
                                            {formatTimeOnly(detail.clock_in)} – {detail.clock_out ? formatTimeOnly(detail.clock_out) : aCopy('active')}
                                        </p>
                                        {p.workedHours !== null && (
                                            <p className="text-[10px] text-teal-700 font-bold mt-0.5">
                                                {p.workedHours.toFixed(2)} {aCopy('hoursShort')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Metric Breakdown Grid */}
                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-950/30">
                                    <p className="text-[10px] font-black uppercase text-slate-400">{aCopy('late')}</p>
                                    <p className={`mt-0.5 font-mono text-sm font-black ${p.lateMinutes > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
                                        {p.lateMinutes > 0 ? `+${p.lateMinutes}m` : '0m'}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-950/30">
                                    <p className="text-[10px] font-black uppercase text-slate-400">{aCopy('early')}</p>
                                    <p className={`mt-0.5 font-mono text-sm font-black ${p.earlyMinutes > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                                        {p.earlyMinutes > 0 ? `-${p.earlyMinutes}m` : '0m'}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-950/30">
                                    <p className="text-[10px] font-black uppercase text-slate-400">{aCopy('overtime')}</p>
                                    <p className={`mt-0.5 font-mono text-sm font-black ${p.overtimeMinutes > 0 ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'}`}>
                                        {p.overtimeMinutes > 0 ? `+${p.overtimeMinutes}m` : '0m'}
                                    </p>
                                </div>
                            </div>

                            {/* Detail List */}
                            <dl className="space-y-2 rounded-xl border border-slate-100 p-3.5 text-xs dark:border-slate-800">
                                <DetailRow label={aCopy('recordId')} value={`#${detail.log_id}`} icon={FileText} />
                                <DetailRow label={aCopy('status')} value={aCopy(`statuses.${detail.status}`)} icon={CheckCircle2} />
                                {detail.room_name && (
                                    <DetailRow label={aCopy('shiftRoom')} value={detail.room_name} icon={DoorOpen} />
                                )}
                                <DetailRow
                                    label={aCopy('shiftLinkType')}
                                    value={detail.shift_link_type === 'Manual' ? aCopy('shiftLinkManual') : detail.shift_start ? aCopy('shiftLinkAuto') : aCopy('shiftLinkUnscheduled')}
                                    icon={CalendarClock}
                                />
                                {detail.scheduled_start_snapshot && (
                                    <DetailRow
                                        label={aCopy('scheduledSnapshot')}
                                        value={`${formatTimeOnly(detail.scheduled_start_snapshot)} – ${detail.scheduled_end_snapshot ? formatTimeOnly(detail.scheduled_end_snapshot) : '—'}`}
                                        icon={Clock}
                                    />
                                )}
                                {detail.early_departure_permitted && (
                                    <DetailRow
                                        label={aCopy('approvedPermission')}
                                        value={isArabic ? 'مصرح رسمياً' : 'Authorized'}
                                        icon={ShieldCheck}
                                    />
                                )}
                                {detail.corrected_by && (
                                    <DetailRow label={aCopy('correctedBy')} value={aCopy('correctedBadge')} icon={History} />
                                )}
                                {detail.notes && (
                                    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/40">
                                        <p className="text-[10px] font-black uppercase text-slate-400">{aCopy('notes')}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{detail.notes}</p>
                                    </div>
                                )}
                            </dl>

                            {/* Actions Footer */}
                            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setDetail(null)}
                                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                    {aCopy('close')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const rec = detail;
                                        setDetail(null);
                                        openEdit(rec);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700"
                                >
                                    <Pencil size={12} />
                                    <span>{aCopy('correct')}</span>
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* 7. Modal for Correcting Attendance */}
            <Modal isOpen={Boolean(editing)} onClose={() => !saving && setEditing(null)} title={aCopy('correctTitle')} size="default">
                <form onSubmit={save} className="space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-teal-200/80 bg-teal-50/80 p-3.5 dark:border-teal-500/20 dark:bg-teal-500/10">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-sm font-black" style={avatarStyle(editing?.employee_name)}>
                            {initialsOf(editing?.employee_name)}
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-black text-teal-950 dark:text-teal-100">{cleanStaffName(editing?.employee_name)}</p>
                            <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                                {getRoleName(editing?.role)} · {formatDateTime(editing?.clock_in)}
                            </p>
                        </div>
                    </div>

                    {/* Quick Preset: Match shift hours */}
                    {editing?.shift_start && (
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-950">
                            <span className="text-[11px] font-bold text-slate-500">
                                {aCopy('shift')}: {formatTimeOnly(editing.shift_start)} – {formatTimeOnly(editing.shift_end)}
                            </span>
                            <button
                                type="button"
                                onClick={handleMatchShiftTimes}
                                className="rounded-lg bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-700 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300"
                            >
                                {aCopy('matchShiftTimes')}
                            </button>
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {aCopy('clockInTime')}
                            <input
                                required
                                type="datetime-local"
                                className={`${inputClass} mt-1`}
                                value={form.clockIn}
                                onChange={(event) => setForm({ ...form, clockIn: event.target.value })}
                            />
                        </label>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {aCopy('clockOutTime')}
                            <input
                                type="datetime-local"
                                min={form.clockIn || undefined}
                                className={`${inputClass} mt-1`}
                                value={form.clockOut}
                                onChange={(event) => setForm({ ...form, clockOut: event.target.value })}
                            />
                        </label>
                    </div>

                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        {aCopy('statusLabel')}
                        <select
                            className={`${inputClass} mt-1`}
                            value={form.status}
                            onChange={(event) => setForm({ ...form, status: event.target.value })}
                        >
                            {['Present', 'Late', 'Absent', 'Half-Day'].map((status) => (
                                <option key={status} value={status}>
                                    {aCopy(`statuses.${status}`)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        {aCopy('correctionReason')}
                        <textarea
                            required
                            maxLength={500}
                            className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900"
                            value={form.notes}
                            onChange={(event) => setForm({ ...form, notes: event.target.value })}
                            placeholder={aCopy('correctionPlaceholder')}
                        />
                    </label>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={() => setEditing(null)}
                            disabled={saving}
                            className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                            {aCopy('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700 disabled:opacity-50"
                        >
                            {saving ? aCopy('saving') : aCopy('saveCorrection')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* 8. Manual Attendance Entry Modal */}
            <Modal isOpen={showManualModal} onClose={() => setShowManualModal(false)} title={aCopy('manualTitle')}>
                <form onSubmit={handleManualSubmit} className="space-y-4">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        {aCopy('employee')}
                        <select
                            required
                            className={`${inputClass} mt-1`}
                            value={manualForm.userId}
                            onChange={(event) => setManualForm({ ...manualForm, userId: event.target.value })}
                        >
                            <option value="">-- {aCopy('selectEmployee')} --</option>
                            {staff.map((emp) => (
                                <option key={emp.user_id} value={emp.user_id}>
                                    {cleanStaffName(emp.full_name)} ({getRoleName(emp.role)})
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {aCopy('clockInTime')}
                            <input
                                type="datetime-local"
                                required
                                className={`${inputClass} mt-1`}
                                value={manualForm.clockIn}
                                onChange={(event) => setManualForm({ ...manualForm, clockIn: event.target.value })}
                            />
                        </label>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {aCopy('clockOutOptional')}
                            <input
                                type="datetime-local"
                                min={manualForm.clockIn || undefined}
                                className={`${inputClass} mt-1`}
                                value={manualForm.clockOut}
                                onChange={(event) => setManualForm({ ...manualForm, clockOut: event.target.value })}
                            />
                        </label>
                    </div>

                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        {aCopy('statusLabel')}
                        <select
                            className={`${inputClass} mt-1`}
                            value={manualForm.status}
                            onChange={(event) => setManualForm({ ...manualForm, status: event.target.value })}
                        >
                            {['Present', 'Late', 'Absent', 'Half-Day'].map((status) => (
                                <option key={status} value={status}>
                                    {aCopy(`statuses.${status}`)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        {aCopy('manualReason')}
                        <textarea
                            required
                            maxLength={500}
                            className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900"
                            value={manualForm.notes}
                            onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })}
                            placeholder={aCopy('manualPlaceholder')}
                        />
                    </label>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={() => setShowManualModal(false)}
                            disabled={isRecordingManual}
                            className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                            {aCopy('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isRecordingManual}
                            className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700 disabled:opacity-50"
                        >
                            {isRecordingManual ? aCopy('saving') : aCopy('recordButton')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* 9. Attendance Discipline Settings Modal */}
            <AttendanceSettingsModal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
            />

            {/* 10. Attendance Permission Request Modal */}
            <AttendancePermissionModal
                isOpen={showPermissionModal}
                onClose={() => setShowPermissionModal(false)}
                staff={staff}
            />

            {/* 11. Attendance Permissions Management Drawer */}
            <AttendancePermissionsDrawer
                isOpen={showPermissionsDrawer}
                onClose={() => setShowPermissionsDrawer(false)}
            />

            {/* 12. Attendance Immutable Audit Ledger Drawer */}
            <AttendanceAuditDrawer
                isOpen={showAuditDrawer}
                onClose={() => setShowAuditDrawer(false)}
            />
        </div>
    );
};

const DetailRow = ({ label, value, icon: Icon }) => (
    <div className="flex items-center justify-between gap-3">
        <dt className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <Icon size={11} />
            {label}
        </dt>
        <dd className="text-xs font-black text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
);

const State = ({ text, error = false }) => (
    <div role={error ? 'alert' : undefined} className={`p-12 text-center text-xs font-bold ${error ? 'text-rose-600' : 'text-slate-500'}`}>
        <Clock3 className="mx-auto mb-2 text-slate-400" size={28} />
        {text}
    </div>
);

export default AttendanceManager;
