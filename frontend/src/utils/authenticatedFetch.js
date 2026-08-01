import { getInMemoryAccessToken } from './accessToken';

export const authenticatedFetch = (url, options = {}) => {
    const token = getInMemoryAccessToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers, credentials: 'include' });
};

const readDownloadError = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    try {
        if (contentType.includes('json')) {
            const payload = await response.json();
            return payload?.message || payload?.error || '';
        }
        return (await response.text()).trim();
    } catch {
        return '';
    }
};

const getDownloadFilename = (disposition, fallbackName) => {
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (encoded?.[1]) {
        try {
            return decodeURIComponent(encoded[1]);
        } catch {
            return encoded[1];
        }
    }
    const plain = disposition.match(/filename="?([^";]+)"?/i);
    return plain?.[1] || fallbackName;
};

export const downloadAuthenticatedFile = async (url, fallbackName) => {
    const response = await authenticatedFetch(url);
    if (!response.ok) {
        const message = await readDownloadError(response);
        throw new Error(message || `Download failed (${response.status})`);
    }
    const blobUrl = URL.createObjectURL(await response.blob());
    const disposition = response.headers.get('content-disposition') || '';
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = getDownloadFilename(disposition, fallbackName);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
};
