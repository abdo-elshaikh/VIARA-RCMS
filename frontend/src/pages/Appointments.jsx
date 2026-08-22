// Appointments.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    Activity, AlertCircle, ArrowRight, Bell, Calendar, CalendarCheck2,
    CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, ChevronUp, Clock,
    FilterX, Gauge, ListChecks, Plus, RotateCw, Search,
    SlidersHorizontal, Sparkles, UserPlus, UserX, X, Zap, XCircle,
    Grid3X3, Table2, Eye, EyeOff, FileSpreadsheet, Printer,
    Clock4, Users, Building2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    useCreateWaitingListEntryMutation,
    useGetAppointmentsQuery,
    useGetExamTypesQuery,
    useGetMachinesQuery,
    useGetPatientsQuery,
    useGetScheduleAvailabilityQuery,
    useGetWaitingListQuery,
    useMarkAppointmentNoShowMutation,
    useRescheduleAppointmentMutation,
    useSendReminderMutation,
    useUpdateWaitingListEntryMutation,
    useDeleteAppointmentMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getRange, shiftAnchorDate, toDateInput } from '../utils/appointmentDates';
import { formatLocalizedDate } from '../utils/localizedDate';
import { buildCsv, getWaitingListValidation } from '../utils/appointmentOperations';
import { getPaginationState } from '../utils/pagination';
import useDebounce from '../hooks/useDebounce';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import Scheduler from '../components/ui/Scheduler';
import PageHeader from '../components/ui/PageHeader';
import MetricCard from '../components/ui/MetricCard';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import CancelReasonDialog from '../components/clinical/CancelReasonDialog';
import { inputClass } from '../utils/designTokens';

// ============================================================================
// DESIGN SYSTEM CONSTANTS
// ============================================================================

const COLOR_SYSTEM = {
    primary: {
        50: '#f0f9ff',
        100: '#e0f2fe',
        200: '#bae6fd',
        300: '#7dd3fc',
        400: '#38bdf8',
        500: '#0ea5e9',
        600: '#0284c7',
        700: '#0369a1',
        800: '#075985',
        900: '#0c4a6e',
    },
    success: {
        50: '#f0fdf4',
        100: '#dcfce7',
        200: '#bbf7d0',
        300: '#86efac',
        400: '#4ade80',
        500: '#22c55e',
        600: '#16a34a',
        700: '#15803d',
        800: '#166534',
        900: '#14532d',
    },
    warning: {
        50: '#fffbeb',
        100: '#fef3c7',
        200: '#fde68a',
        300: '#fcd34d',
        400: '#fbbf24',
        500: '#f59e0b',
        600: '#d97706',
        700: '#b45309',
        800: '#92400e',
        900: '#78350f',
    },
    danger: {
        50: '#fef2f2',
        100: '#fee2e2',
        200: '#fecaca',
        300: '#fca5a5',
        400: '#f87171',
        500: '#ef4444',
        600: '#dc2626',
        700: '#b91c1c',
        800: '#991b1b',
        900: '#7f1d1d',
    },
    gray: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
    }
};

const priorityConfig = {
    Emergency: {
        rail: '#ef4444',
        dot: 'bg-red-500',
        bg: 'bg-red-50 dark:bg-red-950/30',
        border: 'border-red-200 dark:border-red-900/50',
        text: 'text-red-700 dark:text-red-400',
        icon: Zap,
        label: 'Critical'
    },
    Urgent: {
        rail: '#f59e0b',
        dot: 'bg-amber-500',
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-200 dark:border-amber-900/50',
        text: 'text-amber-700 dark:text-amber-400',
        icon: AlertCircle,
        label: 'Urgent'
    },
    Routine: {
        rail: '#94a3b8',
        dot: 'bg-slate-400',
        bg: 'bg-slate-100 dark:bg-slate-800',
        border: 'border-slate-200 dark:border-slate-700',
        text: 'text-slate-600 dark:text-slate-400',
        icon: Activity,
        label: 'Routine'
    }
};

const statusConfig = {
    Confirmed: {
        rail: '#087F5B',
        dot: 'bg-teal-500',
        bg: 'bg-teal-50 dark:bg-teal-950/30',
        border: 'border-teal-200 dark:border-teal-900/50',
        text: 'text-teal-700 dark:text-teal-400',
        icon: CheckCircle2
    },
    Completed: {
        rail: '#059669',
        dot: 'bg-emerald-500',
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
        border: 'border-emerald-200 dark:border-emerald-900/50',
        text: 'text-emerald-700 dark:text-emerald-400',
        icon: CalendarCheck2
    },
    Scheduled: {
        rail: '#64748b',
        dot: 'bg-slate-500',
        bg: 'bg-slate-100 dark:bg-slate-800',
        border: 'border-slate-200 dark:border-slate-700',
        text: 'text-slate-600 dark:text-slate-300',
        icon: Calendar
    },
    Cancelled: {
        rail: '#94a3b8',
        dot: 'bg-slate-400',
        bg: 'bg-slate-100 dark:bg-slate-800/60',
        border: 'border-slate-200 dark:border-slate-700',
        text: 'text-slate-500 dark:text-slate-400',
        icon: XCircle
    },
    'No-Show': {
        rail: '#d97706',
        dot: 'bg-amber-500',
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-200 dark:border-amber-900/50',
        text: 'text-amber-700 dark:text-amber-400',
        icon: UserX
    },
    'In-Progress': {
        rail: '#8b5cf6',
        dot: 'bg-violet-500',
        bg: 'bg-violet-50 dark:bg-violet-950/30',
        border: 'border-violet-200 dark:border-violet-900/50',
        text: 'text-violet-700 dark:text-violet-400',
        icon: Activity
    },
    'Checked-In': {
        rail: '#06b6d4',
        dot: 'bg-cyan-500',
        bg: 'bg-cyan-50 dark:bg-cyan-950/30',
        border: 'border-cyan-200 dark:border-cyan-900/50',
        text: 'text-cyan-700 dark:text-cyan-400',
        icon: Clock4
    }
};

const AVATAR_SHADES = [
    'bg-teal-600', 'bg-emerald-600', 'bg-cyan-600', 'bg-slate-700',
    'bg-amber-600', 'bg-rose-600', 'bg-teal-700', 'bg-emerald-700',
    'bg-cyan-700', 'bg-slate-800', 'bg-lime-700', 'bg-sky-700'
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getAvatarShade = (name = '') => {
    const index = name ? name.charCodeAt(0) % AVATAR_SHADES.length : 0;
    return AVATAR_SHADES[index];
};

const getDisplayLocale = (lng = 'en') => lng?.startsWith('ar') ? 'ar-EG' : 'en-US';

const formatDateTime = (value, lng = 'en') =>
    formatLocalizedDate(value, getDisplayLocale(lng), {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

const formatDateOnly = (value, lng = 'en') =>
    formatLocalizedDate(`${value}T00:00:00`, getDisplayLocale(lng), {
        month: 'short',
        day: 'numeric'
    });

const formatTime = (value, lng = 'en') =>
    formatLocalizedDate(value, getDisplayLocale(lng), {
        hour: '2-digit',
        minute: '2-digit'
    });

const formatNumber = (value, lng = 'en') =>
    new Intl.NumberFormat(getDisplayLocale(lng)).format(Number(value) || 0);

const getAppointmentWindow = (date, time, durationMinutes = 60) => {
    const start = new Date(`${date}T${time || '08:00'}:00`);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
};

const getPresetRange = (preset) => {
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);
    switch (preset) {
        case 'today':
            return { startDate: toDateInput(start), endDate: toDateInput(end) };
        case 'week': {
            const day = start.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            start.setDate(start.getDate() + diff);
            end.setTime(start.getTime());
            end.setDate(start.getDate() + 6);
            return { startDate: toDateInput(start), endDate: toDateInput(end) };
        }
        case 'month':
            start.setDate(1);
            end.setMonth(start.getMonth() + 1, 0);
            return { startDate: toDateInput(start), endDate: toDateInput(end) };
        default:
            return null;
    }
};

// ============================================================================
// STYLE CONSTANTS
// ============================================================================

const cardBase = 'rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]/80 dark:shadow-none transition-all duration-200';

const sectionHeadingClass = 'text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400';
const subHeadingClass = 'text-[11px] font-medium text-slate-400 dark:text-slate-500';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Appointments = () => {
    const { t, i18n } = useTranslation('appointments');
    const [viewMode, setViewMode] = useState('day');
    const [layoutMode, setLayoutMode] = useState('list');
    const [date, setDate] = useState(toDateInput());
    const [selectedMachineId, setSelectedMachineId] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 300);
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [waitlistForm, setWaitlistForm] = useState({
        patientId: '', modalityId: '', examTypeId: '',
        preferredDate: toDateInput(), preferredStartTime: '08:00',
        preferredEndTime: '12:00', priority: 'Routine', source: 'Phone', notes: ''
    });
    const [rescheduleDraft, setRescheduleDraft] = useState(null);
    const [cancelAppt, setCancelAppt] = useState(null);
    const [rescheduleForm, setRescheduleForm] = useState({ date: toDateInput(), time: '08:00', reason: '' });
    const [promptAction, setPromptAction] = useState(null);
    const [showWaitlistForm, setShowWaitlistForm] = useState(false);
    const [showFilters, setShowFilters] = useState(true);
    const [showMetrics, setShowMetrics] = useState(true);
    const [focusedAppointment, setFocusedAppointment] = useState(null);

    const range = useMemo(() => getRange(date, viewMode), [date, viewMode]);
    const appointmentParams = viewMode === 'day'
        ? { date, modalityId: selectedMachineId === 'all' ? undefined : selectedMachineId }
        : { startDate: range.startDate, endDate: range.endDate, modalityId: selectedMachineId === 'all' ? undefined : selectedMachineId };

    const { data: appointments = [], isLoading, isError: appointmentsError, error: appointmentsErrorData, refetch: refetchAppointments, isFetching: isFetchingAppointments } = useGetAppointmentsQuery(appointmentParams);
    const { data: availability, isError: availabilityError, refetch: refetchAvailability } = useGetScheduleAvailabilityQuery(viewMode === 'day' ? { date } : range);
    const { data: waitingList = [], isError: waitingListError, refetch: refetchWaitingList } = useGetWaitingListQuery({ active: 'true', limit: 100 });
    const { data: machines = [], isError: machinesError, refetch: refetchMachines } = useGetMachinesQuery();
    const { data: patientsResponse, isError: patientsError } = useGetPatientsQuery({ limit: 100 });
    const { data: examTypes = [], isError: examTypesError } = useGetExamTypesQuery(waitlistForm.modalityId, { skip: !waitlistForm.modalityId });
    const [sendReminder, { isLoading: isSendingReminder }] = useSendReminderMutation();
    const [markNoShow, { isLoading: isMarkingNoShow }] = useMarkAppointmentNoShowMutation();
    const [rescheduleAppointment, { isLoading: isRescheduling }] = useRescheduleAppointmentMutation();
    const [createWaitingListEntry, { isLoading: isCreatingWaitlist }] = useCreateWaitingListEntryMutation();
    const [updateWaitingListEntry] = useUpdateWaitingListEntryMutation();
    const [deleteAppointment, { isLoading: isCancelingAppt }] = useDeleteAppointmentMutation();

    const patients = patientsResponse?.data || [];
    const hasAnyError = appointmentsError || availabilityError || waitingListError || machinesError || patientsError || examTypesError;
    const retryAll = () => {
        refetchAppointments();
        refetchAvailability();
        refetchWaitingList();
        refetchMachines();
    };
    const machineAppointments = useMemo(() => appointments.filter(appt =>
        selectedMachineId === 'all' || appt.modality_id === selectedMachineId
    ), [appointments, selectedMachineId]);

    const visibleAppointments = useMemo(() => {
        const search = debouncedSearch.trim().toLowerCase();
        return machineAppointments.filter(appt => {
            if (statusFilter !== 'all' && appt.status !== statusFilter) return false;
            if (priorityFilter !== 'all' && (appt.priority || 'Routine') !== priorityFilter) return false;
            if (!search) return true;
            return [
                appt.mrn, appt.patient_name, appt.machine_name, appt.exam_type_name,
                appt.radiologist_name, appt.technician_name, appt.nurse_name, appt.appointment_source
            ].filter(Boolean).join(' ').toLowerCase().includes(search);
        }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }, [machineAppointments, priorityFilter, debouncedSearch, statusFilter]);

    const pagination = getPaginationState(visibleAppointments.length, page, pageSize);
    const paginatedAppointments = useMemo(
        () => visibleAppointments.slice(pagination.startIndex, pagination.endIndex),
        [pagination.endIndex, pagination.startIndex, visibleAppointments]
    );

    useEffect(() => { setPage(1); }, [date, priorityFilter, debouncedSearch, selectedMachineId, statusFilter, viewMode]);
    useEffect(() => { setPage(cur => Math.min(cur, pagination.pageCount)); }, [pagination.pageCount]);
    useEffect(() => { setSelectedIds(new Set()); }, [date, viewMode, statusFilter, priorityFilter, debouncedSearch, selectedMachineId]);

    const scheduleStats = useMemo(() => {
        const bookedAppointments = machineAppointments.filter(a => a.status !== 'Cancelled');
        const cancelledAppointments = machineAppointments.filter(a => a.status === 'Cancelled');
        const total = machineAppointments.length;
        const completed = bookedAppointments.filter(a => a.status === 'Completed').length;
        const confirmed = bookedAppointments.filter(a => ['Confirmed', 'Scheduled'].includes(a.status)).length;
        const noShow = bookedAppointments.filter(a => a.status === 'No-Show').length;
        const urgent = bookedAppointments.filter(a => ['Urgent', 'Emergency'].includes(a.priority)).length;
        const cancelled = cancelledAppointments.length;
        const activeMachines = selectedMachineId === 'all'
            ? (availability?.machines || []).filter(m => m.is_schedulable).length || machines.length || 1
            : 1;
        const workdayHours = Math.max(1, (availability?.workingHours?.end ?? 22) - (availability?.workingHours?.start ?? 6));
        const bookedMinutes = bookedAppointments.reduce((sum, a) => {
            const d = new Date(a.end_time) - new Date(a.start_time);
            return sum + (Number.isFinite(d) && d > 0 ? d / 60000 : 0);
        }, 0);
        const periodDays = viewMode === 'month'
            ? Math.max(1, Math.round((new Date(range.endDate) - new Date(range.startDate)) / 86400000) + 1)
            : viewMode === 'week' ? 7 : 1;
        const utilization = Math.min(100, Math.round(bookedMinutes / (activeMachines * workdayHours * 60 * periodDays) * 100) || 0);
        return {
            total,
            completed,
            confirmed,
            noShow,
            urgent,
            utilization,
            cancelled,
            active: bookedAppointments.length,
            activeMachines,
            bookedMinutes,
            capacityMinutes: activeMachines * workdayHours * 60 * periodDays,
            periodDays
        };
    }, [availability, machineAppointments, machines.length, range.endDate, range.startDate, selectedMachineId, viewMode]);

    const hasActiveFilters = Boolean(searchTerm || statusFilter !== 'all' || priorityFilter !== 'all');
    const isToday = date === toDateInput();
    const language = i18n.language;
    const rangeLabel = {
        start: formatDateOnly(range.startDate, language),
        end: formatDateOnly(range.endDate, language),
    };
    const selectedMachineName = selectedMachineId === 'all'
        ? t('allRooms', 'All Rooms')
        : machines.find(machine => machine.modality_id === selectedMachineId)?.name || t('allRooms', 'All Rooms');
    const statusCounts = useMemo(() => {
        const counts = machineAppointments.reduce((acc, appt) => {
            acc[appt.status] = (acc[appt.status] || 0) + 1;
            return acc;
        }, { all: machineAppointments.length });
        return counts;
    }, [machineAppointments]);
    const priorityCounts = useMemo(() => {
        const counts = machineAppointments.reduce((acc, appt) => {
            const priority = appt.priority || 'Routine';
            acc[priority] = (acc[priority] || 0) + 1;
            return acc;
        }, { all: machineAppointments.length });
        return counts;
    }, [machineAppointments]);
    const nextAppointment = useMemo(() => {
        const now = Date.now();
        return visibleAppointments.find(appt =>
            !['Completed', 'Cancelled', 'No-Show'].includes(appt.status)
            && new Date(appt.start_time).getTime() >= now
        ) || visibleAppointments.find(appt => !['Completed', 'Cancelled', 'No-Show'].includes(appt.status));
    }, [visibleAppointments]);
    const flowStages = useMemo(() => ([
        { key: 'Scheduled', icon: Calendar, count: statusCounts.Scheduled || 0, tone: 'slate' },
        { key: 'Confirmed', icon: CheckCircle2, count: statusCounts.Confirmed || 0, tone: 'teal' },
        { key: 'Checked-In', icon: Clock4, count: statusCounts['Checked-In'] || statusCounts['Checked-in'] || 0, tone: 'cyan' },
        { key: 'In-Progress', icon: Activity, count: statusCounts['In-Progress'] || 0, tone: 'violet' },
        { key: 'Completed', icon: CalendarCheck2, count: statusCounts.Completed || 0, tone: 'emerald' },
    ]), [statusCounts]);
    const roomLoadRows = useMemo(() => {
        const rows = (availability?.machines || machines || []).map(machine => {
            const appointmentsForMachine = machine.appointments || machineAppointments.filter(appt => appt.modality_id === machine.modality_id);
            const booked = appointmentsForMachine.filter(appt => appt.status !== 'Cancelled').length;
            return {
                id: machine.modality_id,
                name: machine.name || machine.modality_name || t('availability.room', 'Room'),
                booked,
                isSchedulable: machine.is_schedulable ?? machine.status === 'Active',
            };
        });
        const maxBooked = Math.max(1, ...rows.map(row => row.booked));
        return rows
            .map(row => ({ ...row, load: Math.round((row.booked / maxBooked) * 100) }))
            .sort((a, b) => b.booked - a.booked);
    }, [availability?.machines, machineAppointments, machines, t]);
    const busiestRoom = roomLoadRows[0];
    const filteredShare = machineAppointments.length > 0 ? Math.round((visibleAppointments.length / machineAppointments.length) * 100) : 0;
    const completionRate = scheduleStats.active > 0 ? Math.round((scheduleStats.completed / scheduleStats.active) * 100) : 0;
    const disruptionRate = scheduleStats.total > 0 ? Math.round(((scheduleStats.cancelled + scheduleStats.noShow) / scheduleStats.total) * 100) : 0;
    const uniqueStaffCount = useMemo(() => {
        const staff = new Set();
        machineAppointments.forEach(appt => {
            [appt.radiologist_name, appt.technician_name, appt.nurse_name].filter(Boolean).forEach(name => staff.add(name));
        });
        return staff.size;
    }, [machineAppointments]);
    const unassignedAppointments = useMemo(() => machineAppointments.filter(appt =>
        !appt.radiologist_name && !appt.technician_name && !appt.nurse_name
    ).length, [machineAppointments]);

    const clearFilters = () => { setSearchTerm(''); setStatusFilter('all'); setPriorityFilter('all'); };

    const exportSchedule = () => {
        const headers = [
            t('export.dateTime'), t('export.mrn'), t('export.patient'), t('export.room'),
            t('export.exam'), t('export.radiologist'), t('export.technician'), t('export.nurse'),
            t('export.status'), t('export.priority'), t('export.source'), t('export.preparation')
        ];
        const rows = visibleAppointments.map(a => [
            formatDateTime(a.start_time, i18n.language), a.mrn, a.patient_name, a.machine_name, a.exam_type_name,
            a.radiologist_name, a.technician_name, a.nurse_name,
            t(`status.${a.status}`, a.status),
            t(`priority.${a.priority || 'Routine'}`, a.priority || 'Routine'),
            t(`waitlist.source.${a.appointment_source}`, a.appointment_source || ''),
            t(`preparation.${a.preparation_status}`, a.preparation_status || t('table.notRequired'))
        ]);
        const blob = new Blob([buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `appointments-${range.startDate}-${range.endDate}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const handleRemind = (appt) => setPromptAction({ type: 'reminder', appointments: [appt] });
    const handleBulkRemind = () => {
        const targets = paginatedAppointments.filter(a => selectedIds.has(a.appointment_id));
        if (targets.length === 0) return;
        setPromptAction({ type: 'reminder', appointments: targets });
    };
    const sendAppointmentReminder = async (recipientEmail) => {
        const targets = promptAction?.appointments || [];
        if (targets.length === 0) return false;
        try {
            await Promise.all(targets.map(appt =>
                sendReminder({ appointmentId: appt.appointment_id, recipientEmail, patientName: `${appt.patient_name} | ${appt.mrn}`, time: appt.start_time }).unwrap()
            ));
            toast.success(targets.length > 1 ? t('toast.reminderSentBulk', { count: targets.length, defaultValue: `Sent ${targets.length} reminders` }) : t('toast.reminderSent'));
            setSelectedIds(new Set());
            return true;
        } catch (error) { toast.error(getErrorMessage(error, t('toast.reminderFailed'))); return false; }
    };

    const handleNoShow = (appt) => setPromptAction({ type: 'noShow', appointments: [appt] });
    const markAppointmentAsNoShow = async (reason) => {
        const appt = promptAction?.appointments?.[0];
        if (!appt) return false;
        try {
            await markNoShow({ id: appt.appointment_id, reason }).unwrap();
            toast.success(t('toast.noShowMarked'));
            return true;
        } catch (error) { toast.error(getErrorMessage(error, t('toast.noShowFailed'))); return false; }
    };

    const openReschedule = (appt) => {
        const start = new Date(appt.start_time);
        setRescheduleDraft(appt);
        setRescheduleForm({ date: toDateInput(start), time: start.toTimeString().slice(0, 5), reason: '' });
    };

    const confirmReschedule = async () => {
        if (!rescheduleDraft) return;
        const duration = Math.max(15, Math.round((new Date(rescheduleDraft.end_time) - new Date(rescheduleDraft.start_time)) / 60000));
        const { startTime, endTime } = getAppointmentWindow(rescheduleForm.date, rescheduleForm.time, duration);
        try {
            await rescheduleAppointment({ id: rescheduleDraft.appointment_id, startTime, endTime, reason: rescheduleForm.reason.trim() || undefined }).unwrap();
            toast.success(t('toast.rescheduled'));
            setRescheduleDraft(null);
        } catch (error) { toast.error(getErrorMessage(error, t('toast.rescheduleFailed'))); }
    };

    const addWaitingListEntry = async () => {
        const validationError = getWaitingListValidation(waitlistForm, toDateInput());
        if (validationError) { toast.error(t(`toast.${validationError}`)); return; }
        try {
            await createWaitingListEntry({
                ...waitlistForm,
                modalityId: waitlistForm.modalityId || undefined,
                examTypeId: waitlistForm.examTypeId || undefined,
                notes: waitlistForm.notes.trim() || undefined
            }).unwrap();
            toast.success(t('toast.waitlistAdded'));
            setWaitlistForm(prev => ({ ...prev, patientId: '', notes: '' }));
            setShowWaitlistForm(false);
        } catch (error) { toast.error(getErrorMessage(error, t('toast.waitlistFailed'))); }
    };

    const updateWaitStatus = async (entry, status) => {
        try {
            await updateWaitingListEntry({ id: entry.waitlist_id, status }).unwrap();
            toast.success(t('toast.waitlistMarked', { status: t(`status.${status}`, status) }));
        } catch (error) { toast.error(getErrorMessage(error, t('toast.waitlistUpdateFailed'))); }
    };

    const toggleRowSelected = (id) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const allPageSelected = paginatedAppointments.length > 0 && paginatedAppointments.every(a => selectedIds.has(a.appointment_id));
    const toggleSelectAllOnPage = () => setSelectedIds(prev => {
        const next = new Set(prev);
        if (allPageSelected) paginatedAppointments.forEach(a => next.delete(a.appointment_id));
        else paginatedAppointments.forEach(a => next.add(a.appointment_id));
        return next;
    });

    return (
        <div className="space-y-5 sm:space-y-6">
            <PageHeader
                icon={CalendarRange}
                eyebrowIcon={Activity}
                eyebrow={t('command.eyebrow', 'Scheduling command center')}
                title={t('title', 'Appointment Management')}
                description={t('subtitle', 'Schedule, track, and manage all patient appointments')}
                meta={
                    <div className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <CommandFact
                            icon={Calendar}
                            label={t('command.period', 'Period')}
                            value={viewMode === 'day' ? formatDateOnly(date, language) : `${rangeLabel.start} - ${rangeLabel.end}`}
                        />
                        <CommandFact
                            icon={Building2}
                            label={t('command.roomScope', 'Room scope')}
                            value={selectedMachineName}
                        />
                        <CommandFact
                            icon={ListChecks}
                            label={t('command.visible', 'Visible')}
                            value={t('filters.results', {
                                shown: formatNumber(visibleAppointments.length, language),
                                total: formatNumber(machineAppointments.length, language)
                            })}
                        />
                        <CommandFact
                            icon={Clock}
                            label={t('command.next', 'Next appointment')}
                            value={nextAppointment
                                ? `${formatTime(nextAppointment.start_time, language)} - ${nextAppointment.patient_name || nextAppointment.mrn}`
                                : t('command.noNext', 'No upcoming appointment')}
                        />
                    </div>
                }
                actions={
                    <>
                        {isFetchingAppointments && (
                            <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                                <RotateCw size={14} className="animate-spin" />
                                {t('status.refreshing', 'Refreshing')}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowMetrics(!showMetrics)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-teal-700 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-[var(--VIARA-muted)] dark:hover:bg-[var(--VIARA-surface-hover)]"
                        >
                            {showMetrics ? <EyeOff size={14} /> : <Eye size={14} />}
                            {showMetrics ? t('metrics.hide', 'Hide Metrics') : t('metrics.show', 'Show Metrics')}
                        </button>
                        <button
                            type="button"
                            onClick={exportSchedule}
                            disabled={visibleAppointments.length === 0}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-[var(--VIARA-muted)] dark:hover:bg-[var(--VIARA-surface-hover)]"
                        >
                            <FileSpreadsheet size={15} />
                            {t('actions.exportSchedule', 'Export CSV')}
                        </button>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-teal-700 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-[var(--VIARA-muted)] dark:hover:bg-[var(--VIARA-surface-hover)]"
                            title={t('actions.print', 'Print')}
                            aria-label={t('actions.print', 'Print')}
                        >
                            <Printer size={15} />
                        </button>
                        <Link
                            to="/appointments/new"
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.98] dark:bg-white dark:text-slate-950 dark:hover:bg-teal-100"
                        >
                            <Plus size={16} />
                            {t('actions.newAppointment', 'New Appointment')}
                        </Link>
                    </>
                }
            />

            {hasAnyError && (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                        <AlertCircle size={16} />
                        {t('error.loadFailed', 'Failed to load appointment data')}
                    </div>
                    <button
                        type="button"
                        onClick={retryAll}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-red-800"
                    >
                        <RotateCw size={12} />
                        {t('actions.retry', 'Retry')}
                    </button>
                </div>
            )}

            {/* Metrics Grid */}
            {showMetrics && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <MetricCard
                        icon={CalendarRange}
                        tone="cyan"
                        label={t('overview.booked', 'Total Booked')}
                        value={formatNumber(scheduleStats.total, language)}
                        detail={t('overview.bookedDetail', 'Appointments in period')}
                        loading={isLoading}
                    />
                    <MetricCard
                        icon={CheckCircle2}
                        tone="emerald"
                        label={t('overview.confirmed', 'Confirmed')}
                        value={formatNumber(scheduleStats.confirmed, language)}
                        detail={t('overview.confirmedDetail', { count: formatNumber(scheduleStats.completed, language) })}
                        loading={isLoading}
                    />
                    <MetricCard
                        icon={Gauge}
                        tone="cyan"
                        label={t('overview.utilization', 'Utilization')}
                        value={`${formatNumber(scheduleStats.utilization, language)}%`}
                        detail={t('overview.utilizationDetail', 'Resource usage')}
                        loading={isLoading}
                    />
                    <MetricCard
                        icon={AlertCircle}
                        tone="amber"
                        label={t('overview.urgent', 'Urgent')}
                        value={formatNumber(scheduleStats.urgent, language)}
                        detail={t('overview.urgentDetail', 'High-priority cases')}
                        loading={isLoading}
                    />
                    <MetricCard
                        icon={UserX}
                        tone="rose"
                        label={t('overview.noShow', 'No-Shows')}
                        value={formatNumber(scheduleStats.noShow, language)}
                        detail={t('overview.noShowDetail', 'Missed appointments')}
                        loading={isLoading}
                    />
                    <MetricCard
                        icon={XCircle}
                        tone="blue"
                        label={t('overview.cancelled', 'Cancelled')}
                        value={formatNumber(scheduleStats.cancelled, language)}
                        detail={t('overview.cancelledDetail', 'Cancelled appointments')}
                        loading={isLoading}
                    />
                </div>
            )}

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
                <div className={`${cardBase} p-4 sm:p-5`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className={sectionHeadingClass}>{t('command.readiness', 'Schedule readiness')}</p>
                            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950 dark:text-white">
                                {t('command.operationalControl', 'Daily operating control')}
                            </h2>
                        </div>
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-400">
                            <Gauge size={12} />
                            {formatNumber(scheduleStats.activeMachines, language)} {t('command.activeRooms', 'Active rooms')}
                        </span>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <OperationSignal icon={CheckCircle2} label={t('command.completionRate', 'Completion rate')} value={`${formatNumber(completionRate, language)}%`} detail={t('command.completedOfActive', { completed: formatNumber(scheduleStats.completed, language), active: formatNumber(scheduleStats.active, language), defaultValue: '{{completed}} of {{active}} active studies' })} tone="emerald" />
                        <OperationSignal icon={AlertCircle} label={t('command.disruptionRate', 'Disruption rate')} value={`${formatNumber(disruptionRate, language)}%`} detail={t('command.cancelNoShow', { count: formatNumber(scheduleStats.cancelled + scheduleStats.noShow, language), defaultValue: '{{count}} cancelled or no-show' })} tone={disruptionRate > 15 ? 'rose' : 'slate'} />
                        <OperationSignal icon={Users} label={t('command.waitingPressure', 'Waiting pressure')} value={formatNumber(waitingList.length, language)} detail={t('waitlist.activeRequests', { count: formatNumber(waitingList.length, language) })} tone={waitingList.length > 0 ? 'amber' : 'slate'} />
                        <OperationSignal icon={Building2} label={t('command.busiestRoom', 'Busiest room')} value={busiestRoom?.name || '-'} detail={busiestRoom ? t('availability.bookedSlots', { count: formatNumber(busiestRoom.booked, language) }) : t('availability.noMachines', 'No active modalities found')} tone="cyan" />
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-[var(--VIARA-line)]">
                        <ProgressBar label={t('command.visibleShare', 'Visible share')} value={`${formatNumber(filteredShare, language)}%`} percent={filteredShare} tone="teal" />
                    </div>
                </div>

                <div className={`${cardBase} p-4 sm:p-5`}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className={sectionHeadingClass}>{t('command.patientFlow', 'Patient flow')}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {t('command.patientFlowDetail', 'Current schedule by workflow state')}
                            </p>
                        </div>
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-600 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300">
                            {formatNumber(scheduleStats.total, language)}
                        </span>
                    </div>
                    <div className="mt-4 space-y-3">
                        {flowStages.map(stage => (
                            <StageRow key={stage.key} stage={stage} total={Math.max(1, scheduleStats.total)} language={language} t={t} />
                        ))}
                    </div>
                </div>
            </section>

            <section className={`${cardBase} overflow-hidden`}>
                <div className="grid gap-4 border-b border-slate-100 bg-slate-50/60 p-4 dark:border-white/5 dark:bg-[var(--VIARA-surface)] 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
                    <div className="grid gap-3 xl:grid-cols-[auto_minmax(220px,.6fr)_auto] xl:items-center">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setDate(shiftAnchorDate(date, viewMode, -1))}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-teal-300 hover:text-teal-700 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-400 dark:hover:bg-[var(--VIARA-surface-hover)]"
                                aria-label={t('navigation.previous', 'Previous period')}
                            >
                                <ChevronLeft size={16} className="rtl-flip" />
                            </button>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold tabular-nums text-slate-800 outline-none transition focus:border-teal-600 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-200"
                            />
                            <button
                                type="button"
                                onClick={() => setDate(shiftAnchorDate(date, viewMode, 1))}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-teal-300 hover:text-teal-700 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-400 dark:hover:bg-[var(--VIARA-surface-hover)]"
                                aria-label={t('navigation.next', 'Next period')}
                            >
                                <ChevronRight size={16} className="rtl-flip" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setDate(toDateInput())}
                                className={`h-10 shrink-0 rounded-xl border px-4 text-xs font-black transition ${isToday
                                    ? 'border-teal-600 bg-teal-700 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-300'
                                    }`}
                            >
                                {t('navigation.today', 'Today')}
                            </button>
                        </div>

                        <div className="relative min-w-0">
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder={t('filters.searchPlaceholder', 'Search patients, MRN, rooms...')}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white ps-10 pe-9 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-600 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-100"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-0.5 text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-100"
                                    aria-label={t('filters.clearSearch', 'Clear search')}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                            <select
                                value={selectedMachineId}
                                onChange={e => setSelectedMachineId(e.target.value)}
                                className="h-10 min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-600 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-300"
                            >
                                <option value="all">{t('allRooms', 'All Rooms')}</option>
                                {machines.filter(m => m.status === 'Active').map(m => (
                                    <option key={m.modality_id} value={m.modality_id}>{m.name}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => setShowFilters(v => !v)}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-teal-300 hover:text-teal-700 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-300 dark:hover:bg-[var(--VIARA-surface-hover)]"
                            >
                                <SlidersHorizontal size={14} />
                                {showFilters ? t('filters.hide', 'Hide filters') : t('filters.show', 'Show filters')}
                            </button>
                            <button
                                type="button"
                                onClick={retryAll}
                                disabled={isFetchingAppointments}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-teal-300 hover:text-teal-700 disabled:opacity-40 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-400 dark:hover:bg-[var(--VIARA-surface-hover)]"
                                title={t('actions.refresh', 'Refresh')}
                                aria-label={t('actions.refresh', 'Refresh')}
                            >
                                <RotateCw size={14} className={isFetchingAppointments ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
                        <SegmentedControl
                            ariaLabel={t('viewMode', 'View mode')}
                            items={['day', 'week', 'month'].map(mode => ({ key: mode, label: t(`view.${mode}`, mode) }))}
                            value={viewMode}
                            onChange={setViewMode}
                        />
                        <SegmentedControl
                            ariaLabel={t('layoutMode', 'Layout mode')}
                            items={[
                                { key: 'list', label: t('layout.list', 'List'), icon: Table2 },
                                { key: 'calendar', label: t('layout.calendar', 'Calendar'), icon: Grid3X3 },
                            ]}
                            value={layoutMode}
                            onChange={setLayoutMode}
                        />
                    </div>
                </div>

                {showFilters && (
                    <div className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={sectionHeadingClass}>{t('filters.status', 'Status')}</span>
                            {['all', 'Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No-Show'].map(s => {
                                const active = statusFilter === s;
                                return (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setStatusFilter(s)}
                                        className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition ${active
                                            ? 'border-teal-700 bg-teal-700 text-white'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300 dark:hover:bg-[var(--VIARA-surface-hover)]'
                                            }`}
                                    >
                                        <span>{s === 'all' ? t('filters.allStatuses', 'All') : t(`status.${s}`, s)}</span>
                                        <span className={`rounded-lg bg-black/5 px-1.5 py-0.5 font-mono text-[10px] ${active ? 'bg-white/20 text-white' : 'text-slate-400 dark:bg-white/10 dark:text-slate-400'}`}>
                                            {formatNumber(statusCounts[s] || 0, language)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={sectionHeadingClass}>{t('filters.priority', 'Priority')}</span>
                            {['all', 'Routine', 'Urgent', 'Emergency'].map(priority => {
                                const active = priorityFilter === priority;
                                return (
                                    <button
                                        key={priority}
                                        type="button"
                                        onClick={() => setPriorityFilter(priority)}
                                        className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition ${active
                                            ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300 dark:hover:bg-[var(--VIARA-surface-hover)]'
                                            }`}
                                    >
                                        <span>{priority === 'all' ? t('filters.allPriorities', 'All priorities') : t(`priority.${priority}`, priority)}</span>
                                        <span className={`rounded-lg bg-black/5 px-1.5 py-0.5 font-mono text-[10px] ${active ? 'bg-white/20' : 'text-slate-400 dark:bg-white/10 dark:text-slate-400'}`}>
                                            {formatNumber(priorityCounts[priority] || 0, language)}
                                        </span>
                                    </button>
                                );
                            })}
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                >
                                    <FilterX size={13} />
                                    {t('filters.reset', 'Reset')}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
                {/* Appointments List/Calendar */}
                <section className={`${cardBase} flex flex-col overflow-hidden`}>
                    <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-white/5 dark:bg-[var(--VIARA-surface)] sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                {t('calendar.title', 'Scheduled Appointments')}
                            </h2>
                            <p className={`mt-0.5 ${subHeadingClass}`}>
                                {t('calendar.range', rangeLabel)}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedIds.size > 0 && (
                                <span className="flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                                    <Sparkles size={13} />
                                    {t('table.selectedCount', { count: formatNumber(selectedIds.size, language) })}
                                </span>
                            )}
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 tabular-nums dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300">
                                {t('calendar.count', { count: formatNumber(visibleAppointments.length, language) })}
                            </span>
                        </div>
                    </div>

                    {selectedIds.size > 0 && (
                        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-teal-50/70 px-5 py-3 dark:border-white/5 dark:bg-teal-950/20">
                            <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                                {t('table.selectedCount', { count: formatNumber(selectedIds.size, language) })}
                            </span>
                            <button
                                type="button"
                                onClick={handleBulkRemind}
                                disabled={isSendingReminder}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-teal-800 disabled:opacity-50"
                            >
                                <Bell size={12} />
                                {t('actions.bulkRemind', 'Send Reminders')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedIds(new Set())}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300"
                            >
                                {t('actions.clearSelection', 'Clear')}
                            </button>
                        </div>
                    )}

                    {layoutMode === 'calendar' ? (
                        <div className="p-0">
                            {isLoading ? (
                                <div className="flex flex-col items-center gap-3 p-20 text-center">
                                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                                    <p className="text-sm text-slate-500">{t('calendar.loading', 'Loading schedule...')}</p>
                                </div>
                            ) : (
                                <Scheduler
                                    appointments={visibleAppointments}
                                    currentDate={new Date(`${date}T00:00:00`)}
                                    viewMode={viewMode}
                                    onViewChange={setViewMode}
                                    onPrevDate={() => setDate(shiftAnchorDate(date, viewMode, -1))}
                                    onNextDate={() => setDate(shiftAnchorDate(date, viewMode, 1))}
                                    onToday={() => setDate(toDateInput())}
                                    onSelectEvent={setFocusedAppointment}
                                    t={t}
                                    locale={i18n.language}
                                />
                            )}
                        </div>
                    ) : (
                        <AppointmentTable
                            appointments={paginatedAppointments}
                            isLoading={isLoading}
                            selectedIds={selectedIds}
                            allPageSelected={allPageSelected}
                            onToggleSelect={toggleRowSelected}
                            onToggleSelectAll={toggleSelectAllOnPage}
                            onRemind={handleRemind}
                            onReschedule={openReschedule}
                            onNoShow={handleNoShow}
                            onCancel={setCancelAppt}
                            onSelect={setFocusedAppointment}
                            isMarkingNoShow={isMarkingNoShow}
                            language={language}
                            t={t}
                            hasActiveFilters={hasActiveFilters}
                            clearFilters={clearFilters}
                        />
                    )}

                    {layoutMode === 'list' && visibleAppointments.length > 0 && (
                        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-white/5 dark:bg-[var(--VIARA-surface)] sm:flex-row sm:items-center sm:justify-between">
                            <p className={`text-xs font-semibold text-slate-400 tabular-nums`}>
                                {t('calendar.pagination.range', {
                                    start: formatNumber(pagination.startIndex + 1, language),
                                    end: formatNumber(pagination.endIndex, language),
                                    total: formatNumber(visibleAppointments.length, language)
                                })}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                                    {t('calendar.pagination.rowsPerPage', 'Rows')}
                                    <select
                                        value={pageSize}
                                        onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-teal-600 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300"
                                    >
                                        {[20, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </label>
                                <span className={`min-w-16 text-center text-xs font-semibold text-slate-500 tabular-nums`}>
                                    {t('calendar.pagination.page', { page: formatNumber(pagination.currentPage, language), pages: formatNumber(pagination.pageCount, language) })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage(c => Math.max(1, c - 1))}
                                    disabled={pagination.currentPage === 1}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]"
                                >
                                    <ChevronLeft size={14} className="rtl-flip" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPage(c => Math.min(pagination.pageCount, c + 1))}
                                    disabled={pagination.currentPage === pagination.pageCount}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]"
                                >
                                    <ChevronRight size={14} className="rtl-flip" />
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                {/* Side Panel */}
                <aside className="space-y-5">
                    {focusedAppointment && (
                        <FocusedAppointmentCard
                            appointment={focusedAppointment}
                            language={language}
                            onClose={() => setFocusedAppointment(null)}
                            onRemind={() => handleRemind(focusedAppointment)}
                            onReschedule={() => openReschedule(focusedAppointment)}
                            t={t}
                        />
                    )}
                    <AvailabilityPanel availability={availability} t={t} />
                    <WaitingListPanel
                        waitingList={waitingList}
                        patients={patients}
                        machines={machines}
                        examTypes={examTypes}
                        form={waitlistForm}
                        setForm={setWaitlistForm}
                        onAdd={addWaitingListEntry}
                        isAdding={isCreatingWaitlist}
                        onUpdateStatus={updateWaitStatus}
                        showForm={showWaitlistForm}
                        setShowForm={setShowWaitlistForm}
                        language={language}
                        t={t}
                    />
                </aside>
            </div>

            {/* Modals */}
            <RescheduleModal
                draft={rescheduleDraft}
                form={rescheduleForm}
                setForm={setRescheduleForm}
                onCancel={() => setRescheduleDraft(null)}
                onConfirm={confirmReschedule}
                isSaving={isRescheduling}
                language={language}
                t={t}
            />

            <CancelReasonDialog
                isOpen={Boolean(cancelAppt)}
                patientName={cancelAppt?.patient_name || t('waitlist.unnamedPatient', 'Unnamed Patient')}
                isSaving={isCancelingAppt}
                onClose={() => setCancelAppt(null)}
                onConfirm={async (reason) => {
                    try {
                        await deleteAppointment({ id: cancelAppt.appointment_id, reason }).unwrap();
                        toast.success(t('toast.cancelled', 'Appointment cancelled successfully'));
                        setCancelAppt(null);
                    } catch (err) {
                        toast.error(getErrorMessage(err, t('toast.cancelFailed', 'Failed to cancel appointment')));
                    }
                }}
            />

            <TextPromptDialog
                isOpen={Boolean(promptAction)}
                onClose={() => setPromptAction(null)}
                onConfirm={promptAction?.type === 'reminder' ? sendAppointmentReminder : markAppointmentAsNoShow}
                title={promptAction?.type === 'reminder'
                    ? (promptAction.appointments?.length > 1 ? t('prompt.reminderTitleBulk', { count: formatNumber(promptAction.appointments.length, language) }) : t('prompt.reminderTitle', 'Send Appointment Reminder'))
                    : t('prompt.noShowTitle', 'Mark Appointment No-Show')}
                message={promptAction?.type === 'reminder' ? t('prompt.reminderDescription', 'Send confirmation details to patient email:') : t('prompt.noShowDescription', 'Specify a reason for marking no-show:')}
                label={promptAction?.type === 'reminder' ? t('prompt.email', 'Email Address') : t('prompt.noShowReason', 'Reason')}
                placeholder={promptAction?.type === 'reminder' ? t('prompt.emailPlaceholder', 'patient@example.com') : t('prompt.reasonPlaceholder', 'Patient did not arrive')}
                type={promptAction?.type === 'reminder' ? 'email' : 'text'}
                confirmLabel={promptAction?.type === 'reminder' ? t('prompt.sendReminder', 'Send Reminder') : t('prompt.markNoShow', 'Mark No-Show')}
                cancelLabel={t('prompt.cancel', 'Cancel')}
                validationMessage={promptAction?.type === 'reminder' ? t('prompt.emailRequired', 'Email required') : t('prompt.reasonRequired', 'Reason required')}
                isLoading={promptAction?.type === 'reminder' ? isSendingReminder : isMarkingNoShow}
            />
        </div>
    );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const CommandFact = ({ icon: Icon, label, value }) => (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]">
        <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 ring-1 ring-slate-200 dark:bg-[var(--VIARA-surface-raised)] dark:text-teal-300 dark:ring-white/10">
                <Icon size={14} />
            </span>
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400 dark:text-slate-500">
                    {label}
                </p>
                <p className="mt-0.5 truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                    {value}
                </p>
            </div>
        </div>
    </div>
);

const OperationSignal = ({ icon: Icon, label, value, detail, tone = 'slate' }) => {
    const tones = {
        emerald: 'text-emerald-600 dark:text-emerald-300',
        amber: 'text-amber-600 dark:text-amber-300',
        rose: 'text-rose-600 dark:text-rose-300',
        cyan: 'text-cyan-600 dark:text-cyan-300',
        slate: 'text-slate-500 dark:text-slate-300',
    };
    return (
        <article className="min-w-0 rounded-xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]">
            <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
                <Icon size={14} className={`shrink-0 ${tones[tone] || tones.slate}`} />
            </div>
            <p className="mt-2 truncate text-lg font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{detail}</p>
        </article>
    );
};

const ProgressBar = ({ label, value, percent, tone = 'teal' }) => {
    const tones = {
        teal: 'bg-teal-600',
        amber: 'bg-amber-500',
        rose: 'bg-rose-500',
    };
    return (
        <div>
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-black text-slate-700 dark:text-slate-200">{label}</span>
                <span className="font-bold tabular-nums text-slate-500 dark:text-slate-400">{value}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-100 dark:bg-[var(--VIARA-surface-raised)] dark:ring-white/10">
                <span className={`block h-full rounded-full ${tones[tone] || tones.teal}`} style={{ width: `${Math.max(0, Math.min(100, percent || 0))}%` }} />
            </div>
        </div>
    );
};

const StageRow = ({ stage, total, language, t }) => {
    const percent = Math.round((stage.count / total) * 100);
    const toneClass = {
        slate: 'bg-slate-500',
        teal: 'bg-teal-500',
        cyan: 'bg-cyan-500',
        violet: 'bg-violet-500',
        emerald: 'bg-emerald-500',
    }[stage.tone] || 'bg-slate-500';
    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t(`status.${stage.key}`, stage.key)}
                </span>
                <span className="font-mono text-xs font-black tabular-nums text-slate-500 dark:text-slate-400">
                    {formatNumber(stage.count, language)}
                </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[var(--VIARA-surface)]">
                <span className={`block h-full rounded-full ${toneClass}`} style={{ width: `${percent}%` }} />
            </div>
        </div>
    );
};

const SegmentedControl = ({ ariaLabel, items, value, onChange }) => (
    <div
        className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]"
        role="tablist"
        aria-label={ariaLabel}
    >
        {items.map(({ key, label, icon: Icon }) => (
            <button
                key={key}
                type="button"
                role="tab"
                aria-selected={value === key}
                onClick={() => onChange(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black capitalize transition ${value === key
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[var(--VIARA-surface-hover)] dark:hover:text-slate-100'
                    }`}
            >
                {Icon && <Icon size={13} />}
                {label}
            </button>
        ))}
    </div>
);

const FocusedAppointmentCard = ({ appointment, language, onClose, onRemind, onReschedule, t }) => {
    const sc = statusConfig[appointment.status] || statusConfig.Scheduled;
    const StatusIcon = sc.icon || Activity;
    const priority = priorityConfig[appointment.priority || 'Routine'] || priorityConfig.Routine;
    const PriorityIcon = priority.icon || Activity;
    const appointmentDate = appointment.start_time ? formatDateOnly(appointment.start_time.slice(0, 10), language) : '-';
    const appointmentTime = appointment.start_time && appointment.end_time
        ? `${appointmentDate} - ${formatTime(appointment.start_time, language)} - ${formatTime(appointment.end_time, language)}`
        : appointmentDate;

    return (
        <section className="overflow-hidden rounded-2xl border border-teal-200 bg-teal-50/70 shadow-sm dark:border-teal-500/20 dark:bg-teal-500/10">
            <div className="flex items-start justify-between gap-3 border-b border-teal-200/70 px-4 py-3 dark:border-teal-500/20">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[.12em] text-teal-700 dark:text-teal-300">
                        {t('focused.title', 'Selected appointment')}
                    </p>
                    <h2 className="mt-1 truncate text-sm font-black text-slate-950 dark:text-white">
                        {appointment.patient_name || t('waitlist.unnamedPatient', 'Unnamed Patient')}
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[var(--VIARA-surface-hover)] dark:hover:text-white"
                    aria-label={t('actions.close', 'Close')}
                >
                    <X size={14} />
                </button>
            </div>
            <div className="space-y-3 p-4">
                <div className="grid gap-2 text-xs">
                    <InfoLine label={t('table.mrn', 'MRN')} value={appointment.mrn || '-'} />
                    <InfoLine label={t('table.time', 'Time')} value={appointmentTime} />
                    <InfoLine label={t('table.room', 'Room')} value={appointment.machine_name || '-'} />
                    <InfoLine label={t('table.exam', 'Exam')} value={appointment.exam_type_name || t('table.noExamType', 'General Exam')} />
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase ${sc.bg} ${sc.text}`}>
                        <StatusIcon size={12} />
                        {t(`status.${appointment.status}`, appointment.status)}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase ${priority.bg} ${priority.text}`}>
                        <PriorityIcon size={12} />
                        {t(`priority.${appointment.priority || 'Routine'}`, appointment.priority || 'Routine')}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onRemind}
                        disabled={['Completed', 'Cancelled', 'No-Show'].includes(appointment.status)}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-xs font-black text-teal-700 ring-1 ring-teal-200 transition hover:bg-teal-700 hover:text-white disabled:opacity-40 dark:bg-[var(--VIARA-surface-raised)] dark:text-teal-300 dark:ring-teal-500/20"
                    >
                        <Bell size={13} />
                        {t('table.sendReminder', 'Send Reminder')}
                    </button>
                    <button
                        type="button"
                        onClick={onReschedule}
                        disabled={appointment.status === 'Completed'}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-xs font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-900 hover:text-white disabled:opacity-40 dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-200 dark:ring-white/10"
                    >
                        <RotateCw size={13} />
                        {t('table.reschedule', 'Reschedule')}
                    </button>
                </div>
            </div>
        </section>
    );
};

const InfoLine = ({ label, value }) => (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-white/75 px-3 py-2 dark:bg-white/[0.04]">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[.1em] text-slate-400">
            {label}
        </span>
        <span className="min-w-0 text-end font-bold text-slate-700 dark:text-slate-200">
            {value}
        </span>
    </div>
);

const AppointmentTable = ({
    appointments,
    isLoading,
    selectedIds,
    allPageSelected,
    onToggleSelect,
    onToggleSelectAll,
    onRemind,
    onReschedule,
    onNoShow,
    onCancel,
    onSelect,
    isMarkingNoShow,
    language,
    t,
    hasActiveFilters,
    clearFilters
}) => {
    if (isLoading) {
        return (
            <div className="p-8 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 animate-pulse">
                        <div className="h-4 w-4 rounded bg-slate-200 dark:bg-white/10" />
                        <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-white/10" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-32 rounded bg-slate-200 dark:bg-white/10" />
                            <div className="h-2 w-20 rounded bg-slate-100 dark:bg-[var(--VIARA-surface)]" />
                        </div>
                        <div className="h-3 w-24 rounded bg-slate-200 dark:bg-white/10" />
                        <div className="h-3 w-28 rounded bg-slate-200 dark:bg-white/10" />
                        <div className="h-3 w-16 rounded bg-slate-200 dark:bg-white/10" />
                    </div>
                ))}
            </div>
        );
    }

    if (appointments.length === 0) {
        return (
            <EmptyState.NoAppointments
                action={hasActiveFilters ? 'reset' : undefined}
                onAction={hasActiveFilters ? clearFilters : undefined}
                actionLabel={hasActiveFilters ? t('filters.reset', 'Reset filters') : undefined}
            />
        );
    }

    return (
        <div className="overflow-x-auto" role="region" aria-label={t('table.appointmentList', 'Appointment list')}>
            <table className="min-w-[1120px] w-full table-fixed border-collapse text-start text-sm" role="grid" aria-label={t('table.appointmentTable', 'Appointments')}>
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-[var(--VIARA-line)] dark:bg-[#0b1426]/95">
                    <tr>
                        <th className="w-12 px-4 py-3">
                            <input
                                type="checkbox"
                                checked={allPageSelected}
                                onChange={onToggleSelectAll}
                                className="h-4 w-4 rounded border-slate-300 text-teal-700 transition focus:ring-teal-600"
                                aria-label={t('table.selectAll', 'Select all appointments on this page')}
                            />
                        </th>
                        <th className="w-[30%] px-4 py-3 text-start text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {t('table.patient', 'Patient')}
                        </th>
                        <th className="hidden w-[22%] px-4 py-3 text-start text-[10px] font-bold uppercase tracking-widest text-slate-400 md:table-cell">
                            {t('table.details', 'Details')}
                        </th>
                        <th className="hidden w-[170px] px-4 py-3 text-start text-[10px] font-bold uppercase tracking-widest text-slate-400 lg:table-cell">
                            {t('table.time', 'Time')}
                        </th>
                        <th className="hidden w-[185px] px-4 py-3 text-start text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:table-cell">
                            {t('table.status', 'Status')}
                        </th>
                        <th className="w-[170px] px-4 py-3 text-end text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {t('table.actions', 'Actions')}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-white/5 dark:bg-[var(--VIARA-surface-raised)]">
                    {appointments.map((appt) => (
                        <AppointmentRow
                            key={appt.appointment_id}
                            appt={appt}
                            language={language}
                            isSelected={selectedIds.has(appt.appointment_id)}
                            onToggleSelect={() => onToggleSelect(appt.appointment_id)}
                            onRemind={() => onRemind(appt)}
                            onReschedule={() => onReschedule(appt)}
                            onNoShow={() => onNoShow(appt)}
                            onCancel={() => onCancel(appt)}
                            onSelect={() => onSelect(appt)}
                            isMarkingNoShow={isMarkingNoShow}
                            t={t}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const AppointmentRow = React.memo(({
    appt,
    language,
    isSelected,
    onToggleSelect,
    onRemind,
    onReschedule,
    onNoShow,
    onCancel,
    onSelect,
    isMarkingNoShow,
    t
}) => {
    const sc = statusConfig[appt.status] || statusConfig.Scheduled;
    const shade = getAvatarShade(appt.patient_name || appt.mrn);
    const initials = (appt.patient_name || appt.mrn || 'P')[0]?.toUpperCase();
    const isCancelled = appt.status === 'Cancelled';
    const priority = priorityConfig[appt.priority] || priorityConfig.Routine;
    const StatusIcon = sc.icon || Activity;
    const dateLabel = appt.start_time ? formatDateOnly(appt.start_time.slice(0, 10), language) : '-';
    const timeLabel = appt.start_time && appt.end_time
        ? `${formatTime(appt.start_time, language)} - ${formatTime(appt.end_time, language)}`
        : '-';

    return (
        <tr
            role="row"
            aria-selected={isSelected}
            className={`group cursor-pointer border-b border-transparent transition-all duration-200 hover:border-teal-100 dark:hover:border-teal-500/10 ${isSelected ? 'bg-teal-50/70 dark:bg-teal-950/25' : 'hover:bg-teal-50/35 dark:hover:bg-white/[0.035]'
                } ${isCancelled ? 'opacity-60 hover:opacity-100' : ''}`}
            onClick={onSelect}
        >
            <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelect}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700 transition focus:ring-teal-600"
                    aria-label={t('table.selectAppointment', 'Select appointment')}
                />
            </td>
            <td className="px-4 py-4">
                <div className="flex items-center gap-3.5">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${shade} text-sm font-bold text-white shadow-sm ring-2 ring-white dark:ring-[var(--VIARA-surface-raised)]`}>
                        {initials}
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                                {appt.patient_name || t('waitlist.unnamedPatient', 'Unnamed Patient')}
                            </span>
                            {appt.priority && appt.priority !== 'Routine' && (
                                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${priority.bg} ${priority.border} ${priority.text}`}>
                                    {priority.label}
                                </span>
                            )}
                        </div>
                        <div className={`font-mono text-[10px] font-semibold text-teal-700 dark:text-teal-400 tabular-nums`}>
                            {appt.mrn}
                        </div>
                    </div>
                </div>
            </td>
            <td className="hidden px-4 py-4 md:table-cell">
                <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {appt.machine_name}
                    </div>
                    <div className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                        {appt.exam_type_name || t('table.noExamType', 'General Exam')}
                    </div>
                </div>
            </td>
            <td className="hidden whitespace-nowrap px-4 py-4 lg:table-cell">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                    {dateLabel}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                    {timeLabel}
                </div>
            </td>
            <td className="hidden px-4 py-4 sm:table-cell">
                <div className="flex flex-col items-start gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${sc.bg} ${sc.border} ${sc.text}`}>
                        <StatusIcon size={12} />
                        {t(`status.${appt.status}`, appt.status)}
                    </span>
                    {appt.radiologist_name && (
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            {t('table.radiologist', 'Rad')}: {appt.radiologist_name}
                        </span>
                    )}
                </div>
            </td>
            <td className="whitespace-nowrap px-4 py-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                    {appt.exam_id && (
                        <Link
                            to={`/cases/${appt.exam_id}`}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-[var(--VIARA-surface-hover)]"
                            title={t('table.viewCase', 'View Case')}
                            aria-label={t('table.viewCase', 'View Case')}
                        >
                            <Activity size={14} />
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={onRemind}
                        disabled={['Completed', 'Cancelled', 'No-Show'].includes(appt.status)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-teal-50 hover:text-teal-700 disabled:opacity-30 dark:hover:bg-[var(--VIARA-surface-hover)]"
                        title={t('table.sendReminder', 'Send Reminder')}
                        aria-label={t('table.sendReminder', 'Send Reminder')}
                    >
                        <Bell size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={onReschedule}
                        disabled={appt.status === 'Completed'}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-teal-50 hover:text-teal-700 disabled:opacity-30 dark:hover:bg-[var(--VIARA-surface-hover)]"
                        title={t('table.reschedule', 'Reschedule')}
                        aria-label={t('table.reschedule', 'Reschedule')}
                    >
                        <RotateCw size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={onNoShow}
                        disabled={isMarkingNoShow || ['Completed', 'Cancelled', 'No-Show'].includes(appt.status)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600 disabled:opacity-30 dark:hover:bg-amber-500/10"
                        title={t('table.noShow', 'Mark No-Show')}
                        aria-label={t('table.noShow', 'Mark No-Show')}
                    >
                        <UserX size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={['Completed', 'Cancelled', 'No-Show'].includes(appt.status)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-500/10"
                        title={t('table.cancelAppt', 'Cancel Appointment')}
                        aria-label={t('table.cancelAppt', 'Cancel Appointment')}
                    >
                        <XCircle size={14} />
                    </button>
                </div>
            </td>
        </tr>
    );
});

const AvailabilityPanel = ({ availability, t }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const maxBookings = Math.max(1, ...(availability?.machines || []).map(m => m.appointments?.length || 0));

    return (
        <section className={`${cardBase} flex flex-col overflow-hidden`}>
            <button
                type="button"
                className="flex items-center justify-between w-full px-4 py-3.5 text-start transition hover:bg-slate-50/60 dark:hover:bg-[var(--VIARA-surface-hover)]"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/20">
                        <Gauge size={15} />
                    </div>
                    <div>
                        <h2 className={sectionHeadingClass}>{t('availability.title', 'Modality Room Load')}</h2>
                        <p className={subHeadingClass}>
                            {t('availability.workingHours', {
                                start: availability?.workingHours?.start ?? 6,
                                end: availability?.workingHours?.end ?? 22
                            })}
                        </p>
                    </div>
                </div>
                <ChevronUp size={15} className={`text-slate-400 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`} />
            </button>

            {!isCollapsed && (
                <div className="space-y-3 p-4">
                    {(availability?.machines || []).length === 0 ? (
                        <p className="py-3 text-center text-xs text-slate-400">{t('availability.noMachines', 'No active modalities found')}</p>
                    ) : (
                        (availability?.machines || []).map((machine) => {
                            const count = machine.appointments?.length || 0;
                            const pct = Math.round((count / maxBookings) * 100);
                            const barColor = pct >= 80 ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500';
                            return (
                                <div key={machine.modality_id} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs font-semibold">
                                        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                                            <span className={`h-1.5 w-1.5 rounded-full ${machine.is_schedulable ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                            {machine.name}
                                        </span>
                                        <span className={`font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums`}>
                                            {pct}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                                        <div
                                            className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </section>
    );
};

const WaitingListPanel = ({
    waitingList,
    patients,
    machines,
    examTypes,
    form,
    setForm,
    onAdd,
    isAdding,
    onUpdateStatus,
    showForm,
    setShowForm,
    language,
    t
}) => {
    const [searchWaitlist, setSearchWaitlist] = useState('');

    const filteredWaitingList = useMemo(() => {
        const search = searchWaitlist.trim().toLowerCase();
        if (!search) return waitingList;
        return waitingList.filter(entry =>
            (entry.patient_name || '').toLowerCase().includes(search) ||
            (entry.mrn || '').toLowerCase().includes(search)
        );
    }, [waitingList, searchWaitlist]);

    return (
        <section className={`${cardBase} flex flex-col overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
                        <Users size={15} />
                    </div>
                    <h2 className={sectionHeadingClass}>{t('waitlist.title', 'Waiting List')}</h2>
                    {waitingList.length > 0 && (
                        <span className={`rounded-full bg-amber-600/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 tabular-nums`}>
                            {formatNumber(waitingList.length, language)}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setShowForm(v => !v)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300"
                    title={showForm ? t('waitlist.collapseForm', 'Collapse form') : t('waitlist.add', 'Add to Waitlist')}
                >
                    {showForm ? <X size={14} /> : <Plus size={14} />}
                </button>
            </div>

            {showForm && (
                <div className="animate-in slide-in-from-top-1 space-y-3 border-b border-slate-100 bg-slate-50/60 p-4 duration-150 dark:border-white/5 dark:bg-white/[0.02]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {t('waitlist.formTitle', 'Add Patient to Waitlist')}
                    </p>
                    <select
                        value={form.patientId}
                        onChange={e => setForm(prev => ({ ...prev, patientId: e.target.value }))}
                        className={inputClass}
                    >
                        <option value="">{t('waitlist.selectPatient', 'Select patient...')}</option>
                        {patients.map(p => (
                            <option key={p.patient_id} value={p.patient_id}>
                                {p.mrn} - {p.first_name} {p.last_name}
                            </option>
                        ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <select
                            value={form.priority}
                            onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                            className={inputClass}
                        >
                            <option value="Routine">{t('waitlist.priority.Routine', 'Routine')}</option>
                            <option value="Urgent">{t('waitlist.priority.Urgent', 'Urgent')}</option>
                            <option value="Emergency">{t('waitlist.priority.Emergency', 'Emergency')}</option>
                        </select>
                        <input
                            type="date"
                            min={toDateInput()}
                            value={form.preferredDate}
                            onChange={e => setForm(prev => ({ ...prev, preferredDate: e.target.value }))}
                            className={inputClass}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={onAdd}
                        disabled={isAdding || !form.patientId}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 py-2.5 text-xs font-bold text-white transition hover:bg-teal-800 disabled:opacity-50"
                    >
                        <UserPlus size={13} />
                        {isAdding ? t('waitlist.adding', 'Adding...') : t('waitlist.add', 'Add to Waitlist')}
                    </button>
                </div>
            )}

            <div className="p-3">
                {waitingList.length === 0 ? (
                    <div className="py-8 text-center text-xs font-semibold text-slate-400">
                        {t('waitlist.empty', 'No patients on waiting list')}
                    </div>
                ) : (
                    <>
                        {/* Search */}
                        <div className="relative mb-3">
                            <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                            <input
                                value={searchWaitlist}
                                onChange={e => setSearchWaitlist(e.target.value)}
                                placeholder={t('waitlist.search', 'Search waiting list...')}
                                className="h-8 w-full rounded-xl border border-slate-200 bg-slate-50/60 ps-8 pe-3 text-xs font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-100"
                            />
                        </div>

                        <div className="scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10 max-h-80 space-y-2 overflow-y-auto">
                            {filteredWaitingList.map((entry) => {
                                const isEmergency = entry.priority === 'Emergency';
                                const isUrgent = entry.priority === 'Urgent';
                                const dotColor = isEmergency ? 'bg-rose-500' : isUrgent ? 'bg-amber-500' : 'bg-emerald-500';
                                const shade = getAvatarShade(entry.patient_name || entry.mrn);

                                return (
                                    <div
                                        key={entry.waitlist_id}
                                        className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-teal-300 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:hover:border-teal-800"
                                    >
                                        <div className="min-w-0 flex-1 pe-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${shade} text-[10px] font-bold text-white`}>
                                                    {(entry.patient_name || entry.mrn || 'P')[0]?.toUpperCase()}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                                                        {entry.patient_name || entry.mrn}
                                                    </p>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`font-mono text-[10px] font-semibold text-teal-700 dark:text-teal-400 tabular-nums`}>
                                                            {entry.mrn}
                                                        </span>
                                                        <span className="text-slate-300 dark:text-slate-600">-</span>
                                                        <span className="text-[10px] font-medium text-slate-400 truncate">
                                                            {entry.exam_type_name || t('table.noExamType', 'General Exam')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                                            <Link
                                                to={`/appointments/new?patientId=${entry.patient_id}&date=${entry.preferred_date || toDateInput()}&modalityId=${entry.modality_id || ''}&examTypeId=${entry.exam_type_id || ''}&priority=${entry.priority || 'Routine'}&source=${encodeURIComponent(entry.source || 'Walk-in')}&waitlistId=${entry.waitlist_id}&notes=${encodeURIComponent(entry.notes || '')}`}
                                                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-teal-600/10 px-3 py-1.5 text-[10px] font-bold text-teal-700 transition hover:bg-teal-700 hover:text-white dark:bg-teal-500/15 dark:text-teal-300"
                                            >
                                                <span>{t('waitlist.bookNow', 'Book')}</span>
                                                <ArrowRight size={11} className="rtl-flip" />
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};

const RescheduleModal = ({ draft, form, setForm, onCancel, onConfirm, isSaving, language, t }) => {
    if (!draft) return null;
    const duration = Math.max(15, Math.round((new Date(draft.end_time) - new Date(draft.start_time)) / 60000));

    return (
        <Modal
            isOpen={Boolean(draft)}
            onClose={onCancel}
            title={t('reschedule.title', 'Reschedule Appointment')}
            size="sm"
            footer={
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={onCancel}>{t('reschedule.cancel', 'Cancel')}</Button>
                    <Button
                        type="submit"
                        loading={isSaving}
                        onClick={onConfirm}
                    >
                        {isSaving ? t('reschedule.saving', 'Saving...') : t('reschedule.confirm', 'Confirm Reschedule')}
                    </Button>
                </div>
            }
        >
            {draft.patient_name && (
                <p className="mb-4 text-xs font-medium text-slate-400">
                    {draft.patient_name} - {draft.mrn}
                </p>
            )}
            <form onSubmit={e => { e.preventDefault(); onConfirm(); }} className="space-y-4">
                <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {t('reschedule.newDate', 'New Date')}
                    </label>
                    <input
                        type="date"
                        value={form.date}
                        onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                        className={inputClass}
                        required
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {t('reschedule.newTime', 'New Time')}
                    </label>
                    <input
                        type="time"
                        value={form.time}
                        onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))}
                        className={inputClass}
                        required
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {t('reschedule.reason', 'Reason for Rescheduling')}
                    </label>
                    <textarea
                        value={form.reason}
                        onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
                        rows={2}
                        className={`${inputClass} resize-none`}
                        placeholder={t('reschedule.reasonPlaceholder', 'Optional reason...')}
                    />
                </div>
            </form>
        </Modal>
    );
};

export default Appointments;
