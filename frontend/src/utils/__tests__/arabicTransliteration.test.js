import { describe, expect, it } from 'vitest';
import {
    transliterateArabicToLatin,
    toDicomPatientName,
    ARABIC_DICTIONARY
} from '../arabicTransliteration';

describe('arabicTransliteration (Frontend)', () => {
    it('transliterates high-frequency common names accurately', () => {
        expect(transliterateArabicToLatin('محمد')).toBe('Mohamed');
        expect(transliterateArabicToLatin('أحمد')).toBe('Ahmed');
        expect(transliterateArabicToLatin('محمود')).toBe('Mahmoud');
        expect(transliterateArabicToLatin('فاطمة')).toBe('Fatma');
        expect(transliterateArabicToLatin('مريم')).toBe('Maryam');
    });

    it('correctly normalizes compound names like Abdel / Abdullah', () => {
        expect(transliterateArabicToLatin('عبد الله')).toBe('Abdullah');
        expect(transliterateArabicToLatin('عبدالرحمن')).toBe('Abdelrahman');
        expect(transliterateArabicToLatin('عبد الرحمن')).toBe('Abdelrahman');
        expect(transliterateArabicToLatin('عبد العزيز')).toBe('Abdelaziz');
    });

    it('handles family names with El- prefix and Abu-', () => {
        expect(transliterateArabicToLatin('الشريف')).toBe('El-Sherif');
        expect(transliterateArabicToLatin('المصري')).toBe('El-Masry');
        expect(transliterateArabicToLatin('أبو بكر')).toBe('Abu-Bakr');
    });

    it('preserves existing Latin names untouched', () => {
        expect(transliterateArabicToLatin('John Doe')).toBe('John Doe');
        expect(transliterateArabicToLatin('Smith')).toBe('Smith');
    });

    it('formats DICOM Person Name (PN) in Family^Given format', () => {
        expect(toDicomPatientName('الشريف', 'محمد')).toBe('El-Sherif^Mohamed');
        expect(toDicomPatientName('محمود', 'عبد الرحمن')).toBe('Mahmoud^Abdelrahman');
        expect(toDicomPatientName('Smith', 'John')).toBe('Smith^John');
    });

    it('handles empty or missing names defensively', () => {
        expect(toDicomPatientName('', '')).toBe('UNKNOWN^PATIENT');
        expect(toDicomPatientName(null, null)).toBe('UNKNOWN^PATIENT');
    });
});
