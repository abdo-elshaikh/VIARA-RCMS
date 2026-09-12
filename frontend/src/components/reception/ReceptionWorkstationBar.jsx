import React, { useState, useEffect, useMemo } from 'react';
import {
    Monitor,
    DoorOpen,
    Tv,
    ShieldCheck,
    ChevronDown,
    Lock,
    Check,
    UserCheck,
    X,
    Clock,
    User,
    Search,
    Cpu,
    Filter,
    Layers,
    RotateCcw,
    Activity,
    SlidersHorizontal,
    Stethoscope,
    Sparkles,
    ExternalLink
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_WORKSTATION_PRESETS } from './workstationPresets';

const MODALITY_TYPE_CONFIG = {
    MRI: {
        labelAr: 'رنين مغناطيسي',
        icon: '🧲',
        badgeCls: 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40',
        ringCls: 'focus:ring-purple-500 text-purple-600',
    },
    CT: {
        labelAr: 'أشعة مقطعية',
        icon: '🌀',
        badgeCls: 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/40',
        ringCls: 'focus:ring-sky-500 text-sky-600',
    },
    Ultrasound: {
        labelAr: 'سونار وموجات',
        icon: '📡',
        badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40',
        ringCls: 'focus:ring-emerald-500 text-emerald-600',
    },
    'X-Ray': {
        labelAr: 'أشعة عادية',
        icon: '⚡',
        badgeCls: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40',
        ringCls: 'focus:ring-amber-500 text-amber-600',
    },
    Mammography: {
        labelAr: 'ماموجرام',
        icon: '🎀',
        badgeCls: 'bg-pink-50 text-pink-700 border-pink-200/80 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800/40',
        ringCls: 'focus:ring-pink-500 text-pink-600',
    },
    PET: {
        labelAr: 'مسح نووي PET',
        icon: '☢️',
        badgeCls: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40',
        ringCls: 'focus:ring-rose-500 text-rose-600',
    },
    Fluoroscopy: {
        labelAr: 'أشعة تداخلية',
        icon: '🔬',
        badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/40',
        ringCls: 'focus:ring-indigo-500 text-indigo-600',
    },
    DEXA: {
        labelAr: 'هشاشة عظام DEXA',
        icon: '🦴',
        badgeCls: 'bg-teal-50 text-teal-700 border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/40',
        ringCls: 'focus:ring-teal-500 text-teal-600',
    },
};

const getModalityConfig = (type = '', name = '') => {
    const raw = `${type} ${name}`.toUpperCase();
    if (raw.includes('MRI') || raw.includes('رنين')) return { typeKey: 'MRI', ...MODALITY_TYPE_CONFIG.MRI };
    if (raw.includes('PET')) return { typeKey: 'PET', ...MODALITY_TYPE_CONFIG.PET };
    if (raw.includes('CT') || raw.includes('مقطعية')) return { typeKey: 'CT', ...MODALITY_TYPE_CONFIG.CT };
    if (raw.includes('US') || raw.includes('VOLUSON') || raw.includes('EPIQ') || raw.includes('APLIO') || raw.includes('سونار') || raw.includes('ULTRASOUND')) return { typeKey: 'Ultrasound', ...MODALITY_TYPE_CONFIG.Ultrasound };
    if (raw.includes('MAMMO') || raw.includes('ثدي') || raw.includes('HOLOGIC 3D')) return { typeKey: 'Mammography', ...MODALITY_TYPE_CONFIG.Mammography };
    if (raw.includes('DEXA') || raw.includes('BONE')) return { typeKey: 'DEXA', ...MODALITY_TYPE_CONFIG.DEXA };
    if (raw.includes('FLUORO')) return { typeKey: 'Fluoroscopy', ...MODALITY_TYPE_CONFIG.Fluoroscopy };
    if (raw.includes('X-RAY') || raw.includes('أشعة') || raw.includes('YSIO') || raw.includes('MOBILEDART') || raw.includes('CARESTREAM')) return { typeKey: 'X-Ray', ...MODALITY_TYPE_CONFIG['X-Ray'] };
    return {
        typeKey: type || 'Imaging',
        labelAr: type || 'فحص تصويري',
        icon: '🩻',
        badgeCls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        ringCls: 'focus:ring-teal-500 text-teal-600',
    };
};

export const ReceptionWorkstationBar = ({
    activeDesk = 'شباك 1 - الاستقبال العام',
    onDeskChange,
    selectedScope = 'all',
    onScopeChange,
    selectedRooms = [],
    onToggleRoom,
    selectedModalities = [],
    onToggleModality,
    availableRooms = [],
    availableModalities = [],
    counts = { total: 0, mine: 0, unclaimed: 0, inExam: 0 },
    onOpenDisplayBoard,
    currentUser,
    onClearRooms,
    onClearModalities,
    onClearAll,
    isRealtimeConnected = false,
    receptionShift = null,
    workstationLocked = false,
    isShiftLoading = false,
    onOpenShift,
    onCloseShift,
    deskPresets = DEFAULT_WORKSTATION_PRESETS,
}) => {
    const { t, i18n } = useTranslation('reception');
    const isArabic = i18n.language?.startsWith('ar');

    const [isDeskMenuOpen, setIsDeskMenuOpen] = useState(false);
    const [isRoomFilterOpen, setIsRoomFilterOpen] = useState(false);
    const [isModalityFilterOpen, setIsModalityFilterOpen] = useState(false);

    // Search filters within dropdowns
    const [roomSearch, setRoomSearch] = useState('');
    const [modalitySearch, setModalitySearch] = useState('');
    const [modalityCategoryFilter, setModalityCategoryFilter] = useState('ALL');
    const [showAllActiveFilters, setShowAllActiveFilters] = useState(false);

    // Minute-level session clock avoids re-rendering this large control every second.
    const [sessionMinutes, setSessionMinutes] = useState(0);
    useEffect(() => {
        const updateSessionMinutes = () => {
            const startedAt = receptionShift?.started_at ? new Date(receptionShift.started_at).getTime() : null;
            setSessionMinutes(startedAt && Number.isFinite(startedAt)
                ? Math.max(0, Math.floor((Date.now() - startedAt) / 60_000))
                : 0);
        };
        updateSessionMinutes();
        const interval = setInterval(updateSessionMinutes, 60_000);
        return () => clearInterval(interval);
    }, [receptionShift?.started_at]);
    const sessionLabel = `${String(Math.floor(sessionMinutes / 60)).padStart(2, '0')}:${String(sessionMinutes % 60).padStart(2, '0')}`;

    useEffect(() => {
        const closeMenus = (event) => {
            if (event.key !== 'Escape') return;
            setIsDeskMenuOpen(false);
            setIsRoomFilterOpen(false);
            setIsModalityFilterOpen(false);
        };
        window.addEventListener('keydown', closeMenus);
        return () => window.removeEventListener('keydown', closeMenus);
    }, []);

    useEffect(() => {
        if (!workstationLocked) return;
        setIsDeskMenuOpen(false);
        setIsRoomFilterOpen(false);
        setIsModalityFilterOpen(false);
    }, [workstationLocked]);

    const hasRoomFilter = selectedRooms.length > 0;
    const hasModalityFilter = selectedModalities.length > 0;
    const hasAnyFilter = hasRoomFilter || hasModalityFilter;
    const activeFilterCount = selectedRooms.length + selectedModalities.length;
    const activeFilterTokens = [
        ...selectedRooms.map((room) => ({ kind: 'room', value: room })),
        ...selectedModalities.map((modality) => ({ kind: 'modality', value: modality })),
    ];
    const visibleFilterTokens = showAllActiveFilters ? activeFilterTokens : activeFilterTokens.slice(0, 6);
    const hiddenFilterCount = Math.max(0, activeFilterTokens.length - visibleFilterTokens.length);

    useEffect(() => {
        if (!hasAnyFilter) setShowAllActiveFilters(false);
    }, [hasAnyFilter]);

    const activeDeskObj = deskPresets.find((d) => d.label === activeDesk);

    // Normalize Room items (can be string or rich object)
    const normalizedRooms = useMemo(() => {
        return (availableRooms || []).map((item) => {
            if (typeof item === 'string') {
                return {
                    key: item,
                    roomNumber: item,
                    label: item,
                    rawName: item,
                    type: 'Imaging',
                    status: 'Active',
                    machines: [],
                };
            }
            return {
                key: item.room || item.roomNumber || item.id || item.label,
                roomNumber: String(item.roomNumber || item.room || ''),
                label: String(item.label || item.name || item.room || ''),
                rawName: String(item.rawName || item.name || ''),
                type: item.type || 'Imaging',
                status: item.status || 'Active',
                machines: Array.isArray(item.machines) ? item.machines.map(String) : [],
                floor: item.floor,
            };
        });
    }, [availableRooms]);

    // Normalize Modality items (can be string or rich object)
    const normalizedModalities = useMemo(() => {
        return (availableModalities || []).map((item) => {
            if (typeof item === 'string') {
                const conf = getModalityConfig('', item);
                return {
                    key: item,
                    id: item,
                    name: item,
                    type: conf.typeKey,
                    roomNumber: '',
                    status: 'Active',
                };
            }
            const conf = getModalityConfig(item.type, item.name);
            return {
                key: item.name || item.id || item.type,
                id: item.id || item.name,
                name: String(item.name || item.type || ''),
                type: String(conf.typeKey || item.type || 'Imaging'),
                roomNumber: String(item.roomNumber || ''),
                roomName: String(item.roomName || ''),
                status: item.status || 'Active',
                manufacturer: String(item.manufacturer || ''),
                model: String(item.model || ''),
            };
        });
    }, [availableModalities]);

    // Filtered rooms in dropdown
    const filteredRooms = useMemo(() => {
        const q = roomSearch.trim().toLowerCase();
        if (!q) return normalizedRooms;
        return normalizedRooms.filter((r) =>
            r.label.toLowerCase().includes(q) ||
            r.roomNumber.toLowerCase().includes(q) ||
            r.rawName.toLowerCase().includes(q) ||
            (r.machines || []).some((m) => m.toLowerCase().includes(q))
        );
    }, [normalizedRooms, roomSearch]);

    // Filtered modalities in dropdown
    const filteredModalities = useMemo(() => {
        const q = modalitySearch.trim().toLowerCase();
        return normalizedModalities.filter((m) => {
            if (modalityCategoryFilter !== 'ALL' && m.type !== modalityCategoryFilter) {
                return false;
            }
            if (!q) return true;
            return (
                m.name.toLowerCase().includes(q) ||
                m.type.toLowerCase().includes(q) ||
                m.roomNumber.toLowerCase().includes(q) ||
                (m.manufacturer && m.manufacturer.toLowerCase().includes(q)) ||
                (m.model && m.model.toLowerCase().includes(q))
            );
        });
    }, [normalizedModalities, modalitySearch, modalityCategoryFilter]);

    // Distinct modality categories for quick pills
    const modalityCategories = useMemo(() => {
        const set = new Set();
        normalizedModalities.forEach((m) => {
            if (m.type) set.add(m.type);
        });
        return ['ALL', ...Array.from(set)];
    }, [normalizedModalities]);

    const SCOPE_OPTIONS = [
        {
            id: 'all',
            labelAr: 'كل الحالات',
            labelEn: 'All Cases',
            count: counts.total,
            activeCls: 'bg-white shadow-xs text-teal-700 dark:bg-slate-800 dark:text-teal-300',
            badgeCls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
        },
        {
            id: 'mine',
            labelAr: 'مهامي',
            labelEn: 'My Tasks',
            count: counts.mine,
            icon: UserCheck,
            activeCls: 'bg-white shadow-xs text-teal-700 dark:bg-slate-800 dark:text-teal-300',
            badgeCls: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300',
        },
        {
            id: 'unclaimed',
            labelAr: 'غير مستلمة',
            labelEn: 'Unclaimed',
            count: counts.unclaimed,
            icon: Lock,
            activeCls: 'bg-white shadow-xs text-teal-700 dark:bg-slate-800 dark:text-teal-300',
            badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
            alertWhen: (c) => c > 0,
        },
        {
            id: 'inExam',
            labelAr: 'داخل الفحص',
            labelEn: 'In Exam',
            count: counts.inExam,
            icon: Activity,
            activeCls: 'bg-white shadow-xs text-teal-700 dark:bg-slate-800 dark:text-teal-300',
            badgeCls: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
        },
        {
            id: 'emergency',
            labelAr: 'العاجلة',
            labelEn: 'Urgent',
            count: counts.emergency || 0,
            icon: Activity,
            activeCls: 'bg-rose-50 shadow-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
            badgeCls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
            alertWhen: (c) => c > 0,
        },
        ...(hasRoomFilter ? [{
            id: 'rooms',
            labelAr: 'الغرف المحددة',
            labelEn: 'Selected Rooms',
            count: selectedRooms.length,
            icon: DoorOpen,
            activeCls: 'bg-white shadow-xs text-teal-700 dark:bg-slate-800 dark:text-teal-300',
            badgeCls: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300',
        }] : []),
        ...(hasModalityFilter ? [{
            id: 'modalities',
            labelAr: 'الأجهزة المحددة',
            labelEn: 'Selected Devices',
            count: selectedModalities.length,
            icon: Cpu,
            activeCls: 'bg-white shadow-xs text-purple-700 dark:bg-slate-800 dark:text-purple-300',
            badgeCls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300',
        }] : []),
    ];

    const clearRoomsHandler = () => {
        if (onClearRooms) {
            onClearRooms();
        } else {
            selectedRooms.forEach((r) => onToggleRoom?.(r));
        }
    };

    const clearModalitiesHandler = () => {
        if (onClearModalities) {
            onClearModalities();
        } else {
            selectedModalities.forEach((m) => onToggleModality?.(m));
        }
    };

    const clearAllHandler = () => {
        if (onClearAll) {
            onClearAll();
        } else {
            clearRoomsHandler();
            clearModalitiesHandler();
            onScopeChange?.('all');
        }
    };

    return (
        <div className="relative z-30 rounded-xl border border-slate-200/80 bg-white/95 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 transition-all">
            <div className="flex flex-col lg:flex-row lg:items-center lg:gap-0">

                {/* ── A: WORKSTATION IDENTITY ────────────────────────── */}
                <div className="flex items-center gap-2.5 bg-gradient-to-b from-teal-50/70 to-transparent px-3 py-2 dark:from-teal-950/20 lg:min-w-[200px] shrink-0 rounded-t-xl lg:rounded-tr-xl lg:rounded-br-xl lg:rounded-tl-none">

                    {/* Desk icon badge */}
                    <div className="relative shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-teal-200/70 bg-white text-lg shadow-xs dark:border-teal-800/50 dark:bg-slate-900">
                            {activeDeskObj?.icon ?? '🖥️'}
                        </div>
                        {/* Live green dot */}
                        {isRealtimeConnected && (
                            <span className="absolute -top-0.5 -end-0.5 flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                            </span>
                        )}
                    </div>

                    {/* Desk info & Selector */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-teal-600/80 dark:text-teal-400/80">
                                {isArabic ? 'محطة' : 'Desk'}
                            </p>
                            {receptionShift && (
                                <span className="flex items-center gap-1 rounded-md border border-emerald-200/70 bg-emerald-50 px-1.5 py-px dark:border-emerald-800/40 dark:bg-emerald-950/30">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    <span className="whitespace-nowrap text-[8.5px] font-black text-emerald-700 dark:text-emerald-300">
                                        {sessionLabel}
                                    </span>
                                </span>
                            )}
                        </div>

                        {/* Desk selector button */}
                        <div className="relative">
                            <button
                                type="button"
                                disabled={workstationLocked}
                                aria-haspopup="menu"
                                aria-expanded={isDeskMenuOpen}
                                onClick={() => {
                                    setIsDeskMenuOpen(!isDeskMenuOpen);
                                    setIsRoomFilterOpen(false);
                                    setIsModalityFilterOpen(false);
                                }}
                                className="group flex items-center gap-1 text-start focus-visible:outline-hidden hover:opacity-90 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                                title={workstationLocked ? (isArabic ? 'محطة العمل مثبتة حتى تقفيل الوردية' : 'Workstation is locked until shift closure') : undefined}
                            >
                                <span className="truncate text-xs font-black text-slate-900 dark:text-white leading-tight">
                                    {activeDesk}
                                </span>
                                <ChevronDown
                                    size={12}
                                    className={`shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-600 dark:group-hover:text-slate-300 ${isDeskMenuOpen ? 'rotate-180' : ''}`}
                                />
                            </button>

                            <AnimatePresence>
                                {isDeskMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsDeskMenuOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: -8, scale: 0.97 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -8, scale: 0.97 }}
                                            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                                            className="absolute start-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900 dark:ring-white/10"
                                        >
                                            <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/80 dark:bg-slate-950/60">
                                                <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                                                    {isArabic ? 'تغيير محطة العمل السريرية' : 'Switch Workstation Desk'}
                                                </p>
                                                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                    {isArabic ? 'اختيار التخصص يربط شباكك تلقائياً بالأجهزة المعنية' : 'Select desk to link relevant modalities'}
                                                </p>
                                            </div>
                                            <div className="p-2 space-y-1 max-h-[65vh] overflow-y-auto">
                                                 {deskPresets.map((desk) => {
                                                    const isSelected = activeDesk === desk.label;
                                                    return (
                                                        <button
                                                            key={desk.id}
                                                            type="button"
                                                            onClick={() => {
                                                                onDeskChange?.(desk.label);
                                                                setIsDeskMenuOpen(false);
                                                            }}
                                                            className={`flex w-full items-start gap-3 rounded-xl p-2.5 text-xs font-bold transition text-start cursor-pointer ${
                                                                isSelected
                                                                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/30'
                                                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'
                                                            }`}
                                                        >
                                                            <span className="text-xl shrink-0 mt-0.5">{desk.icon}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-black truncate">{desk.label}</span>
                                                                    {isSelected && <Check size={14} className="shrink-0 text-white ms-1" />}
                                                                </div>
                                                                <p className={`text-[10px] mt-0.5 line-clamp-1 ${isSelected ? 'text-teal-100' : 'text-slate-400 dark:text-slate-500'}`}>
                                                                    {isArabic ? desk.descAr : desk.descEn}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* ── B: SCOPE SWITCHER + CLINICAL ROOMS + MODALITIES FILTERS ── */}
                <div className="flex flex-1 flex-wrap items-center gap-1.5 px-2.5 py-1.5 min-w-0">
                    {/* Scope tabs */}
                    <div className="flex items-center rounded-lg border border-slate-200/80 bg-slate-100/80 p-0.5 gap-0.5 dark:border-slate-800 dark:bg-slate-950/60 shrink-0">
                        {SCOPE_OPTIONS.map((scope) => {
                            const ScopeIcon = scope.icon;
                            const isActive = selectedScope === scope.id;
                            const isAlert = scope.alertWhen?.(scope.count);
                            return (
                                <button
                                    key={scope.id}
                                    type="button"
                                    onClick={() => onScopeChange?.(scope.id)}
                                    className={`relative inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-all duration-150 cursor-pointer ${
                                        isActive
                                            ? `${scope.activeCls}`
                                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {ScopeIcon && (
                                        <ScopeIcon size={10} className={isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'} />
                                    )}
                                    <span className="whitespace-nowrap">{isArabic ? scope.labelAr : scope.labelEn}</span>
                                    <span className={`rounded-full px-1 py-0 text-[8px] font-black leading-none ${
                                        isActive ? scope.badgeCls : 'bg-slate-200/70 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400'
                                    }`}>
                                        {scope.count}
                                    </span>
                                    {/* Alert ping for unclaimed */}
                                    {isAlert && !isActive && (
                                        <span className="absolute -top-1 -end-1 h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── 1. MODALITY / DEVICE FILTER DROPDOWN ───────────────── */}
                    {normalizedModalities.length > 0 && (
                        <div className="relative shrink-0">
                            <button
                                type="button"
                                disabled={workstationLocked}
                                aria-haspopup="dialog"
                                aria-expanded={isModalityFilterOpen}
                                onClick={() => {
                                    setIsModalityFilterOpen(!isModalityFilterOpen);
                                    setIsRoomFilterOpen(false);
                                    setIsDeskMenuOpen(false);
                                }}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition shadow-xs cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-70 ${
                                    hasModalityFilter
                                        ? 'border-purple-500/60 bg-purple-600 text-white shadow-purple-600/20'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                }`}
                            >
                                <Cpu size={12} className={hasModalityFilter ? 'text-white' : 'text-purple-600 dark:text-purple-400'} />
                                <span className="whitespace-nowrap">{isArabic ? 'حسب الأجهزة' : 'By Device'}</span>
                                {hasModalityFilter && (
                                    <span className="rounded-full bg-white/25 px-1 py-0 text-[8px] font-black">
                                        {selectedModalities.length}
                                    </span>
                                )}
                                <ChevronDown size={10} className={`opacity-60 transition-transform ${isModalityFilterOpen ? 'rotate-180' : ''}`} />
                            </button>

                            <AnimatePresence>
                                {isModalityFilterOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsModalityFilterOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute start-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900 dark:ring-white/10 overflow-hidden"
                                        >
                                            {/* Header */}
                                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2 bg-slate-50/50 dark:bg-slate-950/40">
                                                <div className="flex items-center gap-2">
                                                    <Cpu size={13} className="text-purple-600 dark:text-purple-400" />
                                                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                                        {isArabic ? 'ترشيح الأجهزة والموداليتي' : 'Medical Devices & Modalities'}
                                                    </span>
                                                {hasModalityFilter && (
                                                    <button
                                                        type="button"
                                                        disabled={workstationLocked}
                                                        onClick={clearModalitiesHandler}
                                                        className="flex items-center gap-1 text-[10.5px] font-bold text-rose-500 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        <X size={10} />
                                                        {isArabic ? 'مسح الكل' : 'Clear All'}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Search input */}
                                            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                                                <div className="relative">
                                                    <Search size={12} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        value={modalitySearch}
                                                        onChange={(e) => setModalitySearch(e.target.value)}
                                                        placeholder={isArabic ? 'بحث باسم الجهاز أو الماركة...' : 'Search device or brand...'}
                                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 ps-8 pe-7 text-xs text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                                    />
                                                    {modalitySearch && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setModalitySearch('')}
                                                            aria-label={isArabic ? 'مسح بحث الأجهزة' : 'Clear device search'}
                                                            className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Quick category filter pills */}
                                                {modalityCategories.length > 2 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {modalityCategories.map((cat) => {
                                                            const isCatActive = modalityCategoryFilter === cat;
                                                            return (
                                                                <button
                                                                    key={cat}
                                                                    type="button"
                                                                    onClick={() => setModalityCategoryFilter(cat)}
                                                                    className={`rounded-lg px-2 py-0.5 text-[9.5px] font-bold transition ${
                                                                        isCatActive
                                                                            ? 'bg-purple-600 text-white'
                                                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                                                    }`}
                                                                >
                                                                    {cat === 'ALL' ? (isArabic ? 'الكل' : 'All') : cat}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                            {/* Modalities list */}
                                            <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                                                {filteredModalities.length === 0 ? (
                                                    <div className="py-6 text-center text-xs text-slate-400">
                                                        {isArabic ? 'لا توجد أجهزة مطابقة للبحث' : 'No devices found'}
                                                    </div>
                                                ) : (
                                                    filteredModalities.map((mod) => {
                                                        const checked = selectedModalities.includes(mod.key) || selectedModalities.includes(mod.name);
                                                        const conf = getModalityConfig(mod.type, mod.name);
                                                        return (
                                                            <label
                                                                key={mod.key}
                                                                className={`flex items-start justify-between gap-2.5 rounded-xl p-2 text-xs font-semibold cursor-pointer transition ${
                                                                    checked
                                                                        ? 'bg-purple-50/80 text-purple-900 border border-purple-200/60 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/40'
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                                                                }`}
                                                            >
                                                                <div className="flex items-start gap-2 min-w-0">
                                                                    <span className="text-base shrink-0 mt-0.5">{conf.icon}</span>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="font-bold truncate text-slate-900 dark:text-white leading-tight">
                                                                                {mod.name}
                                                                            </span>
                                                                            <span className={`rounded-md border px-1.5 py-px text-[8.5px] font-black ${conf.badgeCls}`}>
                                                                                {mod.type}
                                                                            </span>
                                                                        </div>
                                                                        {(mod.roomNumber || mod.roomName) && (
                                                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                                                📍 {mod.roomName || mod.roomNumber}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <input
                                                                    type="checkbox"
                                                                    disabled={workstationLocked}
                                                                    checked={checked}
                                                                    onChange={() => {
                                                                        onToggleModality?.(mod.name);
                                                                        onScopeChange?.('modalities');
                                                                    }}
                                                                    className="mt-1 rounded-sm text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                                                />
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* ── 2. CLINICAL ROOMS FILTER DROPDOWN ──────────────────── */}
                    {normalizedRooms.length > 0 && (
                        <div className="relative shrink-0">
                            <button
                                type="button"
                                disabled={workstationLocked}
                                aria-haspopup="dialog"
                                aria-expanded={isRoomFilterOpen}
                                aria-label={isArabic ? 'حسب الغرف / Rooms' : 'By Room / Rooms'}
                                onClick={() => {
                                    setIsRoomFilterOpen(!isRoomFilterOpen);
                                    setIsModalityFilterOpen(false);
                                    setIsDeskMenuOpen(false);
                                }}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition shadow-xs cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-70 ${
                                    hasRoomFilter
                                        ? 'border-teal-500/60 bg-teal-600 text-white shadow-teal-600/20'
                                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                }`}
                            >
                                <DoorOpen size={12} className={hasRoomFilter ? 'text-white' : 'text-teal-600 dark:text-teal-400'} />
                                <span className="whitespace-nowrap">{isArabic ? 'حسب الغرف' : 'By Room'}</span>
                                {hasRoomFilter && (
                                    <span className="rounded-full bg-white/25 px-1 py-0 text-[8px] font-black">
                                        {selectedRooms.length}
                                    </span>
                                )}
                                <ChevronDown size={10} className={`opacity-60 transition-transform ${isRoomFilterOpen ? 'rotate-180' : ''}`} />
                            </button>

                            <AnimatePresence>
                                {isRoomFilterOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsRoomFilterOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute start-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900 dark:ring-white/10 overflow-hidden"
                                        >
                                            {/* Header */}
                                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2 bg-slate-50/50 dark:bg-slate-950/40">
                                                <div className="flex items-center gap-2">
                                                    <DoorOpen size={13} className="text-teal-600 dark:text-teal-400" />
                                                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                                        {isArabic ? 'قاعات الفحص والغرف' : 'Clinical Suites & Rooms'}
                                                    </span>
                                                    <span className="rounded-md bg-teal-100 px-1.5 py-0.5 text-[9px] font-black text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                                        {normalizedRooms.length}
                                                    </span>
                                                </div>
                                                {hasRoomFilter && (
                                                    <button
                                                        type="button"
                                                        disabled={workstationLocked}
                                                        onClick={clearRoomsHandler}
                                                        className="flex items-center gap-1 text-[10.5px] font-bold text-rose-500 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        <X size={10} />
                                                        {isArabic ? 'مسح الكل' : 'Clear All'}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Search input */}
                                            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                                                <div className="relative">
                                                    <Search size={12} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        value={roomSearch}
                                                        onChange={(e) => setRoomSearch(e.target.value)}
                                                        placeholder={isArabic ? 'بحث برقم الغرفة أو الجناح...' : 'Search room or suite...'}
                                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 ps-8 pe-7 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                                    />
                                                    {roomSearch && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setRoomSearch('')}
                                                            aria-label={isArabic ? 'مسح بحث الغرف' : 'Clear room search'}
                                                            className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Rooms list */}
                                            <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                                                {filteredRooms.length === 0 ? (
                                                    <div className="py-6 text-center text-xs text-slate-400">
                                                        {isArabic ? 'لا توجد قاعات مطابقة للبحث' : 'No rooms found'}
                                                    </div>
                                                ) : (
                                                    filteredRooms.map((r) => {
                                                        const checked = selectedRooms.includes(r.roomNumber) || selectedRooms.includes(r.key);
                                                        return (
                                                            <label
                                                                key={r.key}
                                                                className={`flex items-start justify-between gap-2.5 rounded-xl p-2 text-xs font-semibold cursor-pointer transition ${
                                                                    checked
                                                                        ? 'bg-teal-50/80 text-teal-900 border border-teal-200/60 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-800/40'
                                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                                                                }`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className="font-bold truncate text-slate-900 dark:text-white leading-tight">
                                                                            {r.label}
                                                                        </span>
                                                                        {r.type && (
                                                                            <span className="rounded-md border border-slate-200 bg-white px-1.5 py-px text-[8.5px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                                                {r.type === 'Imaging' ? (isArabic ? 'أشعة' : 'Imaging') : r.type}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {r.machines && r.machines.length > 0 && (
                                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                                            {r.machines.map((mach, idx) => (
                                                                                <span key={idx} className="rounded-md bg-teal-100/70 px-1.5 py-px text-[9px] font-bold text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                                                                    {mach}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <input
                                                                    type="checkbox"
                                                                    disabled={workstationLocked}
                                                                    checked={checked}
                                                                    onChange={() => {
                                                                        onToggleRoom?.(r.roomNumber || r.key);
                                                                        onScopeChange?.('rooms');
                                                                    }}
                                                                    className="mt-1 rounded-sm text-teal-600 focus:ring-teal-500 focus:ring-offset-0"
                                                                />
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* ── C: TV BOARD BUTTON ──────────────────────────────── */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 lg:border-t-0 shrink-0">
                    <button
                        type="button"
                        disabled={isShiftLoading}
                        onClick={receptionShift ? onCloseShift : onOpenShift}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10.5px] font-black transition disabled:cursor-wait disabled:opacity-60 ${receptionShift ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300'}`}
                        title={receptionShift
                            ? (isArabic ? 'تقفيل الوردية وحفظ الإحصاءات' : 'Close shift and save statistics')
                            : (isArabic ? 'بدء وردية استقبال تشغيلية' : 'Start operational reception shift')}
                    >
                        <Clock size={12} />
                        <span>{receptionShift ? (isArabic ? 'تقفيل الوردية' : 'Close shift') : (isArabic ? 'بدء الوردية' : 'Start shift')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onOpenDisplayBoard}
                        title={isArabic ? 'فتح شاشة الانتظار الخارجية في نافذة مستقلة' : 'Open external waiting-room display board in a new tab'}
                        className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-teal-600/20 transition hover:brightness-110 active:scale-95 whitespace-nowrap cursor-pointer"
                    >
                        {/* Live pulse */}
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-200 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                        </span>
                        <Tv size={14} />
                        <span>{isArabic ? 'شاشة الانتظار الخارجية (TV)' : 'External TV Display Board'}</span>
                        <ExternalLink size={12} className="opacity-80" />
                        {/* Shimmer */}
                        <span className="pointer-events-none absolute inset-0 -start-full skew-x-12 bg-white/10 group-hover:start-full transition-[left] duration-500" />
                    </button>
                </div>
            </div>

            {/* ── D: ACTIVE CLINICAL FILTERS RIBBON ─────────────────── */}
            <AnimatePresence>
                {hasAnyFilter && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="border-t border-slate-100 bg-slate-50/80 px-3 py-2.5 rounded-b-2xl dark:border-slate-800 dark:bg-slate-950/40"
                        aria-live="polite"
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-teal-200/80 bg-white px-2.5 py-1.5 shadow-sm dark:border-teal-800/40 dark:bg-slate-900">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300">
                                    <Filter size={12} aria-hidden="true" />
                                </span>
                                <span className="text-[10px] font-black text-slate-600 dark:text-slate-300">
                                    {isArabic ? 'الفلاتر النشطة' : 'Active Filters'}
                                </span>
                                <span className="min-w-5 rounded-full bg-teal-600 px-1.5 py-0.5 text-center text-[10px] font-black text-white" aria-label={`${activeFilterCount} ${isArabic ? 'فلاتر' : 'filters'}`}>
                                    {activeFilterCount}
                                </span>
                            </div>

                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                {visibleFilterTokens.map(({ kind, value }) => {
                                    const isRoom = kind === 'room';
                                    const conf = isRoom ? null : getModalityConfig('', value);
                                    return (
                                        <span
                                            key={`${kind}-${value}`}
                                            className={`group inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold ${isRoom
                                                ? 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800/40 dark:bg-teal-950/50 dark:text-teal-300'
                                                : 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800/40 dark:bg-purple-950/50 dark:text-purple-300'}`}
                                        >
                                            {isRoom ? <DoorOpen size={11} aria-hidden="true" /> : <span aria-hidden="true">{conf.icon}</span>}
                                            <span className="truncate" title={value}>{value}</span>
                                            <button
                                                type="button"
                                                disabled={workstationLocked}
                                                onClick={() => (isRoom ? onToggleRoom?.(value) : onToggleModality?.(value))}
                                                aria-label={`${isArabic ? 'إزالة' : 'Remove'} ${isRoom ? (isArabic ? 'الغرفة' : 'room') : (isArabic ? 'الجهاز' : 'device')}: ${value}`}
                                                className="ms-auto rounded-md p-0.5 opacity-60 transition hover:bg-rose-100 hover:text-rose-600 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-30"
                                                title={isArabic ? 'إزالة هذا الفلتر' : 'Remove this filter'}
                                            >
                                                <X size={11} aria-hidden="true" />
                                            </button>
                                        </span>
                                    );
                                })}
                                {hiddenFilterCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllActiveFilters((value) => !value)}
                                        className="inline-flex min-h-7 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-black text-slate-600 transition hover:border-teal-400 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                    >
                                        {showAllActiveFilters ? (isArabic ? 'عرض أقل' : 'Show less') : `+${hiddenFilterCount} ${isArabic ? 'أخرى' : 'more'}`}
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                disabled={workstationLocked}
                                onClick={clearAllHandler}
                                aria-label={isArabic ? 'مسح كافة الفلاتر السريرية' : 'Reset All Filters'}
                                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-[10px] font-black text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 dark:border-rose-800/50 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <RotateCcw size={11} aria-hidden="true" />
                                <span>{isArabic ? 'مسح الكل' : 'Clear all'}</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ReceptionWorkstationBar;
