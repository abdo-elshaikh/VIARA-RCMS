require('dotenv').config();
const { Pool } = require('pg');

console.log('--- Debugging Environment ---');
console.log('PORT:', process.env.PORT);
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
    console.log('DATABASE_URL found:', dbUrl.replace(/:[^:]*@/, ':****@')); // Mask password
} else {
    console.log('ERROR: DATABASE_URL is undefined');
}

console.log('--- Attempting Connection ---');

const pool = new Pool({
    connectionString: dbUrl,
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Connection Failed:', err);
    } else {
        console.log('Connection Successful:', res.rows[0]);
    }
    pool.end();
});
