/* eslint-disable no-undef */
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/authSlice';
import i18n from '../../i18n';
import { useGetDashboardStatsQuery } from '../../store/api';
import DashboardHome from '../DashboardHome';

const DASHBOARD_PERMISSIONS = [
    'CREATE_PATIENTS',
    'VIEW_APPOINTMENTS',
    'VIEW_PATIENTS',
    'VIEW_REPORTS',
    'VIEW_EXAMS',
    'WRITE_REPORTS',
    'PERFORM_EXAMS',
    'MANAGE_QUEUE',
    'VIEW_ANALYTICS',
    'VIEW_FINANCIALS',
    'VIEW_STAFF',
    'MANAGE_STAFF',
    'VIEW_INVENTORY',
    'CONSUME_INVENTORY',
    'VIEW_INVOICES',
    'PROCESS_PAYMENTS',
    'VIEW_INSURANCE',
    'MANAGE_INSURANCE_APPROVALS',
    'VIEW_USERS',
];

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

const renderDashboard = (role, stats, permissions = DASHBOARD_PERMISSIONS) => {
    const store = configureStore({
        reducer: { auth: authReducer },
        preloadedState: {
            auth: {
                user: { user_id: 'user-1', name: 'Mona Ali', role, permissions },
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
        expect(screen.getAllByText(/12,500/).length).toBeGreaterThan(0);
        expect(screen.getAllByText('4').length).toBeGreaterThan(0);
        expect(screen.getByRole('region', { name: 'Operational priorities' })).toBeInTheDocument();
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

    it('provides the executive charts as described disclosure tables', () => {
        renderDashboard('Admin', {
            scanVolumeData: [{ date: '2026-06-22', scans: 12, revenue: 12500 }],
            modalityData: [{ name: 'MRI', value: 7 }],
        });

        const chart = screen.getByRole('img', { name: 'Weekly throughput and collections' });
        expect(chart).toHaveAttribute('aria-describedby');
        expect(document.getElementById(chart.getAttribute('aria-describedby'))).toHaveTextContent('1 data points');
        expect(screen.getAllByText('View chart data')).toHaveLength(2);
        expect(screen.getByRole('table', { name: 'Weekly throughput and collections data' })).toHaveTextContent('12');
        expect(screen.getByRole('table', { name: 'Modality mix data' })).toHaveTextContent('MRI');
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
        expect(screen.getAllByText('Average wait 14 min').length).toBeGreaterThan(0);
        expect(screen.getAllByRole('button', { name: /register patient/i })).toHaveLength(2);
    });

    it('renders cashier finance metrics without falling back to executive zeroes', () => {
        renderDashboard('Cashier', {
            collectedToday: 3200,
            collectedWeek: 11750,
            transactionsToday: 9,
            openInvoices: 4,
            outstandingAmount: 6800,
            pendingRefunds: 1,
            shiftOpen: true,
        });

        expect(screen.getByRole('heading', { name: 'Cashier Operations Dashboard' })).toBeInTheDocument();
        expect(screen.getByText('Cashier shift')).toBeInTheDocument();
        expect(screen.getAllByText(/3,200/).length).toBeGreaterThan(0);
        expect(screen.queryByText('Executive Operations Dashboard')).not.toBeInTheDocument();
    });

    it('renders an accounting-only dashboard without workforce metrics', () => {
        renderDashboard('Accountant', {
            collectedToday: 4200,
            collectedWeek: 18750,
            transactionsToday: 11,
            openInvoices: 6,
            outstandingAmount: 12200,
            pendingRefunds: 2,
        });

        expect(screen.getByRole('heading', { name: 'Accounting Dashboard' })).toBeInTheDocument();
        expect(screen.getByText('Outstanding receivables')).toBeInTheDocument();
        expect(screen.queryByText('Active staff')).not.toBeInTheDocument();
    });

    it('renders HR workforce metrics and hides patient search', () => {
        renderDashboard('HR', {
            activeStaff: 20,
            presentToday: 17,
            onLeaveToday: 2,
            pendingLeave: 1,
        });

        expect(screen.getByRole('heading', { name: 'Human Resources Dashboard' })).toBeInTheDocument();
        expect(screen.getAllByText('Pending leave requests').length).toBeGreaterThan(0);
        expect(screen.queryByRole('search')).not.toBeInTheDocument();
        expect(screen.queryByText('Collected this week')).not.toBeInTheDocument();
    });

    it('renders insurance aggregates instead of an unavailable dashboard', () => {
        renderDashboard('Insurance_Staff', {
            pendingApprovals: 3,
            openClaims: 7,
            rejectedClaims: 1,
            outstandingClaims: 25000,
            receivedWeek: 9000,
        });

        expect(screen.getByRole('heading', { name: 'Insurance Operations Dashboard' })).toBeInTheDocument();
        expect(screen.getAllByText('Outstanding claim value').length).toBeGreaterThan(0);
        expect(screen.queryByText('Dashboard data is unavailable')).not.toBeInTheDocument();
    });

    it('does not present fabricated scanner telemetry or fixed turnaround values', () => {
        renderDashboard('Admin', {
            scanVolumeData: [],
            modalityData: [],
            liveModalities: [],
            turnaroundStages: [],
        });

        expect(screen.queryByText('MRI 3.0T Skyra')).not.toBeInTheDocument();
        expect(screen.queryByText('Within reference targets')).not.toBeInTheDocument();
        expect(screen.getByText('No modality status is available from the system.')).toBeInTheDocument();
        expect(screen.getByText('No completed stage measurements are available for the current week.')).toBeInTheDocument();
    });

    it('refreshes live data on demand', () => {
        renderDashboard('Admin', { scanVolumeData: [], modalityData: [] });
        const refetch = useGetDashboardStatsQuery.mock.results[0].value.refetch;

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(refetch).toHaveBeenCalledOnce();
    });

    it('keeps dashboard metrics visible but hides action shortcuts without permissions', () => {
        renderDashboard('Receptionist', {
            todayCheckIns: 7,
            appointments: 10,
            appointmentsPending: 2,
            waitingRoom: 3,
            averageWaitMinutes: 14,
            completed: 5,
            patientFlowData: [],
        }, []);

        expect(screen.getByRole('heading', { name: 'Front Desk Command Center' })).toBeInTheDocument();
        expect(screen.getByText("Today's appointments")).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /register patient/i })).not.toBeInTheDocument();
        expect(screen.getByText('No approved shortcuts available')).toBeInTheDocument();
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
