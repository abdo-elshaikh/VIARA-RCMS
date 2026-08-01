/* eslint-disable no-undef */
import {
    buildCsv,
    getPatientDisplayName,
    getWaitingListValidation,
} from '../appointmentOperations';

describe('appointment operations helpers', () => {
    it('uses a normalized full name and falls back to split patient names', () => {
        expect(getPatientDisplayName({ name: '  Mona Ali  ', first_name: 'Ignored' })).toBe('Mona Ali');
        expect(getPatientDisplayName({ first_name: 'Omar', last_name: 'Hassan' })).toBe('Omar Hassan');
        expect(getPatientDisplayName({})).toBe('');
    });

    it('rejects unsafe waiting-list windows', () => {
        const base = { patientId: 'p-1', preferredDate: '2026-06-28', preferredStartTime: '09:00', preferredEndTime: '11:00' };
        expect(getWaitingListValidation(base, '2026-06-28')).toBeNull();
        expect(getWaitingListValidation({ ...base, preferredDate: '2026-06-27' }, '2026-06-28')).toBe('pastPreferredDate');
        expect(getWaitingListValidation({ ...base, preferredEndTime: '08:30' }, '2026-06-28')).toBe('invalidPreferredWindow');
        expect(getWaitingListValidation({ ...base, preferredEndTime: '' }, '2026-06-28')).toBe('incompletePreferredWindow');
    });

    it('builds an Excel-safe CSV and escapes quotes and commas', () => {
        expect(buildCsv(['Patient', 'Exam'], [['Mona, Ali', 'MRI "Brain"']]))
            .toBe('\uFEFF"Patient","Exam"\n"Mona, Ali","MRI ""Brain"""');
    });
});
