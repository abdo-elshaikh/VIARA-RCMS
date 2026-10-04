const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const dcmjs = require('dcmjs');
const logger = require('../config/logger');
const { decrypt } = require('../utils/crypto');
const { toDicomPatientName } = require('../utils/arabicTransliteration');
const { reconcileInstance } = require('./pacsReconcileService');
const { getOrthancUrl, getOrthancAuthHeader } = require('./pacsDicomWebService');

const { DicomMetaDictionary, DicomMessage } = dcmjs.data;


// Secondary Capture Image Storage — the SOP class for scanned/photographed images
// that arrive outside a modality (JPEG/PNG wrapped into DICOM).
const SC_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.7';

const IMAGE_MIME = { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png' };

const MAX_PROGRESS_ENTRIES = 10000;
const uploadProgress = new Map();
const activeUserUploads = new Map();

const boundedInteger = (value, fallback, maximum) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
    return Math.min(maximum, parsed);
};

const readUploadBuffer = async (file) => {
    if (file?.buffer) return file.buffer;
    if (file?.path) return fsp.readFile(file.path);
    if (file?.stream) {
        const chunks = [];
        for await (const chunk of file.stream) chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks);
    }
    return null;
};

const evictOldProgressEntries = () => {
    if (uploadProgress.size <= MAX_PROGRESS_ENTRIES) return;
    const now = Date.now();
    for (const [key, val] of uploadProgress.entries()) {
        const updated = new Date(val.updatedAt || 0).getTime();
        if (now - updated > 30 * 60 * 1000) {
            uploadProgress.delete(key);
        }
    }
};

const clearUploadSession = (uploadSessionId) => {
    if (!uploadSessionId) return;
    uploadProgress.delete(uploadSessionId);
};

const initUploadProgress = (uploadSessionId, total = 0, metadata = {}) => {
    if (!uploadSessionId) return null;
    const existing = uploadProgress.get(uploadSessionId) || {};
    const next = {
        status: existing.status || 'processing',
        total: Math.max(Number(existing.total || 0), Number(total || 0)),
        processed: Number(existing.processed || 0),
        stored: Number(existing.stored || 0),
        reconciled: Number(existing.reconciled || 0),
        unreconciled: Number(existing.unreconciled || 0),
        failed: Number(existing.failed || 0),
        rejected: Number(existing.rejected || 0),
        activeFiles: Array.isArray(existing.activeFiles) ? existing.activeFiles : [],
        currentFile: existing.currentFile || null,
        lastError: existing.lastError || null,
        examId: existing.examId || metadata.examId || null,
        actorUserId: existing.actorUserId || metadata.actorUserId || null,
        startedAt: existing.startedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    uploadProgress.set(uploadSessionId, next);
    evictOldProgressEntries();
    return next;
};

const scheduleUploadProgressCleanup = (uploadSessionId) => {
    if (!uploadSessionId) return;
    setTimeout(() => {
        uploadProgress.delete(uploadSessionId);
    }, 60 * 60 * 1000);
};

const patchUploadProgress = (uploadSessionId, patch = {}) => {
    if (!uploadSessionId) return null;
    const current = initUploadProgress(uploadSessionId);
    const next = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString()
    };
    uploadProgress.set(uploadSessionId, next);
    return next;
};

const markFileActive = (uploadSessionId, file) => {
    if (!uploadSessionId || !file) return null;
    const current = initUploadProgress(uploadSessionId);
    const activeFiles = [file, ...current.activeFiles.filter((name) => name !== file)].slice(0, 8);
    return patchUploadProgress(uploadSessionId, {
        status: 'processing',
        activeFiles,
        currentFile: activeFiles[0] || file
    });
};

const markFileStored = (uploadSessionId, file) => {
    if (!uploadSessionId) return null;
    const current = initUploadProgress(uploadSessionId);
    return patchUploadProgress(uploadSessionId, {
        stored: current.stored + 1,
        currentFile: file || current.currentFile
    });
};

const markFileProcessed = (uploadSessionId, { status, file, error } = {}) => {
    if (!uploadSessionId) return null;
    const current = initUploadProgress(uploadSessionId);
    const activeFiles = file
        ? current.activeFiles.filter((name) => name !== file)
        : current.activeFiles;
    const next = {
        ...current,
        processed: current.processed + 1,
        reconciled: current.reconciled + (status === 'reconciled' ? 1 : 0),
        unreconciled: current.unreconciled + (status === 'unreconciled' ? 1 : 0),
        failed: current.failed + (status === 'error' ? 1 : 0),
        rejected: current.rejected + (status === 'rejected' ? 1 : 0),
        activeFiles,
        currentFile: activeFiles[0] || file || current.currentFile,
        lastError: error || current.lastError,
        updatedAt: new Date().toISOString()
    };
    uploadProgress.set(uploadSessionId, next);
    return next;
};

const runWithConcurrency = async (items, limit, worker) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            await worker(items[index], index);
        }
    });
    await Promise.all(workers);
};

const buildSecondaryCaptureSeriesUid = (examId, uploadSessionId) => {
    if (!uploadSessionId) return DicomMetaDictionary.uid();
    const digest = crypto
        .createHash('sha256')
        .update(`${examId}:${String(uploadSessionId).slice(0, 128)}`)
        .digest('hex')
        .slice(0, 32);
    return `2.25.${BigInt(`0x${digest}`).toString(10)}`;
};

const safeDecrypt = (value) => {
    if (!value) return '';
    try { return decrypt(value); } catch { return ''; }
};

// DICOM PN "Family^Given"; transliterates Arabic names to clean Latin characters to prevent
// modality console Mojibake/reversals and allow technician search with standard English keyboards.
const buildPatientName = (last, first) => {
    return toDicomPatientName(last, first, { dualGroup: true, nativeFirst: true });
};

/**
 * True if the bytes look like a Part-10 DICOM file (the "DICM" magic at offset
 * 128) or the caller flagged it via filename/mimetype. Non-DICOM uploads (JPEG/
 * PNG) take the Secondary-Capture path instead.
 */
const isDicom = (buffer, filename = '', mimetype = '') => {
    if (buffer && buffer.length >= 132 && buffer.toString('ascii', 128, 132) === 'DICM') return true;
    if (mimetype === 'application/dicom') return true;
    return /\.dcm$/i.test(filename);
};

/**
 * Parse DICOM identity tags from a Part-10 buffer WITHOUT re-encoding the pixels.
 * We only read what we need for reconciliation; the original buffer is uploaded
 * as-is to Orthanc so no pixel data is ever lost.
 */
const parseDicomIdentity = (buffer) => {
    try {
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        const parsed = DicomMessage.readFile(arrayBuffer, { ignoreErrors: true });
        const ds = DicomMetaDictionary.naturalizeDataset(parsed.dict);
        return {
            patientId: String(ds.PatientID || '').trim(),
            patientName: ds.PatientName || '',
            accessionNumber: ds.AccessionNumber || '',
            studyInstanceUid: ds.StudyInstanceUID || null,
            hasReferencedObjects: containsDicomReferences(ds),
            seriesInstanceUid: ds.SeriesInstanceUID || null,
            sopInstanceUid: ds.SOPInstanceUID || null,
            sopClassUid: ds.SOPClassUID || SC_SOP_CLASS_UID,
            modality: ds.Modality || 'OT',
            seriesNumber: ds.SeriesNumber ?? null,
            instanceNumber: ds.InstanceNumber ?? null,
            seriesDescription: ds.SeriesDescription || null,
            bodyPartExamined: ds.BodyPartExamined || null
        };
    } catch {
        return {
            patientId: '',
            patientName: '',
            accessionNumber: '',
            studyInstanceUid: null,
            seriesInstanceUid: null,
            sopInstanceUid: null,
            sopClassUid: SC_SOP_CLASS_UID,
            modality: 'OT',
            seriesNumber: null,
            instanceNumber: null,
            seriesDescription: null,
            bodyPartExamined: null
        };
    }
};

const containsDicomReferences = (value) => {
    if (!value || typeof value !== 'object' || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return false;
    if (Array.isArray(value)) return value.some(containsDicomReferences);
    return Object.entries(value).some(([key, entry]) => key !== 'PixelData'
        && ((/^(?:Referenced.*(?:Sequence|InstanceUID)|SourceImageSequence)$/.test(key) && entry != null)
            || containsDicomReferences(entry)));
};

const mappedDicomUid = (studyUid, sourceUid) => '2.25.' + BigInt('0x' + crypto.createHash('sha256')
    .update(`${studyUid}|${sourceUid}`).digest('hex').slice(0, 32)).toString();

const buildDicomModifyRequest = (identity, source = {}) => ({
    Replace: {
        SpecificCharacterSet: 'ISO_IR 192',
        PatientID: identity.patientId,
        ...(source.patientId ? {} : { PatientName: identity.patientName }),
        AccessionNumber: identity.accessionNumber,
        StudyInstanceUID: identity.studyInstanceUid,
        ...(source.studyInstanceUid && source.studyInstanceUid !== identity.studyInstanceUid ? {
            SeriesInstanceUID: mappedDicomUid(identity.studyInstanceUid, source.seriesInstanceUid),
            SOPInstanceUID: mappedDicomUid(identity.studyInstanceUid, source.sopInstanceUid)
        } : (source.sopInstanceUid ? { SOPInstanceUID: mappedDicomUid(identity.studyInstanceUid, `derived:${source.sopInstanceUid}`) } : {}))
    },
    // Orthanc regenerates hierarchy UIDs by default when patient/study identity
    // changes. Keeping these two values preserves the modality's real series
    // grouping and keeps reconciliation idempotent across webhook replays.
    Keep: source.studyInstanceUid && source.studyInstanceUid !== identity.studyInstanceUid ? []
        : (source.sopInstanceUid ? ['SeriesInstanceUID'] : ['SeriesInstanceUID', 'SOPInstanceUID']),
    Force: true,
    KeepSource: false
});

/**
 * Upload raw DICOM to Orthanc, then re-stamp identity tags via Orthanc's /modify
 * endpoint (which transcodes safely, preserving pixel data).
 * Returns { orthancInstanceId, orthancStudyId, seriesInstanceUid, sopInstanceUid, sopClassUid, modality }.
 */
const storeAndStampDicom = async (source, buffer, identity) => {
    // 1. Read identity from the file (no re-encoding — pixels are untouched).
    const fileId = parseDicomIdentity(buffer);
    if (!fileId.patientId || fileId.patientId !== identity.patientId) {
        throw new Error('DICOM patient identity does not match this examination. Review the source patient ID before importing.');
    }
    if (![fileId.studyInstanceUid, fileId.seriesInstanceUid, fileId.sopInstanceUid].every(uid => typeof uid === 'string' && uid.length <= 64 && /^[0-9]+(?:\.[0-9]+)+$/.test(uid))) {
        throw new Error('DICOM study, series and instance UIDs are required');
    }
    if (fileId.studyInstanceUid !== identity.studyInstanceUid && fileId.hasReferencedObjects) {
        throw new Error('Referenced DICOM objects must be imported into their original study; moving them would break source-image references.');
    }

    // 2. Push the original buffer to Orthanc.
    const uploaded = await storeDicomBuffer(source);
    if (fileId.studyInstanceUid === identity.studyInstanceUid && fileId.accessionNumber === identity.accessionNumber) {
        return { ...uploaded, ...fileId };
    }

    // 3. Re-stamp identity tags using Orthanc's server-side /modify endpoint.
    // This preserves the transfer syntax and pixel data perfectly.
    const url = await getOrthancUrl();
    const auth = await getOrthancAuthHeader();
    const modifyRes = await fetch(`${url}/instances/${uploaded.orthancInstanceId}/modify`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDicomModifyRequest(identity, fileId))
    });

    if (!modifyRes.ok) {
        // Never reconcile an un-stamped instance against the target order. It
        // would make the RIS index claim identity values the DICOM does not have.
        if (uploaded.orthancStatus !== 'AlreadyStored') {
            await deleteOrthancInstance(url, auth, uploaded.orthancInstanceId);
        }
        logger.warn('PACS: /modify failed; source instance was not reconciled', {
            instanceId: uploaded.orthancInstanceId,
            status: modifyRes.status
        });
        throw new Error(`Orthanc could not bind the DICOM file to this order (${modifyRes.status})`);
    }

    // /modify returns the new instance's binary DICOM; we need to re-upload it.
    const modifiedBuffer = Buffer.from(await modifyRes.arrayBuffer());
    const modifiedFileId = parseDicomIdentity(modifiedBuffer);
    if (modifiedFileId.patientId !== identity.patientId || modifiedFileId.studyInstanceUid !== identity.studyInstanceUid
        || modifiedFileId.accessionNumber !== identity.accessionNumber || !modifiedFileId.seriesInstanceUid || !modifiedFileId.sopInstanceUid) {
        if (uploaded.orthancStatus !== 'AlreadyStored') await deleteOrthancInstance(url, auth, uploaded.orthancInstanceId);
        throw new Error('Orthanc returned a DICOM object with an unexpected patient or study identity');
    }
    // Store the stamped instance before removing the temporary source. This
    // avoids losing the upload if the second PACS write fails.
    const stamped = await storeDicomBuffer(modifiedBuffer);
    if (uploaded.orthancStatus !== 'AlreadyStored'
        && uploaded.orthancInstanceId !== stamped.orthancInstanceId) {
        await deleteOrthancInstance(url, auth, uploaded.orthancInstanceId);
    }

    return {
        orthancInstanceId: stamped.orthancInstanceId,
        orthancStudyId: stamped.orthancStudyId,
        seriesInstanceUid: modifiedFileId.seriesInstanceUid || fileId.seriesInstanceUid || DicomMetaDictionary.uid(),
        sopInstanceUid: modifiedFileId.sopInstanceUid || fileId.sopInstanceUid || DicomMetaDictionary.uid(),
        sopClassUid: modifiedFileId.sopClassUid || fileId.sopClassUid,
        modality: modifiedFileId.modality || fileId.modality,
        seriesNumber: modifiedFileId.seriesNumber ?? fileId.seriesNumber,
        instanceNumber: modifiedFileId.instanceNumber ?? fileId.instanceNumber,
        seriesDescription: modifiedFileId.seriesDescription || fileId.seriesDescription,
        bodyPartExamined: modifiedFileId.bodyPartExamined || fileId.bodyPartExamined
    };
};

const deleteOrthancInstance = async (url, auth, instanceId) => {
    try {
        const response = await fetch(`${url}/instances/${instanceId}`, {
            method: 'DELETE',
            headers: { Authorization: auth }
        });
        if (!response.ok && response.status !== 404) {
            logger.warn('PACS: temporary source cleanup failed', {
                instanceId,
                status: response.status
            });
        }
    } catch (error) {
        logger.warn('PACS: temporary source cleanup failed', {
            instanceId,
            error: error.message
        });
    }
};

// --- Orthanc REST helpers (the only Orthanc-specific code path for uploads) ---

const orthancPost = async (path, { body, contentType, json }) => {
    const url = await getOrthancUrl();
    const auth = await getOrthancAuthHeader();
    let res;
    try {
        const streaming = body && typeof body.pipe === 'function';
        res = await fetch(`${url}${path}`, {
            method: 'POST',
            headers: {
                Authorization: auth,
                'Content-Type': contentType || (json ? 'application/json' : 'application/octet-stream')
            },
            body: json ? JSON.stringify(json) : body,
            ...(streaming ? { duplex: 'half' } : {})
        });
    } catch (error) {
        // fetch() throws (not a non-2xx response) only when the connection itself
        // fails — Orthanc down, wrong host/port, DNS. Make that actionable.
        throw new Error(`Cannot reach Orthanc (PACS) at ${url} — check that the PACS server is running and the API URL/credentials in PACS settings are correct (${error.message})`);
    }
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Orthanc ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : {};
};

const orthancGetSimplifiedTags = async (instanceId) => {
    const url = await getOrthancUrl();
    const auth = await getOrthancAuthHeader();
    let res;
    try {
        res = await fetch(`${url}/instances/${instanceId}/tags?simplify`, {
            headers: { Authorization: auth }
        });
    } catch {
        return {};
    }
    if (!res.ok) return {};
    return res.json();
};

/**
 * Push a Part-10 DICOM buffer or file path into Orthanc's hot storage.
 * Returns { orthancInstanceId, orthancStudyId }.
 */
const storeDicomBuffer = async (source) => {
    const body = typeof source === 'string' ? fs.createReadStream(source) : source;
    const result = await orthancPost('/instances', { body, contentType: 'application/dicom' });
    return {
        orthancInstanceId: result.ID,
        orthancStudyId: result.ParentStudy,
        orthancStatus: result.Status || null
    };
};

/**
 * Wrap a JPEG/PNG image into a DICOM Secondary Capture object bound to the exam,
 * letting Orthanc do the pixel encoding. Returns { orthancInstanceId,
 * orthancStudyId, tags }.
 */
const storeImageAsDicom = async (buffer, mimetype, identity, description) => {
    const kind = IMAGE_MIME[mimetype];
    const dataUri = `data:${kind === 'png' ? 'image/png' : 'image/jpeg'};base64,${buffer.toString('base64')}`;
    const created = await orthancPost('/tools/create-dicom', {
        json: {
            Content: dataUri,
            Force: true,
            Keep: true,
            Tags: {
                SpecificCharacterSet: 'ISO_IR 192',
                PatientID: identity.patientId,
                PatientName: identity.patientName,
                AccessionNumber: identity.accessionNumber,
                StudyInstanceUID: identity.studyInstanceUid,
                SeriesInstanceUID: identity.imageSeriesUid,
                Modality: 'OT',
                SeriesDescription: description || 'Uploaded image',
                SOPClassUID: SC_SOP_CLASS_UID
            }
        }
    });
    return { orthancInstanceId: created.ID, orthancStudyId: created.ParentStudy };
};

/**
 * Load the target exam's RIS identity and ensure it carries a StudyInstanceUID
 * (generating + persisting one when the exam was never sent to a modality). This
 * is what every uploaded object is stamped with so auto-reconcile links it.
 */
const loadExamIdentity = async (pool, examId, uploadSessionId = null) => {
    const { rows } = await pool.query(
        `SELECT e.exam_id, e.order_number, e.study_instance_uid, e.status,
                p.mrn, p.first_name_enc, p.last_name_enc
         FROM examinations e
         JOIN patients p ON e.patient_id = p.patient_id
         WHERE e.exam_id = $1`,
        [examId]
    );
    if (!rows.length) {
        const err = new Error('Examination not found');
        err.statusCode = 404;
        throw err;
    }
    const exam = rows[0];
    if (!exam.order_number) {
        const err = new Error('Examination has no order number; cannot attach images');
        err.statusCode = 409;
        throw err;
    }

    let studyUid = exam.study_instance_uid;
    if (!studyUid) {
        studyUid = DicomMetaDictionary.uid();
        const { rows: assigned } = await pool.query(
            `UPDATE examinations
             SET study_instance_uid = COALESCE(study_instance_uid, $2)
             WHERE exam_id = $1 RETURNING study_instance_uid`,
            [examId, studyUid]
        );
        studyUid = assigned[0]?.study_instance_uid || studyUid;
    }

    return {
        examId: exam.exam_id,
        patientId: exam.mrn,
        patientName: buildPatientName(safeDecrypt(exam.last_name_enc), safeDecrypt(exam.first_name_enc)),
        accessionNumber: exam.order_number,
        studyInstanceUid: studyUid,
        // A single shared series for all non-DICOM images uploaded to this exam.
        imageSeriesUid: buildSecondaryCaptureSeriesUid(examId, uploadSessionId)
    };
};

/**
 * Upload one or more local files (DICOM and/or JPEG/PNG) into an examination.
 *
 * Each file is stamped with the exam's identity, stored in Orthanc, then
 * reconciled through the same idempotent path a modality C-STORE uses — so the
 * RIS row gets images_available/image_count/status exactly as if the study had
 * been pushed by a scanner. Returns a per-file result list + final image_count.
 */
const uploadFilesToExam = async (pool, {
    examId,
    files,
    uploadSessionId = null,
    expectedTotal = null,
    actorUserId = null,
    remoteIp = null
}) => {
    if (!files || !files.length) {
        const err = new Error('No files provided');
        err.statusCode = 400;
        throw err;
    }

    const userKey = actorUserId ? String(actorUserId) : null;
    const maxUserUploads = boundedInteger(process.env.PACS_USER_UPLOAD_CONCURRENCY, 1, 10);
    let userSlotAcquired = false;

    try {
        if (userKey) {
            const active = activeUserUploads.get(userKey) || 0;
            if (active >= maxUserUploads) {
                const err = new Error('Another PACS upload is already being processed for this user');
                err.statusCode = 429;
                throw err;
            }
            activeUserUploads.set(userKey, active + 1);
            userSlotAcquired = true;
        }

        const identity = await loadExamIdentity(pool, examId, uploadSessionId);
        if (uploadSessionId) {
            const progress = initUploadProgress(
                uploadSessionId,
                Math.max(files.length, Number(expectedTotal || 0)),
                { examId, actorUserId }
            );
            if (progress.examId && progress.examId !== examId) {
                const err = new Error('Upload session belongs to a different examination');
                err.statusCode = 409;
                throw err;
            }
            if (progress.actorUserId && actorUserId && progress.actorUserId !== actorUserId) {
                const err = new Error('Upload session belongs to a different user');
                err.statusCode = 403;
                throw err;
            }
            scheduleUploadProgressCleanup(uploadSessionId);
        }
        const results = [];
        let lastReconcile = null;
        const concurrency = boundedInteger(process.env.PACS_UPLOAD_CONCURRENCY, 2, 3);

        await runWithConcurrency(files, concurrency, async (file) => {
            const filePath = file.path || null;
            const name = file.originalname || 'upload';
            let storedInPacs = false;
            try {
                const buffer = await readUploadBuffer(file);
                if (!buffer) throw new Error('Upload file has no path or buffer');
                markFileActive(uploadSessionId, name);
                let stored;
                let tags;
                let mimetype = file.mimetype;
                const ext = name.split('.').pop()?.toLowerCase();
                if (!IMAGE_MIME[mimetype] && !isDicom(buffer, name, mimetype)) {
                    if (ext === 'jpg' || ext === 'jpeg') mimetype = 'image/jpeg';
                    else if (ext === 'png') mimetype = 'image/png';
                }

            if (isDicom(buffer, name, mimetype)) {
                const stamped = await storeAndStampDicom(filePath || buffer, buffer, identity);
                stored = { orthancInstanceId: stamped.orthancInstanceId, orthancStudyId: stamped.orthancStudyId };
                storedInPacs = true;
                tags = {
                    SeriesInstanceUID: stamped.seriesInstanceUid,
                    SOPInstanceUID: stamped.sopInstanceUid,
                    SOPClassUID: stamped.sopClassUid,
                    Modality: stamped.modality,
                    SeriesNumber: stamped.seriesNumber,
                    InstanceNumber: stamped.instanceNumber,
                    SeriesDescription: stamped.seriesDescription,
                    BodyPartExamined: stamped.bodyPartExamined
                };
            } else if (IMAGE_MIME[mimetype]) {
                stored = await storeImageAsDicom(buffer, mimetype, identity, name);
                storedInPacs = true;
                // create-dicom assigns the SOP/Series UIDs; read them back so the
                // reconcile payload matches what actually landed in Orthanc.
                const t = await orthancGetSimplifiedTags(stored.orthancInstanceId);
                tags = {
                    SeriesInstanceUID: t.SeriesInstanceUID || identity.imageSeriesUid,
                    SOPInstanceUID: t.SOPInstanceUID,
                    SOPClassUID: t.SOPClassUID || SC_SOP_CLASS_UID,
                    Modality: t.Modality || 'OT'
                };
            } else {
                results.push({ file: name, status: 'rejected', reason: `UNSUPPORTED_TYPE: ${file.mimetype} (ext: ${ext})` });
                markFileProcessed(uploadSessionId, {
                    status: 'rejected',
                    file: name,
                    error: `Unsupported file type: ${file.mimetype || ext || 'unknown'}`
                });
                return;
            }

            markFileStored(uploadSessionId, name);

            // Reconcile synchronously so the UI sees the new count immediately.
            // (Orthanc's Lua webhook will also fire; reconcile is idempotent.)
            const reconcile = await reconcileInstance(pool, {
                OrthancInstanceId: stored.orthancInstanceId,
                OrthancStudyId: stored.orthancStudyId,
                PatientID: identity.patientId,
                PatientName: identity.patientName,
                AccessionNumber: identity.accessionNumber,
                StudyInstanceUID: identity.studyInstanceUid,
                SeriesInstanceUID: tags.SeriesInstanceUID,
                SOPInstanceUID: tags.SOPInstanceUID,
                SOPClassUID: tags.SOPClassUID,
                Modality: tags.Modality,
                SeriesNumber: tags.SeriesNumber,
                InstanceNumber: tags.InstanceNumber,
                SeriesDescription: tags.SeriesDescription || 'Uploaded',
                BodyPartExamined: tags.BodyPartExamined
            }, { remoteIp });

            if (reconcile?.status === 'reconciled' && reconcile.exam_id === examId) {
                if (!lastReconcile
                    || Number(reconcile.image_count || 0) >= Number(lastReconcile.image_count || 0)) {
                    lastReconcile = reconcile;
                }
                results.push({
                    file: name,
                    status: 'stored',
                    reconciliation_status: 'reconciled',
                    orthanc_instance_id: stored.orthancInstanceId
                });
                markFileProcessed(uploadSessionId, { status: 'reconciled', file: name });
                return;
            }

            const reason = reconcile?.reason || `RECONCILIATION_${String(reconcile?.status || 'UNKNOWN').toUpperCase()}`;
            results.push({
                file: name,
                status: 'unreconciled',
                reconciliation_status: reconcile?.status || 'unknown',
                orthanc_instance_id: stored.orthancInstanceId,
                reason
            });
            markFileProcessed(uploadSessionId, { status: 'unreconciled', file: name, error: reason });
            } catch (error) {
                logger.error('PACS upload: file failed', { file: name, examId, error: error.message });
                const status = storedInPacs ? 'unreconciled' : 'error';
                results.push({ file: name, status, reason: error.message });
                // Even if a file fails, count it so progress totals match.
                markFileProcessed(uploadSessionId, { status, file: name, error: error.message });
            }
        });

        const reconciled = results.filter((r) => r.status === 'stored').length;
        const unreconciled = results.filter((r) => r.status === 'unreconciled').length;
        const stored = reconciled + unreconciled;
        const failed = results.filter((r) => r.status === 'error').length;
        const rejected = results.filter((r) => r.status === 'rejected').length;
        const sessionProgress = initUploadProgress(
            uploadSessionId,
            Math.max(files.length, Number(expectedTotal || 0)),
            { examId, actorUserId }
        );
        let finalProgress = sessionProgress;
        if (sessionProgress) {
            const sessionFinished = sessionProgress.processed >= sessionProgress.total;
            const hasIssues = sessionProgress.unreconciled > 0
                || sessionProgress.failed > 0
                || sessionProgress.rejected > 0;
            finalProgress = patchUploadProgress(uploadSessionId, {
                status: sessionFinished
                    ? (hasIssues ? (sessionProgress.stored ? 'partial' : 'failed') : 'complete')
                    : 'processing',
                currentFile: null
            });
        }
        logger.info('PACS upload batch complete', {
            examId,
            stored,
            reconciled,
            unreconciled,
            failed,
            rejected,
            total: files.length
        });

        return {
            exam_id: examId,
            study_instance_uid: identity.studyInstanceUid,
            stored,
            reconciled,
            unreconciled,
            failed,
            rejected,
            total: files.length,
            image_count: lastReconcile ? lastReconcile.image_count : undefined,
            upload_progress: finalProgress ? {
                status: finalProgress.status,
                total: finalProgress.total,
                processed: finalProgress.processed,
                stored: finalProgress.stored,
                reconciled: finalProgress.reconciled,
                unreconciled: finalProgress.unreconciled,
                failed: finalProgress.failed,
                rejected: finalProgress.rejected,
                activeFiles: finalProgress.activeFiles,
                startedAt: finalProgress.startedAt,
                updatedAt: finalProgress.updatedAt
            } : null,
            results
        };
    } finally {
        await Promise.all(files.map(async (file) => {
            if (!file?.path) return;
            try { await fsp.unlink(file.path); } catch (error) {
                if (error.code !== 'ENOENT') logger.warn('PACS upload temp cleanup failed', { path: file.path, error: error.message });
            }
        }));
        if (userSlotAcquired) {
            const active = activeUserUploads.get(userKey) || 1;
            if (active <= 1) activeUserUploads.delete(userKey);
            else activeUserUploads.set(userKey, active - 1);
        }
    }
};

const getUploadProgress = (uploadSessionId, { examId = null, actorUserId = null } = {}) => {
    if (!uploadSessionId) {
        return {
            status: 'idle',
            total: 0,
            processed: 0,
            stored: 0,
            reconciled: 0,
            unreconciled: 0,
            failed: 0,
            rejected: 0,
            activeFiles: [],
            currentFile: null,
            lastError: null,
            startedAt: null,
            updatedAt: null
        };
    }
    const value = uploadProgress.get(uploadSessionId);
    if (!value || typeof value === 'number') {
        return {
            status: value ? 'processing' : 'idle',
            total: 0,
            processed: Number(value || 0),
            stored: 0,
            reconciled: 0,
            unreconciled: 0,
            failed: 0,
            rejected: 0,
            activeFiles: [],
            currentFile: null,
            lastError: null,
            startedAt: null,
            updatedAt: null
        };
    }
    if ((examId && value.examId && value.examId !== examId)
        || (actorUserId && value.actorUserId && value.actorUserId !== actorUserId)) {
        return null;
    }
    return value;
};

module.exports = {
    uploadFilesToExam,
    getUploadProgress,
    // exported for unit tests
    isDicom,
    parseDicomIdentity,
    buildDicomModifyRequest,
    buildSecondaryCaptureSeriesUid,
    SC_SOP_CLASS_UID
};
