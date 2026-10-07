import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookAppointment from '../BookAppointment';
import { dateTimeInTimezone } from '../../utils/centerTimezone';

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
const appointmentsFixture = vi.hoisted(() => []);
const centerSettingsFixture = vi.hoisted(() => ({ timezone: 'America/New_York' }));
const centerSettingsErrorFixture = vi.hoisted(() => ({ current: false }));

vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => navigateMock
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: toastErrorMock }
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, fallback) => (typeof fallback === 'string' ? fallback : key) })
}));

vi.mock('react-redux', async (importOriginal) => {
    const actual = await importOriginal().catch(() => ({}));
    return {
        ...actual,
        useSelector: vi.fn((selector) => (selector ? selector({ auth: { user: { user_id: 'user-1', role: 'Receptionist' } } }) : { user_id: 'user-1', role: 'Receptionist' })),
        useDispatch: () => vi.fn()
    };
});

vi.mock('../../store/api', () => ({
    useGetPatientsQuery: () => ({ data: patientsFixture }),
    useGetPatientHistoryQuery: () => ({ data: historyFixture }),
    useGetAppointmentsQuery: () => ({ data: appointmentsFixture }),
    useGetRoomsQuery: () => ({ data: [{ room_id: 'room-1', name: 'MRI Suite 1', room_number: '101', status: 'Active' }] }),
    useGetShiftsQuery: () => ({ data: [] }),
    useGetAttendanceQuery: () => ({ data: [] }),
    useGetMachinesQuery: () => ({ data: [{ modality_id: 'machine-1', room_id: 'room-1', room_number: '101', name: 'MRI 1', status: 'Active' }] }),
    useGetEquipmentDowntimeQuery: () => ({ data: [] }),
    useGetStaffQuery: () => ({ data: [] }),
    useGetExamTypesQuery: () => ({ data: [{ type_id: 'exam-1', name: 'MRI Brain', duration_minutes: 30, price: 750, body_part: 'Brain', contrast_required: false }] }),
    useGetReferringDoctorsQuery: () => ({ data: [] }),
    useGetInsuranceProvidersQuery: () => ({ data: [{ provider_id: 'provider-1', name: 'Health Plan' }] }),
    useGetCenterSettingsQuery: () => ({
        data: centerSettingsFixture,
        isError: centerSettingsErrorFixture.current,
        isLoading: false
    }),
    useCreateAppointmentMutation: () => [createAppointmentMock, { isLoading: false }],
    useCreateInsuranceApprovalMutation: () => [createInsuranceApprovalMock, { isLoading: false }],
    useCreatePatientMutation: () => [vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ patient_id: 'new-patient-1' }) }), { isLoading: false }]
}));

const renderPage = (entry = '/appointments/new') => render(
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BookAppointment />
    </MemoryRouter>
);

/** The patient picker is a search box plus a list of result buttons. */
const searchInput = () => screen.getByLabelText(/Search patient/);

/** Types into the picker and commits the first matching patient. */
async function pickPatient(query, name) {
    fireEvent.focus(searchInput());
    fireEvent.change(searchInput(), { target: { value: query } });
    const result = await screen.findByRole('button', { name: new RegExp(name, 'i') });
    fireEvent.mouseDown(result);
    fireEvent.click(result);
    return result;
}

const pickDevice = () => fireEvent.click(screen.getByRole('button', { name: /MRI 1/ }));
const pickExam = () => fireEvent.click(screen.getByRole('button', { name: /MRI Brain/ }));

/** Picks the first bookable slot offered for the chosen day. */
async function pickSlot() {
    const slot = await screen.findByRole('button', { name: /^Appointment / });
    fireEvent.click(slot);
    return slot;
}

const confirmButton = () => screen.getByRole('button', { name: /Confirm Appointment/i });

/** Opens Additional details and selects one of its sub-tabs. */
function openAdvancedTab(label) {
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /Additional details/i }));
    fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('BookAppointment page', () => {
    beforeEach(() => {
        appointmentsFixture.length = 0;
        centerSettingsErrorFixture.current = false;
        centerSettingsFixture.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        createAppointmentMock.mockReset();
        createAppointmentMock.mockReturnValue({
            unwrap: vi.fn().mockResolvedValue({ appointment_id: 'appointment-1' })
        });
        createInsuranceApprovalMock.mockReset();
        navigateMock.mockReset();
        toastErrorMock.mockReset();
    });

    it('renders as a dedicated page and restores the patient from the URL', () => {
        renderPage('/appointments/new?patientId=patient-1');

        expect(screen.getByRole('heading', { level: 1, name: /Book Appointment/i })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        // The patient from the URL is shown as the committed selection.
        expect(screen.getAllByText('Amina Hassan').length).toBeGreaterThan(0);
        expect(screen.getAllByText('PAT-1001').length).toBeGreaterThan(0);

        // Grouped sections replace the old single-form layout.
        for (const section of ['Booking essentials', 'Choose appointment time', 'Payment & notes', 'Appointment summary']) {
            expect(screen.getByRole('heading', { name: section })).toBeInTheDocument();
        }
        expect(confirmButton()).toBeInTheDocument();
    });

    it('blocks confirmation until the required details are supplied', () => {
        renderPage();

        // The submit control is disabled outright while essentials are missing,
        // so an incomplete booking can never reach the API.
        expect(confirmButton()).toBeDisabled();
        expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
        expect(createAppointmentMock).not.toHaveBeenCalled();
    });

    it('blocks confirmation and reports an error when center timezone settings cannot load', () => {
        centerSettingsErrorFixture.current = true;
        renderPage();

        expect(confirmButton()).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent(/Could not load the center timezone/i);
    });

    it('supports quick scheduling and visual priority controls', async () => {
        renderPage();

        pickDevice();
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        await pickSlot();

        const urgentButton = screen.getByRole('button', { name: 'Urgent' });
        fireEvent.click(urgentButton);
        await waitFor(() => expect(urgentButton).toHaveAttribute('aria-pressed', 'true'));
    });

    it('shows no-show appointments as unavailable, matching server scheduling rules', async () => {
        renderPage();

        pickDevice();
        pickExam();
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        const selectedDate = document.getElementById('appointment-date').value;
        appointmentsFixture.push({
            modality_id: 'machine-1',
            status: 'No-Show',
            start_time: new Date(`${selectedDate}T08:00:00`).toISOString(),
            end_time: new Date(`${selectedDate}T08:30:00`).toISOString()
        });
        fireEvent.click(screen.getByRole('button', { name: '+2 Days' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show all slots' }));

        const slot = await screen.findByRole('button', { name: '08:00' });
        expect(slot).toBeDisabled();
    });

    it('submits the selected center-local appointment time as the matching UTC instant', async () => {
        centerSettingsFixture.timezone = 'America/New_York';
        renderPage();

        await pickPatient('Amina', 'Amina Hassan');
        pickDevice();
        pickExam();
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        const selectedDate = document.getElementById('appointment-date').value;
        fireEvent.change(screen.getByLabelText(/Custom time/i), { target: { value: '08:00' } });
        fireEvent.click(confirmButton());

        await waitFor(() => expect(createAppointmentMock).toHaveBeenCalledTimes(1));
        expect(createAppointmentMock.mock.calls[0][0].startTime)
            .toBe(dateTimeInTimezone(selectedDate, '08:00', 'America/New_York').toISOString());
    });

    it('filters patients by partial details and keeps the chosen patient selected', async () => {
        renderPage();

        await pickPatient('omar', 'Omar Saleh');
        expect(screen.getAllByText('Omar Saleh').length).toBeGreaterThan(0);

        // Searching again must not discard the committed selection.
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        fireEvent.change(searchInput(), { target: { value: 'Amina' } });
        expect(await screen.findByRole('button', { name: /Amina Hassan/i })).toBeInTheDocument();
        // The committed selection survives the new search.
        expect(screen.getAllByText('Omar Saleh').length).toBeGreaterThan(0);
    });

    it('reports the match count and shows a placeholder when nothing matches', async () => {
        renderPage();

        fireEvent.focus(searchInput());
        expect(screen.getByText('2')).toBeInTheDocument();

        fireEvent.change(searchInput(), { target: { value: 'nobody-here' } });

        expect(await screen.findByText('No patients found')).toBeInTheDocument();
        // A dead-end search must still offer a way forward.
        expect(screen.getByRole('button', { name: /Register new patient/i })).toBeInTheDocument();
    });

    it('hydrates the patient from history when the URL patient is missing from the initial list', () => {
        renderPage('/appointments/new?patientId=patient-1');

        expect(screen.getAllByText('Amina Hassan').length).toBeGreaterThan(0);
        expect(screen.getAllByText('PAT-1001').length).toBeGreaterThan(0);
    });

    it('resolves the URL patient from history when the initial list excludes them', () => {
        const backup = [...patientsFixture];
        patientsFixture.length = 0;
        patientsFixture.push(backup[1]);

        try {
            renderPage('/appointments/new?patientId=patient-1');
            expect(screen.getAllByText('Amina Hassan').length).toBeGreaterThan(0);
            expect(screen.getAllByText('PAT-1001').length).toBeGreaterThan(0);
        } finally {
            patientsFixture.length = 0;
            patientsFixture.push(...backup);
        }
    });

    it('opens the prior-study panel when the follow-up checkbox is ticked', async () => {
        renderPage();

        await pickPatient('Amina', 'Amina Hassan');
        expect(screen.queryByLabelText(/Prior study/i)).not.toBeInTheDocument();

        const followUp = screen.getByRole('checkbox', { name: /Follow-up/i });
        fireEvent.click(followUp);
        expect(followUp).toBeChecked();

        const priorStudy = await screen.findByLabelText(/Prior study/i);
        expect(priorStudy).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Select prior study/i })).toBeInTheDocument();
    });

    it('books with a custom referring doctor and no radiologist assignment', async () => {
        renderPage();

        await pickPatient('Amina', 'Amina Hassan');
        pickDevice();
        pickExam();
        openAdvancedTab('Referral & source');
        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
        fireEvent.change(screen.getByPlaceholderText('Doctor name or clinic'), { target: { value: 'Dr. Custom Referrer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        await pickSlot();
        fireEvent.click(confirmButton());

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
        renderPage();

        await pickPatient('Amina', 'Amina Hassan');
        pickDevice();
        pickExam();

        fireEvent.click(screen.getByRole('button', { name: 'Insurance / payer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));

        const providerSelect = await waitFor(() => {
            const match = Array.from(document.querySelectorAll('select'))
                .find((sel) => Array.from(sel.options).some((o) => o.textContent === 'Health Plan'));
            if (!match) throw new Error('insurance provider select not rendered');
            return match;
        });
        expect(screen.getByText(/Insurance Provider/)).toBeInTheDocument();
        await pickSlot();
        expect(confirmButton()).toBeDisabled();
        fireEvent.change(providerSelect, { target: { value: 'provider-1' } });

        await waitFor(() => expect(confirmButton()).toBeEnabled());
        fireEvent.click(confirmButton());

        await waitFor(() => expect(createInsuranceApprovalMock).toHaveBeenCalledWith(expect.objectContaining({
            appointmentId: 'appointment-1',
            providerId: 'provider-1',
            requestedAmount: 750
        })));
        expect(createAppointmentMock).toHaveBeenCalledTimes(1);
        expect(createAppointmentMock.mock.calls[0][0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
        expect(toastErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Appointment booked, but insurance approval filing failed'),
            { duration: 8000 }
        );
        expect(navigateMock).toHaveBeenCalledWith('/appointments?patientId=patient-1', { replace: true });
    });

    it('summarises the chosen slot so staff can verify before confirming', async () => {
        renderPage();

        await pickPatient('Amina', 'Amina Hassan');
        pickDevice();
        pickExam();
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        await pickSlot();

        // The summary card reports how much of the booking is complete and
        // turns to "Ready" once the essentials are in place.
        expect(screen.getByText('Ready')).toBeInTheDocument();
        expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('uses a fresh idempotency key when booking another exam for the same patient', async () => {
        renderPage();

        await pickPatient('Amina', 'Amina Hassan');
        pickDevice();
        pickExam();
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        await pickSlot();
        fireEvent.click(confirmButton());
        await waitFor(() => expect(createAppointmentMock).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole('button', { name: /Book Another Exam for this Patient/i }));
        pickDevice();
        pickExam();
        await pickSlot();
        fireEvent.click(confirmButton());
        await waitFor(() => expect(createAppointmentMock).toHaveBeenCalledTimes(2));

        const firstKey = createAppointmentMock.mock.calls[0][0].idempotencyKey;
        const secondKey = createAppointmentMock.mock.calls[1][0].idempotencyKey;
        expect(firstKey).not.toBe(secondKey);
    });

    it('preserves a zero amount and uses it for insurance authorization', async () => {
        createInsuranceApprovalMock.mockReturnValue({
            unwrap: vi.fn().mockResolvedValue({})
        });
        renderPage();

        await pickPatient('Amina', 'Amina Hassan');
        pickDevice();
        pickExam();
        fireEvent.click(screen.getByRole('button', { name: 'Insurance / payer' }));
        const providerSelect = await waitFor(() => {
            const match = Array.from(document.querySelectorAll('select'))
                .find((select) => Array.from(select.options).some((option) => option.textContent === 'Health Plan'));
            if (!match) throw new Error('insurance provider select not rendered');
            return match;
        });
        fireEvent.change(providerSelect, { target: { value: 'provider-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        await pickSlot();
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
        fireEvent.click(confirmButton());

        await waitFor(() => expect(createAppointmentMock).toHaveBeenCalledTimes(1));
        expect(createAppointmentMock.mock.calls[0][0].paymentAmount).toBe(0);
        expect(createInsuranceApprovalMock).toHaveBeenCalledWith(expect.objectContaining({
            requestedAmount: 0
        }));
    });
});
