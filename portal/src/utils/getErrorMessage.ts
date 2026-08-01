export const getErrorMessage = (error: any, fallback: string = 'Something went wrong.'): string => {
    const data = error?.data;

    if (!data) return error?.message || fallback;

    if (typeof data === 'string') return data;

    if (Array.isArray(data.details)) {
        const details = data.details
            .map((detail: any) => {
                const field = detail.field || detail.path?.[0];
                const message = detail.message || detail.error || JSON.stringify(detail);
                return field ? `${field}: ${message}` : message;
            })
            .join(', ');
        const summary = typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
                ? data.error
                : null;

        return summary ? `${summary}: ${details}` : details;
    }

    if (typeof data.message === 'string') return data.message;
    if (typeof data.error === 'string') return data.error;

    if (data.error && typeof data.error === 'object') {
        return data.error.message || data.error.code || fallback;
    }

    return fallback;
};
