jest.mock('../src/config/logger', () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
}));

const { csrfProtection, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } = require('../src/middleware/csrf');

const createResponse = () => ({
    cookie: jest.fn(),
});

describe('csrfProtection middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test.each([
        '/api/auth/login',
        '/api/portal/login',
        '/api/doctor-portal/login',
        '/api/public/case-status',
        '/api/public/final-report',
    ])('allows public POST %s and seeds a CSRF cookie', async (path) => {
        const req = {
            method: 'POST',
            originalUrl: path,
            headers: {},
            cookies: {},
        };
        const res = createResponse();
        const next = jest.fn();

        csrfProtection()(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.cookie).toHaveBeenCalledWith(
            CSRF_COOKIE_NAME,
            expect.any(String),
            expect.objectContaining({
                httpOnly: false,
                sameSite: 'lax',
                path: '/',
            })
        );
    });

    test('still blocks protected POST requests without a matching CSRF token', () => {
        const req = {
            method: 'POST',
            originalUrl: '/api/profile/preferences',
            headers: {},
            cookies: {},
        };
        const res = createResponse();
        const next = jest.fn();

        csrfProtection()(req, res, next);

        expect(res.cookie).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(next.mock.calls[0][0].statusCode).toBe(403);
        expect(next.mock.calls[0][0].code).toBe('CSRF_ERROR');
        expect(next.mock.calls[0][0].message).toBe('CSRF token validation failed');
    });

    test('accepts a protected POST when the cookie and header match', () => {
        const token = '0123456789abcdef0123456789abcdef';
        const req = {
            method: 'POST',
            originalUrl: '/api/profile/preferences',
            headers: {
                [CSRF_HEADER_NAME]: token,
            },
            cookies: {
                [CSRF_COOKIE_NAME]: token,
            },
        };
        const res = createResponse();
        const next = jest.fn();

        csrfProtection()(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.cookie).not.toHaveBeenCalled();
    });
});
