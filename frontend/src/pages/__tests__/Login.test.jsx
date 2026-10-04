/* eslint-disable no-undef */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../store/api', () => ({
    useLoginMutation: () => [vi.fn(), { isLoading: false }],
    usePasskeyAuthenticationOptionsMutation: () => [vi.fn(), { isLoading: false }],
    usePasskeyAuthenticationVerifyMutation: () => [vi.fn(), { isLoading: false }],
    useGetPublicCenterSettingsQuery: () => ({
        data: {
            support_email: 'support@viara.com',
            hotline: '19999',
        },
        isLoading: false,
    }),
}));

let loginI18n;

const renderLogin = (lng = 'ar') => {
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
            preferences: { ...DEFAULT_PREFERENCES, language: lng },
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
    it('renders the login form with email, password, and submit controls', () => {
        renderLogin('ar');
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        expect(screen.getByLabelText(/البريد الإلكتروني/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^كلمة المرور$/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^تسجيل الدخول$/i })).toBeInTheDocument();
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

    it('renders clinical telemetry indicators in showcase panel', () => {
        renderLogin('ar');
        expect(screen.getByText(/محطة العمل التشخيصية/i)).toBeInTheDocument();
        expect(screen.getByText(/ربط أنظمة PACS/i)).toBeInTheDocument();
    });
});
