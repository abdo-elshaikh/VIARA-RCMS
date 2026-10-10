/**
 * Re-encryption migration script: AES-CBC → AES-GCM (v2 format)
 *
 * Scans all known encrypted PII columns across the database, decrypts
 * values still in the legacy AES-CBC format (hex:hex), and re-encrypts
 * them in the AES-GCM v2 format (v2:keyId:iv:authTag:ciphertext).
 *
 * Usage:
 *   node scripts/reencryptPii.js
 *
 * Requires: DATABASE_URL and ENCRYPTION_KEY (+ BLIND_INDEX_KEY) in the environment.
 */

const { Pool } = require('pg');
const logger = require('../src/config/logger');
const { encrypt, decrypt } = require('../src/utils/crypto');

/**
 * Tables whose _enc-suffixed columns contain encrypted PII.
 * The primary-key column is included so we can UPDATE by PK.
 */
const ENCRYPTED_TABLES = {
    patients: {
        pkColumn: 'patient_id',
        columns: [
            'first_name_enc', 'last_name_enc', 'date_of_birth_enc',
            'phone_enc', 'address_enc', 'national_id_enc', 'passport_number_enc',
            'email_enc', 'emergency_contact_name_enc', 'emergency_contact_phone_enc',
            'emergency_contact_address_enc', 'allergies_enc', 'chronic_diseases_enc',
            'prior_surgeries_enc', 'implants_devices_enc', 'renal_function_notes_enc'
        ]
    },
    users: {
        pkColumn: 'user_id',
        columns: ['two_factor_secret_enc']
    },
    notification_jobs: {
        pkColumn: 'job_id',
        columns: ['recipient_contact_enc']
    }
};

/**
 * Tables that store encrypted values in columns WITHOUT the _enc suffix.
 * These are also encrypted via encrypt() at write time.
 */
const ENCRYPTED_NON_SUFFIX_TABLES = {
    integrations: {
        pkColumn: 'integration_id',
        columns: ['api_key', 'api_secret']
    },
    notifications: {
        pkColumn: 'notification_id',
        columns: ['recipient', 'subject', 'content']
    }
};

function isLegacyCbcFormat(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.startsWith('v2:')) return false;
    const parts = value.split(':');
    if (parts.length !== 2) return false;
    return /^[0-9a-fA-F]+$/.test(parts[0]) && /^[0-9a-fA-F]+$/.test(parts[1]);
}

async function reencryptTable(pool, table, config) {
    const { pkColumn, columns } = config;
    let totalScanned = 0;
    let totalReencrypted = 0;
    let totalSkipped = 0;

    const client = await pool.connect();
    await client.query('BEGIN');

    try {
        for (const column of columns) {
            const selectResult = await client.query(
                `SELECT ${pkColumn}, ${column} FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`
            );

            for (const row of selectResult.rows) {
                totalScanned++;
                const value = row[column];

                if (value && typeof value === 'string' && value.startsWith('v2:')) {
                    totalSkipped++;
                    continue;
                }

                if (!isLegacyCbcFormat(value)) {
                    totalSkipped++;
                    continue;
                }

                try {
                    const decrypted = decrypt(value);
                    if (decrypted === null || decrypted === undefined) {
                        logger.warn(`[Migration] Decrypted to null, skipping`, { table, column, id: row[pkColumn] });
                        totalSkipped++;
                        continue;
                    }

                    const reencrypted = encrypt(decrypted);
                    await client.query(
                        `UPDATE ${table} SET ${column} = $1 WHERE ${pkColumn} = $2`,
                        [reencrypted, row[pkColumn]]
                    );
                    totalReencrypted++;
                } catch (err) {
                    logger.error(`[Migration] Failed to re-encrypt row`, {
                        table, column, id: row[pkColumn], error: err.message
                    });
                }
            }
        }

        await client.query('COMMIT');
        logger.info(`[Migration] ${table} complete`, { totalScanned, totalReencrypted, totalSkipped });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`[Migration] ${table} failed`, { error: err.message });
        throw err;
    } finally {
        client.release();
    }

    return { totalScanned, totalReencrypted, totalSkipped };
}

async function reencryptSystemSettings(pool) {
    let totalScanned = 0;
    let totalReencrypted = 0;
    let totalSkipped = 0;

    const client = await pool.connect();
    await client.query('BEGIN');

    try {
        const result = await client.query(
            `SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE '%_enc' AND setting_value IS NOT NULL AND setting_value != ''`
        );

        for (const row of result.rows) {
            totalScanned++;
            const value = row.setting_value;

            if (value && typeof value === 'string' && value.startsWith('v2:')) {
                totalSkipped++;
                continue;
            }

            if (!isLegacyCbcFormat(value)) {
                totalSkipped++;
                continue;
            }

            try {
                const decrypted = decrypt(value);
                if (decrypted === null || decrypted === undefined) {
                    logger.warn(`[Migration] Decrypted to null, skipping`, { key: row.setting_key });
                    totalSkipped++;
                    continue;
                }

                const reencrypted = encrypt(decrypted);
                await client.query(
                    `UPDATE system_settings SET setting_value = $1 WHERE setting_key = $2`,
                    [reencrypted, row.setting_key]
                );
                totalReencrypted++;
            } catch (err) {
                logger.error(`[Migration] Failed to re-encrypt setting`, {
                    key: row.setting_key, error: err.message
                });
            }
        }

        await client.query('COMMIT');
        logger.info(`[Migration] system_settings complete`, { totalScanned, totalReencrypted, totalSkipped });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`[Migration] system_settings failed`, { error: err.message });
        throw err;
    } finally {
        client.release();
    }

    return { totalScanned, totalReencrypted, totalSkipped };
}

async function tableExists(pool, table) {
    const result = await pool.query(
        'SELECT 1 FROM information_schema.tables WHERE table_name = $1',
        [table]
    );
    return result.rows.length > 0;
}

async function columnExists(pool, table, column) {
    const result = await pool.query(
        'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
        [table, column]
    );
    return result.rows.length > 0;
}

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    logger.info('[Migration] Starting AES-CBC → AES-GCM re-encryption');

    let grandTotal = { scanned: 0, reencrypted: 0, skipped: 0 };

    for (const [table, config] of Object.entries(ENCRYPTED_TABLES)) {
        const exists = await tableExists(pool, table);
        if (!exists) {
            logger.info(`[Migration] Table ${table} does not exist, skipping`);
            continue;
        }

        const columns = [];
        for (const col of config.columns) {
            if (await columnExists(pool, table, col)) {
                columns.push(col);
            } else {
                logger.warn(`[Migration] Column ${table}.${col} does not exist, skipping`);
            }
        }

        if (columns.length === 0) continue;

        const stats = await reencryptTable(pool, table, { ...config, columns });
        grandTotal.scanned += stats.totalScanned;
        grandTotal.reencrypted += stats.totalReencrypted;
        grandTotal.skipped += stats.totalSkipped;
    }

    for (const [table, config] of Object.entries(ENCRYPTED_NON_SUFFIX_TABLES)) {
        const exists = await tableExists(pool, table);
        if (!exists) {
            logger.info(`[Migration] Table ${table} does not exist, skipping`);
            continue;
        }

        const columns = [];
        for (const col of config.columns) {
            if (await columnExists(pool, table, col)) {
                columns.push(col);
            } else {
                logger.warn(`[Migration] Column ${table}.${col} does not exist, skipping`);
            }
        }

        if (columns.length === 0) continue;

        const stats = await reencryptTable(pool, table, { ...config, columns });
        grandTotal.scanned += stats.totalScanned;
        grandTotal.reencrypted += stats.totalReencrypted;
        grandTotal.skipped += stats.totalSkipped;
    }

    if (await tableExists(pool, 'system_settings')) {
        const stats = await reencryptSystemSettings(pool);
        grandTotal.scanned += stats.totalScanned;
        grandTotal.reencrypted += stats.totalReencrypted;
        grandTotal.skipped += stats.totalSkipped;
    }

    logger.info('[Migration] Complete', grandTotal);
    await pool.end();
}

main().catch((err) => {
    logger.error('[Migration] Fatal error', { error: err.message, stack: err.stack });
    process.exit(1);
});
