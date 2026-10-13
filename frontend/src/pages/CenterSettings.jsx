import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
    AlertTriangle,
    BadgeCheck,
    Building,
    Building2,
    CalendarClock,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock3,
    FileBadge2,
    FileText,
    ExternalLink,
    Globe2,
    Hash,
    Image,
    Landmark,
    Mail,
    MapPin,
    Palette,
    Phone,
    Receipt,
    RefreshCw,
    RotateCcw,
    Save,
    Smartphone,
    Stamp,
    ToggleLeft,
    Upload,
    X,
    Sparkles,
    Eye,
    Check,
    Lock,
    ShieldCheck,
    Copy,
    Maximize2,
    Search,
    Plus,
    Trash2,
    HelpCircle,
    Crown,
    Layers,
    SlidersHorizontal,
    MoreVertical,
    Edit3,
    CopyPlus,
    Wrench,
    CheckCircle,
    Radio,
    Shield,
    Activity,
    Stethoscope,
    LayoutGrid,
    ListFilter,
    Table,
    Users,
    UserPlus,
    UserCheck,
    UserX,
    QrCode
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    useGetCenterSettingsQuery,
    useUpdateCenterSettingsMutation,
    useGetSettingsBranchesQuery,
    useGetBranchQuotaQuery,
    useCreateSettingsBranchMutation,
    useUpdateSettingsBranchMutation,
    useDeleteSettingsBranchMutation,
    useGetBranchMembersQuery,
    useAssignBranchMemberMutation,
    useRemoveBranchMemberMutation,
    useGetStaffQuery
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import {
    normalizeCenterSettings,
    resolveDocumentIdentity,
    BRANCH_TYPES,
    BRANCH_STATUSES,
    AVAILABLE_MODALITIES,
    normalizeBranch
} from '../utils/centerSettings';
import PageHeader from '../components/ui/PageHeader';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TimezoneSelect from '../components/settings/TimezoneSelect';
import './CenterSettings.css';

const DEFAULT_HOURS = { start: 6, end: 22, workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] };
const IMAGE_LIMIT_BYTES = 800000;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

const DAYS_OF_WEEK = [
    { value: 0, label: 'Sun', fullLabel: 'Sunday' },
    { value: 1, label: 'Mon', fullLabel: 'Monday' },
    { value: 2, label: 'Tue', fullLabel: 'Tuesday' },
    { value: 3, label: 'Wed', fullLabel: 'Wednesday' },
    { value: 4, label: 'Thu', fullLabel: 'Thursday' },
    { value: 5, label: 'Fri', fullLabel: 'Friday' },
    { value: 6, label: 'Sat', fullLabel: 'Saturday' }
];

const COLOR_PRESETS = [
    { key: 'emerald', primary: '#087F5B', secondary: '#327C92', accent: '#F4B942' },
    { key: 'cyan', primary: '#0284C7', secondary: '#0F766E', accent: '#F59E0B' },
    { key: 'indigo', primary: '#4F46E5', secondary: '#0284C7', accent: '#EC4899' },
    { key: 'slate', primary: '#334155', secondary: '#0F172A', accent: '#10B981' }
];

const SHIFT_PRESETS = [
    { key: 'standard', start: 8, end: 17 },
    { key: 'extended', start: 7, end: 22 },
    { key: 'early', start: 6, end: 18 },
    { key: 'continuous', start: 0, end: 24 }
];

const TAG_CHIPS = [
    { label: '{center_name}', placeholder: '{center_name}' },
    { label: '{legal_name}', placeholder: '{legal_name}' },
    { label: '{tax_id}', placeholder: '{tax_id}' },
    { label: '{phone}', placeholder: '{phone}' },
    { label: '{hotline}', placeholder: '{hotline}' },
    { label: '{address}', placeholder: '{address}' },
    { label: '{website}', placeholder: '{website}' }
];

const TEXT_FIELDS = [
    'center_id', 'center_name', 'center_name_ar', 'legal_name', 'legal_name_ar',
    'branch_id', 'branch_code', 'branch_name', 'branch_name_ar', 'branch_display_name', 'branch_display_name_ar',
    'logo_url', 'logo_dark_url', 'logo_light_url', 'favicon_url',
    'primary_color', 'secondary_color', 'accent_color',
    'contact_person', 'other_details', 'tax_id', 'tax_number', 'commercial_registration', 'medical_license',
    'phone', 'alternative_phone', 'hotline', 'whatsapp', 'email', 'support_email', 'website',
    'address', 'address_ar', 'country', 'governorate', 'city', 'postal_code',
    'invoice_prefix', 'report_header', 'report_footer', 'footer_text', 'footer_text_ar',
    'report_disclaimer', 'report_disclaimer_ar', 'invoice_footer', 'invoice_footer_ar',
    'receipt_footer', 'receipt_footer_ar', 'portal_welcome_message', 'portal_welcome_message_ar',
    'default_language', 'timezone', 'currency'
];

const normalizeSettings = (settings = {}) => {
    const normalized = normalizeCenterSettings(settings);
    const hours = normalized.working_hours || DEFAULT_HOURS;
    return {
        ...TEXT_FIELDS.reduce((acc, field) => ({ ...acc, [field]: normalized[field] || '' }), {}),
        center_id: normalized.center_id || 'default',
        branches: Array.isArray(normalized.branches) ? normalized.branches : [],
        primary_color: normalized.primary_color || normalized.print_settings?.themeColor || '#087F5B',
        secondary_color: normalized.secondary_color || '#327C92',
        accent_color: normalized.accent_color || normalized.homepage_settings?.accentColor || '#F4B942',
        default_language: normalized.default_language || 'en',
        timezone: normalized.timezone || 'Africa/Cairo',
        currency: normalized.currency || 'EGP',
        vat_enabled: normalized.vat_enabled === true,
        vat_rate: Number(normalized.vat_rate || 0),
        urgent_priority_fee: Number(normalized.urgent_priority_fee || 0),
        emergency_priority_fee: Number(normalized.emergency_priority_fee || 0),
        showPoweredByViara: normalized.showPoweredByViara !== false,
        working_hours: {
            start: hours.start ?? DEFAULT_HOURS.start,
            end: hours.end ?? DEFAULT_HOURS.end,
            workingDays: Array.isArray(hours.workingDays)
                ? hours.workingDays
                : (Array.isArray(hours.days) ? hours.days : [0, 1, 2, 3, 4, 5, 6]),
            holidays: Array.isArray(hours.holidays) ? hours.holidays : []
        },
        print_settings: normalized.print_settings,
        homepage_settings: normalized.homepage_settings
    };
};

const readImageAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

const validateImageMagicBytes = async (file) => {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const text = new TextDecoder().decode(bytes).trimStart().toLowerCase();
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const webp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    const svg = text.startsWith('<svg') || text.startsWith('<?xml');
    return png || jpg || webp || svg;
};

const CenterSettings = ({ embedded = false }) => {
    const { t, i18n } = useTranslation('facilitySettings');
    const settingsQuery = useGetCenterSettingsQuery();
    const [updateSettings, updateState] = useUpdateCenterSettingsMutation();
    const branchesQuery = useGetSettingsBranchesQuery();
    const quotaQuery = useGetBranchQuotaQuery();
    const [createBranchApi] = useCreateSettingsBranchMutation();
    const [updateBranchApi] = useUpdateSettingsBranchMutation();
    const [deleteBranchApi] = useDeleteSettingsBranchMutation();
    const [form, setForm] = useState(() => normalizeSettings());
    const [savedForm, setSavedForm] = useState(() => normalizeSettings());
    const [mounted, setMounted] = useState(false);
    const [viewMode, setViewMode] = useState('tabs'); // 'tabs' | 'all'
    const [activeSection, setActiveSection] = useState('organization');
    const [previewTab, setPreviewTab] = useState('all');
    const [selectedPreviewBranchId, setSelectedPreviewBranchId] = useState('master');
    const [fullModalOpen, setFullModalOpen] = useState(false);
    const [modalPreviewTab, setModalPreviewTab] = useState('report');
    const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
    const [branchDeleteId, setBranchDeleteId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [holidayInput, setHolidayInput] = useState('');

    // Multi-branch state
    const [branchModalOpen, setBranchModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [branchSearch, setBranchSearch] = useState('');
    const [branchFilter, setBranchFilter] = useState('all');
    const [branchViewMode, setBranchViewMode] = useState('grid');
    const [membersModalBranch, setMembersModalBranch] = useState(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!fullModalOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setFullModalOpen(false);
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [fullModalOpen]);

    // IntersectionObserver scroll spy to keep top "Jump to Section" active tab in sync (only active in 'all' viewMode)
    useEffect(() => {
        if (!mounted || viewMode !== 'all') return undefined;
        const sectionIds = ['organization', 'branding', 'contact', 'legal', 'branch', 'documents', 'portal', 'hours'];
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: '-15% 0px -65% 0px', threshold: 0 }
        );

        sectionIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [mounted, viewMode]);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-500 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100`,
        style: { transitionDelay: `${delay}ms` },
    });

    useEffect(() => {
        if (!settingsQuery.data) return;
        const next = normalizeSettings(settingsQuery.data);
        setForm(next);
        setSavedForm(next);
    }, [settingsQuery.data]);

    useEffect(() => {
        if (!branchesQuery.data?.branches || !branchesQuery.data.branches.length) return;
        const normalized = branchesQuery.data.branches.map((b, idx) => normalizeBranch(b, idx + 1));
        setForm((current) => ({
            ...current,
            branches: normalized
        }));
        setSavedForm((current) => ({
            ...current,
            branches: normalized
        }));
    }, [branchesQuery.data?.branches]);

    // Construct identity for previews based on selected branch context
    const effectiveIdentitySettings = useMemo(() => {
        if (!selectedPreviewBranchId || selectedPreviewBranchId === 'master') {
            return form;
        }
        const branch = (form.branches || []).find((b) => b.id === selectedPreviewBranchId);
        if (!branch) return form;
        return {
            ...form,
            branch_id: branch.id,
            branch_code: branch.code,
            branch_name: branch.name,
            branch_name_ar: branch.nameAr,
            branch_display_name: branch.displayName || branch.name,
            branch_display_name_ar: branch.displayNameAr || branch.nameAr,
            phone: branch.phone || form.phone,
            alternative_phone: branch.alternativePhone || form.alternative_phone,
            hotline: branch.hotline || form.hotline,
            whatsapp: branch.whatsapp || form.whatsapp,
            email: branch.email || form.email,
            address: branch.address || form.address,
            address_ar: branch.addressAr || form.address_ar,
            city: branch.city || form.city,
            governorate: branch.governorate || form.governorate,
            postal_code: branch.postalCode || form.postal_code,
            medical_license: branch.medicalLicense || form.medical_license,
            commercial_registration: branch.commercialRegistration || form.commercial_registration,
            tax_number: branch.taxNumber || form.tax_number,
            invoice_prefix: branch.invoicePrefix || form.invoice_prefix,
            report_header: branch.reportHeaderOverride || form.report_header,
            report_footer: branch.reportFooterOverride || form.report_footer
        };
    }, [form, selectedPreviewBranchId]);

    const identity = useMemo(
        () => resolveDocumentIdentity(effectiveIdentitySettings, {}, { language: i18n.language, kind: 'settings-preview' }),
        [effectiveIdentitySettings, i18n.language]
    );

    const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
    const hoursValid = Number(form.working_hours.start) >= 0
        && Number(form.working_hours.start) <= 24
        && Number(form.working_hours.end) >= 0
        && Number(form.working_hours.end) <= 24
        && Number(form.working_hours.end) > Number(form.working_hours.start);

    const handleSave = useCallback(async (event) => {
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        if (!hoursValid) return;
        try {
            const payload = {
                ...form,
                print_settings: {
                    ...form.print_settings,
                    themeColor: form.primary_color,
                    invoiceTerms: form.print_settings?.invoiceTerms || form.invoice_footer || ''
                },
                homepage_settings: {
                    ...form.homepage_settings,
                    accentColor: form.accent_color,
                    heroTitle: form.homepage_settings?.heroTitle || form.portal_welcome_message || ''
                }
            };
            // Public content is staged and published exclusively in Portal Builder.
            delete payload.homepage_settings;
            const updated = await updateSettings(payload).unwrap();
            const next = normalizeSettings(updated || payload);
            setForm(next);
            setSavedForm(next);
            toast.success(t('messages.saved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.saveFailed')));
        }
    }, [form, hoursValid, t, updateSettings]);

    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    // Keyboard shortcut (Ctrl+S / Cmd+S)
    useEffect(() => {
        const handleKeyDown = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (dirty && hoursValid && !updateState.isLoading) {
                    handleSave(event);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [dirty, handleSave, hoursValid, updateState.isLoading]);

    const navScrollRef = useRef(null);

    const scrollNavSections = (direction) => {
        if (navScrollRef.current) {
            const scrollAmount = direction === 'left' ? -200 : 200;
            navScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
    const setHour = (field, value) => setForm((current) => ({
        ...current,
        working_hours: { ...current.working_hours, [field]: Number(value) }
    }));
    const setPrintField = (field, value) => setForm((current) => ({
        ...current,
        print_settings: { ...current.print_settings, [field]: value }
    }));

    const applyColorPreset = (preset) => {
        setForm((current) => ({
            ...current,
            primary_color: preset.primary,
            secondary_color: preset.secondary,
            accent_color: preset.accent
        }));
        toast.success(t('messages.paletteApplied', { preset: t(`branding.presets.${preset.key}`) }));
    };

    const applyShiftPreset = (preset) => {
        setForm((current) => ({
            ...current,
            working_hours: { ...current.working_hours, start: preset.start, end: preset.end }
        }));
        toast.success(t('messages.shiftApplied', { preset: t(`hours.presets.${preset.key}`) }));
    };

    const addHoliday = () => {
        if (!holidayInput.trim()) return;
        const tag = holidayInput.trim();
        setForm((current) => {
            const holidays = current.working_hours.holidays || [];
            if (holidays.includes(tag)) return current;
            return {
                ...current,
                working_hours: { ...current.working_hours, holidays: [...holidays, tag] }
            };
        });
        setHolidayInput('');
    };

    const removeHoliday = (tagToRemove) => {
        setForm((current) => ({
            ...current,
            working_hours: {
                ...current.working_hours,
                holidays: (current.working_hours.holidays || []).filter((h) => h !== tagToRemove)
            }
        }));
    };

    const appendTagToField = (field, tag) => {
        setForm((current) => ({
            ...current,
            [field]: (current[field] || '') + (current[field] ? ' ' : '') + tag
        }));
        toast.success(t('messages.tagAppended', { defaultValue: `Inserted ${tag}` }));
    };

    const handleLogoUpload = async (field, event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!IMAGE_TYPES.includes(file.type)) {
            toast.error(t('messages.logoImageOnly', { defaultValue: 'Use PNG, JPG, SVG, or WebP for logos.' }));
            return;
        }
        if (file.size > IMAGE_LIMIT_BYTES) {
            toast.error(t('messages.logoTooLarge', { defaultValue: 'Logo image must be smaller than 800 KB.' }));
            return;
        }
        if (!(await validateImageMagicBytes(file))) {
            toast.error(t('messages.logoInvalid', { defaultValue: 'The selected file does not look like a supported image.' }));
            return;
        }
        try {
            setField(field, await readImageAsDataUrl(file));
            toast.success(t('messages.logoUploaded', { defaultValue: 'Logo updated successfully' }));
        } catch {
            toast.error(t('messages.logoReadFailed', { defaultValue: 'Logo image could not be read.' }));
        }
    };

    // ── Branch Management Handlers ──────────────────────────────────────────

    const handleOpenAddBranch = () => {
        if (quotaQuery.data && !quotaQuery.data.canCreateMore) {
            toast.error(
                !quotaQuery.data.multiBranchAllowed
                    ? t('branches.quota.upgradeRequired', { defaultValue: 'Multi-branch operations require an Enterprise license.' })
                    : t('branches.quota.maxReached', { defaultValue: 'Maximum branch quota reached for your license.' })
            );
            return;
        }
        const nextIndex = (form.branches?.length || 0) + 1;
        const newBranch = normalizeBranch({
            id: `branch-${Date.now()}`,
            code: `BR-${String(nextIndex).padStart(2, '0')}`,
            name: '',
            nameAr: '',
            displayName: '',
            displayNameAr: '',
            type: nextIndex === 1 ? 'main' : 'branch',
            status: 'active',
            isMain: nextIndex === 1,
            phone: form.phone || '',
            alternativePhone: '',
            hotline: form.hotline || '',
            whatsapp: form.whatsapp || '',
            email: form.email || '',
            address: form.address || '',
            addressAr: form.address_ar || '',
            governorate: form.governorate || '',
            city: form.city || '',
            postalCode: form.postal_code || '',
            medicalLicense: form.medical_license || '',
            commercialRegistration: form.commercial_registration || '',
            taxNumber: form.tax_number || '',
            invoicePrefix: `BR${nextIndex}-INV-`,
            modalities: ['MRI', 'CT', 'X-RAY', 'ULTRASOUND']
        }, nextIndex);
        setEditingBranch(newBranch);
        setBranchModalOpen(true);
    };

    const handleOpenEditBranch = (branch) => {
        setEditingBranch({ ...branch });
        setBranchModalOpen(true);
    };

    const handleDuplicateBranch = (branch) => {
        if (quotaQuery.data && !quotaQuery.data.canCreateMore) {
            toast.error(
                !quotaQuery.data.multiBranchAllowed
                    ? t('branches.quota.upgradeRequired', { defaultValue: 'Multi-branch operations require an Enterprise license.' })
                    : t('branches.quota.maxReached', { defaultValue: 'Maximum branch quota reached for your license.' })
            );
            return;
        }
        const count = (form.branches?.length || 0) + 1;
        const duplicated = normalizeBranch({
            ...branch,
            id: `branch-${Date.now()}`,
            code: `${branch.code || 'BR'}-COPY`,
            name: `${branch.name} (Copy)`,
            nameAr: `${branch.nameAr || branch.name} (نسخة)`,
            displayName: `${branch.displayName || branch.name} (Copy)`,
            displayNameAr: `${branch.displayNameAr || branch.nameAr || branch.name} (نسخة)`,
            isMain: false
        }, count);

        setEditingBranch(duplicated);
        setBranchModalOpen(true);
    };

    const handleSaveBranchModal = async (updatedBranch) => {
        if (!updatedBranch.name?.trim()) {
            toast.error(t('fields.branchNameHint'));
            return;
        }

        const isNew = !updatedBranch.id || String(updatedBranch.id).startsWith('branch-');
        try {
            if (isNew) {
                await createBranchApi({
                    code: updatedBranch.code,
                    name: updatedBranch.name,
                    nameAr: updatedBranch.nameAr,
                    displayName: updatedBranch.displayName,
                    displayNameAr: updatedBranch.displayNameAr,
                    type: updatedBranch.type,
                    status: updatedBranch.status,
                    phone: updatedBranch.phone,
                    alternativePhone: updatedBranch.alternativePhone,
                    hotline: updatedBranch.hotline,
                    whatsapp: updatedBranch.whatsapp,
                    email: updatedBranch.email,
                    address: updatedBranch.address,
                    addressAr: updatedBranch.addressAr,
                    governorate: updatedBranch.governorate,
                    city: updatedBranch.city,
                    postalCode: updatedBranch.postalCode,
                    medicalLicense: updatedBranch.medicalLicense,
                    commercialRegistration: updatedBranch.commercialRegistration,
                    taxNumber: updatedBranch.taxNumber,
                    invoicePrefix: updatedBranch.invoicePrefix,
                    managerName: updatedBranch.managerName,
                    modalities: updatedBranch.modalities,
                    workingHoursOverride: updatedBranch.workingHoursOverride,
                    reportHeaderOverride: updatedBranch.reportHeaderOverride,
                    reportFooterOverride: updatedBranch.reportFooterOverride,
                    notes: updatedBranch.notes
                }).unwrap();
                toast.success(t('branches.addBranch'));
            } else {
                await updateBranchApi({
                    id: updatedBranch.id,
                    name: updatedBranch.name,
                    nameAr: updatedBranch.nameAr,
                    displayName: updatedBranch.displayName,
                    displayNameAr: updatedBranch.displayNameAr,
                    type: updatedBranch.type,
                    status: updatedBranch.status,
                    phone: updatedBranch.phone,
                    alternativePhone: updatedBranch.alternativePhone,
                    hotline: updatedBranch.hotline,
                    whatsapp: updatedBranch.whatsapp,
                    email: updatedBranch.email,
                    address: updatedBranch.address,
                    addressAr: updatedBranch.addressAr,
                    governorate: updatedBranch.governorate,
                    city: updatedBranch.city,
                    postalCode: updatedBranch.postalCode,
                    medicalLicense: updatedBranch.medicalLicense,
                    commercialRegistration: updatedBranch.commercialRegistration,
                    taxNumber: updatedBranch.taxNumber,
                    invoicePrefix: updatedBranch.invoicePrefix,
                    managerName: updatedBranch.managerName,
                    modalities: updatedBranch.modalities,
                    workingHoursOverride: updatedBranch.workingHoursOverride,
                    reportHeaderOverride: updatedBranch.reportHeaderOverride,
                    reportFooterOverride: updatedBranch.reportFooterOverride,
                    notes: updatedBranch.notes,
                    isMain: updatedBranch.isMain
                }).unwrap();
                toast.success(t('branches.title'));
            }
            setBranchModalOpen(false);
            setEditingBranch(null);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save branch'));
        }
    };

    const handleSetPrimaryHQ = async (branchId) => {
        try {
            await updateBranchApi({ id: branchId, isMain: true }).unwrap();
            toast.success(t('branches.setAsMain'));
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to set main branch'));
        }
    };

    const handleDeleteBranch = (branchId) => {
        const branchToDelete = (form.branches || []).find((b) => b.id === branchId);
        if (branchToDelete?.isMain) {
            toast.error(t('branches.cannotDeleteMain'));
            return;
        }
        if ((form.branches || []).length <= 1) {
            toast.error(t('branches.cannotDeleteMain'));
            return;
        }

        setBranchDeleteId(branchId);
    };

    const confirmDeleteBranch = async () => {
        if (!branchDeleteId) return;
        try {
            await deleteBranchApi(branchDeleteId).unwrap();
            toast.success(t('branches.deleteBranch'));
            setBranchDeleteId(null);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to archive branch'));
        }
    };

    const handleToggleBranchStatus = async (branchId) => {
        const branch = (form.branches || []).find((b) => b.id === branchId);
        if (!branch) return;
        const nextStatus = branch.status === 'active'
            ? 'maintenance'
            : branch.status === 'maintenance'
                ? 'inactive'
                : 'active';
        try {
            await updateBranchApi({ id: branchId, status: nextStatus }).unwrap();
            toast.success(`${branch.displayName || branch.name}: ${nextStatus}`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update branch status'));
        }
    };

    const reset = () => {
        setForm(savedForm);
        toast(t('messages.discarded', { defaultValue: 'Changes discarded' }), { icon: '↩️' });
    };

    if (settingsQuery.isLoading) return <SettingsLoading label={t('states.loading')} />;
    if (settingsQuery.isError && !settingsQuery.data) {
        return <SettingsError title={t('states.errorTitle')} description={t('states.errorDescription')} retry={t('actions.retry')} onRetry={settingsQuery.refetch} />;
    }

    const navSections = [
        { id: 'organization', icon: Building2, label: t('navigation.organization', { defaultValue: 'Organization' }) },
        { id: 'branding', icon: Palette, label: t('navigation.branding', { defaultValue: 'Branding' }) },
        { id: 'contact', icon: Phone, label: t('navigation.contact', { defaultValue: 'Contact' }) },
        { id: 'legal', icon: Landmark, label: t('navigation.legal', { defaultValue: 'Legal & Billing' }) },
        { id: 'branch', icon: Building, label: t('navigation.branches', { defaultValue: 'Branches & Medical Chains' }) },
        { id: 'documents', icon: FileText, label: t('navigation.documents', { defaultValue: 'Documents' }) },
        { id: 'portal', icon: Globe2, label: t('navigation.portal', { defaultValue: 'Portal' }) },
        { id: 'hours', icon: Clock3, label: t('navigation.hours', { defaultValue: 'Hours' }) }
    ];

    const filteredSections = searchQuery
        ? navSections.filter((sec) => sec.label.toLowerCase().includes(searchQuery.toLowerCase()) || sec.id.toLowerCase().includes(searchQuery.toLowerCase()))
        : navSections;

    // Filter branches list
    const filteredBranches = (form.branches || []).filter((b) => {
        const matchesSearch = !branchSearch
            || b.name?.toLowerCase().includes(branchSearch.toLowerCase())
            || b.nameAr?.toLowerCase().includes(branchSearch.toLowerCase())
            || b.code?.toLowerCase().includes(branchSearch.toLowerCase())
            || b.city?.toLowerCase().includes(branchSearch.toLowerCase())
            || b.governorate?.toLowerCase().includes(branchSearch.toLowerCase())
            || b.managerName?.toLowerCase().includes(branchSearch.toLowerCase());

        if (!matchesSearch) return false;

        if (branchFilter === 'all') return true;
        if (branchFilter === 'active') return b.status === 'active';
        if (branchFilter === 'maintenance') return b.status === 'maintenance';
        if (branchFilter === 'inactive') return b.status === 'inactive';
        if (branchFilter === 'main') return b.isMain;
        if (branchFilter === 'satellite') return b.type === 'satellite';
        if (branchFilter === 'mobile') return b.type === 'mobile';
        if (branchFilter === 'lab') return b.type === 'lab';
        return true;
    });

    const branchStats = {
        total: form.branches?.length || 0,
        active: form.branches?.filter((b) => b.status === 'active').length || 0,
        maintenance: form.branches?.filter((b) => b.status === 'maintenance').length || 0,
        inactive: form.branches?.filter((b) => b.status === 'inactive').length || 0,
        mainBranch: form.branches?.find((b) => b.isMain) || form.branches?.[0]
    };

    const activeIndex = Math.max(0, navSections.findIndex((sec) => sec.id === activeSection));
    const prevSection = activeIndex > 0 ? navSections[activeIndex - 1] : null;
    const nextSection = activeIndex < navSections.length - 1 ? navSections[activeIndex + 1] : null;

    return (
        <div className={embedded ? 'space-y-6 pb-28 cs-page-shell' : 'mx-auto max-w-7xl space-y-6 pb-28 cs-page-shell'}>
            {/* VIARA Modern Executive Command Deck */}
            <div className="cs-hero-container space-y-6">
                <div className="cs-hero-glow-1" />
                <div className="cs-hero-glow-2" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-surface)] bg-gradient-to-br from-teal-500/20 via-emerald-500/10 to-transparent text-teal-600 border border-teal-500/25 shadow-sm dark:text-teal-400">
                            <Building2 size={28} strokeWidth={2.2} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-pill)] border border-teal-500/20 bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-bold text-teal-800 dark:text-teal-300">
                                    <BadgeCheck size={12} />
                                    <span>{t('header.identityEyebrow')}</span>
                                </span>
                                {dirty ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-pill)] bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        <span>{t('status.unsaved', { defaultValue: 'Unsaved Changes' })}</span>
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-pill)] bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                                        <CheckCircle2 size={12} />
                                        <span>{t('status.saved', { defaultValue: 'Saved & Synced' })}</span>
                                    </span>
                                )}
                            </div>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl tracking-tight">
                                {t('header.title', { defaultValue: 'Facility & Center Settings' })}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm max-w-2xl">
                                {t('header.description', { defaultValue: 'Maintain healthcare organization identity, branch overrides, brand colors, document templates, and print defaults.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        {dirty && (
                            <button
                                type="button"
                                onClick={() => setDiscardConfirmOpen(true)}
                                className="inline-flex items-center gap-2 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <RotateCcw size={14} />
                                <span>{t('actions.discard', { defaultValue: 'Discard' })}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!dirty || !hoursValid || updateState.isLoading}
                            className="inline-flex items-center gap-2 rounded-[var(--VIARA-radius-control)] bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {updateState.isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                            <span>{updateState.isLoading ? t('actions.saving', { defaultValue: 'Saving...' }) : t('actions.save', { defaultValue: 'Save Changes' })}</span>
                        </button>
                    </div>
                </div>

                {/* Telemetry Facts HUD Cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="cs-kpi-card">
                        <div className="min-w-0 pe-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('summary.primaryEntity')}</p>
                            <p className="font-mono text-sm font-black text-slate-900 dark:text-white truncate mt-0.5">{form.center_name || form.legal_name || 'VIARA Radiology'}</p>
                            <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold truncate">{form.legal_name || t('summary.organizationDefault')}</p>
                        </div>
                        <div className="cs-kpi-icon text-teal-600 dark:text-teal-400">
                            <Building2 size={18} />
                        </div>
                    </div>

                    <div className="cs-kpi-card">
                        <div className="min-w-0 pe-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('branches.stats.mainBranch', { defaultValue: 'Main HQ' })}</p>
                            <p className="font-mono text-sm font-black text-slate-900 dark:text-white truncate mt-0.5">{branchStats.mainBranch?.name || form.branch_name || 'Main HQ'}</p>
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold truncate">[{branchStats.mainBranch?.code || 'HQ-01'}] {branchStats.mainBranch?.city || ''}</p>
                        </div>
                        <div className="cs-kpi-icon text-amber-500">
                            <Crown size={18} />
                        </div>
                    </div>

                    <div className="cs-kpi-card">
                        <div className="min-w-0 pe-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('branches.stats.active', { defaultValue: 'Active Locations' })}</p>
                            <p className="font-mono text-sm font-black text-slate-900 dark:text-white truncate mt-0.5">{`${branchStats.active} / ${branchStats.total} ${t('navigation.branches')}`}</p>
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">{t('branches.statuses.active')}</p>
                        </div>
                        <div className="cs-kpi-icon text-emerald-600 dark:text-emerald-400">
                            <Building size={18} />
                        </div>
                    </div>

                    <div className="cs-kpi-card">
                        <div className="min-w-0 pe-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('summary.clinicalHours')}</p>
                            <p className="font-mono text-sm font-black text-slate-900 dark:text-white truncate mt-0.5">{`${formatHour(form.working_hours?.start ?? 8)} - ${formatHour(form.working_hours?.end ?? 22)}`}</p>
                            <p className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold truncate">{calculateDuration(form.working_hours.start, form.working_hours.end)} {t('hours.duration', { count: calculateDuration(form.working_hours.start, form.working_hours.end) })}</p>
                        </div>
                        <div className="cs-kpi-icon text-sky-600 dark:text-sky-400">
                            <Clock3 size={18} />
                        </div>
                    </div>
                </div>
            </div>

            {settingsQuery.isError ? (
                <div role="alert" className="flex items-start justify-between gap-4 rounded-[var(--VIARA-radius-surface)] border border-amber-200 bg-amber-50/90 p-4 backdrop-blur-md dark:border-amber-900/40 dark:bg-amber-950/40">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={18} />
                        <div>
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t('states.refreshError')}</p>
                            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400/80">{t('states.showingSaved')}</p>
                        </div>
                    </div>
                    <button type="button" onClick={settingsQuery.refetch} className="shrink-0 rounded-[var(--VIARA-radius-control)] border border-amber-200 bg-white p-2 text-amber-800 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-slate-900 dark:text-amber-300" aria-label={t('actions.retry')}>
                        <RefreshCw size={16} />
                    </button>
                </div>
            ) : null}

            {/* Modern Sticky Navigation Deck */}
            <div className="sticky top-3 z-30 overflow-hidden rounded-[var(--VIARA-radius-overlay)] border border-slate-200/80 bg-white/90 p-2 shadow-md backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/90">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between min-w-0">
                    {/* View Mode Switcher + Live Previews Button (Mobile) */}
                    <div className="flex items-center justify-between sm:justify-start gap-2 px-1 shrink-0">
                        {/* View Mode Toggle: Tabbed vs All */}
                        <div className="flex rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                            <button
                                type="button"
                                onClick={() => setViewMode('tabs')}
                                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-[var(--VIARA-radius-control)] transition ${viewMode === 'tabs'
                                    ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                    }`}
                                title={t('navigation.tabbedModeHint', { defaultValue: 'عرض مبوب (قسم واحد في كل مرة)' })}
                            >
                                <LayoutGrid size={13} />
                                <span className="hidden sm:inline">{t('navigation.tabbedMode', { defaultValue: 'مبوب' })}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('all')}
                                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-[var(--VIARA-radius-control)] transition ${viewMode === 'all'
                                    ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                    }`}
                                title={t('navigation.allModeHint', { defaultValue: 'عرض شامل (جميع الأقسام بتمرير مستمر)' })}
                            >
                                <ListFilter size={13} />
                                <span className="hidden sm:inline">{t('navigation.allMode', { defaultValue: 'شامل' })}</span>
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setFullModalOpen(true)}
                            className="xl:hidden inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 shadow-sm transition hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/50 dark:text-teal-300 shrink-0"
                            title={t('previews.title', { defaultValue: 'Live Previews' })}
                        >
                            <Eye size={13} className="text-teal-600 dark:text-teal-400" />
                            <span className="hidden sm:inline">{t('previews.title', { defaultValue: 'Live Previews' })}</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 min-w-0 flex-1 w-full overflow-hidden">
                        {/* Section Quick Search Input */}
                        <div className="relative hidden md:block w-40 shrink-0">
                            <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('common.filter', { defaultValue: 'تصفية الأقسام...' })}
                                className="h-8 w-full rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-50 pe-2.5 ps-8 text-[11px] font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                            />
                            {searchQuery ? (
                                <button type="button" onClick={() => setSearchQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                                    <X size={12} />
                                </button>
                            ) : null}
                        </div>

                        {/* Scrollable Nav Pills Container with Left/Right Buttons */}
                        <div className="relative flex items-center min-w-0 flex-1 w-full gap-1">
                            <button
                                type="button"
                                onClick={() => scrollNavSections('left')}
                                aria-label="Scroll sections left"
                                title="Scroll left"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                                <ChevronLeft size={14} className="rtl-flip" />
                            </button>

                            <div
                                ref={navScrollRef}
                                className="cs-nav-deck min-w-0 flex-1 scroll-smooth"
                            >
                                {filteredSections.map((sec) => {
                                    const Icon = sec.icon;
                                    const active = activeSection === sec.id;
                                    return (
                                        <button
                                            key={sec.id}
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setActiveSection(sec.id);
                                                if (viewMode === 'all') {
                                                    const el = document.getElementById(sec.id);
                                                    if (el) {
                                                        const yOffset = -90;
                                                        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
                                                        window.scrollTo({ top: y, behavior: 'smooth' });
                                                    }
                                                } else {
                                                    window.scrollTo({ top: 140, behavior: 'smooth' });
                                                }
                                            }}
                                            className={`cs-nav-tab ${active ? 'active' : ''}`}
                                        >
                                            <Icon size={14} />
                                            <span>{sec.label}</span>
                                            {sec.id === 'branch' && branchStats.total > 0 && (
                                                <span className={`text-[10px] px-1.5 py-0.2 rounded-[var(--VIARA-radius-pill)] font-mono ${active ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                                                    {branchStats.total}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                onClick={() => scrollNavSections('right')}
                                aria-label="Scroll sections right"
                                title="Scroll right"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                                <ChevronRight size={14} className="rtl-flip" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSave} style={reveal(40).style} className={`grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px] ${reveal(40).className}`}>

                {/* Main Content Form Sections */}
                <main className="min-w-0 space-y-6">
                    {/* Organization Identity */}
                    {(viewMode === 'all' || activeSection === 'organization') && (
                        <SettingsSection
                            id="organization"
                            icon={Building2}
                            title={t('organization.title', { defaultValue: 'Organization Identity' })}
                            description={t('organization.description', { defaultValue: 'The healthcare provider identity inherited by reports, invoices, receipts, stickers, labels, and portals.' })}
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label={t('fields.centerName')} hint={t('fields.centerNameHint')} required icon={Building2}>
                                    <input id="center-name" type="text" required maxLength={200} value={form.center_name} onChange={(event) => setField('center_name', event.target.value)} className="input-field w-full font-bold" autoComplete="organization" />
                                </Field>
                                <Field label={t('fields.centerNameAr', { defaultValue: 'Center Name (Arabic)' })} icon={Building2}>
                                    <input id="center-name-ar" type="text" maxLength={200} value={form.center_name_ar} onChange={(event) => setField('center_name_ar', event.target.value)} className="input-field w-full font-semibold" dir="rtl" />
                                </Field>
                                <Field label={t('fields.legalName', { defaultValue: 'Legal / Registered Name' })} icon={BadgeCheck}>
                                    <input id="legal-name" type="text" maxLength={250} value={form.legal_name} onChange={(event) => setField('legal_name', event.target.value)} className="input-field w-full" />
                                </Field>
                                <Field label={t('fields.legalNameAr', { defaultValue: 'Legal Name (Arabic)' })} icon={BadgeCheck}>
                                    <input id="legal-name-ar" type="text" maxLength={250} value={form.legal_name_ar} onChange={(event) => setField('legal_name_ar', event.target.value)} className="input-field w-full" dir="rtl" />
                                </Field>
                                <Field label={t('fields.defaultLanguage', { defaultValue: 'Default Language' })} icon={Globe2}>
                                    <select id="default-language" value={form.default_language} onChange={(event) => setField('default_language', event.target.value)} className="input-field w-full font-semibold">
                                        <option value="en">English (US/UK)</option>
                                        <option value="ar">العربية (Arabic)</option>
                                    </select>
                                </Field>
                                <div className="md:col-span-2">
                                    <Field label={t('timezone.title', { defaultValue: 'Facility Standard Timezone' })} hint={t('timezone.hint', { defaultValue: 'Governs all patient appointments, modality shift windows, and clinical audit timestamps.' })} icon={Clock3}>
                                        <TimezoneSelect
                                            value={form.timezone}
                                            onChange={(tz) => setField('timezone', tz)}
                                        />
                                    </Field>
                                </div>
                            </div>
                        </SettingsSection>
                    )}

                    {/* Branding & Visual Customization */}
                    {(viewMode === 'all' || activeSection === 'branding') && (
                        <SettingsSection
                            id="branding"
                            icon={Palette}
                            title={t('branding.title', { defaultValue: 'Branding & Visual Palette' })}
                            description={t('branding.description', { defaultValue: 'Logo variants and colors used by print templates, digital report headers, and patient portals.' })}
                        >
                            <div className="grid gap-4 md:grid-cols-3">
                                <LogoField t={t} field="logo_url" label={t('fields.logoUrl')} hint={t('fields.logoUrlHint')} value={form.logo_url} onChange={setField} onUpload={handleLogoUpload} />
                                <LogoField t={t} field="logo_light_url" label={t('fields.logoLightUrl', { defaultValue: 'Light Logo' })} hint={t('fields.logoLightHint', { defaultValue: 'Preferred on dark document headers.' })} value={form.logo_light_url} onChange={setField} onUpload={handleLogoUpload} />
                                <LogoField t={t} field="logo_dark_url" label={t('fields.logoDarkUrl', { defaultValue: 'Dark Logo' })} hint={t('fields.logoDarkHint', { defaultValue: 'Preferred on light document headers.' })} value={form.logo_dark_url} onChange={setField} onUpload={handleLogoUpload} />
                            </div>

                            {/* Preset Palette Selector */}
                            <div className="mt-5 rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-950/40">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('branding.presetsTitle')}</p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('branding.presetsDescription')}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {COLOR_PRESETS.map((preset) => (
                                            <button
                                                key={preset.key}
                                                type="button"
                                                onClick={() => applyColorPreset(preset)}
                                                className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                            >
                                                <span className="flex h-3.5 w-3.5 overflow-hidden rounded-full border border-slate-300">
                                                    <span className="h-full w-1/3" style={{ backgroundColor: preset.primary }} />
                                                    <span className="h-full w-1/3" style={{ backgroundColor: preset.secondary }} />
                                                    <span className="h-full w-1/3" style={{ backgroundColor: preset.accent }} />
                                                </span>
                                                <span>{t(`branding.presets.${preset.key}`)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <ColorField label={t('fields.primaryColor', { defaultValue: 'Primary Color' })} value={form.primary_color} onChange={(value) => setField('primary_color', value)} />
                                    <ColorField label={t('fields.secondaryColor', { defaultValue: 'Secondary Color' })} value={form.secondary_color} onChange={(value) => setField('secondary_color', value)} />
                                    <ColorField label={t('fields.accentColor', { defaultValue: 'Accent Color' })} value={form.accent_color} onChange={(value) => setField('accent_color', value)} />
                                </div>
                            </div>

                            <Field className="mt-4" label={t('fields.faviconUrl', { defaultValue: 'Favicon Icon Path' })} icon={Image}>
                                <input id="favicon-url" type="text" value={form.favicon_url} onChange={(event) => setField('favicon_url', event.target.value)} className="input-field w-full font-mono text-xs" placeholder="/favicon.svg" dir="ltr" />
                            </Field>
                        </SettingsSection>
                    )}

                    {/* Contact Information */}
                    {(viewMode === 'all' || activeSection === 'contact') && (
                        <SettingsSection
                            id="contact"
                            icon={Phone}
                            title={t('contact.title', { defaultValue: 'Contact Information' })}
                            description={t('contact.description', { defaultValue: 'Public and document-safe contact details inherited by branches when no specific override exists.' })}
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label={t('fields.phone')} icon={Phone}>
                                    <input id="facility-phone" type="tel" maxLength={30} value={form.phone} onChange={(event) => setField('phone', event.target.value)} className="input-field w-full font-mono" autoComplete="tel" dir="ltr" />
                                </Field>
                                <Field label={t('fields.alternativePhone', { defaultValue: 'Alternative Phone' })} icon={Phone}>
                                    <input id="alternative-phone" type="tel" maxLength={30} value={form.alternative_phone} onChange={(event) => setField('alternative_phone', event.target.value)} className="input-field w-full font-mono" dir="ltr" />
                                </Field>
                                <Field label={t('fields.hotline', { defaultValue: 'Hotline / Emergency' })} icon={Phone}>
                                    <input id="hotline" type="tel" maxLength={30} value={form.hotline} onChange={(event) => setField('hotline', event.target.value)} className="input-field w-full font-mono" dir="ltr" />
                                </Field>
                                <Field label={t('fields.whatsapp', { defaultValue: 'WhatsApp Number' })} icon={Smartphone}>
                                    <input id="whatsapp" type="tel" maxLength={30} value={form.whatsapp} onChange={(event) => setField('whatsapp', event.target.value)} className="input-field w-full font-mono" dir="ltr" />
                                </Field>
                                <Field label={t('fields.email')} icon={Mail}>
                                    <input id="facility-email" type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} className="input-field w-full" autoComplete="email" dir="ltr" />
                                </Field>
                                <Field label={t('fields.supportEmail', { defaultValue: 'Support Email' })} icon={Mail}>
                                    <input id="support-email" type="email" value={form.support_email} onChange={(event) => setField('support_email', event.target.value)} className="input-field w-full" dir="ltr" />
                                </Field>
                                <Field label={t('fields.website', { defaultValue: 'Website URL' })} icon={Globe2}>
                                    <input id="website" type="text" maxLength={300} value={form.website} onChange={(event) => setField('website', event.target.value)} className="input-field w-full font-mono text-xs" placeholder="https://example.com" dir="ltr" />
                                </Field>
                                <Field label={t('fields.contactPerson')} hint={t('fields.contactPersonHint')} icon={Phone}>
                                    <input id="contact-person" type="text" maxLength={200} value={form.contact_person} onChange={(event) => setField('contact_person', event.target.value)} className="input-field w-full" />
                                </Field>
                                <Field className="md:col-span-2" label={t('fields.address')} icon={MapPin} counter={`${form.address.length}/500`}>
                                    <textarea id="facility-address" maxLength={500} value={form.address} onChange={(event) => setField('address', event.target.value)} className="input-field min-h-20 w-full resize-y" rows={3} autoComplete="street-address" />
                                </Field>
                                <Field className="md:col-span-2" label={t('fields.addressAr', { defaultValue: 'Address (Arabic)' })} icon={MapPin} counter={`${form.address_ar.length}/500`}>
                                    <textarea id="facility-address-ar" maxLength={500} value={form.address_ar} onChange={(event) => setField('address_ar', event.target.value)} className="input-field min-h-20 w-full resize-y" rows={3} dir="rtl" />
                                </Field>
                                <Field label={t('fields.country', { defaultValue: 'Country' })} icon={MapPin}>
                                    <input id="country" type="text" maxLength={100} value={form.country} onChange={(event) => setField('country', event.target.value)} className="input-field w-full" />
                                </Field>
                                <Field label={t('fields.governorate', { defaultValue: 'Governorate / State' })} icon={MapPin}>
                                    <input id="governorate" type="text" maxLength={100} value={form.governorate} onChange={(event) => setField('governorate', event.target.value)} className="input-field w-full" />
                                </Field>
                                <Field label={t('fields.city', { defaultValue: 'City' })} icon={MapPin}>
                                    <input id="city" type="text" maxLength={100} value={form.city} onChange={(event) => setField('city', event.target.value)} className="input-field w-full" />
                                </Field>
                                <Field label={t('fields.postalCode', { defaultValue: 'Postal Code' })} icon={Hash}>
                                    <input id="postal-code" type="text" maxLength={30} value={form.postal_code} onChange={(event) => setField('postal_code', event.target.value)} className="input-field w-full font-mono" dir="ltr" />
                                </Field>
                            </div>
                        </SettingsSection>
                    )}

                    {/* Legal, Licensing & Billing */}
                    {(viewMode === 'all' || activeSection === 'legal') && (
                        <SettingsSection
                            id="legal"
                            icon={Landmark}
                            title={t('legal.title', { defaultValue: 'Legal, Licensing & Financial' })}
                            description={t('legal.description', { defaultValue: 'Identifiers used by invoices, receipts, report footers, and regulated healthcare documents.' })}
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label={t('fields.taxId')} hint={t('fields.taxIdHint')} icon={Hash}>
                                    <input id="tax-id" type="text" maxLength={50} value={form.tax_id} onChange={(event) => setField('tax_id', event.target.value)} className="input-field w-full font-mono font-bold" dir="ltr" />
                                </Field>
                                <Field label={t('fields.taxNumber', { defaultValue: 'Tax Number Override' })} icon={Hash}>
                                    <input id="tax-number" type="text" maxLength={50} value={form.tax_number} onChange={(event) => setField('tax_number', event.target.value)} className="input-field w-full font-mono" dir="ltr" />
                                </Field>
                                <Field label={t('fields.commercialRegistration', { defaultValue: 'Commercial Registration (CR)' })} icon={FileBadge2}>
                                    <input id="commercial-registration" type="text" maxLength={80} value={form.commercial_registration} onChange={(event) => setField('commercial_registration', event.target.value)} className="input-field w-full font-mono" dir="ltr" />
                                </Field>
                                <Field label={t('fields.medicalLicense', { defaultValue: 'Medical Facility License' })} icon={Stamp}>
                                    <input id="medical-license" type="text" maxLength={120} value={form.medical_license} onChange={(event) => setField('medical_license', event.target.value)} className="input-field w-full font-mono" dir="ltr" />
                                </Field>
                                <Field label={t('fields.currency', { defaultValue: 'Currency Code' })} icon={Receipt}>
                                    <input id="currency" type="text" maxLength={10} value={form.currency} onChange={(event) => setField('currency', event.target.value.toUpperCase())} className="input-field w-full font-mono font-bold" dir="ltr" />
                                </Field>
                                <Field label={t('fields.vatRate', { defaultValue: 'VAT / Tax Rate (%)' })} icon={Receipt}>
                                    <input id="vat-rate" type="number" min={0} max={100} step="0.01" value={form.vat_rate} onChange={(event) => setField('vat_rate', Number(event.target.value))} className="input-field w-full font-mono font-bold" dir="ltr" />
                                </Field>
                                <Field label={t('fields.urgentPriorityFee', { defaultValue: i18n.language?.startsWith('ar') ? 'رسم أولوية عاجلة (ج.م)' : 'Urgent priority surcharge (EGP)' })} icon={Receipt}>
                                    <input id="urgent-priority-fee" type="number" min={0} max={1000000} step="0.01" value={form.urgent_priority_fee} onChange={(event) => setField('urgent_priority_fee', Number(event.target.value))} className="input-field w-full font-mono font-bold" dir="ltr" />
                                </Field>
                                <Field label={t('fields.emergencyPriorityFee', { defaultValue: i18n.language?.startsWith('ar') ? 'رسم أولوية طوارئ (ج.م)' : 'Emergency priority surcharge (EGP)' })} icon={Receipt}>
                                    <input id="emergency-priority-fee" type="number" min={0} max={1000000} step="0.01" value={form.emergency_priority_fee} onChange={(event) => setField('emergency_priority_fee', Number(event.target.value))} className="input-field w-full font-mono font-bold" dir="ltr" />
                                </Field>
                                <ToggleField className="md:col-span-2" checked={form.vat_enabled} onChange={(checked) => setField('vat_enabled', checked)} label={t('fields.vatEnabled', { defaultValue: 'Enable VAT / tax settings on financial documents and billing' })} />
                            </div>
                        </SettingsSection>
                    )}

                    {/* Multi-Branch & Medical Chains Management Hub */}
                    {(viewMode === 'all' || activeSection === 'branch') && (
                        <SettingsSection
                            id="branch"
                            icon={Building}
                            title={t('branches.title', { defaultValue: 'Multi-Branch & Medical Chains Management' })}
                            description={t('branches.description', { defaultValue: 'Comprehensive management of radiology branch network, primary headquarters, satellite clinics, independent licenses, equipment modalities, and operating hours.' })}
                        >
                            <BranchManager
                                t={t}
                                branches={form.branches || []}
                                quota={quotaQuery.data}
                                branchSearch={branchSearch}
                                setBranchSearch={setBranchSearch}
                                branchFilter={branchFilter}
                                setBranchFilter={setBranchFilter}
                                branchViewMode={branchViewMode}
                                setBranchViewMode={setBranchViewMode}
                                filteredBranches={filteredBranches}
                                stats={branchStats}
                                onAddBranch={handleOpenAddBranch}
                                onEditBranch={handleOpenEditBranch}
                                onDuplicateBranch={handleDuplicateBranch}
                                onSetPrimaryHQ={handleSetPrimaryHQ}
                                onDeleteBranch={handleDeleteBranch}
                                onToggleStatus={handleToggleBranchStatus}
                                onManageMembers={(b) => setMembersModalBranch(b)}
                            />
                        </SettingsSection>
                    )}

                    {/* Document Print & Header Defaults */}
                    {(viewMode === 'all' || activeSection === 'documents') && (
                        <SettingsSection
                            id="documents"
                            icon={FileText}
                            title={t('documents.title', { defaultValue: 'Document Templates & Disclaimers' })}
                            description={t('documents.description', { defaultValue: 'Configure report headers, footers, and safe document text used by generated reports and billing documents.' })}
                        >
                            {/* Dynamic Tag Chip Helper */}
                            <div className="mb-4 rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles size={13} className="text-emerald-600 dark:text-emerald-400" />
                                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{t('documents.tagHint')}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {TAG_CHIPS.map((chip) => (
                                        <button
                                            key={chip.label}
                                            type="button"
                                            onClick={() => appendTagToField('report_header', chip.placeholder)}
                                            className="rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                        >
                                            {chip.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Field className="md:col-span-2" label={t('documents.header', { defaultValue: 'Report Header (HTML / Text)' })} hint={t('documents.htmlHint')} icon={FileText}>
                                    <textarea id="report-header" maxLength={500} value={form.report_header} onChange={(event) => setField('report_header', event.target.value)} className="input-field min-h-20 w-full font-mono text-xs resize-y" rows={3} placeholder={t('documents.headerPlaceholder')} />
                                </Field>
                                <Field className="md:col-span-2" label={t('documents.footer', { defaultValue: 'Report Footer (HTML / Text)' })} hint={t('documents.htmlHint')} icon={FileText}>
                                    <textarea id="report-footer" maxLength={500} value={form.report_footer} onChange={(event) => setField('report_footer', event.target.value)} className="input-field min-h-20 w-full font-mono text-xs resize-y" rows={3} placeholder={t('documents.footerPlaceholder')} />
                                </Field>
                                <Field label={t('documents.reportDisclaimer', { defaultValue: 'Report Disclaimer' })} icon={FileText}>
                                    <textarea id="report-disclaimer" maxLength={1000} value={form.report_disclaimer} onChange={(event) => setField('report_disclaimer', event.target.value)} className="input-field min-h-20 w-full resize-y text-xs" rows={3} />
                                </Field>
                                <Field label={t('documents.reportDisclaimerAr', { defaultValue: 'Report Disclaimer (Arabic)' })} icon={FileText}>
                                    <textarea id="report-disclaimer-ar" maxLength={1000} value={form.report_disclaimer_ar} onChange={(event) => setField('report_disclaimer_ar', event.target.value)} className="input-field min-h-20 w-full resize-y text-xs" rows={3} dir="rtl" />
                                </Field>
                                <Field label={t('documents.invoiceFooter', { defaultValue: 'Invoice Footer' })} icon={Receipt}>
                                    <textarea id="invoice-footer" maxLength={1000} value={form.invoice_footer} onChange={(event) => setField('invoice_footer', event.target.value)} className="input-field min-h-20 w-full resize-y text-xs" rows={3} />
                                </Field>
                                <Field label={t('documents.receiptFooter', { defaultValue: 'Receipt Footer' })} icon={Receipt}>
                                    <textarea id="receipt-footer" maxLength={1000} value={form.receipt_footer} onChange={(event) => setField('receipt_footer', event.target.value)} className="input-field min-h-20 w-full resize-y text-xs" rows={3} />
                                </Field>
                                <Field label={t('printing.invoiceTerms', { defaultValue: 'Invoice Terms & Conditions' })} icon={Receipt}>
                                    <textarea id="invoice-terms" value={form.print_settings?.invoiceTerms || ''} onChange={(event) => setPrintField('invoiceTerms', event.target.value)} className="input-field min-h-20 w-full resize-y text-xs" rows={3} placeholder={t('printing.invoiceTermsPlaceholder')} />
                                </Field>
                                <Field label={t('printing.receiptFooter', { defaultValue: 'Thermal Receipt Custom Footer' })} icon={Receipt}>
                                    <textarea id="print-receipt-footer" value={form.print_settings?.receiptFooter || ''} onChange={(event) => setPrintField('receiptFooter', event.target.value)} className="input-field min-h-20 w-full resize-y text-xs" rows={3} placeholder={t('printing.receiptFooterPlaceholder')} />
                                </Field>
                            </div>
                        </SettingsSection>
                    )}

                    {/* Portal Identity */}
                    {(viewMode === 'all' || activeSection === 'portal') && (
                        <SettingsSection
                            id="portal"
                            icon={Globe2}
                            title={t('portal.title', { defaultValue: 'Patient Portal Content' })}
                            description={t('portal.description', { defaultValue: 'Customize patient-facing messaging and public homepage headers.' })}
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label={t('portal.welcomeMessage', { defaultValue: 'Portal Welcome Message' })} icon={Globe2}>
                                    <textarea id="portal-welcome-message" maxLength={700} value={form.portal_welcome_message} onChange={(event) => setField('portal_welcome_message', event.target.value)} className="input-field min-h-20 w-full resize-y text-xs" rows={3} />
                                </Field>
                                <Field label={t('portal.welcomeMessageAr', { defaultValue: 'Portal Welcome Message (Arabic)' })} icon={Globe2}>
                                    <textarea id="portal-welcome-message-ar" maxLength={700} value={form.portal_welcome_message_ar} onChange={(event) => setField('portal_welcome_message_ar', event.target.value)} className="input-field min-h-20 w-full resize-y text-xs" rows={3} dir="rtl" />
                                </Field>
                                <div className="md:col-span-2 rounded-[var(--VIARA-radius-surface)] border border-teal-500/25 bg-gradient-to-r from-teal-500/10 via-teal-50/50 to-sky-500/10 p-4 dark:border-teal-500/30 dark:from-teal-950/30 dark:via-slate-900 dark:to-sky-950/20 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--VIARA-radius-control)] bg-teal-500/15 text-teal-700 dark:text-teal-300">
                                            <Palette size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                                {t('portal.builderBannerTitle', { defaultValue: 'استوديو تخصيص البوابة العامة المتقدم' })}
                                            </h4>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                {t('portal.builderBannerDesc', { defaultValue: 'تحكم في القوالب، الألوان، ترتيب الأقسام، الأسئلة الشائعة، والمعاينة الحية.' })}
                                            </p>
                                        </div>
                                    </div>
                                    <a
                                        className="inline-flex items-center justify-center gap-2 rounded-[var(--VIARA-radius-control)] bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-xs transition hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-slate-950 shrink-0"
                                        href="/settings?tab=portalBuilder"
                                    >
                                        <span>{t('portal.openBuilder', { defaultValue: 'فتح منشئ البوابة المتقدم' })}</span>
                                        <ExternalLink size={13} className="rtl-flip" />
                                    </a>
                                </div>
                                <ToggleField checked={form.showPoweredByViara} onChange={(checked) => setField('showPoweredByViara', checked)} label={t('fields.showPoweredByViara', { defaultValue: 'Show Powered by VIARA badge' })} />
                            </div>
                        </SettingsSection>
                    )}

                    {/* Operating Hours & Shift Presets */}
                    {(viewMode === 'all' || activeSection === 'hours') && (
                        <SettingsSection
                            id="hours"
                            icon={CalendarClock}
                            title={t('hours.title', { defaultValue: 'Operating Hours & Schedule Window' })}
                            description={t('hours.description', { defaultValue: 'Define the facility-wide scheduling window using 24-hour integers.' })}
                        >
                            {/* 1-Click Shift Presets */}
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t('hours.presetsTitle')}</span>
                                <div className="flex flex-wrap items-center gap-2">
                                    {SHIFT_PRESETS.map((preset) => (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            onClick={() => applyShiftPreset(preset)}
                                            className="rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                        >
                                            {t(`hours.presets.${preset.key}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t('hours.open', { defaultValue: 'Opening Hour (0-24)' })} hint={t('hours.hourHint')} icon={Clock3}>
                                    <input id="opening-hour" type="number" min={0} max={24} required value={form.working_hours.start} onChange={(event) => setHour('start', event.target.value)} className="input-field w-full font-mono text-lg font-bold" dir="ltr" aria-describedby="hours-validation" />
                                </Field>
                                <Field label={t('hours.close', { defaultValue: 'Closing Hour (0-24)' })} hint={t('hours.hourHint')} icon={Clock3}>
                                    <input id="closing-hour" type="number" min={0} max={24} required value={form.working_hours.end} onChange={(event) => setHour('end', event.target.value)} className="input-field w-full font-mono text-lg font-bold" dir="ltr" aria-describedby="hours-validation" />
                                </Field>
                            </div>
                            {!hoursValid ? (
                                <p id="hours-validation" role="alert" className="mt-3 flex items-center gap-2 text-xs font-bold text-rose-600">
                                    <AlertTriangle size={15} />
                                    {t('hours.invalid')}
                                </p>
                            ) : null}

                            {/* Interactive Timeline Bar */}
                            <div className="mt-5 rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-800/80 dark:bg-slate-950/40">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('hours.window')}</p>
                                        <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                                            {formatHour(form.working_hours.start)} <span className="mx-1 text-slate-400">-</span> {formatHour(form.working_hours.end)}
                                        </p>
                                    </div>
                                    <span className="rounded-[var(--VIARA-radius-pill)] border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                                        {t('hours.duration', { count: calculateDuration(form.working_hours.start, form.working_hours.end) })}
                                    </span>
                                </div>

                                {/* 24-Hour Timeline Bar Visual */}
                                <div className="relative mt-4 h-3 overflow-hidden rounded-[var(--VIARA-radius-pill)] bg-slate-200 dark:bg-slate-800" aria-hidden="true">
                                    <div
                                        className="absolute top-0 bottom-0 rounded-[var(--VIARA-radius-pill)] transition-all duration-300"
                                        style={{
                                            backgroundColor: form.primary_color,
                                            marginInlineStart: `${(Number(form.working_hours.start) / 24) * 100}%`,
                                            width: `${(calculateDuration(form.working_hours.start, form.working_hours.end) / 24) * 100}%`
                                        }}
                                    />
                                </div>
                                <div className="mt-2 flex justify-between text-[10px] font-mono font-bold text-slate-400">
                                    <span>00:00</span>
                                    <span>06:00</span>
                                    <span>12:00</span>
                                    <span>18:00</span>
                                    <span>24:00</span>
                                </div>
                            </div>

                            {/* Interactive Working Days Selector */}
                            <div className="mt-5 rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-950/40">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('hours.workingDays')}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('hours.workingDaysDescription')}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {DAYS_OF_WEEK.map((day) => {
                                        const active = (form.working_hours?.workingDays || [0, 1, 2, 3, 4, 5, 6]).includes(day.value);
                                        return (
                                            <button
                                                key={day.value}
                                                type="button"
                                                onClick={() => {
                                                    const currentDays = form.working_hours?.workingDays || [0, 1, 2, 3, 4, 5, 6];
                                                    const nextDays = currentDays.includes(day.value)
                                                        ? currentDays.filter((d) => d !== day.value)
                                                        : [...currentDays, day.value].sort((a, b) => a - b);
                                                    setField('working_hours', {
                                                        ...form.working_hours,
                                                        workingDays: nextDays
                                                    });
                                                }}
                                                className={`rounded-[var(--VIARA-radius-control)] px-3.5 py-1.5 text-xs font-bold transition shadow-xs ${active
                                                    ? 'bg-teal-600 text-white shadow-teal-500/20'
                                                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                                                    }`}
                                            >
                                                {t(`hours.days.${day.value}`)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Official Holidays & Exception Days Tag Manager */}
                            <div className="mt-5 rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-950/40">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('hours.holidaysTitle')}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('hours.holidaysDescription')}</p>

                                <div className="mt-3 flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={holidayInput}
                                        onChange={(e) => setHolidayInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHoliday(); } }}
                                        placeholder={t('hours.holidayPlaceholder')}
                                        className="input-field text-xs font-semibold"
                                    />
                                    <button
                                        type="button"
                                        onClick={addHoliday}
                                        className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--VIARA-radius-control)] bg-slate-900 px-3.5 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                                    >
                                        <Plus size={14} />
                                        <span>{t('actions.add')}</span>
                                    </button>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {(form.working_hours.holidays || []).map((holiday) => (
                                        <span
                                            key={holiday}
                                            className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                        >
                                            <span>{holiday}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeHoliday(holiday)}
                                                className="text-slate-400 hover:text-rose-600"
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                    {(!form.working_hours.holidays || form.working_hours.holidays.length === 0) && (
                                        <span className="text-xs text-slate-400 italic">{t('hours.noHolidays')}</span>
                                    )}
                                </div>
                            </div>
                        </SettingsSection>
                    )}

                    {/* Tab Navigation Flow Bar (when in tabbed focus view) */}
                    {viewMode === 'tabs' && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/90 mt-6">
                            <div>
                                {prevSection ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveSection(prevSection.id);
                                            window.scrollTo({ top: 140, behavior: 'smooth' });
                                        }}
                                        className="inline-flex items-center gap-2 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <ChevronLeft size={15} className="rtl-flip" />
                                        <span>{t('actions.previous', { defaultValue: 'السابق' })}: {prevSection.label}</span>
                                    </button>
                                ) : <div />}
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                <span>{t('navigation.stepIndicator', { defaultValue: `قسم ${activeIndex + 1} من ${navSections.length}`, current: activeIndex + 1, total: navSections.length })}</span>
                                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{navSections[activeIndex]?.label}</span>
                            </div>
                            <div>
                                {nextSection ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveSection(nextSection.id);
                                            window.scrollTo({ top: 140, behavior: 'smooth' });
                                        }}
                                        className="inline-flex items-center gap-2 rounded-[var(--VIARA-radius-control)] bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                                    >
                                        <span>{t('actions.next', { defaultValue: 'التالي' })}: {nextSection.label}</span>
                                        <ChevronRight size={15} className="rtl-flip" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        disabled={!dirty || !hoursValid || updateState.isLoading}
                                        className="inline-flex items-center gap-2 rounded-[var(--VIARA-radius-control)] bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50"
                                    >
                                        <Save size={14} />
                                        <span>{t('actions.saveFinal', { defaultValue: 'حفظ جميع الإعدادات' })}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </main>

                {/* Right Sidebar: Live Identity & Previews Stack with Branch Context Switcher */}
                <aside className="space-y-4 xl:sticky xl:top-6">
                    <IdentitySummary t={t} identity={identity} form={form} />
                    <PreviewStack
                        t={t}
                        identity={identity}
                        form={form}
                        previewTab={previewTab}
                        setPreviewTab={setPreviewTab}
                        selectedPreviewBranchId={selectedPreviewBranchId}
                        setSelectedPreviewBranchId={setSelectedPreviewBranchId}
                        onExpandModal={() => setFullModalOpen(true)}
                    />
                </aside>

                {/* Modern Floating Action Glass Dock (Appears when Unsaved Changes exist) */}
                {dirty && (
                    <div className="cs-glass-dock" role="region" aria-label={t('status.title')}>
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="relative flex h-3 w-3 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                                    {t('status.unsaved', { defaultValue: 'Unsaved Changes' })}
                                </p>
                                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                                    {t('actions.saveHint', { defaultValue: 'Press Ctrl+S or click Save to apply changes.' })}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setDiscardConfirmOpen(true)}
                                disabled={updateState.isLoading}
                                className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <RotateCcw size={13} />
                                <span>{t('actions.discard', { defaultValue: 'Discard' })}</span>
                            </button>
                            <button
                                type="submit"
                                disabled={!hoursValid || updateState.isLoading}
                                className="inline-flex items-center gap-2 rounded-[var(--VIARA-radius-control)] bg-gradient-to-r from-teal-600 to-emerald-600 px-4.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {updateState.isLoading ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                                <span>{updateState.isLoading ? t('actions.saving', { defaultValue: 'Saving...' }) : t('actions.save', { defaultValue: 'Save Changes' })}</span>
                                <kbd className="hidden sm:inline-block rounded-[var(--VIARA-radius-control)] bg-black/20 px-1 py-0.2 font-mono text-[9px] font-normal tracking-wide opacity-80">
                                    Ctrl+S
                                </kbd>
                            </button>
                        </div>
                    </div>
                )}
            </form>


            {/* Branch Creation & Edit Modal */}
            {branchModalOpen && (
                <BranchEditModal
                    t={t}
                    branch={editingBranch}
                    isOpen={branchModalOpen}
                    onClose={() => { setBranchModalOpen(false); setEditingBranch(null); }}
                    onSave={handleSaveBranchModal}
                    formDefaultHours={form.working_hours}
                />
            )}

            {/* Branch Members & Staff Assignment Modal */}
            {membersModalBranch && (
                <BranchMembersModal
                    t={t}
                    branch={membersModalBranch}
                    isOpen={Boolean(membersModalBranch)}
                    onClose={() => setMembersModalBranch(null)}
                />
            )}

            {/* Full High-Fidelity Preview Modal */}
            {fullModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="center-preview-title">
                    <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-[var(--VIARA-radius-overlay)] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
                            <div>
                                <h3 id="center-preview-title" className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <Sparkles size={18} className="text-emerald-500" />
                                    <span>{t('documents.previewTitle', { defaultValue: 'Full High-Fidelity Previews' })}</span>
                                </h3>
                                <p className="text-xs text-slate-500">{t('documents.previewDescription', { defaultValue: 'Interactive simulation of print and digital templates with live identity and branch overrides.' })}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFullModalOpen(false)}
                                aria-label={t('actions.close')}
                                className="rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Top Bar: Preview Tabs & Branch Context */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60 shrink-0">
                            <div className="flex items-center gap-1.5 overflow-x-auto">
                                {[
                                    { id: 'report', label: t('previews.tabs.report', { defaultValue: 'Diagnostic Report (A4)' }) },
                                    { id: 'invoice', label: t('previews.tabs.invoice', { defaultValue: 'Tax Invoice (A4)' }) },
                                    { id: 'receipt', label: t('previews.receiptSlip', { defaultValue: 'Thermal Slip (80mm)' }) },
                                    { id: 'sticker', label: t('previews.tabs.sticker', { defaultValue: 'Specimen Sticker' }) },
                                    { id: 'portal', label: t('previews.tabs.portal', { defaultValue: 'Patient Portal' }) }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setModalPreviewTab(tab.id)}
                                        className={`rounded-[var(--VIARA-radius-control)] px-3 py-1.5 text-xs font-bold transition ${modalPreviewTab === tab.id
                                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {Array.isArray(form.branches) && form.branches.length > 0 && (
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-[11px] font-bold text-slate-400">{t('branches.previews.contextLabel', { defaultValue: 'Branch:' })}</span>
                                    <select
                                        value={selectedPreviewBranchId}
                                        onChange={(e) => setSelectedPreviewBranchId(e.target.value)}
                                        className="h-7 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                        <option value="master">{t('branches.previews.masterOrg', { defaultValue: 'Master (Default)' })}</option>
                                        {form.branches.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.displayName || b.name} {b.isMain ? '★' : ''} [{b.code}]
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Modal Body with Tab Views */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-100/60 dark:bg-slate-950/40">
                            {modalPreviewTab === 'report' && (
                                <div className="mx-auto max-w-2xl rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                    {/* Report Header */}
                                    <div className="flex items-start justify-between border-b pb-5 border-slate-200 dark:border-slate-800">
                                        <div className="flex items-center gap-4">
                                            {identity.logoUrl ? (
                                                <img src={identity.logoUrl} alt="" className="h-14 max-w-[160px] object-contain" />
                                            ) : (
                                                <div className="flex h-14 w-14 items-center justify-center rounded-[var(--VIARA-radius-control)] bg-slate-100 dark:bg-slate-800">
                                                    <Building2 size={32} className="text-slate-400" />
                                                </div>
                                            )}
                                            <div>
                                                <h4 className="text-base font-black text-slate-900 dark:text-white" style={{ color: normalizeColor(form.primary_color) }}>{identity.centerName}</h4>
                                                <p className="text-xs font-semibold text-slate-500">{identity.legalName || identity.branchName || 'Diagnostic Radiology Center'}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">{identity.address}</p>
                                            </div>
                                        </div>
                                        <div className="text-end text-xs text-slate-500 font-mono space-y-0.5" dir="ltr">
                                            <span className="inline-block rounded-[var(--VIARA-radius-control)] px-2 py-0.5 text-[10px] font-bold text-white mb-1" style={{ backgroundColor: normalizeColor(form.primary_color) }}>
                                                OFFICIAL REPORT
                                            </span>
                                            <p>{t('fields.taxId')}: {identity.taxId || 'N/A'}</p>
                                            <p>{t('fields.medicalLicense')}: {identity.medicalLicense || form.medical_license || 'N/A'}</p>
                                            <p>{identity.hotline || identity.phone || ''}</p>
                                        </div>
                                    </div>

                                    {/* Report Patient Bar */}
                                    <div className="my-5 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-50 p-3.5 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 dark:border-slate-800 dark:bg-slate-950/60">
                                        <div><span className="text-slate-400 text-[10px] block">Patient Name:</span><strong className="text-slate-800 dark:text-slate-200 font-bold">Ahmed Hassan M.</strong></div>
                                        <div><span className="text-slate-400 text-[10px] block">MRN / ID:</span><span className="font-mono font-bold text-slate-800 dark:text-slate-200">MRN-94821</span></div>
                                        <div><span className="text-slate-400 text-[10px] block">Modality:</span><span className="font-mono font-bold text-emerald-600">MRI Brain (With Contrast)</span></div>
                                        <div><span className="text-slate-400 text-[10px] block">Date:</span><span className="font-mono text-slate-700 dark:text-slate-300">2026-10-12</span></div>
                                    </div>

                                    {/* Clinical Content */}
                                    <div className="space-y-4 py-2">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Clinical History & Technique:</p>
                                            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-5">Multiplanar multisequence MRI of the brain before and after intravenous administration of gadolinium-based contrast agent.</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Impression & Findings:</p>
                                            <div className="rounded-[var(--VIARA-radius-control)] border border-dashed border-slate-200 bg-slate-50/60 p-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                                                Normal brain parenchyma without acute infarction, hemorrhage, or mass effect. Ventricles and sulcal spaces are age-appropriate. No abnormal parenchymal or meningeal contrast enhancement identified.
                                            </div>
                                        </div>
                                    </div>

                                    {/* Disclaimer & Footer */}
                                    <div className="mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-500 dark:border-slate-800 space-y-1">
                                        <p className="font-bold text-slate-700 dark:text-slate-300">{t('documents.disclaimer')}:</p>
                                        <p className="leading-4">{form.report_disclaimer || t('documents.defaultDisclaimer')}</p>
                                        {form.report_footer ? <p className="font-mono text-[10px] text-slate-400 pt-2">{form.report_footer}</p> : null}
                                    </div>
                                </div>
                            )}

                            {modalPreviewTab === 'invoice' && (
                                <div className="mx-auto max-w-2xl rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex items-start justify-between border-b pb-5 border-slate-200 dark:border-slate-800">
                                        <div>
                                            <h4 className="text-base font-black text-slate-900 dark:text-white" style={{ color: normalizeColor(form.secondary_color) }}>{identity.centerName}</h4>
                                            <p className="text-xs text-slate-500">{identity.address}</p>
                                            <p className="text-xs font-mono text-slate-400">{identity.hotline || identity.phone}</p>
                                        </div>
                                        <div className="text-end font-mono text-xs" dir="ltr">
                                            <p className="text-lg font-black text-slate-900 dark:text-white">TAX INVOICE</p>
                                            <p className="text-slate-500">#{form.invoice_prefix || 'INV-'}2026-0081</p>
                                            <p className="text-slate-400">Date: 2026-10-12</p>
                                            <p className="text-slate-400">Tax ID: {identity.taxId || 'N/A'}</p>
                                        </div>
                                    </div>
                                    <div className="my-5 space-y-2">
                                        <div className="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold text-slate-400 uppercase">
                                            <span>Service Item</span>
                                            <span>Amount</span>
                                        </div>
                                        <div className="flex justify-between text-xs py-1.5 text-slate-800 dark:text-slate-200">
                                            <span>MRI Brain Study (Contrast)</span>
                                            <span className="font-mono font-bold">2,400.00 {form.currency || 'EGP'}</span>
                                        </div>
                                        {form.urgent_priority_fee > 0 && (
                                            <div className="flex justify-between text-xs py-1 text-slate-600 dark:text-slate-400">
                                                <span>Urgent Priority Surcharge</span>
                                                <span className="font-mono">+{Number(form.urgent_priority_fee).toFixed(2)} {form.currency || 'EGP'}</span>
                                            </div>
                                        )}
                                        {form.vat_enabled && (
                                            <div className="flex justify-between text-xs py-1 text-slate-600 dark:text-slate-400">
                                                <span>VAT ({form.vat_rate || 0}%)</span>
                                                <span className="font-mono">+{((2400 * (form.vat_rate || 0)) / 100).toFixed(2)} {form.currency || 'EGP'}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between border-t border-slate-200 pt-3 text-sm font-black text-slate-900 dark:text-white dark:border-slate-800">
                                            <span>Total Due</span>
                                            <span className="font-mono" style={{ color: normalizeColor(form.secondary_color) }}>
                                                {(2400 + (form.urgent_priority_fee || 0) + (form.vat_enabled ? (2400 * (form.vat_rate || 0)) / 100 : 0)).toFixed(2)} {form.currency || 'EGP'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-6 border-t border-slate-200 pt-3 text-[11px] text-slate-500 dark:border-slate-800">
                                        <p className="font-bold">{t('printing.invoiceTerms')}:</p>
                                        <p>{form.print_settings?.invoiceTerms || form.invoice_footer || 'All diagnostic fees are non-refundable after exam initiation.'}</p>
                                    </div>
                                </div>
                            )}

                            {modalPreviewTab === 'receipt' && (
                                <div className="mx-auto max-w-xs rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-white p-5 shadow-sm font-mono text-xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="text-center border-b border-dashed border-slate-300 pb-3 dark:border-slate-700">
                                        <p className="font-black text-sm uppercase text-slate-900 dark:text-white">{identity.centerName}</p>
                                        <p className="text-[10px] text-slate-500">{identity.branchName || 'Thermal POS Terminal'}</p>
                                        <p className="text-[10px] text-slate-400">{identity.hotline || identity.phone}</p>
                                        <p className="text-[9px] text-slate-400">Tax Reg: {identity.taxId || 'N/A'}</p>
                                    </div>
                                    <div className="py-3 space-y-1.5 border-b border-dashed border-slate-300 text-[11px] dark:border-slate-700">
                                        <div className="flex justify-between"><span>TXN:</span><span>#REC-84920</span></div>
                                        <div className="flex justify-between"><span>DATE:</span><span>2026-10-12 11:24</span></div>
                                        <div className="flex justify-between"><span>PT:</span><span>Ahmed Hassan M.</span></div>
                                        <div className="flex justify-between"><span>EXAM:</span><span>MRI BRAIN</span></div>
                                        <div className="flex justify-between font-bold pt-1 border-t border-slate-200 dark:border-slate-800">
                                            <span>TOTAL PAID:</span>
                                            <span>2,400.00 {form.currency}</span>
                                        </div>
                                    </div>
                                    <div className="text-center pt-3 space-y-2 text-[10px] text-slate-500">
                                        <div className="h-9 bg-slate-900 dark:bg-slate-100 rounded-[var(--VIARA-radius-control)] flex items-center justify-center text-white dark:text-slate-900 text-[9px] tracking-widest font-black">
                                            ||| | |||| | ||| |||| |
                                        </div>
                                        <p className="text-[9px]">{form.receipt_footer || form.print_settings?.receiptFooter || 'Thank you for choosing our center.'}</p>
                                    </div>
                                </div>
                            )}

                            {modalPreviewTab === 'sticker' && (
                                <div className="mx-auto max-w-sm rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                    <div className="rounded-[var(--VIARA-radius-control)] border-2 border-dashed border-slate-300 p-4 space-y-3 dark:border-slate-700">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase">{identity.centerName}</p>
                                                <p className="text-[9px] font-semibold text-slate-500">{identity.branchName || 'Diagnostic Unit'}</p>
                                            </div>
                                            <div className="h-8 w-8 rounded-[var(--VIARA-radius-control)] bg-slate-900 dark:bg-slate-100 flex items-center justify-center text-white dark:text-slate-900 text-[8px] font-black">
                                                QR
                                            </div>
                                        </div>
                                        <div className="font-mono text-xs space-y-0.5">
                                            <p className="font-bold text-slate-900 dark:text-white">Ahmed Hassan M.</p>
                                            <p className="text-[11px] text-slate-500">MRN-94821 · M / 38Y</p>
                                            <p className="text-[10px] text-emerald-600 font-bold">ACC: 2026-MRI-0941 · MRI BRAIN</p>
                                        </div>
                                        <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-[var(--VIARA-radius-control)] flex items-center justify-center text-[8px] font-mono tracking-widest text-slate-600 dark:text-slate-400">
                                            *MRN-94821-2026-MRI*
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalPreviewTab === 'portal' && (
                                <div className="mx-auto max-w-xl rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                    <div className="p-6 text-white" style={{ backgroundColor: normalizeColor(form.primary_color) }}>
                                        <div className="flex items-center gap-3">
                                            {identity.logoUrl ? (
                                                <img src={identity.logoUrl} alt="" className="h-10 max-w-[120px] object-contain brightness-0 invert" />
                                            ) : (
                                                <Building2 size={28} />
                                            )}
                                            <div>
                                                <p className="text-base font-black">{identity.centerName}</p>
                                                <p className="text-xs opacity-85">Patient Access & Online Portal</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-white/20">
                                            <p className="text-xs font-medium leading-relaxed">
                                                {form.portal_welcome_message || form.homepage_settings?.heroTitle || 'Welcome to our radiology portal. You can view your medical scans, download official reports, and track your appointment schedule.'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-50 text-xs flex justify-between items-center text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                                        <span>Direct Booking & DICOM Viewer</span>
                                        {form.showPoweredByViara ? <span className="font-bold text-emerald-600">Powered by VIARA</span> : null}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-end p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
                            <button
                                type="button"
                                onClick={() => setFullModalOpen(false)}
                                className="rounded-[var(--VIARA-radius-control)] bg-slate-900 px-5 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                            >
                                {t('actions.close', { defaultValue: 'Close' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={discardConfirmOpen}
                onClose={() => setDiscardConfirmOpen(false)}
                onConfirm={reset}
                title={t('actions.discard')}
                message={t('messages.discardConfirm', { defaultValue: 'Discard all unsaved center settings changes?' })}
                confirmText={t('actions.discard')}
                cancelLabel={t('actions.cancel', { defaultValue: 'Cancel' })}
                variant="warning"
            />
            <ConfirmDialog
                isOpen={Boolean(branchDeleteId)}
                onClose={() => setBranchDeleteId(null)}
                onConfirm={confirmDeleteBranch}
                title={t('branches.deleteBranch')}
                message={t('branches.deleteConfirm')}
                confirmText={t('branches.deleteBranch')}
                cancelLabel={t('actions.cancel', { defaultValue: 'Cancel' })}
            />
        </div>
    );
};

// ─── Multi-Branch Chains Manager Component ──────────────────────────────────

const BranchManager = ({
    t,
    branches,
    quota,
    branchSearch,
    setBranchSearch,
    branchFilter,
    setBranchFilter,
    branchViewMode,
    setBranchViewMode,
    filteredBranches,
    stats,
    onAddBranch,
    onEditBranch,
    onDuplicateBranch,
    onSetPrimaryHQ,
    onDeleteBranch,
    onToggleStatus,
    onManageMembers
}) => {
    const filterOptions = [
        { key: 'all', label: t('branches.filterAll', { defaultValue: 'All Branches' }), count: stats.total },
        { key: 'active', label: t('branches.statuses.active', { defaultValue: 'Active' }), count: stats.active },
        { key: 'maintenance', label: t('branches.statuses.maintenance', { defaultValue: 'Maintenance' }), count: stats.maintenance },
        { key: 'inactive', label: t('branches.statuses.inactive', { defaultValue: 'Inactive' }), count: stats.inactive }
    ];

    const canAddMore = !quota || quota.canCreateMore !== false;

    return (
        <div className="space-y-4">
            {/* License Quota Status Banner */}
            {quota && (
                <div className={`flex flex-col gap-2 rounded-[var(--VIARA-radius-surface)] border p-3.5 sm:flex-row sm:items-center sm:justify-between transition ${
                    !quota.multiBranchAllowed
                        ? 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
                        : !quota.canCreateMore
                            ? 'border-purple-200 bg-purple-50/70 text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200'
                            : 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-[var(--VIARA-radius-control)] shrink-0 ${
                            !quota.multiBranchAllowed
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                                : !quota.canCreateMore
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                        }`}>
                            <ShieldCheck size={18} />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black uppercase tracking-wider">
                                    {quota.edition?.toUpperCase()} {t('branches.quota.edition', { defaultValue: 'License' })}
                                </span>
                                <span className="rounded-[var(--VIARA-radius-control)] border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-bold shadow-xs dark:border-slate-800 dark:bg-slate-900/90">
                                    {quota.multiBranchAllowed 
                                        ? (quota.maxBranches === -1 ? t('branches.quota.unlimited', { defaultValue: 'Unlimited Branches' }) : `${quota.currentCount} / ${quota.maxBranches} ${t('branches.quota.used', { defaultValue: 'Branches used' })}`)
                                        : t('branches.quota.singleBranchOnly', { defaultValue: 'Single Branch Locked' })
                                    }
                                </span>
                            </div>
                            <p className="mt-0.5 text-[11px] opacity-80 leading-relaxed">
                                {!quota.multiBranchAllowed
                                    ? t('branches.quota.upgradeNotice', { defaultValue: 'Multi-branch operations require an Enterprise or Developer signed license key.' })
                                    : !quota.canCreateMore
                                        ? t('branches.quota.quotaReached', { defaultValue: 'Maximum licensed branch quota reached. Contact VIARA to expand branch capacity.' })
                                        : t('branches.quota.healthy', { defaultValue: 'Multi-branch operations active. Clinical, financial, and inventory data are isolated per branch.' })
                                }
                            </p>
                        </div>
                    </div>
                    {!quota.canCreateMore && (
                        <span className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-[var(--VIARA-radius-control)] bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                            <AlertTriangle size={14} />
                            <span>{t('branches.quota.quotaFull', { defaultValue: 'Quota Full' })}</span>
                        </span>
                    )}
                </div>
            )}

            {/* Header & Metric Counter Pills */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        <Building size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <span>{t('branches.stats.total')}: {stats.total}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>{t('branches.stats.active')}: {stats.active}</span>
                    </span>
                    {stats.maintenance > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
                            <Wrench size={13} />
                            <span>{t('branches.stats.maintenance')}: {stats.maintenance}</span>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* View Mode Toggle */}
                    <div className="flex rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                        <button
                            type="button"
                            onClick={() => setBranchViewMode('grid')}
                            className={`flex h-8 w-8 items-center justify-center rounded-[var(--VIARA-radius-control)] transition ${branchViewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                            title="Grid View"
                        >
                            <LayoutGrid size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setBranchViewMode('table')}
                            className={`flex h-8 w-8 items-center justify-center rounded-[var(--VIARA-radius-control)] transition ${branchViewMode === 'table' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                            title="Table View"
                        >
                            <Table size={15} />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={onAddBranch}
                        disabled={!canAddMore}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-[var(--VIARA-radius-control)] px-4 text-xs font-bold shadow-sm transition active:scale-[0.98] ${
                            !canAddMore
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400'
                        }`}
                        title={!canAddMore ? 'Branch creation not available under current license limit' : 'Add Branch'}
                    >
                        <Plus size={15} />
                        <span>{t('branches.addBranch', { defaultValue: 'Add Branch' })}</span>
                    </button>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800/80 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-center gap-1.5">
                    {filterOptions.map((opt) => (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => setBranchFilter(opt.key)}
                            className={`rounded-[var(--VIARA-radius-control)] px-2.5 py-1 text-xs font-bold transition ${branchFilter === opt.key
                                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                                : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                                }`}
                        >
                            {opt.label} <span className="opacity-60 text-[10px]">({opt.count})</span>
                        </button>
                    ))}
                </div>

                <div className="relative min-w-[200px] sm:w-64">
                    <Search size={13} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={branchSearch}
                        onChange={(e) => setBranchSearch(e.target.value)}
                        placeholder={t('branches.searchPlaceholder', { defaultValue: 'Search branches...' })}
                        className="h-8 w-full rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white pe-2.5 ps-8 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    />
                    {branchSearch ? (
                        <button type="button" onClick={() => setBranchSearch('')} className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                            <X size={12} />
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Branches Card Grid or Dense Table View */}
            {filteredBranches.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[var(--VIARA-radius-surface)] border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                    <Building size={36} className="text-slate-300 dark:text-slate-600" />
                    <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">{t('branches.noBranchesFound', { defaultValue: 'No branches found' })}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{t('branches.emptyStateDesc')}</p>
                    <button
                        type="button"
                        onClick={onAddBranch}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                        <Plus size={14} />
                        <span>{t('branches.addBranch')}</span>
                    </button>
                </div>
            ) : branchViewMode === 'grid' ? (
                <div className="grid gap-4 md:grid-cols-2">
                    {filteredBranches.map((branch) => (
                        <BranchCard
                            key={branch.id}
                            t={t}
                            branch={branch}
                            onEdit={() => onEditBranch(branch)}
                            onDuplicate={() => onDuplicateBranch(branch)}
                            onSetMain={() => onSetPrimaryHQ(branch.id)}
                            onDelete={() => onDeleteBranch(branch.id)}
                            onToggleStatus={() => onToggleStatus(branch.id)}
                            onManageMembers={() => onManageMembers(branch)}
                        />
                    ))}
                </div>
            ) : (
                <BranchTableView
                    t={t}
                    branches={filteredBranches}
                    onEdit={onEditBranch}
                    onDuplicate={onDuplicateBranch}
                    onSetMain={onSetPrimaryHQ}
                    onDelete={onDeleteBranch}
                    onToggleStatus={onToggleStatus}
                    onManageMembers={onManageMembers}
                />
            )}
        </div>
    );
};

const BranchCard = ({ t, branch, onEdit, onDuplicate, onSetMain, onDelete, onToggleStatus, onManageMembers }) => {
    const isMain = branch.isMain;
    const statusObj = BRANCH_STATUSES.find((s) => s.value === branch.status) || BRANCH_STATUSES[0];
    const typeObj = BRANCH_TYPES.find((type) => type.value === branch.type) || BRANCH_TYPES[1];

    return (
        <div className={`relative flex flex-col justify-between rounded-[var(--VIARA-radius-surface)] border transition-all duration-200 p-4.5 bg-white shadow-xs dark:bg-slate-900/90 ${isMain
            ? 'border-amber-400/70 ring-2 ring-amber-400/20 bg-gradient-to-br from-amber-500/5 via-white to-transparent dark:from-amber-950/20 dark:to-slate-900'
            : 'border-slate-200/90 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
            }`}>
            {/* Top Bar: Badges & Actions */}
            <div>
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        {/* Status Toggle Button */}
                        <button
                            type="button"
                            onClick={onToggleStatus}
                            title="Click to toggle status"
                            className={`inline-flex items-center gap-1 rounded-[var(--VIARA-radius-control)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider transition ${branch.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                : branch.status === 'maintenance'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${branch.status === 'active' ? 'bg-emerald-500 animate-pulse' : branch.status === 'maintenance' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                            <span>{t(statusObj.labelKey, { defaultValue: statusObj.defaultLabel })}</span>
                        </button>

                        {/* Branch Type Tag */}
                        <span className="rounded-[var(--VIARA-radius-control)] bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {t(typeObj.labelKey, { defaultValue: typeObj.defaultLabel })}
                        </span>

                        {/* Primary HQ Crown Badge */}
                        {isMain ? (
                            <span className="inline-flex items-center gap-1 rounded-[var(--VIARA-radius-control)] bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-300">
                                <Crown size={12} className="text-amber-500 fill-amber-500" />
                                <span>{t('branches.isMainBadge', { defaultValue: 'Primary HQ' })}</span>
                            </span>
                        ) : null}
                    </div>

                    {/* Quick Card Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={onManageMembers}
                            title={t('branches.manageStaff', { defaultValue: 'Manage Branch Staff & Memberships' })}
                            className="flex h-7 w-7 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <Users size={13} />
                        </button>
                        {!isMain && (
                            <button
                                type="button"
                                onClick={onSetMain}
                                title={t('branches.setAsMain', { defaultValue: 'Set as Primary HQ' })}
                                className="flex h-7 w-7 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-50 text-slate-400 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600 dark:border-slate-800 dark:bg-slate-950 dark:hover:text-amber-400"
                            >
                                <Crown size={13} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onEdit}
                            title={t('branches.editBranch', { defaultValue: 'Edit Branch' })}
                            className="flex h-7 w-7 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <Edit3 size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={onDuplicate}
                            title={t('branches.duplicateBranch', { defaultValue: 'Duplicate' })}
                            className="flex h-7 w-7 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                        >
                            <CopyPlus size={13} />
                        </button>
                        {!isMain && (
                            <button
                                type="button"
                                onClick={onDelete}
                                title={t('branches.deleteBranch', { defaultValue: 'Delete' })}
                                className="flex h-7 w-7 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-rose-950/40"
                            >
                                <Trash2 size={13} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Identity & Core Details */}
                <div className="mt-3 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                            {branch.displayName || branch.name || 'Branch Location'}
                        </h4>
                        <span className="font-mono text-[10px] font-bold text-slate-400 shrink-0">
                            [{branch.code || 'NO-CODE'}]
                        </span>
                    </div>
                    {branch.nameAr ? (
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400" dir="rtl">
                            {branch.displayNameAr || branch.nameAr}
                        </p>
                    ) : null}
                </div>

                {/* Address & Operational Line */}
                <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <MapPin size={13} className="shrink-0 text-slate-400" />
                        <span className="truncate text-[11px] font-medium">
                            {branch.address || branch.city || branch.governorate || t('summary.noAddress')}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                        <Phone size={13} className="shrink-0 text-slate-400" />
                        <span className="truncate text-[11px] font-mono font-bold">
                            {branch.hotline || branch.phone || t('summary.noPhone')}
                        </span>
                        {branch.whatsapp ? (
                            <span className="inline-flex items-center gap-0.5 rounded-[var(--VIARA-radius-control)] bg-emerald-50 px-1 py-0.2 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                                WA
                            </span>
                        ) : null}
                    </div>
                    {branch.managerName ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                            <Stethoscope size={13} className="shrink-0 text-slate-400" />
                            <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {branch.managerName}
                            </span>
                        </div>
                    ) : null}
                </div>

                {/* Modalities Chips */}
                {Array.isArray(branch.modalities) && branch.modalities.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                        {branch.modalities.map((mod) => (
                            <span
                                key={mod}
                                className="rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                            >
                                {mod}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Card Footer: Invoice Prefix & License Badge */}
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[10px] text-slate-400 dark:border-slate-800">
                <span className="font-mono font-semibold">
                    Prefix: <strong className="text-slate-700 dark:text-slate-200">{branch.invoicePrefix || 'INV-'}</strong>
                </span>
                {branch.medicalLicense ? (
                    <span className="truncate max-w-[140px]" title={branch.medicalLicense}>
                        Lic: {branch.medicalLicense}
                    </span>
                ) : (
                    <span>Standard Unit</span>
                )}
            </div>
        </div>
    );
};

const BranchTableView = ({ t, branches, onEdit, onDuplicate, onSetMain, onDelete, onToggleStatus, onManageMembers }) => (
    <div className="overflow-x-auto rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-start text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                <tr>
                    <th className="px-3 py-2.5 text-start">{t('fields.branchCode')}</th>
                    <th className="px-3 py-2.5 text-start">{t('fields.branchName')}</th>
                    <th className="px-3 py-2.5 text-start">{t('branches.modal.typeLabel')}</th>
                    <th className="px-3 py-2.5 text-start">{t('branches.modal.statusLabel')}</th>
                    <th className="px-3 py-2.5 text-start">{t('fields.city')}</th>
                    <th className="px-3 py-2.5 text-start">{t('fields.phone')}</th>
                    <th className="px-3 py-2.5 text-end">{t('previews.tabs.all')}</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {branches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                            {b.code}
                            {b.isMain ? <Crown size={11} className="inline ms-1 text-amber-500" /> : null}
                        </td>
                        <td className="px-3 py-2">
                            <p className="font-bold text-slate-900 dark:text-white">{b.displayName || b.name}</p>
                            {b.nameAr ? <p className="text-[10px] text-slate-400" dir="rtl">{b.nameAr}</p> : null}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{b.type}</td>
                        <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${b.status === 'active' ? 'bg-emerald-50 text-emerald-700' : b.status === 'maintenance' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                {b.status}
                            </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{b.city || b.governorate || '-'}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{b.hotline || b.phone || '-'}</td>
                        <td className="px-3 py-2 text-end">
                            <div className="inline-flex items-center gap-1">
                                <button type="button" onClick={() => onManageMembers(b)} title={t('branches.manageStaff', { defaultValue: 'Manage Staff Members' })} className="p-1 text-slate-500 hover:text-blue-600"><Users size={13} /></button>
                                <button type="button" onClick={() => onEdit(b)} className="p-1 text-slate-500 hover:text-emerald-600"><Edit3 size={13} /></button>
                                <button type="button" onClick={() => onDuplicate(b)} className="p-1 text-slate-500 hover:text-slate-800"><CopyPlus size={13} /></button>
                                {!b.isMain && <button type="button" onClick={() => onDelete(b.id)} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ─── Modal for Managing Branch Staff & Memberships ──────────────────────────

const BranchMembersModal = ({ t, branch, isOpen, onClose }) => {
    const { data: membersData, isLoading: isLoadingMembers } = useGetBranchMembersQuery(branch?.id, { skip: !branch?.id });
    const { data: staffList = [] } = useGetStaffQuery();
    const [assignMember, { isLoading: isAssigning }] = useAssignBranchMemberMutation();
    const [removeMember, { isLoading: isRemoving }] = useRemoveBranchMemberMutation();

    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedRole, setSelectedRole] = useState('Staff');
    const [isDefaultBranch, setIsDefaultBranch] = useState(false);
    const [searchMember, setSearchMember] = useState('');
    const [removingUserId, setRemovingUserId] = useState(null);

    if (!isOpen || !branch) return null;

    const members = membersData?.members || [];
    const assignedUserIds = new Set(members.map((m) => m.user_id));

    // Available staff to assign (not already members)
    const availableStaff = staffList.filter((s) => !assignedUserIds.has(s.user_id));

    // Filter assigned members
    const filteredMembers = members.filter((m) => {
        if (!searchMember) return true;
        const q = searchMember.toLowerCase();
        return (
            m.full_name?.toLowerCase().includes(q) ||
            m.email?.toLowerCase().includes(q) ||
            m.system_role?.toLowerCase().includes(q) ||
            m.branch_role?.toLowerCase().includes(q)
        );
    });

    const handleAssign = async (e) => {
        e?.preventDefault();
        if (!selectedUserId) {
            toast.error(t('branches.members.selectUserRequired', { defaultValue: 'Please select a staff member' }));
            return;
        }

        try {
            await assignMember({
                branchId: branch.id,
                userId: selectedUserId,
                role: selectedRole,
                isDefault: isDefaultBranch,
            }).unwrap();
            toast.success(t('branches.members.assignSuccess', { defaultValue: 'Staff member assigned to branch successfully' }));
            setSelectedUserId('');
            setSelectedRole('Staff');
            setIsDefaultBranch(false);
        } catch (err) {
            toast.error(getErrorMessage(err, t('branches.members.assignError', { defaultValue: 'Failed to assign staff member' })));
        }
    };

    const handleRemove = async (userId) => {
        try {
            await removeMember({ branchId: branch.id, userId }).unwrap();
            toast.success(t('branches.members.removeSuccess', { defaultValue: 'Staff member removed from branch' }));
            setRemovingUserId(null);
        } catch (err) {
            toast.error(getErrorMessage(err, t('branches.members.removeError', { defaultValue: 'Failed to remove staff member' })));
        }
    };

    const BRANCH_ROLES = [
        'Branch Admin',
        'Staff',
        'Receptionist',
        'Cashier',
        'Radiologist',
        'Technician',
        'Nurse',
        'Accountant'
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
            <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[var(--VIARA-radius-overlay)] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--VIARA-radius-control)] bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                            <Users size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {t('branches.members.title', { defaultValue: 'Branch Staff & Memberships' })}
                                </h3>
                                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[var(--VIARA-radius-control)] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    [{branch.code}]
                                </span>
                                {branch.isMain && (
                                    <span className="inline-flex items-center gap-1 rounded-[var(--VIARA-radius-control)] bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                                        <Crown size={11} /> Primary HQ
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {branch.displayName || branch.name} · {members.length} {t('branches.members.assignedCount', { defaultValue: 'active members' })}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--VIARA-radius-control)] text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Assign New Member Section */}
                    <div className="rounded-[var(--VIARA-radius-surface)] border border-blue-100 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
                        <div className="flex items-center gap-2">
                            <UserPlus size={15} className="text-blue-600 dark:text-blue-400" />
                            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                                {t('branches.members.assignHeader', { defaultValue: 'Assign Staff Member to Branch' })}
                            </h4>
                        </div>
                        <form onSubmit={handleAssign} className="grid gap-3 sm:grid-cols-12 items-end">
                            <div className="sm:col-span-5">
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    {t('branches.members.selectUser', { defaultValue: 'Staff Member' })}
                                </label>
                                <select
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(e.target.value)}
                                    className="input-field w-full text-xs"
                                >
                                    <option value="">{t('branches.members.chooseStaff', { defaultValue: '-- Select staff member --' })}</option>
                                    {availableStaff.map((staff) => (
                                        <option key={staff.user_id} value={staff.user_id}>
                                            {staff.full_name} ({staff.role})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="sm:col-span-4">
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    {t('branches.members.branchRole', { defaultValue: 'Branch Role' })}
                                </label>
                                <select
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value)}
                                    className="input-field w-full text-xs"
                                >
                                    {BRANCH_ROLES.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="sm:col-span-3">
                                <button
                                    type="submit"
                                    disabled={!selectedUserId || isAssigning}
                                    className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    <UserPlus size={13} />
                                    <span>{isAssigning ? '...' : t('branches.members.assignBtn', { defaultValue: 'Assign' })}</span>
                                </button>
                            </div>
                            <div className="sm:col-span-12 flex items-center gap-2 pt-1">
                                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isDefaultBranch}
                                        onChange={(e) => setIsDefaultBranch(e.target.checked)}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                                    />
                                    <span>{t('branches.members.setPrimary', { defaultValue: 'Set as primary / default branch for this user' })}</span>
                                </label>
                            </div>
                        </form>
                    </div>

                    {/* Members List Section */}
                    <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                {t('branches.members.currentMembers', { defaultValue: 'Assigned Staff Members' })} ({filteredMembers.length})
                            </h4>
                            <div className="relative w-full sm:w-56">
                                <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchMember}
                                    onChange={(e) => setSearchMember(e.target.value)}
                                    placeholder={t('branches.members.searchPlaceholder', { defaultValue: 'Filter members...' })}
                                    className="input-field ps-8 py-1 text-xs w-full"
                                />
                            </div>
                        </div>

                        {isLoadingMembers ? (
                            <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                                {t('common.loading', { defaultValue: 'Loading members...' })}
                            </div>
                        ) : filteredMembers.length === 0 ? (
                            <div className="rounded-[var(--VIARA-radius-surface)] border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
                                {searchMember
                                    ? t('branches.members.noFilterResults', { defaultValue: 'No members match your search' })
                                    : t('branches.members.noMembers', { defaultValue: 'No staff members assigned to this branch yet. Use the form above to assign staff.' })
                                }
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 rounded-[var(--VIARA-radius-surface)] border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/60 overflow-hidden">
                                {filteredMembers.map((member) => (
                                    <div
                                        key={member.membership_id || member.user_id}
                                        className="flex items-center justify-between p-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-control)] bg-slate-100 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-xs">
                                                {member.full_name?.charAt(0) || 'U'}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                                        {member.full_name}
                                                    </p>
                                                    {member.is_default && (
                                                        <span className="inline-flex items-center gap-0.5 rounded-[var(--VIARA-radius-control)] bg-amber-50 px-1.5 py-0.2 text-[9px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                                                            ★ {t('branches.members.defaultBadge', { defaultValue: 'Default' })}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-400 truncate">
                                                    <span>{member.email}</span>
                                                    <span>·</span>
                                                    <span className="font-medium text-slate-600 dark:text-slate-300">{member.system_role}</span>
                                                    {member.branch_role && member.branch_role !== member.system_role && (
                                                        <>
                                                            <span>·</span>
                                                            <span className="text-blue-600 dark:text-blue-400 font-semibold">({member.branch_role})</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {removingUserId === member.user_id ? (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemove(member.user_id)}
                                                        disabled={isRemoving}
                                                        className="px-2 py-0.5 rounded-[var(--VIARA-radius-control)] text-[10px] font-bold bg-rose-600 text-white hover:bg-rose-700"
                                                    >
                                                        {t('common.confirm', { defaultValue: 'Confirm' })}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setRemovingUserId(null)}
                                                        className="px-2 py-0.5 rounded-[var(--VIARA-radius-control)] text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                                    >
                                                        {t('common.cancel', { defaultValue: 'Cancel' })}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setRemovingUserId(member.user_id)}
                                                    title={t('branches.members.remove', { defaultValue: 'Remove from branch' })}
                                                    className="flex h-7 w-7 items-center justify-center rounded-[var(--VIARA-radius-control)] text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                                                >
                                                    <UserX size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-[var(--VIARA-radius-control)] bg-slate-900 px-5 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                    >
                        {t('actions.close', { defaultValue: 'Close' })}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Modal for Adding & Editing Branches ────────────────────────────────────

const BranchEditModal = ({ t, branch, isOpen, onClose, onSave, formDefaultHours }) => {
    const [draft, setDraft] = useState(() => ({ ...branch }));
    const [modalTab, setModalTab] = useState('general');

    if (!isOpen || !branch) return null;

    const setDraftField = (field, value) => setDraft((curr) => ({ ...curr, [field]: value }));

    const toggleModality = (mod) => {
        const list = draft.modalities || [];
        const next = list.includes(mod) ? list.filter((m) => m !== mod) : [...list, mod];
        setDraftField('modalities', next);
    };

    const tabs = [
        { id: 'general', label: t('branches.modal.tabs.general', { defaultValue: 'General & Info' }) },
        { id: 'contact', label: t('branches.modal.tabs.contact', { defaultValue: 'Location & Contact' }) },
        { id: 'legal', label: t('branches.modal.tabs.legal', { defaultValue: 'Licensing & Billing' }) },
        { id: 'modalities', label: t('branches.modal.tabs.modalities', { defaultValue: 'Modalities & Hours' }) },
        { id: 'documents', label: t('branches.modal.tabs.documents', { defaultValue: 'Letterheads' }) }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
            <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[var(--VIARA-radius-overlay)] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--VIARA-radius-control)] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <Building size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white">
                                {draft.name ? draft.name : t('branches.modal.addTitle', { defaultValue: 'Add New Branch Location' })}
                            </h3>
                            <p className="text-xs text-slate-500">
                                {draft.code ? `Code: ${draft.code}` : t('branches.modal.codeHint')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Sub Tab Navigation */}
                <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/70 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/40 shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setModalTab(tab.id)}
                                className={`whitespace-nowrap rounded-[var(--VIARA-radius-control)] px-3 py-1.5 text-xs font-bold transition ${modalTab === tab.id
                                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {modalTab === 'general' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={t('fields.branchName')} required icon={Building}>
                                <input
                                    type="text"
                                    required
                                    value={draft.name}
                                    onChange={(e) => setDraftField('name', e.target.value)}
                                    placeholder="e.g. Maadi Radiology Center"
                                    className="input-field w-full font-bold"
                                />
                            </Field>
                            <Field label={t('fields.branchNameAr')} icon={Building}>
                                <input
                                    type="text"
                                    value={draft.nameAr}
                                    onChange={(e) => setDraftField('nameAr', e.target.value)}
                                    placeholder="مثال: مركز المعادي للأشعة"
                                    className="input-field w-full font-semibold"
                                    dir="rtl"
                                />
                            </Field>
                            <Field label={t('fields.branchDisplayName')} icon={Building}>
                                <input
                                    type="text"
                                    value={draft.displayName}
                                    onChange={(e) => setDraftField('displayName', e.target.value)}
                                    className="input-field w-full"
                                />
                            </Field>
                            <Field label={t('fields.branchDisplayNameAr')} icon={Building}>
                                <input
                                    type="text"
                                    value={draft.displayNameAr}
                                    onChange={(e) => setDraftField('displayNameAr', e.target.value)}
                                    className="input-field w-full"
                                    dir="rtl"
                                />
                            </Field>
                            <Field label={t('fields.branchCode')} hint={t('branches.modal.codeHint')} required icon={Hash}>
                                <input
                                    type="text"
                                    required
                                    value={draft.code}
                                    onChange={(e) => setDraftField('code', e.target.value.toUpperCase())}
                                    className="input-field w-full font-mono font-bold"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('branches.modal.typeLabel')} icon={Layers}>
                                <select
                                    value={draft.type}
                                    onChange={(e) => setDraftField('type', e.target.value)}
                                    className="input-field w-full font-semibold"
                                >
                                    {BRANCH_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>
                                            {t(type.labelKey, { defaultValue: type.defaultLabel })}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label={t('branches.modal.statusLabel')} icon={Activity}>
                                <select
                                    value={draft.status}
                                    onChange={(e) => setDraftField('status', e.target.value)}
                                    className="input-field w-full font-semibold"
                                >
                                    {BRANCH_STATUSES.map((status) => (
                                        <option key={status.value} value={status.value}>
                                            {t(status.labelKey, { defaultValue: status.defaultLabel })}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label={t('branches.modal.managerName')} hint={t('branches.modal.managerHint')} icon={Stethoscope}>
                                <input
                                    type="text"
                                    value={draft.managerName}
                                    onChange={(e) => setDraftField('managerName', e.target.value)}
                                    placeholder="Dr. Ahmed Mansour"
                                    className="input-field w-full"
                                />
                            </Field>

                            <div className="sm:col-span-2 mt-2 rounded-[var(--VIARA-radius-surface)] border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={draft.isMain === true}
                                        onChange={(e) => setDraftField('isMain', e.target.checked)}
                                        className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                    />
                                    <div>
                                        <p className="text-xs font-bold text-amber-950 dark:text-amber-200">
                                            {t('branches.modal.isMainLabel')}
                                        </p>
                                        <p className="text-[11px] text-amber-800/80 dark:text-amber-400">
                                            {t('branches.modal.isMainHint')}
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {modalTab === 'contact' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={t('fields.phone')} icon={Phone}>
                                <input
                                    type="tel"
                                    value={draft.phone}
                                    onChange={(e) => setDraftField('phone', e.target.value)}
                                    className="input-field w-full font-mono"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('fields.alternativePhone')} icon={Phone}>
                                <input
                                    type="tel"
                                    value={draft.alternativePhone}
                                    onChange={(e) => setDraftField('alternativePhone', e.target.value)}
                                    className="input-field w-full font-mono"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('fields.hotline')} icon={Phone}>
                                <input
                                    type="tel"
                                    value={draft.hotline}
                                    onChange={(e) => setDraftField('hotline', e.target.value)}
                                    className="input-field w-full font-mono"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('fields.whatsapp')} icon={Smartphone}>
                                <input
                                    type="tel"
                                    value={draft.whatsapp}
                                    onChange={(e) => setDraftField('whatsapp', e.target.value)}
                                    className="input-field w-full font-mono"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('fields.email')} icon={Mail} className="sm:col-span-2">
                                <input
                                    type="email"
                                    value={draft.email}
                                    onChange={(e) => setDraftField('email', e.target.value)}
                                    className="input-field w-full"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('fields.address')} icon={MapPin} className="sm:col-span-2">
                                <textarea
                                    value={draft.address}
                                    onChange={(e) => setDraftField('address', e.target.value)}
                                    rows={2}
                                    className="input-field w-full resize-y"
                                />
                            </Field>
                            <Field label={t('fields.addressAr')} icon={MapPin} className="sm:col-span-2">
                                <textarea
                                    value={draft.addressAr}
                                    onChange={(e) => setDraftField('addressAr', e.target.value)}
                                    rows={2}
                                    className="input-field w-full resize-y"
                                    dir="rtl"
                                />
                            </Field>
                            <Field label={t('fields.governorate')} icon={MapPin}>
                                <input
                                    type="text"
                                    value={draft.governorate}
                                    onChange={(e) => setDraftField('governorate', e.target.value)}
                                    className="input-field w-full"
                                />
                            </Field>
                            <Field label={t('fields.city')} icon={MapPin}>
                                <input
                                    type="text"
                                    value={draft.city}
                                    onChange={(e) => setDraftField('city', e.target.value)}
                                    className="input-field w-full"
                                />
                            </Field>
                            <Field label={t('fields.postalCode')} icon={Hash}>
                                <input
                                    type="text"
                                    value={draft.postalCode}
                                    onChange={(e) => setDraftField('postalCode', e.target.value)}
                                    className="input-field w-full font-mono"
                                    dir="ltr"
                                />
                            </Field>
                        </div>
                    )}

                    {modalTab === 'legal' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={t('fields.medicalLicense')} icon={Stamp}>
                                <input
                                    type="text"
                                    value={draft.medicalLicense}
                                    onChange={(e) => setDraftField('medicalLicense', e.target.value)}
                                    className="input-field w-full font-mono"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('fields.commercialRegistration')} icon={FileBadge2}>
                                <input
                                    type="text"
                                    value={draft.commercialRegistration}
                                    onChange={(e) => setDraftField('commercialRegistration', e.target.value)}
                                    className="input-field w-full font-mono"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('fields.taxNumber')} icon={Hash}>
                                <input
                                    type="text"
                                    value={draft.taxNumber}
                                    onChange={(e) => setDraftField('taxNumber', e.target.value)}
                                    className="input-field w-full font-mono"
                                    dir="ltr"
                                />
                            </Field>
                            <Field label={t('fields.invoicePrefix')} hint={t('fields.invoicePrefixHint')} icon={Receipt}>
                                <input
                                    type="text"
                                    value={draft.invoicePrefix}
                                    onChange={(e) => setDraftField('invoicePrefix', e.target.value.toUpperCase())}
                                    placeholder="e.g. MDI-INV-"
                                    className="input-field w-full font-mono font-bold"
                                    dir="ltr"
                                />
                            </Field>
                        </div>
                    )}

                    {modalTab === 'modalities' && (
                        <div className="space-y-5">
                            <div>
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {t('branches.modal.modalitiesTitle')}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {t('branches.modal.modalitiesHint')}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {AVAILABLE_MODALITIES.map((mod) => {
                                        const active = (draft.modalities || []).includes(mod);
                                        return (
                                            <button
                                                key={mod}
                                                type="button"
                                                onClick={() => toggleModality(mod)}
                                                className={`rounded-[var(--VIARA-radius-control)] px-3 py-1.5 text-xs font-bold transition shadow-xs ${active
                                                    ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                                                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                                                    }`}
                                            >
                                                {active ? <Check size={12} className="inline me-1" /> : null}
                                                {mod}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-950/40">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {t('branches.modal.hoursTitle')}
                                </p>
                                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(draft.workingHoursOverride)}
                                        onChange={(e) => {
                                            setDraftField(
                                                'workingHoursOverride',
                                                e.target.checked
                                                    ? { start: formDefaultHours?.start || 8, end: formDefaultHours?.end || 20, workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] }
                                                    : null
                                            );
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                                    />
                                    <span>{t('branches.modal.hoursOverride')}</span>
                                </label>

                                {draft.workingHoursOverride ? (
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <Field label={t('hours.open')}>
                                            <input
                                                type="number"
                                                min={0}
                                                max={24}
                                                value={draft.workingHoursOverride.start}
                                                onChange={(e) => setDraftField('workingHoursOverride', { ...draft.workingHoursOverride, start: Number(e.target.value) })}
                                                className="input-field w-full font-mono text-sm"
                                                dir="ltr"
                                            />
                                        </Field>
                                        <Field label={t('hours.close')}>
                                            <input
                                                type="number"
                                                min={0}
                                                max={24}
                                                value={draft.workingHoursOverride.end}
                                                onChange={(e) => setDraftField('workingHoursOverride', { ...draft.workingHoursOverride, end: Number(e.target.value) })}
                                                className="input-field w-full font-mono text-sm"
                                                dir="ltr"
                                            />
                                        </Field>
                                    </div>
                                ) : (
                                    <p className="mt-1.5 text-[11px] text-slate-400 italic">
                                        {t('branches.modal.inheritHours')}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {modalTab === 'documents' && (
                        <div className="space-y-4">
                            <Field label={t('branches.modal.reportHeaderOverride')} hint={t('branches.modal.reportHeaderHint')}>
                                <textarea
                                    value={draft.reportHeaderOverride}
                                    onChange={(e) => setDraftField('reportHeaderOverride', e.target.value)}
                                    rows={3}
                                    className="input-field w-full font-mono text-xs resize-y"
                                    placeholder="Optional: Branch specific header text or HTML markup"
                                />
                            </Field>
                            <Field label={t('branches.modal.reportFooterOverride')}>
                                <textarea
                                    value={draft.reportFooterOverride}
                                    onChange={(e) => setDraftField('reportFooterOverride', e.target.value)}
                                    rows={3}
                                    className="input-field w-full font-mono text-xs resize-y"
                                    placeholder="Optional: Branch specific footer text or HTML markup"
                                />
                            </Field>
                            <Field label={t('branches.modal.notesLabel')}>
                                <textarea
                                    value={draft.notes}
                                    onChange={(e) => setDraftField('notes', e.target.value)}
                                    rows={2}
                                    className="input-field w-full resize-y text-xs"
                                    placeholder="Internal operational notes for this branch..."
                                />
                            </Field>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 p-4 dark:border-slate-800 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                        {t('branches.modal.cancel', { defaultValue: 'Cancel' })}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSave(draft)}
                        className="rounded-[var(--VIARA-radius-control)] bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                    >
                        {t('branches.modal.saveBranch', { defaultValue: 'Save Branch' })}
                    </button>
                </div>
            </div>
        </div>
    );
};

const HeaderSignal = ({ icon: Icon, label }) => (
    <div className="flex items-center gap-2 rounded-[var(--VIARA-radius-control)] border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs font-bold text-slate-700 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
        <Icon size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span>{label}</span>
    </div>
);

const SettingsSection = ({ id, icon: Icon, title, description, children }) => (
    <section id={id} className="settings-section">
        <div className="settings-section-header">
            <span className="settings-section-icon">
                <Icon size={19} />
            </span>
            <div>
                <h2 className="text-base font-black text-[var(--VIARA-ink)] sm:text-lg">{title}</h2>
                <p className="mt-0.5 text-xs leading-5 text-[var(--VIARA-muted)]">{description}</p>
            </div>
        </div>
        <div className="settings-section-body">{children}</div>
    </section>
);

const Field = ({ label, hint, required, icon: Icon, counter, className = '', children }) => (
    <label className={`block ${className}`}>
        <span className="mb-1.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                {Icon ? <Icon size={13} className="text-slate-400" /> : null}
                {label}
                {required ? <span className="text-rose-500" aria-hidden="true">*</span> : null}
            </span>
            {counter ? <span className="font-mono text-[10px] font-semibold text-slate-400">{counter}</span> : null}
        </span>
        {children}
        {hint ? <span className="mt-1.5 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
);

const ToggleField = ({ label, checked, onChange, className = '' }) => (
    <label className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[var(--VIARA-radius-control)] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3.5 py-2.5 transition hover:bg-[var(--VIARA-surface-hover)] ${className}`}>
        <span className="flex items-center gap-2 text-xs font-bold text-[var(--VIARA-ink)]">
            <ToggleLeft size={16} className={checked ? 'text-[var(--VIARA-accent-text)]' : 'text-[var(--VIARA-muted)]'} />
            {label}
        </span>
        <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            className="ds-checkbox"
        />
    </label>
);

const LogoField = ({ t, field, label, hint, value, onChange, onUpload }) => {
    const [bgMode, setBgMode] = useState('light');
    return (
        <Field label={label} hint={hint} icon={Image}>
            <div className="rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800/80 dark:bg-slate-950/40">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('branding.previewMode')}</span>
                    <div className="flex rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
                        <button
                            type="button"
                            onClick={() => setBgMode('light')}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-[var(--VIARA-radius-control)] ${bgMode === 'light' ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-400'}`}
                        >
                            {t('branding.light')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setBgMode('dark')}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-[var(--VIARA-radius-control)] ${bgMode === 'dark' ? 'bg-slate-900 text-white dark:bg-slate-700' : 'text-slate-400'}`}
                        >
                            {t('branding.dark')}
                        </button>
                    </div>
                </div>

                <div className={`flex h-24 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 p-2 transition-colors ${bgMode === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                    {value ? (
                        <img src={value} alt={label} className="max-h-full max-w-full object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} onLoad={(event) => { event.currentTarget.style.display = 'block'; }} />
                    ) : (
                        <Image size={24} className="text-slate-300" aria-hidden="true" />
                    )}
                </div>

                <input type="text" value={value} onChange={(event) => onChange(field, event.target.value)} className="input-field mt-3 w-full font-mono text-xs" placeholder="/uploads/logo.png" dir="ltr" />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                        <Upload size={13} />
                        <span>{t('actions.upload')}</span>
                        <input type="file" accept={IMAGE_TYPES.join(',')} onChange={(event) => onUpload(field, event)} className="sr-only" />
                    </label>
                    {value ? (
                        <button type="button" onClick={() => onChange(field, '')} className="inline-flex h-8 items-center justify-center gap-1 rounded-[var(--VIARA-radius-control)] px-2.5 text-xs font-bold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400">
                            <X size={13} />
                            <span>{t('actions.remove')}</span>
                        </button>
                    ) : null}
                </div>
            </div>
        </Field>
    );
};

const ColorField = ({ label, value, onChange }) => (
    <Field label={label} icon={Palette}>
        <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
            <input
                type="color"
                value={normalizeColor(value)}
                onChange={(event) => onChange(event.target.value)}
                className="h-10 w-11 cursor-pointer rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                aria-label={label}
            />
            <input type="text" value={value} onChange={(event) => onChange(event.target.value)} className="input-field w-full font-mono text-xs font-bold uppercase" dir="ltr" />
        </div>
    </Field>
);

const IdentitySummary = ({ t, identity, form }) => {
    const copyIdentity = () => {
        const text = `${identity.centerName}\n${t('fields.address')}: ${identity.address || 'N/A'}\n${t('fields.phone')}: ${identity.phone || 'N/A'}\n${t('fields.taxId')}: ${identity.taxId || 'N/A'}\n${t('fields.medicalLicense')}: ${form.medical_license || 'N/A'}`;
        navigator.clipboard.writeText(text);
        toast.success(t('messages.identityCopied'));
    };

    return (
        <section className="rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-950">
                        {identity.logoUrl ? <img src={identity.logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <Building2 size={22} className="text-slate-300" />}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900 dark:text-white">{identity.centerName}</p>
                        <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{identity.branchName || t('summary.organizationDefault')}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={copyIdentity}
                    title={t('summary.copyDetails')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                    <Copy size={14} />
                </button>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-slate-600 dark:text-slate-300">
                <SummaryLine icon={MapPin} value={identity.address || t('summary.noAddress')} />
                <SummaryLine icon={Phone} value={identity.hotline || identity.phone || t('summary.noPhone')} />
                <SummaryLine icon={Mail} value={identity.email || t('summary.noEmail')} />
                <SummaryLine icon={Hash} value={identity.taxNumber || t('summary.noTaxNumber')} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2" aria-label={t('summary.brandColors')}>
                {[form.primary_color, form.secondary_color, form.accent_color].map((color, idx) => (
                    <span key={idx} className="h-6 rounded-[var(--VIARA-radius-control)] border border-slate-200 shadow-inner dark:border-slate-700" style={{ backgroundColor: normalizeColor(color) }} />
                ))}
            </div>
        </section>
    );
};

const SummaryLine = ({ icon: Icon, value }) => (
    <div className="flex items-center gap-2 min-w-0">
        <Icon size={13} className="shrink-0 text-slate-400" />
        <span className="min-w-0 truncate text-[11px] font-medium">{value}</span>
    </div>
);

const PreviewStack = ({
    t,
    identity,
    form,
    previewTab,
    setPreviewTab,
    selectedPreviewBranchId,
    setSelectedPreviewBranchId,
    onExpandModal
}) => {
    const tabs = [
        { id: 'all', label: t('previews.tabs.all') },
        { id: 'report', label: t('previews.tabs.report') },
        { id: 'invoice', label: t('previews.tabs.invoice') },
        { id: 'sticker', label: t('previews.tabs.sticker') },
        { id: 'portal', label: t('previews.tabs.portal') }
    ];

    return (
        <section id="previews" className="rounded-[var(--VIARA-radius-surface)] border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('previews.title')}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('previews.description')}</p>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onExpandModal}
                        title={t('previews.expand')}
                        className="flex h-7 w-7 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        <Maximize2 size={13} />
                    </button>
                    <Eye size={16} className="text-emerald-600 dark:text-emerald-400 ml-1" />
                </div>
            </div>

            {/* Branch Preview Context Switcher */}
            {Array.isArray(form.branches) && form.branches.length > 0 && (
                <div className="mt-3 rounded-[var(--VIARA-radius-control)] border border-slate-200/90 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-950/60">
                    <label className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                        <span>{t('branches.previews.contextLabel', { defaultValue: 'Branch Preview Context:' })}</span>
                    </label>
                    <select
                        value={selectedPreviewBranchId}
                        onChange={(e) => setSelectedPreviewBranchId(e.target.value)}
                        className="h-7 w-full rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                        <option value="master">{t('branches.previews.masterOrg', { defaultValue: 'Organization Master (Default)' })}</option>
                        {form.branches.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.displayName || b.name} {b.isMain ? '★ (HQ)' : ''} [{b.code}]
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="mt-3 flex items-center gap-1 overflow-x-auto rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setPreviewTab(tab.id)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-[var(--VIARA-radius-control)] transition-all ${previewTab === tab.id
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="mt-3 space-y-3">
                {(previewTab === 'all' || previewTab === 'report') && (
                    <DocumentPreview t={t} title={t('previews.medicalReport')} identity={identity} color={form.primary_color} detail={form.report_disclaimer || t('previews.inheritedDisclaimer')} />
                )}
                {(previewTab === 'all' || previewTab === 'invoice') && (
                    <DocumentPreview t={t} title={t('previews.billingInvoice')} identity={identity} color={form.secondary_color} detail={form.invoice_footer || form.print_settings?.invoiceTerms || t('previews.billingTerms')} />
                )}
                {(previewTab === 'all' || previewTab === 'invoice') && (
                    <DocumentPreview t={t} title={t('previews.receiptSlip')} identity={identity} color={form.accent_color} compact isReceipt detail={form.receipt_footer || form.print_settings?.receiptFooter || t('previews.receiptFooter')} />
                )}
                {(previewTab === 'all' || previewTab === 'sticker') && (
                    <StickerPreview t={t} identity={identity} />
                )}
                {(previewTab === 'all' || previewTab === 'portal') && (
                    <PortalPreview t={t} identity={identity} message={form.portal_welcome_message || form.homepage_settings?.heroTitle} color={form.primary_color} />
                )}
            </div>
        </section>
    );
};

const DocumentPreview = ({ t, title, identity, color, detail, compact = false, isReceipt = false }) => (
    <div className={`cs-preview-paper p-3 text-slate-800 dark:text-slate-100 ${isReceipt ? 'cs-receipt-zigzag font-mono' : ''}`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: normalizeColor(color) }} />
                    <p className="truncate text-[10px] font-black uppercase tracking-wider" style={{ color: normalizeColor(color) }}>{title}</p>
                </div>
                <p className="truncate text-xs font-black mt-0.5 text-slate-900 dark:text-white">{identity.centerName}</p>
                {identity.branchName ? <p className="truncate text-[10px] font-bold text-teal-600 dark:text-teal-400">{identity.branchName}</p> : null}
            </div>
            <div className="h-6 w-6 rounded-[var(--VIARA-radius-control)] shrink-0 border border-slate-200/80 shadow-xs flex items-center justify-center dark:border-slate-700" style={{ backgroundColor: normalizeColor(color) + '18' }}>
                <div className="h-2.5 w-2.5 rounded-[var(--VIARA-radius-control)]" style={{ backgroundColor: normalizeColor(color) }} />
            </div>
        </div>
        <div className={`${compact ? 'mt-2 space-y-1 text-[9px]' : 'mt-2.5 space-y-1.5 text-[10px]'} text-slate-500 dark:text-slate-400`}>
            <p className="truncate font-medium">{identity.address || t('previews.addressInherited')}</p>
            <p className="truncate font-mono">{identity.hotline || identity.phone || t('previews.phoneHotline')}</p>
            <p className="line-clamp-2 text-[9px] opacity-85 italic">{detail}</p>
        </div>
    </div>
);

const StickerPreview = ({ t, identity }) => (
    <div className="cs-preview-paper p-3">
        <div className="flex h-22 flex-col justify-between rounded-[var(--VIARA-radius-control)] border border-dashed border-teal-500/40 bg-teal-500/5 p-2.5 dark:border-teal-400/30 dark:bg-teal-950/20">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-[10px] font-black text-slate-900 dark:text-white">{identity.centerName}</p>
                    <p className="truncate text-[8px] font-bold text-teal-600 dark:text-teal-400">{identity.branchName || t('summary.branchIdentity')}</p>
                </div>
                <div className="h-6 w-6 rounded-[var(--VIARA-radius-control)] bg-slate-900 dark:bg-slate-100 flex items-center justify-center shrink-0">
                    <QrCode size={13} className="text-white dark:text-slate-900" />
                </div>
            </div>
            <div className="space-y-0.5 text-[9px] font-bold text-slate-700 dark:text-slate-200">
                <p className="text-[10px] font-black">{t('previews.samplePatient')}</p>
                <div className="flex items-center justify-between font-mono text-[8px] text-slate-500 dark:text-slate-400">
                    <span>MRN-00000 · CT SCAN</span>
                    <span className="font-bold text-teal-600 dark:text-teal-400">ACC-0000</span>
                </div>
            </div>
        </div>
    </div>
);

const PortalPreview = ({ t, identity, message, color }) => (
    <div className="cs-preview-paper p-3">
        <div className="rounded-[var(--VIARA-radius-control)] p-3 text-white shadow-md relative overflow-hidden" style={{ backgroundColor: normalizeColor(color) }}>
            <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-white/10 blur-xs pointer-events-none" />
            <p className="text-xs font-black relative z-10">{identity.centerName}</p>
            <p className="mt-1 line-clamp-2 text-[10px] opacity-90 relative z-10">{message || t('previews.portalWelcome')}</p>
        </div>
    </div>
);

const SettingsLoading = ({ label }) => (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12" aria-label={label}>
        <div className="h-44 animate-pulse rounded-[var(--VIARA-radius-overlay)] bg-slate-200 dark:bg-slate-800" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
                {[1, 2, 3].map((item) => (
                    <div key={item} className="h-64 animate-pulse rounded-[var(--VIARA-radius-surface)] bg-slate-100 dark:bg-slate-900" />
                ))}
            </div>
            <div className="h-96 animate-pulse rounded-[var(--VIARA-radius-surface)] bg-slate-100 dark:bg-slate-900" />
        </div>
    </div>
);

const SettingsError = ({ title, description, retry, onRetry }) => (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center rounded-[var(--VIARA-radius-overlay)] border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="rounded-[var(--VIARA-radius-control)] bg-rose-50 p-4 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertTriangle size={32} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-2 max-w-md text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex items-center gap-2 rounded-[var(--VIARA-radius-control)] bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        >
            <RefreshCw size={15} />
            {retry}
        </button>
    </div>
);

const calculateDuration = (start, end) => {
    const from = Number(start);
    const to = Number(end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
    if (to < from) {
        return Math.max(0, (24 - from) + to);
    }
    return Math.max(0, to - from);
};

const formatHour = (value) => `${String(Math.min(24, Math.max(0, Number(value) || 0))).padStart(2, '0')}:00`;
const normalizeColor = (value) => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#087F5B');

export default CenterSettings;
