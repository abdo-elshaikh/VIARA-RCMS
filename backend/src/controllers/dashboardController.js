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
                stats = await dashboardService.getReceptionistStats();
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
            case 'Accountant':
            case 'HR':
                stats = await dashboardService.getAdminStats();
                stats.role = user.role;
                break;

            default:
                throw new AppError('Dashboard is not available for this role', 403);
        }

        // Add recent activity (common for all roles)
        stats.recentActivity = await dashboardService.getRecentActivity(5);

        // Add timestamp
        stats.timestamp = new Date().toISOString();
        stats.userName = user.full_name || user.name || user.email;

        res.json(stats);

    } catch (error) {
        next(error);
    }
};

module.exports = { getDashboardStats };
