/* eslint-disable no-undef */
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import LandingServiceHealthModal from '../LandingServiceHealthModal';
import { useGetOrthancSystemQuery } from '../../store/api';
import { checkBackendHealth } from '../../utils/backendHealth';

vi.mock('../../store/api', () => ({ useGetOrthancSystemQuery: vi.fn() }));
vi.mock('../../utils/backendHealth', () => ({ checkBackendHealth: vi.fn() }));

const renderHealth = ({ role = null, authenticated = false, isRtl = false, onSupport = vi.fn() } = {}) => {
    const store = configureStore({ reducer: { auth: () => ({ user: role ? { role } : null, isAuthenticated: authenticated }) } });
    return render(<Provider store={store}><LandingServiceHealthModal isRtl={isRtl} onClose={vi.fn()} onSupport={onSupport} /></Provider>);
};

beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
    checkBackendHealth.mockReset().mockResolvedValue({ backendAvailable: true });
    useGetOrthancSystemQuery.mockReset().mockReturnValue({ data: { Name: 'Imaging' }, isFetching: false, refetch: vi.fn() });
});

it('gives an Arabic visitor readable availability and support without querying administration services', async () => {
    const support = vi.fn();
    renderHealth({ isRtl: true, onSupport: support });
    expect(screen.getByRole('dialog', { name: 'حالة النظام' })).toBeInTheDocument();
    expect(await screen.findByText('النظام متاح حاليًا.')).toBeVisible();
    expect(useGetOrthancSystemQuery).toHaveBeenCalledWith(undefined, { skip: true });
    expect(screen.queryByText('تفاصيل إدارة النظام')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التواصل مع الدعم' }));
    expect(support).toHaveBeenCalledOnce();
});

it('rechecks an unavailable system and reports recovery', async () => {
    checkBackendHealth.mockResolvedValueOnce({ backendAvailable: false }).mockResolvedValueOnce({ backendAvailable: true });
    renderHealth();
    expect(await screen.findByText(/currently unavailable/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('The system is currently available.')).toBeVisible();
});

it.each(['Admin', 'Developer'])('exposes administration details only to an authenticated %s', async (role) => {
    renderHealth({ role, authenticated: true });
    await screen.findByText('The system is currently available.');
    expect(useGetOrthancSystemQuery).toHaveBeenCalledWith(undefined, { skip: false });
    expect(screen.getByText('System administration details')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy start command', hidden: true })).toHaveLength(3);
});

it('keeps administration details hidden from authenticated clinical staff', async () => {
    renderHealth({ role: 'Radiologist', authenticated: true });
    await screen.findByText('The system is currently available.');
    expect(useGetOrthancSystemQuery).toHaveBeenCalledWith(undefined, { skip: true });
    expect(screen.queryByText('System administration details')).not.toBeInTheDocument();
});
