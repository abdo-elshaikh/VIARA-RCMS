#!/usr/bin/env node
/**
 * generate-license.js
 * -------------------
 * Vendor utility: sign and emit a VIARA license key.
 *
 * Two modes
 * =========
 *   1. Guided wizard (default when a TTY is available)
 *        node scripts/generate-license.js
 *      Answers every question step by step, shows a summary, confirms, signs.
 *
 *   2. Non-interactive (scripts, CI, repeatable issuance)
 *        node scripts/generate-license.js --customer "ORG-12345" --edition trial \
 *            --days 30 --max-users 3
 *
 * Prerequisites
 * =============
 *   1. Run scripts/generate-keypair.js once to create keys/privateKey.pem
 *   2. Copy keys/publicKey.pem content into licenseService.js
 *
 * Wizard steps
 * ============
 *   1. Customer identifier
 *   2. Edition (trial / standard / enterprise / developer)
 *   3. Validity (perpetual, N days, or an explicit end date)
 *   4. Maximum users (-1 = unlimited)
 *   5. Hardware fingerprint lock (optional)
 *   6. Allowed modules (edition defaults or a custom list)
 *   7. Review and confirm
 *
 * Other flags
 * ===========
 *   --verify <key>   Verify and decode an existing key, then exit
 *   --out <file>     Write the generated key to a file
 *   --env <file>     Write/update LICENSE_KEY= inside a .env file
 *   --yes            Skip the confirmation prompt
 *   --help           Show this help
 *
 * Output
 * ======
 *   Prints the Base64url-encoded license key.
 *   Set it as LICENSE_KEY in the client's .env file.
 */

'use strict';

const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline/promises');

const { EDITION_FEATURES, TRIAL_QUOTAS } = require('../backend/src/config/featureFlags');
const { getFingerprint }                = require('../backend/src/utils/hardwareFingerprint');

// ── Argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const body = token.slice(2);
        const eq = body.indexOf('=');
        if (eq !== -1) {
            flags[body.slice(0, eq)] = body.slice(eq + 1);
            continue;
        }
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
            flags[body] = true;
        } else {
            flags[body] = next;
            i += 1;
        }
    }
    return flags;
}

const flags = parseArgs(process.argv.slice(2));

// ── Constants ───────────────────────────────────────────────────────────────

const EDITIONS = {
    trial: {
        label: 'Trial',
        blurb: 'Time-limited evaluation with tight quotas',
        defaultDays: 30,
        defaultMaxUsers: TRIAL_QUOTAS.MAX_USERS,
        perpetualAllowed: false,
    },
    standard: {
        label: 'Standard',
        blurb: 'Full single-branch production license',
        defaultDays: 365,
        defaultMaxUsers: 25,
        perpetualAllowed: true,
    },
    enterprise: {
        label: 'Enterprise',
        blurb: 'Multi-branch, SSO, advanced analytics',
        defaultDays: 0,
        defaultMaxUsers: -1,
        perpetualAllowed: true,
    },
    developer: {
        label: 'Developer',
        blurb: 'Internal development mode, no hardware binding',
        defaultDays: 0,
        defaultMaxUsers: -1,
        perpetualAllowed: true,
    },
};

const EDITION_IDS    = Object.keys(EDITIONS);
const CUSTOMER_RE    = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const FINGERPRINT_RE = /^[a-f0-9]{64}$/i;
const MODULE_RE      = /^[a-z][a-z0-9-]*$/;
const MAX_DAYS       = 3650;
const MAX_USERS      = 100000;
const TOTAL_STEPS    = 7;

const HELP = `
VIARA license key generator

  Guided wizard     node scripts/generate-license.js
  Non-interactive   node scripts/generate-license.js --customer ORG-1 --edition trial --days 30

Flags
  --customer <id>      Customer identifier (letters, digits, dot, dash, underscore)
  --edition <name>     ${EDITION_IDS.join(' | ')}
  --days <n>           Validity in days; 0 means perpetual
  --expires <date>     Explicit expiry date (wins over --days)
  --max-users <n>      Maximum users, or -1 for unlimited
  --fingerprint <hex>  Bind the key to one machine (64 hex characters)
  --modules <a,b,c>    Restrict the key to an explicit module list
  --verify <key>       Verify and decode an existing key, then exit
  --out <file>         Write the generated key to a file
  --env <file>         Write or update LICENSE_KEY= in a .env file
  --yes                Skip the confirmation prompt
  --help               Show this help
`;

// ── Output helpers ──────────────────────────────────────────────────────────

const out  = (text = '') => process.stdout.write(`${text}\n`);
const fail = (text, code = 1) => {
    process.stderr.write(`❌ ${text}\n`);
    process.exit(code);
};

// ── Prompter ────────────────────────────────────────────────────────────────

function createPrompter() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return null;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => {
        rl.close();
        out('\n❌ Cancelled. No license was generated.');
        process.exit(130);
    });

    let step = 0;
    return {
        // `step` is the logical wizard step, supplied by the caller, so a
        // re-ask after invalid input stays on the same step instead of
        // advancing (and eventually saturating) the counter.
        async ask(question, fallback = '', { step: explicitStep = null, mask = false } = {}) {
            step = explicitStep === null ? step + 1 : explicitStep;
            const hint = fallback ? ` [${fallback}]` : '';
            out(`\nStep ${step}/${TOTAL_STEPS} — ${question}${hint}:`);
            const raw = mask
                ? await rl.question('  ', { hideEchoBack: true })
                : await rl.question('  ');
            if (mask && raw.trim()) out('*'.repeat(raw.trim().length));
            return raw.trim() || fallback;
        },
        async confirm(question, fallback = false) {
            const answer = (await this.ask(`${question} (${fallback ? 'Y/n' : 'y/N'})`, '', { step: TOTAL_STEPS })).toLowerCase();
            if (!answer) return fallback;
            return answer.startsWith('y');
        },
        close: () => rl.close(),
    };
}

const prompter      = createPrompter();
const isInteractive = Boolean(prompter) && flags.verify === undefined;

// ── Validators ──────────────────────────────────────────────────────────────
// Each returns { ok, value } or { ok: false, error } so the wizard can re-ask.

const validators = {
    customer(value) {
        if (!CUSTOMER_RE.test(value)) {
            return { ok: false, error: 'Use 2–64 characters: letters, digits, dot, dash or underscore.' };
        }
        return { ok: true, value };
    },
    edition(value) {
        const key = value.toLowerCase();
        if (/^[1-9]$/.test(key) && Number(key) <= EDITION_IDS.length) {
            return { ok: true, value: EDITION_IDS[Number(key) - 1] };
        }
        if (EDITIONS[key]) return { ok: true, value: key };
        return { ok: false, error: `Choose 1-${EDITION_IDS.length} or type one of: ${EDITION_IDS.join(', ')}.` };
    },
    days(value) {
        if (['perpetual', 'forever', 'never', 'none'].includes(value.toLowerCase())) {
            return { ok: true, value: 0 };
        }
        const days = Number(value);
        if (!Number.isInteger(days)) {
            return { ok: false, error: 'Enter a whole number of days, 0, or "perpetual".' };
        }
        if (days < 0) return { ok: false, error: 'Days cannot be negative.' };
        if (days > MAX_DAYS) {
            return { ok: false, error: `Maximum supported validity is ${MAX_DAYS} days (about 10 years).` };
        }
        return { ok: true, value: days };
    },
    maxUsers(value) {
        if (['u', 'unlimited', '-1'].includes(value.toLowerCase())) return { ok: true, value: -1 };
        const users = Number(value);
        if (!Number.isInteger(users)) {
            return { ok: false, error: 'Enter a whole number of users, or "u" for unlimited.' };
        }
        if (users !== -1 && users < 1) {
            return { ok: false, error: 'Maximum users must be 1 or more, or -1 for unlimited.' };
        }
        if (users > MAX_USERS) {
            return { ok: false, error: `Maximum users cannot exceed ${MAX_USERS}. Use -1 for unlimited.` };
        }
        return { ok: true, value: users };
    },
    fingerprint(value) {
        if (['none', 'skip', 'no'].includes(value.toLowerCase())) return { ok: true, value: null };
        if (!FINGERPRINT_RE.test(value)) {
            return { ok: false, error: 'A fingerprint is exactly 64 hexadecimal characters (SHA-256).' };
        }
        return { ok: true, value: value.toLowerCase() };
    },
    modules(value) {
        if (['default', 'edition', 'auto'].includes(value.toLowerCase())) return { ok: true, value: null };
        const modules = [...new Set(value.split(/[,\s]+/).map((m) => m.trim().toLowerCase()).filter(Boolean))];
        if (!modules.length) {
            return { ok: false, error: 'Enter a comma-separated module list, or "default".' };
        }
        const invalid = modules.filter((m) => !MODULE_RE.test(m));
        if (invalid.length) {
            return { ok: false, error: `Invalid module name(s): ${invalid.join(', ')}` };
        }
        return { ok: true, value: modules };
    },
};

async function askValidated(kind, question, fallback = '', step = null) {
    for (;;) {
        const raw = await prompter.ask(question, String(fallback), { step });
        const result = validators[kind](raw);
        if (result.ok) return result.value;
        out(`   ⚠️  ${result.error}`);
    }
}

// ── Date helpers ────────────────────────────────────────────────────────────

const MAX_DAYS_MS = 86400000;

function resolveExpiry(days, now) {
    if (!days) return null;
    return new Date(now.getTime() + days * MAX_DAYS_MS);
}

function parseDateInput(value) {
    const trimmed = value.trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? new Date(`${trimmed}T23:59:59.000Z`)
        : new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ── Signing ─────────────────────────────────────────────────────────────────

const keyPath = path.resolve(__dirname, '../keys/privateKey.pem');

function loadPrivateKey() {
    if (!fs.existsSync(keyPath)) {
        fail(`Private key not found at ${keyPath}\n   Run: node scripts/generate-keypair.js`);
    }
    return fs.readFileSync(keyPath, 'utf8');
}

function signPayload(payload, privateKeyPem) {
    const data      = Buffer.from(JSON.stringify(payload), 'utf8');
    const privKey   = crypto.createPrivateKey(privateKeyPem);
    const signature = crypto.sign('SHA256', data, privKey).toString('base64');
    return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
}

// Keep the same payload field order as before so an issued key stays byte-stable.
function buildPayload(options) {
    return {
        v: 1,
        customerId: options.customerId,
        edition: options.edition,
        issuedAt: options.issuedAt,
        expiresAt: options.expiresAt,
        maxUsers: options.maxUsers,
        fingerprint: options.fingerprint || null,
        allowedModules: options.allowedModules || null,
    };
}

// ── Presentation ────────────────────────────────────────────────────────────

const describeUsers = (value) => (value === -1 ? 'Unlimited' : String(value));

function describeValidity(expiresAt) {
    if (!expiresAt) return 'Never (perpetual)';
    return `${new Date(expiresAt).toISOString().slice(0, 10)} (${daysRemaining(expiresAt)} days left)`;
}

function daysRemaining(expiresAt) {
    return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / MAX_DAYS_MS);
}

function printSummary(payload) {
    const modules = payload.allowedModules || EDITION_FEATURES[payload.edition];
    const rows = [
        ['Customer',   payload.customerId],
        ['Edition',    `${payload.edition} (${EDITIONS[payload.edition].label})`],
        ['Issued',     payload.issuedAt],
        ['Expires',    describeValidity(payload.expiresAt)],
        ['Max users',  describeUsers(payload.maxUsers)],
        ['Fingerprint', payload.fingerprint
            ? `${payload.fingerprint.slice(0, 12)}…`
            : 'None (binds on first activation)'],
        ['Modules',    modules.includes('*')
            ? 'All (*), edition defaults'
            : `${modules.length} module(s): ${modules.join(', ')}`],
    ];
    out('');
    rows.forEach(([label, value]) => out(`  ${label.padEnd(12)} ${value}`));
}

function printResult(payload, licenseKey) {
    out('\n✅ VIARA License Key Generated\n');
    printSummary(payload);
    out('\n--- LICENSE KEY (set as LICENSE_KEY in .env) ---');
    out(licenseKey);
    out('------------------------------------------------');
}

// ── Output destinations ─────────────────────────────────────────────────────

function writeKeyFile(file, licenseKey) {
    const target = path.resolve(file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${licenseKey}\n`, { encoding: 'utf8', mode: 0o600 });
    out(`\n💾 License key written to ${target}`);
}

function writeEnvFile(file, licenseKey, payload) {
    const target = path.resolve(file);
    const line   = `LICENSE_KEY="${licenseKey}"`;
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    const comment = [
        `# VIARA license - ${payload.edition} for ${payload.customerId}`,
        `# issued ${payload.issuedAt}${payload.expiresAt ? `, expires ${payload.expiresAt}` : ', perpetual'}`,
    ].join('\n');

    // Re-issuing over an existing key must not leave the previous issuance's
    // comment behind describing the wrong customer and edition, so the
    // comment block and the key are always rewritten as one unit.
    const block = `${comment}\n${line}`;
    let next;
    if (/^LICENSE_KEY\s*=/m.test(existing)) {
        // Match the generated comment together with the key it documents, so a
        // re-issue replaces both and never leaves a stale summary describing
        // the previous customer or edition.
        const managed = /^# VIARA license - [^\n]*\n# issued [^\n]*\nLICENSE_KEY\s*=.*$/m;
        next = existing.replace(managed, block);
        if (next === existing) {
            // A hand-written .env with no managed comment: only the key changes.
            next = existing.replace(/^LICENSE_KEY\s*=.*$/m, line);
        }
    } else {
        const separator = existing.trim() ? '\n\n' : '';
        next = `${existing}${separator}${block}\n`;
    }

    fs.writeFileSync(target, next, { encoding: 'utf8', mode: 0o600 });
    out(`\n💾 ${target === path.resolve('.env') ? '.env' : target} updated with LICENSE_KEY for ${payload.customerId}`);
}

// ── Verify mode ─────────────────────────────────────────────────────────────

function verifyMode(key) {
    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(key.trim(), 'base64url').toString('utf8'));
    } catch {
        fail('That is not a Base64url-encoded VIARA license key.');
    }
    if (!decoded || !decoded.payload || !decoded.signature) {
        fail('Malformed key: missing payload or signature.');
    }

    out('\n🔍 VIARA License Key\n');
    printSummary(decoded.payload);

    const pubPath = path.resolve(__dirname, '../keys/publicKey.pem');
    if (fs.existsSync(pubPath)) {
        const verified = crypto.verify(
            'SHA256',
            Buffer.from(JSON.stringify(decoded.payload), 'utf8'),
            crypto.createPublicKey(fs.readFileSync(pubPath, 'utf8')),
            Buffer.from(decoded.signature, 'base64'),
        );
        out(`\n  Signature    ${verified ? '✅ valid' : '❌ INVALID'}`);
    } else {
        out('\n  Signature    (skipped — keys/publicKey.pem not found)');
    }
}

// ── Wizard ──────────────────────────────────────────────────────────────────

async function runWizard() {
    out('╭──────────────────────────────────────────────────────────────╮');
    out('│  VIARA License Wizard — keys/privateKey.pem is required       │');
    out('╰──────────────────────────────────────────────────────────────╯');

    const customerId = await askValidated(
        'customer',
        'Customer identifier (e.g. AL-NOOR-RADIOLOGY)',
        flags.customer && flags.customer !== true ? String(flags.customer) : `ORG-${Date.now().toString().slice(-6)}`,
        1,
    );

    const currentEdition = flags.edition && flags.edition !== true ? String(flags.edition).toLowerCase() : '';
    out(`\n  Available editions:`);
    out(EDITION_IDS
        .map((id, index) => `    ${index + 1}) ${EDITIONS[id].label.padEnd(12)} ${EDITIONS[id].blurb}`)
        .join('\n'));
    const edition = await askValidated('edition', 'Select edition', currentEdition || 'trial', 2);

    const editionDefaults = EDITIONS[edition];
    if (!editionDefaults.perpetualAllowed) {
        out(`   ℹ️  ${edition} licenses must expire, so a perpetual option is not offered.`);
    }
    const days = await askValidated(
        'days',
        'Validity in days (0 or "perpetual" for no expiry)',
        editionDefaults.defaultDays,
        3,
    );
    let expiresAt = resolveExpiry(days, new Date());
    if (!days && !editionDefaults.perpetualAllowed) {
        out(`   ⚠️  ${edition} licenses must expire; using the default ${editionDefaults.defaultDays} days instead.`);
        expiresAt = resolveExpiry(editionDefaults.defaultDays, new Date());
    }

    const maxUsers = await askValidated(
        'maxUsers',
        'Maximum users ("u" for unlimited)',
        editionDefaults.defaultMaxUsers,
        4,
    );

    const localFingerprint = getFingerprint();
    out(`   ℹ️  This machine's fingerprint is ${localFingerprint.slice(0, 16)}… (customer machines run the same helper on their server to get theirs).`);
    const fingerprint = await askValidated(
        'fingerprint',
        'Lock to a hardware fingerprint ("none" to bind on first activation)',
        flags.fingerprint && flags.fingerprint !== true ? String(flags.fingerprint) : 'none',
        5,
    );

    const editionModules = EDITION_FEATURES[edition];
    out(`   ℹ️  ${edition} includes ${editionModules.includes('*') ? 'all modules' : `${editionModules.length} modules`}: ${editionModules.join(', ')}`);
    const modules = await askValidated(
        'modules',
        'Allowed modules (comma-separated, or "default" for edition defaults)',
        flags.modules && flags.modules !== true ? String(flags.modules) : 'default',
        6,
    );

    const payload = buildPayload({
        customerId,
        edition,
        issuedAt: new Date().toISOString(),
        expiresAt,
        maxUsers,
        fingerprint,
        allowedModules: modules,
    });

    printSummary(payload);

    if (isInteractive && !flags.yes) {
        const ok = await prompter.confirm('\nGenerate and sign this license?', false);
        if (!ok) {
            out('\n❌ Cancelled. No license was generated.');
            return null;
        }
    }

    return payload;
}

// ── Non-interactive resolution ──────────────────────────────────────────────

function resolveFromFlags() {
    const edition = String(flags.edition || 'trial').toLowerCase();
    if (!EDITIONS[edition]) {
        fail(`Unknown edition: ${flags.edition}. Must be one of: ${EDITION_IDS.join(', ')}`);
    }

    const customerId = flags.customer && flags.customer !== true
        ? String(flags.customer)
        : `DEMO-${Date.now()}`;
    const customerCheck = validators.customer(customerId);
    if (!customerCheck.ok) fail(`${customerCheck.error} (--customer)`);

    const now = new Date();
    let expiresAt = null;
    if (flags.expires && flags.expires !== true) {
        const parsed = parseDateInput(String(flags.expires));
        if (!parsed) fail(`Could not read --expires value: ${flags.expires}`);
        expiresAt = parsed.toISOString();
    } else {
        const rawDays = flags.days === undefined || flags.days === true ? String(EDITIONS[edition].defaultDays) : String(flags.days);
        const daysCheck = validators.days(rawDays);
        if (!daysCheck.ok) fail(`${daysCheck.error} (--days)`);
        if (!daysCheck.value && !EDITIONS[edition].perpetualAllowed) {
            fail(`A ${edition} license must expire; pass --days with a positive value.`);
        }
        expiresAt = resolveExpiry(daysCheck.value, now)?.toISOString() || null;
    }

    const rawUsers = flags['max-users'] ?? flags.maxUsers;
    const usersCheck = validators.maxUsers(
        rawUsers === undefined || rawUsers === true ? String(EDITIONS[edition].defaultMaxUsers) : String(rawUsers),
    );
    if (!usersCheck.ok) fail(`${usersCheck.error} (--max-users)`);

    const fingerprintCheck = validators.fingerprint(
        flags.fingerprint && flags.fingerprint !== true ? String(flags.fingerprint) : 'none',
    );
    if (!fingerprintCheck.ok) fail(`${fingerprintCheck.error} (--fingerprint)`);

    const modulesCheck = validators.modules(
        flags.modules && flags.modules !== true ? String(flags.modules) : 'default',
    );
    if (!modulesCheck.ok) fail(`${modulesCheck.error} (--modules)`);

    return buildPayload({
        customerId,
        edition,
        issuedAt: now.toISOString(),
        expiresAt,
        maxUsers: usersCheck.value,
        fingerprint: fingerprintCheck.value,
        allowedModules: modulesCheck.value,
    });
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
    if (flags.verify) {
        verifyMode(String(flags.verify));
        return;
    }

    if (flags.help) {
        out(HELP);
        return;
    }

    const payload = isInteractive ? await runWizard() : resolveFromFlags();
    if (!payload) return;

    const licenseKey = signPayload(payload, loadPrivateKey());
    printResult(payload, licenseKey);

    if (flags.out && flags.out !== true) {
        writeKeyFile(String(flags.out), licenseKey);
    }
    if (flags.env && flags.env !== true) {
        writeEnvFile(String(flags.env), licenseKey, payload);
    }

    out('\nSet it as LICENSE_KEY in the client .env, then restart the backend.\n');
}

main()
    .catch((error) => {
        fail(error && error.message ? error.message : String(error));
    })
    .finally(() => {
        if (prompter) prompter.close();
    });