/**
 * One-time migration: rehash patient first_name_hash and last_name_hash using
 * lowercase normalization so case-insensitive search works for existing records.
 *
 * Run: node backend/scripts/rehashPatientNames.js
 *
 * Safe to run multiple times (idempotent).
 */
'use strict';

const path = require('path');
const fs = require('fs');

// Load .env from project root
const rootEnv = path.resolve(__dirname, '../../.env');
const backendEnv = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: fs.existsSync(rootEnv) ? rootEnv : backendEnv });

if (!process.env.DATABASE_URL && process.env.POSTGRES_PASSWORD) {
    const user = encodeURIComponent(process.env.POSTGRES_USER || 'VIARA');
    const pass = encodeURIComponent(process.env.POSTGRES_PASSWORD);
    const db   = encodeURIComponent(process.env.POSTGRES_DB || 'VIARA');
    const port = process.env.POSTGRES_PORT || '5432';
    process.env.DATABASE_URL = `postgresql://${user}:${pass}@127.0.0.1:${port}/${db}`;
}

const { Pool } = require('pg');
const { createHmac } = require('crypto');

const BLIND_INDEX_KEY = process.env.BLIND_INDEX_KEY;
if (!BLIND_INDEX_KEY) {
    console.error('❌  BLIND_INDEX_KEY is not set. Cannot rehash patient names.');
    process.exit(1);
}

// Replicate exactly the same HMAC hash used by the backend crypto utility.
function hash(value) {
    if (!value) return null;
    return createHmac('sha256', Buffer.from(BLIND_INDEX_KEY, 'hex'))
        .update(String(value))
        .digest('hex');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    const client = await pool.connect();
    let updated = 0;
    let skipped = 0;

    try {
        console.log('🔄  Fetching patients with encrypted names...');
        const { decrypt } = require(path.resolve(__dirname, '../src/utils/crypto'));

        const result = await client.query(
            'SELECT patient_id, first_name_enc, last_name_enc, first_name_hash, last_name_hash FROM patients WHERE first_name_enc IS NOT NULL ORDER BY created_at'
        );

        console.log(`📋  Found ${result.rows.length} patients to check.`);

        for (const row of result.rows) {
            const firstName = decrypt(row.first_name_enc);
            const lastName  = decrypt(row.last_name_enc);
            if (!firstName && !lastName) { skipped++; continue; }

            const newFirstHash = firstName ? hash(firstName.toLowerCase()) : null;
            const newLastHash  = lastName  ? hash(lastName.toLowerCase())  : null;

            // Skip if already correct
            if (newFirstHash === row.first_name_hash && newLastHash === row.last_name_hash) {
                skipped++;
                continue;
            }

            await client.query(
                'UPDATE patients SET first_name_hash = $1, last_name_hash = $2 WHERE patient_id = $3',
                [newFirstHash, newLastHash, row.patient_id]
            );
            updated++;
        }

        console.log(`✅  Done. Updated: ${updated}, Already correct: ${skipped}`);
    } catch (err) {
        console.error('❌  Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
