import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Maximize,
    Minimize,
    Volume2,
    VolumeX,
    Radio,
    Clock3,
    Activity,
    DoorClosed,
    Users,
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    X,
    Sparkles,
    Shield,
    Bell,
    PhoneCall
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetDisplayBoardQuery } from '../../store/api';
import { playHospitalChime } from '../../utils/audioChime';
import { announcePatientCall } from '../../utils/speechAnnouncement';

export const PublicQueueDisplayModal = ({
    isOpen,
    onClose,
    externalUrl = '/display'
}) => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [privacyMode, setPrivacyMode] = useState('masked'); // 'masked' | 'full' | 'token_only'
    const [currentTime, setCurrentTime] = useState(new Date());
    const [lastCalledCase, setLastCalledCase] = useState(null);

    // Poll board data every 10 seconds
    const { data: boardData, isLoading, refetch } = useGetDisplayBoardQuery(undefined, {
        pollingInterval: 10000,
        skip: !isOpen
    });

    // Digital clock tick
    useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, [isOpen]);

    // Handle Escape key and body scroll lock
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = prevOverflow;
        };
    }, [isOpen, onClose]);

    // Fullscreen toggle handler
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
            setIsFullscreen(true);
        } else {
            document.exitFullscreen().catch(() => {});
            setIsFullscreen(false);
        }
    };

    const handleCallPatient = useCallback((patient, room) => {
        const tokenNumber = patient?.order_number || '---';
        const patientName = privacyMode === 'full' ? patient?.patient_name : '';
        const roomName = (room?.room_name || `جناح ${room?.room_number}`).replace(/Room\s+/gi, '');

        if (soundEnabled) {
            announcePatientCall({
                tokenNumber,
                patientName,
                roomName,
                isArabic,
                withChime: true
            });
        }
        setLastCalledCase({
            patient,
            room,
            time: new Date()
        });
    }, [isArabic, privacyMode, soundEnabled]);

    // Format patient display by privacy mode
    const formatPatientName = (name, orderNumber) => {
        if (!name && !orderNumber) return isArabic ? 'حالة فحص' : 'Patient';
        if (privacyMode === 'token_only') return `#${orderNumber || '---'}`;
        if (privacyMode === 'masked' && name) {
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return parts[0];
            return `${parts[0]} ${parts[parts.length - 1][0]}.`;
        }
        return name || `#${orderNumber}`;
    };

    const rooms = Array.isArray(boardData?.rooms) ? boardData.rooms : [];

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex flex-col bg-slate-950 text-white overflow-hidden select-none"
            dir={isArabic ? 'rtl' : 'ltr'}
        >
            {/* Ambient Background Glows */}
            <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

            {/* Top Bar / Header */}
            <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-900/90 px-6 py-3.5 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg shadow-emerald-950/40 ring-2 ring-emerald-400/50 shrink-0">
                        <img
                            src={boardData?.center?.logoLightUrl || boardData?.center?.logoUrl || '/center-logo.png'}
                            alt={boardData?.center?.name_ar || (isArabic ? 'مركز طيبة للأشعة' : 'Tiba Scan Center')}
                            className="h-full w-full object-contain"
                            onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = '/center-logo.png';
                            }}
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base sm:text-lg font-black text-white">
                                {boardData?.center?.name_ar || (isArabic ? 'مركز طيبة للأشعة' : 'Tiba Scan Center')}
                            </h1>
                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-black text-emerald-400 ring-1 ring-emerald-500/30">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                                {isArabic ? 'بث مباشر' : 'Live Display'}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-semibold mt-0.5 hidden sm:block">
                            {isArabic
                                ? 'يرجى مراقبة رقم الدور والتوجه فوراً للجناح السريري المحدد عند نداء الحالة'
                                : 'Please monitor your token number and proceed to the designated suite when called'}
                        </p>
                    </div>
                </div>

                {/* Controls: Clock, Sound, Privacy, Pop-out, Fullscreen, Prominent Close Button */}
                <div className="flex items-center gap-2 sm:gap-2.5">
                    {/* Live Digital Clock */}
                    <div className="hidden md:flex flex-col items-end rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-1 shadow-inner">
                        <span className="font-mono text-sm font-black text-teal-400 tabular-nums">
                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className="text-[9.5px] text-slate-400 font-bold">
                            {currentTime.toLocaleDateString(isArabic ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                    </div>

                    {/* Sound Toggle */}
                    <button
                        type="button"
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`p-2 rounded-xl border transition ${
                            soundEnabled
                                ? 'border-teal-500/40 bg-teal-500/15 text-teal-300 shadow-sm'
                                : 'border-slate-800 bg-slate-900 text-slate-500 hover:text-slate-400'
                        }`}
                        title={soundEnabled ? (isArabic ? 'تنبيه الجرس مفعل' : 'Chime enabled') : (isArabic ? 'كتم الصوت' : 'Muted')}
                    >
                        {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>

                    {/* Privacy Toggle */}
                    <button
                        type="button"
                        onClick={() => {
                            setPrivacyMode(prev => prev === 'masked' ? 'token_only' : prev === 'token_only' ? 'full' : 'masked');
                        }}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition text-xs font-bold flex items-center gap-1.5"
                        title={isArabic ? 'تغيير نمط خصوصية أسماء المرضى' : 'Toggle Patient Privacy Mode'}
                    >
                        <Shield size={14} className="text-cyan-400" />
                        <span className="hidden lg:inline text-[11px]">
                            {privacyMode === 'masked' ? (isArabic ? 'حماية الاسم' : 'Masked') : privacyMode === 'token_only' ? (isArabic ? 'أرقام فقط' : 'Token Only') : (isArabic ? 'اسم كامل' : 'Full Name')}
                        </span>
                    </button>

                    {/* Pop out to dedicated display tab */}
                    <button
                        type="button"
                        onClick={() => window.open(externalUrl, '_blank', 'noopener,noreferrer')}
                        className="px-2.5 py-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 transition text-xs font-black flex items-center gap-1.5"
                        title={isArabic ? 'فتح في نافذة مستقلة للشاشة الخارجية' : 'Open in pop-out tab for external screen'}
                    >
                        <ExternalLink size={14} />
                        <span className="hidden sm:inline text-[11px]">{isArabic ? 'شاشة خارجية' : 'External Screen'}</span>
                    </button>

                    {/* Fullscreen Button */}
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition"
                        title={isFullscreen ? (isArabic ? 'إنهاء ملء الشاشة' : 'Exit Fullscreen') : (isArabic ? 'ملء الشاشة' : 'Fullscreen')}
                    >
                        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>

                    {/* Prominent Close & Return Button */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-500/20 px-3 py-1.5 text-xs font-black text-rose-200 hover:bg-rose-500/30 hover:border-rose-400 transition shadow-sm active:scale-95"
                        title={isArabic ? 'إغلاق الشاشة والعودة للاستقبال' : 'Close and return to reception desk'}
                    >
                        <X size={15} />
                        <span>{isArabic ? 'إغلاق الشاشة' : 'Close'}</span>
                    </button>
                </div>
            </header>

            {/* Last Called Patient Alert Banner (Animated via Framer Motion) */}
            <AnimatePresence>
                {lastCalledCase && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="relative z-20 mx-6 mt-4 flex items-center justify-between rounded-2xl border-2 border-amber-400/80 bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/20 px-5 py-3 shadow-xl shadow-amber-500/10"
                    >
                        <div className="flex items-center gap-3.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950 font-black animate-bounce">
                                <Bell size={20} />
                            </div>
                            <div>
                                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                                    {isArabic ? 'نداء للحالة التالية الآن:' : 'Now Calling Patient:'}
                                </span>
                                <h3 className="text-base font-black text-white">
                                    {formatPatientName(lastCalledCase.patient?.patient_name, lastCalledCase.patient?.order_number)}
                                    <span className="ms-2 font-mono text-sm text-amber-300">
                                        (#{lastCalledCase.patient?.order_number || '---'})
                                    </span>
                                    <span className="ms-3 text-sm font-bold text-slate-300">
                                        &rarr; {isArabic ? 'يرجى التوجه إلى' : 'Proceed to'}: {lastCalledCase.room?.room_name || lastCalledCase.room?.room_number}
                                    </span>
                                </h3>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setLastCalledCase(null)}
                            className="text-slate-400 hover:text-white text-xs font-bold"
                        >
                            {isArabic ? 'إغلاق' : 'Dismiss'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content: Grouped by Rooms & Modalities */}
            <main className="relative z-10 flex-1 overflow-y-auto p-6 scrollbar-none">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center">
                        <div className="text-center space-y-3">
                            <Radio size={40} className="mx-auto text-teal-400 animate-pulse" />
                            <p className="text-xs font-black text-slate-400">
                                {isArabic ? 'جاري مزامنة شاشة أدوار الحالات...' : 'Synchronizing queue board...'}
                            </p>
                        </div>
                    </div>
                ) : rooms.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                        <div className="rounded-3xl border border-dashed border-slate-800 p-16 text-center max-w-md">
                            <DoorClosed size={48} className="mx-auto text-slate-700" />
                            <h3 className="mt-4 text-base font-black text-slate-300">
                                {isArabic ? 'لا توجد أجنحة أو حالات انتظار حالياً' : 'No active queues at this time'}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                                {isArabic ? 'ستظهر الحالات هنا فور تسجيلها وحضورها للاستقبال' : 'Arrived cases will automatically appear here'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-start">
                        {rooms.map((room) => {
                            const machines = room.machines || [];
                            const isRoomActive = room.room_status === 'Active';
                            const cleanRoomCode = String(room.room_number || 'RM').replace(/^Room\s*/i, '').trim() || room.room_number;
                            const displayRoomName = (room.room_name || `جناح ${room.room_number}`).replace(/Room\s+/gi, '');

                            return (
                                <motion.div
                                    key={room.room_id || room.room_number}
                                    layout
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.35 }}
                                    className={`flex flex-col justify-between rounded-3xl border p-5 shadow-xl transition-all ${
                                        isRoomActive
                                            ? 'border-slate-800 bg-slate-900/80 backdrop-blur-md hover:border-slate-700'
                                            : 'border-amber-900/40 bg-amber-950/20'
                                    }`}
                                >
                                    <div>
                                        {/* Room Header */}
                                        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span className="flex h-9 min-w-9 px-2 items-center justify-center rounded-xl bg-teal-500/15 text-teal-400 font-mono text-xs font-black shrink-0">
                                                    {cleanRoomCode}
                                                </span>
                                                <div className="min-w-0">
                                                    <h2 className="text-sm font-black text-white truncate">
                                                        {displayRoomName}
                                                    </h2>
                                                    <p className="text-[11px] text-slate-400 font-semibold truncate">
                                                        {machines.map(m => m.machine_name).join(', ') || (isArabic ? 'جناح فحص' : 'Suite')}
                                                    </p>
                                                </div>
                                            </div>

                                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isRoomActive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                        </div>

                                        {/* Machines within Room */}
                                        {machines.map((machine) => {
                                            const currentCase = machine.current;
                                            const nextCase = machine.up_next || machine.queue?.next?.[0];
                                            const queueList = machine.queue?.next || [];
                                            const waitingCount = machine.queue?.count || 0;

                                            return (
                                                <div key={machine.machine_id} className="space-y-4">
                                                    {/* 1. NOW IN EXAM (داخل الفحص الآن) */}
                                                    <div className="rounded-2xl border border-teal-500/40 bg-gradient-to-br from-teal-500/15 to-slate-900 p-4 shadow-lg shadow-teal-950/40">
                                                        <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-teal-300 mb-2">
                                                            <span className="flex items-center gap-1.5">
                                                                <span className="h-2 w-2 rounded-full bg-teal-400 animate-ping" />
                                                                {isArabic ? 'داخل الفحص الآن' : 'Now in Scan'}
                                                            </span>
                                                            {currentCase?.elapsed_minutes !== null && currentCase?.elapsed_minutes !== undefined && (
                                                                <span className="flex items-center gap-1 text-[10px] text-teal-200">
                                                                    <Clock3 size={11} />
                                                                    {currentCase.elapsed_minutes} {isArabic ? 'دقيقة' : 'min'}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {currentCase ? (
                                                            <div>
                                                                <div className="flex items-center justify-between">
                                                                    <div className="font-mono text-2xl font-black text-white">
                                                                        #{currentCase.order_number || '---'}
                                                                    </div>
                                                                    {currentCase.priority === 'Emergency' && (
                                                                        <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-black text-rose-300 border border-rose-500/30">
                                                                            {isArabic ? 'طوارئ' : 'STAT'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="mt-1 text-xs font-black text-teal-100 truncate">
                                                                    {formatPatientName(currentCase.patient_name, currentCase.order_number)}
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <div className="py-2 text-center text-xs font-semibold text-slate-500 italic">
                                                                {isArabic ? 'الغرفة جاهزة لاستقبال الحالة' : 'Ready for next patient'}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 2. UP NEXT / CALLING (الحالة التالية) */}
                                                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                                                        <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-amber-300 mb-1.5">
                                                            <span>{isArabic ? 'الحالة التالية للتجهيز' : 'Up Next'}</span>
                                                            {nextCase && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCallPatient(nextCase, room)}
                                                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-300 hover:bg-amber-500/30 transition"
                                                                >
                                                                    <PhoneCall size={10} />
                                                                    {isArabic ? 'نداء' : 'Call'}
                                                                </button>
                                                            )}
                                                        </div>

                                                        {nextCase ? (
                                                            <div className="flex items-center justify-between">
                                                                <div className="min-w-0">
                                                                    <span className="font-mono text-sm font-black text-white block">
                                                                        #{nextCase.order_number || '---'}
                                                                    </span>
                                                                    <span className="text-xs font-bold text-slate-300 truncate block">
                                                                        {formatPatientName(nextCase.patient_name, nextCase.order_number)}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[10px] font-black text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg">
                                                                    {isArabic ? 'استعد للدخول' : 'Get Ready'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <p className="text-[11px] text-slate-500 italic">
                                                                {isArabic ? 'لا توجد حالات تالية حالياً' : 'No upcoming cases queued'}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* 3. WAITING QUEUE IN LINE */}
                                                    <div>
                                                        <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2">
                                                            <span>{isArabic ? 'في الانتظار' : 'In Waiting'}</span>
                                                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-black text-slate-300">
                                                                {waitingCount}
                                                            </span>
                                                        </div>

                                                        {queueList.length === 0 ? (
                                                            <p className="text-[11px] text-slate-600 italic">
                                                                {isArabic ? 'قائمة الانتظار فارغة' : 'Waiting line is clear'}
                                                            </p>
                                                        ) : (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {queueList.map((item, idx) => (
                                                                    <span
                                                                        key={idx}
                                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-800/80 px-2 py-1 font-mono text-[11px] font-black text-slate-200"
                                                                    >
                                                                        #{item.order_number || '---'}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Bottom Infinite Announcement Ticker (Motion Powered) */}
            <footer className="relative z-10 border-t border-slate-800/80 bg-slate-900/95 px-6 py-2.5 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-teal-400 shrink-0">
                        <Sparkles size={14} />
                        <span>{isArabic ? 'إرشادات الانتظار:' : 'Announcements:'}</span>
                    </div>

                    <div className="overflow-hidden whitespace-nowrap flex-1 text-xs text-slate-300 font-semibold">
                        <motion.div
                            animate={{ x: isArabic ? [1000, -1000] : [-1000, 1000] }}
                            transition={{ repeat: Infinity, duration: 30, ease: 'linear' }}
                            className="inline-block"
                        >
                            {isArabic
                                ? '• يرجى إبراز بطاقة الرقم القومي أو جواز السفر عند شباك الاستقبال • يرجى إبلاغ فني الأشعة بأي دعامات معدنية أو حساسية مسبقة للصبغة • نرجو المحافظة على الهدوء في صالات الانتظار • نتمنى لكم الشفاء العاجل'
                                : '• Please present your ID card at the reception counter • Inform the technologist of any metal implants or allergies • Please maintain quietness in waiting lounges'}
                        </motion.div>
                    </div>
                </div>
            </footer>
        </div>,
        document.body
    );
};

export default PublicQueueDisplayModal;
