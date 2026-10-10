import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import TrialBanner from '../TrialBanner';

const licenseState = vi.hoisted(() => ({
    isTrial: true,
    daysRemaining: 12,
    isExpired: false,
    loading: false,
    edition: 'trial',
}));

vi.mock('../../hooks/useLicense', () => ({
    useLicense: () => licenseState,
}));

describe('TrialBanner', () => {
    beforeEach(() => {
        Object.assign(licenseState, {
            isTrial: true,
            daysRemaining: 12,
            isExpired: false,
            loading: false,
            edition: 'trial',
        });
        sessionStorage.clear();
    });

    it('renders a compact trial notice with a plan action', () => {
        render(<TrialBanner />);

        expect(screen.getByRole('status')).toHaveClass('trial-banner--info');
        expect(screen.getByText('12 days left in your trial')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Upgrade plan/i })).toHaveAttribute('href', 'https://viara.net/upgrade');
        expect(sessionStorage.getItem('viara_license_edition')).toBe('trial');
    });

    it('uses warning and urgent tones as the trial end approaches', () => {
        licenseState.daysRemaining = 7;
        const { rerender } = render(<TrialBanner />);
        expect(screen.getByRole('status')).toHaveClass('trial-banner--warning');

        licenseState.daysRemaining = 3;
        rerender(<TrialBanner />);
        expect(screen.getByRole('alert')).toHaveClass('trial-banner--danger');
    });

    it('shows a contact action for expired trials without a dismiss control', () => {
        licenseState.daysRemaining = 0;
        licenseState.isExpired = true;
        render(<TrialBanner />);

        expect(screen.getByRole('alert')).toHaveClass('trial-banner--danger');
        expect(screen.getByText('Your trial has expired')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Contact us/i })).toHaveAttribute('href', 'https://viara.net/contact');
        expect(screen.queryByRole('button', { name: /Dismiss trial notice/i })).not.toBeInTheDocument();
    });

    it('can be dismissed for the current session', () => {
        render(<TrialBanner />);

        fireEvent.click(screen.getByRole('button', { name: /Dismiss trial notice/i }));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('stays hidden while loading and for non-trial licenses', () => {
        licenseState.loading = true;
        const { rerender } = render(<TrialBanner />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        licenseState.loading = false;
        licenseState.isTrial = false;
        rerender(<TrialBanner />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});
