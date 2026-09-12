import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
    Activity,
    Clock3,
    DoorOpen,
    Maximize,
    Megaphone,
    Minimize,
    MonitorPlay,
    Phone,
    Radio,
    Users,
    Volume2,
    VolumeX,
    Shield,
    Sparkles,
    Filter,
    QrCode,
    Check,
    Bell,
    PhoneCall,
    ChevronLeft,
    ChevronRight,
    Play,
    UserCheck,
    Hash,
    ShieldAlert,
    Droplets,
    Magnet,
    Zap,
    Timer,
    CheckCircle2,
    Stethoscope,
    Settings2,
} from 'lucide-react';
import { useGetDisplayBoardQuery, useBroadcastPatientCallMutation } from '../store/api';
import { announcePatientCall, testHospitalAnnouncement, getSpokenToken } from '../utils/speechAnnouncement';
import { playHospitalChime } from '../utils/audioChime';
import { getPatientPortalHomeUrl } from '../utils/portalUrls';
import { VIARA_BRAND } from '../config/brand';

const POLL_INTERVAL_MS = 6000;
const CLOCK_TICK_MS = 1000;
const ANNOUNCEMENT_ROTATE_MS = 10000;
const TICKER_ROTATE_MS = 7000;
const ROOM_PAGE_ROTATE_MS = 15000;
const ROOMS_PER_PAGE = 3;
const EASE = [0.16, 1, 0.3, 1];

const formatTimeOfDay = (date, locale) =>
    date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const formatFullDate = (date, locale) =>
    date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
const getCallIdentity = (item) => item?.order_number || item?.patient_name || item?.queue_number;

const CLINICAL_PREP_TIPS = [
    {
        categoryAr: 'بروتوكول الرنين المغناطيسي',
        categoryEn: 'MRI Safety Protocol',
        titleAr: 'تعليمات هامة قبل فحص الرنين المغناطيسي',
        titleEn: 'Important MRI Instructions',
        messageAr: 'يرجى إزالة كافة المتعلقات المعدنية، الساعات، المجوهرات، والبطاقات البنكية. أبلغ الفني فوراً بأي منظم لضربات القلب أو دعامات جراحية أو شرائح معدنية.',
        messageEn: 'Remove all metal items, jewelry, and bank cards. Immediately notify the technologist of any pacemakers, surgical implants, or metal clips.',
        icon: Magnet,
        gradient: 'from-teal-600/20 via-teal-500/5 to-transparent',
        accent: 'teal',
    },
    {
        categoryAr: 'الأشعة المقطعية بالصبغة',
        categoryEn: 'Contrast CT Protocol',
        titleAr: 'تعليمات الصيام لفحص CT بالصبغة الوريدية',
        titleEn: 'CT Contrast Preparation',
        messageAr: 'الصيام التام 4 إلى 6 ساعات قبل الفحص. أحضر نتيجة تحليل وظائف الكلى (Creatinine) حديثة. اشرب كميات وفيرة من الماء بعد الفحص.',
        messageEn: 'Strict fasting for 4-6 hours before the scan. Bring a recent serum creatinine test. Hydrate generously after the procedure.',
        icon: ShieldAlert,
        gradient: 'from-amber-600/20 via-amber-500/5 to-transparent',
        accent: 'amber',
    },
    {
        categoryAr: 'إرشادات السونار',
        categoryEn: 'Ultrasound Guidance',
        titleAr: 'التحضير لفحص الموجات فوق الصوتية',
        titleEn: 'Ultrasound Preparation',
        messageAr: 'فحص البطن: صيام 6 ساعات عن الأطعمة الدسمة. فحص الحوض والمثانة: اشرب 4 إلى 6 أكواب ماء قبل الفحص بساعة وامتنع عن التبول.',
        messageEn: 'Abdominal: fast 6 hrs. Pelvic/bladder: drink 4-6 glasses of water 1 hour before and do not void.',
        icon: Droplets,
        gradient: 'from-cyan-600/20 via-cyan-500/5 to-transparent',
        accent: 'cyan',
    },
    {
        categoryAr: 'بوابة نتائجك الرقمية',
        categoryEn: 'Digital Results Portal',
        titleAr: 'استلام تقريرك وصور الأشعة فوراً عبر هاتفك',
        titleEn: 'Access Reports Instantly on Your Phone',
        messageAr: 'امسح رمز QR بهاتفك لتحميل صور DICOM والتقرير الطبي المعتمد فور توقيعه، دون أي انتظار إضافي.',
        messageEn: 'Scan the QR code to instantly download DICOM images and your certified diagnostic report without waiting.',
        icon: QrCode,
        gradient: 'from-emerald-600/20 via-emerald-500/5 to-transparent',
        accent: 'emerald',
    },
];

const PUBLIC_NOTICES = [
    {
        ar: 'يرجى تجهيز بطاقة الرقم القومي أو رقم الحجز قبل التوجه إلى الاستقبال.',
        en: 'Please have your national ID or booking number ready before visiting reception.',
        labelAr: 'الاستقبال',
        labelEn: 'Reception',
        accent: 'cyan',
    },
    {
        ar: 'أبلغ فني الأشعة قبل الفحص عن أي دعامات معدنية أو حساسية معروفة للصبغة.',
        en: 'Tell the technologist about metal implants or known contrast allergies before your scan.',
        labelAr: 'سلامتك أولاً',
        labelEn: 'Safety first',
        accent: 'amber',
    },
    {
        ar: 'يرجى متابعة رقم الدور على الشاشة والاستعداد عند ظهور اسم الغرفة أو الجهاز.',
        en: 'Follow your token on screen and be ready when your room or machine appears.',
        labelAr: 'متابعة الدور',
        labelEn: 'Queue update',
        accent: 'teal',
    },
    {
        ar: 'نرجو المحافظة على الهدوء وترك ممرات الحركة متاحة داخل صالة الانتظار.',
        en: 'Please keep the waiting area quiet and leave its walkways clear.',
        labelAr: 'راحة الجميع',
        labelEn: 'Patient comfort',
        accent: 'violet',
    },
];

const splitGuidanceMessage = (message = '') => message
    .split(/[.!؟]+/)
    .map((part) => part.trim())
    .filter(Boolean);

// Animated audio wave bars
const AudioWaveEqualizer = ({ isPlaying }) => (
    <div className="flex items-end gap-[2px] h-4">
        {[0.5, 1, 0.7, 0.9, 0.4].map((scale, i) => (
            <motion.span
                key={i}
                animate={isPlaying
                    ? { height: ['2px', `${scale * 14}px`, '2px'] }
                    : { height: '2px' }
                }
                transition={{ repeat: Infinity, duration: 0.5 + i * 0.08, ease: 'easeInOut' }}
                className="w-[2px] rounded-full bg-cyan-400"
            />
        ))}
    </div>
);

// Particle dot for decorative radial background
const GlowDot = ({ className }) => (
    <div className={`pointer-events-none absolute rounded-full blur-3xl opacity-60 ${className}`} />
);

// Scan line animation for premium TV feel
const ScanLine = () => (
    <motion.div
        className="pointer-events-none absolute inset-x-0 z-50 h-[1px] bg-gradient-to-r from-transparent via-teal-400/20 to-transparent"
        animate={{ top: ['0%', '100%'] }}
        transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
    />
);

// Real, scannable high-contrast QR code for the patient portal.
const HospitalPortalQr = () => (
    <div className="flex items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-black/30">
        <QRCodeSVG
            value={getPatientPortalHomeUrl()}
            size={84}
            level="M"
            bgColor="#ffffff"
            fgColor="#0f172a"
            title="Patient portal"
        />
    </div>
);

// Single KPI tile for sidebar
const KpiTile = ({ label, value, suffix = '', color = 'text-white', icon: Icon }) => (
    <div className="group relative min-h-[104px] overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/90 p-3.5 shadow-lg shadow-black/10">
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-slate-600/70 to-transparent" />
        {Icon && (
            <span className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800/80 ring-1 ring-white/5 ${color}`}>
                <Icon size={16} />
            </span>
        )}
        <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className={`mt-1 font-mono text-[26px] font-black leading-none tabular-nums ${color}`}>
            {value}<span className="ms-1 text-[10px] font-bold text-slate-500">{suffix}</span>
        </p>
    </div>
);

const DisplayBoard = () => {
    const { t, i18n } = useTranslation('display');
    const [searchParams] = useSearchParams();
    const isArabic = i18n.language?.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-US';

    const [now, setNow] = useState(() => new Date());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [callByName, setCallByName] = useState(true);
    const [operationMode, setOperationMode] = useState(() => localStorage.getItem('viara_tv_op_mode') || 'auto');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [privacyMode, setPrivacyMode] = useState('full');
    const [lastCalledCase, setLastCalledCase] = useState(null);

    // Auto-dismiss the floating call overlay after 20 seconds
    useEffect(() => {
        if (!lastCalledCase) return;
        const timer = setTimeout(() => {
            setLastCalledCase(null);
        }, 20000);
        return () => clearTimeout(timer);
    }, [lastCalledCase]);

    const [isRoomFilterOpen, setIsRoomFilterOpen] = useState(false);
    const [roomPageIndex, setRoomPageIndex] = useState(0);
    const [announcementIndex, setAnnouncementIndex] = useState(0);
    const [tickerIndex, setTickerIndex] = useState(0);

    const announcedKeysRef = useRef(new Set());
    const handledBroadcastIdsRef = useRef(new Set());
    const isInitialLoadRef = useRef(true);

    const [broadcastCallMutation] = useBroadcastPatientCallMutation();

    useEffect(() => {
        const requestedLanguage = searchParams.get('lang');
        if (requestedLanguage && ['ar', 'en'].includes(requestedLanguage) && !i18n.language?.startsWith(requestedLanguage)) {
            i18n.changeLanguage(requestedLanguage);
        }
    }, [i18n, searchParams]);

    const [selectedRooms, setSelectedRooms] = useState(() => {
        const urlRooms = searchParams.get('rooms');
        if (urlRooms) return urlRooms.split(',').map(r => r.trim()).filter(Boolean);
        try {
            const saved = localStorage.getItem('viara_tv_selected_rooms');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const saveRooms = (rooms) => {
        try { localStorage.setItem('viara_tv_selected_rooms', JSON.stringify(rooms)); } catch { /* TV storage can be unavailable in kiosk mode. */ }
    };

    const handleToggleRoom = (code) => {
        setSelectedRooms(prev => {
            const next = prev.includes(code) ? prev.filter(r => r !== code) : [...prev, code];
            saveRooms(next);
            return next;
        });
        setRoomPageIndex(0);
    };

    const handleClearRoomFilter = () => {
        setSelectedRooms([]);
        try { localStorage.removeItem('viara_tv_selected_rooms'); } catch { /* TV storage can be unavailable in kiosk mode. */ }
        setRoomPageIndex(0);
    };

    const handleToggleOperationMode = () => {
        const next = operationMode === 'auto' ? 'manual' : 'auto';
        setOperationMode(next);
        try { localStorage.setItem('viara_tv_op_mode', next); } catch { /* TV storage can be unavailable in kiosk mode. */ }
    };

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onFs);
        return () => document.removeEventListener('fullscreenchange', onFs);
    }, []);

    const toggleFullscreen = useCallback(() => {
        document.fullscreenElement
            ? document.exitFullscreen().catch(() => {})
            : document.documentElement.requestFullscreen().catch(() => {});
    }, []);

    const { data: board, isLoading, isFetching, isError, refetch } = useGetDisplayBoardQuery(undefined, {
        pollingInterval: POLL_INTERVAL_MS,
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });

    const center = board?.center || {};
    const centerLogo = center.logoLightUrl || center.logoUrl || VIARA_BRAND.centerLogoUrl || '/center-logo.png';
    const centerName = board?.config?.boardTitle || center.nameAr || center.name || (isArabic ? 'مركز طيبة للأشعة' : 'Tiba Scan Center');
    const centerAddress = center.addressAr || center.address || (isArabic ? 'صالة انتظار الأشعة التشخيصية' : 'Diagnostic Imaging Waiting Area');
    const summary = board?.summary || {};
    const allRooms = useMemo(() => {
        const rooms = [...(board?.rooms || [])];
        const roomLoad = (room) => (room.machines || []).reduce((total, machine) => (
            total + (machine.current ? 4 : 0) + (machine.up_next ? 2 : 0) + Number(machine.queue?.count || 0)
        ), 0);
        return rooms.sort((left, right) => {
            const loadDifference = roomLoad(right) - roomLoad(left);
            if (loadDifference !== 0) return loadDifference;
            return String(left.room_number || '').localeCompare(String(right.room_number || ''), undefined, { numeric: true });
        });
    }, [board?.rooms]);

    const displayedRooms = useMemo(() => {
        if (!selectedRooms.length) return allRooms;
        return allRooms.filter(room => {
            const code = String(room.room_number || '').replace(/^Room\s*/i, '').trim();
            return selectedRooms.includes(code) || selectedRooms.includes(room.room_number) || selectedRooms.includes(room.room_id);
        });
    }, [allRooms, selectedRooms]);

    const totalRoomPages = Math.max(1, Math.ceil(displayedRooms.length / ROOMS_PER_PAGE));
    const currentRoomsSlice = useMemo(() => {
        const start = roomPageIndex * ROOMS_PER_PAGE;
        return displayedRooms.slice(start, start + ROOMS_PER_PAGE);
    }, [displayedRooms, roomPageIndex]);

    useEffect(() => {
        if (totalRoomPages <= 1) { setRoomPageIndex(0); return; }
        const t = setInterval(() => setRoomPageIndex(c => (c + 1) % totalRoomPages), ROOM_PAGE_ROTATE_MS);
        return () => clearInterval(t);
    }, [totalRoomPages]);

    useEffect(() => {
        if (roomPageIndex >= totalRoomPages) setRoomPageIndex(0);
    }, [roomPageIndex, totalRoomPages]);

    const formattedAverageWait = useMemo(() => {
        const raw = Number(summary.averageWaitingMinutes);
        if (!Number.isFinite(raw) || raw <= 0) return '0';
        return `${Math.round(raw)}`;
    }, [summary.averageWaitingMinutes]);

    useEffect(() => {
        const mode = board?.config?.patientDisplayMode;
        if (mode === 'order_only') {
            setPrivacyMode('token_only');
            setCallByName(false);
        } else if (mode === 'name') {
            setPrivacyMode('full');
            setCallByName(true);
        }
    }, [board?.config?.patientDisplayMode]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key.toLowerCase() === 'f') toggleFullscreen();
            if (event.key.toLowerCase() === 'm') setVoiceEnabled((enabled) => !enabled);
            if (event.key === 'ArrowLeft' && totalRoomPages > 1) {
                setRoomPageIndex((current) => (current + 1) % totalRoomPages);
            }
            if (event.key === 'ArrowRight' && totalRoomPages > 1) {
                setRoomPageIndex((current) => (current - 1 + totalRoomPages) % totalRoomPages);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggleFullscreen, totalRoomPages]);

    const activeAnnouncements = useMemo(() => {
        const server = (board?.announcements || []).map(a => ({
            categoryAr: 'إعلان إداري', categoryEn: 'Notice',
            titleAr: a.title, titleEn: a.title,
            messageAr: a.message, messageEn: a.message,
            icon: Megaphone,
            gradient: 'from-violet-600/20 via-violet-500/5 to-transparent',
            accent: 'violet',
        }));
        return [...CLINICAL_PREP_TIPS, ...server];
    }, [board?.announcements]);

    const tickerNotices = useMemo(() => {
        const serverNotices = (board?.announcements || []).map((announcement) => ({
            ar: [announcement.title, announcement.message].filter(Boolean).join(' — '),
            en: [announcement.title, announcement.message].filter(Boolean).join(' — '),
            labelAr: 'إعلان المركز',
            labelEn: 'Center notice',
            accent: 'violet',
        })).filter((notice) => notice.ar);
        return [...serverNotices, ...PUBLIC_NOTICES];
    }, [board?.announcements]);

    useEffect(() => {
        if (activeAnnouncements.length <= 1) return;
        const t = setInterval(() => setAnnouncementIndex(c => (c + 1) % activeAnnouncements.length), ANNOUNCEMENT_ROTATE_MS);
        return () => clearInterval(t);
    }, [activeAnnouncements.length]);

    useEffect(() => {
        if (tickerNotices.length <= 1) return;
        const timer = setInterval(() => setTickerIndex((current) => (current + 1) % tickerNotices.length), TICKER_ROTATE_MS);
        return () => clearInterval(timer);
    }, [tickerNotices.length]);

    const parseTicketDisplay = (orderNumber) => {
        if (!orderNumber) return { short: '---', full: '' };
        const spoken = getSpokenToken(orderNumber);
        return { short: spoken ? `#${spoken}` : `#${orderNumber}`, full: String(orderNumber).replace(/^#/, '') };
    };

    const triggerPatientCall = useCallback((item, room, forceNameCall = true, broadcast = true) => {
        const tokenNumber = item?.order_number || item?.queue_number || '---';
        const rawName = item?.patient_name || '';
        const shouldCallWithName = forceNameCall && callByName && Boolean(rawName);
        const roomName = (room?.room_name || `جناح ${room?.room_number}`).replace(/Room\s+/gi, '');

        setIsSpeaking(true);
        if (voiceEnabled) {
            announcePatientCall({ tokenNumber, patientName: shouldCallWithName ? rawName : '', roomName, callByName: shouldCallWithName, isArabic, withChime: soundEnabled });
        } else if (soundEnabled) {
            playHospitalChime();
        }
        setTimeout(() => setIsSpeaking(false), 4800);
        setLastCalledCase({ tokenNumber, patientName: rawName, calledWithName: shouldCallWithName, roomName, time: new Date() });
        if (broadcast) {
            broadcastCallMutation({ orderNumber: tokenNumber, patientName: rawName, roomName, callByName: shouldCallWithName }).catch(() => {});
        }
    }, [broadcastCallMutation, callByName, isArabic, soundEnabled, voiceEnabled]);

    // Auto mode: detect new Up Next entries
    useEffect(() => {
        if (!board?.rooms || operationMode !== 'auto') return;
        if (isInitialLoadRef.current) {
            allRooms.forEach(room => {
                (room.machines || []).forEach(machine => {
                    const callIdentity = getCallIdentity(machine.up_next);
                    if (callIdentity) {
                        announcedKeysRef.current.add(`${room.room_id || room.room_number}_${callIdentity}`);
                    }
                });
            });
            isInitialLoadRef.current = false;
            return;
        }
        displayedRooms.forEach(room => {
            (room.machines || []).forEach(machine => {
                const next = machine.up_next;
                const callIdentity = getCallIdentity(next);
                if (!callIdentity) return;
                const key = `${room.room_id || room.room_number}_${callIdentity}`;
                if (!announcedKeysRef.current.has(key)) {
                    announcedKeysRef.current.add(key);
                    triggerPatientCall(next, room, callByName, false);
                }
            });
        });
    }, [allRooms, board?.rooms, callByName, displayedRooms, operationMode, triggerPatientCall]);

    // Broadcast sync: calls from Reception desk
    useEffect(() => {
        if (!board?.broadcastCalls?.length) return;
        board.broadcastCalls.forEach(call => {
            if (!call?.id || handledBroadcastIdsRef.current.has(call.id)) return;
            handledBroadcastIdsRef.current.add(call.id);
            setIsSpeaking(true);
            if (voiceEnabled) {
                announcePatientCall({ tokenNumber: call.orderNumber, patientName: call.patientName, roomName: call.roomName, callByName: call.callByName && Boolean(call.patientName), isArabic, withChime: soundEnabled });
            } else if (soundEnabled) {
                playHospitalChime();
            }
            setTimeout(() => setIsSpeaking(false), 4800);
            setLastCalledCase({ tokenNumber: call.orderNumber, patientName: call.patientName, calledWithName: call.callByName && Boolean(call.patientName), roomName: call.roomName, time: new Date(call.calledAt || Date.now()) });
        });
    }, [board?.broadcastCalls, isArabic, soundEnabled, voiceEnabled]);

    const formatPatientName = (name, orderNumber) => {
        if (!name && !orderNumber) return isArabic ? 'حالة فحص' : 'Patient';
        if (privacyMode === 'token_only') return parseTicketDisplay(orderNumber).short;
        if (privacyMode === 'masked' && name) {
            const parts = name.trim().split(/\s+/);
            return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
        }
        return name || parseTicketDisplay(orderNumber).short;
    };

    if (isLoading) {
        return (
            <div className="grid h-screen place-items-center bg-[#060a10] text-white">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <div className="h-20 w-20 rounded-3xl bg-white p-2.5 flex items-center justify-center shadow-2xl shadow-emerald-500/30 ring-2 ring-emerald-400/60">
                            <img
                                src={centerLogo}
                                alt=""
                                className="h-full w-full object-contain"
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = '/center-logo.png';
                                }}
                            />
                        </div>
                        <span className="absolute -bottom-1 -end-1 h-4 w-4 rounded-full bg-emerald-400 ring-2 ring-slate-900 animate-ping" />
                    </div>
                    <div className="text-center">
                        <p className="text-lg font-black text-white">{isArabic ? 'جاري مزامنة شاشة العرض...' : 'Synchronizing display board...'}</p>
                        <p className="text-sm text-slate-500 mt-1">{isArabic ? 'يرجى الانتظار' : 'Please wait'}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (isError && !board) {
        return (
            <div className="grid h-screen place-items-center bg-[#060a10] px-6 text-white" dir={isArabic ? 'rtl' : 'ltr'}>
                <div className="max-w-lg rounded-3xl border border-rose-500/30 bg-rose-950/20 p-8 text-center shadow-2xl">
                    <ShieldAlert size={42} className="mx-auto text-rose-400" />
                    <h1 className="mt-4 text-xl font-black">{t('states.error')}</h1>
                    <button type="button" onClick={refetch} className="mt-5 rounded-xl bg-teal-500 px-5 py-2 text-sm font-black text-slate-950">
                        {isArabic ? 'إعادة المحاولة' : 'Try again'}
                    </button>
                </div>
            </div>
        );
    }

    const currentTip = activeAnnouncements[announcementIndex] || activeAnnouncements[0];
    const TipIcon = currentTip?.icon || Megaphone;
    const guidancePoints = splitGuidanceMessage(isArabic ? currentTip?.messageAr : currentTip?.messageEn);
    const currentTickerNotice = tickerNotices[tickerIndex] || tickerNotices[0];
    const accentColors = {
        teal: 'text-teal-300 border-teal-500/40 bg-teal-500/15',
        amber: 'text-amber-300 border-amber-500/40 bg-amber-500/15',
        cyan: 'text-cyan-300 border-cyan-500/40 bg-cyan-500/15',
        emerald: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/15',
        violet: 'text-violet-300 border-violet-500/40 bg-violet-500/15',
    };
    const tipAccentCls = accentColors[currentTip?.accent] || accentColors.teal;

    return (
        <div className="relative flex h-screen min-h-[640px] flex-col overflow-hidden bg-[#050a12] text-white select-none" dir={isArabic ? 'rtl' : 'ltr'}>
            {/* ─── Ambient Background ─── */}
            <GlowDot className="h-[700px] w-[700px] bg-teal-500/[0.06] -top-60 -start-60" />
            <GlowDot className="h-[500px] w-[500px] bg-cyan-500/[0.05] -bottom-40 -end-40" />
            <GlowDot className="h-[400px] w-[400px] bg-indigo-500/[0.04] top-1/2 start-1/3 -translate-y-1/2" />
            <ScanLine />

            {/* ─── TOP HEADER BAR ─── */}
            <header className="relative z-20 flex min-h-[76px] items-center justify-between border-b border-cyan-950/80 bg-[#06101e]/95 px-6 py-2.5 shadow-xl shadow-black/20 backdrop-blur-xl">
                {/* Center Logo & Brand Identity (واضح ومميز جداً) */}
                <div className="flex items-center gap-3.5 sm:gap-4.5 min-w-0">
                    <div className="relative shrink-0">
                        {/* High-contrast crisp white badge for the green center logo */}
                        <div className="relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-white p-2 shadow-2xl shadow-emerald-950/60 ring-2 ring-emerald-400/60 transition-transform duration-300 hover:scale-105">
                            <img
                                src={centerLogo}
                                alt={centerName}
                                className="h-full w-full object-contain"
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = '/center-logo.png';
                                }}
                            />
                            <span className="absolute -top-1 -end-1 flex h-3.5 w-3.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80" />
                                <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
                            </span>
                        </div>
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-lg sm:text-xl 2xl:text-2xl font-black tracking-tight text-white leading-tight drop-shadow-sm">
                                {centerName}
                            </h1>
                            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${isFetching ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'}`}>
                                <span className={`me-1 inline-block h-1.5 w-1.5 rounded-full ${isFetching ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                                {isFetching ? (isArabic ? 'تحديث' : 'SYNC') : (isArabic ? 'بث مباشر' : 'LIVE')}
                            </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-teal-300/80 truncate max-w-md">
                            {centerAddress}
                        </p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5">
                    {/* Clock */}
                    <div className="hidden min-w-[154px] flex-col items-end rounded-xl border border-cyan-900/50 bg-slate-900/80 px-3.5 py-1.5 md:flex">
                        <span className="font-mono text-base font-black leading-tight text-teal-300 tabular-nums">
                            {formatTimeOfDay(now, locale)}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">{formatFullDate(now, locale)}</span>
                    </div>

                    {/* Operation Mode */}
                    <button
                        type="button"
                        onClick={handleToggleOperationMode}
                        title={isArabic ? 'تبديل وضع النداء الآلي' : 'Toggle automatic calling'}
                        aria-pressed={operationMode === 'auto'}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-black transition ${
                            operationMode === 'auto'
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                        }`}
                    >
                        {operationMode === 'auto' ? <Zap size={12} className="animate-pulse" /> : <Users size={12} />}
                        <span className="hidden sm:inline">{operationMode === 'auto' ? (isArabic ? 'تلقائي' : 'Auto') : (isArabic ? 'يدوي' : 'Manual')}</span>
                    </button>

                    {/* Room Filter */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsRoomFilterOpen(!isRoomFilterOpen)}
                            aria-expanded={isRoomFilterOpen}
                            aria-label={isArabic ? 'تصفية الغرف المعروضة' : 'Filter displayed rooms'}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-black transition ${
                                selectedRooms.length ? 'border-teal-500/40 bg-teal-500/10 text-teal-300' : 'border-slate-800 bg-slate-900 text-slate-400'
                            }`}
                        >
                            <Filter size={12} />
                            {isArabic ? 'الغرف' : 'Rooms'}
                            {selectedRooms.length > 0 && (
                                <span className="rounded-full bg-teal-500 text-slate-950 px-1.5 text-[9px] font-black">{selectedRooms.length}</span>
                            )}
                        </button>
                        {isRoomFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setIsRoomFilterOpen(false)} />
                                <div className="absolute end-0 top-full z-40 mt-2 w-64 rounded-2xl border border-slate-800 bg-slate-900/98 p-3 shadow-2xl backdrop-blur-xl">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                                        <span className="text-xs font-black text-white">{isArabic ? 'الغرف على هذه الشاشة:' : 'Rooms on this screen:'}</span>
                                        {selectedRooms.length > 0 && (
                                            <button type="button" onClick={handleClearRoomFilter} className="text-[10px] font-bold text-rose-400 hover:underline">
                                                {isArabic ? 'الكل' : 'Show All'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                                        {allRooms.map(room => {
                                            const code = String(room.room_number || '').replace(/^Room\s*/i, '').trim();
                                            const isChecked = selectedRooms.includes(code) || selectedRooms.includes(room.room_number);
                                            return (
                                                <button
                                                    key={room.room_id || room.room_number}
                                                    type="button"
                                                    onClick={() => handleToggleRoom(code)}
                                                    className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition ${isChecked ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30' : 'text-slate-300 hover:bg-slate-800'}`}
                                                >
                                                    <span className="truncate">{room.room_name || `جناح ${room.room_number}`}</span>
                                                    {isChecked && <Check size={13} className="text-teal-400 shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Call by name */}
                    <button
                        type="button"
                        onClick={() => setCallByName(!callByName)}
                        aria-pressed={callByName}
                        title={isArabic ? 'التبديل بين النداء بالاسم أو الرقم' : 'Switch between name and token calling'}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-black transition ${
                            callByName ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-900 text-slate-500'
                        }`}
                    >
                        <UserCheck size={12} />
                        <span className="hidden lg:inline">{callByName ? (isArabic ? 'بالاسم' : 'By Name') : (isArabic ? 'بالرقم' : 'Token Only')}</span>
                    </button>

                    {/* Voice toggle */}
                    <button
                        type="button"
                        onClick={() => setVoiceEnabled(!voiceEnabled)}
                        aria-pressed={voiceEnabled}
                        title={isArabic ? 'تشغيل أو كتم صوت النداء (M)' : 'Enable or mute announcements (M)'}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-black transition ${
                            voiceEnabled ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-500'
                        }`}
                    >
                        {voiceEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                        {voiceEnabled && <AudioWaveEqualizer isPlaying={isSpeaking} />}
                    </button>

                    {/* Speaker test */}
                    <button
                        type="button"
                        onClick={() => testHospitalAnnouncement(isArabic, callByName)}
                        className="hidden xl:flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition text-[11px] font-bold"
                    >
                        <Play size={10} className="text-teal-400" />
                        {isArabic ? 'تجربة' : 'Test'}
                    </button>

                    {/* Privacy */}
                    <button
                        type="button"
                        onClick={() => setPrivacyMode(p => p === 'full' ? 'masked' : p === 'masked' ? 'token_only' : 'full')}
                        title={isArabic ? `وضع الخصوصية: ${privacyMode === 'full' ? 'الاسم الكامل' : privacyMode === 'masked' ? 'اسم مختصر' : 'رقم الدور فقط'}` : `Privacy: ${privacyMode.replace('_', ' ')}`}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition text-[11px] font-bold flex items-center gap-1"
                    >
                        <Shield size={12} className="text-cyan-400" />
                    </button>

                    {/* Fullscreen */}
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        title={isArabic ? 'ملء الشاشة (F)' : 'Fullscreen (F)'}
                        aria-label={isArabic ? 'ملء الشاشة' : 'Fullscreen'}
                        className="p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition"
                    >
                        {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                    </button>
                </div>
            </header>

            {/* ─── FLOATING LIVE CALL OVERLAY (عائم فوق الصفحة وبأعلى درجات التميز والجاذبية) ─── */}
            <AnimatePresence>
                {lastCalledCase && (
                    <>
                        {/* Ambient Soft Spotlight behind floating call */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="pointer-events-none fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px]"
                        />

                        {/* Floating Container (Fixed & Centered Over Page Header and Grid) */}
                        <div className="pointer-events-none fixed inset-x-0 top-3 sm:top-5 z-50 flex justify-center px-3 sm:px-6">
                            <motion.div
                                initial={{ opacity: 0, y: -70, scale: 0.92 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -60, scale: 0.94 }}
                                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                                className="pointer-events-auto relative w-full max-w-5xl 2xl:max-w-6xl overflow-hidden rounded-3xl border-2 border-amber-400/90 bg-[#070c17]/95 p-1 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.9),0_0_60px_rgba(245,158,11,0.35)] backdrop-blur-2xl"
                                role="alert"
                                aria-live="assertive"
                            >
                                {/* Multi-color ambient background flare */}
                                <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-amber-500/25 via-yellow-400/15 to-emerald-400/25 blur-xl -z-10" />
                                
                                {/* Shimmer sweep line across top border */}
                                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-300 to-transparent" />

                                {/* Moving glass light sweep */}
                                <motion.div
                                    className="pointer-events-none absolute inset-y-0 w-44 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                    initial={{ x: isArabic ? 1400 : -200 }}
                                    animate={{ x: isArabic ? -200 : 1400 }}
                                    transition={{ duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 3.5 }}
                                />

                                <div className="relative flex flex-wrap items-center justify-between gap-3 sm:gap-5 rounded-[22px] bg-gradient-to-r from-amber-500/[0.08] via-slate-900/90 to-emerald-500/[0.06] p-3 sm:p-4 2xl:p-5">
                                    
                                    {/* ── SECTION 1: Beacon & Patient Info ── */}
                                    <div className="flex min-w-0 items-center gap-3.5 2xl:gap-4.5">
                                        {/* Animated Multi-ring Beacon */}
                                        <div className="relative shrink-0">
                                            <div className="absolute -inset-2 rounded-2xl bg-amber-400/30 blur-md animate-ping" />
                                            <motion.div
                                                animate={{ scale: [1, 1.08, 1], rotate: [-4, 4, -4, 4, 0] }}
                                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                                className="relative grid h-14 w-14 sm:h-16 sm:w-16 place-items-center rounded-2xl bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-slate-950 shadow-2xl shadow-amber-500/50 ring-2 ring-yellow-200/90"
                                            >
                                                <Bell size={28} strokeWidth={2.7} className="sm:hidden" />
                                                <Bell size={32} strokeWidth={2.7} className="hidden sm:block" />
                                            </motion.div>
                                            <span className="absolute -top-1 -end-1 flex h-4 w-4">
                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-90" />
                                                <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-[#070c17] bg-rose-500" />
                                            </span>
                                        </div>

                                        {/* Patient Identity & Live Status */}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.14em] text-amber-300 shadow-sm">
                                                    <Radio size={11} className={isSpeaking ? 'animate-pulse text-rose-400' : ''} />
                                                    <span>{isArabic ? 'نداء فوري نشط الآن' : 'Live Patient Call'}</span>
                                                </span>
                                                {isSpeaking && <AudioWaveEqualizer isPlaying />}
                                            </div>

                                            {lastCalledCase.calledWithName && lastCalledCase.patientName ? (
                                                <h3 className="mt-1 truncate text-xl sm:text-2xl 2xl:text-3xl font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                                                    {lastCalledCase.patientName}
                                                </h3>
                                            ) : (
                                                <p className="mt-1 text-sm sm:text-base font-extrabold text-amber-200/90">
                                                    {isArabic ? 'يرجى مراجعة رقم الدور والتفضل بالدخول' : 'Please check your token and proceed'}
                                                </p>
                                            )}

                                            <p className="hidden sm:block text-[11px] font-medium text-slate-400">
                                                {isArabic ? 'تم إطلاق التنبيه الصوتي في قاعة الانتظار' : 'Voice broadcast active in waiting hall'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* ── SECTION 2: Token / Queue Number Box ── */}
                                    <div className="flex shrink-0 items-center gap-4 sm:gap-6">
                                        <div className="h-14 w-px bg-gradient-to-b from-transparent via-amber-400/40 to-transparent hidden md:block" />

                                        {/* Massive Golden Token Capsule */}
                                        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-amber-400/50 bg-black/60 px-4 py-1.5 sm:px-6 sm:py-2 shadow-inner shadow-amber-500/10" dir="ltr">
                                            <p className="mb-0.5 flex items-center justify-center gap-1 text-[8.5px] sm:text-[9.5px] font-black uppercase tracking-[0.18em] text-amber-300/80">
                                                <Hash size={11} className="text-amber-400" />
                                                <span>{isArabic ? 'رقم الدور' : 'Token'}</span>
                                            </p>
                                            <p className="bg-gradient-to-b from-yellow-100 via-amber-300 to-amber-500 bg-clip-text font-mono text-3xl sm:text-4xl 2xl:text-5xl font-black leading-none text-transparent drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">
                                                #{getSpokenToken(lastCalledCase.tokenNumber)}
                                            </p>
                                        </div>

                                        <div className="h-14 w-px bg-gradient-to-b from-transparent via-slate-700/80 to-transparent hidden lg:block" />

                                        {/* ── SECTION 3: Destination Suite Capsule ── */}
                                        <div className="hidden min-w-[200px] items-center gap-3.5 rounded-2xl border border-teal-400/40 bg-gradient-to-r from-teal-500/15 via-emerald-500/10 to-teal-500/15 px-4 py-2.5 md:flex shadow-lg shadow-teal-950/40">
                                            <motion.span
                                                animate={{ x: isArabic ? [0, -6, 0] : [0, 6, 0] }}
                                                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                                                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-teal-400/40 bg-teal-400/20 text-teal-300 shadow-md shadow-teal-500/20"
                                            >
                                                <DoorOpen size={22} strokeWidth={2.4} />
                                            </motion.span>
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-teal-300/90">
                                                    {isArabic ? 'يرجى التوجه فوراً إلى' : 'Proceed immediately to'}
                                                </p>
                                                <p className="mt-0.5 truncate text-base sm:text-lg 2xl:text-xl font-black text-white drop-shadow-[0_0_12px_rgba(45,212,191,0.4)]">
                                                    {lastCalledCase.roomName}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Center Brand Stamp in Floating Call Card */}
                                        <div className="hidden xl:flex items-center gap-2.5 rounded-2xl bg-white/95 px-3 py-1.5 border border-emerald-400/50 shadow-md backdrop-blur-md">
                                            <img
                                                src={centerLogo}
                                                alt={centerName}
                                                className="h-9 w-9 object-contain"
                                                onError={(e) => {
                                                    e.currentTarget.onerror = null;
                                                    e.currentTarget.src = '/center-logo.png';
                                                }}
                                            />
                                            <div className="flex flex-col text-start">
                                                <span className="text-xs font-black text-slate-900 leading-tight">{centerName}</span>
                                                <span className="text-[9px] font-bold text-emerald-700">{isArabic ? 'رعاية تشخيصية متقدمة' : 'Diagnostic Imaging'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── SECTION 4: Controls ── */}
                                    <div className="ms-auto flex shrink-0 items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => triggerPatientCall({ order_number: lastCalledCase.tokenNumber, patient_name: lastCalledCase.patientName }, { room_name: lastCalledCase.roomName }, true, true)}
                                            className="inline-flex h-10 sm:h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 px-3.5 sm:px-4 text-xs font-black text-slate-950 shadow-xl shadow-amber-500/30 transition hover:brightness-110 hover:shadow-amber-500/50 active:scale-95"
                                        >
                                            <PhoneCall size={15} />
                                            <span className="hidden sm:inline">{isArabic ? 'إعادة النداء' : 'Repeat call'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLastCalledCase(null)}
                                            aria-label={isArabic ? 'إغلاق النداء' : 'Dismiss call'}
                                            className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-xl border border-slate-700/80 bg-slate-900/90 text-sm font-black text-slate-400 shadow-md transition hover:border-rose-500/50 hover:bg-rose-500/20 hover:text-rose-200 active:scale-95"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>

                                {/* Dynamic Elapsed Progress Bar */}
                                <motion.div
                                    key={lastCalledCase.time ? new Date(lastCalledCase.time).getTime() : 'call-bar'}
                                    className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400"
                                    initial={{ width: '100%' }}
                                    animate={{ width: '0%' }}
                                    transition={{ duration: 20, ease: 'linear' }}
                                />
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>

            {/* ─── MAIN TWO-COLUMN LAYOUT ─── */}
            <main className="relative z-10 grid min-h-0 flex-1 grid-cols-12 gap-4 overflow-hidden p-4 2xl:p-5">

                {/* ═══ SECTION 1: ROOMS & QUEUE (8 cols) ═══ */}
                <section className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-3xl border border-cyan-950/80 bg-slate-900/35 p-4 shadow-2xl shadow-black/20 backdrop-blur-sm lg:col-span-8 2xl:p-5">
                    {/* Section header */}
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-lg bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
                                <DoorOpen size={14} className="text-teal-400" />
                            </div>
                            <h2 className="text-sm font-black tracking-wide text-slate-200 2xl:text-base">
                                {isArabic ? 'أدوار الغرف والأجهزة' : 'Room Queue Status'}
                            </h2>
                            <span className="rounded-full bg-teal-500/10 border border-teal-500/20 px-2 py-px text-[9.5px] font-black text-teal-400">
                                {displayedRooms.length} {isArabic ? 'أجنحة' : 'Suites'}
                            </span>
                        </div>
                        {totalRoomPages > 1 && (
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    {Array.from({ length: totalRoomPages }, (_, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setRoomPageIndex(i)}
                                            className={`h-1.5 rounded-full transition-all duration-300 ${i === roomPageIndex ? 'w-5 bg-teal-400' : 'w-1.5 bg-slate-700 hover:bg-slate-600'}`}
                                        />
                                    ))}
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => setRoomPageIndex(c => (c - 1 + totalRoomPages) % totalRoomPages)} className="h-6 w-6 rounded-lg bg-slate-800 text-slate-400 hover:text-white grid place-items-center transition">
                                        <ChevronRight size={13} className="rtl:rotate-180" />
                                    </button>
                                    <button type="button" onClick={() => setRoomPageIndex(c => (c + 1) % totalRoomPages)} className="h-6 w-6 rounded-lg bg-slate-800 text-slate-400 hover:text-white grid place-items-center transition">
                                        <ChevronLeft size={13} className="rtl:rotate-180" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Room cards grid */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        {displayedRooms.length === 0 ? (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center p-10 rounded-2xl border border-dashed border-slate-800">
                                    <DoorOpen size={40} className="mx-auto mb-3 text-slate-700" />
                                    <p className="text-sm font-bold text-slate-600">{isArabic ? 'لا توجد غرف' : 'No rooms found'}</p>
                                    <button type="button" onClick={handleClearRoomFilter} className="mt-2 text-xs text-teal-400 hover:underline font-bold">
                                        {isArabic ? 'عرض الكل' : 'Show All'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={roomPageIndex}
                                    initial={{ opacity: 0, x: isArabic ? -16 : 16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: isArabic ? 16 : -16 }}
                                    transition={{ duration: 0.3, ease: EASE }}
                                    className="grid h-full auto-rows-fr gap-3 sm:grid-cols-2 sm:grid-rows-2 2xl:gap-4"
                                >
                                    {currentRoomsSlice.map((room, roomIndex) => {
                                        const machines = room.machines || [];
                                        const isActive = room.room_status === 'Active';
                                        const isWide = currentRoomsSlice.length === 1 || (currentRoomsSlice.length === 3 && roomIndex === 2);
                                        const roomSpan = currentRoomsSlice.length === 1
                                            ? 'sm:col-span-2 sm:row-span-2'
                                            : currentRoomsSlice.length === 2
                                                ? 'sm:row-span-2'
                                                : roomIndex === 2
                                                    ? 'sm:col-span-2'
                                                    : '';
                                        const cleanCode = String(room.room_number || 'RM').replace(/^Room\s*/i, '').trim();
                                        const roomName = (room.room_name || `جناح ${room.room_number}`).replace(/Room\s+/gi, '');

                                        return (
                                            <div
                                                key={room.room_id || room.room_number}
                                                className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-xl shadow-black/15 transition-all ${roomSpan} ${
                                                    isActive
                                                        ? 'border-slate-700/60 bg-slate-950/80'
                                                        : 'border-amber-900/30 bg-amber-950/15'
                                                }`}
                                            >
                                                {/* Room header strip */}
                                                <div className={`flex min-h-[58px] items-center justify-between border-b px-4 py-2.5 ${isActive ? 'border-slate-800/80 bg-slate-900/60' : 'border-amber-900/30 bg-amber-950/20'}`}>
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className={`flex h-8 min-w-[2rem] px-1.5 items-center justify-center rounded-lg font-mono text-xs font-black shrink-0 ${
                                                            isActive
                                                                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                        }`}>
                                                            {cleanCode}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h3 className="truncate text-sm font-black leading-tight text-white 2xl:text-base">{roomName}</h3>
                                                            <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400 2xl:text-[11px]">
                                                                {machines.map(m => m.machine_name).join(' • ') || (isArabic ? 'جناح فحص' : 'Exam Suite')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9.5px] font-black border ${isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                                                        {isActive ? (isArabic ? 'متاح' : 'Active') : (isArabic ? 'صيانة' : 'Standby')}
                                                    </div>
                                                </div>

                                                {/* Machine queue body */}
                                                <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
                                                    {machines.map(machine => {
                                                        const currentCase = machine.current;
                                                        const nextCase = machine.up_next || machine.queue?.next?.[0];
                                                        const queueList = machine.queue?.next || [];
                                                        const waitingCount = machine.queue?.count || 0;
                                                        const currentTicket = parseTicketDisplay(currentCase?.order_number);
                                                        const nextTicket = parseTicketDisplay(nextCase?.order_number);

                                                        return (
                                                            <div key={machine.machine_id} className={`grid min-h-0 flex-1 gap-2.5 ${isWide ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                                                                {/* NOW IN EXAM */}
                                                                <div className="relative min-h-[104px] overflow-hidden rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-500/10 via-cyan-500/[0.03] to-transparent p-3">
                                                                    <div className="pointer-events-none absolute -end-8 -top-10 h-28 w-28 rounded-full bg-teal-400/[0.06] blur-2xl" />
                                                                    <div className="flex items-center justify-between mb-1.5">
                                                                        <span className="flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-widest text-teal-400">
                                                                            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-ping" />
                                                                            {isArabic ? 'داخل الفحص' : 'In Exam'}
                                                                        </span>
                                                                        {currentCase?.elapsed_minutes != null && (
                                                                            <span className="flex items-center gap-1 text-[9px] text-teal-300/70">
                                                                                <Timer size={10} />
                                                                                {currentCase.elapsed_minutes} {isArabic ? 'د' : 'm'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {currentCase ? (
                                                                        <div className="flex items-end justify-between">
                                                                            <div className="min-w-0">
                                                                                {currentTicket.full && (
                                                                                    <span className="font-mono text-3xl font-black leading-none tracking-tight text-white 2xl:text-4xl">
                                                                                        {currentTicket.short}
                                                                                    </span>
                                                                                )}
                                                                                <bdi className="block text-xs font-bold text-teal-100/80 mt-0.5 truncate max-w-[120px]">
                                                                                    {formatPatientName(currentCase.patient_name, currentCase.order_number)}
                                                                                </bdi>
                                                                            </div>
                                                                            {currentCase.priority === 'Emergency' && (
                                                                                <span className="rounded-lg bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[9px] font-black text-rose-400">
                                                                                    {isArabic ? 'طوارئ' : 'STAT'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-xs text-slate-600 italic py-0.5">{isArabic ? 'الغرفة جاهزة' : 'Suite ready'}</p>
                                                                    )}
                                                                </div>

                                                                {/* UP NEXT */}
                                                                <div className="relative min-h-[104px] overflow-hidden rounded-xl border border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-amber-500/[0.03] to-transparent p-3">
                                                                    <div className="pointer-events-none absolute -end-8 -bottom-10 h-28 w-28 rounded-full bg-amber-400/[0.06] blur-2xl" />
                                                                    <div className="flex items-center justify-between mb-1.5">
                                                                        <span className="text-[9.5px] font-black uppercase tracking-widest text-amber-400">
                                                                            {isArabic ? 'الدور التالي' : 'Up Next'}
                                                                        </span>
                                                                        {nextCase && (
                                                                            <div className="flex items-center gap-1">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => triggerPatientCall(nextCase, room, true, true)}
                                                                                    className="flex items-center gap-0.5 rounded-lg bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-black text-amber-300 hover:bg-amber-500/30 transition active:scale-95"
                                                                                >
                                                                                    <UserCheck size={9} />
                                                                                    {isArabic ? 'نداء' : 'Call'}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => triggerPatientCall(nextCase, room, false, true)}
                                                                                    className="flex items-center gap-0.5 rounded-lg bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-white transition active:scale-95"
                                                                                >
                                                                                    <Hash size={8} />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {nextCase ? (
                                                                        <div className="flex items-end justify-between">
                                                                            <div className="min-w-0">
                                                                                {nextTicket.full && (
                                                                                    <span className="font-mono text-2xl font-black leading-none text-amber-200 2xl:text-3xl">
                                                                                        {nextTicket.short}
                                                                                    </span>
                                                                                )}
                                                                                <bdi className="block text-xs font-bold text-amber-100/70 mt-0.5 truncate max-w-[120px]">
                                                                                    {formatPatientName(nextCase.patient_name, nextCase.order_number)}
                                                                                </bdi>
                                                                            </div>
                                                                            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-lg">
                                                                                {isArabic ? 'استعد' : 'Ready'}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-xs text-slate-600 italic py-0.5">{isArabic ? 'لا توجد حالة تالية' : 'No upcoming case'}</p>
                                                                    )}
                                                                </div>

                                                                {/* WAITING QUEUE CHIPS */}
                                                                {queueList.length > 0 && (
                                                                    <div className={isWide ? 'sm:col-span-2' : ''}>
                                                                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                                                                            {isArabic ? 'قائمة الانتظار' : 'Queue'} ({waitingCount})
                                                                        </p>
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {queueList.slice(0, 5).map((item, idx) => {
                                                                                const tkt = parseTicketDisplay(item.order_number);
                                                                                return (
                                                                                    <span
                                                                                        key={idx}
                                                                                        className="inline-flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/80 px-1.5 py-0.5 font-mono text-[10px] font-black text-slate-300"
                                                                                    >
                                                                                        <span className="text-[8px] text-slate-500">#{idx + 1}</span>
                                                                                        {tkt.short}
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                            {queueList.length > 5 && (
                                                                                <span className="text-[10px] text-slate-600 font-bold self-center">+{queueList.length - 5}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </motion.div>
                            </AnimatePresence>
                        )}
                    </div>
                </section>

                {/* ═══ SECTION 2: SIDEBAR (4 cols) ═══ */}
                <aside className="col-span-12 flex min-h-0 flex-col gap-3 overflow-hidden lg:col-span-4 2xl:gap-4">

                    {/* KPI Stats */}
                    <div className="grid grid-cols-4 gap-2">
                        <KpiTile
                            label={isArabic ? 'متوسط الانتظار' : 'Avg. Wait'}
                            value={`~${formattedAverageWait}`}
                            suffix={isArabic ? 'د' : 'min'}
                            color="text-amber-400"
                            icon={Clock3}
                        />
                        <KpiTile
                            label={isArabic ? 'منجزة اليوم' : 'Done Today'}
                            value={summary.completedToday ?? 0}
                            color="text-emerald-400"
                            icon={CheckCircle2}
                        />
                        <KpiTile
                            label={isArabic ? 'قيد الفحص' : 'In Exam'}
                            value={summary.inExam ?? 0}
                            color="text-teal-400"
                            icon={Stethoscope}
                        />
                        <KpiTile
                            label={isArabic ? 'في الانتظار' : 'Waiting'}
                            value={summary.waiting ?? 0}
                            color="text-cyan-400"
                            icon={Users}
                        />
                    </div>

                    {/* Clinical guidance carousel */}
                    <section className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-900/60 bg-gradient-to-br ${currentTip?.gradient || 'from-teal-600/20 via-teal-500/5 to-transparent'} shadow-2xl shadow-black/20 backdrop-blur-sm`}>
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(45,212,191,0.08),transparent_34%)]" />
                        <TipIcon className="pointer-events-none absolute -bottom-10 -start-8 h-52 w-52 text-slate-500/[0.08]" strokeWidth={0.65} />

                        <div className="relative flex items-center justify-between border-b border-white/[0.06] bg-slate-950/25 px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <motion.span
                                    key={`tip-icon-${announcementIndex}`}
                                    initial={{ scale: 0.82, rotate: -8 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-lg ${tipAccentCls}`}
                                >
                                    <TipIcon size={19} strokeWidth={2.2} />
                                </motion.span>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[9.5px] font-black uppercase tracking-[0.18em] text-slate-500">
                                            {isArabic ? 'دليل الاستعداد للفحص' : 'Exam preparation guide'}
                                        </p>
                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8.5px] font-black text-emerald-300">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                            {isArabic ? 'مهم' : 'Important'}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-[11px] font-bold text-slate-200">
                                        {isArabic ? currentTip?.categoryAr : currentTip?.categoryEn}
                                    </p>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setAnnouncementIndex((current) => (current - 1 + activeAnnouncements.length) % activeAnnouncements.length)}
                                    aria-label={isArabic ? 'الإرشاد السابق' : 'Previous guidance'}
                                    className="grid h-7 w-7 place-items-center rounded-lg border border-slate-700/80 bg-slate-900/70 text-slate-400 transition hover:border-teal-500/40 hover:text-teal-300"
                                >
                                    <ChevronRight size={13} />
                                </button>
                                <span className="min-w-[48px] rounded-lg border border-slate-700/70 bg-slate-950/60 px-2 py-1 text-center font-mono text-[9.5px] font-black text-teal-300" dir="ltr">
                                    {String(announcementIndex + 1).padStart(2, '0')} / {String(activeAnnouncements.length).padStart(2, '0')}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAnnouncementIndex((current) => (current + 1) % activeAnnouncements.length)}
                                    aria-label={isArabic ? 'الإرشاد التالي' : 'Next guidance'}
                                    className="grid h-7 w-7 place-items-center rounded-lg border border-slate-700/80 bg-slate-900/70 text-slate-400 transition hover:border-teal-500/40 hover:text-teal-300"
                                >
                                    <ChevronLeft size={13} />
                                </button>
                            </div>
                        </div>

                        <div className="relative flex min-h-[180px] flex-1 items-center overflow-hidden px-5 py-4 2xl:min-h-[220px]">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={announcementIndex}
                                    initial={{ opacity: 0, x: isArabic ? 18 : -18 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: isArabic ? -12 : 12 }}
                                    transition={{ duration: 0.35, ease: EASE }}
                                    className="w-full"
                                >
                                    <h4 className="max-w-md text-[17px] font-black leading-snug text-white 2xl:text-xl">
                                        {isArabic ? currentTip?.titleAr : currentTip?.titleEn}
                                    </h4>
                                    <div className="mt-4 space-y-2.5">
                                        {guidancePoints.map((point, pointIndex) => (
                                            <div key={`${announcementIndex}-${pointIndex}`} className="flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-slate-950/25 px-3 py-2.5">
                                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${tipAccentCls}`}>
                                                    <Check size={11} strokeWidth={3} />
                                                </span>
                                                <p className="text-[11.5px] font-semibold leading-relaxed text-slate-200 2xl:text-[13px]">{point}</p>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="relative flex items-center gap-3 border-t border-white/[0.05] bg-slate-950/25 px-4 py-3">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800/90">
                                <motion.div
                                    key={`tip-progress-${announcementIndex}`}
                                    initial={{ width: '0%' }}
                                    animate={{ width: '100%' }}
                                    transition={{ duration: ANNOUNCEMENT_ROTATE_MS / 1000, ease: 'linear' }}
                                    className={`h-full rounded-full ${
                                        currentTip?.accent === 'amber' ? 'bg-gradient-to-r from-amber-500 to-yellow-300' :
                                        currentTip?.accent === 'cyan' ? 'bg-gradient-to-r from-cyan-500 to-sky-300' :
                                        currentTip?.accent === 'emerald' ? 'bg-gradient-to-r from-emerald-500 to-teal-300' :
                                        currentTip?.accent === 'violet' ? 'bg-gradient-to-r from-violet-500 to-fuchsia-300' :
                                        'bg-gradient-to-r from-teal-500 to-cyan-300'
                                    }`}
                                />
                            </div>
                            <div className="flex items-center gap-1.5">
                                {activeAnnouncements.map((_, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        onClick={() => setAnnouncementIndex(index)}
                                        aria-label={`${isArabic ? 'الإرشاد' : 'Guidance'} ${index + 1}`}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${index === announcementIndex ? 'w-5 bg-teal-300' : 'w-1.5 bg-slate-700 hover:bg-slate-500'}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* QR Portal Card */}
                    <div className="min-h-[132px] rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-950/50 via-cyan-950/20 to-slate-950/90 p-4 shadow-xl shadow-black/20">
                        <div className="flex items-center gap-3">
                            <HospitalPortalQr />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="inline-flex rounded-lg bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 text-[9.5px] font-black text-teal-400">
                                        {isArabic ? 'بوابة المريض' : 'Patient Portal'}
                                    </span>
                                    <div className="h-6 w-6 rounded-md bg-white p-0.5 flex items-center justify-center shadow-2xs">
                                        <img
                                            src={centerLogo}
                                            alt=""
                                            className="h-full w-full object-contain"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    </div>
                                </div>
                                <h4 className="text-sm font-black leading-snug text-white 2xl:text-base">
                                    {isArabic ? 'استلام النتائج والتقارير' : 'Online Results & Reports'}
                                </h4>
                                <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-400">
                                    {isArabic ? 'امسح بهاتفك لتحميل صور الأشعة والتقرير فوراً' : 'Scan to download DICOM images & reports instantly'}
                                </p>
                            </div>
                        </div>
                        {(center.hotline || center.phone) && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                <Phone size={10} className="text-teal-400 shrink-0" />
                                <span dir="ltr" className="text-slate-400">{center.hotline || center.phone}</span>
                                <span className="ms-auto text-slate-600">{isArabic ? 'خدمة 24/7' : '24/7 Support'}</span>
                            </div>
                        )}
                    </div>
                </aside>
            </main>

            {/* ─── SMART NOTICE BAR ─── */}
            <footer className="relative z-20 overflow-hidden border-t border-cyan-900/70 bg-[#050b15]/95 px-4 py-2.5 shadow-[0_-10px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                {board?.config?.showTicker !== false && (
                    <motion.div
                        key={`ticker-progress-${tickerIndex}`}
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: TICKER_ROTATE_MS / 1000, ease: 'linear' }}
                        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-300 to-cyan-400"
                    />
                )}
                <div className="flex min-h-[30px] items-center gap-3 overflow-hidden">
                    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-teal-500/25 bg-teal-500/10 px-3 py-1.5 text-teal-300 shadow-lg shadow-teal-950/20">
                        <span className="relative grid h-5 w-5 place-items-center rounded-lg bg-teal-400/15">
                            <Bell size={12} />
                            <span className="absolute -end-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-300 ring-2 ring-[#07101b] animate-pulse" />
                        </span>
                        <div className="leading-none">
                            <span className="block text-[9.5px] font-black uppercase tracking-[0.14em]">
                                {isArabic ? 'تنبيهات المركز' : 'Center notices'}
                            </span>
                            <span className="mt-1 block text-[7.5px] font-bold text-teal-200/50">
                                {isArabic ? 'معلومات مباشرة' : 'Live information'}
                            </span>
                        </div>
                    </div>

                    {board?.config?.showTicker !== false && currentTickerNotice ? (
                        <div className="relative min-w-0 flex-1 overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={tickerIndex}
                                    initial={{ opacity: 0, y: 9 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -9 }}
                                    transition={{ duration: 0.32, ease: EASE }}
                                    className="flex min-w-0 items-center gap-3"
                                >
                                    <span className={`shrink-0 rounded-lg border px-2 py-1 text-[8.5px] font-black ${
                                        currentTickerNotice.accent === 'amber' ? 'border-amber-500/25 bg-amber-500/10 text-amber-300' :
                                        currentTickerNotice.accent === 'violet' ? 'border-violet-500/25 bg-violet-500/10 text-violet-300' :
                                        currentTickerNotice.accent === 'cyan' ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300' :
                                        'border-teal-500/25 bg-teal-500/10 text-teal-300'
                                    }`}>
                                        {isArabic ? currentTickerNotice.labelAr : currentTickerNotice.labelEn}
                                    </span>
                                    <p className="truncate text-[11px] font-bold text-slate-200 2xl:text-xs">
                                        {isArabic ? currentTickerNotice.ar : currentTickerNotice.en}
                                    </p>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    ) : <div className="flex-1" />}

                    {board?.config?.showTicker !== false && (
                        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
                            {tickerNotices.map((_, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => setTickerIndex(index)}
                                    aria-label={`${isArabic ? 'التنبيه' : 'Notice'} ${index + 1}`}
                                    className={`h-1.5 rounded-full transition-all ${index === tickerIndex ? 'w-4 bg-teal-300' : 'w-1.5 bg-slate-700 hover:bg-slate-500'}`}
                                />
                            ))}
                        </div>
                    )}

                    <div className="hidden shrink-0 items-center gap-1.5 border-s border-slate-800 ps-3 xl:flex">
                        <span className={`h-1.5 w-1.5 rounded-full ${isFetching ? 'bg-amber-300 animate-pulse' : 'bg-emerald-400'}`} />
                        <span className="text-[8.5px] font-bold text-slate-500">
                            {isFetching ? (isArabic ? 'جارٍ التحديث' : 'Syncing') : (isArabic ? 'آخر تحديث' : 'Updated')}
                        </span>
                        <span className="font-mono text-[9px] font-black text-slate-400" dir="ltr">
                            {board?.generatedAt ? new Date(board.generatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => window.open('/display/control', '_blank', 'noopener,noreferrer')}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-800 bg-slate-900/80 text-slate-500 transition hover:border-teal-500/30 hover:text-teal-300"
                        title={isArabic ? 'إعدادات شاشة العرض' : 'Display settings'}
                        aria-label={isArabic ? 'إعدادات شاشة العرض' : 'Display settings'}
                    >
                        <Settings2 size={13} />
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default DisplayBoard;
