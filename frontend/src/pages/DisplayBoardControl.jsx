import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    CheckCircle2,
    Eye,
    EyeOff,
    Info,
    Megaphone,
    MonitorPlay,
    Plus,
    Radio,
    Save,
    Settings2,
    Trash2,
    Pencil,
    ExternalLink,
    Loader2,
    Sparkles,
    Bell,
    Shield,
    LayoutGrid,
    Type,
    Hash,
    ToggleLeft,
    ToggleRight,
    ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetDisplayConfigQuery,
    useGetCenterSettingsQuery,
    useUpdateDisplayConfigMutation,
    useCreateDisplayAnnouncementMutation,
    useUpdateDisplayAnnouncementMutation,
    useDeleteDisplayAnnouncementMutation,
} from '../store/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { getErrorMessage } from '../utils/getErrorMessage';

// ── Constants ────────────────────────────────────────────────────────────────
const DISPLAY_MODES = [
    {
        value: 'name_and_order',
        icon: LayoutGrid,
        labelAr: 'الاسم ورقم الدور',
        labelEn: 'Name + Token',
        helpAr: 'يعرض الاسم الكامل ورقم الطلب معاً',
        helpEn: 'Shows full name alongside token number',
    },
    {
        value: 'name',
        icon: Type,
        labelAr: 'الاسم فقط',
        labelEn: 'Name Only',
        helpAr: 'يعرض اسم المريض بدون رقم',
        helpEn: 'Shows patient name without number',
    },
    {
        value: 'order_only',
        icon: Hash,
        labelAr: 'رقم الدور فقط',
        labelEn: 'Token Only',
        helpAr: 'أعلى مستوى من الخصوصية',
        helpEn: 'Maximum privacy mode',
    },
];

const TONES = ['info', 'success', 'warning', 'urgent'];

const TONE_CONFIG = {
    info: {
        icon: Info,
        labelAr: 'معلوماتي',
        labelEn: 'Info',
        colors: 'text-teal-400 bg-teal-500/10 border-teal-500/25',
        dot: 'bg-teal-400',
        badge: 'bg-teal-100 text-teal-800 ring-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800',
    },
    success: {
        icon: CheckCircle2,
        labelAr: 'إيجابي',
        labelEn: 'Success',
        colors: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
        dot: 'bg-emerald-400',
        badge: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
    },
    warning: {
        icon: AlertTriangle,
        labelAr: 'تنبيه',
        labelEn: 'Warning',
        colors: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
        dot: 'bg-amber-400',
        badge: 'bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
    },
    urgent: {
        icon: Megaphone,
        labelAr: 'عاجل',
        labelEn: 'Urgent',
        colors: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
        dot: 'bg-rose-400',
        badge: 'bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
    },
};

const emptyForm = { title: '', message: '', tone: 'info', displayOrder: 0 };

// ── Mini TV Preview ───────────────────────────────────────────────────────────
const MiniTvPreview = ({ boardTitle, displayMode, showTicker, isArabic }) => {
    const demoPatients = isArabic
        ? [
              { name: 'أحمد محمد علي', token: '#102' },
              { name: 'فاطمة يوسف', token: '#103' },
          ]
        : [
              { name: 'Ahmed Mohamed', token: '#102' },
              { name: 'Fatima Yusuf', token: '#103' },
          ];

    const getDisplay = (p) => {
        if (displayMode === 'order_only') return p.token;
        if (displayMode === 'name') return p.name;
        return `${p.name} — ${p.token}`;
    };

    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-[#060a10] shadow-xl ring-1 ring-white/5 select-none" dir={isArabic ? 'rtl' : 'ltr'}>
            {/* fake header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-md bg-white p-0.5 flex items-center justify-center shadow-xs shrink-0">
                        <img src="/center-logo.png" alt="" className="h-full w-full object-contain" />
                    </div>
                    <span className="text-[9px] font-black text-white truncate max-w-[100px]">
                        {boardTitle || (isArabic ? 'مركز طيبة للأشعة' : 'Tiba Scan Center')}
                    </span>
                </div>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-px text-[7px] font-black text-emerald-400">LIVE</span>
            </div>

            {/* fake content */}
            <div className="p-2.5 space-y-1.5">
                {demoPatients.map((p, i) => (
                    <div
                        key={i}
                        className={`rounded-lg border p-2 flex items-center justify-between gap-2 ${
                            i === 0
                                ? 'border-teal-500/30 bg-teal-500/10'
                                : 'border-slate-800 bg-slate-900/60'
                        }`}
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            {i === 0 && <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse shrink-0" />}
                            <span className="font-mono text-[10px] font-black text-white truncate">
                                {getDisplay(p)}
                            </span>
                        </div>
                        <span className={`text-[7.5px] font-black rounded-md px-1.5 py-0.5 shrink-0 ${
                            i === 0 ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-800 text-slate-400'
                        }`}>
                            {i === 0 ? (isArabic ? 'داخل الفحص' : 'In Exam') : (isArabic ? 'انتظار' : 'Waiting')}
                        </span>
                    </div>
                ))}
            </div>

            {/* fake ticker */}
            {showTicker && (
                <div className="border-t border-slate-800/60 bg-slate-950/90 px-2.5 py-1 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                        <Sparkles size={7} className="text-teal-400 shrink-0" />
                        <span className="text-[7.5px] text-slate-400 font-semibold whitespace-nowrap animate-pulse">
                            {isArabic ? 'يرجى التوجه فوراً إلى الغرفة المحددة...' : 'Please proceed immediately to your assigned room...'}
                        </span>
                    </div>
                </div>
            )}

            {/* TV frame overlay label */}
            <div className="absolute top-0 start-0 m-1">
                <span className="rounded-md bg-slate-800/80 px-1.5 py-px text-[7px] font-black text-slate-400 backdrop-blur">
                    {isArabic ? 'معاينة مباشرة' : 'Live Preview'}
                </span>
            </div>
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
const DisplayBoardControl = () => {
    const { t, i18n } = useTranslation('display');
    const isArabic = i18n.language?.startsWith('ar');

    const { data: configData, isLoading: isLoadingConfig, isError: isConfigError } = useGetDisplayConfigQuery();

    const [updateConfig, { isLoading: isSavingConfig }] = useUpdateDisplayConfigMutation();
    const [createAnnouncement, { isLoading: isCreating }] = useCreateDisplayAnnouncementMutation();
    const [updateAnnouncement, { isLoading: isUpdating }] = useUpdateDisplayAnnouncementMutation();
    const [deleteAnnouncement, { isLoading: isDeleting }] = useDeleteDisplayAnnouncementMutation();

    const [patientDisplayMode, setPatientDisplayMode] = useState('order_only');
    const [showTicker, setShowTicker] = useState(true);
    const [boardTitle, setBoardTitle] = useState('');
    const [configTouched, setConfigTouched] = useState(false);

    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [deleteTarget, setDeleteTarget] = useState(null);

    useEffect(() => {
        if (!configData?.config) return;
        setPatientDisplayMode(configData.config.patientDisplayMode);
        setShowTicker(configData.config.showTicker);
        setBoardTitle(configData.config.boardTitle || '');
        setConfigTouched(false);
    }, [configData]);

    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const centerLogo = rawCenterSettings?.logo_url || '/center-logo.png';
    const announcements = useMemo(() => configData?.announcements || [], [configData]);
    const activeCount = announcements.filter(a => a.isActive).length;
    const inactiveCount = announcements.filter(a => !a.isActive).length;

    const touchConfig = (setter) => (value) => { setter(value); setConfigTouched(true); };

    const handleSaveConfig = async () => {
        try {
            await updateConfig({ patientDisplayMode, showTicker, boardTitle: boardTitle.trim() || null }).unwrap();
            toast.success(t('control.settings.saved', { defaultValue: 'تم حفظ إعدادات الشاشة' }));
            setConfigTouched(false);
        } catch (error) {
            toast.error(getErrorMessage(error, t('control.settings.saveFailed', { defaultValue: 'تعذر حفظ الإعدادات' })));
        }
    };

    const openCreateForm = () => { setEditingId(null); setForm(emptyForm); setFormOpen(true); };

    const openEditForm = (announcement) => {
        setEditingId(announcement.id);
        setForm({ title: announcement.title, message: announcement.message, tone: announcement.tone, displayOrder: announcement.displayOrder });
        setFormOpen(true);
    };

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        const payload = { title: form.title.trim(), message: form.message.trim(), tone: form.tone, displayOrder: Number(form.displayOrder) || 0 };
        if (payload.title.length < 2 || payload.message.length < 2) {
            toast.error(t('control.form.invalid', { defaultValue: 'أكمل عنوان ونص الإعلان (حرفان على الأقل لكل منهما)' }));
            return;
        }
        try {
            if (editingId) {
                await updateAnnouncement({ id: editingId, ...payload }).unwrap();
                toast.success(t('control.announcements.updated', { defaultValue: 'تم تحديث الإعلان' }));
            } else {
                await createAnnouncement(payload).unwrap();
                toast.success(t('control.announcements.created', { defaultValue: 'تمت إضافة الإعلان' }));
            }
            setFormOpen(false);
        } catch (error) {
            toast.error(getErrorMessage(error, t('control.announcements.saveFailed', { defaultValue: 'تعذر حفظ الإعلان' })));
        }
    };

    const handleToggleActive = async (announcement) => {
        try {
            await updateAnnouncement({ id: announcement.id, isActive: !announcement.isActive }).unwrap();
            toast.success(announcement.isActive
                ? t('control.announcements.deactivated', { defaultValue: 'تم إخفاء الإعلان من الشاشة' })
                : t('control.announcements.activated', { defaultValue: 'تم تنشيط الإعلان على الشاشة' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('control.announcements.saveFailed', { defaultValue: 'تعذر تحديث الإعلان' })));
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return false;
        try {
            await deleteAnnouncement(deleteTarget.id).unwrap();
            toast.success(t('control.announcements.deleted', { defaultValue: 'تم حذف الإعلان' }));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('control.announcements.deleteFailed', { defaultValue: 'تعذر حذف الإعلان' })));
            return false;
        }
    };

    const isFormBusy = isCreating || isUpdating;

    return (
        <div className="mx-auto max-w-[1240px] space-y-5 pb-12">
            {/* ── PAGE HEADER ── */}
            <PageHeader
                logoUrl={centerLogo}
                icon={Settings2}
                eyebrowIcon={MonitorPlay}
                eyebrow={t('control.eyebrow', { defaultValue: 'وحدة تحكم شاشة الانتظار' })}
                title={t('control.title', { defaultValue: 'إدارة شاشة عرض الحالات' })}
                description={t('control.subtitle', { defaultValue: 'تحكم في ظهور أسماء المرضى وشريط النداء والإعلانات على شاشة الانتظار الخارجية.' })}
                actions={(
                    <div className="flex flex-wrap items-center gap-2">
                        <a
                            href="/display"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 text-xs font-black text-teal-700 shadow-sm transition hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/60"
                        >
                            <ExternalLink size={13} />
                            {t('control.openBoard', { defaultValue: 'فتح الشاشة المباشرة' })}
                            <ChevronRight size={11} className="opacity-50" />
                        </a>
                    </div>
                )}
                metrics={[
                    {
                        key: 'announcements',
                        label: t('control.metrics.announcements', { defaultValue: 'إعلانات نشطة' }),
                        value: activeCount,
                        icon: Megaphone,
                        tone: 'teal',
                        detail: t('control.metrics.announcementsDetail', { defaultValue: 'تظهر الآن على الشاشة' }),
                    },
                    {
                        key: 'hidden',
                        label: t('control.metrics.hidden', { defaultValue: 'موقوفة' }),
                        value: inactiveCount,
                        icon: EyeOff,
                        tone: 'slate',
                        detail: t('control.metrics.hiddenDetail', { defaultValue: 'محفوظة ولا تظهر' }),
                    },
                ]}
                metricsLabel={t('control.metricsLabel', { defaultValue: 'ملخص محتوى الشاشة' })}
            />

            {/* ── SETTINGS + LIVE PREVIEW ── */}
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                {/* Settings Card */}
                <section className="rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                    {/* Section header */}
                    <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                            <MonitorPlay size={17} />
                        </span>
                        <div>
                            <h2 className="text-sm font-black text-slate-900 dark:text-white">
                                {t('control.settings.title', { defaultValue: 'إعدادات الشاشة' })}
                            </h2>
                            <p className="text-xs font-medium text-slate-500">
                                {t('control.settings.description', { defaultValue: 'تُطبق الإعدادات على الشاشة الخارجية خلال ثوانٍ.' })}
                            </p>
                        </div>
                    </div>

                    {isLoadingConfig ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-slate-500">
                            <Loader2 size={16} className="animate-spin" />
                            {t('control.settings.loading', { defaultValue: 'جارٍ تحميل الإعدادات...' })}
                        </div>
                    ) : isConfigError ? (
                        <div className="m-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                            <AlertTriangle size={16} className="shrink-0" />
                            {t('control.settings.error', { defaultValue: 'تعذر تحميل الإعدادات. تأكد من تشغيل هجرة قاعدة البيانات 142.' })}
                        </div>
                    ) : (
                        <div className="space-y-6 p-6">
                            {/* Patient display mode selector */}
                            <div>
                                <div className="mb-3">
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                                        {t('control.settings.patientMode', { defaultValue: 'طريقة عرض بيانات المريض' })}
                                    </p>
                                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                                        {t('control.settings.patientModeHelp', { defaultValue: 'يؤثر على ما يراه المنتظرون على شاشة TV.' })}
                                    </p>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    {DISPLAY_MODES.map(({ value, icon: ModeIcon, labelAr, labelEn, helpAr, helpEn }) => {
                                        const active = patientDisplayMode === value;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => touchConfig(setPatientDisplayMode)(value)}
                                                aria-pressed={active}
                                                className={`relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                                                    active
                                                        ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/15 dark:border-teal-600 dark:bg-teal-950/40'
                                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                                                }`}
                                            >
                                                {active && (
                                                    <span className="absolute top-2.5 end-2.5 h-2 w-2 rounded-full bg-teal-500 ring-2 ring-teal-500/25" />
                                                )}
                                                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
                                                    active
                                                        ? 'border-teal-500/30 bg-teal-500/15 text-teal-600 dark:text-teal-300'
                                                        : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                                }`}>
                                                    <ModeIcon size={17} />
                                                </span>
                                                <span>
                                                    <span className="block text-sm font-black text-slate-900 dark:text-white">
                                                        {isArabic ? labelAr : labelEn}
                                                    </span>
                                                    <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-500">
                                                        {isArabic ? helpAr : helpEn}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-slate-100 dark:border-slate-800" />

                            {/* Ticker toggle + board title */}
                            <div className="grid gap-4 md:grid-cols-2">
                                {/* Ticker toggle */}
                                <div>
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-100 mb-2">
                                        {t('control.settings.showTicker', { defaultValue: 'شريط الأخبار السفلي' })}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => touchConfig(setShowTicker)(!showTicker)}
                                        aria-pressed={showTicker}
                                        className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 transition ${
                                            showTicker
                                                ? 'border-teal-500 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30'
                                                : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <span className={`grid h-8 w-8 place-items-center rounded-xl ${showTicker ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                                                <Radio size={15} />
                                            </span>
                                            <span>
                                                <span className="block text-xs font-black text-slate-900 dark:text-white">
                                                    {showTicker ? (isArabic ? 'مفعّل' : 'Enabled') : (isArabic ? 'موقوف' : 'Disabled')}
                                                </span>
                                                <span className="block text-[10.5px] font-medium text-slate-500">
                                                    {isArabic ? 'شريط متحرك أسفل الشاشة' : 'Moving ticker at bottom of screen'}
                                                </span>
                                            </span>
                                        </span>
                                        {showTicker
                                            ? <ToggleRight size={26} className="text-teal-500 shrink-0" />
                                            : <ToggleLeft size={26} className="text-slate-400 shrink-0" />
                                        }
                                    </button>
                                </div>

                                {/* Board title */}
                                <div>
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-100 mb-2">
                                        {t('control.settings.boardTitle', { defaultValue: 'عنوان الشاشة (اختياري)' })}
                                    </p>
                                    <Input
                                        placeholder={t('control.settings.boardTitlePlaceholder', { defaultValue: 'مثال: مركز فيارا — صالة الأشعة' })}
                                        value={boardTitle}
                                        onChange={(e) => touchConfig(setBoardTitle)(e.target.value)}
                                        maxLength={150}
                                        containerClassName="w-full"
                                    />
                                </div>
                            </div>

                            {/* Privacy notice */}
                            <div className="flex items-start gap-3 rounded-2xl border border-cyan-200/60 bg-cyan-50/60 px-4 py-3 dark:border-cyan-800/30 dark:bg-cyan-950/20">
                                <Shield size={14} className="text-cyan-500 mt-0.5 shrink-0" />
                                <p className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 leading-relaxed">
                                    {isArabic
                                        ? 'وضع «رقم الدور فقط» يمنع ظهور أي أسماء على الشاشة العامة، مما يضمن أقصى حماية لخصوصية المرضى.'
                                        : '"Token Only" mode prevents any patient names from appearing on the public screen, ensuring maximum privacy.'
                                    }
                                </p>
                            </div>

                            {/* Save button */}
                            <div className="flex items-center justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
                                <AnimatePresence>
                                    {configTouched && (
                                        <motion.span
                                            initial={{ opacity: 0, x: 10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="me-auto flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400"
                                        >
                                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            {isArabic ? 'يوجد تغييرات غير محفوظة' : 'Unsaved changes'}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                                <Button
                                    variant="primary"
                                    onClick={handleSaveConfig}
                                    disabled={isSavingConfig || !configTouched}
                                    loading={isSavingConfig}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <Save size={14} />
                                        {t('control.settings.save', { defaultValue: 'حفظ الإعدادات' })}
                                    </span>
                                </Button>
                            </div>
                        </div>
                    )}
                </section>

                {/* Live Preview Panel */}
                <div className="flex flex-col gap-4">
                    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/10 text-indigo-500">
                                <MonitorPlay size={14} />
                            </span>
                            <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                                {isArabic ? 'معاينة الشاشة' : 'Screen Preview'}
                            </p>
                        </div>
                        <MiniTvPreview
                            boardTitle={boardTitle}
                            displayMode={patientDisplayMode}
                            showTicker={showTicker}
                            isArabic={isArabic}
                        />
                        <p className="mt-3 text-center text-[10px] font-medium text-slate-400">
                            {isArabic ? 'تتحدث المعاينة فور تغيير الإعداد' : 'Preview updates instantly on change'}
                        </p>
                    </div>

                    {/* Quick stats card */}
                    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 space-y-3">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                            {isArabic ? 'الإعلانات' : 'Announcements'}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-3 dark:border-emerald-800/30 dark:bg-emerald-950/20 text-center">
                                <p className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">{activeCount}</p>
                                <p className="text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70">
                                    {isArabic ? 'نشطة' : 'Active'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/30 text-center">
                                <p className="font-mono text-2xl font-black text-slate-500 dark:text-slate-400">{inactiveCount}</p>
                                <p className="text-[10px] font-bold text-slate-400">
                                    {isArabic ? 'موقوفة' : 'Hidden'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── ANNOUNCEMENTS MANAGER ── */}
            <section className="rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <Megaphone size={17} />
                        </span>
                        <div>
                            <h2 className="text-sm font-black text-slate-900 dark:text-white">
                                {t('control.announcements.title', { defaultValue: 'إعلانات شاشة الانتظار' })}
                            </h2>
                            <p className="text-xs font-medium text-slate-500">
                                {t('control.announcements.description', { defaultValue: 'تتناوب الإعلانات النشطة على الشاشة كل 10 ثوانٍ.' })}
                            </p>
                        </div>
                    </div>
                    <Button variant="primary" size="sm" onClick={openCreateForm}>
                        <span className="inline-flex items-center gap-1.5">
                            <Plus size={13} />
                            {t('control.announcements.add', { defaultValue: 'إضافة إعلان' })}
                        </span>
                    </Button>
                </div>

                {/* Announcement list */}
                <div className="p-5 space-y-3">
                    {announcements.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
                            <Megaphone size={28} className="mx-auto mb-3 text-slate-400/60" />
                            <p className="text-sm font-bold text-slate-400">
                                {t('control.announcements.empty', { defaultValue: 'لا توجد إعلانات بعد' })}
                            </p>
                            <p className="mt-1 text-xs text-slate-400/70">
                                {isArabic ? 'أضف أول إعلان يظهر لمرضى الانتظار.' : 'Add your first announcement for waiting patients.'}
                            </p>
                            <button
                                type="button"
                                onClick={openCreateForm}
                                className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-teal-600 hover:underline dark:text-teal-400"
                            >
                                <Plus size={12} />
                                {isArabic ? 'إضافة إعلان' : 'Add Announcement'}
                            </button>
                        </div>
                    )}

                    <AnimatePresence initial={false}>
                        {announcements.map((announcement) => {
                            const tone = TONE_CONFIG[announcement.tone] || TONE_CONFIG.info;
                            const ToneIcon = tone.icon;
                            return (
                                <motion.article
                                    key={announcement.id}
                                    layout
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    transition={{ duration: 0.2 }}
                                    className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 transition ${
                                        announcement.isActive
                                            ? 'border-slate-200 bg-slate-50/60 dark:border-slate-700/60 dark:bg-slate-950/40'
                                            : 'border-slate-200/50 bg-slate-50/30 opacity-60 dark:border-slate-800 dark:bg-transparent'
                                    }`}
                                >
                                    <div className="flex min-w-0 flex-1 items-start gap-3">
                                        {/* Tone icon */}
                                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${tone.colors}`}>
                                            <ToneIcon size={16} />
                                        </span>

                                        {/* Content */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                    {announcement.title}
                                                </h3>
                                                <span className={`rounded-lg px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wide ring-1 ${tone.badge}`}>
                                                    {isArabic ? tone.labelAr : tone.labelEn}
                                                </span>
                                                {!announcement.isActive && (
                                                    <span className="rounded-lg bg-slate-200/80 px-2 py-0.5 text-[9.5px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                        {isArabic ? 'موقوف' : 'Hidden'}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="line-clamp-2 text-xs font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
                                                {announcement.message}
                                            </p>
                                            <p className="mt-1.5 text-[10px] font-bold text-slate-400">
                                                {isArabic ? 'الترتيب:' : 'Order:'} {announcement.displayOrder}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {/* Toggle active */}
                                        <button
                                            type="button"
                                            onClick={() => handleToggleActive(announcement)}
                                            title={announcement.isActive
                                                ? t('control.announcements.deactivate', { defaultValue: 'إيقاف العرض' })
                                                : t('control.announcements.activate', { defaultValue: 'تنشيط العرض' })}
                                            className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-black transition ${
                                                announcement.isActive
                                                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300'
                                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                                            }`}
                                        >
                                            {announcement.isActive
                                                ? <><EyeOff size={12} /><span className="hidden sm:inline">{isArabic ? 'إيقاف' : 'Hide'}</span></>
                                                : <><Eye size={12} /><span className="hidden sm:inline">{isArabic ? 'تنشيط' : 'Show'}</span></>
                                            }
                                        </button>

                                        {/* Edit */}
                                        <button
                                            type="button"
                                            onClick={() => openEditForm(announcement)}
                                            title={t('control.announcements.edit', { defaultValue: 'تعديل' })}
                                            className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
                                        >
                                            <Pencil size={13} />
                                        </button>

                                        {/* Delete */}
                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(announcement)}
                                            title={t('control.announcements.delete', { defaultValue: 'حذف' })}
                                            className="grid h-8 w-8 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </motion.article>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </section>

            {/* ── ANNOUNCEMENT FORM MODAL ── */}
            <Modal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                title={editingId
                    ? t('control.form.editTitle', { defaultValue: 'تعديل الإعلان' })
                    : t('control.form.addTitle', { defaultValue: 'إعلان جديد' })}
                size="md"
            >
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <Input
                        label={t('control.form.title', { defaultValue: 'عنوان الإعلان' })}
                        placeholder={t('control.form.titlePlaceholder', { defaultValue: 'مثال: تنبيه بأوقات الذروة' })}
                        value={form.title}
                        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                        maxLength={150}
                        required
                    />
                    <div>
                        <label className="ds-field-label mb-1.5 block text-sm font-semibold" htmlFor="announcement-message">
                            {t('control.form.message', { defaultValue: 'نص الإعلان' })}
                        </label>
                        <textarea
                            id="announcement-message"
                            value={form.message}
                            onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                            maxLength={1000}
                            rows={3}
                            required
                            placeholder={t('control.form.messagePlaceholder', { defaultValue: 'اكتب النص الذي سيظهر لمرضى الانتظار...' })}
                            className="ds-field w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-teal-600"
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {/* Tone picker — custom visual */}
                        <div>
                            <label className="ds-field-label mb-1.5 block text-sm font-semibold">
                                {t('control.form.tone', { defaultValue: 'نمط الإعلان' })}
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {TONES.map(tone => {
                                    const cfg = TONE_CONFIG[tone];
                                    const TIcon = cfg.icon;
                                    return (
                                        <button
                                            key={tone}
                                            type="button"
                                            onClick={() => setForm(p => ({ ...p, tone }))}
                                            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-black transition ${
                                                form.tone === tone
                                                    ? `${cfg.colors} ring-2 ring-offset-1 ring-offset-transparent`
                                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                                            }`}
                                        >
                                            <TIcon size={12} />
                                            {isArabic ? cfg.labelAr : cfg.labelEn}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <Input
                            label={t('control.form.order', { defaultValue: 'ترتيب العرض' })}
                            type="number"
                            min={0}
                            max={999}
                            value={form.displayOrder}
                            onChange={(e) => setForm((prev) => ({ ...prev, displayOrder: e.target.value }))}
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <Button variant="ghost" onClick={() => setFormOpen(false)} type="button">
                            {t('control.form.cancel', { defaultValue: 'إلغاء' })}
                        </Button>
                        <Button variant="primary" type="submit" loading={isFormBusy}>
                            {editingId
                                ? t('control.form.update', { defaultValue: 'حفظ التعديلات' })
                                : t('control.form.create', { defaultValue: 'إضافة الإعلان' })}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* ── DELETE CONFIRMATION ── */}
            <ConfirmDialog
                isOpen={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title={t('control.announcements.deleteTitle', { defaultValue: 'حذف الإعلان' })}
                message={t('control.announcements.deleteMessage', {
                    title: deleteTarget?.title || '',
                    defaultValue: 'سيتم حذف إعلان «{{title}}» نهائياً من شاشة الانتظار.',
                })}
                confirmLabel={t('control.announcements.deleteConfirm', { defaultValue: 'حذف نهائي' })}
                cancelLabel={t('control.form.cancel', { defaultValue: 'إلغاء' })}
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
};

export default DisplayBoardControl;
