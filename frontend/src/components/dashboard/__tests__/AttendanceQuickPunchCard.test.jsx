import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import AttendanceQuickPunchCard from '../AttendanceQuickPunchCard';

const mockBreakStart = vi.fn();
const mockBreakEnd = vi.fn();

vi.mock('../../../store/api', () => ({
    useBreakStartMutation: () => [mockBreakStart, { isLoading: false }],
    useBreakEndMutation: () => [mockBreakEnd, { isLoading: false }],
}));

describe('AttendanceQuickPunchCard', () => {
    let mockClockIn;
    let mockClockOut;
    let mockClose;
    let mockRequestPermission;
    let mockNavigateShifts;

    const mockUser = {
        name: 'Ahmed Radiologist',
        role: 'Radiologist'
    };

    beforeEach(() => {
        mockClockIn = vi.fn().mockResolvedValue({});
        mockClockOut = vi.fn().mockResolvedValue({});
        mockClose = vi.fn();
        mockRequestPermission = vi.fn();
        mockNavigateShifts = vi.fn();
        mockBreakStart.mockReset();
        mockBreakEnd.mockReset();
        mockBreakStart.mockReturnValue({ unwrap: () => Promise.resolve() });
        mockBreakEnd.mockReturnValue({ unwrap: () => Promise.resolve() });
    });

    it('returns null when isOpen is false', () => {
        const { container } = render(
            <AttendanceQuickPunchCard
                isOpen={false}
                onClose={mockClose}
                isClockedIn={false}
                activeSession={null}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        expect(container.firstChild).toBeNull();
    });

    it('renders idle state with clock in button and user name', () => {
        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={false}
                activeSession={null}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        expect(screen.getByRole('dialog', { name: /الحضور والانصراف|Attendance/i })).toBeInTheDocument();
        expect(screen.getByText(/Ahmed Radiologist/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /تسجيل الحضور الآن|Clock In Now/i })).toBeInTheDocument();
    });

    it('submits notes and calls onClockIn when clicking clock in button', async () => {
        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={false}
                activeSession={null}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        const notesInput = screen.getByPlaceholderText(/ملاحظات الحضور|Clock-in notes/i);
        fireEvent.change(notesInput, { target: { value: 'Covering morning' } });

        const clockInBtn = screen.getByRole('button', { name: /تسجيل الحضور الآن|Clock In Now/i });
        fireEvent.click(clockInBtn);

        expect(mockClockIn).toHaveBeenCalledWith('Covering morning');
        await waitFor(() => {
            expect(mockClose).toHaveBeenCalled();
        });
    });

    it('renders active clocked in state with timer, break, and clock out options', () => {
        const activeSession = {
            clock_in: new Date(Date.now() - 3600000).toISOString(),
            total_break_minutes: 10
        };

        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={true}
                activeSession={activeSession}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        expect(screen.getByRole('button', { name: /تسجيل الانصراف الآن|Clock Out Now/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /بدء فترة استراحة|Start Break/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /إذن انصراف|Early Leave/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /جدول وردياتي|My Schedule/i })).toBeInTheDocument();
    });

    it('triggers break start mutation when clicking break button', () => {
        const activeSession = {
            clock_in: new Date(Date.now() - 3600000).toISOString(),
        };

        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={true}
                activeSession={activeSession}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        const breakBtn = screen.getByRole('button', { name: /بدء فترة استراحة|Start Break/i });
        fireEvent.click(breakBtn);

        expect(mockBreakStart).toHaveBeenCalled();
    });

    it('triggers permission request and schedule navigation handlers', () => {
        const activeSession = {
            clock_in: new Date(Date.now() - 3600000).toISOString(),
        };

        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={true}
                activeSession={activeSession}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        const earlyLeaveBtn = screen.getByRole('button', { name: /إذن انصراف|Early Leave/i });
        fireEvent.click(earlyLeaveBtn);
        expect(mockClose).toHaveBeenCalled();
        expect(mockRequestPermission).toHaveBeenCalled();

        const scheduleBtn = screen.getByRole('button', { name: /جدول وردياتي|My Schedule/i });
        fireEvent.click(scheduleBtn);
        expect(mockNavigateShifts).toHaveBeenCalled();
    });

    it('closes on Escape key press', () => {
        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={false}
                activeSession={null}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('keeps card open and preserves notes when clock-in fails', async () => {
        mockClockIn.mockRejectedValue(new Error('Network error'));

        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={false}
                activeSession={null}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        const notesInput = screen.getByPlaceholderText(/ملاحظات الحضور|Clock-in notes/i);
        fireEvent.change(notesInput, { target: { value: 'Covering night' } });

        const clockInBtn = screen.getByRole('button', { name: /تسجيل الحضور الآن|Clock In Now/i });
        fireEvent.click(clockInBtn);

        expect(mockClockIn).toHaveBeenCalledWith('Covering night');
        await waitFor(() => {
            expect(mockClose).not.toHaveBeenCalled();
        });
        expect(notesInput).toHaveValue('Covering night');
    });

    it('keeps card open and preserves notes when clock-out fails', async () => {
        mockClockOut.mockRejectedValue({ data: { code: 'OPEN_CASHIER_SHIFT', message: 'Shift open' } });
        const activeSession = {
            clock_in: new Date(Date.now() - 3600000).toISOString(),
        };

        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={true}
                activeSession={activeSession}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        const notesInput = screen.getByPlaceholderText(/ملاحظات الانصراف|Exit \/ handover notes/i);
        fireEvent.change(notesInput, { target: { value: 'Leaving now' } });

        const clockOutBtn = screen.getByRole('button', { name: /تسجيل الانصراف الآن|Clock Out Now/i });
        fireEvent.click(clockOutBtn);

        // Confirmation dialog is shown
        const confirmBtn = screen.getByRole('button', { name: /نعم، تسجيل الانصراف|Yes, Clock Out/i });
        fireEvent.click(confirmBtn);

        expect(mockClockOut).toHaveBeenCalledWith('Leaving now');
        await waitFor(() => {
            expect(mockClose).not.toHaveBeenCalled();
        });
        expect(notesInput).toHaveValue('Leaving now');
    });

    it('renders stale session alert and settlement action when session exceeds 24 hours', () => {
        const staleSession = {
            clock_in: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
        };

        render(
            <AttendanceQuickPunchCard
                isOpen={true}
                onClose={mockClose}
                isClockedIn={true}
                activeSession={staleSession}
                onClockIn={mockClockIn}
                onClockOut={mockClockOut}
                onRequestPermission={mockRequestPermission}
                onNavigateShifts={mockNavigateShifts}
                isUpdating={false}
                user={mockUser}
                isRtl={true}
            />
        );

        expect(screen.getByText(/جلسة سابقة معلقة تجاوزت 24 ساعة|Pending session from previous day/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /تسوية وإغلاق الجلسة السابقة|Settle Stale Session/i })).toBeInTheDocument();
    });
});
