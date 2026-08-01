import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const modalWidths = {
    sm: 'max-w-md',
    default: 'max-w-lg',
    wide: 'max-w-5xl',
    full: 'max-w-none',
};

const Modal = ({ isOpen, onClose, title, children, size = 'default', footer, width }) => {
    const { t } = useTranslation('common');
    const titleId = useId();
    const dialogRef = useRef(null);
    const previousFocusRef = useRef(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onCloseRef.current?.();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
            if (!focusable.length) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        if (isOpen) {
            previousFocusRef.current = document.activeElement;
            const previousOverflow = document.body.style.overflow;
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
            window.requestAnimationFrame(() => {
                const firstFocusable = dialogRef.current?.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
                (firstFocusable || dialogRef.current)?.focus();
            });
            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = previousOverflow;
                const focusTarget = previousFocusRef.current;
                window.requestAnimationFrame(() => focusTarget?.focus?.());
            };
        }
        return undefined;
    }, [isOpen]);

    if (!isOpen) return null;

    const isFullPage = size === 'full';

    return createPortal(
        <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 backdrop-blur-sm animate-in fade-in duration-200 dark:bg-slate-950/68 ${isFullPage ? 'p-0' : 'p-4'}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
            <div
                ref={dialogRef}
                tabIndex={-1}
                className={`flex w-full flex-col overflow-hidden bg-white text-slate-800 shadow-2xl dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-ink)] dark:shadow-black/40 ${
                    isFullPage
                        ? 'h-[100dvh] max-h-[100dvh] rounded-none border-0'
                        : 'max-h-[90vh] rounded-2xl border border-slate-200 dark:border-[var(--rcms-line)]'
                } ${width || modalWidths[size] || modalWidths.default} animate-in zoom-in-95 duration-200`}
                onMouseDown={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 p-5 backdrop-blur dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]/95">
                    <h3 id={titleId} className="text-lg font-bold text-gray-800 dark:text-[var(--rcms-ink)]">{title}</h3>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-[var(--rcms-surface-hover)]"
                        aria-label={t('actions.close')}
                    >
                        <X size={20} className="text-gray-500 dark:text-slate-400" />
                    </button>
                </div>
                <div className={`min-h-0 flex-1 overflow-y-auto ${isFullPage ? 'bg-slate-50 p-4 dark:bg-[var(--rcms-canvas)] sm:p-6 lg:p-8' : 'p-4 sm:p-6'}`}>
                    {children}
                </div>
                {footer && (
                    <div className={`shrink-0 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] dark:shadow-black/20 sm:px-6 ${isFullPage ? '' : 'rounded-b-xl'}`}>
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default Modal;
