const {
    EMERGENCY_ACCESS_PERMISSIONS,
    EMERGENCY_ACCESS_ROLES,
    getActiveEmergencyGrant,
    getGrantedEmergencyPermissions,
    attachActiveEmergencyClaims,
    findActiveEmergencyGrant,
} = require('../src/services/emergencyAccessService');
const { requestBreakGlassSchema, revokeBreakGlassSchema } = require('../src/schemas/breakGlassSchema');
const AuthService = require('../src/services/authService');

const GRANT_ID = '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac';
const USER_ID = '4a8cc118-1d4e-4411-bbf7-6e9464fce34e';
const SESSION_ID = 'b5b5652d-a5d8-4f85-b19e-39b5900614a1';

const activeClaims = (overrides = {}) => ({
    user_id: USER_ID,
    role: 'Nurse',
    session_id: SESSION_ID,
    emergencyAccessId: GRANT_ID,
    elevatedPermissions: [...EMERGENCY_ACCESS_PERMISSIONS],
    breakGlassExpiry: Date.now() + 60_000,
    ...overrides,
});

describe('break-glass governance', () => {
    test('accepts only the intersection of signed and database permissions', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{
                grant_id: GRANT_ID,
                user_id: USER_ID,
                session_id: SESSION_ID,
                permissions: ['VIEW_PATIENTS', 'VIEW_REPORTS'],
                status: 'Active',
                expires_at: new Date(Date.now() + 60_000),
            }] })
        };

        const granted = await getGrantedEmergencyPermissions(
            db,
            activeClaims({ elevatedPermissions: ['VIEW_PATIENTS', 'VIEW_EXAMS'] }),
            ['VIEW_PATIENTS', 'VIEW_EXAMS']
        );

        expect(granted).toEqual(['VIEW_PATIENTS']);
    });

    test('rejects expired claims before granting a permission and expires the database grant', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const grant = await getActiveEmergencyGrant(db, activeClaims({ breakGlassExpiry: Date.now() - 1 }));

        expect(grant).toBeNull();
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'Expired'"), [GRANT_ID]);
    });

    test('rejects a grant from another session', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{
            grant_id: GRANT_ID,
            user_id: USER_ID,
            session_id: '2d564697-3ea5-44a2-a0ca-40c3d696a3af',
            permissions: ['VIEW_PATIENTS'],
            status: 'Active',
            expires_at: new Date(Date.now() + 60_000),
        }] }) };

        expect(await getActiveEmergencyGrant(db, activeClaims())).toBeNull();
    });

    test('refresh claims are rebuilt from the active database grant', async () => {
        const expiresAt = new Date(Date.now() + 60_000);
        const db = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{
                grant_id: GRANT_ID,
                user_id: USER_ID,
                session_id: SESSION_ID,
                permissions: ['VIEW_EXAMS'],
                status: 'Active',
                expires_at: expiresAt,
            }] }) };

        const claims = await attachActiveEmergencyClaims(db, {
            user_id: USER_ID,
            role: 'Nurse',
            session_id: SESSION_ID,
            elevatedPermissions: ['UNTRUSTED_STALE_VALUE'],
        });

        expect(claims).toMatchObject({
            emergencyAccessId: GRANT_ID,
            elevatedPermissions: ['VIEW_EXAMS'],
            breakGlassExpiry: expiresAt.getTime(),
        });
    });

    test('requires re-authentication and detailed reasons at the API boundary', () => {
        expect(requestBreakGlassSchema.safeParse({ reason: 'too short', currentPassword: 'secret' }).success).toBe(false);
        expect(requestBreakGlassSchema.safeParse({ reason: 'A detailed urgent clinical justification', currentPassword: '' }).success).toBe(false);
        expect(requestBreakGlassSchema.safeParse({ reason: 'A detailed urgent clinical justification', currentPassword: 'secret' }).success).toBe(true);
        expect(revokeBreakGlassSchema.safeParse({ reason: 'short' }).success).toBe(false);
        expect(revokeBreakGlassSchema.safeParse({ reason: 'Emergency workflow has ended' }).success).toBe(true);
    });

    test('grants a strictly read-only permission set that includes appointment visibility', () => {
        // Emergency elevation must never contain a write or management capability.
        EMERGENCY_ACCESS_PERMISSIONS.forEach((permission) => {
            expect(permission.startsWith('VIEW_')).toBe(true);
        });
        // A break-glass clinician can see the full schedule (appointmentController
        // visibility already branches on this permission).
        expect(EMERGENCY_ACCESS_PERMISSIONS).toContain('VIEW_APPOINTMENTS');
        expect(EMERGENCY_ACCESS_ROLES).toEqual(['Radiologist', 'Technician', 'Nurse']);
    });

    test('rejects a legacy NULL-session grant from a session-bound token', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{
            grant_id: GRANT_ID,
            user_id: USER_ID,
            session_id: null,
            permissions: ['VIEW_PATIENTS'],
            status: 'Active',
            expires_at: new Date(Date.now() + 60_000),
        }] }) };

        expect(await getActiveEmergencyGrant(db, activeClaims())).toBeNull();
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('session-scoped lookup only matches grants bound to that exact session', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await findActiveEmergencyGrant(db, { userId: USER_ID, sessionId: SESSION_ID });

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('AND session_id = $2'),
            [USER_ID, SESSION_ID]
        );
        expect(db.query.mock.calls[0][0]).not.toContain('session_id IS NULL OR');
    });

    test('a fresh staff login expires orphaned emergency grants from prior sessions', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                // Account existence check in generateTokens requires the row to exist
                if (text.includes('FROM users') && text.includes('FOR UPDATE')) {
                    return { rows: [{ user_id: USER_ID }] };
                }
                return { rows: [] };
            })
        };

        const { token } = await AuthService.generateTokens(
            db,
            { user_id: USER_ID, role: 'Nurse', full_name: 'Test Nurse' },
            USER_ID,
            false,
            { ipAddress: '127.0.0.1', userAgent: 'jest' }
        );

        expect(token).toBeTruthy();
        const emergencyExpiry = db.query.mock.calls.find(
            ([text, params]) => text.includes('emergency_access_logs') && params[0] === USER_ID
        );
        expect(emergencyExpiry).toBeDefined();
        expect(emergencyExpiry[0]).toContain("SET status = 'Expired'");
        expect(emergencyExpiry[0]).toContain("AND status = 'Active'");
    });
});
