import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReceptionSupervisorManager from '../ReceptionSupervisorManager';

// Mock Redux user
vi.mock('react-redux', () => ({
    useSelector: vi.fn(() => ({
        user_id: 'admin-1',
        role: 'Admin',
        permissions: ['MANAGE_STAFF', 'APPROVE_PAYROLL'],
    })),
}));

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
        i18n: { language: 'ar', dir: () => 'rtl' },
    }),
}));

// Mock toast
vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const mockStaff = [
    { user_id: 'sup-1', full_name: 'د. يوسف استشاري الأشعة', role: 'Radiologist', is_active: true },
    { user_id: 'emp-1', full_name: 'محمود فني الرنين', role: 'Technician', is_active: true },
    { user_id: 'sup-2', full_name: 'إيمان مشرفة الاستقبال', role: 'Receptionist', is_active: true },
    { user_id: 'emp-2', full_name: 'كريم موظف الخزينة', role: 'Cashier', is_active: true },
];

const mockAssignments = [
    {
        assignment_id: 'assign-1',
        supervisor_id: 'sup-1',
        employee_id: 'emp-1',
        supervisor_name: 'د. يوسف استشاري الأشعة',
        employee_name: 'محمود فني الرنين',
        department_role: 'Technician',
        can_approve_leave: true,
        can_approve_attendance: true,
        can_approve_shifts: true,
        can_recommend_adjustments: true,
        starts_at: '2026-01-01T00:00:00Z',
        ends_at: null,
    },
    {
        assignment_id: 'assign-2',
        supervisor_id: 'sup-2',
        employee_id: 'emp-2',
        supervisor_name: 'إيمان مشرفة الاستقبال',
        employee_name: 'كريم موظف الخزينة',
        department_role: 'Cashier',
        can_approve_leave: true,
        can_approve_attendance: false,
        can_approve_shifts: true,
        can_recommend_adjustments: false,
        starts_at: '2026-02-01T00:00:00Z',
        ends_at: null,
    },
];

const mockRecommendations = [
    {
        recommendation_id: 'rec-1',
        supervisor_id: 'sup-1',
        supervisor_name: 'د. يوسف استشاري الأشعة',
        employee_id: 'emp-1',
        employee_name: 'محمود فني الرنين',
        recommendation_type: 'Incentive',
        amount: 800,
        reason: 'تفاني متميز في تغطية حالات الطوارئ الليلي',
        status: 'Pending',
        created_at: '2026-09-24T10:00:00Z',
    },
];

const mockCreateAssignment = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
const mockUpdateAssignment = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
const mockRevokeAssignment = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
const mockReviewRecommendation = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });

vi.mock('../../../store/api', () => ({
    useGetStaffQuery: () => ({ data: mockStaff, isLoading: false }),
    useGetStaffSupervisorAssignmentsQuery: () => ({ data: mockAssignments, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetSupervisorRecommendationsQuery: () => ({ data: mockRecommendations, isLoading: false, refetch: vi.fn() }),
    useCreateStaffSupervisorAssignmentMutation: () => [mockCreateAssignment, { isLoading: false }],
    useUpdateStaffSupervisorAssignmentMutation: () => [mockUpdateAssignment, { isLoading: false }],
    useRevokeStaffSupervisorAssignmentMutation: () => [mockRevokeAssignment, { isLoading: false }],
    useReviewSupervisorRecommendationMutation: () => [mockReviewRecommendation, { isLoading: false }],
}));

describe('ReceptionSupervisorManager (General Supervisor Management)', () => {
    it('renders general supervisor management banner and KPI cards', () => {
        render(<ReceptionSupervisorManager />);
        expect(screen.getByText('إدارة المشرفين وتكليفات الإشراف العامة')).toBeInTheDocument();
        expect(screen.getByText('المشرفون المعتمدون')).toBeInTheDocument();
        expect(screen.getByText('الموظفون الخاضعون للإشراف')).toBeInTheDocument();
        expect(screen.getByText('الأقسام المغطاة')).toBeInTheDocument();
        expect(screen.getByText('توصيات مالية قيد المراجعة')).toBeInTheDocument();
    });

    it('renders active assignments with supervisor, employee, and capabilities badges', () => {
        render(<ReceptionSupervisorManager />);
        expect(screen.getByText('د. يوسف استشاري الأشعة')).toBeInTheDocument();
        expect(screen.getByText('محمود فني الرنين')).toBeInTheDocument();
        expect(screen.getByText('إيمان مشرفة الاستقبال')).toBeInTheDocument();
        expect(screen.getByText('كريم موظف الخزينة')).toBeInTheDocument();

        expect(screen.getAllByText('اعتماد الإجازات').length).toBeGreaterThanOrEqual(1);
    });

    it('switches to recommendations tab and allows admin to review pending recommendations', () => {
        render(<ReceptionSupervisorManager />);
        const recTab = screen.getByText('توصيات المشرفين للإدارة (حوافز / خصومات)');
        fireEvent.click(recTab);

        expect(screen.getByText('توصيات المشرفين المالية المرفوعة للإدارة العليا')).toBeInTheDocument();
        expect(screen.getByText('تفاني متميز في تغطية حالات الطوارئ الليلي')).toBeInTheDocument();
        expect(screen.getByText('اعتماد التوصية')).toBeInTheDocument();
        expect(screen.getByText('رفض التوصية')).toBeInTheDocument();
    });

    it('switches to supervisory matrix tab and displays role hierarchies', () => {
        render(<ReceptionSupervisorManager />);
        const matrixTab = screen.getByText('دليل مصفوفة الإشراف المعتمدة');
        fireEvent.click(matrixTab);

        expect(screen.getByText('مصفوفة العلاقات وصلاحيات الإشراف المعتمدة بالمنظومة')).toBeInTheDocument();
    });

    it('opens create new assignment modal and supports multi-selection of employees', async () => {
        render(<ReceptionSupervisorManager />);
        const newBtn = screen.getByText('إسناد تكليف إشرافي جديد');
        fireEvent.click(newBtn);

        expect(screen.getByText('إسناد وتكليف مشرف جديد')).toBeInTheDocument();
        const dialog = screen.getByRole('dialog');
        const inDialog = within(dialog);

        expect(inDialog.getByText('المشرف المفوض')).toBeInTheDocument();
        expect(inDialog.getByText('الموظفون الخاضعون للإشراف (اختيار متعدد)')).toBeInTheDocument();

        // Select supervisor (sup-1 is Radiologist)
        const supervisorSelect = inDialog.getByDisplayValue('اختر المشرف من القائمة...');
        fireEvent.change(supervisorSelect, { target: { value: 'sup-1' } });

        // Radiologist can supervise Technicians (emp-1 is Technician)
        expect(inDialog.getByText('محمود فني الرنين')).toBeInTheDocument();
        expect(inDialog.getByText('تحديد الكل')).toBeInTheDocument();
        expect(inDialog.getByText('إلغاء التحديد')).toBeInTheDocument();

        // Click "تحديد الكل"
        fireEvent.click(inDialog.getByText('تحديد الكل'));
        expect(inDialog.getByText(/تم تحديد 1 من 1/)).toBeInTheDocument();

        // Submit assignment
        const submitBtn = inDialog.getByText('حفظ وإسناد التكليف');
        fireEvent.click(submitBtn);

        expect(mockCreateAssignment).toHaveBeenCalledWith(
            expect.objectContaining({
                supervisorId: 'sup-1',
                employeeIds: ['emp-1'],
                canApproveLeave: true,
                canApproveAttendance: true,
                canApproveShifts: true,
                canRecommendAdjustments: true,
            })
        );
    });
});

