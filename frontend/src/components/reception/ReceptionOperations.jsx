import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../../store/authSlice';
import {
    api,
    useGetCenterSettingsQuery,
    useGetInvoiceQuery,
    useGetPartialPaymentExceptionsQuery,
    useGetStockMovementsQuery,
    useRequestPartialPaymentExceptionMutation,
    useGetRoomsQuery,
    useGetMachinesQuery,
    useHeartbeatReceptionTasksMutation,
    useGetCurrentReceptionShiftQuery,
    useOpenReceptionShiftMutation,
    useCloseReceptionShiftMutation
} from '../../store/api';
import {
    Building2,
    CalendarCheck2,
    CalendarDays,
    CalendarPlus,
    CircleDollarSign,
    MonitorPlay,
    RefreshCw,
    UserPlus,
    UsersRound,
    WalletCards,
    Wifi,
    Sparkles,
    CheckCircle2,
    Clock,
    Activity,
    AlertTriangle,
    CreditCard,
    ArrowLeft,
    ArrowRight,
    Users,
    Filter,
    Search,
    ChevronLeft,
    ChevronRight,
    ShieldCheck
} from 'lucide-react';

import { useReceptionPermissions } from '../../hooks/useReceptionPermissions';
import { useReceptionData } from '../../hooks/useReceptionData';
import { usePaymentFlow } from '../../hooks/usePaymentFlow';
import { useShiftFlow } from '../../hooks/useShiftFlow';
import { usePatientRegistration } from '../../hooks/usePatientRegistration';
import { buildReceptionTabs, shiftLocalDateInput, toLocalDateInput } from './receptionLogic';
import ReceptionTabNav from './ReceptionTabNav';
import ScheduleView from './ScheduleView';
import PatientDirectory from './PatientDirectory';
import CashierQueueTab from './CashierQueueTab';
import BillingTab from './BillingTab';
import ShiftActionModal from './ShiftActionModal';
import PaymentCollectionModal from './PaymentCollectionModal';
import PatientRegistrationModal from './PatientRegistrationModal';
import ReceptionWorkstationBar from './ReceptionWorkstationBar';
import PublicQueueDisplayModal from './PublicQueueDisplayModal';
import TextPromptDialog from '../ui/TextPromptDialog';
import PageHeader from '../ui/PageHeader';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { readWorkstationPresets } from './workstationPresets';

const TAB_ICONS = {
    schedule: CalendarCheck2,
    patients: UsersRound,
    cashier: CircleDollarSign,
    billing: WalletCards,
};

const DEFAULT_RECEPTION_DESK = 'شباك 1 - الاستقبال العام';

const readSavedWorkstation = (userId) => {
    try {
        const raw = localStorage.getItem(`viara_reception_workspace:${userId || 'anonymous'}`);
        const saved = raw ? JSON.parse(raw) : {};
        return {
            desk: saved.desk || localStorage.getItem('viara_reception_desk') || DEFAULT_RECEPTION_DESK,
            scope: saved.scope || 'all',
            rooms: Array.isArray(saved.rooms) ? saved.rooms : [],
            modalities: Array.isArray(saved.modalities) ? saved.modalities : [],
        };
    } catch {
        return { desk: DEFAULT_RECEPTION_DESK, scope: 'all', rooms: [], modalities: [] };
    }
};

const ReceptionOperations = () => {
    const dispatch = useDispatch();
    const { t, i18n } = useTranslation('reception');
    const isArabic = i18n.language?.startsWith('ar');
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const user = useSelector(selectCurrentUser);
    const savedWorkstation = useMemo(() => readSavedWorkstation(user?.user_id), [user?.user_id]);
    const activeTab = searchParams.get('tab') || 'schedule';
    const [selectedDate, setSelectedDate] = useState(toLocalDateInput);
    const [searchTerm, setSearchTerm] = useState('');
    const [partialExceptionTarget, setPartialExceptionTarget] = useState(null);
    const linkedInvoiceId = searchParams.get('invoiceId');
    const { data: linkedInvoice } = useGetInvoiceQuery(linkedInvoiceId, { skip: !linkedInvoiceId });
    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const centerLogo = rawCenterSettings?.logo_url || '/center-logo.png';
    const { data: clinicalRooms = [] } = useGetRoomsQuery(undefined, { pollingInterval: 60000 });
    const { data: clinicalMachines = [] } = useGetMachinesQuery(undefined, { pollingInterval: 60000 });

    // Multi-Desk Workstation & Clinical Scope State
    const [activeDesk, setActiveDesk] = useState(() => savedWorkstation.desk);
    const [selectedScope, setSelectedScope] = useState(() => savedWorkstation.scope);
    const [selectedRooms, setSelectedRooms] = useState(() => savedWorkstation.rooms);
    const [selectedModalities, setSelectedModalities] = useState(() => savedWorkstation.modalities);
    const [deskPresets, setDeskPresets] = useState(readWorkstationPresets);
    const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
    const [isDisplayBoardOpen, setIsDisplayBoardOpen] = useState(false);

    useEffect(() => {
        if (Array.isArray(rawCenterSettings?.workstation_presets) && rawCenterSettings.workstation_presets.length > 0) {
            setDeskPresets(rawCenterSettings.workstation_presets);
        }
    }, [rawCenterSettings?.workstation_presets]);

    useEffect(() => {
        const refreshDeskPresets = () => setDeskPresets(readWorkstationPresets());
        window.addEventListener('VIARA_WORKSTATION_PRESETS_CHANGED', refreshDeskPresets);
        window.addEventListener('storage', refreshDeskPresets);
        return () => {
            window.removeEventListener('VIARA_WORKSTATION_PRESETS_CHANGED', refreshDeskPresets);
            window.removeEventListener('storage', refreshDeskPresets);
        };
    }, []);

    const permissions = useReceptionPermissions();
    const { has, canProcessPayments, canOpenCashierShift, canCloseCashierShift, canDiscount, canAppendSupplies, canManageQueue, canDeliverResults } = permissions;
    const [heartbeatReceptionTasks] = useHeartbeatReceptionTasksMutation();
    const receptionShiftEnabled = Boolean(user?.user_id && ['Receptionist', 'Admin', 'Developer'].includes(user.role));
    const {
        data: currentReceptionShift,
        isFetching: isReceptionShiftLoading,
        refetch: refetchReceptionShift,
    } = useGetCurrentReceptionShiftQuery(undefined, {
        skip: !receptionShiftEnabled,
        pollingInterval: 15_000,
    });
    const [openReceptionShift, { isLoading: isOpeningReceptionShift }] = useOpenReceptionShiftMutation();
    const [closeReceptionShift, { isLoading: isClosingReceptionShift }] = useCloseReceptionShiftMutation();
    const hydratedShiftIdRef = useRef(null);

    useEffect(() => {
        if (!receptionShiftEnabled) return undefined;
        const refreshShiftFromAnotherTab = () => {
            refetchReceptionShift().catch(() => undefined);
        };
        const handleStorage = (event) => {
            if (event.key === 'VIARA.reception.shiftChanged') refreshShiftFromAnotherTab();
        };
        window.addEventListener('storage', handleStorage);

        const channel = typeof BroadcastChannel !== 'undefined'
            ? new BroadcastChannel('viara-reception-shift')
            : null;
        if (channel) channel.onmessage = refreshShiftFromAnotherTab;

        return () => {
            window.removeEventListener('storage', handleStorage);
            channel?.close();
        };
    }, [receptionShiftEnabled, refetchReceptionShift]);

    const notifyReceptionShiftChanged = useCallback(() => {
        try {
            localStorage.setItem('VIARA.reception.shiftChanged', String(Date.now()));
            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel('viara-reception-shift');
                channel.postMessage({ changedAt: Date.now() });
                channel.close();
            }
        } catch {
            // Cross-tab synchronization is best-effort; query invalidation remains authoritative.
        }
    }, []);

    const cacheReceptionShift = useCallback(async (shift) => {
        await dispatch(api.util.upsertQueryData('getCurrentReceptionShift', undefined, shift));
    }, [dispatch]);

    useEffect(() => {
        if (!currentReceptionShift?.session_id) {
            hydratedShiftIdRef.current = null;
            return;
        }
        setActiveDesk(currentReceptionShift.desk_identifier || DEFAULT_RECEPTION_DESK);
        setSelectedRooms(Array.isArray(currentReceptionShift.room_ids) ? currentReceptionShift.room_ids : []);
        setSelectedModalities(Array.isArray(currentReceptionShift.modality_ids) ? currentReceptionShift.modality_ids : []);
        if (hydratedShiftIdRef.current !== currentReceptionShift.session_id) {
            setSelectedScope(currentReceptionShift.scope || 'all');
            hydratedShiftIdRef.current = currentReceptionShift.session_id;
        }
    }, [currentReceptionShift]);

    useEffect(() => {
        if (!user?.user_id || !['Receptionist', 'Admin', 'Developer'].includes(user.role)) return undefined;
        const renew = () => heartbeatReceptionTasks({
            desk: activeDesk,
            scope: selectedScope,
            rooms: selectedRooms,
            modalities: selectedModalities,
        }).unwrap().catch(() => undefined);
        renew();
        const interval = window.setInterval(renew, 60_000);
        return () => window.clearInterval(interval);
    }, [activeDesk, heartbeatReceptionTasks, selectedModalities, selectedRooms, selectedScope, user?.role, user?.user_id]);

    const handleOpenReceptionShift = useCallback(async () => {
        try {
            const assignmentScope = selectedRooms.length > 0
                ? 'rooms'
                : selectedModalities.length > 0
                    ? 'modalities'
                    : selectedScope === 'emergency' ? 'emergency' : 'all';
            const openedShift = await openReceptionShift({
                desk: activeDesk,
                scope: assignmentScope,
                rooms: selectedRooms,
                modalities: selectedModalities,
            }).unwrap();
            await cacheReceptionShift(openedShift);
            notifyReceptionShiftChanged();
            toast.success(isArabic ? 'تم بدء وردية الاستقبال وربطها بمحطة العمل' : 'Reception shift started and linked to this workstation');
        } catch (error) {
            const alreadyOpen = error?.data?.code === 'RECEPTION_SHIFT_ALREADY_OPEN'
                || String(error?.data?.message || '').includes('already have an open reception shift');
            if (alreadyOpen) {
                let openShift = error?.data?.details?.shift || null;
                try {
                    const refreshed = await refetchReceptionShift();
                    openShift = refreshed?.data || openShift;
                } catch {
                    // The structured conflict payload still gives enough context for a clear message.
                }
                if (openShift?.session_id) await cacheReceptionShift(openShift);
                const startedAt = openShift?.started_at
                    ? new Date(openShift.started_at).toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })
                    : null;
                const desk = openShift?.desk_identifier;
                toast.success(isArabic
                    ? `تم استعادة الوردية المفتوحة${desk ? ` — ${desk}` : ''}${startedAt ? ` · بدأت ${startedAt}` : ''}`
                    : `Open shift restored${desk ? ` — ${desk}` : ''}${startedAt ? ` · started ${startedAt}` : ''}`, {
                    icon: '🟢',
                });
                return;
            }
            toast.error(getErrorMessage(error, isArabic ? 'تعذر بدء وردية الاستقبال' : 'Could not start reception shift'));
        }
    }, [activeDesk, cacheReceptionShift, isArabic, notifyReceptionShiftChanged, openReceptionShift, refetchReceptionShift, selectedModalities, selectedRooms, selectedScope]);

    const handleCloseReceptionShift = useCallback(async () => {
        if (!currentReceptionShift?.session_id) return;
        const confirmed = window.confirm(isArabic
            ? 'سيتم تقفيل الوردية وحفظ إحصاءاتها. يجب تحويل أو تحرير كل المهام النشطة أولاً. هل تريد المتابعة؟'
            : 'This will close the shift and save its statistics. Transfer or release active tasks first. Continue?');
        if (!confirmed) return;
        try {
            const closed = await closeReceptionShift({ sessionId: currentReceptionShift.session_id }).unwrap();
            await cacheReceptionShift(null);
            notifyReceptionShiftChanged();
            const completed = closed?.metrics?.completed || 0;
            toast.success(isArabic ? `تم تقفيل الوردية — ${completed} مهمة مكتملة` : `Shift closed — ${completed} completed tasks`);
        } catch (error) {
            const code = error?.data?.code;
            if (code === 'ACTIVE_RECEPTION_TASKS') {
                const count = error?.data?.details?.activeTasks || '';
                toast.error(
                    isArabic
                        ? `يوجد مهام نشطة بالاستقبال (${count}). يرجى تحويلها أو إنجازها قبل إغلاق الوردية.`
                        : `Active tasks exist (${count}). Please transfer or release them before closing the shift.`,
                    { duration: 6000 }
                );
            } else if (code === 'OPEN_CASHIER_SHIFT') {
                toast.error(
                    isArabic
                        ? 'يجب إغلاق وردية الخزينة وجرد الدرج أولاً قبل إغلاق وردية الاستقبال.'
                        : 'Close the cashier shift and reconcile its balance before closing the reception shift.',
                    { duration: 6000 }
                );
            } else {
                toast.error(getErrorMessage(error, isArabic ? 'تعذر تقفيل الوردية' : 'Could not close reception shift'));
            }
        }
    }, [cacheReceptionShift, closeReceptionShift, currentReceptionShift?.session_id, isArabic, notifyReceptionShiftChanged]);

    const handleOpenDisplayBoard = useCallback(() => {
        const params = new URLSearchParams();
        if (selectedRooms && selectedRooms.length > 0) {
            params.set('rooms', selectedRooms.join(','));
        }
        const query = params.toString();
        const displayUrl = `/display${query ? `?${query}` : ''}`;
        window.open(displayUrl, '_blank', 'noopener,noreferrer');
    }, [selectedRooms]);

    const handleToggleRoom = useCallback((room) => {
        if (currentReceptionShift?.session_id) {
            toast.error(isArabic ? 'نطاق الغرف مثبت طوال الوردية؛ أغلق الوردية لتغييره' : 'Room assignment is locked for this shift');
            return;
        }
        setSelectedRooms((prev) => {
            const next = prev.includes(room) ? prev.filter((r) => r !== room) : [...prev, room];
            setSelectedScope(next.length > 0 ? 'rooms' : (selectedModalities.length > 0 ? 'modalities' : 'all'));
            return next;
        });
    }, [currentReceptionShift?.session_id, isArabic, selectedModalities.length]);

    const handleToggleModality = useCallback((mod) => {
        if (currentReceptionShift?.session_id) {
            toast.error(isArabic ? 'نطاق الأجهزة مثبت طوال الوردية؛ أغلق الوردية لتغييره' : 'Device assignment is locked for this shift');
            return;
        }
        setSelectedModalities((prev) => {
            const next = prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod];
            setSelectedScope(next.length > 0 ? 'modalities' : (selectedRooms.length > 0 ? 'rooms' : 'all'));
            return next;
        });
    }, [currentReceptionShift?.session_id, isArabic, selectedRooms.length]);

    const handleClearRooms = useCallback(() => {
        if (currentReceptionShift?.session_id) return;
        setSelectedRooms([]);
        setSelectedScope(selectedModalities.length > 0 ? 'modalities' : 'all');
    }, [currentReceptionShift?.session_id, selectedModalities.length]);
    const handleClearModalities = useCallback(() => {
        if (currentReceptionShift?.session_id) return;
        setSelectedModalities([]);
        setSelectedScope(selectedRooms.length > 0 ? 'rooms' : 'all');
    }, [currentReceptionShift?.session_id, selectedRooms.length]);
    const handleClearAllFilters = useCallback(() => {
        if (currentReceptionShift?.session_id) return;
        setSelectedRooms([]);
        setSelectedModalities([]);
        setSelectedScope('all');
    }, [currentReceptionShift?.session_id]);

    useEffect(() => {
        try {
            localStorage.setItem('viara_reception_desk', activeDesk);
            localStorage.setItem(`viara_reception_workspace:${user?.user_id || 'anonymous'}`, JSON.stringify({
                desk: activeDesk,
                scope: selectedScope,
                rooms: selectedRooms,
                modalities: selectedModalities,
            }));
        } catch {
            // Storage can be unavailable in privacy-restricted browsers.
        }
    }, [activeDesk, selectedModalities, selectedRooms, selectedScope, user?.user_id]);

    const buildNewAppointmentUrl = useCallback((extraParams = {}) => {
        const params = new URLSearchParams();
        if (selectedDate) params.set('date', selectedDate);
        if (selectedRooms && selectedRooms.length === 1) {
            params.set('roomId', selectedRooms[0]);
        }
        if (selectedModalities && selectedModalities.length === 1) {
            params.set('modalityId', selectedModalities[0]);
        }
        Object.entries(extraParams).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') params.set(k, v);
        });
        return `/appointments/new?${params.toString()}`;
    }, [selectedDate, selectedRooms, selectedModalities]);

    useEffect(() => {
        const updateStatus = (event) => setIsRealtimeConnected(Boolean(event.detail?.connected));
        window.addEventListener('SSE_CONNECTION_STATUS', updateStatus);
        return () => window.removeEventListener('SSE_CONNECTION_STATUS', updateStatus);
    }, []);
    const shiftFlow = useShiftFlow({ skip: !permissions.canProcessPayments && !permissions.canReconcileShifts });
    const receptionData = useReceptionData({ selectedDate });
    const {
        appointments,
        queueItems,
        queueKpis,
        invoices,
        cashierPending,
        scheduleSummary,
        dataErrors,
        hasDataError,
        appLoading,
        isWorkspaceFetching,
        isRefreshing,
        isDeliveringResult,
        refreshWorkspace,
        moveQueue,
        createAppointmentInvoice,
        confirmPickup,
        pickupTarget,
        setPickupTarget,
    } = receptionData;

    const paymentFlow = usePaymentFlow({
        currentShift: shiftFlow.currentShift,
        queueItems,
    });
    const { openPayment } = paymentFlow;
    const stockMovementParams = useMemo(() => ({
        referenceType: 'Exam',
        referenceIds: queueItems.map((item) => item.exam_id).filter(Boolean).join(','),
        limit: 1000,
    }), [queueItems]);
    const { data: stockMovements = [], isFetching: isStockRefreshing, refetch: refetchStockMovements } = useGetStockMovementsQuery(stockMovementParams, {
        pollingInterval: 30000,
        skip: !canProcessPayments || !stockMovementParams.referenceIds,
    });
    const registration = usePatientRegistration({ navigate, selectedDate });
    const [requestPartialPaymentException, partialExceptionMutation] = useRequestPartialPaymentExceptionMutation();
    const canUsePartialPaymentExceptions = has('REQUEST_PARTIAL_PAYMENT_EXCEPTION');
    const { data: partialPaymentExceptions = [], refetch: refetchPartialPaymentExceptions } = useGetPartialPaymentExceptionsQuery({
        transactionType: 'ClinicalQueueTransition',
        limit: 500,
    }, {
        skip: !canUsePartialPaymentExceptions,
        pollingInterval: 15000,
    });

    const tabs = useMemo(
        () => buildReceptionTabs({ canProcessPayments, t }).map((tab) => ({ ...tab, icon: TAB_ICONS[tab.id] })),
        [canProcessPayments, t]
    );

    // Dynamic Room and Modality sets connected to real clinical database
    const availableRooms = useMemo(() => {
        const map = new Map();

        // 1. Physical clinical rooms from database
        (clinicalRooms || []).forEach((r) => {
            const roomNum = r.room_number || r.name;
            if (roomNum) {
                const machinesList = (r.machines || []).map((m) => m.name || m.type).filter(Boolean);
                map.set(roomNum, {
                    id: r.id || r.room_id || roomNum,
                    room: roomNum,
                    roomNumber: roomNum,
                    label: r.name ? `${r.name} (${roomNum})` : `جناح ${roomNum}`,
                    rawName: r.name,
                    type: r.type || 'Imaging',
                    status: r.status || 'Active',
                    machines: machinesList,
                    floor: r.floor,
                });
            }
        });

        // 2. Merge any rooms from today's appointments / queue items
        (appointments || []).forEach((appt) => {
            if (appt.room_number && !map.has(appt.room_number)) {
                map.set(appt.room_number, {
                    room: appt.room_number,
                    roomNumber: appt.room_number,
                    label: appt.room_name ? `${appt.room_name} (${appt.room_number})` : `جناح ${appt.room_number}`,
                    rawName: appt.room_name,
                    type: 'Imaging',
                    status: 'Active',
                    machines: appt.machine_name ? [appt.machine_name] : [],
                });
            }
        });
        (queueItems || []).forEach((q) => {
            if (q.room_number && !map.has(q.room_number)) {
                map.set(q.room_number, {
                    room: q.room_number,
                    roomNumber: q.room_number,
                    label: `جناح ${q.room_number}`,
                    rawName: `جناح ${q.room_number}`,
                    type: 'Imaging',
                    status: 'Active',
                    machines: q.machine_name ? [q.machine_name] : [],
                });
            }
        });

        return Array.from(map.values()).sort((a, b) => {
            if (a.type === 'Imaging' && b.type !== 'Imaging') return -1;
            if (b.type === 'Imaging' && a.type !== 'Imaging') return 1;
            return a.room.localeCompare(b.room);
        });
    }, [clinicalRooms, appointments, queueItems]);

    const handleDeskChange = useCallback((desk) => {
        if (currentReceptionShift?.session_id) {
            toast.error(isArabic ? 'أغلق وردية الاستقبال الحالية قبل تغيير محطة العمل' : 'Close the current reception shift before changing workstation');
            return;
        }
        setActiveDesk(desk);

        const preset = deskPresets.find((item) => item.label === desk);
        if (!preset) return;

        const linkedRooms = (preset.roomIds || []).filter((roomId) =>
            availableRooms.some((room) => String(room.room) === String(roomId) || String(room.roomNumber) === String(roomId) || String(room.id) === String(roomId))
        );
        setSelectedModalities([]);
        setSelectedRooms(linkedRooms);
        setSelectedScope(preset.scope || (linkedRooms.length ? 'rooms' : 'all'));
        if (preset.tab && (!currentReceptionShift?.session_id || preset.tab !== 'cashier' || canProcessPayments)) {
            const next = new URLSearchParams(searchParams);
            next.set('tab', preset.tab);
            setSearchParams(next);
        }

        const linkedLabel = linkedRooms.length
            ? (isArabic ? ` تم ربط ${linkedRooms.length} غرفة تلقائياً` : ` ${linkedRooms.length} room(s) linked automatically`)
            : '';
        toast.success(isArabic ? `تم تفعيل ${desk}.${linkedLabel}` : `${desk} activated.${linkedLabel}`);
    }, [availableRooms, canProcessPayments, currentReceptionShift?.session_id, deskPresets, isArabic, searchParams, setSearchParams]);

    const availableModalities = useMemo(() => {
        const map = new Map();

        // 1. Physical clinical machines and devices from database
        (clinicalMachines || []).forEach((m) => {
            const key = m.name || m.modality_id;
            if (key) {
                map.set(key, {
                    id: m.modality_id || key,
                    name: m.name,
                    type: m.type || 'Imaging',
                    roomNumber: m.room_number,
                    roomName: m.room_name,
                    status: m.status || 'Active',
                    manufacturer: m.manufacturer,
                    model: m.model,
                });
            }
        });

        // 2. Merge any machines / modality types from today's appointments / queue
        (appointments || []).forEach((appt) => {
            if (appt.machine_name && !map.has(appt.machine_name)) {
                map.set(appt.machine_name, {
                    id: appt.machine_name,
                    name: appt.machine_name,
                    type: appt.modality_type || 'Imaging',
                    roomNumber: appt.room_number,
                    roomName: appt.room_name,
                    status: 'Active',
                });
            }
            if (appt.modality_type && !map.has(appt.modality_type)) {
                map.set(appt.modality_type, {
                    id: appt.modality_type,
                    name: appt.modality_type,
                    type: appt.modality_type,
                    status: 'Active',
                });
            }
        });
        (queueItems || []).forEach((q) => {
            if (q.machine_name && !map.has(q.machine_name)) {
                map.set(q.machine_name, {
                    id: q.machine_name,
                    name: q.machine_name,
                    type: q.modality_name || 'Imaging',
                    roomNumber: q.room_number,
                    status: 'Active',
                });
            }
            if (q.modality_name && !map.has(q.modality_name)) {
                map.set(q.modality_name, {
                    id: q.modality_name,
                    name: q.modality_name,
                    type: q.modality_name,
                    status: 'Active',
                });
            }
        });

        return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [clinicalMachines, appointments, queueItems]);

    const workstationCounts = useMemo(() => {
        const total = appointments?.length || 0;
        const mine = (appointments || []).filter(
            (a) => String(a.receptionist_id) === String(user?.user_id)
        ).length;
        const unclaimed = (appointments || []).filter(
            (a) => !a.receptionist_id && ['Scheduled', 'Arrived'].includes(a.status)
        ).length;
        const inExam = (appointments || []).filter(
            (a) => a.status === 'In Exam' || a.queue_stage === 'In Exam'
        ).length;
        const emergency = (appointments || []).filter(
            (a) => ['Emergency', 'Urgent'].includes(a.priority)
        ).length;
        return { total, mine, unclaimed, inExam, emergency };
    }, [appointments, user?.user_id]);

    useEffect(() => {
        if (!tabs.some((tab) => tab.id === activeTab)) {
            const next = new URLSearchParams(searchParams);
            next.set('tab', tabs[0]?.id || 'schedule');
            setSearchParams(next, { replace: true });
        }
    }, [activeTab, tabs, searchParams, setSearchParams]);

    useEffect(() => {
        const requestedInvoiceId = searchParams.get('invoiceId');
        if (!requestedInvoiceId) return;
        const requestedInvoice = linkedInvoice || invoices.find((invoice) => invoice.invoice_id === requestedInvoiceId);
        if (!requestedInvoice) return;
        openPayment(requestedInvoice);
        const nextParams = new URLSearchParams(searchParams);
        if (canProcessPayments) nextParams.set('tab', 'cashier');
        nextParams.delete('invoiceId');
        setSearchParams(nextParams, { replace: true });
    }, [canProcessPayments, invoices, linkedInvoice, openPayment, searchParams, setSearchParams]);

    const handleRefresh = useCallback(async () => {
        await Promise.all([
            refreshWorkspace(),
            canProcessPayments ? refetchStockMovements() : Promise.resolve(),
            canUsePartialPaymentExceptions ? refetchPartialPaymentExceptions() : Promise.resolve(),
        ]);
    }, [canProcessPayments, canUsePartialPaymentExceptions, refetchPartialPaymentExceptions, refetchStockMovements, refreshWorkspace]);

    const handleTabChange = useCallback((nextTab) => {
        if (!tabs.some((tab) => tab.id === nextTab)) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', nextTab);
        setSearchParams(nextParams);
    }, [searchParams, setSearchParams, tabs]);

    const submitPartialPaymentException = useCallback(async (reason) => {
        if (!partialExceptionTarget?.invoice?.invoice_id) return false;
        try {
            await requestPartialPaymentException({
                invoiceId: partialExceptionTarget.invoice.invoice_id,
                transactionType: partialExceptionTarget.transactionType,
                targetStage: partialExceptionTarget.targetStage,
                reason,
            }).unwrap();
            toast.success(t('billing.exceptionRequested', { defaultValue: 'Exception request sent for approval.' }));
            setPartialExceptionTarget(null);
            await Promise.all([refreshWorkspace(), refetchPartialPaymentExceptions()]);
            return true;
        } catch (error) {
            const isExistingPendingRequest = error?.data?.code === 'PARTIAL_PAYMENT_EXCEPTION_PENDING'
                || String(error?.data?.message || '').includes('pending exception already exists');
            if (isExistingPendingRequest) {
                await refetchPartialPaymentExceptions();
                setPartialExceptionTarget(null);
                toast(t('billing.exceptionAlreadyPending', { defaultValue: 'An exception request already exists and is pending review.' }), {
                    icon: '⏳',
                });
                return true;
            }
            toast.error(getErrorMessage(error, t('billing.exceptionRequestFailed', { defaultValue: 'Exception request could not be submitted.' })));
            return false;
        }
    }, [partialExceptionTarget, refetchPartialPaymentExceptions, refreshWorkspace, requestPartialPaymentException, t]);

    const displayDate = useMemo(
        () => new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
            isArabic ? 'ar-EG' : 'en-US',
            { weekday: 'long', month: 'long', day: 'numeric' }
        ),
        [isArabic, selectedDate]
    );

    // Quick Date Shift Helper
    const shiftDate = (days) => {
        setSelectedDate(shiftLocalDateInput(selectedDate, days));
    };

    const [quickFilter, setQuickFilter] = useState(null);

    const handleKpiClick = useCallback((filter, tab = 'schedule') => {
        if (tab && activeTab !== tab) {
            handleTabChange(tab);
        }
        if (filter) {
            setQuickFilter({ ...filter, _ts: Date.now() });
        }
    }, [activeTab, handleTabChange]);

    const isToday = selectedDate === toLocalDateInput();

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-12">
            {hasDataError && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/20">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 mt-0.5">
                        <AlertTriangle size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-rose-800 dark:text-rose-200">
                            {isArabic ? 'تعذر تحميل بعض بيانات الاستقبال' : 'Some reception data could not be loaded'}
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-rose-600/80 dark:text-rose-300/80">
                            {isArabic
                                ? `المصادر المتأثرة: ${dataErrors.map(({ source }) => source).join('، ')}. لا تعتمد على الأرقام الصفرية قبل إعادة المحاولة.`
                                : `Affected: ${dataErrors.map(({ source }) => source).join(', ')}. Do not treat zero values as authoritative until refresh succeeds.`}
                        </p>
                    </div>
                </div>
            )}
            <PageHeader
                logoUrl={centerLogo}
                icon={Building2}
                eyebrowIcon={Sparkles}
                eyebrow={t('command.live', { defaultValue: 'Reception Command Center' })}
                title={t('title', { defaultValue: 'Patient Reception & Operations' })}
                description={`${displayDate} · ${t('command.signedIn', { name: user?.name || user?.fullName || (isArabic ? 'موظف الاستقبال' : 'Reception Staff') })}`}
                meta={<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" />{isWorkspaceFetching || isRefreshing ? (isArabic ? 'جاري التحديث' : 'Updating') : (isArabic ? 'مزامنة مباشرة' : 'Live Sync')}</span>}
                actions={(
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Quick Date Stepper */}
                        <div className="flex items-center rounded-2xl border border-slate-200/80 bg-white/90 p-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <button
                                type="button"
                                onClick={() => shiftDate(-1)}
                                title={isArabic ? 'اليوم السابق' : 'Previous Day'}
                                aria-label={isArabic ? 'اليوم السابق' : 'Previous Day'}
                                className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                <ChevronLeft size={16} className="rtl:rotate-180" />
                            </button>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                                required
                                className="h-8 border-none bg-transparent px-2 text-xs font-black text-slate-800 outline-hidden dark:text-slate-200"
                            />
                            <button
                                type="button"
                                onClick={() => shiftDate(1)}
                                title={isArabic ? 'اليوم التالي' : 'Next Day'}
                                aria-label={isArabic ? 'اليوم التالي' : 'Next Day'}
                                className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                <ChevronRight size={16} className="rtl:rotate-180" />
                            </button>
                            {!isToday && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedDate(toLocalDateInput())}
                                    className="ms-1 rounded-xl bg-teal-500/10 px-2.5 py-1 text-[10.5px] font-black text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition"
                                >
                                    {isArabic ? 'اليوم' : 'Today'}
                                </button>
                            )}
                        </div>

                        {has('CREATE_PATIENTS') && <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={isRefreshing || isStockRefreshing || isWorkspaceFetching}
                            title={t('command.refresh', { defaultValue: 'Refresh' })}
                            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={15} className={isRefreshing || isStockRefreshing || isWorkspaceFetching ? 'animate-spin' : ''} />
                        </button>}

                        {has('CREATE_APPOINTMENTS') && <button
                            type="button"
                            onClick={registration.open}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <UserPlus size={15} />
                            <span>{t('command.addPatient', { defaultValue: 'Add Patient' })}</span>
                        </button>}

                        {has('CREATE_APPOINTMENTS') && (
                            <button
                                type="button"
                                onClick={() => navigate(buildNewAppointmentUrl())}
                                className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                            >
                                <CalendarPlus size={15} />
                                <span>{t('booking.title', { defaultValue: 'Book Appointment' })}</span>
                            </button>
                        )}
                    </div>
                )}
                metrics={[
                    {
                        key: 'booked',
                        label: t('overview.booked', { defaultValue: 'Today Bookings' }),
                        value: scheduleSummary.booked || 0,
                        icon: CalendarCheck2,
                        tone: 'teal',
                        detail: isArabic ? 'إجمالي الحالات المجدولة' : 'Scheduled exams',
                        loading: appLoading,
                        error: hasDataError,
                        onClick: () => handleKpiClick({ stage: 'all', priority: 'all' }, 'schedule')
                    },
                    {
                        key: 'ready',
                        label: t('overview.ready', { defaultValue: 'Arrived & In Prep' }),
                        value: scheduleSummary.ready || 0,
                        icon: CheckCircle2,
                        tone: 'emerald',
                        detail: isArabic ? 'حاضرون بالاستقبال' : 'Checked-in patients',
                        loading: appLoading,
                        error: hasDataError,
                        onClick: () => handleKpiClick({ stage: 'Arrived', priority: 'all' }, 'schedule')
                    },
                    {
                        key: 'exam',
                        label: isArabic ? 'داخل غرف الأشعة' : 'In Examination',
                        value: Math.max(
                            queueItems.filter(q => (q.queue_stage || q.queueStage) === 'In Exam').length,
                            (appointments || []).filter(a => a.status === 'In Exam' || a.queue_stage === 'In Exam').length
                        ),
                        icon: Activity,
                        tone: 'blue',
                        detail: isArabic ? 'فحوصات جارية حالياً' : 'Active modality scans',
                        loading: appLoading,
                        error: hasDataError,
                        onClick: () => handleKpiClick({ stage: 'In Exam', priority: 'all' }, 'schedule')
                    },
                    {
                        key: 'priority',
                        label: t('overview.priority', { defaultValue: 'Priority & STAT' }),
                        value: scheduleSummary.urgent || 0,
                        icon: AlertTriangle,
                        tone: 'amber',
                        detail: isArabic ? 'حالات طارئة وعاجلة' : 'High-priority cases',
                        loading: appLoading,
                        error: hasDataError,
                        onClick: () => handleKpiClick({ stage: 'all', priority: 'Emergency' }, 'schedule')
                    },
                    canProcessPayments && {
                        key: 'cashier',
                        label: isArabic ? 'التحصيل المعلق' : 'Cashier Pending',
                        value: cashierPending.length,
                        icon: CreditCard,
                        tone: 'violet',
                        detail: isArabic ? 'فواتير غير مسددة' : 'Awaiting payment',
                        loading: appLoading,
                        error: hasDataError,
                        onClick: () => handleKpiClick(null, 'cashier')
                    },
                ].filter(Boolean)}
                metricsLabel={isArabic ? 'مؤشرات سجل الاستقبال' : 'Reception record indicators'}
            />


            {/* Sub-Tabs Nav */}
            <ReceptionTabNav
                activeTab={activeTab}
                cashierPending={cashierPending.length}
                scheduleCount={scheduleSummary.booked || 0}
                onTabChange={handleTabChange}
                tabs={tabs}
                t={t}
            />

            {/* Reception Multi-Desk Workstation & Work Division Scope Bar */}
            <ReceptionWorkstationBar
                activeDesk={activeDesk}
                onDeskChange={handleDeskChange}
                selectedScope={selectedScope}
                onScopeChange={setSelectedScope}
                selectedRooms={selectedRooms}
                onToggleRoom={handleToggleRoom}
                selectedModalities={selectedModalities}
                onToggleModality={handleToggleModality}
                onClearRooms={handleClearRooms}
                onClearModalities={handleClearModalities}
                onClearAll={handleClearAllFilters}
                availableRooms={availableRooms}
                availableModalities={availableModalities}
                counts={workstationCounts}
                onOpenDisplayBoard={handleOpenDisplayBoard}
                currentUser={user}
                isRealtimeConnected={isRealtimeConnected}
                receptionShift={currentReceptionShift}
                workstationLocked={Boolean(currentReceptionShift?.session_id)}
                isShiftLoading={isReceptionShiftLoading || isOpeningReceptionShift || isClosingReceptionShift}
                onOpenShift={handleOpenReceptionShift}
                onCloseShift={handleCloseReceptionShift}
                deskPresets={deskPresets}
            />

            {/* Main Tab Workspaces */}
            <main
                id={`reception-panel-${activeTab}`}
                className="w-full"
                role="tabpanel"
                aria-labelledby={`reception-tab-${activeTab}`}
                tabIndex={0}
            >
                {activeTab === 'schedule' && (
                    <ScheduleView
                        displayDate={displayDate}
                        appointments={appointments}
                        appLoading={appLoading}
                        scheduleSummary={scheduleSummary}
                        invoices={invoices}
                        createAppointmentInvoice={createAppointmentInvoice}
                        moveQueue={moveQueue}
                        i18n={i18n}
                        t={t}
                        selectedDate={selectedDate}
                        queueItems={queueItems}
                        queueKpis={queueKpis}
                        canManageQueue={canManageQueue}
                        canDeliverResults={canDeliverResults}
                        canManageWaitlist={has('MANAGE_WAITLIST')}
                        canCreateAppointments={has('CREATE_APPOINTMENTS')}
                        onQueueMove={moveQueue}
                        onPickup={setPickupTarget}
                        onOpenPayment={paymentFlow.openPayment}
                        partialPaymentExceptions={partialPaymentExceptions}
                        onRequestPartialPaymentException={canUsePartialPaymentExceptions ? setPartialExceptionTarget : undefined}
                        quickFilter={quickFilter}
                        externalDesk={activeDesk}
                        externalScope={selectedScope}
                        externalRooms={selectedRooms}
                        externalModalities={selectedModalities}
                        onDeskChange={handleDeskChange}
                        onScopeChange={setSelectedScope}
                    />
                )}

                {activeTab === 'patients' && (
                    <PatientDirectory
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        onBook={has('CREATE_APPOINTMENTS') ? (pat) => navigate(buildNewAppointmentUrl({ patientId: pat.patient_id || pat.id })) : undefined}
                        onViewProfile={(pat) => navigate(`/patients/${encodeURIComponent(pat.patient_id || pat.id)}`)}
                    />
                )}

                {activeTab === 'cashier' && (
                    <CashierQueueTab
                        canAppendSupplies={canAppendSupplies}
                        canCloseShift={canCloseCashierShift}
                        canOpenShift={canOpenCashierShift}
                        canReconcileShifts={permissions.canReconcileShifts}
                        canReviewShiftVariance={permissions.canReviewShiftVariance}
                        currentShift={shiftFlow.currentShift}
                        invoices={invoices}
                        isLoadingShift={shiftFlow.isLoadingShift}
                        items={cashierPending}
                        stockMovements={stockMovements}
                        locale={i18n.language}
                        onCreateInvoice={createAppointmentInvoice}
                        onMoveQueue={moveQueue}
                        onOpenPayment={paymentFlow.openPayment}
                        onReconcile={shiftFlow.handleReconciliation}
                        onRefresh={handleRefresh}
                        onSupplyConsumed={handleRefresh}
                        partialPaymentExceptions={partialPaymentExceptions}
                        onRequestPartialPaymentException={canUsePartialPaymentExceptions ? setPartialExceptionTarget : undefined}
                        onShiftAction={shiftFlow.openShiftDialog}
                        receptionShift={currentReceptionShift}
                        t={t}
                    />
                )}

                {activeTab === 'billing' && <BillingTab selectedDate={selectedDate} receptionShift={currentReceptionShift} />}
            </main>

            {/* Modals & Dialogs */}
            <ShiftActionModal {...shiftFlow.shiftModalProps} />

            <PaymentCollectionModal
                {...paymentFlow.paymentModalProps}
                canDiscount={canDiscount}
            />

            <PatientRegistrationModal {...registration.registrationModalProps} />

            <TextPromptDialog
                isOpen={Boolean(partialExceptionTarget)}
                onClose={() => setPartialExceptionTarget(null)}
                onConfirm={submitPartialPaymentException}
                title={t('billing.requestExceptionTitle', { defaultValue: 'Request partial payment exception' })}
                message={t('billing.requestExceptionMessage', {
                    invoice: partialExceptionTarget?.invoice?.invoice_number || '-',
                    defaultValue: 'Explain why this restricted transaction should continue before the invoice is fully paid.',
                })}
                label={t('billing.exceptionReason', { defaultValue: 'Exception reason' })}
                placeholder={t('billing.exceptionReasonPlaceholder', { defaultValue: 'Responsible party approval context, patient commitment, management instruction...' })}
                confirmLabel={t('billing.submitExceptionRequest', { defaultValue: 'Submit request' })}
                cancelLabel={t('pickup.cancel', { defaultValue: 'Cancel' })}
                validationMessage={t('billing.exceptionReasonRequired', { defaultValue: 'Enter at least 5 characters.' })}
                validate={(value) => value.trim().length < 5 ? t('billing.exceptionReasonRequired', { defaultValue: 'Enter at least 5 characters.' }) : ''}
                inputProps={{ maxLength: 1000 }}
                isLoading={partialExceptionMutation.isLoading}
            />

            <TextPromptDialog
                isOpen={Boolean(pickupTarget)}
                onClose={() => setPickupTarget(null)}
                onConfirm={confirmPickup}
                title={t('pickup.title', { defaultValue: 'Confirm Report Delivery' })}
                message={t('pickup.description', {
                    patient: pickupTarget?.patient_name || (isArabic ? 'المريض' : 'Patient'),
                    mrn: pickupTarget?.mrn || '-',
                })}
                label={t('pickup.recipient', { defaultValue: 'Recipient Name' })}
                placeholder={t('pickup.recipientPlaceholder', { defaultValue: 'Name of the person receiving the report...' })}
                initialValue={pickupTarget?.patient_name || ''}
                confirmLabel={t('pickup.confirm', { defaultValue: 'Confirm Delivery' })}
                cancelLabel={t('pickup.cancel', { defaultValue: 'Cancel' })}
                validationMessage={t('pickup.recipientRequired', { defaultValue: 'Recipient name is required.' })}
                inputProps={{ maxLength: 150, autoComplete: 'name' }}
                isLoading={isDeliveringResult}
            />

            {/* Public Patient Queue TV Display Modal */}
            <PublicQueueDisplayModal
                isOpen={isDisplayBoardOpen}
                onClose={() => setIsDisplayBoardOpen(false)}
            />

        </div>
    );
};

export default ReceptionOperations;
