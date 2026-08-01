/* eslint-disable no-undef */
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/authSlice';
import i18n from '../../i18n';
import { useGetDashboardStatsQuery } from '../../store/api';
import DashboardHome from '../DashboardHome';

vi.mock('../../store/api', () => ({
    useGetDashboardStatsQuery: vi.fn(),
}));

vi.mock('recharts', () => {
    const Chart = ({ children }) => <div>{children}</div>;
    return {
        Area: Chart,
        AreaChart: Chart,
        Bar: Chart,
        CartesianGrid: Chart,
        Cell: Chart,
        ComposedChart: Chart,
        Line: Chart,
        Pie: Chart,
        PieChart: Chart,
        ResponsiveContainer: Chart,
        Tooltip: Chart,
        XAxis: Chart,
        YAxis: Chart,
    };
});

const renderDashboard = (role, stats) => {
    const store = configureStore({
        reducer: { auth: authReducer },
        preloadedState: {
            auth: {
                user: { user_id: 'user-1', name: 'Mona Ali', role, permissions: [] },
                token: 'test-token',
                isAuthenticated: true,
            },
        },
    });

    useGetDashboardStatsQuery.mockReturnValue({
        data: { timestamp: '2026-06-28T08:00:00.000Z', recentActivity: [], ...stats },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
    });

    render(
        <Provider store={store}>
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <DashboardHome />
            </MemoryRouter>
        </Provider>
    );
};

describe('DashboardHome', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        vi.clearAllMocks();
    });

    it('renders factual executive metrics and honest chart empty states', () => {
        renderDashboard('Admin', {
            totalScans: 12,
            scansChange: '+20%',
            revenueAmount: 12500,
            revenueChange: '+8%',
            openWork: 4,
            scansToday: 3,
            activeStaff: 9,
            staffOnLeave: 1,
            scanVolumeData: [],
            modalityData: [],
        });

        expect(screen.getByRole('heading', { name: 'Executive Operations Dashboard' })).toBeInTheDocument();
        expect(screen.getByText(/12,500/)).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(screen.getAllByText('No operational data yet').length).toBeGreaterThan(0);
        expect(screen.queryByText('99.2%')).not.toBeInTheDocument();
    });

    it('renders the executive dashboard for developers', () => {
        renderDashboard('Developer', {
            totalScans: 12,
            scansChange: '+20%',
            revenueAmount: 12500,
            revenueChange: '+8%',
            openWork: 4,
            scansToday: 3,
            activeStaff: 9,
            staffOnLeave: 1,
            scanVolumeData: [],
            modalityData: [],
        });

        expect(screen.getByRole('heading', { name: 'Executive Operations Dashboard' })).toBeInTheDocument();
        expect(screen.getByText('System Developer')).toBeInTheDocument();
    });

    it('routes reception users to the patient-flow command center', () => {
        renderDashboard('Receptionist', {
            todayCheckIns: 7,
            appointments: 10,
            appointmentsPending: 2,
            waitingRoom: 3,
            averageWaitMinutes: 14,
            completed: 5,
            patientFlowData: [],
        });

        expect(screen.getByRole('heading', { name: 'Front Desk Command Center' })).toBeInTheDocument();
        expect(screen.getByText('Average wait 14 min')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /register patient/i })).toHaveLength(2);
    });

    it('refreshes live data on demand', () => {
        renderDashboard('Admin', { scanVolumeData: [], modalityData: [] });
        const refetch = useGetDashboardStatsQuery.mock.results[0].value.refetch;

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(refetch).toHaveBeenCalledOnce();
    });

    it('shows measured clinical turnaround instead of a fabricated quality score', () => {
        renderDashboard('Radiologist', {
            pendingReports: 6,
            urgentCases: 2,
            completedToday: 4,
            completedTodayChange: '+33%',
            thisWeek: 18,
            weekChange: '+12%',
            averageTurnaroundHours: 2.5,
            oldestPendingHours: 27,
            modalityDistribution: [],
        });

        expect(screen.getByRole('heading', { name: 'Diagnostic Operations Workspace' })).toBeInTheDocument();
        expect(screen.getByText('2.5 hr')).toBeInTheDocument();
        expect(screen.getByText('Aged reports require review')).toBeInTheDocument();
        expect(screen.queryByText('98%')).not.toBeInTheDocument();
    });

    it('uses scan-cycle language for technicians', () => {
        renderDashboard('Technician', {
            cycleMetric: 'scan',
            pendingReports: 3,
            urgentCases: 1,
            completedToday: 2,
            thisWeek: 5,
            averageTurnaroundHours: 0.5,
            oldestPendingHours: 26,
            modalityDistribution: [],
        });

        expect(screen.getByText('Assigned scans open')).toBeInTheDocument();
        expect(screen.getByText('Average scan duration')).toBeInTheDocument();
        expect(screen.getByText('30 min')).toBeInTheDocument();
        expect(screen.queryByText('Average report TAT')).not.toBeInTheDocument();
    });
});
