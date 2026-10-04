import React, { useState, useMemo } from 'react';
import {
    DoorClosed,
    Plus,
    Search,
    Edit3,
    Trash2,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Server,
    Layers,
    Activity,
    FileText,
    ChevronRight,
    Sparkles
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import {
    useGetRoomsQuery,
    useCreateRoomMutation,
    useUpdateRoomMutation,
    useDeleteRoomMutation
} from '../../../store/api';
import Modal from '../../ui/Modal';
import ConfirmDialog from '../../ui/ConfirmDialog';

const ROOM_TYPES = [
    { value: 'Imaging', labelEn: 'Imaging Suite', labelAr: 'جناح تصوير إشعاعي' },
    { value: 'Preparation', labelEn: 'Preparation & Injection', labelAr: 'غرفة تحضير وحقن' },
    { value: 'Recovery', labelEn: 'Post-Exam Recovery', labelAr: 'غرفة إفاقة وملاحظة' },
    { value: 'Reporting', labelEn: 'Diagnostic Reading Room', labelAr: 'غرفة قراءة وتشخيص' },
    { value: 'Consultation', labelEn: 'Clinical Consultation', labelAr: 'عيادة استشارات' },
];

const ROOM_STATUSES = [
    { value: 'Active', labelEn: 'Active & Available', labelAr: 'نشط ومتاح للخدمة', tone: 'emerald' },
    { value: 'Under Maintenance', labelEn: 'Under Maintenance', labelAr: 'قيد الصيانة والتعقيم', tone: 'amber' },
    { value: 'Out of Service', labelEn: 'Out of Service', labelAr: 'خارج الخدمة مؤقتاً', tone: 'rose' },
];

const emptyRoomForm = {
    name: '',
    roomNumber: '',
    type: 'Imaging',
    floor: '',
    status: 'Active',
    notes: ''
};

export const RoomManagement = ({ onSelectRoomForMachine, onViewRoomDetails, t: propT, canManage = false }) => {
    const { t: hookT, i18n } = useTranslation('settings');
    const t = typeof propT === 'function' ? propT : hookT;
    const isArabic = i18n.language?.startsWith('ar');

    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [editingRoom, setEditingRoom] = useState(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [roomForm, setRoomForm] = useState(emptyRoomForm);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const { data: rooms = [], isLoading, isFetching, refetch } = useGetRoomsQuery();
    const [createRoom, { isLoading: isCreating }] = useCreateRoomMutation();
    const [updateRoom, { isLoading: isUpdating }] = useUpdateRoomMutation();
    const [deleteRoom, { isLoading: isDeleting }] = useDeleteRoomMutation();

    const isBusy = isCreating || isUpdating || isDeleting;

    // Filtered rooms
    const filteredRooms = useMemo(() => {
        return rooms.filter(room => {
            const matchesQuery = !searchQuery.trim() ||
                room.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                room.room_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                room.floor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                room.notes?.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesType = typeFilter === 'All' || room.type === typeFilter;
            const matchesStatus = statusFilter === 'All' || room.status === statusFilter;

            return matchesQuery && matchesType && matchesStatus;
        });
    }, [rooms, searchQuery, typeFilter, statusFilter]);

    // KPI Metrics
    const kpis = useMemo(() => {
        const total = rooms.length;
        const active = rooms.filter(r => r.status === 'Active').length;
        const imaging = rooms.filter(r => r.type === 'Imaging').length;
        const maintenance = rooms.filter(r => r.status === 'Under Maintenance').length;
        const outOfService = rooms.filter(r => r.status === 'Out of Service').length;
        const totalMachines = rooms.reduce((acc, r) => acc + (Number(r.total_machines) || 0), 0);

        return { total, active, imaging, maintenance, outOfService, totalMachines };
    }, [rooms]);

    const handleOpenCreate = () => {
        if (!canManage) return;
        setRoomForm(emptyRoomForm);
        setEditingRoom(null);
        setIsCreateOpen(true);
    };

    const handleOpenEdit = (room) => {
        if (!canManage) return;
        setRoomForm({
            name: room.name || '',
            roomNumber: room.room_number || '',
            type: room.type || 'Imaging',
            floor: room.floor || '',
            status: room.status || 'Active',
            notes: room.notes || ''
        });
        setEditingRoom(room);
        setIsCreateOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!canManage) return;
        if (!roomForm.name.trim() || !roomForm.roomNumber.trim()) {
            toast.error(t('roomNameAndNumberAreRequired'));
            return;
        }

        try {
            if (editingRoom) {
                await updateRoom({
                    id: editingRoom.room_id,
                    ...roomForm
                }).unwrap();
                toast.success(t('roomUpdatedSuccessfully'));
            } else {
                await createRoom(roomForm).unwrap();
                toast.success(t('clinicalRoomCreatedSuccessfully'));
            }
            setIsCreateOpen(false);
            setEditingRoom(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.error || error?.data?.message || (t('failedToSaveRoom')));
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget || !canManage) return;
        try {
            await deleteRoom(deleteTarget.room_id).unwrap();
            toast.success(t('roomDeletedSuccessfully'));
            setDeleteTarget(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.error || error?.data?.message || (t('couldNotDeleteRoom')));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Action Ribbon */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <DoorClosed className="text-teal-600 dark:text-teal-400" size={22} />
                        {t('clinicalRoomsSuites')}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {t('configureImagingBaysPrepRecoveryRooms')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleOpenCreate}
                    disabled={!canManage}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-teal-600/20 transition-all hover:bg-teal-700 hover:shadow-teal-700/30"
                >
                    <Plus size={16} />
                    {t('registerNewSuite')}
                </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('searchByRoomNameNumberFloor')}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 ps-9 pe-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    >
                        <option value="All">{t('allRoomTypes')}</option>
                        {ROOM_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{isArabic ? t.labelAr : t.labelEn}</option>
                        ))}
                    </select>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    >
                        <option value="All">{t('allStatuses')}</option>
                        {ROOM_STATUSES.map(s => (
                            <option key={s.value} value={s.value}>{isArabic ? s.labelAr : s.labelEn}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Rooms & suites */}
            {isLoading ? (
                <div className="p-12 text-center text-xs font-bold text-slate-400 animate-pulse">{t('loadingClinicalRooms')}</div>
            ) : filteredRooms.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                    <DoorClosed className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                    <p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-400">{t('noClinicalRoomsFound')}</p>
                    <button type="button" onClick={handleOpenCreate} disabled={!canManage} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700"><Plus size={14} />{t('createARoomNow')}</button>
                </div>
            ) : (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {filteredRooms.map(room => {
                        const typeInfo = ROOM_TYPES.find(item => item.value === room.type);
                        const statusInfo = ROOM_STATUSES.find(item => item.value === room.status) || ROOM_STATUSES[0];
                        const machines = Array.isArray(room.machines) ? room.machines : [];
                        return (
                            <article key={room.room_id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"><DoorClosed size={18} /></span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-black text-slate-900 dark:text-white">{room.name}</h3>
                                            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{room.room_number}</span>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${room.status === 'Active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : room.status === 'Under Maintenance' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{isArabic ? statusInfo.labelAr : statusInfo.labelEn}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{isArabic ? typeInfo?.labelAr : typeInfo?.labelEn || room.type}{room.floor ? ` � ${room.floor}` : ''} � {machines.length} {t('installedUnitsX')}</p>
                                        {machines.length > 0 && <p className="mt-1 truncate text-xs text-slate-400">{machines.slice(0, 2).map(machine => `${machine.type} � ${machine.name}`).join('? ')}{machines.length > 2 ? ` +${machines.length - 2}` : ''}</p>}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1 sm:ps-3">
                                    <button type="button" onClick={() => onViewRoomDetails?.(room)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"><Activity size={13} />{t('detailsStats')}</button>
                                    <button type="button" onClick={() => handleOpenEdit(room)} disabled={!canManage} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"><Edit3 size={13} />{t('edit')}</button>
                                    <button type="button" onClick={() => setDeleteTarget(room)} disabled={!canManage} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"><Trash2 size={13} />{t('delete')}</button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
            {/* Create/Edit Room Modal */}
            <Modal
                isOpen={isCreateOpen}
                onClose={() => { setIsCreateOpen(false); setEditingRoom(null); }}
                title={editingRoom
                    ? (t('editClinicalSuite'))
                    : (t('registerClinicalSuite'))}
                size="md"
            >
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {t('roomSuiteName')}
                        </label>
                        <input
                            type="text"
                            required
                            value={roomForm.name}
                            onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                            placeholder={t('eGMain3tMriSuite')}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('roomIdentifierCode')}
                            </label>
                            <input
                                type="text"
                                required
                                value={roomForm.roomNumber}
                                onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value.toUpperCase() })}
                                placeholder="e.g. MRI-01"
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
                                onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                                placeholder={t('eGGroundFloorEast')}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('clinicalType')}
                            </label>
                            <select
                                value={roomForm.type}
                                onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                            >
                                {ROOM_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{isArabic ? t.labelAr : t.labelEn}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('operationalStatus')}
                            </label>
                            <select
                                value={roomForm.status}
                                onChange={(e) => setRoomForm({ ...roomForm, status: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                            >
                                {ROOM_STATUSES.map(s => (
                                    <option key={s.value} value={s.value}>{isArabic ? s.labelAr : s.labelEn}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {t('notesFacilities')}
                        </label>
                        <textarea
                            rows={3}
                            value={roomForm.notes}
                            onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })}
                            placeholder={t('eGRfShieldingAutomatedInjector')}
                            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={() => { setIsCreateOpen(false); setEditingRoom(null); }}
                            className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isBusy}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50"
                        >
                            {isBusy ? (t('saving')) : (t('saveSuite'))}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title={t('deleteClinicalRoom')}
                message={isArabic
                    ? `هل أنت متأكد من رغبتك في حذف الغرفة "${deleteTarget?.name}" (${deleteTarget?.room_number})؟ لن يتم الحذف إذا كانت الغرفة تحتوي على أجهزة مثبتة أو مواعيد تشغيلية.`
                    : `Are you sure you want to delete room "${deleteTarget?.name}" (${deleteTarget?.room_number})? Deletion is guarded against active equipment.`}
                confirmLabel={t('confirmDelete')}
                tone="danger"
            />
        </div>
    );
};

export default RoomManagement;
