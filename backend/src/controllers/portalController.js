const jwt = require('jsonwebtoken');
const { decrypt } = require('../utils/crypto');
const bcrypt = require('bcrypt');
const { AppError } = require('../middleware/errorHandler');
const { generateTokens } = require('./authController');
const { triggerEventForRole } = require('../services/notificationJobService');
const { resolvePortalDocument, UUID } = require('../services/portalDocumentService');
const { buildPortalInvoicePdf } = require('../services/portalInvoicePdfService');
const settingsService = require('../services/settingsService');
const {
    buildPortalNotificationEnvelope,
    getPortalNotificationPage
} = require('../utils/portalNotificationInbox');

const decryptOptional = (value) => value ? decrypt(value) : '';
const INVALID_LOGIN_ERROR = 'Invalid credentials';
const UNKNOWN_ACCOUNT_HASH = '$2b$10$j58V.FjnUf.jiJK9F4/LEe0HeU5NIOS0/mQVANGNvtCJBVor2cUV6';

const PORTAL_INVOICES_CACHE_TTL_MS = 3000;
const portalInvoicesCache = new Map();

const recordFailedPatientLogin = (db, patientId) => db.query(`
    UPDATE patients
    SET portal_failed_login_attempts = portal_failed_login_attempts + 1,
        portal_locked_until = CASE
            WHEN portal_failed_login_attempts + 1 >= 5 THEN
                NOW() + LEAST(
                    15 * POWER(2, portal_failed_login_attempts + 1 - 5),
                    1440
                ) * INTERVAL '1 minute'
            ELSE NULL
        END
    WHERE patient_id = $1
`, [patientId]);


const logPortalAudit = async (db, req, {
    eventType,
    resourceType,
    resourceId,
    details = {}
}) => {
    await db.query(`
        INSERT INTO patient_portal_audit (
            patient_id, event_type, resource_type, resource_id, details, ip_address, user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
        req.user.userId,
        eventType,
        resourceType || null,
        resourceId || null,
        details,
        req.ip || null,
        req.get('user-agent') || null
    ]);
};

const patientLogin = (db) => async (req, res, next) => {
    try {
        const { mrn, password } = req.body;

        if (typeof mrn !== 'string' || !mrn.trim() || mrn.length > 64
            || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
            return next(new AppError('MRN and password are required', 400));
        }

        const result = await db.query("SELECT * FROM patients WHERE UPPER(mrn) = UPPER($1)", [mrn.trim()]);
        const patient = result.rows[0];
        const match = await bcrypt.compare(password, patient?.password_hash || UNKNOWN_ACCOUNT_HASH);
        const isLocked = patient?.portal_locked_until
            && new Date(patient.portal_locked_until) > new Date();
        const canAuthenticate = patient
            && patient.password_hash
            && patient.patient_status === 'Active'
            && !isLocked;

        if (!canAuthenticate || !match) {
            if (patient && patient.password_hash && patient.patient_status === 'Active' && !isLocked && !match) {
                await recordFailedPatientLogin(db, patient.patient_id);
            }
            return next(new AppError(INVALID_LOGIN_ERROR, 401));
        }

        const payload = {
            userId: patient.patient_id,
            role: 'Patient',
            name: decrypt(patient.first_name_enc) + ' ' + decrypt(patient.last_name_enc)
        };

        const { token, refreshToken } = await generateTokens(db, payload, patient.patient_id, true);

        await db.query(`
            UPDATE patients
            SET portal_failed_login_attempts = 0, portal_locked_until = NULL
            WHERE patient_id = $1
              AND (portal_failed_login_attempts <> 0 OR portal_locked_until IS NOT NULL)
        `, [patient.patient_id]);

        res.cookie('portalRefreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/portal',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            token, user: {
                name: decrypt(patient.first_name_enc),
                role: 'Patient',
                patientId: patient.patient_id
            }
        });

    } catch (error) {
        next(error);
    }
};

const getMyRecords = (db) => async (req, res, next) => {
    try {
        const patientId = req.user.userId;

        const query = `
            SELECT 
                a.appointment_id,
                a.start_time,
                a.status as appointment_status,
                a.order_number,
                a.priority,
                a.clinical_indication,
                a.body_part,
                a.contrast_required,
                a.preparation_status,
                m.type as modality,
                et.name as exam_type_name,
                et.preparation_instructions,
                e.exam_id,
                e.status as exam_status,
                e.report_status,
                e.report_locked,
                e.report_finalized_at,
                CASE WHEN (
                    e.report_status IN ('Finalized', 'Amended')
                    AND COALESCE(e.report_locked, FALSE) = TRUE
                    AND e.report_finalized_at IS NOT NULL
                ) THEN e.report_content ELSE NULL END AS report_content,
                e.clinical_indication as exam_clinical_indication,
                e.provisional_diagnosis as exam_provisional_diagnosis,
                e.body_part as exam_body_part,
                e.contrast_required as exam_contrast_required,
                CASE WHEN (
                    e.report_status IN ('Finalized', 'Amended')
                    AND COALESCE(e.report_locked, FALSE) = TRUE
                    AND e.report_finalized_at IS NOT NULL
                ) THEN e.report_sections ELSE NULL END AS report_sections,
                CASE WHEN (
                    e.report_status IN ('Finalized', 'Amended')
                    AND COALESCE(e.report_locked, FALSE) = TRUE
                    AND e.report_finalized_at IS NOT NULL
                ) THEN u.full_name ELSE NULL END AS radiologist_name
            FROM appointments a
            LEFT JOIN modalities m ON a.modality_id = m.modality_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            LEFT JOIN examinations e ON a.appointment_id = e.appointment_id
            LEFT JOIN users u ON e.performing_radiologist_id = u.user_id
            WHERE a.patient_id = $1
            ORDER BY a.start_time DESC
        `;

        const result = await db.query(query, [patientId]);
        res.json(result.rows);

    } catch (error) {
        next(error);
    }
};

const getMyInvoices = (db) => async (req, res, next) => {
    try {
        const userId = req.user.userId;
        if (process.env.NODE_ENV !== 'test') {
            const cached = portalInvoicesCache.get(userId);
            if (cached && (Date.now() - cached.timestamp < PORTAL_INVOICES_CACHE_TTL_MS)) {
                return res.json(cached.data);
            }
        }

        const result = await db.query(`
            SELECT i.invoice_id, i.invoice_number, i.invoice_status, i.total_amount,
                   i.patient_payable_amount, i.generated_at, i.due_date,
                   COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.invoice_id AND p.payment_status = 'Completed'), 0) as paid_amount,
                   COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0) as refunded_amount,
                   COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL), 0) as credited_amount,
                   GREATEST(
                       i.patient_payable_amount
                       - COALESCE((SELECT SUM(c.patient_amount) FROM credit_notes c WHERE c.invoice_id = i.invoice_id AND c.reversed_at IS NULL), 0)
                       - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.invoice_id AND p.payment_status = 'Completed'), 0)
                       + COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0),
                       0
                   ) as balance_amount,
                   COALESCE(a.order_number, e.order_number) as order_number,
                   COALESCE(et.name, 'Medical Examination / فحص طبي') as exam_type_name
            FROM invoices i
            LEFT JOIN appointments a ON i.appointment_id = a.appointment_id
            LEFT JOIN examinations e ON (i.exam_id = e.exam_id OR (i.exam_id IS NULL AND a.appointment_id IS NOT NULL AND e.appointment_id = a.appointment_id))
            LEFT JOIN examination_types et ON et.type_id = COALESCE(a.exam_type_id, e.exam_type_id)
            WHERE i.patient_id = $1::uuid
              AND (a.patient_id IS NULL OR a.patient_id = $1::uuid)
              AND (e.patient_id IS NULL OR e.patient_id = $1::uuid)
              AND i.invoice_status != 'Voided'
            ORDER BY i.generated_at DESC
        `, [userId]);

        if (process.env.NODE_ENV !== 'test') {
            portalInvoicesCache.set(userId, { timestamp: Date.now(), data: result.rows });
            if (portalInvoicesCache.size > 200) {
                const oldest = portalInvoicesCache.keys().next().value;
                portalInvoicesCache.delete(oldest);
            }
        }

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getMyDocuments = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT document_id, appointment_id, exam_id, title, document_type,
                   uploaded_at, notes
            FROM patient_portal_documents
            WHERE patient_id = $1
              AND is_patient_visible = TRUE
            ORDER BY uploaded_at DESC
        `, [req.user.userId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const downloadMyDocument = (db) => async (req, res, next) => {
    try {
        if (!UUID.test(req.params.documentId || '')) return next(new AppError('Document not found', 404));
        const result = await db.query(`
            SELECT document_id, title, document_type, file_url
            FROM patient_portal_documents
            WHERE document_id = $1
              AND patient_id = $2
              AND is_patient_visible = TRUE
        `, [req.params.documentId, req.user.userId]);

        if (result.rows.length === 0) {
            return next(new AppError('Document not found', 404));
        }

        const file = await resolvePortalDocument(db, result.rows[0].file_url, req.user.userId);

        await logPortalAudit(db, req, {
            eventType: 'DocumentDownloaded',
            resourceType: 'Document',
            resourceId: result.rows[0].document_id,
            details: { title: result.rows[0].title, documentType: result.rows[0].document_type }
        });

        triggerEventForRole(db, 'DocumentDownloaded', 'Admin', {
            priority: 'Normal',
            variables: {
                document_title: result.rows[0].title,
                patient_id: req.user.userId,
                downloaded_by: req.user?.email || 'Unknown'
            }
        }).catch(() => {});

        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.download(file.realFile, file.file_name, error => {
            if (error && !res.headersSent) next(new AppError('Document could not be downloaded', 503));
            else if (error) res.destroy(error);
        });
    } catch (error) {
        next(error);
    }
};

const getMyInvoicePdf = (db) => async (req, res, next) => {
    try {
        const { invoiceId } = req.params;
        const patientId = req.user.userId;
        if (!UUID.test(invoiceId || '')) return next(new AppError('Invoice not found', 404));
        const result = await db.query(`
            SELECT i.invoice_id, i.invoice_number, i.invoice_status, i.generated_at,
                   i.subtotal_amount, i.discount_amount, i.tax_amount, i.total_amount,
                   i.insurance_covered_amount, i.patient_payable_amount,
                   p.mrn, p.first_name_enc, p.last_name_enc,
                   COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.invoice_id AND payment_status = 'Completed'), 0) AS paid_amount,
                   COALESCE((SELECT SUM(amount) FROM refunds WHERE invoice_id = i.invoice_id AND status = 'Processed'), 0) AS refunded_amount,
                   COALESCE((SELECT SUM(patient_amount) FROM credit_notes WHERE invoice_id = i.invoice_id AND reversed_at IS NULL), 0) AS credited_amount
            FROM invoices i
            JOIN patients p ON p.patient_id = i.patient_id
            LEFT JOIN appointments a ON a.appointment_id = i.appointment_id
            LEFT JOIN examinations e ON e.exam_id = i.exam_id
            WHERE i.invoice_id = $1::uuid AND i.patient_id = $2::uuid
              AND i.invoice_status <> 'Voided'
              AND (a.patient_id IS NULL OR a.patient_id = $2::uuid)
              AND (e.patient_id IS NULL OR e.patient_id = $2::uuid)
        `, [invoiceId, patientId]);
        if (!result.rows.length) return next(new AppError('Invoice not found', 404));
        const invoice = result.rows[0];
        invoice.patient_name = [decryptOptional(invoice.first_name_enc), decryptOptional(invoice.last_name_enc)].filter(Boolean).join(' ');
        invoice.balance_amount = Math.max(0, Number(invoice.patient_payable_amount || 0) - Number(invoice.paid_amount) + Number(invoice.refunded_amount) - Number(invoice.credited_amount));
        const [items, payments, settings] = await Promise.all([
            db.query('SELECT description, quantity, unit_price, total_amount FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at', [invoiceId]),
            db.query("SELECT transaction_date, method, amount FROM payments WHERE invoice_id = $1 AND payment_status = 'Completed' ORDER BY transaction_date", [invoiceId]),
            settingsService.getAll()
        ]);
        const pdf = await buildPortalInvoicePdf(invoice, items.rows, payments.rows, settings);
        await logPortalAudit(db, req, { eventType: 'InvoiceDownloaded', resourceType: 'Invoice', resourceId: invoiceId });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.pdf"`);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(pdf);
    } catch (error) { next(error); }
};

const getMyAppointmentRequests = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT par.*, et.name as exam_type_name
            FROM patient_appointment_requests par
            LEFT JOIN examination_types et ON par.exam_type_id = et.type_id
            WHERE par.patient_id = $1
            ORDER BY par.created_at DESC
        `, [req.user.userId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createAppointmentRequest = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const result = await db.query(`
            INSERT INTO patient_appointment_requests (
                patient_id, preferred_date, preferred_time_window, modality_type,
                exam_type_id, clinical_notes, contact_phone, contact_email
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            req.user.userId,
            data.preferredDate || null,
            data.preferredTimeWindow || null,
            data.modalityType || null,
            data.examTypeId || null,
            data.clinicalNotes || null,
            data.contactPhone || null,
            data.contactEmail || null
        ]);

        await logPortalAudit(db, req, {
            eventType: 'AppointmentRequested',
            resourceType: 'AppointmentRequest',
            resourceId: result.rows[0].request_id,
            details: { preferredDate: data.preferredDate, modalityType: data.modalityType }
        });

        triggerEventForRole(db, 'AppointmentRequested', 'Receptionist', {
            priority: 'Normal',
            variables: {
                patient_id: req.user.userId,
                preferred_date: data.preferredDate || '',
                exam_type: data.modalityType || ''
            }
        }).catch(() => {});

        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const createProfileUpdateRequest = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            INSERT INTO patient_profile_update_requests (patient_id, requested_changes)
            VALUES ($1, $2)
            RETURNING *
        `, [req.user.userId, req.body]);

        await logPortalAudit(db, req, {
            eventType: 'ProfileUpdateRequested',
            resourceType: 'ProfileUpdateRequest',
            resourceId: result.rows[0].update_request_id,
            details: { fields: Object.keys(req.body) }
        });

        triggerEventForRole(db, 'ProfileUpdateRequested', 'Admin', {
            priority: 'Normal',
            variables: {
                patient_id: req.user.userId,
                fields: Object.keys(req.body).join(', ')
            }
        }).catch(() => {});

        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getStaffUserId = (req) => req.user?.user_id || req.user?.userId;

const getPendingPortalReviewRequests = (db) => async (req, res, next) => {
    try {
        const [appointmentResult, profileResult] = await Promise.all([
            db.query(`
                SELECT par.*, p.mrn, p.first_name_enc, p.last_name_enc,
                       et.name AS exam_type_name
                FROM patient_appointment_requests par
                JOIN patients p ON p.patient_id = par.patient_id
                LEFT JOIN examination_types et ON et.type_id = par.exam_type_id
                WHERE par.status = 'Pending'
                ORDER BY par.created_at ASC
                LIMIT 100
            `),
            db.query(`
                SELECT pur.*, p.mrn, p.first_name_enc, p.last_name_enc
                FROM patient_profile_update_requests pur
                JOIN patients p ON p.patient_id = pur.patient_id
                WHERE pur.status = 'Pending'
                ORDER BY pur.created_at ASC
                LIMIT 100
            `)
        ]);

        const withPatientName = (row) => ({
            ...row,
            patient_name: [
                decryptOptional(row.first_name_enc),
                decryptOptional(row.last_name_enc)
            ].filter(Boolean).join(' '),
            first_name_enc: undefined,
            last_name_enc: undefined
        });

        res.json({
            appointmentRequests: appointmentResult.rows.map(withPatientName),
            profileUpdateRequests: profileResult.rows.map(withPatientName)
        });
    } catch (error) {
        next(error);
    }
};

const reviewPortalAppointmentRequest = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query(`
            SELECT * FROM patient_appointment_requests
            WHERE request_id = $1
            FOR UPDATE
        `, [req.params.requestId]);
        if (!existing.rows.length) throw new AppError('Portal appointment request not found', 404);
        if (existing.rows[0].status !== 'Pending') {
            throw new AppError('Portal appointment request has already been reviewed', 409);
        }

        const userId = getStaffUserId(req);
        const updated = await client.query(`
            UPDATE patient_appointment_requests
            SET status = $2, staff_notes = $3, reviewed_by = $4,
                reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = $1
            RETURNING *
        `, [req.params.requestId, req.body.status, req.body.staffNotes, userId]);

        await client.query(`
            INSERT INTO patient_portal_audit (
                patient_id, event_type, resource_type, resource_id, details, ip_address, user_agent
            )
            VALUES ($1, 'AppointmentRequestReviewed', 'AppointmentRequest', $2, $3::jsonb, $4, $5)
        `, [
            existing.rows[0].patient_id,
            req.params.requestId,
            JSON.stringify({
                status: req.body.status,
                staffNotes: req.body.staffNotes,
                reviewedBy: userId
            }),
            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');

        triggerEvent(db, 'AppointmentRequestReviewed', {
            patientId: existing.rows[0].patient_id,
            entityType: 'AppointmentRequest',
            entityId: req.params.requestId,
            channels: ['Email'],
            priority: 'Normal',
            variables: {
                patient_name: '',
                status: req.body.status,
                staff_notes: req.body.staffNotes || ''
            }
        }).catch(() => {});

        res.json(updated.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const reviewPortalProfileUpdateRequest = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query(`
            SELECT * FROM patient_profile_update_requests
            WHERE update_request_id = $1
            FOR UPDATE
        `, [req.params.requestId]);
        if (!existing.rows.length) throw new AppError('Portal profile update request not found', 404);
        if (existing.rows[0].status !== 'Pending') {
            throw new AppError('Portal profile update request has already been reviewed', 409);
        }

        const userId = getStaffUserId(req);
        const updated = await client.query(`
            UPDATE patient_profile_update_requests
            SET status = $2, staff_notes = $3, reviewed_by = $4,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE update_request_id = $1
            RETURNING *
        `, [req.params.requestId, req.body.status, req.body.staffNotes, userId]);

        await client.query(`
            INSERT INTO patient_portal_audit (
                patient_id, event_type, resource_type, resource_id, details, ip_address, user_agent
            )
            VALUES ($1, 'ProfileUpdateRequestReviewed', 'ProfileUpdateRequest', $2, $3::jsonb, $4, $5)
        `, [
            existing.rows[0].patient_id,
            req.params.requestId,
            JSON.stringify({
                status: req.body.status,
                staffNotes: req.body.staffNotes,
                reviewedBy: userId,
                fields: Object.keys(existing.rows[0].requested_changes || {})
            }),
            req.ip || null,
            req.get('user-agent') || null
        ]);

        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getMyProfile = (db) => async (req, res, next) => {
    try {
        const patientId = req.user.userId;
        const result = await db.query("SELECT * FROM patients WHERE patient_id = $1", [patientId]);
        if (result.rows.length === 0) {
            return next(new AppError('Patient not found', 404));
        }
        const patient = result.rows[0];
        
        const firstName = decrypt(patient.first_name_enc);
        const lastName = decrypt(patient.last_name_enc);
        const fullName = [firstName, lastName].filter(Boolean).join(' ');

        const decryptedProfile = {
            patient_id: patient.patient_id,
            mrn: patient.mrn,
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            email: decryptOptional(patient.email_enc),
            date_of_birth: decrypt(patient.date_of_birth_enc),
            phone: decryptOptional(patient.phone_enc),
            address: decryptOptional(patient.address_enc),
            gender: patient.gender,
            patient_status: patient.patient_status,
            preferred_language: patient.preferred_language,
            communication_preference: patient.communication_preference,
            loyalty_points: patient.loyalty_points || 0,
            national_id: decryptOptional(patient.national_id_enc),
            passport_number: decryptOptional(patient.passport_number_enc),
            emergency_contact_name: decryptOptional(patient.emergency_contact_name_enc),
            emergency_contact_phone: decryptOptional(patient.emergency_contact_phone_enc),
            emergency_contact_relationship: patient.emergency_contact_relationship,
            allergies: decryptOptional(patient.allergies_enc),
            chronic_diseases: decryptOptional(patient.chronic_diseases_enc),
            prior_surgeries: decryptOptional(patient.prior_surgeries_enc),
            implants_devices: decryptOptional(patient.implants_devices_enc),
            renal_function_notes: decryptOptional(patient.renal_function_notes_enc)
        };

        const crmResult = await db.query(`
            SELECT c.*, u.full_name as assignee_name
            FROM crm_activities c
            LEFT JOIN users u ON c.assigned_to = u.user_id
            WHERE c.patient_id = $1
            ORDER BY c.due_date DESC, c.created_at DESC
        `, [patientId]);

        res.json({
            profile: decryptedProfile,
            activities: crmResult.rows
        });
    } catch (error) {
        next(error);
    }
};

// ─── Portal Notification Inbox ──────────────────────────────────────────────

const decryptStored = (value) => {
    if (!value || (!String(value).startsWith('v2:') && !/^[0-9a-f]+:[0-9a-f]+$/i.test(value))) return value;
    try {
        return decrypt(value);
    } catch (_) {
        return value;
    }
};

const getMyNotifications = (db) => async (req, res, next) => {
    try {
        const patientId = req.user.userId;
        const page = getPortalNotificationPage(req.query);
        const [itemsResult, countsResult] = await Promise.all([
            db.query(`
                SELECT n.notification_id, n.channel, n.event_type, n.entity_id,
                       n.subject, n.content, n.status, n.priority,
                       n.is_read, n.read_at, n.created_at, ec.category
                FROM notifications n
                LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
                WHERE n.patient_id = $1
                  AND n.channel = 'InApp'
                ORDER BY n.created_at DESC, n.notification_id DESC
                LIMIT $2 OFFSET $3
            `, [patientId, page.limit, page.offset]),
            db.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_count
                FROM notifications
                WHERE patient_id = $1
                  AND channel = 'InApp'
            `, [patientId])
        ]);

        res.json(buildPortalNotificationEnvelope({
            rows: itemsResult.rows,
            counts: countsResult.rows[0],
            persona: 'patient',
            page,
            decryptStored
        }));
    } catch (error) {
        next(error);
    }
};

const getMyNotificationUnreadCount = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT COUNT(*)::int AS unread_count
            FROM notifications
            WHERE patient_id = $1
              AND channel = 'InApp'
              AND is_read = FALSE
        `, [req.user.userId]);
        res.json({ unreadCount: result.rows[0].unread_count });
    } catch (error) {
        next(error);
    }
};

const markMyNotificationRead = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            UPDATE notifications
            SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
            WHERE notification_id = $1
              AND patient_id = $2
              AND channel = 'InApp'
            RETURNING notification_id, is_read, read_at
        `, [req.params.id, req.user.userId]);

        if (result.rows.length === 0) {
            return next(new AppError('Notification not found', 404));
        }
        res.json({ message: 'Notification marked as read', notification: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

const markAllMyNotificationsRead = (db) => async (req, res, next) => {
    try {
        await db.query(`
            UPDATE notifications
            SET is_read = TRUE, read_at = NOW()
            WHERE patient_id = $1
              AND channel = 'InApp'
              AND is_read = FALSE
        `, [req.user.userId]);
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    patientLogin,
    getMyRecords,
    getMyInvoices,
    getMyInvoicePdf,
    getMyDocuments,
    downloadMyDocument,
    getMyAppointmentRequests,
    createAppointmentRequest,
    createProfileUpdateRequest,
    getPendingPortalReviewRequests,
    reviewPortalAppointmentRequest,
    reviewPortalProfileUpdateRequest,
    getMyProfile,
    logPortalAudit,
    getMyNotifications,
    getMyNotificationUnreadCount,
    markMyNotificationRead,
    markAllMyNotificationsRead
};
