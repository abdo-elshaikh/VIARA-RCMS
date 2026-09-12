import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    AlertTriangle,
    Cpu,
    Server,
    DoorClosed,
    FileSpreadsheet,
    Wrench,
    CheckCircle2,
    Clock3,
    RefreshCw,
    Network,
    Plus,
    Search,
    ChevronDown,
    ChevronUp,
    Edit3,
    Trash2,
    Download,
    Upload,
    Activity
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EquipmentRegistry from '../components/equipment/EquipmentRegistry';
import MaintenanceManager from '../components/equipment/MaintenanceManager';
import DowntimeManager from '../components/equipment/DowntimeManager';
import RoomManagement from '../components/settings/clinical/RoomManagement';
import RoomDetailsView from '../components/equipment/RoomDetailsView';
import ClinicalExportModal from '../components/equipment/ClinicalExportModal';
import ClinicalImportDialog from '../components/equipment/ClinicalImportDialog';
import { MachineDialog, emptyMachine } from '../components/settings/clinical/MachineManagement';
import { ExamDialog, emptyExam } from '../components/settings/clinical/ExamManagement';
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

const emptyRoomForm = {
    name: '',
    roomNumber: '',
    type: 'Imaging',
    floor: '',
    status: 'Active',
    notes: ''
};

const Equipment = () => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');
    const user = useSelector(selectCurrentUser);
    const canViewMaintenance = hasDeveloperOrAdminRole(user?.role) || user?.role === 'Technician';

    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const selectedRoomId = searchParams.get('roomId');

    const validTabs = ['matrix', 'rooms', 'registry', 'procedures', 'maintenance', 'downtime'];
    const activeTab = validTabs.includes(tabParam) ? tabParam : 'matrix';

    const setActiveTab = (tab) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
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
    const [expandedRoomIds, setExpandedRoomIds] = useState(new Set());
    const [expandedMachineIds, setExpandedMachineIds] = useState(new Set());

    // Procedures Filter
    const [procedureSearch, setProcedureSearch] = useState('');
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
    const activeMachines = machines.filter(m => (m.status || 'Active') === 'Active').length;
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
        const query = matrixSearch.trim().toLowerCase();
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
    }, [matrixData, matrixSearch]);

    // Filtered procedures catalog
    const filteredProcedures = useMemo(() => {
        return exams.filter(exam => {
            const matchesSearch = !procedureSearch.trim() ||
                exam.name?.toLowerCase().includes(procedureSearch.toLowerCase()) ||
                exam.code?.toLowerCase().includes(procedureSearch.toLowerCase()) ||
                exam.body_part?.toLowerCase().includes(procedureSearch.toLowerCase()) ||
                exam.room_number?.toLowerCase().includes(procedureSearch.toLowerCase()) ||
                exam.modality_name?.toLowerCase().includes(procedureSearch.toLowerCase());

            const matchesModality = procedureModalityFilter === 'all' ||
                exam.modality_id === procedureModalityFilter ||
                exam.modality_type === procedureModalityFilter;

            const matchesContrast = procedureContrastFilter === 'all' ||
                (procedureContrastFilter === 'contrast' && exam.contrast_required) ||
                (procedureContrastFilter === 'plain' && !exam.contrast_required);

            return matchesSearch && matchesModality && matchesContrast;
        });
    }, [exams, procedureSearch, procedureModalityFilter, procedureContrastFilter]);

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
            toast.error(isArabic ? 'يرجى إدخال اسم الغرفة ورقمها' : 'Room name and number required');
            return;
        }
        try {
            if (editingRoom) {
                await updateRoom({
                    id: editingRoom.room_id,
                    ...roomForm
                }).unwrap();
                toast.success(isArabic ? 'تم تحديث بيانات الجناح بنجاح' : 'Suite updated successfully');
            } else {
                await createRoom(roomForm).unwrap();
                toast.success(isArabic ? 'تم إنشاء الجناح السريري بنجاح' : 'Clinical suite created successfully');
            }
            setIsRoomCreateOpen(false);
            setEditingRoom(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (isArabic ? 'فشل حفظ الغرفة' : 'Failed to save room'));
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
        try {
            if (editingMachine) {
                await updateMachine({
                    id: editingMachine.modality_id,
                    ...machineForm
                }).unwrap();
                toast.success(isArabic ? 'تم تحديث مواصفات الجهاز' : 'Machine updated successfully');
            } else {
                await createMachine(machineForm).unwrap();
                toast.success(isArabic ? 'تم تسجيل الجهاز الطبي بنجاح' : 'Machine registered successfully');
            }
            setIsMachineModalOpen(false);
            setEditingMachine(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (isArabic ? 'فشل حفظ الجهاز' : 'Failed to save machine'));
        }
    };

    const handleDeleteMachine = async () => {
        if (!machineDeleteTarget) return;
        try {
            await deleteMachine(machineDeleteTarget.modality_id).unwrap();
            toast.success(isArabic ? 'تم حذف الجهاز بنجاح' : 'Machine deleted successfully');
            setMachineDeleteTarget(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (isArabic ? 'تعذر حذف الجهاز' : 'Failed to delete machine'));
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
        try {
            const payload = {
                modalityId: examForm.modalityId,
                code: examForm.code?.trim() || undefined,
                name: examForm.name?.trim(),
                price: Number(examForm.price),
                durationMinutes: Number(examForm.durationMinutes),
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
                toast.success(isArabic ? 'تم تحديث بيانات الفحص بنجاح' : 'Procedure updated successfully');
            } else {
                await createExam(payload).unwrap();
                toast.success(isArabic ? 'تم إنشاء الفحص الطبي بنجاح' : 'Procedure created successfully');
            }
            setIsExamModalOpen(false);
            setEditingExam(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (isArabic ? 'فشل حفظ الفحص' : 'Failed to save procedure'));
        }
    };

    const handleDeleteExam = async () => {
        if (!examDeleteTarget) return;
        try {
            await deleteExam(examDeleteTarget.type_id).unwrap();
            toast.success(isArabic ? 'تم حذف الفحص بنجاح' : 'Procedure deleted successfully');
            setExamDeleteTarget(null);
            refreshHeader();
        } catch (err) {
            toast.error(err?.data?.error || err?.data?.message || (isArabic ? 'تعذر حذف الفحص' : 'Failed to delete procedure'));
        }
    };

    const tabs = useMemo(() => [
        { id: 'matrix', icon: Network, label: isArabic ? 'الخريطة السريرية الهرمية' : 'Hierarchy Matrix', count: matrixData?.rooms?.length },
        { id: 'rooms', icon: DoorClosed, label: isArabic ? 'الأجنحة والغرف السريرية' : 'Rooms & Suites', count: rooms.length },
        { id: 'registry', icon: Server, label: isArabic ? 'سجل الأجهزة والمعدات' : 'Equipment Fleet', count: machines.length },
        { id: 'procedures', icon: FileSpreadsheet, label: isArabic ? 'كتالوج الفحوصات الطبية' : 'Procedures Catalog', count: exams.length },
        { id: 'maintenance', icon: Wrench, label: isArabic ? 'الصيانة الوقائية' : 'Maintenance', visible: canViewMaintenance, count: scheduledMaintenance || null },
        { id: 'downtime', icon: AlertTriangle, label: isArabic ? 'سجلات الأعطال' : 'Downtime Logs', visible: true, count: activeDowntime || null },
    ].filter(tab => tab.visible !== false), [isArabic, matrixData, rooms.length, machines.length, exams.length, canViewMaintenance, scheduledMaintenance, activeDowntime]);

    const safeTab = activeTab === 'maintenance' && !canViewMaintenance ? 'matrix' : activeTab;

    return (
        <main className="mx-auto max-w-[1700px] space-y-6 pb-12">
            {/* Standard UI Consistency Compliant PageHeader */}
            <PageHeader
                icon={Server}
                eyebrowIcon={Cpu}
                eyebrow={isArabic ? 'إدارة العمليات والأصول السريرية الشاملة' : 'Comprehensive Clinical Operations Hub'}
                title={isArabic ? 'مركز إدارة المعدات والغرف والفحوصات' : 'Equipment, Rooms & Procedures Command Center'}
                description={isArabic
                    ? 'مركز تشغيلي موحد يربط الأجنحة والغرف السريرية بأسطول الأجهزة والوحدات الإشعاعية وكتالوج الفحوصات الطبية، مع متابعة الصيانة الدورية وسجلات الأعطال ودعم الاستيراد والتصدير الفوري.'
                    : 'A unified clinical management center bridging suites, modalities, exam catalogs, preventive maintenance, and downtime tracking in one seamless operational space.'}
                actions={(
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Import & Export buttons */}
                        <button
                            type="button"
                            onClick={() => { setImportDefaultType(safeTab === 'procedures' ? 'procedures' : safeTab === 'registry' ? 'machines' : 'rooms'); setIsImportModalOpen(true); }}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            title={isArabic ? 'استيراد بيانات من ملف CSV' : 'Import from CSV'}
                        >
                            <Upload size={14} className="text-teal-600" />
                            {isArabic ? 'استيراد CSV' : 'Import'}
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsExportModalOpen(true)}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            title={isArabic ? 'تصدير البيانات بصيغة CSV أو JSON' : 'Export Data'}
                        >
                            <Download size={14} className="text-cyan-600" />
                            {isArabic ? 'تصدير' : 'Export'}
                        </button>

                        {/* Creation buttons */}
                        <button
                            type="button"
                            onClick={handleOpenCreateRoom}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-50 px-3 text-xs font-black text-teal-800 shadow-sm transition-all hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-200"
                        >
                            <Plus size={14} />
                            {isArabic ? 'إضافة جناح' : 'New Suite'}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenCreateMachine()}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-50 px-3 text-xs font-black text-cyan-800 shadow-sm transition-all hover:bg-cyan-100 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200"
                        >
                            <Plus size={14} />
                            {isArabic ? 'تسجيل جهاز' : 'New Machine'}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenCreateExam()}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-black text-white shadow-md shadow-teal-600/20 transition-all hover:bg-teal-700"
                        >
                            <Plus size={14} />
                            {isArabic ? 'إضافة فحص' : 'New Procedure'}
                        </button>
                        <button
                            type="button"
                            onClick={refreshHeader}
                            disabled={headerFetching}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                            title={isArabic ? 'تحديث كافة الأصول والبيانات' : 'Refresh All Assets'}
                        >
                            <RefreshCw size={14} className={headerFetching ? 'animate-spin' : ''} />
                            {isArabic ? 'تحديث' : 'Refresh'}
                        </button>
                    </div>
                )}
                metrics={[
                    { key: 'rooms', icon: DoorClosed, label: isArabic ? 'الأجنحة والغرف' : 'Suites & Rooms', value: `${activeRooms}/${rooms.length}`, tone: 'teal', loading: headerLoading, error: roomsQuery.isError },
                    { key: 'total', icon: Cpu, label: isArabic ? 'الأجهزة والوحدات' : 'Total Modalities', value: machines.length, tone: 'cyan', loading: headerLoading, error: machinesQuery.isError },
                    { key: 'active', icon: CheckCircle2, label: isArabic ? 'أجهزة نشطة' : 'Active Modalities', value: activeMachines, tone: 'emerald', loading: headerLoading, error: machinesQuery.isError },
                    { key: 'exams', icon: FileSpreadsheet, label: isArabic ? 'فحوصات معتمدة' : 'Clinical Procedures', value: exams.length, tone: 'blue', loading: examsQuery.isLoading, error: examsQuery.isError },
                    { key: 'maintenance', icon: Clock3, label: isArabic ? 'صيانة مفتوحة' : 'Maintenance', value: scheduledMaintenance, tone: scheduledMaintenance ? 'amber' : 'emerald', loading: headerLoading, error: maintenanceQuery.isError },
                    { key: 'downtime', icon: AlertTriangle, label: isArabic ? 'أعطال نشطة' : 'Active Outages', value: activeDowntime, tone: activeDowntime ? 'rose' : 'emerald', loading: headerLoading, error: downtimeQuery.isError },
                ]}
                metricsLabel={isArabic ? 'مؤشرات العمليات والأصول السريرية' : 'Clinical operations and assets indicators'}
            />

            {/* Segmented Tab Navigation Bar */}
<div data-workspace-tabs className="rounded-3xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <nav className="flex gap-2 overflow-x-auto p-1 scrollbar-none" aria-label="Equipment & Clinical Hub Sections">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = safeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                    if (tab.id !== 'rooms' && selectedRoomId) {
                                        handleSelectRoom(null);
                                    }
                                    setActiveTab(tab.id);
                                }}
                                aria-current={active ? 'page' : undefined}
                                className={`flex shrink-0 items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-xs font-black transition-all ${
                                    active
                                        ? 'border-teal-500/40 bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                                        : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-800'
                                }`}
                            >
                                <Icon size={16} />
                                <span>{tab.label}</span>
                                {tab.count !== undefined && tab.count !== null && (
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                        active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Views */}
            <div className="transition-all duration-300">
                {/* 1. HIERARCHY MATRIX */}
                {safeTab === 'matrix' && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="relative flex-1 min-w-[240px]">
                                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                <input
                                    type="text"
                                    value={matrixSearch}
                                    onChange={(e) => setMatrixSearch(e.target.value)}
                                    placeholder={isArabic
                                        ? 'بحث شامل في الغرف، الأجهزة، والفحوصات...'
                                        : 'Search across rooms, modalities, and procedures...'}
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
                                    {isArabic ? 'توسيع الكل' : 'Expand All'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setExpandedRoomIds(new Set()); setExpandedMachineIds(new Set()); }}
                                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    {isArabic ? 'طي الكل' : 'Collapse All'}
                                </button>
                            </div>
                        </div>

                        {matrixQuery.isLoading ? (
                            <div className="p-16 text-center text-xs font-bold text-slate-400 animate-pulse">
                                {isArabic ? 'جاري بناء خريطة الأصول السريرية الهرمية...' : 'Loading operational hierarchy matrix...'}
                            </div>
                        ) : matrixRooms.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                                <Network className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                                <p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-400">
                                    {isArabic ? 'لا توجد أجنحة مطابقة لمعايير البحث' : 'No matching elements found'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {matrixRooms.map(room => {
                                    const isRoomExpanded = expandedRoomIds.has(room.room_id) || Boolean(matrixSearch.trim());
                                    const roomMachines = room.machines || [];

                                    return (
                                        <div
                                            key={room.room_id}
                                            className="rounded-3xl border border-slate-200/80 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                                        >
                                            <div
                                                onClick={() => toggleRoomExpand(room.room_id)}
                                                className="flex flex-wrap items-center justify-between gap-3 p-5 cursor-pointer select-none bg-gradient-to-r from-slate-50/70 to-transparent dark:from-slate-800/40"
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
                                                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                                                                room.status === 'Active'
                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                                            }`}>
                                                                {room.status === 'Active' ? (isArabic ? 'نشط' : 'Active') : (isArabic ? 'صيانة' : 'Maintenance')}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                                            <span>{room.type}</span>
                                                            {room.floor && <span>• {isArabic ? `الطابق: ${room.floor}` : `Floor: ${room.floor}`}</span>}
                                                            <span>• {roomMachines.length} {isArabic ? 'أجهزة مثبتة' : 'machines'}</span>
                                                            <span>• {room.total_procedures || 0} {isArabic ? 'فحوصات متاحة' : 'procedures'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleSelectRoom(room.room_id); }}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                    >
                                                        <Activity size={12} className="text-teal-600" />
                                                        {isArabic ? 'تفاصيل الجناح' : 'Details'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleOpenCreateMachine(room); }}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300"
                                                    >
                                                        <Plus size={13} />
                                                        {isArabic ? 'تثبيت جهاز' : 'Install Unit'}
                                                    </button>
                                                    <span className="text-slate-400 p-1">
                                                        {isRoomExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </span>
                                                </div>
                                            </div>

                                            {isRoomExpanded && (
                                                <div className="border-t border-slate-100 bg-slate-50/40 p-5 dark:border-slate-800/80 dark:bg-slate-950/30 space-y-3">
                                                    {roomMachines.length === 0 ? (
                                                        <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-400 dark:border-slate-800">
                                                            {isArabic ? 'لا توجد أجهزة مثبتة في هذا الجناح حالياً' : 'No equipment assigned to this suite.'}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenCreateMachine(room)}
                                                                className="mt-2 block mx-auto text-teal-600 font-black hover:underline"
                                                            >
                                                                {isArabic ? '+ تسجيل وربط جهاز بالجناح' : '+ Add equipment to suite'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        roomMachines.map(machine => {
                                                            const isMachineExpanded = expandedMachineIds.has(machine.modality_id) || Boolean(matrixSearch.trim());
                                                            const procedures = machine.procedures || [];

                                                            return (
                                                                <div
                                                                    key={machine.modality_id}
                                                                    className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
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
                                                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                                                                        machine.status === 'Active'
                                                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                                                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                                                                    }`}>
                                                                                        {machine.status}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="mt-0.5 text-xs text-slate-400 font-semibold">
                                                                                    {[machine.manufacturer, machine.model, machine.serial_number ? `SN: ${machine.serial_number}` : null].filter(Boolean).join(' • ')}
                                                                                    <span className="ms-2 font-bold text-slate-600 dark:text-slate-300">
                                                                                        ({procedures.length} {isArabic ? 'فحوصات' : 'procedures'})
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
                                                                                {isArabic ? 'إضافة فحص' : 'Add Procedure'}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); handleOpenEditMachine(machine); }}
                                                                                className="p-1 text-slate-400 hover:text-slate-600"
                                                                                title={isArabic ? 'تعديل الجهاز' : 'Edit Machine'}
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
                                                                                    {isArabic ? 'لا توجد فحوصات مسندة لهذا الجهاز بعد' : 'No procedures configured for this modality yet.'}
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
                                                                                                        {proc.duration_minutes} {isArabic ? 'دقيقة' : 'min'}
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
                                                                                                    {isArabic ? 'تعديل' : 'Edit'}
                                                                                                </button>
                                                                                                <span className="text-slate-300">•</span>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => setExamDeleteTarget(proc)}
                                                                                                    className="text-[11px] font-bold text-rose-600 hover:underline"
                                                                                                >
                                                                                                    {isArabic ? 'حذف' : 'Delete'}
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
                        />
                    ) : (
                        <RoomManagement
                            onSelectRoomForMachine={handleOpenCreateMachine}
                            onViewRoomDetails={(room) => handleSelectRoom(room.room_id)}
                        />
                    )
                )}

                {/* 3. EQUIPMENT REGISTRY */}
                {safeTab === 'registry' && (
                    <EquipmentRegistry />
                )}

                {/* 4. PROCEDURES CATALOG */}
                {safeTab === 'procedures' && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="relative flex-1 min-w-[220px]">
                                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                <input
                                    type="text"
                                    value={procedureSearch}
                                    onChange={(e) => setProcedureSearch(e.target.value)}
                                    placeholder={isArabic ? 'بحث باسم الفحص، الكود، العضو، أو الجهاز...' : 'Search procedure by name, code, anatomy...'}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 ps-9 pe-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={procedureModalityFilter}
                                    onChange={(e) => setProcedureModalityFilter(e.target.value)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                                >
                                    <option value="all">{isArabic ? 'كافة الأجهزة والوحدات' : 'All Modalities'}</option>
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
                                    <option value="all">{isArabic ? 'كل متطلبات الصبغة' : 'All Contrast'}</option>
                                    <option value="contrast">{isArabic ? 'يتطلب صبغة فقط' : 'Contrast Required'}</option>
                                    <option value="plain">{isArabic ? 'بدون صبغة' : 'Non-Contrast'}</option>
                                </select>

                                <button
                                    type="button"
                                    onClick={() => handleOpenCreateExam()}
                                    className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700"
                                >
                                    <Plus size={15} />
                                    {isArabic ? 'إضافة فحص جديد' : 'New Procedure'}
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredProcedures.map(exam => (
                                <div
                                    key={exam.type_id}
                                    className={`flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${
                                        exam.is_active === false ? 'opacity-70 bg-slate-50' : ''
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-start justify-between gap-2 mb-2.5">
                                            <span className="font-mono text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                                {exam.code || 'NO-CODE'}
                                            </span>
                                            <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                                                ${Number(exam.price || 0).toFixed(2)}
                                            </span>
                                        </div>

                                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{exam.name}</h4>
                                        <p className="mt-1 text-xs text-slate-400 font-semibold">
                                            {exam.modality_name} {exam.room_number ? `(غرفة ${exam.room_number})` : ''} • <span className="text-slate-600 dark:text-slate-300">{exam.body_part || 'General'}</span>
                                        </p>

                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                <Clock3 size={12} className="text-slate-400" />
                                                {exam.duration_minutes} {isArabic ? 'دقيقة إجبارية' : 'min duration'}
                                            </span>
                                            {exam.contrast_required && (
                                                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                                    {isArabic ? 'يتطلب صبغة' : 'Contrast'}
                                                </span>
                                            )}
                                        </div>

                                        {exam.preparation_instructions && (
                                            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                                <span className="font-bold text-slate-700 dark:text-slate-300">{isArabic ? 'التحضير:' : 'Prep:'}</span> {exam.preparation_instructions}
                                            </p>
                                        )}
                                    </div>

                                    <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => handleOpenEditExam(exam)}
                                            className="text-xs font-bold text-teal-600 hover:underline inline-flex items-center gap-1"
                                        >
                                            <Edit3 size={13} />
                                            {isArabic ? 'تعديل الفحص' : 'Edit Procedure'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setExamDeleteTarget(exam)}
                                            className="text-xs font-bold text-rose-600 hover:underline inline-flex items-center gap-1"
                                        >
                                            <Trash2 size={13} />
                                            {isArabic ? 'حذف' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
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

            {/* Quick Room Create / Edit Modal */}
            <Modal
                isOpen={isRoomCreateOpen}
                onClose={() => { setIsRoomCreateOpen(false); setEditingRoom(null); }}
                title={editingRoom
                    ? (isArabic ? 'تعديل بيانات الجناح السريري' : 'Edit Suite')
                    : (isArabic ? 'تسجيل جناح / غرفة سريرية جديدة' : 'Register New Suite')}
                size="md"
            >
                <form onSubmit={handleSaveRoom} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {isArabic ? 'اسم الغرفة أو الجناح السريري *' : 'Room / Suite Name *'}
                        </label>
                        <input
                            type="text"
                            required
                            value={roomForm.name}
                            onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                            placeholder={isArabic ? 'مثال: جناح الرنين المغناطيسي 2' : 'e.g. MRI Suite 2'}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {isArabic ? 'كود / رقم الغرفة *' : 'Room Identifier *'}
                            </label>
                            <input
                                type="text"
                                required
                                value={roomForm.roomNumber}
                                onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value.toUpperCase() })}
                                placeholder="e.g. MRI-02"
                                className="w-full font-mono rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {isArabic ? 'الطابق / القسم' : 'Floor / Wing'}
                            </label>
                            <input
                                type="text"
                                value={roomForm.floor}
                                onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                                placeholder={isArabic ? 'مثال: الطابق الأول' : 'e.g. 1st Floor'}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {isArabic ? 'تصنيف الغرفة' : 'Room Type'}
                            </label>
                            <select
                                value={roomForm.type}
                                onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            >
                                <option value="Imaging">{isArabic ? 'جناح تصوير إشعاعي' : 'Imaging Suite'}</option>
                                <option value="Preparation">{isArabic ? 'غرفة تحضير وحقن' : 'Preparation & Injection'}</option>
                                <option value="Recovery">{isArabic ? 'غرفة إفاقة وملاحظة' : 'Post-Exam Recovery'}</option>
                                <option value="Reporting">{isArabic ? 'غرفة قراءة وتشخيص' : 'Diagnostic Reading Room'}</option>
                                <option value="Consultation">{isArabic ? 'عيادة استشارات' : 'Clinical Consultation'}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {isArabic ? 'الحالة التشغيلية' : 'Status'}
                            </label>
                            <select
                                value={roomForm.status}
                                onChange={(e) => setRoomForm({ ...roomForm, status: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            >
                                <option value="Active">{isArabic ? 'نشط ومتاح' : 'Active & Available'}</option>
                                <option value="Under Maintenance">{isArabic ? 'قيد الصيانة والتعقيم' : 'Under Maintenance'}</option>
                                <option value="Out of Service">{isArabic ? 'خارج الخدمة مؤقتاً' : 'Out of Service'}</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {isArabic ? 'ملاحظات وتجهيزات الجناح' : 'Facility Notes'}
                        </label>
                        <textarea
                            rows={3}
                            value={roomForm.notes}
                            onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })}
                            placeholder={isArabic ? 'مثال: عزل رصاصي، قفص فاراداي، حاقن صبغة آلي...' : 'e.g. RF shielding, automated injector...'}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={() => { setIsRoomCreateOpen(false); setEditingRoom(null); }}
                            className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                            {isArabic ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            disabled={isBusy}
                            className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50"
                        >
                            {isBusy ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : (isArabic ? 'حفظ الجناح' : 'Save Suite')}
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
                title={isArabic ? 'حذف الجهاز الطبي' : 'Delete Machine'}
                message={isArabic
                    ? `هل أنت متأكد من حذف الجهاز "${machineDeleteTarget?.name}"؟ سيتم فحص ارتباطه بالفحوصات والمواعيد أولاً.`
                    : `Are you sure you want to delete machine "${machineDeleteTarget?.name}"?`}
                confirmLabel={isArabic ? 'تأكيد الحذف' : 'Confirm Delete'}
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
                title={isArabic ? 'حذف الفحص الطبي' : 'Delete Procedure'}
                message={isArabic
                    ? `هل أنت متأكد من حذف الفحص "${examDeleteTarget?.name}"؟`
                    : `Are you sure you want to delete procedure "${examDeleteTarget?.name}"?`}
                confirmLabel={isArabic ? 'تأكيد الحذف' : 'Confirm Delete'}
                tone="danger"
            />

            {/* Clinical Export Modal */}
            <ClinicalExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                rooms={rooms}
                machines={machines}
                exams={exams}
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
