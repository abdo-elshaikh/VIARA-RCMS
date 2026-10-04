// Run only against a new, empty Orthanc archive during an approved recovery window.
require('dotenv').config({ quiet: true });
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { verifyPacsZip, visitZip } = require('../src/services/pacsBackupService');
const { decryptBackup } = require('../src/services/postgresBackupService');

async function restorePacsBackup({ file, target, username, password, allowNonEmpty = false }) {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !password) throw new Error('A target URL and restore credentials are required');
    const headers = { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') };
    const temporary = path.resolve(file) + '.' + crypto.randomUUID() + '.restore.zip';
    try {
        await decryptBackup(path.resolve(file), temporary);
        const manifest = await verifyPacsZip(temporary);
        const check = await fetch(target.replace(/\/$/, '') + '/instances', { headers, signal: AbortSignal.timeout(30000) });
        if (!check.ok) throw new Error(`Target Orthanc unreachable (${check.status})`);
        const existingInstances = await check.json();
        if (!allowNonEmpty && existingInstances.length !== 0) throw new Error('Recovery target must be a reachable, empty Orthanc archive');
        let restored = 0;
        await visitZip(temporary, async (entry, stream) => {
            if (entry.fileName === 'manifest.json') { for await (const chunk of stream) void chunk; return; }
            const response = await fetch(target.replace(/\/$/, '') + '/instances', {
                method: 'POST', headers: { ...headers, 'Content-Type': 'application/dicom' },
                body: stream, duplex: 'half', signal: AbortSignal.timeout(120000)
            });
            if (!response.ok) throw new Error(`PACS restore failed (${response.status}); target contains a partial recovery`);
            await response.json();
            restored += 1;
        });
        const after = await fetch(target.replace(/\/$/, '') + '/instances', { headers, signal: AbortSignal.timeout(30000) });
        if (!after.ok || (!allowNonEmpty && (await after.json()).length !== manifest.instances.length)) throw new Error('Restored PACS instance count did not match the verified backup');
        return { restored, verified: true };
    } finally { await fs.unlink(temporary).catch(() => {}); }
}

if (require.main === module) {
    const value = key => process.argv.find(arg => arg.startsWith(key + '='))?.slice(key.length + 1);
    const hasFlag = flag => process.argv.includes(flag);
    const file = value('--file'); const target = value('--target');
    const allowNonEmpty = hasFlag('--allow-non-empty');
    if (!file || !target) { console.error('Usage: node scripts/restorePacsBackup.js --file=backup.pacs.zip.enc --target=http://empty-orthanc:8042 [--allow-non-empty]'); process.exitCode = 1; }
    else restorePacsBackup({ file, target, username: process.env.PACS_RESTORE_USERNAME || process.env.ORTHANC_USERNAME,
        password: process.env.PACS_RESTORE_PASSWORD || process.env.ORTHANC_PASSWORD, allowNonEmpty })
        .then(result => console.log(JSON.stringify(result)))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { restorePacsBackup };
