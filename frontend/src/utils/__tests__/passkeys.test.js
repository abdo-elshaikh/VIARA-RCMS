/* eslint-disable no-undef */
import { getPasskeyErrorKind, getPasskeySupport } from '../passkeys';

describe('passkey browser support', () => {
    const originalCredential = window.PublicKeyCredential;

    afterEach(() => {
        Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: originalCredential });
    });

    it('reports unsupported browsers without WebAuthn', () => {
        Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: undefined });
        expect(getPasskeySupport()).toEqual({ supported: false, reason: 'unsupported' });
    });

    it('classifies user cancellation separately from verification failures', () => {
        expect(getPasskeyErrorKind({ name: 'NotAllowedError' })).toBe('cancelled');
        expect(getPasskeyErrorKind({ name: 'InvalidStateError' })).toBe('alreadyRegistered');
        expect(getPasskeyErrorKind(new Error('network'))).toBe('failed');
    });
});
