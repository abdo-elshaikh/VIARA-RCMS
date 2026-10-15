const { cleanupPublicPortalData } = require('../src/jobs/dataRetentionJob');

describe('public portal retention', () => {
    test('removes expired challenges and old terminal booking requests', async () => {
        const db = { query: jest.fn()
            .mockResolvedValueOnce({ rowCount: 7 })
            .mockResolvedValueOnce({ rowCount: 2 }) };

        const result = await cleanupPublicPortalData(db);

        expect(result).toEqual({ verificationChallengesDeleted: 7, appointmentRequestsDeleted: 2 });
        expect(db.query.mock.calls[0][0]).toContain('public_case_verification_challenges');
        expect(db.query.mock.calls[1][0]).toContain("status IN ('Scheduled', 'Rejected', 'Cancelled')");
        expect(db.query.mock.calls[1][1][0]).toBeGreaterThanOrEqual(30);
    });
});
