const {
    workingDays,
    workingDaysByYear,
    getLeaveEntitlement,
    toDateOnlyString,
    computeLeaveBalances,
    DEFAULT_LEAVE_ENTITLEMENTS,
    LEAVE_TYPES_WITH_BALANCE
} = require('../src/services/hrLeaveService');

describe('HR Leave Service Unit Tests', () => {
    describe('workingDays', () => {
        test('returns 0 for empty or invalid dates', () => {
            expect(workingDays('', '')).toBe(0);
            expect(workingDays(null, null)).toBe(0);
            expect(workingDays('2026-09-10', '2026-09-01')).toBe(0); // end before start
        });

        test('counts working days excluding Fridays and Saturdays', () => {
            // 2026-09-01 (Tue), 02 (Wed), 03 (Thu), 04 (Fri - weekend), 05 (Sat - weekend), 06 (Sun)
            expect(workingDays('2026-09-01', '2026-09-06')).toBe(4);
            // Single weekday
            expect(workingDays('2026-09-07', '2026-09-07')).toBe(1);
            // Single weekend day (Friday)
            expect(workingDays('2026-09-04', '2026-09-04')).toBe(0);
            // Single weekend day (Saturday)
            expect(workingDays('2026-09-05', '2026-09-05')).toBe(0);
        });

        test('handles Date objects as inputs', () => {
            const start = new Date('2026-09-01T00:00:00Z');
            const end = new Date('2026-09-03T00:00:00Z');
            expect(workingDays(start, end)).toBe(3);
        });
    });

    describe('workingDaysByYear', () => {
        test('returns a single segment when dates are within the same year', () => {
            // 2026-06-07 (Sun) to 2026-06-11 (Thu) -> 5 working days
            const segments = workingDaysByYear('2026-06-07', '2026-06-11');
            expect(segments).toHaveLength(1);
            expect(segments[0].year).toBe(2026);
            expect(segments[0].days).toBe(5);
        });

        test('splits a range crossing New Year into two annual segments', () => {
            // 2026-12-30 (Wed), 31 (Thu) -> 2 days in 2026
            // 2027-01-01 (Fri), 02 (Sat), 03 (Sun), 04 (Mon) -> 2 days in 2027
            const segments = workingDaysByYear('2026-12-30', '2027-01-04');
            expect(segments).toEqual([
                { year: 2026, days: 2 },
                { year: 2027, days: 2 }
            ]);
        });
    });

    describe('getLeaveEntitlement', () => {
        test('returns custom override when available', () => {
            const overrides = [
                { year: 2026, leave_type: 'Vacation', entitlement_days: 25 },
                { year: 2026, leave_type: 'Sick', entitlement_days: 10 }
            ];
            expect(getLeaveEntitlement(overrides, 'Vacation', 2026)).toBe(25);
            expect(getLeaveEntitlement(overrides, 'Sick', 2026)).toBe(10);
        });

        test('falls back to default entitlement when override is missing', () => {
            const overrides = [];
            expect(getLeaveEntitlement(overrides, 'Vacation', 2026)).toBe(DEFAULT_LEAVE_ENTITLEMENTS.Vacation);
            expect(getLeaveEntitlement(overrides, 'Sick', 2026)).toBe(DEFAULT_LEAVE_ENTITLEMENTS.Sick);
            expect(getLeaveEntitlement(overrides, 'Personal', 2026)).toBe(DEFAULT_LEAVE_ENTITLEMENTS.Personal);
            expect(getLeaveEntitlement(overrides, 'Unknown', 2026)).toBe(0);
        });
    });

    describe('toDateOnlyString', () => {
        test('converts Date or string to YYYY-MM-DD', () => {
            expect(toDateOnlyString(new Date('2026-09-12T15:30:00Z'))).toBe('2026-09-12');
            expect(toDateOnlyString('2026-09-12T08:00:00')).toBe('2026-09-12');
            expect(toDateOnlyString('2026-09-12')).toBe('2026-09-12');
            expect(toDateOnlyString(null)).toBe('');
            expect(toDateOnlyString(undefined)).toBe('');
        });
    });

    describe('computeLeaveBalances', () => {
        test('calculates balance with entitlements and used days', async () => {
            const userId = '00000000-0000-0000-0000-000000000001';
            const mockDb = {
                query: jest.fn()
                    .mockResolvedValueOnce({
                        // overrides query
                        rows: [{ user_id: userId, year: 2026, leave_type: 'Vacation', entitlement_days: 30 }]
                    })
                    .mockResolvedValueOnce({
                        // used leave requests query
                        rows: [{
                            user_id: userId,
                            leave_type: 'Vacation',
                            start_date: '2026-03-01', // Sun (1)
                            end_date: '2026-03-03'   // Tue (3) -> 3 working days
                        }]
                    })
            };

            const results = await computeLeaveBalances(mockDb, [userId], 2026);
            expect(results).toHaveLength(1);
            expect(results[0].userId).toBe(userId);
            expect(results[0].year).toBe(2026);

            const vacation = results[0].balances.find(b => b.leaveType === 'Vacation');
            expect(vacation).toBeDefined();
            expect(vacation.entitlementDays).toBe(30);
            expect(vacation.usedDays).toBe(3);
            expect(vacation.remainingDays).toBe(27);

            const sick = results[0].balances.find(b => b.leaveType === 'Sick');
            expect(sick).toBeDefined();
            expect(sick.entitlementDays).toBe(DEFAULT_LEAVE_ENTITLEMENTS.Sick);
            expect(sick.usedDays).toBe(0);
            expect(sick.remainingDays).toBe(DEFAULT_LEAVE_ENTITLEMENTS.Sick);
        });
    });
});
