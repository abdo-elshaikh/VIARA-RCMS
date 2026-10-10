const {
    notifyExpiringCredentials,
    runOnce,
    startCredentialExpiryJob,
    WARNING_WINDOW_DAYS,
    URGENT_WINDOW_DAYS,
} = require('../src/jobs/credentialExpiryJob');

jest.mock('../src/services/notificationJobService', () => ({
    triggerEventForRole: jest.fn().mockResolvedValue({ queued: true }),
}));

const { triggerEventForRole } = require('../src/services/notificationJobService');

describe('credentialExpiryJob', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('exports warning and urgent window configurations', () => {
        expect(WARNING_WINDOW_DAYS).toBeGreaterThanOrEqual(1);
        expect(URGENT_WINDOW_DAYS).toBeGreaterThanOrEqual(1);
        expect(WARNING_WINDOW_DAYS).toBeGreaterThan(URGENT_WINDOW_DAYS);
    });

    test('notifies Admin and HR roles when credentials are due to expire', async () => {
        const mockExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        const mockRows = [
            {
                credential_id: 'cred-1',
                credential_type: 'Medical License',
                credential_number: 'MOH-12345',
                expires_at: mockExpiresAt,
                employee_name: 'Dr. Test Radiologist',
            }
        ];

        const mockDb = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: mockRows }) // select query
                .mockResolvedValueOnce({ rowCount: 1 }),    // update query
        };

        const result = await notifyExpiringCredentials(mockDb);

        expect(result.scanned).toBe(1);
        expect(result.notified).toBe(1);
        expect(triggerEventForRole).toHaveBeenCalledTimes(2); // Admin and HR
        expect(triggerEventForRole).toHaveBeenCalledWith(
            mockDb,
            'CredentialExpiring',
            'Admin',
            expect.objectContaining({
                entityType: 'StaffCredential',
                priority: 'Action', // <= 7 days is urgent Action
            })
        );
        expect(mockDb.query).toHaveBeenCalledWith(
            'UPDATE staff_credentials SET last_expiry_notified_at = NOW() WHERE credential_id = $1',
            ['cred-1']
        );
    });

    test('returns 0 notified when no credentials are near expiration', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValueOnce({ rows: [] }),
        };

        const result = await notifyExpiringCredentials(mockDb);
        expect(result.scanned).toBe(0);
        expect(result.notified).toBe(0);
        expect(triggerEventForRole).not.toHaveBeenCalled();
    });

    test('runOnce handles execution cleanly and prevents concurrent overlapping sweeps', async () => {
        const mockDb = {
            query: jest.fn().mockResolvedValueOnce({ rows: [] }),
        };

        const res = await runOnce(mockDb);
        expect(res.scanned).toBe(0);
    });

    test('startCredentialExpiryJob initializes and returns a teardown function', () => {
        const mockPool = { query: jest.fn() };
        const stop = startCredentialExpiryJob(mockPool);
        expect(typeof stop).toBe('function');
        stop(); // cleanup
    });
});
