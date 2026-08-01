import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import PatientDetailPage from '../PatientDetailPage';

vi.mock('react-redux', () => ({ useSelector: () => ({ role: 'Receptionist' }) }));
vi.mock('../../components/crm/PatientCrmTab', () => ({ default: () => <div>CRM workspace</div> }));
vi.mock('../../components/audit/AuditTimeline', () => ({ default: () => <div>Audit timeline</div> }));
vi.mock('../../components/patient/PrivacyTab', () => ({ default: () => <div>Privacy workspace</div> }));
vi.mock('../../components/patient/DocumentsTab', () => ({ default: () => <div>Documents workspace</div> }));

vi.mock('../../store/api', () => ({
    useGetCenterSettingsQuery: () => ({ data: {} }),
    useGetPatientHistoryQuery: () => ({
        data: {
            patient: {
                patient_id: 'patient-1', first_name: 'Alice', last_name: 'Hassan', mrn: 'PAT-1001',
                patient_status: 'Active', phone: '01000000000', email: 'alice@example.com',
                gender: 'Female', date_of_birth: '1990-01-01', created_at: '2026-01-01',
            },
            history: [{ appointment_id: 'appointment-1', exam_type_name: 'MRI Brain', start_time: '2026-07-01', status: 'Completed' }],
            summary: { visit_count: 1, total_spent: 500, last_visit: '2026-07-01' },
        },
        isLoading: false,
        isFetching: false,
        refetch: vi.fn(),
    }),
    useGetInsurancePoliciesQuery: () => ({ data: [] }),
    useGetInsuranceProvidersQuery: () => ({ data: [] }),
    useCreateInsurancePolicyMutation: () => [vi.fn(), { isLoading: false }],
    useCreateInvoiceMutation: () => [vi.fn(), { isLoading: false }],
    useGeneratePortalPasswordMutation: () => [vi.fn(), { isLoading: false }],
    useUpdatePatientMutation: () => [vi.fn(), { isLoading: false }],
}));

describe('PatientDetailPage', () => {
    it('renders the dedicated longitudinal patient record and its primary actions', () => {
        render(
            <MemoryRouter initialEntries={['/patients/patient-1']}>
                <Routes><Route path="/patients/:patientId" element={<PatientDetailPage />} /></Routes>
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', { name: 'Alice Hassan' })).toBeInTheDocument();
        expect(screen.getAllByText('PAT-1001')).not.toHaveLength(0);
        expect(screen.getByRole('button', { name: /Book new appointment/i })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: /Patient record sections/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Insurance' }));
        expect(screen.getByText('No insurance policy is recorded for this patient.')).toBeInTheDocument();
    });
});
