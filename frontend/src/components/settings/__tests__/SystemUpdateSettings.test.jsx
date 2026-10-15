import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemUpdateSettings from '../SystemUpdateSettings';
const queries = vi.hoisted(() => ({ status: {}, history: {} }));
vi.mock('../../../store/api', () => ({
    useGetSystemUpdateStatusQuery: () => queries.status,
    useGetSystemUpdateHistoryQuery: () => queries.history
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { dir: () => 'ltr', language: 'en' } }) }));
describe('System release settings', () => {
    beforeEach(() => {
        queries.status = { data: { currentVersion: '1.0.0', applicationEnabled: false, environment: 'production', migrationsCount: 194 }, isLoading: false, refetch: vi.fn() };
        queries.history = { data: [], refetch: vi.fn() };
    });
    it('shows the running release and manual deployment policy with no upload or apply control', () => {
        const { container } = render(<SystemUpdateSettings />);
        expect(screen.getByText('v1.0.0')).toBeInTheDocument();
        expect(screen.getByText(/Package uploads and in-app installation are unavailable/)).toBeInTheDocument();
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(container.querySelector('input[type=file]')).toBeNull();
    });
    it('shows a history failure rather than an empty history and retries that query', () => {
        queries.history.isError = true;
        render(<SystemUpdateSettings />);
        expect(screen.getByRole('alert')).toHaveTextContent('Update history could not be loaded');
        expect(screen.queryByText(/No release deployments/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(queries.history.refetch).toHaveBeenCalledOnce();
    });
    it('disables refresh while a background request runs', () => {
        queries.history.isFetching = true;
        render(<SystemUpdateSettings />);
        expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
    });
    it('does not label failed deployments as successful or invent a source version', () => {
        queries.history.data = [{ update_id: 'test', to_version: '1.2.0', status: 'failed', applied_at: 'invalid' }];
        render(<SystemUpdateSettings />);
        expect(screen.getByText('failed')).toHaveClass('text-[var(--VIARA-danger)]');
        expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
        expect(screen.queryByText('v1.0.0', { selector: 'li span' })).not.toBeInTheDocument();
    });
});
