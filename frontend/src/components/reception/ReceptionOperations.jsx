import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    useCloseReceptionShiftMutation,
    useGetAttendanceQuery
} from '../../store/api';
import {
    AlertCircle,
    Building2,
    CalendarCheck2,
    CalendarDays,
    CalendarPlus,
    CircleDollarSign,
    ClipboardCheck,
    MonitorPlay,
    RefreshCw,
    UserPlus,
    UsersRound,
    WalletCards,
    Wifi,
    Sparkles,
    Clock,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    ShieldCheck
} from 'lucide-react';

import { useReceptionPermissions } from '../../hooks/useReceptionPermissions';
import { useReceptionData } from '../../hooks/useReceptionData';
import { usePaymentFlow } from '../../hooks/usePaymentFlow';
import { useShiftFlow } from '../../hooks/useShiftFlow';
import { usePatientRegistration } from '../../hooks/usePatientRegistration';
import { buildReceptionTabs, getCurrentUserId, shiftLocalDateInput, toLocalDateInput } from './receptionLogic';
import ReceptionTabNav from './ReceptionTabNav';
import ShiftActionModal from './ShiftActionModal';
import UnifiedShiftCloseWizardModal from './UnifiedShiftCloseWizardModal';
import PaymentCollectionModal from './PaymentCollectionModal';
import PatientRegistrationModal from './PatientRegistrationModal';
import ReceptionWorkstationBar from './ReceptionWorkstationBar';
import PublicQueueDisplayModal from './PublicQueueDisplayModal';
import TextPromptDialog from '../ui/TextPromptDialog';
import PageHeader from '../ui/PageHeader';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { readWorkstationPresets } from './workstationPresets';

// Keep the landing bundle lean, while allowing intent-based prefetching on hover/focus.
const lazyWithPreload = (factory) => {
    let promise;
    const load = () => {
        promise ||= factory();
        return promise;
    };
    const Component = lazy(load);
    Component.preload = load;
    return Component;
};

const ScheduleView = lazyWithPreload(() => import('./ScheduleView'));
const PatientDirectory = lazyWithPreload(() => import('./PatientDirectory'));
const CashierQueueTab = lazyWithPreload(() => import('./CashierQueueTab'));
const BillingTab = lazyWithPreload(() => import('./BillingTab'));
const EndOfDayReview = lazyWithPreload(() => import('../../pages/EndOfDayReview'));

const TAB_COMPONENTS = {
    schedule: ScheduleView,
    patients: PatientDirectory,
    cashier: CashierQueueTab,
    billing: BillingTab,
    'end-of-day': EndOfDayReview,
};

const WorkspaceFallback = ({ isArabic }) => (
    <div className="space-y-2 rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-4">
        <div className="h-10 animate-pulse rounded-xl bg-[var(--VIARA-surface-muted)]" />
        <div className="h-14 animate-pulse rounded-xl bg-[var(--VIARA-surface-muted)]/80" />
        <div className="h-48 animate-pulse rounded-xl bg-[var(--VIARA-surface-muted)]/60" />
        <span className="sr-only">{isArabic ? 'جاري تحميل مساحة العمل' : 'Loading workspace'}</span>
    </div>
);

const TAB_ICONS = {
    schedule: CalendarCheck2,
    patients: UsersRound,
    cashier: CircleDollarSign,
    billing: WalletCards,
    'end-of-day': ClipboardCheck,
};

const DEFAULT_RECEPTION_DESK = 'شباك 1 - الاستقبال العام';

const ASSIGNMENT_SCOPES = ['rooms', 'modalities', 'emergency'];
const VIEW_FILTER_SCOPES = ['mine', 'unclaimed', 'attention', 'inExam'];

const readSavedWorkstation = (userId) => {
    try {
        const raw = localStorage.getItem(`viara_reception_workspace:${userId || 'anonymous'}`);
        const saved = raw ? JSON.parse(raw) : {};
        return {
            desk: saved.desk || localStorage.getItem('viara_reception_desk') || DEFAULT_RECEPTION_DESK,
            deskId: saved.deskId || null,
            scope: saved.scope || 'all',
            rooms: Array.isArray(saved.rooms) ? saved.rooms : [],
            modalities: Array.isArray(saved.modalities) ? saved.modalities : [],
        };
    } catch {
        return { desk: DEFAULT_RECEPTION_DESK, deskId: null, scope: 'all', rooms: [], modalities: [] };
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
    const operationalTabActive = ['schedule', 'cashier'].includes(activeTab);
    const { data: clinicalRooms = [] } = useGetRoomsQuery(undefined, {
        pollingInterval: operationalTabActive ? 60_000 : 0,
        refetchOnFocus: operationalTabActive,
    });
    const { data: clinicalMachines = [] } = useGetMachinesQuery(undefined, {
        pollingInterval: operationalTabActive ? 60_000 : 0,
        refetchOnFocus: operationalTabActive,
    });

    // Multi-Desk Workstation & Clinical Scope State
    const [activeDesk, setActiveDesk] = useState(() => savedWorkstation.desk);
    const [activeDeskId, setActiveDeskId] = useState(() => savedWorkstation.deskId);
    const [selectedScope, setSelectedScope] = useState(() => savedWorkstation.scope);
    const [selectedRooms, setSelectedRooms] = useState(() => savedWorkstation.rooms);
    const [selectedModalities, setSelectedModalities] = useState(() => savedWorkstation.modalities);
    const [deskPresets, setDeskPresets] = useState(readWorkstationPresets);
    const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
    const [isDisplayBoardOpen, setIsDisplayBoardOpen] = useState(false);

    useEffect(() => {
        if (Array.isArray(rawCenterSettings?.workstation_presets) && rawCenterSettings.workstation_presets.length > 0) {
            setDeskPresets((current) => {
                const incoming = rawCenterSettings.workstation_presets;
                if (JSON.stringify(current) === JSON.stringify(incoming)) {
                    return current;
                }
                return incoming;
            });
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
    const { has, canProcessPayments, canViewInvoices, canViewExams, canOpenCashierShift, canCloseCashierShift, canDiscount, canAppendSupplies, canManageQueue, canDeliverResults } = permissions;
    const canViewAppointments = has('VIEW_APPOINTMENTS');
    const canUseCashier = canProcessPayments && canViewInvoices;
    // End-of-day review is available to Receptionists, Admins, and Developers.
    // A dedicated permission (REVIEW_END_OF_DAY) can be granted for fine-grained
    // control; absence of the permission falls back to a role check so that no
    // extra DB migration is needed for existing deployments.
    const canReviewEndOfDay = has('REVIEW_END_OF_DAY')
        || ['Receptionist', 'Admin', 'Developer'].includes(user?.role);
    const [heartbeatReceptionTasks] = useHeartbeatReceptionTasksMutation();
    const currentUserId = getCurrentUserId(user);
    const receptionShiftEnabled = Boolean(currentUserId && ['Receptionist', 'Admin', 'Developer'].includes(user?.role));
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

    // Active attendance session query to ensure clock-in precedes opening shift
    const { data: attendanceData } = useGetAttendanceQuery(
        { userId: currentUserId, activeOnly: true, limit: 1 },
        {
            skip: !currentUserId,
            refetchOnFocus: true,
        }
    );

    const attendanceRecords = useMemo(() => {
        if (Array.isArray(attendanceData)) return attendanceData;
        if (Array.isArray(attendanceData?.items)) return attendanceData.items;
        if (Array.isArray(attendanceData?.records)) return attendanceData.records;
        return [];
    }, [attendanceData]);

    const activeAttendanceSession = useMemo(
        () => attendanceRecords.find((record) => !record.clock_out),
        [attendanceRecords]
    );

    const isClockedIn = Boolean(activeAttendanceSession);
    const [isCloseWizardOpen, setIsCloseWizardOpen] = useState(false);
    const [closedReceptionSessionId, setClosedReceptionSessionId] = useState(() => searchParams.get('sessionId') || null);
    const [closedReceptionShiftDate, setClosedReceptionShiftDate] = useState(() => searchParams.get('date') || null);

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
        const shiftDesk = currentReceptionShift.desk_identifier || DEFAULT_RECEPTION_DESK;
        const matchedPreset = deskPresets.find((preset) => preset.label === shiftDesk);
        setActiveDesk(shiftDesk);
        setActiveDeskId(matchedPreset?.id || null);
        setSelectedRooms(Array.isArray(currentReceptionShift.room_ids) ? currentReceptionShift.room_ids : []);
        setSelectedModalities(Array.isArray(currentReceptionShift.modality_ids) ? currentReceptionShift.modality_ids : []);
        if (hydratedShiftIdRef.current !== currentReceptionShift.session_id) {
            const shiftScope = currentReceptionShift.scope || 'all';
            setSelectedScope((prev) => {
                // A view filter (mine/unclaimed/attention/inExam) is display-only and
                // must survive shift hydration; assignment scopes come from the shift.
                if (VIEW_FILTER_SCOPES.includes(prev) && !ASSIGNMENT_SCOPES.includes(shiftScope)) return prev;
                return shiftScope;
            });
            hydratedShiftIdRef.current = currentReceptionShift.session_id;
        }
    }, [currentReceptionShift, deskPresets]);

    useEffect(() => {
        if (!currentUserId || !['Receptionist', 'Admin', 'Developer'].includes(user?.role)) return undefined;
        // The heartbeat only renews task leases and liveness. The shift desk, scope,
        // and assignments are deliberately immutable server-side while the shift is
        // open, so no workstation state is sent here.
        const renew = () => heartbeatReceptionTasks({}).unwrap().catch(() => undefined);
        renew();
        const interval = window.setInterval(renew, 60_000);
        return () => window.clearInterval(interval);
    }, [currentUserId, heartbeatReceptionTasks, user?.role]);

    const handleOpenReceptionShift = useCallback(async () => {
        if (!isClockedIn) {
            toast.error(isArabic
                ? 'يجب تسجيل الحضور أولاً بناءً على جدول وردياتك قبل بدء وردية الاستقبال.'
                : 'Attendance clock-in is required before starting the reception shift.');
            return;
        }

        const assignmentScope = selectedScope === 'emergency'
            ? 'emergency'
            : selectedScope === 'rooms'
                ? 'rooms'
                : selectedScope === 'modalities'
                    ? 'modalities'
                    : selectedRooms.length > 0
                        ? 'rooms'
                        : selectedModalities.length > 0
                            ? 'modalities'
                            : 'all';
        if (assignmentScope === 'rooms' && selectedRooms.length === 0) {
            toast.error(isArabic ? 'اختر غرفة واحدة على الأقل قبل بدء وردية بنطاق الغرف.' : 'Select at least one room before starting a room-scoped shift.');
            return;
        }
        if (assignmentScope === 'modalities' && selectedModalities.length === 0) {
            toast.error(isArabic ? 'اختر جهازًا واحدًا على الأقل قبل بدء وردية بنطاق الأجهزة.' : 'Select at least one device before starting a device-scoped shift.');
            return;
        }

        try {
            const branchId = user?.branch_id || user?.branchId || undefined;
            const openedShift = await openReceptionShift({
                desk: activeDesk,
                scope: assignmentScope,
                rooms: assignmentScope === 'rooms' ? selectedRooms : [],
                modalities: assignmentScope === 'modalities' ? selectedModalities : [],
                ...(branchId ? { branchId } : {}),
            }).unwrap();
            setClosedReceptionSessionId(null);
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
    }, [activeDesk, cacheReceptionShift, isArabic, isClockedIn, notifyReceptionShiftChanged, openReceptionShift, refetchReceptionShift, selectedModalities, selectedRooms, selectedScope, user?.branchId, user?.branch_id]);

    const handleCloseReceptionShift = useCallback(() => {
        if (!currentReceptionShift?.session_id) return;
        setIsCloseWizardOpen(true);
    }, [currentReceptionShift?.session_id]);

    const handleCloseWizardSuccess = useCallback(async (closedShift) => {
        setIsCloseWizardOpen(false);
        setClosedReceptionSessionId(closedShift?.session_id || currentReceptionShift?.session_id || null);
        setClosedReceptionShiftDate(closedShift?.shift_date || null);
        await cacheReceptionShift(null);
        notifyReceptionShiftChanged();
        if (canReviewEndOfDay) {
            const next = new URLSearchParams(searchParams);
            next.set('tab', 'end-of-day');
            if (closedShift?.session_id) next.set('sessionId', closedShift.session_id);
            if (closedShift?.shift_date) next.set('date', closedShift.shift_date);
            next.set('fromShiftClose', 'true');
            setSearchParams(next);
        }
    }, [cacheReceptionShift, canReviewEndOfDay, currentReceptionShift?.session_id, notifyReceptionShiftChanged, searchParams, setSearchParams]);

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
            setSelectedScope(next.length > 0 ? 'rooms' : 'all');
            return next;
        });
        setSelectedModalities([]);
    }, [currentReceptionShift?.session_id, isArabic]);

    const handleToggleModality = useCallback((mod) => {
        if (currentReceptionShift?.session_id) {
            toast.error(isArabic ? 'نطاق الأجهزة مثبت طوال الوردية؛ أغلق الوردية لتغييره' : 'Device assignment is locked for this shift');
            return;
        }
        setSelectedModalities((prev) => {
            const next = prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod];
            setSelectedScope(next.length > 0 ? 'modalities' : 'all');
            return next;
        });
        setSelectedRooms([]);
    }, [currentReceptionShift?.session_id, isArabic]);

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

    const handleWorkstationScopeChange = useCallback((scope) => {
        if (scope === 'emergency' && !currentReceptionShift?.session_id) {
            setSelectedRooms([]);
            setSelectedModalities([]);
        }
        setSelectedScope(scope);
    }, [currentReceptionShift?.session_id]);

    useEffect(() => {
        try {
            localStorage.setItem('viara_reception_desk', activeDesk);
            localStorage.setItem(`viara_reception_workspace:${user?.user_id || 'anonymous'}`, JSON.stringify({
                desk: activeDesk,
                deskId: activeDeskId,
                scope: selectedScope,
                rooms: selectedRooms,
                modalities: selectedModalities,
            }));
        } catch {
            // Storage can be unavailable in privacy-restricted browsers.
        }
    }, [activeDesk, activeDeskId, selectedModalities, selectedRooms, selectedScope, user?.user_id]);

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
    const receptionData = useReceptionData({
        selectedDate,
        canViewAppointments,
        canViewQueue: canViewAppointments && canViewExams,
        canViewInvoices,
    });
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
        isRequestingReport,
        refreshWorkspace,
        moveQueue,
        createAppointmentInvoice,
        confirmPickup,
        requestReport,
        deferReport,
        pickupTarget,
        setPickupTarget,
    } = receptionData;

    const paymentFlow = usePaymentFlow({
        currentShift: shiftFlow.currentShift,
        queueItems,
        refreshWorkspace,
        canManageQueue,
    });
    const { openPayment } = paymentFlow;
    const stockMovementParams = useMemo(() => ({
        referenceType: 'Exam',
        referenceIds: queueItems.map((item) => item.exam_id).filter(Boolean).join(','),
        limit: 1000,
    }), [queueItems]);
    const { data: stockMovements = [], isFetching: isStockRefreshing, refetch: refetchStockMovements } = useGetStockMovementsQuery(stockMovementParams, {
        pollingInterval: 30000,
        skip: activeTab !== 'cashier' || !canProcessPayments || !stockMovementParams.referenceIds,
    });
    const registration = usePatientRegistration({ navigate, selectedDate });
    const [requestPartialPaymentException, partialExceptionMutation] = useRequestPartialPaymentExceptionMutation();
    const canUsePartialPaymentExceptions = has('REQUEST_PARTIAL_PAYMENT_EXCEPTION');
    const { data: partialPaymentExceptions = [], refetch: refetchPartialPaymentExceptions } = useGetPartialPaymentExceptionsQuery({
        transactionType: 'ClinicalQueueTransition',
        limit: 500,
    }, {
        skip: !canUsePartialPaymentExceptions || !['schedule', 'cashier'].includes(activeTab),
        pollingInterval: 30000,
    });

    const tabs = useMemo(
        () => buildReceptionTabs({ canProcessPayments, has, t, canReviewEndOfDay })
                  .map((tab) => ({ ...tab, icon: TAB_ICONS[tab.id] })),
        [canProcessPayments, canReviewEndOfDay, has, t]
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
        if (!preset) {
            setActiveDeskId(null);
            setSelectedRooms([]);
            setSelectedModalities([]);
            setSelectedScope('all');
            return;
        }
        setActiveDeskId(preset.id || null);

        const linkedRooms = (preset.roomIds || []).filter((roomId) =>
            availableRooms.some((room) => String(room.room) === String(roomId) || String(room.roomNumber) === String(roomId) || String(room.id) === String(roomId))
        );
        const presetScope = preset.scope && preset.scope !== 'all'
            ? preset.scope
            : (preset.roomIds || []).length > 0
                ? 'rooms'
                : (preset.modalityIds || []).length > 0 ? 'modalities' : 'all';
        if (presetScope === 'emergency') {
            setSelectedRooms([]);
            setSelectedModalities([]);
        } else if (presetScope === 'rooms') {
            setSelectedRooms(linkedRooms);
            setSelectedModalities([]);
        } else if (presetScope === 'modalities') {
            setSelectedRooms([]);
            setSelectedModalities((preset.modalityIds || []).map(String));
        } else {
            setSelectedRooms([]);
            setSelectedModalities([]);
        }
        setSelectedScope(presetScope);
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
        if (!canViewAppointments) {
            return { total: 0, mine: 0, unclaimed: 0, inExam: 0, emergency: 0, overdue: 0, attention: 0 };
        }

        const queueByAppointment = new Map();
        const queueByExam = new Map();
        (queueItems || []).forEach((item) => {
            if (item?.appointment_id) queueByAppointment.set(String(item.appointment_id), item);
            if (item?.exam_id) queueByExam.set(String(item.exam_id), item);
        });

        let mine = 0;
        let unclaimed = 0;
        let inExam = 0;
        let emergency = 0;
        let overdue = 0;
        let attention = 0;

        (appointments || []).forEach((appointment) => {
            const queue = queueByAppointment.get(String(appointment?.appointment_id))
                || queueByExam.get(String(appointment?.exam_id));
            const receptionistId = appointment?.receptionist_id ?? queue?.receptionist_id;
            const stage = queue?.queue_stage || appointment?.queue_stage || appointment?.status || 'Scheduled';
            const priority = appointment?.priority || queue?.priority || 'Routine';
            const urgent = ['Emergency', 'Urgent'].includes(priority);
            const isOverdue = Boolean(queue?.is_overdue);
            const isUnclaimed = !receptionistId && ['Scheduled', 'Arrived'].includes(stage);

            if (String(receptionistId ?? '') === String(currentUserId ?? '')) mine += 1;
            if (isUnclaimed) unclaimed += 1;
            if (stage === 'In Exam' || appointment?.status === 'In Exam') inExam += 1;
            if (urgent) emergency += 1;
            if (isOverdue) overdue += 1;
            if (urgent || isOverdue || isUnclaimed) attention += 1;
        });

        return {
            total: appointments?.length || 0,
            mine,
            unclaimed,
            inExam,
            emergency,
            overdue,
            attention,
        };
    }, [appointments, queueItems, currentUserId, canViewAppointments]);

    useEffect(() => {
        const endOfDayTabIsAllowed = activeTab === 'end-of-day' && canReviewEndOfDay;
        if (!tabs.some((tab) => tab.id === activeTab) && !endOfDayTabIsAllowed) {
            const next = new URLSearchParams(searchParams);
            next.set('tab', tabs[0]?.id || 'schedule');
            setSearchParams(next, { replace: true });
        }
    }, [activeTab, canReviewEndOfDay, tabs, searchParams, setSearchParams]);

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
        if (!tabs.some((tab) => tab.id === nextTab) && !(nextTab === 'end-of-day' && canReviewEndOfDay)) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', nextTab);
        setSearchParams(nextParams);
    }, [canReviewEndOfDay, searchParams, setSearchParams, tabs]);

    const handleTabIntent = useCallback((nextTab) => {
        TAB_COMPONENTS[nextTab]?.preload?.();
    }, []);

    useEffect(() => {
        const onShortcut = (event) => {
            if (!event.altKey || event.ctrlKey || event.metaKey) return;
            const target = event.target;
            const typing = target instanceof HTMLInputElement
                || target instanceof HTMLTextAreaElement
                || target instanceof HTMLSelectElement
                || target?.isContentEditable;
            if (typing) return;

            const key = event.key.toLowerCase();
            const tabByKey = { '1': 'schedule', '2': 'patients', '3': 'cashier', '4': 'billing' };
            if (tabByKey[key] && tabs.some((tab) => tab.id === tabByKey[key])) {
                event.preventDefault();
                handleTabChange(tabByKey[key]);
                return;
            }
            if (key === 'b' && has('CREATE_APPOINTMENTS')) {
                event.preventDefault();
                navigate(buildNewAppointmentUrl());
                return;
            }
            if (key === 'r') {
                event.preventDefault();
                handleRefresh();
            }
        };
        window.addEventListener('keydown', onShortcut);
        return () => window.removeEventListener('keydown', onShortcut);
    }, [buildNewAppointmentUrl, handleRefresh, handleTabChange, has, navigate, tabs]);

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
        <div className="mx-auto max-w-[1720px] space-y-4 pb-10 sm:space-y-5">
            {hasDataError && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-900/60 dark:bg-[#1a080c]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 mt-0.5">
                        <AlertTriangle size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-rose-800 dark:text-rose-200">
                            {t('states.partialDataTitle')}
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-rose-600/80 dark:text-rose-300/80">
                            {t('states.partialDataHint', { sources: dataErrors.map(({ source }) => source).join(isArabic ? '\u060c ' : ', ') })}
                        </p>
                    </div>
                </div>
            )}
            <PageHeader
                compact
                logoUrl={centerLogo}
                icon={Building2}
                eyebrowIcon={Sparkles}
                eyebrow={t('command.live', { defaultValue: 'Reception Command Center' })}
                title={t('title', { defaultValue: 'Patient Reception & Operations' })}
                description={`${displayDate} · ${t('command.signedIn', { name: user?.name || user?.fullName || t('fallback.staff') })}`}
                metrics={[
                    {
                        key: 'unclaimed',
                        icon: ClipboardCheck,
                        label: t('command.metricUnclaimed', 'Unclaimed'),
                        value: workstationCounts.unclaimed,
                        tone: workstationCounts.unclaimed > 0 ? 'amber' : 'teal',
                        detail: t('command.metricUnclaimedDetail', 'Awaiting first claim'),
                    },
                    {
                        key: 'inExam',
                        icon: Clock,
                        label: t('command.metricInExam', 'In exam'),
                        value: workstationCounts.inExam,
                        tone: 'teal',
                    },
                    {
                        key: 'attention',
                        icon: AlertTriangle,
                        label: t('command.metricAttention', 'Needs attention'),
                        value: workstationCounts.attention,
                        tone: workstationCounts.attention > 0 ? 'rose' : 'slate',
                    },
                    {
                        key: 'total',
                        icon: UsersRound,
                        label: t('command.metricTotal', 'Today'),
                        value: workstationCounts.total,
                        tone: 'slate',
                    },
                ]}
                metricsLabel={t('command.metricsLabel', 'Reception workload indicators')}
                meta={<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300"><span className={`h-2 w-2 rounded-full bg-emerald-500 ${isWorkspaceFetching || isRefreshing ? 'animate-pulse' : ''}`} />{isWorkspaceFetching || isRefreshing ? t('command.updating') : t('command.online')}</span>}
                actions={(
                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                        {/* Quick Date Stepper */}
                        <div className="flex min-h-10 sm:min-h-11 items-center rounded-xl border border-slate-200 bg-white p-0.5 sm:p-1 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <button
                                type="button"
                                onClick={() => shiftDate(-1)}
                                title={t('previousDay')}
                                aria-label={t('previousDay')}
                                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                <ChevronLeft size={16} className="rtl:rotate-180" />
                            </button>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                                required
                                className="h-9 min-w-0 border-none bg-transparent px-1 text-xs font-black text-slate-800 outline-hidden dark:text-slate-200 sm:px-2"
                            />
                            <button
                                type="button"
                                onClick={() => shiftDate(1)}
                                title={t('nextDay')}
                                aria-label={t('nextDay')}
                                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                <ChevronRight size={16} className="rtl:rotate-180" />
                            </button>
                            {!isToday && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedDate(toLocalDateInput())}
                                    className="ms-1 rounded-xl bg-teal-500/10 px-2.5 py-1 text-[10.5px] font-black text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition"
                                >
                                    {t('dateToday')}
                                </button>
                            )}
                        </div>

                        {(canViewAppointments || canViewInvoices || has('VIEW_PATIENTS')) && <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={isRefreshing || isStockRefreshing || isWorkspaceFetching}
                            title={t('command.refresh', { defaultValue: 'Refresh' })}
                            className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={15} className={isRefreshing || isStockRefreshing || isWorkspaceFetching ? 'animate-spin' : ''} />
                        </button>}

                        {has('CREATE_APPOINTMENTS') && <button
                            type="button"
                            onClick={registration.open}
                            className="inline-flex h-10 sm:h-11 items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-slate-200 bg-white px-3 sm:px-4 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <UserPlus size={15} />
                            <span>{t('command.addPatient', { defaultValue: 'Add Patient' })}</span>
                        </button>}

                        {has('CREATE_APPOINTMENTS') && (
                            <button
                                type="button"
                                onClick={() => navigate(buildNewAppointmentUrl())}
                                className="inline-flex h-10 sm:h-11 items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-teal-600 px-3.5 sm:px-5 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                            >
                                <CalendarPlus size={15} />
                                <span>{t('booking.title', { defaultValue: 'Book Appointment' })}</span>
                            </button>
                        )}
                    </div>
                )}
            />


            {/* Sticky operational control deck: navigation + workstation in one compact surface. */}
            <div className="sticky top-2 z-40 overflow-visible space-y-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-md dark:border-slate-800 dark:bg-[#070e1a] sm:top-3 sm:rounded-3xl sm:p-2.5">
                <ReceptionTabNav
                    activeTab={activeTab}
                    cashierPending={canUseCashier ? cashierPending.length : 0}
                    scheduleCount={canViewAppointments ? scheduleSummary.booked || 0 : 0}
                    onTabChange={handleTabChange}
                    onTabIntent={handleTabIntent}
                    tabs={tabs}
                    t={t}
                />

                {canViewAppointments && ['schedule', 'cashier'].includes(activeTab) && (
                    <ReceptionWorkstationBar
                        activeDesk={activeDesk}
                        activeDeskId={activeDeskId}
                        onDeskChange={handleDeskChange}
                        selectedScope={selectedScope}
                        onScopeChange={handleWorkstationScopeChange}
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
                )}
            </div>

            {/* Main Tab Workspaces */}
            <main
                id={`reception-panel-${activeTab}`}
                className="w-full"
                role="tabpanel"
                aria-labelledby={`reception-tab-${activeTab}`}
                tabIndex={0}
            >
                <Suspense fallback={<WorkspaceFallback isArabic={isArabic} />}>
                {activeTab === 'schedule' && (
                    <ScheduleView
                        displayDate={displayDate}
                        appointments={appointments}
                        appLoading={appLoading}
                        scheduleSummary={scheduleSummary}
                        invoices={invoices}
                        createAppointmentInvoice={has('CREATE_INVOICES') ? createAppointmentInvoice : undefined}
                        moveQueue={moveQueue}
                        i18n={i18n}
                        t={t}
                        selectedDate={selectedDate}
                        queueItems={queueItems}
                        queueKpis={queueKpis}
                        canManageQueue={canManageQueue}
                        canDeliverResults={canDeliverResults}
                        canViewInvoices={canViewInvoices}
                        canManageWaitlist={has('MANAGE_WAITLIST')}
                        canCreateAppointments={has('CREATE_APPOINTMENTS')}
                        onQueueMove={moveQueue}
                        onPickup={setPickupTarget}
                        onRequestReport={requestReport}
                        isRequestingReport={isRequestingReport}
                        onDeferReport={deferReport}
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
                        hasActiveReceptionShift={Boolean(currentReceptionShift?.session_id)}
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
                        currentUserId={currentUserId}
                        invoices={invoices}
                        isLoadingShift={shiftFlow.isLoadingShift}
                        items={cashierPending}
                        receptionScope={selectedScope}
                        selectedRooms={selectedRooms}
                        selectedModalities={selectedModalities}
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

                {activeTab === 'billing' && (
                    <BillingTab
                        selectedDate={selectedDate}
                        receptionShift={currentReceptionShift}
                        currentUserId={currentUserId}
                        receptionScope={selectedScope}
                        onOpenPayment={paymentFlow.openPayment}
                    />
                )}
                {activeTab === 'end-of-day' && canReviewEndOfDay && (
                    <EndOfDayReview
                        embedded
                        sessionId={currentReceptionShift?.session_id ?? closedReceptionSessionId}
                        fromShiftClose={Boolean(closedReceptionSessionId)}
                        initialDate={closedReceptionShiftDate}
                        currentShift={currentReceptionShift}
                        onBack={() => handleTabChange('schedule')}
                    />
                )}

                {activeTab === 'end-of-day' && !canReviewEndOfDay && (
                    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/50 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                            <ShieldCheck size={22} />
                        </span>
                        <p className="text-sm font-black text-rose-800 dark:text-rose-200">
                            {isArabic ? 'غير مصرح' : 'Unauthorised'}
                        </p>
                        <p className="max-w-xs text-xs font-medium text-rose-700/80 dark:text-rose-300/80">
                            {isArabic
                                ? 'ليس لديك صلاحية الوصول إلى مراجعة نهاية الوردية.'
                                : 'You do not have permission to access End-of-Shift Review.'}
                        </p>
                    </div>
                )}

                </Suspense>
            </main>

            {/* Modals & Dialogs */}
            <UnifiedShiftCloseWizardModal
                isOpen={isCloseWizardOpen}
                onClose={() => setIsCloseWizardOpen(false)}
                currentReceptionShift={currentReceptionShift}
                currentCashierShift={shiftFlow?.currentShift}
                activeTasksCount={currentReceptionShift?.metrics?.active || 0}
                onSuccess={handleCloseWizardSuccess}
                isRtl={isArabic}
            />

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
                title={pickupTarget?.queue_stage === 'Images Ready'
                    ? t('pickup.imagesTitle', { defaultValue: 'Confirm Image Delivery' })
                    : t('pickup.title', { defaultValue: 'Confirm Report Delivery' })}
                message={pickupTarget?.queue_stage === 'Images Ready'
                    ? t('pickup.imagesDescription', {
                        patient: pickupTarget?.patient_name || (isArabic ? 'المريض' : 'Patient'),
                        mrn: pickupTarget?.mrn || '-',
                        defaultValue: 'Confirm delivery of images only for {{patient}} ({{mrn}}). No diagnostic report is included.'
                    })
                    : t('pickup.description', {
                        patient: pickupTarget?.patient_name || (isArabic ? 'المريض' : 'Patient'),
                        mrn: pickupTarget?.mrn || '-',
                    })}
                label={t('pickup.recipient', { defaultValue: 'Recipient Name' })}
                placeholder={pickupTarget?.queue_stage === 'Images Ready'
                    ? t('pickup.imagesRecipientPlaceholder', { defaultValue: 'Name of the person receiving the images...' })
                    : t('pickup.recipientPlaceholder', { defaultValue: 'Name of the person receiving the report...' })}
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
