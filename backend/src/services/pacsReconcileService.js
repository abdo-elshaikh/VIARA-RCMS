const logger = require('../config/logger');
const { getOrthancUrl, getOrthancAuthHeader } = require('./pacsDicomWebService');
const AuditService = require('./auditService');
const {
    AUDIT_ACTOR_TYPE,
    AUDIT_CATEGORY,
    AUDIT_EVENT_CODES,
    AUDIT_OUTCOME,
    AUDIT_SEVERITY
} = require('./auditTaxonomy');

// Reconciliation reasons written to pacs_quarantine_studies.quarantine_reason
// and pacs_audit.detail so operators know why a study did not auto-link.
const QUARANTINE_REASONS = {
    NO_ACCESSION: 'ACCESSION_NUMBER_MISSING',
    NO_STUDY_UID: 'STUDY_INSTANCE_UID_MISSING',
    ACCESSION_NOT_FOUND: 'ACCESSION_NUMBER_NOT_FOUND',
    PATIENT_ID_MISMATCH: 'PATIENT_ID_MISMATCH',
    STUDY_UID_MISMATCH: 'STUDY_INSTANCE_UID_MISMATCH'
};

// Trim DICOM tag values (Orthanc may send empty strings) to a usable string/null.
const clean = (value) => {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    return str.length ? str : null;
};

const toInt = (value) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
};

const PACS_STRUCTURED_EVENTS = {
    INSTANCE_RECEIVED: AUDIT_EVENT_CODES.PACS_INSTANCE_RECEIVED,
    STUDY_IMPORTED: AUDIT_EVENT_CODES.PACS_STUDY_IMPORTED,
    STUDY_RECONCILED: AUDIT_EVENT_CODES.PACS_STUDY_RECONCILED,
    RECONCILE_ACTION: AUDIT_EVENT_CODES.PACS_STUDY_RECONCILED,
    STUDY_QUARANTINED: AUDIT_EVENT_CODES.PACS_STUDY_QUARANTINED,
    STUDY_EXPORTED: AUDIT_EVENT_CODES.PACS_STUDY_EXPORTED,
    IMAGE_VIEW: AUDIT_EVENT_CODES.PACS_IMAGE_VIEWED,
    PACS_ACCESS_DENIED: AUDIT_EVENT_CODES.PACS_ACCESS_DENIED,
    PACS_CONFIG_UPDATED: AUDIT_EVENT_CODES.PACS_CONFIG_UPDATED,
    PACS_MODALITY_SYNCED: AUDIT_EVENT_CODES.PACS_MODALITY_SYNCED,
    PACS_MODALITY_SYNC_FAILED: AUDIT_EVENT_CODES.PACS_MODALITY_SYNC_FAILED,
    PACS_MODALITY_ECHO_OK: AUDIT_EVENT_CODES.PACS_MODALITY_ECHO_OK,
    PACS_MODALITY_ECHO_FAILED: AUDIT_EVENT_CODES.PACS_MODALITY_ECHO_FAILED,
    PACS_MWL_REGENERATED: AUDIT_EVENT_CODES.PACS_MWL_REGENERATED,
    PACS_TIERING_TRIGGERED: AUDIT_EVENT_CODES.PACS_TIERING_TRIGGERED,
    AI_ANALYSIS_REQUESTED: AUDIT_EVENT_CODES.PACS_AI_ANALYSIS_REQUESTED,
    AI_ANALYSIS_COMPLETED: AUDIT_EVENT_CODES.PACS_AI_ANALYSIS_COMPLETED,
    AI_ANALYSIS_FAILED: AUDIT_EVENT_CODES.PACS_AI_ANALYSIS_FAILED
};

const getStructuredOutcome = (eventType, statusCode) => {
    if (Number(statusCode) === 401 || Number(statusCode) === 403 || eventType === 'PACS_ACCESS_DENIED') {
        return AUDIT_OUTCOME.DENIED;
    }
    if (String(eventType).includes('FAILED') || Number(statusCode) >= 400) {
        return AUDIT_OUTCOME.FAILURE;
    }
    return AUDIT_OUTCOME.SUCCESS;
};

const getStructuredSeverity = (eventType, outcome) => {
    if (outcome === AUDIT_OUTCOME.DENIED) return AUDIT_SEVERITY.WARNING;
    if (outcome === AUDIT_OUTCOME.FAILURE) return AUDIT_SEVERITY.WARNING;
    if (['STUDY_EXPORTED', 'PACS_TIERING_TRIGGERED', 'PACS_CONFIG_UPDATED'].includes(eventType)) {
        return AUDIT_SEVERITY.NOTICE;
    }
    return AUDIT_SEVERITY.INFO;
};

const getStructuredCategory = (eventType) => {
    if (/CONFIG|MODALITY|MWL|TIERING/.test(String(eventType))) return AUDIT_CATEGORY.CONFIG;
    return AUDIT_CATEGORY.PHI_ACCESS;
};

const mirrorStructuredAudit = async (db, {
    eventType,
    actorUserId = null,
    actorRole = null,
    accessionNumber = null,
    studyInstanceUid = null,
    remoteIp = null,
    detail = {},
    httpMethod = null,
    requestPath = null,
    statusCode = null
}) => {
    const eventCode = PACS_STRUCTURED_EVENTS[eventType] || `PACS.${String(eventType || 'UNKNOWN')}`;
    const outcome = getStructuredOutcome(eventType, statusCode);
    const severity = getStructuredSeverity(eventType, outcome);

    try {
        await AuditService.logAction(db, {
            actor: {
                type: actorUserId ? AUDIT_ACTOR_TYPE.USER : AUDIT_ACTOR_TYPE.INTEGRATION,
                userId: actorUserId,
                role: actorRole
            },
            event: {
                code: eventCode,
                category: getStructuredCategory(eventType),
                severity
            },
            target: {
                type: 'pacs',
                label: accessionNumber || studyInstanceUid || eventType
            },
            related: {
                examId: detail?.exam_id || null
            },
            context: {
                ipAddress: remoteIp,
                method: httpMethod,
                path: requestPath,
                sourceSystem: 'pacs'
            },
            details: {
                eventType,
                accessionNumber,
                studyInstanceUid,
                ...detail
            },
            result: {
                outcome,
                statusCode: statusCode || (outcome === AUDIT_OUTCOME.SUCCESS ? 200 : 403)
            },
            risk: {
                score: outcome === AUDIT_OUTCOME.DENIED ? 70 : undefined,
                reason: outcome === AUDIT_OUTCOME.DENIED ? 'PACS access was denied.' : null
            },
            metadata: {
                pacsAuditMirror: true
            }
        });
    } catch (error) {
        logger.error('PACS structured audit mirror failed', { eventType, error: error.message });
    }
};

/**
 * Write an ATNA-style audit row. Best-effort: audit failures must never abort a
 * reconcile transaction, so callers pass the transaction client but we swallow
 * errors here and log them.
 */
const writeAudit = async (client, {
    eventType,
    actorUserId = null,
    actorRole = null,
    accessionNumber = null,
    studyInstanceUid = null,
    remoteIp = null,
    detail = {},
    httpMethod = null,
    requestPath = null,
    statusCode = null
}) => {
    try {
        await client.query(
            `INSERT INTO pacs_audit (event_type, actor_user_id, accession_number, study_instance_uid, remote_ip, detail)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
            [eventType, actorUserId, accessionNumber, studyInstanceUid, remoteIp, JSON.stringify(detail)]
        );
    } catch (error) {
        logger.error('pacs_audit insert failed', { eventType, error: error.message });
    }
    await mirrorStructuredAudit(client, {
        eventType,
        actorUserId,
        actorRole,
        accessionNumber,
        studyInstanceUid,
        remoteIp,
        detail,
        httpMethod,
        requestPath,
        statusCode
    });
};

/**
 * Find the scheduled examination a received instance belongs to.
 * Primary key is AccessionNumber === examinations.order_number (what the MWL
 * feed populates). StudyInstanceUID is a secondary match for studies created
 * outside the worklist. Returns the examinations row or null.
 */
const findMatchingExam = async (client, { accessionNumber, studyInstanceUid, patientId }) => {
    if (accessionNumber) {
        const byAccession = await client.query(
            `SELECT e.exam_id, e.patient_id, e.study_instance_uid, e.status, p.mrn
             FROM examinations e
             JOIN patients p ON p.patient_id = e.patient_id
             WHERE e.order_number = $1
             LIMIT 1`,
            [accessionNumber]
        );
        if (byAccession.rows.length) return { ...byAccession.rows[0], match_type: 'accession' };

        // Normalized Accession matching (ignoring hyphens, spaces, symbols)
        const normalized = String(accessionNumber).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (normalized.length >= 3) {
            const byNormalized = await client.query(
                `SELECT e.exam_id, e.patient_id, e.study_instance_uid, e.status, p.mrn
                 FROM examinations e
                 JOIN patients p ON p.patient_id = e.patient_id
                 WHERE UPPER(REGEXP_REPLACE(e.order_number, '[^a-zA-Z0-9]', '', 'g')) = $1
                 LIMIT 1`,
                [normalized]
            );
            if (byNormalized.rows.length) return { ...byNormalized.rows[0], match_type: 'accession_normalized' };
        }
    }

    if (studyInstanceUid) {
        const byStudy = await client.query(
            `SELECT e.exam_id, e.patient_id, e.study_instance_uid, e.status, p.mrn
             FROM examinations e
             JOIN patients p ON p.patient_id = e.patient_id
             WHERE e.study_instance_uid = $1
             LIMIT 1`,
            [studyInstanceUid]
        );
        if (byStudy.rows.length) return { ...byStudy.rows[0], match_type: 'study' };
    }

    // Patient MRN + Active Scheduled Exam fallback
    const targetMrn = clean(patientId);
    if (targetMrn) {
        const byMrn = await client.query(
            `SELECT e.exam_id, e.patient_id, e.study_instance_uid, e.status, p.mrn
             FROM examinations e
             JOIN patients p ON p.patient_id = e.patient_id
             WHERE p.mrn = $1
               AND e.status::text IN ('Scheduled', 'Checked-in', 'Scanning')
               AND e.study_instance_uid IS NULL
             ORDER BY COALESCE(e.arrived_at, e.created_at) DESC
             LIMIT 1`,
            [targetMrn]
        );
        if (byMrn.rows.length) return { ...byMrn.rows[0], match_type: 'patient_mrn' };
    }

    return null;
};

const fetchOrthancJson = async (path) => {
    const baseUrl = await getOrthancUrl();
    const auth = await getOrthancAuthHeader();
    const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: auth } });
    if (!res.ok) {
        throw new Error(`Orthanc ${path} -> ${res.status}`);
    }
    return res.json();
};

const hydrateQuarantineImagingFromOrthanc = async (client, q) => {
    if (!q.orthanc_study_id) return 0;

    try {
        const study = await fetchOrthancJson(`/studies/${encodeURIComponent(q.orthanc_study_id)}`);
        const seriesIds = Array.isArray(study.Series) ? study.Series : [];
        let indexed = 0;

        for (const seriesId of seriesIds) {
            const series = await fetchOrthancJson(`/series/${encodeURIComponent(seriesId)}`);
            const instanceIds = Array.isArray(series.Instances) ? series.Instances : [];

            for (const instanceId of instanceIds) {
                const tags = await fetchOrthancJson(`/instances/${encodeURIComponent(instanceId)}/tags?simplify`);
                await upsertImaging(client, {
                    OrthancInstanceId: instanceId,
                    OrthancStudyId: q.orthanc_study_id,
                    PatientID: tags.PatientID || q.raw_patient_id,
                    PatientName: tags.PatientName || q.raw_patient_name,
                    AccessionNumber: tags.AccessionNumber || q.raw_accession_number,
                    StudyInstanceUID: tags.StudyInstanceUID || q.study_instance_uid,
                    SeriesInstanceUID: tags.SeriesInstanceUID,
                    SOPInstanceUID: tags.SOPInstanceUID,
                    SOPClassUID: tags.SOPClassUID,
                    Modality: tags.Modality || q.modality,
                    SeriesNumber: tags.SeriesNumber,
                    InstanceNumber: tags.InstanceNumber,
                    SeriesDescription: tags.SeriesDescription,
                    BodyPartExamined: tags.BodyPartExamined
                }, q.study_instance_uid);
                indexed += 1;
            }
        }

        return indexed;
    } catch (error) {
        logger.error('Quarantine Orthanc metadata hydration failed', {
            quarantine_id: q.quarantine_id,
            orthanc_study_id: q.orthanc_study_id,
            error: error.message
        });
        return 0;
    }
};

/**
 * Upsert the series and instance rows for a received DICOM object. Idempotent:
 * re-storing the same SOP Instance updates in place (ON CONFLICT), so replays
 * from the modality or Orthanc never inflate counts.
 */
const upsertImaging = async (client, payload, studyInstanceUid) => {
    const seriesUid = clean(payload.SeriesInstanceUID);
    const sopUid = clean(payload.SOPInstanceUID);

    if (seriesUid) {
        await client.query(
            `INSERT INTO pacs_series (series_instance_uid, study_instance_uid, series_number, modality, series_description, body_part_examined)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (series_instance_uid) DO UPDATE
             SET modality = COALESCE(EXCLUDED.modality, pacs_series.modality),
                 series_description = COALESCE(EXCLUDED.series_description, pacs_series.series_description),
                 body_part_examined = COALESCE(EXCLUDED.body_part_examined, pacs_series.body_part_examined)`,
            [
                seriesUid,
                studyInstanceUid,
                toInt(payload.SeriesNumber),
                clean(payload.Modality),
                clean(payload.SeriesDescription),
                clean(payload.BodyPartExamined)
            ]
        );
    }

    if (sopUid && seriesUid) {
        await client.query(
            `INSERT INTO pacs_instances (sop_instance_uid, series_instance_uid, instance_number, orthanc_id, sop_class_uid)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (sop_instance_uid) DO UPDATE
             SET orthanc_id = COALESCE(EXCLUDED.orthanc_id, pacs_instances.orthanc_id),
                 instance_number = COALESCE(EXCLUDED.instance_number, pacs_instances.instance_number)`,
            [
                sopUid,
                seriesUid,
                toInt(payload.InstanceNumber),
                clean(payload.OrthancInstanceId),
                clean(payload.SOPClassUID)
            ]
        );
    }
};

/**
 * Insert (or refresh) a quarantine row for a study we could not reconcile.
 * Idempotent on study_instance_uid so repeated instances of the same orphan
 * study collapse into one Pending quarantine entry.
 */
const quarantineStudy = async (client, payload, reason) => {
    const studyUid = clean(payload.StudyInstanceUID);
    if (!studyUid) return; // nothing stable to key on

    await client.query(
        `INSERT INTO pacs_quarantine_studies
            (study_instance_uid, orthanc_study_id, raw_patient_id, raw_patient_name, raw_accession_number, modality, quarantine_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (study_instance_uid) DO UPDATE
         SET raw_patient_id = COALESCE(EXCLUDED.raw_patient_id, pacs_quarantine_studies.raw_patient_id),
             raw_accession_number = COALESCE(EXCLUDED.raw_accession_number, pacs_quarantine_studies.raw_accession_number),
             modality = COALESCE(EXCLUDED.modality, pacs_quarantine_studies.modality),
             quarantine_reason = EXCLUDED.quarantine_reason
         WHERE pacs_quarantine_studies.status = 'Pending'`,
        [
            studyUid,
            clean(payload.OrthancStudyId),
            clean(payload.PatientID),
            clean(payload.PatientName),
            clean(payload.AccessionNumber),
            clean(payload.Modality),
            reason
        ]
    );
};

/**
 * Main entry: reconcile one stored-instance webhook payload against the RIS.
 *
 * This is half of the "swap-later contract": a future native DIMSE engine calls
 * this same function with the same payload shape, so all Orthanc specifics stay
 * out of it. Runs in a single transaction; returns a small result object.
 */
const reconcileInstance = async (pool, payload, { remoteIp = null } = {}) => {
    const accessionNumber = clean(payload.AccessionNumber);
    const studyInstanceUid = clean(payload.StudyInstanceUID);
    const patientId = clean(payload.PatientID);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // No accession at all — can't link to an order. Quarantine and stop.
        if (!accessionNumber && !studyInstanceUid) {
            await client.query('COMMIT');
            logger.warn('Reconcile: instance had no AccessionNumber or StudyInstanceUID; ignored');
            return { status: 'ignored', reason: QUARANTINE_REASONS.NO_ACCESSION };
        }

        const exam = await findMatchingExam(client, { accessionNumber, studyInstanceUid, patientId });

        if (!exam) {
            const reason = accessionNumber
                ? QUARANTINE_REASONS.ACCESSION_NOT_FOUND
                : QUARANTINE_REASONS.NO_ACCESSION;
            await quarantineStudy(client, payload, reason);
            await writeAudit(client, {
                eventType: 'STUDY_QUARANTINED',
                accessionNumber,
                studyInstanceUid,
                remoteIp,
                detail: { reason, patient_id: clean(payload.PatientID) }
            });
            await client.query('COMMIT');
            logger.info('Reconcile: study quarantined', { accessionNumber, studyInstanceUid, reason });
            return { status: 'quarantined', reason };
        }

        if (patientId && exam.mrn && patientId !== exam.mrn) {
            const reason = QUARANTINE_REASONS.PATIENT_ID_MISMATCH;
            await quarantineStudy(client, payload, reason);
            await writeAudit(client, {
                eventType: 'STUDY_QUARANTINED',
                accessionNumber,
                studyInstanceUid,
                remoteIp,
                detail: { reason, patient_id: patientId, expected_patient_id: exam.mrn, exam_id: exam.exam_id }
            });
            await client.query('COMMIT');
            logger.warn('Reconcile: patient ID mismatch; study quarantined', {
                accessionNumber,
                studyInstanceUid,
                patientId,
                expected: exam.mrn
            });
            return { status: 'quarantined', reason };
        }

        if (exam.study_instance_uid && studyInstanceUid && exam.study_instance_uid !== studyInstanceUid) {
            const reason = QUARANTINE_REASONS.STUDY_UID_MISMATCH;
            await quarantineStudy(client, payload, reason);
            await writeAudit(client, {
                eventType: 'STUDY_QUARANTINED',
                accessionNumber,
                studyInstanceUid,
                remoteIp,
                detail: { reason, exam_id: exam.exam_id, expected_study_instance_uid: exam.study_instance_uid }
            });
            await client.query('COMMIT');
            logger.warn('Reconcile: study UID mismatch; study quarantined', {
                exam_id: exam.exam_id,
                accessionNumber,
                studyInstanceUid,
                expected: exam.study_instance_uid
            });
            return { status: 'quarantined', reason };
        }

        // Bind the study UID to the exam if the exam did not carry one yet (e.g.
        // the modality generated the Study UID rather than echoing ours).
        const effectiveStudyUid = exam.study_instance_uid || studyInstanceUid;

        if (!effectiveStudyUid) {
            const reason = QUARANTINE_REASONS.NO_STUDY_UID;
            await quarantineStudy(client, payload, reason);
            await writeAudit(client, {
                eventType: 'STUDY_QUARANTINED',
                accessionNumber,
                studyInstanceUid,
                remoteIp,
                detail: { reason, exam_id: exam.exam_id }
            });
            await client.query('COMMIT');
            logger.warn('Reconcile: accession matched but study UID was missing; study quarantined', { accessionNumber });
            return { status: 'quarantined', reason };
        }

        await upsertImaging(client, payload, effectiveStudyUid);

        // Recompute image_count from the source of truth so it stays correct
        // under replays and out-of-order delivery.
        const { rows: countRows } = await client.query(
            `SELECT COUNT(*)::int AS n
             FROM pacs_instances pi
             JOIN pacs_series ps ON ps.series_instance_uid = pi.series_instance_uid
             WHERE ps.study_instance_uid = $1`,
            [effectiveStudyUid]
        );
        const imageCount = countRows[0] ? countRows[0].n : 0;

        // Advance the RIS workflow. First image flips the exam into 'Scanning'
        // (the real exam_status enum value) and marks images available. We never
        // regress a later stage (Reporting/Finalized) back to Scanning.
        await client.query(
            `UPDATE examinations
             SET study_instance_uid = COALESCE(study_instance_uid, $2),
                 orthanc_study_id = COALESCE($3, orthanc_study_id),
                 images_available = TRUE,
                 image_count = GREATEST(COALESCE(image_count, 0), $4),
                 first_image_received_at = COALESCE(first_image_received_at, CURRENT_TIMESTAMP),
                 status = CASE WHEN status IN ('Scheduled', 'Checked-in') THEN 'Scanning'::exam_status ELSE status END
             WHERE exam_id = $1`,
            [exam.exam_id, effectiveStudyUid, clean(payload.OrthancStudyId), imageCount]
        );

        await writeAudit(client, {
            eventType: 'INSTANCE_RECEIVED',
            accessionNumber,
            studyInstanceUid: effectiveStudyUid,
            remoteIp,
            detail: {
                exam_id: exam.exam_id,
                sop_instance_uid: clean(payload.SOPInstanceUID),
                series_instance_uid: clean(payload.SeriesInstanceUID),
                modality: clean(payload.Modality),
                image_count: imageCount
            }
        });

        await client.query('COMMIT');
        logger.info('Reconcile: instance linked to exam', {
            exam_id: exam.exam_id,
            accessionNumber,
            image_count: imageCount
        });
        return { status: 'reconciled', exam_id: exam.exam_id, image_count: imageCount };
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Reconcile transaction failed', { error: error.message, stack: error.stack });
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Manually reconcile a quarantined study to a chosen examination (admin action).
 *
 * Links the study's series/instances (already in Orthanc) to the target exam,
 * binds the exam's study_instance_uid, advances the RIS workflow, marks the
 * quarantine row Reconciled, and audits the operator action. Header rewrites in
 * Orthanc (aligning AccessionNumber/PatientID) are a later hardening step —
 * this keeps the RIS side authoritative immediately.
 *
 * Returns { status, exam_id }. Throws if the quarantine row or exam is missing.
 */
const reconcileQuarantine = async (pool, { quarantineId, examId, actorUserId = null, remoteIp = null }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: qRows } = await client.query(
            `SELECT quarantine_id, study_instance_uid, orthanc_study_id,
                    raw_patient_id, raw_patient_name, raw_accession_number, modality, status
             FROM pacs_quarantine_studies
             WHERE quarantine_id = $1
             FOR UPDATE`,
            [quarantineId]
        );
        if (!qRows.length) {
            await client.query('ROLLBACK');
            const err = new Error('Quarantine study not found');
            err.statusCode = 404;
            throw err;
        }
        const q = qRows[0];
        if (q.status !== 'Pending') {
            await client.query('ROLLBACK');
            const err = new Error(`Quarantine study already ${q.status}`);
            err.statusCode = 409;
            throw err;
        }

        const { rows: eRows } = await client.query(
            `SELECT exam_id, study_instance_uid, status FROM examinations WHERE exam_id = $1 FOR UPDATE`,
            [examId]
        );
        if (!eRows.length) {
            await client.query('ROLLBACK');
            const err = new Error('Target examination not found');
            err.statusCode = 404;
            throw err;
        }
        const exam = eRows[0];

        // If the exam already has a *different* study bound, refuse rather than
        // silently orphan its existing images.
        if (exam.study_instance_uid && exam.study_instance_uid !== q.study_instance_uid) {
            await client.query('ROLLBACK');
            const err = new Error('Target examination is already linked to a different study');
            err.statusCode = 409;
            throw err;
        }

        await client.query(
            `UPDATE examinations
             SET study_instance_uid = $2,
                 orthanc_study_id = COALESCE($3, orthanc_study_id)
             WHERE exam_id = $1`,
            [exam.exam_id, q.study_instance_uid, q.orthanc_study_id]
        );

        const hydratedCount = await hydrateQuarantineImagingFromOrthanc(client, q);

        // Re-parent any series that came in under this study UID to the exam.
        await client.query(
            `UPDATE examinations
             SET images_available = TRUE,
                 image_count = (
                     SELECT COUNT(*)::int FROM pacs_instances pi
                     JOIN pacs_series ps ON ps.series_instance_uid = pi.series_instance_uid
                     WHERE ps.study_instance_uid = $2
                 ),
                 first_image_received_at = COALESCE(first_image_received_at, CURRENT_TIMESTAMP),
                 status = CASE WHEN status IN ('Scheduled', 'Checked-in') THEN 'Scanning'::exam_status ELSE status END
             WHERE exam_id = $1`,
            [exam.exam_id, q.study_instance_uid]
        );

        await client.query(
            `UPDATE pacs_quarantine_studies
             SET status = 'Reconciled', resolved_by = $2, resolved_at = CURRENT_TIMESTAMP, resolved_exam_id = $3
             WHERE quarantine_id = $1`,
            [quarantineId, actorUserId, exam.exam_id]
        );

        await writeAudit(client, {
            eventType: 'RECONCILE_ACTION',
            actorUserId,
            accessionNumber: q.raw_accession_number,
            studyInstanceUid: q.study_instance_uid,
            remoteIp,
            detail: { quarantine_id: quarantineId, exam_id: exam.exam_id, action: 'reconcile', hydrated_instances: hydratedCount }
        });

        await client.query('COMMIT');
        logger.info('Quarantine reconciled', { quarantineId, exam_id: exam.exam_id });
        return { status: 'reconciled', exam_id: exam.exam_id };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (!error.statusCode) {
            logger.error('reconcileQuarantine failed', { error: error.message, stack: error.stack });
        }
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Discard a quarantined study (admin decided it does not belong to any order).
 * Leaves the pixel data in Orthanc but removes it from the RIS work queue.
 */
const discardQuarantine = async (pool, { quarantineId, actorUserId = null, remoteIp = null }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `UPDATE pacs_quarantine_studies
             SET status = 'Discarded', resolved_by = $2, resolved_at = CURRENT_TIMESTAMP
             WHERE quarantine_id = $1 AND status = 'Pending'
             RETURNING study_instance_uid, raw_accession_number`,
            [quarantineId, actorUserId]
        );
        if (!rows.length) {
            await client.query('ROLLBACK');
            const err = new Error('Quarantine study not found or not Pending');
            err.statusCode = 404;
            throw err;
        }
        await writeAudit(client, {
            eventType: 'RECONCILE_ACTION',
            actorUserId,
            accessionNumber: rows[0].raw_accession_number,
            studyInstanceUid: rows[0].study_instance_uid,
            remoteIp,
            detail: { quarantine_id: quarantineId, action: 'discard' }
        });
        await client.query('COMMIT');
        logger.info('Quarantine discarded', { quarantineId });
        return { status: 'discarded' };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    reconcileInstance,
    reconcileQuarantine,
    discardQuarantine,
    writeAudit,
    // exported for unit tests
    findMatchingExam,
    QUARANTINE_REASONS
};
