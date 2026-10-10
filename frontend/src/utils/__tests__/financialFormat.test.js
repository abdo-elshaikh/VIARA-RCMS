import { describe, expect, it } from 'vitest';
import { formatFinancialCurrency, formatMoney } from '../financialFormat';

describe('formatMoney', () => {
    it('formats EGP and other currencies in English', () => {
        expect(formatMoney(1234.5, { currency: 'EGP', language: 'en' })).toBe('EGP\u00a01,234.50');
        expect(formatMoney(1234.5, { currency: 'USD', locale: 'en-US' })).toBe('$1,234.50');
    });

    it('formats EGP in Arabic', () => {
        expect(formatMoney(1234.5, { currency: 'EGP', language: 'ar' })).toContain('١٬٢٣٤٫٥٠');
        expect(formatMoney(1234.5, { currency: 'EGP', language: 'ar' })).toContain('ج.م.');
    });

    it('supports fraction options and sign display for negative and zero values', () => {
        expect(formatMoney(-12.6, {
            currency: 'USD',
            locale: 'en-US',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
            signDisplay: 'always',
        })).toBe('-$13');
        expect(formatMoney(0, { currency: 'USD', locale: 'en-US', signDisplay: 'always' })).toBe('+$0.00');
        expect(formatMoney(0, { currency: 'USD', locale: 'en-US', signDisplay: 'exceptZero' })).toBe('$0.00');
        expect(formatMoney(12.6, { currency: 'USD', locale: 'en-US', maximumFractionDigits: 0 })).toBe('$13');
    });

    it('preserves formatFinancialCurrency defaults and rounding', () => {
        expect(formatFinancialCurrency(1.005, 'en')).toBe('EGP\u00a01.01');
        expect(formatFinancialCurrency('invalid', 'en')).toBe('EGP\u00a00.00');
    });
});
