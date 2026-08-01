const request = require('supertest');
const app = require('../../src/server');
const { Pool } = require('pg');

// Mock the PostgreSQL pool used by the server
jest.mock('pg', () => {
  const mPool = {
    connect: jest.fn().mockImplementation((cb) => { cb(null, {}, jest.fn()); }),
    query: jest.fn().mockResolvedValue({ rowCount: 1 }),
    totalCount: 10,
    idleCount: 8,
    waitingCount: 0
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('GET /api/v1/health', () => {
    
    it('should return 200 OK and correct database pool telemetry', async () => {
        const response = await request(app).get('/api/v1/health');
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'OK');
        expect(response.body).toHaveProperty('database', 'connected');
        
        // Assert the Phase 3 telemetry additions
        expect(response.body).toHaveProperty('pool_stats');
        expect(response.body.pool_stats).toEqual({
            total: 10,
            idle: 8,
            waiting: 0
        });
    });

    it('should handle simulated database failure gracefully', async () => {
        // Find the mocked pool instance
        const poolInstance = new Pool();
        // Force the query to throw an error for this test
        poolInstance.query.mockRejectedValueOnce(new Error('Simulated DB Crash'));

        const response = await request(app).get('/api/v1/health');
        
        expect(response.status).toBe(503);
        expect(response.body).toHaveProperty('status', 'ERROR');
        expect(response.body).toHaveProperty('database', 'disconnected');
    });
});
