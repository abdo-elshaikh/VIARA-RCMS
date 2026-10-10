import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PatientRegistrationModal from '../PatientRegistrationModal';

vi.mock('../../ui/Modal', () => ({
    default: ({ children, isOpen }) => isOpen ? <div>{children}</div> : null,
}));

const t = (key) => key;
const register = (name) => ({ name });

describe('PatientRegistrationModal accessibility', () => {
    it('associates validation errors with their patient fields', () => {
        render(
            <PatientRegistrationModal
                errors={{
                    fullName: { message: 'Full name is required' },
                    mrn: { message: 'MRN is too long' },
                    dob: { message: 'Date of birth is required' },
                    age: { message: 'Age is invalid' },
                    phone: { message: 'Phone is required' },
                    address: { message: 'Address is too short' },
                }}
                isLoading={false}
                isOpen
                onAgeChange={vi.fn()}
                onClose={vi.fn()}
                onDobChange={vi.fn()}
                onInvalid={vi.fn()}
                onSubmit={vi.fn()}
                register={register}
                reset={vi.fn()}
                submitForm={() => vi.fn()}
                t={t}
            />
        );

        for (const id of ['full-name', 'mrn', 'dob', 'age', 'phone', 'address']) {
            const field = document.getElementById(`register-${id}`);
            const error = document.getElementById(`register-${id}-error`);
            expect(field).toHaveAttribute('aria-invalid', 'true');
            expect(field).toHaveAttribute('aria-errormessage', error.id);
            expect(field).toHaveAttribute('aria-describedby', error.id);
        }
    });
});
