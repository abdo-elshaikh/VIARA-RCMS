import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import LicenseSettings from '../LicenseSettings';
import AdminSettings from '../AdminSettings';

const apiMocks = vi.hoisted(() => ({
    licenseInfo: {
        edition: 'trial',
        customerId: 'VIARA-TRIAL-CLIENT',
        issuedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-10-14T00:00:00.000Z',
        daysRemaining: 14,
        maxUsers: 3,
        allowedModules: ['appointments', 'patients', 'reception', 'display', 'finance'],
        isTrial: true,
        fingerprint: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    },
    quotaStats: {
        patients: { current: 12, limit: 50, percent: 24 },
        appointments: { current: 30, limit: 100, percent: 30 },
        users: { current: 2, limit: 3, percent: 67 },
        reports: { current: 4, limit: 10, percent: 40 },
    },
    inspectMutation: vi.fn(),
    activateMutation: vi.fn(),
    refetchInfo: vi.fn(),
    refetchQuota: vi.fn(),
}));

vi.mock('../../../store/api', () => ({
    useGetLicenseInfoQuery: () => ({
        data: apiMocks.licenseInfo,
        isLoading: false,
        refetch: apiMocks.refetchInfo,
    }),
    useGetLicenseQuotaQuery: () => ({
        data: apiMocks.quotaStats,
        isLoading: false,
        refetch: apiMocks.refetchQuota,
    }),
    useInspectLicenseMutation: () => [apiMocks.inspectMutation, { isLoading: false }],
    useActivateLicenseMutation: () => [apiMocks.activateMutation, { isLoading: false }],
    useGetBackupsQuery: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
    useGenerateBackupMutation: () => [vi.fn(), { isLoading: false }],
    useGetAdminTelemetryQuery: () => ({ data: { services: [] }, isLoading: false, refetch: vi.fn() }),
    useGetGovernancePoliciesQuery: () => ({ data: {}, isLoading: false }),
    useUpdateGovernancePoliciesMutation: () => [vi.fn(), { isLoading: false }],
    useVacuumDatabaseMutation: () => [vi.fn(), { isLoading: false }],
    useFlushServerCacheMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

const renderWithRouter = (ui, { route = '/' } = {}) => {
    const store = configureStore({
        reducer: {
            auth: (state = { user: { role: 'Admin' } }) => state,
        },
    });

    return render(
        <Provider store={store}>
            <MemoryRouter initialEntries={[route]}>
                {ui}
            </MemoryRouter>
        </Provider>
    );
};

describe('LicenseSettings and AdminSettings Licensing experience', () => {
    beforeEach(() => {
        apiMocks.inspectMutation.mockReset();
        apiMocks.activateMutation.mockReset();
        apiMocks.inspectMutation.mockImplementation(() => ({
            unwrap: () => Promise.resolve({
                valid: true,
                license: {
                    edition: 'standard',
                    customerId: 'VIARA-TRIAL-CLIENT',
                    daysRemaining: null,
                },
            }),
        }));
        apiMocks.activateMutation.mockImplementation(() => ({
            unwrap: () => Promise.resolve({
                success: true,
                message: 'تم تفعيل مفتاح الترخيص بنجاح',
            }),
        }));
    });

    it('renders current trial license details and quotas correctly', () => {
        renderWithRouter(<LicenseSettings />);

        expect(screen.getByText('VIARA-TRIAL-CLIENT')).toBeInTheDocument();
        expect(screen.getByText(/14 days remaining/i)).toBeInTheDocument();
        expect(screen.getByText(/3 seats/i)).toBeInTheDocument();
        expect(screen.getByText(/a1b2c3d4e5f67890/)).toBeInTheDocument();

        // Check Quotas
        expect(screen.getByText(/12 \/ 50/)).toBeInTheDocument();
        expect(screen.getByText(/30 \/ 100/)).toBeInTheDocument();
    });

    it('allows entering a license key and triggers inspect and activate workflows', async () => {
        renderWithRouter(<LicenseSettings />);

        const textarea = screen.getByPlaceholderText(/eyJ/i);
        fireEvent.change(textarea, { target: { value: 'eyJdummy.license.payload' } });

        const inspectBtn = screen.getByRole('button', { name: /معاينة وفحص المفتاح|Inspect Key Details/i });
        fireEvent.click(inspectBtn);

        await waitFor(() => {
            expect(apiMocks.inspectMutation).toHaveBeenCalledWith({ key: 'eyJdummy.license.payload' });
        });

        const activateBtn = screen.getByRole('button', { name: /تفعيل المفتاح الآن|Activate License Now/i });
        fireEvent.click(activateBtn);

        await waitFor(() => {
            expect(apiMocks.activateMutation).toHaveBeenCalledWith({ key: 'eyJdummy.license.payload' });
        });
    });

    it('mounts inside AdminSettings when the license sub-tab is selected', async () => {
        renderWithRouter(<AdminSettings />, { route: '/settings?tab=admin&subtab=license' });

        await waitFor(() => {
            expect(screen.getByText('VIARA-TRIAL-CLIENT')).toBeInTheDocument();
        });
    });
});
