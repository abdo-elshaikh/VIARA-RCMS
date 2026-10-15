/**
 * branchContextMiddleware.js
 * ---------------------------
 * Server-side branch context enforcement middleware for VIARA RCMS.
 * Validates user membership, injects req.branchContext, and prevents
 * cross-branch leaks (MBT-200, MBT-201, MBT-203, MBT-204, MBT-206).
 */

'use strict';

const { getUserBranches, DEFAULT_HQ_BRANCH_ID } = require('../services/branchService');
const { getRequestQuery } = require('../utils/requestQuery');
const { logSecurityEvent } = require('../services/securityEventService');
const { setBranchContext, clearBranchContext, withBranchTransaction } = require('../utils/branchTransaction');

function attachBranchClientHelpers(req, db) {
    if (!req.branchContext || !db) return;

    req.setClientBranchContext = async (client) => {
        await setBranchContext(client, req);
    };

    req.withBranchClient = async (callback) => {
        return withBranchTransaction(db, req, callback);
    };

    req.withBranchTransaction = req.withBranchClient;
}

/**
 * Middleware factory requiring a verified branch context for the request.
 *
 * @param {object} db - Database pool
 * @param {object} [options]
 * @param {boolean} [options.requireBranch=true] - Whether a specific branch is mandatory
 * @param {boolean} [options.allowAllBranchesForOrgAdmin=false] - Whether org admins may query 'all'
 */
const requireBranchContext = (db, options = {}) => {
    const {
        requireBranch = true,
        allowAllBranchesForOrgAdmin = false
    } = options;

    return async (req, res, next) => {
        try {
            // If request is not authenticated as staff user, pass through
            if (!req.user || !req.user.user_id || ['Patient', 'Doctor'].includes(req.user.role)) {
                return next();
            }

            const proceed = () => {
                attachBranchClientHelpers(req, db);
                req.user.identity_role = req.user.identity_role || req.user.role;
                req.user.role = require('../utils/effectiveRole')(req);
                return next();
            };

            const isOrgAdmin = Boolean(req.user.is_org_admin || req.user.role === 'Developer');
            const query = getRequestQuery(req);
            const rawHeader = req.headers?.['x-branch-id'];
            const requestedBranchId = (
                (rawHeader && String(rawHeader).trim()) ||
                (query.branchId && String(query.branchId).trim()) ||
                (req.body?.branchId && String(req.body.branchId).trim()) ||
                null
            );

            const userBranches = await getUserBranches(
                db,
                req.user.user_id,
                isOrgAdmin,
                req.user.organization_id
            );

            // Case 1: Client explicitly requested 'all' branches
            if (requestedBranchId === 'all' || requestedBranchId === '*') {
                if (isOrgAdmin && allowAllBranchesForOrgAdmin) {
                    req.branchContext = {
                        branchId: null,
                        isAllBranches: true,
                        isOrgAdmin: true,
                        organizationId: req.user.organization_id,
                        branches: userBranches.branches
                    };
                    req.user.branch_id = null;
                    return proceed();
                }

                logSecurityEvent(db, {
                    eventType: 'CROSS_BRANCH_ACCESS_DENIED',
                    severity: 'warning',
                    userId: req.user.user_id,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    details: {
                        reason: 'Querying all branches requires org admin',
                        requestedBranchId,
                        userRole: req.user.role,
                        path: req.originalUrl || req.path
                    }
                }).catch(() => {});

                return res.status(403).json({
                    error: 'Cross-branch access denied. Querying all branches requires organization administrator privileges.',
                    code: 'BRANCH_ACCESS_DENIED'
                });
            }

            // Case 2: Specific branch ID was requested
            if (requestedBranchId) {
                const targetBranch = userBranches.branches.find(b => b.id === requestedBranchId);

                if (!targetBranch) {
                    const hasEmergency = Boolean(
                        req.user?.emergencyAccessId
                        && Array.isArray(req.user?.elevatedPermissions)
                        && Number(req.user?.breakGlassExpiry) > Date.now()
                    );

                    if (hasEmergency) {
                        const grantCheck = await db.query(`
                            SELECT grant_id, user_id, organization_id, target_branch_id, status, expires_at
                            FROM emergency_access_logs
                            WHERE grant_id = $1
                              AND user_id = $2
                              AND status = 'Active'
                              AND expires_at > NOW()
                            LIMIT 1
                        `, [req.user.emergencyAccessId, req.user.user_id]);

                        const emergencyGrant = grantCheck.rows[0];
                        if (emergencyGrant) {
                            const branchRes = await db.query(`
                                SELECT id, name, code, is_main, organization_id, timezone, currency_code
                                FROM branches
                                WHERE id = $1
                            `, [requestedBranchId]);
                            const emergencyBranch = branchRes.rows[0];

                            const isOrgMatch = emergencyBranch && (
                                emergencyGrant.organization_id
                                && emergencyBranch.organization_id === emergencyGrant.organization_id
                                && emergencyBranch.organization_id === req.user.organization_id
                            );
                            const isBranchMatch = isOrgMatch && (
                                !emergencyGrant.target_branch_id
                                || emergencyGrant.target_branch_id === requestedBranchId
                            );

                            if (isBranchMatch) {
                                const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
                                const requestPath = (req.originalUrl || req.path || '').split('?')[0];
                                const isRevokeEndpoint = requestPath === '/api/rbac/break-glass/revoke';
                                const isViewerCredentialEndpoint = req.method === 'POST' &&
                                    ['/api/pacs/viewer-session', '/api/pacs/viewer-renew'].includes(requestPath);

                                if (isMutating && !isRevokeEndpoint && !isViewerCredentialEndpoint) {
                                    logSecurityEvent(db, {
                                        eventType: 'CROSS_BRANCH_ACCESS_DENIED',
                                        severity: 'warning',
                                        userId: req.user.user_id,
                                        ipAddress: req.ip,
                                        userAgent: req.headers['user-agent'],
                                        details: {
                                            reason: 'Emergency cross-branch elevation is strictly read-only',
                                            requestedBranchId,
                                            userRole: req.user.role,
                                            method: req.method,
                                            path: req.originalUrl || req.path
                                        }
                                    }).catch(() => {});

                                    return res.status(403).json({
                                        error: 'Cross-branch mutation denied. Emergency elevation is strictly read-only for clinical viewing and patient care.',
                                        code: 'BRANCH_ACCESS_DENIED'
                                    });
                                }

                                req.branchContext = {
                                    branchId: emergencyBranch.id,
                                    branchCode: emergencyBranch.code,
                                    branchName: emergencyBranch.name,
                                    branchRole: 'EmergencyClinicalViewer',
                                    isMain: emergencyBranch.is_main,
                                    isOrgAdmin: false,
                                    isAllBranches: false,
                                    isEmergency: true,
                                    emergencyAccessId: emergencyGrant.grant_id,
                                    organizationId: emergencyBranch.organization_id || req.user.organization_id,
                                    timezone: emergencyBranch.timezone,
                                    currencyCode: emergencyBranch.currency_code,
                                    branches: userBranches.branches
                                };
                                req.user.branch_id = emergencyBranch.id;

                                logSecurityEvent(db, {
                                    eventType: 'EMERGENCY_CROSS_BRANCH_ACCESS_ACTIVE',
                                    severity: 'info',
                                    userId: req.user.user_id,
                                    ipAddress: req.ip,
                                    userAgent: req.headers['user-agent'],
                                    details: {
                                        grantId: emergencyGrant.grant_id,
                                        branchId: emergencyBranch.id,
                                        branchName: emergencyBranch.name,
                                        path: req.originalUrl || req.path
                                    }
                                }).catch(() => {});

                                return proceed();
                            }
                        }
                    }

                    logSecurityEvent(db, {
                        eventType: 'CROSS_BRANCH_ACCESS_DENIED',
                        severity: 'warning',
                        userId: req.user.user_id,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent'],
                        details: {
                            reason: 'User lacks membership in requested branch',
                            requestedBranchId,
                            userRole: req.user.role,
                            path: req.originalUrl || req.path
                        }
                    }).catch(() => {});

                    return res.status(403).json({
                        error: 'Access denied: You do not have an active membership in the requested branch.',
                        code: 'BRANCH_ACCESS_DENIED'
                    });
                }

                req.branchContext = {
                    branchId: targetBranch.id,
                    branchCode: targetBranch.code,
                    branchName: targetBranch.name,
                    branchRole: targetBranch.branch_role || (isOrgAdmin ? req.user.role : 'Unassigned'),
                    isMain: targetBranch.is_main,
                    isOrgAdmin,
                    isAllBranches: false,
                    organizationId: targetBranch.organization_id || req.user.organization_id,
                    timezone: targetBranch.timezone,
                    currencyCode: targetBranch.currency_code,
                    branches: userBranches.branches
                };
                req.user.branch_id = targetBranch.id;
                return proceed();
            }

            // Case 3: No branch ID provided in header or parameters
            if (userBranches.branches.length === 0) {
                return res.status(403).json({
                    error: 'No active branch memberships assigned to this account. Contact your administrator.',
                    code: 'BRANCH_ACCESS_DENIED'
                });
            }

            // Attempt to resolve default or single branch
            const defaultBranch = (
                userBranches.branches.find(b => b.id === userBranches.defaultBranchId) ||
                (userBranches.branches.length === 1 ? userBranches.branches[0] : null) ||
                (isOrgAdmin ? userBranches.branches.find(b => b.is_main) : null)
            );

            if (defaultBranch) {
                req.branchContext = {
                    branchId: defaultBranch.id,
                    branchCode: defaultBranch.code,
                    branchName: defaultBranch.name,
                    branchRole: defaultBranch.branch_role || (isOrgAdmin ? req.user.role : 'Unassigned'),
                    isMain: defaultBranch.is_main,
                    isOrgAdmin,
                    isAllBranches: false,
                    organizationId: defaultBranch.organization_id || req.user.organization_id,
                    timezone: defaultBranch.timezone,
                    currencyCode: defaultBranch.currency_code,
                    branches: userBranches.branches
                };
                req.user.branch_id = defaultBranch.id;
                return proceed();
            }

            // User has multiple branches with no default set and specific branch is required
            if (requireBranch) {
                return res.status(400).json({
                    error: 'Branch selection required. Please specify a branch via x-branch-id header.',
                    code: 'BRANCH_SELECTION_REQUIRED',
                    branches: userBranches.branches.map(b => ({ id: b.id, name: b.name, code: b.code }))
                });
            }

            // Not strictly required (optional branch scoping)
            req.branchContext = {
                branchId: null,
                isAllBranches: isOrgAdmin,
                isOrgAdmin,
                organizationId: req.user.organization_id,
                branches: userBranches.branches
            };
            return proceed();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = {
    requireBranchContext,
    setBranchContext,
    clearBranchContext,
    withBranchTransaction
};
