/**
 * branchService.js
 * ----------------
 * Unified enterprise branch and membership service for VIARA RCMS.
 * Enforces server-side branch scope, concurrency-safe license quotas,
 * and data isolation (MBT-100, MBT-101, MBT-102, MBT-200, MBT-305, MBT-306).
 */

'use strict';

const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const licenseService = require('./licenseService');

const DEFAULT_HQ_BRANCH_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_ORG_ID = '00000000-0000-4000-8000-000000000000';

function assertBranchLicense(license, orgId) {
    if (!license || license.isExpired) {
        throw new AppError('A valid license is required to activate branches', 403, true, 'LICENSE_EXPIRED');
    }
    if (license.organizationId && license.organizationId !== orgId) {
        throw new AppError('License does not belong to this organization', 403, true, 'LICENSE_ORGANIZATION_MISMATCH');
    }
}

// Authorization reads the authoritative membership on every request. Keep the
// invalidation API for callers; there is no process-local authorization cache.
function invalidateUserMembershipCache() {}

/**
 * Get all authorized branches for a given user.
 *
 * @param {object} db - Database pool or client
 * @param {string} userId - UUID of the user
 * @param {boolean} isOrgAdmin - Whether the user is an organization administrator
 * @param {string} [orgId] - Organization UUID
 * @returns {Promise<{ branches: Array, defaultBranchId: string|null }>}
 */
async function getUserBranches(db, userId, isOrgAdmin = false, orgId = DEFAULT_ORG_ID) {

    if (isOrgAdmin) {
        // Org admins can see and switch to all non-archived branches in their organization
        const orgBranchesRes = await db.query(`
            SELECT 
                b.id,
                b.organization_id,
                b.code,
                b.name,
                b.name_ar,
                b.is_main,
                b.status,
                b.timezone,
                b.currency_code,
                b.tax_number,
                b.medical_license,
                b.commercial_registration,
                b.phone,
                b.alternative_phone,
                b.hotline,
                b.email,
                b.address,
                b.address_ar,
                b.city,
                b.governorate,
                b.invoice_prefix,
                b.settings,
                b.created_at,
                b.updated_at,
                ubm.role as branch_role,
                COALESCE(ubm.is_default, b.is_main) as is_default,
                CASE WHEN ubm.user_id IS NOT NULL THEN true ELSE false END as has_explicit_membership
            FROM branches b
            LEFT JOIN user_branch_memberships ubm 
                ON ubm.branch_id = b.id AND ubm.user_id = $1 AND ubm.is_active = TRUE
            WHERE b.organization_id = $2 AND b.status != 'archived'
            ORDER BY b.is_main DESC, b.name ASC
        `, [userId, orgId]);

        const branches = orgBranchesRes.rows;
        let defaultBranchId = branches.find(b => b.is_default)?.id || branches.find(b => b.is_main)?.id || branches[0]?.id || null;

        const result = { branches, defaultBranchId, isOrgAdmin: true };
        return result;
    }

    // Standard staff: only branches where they hold an active membership
    const memberBranchesRes = await db.query(`
        SELECT 
            b.id,
            b.organization_id,
            b.code,
            b.name,
            b.name_ar,
            b.is_main,
            b.status,
            b.timezone,
            b.currency_code,
            b.tax_number,
            b.medical_license,
            b.commercial_registration,
            b.phone,
            b.alternative_phone,
            b.hotline,
            b.email,
            b.address,
            b.address_ar,
            b.city,
            b.governorate,
            b.invoice_prefix,
            b.settings,
            b.created_at,
            b.updated_at,
            ubm.role as branch_role,
            ubm.is_default,
            true as has_explicit_membership
        FROM user_branch_memberships ubm
        JOIN branches b ON b.id = ubm.branch_id
        WHERE ubm.user_id = $1 
          AND ubm.is_active = TRUE 
          AND b.organization_id = $2
          AND b.status = 'active'
        ORDER BY ubm.is_default DESC, b.is_main DESC, b.name ASC
    `, [userId, orgId]);

    const branches = memberBranchesRes.rows;
    let defaultBranchId = branches.find(b => b.is_default)?.id || (branches.length === 1 ? branches[0].id : null);

    const result = { branches, defaultBranchId, isOrgAdmin: false };
    return result;
}

/**
 * Get branch details by ID.
 */
async function getBranchById(db, branchId) {
    if (!branchId) return null;
    const res = await db.query(`
        SELECT * FROM branches WHERE id = $1
    `, [branchId]);
    return res.rows[0] || null;
}

/**
 * Check branch creation quota under current license.
 */
async function checkBranchQuota(db, orgId = DEFAULT_ORG_ID) {
    const license = licenseService.getLicense();
    const countRes = await db.query(`
        SELECT 
            COUNT(*) FILTER (WHERE status = 'active')::int as active_count,
            COUNT(*) FILTER (WHERE status = 'archived')::int as archived_count,
            COUNT(*)::int as total_count 
        FROM branches 
        WHERE organization_id = $1
    `, [orgId]);
    const activeCount = countRes.rows[0]?.active_count || 0;
    const archivedCount = countRes.rows[0]?.archived_count || 0;
    const totalCount = countRes.rows[0]?.total_count || 0;

    const multiBranchAllowed = Boolean(
        license?.multiBranchAllowed !== undefined
            ? license.multiBranchAllowed
            : (
                license?.allowedModules?.includes('multi-branch') ||
                license?.allowedModules?.includes('*') ||
                license?.edition === 'developer'
            )
    );

    const maxBranches = license?.maxBranches !== undefined 
        ? license.maxBranches 
        : (multiBranchAllowed ? -1 : 1);

    const inGracePeriod = Boolean(license?.inGracePeriod);
    const isOverQuota = Boolean(maxBranches !== -1 && activeCount > maxBranches);
    const validForOrganization = Boolean(license && !license.isExpired && (!license.organizationId || license.organizationId === orgId));
    const canCreateMore = validForOrganization && multiBranchAllowed && !inGracePeriod && (maxBranches === -1 || activeCount < maxBranches);
    const canReactivate = canCreateMore;

    return {
        multiBranchAllowed,
        currentCount: activeCount,
        activeCount,
        archivedCount,
        totalCount,
        maxBranches,
        canCreateMore,
        canReactivate,
        inGracePeriod,
        graceDaysRemaining: license?.graceDaysRemaining || null,
        isOverQuota,
        edition: license?.edition || 'unknown'
    };
}

/**
 * Create a new branch with concurrency-safe quota validation.
 */
async function createBranch(db, branchData, orgId = DEFAULT_ORG_ID, creatorUserId = null) {
    const {
        code,
        name,
        nameAr = branchData.name_ar,
        timezone = 'Africa/Cairo',
        currencyCode = branchData.currency_code || 'EGP',
        taxNumber = branchData.tax_number || '',
        medicalLicense = branchData.medical_license || '',
        commercialRegistration = branchData.commercial_registration || '',
        phone = '',
        alternativePhone = branchData.alternative_phone || '',
        hotline = '',
        email = '',
        address = '',
        addressAr = branchData.address_ar || '',
        city = '',
        governorate = '',
        invoicePrefix = branchData.invoice_prefix || 'INV-',
        settings = {}
    } = branchData;

    if (!code || !String(code).trim()) {
        throw new AppError('Branch code is required', 400);
    }
    if (!name || !String(name).trim()) {
        throw new AppError('Branch name is required', 400);
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanName = String(name).trim();
    const cleanNameAr = nameAr ? String(nameAr).trim() : cleanName;

    // Pack auxiliary settings fields
    const mergedSettings = {
        ...settings,
        displayName: branchData.displayName || branchData.display_name || cleanName,
        displayNameAr: branchData.displayNameAr || branchData.display_name_ar || cleanNameAr,
        type: branchData.type || 'branch',
        managerName: branchData.managerName || '',
        modalities: Array.isArray(branchData.modalities) ? branchData.modalities : ['MRI', 'CT', 'X-RAY', 'ULTRASOUND'],
        reportHeaderOverride: branchData.reportHeaderOverride || '',
        reportFooterOverride: branchData.reportFooterOverride || '',
        workingHoursOverride: branchData.workingHoursOverride || null,
        notes: branchData.notes || ''
    };

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Check license entitlement
        const license = licenseService.getLicense();
        assertBranchLicense(license, orgId);
        if (license?.inGracePeriod) {
            throw new AppError(
                'Cannot create branches while license is in grace period. Please renew your enterprise license.',
                403,
                true,
                'LICENSE_GRACE_PERIOD_RESTRICTION'
            );
        }

        const multiBranchAllowed = Boolean(
            license?.multiBranchAllowed !== undefined
                ? license.multiBranchAllowed
                : (
                    license?.allowedModules?.includes('multi-branch') ||
                    license?.allowedModules?.includes('*') ||
                    license?.edition === 'developer'
                )
        );

        if (!multiBranchAllowed) {
            throw new AppError(
                'Multi-branch feature is not included in current license edition. Upgrade to Enterprise to add branches.',
                403,
                true,
                'FEATURE_NOT_LICENSED'
            );
        }

        const maxBranches = license?.maxBranches !== undefined 
            ? license.maxBranches 
            : (multiBranchAllowed ? -1 : 1);

        // Concurrency-safe quota check: lock organization row
        await client.query(`
            SELECT id FROM organizations WHERE id = $1 FOR UPDATE
        `, [orgId]);

        const countRes = await client.query(`
            SELECT COUNT(*)::int as count 
            FROM branches 
            WHERE organization_id = $1 AND status = 'active'
        `, [orgId]);
        const currentActiveCount = countRes.rows[0]?.count || 0;

        if (maxBranches !== -1 && currentActiveCount >= maxBranches) {
            throw new AppError(
                `Maximum branch quota reached (${currentActiveCount}/${maxBranches}). Contact VIARA support to expand your branch license.`,
                403,
                true,
                'MAX_BRANCHES_EXCEEDED'
            );
        }

        // MBT-307 Anti-circumvention: Verify organization does not abuse create-archive cycle
        const totalCountRes = await client.query(`
            SELECT COUNT(*)::int as count 
            FROM branches 
            WHERE organization_id = $1
        `, [orgId]);
        const totalBranches = totalCountRes.rows[0]?.count || 0;
        if (maxBranches !== -1 && totalBranches >= maxBranches + 10 && license?.edition !== 'enterprise' && license?.edition !== 'developer') {
            throw new AppError(
                `Lifetime branch registration limit reached (${totalBranches} branches). Contact VIARA support to clean up or expand your enterprise license.`,
                403,
                true,
                'BRANCH_CREATION_LIMIT_EXCEEDED'
            );
        }

        // Check code uniqueness within org
        const existingCode = await client.query(`
            SELECT id FROM branches WHERE organization_id = $1 AND UPPER(code) = $2
        `, [orgId, cleanCode]);
        if (existingCode.rows.length > 0) {
            throw new AppError(`A branch with code "${cleanCode}" already exists.`, 409);
        }

        const newBranchId = crypto.randomUUID();

        const insertRes = await client.query(`
            INSERT INTO branches (
                id, organization_id, code, name, name_ar, is_main, status,
                timezone, currency_code, tax_number, medical_license,
                commercial_registration, phone, alternative_phone, hotline,
                email, address, address_ar, city, governorate, invoice_prefix, settings
            )
            VALUES (
                $1, $2, $3, $4, $5, FALSE, 'active',
                $6, $7, $8, $9,
                $10, $11, $12, $13,
                $14, $15, $16, $17, $18, $19, $20
            )
            RETURNING *
        `, [
            newBranchId, orgId, cleanCode, cleanName, cleanNameAr,
            timezone, currencyCode, taxNumber, medicalLicense,
            commercialRegistration, phone, alternativePhone, hotline,
            email, address, addressAr, city, governorate, invoicePrefix, JSON.stringify(mergedSettings)
        ]);

        const newBranch = insertRes.rows[0];

        // Give the creator a membership in the new branch
        if (creatorUserId) {
            await client.query(`
                INSERT INTO user_branch_memberships (user_id, branch_id, is_default, is_active)
                VALUES ($1, $2, FALSE, TRUE)
                ON CONFLICT (user_id, branch_id) DO NOTHING
            `, [creatorUserId, newBranchId]);
        }

        await client.query('COMMIT');
        invalidateUserMembershipCache();

        logger.info('Branch created successfully', { branchId: newBranchId, code: cleanCode, orgId });
        return newBranch;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Update an existing branch with concurrency-safe quota validation on reactivation.
 */
async function updateBranch(db, branchId, updateData) {
    const existing = await getBranchById(db, branchId);
    if (!existing) {
        throw new AppError('Branch not found', 404);
    }

    const name = updateData.name;
    const nameAr = updateData.nameAr ?? updateData.name_ar;
    const timezone = updateData.timezone;
    const currencyCode = updateData.currencyCode ?? updateData.currency_code;
    const taxNumber = updateData.taxNumber ?? updateData.tax_number;
    const medicalLicense = updateData.medicalLicense ?? updateData.medical_license;
    const commercialRegistration = updateData.commercialRegistration ?? updateData.commercial_registration;
    const phone = updateData.phone;
    const alternativePhone = updateData.alternativePhone ?? updateData.alternative_phone;
    const hotline = updateData.hotline;
    const email = updateData.email;
    const address = updateData.address;
    const addressAr = updateData.addressAr ?? updateData.address_ar;
    const city = updateData.city;
    const governorate = updateData.governorate;
    const invoicePrefix = updateData.invoicePrefix ?? updateData.invoice_prefix;
    const status = updateData.status;

    // Forbid deactivating/archiving the primary flagship branch
    if (existing.is_main && status && status !== 'active') {
        throw new AppError('Cannot deactivate or archive the Main Flagship branch.', 400);
    }

    const isReactivation = (status === 'active' && existing.status !== 'active');

    // Merge existing settings with incoming settings or custom properties
    const existingSettings = typeof existing.settings === 'object' && existing.settings ? existing.settings : {};
    const incomingSettings = updateData.settings || {};
    const mergedSettings = {
        ...existingSettings,
        ...incomingSettings,
        ...(updateData.displayName !== undefined ? { displayName: updateData.displayName } : {}),
        ...(updateData.displayNameAr !== undefined ? { displayNameAr: updateData.displayNameAr } : {}),
        ...(updateData.type !== undefined ? { type: updateData.type } : {}),
        ...(updateData.managerName !== undefined ? { managerName: updateData.managerName } : {}),
        ...(updateData.modalities !== undefined ? { modalities: updateData.modalities } : {}),
        ...(updateData.reportHeaderOverride !== undefined ? { reportHeaderOverride: updateData.reportHeaderOverride } : {}),
        ...(updateData.reportFooterOverride !== undefined ? { reportFooterOverride: updateData.reportFooterOverride } : {}),
        ...(updateData.workingHoursOverride !== undefined ? { workingHoursOverride: updateData.workingHoursOverride } : {}),
        ...(updateData.notes !== undefined ? { notes: updateData.notes } : {}),
    };

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // MBT-305, MBT-306, MBT-307: Concurrency-safe reactivation quota enforcement
        if (isReactivation) {
            // Lock organization record exclusively to serialize branch reactivations and creations
            await client.query(`
                SELECT id FROM organizations WHERE id = $1 FOR UPDATE
            `, [existing.organization_id]);

            const license = licenseService.getLicense();
            assertBranchLicense(license, existing.organization_id);
            if (license?.inGracePeriod) {
                throw new AppError(
                    'Cannot activate branch during license grace period. Please renew your enterprise license.',
                    403,
                    true,
                    'LICENSE_GRACE_PERIOD_RESTRICTION'
                );
            }

            const multiBranchAllowed = Boolean(
                license?.multiBranchAllowed !== undefined
                    ? license.multiBranchAllowed
                    : (
                        license?.allowedModules?.includes('multi-branch') ||
                        license?.allowedModules?.includes('*') ||
                        license?.edition === 'developer'
                    )
            );

            const maxBranches = license?.maxBranches !== undefined 
                ? license.maxBranches 
                : (multiBranchAllowed ? -1 : 1);

            // Count other active branches in this organization
            const countRes = await client.query(`
                SELECT COUNT(*)::int as count 
                FROM branches 
                WHERE organization_id = $1 AND status = 'active' AND id != $2
            `, [existing.organization_id, branchId]);
            const currentActiveCount = countRes.rows[0]?.count || 0;

            if (!multiBranchAllowed && currentActiveCount >= 1) {
                throw new AppError(
                    'Multi-branch feature is not included in current license edition. Upgrade to Enterprise to activate additional branches.',
                    403,
                    true,
                    'FEATURE_NOT_LICENSED'
                );
            }

            if (maxBranches !== -1 && currentActiveCount >= maxBranches) {
                throw new AppError(
                    `Maximum active branch quota reached (${currentActiveCount}/${maxBranches}). Contact VIARA support to expand your branch license or deactivate another branch first.`,
                    403,
                    true,
                    'MAX_BRANCHES_EXCEEDED'
                );
            }
        }

        // Handle isMain primary HQ flag
        if (updateData.isMain === true) {
            await client.query(`UPDATE branches SET is_main = FALSE WHERE organization_id = $1`, [existing.organization_id]);
            await client.query(`UPDATE branches SET is_main = TRUE WHERE id = $1`, [branchId]);
        } else if (updateData.isMain === false && existing.is_main) {
            await client.query(`UPDATE branches SET is_main = FALSE WHERE id = $1`, [branchId]);
        }

        const res = await client.query(`
            UPDATE branches
            SET 
                name = COALESCE($1, name),
                name_ar = COALESCE($2, name_ar),
                timezone = COALESCE($3, timezone),
                currency_code = COALESCE($4, currency_code),
                tax_number = COALESCE($5, tax_number),
                medical_license = COALESCE($6, medical_license),
                commercial_registration = COALESCE($7, commercial_registration),
                phone = COALESCE($8, phone),
                alternative_phone = COALESCE($9, alternative_phone),
                hotline = COALESCE($10, hotline),
                email = COALESCE($11, email),
                address = COALESCE($12, address),
                address_ar = COALESCE($13, address_ar),
                city = COALESCE($14, city),
                governorate = COALESCE($15, governorate),
                invoice_prefix = COALESCE($16, invoice_prefix),
                settings = $17,
                status = COALESCE($18, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $19
            RETURNING *
        `, [
            name, nameAr, timezone, currencyCode, taxNumber, medicalLicense,
            commercialRegistration, phone, alternativePhone, hotline, email,
            address, addressAr, city, governorate, invoicePrefix,
            JSON.stringify(mergedSettings), status, branchId
        ]);

        await client.query('COMMIT');
        invalidateUserMembershipCache();
        return res.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Archive a branch (MBT-307: Never delete data, preserve clinical & financial lineage).
 */
async function archiveBranch(db, branchId) {
    if (branchId === DEFAULT_HQ_BRANCH_ID) {
        throw new AppError('Cannot archive the Main Flagship branch.', 400);
    }

    const existing = await getBranchById(db, branchId);
    if (!existing) {
        throw new AppError('Branch not found', 404);
    }

    if (existing.is_main) {
        throw new AppError('Cannot archive the Main Flagship branch.', 400);
    }

    const res = await db.query(`
        UPDATE branches
        SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
    `, [branchId]);

    invalidateUserMembershipCache();
    logger.info('Branch archived', { branchId });
    return res.rows[0];
}

/**
 * Assign a user to a branch.
 */
async function assignBranchMember(db, branchId, userId, { role = null, isDefault = false } = {}) {
    const client = await db.connect();
    try {
    await client.query('BEGIN');
    // Serialize default changes for a user across branches.
    const userRes = await client.query(`SELECT user_id, role, organization_id, is_active FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
    const branch = await getBranchById(client, branchId);
    if (!branch || branch.status === 'archived') {
        throw new AppError('Branch not found or archived', 404);
    }

    if (!userRes.rows.length) {
        throw new AppError('User not found', 404);
    }
    const user = userRes.rows[0];
    if (!user.is_active || !user.organization_id || user.organization_id !== branch.organization_id) {
        throw new AppError('User is outside the branch organization or inactive', 403, true, 'BRANCH_ACCESS_DENIED');
    }
    const branchRole = role || user.role;
    if (!['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Marketing', 'Technician', 'Nurse', 'Insurance_Staff'].includes(branchRole)) {
        throw new AppError('Invalid branch role', 400);
    }

    if (isDefault) {
        // Clear previous default for this user
        await client.query(`
            UPDATE user_branch_memberships 
            SET is_default = FALSE 
            WHERE user_id = $1
        `, [userId]);
    }

    const res = await client.query(`
        INSERT INTO user_branch_memberships (user_id, branch_id, role, is_default, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET
            role = COALESCE(EXCLUDED.role, user_branch_memberships.role),
            is_default = EXCLUDED.is_default,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `, [userId, branchId, branchRole, isDefault]);

    await client.query('COMMIT');
    invalidateUserMembershipCache(userId);
    return res.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Remove a user from a branch.
 */
async function removeBranchMember(db, branchId, userId) {
    const res = await db.query(`
        UPDATE user_branch_memberships
        SET is_active = FALSE, is_default = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND branch_id = $2
        RETURNING *
    `, [userId, branchId]);

    invalidateUserMembershipCache(userId);
    return res.rows[0];
}

module.exports = {
    DEFAULT_HQ_BRANCH_ID,
    DEFAULT_ORG_ID,
    getUserBranches,
    getBranchById,
    checkBranchQuota,
    createBranch,
    updateBranch,
    archiveBranch,
    assignBranchMember,
    removeBranchMember,
    invalidateUserMembershipCache
};
