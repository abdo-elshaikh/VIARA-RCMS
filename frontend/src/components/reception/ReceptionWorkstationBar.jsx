import React, { memo, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Check,
    ChevronDown,
    Clock3,
    Cpu,
    DoorOpen,
    ExternalLink,
    Filter,
    Lock,
    Monitor,
    RotateCcw,
    Search,
    Tv,
    UserCheck,
    UsersRound,
    X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_WORKSTATION_PRESETS } from './workstationPresets';

const normalizeRooms = (items = []) => items.map((item) => {
    if (typeof item === 'string') {
        return { key: item, value: item, label: item, meta: '' };
    }
    const value = item.room || item.roomNumber || item.id || item.label;
    const label = item.label || item.rawName || item.roomNumber || item.room || value;
    const meta = [item.floor, ...(item.machines || [])].filter(Boolean).join(' · ');
    return { key: String(value), value: String(value), label, meta };
}).filter((item) => item.value);

const normalizeModalities = (items = []) => items.map((item) => {
    if (typeof item === 'string') {
        return { key: item, value: item, label: item, meta: '' };
    }
    const value = item.name || item.id || item.modality_id || item.type;
    const label = item.name || item.type || value;
    const meta = [item.type, item.roomName || item.roomNumber].filter(Boolean).join(' · ');
    return { key: String(value), value: String(value), label, meta };
}).filter((item) => item.value);

const MenuBackdrop = ({ onClick }) => (
    <button
        type="button"
        aria-label="Close menu"
        onClick={onClick}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
    />
);

const FilterMenu = ({
    title,
    icon: Icon,
    items,
    selected,
    onToggle,
    onClear,
    search,
    setSearch,
    placeholder,
    disabled,
    accent = 'teal',
    emptyLabel,
    onClose,
}) => {
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(q));
    }, [items, search]);

    const tone = accent === 'violet'
        ? {
            icon: 'text-violet-600 dark:text-violet-300',
            selected: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800/80 dark:bg-[#1a1033] dark:text-violet-200',
            check: 'bg-violet-600 text-white',
        }
        : {
            icon: 'text-teal-600 dark:text-teal-300',
            selected: 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-800/80 dark:bg-[#072424] dark:text-teal-200',
            check: 'bg-teal-600 text-white',
        };

    return (
        <>
            <MenuBackdrop onClick={onClose} />
            <div className="absolute left-1/2 top-full z-[70] mt-2 w-[min(92vw,340px)] max-w-[calc(100vw-1.25rem)] -translate-x-1/2 origin-top overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:left-0 sm:translate-x-0 sm:origin-top-left dark:border-slate-700 dark:bg-[#0b1426]">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-[#070e1a]">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className={`grid h-7 w-7 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700`}>
                            <Icon size={14} className={tone.icon} />
                        </span>
                        <span className="truncate text-xs font-black text-slate-800 dark:text-slate-200">{title}</span>
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-black text-white dark:bg-slate-100 dark:text-slate-900">{selected.length}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {selected.length > 0 && (
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={onClear}
                                className="rounded-lg px-2 py-1 text-[10px] font-black text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-950/30"
                            >
                                <RotateCcw size={11} className="inline me-1" />
                                مسح
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100">
                            <X size={14} />
                        </button>
                    </div>
                </div>

                <div className="border-b border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-[#0b1426]">
                    <label className="relative block">
                        <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={placeholder}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-[#070e1a] dark:text-slate-100"
                        />
                    </label>
                </div>

                <div className="max-h-[290px] overflow-y-auto p-2">
                    {filtered.length === 0 ? (
                        <p className="px-3 py-8 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">{emptyLabel}</p>
                    ) : filtered.map((item) => {
                        const checked = selected.some((value) => String(value) === String(item.value));
                        return (
                            <button
                                key={item.key}
                                type="button"
                                disabled={disabled}
                                onClick={() => onToggle(item.value)}
                                className={`mb-1 flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start transition disabled:cursor-not-allowed disabled:opacity-60 ${checked ? tone.selected : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-[#070e1a]'}`}
                            >
                                <span className="min-w-0 flex-1 overflow-hidden">
                                    <span className="block truncate text-xs font-black">{item.label}</span>
                                    {item.meta && <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">{item.meta}</span>}
                                </span>
                                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${checked ? `${tone.check} border-transparent` : 'border-slate-200 bg-white text-transparent dark:border-slate-700 dark:bg-slate-800'}`}>
                                    <Check size={12} strokeWidth={3} />
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
};

const ScopeButton = ({ active, icon: Icon, label, count, tone = 'teal', onClick, ariaLabel }) => {
    const activeClass = tone === 'rose'
        ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800/80 dark:bg-[#2a0e14] dark:text-rose-300'
        : tone === 'amber'
            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/80 dark:bg-[#291b07] dark:text-amber-300'
            : 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800/80 dark:bg-[#072424] dark:text-teal-300';
    return (
        <button
            type="button"
            aria-label={ariaLabel || label}
            onClick={onClick}
            className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[10px] sm:text-[11px] font-black transition-all duration-200 hover:shadow-sm ${active ? activeClass : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-[#070e1a] dark:hover:text-white'}`}
        >
            {Icon && <Icon size={12} className="shrink-0" />}
            <span className="truncate">{label}</span>
            {Number.isFinite(count) && (
                <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${active ? 'bg-white text-current shadow-2xs dark:bg-black/40' : 'bg-slate-200/90 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{count}</span>
            )}
        </button>
    );
};

const ReceptionWorkstationBar = memo(({
    activeDesk = 'شباك 1 - الاستقبال العام',
    activeDeskId = null,
    onDeskChange,
    selectedScope = 'all',
    onScopeChange,
    selectedRooms = [],
    onToggleRoom,
    selectedModalities = [],
    onToggleModality,
    availableRooms = [],
    availableModalities = [],
    counts = { total: 0, mine: 0, unclaimed: 0, inExam: 0, emergency: 0, overdue: 0, attention: 0 },
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
    const { i18n, t } = useTranslation('reception');
    const isArabic = i18n.language?.startsWith('ar');
    const [openMenu, setOpenMenu] = useState(null);
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [roomSearch, setRoomSearch] = useState('');
    const [modalitySearch, setModalitySearch] = useState('');
    const [sessionSeconds, setSessionSeconds] = useState(0);

    const rooms = useMemo(() => normalizeRooms(availableRooms), [availableRooms]);
    const modalities = useMemo(() => normalizeModalities(availableModalities), [availableModalities]);
    const roomByValue = useMemo(() => new Map(rooms.map((item) => [String(item.value), item])), [rooms]);
    const modalityByValue = useMemo(() => new Map(modalities.map((item) => [String(item.value), item])), [modalities]);
    const selectedRoomLabels = useMemo(
        () => selectedRooms.map((value) => roomByValue.get(String(value))?.label || roomByValue.get(String(value))?.value || String(value)).filter(Boolean),
        [roomByValue, selectedRooms]
    );
    const selectedModalityLabels = useMemo(
        () => selectedModalities.map((value) => modalityByValue.get(String(value))?.label || modalityByValue.get(String(value))?.value || String(value)).filter(Boolean),
        [modalityByValue, selectedModalities]
    );
    const unresolvedScopeCount = Math.max(0,
        (selectedRooms.length - selectedRoomLabels.length) +
        (selectedModalities.length - selectedModalityLabels.length)
    );
    const currentPreset = useMemo(() => deskPresets.find((item) => (activeDeskId && item.id === activeDeskId) || item.label === activeDesk), [deskPresets, activeDesk, activeDeskId]);

    useEffect(() => {
        const update = () => {
            const startedAt = receptionShift?.started_at ? new Date(receptionShift.started_at).getTime() : 0;
            setSessionSeconds(startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);
        };
        update();
        if (!receptionShift?.started_at) return undefined;
        const timer = window.setInterval(update, 1000);
        return () => window.clearInterval(timer);
    }, [receptionShift?.started_at]);

    useEffect(() => {
        const onKey = (event) => {
            if (event.key === 'Escape') setOpenMenu(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (workstationLocked) setOpenMenu(null);
    }, [workstationLocked]);

    const sessionLabel = [
        Math.floor(sessionSeconds / 3600),
        Math.floor((sessionSeconds % 3600) / 60),
        sessionSeconds % 60,
    ].map((value) => String(value).padStart(2, '0')).join(':');
    const activeFilterCount = selectedRooms.length + selectedModalities.length;
    const scopeLabel = selectedScope === 'attention'
        ? (t('workstation.attention'))
        : selectedScope === 'mine'
        ? (t('workstation.mine'))
        : selectedScope === 'unclaimed'
            ? (t('workstation.unclaimed'))
            : selectedScope === 'emergency'
                ? t('workstation.urgent')
                : selectedScope === 'rooms'
                    ? t('workstation.selectedRooms')
                    : selectedScope === 'modalities'
                        ? t('workstation.selectedDevices')
                        : (t('workstation.all'));

    const activeUserName = currentUser?.full_name || currentUser?.name || currentUser?.username || (t('workstation.staff'));

    const warning = selectedScope === 'rooms' && selectedRooms.length === 0
        ? t('workstation.warningRooms')
        : selectedScope === 'modalities' && selectedModalities.length === 0
            ? t('workstation.warningDevices')
            : null;

    const setScope = (scope) => {
        if (workstationLocked && ['rooms', 'modalities'].includes(scope)) return;
        onScopeChange?.(scope);
    };

    useEffect(() => {
        if (activeFilterCount > 0) setFiltersExpanded(true);
    }, [activeFilterCount]);

    return (
        <section className="relative z-[45] overflow-visible" aria-label={t('workstation.controlsLabel')}>
            <div className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:p-2 dark:border-slate-800 dark:bg-[#0b1426]">
                <div className="grid min-w-0 grid-cols-1 gap-1.5 lg:grid-cols-[minmax(205px,250px)_minmax(0,1fr)] lg:items-center 2xl:grid-cols-[minmax(215px,245px)_minmax(0,1fr)_auto]">
                    <div className="flex min-h-10 min-w-0 w-full items-center gap-2 rounded-xl border border-teal-200/90 bg-slate-50 px-2 py-1 shadow-2xs dark:border-teal-900/60 dark:bg-[#070e1a]">
                        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-teal-200 bg-white text-teal-700 shadow-2xs dark:border-teal-800 dark:bg-[#091222] dark:text-teal-300">
                            <Monitor size={15} />
                            <span className={`absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${isRealtimeConnected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-300">
                                <span>{t('workstation.label')}</span>
                                {receptionShift ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        {sessionLabel}
                                    </span>
                                ) : (
                                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                                        {t('workstation.shiftOff')}
                                    </span>
                                )}
                            </div>
                            <div className="relative mt-0.5">
                                <button
                                    type="button"
                                    disabled={workstationLocked}
                                    onClick={() => setOpenMenu(openMenu === 'desk' ? null : 'desk')}
                                    title={workstationLocked ? t('workstation.lockedShiftHint', { defaultValue: 'Locked while a reception shift is open' }) : undefined}
                                    className="flex max-w-full items-center gap-1 rounded-lg px-1 py-0.5 text-start text-xs font-black text-slate-800 transition hover:bg-slate-200/60 hover:text-teal-700 disabled:cursor-default disabled:hover:text-slate-800 dark:text-slate-100 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                                >
                                    <span className="truncate">{activeDesk}</span>
                                    {workstationLocked
                                        ? <Lock size={11} className="shrink-0 text-slate-500" aria-label={t('workstation.lockedShiftHint', { defaultValue: 'Locked while a reception shift is open' })} />
                                        : <ChevronDown size={12} className="shrink-0 text-slate-500" />}
                                </button>
                                {openMenu === 'desk' && (
                                    <>
                                        <MenuBackdrop onClick={() => setOpenMenu(null)} />
                                        <div className="absolute start-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-[#091222]">
                                            <p className="px-2 pb-1.5 pt-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{t('workstation.chooseDesk')}</p>
                                            {(deskPresets || []).map((desk) => {
                                                const active = (desk.id && activeDeskId === desk.id) || desk.label === activeDesk;
                                                const deskDescription = isArabic ? desk.descAr : desk.descEn;
                                                return (
                                                    <button
                                                        key={desk.id || desk.label}
                                                        type="button"
                                                        onClick={() => {
                                                             onDeskChange?.(desk.label);
                                                            setOpenMenu(null);
                                                        }}
                                                        className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition ${active ? 'bg-teal-50 text-teal-900 dark:bg-[#072424] dark:text-teal-200' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#070e1a]'}`}
                                                    >
                                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm dark:bg-slate-800">{desk.icon || '🖥️'}</span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-xs font-black">{desk.label}</span>
                                                            {deskDescription && <span className="block truncate text-[9.5px] text-slate-500 dark:text-slate-400">{deskDescription}</span>}
                                                        </span>
                                                        {active && <Check size={13} className="text-teal-600" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="min-w-0 flex-1 overflow-visible">
                        <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-0.5 lg:rounded-xl dark:border-slate-800 dark:bg-[#070e1a]">
                            <ScopeButton active={selectedScope === 'all'} label={t('workstation.all', { defaultValue: 'كل الحالات' })} count={counts.total} ariaLabel={t('workstation.all', { defaultValue: 'كل الحالات' })} onClick={() => setScope('all')} />
                            <ScopeButton
                                active={selectedScope === 'attention'}
                                icon={AlertTriangle}
                                label={t('workstation.attentionShort', { defaultValue: 'انتباه' })}
                                count={counts.attention || 0}
                                tone="rose"
                                ariaLabel={t('workstation.attention', { defaultValue: 'حالات تتطلب الانتباه' })}
                                onClick={() => setScope('attention')}
                            />
                            <ScopeButton active={selectedScope === 'mine'} icon={UserCheck} label={t('workstation.mine', { defaultValue: 'مهامي' })} count={counts.mine} ariaLabel={t('workstation.mine', { defaultValue: 'مهامي' })} onClick={() => setScope('mine')} />
                            <ScopeButton active={selectedScope === 'unclaimed'} icon={UsersRound} label={t('workstation.unclaimed', { defaultValue: 'غير مستلمة' })} count={counts.unclaimed} tone="amber" onClick={() => setScope('unclaimed')} />
                            <ScopeButton active={selectedScope === 'inExam'} icon={Check} label={t('workstation.exam', { defaultValue: 'فحص' })} count={counts.inExam} tone="amber" ariaLabel={t('workstation.exam', { defaultValue: 'فحص' })} onClick={() => setScope('inExam')} />
                            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" />

                            <button
                                type="button"
                                aria-expanded={filtersExpanded}
                                aria-controls="reception-clinical-filters"
                                onClick={() => {
                                    setFiltersExpanded((value) => !value);
                                    setOpenMenu(null);
                                }}
                                className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[10px] sm:text-[11px] font-black transition ${filtersExpanded || activeFilterCount > 0
                                    ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800/80 dark:bg-[#072424] dark:text-teal-200'
                                    : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-[#091222] dark:hover:text-white'}`}
                            >
                                <Filter size={13} />
                                <span>{t('workstation.filters', { defaultValue: 'الفلاتر' })}</span>
                                {activeFilterCount > 0 && (
                                    <span className="min-w-5 rounded-full bg-teal-600 px-1.5 py-0.5 text-center text-[10px] text-white">{activeFilterCount}</span>
                                )}
                                <ChevronDown size={11} className={`transition-transform ${filtersExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {filtersExpanded && <div id="reception-clinical-filters" className="contents">
                            <div className="relative z-20">
                                <button
                                    type="button"
                                    aria-label={t('workstation.rooms', { defaultValue: 'الغرف' })}
                                    disabled={workstationLocked || rooms.length === 0}
                                    title={workstationLocked ? t('workstation.lockedShiftHint', { defaultValue: 'Locked while a reception shift is open' }) : undefined}
                                    onClick={() => setOpenMenu(openMenu === 'rooms' ? null : 'rooms')}
                                    className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[10px] sm:text-[11px] font-black transition-all duration-200 disabled:opacity-45 ${selectedRooms.length ? 'border-teal-300 bg-teal-50 text-teal-800 shadow-2xs dark:border-teal-800/80 dark:bg-[#072424] dark:text-teal-200' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-[#091222] dark:hover:text-white'}`}
                                >
                                    <DoorOpen size={12} />
                                    <span>{t('workstation.rooms', { defaultValue: 'الغرف' })}</span>
                                    {selectedRooms.length > 0 && <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-[9px] text-white">{selectedRooms.length}</span>}
                                    <ChevronDown size={10} />
                                </button>
                                {openMenu === 'rooms' && (
                                    <FilterMenu
                                        title={t('workstation.filterRooms', { defaultValue: 'تصفية حسب الغرف' })}
                                        icon={DoorOpen}
                                        items={rooms}
                                        selected={selectedRooms.map(String)}
                                        onToggle={(value) => {
                                            onToggleRoom?.(value);
                                            onScopeChange?.('rooms');
                                        }}
                                        onClear={onClearRooms}
                                        search={roomSearch}
                                        setSearch={setRoomSearch}
                                        placeholder={t('workstation.searchRooms', { defaultValue: 'بحث في الغرف...' })}
                                        disabled={workstationLocked}
                                        emptyLabel={t('workstation.noRooms', { defaultValue: 'لا توجد غرف مطابقة' })}
                                        onClose={() => setOpenMenu(null)}
                                    />
                                )}
                            </div>

                            <div className="relative z-20">
                                <button
                                    type="button"
                                    aria-label={t('workstation.filterDevices', { defaultValue: 'تصفية حسب الأجهزة' })}
                                    disabled={workstationLocked || modalities.length === 0}
                                    title={workstationLocked ? t('workstation.lockedShiftHint', { defaultValue: 'Locked while a reception shift is open' }) : undefined}
                                    onClick={() => setOpenMenu(openMenu === 'modalities' ? null : 'modalities')}
                                    className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[10px] sm:text-[11px] font-black transition-all duration-200 disabled:opacity-45 ${selectedModalities.length ? 'border-violet-300 bg-violet-50 text-violet-800 shadow-2xs dark:border-violet-800/80 dark:bg-[#1a1033] dark:text-violet-200' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-[#091222] dark:hover:text-white'}`}
                                >
                                    <Cpu size={12} />
                                    <span>{t('workstation.devices', { defaultValue: 'الأجهزة' })}</span>
                                    {selectedModalities.length > 0 && <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] text-white">{selectedModalities.length}</span>}
                                    <ChevronDown size={10} />
                                </button>
                                {openMenu === 'modalities' && (
                                    <FilterMenu
                                        title={t('workstation.filterDevices', { defaultValue: 'تصفية حسب الأجهزة' })}
                                        icon={Cpu}
                                        items={modalities}
                                        selected={selectedModalities.map(String)}
                                        onToggle={(value) => {
                                            onToggleModality?.(value);
                                            onScopeChange?.('modalities');
                                        }}
                                        onClear={onClearModalities}
                                        search={modalitySearch}
                                        setSearch={setModalitySearch}
                                        placeholder={t('workstation.searchDevices', { defaultValue: 'بحث في الأجهزة...' })}
                                        disabled={workstationLocked}
                                        accent="violet"
                                        emptyLabel={t('workstation.noDevices', { defaultValue: 'لا توجد أجهزة مطابقة' })}
                                        onClose={() => setOpenMenu(null)}
                                    />
                                )}
                            </div>
                            </div>}
                        </div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 border-t border-slate-200 pt-1.5 dark:border-slate-800 lg:col-span-2 2xl:col-span-1 2xl:flex-nowrap 2xl:border-t-0 2xl:pt-0">
                        {activeFilterCount > 0 && !workstationLocked && (
                            <button
                                type="button"
                                aria-label={t('workstation.clearClinicalFilters', { defaultValue: 'مسح كافة الفلاتر السريرية' })}
                                onClick={onClearAll}
                                title={t('workstation.clearClinicalFilters', { defaultValue: 'مسح كافة الفلاتر السريرية' })}
                                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-[#070e1a] dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/30"
                            >
                                <Filter size={14} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onOpenDisplayBoard}
                            aria-label={t('workstation.waitingDisplay', { defaultValue: 'شاشة الانتظار' })}
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-[#070e1a] dark:text-slate-200 dark:hover:border-teal-800 dark:hover:bg-[#072424] dark:hover:text-teal-300"
                            title={t('workstation.openWaitingDisplay', { defaultValue: 'فتح شاشة الانتظار للمرضى' })}
                        >
                            <Tv size={13} />
                            <span className="hidden sm:inline">{t('workstation.waitingDisplay', { defaultValue: 'شاشة الانتظار' })}</span>
                            <ExternalLink size={10} className="opacity-70" />
                        </button>
                        <button
                            type="button"
                            disabled={isShiftLoading}
                            onClick={receptionShift ? onCloseShift : onOpenShift}
                            className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-black text-white shadow-sm transition active:scale-[.98] disabled:cursor-wait disabled:opacity-55 ${receptionShift ? 'bg-slate-800 hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                        >
                            <Clock3 size={13} />
                            <span>{receptionShift ? t('workstation.closeShift', { defaultValue: 'تقفيل الوردية' }) : t('workstation.startShift', { defaultValue: 'بدء الوردية' })}</span>
                        </button>
                    </div>
                </div>

                {(warning || activeFilterCount > 0) && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-[#070e1a]">
                        {warning ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/35 dark:text-amber-300">
                                <AlertTriangle size={12} />{warning}
                            </span>
                        ) : (
                            <>
                                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{t('workstation.activeFilters', { defaultValue: 'الفلاتر النشطة' })}</span>
                                {selectedRoomLabels.slice(0, 2).map((label, index) => (
                                    <span key={`room-label-${index}-${label}`} title={label} className="inline-flex max-w-[7rem] items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[9px] font-black text-teal-800 sm:max-w-44 sm:text-[10px] dark:border-teal-800/80 dark:bg-teal-950/40 dark:text-teal-300">
                                        <DoorOpen size={10} className="shrink-0" /><span className="truncate">{label}</span>
                                    </span>
                                ))}
                                {selectedModalityLabels.slice(0, 2).map((label, index) => (
                                    <span key={`mod-label-${index}-${label}`} title={label} className="inline-flex max-w-[7rem] items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[9px] font-black text-violet-800 sm:max-w-44 sm:text-[10px] dark:border-violet-800/80 dark:bg-violet-950/40 dark:text-violet-300">
                                        <Cpu size={10} className="shrink-0" /><span className="truncate">{label}</span>
                                    </span>
                                ))}
                                {(selectedRooms.length > 2 || selectedModalities.length > 2 || unresolvedScopeCount > 0) && (
                                    <span
                                        className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                        title={t('workstation.hiddenIdentifiers')}
                                    >
                                        +{Math.max(0, activeFilterCount - Math.min(2, selectedRoomLabels.length) - Math.min(2, selectedModalityLabels.length))}
                                    </span>
                                )}
                                <span className="ms-auto inline-flex min-w-0 max-w-full items-center gap-1 text-[10px] font-semibold text-slate-500 sm:text-xs dark:text-slate-400">
                                    <span className="truncate max-w-[6rem] sm:max-w-40" title={activeUserName}>{activeUserName}</span>
                                    <span className="mx-1">·</span>
                                    <span>{scopeLabel}</span>
                                    {(counts.overdue > 0 || counts.emergency > 0) && (
                                        <>
                                            <span className="mx-1">·</span>
                                            <span className={counts.overdue > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>
                                                {counts.overdue > 0
                                                    ? `${counts.overdue} ${t('workstation.overdue')}`
                                                    : `${counts.emergency} ${t('workstation.urgent')}`}
                                            </span>
                                        </>
                                    )}
                                    {currentPreset?.label && <span className="sr-only">{currentPreset.label}</span>}
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
});

ReceptionWorkstationBar.displayName = 'ReceptionWorkstationBar';

export { ReceptionWorkstationBar };
export default ReceptionWorkstationBar;
