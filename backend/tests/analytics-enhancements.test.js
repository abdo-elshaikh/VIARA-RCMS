const AnalyticsService = require('../src/services/analyticsService');

describe('AnalyticsService Enhancements', () => {
    it('calculates multi-stage TAT and SLA compliance in getPerformanceMetrics', async () => {
        const mockDb = {
            query: jest.fn()
                // 1. tatQuery
                .mockResolvedValueOnce({
                    rows: [{
                        avg_tat_hours: '3.50',
                        avg_draft_hours: '2.10',
                        avg_sign_hours: '1.40',
                        avg_scan_minutes: '18.5',
                        stat_count: '10',
                        stat_on_time_count: '9',
                        routine_count: '40',
                        routine_on_time_count: '38'
                    }]
                })
                // 2. cancelQuery
                .mockResolvedValueOnce({
                    rows: [{
                        total_appointments: '55',
                        cancelled_count: '5'
                    }]
                })
                // 3. waitAndSafetyQuery
                .mockResolvedValueOnce({
                    rows: [{
                        avg_wait_minutes: '14.20',
                        total_scans: '50',
                        contrast_count: '15',
                        contrast_safety_checked_count: '15'
                    }]
                })
        };

        const service = new AnalyticsService(mockDb);
        const result = await service.getPerformanceMetrics('2026-08-01', '2026-08-24');

        expect(result).toEqual({
            averageTurnaroundTimeHours: '3.50',
            averageDraftTimeHours: '2.10',
            averageSignTimeHours: '1.40',
            averageScanMinutes: '18.5',
            averageWaitTimeMinutes: '14.20',
            cancellationRatePercentage: '9.09',
            totalAppointments: 55,
            cancelledAppointments: 5,
            statSlaCompliancePct: '90.0',
            routineSlaCompliancePct: '95.0',
            contrastCount: 15,
            contrastRatioPct: '30.0',
            contrastSafetyCompliancePct: '100.0'
        });
    });

    it('returns peak hours distribution and detects peak window', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValueOnce({
                rows: [
                    { hour: '08:00', avg_studies: 2.1, total_studies: 21, avg_duration_minutes: 20, capacity_percentage: 52.5 },
                    { hour: '09:00', avg_studies: 3.5, total_studies: 35, avg_duration_minutes: 22, capacity_percentage: 87.5 },
                    { hour: '10:00', avg_studies: 4.2, total_studies: 42, avg_duration_minutes: 25, capacity_percentage: 95.0 },
                    { hour: '11:00', avg_studies: 4.5, total_studies: 45, avg_duration_minutes: 24, capacity_percentage: 100.0 }
                ]
            })
        };

        const service = new AnalyticsService(mockDb);
        const result = await service.getPeakHoursMetrics('2026-08-01', '2026-08-24');

        expect(result.peakHour).toBe('11:00');
        expect(result.hourlyData).toHaveLength(4);
        expect(result.hourlyData[0]).toEqual({
            hour: '08:00',
            studies: 21,
            avgStudiesPerDay: 2.1,
            capacity: 52.5,
            avgDurationMinutes: 20
        });
    });

    it('computes equipment utilization and revenue per machine', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValueOnce({
                rows: [
                    {
                        modality_id: 'm1',
                        modality_name: 'MRI 1.5T',
                        modality_type: 'MR',
                        study_count: 85,
                        busy_hours: 35.4,
                        avg_duration_minutes: 25,
                        utilization_pct: 73.8,
                        total_revenue: 125000,
                        revenue_per_study: 1471
                    }
                ]
            })
        };

        const service = new AnalyticsService(mockDb);
        const result = await service.getEquipmentUtilization('2026-08-01', '2026-08-24');

        expect(result).toHaveLength(1);
        expect(result[0].modality_name).toBe('MRI 1.5T');
        expect(result[0].utilization_pct).toBe(73.8);
        expect(result[0].revenue_per_study).toBe(1471);
    });

    it('returns top requested procedures with share of volume', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValueOnce({
                rows: [
                    {
                        exam_type_id: 'et1',
                        exam_name: 'Brain MRI with Contrast',
                        exam_code: 'MR-BR-01',
                        modality_name: 'MRI',
                        study_count: 45,
                        avg_duration_minutes: 30,
                        contrast_count: 45,
                        total_revenue: 67500,
                        volume_share_pct: 22.5,
                        revenue_per_study: 1500
                    }
                ]
            })
        };

        const service = new AnalyticsService(mockDb);
        const result = await service.getTopProcedures('2026-08-01', '2026-08-24', 10);

        expect(result).toHaveLength(1);
        expect(result[0].exam_name).toBe('Brain MRI with Contrast');
        expect(result[0].volume_share_pct).toBe(22.5);
    });
});
