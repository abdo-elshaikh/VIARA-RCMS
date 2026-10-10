/**
 * DisplayBoardControl.jsx
 * VIARA — Advanced Waiting-Room & Lounge Display Management Console
 *
 * Ultra-modern, high-density, professional command center for the public calling display (/display):
 *  • Multi-mode ergonomics: "All-in-One" overview + focused category tabs
 *  • Quick control command strip for instant mute, quiet mode, ticker, theme toggling, and emergency broadcast
 *  • High-density compact controls with live visual feedback & tooltips
 *  • Real-time TV simulator supporting multiple aspect ratios (16:9, 21:9, 9:16 Totem) & animated audio spectrum
 *  • Medical Announcements Manager with Live Search, Tone filters, Up/Down reordering, and 1-click clone
 *  • Rich Medical Template Library with prep, lounge rules, reports, and amenity presets
 *  • Audio Chime Synthesizer audition studio (Dual-Tone, Tri-Tone, Soft Ding, Crisp Alert)
 *  • Smart TV QR code launcher modal & direct link copy
 *  • Interactive speech testing sandbox with custom sample tokens, names, rooms, gender, and test sentences
 *  • Keyboard shortcuts (Ctrl+S save, Ctrl+P test call, Ctrl+B broadcast)
 *  • Profile JSON export/import for multi-clinic consistency
 *  • Preserved full RBAC and server persistence
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    BarChart3,
    Bell,
    Bookmark,
    Building2,
    Cast,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    Command,
    Copy,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    FileText,
    Filter,
    Flame,
    FolderPlus,
    Globe,
    Hash,
    HelpCircle,
    Info,
    Keyboard,
    Languages,
    Layers,
    LayoutGrid,
    ListFilter,
    Loader2,
    Lock,
    Maximize2,
    Megaphone,
    Mic,
    Monitor,
    MonitorPlay,
    Moon,
    Music,
    Pencil,
    Play,
    Plus,
    QrCode,
    Radio,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    Settings2,
    Share2,
    Shield,
    Sliders,
    SlidersHorizontal,
    Smartphone,
    Sparkles,
    Speaker,
    Sun,
    Trash2,
    Tv,
    Type,
    Upload,
    User,
    Volume2,
    VolumeX,
    Waves,
    Wifi,
    X,
    Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
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

/* ─── Web Audio Chime Synthesizer ─────────────────────────────────────────── */
function playSynthesizedChime(chimeType = 'dual') {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') ctx.resume();

        const now = ctx.currentTime;
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);

        if (chimeType === 'dual') {
            // Classic hospital dual chime: D5 (587.33Hz) -> A5 (880Hz)
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            osc1.type = 'sine';
            osc2.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            osc2.frequency.setValueAtTime(880, now + 0.28);

            const g1 = ctx.createGain();
            const g2 = ctx.createGain();
            g1.gain.setValueAtTime(0, now);
            g1.gain.linearRampToValueAtTime(0.35, now + 0.04);
            g1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

            g2.gain.setValueAtTime(0, now + 0.28);
            g2.gain.linearRampToValueAtTime(0.35, now + 0.32);
            g2.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

            osc1.connect(g1);
            osc2.connect(g2);
            g1.connect(gainNode);
            g2.connect(gainNode);

            osc1.start(now);
            osc1.stop(now + 0.45);
            osc2.start(now + 0.28);
            osc2.stop(now + 1.0);
        } else if (chimeType === 'tri') {
            // Harmonic Tri-Tone: C5 (523.25) -> E5 (659.25) -> G5 (783.99)
            [523.25, 659.25, 783.99].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.18);
                g.gain.setValueAtTime(0, now + idx * 0.18);
                g.gain.linearRampToValueAtTime(0.28, now + idx * 0.18 + 0.03);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.55);
                osc.connect(g);
                g.connect(gainNode);
                osc.start(now + idx * 0.18);
                osc.stop(now + idx * 0.18 + 0.6);
            });
        } else if (chimeType === 'soft') {
            // Soft Lounge Ping: F5 (698.46)
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(698.46, now);
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(0.4, now + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            osc.connect(g);
            g.connect(gainNode);
            osc.start(now);
            osc.stop(now + 1.25);
        } else {
            // Crisp Alert: A5 (880) -> C6 (1046.5) -> A5 (880)
            [880, 1046.5, 880].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.12);
                g.gain.setValueAtTime(0, now + idx * 0.12);
                g.gain.linearRampToValueAtTime(0.3, now + idx * 0.12 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);
                osc.connect(g);
                g.connect(gainNode);
                osc.start(now + idx * 0.12);
                osc.stop(now + idx * 0.12 + 0.4);
            });
        }
    } catch {
        // Fallback gracefully if Web Audio is restricted
    }
}

/* ─── Constants & Configurations ─────────────────────────────────────────── */
const PATIENT_MODES = [
    { value: 'name_and_order', icon: LayoutGrid, labelAr: 'الاسم ورقم الدور', labelEn: 'Name + Token', helpAr: 'يعرض الاسم الكامل ورقم الطلب معاً', helpEn: 'Shows full name alongside token number' },
    { value: 'name', icon: Type, labelAr: 'الاسم فقط', labelEn: 'Name Only', helpAr: 'يعرض اسم المريض بدون رقم الطلب', helpEn: 'Shows patient name without token number' },
    { value: 'order_only', icon: Hash, labelAr: 'رقم الدور فقط', labelEn: 'Token Only', helpAr: 'أعلى مستوى من الخصوصية وحماية البيانات', helpEn: 'Maximum privacy & data protection' },
];

const CALL_MODES = [
    { value: 'token_only', icon: Hash, labelAr: 'رقم الدور فقط', labelEn: 'Token only', helpAr: 'مثال: صاحب الدور رقم 102', helpEn: 'Example: ticket number 102' },
    { value: 'name_only', icon: Type, labelAr: 'الاسم الكامل فقط', labelEn: 'Full name only', helpAr: 'ينادي السيد أو السيدة بالاسم الكامل', helpEn: 'Calls the patient by full name' },
    { value: 'token_and_name', icon: LayoutGrid, labelAr: 'الدور والاسم الكامل', labelEn: 'Token + full name', helpAr: 'ينادي رقم الدور ثم الاسم الكامل', helpEn: 'Calls token, then full name' },
];

const TONES = ['info', 'success', 'warning', 'urgent'];

const TONE_CONFIG = {
    info: { icon: Info, labelAr: 'معلوماتي', labelEn: 'Info', chip: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300', badge: 'bg-teal-100 text-teal-800 ring-teal-300/60 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-700/50' },
    success: { icon: CheckCircle2, labelAr: 'إيجابي', labelEn: 'Success', chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-800 ring-emerald-300/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-700/50' },
    warning: { icon: AlertTriangle, labelAr: 'تنبيه', labelEn: 'Warning', chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300', badge: 'bg-amber-100 text-amber-800 ring-amber-300/60 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-700/50' },
    urgent: { icon: Megaphone, labelAr: 'عاجل', labelEn: 'Urgent', chip: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300', badge: 'bg-rose-100 text-rose-800 ring-rose-300/60 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-700/50' },
};

const CHIME_TYPES = [
    { id: 'dual', labelAr: 'نغمة المستشفى القياسية (ثنائية)', labelEn: 'Hospital Dual-Tone', descAr: 'نغمة كلاسيكية رصينة ومريحة للأذن' },
    { id: 'tri', labelAr: 'نغمة رخيمة ثلاثية (Harmonic)', labelEn: 'Harmonic Tri-Tone', descAr: 'ثلاث نغمات متناغمة تعطي انطباعاً عصرياً' },
    { id: 'soft', labelAr: 'جرس هادئ ناعم (Soft Ping)', labelEn: 'Soft Lounge Ping', descAr: 'رنين خفيف مناسب للعيادات الهادئة والمراكز الخاصة' },
    { id: 'crisp', labelAr: 'تنبيه سريع وواضح (Crisp Alert)', labelEn: 'Crisp Alert', descAr: 'نغمة واضحة تناسب الصالات ذات الحركة والضوضاء' },
];

const ANNOUNCEMENT_RATES = [0.85, 1, 1.1];
const ANNOUNCEMENT_REPEATS = [1, 2, 3];
const ANNOUNCEMENT_DELAYS = [1000, 1500, 2200];
const ANNOUNCEMENT_VOLUMES = [0.65, 0.85, 1];
const ANNOUNCEMENT_LANGUAGES = ['ar', 'en', 'ar_then_en', 'en_then_ar'];
const TOKEN_PRONUNCIATIONS = ['auto', 'natural', 'digits'];
const ANNOUNCEMENT_STYLES = ['formal', 'calm', 'short'];
const ROTATION_SPEEDS = [6000, 9000, 12000];
const PRIVACY_MODES = ['full', 'token_only', 'name_only'];

const PRESET_LABELS = {
    standard: ['قياسي', 'Standard'],
    quiet: ['هادئ', 'Quiet'],
    concise: ['مختصر', 'Concise'],
    clarity: ['وضوح', 'Clarity'],
};

const PRESET_DEFAULTS = {
    standard: { announcementRate: 1, announcementRepeatCount: 2, announcementRepeatDelay: 1500, announcementVolume: 1, announcementStyle: 'formal', tokenPronunciation: 'auto', announcementPreset: 'standard' },
    quiet: { announcementRate: 0.86, announcementRepeatCount: 2, announcementRepeatDelay: 1800, announcementVolume: 0.7, announcementStyle: 'calm', tokenPronunciation: 'auto', announcementPreset: 'quiet' },
    concise: { announcementRate: 1.08, announcementRepeatCount: 1, announcementRepeatDelay: 1000, announcementVolume: 0.9, announcementStyle: 'short', tokenPronunciation: 'auto', announcementPreset: 'concise' },
    clarity: { announcementRate: 0.82, announcementRepeatCount: 3, announcementRepeatDelay: 1800, announcementVolume: 1, announcementStyle: 'formal', tokenPronunciation: 'digits', announcementPreset: 'clarity' },
};

/* Medical Announcements Preset Library */
const MEDICAL_TEMPLATES = [
    {
        category: 'prep',
        categoryAr: 'تعليمات الفحوصات',
        categoryEn: 'Prep Instructions',
        icon: FileText,
        templates: [
            {
                title: 'تعليمات فحص السونار',
                message: 'يرجى شرب كمية كافية من الماء (حوالي 1 لتر) قبل موعد فحص السونار بنصف ساعة وعدم التبول.',
                tone: 'info',
            },
            {
                title: 'تنبيه فحص الرنين المغناطيسي (MRI)',
                message: 'يرجى نزع جميع الساعات، المفاتيح، الهواتف، والقطع المعدنية قبل الدخول لغرفة الرنين حفاظاً على سلامتكم.',
                tone: 'warning',
            },
            {
                title: 'تعليمات فحوصات الصبغة',
                message: 'يجب التأكد من إجراء تحليل وظائف الكلى (Creatinine) والصيام لمدة 6 ساعات قبل فحوصات الأشعة المقطعية بالصبغة.',
                tone: 'warning',
            },
        ],
    },
    {
        category: 'rules',
        categoryAr: 'النظام والهدوء',
        categoryEn: 'Lounge Rules',
        icon: Shield,
        templates: [
            {
                title: 'الرجاء ضبط الهواتف على الصامت',
                message: 'نرجو من مراجعينا الكرام وضع الهواتف المحمولة على الوضع الصامت للحفاظ على راحة وهدوء جميع المرضى.',
                tone: 'info',
            },
            {
                title: 'سياسة المرافقين داخل الغرف',
                message: 'يُسمح بمرافق واحد فقط لكل مريض داخل غرف الفحص، ونشكر لكم حسن تعاونكم.',
                tone: 'info',
            },
        ],
    },
    {
        category: 'reports',
        categoryAr: 'التقارير والنتائج',
        categoryEn: 'Reports & Delivery',
        icon: CheckCircle2,
        templates: [
            {
                title: 'النتائج الرقمية عبر البوابة الإلكترونية',
                message: 'يمكنكم تحميل صور وتقارير الأشعة المعتمدة مباشرة عبر مسح الرمز المرفق في إيصال الاستقبال.',
                tone: 'success',
            },
            {
                title: 'مواعيد تسليم التقارير المكتوبة',
                message: 'تسلم التقارير العادية خلال 24 ساعة من موعد الفحص، والتقارير الطارئة تُسلم فور الانتهاء.',
                tone: 'info',
            },
        ],
    },
    {
        category: 'amenities',
        categoryAr: 'الخدمات والضيافة',
        categoryEn: 'Amenities & Hospitality',
        icon: Sparkles,
        templates: [
            {
                title: 'خدمة الواي فاي المجانية للزوار',
                message: 'تتوفر شبكة واي فاي مجانية في جميع صالات الانتظار باسم VIARA-Guest دون الحاجة لكلمة مرور.',
                tone: 'success',
            },
            {
                title: 'مكتب المساعدة والاستفسارات',
                message: 'موظفو الاستقبال في خدمتكم للإجابة عن أي استفسار أو لتقديم المساعدة لكبار السن وذوي الاحتياجات الخاصة.',
                tone: 'info',
            },
        ],
    },
];

const SAMPLE_PRESETS = [
    { token: '102', name: 'أحمد محمد علي', room: 'جناح الأشعة رقم 3', gender: 'male', label: 'نداء أشعة عادي (ذكر)' },
    { token: '088', name: 'سارة خالد محمود', room: 'غرفة السونار والموجات 1', gender: 'female', label: 'نداء سونار (أنثى)' },
    { token: '015', name: 'فاطمة حسن إبراهيم', room: 'جناح الرنين المغناطيسي MRI', gender: 'female', label: 'نداء رنين مغناطيسي' },
    { token: '204', name: 'عمر عبد العزيز', room: 'غرفة الأشعة التداخلية', gender: 'male', label: 'نداء أشعة تداخلية' },
];

const emptyForm = { title: '', message: '', tone: 'info', displayOrder: 0 };

/* ─── Compact Mini TV Simulator with Aspect Switcher & Audio Wave ────────────────────── */
const MiniTvSimulator = ({
    boardTitle,
    patientDisplayMode,
    callAnnouncementMode,
    showTicker,
    theme,
    announcements,
    isArabic,
    sampleToken,
    sampleName,
    sampleRoom,
    isPlayingChime,
    aspectRatio = '16:9',
    onAspectChange,
}) => {
    const isDark = theme === 'dark';
    const patientText = patientDisplayMode === 'order_only'
        ? `#${sampleToken}`
        : patientDisplayMode === 'name'
            ? sampleName
            : `#${sampleToken} · ${sampleName}`;

    const voiceText = callAnnouncementMode === 'name_only'
        ? sampleName
        : callAnnouncementMode === 'token_and_name'
            ? `#${sampleToken} · ${sampleName}`
            : `#${sampleToken}`;

    const activeAnnouncements = announcements.filter((a) => a.isActive);
    const tickerText = activeAnnouncements.length > 0
        ? activeAnnouncements.map((a) => a.title + ': ' + a.message).join('   ✦   ')
        : (isArabic ? 'يرجى متابعة رقم الدور وانتظار النداء الصوتي' : 'Please follow your ticket and wait for your call');

    return (
        <div className={`overflow-hidden rounded-2xl border shadow-xl transition-all duration-300 ${
            isDark
                ? 'border-slate-800 bg-[#071321] text-slate-100 shadow-slate-950/60'
                : 'border-slate-200 bg-white text-slate-800 shadow-slate-200/50'
        }`}>
            {/* TV Bezel Header */}
            <div className={`flex items-center justify-between border-b px-3.5 py-2 text-[10.5px] font-bold ${
                isDark ? 'border-slate-800/80 bg-slate-900/80 text-slate-400' : 'border-slate-100 bg-slate-50 text-slate-500'
            }`}>
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <strong className="truncate text-teal-600 dark:text-teal-400 font-black">
                        {boardTitle || (isArabic ? 'مركز فيارا التخصصي' : 'VIARA Center')}
                    </strong>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Audio Spectrum Equalizer */}
                    <div className="flex items-center gap-0.5">
                        {[40, 75, 100, 60, 90, 45, 80, 50].map((heightPct, idx) => (
                            <span
                                key={idx}
                                className={`w-0.5 rounded-full transition-all duration-200 ${
                                    isPlayingChime
                                        ? 'bg-amber-400 animate-pulse'
                                        : isDark ? 'bg-slate-700' : 'bg-slate-300'
                                }`}
                                style={{
                                    height: isPlayingChime ? `${Math.max(4, (heightPct / 100) * 14)}px` : '4px',
                                    animationDelay: `${idx * 0.08}s`,
                                }}
                            />
                        ))}
                    </div>

                    {/* Aspect Selector Pills */}
                    <div className="flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[9px] dark:border-slate-800 dark:bg-slate-950">
                        {['16:9', '21:9', '9:16'].map((asp) => (
                            <button
                                key={asp}
                                type="button"
                                onClick={() => onAspectChange?.(asp)}
                                className={`rounded px-1 py-0.5 font-mono font-bold transition ${
                                    aspectRatio === asp
                                        ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                }`}
                            >
                                {asp}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* TV Screen Body Container */}
            <div className={`p-3.5 space-y-3 transition-all ${
                aspectRatio === '9:16' ? 'max-w-[280px] mx-auto border-x border-dashed border-teal-500/30' : ''
            }`}>
                {/* Now Calling Stage */}
                <div className={`relative overflow-hidden rounded-xl border p-3.5 shadow-xs transition-all ${
                    isPlayingChime
                        ? 'border-teal-400 bg-teal-500/15 ring-2 ring-teal-500/30'
                        : isDark
                            ? 'border-teal-900/50 bg-gradient-to-br from-teal-950/50 via-slate-900 to-slate-900'
                            : 'border-teal-200 bg-gradient-to-br from-teal-50/80 via-white to-slate-50'
                }`}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <span className="inline-flex h-5 items-center gap-1 rounded-md bg-teal-500/20 px-1.5 text-[10px] font-black text-teal-700 dark:text-teal-300">
                                <Waves size={11} className={isPlayingChime ? 'animate-pulse' : ''} />
                                {isArabic ? 'يتم النداء الآن' : 'Now Calling'}
                            </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 truncate max-w-[120px]">
                            {sampleRoom}
                        </span>
                    </div>

                    <div className="my-2">
                        <motion.p
                            key={patientText}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="truncate text-xl font-extrabold tracking-tight text-slate-900 dark:text-white"
                        >
                            {patientText}
                        </motion.p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200/60 pt-2 text-[10px] font-semibold dark:border-slate-800">
                        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Mic size={11} className="text-amber-500" />
                            {isArabic ? 'النداء الصوتي:' : 'Voice:'}
                        </span>
                        <span className="truncate font-mono font-bold text-amber-600 dark:text-amber-400 max-w-[170px]">
                            {voiceText}
                        </span>
                    </div>
                </div>

                {/* Sub-grid Mock (Rooms status) */}
                <div className={`grid gap-2 text-[10px] ${aspectRatio === '9:16' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <div className={`rounded-lg border p-2 ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50/70'}`}>
                        <div className="flex justify-between items-center text-slate-400 font-bold mb-1">
                            <span>جناح الأشعة 1</span>
                            <span className="text-emerald-500 font-mono">#101</span>
                        </div>
                        <div className="text-[9.5px] text-slate-500 truncate">فحص أشعة مقطعية CT</div>
                    </div>
                    <div className={`rounded-lg border p-2 ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-slate-50/70'}`}>
                        <div className="flex justify-between items-center text-slate-400 font-bold mb-1">
                            <span>جناح الرنين 2</span>
                            <span className="text-teal-500 font-mono">#098</span>
                        </div>
                        <div className="text-[9.5px] text-slate-500 truncate">فحص رنين مغناطيسي MRI</div>
                    </div>
                </div>

                {/* Bottom Ticker Simulation */}
                {showTicker && (
                    <div className={`overflow-hidden rounded-lg border px-2.5 py-1.5 text-[10px] ${
                        isDark ? 'border-slate-800 bg-slate-900 text-teal-300' : 'border-teal-100 bg-teal-50/70 text-teal-800'
                    }`}>
                        <div className="flex items-center gap-2">
                            <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-teal-500/20 text-teal-600 dark:text-teal-400">
                                <Megaphone size={10} />
                            </span>
                            <p className="truncate font-medium text-[10px] leading-tight">
                                {tickerText}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ─── Main Controller Component ─────────────────────────────────────────── */
const DisplayBoardControl = () => {
    const { t, i18n } = useTranslation('display');
    const isArabic = i18n.language?.startsWith('ar');

    const { data: configData, isLoading: isLoadingConfig, isError: isConfigError, refetch } = useGetDisplayConfigQuery();
    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const centerLogo = rawCenterSettings?.logo_url || '/center-logo.png';

    const [updateConfig, { isLoading: isSavingConfig }] = useUpdateDisplayConfigMutation();
    const [createAnnouncement, { isLoading: isCreating }] = useCreateDisplayAnnouncementMutation();
    const [updateAnnouncement, { isLoading: isUpdating }] = useUpdateDisplayAnnouncementMutation();
    const [deleteAnnouncement, { isLoading: isDeleting }] = useDeleteDisplayAnnouncementMutation();

    /* Active navigation tab */
    const [activeTab, setActiveTab] = useState('all');

    /* Config draft states */
    const [patientDisplayMode, setPatientDisplayMode] = useState('order_only');
    const [callAnnouncementMode, setCallAnnouncementMode] = useState('token_only');
    const [showTicker, setShowTicker] = useState(true);
    const [boardTitle, setBoardTitle] = useState('');
    const [privacyMode, setPrivacyMode] = useState('full');
    const [muteAll, setMuteAll] = useState(false);
    const [quietMode, setQuietMode] = useState(false);
    const [repeatChime, setRepeatChime] = useState(true);
    const [theme, setTheme] = useState('light');
    const [displayLanguage, setDisplayLanguage] = useState('ar');
    const [motionMode, setMotionMode] = useState('full');
    const [rotationSpeed, setRotationSpeed] = useState(9000);
    const [showSummaryStats, setShowSummaryStats] = useState(false);
    const [announcementMode, setAnnouncementMode] = useState(null);
    const [announcementPreset, setAnnouncementPreset] = useState('standard');
    const [announcementRate, setAnnouncementRate] = useState(1);
    const [announcementRepeatCount, setAnnouncementRepeatCount] = useState(2);
    const [announcementRepeatDelay, setAnnouncementRepeatDelay] = useState(1500);
    const [announcementVolume, setAnnouncementVolume] = useState(1);
    const [announcementLanguage, setAnnouncementLanguage] = useState('ar');
    const [tokenPronunciation, setTokenPronunciation] = useState('auto');
    const [announcementStyle, setAnnouncementStyle] = useState('formal');
    const [customTemplate, setCustomTemplate] = useState('');
    const [pronunciationDictionary, setPronunciationDictionary] = useState('');
    const [arabicVoiceURI, setArabicVoiceURI] = useState('');
    const [englishVoiceURI, setEnglishVoiceURI] = useState('');
    const [selectedChime, setSelectedChime] = useState('dual');
    const [availableVoices, setAvailableVoices] = useState([]);
    const [configTouched, setConfigTouched] = useState(false);
    const appliedConfigRef = useRef(null);

    /* Simulator Aspect Ratio */
    const [simulatorAspect, setSimulatorAspect] = useState('16:9');

    /* Announcements management state */
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [announcementSearch, setAnnouncementSearch] = useState('');
    const [announcementFilterTone, setAnnouncementFilterTone] = useState('all');
    const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);

    /* Live sandbox & preview state */
    const [sampleToken, setSampleToken] = useState('102');
    const [sampleName, setSampleName] = useState('أحمد محمد علي');
    const [sampleRoom, setSampleRoom] = useState('جناح الأشعة رقم 3');
    const [sampleGender, setSampleGender] = useState('male');
    const [isPlayingChime, setIsPlayingChime] = useState(false);

    /* Modals */
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [tvConnectTab, setTvConnectTab] = useState('cable');
    const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
    const [emergencyText, setEmergencyText] = useState('يرجى من جميع المراجعين التوجه فوراً لشباك الاستقبال 1');
    const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

    /* Browser synthesis voices detection */
    useEffect(() => {
        if (!('speechSynthesis' in window)) return undefined;
        const updateVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
        updateVoices();
        window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
    }, []);

    /* Sync remote config to draft */
    useEffect(() => {
        if (!configData?.config || configTouched) return;
        const snapshot = JSON.stringify(configData.config);
        if (appliedConfigRef.current === snapshot) return;
        const cfg = configData.config;
        setPatientDisplayMode(cfg.patientDisplayMode || 'order_only');
        setCallAnnouncementMode(cfg.callAnnouncementMode || 'token_only');
        setShowTicker(cfg.showTicker !== false);
        setBoardTitle(cfg.boardTitle || '');
        setPrivacyMode(cfg.privacyMode || 'full');
        setMuteAll(cfg.muteAll === true);
        setQuietMode(cfg.quietMode === true);
        setRepeatChime(cfg.repeatChime !== false);
        setTheme(cfg.theme || 'light');
        setDisplayLanguage(cfg.displayLanguage || 'ar');
        setMotionMode(cfg.motionMode || 'full');
        setRotationSpeed(cfg.rotationSpeed || 9000);
        setShowSummaryStats(cfg.showSummaryStats === true);
        setAnnouncementMode(cfg.announcementMode || null);
        setAnnouncementPreset(cfg.announcementPreset || 'standard');
        setAnnouncementRate(cfg.announcementRate || 1);
        setAnnouncementRepeatCount(cfg.announcementRepeatCount || 2);
        setAnnouncementRepeatDelay(cfg.announcementRepeatDelay || 1500);
        setAnnouncementVolume(cfg.announcementVolume || 1);
        setAnnouncementLanguage(cfg.announcementLanguage || 'ar');
        setTokenPronunciation(cfg.tokenPronunciation || 'auto');
        setAnnouncementStyle(cfg.announcementStyle || 'formal');
        setCustomTemplate(cfg.customTemplate || '');
        setPronunciationDictionary(cfg.pronunciationDictionary || '');
        setArabicVoiceURI(cfg.arabicVoiceURI || '');
        setEnglishVoiceURI(cfg.englishVoiceURI || '');
        appliedConfigRef.current = snapshot;
    }, [configData, configTouched]);

    const announcements = useMemo(() => configData?.announcements || [], [configData]);
    const activeCount = announcements.filter((a) => a.isActive).length;
    const inactiveCount = announcements.length - activeCount;
    const namesHidden = patientDisplayMode === 'order_only';

    const filteredAnnouncements = useMemo(() => {
        return announcements.filter((a) => {
            const matchesSearch = announcementSearch.trim() === ''
                || a.title.toLowerCase().includes(announcementSearch.toLowerCase())
                || a.message.toLowerCase().includes(announcementSearch.toLowerCase());
            const matchesTone = announcementFilterTone === 'all' || a.tone === announcementFilterTone;
            return matchesSearch && matchesTone;
        });
    }, [announcements, announcementSearch, announcementFilterTone]);

    const touchConfig = (setter) => (value) => {
        setter(value);
        setConfigTouched(true);
    };

    const handlePatientDisplayModeChange = (value) => {
        setPatientDisplayMode(value);
        if (value === 'order_only') setCallAnnouncementMode('token_only');
        setConfigTouched(true);
    };

    const handleApplyPreset = (presetKey) => {
        const preset = PRESET_DEFAULTS[presetKey];
        if (!preset) return;
        setAnnouncementPreset(presetKey);
        setAnnouncementRate(preset.announcementRate);
        setAnnouncementRepeatCount(preset.announcementRepeatCount);
        setAnnouncementRepeatDelay(preset.announcementRepeatDelay);
        setAnnouncementVolume(preset.announcementVolume);
        setAnnouncementStyle(preset.announcementStyle);
        if (preset.tokenPronunciation) setTokenPronunciation(preset.tokenPronunciation);
        setConfigTouched(true);
    };

    const handleSaveConfig = useCallback(async () => {
        try {
            await updateConfig({
                patientDisplayMode,
                callAnnouncementMode,
                showTicker,
                boardTitle: boardTitle.trim() || null,
                privacyMode,
                soundEnabled: !muteAll,
                muteAll,
                quietMode,
                repeatChime,
                theme,
                displayLanguage,
                motionMode,
                rotationSpeed,
                showSummaryStats,
                announcementMode: announcementMode || undefined,
                announcementPreset,
                announcementRate,
                announcementRepeatCount,
                announcementRepeatDelay,
                announcementVolume,
                announcementLanguage,
                tokenPronunciation,
                announcementStyle,
                customTemplate: customTemplate.trim() || null,
                pronunciationDictionary: pronunciationDictionary.trim() || null,
                arabicVoiceURI: arabicVoiceURI.trim() || null,
                englishVoiceURI: englishVoiceURI.trim() || null,
            }).unwrap();
            toast.success(t('control.settings.saved', { defaultValue: 'تم حفظ إعدادات الشاشة' }));
            setConfigTouched(false);
        } catch (error) {
            toast.error(getErrorMessage(error, t('control.settings.saveFailed', { defaultValue: 'تعذر حفظ الإعدادات' })));
        }
    }, [
        updateConfig,
        patientDisplayMode,
        callAnnouncementMode,
        showTicker,
        boardTitle,
        privacyMode,
        muteAll,
        quietMode,
        repeatChime,
        theme,
        displayLanguage,
        motionMode,
        rotationSpeed,
        showSummaryStats,
        announcementMode,
        announcementPreset,
        announcementRate,
        announcementRepeatCount,
        announcementRepeatDelay,
        announcementVolume,
        announcementLanguage,
        tokenPronunciation,
        announcementStyle,
        customTemplate,
        pronunciationDictionary,
        arabicVoiceURI,
        englishVoiceURI,
        t,
    ]);

    const handleResetDraft = () => {
        if (!configData?.config) return;
        const cfg = configData.config;
        setPatientDisplayMode(cfg.patientDisplayMode || 'order_only');
        setCallAnnouncementMode(cfg.callAnnouncementMode || 'token_only');
        setShowTicker(cfg.showTicker !== false);
        setBoardTitle(cfg.boardTitle || '');
        setPrivacyMode(cfg.privacyMode || 'full');
        setMuteAll(cfg.muteAll === true);
        setQuietMode(cfg.quietMode === true);
        setRepeatChime(cfg.repeatChime !== false);
        setTheme(cfg.theme || 'light');
        setDisplayLanguage(cfg.displayLanguage || 'ar');
        setMotionMode(cfg.motionMode || 'full');
        setRotationSpeed(cfg.rotationSpeed || 9000);
        setShowSummaryStats(cfg.showSummaryStats === true);
        setAnnouncementPreset(cfg.announcementPreset || 'standard');
        setAnnouncementRate(cfg.announcementRate || 1);
        setAnnouncementRepeatCount(cfg.announcementRepeatCount || 2);
        setAnnouncementRepeatDelay(cfg.announcementRepeatDelay || 1500);
        setAnnouncementVolume(cfg.announcementVolume || 1);
        setAnnouncementLanguage(cfg.announcementLanguage || 'ar');
        setTokenPronunciation(cfg.tokenPronunciation || 'auto');
        setAnnouncementStyle(cfg.announcementStyle || 'formal');
        setCustomTemplate(cfg.customTemplate || '');
        setPronunciationDictionary(cfg.pronunciationDictionary || '');
        setArabicVoiceURI(cfg.arabicVoiceURI || '');
        setEnglishVoiceURI(cfg.englishVoiceURI || '');
        setConfigTouched(false);
        toast(isArabic ? 'تمت إعادة ضبط التعديلات غير المحفوظة' : 'Reverted unsaved draft changes', { icon: '↩️' });
    };

    const playVoicePreview = useCallback(() => {
        setIsPlayingChime(true);
        setTimeout(() => setIsPlayingChime(false), 2500);

        if (!muteAll) {
            playSynthesizedChime(selectedChime);
        }

        announcePatientCall({
            tokenNumber: sampleToken || '102',
            patientName: sampleName || (isArabic ? 'أحمد محمد علي' : 'Ahmed Mohamed Ali'),
            roomName: sampleRoom || (isArabic ? 'جناح الأشعة رقم 3' : 'Radiology Suite 3'),
            announcementMode: namesHidden ? 'token_only' : (announcementMode || callAnnouncementMode),
            isArabic,
            gender: sampleGender,
            withChime: false, // We synthesized high quality tone above
            repeatCount: announcementPreset === 'concise' ? 1 : (announcementPreset === 'clarity' ? 3 : announcementRepeatCount),
            speechRate: announcementRate,
            speechVolume: announcementVolume,
            announcementLanguage,
            tokenPronunciation,
            announcementStyle,
            customTemplate: customTemplate || undefined,
            pronunciationDictionary: pronunciationDictionary || undefined,
            arabicVoiceURI: arabicVoiceURI || undefined,
            englishVoiceURI: englishVoiceURI || undefined,
            autoBestVoice: true,
        });
    }, [
        muteAll,
        selectedChime,
        sampleToken,
        sampleName,
        sampleRoom,
        namesHidden,
        announcementMode,
        callAnnouncementMode,
        isArabic,
        sampleGender,
        announcementPreset,
        announcementRepeatCount,
        announcementRate,
        announcementVolume,
        announcementLanguage,
        tokenPronunciation,
        announcementStyle,
        customTemplate,
        pronunciationDictionary,
        arabicVoiceURI,
        englishVoiceURI,
    ]);

    /* Global Keyboard Shortcuts */
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSaveConfig();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                playVoicePreview();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                setEmergencyModalOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSaveConfig, playVoicePreview]);

    /* Announcement handlers */
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

    const handleApplyMedicalTemplate = (tpl) => {
        setForm((prev) => ({
            ...prev,
            title: tpl.title,
            message: tpl.message,
            tone: tpl.tone,
        }));
        setTemplateLibraryOpen(false);
        setFormOpen(true);
        toast.success(isArabic ? `تم تطبيق قالب: ${tpl.title}` : `Template applied: ${tpl.title}`);
    };

    const handleDuplicateAnnouncement = async (announcement) => {
        try {
            await createAnnouncement({
                title: `${announcement.title} (${isArabic ? 'نسخة' : 'Copy'})`,
                message: announcement.message,
                tone: announcement.tone,
                displayOrder: (Number(announcement.displayOrder) || 0) + 1,
            }).unwrap();
            toast.success(isArabic ? 'تم تكرار الإعلان بنجاح' : 'Announcement duplicated');
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'تعذر تكرار الإعلان' : 'Failed to duplicate'));
        }
    };

    const handleReorderAnnouncement = async (announcement, delta) => {
        try {
            const nextOrder = Math.max(0, (Number(announcement.displayOrder) || 0) + delta);
            await updateAnnouncement({ id: announcement.id, displayOrder: nextOrder }).unwrap();
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'تعذر تعديل الترتيب' : 'Failed to reorder'));
        }
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

    const handleBroadcastEmergency = async () => {
        if (!emergencyText.trim()) return;
        try {
            await createAnnouncement({
                title: isArabic ? '🚨 تنبيه عاجل من الاستقبال' : '🚨 Urgent Reception Notice',
                message: emergencyText.trim(),
                tone: 'urgent',
                displayOrder: 0,
            }).unwrap();
            playSynthesizedChime('crisp');
            toast.success(isArabic ? 'تم بث الإشعار العاجل للشاشات بنجاح' : 'Emergency alert broadcasted');
            setEmergencyModalOpen(false);
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'تعذر بث الإشعار العاجل' : 'Broadcast failed'));
        }
    };

    const copyDisplayLink = () => {
        const fullUrl = `${window.location.origin}/display`;
        navigator.clipboard.writeText(fullUrl);
        toast.success(isArabic ? 'تم نسخ رابط شاشة العرض' : 'Display URL copied to clipboard');
    };

    const openExternalMonitor = () => {
        const w = window.open(
            '/display',
            'VIARA_TV_DISPLAY',
            'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
        );
        if (w) {
            toast.success(
                isArabic
                    ? 'تم فتح نافذة الشاشة الخارجية! اسحبها لشاشة التلفاز واضغط F11 لملء الشاشة.'
                    : 'External TV window opened! Drag it to your TV and press F11 for fullscreen.'
            );
        } else {
            toast.error(
                isArabic
                    ? 'يرجى السماح بالنوافذ المنبثقة (Popups) من إعدادات المتصفح'
                    : 'Please allow popups in your browser settings'
            );
        }
    };

    const startWirelessCast = async () => {
        if (typeof window !== 'undefined' && window.PresentationRequest) {
            try {
                const request = new window.PresentationRequest(['/display']);
                await request.start();
                toast.success(isArabic ? 'جارٍ البث إلى التلفاز الذكي...' : 'Casting to smart TV...');
            } catch (err) {
                if (err.name !== 'NotAllowedError') {
                    toast(
                        isArabic
                            ? 'يمكنك أيضاً البث السريع في ويندوز بالضغط على مفتاحي Win + K'
                            : 'You can also cast in Windows by pressing Win + K',
                        { icon: '📺' }
                    );
                }
            }
        } else {
            toast(
                isArabic
                    ? 'للبث اللاسلكي المباشر في ويندوز، اضغط على مفتاحي Win + K لاكتشاف التلفاز'
                    : 'To cast wirelessly in Windows, press Win + K to discover your TV',
                { icon: '📺' }
            );
        }
    };

    /* Export / Import Profile JSON */
    const handleExportProfile = () => {
        const profile = {
            center: 'VIARA Display System',
            exportedAt: new Date().toISOString(),
            config: {
                patientDisplayMode,
                callAnnouncementMode,
                showTicker,
                boardTitle,
                privacyMode,
                muteAll,
                quietMode,
                theme,
                displayLanguage,
                rotationSpeed,
                announcementPreset,
                announcementRate,
                announcementRepeatCount,
                announcementVolume,
                announcementLanguage,
                tokenPronunciation,
                announcementStyle,
            },
            announcements: announcements.map((a) => ({
                title: a.title,
                message: a.message,
                tone: a.tone,
                isActive: a.isActive,
                displayOrder: a.displayOrder,
            })),
        };
        const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `viara-display-profile-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(isArabic ? 'تم تصدير ملف الإعدادات بنجاح' : 'Display profile exported');
    };

    const isFormBusy = isCreating || isUpdating;

    const TABS = [
        { id: 'all', label: isArabic ? 'نظرة شاملة' : 'Overview', icon: LayoutGrid },
        { id: 'general', label: isArabic ? 'الهوية والنداء' : 'Call & Identity', icon: User, badge: namesHidden ? (isArabic ? 'خصوصية' : 'Privacy') : null },
        { id: 'audio', label: isArabic ? 'الصوت والنغمات' : 'Audio & Chimes', icon: Volume2, badge: muteAll ? (isArabic ? 'مكتوم' : 'Muted') : quietMode ? (isArabic ? 'هادئ' : 'Quiet') : null },
        { id: 'display', label: isArabic ? 'الشاشة والمظهر' : 'Screen & Display', icon: Tv },
        { id: 'announcements', label: isArabic ? 'الإعلانات والشريط' : 'Announcements', icon: Megaphone, count: announcements.length },
        { id: 'sandbox', label: isArabic ? 'المحاكاة والتجربة' : 'Live Simulator', icon: MonitorPlay },
    ];

    const showGeneral = activeTab === 'all' || activeTab === 'general';
    const showAudio = activeTab === 'all' || activeTab === 'audio';
    const showDisplay = activeTab === 'all' || activeTab === 'display';
    const showAnnouncements = activeTab === 'all' || activeTab === 'announcements';
    const showSandbox = activeTab === 'all' || activeTab === 'sandbox';

    const publicDisplayUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/display`;

    return (
        <div className="mx-auto max-w-[1380px] space-y-4 pb-20">
            {/* ── Page Header ── */}
            <PageHeader
                logoUrl={centerLogo}
                icon={Settings2}
                eyebrowIcon={MonitorPlay}
                eyebrow={t('control.eyebrow', { defaultValue: 'وحدة تحكم شاشة الانتظار' })}
                title={t('control.title', { defaultValue: 'إدارة شاشة عرض الحالات' })}
                description={t('control.subtitle', { defaultValue: 'تحكم في ظهور أسماء المرضى وشريط النداء والإعلانات على شاشة الانتظار الخارجية.' })}
                actions={(
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSaveConfig}
                            disabled={isSavingConfig}
                            loading={isSavingConfig}
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <Save size={13} />
                                {t('control.settings.save', { defaultValue: 'حفظ الإعدادات' })}
                            </span>
                        </Button>

                        <button
                            type="button"
                            onClick={() => setEmergencyModalOpen(true)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-black text-rose-700 shadow-xs transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
                            title={isArabic ? 'بث تنبيه عاجل للصالات (Ctrl+B)' : 'Emergency Broadcast'}
                        >
                            <Flame size={14} className="text-rose-600 animate-pulse" />
                            <span>{isArabic ? 'بث تنبيه عاجل' : 'Emergency Alert'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setQrModalOpen(true)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            title={isArabic ? 'بث وربط شاشات التلفزيون (HDMI / Smart TV / Cast)' : 'Connect & Cast TV'}
                        >
                            <Tv size={14} className="text-teal-600 dark:text-teal-400" />
                            <span>{isArabic ? 'بث وربط الشاشات' : 'Connect & Cast TV'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={playVoicePreview}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-800 shadow-xs transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
                            title={isArabic ? 'استمع لنداء تجريبي (Ctrl+P)' : 'Test voice chime'}
                        >
                            <Play size={13} className="fill-amber-600 dark:fill-amber-400" />
                            <span>{t('control.settings.previewAnnouncement', { defaultValue: 'استمع لهذا النداء' })}</span>
                        </button>

                        <a
                            href="/display"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3.5 text-xs font-black text-teal-700 shadow-xs transition hover:-translate-y-0.5 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/60"
                        >
                            <ExternalLink size={13} aria-hidden="true" />
                            {t('control.openBoard', { defaultValue: 'فتح الشاشة المباشرة' })}
                        </a>

                        <button
                            type="button"
                            onClick={() => setShortcutsModalOpen(true)}
                            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                            title={isArabic ? 'اختصارات لوحة المفاتيح' : 'Keyboard shortcuts'}
                        >
                            <Keyboard size={14} />
                        </button>
                    </div>
                )}
                metrics={[
                    { key: 'announcements', label: t('control.metrics.announcements', { defaultValue: 'إعلانات نشطة' }), value: activeCount, icon: Megaphone, tone: 'teal', detail: t('control.metrics.announcementsDetail', { defaultValue: 'تظهر الآن على الشاشة' }) },
                    { key: 'hidden', label: t('control.metrics.hidden', { defaultValue: 'موقوفة' }), value: inactiveCount, icon: EyeOff, tone: 'slate', detail: t('control.metrics.hiddenDetail', { defaultValue: 'محفوظة ولا تظهر' }) },
                    { key: 'privacy', label: isArabic ? 'الخصوصية' : 'Privacy', value: namesHidden ? (isArabic ? 'حجب الأسماء' : 'Tokens Only') : (isArabic ? 'عرض كامل' : 'Full Names'), icon: Shield, tone: namesHidden ? 'emerald' : 'amber', detail: isArabic ? 'حماية بيانات المرضى' : 'Patient data safety' },
                ]}
                metricsLabel={t('control.metricsLabel', { defaultValue: 'ملخص محتوى الشاشة' })}
            />

            {/* ── Quick Control Command Strip ── */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <button
                    type="button"
                    onClick={() => { setMuteAll(!muteAll); setConfigTouched(true); }}
                    aria-pressed={!muteAll}
                    className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-start transition ${
                        !muteAll
                            ? 'border-teal-200 bg-teal-50/70 text-teal-900 dark:border-teal-800/60 dark:bg-teal-950/30 dark:text-teal-200'
                            : 'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200'
                    }`}
                >
                    <div className="min-w-0">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">{isArabic ? 'الصوت العام' : 'Audio Status'}</span>
                        <span className="block text-xs font-black truncate">
                            {!muteAll ? t('control.settings.soundOn', { defaultValue: 'الصوت مفعل' }) : t('control.settings.soundOff', { defaultValue: 'الصوت مكتوم' })}
                        </span>
                    </div>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl ${!muteAll ? 'bg-teal-500/15 text-teal-600 dark:text-teal-300' : 'bg-rose-500/15 text-rose-600'}`}>
                        {!muteAll ? <Volume2 size={15} /> : <VolumeX size={15} />}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => { setQuietMode(!quietMode); setConfigTouched(true); }}
                    aria-pressed={quietMode}
                    className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-start transition ${
                        quietMode
                            ? 'border-amber-300 bg-amber-50/80 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200'
                            : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                >
                    <div className="min-w-0">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">{isArabic ? 'الوضع الهادئ' : 'Quiet Mode'}</span>
                        <span className="block text-xs font-black truncate">
                            {quietMode ? t('control.settings.quietOn', { defaultValue: 'الوضع الهادئ' }) : (isArabic ? 'وضع قياسي' : 'Standard')}
                        </span>
                    </div>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl ${quietMode ? 'bg-amber-500/15 text-amber-600' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                        <Moon size={15} />
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => touchConfig(setShowTicker)(!showTicker)}
                    aria-pressed={showTicker}
                    className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-start transition ${
                        showTicker
                            ? 'border-indigo-200 bg-indigo-50/70 text-indigo-900 dark:border-indigo-800/60 dark:bg-indigo-950/30 dark:text-indigo-200'
                            : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                >
                    <div className="min-w-0">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">{t('control.settings.showTicker', { defaultValue: 'شريط الأخبار السفلي' })}</span>
                        <span className="block text-xs font-black truncate">
                            {showTicker ? t('control.settings.enabled', { defaultValue: 'مفعل' }) : t('control.settings.disabled', { defaultValue: 'متوقف' })}
                        </span>
                    </div>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl ${showTicker ? 'bg-indigo-500/15 text-indigo-600' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                        <Radio size={15} />
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => touchConfig(setTheme)(theme === 'light' ? 'dark' : 'light')}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-start transition dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                >
                    <div className="min-w-0">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">{t('control.settings.theme', { defaultValue: 'السمة' })}</span>
                        <span className="block text-xs font-black truncate">
                            {theme === 'dark' ? t('control.settings.dark', { defaultValue: 'داكن' }) : t('control.settings.light', { defaultValue: 'فاتح' })}
                        </span>
                    </div>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={handleExportProfile}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-start transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    title={isArabic ? 'تصدير ملف الإعدادات كملف JSON' : 'Export Profile'}
                >
                    <div className="min-w-0">
                        <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">{isArabic ? 'حفظ نسخة' : 'Profile'}</span>
                        <span className="block text-xs font-black truncate">{isArabic ? 'تصدير JSON' : 'Export'}</span>
                    </div>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Download size={14} />
                    </span>
                </button>

                <div className="col-span-2 sm:col-span-1 flex items-center justify-between rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 p-3 dark:border-teal-800/40">
                    <div className="min-w-0">
                        <span className="block text-[10px] font-bold text-teal-700 dark:text-teal-300">{isArabic ? 'حالة المزامنة' : 'Sync Status'}</span>
                        <span className="block text-xs font-black text-slate-900 dark:text-white">
                            {configTouched ? (isArabic ? 'مسودة محلية' : 'Draft') : (isArabic ? 'متزامن' : 'Synced')}
                        </span>
                    </div>
                    <span className="relative flex h-3 w-3">
                        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${configTouched ? 'animate-ping bg-amber-400' : 'bg-emerald-400'}`} />
                        <span className={`relative inline-flex h-3 w-3 rounded-full ${configTouched ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    </span>
                </div>
            </div>

            {/* ── Segmented Ergonomic Tabs ── */}
            <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex min-h-[38px] items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                                isActive
                                    ? 'bg-teal-600 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                            }`}
                        >
                            <Icon size={14} />
                            <span>{tab.label}</span>
                            {tab.count !== undefined && (
                                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                    isActive ? 'bg-white/20 text-white dark:bg-slate-950/30' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                            {tab.badge && (
                                <span className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-bold ${
                                    isActive ? 'bg-amber-400 text-amber-950' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                }`}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Main Layout Grid (Controls + Live Monitor) ── */}
            <div className="grid gap-4 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px]">
                {/* Active Tab Panel */}
                <div className="space-y-4">
                    {isLoadingConfig ? (
                        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white py-20 text-sm font-bold text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                            <Loader2 size={24} className="animate-spin text-teal-600" />
                            {t('control.settings.loading', { defaultValue: 'جارٍ تحميل الإعدادات...' })}
                        </div>
                    ) : isConfigError ? (
                        <div className="flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                            <AlertTriangle size={20} className="shrink-0" />
                            <div className="flex-1">
                                <p>{t('control.settings.error', { defaultValue: 'تعذر تحميل الإعدادات. يرجى التحقق من اتصال الخادم.' })}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => refetch()}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-black text-rose-700 shadow-xs hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-300"
                            >
                                <RefreshCw size={12} /> {isArabic ? 'إعادة المحاولة' : 'Retry'}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* ═══ TAB 1: GENERAL & IDENTITY ═══ */}
                            {showGeneral && (
                                <div className="space-y-4">
                                    {/* Patient Display Mode */}
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                    {t('control.settings.patientMode', { defaultValue: 'طريقة عرض بيانات المريض' })}
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {t('control.settings.patientModeHelp', { defaultValue: 'يؤثر على ما يراه المنتظرون على شاشة TV.' })}
                                                </p>
                                            </div>
                                            <Shield size={16} className="text-teal-600 dark:text-teal-400" />
                                        </div>
                                        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                                            {PATIENT_MODES.map(({ value, icon: Icon, labelAr, labelEn, helpAr, helpEn }) => {
                                                const isActive = patientDisplayMode === value;
                                                return (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => handlePatientDisplayModeChange(value)}
                                                        disabled={isSavingConfig}
                                                        aria-pressed={isActive}
                                                        className={`relative flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-start transition ${
                                                            isActive
                                                                ? 'border-teal-500 bg-teal-50/80 ring-2 ring-teal-500/20 dark:border-teal-600 dark:bg-teal-950/40'
                                                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        <div className="flex w-full items-center justify-between">
                                                            <span className={`grid h-8 w-8 place-items-center rounded-xl ${
                                                                isActive ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                                            }`}>
                                                                <Icon size={15} />
                                                            </span>
                                                            {isActive && (
                                                                <span className="h-2 w-2 rounded-full bg-teal-500 ring-4 ring-teal-500/20" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <span className="block text-xs font-black text-slate-900 dark:text-white">
                                                                {t(`control.settings.mode.${value}`, { defaultValue: isArabic ? labelAr : labelEn })}
                                                            </span>
                                                            <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500 dark:text-slate-400">
                                                                {t(`control.settings.mode.${value}Help`, { defaultValue: isArabic ? helpAr : helpEn })}
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Voice Call Mode */}
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                    {t('control.settings.voiceMode', { defaultValue: 'طريقة النداء الصوتي' })}
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {t('control.settings.voiceModeHelp', { defaultValue: 'اختر ما يُنطق في النداء الأول وتكراره.' })}
                                                </p>
                                            </div>
                                            <Volume2 size={16} className="text-amber-500" />
                                        </div>
                                        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                                            {CALL_MODES.map(({ value, icon: Icon, labelAr, labelEn, helpAr, helpEn }) => {
                                                const isActive = callAnnouncementMode === value;
                                                const isDisabled = (value !== 'token_only' && namesHidden) || isSavingConfig;
                                                return (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => touchConfig(setCallAnnouncementMode)(value)}
                                                        disabled={isDisabled}
                                                        aria-pressed={isActive}
                                                        className={`relative flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-start transition ${
                                                            isActive
                                                                ? 'border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/20 dark:border-amber-600 dark:bg-amber-950/30'
                                                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                                                        } ${isDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
                                                    >
                                                        <div className="flex w-full items-center justify-between">
                                                            <span className={`grid h-8 w-8 place-items-center rounded-xl ${
                                                                isActive ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                                            }`}>
                                                                <Icon size={15} />
                                                            </span>
                                                            {isActive && (
                                                                <span className="h-2 w-2 rounded-full bg-amber-500 ring-4 ring-amber-500/20" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <span className="block text-xs font-black text-slate-900 dark:text-white">
                                                                {t(`control.settings.callMode.${value}`, { defaultValue: isArabic ? labelAr : labelEn })}
                                                            </span>
                                                            <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500 dark:text-slate-400">
                                                                {t(`control.settings.callMode.${value}Help`, { defaultValue: isArabic ? helpAr : helpEn })}
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <AnimatePresence>
                                            {namesHidden && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                                                >
                                                    <Shield size={14} className="shrink-0 text-amber-600" />
                                                    {t('control.settings.nameRequired', { defaultValue: 'فعّل عرض الأسماء أولاً لاستخدام النداء بالاسم.' })}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Privacy & Pronunciation Style Group */}
                                    <div className="grid gap-4 sm:grid-cols-3">
                                        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                            <label className="block text-xs font-black text-slate-800 dark:text-slate-100 mb-2">
                                                {t('control.settings.privacyMode', { defaultValue: 'وضع الخصوصية' })}
                                            </label>
                                            <div className="flex flex-col gap-1.5">
                                                {PRIVACY_MODES.map((mode) => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => { setPrivacyMode(mode); setConfigTouched(true); }}
                                                        aria-pressed={privacyMode === mode}
                                                        className={`rounded-xl border px-3 py-1.5 text-xs font-black text-start transition ${
                                                            privacyMode === mode
                                                                ? 'border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
                                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                                                        }`}
                                                    >
                                                        {mode === 'full' ? (isArabic ? 'حجب كامل' : 'Full Protection') : mode === 'token_only' ? (isArabic ? 'رقم الدور فقط' : 'Token only') : (isArabic ? 'الاسم فقط' : 'Name only')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                            <label className="block text-xs font-black text-slate-800 dark:text-slate-100 mb-2">
                                                {t('control.settings.tokenPronunciation', { defaultValue: 'نطق الرقم' })}
                                            </label>
                                            <div className="flex flex-col gap-1.5">
                                                {TOKEN_PRONUNCIATIONS.map((p) => (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => { setTokenPronunciation(p); setConfigTouched(true); }}
                                                        aria-pressed={tokenPronunciation === p}
                                                        className={`rounded-xl border px-3 py-1.5 text-xs font-black text-start transition ${
                                                            tokenPronunciation === p
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                                                        }`}
                                                    >
                                                        {p === 'auto' ? (isArabic ? 'تلقائي' : 'Auto') : p === 'natural' ? (isArabic ? 'طبيعي' : 'Natural') : (isArabic ? 'رقمًا رقمًا' : 'Digits')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                            <label className="block text-xs font-black text-slate-800 dark:text-slate-100 mb-2">
                                                {t('control.settings.announcementStyle', { defaultValue: 'صيغة النداء' })}
                                            </label>
                                            <div className="flex flex-col gap-1.5">
                                                {ANNOUNCEMENT_STYLES.map((style) => (
                                                    <button
                                                        key={style}
                                                        type="button"
                                                        onClick={() => { setAnnouncementStyle(style); setConfigTouched(true); }}
                                                        aria-pressed={announcementStyle === style}
                                                        className={`rounded-xl border px-3 py-1.5 text-xs font-black text-start transition ${
                                                            announcementStyle === style
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                                                        }`}
                                                    >
                                                        {style === 'formal' ? (isArabic ? 'رسمي متزن' : 'Formal') : style === 'calm' ? (isArabic ? 'هادئ ومطمئن' : 'Calm & Soothing') : (isArabic ? 'سريع ومختصر' : 'Short')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═══ TAB 2: AUDIO & CHIME STUDIO ═══ */}
                            {showAudio && (
                                <div className="space-y-4">
                                    {/* Chime Synthesizer Studio */}
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                    {isArabic ? 'نغمة تنبيه الصالة (Audio Chime)' : 'Lounge Chime Melodies'}
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {isArabic ? 'اختر النغمة الموسيقية التي تسبق نطق اسم ورقم المريض على الشاشة.' : 'Select the melodic chime that introduces patient calling.'}
                                                </p>
                                            </div>
                                            <Music size={16} className="text-teal-600" />
                                        </div>
                                        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                                            {CHIME_TYPES.map((chime) => {
                                                const isActive = selectedChime === chime.id;
                                                return (
                                                    <div
                                                        key={chime.id}
                                                        className={`flex items-center justify-between rounded-2xl border p-3.5 transition ${
                                                            isActive
                                                                ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20 dark:border-teal-600 dark:bg-teal-950/40'
                                                                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        <div className="min-w-0 flex-1 pe-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setSelectedChime(chime.id); setConfigTouched(true); }}
                                                                    className="text-xs font-black text-slate-900 dark:text-white hover:text-teal-600 text-start"
                                                                >
                                                                    {isArabic ? chime.labelAr : chime.labelEn}
                                                                </button>
                                                                {isActive && (
                                                                    <span className="h-2 w-2 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
                                                                )}
                                                            </div>
                                                            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                                {isArabic ? chime.descAr : ''}
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => playSynthesizedChime(chime.id)}
                                                            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-700 transition hover:bg-teal-500 hover:text-white dark:text-teal-300"
                                                            title={isArabic ? 'معاينة النغمة' : 'Audition chime'}
                                                        >
                                                            <Play size={13} className="fill-current" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Announcement Presets */}
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                    {t('control.settings.presets', { defaultValue: 'القوالب الجاهزة' })}
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {isArabic ? 'اختر قالباً يضبط السرعة، التكرار، والأسلوب بلمسة واحدة.' : 'Apply fine-tuned voice defaults with one click.'}
                                                </p>
                                            </div>
                                            <Sparkles size={16} className="text-teal-600" />
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {Object.keys(PRESET_LABELS).map((preset) => {
                                                const isActive = announcementPreset === preset;
                                                return (
                                                    <button
                                                        key={preset}
                                                        type="button"
                                                        onClick={() => handleApplyPreset(preset)}
                                                        aria-pressed={isActive}
                                                        className={`flex items-center justify-center gap-1.5 rounded-2xl border p-3 text-xs font-black transition ${
                                                            isActive
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 ring-2 ring-teal-500/20 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                                                        }`}
                                                    >
                                                        <Sparkles size={13} />
                                                        <span>{t(`control.settings.preset.${preset}`, { defaultValue: isArabic ? PRESET_LABELS[preset][0] : PRESET_LABELS[preset][1] })}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Audio Tuning Sliders / Steppers */}
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3">
                                            {t('control.settings.announcementTuning', { defaultValue: 'ضبط الصوت والنطق' })}
                                        </h3>
                                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                                                    {t('control.settings.speed', { defaultValue: 'السرعة' })}
                                                </label>
                                                <div className="flex gap-1">
                                                    {ANNOUNCEMENT_RATES.map((rate) => (
                                                        <button
                                                            key={rate}
                                                            type="button"
                                                            onClick={() => { setAnnouncementRate(rate); setConfigTouched(true); }}
                                                            aria-pressed={announcementRate === rate}
                                                            className={`flex-1 rounded-xl border py-1.5 text-xs font-black transition ${
                                                                announcementRate === rate
                                                                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'
                                                            }`}
                                                        >
                                                            {`${rate}x`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                                                    {t('control.settings.repeats', { defaultValue: 'التكرار' })}
                                                </label>
                                                <div className="flex gap-1">
                                                    {ANNOUNCEMENT_REPEATS.map((count) => (
                                                        <button
                                                            key={count}
                                                            type="button"
                                                            onClick={() => { setAnnouncementRepeatCount(count); setConfigTouched(true); }}
                                                            aria-pressed={announcementRepeatCount === count}
                                                            className={`flex-1 rounded-xl border py-1.5 text-xs font-black transition ${
                                                                announcementRepeatCount === count
                                                                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                    : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'
                                                            }`}
                                                        >
                                                            {`${count}x`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                                                    {t('control.settings.delay', { defaultValue: 'الفاصل' })}
                                                </label>
                                                <div className="flex gap-1">
                                                    {ANNOUNCEMENT_DELAYS.map((delay) => (
                                                        <button
                                                            key={delay}
                                                            type="button"
                                                            onClick={() => { setAnnouncementRepeatDelay(delay); setConfigTouched(true); }}
                                                            aria-pressed={announcementRepeatDelay === delay}
                                                            className={`flex-1 rounded-xl border py-1.5 text-xs font-black transition ${
                                                                announcementRepeatDelay === delay
                                                                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                    : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'
                                                            }`}
                                                        >
                                                            {`${delay / 1000}s`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                                                    {t('control.settings.volume', { defaultValue: 'المستوى' })}
                                                </label>
                                                <div className="flex gap-1">
                                                    {ANNOUNCEMENT_VOLUMES.map((vol) => (
                                                        <button
                                                            key={vol}
                                                            type="button"
                                                            onClick={() => { setAnnouncementVolume(vol); setConfigTouched(true); }}
                                                            aria-pressed={announcementVolume === vol}
                                                            className={`flex-1 rounded-xl border py-1.5 text-xs font-black transition ${
                                                                announcementVolume === vol
                                                                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                    : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'
                                                            }`}
                                                        >
                                                            {`${Math.round(vol * 100)}%`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Language & Voice Engines */}
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                                                {t('control.settings.announcementLanguage', { defaultValue: 'لغة النداء' })}
                                            </label>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                {ANNOUNCEMENT_LANGUAGES.map((lang) => (
                                                    <button
                                                        key={lang}
                                                        type="button"
                                                        onClick={() => { setAnnouncementLanguage(lang); setConfigTouched(true); }}
                                                        aria-pressed={announcementLanguage === lang}
                                                        className={`rounded-xl border p-2.5 text-xs font-black transition ${
                                                            announcementLanguage === lang
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        {lang === 'ar' ? 'العربية' : lang === 'en' ? 'English' : lang === 'ar_then_en' ? (isArabic ? 'عربي ثم إنجليزي' : 'Ar then En') : (isArabic ? 'إنجليزي ثم عربي' : 'En then Ar')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {availableVoices.length > 0 && (
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                        {t('control.settings.arabicVoice', { defaultValue: 'محرك الصوت العربي' })}
                                                    </label>
                                                    <select
                                                        value={arabicVoiceURI}
                                                        onChange={(e) => { setArabicVoiceURI(e.target.value); setConfigTouched(true); }}
                                                        disabled={isSavingConfig}
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                                    >
                                                        <option value="">{isArabic ? 'تلقائي (الأفضل للنظام)' : 'Auto (System Best)'}</option>
                                                        {availableVoices.filter((v) => v.lang.toLowerCase().startsWith('ar')).map((v) => (
                                                            <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                        {t('control.settings.englishVoice', { defaultValue: 'محرك الصوت الإنجليزي' })}
                                                    </label>
                                                    <select
                                                        value={englishVoiceURI}
                                                        onChange={(e) => { setEnglishVoiceURI(e.target.value); setConfigTouched(true); }}
                                                        disabled={isSavingConfig}
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                                    >
                                                        <option value="">{isArabic ? 'تلقائي (الأفضل للنظام)' : 'Auto (System Best)'}</option>
                                                        {availableVoices.filter((v) => v.lang.toLowerCase().startsWith('en')).map((v) => (
                                                            <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        {/* Advanced Template & Dictionary */}
                                        <div className="grid gap-3 pt-2">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                    {t('control.settings.customTemplate', { defaultValue: 'قالب النداء المخصص (اختياري)' })}
                                                </label>
                                                <Input
                                                    placeholder={isArabic ? '{اللقب} {المريض}، الدور {الرقم}، جناح {الغرفة}' : '{title} {patient}, token {token}, room {room}'}
                                                    value={customTemplate}
                                                    disabled={isSavingConfig}
                                                    onChange={(e) => { setCustomTemplate(e.target.value); setConfigTouched(true); }}
                                                    maxLength={500}
                                                    containerClassName="w-full"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                    {t('control.settings.pronunciationDictionary', { defaultValue: 'قاموس تصحيح النطق (كلمة=نطق)' })}
                                                </label>
                                                <textarea
                                                    value={pronunciationDictionary}
                                                    onChange={(e) => { setPronunciationDictionary(e.target.value); setConfigTouched(true); }}
                                                    maxLength={2000}
                                                    rows={2}
                                                    placeholder={isArabic ? 'مثال: فيارا=فيارا' : 'Example: VIARA=فيارا'}
                                                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═══ TAB 3: SCREEN & HARDWARE DISPLAY ═══ */}
                            {showDisplay && (
                                <div className="space-y-4">
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 space-y-4">
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                                    {t('control.settings.boardTitle', { defaultValue: 'عنوان الشاشة (اختياري)' })}
                                                </label>
                                                <Input
                                                    placeholder={t('control.settings.boardTitlePlaceholder', { defaultValue: 'مثال: مركز فيارا — صالة الأشعة' })}
                                                    value={boardTitle}
                                                    disabled={isSavingConfig}
                                                    onChange={(e) => touchConfig(setBoardTitle)(e.target.value)}
                                                    maxLength={150}
                                                    containerClassName="w-full"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                                    {t('control.settings.displayLanguage', { defaultValue: 'لغة الواجهة' })}
                                                </label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDisplayLanguage('ar'); setConfigTouched(true); }}
                                                        aria-pressed={displayLanguage === 'ar'}
                                                        className={`flex-1 rounded-xl border py-2 text-xs font-black transition ${
                                                            displayLanguage === 'ar'
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        العربية
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setDisplayLanguage('en'); setConfigTouched(true); }}
                                                        aria-pressed={displayLanguage === 'en'}
                                                        className={`flex-1 rounded-xl border py-2 text-xs font-black transition ${
                                                            displayLanguage === 'en'
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        English
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                                    {t('control.settings.motionMode', { defaultValue: 'حركة الشاشة والتأثيرات' })}
                                                </label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setMotionMode('full'); setConfigTouched(true); }}
                                                        aria-pressed={motionMode === 'full'}
                                                        className={`flex-1 rounded-xl border py-2 text-xs font-black transition ${
                                                            motionMode === 'full'
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        {t('control.settings.motionFull', { defaultValue: 'كاملة' })}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setMotionMode('reduced'); setConfigTouched(true); }}
                                                        aria-pressed={motionMode === 'reduced'}
                                                        className={`flex-1 rounded-xl border py-2 text-xs font-black transition ${
                                                            motionMode === 'reduced'
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        {t('control.settings.motionReduced', { defaultValue: 'مقلصة' })}
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                                    {t('control.settings.rotationSpeed', { defaultValue: 'سرعة تدوير الأجنحة' })}
                                                </label>
                                                <div className="flex gap-2">
                                                    {ROTATION_SPEEDS.map((speed) => (
                                                        <button
                                                            key={speed}
                                                            type="button"
                                                            onClick={() => { setRotationSpeed(speed); setConfigTouched(true); }}
                                                            aria-pressed={rotationSpeed === speed}
                                                            className={`flex-1 rounded-xl border py-2 text-xs font-black transition ${
                                                                rotationSpeed === speed
                                                                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'
                                                            }`}
                                                        >
                                                            {`${speed / 1000}s`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="border-t border-slate-100 pt-3 dark:border-slate-800 flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => { setShowSummaryStats(!showSummaryStats); setConfigTouched(true); }}
                                                aria-pressed={showSummaryStats}
                                                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black transition ${
                                                    showSummaryStats
                                                        ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300'
                                                        : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900'
                                                }`}
                                            >
                                                <BarChart3 size={14} />
                                                {showSummaryStats
                                                    ? t('control.settings.hideStats', { defaultValue: 'إخفاء الإحصائيات' })
                                                    : t('control.settings.showStats', { defaultValue: 'إظهار الإحصائيات' })}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═══ TAB 4: ANNOUNCEMENTS MANAGER ═══ */}
                            {showAnnouncements && (
                                <div className="space-y-4">
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                    {t('control.announcements.title', { defaultValue: 'إعلانات شاشة الانتظار' })}
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {t('control.announcements.description', { defaultValue: 'تتناوب الإعلانات النشطة على الشاشة كل 10 ثوانٍ.' })}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setTemplateLibraryOpen(true)}
                                                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 text-xs font-black text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                                                >
                                                    <Bookmark size={13} />
                                                    <span>{isArabic ? 'مكتبة القوالب' : 'Templates'}</span>
                                                </button>
                                                <Button variant="primary" size="sm" onClick={openCreateForm}>
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Plus size={13} aria-hidden="true" />
                                                        {t('control.announcements.add', { defaultValue: 'إضافة إعلان' })}
                                                    </span>
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Filter & Search Bar */}
                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                                            <div className="relative min-w-[220px] flex-1">
                                                <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="text"
                                                    value={announcementSearch}
                                                    onChange={(e) => setAnnouncementSearch(e.target.value)}
                                                    placeholder={isArabic ? 'بحث في نصوص الإعلانات...' : 'Search announcements...'}
                                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pe-3 ps-8 text-xs font-medium text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                                />
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {['all', ...TONES].map((tKey) => (
                                                    <button
                                                        key={tKey}
                                                        type="button"
                                                        onClick={() => setAnnouncementFilterTone(tKey)}
                                                        className={`rounded-lg px-2.5 py-1 text-[11px] font-black transition ${
                                                            announcementFilterTone === tKey
                                                                ? 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950'
                                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                                                        }`}
                                                    >
                                                        {tKey === 'all' ? (isArabic ? 'الكل' : 'All') : (isArabic ? TONE_CONFIG[tKey].labelAr : TONE_CONFIG[tKey].labelEn)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* List of Announcements */}
                                        <div className="mt-4 space-y-2.5">
                                            {filteredAnnouncements.length === 0 && (
                                                <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-800">
                                                    <Megaphone size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                                                    <p className="text-xs font-bold text-slate-500">
                                                        {t('control.announcements.empty', { defaultValue: 'لا توجد إعلانات مطابقة' })}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={openCreateForm}
                                                        className="mt-2 inline-flex items-center gap-1 text-xs font-black text-teal-600 dark:text-teal-400"
                                                    >
                                                        <Plus size={12} /> {isArabic ? 'إضافة إعلان جديد' : 'Add New Announcement'}
                                                    </button>
                                                </div>
                                            )}

                                            <AnimatePresence initial={false}>
                                                {filteredAnnouncements.map((announcement) => {
                                                    const tone = TONE_CONFIG[announcement.tone] || TONE_CONFIG.info;
                                                    const ToneIcon = tone.icon;
                                                    return (
                                                        <motion.article
                                                            key={announcement.id}
                                                            layout
                                                            initial={{ opacity: 0, y: -6 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.96 }}
                                                            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 transition ${
                                                                announcement.isActive
                                                                    ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                                                                    : 'border-slate-200/50 bg-slate-50/50 opacity-60 dark:border-slate-800/60 dark:bg-slate-950/20'
                                                            }`}
                                                        >
                                                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                                                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${tone.chip}`}>
                                                                    <ToneIcon size={16} />
                                                                </span>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                                                                            {announcement.title}
                                                                        </h4>
                                                                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ring-1 ${tone.badge}`}>
                                                                            {isArabic ? tone.labelAr : tone.labelEn}
                                                                        </span>
                                                                        <span className="text-[10px] font-bold text-slate-400">
                                                                            #{announcement.displayOrder}
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-600 dark:text-slate-400">
                                                                        {announcement.message}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1.5">
                                                                {/* Order up/down buttons */}
                                                                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleReorderAnnouncement(announcement, -1)}
                                                                        title={isArabic ? 'رفع الترتيب' : 'Move up'}
                                                                        className="grid h-6 w-6 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700"
                                                                    >
                                                                        <ChevronUp size={13} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleReorderAnnouncement(announcement, 1)}
                                                                        title={isArabic ? 'خفض الترتيب' : 'Move down'}
                                                                        className="grid h-6 w-6 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700"
                                                                    >
                                                                        <ChevronDown size={13} />
                                                                    </button>
                                                                </div>

                                                                {/* Duplicate button */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDuplicateAnnouncement(announcement)}
                                                                    title={isArabic ? 'تكرار الإعلان' : 'Duplicate announcement'}
                                                                    className="grid h-7 w-7 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                                                >
                                                                    <Copy size={12} />
                                                                </button>

                                                                {/* Toggle active button */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleActive(announcement)}
                                                                    disabled={isUpdating}
                                                                    title={announcement.isActive ? t('control.announcements.deactivate', { defaultValue: 'إيقاف العرض' }) : t('control.announcements.activate', { defaultValue: 'تنشيط العرض' })}
                                                                    className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-black transition ${
                                                                        announcement.isActive
                                                                            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                                                                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                                    }`}
                                                                >
                                                                    {announcement.isActive ? (
                                                                        <>
                                                                            <EyeOff size={12} />
                                                                            <span className="hidden sm:inline">{isArabic ? 'إيقاف' : 'Pause'}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Eye size={12} />
                                                                            <span className="hidden sm:inline">{isArabic ? 'تنشيط' : 'Show'}</span>
                                                                        </>
                                                                    )}
                                                                </button>

                                                                {/* Edit button */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEditForm(announcement)}
                                                                    disabled={isFormBusy}
                                                                    title={t('control.announcements.edit', { defaultValue: 'تعديل' })}
                                                                    aria-label={t('control.announcements.edit', { defaultValue: 'تعديل' })}
                                                                    className="grid h-7 w-7 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                                                >
                                                                    <Pencil size={12} />
                                                                </button>

                                                                {/* Delete button */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDeleteTarget(announcement)}
                                                                    disabled={isDeleting}
                                                                    title={t('control.announcements.delete', { defaultValue: 'حذف' })}
                                                                    aria-label={t('control.announcements.delete', { defaultValue: 'حذف' })}
                                                                    className="grid h-7 w-7 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </motion.article>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═══ TAB 5: LIVE SIMULATOR & SANDBOX ═══ */}
                            {showSandbox && (
                                <div className="space-y-4">
                                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                    {isArabic ? 'مختبر المحاكاة والاختبار الحي' : 'Live Calling Sandbox'}
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {isArabic ? 'اختبر كيف ستبدو وتُسمع المناداة مع الإعدادات الحالية قبل تطبيقها.' : 'Simulate patient calling with current active settings.'}
                                                </p>
                                            </div>
                                            <Tv size={16} className="text-teal-600" />
                                        </div>

                                        {/* Quick Preset Test Call buttons */}
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[11px] font-bold text-slate-400 me-1">
                                                {isArabic ? 'نماذج اختبار سريعة:' : 'Quick samples:'}
                                            </span>
                                            {SAMPLE_PRESETS.map((p) => (
                                                <button
                                                    key={p.token}
                                                    type="button"
                                                    onClick={() => {
                                                        setSampleToken(p.token);
                                                        setSampleName(p.name);
                                                        setSampleRoom(p.room);
                                                        setSampleGender(p.gender);
                                                    }}
                                                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-teal-400 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                                >
                                                    {p.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                    {isArabic ? 'رقم الدور التجريبي' : 'Sample Token'}
                                                </label>
                                                <Input
                                                    value={sampleToken}
                                                    onChange={(e) => setSampleToken(e.target.value)}
                                                    containerClassName="w-full"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                    {isArabic ? 'اسم المريض' : 'Patient Name'}
                                                </label>
                                                <Input
                                                    value={sampleName}
                                                    onChange={(e) => setSampleName(e.target.value)}
                                                    containerClassName="w-full"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                    {isArabic ? 'اسم الغرفة أو الجناح' : 'Room / Suite'}
                                                </label>
                                                <Input
                                                    value={sampleRoom}
                                                    onChange={(e) => setSampleRoom(e.target.value)}
                                                    containerClassName="w-full"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                    {isArabic ? 'اللقب / الجنس' : 'Gender'}
                                                </label>
                                                <div className="flex gap-1.5 pt-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSampleGender('male')}
                                                        className={`flex-1 rounded-xl border py-2 text-xs font-bold transition ${
                                                            sampleGender === 'male'
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        {isArabic ? 'السيد (ذكر)' : 'Mr. (Male)'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSampleGender('female')}
                                                        className={`flex-1 rounded-xl border py-2 text-xs font-bold transition ${
                                                            sampleGender === 'female'
                                                                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                                                                : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'
                                                        }`}
                                                    >
                                                        {isArabic ? 'السيدة (أنثى)' : 'Ms. (Female)'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <Button variant="primary" onClick={playVoicePreview}>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Play size={13} className="fill-white" />
                                                    {isArabic ? 'تشغيل نداء تجريبي بالصوت والشاشة' : 'Execute Test Call'}
                                                </span>
                                            </Button>
                                            <button
                                                type="button"
                                                onClick={copyDisplayLink}
                                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                            >
                                                <Share2 size={13} />
                                                {isArabic ? 'نسخ رابط الشاشة للمتصفحات' : 'Copy Screen URL'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Sticky Live Monitor & Quick Info Column ── */}
                <div className="space-y-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="grid h-6 w-6 place-items-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    <MonitorPlay size={13} />
                                </span>
                                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                    {t('control.settings.previewTitle', { defaultValue: 'معاينة الشاشة' })}
                                </h4>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">
                                {isArabic ? 'محدث لحظياً' : 'Live Sync'}
                            </span>
                        </div>

                        <MiniTvSimulator
                            boardTitle={boardTitle}
                            patientDisplayMode={patientDisplayMode}
                            callAnnouncementMode={callAnnouncementMode}
                            showTicker={showTicker}
                            theme={theme}
                            announcements={announcements}
                            isArabic={isArabic}
                            sampleToken={sampleToken}
                            sampleName={sampleName}
                            sampleRoom={sampleRoom}
                            isPlayingChime={isPlayingChime}
                            aspectRatio={simulatorAspect}
                            onAspectChange={setSimulatorAspect}
                        />

                        <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                                <span className={`h-2 w-2 rounded-full ${muteAll ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                                {!muteAll ? (isArabic ? 'الصوت جاهز' : 'Audio Ready') : (isArabic ? 'الصوت مكتوم' : 'Muted')}
                            </span>
                            <span className="font-mono text-[10px]">
                                {announcementRate}x · {announcementRepeatCount}x repeats
                            </span>
                        </div>
                    </div>

                    {/* Announcement Summary Box */}
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">
                                {isArabic ? 'إحصائيات الإعلانات' : 'Announcement Metrics'}
                            </h4>
                            <Megaphone size={13} className="text-teal-600" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-center dark:border-emerald-900/50 dark:bg-emerald-950/30">
                                <p className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">{activeCount}</p>
                                <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{isArabic ? 'نشطة في الشريط' : 'Active'}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center dark:border-slate-800 dark:bg-slate-900">
                                <p className="font-mono text-xl font-black text-slate-500 dark:text-slate-400">{inactiveCount}</p>
                                <p className="text-[10px] font-bold text-slate-400">{isArabic ? 'موقوفة' : 'Paused'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Persistent Floating Save Bar (Triggered on config changes) ── */}
            <AnimatePresence>
                {configTouched && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 30 }}
                        transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                        className="fixed bottom-5 start-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-teal-500/40 bg-slate-900/95 px-5 py-3 text-white shadow-2xl backdrop-blur-md dark:border-teal-400/40 dark:bg-slate-950/95"
                    >
                        <div className="flex items-center gap-2 pe-3 border-e border-slate-700">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                            </span>
                            <span className="text-xs font-black text-amber-300">
                                {t('control.settings.unsaved', { defaultValue: 'تغييرات غير محفوظة' })}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleResetDraft}
                                disabled={isSavingConfig}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-slate-700"
                            >
                                <RotateCcw size={12} />
                                {isArabic ? 'تراجع' : 'Revert'}
                            </button>

                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSaveConfig}
                                disabled={isSavingConfig}
                                loading={isSavingConfig}
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <Save size={13} />
                                    {t('control.settings.saveChanges', { defaultValue: 'تطبيق وحفظ' })}
                                </span>
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Medical Template Library Modal ── */}
            <Modal
                isOpen={templateLibraryOpen}
                onClose={() => setTemplateLibraryOpen(false)}
                title={isArabic ? 'مكتبة القوالب الإعلانية الجاهزة للصالات' : 'Medical Announcement Templates'}
                size="lg"
            >
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pe-1">
                    {MEDICAL_TEMPLATES.map((cat) => {
                        const CatIcon = cat.icon;
                        return (
                            <div key={cat.category} className="space-y-2">
                                <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-100">
                                    <CatIcon size={14} className="text-teal-600" />
                                    <span>{isArabic ? cat.categoryAr : cat.categoryEn}</span>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {cat.templates.map((tpl) => (
                                        <div
                                            key={tpl.title}
                                            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 transition hover:border-teal-400 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                                        >
                                            <div>
                                                <h5 className="text-xs font-black text-slate-900 dark:text-white mb-1">
                                                    {tpl.title}
                                                </h5>
                                                <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                                                    {tpl.message}
                                                </p>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 dark:border-slate-800">
                                                <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ring-1 ${TONE_CONFIG[tpl.tone]?.badge}`}>
                                                    {isArabic ? TONE_CONFIG[tpl.tone]?.labelAr : TONE_CONFIG[tpl.tone]?.labelEn}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleApplyMedicalTemplate(tpl)}
                                                    className="inline-flex items-center gap-1 text-xs font-black text-teal-600 hover:text-teal-700 dark:text-teal-400"
                                                >
                                                    <span>{isArabic ? 'استخدام القالب' : 'Use Template'}</span>
                                                    <Plus size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Modal>

            {/* ── Emergency Flash Broadcast Modal ── */}
            <Modal
                isOpen={emergencyModalOpen}
                onClose={() => setEmergencyModalOpen(false)}
                title={isArabic ? '🚨 بث إشعار عاجل فوري لشاشات الانتظار' : '🚨 Urgent Lounge Broadcast'}
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        {isArabic
                            ? 'سيظهر هذا التنبيه فوراً في أعلى شريط الأخبار بجميع شاشات الصالات مع نغمة تنبيه صوتية للمنتظرين.'
                            : 'This high-priority alert will immediately display on all connected lounge displays.'}
                    </p>
                    <textarea
                        value={emergencyText}
                        onChange={(e) => setEmergencyText(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-rose-300 bg-rose-50/50 p-3 text-xs font-bold text-rose-950 outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200"
                        placeholder={isArabic ? 'اكتب نص التنبيه العاجل هنا...' : 'Type emergency broadcast message...'}
                    />
                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <Button variant="ghost" onClick={() => setEmergencyModalOpen(false)} type="button">
                            {isArabic ? 'إلغاء' : 'Cancel'}
                        </Button>
                        <button
                            type="button"
                            onClick={handleBroadcastEmergency}
                            disabled={isCreating || !emergencyText.trim()}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50 shadow-md"
                        >
                            <Flame size={13} />
                            <span>{isArabic ? 'بث التنبيه الآن' : 'Broadcast Alert'}</span>
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── Keyboard Shortcuts Modal ── */}
            <Modal
                isOpen={shortcutsModalOpen}
                onClose={() => setShortcutsModalOpen(false)}
                title={isArabic ? 'اختصارات لوحة المفاتيح السريعة' : 'Keyboard Shortcuts'}
                size="sm"
            >
                <div className="space-y-2.5 py-1">
                    {[
                        { key: 'Ctrl + S', descAr: 'حفظ جميع التعديلات فوراً', descEn: 'Save all settings instantly' },
                        { key: 'Ctrl + P', descAr: 'تشغيل نداء صوتي تجريبي', descEn: 'Execute test voice call' },
                        { key: 'Ctrl + B', descAr: 'فتح نافذة البث العاجل للصالات', descEn: 'Open emergency broadcast' },
                        { key: 'Esc', descAr: 'إغلاق النوافذ المنبثقة', descEn: 'Close active modals' },
                    ].map((s) => (
                        <div key={s.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold dark:border-slate-800 dark:bg-slate-900">
                            <span className="text-slate-700 dark:text-slate-300">{isArabic ? s.descAr : s.descEn}</span>
                            <kbd className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10.5px] font-black text-slate-800 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {s.key}
                            </kbd>
                        </div>
                    ))}
                </div>
            </Modal>

            {/* ── Lounge TV Connect & Direct Cast Hub Modal ── */}
            <Modal
                isOpen={qrModalOpen}
                onClose={() => setQrModalOpen(false)}
                title={isArabic ? 'مركز بث وتوصيل شاشات الصالات والتلفزيون' : 'Lounge TV Connect & Direct Cast Hub'}
                size="lg"
            >
                <div className="space-y-4">
                    {/* Navigation Pills */}
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-950">
                        <button
                            type="button"
                            onClick={() => setTvConnectTab('cable')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
                                tvConnectTab === 'cable'
                                    ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Monitor size={14} />
                            <span>{isArabic ? 'كيبل HDMI / شاشة ثانية' : 'HDMI / Cable'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setTvConnectTab('wireless')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
                                tvConnectTab === 'wireless'
                                    ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Cast size={14} />
                            <span>{isArabic ? 'بث لاسلكي Smart TV' : 'Wireless Cast'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setTvConnectTab('browser')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
                                tvConnectTab === 'browser'
                                    ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <QrCode size={14} />
                            <span>{isArabic ? 'متصفح التلفاز و QR' : 'TV Browser & QR'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setTvConnectTab('kiosk')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
                                tvConnectTab === 'kiosk'
                                    ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Tv size={14} />
                            <span>{isArabic ? 'أجهزة TV Stick / Box' : 'Kiosk TV Box'}</span>
                        </button>
                    </div>

                    {/* Content for TAB 1: CABLE (HDMI / Secondary Screen) */}
                    {tvConnectTab === 'cable' && (
                        <div className="space-y-3.5">
                            <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-900/50 dark:bg-teal-950/30">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <h4 className="text-xs font-black text-teal-950 dark:text-teal-100 flex items-center gap-1.5">
                                            <Monitor size={15} className="text-teal-600 dark:text-teal-400" />
                                            {isArabic ? 'نافذة تلفاز خارجية مستقلة (Clean TV Window)' : 'Independent TV Pop-out Window'}
                                        </h4>
                                        <p className="text-[11px] text-teal-800 dark:text-teal-300">
                                            {isArabic
                                                ? 'تفتح شاشة العرض في نافذة مخصصة خالية من أشرطة المتصفح لتنقلها مباشرة لشاشة الصالة.'
                                                : 'Launches a dedicated distraction-free window ready for your waiting hall display.'}
                                        </p>
                                    </div>
                                    <Button variant="primary" size="sm" onClick={openExternalMonitor}>
                                        <span className="inline-flex items-center gap-1.5">
                                            <ExternalLink size={13} />
                                            {isArabic ? 'فتح نافذة الشاشة الخارجية' : 'Launch TV Window'}
                                        </span>
                                    </Button>
                                </div>
                            </div>

                            {/* 3 Step Guide */}
                            <div className="space-y-2">
                                <h5 className="text-xs font-black text-slate-800 dark:text-slate-200">
                                    {isArabic ? 'طريقة إعداد الشاشة السلكية بكيبل HDMI:' : 'HDMI Dual-Screen Setup Steps:'}
                                </h5>
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] dark:border-slate-800 dark:bg-slate-900">
                                        <span className="inline-block rounded-md bg-teal-600 px-1.5 py-0.5 text-[9.5px] font-black text-white mb-1.5">1</span>
                                        <p className="font-bold text-slate-800 dark:text-slate-100 mb-0.5">{isArabic ? 'توصيل الكيبل' : 'Plug Cable'}</p>
                                        <p className="text-slate-500 dark:text-slate-400">{isArabic ? 'وصّل كيبل HDMI بين كمبيوتر الاستقبال وشاشة الصالة.' : 'Connect HDMI cable from reception PC to lounge TV.'}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] dark:border-slate-800 dark:bg-slate-900">
                                        <span className="inline-block rounded-md bg-teal-600 px-1.5 py-0.5 text-[9.5px] font-black text-white mb-1.5">2</span>
                                        <p className="font-bold text-slate-800 dark:text-slate-100 mb-0.5">{isArabic ? 'توسيع العرض (Win + P)' : 'Extend Mode (Win+P)'}</p>
                                        <p className="text-slate-500 dark:text-slate-400">{isArabic ? 'اضغط Win + P في لوحة المفاتيح واختر Extend لتظل شاشتك حرة.' : 'Press Win+P and select Extend to keep your primary screen free.'}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] dark:border-slate-800 dark:bg-slate-900">
                                        <span className="inline-block rounded-md bg-teal-600 px-1.5 py-0.5 text-[9.5px] font-black text-white mb-1.5">3</span>
                                        <p className="font-bold text-slate-800 dark:text-slate-100 mb-0.5">{isArabic ? 'سحب وملء الشاشة (F11)' : 'Move & F11'}</p>
                                        <p className="text-slate-500 dark:text-slate-400">{isArabic ? 'اسحب النافذة لشاشة التلفاز واضغط F11 لتصبح بملء الشاشة.' : 'Drag window to external TV and press F11 for fullscreen.'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Content for TAB 2: WIRELESS (Smart TV & Miracast) */}
                    {tvConnectTab === 'wireless' && (
                        <div className="space-y-3.5">
                            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <h4 className="text-xs font-black text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5">
                                            <Cast size={15} className="text-indigo-600 dark:text-indigo-400" />
                                            {isArabic ? 'بث الشاشة اللاسلكي المباشر (Direct Cast)' : 'Wireless Screen Casting'}
                                        </h4>
                                        <p className="text-[11px] text-indigo-800 dark:text-indigo-300">
                                            {isArabic
                                                ? 'بث فوري لأجهزة Google Cast و Smart TV و Android TV المتصلة بنفس شبكة الواي فاي.'
                                                : 'Stream wirelessly to Google Cast, Smart TVs and Android TV on the same Wi-Fi network.'}
                                        </p>
                                    </div>
                                    <Button variant="primary" size="sm" onClick={startWirelessCast}>
                                        <span className="inline-flex items-center gap-1.5">
                                            <Cast size={13} />
                                            {isArabic ? 'بدء البث اللاسلكي' : 'Start Wireless Cast'}
                                        </span>
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center gap-2 mb-2 font-black text-slate-800 dark:text-slate-100">
                                    <Sparkles size={14} className="text-amber-500" />
                                    <span>{isArabic ? 'طريقة البث اللاسلكي السريعة في نظام ويندوز (Miracast / Smart View):' : 'Windows Quick Wireless Cast (Miracast):'}</span>
                                </div>
                                <ol className="space-y-1.5 text-[11.5px] text-slate-600 dark:text-slate-300 list-decimal list-inside">
                                    <li>{isArabic ? 'تأكد من اتصال كمبيوتر الاستقبال والشاشة الذكية بنفس شبكة الواي فاي (Wi-Fi).' : 'Ensure PC and Smart TV are connected to the same Wi-Fi.'}</li>
                                    <li>
                                        {isArabic ? 'اضغط على مفتاحي' : 'Press'} <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-black bg-white dark:bg-slate-800">Win + K</kbd> {isArabic ? 'في لوحة المفاتيح لفتح قائمة الشاشات اللاسلكية (Cast).' : 'on your keyboard to open the Cast panel.'}
                                    </li>
                                    <li>{isArabic ? 'اختر اسم التلفاز الذكي (Samsung, LG, Sony...) وسيتصل به فوراً كشاشة عرض لاسلكية.' : 'Select your Smart TV name and it will connect wirelessly.'}</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {/* Content for TAB 3: BROWSER & QR */}
                    {tvConnectTab === 'browser' && (
                        <div className="flex flex-col items-center text-center space-y-3 py-1">
                            <div className="rounded-2xl border border-teal-200 bg-white p-3 shadow-md dark:border-slate-700 dark:bg-slate-900">
                                <QRCodeSVG
                                    value={publicDisplayUrl}
                                    size={160}
                                    level="M"
                                    includeMargin
                                    className="rounded-lg"
                                />
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-black text-slate-900 dark:text-white">
                                    {isArabic ? 'امسح الرمز أو افتح المتصفح في التلفزيون الذكي' : 'Scan with TV camera or open TV web browser'}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                    {publicDisplayUrl}
                                </p>
                            </div>
                            <div className="flex gap-2 w-full max-w-sm pt-1">
                                <button
                                    type="button"
                                    onClick={copyDisplayLink}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                    <Copy size={13} />
                                    {isArabic ? 'نسخ الرابط' : 'Copy Link'}
                                </button>
                                <a
                                    href="/display"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2 text-xs font-black text-white hover:bg-teal-700"
                                >
                                    <ExternalLink size={13} />
                                    {isArabic ? 'فتح في تبويب' : 'Open Tab'}
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Content for TAB 4: KIOSK & TV STICK */}
                    {tvConnectTab === 'kiosk' && (
                        <div className="space-y-3 text-xs">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                                <h4 className="font-black text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                                    <Tv size={15} className="text-teal-600" />
                                    {isArabic ? 'الحل الأكثر استقراراً للمراكز الطبية والمستشفيات:' : 'Most Recommended Production Setup for Clinics:'}
                                </h4>
                                <p className="text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                                    {isArabic
                                        ? 'يُنصح بتثبيت جهاز عرض صغير خلف شاشة الصالة مثل (Xiaomi TV Stick / Android TV Box / FireStick / Intel NUC) متصل بكيبل HDMI وشبكة المركز.'
                                        : 'Attach a small media stick (Xiaomi TV Stick, FireStick, or Mini PC) behind the lounge TV connected to HDMI and clinic Wi-Fi.'}
                                </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                    <p className="font-black text-emerald-800 dark:text-emerald-200 mb-0.5">{isArabic ? '⚡ منع سكون الشاشة التلقائي (Wake Lock)' : '⚡ Automatic Wake Lock'}</p>
                                    <p className="text-emerald-700 dark:text-emerald-300">{isArabic ? 'النظام مبرمج تلقائياً لمنع إغلاق الشاشة أو تفعيل وضع التوفير أثناء الدوام.' : 'The display board automatically prevents TV sleep and screen savers.'}</p>
                                </div>
                                <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900/40 dark:bg-teal-950/20">
                                    <p className="font-black text-teal-800 dark:text-teal-200 mb-0.5">{isArabic ? '🔄 استئناف تلقائي عند انقطاع الشبكة' : '🔄 Auto Reconnect'}</p>
                                    <p className="text-teal-700 dark:text-teal-300">{isArabic ? 'شاشة العرض تعيد الاتصال والمزامنة تلقائياً في حال انقطاع الشبكة وعودتها.' : 'The board auto-reconnects and resyncs if network drops.'}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* ── Add / Edit Announcement Modal ── */}
            <Modal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                title={editingId ? t('control.form.editTitle', { defaultValue: 'تعديل الإعلان' }) : t('control.form.addTitle', { defaultValue: 'إعلان جديد' })}
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
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="ds-field-label block text-sm font-semibold" htmlFor="announcement-message">
                                {t('control.form.message', { defaultValue: 'نص الإعلان' })}
                            </label>
                            <button
                                type="button"
                                onClick={() => { setFormOpen(false); setTemplateLibraryOpen(true); }}
                                className="inline-flex items-center gap-1 text-[11px] font-black text-teal-600 hover:text-teal-700 dark:text-teal-400"
                            >
                                <Bookmark size={11} />
                                <span>{isArabic ? 'اختيار من مكتبة القوالب' : 'Pick Template'}</span>
                            </button>
                        </div>
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
                            {editingId ? t('control.form.update', { defaultValue: 'حفظ التعديلات' }) : t('control.form.create', { defaultValue: 'إضافة الإعلان' })}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* ── Delete Confirmation Dialog ── */}
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
