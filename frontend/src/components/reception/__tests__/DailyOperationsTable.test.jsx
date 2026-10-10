import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DailyOperationsTable from '../DailyOperationsTable';

vi.mock('react-redux', () => ({
    useSelector: vi.fn((selector) => ({
        role: 'Admin',
        permissions: ['CREATE_INVOICES', 'MANAGE_QUEUE']
    }))
}));

vi.mock('../../../store/api', () => ({
    useClaimReceptionTaskMutation: () => [vi.fn().mockResolvedValue({ data: {} })],
    useReleaseReceptionTaskMutation: () => [vi.fn().mockResolvedValue({ data: {} })],
    useBroadcastPatientCallMutation: () => [vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })],
}));

const t = (key, options) => options?.defaultValue || (typeof options === 'string' ? options : key);

const mockAppointments = [
    {
        appointment_id: 'app-1',
        exam_id: 'exam-1',
        patient_name: 'Khaled Omar',
        mrn: 'MRN-101',
        exam_type_name: 'Brain MRI with Contrast',
        machine_name: 'MRI Room 1',
        priority: 'Routine',
        queue_stage: 'Arrived',
        start_time: '2026-09-02T10:00:00Z',
        contrast_required: true,
    },
    {
        appointment_id: 'app-2',
        exam_id: 'exam-2',
        patient_name: 'Sarah Nabil',
        mrn: 'MRN-102',
        exam_type_name: 'Chest CT Scan',
        machine_name: 'CT Scanner A',
        priority: 'Urgent',
        queue_stage: 'In Exam',
        start_time: '2026-09-02T10:30:00Z',
    },
    {
        appointment_id: 'app-3',
        exam_id: 'exam-3',
        patient_name: 'Mostafa Ali',
        mrn: 'MRN-103',
        exam_type_name: 'Abdominal Ultrasound',
        machine_name: 'US Room 2',
        priority: 'Routine',
        queue_stage: 'Scheduled',
        start_time: '2026-09-02T11:00:00Z',
    }
];

const mockQueueItems = [
    {
        exam_id: 'exam-1',
        appointment_id: 'app-1',
        patient_name: 'Khaled Omar',
        mrn: 'MRN-101',
        queue_stage: 'Arrived',
        waiting_minutes: 15,
        is_overdue: false,
    },
    {
        exam_id: 'exam-2',
        appointment_id: 'app-2',
        patient_name: 'Sarah Nabil',
        mrn: 'MRN-102',
        queue_stage: 'In Exam',
        waiting_minutes: 45,
        is_overdue: true,
    }
];

const mockInvoices = [
    {
        invoice_id: 'inv-1',
        appointment_id: 'app-1',
        invoice_status: 'Paid',
        total_amount: 1500,
        paid_amount: 1500,
        balance_amount: 0,
    },
    {
        invoice_id: 'inv-2',
        appointment_id: 'app-2',
        invoice_status: 'Partial',
        total_amount: 2000,
        paid_amount: 500,
        balance_amount: 1500,
    }
];

describe('DailyOperationsTable', () => {
    it('renders operations table with patient names, exams, and financial statuses', () => {
        const onSelectCase = vi.fn();
        const onToggleWaitlist = vi.fn();

        render(
            <DailyOperationsTable
                appointments={mockAppointments}
                queueItems={mockQueueItems}
                invoices={mockInvoices}
                appLoading={false}
                canManageQueue={true}
                canDeliverResults={true}
                canViewInvoices={true}
                t={t}
                i18n={{ language: 'ar' }}
                onSelectCase={onSelectCase}
                isWaitlistOpen={true}
                onToggleWaitlist={onToggleWaitlist}
                waitlistCount={3}
            />
        );

        // Patients displayed
        expect(screen.getByText('Khaled Omar')).toBeInTheDocument();
        expect(screen.getByText('Sarah Nabil')).toBeInTheDocument();
        expect(screen.getByText('Mostafa Ali')).toBeInTheDocument();

        // Financial status indicators
        expect(screen.getByText('خالص')).toBeInTheDocument();
        expect(screen.getByText(/متبقي.*1500/)).toBeInTheDocument();
        expect(screen.getByText('بدون فاتورة')).toBeInTheDocument();

        // Clicking a patient name opens details modal
        fireEvent.click(screen.getByText('Khaled Omar'));
        expect(onSelectCase).toHaveBeenCalledWith(expect.objectContaining({
            appointment: expect.objectContaining({ patient_name: 'Khaled Omar' })
        }));
    });

    it('filters rows by modality and searches by text', () => {
        render(
            <DailyOperationsTable
                appointments={mockAppointments}
                queueItems={mockQueueItems}
                invoices={mockInvoices}
                appLoading={false}
                canManageQueue={true}
                canViewInvoices={true}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        // Filter by search
        const searchInput = screen.getByPlaceholderText('ابحث عن المريض أو الرقم الطبي أو الفحص...');
        fireEvent.change(searchInput, { target: { value: 'Sarah' } });
        expect(screen.getByText('Sarah Nabil')).toBeInTheDocument();
        expect(screen.queryByText('Khaled Omar')).not.toBeInTheDocument();

        // Clear search
        fireEvent.change(searchInput, { target: { value: '' } });
        expect(screen.getByText('Khaled Omar')).toBeInTheDocument();

        // Filter by modality
        fireEvent.click(screen.getByRole('button', { name: /فلاتر/ }));
        const modalitySelect = screen.getByLabelText('الجهاز / القسم');
        fireEvent.change(modalitySelect, { target: { value: 'MRI Room 1' } });
        expect(screen.getByText('Khaled Omar')).toBeInTheDocument();
        expect(screen.queryByText('Sarah Nabil')).not.toBeInTheDocument();
    });

    it('shows the assigned receptionist name when the ownership is stored on the queue item', () => {
        render(
            <DailyOperationsTable
                appointments={[{ ...mockAppointments[0], receptionist_id: null, receptionist_name: null, receptionist_desk: null }]}
                queueItems={[{
                    ...mockQueueItems[0],
                    receptionist_id: 'user-42',
                    receptionist_name: 'سارة أحمد',
                    receptionist_desk: 'شباك 2',
                }]}
                invoices={[]}
                appLoading={false}
                canManageQueue={true}
                canViewInvoices={true}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        expect(screen.getByText('موظف الاستقبال:')).toBeInTheDocument();
        expect(screen.getAllByText('سارة أحمد').length).toBeGreaterThan(0);
        expect(screen.getByText('شباك 2')).toBeInTheDocument();
    });

    it('shows the assigned receptionist name in the daily operations table with a clear label', () => {
        render(
            <DailyOperationsTable
                appointments={[{
                    ...mockAppointments[0],
                    receptionist_id: 'user-42',
                    receptionist_name: 'سارة أحمد',
                    receptionist_desk: 'شباك 2',
                }]}
                queueItems={[]}
                invoices={[]}
                appLoading={false}
                canManageQueue={true}
                canViewInvoices={true}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        expect(screen.getByText('موظف الاستقبال:')).toBeInTheDocument();
        expect(screen.getAllByText('سارة أحمد').length).toBeGreaterThan(0);
        expect(screen.getByText('شباك 2')).toBeInTheDocument();
    });

    it('switches between table and cards view mode', () => {
        render(
            <DailyOperationsTable
                appointments={mockAppointments}
                queueItems={mockQueueItems}
                invoices={mockInvoices}
                appLoading={false}
                canManageQueue={true}
                canViewInvoices={true}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        // Click Cards view icon
        const cardsViewBtn = screen.getByTitle('بطاقات سريعة');
        fireEvent.click(cardsViewBtn);

        // In cards view, articles are rendered
        expect(screen.getAllByRole('article')).toHaveLength(3);

        // Switch back to table view
        const tableViewBtn = screen.getByTitle('جدول تفصيلي');
        fireEvent.click(tableViewBtn);
        expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('keeps all operations visible when the shared room selection is empty', () => {
        render(
            <DailyOperationsTable
                appointments={mockAppointments}
                queueItems={mockQueueItems}
                invoices={mockInvoices}
                externalRooms={[]}
                appLoading={false}
                canManageQueue={true}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        expect(screen.getByText('Khaled Omar')).toBeInTheDocument();
        expect(screen.getByText('Sarah Nabil')).toBeInTheDocument();
        expect(screen.getByText('Mostafa Ali')).toBeInTheDocument();
    });

    it('shows an existing pending exception status instead of allowing a duplicate request', () => {
        const onRequestPartialPaymentException = vi.fn();
        const partialInvoice = {
            ...mockInvoices[0],
            invoice_status: 'Partial',
            paid_amount: 500,
            balance_amount: 1000,
        };

        render(
            <DailyOperationsTable
                appointments={[mockAppointments[0]]}
                queueItems={[mockQueueItems[0]]}
                invoices={[partialInvoice]}
                partialPaymentExceptions={[{
                    exception_id: 'exception-1',
                    invoice_id: partialInvoice.invoice_id,
                    transaction_type: 'ClinicalQueueTransition',
                    status: 'Pending',
                    reason: 'Management approval is required',
                    requested_at: '2026-09-02T10:01:00Z',
                    metadata: { targetStage: 'Ready for Exam' },
                }]}
                onRequestPartialPaymentException={onRequestPartialPaymentException}
                appLoading={false}
                canManageQueue={true}
                canViewInvoices={true}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        expect(screen.getByText('Pending review')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'طلب استثناء' })).not.toBeInTheDocument();
        expect(onRequestPartialPaymentException).not.toHaveBeenCalled();
    });

    it('recognizes an approved exception target stored in metadata and unlocks the queue transition', () => {
        const onMove = vi.fn();
        const appointment = {
            ...mockAppointments[0],
            queue_stage: 'Payment Pending',
            status: 'Checked-in',
        };
        const queueItem = {
            ...mockQueueItems[0],
            queue_stage: 'Payment Pending',
            status: 'Checked-in',
        };
        const partialInvoice = {
            ...mockInvoices[0],
            invoice_status: 'Partial',
            paid_amount: 500,
            balance_amount: 1000,
        };

        render(
            <DailyOperationsTable
                appointments={[appointment]}
                queueItems={[queueItem]}
                invoices={[partialInvoice]}
                partialPaymentExceptions={[{
                    exception_id: 'exception-2',
                    invoice_id: partialInvoice.invoice_id,
                    transaction_type: 'ClinicalQueueTransition',
                    status: 'Approved',
                    requested_at: '2026-09-02T10:01:00Z',
                    expires_at: '2099-09-02T10:01:00Z',
                    metadata: { targetStage: 'Ready for Exam' },
                }]}
                onRequestPartialPaymentException={vi.fn()}
                onMove={onMove}
                appLoading={false}
                canManageQueue={true}
                canViewInvoices={true}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        expect(screen.getByText('Exception approved')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'جاهز للفحص' }));
        expect(onMove).toHaveBeenCalledWith(
            expect.objectContaining({ exam_id: 'exam-1' }),
            'Ready for Exam'
        );
    });

    it('does not show all cases when a room-scoped workstation has no linked rooms', () => {
        render(
            <DailyOperationsTable
                appointments={mockAppointments}
                queueItems={mockQueueItems}
                externalScope="rooms"
                externalRooms={[]}
                externalModalities={[]}
                appLoading={false}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        expect(screen.queryByText('Khaled Omar')).not.toBeInTheDocument();
        expect(screen.queryByText('Sarah Nabil')).not.toBeInTheDocument();
        expect(screen.queryByText('Mostafa Ali')).not.toBeInTheDocument();
    });

    it('does not render financial status without invoice viewing permission', () => {
        render(
            <DailyOperationsTable
                appointments={[mockAppointments[0]]}
                queueItems={[mockQueueItems[0]]}
                invoices={mockInvoices}
                appLoading={false}
                canManageQueue={true}
                canViewInvoices={false}
                t={t}
                i18n={{ language: 'ar' }}
            />
        );

        expect(screen.queryByText('الموقف المالي')).not.toBeInTheDocument();
        expect(screen.queryByText('خالص')).not.toBeInTheDocument();
    });
});
