import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AnalyticsDashboard from '../AnalyticsDashboard';

const mocks = vi.hoisted(() => ({
    volume: [{ label: '2026-08-20', value: 10 }, { label: '2026-08-21', value: 15 }],
    revenue: [{ label: '2026-08-20', value: 5000 }, { label: '2026-08-21', value: 7500 }],
    performance: {
        averageTurnaroundTimeHours: '2.50',
        averageDraftTimeHours: '1.20',
        averageSignTimeHours: '1.30',
        averageScanMinutes: '18.0',
        averageWaitTimeMinutes: '12.50',
        cancellationRatePercentage: '4.50',
        totalAppointments: 100,
        cancelledAppointments: 5,
        statSlaCompliancePct: '95.0',
        routineSlaCompliancePct: '98.0',
        contrastCount: 25,
        contrastRatioPct: '25.0',
        contrastSafetyCompliancePct: '100.0'
    },
    peakHours: {
        peakHour: '11:00',
        peakWindowAr: '10:00 ص - 04:00 م',
        peakWindowEn: '10:00 AM - 04:00 PM',
        hourlyData: [
            { hour: '08:00', studies: 10, capacity: 50, avgStudiesPerDay: 2, avgDurationMinutes: 20 },
            { hour: '11:00', studies: 35, capacity: 90, avgStudiesPerDay: 7, avgDurationMinutes: 25 }
        ]
    },
    equipment: [
        {
            modality_id: 'm1',
            modality_name: 'MRI 1.5T',
            modality_type: 'MR',
            study_count: 50,
            busy_hours: 25.0,
            avg_duration_minutes: 25,
            utilization_pct: 75.0,
            total_revenue: 75000,
            revenue_per_study: 1500
        }
    ],
    topProcedures: [
        {
            exam_type_id: 'et1',
            exam_name: 'Brain MRI with Contrast',
            exam_code: 'MR-BR-01',
            modality_name: 'MRI',
            study_count: 30,
            avg_duration_minutes: 25,
            contrast_count: 30,
            total_revenue: 45000,
            volume_share_pct: 30.0,
            revenue_per_study: 1500
        }
    ],
    modalities: [
        { modality_id: 'm1', name: 'MRI 1.5T' },
        { modality_id: 'm2', name: 'CT 128 Slice' }
    ]
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => options?.defaultValue || key,
        i18n: { language: 'en', dir: () => 'ltr' }
    })
}));

vi.mock('recharts', () => {
    const Chart = ({ children }) => (
        <div>{React.Children.toArray(children).filter((child) => typeof child.type !== 'string')}</div>
    );
    const Primitive = () => null;
    return {
        Area: Primitive,
        AreaChart: Chart,
        Bar: Primitive,
        BarChart: Chart,
        CartesianGrid: Primitive,
        Cell: Primitive,
        ComposedChart: Chart,
        Line: Primitive,
        LineChart: Chart,
        Pie: Primitive,
        PieChart: Chart,
        ResponsiveContainer: Chart,
        Tooltip: Primitive,
        XAxis: Primitive,
        YAxis: Primitive
    };
});

vi.mock('../../store/api', () => ({
    useGetPerformanceAnalyticsQuery: () => ({ data: mocks.performance, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useGetRevenueAnalyticsQuery: () => ({ data: mocks.revenue, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useGetVolumeAnalyticsQuery: () => ({ data: mocks.volume, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useGetPeakHoursAnalyticsQuery: () => ({ data: mocks.peakHours, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useGetEquipmentUtilizationQuery: () => ({ data: mocks.equipment, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useGetTopProceduresAnalyticsQuery: () => ({ data: mocks.topProcedures, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
    useGetReferralAnalyticsQuery: () => ({ data: { sources: [{ label: 'Walk-in', value: 50 }], topDoctors: [{ doctorName: 'Dr. John', clinicName: 'Cairo Clinic', totalExams: 25, totalRevenue: 50000 }] }, isLoading: false, isFetching: false, isError: false }),
    useGetMachinesQuery: () => ({ data: mocks.modalities, isLoading: false, isFetching: false, isError: false })
}));

vi.mock('../../utils/analyticsReportExport', () => ({
    exportAnalyticsReport: vi.fn().mockResolvedValue(true)
}));

const renderWithRouter = (ui) => {
    return render(
        <MemoryRouter initialEntries={['/analytics']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
                <Route path="*" element={ui} />
            </Routes>
        </MemoryRouter>
    );
};

describe('AnalyticsDashboard Component', () => {
    it('renders page header and tabs correctly', () => {
        renderWithRouter(<AnalyticsDashboard />);
        expect(screen.getByText('analytics.title')).toBeInTheDocument();
        expect(screen.getByText('Executive Overview')).toBeInTheDocument();
        expect(screen.getByText('Clinical & TAT Performance')).toBeInTheDocument();
        expect(screen.getByText('Equipment & Utilization')).toBeInTheDocument();
        expect(screen.getByText('Peak Hours & Capacity')).toBeInTheDocument();
        expect(screen.getByText('Top Procedures & Quality')).toBeInTheDocument();
        expect(screen.getByText('Financial & Payers')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(6);
        expect(screen.getByRole('tab', { name: 'Executive Overview' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getAllByText('analytics.kpis.turnaround')).toHaveLength(1);
        expect(screen.getByText('Operational run-rate projection')).toBeInTheDocument();
        expect(screen.queryByText('94% Confidence')).not.toBeInTheDocument();
    });

    it('switches to Clinical tab and displays TAT waterfall and SLA gauges', () => {
        renderWithRouter(<AnalyticsDashboard />);
        const clinicalTab = screen.getByText('Clinical & TAT Performance');
        fireEvent.click(clinicalTab);

        expect(screen.getByText('Turnaround Time (TAT) Waterfall Breakdown')).toBeInTheDocument();
        expect(screen.getByText('1. Reception Wait')).toBeInTheDocument();
        expect(screen.getByText('2. Active Scan')).toBeInTheDocument();
        expect(screen.getByText('3. Report Drafting')).toBeInTheDocument();
        expect(screen.getByText('4. Final Review & Sign-off')).toBeInTheDocument();
        expect(screen.getByText('STAT / Urgent SLA')).toBeInTheDocument();
        expect(screen.getByText('Routine SLA')).toBeInTheDocument();
    });

    it('switches to Equipment tab and displays utilization table', () => {
        renderWithRouter(<AnalyticsDashboard />);
        const equipTab = screen.getByText('Equipment & Utilization');
        fireEvent.click(equipTab);

        expect(screen.getByText('Machine & Equipment Utilization Matrix')).toBeInTheDocument();
        expect(screen.getAllByText('MRI 1.5T').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('switches to Peak Hours tab and displays hourly composed chart section', () => {
        renderWithRouter(<AnalyticsDashboard />);
        const peakTab = screen.getByText('Peak Hours & Capacity');
        fireEvent.click(peakTab);

        expect(screen.getByText(/Hourly Peak Demand & Utilization Distribution/i)).toBeInTheDocument();
        expect(screen.getByText(/Peak: 11:00/i)).toBeInTheDocument();
    });

    it('switches to Top Procedures tab and displays procedure protocols', () => {
        renderWithRouter(<AnalyticsDashboard />);
        const procTab = screen.getByText('Top Procedures & Quality');
        fireEvent.click(procTab);

        expect(screen.getByText('Top 10 Imaging Procedures')).toBeInTheDocument();
        expect(screen.getByText('Brain MRI with Contrast')).toBeInTheDocument();
        expect(screen.getByText('MR-BR-01')).toBeInTheDocument();
    });

    it('opens export dropdown and triggers multi-format export', async () => {
        const { exportAnalyticsReport } = await import('../../utils/analyticsReportExport');
        renderWithRouter(<AnalyticsDashboard />);

        const exportBtn = screen.getByText('Export Report');
        fireEvent.click(exportBtn);

        expect(screen.getByText('Select Export Format')).toBeInTheDocument();
        expect(screen.getByText('Excel Workbook (.xlsx)')).toBeInTheDocument();
        expect(screen.getByText('Executive Word Doc (.docx)')).toBeInTheDocument();
        expect(screen.getByText('CSV Dataset (.csv)')).toBeInTheDocument();

        const excelOption = screen.getByText('Excel Workbook (.xlsx)');
        fireEvent.click(excelOption);

        expect(exportAnalyticsReport).toHaveBeenCalledWith(expect.any(Object), 'excel');
    });
});
