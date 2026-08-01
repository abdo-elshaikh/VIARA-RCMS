const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
    upsertDeveloperUser,
    validateDeveloperPassword
} = require('../src/services/developerSeedService');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

const readArg = (name) => {
    const prefix = `--${name}=`;
    const match = process.argv.find(arg => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : '';
};

const generatePassword = () => `${crypto.randomBytes(15).toString('base64url')}A1!`;

async function createDeveloper() {
    const email = String(readArg('email') || process.env.DEVELOPER_EMAIL || 'developer@rcms.com').trim().toLowerCase();
    const fullName = String(readArg('name') || process.env.DEVELOPER_FULL_NAME || 'System Developer').trim();
    const providedPassword = String(readArg('password') || process.env.DEVELOPER_PASSWORD || '');
    const password = providedPassword || generatePassword();
    const mustChangePassword = process.env.DEVELOPER_FORCE_PASSWORD_CHANGE !== 'false';

    try {
        validateDeveloperPassword(password);
        const user = await upsertDeveloperUser(pool, {
            email,
            password,
            fullName,
            mustChangePassword
        });

        console.log('Developer account ready.');
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
        console.log(`User ID: ${user.user_id}`);
        console.log(`Temporary password: ${password}`);
        console.log(`Must change password: ${mustChangePassword ? 'yes' : 'no'}`);
        if (!providedPassword) {
            console.log('Store this generated password now; it will not be shown again.');
        }
    } catch (error) {
        console.error(`Developer account setup failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

createDeveloper();
