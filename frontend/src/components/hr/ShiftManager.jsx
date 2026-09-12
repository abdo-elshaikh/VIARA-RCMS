import { useMemo, useRef, useState } from 'react';
import {
    CalendarClock, ChevronLeft, ChevronRight, Clock, Plus, RefreshCw, Trash2, Pencil,
    Users, LayoutGrid, Calendar, Copy, Moon, Sun, Sunset, PhoneCall, Search, Filter, CheckCircle2,
    Table2, UserCheck, AlertCircle, Eye, CalendarDays, DoorOpen
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useCreateShiftMutation,
    useDeleteShiftMutation,
    useGetEmployeeProfilesQuery,
    useGetRoomsQuery,
    useGetShiftsQuery,
    useLazyGetShiftsQuery,
    useUpdateShiftMutation
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';

const mondayFor = (date = new Date()) => {
    const copy = new Date(date);
    const day = copy.getDay();
    copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
};

const saturdayFor = (date = new Date()) => {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = (day + 1) % 7;
    copy.setDate(copy.getDate() - diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
};

const getWeekStart = (date = new Date(), isArabic = false) => {
    return isArabic ? saturdayFor(date) : mondayFor(date);
};

const toISODate = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 10);
};

const toTimeInput = (value) => {
    const d = new Date(value);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(11, 16);
};

const isOnCallShift = (notes) => /on[- ]?call/i.test(notes || '');

const getShiftClassification = (startTime, notes) => {
    if (isOnCallShift(notes)) return 'onCall';
    const date = new Date(startTime);
    const hours = date.getHours();
    if (hours >= 6 && hours < 14) return 'morning';
    if (hours >= 14 && hours < 22) return 'evening';
    return 'night';
};

const SHIFT_THEMES = {
    morning: {
        labelAr: 'صباحية',
        labelEn: 'Morning',
        icon: Sun,
        pill: 'bg-emerald-50 text-emerald-800 border-emerald-200/90 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-300 dark:border-emerald-800',
        accent: 'text-emerald-600 dark:text-emerald-400'
    },
    evening: {
        labelAr: 'مسائية',
        labelEn: 'Evening',
        icon: Sunset,
        pill: 'bg-amber-50 text-amber-800 border-amber-200/90 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
        border: 'border-amber-300 dark:border-amber-800',
        accent: 'text-amber-600 dark:text-amber-400'
    },
    night: {
        labelAr: 'ليلية',
        labelEn: 'Night',
        icon: Moon,
        pill: 'bg-indigo-50 text-indigo-800 border-indigo-200/90 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
        badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
        border: 'border-indigo-300 dark:border-indigo-800',
        accent: 'text-indigo-600 dark:text-indigo-400'
    },
    onCall: {
        labelAr: 'تحت الطلب',
        labelEn: 'On-Call',
        icon: PhoneCall,
        pill: 'bg-rose-50 text-rose-800 border-rose-200/90 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
        border: 'border-rose-300 dark:border-rose-800',
        accent: 'text-rose-600 dark:text-rose-400'
    }
};

/** Clean trailing parenthetical role labels from names like "Sarah (Lead Desk)" -> "Sarah" */
const cleanStaffName = (name) => {
    if (!name) return '';
    const cleaned = String(name).replace(/\s*\([^)]*\)\s*$/, '').trim();
    return cleaned || name;
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

const ROLE_LABELS = {
    Radiologist: { ar: 'أطباء الأشعة', en: 'Radiologists' },
    Technician: { ar: 'فنيو الأشعة', en: 'Technicians' },
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
    Developer: { ar: 'الدعم التقني', en: 'Technical Support' },
    Security: { ar: 'الأمن', en: 'Security' }
};

const getRoleLabel = (role, isArabic) => {
    if (!role) return isArabic ? 'عام' : 'Staff';
    if (ROLE_LABELS[role]) return ROLE_LABELS[role][isArabic ? 'ar' : 'en'];
    // Format snake_case nicely
    return role.replace(/_/g, ' ');
};

const formatTimeRange = (start, end) => {
    const s = new Date(start);
    const e = new Date(end);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(s.getHours())}:${pad(s.getMinutes())} – ${pad(e.getHours())}:${pad(e.getMinutes())}`;
};

const getDurationHours = (start, end) => {
    return Math.max(0, new Date(end) - new Date(start)) / 3600000;
};

const emptyForm = { userId: '', date: '', startTime: '08:00', endTime: '16:00', notes: '', onCall: false, roomId: '' };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-teal-500 dark:focus:ring-teal-500/20';

const ShiftManager = () => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const copy = (key, options) => t(`hr.shifts.${key}`, options);

    const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date(), isArabic));
    const weekEnd = useMemo(() => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + 7);
        return date;
    }, [weekStart]);

    const query = { startDate: weekStart.toISOString(), endDate: weekEnd.toISOString() };
    const { data: shifts = [], isLoading, isError, isFetching, refetch } = useGetShiftsQuery(query);
    const { data: staff = [] } = useGetEmployeeProfilesQuery();
    const { data: rooms = [] } = useGetRoomsQuery({ status: 'Active' });
    const [lazyGetShifts] = useLazyGetShiftsQuery();

    const [createShift, { isLoading: isCreating }] = useCreateShiftMutation();
    const [updateShift, { isLoading: isUpdating }] = useUpdateShiftMutation();
    const [deleteShift, { isLoading: isDeleting }] = useDeleteShiftMutation();

    // Filters & View state
    const [roleFilter, setRoleFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('week'); // 'week' (7 cols) | 'day' (focused day) | 'matrix' (staff rows) | 'list' (cards)
    const [selectedDayStr, setSelectedDayStr] = useState(() => toISODate(new Date()));
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editTarget, setEditTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [copying, setCopying] = useState(false);
    const lastEmployeeRef = useRef('');

    const daysOfWeek = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
    }), [weekStart]);

    const todayISO = toISODate(new Date());

    const activeStaff = useMemo(() => staff.filter(emp => emp.is_active !== false), [staff]);

    // Role-filtered shifts
    const filteredShifts = useMemo(() => {
        return shifts.filter(shift => {
            if (roleFilter !== 'all' && shift.role !== roleFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const name = (shift.employee_name || '').toLowerCase();
                const notes = (shift.notes || '').toLowerCase();
                const role = (shift.role || '').toLowerCase();
                if (!name.includes(q) && !notes.includes(q) && !role.includes(q)) return false;
            }
            return true;
        });
    }, [shifts, roleFilter, searchQuery]);

    // Summary calculations
    const summary = useMemo(() => {
        const uniqueStaff = new Set(filteredShifts.map(s => s.user_id)).size;
        const totalHours = filteredShifts.reduce((acc, s) => acc + getDurationHours(s.start_time, s.end_time), 0);
        const onCallCount = filteredShifts.filter(s => isOnCallShift(s.notes)).length;
        return {
            shifts: filteredShifts.length,
            staff: uniqueStaff,
            hours: totalHours,
            onCall: onCallCount
        };
    }, [filteredShifts]);

    // Grouping staff by role for dropdown & matrix
    const staffByRole = useMemo(() => {
        const groups = new Map();
        for (const emp of activeStaff) {
            const r = emp.role || 'Other';
            if (!groups.has(r)) groups.set(r, []);
            groups.get(r).push(emp);
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [activeStaff]);

    // Filtered staff for matrix view
    const matrixStaff = useMemo(() => {
        return activeStaff.filter(emp => {
            if (roleFilter !== 'all' && emp.role !== roleFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const name = (emp.full_name || '').toLowerCase();
                const role = (emp.role || '').toLowerCase();
                if (!name.includes(q) && !role.includes(q)) return false;
            }
            return true;
        });
    }, [activeStaff, roleFilter, searchQuery]);

    // Available roles sorted with active shifts first
    const availableRoles = useMemo(() => {
        const counts = {};
        for (const s of shifts) {
            if (s.role) counts[s.role] = (counts[s.role] || 0) + 1;
        }
        const active = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        const other = Array.from(new Set(activeStaff.map(e => e.role).filter(r => r && !counts[r])));
        return ['all', ...active, ...other];
    }, [shifts, activeStaff]);

    const setField = (field, value) => setForm(current => ({ ...current, [field]: value }));

    const moveWeek = (direction) => setWeekStart(current => {
        const next = new Date(current);
        next.setDate(next.getDate() + direction * 7);
        return next;
    });

    const openCreate = (dayDate = null, employeeId = null) => {
        setEditTarget(null);
        const todayISOStr = toISODate(new Date());
        const inWeek = daysOfWeek.some(day => toISODate(day) === todayISOStr);
        const defaultDate = dayDate ? toISODate(dayDate) : (inWeek ? todayISOStr : toISODate(daysOfWeek[0]));
        setForm({
            ...emptyForm,
            date: defaultDate,
            userId: employeeId || lastEmployeeRef.current || (activeStaff[0]?.user_id || '')
        });
        setFormOpen(true);
    };

    const openEdit = (shift) => {
        setEditTarget(shift);
        setForm({
            userId: shift.user_id,
            date: toISODate(shift.start_time),
            startTime: toTimeInput(shift.start_time),
            endTime: toTimeInput(shift.end_time),
            notes: (shift.notes || '').replace(/\s*on[- ]?call\s*/gi, ' ').trim(),
            onCall: isOnCallShift(shift.notes),
            roomId: shift.room_id || ''
        });
        setFormOpen(true);
    };

    const openDuplicate = (shift) => {
        setEditTarget(null);
        setForm({
            userId: shift.user_id,
            date: toISODate(shift.start_time),
            startTime: toTimeInput(shift.start_time),
            endTime: toTimeInput(shift.end_time),
            notes: (shift.notes || '').replace(/\s*on[- ]?call\s*/gi, ' ').trim(),
            onCall: isOnCallShift(shift.notes),
            roomId: shift.room_id || ''
        });
        setFormOpen(true);
    };

    const closeForm = () => {
        if (isCreating || isUpdating) return;
        setFormOpen(false);
        setEditTarget(null);
        setForm(emptyForm);
    };

    const resolveRange = () => {
        const start = new Date(`${form.date}T${form.startTime}`);
        let end = new Date(`${form.date}T${form.endTime}`);
        if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
        return { start, end, crossesMidnight: form.endTime <= form.startTime };
    };

    const previewDuration = useMemo(() => {
        if (!form.date || !form.startTime || !form.endTime) return null;
        const { start, end } = resolveRange();
        return Math.max(0, (end - start) / 3600000);
    }, [form.date, form.startTime, form.endTime]);

    const applyPreset = (preset) => {
        const presets = {
            morning: ['08:00', '16:00'],
            evening: ['16:00', '00:00'],
            night: ['00:00', '08:00'],
            partMorning: ['08:00', '12:00'],
            partEvening: ['12:00', '16:00']
        };
        const [start, end] = presets[preset] || presets.morning;
        setForm(cur => ({ ...cur, startTime: start, endTime: end }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.userId) {
            toast.error(copy('selectEmployee'));
            return;
        }
        const { start, end } = resolveRange();
        try {
            const notes = [
                form.notes.trim() || null,
                form.onCall ? 'on-call' : null
            ].filter(Boolean).join(' · ') || undefined;
            const payload = {
                userId: form.userId,
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                roomId: form.roomId || null,
                notes
            };
            const showCoverageWarning = (warning) => {
                if (!warning) return;
                toast(copy('roomOverstaffing', {
                    room: warning.room || '',
                    employees: (warning.employees || []).join('، ')
                }), { icon: '⚠', duration: 6000 });
            };
            if (editTarget) {
                const updated = await updateShift({ id: editTarget.shift_id, startTime: payload.startTime, endTime: payload.endTime, roomId: payload.roomId, notes: payload.notes }).unwrap();
                showCoverageWarning(updated?.coverage_warning);
                toast.success(copy('updateSuccess'));
                closeForm();
            } else {
                const created = await createShift(payload).unwrap();
                if (created?.leave_warning) {
                    toast(copy('leaveOverlapWarning', { type: created.leave_warning.leave?.leave_type || '', start: created.leave_warning.leave?.start_date || '' }), { icon: '⚠' });
                }
                showCoverageWarning(created?.coverage_warning);
                toast.success(copy('createSuccess'));
                lastEmployeeRef.current = form.userId;
                closeForm();
            }
        } catch (error) {
            toast.error(getErrorMessage(error, copy('createError')));
        }
    };

    const copyPreviousWeek = async () => {
        setCopying(true);
        try {
            const prevStart = new Date(weekStart);
            prevStart.setDate(prevStart.getDate() - 7);
            const prevEnd = new Date(weekStart);
            prevEnd.setDate(prevEnd.getDate() + 1);
            const result = await lazyGetShifts({ startDate: prevStart.toISOString(), endDate: prevEnd.toISOString() }).unwrap();
            const source = (result || []).filter(shift => {
                const start = new Date(shift.start_time);
                return start >= prevStart && start < weekStart;
            });
            if (!source.length) {
                toast.success(copy('copyPrevWeekEmpty'));
                return;
            }
            let copied = 0;
            let failed = 0;
            for (const shift of source) {
                const start = new Date(new Date(shift.start_time).getTime() + 7 * 24 * 60 * 60 * 1000);
                const end = new Date(new Date(shift.end_time).getTime() + 7 * 24 * 60 * 60 * 1000);
                try {
                    await createShift({
                        userId: shift.user_id,
                        startTime: start.toISOString(),
                        endTime: end.toISOString(),
                        roomId: shift.room_id || null,
                        notes: shift.notes || undefined
                    }).unwrap();
                    copied += 1;
                } catch {
                    failed += 1;
                }
            }
            if (failed > 0) toast(copy('copyPrevWeekPartial', { copied, failed }));
            else toast.success(copy('copyPrevWeekSuccess', { count: copied }));
        } catch (error) {
            toast.error(getErrorMessage(error, copy('loadError')));
        } finally {
            setCopying(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return false;
        try {
            await deleteShift(deleteTarget.shift_id).unwrap();
            toast.success(copy('deleteSuccess'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, copy('deleteError')));
            return false;
        }
    };

    const formatDay = value => new Date(value).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
    const weekLabel = `${formatDay(weekStart)} – ${formatDay(new Date(weekEnd.getTime() - 86400000))}`;

    // Shifts for Day Focus view
    const activeDayDate = useMemo(() => {
        const found = daysOfWeek.find(d => toISODate(d) === selectedDayStr);
        return found || daysOfWeek[0];
    }, [daysOfWeek, selectedDayStr]);

    const shiftsOnSelectedDay = useMemo(() => {
        const targetStr = toISODate(activeDayDate);
        return filteredShifts
            .filter(s => toISODate(s.start_time) === targetStr)
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }, [filteredShifts, activeDayDate]);

    return (
        <div className="space-y-4">
            {/* Quick KPI Cards */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={copy('summaryLabel')}>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{copy('shiftCount')}</p>
                    <p className="mt-1 font-mono text-2xl font-black text-slate-900 dark:text-white">{summary.shifts}</p>
                    <div className="absolute end-3 top-3.5 text-slate-300 dark:text-slate-700">
                        <CalendarClock size={20} />
                    </div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{copy('staffCovered')}</p>
                    <p className="mt-1 font-mono text-2xl font-black text-teal-600 dark:text-teal-400">{summary.staff}</p>
                    <div className="absolute end-3 top-3.5 text-teal-200 dark:text-teal-900/60">
                        <Users size={20} />
                    </div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{copy('scheduledHours')}</p>
                    <p className="mt-1 font-mono text-2xl font-black text-slate-800 dark:text-slate-100">{summary.hours.toFixed(0)}<span className="text-xs font-bold text-slate-400 ms-1">س</span></p>
                    <div className="absolute end-3 top-3.5 text-slate-300 dark:text-slate-700">
                        <Clock size={20} />
                    </div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{copy('onCall')}</p>
                    <p className="mt-1 font-mono text-2xl font-black text-amber-600 dark:text-amber-400">{summary.onCall}</p>
                    <div className="absolute end-3 top-3.5 text-amber-200 dark:text-amber-900/60">
                        <PhoneCall size={20} />
                    </div>
                </div>
            </section>

            {/* Main Panel */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Sticky Header & Controls Bar */}
                <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 p-3.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* Title & Info */}
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60">
                                <CalendarClock size={18} />
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-black tracking-tight text-slate-900 dark:text-white sm:text-base">{copy('title')}</h2>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {weekLabel}
                                    </span>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{copy('description')}</p>
                            </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Week Navigator */}
                            <div className="flex min-h-8 items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
                                <button
                                    type="button"
                                    onClick={() => moveWeek(-1)}
                                    aria-label={copy('previousWeek')}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                    <ChevronLeft className="rtl:rotate-180" size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWeekStart(getWeekStart(new Date(), isArabic));
                                        setSelectedDayStr(toISODate(new Date()));
                                    }}
                                    className="px-2.5 text-xs font-black text-slate-700 hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-400"
                                >
                                    {copy('today')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveWeek(1)}
                                    aria-label={copy('nextWeek')}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                    <ChevronRight className="rtl:rotate-180" size={15} />
                                </button>
                            </div>

                            {/* View Switcher: Week vs Day vs Matrix vs List */}
                            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('week')}
                                    title={isArabic ? 'عرض أعمدة الأيام' : 'Weekly Columns'}
                                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${viewMode === 'week' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >
                                    <CalendarDays size={13} />
                                    <span className="hidden sm:inline">{isArabic ? 'الأسبوع' : 'Week'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('day')}
                                    title={isArabic ? 'عرض تركيز اليوم' : 'Day View'}
                                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${viewMode === 'day' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >
                                    <Calendar size={13} />
                                    <span className="hidden sm:inline">{isArabic ? 'اليوم' : 'Day'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('matrix')}
                                    title={isArabic ? 'جدول الموظفين' : 'Staff Matrix'}
                                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${viewMode === 'matrix' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >
                                    <Table2 size={13} />
                                    <span className="hidden sm:inline">{isArabic ? 'الموظفين' : 'Staff'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('list')}
                                    title={isArabic ? 'قائمة الورديات' : 'List View'}
                                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${viewMode === 'list' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >
                                    <LayoutGrid size={13} />
                                    <span className="hidden sm:inline">{isArabic ? 'قائمة' : 'List'}</span>
                                </button>
                            </div>

                            {/* Copy Previous Week */}
                            <button
                                type="button"
                                onClick={copyPreviousWeek}
                                disabled={copying || isFetching}
                                title={copy('copyPrevWeek')}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-xs transition hover:border-teal-500/40 hover:text-teal-700 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <Copy size={13} className={copying ? 'animate-spin' : ''} />
                                <span className="hidden md:inline">{copy('copyPrevWeek')}</span>
                            </button>

                            {/* Refresh */}
                            <button
                                type="button"
                                onClick={() => refetch()}
                                disabled={isFetching}
                                aria-label={copy('refresh')}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <RefreshCw size={13} className={isFetching ? 'animate-spin text-teal-600' : ''} />
                            </button>

                            {/* Schedule Shift Button */}
                            <button
                                type="button"
                                onClick={() => openCreate(viewMode === 'day' ? activeDayDate : null)}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700 active:scale-95"
                            >
                                <Plus size={14} />
                                <span>{copy('schedule')}</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick Filters Row: Department Pills & Search */}
                    <div className="flex flex-col gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
                        {/* Department/Role Tabs */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {availableRoles.map(role => {
                                const isSelected = roleFilter === role;
                                const count = role === 'all'
                                    ? shifts.length
                                    : shifts.filter(s => s.role === role).length;
                                const label = role === 'all'
                                    ? (isArabic ? 'كل الأقسام' : 'All Roles')
                                    : getRoleLabel(role, isArabic);

                                return (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => setRoleFilter(role)}
                                        className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                                            isSelected
                                                ? 'bg-teal-600 text-white shadow-xs'
                                                : count > 0
                                                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-500'
                                        }`}
                                    >
                                        <span>{label}</span>
                                        <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                                            isSelected
                                                ? 'bg-teal-700 text-teal-100'
                                                : 'bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                        }`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search input */}
                        <div className="relative min-w-[200px]">
                            <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={isArabic ? 'بحث بالاسم أو الملاحظات...' : 'Search staff or notes...'}
                                className={`${inputClass} h-8 ps-8 text-xs`}
                            />
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                {isLoading ? (
                    <Loading label={copy('loading')} />
                ) : isError ? (
                    <ErrorState copy={copy} onRetry={refetch} />
                ) : viewMode === 'week' ? (
                    /* VIEW MODE 1: WEEKLY COLUMNS */
                    <div className="overflow-x-auto p-4">
                        <div className="grid min-w-[1340px] grid-cols-7 gap-3 pb-2">
                            {daysOfWeek.map(day => {
                                const dayStr = toISODate(day);
                                const isToday = dayStr === todayISO;
                                const isFriday = day.getDay() === 5;
                                const dayShifts = filteredShifts
                                    .filter(s => toISODate(s.start_time) === dayStr)
                                    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
                                const dayHours = dayShifts.reduce((total, s) => total + getDurationHours(s.start_time, s.end_time), 0);

                                return (
                                    <div
                                        key={dayStr}
                                        className={`group/day flex min-h-[440px] flex-col rounded-2xl border p-2.5 transition ${
                                            isToday
                                                ? 'border-teal-500/50 bg-teal-50/20 ring-2 ring-teal-500/20 dark:border-teal-500/30 dark:bg-teal-950/20'
                                                : isFriday
                                                    ? 'border-slate-200/80 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-950/20'
                                                    : 'border-slate-200/70 bg-slate-50/30 hover:border-slate-300/80 dark:border-slate-800 dark:bg-slate-900/30'
                                        }`}
                                    >
                                        {/* Day Column Header */}
                                        <div className="flex items-center justify-between border-b border-slate-200/70 pb-2 dark:border-slate-800">
                                            <div className="text-start min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-xs font-black uppercase ${isToday ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-200'}`}>
                                                        {day.toLocaleDateString(locale, { weekday: 'short' })}
                                                    </span>
                                                    {isToday && (
                                                        <span className="rounded-full bg-teal-600 px-1.5 py-0.2 text-[9px] font-black text-white shrink-0">
                                                            {copy('today')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] font-bold text-slate-400">
                                                    {day.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {/* Focus Day View Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedDayStr(dayStr);
                                                        setViewMode('day');
                                                    }}
                                                    title={isArabic ? 'تكبير عرض هذا اليوم' : 'Focus this day'}
                                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-2xs transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                                                >
                                                    <Eye size={13} />
                                                </button>

                                                {/* Quick Add Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => openCreate(day)}
                                                    title={copy('scheduleForDay', { date: day.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) })}
                                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-teal-600 shadow-2xs transition hover:bg-teal-50 hover:border-teal-300 dark:border-slate-800 dark:bg-slate-800 dark:text-teal-300 dark:hover:bg-slate-700"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Coverage counter pill */}
                                        <div className="my-1.5 flex items-center justify-between rounded-lg bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-500 shadow-2xs dark:bg-slate-800/60 dark:text-slate-400">
                                            <span>{dayShifts.length} {isArabic ? 'وردية' : 'shifts'}</span>
                                            {dayHours > 0 && <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{dayHours.toFixed(0)} س</span>}
                                        </div>

                                        {/* Shifts List for Day */}
                                        <div className="mt-1 flex-1 space-y-2">
                                            {dayShifts.length === 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openCreate(day)}
                                                    className="flex h-36 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200/80 bg-white/40 text-slate-400 transition hover:border-teal-400 hover:bg-teal-50/20 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900/20 dark:text-slate-500 dark:hover:border-teal-500/40"
                                                >
                                                    <Plus size={16} />
                                                    <span className="text-[10px] font-bold">{isArabic ? 'إضافة وردية' : 'Add Shift'}</span>
                                                </button>
                                            ) : (
                                                dayShifts.map(shift => (
                                                    <EnhancedDayShiftCard
                                                        key={shift.shift_id}
                                                        shift={shift}
                                                        isArabic={isArabic}
                                                        onEdit={() => openEdit(shift)}
                                                        onDuplicate={() => openDuplicate(shift)}
                                                        onDelete={() => setDeleteTarget(shift)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : viewMode === 'day' ? (
                    /* VIEW MODE 2: DAY FOCUS VIEW */
                    <div className="p-4 space-y-4">
                        {/* Day Selector Pills Bar */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                            {daysOfWeek.map(day => {
                                const dStr = toISODate(day);
                                const isSelected = dStr === toISODate(activeDayDate);
                                const isToday = dStr === todayISO;
                                const count = filteredShifts.filter(s => toISODate(s.start_time) === dStr).length;

                                return (
                                    <button
                                        key={dStr}
                                        type="button"
                                        onClick={() => setSelectedDayStr(dStr)}
                                        className={`flex min-w-[120px] flex-1 items-center justify-between rounded-xl border p-2.5 text-xs font-bold transition ${
                                            isSelected
                                                ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                                                : isToday
                                                    ? 'border-teal-300 bg-teal-50/40 text-teal-800 dark:border-teal-800 dark:bg-teal-950/20 dark:text-teal-300'
                                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                        }`}
                                    >
                                        <div className="text-start">
                                            <div className="flex items-center gap-1">
                                                <span>{day.toLocaleDateString(locale, { weekday: 'short' })}</span>
                                                {isToday && (
                                                    <span className={`rounded-full px-1 py-0.1 text-[8px] font-black ${isSelected ? 'bg-teal-700 text-teal-100' : 'bg-teal-600 text-white'}`}>
                                                        {copy('today')}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-[10px] ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                                                {day.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                            isSelected
                                                ? 'bg-teal-700 text-teal-100'
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Shifts for Selected Day */}
                        {shiftsOnSelectedDay.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center dark:border-slate-800">
                                <CalendarClock size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
                                <h3 className="mt-3 text-sm font-black text-slate-800 dark:text-slate-200">
                                    {isArabic ? 'لا توجد ورديات مجدولة في هذا اليوم' : 'No shifts scheduled for this day'}
                                </h3>
                                <p className="mt-1 text-xs text-slate-400">
                                    {isArabic ? 'يمكنك إضافة وردية جديدة للموظفين بنقرة واحدة' : 'You can schedule a new shift for staff with one click'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => openCreate(activeDayDate)}
                                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700"
                                >
                                    <Plus size={14} />
                                    <span>{isArabic ? 'إضافة وردية لهذا اليوم' : 'Add Shift for this Day'}</span>
                                </button>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {shiftsOnSelectedDay.map(shift => (
                                    <EnhancedShiftCard
                                        key={shift.shift_id}
                                        shift={shift}
                                        copy={copy}
                                        formatDay={formatDay}
                                        isArabic={isArabic}
                                        onDelete={setDeleteTarget}
                                        onEdit={() => openEdit(shift)}
                                        onDuplicate={() => openDuplicate(shift)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ) : viewMode === 'matrix' ? (
                    /* VIEW MODE 3: STAFF MATRIX ROSTER */
                    <div className="overflow-x-auto p-4">
                        <table className="w-full min-w-[960px] border-collapse text-start text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/40">
                                    <th className="p-3 text-start font-black text-slate-600 dark:text-slate-300 w-56">
                                        {isArabic ? 'الموظف / الدور' : 'Employee / Role'}
                                    </th>
                                    {daysOfWeek.map(day => {
                                        const isToday = toISODate(day) === todayISO;
                                        return (
                                            <th
                                                key={toISODate(day)}
                                                className={`p-2.5 text-center font-bold ${isToday ? 'bg-teal-50/80 text-teal-900 dark:bg-teal-950/30 dark:text-teal-200' : 'text-slate-600 dark:text-slate-400'}`}
                                            >
                                                <div className="text-[11px] font-black uppercase">
                                                    {day.toLocaleDateString(locale, { weekday: 'short' })}
                                                </div>
                                                <div className="text-xs font-black">
                                                    {day.getDate()}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                {matrixStaff.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-slate-400">
                                            {copy('empty')}
                                        </td>
                                    </tr>
                                ) : (
                                    matrixStaff.map(emp => {
                                        const empShifts = filteredShifts.filter(s => s.user_id === emp.user_id);
                                        const empTotalHours = empShifts.reduce((acc, s) => acc + getDurationHours(s.start_time, s.end_time), 0);
                                        const cleanName = cleanStaffName(emp.full_name);
                                        const roleLabel = getRoleLabel(emp.role, isArabic);

                                        return (
                                            <tr key={emp.user_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                                                {/* Employee Column */}
                                                <td className="p-2.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[11px] font-black shadow-2xs" style={avatarStyle(cleanName)}>
                                                            {initialsOf(cleanName)}
                                                        </span>
                                                        <div className="min-w-0 flex-1">
                                                            <p dir="auto" className="truncate font-black text-slate-900 dark:text-white text-xs" title={emp.full_name}>
                                                                {cleanName}
                                                            </p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                                    {roleLabel}
                                                                </span>
                                                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                                                <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{empTotalHours.toFixed(0)} س</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 7 Day Shift Cells */}
                                                {daysOfWeek.map(day => {
                                                    const dayStr = toISODate(day);
                                                    const isToday = dayStr === todayISO;
                                                    const shiftOnDay = empShifts.find(s => toISODate(s.start_time) === dayStr);

                                                    return (
                                                        <td
                                                            key={dayStr}
                                                            className={`p-1.5 text-center align-middle ${isToday ? 'bg-teal-50/20 dark:bg-teal-950/10' : ''}`}
                                                        >
                                                            {shiftOnDay ? (
                                                                <MatrixShiftCell
                                                                    shift={shiftOnDay}
                                                                    isArabic={isArabic}
                                                                    onEdit={() => openEdit(shiftOnDay)}
                                                                    onDuplicate={() => openDuplicate(shiftOnDay)}
                                                                    onDelete={() => setDeleteTarget(shiftOnDay)}
                                                                />
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openCreate(day, emp.user_id)}
                                                                    title={isArabic ? `جدولة وردية لـ ${cleanName}` : `Schedule shift for ${cleanName}`}
                                                                    className="group/cell flex h-10 w-full items-center justify-center rounded-xl border border-transparent transition hover:border-teal-300 hover:bg-teal-50/50 dark:hover:border-teal-800 dark:hover:bg-teal-950/40"
                                                                >
                                                                    <Plus size={14} className="text-slate-300 opacity-0 transition group-hover/cell:opacity-100 group-hover/cell:text-teal-600 dark:text-slate-700 dark:group-hover/cell:text-teal-300" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* VIEW MODE 4: CARDS / LIST */
                    filteredShifts.length === 0 ? (
                        <Empty copy={copy} filtered={Boolean(searchQuery || roleFilter !== 'all')} />
                    ) : (
                        <div className="grid gap-3.5 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {filteredShifts.map(shift => (
                                <EnhancedShiftCard
                                    key={shift.shift_id}
                                    shift={shift}
                                    copy={copy}
                                    formatDay={formatDay}
                                    isArabic={isArabic}
                                    onDelete={setDeleteTarget}
                                    onEdit={() => openEdit(shift)}
                                    onDuplicate={() => openDuplicate(shift)}
                                />
                            ))}
                        </div>
                    )
                )}
            </section>

            {/* Create / Edit Shift Modal */}
            <Modal
                isOpen={formOpen}
                onClose={closeForm}
                title={editTarget ? copy('editShift') : (form.date ? copy('scheduleForDayTitle', { date: new Date(`${form.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) }) : copy('schedule'))}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Quick Shift Presets Bar */}
                    <div>
                        <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {isArabic ? 'قوالب الورديات السريعة (نقرة واحدة للملء)' : 'Quick Shift Presets:'}
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => applyPreset('morning')}
                                className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/60 p-2 text-center transition hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                            >
                                <div className="flex items-center gap-1 font-black text-emerald-800 dark:text-emerald-200 text-xs">
                                    <Sun size={13} />
                                    <span>{isArabic ? 'صباحية' : 'Morning'}</span>
                                </div>
                                <span className="mt-0.5 font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">08:00 - 16:00</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => applyPreset('evening')}
                                className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/60 p-2 text-center transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30"
                            >
                                <div className="flex items-center gap-1 font-black text-amber-800 dark:text-amber-200 text-xs">
                                    <Sunset size={13} />
                                    <span>{isArabic ? 'مسائية' : 'Evening'}</span>
                                </div>
                                <span className="mt-0.5 font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400">16:00 - 00:00</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => applyPreset('night')}
                                className="flex flex-col items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50/60 p-2 text-center transition hover:bg-indigo-100 dark:border-indigo-900/50 dark:bg-indigo-950/30"
                            >
                                <div className="flex items-center gap-1 font-black text-indigo-800 dark:text-indigo-200 text-xs">
                                    <Moon size={13} />
                                    <span>{isArabic ? 'ليلية' : 'Night'}</span>
                                </div>
                                <span className="mt-0.5 font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400">00:00 - 08:00</span>
                            </button>
                        </div>
                    </div>

                    {/* Employee Select */}
                    <label className="block">
                        <FieldLabel>{copy('employee')}</FieldLabel>
                        <select
                            required
                            disabled={Boolean(editTarget)}
                            value={form.userId}
                            onChange={event => setField('userId', event.target.value)}
                            className={`${inputClass} disabled:opacity-60`}
                        >
                            <option value="">-- {copy('selectEmployee')} --</option>
                            {staffByRole.map(([role, employees]) => (
                                <optgroup key={role} label={getRoleLabel(role, isArabic)}>
                                    {employees.map(emp => (
                                        <option key={emp.user_id} value={emp.user_id}>{cleanStaffName(emp.full_name)}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>

                    {/* Date */}
                    <div>
                        <FieldLabel>{copy('date')}</FieldLabel>
                        <input
                            type="date"
                            required
                            value={form.date}
                            onChange={event => setField('date', event.target.value)}
                            className={inputClass}
                        />
                    </div>

                    {/* Start & End Times */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <FieldLabel>{copy('start')}</FieldLabel>
                            <input
                                type="time"
                                required
                                value={form.startTime}
                                onChange={event => setField('startTime', event.target.value)}
                                className={inputClass}
                                dir="ltr"
                            />
                        </div>
                        <div>
                            <FieldLabel>{copy('end')}</FieldLabel>
                            <input
                                type="time"
                                required
                                value={form.endTime}
                                onChange={event => setField('endTime', event.target.value)}
                                className={inputClass}
                                dir="ltr"
                            />
                        </div>
                    </div>

                    {/* Duration preview */}
                    {previewDuration !== null && (
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                            <span className="inline-flex items-center gap-1.5">
                                <Clock size={14} className="text-teal-600 dark:text-teal-400" />
                                {copy('duration')}:
                            </span>
                            <span className="font-mono font-black text-teal-700 dark:text-teal-300">
                                {previewDuration.toFixed(1)} {isArabic ? 'ساعات' : 'hours'}
                                {form.endTime <= form.startTime && (
                                    <span className="ms-1.5 font-sans text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                        ({copy('nextDay')})
                                    </span>
                                )}
                            </span>
                        </div>
                    )}

                    {/* Room assignment */}
                    <div>
                        <FieldLabel>{copy('room')}</FieldLabel>
                        <select
                            value={form.roomId}
                            onChange={event => setField('roomId', event.target.value)}
                            className={inputClass}
                        >
                            <option value="">{copy('noRoom')}</option>
                            {rooms.map(room => (
                                <option key={room.room_id} value={room.room_id}>
                                    {room.name} {room.room_number ? `(${room.room_number})` : ''}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                            {copy('roomHelp')}
                        </p>
                    </div>

                    {/* Notes & On-call */}
                    <div>
                        <FieldLabel>{copy('notes')}</FieldLabel>
                        <input
                            type="text"
                            value={form.notes}
                            onChange={event => setField('notes', event.target.value)}
                            placeholder={copy('notesPlaceholder')}
                            className={inputClass}
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                            type="checkbox"
                            checked={form.onCall}
                            onChange={event => setField('onCall', event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{copy('markOnCall')}</span>
                    </label>

                    {/* Form actions */}
                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={closeForm}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {editTarget ? copy('cancel') : copy('closeForm')}
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating || isUpdating}
                            className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700 disabled:opacity-50"
                        >
                            {isCreating || isUpdating ? copy('saving') : (editTarget ? copy('saveEdit') : copy('save'))}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Confirm Delete Dialog */}
            <ConfirmDialog
                isOpen={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title={copy('deleteTitle')}
                message={copy('deleteMessage', { employee: cleanStaffName(deleteTarget?.employee_name) || '', date: deleteTarget ? formatDay(deleteTarget.start_time) : '' })}
                confirmLabel={copy('deleteAction')}
                cancelLabel={copy('cancel')}
                isLoading={isDeleting}
                variant="danger"
            />
        </div>
    );
};

const FieldLabel = ({ children }) => (
    <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}</span>
);

/* Card in Day Column View */
const EnhancedDayShiftCard = ({ shift, isArabic, onEdit, onDuplicate, onDelete }) => {
    const classification = getShiftClassification(shift.start_time, shift.notes);
    const theme = SHIFT_THEMES[classification];
    const Icon = theme.icon;
    const duration = getDurationHours(shift.start_time, shift.end_time);
    const isPast = new Date(shift.end_time) < new Date();
    const cleanName = cleanStaffName(shift.employee_name);
    const roleLabel = getRoleLabel(shift.role, isArabic);

    return (
        <div className={`group relative rounded-xl border p-2 text-xs shadow-2xs transition hover:shadow-md hover:border-teal-400/60 dark:hover:border-teal-500/40 ${theme.pill} ${isPast ? 'opacity-85' : ''}`}>
            {/* Top row: Avatar, Clean Name, Shift Icon */}
            <div className="flex items-center gap-1.5 min-w-0">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[9px] font-black shadow-2xs" style={avatarStyle(cleanName)}>
                    {initialsOf(cleanName)}
                </span>
                <div className="min-w-0 flex-1">
                    <p dir="auto" className="truncate font-black text-[11px] leading-tight text-slate-900 dark:text-white" title={shift.employee_name}>
                        {cleanName}
                    </p>
                    <p className="truncate text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                        {roleLabel}
                    </p>
                </div>
                <span className="shrink-0" title={isArabic ? theme.labelAr : theme.labelEn}>
                    <Icon size={13} className={theme.accent} />
                </span>
            </div>

            {/* Time & Duration row */}
            <div className="mt-1.5 flex items-center justify-between border-t border-black/5 pt-1.5 dark:border-white/5">
                <div dir="ltr" className="flex items-center gap-1 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    <Clock size={10} className="text-slate-400 shrink-0" />
                    <span className="whitespace-nowrap">{formatTimeRange(shift.start_time, shift.end_time)}</span>
                </div>
                <span className="font-mono text-[9px] font-black rounded px-1.5 py-0.2 bg-black/5 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                    {duration.toFixed(0)} س
                </span>
            </div>

            {/* Room assignment */}
            {shift.room_name && (
                <p className="mt-1 inline-flex items-center gap-1 truncate rounded bg-black/5 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300" title={shift.room_name}>
                    <DoorOpen size={9} className="shrink-0 opacity-70" />
                    <span className="truncate">{shift.room_name}</span>
                </p>
            )}

            {/* Notes if any */}
            {shift.notes && !isOnCallShift(shift.notes) && (
                <p className="mt-1 truncate rounded bg-black/5 px-1.5 py-0.5 text-[9px] font-medium opacity-85 dark:bg-white/5" title={shift.notes}>
                    {shift.notes}
                </p>
            )}

            {/* Action Bar (reveals on hover) */}
            <div className="mt-1.5 flex items-center justify-end gap-1 border-t border-black/5 pt-1 opacity-0 transition group-hover:opacity-100 dark:border-white/5">
                <button
                    type="button"
                    onClick={onEdit}
                    title={isArabic ? 'تعديل الوردية' : 'Edit Shift'}
                    className="grid h-5 w-5 place-items-center rounded text-slate-600 transition hover:bg-black/10 dark:text-slate-300 dark:hover:bg-white/10"
                >
                    <Pencil size={11} />
                </button>
                <button
                    type="button"
                    onClick={onDuplicate}
                    title={isArabic ? 'نسخ الوردية' : 'Duplicate Shift'}
                    className="grid h-5 w-5 place-items-center rounded text-slate-600 transition hover:bg-black/10 dark:text-slate-300 dark:hover:bg-white/10"
                >
                    <Copy size={11} />
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    title={isArabic ? 'حذف الوردية' : 'Delete Shift'}
                    className="grid h-5 w-5 place-items-center rounded text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400"
                >
                    <Trash2 size={11} />
                </button>
            </div>
        </div>
    );
};

/* Compact Cell in Staff Matrix View */
const MatrixShiftCell = ({ shift, isArabic, onEdit, onDuplicate, onDelete }) => {
    const classification = getShiftClassification(shift.start_time, shift.notes);
    const theme = SHIFT_THEMES[classification];
    const Icon = theme.icon;
    const duration = getDurationHours(shift.start_time, shift.end_time);

    return (
        <div className={`group/matrix relative mx-auto flex flex-col justify-center rounded-xl border p-1.5 text-[10px] shadow-2xs transition hover:shadow-sm ${theme.pill}`}>
            <div className="flex items-center justify-center gap-1 font-bold">
                <Icon size={11} className={theme.accent} />
                <span dir="ltr" className="font-mono text-[9px] whitespace-nowrap">{formatTimeRange(shift.start_time, shift.end_time)}</span>
            </div>
            <div className="font-mono text-[9px] opacity-75 mt-0.5">
                {duration.toFixed(0)} س
            </div>

            {/* Quick action overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-xl bg-slate-900/80 backdrop-blur-xs opacity-0 transition group-hover/matrix:opacity-100">
                <button
                    type="button"
                    onClick={onEdit}
                    title={isArabic ? 'تعديل' : 'Edit'}
                    className="grid h-6 w-6 place-items-center rounded text-white hover:bg-white/20"
                >
                    <Pencil size={11} />
                </button>
                <button
                    type="button"
                    onClick={onDuplicate}
                    title={isArabic ? 'تكرار' : 'Duplicate'}
                    className="grid h-6 w-6 place-items-center rounded text-white hover:bg-white/20"
                >
                    <Copy size={11} />
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    title={isArabic ? 'حذف' : 'Delete'}
                    className="grid h-6 w-6 place-items-center rounded text-rose-300 hover:bg-rose-500/40"
                >
                    <Trash2 size={11} />
                </button>
            </div>
        </div>
    );
};

/* Card in List / Grid / Day Focus View */
const EnhancedShiftCard = ({ shift, copy, formatDay, isArabic, onDelete, onEdit, onDuplicate }) => {
    const classification = getShiftClassification(shift.start_time, shift.notes);
    const theme = SHIFT_THEMES[classification];
    const Icon = theme.icon;
    const duration = getDurationHours(shift.start_time, shift.end_time);
    const cleanName = cleanStaffName(shift.employee_name);
    const roleLabel = getRoleLabel(shift.role, isArabic);

    return (
        <article className="group relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-xs font-black shadow-2xs" style={avatarStyle(cleanName)}>
                        {initialsOf(cleanName)}
                    </span>
                    <div className="min-w-0">
                        <h3 dir="auto" className="truncate font-black text-slate-900 dark:text-white text-sm" title={shift.employee_name}>
                            {cleanName}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {roleLabel}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${theme.pill}`}>
                                <Icon size={10} />
                                {isArabic ? theme.labelAr : theme.labelEn}
                            </span>
                            {shift.room_name && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={shift.room_name}>
                                    <DoorOpen size={10} className="opacity-70" />
                                    <span className="max-w-24 truncate">{shift.room_name}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                        type="button"
                        onClick={onEdit}
                        aria-label={copy('editFor', { employee: cleanName })}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-teal-600 transition hover:bg-teal-50 dark:hover:bg-teal-950/40"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={onDuplicate}
                        aria-label={copy('duplicateFor', { employee: cleanName })}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        <Copy size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(shift)}
                        aria-label={copy('deleteFor', { employee: cleanName })}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <dl className="mt-3.5 space-y-1.5 rounded-xl bg-slate-50/70 p-2.5 text-xs dark:bg-slate-950/50">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                    <dt className="text-slate-400">{copy('date')}</dt>
                    <dd className="font-bold text-slate-800 dark:text-slate-200">{formatDay(shift.start_time)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                    <dt className="text-slate-400">{copy('time')}</dt>
                    <dd dir="ltr" className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatTimeRange(shift.start_time, shift.end_time)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                    <dt className="text-slate-400">{copy('duration')}</dt>
                    <dd className="font-mono font-black text-teal-600 dark:text-teal-400">{duration.toFixed(0)} {isArabic ? 'ساعات' : 'hours'}</dd>
                </div>
            </dl>

            {shift.notes && !isOnCallShift(shift.notes) && (
                <p className="mt-2.5 truncate rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    {shift.notes}
                </p>
            )}
        </article>
    );
};

const Loading = ({ label }) => <div className="animate-pulse p-10 text-center text-xs font-bold text-slate-400">{label}</div>;

const ErrorState = ({ copy, onRetry }) => (
    <div role="alert" className="p-8 text-center">
        <Users size={28} className="mx-auto text-rose-400" />
        <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-400">{copy('loadError')}</p>
        <button type="button" onClick={onRetry} className="mt-2.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300">
            {copy('retry')}
        </button>
    </div>
);

const Empty = ({ copy, filtered }) => (
    <div className="p-10 text-center">
        <CalendarClock size={32} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-2 font-black text-slate-900 dark:text-white text-sm">{copy(filtered ? 'filteredEmpty' : 'empty')}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy(filtered ? 'filteredEmptyDescription' : 'emptyDescription')}</p>
    </div>
);

export default ShiftManager;
