import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import NotificationCenter from '../NotificationCenter';

const mockPersonalQuery = vi.fn();
const mockMarkAll = vi.fn();
const mockMarkOne = vi.fn();
const mockNavigate = vi.fn();

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

const renderDrawer = () => render(
    <MemoryRouter>
        <NotificationCenter isOpen onClose={vi.fn()} unreadCount={1} />
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

        renderDrawer();

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

        renderDrawer();

        expect(screen.getByRole('alert')).toHaveTextContent('Inbox unavailable');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(refetch).toHaveBeenCalledTimes(1);
    });
});
