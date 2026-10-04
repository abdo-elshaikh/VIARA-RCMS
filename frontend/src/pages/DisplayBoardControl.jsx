/**
 * DisplayBoardControl.jsx
 * VIARA — Waiting-room display management
 *
 * Staff console for the external calling board (/display):
 *  • Patient identity mode + voice call mode (privacy-first by default)
 *  • Now-serving ticker and custom board title
 *  • Live mini-preview mirroring the board with your unsaved changes
 *  • Announcements CRUD (title, message, tone, rotation order, active flag)
 * All writes go through the display endpoints; the board picks them up via
 * its 6s poll + SSE within seconds.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    CheckCircle2,
    Eye,
    EyeOff,
    ExternalLink,
    Hash,
    Info,
    LayoutGrid,
    Loader2,
    Megaphone,
    MonitorPlay,
    Pencil,
    Plus,
    Radio,
    Save,
    Settings2,
    Shield,
    Trash2,
    Type,
    Volume2,
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
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { getErrorMessage } from '../utils/getErrorMessage';
import { announcePatientCall } from '../utils/speechAnnouncement';

/* ─── Constants ───────────────────────────────────────────────── */
const PATIENT_MODES = [
    { value: 'name_and_order', icon: LayoutGrid, labelAr: 'الاسم ورقم الدور', labelEn: 'Name + Token', helpAr: 'يعرض الاسم الكامل ورقم الطلب معاً', helpEn: 'Shows full name alongside the token number' },
    { value: 'name', icon: Type, labelAr: 'الاسم فقط', labelEn: 'Name Only', helpAr: 'يعرض اسم المريض بدون رقم', helpEn: 'Shows the patient name without a number' },
    { value: 'order_only', icon: Hash, labelAr: 'رقم الدور فقط', labelEn: 'Token Only', helpAr: 'أعلى مستوى من الخصوصية', helpEn: 'Maximum privacy mode' },
];

const CALL_MODES = [
    { value: 'token_only', icon: Hash, labelAr: 'رقم الدور فقط', labelEn: 'Token only', helpAr: 'مثال: صاحب الدور رقم 102', helpEn: 'Example: ticket number 102' },
    { value: 'name_only', icon: Type, labelAr: 'الاسم الكامل فقط', labelEn: 'Full name only', helpAr: 'ينادي السيد أو السيدة بالاسم الكامل', helpEn: 'Calls the patient by full name' },
    { value: 'token_and_name', icon: LayoutGrid, labelAr: 'الدور والاسم الكامل', labelEn: 'Token + full name', helpAr: 'ينادي رقم الدور ثم الاسم الكامل', helpEn: 'Calls the token, then the full name' },
];

const TONES = ['info', 'success', 'warning', 'urgent'];

const TONE_CONFIG = {
    info: { icon: Info, labelAr: 'معلوماتي', labelEn: 'Info', chip: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300', badge: 'bg-teal-100 text-teal-800 ring-teal-300/60 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-700/50' },
    success: { icon: CheckCircle2, labelAr: 'إيجابي', labelEn: 'Success', chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-800 ring-emerald-300/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-700/50' },
    warning: { icon: AlertTriangle, labelAr: 'تنبيه', labelEn: 'Warning', chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300', badge: 'bg-amber-100 text-amber-800 ring-amber-300/60 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-700/50' },
    urgent: { icon: Megaphone, labelAr: 'عاجل', labelEn: 'Urgent', chip: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300', badge: 'bg-rose-100 text-rose-800 ring-rose-300/60 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-700/50' },
};

const PREVIEW_TOKEN = '102';
const PREVIEW_NAME_AR = 'أحمد محمد علي';
const PREVIEW_NAME_EN = 'Ahmed Mohamed Ali';

const emptyForm = { title: '', message: '', tone: 'info', displayOrder: 0 };

/* ─── Building blocks ─────────────────────────────────────────── */
const SectionCard = ({ icon: Icon, title, help, actions, children, className = '' }) => (
    <section className={`rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/60 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    <Icon size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-sm font-black text-slate-900 dark:text-white">{title}</h2>
                    {help && <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{help}</p>}
                </div>
            </div>
            {actions}
        </div>
        {children}
    </section>
);

const OptionCard = ({ active, disabled, icon: Icon, title, help, accent = 'teal', onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        className={`relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 ${
            active
                ? accent === 'amber'
                    ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/15 dark:border-amber-600 dark:bg-amber-950/30'
                    : 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/15 dark:border-teal-600 dark:bg-teal-950/40'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800/60'
        } ${accent === 'amber' ? 'focus-visible:ring-amber-500' : 'focus-visible:ring-teal-500'} ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
    >
        {active && (
            <span
                className={`absolute top-2.5 end-2.5 h-2 w-2 rounded-full ring-2 ${
                    accent === 'amber' ? 'bg-amber-500 ring-amber-500/25' : 'bg-teal-500 ring-teal-500/25'
                }`}
                aria-hidden="true"
            />
        )}
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
            active
                ? accent === 'amber'
                    ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'border-teal-500/30 bg-teal-500/15 text-teal-600 dark:text-teal-300'
                : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
        }`}>
            <Icon size={17} aria-hidden="true" />
        </span>
        <span>
            <span className="block text-sm font-black text-slate-900 dark:text-white">{title}</span>
            {help && <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-500 dark:text-slate-400">{help}</span>}
        </span>
        {children}
    </button>
);

/* ─── Mini TV preview ─────────────────────────────────────────── */
const MiniTvPreview = ({ boardTitle, displayMode, callAnnouncementMode, showTicker, isArabic }) => {
    const fullName = isArabic ? PREVIEW_NAME_AR : PREVIEW_NAME_EN;
    const patient = displayMode === 'order_only'
        ? `#${PREVIEW_TOKEN}`
        : displayMode === 'name'
            ? fullName
            : `#${PREVIEW_TOKEN} · ${fullName}`;
    const voicePreview = callAnnouncementMode === 'name_only'
        ? fullName
        : callAnnouncementMode === 'token_and_name'
            ? `#${PREVIEW_TOKEN} · ${fullName}`
            : `#${PREVIEW_TOKEN}`;

    return (
        <div
            dir={isArabic ? 'rtl' : 'ltr'}
            className="overflow-hidden rounded-2xl border border-teal-900/15 shadow-lg"
        >
            <div className="bg-[linear-gradient(150deg,#071a17_0%,#042f2b_55%,#053b34_100%)] p-3.5 text-teal-50">
                <div className="flex items-center justify-between gap-2 pb-2.5 text-[10px] font-semibold text-teal-200/80">
                    <strong className="truncate text-teal-50">{boardTitle || 'VIARA'}</strong>
                    <span className="shrink-0">{isArabic ? 'معاينة توضيحية' : 'Illustrative preview'}</span>
                </div>

                <div className="rounded-xl bg-[linear-gradient(135deg,#0a8070,#14b89c)] px-3.5 py-4 text-white shadow-inner">
                    <small className="opacity-85">{isArabic ? 'يتم النداء الآن' : 'Now calling'}</small>
                    <motion.div
                        key={patient}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="my-1.5 truncate font-['Barlow_Condensed',sans-serif] text-2xl font-extrabold"
                    >
                        {patient}
                    </motion.div>
                    <small className="opacity-85">{isArabic ? 'توجه إلى غرفة 12' : 'Proceed to room 12'}</small>
                    <div className="mt-2 truncate font-['Barlow_Condensed',sans-serif] text-[9px] text-teal-100/90">
                        {isArabic ? 'الصوت:' : 'Voice:'} {voicePreview}
                    </div>
                </div>

                <div className="mt-2 rounded-lg bg-white/95 px-3 py-2.5 text-[10px] font-medium text-slate-700">
                    {isArabic ? 'غرف الفحص · داخل الفحص / التالي' : 'Examination rooms · Current / Next'}
                </div>

                <div className="mt-2 flex items-center justify-between rounded-lg bg-white/95 px-3 py-2 text-[10px] text-slate-600">
                    <span>{isArabic ? 'إعلانات المركز والتعليمات' : 'Notices & guidance'}</span>
                    <span className="tracking-[0.2em] text-teal-600">VIARA</span>
                </div>

                {showTicker && (
                    <p className="mt-2 truncate text-[9px] text-teal-200/80">
                        {isArabic ? 'يرجى متابعة رقم الدور وانتظار النداء' : 'Please follow your ticket and wait for your call'}
                    </p>
                )}
            </div>
        </div>
    );
};

/* ─── Main component ──────────────────────────────────────────── */
const DisplayBoardControl = () => {
    const { t, i18n } = useTranslation('display');
    const isArabic = i18n.language?.startsWith('ar');

    const { data: configData, isLoading: isLoadingConfig, isError: isConfigError } = useGetDisplayConfigQuery();

    const [updateConfig, { isLoading: isSavingConfig }] = useUpdateDisplayConfigMutation();
    const [createAnnouncement, { isLoading: isCreating }] = useCreateDisplayAnnouncementMutation();
    const [updateAnnouncement, { isLoading: isUpdating }] = useUpdateDisplayAnnouncementMutation();
    const [deleteAnnouncement, { isLoading: isDeleting }] = useDeleteDisplayAnnouncementMutation();

    /* Config draft */
    const [patientDisplayMode, setPatientDisplayMode] = useState('order_only');
    const [callAnnouncementMode, setCallAnnouncementMode] = useState('token_only');
    const [showTicker, setShowTicker] = useState(true);
    const [boardTitle, setBoardTitle] = useState('');
    const [configTouched, setConfigTouched] = useState(false);
    const appliedConfigRef = useRef(null);

    /* Announcement editor */
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [deleteTarget, setDeleteTarget] = useState(null);

    useEffect(() => {
        if (!configData?.config || configTouched) return;
        const snapshot = JSON.stringify(configData.config);
        if (appliedConfigRef.current === snapshot) return;
        setPatientDisplayMode(configData.config.patientDisplayMode || 'order_only');
        setCallAnnouncementMode(configData.config.callAnnouncementMode || 'token_only');
        setShowTicker(configData.config.showTicker !== false);
        setBoardTitle(configData.config.boardTitle || '');
        appliedConfigRef.current = snapshot;
    }, [configData, configTouched]);

    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const centerLogo = rawCenterSettings?.logo_url || '/center-logo.png';
    const announcements = useMemo(() => configData?.announcements || [], [configData]);
    const activeCount = announcements.filter((a) => a.isActive).length;
    const inactiveCount = announcements.length - activeCount;

    const namesHidden = patientDisplayMode === 'order_only';

    const touchConfig = (setter) => (value) => {
        setter(value);
        setConfigTouched(true);
    };

    const handlePatientDisplayModeChange = (value) => {
        setPatientDisplayMode(value);
        // Token-only display can never announce names — force the voice mode
        // down to tokens so the two controls can never contradict each other.
        if (value === 'order_only') setCallAnnouncementMode('token_only');
        setConfigTouched(true);
    };

    const handleSaveConfig = async () => {
        try {
            await updateConfig({
                patientDisplayMode,
                callAnnouncementMode,
                showTicker,
                boardTitle: boardTitle.trim() || null,
            }).unwrap();
            toast.success(t('control.settings.saved', { defaultValue: 'تم حفظ إعدادات الشاشة' }));
            setConfigTouched(false);
        } catch (error) {
            toast.error(getErrorMessage(error, t('control.settings.saveFailed', { defaultValue: 'تعذر حفظ الإعدادات' })));
        }
    };

    const openCreateForm = () => {
        setEditingId(null);
        setForm(emptyForm);
        setFormOpen(true);
    };

    const openEditForm = (announcement) => {
        setEditingId(announcement.id);
        setForm({
            title: announcement.title,
            message: announcement.message,
            tone: announcement.tone,
            displayOrder: announcement.displayOrder,
        });
        setFormOpen(true);
    };

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        const payload = {
            title: form.title.trim(),
            message: form.message.trim(),
            tone: form.tone,
            displayOrder: Number(form.displayOrder) || 0,
        };
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

    const previewVoice = () => announcePatientCall({
        tokenNumber: PREVIEW_TOKEN,
        patientName: isArabic ? PREVIEW_NAME_AR : PREVIEW_NAME_EN,
        roomName: isArabic ? 'جناح الأشعة رقم 3' : 'Radiology Suite 3',
        announcementMode: namesHidden ? 'token_only' : callAnnouncementMode,
        isArabic,
        gender: 'male',
        withChime: true,
        repeatCount: 1,
    });

    const isFormBusy = isCreating || isUpdating;

    return (
        <div className="mx-auto max-w-[1240px] space-y-5 pb-12">
            <PageHeader
                logoUrl={centerLogo}
                icon={Settings2}
                eyebrowIcon={MonitorPlay}
                eyebrow={t('control.eyebrow', { defaultValue: 'وحدة تحكم شاشة الانتظار' })}
                title={t('control.title', { defaultValue: 'إدارة شاشة عرض الحالات' })}
                description={t('control.subtitle', { defaultValue: 'تحكم في ظهور أسماء المرضى وشريط النداء والإعلانات على شاشة الانتظار الخارجية.' })}
                actions={(
                    <a
                        href="/display"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 text-xs font-black text-teal-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/60"
                    >
                        <ExternalLink size={13} aria-hidden="true" />
                        {t('control.openBoard', { defaultValue: 'فتح الشاشة المباشرة' })}
                    </a>
                )}
                metrics={[
                    { key: 'announcements', label: t('control.metrics.announcements', { defaultValue: 'إعلانات نشطة' }), value: activeCount, icon: Megaphone, tone: 'teal', detail: t('control.metrics.announcementsDetail', { defaultValue: 'تظهر الآن على الشاشة' }) },
                    { key: 'hidden', label: t('control.metrics.hidden', { defaultValue: 'موقوفة' }), value: inactiveCount, icon: EyeOff, tone: 'slate', detail: t('control.metrics.hiddenDetail', { defaultValue: 'محفوظة ولا تظهر' }) },
                ]}
                metricsLabel={t('control.metricsLabel', { defaultValue: 'ملخص محتوى الشاشة' })}
            />

            {/* ── Settings + live preview ── */}
            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
                <SectionCard
                    icon={MonitorPlay}
                    title={t('control.settings.title', { defaultValue: 'إعدادات الشاشة' })}
                    help={t('control.settings.description', { defaultValue: 'تُطبق الإعدادات على الشاشة الخارجية خلال ثوانٍ.' })}
                >
                    {isLoadingConfig ? (
                        <div className="flex items-center justify-center gap-2 py-14 text-sm font-bold text-slate-500">
                            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                            {t('control.settings.loading', { defaultValue: 'جارٍ تحميل الإعدادات...' })}
                        </div>
                    ) : isConfigError ? (
                        <div className="m-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
                            {t('control.settings.error', { defaultValue: 'تعذر تحميل الإعدادات. تأكد من تشغيل هجرة قاعدة البيانات 142.' })}
                        </div>
                    ) : (
                        <div className="space-y-6 p-6">
                            {/* Patient identity */}
                            <div>
                                <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                                    {t('control.settings.patientMode', { defaultValue: 'طريقة عرض بيانات المريض' })}
                                </p>
                                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {t('control.settings.patientModeHelp', { defaultValue: 'يؤثر على ما يراه المنتظرون على شاشة TV.' })}
                                </p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                    {PATIENT_MODES.map(({ value, icon, labelAr, labelEn, helpAr, helpEn }) => (
                                        <OptionCard
                                            key={value}
                                            active={patientDisplayMode === value}
                                            disabled={isSavingConfig}
                                            icon={icon}
                                            title={t(`control.settings.mode.${value}`, { defaultValue: isArabic ? labelAr : labelEn })}
                                            help={t(`control.settings.mode.${value}Help`, { defaultValue: isArabic ? helpAr : helpEn })}
                                            onClick={() => handlePatientDisplayModeChange(value)}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="border-t border-slate-100 dark:border-slate-800" />

                            {/* Voice call mode */}
                            <div>
                                <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                                    {t('control.settings.voiceMode', { defaultValue: 'طريقة النداء الصوتي' })}
                                </p>
                                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {t('control.settings.voiceModeHelp', { defaultValue: 'اختر ما يُنطق في النداء الأول وتكراره.' })}
                                </p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                    {CALL_MODES.map(({ value, icon, labelAr, labelEn, helpAr, helpEn }) => (
                                        <OptionCard
                                            key={value}
                                            accent="amber"
                                            active={callAnnouncementMode === value}
                                            disabled={(value !== 'token_only' && namesHidden) || isSavingConfig}
                                            icon={icon}
                                            title={t(`control.settings.callMode.${value}`, { defaultValue: isArabic ? labelAr : labelEn })}
                                            help={t(`control.settings.callMode.${value}Help`, { defaultValue: isArabic ? helpAr : helpEn })}
                                            onClick={() => touchConfig(setCallAnnouncementMode)(value)}
                                        />
                                    ))}
                                </div>

                                <AnimatePresence>
                                    {namesHidden && (
                                        <motion.p
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="flex items-center gap-1.5 overflow-hidden text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                                        >
                                            <Shield size={13} aria-hidden="true" />
                                            {t('control.settings.nameRequired', { defaultValue: 'فعّل عرض الأسماء أولاً لاستخدام النداء بالاسم.' })}
                                        </motion.p>
                                    )}
                                </AnimatePresence>

                                <button
                                    type="button"
                                    onClick={previewVoice}
                                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-black text-amber-800 transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50"
                                >
                                    <Volume2 size={15} aria-hidden="true" />
                                    {t('control.settings.previewAnnouncement', { defaultValue: 'استمع لهذا النداء' })}
                                </button>
                            </div>

                            <div className="border-t border-slate-100 dark:border-slate-800" />

                            {/* Ticker + board title */}
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <p className="mb-2 text-sm font-black text-slate-800 dark:text-slate-100">
                                        {t('control.settings.showTicker', { defaultValue: 'شريط الأخبار السفلي' })}
                                    </p>
                                    <button
                                        type="button"
                                        disabled={isSavingConfig}
                                        onClick={() => touchConfig(setShowTicker)(!showTicker)}
                                        aria-pressed={showTicker}
                                        className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 transition ${
                                            showTicker
                                                ? 'border-teal-500 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30'
                                                : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <span className={`grid h-8 w-8 place-items-center rounded-xl ${showTicker ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                <Radio size={15} aria-hidden="true" />
                                            </span>
                                            <span>
                                                <span className="block text-xs font-black text-slate-900 dark:text-white">
                                                    {showTicker ? t('control.settings.enabled', { defaultValue: 'مفعل' }) : t('control.settings.disabled', { defaultValue: 'متوقف' })}
                                                </span>
                                                <span className="block text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
                                                    {t('control.settings.showTickerHelp', { defaultValue: 'شريط متحرك بإعلانات وإرشادات المركز.' })}
                                                </span>
                                            </span>
                                        </span>
                                        <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${showTicker ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-700'}`} aria-hidden="true">
                                            <motion.span
                                                layout
                                                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                                                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
                                                style={{ insetInlineStart: showTicker ? '22px' : '2px' }}
                                            />
                                        </span>
                                    </button>
                                </div>

                                <div>
                                    <p className="mb-2 text-sm font-black text-slate-800 dark:text-slate-100">
                                        {t('control.settings.boardTitle', { defaultValue: 'عنوان الشاشة (اختياري)' })}
                                    </p>
                                    <Input
                                        placeholder={t('control.settings.boardTitlePlaceholder', { defaultValue: 'مثال: مركز فيارا — صالة الأشعة' })}
                                        value={boardTitle}
                                        disabled={isSavingConfig}
                                        onChange={(e) => touchConfig(setBoardTitle)(e.target.value)}
                                        maxLength={150}
                                        containerClassName="w-full"
                                    />
                                </div>
                            </div>

                            {/* Privacy notice */}
                            <div className="flex items-start gap-3 rounded-2xl border border-cyan-200/60 bg-cyan-50/60 px-4 py-3 dark:border-cyan-800/30 dark:bg-cyan-950/20">
                                <Shield size={14} className="mt-0.5 shrink-0 text-cyan-500" aria-hidden="true" />
                                <p className="text-[11px] font-semibold leading-relaxed text-cyan-700 dark:text-cyan-300">
                                    {t('control.settings.privacyNotice', { defaultValue: 'وضع رقم الدور فقط يمنع ظهور أسماء المرضى على الشاشة نهائيًا، حتى لو فعل الطاقم النداء بالأسماء.' })}
                                </p>
                            </div>

                            {/* Save */}
                            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <AnimatePresence>
                                    {configTouched && (
                                        <motion.span
                                            initial={{ opacity: 0, x: isArabic ? 10 : -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: isArabic ? 10 : -10 }}
                                            className="me-auto flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400"
                                        >
                                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
                                            {t('control.settings.unsaved', { defaultValue: 'تغييرات غير محفوظة' })}
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
                                        <Save size={14} aria-hidden="true" />
                                        {t('control.settings.save', { defaultValue: 'حفظ الإعدادات' })}
                                    </span>
                                </Button>
                            </div>
                        </div>
                    )}
                </SectionCard>

                {/* Live preview column */}
                <div className="flex flex-col gap-4">
                    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="mb-4 flex items-center gap-2">
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/10 text-indigo-500">
                                <MonitorPlay size={14} aria-hidden="true" />
                            </span>
                            <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                                {t('control.settings.previewTitle', { defaultValue: 'معاينة الشاشة' })}
                            </p>
                        </div>
                        <MiniTvPreview
                            boardTitle={boardTitle}
                            displayMode={patientDisplayMode}
                            callAnnouncementMode={callAnnouncementMode}
                            showTicker={showTicker}
                            isArabic={isArabic}
                        />
                        <p className="mt-3 text-center text-[10px] font-medium text-slate-400">
                            {t('control.settings.previewHelp', { defaultValue: 'تتحدث المعاينة مع كل تغيير قبل الحفظ' })}
                        </p>
                    </div>

                    <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                            {isArabic ? 'الإعلانات' : 'Announcements'}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-3 text-center dark:border-emerald-800/30 dark:bg-emerald-950/20">
                                <p className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">{activeCount}</p>
                                <p className="text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70">
                                    {isArabic ? 'نشطة' : 'Active'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3 text-center dark:border-slate-700 dark:bg-slate-800/30">
                                <p className="font-mono text-2xl font-black text-slate-500 dark:text-slate-400">{inactiveCount}</p>
                                <p className="text-[10px] font-bold text-slate-400">
                                    {isArabic ? 'موقوفة' : 'Paused'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Announcements manager ── */}
            <SectionCard
                icon={Megaphone}
                title={t('control.announcements.title', { defaultValue: 'إعلانات شاشة الانتظار' })}
                help={t('control.announcements.description', { defaultValue: 'تتناوب الإعلانات النشطة على الشاشة كل 10 ثوانٍ.' })}
                actions={(
                    <Button variant="primary" size="sm" onClick={openCreateForm}>
                        <span className="inline-flex items-center gap-1.5">
                            <Plus size={13} aria-hidden="true" />
                            {t('control.announcements.add', { defaultValue: 'إضافة إعلان' })}
                        </span>
                    </Button>
                )}
            >
                <div className="space-y-3 p-5">
                {announcements.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
                        <Megaphone size={28} className="mx-auto mb-3 text-slate-400/60" aria-hidden="true" />
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
                            <Plus size={12} aria-hidden="true" />
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
                                className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 transition hover:shadow-sm ${
                                    announcement.isActive
                                        ? 'border-slate-200 bg-slate-50/60 dark:border-slate-700/60 dark:bg-slate-950/40'
                                        : 'border-slate-200/50 bg-slate-50/30 opacity-60 dark:border-slate-800 dark:bg-transparent'
                                }`}
                            >
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${tone.chip}`}>
                                        <ToneIcon size={16} aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                {announcement.title}
                                            </h3>
                                            <span className={`rounded-lg px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wide ring-1 ${tone.badge}`}>
                                                {isArabic ? tone.labelAr : tone.labelEn}
                                            </span>
                                            {!announcement.isActive && (
                                                <span className="rounded-lg bg-slate-200/80 px-2 py-0.5 text-[9.5px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                    {isArabic ? 'موقوف' : 'Paused'}
                                                </span>
                                            )}
                                        </div>
                                        <p className="line-clamp-2 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                                            {announcement.message}
                                        </p>
                                        <p className="mt-1.5 text-[10px] font-bold text-slate-400">
                                            {isArabic ? 'الترتيب:' : 'Order:'} {announcement.displayOrder}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => handleToggleActive(announcement)}
                                        disabled={isUpdating}
                                        title={announcement.isActive
                                            ? t('control.announcements.deactivate', { defaultValue: 'إيقاف العرض' })
                                            : t('control.announcements.activate', { defaultValue: 'تنشيط العرض' })}
                                        className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-black transition hover:-translate-y-0.5 disabled:opacity-50 ${
                                            announcement.isActive
                                                ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300'
                                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                                        }`}
                                    >
                                        {announcement.isActive
                                            ? <><EyeOff size={12} aria-hidden="true" /><span className="hidden sm:inline">{isArabic ? 'إيقاف' : 'Pause'}</span></>
                                            : <><Eye size={12} aria-hidden="true" /><span className="hidden sm:inline">{isArabic ? 'تنشيط' : 'Show'}</span></>}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => openEditForm(announcement)}
                                        disabled={isFormBusy}
                                        title={t('control.announcements.edit', { defaultValue: 'تعديل' })}
                                        aria-label={t('control.announcements.edit', { defaultValue: 'تعديل' })}
                                        className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
                                    >
                                        <Pencil size={13} aria-hidden="true" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setDeleteTarget(announcement)}
                                        disabled={isDeleting}
                                        title={t('control.announcements.delete', { defaultValue: 'حذف' })}
                                        aria-label={t('control.announcements.delete', { defaultValue: 'حذف' })}
                                        className="grid h-8 w-8 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400"
                                    >
                                        <Trash2 size={13} aria-hidden="true" />
                                    </button>
                                </div>
                            </motion.article>
                        );
                    })}
                </AnimatePresence>
                </div>
            </SectionCard>

            {/* ── Announcement editor ── */}
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
                        <div>
                            <p className="ds-field-label mb-1.5 block text-sm font-semibold">
                                {t('control.form.tone', { defaultValue: 'نمط الإعلان' })}
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {TONES.map((toneKey) => {
                                    const cfg = TONE_CONFIG[toneKey];
                                    const ToneIcon = cfg.icon;
                                    const active = form.tone === toneKey;
                                    return (
                                        <button
                                            key={toneKey}
                                            type="button"
                                            onClick={() => setForm((p) => ({ ...p, tone: toneKey }))}
                                            aria-pressed={active}
                                            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] font-black transition ${
                                                active
                                                    ? cfg.chip + ' ring-2 ring-offset-1 ring-offset-transparent'
                                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                                            }`}
                                        >
                                            <ToneIcon size={12} aria-hidden="true" />
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

            {/* ── Delete confirmation ── */}
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
