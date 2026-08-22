const { refreshPermissionCache } = require('../middleware/rbacMiddleware');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../middleware/authMiddleware');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { grantDeveloperPermissions } = require('../services/developerSeedService');
const { assertCanManageRole, isDeveloper, isProtectedRole } = require('../utils/roleGovernance');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVELOPER_ONLY_PERMISSIONS = [
    'MANAGE_DEVELOPER_ROLE',
    'MANAGE_PROTECTED_ROLES',
    'MANAGE_DATABASE_CONFIG',
    'VIEW_SYSTEM_DIAGNOSTICS',
    'MANAGE_SYSTEM_RUNTIME',
    'MANAGE_FEATURE_FLAGS',
    'VIEW_MIGRATION_STATUS',
    'MANAGE_SECRET_SETTINGS',
    'RESTORE_BACKUPS'
];

const getAllPermissions = (db) => async (req, res, next) => {
    try {
        const result = await db.query('SELECT * FROM permissions ORDER BY module, name');
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getRolePermissions = (db) => async (req, res, next) => {
    try {
        // We get all distinct roles from the enum type
        const rolesResult = await db.query(`
            SELECT unnest(enum_range(NULL::user_role))::text AS role_name
        `);
        const roles = rolesResult.rows.map(r => r.role_name);

        const rpResult = await db.query(`
            SELECT rp.role_name, rp.permission_id, p.name, p.module
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.permission_id
        `);

        // Group by role
        const roleMap = {};
        roles.forEach(r => roleMap[r] = []);
        
        rpResult.rows.forEach(row => {
            if (roleMap[row.role_name]) {
                roleMap[row.role_name].push(row.permission_id);
            }
        });

        res.json(roleMap);
    } catch (error) {
        next(error);
    }
};

const updateRolePermissions = (db) => async (req, res, next) => {
    let client;
    try {
        const { role } = req.params;
        const { permissionIds } = req.body || {}; // Array of permission UUIDs

        assertCanManageRole(req.user, role);
        if (!Array.isArray(permissionIds)) {
            return next(new AppError('permissionIds must be an array', 400));
        }

        let uniquePermissionIds = [...new Set(permissionIds)];
        if (uniquePermissionIds.some(id => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
            return next(new AppError('Every permission ID must be a valid UUID', 400));
        }

        const roleResult = await db.query(`
            SELECT EXISTS (
                SELECT 1
                FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'user_role' AND e.enumlabel = $1
            ) AS exists
        `, [role]);
        if (!roleResult.rows[0]?.exists) {
            return next(new AppError('Unknown system role', 400));
        }

        if (role === 'Developer') {
            const allPermissionsResult = await db.query(
                'SELECT permission_id::text AS permission_id FROM permissions'
            );
            uniquePermissionIds = allPermissionsResult.rows.map(row => row.permission_id);
        }

        if (uniquePermissionIds.length > 0) {
            const validResult = await db.query(
                'SELECT permission_id::text AS permission_id, name FROM permissions WHERE permission_id = ANY($1::uuid[])',
                [uniquePermissionIds]
            );
            if (validResult.rows.length !== uniquePermissionIds.length) {
                return next(new AppError('One or more permission IDs do not exist', 400));
            }

            if (role !== 'Developer') {
                const protectedNames = validResult.rows
                    .map(row => row.name)
                    .filter(name => DEVELOPER_ONLY_PERMISSIONS.includes(name));
                if (protectedNames.length > 0) {
                    return next(new AppError('Developer-only permissions cannot be assigned to other roles', 403));
                }
            }
        }

        const beforeResult = await db.query(
            'SELECT permission_id::text AS permission_id FROM role_permissions WHERE role_name = $1',
            [role]
        );
        const beforeIds = beforeResult.rows.map(row => row.permission_id);

        client = await db.connect();
        await client.query('BEGIN');

        // Delete existing permissions for the role
        await client.query('DELETE FROM role_permissions WHERE role_name = $1', [role]);

        // Insert new ones
        if (uniquePermissionIds.length > 0) {
            const values = uniquePermissionIds.map((id, index) => `($1, $${index + 2})`).join(', ');
            const params = [role, ...uniquePermissionIds];
            await client.query(`INSERT INTO role_permissions (role_name, permission_id) VALUES ${values}`, params);
        }

        await logAction(client, {
            userId: req.user?.user_id || req.user?.userId,
            action: 'ROLE_PERMISSIONS_UPDATED',
            resourceTable: 'role_permissions',
            ipAddress: req.ip,
            details: {
                role,
                actorRole: req.user?.role,
                protectedRole: isProtectedRole(role),
                added: uniquePermissionIds.filter(id => !beforeIds.includes(id)),
                removed: beforeIds.filter(id => !uniquePermissionIds.includes(id)),
                permissionCount: uniquePermissionIds.length,
                userAgent: req.get?.('user-agent') || null
            }
        });

        await client.query('COMMIT');

        // Refresh memory cache (outside transaction)
        await refreshPermissionCache(db);

        res.json({ message: 'Permissions updated successfully', role, permissionCount: uniquePermissionIds.length });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const requestBreakGlass = (db) => async (req, res, next) => {
    try {
        const { reason } = req.body;
        const userId = req.user.user_id;

        if (!reason || reason.trim().length < 10) {
            return res.status(400).json({ error: 'A valid, detailed clinical reason is required (min 10 chars).' });
        }

        // Grant access for 2 hours
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 2);

        await db.query(`
            INSERT INTO emergency_access_logs (user_id, reason, expires_at)
            VALUES ($1, $2, $3)
        `, [userId, reason, expiresAt]);

        // In a real app, you might query which specific elevated permissions to grant.
        // For simplicity, we grant an array of critical permissions.
        const elevatedPermissions = ['VIEW_PATIENTS', 'EDIT_PATIENTS', 'VIEW_EXAMS'];

        // Issue a temporary elevated token
        const { iat, exp, nbf, jti, ...cleanUser } = req.user || {};
        const payload = {
            ...cleanUser,
            elevatedPermissions,
            breakGlassExpiry: expiresAt.getTime()
        };

        const elevatedToken = jwt.sign(payload, getJwtSecret(), { expiresIn: '2h' });

        res.json({
            message: 'Emergency access granted for 2 hours.',
            token: elevatedToken,
            elevatedPermissions,
            expiresAt
        });
    } catch (error) {
        next(error);
    }
};

const SYSTEM_DEFAULTS = {
    Developer: '*',
    Admin: '*',
    Radiologist: [
        'VIEW_PATIENTS',
        'VIEW_EXAMS',
        'WRITE_REPORTS',
        'FINALIZE_REPORTS',
        'AMEND_REPORTS',
        'VIEW_REPORTS',
        'IMPROVE_REPORT_FORMAT',
        'MANAGE_SAFETY',
        'REVIEW_REPORTS',
        'DELIVER_RESULTS',
        'VIEW_ANALYTICS',
        'AMEND_DIAGNOSTIC_REPORTS',
        'ARCHIVE_STUDIES',
        'MANAGE_QUEUE',
        'VIEW_PACS_IMAGES',
        'RECONCILE_STUDIES'
    ],
    Receptionist: [
        'VIEW_PATIENTS',
        'CREATE_PATIENTS',
        'EDIT_PATIENTS',
        'VIEW_APPOINTMENTS',
        'CREATE_APPOINTMENTS',
        'EDIT_APPOINTMENTS',
        'MANAGE_WAITLIST',
        'VIEW_INSURANCE',
        'MANAGE_INSURANCE_APPROVALS',
        'VIEW_REFERRING_DOCTORS',
        'MANAGE_REFERRING_DOCTORS',
        'VIEW_MARKETING',
        'VIEW_INVOICES',
        'CREATE_INVOICES',
        'PROCESS_PAYMENTS',
        'OPEN_CASHIER_SHIFT',
        'CLOSE_CASHIER_SHIFT',
        'REQUEST_REFUNDS',
        'PROCESS_REFUNDS',
        'CONSUME_INVENTORY',
        'VIEW_REPORTS',
        'MANAGE_QUEUE',
        'CREATE_PRIVACY_REQUESTS',
        'MANAGE_CONSENTS',
        'MANAGE_DOWNTIME'
    ],
    Cashier: [
        'VIEW_INVOICES',
        'CREATE_INVOICES',
        'PROCESS_PAYMENTS',
        'OPEN_CASHIER_SHIFT',
        'CLOSE_CASHIER_SHIFT',
        'REQUEST_REFUNDS',
        'PROCESS_REFUNDS',
        'CONSUME_INVENTORY'
    ],
    Technician: [
        'VIEW_PATIENTS',
        'VIEW_EXAMS',
        'PERFORM_EXAMS',
        'MANAGE_SAFETY',
        'VIEW_EQUIPMENT',
        'MANAGE_MAINTENANCE',
        'MANAGE_DOWNTIME',
        'VIEW_INVENTORY',
        'CONSUME_INVENTORY',
        'VIEW_REPORTS',
        'MANAGE_QUEUE',
        'VIEW_PACS_IMAGES',
        'RECONCILE_STUDIES'
    ],
    Nurse: [
        'VIEW_PATIENTS',
        'EDIT_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_EXAMS',
        'MANAGE_SAFETY',
        'DELIVER_RESULTS',
        'VIEW_INVENTORY',
        'CONSUME_INVENTORY',
        'OVERRIDE_SAFETY_CHECKLIST',
        'VIEW_REPORTS',
        'MANAGE_QUEUE'
    ],
    Accountant: [
        'VIEW_INVOICES',
        'CREATE_INVOICES',
        'EDIT_INVOICES',
        'PROCESS_PAYMENTS',
        'ISSUE_REFUNDS',
        'REQUEST_REFUNDS',
        'PROCESS_REFUNDS',
        'VIEW_INSURANCE',
        'MANAGE_INSURANCE_PROVIDERS',
        'MANAGE_INSURANCE_CONTRACTS',
        'MANAGE_INSURANCE_APPROVALS',
        'MANAGE_INSURANCE_CLAIMS',
        'VIEW_FINANCIALS',
        'MANAGE_EXPENSES',
        'MANAGE_COMMISSIONS',
        'MANAGE_RECEIVABLES',
        'CLOSE_FINANCIAL_PERIODS',
        'VIEW_ANALYTICS',
        'EXPORT_ANALYTICS',
        'VIEW_REFERRING_DOCTORS',
        'VIEW_INVENTORY',
        'MANAGE_PURCHASE_ORDERS',
        'MANAGE_SUPPLIERS',
        'RECONCILE_SHIFTS',
        'APPROVE_SHIFT_VARIANCE',
        'VOID_INVOICES',
        'APPROVE_REFUNDS',
        'VIEW_AUDIT_TRAILS',
        'MANAGE_QUEUE'
    ],
    Insurance_Staff: [
        'VIEW_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_INVOICES',
        'VIEW_INSURANCE',
        'MANAGE_INSURANCE_PROVIDERS',
        'MANAGE_INSURANCE_CONTRACTS',
        'MANAGE_INSURANCE_APPROVALS',
        'MANAGE_INSURANCE_CLAIMS',
        'MANAGE_RECEIVABLES',
        'VIEW_ANALYTICS'
    ],
    HR: [
        'VIEW_STAFF',
        'MANAGE_STAFF',
        'MANAGE_SHIFTS',
        'MANAGE_LEAVE',
        'VIEW_ANALYTICS'
    ],
    Marketing: [
        'VIEW_MARKETING',
        'MANAGE_MARKETING',
        'VIEW_CRM',
        'MANAGE_CRM',
        'VIEW_ANALYTICS',
        'EXPORT_ANALYTICS',
        'VIEW_REFERRING_DOCTORS',
        'MANAGE_REFERRING_DOCTORS'
    ],
    Referring_Doctor: [
        'VIEW_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_EXAMS',
        'VIEW_REPORTS'
    ]
};

const resetRolePermissions = (db) => async (req, res, next) => {
    let client;
    try {
        const { role } = req.params;
        assertCanManageRole(req.user, role);

        const defaults = SYSTEM_DEFAULTS[role];
        if (!defaults) {
            return next(new AppError(`Unknown system role: ${role}`, 400));
        }

        client = await db.connect();
        await client.query('BEGIN');

        // Delete existing permissions for the role
        await client.query('DELETE FROM role_permissions WHERE role_name = $1', [role]);

        // Insert default permissions
        if (defaults === '*') {
            const permissionFilter = role === 'Admin' ? 'WHERE name <> ALL($2::text[])' : '';
            const params = role === 'Admin' ? [role, DEVELOPER_ONLY_PERMISSIONS] : [role];
            await client.query(`
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT $1, permission_id
                FROM permissions
                ${permissionFilter}
            `, params);
        } else if (defaults.length > 0) {
            await client.query(`
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT $1, permission_id 
                FROM permissions
                WHERE name = ANY($2::text[])
            `, [role, defaults]);
        }

        await client.query('COMMIT');

        // Refresh memory cache
        await refreshPermissionCache(db);

        await logAction(db, {
            userId: req.user?.user_id || req.user?.userId,
            action: 'ROLE_PERMISSIONS_RESET',
            resourceTable: 'role_permissions',
            ipAddress: req.ip,
            details: {
                role,
                actorRole: req.user?.role,
                protectedRole: isProtectedRole(role),
                permissions: defaults === '*' ? 'system_generated' : defaults
            }
        });

        res.json({ message: `Permissions for ${role} reset to system defaults successfully`, role });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const cloneRolePermissions = (db) => async (req, res, next) => {
    let client;
    try {
        const { role: targetRole } = req.params;
        const { sourceRole } = req.body;

        assertCanManageRole(req.user, targetRole);
        if (!sourceRole) {
            return next(new AppError('sourceRole is required', 400));
        }
        if (isProtectedRole(sourceRole) && !isDeveloper(req.user)) {
            return next(new AppError('Only a Developer may clone from protected roles', 403));
        }
        if (sourceRole === 'Developer' && targetRole !== 'Developer') {
            return next(new AppError('Developer permissions cannot be cloned to another role', 403));
        }

        const rolesResult = await db.query(`
            SELECT unnest(enum_range(NULL::user_role))::text AS role_name
        `);
        const roles = rolesResult.rows.map(r => r.role_name);

        if (!roles.includes(targetRole)) {
            return next(new AppError(`Unknown target role: ${targetRole}`, 400));
        }
        if (!roles.includes(sourceRole)) {
            return next(new AppError(`Unknown source role: ${sourceRole}`, 400));
        }

        client = await db.connect();
        await client.query('BEGIN');

        // Delete target role's permissions
        await client.query('DELETE FROM role_permissions WHERE role_name = $1', [targetRole]);

        if (targetRole === 'Developer') {
            await grantDeveloperPermissions(client);
        } else {
            // Copy from source role, excluding technical permissions reserved for Developer.
            await client.query(`
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT $1, rp.permission_id
                FROM role_permissions rp
                JOIN permissions p ON p.permission_id = rp.permission_id
                WHERE rp.role_name = $2
                  AND p.name <> ALL($3::text[])
            `, [targetRole, sourceRole, DEVELOPER_ONLY_PERMISSIONS]);
        }

        await client.query('COMMIT');

        // Refresh cache
        await refreshPermissionCache(db);

        await logAction(db, {
            userId: req.user?.user_id || req.user?.userId,
            action: 'ROLE_PERMISSIONS_CLONED',
            resourceTable: 'role_permissions',
            ipAddress: req.ip,
            details: {
                targetRole,
                sourceRole,
                actorRole: req.user?.role,
                protectedRole: isProtectedRole(targetRole) || isProtectedRole(sourceRole)
            }
        });

        res.json({ message: `Cloned permissions from ${sourceRole} to ${targetRole} successfully`, targetRole, sourceRole });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getRbacAuditLogs = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT sl.log_id, sl.timestamp, sl.action, sl.details, u.full_name AS username
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.user_id
            WHERE sl.action IN ('ROLE_PERMISSIONS_UPDATED', 'ROLE_PERMISSIONS_RESET', 'ROLE_PERMISSIONS_CLONED')
               OR sl.action = 'EMERGENCY_ACCESS_GRANTED'
            ORDER BY sl.timestamp DESC
            LIMIT 30
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getUserPermissions = (db) => async (req, res, next) => {
    try {
        const { role } = req.user;
        if (role === 'Developer') {
            const result = await db.query('SELECT name FROM permissions ORDER BY name');
            return res.json({ permissions: result.rows.map(row => row.name) });
        }
        const query = `
            SELECT p.name
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.permission_id
            WHERE rp.role_name = $1
        `;
        const result = await db.query(query, [role]);
        const permissions = result.rows.map(row => row.name);
        res.json({ permissions });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllPermissions,
    getRolePermissions,
    updateRolePermissions,
    requestBreakGlass,
    getUserPermissions,
    resetRolePermissions,
    cloneRolePermissions,
    getRbacAuditLogs
};
