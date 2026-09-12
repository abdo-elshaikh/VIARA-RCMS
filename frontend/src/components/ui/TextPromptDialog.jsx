import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';

const TextPromptDialog = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    label,
    placeholder,
    initialValue = '',
    type = 'text',
    required = true,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    validationMessage = 'This field is required.',
    validate,
    inputProps = {},
    helperText,
    isLoading = false,
    hideInput = false,
}) => {
    const [value, setValue] = useState(initialValue);
    const [attempted, setAttempted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const busy = isLoading || isSubmitting;
    const normalized = value.trim();
    const customError = !hideInput && normalized && validate ? validate(normalized) : '';
    const error = attempted
        ? (!hideInput && required && !normalized ? validationMessage : customError)
        : '';

    useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
            setAttempted(false);
        }
    }, [initialValue, isOpen]);

    const submit = async (event) => {
        event.preventDefault();
        if (busy || submittingRef.current) return;
        setAttempted(true);
        if ((!hideInput && required && !normalized) || customError) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        try {
            const completed = await onConfirm(hideInput ? '' : normalized);
            if (completed !== false) onClose?.();
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={busy ? undefined : onClose} title={title} size="sm">
            <form onSubmit={submit} noValidate className="space-y-5">
                {message && <p className="text-sm leading-6 text-slate-600">{message}</p>}
                {!hideInput && (
                    <Input autoFocus label={label} type={type} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} required={required} error={error || undefined} helperText={helperText} {...inputProps} disabled={busy || inputProps.disabled} />
                )}
                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                    <Button variant="ghost" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
                    <Button type="submit" loading={busy}>{confirmLabel}</Button>
                </div>
            </form>
        </Modal>
    );
};

export default TextPromptDialog;
