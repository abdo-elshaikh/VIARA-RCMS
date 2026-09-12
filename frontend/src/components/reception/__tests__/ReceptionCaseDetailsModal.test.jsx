import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReceptionCaseDetailsModal from '../ReceptionCaseDetailsModal';

const mockUpdateAppointment = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });

vi.mock('react-redux', () => ({
    useSelector: (selector) => selector ? selector({ auth: { user: { user_id: 'user-1', role: 'Receptionist' } } }) : { user_id: 'user-1', role: 'Receptionist' },
    useDispatch: () => vi.fn()
}));

vi.mock('../../../store/api', () => ({
    useUpdateAppointmentMutation: () => [mockUpdateAppointment, { isLoading: false }],
    useGetStaffQuery: () => ({
        data: [
            { id: 'nurse-1', name: 'Mona Nurse', role: 'Nurse' },
            { id: 'tech-1', name: 'Ali Tech', role: 'Technician' },
            { id: 'rad-1', name: 'Dr. Youssef', role: 'Radiologist' }
        ]
    }),
    useGetMachinesQuery: () => ({
        data: [{ id: 'mach-1', name: 'MRI Magnetom', modality: 'MRI', room_id: 'room-1' }]
    }),
    useGetExamTypesQuery: () => ({
        data: [{ id: 'exam-1', name: 'Lumbar Spine MRI', modality: 'MRI' }]
    }),
    useGetRoomsQuery: () => ({
        data: [{ room_id: 'room-1', name: 'MRI Suite 1', room_number: '101', status: 'Active' }]
    }),
    useGetShiftsQuery: () => ({
        data: [{ shift_id: 'shift-1', user_id: 'tech-1', room_id: 'room-1', start_time: '2026-09-02T08:00:00Z', end_time: '2026-09-02T16:00:00Z' }]
    }),
    useGetAttendanceQuery: () => ({
        data: [{ attendance_id: 'att-1', user_id: 'tech-1', clock_in: '2026-09-02T08:05:00Z', status: 'Present' }]
    }),
}));

const mockArrivedCase = {
    appointment: {
        appointment_id: 'app-1',
        patient_name: 'Hassan Mahmoud',
        mrn: 'MRN-888',
        phone: '01012345678',
        exam_type_name: 'Lumbar Spine MRI',
        machine_name: 'MRI Magnetom',
        priority: 'Urgent',
        start_time: '2026-09-02T14:00:00Z',
        end_time: '2026-09-02T14:30:00Z',
        contrast_required: true,
        fasting_required: false,
        notes: 'Needs special positioning',
        nurse_name: 'Mona Nurse',
        technician_name: 'Ali Tech',
        radiologist_name: 'Dr. Youssef',
        receptionist_name: 'Sara Desk',
        order_number: 'PAT-101'
    },
    queue: {
        queue_stage: 'Arrived',
        waiting_minutes: 25,
        is_overdue: false,
    },
    invoice: {
        invoice_id: 'inv-888',
        invoice_number: 'INV-2026-00888',
        invoice_status: 'Partial',
        total_amount: 1800,
        paid_amount: 1000,
        balance_amount: 800,
    }
};

const mockNursingCase = {
    ...mockArrivedCase,
    queue: {
        ...mockArrivedCase.queue,
        queue_stage: 'Prep Pending',
    }
};

describe('ReceptionCaseDetailsModal', () => {
    it('renders all enriched sections, assigned staff, and triggers callbacks', () => {
        const onClose = vi.fn();
        const onMove = vi.fn();
        const onOpenPayment = vi.fn();

        render(
            <ReceptionCaseDetailsModal
                isOpen={true}
                onClose={onClose}
                caseItem={mockArrivedCase}
                onMove={onMove}
                onOpenPayment={onOpenPayment}
                canManageQueue={true}
                canDeliverResults={true}
                locale="ar"
            />
        );

        // Header & Patient Info
        expect(screen.getByText('Hassan Mahmoud')).toBeInTheDocument();
        expect(screen.getByText('MRN-888')).toBeInTheDocument();
        expect(screen.getByText(/01012345678/)).toBeInTheDocument();
        expect(screen.getByText('PAT-101')).toBeInTheDocument();

        // Clinical details
        expect(screen.getByText('Lumbar Spine MRI')).toBeInTheDocument();
        expect(screen.getByText(/MRI Magnetom/)).toBeInTheDocument();
        expect(screen.getByText('Needs special positioning')).toBeInTheDocument();

        // Assigned staff
        expect(screen.getByText('Mona Nurse')).toBeInTheDocument();
        expect(screen.getByText('Ali Tech')).toBeInTheDocument();
        expect(screen.getByText('Dr. Youssef')).toBeInTheDocument();
        expect(screen.getByText('Sara Desk')).toBeInTheDocument();

        // Financial status
        expect(screen.getByText('INV-2026-00888')).toBeInTheDocument();

        // Close button
        const closeButtons = screen.getAllByRole('button', { name: 'إغلاق' });
        fireEvent.click(closeButtons[0]);
        expect(onClose).toHaveBeenCalled();
    });

    it('allows editing before transfer to nursing (Arrived stage)', async () => {
        const onClose = vi.fn();
        const onUpdateAppointment = vi.fn().mockResolvedValue({});

        render(
            <ReceptionCaseDetailsModal
                isOpen={true}
                onClose={onClose}
                caseItem={mockArrivedCase}
                onUpdateAppointment={onUpdateAppointment}
                locale="ar"
            />
        );

        // Edit Booking button should be enabled in Arrived stage
        const editButtons = screen.getAllByRole('button', { name: /تعديل الحجز/i });
        expect(editButtons.length).toBeGreaterThan(0);
        fireEvent.click(editButtons[0]);

        // Form elements should appear
        expect(screen.getByDisplayValue('Needs special positioning')).toBeInTheDocument();
        expect(screen.getByText('حفظ التعديلات')).toBeInTheDocument();

        // Submit save
        const saveButton = screen.getByRole('button', { name: /حفظ التعديلات/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(onUpdateAppointment).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'app-1',
                    priority: 'Urgent',
                    contrastRequired: true,
                })
            );
        });
    });

    it('locks editing after transfer to nursing (Prep Pending stage)', () => {
        const onClose = vi.fn();

        render(
            <ReceptionCaseDetailsModal
                isOpen={true}
                onClose={onClose}
                caseItem={mockNursingCase}
                locale="ar"
            />
        );

        // Should NOT have active edit buttons
        const editButtons = screen.queryAllByRole('button', { name: /تعديل الحجز/i });
        expect(editButtons.length).toBe(0);

        // Should display locked indicator
        expect(screen.getAllByText(/الحجز مقفل/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/مقفل سريرياً/i)).toBeInTheDocument();
    });

    it('synchronizes room with modality and classifies duty staff by shifts and attendance in edit mode', () => {
        const onClose = vi.fn();
        const onUpdateAppointment = vi.fn().mockResolvedValue({});

        render(
            <ReceptionCaseDetailsModal
                isOpen={true}
                onClose={onClose}
                caseItem={mockArrivedCase}
                onUpdateAppointment={onUpdateAppointment}
                workstationDesk="MRI Desk"
                workstationRooms={['room-1']}
                locale="ar"
            />
        );

        // Click Edit
        const editButton = screen.getAllByRole('button', { name: /تعديل الحجز/i })[0];
        fireEvent.click(editButton);

        // Workstation scope banner should be visible
        expect(screen.getByText(/تصفية نشطة حسب مكتب الاستقبال: MRI Desk/)).toBeInTheDocument();

        // Clinical Room label and option should be rendered
        expect(screen.getByText('الغرفة / الجناح')).toBeInTheDocument();
        expect(screen.getByText(/غرفة 101.*MRI Suite 1/)).toBeInTheDocument();

        // Duty staff toggle should be available
        const dutyToggle = screen.getByRole('button', { name: /المناوبون والحاضرون فقط/i });
        expect(dutyToggle).toBeInTheDocument();

        // Technician options should show on-duty before room selection
        expect(screen.getByText(/Ali Tech.*حاضر/i)).toBeInTheDocument();

        // When room-1 is selected, technician dynamically updates to present and room-assigned
        const roomSelect = screen.getByDisplayValue(/جميع الغرف/);
        fireEvent.change(roomSelect, { target: { value: 'room-1' } });
        expect(screen.getByText(/Ali Tech.*حاضر ومخصص للغرفة/i)).toBeInTheDocument();
    });
});
