const DashboardService = require('../src/services/dashboardService');

describe('Dashboard operational snapshot hardening (BUG-M03 & BUG-M04)', () => {
    test('getOperationalSnapshot query bounds exam age to 12 hours and filters outlier turnaround times', async () => {
        const queryCalls = [];
        const mockDb = {
            query: jest.fn(async (sql) => {
                queryCalls.push(sql);
                if (sql.includes('FROM modalities m')) {
                    return {
                        rows: [
                            {
                                id: 'mod-1',
                                name: 'CT-03 Siemens SOMATOM Edge',
                                type: 'CT',
                                equipment_status: 'Active',
                                workflow_status: 'ready',
                                started_at: null,
                                elapsed_minutes: null,
                                updated_at: new Date()
                            }
                        ]
                    };
                }
                if (sql.includes('checkin_minutes')) {
                    return {
                        rows: [
                            {
                                checkin_minutes: '12.5',
                                checkin_samples: 10,
                                prep_minutes: '14.0',
                                prep_samples: 8,
                                acquisition_minutes: '22.0',
                                acquisition_samples: 10,
                                reporting_minutes: '35.0',
                                reporting_samples: 6
                            }
                        ]
                    };
                }
                return { rows: [] };
            })
        };

        const service = new DashboardService(mockDb);
        const snapshot = await service.getOperationalSnapshot();

        // Verify modality query includes the 12-hour active limit and status filters
        const modalitySql = queryCalls.find(sql => sql.includes('FROM modalities m'));
        expect(modalitySql).toBeDefined();
        expect(modalitySql).toContain("e.status::text NOT IN ('Finalized', 'Cancelled')");
        expect(modalitySql).toContain("e.exam_started_at >= NOW() - INTERVAL '12 hours'");

        // Verify turnaround stages query bounds multi-day outliers
        const turnaroundSql = queryCalls.find(sql => sql.includes('checkin_minutes'));
        expect(turnaroundSql).toBeDefined();
        expect(turnaroundSql).toContain("(exam_started_at - arrived_at) <= INTERVAL '12 hours'");
        expect(turnaroundSql).toContain("(prep_completed_at - prep_started_at) <= INTERVAL '6 hours'");
        expect(turnaroundSql).toContain("(exam_completed_at - exam_started_at) <= INTERVAL '6 hours'");
        expect(turnaroundSql).toContain("(report_finalized_at - exam_completed_at) <= INTERVAL '24 hours'");

        // Verify snapshot returned expected values
        expect(snapshot.liveModalities).toHaveLength(1);
        expect(snapshot.liveModalities[0].status).toBe('ready');
        expect(snapshot.turnaroundStages).toHaveLength(4);
        expect(snapshot.turnaroundStages[0].key).toBe('checkin');
        expect(snapshot.turnaroundStages[0].averageMinutes).toBe(12.5);
    });
});
