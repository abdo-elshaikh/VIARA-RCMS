import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import useFocusTrap from '../../hooks/useFocusTrap';
import '../../styles/PublicDialog.css';

export default function PublicDialog({ title, titleId, closeLabel, onClose, children, initialFocusRef, returnFocusRef, className = '' }) {
    const dialogRef = useRef(null);
    useFocusTrap({ containerRef: dialogRef, isActive: true, onEscape: onClose, initialFocusRef });

    useEffect(() => {
        const dialog = dialogRef.current;
        const trigger = returnFocusRef?.current;
        if (!dialog.open) dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
            // A dialog opened from another dialog returns to the original page trigger.
            if (trigger) window.requestAnimationFrame(() => trigger.focus());
        };
    }, [returnFocusRef]);

    return (
        <dialog
            ref={dialogRef}
            className={`public-dialog ${className}`}
            aria-labelledby={titleId}
            aria-modal="true"
            tabIndex={-1}
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="public-dialog__content">
                <header className="public-dialog__header">
                    <h2 id={titleId}>{title}</h2>
                    <button type="button" onClick={onClose} aria-label={closeLabel} className="public-dialog__close">
                        <X size={20} aria-hidden="true" />
                    </button>
                </header>
                <div className="public-dialog__body">{children}</div>
            </div>
        </dialog>
    );
}
