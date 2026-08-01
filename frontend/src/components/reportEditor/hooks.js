import { useEffect, useRef } from 'react';

export const useClickOutside = (onOutside) => {
    const ref = useRef(null);
    useEffect(() => {
        const handlePointerDown = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                onOutside();
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [onOutside]);
    return ref;
};

export const useUnsavedChangesGuard = ({ dirty, canSave, onSave }) => {
    useEffect(() => {
        const handleBeforeUnload = (event) => {
            if (dirty) {
                event.preventDefault();
                event.returnValue = ''; // Standard browser prompt
                return '';
            }
        };

        const handleKeyDown = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                event.preventDefault();
                if (dirty && canSave) {
                    onSave();
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [dirty, canSave, onSave]);
};
