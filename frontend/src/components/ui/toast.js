export const listeners = new Set();
let counter = 0;

const emit = (toast) => {
    const id = ++counter;
    const item = { id, variant: 'info', duration: 4000, ...toast };
    listeners.forEach((fn) => fn({ type: 'add', item }));
    return id;
};

const dismiss = (id) => {
    listeners.forEach((fn) => fn({ type: 'remove', id }));
};

export const toast = Object.assign(
    (message, opts = {}) => emit({ message, ...opts }),
    {
        success: (message, opts = {}) => emit({ message, variant: 'success', ...opts }),
        error:   (message, opts = {}) => emit({ message, variant: 'error',   duration: 6000, ...opts }),
        info:    (message, opts = {}) => emit({ message, variant: 'info',    ...opts }),
        warning: (message, opts = {}) => emit({ message, variant: 'warning', ...opts }),
        dismiss,
    }
);

// ─── Individual Toast Item ──────────────────────────────────────────────────
