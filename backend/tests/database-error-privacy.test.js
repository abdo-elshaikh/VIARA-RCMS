jest.mock('../src/config/logger', () => ({ warn: jest.fn(), error: jest.fn() }));
const logger = require('../src/config/logger');
const { errorHandler } = require('../src/middleware/errorHandler');

test.each(['22P02', '23502', '23514'])('does not disclose a failing database row for %s in production', code => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    try {
        errorHandler({ code, message: 'SYNTHETIC_PRIVATE_VALUE', detail: 'Failing row contains (SYNTHETIC_PRIVATE_VALUE)' }, { method: 'POST', url: '/api/synthetic', originalUrl: '/api/synthetic' }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(JSON.stringify(res.json.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_VALUE');
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_VALUE');
    } finally {
        process.env.NODE_ENV = original;
        jest.clearAllMocks();
    }
});
