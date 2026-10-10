/* eslint-disable no-undef */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import authReducer from '../../store/authSlice';
import preferencesReducer from '../../store/preferencesSlice';
import Login from '../../pages/Login';
import { api } from '../../store/api';
import { vi } from 'vitest';
vi.mock('../public/PublicConnectionNotice', () => ({ default: () => null }));

vi.mock('../../store/api', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useGetPublicCenterSettingsQuery: () => ({ data: undefined, isLoading: false, isFetching: false }),
    };
});

// Polyfill HTMLDialogElement for jsdom
beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
        this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function () {
        this.open = false;
    });
});

const store = configureStore({
    reducer: {
        auth: authReducer,
        preferences: preferencesReducer,
        [api.reducerPath]: api.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

let i18n;
beforeAll(async () => {
    i18n = createInstance();
    const [auth, common] = await Promise.all([
        import('../../i18n/locales/en/auth.json'),
        import('../../i18n/locales/en/common.json'),
    ]);
    await i18n.init({
        lng: 'en', fallbackLng: 'en', ns: ['auth', 'common'], defaultNS: 'auth',
        resources: { en: { auth: auth.default, common: common.default } },
        interpolation: { escapeValue: false },
    });
});

const renderLogin = () => render(
    <Provider store={store}>
        <I18nextProvider i18n={i18n}>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Login />
            </BrowserRouter>
        </I18nextProvider>
    </Provider>
);

describe('Login Component', () => {
    it('renders the login form with email, password, and sign in button', () => {
        renderLogin();
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(document.getElementById('staff-password')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    });

    it('opens demo accounts dialog and displays roles', async () => {
        renderLogin();
        const demoButtons = screen.getAllByRole('button', { name: /demo accounts/i });
        fireEvent.click(demoButtons[0]);

        expect(await screen.findByText(/Dr\. Alice Morgan/i)).toBeInTheDocument();
        expect(screen.getByText(/Mohamed Ali/i)).toBeInTheDocument();
        expect(screen.getByText(/Fatima Ahmed/i)).toBeInTheDocument();
    });

    it('fills credentials into form when clicking demo account action', async () => {
        renderLogin();
        const demoButtons = screen.getAllByRole('button', { name: /demo accounts/i });
        fireEvent.click(demoButtons[0]);

        const cards = await screen.findAllByRole('button', { name: /Dr\. Alice Morgan/i });
        fireEvent.click(cards[0]);

        expect(screen.getByLabelText(/email address/i)).toHaveValue('alice@viara.com');
        expect(document.getElementById('staff-password')).not.toHaveValue('');
    });

    it('shows validation errors when submitting empty form', async () => {
        renderLogin();
        fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: '' } });
        fireEvent.change(document.getElementById('staff-password'), { target: { value: '' } });
        const submitButton = screen.getByRole('button', { name: /^sign in$/i });
        fireEvent.click(submitButton);

        expect(await screen.findByText(/enter your email address/i)).toBeInTheDocument();
        expect(await screen.findByText(/enter your password/i)).toBeInTheDocument();
    });

    it('toggles password visibility when clicking eye button', () => {
        renderLogin();
        const passwordInput = document.getElementById('staff-password');
        expect(passwordInput).toHaveAttribute('type', 'password');

        const eyeButton = screen.getByRole('button', { name: /show password/i });
        fireEvent.click(eyeButton);
        expect(passwordInput).toHaveAttribute('type', 'text');

        const hideButton = screen.getByRole('button', { name: /hide password/i });
        fireEvent.click(hideButton);
        expect(passwordInput).toHaveAttribute('type', 'password');
    });
});
