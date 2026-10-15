const { cleanupNotificationData } = require('../src/jobs/dataRetentionJob');

describe('notification retention', () => {
    test('redacts terminal payloads before deleting old jobs and non-critical notifications', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rowCount: 4 })
                .mockResolvedValueOnce({ rowCount: 2 })
                .mockResolvedValueOnce({ rowCount: 3 })
        };

        const result = await cleanupNotificationData(db);

        expect(result).toEqual({
            jobPayloadsRedacted: 4,
            jobsDeleted: 2,
            notificationsDeleted: 3
        });
        expect(db.query).toHaveBeenCalledTimes(3);
        expect(db.query.mock.calls[0][0]).toContain("status IN ('Sent', 'Failed', 'Cancelled', 'Skipped')");
        expect(db.query.mock.calls[0][0]).toContain("variables = '{\"redacted\":true}'::jsonb");
        expect(db.query.mock.calls[2][0]).toContain("priority <> 'Critical'");
    });

    test('uses bounded configurable batches', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rowCount: 0 }) };

        await cleanupNotificationData(db);

        for (const call of db.query.mock.calls) {
            expect(call[1][1]).toBeGreaterThan(0);
        }
    });
});
