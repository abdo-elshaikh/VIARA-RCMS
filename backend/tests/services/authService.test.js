const jwt = require('jsonwebtoken');
const crypto = require('crypto');
jest.mock('../../src/services/realtimeService', () => ({
    sendToUser: jest.fn(),
    sendToPatient: jest.fn(),
    sendToDoctor: jest.fn()
}));
const AuthService = require('../../src/services/authService');

// Mock external dependencies
jest.mock('jsonwebtoken');
jest.mock('crypto');

describe('AuthService', () => {
    let mockDb;

    beforeEach(() => {
        // Setup mock DB client
        mockDb = {
            query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ user_id: 'owner-id' }] })
        };
        
        // Setup env vars
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_EXPIRY = '1h';

        // Setup crypto mocks
        crypto.randomBytes.mockReturnValue(Buffer.from('mocked-random-bytes'));
        crypto.randomUUID.mockReturnValue('session-uuid');
        
        // Mock the chainable crypto.createHash
        const mockHash = {
            update: jest.fn().mockReturnThis(),
            digest: jest.fn().mockReturnValue('mocked-hash-digest')
        };
        crypto.createHash.mockReturnValue(mockHash);

        // Setup jwt mock
        jwt.sign.mockReturnValue('mocked.jwt.token');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('resolveRefreshOwner', () => {
        it('should return patient_id when ownerType is true or patient', () => {
            expect(AuthService.resolveRefreshOwner(true)).toBe('patient_id');
            expect(AuthService.resolveRefreshOwner('patient')).toBe('patient_id');
        });

        it('should return doctor_id when ownerType is doctor', () => {
            expect(AuthService.resolveRefreshOwner('doctor')).toBe('doctor_id');
        });

        it('should return user_id as default fallback', () => {
            expect(AuthService.resolveRefreshOwner(false)).toBe('user_id');
            expect(AuthService.resolveRefreshOwner('admin')).toBe('user_id');
        });
    });

    describe('generateTokens', () => {
        it('should generate a valid JWT and save refresh token to DB', async () => {
            const userPayload = { id: 1, role: 'Admin' };
            const ownerId = 123;

            const result = await AuthService.generateTokens(mockDb, userPayload, ownerId, false);

            // Verify JWT Generation
            expect(jwt.sign).toHaveBeenCalledWith(
                { ...userPayload, session_id: 'session-uuid' },
                'test-secret',
                { expiresIn: '1h' }
            );

            // Verify account lock, session binding, revocation and emergency grant expiry.
            expect(mockDb.query).toHaveBeenCalledTimes(5);
            expect(mockDb.query.mock.calls[0][0]).toContain('SELECT user_id FROM users');
            expect(mockDb.query.mock.calls[0][1]).toEqual([ownerId]);
            expect(mockDb.query.mock.calls[1][0]).toContain('SET current_session_id');
            expect(mockDb.query.mock.calls[2][0]).toContain('revoked_reason = \'new_login\'');
            expect(mockDb.query.mock.calls[3][0]).toContain('UPDATE emergency_access_logs');
            expect(mockDb.query.mock.calls[3][0]).toContain("SET status = 'Expired'");
            expect(mockDb.query.mock.calls[3][1]).toEqual([ownerId]);

            // Verify DB Parameters
            const insertCall = mockDb.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO refresh_tokens'));
            expect(insertCall[0]).toContain('session_id');
            const queryParams = insertCall[1];
            expect(queryParams[0]).toBe(123); // ownerId
            expect(queryParams[1]).toBe('session-uuid');
            expect(queryParams[2]).toBe('mocked-hash-digest'); // refreshHash
            expect(queryParams[3]).toBeInstanceOf(Date); // expiresAt

            // Verify Return Format
            expect(result).toHaveProperty('token', 'mocked.jwt.token');
            expect(result).toHaveProperty('refreshToken', '6d6f636b65642d72616e646f6d2d6279746573'); // hex of 'mocked-random-bytes'
        });

        it('should not expire emergency grants for patient or doctor logins', async () => {
            await AuthService.generateTokens(mockDb, { patientId: 1 }, 999, true);
            await AuthService.generateTokens(mockDb, { doctorId: 1 }, 888, 'doctor');

            const emergencyCalls = mockDb.query.mock.calls.filter(
                ([text]) => text.includes('emergency_access_logs')
            );
            expect(emergencyCalls).toHaveLength(0);
        });
    });
});
