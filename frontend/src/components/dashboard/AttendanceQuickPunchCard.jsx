import React, { useState, useEffect } from 'react';
import {
    Clock, LogIn, LogOut, Calendar, DoorOpen, AlertCircle,
    CheckCircle2, ShieldCheck, ChevronRight, ArrowUpRight, Sparkles, MapPin
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../ui/ConfirmDialog';

const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const AttendanceQuickPunchCard = ({
    isOpen,
    onClose,
    isClockedIn,
    activeSession,
    onClockIn,
    onClockOut,
    onRequestPermission,
    onNavigateShifts,
    isUpdating,
    user,
    isRtl
}) => {
    const { t, i18n } = useTranslation(['workspace', 'common']);
    const isArabic = i18n.language.startsWith('ar');

    const [currentTime, setCurrentTime] = useState(new Date());
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [notes, setNotes] = useState('');
    const [showConfirmClockOut, setShowConfirmClockOut] = useState(false);

    // Live clock ticker
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Active session duration counter
    useEffect(() => {
        if (!isClockedIn || !activeSession?.clock_in) {
            setElapsedSeconds(0);
            return;
        }

        const clockInTime = new Date(activeSession.clock_in).getTime();
        const updateElapsed = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((now - clockInTime) / 1000));
            setElapsedSeconds(diff);
        };

        updateElapsed();
        const interval = setInterval(updateElapsed, 1000);
        return () => clearInterval(interval);
    }, [isClockedIn, activeSession?.clock_in]);

    if (!isOpen) return null;

    const formattedTime = currentTime.toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const formattedDate = currentTime.toLocaleDateString(isArabic ? 'ar-EG' : 'en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });

    const clockInFormatted = activeSession?.clock_in
        ? new Date(activeSession.clock_in).toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        })
        : null;

    const handleClockInAction = async () => {
        await onClockIn(notes);
        setNotes('');
        onClose();
    };

    const handleClockOutConfirmed = async () => {
        setShowConfirmClockOut(false);
        await onClockOut(notes);
        setNotes('');
        onClose();
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Popover Card */}
            <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className="absolute end-4 top-16 z-50 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-900/15 backdrop-blur-2xl transition-all animate-in fade-in zoom-in-95 dark:border-white/10 dark:bg-slate-900/95 dark:shadow-black/50"
            >
                {/* Header with Digital Clock */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs ring-1 ${
                            isClockedIn
                                ? 'bg-emerald-50 text-emerald-600 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800/60'
                                : 'bg-slate-100 text-slate-600 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                        }`}>
                            <Clock size={20} className={isClockedIn ? 'animate-pulse' : ''} />
                        </span>
                        <div>
                            <p className="font-mono text-base font-black tracking-tight text-slate-900 dark:text-white">
                                {formattedTime}
                            </p>
                            <p className="text-[11px] font-semibold text-slate-400">
                                {formattedDate}
                            </p>
                        </div>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                        isClockedIn
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}>
                        <span className={`h-2 w-2 rounded-full ${isClockedIn ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                        {isClockedIn
                            ? (isArabic ? 'جلسة نشطة' : 'Active')
                            : (isArabic ? 'غير مسجل' : 'Idle')}
                    </span>
                </div>

                {/* Session Details */}
                {isClockedIn ? (
                    <div className="mt-4 space-y-4">
                        {/* Live Timer Dashboard */}
                        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-teal-50/40 p-4 text-center dark:border-emerald-800/40 dark:from-emerald-950/40 dark:to-teal-950/20">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                                {isArabic ? 'مدة العمل الحالية' : 'Elapsed Working Time'}
                            </p>
                            <p className="mt-1 font-mono text-3xl font-black tracking-tight text-emerald-800 dark:text-emerald-200">
                                {formatDuration(elapsedSeconds)}
                            </p>
                            <div className="mt-2.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                                <LogIn size={13} className="text-emerald-600 dark:text-emerald-400" />
                                <span>{isArabic ? 'وقت تسجيل الحضور: ' : 'Clocked in at: '}{clockInFormatted || '—'}</span>
                            </div>
                        </div>

                        {/* Optional Clock-Out Notes */}
                        <div>
                            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                {isArabic ? 'ملاحظات عند الانصراف (اختياري)' : 'Exit Notes (Optional)'}
                            </label>
                            <input
                                type="text"
                                maxLength={250}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={isArabic ? 'مثال: إنهاء مهام الوردية بالكامل...' : 'e.g. Completed all shift handoffs...'}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>

                        {/* Actions Matrix */}
                        <div className="space-y-2 pt-1">
                            <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => setShowConfirmClockOut(true)}
                                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 text-xs font-black text-white shadow-md shadow-rose-600/20 transition hover:from-rose-700 hover:to-rose-800 active:scale-98 disabled:opacity-50"
                            >
                                <LogOut size={16} />
                                <span>{isArabic ? 'تسجيل الانصراف الآن' : 'Clock Out Now'}</span>
                            </button>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onRequestPermission();
                                    }}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                    <DoorOpen size={13} className="text-amber-600" />
                                    <span>{isArabic ? 'إذن انصراف مبكر' : 'Early Leave'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onNavigateShifts();
                                    }}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                    <Calendar size={13} className="text-teal-600" />
                                    <span>{isArabic ? 'جدول وردياتي' : 'My Schedule'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Not Clocked In View */
                    <div className="mt-4 space-y-4">
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900/60">
                                    <AlertCircle size={17} />
                                </span>
                                <div>
                                    <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                                        {isArabic ? 'جاهز لبدء وردية العمل؟' : 'Ready to start your shift?'}
                                    </p>
                                    <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                        {isArabic
                                            ? 'سيتم تسجيل الحضور وربط جلستك بموقع المنشأة وتوقيت الوردية المعتمدة.'
                                            : 'Your clock-in will be verified against your shift schedule.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Optional Clock-In Notes */}
                        <div>
                            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                {isArabic ? 'ملاحظات الحضور (اختياري)' : 'Clock-in Notes (Optional)'}
                            </label>
                            <input
                                type="text"
                                maxLength={250}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={isArabic ? 'مثال: تغطية وردية استثنائية...' : 'e.g. Covering morning shift...'}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>

                        {/* Big Vibrant Clock-In Button */}
                        <button
                            type="button"
                            disabled={isUpdating}
                            onClick={handleClockInAction}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 text-xs font-black text-white shadow-lg shadow-teal-600/25 transition hover:brightness-105 active:scale-98 disabled:opacity-50"
                        >
                            <LogIn size={17} />
                            <span>{isArabic ? 'تسجيل الحضور الآن' : 'Clock In Now'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onNavigateShifts();
                            }}
                            className="flex w-full items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400"
                        >
                            <Calendar size={13} />
                            <span>{isArabic ? 'استعراض جدول الورديات الكامل' : 'View Full Shift Schedule'}</span>
                            <ArrowUpRight size={12} />
                        </button>
                    </div>
                )}
            </div>

            {/* Confirm Clock Out Dialog */}
            <ConfirmDialog
                isOpen={showConfirmClockOut}
                onClose={() => setShowConfirmClockOut(false)}
                onConfirm={handleClockOutConfirmed}
                title={isArabic ? 'تأكيد تسجيل الانصراف' : 'Confirm Clock Out'}
                message={isArabic
                    ? `هل أنت متأكد من تسجيل الانصراف وإنهاء جلسة العمل الحالية؟\nالمدة الإجمالية: ${formatDuration(elapsedSeconds)}`
                    : `Are you sure you want to clock out and conclude your active session?\nTotal duration: ${formatDuration(elapsedSeconds)}`}
                confirmLabel={isArabic ? 'نعم، تسجيل الانصراف' : 'Yes, Clock Out'}
                cancelLabel={isArabic ? 'إلغاء' : 'Cancel'}
                variant="warning"
            />
        </>
    );
};
export default AttendanceQuickPunchCard;
