import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import NetworkStatusBanner from '../NetworkStatusBanner';

vi.mock('../../../utils/backendHealth', () => ({
    checkBackendHealth: vi.fn().mockResolvedValue({ online: true, backendAvailable: true }),
}));

describe('NetworkStatusBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when browser is online initially', () => {
        const { container } = render(<NetworkStatusBanner />);
        expect(container.firstChild).toBeNull();
    });

    it('renders offline alert banner when offline event fires', () => {
        render(<NetworkStatusBanner />);

        act(() => {
            window.dispatchEvent(new Event('offline'));
        });

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry|checking/i })).toBeInTheDocument();
    });

    it('renders connection restored notice when online event fires after offline', () => {
        render(<NetworkStatusBanner />);

        act(() => {
            window.dispatchEvent(new Event('offline'));
        });
        expect(screen.getByRole('alert')).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(new Event('online'));
        });
        expect(screen.getByRole('status')).toBeInTheDocument();
    });
});
