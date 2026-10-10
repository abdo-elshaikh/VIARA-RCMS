const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { getOrthancConnection } = require('./orthancConnectionService');
const { encryptBackup, decryptBackup, computeFileChecksum } = require('./postgresBackupService');

const resolveColdReference = reference => {
    if (!process.env.PACS_COLD_STORAGE_DIR) throw new Error('Configure PACS_COLD_STORAGE_DIR on a durable archive volume');
    if (!/^local:[0-9.]+\/[0-9.]+\.dcm\.enc$/.test(reference || '')) throw new Error('Unsupported archive reference');
    const root = path.resolve(process.env.PACS_COLD_STORAGE_DIR);
    const target = path.resolve(root, reference.slice(6));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid archive path');
    return target;
};

const archiveInstance = async row => {
    const fileRef = `local:${row.study_instance_uid}/${row.sop_instance_uid}.dcm.enc`;
    const target = resolveColdReference(fileRef);
    await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = target + '.' + crypto.randomUUID();
    const plain = temporary + '.dcm'; const verified = temporary + '.verified';
    const { url, username, password } = await getOrthancConnection();
    const headers = { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') };
    try {
        const response = await fetch(`${url}/instances/${encodeURIComponent(row.orthanc_id)}/file`, { headers, signal: AbortSignal.timeout(120000) });
        if (!response.ok || !response.body) throw new Error(`Archive copy failed (${response.status})`);
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(plain, { flags: 'wx', mode: 0o600 }));
        const checksum = await computeFileChecksum(plain);
        await encryptBackup(plain, temporary);
        await decryptBackup(temporary, verified);
        if (await computeFileChecksum(verified) !== checksum) throw new Error('Archive copy verification failed');
        await fs.promises.rename(temporary, target);
        return { fileRef, checksum, bytes: (await fs.promises.stat(plain)).size };
    } finally {
        for (const file of [temporary, plain, verified]) await fs.promises.unlink(file).catch(() => {});
    }
};

const checkArchivedStudies = async (db, studyUids) => {
    if (!studyUids.length) return;
    const { rows } = await db.query(`SELECT pi.sop_instance_uid, pi.orthanc_id, pi.storage_tier, pi.file_ref, pi.archive_sha256
        FROM pacs_instances pi JOIN pacs_series ps ON ps.series_instance_uid = pi.series_instance_uid
        WHERE ps.study_instance_uid = ANY($1::text[])
        AND (pi.storage_tier = 'cold' OR (pi.storage_tier = 'warm' AND pi.file_ref LIKE 'local:%'))`, [studyUids]);
    if (!rows.length) return;
    const { url, username, password } = await getOrthancConnection();
    const headers = { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'), 'Content-Type': 'application/dicom' };
    const available = new Set();
    if (rows.some(row => row.storage_tier === 'warm')) {
        for (const studyUid of studyUids) {
            const lookup = await fetch(`${url}/tools/find`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ Level: 'Instance', Query: { StudyInstanceUID: studyUid } }), signal: AbortSignal.timeout(15000) });
            if (!lookup.ok) throw new Error(`Archive availability check failed (${lookup.status})`);
            const instances = await lookup.json();
            if (!Array.isArray(instances)) throw new Error('Invalid archive availability response');
            for (const id of instances) if (typeof id === 'string') available.add(id);
        }
    }
    for (const row of rows) {
        if (row.storage_tier === 'warm' && available.has(row.orthanc_id)) continue;
        const source = resolveColdReference(row.file_ref);
        const temporary = source + '.' + crypto.randomUUID() + '.restore';
        try {
            await decryptBackup(source, temporary);
            if (!row.archive_sha256 || await computeFileChecksum(temporary) !== row.archive_sha256) throw new Error('Archived DICOM checksum mismatch');
            const response = await fetch(`${url}/instances`, { method: 'POST', headers,
                body: fs.createReadStream(temporary), duplex: 'half', signal: AbortSignal.timeout(120000) });
            if (!response.ok) throw new Error(`Archived image restore failed (${response.status})`);
            const result = await response.json();
            await db.query("UPDATE pacs_instances SET storage_tier = 'warm', orthanc_id = $2 WHERE sop_instance_uid = $1", [row.sop_instance_uid, result.ID]);
        } finally { await fs.promises.unlink(temporary).catch(() => {}); }
    }
};

// Frame requests for the same study share one check/restore operation. Without
// this, a large mirrored study would recheck its whole archive on every frame.
const availabilityChecks = new Map();
const ensureArchivedStudiesAvailable = async (db, studyUids) => {
    for (const uid of new Set(studyUids)) {
        let entry = availabilityChecks.get(uid);
        if (!entry || Date.now() - entry.checkedAt > 60000) {
            if (availabilityChecks.size >= 1000) availabilityChecks.delete(availabilityChecks.keys().next().value);
            entry = { checkedAt: Number.POSITIVE_INFINITY, promise: null };
            entry.promise = checkArchivedStudies(db, [uid]).then(() => { entry.checkedAt = Date.now(); }).catch(error => {
                if (availabilityChecks.get(uid) === entry) availabilityChecks.delete(uid);
                throw error;
            });
            availabilityChecks.set(uid, entry);
        }
        await entry.promise;
    }
};

module.exports = { archiveInstance, ensureArchivedStudiesAvailable, resolveColdReference };
