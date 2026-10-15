// Requires two EMPTY disposable Orthanc containers on loopback ports 18043/18044.
// Uses synthetic pixels only; never point this script at a clinical archive.
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { Writable } = require('stream');
const dcmjs = require('dcmjs');
process.env.ORTHANC_URL = 'http://127.0.0.1:18043';
process.env.ORTHANC_API_URL = process.env.ORTHANC_URL;
process.env.ORTHANC_USERNAME = 'isolated';
process.env.ORTHANC_PASSWORD = 'isolated-only';
process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const reconciliationModule = require.resolve('../src/services/pacsReconcileService');
require.cache[reconciliationModule] = { id: reconciliationModule, loaded: true, exports: {
    reconcileInstance: async (_, payload) => { assert.equal(payload.PatientID, 'SYNTHETIC'); return { status: 'reconciled', exam_id: 'synthetic', image_count: 1 }; },
    writeAudit: async () => {}
} };
const { uploadFilesToExam } = require('../src/services/pacsUploadService');
const { exportRenderedImagesZip } = require('../src/services/pacsExportService');
const { snapshotPacs, visitZip } = require('../src/services/pacsBackupService');
const { encryptBackup } = require('../src/services/postgresBackupService');
const { restorePacsBackup } = require('./restorePacsBackup');

async function main() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'viara-isolated-pacs-'));
    try {
        for (const port of [18043, 18044]) {
            const existing = await fetch(`http://127.0.0.1:${port}/instances`, { signal: AbortSignal.timeout(5000) });
            assert.equal((await existing.json()).length, 0, 'Use only an empty disposable archive');
        }
        const { DicomDict, DicomMetaDictionary } = dcmjs.data;
        const sop = DicomMetaDictionary.uid();
        const dataset = { PatientID: 'SYNTHETIC', PatientName: 'SYNTHETIC^TEST', AccessionNumber: 'SOURCE',
            StudyInstanceUID: DicomMetaDictionary.uid(), SeriesInstanceUID: DicomMetaDictionary.uid(), SOPInstanceUID: sop,
            SOPClassUID: '1.2.840.10008.5.1.4.1.1.7.2', Modality: 'OT', InstanceNumber: 1,
            Rows: 2, Columns: 2, SamplesPerPixel: 1, PhotometricInterpretation: 'MONOCHROME2',
            NumberOfFrames: 2, BitsAllocated: 8, BitsStored: 8, HighBit: 7, PixelRepresentation: 0,
            PixelData: new Uint8Array([0, 80, 160, 240, 240, 160, 80, 0]).buffer };
        const dict = new DicomDict({ TransferSyntaxUID: '1.2.840.10008.1.2.1', MediaStorageSOPClassUID: dataset.SOPClassUID, MediaStorageSOPInstanceUID: sop });
        dict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
        const pool = { query: async () => ({ rows: [{ exam_id: 'synthetic', order_number: 'TEST-ORDER', study_instance_uid: '2.25.123456789', mrn: 'SYNTHETIC', status: 'Scheduled' }] }) };
        const result = await uploadFilesToExam(pool, { examId: 'synthetic', files: [{ buffer: Buffer.from(dict.write()), originalname: 'synthetic.dcm', mimetype: 'application/dicom' }] });
        assert.equal(result.reconciled, 1, JSON.stringify(result.results));
        const studyId = (await (await fetch(process.env.ORTHANC_URL + '/studies')).json())[0];
        const chunks = [];
        const res = new Writable({ write(chunk, _, done) { chunks.push(chunk); done(); } });
        res.status = () => res; res.setHeader = () => {};
        const exported = await exportRenderedImagesZip({ orthancUrl: process.env.ORTHANC_URL, auth: 'Basic test', orthancStudyId: studyId, study: { study_instance_uid: '2.25.123456789' }, filename: 'images.zip', res });
        assert.equal(exported.imageCount, 2);
        const images = path.join(directory, 'images.zip'); await fs.writeFile(images, Buffer.concat(chunks));
        let imageEntries = 0;
        await visitZip(images, async (entry, stream) => { for await (const chunk of stream) void chunk; if (entry.fileName.startsWith('images/')) imageEntries++; });
        assert.equal(imageEntries, 2);
        const backup = path.join(directory, 'pacs.zip');
        await snapshotPacs(backup, { connection: { url: process.env.ORTHANC_URL, username: 'isolated', password: 'isolated-only' } });
        const encrypted = backup + '.enc'; await encryptBackup(backup, encrypted);
        const restored = await restorePacsBackup({ file: encrypted, target: 'http://127.0.0.1:18044', username: 'isolated', password: 'isolated-only' });
        assert.equal(restored.restored, 1);
        console.log('PASS: DICOM upload, patient/study stamping, 2-frame ZIP export, encrypted backup and empty-archive recovery.');
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
