const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const { decrypt } = require('../utils/crypto');
const { writeAudit } = require('./pacsReconcileService');

const safeEqual = (actual, expected) => {
    const a = Buffer.from(actual || '', 'utf8');
    const b = Buffer.from(expected || '', 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const safeDecrypt = (value) => {
    if (!value) return '';
    try {
        if (value.startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(value)) {
            return decrypt(value);
        }
        return value;
    } catch {
        return value;
    }
};

const getRemoteIp = (req) => req.headers?.['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || null;

const parseStudyUidList = (value) => {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(raw
        .map((v) => String(v || '').trim())
        .filter(Boolean))];
};

const hasEffectivePermission = (user, permission) => {
    if (user?.role === 'Developer') return true;
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    if (permissions.includes(permission)) return true;
    return Array.isArray(user?.elevatedPermissions)
        && Number(user?.breakGlassExpiry) > Date.now()
        && user.elevatedPermissions.includes(permission);
};

const hasGlobalPacsAccess = (user) => (
    ['Developer', 'Admin'].includes(user?.role)
    || hasEffectivePermission(user, 'MANAGE_PACS')
);

const hasEmergencyClinicalPacsAccess = (user) => Boolean(
    user?.emergencyAccessId
    && Array.isArray(user?.elevatedPermissions)
    && Number(user?.breakGlassExpiry) > Date.now()
    && user.elevatedPermissions.includes('VIEW_PACS_IMAGES')
);

const hasClinicalPacsAccess = (user) => (
    hasGlobalPacsAccess(user) || hasEmergencyClinicalPacsAccess(user)
);

const RADIOLOGIST_SHARED_WORKLIST_ACCESS = `(
    e.performing_radiologist_id = $3::uuid
    OR (
        e.performing_radiologist_id IS NULL
        AND e.current_station = 'Radiologist'
        AND e.queue_stage = 'Reporting'
        AND e.status IN ('Completed', 'Reporting')
    )
)`;

const isValidStudyUid = (uid) => /^[0-9][0-9.]{2,127}$/.test(uid) && !uid.includes('..') && !uid.endsWith('.');

const decodeDicomUid = (value) => {
    try {
        return decodeURIComponent(value);
    } catch {
        throw new AppError('Invalid DICOM UID', 400);
    }
};

const getRequestedStudyUids = (subPath, query = {}) => {
    const found = [];
    const pathMatch = subPath.match(/\/studies\/([0-9.]+)(?:$|[/?])/);
    if (pathMatch) found.push(pathMatch[1]);

    for (const key of ['StudyInstanceUID', 'StudyInstanceUIDs', 'studyUID', 'studyUIDs', '0020000D']) {
        if (query[key]) found.push(...parseStudyUidList(query[key]));
    }

    return [...new Set(found)];
};

const getPathStudyUids = (subPath) => {
    const found = [];
    for (const match of subPath.matchAll(/\/studies\/([0-9.]+)(?:$|[/?])/g)) {
        found.push(match[1]);
    }
    return [...new Set(found)];
};

const getDicomEntityUids = (subPath, query = {}) => {
    const seriesUids = [];
    const sopUids = [];

    for (const match of subPath.matchAll(/\/series\/([^/]+)/g)) {
        seriesUids.push(decodeDicomUid(match[1]));
    }
    for (const match of subPath.matchAll(/\/instances\/([^/]+)/g)) {
        sopUids.push(decodeDicomUid(match[1]));
    }

    for (const key of ['SeriesInstanceUID', 'SeriesInstanceUIDs', 'seriesUID', 'seriesUIDs', '0020000E']) {
        if (query[key]) seriesUids.push(...parseStudyUidList(query[key]));
    }
    for (const key of ['SOPInstanceUID', 'SOPInstanceUIDs', 'objectUID', 'objectUIDs', '00080018']) {
        if (query[key]) sopUids.push(...parseStudyUidList(query[key]));
    }

    return {
        seriesUids: [...new Set(seriesUids.map((uid) => String(uid || '').trim()).filter(Boolean))],
        sopUids: [...new Set(sopUids.map((uid) => String(uid || '').trim()).filter(Boolean))]
    };
};

const resolveDicomWebStudyScope = async (db, subPath, query = {}) => {
    const requestedStudyUids = getRequestedStudyUids(subPath, query);
    const { seriesUids, sopUids } = getDicomEntityUids(subPath, query);
    const allEntityUids = [...seriesUids, ...sopUids];
    if (allEntityUids.some((uid) => !isValidStudyUid(uid))) {
        throw new AppError('Invalid DICOM UID', 400);
    }

    const resolvedStudyUids = [];
    const resolvedSeriesUids = new Set();
    const resolvedSopUids = new Set();

    if (seriesUids.length) {
        const { rows } = await db.query(
            `SELECT series_instance_uid, study_instance_uid
             FROM pacs_series
             WHERE series_instance_uid = ANY($1::text[])`,
            [seriesUids]
        );
        rows.forEach((row) => {
            resolvedSeriesUids.add(row.series_instance_uid);
            resolvedStudyUids.push(row.study_instance_uid);
        });
    }

    if (sopUids.length) {
        const { rows } = await db.query(
            `SELECT pi.sop_instance_uid, ps.study_instance_uid
             FROM pacs_instances pi
             JOIN pacs_series ps ON ps.series_instance_uid = pi.series_instance_uid
             WHERE pi.sop_instance_uid = ANY($1::text[])`,
            [sopUids]
        );
        rows.forEach((row) => {
            resolvedSopUids.add(row.sop_instance_uid);
            resolvedStudyUids.push(row.study_instance_uid);
        });
    }

    return {
        studyUids: [...new Set([...requestedStudyUids, ...resolvedStudyUids])],
        unresolvedEntityUids: [
            ...seriesUids.filter((uid) => !resolvedSeriesUids.has(uid)),
            ...sopUids.filter((uid) => !resolvedSopUids.has(uid))
        ]
    };
};

const assertStudyAccess = async (db, user, studyUids) => {
    const uids = parseStudyUidList(studyUids);
    if (!uids.length) {
        throw new AppError('A study UID is required for PACS viewer access', 400);
    }
    if (uids.some((uid) => !isValidStudyUid(uid))) {
        throw new AppError('Invalid StudyInstanceUID', 400);
    }

    const { rows } = await db.query(
        `SELECT e.study_instance_uid
         FROM examinations e
         LEFT JOIN appointments a ON a.appointment_id = e.appointment_id
         WHERE e.study_instance_uid = ANY($1::text[])
           AND (
                 $4::boolean
                 OR ($2::text = 'Radiologist' AND ${RADIOLOGIST_SHARED_WORKLIST_ACCESS})
                 OR ($2::text = 'Technician' AND (
                     a.technician_id = $3::uuid
                     OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
                 ))
            )`,
        [uids, user.role, user.user_id, hasClinicalPacsAccess(user)]
    );

    const allowed = new Set(rows.map((row) => row.study_instance_uid));
    const denied = uids.filter((uid) => !allowed.has(uid));
    if (denied.length) {
        throw new AppError('Study not found or not assigned to this user', 403);
    }
    return uids;
};

const assertExamViewerAccess = async (db, user, { examId = null, accessionNumber = null, studyUids = [] } = {}) => {
    const requestedUids = parseStudyUidList(studyUids);
    const normalizedExamId = String(examId || '').trim();
    const normalizedAccession = String(accessionNumber || '').trim();

    if (!normalizedExamId && !normalizedAccession) {
        return null;
    }

    const { rows } = await db.query(
        `SELECT e.exam_id, e.order_number, e.study_instance_uid,
                e.images_available, e.image_count, e.first_image_received_at,
                et.name AS exam_type_name, m.name AS modality_name, p.mrn
         FROM examinations e
         LEFT JOIN appointments a ON a.appointment_id = e.appointment_id
         LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
         LEFT JOIN modalities m ON m.modality_id = e.modality_id
         JOIN patients p ON p.patient_id = e.patient_id
         WHERE (($3::text <> '' AND e.exam_id::text = $3::text)
             OR ($4::text <> '' AND e.order_number = $4::text))
           AND (
                 $5::boolean
                 OR ($1::text = 'Radiologist' AND (
                     e.performing_radiologist_id = $2::uuid
                     OR (
                         e.performing_radiologist_id IS NULL
                         AND e.current_station = 'Radiologist'
                         AND e.queue_stage = 'Reporting'
                         AND e.status IN ('Completed', 'Reporting')
                     )
                 ))
                 OR ($1::text = 'Technician' AND (
                     a.technician_id = $2::uuid
                     OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
                 ))
           )
         LIMIT 1`,
        [user.role, user.user_id, normalizedExamId, normalizedAccession, hasClinicalPacsAccess(user)]
    );

    if (!rows.length) {
        throw new AppError('Examination not found or not assigned to this user', 403);
    }

    const exam = rows[0];
    if (!exam.study_instance_uid) {
        throw new AppError('This examination does not have linked PACS images yet', 404);
    }

    if (requestedUids.length && !requestedUids.includes(exam.study_instance_uid)) {
        throw new AppError('Requested study does not belong to this examination order', 403);
    }

    return exam;
};

const assertExamImagingAccess = async (db, user, examId) => {
    const { rows } = await db.query(
        `SELECT e.exam_id, e.order_number, e.study_instance_uid, e.orthanc_study_id,
                e.images_available, e.image_count, e.priority,
                e.status,
                et.name AS exam_type_name, m.name AS modality_name, m.type AS modality_type, p.mrn
         FROM examinations e
         LEFT JOIN appointments a ON a.appointment_id = e.appointment_id
         LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
         LEFT JOIN modalities m ON m.modality_id = e.modality_id
         JOIN patients p ON p.patient_id = e.patient_id
         WHERE e.exam_id = $1
           AND (
                 $4::boolean
                 OR ($2::text = 'Radiologist' AND ${RADIOLOGIST_SHARED_WORKLIST_ACCESS})
                 OR ($2::text = 'Technician' AND (
                     a.technician_id = $3::uuid
                     OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
                 ))
           )
         LIMIT 1`,
        [examId, user.role, user.user_id, hasClinicalPacsAccess(user)]
    );

    if (!rows.length) {
        throw new AppError('Examination not found or not assigned to this user', 403);
    }
    return rows[0];
};

const assertDicomWebStudyScope = async (db, req, subPath) => {
    const { studyUids: requested, unresolvedEntityUids } = await resolveDicomWebStudyScope(db, subPath, req.query || {});
    const pathStudyUids = getPathStudyUids(subPath);
    const isStudyBrowse = req.method === 'GET' && /^\/dicom-web\/studies\/?$/.test(subPath);
    const isGlobal = hasEmergencyClinicalPacsAccess(req.user);

    if (['pacs_viewer_cookie', 'pacs_viewer_bearer'].includes(req.authType)) {
        const allowed = parseStudyUidList(req.user?.study_instance_uids || []);
        const pathIsScopedToAllowedStudy = pathStudyUids.length > 0
            && pathStudyUids.every((uid) => allowed.includes(uid));
        if (unresolvedEntityUids.length && !pathIsScopedToAllowedStudy) {
            throw new AppError('Requested DICOM object is not indexed for this viewer session', 403);
        }
        if (!requested.length) {
            throw new AppError('Scoped PACS viewer sessions cannot browse all studies', 403);
        }
        const denied = requested.filter((uid) => !allowed.includes(uid));
        if (denied.length) {
            throw new AppError('PACS viewer session is not scoped to this study', 403);
        }
        return;
    }

    if (!isGlobal) {
        if (isStudyBrowse && !requested.length) {
            throw new AppError('Study-scoped PACS access is required', 403);
        }
        if (!requested.length && unresolvedEntityUids.length) {
            throw new AppError('Requested DICOM object is not indexed for this user', 403);
        }
        if (!requested.length) {
            throw new AppError('Study-scoped PACS access is required', 403);
        }
        if (requested.length) {
            await assertStudyAccess(db, req.user, requested);
        }
    }
};

const shouldReturnEmptyScopedStudyBrowse = (req, subPath) => (
    ['pacs_viewer_cookie', 'pacs_viewer_bearer'].includes(req.authType)
    && req.method === 'GET'
    && /^\/dicom-web\/studies\/?$/.test(subPath)
    && !getRequestedStudyUids(subPath, req.query || {}).length
);

const assertPacsAiJobAccess = async (db, user, jobId) => {
    const { rows } = await db.query(
        `SELECT job_id, exam_id
         FROM pacs_ai_analysis_jobs
         WHERE job_id = $1
         LIMIT 1`,
        [jobId]
    );
    if (!rows.length) {
        throw new AppError('Job not found', 404);
    }
    await assertExamImagingAccess(db, user, rows[0].exam_id);
    return rows[0];
};

const auditPacsAccessDenied = async (db, req, error, detail = {}) => {
    const statusCode = Number(error?.statusCode || error?.status || 0);
    if (![401, 403].includes(statusCode)) return;
    const requestPath = String(req.originalUrl || req.url || req.path || '').split('?')[0]
        .replace(/\/studies\/[0-9.]+(?=\/|$)/g, '/studies/:studyUid') || null;
    const { requested_study_uids: requestedStudyUids, ...safeDetail } = detail;
    await writeAudit(db, {
        eventType: 'PACS_ACCESS_DENIED',
        actorUserId: req.user?.user_id || null,
        actorRole: req.user?.role || null,
        remoteIp: getRemoteIp(req),
        detail: {
            path: requestPath,
            method: req.method || null,
            auth_type: req.authType || null,
            reason: error.message,
            ...safeDetail,
            ...(Array.isArray(requestedStudyUids)
                ? { requested_study_count: requestedStudyUids.length }
                : {})
        },
        httpMethod: req.method || null,
        requestPath,
        statusCode
    });
};

module.exports = {
    safeEqual,
    safeDecrypt,
    getRemoteIp,
    parseStudyUidList,
    hasEffectivePermission,
    hasGlobalPacsAccess,
    hasEmergencyClinicalPacsAccess,
    hasClinicalPacsAccess,
    isValidStudyUid,
    decodeDicomUid,
    getRequestedStudyUids,
    getPathStudyUids,
    getDicomEntityUids,
    resolveDicomWebStudyScope,
    assertStudyAccess,
    assertExamViewerAccess,
    assertExamImagingAccess,
    assertDicomWebStudyScope,
    shouldReturnEmptyScopedStudyBrowse,
    assertPacsAiJobAccess,
    auditPacsAccessDenied
};
