import React, { useState } from 'react';
import {
    DoorClosed,
    Server,
    FileSpreadsheet,
    Calendar,
    Clock3,
    ArrowLeft,
    ArrowRight,
    Edit3,
    Plus,
    Wrench,
    AlertTriangle,
    CheckCircle2,
    Printer,
    Contrast,
    FileText,
    Layers,
    Activity,
    Info,
    ShieldAlert,
    RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import {
    useGetRoomByIdQuery,
    useUpdateRoomMutation
} from '../../store/api';

export const RoomDetailsView = ({
    roomId,
    onBack,
    onEditRoom,
    onAddMachine,
    onEditMachine
}) => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');

    const [activeSection, setActiveSection] = useState('overview'); // overview | machines | procedures | schedule | specs

    const { data: room, isLoading, isError, refetch, isFetching } = useGetRoomByIdQuery(roomId, {
        skip: !roomId
    });
    const [updateRoom, { isLoading: updatingStatus }] = useUpdateRoomMutation();

    if (isLoading) {
        return (
            <div className="rounded-3xl border border-slate-200/80 bg-white p-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <DoorClosed className="mx-auto text-teal-600 animate-pulse" size={40} />
                <p className="mt-4 text-xs font-black text-slate-500">
                    {isArabic ? 'جاري تحميل تفاصيل وإحصائيات الجناح السريري...' : 'Loading clinical suite details & statistics...'}
                </p>
            </div>
        );
    }

    if (isError || !room) {
        return (
            <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-12 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
                <AlertTriangle className="mx-auto text-rose-500" size={36} />
                <h3 className="mt-3 text-sm font-black text-rose-900 dark:text-rose-200">
                    {isArabic ? 'تعذر تحميل بيانات الغرفة السريرية' : 'Unable to load room details'}
                </h3>
                <button
                    type="button"
                    onClick={onBack}
                    className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
                >
                    {isArabic ? 'الرجوع لسجل الغرف' : 'Back to Rooms List'}
                </button>
            </div>
        );
    }

    const machines = Array.isArray(room.machines) ? room.machines : [];
    const procedures = Array.isArray(room.procedures) ? room.procedures : [];
    const upcomingAppointments = Array.isArray(room.upcomingAppointments) ? room.upcomingAppointments : [];
    const stats = room.statistics || {
        totalMachines: machines.length,
        activeMachines: machines.filter(m => m.status === 'Active').length,
        totalProcedures: procedures.length,
        todayAppointmentsCount: 0,
        upcomingAppointmentsCount: upcomingAppointments.length
    };

    const handleToggleStatus = async () => {
        const newStatus = room.status === 'Active' ? 'Under Maintenance' : 'Active';
        try {
            await updateRoom({
                id: room.room_id,
                status: newStatus
            }).unwrap();
            toast.success(
                newStatus === 'Active'
                    ? (isArabic ? 'تم تفعيل الجناح للخدمة بنجاح' : 'Suite activated for service')
                    : (isArabic ? 'تم وضع الجناح قيد الصيانة والتعقيم' : 'Suite placed under maintenance')
            );
            refetch();
        } catch (error) {
            toast.error(error?.data?.error || error?.data?.message || (isArabic ? 'فشل تغيير حالة الغرفة' : 'Failed to toggle status'));
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            {/* Top Back & Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    {isArabic ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
                    {isArabic ? 'الرجوع لكافة الغرف والأجنحة' : 'Back to All Suites'}
                </button>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={refetch}
                        disabled={isFetching}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                        <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
                        {isArabic ? 'تحديث' : 'Refresh'}
                    </button>
                    <button
                        type="button"
                        onClick={handlePrint}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                        <Printer size={14} />
                        {isArabic ? 'طباعة البطاقة' : 'Print Sheet'}
                    </button>
                    <button
                        type="button"
                        onClick={handleToggleStatus}
                        disabled={updatingStatus}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black shadow-sm transition-all ${
                            room.status === 'Active'
                                ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                                : 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                        }`}
                    >
                        <Wrench size={14} />
                        {room.status === 'Active'
                            ? (isArabic ? 'تحويل الجناح للصيانة' : 'Set to Maintenance')
                            : (isArabic ? 'تفعيل الجناح للخدمة' : 'Activate Suite')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onEditRoom?.(room)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700"
                    >
                        <Edit3 size={14} />
                        {isArabic ? 'تعديل بيانات الجناح' : 'Edit Suite'}
                    </button>
                </div>
            </div>

            {/* Room Hero Overview Banner */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900">
                            <DoorClosed size={28} />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-black rounded-lg bg-slate-100 px-2.5 py-1 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                                    {room.room_number}
                                </span>
                                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {room.type}
                                </span>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black ${
                                    room.status === 'Active'
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${room.status === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                    {room.status === 'Active'
                                        ? (isArabic ? 'نشط ومتاح للحجز' : 'Active & Operational')
                                        : (isArabic ? 'قيد الصيانة والتعقيم' : 'Under Maintenance')}
                                </span>
                            </div>

                            <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                                {room.name}
                            </h1>

                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {room.floor && <span>{isArabic ? `الموقع: الطابق ${room.floor}` : `Location: Floor ${room.floor}`}</span>}
                                <span>• {isArabic ? `تم الإنشاء: ${new Date(room.created_at).toLocaleDateString()}` : `Created: ${new Date(room.created_at).toLocaleDateString()}`}</span>
                                {room.notes && <span className="text-slate-400">({room.notes})</span>}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onAddMachine?.(room)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
                        >
                            <Plus size={14} />
                            {isArabic ? 'تثبيت جهاز جديد بالجناح' : 'Install New Machine'}
                        </button>
                    </div>
                </div>

                {/* KPI Overview Strip */}
                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:grid-cols-4">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                            <Server size={14} className="text-teal-600" />
                            {isArabic ? 'الأجهزة والوحدات' : 'Installed Units'}
                        </div>
                        <div className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                            {stats.activeMachines}/{stats.totalMachines}
                            <span className="text-xs font-bold text-emerald-600 ms-1">
                                {isArabic ? 'جاهز' : 'ready'}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                            <FileSpreadsheet size={14} className="text-emerald-600" />
                            {isArabic ? 'الفحوصات المدعومة' : 'Procedures'}
                        </div>
                        <div className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                            {stats.totalProcedures}
                            <span className="text-xs font-bold text-slate-400 ms-1">
                                {isArabic ? 'فحص سريري' : 'exams'}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                            <Clock3 size={14} className="text-cyan-600" />
                            {isArabic ? 'مواعيد اليوم' : 'Today Schedule'}
                        </div>
                        <div className="mt-1.5 text-2xl font-black text-cyan-600 dark:text-cyan-400">
                            {stats.todayAppointmentsCount}
                            <span className="text-xs font-bold text-slate-400 ms-1">
                                {isArabic ? 'حالة' : 'booked'}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                            <Calendar size={14} className="text-indigo-600" />
                            {isArabic ? 'المواعيد القادمة' : 'Upcoming Scans'}
                        </div>
                        <div className="mt-1.5 text-2xl font-black text-indigo-600 dark:text-indigo-400">
                            {stats.upcomingAppointmentsCount}
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs for Details */}
            <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-800">
                {[
                    { id: 'overview', labelAr: 'الأجهزة المثبتة بالجناح', labelEn: 'Installed Modalities', count: machines.length, icon: Server },
                    { id: 'procedures', labelAr: 'الفحوصات الطبية المدعومة', labelEn: 'Supported Procedures', count: procedures.length, icon: FileSpreadsheet },
                    { id: 'schedule', labelAr: 'جدول المواعيد القادمة', labelEn: 'Upcoming Schedule', count: upcomingAppointments.length, icon: Clock3 },
                    { id: 'specs', labelAr: 'المواصفات الفنية والتجهيز', labelEn: 'Technical Facilities', icon: Info }
                ].map(tab => {
                    const Icon = tab.icon;
                    const active = activeSection === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveSection(tab.id)}
                            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                                active
                                    ? 'bg-teal-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                            }`}
                        >
                            <Icon size={15} />
                            <span>{isArabic ? tab.labelAr : tab.labelEn}</span>
                            {tab.count !== undefined && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* TAB CONTENT */}

            {/* 1. INSTALLED MODALITIES */}
            {activeSection === 'overview' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">
                            {isArabic ? 'الأجهزة والوحدات الإشعاعية المثبتة بهذا الجناح' : 'Equipment & Modalities installed in this Suite'}
                        </h3>
                        <button
                            type="button"
                            onClick={() => onAddMachine?.(room)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 hover:underline"
                        >
                            <Plus size={14} />
                            {isArabic ? 'تثبيت وحدة جديدة' : 'Add Machine'}
                        </button>
                    </div>

                    {machines.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                            <Server className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                            <p className="mt-3 text-xs font-bold text-slate-500">
                                {isArabic ? 'لا توجد أجهزة مثبتة في هذا الجناح حالياً' : 'No equipment currently installed in this suite'}
                            </p>
                            <button
                                type="button"
                                onClick={() => onAddMachine?.(room)}
                                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700"
                            >
                                <Plus size={14} />
                                {isArabic ? 'تثبيت أول جهاز الآن' : 'Install First Unit'}
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {machines.map(m => (
                                <div
                                    key={m.modality_id}
                                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                                >
                                    <div>
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <span className="font-mono text-xs font-black rounded-md bg-cyan-50 px-2 py-0.5 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                                                {m.type}
                                            </span>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                                                m.status === 'Active'
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                            }`}>
                                                {m.status}
                                            </span>
                                        </div>

                                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{m.name}</h4>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {[m.manufacturer, m.model].filter(Boolean).join(' ') || 'Standard Modality'}
                                        </p>

                                        <div className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500 dark:border-slate-800 space-y-1">
                                            {m.serial_number && <div><span className="font-bold text-slate-700 dark:text-slate-300">SN:</span> {m.serial_number}</div>}
                                            <div><span className="font-bold text-slate-700 dark:text-slate-300">{isArabic ? 'الفحوصات:' : 'Procedures:'}</span> {m.active_procedures_count || 0} {isArabic ? 'فحص معتمد' : 'configured'}</div>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => onEditMachine?.(m)}
                                            className="text-xs font-bold text-teal-600 hover:underline inline-flex items-center gap-1"
                                        >
                                            <Edit3 size={13} />
                                            {isArabic ? 'تعديل المواصفات' : 'Edit Unit'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 2. SUPPORTED PROCEDURES */}
            {activeSection === 'procedures' && (
                <div className="space-y-4">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        {isArabic ? 'الفحوصات والإجراءات الطبية المتاحة على أجهزة الجناح' : 'Clinical Procedures Supported on Suite Equipment'}
                    </h3>

                    {procedures.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                            <FileSpreadsheet className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                            <p className="mt-3 text-xs font-bold text-slate-500">
                                {isArabic ? 'لا توجد فحوصات معتمدة مسندة لأجهزة هذه الغرفة' : 'No procedures mapped to this suite'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {procedures.map(p => (
                                <div
                                    key={p.type_id}
                                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                                >
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <span className="font-mono text-[11px] font-bold text-slate-500">
                                                {p.code || 'NO-CODE'}
                                            </span>
                                            <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                                                ${Number(p.price || 0).toFixed(0)}
                                            </span>
                                        </div>

                                        <h4 className="text-xs font-black text-slate-900 dark:text-white">{p.name}</h4>
                                        <p className="mt-1 text-[11px] text-slate-400">
                                            {p.modality_name} • {p.body_part || 'General'}
                                        </p>

                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                <Clock3 size={11} />
                                                {p.duration_minutes} {isArabic ? 'دقيقة' : 'min'}
                                            </span>
                                            {p.contrast_required && (
                                                <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                                    <Contrast size={11} />
                                                    {isArabic ? 'صبغة' : 'Contrast'}
                                                </span>
                                            )}
                                        </div>

                                        {p.preparation_instructions && (
                                            <p className="mt-2 text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                                <span className="font-bold">{isArabic ? 'التحضير: ' : 'Prep: '}</span>
                                                {p.preparation_instructions}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 3. UPCOMING SCHEDULE */}
            {activeSection === 'schedule' && (
                <div className="space-y-4">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        {isArabic ? 'المواعيد والحجوزات القادمة في هذا الجناح السريري' : 'Upcoming Appointments in this Suite'}
                    </h3>

                    {upcomingAppointments.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                            <Clock3 className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                            <p className="mt-3 text-xs font-bold text-slate-500">
                                {isArabic ? 'لا توجد مواعيد مجدولة قادمة في هذا الجناح اليوم' : 'No upcoming bookings scheduled in this suite'}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                            <table className="w-full text-start text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-500 dark:bg-slate-950/50 dark:border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 text-start font-bold">{isArabic ? 'الوقت والتاريخ' : 'Time & Date'}</th>
                                        <th className="px-4 py-3 text-start font-bold">{isArabic ? 'المريض' : 'Patient'}</th>
                                        <th className="px-4 py-3 text-start font-bold">{isArabic ? 'الفحص الطبي' : 'Procedure'}</th>
                                        <th className="px-4 py-3 text-start font-bold">{isArabic ? 'الجهاز' : 'Modality'}</th>
                                        <th className="px-4 py-3 text-start font-bold">{isArabic ? 'الحالة' : 'Status'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {upcomingAppointments.map(appt => (
                                        <tr key={appt.appointment_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                            <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                                                {new Date(appt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                <span className="block text-[10px] text-slate-400 font-normal">
                                                    {new Date(appt.start_time).toLocaleDateString()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="font-bold text-slate-900 dark:text-white block">
                                                    {appt.patient_name || 'Anonymous'}
                                                </span>
                                                <span className="font-mono text-[10px] text-slate-400">
                                                    MRN: {appt.mrn || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                                                {appt.exam_name || 'Clinical Scan'}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-cyan-600 dark:text-cyan-400">
                                                {appt.modality_name || room.name}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                    {appt.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* 4. TECHNICAL FACILITIES & SPECS */}
            {activeSection === 'specs' && (
                <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-6">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        {isArabic ? 'المواصفات الفنية وتجهيزات السلامة بالجناح السريري' : 'Technical Specifications & Safety Facilities'}
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                <ShieldAlert size={16} className="text-teal-600" />
                                {isArabic ? 'تصنيف الغرفة السريري' : 'Clinical Room Classification'}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{room.type}</p>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                <Layers size={16} className="text-cyan-600" />
                                {isArabic ? 'الطابق والجناح' : 'Floor & Department Wing'}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">{room.floor || (isArabic ? 'غير محدد' : 'Unspecified')}</p>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                <Activity size={16} className="text-emerald-600" />
                                {isArabic ? 'الاستعداد التشغيلي' : 'Operational Readiness'}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                {room.status === 'Active' ? (isArabic ? 'جاهز ومعقم' : 'Sanitized & Ready') : (isArabic ? 'قيد التدقيق أو الصيانة' : 'Under Service')}
                            </p>
                        </div>
                    </div>

                    {room.notes && (
                        <div>
                            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                {isArabic ? 'ملاحظات التجهيز والمعدات المساعدة' : 'Notes & Auxiliary Equipment'}
                            </h4>
                            <div className="rounded-2xl border border-slate-200/60 bg-slate-50 p-4 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 leading-relaxed">
                                {room.notes}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RoomDetailsView;
