const { transliterateArabicToLatin, toDicomPatientName } = require('../src/utils/arabicTransliteration');
const { validateReconcileTarget } = require('../src/services/pacsReconcileService');

describe('Arabic to Latin Phonetic Transliteration & DICOM Person Name Formatter', () => {
    describe('transliterateArabicToLatin', () => {
        it('transliterates common Arabic demographic first names accurately', () => {
            expect(transliterateArabicToLatin('محمد')).toBe('Mohamed');
            expect(transliterateArabicToLatin('أحمد')).toBe('Ahmed');
            expect(transliterateArabicToLatin('محمود')).toBe('Mahmoud');
            expect(transliterateArabicToLatin('علي')).toBe('Ali');
            expect(transliterateArabicToLatin('فاطمة')).toBe('Fatma');
            expect(transliterateArabicToLatin('مريم')).toBe('Maryam');
            expect(transliterateArabicToLatin('سارة')).toBe('Sara');
        });

        it('transliterates compound theophoric names properly', () => {
            expect(transliterateArabicToLatin('عبد الله')).toBe('Abdullah');
            expect(transliterateArabicToLatin('عبدالله')).toBe('Abdullah');
            expect(transliterateArabicToLatin('عبد الرحمن')).toBe('Abdelrahman');
            expect(transliterateArabicToLatin('عبد العزيز')).toBe('Abdelaziz');
        });

        it('transliterates names with prefixes properly', () => {
            expect(transliterateArabicToLatin('الشريف')).toBe('El-Sherif');
            expect(transliterateArabicToLatin('المصري')).toBe('El-Masry');
            expect(transliterateArabicToLatin('أبو بكر')).toBe('Abu-Bakr');
        });

        it('handles multi-word full names seamlessly', () => {
            expect(transliterateArabicToLatin('محمد أحمد علي')).toBe('Mohamed Ahmed Ali');
            expect(transliterateArabicToLatin('سارة عبد الرحمن الشريف')).toBe('Sara Abdelrahman El-Sherif');
        });

        it('leaves pure Latin/English text untouched', () => {
            expect(transliterateArabicToLatin('John Doe')).toBe('John Doe');
            expect(transliterateArabicToLatin('David Smith')).toBe('David Smith');
        });

        it('handles empty or non-string input safely', () => {
            expect(transliterateArabicToLatin('')).toBe('');
            expect(transliterateArabicToLatin(null)).toBe('');
            expect(transliterateArabicToLatin(undefined)).toBe('');
        });
    });

    describe('toDicomPatientName', () => {
        it('formats Arabic names into standard DICOM Person Name (PN) format Family^Given', () => {
            const dicomName = toDicomPatientName('الشريف', 'محمد');
            expect(dicomName).toBe('El-Sherif^Mohamed');
        });

        it('formats Latin names without alteration', () => {
            const dicomName = toDicomPatientName('Smith', 'John');
            expect(dicomName).toBe('Smith^John');
        });

        it('supports dual-language group when requested', () => {
            const dualName = toDicomPatientName('الشريف', 'محمد', { dualGroup: true });
            expect(dualName).toBe('El-Sherif^Mohamed=الشريف^محمد');
        });

        it('keeps the native Arabic name primary while retaining a Latin alias when requested', () => {
            const nativeFirst = toDicomPatientName('الشريف', 'محمد', { dualGroup: true, nativeFirst: true });
            expect(nativeFirst).toBe('الشريف^محمد=El-Sherif^Mohamed');
        });

        it('strips illegal DICOM delimiter characters defensively', () => {
            const dicomName = toDicomPatientName('El^Sherif', 'Mohamed=Ali');
            expect(dicomName).not.toContain('El^Sherif^');
            expect(dicomName).toBe('El Sherif^Mohamed Ali');
        });
    });

    describe('validateReconcileTarget', () => {
        it('rejects a quarantined study when the target exam MRN does not match the source patient ID', () => {
            const result = validateReconcileTarget({
                quarantinePatientId: 'MRN-1001',
                examMrn: 'MRN-2002'
            });

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('PATIENT_ID_MISMATCH');
        });

        it('allows the reconciliation when the target exam MRN matches the inbound patient MRN', () => {
            const result = validateReconcileTarget({
                quarantinePatientId: 'MRN-1001',
                examMrn: 'MRN-1001'
            });

            expect(result.allowed).toBe(true);
        });
    });
});
