import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLogs from '../AuditLogs';

const mocks = vi.hoisted(() => ({ data: undefined, fetching: false, error: vi.fn(), success: vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (select) => select({ auth: { user: { role: 'Admin' } } }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, options) => options?.defaultValue || key, i18n: { language: 'en' } }) }));
vi.mock('react-hot-toast', () => ({ default: { success: mocks.success, error: mocks.error } }));
vi.mock('../../store/api', () => ({
    useGetAuditLogsQuery: () => ({ currentData: mocks.data, isFetching: mocks.fetching, refetch: vi.fn() }),
    useGetAuditAlertsQuery: () => ({ data: { alerts: [] }, refetch: vi.fn() }),
    useLazyVerifyAuditChainQuery: () => [vi.fn(), {}],
    useReviewAuditAlertMutation: () => [vi.fn(), {}],
    useRunAuditDetectionsMutation: () => [vi.fn(), {}],
}));
const show = () => render(<MemoryRouter><AuditLogs /></MemoryRouter>);
describe('Audit end user controls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.fetching = false;
        mocks.data = { logs: [{ log_id: 'synthetic-1', actor_name: 'Synthetic user', action: 'LOGIN', timestamp: '2026-10-05T10:00:00Z' }], total: 1 };
    });
    it('opens an accessible inspector and closes with Escape', async () => {
        show();
        fireEvent.click(screen.getAllByTitle('Inspect event')[0]);
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
    it('reports rejected clipboard writes without claiming success', async () => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
        show();
        fireEvent.click(screen.getAllByTitle('Copy event payload')[0]);
        await waitFor(() => expect(mocks.error).toHaveBeenCalled());
        expect(mocks.success).not.toHaveBeenCalled();
    });
    it('shows loading instead of an empty result while changing filters', () => {
        mocks.data = undefined;
        mocks.fetching = true;
        show();
        expect(screen.getByLabelText('Loading audit logs...')).toBeInTheDocument();
        expect(screen.queryByText('No Audit Records Found')).not.toBeInTheDocument();
    });
});
