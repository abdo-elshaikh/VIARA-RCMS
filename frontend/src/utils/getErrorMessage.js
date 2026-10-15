const isHtml = (val) => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim().toLowerCase();
    return (
        trimmed.startsWith('<!doctype') ||
        trimmed.startsWith('<html') ||
        trimmed.startsWith('<head') ||
        trimmed.startsWith('<body') ||
        trimmed.includes('</html>') ||
        (trimmed.startsWith('<') && trimmed.endsWith('>'))
    );
};

export const getErrorMessage = (error, fallback = 'Something went wrong.') => {
    const data = error?.data;

    if (!data) {
        if (typeof error?.message === 'string' && !isHtml(error.message)) {
            return error.message;
        }
        return fallback;
    }

    if (typeof data === 'string') {
        if (isHtml(data)) return fallback;
        return data;
    }

    if (Array.isArray(data.details)) {
        const details = data.details
            .map((detail) => {
                const field = detail.field || detail.path?.[0];
                const message = detail.message || detail.error || JSON.stringify(detail);
                return field ? `${field}: ${message}` : message;
            })
            .join(', ');
        const summary = typeof data.message === 'string' && !isHtml(data.message)
            ? data.message
            : typeof data.error === 'string' && !isHtml(data.error)
                ? data.error
                : null;

        return summary ? `${summary}: ${details}` : details;
    }

    if (typeof data.message === 'string' && !isHtml(data.message)) return data.message;
    if (typeof data.error === 'string' && !isHtml(data.error)) return data.error;

    if (data.error && typeof data.error === 'object') {
        const nested = data.error.message || data.error.code;
        if (typeof nested === 'string' && !isHtml(nested)) return nested;
        return fallback;
    }

    return fallback;
};
