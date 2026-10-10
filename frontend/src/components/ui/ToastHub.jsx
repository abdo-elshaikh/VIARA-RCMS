import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
   ToastHub — a lightweight, self-contained toast notification system.

   Usage:
     1. Mount <ToastHub /> once at the app root (e.g. inside App.jsx or AppLayout).
     2. Import and call { toast } from './ToastHub' anywhere.

   toast.success(message, options?)
   toast.error(message, options?)
   toast.info(message, options?)
   toast.warning(message, options?)
   toast(message, options?)          ← 'info' by default
   ────────────────────────────────────────────────────────────────────────── */

// ─── Event bus ─────────────────────────────────────────────────────────────
import { listeners } from './toast';

const variantConfig = {
    success: {
        icon: CheckCircle2,
        bar: 'bg-emerald-500',
        iconClass: 'text-emerald-500 dark:text-emerald-400',
        ring: 'ring-emerald-200 dark:ring-emerald-800/60',
    },
    error: {
        icon: AlertCircle,
        bar: 'bg-rose-500',
        iconClass: 'text-rose-500 dark:text-rose-400',
        ring: 'ring-rose-200 dark:ring-rose-800/60',
    },
    warning: {
        icon: AlertTriangle,
        bar: 'bg-amber-400',
        iconClass: 'text-amber-500 dark:text-amber-400',
        ring: 'ring-amber-200 dark:ring-amber-800/60',
    },
    info: {
        icon: Info,
        bar: 'bg-sky-500',
        iconClass: 'text-sky-500 dark:text-sky-400',
        ring: 'ring-sky-200 dark:ring-sky-800/60',
    },
};

const ToastItem = ({ item, onRemove }) => {
    const [visible, setVisible] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const timerRef = useRef(null);
    const config = variantConfig[item.variant] || variantConfig.info;
    const Icon = config.icon;
    const progressRef = useRef(null);

    const startLeave = useCallback(() => {
        setLeaving(true);
        setTimeout(() => onRemove(item.id), 280);
    }, [item.id, onRemove]);

    useEffect(() => {
        // Trigger enter animation
        const raf = requestAnimationFrame(() => setVisible(true));

        // Auto-dismiss timer
        if (item.duration > 0) {
            timerRef.current = setTimeout(startLeave, item.duration);
        }

        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(timerRef.current);
        };
    }, [item.duration, startLeave]);

    const pause  = () => clearTimeout(timerRef.current);
    const resume = () => {
        if (item.duration > 0) {
            timerRef.current = setTimeout(startLeave, 1200);
        }
    };

    return (
        <div
            role={item.variant === 'error' ? 'alert' : 'status'}
            aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            onMouseEnter={pause}
            onMouseLeave={resume}
            onFocus={pause}
            onBlur={resume}
            style={{
                transform: visible && !leaving ? 'translateX(0) scale(1)' : leaving ? 'translateX(8px) scale(0.97)' : 'translateX(24px) scale(0.96)',
                opacity: visible && !leaving ? 1 : 0,
                transition: 'transform 0.28s cubic-bezier(.22,.68,0,1.2), opacity 0.22s ease',
                willChange: 'transform, opacity',
            }}
            className={`relative flex w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-xl shadow-black/10 ring-1 dark:shadow-black/30 ${config.ring}`}
        >
            {/* Progress bar */}
            {item.duration > 0 && (
                <div
                    ref={progressRef}
                    className={`absolute bottom-0 start-0 h-[3px] rounded-full ${config.bar}`}
                    style={{
                        width: '100%',
                        animation: `toast-progress ${item.duration}ms linear forwards`,
                    }}
                />
            )}

            {/* Side accent */}
            <div className={`w-1 shrink-0 ${config.bar} opacity-80`} aria-hidden="true" />

            {/* Content */}
            <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5">
                <Icon size={18} className={`mt-0.5 shrink-0 ${config.iconClass}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    {item.title && (
                        <p className="mb-0.5 text-sm font-bold text-[var(--VIARA-ink)]">{item.title}</p>
                    )}
                    <p className="text-sm font-medium leading-5 text-[var(--VIARA-ink-soft,var(--VIARA-muted))]">{item.message}</p>
                    {item.action && (
                        <button
                            type="button"
                            onClick={() => { item.action.onClick?.(); startLeave(); }}
                            className={`mt-2 text-xs font-bold ${config.iconClass} hover:underline focus-visible:outline-none focus-visible:underline`}
                        >
                            {item.action.label}
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={startLeave}
                    className="mt-0.5 shrink-0 rounded-lg p-1 text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)]"
                    aria-label="Dismiss notification"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};

// ─── Toast Hub (mount once at root) ────────────────────────────────────────
const ToastHub = ({ position = 'bottom-end', maxToasts = 6 }) => {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        const handler = ({ type, item, id }) => {
            if (type === 'add') {
                setToasts((prev) => {
                    const next = [item, ...prev].slice(0, maxToasts);
                    return next;
                });
            } else if (type === 'remove') {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }
        };
        listeners.add(handler);
        return () => listeners.delete(handler);
    }, [maxToasts]);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const positionClasses = {
        'bottom-end':   'bottom-4 end-4 items-end',
        'bottom-start': 'bottom-4 start-4 items-start',
        'top-end':      'top-4 end-4 items-end',
        'top-start':    'top-4 start-4 items-start',
        'top-center':   'top-4 start-1/2 -translate-x-1/2 items-center',
        'bottom-center':'bottom-4 start-1/2 -translate-x-1/2 items-center',
    }[position] || 'bottom-4 end-4 items-end';

    if (!toasts.length) return null;

    return createPortal(
        <div
            aria-label="Notifications"
            className={`pointer-events-none fixed z-[9999] flex flex-col-reverse gap-2.5 px-2 ${positionClasses}`}
            style={{ maxWidth: 'min(100vw - 2rem, 26rem)' }}
        >
            {toasts.map((item) => (
                <div key={item.id} className="pointer-events-auto w-full">
                    <ToastItem item={item} onRemove={removeToast} />
                </div>
            ))}
        </div>,
        document.body
    );
};

export default ToastHub;
