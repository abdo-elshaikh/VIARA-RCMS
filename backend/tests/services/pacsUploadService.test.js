const dcmjs = require('dcmjs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');

// Silence the service logger.
jest.mock('../../src/config/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

// Stub reconcile so we assert the payload the upload service hands off, without
// needing a DB. The real reconcile path is covered by its own test file.
jest.mock('../../src/services/pacsReconcileService', () => ({
    reconcileInstance: jest.fn(async () => ({ status: 'reconciled', exam_id: 'exam-1', image_count: 1 }))
}));

// Keep Orthanc URL/creds deterministic before the service captures them.
process.env.ORTHANC_URL = 'http://orthanc:8042';
process.env.ORTHANC_PASSWORD = 'test-password';

const { reconcileInstance } = require('../../src/services/pacsReconcileService');
const {
    uploadFilesToExam,
    getUploadProgress,
    isDicom,
    parseDicomIdentity,
    buildDicomModifyRequest,
    buildSecondaryCaptureSeriesUid
} = require('../../src/services/pacsUploadService');

const { DicomDict, DicomMetaDictionary } = dcmjs.data;

// Build a minimal valid Part-10 DICOM buffer with the given identity tags.
const makeDicomBuffer = (over = {}) => {
    const ds = {
        PatientID: 'OLD', PatientName: 'OLD^NAME', AccessionNumber: 'OLDACC',
        StudyInstanceUID: DicomMetaDictionary.uid(),
        SeriesInstanceUID: DicomMetaDictionary.uid(),
        SOPInstanceUID: DicomMetaDictionary.uid(),
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.7', Modality: 'CT', ...over
    };
    const dict = new DicomDict({
        TransferSyntaxUID: '1.2.840.10008.1.2.1',
        MediaStorageSOPClassUID: ds.SOPClassUID,
        MediaStorageSOPInstanceUID: ds.SOPInstanceUID
    });
    const originalConsoleError = console.error;
    console.error = jest.fn();
    try {
        dict.dict = DicomMetaDictionary.denaturalizeDataset(ds);
        return { buffer: Buffer.from(dict.write()), ds };
    } finally {
        console.error = originalConsoleError;
    }
};

// Exam identity + Orthanc REST mock shared by the flow tests.
const makeExamPool = () => ({
    query: jest.fn(async (sql) => {
        if (sql.includes('FROM examinations e') && sql.includes('JOIN patients')) {
            return { rows: [{
                exam_id: 'exam-1', order_number: 'ORD-0001',
                study_instance_uid: '1.2.900', status: 'Scheduled',
                mrn: 'MRN100', first_name_enc: null, last_name_enc: null
            }] };
        }
        return { rows: [] };
    })
});

describe('pacsUploadService', () => {
    afterEach(() => { jest.restoreAllMocks(); reconcileInstance.mockClear(); });

    describe('isDicom', () => {
        it('detects the DICM magic at offset 128', () => {
            const buf = Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), Buffer.alloc(8)]);
            expect(isDicom(buf)).toBe(true);
        });
        it('treats a .dcm filename as DICOM even without the magic', () => {
            expect(isDicom(Buffer.from([0, 1, 2]), 'scan.dcm', '')).toBe(true);
        });
        it('rejects a PNG', () => {
            expect(isDicom(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'x.png', 'image/png')).toBe(false);
        });
    });

    describe('DICOM series identity', () => {
        it('reads the source series metadata used during reconciliation', () => {
            const { buffer, ds } = makeDicomBuffer({
                SeriesNumber: 7,
                InstanceNumber: 12,
                SeriesDescription: 'AX T2',
                BodyPartExamined: 'KNEE'
            });
            const identity = parseDicomIdentity(buffer);

            expect(identity).toMatchObject({
                seriesInstanceUid: ds.SeriesInstanceUID,
                sopInstanceUid: ds.SOPInstanceUID,
                seriesNumber: 7,
                instanceNumber: 12,
                seriesDescription: 'AX T2',
                bodyPartExamined: 'KNEE'
            });
        });

        it('tells Orthanc to preserve source Series/SOP UIDs while stamping the study', () => {
            const request = buildDicomModifyRequest({
                patientId: 'MRN100', patientName: 'DOE^JANE',
                accessionNumber: 'ORD-0001', studyInstanceUid: '1.2.900'
            });

            expect(request.Replace).toMatchObject({
                PatientID: 'MRN100',
                AccessionNumber: 'ORD-0001',
                StudyInstanceUID: '1.2.900'
            });
            expect(request.Keep).toEqual(['SeriesInstanceUID', 'SOPInstanceUID']);
            expect(request.Force).toBe(true);
        });

        it('keeps secondary captures in one series across upload batches', () => {
            const first = buildSecondaryCaptureSeriesUid('exam-1', 'upload-session-1');
            const second = buildSecondaryCaptureSeriesUid('exam-1', 'upload-session-1');
            const different = buildSecondaryCaptureSeriesUid('exam-1', 'upload-session-2');

            expect(first).toBe(second);
            expect(first).not.toBe(different);
            expect(first).toMatch(/^2\.25\.\d+$/);
            expect(first.length).toBeLessThanOrEqual(64);
        });
    });

    describe('uploadFilesToExam', () => {
        it('stamps a DICOM file, stores it in Orthanc, and reconciles it', async () => {
            const pool = makeExamPool();
            const { buffer, ds } = makeDicomBuffer({
                SeriesNumber: 3,
                InstanceNumber: 8,
                SeriesDescription: 'COR PD',
                BodyPartExamined: 'KNEE'
            });

            let storeCount = 0;
            global.fetch = jest.fn(async (url, options = {}) => {
                if (String(url).includes('/modify')) {
                    return new Response(buffer, { status: 200 });
                }
                if (options.method === 'DELETE') return new Response(null, { status: 200 });
                if (String(url).endsWith('/instances')) {
                    storeCount += 1;
                    return new Response(JSON.stringify({
                        ID: storeCount === 1 ? 'orth-source' : 'orth-abc',
                        ParentStudy: storeCount === 1 ? 'source-study' : 'study-xyz',
                        Status: 'Success'
                    }), { status: 200 });
                }
                return new Response('{}', { status: 200 });
            });

            const res = await uploadFilesToExam(pool, {
                files: [{ buffer, originalname: 'series1.dcm', mimetype: 'application/dicom' }],
                examId: 'exam-1'
            });

            // Original upload, Orthanc modification, stamped upload, source removal.
            expect(global.fetch).toHaveBeenCalledTimes(4);
            expect(global.fetch.mock.calls[0][0]).toBe('http://orthanc:8042/instances');
            expect(global.fetch.mock.calls[2][0]).toBe('http://orthanc:8042/instances');
            expect(global.fetch.mock.calls[3][1].method).toBe('DELETE');
            const modifyCall = global.fetch.mock.calls.find((call) => String(call[0]).includes('/modify'));
            expect(JSON.parse(modifyCall[1].body).Keep).toEqual(['SeriesInstanceUID', 'SOPInstanceUID']);

            // Reconciled with the exam's identity (accession + study bound).
            expect(reconcileInstance).toHaveBeenCalledTimes(1);
            const payload = reconcileInstance.mock.calls[0][1];
            expect(payload.AccessionNumber).toBe('ORD-0001');
            expect(payload.StudyInstanceUID).toBe('1.2.900');
            expect(payload.PatientID).toBe('MRN100');
            expect(payload.OrthancInstanceId).toBe('orth-abc');
            expect(payload.SeriesInstanceUID).toBe(ds.SeriesInstanceUID);
            expect(payload.SOPInstanceUID).toBe(ds.SOPInstanceUID);
            expect(payload.SeriesNumber).toBe(3);
            expect(payload.InstanceNumber).toBe(8);
            expect(payload.SeriesDescription).toBe('COR PD');
            expect(payload.BodyPartExamined).toBe('KNEE');

            expect(res.stored).toBe(1);
            expect(res.reconciled).toBe(1);
            expect(res.unreconciled).toBe(0);
            expect(res.image_count).toBe(1);
            expect(res.results[0].status).toBe('stored');
        });

        it('processes a path-backed DICOM upload and removes the quarantine file', async () => {
            const pool = makeExamPool();
            const { buffer } = makeDicomBuffer();
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pacs-upload-'));
            const filePath = path.join(tempDir, 'quarantine.dcm');
            fs.writeFileSync(filePath, buffer);
            let storeCount = 0;
            global.fetch = jest.fn(async (url, options = {}) => {
                if (String(url).includes('/modify')) return new Response(buffer, { status: 200 });
                if (options.method === 'DELETE') return new Response(null, { status: 200 });
                if (String(url).endsWith('/instances')) {
                    storeCount += 1;
                    if (options.body && typeof options.body.pipe === 'function') {
                        for await (const _chunk of options.body) { /* consume upload stream */ }
                    }
                    return new Response(JSON.stringify({ ID: `path-${storeCount}`, ParentStudy: 'path-study', Status: 'Success' }), { status: 200 });
                }
                return new Response('{}', { status: 200 });
            });

            try {
                const res = await uploadFilesToExam(pool, {
                    files: [{ path: filePath, originalname: 'path.dcm', mimetype: 'application/dicom' }],
                    examId: 'exam-1'
                });

                expect(res.reconciled).toBe(1);
                expect(fs.existsSync(filePath)).toBe(false);
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it('removes a path-backed quarantine file when exam validation fails', async () => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pacs-upload-'));
            const filePath = path.join(tempDir, 'missing.dcm');
            fs.writeFileSync(filePath, Buffer.from('DICOM'));

            try {
                await expect(uploadFilesToExam(
                    { query: jest.fn(async () => ({ rows: [] })) },
                    {
                        files: [{ path: filePath, originalname: 'missing.dcm', mimetype: 'application/dicom' }],
                        examId: 'missing',
                        actorUserId: 'cleanup-user'
                    }
                )).rejects.toMatchObject({ statusCode: 404 });
                expect(fs.existsSync(filePath)).toBe(false);
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it('does not reconcile an un-stamped DICOM when Orthanc modify fails', async () => {
            const pool = makeExamPool();
            const { buffer } = makeDicomBuffer();

            global.fetch = jest.fn(async (url, options = {}) => {
                if (String(url).includes('/modify')) return new Response('modify failed', { status: 500 });
                if (options.method === 'DELETE') return new Response(null, { status: 200 });
                return new Response(JSON.stringify({
                    ID: 'orth-source',
                    ParentStudy: 'source-study',
                    Status: 'Success'
                }), { status: 200 });
            });

            const res = await uploadFilesToExam(pool, {
                files: [{ buffer, originalname: 'unstamped.dcm', mimetype: 'application/dicom' }],
                examId: 'exam-1'
            });

            expect(reconcileInstance).not.toHaveBeenCalled();
            expect(global.fetch.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(true);
            expect(res).toMatchObject({ stored: 0, reconciled: 0, unreconciled: 0, failed: 1 });
        });

        it('wraps a PNG into a Secondary Capture via create-dicom then reconciles', async () => {
            const pool = makeExamPool();
            const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

            global.fetch = jest.fn(async (url) => {
                if (String(url).includes('/tools/create-dicom')) {
                    return { ok: true, status: 200, text: async () => JSON.stringify({ ID: 'orth-img', ParentStudy: 'study-img' }) };
                }
                if (String(url).includes('/tags')) {
                    return { ok: true, status: 200, json: async () => ({ SeriesInstanceUID: '9.9.1', SOPInstanceUID: '9.9.2', SOPClassUID: '1.2.840.10008.5.1.4.1.1.7', Modality: 'OT' }) };
                }
                return { ok: true, status: 200, text: async () => '{}' };
            });

            const res = await uploadFilesToExam(pool, {
                files: [{ buffer: png, originalname: 'photo.png', mimetype: 'image/png' }],
                examId: 'exam-1'
            });

            const createCall = global.fetch.mock.calls.find((c) => String(c[0]).includes('/tools/create-dicom'));
            expect(createCall).toBeDefined();
            const body = JSON.parse(createCall[1].body);
            expect(body.Content).toMatch(/^data:image\/png;base64,/);
            expect(body.Tags.AccessionNumber).toBe('ORD-0001');
            expect(body.Tags.StudyInstanceUID).toBe('1.2.900');

            expect(reconcileInstance).toHaveBeenCalledTimes(1);
            const payload = reconcileInstance.mock.calls[0][1];
            expect(payload.SOPInstanceUID).toBe('9.9.2');
            expect(payload.Modality).toBe('OT');
            expect(res.stored).toBe(1);
        });

        it('reports a stored image separately when reconciliation quarantines it', async () => {
            const pool = makeExamPool();
            const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            reconcileInstance.mockResolvedValueOnce({
                status: 'quarantined',
                reason: 'PATIENT_ID_MISMATCH'
            });

            global.fetch = jest.fn(async (url) => {
                if (String(url).includes('/tools/create-dicom')) {
                    return { ok: true, status: 200, text: async () => JSON.stringify({ ID: 'orth-img', ParentStudy: 'study-img' }) };
                }
                if (String(url).includes('/tags')) {
                    return { ok: true, status: 200, json: async () => ({ SeriesInstanceUID: '9.9.1', SOPInstanceUID: '9.9.2' }) };
                }
                return { ok: true, status: 200, text: async () => '{}' };
            });

            const res = await uploadFilesToExam(pool, {
                files: [{ buffer: png, originalname: 'photo.png', mimetype: 'image/png' }],
                examId: 'exam-1'
            });

            expect(res).toMatchObject({ stored: 1, reconciled: 0, unreconciled: 1 });
            expect(res.results[0]).toMatchObject({
                status: 'unreconciled',
                reconciliation_status: 'quarantined',
                reason: 'PATIENT_ID_MISMATCH'
            });
        });

        it('rejects unsupported file types without calling Orthanc', async () => {
            const pool = makeExamPool();
            global.fetch = jest.fn();
            const res = await uploadFilesToExam(pool, {
                files: [{ buffer: Buffer.from('hello'), originalname: 'notes.txt', mimetype: 'text/plain' }],
                examId: 'exam-1'
            });
            expect(global.fetch).not.toHaveBeenCalled();
            expect(reconcileInstance).not.toHaveBeenCalled();
            expect(res.stored).toBe(0);
            expect(res.results[0]).toMatchObject({ status: 'rejected' });
            expect(res.results[0].reason).toContain('UNSUPPORTED_TYPE');
        });

        it('consumes a stream-backed upload without requiring file.buffer', async () => {
            const pool = makeExamPool();
            global.fetch = jest.fn();

            const res = await uploadFilesToExam(pool, {
                files: [{ stream: Readable.from(Buffer.from('hello')), originalname: 'notes.txt', mimetype: 'text/plain' }],
                examId: 'exam-1'
            });

            expect(global.fetch).not.toHaveBeenCalled();
            expect(res.results[0]).toMatchObject({ status: 'rejected' });
        });

        it('rejects overlapping uploads from the same user by default', async () => {
            let releaseLookup;
            const lookupBlocked = new Promise((resolve) => { releaseLookup = resolve; });
            const pool = makeExamPool();
            const originalQuery = pool.query;
            pool.query = jest.fn(async (...args) => {
                await lookupBlocked;
                return originalQuery(...args);
            });
            const first = uploadFilesToExam(pool, {
                files: [{ buffer: Buffer.from('hello'), originalname: 'one.txt', mimetype: 'text/plain' }],
                examId: 'exam-1',
                actorUserId: 'busy-user'
            });

            await expect(uploadFilesToExam(makeExamPool(), {
                files: [{ buffer: Buffer.from('hello'), originalname: 'two.txt', mimetype: 'text/plain' }],
                examId: 'exam-1',
                actorUserId: 'busy-user'
            })).rejects.toMatchObject({ statusCode: 429 });

            releaseLookup();
            await first;
        });

        it('keeps cumulative progress across request batches in one upload session', async () => {
            jest.useFakeTimers();
            try {
                const pool = makeExamPool();
                global.fetch = jest.fn();
                const common = {
                    files: [{ buffer: Buffer.from('hello'), originalname: 'notes.txt', mimetype: 'text/plain' }],
                    examId: 'exam-1',
                    uploadSessionId: 'session-batches',
                    expectedTotal: 2,
                    actorUserId: 'user-1'
                };

                await uploadFilesToExam(pool, common);
                expect(getUploadProgress('session-batches', {
                    examId: 'exam-1', actorUserId: 'user-1'
                })).toMatchObject({
                    status: 'processing', total: 2, processed: 1, rejected: 1
                });

                const finalBatch = await uploadFilesToExam(pool, common);
                expect(getUploadProgress('session-batches', {
                    examId: 'exam-1', actorUserId: 'user-1'
                })).toMatchObject({
                    status: 'failed', total: 2, processed: 2, rejected: 2
                });
                expect(finalBatch.upload_progress).toMatchObject({
                    status: 'failed', total: 2, processed: 2, rejected: 2
                });
            } finally {
                jest.useRealTimers();
            }
        });

        it('generates and persists a Study UID when the exam lacks one', async () => {
            const pool = {
                query: jest.fn(async (sql) => {
                    if (sql.includes('FROM examinations e') && sql.includes('JOIN patients')) {
                        return { rows: [{ exam_id: 'exam-2', order_number: 'ORD-2', study_instance_uid: null, status: 'Scheduled', mrn: 'MRN2', first_name_enc: null, last_name_enc: null }] };
                    }
                    return { rows: [] };
                })
            };
            const { buffer } = makeDicomBuffer();
            let storeCount = 0;
            global.fetch = jest.fn(async (url, options = {}) => {
                if (String(url).includes('/modify')) return new Response(buffer, { status: 200 });
                if (options.method === 'DELETE') return new Response(null, { status: 200 });
                storeCount += 1;
                return new Response(JSON.stringify({ ID: `i-${storeCount}`, ParentStudy: 's' }), { status: 200 });
            });

            const res = await uploadFilesToExam(pool, {
                files: [{ buffer, originalname: 'a.dcm', mimetype: 'application/dicom' }],
                examId: 'exam-2'
            });

            // A generated study UID is persisted back onto the exam.
            const updateCall = pool.query.mock.calls.find((c) => c[0].includes('UPDATE examinations') && c[0].includes('study_instance_uid'));
            expect(updateCall).toBeDefined();
            expect(res.study_instance_uid).toBeTruthy();
            expect(reconcileInstance.mock.calls[0][1].StudyInstanceUID).toBe(res.study_instance_uid);
        });

        it('throws 404 when the exam does not exist', async () => {
            const pool = { query: jest.fn(async () => ({ rows: [] })) };
            const { buffer } = makeDicomBuffer();
            await expect(uploadFilesToExam(pool, {
                files: [{ buffer, originalname: 'a.dcm', mimetype: 'application/dicom' }],
                examId: 'missing'
            })).rejects.toMatchObject({ statusCode: 404 });
        });
    });
});
