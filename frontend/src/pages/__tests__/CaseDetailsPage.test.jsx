import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import CaseDetailsPage from '../CaseDetailsPage';

const baseExam = {
    exam_id: 'exam-1',
    appointment_id: 'apt-1',
    patient_id: 'patient-1',
    patient_name: 'Alice Hassan',
    mrn: 'PAT-1001',
    gender: 'Female',
    date_of_birth: '1990-01-01',
    status: 'Reporting',
    queue_stage: 'Reporting',
    priority: 'Urgent',
    order_number: 'ORD-55',
    exam_type_name: 'MRI Brain',
    modality_name: 'MRI 1',
    room_number: 'R-2',
    radiologist_name: 'Dr. Sami',
    clinical_indication: 'Headache',
    report_status: 'Draft',
    report_request_status: 'Requested',
    report_locked: false,
    report_sections: { findings: 'No acute findings.', impression: 'Normal study.' },
    arrived_at: '2026-07-01T09:00:00Z',
    exam_completed_at: '2026-07-01T09:40:00Z',
    reporting_started_at: '2026-07-01T10:00:00Z',
};

let mockUser = { role: 'Radiologist', permissions: [] };

vi.mock('react-redux', () => ({
    useSelector: () => mockUser,
}));

vi.mock('../../store/api', () => ({
    useGetExamQuery: () => ({
        data: baseExam,
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
    }),
}));

const renderPage = () => render(
    <MemoryRouter initialEntries={['/cases/exam-1']}>
        <Routes><Route path="/cases/:examId" element={<CaseDetailsPage />} /></Routes>
    </MemoryRouter>
);

describe('CaseDetailsPage', () => {
    it('gives report-writing radiologists the editor and PACS actions', () => {
        mockUser = { role: 'Radiologist', permissions: ['VIEW_REPORTS', 'WRITE_REPORTS', 'VIEW_PACS_IMAGES'] };
        renderPage();

        expect(screen.getByText('Alice Hassan')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /resume report/i }).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByRole('button', { name: /pacs viewer/i })).toBeInTheDocument();
        expect(screen.getByText('Normal study.')).toBeInTheDocument();
    });

    it('hides clinical editing and imaging actions from receptionists without those permissions', () => {
        mockUser = { role: 'Receptionist', permissions: ['VIEW_REPORTS', 'VIEW_PATIENTS'] };
        renderPage();

        expect(screen.queryByRole('button', { name: /resume report/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /write report/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /pacs viewer/i })).not.toBeInTheDocument();
        expect(screen.getByText('Normal study.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /patient record/i })).toHaveAttribute('href', '/patients/patient-1');
    });

    it('restricts the report body to unprivileged technicians', () => {
        mockUser = { role: 'Technician', permissions: ['PERFORM_EXAMS'] };
        renderPage();

        expect(screen.queryByText('Normal study.')).not.toBeInTheDocument();
        expect(screen.getByText(/Report text is restricted/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /write report/i })).not.toBeInTheDocument();
    });
});
