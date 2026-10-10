import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import useFocusTrap from '../../hooks/useFocusTrap';

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

    useFocusTrap({
        containerRef: dialogRef,
        isActive: Boolean(isOpen),
        onEscape: onClose,
        lockScroll: true,
    });

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
