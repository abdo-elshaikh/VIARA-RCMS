import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    DoorClosed,
    Pencil,
    Plus,
    Save,
    Trash2,
    Copy,
    Search,
    Monitor,
    CheckCircle2,
    RotateCcw,
    AlertTriangle,
    Layers,
    Cpu,
    Calendar,
    CircleDollarSign,
    WalletCards,
    UsersRound,
    Check,
    HelpCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import {
    useGetCenterSettingsQuery,
    useGetMachinesQuery,
    useGetRoomsQuery,
    useUpdateCenterSettingsMutation
} from '../../store/api';
import { hasDeveloperOrAdminRole } from '../../utils/roles';
import { getEffectivePermissions } from '../../utils/effectivePermissions';
import { readWorkstationPresets, saveWorkstationPresets } from '../reception/workstationPresets';
import Modal from '../ui/Modal';

const WORKSTATION_SCOPES = ['all', 'rooms', 'modalities', 'emergency'];
const WORKSTATION_TABS = ['', 'schedule', 'patients', 'cashier', 'billing'];
const PRESET_ICONS = ['🖥️', '🧲', '📡', '💳', '🚨', '🏥', '🩺', '🧪', '🔬', '📋', '⚡', '🏢'];

const getPresetScope = (preset) => {
    if (preset.scope && preset.scope !== 'all') return preset.scope;
    if (preset.roomIds?.length) return 'rooms';
    if (preset.modalityIds?.length) return 'modalities';
    return 'all';
};

// Clean deduplication utility to prevent redundant presets and duplicate allocations
const deduplicatePresets = (items) => {
    if (!Array.isArray(items)) return [];
    const seenIds = new Set();
    const seenLabels = new Set();
    const result = [];

    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const label = String(item.label || '').trim();
        if (!label) continue;

        const normalizedLabel = label.toLowerCase();
        let id = String(item.id || '').trim();
        if (!id || seenIds.has(id)) {
            id = `ws-${Date.now()}-${result.length + 1}`;
        }
        if (seenLabels.has(normalizedLabel)) {
            continue; // Skip exact duplicate workstation names
        }

        seenIds.add(id);
        seenLabels.add(normalizedLabel);

        // Deduplicate room IDs and modality IDs within preset
        const roomIds = Array.from(new Set((Array.isArray(item.roomIds) ? item.roomIds : []).map(String)));
        const modalityIds = Array.from(new Set((Array.isArray(item.modalityIds) ? item.modalityIds : []).map(String)));
        const scope = getPresetScope({ ...item, roomIds, modalityIds });

        result.push({
            ...item,
            id,
            label,
            icon: item.icon?.trim() || '🖥️',
            descAr: item.descAr || '',
            descEn: item.descEn || '',
            scope,
            tab: item.tab || '',
            roomIds: scope === 'rooms' ? roomIds : [],
            modalityIds: scope === 'modalities' ? modalityIds : [],
        });
    }

    return result;
};

const EquipmentWorkstationMapping = () => {
    const { i18n } = useTranslation('reception');
    const isArabic = i18n.language?.startsWith('ar');
    const user = useSelector(selectCurrentUser);

    const { data: rooms = [] } = useGetRoomsQuery();
    const { data: machines = [] } = useGetMachinesQuery();
    const { data: centerSettings, isLoading: settingsLoading } = useGetCenterSettingsQuery();
    const [updateCenterSettings, { isLoading: saving }] = useUpdateCenterSettingsMutation();

    const [presets, setPresets] = useState(() => deduplicatePresets(readWorkstationPresets()));
    const [serverBaseline, setServerBaseline] = useState(() => deduplicatePresets(readWorkstationPresets()));

    // Search and filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedScopeFilter, setSelectedScopeFilter] = useState('all_filter');

    // Modal state for Add/Edit
    const [draftModalOpen, setDraftModalOpen] = useState(false);
    const [draft, setDraft] = useState(null);
    const [nameError, setNameError] = useState('');

    const permissions = useMemo(() => getEffectivePermissions(user), [user]);
    const canManage = hasDeveloperOrAdminRole(user?.role) || (
        Array.isArray(user?.permissions) && (
            permissions.has('MANAGE_EQUIPMENT')
            || permissions.has('MANAGE_EXAM_CATALOG')
        )
    );

    // Sync from centerSettings securely without infinite loops
    useEffect(() => {
        if (Array.isArray(centerSettings?.workstation_presets) && centerSettings.workstation_presets.length > 0) {
            const clean = deduplicatePresets(centerSettings.workstation_presets);
            setPresets((current) => {
                if (JSON.stringify(current) === JSON.stringify(clean)) {
                    return current;
                }
                return clean;
            });
            setServerBaseline(clean);
        }
    }, [centerSettings?.workstation_presets]);

    // Unique machine options
    const machineOptions = useMemo(() => {
        const byValue = new Map();
        (machines || []).forEach((machine) => {
            const value = String(machine.name || machine.modality_name || machine.modality_id || machine.id || '').trim();
            if (!value) return;
            byValue.set(value, {
                value,
                label: machine.name || machine.type || value,
                type: machine.type || 'Imaging',
                room: machine.room_number || machine.room_name || ''
            });
        });
        return Array.from(byValue.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [machines]);

    // Overlap mapping: detect if a room or machine is shared across multiple workstations
    const roomAllocationMap = useMemo(() => {
        const map = new Map();
        presets.forEach((preset) => {
            (preset.roomIds || []).forEach((rId) => {
                const list = map.get(rId) || [];
                list.push(preset.label);
                map.set(rId, list);
            });
        });
        return map;
    }, [presets]);

    const modalityAllocationMap = useMemo(() => {
        const map = new Map();
        presets.forEach((preset) => {
            (preset.modalityIds || []).forEach((mId) => {
                const list = map.get(mId) || [];
                list.push(preset.label);
                map.set(mId, list);
            });
        });
        return map;
    }, [presets]);

    // Has unsaved changes comparison
    const hasUnsavedChanges = useMemo(() => {
        return JSON.stringify(presets) !== JSON.stringify(serverBaseline);
    }, [presets, serverBaseline]);

    // Bilingual label strings
    const labels = useMemo(() => (isArabic ? {
        title: 'تخصيص محطات الاستقبال والغرف والأجهزة',
        subtitle: 'إدارة شبابيك الاستقبال وربط كل محطة بالنطاق التشغيلي المناسب والغرف والأجهزة التابعة لها لمنع التعارض والتكرار.',
        totalWorkstations: 'إجمالي المحطات',
        allScopeCount: 'شاملة / عامة',
        roomsScopeCount: 'نطاق الغرف',
        modalitiesScopeCount: 'نطاق الأجهزة',
        emergencyScopeCount: 'طوارئ',
        searchPlaceholder: 'بحث باسم المحطة أو الوصف أو الغرفة...',
        allFilters: 'جميع النطاقات',
        filterAll: 'العامة / الشاملة',
        filterRooms: 'محددة بغرف',
        filterModalities: 'محددة بأجهزة',
        filterEmergency: 'طوارئ',
        add: 'إضافة محطة استقبال',
        save: 'حفظ التعديلات',
        reset: 'تراجع عن التعديلات',
        edit: 'تعديل المحطة',
        duplicate: 'نسخ المحطة',
        remove: 'حذف المحطة',
        confirmDeleteTitle: 'حذف محطة الاستقبال',
        confirmDeleteMsg: 'هل أنت متأكد من حذف هذه المحطة؟',
        devices: 'الأجهزة المرتبطة',
        roomsAssigned: 'الغرف المرتبطة',
        noDevices: 'لا توجد أجهزة مخصصة',
        noRooms: 'لا توجد غرف مخصصة',
        scope: 'نطاق العمل',
        tab: 'التبويب الافتراضي',
        tabNone: 'التبويب الرئيسي (الجدول)',
        tabSchedule: 'جدول المواعيد',
        tabPatients: 'دليل المرضى',
        tabCashier: 'طابور الخزينة',
        tabBilling: 'الفوترة والمطالبات',
        scopeAll: 'كل الحالات (شامل)',
        scopeAllDesc: 'تستقبل كافة الفحوصات الطبية والأجهزة بدون قيود محددة.',
        scopeRooms: 'غرف سريرية محددة',
        scopeRoomsDesc: 'تقتصر المحطة على طلبات وفحوصات غرف معينة فقط.',
        scopeModalities: 'أجهزة تصوير محددة',
        scopeModalitiesDesc: 'تقتصر المحطة على فحوصات أجهزة ووحدات أشعة محددة.',
        scopeEmergency: 'استقبال طوارئ',
        scopeEmergencyDesc: 'مخصصة للحالات الحرجة والأولوية القصوى والتسكين الفوري.',
        name: 'اسم المحطة (مثال: شباك 1 - الاستقبال العام)',
        nameRequired: 'يرجى إدخال اسم المحطة',
        nameDuplicate: 'اسم المحطة مستخدم بالفعل، يرجى كتابة اسم فريد لمنع التكرار',
        icon: 'الأيقونة التعبيرية',
        descAr: 'الوصف بالعربية',
        descEn: 'الوصف بالإنجليزية',
        saveModal: 'تطبيق البيانات',
        cancel: 'إلغاء',
        unsavedNotice: 'لديك تعديلات غير محفوظة على تخصيصات المحطات.',
        saveSuccess: 'تم حفظ إعدادات محطات الاستقبال بنجاح في النظام.',
        saveError: 'حدث خطأ أثناء حفظ إعدادات المحطات.',
        invalidMixedScope: 'لا يمكن ربط غرف وأجهزة معًا لنفس المحطة؛ اختر نطاق الغرف أو نطاق الأجهزة.',
        invalidRoomScope: 'يجب اختيار غرفة واحدة على الأقل للمحطات محددة بنطاق الغرف.',
        invalidModalityScope: 'يجب اختيار جهاز واحد على الأقل للمحطات محددة بنطاق الأجهزة.',
        readOnlyNotice: 'يمكنك استعراض تخصيصات محطات الاستقبال. يلزم صلاحية إدارة الأجهزة أو فهرس الفحوصات لإجراء تعديلات.',
        selectRooms: 'حدد الغرف السريرية التابعة:',
        selectModalities: 'حدد الأجهزة والوحدات التابعة:',
        sharedNotice: 'مشترك مع:',
        emptySearch: 'لم يتم العثور على محطات مطابقة للبحث',
    } : {
        title: 'Reception Workstations & Clinical Scope Mapping',
        subtitle: 'Configure reception desks, link clinical suites, modalities, and operational tabs while eliminating duplicate assignments and scheduling conflicts.',
        totalWorkstations: 'Total Workstations',
        allScopeCount: 'General / All',
        roomsScopeCount: 'Room Scoped',
        modalitiesScopeCount: 'Device Scoped',
        emergencyScopeCount: 'Emergency',
        searchPlaceholder: 'Search workstation, description, or room...',
        allFilters: 'All Scopes',
        filterAll: 'General / All cases',
        filterRooms: 'Room-scoped',
        filterModalities: 'Device-scoped',
        filterEmergency: 'Emergency',
        add: 'Add Workstation',
        save: 'Save Changes',
        reset: 'Reset Changes',
        edit: 'Edit Workstation',
        duplicate: 'Duplicate',
        remove: 'Remove',
        confirmDeleteTitle: 'Remove Workstation',
        confirmDeleteMsg: 'Are you sure you want to remove this workstation?',
        devices: 'Assigned Devices',
        roomsAssigned: 'Assigned Rooms',
        noDevices: 'No devices assigned',
        noRooms: 'No rooms assigned',
        scope: 'Operational Scope',
        tab: 'Default Workspace Tab',
        tabNone: 'Default Tab (Schedule)',
        tabSchedule: 'Appointment Schedule',
        tabPatients: 'Patient Directory',
        tabCashier: 'Cashier Queue',
        tabBilling: 'Billing & Claims',
        scopeAll: 'All Cases (Global)',
        scopeAllDesc: 'Intake for all modalities and rooms without restrictions.',
        scopeRooms: 'Clinical Rooms',
        scopeRoomsDesc: 'Restricted to intake for specified exam suites and rooms.',
        scopeModalities: 'Imaging Devices',
        scopeModalitiesDesc: 'Restricted to intake for specific modalities & scanners.',
        scopeEmergency: 'Emergency Triage',
        scopeEmergencyDesc: 'Dedicated to urgent cases, triage, and rapid admissions.',
        name: 'Workstation Name (e.g. Desk 1 - Main Intake)',
        nameRequired: 'Workstation name is required',
        nameDuplicate: 'Workstation name already exists. Please choose a unique name.',
        icon: 'Display Icon',
        descAr: 'Description (Arabic)',
        descEn: 'Description (English)',
        saveModal: 'Apply Changes',
        cancel: 'Cancel',
        unsavedNotice: 'You have unsaved changes to workstation allocations.',
        saveSuccess: 'Reception workstation configurations saved successfully.',
        saveError: 'Could not save workstation configurations.',
        invalidMixedScope: 'Workstations cannot mix rooms and modalities together. Select either rooms or modalities.',
        invalidRoomScope: 'Please assign at least one room to room-scoped workstations.',
        invalidModalityScope: 'Please assign at least one device to device-scoped workstations.',
        readOnlyNotice: 'Viewing workstation configurations. Equipment or catalog management permissions required to modify.',
        selectRooms: 'Select Assigned Clinical Rooms:',
        selectModalities: 'Select Assigned Imaging Devices:',
        sharedNotice: 'Shared with:',
        emptySearch: 'No workstations match your search criteria',
    }), [isArabic]);

    // Save changes to backend
    const saveChanges = async () => {
        if (!canManage) return;

        const validRoomIds = new Set(rooms.map((room) => String(room.id || room.room_id || room.room_number || room.name)));
        const validModalityIds = new Set(machineOptions.map((machine) => machine.value));

        try {
            // Validation: prevent mixed scope
            if (presets.some((preset) => (preset.roomIds || []).length > 0 && (preset.modalityIds || []).length > 0)) {
                toast.error(labels.invalidMixedScope);
                return;
            }

            const cleanPayload = presets.map(({ modalityTypes, ...preset }) => {
                const roomIds = (Array.isArray(preset.roomIds) ? preset.roomIds : [])
                    .map(String)
                    .filter((roomId) => validRoomIds.has(roomId));
                const modalityIds = (Array.isArray(preset.modalityIds) ? preset.modalityIds : [])
                    .map(String)
                    .filter((modalityId) => validModalityIds.has(modalityId));
                const scope = getPresetScope({ ...preset, roomIds, modalityIds });

                return {
                    ...preset,
                    id: String(preset.id || `ws-${Date.now()}`),
                    label: preset.label.trim(),
                    scope,
                    roomIds: scope === 'rooms' ? roomIds : [],
                    modalityIds: scope === 'modalities' ? modalityIds : [],
                };
            });

            if (cleanPayload.some((preset) => preset.scope === 'rooms' && preset.roomIds.length === 0)) {
                toast.error(labels.invalidRoomScope);
                return;
            }
            if (cleanPayload.some((preset) => preset.scope === 'modalities' && preset.modalityIds.length === 0)) {
                toast.error(labels.invalidModalityScope);
                return;
            }

            const saved = await updateCenterSettings({ workstation_presets: cleanPayload }).unwrap();
            const persisted = Array.isArray(saved?.workstation_presets) && saved.workstation_presets.length > 0
                ? deduplicatePresets(saved.workstation_presets)
                : cleanPayload;

            setPresets(persisted);
            setServerBaseline(persisted);
            saveWorkstationPresets(persisted);
            toast.success(labels.saveSuccess);
        } catch {
            toast.error(labels.saveError);
        }
    };

    // Reset local modifications
    const handleReset = () => {
        setPresets(serverBaseline);
        toast(isArabic ? 'تمت إعادة تعيين التعديلات' : 'Changes reset to baseline', { icon: '🔄' });
    };

    // Open Add or Edit modal
    const handleOpenDraft = (preset = null) => {
        setNameError('');
        if (preset) {
            setDraft({
                ...preset,
                roomIds: [...(preset.roomIds || [])],
                modalityIds: [...(preset.modalityIds || [])],
                scope: preset.scope || 'all',
                tab: preset.tab || ''
            });
        } else {
            setDraft({
                id: 'new',
                label: '',
                icon: '🖥️',
                descAr: '',
                descEn: '',
                roomIds: [],
                modalityIds: [],
                scope: 'all',
                tab: ''
            });
        }
        setDraftModalOpen(true);
    };

    // Duplicate preset
    const handleDuplicate = (preset) => {
        if (!canManage) return;
        const copySuffix = isArabic ? ' (نسخة)' : ' (Copy)';
        let newLabel = `${preset.label}${copySuffix}`;

        // Ensure unique name
        let counter = 1;
        while (presets.some((p) => p.label.trim().toLowerCase() === newLabel.toLowerCase())) {
            counter += 1;
            newLabel = `${preset.label}${copySuffix} ${counter}`;
        }

        const newPreset = {
            ...preset,
            id: `ws-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            label: newLabel,
            roomIds: [...(preset.roomIds || [])],
            modalityIds: [...(preset.modalityIds || [])]
        };

        setPresets((curr) => [...curr, newPreset]);
        toast.success(isArabic ? `تم إنشاء نسخة من ${preset.label}` : `Created duplicate of ${preset.label}`);
    };

    // Save draft from Modal with duplicate check
    const handleSaveDraft = () => {
        const trimmedLabel = (draft?.label || '').trim();
        if (!trimmedLabel) {
            setNameError(labels.nameRequired);
            return;
        }

        // Check for duplicates: no other workstation should share this normalized label
        const isDuplicate = presets.some((p) =>
            p.id !== draft.id && p.label.trim().toLowerCase() === trimmedLabel.toLowerCase()
        );

        if (isDuplicate) {
            setNameError(labels.nameDuplicate);
            return;
        }

        const scope = WORKSTATION_SCOPES.includes(draft.scope) ? draft.scope : 'all';
        const tab = draft.tab || undefined;
        const roomIds = scope === 'rooms' ? Array.from(new Set(draft.roomIds || [])) : [];
        const modalityIds = scope === 'modalities' ? Array.from(new Set(draft.modalityIds || [])) : [];

        if (draft.id === 'new') {
            const created = {
                id: `ws-${Date.now()}`,
                label: trimmedLabel,
                icon: draft.icon?.trim() || '🖥️',
                descAr: draft.descAr || '',
                descEn: draft.descEn || '',
                scope,
                tab,
                roomIds,
                modalityIds
            };
            setPresets((curr) => deduplicatePresets([...curr, created]));
        } else {
            setPresets((curr) => deduplicatePresets(curr.map((p) => (p.id === draft.id ? {
                ...p,
                ...draft,
                label: trimmedLabel,
                scope,
                tab,
                roomIds,
                modalityIds
            } : p))));
        }

        setDraftModalOpen(false);
        setDraft(null);
    };

    // Toggle room assignment directly on card
    const toggleRoom = useCallback((presetId, roomId) => {
        if (!canManage) return;
        setPresets((curr) => curr.map((preset) => {
            if (preset.id !== presetId) return preset;
            const roomIds = (preset.roomIds || []).map(String);
            const nextRoomIds = roomIds.includes(roomId)
                ? roomIds.filter((id) => id !== roomId)
                : [...roomIds, roomId];
            return {
                ...preset,
                roomIds: nextRoomIds,
                modalityIds: [],
                scope: nextRoomIds.length ? 'rooms' : 'all'
            };
        }));
    }, [canManage]);

    // Toggle modality assignment directly on card
    const toggleModality = useCallback((presetId, modalityValue) => {
        if (!canManage) return;
        setPresets((curr) => curr.map((preset) => {
            if (preset.id !== presetId) return preset;
            const modalityIds = (preset.modalityIds || []).map(String);
            const nextModalityIds = modalityIds.includes(modalityValue)
                ? modalityIds.filter((id) => id !== modalityValue)
                : [...modalityIds, modalityValue];
            return {
                ...preset,
                modalityIds: nextModalityIds,
                roomIds: [],
                scope: nextModalityIds.length ? 'modalities' : 'all'
            };
        }));
    }, [canManage]);

    // Delete preset with minimum 1 invariant
    const handleDeletePreset = (presetId) => {
        if (!canManage || presets.length <= 1) return;
        setPresets((curr) => curr.filter((item) => item.id !== presetId));
        toast.success(isArabic ? 'تم حذف المحطة' : 'Workstation removed');
    };

    // Filter presets
    const filteredPresets = useMemo(() => {
        return presets.filter((preset) => {
            const matchesSearch = !searchTerm.trim() || (
                preset.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (preset.descAr && preset.descAr.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (preset.descEn && preset.descEn.toLowerCase().includes(searchTerm.toLowerCase()))
            );

            if (!matchesSearch) return false;

            const scope = getPresetScope(preset);
            if (selectedScopeFilter === 'all_filter') return true;
            if (selectedScopeFilter === 'all' && scope === 'all') return true;
            if (selectedScopeFilter === 'rooms' && scope === 'rooms') return true;
            if (selectedScopeFilter === 'modalities' && scope === 'modalities') return true;
            if (selectedScopeFilter === 'emergency' && scope === 'emergency') return true;
            return false;
        });
    }, [presets, searchTerm, selectedScopeFilter]);

    // Metric summaries
    const metrics = useMemo(() => {
        let allCount = 0;
        let roomsCount = 0;
        let modalitiesCount = 0;
        let emergencyCount = 0;

        presets.forEach((p) => {
            const s = getPresetScope(p);
            if (s === 'rooms') roomsCount += 1;
            else if (s === 'modalities') modalitiesCount += 1;
            else if (s === 'emergency') emergencyCount += 1;
            else allCount += 1;
        });

        return {
            total: presets.length,
            all: allCount,
            rooms: roomsCount,
            modalities: modalitiesCount,
            emergency: emergencyCount
        };
    }, [presets]);

    const getScopeBadgeStyle = (scope) => {
        switch (scope) {
            case 'rooms':
                return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
            case 'modalities':
                return 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300';
            case 'emergency':
                return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
            default:
                return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
        }
    };

    const getTabBadge = (tab) => {
        if (!tab || tab === 'schedule') return { label: labels.tabSchedule, icon: Calendar };
        if (tab === 'cashier') return { label: labels.tabCashier, icon: CircleDollarSign };
        if (tab === 'billing') return { label: labels.tabBilling, icon: WalletCards };
        if (tab === 'patients') return { label: labels.tabPatients, icon: UsersRound };
        return { label: tab, icon: Monitor };
    };

    return (
        <section
            className="space-y-4"
            aria-labelledby="equipment-workstations-title"
        >
            {/* Header & Metric Ribbon */}
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <header className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-b from-slate-50/90 to-white p-5 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3.5">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-600/10 text-teal-700 shadow-sm ring-1 ring-teal-500/20 dark:bg-teal-500/20 dark:text-teal-300">
                            <Monitor size={22} className="stroke-[2.2]" />
                        </span>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 id="equipment-workstations-title" className="text-base font-black text-slate-900 dark:text-white">
                                    {labels.title}
                                </h2>
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {presets.length} {labels.totalWorkstations}
                                </span>
                                {hasUnsavedChanges && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse">
                                        <AlertTriangle size={12} />
                                        {isArabic ? 'تعديلات معلقة' : 'Unsaved changes'}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">
                                {labels.subtitle}
                            </p>
                        </div>
                    </div>

                    {canManage && (
                        <div className="flex flex-wrap items-center gap-2">
                            {hasUnsavedChanges && (
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                    title={labels.reset}
                                >
                                    <RotateCcw size={14} />
                                    {labels.reset}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => handleOpenDraft()}
                                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                <Plus size={15} className="text-teal-600 dark:text-teal-400" />
                                {labels.add}
                            </button>
                            <button
                                type="button"
                                onClick={saveChanges}
                                disabled={saving || settingsLoading || !hasUnsavedChanges}
                                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Save size={15} />
                                {saving ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : labels.save}
                            </button>
                        </div>
                    )}
                </header>

                {!canManage && (
                    <div className="border-b border-amber-200/80 bg-amber-50/70 px-5 py-2.5 text-xs font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                        {labels.readOnlyNotice}
                    </div>
                )}

                {/* Metrics ribbon */}
                <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800 sm:grid-cols-4 rtl:divide-x-reverse">
                    <div className="p-3.5 text-center">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{labels.allScopeCount}</span>
                        <p className="mt-0.5 text-lg font-black text-sky-700 dark:text-sky-300">{metrics.all}</p>
                    </div>
                    <div className="p-3.5 text-center">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{labels.roomsScopeCount}</span>
                        <p className="mt-0.5 text-lg font-black text-emerald-700 dark:text-emerald-300">{metrics.rooms}</p>
                    </div>
                    <div className="p-3.5 text-center">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{labels.modalitiesScopeCount}</span>
                        <p className="mt-0.5 text-lg font-black text-violet-700 dark:text-violet-300">{metrics.modalities}</p>
                    </div>
                    <div className="p-3.5 text-center">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{labels.emergencyScopeCount}</span>
                        <p className="mt-0.5 text-lg font-black text-rose-700 dark:text-rose-300">{metrics.emergency}</p>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={labels.searchPlaceholder}
                        aria-label={labels.searchPlaceholder}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 ps-9 pe-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {[
                        { id: 'all_filter', label: labels.allFilters },
                        { id: 'all', label: labels.filterAll },
                        { id: 'rooms', label: labels.filterRooms },
                        { id: 'modalities', label: labels.filterModalities },
                        { id: 'emergency', label: labels.filterEmergency },
                    ].map((filter) => {
                        const active = selectedScopeFilter === filter.id;
                        return (
                            <button
                                key={filter.id}
                                type="button"
                                onClick={() => setSelectedScopeFilter(filter.id)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                    active
                                        ? 'bg-teal-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                }`}
                            >
                                {filter.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Cards Grid */}
            {filteredPresets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                    <Monitor className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                    <p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-400">
                        {labels.emptySearch}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {filteredPresets.map((preset) => {
                        const scope = getPresetScope(preset);
                        const tabBadge = getTabBadge(preset.tab);
                        const TabIcon = tabBadge.icon;
                        const assignedRoomCount = (preset.roomIds || []).length;
                        const assignedModalityCount = (preset.modalityIds || []).length;

                        return (
                            <article
                                key={preset.id}
                                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-teal-400/60 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/90"
                            >
                                <div>
                                    {/* Workstation Header */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <span
                                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl shadow-inner dark:bg-slate-800"
                                                aria-hidden="true"
                                            >
                                                {preset.icon || '🖥️'}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">
                                                        {preset.label}
                                                    </h3>
                                                    <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${getScopeBadgeStyle(scope)}`}>
                                                        {labels[`scope${scope.charAt(0).toUpperCase()}${scope.slice(1)}`]}
                                                    </span>
                                                </div>
                                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                                                    {isArabic ? preset.descAr || preset.descEn : preset.descEn || preset.descAr}
                                                </p>
                                            </div>
                                        </div>

                                        {canManage && (
                                            <div className="flex shrink-0 items-center gap-1 opacity-90 transition group-hover:opacity-100">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDuplicate(preset)}
                                                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                    title={labels.duplicate}
                                                    aria-label={labels.duplicate}
                                                >
                                                    <Copy size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenDraft(preset)}
                                                    className="rounded-lg p-2 text-slate-500 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-300"
                                                    title={labels.edit}
                                                    aria-label={labels.edit}
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeletePreset(preset.id)}
                                                    disabled={presets.length <= 1}
                                                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                                                    title={labels.remove}
                                                    aria-label={labels.remove}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Meta pills: Tab + Counts */}
                                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            <TabIcon size={13} className="text-teal-600 dark:text-teal-400" />
                                            <span>{tabBadge.label}</span>
                                        </div>

                                        {scope === 'rooms' && (
                                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                <DoorClosed size={13} />
                                                {assignedRoomCount} {labels.roomsAssigned}
                                            </span>
                                        )}

                                        {scope === 'modalities' && (
                                            <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                                                <Cpu size={13} />
                                                {assignedModalityCount} {labels.devices}
                                            </span>
                                        )}
                                    </div>

                                    {/* Room selection / assignment list */}
                                    {scope === 'rooms' && (
                                        <div className="mt-3 space-y-1.5">
                                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                                {labels.selectRooms}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {rooms.map((room) => {
                                                    const roomId = String(room.id || room.room_id || room.room_number || room.name);
                                                    const checked = (preset.roomIds || []).map(String).includes(roomId);
                                                    const sharingDesks = (roomAllocationMap.get(roomId) || []).filter((d) => d !== preset.label);

                                                    return (
                                                        <label
                                                            key={roomId}
                                                            className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition ${
                                                                checked
                                                                    ? 'border-emerald-400 bg-emerald-50/90 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'
                                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                                                            } ${!canManage ? 'cursor-default pointer-events-none' : ''}`}
                                                            title={sharingDesks.length > 0 ? `${labels.sharedNotice} ${sharingDesks.join(', ')}` : undefined}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                disabled={!canManage}
                                                                onChange={() => toggleRoom(preset.id, roomId)}
                                                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700"
                                                            />
                                                            <span>{room.name || room.room_number || roomId}</span>
                                                            {sharingDesks.length > 0 && (
                                                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={`${labels.sharedNotice} ${sharingDesks.join(', ')}`} />
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                                {rooms.length === 0 && (
                                                    <span className="text-xs italic text-slate-400">{labels.noRooms}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Modality selection / assignment list */}
                                    {scope === 'modalities' && (
                                        <div className="mt-3 space-y-1.5">
                                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                                {labels.selectModalities}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {machineOptions.map((machine) => {
                                                    const checked = (preset.modalityIds || []).map(String).includes(machine.value);
                                                    const sharingDesks = (modalityAllocationMap.get(machine.value) || []).filter((d) => d !== preset.label);

                                                    return (
                                                        <label
                                                            key={machine.value}
                                                            className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition ${
                                                                checked
                                                                    ? 'border-violet-400 bg-violet-50/90 text-violet-900 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-200'
                                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                                                            } ${!canManage ? 'cursor-default pointer-events-none' : ''}`}
                                                            title={sharingDesks.length > 0 ? `${labels.sharedNotice} ${sharingDesks.join(', ')}` : undefined}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                disabled={!canManage}
                                                                onChange={() => toggleModality(preset.id, machine.value)}
                                                                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-700"
                                                            />
                                                            <span>{machine.label}</span>
                                                            {sharingDesks.length > 0 && (
                                                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={`${labels.sharedNotice} ${sharingDesks.join(', ')}`} />
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                                {machineOptions.length === 0 && (
                                                    <span className="text-xs italic text-slate-400">{labels.noDevices}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Global & Emergency informative banner */}
                                    {['all', 'emergency'].includes(scope) && (
                                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                                            {labels[`scope${scope.charAt(0).toUpperCase()}${scope.slice(1)}Desc`]}
                                        </div>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {/* Polished Add / Edit Workstation Modal */}
            {draft && (
                <Modal
                    isOpen={draftModalOpen}
                    onClose={() => setDraftModalOpen(false)}
                    title={draft.id === 'new' ? labels.add : labels.edit}
                    size="default"
                    footer={
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDraftModalOpen(false)}
                                className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {labels.cancel}
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveDraft}
                                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-5 text-xs font-black text-white hover:bg-teal-700 shadow-sm shadow-teal-600/20"
                            >
                                <Check size={15} />
                                {labels.saveModal}
                            </button>
                        </div>
                    }
                >
                    <div className="space-y-4 py-1">
                        {/* Name Input with validation against duplicates */}
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-200">
                                {labels.name} <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                aria-label="workstation-name-input"
                                value={draft.label}
                                onChange={(e) => {
                                    setNameError('');
                                    setDraft((curr) => ({ ...curr, label: e.target.value }));
                                }}
                                placeholder={labels.name}
                                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-semibold outline-none transition ${
                                    nameError
                                        ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:border-rose-500 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-200'
                                        : 'border-slate-200 bg-white text-slate-900 focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white'
                                }`}
                                autoFocus
                            />
                            {nameError && (
                                <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{nameError}</p>
                            )}
                        </div>

                        {/* Icon Picker */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-200">
                                {labels.icon}
                            </label>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {PRESET_ICONS.map((icon) => (
                                    <button
                                        key={icon}
                                        type="button"
                                        onClick={() => setDraft((curr) => ({ ...curr, icon }))}
                                        className={`flex h-9 w-9 items-center justify-center rounded-xl text-base transition ${
                                            draft.icon === icon
                                                ? 'bg-teal-600 ring-2 ring-teal-400 text-white shadow-sm'
                                                : 'border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                                        }`}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Scope Selection */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-200">
                                {labels.scope}
                            </label>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {[
                                    { id: 'all', title: labels.scopeAll, desc: labels.scopeAllDesc },
                                    { id: 'rooms', title: labels.scopeRooms, desc: labels.scopeRoomsDesc },
                                    { id: 'modalities', title: labels.scopeModalities, desc: labels.scopeModalitiesDesc },
                                    { id: 'emergency', title: labels.scopeEmergency, desc: labels.scopeEmergencyDesc },
                                ].map((option) => {
                                    const selected = draft.scope === option.id;
                                    return (
                                        <div
                                            key={option.id}
                                            onClick={() => setDraft((curr) => ({
                                                ...curr,
                                                scope: option.id,
                                                // Clean other allocations to prevent conflicting assignments
                                                roomIds: option.id === 'rooms' ? curr.roomIds : [],
                                                modalityIds: option.id === 'modalities' ? curr.modalityIds : []
                                            }))}
                                            className={`cursor-pointer rounded-xl border p-2.5 transition ${
                                                selected
                                                    ? 'border-teal-500 bg-teal-50/70 dark:border-teal-700 dark:bg-teal-950/40'
                                                    : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-black text-slate-900 dark:text-white">
                                                    {option.title}
                                                </span>
                                                {selected && <CheckCircle2 size={14} className="text-teal-600 dark:text-teal-400" />}
                                            </div>
                                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                                                {option.desc}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Default Tab Selection */}
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-200">
                                {labels.tab}
                            </label>
                            <select
                                value={draft.tab || ''}
                                onChange={(e) => setDraft((curr) => ({ ...curr, tab: e.target.value }))}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            >
                                <option value="">{labels.tabNone}</option>
                                <option value="schedule">{labels.tabSchedule}</option>
                                <option value="patients">{labels.tabPatients}</option>
                                <option value="cashier">{labels.tabCashier}</option>
                                <option value="billing">{labels.tabBilling}</option>
                            </select>
                        </div>

                        {/* Descriptions */}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                    {labels.descAr}
                                </label>
                                <input
                                    type="text"
                                    value={draft.descAr || ''}
                                    onChange={(e) => setDraft((curr) => ({ ...curr, descAr: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                    {labels.descEn}
                                </label>
                                <input
                                    type="text"
                                    value={draft.descEn || ''}
                                    onChange={(e) => setDraft((curr) => ({ ...curr, descEn: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
};

export default EquipmentWorkstationMapping;
