const { AppError } = require('./errorHandler');
const { logSecurityEvent } = require('../services/securityEventService');
const { triggerEventForRole } = require('../services/notificationJobService');
const { getGrantedEmergencyPermissions } = require('../services/emergencyAccessService');

// Simple in-memory cache for role permissions to avoid DB hits on every request
// In a distributed setup, this would be Redis.
const permissionCache = new Map();
let cacheLastUpdated = 0;
const CACHE_TTL = 60 * 1000; // 1 minute
let isRefreshing = false;

const attachGrantedPermissions = (req, permissions = []) => {
    const granted = permissions.filter(Boolean);
    if (!granted.length) return;

    const current = new Set([
        ...(Array.isArray(req.user?.permissions) ? req.user.permissions : []),
        ...granted
    ]);
    req.user.permissions = Array.from(current);
};

const markEmergencyAccessUsed = async (db, req, permissions) => {
    req.emergencyAccess = {
        grantId: req.user.emergencyAccessId,
        permissions
    };
    await db.query(`
        UPDATE emergency_access_logs
        SET last_used_at = NOW()
        WHERE grant_id = $1 AND status = 'Active'
    `, [req.user.emergencyAccessId]);
};

/**
 * Initializes or refreshes the permission cache from the database.
 */
const refreshPermissionCache = async (db) => {
    if (isRefreshing) {
        return;
    }
    isRefreshing = true;
    try {
        const query = `
            SELECT rp.role_name, p.name as permission_name
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.permission_id
        `;
        const result = await db.query(query);
        
        permissionCache.clear();
        
        result.rows.forEach(row => {
            const role = row.role_name;
            const perm = row.permission_name;
            if (!permissionCache.has(role)) {
                permissionCache.set(role, new Set());
            }
            permissionCache.get(role).add(perm);
        });
        
        cacheLastUpdated = Date.now();
        console.log('RBAC Permission cache refreshed.');
    } catch (error) {
        console.error('Failed to refresh RBAC permission cache:', error);
    } finally {
        isRefreshing = false;
    }
};

/**
 * Middleware to check if the user has a specific permission.
 * Assumes req.user is populated by authenticateToken.
 */
const hasPermission = (db, requiredPermission) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return next(new AppError('Unauthorized: User not authenticated', 401));
            }

            const { role, elevatedPermissions } = req.user;

            // Developer owns technical superuser authorization. Admin must be granted explicitly.
            if (role === 'Developer') {
                attachGrantedPermissions(req, [requiredPermission]);
                return next();
            }

            // 1. Check Break-Glass / Elevated Permissions
            const emergencyPermissions = elevatedPermissions
                ? await getGrantedEmergencyPermissions(db, req.user, [requiredPermission])
                : [];
            if (emergencyPermissions.includes(requiredPermission)) {
                attachGrantedPermissions(req, [requiredPermission]);
                await markEmergencyAccessUsed(db, req, [requiredPermission]);
                return next();
            }

            // Authorization decisions are read from the shared database. The
            // in-memory cache remains a UI/login optimization only, so role
            // changes take effect consistently across every API replica.
            const permission = await db.query(`
                SELECT 1
                FROM role_permissions rp
                JOIN permissions p ON p.permission_id = rp.permission_id
                WHERE rp.role_name = $1 AND p.name = $2
                LIMIT 1
            `, [role, requiredPermission]);

            if (permission.rows.length > 0) {
                attachGrantedPermissions(req, [requiredPermission]);
                return next();
            }

            await logSecurityEvent(db, {
                eventType: 'PERMISSION_DENIED',
                severity: 'warning',
                userId: req.user.user_id || req.user.userId,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
                details: { role, requiredPermission, path: req.originalUrl }
            });
            triggerEventForRole(db, 'PERMISSION_DENIED', 'Admin', { priority: 'Warning' }).catch(() => {});
            triggerEventForRole(db, 'PERMISSION_DENIED', 'HR', { priority: 'Warning' }).catch(() => {});

            return next(new AppError(`Access Denied: Requires ${requiredPermission} permission`, 403));
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Middleware to check whether the user has at least one permission.
 */
const hasAnyPermission = (db, requiredPermissions = []) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return next(new AppError('Unauthorized: User not authenticated', 401));
            }

            if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0) {
                return next(new AppError('Authorization middleware misconfigured', 500));
            }

            const { role, elevatedPermissions } = req.user;

            // Developer owns technical superuser authorization. Admin must be granted explicitly.
            if (role === 'Developer') {
                attachGrantedPermissions(req, requiredPermissions);
                return next();
            }

            const grantedElevated = elevatedPermissions
                ? await getGrantedEmergencyPermissions(db, req.user, requiredPermissions)
                : [];
            if (grantedElevated.length > 0) {
                attachGrantedPermissions(req, grantedElevated);
                await markEmergencyAccessUsed(db, req, grantedElevated);
                return next();
            }

            const permission = await db.query(`
                SELECT p.name
                FROM role_permissions rp
                JOIN permissions p ON p.permission_id = rp.permission_id
                WHERE rp.role_name = $1 AND p.name = ANY($2::text[])
            `, [role, requiredPermissions]);

            if (permission.rows.length > 0) {
                attachGrantedPermissions(req, permission.rows.map(row => row.name));
                return next();
            }

            await logSecurityEvent(db, {
                eventType: 'PERMISSION_DENIED',
                severity: 'warning',
                userId: req.user.user_id || req.user.userId,
                ipAddress: req.ip,
                userAgent: req.get('user-agent'),
                details: { role, requiredPermissions, path: req.originalUrl }
            });
            triggerEventForRole(db, 'PERMISSION_DENIED', 'Admin', { priority: 'Warning' }).catch(() => {});
            triggerEventForRole(db, 'PERMISSION_DENIED', 'HR', { priority: 'Warning' }).catch(() => {});

            return next(new AppError(`Access Denied: Requires one of [${requiredPermissions.join(', ')}]`, 403));
        } catch (error) {
            next(error);
        }
    };
};

module.exports = {
    hasPermission,
    hasAnyPermission,
    refreshPermissionCache,
    permissionCache
};
