describe('attendanceConfigCache', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('loads without relying on a config/db module and accepts an injected pool', async () => {
        const service = require('../src/services/attendanceConfigCache');
        const pool = {
            on: jest.fn(),
            query: jest.fn().mockResolvedValue({
                rows: [
                    { setting_key: 'hr.attendance.grace_period_late_minutes', setting_value: '20' },
                    { setting_key: 'hr.attendance.enforce_shift_login_restriction', setting_value: 'true' },
                ],
            }),
        };

        service.setAttendanceConfigPool(pool);
        const config = await service.getAttendanceConfig();

        expect(config.gracePeriodLateMinutes).toBe(20);
        expect(config.enforceShiftLoginRestriction).toBe(true);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });
});
