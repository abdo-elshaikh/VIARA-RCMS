import React, { useMemo, useState, useCallback, useDeferredValue, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    AlertTriangle,
    Cpu,
    Server,
    DoorClosed,
    FileSpreadsheet,
    Wrench,
    Clock3,
    Network,
    Monitor,
    Plus,
    Search,
    ChevronDown,
    ChevronUp,
    Edit3,
    Trash2,
    Activity
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EquipmentRegistry from '../components/equipment/EquipmentRegistry';
import MaintenanceManager from '../components/equipment/MaintenanceManager';
import DowntimeManager from '../components/equipment/DowntimeManager';
import EquipmentWorkstationMapping from '../components/equipment/EquipmentWorkstationMapping';
import { EquipmentHeaderActions, EquipmentTabs } from '../components/equipment/EquipmentHeader';
import RoomManagement from '../components/settings/clinical/RoomManagement';
import RoomDetailsView from '../components/equipment/RoomDetailsView';
import ClinicalExportModal from '../components/equipment/ClinicalExportModal';
import ClinicalImportDialog from '../components/equipment/ClinicalImportDialog';
import { MachineDialog } from '../components/settings/clinical/MachineManagement';
import { ExamDialog } from '../components/settings/clinical/ExamManagement';
import { selectCurrentUser } from '../store/authSlice';
import { hasDeveloperOrAdminRole } from '../utils/roles';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { toast } from 'react-hot-toast';
import {
    useGetClinicalHierarchyMatrixQuery,
    useGetRoomsQuery,
    useGetMachinesQuery,
    useGetExamTypesQuery,
    useGetEquipmentMaintenanceQuery,
    useGetEquipmentDowntimeQuery,
    useCreateRoomMutation,
    useUpdateRoomMutation,
    useCreateMachineMutation,
    useUpdateMachineMutation,
    useDeleteMachineMutation,
    useCreateExamTypeMutation,
    useUpdateExamTypeMutation,
    useDeleteExamTypeMutation
} from '../store/api';
import {
    EQUIPMENT_STATUS,
    ROOM_TYPES,
    ROOM_STATUS,
    MACHINE_TYPES,
    MAINTENANCE_STATUS,
    DOWNTIME_STATUS,
    emptyRoomForm,
    emptyMachine,
    emptyExam,
    VALID_TABS
} from '../types/equipment';

const Equipment = () => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');
    const user = useSelector(selectCurrentUser);
    const permissions = useMemo(() => new Set(user?.permissions || []), [user?.permissions]);
    const canManageRooms = user?.role === 'Admin';
    const canManageEquipment = hasDeveloperOrAdminRole(user?.role) || permissions.has('MANAGE_EQUIPMENT');
    const canManageProcedures = hasDeveloperOrAdminRole(user?.role) || permissions.has('MANAGE_EXAM_CATALOG');
    const canViewMaintenance = user?.role === 'Admin' || user?.role === 'Technician';
    const canViewModality = ['Developer', 'Admin', 'Technician', 'Radiologist', 'Nurse'].includes(user?.role) || permissions.has('VIEW_QUEUE');

    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const selectedRoomId = searchParams.get('roomId');
    const [activeTabOverride, setActiveTabOverride] = useState(null);

    const activeTab = activeTabOverride || (VALID_TABS.includes(tabParam) ? tabParam : 'matrix');

    useEffect(() => {
        setActiveTabOverride(null);
    }, [tabParam]);

    const setActiveTab = (tab) => {
        setActiveTabOverride(tab);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            next.delete('roomId');
            return next;
        }, { replace: true });
    };

    const handleSelectRoom = (roomId) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (roomId) {
                next.set('tab', 'rooms');
                next.set('roomId', roomId);
            } else {
                next.delete('roomId');
            }
            return next;
        }, { replace: true });
    };

    // State for Hierarchy Matrix
    const [matrixSearch, setMatrixSearch] = useState('');
    const deferredMatrixSearch = useDeferredValue(matrixSearch);
    const [expandedRoomIds, setExpandedRoomIds] = useState(new Set());
    const [expandedMachineIds, setExpandedMachineIds] = useState(new Set());
    const hasAutoExpandedRoom = useRef(false);

    // Procedures Filter
    const [procedureSearch, setProcedureSearch] = useState('');
    const deferredProcedureSearch = useDeferredValue(procedureSearch);
    const [procedureModalityFilter, setProcedureModalityFilter] = useState('all');
    const [procedureContrastFilter, setProcedureContrastFilter] = useState('all');

    // Export & Import modals state
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importDefaultType, setImportDefaultType] = useState('rooms');

    // Room quick creation & editing modal
    const [isRoomCreateOpen, setIsRoomCreateOpen] = useState(false);
    const [editingRoom, setEditingRoom] = useState(null);
    const [roomForm, setRoomForm] = useState(emptyRoomForm);

    // Machine CRUD modal
    const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState(null);
    const [machineForm, setMachineForm] = useState(emptyMachine);
    const [machineDeleteTarget, setMachineDeleteTarget] = useState(null);

    // Exam CRUD modal
    const [isExamModalOpen, setIsExamModalOpen] = useState(false);
    const [editingExam, setEditingExam] = useState(null);
    const [examForm, setExamForm] = useState(emptyExam);
    const [examDeleteTarget, setExamDeleteTarget] = useState(null);

    // Queries
    const matrixQuery = useGetClinicalHierarchyMatrixQuery();
    const roomsQuery = useGetRoomsQuery();
    const machinesQuery = useGetMachinesQuery();
    const examsQuery = useGetExamTypesQuery({ includeInactive: true });
    const maintenanceQuery = useGetEquipmentMaintenanceQuery(undefined, { skip: !canViewMaintenance });
    const downtimeQuery = useGetEquipmentDowntimeQuery();

    const rooms = Array.isArray(roomsQuery.data) ? roomsQuery.data : [];
    const machines = Array.isArray(machinesQuery.data) ? machinesQuery.data : [];
    const exams = useMemo(() => Array.isArray(examsQuery.data) ? examsQuery.data : [], [examsQuery.data]);
    const maintenance = Array.isArray(maintenanceQuery.data) ? maintenanceQuery.data : [];
    const downtime = Array.isArray(downtimeQuery.data) ? downtimeQuery.data : [];
    const matrixData = matrixQuery.data;

    useEffect(() => {
        const firstRoomId = matrixData?.rooms?.[0]?.room_id;
        if (hasAutoExpandedRoom.current || !firstRoomId) return;
        hasAutoExpandedRoom.current = true;
        setExpandedRoomIds(previous => previous.size ? previous : new Set([firstRoomId]));
    }, [matrixData?.rooms]);

    // Mutations
    const [createRoom, { isLoading: creatingRoom }] = useCreateRoomMutation();
    const [updateRoom, { isLoading: updatingRoom }] = useUpdateRoomMutation();
    const [createMachine, { isLoading: creatingMachine }] = useCreateMachineMutation();
    const [updateMachine, { isLoading: updatingMachine }] = useUpdateMachineMutation();
    const [deleteMachine, { isLoading: deletingMachine }] = useDeleteMachineMutation();
    const [createExam, { isLoading: creatingExam }] = useCreateExamTypeMutation();
    const [updateExam, { isLoading: updatingExam }] = useUpdateExamTypeMutation();
    const [deleteExam, { isLoading: deletingExam }] = useDeleteExamTypeMutation();

    const isBusy = creatingRoom || updatingRoom || creatingMachine || updatingMachine || deletingMachine || creatingExam || updatingExam || deletingExam;

    // Header metrics
    const scheduledMaintenance = maintenance.filter(record => !['Completed', 'Cancelled'].includes(record.status)).length;
    const activeDowntime = downtime.filter(record => record.status !== 'Resolved').length;
    const activeRooms = rooms.filter(r => r.status === 'Active').length;

    const headerLoading = machinesQuery.isLoading || maintenanceQuery.isLoading || downtimeQuery.isLoading || roomsQuery.isLoading;
    const headerFetching = machinesQuery.isFetching || maintenanceQuery.isFetching || downtimeQuery.isFetching || roomsQuery.isFetching || matrixQuery.isFetching;

    const refreshHeader = () => {
        machinesQuery.refetch();
        roomsQuery.refetch();
        examsQuery.refetch();
        matrixQuery.refetch();
        if (canViewMaintenance) maintenanceQuery.refetch();
        downtimeQuery.refetch();
    };

    // Stable form handlers to prevent inline object creation
    const updateRoomForm = useCallback((field, value) => {
        setRoomForm(prev => ({ ...prev, [field]: value }));
    }, []);

    const updateMachineForm = useCallback((field, value) => {
        setMachineForm(prev => ({ ...prev, [field]: value }));
    }, []);

    const updateExamForm = useCallback((field, value) => {
        setExamForm(prev => ({ ...prev, [field]: value }));
    }, []);

    // Matrix toggles
    const toggleRoomExpand = (roomId) => {
        setExpandedRoomIds(prev => {
            const next = new Set(prev);
            if (next.has(roomId)) next.delete(roomId);
            else next.add(roomId);
            return next;
        });
    };

    const toggleMachineExpand = (machineId) => {
        setExpandedMachineIds(prev => {
            const next = new Set(prev);
            if (next.has(machineId)) next.delete(machineId);
            else next.add(machineId);
            return next;
        });
    };

    // Filtered matrix rooms
    const matrixRooms = useMemo(() => {
        const query = deferredMatrixSearch.trim().toLowerCase();
        if (!query || !matrixData?.rooms) return matrixData?.rooms || [];

        return matrixData.rooms.filter(room => {
            const roomMatches = room.name?.toLowerCase().includes(query) ||
                room.room_number?.toLowerCase().includes(query);

            const machineMatches = (room.machines || []).some(m =>
                m.name?.toLowerCase().includes(query) ||
                m.type?.toLowerCase().includes(query) ||
                (m.procedures || []).some(p => p.name?.toLowerCase().includes(query) || p.code?.toLowerCase().includes(query))
            );

            return roomMatches || machineMatches;
        });
    }, [matrixData, deferredMatrixSearch]);

    // Filtered procedures catalog
    const filteredProcedures = useMemo(() => {
        return exams.filter(exam => {
            const matchesSearch = !deferredProcedureSearch.trim() ||
                exam.name?.toLowerCase().includes(deferredProcedureSearch.toLowerCase()) ||
                exam.code?.toLowerCase().includes(deferredProcedureSearch.toLowerCase()) ||
                exam.body_part?.toLowerCase().includes(deferredProcedureSearch.toLowerCase()) ||
                exam.room_number?.toLowerCase().includes(deferredProcedureSearch.toLowerCase()) ||
                exam.modality_name?.toLowerCase().includes(deferredProcedureSearch.toLowerCase());

            const matchesModality = procedureModalityFilter === 'all' ||
                exam.modality_id === procedureModalityFilter ||
                exam.modality_type === procedureModalityFilter;

            const matchesContrast = procedureContrastFilter === 'all' ||
                (procedureContrastFilter === 'contrast' && exam.contrast_required) ||
                (procedureContrastFilter === 'plain' && !exam.contrast_required);

            return matchesSearch && matchesModality && matchesContrast;
        });
    }, [exams, deferredProcedureSearch, procedureModalityFilter, procedureContrastFilter]);

    // Modals handlers
    const handleOpenCreateRoom = () => {
        setRoomForm(emptyRoomForm);
        setEditingRoom(null);
        setIsRoomCreateOpen(true);
    };

    const handleOpenEditRoom = (room) => {
        setRoomForm({
            name: room.name || '',
            roomNumber: room.room_number || '',
            type: room.type || 'Imaging',
            floor: room.floor || '',
            status: room.status || 'Active',
            notes: room.notes || ''
        });
        setEditingRoom(room);
        setIsRoomCreateOpen(true);
    };

    const handleSaveRoom = async (e) => {
        e.preventDefault();
        if (!roomForm.name.trim() || !roomForm.roomNumber.trim()) {
            toast.error(t('roomNameAndNumberRequired'));
            return;
        }

        // Anti-duplication check: Room Number & Room Name
        const duplicateRoomNumber = rooms.find(r =>
            r.room_number?.trim().toLowerCase() === roomForm.roomNumber.trim().toLowerCase() &&
            r.room_id !== editingRoom?.room_id
        );
        if (duplicateRoomNumber) {
            toast.error(isArabic ? 'رقم الجناح/الغرفة مستخدم بالفعل' : 'Room/Suite identifier is already in use');
            return;
        }
        const duplicateRoomName = rooms.find(r =>
            r.name?.trim().toLowerCase() === roomForm.name.trim().toLowerCase() &&
            r.room_id !== editingRoom?.room_id
        );
        if (duplicateRoomName) {
            toast.error(isArabic ? 'اسم الجناح/الغرفة مستخدم بالفعل' : 'Room/Suite name is already in use');
            return;
        }

        try {
            if (editingRoom) {
                await updateRoom({
                    id: editingRoom.room_id,
                    ...roomForm
                }).unwrap();
                toast.success(t('suiteUpdatedSuccessfully'));
            } else {
                await createRoom(roomForm).unwrap();
                toast.success(t('clinicalSuiteCreatedSuccessfully'));
            }
            setIsRoomCreateOpen(false);
            setEditingRoom(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (t('failedToSaveRoom')));
        }
    };

    const handleOpenCreateMachine = (targetRoom = null) => {
        setMachineForm({
            ...emptyMachine,
            roomId: targetRoom?.room_id || '',
            roomNumber: targetRoom?.room_number || '',
            location: targetRoom?.floor ? (isArabic ? `الطابق ${targetRoom.floor}` : `Floor ${targetRoom.floor}`) : ''
        });
        setEditingMachine(null);
        setIsMachineModalOpen(true);
    };

    const handleOpenEditMachine = (machine) => {
        setMachineForm({
            name: machine.name || '',
            type: machine.type || 'MRI',
            roomId: machine.room_id || '',
            roomNumber: machine.room_number || '',
            serialNumber: machine.serial_number || '',
            manufacturer: machine.manufacturer || '',
            model: machine.model || '',
            installationDate: machine.installation_date ? machine.installation_date.split('T')[0] : '',
            location: machine.location || '',
            status: machine.status || 'Active'
        });
        setEditingMachine(machine);
        setIsMachineModalOpen(true);
    };

    const handleSaveMachine = async (e) => {
        e.preventDefault();
        if (!machineForm.name?.trim() || !machineForm.type?.trim()) {
            toast.error(t('machineNameAndTypeRequired'));
            return;
        }

        // Anti-duplication check: Machine Name & Serial Number
        const duplicateMachineName = machines.find(m =>
            m.name?.trim().toLowerCase() === machineForm.name?.trim().toLowerCase() &&
            m.modality_id !== editingMachine?.modality_id
        );
        if (duplicateMachineName) {
            toast.error(isArabic ? 'يوجد جهاز مسجل بالفعل بنفس الاسم' : 'A machine with this name already exists');
            return;
        }
        if (machineForm.serialNumber?.trim()) {
            const duplicateSerialNumber = machines.find(m =>
                m.serial_number?.trim().toLowerCase() === machineForm.serialNumber?.trim().toLowerCase() &&
                m.modality_id !== editingMachine?.modality_id
            );
            if (duplicateSerialNumber) {
                toast.error(isArabic ? 'الرقم التسلسلي مستخدم بالفعل لجهاز آخر' : 'This serial number is already in use by another machine');
                return;
            }
        }

        try {
            if (editingMachine) {
                await updateMachine({
                    id: editingMachine.modality_id,
                    ...machineForm
                }).unwrap();
                toast.success(t('machineUpdatedSuccessfully'));
            } else {
                await createMachine(machineForm).unwrap();
                toast.success(t('machineRegisteredSuccessfully'));
            }
            setIsMachineModalOpen(false);
            setEditingMachine(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (t('failedToSaveMachine')));
        }
    };

    const handleDeleteMachine = async () => {
        if (!machineDeleteTarget) return;
        try {
            await deleteMachine(machineDeleteTarget.modality_id).unwrap();
            toast.success(t('machineDeletedSuccessfully'));
            setMachineDeleteTarget(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (t('failedToDeleteMachine')));
        }
    };

    const handleOpenCreateExam = (targetMachine = null) => {
        setExamForm({
            ...emptyExam,
            modalityId: targetMachine?.modality_id || (machines[0]?.modality_id || ''),
            code: '',
            name: '',
            price: '',
            durationMinutes: '30',
            bodyPart: '',
            preparationInstructions: '',
            contrastRequired: false,
            isActive: true
        });
        setEditingExam(null);
        setIsExamModalOpen(true);
    };

    const handleOpenEditExam = (exam) => {
        setExamForm({
            modalityId: exam.modality_id || '',
            code: exam.code || '',
            name: exam.name || '',
            price: exam.price || '',
            durationMinutes: String(exam.duration_minutes || '30'),
            bodyPart: exam.body_part || '',
            preparationInstructions: exam.preparation_instructions || '',
            contrastRequired: Boolean(exam.contrast_required),
            isActive: exam.is_active !== false
        });
        setEditingExam(exam);
        setIsExamModalOpen(true);
    };

    const handleSaveExam = async (e) => {
        e.preventDefault();
        const price = Number(examForm.price);
        const durationMinutes = Number(examForm.durationMinutes);
        if (Number.isNaN(price) || price < 0) {
            toast.error(t('invalidPrice'));
            return;
        }
        if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
            toast.error(t('invalidDuration'));
            return;
        }
        if (!examForm.name?.trim()) {
            toast.error(t('procedureNameRequired'));
            return;
        }

        // Anti-duplication check: Procedure Code & Name per Modality
        if (examForm.code?.trim()) {
            const duplicateCode = exams.find(ex =>
                ex.code?.trim().toLowerCase() === examForm.code.trim().toLowerCase() &&
                ex.type_id !== editingExam?.type_id
            );
            if (duplicateCode) {
                toast.error(isArabic ? 'كود الفحص مستخدم بالفعل لفحص آخر' : 'Procedure code is already in use by another procedure');
                return;
            }
        }
        const duplicateName = exams.find(ex =>
            ex.name?.trim().toLowerCase() === examForm.name.trim().toLowerCase() &&
            ex.modality_id === examForm.modalityId &&
            ex.type_id !== editingExam?.type_id
        );
        if (duplicateName) {
            toast.error(isArabic ? 'يوجد فحص بنفس الاسم مسجل بالفعل على هذا الجهاز' : 'A procedure with this name is already registered for this modality');
            return;
        }

        try {
            const payload = {
                modalityId: examForm.modalityId,
                code: examForm.code?.trim() || undefined,
                name: examForm.name?.trim(),
                price,
                durationMinutes,
                bodyPart: examForm.bodyPart?.trim() || undefined,
                preparationInstructions: examForm.preparationInstructions?.trim() || undefined,
                contrastRequired: Boolean(examForm.contrastRequired),
                isActive: Boolean(examForm.isActive)
            };

            if (editingExam) {
                await updateExam({
                    id: editingExam.type_id,
                    ...payload
                }).unwrap();
                toast.success(t('procedureUpdatedSuccessfully'));
            } else {
                await createExam(payload).unwrap();
                toast.success(t('procedureCreatedSuccessfully'));
            }
            setIsExamModalOpen(false);
            setEditingExam(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (t('failedToSaveProcedure')));
        }
    };

    const handleDeleteExam = async () => {
        if (!examDeleteTarget) return;
        try {
            await deleteExam(examDeleteTarget.type_id).unwrap();
            toast.success(t('procedureDeletedSuccessfully'));
            setExamDeleteTarget(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (t('failedToDeleteProcedure')));
        }
    };

    const tabs = useMemo(() => [
        { id: 'matrix', icon: Network, label: t('hierarchyMatrix'), count: matrixData?.rooms?.length },
        { id: 'rooms', icon: DoorClosed, label: t('roomsSuites'), count: rooms.length },
        { id: 'workstations', icon: Monitor, label: t('receptionWorkstations') },
        { id: 'registry', icon: Server, label: t('equipmentFleet'), count: machines.length },
        { id: 'procedures', icon: FileSpreadsheet, label: t('proceduresCatalog'), count: exams.length },
        { id: 'maintenance', icon: Wrench, label: t('maintenance'), visible: canViewMaintenance, count: scheduledMaintenance || null },
        { id: 'downtime', icon: AlertTriangle, label: t('downtimeLogs'), visible: true, count: activeDowntime || null },
    ].filter(tab => tab.visible !== false), [t, matrixData, rooms.length, machines.length, exams.length, canViewMaintenance, scheduledMaintenance, activeDowntime]);

    const safeTab = activeTab === 'maintenance' && !canViewMaintenance ? 'matrix' : activeTab;

    return (
        <main className="mx-auto max-w-[1700px] space-y-5 pb-12">
            {/* Standard UI Consistency Compliant PageHeader */}
            <PageHeader
                icon={Server}
                eyebrowIcon={Cpu}
                eyebrow={t('comprehensiveClinicalOperationsHub')}
                title={t('equipmentFleet')}
                compact
                actions={(
                    <EquipmentHeaderActions
                        t={t}
                        safeTab={safeTab}
                        canManageRooms={canManageRooms}
                        canManageEquipment={canManageEquipment}
                        canManageProcedures={canManageProcedures}
                        canViewModality={canViewModality}
                        isArabic={isArabic}
                        headerFetching={headerFetching}
                        onImport={(tab) => {
                            setImportDefaultType(tab === 'procedures' ? 'procedures' : tab === 'registry' ? 'machines' : 'rooms');
                            setIsImportModalOpen(true);
                        }}
                        onExport={() => setIsExportModalOpen(true)}
                        onCreateRoom={handleOpenCreateRoom}
                        onCreateMachine={() => handleOpenCreateMachine()}
                        onCreateExam={() => handleOpenCreateExam()}
                        onRefresh={refreshHeader}
                    />
                )}
                metrics={[
                    { key: 'rooms', icon: DoorClosed, label: t('suitesRooms'), value: `${activeRooms}/${rooms.length}`, tone: 'teal', loading: headerLoading, error: roomsQuery.isError },
                    { key: 'total', icon: Cpu, label: t('totalModalities'), value: machines.length, tone: 'cyan', loading: headerLoading, error: machinesQuery.isError },
                    { key: 'maintenance', icon: Clock3, label: t('maintenanceX'), value: scheduledMaintenance, tone: scheduledMaintenance ? 'amber' : 'emerald', loading: headerLoading, error: maintenanceQuery.isError },
                    { key: 'downtime', icon: AlertTriangle, label: t('activeOutages'), value: activeDowntime, tone: activeDowntime ? 'rose' : 'emerald', loading: headerLoading, error: downtimeQuery.isError },
                ]}
                metricsLabel={t('clinicalOperationsAndAssetsIndicators')}
            />

            <div className="grid items-start gap-4 xl:grid-cols-[232px_minmax(0,1fr)]">
                <aside className="xl:sticky xl:top-4">
                    <EquipmentTabs
                        t={t}
                        tabs={tabs}
                        activeTab={safeTab}
                        onTabChange={setActiveTab}
                    />
                </aside>

                {/* Each section keeps its focused workflow while sharing this navigation frame. */}
                <div id="equipment-tabpanel" role="tabpanel" aria-labelledby={`equipment-tab-${safeTab}`} tabIndex={0} className="min-w-0 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40">
                {/* 1. HIERARCHY MATRIX */}
                {safeTab === 'matrix' && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="relative flex-1 min-w-[240px]">
                                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                <input
                                    type="text"
                                    value={matrixSearch}
                                    aria-label={t('searchAcrossRoomsModalitiesAndProcedures')}
                                    onChange={(e) => setMatrixSearch(e.target.value)}
                                    placeholder={t('searchAcrossRoomsModalitiesAndProcedures')}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 ps-9 pe-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!matrixData?.rooms) return;
                                        setExpandedRoomIds(new Set(matrixData.rooms.map(r => r.room_id)));
                                        const mIds = new Set();
                                        matrixData.rooms.forEach(r => (r.machines || []).forEach(m => mIds.add(m.modality_id)));
                                        setExpandedMachineIds(mIds);
                                    }}
                                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {t('expandAll')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setExpandedRoomIds(new Set()); setExpandedMachineIds(new Set()); }}
                                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {t('collapseAll')}
                                </button>
                            </div>
                        </div>

                        {matrixQuery.isLoading ? (
                            <div className="p-16 text-center text-xs font-bold text-slate-400 animate-pulse">
                                {t('loadingOperationalHierarchyMatrix')}
                            </div>
                        ) : matrixQuery.isError ? (
                            <div role="alert" className="rounded-3xl border border-rose-200 bg-rose-50/60 p-12 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
                                <AlertTriangle className="mx-auto text-rose-500" size={36} />
                                <p className="mt-3 text-sm font-bold text-rose-700 dark:text-rose-300">{t('matrixLoadError')}</p>
                                <button type="button" onClick={matrixQuery.refetch} className="mt-4 rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-white dark:border-rose-900 dark:text-rose-300 dark:hover:bg-slate-900">{t('retry')}</button>
                            </div>
                        ) : matrixRooms.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                                <Network className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                                <p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-400">
                                    {t('noMatchingElementsFound')}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {matrixRooms.map(room => {
                                    const isRoomExpanded = expandedRoomIds.has(room.room_id) || Boolean(deferredMatrixSearch.trim());
                                    const roomMachines = room.machines || [];

                                    return (
                                        <div
                                            key={room.room_id}
                                            className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all hover:border-teal-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-800"
                                        >
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => toggleRoomExpand(room.room_id)}
                                                onKeyDown={event => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        toggleRoomExpand(room.room_id);
                                                    }
                                                }}
                                                aria-expanded={isRoomExpanded}
                                                className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-teal-50/70 via-white to-transparent p-4 outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 dark:from-teal-950/30 dark:via-slate-900 dark:to-transparent sm:p-5"
                                            >
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300">
                                                        <DoorClosed size={20} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-mono text-xs font-black rounded-lg bg-slate-200/80 px-2 py-0.5 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                                                                {room.room_number}
                                                            </span>
                                                            <h3 className="text-base font-black text-slate-900 dark:text-white truncate">
                                                                {room.name}
                                                            </h3>
                                                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${room.status === 'Active'
                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                                                }`}>
                                                                {room.status === 'Active' ? (t('active')) : (t('maintenanceXX'))}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                                            <span>{room.type}</span>
                                                            {room.floor && <span>• {isArabic ? `الطابق: ${room.floor}` : `Floor: ${room.floor}`}</span>}
                                                            <span>• {roomMachines.length} {t('machines')}</span>
                                                            <span>• {room.total_procedures || 0} {t('procedures')}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleSelectRoom(room.room_id); }}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                    >
                                                        <Activity size={12} className="text-teal-600" />
                                                        {t('details')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleOpenCreateMachine(room); }}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300"
                                                    >
                                                        <Plus size={13} />
                                                        {t('installUnit')}
                                                    </button>
                                                    <span className="text-slate-400 p-1">
                                                        {isRoomExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </span>
                                                </div>
                                            </div>

                                            {isRoomExpanded && (
                                                <div className="border-t border-slate-100 bg-slate-50/40 p-3 dark:border-slate-800/80 dark:bg-slate-950/30 space-y-2">
                                                    {roomMachines.length === 0 ? (
                                                        <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-400 dark:border-slate-800">
                                                            {t('noEquipmentAssignedToThisSuite')}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenCreateMachine(room)}
                                                                className="mt-2 block mx-auto text-teal-600 font-black hover:underline"
                                                            >
                                                                {t('addEquipmentToSuite')}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        roomMachines.map(machine => {
                                                            const isMachineExpanded = expandedMachineIds.has(machine.modality_id) || Boolean(deferredMatrixSearch.trim());
                                                            const procedures = machine.procedures || [];

                                                            return (
                                                                <div
                                                                    key={machine.modality_id}
                                                                    className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                                                                >
                                                                    <div
                                                                        onClick={() => toggleMachineExpand(machine.modality_id)}
                                                                        className="flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
                                                                                <Server size={17} />
                                                                            </div>
                                                                            <div>
                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                    <span className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-400">
                                                                                        [{machine.type}]
                                                                                    </span>
                                                                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                                                                                        {machine.name}
                                                                                    </h4>
                                                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${machine.status === 'Active'
                                                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                                                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                                                                        }`}>
                                                                                        {machine.status}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="mt-0.5 text-xs text-slate-400 font-semibold">
                                                                                    {[machine.manufacturer, machine.model, machine.serial_number ? `SN: ${machine.serial_number}` : null].filter(Boolean).join(' • ')}
                                                                                    <span className="ms-2 font-bold text-slate-600 dark:text-slate-300">
                                                                                        ({procedures.length} {t('proceduresX')})
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); handleOpenCreateExam(machine); }}
                                                                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                                            >
                                                                                <Plus size={13} />
                                                                                {t('addProcedure')}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); handleOpenEditMachine(machine); }}
                                                                                className="p-1 text-slate-400 hover:text-slate-600"
                                                                                title={t('editMachine')}
                                                                            >
                                                                                <Edit3 size={15} />
                                                                            </button>
                                                                            <span className="text-slate-400 p-0.5">
                                                                                {isMachineExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {isMachineExpanded && (
                                                                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                                                                            {procedures.length === 0 ? (
                                                                                <div className="p-3 text-center text-xs text-slate-400 italic">
                                                                                    {t('noProceduresConfiguredForThisModality')}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                                                    {procedures.map(proc => (
                                                                                        <div
                                                                                            key={proc.type_id}
                                                                                            className="flex flex-col justify-between rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/50"
                                                                                        >
                                                                                            <div>
                                                                                                <div className="flex items-center justify-between gap-1 mb-1.5">
                                                                                                    <span className="font-mono text-[10px] font-bold text-slate-500">
                                                                                                        {proc.code || 'NO-CODE'}
                                                                                                    </span>
                                                                                                    <span className="font-mono text-xs font-bold text-emerald-600">
                                                                                                        ${Number(proc.price || 0).toFixed(0)}
                                                                                                    </span>
                                                                                                </div>

                                                                                                <h5 className="text-xs font-black text-slate-900 dark:text-white line-clamp-1">
                                                                                                    {proc.name}
                                                                                                </h5>

                                                                                                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                                                                                                    <span className="flex items-center gap-1">
                                                                                                        <Clock3 size={11} className="text-slate-400" />
                                                                                                        {proc.duration_minutes} {t('min')}
                                                                                                    </span>
                                                                                                    <span>{proc.body_part || 'General'}</span>
                                                                                                </div>
                                                                                            </div>

                                                                                            <div className="mt-2.5 flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-200/40">
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => handleOpenEditExam(proc)}
                                                                                                    className="text-[11px] font-bold text-teal-600 hover:underline"
                                                                                                >
                                                                                                    {t('edit')}
                                                                                                </button>
                                                                                                <span className="text-slate-300">•</span>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => setExamDeleteTarget(proc)}
                                                                                                    className="text-[11px] font-bold text-rose-600 hover:underline"
                                                                                                >
                                                                                                    {t('delete')}
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* 2. ROOMS & SUITES MANAGEMENT / DETAILS VIEW */}
                {safeTab === 'rooms' && (
                    selectedRoomId ? (
                        <RoomDetailsView
                            roomId={selectedRoomId}
                            onBack={() => handleSelectRoom(null)}
                            onEditRoom={handleOpenEditRoom}
                            onAddMachine={handleOpenCreateMachine}
                            onEditMachine={handleOpenEditMachine}
                            canManage={canManageRooms}
                        />
                    ) : (
                        <RoomManagement
                            onSelectRoomForMachine={handleOpenCreateMachine}
                            onViewRoomDetails={(room) => handleSelectRoom(room.room_id)}
                            canManage={canManageRooms}
                        />
                    )
                )}

                {safeTab === 'workstations' && <EquipmentWorkstationMapping />}

                {/* 3. EQUIPMENT REGISTRY */}
                {safeTab === 'registry' && (
                    <EquipmentRegistry />
                )}

                {/* 4. PROCEDURES CATALOG */}
                {safeTab === 'procedures' && (
                    <div className="space-y-4">
                        {/* Summary Ribbon */}
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                <FileSpreadsheet size={14} className="text-teal-600 dark:text-teal-400" />
                                <span>{isArabic ? 'إجمالي الفحوصات:' : 'Total Procedures:'}</span>
                                <strong className="text-slate-900 dark:text-white">{exams.length}</strong>
                            </div>
                            <div className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                <Activity size={14} className="text-emerald-600 dark:text-emerald-400" />
                                <span>{isArabic ? 'المتاحة سريرياً:' : 'Active:'}</span>
                                <strong className="text-slate-900 dark:text-white">{exams.filter(e => e.is_active !== false).length}</strong>
                            </div>
                            <div className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                <span>{isArabic ? 'تتطلب صبغة:' : 'Contrast Req:'}</span>
                                <strong className="text-slate-900 dark:text-white">{exams.filter(e => e.contrast_required).length}</strong>
                            </div>
                            <div className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                <span className="h-2 w-2 rounded-full bg-sky-500" />
                                <span>{isArabic ? 'بدون صبغة:' : 'Non-Contrast:'}</span>
                                <strong className="text-slate-900 dark:text-white">{exams.filter(e => !e.contrast_required).length}</strong>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="relative flex-1 min-w-[220px]">
                                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                <input
                                    type="text"
                                    value={procedureSearch}
                                    aria-label={t('searchProcedureByNameCodeAnatomy')}
                                    onChange={(e) => setProcedureSearch(e.target.value)}
                                    placeholder={t('searchProcedureByNameCodeAnatomy')}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 ps-9 pe-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={procedureModalityFilter}
                                    onChange={(e) => setProcedureModalityFilter(e.target.value)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                                >
                                    <option value="all">{t('allModalities')}</option>
                                    {machines.map(m => (
                                        <option key={m.modality_id} value={m.modality_id}>
                                            {m.name} ({m.type})
                                        </option>
                                    ))}
                                </select>

                                <select
                                    value={procedureContrastFilter}
                                    onChange={(e) => setProcedureContrastFilter(e.target.value)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                                >
                                    <option value="all">{t('allContrast')}</option>
                                    <option value="contrast">{t('contrastRequired')}</option>
                                    <option value="plain">{t('nonContrast')}</option>
                                </select>

                                <button
                                    type="button"
                                    onClick={() => handleOpenCreateExam()}
                                    className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700"
                                >
                                    <Plus size={15} />
                                    {t('newProcedureX')}
                                </button>
                            </div>
                        </div>

                        {filteredProcedures.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
                                <FileSpreadsheet className="mx-auto text-slate-300 dark:text-slate-600" size={34} aria-hidden="true" />
                                <p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-300">{t('noMatchingElementsFound')}</p>
                            </div>
                        ) : (
                        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                            {filteredProcedures.map(exam => {
                                const isMri = exam.modality_type?.includes('MRI') || exam.modality_name?.includes('MRI');
                                const isCt = exam.modality_type?.includes('CT') || exam.modality_name?.includes('CT');
                                const isXray = exam.modality_type?.includes('X-Ray') || exam.modality_type?.includes('XR') || exam.modality_name?.includes('X-Ray');
                                const isUs = exam.modality_type?.includes('US') || exam.modality_type?.includes('Ultrasound') || exam.modality_name?.includes('Ultrasound');
                                
                                const modalityBadgeClass = isMri
                                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-900/40'
                                    : isCt
                                        ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border border-cyan-200/60 dark:border-cyan-900/40'
                                        : isXray
                                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40'
                                            : isUs
                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/40'
                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/40';

                                return (
                                    <article key={exam.type_id} className={`flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between ${exam.is_active === false ? 'opacity-70 bg-slate-50/80 dark:bg-slate-950/50' : ''}`}>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="text-sm font-black text-slate-900 dark:text-white">{exam.name}</h4>
                                                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{exam.code || 'NO-CODE'}</span>
                                                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${modalityBadgeClass}`}>
                                                    {exam.modality_name || exam.modality_type || 'Modality'}
                                                </span>
                                                {exam.contrast_required ? (
                                                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/50 dark:border-rose-900/40">
                                                        {t('contrast')}
                                                    </span>
                                                ) : (
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                        {isArabic ? 'بدون صبغة' : 'Non-Contrast'}
                                                    </span>
                                                )}
                                                {exam.is_active === false && (
                                                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                                        {isArabic ? 'معطل مؤقتاً' : 'Inactive'}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                {exam.room_number ? `${isArabic ? 'غرفة' : 'Room'}: ${exam.room_number} · ` : ''}<span className="text-slate-700 dark:text-slate-300">{exam.body_part || 'General'}</span>
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                <span className="inline-flex items-center gap-1"><Clock3 size={12} className="text-slate-400" />{exam.duration_minutes} {t('minDuration')}</span>
                                                <span className="font-mono font-black text-emerald-700 dark:text-emerald-400">${Number(exam.price || 0).toFixed(2)}</span>
                                            </div>
                                            {exam.preparation_instructions && (
                                                <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                                    <summary className="w-fit cursor-pointer font-bold text-teal-700 dark:text-teal-400">{t('prep')}</summary>
                                                    <p className="mt-1 rounded-xl bg-slate-50 p-2.5 leading-5 dark:bg-slate-950/50 dark:text-slate-300">{exam.preparation_instructions}</p>
                                                </details>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1 sm:ps-3">
                                            <button type="button" onClick={() => handleOpenEditExam(exam)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40 transition">
                                                <Edit3 size={13} />
                                                {t('editProcedure')}
                                            </button>
                                            <button type="button" onClick={() => setExamDeleteTarget(exam)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 transition">
                                                <Trash2 size={13} />
                                                {t('delete')}
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                        )}
                    </div>
                )}

                {/* 5. PREVENTIVE MAINTENANCE */}
                {safeTab === 'maintenance' && (
                    <MaintenanceManager />
                )}

                {/* 6. DOWNTIME & INCIDENT LOGS */}
                {safeTab === 'downtime' && (
                    <DowntimeManager />
                )}
                </div>
            </div>

            {/* Quick Room Create / Edit Modal */}
            <Modal
                isOpen={isRoomCreateOpen}
                onClose={() => { setIsRoomCreateOpen(false); setEditingRoom(null); }}
                title={editingRoom
                    ? (t('editSuite'))
                    : (t('registerNewSuite'))}
                size="md"
            >
                <form onSubmit={handleSaveRoom} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {t('roomSuiteName')}
                        </label>
                        <input
                            type="text"
                            required
                            value={roomForm.name}
                            onChange={e => updateRoomForm('name', e.target.value)}
                            placeholder={t('eGMriSuite2')}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('roomIdentifier')}
                            </label>
                            <input
                                type="text"
                                required
                                value={roomForm.roomNumber}
                                onChange={e => updateRoomForm('roomNumber', e.target.value.toUpperCase())}
                                placeholder="e.g. MRI-02"
                                className="w-full font-mono rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('floorWing')}
                            </label>
                            <input
                                type="text"
                                value={roomForm.floor}
                                onChange={e => updateRoomForm('floor', e.target.value)}
                                placeholder={t('eG1stFloor')}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('roomType')}
                            </label>
                            <select
                                value={roomForm.type}
                                onChange={e => updateRoomForm('type', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            >
                                <option value="Imaging">{t('imagingSuite')}</option>
                                <option value="Preparation">{t('preparationInjection')}</option>
                                <option value="Recovery">{t('postExamRecovery')}</option>
                                <option value="Reporting">{t('diagnosticReadingRoom')}</option>
                                <option value="Consultation">{t('clinicalConsultation')}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('status')}
                            </label>
                            <select
                                value={roomForm.status}
                                onChange={e => updateRoomForm('status', e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            >
                                <option value="Active">{t('activeAvailable')}</option>
                                <option value="Under Maintenance">{t('underMaintenance')}</option>
                                <option value="Out of Service">{t('outOfService')}</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {t('facilityNotes')}
                        </label>
                        <textarea
                            rows={3}
                            value={roomForm.notes}
                            onChange={e => updateRoomForm('notes', e.target.value)}
                            placeholder={t('eGRfShieldingAutomatedInjector')}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={() => { setIsRoomCreateOpen(false); setEditingRoom(null); }}
                            className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isBusy}
                            className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50"
                        >
                            {isBusy ? (t('saving')) : (t('saveSuite'))}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Machine Create / Edit Dialog */}
            <MachineDialog
                open={isMachineModalOpen}
                editing={Boolean(editingMachine)}
                form={machineForm}
                setForm={setMachineForm}
                onClose={() => { setIsMachineModalOpen(false); setEditingMachine(null); }}
                onSave={handleSaveMachine}
                busy={isBusy}
                t={t}
            />

            {/* Machine Delete Confirmation */}
            <ConfirmDialog
                isOpen={Boolean(machineDeleteTarget)}
                onClose={() => setMachineDeleteTarget(null)}
                onConfirm={handleDeleteMachine}
                title={t('deleteMachine')}
                message={isArabic
                    ? `هل أنت متأكد من حذف الجهاز "${machineDeleteTarget?.name}"؟ سيتم فحص ارتباطه بالفحوصات والمواعيد أولاً.`
                    : `Are you sure you want to delete machine "${machineDeleteTarget?.name}"?`}
                confirmLabel={t('confirmDelete')}
                tone="danger"
            />

            {/* Exam Create / Edit Dialog */}
            <ExamDialog
                open={isExamModalOpen}
                editing={Boolean(editingExam)}
                form={examForm}
                setForm={setExamForm}
                machines={machines}
                onClose={() => { setIsExamModalOpen(false); setEditingExam(null); }}
                onSave={handleSaveExam}
                busy={isBusy}
                t={t}
            />

            {/* Exam Delete Confirmation */}
            <ConfirmDialog
                isOpen={Boolean(examDeleteTarget)}
                onClose={() => setExamDeleteTarget(null)}
                onConfirm={handleDeleteExam}
                title={t('deleteProcedure')}
                message={isArabic
                    ? `هل أنت متأكد من حذف الفحص "${examDeleteTarget?.name}"؟`
                    : `Are you sure you want to delete procedure "${examDeleteTarget?.name}"?`}
                confirmLabel={t('confirmDelete')}
                tone="danger"
            />

            {/* Clinical Export Modal */}
            <ClinicalExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                rooms={rooms}
                machines={machines}
                exams={exams}
                maintenance={maintenance}
                downtime={downtime}
                matrixData={matrixData}
            />

            {/* Clinical Import Dialog */}
            <ClinicalImportDialog
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                defaultType={importDefaultType}
                rooms={rooms}
                machines={machines}
                exams={exams}
                onSuccess={refreshHeader}
            />
        </main>
    );
};

export default Equipment;
