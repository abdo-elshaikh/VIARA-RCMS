const { Pool } = require('pg');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
    upsertDeveloperUser,
    validateDeveloperPassword
} = require('../src/services/developerSeedService');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/VIARA'
});

const readArg = (name) => {
    const prefix = `--${name}=`;
    const match = process.argv.find(arg => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : '';
};

const generatePassword = () => `${crypto.randomBytes(15).toString('base64url')}A1!`;
const isRunningInsideDocker = () => fs.existsSync('/.dockerenv') || process.env.RUNNING_IN_DOCKER === 'true';

const formatArg = (name, value) => (value ? `--${name}=${value}` : null);

const runInsideDockerBackend = ({ email, fullName, password, mustChangePassword }) => {
    if (isRunningInsideDocker()) return false;

    try {
        execFileSync('docker', [
            'exec',
            '-e', `DEVELOPER_FORCE_PASSWORD_CHANGE=${mustChangePassword ? 'true' : 'false'}`,
            'VIARA_backend',
            'node',
            'scripts/createDeveloper.js',
            formatArg('email', email),
            formatArg('name', fullName),
            formatArg('password', password),
        ].filter(Boolean), { stdio: 'inherit' });
        return true;
    } catch (error) {
        console.error('Docker fallback for developer bootstrap failed.');
        console.error(`Message: ${error?.message || String(error)}`);
        if (error?.stack) {
            console.error(error.stack);
        }
        return false;
    }
};

async function createDeveloper() {
    const email = String(readArg('email') || process.env.DEVELOPER_EMAIL || 'developer@VIARA.com').trim().toLowerCase();
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
        const shouldFallbackToDocker = ['ECONNREFUSED', '28P01'].includes(error?.code)
            || /password authentication failed|connect ECONNREFUSED/i.test(error?.message || '');

        if (shouldFallbackToDocker) {
            console.warn('Local database connection failed; trying the Docker backend container instead.');
            const dockerSucceeded = runInsideDockerBackend({ email, fullName, password, mustChangePassword });
            if (dockerSucceeded) {
                return;
            }
        }

        console.error('Developer account setup failed.');
        console.error(`Message: ${error?.message || String(error)}`);
        if (error?.code) {
            console.error(`Code: ${error.code}`);
        }
        if (error?.detail) {
            console.error(`Detail: ${error.detail}`);
        }
        if (error?.hint) {
            console.error(`Hint: ${error.hint}`);
        }
        if (error?.stack) {
            console.error(error.stack);
        }
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

createDeveloper();
