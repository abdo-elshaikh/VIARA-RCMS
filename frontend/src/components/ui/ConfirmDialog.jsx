import React, { useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * Confirmation Dialog for destructive or important actions
 */
const ConfirmDialog = ({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirm Action',
    message,
    confirmLabel = 'Confirm',
    confirmText,
    cancelLabel = 'Cancel',
    variant = 'danger', // 'danger', 'warning', 'info'
    isLoading = false,
    children,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const busy = isLoading || isSubmitting;

    const handleConfirm = async () => {
        if (busy || submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        try {
            const completed = await onConfirm();
            if (completed !== false) onClose?.();
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    const variants = {
        danger: {
            icon: AlertTriangle,
            iconBg: 'bg-[var(--VIARA-danger-soft)]',
            iconColor: 'text-[var(--VIARA-danger)]',
            confirmVariant: 'danger',
        },
        warning: {
            icon: AlertTriangle,
            iconBg: 'bg-[var(--VIARA-warning-soft)]',
            iconColor: 'text-[var(--VIARA-warning)]',
            confirmVariant: 'primary',
        },
        info: {
            icon: AlertTriangle,
            iconBg: 'bg-[var(--VIARA-accent-soft)]',
            iconColor: 'text-[var(--VIARA-accent)]',
            confirmVariant: 'primary',
        },
    };

    const config = variants[variant] || variants.danger;
    const Icon = config.icon;

    return (
        <Modal
            isOpen={isOpen}
            onClose={busy ? undefined : onClose}
            title={title}
            size="sm"
            footer={
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        disabled={busy}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={config.confirmVariant}
                        onClick={handleConfirm}
                        disabled={busy}
                        loading={busy}
                    >
                        {confirmText || confirmLabel}
                    </Button>
                </div>
            }
        >
            <div className="flex gap-4">
                {/* Icon */}
                <div className={`flex-shrink-0 w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${config.iconColor}`} />
                </div>

                {/* Message */}
                <div className="flex-1">
                    <p className="text-[var(--VIARA-ink)] leading-relaxed">
                        {message}
                    </p>
                    {children && <div className="mt-4">{children}</div>}
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmDialog;
