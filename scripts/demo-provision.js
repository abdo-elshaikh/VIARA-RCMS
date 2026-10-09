#!/usr/bin/env node
'use strict';

/**
 * demo-provision.js — provision and reclaim isolated VIARA demo stacks.
 *
 * Each demo is a separate Compose project with its own PostgreSQL and its own
 * Orthanc volume. Isolation is at the database boundary, not in application code:
 * VIARA has no tenant scoping, so two prospects must never share a database.
 * See docs/adr-001-demo-isolation.md.
 *
 * Commands
 *   provision --customer <name> [--days N] [--email a@b.c]
 *   list
 *   reclaim  --customer <name> [--yes]
 *   reap     [--yes]
 *
 * Destructive commands (reclaim, reap) refuse to touch anything the tool did not
 * create. See assertOwnedProject() in demoLeaseStore.js.
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const store = require('./lib/demoLeaseStore');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE = [
    '-f', path.join(ROOT, 'docker-compose.yml'),
    '-f', path.join(ROOT, 'docker-compose.demo.yml'),
];

// Host ports are handed to each demo via an env file, so the base compose file
// needs no per-demo edits. The base defaults are untouched.
const PORT_KEYS = {
    POSTGRES_PORT: 55432,
    BACKEND_PORT: 53000,
    FRONTEND_PORT: 55173,
    PORTAL_PORT: 55174,
    ORTHANC_REST_PORT: 58042,
    PACS_DICOM_PORT: 54242,
    OHIF_PORT: 53005,
};

// Regenerated per demo. These must never be copied from the main stack: a demo
// sharing JWT_SECRET would let anyone who reaches it forge production sessions.
// All are 32 bytes of hex, matching the length used by the main .env.
const SECRET_KEYS = [
    'POSTGRES_PASSWORD',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'BACKUP_ENCRYPTION_KEY',
    'BLIND_INDEX_KEY',
    'ORTHANC_PASSWORD',
    'PACS_WEBHOOK_SECRET',
    // backend/seed.js refuses to run without this rather than fall back to a
    // committed default. Giving each demo its own means a leaked demo credential
    // cannot be reused against another demo or the main stack.
    'TEST_USER_PASSWORD',
];

// Required by docker-compose (`:?`) and baked into the frontend image at build
// time, so they must be re-pointed at the demo's own ports.
const REQUIRED_URL_KEYS = [
    'CLIENT_URL',
    'PORTAL_CLIENT_URL',
    'ALLOWED_ORIGINS',
    'WEBAUTHN_ORIGIN',
    'WEBAUTHN_RP_ID',
    'VITE_OHIF_URL',
    'PORTAL_PUBLIC_URL',
];

const generateSecrets = () => Object.fromEntries(
    SECRET_KEYS.map((k) => [k, crypto.randomBytes(32).toString('hex')])
);

const demoUrl = (portKey, scheme) => `${scheme}://localhost:${PORT_KEYS[portKey]}`;

// ── argument parsing ──────────────────────────────────────────────────────

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const opts = {};
    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        const next = rest[i + 1];
        if (next && !next.startsWith('--')) {
            opts[key] = next;
            i += 1;
        } else {
            opts[key] = true;
        }
    }
    return { command, opts };
}

const isoNow = () => new Date().toISOString();

// ── compose wrapper ───────────────────────────────────────────────────────

function compose(project, args, { envFile, allowFailure = false } = {}) {
    const full = ['-p', project, ...COMPOSE, ...(envFile ? ['--env-file', envFile] : []), ...args];
    try {
        return execFileSync('docker', ['compose', ...full], {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (err) {
        if (allowFailure) return null;
        process.stderr.write((err.stderr || err.message || '').toString());
        throw err;
    }
}

/**
 * Compose reports "no such service" and missing containers as non-zero exits.
 * Treat those as a no-op so reclaiming an already-torn-down stack is safe.
 */
function composeQuiet(project, args, envFile) {
    return compose(project, args, { envFile, allowFailure: true });
}

// ── env file ──────────────────────────────────────────────────────────────

function writeEnvFile(project, lease, licenseKey) {
    const path_ = path.join(ROOT, 'scratch', 'demos', `${project}.env`);
    fs.mkdirSync(path.dirname(path_), { recursive: true });

    // A demo must never inherit the main stack's secrets. JWT_SECRET in
    // particular: sharing it would let anyone who reaches the demo forge a
    // production session token. Generate fresh values instead of copying.
    const baseEnv = path.join(ROOT, '.env');
    if (!fs.existsSync(baseEnv)) {
        throw new Error('.env not found; a demo env cannot be generated.');
    }

    const inherited = fs.readFileSync(baseEnv, 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line));

    // DATABASE_URL must be re-pointed as well: inheriting the main one would
    // run the seed against the main stack's database.
    const overridden = new Set([
        ...Object.keys(PORT_KEYS), ...SECRET_KEYS, ...REQUIRED_URL_KEYS,
        'LICENSE_KEY', 'DATABASE_URL',
    ]);

    const kept = inherited.filter((line) => {
        const key = line.slice(0, line.indexOf('='));
        return !overridden.has(key);
    });

    const inheritedValue = (key) => {
        const line = inherited.find((l) => l.startsWith(`${key}=`));
        return line ? line.slice(key.length + 1) : undefined;
    };

    const secrets = generateSecrets();
    const portLines = Object.entries(PORT_KEYS).map(([k, v]) => `${k}=${v}`);
    const secretLines = Object.entries(secrets).map(([k, v]) => `${k}=${v}`);

    // These two are required by docker-compose (`:?`) and are baked into the
    // frontend at build time, so they must point at the demo's own ports rather
    // than the main stack's.
    const frontendUrl = demoUrl('FRONTEND_PORT', 'http');
    const portalUrl = demoUrl('PORTAL_PORT', 'http');
    const urlLines = [
        `CLIENT_URL=${frontendUrl}`,
        `PORTAL_CLIENT_URL=${portalUrl}`,
        `ALLOWED_ORIGINS=${frontendUrl},${portalUrl}`,
        `WEBAUTHN_ORIGIN=${frontendUrl}`,
        'WEBAUTHN_RP_ID=localhost',
        `VITE_OHIF_URL=${demoUrl('OHIF_PORT', 'http')}`,
        `PORTAL_PUBLIC_URL=${portalUrl}`,
    ];

    // Host-side URL, used by the seed and by any operator tooling. The compose
    // file builds its own container-internal URL from the same credentials.
    const dbUser = inheritedValue('POSTGRES_USER') || 'VIARA';
    const dbName = inheritedValue('POSTGRES_DB') || 'VIARA';
    const databaseUrl =
        `postgresql://${dbUser}:${secrets.POSTGRES_PASSWORD}`
        + `@127.0.0.1:${PORT_KEYS.POSTGRES_PORT}/${dbName}`;

    const demoLines = [
        `VIARA_DEMO_PROJECT=${project}`,
        `VIARA_DEMO_CUSTOMER=${lease.customerId}`,
        `VIARA_DEMO_CUSTOMER_NAME=${lease.displayName}`,
        `DATABASE_URL=${databaseUrl}`,
        `LICENSE_KEY=${licenseKey}`,
    ];

    fs.writeFileSync(
        path_,
        [...kept, ...portLines, ...secretLines, ...urlLines, ...demoLines].join('\n') + '\n',
        { encoding: 'utf8', mode: 0o600 }
    );
    return path_;
}

/**
 * Issue a real short-dated trial licence by delegating to the vendor tool.
 * The key is written only into the demo env file — never into the lease ledger.
 */
function issueLicense(customerId, days, maxUsers) {
    const stdout = execFileSync('node', [
        path.join(ROOT, 'scripts', 'generate-license.js'),
        '--customer', customerId,
        '--edition', 'trial',
        '--days', String(days),
        '--max-users', String(maxUsers),
    ], { cwd: ROOT, encoding: 'utf8' });

    const lines = stdout.split(/\r?\n/);
    const marker = lines.findIndex((l) => l.includes('LICENSE KEY'));
    if (marker === -1) {
        throw new Error('generate-license.js produced no licence key');
    }
    const key = lines.slice(marker + 1).map((l) => l.trim())
        .find((l) => l && !l.startsWith('---'));
    if (!key) {
        throw new Error('could not parse the licence key from generate-license.js output');
    }
    return key;
}

/** Parse a generated demo env file into a plain object. */
function readEnvFile(file) {
    const out = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

/**
 * Load the demo dataset.
 *
 * backend/seed.js already produces a realistic radiology workload — 16 users
 * across every role, patients, appointments, examinations, insurance, inventory
 * and CRM — so it is reused rather than replaced. A prospect opening an empty
 * VIARA learns nothing from it.
 *
 * Two details matter:
 *  - dotenv does not override variables already present, so passing these in the
 *    child environment is what redirects the seed at the demo database and the
 *    demo's own keys, instead of the root .env.
 *  - ENCRYPTION_KEY must be the demo's. Patient names are stored AES-GCM
 *    encrypted, so seeding with a different key than the running server uses
 *    would make every seeded record permanently unreadable.
 */
function runSeed(envFile) {
    const env = readEnvFile(envFile);
    if (!env.DATABASE_URL) {
        throw new Error(`demo env ${envFile} has no DATABASE_URL`);
    }
    if (!env.TEST_USER_PASSWORD) {
        throw new Error(`demo env ${envFile} has no TEST_USER_PASSWORD; seed.js refuses to run`);
    }

    execFileSync('node', [path.join(ROOT, 'backend', 'seed.js')], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

// ── commands ──────────────────────────────────────────────────────────────

function cmdProvision(opts) {
    const customer = opts.customer;
    if (!customer || customer === true) {
        throw new Error('--customer <name> is required');
    }
    if (opts['display-name'] === true) {
        throw new Error('--display-name requires a value');
    }

    const days = Number(opts.days || 14);
    const maxUsers = Number(opts['max-users'] || opts.maxUsers || 3);
    const lease = store.createLease({
        customerId: customer,
        displayName: opts['display-name'],
        contactEmail: opts.email === true ? undefined : opts.email,
        days,
    });

    const label = lease.displayName ? ` for ${lease.displayName}` : '';
    process.stdout.write(`Provisioned lease ${lease.project}${label} (${days} days, expires ${lease.expiresAt.slice(0, 10)})\n`);

    // Start the stack. On failure the lease stays in `reclaim_requested` so the
    // reaper tears the partial stack down rather than leaking it.
    try {
        // Issue the licence with the same window as the lease, so the stack
        // cannot outlive its own registration in the ledger.
        const licenseKey = issueLicense(customer, days, maxUsers);
        process.stdout.write('Issued trial licence.\n');

        const envFile = writeEnvFile(lease.project, lease, licenseKey);
        process.stdout.write('Starting stack...\n');

        // Bring up the database and cache first and wait for health before
        // running the one-shot migration container. Some Docker engines report
        // a dependency as started before Postgres is accepting connections.
        compose(lease.project, ['up', '-d', '--wait', 'postgres', 'redis'], { envFile });
        process.stdout.write('Applying database migrations...\n');
        compose(lease.project, ['up', 'migrate'], { envFile });
        compose(lease.project, ['up', '-d', 'backend', 'frontend', 'portal', 'orthanc', 'ohif'], { envFile });

        // The compose `migrate` service has applied every migration by the time
        // `up -d` returns, so the database is ready to receive demo data.
        process.stdout.write('Loading demo dataset...\n');
        runSeed(envFile);

        process.stdout.write(`\nReady: ${lease.project}${label}\nEnv file: ${envFile}\n`);
        process.stdout.write('Portal accounts: admin@VIARA.com and 15 more, all using the demo password.\n');
    } catch (err) {
        store.markReclaimRequested(customer);
        process.stderr.write(`\nStart failed. Lease marked for reclamation: ${lease.project}\n`);
        throw err;
    }
}

function cmdList() {
    const leases = store.listLeases();
    if (leases.length === 0) {
        process.stdout.write('No demo leases.\n');
        return;
    }
    const now = new Date();
    const rows = leases.map((l) => [
        l.displayName || l.customerId,
        l.customerId,
        l.project,
        l.status,
        String(store.daysRemaining(l, now)),
    ]);
    const head = ['CUSTOMER', 'CUSTOMER ID', 'PROJECT', 'STATUS', 'DAYS LEFT'];
    const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const line = (cells) => cells.map((c, i) => c.padEnd(width[i])).join('  ');
    process.stdout.write(`${line(head)}\n${line(width.map((w) => '-'.repeat(w)))}\n`);
    for (const r of rows) process.stdout.write(`${line(r)}\n`);
}

function cmdReclaim(opts, { assumeYes }) {
    const customer = opts.customer;
    if (!customer || customer === true) {
        throw new Error('--customer <name> is required');
    }

    const lease = store.getLease(customer);
    if (!lease) throw new Error(`no demo lease for "${customer}"`);

    // The guard: fails closed for anything not created under viara-demo-*.
    store.assertOwnedProject(lease.project);

    if (lease.status === store.STATUS.RECLAIMED) {
        process.stdout.write(`${lease.project} is already reclaimed.\n`);
        return;
    }

    if (!assumeYes) {
        process.stdout.write(
            `This DELETES containers and volumes for ${lease.project}, including all prospect data.\n`
            + `Type the project name to confirm: `
        );
        const answer = readLineSync();
        if (answer.trim() !== lease.project) {
            process.stdout.write('Aborted.\n');
            return;
        }
    }

    store.markReclaimRequested(customer);

    // Both the project flag and the ownership guard are required. Volumes are
    // removed so a reclaimed demo does not leave patient data on disk.
    composeQuiet(lease.project, ['down', '--volumes', '--remove-orphans']);
    const envFile = path.join(ROOT, 'scratch', 'demos', `${lease.project}.env`);
    fs.rmSync(envFile, { force: true });

    store.markReclaimed(customer);
    auditLog('RECLAIM', { project: lease.project, customer: lease.customerId, at: isoNow() });
    process.stdout.write(`Reclaimed ${lease.project} (containers and volumes removed).\n`);
}

/**
 * Append an audit line for scheduled runs.
 *
 * The reaper deletes volumes holding patient data. When it runs unattended its
 * stdout goes to a scheduler log that nobody reads and that is rotated away, so
 * the record of what was destroyed has to be durable and separate.
 */
function auditLog(action, details) {
    const line = `${new Date().toISOString()} ${action} ${JSON.stringify(details)}`;
    try {
        const dir = path.join(ROOT, 'scratch', 'demos');
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(path.join(dir, 'reap-audit.log'), line + '\n', { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
        // Never let a logging failure mask the operation's own error.
        process.stderr.write(`audit log write failed: ${err.message}\n`);
    }
}

function cmdReap(opts, { assumeYes }) {
    const dryRun = opts['dry-run'] === true;
    const expired = store.findExpired();

    if (expired.length === 0) {
        process.stdout.write('No expired demos to reap.\n');
        return;
    }

    const totalDays = expired.reduce((n, l) => n + Math.abs(store.daysRemaining(l)), 0);
    process.stdout.write(
        `Expired demos: ${expired.map((l) => `${l.project} (${store.daysRemaining(l)}d over)`).join(', ')}\n`
    );

    if (dryRun) {
        process.stdout.write(`\nDry run — nothing was changed. ${expired.length} stack(s), ~${totalDays}d past expiry.\n`);
        auditLog('REAP_DRY_RUN', { projects: expired.map((l) => l.project), daysOverdue: totalDays });
        return;
    }

    if (!assumeYes) {
        throw new Error(
            `Reaping deletes volumes (${expired.length} stack(s), ~${totalDays}d past expiry). `
            + 'Re-run with --yes to confirm, or --dry-run to preview.'
        );
    }

    // One failure must not strand the remaining leases, and the summary must be
    // written even if a stack refuses to come down.
    const results = { reaped: [], failed: [] };
    for (const lease of expired) {
        try {
            store.assertOwnedProject(lease.project);
            store.markReclaimRequested(lease.customerId);
            composeQuiet(lease.project, ['down', '--volumes', '--remove-orphans']);
            store.markReclaimed(lease.customerId);
            results.reaped.push(lease.project);
            process.stdout.write(`Reaped ${lease.project}\n`);
        } catch (err) {
            results.failed.push({ project: lease.project, error: err.message });
            process.stderr.write(`Failed ${lease.project}: ${err.message}\n`);
        }
    }

    auditLog('REAP', { ...results, at: isoNow() });
    process.stdout.write(`\nReaped ${results.reaped.length}, failed ${results.failed.length}. Audit: scratch/demos/reap-audit.log\n`);
}

// ── stdin confirm ─────────────────────────────────────────────────────────

function readLineSync() {
    const buf = Buffer.alloc(256);
    let bytes = 0;
    // Synchronous read so the confirmation works without pulling in a dep.
    const fsSync = require('fs');
    while (bytes < buf.length) {
        let n;
        try {
            n = fsSync.readSync(0, buf, bytes, buf.length - bytes, null);
        } catch (e) {
            if (e.code === 'EAGAIN') continue;
            throw e;
        }
        if (n === 0) break;
        bytes += n;
        if (buf.slice(0, bytes).includes(0x0a)) break;
    }
    return buf.slice(0, bytes).toString('utf8');
}

// ── entry ─────────────────────────────────────────────────────────────────

const USAGE = `VIARA demo provisioning

  node scripts/demo-provision.js provision --customer <name> [--days N] [--email a@b.c] [--max-users N]
  node scripts/demo-provision.js list
  node scripts/demo-provision.js reclaim  --customer <name>
  node scripts/demo-provision.js reap     [--dry-run] [--yes]

Destructive commands (reclaim, reap) remove containers AND volumes. Every
destruction is appended to scratch/demos/reap-audit.log.
`;

function main() {
    const { command, opts } = parseArgs(process.argv.slice(2));
    const assumeYes = opts.yes === true;

    switch (command) {
        case 'provision': return cmdProvision(opts);
        case 'list': return cmdList();
        case 'reclaim': return cmdReclaim(opts, { assumeYes });
        case 'reap': return cmdReap(opts, { assumeYes });
        case undefined:
        case 'help':
        case '--help': return void process.stdout.write(USAGE);
        default:
            process.stderr.write(`Unknown command "${command}"\n\n${USAGE}`);
            process.exitCode = 1;
    }
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        process.stderr.write(`\n${err.message}\n`);
        process.exit(1);
    }
}

module.exports = {
    parseArgs,
    writeEnvFile,
    readEnvFile,
    issueLicense,
    generateSecrets,
    demoUrl,
    SECRET_KEYS,
    PORT_KEYS,
};
