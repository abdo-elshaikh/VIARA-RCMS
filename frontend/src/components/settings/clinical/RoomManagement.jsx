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

export const RoomManagement = ({ onSelectRoomForMachine, onViewRoomDetails, t: propT }) => {
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
        setRoomForm(emptyRoomForm);
        setEditingRoom(null);
        setIsCreateOpen(true);
    };

    const handleOpenEdit = (room) => {
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
        if (!roomForm.name.trim() || !roomForm.roomNumber.trim()) {
            toast.error(isArabic ? 'يرجى إدخال اسم الغرفة ورقمها' : 'Room name and number are required');
            return;
        }

        try {
            if (editingRoom) {
                await updateRoom({
                    id: editingRoom.room_id,
                    ...roomForm
                }).unwrap();
                toast.success(isArabic ? 'تم تحديث بيانات الغرفة بنجاح' : 'Room updated successfully');
            } else {
                await createRoom(roomForm).unwrap();
                toast.success(isArabic ? 'تم إنشاء الغرفة السريرية بنجاح' : 'Clinical room created successfully');
            }
            setIsCreateOpen(false);
            setEditingRoom(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.error || error?.data?.message || (isArabic ? 'فشل حفظ بيانات الغرفة' : 'Failed to save room'));
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteRoom(deleteTarget.room_id).unwrap();
            toast.success(isArabic ? 'تم حذف الغرفة بنجاح' : 'Room deleted successfully');
            setDeleteTarget(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.error || error?.data?.message || (isArabic ? 'تعذر حذف الغرفة' : 'Could not delete room'));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Action Ribbon */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <DoorClosed className="text-teal-600 dark:text-teal-400" size={22} />
                        {isArabic ? 'إدارة الغرف والأجنحة السريرية' : 'Clinical Rooms & Suites'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {isArabic
                            ? 'تهيئة أجنحة التصوير وغرف التحضير والإفاقة، ومتابعة جاهزيتها التشغيلية والأجهزة المثبتة بداخلها'
                            : 'Configure imaging bays, prep/recovery rooms, track operational availability and installed equipment'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-teal-600/20 transition-all hover:bg-teal-700 hover:shadow-teal-700/30"
                >
                    <Plus size={16} />
                    {isArabic ? 'إضافة غرفة أو جناح سريري' : 'Register New Suite'}
                </button>
            </div>

            {/* Quick KPI Overview */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
                        <DoorClosed size={15} />
                        {isArabic ? 'إجمالي الأجنحة' : 'Total Rooms'}
                    </div>
                    <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{kpis.total}</div>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3.5 shadow-sm dark:border-emerald-950/60 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                        <CheckCircle2 size={15} />
                        {isArabic ? 'أجنحة نشطة' : 'Active Suites'}
                    </div>
                    <div className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{kpis.active}</div>
                </div>

                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-3.5 shadow-sm dark:border-cyan-950/60 dark:bg-cyan-950/20">
                    <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 text-xs font-bold">
                        <Layers size={15} />
                        {isArabic ? 'أجنحة أشعة' : 'Imaging Bays'}
                    </div>
                    <div className="mt-2 text-2xl font-black text-cyan-700 dark:text-cyan-300">{kpis.imaging}</div>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3.5 shadow-sm dark:border-amber-950/60 dark:bg-amber-950/20">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold">
                        <AlertTriangle size={15} />
                        {isArabic ? 'تحت الصيانة' : 'Maintenance'}
                    </div>
                    <div className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-300">{kpis.maintenance}</div>
                </div>

                <div className="col-span-2 sm:col-span-1 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3.5 shadow-sm dark:border-indigo-950/60 dark:bg-indigo-950/20">
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                        <Server size={15} />
                        {isArabic ? 'أجهزة مثبتة' : 'Installed Units'}
                    </div>
                    <div className="mt-2 text-2xl font-black text-indigo-700 dark:text-indigo-300">{kpis.totalMachines}</div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={isArabic ? 'بحث باسم الجناح، رقم الغرفة، أو الطابق...' : 'Search by room name, number, floor...'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 ps-9 pe-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    >
                        <option value="All">{isArabic ? 'كل أنواع الغرف' : 'All Room Types'}</option>
                        {ROOM_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{isArabic ? t.labelAr : t.labelEn}</option>
                        ))}
                    </select>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    >
                        <option value="All">{isArabic ? 'كافة الحالات' : 'All Statuses'}</option>
                        {ROOM_STATUSES.map(s => (
                            <option key={s.value} value={s.value}>{isArabic ? s.labelAr : s.labelEn}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Rooms Cards Grid */}
            {isLoading ? (
                <div className="p-12 text-center text-xs font-bold text-slate-400 animate-pulse">
                    {isArabic ? 'جاري تحميل سجل الغرف والأجنحة...' : 'Loading clinical rooms...'}
                </div>
            ) : filteredRooms.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                    <DoorClosed className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                    <p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-400">
                        {isArabic ? 'لا توجد أجنحة أو غرف مطابقة لمعايير البحث' : 'No clinical rooms found'}
                    </p>
                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700"
                    >
                        <Plus size={14} />
                        {isArabic ? 'إضافة جناح سريري جديد الآن' : 'Create a room now'}
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredRooms.map(room => {
                        const typeInfo = ROOM_TYPES.find(t => t.value === room.type);
                        const statusInfo = ROOM_STATUSES.find(s => s.value === room.status) || ROOM_STATUSES[0];
                        const machines = Array.isArray(room.machines) ? room.machines : [];

                        return (
                            <div
                                key={room.room_id}
                                className="group relative flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-teal-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                            >
                                <div>
                                    {/* Top badges */}
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                                                {room.room_number}
                                            </span>
                                            <span className="rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                                {isArabic ? typeInfo?.labelAr : typeInfo?.labelEn || room.type}
                                            </span>
                                        </div>

                                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                                            room.status === 'Active'
                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                : room.status === 'Under Maintenance'
                                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                        }`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${
                                                room.status === 'Active' ? 'bg-emerald-500' : room.status === 'Under Maintenance' ? 'bg-amber-500' : 'bg-rose-500'
                                            }`} />
                                            {isArabic ? statusInfo.labelAr : statusInfo.labelEn}
                                        </span>
                                    </div>

                                    {/* Name & Floor */}
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                                        {room.name}
                                    </h3>
                                    {room.floor && (
                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                            {isArabic ? `الطابق: ${room.floor}` : `Floor: ${room.floor}`}
                                        </p>
                                    )}

                                    {/* Installed Machines list */}
                                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
                                            <span className="flex items-center gap-1">
                                                <Server size={13} className="text-teal-600" />
                                                {isArabic ? 'الأجهزة والوحدات المثبتة' : 'Installed Units'}
                                            </span>
                                            <span className="font-mono text-[11px] font-black text-slate-700 dark:text-slate-300">
                                                {machines.length}
                                            </span>
                                        </div>

                                        {machines.length === 0 ? (
                                            <p className="text-[11px] italic text-slate-400 py-1">
                                                {isArabic ? 'لا توجد أجهزة مثبتة في هذه الغرفة' : 'No equipment currently assigned'}
                                            </p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {machines.map(m => (
                                                    <span
                                                        key={m.modality_id}
                                                        className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                    >
                                                        <span className="font-mono text-teal-600">[{m.type}]</span>
                                                        {m.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Notes if any */}
                                    {room.notes && (
                                        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                            {room.notes}
                                        </p>
                                    )}
                                </div>

                                {/* Actions Footer */}
                                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                                    <button
                                        type="button"
                                        onClick={() => onViewRoomDetails?.(room)}
                                        className="inline-flex items-center gap-1 text-xs font-black text-teal-600 hover:underline dark:text-teal-400"
                                    >
                                        <Activity size={13} />
                                        {isArabic ? 'التفاصيل والإحصائيات' : 'Details & Stats'} &rarr;
                                    </button>

                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleOpenEdit(room)}
                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                            title={isArabic ? 'تعديل' : 'Edit'}
                                        >
                                            <Edit3 size={13} />
                                            {isArabic ? 'تعديل' : 'Edit'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(room)}
                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                            title={isArabic ? 'حذف' : 'Delete'}
                                        >
                                            <Trash2 size={13} />
                                            {isArabic ? 'حذف' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create/Edit Room Modal */}
            <Modal
                isOpen={isCreateOpen}
                onClose={() => { setIsCreateOpen(false); setEditingRoom(null); }}
                title={editingRoom
                    ? (isArabic ? 'تعديل بيانات الجناح السريري' : 'Edit Clinical Suite')
                    : (isArabic ? 'تسجيل غرفة / جناح سريري جديد' : 'Register Clinical Suite')}
                size="md"
            >
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {isArabic ? 'اسم الغرفة أو الجناح السريري *' : 'Room / Suite Name *'}
                        </label>
                        <input
                            type="text"
                            required
                            value={roomForm.name}
                            onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                            placeholder={isArabic ? 'مثال: جناح الرنين المغناطيسي الرئيسي' : 'e.g. Main 3T MRI Suite'}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {isArabic ? 'كود / رقم الغرفة *' : 'Room Identifier / Code *'}
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
                                {isArabic ? 'الطابق / القسم' : 'Floor / Wing'}
                            </label>
                            <input
                                type="text"
                                value={roomForm.floor}
                                onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                                placeholder={isArabic ? 'مثال: الطابق الأرضي' : 'e.g. Ground Floor, East'}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {isArabic ? 'نوع الغرفة السريري' : 'Clinical Type'}
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
                                {isArabic ? 'الحالة التشغيلية' : 'Operational Status'}
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
                            {isArabic ? 'ملاحظات وتجهيزات الغرفة' : 'Notes & Facilities'}
                        </label>
                        <textarea
                            rows={3}
                            value={roomForm.notes}
                            onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })}
                            placeholder={isArabic ? 'مثال: قفص فاراداي كامل، حاقن صبغة آلي، إمدادات أكسجين...' : 'e.g. RF shielding, automated injector installed...'}
                            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={() => { setIsCreateOpen(false); setEditingRoom(null); }}
                            className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                            {isArabic ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            disabled={isBusy}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50"
                        >
                            {isBusy ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : (isArabic ? 'حفظ الجناح السريري' : 'Save Suite')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title={isArabic ? 'حذف الجناح السريري' : 'Delete Clinical Room'}
                message={isArabic
                    ? `هل أنت متأكد من رغبتك في حذف الغرفة "${deleteTarget?.name}" (${deleteTarget?.room_number})؟ لن يتم الحذف إذا كانت الغرفة تحتوي على أجهزة مثبتة أو مواعيد تشغيلية.`
                    : `Are you sure you want to delete room "${deleteTarget?.name}" (${deleteTarget?.room_number})? Deletion is guarded against active equipment.`}
                confirmLabel={isArabic ? 'تأكيد الحذف' : 'Confirm Delete'}
                tone="danger"
            />
        </div>
    );
};

export default RoomManagement;
