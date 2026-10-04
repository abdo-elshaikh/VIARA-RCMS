/* eslint-disable no-undef */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/authSlice';
import ClinicalDashboard from '../ClinicalDashboard';

const mockUpdateReport = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
const mockRefetch = vi.fn();

vi.mock('../../store/api', () => ({
    useGetQueueQuery: vi.fn(),
    useUpdateReportMutation: () => [mockUpdateReport, { isLoading: false }],
}));

const { useGetQueueQuery } = await import('../../store/api');

const createTestStore = () => configureStore({
    reducer: {
        auth: authReducer,
    },
    preloadedState: {
        auth: {
            user: { id: 'test-user', role: 'Radiologist', name: 'Dr. Test' },
            token: 'mock-token',
        },
    },
});

const sampleQueue = [
    {
        exam_id: 'exam-1',
        mrn: 'MRN-001',
        patient_name: 'Ahmed Ali',
        exam_type_name: 'Chest X-Ray',
        modality_name: 'XR-01',
        body_part: 'Chest',
        clinical_indication: 'Persistent Cough',
        priority: 'Routine',
        queue_stage: 'Reporting',
        waiting_minutes: 25,
        is_overdue: false,
        report_content: 'Normal study.',
        created_at: '2026-09-15T10:00:00Z',
    },
    {
        exam_id: 'exam-2',
        mrn: 'MRN-002',
        patient_name: 'Sara Nour',
        exam_type_name: 'Brain MRI',
        modality_name: 'MRI-01',
        body_part: 'Brain',
        clinical_indication: 'Severe Headache',
        priority: 'Emergency',
        queue_stage: 'Reporting',
        waiting_minutes: 120,
        is_overdue: true,
        report_content: '',
        created_at: '2026-09-15T08:00:00Z',
    },
];

describe('ClinicalDashboard page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useGetQueueQuery.mockReturnValue({
            data: { data: sampleQueue },
            isLoading: false,
            isError: false,
            refetch: mockRefetch,
            isFetching: false,
        });
    });

    it('renders the clinical worklist with metrics and exam rows', () => {
        const store = createTestStore();
        render(
            <Provider store={store}>
                <MemoryRouter>
                    <ClinicalDashboard />
                </MemoryRouter>
            </Provider>
        );

        // Verify patient names appear in table/cards
        expect(screen.getAllByText('Ahmed Ali').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Sara Nour').length).toBeGreaterThan(0);
    });

    it('filters exams when user searches', () => {
        const store = createTestStore();
        render(
            <Provider store={store}>
                <MemoryRouter>
                    <ClinicalDashboard />
                </MemoryRouter>
            </Provider>
        );

        const searchInput = screen.getByPlaceholderText(/search|بحث/i);
        fireEvent.change(searchInput, { target: { value: 'Chest' } });

        expect(screen.getAllByText('Ahmed Ali').length).toBeGreaterThan(0);
        expect(screen.queryByText('Sara Nour')).toBeNull();
    });

    it('opens the report modal and allows report editing', () => {
        const store = createTestStore();
        render(
            <Provider store={store}>
                <MemoryRouter>
                    <ClinicalDashboard />
                </MemoryRouter>
            </Provider>
        );

        const writeButtons = screen.getAllByRole('button', { name: /write|كتابة/i });
        fireEvent.click(writeButtons[0]);

        // Modal should display findings textarea
        const textarea = screen.getByRole('textbox', { name: /findings/i });
        expect(textarea).toBeInTheDocument();

        fireEvent.change(textarea, { target: { value: 'Updated findings text' } });
        expect(textarea.value).toBe('Updated findings text');
    });
});
