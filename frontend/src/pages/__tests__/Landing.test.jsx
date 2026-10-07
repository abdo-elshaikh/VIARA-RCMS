/* eslint-disable no-undef */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { configureStore } from '@reduxjs/toolkit';
import landingEn from '../../i18n/locales/en/landing.json';
import landingAr from '../../i18n/locales/ar/landing.json';
import commonEn from '../../i18n/locales/en/common.json';
import commonAr from '../../i18n/locales/ar/common.json';
import authEn from '../../i18n/locales/en/auth.json';
import authAr from '../../i18n/locales/ar/auth.json';
import preferencesReducer, { DEFAULT_PREFERENCES } from '../../store/preferencesSlice';
import Landing from '../Landing';
vi.mock('../../components/public/PublicConnectionNotice', () => ({ default: () => null }));

vi.mock('../../store/api', () => ({
    useGetPublicLandingOverviewQuery: () => ({
        data: {
            metrics: {
                studiesToday: 148,
                pendingReports: 27,
                activeModalities: 8,
                completionRate: 96,
            },
            services: { studiesThisWeek: 421 },
            workload: { pressureScore: 34 },
            workflow: {
                registrationMinutes: 2,
                imagingMinutes: 12,
                reportingMinutes: 5,
                deliveryMinutes: 1,
            },
            pipeline: [
                { code: 'waiting', count: 5 },
                { code: 'imaging', count: 12 },
                { code: 'reporting', count: 27 },
                { code: 'delivered', count: 148 },
            ],
        },
        isLoading: false,
        isFetching: false,
    }),
}));

let landingI18n;

const renderLanding = (preferences = DEFAULT_PREFERENCES) => {
    const store = configureStore({
        reducer: { preferences: preferencesReducer },
        preloadedState: { preferences: { ...preferences } },
    });
    const result = render(
        <Provider store={store}>
            <I18nextProvider i18n={landingI18n}>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <Landing />
                </BrowserRouter>
            </I18nextProvider>
        </Provider>,
    );
    return { ...result, store };
};

describe('VIARA landing preferences', () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        landingI18n = createInstance();
        await landingI18n.init({
            lng: 'en',
            fallbackLng: 'en',
            ns: ['landing', 'common', 'auth'],
            defaultNS: 'landing',
            resources: {
                en: { landing: landingEn, common: commonEn, auth: authEn },
                ar: { landing: landingAr, common: commonAr, auth: authAr },
            },
            interpolation: { escapeValue: false },
        });
        landingI18n.on('languageChanged', (language) => {
            const code = String(language || 'en').split('-')[0];
            document.documentElement.setAttribute('lang', code);
            document.documentElement.setAttribute('dir', code === 'ar' ? 'rtl' : 'ltr');
        });
        document.documentElement.setAttribute('lang', 'en');
        document.documentElement.setAttribute('dir', 'ltr');
    });

    afterEach(() => {
        landingI18n?.off('languageChanged');
        vi.unstubAllGlobals();
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('lang', 'en');
        document.documentElement.setAttribute('dir', 'ltr');
    });

    it('renders the hero and the primary marketing sections', () => {
        renderLanding();

        expect(screen.getByRole('heading', { level: 1, name: /Clearer Vision\. Smoother Management\./i })).toBeInTheDocument();

        for (const label of ['Overview', 'Supported modalities', 'Features', 'Workflow', 'Get started']) {
            expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
        }
    });

    it('anchors the header navigation to the feature and workflow sections', () => {
        renderLanding();

        const nav = screen.getByRole('navigation', { name: 'Navigation' });
        expect(within(nav).getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#vlp-features');
        expect(within(nav).getByRole('link', { name: 'Workflow' })).toHaveAttribute('href', '#vlp-workflow');

        // The anchors the header links to must actually exist on the page.
        expect(document.getElementById('vlp-features')).not.toBeNull();
        expect(document.getElementById('vlp-workflow')).not.toBeNull();
    });

    it('persists theme changes through the global preferences store', () => {
        const { store } = renderLanding();

        fireEvent.click(screen.getByRole('button', { name: /Dark mode/i }));

        expect(store.getState().preferences.theme).toBe('dark');
        expect(JSON.parse(localStorage.getItem('VIARA_preferences')).theme).toBe('dark');
        expect(localStorage.getItem('theme')).toBeNull();
    });

    it('opens navigation containing both portals and closes it on Escape from the trigger', () => {
        renderLanding();
        const menu = screen.getByRole('button', { name: 'Open menu' });
        fireEvent.click(menu);
        expect(menu).toHaveAttribute('aria-expanded', 'true');
        const nav = screen.getByRole('navigation', { name: 'Navigation' });
        expect(within(nav).getByRole('link', { name: 'Results Portal' })).toHaveAttribute('href', '/portal');
        expect(within(nav).getByRole('link', { name: 'Doctor Portal' })).toHaveAttribute('href', '/doctor-portal');
        fireEvent.keyDown(menu, { key: 'Escape' });
        expect(menu).toHaveAttribute('aria-expanded', 'false');
        expect(menu).toHaveFocus();
    });

    it('applies the in-app reduced-motion preference to the page', () => {
        const preferences = { ...DEFAULT_PREFERENCES, motion: 'reduced' };
        const { container } = renderLanding(preferences);
        expect(container.querySelector('.vlp')).toHaveClass('vlp--reduce-motion');
    });

    it('uses current relative dates for clearly marked demo worklist rows', () => {
        renderLanding();
        const worklist = screen.getByText('Demo data').closest('.vlp__worklist-card');
        const displayedDates = within(worklist).getAllByText(/^\d{4}\/\d{2}\/\d{2} - \d{2}:\d{2}$/);
        const currentYear = String(new Date().getFullYear());

        expect(displayedDates).toHaveLength(3);
        expect(displayedDates.every((date) => date.textContent.startsWith(currentYear))).toBe(true);
    });

    it('synchronizes language, direction and persisted system preferences', async () => {
        const { store } = renderLanding();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Switch to Arabic/i }));
        });

        await waitFor(() => expect(landingI18n.resolvedLanguage).toBe('ar'));

        expect(store.getState().preferences.language).toBe('ar');
        expect(landingI18n.resolvedLanguage).toBe('ar');
        expect(document.documentElement).toHaveAttribute('dir', 'rtl');
        expect(JSON.parse(localStorage.getItem('VIARA_preferences')).language).toBe('ar');
        expect(localStorage.getItem('VIARA_lang')).toBe('ar');
        expect(localStorage.getItem('landing-language')).toBeNull();
    });
});
