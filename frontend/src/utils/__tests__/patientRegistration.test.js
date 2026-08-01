import { describe, expect, it } from 'vitest';
import { buildPatientRegistrationPayload } from '../patientRegistration';

describe('patient registration payload', () => {
    it('normalizes names, phone formatting, and optional values for the API', () => {
        expect(buildPatientRegistrationPayload({
            fullName: '  Amina   Hassan Ali ',
            dob: '1990-05-14',
            gender: 'Female',
            phone: '+20 100-123-4567',
            address: '  Cairo Center  ',
            mrn: '  '
        })).toEqual({
            firstName: 'Amina',
            lastName: 'Hassan Ali',
            dateOfBirth: '1990-05-14',
            gender: 'Female',
            phone: '201001234567',
            address: 'Cairo Center',
            mrn: undefined
        });
    });

    it('provides a backend-compatible last name for a single-name patient', () => {
        expect(buildPatientRegistrationPayload({ fullName: 'Madonna', phone: '01000000000' }).lastName).toBe('Unknown');
    });
});
