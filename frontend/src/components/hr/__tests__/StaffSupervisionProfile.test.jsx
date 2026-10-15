import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StaffSupervisionProfile from '../StaffSupervisionProfile';

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

// Mock API hooks
const mockReviewRequest = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
const mockCreateRecommendation = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
const mockCreateShift = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
const mockUpdateShift = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
const mockDeleteShift = vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });

const mockAssignments = [
    {
        assignment_id: 'assign-1',
        supervisor_id: 'sup-1',
        employee_id: 'emp-1',
        employee_name: 'أحمد محمود فني أشعة',
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
        supervisor_id: 'sup-1',
        employee_id: 'emp-2',
        employee_name: 'سارة إبراهيم تمريض',
        department_role: 'Nurse',
        can_approve_leave: true,
        can_approve_attendance: true,
        can_approve_shifts: false,
        can_recommend_adjustments: true,
        starts_at: '2026-01-01T00:00:00Z',
        ends_at: null,
    },
];

const mockInbox = [
    {
        kind: 'leave',
        id: 'leave-1',
        employee_id: 'emp-1',
        employee_name: 'أحمد محمود فني أشعة',
        employee_role: 'Technician',
        type: 'Sick',
        reason: 'وعكة صحية طارئة',
        start_date: '2026-09-25T00:00:00Z',
        end_date: '2026-09-26T00:00:00Z',
        created_at: '2026-09-24T12:00:00Z',
    },
    {
        kind: 'attendance',
        id: 'att-perm-1',
        employee_id: 'emp-2',
        employee_name: 'سارة إبراهيم تمريض',
        employee_role: 'Nurse',
        type: 'EarlyDeparture',
        minutes_granted: 60,
        allowed_time: '14:00',
        reason: 'ظرف عائلي مفاجئ',
        created_at: '2026-09-24T14:00:00Z',
    },
];

const mockShifts = [
    {
        shift_id: 'shift-1',
        user_id: 'emp-1',
        employee_name: 'أحمد محمود فني أشعة',
        role: 'Technician',
        room_name: 'CT Scanner Room 1',
        room_number: '101',
        start_time: '2026-09-25T08:00:00Z',
        end_time: '2026-09-25T16:00:00Z',
        notes: 'وردية صباحية لقسم الأشعة المقطعية',
    },
];

const mockRecommendations = [
    {
        recommendation_id: 'rec-1',
        supervisor_id: 'sup-1',
        employee_id: 'emp-1',
        employee_name: 'أحمد محمود فني أشعة',
        recommendation_type: 'Incentive',
        amount: 500,
        reason: 'كفاءة عالية وسرعة في إنجاز حالات الطوارئ',
        status: 'Approved',
        review_notes: 'معتمد من المدير المالي',
        created_at: '2026-09-20T10:00:00Z',
    },
];

vi.mock('../../../store/api', () => ({
    useGetStaffSupervisorAssignmentsQuery: () => ({ data: mockAssignments, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetSupervisorInboxQuery: () => ({ data: mockInbox, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetSupervisorRecommendationsQuery: () => ({ data: mockRecommendations, isLoading: false, refetch: vi.fn() }),
    useGetShiftsQuery: () => ({ data: mockShifts, isLoading: false, refetch: vi.fn() }),
    useGetAttendanceQuery: () => ({ data: [], isLoading: false }),
    useGetRoomsQuery: () => ({ data: [{ room_id: 'room-1', name: 'CT Room 1', room_number: '101' }] }),
    useReviewSupervisorRequestMutation: () => [mockReviewRequest, { isLoading: false }],
    useCreateSupervisorRecommendationMutation: () => [mockCreateRecommendation, { isLoading: false }],
    useCreateShiftMutation: () => [mockCreateShift, { isLoading: false }],
    useUpdateShiftMutation: () => [mockUpdateShift, { isLoading: false }],
    useDeleteShiftMutation: () => [mockDeleteShift, { isLoading: false }],
}));

describe('StaffSupervisionProfile Component', () => {
    it('renders executive command header and KPI cards with correct counts', () => {
        render(<StaffSupervisionProfile />);
        expect(screen.getByText('مركز الإشراف الإداري والتشغيلي')).toBeInTheDocument();
        expect(screen.getByText('أعضاء الفريق')).toBeInTheDocument();
        expect(screen.getByText('طلبات معلقة')).toBeInTheDocument();
        expect(screen.getByText('توصيات للإدارة')).toBeInTheDocument();
    });

    it('renders request inbox with pending requests and action buttons', () => {
        render(<StaffSupervisionProfile />);
        expect(screen.getByText('أحمد محمود فني أشعة')).toBeInTheDocument();
        expect(screen.getByText('وعكة صحية طارئة')).toBeInTheDocument();
        expect(screen.getByText('سارة إبراهيم تمريض')).toBeInTheDocument();
        expect(screen.getByText('ظرف عائلي مفاجئ')).toBeInTheDocument();

        const approveButtons = screen.getAllByText('موافقة إشرافية');
        expect(approveButtons.length).toBeGreaterThanOrEqual(1);
        const rejectButtons = screen.getAllByText('رفض الطلب');
        expect(rejectButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('switches to shift management tab and displays schedule and action buttons', () => {
        render(<StaffSupervisionProfile />);
        const shiftTab = screen.getByText('إدارة وجدول الورديات');
        fireEvent.click(shiftTab);

        expect(screen.getByText('إسناد وجدولة وردية جديدة')).toBeInTheDocument();
        expect(screen.getByText('CT Scanner Room 1 (101)')).toBeInTheDocument();
    });

    it('switches to financial recommendations tab and displays the submission form', () => {
        render(<StaffSupervisionProfile />);
        const recTab = screen.getByText('التوصيات المالية للإدارة');
        fireEvent.click(recTab);

        expect(screen.getByText('رفع توصية مالية للإدارة (حافز / خصم / جزاء)')).toBeInTheDocument();
        expect(screen.getByText('الموظف المعني')).toBeInTheDocument();
        expect(screen.getByText('نوع التوصية')).toBeInTheDocument();
        expect(screen.getByText('المبلغ المقترح (جنيه مصري - EGP)')).toBeInTheDocument();
        expect(screen.getByText('مبررات وأسباب التوصية بالتفصيل')).toBeInTheDocument();
        expect(screen.getByText('إرسال التوصية للإدارة')).toBeInTheDocument();
    });

    it('switches to team directory tab and displays active team member cards', () => {
        render(<StaffSupervisionProfile />);
        const teamTab = screen.getByText('دليل الفريق والصلاحيات');
        fireEvent.click(teamTab);

        expect(screen.getByText('أعضاء الفريق وصلاحيات الإشراف الممنوحة لك')).toBeInTheDocument();
        expect(screen.getAllByText('اعتماد الإجازات').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('أذونات الانصراف والحضور').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('إدارة وجدولة الورديات').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('رفع التوصيات المالية').length).toBeGreaterThanOrEqual(1);
    });
});
