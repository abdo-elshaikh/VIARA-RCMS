const { getRequestQuery } = require('../utils/requestQuery');
const bcrypt = require('bcrypt');
const { AppError } = require('../middleware/errorHandler');
const { generateTokens } = require('./authController');
const { decrypt } = require('../utils/crypto');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const { logAction } = require('../services/auditService');
const { triggerEventForRole } = require('../services/notificationJobService');
const {
    buildPortalNotificationEnvelope,
    getPortalNotificationPage
} = require('../utils/portalNotificationInbox');

const SALT_ROUNDS = 12;
const INVALID_LOGIN_ERROR = 'Invalid credentials';
const UNKNOWN_ACCOUNT_HASH = '$2b$10$j58V.FjnUf.jiJK9F4/LEe0HeU5NIOS0/mQVANGNvtCJBVor2cUV6';

const recordFailedDoctorLogin = (db, doctorId) => db.query(`
    UPDATE referring_doctors
    SET portal_failed_login_attempts = portal_failed_login_attempts + 1,
        portal_locked_until = CASE
            WHEN portal_failed_login_attempts + 1 >= 5 THEN
                NOW() + LEAST(
                    15 * POWER(2, portal_failed_login_attempts + 1 - 5),
                    1440
                ) * INTERVAL '1 minute'
            ELSE NULL
        END
    WHERE doctor_id = $1
`, [doctorId]);

// ─── Audit helper ───────────────────────────────────────────────────────────

const logDoctorAudit = async (db, req, { eventType, resourceType, resourceId, details = {} }) => {
    await db.query(`
        INSERT INTO doctor_portal_audit
            (doctor_id, event_type, resource_type, resource_id, details, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
        req.user.doctorId,
        eventType,
        resourceType || null,
        resourceId || null,
        details,
        req.ip || null,
        req.get('user-agent') || null
    ]);
};

// ─── Admin: set / reset portal password ─────────────────────────────────────

const setPortalPassword = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const suppliedPassword = req.body.password;
        const portalPassword = suppliedPassword || generateSecurePassword();

        const doctorResult = await db.query(
            'SELECT doctor_id, full_name, email FROM referring_doctors WHERE doctor_id = $1',
            [id]
        );
        if (doctorResult.rows.length === 0) {
            return next(new AppError('Referring doctor not found', 404));
        }

        const hash = await bcrypt.hash(portalPassword, SALT_ROUNDS);

        await db.query(`
            UPDATE referring_doctors
             SET portal_password_hash = $1,
                 current_session_id = NULL,
                 portal_is_active = TRUE,
                 portal_failed_login_attempts = 0,
                 portal_locked_until = NULL,
                 updated_at = NOW()
            WHERE doctor_id = $2
        `, [hash, id]);

        await logAction(db, {
            userId: req.user?.user_id,
            action: 'UPDATE_DOCTOR_PORTAL_PASSWORD',
            resourceId: id,
            resourceTable: 'referring_doctors',
            ipAddress: req.ip,
            details: { generated: !suppliedPassword, email: doctorResult.rows[0].email },
            required: true
        });

        res.json({
            message: suppliedPassword ? 'Portal password set successfully' : 'Portal credentials generated successfully',
            doctorId: id,
            doctorName: doctorResult.rows[0].full_name,
            email: doctorResult.rows[0].email,
            portalPassword
        });
    } catch (error) {
        next(error);
    }
};

// ─── Doctor login ────────────────────────────────────────────────────────────

const doctorLogin = (db) => async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (typeof email !== 'string' || !email.trim() || email.length > 254
            || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
            return next(new AppError('Email and password are required', 400));
        }

        const result = await db.query(
            'SELECT * FROM referring_doctors WHERE email = $1',
            [email.trim().toLowerCase()]
        );

        const doctor = result.rows[0];
        const match = await bcrypt.compare(password, doctor?.portal_password_hash || UNKNOWN_ACCOUNT_HASH);
        const isLocked = doctor?.portal_locked_until
            && new Date(doctor.portal_locked_until) > new Date();
        const canAuthenticate = doctor
            && doctor.portal_password_hash
            && doctor.is_active === true
            && doctor.portal_is_active
            && !isLocked;

        if (!canAuthenticate || !match) {
            if (doctor && doctor.portal_password_hash && doctor.portal_is_active && !isLocked && !match) {
                await recordFailedDoctorLogin(db, doctor.doctor_id);
            }
            return next(new AppError(INVALID_LOGIN_ERROR, 401));
        }

        const payload = {
            doctorId: doctor.doctor_id,
            role: 'Doctor',
            name: doctor.full_name,
            email: doctor.email
        };

        const { token, refreshToken } = await generateTokens(db, payload, doctor.doctor_id, 'doctor');

        res.cookie('portalRefreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/portal',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        await db.query(`
            UPDATE referring_doctors
            SET portal_last_login = NOW(),
                portal_failed_login_attempts = 0,
                portal_locked_until = NULL
            WHERE doctor_id = $1
        `, [doctor.doctor_id]);

        res.json({
            token,
            user: {
                id: doctor.doctor_id,
                name: doctor.full_name,
                role: 'Doctor',
                specialty: doctor.specialty,
                clinicHospital: doctor.clinic_hospital
            }
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/doctor-portal/cases ───────────────────────────────────────────

const getDoctorCases = (db) => async (req, res, next) => {
    try {
        const doctorId = req.user.doctorId;
        const { status, limit = 50, offset = 0 } = getRequestQuery(req);
        const search = getRequestQuery(req).search || getRequestQuery(req).q;

        const values = [doctorId];
        let param = 2;
        let filters = '';

        if (status) {
            filters += ` AND a.status = $${param++}`;
            values.push(status);
        }

        if (search) {
            filters += ` AND (p.mrn ILIKE $${param} OR CONCAT(p.mrn) ILIKE $${param})`;
            values.push(`%${search}%`);
            param++;
        }

        const result = await db.query(`
            SELECT
                a.appointment_id,
                a.order_number,
                a.start_time,
                a.status           AS appointment_status,
                a.priority,
                a.clinical_indication,
                a.body_part,
                a.contrast_required,
                p.mrn              AS patient_mrn,
                p.first_name_enc,
                p.last_name_enc,
                m.type             AS modality,
                m.name             AS machine_name,
                et.name            AS exam_type_name,
                e.exam_id,
                e.status           AS exam_status,
                e.report_status,
                e.report_locked,
                e.report_finalized_at AS finalized_at
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            LEFT JOIN modalities m ON a.modality_id = m.modality_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            LEFT JOIN examinations e ON e.appointment_id = a.appointment_id
            WHERE a.referring_doctor_id = $1
              ${filters}
            ORDER BY a.start_time DESC
            LIMIT $${param++} OFFSET $${param}
        `, [...values, limit, offset]);

        await logDoctorAudit(db, req, { eventType: 'CasesViewed' });

        const mappedRows = result.rows.map(row => {
            const mapped = { ...row };
            if (row.first_name_enc || row.last_name_enc) {
                mapped.patient_name = [decrypt(row.first_name_enc), decrypt(row.last_name_enc)]
                    .filter(Boolean)
                    .join(' ');
            }
            delete mapped.first_name_enc;
            delete mapped.last_name_enc;
            return mapped;
        });

        res.json(mappedRows);
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/doctor-portal/reports/:examId ─────────────────────────────────

const getDoctorReport = (db) => async (req, res, next) => {
    try {
        const doctorId = req.user.doctorId;
        const { examId } = req.params;

        // Verify this exam belongs to one of the doctor's referrals
        const result = await db.query(`
            SELECT
                e.exam_id,
                e.status,
                e.report_status,
                e.report_content,
                e.report_sections,
                e.report_finalized_at AS finalized_at,
                e.performing_radiologist_id,
                u.full_name         AS radiologist_name,
                a.appointment_id,
                a.order_number,
                a.start_time,
                a.clinical_indication,
                p.mrn               AS patient_mrn,
                p.first_name_enc,
                p.last_name_enc,
                et.name             AS exam_type_name,
                m.type              AS modality
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.appointment_id
            JOIN patients p ON a.patient_id = p.patient_id
            LEFT JOIN users u ON e.performing_radiologist_id = u.user_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            LEFT JOIN modalities m ON a.modality_id = m.modality_id
            WHERE e.exam_id = $1
              AND a.referring_doctor_id = $2
              AND e.report_status IN ('Finalized', 'Amended')
              AND e.report_locked = TRUE
              AND e.report_finalized_at IS NOT NULL
        `, [examId, doctorId]);

        if (result.rows.length === 0) {
            return next(new AppError('Report not found or not yet finalized', 404));
        }

        await logDoctorAudit(db, req, {
            eventType: 'ReportViewed',
            resourceType: 'Exam',
            resourceId: examId,
            details: { examId, orderNumber: result.rows[0].order_number }
        });

        const mappedRow = { ...result.rows[0] };
        if (mappedRow.first_name_enc || mappedRow.last_name_enc) {
            mappedRow.patient_name = [decrypt(mappedRow.first_name_enc), decrypt(mappedRow.last_name_enc)]
                .filter(Boolean)
                .join(' ');
        }
        delete mappedRow.first_name_enc;
        delete mappedRow.last_name_enc;

        res.json(mappedRow);
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/doctor-portal/reports/:examId/pdf ─────────────────────────────

const getDoctorReportPdf = (db) => async (req, res, next) => {
    try {
        const doctorId = req.user.doctorId;
        const { examId } = req.params;

        // Verify ownership
        const examResult = await db.query(`
            SELECT e.exam_id, e.report_status, e.report_locked, e.report_finalized_at, a.referring_doctor_id
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.appointment_id
            WHERE e.exam_id = $1
              AND a.referring_doctor_id = $2
              AND e.report_status IN ('Finalized', 'Amended')
              AND e.report_locked = TRUE
              AND e.report_finalized_at IS NOT NULL
        `, [examId, doctorId]);

        if (examResult.rows.length === 0) {
            return next(new AppError('Report not found or not yet finalized', 404));
        }

        const { getReportPdf } = require('./examController');
        req.params.id = examId;

        await logDoctorAudit(db, req, {
            eventType: 'ReportPdfDownloaded',
            resourceType: 'Exam',
            resourceId: examId
        });

        return getReportPdf(db)(req, res, next);
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/doctor-portal/orders ─────────────────────────────────────────

const createDoctorOrder = (db) => async (req, res, next) => {
    try {
        const doctorId = req.user.doctorId;
        const data = req.body;

        // Resolve patient by MRN
        const patientResult = await db.query(
            'SELECT patient_id, mrn FROM patients WHERE mrn = $1 AND patient_status != $2',
            [data.patientMrn.trim().toUpperCase(), 'Merged']
        );

        if (patientResult.rows.length === 0) {
            return next(new AppError(`No active patient found with MRN: ${data.patientMrn}`, 404));
        }

        const patient = patientResult.rows[0];

        // Get the doctor's info for contact
        const doctorResult = await db.query(
            'SELECT email, phone FROM referring_doctors WHERE doctor_id = $1',
            [doctorId]
        );
        const doctorInfo = doctorResult.rows[0] || {};

        const result = await db.query(`
            INSERT INTO patient_appointment_requests (
                patient_id, preferred_date, preferred_time_window,
                modality_type, exam_type_id, clinical_notes,
                contact_phone, contact_email, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending')
            RETURNING *
        `, [
            patient.patient_id,
            data.preferredDate || null,
            data.preferredTimeWindow || null,
            data.modalityType || null,
            data.examTypeId || null,
            [
                data.clinicalNotes || '',
                `[Doctor Portal Order from Dr. ${req.user.name}, Doctor ID: ${doctorId}]`
            ].filter(Boolean).join('\n'),
            data.contactPhone || doctorInfo.phone || null,
            doctorInfo.email || null
        ]);

        await logDoctorAudit(db, req, {
            eventType: 'OrderRequested',
            resourceType: 'AppointmentRequest',
            resourceId: result.rows[0].request_id,
            details: { patientMrn: patient.mrn, modalityType: data.modalityType }
        });

        res.status(201).json({
            ...result.rows[0],
            patientMrn: patient.mrn
        });
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/doctor-portal/messages ────────────────────────────────────────

const getMessages = (db) => async (req, res, next) => {
    try {
        const doctorId = req.user.doctorId;

        const result = await db.query(`
            SELECT
                dpm.message_id,
                dpm.sender_role,
                dpm.subject,
                dpm.body,
                dpm.is_read,
                dpm.read_at,
                dpm.appointment_id,
                dpm.exam_id,
                dpm.created_at,
                u.full_name AS staff_name
            FROM doctor_portal_messages dpm
            LEFT JOIN users u ON dpm.staff_user_id = u.user_id
            WHERE dpm.doctor_id = $1
            ORDER BY dpm.created_at DESC
            LIMIT 100
        `, [doctorId]);

        // Mark unread doctor-received messages as read
        await db.query(`
            UPDATE doctor_portal_messages
            SET is_read = TRUE, read_at = NOW()
            WHERE doctor_id = $1
              AND sender_role = 'Staff'
              AND is_read = FALSE
        `, [doctorId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

// ─── POST /api/doctor-portal/messages ───────────────────────────────────────

const sendMessage = (db) => async (req, res, next) => {
    try {
        const doctorId = req.user.doctorId;
        const data = req.body;

        const result = await db.query(`
            INSERT INTO doctor_portal_messages
                (doctor_id, sender_role, subject, body, appointment_id, exam_id)
            VALUES ($1, 'Doctor', $2, $3, $4, $5)
            RETURNING *
        `, [
            doctorId,
            data.subject || null,
            data.body,
            data.appointmentId || null,
            data.examId || null
        ]);

        await logDoctorAudit(db, req, {
            eventType: 'MessageSent',
            resourceType: 'Message',
            resourceId: result.rows[0].message_id
        });

        const notificationPayload = {
            entityType: 'Message',
            entityId: result.rows[0].message_id,
            priority: 'Normal',
            variables: {
                sender_name: req.user?.name || 'Referring doctor',
                message_preview: data.body.length > 100 ? `${data.body.slice(0, 97)}...` : data.body
            }
        };
        for (const role of ['Admin', 'Receptionist', 'Marketing', 'Developer']) {
            triggerEventForRole(db, 'ChatMessageReceived', role, notificationPayload).catch(() => {});
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

// ─── GET /api/doctor-portal/messages/unread-count ───────────────────────────

const getUnreadMessageCount = (db) => async (req, res, next) => {
    try {
        const doctorId = req.user.doctorId;

        const result = await db.query(`
            SELECT COUNT(*) AS unread_count
            FROM doctor_portal_messages
            WHERE doctor_id = $1
              AND sender_role = 'Staff'
              AND is_read = FALSE
        `, [doctorId]);

        res.json({ unreadCount: parseInt(result.rows[0].unread_count, 10) });
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
        const doctorId = req.user.doctorId;
        const page = getPortalNotificationPage(getRequestQuery(req));
        const [itemsResult, countsResult] = await Promise.all([
            db.query(`
                SELECT n.notification_id, n.channel, n.event_type, n.entity_id,
                       n.subject, n.content, n.status, n.priority,
                       n.is_read, n.read_at, n.created_at, ec.category,
                       cra.status AS acknowledgement_status,
                       cra.acknowledgement_due_at, cra.escalated_at
                FROM notifications n
                LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
                LEFT JOIN critical_result_acknowledgements cra
                  ON cra.exam_id = n.entity_id
                 AND cra.referring_doctor_id = $1
                WHERE n.referring_doctor_id = $1
                  AND n.channel = 'InApp'
                ORDER BY n.created_at DESC, n.notification_id DESC
                LIMIT $2 OFFSET $3
            `, [doctorId, page.limit, page.offset]),
            db.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_count
                FROM notifications
                WHERE referring_doctor_id = $1
                  AND channel = 'InApp'
            `, [doctorId])
        ]);

        res.json(buildPortalNotificationEnvelope({
            rows: itemsResult.rows,
            counts: countsResult.rows[0],
            persona: 'doctor',
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
            WHERE referring_doctor_id = $1
              AND channel = 'InApp'
              AND is_read = FALSE
        `, [req.user.doctorId]);
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
              AND referring_doctor_id = $2
              AND channel = 'InApp'
            RETURNING notification_id, is_read, read_at
        `, [req.params.id, req.user.doctorId]);

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
            WHERE referring_doctor_id = $1
              AND channel = 'InApp'
              AND is_read = FALSE
        `, [req.user.doctorId]);
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        next(error);
    }
};

const acknowledgeCriticalResult = (db) => async (req, res, next) => {
    try {
        const doctorId = req.user?.doctorId;
        const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : null;
        if (notes && notes.length > 2000) {
            return next(new AppError('Acknowledgement notes must be 2000 characters or fewer', 422));
        }

        const result = await db.query(`
            UPDATE critical_result_acknowledgements cra
            SET status = 'Acknowledged',
                acknowledged_at = COALESCE(cra.acknowledged_at, CURRENT_TIMESTAMP),
                acknowledged_by_doctor_id = COALESCE(cra.acknowledged_by_doctor_id, $2),
                notes = CASE WHEN cra.status = 'Pending' THEN NULLIF($3, '') ELSE cra.notes END,
                updated_at = CURRENT_TIMESTAMP
            FROM examinations e
            WHERE cra.exam_id = $1
              AND cra.exam_id = e.exam_id
              AND e.critical_result = TRUE
              AND cra.referring_doctor_id = $2
            RETURNING cra.acknowledgement_id, cra.exam_id, cra.recipient_role,
                      cra.status, cra.acknowledged_at, cra.notes
        `, [req.params.id, doctorId, notes || null]);

        if (result.rows.length === 0) {
            return next(new AppError('Critical-result acknowledgement is not assigned to this doctor', 404));
        }

        await db.query(`
            UPDATE critical_result_acknowledgements
            SET status = 'Superseded', updated_at = NOW()
            WHERE exam_id = $1
              AND acknowledgement_id <> $2
              AND status = 'Pending'
        `, [req.params.id, result.rows[0].acknowledgement_id]);
        await db.query(`
            UPDATE notification_jobs
            SET status = 'Cancelled', processed_at = NOW(), next_retry_at = NULL,
                locked_at = NULL, locked_by = NULL,
                error_message = 'Critical result was acknowledged'
            WHERE entity_type = 'Exam' AND entity_id = $1
                            AND event_type IN ('CriticalResultFinalized', 'CriticalResultEscalated')
              AND status IN ('Pending', 'Processing')
        `, [req.params.id]);

        await logAction(db, {
            userId: null,
            action: 'CRITICAL_RESULT_ACKNOWLEDGED',
            resourceId: req.params.id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: { acknowledgementId: result.rows[0].acknowledgement_id, doctorId },
            required: true
        });

        res.json({ success: true, acknowledgement: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    doctorLogin,
    setPortalPassword,
    getDoctorCases,
    getDoctorReport,
    getDoctorReportPdf,
    createDoctorOrder,
    getMessages,
    sendMessage,
    getUnreadMessageCount,
    getMyNotifications,
    getMyNotificationUnreadCount,
    markMyNotificationRead,
    markAllMyNotificationsRead,
    acknowledgeCriticalResult
};
