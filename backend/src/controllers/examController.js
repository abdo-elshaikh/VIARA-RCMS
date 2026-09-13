const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const { buildReportHtml } = require('../services/pdfService').default;
const { buildReportPdf, cleanFilenamePart } = require('../services/reportPdfRenderer');
const settingsService = require('../services/settingsService');
const { triggerEvent } = require('../services/notificationJobService');
const { logAction } = require('../services/auditService');
const { decrypt } = require('../utils/crypto');
const aiReportService = require('../services/aiReportService');
const { getReportStatusForSave, getReportTransitionError } = require('../utils/reportWorkflow');

const parseJSONSafe = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
};

const buildReportContent = (sections = {}, fallback = '') => {
    if (fallback) return fallback;

    return [
        sections.clinicalHistory && `Clinical History\n${sections.clinicalHistory}`,
        sections.technique && `Technique\n${sections.technique}`,
        sections.findings && `Findings\n${sections.findings}`,
        sections.impression && `Impression\n${sections.impression}`,
        sections.recommendations && `Recommendations\n${sections.recommendations}`
    ].filter(Boolean).join('\n\n');
};

const extractReceiptLookupCode = (rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value) return '';

    try {
        const parsed = new URL(value);
        for (const key of ['receipt', 'receiptNumber', 'invoice', 'invoiceNumber', 'order', 'orderNumber', 'examId', 'id']) {
            const candidate = parsed.searchParams.get(key);
            if (candidate) return candidate.trim();
        }
        const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
        if (lastSegment) return decodeURIComponent(lastSegment).trim();
    } catch {
        // Plain scanner text; parse below.
    }

    const match = value.match(/(RCT-\d{8}-[A-Z0-9]+|INV-\d{8}-[A-Z0-9]+|ORD-\d{8}-[A-Z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
    return (match?.[1] || value).trim();
};

const roleHasAnyPermission = async (client, role, permissionNames = []) => {
    if (!role || !Array.isArray(permissionNames) || permissionNames.length === 0) return false;
    const result = await client.query(`
        SELECT 1
        FROM role_permissions rp
        JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE rp.role_name = $1
            AND p.name = ANY($2::text[])
        LIMIT 1
    `, [role, permissionNames]);
    return result.rows.length > 0;
};

const addReportVersion = async (db, {
    examId,
    reportStatus,
    reportContent,
    reportSections,
    amendmentReason,
    userId
}) => {
    const nextVersion = await db.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 as version_number FROM report_versions WHERE exam_id = $1',
        [examId]
    );

    const versionNum = nextVersion?.rows?.[0]?.version_number || 1;

    await db.query(`
        INSERT INTO report_versions (
            exam_id, version_number, report_status, report_content,
            report_sections, amendment_reason, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
        examId,
        versionNum,
        reportStatus,
        reportContent || null,
        reportSections || {},
        amendmentReason || null,
        userId
    ]);
};

const getWorklist = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const { role } = req.user;
        const { status, modalityType, priority, date, scope = 'all' } = req.query;
        // Clamp pagination so a hostile/buggy client cannot pull the entire table.
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
        const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

        const assignmentColumn = role === 'Technician'
            ? 'a.technician_id'
            : role === 'Nurse'
                ? 'a.nurse_id'
                : role === 'Radiologist'
                    ? 'e.performing_radiologist_id'
                    : null;
        const roleStation = role === 'Technician' ? 'Modality'
            : role === 'Nurse' ? 'Nurse'
                : role === 'Radiologist' ? 'Radiologist' : null;
        const values = [];
        let param = 1;
        let assignmentPredicate;

        if (assignmentColumn) {
            if (scope === 'mine') {
                assignmentPredicate = `${assignmentColumn} = $${param++}`;
                values.push(userId);
            } else if (scope === 'available') {
                assignmentPredicate = `${assignmentColumn} IS NULL`;
            } else {
                assignmentPredicate = `(${assignmentColumn} = $${param++} OR ${assignmentColumn} IS NULL)`;
                values.push(userId);
            }
        } else {
            assignmentPredicate = `(
                e.current_station NOT IN ('Nurse', 'Modality', 'Radiologist')
                OR (e.current_station = 'Nurse' AND a.nurse_id IS NULL)
                OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
                OR (e.current_station = 'Radiologist' AND e.performing_radiologist_id IS NULL)
            )`;
        }

        let query = `
          SELECT e.exam_id, e.appointment_id, e.status, e.created_at, e.report_content,
                 e.report_status, e.report_sections, e.template_id, e.typist_id, e.typed_at,
                 e.reviewed_by, e.reviewed_at, e.approved_by, e.approved_at,
                 e.digital_signature_name, e.digital_signature_role, e.digital_signature_hash,
                 e.report_locked, e.report_locked_at, e.amendment_reason, e.amended_at,
                 e.order_number, e.priority, e.queue_stage, e.current_station, e.is_on_hold,
                 e.arrived_at, e.prep_started_at, e.prep_completed_at, e.exam_started_at,
                 e.exam_completed_at, e.reporting_started_at, e.delivered_at,
                 e.clinical_indication, e.provisional_diagnosis,
                 e.icd_code, e.body_part, e.contrast_required, e.pregnancy_safety_status,
                 e.implant_safety_status, e.renal_safety_status,
                 e.is_follow_up, e.prior_exam_id, e.follow_up_reason,
                 a.start_time, a.end_time, a.preparation_status,
                 a.nurse_id, a.nurse_assigned_at, a.nurse_task_started_at, a.nurse_assignment_version,
                 a.technician_id, a.technician_assigned_at, a.technician_task_started_at, a.technician_assignment_version,
                 e.performing_radiologist_id, e.radiologist_assigned_at, e.radiologist_task_started_at, e.radiologist_assignment_version,
                 CASE e.current_station
                   WHEN 'Nurse' THEN a.nurse_id
                   WHEN 'Modality' THEN a.technician_id
                   WHEN 'Radiologist' THEN e.performing_radiologist_id
                   ELSE NULL
                 END AS task_assignee_id,
                 CASE e.current_station
                   WHEN 'Nurse' THEN a.nurse_assigned_at
                   WHEN 'Modality' THEN a.technician_assigned_at
                   WHEN 'Radiologist' THEN e.radiologist_assigned_at
                   ELSE NULL
                 END AS task_assigned_at,
                 CASE e.current_station
                   WHEN 'Nurse' THEN a.nurse_task_started_at
                   WHEN 'Modality' THEN a.technician_task_started_at
                   WHEN 'Radiologist' THEN e.radiologist_task_started_at
                   ELSE NULL
                 END AS task_started_at,
                 et.name as exam_type_name, et.preparation_instructions,
                 p.mrn, p.gender, p.first_name_enc, p.last_name_enc,
                 m.name as modality_name, m.type as modality_type,
                 rad.full_name AS radiologist_name,
                 prior_e.order_number AS prior_order_number,
                 prior_e.status AS prior_exam_status,
                 prior_e.report_status AS prior_report_status,
                 COALESCE(prior_a.start_time, prior_e.created_at) AS prior_exam_time,
                 prior_et.name AS prior_exam_type_name,
                 prior_m.name AS prior_modality_name
          FROM examinations e
          JOIN appointments a ON e.appointment_id = a.appointment_id
          JOIN patients p ON e.patient_id = p.patient_id
          JOIN modalities m ON e.modality_id = m.modality_id
          LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
          LEFT JOIN users rad ON e.performing_radiologist_id = rad.user_id
          LEFT JOIN examinations prior_e ON prior_e.exam_id = e.prior_exam_id
          LEFT JOIN appointments prior_a ON prior_a.appointment_id = prior_e.appointment_id
          LEFT JOIN examination_types prior_et ON prior_et.type_id = prior_e.exam_type_id
          LEFT JOIN modalities prior_m ON prior_m.modality_id = prior_e.modality_id
           WHERE ${assignmentPredicate}
           ${roleStation ? `AND e.current_station = '${roleStation}'` : ''}
        `;

        if (status) {
            query += ` AND e.status = $${param++}`;
            values.push(status);
        } else {
            query += ` AND e.status != 'Finalized'`;
        }

        if (modalityType) {
            query += ` AND m.type = $${param++}`;
            values.push(modalityType);
        }

        if (priority) {
            query += ` AND e.priority = $${param++}`;
            values.push(priority);
        }

        if (date) {
            query += ` AND e.created_at >= $${param}::date AND e.created_at < ($${param}::date + '1 day'::interval)`;
            values.push(date);
            param++;
        }

        query += ` ORDER BY CASE e.priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END, e.created_at ASC LIMIT $${param++} OFFSET $${param}`;
        values.push(limit, offset);

        const result = await db.query(query, values);

        const mappedRows = result.rows.map(row => {
            const mapped = { ...row };
            mapped.assignment_status = !row.task_assignee_id
                ? 'Unassigned'
                : row.is_on_hold
                    ? 'On Hold'
                    : row.task_started_at
                        ? 'In Progress'
                        : 'Assigned';
            mapped.is_assigned_to_me = String(row.task_assignee_id || '') === String(userId);
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

const buildCaseReportFilters = (req) => {
    const filters = {
        search: String(req.query.search || '').trim(),
        reportStatus: String(req.query.reportStatus || '').trim(),
        status: String(req.query.status || '').trim(),
        priority: String(req.query.priority || '').trim(),
        modality: String(req.query.modality || '').trim(),
        radiologistId: String(req.query.radiologistId || '').trim(),
        dateFrom: String(req.query.dateFrom || '').trim(),
        dateTo: String(req.query.dateTo || '').trim(),
        delivered: String(req.query.delivered || '').trim(),
        hasReport: String(req.query.hasReport || '').trim(),
        receipt: String(req.query.receipt || '').trim(),
        queue: String(req.query.queue || '').trim(),
        limit: Math.min(Math.max(Number(req.query.limit || 100), 1), 500),
        offset: Math.max(Number(req.query.offset || 0), 0)
    };
    return filters;
};

const appendCaseReportAccessPredicate = (role, userId, values, where) => {
    if (role === 'Radiologist') {
        values.push(userId);
        const param = values.length;
        where.push(`(e.performing_radiologist_id = $${param} OR (e.current_station = 'Radiologist' AND e.performing_radiologist_id IS NULL))`);
    } else if (role === 'Technician') {
        values.push(userId);
        const param = values.length;
        where.push(`(a.technician_id = $${param} OR (e.current_station = 'Modality' AND a.technician_id IS NULL))`);
    } else if (role === 'Nurse') {
        values.push(userId);
        const param = values.length;
        where.push(`(a.nurse_id = $${param} OR (e.current_station = 'Nurse' AND a.nurse_id IS NULL))`);
    } else if (['Developer', 'Admin', 'Receptionist'].includes(role)) {
        where.push(`(
            e.current_station NOT IN ('Nurse', 'Modality', 'Radiologist')
            OR (e.current_station = 'Nurse' AND a.nurse_id IS NULL)
            OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
            OR (e.current_station = 'Radiologist' AND e.performing_radiologist_id IS NULL)
        )`);
    } else {
        where.push('FALSE');
    }
};

const getCaseReports = (db) => async (req, res, next) => {
    try {
        const filters = buildCaseReportFilters(req);
        const values = [];
        const where = ['1 = 1'];
        appendCaseReportAccessPredicate(req.user.role, req.user.user_id, values, where);

        const addValue = (value) => {
            values.push(value);
            return `$${values.length}`;
        };

        if (filters.search) {
            const param = addValue(`%${filters.search}%`);
            where.push(`(
                e.order_number ILIKE ${param}
                OR p.mrn ILIKE ${param}
                OR et.name ILIKE ${param}
                OR m.name ILIKE ${param}
                OR rad.full_name ILIKE ${param}
                OR i.invoice_number ILIKE ${param}
                OR pay.receipt_number ILIKE ${param}
                OR e.exam_id::text ILIKE ${param}
            )`);
        }
        if (filters.reportStatus) where.push(`e.report_status = ${addValue(filters.reportStatus)}`);
        if (filters.status) where.push(`e.status = ${addValue(filters.status)}::exam_status`);
        if (filters.priority) where.push(`e.priority = ${addValue(filters.priority)}`);
        if (filters.modality) where.push(`m.name = ${addValue(filters.modality)}`);
        if (filters.radiologistId) where.push(`e.performing_radiologist_id = ${addValue(filters.radiologistId)}::uuid`);
        if (filters.dateFrom) where.push(`a.start_time >= ${addValue(filters.dateFrom)}::date`);
        if (filters.dateTo) where.push(`a.start_time < (${addValue(filters.dateTo)}::date + interval '1 day')`);
        if (filters.delivered === 'yes') where.push('e.delivered_at IS NOT NULL');
        if (filters.delivered === 'no') where.push('e.delivered_at IS NULL');
        if (filters.hasReport === 'yes') where.push(`COALESCE(e.report_content, '') <> ''`);
        if (filters.hasReport === 'no') where.push(`COALESCE(e.report_content, '') = ''`);
        if (filters.receipt) {
            const param = addValue(filters.receipt);
            where.push(`(pay.receipt_number = ${param} OR i.invoice_number = ${param} OR e.order_number = ${param} OR e.exam_id::text = ${param})`);
        }
        if (filters.queue === 'pending') {
            where.push(`(e.report_status IS NULL OR e.report_status NOT IN ('Finalized', 'Amended'))`);
        } else if (filters.queue === 'finalized') {
            where.push(`e.report_status IN ('Finalized', 'Amended')`);
        } else if (filters.queue === 'notDelivered') {
            where.push(`e.report_status IN ('Finalized', 'Amended') AND e.delivered_at IS NULL AND last_delivery.delivery_status IS NULL`);
        } else if (filters.queue === 'urgent') {
            where.push(`e.priority IN ('Emergency', 'Urgent')`);
        } else if (filters.queue === 'today') {
            where.push(`a.start_time >= CURRENT_DATE AND a.start_time < CURRENT_DATE + interval '1 day'`);
        }

        const limitParam = addValue(filters.limit);
        const offsetParam = addValue(filters.offset);

        const query = `
            WITH report_rows AS (
                SELECT e.exam_id, e.appointment_id, e.patient_id, e.status, e.created_at,
                       e.report_content, e.report_status, e.report_sections, e.template_id,
                       e.report_locked, e.report_locked_at, e.report_finalized_at,
                       e.amended_at, e.delivered_at, e.order_number, e.priority,
                       e.queue_stage, e.current_station, e.clinical_indication,
                       e.provisional_diagnosis, e.icd_code, e.body_part, e.contrast_required,
                       a.start_time, a.end_time,
                       p.mrn, p.gender, p.date_of_birth_enc,
                       p.first_name_enc, p.last_name_enc, p.communication_preference,
                       p.consent_email, p.consent_sms, p.consent_whatsapp,
                       m.name AS modality_name, m.type AS modality_type, m.room_number,
                       et.name AS exam_type_name,
                       rad.full_name AS radiologist_name,
                       COALESCE(rd.full_name, a.referring_doctor) AS referring_doctor_name,
                       tech.full_name AS technician_name,
                       nurse.full_name AS nurse_name,
                       i.invoice_id, i.invoice_number, i.invoice_status,
                       pay.receipt_number,
                       last_delivery.delivery_method AS last_delivery_method,
                       last_delivery.delivery_status AS last_delivery_status,
                       last_delivery.delivered_at AS last_delivery_at,
                       COUNT(*) FILTER (WHERE e.report_status IN ('Finalized', 'Amended')) OVER() AS finalized_count,
                       COUNT(*) FILTER (WHERE e.report_status NOT IN ('Finalized', 'Amended') OR e.report_status IS NULL) OVER() AS pending_count,
                       COUNT(*) FILTER (WHERE e.delivered_at IS NOT NULL OR last_delivery.delivery_status IS NOT NULL) OVER() AS delivered_count,
                       COUNT(*) OVER() AS total_count
                FROM examinations e
                JOIN appointments a ON e.appointment_id = a.appointment_id
                JOIN patients p ON e.patient_id = p.patient_id
                JOIN modalities m ON e.modality_id = m.modality_id
                LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
                LEFT JOIN users rad ON e.performing_radiologist_id = rad.user_id
                LEFT JOIN users tech ON a.technician_id = tech.user_id
                LEFT JOIN users nurse ON a.nurse_id = nurse.user_id
                LEFT JOIN referring_doctors rd ON e.external_referring_doctor_id = rd.doctor_id
                LEFT JOIN invoices i ON (i.exam_id = e.exam_id OR (i.exam_id IS NULL AND i.appointment_id = e.appointment_id))
                LEFT JOIN LATERAL (
                    SELECT pmt.receipt_number
                    FROM payments pmt
                    WHERE pmt.invoice_id = i.invoice_id
                    ORDER BY pmt.transaction_date DESC
                    LIMIT 1
                ) pay ON TRUE
                LEFT JOIN LATERAL (
                    SELECT rdv.delivery_method, rdv.delivery_status, COALESCE(rdv.delivered_at, rdv.created_at) AS delivered_at
                    FROM result_deliveries rdv
                    WHERE rdv.exam_id = e.exam_id
                    ORDER BY COALESCE(rdv.delivered_at, rdv.created_at) DESC
                    LIMIT 1
                ) last_delivery ON TRUE
                WHERE ${where.join(' AND ')}
            )
            SELECT *
            FROM report_rows
            ORDER BY
                CASE priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END,
                COALESCE(report_finalized_at, start_time, created_at) DESC
            LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        const result = await db.query(query, values);
        const items = result.rows.map((row) => {
            const mapped = {
                ...row,
                patient_name: [decrypt(row.first_name_enc), decrypt(row.last_name_enc)].filter(Boolean).join(' '),
                date_of_birth: decrypt(row.date_of_birth_enc),
            };
            // Strip all PII fields — patient contact details are not needed for the
            // case-reports list view and must not be sent to avoid PHI exposure.
            delete mapped.first_name_enc;
            delete mapped.last_name_enc;
            delete mapped.date_of_birth_enc;
            delete mapped.phone_enc;
            delete mapped.patient_phone;   // decrypted phone — not needed in list
            delete mapped.patient_email_enc; // encrypted email — still PHI in transit
            return mapped;
        });

        const summary = {
            total: Number(result.rows[0]?.total_count || 0),
            finalized: Number(result.rows[0]?.finalized_count || 0),
            pending: Number(result.rows[0]?.pending_count || 0),
            delivered: Number(result.rows[0]?.delivered_count || 0)
        };

        res.json({ items, summary, limit: filters.limit, offset: filters.offset });
    } catch (error) {
        next(error);
    }
};

const lookupCaseReport = (db) => async (req, res, next) => {
    try {
        const code = String(req.query.code || '').trim();
        if (!code) return next(new AppError('Receipt, invoice, order number, or exam ID is required', 400));
        req.query = { ...req.query, search: '', receipt: extractReceiptLookupCode(code), limit: 1, offset: 0 };
        return getCaseReports(db)(req, res, next);
    } catch (error) {
        next(error);
    }
};

const getExamById = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
            return next(new AppError('Invalid exam ID', 400));
        }

        const result = await db.query(`
            SELECT e.*,
                   a.start_time, a.end_time, a.preparation_status, a.notes AS appointment_notes,
                   p.mrn, p.gender, p.first_name_enc, p.last_name_enc, p.date_of_birth_enc,
                   p.allergies_enc, p.chronic_diseases_enc,
                   m.name AS modality_name, m.type AS modality_type, m.room_number,
                   et.name AS exam_type_name, et.preparation_instructions,
                   tech.full_name AS technician_name,
                   nurse.full_name AS nurse_name,
                   rad.full_name AS radiologist_name,
                   COALESCE(rd.full_name, a.referring_doctor) AS referring_doctor_name,
                   prior_e.order_number AS prior_order_number,
                   prior_e.status AS prior_exam_status,
                   prior_e.report_status AS prior_report_status,
                   prior_e.report_sections AS prior_report_sections,
                   prior_e.report_content AS prior_report_content,
                   COALESCE(prior_a.start_time, prior_e.created_at) AS prior_exam_time,
                   prior_et.name AS prior_exam_type_name,
                   prior_m.name AS prior_modality_name,
                   prior_m.type AS prior_modality_type
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.appointment_id
            JOIN patients p ON e.patient_id = p.patient_id
            JOIN modalities m ON e.modality_id = m.modality_id
            LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
            LEFT JOIN users tech ON a.technician_id = tech.user_id
            LEFT JOIN users nurse ON a.nurse_id = nurse.user_id
            LEFT JOIN users rad ON e.performing_radiologist_id = rad.user_id
            LEFT JOIN referring_doctors rd ON e.external_referring_doctor_id = rd.doctor_id
            LEFT JOIN examinations prior_e ON prior_e.exam_id = e.prior_exam_id
            LEFT JOIN appointments prior_a ON prior_a.appointment_id = prior_e.appointment_id
            LEFT JOIN examination_types prior_et ON prior_et.type_id = prior_e.exam_type_id
            LEFT JOIN modalities prior_m ON prior_m.modality_id = prior_e.modality_id
             WHERE e.exam_id = $1
               AND (
                   ($2::text = 'Radiologist' AND e.performing_radiologist_id = $3)
                   OR $4::boolean
               )
        `, [
            id,
            req.user.role,
            req.user.user_id,
            Boolean(req.user.emergencyAccessId
                && Array.isArray(req.user.elevatedPermissions)
                && req.user.elevatedPermissions.includes('VIEW_EXAMS')
                && Number(req.user.breakGlassExpiry) > Date.now())
        ]);

        if (result.rows.length === 0) {
            return next(new AppError('Exam not found or you are not authorized to view it', 404));
        }

        const row = result.rows[0];
        const exam = {
            ...row,
            patient_name: [decrypt(row.first_name_enc), decrypt(row.last_name_enc)].filter(Boolean).join(' '),
            date_of_birth: decrypt(row.date_of_birth_enc),
            allergies: decrypt(row.allergies_enc),
            chronic_diseases: decrypt(row.chronic_diseases_enc)
        };
        delete exam.first_name_enc;
        delete exam.last_name_enc;
        delete exam.date_of_birth_enc;
        delete exam.allergies_enc;
        delete exam.chronic_diseases_enc;

        res.json(exam);
    } catch (error) {
        next(error);
    }
};

const updateReport = (db) => async (req, res, next) => {
    let client;
    let committed = false;
    let patientPortalRelease = null;
    let criticalAcknowledgements = [];
    try {
        const { examId, status, reportContent, findings, impression, sections, templateId, reportStatus, criticalResult } = req.body;
        const userId = req.user.user_id;
        const { role } = req.user;
        const isRadiologist = role === 'Radiologist';
        const criticalResultProvided = Object.prototype.hasOwnProperty.call(req.body, 'criticalResult');

        if (criticalResultProvided && typeof criticalResult !== 'boolean') {
            return next(new AppError('criticalResult must be a boolean', 400));
        }

        if (!isRadiologist) {
            const attemptedReportEdit = [reportContent, findings, impression, sections, templateId, reportStatus, criticalResult]
                .some(value => value !== undefined);
            if (attemptedReportEdit || status === 'Finalized') {
                return next(new AppError('Only a radiologist may edit or finalize a diagnostic report', 403));
            }
            const permittedStatuses = role === 'Technician'
                ? ['Scanning', 'Reporting']
                : ['Checked-in', 'Scanning'];
            if (!status || !permittedStatuses.includes(status)) {
                return next(new AppError('Status transition is not permitted for this role', 403));
            }
        }

        const assignmentPredicate = role === 'Technician'
            ? 'a.technician_id = $2'
            : role === 'Nurse'
                ? 'a.nurse_id = $2'
                : 'e.performing_radiologist_id = $2';

        client = await db.connect();
        await client.query('BEGIN');

        const checkQuery = `
            SELECT e.status, e.appointment_id, e.report_locked, e.report_sections,
                    e.report_content, e.report_status, e.critical_result,
                    e.order_number,
                    COALESCE(e.external_referring_doctor_id, a.referring_doctor_id) AS referring_doctor_id
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.appointment_id
            WHERE e.exam_id = $1 AND ${assignmentPredicate}
            FOR UPDATE
        `;
        const checkResult = await client.query(checkQuery, [examId, userId]);

        if (checkResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Exam not found or assigned to another user', 404));
        }

        if (checkResult.rows[0].report_locked) {
            await client.query('ROLLBACK');
            return next(new AppError('Report is already finalized', 400));
        }

        const nextSections = {
            ...(checkResult.rows[0].report_sections || {}),
            ...(isRadiologist ? (sections || {}) : {}),
            ...(isRadiologist && findings ? { findings } : {}),
            ...(isRadiologist && impression ? { impression } : {})
        };
        const mergedReportContent = isRadiologist ? buildReportContent(nextSections, reportContent) : null;
        const newStatus = status || (mergedReportContent ? 'Reporting' : checkResult.rows[0].status);
        const currentReportStatus = checkResult.rows[0].report_status || 'Draft';
        const newReportStatus = isRadiologist
            ? (newStatus === 'Finalized'
                ? 'Finalized'
                : reportStatus || (mergedReportContent
                    ? getReportStatusForSave(currentReportStatus)
                    : currentReportStatus))
            : currentReportStatus;

        if (criticalResultProvided && newStatus !== 'Finalized') {
            await client.query('ROLLBACK');
            return next(new AppError('criticalResult may only be explicitly set while finalizing a report', 422));
        }

        if (newStatus === 'Finalized') {
            const hasFindings = typeof nextSections.findings === 'string' && nextSections.findings.trim().length > 0;
            const hasImpression = typeof nextSections.impression === 'string' && nextSections.impression.trim().length > 0;
            if (!hasFindings || !hasImpression) {
                await client.query('ROLLBACK');
                return next(new AppError('Findings and impression are required before finalizing a report', 422));
            }
        }

        if (isRadiologist) {
            const transitionError = getReportTransitionError(
                currentReportStatus,
                newReportStatus,
                { finalizing: newStatus === 'Finalized' }
            );
            if (transitionError) {
                await client.query('ROLLBACK');
                return next(new AppError(transitionError, 409));
            }
        }
        const signatureHash = newStatus === 'Finalized'
            ? crypto.createHash('sha256').update(`${examId}:${userId}:${mergedReportContent}:${Date.now()}`).digest('hex')
            : null;
        const queueStage = newStatus === 'Finalized' ? 'Finalized'
            : newStatus === 'Reporting' ? 'Reporting'
                : newStatus === 'Scanning' ? 'In Exam'
                    : newStatus === 'Checked-in' ? 'Ready for Exam'
                        : 'Scheduled';
        const currentStation = newStatus === 'Finalized' ? 'Delivery'
            : newStatus === 'Reporting' ? 'Radiologist'
                : newStatus === 'Scanning' ? 'Modality'
                    : newStatus === 'Checked-in' ? 'Modality'
                        : 'Reception';

        // All writes are atomic inside a single transaction
        const updateQuery = `
        UPDATE examinations 
        SET report_content = COALESCE($1, report_content), 
            status = $2::exam_status,
            queue_stage = $4,
            current_station = $5,
            report_sections = COALESCE($6, report_sections),
            template_id = COALESCE($7, template_id),
            report_status = $8::VARCHAR(30),
            typist_id = CASE WHEN $8::VARCHAR(30) = 'Typed' THEN COALESCE(typist_id, $9) ELSE typist_id END,
            typed_at = CASE WHEN $8::VARCHAR(30) = 'Typed' THEN COALESCE(typed_at, NOW()) ELSE typed_at END,
            reviewed_by = CASE WHEN $8::VARCHAR(30) IN ('Reviewed', 'Approved', 'Finalized') THEN COALESCE(reviewed_by, $9) ELSE reviewed_by END,
            reviewed_at = CASE WHEN $8::VARCHAR(30) IN ('Reviewed', 'Approved', 'Finalized') THEN COALESCE(reviewed_at, NOW()) ELSE reviewed_at END,
            approved_by = CASE WHEN $8::VARCHAR(30) IN ('Approved', 'Finalized') THEN COALESCE(approved_by, $9) ELSE approved_by END,
            approved_at = CASE WHEN $8::VARCHAR(30) IN ('Approved', 'Finalized') THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
            digital_signature_name = CASE WHEN $2::exam_status = 'Finalized' THEN $10 ELSE digital_signature_name END,
            digital_signature_role = CASE WHEN $2::exam_status = 'Finalized' THEN $11 ELSE digital_signature_role END,
            digital_signature_hash = CASE WHEN $2::exam_status = 'Finalized' THEN $12 ELSE digital_signature_hash END,
            report_locked = CASE WHEN $2::exam_status = 'Finalized' THEN TRUE ELSE report_locked END,
            report_locked_at = CASE WHEN $2::exam_status = 'Finalized' THEN COALESCE(report_locked_at, NOW()) ELSE report_locked_at END,
            performing_radiologist_id = CASE WHEN $13::boolean THEN COALESCE(performing_radiologist_id, $9) ELSE performing_radiologist_id END,
            radiologist_task_started_at = CASE WHEN $13::boolean THEN COALESCE(radiologist_task_started_at, NOW()) ELSE radiologist_task_started_at END,
            critical_result = CASE WHEN $14::boolean IS NULL THEN critical_result ELSE $14::boolean END,
            critical_result_marked_at = CASE
                WHEN $14::boolean = TRUE THEN COALESCE(critical_result_marked_at, NOW())
                WHEN $14::boolean = FALSE THEN NULL
                ELSE critical_result_marked_at
            END,
            critical_result_marked_by = CASE
                WHEN $14::boolean = TRUE THEN COALESCE(critical_result_marked_by, $9)
                WHEN $14::boolean = FALSE THEN NULL
                ELSE critical_result_marked_by
            END,
            exam_started_at = CASE WHEN $2::exam_status = 'Scanning' THEN COALESCE(exam_started_at, NOW()) ELSE exam_started_at END,
            exam_completed_at = CASE WHEN $2::exam_status = 'Reporting' THEN COALESCE(exam_completed_at, NOW()) ELSE exam_completed_at END,
            reporting_started_at = CASE WHEN $2::exam_status = 'Reporting' THEN COALESCE(reporting_started_at, NOW()) ELSE reporting_started_at END,
            report_finalized_at = CASE WHEN $2::exam_status = 'Finalized' THEN NOW() ELSE report_finalized_at END
        WHERE exam_id = $3
        RETURNING *
    `;

        const result = await client.query(updateQuery, [
            mergedReportContent || null,
            newStatus,
            examId,
            queueStage,
            currentStation,
            isRadiologist && Object.keys(nextSections).length ? nextSections : null,
            isRadiologist ? (templateId || null) : null,
            newReportStatus,
            userId,
            req.user.name || req.user.full_name || 'Signed Radiologist',
            role,
            signatureHash,
            isRadiologist,
            criticalResultProvided ? criticalResult : null
        ]);

        if (isRadiologist) {
            await client.query(`
                UPDATE appointments
                SET radiologist_id = COALESCE(radiologist_id, $2)
                WHERE appointment_id = $1
            `, [checkResult.rows[0].appointment_id, userId]);
        }

        if (mergedReportContent) {
            await addReportVersion(client, {
                examId,
                reportStatus: newReportStatus,
                reportContent: mergedReportContent,
                reportSections: nextSections,
                userId
            });
        }

        if (checkResult.rows[0].status !== newStatus) {
            await client.query(`
                INSERT INTO order_status_history (
                    appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by
                )
                VALUES ($1, $2, $3, $4, 'ExamStatusChanged', $5, $6)
            `, [
                checkResult.rows[0].appointment_id,
                examId,
                checkResult.rows[0].status,
                newStatus,
                mergedReportContent ? 'Report content updated' : null,
                userId
            ]);

            await client.query(`
                INSERT INTO queue_events (
                    exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                    event_type, notes, changed_by
                )
                VALUES ($1, $2, $3, $4, NULL, $5, 'ExamStatusSync', $6, $7)
            `, [
                examId,
                checkResult.rows[0].appointment_id,
                checkResult.rows[0].status,
                queueStage,
                currentStation,
                mergedReportContent ? 'Report content updated' : null,
                userId
            ]);
        }

        if (newStatus === 'Finalized') {
            const releaseResult = await client.query(`
                WITH ready AS (
                    SELECT e.exam_id, e.appointment_id, e.patient_id, e.order_number, p.mrn
                    FROM examinations e
                    JOIN patients p ON p.patient_id = e.patient_id
                    WHERE e.exam_id = $1
                      AND EXISTS (
                          SELECT 1 FROM invoices i
                          WHERE i.invoice_status <> 'Voided'
                            AND (i.exam_id = e.exam_id OR i.appointment_id = e.appointment_id)
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM invoices i
                          WHERE i.invoice_status <> 'Voided'
                            AND (i.exam_id = e.exam_id OR i.appointment_id = e.appointment_id)
                            AND GREATEST(
                                COALESCE(i.patient_payable_amount, 0)
                                - COALESCE((SELECT SUM(pmt.amount) FROM payments pmt
                                            WHERE pmt.invoice_id = i.invoice_id AND pmt.payment_status = 'Completed'), 0)
                                - COALESCE((SELECT SUM(cn.patient_amount) FROM credit_notes cn
                                            WHERE cn.invoice_id = i.invoice_id AND cn.reversed_at IS NULL), 0)
                                + COALESCE((SELECT SUM(r.amount) FROM refunds r
                                            WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0),
                                0
                            ) > 0.005
                      )
                ), inserted AS (
                    INSERT INTO result_deliveries (
                        exam_id, appointment_id, patient_id, delivery_method,
                        recipient_name, delivery_status, delivered_by, notes
                    )
                    SELECT exam_id, appointment_id, patient_id, 'Patient Portal',
                           mrn, 'Delivered', $2, 'Released to patient portal after report finalization and invoice settlement'
                    FROM ready
                    WHERE NOT EXISTS (
                        SELECT 1 FROM result_deliveries rd
                        WHERE rd.exam_id = ready.exam_id
                          AND rd.delivery_method = 'Patient Portal'
                          AND rd.delivery_status = 'Delivered'
                    )
                    RETURNING exam_id
                )
                SELECT ready.exam_id, ready.patient_id, ready.order_number,
                       EXISTS (SELECT 1 FROM inserted) AS newly_released
                FROM ready
            `, [examId, userId]);
            patientPortalRelease = releaseResult.rows[0] || null;
        }

        if (newStatus === 'Finalized' && result.rows[0]?.critical_result) {
            if (checkResult.rows[0].referring_doctor_id) {
                const acknowledgementResult = await client.query(`
                    INSERT INTO critical_result_acknowledgements (
                        exam_id, referring_doctor_id, recipient_role, status, acknowledgement_due_at
                    )
                    VALUES ($1, $2, 'Doctor', 'Pending', NOW() + INTERVAL '15 minutes')
                    ON CONFLICT DO NOTHING
                    RETURNING acknowledgement_id, referring_doctor_id, recipient_role
                `, [examId, checkResult.rows[0].referring_doctor_id]);
                criticalAcknowledgements = acknowledgementResult.rows;
            } else {
                const acknowledgementResult = await client.query(`
                    INSERT INTO critical_result_acknowledgements (
                        exam_id, recipient_user_id, recipient_role, status, acknowledgement_due_at
                    )
                    SELECT $1, u.user_id, 'Admin', 'Pending', NOW() + INTERVAL '15 minutes'
                    FROM users u
                    WHERE u.is_active = TRUE AND u.role = 'Admin'
                    ON CONFLICT DO NOTHING
                    RETURNING acknowledgement_id, recipient_user_id, recipient_role
                `, [examId]);
                criticalAcknowledgements = acknowledgementResult.rows;
            }
        }

        await client.query('COMMIT');
        committed = true;

        if (newStatus === 'Finalized' && result.rows[0]?.critical_result) {
            const criticalMarkedAt = result.rows[0].critical_result_marked_at;
            const basePayload = {
                entityType: 'Exam',
                entityId: examId,
                priority: 'Critical',
                required: true,
                variables: {
                    exam_id: examId,
                    order_number: result.rows[0].order_number || checkResult.rows[0].order_number || '',
                    critical_marked_at: criticalMarkedAt,
                    force_delivery: true
                }
            };
            const notifications = [triggerEvent(db, 'CriticalResultFinalized', {
                ...basePayload,
                staffId: userId,
                staffRole: 'Radiologist',
                occurrenceKey: `${String(criticalMarkedAt)}:finalizer:${userId}`
            })];
            for (const acknowledgement of criticalAcknowledgements) {
                notifications.push(triggerEvent(db, 'CriticalResultFinalized', {
                    ...basePayload,
                    occurrenceKey: acknowledgement.acknowledgement_id,
                    doctorId: acknowledgement.referring_doctor_id || undefined,
                    staffId: acknowledgement.recipient_user_id || undefined,
                    staffRole: acknowledgement.recipient_role || undefined
                }));
            }
            await Promise.allSettled(notifications);
        }

        // Fire notifications outside the transaction (fire-and-forget)
        if (newStatus === 'Finalized') {
            const examInfo = await db.query(
                'SELECT patient_id, order_number, external_referring_doctor_id FROM examinations WHERE exam_id = $1',
                [examId]
            );
            if (examInfo.rows.length > 0) {
                const e = examInfo.rows[0];
                triggerEvent(db, 'ReportReady', {
                    doctorId: e.external_referring_doctor_id,
                    entityType: 'Exam',
                    entityId: examId,
                    channels: ['Email', 'SMS'],
                    variables: { order_number: e.order_number }
                });
            }

            if (patientPortalRelease?.newly_released) {
                triggerEvent(db, 'ReportReady', {
                    patientId: patientPortalRelease.patient_id,
                    entityType: 'Exam',
                    entityId: patientPortalRelease.exam_id,
                    channels: ['Email', 'SMS'],
                    variables: { order_number: patientPortalRelease.order_number || '' }
                }).catch(() => {});
            }

            await logAction(db, {
                userId: req.user?.user_id,
                action: 'REPORT_FINALIZED',
                resourceId: examId,
                resourceTable: 'examinations',
                ipAddress: req.ip,
                details: { status: 'Finalized' }
            });
        }

        if (checkResult.rows[0].status !== newStatus) {
            const examInfo = await db.query(
                'SELECT patient_id, order_number FROM examinations WHERE exam_id = $1',
                [examId]
            );
            triggerEvent(db, 'ExamStatusChanged', {
                patientId: examInfo.rows[0]?.patient_id,
                entityType: 'Exam',
                entityId: examId,
                channels: ['InApp'],
                priority: 'Normal',
                variables: {
                    order_number: examInfo.rows[0]?.order_number || '',
                    old_status: checkResult.rows[0].status,
                    new_status: newStatus,
                    exam_id: examId
                }
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        if (client && !committed) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const acknowledgeCriticalResult = (db) => async (req, res, next) => {
    try {
        const userId = req.user?.user_id;
        const result = await db.query(`
            UPDATE critical_result_acknowledgements cra
            SET status = 'Acknowledged',
                acknowledged_at = COALESCE(cra.acknowledged_at, CURRENT_TIMESTAMP),
                acknowledged_by_user_id = COALESCE(cra.acknowledged_by_user_id, $2),
                notes = CASE
                    WHEN cra.status = 'Pending' THEN NULLIF($3, '')
                    ELSE cra.notes
                END,
                updated_at = CURRENT_TIMESTAMP
            FROM examinations e
            WHERE cra.exam_id = $1
              AND cra.exam_id = e.exam_id
              AND e.critical_result = TRUE
              AND cra.recipient_user_id = $2
            RETURNING cra.acknowledgement_id, cra.exam_id, cra.recipient_role,
                      cra.status, cra.acknowledged_at, cra.notes
        `, [req.params.id, userId, req.body?.notes || null]);

        if (result.rows.length === 0) {
            return next(new AppError('Critical-result acknowledgement is not assigned to this user', 404));
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
              AND event_type = 'CriticalResultEscalated'
              AND status IN ('Pending', 'Processing')
        `, [req.params.id]);

        await logAction(db, {
            userId,
            action: 'CRITICAL_RESULT_ACKNOWLEDGED',
            resourceId: req.params.id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: {
                acknowledgementId: result.rows[0].acknowledgement_id,
                recipientRole: result.rows[0].recipient_role
            },
            required: true
        });

        res.json({ success: true, acknowledgement: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

const getReportPdf = (db) => async (req, res, next) => {
    try {
        const examId = req.params.id;
        const userId = req.user.user_id || req.user.userId || req.user.patient_id || req.user.doctorId || null;
        const userRole = req.user.role || '';

        const result = await db.query(`
            SELECT e.*, p.mrn, p.gender, p.first_name_enc, p.last_name_enc, p.date_of_birth_enc,
                   m.name as modality_name, m.type as modality_type, m.room_number,
                   et.name as exam_type_name, u.full_name as radiologist_name,
                   COALESCE(rd.full_name, appt.referring_doctor) as referring_doctor_name,
                   COALESCE(appt.referring_doctor_id, e.external_referring_doctor_id) AS access_referring_doctor_id,
                   billing.invoice_id AS report_invoice_id,
                   billing.balance_amount AS report_balance_amount
            FROM examinations e
            JOIN patients p ON e.patient_id = p.patient_id
            JOIN modalities m ON e.modality_id = m.modality_id
            LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
            LEFT JOIN users u ON e.performing_radiologist_id = u.user_id
            LEFT JOIN appointments appt ON e.appointment_id = appt.appointment_id
            LEFT JOIN referring_doctors rd ON appt.referring_doctor_id = rd.doctor_id
            LEFT JOIN LATERAL (
                SELECT (ARRAY_AGG(i.invoice_id ORDER BY i.generated_at DESC))[1] AS invoice_id,
                       SUM(GREATEST(
                           COALESCE(i.patient_payable_amount, 0)
                           - COALESCE((SELECT SUM(pmt.amount) FROM payments pmt
                                      WHERE pmt.invoice_id = i.invoice_id AND pmt.payment_status = 'Completed'), 0)
                           - COALESCE((SELECT SUM(cn.patient_amount) FROM credit_notes cn
                                      WHERE cn.invoice_id = i.invoice_id AND cn.reversed_at IS NULL), 0)
                           + COALESCE((SELECT SUM(r.amount) FROM refunds r
                                      WHERE r.invoice_id = i.invoice_id AND r.status = 'Processed'), 0),
                           0
                       )) AS balance_amount
                FROM invoices i
                WHERE i.invoice_status <> 'Voided'
                  AND (i.exam_id = e.exam_id OR i.appointment_id = e.appointment_id)
            ) billing ON TRUE
            WHERE e.exam_id = $1
        `, [examId]);

        if (result.rows.length === 0) {
            return next(new AppError('Exam report not found', 404));
        }

        const rawExam = result.rows[0];
        const isFinalized = ['Finalized', 'Amended'].includes(rawExam.report_status) || rawExam.report_locked || rawExam.status === 'Finalized';

        // Access permissions check
        const hasEmergencyReportAccess = Boolean(req.user.emergencyAccessId
            && Array.isArray(req.user.elevatedPermissions)
            && req.user.elevatedPermissions.includes('VIEW_REPORTS')
            && Number(req.user.breakGlassExpiry) > Date.now());
        const isStaff = ['Admin', 'Developer', 'Receptionist'].includes(userRole)
            || (userRole === 'Radiologist')
            || (Array.isArray(req.grantedPermissions) && req.grantedPermissions.includes('VIEW_REPORTS'))
            || (Array.isArray(req.user?.grantedPermissions) && req.user.grantedPermissions.includes('VIEW_REPORTS'))
            || hasEmergencyReportAccess;
        const isReferringDoctorPortalUser = ['Doctor', 'Referring Doctor', 'Referring_Doctor'].includes(userRole);
        const isReferringDoctorOwner = isReferringDoctorPortalUser
            && rawExam.access_referring_doctor_id === (req.user.doctorId || req.user.doctor_id)
            && isFinalized;
        const isInvoiceSettled = !rawExam.report_invoice_id
            || Number(rawExam.report_balance_amount || 0) <= 0.005;
        const isPatientOwner = userRole === 'Patient'
            && rawExam.patient_id === userId
            && isFinalized
            && isInvoiceSettled;
        const isPublicReportAccess = userRole === 'PublicReport'
            && req.publicReportAccess?.examId === String(rawExam.exam_id)
            && isFinalized
            && isInvoiceSettled;

        if (!isStaff && !isReferringDoctorOwner && !isPatientOwner && !isPublicReportAccess) {
            return next(new AppError('Access denied for this report', 403));
        }

        const firstName = decrypt(rawExam.first_name_enc) || '';
        const lastName = decrypt(rawExam.last_name_enc) || '';
        const dob = decrypt(rawExam.date_of_birth_enc) || '';

        const signatureHash = rawExam.digital_signature_hash || (isFinalized
            ? crypto.createHash('sha256').update(`${rawExam.exam_id}:${rawExam.report_finalized_at || rawExam.updated_at || Date.now()}`).digest('hex').slice(0, 32).toUpperCase()
            : null);

        const report = {
            ...rawExam,
            patient_name: [firstName, lastName].filter(Boolean).join(' ') || 'Patient Record',
            date_of_birth: dob,
            digital_signature_hash: signatureHash,
            digital_signature_name: rawExam.digital_signature_name || rawExam.radiologist_name || 'Radiologist Staff',
            digital_signature_role: rawExam.digital_signature_role || 'Reporting Radiologist'
        };
        delete report.first_name_enc;
        delete report.last_name_enc;
        delete report.date_of_birth_enc;

        const { templateId } = req.query;
        if (templateId) {
            const templateResult = await db.query(`
                SELECT clinical_history, technique, findings, impression, recommendations
                FROM report_templates
                WHERE template_id = $1 AND is_active = TRUE
            `, [templateId]);
            const template = templateResult.rows[0];
            if (template) {
                const currentSections = report.report_sections || {};
                report.report_sections = {
                    clinicalHistory: currentSections.clinicalHistory || report.clinical_indication || template.clinical_history || '',
                    technique: currentSections.technique || template.technique || '',
                    findings: currentSections.findings || template.findings || '',
                    impression: currentSections.impression || template.impression || '',
                    recommendations: currentSections.recommendations || template.recommendations || ''
                };
            }
        }

        const isDoctorPortalUser = ['Doctor', 'Referring Doctor', 'Referring_Doctor'].includes(userRole);
        const method = userRole === 'Patient'
            ? 'Patient Portal'
            : userRole === 'PublicReport'
                ? 'Patient Portal'
            : isDoctorPortalUser
                ? 'Doctor Portal'
                : 'Printed';
        const status = userRole === 'Patient' || userRole === 'PublicReport' || isDoctorPortalUser
            ? 'Accessed'
            : 'Printed';

        await db.query(`
            INSERT INTO result_deliveries (
                exam_id, appointment_id, patient_id, referring_doctor_id,
                delivery_method, recipient_name, delivery_status, delivered_by,
                print_copy_count, notes, access_ip, user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Report print/download access', $10, $11)
        `, [
            report.exam_id,
            report.appointment_id,
            report.patient_id,
            report.external_referring_doctor_id || null,
            method,
            report.mrn || null,
            status,
            req.user?.user_id || null,
            status === 'Printed' ? 1 : 0,
            req.ip || null,
            req.get('user-agent') || null
        ]);

        await logAction(db, {
            userId: req.user?.user_id || req.user?.userId,
            action: userRole === 'PublicReport' ? 'REPORT_PUBLIC_ACCESS' : 'REPORT_PRINT',
            resourceId: report.exam_id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: { role: userRole, method }
        });

        if (userRole === 'Patient' || userRole === 'PublicReport') {
            await db.query(`
                INSERT INTO patient_portal_audit (
                    patient_id, event_type, resource_type, resource_id, details, ip_address, user_agent
                )
                VALUES ($1, $2, 'ExamReport', $3, $4, $5, $6)
            `, [
                report.patient_id,
                userRole === 'PublicReport' ? 'ReportPublicAccessed' : 'ReportDownloaded',
                report.exam_id,
                { orderNumber: report.order_number || null, examType: report.exam_type_name || null },
                req.ip || null,
                req.get('user-agent') || null
            ]);
        }

        const allSettings = await settingsService.getAll();
        const queryText = (value) => {
            if (Array.isArray(value)) return String(value[0] || '').slice(0, 500);
            if (typeof value === 'string') return value.slice(0, 500);
            return undefined;
        };
        const queryFlag = (value, fallback = true) => {
            const normalized = queryText(value);
            if (normalized === undefined) return fallback;
            return normalized.toLowerCase() !== 'false';
        };
        const canCustomizeDocument = !['Patient', 'Doctor', 'Referring Doctor', 'Referring_Doctor', 'PublicReport'].includes(userRole);
        const reportHeader = canCustomizeDocument ? queryText(req.query.reportHeader) : undefined;
        const reportFooter = canCustomizeDocument ? queryText(req.query.reportFooter) : undefined;
        const templateStyle = queryText(req.query.templateStyle || req.query.template || req.query.style);
        const enabledFieldsRaw = queryText(req.query.fields);
        const enabledFields = enabledFieldsRaw ? enabledFieldsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
        const customFields = parseJSONSafe(queryText(req.query.customFields || req.query.extraFields));
        const customLabels = parseJSONSafe(queryText(req.query.customLabels || req.query.labels));
        const customizeParam = queryText(req.query.customize);
        const downloadParam = queryText(req.query.download || req.query.mode);
        const hideCustomizePanel = customizeParam === 'false' || downloadParam === 'true' || downloadParam === 'download' || ['Patient', 'Doctor', 'Referring Doctor', 'Referring_Doctor', 'PublicReport'].includes(userRole);

        const documentSettings = {
            ...allSettings,
            showCustomizePanel: !hideCustomizePanel,
            ...(templateStyle ? { templateStyle } : {}),
            ...(enabledFields ? { enabledFields } : {}),
            ...(customFields ? { customFields } : {}),
            ...(customLabels ? { customLabels } : {}),
            ...(reportHeader !== undefined ? { 'center.report_header': reportHeader, report_header: reportHeader } : {}),
            ...(reportFooter !== undefined ? { 'center.report_footer': reportFooter, report_footer: reportFooter } : {}),
            includeHeader: canCustomizeDocument ? queryFlag(req.query.includeHeader) : true,
            includeFooter: canCustomizeDocument ? queryFlag(req.query.includeFooter) : true,
            includeSignature: canCustomizeDocument ? queryFlag(req.query.includeSignature) : true
        };

        const requestedFormat = String(req.publicReportFormat || req.body?.format || req.query?.format || '').toLowerCase();
        if (requestedFormat === 'pdf') {
            const pdf = await buildReportPdf(report, documentSettings);
            const requestedDisposition = String(req.publicReportDisposition || req.body?.disposition || req.query?.disposition || '').toLowerCase();
            const disposition = requestedDisposition === 'attachment' ? 'attachment' : 'inline';
            const reportId = cleanFilenamePart(report.order_number || report.accession_number || report.mrn || report.exam_id) || 'report';
            const filename = `Diagnostic-Report-${reportId}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Length', String(pdf.length));
            res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
            res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            return res.send(pdf);
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.send(buildReportHtml(report, documentSettings));
    } catch (error) {
        next(error);
    }
};

const amendReport = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const { reason, reportContent, sections } = req.body;

        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM examinations WHERE exam_id = $1 FOR UPDATE', [id]);
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Exam not found', 404));
        }
        if (!existing.rows[0].report_locked) {
            await client.query('ROLLBACK');
            return next(new AppError('Only finalized reports can be amended', 400));
        }

        // Emergency (break-glass) elevation is read-only by design and never includes amendment rights
        if (req.user.emergencyAccessId) {
            await client.query('ROLLBACK');
            return next(new AppError('Emergency access is read-only and does not permit report amendments', 403));
        }

        const isReportOwner = req.user.role === 'Radiologist'
            && String(existing.rows[0].performing_radiologist_id || '') === String(req.user.user_id || '');
        const isDeveloperOrAdmin = ['Developer', 'Admin'].includes(req.user.role);
        const hasAmendPermission = isDeveloperOrAdmin || (await roleHasAnyPermission(client, req.user.role, ['AMEND_FINALIZED_REPORTS']));

        if (!isReportOwner && !hasAmendPermission) {
            await client.query('ROLLBACK');
            return next(new AppError('AMEND_FINALIZED_REPORTS permission is required to amend reports not authored by you', 403));
        }

        const nextSections = {
            ...(existing.rows[0].report_sections || {}),
            ...(sections || {})
        };
        const nextContent = buildReportContent(nextSections, reportContent || existing.rows[0].report_content);

        await addReportVersion(client, {
            examId: id,
            reportStatus: existing.rows[0].report_status || 'Finalized',
            reportContent: existing.rows[0].report_content,
            reportSections: existing.rows[0].report_sections || {},
            amendmentReason: reason,
            userId: req.user.user_id
        });

        const result = await client.query(`
            UPDATE examinations
            SET report_content = $1,
                report_sections = $2,
                report_status = 'Amended',
                status = 'Finalized',
                amendment_reason = $3,
                amended_at = NOW(),
                amended_by = $4,
                report_locked = TRUE,
                report_locked_at = COALESCE(report_locked_at, NOW())
            WHERE exam_id = $5
            RETURNING *
        `, [nextContent, nextSections, reason, req.user.user_id, id]);

        await logAction(client, {
            userId: req.user?.user_id,
            action: 'REPORT_AMEND',
            resourceId: id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: { reason }
        });

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

/**
 * AI-assisted report reformatting. Sends the draft report text to the configured
 * AI provider and returns a polished version for the user to review. Does NOT
 * persist anything — the client decides whether to apply the suggestion.
 */
const improveReportFormat = (db) => async (req, res, next) => {
    try {
        const { reportText, examId, modality, examType, sectionType } = req.body;
        if (examId) {
            const exam = await verifyReportExamAccess(db, examId, req.user);
            if (!exam) return next(new AppError('Exam not found or not assigned to this user', 404));
        }


        const improved = await aiReportService.improveReportFormat({
            reportText,
            modality,
            examType,
            sectionType,
            language: 'en',
        });

        await logAction(db, {
            userId: req.user?.user_id,
            action: 'REPORT_AI_FORMAT',
            resourceId: examId || null,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: { examId: examId || null, sectionType: sectionType || null, language: 'en' }
        });

        res.json({ improved });
    } catch (error) {
        next(error);
    }
};

const verifyReportExamAccess = async (db, examId, user) => {
    // AI-draft authoring is a write-path workflow: emergency (break-glass)
    // elevation is read-only by design and must never unlock it.
    const { rows } = await db.query(
        `SELECT exam_id, performing_radiologist_id, report_locked
         FROM examinations
         WHERE exam_id = $1
           AND ($2::text = 'Radiologist' AND performing_radiologist_id = $3::uuid)
         LIMIT 1`,
        [examId, user.role, user.user_id]
    );
    return rows[0] || null;
};

const listAiReportDrafts = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const exam = await verifyReportExamAccess(db, id, req.user);
        if (!exam) return next(new AppError('Exam not found or not assigned to this user', 404));

        const { rows } = await db.query(
            `SELECT d.draft_id, d.exam_id, d.template_id, rt.name AS template_name,
                     d.provider, d.model, d.language, d.draft_sections AS sections,
                     d.limitations, d.disclaimer, d.status, d.apply_mode,
                     d.applied_at, d.created_at, d.prompt_context,
                    generated.full_name AS generated_by_name,
                    applied.full_name AS applied_by_name
             FROM report_ai_drafts d
             LEFT JOIN report_templates rt ON rt.template_id = d.template_id
             LEFT JOIN users generated ON generated.user_id = d.generated_by
             LEFT JOIN users applied ON applied.user_id = d.applied_by
             WHERE d.exam_id = $1
             ORDER BY d.created_at DESC
             LIMIT 10`,
            [id]
        );

        res.json({ drafts: rows });
    } catch (error) {
        next(error);
    }
};

const generatePreliminaryReportDraft = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const { templateId } = req.body || {};
            const accessibleExam = await verifyReportExamAccess(db, id, req.user);
        if (!accessibleExam) return next(new AppError('Exam not found or not assigned to this user', 404));
        const { rows } = await db.query(
            `SELECT e.exam_id, e.order_number, e.study_instance_uid, e.orthanc_study_id,
                    e.clinical_indication, e.provisional_diagnosis, e.priority,
                    e.body_part, e.contrast_required, e.status, e.report_locked,
                    e.is_follow_up, e.prior_exam_id, e.follow_up_reason,
                    p.gender, p.date_of_birth_enc,
                    m.name AS modality_name, m.type AS modality_type,
                    et.name AS exam_type_name,
                    prior_e.order_number AS prior_order_number,
                    prior_e.report_status AS prior_report_status,
                    prior_e.report_sections AS prior_report_sections,
                    prior_e.report_content AS prior_report_content,
                    COALESCE(prior_a.start_time, prior_e.created_at) AS prior_exam_time,
                    prior_et.name AS prior_exam_type_name,
                    prior_m.name AS prior_modality_name
             FROM examinations e
             JOIN patients p ON p.patient_id = e.patient_id
             LEFT JOIN modalities m ON m.modality_id = e.modality_id
             LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
             LEFT JOIN examinations prior_e ON prior_e.exam_id = e.prior_exam_id
             LEFT JOIN appointments prior_a ON prior_a.appointment_id = prior_e.appointment_id
             LEFT JOIN examination_types prior_et ON prior_et.type_id = prior_e.exam_type_id
             LEFT JOIN modalities prior_m ON prior_m.modality_id = prior_e.modality_id
              WHERE e.exam_id = $1
              LIMIT 1`,
            [id]
        );

        if (!rows.length) return next(new AppError('Exam not found or not assigned to this user', 404));
        const exam = rows[0];
        if (exam.report_locked) return next(new AppError('Cannot generate an AI draft for a finalized locked report', 409));

        const birthDate = exam.date_of_birth_enc ? decrypt(exam.date_of_birth_enc) : null;
        const age = birthDate ? Math.max(0, Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))) : null;
        exam.patient_age = Number.isFinite(age) ? age : null;
        delete exam.date_of_birth_enc;

        let template = null;
        let resolvedTemplateId = templateId || null;
        if (req.body.template) {
            template = {
                name: req.body.template.name || 'Selected Template',
                clinical_history: req.body.template.clinical_history || '',
                technique: req.body.template.technique || '',
                findings: req.body.template.findings || '',
                impression: req.body.template.impression || '',
                recommendations: req.body.template.recommendations || ''
            };
        } else if (templateId) {
            const templateResult = await db.query(
                `SELECT template_id, name, clinical_history, technique, findings, impression, recommendations
                 FROM report_templates
                 WHERE template_id = $1 AND is_active = TRUE
                 LIMIT 1`,
                [templateId]
            );
            template = templateResult.rows[0] || null;
            resolvedTemplateId = template?.template_id || null;
        } else {
            const templateResult = await db.query(
                `SELECT template_id, name, clinical_history, technique, findings, impression, recommendations
                 FROM report_templates
                 WHERE is_active = TRUE
                   AND (
                        exam_type_id = (
                            SELECT exam_type_id FROM examinations WHERE exam_id = $1
                        )
                        OR LOWER(COALESCE(modality_type, '')) = LOWER(COALESCE($2, ''))
                   )
                 ORDER BY is_default DESC, updated_at DESC NULLS LAST, created_at DESC
                 LIMIT 1`,
                [id, exam.modality_type || exam.modality_name || '']
            );
            template = templateResult.rows[0] || null;
            resolvedTemplateId = template?.template_id || null;
        }

        const imagingResult = await db.query(
            `SELECT COUNT(pi.sop_instance_uid)::int AS instance_count,
                    COUNT(DISTINCT ps.series_instance_uid)::int AS series_count,
                    MIN(pi.created_at) AS first_received_at
             FROM pacs_series ps
             LEFT JOIN pacs_instances pi ON pi.series_instance_uid = ps.series_instance_uid
             WHERE ps.study_instance_uid = $1`,
            [exam.study_instance_uid || '']
        );

        const pacsAiResult = await db.query(
            `SELECT result_summary, result_payload
             FROM pacs_ai_analysis_jobs
             WHERE exam_id = $1 AND status = 'Completed'
             ORDER BY completed_at DESC
             LIMIT 1`,
            [id]
        );
        const imageAnalysis = pacsAiResult.rows[0] ? {
            summary: pacsAiResult.rows[0].result_summary,
            payload: pacsAiResult.rows[0].result_payload?.worker || {}
        } : null;

        const draft = await aiReportService.generatePreliminaryDraft({
            exam,
            template,
            imaging: imagingResult.rows[0] || {},
            imageAnalysis,
            language: 'en'
        });
        if (req.requestTimedOut || res.headersSent || res.writableEnded) return;

        const includesStructuredImageAnalysis = imageAnalysis?.payload?.quality?.supported === true;
        const disclaimer = includesStructuredImageAnalysis
            ? 'This preliminary draft includes structured output from a PACS image-analysis worker. Independent radiologist review of every source image is required.'
            : 'AI preliminary draft generated from exam metadata only. Images were not interpreted by this feature and radiologist review is required.';
        const provider = draft.provenance?.provider || process.env.AI_PROVIDER || 'anthropic';
        const model = draft.provenance?.model || process.env.AI_MODEL || null;
        const draftResult = await db.query(
            `INSERT INTO report_ai_drafts (
                exam_id, template_id, generated_by, provider, model, language,
                draft_sections, limitations, disclaimer, prompt_context
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb)
             RETURNING draft_id, created_at`,
            [
                id,
                resolvedTemplateId,
                req.user?.user_id || null,
                provider,
                model,
                'en',
                JSON.stringify(draft.sections),
                JSON.stringify(draft.limitations || []),
                disclaimer,
                JSON.stringify({
                    orderNumber: exam.order_number,
                    modality: exam.modality_type || exam.modality_name || null,
                    examType: exam.exam_type_name || null,
                    template: template?.name || null,
                    imaging: imagingResult.rows[0] || {},
                    imageAnalysis: includesStructuredImageAnalysis ? {
                        model: imageAnalysis.payload?.model || null,
                        quality: imageAnalysis.payload?.quality || null,
                        provenance: imageAnalysis.payload?.provenance || null
                    } : null,
                    draftProvenance: draft.provenance || null
                })
            ]
        );

        await logAction(db, {
            userId: req.user?.user_id,
            action: 'AI_PRELIM_DRAFT_GENERATED',
            resourceId: id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: {
                draftId: draftResult.rows[0]?.draft_id || null,
                model,
                provider,
                template: template?.name || null,
                limitations: draft.limitations
            }
        });

        if (req.requestTimedOut || res.headersSent || res.writableEnded) return;
        res.json({
            success: true,
            draftId: draftResult.rows[0]?.draft_id || null,
            createdAt: draftResult.rows[0]?.created_at || null,
            templateName: template?.name || null,
            provider,
            model,
            sections: draft.sections,
            limitations: draft.limitations,
            disclaimer,
            provenance: draft.provenance || null,
            sourceContext: {
                imaging: imagingResult.rows[0] || {},
                imageAnalysis: includesStructuredImageAnalysis ? {
                    model: imageAnalysis.payload?.model || null,
                    quality: imageAnalysis.payload?.quality || null,
                    provenance: imageAnalysis.payload?.provenance || null
                } : null
            }
        });
    } catch (error) {
        if (req.requestTimedOut || res.headersSent || res.writableEnded) return;
        next(error);
    }
};

const markAiReportDraftApplied = (db) => async (req, res, next) => {
    try {
        const { id, draftId } = req.params;
        const { mode = 'fill_empty' } = req.body || {};
        const exam = await verifyReportExamAccess(db, id, req.user);
        if (!exam) return next(new AppError('Exam not found or not assigned to this user', 404));
        if (exam.report_locked) return next(new AppError('Cannot apply an AI draft to a finalized locked report', 409));

        const { rows } = await db.query(
            `UPDATE report_ai_drafts
             SET status = 'Applied',
                 apply_mode = $4,
                 applied_by = $3,
                 applied_at = CURRENT_TIMESTAMP
             WHERE draft_id = $1 AND exam_id = $2
             RETURNING draft_id, status, apply_mode, applied_at`,
            [draftId, id, req.user?.user_id || null, mode]
        );

        if (!rows.length) return next(new AppError('AI draft not found for this exam', 404));

        await logAction(db, {
            userId: req.user?.user_id,
            action: 'AI_PRELIM_DRAFT_APPLIED',
            resourceId: id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: { draftId, mode }
        });

        res.json({ success: true, draft: rows[0] });
    } catch (error) {
        next(error);
    }
};

module.exports = { getWorklist, getCaseReports, lookupCaseReport, getExamById, updateReport, acknowledgeCriticalResult, getReportPdf, amendReport, improveReportFormat, listAiReportDrafts, generatePreliminaryReportDraft, markAiReportDraftApplied };
