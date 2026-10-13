'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('/app/node_modules/pg');
const { scanPacsFile } = require('/app/src/utils/pacsMalwareScan');
const { uploadFilesToExam } = require('/app/src/services/pacsUploadService');

(async () => {
    assert.equal(process.env.VIARA_AUDIT_SYNTHETIC, '1');
    assert.equal(process.env.NODE_ENV, 'production');
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
        assert.deepEqual((await db.query('SELECT email FROM users')).rows.map(row => row.email), ['admin@synthetic.example.test']);
        assert.equal(Number((await db.query('SELECT COUNT(*) FROM patients')).rows[0].count), 0);
        const scanner = process.env.CLAMSCAN_PATH;
        assert.ok(scanner);
        const request = async (route, options = {}) => {
            const response = await fetch(process.env.ORTHANC_URL + route, {
                ...options, headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.ORTHANC_USERNAME}:${process.env.ORTHANC_PASSWORD}`).toString('base64'),
                    ...options.headers }, signal: AbortSignal.timeout(30000)
            });
            assert.ok(response.ok, `Synthetic Orthanc request failed: ${response.status}`);
            return response;
        };
        assert.deepEqual(await (await request('/instances')).json(), []);
        const created = await (await request('/tools/create-dicom', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Tags: { PatientName: 'AUDIT^SYNTHETIC', PatientID: 'VIARA-AUDIT-SCAN', Modality: 'OT' } })
        })).json();
        const cleanDicom = Buffer.from(await (await request(`/instances/${created.ID}/file`)).arrayBuffer());
        await request(`/instances/${created.ID}`, { method: 'DELETE' });
        await scanPacsFile({ buffer: cleanDicom });
        // The standard harmless antivirus test pattern exists only in this disposable container.
        const eicar = Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=', 'base64');
        await assert.rejects(scanPacsFile({ buffer: eicar }), error => error.code === 'PACS_MALWARE_DETECTED' && error.statusCode === 400);
        const dir = await fs.mkdtemp('/tmp/viara-pacs-acceptance-');
        const files = [
            { path: path.join(dir, 'clean.dcm'), originalname: 'clean.dcm' },
            { path: path.join(dir, 'synthetic-infected.dcm'), originalname: 'synthetic-infected.dcm' }
        ];
        try {
            await fs.writeFile(files[0].path, cleanDicom, { mode: 0o600 });
            await fs.writeFile(files[1].path, eicar, { mode: 0o600 });
            let queries = 0;
            const noDatabaseWrites = { query: async () => { queries++; throw Error('Batch must be rejected before database access'); } };
            await assert.rejects(uploadFilesToExam(noDatabaseWrites, { examId: 'synthetic-exam', files, actorUserId: 'synthetic-user' }),
                error => error.code === 'PACS_MALWARE_DETECTED' && error.statusCode === 400);
            assert.equal(queries, 0);
            for (const file of files) await assert.rejects(fs.stat(file.path), error => error.code === 'ENOENT');
            assert.deepEqual(await (await request('/instances')).json(), []);
        } finally { await fs.rm(dir, { recursive: true, force: true }); }
        process.env.CLAMSCAN_PATH = '/missing/synthetic-scanner';
        await assert.rejects(scanPacsFile({ buffer: cleanDicom }), error => error.code === 'PACS_SCAN_UNAVAILABLE' && error.statusCode === 503);
        delete process.env.CLAMSCAN_PATH;
        await assert.rejects(scanPacsFile({ buffer: cleanDicom }), error => error.code === 'PACS_SCAN_UNAVAILABLE' && error.statusCode === 503);
        process.env.CLAMSCAN_PATH = scanner;
        console.log('AUDIT_PACS_SCREENING_RESULT=' + JSON.stringify({ passed: true, realClamAV: true, cleanDicomAccepted: true,
            eicarDenied: true, infectedBatchDeniedBeforeDatabaseAndOrthanc: true, quarantineCleaned: true,
            scannerMissingDenied: true, scannerUnconfiguredDenied: true, syntheticPatientsOnly: true }));
    } finally { await db.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
