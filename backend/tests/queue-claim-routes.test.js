const express = require('express');
const request = require('supertest');

jest.mock('../src/middleware/authMiddleware', () => ({
    authenticateToken: (req, res, next) => {
        req.user = req.user || { user_id: '00000000-0000-4000-8000-000000000001', role: 'Nurse' };
        next();
    },
    authorizeRole: (roles) => (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access Denied' });
        }
        next();
    }
}));

jest.mock('../src/middleware/rbacMiddleware', () => ({
    hasPermission: () => (req, res, next) => next(),
    hasAnyPermission: () => (req, res, next) => next()
}));

jest.mock('../src/middleware/auditRead', () => () => (req, res, next) => next());

jest.mock('../src/services/clinicalTaskAssignmentService', () => ({
    ROLE_CONFIG: {
        Nurse: { station: 'Nurse', stages: ['Prep Pending'] }
    },
    roleForStation: jest.fn(),
    assignmentFromRow: jest.fn(),
    markTaskStarted: jest.fn(),
    markTaskAvailable: jest.fn(),
    completeTask: jest.fn(),
    claimTask: jest.fn().mockResolvedValue({
        exam_id: 'a5d91fa7-ad96-4fbe-bb46-094eee00ff1f',
        task_role: 'Nurse',
        assignment_status: 'Assigned'
    }),
    assignTask: jest.fn().mockResolvedValue({
        exam_id: 'a5d91fa7-ad96-4fbe-bb46-094eee00ff1f',
        task_role: 'Nurse',
        assignment_status: 'Assigned'
    }),
    releaseTask: jest.fn().mockResolvedValue({
        exam_id: 'a5d91fa7-ad96-4fbe-bb46-094eee00ff1f',
        task_role: 'Nurse',
        assignment_status: 'Unassigned'
    })
}));

jest.mock('../src/services/realtimeService', () => ({
    broadcast: jest.fn(),
    emitToUser: jest.fn(),
    sendToRole: jest.fn(),
    sendToUser: jest.fn(),
    broadcastToStaff: jest.fn()
}));

const clinicalExamRoutes = require('../src/routes/clinicalExamRoutes');

describe('Queue Claim and Assignment Routes', () => {
    let app;
    let mockPool;

    beforeEach(() => {
        mockPool = {
            connect: jest.fn().mockResolvedValue({
                query: jest.fn().mockResolvedValue({ rows: [] }),
                release: jest.fn()
            }),
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        app = express();
        app.use(express.json());
        app.use('/api', clinicalExamRoutes(mockPool, {}));
    });

    test('POST /api/queue/:examId/claim claims task successfully', async () => {
        const res = await request(app)
            .post('/api/queue/a5d91fa7-ad96-4fbe-bb46-094eee00ff1f/claim');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({
            exam_id: 'a5d91fa7-ad96-4fbe-bb46-094eee00ff1f',
            task_role: 'Nurse',
            assignment_status: 'Assigned'
        }));
    });

    test('POST /api/queue/:examId/release releases task successfully', async () => {
        const res = await request(app)
            .post('/api/queue/a5d91fa7-ad96-4fbe-bb46-094eee00ff1f/release')
            .send({ reason: 'Patient requested rescheduling' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({
            exam_id: 'a5d91fa7-ad96-4fbe-bb46-094eee00ff1f',
            assignment_status: 'Unassigned'
        }));
    });

    test('POST /api/queue/:examId/claim rejects invalid UUID', async () => {
        const res = await request(app)
            .post('/api/queue/not-a-uuid/claim');

        expect(res.status).toBe(400);
    });
});
