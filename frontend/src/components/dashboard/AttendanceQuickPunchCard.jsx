import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    LogIn, LogOut, Calendar, DoorOpen, AlertCircle, ArrowUpRight, X,
    Coffee, Play, Loader2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useBreakStartMutation, useBreakEndMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { getLocalizedDemoUserName } from '../../utils/localizedDemoData';

const cx = (...classes) => classes.filter(Boolean).join(' ');

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
    const { t, i18n } = useTranslation(['common', 'workspace']);
    const isArabic = typeof isRtl === 'boolean' ? isRtl : Boolean((i18n?.resolvedLanguage || i18n?.language)?.startsWith('ar'));

    const [currentTime, setCurrentTime] = useState(new Date());
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirmClockOut, setShowConfirmClockOut] = useState(false);
    const [showEmergencyPrompt, setShowEmergencyPrompt] = useState(false);
    const [emergencyReason, setEmergencyReason] = useState('');

    const [breakStartMutation, { isLoading: isStartingBreak }] = useBreakStartMutation();
    const [breakEndMutation, { isLoading: isEndingBreak }] = useBreakEndMutation();

    const panelRef = useRef(null);

    const isOnBreak = Boolean(isClockedIn && activeSession?.break_start && !activeSession?.break_end);
    const [breakElapsedSeconds, setBreakElapsedSeconds] = useState(0);

    // Break duration ticker — 5s resolution is enough for HH:MM:SS display
    useEffect(() => {
        if (!isOpen || !isOnBreak || !activeSession?.break_start) {
            setBreakElapsedSeconds(0);
            return;
        }

        const breakStartTime = new Date(activeSession.break_start).getTime();
        const updateBreakElapsed = () => {
            setBreakElapsedSeconds(Math.max(0, Math.floor((Date.now() - breakStartTime) / 1000)));
        };

        updateBreakElapsed();
        const interval = setInterval(updateBreakElapsed, 5000);
        return () => clearInterval(interval);
    }, [isOpen, isOnBreak, activeSession?.break_start]);

    const handleToggleBreak = async () => {
        try {
            if (isOnBreak) {
                await breakEndMutation({ notes: notes.trim() || undefined }).unwrap();
                toast.success(isArabic ? 'تم إنهاء الاستراحة والعودة للعمل' : 'Break ended, back to work');
            } else {
                await breakStartMutation({ notes: notes.trim() || undefined }).unwrap();
                toast.success(isArabic ? 'تم بدء فترة الاستراحة' : 'Break started');
            }
            setNotes('');
        } catch (err) {
            toast.error(getErrorMessage(err, isArabic ? 'تعذر تحديث حالة الاستراحة' : 'Failed to update break status'));
        }
    };

    // Live clock ticker
    useEffect(() => {
        if (!isOpen) return undefined;
        setCurrentTime(new Date());
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, [isOpen]);

    // Active session duration counter — 30s is enough for HH:MM:SS granularity visible to user
    useEffect(() => {
        if (!isOpen || !isClockedIn || !activeSession?.clock_in) {
            setElapsedSeconds(0);
            return;
        }

        const clockInTime = new Date(activeSession.clock_in).getTime();
        const updateElapsed = () => {
            setElapsedSeconds(Math.max(0, Math.floor((Date.now() - clockInTime) / 1000)));
        };

        updateElapsed();
        const interval = setInterval(updateElapsed, 30000);
        return () => clearInterval(interval);
    }, [isOpen, isClockedIn, activeSession?.clock_in]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !showConfirmClockOut && !showEmergencyPrompt) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, showConfirmClockOut, showEmergencyPrompt]);

    // Close on outside press. Triggers opt out with data-punch-trigger so they can toggle.
    useEffect(() => {
        if (!isOpen) return undefined;
        const handlePointerDown = (event) => {
            if (showConfirmClockOut || showEmergencyPrompt) return;
            const target = event.target;
            if (panelRef.current?.contains(target)) return;
            if (target.closest?.('[data-punch-trigger], [role="dialog"], [role="alertdialog"]')) return;
            onClose();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen, onClose, showConfirmClockOut, showEmergencyPrompt]);

    if (!isOpen) return null;

    const formattedTime = currentTime.toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const formattedDate = currentTime.toLocaleDateString(isArabic ? 'ar-EG' : 'en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    });

    const clockInFormatted = activeSession?.clock_in
        ? new Date(activeSession.clock_in).toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        })
        : null;

    const isStaleSession = Boolean(isClockedIn && elapsedSeconds > 24 * 3600);
    const displayUserName = getLocalizedDemoUserName(user?.name, t);

    const handleClockInAction = async () => {
        if (isSubmitting || isUpdating) return;
        setIsSubmitting(true);
        try {
            await onClockIn(notes);
            setNotes('');
            onClose();
        } catch {
            // Keep card open so user can retry or correct without losing notes
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClockOutConfirmed = async () => {
        if (isSubmitting || isUpdating) return;
        setIsSubmitting(true);
        try {
            await onClockOut(notes);
            setShowConfirmClockOut(false);
            setNotes('');
            onClose();
        } catch (err) {
            setShowConfirmClockOut(false);
            if (err?.data?.code === 'EARLY_DEPARTURE_PROHIBITED') {
                setShowEmergencyPrompt(true);
            }
            // Keep card open on failure so notes and state are not discarded
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEmergencyClockOut = async () => {
        if (!emergencyReason.trim() || isSubmitting || isUpdating) return;
        setIsSubmitting(true);
        try {
            await onClockOut({
                notes,
                isEmergency: true,
                emergencyReason: emergencyReason.trim()
            });
            setEmergencyReason('');
            setShowEmergencyPrompt(false);
            setNotes('');
            onClose();
        } catch {
            // Keep emergency prompt open to review or retry
        } finally {
            setIsSubmitting(false);
        }
    };

    const L = (ar, en) => (isArabic ? ar : en);
    const tone = isStaleSession || isOnBreak ? 'warn' : isClockedIn ? 'ok' : 'idle';
    const statusLabel = isStaleSession
        ? L('معلقة (أكثر من 24 ساعة)', 'Stale (over 24h)')
        : isOnBreak
            ? L('في استراحة', 'On break')
            : isClockedIn
                ? L('حاضر', 'Clocked in')
                : L('غير مسجل', 'Not clocked in');
    const roleLabel = user?.role ? t(`roles.${String(user.role).toLowerCase()}`, { defaultValue: user.role }) : '';
    const initials = String(displayUserName || user?.name || '').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
    const breakMinutes = Number(activeSession?.total_break_minutes) || 0;

    return (
        <>
            <div
                ref={panelRef}
                dir={isRtl ? 'rtl' : 'ltr'}
                role="dialog"
                aria-label={L('الحضور والانصراف', 'Attendance')}
                className="vx-punch absolute end-2 top-full z-50 mt-2 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 sm:end-6"
            >
                {/* Who is punching */}
                {user && (
                    <div className="vx-punch-head">
                        <span className="vx-avatar" aria-hidden="true">{initials || '•'}</span>
                        <div className="min-w-0 flex-1">
                            <p className="vx-profile-name truncate">{displayUserName || user.name}</p>
                            {roleLabel && <p className="vx-profile-role truncate">{roleLabel}</p>}
                        </div>
                        <button type="button" onClick={onClose} className="vx-icon-btn" aria-label={L('إغلاق', 'Close')}>
                            <X size={17} />
                        </button>
                    </div>
                )}

                <div className="vx-punch-body">
                    {/* Warnings */}
                    {isStaleSession && (
                        <div className="vx-note" role="alert">
                            <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <div>
                                <strong>{L('جلسة سابقة معلقة تجاوزت 24 ساعة', 'Pending session from a previous day')}</strong>
                                {L(
                                    'سجّل الانصراف لتسوية الجلسة، وسيحتسب النظام الحد الأقصى تلقائياً.',
                                    'Clock out to settle the session. Hours are capped automatically.'
                                )}
                            </div>
                        </div>
                    )}

                    {isOnBreak && (
                        <div className="vx-note items-center" role="status">
                            <Coffee size={17} className="shrink-0" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                <strong>{L('أنت في استراحة', 'You are on break')}</strong>
                                <span className="tabular-nums" dir="ltr">{formatDuration(breakElapsedSeconds)}</span>
                            </div>
                            <button
                                type="button"
                                disabled={isEndingBreak}
                                onClick={handleToggleBreak}
                                className="vx-btn vx-btn-primary !h-9 !w-auto shrink-0"
                            >
                                {isEndingBreak ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                {L('العودة للعمل', 'Resume')}
                            </button>
                        </div>
                    )}

                    {/* Hero: live status + big number */}
                    <div className="vx-punch-hero" data-tone={tone}>
                        <div className="vx-punch-hero-top">
                            <span className="vx-chip" data-tone={tone} data-live={isClockedIn && !isStaleSession && !isOnBreak ? 'true' : undefined}>
                                <span className="vx-chip-dot" aria-hidden="true" />
                                {statusLabel}
                            </span>
                            <span className="vx-punch-date">{formattedDate}</span>
                        </div>

                        <p className="vx-punch-timer" dir={isClockedIn ? 'ltr' : undefined} aria-live="off">
                            {isClockedIn ? formatDuration(elapsedSeconds) : formattedTime}
                        </p>

                        {isClockedIn ? (
                            <>
                                <p className="vx-punch-caption">
                                    {isStaleSession ? L('مدة الجلسة المعلقة', 'Stale session length') : L('مدة العمل الحالية', 'Time on shift')}
                                </p>
                                <dl className="vx-punch-stats">
                                    <div>
                                        <dt>{L('وقت الحضور', 'Clocked in at')}</dt>
                                        <dd>{clockInFormatted || '—'}</dd>
                                    </div>
                                    <div>
                                        <dt>{L('الاستراحات', 'Breaks')}</dt>
                                        <dd>{breakMinutes} {L('د', 'min')}</dd>
                                    </div>
                                </dl>
                            </>
                        ) : (
                            <p className="vx-punch-caption">
                                {L('سيتم التحقق من الحضور وفق الوردية المعتمدة.', 'Your clock-in is checked against your shift schedule.')}
                            </p>
                        )}
                    </div>

                    {/* Notes */}
                    <input
                        type="text"
                        maxLength={250}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        aria-label={isClockedIn ? L('ملاحظات الانصراف', 'Exit notes') : L('ملاحظات الحضور', 'Clock-in notes')}
                        placeholder={isClockedIn
                            ? L('ملاحظات الانصراف أو تسليم المهام (اختياري)', 'Exit or handover notes (optional)')
                            : L('ملاحظات الحضور (اختياري)', 'Clock-in notes (optional)')}
                        className="vx-field"
                    />

                    {/* Actions */}
                    {isClockedIn ? (
                        <div className="grid gap-2">
                            {!isOnBreak && !isStaleSession && (
                                <button
                                    type="button"
                                    disabled={isUpdating || isStartingBreak}
                                    onClick={handleToggleBreak}
                                    className="vx-btn vx-btn-soft"
                                >
                                    {isStartingBreak ? <Loader2 size={16} className="animate-spin" /> : <Coffee size={16} />}
                                    {L('بدء فترة استراحة', 'Start Break')}
                                </button>
                            )}

                            <button
                                type="button"
                                data-size="lg"
                                disabled={isUpdating || isSubmitting}
                                onClick={() => setShowConfirmClockOut(true)}
                                className={cx('vx-btn', isStaleSession ? 'vx-btn-warn' : 'vx-btn-danger')}
                            >
                                {isSubmitting ? <Loader2 size={17} className="animate-spin" /> : <LogOut size={17} />}
                                {isStaleSession ? L('تسوية وإغلاق الجلسة السابقة', 'Settle Stale Session') : L('تسجيل الانصراف الآن', 'Clock Out Now')}
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => { onClose(); onRequestPermission(); }}
                                    className="vx-btn vx-btn-ghost"
                                >
                                    <DoorOpen size={16} aria-hidden="true" />
                                    {L('إذن انصراف', 'Early leave')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { onClose(); onNavigateShifts(); }}
                                    className="vx-btn vx-btn-ghost"
                                >
                                    <Calendar size={16} aria-hidden="true" />
                                    {L('جدول وردياتي', 'My Schedule')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-1.5">
                            <button
                                type="button"
                                data-size="lg"
                                disabled={isUpdating || isSubmitting}
                                onClick={handleClockInAction}
                                className="vx-btn vx-btn-primary"
                            >
                                {isSubmitting ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
                                {L('تسجيل الحضور الآن', 'Clock In Now')}
                            </button>
                            <button
                                type="button"
                                onClick={() => { onClose(); onNavigateShifts(); }}
                                className="vx-link-btn"
                            >
                                <Calendar size={14} aria-hidden="true" />
                                {L('عرض جدول الورديات', 'View shift schedule')}
                                <ArrowUpRight size={13} aria-hidden="true" className="rtl:-scale-x-100" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                isOpen={showConfirmClockOut}
                onClose={() => setShowConfirmClockOut(false)}
                onConfirm={handleClockOutConfirmed}
                title={L('تأكيد تسجيل الانصراف', 'Confirm clock out')}
                message={isArabic
                    ? `هل تريد إنهاء جلسة العمل الحالية؟\nالمدة الإجمالية: ${formatDuration(elapsedSeconds)}`
                    : `End your current session?\nTotal time: ${formatDuration(elapsedSeconds)}`}
                confirmLabel={L('نعم، تسجيل الانصراف', 'Yes, Clock Out')}
                cancelLabel={L('إلغاء', 'Cancel')}
                variant="warning"
            />

            {/* Emergency departure — portaled so no ancestor can clip or re-anchor it */}
            {showEmergencyPrompt && createPortal(
                <div className="vx-modal-scrim animate-in fade-in duration-150">
                    <div
                        dir={isRtl ? 'rtl' : 'ltr'}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="emergency-title"
                        className="vx-modal-card animate-in zoom-in-95 duration-150"
                        onKeyDown={(event) => { if (event.key === 'Escape') { setShowEmergencyPrompt(false); setEmergencyReason(''); } }}
                    >
                        <div className="flex items-start gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--danger-bg,#ffe4e6)] text-[var(--danger,#e11d48)]">
                                <AlertCircle size={20} aria-hidden="true" />
                            </span>
                            <div>
                                <h4 id="emergency-title" className="vx-modal-title">{L('انصراف اضطراري', 'Emergency clock out')}</h4>
                                <p className="vx-modal-text">
                                    {L(
                                        'الانصراف المبكر يتطلب إذناً مسبقاً. اكتب السبب لتوثيق الانصراف الاضطراري.',
                                        'Early departure needs prior approval. Give a reason to clock out now.'
                                    )}
                                </p>
                            </div>
                        </div>

                        <label htmlFor="emergency-reason" className="mt-4 block text-[13px] font-semibold text-[var(--VIARA-ink)]">
                            {L('سبب الانصراف (إلزامي)', 'Reason (required)')}
                        </label>
                        <textarea
                            id="emergency-reason"
                            rows={3}
                            autoFocus
                            value={emergencyReason}
                            onChange={(e) => setEmergencyReason(e.target.value)}
                            placeholder={L('اكتب سبب المغادرة العاجلة', 'Why do you need to leave now?')}
                            className="vx-field mt-1.5"
                            data-tone="danger"
                        />

                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => { setShowEmergencyPrompt(false); setEmergencyReason(''); }}
                                className="vx-btn vx-btn-ghost"
                            >
                                {L('رجوع', 'Cancel')}
                            </button>
                            <button
                                type="button"
                                disabled={!emergencyReason.trim() || isUpdating || isSubmitting}
                                onClick={handleEmergencyClockOut}
                                className="vx-btn vx-btn-danger"
                            >
                                {isSubmitting && <Loader2 size={15} className="animate-spin" />}
                                {L('تأكيد الانصراف', 'Confirm clock out')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default AttendanceQuickPunchCard;