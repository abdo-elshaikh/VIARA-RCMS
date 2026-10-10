const DashboardService = require('../src/services/dashboardService');
const { getDashboardStats } = require('../src/controllers/dashboardController');

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
});

const invoke = async (role) => {
    const res = createResponse();
    const next = jest.fn();
    await getDashboardStats({})({
        user: { role, user_id: `${role.toLowerCase()}-1`, email: `${role.toLowerCase()}@viara.test` }
    }, res, next);
    return { res, next };
};

describe('dashboard role contracts', () => {
    afterEach(() => jest.restoreAllMocks());

    test('cashier receives finance data scoped to the authenticated cashier', async () => {
        const financeSpy = jest.spyOn(DashboardService.prototype, 'getFinanceStats').mockResolvedValue({
            collectedToday: 1200,
            transactionsToday: 4
        });
        const activitySpy = jest.spyOn(DashboardService.prototype, 'getRecentActivity');
        const snapshotSpy = jest.spyOn(DashboardService.prototype, 'getOperationalSnapshot');

        const { res, next } = await invoke('Cashier');

        expect(financeSpy).toHaveBeenCalledWith({ cashierId: 'cashier-1', branchId: undefined });
        expect(activitySpy).not.toHaveBeenCalled();
        expect(snapshotSpy).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            role: 'Cashier',
            collectedToday: 1200,
            recentActivity: [],
            liveModalities: []
        }));
    });

    test('accountant receives finance aggregates without clinical activity or staff data', async () => {
        const financeSpy = jest.spyOn(DashboardService.prototype, 'getFinanceStats').mockResolvedValue({
            collectedWeek: 8800,
            openInvoices: 6
        });

        const { res, next } = await invoke('Accountant');

        expect(financeSpy).toHaveBeenCalledWith({ branchId: undefined });
        expect(next).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload).toMatchObject({ role: 'Accountant', collectedWeek: 8800, recentActivity: [] });
        expect(payload).not.toHaveProperty('activeStaff');
        expect(payload).not.toHaveProperty('recentActivity.0.mrn');
    });

    test('HR receives workforce aggregates without financial or clinical data', async () => {
        jest.spyOn(DashboardService.prototype, 'getHRStats').mockResolvedValue({
            activeStaff: 18,
            presentToday: 15,
            onLeaveToday: 2,
            pendingLeave: 1
        });

        const { res, next } = await invoke('HR');

        expect(next).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload).toMatchObject({ role: 'HR', activeStaff: 18, recentActivity: [] });
        expect(payload).not.toHaveProperty('revenueAmount');
    });

    test('insurance staff receives an aggregate dashboard instead of a 403', async () => {
        jest.spyOn(DashboardService.prototype, 'getInsuranceStats').mockResolvedValue({
            pendingApprovals: 3,
            openClaims: 7,
            outstandingClaims: 25000
        });

        const { res, next } = await invoke('Insurance_Staff');

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            role: 'Insurance_Staff',
            pendingApprovals: 3,
            recentActivity: []
        }));
    });
});
