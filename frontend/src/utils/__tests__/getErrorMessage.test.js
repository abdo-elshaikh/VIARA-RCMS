import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '../getErrorMessage';

describe('getErrorMessage', () => {
    it('returns custom fallback when error is empty or missing data', () => {
        expect(getErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
        expect(getErrorMessage({}, 'Custom fallback')).toBe('Custom fallback');
    });

    it('returns standard string error message', () => {
        expect(getErrorMessage({ data: 'Invalid credentials' })).toBe('Invalid credentials');
        expect(getErrorMessage({ message: 'Network failed' })).toBe('Network failed');
        expect(getErrorMessage({ data: { message: 'User not found' } })).toBe('User not found');
        expect(getErrorMessage({ data: { error: 'Access denied' } })).toBe('Access denied');
    });

    it('suppresses raw HTML responses and returns fallback', () => {
        const rawDoc = '<!DOCTYPE html> <html lang="ar"> <head><title>صيانة</title></head> <body>...</body> </html>';
        expect(getErrorMessage({ data: rawDoc }, 'System unavailable')).toBe('System unavailable');
        expect(getErrorMessage({ message: rawDoc }, 'System unavailable')).toBe('System unavailable');
        expect(getErrorMessage({ data: { message: '<html><body>502 Bad Gateway</body></html>' } }, 'System unavailable')).toBe('System unavailable');
        expect(getErrorMessage({ data: { error: '<!doctype html>Error' } }, 'System unavailable')).toBe('System unavailable');
    });

    it('formats validation details correctly', () => {
        const err = {
            data: {
                message: 'Validation failed',
                details: [
                    { field: 'email', message: 'is invalid' },
                    { field: 'password', message: 'is too short' },
                ],
            },
        };
        expect(getErrorMessage(err)).toBe('Validation failed: email: is invalid, password: is too short');
    });
});
