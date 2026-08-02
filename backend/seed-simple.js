/**
 * SIMPLE WORKING SEED - Uses only schema.sql columns
 */
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});
const seedPassword = process.env.TEST_USER_PASSWORD;
if (!seedPassword) {
    console.error('❌ TEST_USER_PASSWORD is not set. Aborting simple seed to avoid weak defaults.');
    process.exit(1);
}

// Encryption
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key-here-change-this';
const encrypt = (text) => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
};

// Utilities
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

const egyptianNames = {
    male: ['Ahmed', 'Mohamed', 'Mahmoud', 'Ali', 'Omar'],
    female: ['Fatma', 'Mona', 'Heba', 'Nour', 'Sara']
};
const lastNames = ['Ibrahim', 'Hassan', 'Ali', 'Mohamed', 'Mahmoud'];

async function main() {
    console.log('🚀 Quick Database Seed\\n');

    try {
        // Clear
        await pool.query('TRUNCATE users, patients, modalities, appointments, examinations CASCADE');
        console.log('✓ Cleared tables');

        // Users
            const password = await bcrypt.hash(seedPassword, 10);
        const users = [
            ['Admin', 'admin@rcms.com', 'Admin'],
            ['Receptionist', 'reception@rcms.com', 'Receptionist'],
            ['Dr. Hassan', 'doctor@rcms.com', 'Radiologist'],
        ];

        const userIds = [];
        for (const [name, email, role] of users) {
            const r = await pool.query(
                'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id',
                [name, email, password, role]
            );
            userIds.push(r.rows[0].user_id);
        }
        console.log('✓ Created', users.length, 'users');

        // Modalities
        const mods = [['MRI-01', 'MRI', 'R101'], ['CT-01', 'CT', 'R201'], ['X-Ray-01', 'X-Ray', 'R301']];
        const modalityIds = [];
        for (const [name, type, room] of mods) {
            const r = await pool.query(
                'INSERT INTO modalities (name, type, room_number, status) VALUES ($1, $2, $3, $4) RETURNING modality_id',
                [name, type, room, 'Active']
            );
            modalityIds.push(r.rows[0].modality_id);
        }
        console.log('✓ Created', mods.length, 'modalities');

        // Patients
        const patientIds = [];
        for (let i = 0; i < 50; i++) {
            const gender = randomElement(['Male', 'Female']);
            const first = randomElement(egyptianNames[gender.toLowerCase()]);
            const last = randomElement(lastNames);
            const r = await pool.query(
                'INSERT INTO patients (mrn, first_name_enc, last_name_enc, date_of_birth_enc, phone_enc, gender) VALUES ($1, $2, $3, $4, $5, $6) RETURNING patient_id',
                [`PAT-${String(i + 1).padStart(5, '0')}`, encrypt(first), encrypt(last), encrypt('1990-01-01'), encrypt('01012345678'), gender]
            );
            patientIds.push(r.rows[0].patient_id);
        }
        console.log('✓ Created', patientIds.length, 'patients');

        // Appointments & Exams
        const now = new Date();
        const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        let count = 0;

        for (let i = 0; i < 100; i++) {
            try {
                const time = randomDate(past, now);
                const appt = await pool.query(
                    'INSERT INTO appointments (patient_id, modality_id, start_time, end_time, status, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING appointment_id',
                    [randomElement(patientIds), randomElement(modalityIds), time, new Date(time.getTime() + 30 * 60000), 'Confirmed', userIds[0]]
                );

                if (time < now && Math.random() > 0.3) {
                    await pool.query(
                        'INSERT INTO examinations (appointment_id, patient_id, modality_id, performing_radiologist_id, status) VALUES ($1, $2, $3, $4, $5)',
                        [appt.rows[0].appointment_id, randomElement(patientIds), randomElement(modalityIds), userIds[2], randomElement(['Finalized', 'Reporting', 'Scheduled'])]
                    );
                }
                count++;
            } catch (e) {
                // Skip conflicts
            }
        }
        console.log('✓ Created', count, 'appointments');

        console.log('\\n✅ Seed complete!');
            console.log('Login credentials are provisioned by deployment and not displayed here.');

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await pool.end();
    }
}

main();
