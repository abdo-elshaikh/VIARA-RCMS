import React, { memo, useDeferredValue, useMemo, useState, useEffect, useRef } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    ArrowRight,
    ArrowLeft,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock3,
    FileText,
    ClipboardList,
    Filter,
    Layers,
    LockKeyhole,
    MoreHorizontal,
    Printer,
    Search,
    SlidersHorizontal,
    Tag,
    X,
    User,
    Activity,
    CreditCard,
    Banknote,
    FlaskConical,
    Microscope,
    Radio,
    ScanLine,
    Stethoscope,
    FileCheck2,
    PackageCheck,
    XCircle,
    Eye,
    Edit3,
    LayoutGrid,
    List,
    Users,
    RotateCcw,
    Lock,
    Unlock,
    DoorOpen,
    Bell,
    Volume2
} from 'lucide-react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../../store/authSlice';
import { useClaimReceptionTaskMutation, useReleaseReceptionTaskMutation, useBroadcastPatientCallMutation } from '../../store/api';
import { playHospitalChime } from '../../utils/audioChime';
import PriorityBadge from '../ui/PriorityBadge';
import StatusPill from '../ui/StatusPill';
import EmptyState from '../ui/EmptyState';
import Pagination from '../ui/Pagination';
import { formatDuration } from '../../utils/dateFormat';
import { getPaginationState } from '../../utils/pagination';
import { getEffectivePermissions } from '../../utils/effectivePermissions';
import { getValidQueueTransitions } from './receptionLogic';
import {
    findPartialPaymentException,
    getEffectivePartialPaymentExceptionStatus,
    hasApprovedPartialPaymentException,
} from './partialPaymentExceptionStatus';

const STAGES = [
    'Scheduled',
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Images Ready',
    'Images Delivered',
    'Completed',
    'Reporting',
    'Finalized',
    'Delivered'
];

const PRIORITY_ORDER = {
    Emergency: 0,
    Urgent: 1,
    Routine: 2
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const STAGE_TONES = {
    Scheduled: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    Arrived: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800',
    'Payment Pending': 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
    'Prep Pending': 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-800',
    'Ready for Exam': 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-800',
    'In Exam': 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800',
    'Images Ready': 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
    'Images Delivered': 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
    Reporting: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800',
    Finalized: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
    Delivered: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    Cancelled: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800'
};

const ROLE_STAGE_PERMISSIONS = {
    Receptionist: ['Scheduled', 'Arrived', 'Payment Pending', 'Images Ready', 'Images Delivered', 'Cancelled'],
    Cashier: ['Prep Pending', 'Ready for Exam'],
    Nurse: ['Ready for Exam', 'Cancelled'],
    Technician: ['In Exam', 'Cancelled'],
    Radiologist: ['Finalized', 'Cancelled'],
};

const DailyOperationsTable = ({
    appointments = [],
    queueItems = [],
    invoices = [],
    appLoading,
    canManageQueue = false,
    canDeliverResults = false,
    canViewInvoices = false,
    createAppointmentInvoice,
    onMove,
    onPickup,
    onRequestReport,
    isRequestingReport = false,
    onDeferReport,
    onOpenPayment,
    partialPaymentExceptions = [],
    onRequestPartialPaymentException,
    i18n,
    t,
    onSelectCase,
    isWaitlistOpen = false,
    onToggleWaitlist,
    waitlistCount = 0,
    quickFilter = null,
    externalDesk = null,
    externalScope = null,
    externalRooms = null,
    externalModalities = null,
    onDeskChange = null,
    onScopeChange = null,
    hasActiveReceptionShift = true
}) => {
    const user = useSelector(selectCurrentUser);
    const currentUserId = user?.user_id || user?.id;
    const [searchTerm, setSearchTerm] = useState('');
    const [stageFilter, setStageFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [modalityFilter, setModalityFilter] = useState('all');
    const [localRoomFilter, setLocalRoomFilter] = useState(() => localStorage.getItem('viara_reception_room') || 'all');
    const [localReceptionScope, setLocalReceptionScope] = useState('all'); // 'all' | 'attention' | 'mine' | 'unclaimed'
    const [localDesk, setLocalDesk] = useState(() => localStorage.getItem('viara_reception_desk') || 'شباك 1');
    const [viewMode, setViewMode] = useState(() => {
        try {
            const saved = localStorage.getItem('viara_reception_view_mode');
            if (saved === 'cards' || saved === 'table') return saved;
            return typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table';
        } catch {
            return 'table';
        }
    });
    const [sortField, setSortField] = useState('time');
    const [sortDirection, setSortDirection] = useState('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [actionMenu, setActionMenu] = useState(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const searchInputRef = useRef(null);
    const deferredSearchTerm = useDeferredValue(searchTerm);

    const activeDesk = externalDesk || localDesk;
    const receptionScope = externalScope || localReceptionScope;
    const roomFilter = externalRooms !== null ? externalRooms : localRoomFilter;

    const [claimReceptionTask] = useClaimReceptionTaskMutation();
    const [releaseReceptionTask] = useReleaseReceptionTaskMutation();
    const [broadcastPatientCall] = useBroadcastPatientCallMutation();

    const isRtl = i18n?.language?.startsWith('ar');

    useEffect(() => {
        const handleSearchShortcut = (event) => {
            const target = event.target;
            const typing = target instanceof HTMLInputElement
                || target instanceof HTMLTextAreaElement
                || target instanceof HTMLSelectElement
                || target?.isContentEditable;
            if (typing) return;
            if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleSearchShortcut);
        return () => window.removeEventListener('keydown', handleSearchShortcut);
    }, []);

    const handleClaimTask = async (appointment, e) => {
        e?.stopPropagation?.();
        if (!appointment?.appointment_id) return;
        if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
            toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لاستلام المهام.' : 'Please start your reception shift first.');
            return;
        }
        try {
            await claimReceptionTask({
                appointmentId: appointment.appointment_id,
                desk: activeDesk,
                expectedVersion: appointment.receptionist_assignment_version
            }).unwrap();
            toast.success(t('reception.claimedSuccess', { defaultValue: 'تم استلام الحالة على شباكك بنجاح' }));
        } catch (err) {
            toast.error(err?.data?.message || t('reception.claimFailed', { defaultValue: 'تعذر استلام الحالة' }));
        }
    };

    const handleReleaseTask = async (appointment, e) => {
        e?.stopPropagation?.();
        if (!appointment?.appointment_id) return;
        if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
            toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لإدارة المهام.' : 'Please start your reception shift first.');
            return;
        }
        try {
            await releaseReceptionTask({
                appointmentId: appointment.appointment_id
            }).unwrap();
            toast.success(t('reception.releasedSuccess', { defaultValue: 'تم تحرير الحالة وأصبحت متاحة للجميع' }));
        } catch (err) {
            toast.error(err?.data?.message || t('reception.releaseFailed', { defaultValue: 'تعذر تحرير الحالة' }));
        }
    };

    // Sync quick filter from parent KPI cards
    useEffect(() => {
        if (quickFilter) {
            if (quickFilter.stage !== undefined) setStageFilter(quickFilter.stage);
            if (quickFilter.priority !== undefined) setPriorityFilter(quickFilter.priority);
            if (quickFilter.modality !== undefined) setModalityFilter(quickFilter.modality);
            if (quickFilter.search !== undefined) setSearchTerm(quickFilter.search);
            setCurrentPage(1);
        }
    }, [quickFilter]);

    const getReceptionAssignment = (appointment, queue) => {
        const receptionistId = appointment?.receptionist_id ?? queue?.receptionist_id;
        const receptionistName = appointment?.receptionist_name ?? queue?.receptionist_name;
        const receptionistDesk = appointment?.receptionist_desk ?? queue?.receptionist_desk;

        return {
            id: receptionistId ?? null,
            name: receptionistName ?? null,
            desk: receptionistDesk ?? null,
        };
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        setStageFilter('all');
        setPriorityFilter('all');
        setModalityFilter('all');
        setLocalRoomFilter('all');
        setLocalReceptionScope('all');
        setShowAdvancedFilters(false);
        onScopeChange?.('all');
        localStorage.setItem('viara_reception_room', 'all');
        setCurrentPage(1);
    };

    const hasExternalRooms = Array.isArray(roomFilter) ? roomFilter.length > 0 : (roomFilter && roomFilter !== 'all');
    const hasExternalModalities = Array.isArray(externalModalities) && externalModalities.length > 0;
    const isFiltered = Boolean(searchTerm.trim() || stageFilter !== 'all' || priorityFilter !== 'all' || modalityFilter !== 'all' || hasExternalRooms || hasExternalModalities || receptionScope !== 'all');

    const locale = isRtl ? 'ar-EG' : 'en-US';

    const permissions = getEffectivePermissions(user);
    const has = (permission) => user?.role === 'Developer' || permissions.has(permission);
    const canMoveTo = (stage) => ['Developer', 'Admin'].includes(user?.role)
        || Boolean(ROLE_STAGE_PERMISSIONS[user?.role]?.includes(stage));

    // Helper to determine the precise operational stage for any row
    const resolveStage = (queue, appointment) => {
        if (queue?.queue_stage) return queue.queue_stage;
        if (appointment?.queue_stage) return appointment.queue_stage;
        const apptStatus = appointment?.status;
        if (apptStatus === 'Arrived' || apptStatus === 'Checked-in') return 'Arrived';
        if (apptStatus === 'In Exam') return 'In Exam';
        if (apptStatus === 'Completed') {
            if (['Finalized', 'Amended'].includes(appointment?.report_status) && appointment?.report_locked) return 'Finalized';
            if (appointment?.report_request_status === 'NotRequested') {
                return appointment?.images_delivered_at ? 'Images Delivered' : 'Images Ready';
            }
            if (appointment?.report_request_status === 'Requested') return 'Reporting';
            return 'Completed';
        }
        if (apptStatus === 'Cancelled' || apptStatus === 'No Show') return 'Cancelled';
        return 'Scheduled';
    };

    // Build merged rows from appointments, queueItems, and invoices.
    // Index lookups by exam/appointment id first so merging stays O(N+M)
    // instead of a find() scan per row on every poll.
    const rows = useMemo(() => {
        const queueByExam = new Map();
        const queueByAppt = new Map();
        (queueItems || []).forEach((item) => {
            if (item.exam_id && !queueByExam.has(item.exam_id)) queueByExam.set(item.exam_id, item);
            if (item.appointment_id && !queueByAppt.has(item.appointment_id)) queueByAppt.set(item.appointment_id, item);
        });
        const invoiceByAppt = new Map();
        const invoiceByExam = new Map();
        (invoices || []).forEach((inv) => {
            if (inv.appointment_id && !invoiceByAppt.has(inv.appointment_id)) invoiceByAppt.set(inv.appointment_id, inv);
            if (inv.exam_id && !invoiceByExam.has(inv.exam_id)) invoiceByExam.set(inv.exam_id, inv);
        });

        const matchedExamIds = new Set();
        const matchedApptIds = new Set();

        const result = (appointments || []).map((appointment) => {
            const queue = (appointment.exam_id && queueByExam.get(appointment.exam_id)) ||
                queueByAppt.get(appointment.appointment_id);
            if (queue?.exam_id) matchedExamIds.add(queue.exam_id);
            if (queue?.appointment_id) matchedApptIds.add(queue.appointment_id);
            if (appointment.exam_id) matchedExamIds.add(appointment.exam_id);
            if (appointment.appointment_id) matchedApptIds.add(appointment.appointment_id);

            const invoice = (appointment.appointment_id && invoiceByAppt.get(appointment.appointment_id)) ||
                (appointment.exam_id && invoiceByExam.get(appointment.exam_id)) ||
                (queue?.exam_id && invoiceByExam.get(queue.exam_id)) ||
                (queue?.appointment_id && invoiceByAppt.get(queue.appointment_id));

            return {
                appointment,
                queue,
                invoice
            };
        });

        (queueItems || []).forEach((queue) => {
            const alreadyMatched = (queue.exam_id && matchedExamIds.has(queue.exam_id)) ||
                (queue.appointment_id && matchedApptIds.has(queue.appointment_id));
            if (!alreadyMatched) {
                const invoice = (queue.exam_id && invoiceByExam.get(queue.exam_id)) ||
                    (queue.appointment_id && invoiceByAppt.get(queue.appointment_id));
                result.push({
                    queue,
                    invoice
                });
            }
        });

        return result;
    }, [appointments, invoices, queueItems]);

    // Unique modalities for filter
    const availableModalities = useMemo(() => {
        const set = new Set();
        rows.forEach(({ appointment, queue }) => {
            const mod = appointment?.machine_name || queue?.machine_name || queue?.modality_name;
            if (mod) set.add(mod);
        });
        return Array.from(set).sort();
    }, [rows]);

    // Unique rooms for division
    const availableRooms = useMemo(() => {
        const map = new Map();
        rows.forEach(({ appointment, queue }) => {
            const room = appointment?.room_number || queue?.room_number;
            const mod = appointment?.machine_name || queue?.machine_name || queue?.modality_name;
            if (room) {
                map.set(room, mod ? `${room} (${mod})` : room);
            }
        });
        return Array.from(map.entries()).map(([room, label]) => ({ room, label }));
    }, [rows]);

    // Stage counts for quick filter chips
    const filterCounts = useMemo(() => {
        const counts = {
            all: rows.length,
            Scheduled: 0,
            Arrived: 0,
            'Payment Pending': 0,
            'Prep Pending': 0,
            'Ready for Exam': 0,
            'In Exam': 0,
            'Images Ready': 0,
            'Images Delivered': 0,
            Completed: 0,
            Reporting: 0,
            Finalized: 0,
            overdue: 0,
            urgent: 0,
        };

        rows.forEach(({ appointment, queue }) => {
            const stage = resolveStage(queue, appointment);
            if (stage && counts[stage] !== undefined) {
                counts[stage]++;
            }
            if (queue?.is_overdue) {
                counts.overdue++;
            }
            const priority = appointment?.priority || queue?.priority;
            if (['Emergency', 'Urgent'].includes(priority)) {
                counts.urgent++;
            }
        });

        return counts;
    }, [rows]);

    // Filter and Sort rows
    const filteredAndSorted = useMemo(() => {
        let list = [...rows];
        if (receptionScope === 'rooms' && (!Array.isArray(roomFilter) || roomFilter.length === 0)) list = [];
        if (receptionScope === 'modalities' && (!Array.isArray(externalModalities) || externalModalities.length === 0)) list = [];

        // 1. Search Query Filter
        const query = deferredSearchTerm.trim().toLocaleLowerCase();
        if (query) {
            list = list.filter(({ appointment, queue, invoice }) =>
                [
                    appointment?.patient_name,
                    appointment?.mrn,
                    appointment?.exam_type_name,
                    appointment?.machine_name,
                    queue?.patient_name,
                    queue?.mrn,
                    queue?.exam_type_name,
                    queue?.modality_name,
                    invoice?.invoice_number
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLocaleLowerCase()
                    .includes(query)
            );
        }

        // 2. Stage Filter
        if (stageFilter === 'overdue') {
            list = list.filter(({ queue }) => queue?.is_overdue);
        } else if (stageFilter === 'urgent') {
            list = list.filter(({ appointment, queue }) =>
                ['Emergency', 'Urgent'].includes(appointment?.priority || queue?.priority)
            );
        } else if (stageFilter !== 'all') {
            list = list.filter(({ appointment, queue }) => {
                const stage = resolveStage(queue, appointment);
                return stage === stageFilter;
            });
        }

        // 3. Priority Filter
        if (priorityFilter !== 'all') {
            list = list.filter(({ appointment, queue }) =>
                (appointment?.priority || queue?.priority || 'Routine') === priorityFilter
            );
        }

        // 4. Modality Filter
        if (Array.isArray(externalModalities) && externalModalities.length > 0) {
            list = list.filter(({ appointment, queue }) => {
                const apptMod = appointment?.machine_name || appointment?.modality_name || appointment?.modality_type;
                const queueMod = queue?.machine_name || queue?.modality_name || queue?.modality_type;
                return externalModalities.some((m) => {
                    if (!m) return false;
                    const mLower = String(m).trim().toLowerCase();
                    return (
                        (apptMod && String(apptMod).trim().toLowerCase() === mLower) ||
                        (queueMod && String(queueMod).trim().toLowerCase() === mLower) ||
                        (appointment?.modality_id && String(appointment.modality_id) === String(m)) ||
                        (queue?.modality_id && String(queue.modality_id) === String(m))
                    );
                });
            });
        } else if (modalityFilter !== 'all') {
            list = list.filter(({ appointment, queue }) => {
                const mod = appointment?.machine_name || queue?.machine_name || queue?.modality_name;
                return mod === modalityFilter;
            });
        }

        // 4b. Room Filter
        if (Array.isArray(roomFilter) && roomFilter.length > 0) {
            list = list.filter(({ appointment, queue }) => {
                const apptRoom = appointment?.room_number || appointment?.room_name;
                const queueRoom = queue?.room_number || queue?.room_name;
                return roomFilter.some((r) => {
                    if (!r) return false;
                    const rLower = String(r).trim().toLowerCase();
                    return (
                        (apptRoom && String(apptRoom).trim().toLowerCase() === rLower) ||
                        (queueRoom && String(queueRoom).trim().toLowerCase() === rLower) ||
                        (appointment?.room_id && String(appointment.room_id) === String(r)) ||
                        (queue?.room_id && String(queue.room_id) === String(r))
                    );
                });
            });
        } else if (typeof roomFilter === 'string' && roomFilter && roomFilter !== 'all') {
            list = list.filter(({ appointment, queue }) => {
                const room = appointment?.room_number || queue?.room_number;
                return room === roomFilter;
            });
        }

        // 4c. Reception Work Scope (My Tasks / Unclaimed)
        if (receptionScope === 'mine') {
            list = list.filter(({ appointment, queue }) => {
                const assignment = getReceptionAssignment(appointment, queue);
                return String(assignment.id ?? '') === String(currentUserId ?? '');
            });
        } else if (receptionScope === 'unclaimed') {
            list = list.filter(({ appointment, queue }) => {
                const assignment = getReceptionAssignment(appointment, queue);
                const stage = resolveStage(queue, appointment);
                return !assignment.id && ['Scheduled', 'Arrived'].includes(stage);
            });
        } else if (receptionScope === 'attention') {
            list = list.filter(({ appointment, queue }) => {
                const assignment = getReceptionAssignment(appointment, queue);
                const stage = resolveStage(queue, appointment);
                const priority = appointment?.priority || queue?.priority || 'Routine';
                const urgent = ['Emergency', 'Urgent'].includes(priority);
                const overdue = Boolean(queue?.is_overdue);
                const unclaimed = !assignment.id && ['Scheduled', 'Arrived'].includes(stage);
                return urgent || overdue || unclaimed;
            });
        } else if (receptionScope === 'emergency') {
            list = list.filter(({ appointment, queue }) =>
                ['Emergency', 'Urgent'].includes(appointment?.priority || queue?.priority)
            );
        }

        // 5. Sorting
        list.sort((a, b) => {
            let valA, valB;

            switch (sortField) {
                case 'time':
                    valA = new Date(a.appointment?.start_time || a.queue?.created_at || 0).getTime();
                    valB = new Date(b.appointment?.start_time || b.queue?.created_at || 0).getTime();
                    break;
                case 'patient':
                    valA = (a.appointment?.patient_name || a.queue?.patient_name || '').toLocaleLowerCase();
                    valB = (b.appointment?.patient_name || b.queue?.patient_name || '').toLocaleLowerCase();
                    return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'exam':
                    valA = (a.appointment?.exam_type_name || a.queue?.exam_type_name || '').toLocaleLowerCase();
                    valB = (b.appointment?.exam_type_name || b.queue?.exam_type_name || '').toLocaleLowerCase();
                    return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'priority': {
                    const prioA = a.appointment?.priority || a.queue?.priority || 'Routine';
                    const prioB = b.appointment?.priority || b.queue?.priority || 'Routine';
                    valA = PRIORITY_ORDER[prioA] ?? 2;
                    valB = PRIORITY_ORDER[prioB] ?? 2;
                    break;
                }
                case 'stage': {
                    const stA = resolveStage(a.queue, a.appointment);
                    const stB = resolveStage(b.queue, b.appointment);
                    valA = STAGES.indexOf(stA);
                    valB = STAGES.indexOf(stB);
                    break;
                }
                case 'wait':
                    valA = a.queue?.waiting_minutes || 0;
                    valB = b.queue?.waiting_minutes || 0;
                    break;
                default:
                    valA = 0;
                    valB = 0;
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [rows, deferredSearchTerm, stageFilter, priorityFilter, modalityFilter, externalModalities, roomFilter, receptionScope, sortField, sortDirection, currentUserId]);

    // Reset page on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, stageFilter, priorityFilter, modalityFilter, externalModalities, roomFilter, receptionScope]);

    // Pagination
    const paginationState = useMemo(() =>
        getPaginationState(filteredAndSorted.length, currentPage, pageSize),
        [filteredAndSorted.length, currentPage, pageSize]
    );

    const paginatedRows = useMemo(() =>
        filteredAndSorted.slice(paginationState.startIndex, paginationState.endIndex),
        [filteredAndSorted, paginationState.startIndex, paginationState.endIndex]
    );

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
            return;
        }
        setSortField(field);
        setSortDirection('asc');
    };

    const handleViewModeChange = (mode) => {
        setViewMode(mode);
        try { localStorage.setItem('viara_reception_view_mode', mode); } catch { /* optional preference */ }
    };

    const hasApprovedPaymentException = (invoiceId, targetStage) => {
        return hasApprovedPartialPaymentException(partialPaymentExceptions, invoiceId, targetStage);
    };

    const stageLabel = (stage) => t(`queue.stages.${stage}`, { defaultValue: stage });

    const formatTime = (isoString) => {
        if (!isoString) return '-';
        try {
            return new Date(isoString).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return '-';
        }
    };

    const formatDateTime = (isoString) => {
        if (!isoString) return '-';
        try {
            return new Date(isoString).toLocaleString(locale, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '-';
        }
    };

    const getStageTimestamp = (stage, queue, appointment) => {
        const values = { ...appointment, ...queue };
        return {
            Registered: values.created_at,
            Scheduled: values.created_at,
            Arrived: values.arrived_at,
            'Payment Pending': values.arrived_at,
            'Prep Pending': values.prep_started_at,
            'Ready for Exam': values.prep_completed_at,
            'In Exam': values.exam_started_at,
            'Images Ready': values.images_ready_at || values.exam_completed_at,
            'Images Delivered': values.images_delivered_at,
            Reporting: values.reporting_started_at || values.report_requested_at,
            Finalized: values.report_finalized_at,
            Delivered: values.delivered_at,
            Cancelled: values.updated_at || values.created_at
        }[stage] || values.created_at;
    };

    const print = (row, type) => {
        const appointmentId = row.appointment?.appointment_id || row.queue?.appointment_id;
        if (!appointmentId) return;
        if (type === 'sticker') {
            window.open(`/print/sticker/${appointmentId}?copies=1`, '_blank');
        } else if (type === 'slip') {
            window.open(`/print/booking-slip/${appointmentId}`, '_blank');
        } else {
            window.open(`/print/receipt/${appointmentId}`, '_blank');
        }
        setActionMenu(null);
    };

    // Stage transition config: icon + action label + button colour per next-stage
    const STAGE_TRANSITION_CONFIG = {
        Arrived: { icon: CheckCircle2, actionKey: 'queue.arrived', btnClass: 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm shadow-teal-600/20 dark:bg-teal-500 dark:hover:bg-teal-400' },
        'Payment Pending': { icon: Banknote, actionKey: 'queue.sendToCashier', btnClass: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/20' },
        'Prep Pending': { icon: FlaskConical, actionKey: 'queue.prepComplete', btnClass: 'bg-cyan-600 text-white hover:bg-cyan-700 shadow-sm shadow-cyan-600/20 dark:bg-cyan-500 dark:hover:bg-cyan-400' },
        'Ready for Exam': { icon: Stethoscope, actionKey: 'queue.readyForExam', btnClass: 'bg-cyan-600 text-white hover:bg-cyan-700 shadow-sm dark:bg-cyan-500 dark:hover:bg-cyan-400' },
        'In Exam': { icon: Radio, actionKey: 'queue.startExam', btnClass: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 dark:bg-indigo-500 dark:hover:bg-indigo-400' },
        'Images Ready': { icon: ScanLine, actionKey: 'queue.deliverImages', btnClass: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20' },
        'Images Delivered': { icon: PackageCheck, actionKey: 'queue.requestReport', btnClass: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-600/20' },
        Reporting: { icon: Microscope, actionKey: 'queue.endExam', btnClass: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-600/20 dark:bg-violet-500 dark:hover:bg-violet-400' },
        Finalized: { icon: FileCheck2, actionKey: 'queue.finalize', btnClass: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20' },
        Delivered: { icon: PackageCheck, actionKey: 'queue.pickup', btnClass: 'bg-slate-700 text-white hover:bg-slate-800 shadow-sm dark:bg-slate-600 dark:hover:bg-slate-500' },
        Cancelled: { icon: XCircle, actionKey: 'common.cancel', btnClass: 'bg-rose-50 text-rose-700 hover:bg-rose-100 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/50' },
    };

    const getRowExceptionInfo = (row) => {
        const { appointment, queue, invoice } = row || {};
        const stage = resolveStage(queue, appointment);
        const hasBalance = invoice && Number(invoice.balance_amount || 0) > 0;
        const canRequestPartialException = invoice?.invoice_status === 'Partial'
            && hasBalance
            && Boolean(onRequestPartialPaymentException)
            && ['Arrived', 'Payment Pending'].includes(stage);

        const hasNurse = Boolean(
            queue?.nurse_name ||
            queue?.nurse_id ||
            appointment?.nurse_name ||
            appointment?.nurse_id
        );
        const partialExceptionTargetStage = hasNurse ? 'Prep Pending' : 'Ready for Exam';
        const existingPaymentException = findPartialPaymentException(
            partialPaymentExceptions,
            invoice?.invoice_id,
            partialExceptionTargetStage
        );
        const exceptionStatus = getEffectivePartialPaymentExceptionStatus(existingPaymentException);
        const exceptionStatusConfig = {
            Pending: {
                icon: Clock3,
                label: t('billing.exceptionPending', { defaultValue: 'Pending review' }),
                className: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
            },
            Approved: {
                icon: CheckCircle2,
                label: t('billing.exceptionApproved', { defaultValue: 'Exception approved' }),
                className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
            },
            Rejected: {
                icon: XCircle,
                label: t('billing.exceptionRejected', { defaultValue: 'Request rejected' }),
                className: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
            },
            Expired: {
                icon: Clock3,
                label: t('billing.exceptionExpired', { defaultValue: 'Approval expired' }),
                className: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
            },
            Used: {
                icon: CheckCircle2,
                label: t('billing.exceptionUsed', { defaultValue: 'Exception used' }),
                className: 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
            },
        }[exceptionStatus];

        const canRetryPartialException = canRequestPartialException
            && ['Rejected', 'Expired', 'Used'].includes(exceptionStatus);

        const requestException = () => onRequestPartialPaymentException?.({
            invoice,
            transactionType: 'ClinicalQueueTransition',
            amount: Number(invoice.balance_amount || 0),
            targetStage: partialExceptionTargetStage,
            notes: `Requested queue exception to move case into ${partialExceptionTargetStage}`
        });

        return {
            hasBalance,
            canRequestPartialException,
            partialExceptionTargetStage,
            existingPaymentException,
            exceptionStatus,
            exceptionStatusConfig,
            canRetryPartialException,
            requestException
        };
    };

    const renderFinancialStatus = (invoice, row) => {
        const currentInvoice = invoice || row?.invoice;
        if (!currentInvoice) {
            return (
                <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    {t('financial.noInvoice', { defaultValue: 'بدون فاتورة' })}
                </span>
            );
        }

        const balance = Number(currentInvoice.balance_amount || 0);
        const paid = Number(currentInvoice.paid_amount || 0);

        const rowData = row || { invoice: currentInvoice };
        const { existingPaymentException, exceptionStatusConfig } = getRowExceptionInfo(rowData);
        const ExceptionStatusIcon = exceptionStatusConfig?.icon;

        return (
            <div className="flex flex-col items-start gap-1">
                {balance <= 0 || currentInvoice.invoice_status === 'Paid' ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/90 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-black text-emerald-700 shadow-2xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CheckCircle2 size={11} className="shrink-0" />
                        <span>{t('financial.paid', { defaultValue: 'خالص' })}</span>
                    </span>
                ) : paid > 0 ? (
                    <button
                        type="button"
                        onClick={() => onOpenPayment && onOpenPayment(currentInvoice)}
                        title={onOpenPayment ? t('billing.collectPayment', { defaultValue: 'انقر للتحصيل السريع' }) : undefined}
                        className={`inline-flex items-center gap-1 rounded-lg border border-amber-300/90 bg-amber-50 px-2 py-0.5 text-[10.5px] font-black text-amber-700 shadow-2xs transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 ${onOpenPayment ? 'cursor-pointer hover:border-amber-400' : ''}`}
                    >
                        <Banknote size={11} className="shrink-0" />
                        <span>{t('financial.balanceDue', { amount: balance.toLocaleString(), defaultValue: `متبقي ${balance} ج.م` })}</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onOpenPayment && onOpenPayment(currentInvoice)}
                        title={onOpenPayment ? t('billing.collectPayment', { defaultValue: 'انقر للتحصيل السريع' }) : undefined}
                        className={`inline-flex items-center gap-1 rounded-lg border border-rose-300/90 bg-rose-50 px-2 py-0.5 text-[10.5px] font-black text-rose-700 shadow-2xs transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 ${onOpenPayment ? 'cursor-pointer hover:border-rose-400' : ''}`}
                    >
                        <Banknote size={11} className="shrink-0" />
                        <span>{t('financial.unpaid', { defaultValue: 'غير مسدد' })}</span>
                    </button>
                )}

                {/* Exception micro-badge in the financial status cell */}
                {existingPaymentException && exceptionStatusConfig && (
                    <span
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${exceptionStatusConfig.className}`}
                        title={existingPaymentException?.review_notes || existingPaymentException?.reason || exceptionStatusConfig.label}
                    >
                        {ExceptionStatusIcon && <ExceptionStatusIcon size={9} className="shrink-0" />}
                        <span>{exceptionStatusConfig.label}</span>
                    </span>
                )}
            </div>
        );
    };

    const renderStatus = (row) => {
        const { appointment, queue } = row;
        const stage = resolveStage(queue, appointment);
        const reportRequestedAt = queue?.report_requested_at || appointment?.report_requested_at;
        const stageTimestamp = getStageTimestamp(stage, queue, appointment);
        const receptionAssignment = getReceptionAssignment(appointment, queue);

        return (
            <div className="flex min-w-0 items-center gap-1.5 flex-wrap">
                {/* Current stage badge */}
                <span className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-[10.5px] font-extrabold ring-1 ${STAGE_TONES[stage] || STAGE_TONES.Scheduled}`}>
                    {stageLabel(stage)}
                </span>

                {stageTimestamp && (
                    <span
                        className="inline-flex items-center text-[9.5px] font-semibold text-slate-500 dark:text-slate-400"
                        title={`التاريخ والوقت الفعليان: ${formatDateTime(stageTimestamp)}`}
                    >
                        {formatDateTime(stageTimestamp)}
                    </span>
                )}

                {reportRequestedAt && ['Images Delivered', 'Reporting'].includes(stage) && (
                    <span
                        className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9.5px] font-bold text-violet-700 dark:text-violet-300"
                        title={`وقت طلب التقرير: ${formatTime(reportRequestedAt)}`}
                    >
                        طلب التقرير: {formatTime(reportRequestedAt)}
                    </span>
                )}

                {/* Receptionist Ownership / Claim status */}
                {receptionAssignment.name ? (
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold ${String(receptionAssignment.id) === String(currentUserId)
                        ? 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                        }`}>
                        <User size={10} />
                        <span>{String(receptionAssignment.id) === String(currentUserId) ? (isRtl ? 'مكتبي' : 'My desk') : receptionAssignment.name}</span>
                        {receptionAssignment.desk && <span>({receptionAssignment.desk})</span>}
                        {String(receptionAssignment.id) === String(currentUserId) && (
                            <button
                                type="button"
                                onClick={(e) => handleReleaseTask(appointment || queue, e)}
                                title="تحرير الحالة"
                                className="ms-0.5 text-slate-400 hover:text-rose-600"
                            >
                                <X size={10} />
                            </button>
                        )}
                    </span>
                ) : ['Scheduled', 'Arrived'].includes(stage) && (
                    <button
                        type="button"
                        onClick={(e) => handleClaimTask(appointment || queue, e)}
                        className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title="استلام الحالة على مكتبي"
                    >
                        <Lock size={9} />
                        <span>استلام</span>
                    </button>
                )}
            </div>
        );
    };

    const renderWait = (queue) => queue ? (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[11px] font-black tabular-nums ${queue.is_overdue
            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/60'
            : 'text-slate-600 dark:text-slate-400'
            }`}>
            {queue.is_overdue && <AlertTriangle size={11} className="animate-pulse text-rose-500 shrink-0" />}
            <span>{formatDuration(queue.waiting_minutes || 0, i18n?.language)}</span>
        </span>
    ) : (
        <span className="text-slate-400 text-xs">-</span>
    );

    const renderActions = (row, align = 'end', isLastRow = false, isCardView = false) => {
        const { appointment, queue, invoice } = row;
        const examId = queue?.exam_id || appointment?.exam_id;
        const stage = resolveStage(queue, appointment);
        const appointmentId = appointment?.appointment_id || queue?.appointment_id;
        const menuKey = examId || appointmentId;
        const queueTarget = { exam_id: examId, appointment_id: appointmentId, queue_stage: stage };

        const {
            hasBalance,
            canRequestPartialException,
            partialExceptionTargetStage,
            existingPaymentException,
            canRetryPartialException,
            requestException
        } = getRowExceptionInfo(row);

        const finalDeliveryBlocked = ['Finalized', 'Images Ready'].includes(stage) && hasBalance;
        const caseHasArrived = Boolean(
            ['Arrived', 'Checked-in'].includes(appointment?.status) ||
            ['Arrived', 'Checked-in'].includes(queue?.status) ||
            (stage && !['Registered', 'Scheduled'].includes(stage)) ||
            appointment?.arrived
        );

        const validStages = getValidQueueTransitions(stage)
            .filter((next) => STAGES.includes(next) && canMoveTo(next));

        const requiresPayment = (next) =>
            ['Prep Pending', 'Ready for Exam', 'In Exam'].includes(next)
            && hasBalance
            && appointment?.priority !== 'Emergency'
            && !hasApprovedPaymentException(invoice?.invoice_id, next);

        const doMove = async (next) => {
            if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لتحديث حالة المريض في الطابور.' : 'Please start your reception shift first.');
                return;
            }
            if (!appointment?.receptionist_id && appointmentId) {
                try {
                    await claimReceptionTask({
                        appointmentId,
                        desk: activeDesk,
                        expectedVersion: appointment?.receptionist_assignment_version
                    }).unwrap();
                } catch (err) {
                    if (err?.data?.code === 'TASK_ALREADY_CLAIMED') {
                        toast.error(err?.data?.message || t('reception.claimFailed', { defaultValue: 'الحالة قيد الاستقبال حالياً بواسطة موظف آخر' }));
                        return;
                    }
                }
            }
            onMove(queueTarget, next);
            setActionMenu(null);
        };

        let primaryAction = null;
        let primaryTargetStage = null;

        const hasNurse = Boolean(
            queue?.nurse_name ||
            queue?.nurse_id ||
            appointment?.nurse_name ||
            appointment?.nurse_id
        );

        if (!caseHasArrived && canManageQueue) {
            primaryTargetStage = 'Arrived';
            primaryAction = {
                label: t('queue.arrived', { defaultValue: 'تسجيل وصول' }),
                onClick: async () => {
                    if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                        toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لتسجيل وصول المرضى.' : 'Please start your reception shift first.');
                        return;
                    }
                    if (!appointment?.receptionist_id && appointment?.appointment_id) {
                        try {
                            await claimReceptionTask({
                                appointmentId: appointment.appointment_id,
                                desk: activeDesk,
                                expectedVersion: appointment.receptionist_assignment_version
                            }).unwrap();
                        } catch (err) {
                            if (err?.status === 409) {
                                toast.error(err?.data?.message || t('reception.conflictArrived', { defaultValue: 'الحالة قيد الاستقبال بواسطة موظف آخر' }));
                                return;
                            }
                        }
                    }
                    onMove(queueTarget, 'Arrived');
                },
                style: 'bg-teal-600 text-white hover:bg-teal-700 shadow-2xs dark:bg-teal-500 dark:hover:bg-teal-400'
            };
        } else if (!invoice && appointment && !['Cancelled', 'Completed'].includes(appointment?.status) && has('CREATE_INVOICES') && caseHasArrived) {
            primaryAction = {
                label: t('table.createInvoice', { defaultValue: 'إنشاء فاتورة' }),
                onClick: () => {
                    if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                        toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لإنشاء الفواتير.' : 'Please start your reception shift first.');
                        return;
                    }
                    createAppointmentInvoice(appointment);
                },
                style: 'bg-slate-900 text-white hover:bg-slate-800 shadow-2xs dark:bg-slate-700 dark:hover:bg-slate-600'
            };
        } else if (stage === 'Arrived' && canManageQueue) {
            const nextStage = hasBalance ? 'Payment Pending' : (hasNurse ? 'Prep Pending' : 'Ready for Exam');
            if (canMoveTo(nextStage)) {
                primaryTargetStage = nextStage;
                const label = hasBalance ? t('queue.sendToCashier', { defaultValue: 'توجيه للخزينة' }) : (hasNurse ? t('queue.prepComplete', { defaultValue: 'تحضير' }) : t('queue.readyForExam', { defaultValue: 'جاهز للفحص' }));
                primaryAction = {
                    label,
                    onClick: () => {
                        if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                            toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لتوجيه الحالة.' : 'Please start your reception shift first.');
                            return;
                        }
                        onMove(queueTarget, nextStage);
                    },
                    style: 'bg-teal-600 text-white hover:bg-teal-700 shadow-2xs dark:bg-teal-500 dark:hover:bg-teal-400'
                };
            }
        } else if (stage === 'Payment Pending' && canManageQueue
            && (!hasBalance || hasApprovedPaymentException(invoice?.invoice_id, partialExceptionTargetStage))) {
            const nextStage = hasNurse ? 'Prep Pending' : 'Ready for Exam';
            primaryTargetStage = nextStage;
            primaryAction = {
                label: hasNurse ? t('queue.prepComplete', { defaultValue: 'تحضير' }) : t('queue.readyForExam', { defaultValue: 'جاهز للفحص' }),
                onClick: () => {
                    if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                        toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لتحديث حالة الطابور.' : 'Please start your reception shift first.');
                        return;
                    }
                    onMove(queueTarget, nextStage);
                },
                style: 'bg-teal-600 text-white hover:bg-teal-700 shadow-2xs dark:bg-teal-500 dark:hover:bg-teal-400'
            };
        } else if (stage === 'Prep Pending' && canManageQueue) {
            primaryTargetStage = 'Ready for Exam';
            primaryAction = {
                label: t('queue.prepComplete', { defaultValue: 'جاهز للفحص' }),
                onClick: () => {
                    if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                        toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لتحديث حالة الطابور.' : 'Please start your reception shift first.');
                        return;
                    }
                    onMove(queueTarget, 'Ready for Exam');
                },
                style: 'bg-cyan-600 text-white hover:bg-cyan-700 shadow-2xs'
            };
        } else if (stage === 'Ready for Exam' && canManageQueue && canMoveTo('In Exam')) {
            primaryTargetStage = 'In Exam';
            primaryAction = {
                label: t('queue.startExam', { defaultValue: 'بدء الفحص' }),
                onClick: () => {
                    if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                        toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لتحديث حالة الطابور.' : 'Please start your reception shift first.');
                        return;
                    }
                    onMove(queueTarget, 'In Exam');
                },
                style: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs'
            };
        } else if (finalDeliveryBlocked && onOpenPayment) {
            primaryAction = {
                label: t('billing.payRemainingBalance', { defaultValue: 'سداد المتبقي' }),
                onClick: () => onOpenPayment(invoice),
                style: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
            };
        } else if (['Finalized', 'Images Ready'].includes(stage) && canDeliverResults && onPickup && examId) {
            primaryTargetStage = stage === 'Images Ready' ? 'Images Delivered' : 'Delivered';
            primaryAction = {
                label: stage === 'Images Ready'
                    ? t('queue.deliverImages', { defaultValue: 'تسليم الصور' })
                    : t('queue.pickup', { defaultValue: 'تسليم التقرير' }),
                onClick: () => {
                    if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                        toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لتسليم التقارير.' : 'Please start your reception shift first.');
                        return;
                    }
                    onPickup(queue || appointment);
                },
                style: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
            };
        } else if (stage === 'Images Delivered'
            && (canManageQueue || user?.role === 'Receptionist')
            && onRequestReport && examId) {
            primaryAction = {
                label: t('queue.requestReport', { defaultValue: 'طلب تجهيز التقرير' }),
                onClick: () => onRequestReport(queue || appointment),
                style: 'bg-violet-600 text-white hover:bg-violet-700 shadow-2xs'
            };
        }

        const otherTransitions = validStages.filter((s) => s !== primaryTargetStage);
        const EDITABLE_STAGES = ['Scheduled', 'Arrived', 'Payment Pending'];
        const canEditBooking = EDITABLE_STAGES.includes(stage) && !['Cancelled', 'Completed'].includes(appointment?.status);
        const assignedReceptionistId = appointment?.receptionist_id || queue?.receptionist_id;
        const isClaimedByMe = Boolean(assignedReceptionistId)
            && String(assignedReceptionistId) === String(currentUserId);
        const isMenuOpen = actionMenu === menuKey;

        return (
            <div className={`flex items-center gap-1.5 flex-nowrap ${align === 'start' ? 'justify-start' : 'justify-end'}`} aria-label={t('table.actions', { defaultValue: 'إجراءات الحالة' })}>
                {/* Primary CTA button */}
                {primaryAction && (
                    <button
                        type="button"
                        onClick={primaryAction.onClick}
                        disabled={isRequestingReport && stage === 'Images Delivered'}
                        aria-label={primaryAction.label}
                        className={`inline-flex h-8 max-w-[125px] shrink-0 items-center justify-center truncate rounded-xl px-2.5 text-xs font-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 ${primaryAction.style}`}
                    >
                        <span className="truncate">{primaryAction.label}</span>
                    </button>
                )}

                {/* Call Patient Broadcast Button */}
                {!['Cancelled', 'Completed', 'Images Delivered', 'Delivered'].includes(stage) && (() => {
                    const isAr = i18n?.language?.startsWith('ar');
                    let targetRoom = activeDesk || appointment?.receptionist_desk || (isAr ? 'الاستقبال' : 'Reception');
                    let targetDesk = activeDesk || appointment?.receptionist_desk || null;

                    if (stage === 'Payment Pending') {
                        targetRoom = isAr ? 'الخزينة' : 'Cashier';
                        targetDesk = 'الخزينة';
                    } else if (stage === 'Prep Pending' || stage === 'In Preparation') {
                        targetRoom = isAr ? 'غرفة التحضير' : 'Preparation Room';
                        targetDesk = 'غرفة التحضير';
                    } else if (['Ready for Exam', 'In Exam'].includes(stage)) {
                        targetRoom = appointment?.room_name || queue?.room_name || appointment?.room_number || (isAr ? 'غرفة الفحص' : 'Exam Suite');
                        targetDesk = appointment?.room_name || queue?.room_name || null;
                    } else if (stage === 'Finalized' || stage === 'Reporting') {
                        targetRoom = isAr ? 'مكتب تسليم التقارير' : 'Results Pickup';
                        targetDesk = 'مكتب تسليم التقارير';
                    }

                    return (
                        <button
                            type="button"
                            onClick={async () => {
                                if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                                    toast.error(isAr
                                        ? 'يجب بدء وردية الاستقبال أولاً لنداء المرضى على شاشات الصالة.'
                                        : 'Please start your reception shift first.');
                                    return;
                                }
                                const token = appointment?.order_number || queue?.order_number || '---';
                                const patName = appointment?.patient_name || queue?.patient_name || '';
                                try {
                                    await broadcastPatientCall({
                                        orderNumber: token,
                                        patientName: patName,
                                        queueNumber: queue?.queue_number || appointment?.queue_number || null,
                                        roomName: targetRoom,
                                        deskIdentifier: targetDesk,
                                        modalityId: appointment?.modality_id || queue?.modality_id || null,
                                        callByName: Boolean(patName),
                                    }).unwrap();
                                    playHospitalChime();
            toast.success(isAr
                                        ? `🔔 تم نداء المريض ${patName || token} للتوجه إلى: ${targetRoom}`
                                        : `🔔 Patient ${patName || token} called to: ${targetRoom}`
                                    );
                                } catch (error) {
            toast.error(isAr ? '\u062a\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0646\u062f\u0627\u0621. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.' : (error?.data?.message || 'Could not send the patient call. Please try again.'));
        }
                            }}
                            title={isAr ? `نداء المريض للتوجه إلى: ${targetRoom}` : `Call patient to: ${targetRoom}`}
                            aria-label={isAr ? `نداء المريض إلى ${targetRoom}` : `Call patient to ${targetRoom}`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 transition active:scale-95 shadow-2xs"
                        >
                            <Bell size={13} />
                        </button>
                    );
                })()}

                {/* View Details button */}
                {onSelectCase && (
                    <button
                        type="button"
                        onClick={() => onSelectCase(row)}
                        title={t('table.viewDetails', { defaultValue: 'عرض التفاصيل' })}
                        aria-label={t('table.viewDetails', { defaultValue: 'عرض التفاصيل' })}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-teal-600 dark:hover:bg-slate-700"
                    >
                        <Eye size={13} />
                    </button>
                )}

                {/* Unified More Options Menu (...) */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setActionMenu(isMenuOpen ? null : menuKey)}
                        title={t('queue.moreOptions', { defaultValue: 'خيارات إضافية' })}
                        aria-label={t('queue.moreOptions', { defaultValue: 'خيارات إضافية' })}
                        aria-expanded={isMenuOpen}
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-2xs transition ${isMenuOpen
                            ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-600 dark:bg-slate-800 dark:text-teal-300'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white'
                            }`}
                    >
                        <MoreHorizontal size={14} />
                    </button>

                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setActionMenu(null)} />
                            <div className={`absolute ${align === 'start' ? 'start-0' : 'end-0'} z-50 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-100 ${isCardView || isLastRow ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
                                {/* Option: Edit Booking */}
                                {onSelectCase && canEditBooking && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelectCase(row, { editMode: true });
                                            setActionMenu(null);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 transition"
                                    >
                                        <Edit3 size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                        <span>{t('details.editBooking', { defaultValue: 'تعديل بيانات الحجز' })}</span>
                                    </button>
                                )}

                                {/* Option: Request/Retry Partial Exception */}
                                {canRequestPartialException && !existingPaymentException && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            requestException();
                                            setActionMenu(null);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40 transition"
                                    >
                                        <Clock3 size={13} className="text-amber-600 shrink-0" />
                                        <span>{t('billing.requestException', { defaultValue: 'طلب استثناء' })}</span>
                                    </button>
                                )}
                                {canRetryPartialException && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            requestException();
                                            setActionMenu(null);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40 transition"
                                    >
                                        <RotateCcw size={13} className="text-amber-600 shrink-0" />
                                        <span>{t('billing.retryException', { defaultValue: 'إعادة طلب الاستثناء' })}</span>
                                    </button>
                                )}

                                {/* Option: Collect Payment */}
                                {hasBalance && onOpenPayment && !finalDeliveryBlocked && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onOpenPayment(invoice);
                                            setActionMenu(null);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40 transition"
                                    >
                                        <CreditCard size={13} className="text-emerald-600 shrink-0" />
                                        <span>{t('billing.collectPayment', { defaultValue: 'تحصيل دفعة مالية' })}</span>
                                    </button>
                                )}

                                {/* Option: Create Invoice */}
                                {!invoice && appointment && !['Cancelled', 'Completed'].includes(appointment?.status) && has('CREATE_INVOICES') && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (user?.role === 'Receptionist' && !hasActiveReceptionShift) {
                                                toast.error(isRtl ? 'يجب بدء وردية الاستقبال أولاً لإنشاء الفواتير.' : 'Please start your reception shift first.');
                                                return;
                                            }
                                            createAppointmentInvoice(appointment);
                                            setActionMenu(null);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                                    >
                                        <FileText size={13} className="text-slate-600 shrink-0" />
                                        <span>{t('table.createInvoice', { defaultValue: 'إنشاء فاتورة' })}</span>
                                    </button>
                                )}

                                {/* Print Section */}
                                {(has('PRINT_LABELS') || has('PRINT_RECEIPTS')) && (
                                    <>
                                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                        <p className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                            {t('queue.documents', { defaultValue: 'الطباعة والمستندات' })}
                                        </p>
                                        {has('PRINT_LABELS') && (
                                            <button
                                                type="button"
                                                onClick={() => print(row, 'sticker')}
                                                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                                            >
                                                <Tag size={13} className="text-teal-600 shrink-0" />
                                                <span>{t('queue.sticker', { defaultValue: 'ملصق العينة' })}</span>
                                            </button>
                                        )}
                                        {has('PRINT_RECEIPTS') && (
                                            <button
                                                type="button"
                                                onClick={() => print(row, 'slip')}
                                                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                                            >
                                                <ClipboardList size={13} className="text-emerald-600 shrink-0" />
                                                <span>{t('queue.bookingSlip', { defaultValue: 'شيت الفحص' })}</span>
                                            </button>
                                        )}
                                        {has('PRINT_RECEIPTS') && invoice && (
                                            <button
                                                type="button"
                                                onClick={() => print(row, 'receipt')}
                                                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                                            >
                                                <FileText size={13} className="text-cyan-600 shrink-0" />
                                                <span>{t('queue.receipt', { defaultValue: 'إيصال السداد' })}</span>
                                            </button>
                                        )}
                                    </>
                                )}

                                {/* Secondary Transitions Section */}
                                {otherTransitions.length > 0 && canManageQueue && (
                                    <>
                                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                        <p className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                            {t('queue.otherOptions', { defaultValue: 'نقل إلى مرحلة أخرى' })}
                                        </p>
                                        <div className="space-y-0.5">
                                            {otherTransitions.map((next) => {
                                                const blocked = requiresPayment(next);
                                                const cfg = STAGE_TRANSITION_CONFIG[next];
                                                const ListIcon = cfg?.icon ?? ChevronRight;
                                                const isCancelOpt = next === 'Cancelled';
                                                return (
                                                    <button
                                                        key={next}
                                                        type="button"
                                                        disabled={blocked}
                                                        title={blocked ? t('billing.paymentOrExceptionRequired', { defaultValue: 'يلزم سداد المتبقي أولاً.' }) : undefined}
                                                        onClick={() => !blocked && doMove(next)}
                                                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-start text-xs font-bold transition ${blocked
                                                            ? 'cursor-not-allowed text-amber-700 opacity-60 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30'
                                                            : isCancelOpt
                                                                ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30'
                                                                : 'text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-300 dark:hover:bg-slate-800'
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg ${isCancelOpt ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/40' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                                <ListIcon size={11} />
                                                            </span>
                                                            <span className="truncate">{stageLabel(next)}</span>
                                                        </div>
                                                        {blocked && (
                                                            <span className="shrink-0 text-[9px] font-black text-amber-500">
                                                                {isRtl ? 'سداد' : 'Pay first'}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {stage === 'Reporting' && onDeferReport && (
                                    <>
                                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onDeferReport(appointment || queue);
                                                setActionMenu(null);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40 transition"
                                        >
                                            <ScanLine size={13} className="shrink-0 text-cyan-600" />
                                            <span>{isRtl ? 'تحويل لاستلام أفلام فقط (إرجاء التقرير)' : 'Deliver images only (defer report)'}</span>
                                        </button>
                                    </>
                                )}

                                {/* Task Release Option */}
                                {isClaimedByMe && (
                                    <>
                                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                handleReleaseTask(appointment || queue, e);
                                                setActionMenu(null);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition"
                                        >
                                            <Unlock size={13} className="shrink-0 text-rose-500" />
                                            <span>{t('reception.releaseTask', { defaultValue: 'تحرير الحالة من شباكي' })}</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {!canManageQueue && !canDeliverResults && (
                    <LockKeyhole size={13} className="text-slate-400/70 shrink-0" title={t('queue.readOnly', { defaultValue: 'للقراءة فقط' })} />
                )}
            </div>
        );
    };

    const SortableHeader = ({ field, label, width, className = '' }) => {
        const isCurrent = sortField === field;
        const isCenter = className.includes('text-center');
        return (
            <th className={`${width} px-3 py-3 text-start ${className}`}>
                <button
                    type="button"
                    onClick={() => handleSort(field)}
                    className={`group inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition hover:text-slate-900 focus-visible:outline-none dark:text-slate-400 dark:hover:text-white ${isCenter ? 'mx-auto' : ''}`}
                >
                    <span>{label}</span>
                    {isCurrent ? (
                        sortDirection === 'asc' ? (
                            <ArrowUp size={12} className="text-teal-600 dark:text-teal-400 shrink-0" />
                        ) : (
                            <ArrowDown size={12} className="text-teal-600 dark:text-teal-400 shrink-0" />
                        )
                    ) : (
                        <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100 shrink-0" />
                    )}
                </button>
            </th>
        );
    };

    return (
        <section
            className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#070e1a]"
            aria-labelledby="daily-operations-title"
        >
            {/* Header Toolbar */}
            <header className="rounded-t-2xl border-b border-slate-200 bg-white px-3 pb-0 pt-3.5 sm:px-4 sm:pt-4 dark:border-slate-800 dark:bg-[#070e1a]">
                <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 ring-1 ring-teal-500/20 dark:text-teal-300 dark:ring-teal-500/25">
                                <Clock3 size={19} />
                            </span>
                            <div>
                                <h2 id="daily-operations-title" className="text-sm font-black text-slate-900 dark:text-white">
                                    {t('command.dailyView', { defaultValue: 'العمليات اليومية' })}
                                </h2>
                                <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {t('queue.unifiedSummary', {
                                        count: filteredAndSorted.length,
                                        defaultValue: `${filteredAndSorted.length} موعد وحالة نشطة في مساحة عمل واحدة`,
                                    })}
                                </p>
                            </div>
                        </div>

                        {/* Waitlist Toggle Button for Mobile / Header shortcut */}
                        {onToggleWaitlist && (
                            <button
                                type="button"
                                onClick={onToggleWaitlist}
                                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition xl:hidden ${isWaitlistOpen
                                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                            >
                                <Users size={13} />
                                <span>{t('waitlist.title', { defaultValue: 'قائمة الانتظار' })}</span>
                                {waitlistCount > 0 && (
                                    <span className="rounded-md bg-teal-600 px-1.5 py-0.2 text-[10px] font-black text-white">
                                        {waitlistCount}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Filter controls row */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Search input */}
                        <label className="relative min-w-[min(100%,220px)] flex-1 sm:min-w-[250px] sm:max-w-[420px]">
                            <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <span className="sr-only">{t('queue.search', { defaultValue: 'بحث' })}</span>
                            <input
                                ref={searchInputRef}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t('queue.searchPlaceholder', { defaultValue: 'ابحث عن المريض أو الرقم الطبي أو الفحص...' })}
                                aria-keyshortcuts="/"
                                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 ps-8 pe-14 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-[#0b1426] dark:text-slate-100 dark:placeholder:text-slate-500"
                            />
                            {!searchTerm && (
                                <kbd className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-black text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">/</kbd>
                            )}
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </label>

                        {/* Advanced filters stay one click away so the main toolbar remains fast. */}
                        <button
                            type="button"
                            onClick={() => setShowAdvancedFilters((prev) => !prev)}
                            aria-expanded={showAdvancedFilters}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-black transition ${showAdvancedFilters || priorityFilter !== 'all' || modalityFilter !== 'all'
                                ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800/80 dark:bg-[#072424] dark:text-teal-200'
                                : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-[#0b1426] dark:text-slate-300 dark:hover:text-white'
                            }`}
                        >
                            <SlidersHorizontal size={12} />
                            <span>{t('filters.more', { defaultValue: 'فلاتر' })}</span>
                            {(priorityFilter !== 'all' || modalityFilter !== 'all') && (
                                <span className="grid min-w-5 place-items-center rounded-full bg-teal-600 px-1.5 py-0.5 text-[9px] text-white">
                                    {Number(priorityFilter !== 'all') + Number(modalityFilter !== 'all')}
                                </span>
                            )}
                            <ChevronDown size={11} className={`transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
                        </button>

                        {/* View Switcher: Table vs Cards */}
                        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-[#0b1426]">
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('table')}
                                title={t('filters.viewModeTable', { defaultValue: 'جدول تفصيلي' })}
                                className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${viewMode === 'table'
                                    ? 'bg-white text-teal-700 shadow-2xs dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                    }`}
                            >
                                <List size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('cards')}
                                title={t('filters.viewModeCards', { defaultValue: 'بطاقات سريعة' })}
                                className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${viewMode === 'cards'
                                    ? 'bg-white text-teal-700 shadow-2xs dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                    }`}
                            >
                                <LayoutGrid size={14} />
                            </button>
                        </div>

                        {/* Reset Filters Shortcut Button */}
                        {isFiltered && (
                            <button
                                type="button"
                                onClick={handleResetFilters}
                                title={t('filters.reset', { defaultValue: 'إلغاء كافة التصفيات' })}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 transition shadow-2xs"
                            >
                                <RotateCcw size={12} />
                                <span>{t('filters.reset', { defaultValue: 'إلغاء التصفيات' })}</span>
                            </button>
                        )}

                        {/* Waitlist Toggle Button for Desktop */}
                        {onToggleWaitlist && (
                            <button
                                type="button"
                                onClick={onToggleWaitlist}
                                className={`hidden xl:inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition shadow-2xs ${isWaitlistOpen
                                    ? 'border-teal-500/80 bg-teal-50 text-teal-800 ring-1 ring-teal-500/20 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                            >
                                <Users size={13} className="text-teal-600 dark:text-teal-400" />
                                <span>{isWaitlistOpen ? t('waitlist.hide', { defaultValue: 'إخفاء الانتظار' }) : t('waitlist.show', { defaultValue: 'قائمة الانتظار' })}</span>
                                {waitlistCount > 0 && (
                                    <span className="rounded-md bg-teal-600 px-1.5 py-0.2 text-[10px] font-black text-white">
                                        {waitlistCount}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>
                </div>


                {showAdvancedFilters && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-[#091222]">
                        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            {t('filters.more', { defaultValue: 'فلاتر إضافية' })}
                        </span>
                        {availableModalities.length > 0 && (
                            <select
                                value={modalityFilter}
                                onChange={(e) => setModalityFilter(e.target.value)}
                                aria-label={t('filters.modality', { defaultValue: 'الجهاز / القسم' })}
                                className="h-8 min-w-[150px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-[#070e1a] dark:text-slate-100"
                            >
                                <option value="all">{t('filters.allModalities', { defaultValue: 'جميع الأجهزة' })}</option>
                                {availableModalities.map((mod) => (
                                    <option key={mod} value={mod}>{mod}</option>
                                ))}
                            </select>
                        )}
                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            aria-label={t('cashier.priorityFilter', { defaultValue: 'الأولوية' })}
                            className="h-8 min-w-[130px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-[#070e1a] dark:text-slate-100"
                        >
                            <option value="all">{t('filters.allPriorities', { defaultValue: 'كل الأولويات' })}</option>
                            <option value="Emergency">{t('priority.Emergency', { defaultValue: 'طارئ' })}</option>
                            <option value="Urgent">{t('priority.Urgent', { defaultValue: 'عاجل' })}</option>
                            <option value="Routine">{t('priority.Routine', { defaultValue: 'روتيني' })}</option>
                        </select>
                        {(priorityFilter !== 'all' || modalityFilter !== 'all') && (
                            <button
                                type="button"
                                onClick={() => {
                                    setPriorityFilter('all');
                                    setModalityFilter('all');
                                }}
                                className="inline-flex h-8 items-center gap-1 rounded-xl px-2.5 text-[10.5px] font-black text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                                <RotateCcw size={11} />
                                {t('filters.reset', { defaultValue: 'مسح' })}
                            </button>
                        )}
                    </div>
                )}

                {/* Filter Chips */}
                <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-3 scrollbar-none touch-pan-x snap-x">
                    <FilterChip
                        label={t('filters.all', { defaultValue: 'الكل' })}
                        count={filterCounts.all}
                        active={stageFilter === 'all'}
                        onClick={() => setStageFilter('all')}
                    />
                    {[
                        { key: 'Scheduled', dotColor: 'bg-slate-500', labelKey: 'queue.stages.Scheduled', def: 'مجدول' },
                        { key: 'Arrived', dotColor: 'bg-teal-500', labelKey: 'queue.stages.Arrived', def: 'وصل للمركز' },
                        { key: 'Payment Pending', dotColor: 'bg-amber-500', labelKey: 'queue.stages.Payment Pending', def: 'انتظار الدفع' },
                        { key: 'Prep Pending', dotColor: 'bg-orange-400', labelKey: 'queue.stages.Prep Pending', def: 'انتظار التحضير' },
                        { key: 'Ready for Exam', dotColor: 'bg-cyan-500', labelKey: 'queue.stages.Ready for Exam', def: 'جاهز للفحص' },
                        { key: 'In Exam', dotColor: 'bg-indigo-500', labelKey: 'queue.stages.In Exam', def: 'داخل غرفة الفحص' },
                        { key: 'Images Ready', dotColor: 'bg-emerald-500', labelKey: 'queue.stages.Images Ready', def: 'الصور جاهزة للاستلام' },
                        { key: 'Images Delivered', dotColor: 'bg-slate-500', labelKey: 'queue.stages.Images Delivered', def: 'تم تسليم الصور' },
                        { key: 'Completed', dotColor: 'bg-emerald-500', labelKey: 'queue.stages.Completed', def: 'الفحص منتهٍ' },
                        { key: 'Reporting', dotColor: 'bg-violet-500', labelKey: 'queue.stages.Reporting', def: 'بانتظار كتابة التقرير' },
                        { key: 'Finalized', dotColor: 'bg-emerald-500', labelKey: 'queue.stages.Finalized', def: 'تقرير معتمد' },
                    ].filter(({ key }) => filterCounts[key] > 0 || stageFilter === key).map(({ key, dotColor, labelKey, def }) => (
                        <FilterChip
                            key={key}
                            label={t(labelKey, { defaultValue: def })}
                            count={filterCounts[key]}
                            active={stageFilter === key}
                            onClick={() => setStageFilter(stageFilter === key ? 'all' : key)}
                            dotColor={dotColor}
                        />
                    ))}
                    {filterCounts.overdue > 0 && (
                        <FilterChip
                            label={t('focus.overdue', { defaultValue: 'متأخر' })}
                            count={filterCounts.overdue}
                            active={stageFilter === 'overdue'}
                            onClick={() => setStageFilter(stageFilter === 'overdue' ? 'all' : 'overdue')}
                            tone="rose"
                        />
                    )}
                    {filterCounts.urgent > 0 && (
                        <FilterChip
                            label={t('focus.urgent', { defaultValue: 'طارئ / عاجل' })}
                            count={filterCounts.urgent}
                            active={stageFilter === 'urgent'}
                            onClick={() => setStageFilter(stageFilter === 'urgent' ? 'all' : 'urgent')}
                            tone="amber"
                        />
                    )}
                </div>
            </header>

            {/* Cards View (Mobile & Grid View) */}
            {(viewMode === 'cards') ? (
                <div className="p-4 sm:p-5">
                    {appLoading ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                            ))}
                        </div>
                    ) : paginatedRows.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
                            {paginatedRows.map((row) => {
                                const { appointment, queue, invoice } = row;
                                const examId = queue?.exam_id || appointment?.exam_id;
                                const appointmentId = appointment?.appointment_id || queue?.appointment_id;
                                const patient = appointment?.patient_name || queue?.patient_name || t('table.patientFallback');
                                const isOverdue = queue?.is_overdue;
                                const exam = appointment?.exam_type_name || queue?.exam_type_name || queue?.modality_name || '-';
                                const machine = appointment?.machine_name || queue?.machine_name || queue?.modality_name || '';

                                const prio = appointment?.priority || queue?.priority || 'Routine';
                                const cardBorderClass = isOverdue
                                    ? 'border-2 border-rose-300 border-s-[6px] border-s-rose-600 bg-rose-50/40 dark:border-rose-900/80 dark:border-s-rose-500 dark:bg-[#1a080c]'
                                    : prio === 'Emergency'
                                        ? 'border-2 border-rose-300 border-s-[6px] border-s-rose-500 bg-white hover:border-rose-400 dark:border-slate-800 dark:border-s-rose-500 dark:bg-[#0b1426]'
                                        : prio === 'Urgent'
                                            ? 'border-2 border-amber-300 border-s-[6px] border-s-amber-500 bg-white hover:border-amber-400 dark:border-slate-800 dark:border-s-amber-500 dark:bg-[#0b1426]'
                                            : 'border-2 border-slate-200 border-s-[6px] border-s-teal-500 bg-white hover:border-teal-400 dark:border-slate-800 dark:border-s-teal-500 dark:bg-[#0b1426]';

                                const isCardMenuOpen = actionMenu === (examId || appointmentId);

                                return (
                                    <article
                                        key={examId || appointmentId}
                                        className={`group relative flex flex-col justify-between rounded-2xl p-4 shadow-2xs transition-all hover:shadow-md ${cardBorderClass} ${isCardMenuOpen ? 'z-30' : 'z-0'}`}
                                    >
                                        <div>
                                            {/* Header */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectCase && onSelectCase(row)}
                                                        className="text-start font-black text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-300 text-sm"
                                                    >
                                                        {patient}
                                                    </button>
                                                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                                                        <span>{appointment?.mrn || queue?.mrn || '-'}</span>
                                                        <span>·</span>
                                                        <span>{formatTime(appointment?.start_time)}</span>
                                                    </div>
                                                </div>
                                                <PriorityBadge priority={appointment?.priority || queue?.priority} />
                                            </div>

                                            {/* Exam & Room Info */}
                                            <div className="mt-2.5 space-y-1.5">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                        {exam}
                                                    </p>
                                                    {(appointment?.contrast_required || queue?.contrast_required || invoice?.contrast_required) && (
                                                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[8.5px] font-black text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                            <AlertTriangle size={8} />
                                                            {isRtl ? 'صبغة' : '+C'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {machine && (
                                                        <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                            {machine}
                                                        </span>
                                                    )}
                                                    {(appointment?.room_number || queue?.room_number) && (
                                                        <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[9.5px] font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                                                            <DoorOpen size={10} />
                                                            <span>{appointment?.room_number || queue?.room_number}</span>
                                                        </span>
                                                    )}
                                                    {appointment?.machine_status && appointment.machine_status !== 'Active' && (
                                                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" title={appointment.machine_status}>
                                                            <AlertTriangle size={10} />
                                                            <span>{appointment.machine_status === 'Under Maintenance' ? 'قيد الصيانة' : 'معطل'}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Status & Financial & Wait */}
                                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                                                <div className="flex items-center gap-2">
                                                    {canViewInvoices && renderFinancialStatus(invoice, row)}
                                                    {renderWait(queue)}
                                                </div>
                                                {renderStatus(row)}
                                            </div>
                                        </div>

                                        {/* Actions footer */}
                                        <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                                            {renderActions(row, 'start', true, true)}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                            <EmptyState
                                icon={CheckCircle2}
                                title={t('queue.empty', { defaultValue: 'لا توجد عمليات' })}
                                subtitle={isFiltered ? t('queue.emptyFiltered', { defaultValue: 'لا توجد حالات تطابق خيارات التصفية أو البحث الحالية.' }) : t('empty.noAppointments')}
                            />
                            {isFiltered && (
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 transition"
                                >
                                    <RotateCcw size={12} />
                                    <span>{t('filters.reset', { defaultValue: 'إلغاء كافة التصفيات' })}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                /* Desktop Dense Table View with Distinct Grid Borders */
                <div className="min-h-[340px] overflow-x-auto border-t border-slate-200 pb-16 dark:border-slate-800 sm:pb-20">
                    <table className="w-full min-w-[1040px] border-collapse text-start text-xs 2xl:min-w-[1120px]">
                        <thead className="sticky top-0 z-10">
                            <tr className="border-b-2 border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-[#091222]">
                                <SortableHeader field="time" label={t('table.time')} width="w-[85px] min-w-[85px]" className="ps-4 border-e border-slate-200/80 dark:border-slate-800" />
                                <SortableHeader field="patient" label={t('table.patient')} width="min-w-[170px]" className="border-e border-slate-200/80 dark:border-slate-800" />
                                <SortableHeader field="exam" label={t('table.machineExam')} width="min-w-[190px]" className="border-e border-slate-200/80 dark:border-slate-800" />
                                <SortableHeader field="stage" label={t('table.stage', { defaultValue: 'الحالة / الأولوية' })} width="w-[155px] min-w-[145px]" className="border-e border-slate-200/80 dark:border-slate-800" />
                                {canViewInvoices && <th className="w-[145px] min-w-[135px] border-e border-slate-200/80 px-3 py-3 text-start text-[10.5px] font-black uppercase tracking-wider text-slate-700 dark:border-slate-800 dark:text-slate-300">
                                    {t('table.financialStatus', { defaultValue: 'الموقف المالي' })}
                                </th>}
                                <SortableHeader field="wait" label={t('queue.columns.wait', { defaultValue: 'الانتظار' })} width="w-[95px] min-w-[95px]" className="border-e border-slate-200/80 dark:border-slate-800 text-center" />
                                <th className="w-[220px] min-w-[210px] px-3 py-3 pe-4 text-end text-[10.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    {t('table.actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {appLoading ? (
                                <tr>
                                    <td colSpan={canViewInvoices ? 7 : 6} className="p-6">
                                        <div className="space-y-2">
                                            {Array.from({ length: 6 }).map((_, i) => (
                                                <div key={i} className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedRows.length > 0 ? (
                                paginatedRows.map((row, index) => {
                                    const { appointment, queue, invoice } = row;
                                    const examId = queue?.exam_id || appointment?.exam_id;
                                    const patient = appointment?.patient_name || queue?.patient_name || t('table.patientFallback');
                                    const appointmentId = appointment?.appointment_id || queue?.appointment_id;
                                    const isOverdue = queue?.is_overdue;
                                    const prio = appointment?.priority || queue?.priority || 'Routine';
                                    const exam = appointment?.exam_type_name || queue?.exam_type_name || queue?.modality_name || '-';
                                    const machine = appointment?.machine_name || queue?.machine_name || queue?.modality_name || '';
                                    const isLastRow = paginatedRows.length > 2 && index >= paginatedRows.length - 2;

                                    const rowBorderAccent = isOverdue
                                        ? 'border-s-[5px] border-s-rose-600 bg-rose-50/50 hover:bg-rose-50/80 dark:bg-[#200a0e] dark:hover:bg-[#2a0e14]'
                                        : prio === 'Emergency'
                                            ? 'border-s-[5px] border-s-rose-500 bg-rose-50/25 hover:bg-rose-50/50 dark:bg-[#1f0b10] dark:hover:bg-[#280f15]'
                                            : prio === 'Urgent'
                                                ? 'border-s-[5px] border-s-amber-500 bg-amber-50/25 hover:bg-amber-50/50 dark:bg-[#1f1508] dark:hover:bg-[#281c0b]'
                                                : 'border-s-[5px] border-s-slate-200 hover:border-s-teal-500 hover:bg-teal-50/50 dark:border-s-slate-800 dark:hover:border-s-teal-400 dark:hover:bg-[#0b1c24]';

                                    return (
                                        <tr
                                            key={examId || appointmentId}
                                            className={`group border-b border-slate-200 transition-colors even:bg-slate-50 dark:border-slate-800 dark:bg-[#070e1a] dark:even:bg-[#0b1426] ${rowBorderAccent}`}
                                        >
                                            {/* Time */}
                                            <td className="w-[85px] min-w-[85px] border-e border-slate-200/60 px-3 py-2.5 ps-4 dark:border-slate-800/60 whitespace-nowrap">
                                                <span className="font-mono text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">
                                                    {formatTime(appointment?.start_time)}
                                                </span>
                                            </td>

                                            {/* Patient */}
                                            <td className="min-w-[170px] border-e border-slate-200/60 px-3 py-2.5 dark:border-slate-800/60">
                                                <div className="flex flex-col">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => onSelectCase && onSelectCase(row)}
                                                            className="text-start font-black text-slate-900 transition hover:text-teal-700 dark:text-white dark:hover:text-teal-300"
                                                        >
                                                            {patient}
                                                        </button>
                                                        <PriorityBadge priority={appointment?.priority || queue?.priority} />
                                                    </div>
                                                    <span className="mt-0.5 font-mono text-[10.5px] font-bold text-slate-400 ltr-embed">
                                                        {appointment?.mrn || queue?.mrn || '-'}
                                                    </span>
                                                    {(() => {
                                                        const receptionistBadge = getReceptionAssignment(appointment, queue);
                                                        if (!receptionistBadge.name) return null;

                                                        return (
                                                            <div className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-black text-teal-800 shadow-xs dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                                                                <User size={9} className="shrink-0" />
                                                                <span>{t('reception.receptionist', { defaultValue: 'موظف الاستقبال' })}:</span>
                                                                <span>{String(receptionistBadge.id) === String(currentUserId) ? t('reception.myDesk', { defaultValue: 'مكتبي' }) : receptionistBadge.name}</span>
                                                                {receptionistBadge.desk && (
                                                                    <span className="rounded-full bg-white/80 px-1 py-px text-[8px] font-black text-teal-700 dark:bg-slate-900/70 dark:text-teal-300">
                                                                        {receptionistBadge.desk}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>

                                            {/* Exam & Modality & Room */}
                                            <td className="min-w-[200px] border-e border-slate-200/60 px-3 py-2.5 dark:border-slate-800/60">
                                                <div className="space-y-1">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                                                            {exam}
                                                        </span>
                                                        {(appointment?.contrast_required || queue?.contrast_required || invoice?.contrast_required) && (
                                                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.2 text-[8.5px] font-black text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                                <AlertTriangle size={8} />
                                                                {isRtl ? 'صبغة' : '+C'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        {machine && (
                                                            <span className="inline-block rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                                {machine}
                                                            </span>
                                                        )}
                                                        {(appointment?.room_number || queue?.room_number) && (
                                                            <span className="inline-flex items-center gap-0.5 rounded bg-teal-50 border border-teal-200 px-1.5 py-0.2 text-[9.5px] font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                                                                <DoorOpen size={9} />
                                                                <span>{appointment?.room_number || queue?.room_number}</span>
                                                            </span>
                                                        )}
                                                        {appointment?.machine_status && appointment.machine_status !== 'Active' && (
                                                            <span className="inline-flex items-center gap-0.5 rounded bg-rose-50 border border-rose-200 px-1.5 py-0.2 text-[9px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" title={appointment.machine_status}>
                                                                <AlertTriangle size={9} />
                                                                <span>{appointment.machine_status === 'Under Maintenance' ? 'صيانة' : 'معطل'}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Stage & Next Progression */}
                                            <td className="w-[140px] min-w-[130px] border-e border-slate-200/60 px-3 py-2.5 dark:border-slate-800/60">
                                                {renderStatus(row)}
                                            </td>

                                            {/* Financial Status */}
                                            {canViewInvoices && <td className="w-[145px] min-w-[135px] border-e border-slate-200/60 px-3 py-2.5 dark:border-slate-800/60">
                                                {renderFinancialStatus(invoice, row)}
                                            </td>}

                                            {/* Wait Duration */}
                                            <td className="w-[95px] min-w-[95px] border-e border-slate-200/60 px-3 py-2.5 dark:border-slate-800/60 text-center whitespace-nowrap">
                                                {renderWait(queue)}
                                            </td>

                                            {/* Actions */}
                                            <td className="relative w-[220px] min-w-[210px] overflow-visible px-3 py-2.5 pe-4 text-end">
                                                {renderActions(row, 'end', isLastRow, false)}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={canViewInvoices ? 7 : 6} className="p-8 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <EmptyState
                                                icon={CheckCircle2}
                                                title={t('queue.empty', { defaultValue: 'لا توجد عمليات' })}
                                                subtitle={isFiltered ? t('queue.emptyFiltered', { defaultValue: 'لا توجد حالات تطابق خيارات التصفية أو البحث الحالية.' }) : t('empty.noAppointments')}
                                            />
                                            {isFiltered && (
                                                <button
                                                    type="button"
                                                    onClick={handleResetFilters}
                                                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 transition"
                                                >
                                                    <RotateCcw size={12} />
                                                    <span>{t('filters.reset', { defaultValue: 'إلغاء كافة التصفيات' })}</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination footer */}
            {filteredAndSorted.length > 0 && (
                <footer className="rounded-b-2xl flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-[#070e1a]">
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                            {t('pagination.showing', {
                                from: paginationState.startIndex + 1,
                                to: paginationState.endIndex,
                                total: filteredAndSorted.length,
                                defaultValue: `${paginationState.startIndex + 1}–${paginationState.endIndex} من ${filteredAndSorted.length}`,
                            })}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px]">{t('pagination.perPage', { defaultValue: 'صفوف:' })}</span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                aria-label={t('pagination.selectPageSize', { defaultValue: 'صفوف لكل صفحة' })}
                            >
                                {PAGE_SIZE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <Pagination
                        currentPage={paginationState.currentPage}
                        pageCount={paginationState.pageCount}
                        onPageChange={setCurrentPage}
                        isRtl={isRtl}
                    />
                </footer>
            )}
        </section>
    );
};

const FilterChip = memo(({ active, count = 0, dotColor, label, onClick, tone = 'default' }) => {
    const base = 'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-bold transition-all focus-visible:outline-none';
    const styleMap = {
        default: active
            ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-white'
            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-[#070e1a]',
        rose: active
            ? 'bg-rose-600 text-white shadow-xs'
            : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-[#200a0e] dark:text-rose-300',
        amber: active
            ? 'bg-amber-500 text-white shadow-xs'
            : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-[#281c0b] dark:text-amber-300',
    };
    const styles = styleMap[tone] || styleMap.default;

    return (
        <button type="button" onClick={onClick} className={`${base} ${styles}`}>
            {dotColor && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
            <span>{label}</span>
            {count > 0 && (
                <span className={`rounded px-1 py-px text-[9px] font-black tabular-nums ${active
                    ? 'bg-white/25 text-white'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                    {count}
                </span>
            )}
        </button>
    );
});
FilterChip.displayName = 'FilterChip';

export default DailyOperationsTable;
