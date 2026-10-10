import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import NotificationCenter from '../NotificationCenter';

const mockPersonalQuery = vi.fn();
const mockMarkAll = vi.fn();
const mockMarkOne = vi.fn();

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options = {}) => options.defaultValue || key,
        i18n: { language: 'en', dir: () => 'ltr' },
    }),
}));

vi.mock('../../store/api', () => ({
    useGetMyNotificationsQuery: (...args) => mockPersonalQuery(...args),
    useMarkAllMyNotificationsReadMutation: () => [mockMarkAll, { isLoading: false }],
    useMarkMyNotificationReadMutation: () => [mockMarkOne],
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/audioChime', () => ({ playHospitalChime: vi.fn() }));

const renderCenter = (props = {}) => render(
    <MemoryRouter>
        <NotificationCenter isOpen onClose={vi.fn()} unreadCount={1} {...props} />
    </MemoryRouter>
);

describe('NotificationCenter personal inbox', () => {
    it('queries personal notifications and marks personal notifications read', async () => {
        mockPersonalQuery.mockReturnValue({
            data: {
                items: [{
                    notification_id: 'n-1',
                    subject: 'Review exam',
                    content: 'A private update',
                    channel: 'InApp',
                    status: 'Sent',
                    is_read: false,
                    created_at: new Date().toISOString(),
                }],
                counts: { all: 1, unread: 1 },
            },
            isLoading: false,
            isFetching: false,
            isError: false,
            refetch: vi.fn(),
        });

        renderCenter();

        expect(mockPersonalQuery).toHaveBeenCalledWith(
            { limit: 120 },
            expect.objectContaining({ skip: false })
        );
        fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
        await waitFor(() => expect(mockMarkOne).toHaveBeenCalledWith('n-1'));
    });

    it('shows an accessible error and retry action', () => {
        const refetch = vi.fn();
        mockPersonalQuery.mockReturnValue({
            data: undefined,
            isLoading: false,
            isFetching: false,
            isError: true,
            error: { data: { message: 'Inbox unavailable' } },
            refetch,
        });

        renderCenter();

        expect(screen.getByRole('alert')).toHaveTextContent('Inbox unavailable');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('renders category chips, critical alerts banner, and filters items', () => {
        mockPersonalQuery.mockReturnValue({
            data: {
                items: [
                    {
                        notification_id: 'n-critical',
                        subject: 'STAT Panic Finding',
                        content: 'Immediate intervention required',
                        channel: 'InApp',
                        priority: 'Critical',
                        category: 'clinical',
                        patient_mrn: 'MRN-7788',
                        is_read: false,
                        created_at: new Date().toISOString(),
                    },
                    {
                        notification_id: 'n-appt',
                        subject: 'Appointment Confirmed',
                        content: 'Scheduled for 10:00 AM',
                        channel: 'WhatsApp',
                        priority: 'Normal',
                        category: 'appointments',
                        is_read: true,
                        created_at: new Date(Date.now() - 3600000).toISOString(),
                    }
                ],
                counts: { all: 2, unread: 1, critical: 1 },
            },
            isLoading: false,
            isFetching: false,
            isError: false,
            refetch: vi.fn(),
        });

        renderCenter();

        // Critical alert banner visible
        expect(screen.getByText(/critical \/ STAT alert/i)).toBeInTheDocument();
        expect(screen.getByText('STAT Panic Finding')).toBeInTheDocument();
        expect(screen.getByText('Appointment Confirmed')).toBeInTheDocument();

        // Filter by Appointments category
        fireEvent.click(screen.getByTestId('category-chip-appointments'));
        expect(screen.getByText('Appointment Confirmed')).toBeInTheDocument();
        expect(screen.queryByText('STAT Panic Finding')).not.toBeInTheDocument();

        // Switch back to All
        fireEvent.click(screen.getByTestId('category-chip-all'));
        expect(screen.getByText('STAT Panic Finding')).toBeInTheDocument();
    });

    it('toggles audio chime preference when sound button is clicked', () => {
        const onUpdatePreference = vi.fn();
        mockPersonalQuery.mockReturnValue({
            data: { items: [], counts: { all: 0, unread: 0 } },
            isLoading: false,
            isFetching: false,
            isError: false,
            refetch: vi.fn(),
        });

        renderCenter({
            preferences: { notificationSound: false },
            onUpdatePreference,
        });

        const soundButton = screen.getByRole('button', { name: /enable notification chime/i });
        fireEvent.click(soundButton);
        expect(onUpdatePreference).toHaveBeenCalledWith({ notificationSound: true });
    });
});
