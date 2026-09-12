const { refreshPermissionCache } = require('../middleware/rbacMiddleware');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../middleware/authMiddleware');
const { AppError } = require('../middleware/errorHandler');
const { encrypt } = require('../utils/crypto');
const { logAction } = require('../services/auditService');
const { broadcastToStaff } = require('../services/realtimeService');
const {
    AUDIT_CATEGORY,
    AUDIT_SEVERITY,
    AUDIT_OUTCOME,
    AUDIT_EVENT_CODES
} = require('../services/auditTaxonomy');
const { triggerEvent, triggerEventForRole } = require('../services/notificationJobService');
const {
    EMERGENCY_ACCESS_PERMISSIONS,
    getEmergencyAccessDurationMinutes,
    stripEmergencyClaims,
    findActiveEmergencyGrant
} = require('../services/emergencyAccessService');
const { grantDeveloperPermissions } = require('../services/developerSeedService');
const {
    assertCanManageRole,
    assertCanManageRolePermissions,
    isDeveloper,
    isProtectedRole,
    isPortalRole
} = require('../utils/roleGovernance');

/**
 * Announce a policy change so connected staff clients re-sync their effective
 * permissions immediately (instead of waiting for the next login).
 */
const announcePermissionsChanged = (role) => {
    try {
        broadcastToStaff('PERMISSIONS_CHANGED', { role: String(role || '') });
    } catch (_error) {
        // Realtime is best-effort; the DB remains the source of truth.
    }
};

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

const signAccessToken = (user, extraClaims = {}, expiresIn = process.env.JWT_EXPIRY || '1h') => jwt.sign(
    { ...stripEmergencyClaims(user), ...extraClaims },
    getJwtSecret(),
    { expiresIn }
);

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

        assertCanManageRolePermissions(req.user, role);
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
        announcePermissionsChanged(role);

        res.json({ message: 'Permissions updated successfully', role, permissionCount: uniquePermissionIds.length });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const requestBreakGlass = (db) => async (req, res, next) => {
    let client;
    try {
        const { reason, currentPassword } = req.body;
        const userId = req.user.user_id || req.user.userId;
        const sessionId = req.user.session_id || null;

        const userResult = await db.query(`
            SELECT user_id, full_name, role, password_hash, is_active
            FROM users
            WHERE user_id = $1
            LIMIT 1
        `, [userId]);
        const account = userResult.rows[0];
        const passwordValid = Boolean(
            account?.is_active
            && account.password_hash
            && await bcrypt.compare(currentPassword, account.password_hash)
        );
        if (!passwordValid) {
            await logAction(db, {
                userId,
                action: 'EMERGENCY_ACCESS_DENIED',
                eventCode: AUDIT_EVENT_CODES.RBAC_EMERGENCY_ACCESS_DENIED,
                resourceTable: 'emergency_access_logs',
                category: AUDIT_CATEGORY.RBAC,
                severity: AUDIT_SEVERITY.CRITICAL,
                outcome: AUDIT_OUTCOME.DENIED,
                actorRole: req.user.role,
                sessionId,
                ipAddress: req.ip,
                userAgent: req.get?.('user-agent') || null,
                httpMethod: req.method,
                requestPath: req.originalUrl,
                riskScore: 85,
                riskReason: 'Emergency access re-authentication failed',
                details: { denialCode: 'BREAK_GLASS_REAUTH_FAILED' }
            });
            return res.status(401).json({
                error: 'Current password verification failed',
                code: 'BREAK_GLASS_REAUTH_FAILED'
            });
        }

        const currentGrant = await findActiveEmergencyGrant(db, { userId, sessionId });
        if (currentGrant) {
            return res.status(409).json({
                error: 'Emergency access is already active for this session',
                code: 'BREAK_GLASS_ALREADY_ACTIVE',
                grantId: currentGrant.grant_id,
                permissions: currentGrant.permissions,
                expiresAt: currentGrant.expires_at
            });
        }

        const durationMinutes = getEmergencyAccessDurationMinutes();
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
        const permissions = [...EMERGENCY_ACCESS_PERMISSIONS];

        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
        const concurrentGrant = await findActiveEmergencyGrant(client, { userId, sessionId });
        if (concurrentGrant) {
            await client.query('ROLLBACK');
            client.release();
            client = null;
            return res.status(409).json({
                error: 'Emergency access is already active for this session',
                code: 'BREAK_GLASS_ALREADY_ACTIVE',
                grantId: concurrentGrant.grant_id,
                permissions: concurrentGrant.permissions,
                expiresAt: concurrentGrant.expires_at
            });
        }
        const grantResult = await client.query(`
            INSERT INTO emergency_access_logs (
                user_id, reason, reason_enc, expires_at, permissions, session_id,
                ip_address, user_agent, status
            )
            VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, 'Active')
            RETURNING grant_id, granted_at, expires_at
        `, [
            userId,
            'Encrypted clinical justification',
            encrypt(reason),
            expiresAt,
            permissions,
            sessionId,
            req.ip || null,
            req.get?.('user-agent') || null
        ]);
        const grant = grantResult.rows[0];

        await logAction(client, {
            required: true,
            userId,
            action: 'EMERGENCY_ACCESS_GRANTED',
            eventCode: AUDIT_EVENT_CODES.RBAC_EMERGENCY_ACCESS_GRANTED,
            resourceId: grant.grant_id,
            resourceTable: 'emergency_access_logs',
            category: AUDIT_CATEGORY.RBAC,
            severity: AUDIT_SEVERITY.CRITICAL,
            outcome: AUDIT_OUTCOME.SUCCESS,
            actorRole: req.user.role,
            sessionId,
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null,
            httpMethod: req.method,
            requestPath: req.originalUrl,
            riskScore: 90,
            riskReason: 'Emergency clinical access elevation',
            details: {
                grantId: grant.grant_id,
                permissions,
                expiresAt: grant.expires_at,
                durationMinutes
            }
        });
        await client.query('COMMIT');

        const originalTtlSeconds = req.user.exp
            ? Math.max(1, req.user.exp - Math.floor(Date.now() / 1000))
            : durationMinutes * 60;
        const tokenTtlSeconds = Math.min(durationMinutes * 60, originalTtlSeconds);
        const token = signAccessToken(req.user, {
            emergencyAccessId: grant.grant_id,
            elevatedPermissions: permissions,
            breakGlassExpiry: new Date(grant.expires_at).getTime()
        }, tokenTtlSeconds);

        const notificationPayload = {
            entityType: 'EmergencyAccess',
            entityId: grant.grant_id,
            priority: 'Critical',
            variables: {
                actor_name: account.full_name,
                actor_role: account.role,
                grant_id: grant.grant_id,
                expires_at: new Date(grant.expires_at).toISOString()
            }
        };
        Promise.all([
            triggerEventForRole(db, 'EmergencyAccessGranted', 'Admin', notificationPayload),
            triggerEventForRole(db, 'EmergencyAccessGranted', 'Developer', notificationPayload)
        ]).catch(() => {});

        res.json({
            message: `Emergency access granted for ${durationMinutes} minutes.`,
            token,
            grantId: grant.grant_id,
            elevatedPermissions: permissions,
            expiresAt: grant.expires_at,
            durationMinutes
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getBreakGlassStatus = (db) => async (req, res, next) => {
    try {
        const grant = await findActiveEmergencyGrant(db, {
            userId: req.user.user_id || req.user.userId,
            sessionId: req.user.session_id || null
        });
        res.json({
            active: Boolean(grant),
            grantId: grant?.grant_id || null,
            permissions: grant?.permissions || [],
            grantedAt: grant?.granted_at || null,
            expiresAt: grant?.expires_at || null
        });
    } catch (error) {
        next(error);
    }
};

const listActiveBreakGlassGrants = (db) => async (req, res, next) => {
    try {
        await db.query(`
            UPDATE emergency_access_logs
            SET status = 'Expired'
            WHERE status = 'Active' AND expires_at <= NOW()
        `);
        const result = await db.query(`
            SELECT e.grant_id, e.user_id, u.full_name, u.role, e.permissions,
                   e.granted_at, e.expires_at, e.ip_address
            FROM emergency_access_logs e
            JOIN users u ON u.user_id = e.user_id
            WHERE e.status = 'Active' AND e.expires_at > NOW()
            ORDER BY e.granted_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const revokeBreakGlass = (db, { administrative = false } = {}) => async (req, res, next) => {
    let client;
    try {
        const actorId = req.user.user_id || req.user.userId;
        const activeSelfGrant = administrative ? null : await findActiveEmergencyGrant(db, {
            userId: actorId,
            sessionId: req.user.session_id || null
        });
        const grantId = administrative ? req.params.grantId : (req.user.emergencyAccessId || activeSelfGrant?.grant_id);
        if (!grantId) {
            return res.status(404).json({ error: 'No active emergency access grant was found' });
        }

        client = await db.connect();
        await client.query('BEGIN');
        const params = [grantId, actorId];
        const ownershipClause = administrative ? '' : 'AND user_id = $2';
        const result = await client.query(`
            UPDATE emergency_access_logs
            SET status = 'Revoked', revoked_at = NOW(), revoked_by = $2,
                revoke_reason = 'Encrypted revocation justification', revoke_reason_enc = $3
            WHERE grant_id = $1
              ${ownershipClause}
              AND status = 'Active'
            RETURNING grant_id, user_id, permissions, expires_at, revoked_at
        `, [params[0], params[1], encrypt(req.body.reason)]);
        const grant = result.rows[0];
        if (!grant) {
            await client.query('ROLLBACK');
            client.release();
            client = null;
            return res.status(404).json({ error: 'Active emergency access grant was not found' });
        }

        await logAction(client, {
            required: true,
            userId: actorId,
            action: 'EMERGENCY_ACCESS_REVOKED',
            eventCode: AUDIT_EVENT_CODES.RBAC_EMERGENCY_ACCESS_REVOKED,
            resourceId: grant.grant_id,
            resourceTable: 'emergency_access_logs',
            category: AUDIT_CATEGORY.RBAC,
            severity: AUDIT_SEVERITY.CRITICAL,
            outcome: AUDIT_OUTCOME.SUCCESS,
            actorRole: req.user.role,
            sessionId: req.user.session_id || null,
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null,
            httpMethod: req.method,
            requestPath: req.originalUrl,
            riskScore: 80,
            riskReason: administrative ? 'Emergency access administratively revoked' : 'Emergency access self-revoked',
            details: {
                grantId: grant.grant_id,
                subjectUserId: grant.user_id,
                administrative,
                revokedAt: grant.revoked_at
            }
        });
        await client.query('COMMIT');

        // Notify the affected clinician (their elevation just disappeared) and
        // the security governance roles. Fire-and-forget, like the grant flow.
        try {
            const subjectResult = await db.query(
                'SELECT full_name, role FROM users WHERE user_id = $1 LIMIT 1',
                [grant.user_id]
            );
            const subjectName = subjectResult.rows[0]?.full_name || 'Unknown user';
            const subjectRole = subjectResult.rows[0]?.role || 'Staff';
            const revokePayload = {
                entityType: 'EmergencyAccess',
                entityId: grant.grant_id,
                priority: 'Critical',
                variables: {
                    actor_name: req.user.full_name || subjectName,
                    grant_id: grant.grant_id,
                    administrative: administrative ? 'yes' : 'no'
                }
            };
            Promise.all([
                triggerEvent(db, 'EmergencyAccessRevoked', {
                    ...revokePayload,
                    staffId: grant.user_id,
                    staffRole: subjectRole
                }),
                triggerEventForRole(db, 'EmergencyAccessRevoked', 'Admin', revokePayload),
                triggerEventForRole(db, 'EmergencyAccessRevoked', 'Developer', revokePayload)
            ]).catch(() => {});
        } catch {
            // Notification fan-out must never fail the revocation itself.
        }

        // The replacement token must never outlive the original session: cap its
        // TTL to the remaining lifetime of the token used to make this request,
        // mirroring the TTL capping applied when the grant was requested.
        const remainingTtlSeconds = req.user.exp
            ? Math.max(1, req.user.exp - Math.floor(Date.now() / 1000))
            : null;
        res.json({
            message: 'Emergency access revoked successfully',
            grantId: grant.grant_id,
            token: administrative ? undefined : signAccessToken(
                req.user,
                {},
                remainingTtlSeconds || (process.env.JWT_EXPIRY || '1h')
            )
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        next(error);
    } finally {
        if (client) client.release();
    }
};

// System default grants per role. Kept as the UNION of the original defaults
// and migration 160 (fix_operational_role_permissions) so "reset to defaults"
// can never silently revoke the baseline operational grants — the exact drift
// that previously caused page-visible 403s after a reset.
const SYSTEM_DEFAULTS = {
    Developer: '*',
    Admin: '*',
    Radiologist: [
        'VIEW_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_EXAMS',
        'PERFORM_EXAMS',
        'WRITE_REPORTS',
        'REVIEW_REPORTS',
        'FINALIZE_REPORTS',
        'AMEND_REPORTS',
        'VIEW_REPORTS',
        'DELIVER_RESULTS',
        'IMPROVE_REPORT_FORMAT',
        'MANAGE_QUEUE',
        'MANAGE_SAFETY',
        'ASSIGN_CLINICAL_TASKS',
        'VIEW_PACS_IMAGES',
        'RECONCILE_STUDIES',
        'DOWNLOAD_PACS_DICOM',
        'VIEW_ANALYTICS',
        'MANAGE_CHAT'
    ],
    Receptionist: [
        'VIEW_PATIENTS',
        'CREATE_PATIENTS',
        'EDIT_PATIENTS',
        'VIEW_APPOINTMENTS',
        'CREATE_APPOINTMENTS',
        'EDIT_APPOINTMENTS',
        'DELETE_APPOINTMENTS',
        'MANAGE_WAITLIST',
        'VIEW_EXAMS',
        'MANAGE_QUEUE',
        'VIEW_INVOICES',
        'CREATE_INVOICES',
        'EDIT_INVOICES',
        'PROCESS_PAYMENTS',
        'OPEN_CASHIER_SHIFT',
        'CLOSE_CASHIER_SHIFT',
        'REQUEST_REFUNDS',
        'PROCESS_REFUNDS',
        'APPLY_DISCOUNTS',
        'DELIVER_FINAL_REPORT_INVOICE',
        'APPLY_PARTIAL_PAYMENT_EXCEPTION',
        'VIEW_INSURANCE',
        'MANAGE_INSURANCE_APPROVALS',
        'VIEW_REPORTS',
        'DELIVER_RESULTS',
        'CONSUME_INVENTORY',
        'MANAGE_DOWNTIME',
        'VIEW_MARKETING',
        'VIEW_REFERRING_DOCTORS',
        'MANAGE_REFERRING_DOCTORS',
        'CREATE_PRIVACY_REQUESTS',
        'MANAGE_CONSENTS',
        'MANAGE_CHAT'
    ],
    Cashier: [
        'VIEW_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_EXAMS',
        'VIEW_INVOICES',
        'CREATE_INVOICES',
        'EDIT_INVOICES',
        'PROCESS_PAYMENTS',
        'OPEN_CASHIER_SHIFT',
        'CLOSE_CASHIER_SHIFT',
        'REQUEST_REFUNDS',
        'PROCESS_REFUNDS',
        'APPLY_DISCOUNTS',
        'DELIVER_FINAL_REPORT_INVOICE',
        'VIEW_INSURANCE',
        'CONSUME_INVENTORY',
        'MANAGE_CHAT'
    ],
    Technician: [
        'VIEW_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_EXAMS',
        'PERFORM_EXAMS',
        'VIEW_REPORTS',
        'MANAGE_QUEUE',
        'MANAGE_SAFETY',
        'VIEW_EQUIPMENT',
        'MANAGE_MAINTENANCE',
        'MANAGE_DOWNTIME',
        'VIEW_INVENTORY',
        'CONSUME_INVENTORY',
        'VIEW_PACS_IMAGES',
        'RECONCILE_STUDIES',
        'DOWNLOAD_PACS_DICOM',
        'UPLOAD_PACS_STUDIES',
        'MANAGE_CHAT'
    ],
    Nurse: [
        'VIEW_PATIENTS',
        'EDIT_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_EXAMS',
        'VIEW_REPORTS',
        'DELIVER_RESULTS',
        'MANAGE_QUEUE',
        'MANAGE_SAFETY',
        'OVERRIDE_SAFETY_CHECKLIST',
        'VIEW_PACS_IMAGES',
        'VIEW_INVENTORY',
        'CONSUME_INVENTORY',
        'MANAGE_CHAT'
    ],
    Accountant: [
        'VIEW_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_EXAMS',
        'VIEW_INVOICES',
        'CREATE_INVOICES',
        'EDIT_INVOICES',
        'DELETE_INVOICES',
        'PROCESS_PAYMENTS',
        'RECONCILE_SHIFTS',
        'APPROVE_SHIFT_VARIANCE',
        'REQUEST_REFUNDS',
        'PROCESS_REFUNDS',
        'APPROVE_REFUNDS',
        'APPLY_DISCOUNTS',
        'OVERRIDE_PRICING',
        'VOID_INVOICES',
        'VIEW_INSURANCE',
        'MANAGE_INSURANCE_PROVIDERS',
        'MANAGE_INSURANCE_CONTRACTS',
        'MANAGE_INSURANCE_APPROVALS',
        'MANAGE_INSURANCE_CLAIMS',
        'SUBMIT_INSURANCE_CLAIMS',
        'RECONCILE_INSURANCE_CLAIMS',
        'VIEW_FINANCIALS',
        'MANAGE_EXPENSES',
        'MANAGE_COMMISSIONS',
        'PAY_COMMISSIONS',
        'MANAGE_RECEIVABLES',
        'CLOSE_FINANCIAL_PERIODS',
        'POST_PAYROLL_TO_FINANCE',
        'VIEW_INVENTORY',
        'MANAGE_PURCHASE_ORDERS',
        'MANAGE_SUPPLIERS',
        'VIEW_PAYROLL',
        'APPROVE_PAYROLL',
        'PAY_PAYROLL',
        'EXPORT_PAYROLL',
        'VIEW_REFERRING_DOCTORS',
        'VIEW_ANALYTICS',
        'EXPORT_ANALYTICS',
        'VIEW_AUDIT_TRAILS',
        'MANAGE_CHAT'
    ],
    Insurance_Staff: [
        'VIEW_PATIENTS',
        'VIEW_APPOINTMENTS',
        'VIEW_EXAMS',
        'VIEW_INVOICES',
        'VIEW_INSURANCE',
        'MANAGE_INSURANCE_PROVIDERS',
        'MANAGE_INSURANCE_CONTRACTS',
        'MANAGE_INSURANCE_APPROVALS',
        'MANAGE_INSURANCE_CLAIMS',
        'SUBMIT_INSURANCE_CLAIMS',
        'RECONCILE_INSURANCE_CLAIMS',
        'MANAGE_RECEIVABLES',
        'VIEW_ANALYTICS',
        'MANAGE_CHAT'
    ],
    HR: [
        'VIEW_STAFF',
        'MANAGE_STAFF',
        'MANAGE_SHIFTS',
        'MANAGE_LEAVE',
        'MANAGE_ATTENDANCE',
        'VIEW_USERS',
        'VIEW_PAYROLL',
        'MANAGE_PAYROLL_PERIODS',
        'CALCULATE_PAYROLL',
        'REVIEW_PAYROLL',
        'MANAGE_PAYROLL_RULES',
        'MANAGE_EMPLOYEE_COMPENSATION',
        'MANAGE_DEDUCTIONS',
        'MANAGE_PENALTIES',
        'EXPORT_PAYROLL',
        'VIEW_ANALYTICS',
        'MANAGE_CHAT'
    ],
    Marketing: [
        'VIEW_PATIENTS',
        'VIEW_MARKETING',
        'MANAGE_MARKETING',
        'VIEW_CRM',
        'MANAGE_CRM',
        'VIEW_REFERRING_DOCTORS',
        'MANAGE_REFERRING_DOCTORS',
        'VIEW_REFERRAL_ANALYTICS',
        'VIEW_ANALYTICS',
        'EXPORT_ANALYTICS',
        'MANAGE_CHAT'
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
        assertCanManageRolePermissions(req.user, role);

        const defaults = SYSTEM_DEFAULTS[role];
        if (!defaults) {
            return next(new AppError(`Unknown system role: ${role}`, 400));
        }

        // Resolve the target grant set (by name) before opening the transaction.
        let targetIds = [];
        if (defaults === '*') {
            const filter = role === 'Admin'
                ? 'WHERE name <> ALL($1::text[])'
                : '';
            const params = role === 'Admin' ? [DEVELOPER_ONLY_PERMISSIONS] : [];
            const result = await db.query(`SELECT permission_id::text AS permission_id FROM permissions ${filter}`, params);
            targetIds = result.rows.map((row) => row.permission_id);
        } else {
            const result = await db.query('SELECT permission_id::text AS permission_id FROM permissions WHERE name = ANY($1::text[])', [defaults]);
            targetIds = result.rows.map((row) => row.permission_id);
        }

        const beforeResult = await db.query(
            'SELECT permission_id::text AS permission_id FROM role_permissions WHERE role_name = $1',
            [role]
        );
        const beforeIds = beforeResult.rows.map((row) => row.permission_id);
        const addedIds = targetIds.filter((id) => !beforeIds.includes(id));
        const removedIds = beforeIds.filter((id) => !targetIds.includes(id));

        // Resolve readable names for the audit trail and the response diff.
        let nameById = {};
        const diffIds = [...addedIds, ...removedIds];
        if (diffIds.length > 0) {
            const namesResult = await db.query('SELECT permission_id::text AS id, name FROM permissions WHERE permission_id = ANY($1::uuid[])', [diffIds]);
            nameById = Object.fromEntries(namesResult.rows.map((row) => [row.id, row.name]));
        }
        const addedNames = addedIds.map((id) => nameById[id] || id);
        const removedNames = removedIds.map((id) => nameById[id] || id);

        client = await db.connect();
        await client.query('BEGIN');

        // Delete existing permissions for the role
        await client.query('DELETE FROM role_permissions WHERE role_name = $1', [role]);

        // Insert default permissions
        if (targetIds.length > 0) {
            await client.query(`
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT $1, permission_id
                FROM permissions
                WHERE permission_id = ANY($2::uuid[])
            `, [role, targetIds]);
        }

        // Audit INSIDE the transaction with the full diff (added + removed),
        // mirroring updateRolePermissions — a reset must never apply silently.
        await logAction(client, {
            userId: req.user?.user_id || req.user?.userId,
            action: 'ROLE_PERMISSIONS_RESET',
            resourceTable: 'role_permissions',
            ipAddress: req.ip,
            details: {
                role,
                actorRole: req.user?.role,
                protectedRole: isProtectedRole(role),
                portalRole: isPortalRole(role),
                added: addedIds,
                removed: removedIds,
                permissionCount: targetIds.length,
                userAgent: req.get?.('user-agent') || null
            }
        });

        await client.query('COMMIT');

        // Refresh memory cache and notify connected clients
        await refreshPermissionCache(db);
        announcePermissionsChanged(role);

        res.json({
            message: `Permissions for ${role} reset to system defaults successfully`,
            role,
            permissionCount: targetIds.length,
            added: addedNames,
            removed: removedNames
        });
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

        assertCanManageRolePermissions(req.user, targetRole);
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
                JOIN permissions p ON rp.permission_id = p.permission_id
                WHERE rp.role_name = $2
                  AND p.name <> ALL($3::text[])
            `, [targetRole, sourceRole, DEVELOPER_ONLY_PERMISSIONS]);
        }

        // Audit INSIDE the transaction (mirrors updateRolePermissions).
        await logAction(client, {
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

        await client.query('COMMIT');

        // Refresh cache and notify connected clients
        await refreshPermissionCache(db);
        announcePermissionsChanged(targetRole);

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
        const { role, action, actor, before } = req.query || {};
        const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 30));

        const conditions = [
            `sl.action IN (
                'ROLE_PERMISSIONS_UPDATED', 'ROLE_PERMISSIONS_RESET', 'ROLE_PERMISSIONS_CLONED',
                'EMERGENCY_ACCESS_GRANTED', 'EMERGENCY_ACCESS_REVOKED', 'EMERGENCY_ACCESS_DENIED'
            )`
        ];
        const params = [];
        if (role) {
            params.push(String(role));
            conditions.push(`sl.details->>'role' = $${params.length}`);
        }
        if (action) {
            params.push(String(action));
            conditions.push(`sl.action = $${params.length}`);
        }
        if (actor) {
            params.push(`%${String(actor)}%`);
            conditions.push(`u.full_name ILIKE $${params.length}`);
        }
        if (before) {
            params.push(String(before));
            conditions.push(`sl.timestamp < $${params.length}::timestamptz`);
        }

        const listResult = await db.query(`
            SELECT sl.log_id, sl.timestamp, sl.action, sl.details, u.full_name AS username
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.user_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY sl.timestamp DESC
            LIMIT $${params.length + 1}
        `, [...params, limit + 1]);

        const hasMore = listResult.rows.length > limit;
        const rows = listResult.rows.slice(0, limit);

        // Resolve permission UUIDs inside the stored diffs to readable names so
        // the audit trail answers "what exactly changed" without extra lookups.
        const idSet = new Set();
        rows.forEach((row) => {
            (row.details?.added || []).forEach((id) => idSet.add(id));
            (row.details?.removed || []).forEach((id) => idSet.add(id));
        });
        if (idSet.size > 0) {
            const namesResult = await db.query(
                'SELECT permission_id::text AS id, name FROM permissions WHERE permission_id = ANY($1::uuid[])',
                [Array.from(idSet)]
            );
            const nameById = Object.fromEntries(namesResult.rows.map((row) => [row.id, row.name]));
            rows.forEach((row) => {
                if (row.details) {
                    row.details.addedNames = (row.details.added || []).map((id) => nameById[id] || id);
                    row.details.removedNames = (row.details.removed || []).map((id) => nameById[id] || id);
                }
            });
        }

        res.json({
            logs: rows,
            hasMore,
            nextCursor: hasMore && rows.length > 0 ? rows[rows.length - 1].timestamp : null
        });
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
    getBreakGlassStatus,
    listActiveBreakGlassGrants,
    revokeBreakGlass,
    getUserPermissions,
    resetRolePermissions,
    cloneRolePermissions,
    getRbacAuditLogs
};
