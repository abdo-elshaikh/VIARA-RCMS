import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import preferencesReducer, { DEFAULT_PREFERENCES } from '../../../store/preferencesSlice';
import AppearanceSettings from '../AppearanceSettings';
import PreferencesSettings from '../PreferencesSettings';

const apiMocks = vi.hoisted(() => ({
    update: vi.fn(),
    exportData: vi.fn(),
}));

vi.mock('../../../store/api', () => ({
    useUpdatePreferencesMutation: () => [apiMocks.update, { isLoading: false }],
    useExportPersonalDataMutation: () => [apiMocks.exportData, { isLoading: false }],
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

const renderSettings = (Component, { preferences = {}, role = 'Developer' } = {}) => {
    const store = configureStore({
        reducer: {
            preferences: preferencesReducer,
            auth: (state = { user: { role } }) => state,
        },
        preloadedState: {
            preferences: { ...DEFAULT_PREFERENCES, ...preferences },
            auth: { user: { role } },
        },
    });

    return {
        store,
        ...render(
            <Provider store={store}>
                <Component />
            </Provider>
        ),
    };
};

describe('appearance and preference settings experience', () => {
    beforeEach(() => {
        apiMocks.update.mockReset();
        apiMocks.exportData.mockReset();
        apiMocks.update.mockImplementation(() => ({ unwrap: () => Promise.resolve({}) }));
        apiMocks.exportData.mockImplementation(() => ({ unwrap: () => Promise.resolve({}) }));
    });

    it('shows a live appearance specimen and persists accessible pressed choices', async () => {
        const { store } = renderSettings(AppearanceSettings);

        expect(screen.getByRole('region', { name: 'Live appearance preview' })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Appearance setting sections' })).toBeInTheDocument();

        const darkChoice = screen.getByRole('button', { name: /Dark Lower-glare surfaces/i });
        expect(darkChoice).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(darkChoice);

        await waitFor(() => expect(store.getState().preferences.theme).toBe('dark'));
        expect(apiMocks.update).toHaveBeenCalled();
    });

    it('validates custom colors without corrupting the saved preference', () => {
        renderSettings(AppearanceSettings, { preferences: { primaryColor: 'custom' } });
        const hexInput = screen.getByLabelText('Custom hex color');

        fireEvent.change(hexInput, { target: { value: '#12' } });
        expect(hexInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('associates regional fields, protects unavailable start pages, and confirms a full reset', () => {
        renderSettings(PreferencesSettings, { preferences: { startPage: '/financials' }, role: 'Nurse' });

        expect(screen.getByLabelText('Timezone offset')).toBeInTheDocument();
        expect(screen.getByText('Your previous start page is no longer available for this role.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
        expect(screen.getByRole('dialog', { name: 'Reset all preferences?' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reset everything' })).toBeInTheDocument();
    });
});
