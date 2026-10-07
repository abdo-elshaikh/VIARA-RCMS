/**
 * DisplayBoard.jsx
 * VIARA — Waiting-room clinical signage (16:9 landscape / portrait)
 *
 * Production calling board for the radiology waiting hall:
 *  • Live broadcast calls — SSE hook + 6s polling fallback, replay-guarded
 *  • Multi-modality suite focus (MRI / CT / US / X-Ray) with rotation
 *  • Waiting queue, notices & guidance, patient portal QR, now-serving ticker
 *  • Full RTL/LTR via CSS logical properties + direction-aware motion
 *  • Light/Dark themes driven by data-theme tokens
 *  • Speech announcements with presets, repeat, tuning & autoplay unlock
 *  • Safe demo mode with reference data only
 *  • On-site control drawer (Shift+D); every preference persisted locally
 */
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Ban,
    Bell,
    CheckCircle2,
    DoorOpen,
    FileText,
    Footprints,
    Hash,
    MapPin,
    Maximize,
    Megaphone,
    Minimize,
    Pause,
    Play,
    QrCode,
    Radio,
    Settings2,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Stethoscope,
    Users,
    Volume2,
    WifiOff,
    X,
} from 'lucide-react';
import '../styles/DisplayBoard.css';
import '../styles/DisplayBoardDesign.css';
import { useGetDisplayBoardQuery } from '../store/api';
import {
    ANNOUNCEMENT_PRESETS,
    announcePatientCall,
    cancelAnnouncement,
    getSpokenToken,
    resolveHonorific,
} from '../utils/speechAnnouncement';
import { playHospitalChime, isAudioSuspended, unlockAudio } from '../utils/audioChime';
import { getPatientPortalHomeUrl } from '../utils/portalUrls';
import { VIARA_BRAND } from '../config/brand';

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */
const POLL_INTERVAL_MS = 6000;
const CLOCK_TICK_MS = 1000;
const CALL_BANNER_DURATION_MS = 25000;
const CALL_MIN_VISIBLE_MS = 7500;
const STALE_AFTER_MS = 35000;
const ROOM_PAGE_INTERVAL_MS = 9000;
const WAITING_ROWS = 4;
const WAITING_PAGE_INTERVAL_MS = 8000;
const EARLIER_CALLS_SHOWN = 3;
const GUIDANCE_INTERVAL_MS = 9000;
const TICKER_INTERVAL_MS = 8500;
const ROTATION_RESUME_MS = 20000;
const BROADCAST_REPLAY_WINDOW_MS = 30000;
const HANDLED_CALLS_MAX = 250;
const HANDLED_CALLS_KEEP = 150;
const ROOMS_PER_VIEW = 4;
const FALLBACK_LOGO = '/center-logo.png';

/* ═══════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════ */
const storage = {
    get(key, fallback = null) {
        try {
            const v = localStorage.getItem(key);
            return v === null ? fallback : v;
        } catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); } catch { /* quota / private mode */ }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch { /* noop */ }
    },
};

const handleLogoError = (event) => {
    const img = event.currentTarget;
    if (img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = '1';
    img.src = FALLBACK_LOGO;
};

const formatTime = (date, isArabic) => {
    let h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const isPM = h >= 12;
    h = h % 12 || 12;
    return {
        time: `${String(h).padStart(2, '0')}:${m}`,
        period: isArabic ? (isPM ? 'م' : 'ص') : (isPM ? 'PM' : 'AM'),
    };
};

const formatDate = (date, isArabic) =>
    new Intl.DateTimeFormat(isArabic ? 'ar-EG' : 'en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
    }).format(date);

const getCallIdentity = (item) =>
    item?.order_number || item?.patient_name || item?.queue_number;

const stripRoomLabel = (value) =>
    String(value || '').replace(/^Room\s+/i, '').replace(/^جناح\s+/i, '').trim();

const parseTicket = (orderNumber, queueNumber) => {
    const primary = queueNumber != null && queueNumber !== ''
        ? String(queueNumber)
        : getSpokenToken(orderNumber);
    if (!primary || primary === '—') return { short: '—', number: '' };
    const cleanNum = String(primary).replace(/^#/, '').trim();
    return { short: `#${cleanNum}`, number: cleanNum };
};

const roomMatchesCall = (room, call) => {
    if (!room || !call) return false;
    const code = stripRoomLabel(room.room_number);
    return (
        room.room_name === call.roomName ||
        stripRoomLabel(room.room_name) === stripRoomLabel(call.roomName) ||
        code === stripRoomLabel(call.roomName) ||
        `جناح ${room.room_number}` === call.roomName ||
        `Suite ${room.room_number}` === call.roomName
    );
};

const getBroadcastIdentity = (call) =>
    call?.id || [call?.orderNumber, call?.queueNumber, call?.roomName, call?.timestamp || call?.calledAt]
        .filter(Boolean).join('|');

const parsePronunciationDictionary = (value) =>
    Object.fromEntries(
        String(value || '')
            .split(/\r?\n/)
            .map((line) => line.split('=').map((p) => p.trim()))
            .filter(([from, to]) => from && to)
    );

/* ═══════════════════════════════════════════════════════════════════════
   MODALITY VISUALS
   ═══════════════════════════════════════════════════════════════════════ */
const svgProps = (className) => ({
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': true,
});

const MriIcon = ({ size = '1em', className = '' }) => (
    <svg width={size} height={size} {...svgProps(className)}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <rect x="7.5" y="10.5" width="9" height="3" rx="1" fill="currentColor" fillOpacity="0.2" />
        <path d="M12 3v1.5M12 19.5v1.5M3 12h1.5M19.5 12h1.5" />
    </svg>
);

const CtIcon = ({ size = '1em', className = '' }) => (
    <svg width={size} height={size} {...svgProps(className)}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" strokeDasharray="3 2" />
        <path d="M12 7a5 5 0 0 1 5 5" strokeWidth="2.5" />
        <rect x="6.5" y="11" width="11" height="2" rx="0.75" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
);

const UltrasoundIcon = ({ size = '1em', className = '' }) => (
    <svg width={size} height={size} {...svgProps(className)}>
        <path d="M10 2h4a1 1 0 0 1 1 1v4.5a2.5 2.5 0 0 1-2.5 2.5h-1a2.5 2.5 0 0 1-2.5-2.5V3a1 1 0 0 1 1-1z" fill="currentColor" fillOpacity="0.18" />
        <path d="M9 10h6" strokeWidth="2.5" />
        <path d="M7 13.5c2.8 2 7.2 2 10 0" />
        <path d="M5 16.5c4 2.8 10 2.8 14 0" />
        <path d="M3.5 19.5c5.2 3.2 11.8 3.2 17 0" opacity="0.65" />
    </svg>
);

const XrayIcon = ({ size = '1em', className = '' }) => (
    <svg width={size} height={size} {...svgProps(className)}>
        <rect x="3" y="3" width="18" height="18" rx="2.5" />
        <path d="M12 5v14M5 12h14" strokeDasharray="2 2" opacity="0.55" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" fillOpacity="0.25" />
        <path d="M8 8l8 8M16 8l-8 8" strokeWidth="1.5" />
    </svg>
);

const getSuiteModality = (room = {}, t) => {
    const code = stripRoomLabel(room.room_number);
    const machine = room.machines?.[0] || {};
    const text = `${room.modality || ''} ${machine.machine_name || ''} ${machine.machine_type || ''} ${machine.modality_name || ''}`.toLowerCase();
    const isUs = /(^|\s)us(\s|$)/.test(text) || /sonar|ultrasound|سونار|موجات|صوتية/i.test(text);
    const known = /mri|ct|sonar|ultrasound|x-?ray|رنين|مقطعية|سونار|موجات|صوتية|سينية|أشعة عادية/i.test(text) || isUs;

    if (text.includes('mri') || text.includes('رنين') || (!known && code === '01'))
        return { type: 'mri', icon: MriIcon, tag: 'MRI', label: t('رنين مغناطيسي • MRI', 'Magnetic Resonance • MRI') };
    if (text.includes('ct') || text.includes('مقطعية') || (!known && code === '02'))
        return { type: 'ct', icon: CtIcon, tag: 'CT', label: t('أشعة مقطعية • CT', 'Computed Tomography • CT') };
    if (isUs || (!known && code === '03'))
        return { type: 'us', icon: UltrasoundIcon, tag: 'US', label: t('موجات صوتية • Ultrasound', 'Ultrasound • US') };
    if (text.includes('x-ray') || text.includes('xray') || text.includes('سينية') || text.includes('أشعة عادية') || (!known && code === '04'))
        return { type: 'xray', icon: XrayIcon, tag: 'XRAY', label: t('أشعة سينية • X-Ray', 'Digital Radiography • X-Ray') };
    return { type: 'general', icon: Stethoscope, tag: 'CLINICAL', label: t('فحص إكلينيكي • Clinical', 'Clinical Diagnostic Suite') };
};

const MODALITY_DETAILS = {
    mri: { top: ['الرنين المغناطيسي', 'Magnetic resonance'], title: ['رؤية أوضح', 'A clearer view'], description: ['فريقنا معك في كل خطوة', 'Our team is with you at every step'], image: '/images/suite-mri.jpg' },
    ct: { top: ['الأشعة المقطعية', 'Computed tomography'], title: ['اهتمام بكل تفصيل', 'Every detail matters'], description: ['تابع رقم دورك واستعد عند النداء', 'Watch your ticket and be ready when called'], image: '/images/suite-ct.jpg' },
    us: { top: ['الموجات الصوتية', 'Ultrasound'], title: ['رعاية واهتمام', 'Care and attention'], description: ['فريقنا معك في كل خطوة', 'Our team is with you at every step'], image: '/images/ultrasound-suite.jpg' },
    xray: { top: ['الأشعة الرقمية', 'Digital radiography'], title: ['لصحة أوضح', 'For clearer health'], description: ['تابع رقم دورك واستعد عند النداء', 'Watch your ticket and be ready when called'], image: '/images/suite-xray.png' },
    general: { top: ['خدمات المركز', 'Center services'], title: ['أهلًا بك', 'Welcome'], description: ['فريقنا معك في كل خطوة', 'Our team is with you at every step'], image: '' },
};

/* ═══════════════════════════════════════════════════════════════════════
   DEMO DATA — reference suites only; never shown outside preview mode
   ═══════════════════════════════════════════════════════════════════════ */
const PREVIEW_LAST_CALL = {
    id: 'preview-last-call',
    tokenNumber: '105',
    roomCode: '03',
    roomName: 'جناح 03',
    patientName: 'محمد أحمد',
    gender: 'male',
    calledWithName: true,
    announcementMode: 'token_and_name',
    time: new Date(),
};

const DEMO_WAITING_LIST = [
    { token: '105', suite: 'جناح 03', status: 'استعد', isReady: true, patientName: 'محمد أحمد', gender: 'male', caseItem: { queue_stage: 'Ready for Exam', priority: 'Routine' } },
    { token: '108', suite: 'جناح 02', status: 'انتظار', isReady: false, patientName: 'سارة محمود', gender: 'female', caseItem: { queue_stage: 'Arrived', priority: 'Urgent' } },
    { token: '110', suite: 'جناح 04', status: 'انتظار', isReady: false, patientName: 'عبد الله خالد', gender: 'male', caseItem: { queue_stage: 'Arrived', priority: 'Routine' } },
    { token: '112', suite: 'جناح 03', status: 'انتظار', isReady: false, patientName: 'فاطمة إبراهيم', gender: 'female', caseItem: { queue_stage: 'Arrived', priority: 'Routine' } },
    { token: '115', suite: 'جناح 01', status: 'انتظار', isReady: false, patientName: 'يوسف عمر', gender: 'male', caseItem: { queue_stage: 'Arrived', priority: 'Emergency' } },
    { token: '118', suite: 'جناح 02', status: 'انتظار', isReady: false, patientName: 'نادية مصطفى', gender: 'female', caseItem: { queue_stage: 'Arrived', priority: 'Routine' } },
    { token: '120', suite: 'جناح 04', status: 'انتظار', isReady: false, patientName: 'طارق حسام', gender: 'male', caseItem: { queue_stage: 'Arrived', priority: 'Routine' } },
    { token: '122', suite: 'جناح 01', status: 'انتظار', isReady: false, patientName: 'مريم عادل', gender: 'female', caseItem: { queue_stage: 'Arrived', priority: 'Routine' } },
];

const previewMachine = (current, upNext, extra = []) => ({
    current,
    up_next: upNext,
    queue: { next: [upNext, ...extra].filter(Boolean) },
});

const DEMO_ROOMS = [
    {
        room_id: 'preview-01', room_number: '01', room_name: 'جناح 01', room_status: 'Active', modality: 'mri',
        machines: [{
            machine_name: 'MRI', machine_type: 'MRI', machine_status: 'Active',
            ...previewMachine(
                { order_number: '115', queue_number: 115, patient_name: 'يوسف عمر', gender: 'male' },
                { order_number: '122', queue_number: 122, queue_stage: 'Arrived', patient_name: 'مريم عادل', gender: 'female', priority: 'Routine' }
            ),
        }],
    },
    {
        room_id: 'preview-02', room_number: '02', room_name: 'جناح 02', room_status: 'Active', modality: 'ct',
        machines: [{
            machine_name: 'CT', machine_type: 'CT', machine_status: 'Active',
            ...previewMachine(
                { order_number: '108', queue_number: 108, patient_name: 'سارة محمود', gender: 'female' },
                { order_number: '118', queue_number: 118, queue_stage: 'Arrived', patient_name: 'نادية مصطفى', gender: 'female', priority: 'Routine' }
            ),
        }],
    },
    {
        room_id: 'preview-03', room_number: '03', room_name: 'جناح 03', room_status: 'Active', modality: 'us',
        machines: [{
            machine_name: 'Ultrasound', machine_type: 'US', machine_status: 'Active',
            ...previewMachine(
                { order_number: '098', queue_number: 98, queue_stage: 'In Exam', patient_name: 'فاطمة إبراهيم', gender: 'female' },
                { order_number: '105', queue_number: 105, queue_stage: 'Ready for Exam', patient_name: 'محمد أحمد', gender: 'male', priority: 'Routine' },
                [{ order_number: '112', queue_number: 112, queue_stage: 'Arrived', patient_name: 'فاطمة إبراهيم', gender: 'female', priority: 'Routine' }]
            ),
        }],
    },
    {
        room_id: 'preview-04', room_number: '04', room_name: 'جناح 04', room_status: 'Active', modality: 'xray',
        machines: [{
            machine_name: 'Digital X-Ray', machine_type: 'XRAY', machine_status: 'Active',
            ...previewMachine(
                { order_number: '095', queue_number: 95, patient_name: 'طارق حسام', gender: 'male' },
                { order_number: '110', queue_number: 110, queue_stage: 'Arrived', patient_name: 'عبد الله خالد', gender: 'male', priority: 'Routine' },
                [{ order_number: '120', queue_number: 120, queue_stage: 'Arrived', patient_name: 'طارق حسام', gender: 'male' }]
            ),
        }],
    },
];

const PREVIEW_BOARD = {
    generatedAt: new Date().toISOString(),
    center: {
        name: 'VIARA Diagnostic Center',
        nameAr: 'مركز فيارا للأشعة التشخيصية',
        address: 'Main Waiting Hall',
        addressAr: 'صالة الانتظار الرئيسية',
        logoUrl: '/center-logo.png',
    },
    config: {
        patientDisplayMode: 'name_and_order',
        callAnnouncementMode: 'token_and_name',
        showTicker: true,
        privacyMode: 'full',
        muteAll: false,
        quietMode: false,
        repeatChime: true,
        theme: 'light',
        displayLanguage: 'ar',
        motionMode: 'full',
        rotationSpeed: 9000,
        showSummaryStats: false,
        announcementMode: null,
        announcementPreset: 'standard',
        announcementRate: 1,
        announcementRepeatCount: 2,
        announcementRepeatDelay: 1500,
        announcementVolume: 1,
        announcementLanguage: 'ar',
        tokenPronunciation: 'auto',
        announcementStyle: 'formal',
        customTemplate: null,
        pronunciationDictionary: null,
        arabicVoiceURI: null,
        englishVoiceURI: null,
    },
    summary: { waiting: 12, inExam: 4, completedToday: 38, averageWaitingMinutes: 14 },
    announcements: [
        { id: 'ann-1', title: 'تنبيه الفحص', message: 'يرجى متابعة رقم الدور على الشاشة والتوجه إلى الجناح فور سماع النداء', tone: 'info' },
        { id: 'ann-2', title: 'إرشادات السلامة', message: 'يرجى إزالة كافة الساعات والمعادن والأجهزة الإلكترونية قبل الدخول لغرف الفحص', tone: 'warning' },
        { id: 'ann-3', title: 'خدمة البوابة الرقمية', message: 'يمكنكم استلام صور الأشعة والتقرير الفوري عبر مسح رمز الاستجابة السريعة بهاتفكم', tone: 'success' },
    ],
    broadcastCalls: [],
    rooms: DEMO_ROOMS,
};

/* ═══════════════════════════════════════════════════════════════════════
   FLOATING CALL OVERLAY
   ═══════════════════════════════════════════════════════════════════════ */
const FloatingCallOverlay = memo(({ call, isArabic, formatName, onDismiss }) => {
    const t = (ar, en) => (isArabic ? ar : en);
    if (!call) return null;

    const showToken = call.announcementMode !== 'name_only';
    const tokenText = `#${String(call.tokenNumber || '—').replace(/^#/, '')}`;
    const honorific = resolveHonorific(call.gender, isArabic);
    const formatted = call.patientName ? formatName(call.patientName) : null;
    const patientName = formatted ? `${honorific} ${formatted}` : null;
    const roomLabel = call.roomCode ? `${t('جناح', 'Suite')} ${call.roomCode}` : call.roomName;
    const hasDistinctRoom = call.roomName && stripRoomLabel(call.roomName) !== stripRoomLabel(roomLabel);
    const RouteArrow = isArabic ? ArrowLeft : ArrowRight;

    return (
        <div className="vb-call-layer">
            <motion.div
                className="vb-call-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-hidden="true"
            />
            <motion.aside
                className="vb-call-card"
                role="alert"
                aria-live="assertive"
                initial={{ opacity: 0, y: -32, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -24, scale: 0.98 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
                <div className="vb-call-head">
                    <span className="vb-call-head__live-dot" aria-hidden="true" />
                    <Megaphone size="1.15em" aria-hidden="true" />
                    <strong>{t('يتم النداء الآن', 'Now calling')}</strong>
                    <button
                        type="button"
                        className="vb-call-head__close"
                        onClick={onDismiss}
                        aria-label={t('إغلاق النداء', 'Dismiss call')}
                    >
                        <X size="1.15em" />
                    </button>
                </div>

                <div className="vb-call-body">
                    <div className="vb-call-ticket">
                        <span className="vb-call-eyebrow">
                            {showToken ? t('رقم الدور', 'Ticket number') : honorific}
                        </span>
                        {showToken && <strong className="vb-call-token" dir="ltr">{tokenText}</strong>}
                        {patientName && <span className="vb-call-name">{patientName}</span>}
                    </div>

                    <div className="vb-call-route" aria-hidden="true">
                        <RouteArrow size="2.3em" />
                    </div>

                    <div className="vb-call-destination">
                        <span className="vb-call-eyebrow">{t('توجه الآن إلى', 'Proceed now to')}</span>
                        {roomLabel && <strong className="vb-call-room-code">{roomLabel}</strong>}
                        {hasDistinctRoom && <span className="vb-call-room-name">{call.roomName}</span>}
                    </div>
                </div>

                <div className="vb-call-instruction">
                    <DoorOpen size="1.1em" aria-hidden="true" />
                    <span>{t('يرجى التوجه مباشرة إلى الجناح عند سماع النداء', 'Please proceed directly to the suite')}</span>
                </div>

                <div className="vb-call-progress" aria-hidden="true">
                    <motion.span
                        className="vb-call-progress__bar"
                        style={{ originX: isArabic ? 1 : 0 }}
                        initial={{ scaleX: 1 }}
                        animate={{ scaleX: 0 }}
                        transition={{ duration: CALL_BANNER_DURATION_MS / 1000, ease: 'linear' }}
                    />
                </div>
            </motion.aside>
        </div>
    );
});
FloatingCallOverlay.displayName = 'FloatingCallOverlay';

/* ═══════════════════════════════════════════════════════════════════════
   LAST CALL BANNER
   ═══════════════════════════════════════════════════════════════════════ */
const LastCallBanner = memo(({ call, isArabic, isLiveCall }) => {
    const t = (ar, en) => (isArabic ? ar : en);
    const token = call?.tokenNumber ? String(call.tokenNumber).replace(/^#/, '') : '';
    if (!token || token === '—' || !call) return null;

    const roomName = call?.roomName || (call?.roomCode ? `${t('جناح', 'Suite')} ${call.roomCode}` : '');

    return (
        <div
            className={`vb-last-call ${isLiveCall ? 'vb-last-call--calling' : ''}`}
            role="status"
            aria-label={t('آخر نداء', 'Last call')}
        >
            <div className="vb-last-call__label">
                <span className="vb-last-call__bar" aria-hidden="true" />
                <span>{t('آخر نداء', 'Last call')}</span>
            </div>

            <div className="vb-last-call__content" dir={isArabic ? 'rtl' : 'ltr'}>
                <strong className="vb-last-call__token">#{token}</strong>
                <span className="vb-last-call__arrow" aria-hidden="true">{isArabic ? '←' : '→'}</span>
                <span className="vb-last-call__room">{roomName}</span>
            </div>

            <div className="vb-last-call__icon">
                <Megaphone size="1.85em" aria-hidden="true" />
                {isLiveCall && (
                    <div className="vb-soundwave" aria-hidden="true">
                        <span /><span /><span /><span />
                    </div>
                )}
            </div>
        </div>
    );
});
LastCallBanner.displayName = 'LastCallBanner';

/* ═══════════════════════════════════════════════════════════════════════
   SUITE FOCUS CARD
   ═══════════════════════════════════════════════════════════════════════ */
const WaitingCouch = memo(() => (
    <div className="vb-waiting-couch" aria-hidden="true">
        <svg width="180" height="95" viewBox="0 0 180 95" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="90" cy="48" r="38" fill="#e0f7f6" fillOpacity="0.75" />
            <g transform="translate(74, 6)">
                <circle cx="16" cy="16" r="16" fill="#0d9488" />
                <path d="M10 16.5L14.5 21L22 12.5" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="16" y1="-3" x2="16" y2="1" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                <line x1="3" y1="4" x2="6" y2="7" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                <line x1="29" y1="4" x2="26" y2="7" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                <line x1="-3" y1="16" x2="1" y2="16" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                <line x1="31" y1="16" x2="35" y2="16" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
            </g>
            <g transform="translate(22, 36)">
                <path d="M10 24L8 38H18L16 24H10Z" fill="#a7d8d6" />
                <path d="M13 24C8 18 4 11 13 4C22 11 18 18 13 24Z" fill="#5eead4" opacity="0.8" />
                <path d="M13 24C18 16 23 11 27 6C25 15 20 20 13 24Z" fill="#2dd4bf" />
                <path d="M13 24C8 16 3 11 0 6C2 15 7 20 13 24Z" fill="#14b8a6" />
            </g>
            <g transform="translate(42, 42)">
                <rect x="8" y="6" width="24" height="20" rx="4" fill="#99d5d3" />
                <rect x="36" y="6" width="24" height="20" rx="4" fill="#88cbca" />
                <rect x="64" y="6" width="24" height="20" rx="4" fill="#99d5d3" />
                <rect x="4" y="26" width="88" height="11" rx="4" fill="#72bfbd" />
                <rect x="11" y="37" width="3.5" height="12" rx="1.5" fill="#4f8f8e" />
                <rect x="81" y="37" width="3.5" height="12" rx="1.5" fill="#4f8f8e" />
                <rect x="46" y="37" width="3.5" height="12" rx="1.5" fill="#4f8f8e" />
            </g>
        </svg>
    </div>
));
WaitingCouch.displayName = 'WaitingCouch';

const SuiteFocusCard = memo(({ suite, isArabic, formatName, isCalling, showPatientNames }) => {
    const t = (ar, en) => (isArabic ? ar : en);
    const [imageFailed, setImageFailed] = useState(false);

    if (!suite) {
        return (
            <section className="vb-suite-focus vb-suite-focus--empty" aria-live="polite">
                <Stethoscope size="3rem" aria-hidden="true" />
                <h2>{t('لا توجد أجنحة متاحة للعرض', 'No suites are available')}</h2>
                <p>{t('تحقق من إعدادات الغرف أو الاتصال بالخادم', 'Check room configuration or the server connection')}</p>
            </section>
        );
    }

    const machine = suite.machines?.find((m) => m?.current || m?.up_next || m?.queue?.next?.length)
        || suite.machines?.[0] || {};
    const current = machine.current;
    const next = machine.up_next || machine.queue?.next?.[0];
    const queueNext = machine.queue?.next || [];
    const afterNext = queueNext
        .filter((item) => item && item !== next && getCallIdentity(item) !== getCallIdentity(next))
        .slice(0, 2);

    const roomCode = stripRoomLabel(suite.room_number) || '—';
    const rawName = suite.room_name || `${t('جناح', 'Suite')} ${roomCode}`;
    const strippedName = rawName
        .replace(new RegExp(`^(?:جناح|Suite)\\s*${roomCode}\\s*[-–:]*\\s*`, 'i'), '')
        .replace(/^(?:جناح|Suite)\s+/i, '')
        .trim();
    const roomName = strippedName || rawName;

    const modality = getSuiteModality(suite, t);
    const ModalityIcon = modality.icon;
    const detail = MODALITY_DETAILS[modality.type] || MODALITY_DETAILS.general;

    const nextTicket = parseTicket(next?.order_number, next?.queue_number);
    const hasValidNext = Boolean(next && nextTicket.number && nextTicket.number !== '—');
    const nextName = hasValidNext && showPatientNames && next?.patient_name ? formatName(next.patient_name) : null;

    const currentTicket = parseTicket(current?.order_number, current?.queue_number);
    const hasValidCurrent = Boolean(current && currentTicket.number && currentTicket.number !== '—');

    const after1 = afterNext[0] ? parseTicket(afterNext[0].order_number, afterNext[0].queue_number) : { number: '' };
    const hasAfter1 = Boolean(after1.number && after1.number !== '—');
    const after2 = afterNext[1] ? parseTicket(afterNext[1].order_number, afterNext[1].queue_number) : { number: '' };
    const hasAfter2 = Boolean(after2.number && after2.number !== '—');
    const queueSteps = [
        hasValidCurrent && { id: 'current', label: t('الحالي', 'Current'), number: currentTicket.number },
        hasAfter1 && { id: 'after-next', label: t('بعد التالي', 'After next'), number: after1.number },
        hasAfter2 && { id: 'following', label: t('يليه', 'Following'), number: after2.number },
    ].filter(Boolean);

    const operational = new Set(['active', 'available', 'operational', 'ready', 'in use', 'busy']);
    const statusValues = [suite.room_status, machine.machine_status].filter(Boolean).map((v) => String(v).trim().toLowerCase());
    const isUnavailable = statusValues.some((v) => !operational.has(v));
    const statusText = isUnavailable
        ? t('خارج الخدمة', 'Unavailable')
        : current ? t('قيد الفحص', 'In exam')
            : t('متاح', 'Available');

    return (
        <section
            className={`vb-suite-focus vb-suite-focus--${modality.type} ${isCalling ? 'vb-suite-focus--calling' : ''}`}
            aria-label={`${roomName} ${modality.tag}`}
        >
            <div className="vb-suite-focus__content">
                <div className="vb-suite-header">
                    <div className="vb-suite-badge">
                        <ModalityIcon size="1.75em" />
                        <span className="vb-suite-badge__code">{t('جناح', 'Suite')} {roomCode}</span>
                    </div>

                    <div className="vb-suite-title">
                        <motion.h2 initial={{ opacity: 0, x: isArabic ? 12 : -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>{roomName}</motion.h2>
                    </div>

                    <div className="vb-suite-pills">
                        <span className={`vb-suite-pill vb-suite-pill--status ${isUnavailable ? 'vb-suite-pill--offline' : (!current ? 'vb-suite-pill--available' : '')}`}>
                            <span className="vb-suite-pill__dot" aria-hidden="true" />
                            <span>{statusText}</span>
                        </span>
                        <span className="vb-suite-pill vb-suite-pill--mod">
                            <ModalityIcon size="1.1em" />
                            <span>{modality.tag}</span>
                        </span>
                    </div>
                </div>

                <div className={`vb-hero-call ${isCalling ? 'vb-hero-call--calling' : ''} ${!hasValidNext ? 'vb-hero-call--empty' : ''}`}>
                    {hasValidNext ? (
                        <>
                            <span className="vb-hero-call__tag"><Users size="1em" aria-hidden="true" />{t('الدور التالي', 'Next ticket')}</span>
                            <motion.strong
                                className="vb-hero-call__number"
                                dir="ltr"
                                key={nextTicket.number}
                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            >
                                {nextTicket.number}
                            </motion.strong>
                            {nextName && <span className="vb-hero-call__name">{nextName}</span>}
                            <div className="vb-hero-call__instruction">
                                <span>{t('يرجى الاستعداد أمام الجناح', 'Please be ready in front of the suite')}</span>
                            </div>
                        </>
                    ) : (
                        <div className="vb-hero-empty">
                            <WaitingCouch />
                            <h3 className="vb-hero-empty__title">{t('لا يوجد منتظرون حالياً', 'No patients currently waiting')}</h3>
                        </div>
                    )}
                </div>

                {queueSteps.length > 0 && (
                    <div className="vb-queue-steps" dir={isArabic ? 'rtl' : 'ltr'}>
                        {queueSteps.map((step, index) => (
                            <React.Fragment key={step.id}>
                                {index > 0 && <span className="vb-queue-step__arrow" aria-hidden="true">{isArabic ? '«' : '»'}</span>}
                                <div className="vb-queue-step">
                                    <span className="vb-queue-step__label">{step.label}</span>
                                    <strong className="vb-queue-step__num" dir="ltr">#{step.number}</strong>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>

            <div className={`vb-suite-image vb-suite-image--${modality.type}`}>
                {detail.image && !imageFailed ? (
                    <img src={detail.image} alt="" className="vb-suite-image__bg" onError={() => setImageFailed(true)} />
                ) : (
                    <ModalityIcon className="vb-suite-image__icon" />
                )}
                <div className="vb-suite-image__overlay">
                    <div className="vb-suite-image__caption">
                        <span className="vb-suite-image__caption-pre">{t(...detail.top)}</span>
                        <h3 className="vb-suite-image__caption-hero">{t(...detail.title)}</h3>
                        <div className="vb-suite-image__caption-line" aria-hidden="true" />
                        <p className="vb-suite-image__caption-sub">{t(...detail.description)}</p>
                    </div>
                </div>
            </div>
        </section>
    );
});
SuiteFocusCard.displayName = 'SuiteFocusCard';

/* ═══════════════════════════════════════════════════════════════════════
   WAITING LIST CARD
   ═══════════════════════════════════════════════════════════════════════ */
const WaitingListCard = memo(({ items, total, isArabic, liveCall, showPatientNames, formatName }) => {
    const t = (ar, en) => (isArabic ? ar : en);
    const [page, setPage] = useState(0);
    const pageCount = Math.max(1, Math.ceil(items.length / WAITING_ROWS));

    useEffect(() => {
        setPage((curr) => Math.min(curr, pageCount - 1));
    }, [pageCount]);

    useEffect(() => {
        if (pageCount <= 1 || liveCall) return undefined;
        const timer = setInterval(() => setPage((curr) => (curr + 1) % pageCount), WAITING_PAGE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [pageCount, liveCall]);

    const pageItems = items.slice(page * WAITING_ROWS, page * WAITING_ROWS + WAITING_ROWS);

    return (
        <section className="vb-card vb-card--waiting" aria-label={t('قائمة الانتظار', 'Waiting queue')}>
            <div className="vb-card__head">
                <div className="vb-card__title">
                    <div className="vb-card__icon-badge">
                        <Users size="1.15em" aria-hidden="true" />
                    </div>
                    <div>
                        <h3>{t('الانتظار', 'Waiting')}</h3>
                    </div>
                </div>
                <div className="vb-waiting-count">
                    <span className="vb-waiting-count__num">{total ?? items.length}</span>
                    <span className="vb-waiting-count__label">{t('منتظر', 'Waiting')}</span>
                </div>
            </div>

            {items.length > 0 && (
                <div className="vb-waiting-header">
                    <span>{t('رقم الدور', 'Ticket')}</span>
                    <span>{t('الجناح / الفحص', 'Suite / Exam')}</span>
                    <span>{t('الحالة والأولوية', 'Status & Priority')}</span>
                </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={`wait-page-${page}`}
                    className="vb-waiting-rows"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                >
                    {pageItems.length === 0 && (
                        <div className="vb-waiting-empty">
                            <strong>{t('لا توجد أدوار منتظرة حالياً', 'No patients currently waiting')}</strong>
                        </div>
                    )}

                    {pageItems.map((row, idx) => {
                        const token = row.token || parseTicket(row.caseItem?.order_number, row.caseItem?.queue_number).number;
                        const roomCode = stripRoomLabel(row.room?.room_number) || stripRoomLabel(row.suite) || '—';
                        const mod = getSuiteModality(row.room || { room_number: roomCode, modality: row.caseItem?.modality || row.suite }, t);
                        const isReady = row.isReady ?? row.caseItem?.queue_stage === 'Ready for Exam';
                        const isOnHold = Boolean(row.caseItem?.is_on_hold);
                        const priority = String(row.caseItem?.priority || '').toLowerCase();
                        const isCalling = Boolean(liveCall) && (
                            String(token).replace(/^#/, '') === String(liveCall.tokenNumber || '').replace(/^#/, '')
                        );
                        const rawName = row.patientName || row.caseItem?.patient_name;
                        const patientName = showPatientNames && rawName ? formatName(rawName) : null;

                        const statusText = isCalling
                            ? t('يتم النداء الآن', 'Calling now')
                            : isOnHold ? t('مؤجل مؤقتاً', 'On hold')
                                : (row.status || (isReady ? t('استعد للدخول', 'Get ready') : t('في الانتظار', 'Waiting')));

                        const statusModifier = priority === 'emergency' ? 'emergency'
                            : priority === 'urgent' ? 'urgent'
                                : isCalling ? 'calling'
                                    : isReady ? 'ready'
                                        : 'waiting';

                        return (
                            <div
                                key={`wait-row-${page}-${idx}-${token}`}
                                className={`vb-waiting-row${isCalling ? ' vb-waiting-row--calling' : isReady ? ' vb-waiting-row--ready' : ''}`}
                            >
                                <div>
                                    <strong className="vb-waiting-row__token" dir="ltr">#{token}</strong>
                                    {patientName && <div className="vb-waiting-row__name">{patientName}</div>}
                                </div>

                                <div className="vb-waiting-row__suite">
                                    <span className="vb-waiting-row__suite-badge">
                                        <span>{t('جناح', 'Suite')}</span>
                                        <strong className="vb-waiting-row__suite-code">{roomCode}</strong>
                                    </span>
                                    {mod?.tag && <span className="vb-waiting-row__suite-mod">{mod.tag}</span>}
                                </div>

                                <div className="vb-waiting-row__status-wrap">
                                    <span className={`vb-waiting-row__status vb-waiting-row__status--${statusModifier}`}>
                                        <span className="vb-waiting-row__status-dot" aria-hidden="true" />
                                        <span>{statusText}</span>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </motion.div>
            </AnimatePresence>

            {pageCount > 1 && (
                <div className="vb-waiting-pager">
                    <span className="vb-waiting-pager__info" dir="ltr">
                        {t('صفحة', 'Page')} {page + 1} {t('من', 'of')} {pageCount}
                    </span>
                    <div className="vb-waiting-pager__dots">
                        {Array.from({ length: pageCount }).map((_, pIdx) => (
                            <button
                                key={`dot-${pIdx}`}
                                type="button"
                                onClick={() => setPage(pIdx)}
                                className={`vb-pager-dot${pIdx === page ? ' vb-pager-dot--active' : ''}`}
                                aria-label={`Page ${pIdx + 1}`}
                            />
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
});
WaitingListCard.displayName = 'WaitingListCard';

/* ═══════════════════════════════════════════════════════════════════════
   GUIDANCE / ANNOUNCEMENTS CARD
   ═══════════════════════════════════════════════════════════════════════ */
const GuidanceCard = memo(({ announcements = [], isArabic }) => {
    const t = useCallback((ar, en) => (isArabic ? ar : en), [isArabic]);
    const hasAnnouncements = Array.isArray(announcements) && announcements.length > 0;
    const [activeTab, setActiveTab] = useState('all');
    const [slideIndex, setSlideIndex] = useState(0);

    const instructions = useMemo(() => [
        {
            id: 'inst-1', icon: Ban, tone: 'warning',
            category: t('إرشادات السلامة', 'Safety Prep'),
            title: t('إزالة المعادن والإلكترونيات', 'Remove Metals & Devices'),
            desc: t('يرجى نزع الساعات، الحلي، والمفاتيح والبطاقات الممغنطة قبل دخول غرفة الفحص.',
                'Please remove watches, jewelry, coins, and magnetic cards prior to examination.'),
        },
        {
            id: 'inst-2', icon: ShieldCheck, tone: 'info',
            category: t('تحضيرات الفحص', 'Exam Preparation'),
            title: t('فحوصات الصبغة والمعدة', 'Contrast & Ultrasound'),
            desc: t('يرجى التأكد من الالتزام بساعات الصيام المحددة وشرب كميات كافية من الماء بعد الفحص.',
                'Ensure adherence to fasting requirements and drink plenty of water after contrast exams.'),
        },
        {
            id: 'inst-3', icon: Footprints, tone: 'success',
            category: t('تنظيم الصالة', 'Hall Etiquette'),
            title: t('التواجد عند سماع النداء', 'Prompt Suite Arrival'),
            desc: t('يرجى التوجه فوراً إلى الجناح الموضح على الشاشة بمجرد سماع النداء الصوتي لتجنب التأخير.',
                'Please proceed immediately to the designated suite upon voice announcement.'),
        },
        {
            id: 'inst-4', icon: Smartphone, tone: 'info',
            category: t('الهدوء والراحة', 'Quiet Environment'),
            title: t('ضبط الهاتف على الصامت', 'Silent Mobile Phones'),
            desc: t('حرصاً على راحة المرضى وتركيز الطاقم الطبي، يرجى ضبط الهواتف على الوضع الصامت.',
                'For patient comfort and clinical focus, please keep mobile phones on silent mode.'),
        },
    ], [t]);

    const combined = useMemo(() => {
        const formatted = announcements.map((ann, i) => ({
            id: ann.id || `ann-${i}`,
            icon: Megaphone,
            category: t('إعلان المركز', 'Center Notice'),
            tone: ann.tone || 'info',
            title: ann.title || t('تنبيه هام للمرضى', 'Important Notice'),
            desc: ann.message,
        }));
        if (activeTab === 'announcements' && formatted.length > 0) return formatted;
        if (activeTab === 'instructions') return instructions;
        return [...formatted, ...instructions];
    }, [announcements, activeTab, instructions, t]);

    useEffect(() => {
        if (combined.length <= 1) return undefined;
        const timer = setInterval(() => setSlideIndex((curr) => (curr + 1) % combined.length), GUIDANCE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [combined.length]);

    const current = combined[slideIndex] || combined[0] || instructions[0];
    const Icon = current.icon || Megaphone;

    const tabs = [
        { id: 'all', label: t('الكل', 'All') },
        ...(hasAnnouncements ? [{ id: 'announcements', label: t('الإعلانات', 'Notices') }] : []),
        { id: 'instructions', label: t('التعليمات', 'Guidance') },
    ];

    return (
        <section className="vb-card vb-card--guidance" aria-label={t('الإعلانات والإرشادات', 'Announcements and guidance')}>
            <div className="vb-card__head">
                <div className="vb-card__title">
                    <div className="vb-card__icon-badge vb-card__icon-badge--amber">
                        <Megaphone size="1.15em" aria-hidden="true" />
                    </div>
                    <div>
                        <h3>{t('الإعلانات', 'Notices')}</h3>
                    </div>
                </div>

                <div className="vb-subtabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => { setActiveTab(tab.id); setSlideIndex(0); }}
                            className={`vb-subtab${activeTab === tab.id ? ' vb-subtab--active' : ''}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="vb-guidance-wrap">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`guide-${current.id}-${slideIndex}`}
                        className={`vb-guidance vb-guidance--${current.tone}`}
                        initial={{ opacity: 0, x: isArabic ? -8 : 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: isArabic ? 8 : -8 }}
                        transition={{ duration: 0.26 }}
                    >
                        <div className="vb-guidance__top">
                            <span className="vb-guidance__category">
                                <Icon size="0.95em" aria-hidden="true" />
                                <span>{current.category}</span>
                            </span>
                            <span className="vb-guidance__timer" dir="ltr">{slideIndex + 1} / {combined.length}</span>
                        </div>

                        <h4 className="vb-guidance__title">{current.title}</h4>
                        <p className="vb-guidance__desc">{current.desc}</p>

                        <div className="vb-guidance__progress" aria-hidden="true">
                            <motion.div
                                key={`prog-${slideIndex}`}
                                className={`vb-guidance__progress-fill vb-guidance__progress-fill--${current.tone}`}
                                initial={{ width: '0%' }}
                                animate={{ width: '100%' }}
                                transition={{ duration: GUIDANCE_INTERVAL_MS / 1000, ease: 'linear' }}
                            />
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </section>
    );
});
GuidanceCard.displayName = 'GuidanceCard';

/* ═══════════════════════════════════════════════════════════════════════
   DIGITAL PORTAL CARD
   ═══════════════════════════════════════════════════════════════════════ */
const PortalCard = memo(({ isArabic }) => {
    const t = (ar, en) => (isArabic ? ar : en);

    return (
        <section className="vb-card vb-card--portal" aria-label={t('بوابة النتائج الرقمية', 'Digital results portal')}>
            <div className="vb-card__head">
                <div className="vb-card__title">
                    <div className="vb-card__icon-badge">
                        <QrCode size="1.15em" aria-hidden="true" />
                    </div>
                    <div>
                        <h3>{t('بوابة المريض', 'Patient portal')}</h3>
                    </div>
                </div>
                <span className="vb-portal-badge">
                    <span className="vb-portal-badge__dot" aria-hidden="true" />
                    <span>{t('على هاتفك', 'On your phone')}</span>
                </span>
            </div>

            <div className="vb-portal-body">
                <div className="vb-portal-qr">
                    <span className="vb-portal-qr__bracket vb-portal-qr__bracket--tl" aria-hidden="true" />
                    <span className="vb-portal-qr__bracket vb-portal-qr__bracket--tr" aria-hidden="true" />
                    <span className="vb-portal-qr__bracket vb-portal-qr__bracket--bl" aria-hidden="true" />
                    <span className="vb-portal-qr__bracket vb-portal-qr__bracket--br" aria-hidden="true" />
                    <QRCodeSVG
                        value={getPatientPortalHomeUrl()}
                        size={58}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#084c53"
                        title="VIARA Digital Portal"
                    />
                    <span className="vb-portal-qr__label">{t('امسح بالكاميرا', 'Scan with camera')}</span>
                </div>

                <div className="vb-portal-features">
                    <div className="vb-portal-feature">
                        <Smartphone size="1.1em" className="vb-portal-feature__icon vb-portal-feature__icon--brand" aria-hidden="true" />
                        <div>
                            <strong className="vb-portal-feature__title">{t('متابعة دورك مباشرة', 'Live Queue Tracking')}</strong>
                            <p className="vb-portal-feature__desc">{t('اعرف ترتيبك بدقة من هاتفك', 'Check your queue position')}</p>
                        </div>
                    </div>
                    <div className="vb-portal-feature">
                        <FileText size="1.1em" className="vb-portal-feature__icon vb-portal-feature__icon--info" aria-hidden="true" />
                        <div>
                            <strong className="vb-portal-feature__title">{t('التقرير وصور الأشعة', 'Reports & DICOM')}</strong>
                            <p className="vb-portal-feature__desc">{t('استلام فوري فور اعتماد الطبيب', 'Instant access upon sign-off')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
});
PortalCard.displayName = 'PortalCard';

/* ═══════════════════════════════════════════════════════════════════════
   TICKER FOOTER
   ═══════════════════════════════════════════════════════════════════════ */
const TickerFooter = memo(({
    displayBoard, isArabic, isStale, isDemoMode, onExitDemo,
}) => {
    const t = useCallback((ar, en) => (isArabic ? ar : en), [isArabic]);

    const announcements = displayBoard?.announcements || [];
    const defaults = useMemo(() => [
        { id: 'def-1', tone: 'info', message: t('يرجى متابعة رقم الدور على الشاشة والتوجه إلى الجناح فور سماع النداء', 'Please follow your ticket on screen and proceed to the suite upon announcement') },
        { id: 'def-2', tone: 'warning', message: t('يرجى إزالة كافة الساعات والمعادن والأجهزة الإلكترونية قبل الدخول لغرفة الفحص', 'Please remove all metals and electronic devices prior to entering the exam suite') },
        { id: 'def-3', tone: 'success', message: t('يمكنكم استلام صور الأشعة والتقرير الفوري عبر مسح رمز الاستجابة السريعة بهاتفكم', 'Scan the QR code to receive your radiology report and images directly on your phone') },
    ], [t]);

    const active = announcements.length > 0 ? announcements : defaults;
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        if (active.length <= 1) return undefined;
        const timer = setInterval(() => setIdx((c) => (c + 1) % active.length), TICKER_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [active.length]);

    const current = active[idx] || active[0];
    const tone = current?.tone || 'info';
    const ToneIcon = tone === 'urgent' ? Megaphone
        : tone === 'warning' ? AlertTriangle
            : tone === 'success' ? CheckCircle2
                : Bell;
    const toneLabel = tone === 'urgent' ? t('عاجل', 'Urgent')
        : tone === 'warning' ? t('تنبيه هام', 'Notice')
            : tone === 'success' ? t('خدمة رقمية', 'Service')
                : t('إعلان', 'Notice');

    return (
        <footer className="vb-ticker" dir={isArabic ? 'rtl' : 'ltr'} role="contentinfo">
            <div className="vb-ticker__msg-container" aria-live="polite">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`ticker-${idx}-${current?.id || ''}`}
                        className="vb-ticker__msg"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.35, ease: 'easeInOut' }}
                    >
                        <span className={`vb-ticker__tone-badge vb-ticker__tone-badge--${tone}`}>
                            <ToneIcon size="1.05em" aria-hidden="true" />
                            <span>{toneLabel}</span>
                        </span>
                        <span className="vb-ticker__msg-text">
                            {current?.message || current?.title || ''}
                        </span>
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="vb-ticker__sync-wrap">
                {isDemoMode ? (
                    <button
                        type="button"
                        onClick={onExitDemo}
                        className="vb-ticker__demo-pill"
                        title={t('انقر لإنهاء المعاينة والعودة للبيانات الحية', 'Click to exit demo')}
                    >
                        <span className="vb-ticker__demo-dot" aria-hidden="true" />
                        <span>{t('معاينة آمنة (Demo)', 'Safe Demo')}</span>
                    </button>
                ) : (
                    <div className="vb-ticker__sync">
                        <span className={`vb-sync-dot${isStale ? ' vb-sync-dot--offline' : ''}`} aria-hidden="true" />
                        <span>{isStale ? t('بيانات غير محدثة', 'Updates paused') : t('مزامنة مباشرة', 'Live sync')}</span>
                    </div>
                )}
            </div>
        </footer>
    );
});
TickerFooter.displayName = 'TickerFooter';

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
const DisplayBoard = () => {
    const systemReducedMotion = useReducedMotion();
    const { i18n } = useTranslation('display');
    const [searchParams, setSearchParams] = useSearchParams();

    /* ── Safe demo mode ─────────────────────────────────────────────────── */
    const [isDemoMode, setIsDemoMode] = useState(() =>
        ['1', 'true'].includes(searchParams.get('preview')) ||
        ['1', 'true'].includes(searchParams.get('demo')) ||
        storage.get('viara_tv_demo_mode') === 'true'
    );
    const isPreview = isDemoMode;

    const toggleDemoMode = useCallback((val) => {
        setIsDemoMode((prev) => {
            const next = typeof val === 'boolean' ? val : !prev;
            storage.set('viara_tv_demo_mode', String(next));
            setSearchParams((sp) => {
                const n = new URLSearchParams(sp);
                if (next) n.set('demo', '1');
                else { n.delete('demo'); n.delete('preview'); }
                return n;
            }, { replace: true });
            return next;
        });
    }, [setSearchParams]);

    /* ── Live data (skipped in preview) ─────────────────────────────────── */
    const { data: board, isLoading, isError, fulfilledTimeStamp } = useGetDisplayBoardQuery(undefined, {
        pollingInterval: POLL_INTERVAL_MS,
        refetchOnFocus: true,
        refetchOnReconnect: true,
        skip: isPreview,
    });
    const displayBoard = isPreview ? PREVIEW_BOARD : board;

    /* ── Config-driven settings (moved from localStorage to backend) ──── */
    const cfg = displayBoard?.config || PREVIEW_BOARD.config;
    const urlTheme = searchParams.get('theme');
    const theme = urlTheme || cfg.theme || 'light';

    /* ── Language ───────────────────────────────────────────────────────── */
    const systemLanguage = i18n.language?.startsWith('ar') ? 'ar' : 'en';
    const urlLang = searchParams.get('lang');
    const displayLanguage = urlLang || cfg.displayLanguage || systemLanguage;
    const isArabic = displayLanguage === 'ar';
    const t = useCallback((ar, en) => (isArabic ? ar : en), [isArabic]);
    usePageTitle(t('شاشة الانتظار والنداء الآلي', 'Clinical Signage & Patient Calling Board'));

    useEffect(() => {
        const previousLanguage = document.documentElement.lang;
        document.documentElement.lang = displayLanguage;
        return () => { document.documentElement.lang = previousLanguage; };
    }, [displayLanguage]);

    /* ── Theme (data-theme + tailwind .dark for coexisting components) ──── */
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add('vb-lock');
        return () => root.classList.remove('vb-lock');
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        const prevTheme = root.getAttribute('data-theme');
        const prevDark = root.classList.contains('dark');
        const prevBg = document.body.style.backgroundColor;

        root.setAttribute('data-theme', theme);
        root.classList.toggle('dark', theme === 'dark');
        document.body.style.backgroundColor = theme === 'dark' ? '#051210' : '#eef7f6';

        return () => {
            if (prevTheme === null) root.removeAttribute('data-theme');
            else root.setAttribute('data-theme', prevTheme);
            root.classList.toggle('dark', prevDark);
            document.body.style.backgroundColor = prevBg;
        };
    }, [theme]);

    /* ── Motion mode: local override initialized from config ────────────── */
    const cfgMotionMode = cfg.motionMode || 'full';
    const [motionMode, setMotionMode] = useState(() => storage.get('viara_tv_motion', cfgMotionMode));
    useEffect(() => {
        if (!storage.get('viara_tv_motion')) {
            setMotionMode(cfgMotionMode);
        }
    }, [cfgMotionMode]);
    const handleSetMotionMode = useCallback((mode) => {
        setMotionMode((prev) => {
            const next = typeof mode === 'function' ? mode(prev) : mode;
            storage.set('viara_tv_motion', next);
            return next;
        });
    }, []);
    const reduceMotion = systemReducedMotion || motionMode === 'reduced';

    /* ── Clock / connectivity / fullscreen ──────────────────────────────── */
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
        return () => clearInterval(timer);
    }, []);

    const [isOnline, setIsOnline] = useState(() => navigator.onLine);
    useEffect(() => {
        const update = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        } catch { /* denied or unsupported */ }
    }, []);

    /* ── Prevent display sleep (Screen Wake Lock API) ─────────────────────── */
    useEffect(() => {
        let wakeLock = null;
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await navigator.wakeLock.request('screen');
                } catch { /* unsupported or battery policy */ }
            }
        };
        requestWakeLock();
        const handleVisibility = () => {
            if (wakeLock !== null && document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            wakeLock?.release().catch(() => {});
        };
    }, []);

    /* ── Sound settings (from config) ───────────────────────────────────── */
    const muteAll = cfg.muteAll === true;
    const quietMode = cfg.quietMode === true;
    const repeatChime = cfg.repeatChime !== false;
    const announcementRate = cfg.announcementRate || 1;
    const announcementRepeatCount = cfg.announcementRepeatCount || 2;
    const announcementRepeatDelay = cfg.announcementRepeatDelay || 1500;
    const announcementVolume = cfg.announcementVolume || 1;
    const announcementPitch = 1;
    const announcementMode = cfg.announcementMode || null;
    const announcementPreset = cfg.announcementPreset || 'standard';
    const announcementLanguage = cfg.announcementLanguage || 'ar';
    const tokenPronunciation = cfg.tokenPronunciation || 'auto';
    const announcementStyle = cfg.announcementStyle || 'formal';
    const customTemplate = cfg.customTemplate || '';
    const pronunciationDictionary = cfg.pronunciationDictionary || '';
    const arabicVoiceURI = cfg.arabicVoiceURI || '';
    const englishVoiceURI = cfg.englishVoiceURI || '';

    const soundEnabled = !muteAll;
    const voiceEnabled = !muteAll && !quietMode;

    /* ── System TTS voices ──────────────────────────────────────────────── */
    const [availableVoices, setAvailableVoices] = useState([]);
    useEffect(() => {
        if (!('speechSynthesis' in window)) return undefined;
        const updateVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
        updateVoices();
        window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
    }, []);

    /* ── Display settings / UI state ────────────────────────────────────── */
    const rotationSpeed = cfg.rotationSpeed || ROOM_PAGE_INTERVAL_MS;
    const showSummaryStats = cfg.showSummaryStats === true;
    const [isRotationPaused, setIsRotationPaused] = useState(false);
    const [headerControlsVisible, setHeaderControlsVisible] = useState(false);
    const headerToolsRef = useRef(null);
    const headerToolsTimerRef = useRef(null);
    const headerKeyboardFocusRef = useRef(false);
    const revealHeaderControls = useCallback((event) => {
        if (event?.type?.startsWith('pointer')) headerKeyboardFocusRef.current = false;
        setHeaderControlsVisible(true);
        clearTimeout(headerToolsTimerRef.current);
        const hideWhenIdle = () => {
            const focused = document.activeElement;
            const keyboardFocus = headerKeyboardFocusRef.current && (headerToolsRef.current?.contains(focused) || focused?.classList.contains('vb-header-access'));
            if (keyboardFocus || focused?.closest('[role="dialog"]')) {
                headerToolsTimerRef.current = setTimeout(hideWhenIdle, 5000);
                return;
            }
            setHeaderControlsVisible(false);
        };
        headerToolsTimerRef.current = setTimeout(hideWhenIdle, 5000);
    }, []);
    useEffect(() => () => clearTimeout(headerToolsTimerRef.current), []);

    /* ── Keyboard shortcuts ─────────────────────────────────────────────── */
    useEffect(() => {
        const onKey = (event) => {
            if (event.key === 'Tab') headerKeyboardFocusRef.current = true;
            if (event.key === 'Escape') {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    /* ── Browser autoplay policy: unlock audio on first gesture ─────────── */
    const [audioBlocked, setAudioBlocked] = useState(false);
    useEffect(() => {
        const check = () => setAudioBlocked(!muteAll && isAudioSuspended());
        check();
        const gesture = async () => {
            await unlockAudio();
            setAudioBlocked(false);
        };
        window.addEventListener('click', gesture);
        window.addEventListener('keydown', gesture);
        window.addEventListener('touchstart', gesture);
        return () => {
            window.removeEventListener('click', gesture);
            window.removeEventListener('keydown', gesture);
            window.removeEventListener('touchstart', gesture);
        };
    }, [muteAll]);

    const lastUpdatedAt = fulfilledTimeStamp
        || (displayBoard?.generatedAt ? new Date(displayBoard.generatedAt).getTime() : 0);
    const isStale = isPreview
        ? false
        : (!isOnline || isError || (lastUpdatedAt > 0 && now.getTime() - lastUpdatedAt > STALE_AFTER_MS));

    /* ── Room filter (URL wins, then persisted) ─────────────────────────── */
    const [selectedRooms, setSelectedRooms] = useState(() => {
        const urlRooms = searchParams.get('rooms');
        if (urlRooms) return urlRooms.split(',').map((r) => r.trim()).filter(Boolean);
        try {
            const parsed = JSON.parse(storage.get('viara_tv_selected_rooms', '[]'));
            return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
        } catch { return []; }
    });

    const handleToggleRoom = useCallback((code) => {
        setSelectedRooms((prev) => {
            const next = prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code];
            storage.set('viara_tv_selected_rooms', JSON.stringify(next));
            return next;
        });
    }, []);

    const handleClearRoomFilter = useCallback(() => {
        setSelectedRooms([]);
        storage.remove('viara_tv_selected_rooms');
    }, []);

    /* ── Calls state ────────────────────────────────────────────────────── */
    const [activeCall, setActiveCall] = useState(() => (isDemoMode ? PREVIEW_LAST_CALL : null));
    const [recentCalls, setRecentCalls] = useState(() => (isDemoMode ? [PREVIEW_LAST_CALL] : []));
    const [suiteIndex, setSuiteIndex] = useState(2);

    useEffect(() => {
        if (isDemoMode) {
            setActiveCall(PREVIEW_LAST_CALL);
            setRecentCalls([PREVIEW_LAST_CALL]);
            setSuiteIndex(2);
        } else {
            setActiveCall(null);
            setRecentCalls([]);
        }
    }, [isDemoMode]);

    /* ── Call queue plumbing ────────────────────────────────────────────── */
    const handledBroadcastIdsRef = useRef(new Set());
    const callQueueRef = useRef([]);
    const isProcessingQueueRef = useRef(false);
    const activeCallTimeoutRef = useRef(null);
    const callMinTimeoutRef = useRef(null);
    const resumeTimeoutRef = useRef(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            callQueueRef.current = [];
            isProcessingQueueRef.current = false;
            clearTimeout(activeCallTimeoutRef.current);
            clearTimeout(callMinTimeoutRef.current);
            clearTimeout(resumeTimeoutRef.current);
            cancelAnnouncement();
        };
    }, []);

    /* ── Privacy / naming derived ───────────────────────────────────────── */
    const namesAllowed = Boolean(displayBoard?.config?.patientDisplayMode && displayBoard.config.patientDisplayMode !== 'order_only');
    const privacyMode = displayBoard?.config?.privacyMode || 'full';
    const showPatientNames = namesAllowed && privacyMode !== 'token_only';
    const configuredCallMode = displayBoard?.config?.callAnnouncementMode || 'token_only';
    // Config override only applies while names are allowed: token-only display
    // can never name patients, whatever the control page says.
    const callAnnouncementMode = showPatientNames ? (announcementMode || configuredCallMode) : 'token_only';

    const formatPatientName = useCallback((name) => {
        if (!name) return '';
        const parts = name.trim().split(/\s+/);
        return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
    }, []);

    /* ── Branding ───────────────────────────────────────────────────────── */
    const center = displayBoard?.center || {};
    const centerLogo = (theme === 'dark' ? center.logoDarkUrl : center.logoLightUrl)
        || center.logoUrl
        || VIARA_BRAND.centerLogoUrl
        || FALLBACK_LOGO;
    const centerName = displayBoard?.config?.boardTitle
        || (isArabic ? center.nameAr : center.name)
        || t('مركز فيارا للأشعة التشخيصية', 'VIARA Diagnostic Center');
    const centerSubtitle = (isArabic ? center.addressAr : center.address)
        || t('صالة الانتظار الرئيسية', 'Main Waiting Hall');
    const summary = displayBoard?.summary || {};

    /* ── Rooms & queues ─────────────────────────────────────────────────── */
    const allRooms = useMemo(
        () => [...(displayBoard?.rooms || [])].sort((a, b) =>
            String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true })
        ),
        [displayBoard?.rooms]
    );

    const displayedRooms = useMemo(() => {
        if (selectedRooms.length > 0) {
            return allRooms.filter((room) => {
                const code = stripRoomLabel(room.room_number);
                return selectedRooms.includes(code) || selectedRooms.includes(String(room.room_number));
            });
        }
        return allRooms;
    }, [allRooms, selectedRooms]);

    const liveWaitingList = useMemo(() => {
        const all = [];
        const seen = new Set();
        displayedRooms.forEach((room) => {
            (room.machines || []).forEach((machine) => {
                [machine.up_next, ...(machine.queue?.next || [])].forEach((caseItem) => {
                    if (!caseItem) return;
                    const id = getCallIdentity(caseItem);
                    if (!id || seen.has(id)) return;
                    seen.add(id);
                    all.push({ caseItem, room });
                });
            });
        });
        return all;
    }, [displayedRooms]);

    const waitingList = isDemoMode ? DEMO_WAITING_LIST : liveWaitingList;
    const waitingTotal = isDemoMode
        ? 12
        : (selectedRooms.length ? waitingList.length : (summary.waiting ?? waitingList.length));

    /* ── Suite rotation ─────────────────────────────────────────────────── */
    const suiteCount = displayedRooms.length;
    const currentSuiteIndex = suiteCount > 0 ? Math.min(suiteIndex, suiteCount - 1) : 0;
    const visibleRoomStart = Math.min(
        Math.floor(currentSuiteIndex / ROOMS_PER_VIEW) * ROOMS_PER_VIEW,
        Math.max(0, suiteCount - ROOMS_PER_VIEW)
    );
    const visibleRooms = displayedRooms.slice(visibleRoomStart, visibleRoomStart + ROOMS_PER_VIEW);

    useEffect(() => {
        if (suiteCount <= 1 || activeCall || isRotationPaused) return undefined;
        const timer = setInterval(() => {
            // Never burn rotations while the TV is on another tab.
            if (!document.hidden) setSuiteIndex((c) => (Math.min(c, suiteCount - 1) + 1) % suiteCount);
        }, rotationSpeed);
        return () => clearInterval(timer);
    }, [suiteCount, activeCall, isRotationPaused, rotationSpeed]);

    useEffect(() => {
        if (!activeCall) return;
        const idx = displayedRooms.findIndex((room) => roomMatchesCall(room, activeCall));
        if (idx >= 0) setSuiteIndex(idx);
    }, [activeCall, displayedRooms]);

    /* ── Announcement options shared by live & test calls ───────────────── */
    const announcementOptions = useMemo(() => ({
        announcementMode: callAnnouncementMode,
        isArabic,
        repeatCount: announcementRepeatCount,
        repeatDelayMs: announcementRepeatDelay,
        chimeBeforeRepeat: repeatChime,
        speechRate: announcementRate,
        speechVolume: announcementVolume,
        speechPitch: announcementPitch,
        preset: announcementPreset,
        announcementLanguage,
        tokenPronunciation,
        announcementStyle,
        customTemplate,
        pronunciationDictionary: parsePronunciationDictionary(pronunciationDictionary),
        arabicVoiceURI,
        englishVoiceURI,
        autoBestVoice: true,
    }), [
        announcementLanguage, announcementPitch, announcementPreset, announcementRate,
        announcementRepeatCount, announcementRepeatDelay, announcementStyle, announcementVolume,
        arabicVoiceURI, callAnnouncementMode, customTemplate, englishVoiceURI, isArabic,
        pronunciationDictionary, repeatChime, tokenPronunciation,
    ]);

    /* ── Call queue processing ──────────────────────────────────────────── */
    const processNextCall = useCallback(() => {
        if (callQueueRef.current.length === 0) {
            isProcessingQueueRef.current = false;
            return;
        }

        clearTimeout(activeCallTimeoutRef.current);
        activeCallTimeoutRef.current = null;
        isProcessingQueueRef.current = true;
        const { item, room, forceNameCall } = callQueueRef.current.shift();

        const orderNumber = item?.order_number ?? item?.queue_number ?? '';
        const tokenNumber = item?.queue_number ?? getSpokenToken(orderNumber) ?? '';
        const rawName = item?.patient_name || '';
        const modeRequestsName = callAnnouncementMode === 'name_only' || callAnnouncementMode === 'token_and_name';
        const shouldCallWithName = forceNameCall && modeRequestsName && showPatientNames && Boolean(rawName);
        const effectiveMode = shouldCallWithName ? callAnnouncementMode : 'token_only';
        const roomCode = room?.room_number != null ? stripRoomLabel(room.room_number) : '';
        const roomName = String(room?.room_name || (roomCode ? `${isArabic ? 'جناح' : 'Suite'} ${roomCode}` : '')).trim();

        const newCall = {
            id: `${Date.now()}-${tokenNumber}`,
            tokenNumber,
            sourceOrderNumber: orderNumber,
            patientName: showPatientNames ? rawName : '',
            gender: showPatientNames ? (item?.gender || item?.patient_gender || null) : null,
            calledWithName: shouldCallWithName,
            announcementMode: effectiveMode,
            roomName,
            roomCode,
            time: new Date(),
        };

        setActiveCall(newCall);
        setRecentCalls((prev) => [newCall, ...prev.filter((c) => c.tokenNumber !== tokenNumber)].slice(0, EARLIER_CALLS_SHOWN + 1));

        const targetIdx = displayedRooms.findIndex((r) => roomMatchesCall(r, { roomName, room_number: roomCode }));
        if (targetIdx >= 0) setSuiteIndex(targetIdx);

        // The banner needs the call visible for a minimum window and until
        // speech finishes — whichever takes longer — before moving on.
        let isMinTimeElapsed = false;
        let isSpeechFinished = !voiceEnabled;

        const tryFinish = () => {
            if (!isMountedRef.current) return;
            if (!isMinTimeElapsed || !isSpeechFinished) return;
            if (callQueueRef.current.length > 0) {
                processNextCall();
                return;
            }
            isProcessingQueueRef.current = false;
            clearTimeout(activeCallTimeoutRef.current);
            activeCallTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) setActiveCall(null);
            }, Math.max(5000, CALL_BANNER_DURATION_MS - 8000));
        };

        clearTimeout(callMinTimeoutRef.current);
        callMinTimeoutRef.current = setTimeout(() => {
            isMinTimeElapsed = true;
            tryFinish();
        }, CALL_MIN_VISIBLE_MS);

        if (voiceEnabled) {
            announcePatientCall({
                ...announcementOptions,
                tokenNumber,
                patientName: shouldCallWithName ? rawName : '',
                roomName,
                announcementMode: effectiveMode,
                gender: item?.gender || item?.patient_gender,
                withChime: soundEnabled,
                onAllFinished: () => { isSpeechFinished = true; tryFinish(); },
            });
        } else {
            isSpeechFinished = true;
            if (soundEnabled) playHospitalChime();
            tryFinish();
        }
    }, [announcementOptions, callAnnouncementMode, displayedRooms, isArabic, showPatientNames, soundEnabled, voiceEnabled]);

    const triggerPatientCall = useCallback((item, room, forceNameCall = true) => {
        if (isStale) return;
        callQueueRef.current.push({ item, room, forceNameCall });
        if (!isProcessingQueueRef.current) processNextCall();
    }, [isStale, processNextCall]);

    const handleBroadcastCall = useCallback((data, { allowOlder = false } = {}) => {
        if (!data || isStale || isDemoMode) return;

        const identity = getBroadcastIdentity(data);
        if (!identity || handledBroadcastIdsRef.current.has(identity)) return;

        // Ignore broadcasts older than the replay window unless the push
        // channel vouches for freshness — avoids calling stale rows from the
        // poll payload right after page load.
        const timestamp = Number(data.timestamp) || Date.parse(data.calledAt || data.called_at || '');
        if (!allowOlder && Number.isFinite(timestamp) && Date.now() - timestamp > BROADCAST_REPLAY_WINDOW_MS) {
            handledBroadcastIdsRef.current.add(identity);
            return;
        }

        handledBroadcastIdsRef.current.add(identity);
        if (handledBroadcastIdsRef.current.size > HANDLED_CALLS_MAX) {
            handledBroadcastIdsRef.current = new Set([...handledBroadcastIdsRef.current].slice(-HANDLED_CALLS_KEEP));
        }

        const token = data.queueNumber != null
            ? String(data.queueNumber)
            : (getSpokenToken(data.orderNumber) || data.orderNumber || '');
        const matchedRoom = allRooms.find((room) => roomMatchesCall(room, { roomName: data.roomName }));
        const room = matchedRoom || { room_name: data.roomName || '', room_number: stripRoomLabel(data.roomName) };

        triggerPatientCall(
            {
                order_number: data.orderNumber,
                queue_number: token,
                patient_name: showPatientNames ? (data.patientName || '') : '',
                gender: data.gender || data.patientGender || data.patient_gender,
            },
            room,
            data.callByName !== false
        );
    }, [allRooms, isDemoMode, isStale, showPatientNames, triggerPatientCall]);

    /* Polling fallback — replay board-delivered calls in chronological order */
    useEffect(() => {
        [...(displayBoard?.broadcastCalls || [])]
            .sort((a, b) => (Number(a.timestamp) || Date.parse(a.calledAt || 0)) - (Number(b.timestamp) || Date.parse(b.calledAt || 0)))
            .forEach((call) => handleBroadcastCall(call));
    }, [displayBoard?.broadcastCalls, handleBroadcastCall]);

    /* SSE push channel */
    useEffect(() => {
        const handler = (event) => handleBroadcastCall(event.detail, { allowOlder: true });
        window.addEventListener('SSE_DISPLAY_CALL', handler);
        return () => window.removeEventListener('SSE_DISPLAY_CALL', handler);
    }, [handleBroadcastCall]);

    /* ── Derived render values ──────────────────────────────────────────── */
    const liveCall = activeCall && !isStale
        ? (showPatientNames ? activeCall : { ...activeCall, patientName: '' })
        : null;
    const currentCallBannerData = liveCall || recentCalls[0] || null;
    const currentFocusSuite = displayedRooms[currentSuiteIndex] || null;
    const timeData = formatTime(now, isArabic);
    const dateText = formatDate(now, isArabic);

    const pickDemoRoom = (number, fallbackIdx) =>
        allRooms.find((r) => String(r.room_number) === number) || allRooms[fallbackIdx] || {};

    /* ── Loading ────────────────────────────────────────────────────────── */
    if (isLoading) {
        return (
            <div className="vb-root vb-loading" data-theme={theme} data-motion={reduceMotion ? 'reduced' : 'full'} dir={isArabic ? 'rtl' : 'ltr'}>
                <div className="vb-loading__mark">
                    <img src={centerLogo} alt="" onError={handleLogoError} />
                    <span className="vb-loading__orbit" aria-hidden="true" />
                </div>
                <h2>{t('جاري تهيئة شاشة صالة الانتظار', 'Starting the waiting room display')}</h2>
                <p>{t('يرجى الانتظار لحظات', 'Connecting to the live queue')}</p>
                <div className="vb-loading__bar" aria-hidden="true"><span /></div>
            </div>
        );
    }

    /* ── Render ─────────────────────────────────────────────────────────── */
    return (
        <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
            <div
                className="vb-root"
                data-theme={theme}
                data-motion={reduceMotion ? 'reduced' : 'full'}
                dir={isArabic ? 'rtl' : 'ltr'}
                style={{ '--vb-dir': isArabic ? -1 : 1 }}
            >
                {audioBlocked && !muteAll && (
                    <button
                        type="button"
                        className="vb-unlock"
                        onClick={async () => { await unlockAudio(); setAudioBlocked(false); }}
                    >
                        <Volume2 size={16} aria-hidden="true" />
                        <span>{t('🔊 انقر هنا أو اضغط أي زر لتفعيل النداء الصوتي للشاشة', '🔊 Click anywhere to enable voice announcements')}</span>
                    </button>
                )}

                <header className="vb-header" onPointerMove={revealHeaderControls} onPointerDown={revealHeaderControls}>
                    <div className="vb-header__brand">
                        <div className="vb-header__logo-card">
                            <img src={centerLogo} alt={centerName} className="vb-header__logo" onError={handleLogoError} />
                        </div>
                        <div className="vb-header__divider" aria-hidden="true" />
                        <div className="vb-header__names">
                            <div className="vb-header__title-row">
                                <h1 className="vb-header__title">{centerName}</h1>
                            </div>
                            <div className="vb-header__subtitle-row">
                                <MapPin size="0.82em" aria-hidden="true" />
                                <span>{centerSubtitle}</span>
                            </div>
                        </div>
                    </div>

                    <div className="vb-header__center">
                        <div className="vb-capsule">
                            <div className="vb-capsule__item vb-capsule__item--metrics">
                                <div className="vb-capsule__metric">
                                    <Users size="0.95em" aria-hidden="true" />
                                    <span className="vb-capsule__metric-label">{t('في الفحص', 'In Exam')}:</span>
                                    <strong className="vb-capsule__metric-value vb-capsule__metric-value--blue">{summary.inExam ?? 0}</strong>
                                </div>
                            </div>

                            <div className="vb-capsule__divider" aria-hidden="true" />

                            <div className={`vb-capsule__item vb-capsule__live${isStale ? ' vb-capsule__live--offline' : ''}`}>
                                <span>{isStale ? t('غير متصل', 'Offline') : isDemoMode ? t('عرض تجريبي', 'Demo') : t('مباشر', 'Live')}</span>
                                <span className="vb-live-dot" aria-hidden="true">
                                    <span className="vb-live-dot__ping" />
                                    <span className="vb-live-dot__core" />
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="vb-header-tools" ref={headerToolsRef} hidden={!headerControlsVisible} onFocusCapture={revealHeaderControls} onBlurCapture={revealHeaderControls} role="group" aria-label={t('أدوات التحكم بالشاشة', 'Display controls')}>
                        <div className="vb-dock">
                            <button
                                type="button"
                                className="vb-dock__btn"
                                onClick={toggleFullscreen}
                                aria-label={isFullscreen ? t('إنهاء ملء الشاشة', 'Exit fullscreen') : t('ملء الشاشة', 'Fullscreen')}
                            >
                                {isFullscreen ? <Minimize size="1.05em" /> : <Maximize size="1.05em" />}
                            </button>
                            <button type="button" className={`vb-dock__btn ${reduceMotion ? 'vb-dock__btn--active' : ''}`} onClick={() => handleSetMotionMode(mode => mode === 'full' ? 'reduced' : 'full')} aria-pressed={reduceMotion} disabled={Boolean(systemReducedMotion)} aria-label={t('تقليل الحركة', 'Reduce motion')} title={t('تقليل الحركة', 'Reduce motion')}>
                                <Sparkles size="1.05em" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    <div className="vb-header__left">
                        <div className="vb-header__clock">
                            <div className="vb-header__time" dir="ltr">
                                <span className="vb-header__time-numbers">{timeData.time}</span>
                                <span className="vb-header__time-period">{timeData.period}</span>
                            </div>
                            <div className="vb-header__date">
                                <span>{dateText}</span>
                            </div>
                        </div>
                    </div>
                </header>

                <AnimatePresence>
                    {liveCall && (
                        <FloatingCallOverlay
                            key={liveCall.id}
                            call={liveCall}
                            isArabic={isArabic}
                            formatName={formatPatientName}
                            onDismiss={() => setActiveCall(null)}
                        />
                    )}
                </AnimatePresence>

                {isStale && (
                    <div className="vb-offline" role="status" aria-live="polite">
                        <WifiOff size="1.1em" aria-hidden="true" />
                        <span>{t('انقطع الاتصال بالخادم — قد لا تكون البيانات المعروضة محدّثة', 'Connection lost — displayed data may be out of date')}</span>
                    </div>
                )}

                {showSummaryStats && (
                    <section className="vb-summary">
                        <span>{t('الانتظار', 'Waiting')} <strong>{summary.waiting ?? 0}</strong></span>
                        <span>{t('قيد الفحص', 'In exam')} <strong>{summary.inExam ?? 0}</strong></span>
                        <span>{t('مكتمل اليوم', 'Completed today')} <strong>{summary.completedToday ?? 0}</strong></span>
                        <span>{t('متوسط الانتظار', 'Average wait')} <strong>{summary.averageWaitingMinutes ?? 0} {t('د', 'min')}</strong></span>
                    </section>
                )}

                <main className="vb-main">
                    <aside className="vb-sidebar" aria-label={t('قائمة الانتظار والإعلانات', 'Waiting list and notices')}>
                        <WaitingListCard
                            items={waitingList}
                            total={waitingTotal}
                            isArabic={isArabic}
                            liveCall={liveCall}
                            showPatientNames={showPatientNames}
                            formatName={formatPatientName}
                        />
                        <GuidanceCard announcements={displayBoard?.announcements} isArabic={isArabic} />
                        <PortalCard isArabic={isArabic} />
                    </aside>

                    <div className="vb-stage">
                        <LastCallBanner
                            call={currentCallBannerData}
                            isArabic={isArabic}
                            isLiveCall={Boolean(liveCall)}
                        />

                        <div
                            className="vb-suite-tabs"
                            role="tablist"
                            aria-label={t('أجنحة الفحص', 'Suites')}
                            style={{ '--vb-suite-count': Math.max(1, visibleRooms.length) }}
                        >
                            {visibleRooms.map((room, visibleIndex) => {
                                const idx = visibleRoomStart + visibleIndex;
                                const mod = getSuiteModality(room, t);
                                const ModIcon = mod.icon;
                                const isActive = idx === currentSuiteIndex;
                                const code = stripRoomLabel(room.room_number) || `0${idx + 1}`;
                                const machine = room.machines?.[0] || {};
                                const isBusy = Boolean(machine.current);

                                return (
                                    <button
                                        key={room.room_id || room.room_number || idx}
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        onClick={() => {
                                            setSuiteIndex(idx);
                                            setIsRotationPaused(true);
                                            clearTimeout(resumeTimeoutRef.current);
                                            resumeTimeoutRef.current = setTimeout(() => setIsRotationPaused(false), ROTATION_RESUME_MS);
                                        }}
                                        className={`vb-suite-tab vb-suite-tab--${mod.type}${isActive ? ' vb-suite-tab--active' : ''}`}
                                    >
                                        {isActive && !isRotationPaused && !reduceMotion && (
                                            <div className="vb-suite-tab__progress" aria-hidden="true">
                                                <motion.div
                                                    key={`progress-${idx}-${rotationSpeed}`}
                                                    className="vb-suite-tab__progress-bar"
                                                    initial={{ scaleX: 0 }}
                                                    animate={{ scaleX: 1 }}
                                                    transition={{ duration: rotationSpeed / 1000, ease: 'linear' }}
                                                    style={{ originX: isArabic ? 1 : 0 }}
                                                />
                                            </div>
                                        )}

                                        <div className="vb-suite-tab__icon-wrap">
                                            <ModIcon size="1.35em" />
                                        </div>
                                        <div className="vb-suite-tab__info">
                                            <span className="vb-suite-tab__name">{t('جناح', 'Suite')} {code}</span>
                                            <span className="vb-suite-tab__mod">{mod.tag}</span>
                                        </div>
                                        <div className="vb-suite-tab__status">
                                            <span>{isBusy ? t('قيد الفحص', 'In Exam') : t('متاح', 'Available')}</span>
                                            <span className={`vb-suite-tab__status-dot${isBusy ? ' vb-suite-tab__status-dot--busy' : ''}`} aria-hidden="true" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <SuiteFocusCard
                            key={currentFocusSuite?.room_id || currentFocusSuite?.room_number || currentSuiteIndex}
                            suite={currentFocusSuite}
                            isArabic={isArabic}
                            formatName={formatPatientName}
                            isCalling={Boolean(liveCall) && roomMatchesCall(currentFocusSuite, liveCall)}
                            showPatientNames={showPatientNames}
                        />
                    </div>
                </main>

                {displayBoard?.config?.showTicker !== false && (
                    <TickerFooter
                        displayBoard={displayBoard}
                        isArabic={isArabic}
                        isStale={isStale}
                        isDemoMode={isDemoMode}
                        onExitDemo={() => toggleDemoMode(false)}
                    />
                )}

                {isDemoMode && (
                    <aside className="vb-demo-bar" aria-label={t('شريط المعاينة الآمنة', 'Demo toolbar')}>
                        <div className="vb-demo-bar__badge">
                            <Radio size="1em" aria-hidden="true" />
                            <span>{t('معاينة تجريبية آمنة', 'Safe Preview')}</span>
                        </div>

                        <div className="vb-demo-bar__divider" aria-hidden="true" />

                        <div className="vb-demo-bar__actions">
                            <button
                                type="button"
                                className="vb-demo-bar__btn vb-demo-bar__btn--male"
                                onClick={() => triggerPatientCall(
                                    { order_number: '105', queue_number: '105', patient_name: t('محمد أحمد', 'Mohamed Ahmed'), gender: 'male' },
                                    pickDemoRoom('03', 0),
                                    true
                                )}
                            >
                                <Megaphone size="1em" aria-hidden="true" />
                                <span>{t('نداء: السيد', 'Call: Mr.')}</span>
                            </button>

                            <button
                                type="button"
                                className="vb-demo-bar__btn vb-demo-bar__btn--female"
                                onClick={() => triggerPatientCall(
                                    { order_number: '108', queue_number: '108', patient_name: t('سارة محمود', 'Sarah Mahmoud'), gender: 'female' },
                                    pickDemoRoom('02', 1),
                                    true
                                )}
                            >
                                <Megaphone size="1em" aria-hidden="true" />
                                <span>{t('نداء: السيدة', 'Call: Ms.')}</span>
                            </button>

                            <button
                                type="button"
                                className="vb-demo-bar__btn"
                                onClick={() => triggerPatientCall(
                                    { order_number: '110', queue_number: '110' },
                                    pickDemoRoom('04', 2),
                                    false
                                )}
                            >
                                <Hash size="1em" aria-hidden="true" />
                                <span>{t('الدور فقط', 'Token only')}</span>
                            </button>
                        </div>

                        <div className="vb-demo-bar__divider" aria-hidden="true" />

                        <div className="vb-demo-bar__actions">
                            <button
                                type="button"
                                className="vb-demo-bar__btn vb-demo-bar__btn--link"
                                onClick={() => window.open('/display/control', '_blank', 'noopener,noreferrer')}
                            >
                                <Settings2 size="1em" aria-hidden="true" />
                                <span>{t('الإعدادات', 'Settings')}</span>
                            </button>

                            <button
                                type="button"
                                className="vb-demo-bar__btn vb-demo-bar__btn--exit"
                                onClick={() => toggleDemoMode(false)}
                            >
                                <X size="1em" aria-hidden="true" />
                                <span>{t('إنهاء المعاينة', 'Exit Preview')}</span>
                            </button>
                        </div>
                    </aside>
                )}

            </div>
        </MotionConfig>
    );
};

export default DisplayBoard;
