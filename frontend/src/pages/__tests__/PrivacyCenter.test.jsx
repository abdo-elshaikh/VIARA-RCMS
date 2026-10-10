import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrivacyCenter from '../PrivacyCenter';
import i18n from '../../i18n';

const mockRequests = [
    {
        request_id: 'req-1',
        patient_id: 'pat-1',
        patient_name: 'Ahmad Al-Mansoor',
        mrn: 'MRN-1001',
        request_type: 'Export',
        status: 'Pending',
        created_at: '2026-10-01T10:00:00Z',
        notes: 'Full clinical history export requested by patient.'
    },
    {
        request_id: 'req-2',
        patient_id: 'pat-2',
        patient_name: 'Sara Ibrahim',
        mrn: 'MRN-1002',
        request_type: 'Correction',
        status: 'InReview',
        created_at: '2026-10-02T12:00:00Z',
        notes: 'Correction of misspelled maiden name.'
    },
    {
        request_id: 'req-3',
        patient_id: 'pat-3',
        patient_name: 'Khaled Omar',
        mrn: 'MRN-1003',
        request_type: 'Anonymize',
        status: 'Pending',
        created_at: '2026-10-03T14:00:00Z',
        notes: 'Right to be forgotten request.'
    },
    {
        request_id: 'req-4',
        patient_id: 'pat-4',
        patient_name: 'Fatima Nour',
        mrn: 'MRN-1004',
        request_type: 'Export',
        status: 'Completed',
        created_at: '2026-10-04T09:00:00Z',
        resolved_at: '2026-10-04T11:00:00Z',
        resolved_by_name: 'Dr. Compliance Officer',
        export_id: 'exp-999',
        resolution_notes: 'Export file generated and verified.'
    }
];

const mockPatients = [
    { patient_id: 'pat-1', name: 'Ahmad Al-Mansoor', mrn: 'MRN-1001' },
    { patient_id: 'pat-2', name: 'Sara Ibrahim', mrn: 'MRN-1002' }
];

const mockConsents = [
    {
        consent_id: 'con-1',
        patient_id: 'pat-1',
        type: 'Treatment',
        status: 'Active',
        signed_at: '2026-09-01T08:00:00Z',
        source: 'Staff'
    }
];

vi.mock('../../store/api', () => ({
    useGetPrivacyRequestsQuery: () => ({
        data: mockRequests,
        isLoading: false,
        refetch: vi.fn()
    }),
    useResolvePrivacyRequestMutation: () => [vi.fn().mockResolvedValue({ export: { export_id: 'exp-123' } })],
    useCreatePrivacyRequestMutation: () => [vi.fn().mockResolvedValue({}), { isLoading: false }],
    useGetPatientsQuery: () => ({
        data: mockPatients,
        isLoading: false
    }),
    useGetPatientConsentsQuery: () => ({
        data: mockConsents,
        isLoading: false,
        refetch: vi.fn()
    }),
    useGetCurrentPatientConsentsQuery: () => ({
        data: {
            current: { consent_marketing: true, consent_data_sharing: false },
            history: mockConsents
        },
        isLoading: false,
        refetch: vi.fn()
    }),
    useAddPatientConsentMutation: () => [vi.fn().mockResolvedValue({}), { isLoading: false }],
    useRevokePatientConsentMutation: () => [vi.fn().mockResolvedValue({}), { isLoading: false }]
}));

describe('PrivacyCenter End-User Interface & Governance Suite', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('renders command deck with HUD statistics and compliance telemetry', () => {
        render(
            <MemoryRouter>
                <PrivacyCenter />
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', { level: 1, name: 'Privacy Center' })).toBeInTheDocument();
        expect(screen.getByText('Data Subject Requests (DSAR)')).toBeInTheDocument();
        expect(screen.getByText('Patient Consents & Directives')).toBeInTheDocument();
        expect(screen.getByText('Retention & Compliance Standards')).toBeInTheDocument();

        // Telemetry cards
        expect(screen.getByText('Resolution Rate')).toBeInTheDocument();
        expect(screen.getByText('Exports ready')).toBeInTheDocument();
    });

    it('filters requests via search input and quick filter pills', () => {
        render(
            <MemoryRouter>
                <PrivacyCenter />
            </MemoryRouter>
        );

        expect(screen.getAllByText('Ahmad Al-Mansoor').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Sara Ibrahim').length).toBeGreaterThan(0);

        const searchInput = screen.getByPlaceholderText('Search patient, MRN, or notes');
        fireEvent.change(searchInput, { target: { value: 'MRN-1002' } });

        expect(screen.queryByText('Ahmad Al-Mansoor')).not.toBeInTheDocument();
        expect(screen.getAllByText('Sara Ibrahim').length).toBeGreaterThan(0);
    });

    it('opens detailed inspection modal when clicking inspect button', () => {
        render(
            <MemoryRouter>
                <PrivacyCenter />
            </MemoryRouter>
        );

        const inspectButtons = screen.getAllByTitle('View Details');
        fireEvent.click(inspectButtons[0]);

        expect(screen.getByText('Privacy Request Inspection')).toBeInTheDocument();
        expect(screen.getByText('Full clinical history export requested by patient.')).toBeInTheDocument();
    });

    it('requires explicit checkbox confirmation before confirming high-risk patient anonymization', () => {
        render(
            <MemoryRouter>
                <PrivacyCenter />
            </MemoryRouter>
        );

        // Find the Anonymization execute button
        const executeButtons = screen.getAllByRole('button');
        const anonymizeBtn = executeButtons.find(b => b.textContent && b.textContent.includes('Execute Anonymization'));
        expect(anonymizeBtn).toBeDefined();

        fireEvent.click(anonymizeBtn);

        // High risk dialog opens
        expect(screen.getByText('Permanent Patient Record Anonymization')).toBeInTheDocument();
        expect(screen.getByText('High-Risk Irreversible Action')).toBeInTheDocument();

        const confirmButton = screen.getByRole('button', { name: /Confirm Permanent Anonymization/ });
        expect(confirmButton).toBeDisabled();

        // Check the acknowledgment checkbox
        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        expect(confirmButton).toBeEnabled();
    });

    it('switches to consents tab and displays patient consent directives', () => {
        render(
            <MemoryRouter>
                <PrivacyCenter />
            </MemoryRouter>
        );

        const consentsTab = screen.getByRole('button', { name: /Patient Consents & Directives/ });
        fireEvent.click(consentsTab);

        expect(screen.getByText('Select Patient to Manage Consents & Directives')).toBeInTheDocument();
    });

    it('switches to retention tab and displays statutory health record retention schedule', () => {
        render(
            <MemoryRouter>
                <PrivacyCenter />
            </MemoryRouter>
        );

        const retentionTab = screen.getByRole('button', { name: /Retention & Compliance Standards/ });
        fireEvent.click(retentionTab);

        expect(screen.getByText('Health Data Retention & Compliance Standards')).toBeInTheDocument();
        expect(screen.getByText('Adult Medical Records & Radiology Reports')).toBeInTheDocument();
        expect(screen.getByText('Pediatric & Oncology Medical Records')).toBeInTheDocument();
        expect(screen.getByText('Diagnostic Radiology Studies (DICOM/PACS)')).toBeInTheDocument();
        expect(screen.getByText('Active Cryptographic Safeguards')).toBeInTheDocument();
    });
});
