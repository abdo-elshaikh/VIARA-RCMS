require('dotenv').config();
const { Pool } = require('pg');
const { encrypt, decrypt } = require('../src/utils/crypto');

const activePrefix = () => `v2:${process.env.ENCRYPTION_KEY_ID || 'default'}:`;
const isEncrypted = value => String(value || '').startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(String(value || ''));
const plaintext = value => isEncrypted(value) ? decrypt(value) : value;

const targets = [
    {
        table: 'patients', key: 'patient_id',
        columns: ['first_name_enc', 'last_name_enc', 'date_of_birth_enc', 'phone_enc', 'address_enc',
            'email_enc', 'national_id_enc', 'passport_number_enc', 'emergency_contact_name_enc',
            'emergency_contact_phone_enc', 'emergency_contact_address_enc', 'allergies_enc',
            'chronic_diseases_enc', 'prior_surgeries_enc', 'implants_devices_enc', 'renal_function_notes_enc']
    },
    { table: 'integrations', key: 'integration_id', columns: ['api_key', 'api_secret'] },
    { table: 'notifications', key: 'notification_id', columns: ['recipient', 'subject', 'content'] }
];

const rotateTarget = async (client, target) => {
    const rows = await client.query(`SELECT ${target.key}, ${target.columns.join(', ')} FROM ${target.table}`);
    let changed = 0;
    for (const row of rows.rows) {
        const updates = [];
        const values = [];
        for (const column of target.columns) {
            const value = row[column];
            if (!value || String(value).startsWith(activePrefix())) continue;
            values.push(encrypt(plaintext(value)));
            updates.push(`${column} = $${values.length}`);
        }
        if (!updates.length) continue;
        values.push(row[target.key]);
        await client.query(
            `UPDATE ${target.table} SET ${updates.join(', ')} WHERE ${target.key} = $${values.length}`,
            values
        );
        changed += 1;
    }
    return changed;
};

const main = async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const target of targets) {
            const count = await rotateTarget(client, target);
            console.log(`${target.table}: re-encrypted ${count} rows`);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
};

main().catch(error => {
    console.error(`Encryption rotation failed: ${error.message}`);
    process.exitCode = 1;
});
