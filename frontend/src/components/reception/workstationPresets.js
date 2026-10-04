export const WORKSTATION_PRESETS_STORAGE_KEY = 'viara_reception_workstation_presets';

export const DEFAULT_WORKSTATION_PRESETS = [
    {
        id: 'd1',
        label: 'شباك 1 - الاستقبال العام',
        icon: '🖥️',
        descAr: 'استقبال شامل لكافة الحالات والأجهزة',
        descEn: 'General intake for all modalities',
        roomIds: [],
        modalityIds: [],
        scope: 'all',
    },
    {
        id: 'd2',
        label: 'شباك 2 - رنين ومقطعية',
        icon: '🧲',
        descAr: 'ربط مباشر بأجنحة وأجهزة الرنين والمقطعية',
        descEn: 'Direct link to MRI & CT modalities',
        roomIds: [],
        modalityIds: [],
        scope: 'all',
    },
    {
        id: 'd3',
        label: 'شباك 3 - سونار وأشعة عادية',
        icon: '📡',
        descAr: 'ربط مباشر بأجهزة السونار والأشعة السينية',
        descEn: 'Direct link to Ultrasound & X-Ray',
        roomIds: [],
        modalityIds: [],
        scope: 'all',
    },
    {
        id: 'd4',
        label: 'شباك 4 - تأمين وتحصيل',
        icon: '💳',
        descAr: 'تركيز على إجراءات الفواتير والموافقات المالية',
        descEn: 'Financial clearance & cashier queue',
        roomIds: [],
        modalityIds: [],
        scope: 'all',
        tab: 'cashier',
    },
    {
        id: 'd5',
        label: 'استقبال الطوارئ السريع',
        icon: '🚨',
        descAr: 'متابعة الحالات الحرجة وذات الأولوية القصوى',
        descEn: 'Emergency triage & urgent admissions',
        roomIds: [],
        modalityIds: [],
        scope: 'emergency',
    },
    {
        id: 'd6',
        label: 'الاستقبال الرئيسي',
        icon: '🏥',
        descAr: 'لوحة القيادة المركزية لجميع الشبابيك',
        descEn: 'Master operations & intake command',
        roomIds: [],
        modalityIds: [],
        scope: 'all',
    },
];

export const readWorkstationPresets = () => {
    try {
        const value = JSON.parse(localStorage.getItem(WORKSTATION_PRESETS_STORAGE_KEY) || 'null');
        if (!Array.isArray(value) || value.length === 0) return DEFAULT_WORKSTATION_PRESETS;
        return value.map((savedPreset) => {
            const defaultPreset = DEFAULT_WORKSTATION_PRESETS.find((item) => item.id === savedPreset.id);
            return {
                ...(defaultPreset || {}),
                ...savedPreset,
                roomIds: Array.isArray(savedPreset.roomIds) ? savedPreset.roomIds : [],
                modalityIds: Array.isArray(savedPreset.modalityIds) ? savedPreset.modalityIds : [],
                modalityTypes: undefined,
            };
        }).filter((preset) => preset.label);
    } catch {
        return DEFAULT_WORKSTATION_PRESETS;
    }
};

export const saveWorkstationPresets = (presets) => {
    localStorage.setItem(WORKSTATION_PRESETS_STORAGE_KEY, JSON.stringify(presets.map(({ modalityTypes, ...preset }) => preset)));
    window.dispatchEvent(new CustomEvent('VIARA_WORKSTATION_PRESETS_CHANGED'));
};
