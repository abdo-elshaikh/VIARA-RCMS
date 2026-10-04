const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {
    cleanupBackups,
    createPostgresBackup,
    createPacsCompanion,
    getBackupDir,
    getBackupMode,
    isValidBackupFilename,
    listBackupFiles,
    resolveBackupPath
} = require('../services/postgresBackupService');
const { replicateBackup, isConfigured } = require('../services/backupOffsiteReplicator');
const { triggerEventForRole } = require('../services/notificationJobService');

const BACKUP_DIR = getBackupDir();
const DEFAULT_JSON_RESTORE_MAX_BYTES = 50 * 1024 * 1024;

const positiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getJsonRestoreMaxBytes = () => positiveInteger(
    process.env.BACKUP_JSON_RESTORE_MAX_BYTES,
    DEFAULT_JSON_RESTORE_MAX_BYTES
);

const isJsonRestoreAllowed = () => (
    process.env.NODE_ENV !== 'production'
    && getBackupMode() === 'json'
    && process.env.BACKUP_JSON_RESTORE_ENABLED !== 'false'
);

const isJsonBackupDownloadAllowed = () => (
    process.env.NODE_ENV !== 'production'
    && process.env.BACKUP_JSON_DOWNLOAD_ENABLED === 'true'
);

// Whitelist of tables safe to include in backups (prevents SQL injection via dynamic table names)
const ALLOWED_BACKUP_TABLES = [
    'users', 'patients', 'appointments', 'modalities', 'examinations', 'reports',
    'invoices', 'payments', 'claims', 'insurance_providers', 'insurance_policies',
    'referring_doctors', 'patient_consents', 'data_privacy_requests',
    'documents', 'integrations', 'integration_logs', 'center_settings',
    'employee_profiles', 'staff_shifts', 'attendance_logs', 'leave_requests',
    'crm_activities', 'patient_segments', 'patient_segment_members',
    'marketing_campaigns', 'patient_feedback', 'system_logs',
    'roles', 'permissions', 'role_permissions', 'price_list'
];

// JSON restore is intentionally limited to the dependency-safe core dataset.
// Full-fidelity backups must use the verified PostgreSQL dump path.
const RESTORE_INSERT_ORDER = [
    'users', 'insurance_providers', 'modalities', 'examination_types', 'referring_doctors',
    'patients', 'appointments', 'examinations', 'invoices', 'payments', 'claims',
    'center_settings', 'permissions', 'role_permissions'
].filter((value, index, values) => values.indexOf(value) === index);

// Ensure backup dir exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const createJsonBackupSnapshot = async (db, user) => {
    const tablesResult = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `);

    const availableTables = tablesResult.rows
        .map(row => row.table_name)
        .filter(name => ALLOWED_BACKUP_TABLES.includes(name));
    const tables = availableTables.filter(name => RESTORE_INSERT_ORDER.includes(name));

    const filename = `VIARA_backup_${Date.now()}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    const stream = fs.createWriteStream(filepath, { encoding: 'utf-8', mode: 0o600 });
    const tableCounts = {};

    stream.write('{\n"metadata": ' + JSON.stringify({
        generated_at: new Date().toISOString(),
        generated_by: user.full_name || 'Admin',
        version: '1.0',
        mode: 'development-json',
        restore_supported_tables: RESTORE_INSERT_ORDER,
        omitted_tables: availableTables.filter(name => !RESTORE_INSERT_ORDER.includes(name))
    }) + ',\n"data": {\n');

    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const identifier = `"${table.replace(/"/g, '""')}"`;

        stream.write(`"${table}": [\n`);

        const countRes = await db.query(`SELECT COUNT(*) FROM ${identifier}`);
        const total = parseInt(countRes.rows[0].count, 10);
        tableCounts[table] = total;

        let offset = 0;
        const limit = 5000;
        let firstRow = true;

        while (offset < total) {
            const dataResult = await db.query(`SELECT * FROM ${identifier} ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`);
            for (const row of dataResult.rows) {
                if (!firstRow) stream.write(',\n');
                stream.write(JSON.stringify(row));
                firstRow = false;
            }
            offset += limit;
        }

        stream.write('\n]');
        if (i < tables.length - 1) stream.write(',\n');
    }

    stream.write('\n}\n}');
    stream.end();

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    const stat = await fsp.stat(filepath);
    return {
        filename,
        filepath,
        size_bytes: stat.size,
        tableCounts,
        omittedTables: availableTables.filter(table => !tables.includes(table))
    };
};

const validateJsonBackupPayload = (backupData) => {
    if (!backupData || typeof backupData !== 'object' || Array.isArray(backupData)) {
        throw new AppError('Invalid backup format', 400);
    }
    if (!backupData.data || typeof backupData.data !== 'object' || Array.isArray(backupData.data)) {
        throw new AppError('Backup data section is missing or invalid', 400);
    }

    const tables = backupData.data;
    const unsupportedTables = Object.keys(tables).filter(table => !ALLOWED_BACKUP_TABLES.includes(table));
    if (unsupportedTables.length) {
        throw new AppError(`Backup contains unsupported tables: ${unsupportedTables.join(', ')}`, 400);
    }

    for (const [table, rows] of Object.entries(tables)) {
        if (!Array.isArray(rows)) {
            throw new AppError(`Backup table ${table} must be an array`, 400);
        }
        const invalidRow = rows.find(row => !row || typeof row !== 'object' || Array.isArray(row));
        if (invalidRow) {
            throw new AppError(`Backup table ${table} contains an invalid row`, 400);
        }
    }

    return tables;
};

const generateBackup = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;

        if (getBackupMode() === 'postgres') {
            const backup = await createPostgresBackup();
            const replicationResult = await replicateBackup(backup);
            await logAction(db, {
                userId,
                action: 'BACKUP_GENERATED',
                resourceTable: 'system',
                ipAddress: req.ip,
                details: {
                    filename: backup.filename,
                    size_bytes: backup.size_bytes,
                    checksum: backup.checksum || replicationResult.checksum || null,
                    type: backup.type,
                    verified: backup.verified,
                    offsiteReplicated: replicationResult.replicated,
                }
            });

            triggerEventForRole(db, 'BackupCompleted', 'Admin', {
                priority: 'Normal',
                variables: {
                    backup_file: backup.filename,
                    backup_size: backup.size_bytes,
                    duration: backup.duration || 'N/A'
                }
            }).catch(() => { });

            triggerEventForRole(db, 'BackupCompleted', 'Accountant', {
                priority: 'Normal',
                variables: {
                    backup_file: backup.filename,
                    backup_size: backup.size_bytes,
                    duration: backup.duration || 'N/A'
                }
            }).catch(() => { });

            return res.json({
                message: 'Verified PostgreSQL backup generated successfully',
                filename: backup.filename,
                type: backup.type,
                verified: backup.verified,
                scope: backup.scope,
                companions: (backup.companions || []).map(({ filepath, ...metadata }) => metadata),
                offsiteReplicated: replicationResult.replicated,
                dicom_storage: backup.dicom_storage
            });
        }

        const backup = await createJsonBackupSnapshot(db, req.user);
        const pacs = await createPacsCompanion(backup);
        if (pacs) await pacs.verifyUnchanged();
        backup.companions = pacs ? [pacs.backup] : [];
        backup.scope = pacs ? 'core-database-and-pacs' : 'core-database-only';
        const replicationResult = await replicateBackup(backup);

        // 4. Apply configured age/count retention.
        await cleanupBackups();

        // 5. Log audit
        await logAction(db, {
            userId, action: 'BACKUP_GENERATED', resourceTable: 'system',
            ipAddress: req.ip, details: { filename: backup.filename, size_bytes: backup.size_bytes, type: 'JSON' }
        });

        triggerEventForRole(db, 'BackupCompleted', 'Admin', {
            priority: 'Normal',
            variables: {
                backup_file: backup.filename,
                backup_size: backup.size_bytes,
                duration: 'N/A'
            }
        }).catch(() => { });

        triggerEventForRole(db, 'BackupCompleted', 'Accountant', {
            priority: 'Normal',
            variables: {
                backup_file: backup.filename,
                backup_size: backup.size_bytes,
                duration: 'N/A'
            }
        }).catch(() => { });

        res.json({
            message: 'Development core snapshot generated successfully',
            filename: backup.filename,
            type: 'JSON',
            omittedTables: backup.omittedTables,
            scope: backup.scope,
            companions: (backup.companions || []).map(({ filepath, ...metadata }) => metadata),
            offsiteReplicated: replicationResult.replicated
        });

    } catch (error) {
        triggerEventForRole(db, 'BackupFailed', 'Admin', {
            priority: 'Critical',
            variables: {
                error: error.message,
                backup_file: 'N/A'
            }
        }).catch(() => { });

        triggerEventForRole(db, 'BackupFailed', 'Accountant', {
            priority: 'Critical',
            variables: {
                error: error.message,
                backup_file: 'N/A'
            }
        }).catch(() => { });

        next(error);
    }
};

const listBackups = (db) => async (req, res, next) => {
    try {
        res.json(await listBackupFiles());
    } catch (error) {
        next(error);
    }
};

const getBackupStatus = (db) => async (req, res, next) => {
    try {
        const backups = await listBackupFiles();
        const latest = backups.length > 0 ? backups[0] : null;
        res.json({
            mode: getBackupMode(),
            retentionDays: positiveInteger(process.env.BACKUP_RETENTION_DAYS, 30),
            maxFiles: positiveInteger(process.env.BACKUP_MAX_FILES, 30),
            scheduleEnabled: process.env.BACKUP_SCHEDULE_ENABLED === 'true',
            offsiteReplicated: isConfigured(),
            latestBackup: latest || null,
        });
    } catch (error) {
        next(error);
    }
};

const downloadBackup = (db) => async (req, res, next) => {
    try {
        const { filename } = req.params;

        if (!isValidBackupFilename(filename)) {
            return next(new AppError('Invalid backup filename', 400));
        }

        if (filename.endsWith('.json') && !isJsonBackupDownloadAllowed()) {
            return next(new AppError('Development JSON backup downloads are disabled; use an encrypted PostgreSQL backup or explicitly enable BACKUP_JSON_DOWNLOAD_ENABLED', 403));
        }

        const filepath = resolveBackupPath(filename);
        if (!filepath) {
            return next(new AppError('Access denied', 403));
        }

        if (!fs.existsSync(filepath)) {
            return next(new AppError('Backup file not found', 404));
        }

        res.download(filepath, filename);
    } catch (error) {
        next(error);
    }
};

const restoreBackup = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { filename, confirm } = req.body;
        if (confirm !== true) {
            return next(new AppError('Restore requires confirm: true in request body', 400));
        }
        if (!filename || !isValidBackupFilename(filename)) {
            return next(new AppError('Invalid backup filename', 400));
        }
        if (!filename.endsWith('.json')) {
            return next(new AppError('PostgreSQL dump restore requires the maintenance-window runbook', 400));
        }
        if (!isJsonRestoreAllowed()) {
            return next(new AppError('JSON restore is only available when BACKUP_MODE=json outside production', 400));
        }

        const filepath = resolveBackupPath(filename);
        if (!filepath || !fs.existsSync(filepath)) {
            return next(new AppError('Backup file not found', 404));
        }

        const stat = await fsp.stat(filepath);
        if (stat.size > getJsonRestoreMaxBytes()) {
            return next(new AppError('Backup file is too large for development JSON restore', 413));
        }

        const backupData = JSON.parse(await fsp.readFile(filepath, 'utf8'));
        const tables = validateJsonBackupPayload(backupData);
        const skippedTables = Object.keys(tables).filter((table) => !RESTORE_INSERT_ORDER.includes(table));
        const safetyBackup = await createJsonBackupSnapshot(db, req.user);

        await client.query('BEGIN');

        for (const table of [...RESTORE_INSERT_ORDER].reverse()) {
            if (tables[table]) {
                await client.query(`DELETE FROM "${table.replace(/"/g, '""')}"`);
            }
        }

        let restoredRows = 0;
        for (const table of RESTORE_INSERT_ORDER) {
            const rows = tables[table];
            if (!rows || !rows.length) continue;

            const columns = Object.keys(rows[0]);
            const colList = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ');
            const BATCH_SIZE = 100;
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map((_, rowIndex) => {
                    const offset = rowIndex * columns.length;
                    return '(' + columns.map((_, colIndex) => `$${offset + colIndex + 1}`).join(', ') + ')';
                }).join(', ');

                const values = [];
                for (const row of batch) {
                    for (const c of columns) {
                        values.push(row[c]);
                    }
                }

                await client.query(
                    `INSERT INTO "${table.replace(/"/g, '""')}" (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
                    values
                );
                restoredRows += batch.length;
            }
        }

        await client.query('COMMIT');

        await logAction(db, {
            userId: req.user.user_id,
            action: 'BACKUP_RESTORED',
            resourceTable: 'system',
            ipAddress: req.ip,
            details: { filename, restoredRows, skippedTables, safetyBackup: safetyBackup.filename }
        });

        res.json({
            message: skippedTables.length
                ? 'Backup restored partially; some tables are not supported by JSON restore'
                : 'Backup restored successfully',
            filename,
            restoredRows,
            partial: skippedTables.length > 0,
            skippedTables,
            safetyBackup: safetyBackup.filename
        });
    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

module.exports = {
    createJsonBackupSnapshot,
    generateBackup,
    getBackupStatus,
    isJsonRestoreAllowed,
    isJsonBackupDownloadAllowed,
    listBackups,
    downloadBackup,
    restoreBackup,
    validateJsonBackupPayload
};
