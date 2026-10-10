/**
 * Safely generates a UUID v4.
 * Uses crypto.randomUUID if available (secure context / HTTPS / localhost).
 * Falls back to a Math.random() based UUID generator for HTTP contexts (like local network testing).
 */
export const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    
    // Fallback for non-secure contexts (e.g. http://192.168.x.x)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};
