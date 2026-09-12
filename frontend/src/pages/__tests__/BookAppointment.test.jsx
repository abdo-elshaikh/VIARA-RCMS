import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookAppointment from '../BookAppointment';

const createAppointmentMock = vi.hoisted(() => vi.fn());
const createInsuranceApprovalMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const patientsFixture = vi.hoisted(() => [
    { patient_id: 'patient-1', first_name: 'Amina', last_name: 'Hassan', mrn: 'PAT-1001', phone: '01000000000' },
    { patient_id: 'patient-2', first_name: 'Omar', last_name: 'Saleh', mrn: 'PAT-2002', phone: '01111111111' }
]);
const historyFixture = vi.hoisted(() => ({
    patient: { patient_id: 'patient-1', first_name: 'Amina', last_name: 'Hassan', mrn: 'PAT-1001', phone: '01000000000' },
    history: [{
        exam_id: '11111111-1111-4111-8111-111111111111',
        order_number: 'ORD-20250101-ABC123',
        start_time: '2025-01-01T08:00:00.000Z',
        status: 'Completed',
        report_status: 'Finalized',
        exam_type_name: 'MRI Brain'
    }]
}));

vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => navigateMock
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: toastErrorMock }
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, fallback) => typeof fallback === 'string' ? fallback : key })
}));

vi.mock('react-redux', async (importOriginal) => {
    const actual = await importOriginal().catch(() => ({}));
    return {
        ...actual,
        useSelector: vi.fn((selector) => selector ? selector({ auth: { user: { user_id: 'user-1', role: 'Receptionist' } } }) : { user_id: 'user-1', role: 'Receptionist' }),
        useDispatch: () => vi.fn()
    };
});

vi.mock('../../store/api', () => ({
    useGetPatientsQuery: () => ({ data: patientsFixture }),
    useGetPatientHistoryQuery: () => ({ data: historyFixture }),
    useGetAppointmentsQuery: () => ({ data: [] }),
    useGetRoomsQuery: () => ({ data: [{ room_id: 'room-1', name: 'MRI Suite 1', room_number: '101', status: 'Active' }] }),
    useGetShiftsQuery: () => ({ data: [] }),
    useGetAttendanceQuery: () => ({ data: [] }),
    useGetMachinesQuery: () => ({ data: [{ modality_id: 'machine-1', room_id: 'room-1', room_number: '101', name: 'MRI 1', status: 'Active' }] }),
    useGetStaffQuery: () => ({ data: [] }),
    useGetExamTypesQuery: () => ({ data: [{ type_id: 'exam-1', name: 'MRI Brain', duration_minutes: 30, price: 750, body_part: 'Brain', contrast_required: false }] }),
    useGetReferringDoctorsQuery: () => ({ data: [] }),
    useGetInsuranceProvidersQuery: () => ({ data: [{ provider_id: 'provider-1', name: 'Health Plan' }] }),
    useCreateAppointmentMutation: () => [createAppointmentMock, { isLoading: false }],
    useCreateInsuranceApprovalMutation: () => [createInsuranceApprovalMock, { isLoading: false }],
    useCreatePatientMutation: () => [vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ patient_id: 'new-patient-1' }) }), { isLoading: false }]
}));

describe('BookAppointment page', () => {
    beforeEach(() => {
        createAppointmentMock.mockReset();
        createAppointmentMock.mockReturnValue({
            unwrap: vi.fn().mockResolvedValue({ appointment_id: 'appointment-1' })
        });
        createInsuranceApprovalMock.mockReset();
        navigateMock.mockReset();
        toastErrorMock.mockReset();
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

        expect(screen.queryByRole('heading', { level: 1, name: 'Book Examination Appointment' })).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Amina Hassan/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm Appointment' })).toHaveAttribute('form', 'book-appointment-form');
        expect(screen.getByRole('navigation', { name: 'Booking sections' })).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Booking completion' })).toHaveAttribute('aria-valuenow', '50');
    });

    it('guides staff to incomplete required details before booking', async () => {
        render(
            <MemoryRouter
                initialEntries={['/appointments/new']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: 'Confirm Appointment' }));

        expect(await screen.findByText('Complete the required booking information')).toBeInTheDocument();
        expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
        expect(createAppointmentMock).not.toHaveBeenCalled();
    });

    it('supports quick scheduling and visual priority controls', async () => {
        render(
            <MemoryRouter
                initialEntries={['/appointments/new']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        fireEvent.change(screen.getByLabelText('Modality / Device'), { target: { value: 'machine-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        fireEvent.click(screen.getByRole('button', { name: '09:00' }));
        await waitFor(() => expect(screen.getByLabelText('Start')).toHaveValue('09:00'));

        const urgentButton = screen.getByRole('button', { name: 'Urgent' });
        fireEvent.click(urgentButton);
        await waitFor(() => expect(urgentButton).toHaveAttribute('aria-pressed', 'true'));
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

    it('shows a match ratio, blocks the select while loading, and surfaces a "no matches" placeholder', () => {
        render(
            <MemoryRouter
                initialEntries={['/appointments/new']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        const search = screen.getByLabelText('Search patient');
        const patientSelect = screen.getByLabelText('Selected Patient');

        expect(patientSelect).toBeEnabled();
        const matchCountBadge = screen.getByText((_, node) =>
            node?.getAttribute('aria-live') === 'polite' && /^\d+$/.test(node.textContent || '')
        );
        expect(matchCountBadge.textContent).toBe('2');

        fireEvent.change(search, { target: { value: 'nobody-here' } });
        expect(patientSelect).toHaveValue('');
        expect(patientSelect.options[0].text).toMatch(/no matches for "nobody-here"/i);
        expect(matchCountBadge.textContent).toBe('0/2');

        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(search).toHaveValue('');
        expect(matchCountBadge.textContent).toBe('2');
    });

    it('hydrates the patient from history when the URL patient is missing from the initial list', () => {
        render(
            <MemoryRouter
                initialEntries={['/appointments/new?patientId=patient-1']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        const patientSelect = screen.getByLabelText('Selected Patient');
        expect(patientSelect).toHaveValue('patient-1');
        expect(screen.getByRole('option', { name: /Amina Hassan/ })).toBeInTheDocument();
        expect(screen.getByText('Amina Hassan', { selector: 'h4' })).toBeInTheDocument();
    });

    it('resolves the URL patient from history when the initial list excludes them', () => {
        patientsFixture.length = 0;
        patientsFixture.push(
            { patient_id: 'patient-2', first_name: 'Omar', last_name: 'Saleh', mrn: 'PAT-2002', phone: '01111111111' }
        );

        render(
            <MemoryRouter
                initialEntries={['/appointments/new?patientId=patient-1']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        const patientSelect = screen.getByLabelText('Selected Patient');
        expect(patientSelect).toHaveValue('patient-1');
        expect(screen.getByRole('option', { name: /Amina Hassan/ })).toBeInTheDocument();
        expect(screen.getByText('Amina Hassan', { selector: 'h4' })).toBeInTheDocument();

        patientsFixture.length = 0;
        patientsFixture.push(
            { patient_id: 'patient-1', first_name: 'Amina', last_name: 'Hassan', mrn: 'PAT-1001', phone: '01000000000' },
            { patient_id: 'patient-2', first_name: 'Omar', last_name: 'Saleh', mrn: 'PAT-2002', phone: '01111111111' }
        );
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
        fireEvent.change(screen.getByLabelText('Modality / Device'), { target: { value: 'machine-1' } });
        fireEvent.change(screen.getByLabelText('Exam Type'), { target: { value: 'exam-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
        fireEvent.change(screen.getByPlaceholderText('Doctor name, clinic, or walk-in source'), { target: { value: 'Dr. Custom Referrer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Appointment' }));

        await waitFor(() => expect(createAppointmentMock).toHaveBeenCalled());
        expect(createAppointmentMock.mock.calls[0][0]).toMatchObject({
            idempotencyKey: expect.any(String),
            patientId: 'patient-1',
            modalityId: 'machine-1',
            examTypeId: 'exam-1',
            radiologistId: null,
            referringDoctorId: null,
            referringDoctor: 'Dr. Custom Referrer'
        });
    });

    it('reports partial success when insurance approval fails after booking', async () => {
        createInsuranceApprovalMock.mockReturnValue({
            unwrap: vi.fn().mockRejectedValue({ data: { error: 'Approval service unavailable' } })
        });
        render(
            <MemoryRouter
                initialEntries={['/appointments/new']}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
                <BookAppointment />
            </MemoryRouter>
        );

        fireEvent.change(screen.getByLabelText('Selected Patient'), { target: { value: 'patient-1' } });
        fireEvent.change(screen.getByLabelText('Modality / Device'), { target: { value: 'machine-1' } });
        fireEvent.change(screen.getByLabelText('Exam Type'), { target: { value: 'exam-1' } });
        expect(screen.getByText('Selected study')).toBeInTheDocument();
        expect(screen.getByText('Estimated price')).toBeInTheDocument();
        fireEvent.change(screen.getByText('Payment Method').nextElementSibling, { target: { value: 'Insurance' } });
        fireEvent.change(screen.getByText('Insurance Provider').nextElementSibling, { target: { value: 'provider-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Appointment' }));

        await waitFor(() => expect(createInsuranceApprovalMock).toHaveBeenCalledWith(expect.objectContaining({
            appointmentId: 'appointment-1',
            providerId: 'provider-1'
        })));
        expect(createAppointmentMock).toHaveBeenCalledTimes(1);
        expect(createAppointmentMock.mock.calls[0][0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
        expect(toastErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Appointment booked, but insurance approval filing failed'),
            { duration: 8000 }
        );
        expect(navigateMock).toHaveBeenCalledWith('/appointments?patientId=patient-1', { replace: true });
    });
});
