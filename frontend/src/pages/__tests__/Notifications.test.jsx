import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NotificationCard } from '../Notifications';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, options = {}) => options.defaultValue || key, i18n: { language: 'en', dir: () => 'ltr' } }),
}));

const item = (priority) => ({
    notification_id: `notification-${priority}`,
    subject: `${priority} update`,
    content: 'Notification details',
    channel: 'InApp',
    status: 'Sent',
    priority,
    category: 'Clinical',
    created_at: new Date().toISOString(),
    is_read: true,
});

describe('staff notification cards', () => {
    it.each(['Normal', 'Action', 'Warning', 'Critical'])('renders the canonical %s priority', (priority) => {
        render(
            <MemoryRouter>
                <NotificationCard
                    item={item(priority)}
                    expanded={false}
                    onToggle={vi.fn()}
                    onMarkRead={vi.fn()}
                    onCopy={vi.fn()}
                    onNavigate={vi.fn()}
                    marking={false}
                    language="en"
                    isAr={false}
                />
            </MemoryRouter>
        );

        expect(screen.getByText(priority)).toBeInTheDocument();
    });

    it('uses the router action callback instead of a plain anchor', () => {
        const onNavigate = vi.fn();
        render(
            <MemoryRouter>
                <NotificationCard
                    item={{ ...item('Action'), action_url: '/worklist?examId=exam-1' }}
                    expanded={false}
                    onToggle={vi.fn()}
                    onMarkRead={vi.fn()}
                    onCopy={vi.fn()}
                    onNavigate={onNavigate}
                    marking={false}
                    language="en"
                    isAr={false}
                />
            </MemoryRouter>
        );

        // t() is mocked to return the key (no i18n provider in tests), so the
        // migrated button's accessible name is the translation key.
        const action = screen.getByRole('button', { name: /openTargetRecord/i });
        expect(action).toBeInTheDocument();
        fireEvent.click(action);
        expect(onNavigate).toHaveBeenCalledWith('/worklist?examId=exam-1');
        expect(document.querySelector('a')).not.toBeInTheDocument();
    });
});
