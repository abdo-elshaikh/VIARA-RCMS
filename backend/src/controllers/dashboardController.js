const DashboardService = require('../services/dashboardService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Dashboard Controller
 * Handles dashboard statistics requests with role-based data
 */

const DASHBOARD_CACHE_TTL_MS = 10 * 1000; // 10 seconds TTL
const statsCache = new Map();
const inflightRequests = new Map();

/**
 * Get dashboard statistics based on user role
 */
const getDashboardStats = (db) => async (req, res, next) => {
    try {
        const user = req.user; // From auth middleware
        const branchId = user.branch_id || user.branchId || 'default';
        const cacheKey = `${user.role}:${['Radiologist', 'Technician', 'Nurse', 'Cashier'].includes(user.role) ? user.user_id : 'shared'}:${branchId}`;

        const cached = statsCache.get(cacheKey);
        const now = Date.now();
        if (cached && (now - cached.cachedAt < DASHBOARD_CACHE_TTL_MS)) {
            return res.json({
                ...cached.data,
                userName: user.full_name || user.name || user.email,
                timestamp: new Date().toISOString()
            });
        }

        let promise = inflightRequests.get(cacheKey);
        if (!promise) {
            promise = (async () => {
                const dashboardService = new DashboardService(db);
                let stats = {};

                switch (user.role) {
                    case 'Receptionist':
                        stats = await dashboardService.getReceptionistStats();
                        stats.role = 'Receptionist';
                        break;
                    case 'Cashier':
                        stats = await dashboardService.getFinanceStats({
                            cashierId: user.user_id,
                            branchId: user.branch_id || user.branchId
                        });
                        stats.role = 'Cashier';
                        break;

                    case 'Radiologist':
                    case 'Technician':
                    case 'Nurse':
                        stats = await dashboardService.getClinicalStats(user.user_id, user.role);
                        stats.role = user.role;
                        break;

                    case 'Developer':
                    case 'Admin':
                        stats = await dashboardService.getAdminStats();
                        stats.role = user.role;
                        break;

                    case 'Accountant':
                        stats = await dashboardService.getFinanceStats({
                            branchId: user.branch_id || user.branchId
                        });
                        stats.role = 'Accountant';
                        break;

                    case 'HR':
                        stats = await dashboardService.getHRStats();
                        stats.role = 'HR';
                        break;

                    case 'Insurance_Staff':
                        stats = await dashboardService.getInsuranceStats(user.branch_id || user.branchId);
                        stats.role = 'Insurance_Staff';
                        break;

                    case 'Marketing':
                        stats = { role: 'Marketing' };
                        break;

                    default:
                        throw new AppError('Dashboard is not available for this role', 403);
                }

                const clinicalRoles = ['Radiologist', 'Technician', 'Nurse'];
                const mayViewClinicalActivity = ['Developer', 'Admin', 'Receptionist', ...clinicalRoles].includes(user.role);
                const mayViewOperationalSnapshot = ['Developer', 'Admin', 'Receptionist', ...clinicalRoles].includes(user.role);

                const [recentActivity, operationalSnapshot] = await Promise.all([
                    mayViewClinicalActivity
                        ? dashboardService.getRecentActivity(5, { role: user.role, userId: user.user_id })
                        : Promise.resolve([]),
                    mayViewOperationalSnapshot
                        ? dashboardService.getOperationalSnapshot()
                        : Promise.resolve({ liveModalities: [], turnaroundStages: [] })
                ]);

                stats.recentActivity = recentActivity;
                stats.liveModalities = operationalSnapshot.liveModalities;
                stats.turnaroundStages = operationalSnapshot.turnaroundStages;

                const currentNow = Date.now();
                statsCache.set(cacheKey, {
                    cachedAt: currentNow,
                    data: { ...stats }
                });

                if (statsCache.size > 200) {
                    for (const [k, v] of statsCache.entries()) {
                        if (currentNow - v.cachedAt > DASHBOARD_CACHE_TTL_MS) statsCache.delete(k);
                    }
                }

                return stats;
            })().finally(() => {
                inflightRequests.delete(cacheKey);
            });

            inflightRequests.set(cacheKey, promise);
        }

        const data = await promise;
        res.json({
            ...data,
            userName: user.full_name || user.name || user.email,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getDashboardStats };
