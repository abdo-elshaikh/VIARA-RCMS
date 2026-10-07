import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SystemUpdateSettings from '../SystemUpdateSettings';
vi.mock('../../../store/api', () => ({
    useGetSystemUpdateStatusQuery: () => ({ data: { currentVersion: '1.0.0', applicationEnabled: false, environment: 'production', migrationsCount: 194 }, isLoading: false, refetch: vi.fn() }),
    useGetSystemUpdateHistoryQuery: () => ({ data: [], refetch: vi.fn() })
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { dir: () => 'ltr', language: 'en' } }) }));
describe('System release settings', () => {
    it('shows the running release and manual deployment policy with no upload or apply control', () => {
        const { container } = render(<SystemUpdateSettings />);
        expect(screen.getByText('v1.0.0')).toBeInTheDocument();
        expect(screen.getByText(/Package uploads and in-app installation are unavailable/)).toBeInTheDocument();
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(container.querySelector('input[type=file]')).toBeNull();
    });
});
