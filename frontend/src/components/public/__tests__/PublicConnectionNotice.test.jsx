/* eslint-disable no-undef */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import authEn from '../../../i18n/locales/en/auth.json';
import PublicConnectionNotice from '../PublicConnectionNotice';
import { checkBackendHealth } from '../../../utils/backendHealth';

vi.mock('../../../utils/backendHealth', () => ({ checkBackendHealth: vi.fn() }));

it('reports an outage inline and removes the notice after a successful retry', async () => {
    checkBackendHealth.mockResolvedValueOnce({ backendAvailable: false }).mockResolvedValueOnce({ backendAvailable: true });
    const i18n = createInstance();
    await i18n.init({ lng: 'en', resources: { en: { auth: authEn } }, defaultNS: 'auth' });
    const support = vi.fn();
    render(<I18nextProvider i18n={i18n}><PublicConnectionNotice onSupport={support} /></I18nextProvider>);
    await screen.findByText(/The system is currently unavailable/);
    fireEvent.click(screen.getByRole('button', { name: 'Sign-in support' }));
    expect(support).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    act(() => window.dispatchEvent(new CustomEvent('VIARA_PUBLIC_CONNECTION', { detail: { available: false } })));
    expect(screen.getByRole('status')).toHaveTextContent('currently unavailable');
});
