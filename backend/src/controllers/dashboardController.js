const DashboardService = require('../services/dashboardService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Dashboard Controller
 * Handles dashboard statistics requests with role-based data
 */

/**
 * Get dashboard statistics based on user role
 */
const getDashboardStats = (db) => async (req, res, next) => {
    try {
        const user = req.user; // From auth middleware
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

            // Marketing has a separate role-aware dashboard in the SPA. Keep
            // this endpoint contract valid without exposing unrelated data.
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

        // Add timestamp
        stats.timestamp = new Date().toISOString();
        stats.userName = user.full_name || user.name || user.email;

        res.json(stats);

    } catch (error) {
        next(error);
    }
};

module.exports = { getDashboardStats };
