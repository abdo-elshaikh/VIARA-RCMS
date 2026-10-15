import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export const getPasskeySupport = () => {
    if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') {
        return { supported: false, reason: 'unsupported' };
    }
    if (!window.isSecureContext) return { supported: false, reason: 'insecure' };
    return { supported: true, reason: null };
};

export const authenticateWithPasskey = options => startAuthentication({ optionsJSON: options });
export const registerPasskey = options => startRegistration({ optionsJSON: options });

export const getPasskeyErrorKind = error => {
    if (error?.name === 'NotAllowedError') return 'cancelled';
    if (error?.name === 'AbortError') return 'cancelled';
    if (error?.name === 'InvalidStateError') return 'alreadyRegistered';
    if (error?.name === 'NotSupportedError' || error?.name === 'SecurityError') return 'unsupported';
    return 'failed';
};
