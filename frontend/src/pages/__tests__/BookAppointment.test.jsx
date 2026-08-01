import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookAppointment from '../BookAppointment';

const createAppointmentMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, fallback) => typeof fallback === 'string' ? fallback : key })
}));

vi.mock('../../store/api', () => ({
    useGetPatientsQuery: () => ({ data: [
        { patient_id: 'patient-1', first_name: 'Amina', last_name: 'Hassan', mrn: 'PAT-1001', phone: '01000000000' },
        { patient_id: 'patient-2', first_name: 'Omar', last_name: 'Saleh', mrn: 'PAT-2002', phone: '01111111111' }
    ] }),
    useGetPatientHistoryQuery: () => ({ data: {
        patient: { patient_id: 'patient-1', first_name: 'Amina', last_name: 'Hassan', mrn: 'PAT-1001', phone: '01000000000' },
        history: [{
            exam_id: '11111111-1111-4111-8111-111111111111',
            order_number: 'ORD-20250101-ABC123',
            start_time: '2025-01-01T08:00:00.000Z',
            status: 'Completed',
            report_status: 'Finalized',
            exam_type_name: 'MRI Brain'
        }]
    } }),
    useGetAppointmentsQuery: () => ({ data: [] }),
    useGetMachinesQuery: () => ({ data: [{ modality_id: 'machine-1', name: 'MRI 1', status: 'Active' }] }),
    useGetStaffQuery: () => ({ data: [] }),
    useGetExamTypesQuery: () => ({ data: [{ type_id: 'exam-1', name: 'MRI Brain', duration_minutes: 30, price: 750, body_part: 'Brain', contrast_required: false }] }),
    useGetReferringDoctorsQuery: () => ({ data: [] }),
    useGetInsuranceProvidersQuery: () => ({ data: [] }),
    useCreateAppointmentMutation: () => [createAppointmentMock, { isLoading: false }],
    useCreateInsuranceApprovalMutation: () => [vi.fn(), { isLoading: false }]
}));

describe('BookAppointment page', () => {
    beforeEach(() => {
        createAppointmentMock.mockReset();
        createAppointmentMock.mockReturnValue({
            unwrap: vi.fn().mockResolvedValue({ appointment_id: 'appointment-1' })
        });
    });

    it('renders as a dedicated page and restores the patient from the URL', () => {
        render(
            <MemoryRouter
                initialEntries={['/appointments/new?patientId=patient-1']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', { level: 1, name: 'Book Examination Appointment' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Amina Hassan/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm Appointment' })).toHaveAttribute('form', 'book-appointment-form');
    });

    it('filters patients by partial details and keeps the chosen patient selected', () => {
        render(
            <MemoryRouter
                initialEntries={['/appointments/new']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        fireEvent.change(screen.getByLabelText('Search patient'), { target: { value: 'omar 2002' } });
        expect(screen.queryByRole('option', { name: /Amina Hassan/ })).not.toBeInTheDocument();
        const patientSelect = screen.getByLabelText('Selected Patient');
        fireEvent.change(patientSelect, { target: { value: 'patient-2' } });
        expect(patientSelect).toHaveValue('patient-2');

        fireEvent.change(screen.getByLabelText('Search patient'), { target: { value: 'Amina' } });
        expect(patientSelect).toHaveValue('patient-2');
        expect(screen.getByRole('option', { name: /Omar Saleh/ })).toBeInTheDocument();
    });

    it('requires staff to select the prior study when marking a follow-up', () => {
        render(
            <MemoryRouter
                initialEntries={['/appointments/new?patientId=patient-1']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('checkbox', { name: /Follow-up appointment/i }));
        expect(screen.getByLabelText('Prior study')).toBeEnabled();
        expect(screen.getByRole('option', { name: /MRI Brain.*ORD-20250101-ABC123/ })).toBeInTheDocument();
    });

    it('books with a custom referring doctor and no radiologist assignment', async () => {
        render(
            <MemoryRouter
                initialEntries={['/appointments/new']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        fireEvent.change(screen.getByLabelText('Selected Patient'), { target: { value: 'patient-1' } });
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[1], { target: { value: 'machine-1' } });
        fireEvent.change(selects[2], { target: { value: 'exam-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
        fireEvent.change(screen.getByPlaceholderText('Doctor name, clinic, or walk-in source'), { target: { value: 'Dr. Custom Referrer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Appointment' }));

        await waitFor(() => expect(createAppointmentMock).toHaveBeenCalled());
        expect(createAppointmentMock.mock.calls[0][0]).toMatchObject({
            patientId: 'patient-1',
            modalityId: 'machine-1',
            examTypeId: 'exam-1',
            radiologistId: null,
            referringDoctorId: null,
            referringDoctor: 'Dr. Custom Referrer'
        });
    });
});
