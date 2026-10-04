const express = require('express');
const request = require('supertest');
const roomRoutes = require('../src/routes/roomRoutes');

describe('Room Routes', () => {
    let mockPool;
    let authenticateToken;
    let authorizeRole;
    let mockUserRole;

    beforeEach(() => {
        mockPool = {
            query: jest.fn().mockResolvedValue({ rows: [{ room_id: 'room-1', name: 'MRI Suite 1' }] })
        };
        mockUserRole = 'Receptionist';
        authenticateToken = (req, res, next) => {
            req.user = { id: 'test-user', role: mockUserRole };
            next();
        };
        authorizeRole = (roles) => (req, res, next) => {
            if (roles.includes(req.user?.role)) {
                return next();
            }
            return res.status(403).json({ error: 'Forbidden' });
        };
    });

    const buildApp = () => {
        const app = express();
        app.use(express.json());
        app.use('/api/rooms', roomRoutes(mockPool, authenticateToken, authorizeRole));
        return app;
    };

    it('allows Receptionist to access GET /api/rooms', async () => {
        mockUserRole = 'Receptionist';
        const app = buildApp();
        const res = await request(app).get('/api/rooms');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ room_id: 'room-1', name: 'MRI Suite 1' }]);
    });

    it('allows HR to access GET /api/rooms', async () => {
        mockUserRole = 'HR';
        const app = buildApp();
        const res = await request(app).get('/api/rooms');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ room_id: 'room-1', name: 'MRI Suite 1' }]);
    });

    it('allows Doctor to access GET /api/rooms', async () => {
        mockUserRole = 'Doctor';
        const app = buildApp();
        const res = await request(app).get('/api/rooms');
        expect(res.status).toBe(200);
    });

    it('allows Admin to access GET /api/rooms', async () => {
        mockUserRole = 'Admin';
        const app = buildApp();
        const res = await request(app).get('/api/rooms');
        expect(res.status).toBe(200);
    });

    it('blocks non-Admin from POST /api/rooms', async () => {
        mockUserRole = 'Receptionist';
        const app = buildApp();
        const res = await request(app).post('/api/rooms').send({
            name: 'New Room',
            roomNumber: '102',
            type: 'Imaging'
        });
        expect(res.status).toBe(403);
    });

    it('rejects unauthorized roles for GET /api/rooms', async () => {
        mockUserRole = 'Patient';
        const app = buildApp();
        const res = await request(app).get('/api/rooms');
        expect(res.status).toBe(403);
    });
});
