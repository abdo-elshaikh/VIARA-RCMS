const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { decrypt, encrypt, hash } = require('../utils/crypto');
const { logAction } = require('../services/auditService');
const { AUDIT_CATEGORY, AUDIT_SEVERITY } = require('../services/auditTaxonomy');
const {
    addConsentSchema,
    createPrivacyRequestSchema,
    resolvePrivacyRequestSchema,
    revokeConsentSchema
} = require('../schemas/privacySchema');

const EXPORT_DIR = path.resolve(process.env.PRIVACY_EXPORT_DIR || path.join(__dirname, '../../private/privacy_exports'));
const EXPORT_TTL_HOURS = Math.max(Number.parseInt(process.env.PRIVACY_EXPORT_TTL_HOURS, 10) || 24, 1);

const exportFieldMap = {
    first_name_enc: 'first_name',
    last_name_enc: 'last_name',
    date_of_birth_enc: 'date_of_birth',
    phone_enc: 'phone',
    address_enc: 'address',
    national_id_enc: 'national_id',
    passport_number_enc: 'passport_number',
    emergency_contact_name_enc: 'emergency_contact_name',
    emergency_contact_phone_enc: 'emergency_contact_phone',
    emergency_contact_address_enc: 'emergency_contact_address',
    allergies_enc: 'allergies',
    chronic_diseases_enc: 'chronic_diseases',
    prior_surgeries_enc: 'prior_surgeries',
    implants_devices_enc: 'implants_devices',
    renal_function_notes_enc: 'renal_function_notes'
};

const CONSENT_FLAG_BY_TYPE = {
    Marketing: 'consent_marketing',
    DataSharing: 'consent_data_sharing'
};

const OPEN_REQUEST_STATUSES = new Set(['Pending', 'InReview', 'Approved']);
const COMPLETED_STATUSES = new Set(['Completed', 'Resolved']);

const getUserId = (req) => req.user?.user_id || req.user?.userId || null;
const getPatientUserId = (user) => user?.patient_id || user?.userId || user?.user_id || null;
const isPatientSelf = (req, patientId) => req.user?.role === 'Patient' && String(getPatientUserId(req.user)) === String(patientId);

const safeDecrypt = (value) => {
    try {
        return value ? decrypt(value) : null;
    } catch {
        return null;
    }
};

const buildPatientExport = (patient = {}) => {
    const safe = Object.fromEntries(Object.entries(patient).filter(([key]) => (
        !key.endsWith('_enc')
        && !key.endsWith('_hash')
        && !['password_hash', 'portal_password_hash', 'iv_vector'].includes(key)
    )));

    Object.entries(exportFieldMap).forEach(([encryptedKey, outputKey]) => {
        safe[outputKey] = safeDecrypt(patient[encryptedKey]);
    });
    return safe;
};

const logPrivacyAction = async (db, req, action, {
    patientId = null,
    requestId = null,
    details = {},
    severity = AUDIT_SEVERITY.NOTICE
} = {}) => logAction(db, {
    userId: getUserId(req),
    action,
    resourceId: requestId || patientId,
    resourceTable: requestId ? 'data_privacy_requests' : 'patients',
    ipAddress: req.ip,
    details: { patientId, requestId, ...details },
    category: AUDIT_CATEGORY.PRIVACY,
    severity,
    required: severity >= AUDIT_SEVERITY.CRITICAL
});

const userHasPermission = async (db, user, permission) => {
    if (user?.role === 'Developer') return true;
    const result = await db.query(`
        SELECT 1
        FROM role_permissions rp
        JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE rp.role_name = $1 AND p.name = $2
        LIMIT 1
    `, [user?.role, permission]);
    return result.rows.length > 0;
};

const assertPermission = async (db, req, permission) => {
    if (await userHasPermission(db, req.user, permission)) return;
    throw new AppError(`Access Denied: Requires ${permission} permission`, 403);
};

const syncConsentFlag = async (db, patientId, type, active) => {
    const column = CONSENT_FLAG_BY_TYPE[type];
    if (!column) return;
    await db.query(`UPDATE patients SET ${column} = $2 WHERE patient_id = $1`, [patientId, active]);
};

const collectPatientData = async (db, patientId) => {
    const patientRes = await db.query('SELECT * FROM patients WHERE patient_id = $1', [patientId]);
    if (patientRes.rows.length === 0) throw new AppError('Patient not found', 404);

    const [
        appointments,
        examinations,
        invoices,
        documents,
        consents,
        deliveries
    ] = await Promise.all([
        db.query('SELECT * FROM appointments WHERE patient_id = $1 ORDER BY start_time DESC NULLS LAST', [patientId]),
        db.query('SELECT * FROM examinations WHERE patient_id = $1 OR appointment_id IN (SELECT appointment_id FROM appointments WHERE patient_id = $1)', [patientId]),
        db.query('SELECT * FROM invoices WHERE patient_id = $1 ORDER BY created_at DESC NULLS LAST', [patientId]),
        db.query('SELECT document_id, appointment_id, exam_id, type, file_name, mime_type, uploaded_at, notes FROM documents WHERE patient_id = $1 ORDER BY uploaded_at DESC NULLS LAST', [patientId]).catch(() => ({ rows: [] })),
        db.query('SELECT consent_id, type, status, signed_at, revoked_at, source, document_url FROM patient_consents WHERE patient_id = $1 ORDER BY signed_at DESC', [patientId]),
        db.query('SELECT delivery_id, exam_id, delivery_method, delivery_status, delivered_at, acknowledged_at FROM result_deliveries WHERE patient_id = $1 ORDER BY delivered_at DESC NULLS LAST', [patientId]).catch(() => ({ rows: [] }))
    ]);

    return {
        generatedAt: new Date().toISOString(),
        patientId,
        demographics: buildPatientExport(patientRes.rows[0]),
        appointments: appointments.rows,
        examinations: examinations.rows,
        invoices: invoices.rows,
        documents: documents.rows,
        consents: consents.rows,
        resultDeliveries: deliveries.rows
    };
};

const createExportArtifact = async (db, req, request, exportData) => {
    await fs.mkdir(EXPORT_DIR, { recursive: true });
    const exportId = crypto.randomUUID();
    const filename = `privacy-export-${exportId}.json.enc`;
    const filePath = path.join(EXPORT_DIR, filename);
    const encrypted = encrypt(JSON.stringify(exportData));
    const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
    await fs.writeFile(filePath, encrypted, { encoding: 'utf8', flag: 'wx' });

    const expiresAt = new Date(Date.now() + EXPORT_TTL_HOURS * 60 * 60 * 1000);
    const result = await db.query(`
        INSERT INTO privacy_export_artifacts
            (export_id, request_id, patient_id, file_path, checksum, created_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING export_id, request_id, patient_id, checksum, created_at, expires_at, download_count
    `, [exportId, request.request_id, request.patient_id, filePath, checksum, getUserId(req), expiresAt]);
    return result.rows[0];
};

const getPatientConsents = (db) => async (req, res, next) => {
    try {
        const { patientId } = req.params;
        if (req.user?.role === 'Patient' && !isPatientSelf(req, patientId)) {
            return next(new AppError('Access denied for this patient record', 403));
        }
        const result = await db.query(
            `SELECT consent_id, patient_id, type, status, signed_at, document_url,
                    source, revoked_at, revoked_reason
             FROM patient_consents
             WHERE patient_id = $1
             ORDER BY signed_at DESC`,
            [patientId]
        );
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getCurrentPatientConsents = (db) => async (req, res, next) => {
    try {
        const { patientId } = req.params;
        if (req.user?.role === 'Patient' && !isPatientSelf(req, patientId)) {
            return next(new AppError('Access denied for this patient record', 403));
        }
        const [patientResult, historyResult] = await Promise.all([
            db.query(`
                SELECT consent_sms, consent_email, consent_whatsapp, consent_marketing, consent_data_sharing
                FROM patients
                WHERE patient_id = $1
            `, [patientId]),
            db.query(`
                SELECT type, status, signed_at, revoked_at
                FROM patient_consents
                WHERE patient_id = $1
                ORDER BY signed_at DESC
            `, [patientId])
        ]);
        if (patientResult.rows.length === 0) return next(new AppError('Patient not found', 404));
        res.json({ current: patientResult.rows[0], history: historyResult.rows });
    } catch (error) {
        next(error);
    }
};

const addPatientConsent = (db) => async (req, res, next) => {
    let client;
    try {
        const { patientId } = req.params;
        if (req.user?.role === 'Patient' && !isPatientSelf(req, patientId)) {
            return next(new AppError('Access denied for this patient record', 403));
        }
        const data = addConsentSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');

        const patient = await client.query('SELECT patient_id FROM patients WHERE patient_id = $1 FOR UPDATE', [patientId]);
        if (patient.rows.length === 0) throw new AppError('Patient not found', 404);

        const result = await client.query(`
            INSERT INTO patient_consents (patient_id, type, document_url, signed_by, source, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [patientId, data.type, data.document_url || null, getUserId(req), data.source || (req.user?.role === 'Patient' ? 'PatientPortal' : 'Staff'), JSON.stringify({ notes: data.notes || null })]);
        await syncConsentFlag(client, patientId, data.type, true);
        await logPrivacyAction(client, req, 'CONSENT_RECORDED', {
            patientId,
            details: { consentId: result.rows[0].consent_id, type: data.type, source: data.source || null }
        });

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const revokePatientConsent = (db) => async (req, res, next) => {
    let client;
    try {
        const { consentId } = req.params;
        const data = revokeConsentSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM patient_consents WHERE consent_id = $1 FOR UPDATE', [consentId]);
        if (existing.rows.length === 0) throw new AppError('Consent not found', 404);
        const consent = existing.rows[0];
        if (req.user?.role === 'Patient' && !isPatientSelf(req, consent.patient_id)) {
            throw new AppError('Access denied for this patient record', 403);
        }
        if (consent.status === 'Revoked') throw new AppError('Consent is already revoked', 409);

        const result = await client.query(`
            UPDATE patient_consents
            SET status = 'Revoked',
                revoked_at = CURRENT_TIMESTAMP,
                revoked_by = $2,
                revoked_reason = $3
            WHERE consent_id = $1
            RETURNING *
        `, [consentId, getUserId(req), data.reason]);

        await syncConsentFlag(client, consent.patient_id, consent.type, false);
        await logPrivacyAction(client, req, 'CONSENT_REVOKED', {
            patientId: consent.patient_id,
            details: { consentId, type: consent.type }
        });

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getPrivacyRequests = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT pr.*, p.mrn, p.first_name_enc, p.last_name_enc,
                   u.full_name AS resolved_by_name
            FROM data_privacy_requests pr
            JOIN patients p ON pr.patient_id = p.patient_id
            LEFT JOIN users u ON pr.resolved_by = u.user_id
            ORDER BY pr.created_at DESC
        `);
        res.json(result.rows.map(({ first_name_enc, last_name_enc, ...request }) => ({
            ...request,
            patient_name: [safeDecrypt(first_name_enc), safeDecrypt(last_name_enc)].filter(Boolean).join(' ') || request.mrn
        })));
    } catch (error) {
        next(error);
    }
};

const createPrivacyRequest = (db) => async (req, res, next) => {
    try {
        const data = createPrivacyRequestSchema.parse(req.body);
        const patientId = req.user.role === 'Patient'
            ? getPatientUserId(req.user)
            : data.patient_id;
        if (!patientId) {
            return next(new AppError('Patient identity is required', 400));
        }
        const patient = await db.query('SELECT patient_id FROM patients WHERE patient_id = $1', [patientId]);
        if (patient.rows.length === 0) return next(new AppError('Patient not found', 404));

        const result = await db.query(`
            INSERT INTO data_privacy_requests (patient_id, request_type, notes, requested_by)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [patientId, data.request_type, data.notes || null, getUserId(req)]);
        await logPrivacyAction(db, req, 'PRIVACY_REQUEST_CREATED', {
            patientId,
            requestId: result.rows[0].request_id,
            details: { requestType: data.request_type }
        });
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const resolvePrivacyRequest = (db) => async (req, res, next) => {
    let client;
    try {
        const { requestId } = req.params;
        const { action, notes } = resolvePrivacyRequestSchema.parse(req.body);
        if (action === 'Export') await assertPermission(db, req, 'EXPORT_PATIENT_DATA');
        if (action === 'Anonymize') await assertPermission(db, req, 'ANONYMIZE_PATIENT_DATA');

        client = await db.connect();
        await client.query('BEGIN');

        const requestRes = await client.query('SELECT * FROM data_privacy_requests WHERE request_id = $1 FOR UPDATE', [requestId]);
        if (requestRes.rows.length === 0) throw new AppError('Request not found', 404);
        const request = requestRes.rows[0];
        if (!OPEN_REQUEST_STATUSES.has(request.status)) {
            throw new AppError('Privacy request is already closed', 409);
        }
        const isCorrectionResolve = action === 'Resolve' && request.request_type === 'Correction';
        if (action !== 'Reject' && !isCorrectionResolve && request.request_type !== action) {
            throw new AppError(`Cannot execute ${action} for a ${request.request_type} request`, 409);
        }

        if (action === 'Reject') {
            if (!notes) throw new AppError('Rejection notes are required', 400);
            const updated = await client.query(`
                UPDATE data_privacy_requests
                SET status = 'Rejected',
                    rejected_at = CURRENT_TIMESTAMP,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = $2,
                    resolution_notes = $3
                WHERE request_id = $1
                RETURNING *
            `, [requestId, getUserId(req), notes]);
            await logPrivacyAction(client, req, 'PRIVACY_REQUEST_REJECTED', {
                patientId: request.patient_id,
                requestId,
                details: { requestType: request.request_type }
            });
            await client.query('COMMIT');
            return res.json({ message: 'Privacy request rejected', request: updated.rows[0] });
        }

        if (action === 'Resolve') {
            if (!isCorrectionResolve) throw new AppError(`Cannot resolve a ${request.request_type} request with this action`, 409);
            if (!notes) throw new AppError('Resolution notes are required', 400);
            const updated = await client.query(`
                UPDATE data_privacy_requests
                SET status = 'Resolved',
                    completed_at = CURRENT_TIMESTAMP,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = $2,
                    resolution_notes = $3
                WHERE request_id = $1
                RETURNING *
            `, [requestId, getUserId(req), notes]);
            await logPrivacyAction(client, req, 'PRIVACY_REQUEST_RESOLVED', {
                patientId: request.patient_id,
                requestId,
                details: { requestType: request.request_type }
            });
            await client.query('COMMIT');
            return res.json({ message: 'Privacy request resolved', request: updated.rows[0] });
        }

        if (action === 'Export') {
            const exportData = await collectPatientData(client, request.patient_id);
            const artifact = await createExportArtifact(client, req, request, exportData);
            const updated = await client.query(`
                UPDATE data_privacy_requests
                SET status = 'Completed',
                    completed_at = CURRENT_TIMESTAMP,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = $2,
                    resolution_notes = $3,
                    export_id = $4,
                    metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
                WHERE request_id = $1
                RETURNING *
            `, [requestId, getUserId(req), notes || null, artifact.export_id, JSON.stringify({ exportChecksum: artifact.checksum, exportExpiresAt: artifact.expires_at })]);
            await logPrivacyAction(client, req, 'DATA_EXPORT_GENERATED', {
                patientId: request.patient_id,
                requestId,
                details: { exportId: artifact.export_id, checksum: artifact.checksum, expiresAt: artifact.expires_at },
                severity: AUDIT_SEVERITY.CRITICAL
            });
            await client.query('COMMIT');
            return res.json({ message: 'Export generated', request: updated.rows[0], export: artifact });
        }

        if (action === 'Anonymize') {
            const anonymizedFirstName = 'Anonymized';
            const anonymizedLastName = 'Patient';
            const patient = await client.query('SELECT patient_id, patient_status FROM patients WHERE patient_id = $1 FOR UPDATE', [request.patient_id]);
            if (patient.rows.length === 0) throw new AppError('Patient not found', 404);
            if (patient.rows[0].patient_status === 'Anonymized') throw new AppError('Patient is already anonymized', 409);

            await client.query(`
                UPDATE patients
                SET first_name_enc = $2,
                    last_name_enc = $3,
                    first_name_hash = $4,
                    last_name_hash = $5,
                    date_of_birth_enc = NULL,
                    date_of_birth_hash = NULL,
                    name_dob_hash = NULL,
                    phone_enc = NULL,
                    phone_hash = NULL,
                    address_enc = NULL,
                    national_id_enc = NULL,
                    national_id_hash = NULL,
                    passport_number_enc = NULL,
                    passport_number_hash = NULL,
                    emergency_contact_name_enc = NULL,
                    emergency_contact_phone_enc = NULL,
                    emergency_contact_relationship = NULL,
                    emergency_contact_address_enc = NULL,
                    email = NULL,
                    email_enc = NULL,
                    email_hash = NULL,
                    password_hash = NULL,
                    consent_sms = FALSE,
                    consent_email = FALSE,
                    consent_whatsapp = FALSE,
                    consent_marketing = FALSE,
                    consent_data_sharing = FALSE,
                    patient_status = 'Anonymized'
                WHERE patient_id = $1
            `, [
                request.patient_id,
                encrypt(anonymizedFirstName),
                encrypt(anonymizedLastName),
                hash(anonymizedFirstName),
                hash(anonymizedLastName)
            ]);
            await client.query(`
                UPDATE refresh_tokens
                SET revoked = TRUE,
                    revoked_at = NOW(),
                    revoked_reason = 'patient_record_anonymized'
                WHERE patient_id = $1 AND revoked = FALSE
            `, [request.patient_id]);
            await client.query(`
                UPDATE patient_consents
                SET status = 'Revoked',
                    revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                    revoked_by = COALESCE(revoked_by, $2),
                    revoked_reason = COALESCE(revoked_reason, 'patient_record_anonymized')
                WHERE patient_id = $1 AND status <> 'Revoked'
            `, [request.patient_id, getUserId(req)]);
            await client.query(`
                UPDATE data_privacy_requests
                SET status = 'Completed',
                    completed_at = CURRENT_TIMESTAMP,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = $2,
                    resolution_notes = $3,
                    metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
                WHERE request_id = $1
                RETURNING *
            `, [
                requestId,
                getUserId(req),
                notes || null,
                JSON.stringify({
                    previousStatus: patient.rows[0].patient_status,
                    manualReviewRecommended: ['documents.file_name', 'documents.notes', 'examinations.report_content', 'patient_portal_messages.body']
                })
            ]);
            await logPrivacyAction(client, req, 'PATIENT_ANONYMIZED', {
                patientId: request.patient_id,
                requestId,
                details: { previousStatus: patient.rows[0].patient_status },
                severity: AUDIT_SEVERITY.CRITICAL
            });
            await client.query('COMMIT');
            return res.json({ message: 'Patient anonymized' });
        }

        throw new AppError('Invalid action', 400);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const downloadPrivacyExport = (db) => async (req, res, next) => {
    try {
        const { exportId } = req.params;
        const result = await db.query(`
            SELECT pe.*, p.mrn
            FROM privacy_export_artifacts pe
            JOIN patients p ON p.patient_id = pe.patient_id
            WHERE pe.export_id = $1
        `, [exportId]);
        if (result.rows.length === 0) return next(new AppError('Export artifact not found', 404));
        const artifact = result.rows[0];
        if (new Date(artifact.expires_at).getTime() < Date.now()) {
            return next(new AppError('Export artifact has expired', 410));
        }
        const encrypted = await fs.readFile(artifact.file_path, 'utf8');
        const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
        if (checksum !== artifact.checksum) {
            return next(new AppError('Export artifact checksum mismatch', 409));
        }
        const content = decrypt(encrypted);
        await db.query(`
            UPDATE privacy_export_artifacts
            SET download_count = download_count + 1,
                last_downloaded_at = CURRENT_TIMESTAMP,
                last_downloaded_by = $2
            WHERE export_id = $1
        `, [exportId, getUserId(req)]);
        await logPrivacyAction(db, req, 'DATA_EXPORT_DOWNLOADED', {
            patientId: artifact.patient_id,
            requestId: artifact.request_id,
            details: { exportId },
            severity: AUDIT_SEVERITY.CRITICAL
        });

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="patient-data-${artifact.mrn || exportId}.json"`);
        res.send(content);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getPatientConsents,
    getCurrentPatientConsents,
    addPatientConsent,
    revokePatientConsent,
    getPrivacyRequests,
    createPrivacyRequest,
    resolvePrivacyRequest,
    downloadPrivacyExport
};
