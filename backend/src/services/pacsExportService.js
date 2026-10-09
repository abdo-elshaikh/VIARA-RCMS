const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { AppError } = require('../middleware/errorHandler');
const { createStoredZipStream } = require('../utils/zipStore');
const { writeAudit } = require('./pacsReconcileService');
const { triggerEventForRole } = require('./notificationJobService');
const { assertStudyAccess, getRemoteIp } = require('./pacsAccessPolicyService');

const safeFileStem = (value, fallback = 'pacs-case') => {
    const stem = String(value || fallback)
        .replace(/[\\/:*?"<>|\r\n]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 96)
        .replace(/^_+|_+$/g, '');
    return stem || fallback;
};

const parseOrthancLookupResult = (data) => {
    if (!Array.isArray(data)) return null;
    for (const item of data) {
        if (typeof item === 'string') return item;
        if (item?.Type === 'Study' && item?.ID) return item.ID;
        if (item?.ID) return item.ID;
    }
    return null;
};

const fetchOrthancJson = async (url, auth, path, options = {}) => {
    const response = await fetch(`${url}${path}`, {
        ...options,
        headers: {
            Authorization: auth,
            Accept: 'application/json',
            ...(options.headers || {})
        }
    });
    if (!response.ok) {
        throw new AppError(`PACS archive lookup failed (${response.status})`, 502);
    }
    return response.json();
};

const lookupOrthancStudyId = async (orthancUrl, auth, studyInstanceUid) => {
    const response = await fetch(`${orthancUrl}/tools/find`, {
        method: 'POST',
        headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify({
            Level: 'Study',
            Query: { StudyInstanceUID: studyInstanceUid },
            Limit: 1
        })
    });

    if (!response.ok) {
        throw new AppError(`PACS archive lookup failed (${response.status})`, 502);
    }
    const id = parseOrthancLookupResult(await response.json());
    if (!id) throw new AppError('Study was not found in the PACS archive', 404);
    return id;
};

const resolveExportStudyContext = async (db, req, studyInstanceUid) => {
    await assertStudyAccess(db, req.user, [studyInstanceUid]);
    const examId = String(req.query?.examId || req.query?.exam_id || '').trim();
    const { rows } = await db.query(
        `SELECT e.exam_id, e.order_number, e.study_instance_uid, e.orthanc_study_id,
                e.image_count, et.name AS exam_type_name, m.name AS modality_name, p.mrn
         FROM examinations e
         LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
         LEFT JOIN modalities m ON m.modality_id = e.modality_id
         JOIN patients p ON p.patient_id = e.patient_id
         WHERE e.study_instance_uid = $1
           AND ($2::text = '' OR e.exam_id::text = $2::text)
         LIMIT 1`,
        [studyInstanceUid, examId]
    );
    return rows[0] || { study_instance_uid: studyInstanceUid };
};

const auditPacsStudyExport = async (db, req, study, format, detail = {}, {
    required = false,
    notify = true
} = {}) => {
    const requestPath = String(req.originalUrl || req.url || req.path || '').split('?')[0]
        .replace(/\/studies\/[0-9.]+(?=\/|$)/g, '/studies/:studyUid') || null;
    const eventType = detail.phase === 'started'
        ? 'PACS_EXPORT_STARTED'
        : detail.phase === 'failed' ? 'PACS_EXPORT_FAILED' : 'STUDY_EXPORTED';
    await writeAudit(db, {
        eventType,
        actorUserId: req.user?.user_id || null,
        actorRole: req.user?.role || null,
        studyInstanceUid: study.study_instance_uid,
        accessionNumber: study.order_number || null,
        remoteIp: getRemoteIp(req),
        detail: {
            format,
            exam_id: study.exam_id || null,
            orthanc_study_id: study.orthanc_study_id || null,
            ...detail
        },
        httpMethod: req.method || null,
        requestPath,
        statusCode: detail.statusCode || (detail.phase === 'failed' ? 500 : 200),
        required
    });

    if (!notify) return;

    triggerEventForRole(db, 'STUDY_EXPORTED', 'Radiologist', {
        priority: 'Warning',
        variables: {
            accession_number: study.order_number || '',
            patient_name: study.patient_name || '',
            exported_by: req.user?.full_name || req.user?.email || 'Unknown'
        }
    }).catch(() => { });

    triggerEventForRole(db, 'STUDY_EXPORTED', 'Technician', {
        priority: 'Warning',
        variables: {
            accession_number: study.order_number || '',
            patient_name: study.patient_name || '',
            exported_by: req.user?.full_name || req.user?.email || 'Unknown'
        }
    }).catch(() => { });

    triggerEventForRole(db, 'STUDY_EXPORTED', 'Admin', {
        priority: 'Warning',
        variables: {
            accession_number: study.order_number || '',
            patient_name: study.patient_name || '',
            exported_by: req.user?.full_name || req.user?.email || 'Unknown'
        }
    }).catch(() => { });
};

const streamOrthancStudyPackage = async ({ orthancUrl, auth, orthancStudyId, mode, filename, res, signal }) => {
    const endpoint = mode === 'cd' ? 'media' : 'archive';
    const response = await fetch(`${orthancUrl}/studies/${encodeURIComponent(orthancStudyId)}/${endpoint}`, {
        signal, headers: { Authorization: auth, Accept: 'application/zip, application/octet-stream;q=0.9, */*;q=0.1' }
    });

    if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new AppError(message || `PACS export failed (${response.status})`, 502);
    }

    res.status(200);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-VIARA-PACS-Export-Format', mode);
    if (response.headers.get('content-length')) {
        res.setHeader('Content-Length', response.headers.get('content-length'));
    }

    if (!response.body) {
        res.end();
        return;
    }
    await pipeline(Readable.fromWeb(response.body), res, { signal });
};

const extensionForImage = (contentType = '') => {
    if (/png/i.test(contentType)) return 'png';
    if (/bmp/i.test(contentType)) return 'bmp';
    return 'jpg';
};

const exportRenderedImagesZip = async ({ orthancUrl, auth, orthancStudyId, study, filename, res, signal }) => {
    const studyInfo = await fetchOrthancJson(orthancUrl, auth, `/studies/${encodeURIComponent(orthancStudyId)}`, { signal });
    const manifest = { exportedAt: new Date().toISOString(), format: 'images', studyInstanceUid: study.study_instance_uid, complete: false, series: [] };
    let imageCount = 0;
    async function* entries() {
        yield { name: 'README.txt', data: 'Rendered previews for sharing, not diagnostic originals. Every frame is exported. A failed frame aborts this archive; use DICOM export for diagnostic fidelity.\r\n' };
        for (const [index, seriesId] of (studyInfo.Series || []).entries()) {
            const series = await fetchOrthancJson(orthancUrl, auth, `/series/${encodeURIComponent(seriesId)}`, { signal });
            const number = index + 1;
            const description = safeFileStem(series.MainDicomTags?.SeriesDescription || 'series');
            const descriptor = { seriesId, images: [] };
            manifest.series.push(descriptor);
            for (const [instanceIndex, instanceId] of (series.Instances || []).entries()) {
                const frames = await fetchOrthancJson(orthancUrl, auth, `/instances/${encodeURIComponent(instanceId)}/frames`, { signal });
                if (!Array.isArray(frames) || !frames.length) throw new AppError('PACS instance has no renderable frames', 502);
                for (const frame of frames) {
                    const preview = await fetch(`${orthancUrl}/instances/${encodeURIComponent(instanceId)}/frames/${frame}/preview`, {
                        signal, headers: { Authorization: auth, Accept: 'image/jpeg, image/png;q=0.9, image/bmp;q=0.8' }
                    });
                    if (!preview.ok) throw new AppError(`Image export failed for frame ${Number(frame) + 1} (${preview.status}); no complete archive was generated`, 502);
                    const contentType = preview.headers.get('content-type') || 'image/jpeg';
                    const name = `images/series-${number}-${description}/${String(instanceIndex + 1).padStart(4, '0')}-frame-${Number(frame) + 1}.${extensionForImage(contentType)}`;
                    const data = Buffer.from(await preview.arrayBuffer());
                    descriptor.images.push({ instanceId, frame: Number(frame) + 1, file: name, contentType });
                    imageCount += 1;
                    yield { name, data };
                }
            }
        }
        if (!imageCount) throw new AppError('No rendered images were available', 502);
        manifest.complete = true;
        yield { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) };
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-VIARA-PACS-Export-Format', 'images');
    await pipeline(Readable.from(createStoredZipStream(entries())), res, { signal });
    return { imageCount, seriesCount: manifest.series.length, complete: true };
};

module.exports = {
    safeFileStem,
    parseOrthancLookupResult,
    fetchOrthancJson,
    lookupOrthancStudyId,
    resolveExportStudyContext,
    auditPacsStudyExport,
    streamOrthancStudyPackage,
    extensionForImage,
    exportRenderedImagesZip
};
