const express = require('express');
const request = require('supertest');

jest.mock('../src/middleware/authMiddleware', () => ({
    authenticateToken: (req, res, next) => {
        req.user = { user_id: '00000000-0000-4000-8000-000000000001', role: 'Receptionist' };
        next();
    },
    authorizeRole: () => (req, res, next) => next()
}));

jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn().mockResolvedValue({ scheduled: 0 }),
    triggerEventForRole: jest.fn().mockResolvedValue({ recipients: 0, scheduled: 0 })
}));

const hrRoutes = require('../src/routes/hrRoutes');

describe('Attendance Permission Route Aliases', () => {
    let app;
    let mockPool;
    let mockClient;

    beforeEach(() => {
        mockClient = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
                    return { rows: [] };
                }
                if (text.includes('SELECT full_name, role FROM users')) {
                    return { rows: [{ full_name: 'Test Receptionist', role: 'Receptionist' }] };
                }
                if (text.includes('INSERT INTO attendance_permissions')) {
                    return {
                        rows: [{
                            permission_id: '11111111-1111-4111-8111-111111111111',
                            permission_type: 'EarlyDeparture',
                            status: 'Pending'
                        }]
                    };
                }
                if (text.includes('FROM attendance_permissions')) {
                    return {
                        rows: [{
                            permission_id: '11111111-1111-4111-8111-111111111111',
                            permission_type: 'EarlyDeparture',
                            status: 'Pending'
                        }]
                    };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };

        mockPool = {
            query: jest.fn().mockResolvedValue({
                rows: [{
                    permission_id: '11111111-1111-4111-8111-111111111111',
                    permission_type: 'EarlyDeparture',
                    status: 'Pending'
                }]
            }),
            connect: jest.fn().mockResolvedValue(mockClient)
        };

        app = express();
        app.use(express.json());
        app.use('/api', hrRoutes(mockPool, {}));
    });

    test('POST /api/hr/attendance-permissions successfully reaches the handler', async () => {
        const res = await request(app)
            .post('/api/hr/attendance-permissions')
            .send({
                permissionType: 'EarlyDeparture',
                effectiveDate: '2026-09-26',
                minutesGranted: 60,
                reason: 'Family emergency reason'
            });

        expect(res.status).toBe(201);
        expect(res.body.permission_id).toBe('11111111-1111-4111-8111-111111111111');
    });

    test('POST /api/hr/attendance/permissions also reaches the handler successfully', async () => {
        const res = await request(app)
            .post('/api/hr/attendance/permissions')
            .send({
                permissionType: 'EarlyDeparture',
                effectiveDate: '2026-09-26',
                minutesGranted: 60,
                reason: 'Family emergency reason'
            });

        expect(res.status).toBe(201);
        expect(res.body.permission_id).toBe('11111111-1111-4111-8111-111111111111');
    });

    test('GET /api/hr/attendance-permissions and GET /api/hr/attendance/permissions both work', async () => {
        const res1 = await request(app).get('/api/hr/attendance-permissions');
        expect(res1.status).toBe(200);

        const res2 = await request(app).get('/api/hr/attendance/permissions');
        expect(res2.status).toBe(200);
    });
});
