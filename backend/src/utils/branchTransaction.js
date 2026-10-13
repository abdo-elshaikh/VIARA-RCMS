/**
 * branchTransaction.js
 * --------------------
 * Unified helper for running PostgreSQL transactions with active Row-Level Security (RLS)
 * branch context (MBT-801, MBT-802, MBT-803).
 *
 * Ensures that whenever an application transaction is executed, the PostgreSQL session
 * local variables (app.current_branch_id, app.current_user_id, app.is_org_admin) are
 * set inside the transaction via `set_branch_context` and cleanly reset upon release.
 *
 * PROTECTED TABLES (Migration 206):
 * 1. appointments
 * 2. examinations
 * 3. invoices
 * 4. cashier_shifts
 * 5. inventory_items
 * 6. stock_movements
 * 7. payments
 * 8. refunds
 * 9. expenses
 * 10. insurance_claims
 * 11. waiting_list
 */

'use strict';
const { signBranchContext } = require('./branchContextProof');

let _defaultPool = null;

/**
 * Sets the default database pool used by branchTransaction if no explicit pool is provided.
 * @param {object} pool - pg.Pool instance
 */
function setDefaultPool(pool) {
    _defaultPool = pool;
}

/**
 * Gets the default database pool.
 * @returns {object|null}
 */
function getDefaultPool() {
    return _defaultPool;
}

/**
 * Sets PostgreSQL RLS branch context on an active database client.
 *
 * @param {object} client - PostgreSQL client (checked out from pool, inside BEGIN)
 * @param {object|string} reqOrContext - Express req object, or branchContext object, or branchId string
 * @returns {Promise<void>}
 */
async function setBranchContext(client, reqOrContext) {
    if (!client || !reqOrContext) return;

    let branchId = null;
    let userId = null;
    let isOrgAdmin = false;
    let actorKind = reqOrContext.actorKind || 'Staff';

    if (typeof reqOrContext === 'string') {
        branchId = reqOrContext;
    } else if (reqOrContext.branchContext || reqOrContext.user) {
        // Express req object
        branchId = reqOrContext.branchContext?.branchId || reqOrContext.user?.branch_id || null;
        userId = reqOrContext.user?.user_id || reqOrContext.user?.userId || reqOrContext.user?.doctorId || null;
        actorKind = ['Patient','Doctor'].includes(reqOrContext.user?.role) ? reqOrContext.user.role : 'Staff';
        isOrgAdmin = Boolean(
            reqOrContext.branchContext?.isOrgAdmin ||
            reqOrContext.branchContext?.isAllBranches ||
            reqOrContext.user?.is_org_admin ||
            reqOrContext.user?.role === 'Developer'
        );
    } else {
        // Plain context object
        branchId = reqOrContext.branchId || null;
        userId = reqOrContext.userId || null;
        isOrgAdmin = Boolean(reqOrContext.isOrgAdmin || reqOrContext.isAllBranches);
    }

    const connectionContext = client[Symbol.for('VIARA_DB_CONTEXT')];
    if (!reqOrContext.user && connectionContext?.actorKind === 'Service') {
        userId = connectionContext.userId;
        actorKind = 'Service';
    }
    if (!userId && isOrgAdmin) {
        const service = require('./databaseContext').serviceContext();
        userId = service.userId;
        actorKind = 'Service';
    }
    const proof = signBranchContext(branchId, userId, undefined, actorKind);
    await client.query('SELECT set_branch_context($1::uuid, $2::uuid, $3::boolean, $4::text, $5::bigint, $6::text)', [
        branchId,
        userId,
        isOrgAdmin,
        proof.signature,
        proof.expires,
        actorKind
    ]);
}

/**
 * Resets PostgreSQL RLS branch context on the client.
 *
 * @param {object} client - PostgreSQL client
 * @returns {Promise<void>}
 */
async function clearBranchContext(client) {
    if (!client) return;
    try {
        await client.query('SELECT clear_branch_context()');
    } catch (_) {
        // Suppress errors during connection cleanup
    }
}

/**
 * Executes an operation inside a PostgreSQL transaction with active RLS branch context.
 *
 * @param {object} db - PostgreSQL pool
 * @param {object|string} reqOrContext - Express req object or branchContext
 * @param {Function} callback - async (client) => result
 * @returns {Promise<any>}
 */
async function withBranchTransaction(db, reqOrContext, callback) {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await setBranchContext(client, reqOrContext);
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}
        throw err;
    } finally {
        await clearBranchContext(client);
        client.release();
    }
}

/**
 * Flexible branch transaction wrapper.
 * Can be called as:
 *   branchTransaction(db, reqOrContext, callback)
 *   branchTransaction(branchIdOrContext, callback)  [uses default pool or req.db]
 *
 * @param {object|string} arg1 - db pool OR reqOrContext
 * @param {object|string|Function} arg2 - reqOrContext OR callback
 * @param {Function} [arg3] - callback when 3 arguments are provided
 * @returns {Promise<any>}
 */
async function branchTransaction(arg1, arg2, arg3) {
    if (typeof arg3 === 'function') {
        // (db, reqOrContext, callback)
        return withBranchTransaction(arg1, arg2, arg3);
    }
    if (typeof arg2 === 'function') {
        // (reqOrContext, callback)
        const reqOrContext = arg1;
        const callback = arg2;
        const pool = reqOrContext?.db || reqOrContext?.pool || _defaultPool;
        if (!pool) {
            throw new Error('branchTransaction: No database pool provided or configured as default pool');
        }
        return withBranchTransaction(pool, reqOrContext, callback);
    }
    throw new Error('branchTransaction: Invalid arguments provided');
}

module.exports = {
    setBranchContext,
    clearBranchContext,
    withBranchTransaction,
    branchTransaction,
    attachBranchContext: setBranchContext,
    setDefaultPool,
    getDefaultPool
};
