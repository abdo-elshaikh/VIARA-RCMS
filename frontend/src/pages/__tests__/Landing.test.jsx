/* eslint-disable no-undef */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import i18n from '../../i18n';
import preferencesReducer from '../../store/preferencesSlice';
import Landing from '../Landing';

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

const renderLanding = () => {
    const store = configureStore({ reducer: { preferences: preferencesReducer } });
    const result = render(
        <Provider store={store}>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Landing />
            </BrowserRouter>
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
        await act(() => i18n.changeLanguage('en'));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.documentElement.classList.remove('dark');
    });

    it('renders live center metrics and the four command scenes', () => {
        renderLanding();
        const sceneNavigation = screen.getByRole('navigation', { name: /Command center scenes/i });

        expect(screen.getByRole('heading', { level: 1, name: /Run Every Radiology Workflow From One Connected Workspace/i })).toBeInTheDocument();
        expect(screen.getAllByText('148').length).toBeGreaterThan(0);
        expect(screen.getAllByText('27').length).toBeGreaterThan(0);
        expect(screen.getAllByText('8').length).toBeGreaterThan(0);
        expect(within(sceneNavigation).getByRole('button', { name: /Operations/i })).toBeInTheDocument();
        expect(within(sceneNavigation).getByRole('button', { name: /AI Copilot/i })).toBeInTheDocument();
        expect(within(sceneNavigation).getByRole('button', { name: /Clinical Flow/i })).toBeInTheDocument();
        expect(within(sceneNavigation).getByRole('button', { name: /Staff Gateway/i })).toBeInTheDocument();
    });

    it('switches scenes while keeping the numeric counter strip visible', () => {
        renderLanding();
        const sceneNavigation = screen.getByRole('navigation', { name: /Command center scenes/i });

        const intelligenceButton = within(sceneNavigation).getByRole('button', { name: /AI Copilot/i });
        fireEvent.click(intelligenceButton);

        expect(intelligenceButton).toHaveAttribute('aria-current', 'true');
        expect(screen.getAllByText('148').length).toBeGreaterThan(0);
        expect(screen.getAllByText('27').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: /Throughput Predictor/i })).not.toBeInTheDocument();
    });

    it('persists theme changes through the global preferences store', () => {
        const { store } = renderLanding();

        fireEvent.click(screen.getByRole('button', { name: /Dark mode/i }));

        expect(store.getState().preferences.theme).toBe('dark');
        expect(JSON.parse(localStorage.getItem('VIARA_preferences')).theme).toBe('dark');
        expect(localStorage.getItem('theme')).toBeNull();
    });

    it('synchronizes language, direction and persisted system preferences', async () => {
        const { store } = renderLanding();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Switch to Arabic/i }));
        });

        expect(store.getState().preferences.language).toBe('ar');
        expect(i18n.resolvedLanguage).toBe('ar');
        expect(document.documentElement).toHaveAttribute('dir', 'rtl');
        expect(JSON.parse(localStorage.getItem('VIARA_preferences')).language).toBe('ar');
        expect(localStorage.getItem('VIARA_lang')).toBe('ar');
        expect(localStorage.getItem('landing-language')).toBeNull();
    });
});
