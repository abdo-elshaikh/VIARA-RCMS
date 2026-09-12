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

const Modal = ({ isOpen, onClose, title, children, size = 'default', footer, width, ariaLabel }) => {
    const { t } = useTranslation('common');
    const titleId = useId();
    const dialogRef = useRef(null);
    const previousFocusRef = useRef(null);
    const wasOpenRef = useRef(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    if (isOpen && !wasOpenRef.current) previousFocusRef.current = document.activeElement;
    wasOpenRef.current = isOpen;

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
        <div className={`ds-overlay fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200 ${isFullPage ? 'p-0' : 'p-4'}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
            <div
                ref={dialogRef}
                tabIndex={-1}
                className={`ds-modal flex w-full flex-col overflow-hidden ${isFullPage
                        ? 'ds-modal-full h-[100dvh] max-h-[100dvh] rounded-none'
                        : 'max-h-[90vh] border'
                    } ${width || modalWidths[size] || modalWidths.default} animate-in zoom-in-95 duration-200`}
                onMouseDown={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-label={!title ? (ariaLabel || t('aria.dialog', { defaultValue: 'Dialog' })) : undefined}
            >
                <div className="ds-modal-header sticky top-0 z-10 flex items-center justify-between border-b p-5 backdrop-blur">
                    {title && <h3 id={titleId} className="text-lg font-bold text-[var(--VIARA-ink)]">{title}</h3>}
                    <button
                        type="button"
                        onClick={onClose}
                        className="ds-modal-close ms-auto p-2"
                        aria-label={t('actions.close')}
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
                <div className={`ds-modal-body min-h-0 flex-1 overflow-y-auto ${isFullPage ? 'bg-[var(--VIARA-canvas)]' : ''}`}>
                    {children}
                </div>
                {footer && (
                    <div className="ds-modal-footer shrink-0 border-t px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:px-6">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default Modal;
