const fs = require('fs');
const path = require('path');
const os = require('os');
const { AppError } = require('../middleware/errorHandler');

const getPackageJsonVersion = () => {
    try {
        const rootPkg = path.resolve(__dirname, '../../../package.json');
        if (fs.existsSync(rootPkg)) {
            const data = JSON.parse(fs.readFileSync(rootPkg, 'utf8'));
            return data.version || '1.0.0';
        }
        const backendPkg = path.resolve(__dirname, '../../package.json');
        if (fs.existsSync(backendPkg)) {
            const data = JSON.parse(fs.readFileSync(backendPkg, 'utf8'));
            return data.version || '1.0.0';
        }
    } catch {
        // fallback
    }
    return '1.0.0';
};

const CURRENT_VERSION = getPackageJsonVersion();

/**
 * Returns complete system update diagnostic information.
 */
const getSystemUpdateStatus = async (pool) => {
    let migrationsCount = 0;
    let lastMigration = null;

    try {
        const trackedResult = await pool.query(`
            SELECT version, checksum, applied_at
            FROM tracked_schema_migrations
            ORDER BY applied_at DESC
            LIMIT 1
        `).catch(() => ({ rows: [] }));

        if (trackedResult.rows.length > 0) {
            lastMigration = trackedResult.rows[0];
            const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM tracked_schema_migrations`);
            migrationsCount = countResult.rows[0]?.count || 0;
        } else {
            const legacyResult = await pool.query(`
                SELECT filename AS version, applied_at
                FROM schema_migrations
                ORDER BY applied_at DESC
                LIMIT 1
            `).catch(() => ({ rows: [] }));
            if (legacyResult.rows.length > 0) {
                lastMigration = legacyResult.rows[0];
            }
            const countLegacy = await pool.query(`SELECT COUNT(*)::int AS count FROM schema_migrations`).catch(() => ({ rows: [{ count: 0 }] }));
            migrationsCount = countLegacy.rows[0]?.count || 0;
        }
    } catch (err) {
        // Ignored in minimal test/mock environments
    }

    let latestUpdate = null;
    try {
        const updateRes = await pool.query(`
            SELECT u.*, us.username AS initiator_name
            FROM system_updates u
            LEFT JOIN users us ON us.user_id = u.initiated_by
            ORDER BY u.applied_at DESC
            LIMIT 1
        `);
        latestUpdate = updateRes.rows[0] || null;
    } catch {
        // Table may not exist yet or mocked
    }

    const memory = process.memoryUsage();

    return {
        product: 'VIARA-RCMS Enterprise Radiology Suite',
        applicationEnabled: false,
        deploymentMethod: 'immutable-release',
        updateDisabledReason: 'Use the approved release deployment and recovery runbook.',
        currentVersion: CURRENT_VERSION,
        environment: process.env.NODE_ENV || 'production',
        uptimeSeconds: Math.round(process.uptime()),
        hostname: os.hostname(),
        platform: process.platform,
        nodeVersion: process.version,
        migrationsCount,
        lastMigration,
        latestUpdate,
        memoryUsage: {
            heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
            rssMb: Math.round(memory.rss / 1024 / 1024)
        },
        cloudUpdateChannel: process.env.VIARA_UPDATE_CHANNEL || 'stable',
        isOnlineCheckEnabled: Boolean(process.env.VIARA_UPDATE_SERVER_URL)
    };
};

/**
 * Checks for updates against central cloud server or simulated release repository.
 */
const checkForAvailableUpdates = async (pool, options = {}) => {
    const currentVersion = options.currentVersion || CURRENT_VERSION;

    if (process.env.VIARA_UPDATE_SERVER_URL) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const response = await fetch(`${process.env.VIARA_UPDATE_SERVER_URL}/v1/updates/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentVersion, channel: process.env.VIARA_UPDATE_CHANNEL || 'stable' }),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (response.ok) {
                return await response.json();
            }
        } catch {
            // Fallback to offline response if server unreachable
        }
    }

    // Default release metadata / mock channel response
    return {
        checked: false,
        hasUpdate: null,
        currentVersion,
        latestVersion: currentVersion,
        releaseDate: new Date().toISOString().split('T')[0],
        isSecurityFix: false,
        changelog: [
            'Release channel was not checked. Use the approved release registry and deployment runbook.'
        ],
        channel: 'stable'
    };
};

/**
 * Inspects and cryptographically validates an uploaded update patch (.zip / .viara-patch).
 */
const updateUnavailable = () => new AppError('In-app package updates are unavailable. Deploy an approved immutable release using the deployment and recovery runbook.', 503, true, 'SYSTEM_UPDATE_UNAVAILABLE');

// Keep the API contract for existing clients, but never accept or claim to apply
// a package until a real signed deployment and rollback engine is available.
const verifyUpdatePackage = async () => { throw updateUnavailable(); };
const applySystemUpdate = async () => { throw updateUnavailable(); };

const getSystemUpdateHistory = async (pool, limit = 20) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.update_id,
                u.from_version,
                u.to_version,
                u.status,
                u.package_name,
                u.package_sha256,
                u.backup_file,
                u.release_notes,
                u.error_message,
                u.applied_at,
                u.completed_at,
                u.logs,
                us.username AS initiated_by_username,
                us.full_name AS initiated_by_fullname
            FROM system_updates u
            LEFT JOIN users us ON us.user_id = u.initiated_by
            ORDER BY u.applied_at DESC
            LIMIT $1
        `, [Math.max(1, Math.min(100, limit))]);

        return result.rows;
    } catch (err) {
        return [];
    }
};

module.exports = {
    CURRENT_VERSION,
    getSystemUpdateStatus,
    checkForAvailableUpdates,
    verifyUpdatePackage,
    applySystemUpdate,
    getSystemUpdateHistory
};
