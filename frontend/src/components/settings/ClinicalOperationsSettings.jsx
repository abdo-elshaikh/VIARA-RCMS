import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    DoorClosed,
    Server,
    FileSpreadsheet,
    Wrench,
    Network,
    ExternalLink,
    CheckCircle2,
    Plus,
    Trash2,
    Pencil,
    Clock3,
    AlertTriangle,
    Sparkles,
    Layers,
    ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    useGetClinicalHierarchyMatrixQuery,
    useGetRoomsQuery,
    useGetMachinesQuery,
    useGetExamTypesQuery,
    useGetEquipmentMaintenanceQuery,
    useGetEquipmentDowntimeQuery,
    useGetCenterSettingsQuery,
    useUpdateCenterSettingsMutation
} from '../../store/api';
import { readWorkstationPresets, saveWorkstationPresets } from '../reception/workstationPresets';

const ClinicalOperationsSettings = () => {
    const { t, i18n } = useTranslation('settings');
    const isArabic = i18n.language?.startsWith('ar');

    const { data: rooms = [], isLoading: roomsLoading } = useGetRoomsQuery();
    const { data: machines = [], isLoading: machinesLoading } = useGetMachinesQuery();
    const { data: exams = [], isLoading: examsLoading } = useGetExamTypesQuery({ includeInactive: true });
    const { data: maintenance = [] } = useGetEquipmentMaintenanceQuery();
    const { data: downtime = [] } = useGetEquipmentDowntimeQuery();
    const { data: centerSettings, isLoading: centerSettingsLoading } = useGetCenterSettingsQuery();
    const [updateCenterSettings, { isLoading: isSavingWorkstations }] = useUpdateCenterSettingsMutation();
    const [workstationPresets, setWorkstationPresets] = useState(readWorkstationPresets);
    const [editingPresetId, setEditingPresetId] = useState(null);
    const [presetDraft, setPresetDraft] = useState({ label: '', roomIds: [] });

    const activeRooms = rooms.filter(r => r.status === 'Active').length;
    const activeMachines = machines.filter(m => (m.status || 'Active') === 'Active').length;
    const scheduledMaintenance = maintenance.filter(m => !['Completed', 'Cancelled'].includes(m.status)).length;
    const activeDowntime = downtime.filter(d => d.status !== 'Resolved').length;

    useEffect(() => {
        if (Array.isArray(centerSettings?.workstation_presets) && centerSettings.workstation_presets.length > 0) {
            setWorkstationPresets(centerSettings.workstation_presets);
        }
    }, [centerSettings?.workstation_presets]);

    const openPresetEditor = (preset = null) => {
        setEditingPresetId(preset?.id || 'new');
        setPresetDraft({ label: preset?.label || '', roomIds: preset?.roomIds || [] });
    };

    const savePresetDraft = () => {
        const label = presetDraft.label.trim();
        if (!label) return;
        setWorkstationPresets((current) => editingPresetId === 'new'
            ? [...current, { id: `custom-${Date.now()}`, label, icon: '🩺', descAr: 'محطة استقبال مخصصة', descEn: 'Custom reception workstation', roomIds: [], scope: 'all' }]
            : current.map((preset) => preset.id === editingPresetId ? { ...preset, label } : preset));
        setEditingPresetId(null);
    };

    const deletePreset = (presetId) => {
        if (workstationPresets.length <= 1) return;
        setWorkstationPresets((current) => current.filter((preset) => preset.id !== presetId));
    };

    const handleSaveWorkstationPresets = async () => {
        try {
            const payload = workstationPresets.map(({ modalityTypes, ...preset }) => ({
                ...preset,
                roomIds: Array.isArray(preset.roomIds) ? preset.roomIds : [],
            }));
            const saved = await updateCenterSettings({ workstation_presets: payload }).unwrap();
            const persistedPresets = saved?.workstation_presets || workstationPresets;
            setWorkstationPresets(persistedPresets);
            saveWorkstationPresets(persistedPresets);
            toast.success(isArabic ? 'تم حفظ محطات الاستقبال والغرف على الخادم' : 'Workstations and rooms saved to the server');
        } catch (error) {
            toast.error(isArabic ? 'تعذر حفظ إعدادات المحطات على الخادم' : 'Could not save workstation settings to the server');
        }
    };

    const quickLinks = [
        {
            to: '/equipment?tab=matrix',
            icon: Network,
            titleAr: 'الخريطة السريرية الهرمية',
            titleEn: 'Operational Hierarchy Matrix',
            descAr: 'استعراض هرمي تفاعلي يربط الغرف بالأجهزة بالفحوصات الطبية',
            descEn: 'Interactive tree connecting rooms, installed equipment, and procedures',
            tone: 'border-teal-200 bg-teal-50/50 dark:border-teal-900/60 dark:bg-teal-950/20 text-teal-700 dark:text-teal-300'
        },
        {
            to: '/equipment?tab=rooms',
            icon: DoorClosed,
            titleAr: 'الأجنحة والغرف السريرية',
            titleEn: 'Clinical Suites & Rooms',
            descAr: 'إدارة أجنحة الأشعة، غرف التحضير، الإفاقة، وتجهيزاتها',
            descEn: 'Configure imaging bays, recovery suites, floors, and facilities',
            tone: 'border-cyan-200 bg-cyan-50/50 dark:border-cyan-900/60 dark:bg-cyan-950/20 text-cyan-700 dark:text-cyan-300'
        },
        {
            to: '/equipment?tab=registry',
            icon: Server,
            titleAr: 'سجل الأجهزة والمعدات الإشعاعية',
            titleEn: 'Equipment & Modalities Fleet',
            descAr: 'إدارة أسطول الأجهزة، أرقام السيريال، ومحطات ربط الـ DICOM',
            descEn: 'Manage modality fleet, serial numbers, models, and PACS stations',
            tone: 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/60 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300'
        },
        {
            to: '/equipment?tab=procedures',
            icon: FileSpreadsheet,
            titleAr: 'كتالوج الفحوصات الطبية',
            titleEn: 'Clinical Procedures Catalog',
            descAr: 'تحديد المدد الزمنية الإلزامية للفحوصات، الأسعار، وتعليمات الصيام',
            descEn: 'Procedure pricing, mandatory durations, and prep guidelines',
            tone: 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
        },
        {
            to: '/equipment?tab=maintenance',
            icon: Wrench,
            titleAr: 'الصيانة الدورية والمعايرة',
            titleEn: 'Preventive Maintenance',
            descAr: 'متابعة جداول الصيانة الوقائية وعقود الخدمة الدورية للأجهزة',
            descEn: 'Service contracts, preventive calibration logs, and providers',
            tone: 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300'
        },
        {
            to: '/equipment?tab=downtime',
            icon: AlertTriangle,
            titleAr: 'سجلات الأعطال والطوارئ',
            titleEn: 'Downtime & Incident Logs',
            descAr: 'تسجيل انقطاع الخدمة المفاجئ وتحديد المواعيد المتأثرة فورياً',
            descEn: 'Track outages, impacted patient bookings, and recovery logs',
            tone: 'border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'
        }
    ];

    return (
        <div className="space-y-6">
            {/* Notice Banner */}
            <div className="rounded-3xl border border-teal-500/30 bg-gradient-to-br from-teal-900 via-slate-900 to-slate-950 p-6 text-white shadow-xl">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-300 backdrop-blur-md">
                            <Sparkles size={14} />
                            {isArabic ? 'مركز العمليات الموحد' : 'Centralized Management'}
                        </div>
                        <h2 className="mt-3 text-xl font-black text-white sm:text-2xl">
                            {isArabic ? 'إدارة المعدات، الغرف، والعمليات السريرية' : 'Equipment, Suites & Clinical Procedures'}
                        </h2>
                        <p className="mt-1.5 max-w-2xl text-xs font-semibold leading-relaxed text-slate-300">
                            {isArabic
                                ? 'تم توحيد ودمج إدارة الأجنحة السريرية وأسطول الأجهزة وكتالوج الفحوصات وجداول الصيانة بالكامل في مركز إدارة موحد شامل لتسهيل العمليات ومنع تشتت الشاشات.'
                                : 'All clinical suites, equipment fleets, procedure catalogs, and maintenance schedules have been unified into the dedicated Equipment Hub for seamless clinical operations.'}
                        </p>
                    </div>

                    <Link
                        to="/equipment"
                        className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-3 text-xs font-black text-slate-950 shadow-lg shadow-teal-500/20 transition-all hover:brightness-110 shrink-0"
                    >
                        <span>{isArabic ? 'فتح مركز إدارة المعدات والغرف الشامل' : 'Open Equipment & Suites Hub'}</span>
                        <ExternalLink size={15} />
                    </Link>
                </div>

                {/* Quick KPI Overview */}
                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                        <div className="text-[11px] font-bold text-slate-400">
                            {isArabic ? 'الأجنحة والغرف' : 'Suites & Rooms'}
                        </div>
                        <div className="mt-1 text-2xl font-black text-white">
                            {roomsLoading ? '...' : `${activeRooms}/${rooms.length}`}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                        <div className="text-[11px] font-bold text-slate-400">
                            {isArabic ? 'الأجهزة والوحدات' : 'Modalities Fleet'}
                        </div>
                        <div className="mt-1 text-2xl font-black text-white">
                            {machinesLoading ? '...' : `${activeMachines}/${machines.length}`}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                        <div className="text-[11px] font-bold text-slate-400">
                            {isArabic ? 'الفحوصات المعتمدة' : 'Clinical Exams'}
                        </div>
                        <div className="mt-1 text-2xl font-black text-white">
                            {examsLoading ? '...' : exams.length}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                        <div className="text-[11px] font-bold text-slate-400">
                            {isArabic ? 'الصيانة والأعطال' : 'Open Issues'}
                        </div>
                        <div className="mt-1 text-2xl font-black text-white">
                            {scheduledMaintenance + activeDowntime}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Links Grid */}
            <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3">
                    {isArabic ? 'الوصول المباشر لأقسام المركز التشغيلي' : 'Quick Access to Operations Sections'}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {quickLinks.map((link, idx) => {
                        const Icon = link.icon;
                        return (
                            <Link
                                key={idx}
                                to={link.to}
                                className={`group flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md hover:border-slate-400 dark:hover:border-slate-600 ${link.tone}`}
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-sm">
                                            <Icon size={18} />
                                        </span>
                                        <ExternalLink size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                        {isArabic ? link.titleAr : link.titleEn}
                                    </h4>
                                    <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                                        {isArabic ? link.descAr : link.descEn}
                                    </p>
                                </div>
                                <span className="mt-3 text-[11px] font-black text-teal-600 dark:text-teal-400 inline-flex items-center gap-1 group-hover:underline">
                                    {isArabic ? 'فتح القسم' : 'Open Section'} &rarr;
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </div>

             <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="workstation-mappings-title">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 id="workstation-mappings-title" className="text-sm font-black text-slate-900 dark:text-white">
                            {isArabic ? 'تخصيص محطات الاستقبال والغرف' : 'Reception Workstations & Room Mapping'}
                        </h3>
                        <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                            {isArabic ? 'أضف أو احذف المحطات واربط كل محطة بالغرف التي ستظهر لها في الاستقبال.' : 'Add or remove desks and assign the clinical rooms each workstation should receive.'}
                        </p>
                    </div>
                    <button type="button" onClick={handleSaveWorkstationPresets} disabled={isSavingWorkstations || centerSettingsLoading} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-teal-600 px-3.5 text-xs font-black text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">
                        <CheckCircle2 size={14} />
                        {isArabic ? 'حفظ التخصيص' : 'Save Configuration'}
                    </button>
                    <button type="button" onClick={() => openPresetEditor()} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-teal-200 px-3.5 text-xs font-black text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-950/30">
                        <Plus size={14} />{isArabic ? 'إضافة محطة' : 'Add Workstation'}
                    </button>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {workstationPresets.map((preset) => (
                        <div key={preset.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{preset.icon}</span>
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-black text-slate-900 dark:text-white">{preset.label}</p>
                                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{isArabic ? preset.descAr : preset.descEn}</p>
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button type="button" onClick={() => openPresetEditor(preset)} aria-label={isArabic ? 'تعديل المحطة' : 'Edit workstation'} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-teal-700 dark:hover:bg-slate-800"><Pencil size={13} /></button>
                                <button type="button" onClick={() => deletePreset(preset.id)} aria-label={isArabic ? 'حذف المحطة' : 'Delete workstation'} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"><Trash2 size={13} /></button>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {rooms.map((room) => {
                                    const roomId = String(room.id || room.room_id || room.room_number || room.name);
                                    const checked = (preset.roomIds || []).map(String).includes(roomId);
                                    return (
                                        <label key={roomId} className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${checked ? 'border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}>
                                            <input type="checkbox" checked={checked} onChange={() => setWorkstationPresets((current) => current.map((item) => item.id === preset.id ? { ...item, roomIds: checked ? item.roomIds.filter((id) => String(id) !== roomId) : [...(item.roomIds || []), roomId], scope: 'rooms' } : item))} className="rounded text-teal-600 focus:ring-teal-500" />
                                            {room.name || room.room_number || roomId}
                                        </label>
                                    );
                                })}
                                {rooms.length === 0 && <span className="text-xs text-slate-400">{isArabic ? 'لا توجد غرف متاحة' : 'No rooms available'}</span>}
                            </div>
                        </div>
                    ))}
                </div>
                {editingPresetId && <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-900 dark:bg-teal-950/20">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <input value={presetDraft.label} onChange={(event) => setPresetDraft((draft) => ({ ...draft, label: event.target.value }))} placeholder={isArabic ? 'اسم محطة الاستقبال' : 'Workstation name'} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" autoFocus />
                        <div className="flex gap-2"><button type="button" onClick={savePresetDraft} className="rounded-xl bg-teal-600 px-4 text-xs font-black text-white">{isArabic ? 'تأكيد' : 'Confirm'}</button><button type="button" onClick={() => setEditingPresetId(null)} className="rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">{isArabic ? 'إلغاء' : 'Cancel'}</button></div>
                    </div>
                </div>}
                <p className="mt-3 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    {isArabic ? 'ملاحظة: يسري التغيير على هذا المتصفح بعد الحفظ، ويجب تغيير المحطة خارج الوردية المفتوحة.' : 'Note: Changes apply in this browser after saving. Switch desks only when no reception shift is open.'}
                </p>
            </section>
        </div>
    );
};

export default ClinicalOperationsSettings;
