/* eslint-disable no-undef */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { configureStore } from '@reduxjs/toolkit';
import authEn from '../../i18n/locales/en/auth.json';
import authAr from '../../i18n/locales/ar/auth.json';
import commonEn from '../../i18n/locales/en/common.json';
import commonAr from '../../i18n/locales/ar/common.json';
import preferencesReducer, { DEFAULT_PREFERENCES } from '../../store/preferencesSlice';
import authReducer from '../../store/authSlice';
import Login from '../Login';

const mutations = vi.hoisted(() => ({ reset: vi.fn(), login: vi.fn() }));
vi.mock('../../components/public/PublicConnectionNotice', () => ({ default: () => null }));

vi.mock('../../store/api', () => ({
    useLoginMutation: () => [mutations.login, { isLoading: false }],
    usePasskeyAuthenticationOptionsMutation: () => [vi.fn(), { isLoading: false }],
    usePasskeyAuthenticationVerifyMutation: () => [vi.fn(), { isLoading: false }],
    useGetPublicCenterSettingsQuery: () => ({
        data: {
            support_email: 'support@viara.com',
            hotline: '19999',
        },
        isLoading: false,
    }),
    useForgotPasswordMutation: () => [vi.fn(), { isLoading: false }],
    useResetPasswordMutation: () => [mutations.reset, { isLoading: false }],
}));

let loginI18n;

const renderLogin = (lng = 'ar', preferences = DEFAULT_PREFERENCES) => {
    loginI18n = createInstance({
        lng,
        fallbackLng: 'ar',
        interpolation: { escapeValue: false },
        resources: {
            en: { auth: authEn, common: commonEn },
            ar: { auth: authAr, common: commonAr },
        },
    });
    loginI18n.init();

    const store = configureStore({
        reducer: {
            preferences: preferencesReducer,
            auth: authReducer,
        },
        preloadedState: {
            preferences: { ...preferences, language: lng },
            auth: { user: null, token: null, isAuthenticated: false },
        },
    });

    return render(
        <Provider store={store}>
            <I18nextProvider i18n={loginI18n}>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <Login />
                </BrowserRouter>
            </I18nextProvider>
        </Provider>
    );
};

describe('VIARA Login Page', () => {
    beforeAll(() => {
        HTMLDialogElement.prototype.showModal = function () { this.open = true; };
        HTMLDialogElement.prototype.close = function () { this.open = false; };
    });
    beforeEach(() => {
        window.history.replaceState({}, '', '/login');
        mutations.reset.mockReset();
        mutations.login.mockReset();
        mutations.reset.mockReturnValue({ unwrap: () => Promise.resolve({ success: true }) });
    });
    afterEach(() => window.history.replaceState({}, '', '/'));
    it('renders the login form with email, password, and submit controls', () => {
        renderLogin('ar');
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        expect(screen.getByLabelText(/البريد الإلكتروني/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^كلمة المرور$/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^تسجيل الدخول$/i })).toBeInTheDocument();
    });

    it('fills a selected development account without submitting the login form', async () => {
        renderLogin('en');
        const panel = screen.getByRole('region', { name: 'Demo Accounts' });
        const picker = within(panel).getByRole('combobox', { name: 'Demo account' });
        expect(within(picker).getAllByRole('option')).toHaveLength(9);
        fireEvent.change(picker, { target: { value: 'Admin' } });
        fireEvent.click(within(panel).getByRole('button', { name: 'Fill form' }));
        await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveValue('admin@viara.com'));
        expect(screen.getByLabelText('Password').value).not.toBe('');
        expect(mutations.login).not.toHaveBeenCalled();
    });

    it('hides the development account picker outside development mode', () => {
        vi.stubEnv('DEV', false);
        try {
            renderLogin('en');
            expect(screen.queryByRole('region', { name: 'Demo Accounts' })).not.toBeInTheDocument();
            expect(screen.queryByRole('combobox', { name: 'Demo account' })).not.toBeInTheDocument();
            expect(screen.getByRole('main')).not.toHaveClass('vlogin--developer');
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it('applies the in-app reduced-motion preference to the page', () => {
        renderLogin('en', { ...DEFAULT_PREFERENCES, motion: 'reduced' });
        expect(screen.getByRole('main')).toHaveClass('vlogin--reduce-motion');
    });

    it('displays client validation errors when submitting empty form', async () => {
        renderLogin('ar');
        const submitBtn = screen.getByRole('button', { name: /^تسجيل الدخول$/i });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(screen.getByText(/أدخل بريدك الإلكتروني/i)).toBeInTheDocument();
        });
    });

    it('toggles password visibility when clicking eye button', () => {
        renderLogin('ar');
        const passwordInput = screen.getByPlaceholderText('••••••••');
        expect(passwordInput).toHaveAttribute('type', 'password');

        const toggleBtn = screen.getByRole('button', { name: /إظهار كلمة المرور/i });
        fireEvent.click(toggleBtn);

        expect(passwordInput).toHaveAttribute('type', 'text');
    });

    it('does not show patient or doctor portal links on the staff login page', () => {
        renderLogin('ar');
        expect(screen.queryByRole('link', { name: 'بوابة المرضى' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'بوابة الأطباء المحوّلين' })).not.toBeInTheDocument();
    });

    it('completes password reset without blocking sign-in or leaving the token in the URL', async () => {
        window.history.replaceState({}, '', '/login?resetToken=test-token&email=staff%40example.test');
        renderLogin('en');
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123!' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'NewPassword123!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
        await waitFor(() => expect(window.location.search).toBe(''));
        expect(mutations.reset).toHaveBeenCalledWith({ token: 'test-token', email: 'staff@example.test', newPassword: 'NewPassword123!' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Password updated successfully. You can now sign in.')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Continue to sign in' }));
        await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus());
        expect(screen.getByLabelText('Password')).toHaveValue('');
    });

    it('focuses recovery input, traps keyboard navigation, and restores focus on Escape', async () => {
        renderLogin('en');
        const trigger = screen.getByRole('button', { name: 'Forgot password?' });
        trigger.focus();
        fireEvent.click(trigger);
        const dialog = screen.getByRole('dialog', { name: 'Reset your password' });
        await waitFor(() => expect(within(dialog).getByLabelText('Email address')).toHaveFocus());
        expect(document.body.style.overflow).toBe('hidden');
        within(dialog).getByRole('button', { name: 'Close' }).focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(within(dialog).getByRole('button', { name: 'Back to sign in' })).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('keeps an expired reset link error readable and allows returning to sign-in', async () => {
        mutations.reset.mockReturnValue({ unwrap: () => Promise.reject({ status: 400, data: { message: 'Reset link has expired.' } }) });
        window.history.replaceState({}, '', '/login?resetToken=expired-token&email=staff%40example.test');
        renderLogin('en');
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123!' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'NewPassword123!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Reset link has expired.');
        expect(screen.getByLabelText('New password')).toHaveValue('NewPassword123!');
        fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
        await waitFor(() => expect(window.location.search).toBe(''));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Email address')).toBeVisible();
    });

    it('explains password requirements before submission and prevents weak passwords', () => {
        window.history.replaceState({}, '', '/login?resetToken=test-token&email=staff%40example.test');
        renderLogin('en');
        expect(screen.getByLabelText('New password')).toHaveAttribute('aria-describedby', 'reset-password-rules');
        expect(screen.getByText(/At least 8 characters, including/)).toBeVisible();
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters');
        expect(mutations.reset).not.toHaveBeenCalled();
    });

    it('displays friendly connection notice and suppresses raw HTML on gateway 502/503 errors', async () => {
        mutations.login.mockReturnValue({
            unwrap: () => Promise.reject({
                status: 502,
                data: '<!DOCTYPE html> <html lang="ar"> <head><title>صيانة</title></head> <body>Maintenance</body> </html>',
            }),
        });
        renderLogin('en');
        fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@viara.com' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ViaraAdmin@2026' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('The system is currently unavailable. Try again or contact your center support team.');
        expect(alert.textContent).not.toContain('<!DOCTYPE');
        expect(alert.textContent).not.toContain('<html');
    });
});
