// Review-only API process, no jobs; PostgreSQL enforces read-only transactions.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const dotenv = require(path.join(root, 'backend/node_modules/dotenv'));
const rootEnv = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
const backendEnv = dotenv.parse(fs.readFileSync(path.join(root, 'backend/.env')));
const database = new URL(backendEnv.DATABASE_URL);
database.searchParams.set('options', '-c default_transaction_read_only=on');
Object.assign(process.env, rootEnv, backendEnv, { NODE_ENV: 'test', PORT: '5310', DATABASE_URL: database.toString(), PERF_TEST: 'false', LICENSE_KEY: '', ALLOWED_ORIGINS: 'http://127.0.0.1:5190,http://127.0.0.1:5191' });
const app = require(path.join(root, 'backend/src/server'));
const server = app.listen(5310, '127.0.0.1', () => console.log('Review API listening on loopback 5310; database read-only, background jobs disabled.'));
process.on('SIGINT', () => server.close(() => process.exit(0)));
