const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { AppError } = require('../middleware/errorHandler');
const { createStoredZip } = require('../utils/zipStore');
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

const auditPacsStudyExport = async (db, req, study, format, detail = {}) => {
    await writeAudit(db, {
        eventType: 'STUDY_EXPORTED',
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
        requestPath: req.originalUrl || req.url || req.path || null,
        statusCode: 200
    });

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

const streamOrthancStudyPackage = async ({ orthancUrl, auth, orthancStudyId, mode, filename, res }) => {
    const endpoint = mode === 'cd' ? 'media' : 'archive';
    const response = await fetch(`${orthancUrl}/studies/${encodeURIComponent(orthancStudyId)}/${endpoint}`, {
        headers: { Authorization: auth, Accept: 'application/zip, application/octet-stream;q=0.9, */*;q=0.1' }
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
    await pipeline(Readable.fromWeb(response.body), res);
};

const extensionForImage = (contentType = '') => {
    if (/png/i.test(contentType)) return 'png';
    if (/bmp/i.test(contentType)) return 'bmp';
    return 'jpg';
};

const exportRenderedImagesZip = async ({ orthancUrl, auth, orthancStudyId, study, filename, res }) => {
    const studyInfo = await fetchOrthancJson(orthancUrl, auth, `/studies/${encodeURIComponent(orthancStudyId)}`);
    const seriesIds = Array.isArray(studyInfo.Series) ? studyInfo.Series : [];
    const files = [{
        name: 'README.txt',
        data: [
            'VIARA PACS rendered image export',
            `StudyInstanceUID: ${study.study_instance_uid || ''}`,
            `Accession: ${study.order_number || ''}`,
            'Images are rendered previews for review/sharing. Use the DICOM export for diagnostic fidelity.',
            ''
        ].join('\r\n')
    }];
    const manifest = {
        exportedAt: new Date().toISOString(),
        format: 'images',
        studyInstanceUid: study.study_instance_uid || null,
        accessionNumber: study.order_number || null,
        examId: study.exam_id || null,
        series: []
    };

    for (let s = 0; s < seriesIds.length; s += 1) {
        const seriesId = seriesIds[s];
        const seriesInfo = await fetchOrthancJson(orthancUrl, auth, `/series/${encodeURIComponent(seriesId)}`);
        const seriesNumber = seriesInfo.MainDicomTags?.SeriesNumber || String(s + 1).padStart(2, '0');
        const seriesLabel = safeFileStem(seriesInfo.MainDicomTags?.SeriesDescription || `series-${seriesNumber}`, `series-${seriesNumber}`);
        const instances = Array.isArray(seriesInfo.Instances) ? seriesInfo.Instances : [];
        const manifestSeries = {
            seriesId,
            seriesNumber,
            description: seriesInfo.MainDicomTags?.SeriesDescription || null,
            images: []
        };

        for (let i = 0; i < instances.length; i += 1) {
            const instanceId = instances[i];
            const preview = await fetch(`${orthancUrl}/instances/${encodeURIComponent(instanceId)}/preview`, {
                headers: { Authorization: auth, Accept: 'image/jpeg, image/png;q=0.9, image/bmp;q=0.8, */*;q=0.1' }
            });
            if (!preview.ok) continue;
            const data = Buffer.from(await preview.arrayBuffer());
            const contentType = preview.headers.get('content-type') || 'image/jpeg';
            const ext = extensionForImage(contentType);
            const imageName = `${String(i + 1).padStart(4, '0')}.${ext}`;
            const path = `images/series-${String(seriesNumber).padStart(2, '0')}-${seriesLabel}/${imageName}`;
            files.push({ name: path, data });
            manifestSeries.images.push({ instanceId, file: path, contentType });
        }
        manifest.series.push(manifestSeries);
    }

    if (files.length === 1) {
        throw new AppError('No rendered images were available for this study export', 502);
    }

    files.push({
        name: 'manifest.json',
        data: JSON.stringify(manifest, null, 2)
    });

    const zip = createStoredZip(files);
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(zip.length));
    res.setHeader('X-VIARA-PACS-Export-Format', 'images');
    res.end(zip);
    return { imageCount: files.length - 2, seriesCount: manifest.series.length };
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
