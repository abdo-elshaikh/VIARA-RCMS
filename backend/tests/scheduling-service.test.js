const {
    assertWithinWorkingHours,
    getWorkingHours
} = require('../src/services/schedulingService');
const { updateCenterSettingsSchema } = require('../src/schemas/settingsSchema');

describe('center scheduling rules', () => {
    test('uses the configured center timezone for working-hour checks', () => {
        const settings = {
            start: 8,
            end: 17,
            holidays: [],
            workingDays: [0, 1, 2, 3, 4],
            timezone: 'Africa/Cairo'
        };

        expect(() => assertWithinWorkingHours(
            '2026-08-23T06:00:00.000Z',
            '2026-08-23T07:00:00.000Z',
            settings
        )).not.toThrow();
        expect(() => assertWithinWorkingHours(
            '2026-08-23T04:00:00.000Z',
            '2026-08-23T05:00:00.000Z',
            settings
        )).toThrow(/configured working hours/i);
    });

    test('loads current settings before falling back to the legacy center table', async () => {
        const client = {
            query: jest.fn().mockResolvedValueOnce({ rows: [
                { setting_key: 'center.working_hours', setting_value: '{"start":8,"end":17,"holidays":[]}' },
                { setting_key: 'center.timezone', setting_value: 'Africa/Cairo' }
            ] })
        };

        await expect(getWorkingHours(client)).resolves.toMatchObject({
            start: 8,
            end: 17,
            timezone: 'Africa/Cairo'
        });
        expect(client.query).toHaveBeenCalledTimes(1);
    });

    test('validates timezones, real holiday dates, and coherent hour ranges', () => {
        expect(updateCenterSettingsSchema.safeParse({
            timezone: 'Africa/Cairo',
            working_hours: { start: 8, end: 17, holidays: ['2026-08-21'] }
        }).success).toBe(true);
        expect(updateCenterSettingsSchema.safeParse({ timezone: 'Invalid/Timezone' }).success).toBe(false);
        expect(updateCenterSettingsSchema.safeParse({
            working_hours: { start: 17, end: 8, holidays: [] }
        }).success).toBe(false);
        expect(updateCenterSettingsSchema.safeParse({
            working_hours: { start: 8, end: 17, holidays: ['2026-02-30'] }
        }).success).toBe(false);
    });
});
