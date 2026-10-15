/**
 * VIARA key rotation — ENCRYPTION_KEY (+keyring) and BLIND_INDEX_KEY.
 *
 * Operational script backing docs/runbooks/KEY_ROTATION.md. Rotates the
 * live encryption keys, re-encrypts every encrypted column, rebuilds every
 * HMAC blind index, and verifies the result. Closes the incident where the
 * live keys were committed to git (see TECHNICAL_REVIEW 2026-09-12, §4.1).
 *
 * Usage:
 *   node scripts/rotateKeys.js             # plan: preflight + preview only
 *   node scripts/rotateKeys.js --execute   # full rotation (writes .env, mutates DB)
 *   node scripts/rotateKeys.js --resume    # keys already rotated in .env; redo data phases
 *
 * Safety properties:
 *   - Preflight empirically proves hash derivations are reproducible
 *     (0 mismatches) before touching anything; aborts otherwise.
 *   - .env is backed up before writing; old key stays in the keyring so
 *     pre-rotation ciphertext remains readable even if the script dies
 *     mid-run. Re-encryption is idempotent (skips rows already on the new
 *     key id) — re-run with --resume to converge after any crash.
 *   - All data phases run in per-table transactions with rollback.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const ENV_FILES = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
];

const readEnvFile = (p) => {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const vars = {};
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return { raw, vars };
};

const writeEnvValue = (raw, key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(raw)) return raw.replace(re, `${key}=${value}`);
    const sep = raw.endsWith('\n') ? '' : '\n';
    return `${raw}${sep}${key}=${value}\n`;
};

// Hash derivations mirror patientController exactly:
//   create: hash(validatedData.firstName)            (untrimmed)
//   composite: hash(`${fn.trim()}|${ln.trim()}|${dob}`)
const derivePatientHashes = (p) => {
    const out = {};
    const plain = (enc) => (enc ? decrypt(enc) : null);
    const fn = plain(p.first_name_enc);
    const ln = plain(p.last_name_enc);
    const phone = plain(p.phone_enc);
    const nid = plain(p.national_id_enc);
    const passport = plain(p.passport_number_enc);
    const dob = plain(p.date_of_birth_enc);
    if (fn != null && fn !== '') out.first_name_hash = hash(fn);
    if (ln != null && ln !== '') out.last_name_hash = hash(ln);
    if (phone != null && phone !== '') out.phone_hash = hash(phone);
    if (p.email) out.email_hash = hash(p.email);
    if (nid != null && nid !== '') out.national_id_hash = hash(nid);
    if (passport != null && passport !== '') out.passport_number_hash = hash(passport);
    if (dob != null && dob !== '') out.date_of_birth_hash = hash(dob);
    if (fn && ln && dob != null) out.name_dob_hash = hash(`${fn.trim()}|${ln.trim()}|${dob}`);
    return out;
};

// crypto utils resolved lazily so in-process env changes take effect.
let cryptoUtils;
const getCrypto = () => {
    if (!cryptoUtils) cryptoUtils = require('../src/utils/crypto');
    return cryptoUtils;
};
const decrypt = (v) => getCrypto().decrypt(v);
const hash = (v) => getCrypto().hash(v);

const newKeyHex = () => crypto.randomBytes(32).toString('hex');

const main = async () => {
    const execute = process.argv.includes('--execute');
    const resume = process.argv.includes('--resume');

    const envSources = ENV_FILES.map(readEnvFile).filter(Boolean);
    if (!envSources.length) {
        console.error('[rotate] No .env file found.');
        process.exit(1);
    }
    const env = { ...envSources.reduce((acc, s) => ({ ...acc, ...s.vars }), {}) };
    for (const [k, v] of Object.entries(env)) {
        if (!(k in process.env)) process.env[k] = v;
    }

    const oldActiveKey = env.ENCRYPTION_KEY;
    const oldBlindKey = env.BLIND_INDEX_KEY;
    const oldKeyId = env.ENCRYPTION_KEY_ID || 'default';
    if (!oldActiveKey && !resume) {
        console.error('[rotate] ENCRYPTION_KEY missing from .env — nothing to rotate.');
        process.exit(1);
    }

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13);
    const newId = `rot-${stamp}`;
    const nextKey = resume ? env.ENCRYPTION_KEY : newKeyHex();
    const nextBlind = resume ? env.BLIND_INDEX_KEY : newKeyHex();
    const nextId = resume ? (env.ENCRYPTION_KEY_ID || 'default') : newId;

    const client = new Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    console.log(`[rotate] mode: ${resume ? 'RESUME' : execute ? 'EXECUTE' : 'PLAN'}`);
    console.log(`[rotate] key id: ${oldKeyId} -> ${nextId}${resume ? ' (existing)' : ' (new)'}`);

    // ---------------- Preflight ----------------
    const patients = (await client.query(
        'SELECT * FROM patients'
    )).rows;
    let verified = 0;
    let mismatches = 0;
    let nullPairs = 0;
    for (const p of patients) {
        const derived = derivePatientHashes(p);
        for (const [col, val] of Object.entries(derived)) {
            if (p[col] === val) verified++;
            else if (p[col] == null) nullPairs++;
            else mismatches++;
        }
    }
    console.log(`[rotate] preflight: ${patients.length} patients, ${verified} hashes verified, ${mismatches} mismatches, ${nullPairs} will be populated`);
    if (mismatches > 0) {
        console.error('[rotate] ABORT: stored hashes are not reproducible — derivation mismatch. Resolve before rotating.');
        await client.end();
        process.exit(1);
    }

    // Discover every encrypted column in the public schema (suffix _enc) plus
    // the explicit non-suffixed targets from reencryptData.js.
    const encCols = (await client.query(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name LIKE '%\\_enc'
        ORDER BY table_name, column_name
    `)).rows;
    const extraTargets = [
        { table: 'integrations', columns: ['api_key', 'api_secret'] },
        { table: 'notifications', columns: ['recipient', 'subject', 'content'] },
    ];
    const byTable = new Map();
    for (const { table_name, column_name } of encCols) {
        if (!byTable.has(table_name)) byTable.set(table_name, new Set());
        byTable.get(table_name).add(column_name);
    }
    for (const t of extraTargets) {
        if (!byTable.has(t.table)) byTable.set(t.table, new Set());
        t.columns.forEach((c) => byTable.get(t.table).add(c));
    }
    // Order: patients first (hashes derive from it), then others.
    const orderedTables = ['patients', 'public_appointment_requests',
        ...[...byTable.keys()].filter((t) => !['patients', 'public_appointment_requests'].includes(t))];

    // Count rows needing re-encryption and detect non-v2 (legacy) values.
    let pendingRows = 0;
    const legacyFindings = [];
    for (const table of orderedTables) {
        const cols = [...byTable.get(table)];
        const pk = (await client.query(`
            SELECT a.attname FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = $1::regclass AND i.indisprimary
            ORDER BY a.attnum LIMIT 1
        `, [`public.${table}`])).rows[0]?.attname;
        if (!pk) { console.log(`[rotate] skip ${table}: no primary key`); continue; }
        const sel = cols.map((c) => `COALESCE(SUM(CASE WHEN "${c}" IS NOT NULL THEN 1 ELSE 0 END),0) AS "${c}"`).join(', ');
        const stats = (await client.query(`SELECT ${sel}, COUNT(*) AS total FROM "${table}"`)).rows[0];
        console.log(`[rotate]   ${table}: ${stats.total} rows; encrypted cols: ${cols.join(', ')}`);
        // legacy scan
        for (const c of cols) {
            const sample = (await client.query(
                `SELECT "${c}" AS v FROM "${table}" WHERE "${c}" IS NOT NULL LIMIT 200`
            )).rows;
            for (const { v } of sample) {
                if (!String(v).startsWith('v2:')) { legacyFindings.push(`${table}.${c}`); break; }
            }
        }
    }
    if (legacyFindings.length) {
        console.error(`[rotate] ABORT: non-v2 (legacy) ciphertext found in: ${[...new Set(legacyFindings)].join(', ')}. Run scripts/reencryptPii.js first.`);
        await client.end();
        process.exit(1);
    }

    let challengeCount = 0;
    for (const t of ['case_verification_challenges', 'public_case_verification_challenges']) {
        try {
            const reg = (await client.query('SELECT to_regclass($1) AS reg', [`public.${t}`])).rows[0].reg;
            if (!reg) continue;
            challengeCount += (await client.query(
                `SELECT COUNT(*)::int AS n FROM ${t} WHERE expires_at > now()`
            )).rows[0].n;
        } catch { /* try next name */ }
    }
    console.log(`[rotate] live one-time verification challenges to purge: ${challengeCount}`);

    if (!execute && !resume) {
        console.log('[rotate] PLAN complete. Re-run with --execute to rotate.');
        await client.end();
        return;
    }

    // ---------------- Persist new env (before data work: crash-safe) ----------------
    if (!resume) {
        const existingRing = (() => {
            try { return env.ENCRYPTION_KEYS ? JSON.parse(env.ENCRYPTION_KEYS) : {}; }
            catch { return {}; }
        })();
        const ring = { ...existingRing, [oldKeyId]: oldActiveKey, [nextId]: nextKey };
        // Backup + update every .env that carries the crypto keys.
        for (const filePath of ENV_FILES) {
            if (!fs.existsSync(filePath)) continue;
            const raw = fs.readFileSync(filePath, 'utf8');
            if (!/^(ENCRYPTION_KEY|BLIND_INDEX_KEY)=/m.test(raw)) continue;
            fs.copyFileSync(filePath, `${filePath}.backup-${stamp}`);
            let out = raw;
            out = writeEnvValue(out, 'ENCRYPTION_KEYS', JSON.stringify(ring));
            out = writeEnvValue(out, 'ENCRYPTION_KEY', nextKey);
            out = writeEnvValue(out, 'ENCRYPTION_KEY_ID', nextId);
            out = writeEnvValue(out, 'BLIND_INDEX_KEY', nextBlind);
            fs.writeFileSync(filePath, out, 'utf8');
            console.log(`[rotate] updated ${filePath} (backup: ${path.basename(filePath)}.backup-${stamp})`);
        }
        // Activate in-process for the data phases below.
        process.env.ENCRYPTION_KEYS = JSON.stringify(ring);
        process.env.ENCRYPTION_KEY = nextKey;
        process.env.ENCRYPTION_KEY_ID = nextId;
        process.env.BLIND_INDEX_KEY = nextBlind;
    }

    // ---------------- Phase A: re-encrypt every encrypted column ----------------
    const activePrefix = `v2:${nextId}:`;
    for (const table of orderedTables) {
        const cols = [...byTable.get(table)];
        const pk = (await client.query(`
            SELECT a.attname FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = $1::regclass AND i.indisprimary
            ORDER BY a.attnum LIMIT 1
        `, [`public.${table}`])).rows[0]?.attname;
        if (!pk) continue;
        await client.query('BEGIN');
        try {
            const rows = (await client.query(
                `SELECT ${pk} AS pk, ${cols.map((c) => `"${c}"`).join(', ')} FROM "${table}"`
            )).rows;
            let changed = 0;
            for (const row of rows) {
                const sets = [];
                const values = [];
                for (const c of cols) {
                    const v = row[c];
                    if (!v || String(v).startsWith(activePrefix)) continue;
                    values.push(getCrypto().encrypt(decrypt(v)));
                    sets.push(`"${c}" = $${values.length}`);
                }
                if (!sets.length) continue;
                values.push(row.pk);
                await client.query(
                    `UPDATE "${table}" SET ${sets.join(', ')} WHERE ${pk} = $${values.length}`,
                    values
                );
                changed += 1;
            }
            await client.query('COMMIT');
            console.log(`[rotate] re-encrypted ${table}: ${changed} rows -> key ${nextId}`);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(`[rotate] FAILED on ${table}: ${err.message} (rolled back; re-run with --resume)`);
            await client.end();
            process.exit(1);
        }
    }

    // ---------------- Phase B: rebuild blind indexes (patients) ----------------
    await client.query('BEGIN');
    try {
        const rows = (await client.query('SELECT * FROM patients')).rows;
        let updated = 0;
        for (const p of rows) {
            const derived = derivePatientHashes(p);
            const sets = [];
            const values = [];
            for (const [col, val] of Object.entries(derived)) {
                values.push(val);
                sets.push(`${col} = $${values.length}`);
            }
            // Also null out hashes whose plaintext vanished (consistency).
            for (const col of ['first_name_hash', 'last_name_hash', 'phone_hash', 'email_hash',
                'national_id_hash', 'passport_number_hash', 'date_of_birth_hash', 'name_dob_hash']) {
                if (!(col in derived) && p[col] != null) {
                    values.push(null);
                    sets.push(`${col} = $${values.length}`);
                }
            }
            if (!sets.length) continue;
            values.push(p.patient_id);
            await client.query(
                `UPDATE patients SET ${sets.join(', ')} WHERE patient_id = $${values.length}`,
                values
            );
            updated += 1;
        }
        await client.query('COMMIT');
        console.log(`[rotate] rebuilt patients blind indexes: ${updated} rows`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[rotate] FAILED rebuilding blind indexes: ${err.message} (rolled back; re-run with --resume)`);
        await client.end();
        process.exit(1);
    }

    // ---------------- Phase B2: public appointment request phone hashes ----------------
    try {
        const reqs = (await client.query(
            'SELECT request_id, phone_enc FROM public_appointment_requests WHERE phone_enc IS NOT NULL'
        )).rows;
        if (reqs.length) {
            await client.query('BEGIN');
            for (const r of reqs) {
                const plain = decrypt(r.phone_enc);
                await client.query('UPDATE public_appointment_requests SET phone_hash = $1 WHERE request_id = $2',
                    [hash(plain), r.request_id]);
            }
            await client.query('COMMIT');
        }
        console.log(`[rotate] public_appointment_requests phone_hash rebuilt: ${reqs.length} rows`);
    } catch (e) {
        console.log(`[rotate] public_appointment_requests skipped: ${e.message.slice(0, 60)}`);
    }

    // ---------------- Phase C: purge orphanable one-time challenges ----------------
    for (const t of ['case_verification_challenges', 'public_case_verification_challenges']) {
        try {
            const reg = (await client.query('SELECT to_regclass($1) AS reg', [`public.${t}`])).rows[0].reg;
            if (!reg) continue;
            const purged = await client.query(
                `DELETE FROM ${t} WHERE expires_at > now()`
            );
            console.log(`[rotate] purged live one-time challenges from ${t}: ${purged.rowCount}`);
        } catch (e) {
            console.log(`[rotate] challenge purge on ${t} skipped: ${e.message.slice(0, 60)}`);
        }
    }

    // ---------------- Phase D: verify ----------------
    const check = (await client.query('SELECT * FROM patients LIMIT 5')).rows;
    let vOk = 0;
    let vBad = 0;
    let vPrefix = 0;
    for (const p of check) {
        for (const col of ['first_name_enc', 'last_name_enc', 'phone_enc']) {
            if (p[col]) {
                if (String(p[col]).startsWith(activePrefix)) vPrefix += 1;
                decrypt(p[col]); // throws if keyring broken
            }
        }
        const derived = derivePatientHashes(p);
        for (const [col, val] of Object.entries(derived)) {
            if (p[col] === val) vOk++; else vBad++;
        }
    }
    console.log(`[rotate] verify: decrypt OK on sample; new-prefix values: ${vPrefix}; hashes match: ${vOk}; hash mismatches: ${vBad}`);
    if (vBad > 0) {
        console.error('[rotate] VERIFICATION FAILED — re-run with --resume.');
        await client.end();
        process.exit(1);
    }
    console.log('[rotate] DONE. Old key remains in the keyring for safety; remove it from ENCRYPTION_KEYS once confident (run scripts/validateDeployment.js first).');
    await client.end();
};

main().catch((e) => {
    console.error(`[rotate] fatal: ${e.message}`);
    process.exit(1);
});
