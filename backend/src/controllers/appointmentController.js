const { getRequestQuery } = require('../utils/requestQuery');
const { AppError } = require('../middleware/errorHandler');
const {
    triggerEvent,
    triggerEventForRole,
    scheduleAppointmentReminder,
    cancelPendingAppointmentReminders,
    getAppointmentOccurrenceKey,
    markPatientCampaignConversion
} = require('../services/notificationJobService');
const { getWorkingHours, assertWithinWorkingHours, assertAppointmentScheduleRules } = require('../services/schedulingService');
const { decrypt } = require('../utils/crypto');
const { logAction } = require('../services/auditService');
const { triggerMwlRegeneration } = require('../services/pacsMwlService');
const { syncInvoicesAfterAppointmentReschedule } = require('../services/insuranceAuthorizationService');
const { assertQuota } = require('../services/quotaService');
const crypto = require('crypto');

const generateOrderNumber = () => {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `ORD-${datePart}-${randomPart}`;
};

let catalogArchiveSchemaPromise = Promise.resolve();
const ensureCatalogArchiveSchema = async (db) => catalogArchiveSchemaPromise;

const getExamDefaults = async (client, examTypeId, modalityId, requireActive = true) => {
    if (!examTypeId) {
        return {};
    }

    const result = await client.query(
        'SELECT body_part, contrast_required, modality_id, is_active FROM examination_types WHERE type_id = $1 AND deleted_at IS NULL',
        [examTypeId]
    );
    if (!result.rows.length) throw new AppError('Examination type not found.', 404);
    const exam = result.rows[0];
    if (requireActive && !exam.is_active) throw new AppError('This examination is inactive and cannot be booked.', 409);
    if (modalityId && exam.modality_id !== modalityId) throw new AppError('The selected examination is not assigned to this machine.', 409);
    return exam;
};

const buildOrderFields = (data, existing = {}, examDefaults = {}) => ({
    order_number: existing.order_number || generateOrderNumber(),
    priority: data.priority ?? existing.priority ?? 'Routine',
    clinical_indication: data.clinicalIndication ?? existing.clinical_indication ?? null,
    provisional_diagnosis: data.provisionalDiagnosis ?? existing.provisional_diagnosis ?? null,
    icd_code: data.icdCode ?? existing.icd_code ?? null,
    body_part: data.bodyPart ?? existing.body_part ?? examDefaults.body_part ?? null,
    contrast_required: data.contrastRequired ?? existing.contrast_required ?? examDefaults.contrast_required ?? false,
    pregnancy_safety_status: data.pregnancySafetyStatus ?? existing.pregnancy_safety_status ?? 'Unknown',
    implant_safety_status: data.implantSafetyStatus ?? existing.implant_safety_status ?? 'Unknown',
    renal_safety_status: data.renalSafetyStatus ?? existing.renal_safety_status ?? 'Unknown'
});

const CLINICAL_ASSIGNEES = [
    { key: 'nurseId', column: 'nurse_id', role: 'Nurse', versionColumn: 'nurse_assignment_version' },
    { key: 'technicianId', column: 'technician_id', role: 'Technician', versionColumn: 'technician_assignment_version' },
    { key: 'radiologistId', column: 'performing_radiologist_id', role: 'Radiologist', versionColumn: 'radiologist_assignment_version' }
];

const assertClinicalAssignees = async (client, data) => {
    const requested = CLINICAL_ASSIGNEES
        .map(({ key, role }) => ({ userId: data[key], role }))
        .filter(({ userId }) => Boolean(userId));
    if (!requested.length) return;

    const result = await client.query(`
        SELECT user_id, role
        FROM users
        WHERE user_id = ANY($1::uuid[]) AND is_active = TRUE
    `, [requested.map(({ userId }) => userId)]);
    const rolesById = new Map(result.rows.map((row) => [String(row.user_id), row.role]));
    const invalid = requested.find(({ userId, role }) => rolesById.get(String(userId)) !== role);
    if (invalid) {
        throw new AppError(`Selected ${invalid.role.toLowerCase()} is inactive or has the wrong role`, 422, true, 'ROLE_NOT_ELIGIBLE');
    }
};

const assertReceptionistAssignment = async (client, receptionistId) => {
    if (!receptionistId) return;

    const result = await client.query(`
        SELECT user_id, role, is_active
        FROM users
        WHERE user_id = $1
        LIMIT 1
    `, [receptionistId]);

    if (!result.rows.length || result.rows[0].is_active !== true) {
        throw new AppError('Selected receptionist is inactive or not available', 422, true, 'ROLE_NOT_ELIGIBLE');
    }

    if (!['Receptionist', 'Admin', 'Developer'].includes(result.rows[0].role)) {
        throw new AppError('Selected receptionist is inactive or has the wrong role', 422, true, 'ROLE_NOT_ELIGIBLE');
    }
};

const assertReceptionistRequiredForReceptionStage = (receptionistId, status, arrived) => {
    if ((arrived === true || status === 'Checked-in') && !receptionistId) {
        throw new AppError(
            'A receptionist must be assigned before checking in an appointment. | يجب إسناد موظف استقبال قبل تسجيل وصول الموعد.',
            422,
            true,
            'RECEPTIONIST_ASSIGNMENT_REQUIRED'
        );
    }
};

const recordClinicalAssignmentChanges = async (client, {
    examId,
    appointmentId,
    actorId,
    previous = {},
    next = {},
    reason
}) => {
    for (const config of CLINICAL_ASSIGNEES) {
        const previousUserId = previous[config.column] || null;
        const newUserId = next[config.column] || null;
        if (String(previousUserId || '') === String(newUserId || '')) continue;

        const action = previousUserId && newUserId ? 'Transfer'
            : newUserId ? 'Assign' : 'Release';
        const version = Number(next[config.versionColumn] || 1);
        await client.query(`
            INSERT INTO clinical_task_assignment_events (
                exam_id, appointment_id, task_role, action, previous_user_id,
                new_user_id, performed_by, reason, assignment_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            examId,
            appointmentId,
            config.role,
            action,
            previousUserId,
            newUserId,
            actorId,
            reason || 'Clinical staff allocation updated with the appointment',
            version
        ]);
    }
};

const appendAppointmentVisibility = (req, queryParams) => {
    const hasEmergencyAccess = Boolean(req.user?.emergencyAccessId
        && Array.isArray(req.user?.elevatedPermissions)
        && req.user.elevatedPermissions.includes('VIEW_APPOINTMENTS')
        && Number(req.user.breakGlassExpiry) > Date.now());
    if (hasEmergencyAccess) return '';

    const role = req.user?.role;
    if (['Admin', 'Receptionist', 'Developer', 'SuperAdmin', 'Accountant', 'Cashier'].includes(role)) {
        return '';
    }

    const userId = req.user?.user_id;
    if (role === 'Technician') {
        queryParams.push(userId);
        const param = `$${queryParams.length}`;
        return ` AND (
            a.technician_id = ${param}
            OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
        )`;
    }
    if (role === 'Nurse') {
        queryParams.push(userId);
        const param = `$${queryParams.length}`;
        return ` AND (
            a.nurse_id = ${param}
            OR (e.current_station = 'Nurse' AND a.nurse_id IS NULL)
        )`;
    }
    if (role === 'Radiologist') {
        queryParams.push(userId);
        const param = `$${queryParams.length}`;
        return ` AND (
            COALESCE(e.performing_radiologist_id, a.radiologist_id) = ${param}
            OR (e.current_station = 'Radiologist'
                AND COALESCE(e.performing_radiologist_id, a.radiologist_id) IS NULL)
        )`;
    }

    return ` AND (
        e.exam_id IS NULL
        OR e.current_station NOT IN ('Nurse', 'Modality', 'Radiologist')
        OR (e.current_station = 'Nurse' AND a.nurse_id IS NULL)
        OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
        OR (e.current_station = 'Radiologist' AND e.performing_radiologist_id IS NULL)
    )`;
};

const resolveFollowUp = async (client, {
    isFollowUp,
    priorExamId,
    patientId,
    startTime,
    currentExamId = null
}) => {
    if (!isFollowUp) {
        return { is_follow_up: false, prior_exam_id: null, followUp: null };
    }
    if (!priorExamId) throw new AppError('Select the prior examination for this follow-up.', 400);
    if (currentExamId && priorExamId === currentExamId) {
        throw new AppError('An examination cannot be a follow-up to itself.', 400);
    }

    const { rows } = await client.query(`
        SELECT e.exam_id, e.patient_id, e.order_number, e.status, e.report_status,
               COALESCE(a.start_time, e.created_at) AS exam_time,
               a.status AS appointment_status,
               et.name AS exam_type_name,
               m.name AS modality_name,
               m.type AS modality_type
        FROM examinations e
        LEFT JOIN appointments a ON a.appointment_id = e.appointment_id
        LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
        LEFT JOIN modalities m ON m.modality_id = e.modality_id
        WHERE e.exam_id = $1
        LIMIT 1
    `, [priorExamId]);

    if (!rows.length) throw new AppError('The selected prior examination was not found.', 404);
    const prior = rows[0];
    if (prior.patient_id !== patientId) {
        throw new AppError('The prior examination must belong to the same patient.', 409);
    }
    if (prior.appointment_status === 'Cancelled') {
        throw new AppError('A cancelled examination cannot be used as follow-up history.', 409);
    }
    if (startTime && prior.exam_time && new Date(prior.exam_time) >= new Date(startTime)) {
        throw new AppError('The prior examination must occur before the follow-up appointment.', 409);
    }

    return { is_follow_up: true, prior_exam_id: prior.exam_id, followUp: prior };
};

const insertOrderHistory = (client, {
    appointmentId,
    examId,
    oldStatus,
    newStatus,
    eventType,
    notes,
    userId
}) => client.query(`
    INSERT INTO order_status_history (
        appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
`, [
    appointmentId || null,
    examId || null,
    oldStatus || null,
    newStatus,
    eventType,
    notes || null,
    userId || null
]);

const assertSchedulingRules = assertAppointmentScheduleRules;

const createAppointment = (db) => async (req, res, next) => {
    let client;

    try {
        const data = req.body;
        const userId = req.user.user_id;

        await ensureCatalogArchiveSchema(db);
        client = await db.connect();
        await client.query('BEGIN');
        await assertQuota(client, 'appointments', { transaction: true });

        try {
            const idempotencyKey = req.get('Idempotency-Key');
            if (idempotencyKey) {
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
                    await client.query('ROLLBACK');
                    return next(new AppError('Invalid Idempotency-Key header format', 400));
                }

                const existing = await client.query(
                    `SELECT resource_id AS appointment_id, request_fingerprint FROM appointment_idempotency_keys
                     WHERE idempotency_key = $1 AND actor_id = $2 AND operation_type = 'CREATE_APPOINTMENT'`,
                    [idempotencyKey, userId]
                );
                if (existing.rows.length > 0) {
                    await client.query('ROLLBACK');
                    const requestFingerprint = crypto.createHash('sha256')
                        .update(JSON.stringify(data || {}))
                        .digest('hex');
                    if (existing.rows[0].request_fingerprint !== requestFingerprint) {
                        return next(new AppError('This idempotency key has already been used for a different appointment request.', 409));
                    }
                    const apptResult = await db.query(
                        'SELECT * FROM appointments WHERE appointment_id = $1',
                        [existing.rows[0].appointment_id]
                    );
                    return res.status(200).json(apptResult.rows[0]);
                }
            }

            let waitlistEntry = null;
            if (data.waitlistId) {
                const waitlistResult = await client.query(
                    `SELECT waitlist_id, patient_id, modality_id, exam_type_id, status
                     FROM waiting_list
                     WHERE waitlist_id = $1
                     FOR UPDATE`,
                    [data.waitlistId]
                );
                if (!waitlistResult.rows.length) {
                    throw new AppError('Waiting list entry not found.', 404);
                }
                waitlistEntry = waitlistResult.rows[0];
                if (!['Waiting', 'Contacted', 'Offered'].includes(waitlistEntry.status)) {
                    throw new AppError('This waiting list entry is no longer available for booking.', 409);
                }
                if (waitlistEntry.patient_id !== data.patientId) {
                    throw new AppError('The waiting list entry belongs to a different patient.', 409);
                }
                if (waitlistEntry.modality_id && waitlistEntry.modality_id !== data.modalityId) {
                    throw new AppError('The selected machine does not match the waiting list entry.', 409);
                }
                if (waitlistEntry.exam_type_id && waitlistEntry.exam_type_id !== data.examTypeId) {
                    throw new AppError('The selected examination does not match the waiting list entry.', 409);
                }
            }

            if (data.examTypeId) {
                const examTypeResult = await client.query(
                    'SELECT type_id, name, duration_minutes, preparation_instructions FROM examination_types WHERE type_id = $1',
                    [data.examTypeId]
                );
                if (examTypeResult.rows.length) {
                    const examType = examTypeResult.rows[0];
                    if (examType.duration_minutes) {
                        const requestedMinutes = Math.round((new Date(data.endTime) - new Date(data.startTime)) / 60000);
                        if (requestedMinutes < examType.duration_minutes) {
                            throw new AppError(`The selected examination "${examType.name}" requires at least ${examType.duration_minutes} minutes. The requested slot is only ${requestedMinutes} minutes.`, 400);
                        }
                    }
                }
            }

            const scheduledMachine = await assertSchedulingRules(client, data.modalityId, data.startTime, data.endTime);

            // Serialize concurrent bookings on the exact same modality slot to prevent race condition double bookings
            const slotLockKey = `modality_slot:${data.modalityId}:${new Date(data.startTime).toISOString()}`;
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [slotLockKey]);

            const conflictQuery = `
              SELECT appointment_id FROM appointments
              WHERE modality_id = $1
              AND status != 'Cancelled'
              AND start_time < $3::timestamptz AND end_time > $2::timestamptz
            `;

            const conflictCheck = await client.query(conflictQuery, [
                data.modalityId,
                data.startTime,
                data.endTime
            ]);

            if (conflictCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return next(new AppError('This machine is already booked for the selected time slot.', 409));
            }

            const patientConflictQuery = `
              SELECT appointment_id FROM appointments
              WHERE patient_id = $1
              AND status != 'Cancelled'
              AND ($4::uuid IS NULL OR appointment_id != $4::uuid)
              AND start_time < $3::timestamptz AND end_time > $2::timestamptz
              FOR UPDATE
            `;

            const patientConflictCheck = await client.query(patientConflictQuery, [
                data.patientId,
                data.startTime,
                data.endTime,
                null
            ]);

            if (patientConflictCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return next(new AppError('This patient already has an appointment scheduled for the selected time slot.', 409));
            }

            const examDefaults = await getExamDefaults(client, data.examTypeId, data.modalityId);

            // Enforce realistic procedure duration
            if (examDefaults.duration_minutes) {
                const startMs = new Date(data.startTime).getTime();
                const endMs = new Date(data.endTime).getTime();
                const actualMinutes = Math.round((endMs - startMs) / (60 * 1000));
                const minAllowed = Math.min(Number(examDefaults.duration_minutes), 10);
                if (actualMinutes < minAllowed) {
                    throw new AppError(`Appointment duration (${actualMinutes} min) is shorter than the minimum required for ${examDefaults.name || 'this procedure'} (${examDefaults.duration_minutes} min).`, 400);
                }
            }

            await assertClinicalAssignees(client, data);
            const appointmentStatus = data.arrived ? 'Checked-in' : 'Confirmed';
            assertReceptionistRequiredForReceptionStage(data.receptionistId, appointmentStatus, data.arrived);
            await assertReceptionistAssignment(client, data.receptionistId);
            const orderFields = buildOrderFields(data, {}, examDefaults);
            const followUp = await resolveFollowUp(client, {
                isFollowUp: Boolean(data.isFollowUp),
                priorExamId: data.priorExamId,
                patientId: data.patientId,
                startTime: data.startTime
            });

            const insertQuery = `
              INSERT INTO appointments (
                patient_id, modality_id, exam_type_id, start_time, end_time, room_id, notes, created_by,
                referring_doctor, referring_doctor_id, technician_id, nurse_id, radiologist_id, payment_method, payment_amount,
                                receptionist_id, receptionist_assigned_at, receptionist_desk, receptionist_assignment_version,
                                appointment_source, preparation_status, order_number, priority, clinical_indication,
                provisional_diagnosis, icd_code, body_part, contrast_required, pregnancy_safety_status,
                implant_safety_status, renal_safety_status, status,
                is_follow_up, prior_exam_id, follow_up_reason
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                                                                $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                                                                $28, $29, $30, $31, $32, $33, $34, $35
              )
              RETURNING *
            `;

            const values = [
                data.patientId,
                data.modalityId,
                data.examTypeId,
                data.startTime,
                data.endTime,
                data.roomId || scheduledMachine?.room_id || null,
                data.notes,
                userId,
                data.referringDoctor || null,
                data.referringDoctorId || null,
                data.technicianId || null,
                data.nurseId || null,
                data.radiologistId || null,
                data.paymentMethod,
                data.paymentAmount,
                data.receptionistId || null,
                data.receptionistId ? new Date().toISOString() : null,
                data.receptionistDesk || null,
                data.receptionistId ? 1 : 0,
                data.appointmentSource || 'Walk-in',
                data.preparationStatus || 'Not Required',
                orderFields.order_number,
                orderFields.priority,
                orderFields.clinical_indication,
                orderFields.provisional_diagnosis,
                orderFields.icd_code,
                orderFields.body_part,
                orderFields.contrast_required,
                orderFields.pregnancy_safety_status,
                orderFields.implant_safety_status,
                orderFields.renal_safety_status,
                appointmentStatus,
                followUp.is_follow_up,
                followUp.prior_exam_id,
                followUp.is_follow_up ? (data.followUpReason || null) : null
            ];

            const result = await client.query(insertQuery, values);
            const appointment = result.rows[0];

            await logAction(client, {
                userId,
                action: 'APPOINTMENT_CREATED',
                resourceId: appointment.appointment_id,
                resourceTable: 'appointments',
                ipAddress: req.ip,
                details: {
                    patientId: appointment.patient_id,
                    priority: appointment.priority,
                    receptionistId: appointment.receptionist_id || null,
                    appointmentSource: appointment.appointment_source || null
                }
            });

            await insertOrderHistory(client, {
                appointmentId: appointment.appointment_id,
                newStatus: appointment.status,
                eventType: 'OrderCreated',
                notes: followUp.followUp
                    ? `Follow-up order ${appointment.order_number} linked to ${followUp.followUp.order_number || followUp.followUp.exam_id}`
                    : `Order ${appointment.order_number} created`,
                userId
            });

            const examStatus = data.arrived ? 'Checked-in' : 'Scheduled';
            const queueStage = data.arrived ? 'Arrived' : 'Scheduled';
            const arrivedAt = data.arrived ? new Date().toISOString() : null;
            const reportRequestStatus = (data.imagesOnly || data.reportRequestStatus === 'NotRequested') ? 'NotRequested' : 'Requested';
            const onlineSources = ['Website', 'Patient Portal'];
            const reportRequestSource = onlineSources.includes(data.appointmentSource) ? 'Booking' : 'Reception';

            const examInsert = `
                INSERT INTO examinations (
                    appointment_id, patient_id, modality_id, exam_type_id, performing_radiologist_id,
                    external_referring_doctor_id, status, queue_stage, current_station, arrived_at, order_number, priority, clinical_indication,
                    provisional_diagnosis, icd_code, body_part, contrast_required, pregnancy_safety_status,
                    implant_safety_status, renal_safety_status,
                    is_follow_up, prior_exam_id, follow_up_reason,
                    report_request_status, report_request_source
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25
                )
                RETURNING exam_id, performing_radiologist_id, radiologist_assignment_version
            `;
            const examResult = await client.query(examInsert, [
                appointment.appointment_id,
                data.patientId,
                data.modalityId,
                data.examTypeId,
                data.radiologistId || null,
                data.referringDoctorId || null,
                examStatus,
                queueStage,
                'Reception',
                arrivedAt,
                appointment.order_number,
                appointment.priority,
                appointment.clinical_indication,
                appointment.provisional_diagnosis,
                appointment.icd_code,
                appointment.body_part,
                appointment.contrast_required,
                appointment.pregnancy_safety_status,
                appointment.implant_safety_status,
                appointment.renal_safety_status,
                appointment.is_follow_up,
                appointment.prior_exam_id,
                appointment.follow_up_reason,
                reportRequestStatus,
                reportRequestSource
            ]);

            if (waitlistEntry) {
                const waitlistUpdate = await client.query(
                    `UPDATE waiting_list
                     SET status = 'Scheduled', assigned_appointment_id = $1, updated_at = NOW()
                    WHERE waitlist_id = $2 AND status IN ('Waiting', 'Contacted', 'Offered')`,
                    [appointment.appointment_id, waitlistEntry.waitlist_id]
                );
                if (waitlistUpdate.rowCount !== 1) {
                    throw new AppError('This waiting list entry was changed by another user.', 409);
                }
                await client.query(
                    `INSERT INTO waiting_list_events
                     (waitlist_id, from_status, to_status, appointment_id, reason, changed_by)
                     VALUES ($1, $2, 'Scheduled', $3, $4, $5)`,
                    [waitlistEntry.waitlist_id, waitlistEntry.status, appointment.appointment_id, 'Appointment booked from waiting list', userId]
                );
            }

            await insertOrderHistory(client, {
                appointmentId: appointment.appointment_id,
                examId: examResult.rows[0].exam_id,
                newStatus: examStatus,
                eventType: 'ExamCreated',
                notes: 'Exam created from appointment order',
                userId
            });

            await recordClinicalAssignmentChanges(client, {
                examId: examResult.rows[0].exam_id,
                appointmentId: appointment.appointment_id,
                actorId: userId,
                next: {
                    ...appointment,
                    performing_radiologist_id: examResult.rows[0].performing_radiologist_id,
                    radiologist_assignment_version: examResult.rows[0].radiologist_assignment_version
                },
                reason: 'Initial clinical staff allocation'
            });

            if (idempotencyKey) {
                await client.query(
                    `INSERT INTO appointment_idempotency_keys
                     (idempotency_key, actor_id, operation_type, resource_id, request_fingerprint)
                     VALUES ($1, $2, 'CREATE_APPOINTMENT', $3, $4)
                     ON CONFLICT (actor_id, operation_type, idempotency_key) DO NOTHING`,
                    [idempotencyKey, userId, appointment.appointment_id, crypto.createHash('sha256').update(JSON.stringify(data || {})).digest('hex')]
                );
            }

            await client.query('COMMIT');
            await markPatientCampaignConversion(db, appointment.patient_id).catch(() => {});

            // Fetch the patient's real name and exam/modality details for rich notifications
            const detailsResult = await db.query(`
                SELECT
                    p.first_name_enc, p.last_name_enc,
                    m.name as modality_name,
                    et.name as exam_type_name,
                    et.preparation_instructions
                FROM appointments a
                JOIN patients p ON a.patient_id = p.patient_id
                LEFT JOIN modalities m ON a.modality_id = m.modality_id
                LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
                WHERE a.appointment_id = $1
            `, [appointment.appointment_id]);

            let patientName = appointment.order_number; // fallback
            let modalityName = '';
            let examTypeName = '';
            let prepInstructions = '';

            if (detailsResult.rows.length > 0) {
                const row = detailsResult.rows[0];
                patientName = [decrypt(row.first_name_enc), decrypt(row.last_name_enc)]
                    .filter(Boolean)
                    .join(' ') || appointment.order_number;
                modalityName = row.modality_name || '';
                examTypeName = row.exam_type_name || '';
                prepInstructions = row.preparation_instructions || '';
            }

            const apptTime = appointment.start_time ? new Date(appointment.start_time).toLocaleString() : '';
            triggerEvent(db, 'AppointmentCreated', {
                patientId: appointment.patient_id,
                entityType: 'Appointment',
                entityId: appointment.appointment_id,
                channels: ['Email', 'SMS'],
                variables: {
                    patient_name: patientName,
                    order_number: appointment.order_number,
                    appointment_time: apptTime,
                    exam_type: examTypeName,
                    modality: modalityName,
                    prep_instructions: prepInstructions,
                    prep_short: prepInstructions.slice(0, 100)
                }
            });

            scheduleAppointmentReminder(db, {
                ...appointment,
                patient_name: patientName,
                exam_type_name: examTypeName,
                preparation_instructions: prepInstructions
            }).catch(() => {});

            const orderVariables = {
                order_number: appointment.order_number,
                patient_name: patientName,
                exam_type: examTypeName,
                priority: appointment.priority || 'Normal'
            };
            const examVariables = {
                order_number: appointment.order_number,
                patient_name: patientName,
                exam_id: examResult.rows[0].exam_id,
                status: examStatus,
                exam_time: apptTime
            };

            // These are internal workflow events. Patients receive the separate
            // AppointmentCreated notification above with patient-safe wording.
            for (const roleName of ['Radiologist', 'Receptionist', 'Admin']) {
                triggerEventForRole(db, 'OrderCreated', roleName, {
                    entityType: 'Appointment', entityId: appointment.appointment_id,
                    priority: 'Normal', variables: orderVariables
                });
            }
            for (const roleName of ['Radiologist', 'Technician', 'Nurse', 'Receptionist', 'Admin']) {
                triggerEventForRole(db, 'ExamCreated', roleName, {
                    entityType: 'Exam', entityId: examResult.rows[0].exam_id,
                    priority: 'Normal', variables: examVariables
                });
                triggerEventForRole(db, 'ExamScheduled', roleName, {
                    entityType: 'Exam', entityId: examResult.rows[0].exam_id,
                    priority: 'Normal', variables: examVariables
                });
            }

            // Fire PrepInstructions notification if preparation is required
            if (appointment.preparation_status && appointment.preparation_status !== 'Not Required' && prepInstructions) {
                triggerEvent(db, 'PrepInstructions', {
                    patientId: appointment.patient_id,
                    entityType: 'Appointment',
                    entityId: appointment.appointment_id,
                    channels: ['Email', 'SMS'],
                    variables: {
                        order_number: appointment.order_number,
                        appointment_time: apptTime,
                        prep_instructions: prepInstructions,
                        prep_short: prepInstructions.length > 100 ? prepInstructions.slice(0, 97) + '...' : prepInstructions
                    }
                });
            }

            try { triggerMwlRegeneration(db); } catch {}
            res.status(201).json(appointment);
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
            throw error;
        }

    } catch (error) {
        if (error.code === '23P01') { 
            return next(new AppError('Time slot occupied.', 409));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateAppointment = (db) => async (req, res, next) => {
    let client;

    try {
        const { id } = req.params;
        const data = req.body;

        await ensureCatalogArchiveSchema(db);
        client = await db.connect();
        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT * FROM appointments WHERE appointment_id = $1 FOR UPDATE',
            [id]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Appointment not found', 404));
        }

        const existing = existingResult.rows[0];
        const assignmentChanges = [
            ['technicianId', existing.technician_id],
            ['nurseId', existing.nurse_id],
            ['radiologistId', existing.radiologist_id]
        ].filter(([field, current]) => Object.prototype.hasOwnProperty.call(data, field)
            && String(data[field] || '') !== String(current || ''));
        const requiresAssignmentReason = assignmentChanges.some(([, current]) => Boolean(current));
        if (requiresAssignmentReason && !data.assignmentReason?.trim()) {
            await client.query('ROLLBACK');
            return next(new AppError('A reason is required to transfer or release a clinical task', 422, true, 'REASON_REQUIRED'));
        }
        if (['Cancelled', 'No-Show', 'Completed'].includes(existing.status)) {
            await client.query('ROLLBACK');
            return next(new AppError(`A ${existing.status} appointment cannot be edited`, 409));
        }

        if (req.user?.role === 'Receptionist' && (data.status === 'Checked-in' || data.arrived === true)) {
            const shiftCheck = await client.query(`
                SELECT session_id FROM reception_shift_sessions
                WHERE user_id = $1 AND status = 'Open'
                LIMIT 1
            `, [req.user.user_id]);
            if (!shiftCheck.rows.length) {
                await client.query('ROLLBACK');
                return next(new AppError(
                    'Start your reception shift before checking in patients. | يجب بدء وردية الاستقبال أولاً لتسجيل وصول المرضى.',
                    409,
                    true,
                    'RECEPTION_SHIFT_REQUIRED'
                ));
            }
        }
        if (data.status) {
            if (['Cancelled', 'No-Show', 'Completed'].includes(data.status)) {
                await client.query('ROLLBACK');
                return next(new AppError('Use the dedicated cancellation, no-show, or clinical completion workflow', 409));
            }
            const editableStatusTransitions = {
                Scheduled: ['Scheduled', 'Confirmed', 'Arrived', 'Checked-in'],
                Confirmed: ['Confirmed', 'Arrived', 'Checked-in'],
                Arrived: ['Arrived', 'Checked-in'],
                'Checked-in': ['Checked-in']
            };
            const allowed = editableStatusTransitions[existing.status] || [existing.status];
            if (!allowed.includes(data.status)) {
                await client.query('ROLLBACK');
                return next(new AppError(`Invalid appointment transition from ${existing.status} to ${data.status}`, 409));
            }
        }
        const nextModalityId = data.modalityId ?? existing.modality_id;
        const nextExamTypeId = data.examTypeId ?? existing.exam_type_id;
        const examDefaults = await getExamDefaults(
            client,
            nextExamTypeId,
            nextModalityId,
            data.examTypeId !== undefined || data.modalityId !== undefined
        );
        const orderFields = buildOrderFields(data, existing, examDefaults);
        const nextIsFollowUp = data.isFollowUp ?? existing.is_follow_up ?? false;
        const nextPriorExamId = nextIsFollowUp
            ? (data.priorExamId !== undefined ? data.priorExamId : existing.prior_exam_id)
            : null;
        const followUp = await resolveFollowUp(client, {
            isFollowUp: nextIsFollowUp,
            priorExamId: nextPriorExamId,
            patientId: data.patientId ?? existing.patient_id,
            startTime: data.startTime ?? existing.start_time
        });
        const nextAppointment = {
            patient_id: data.patientId ?? existing.patient_id,
            modality_id: nextModalityId,
            exam_type_id: nextExamTypeId,
            start_time: data.startTime ?? existing.start_time,
            end_time: data.endTime ?? existing.end_time,
            status: data.status ?? existing.status,
            notes: data.notes ?? existing.notes,
            referring_doctor: data.referringDoctor !== undefined ? data.referringDoctor : existing.referring_doctor,
            referring_doctor_id: data.referringDoctorId !== undefined ? data.referringDoctorId : existing.referring_doctor_id,
            technician_id: data.technicianId !== undefined ? data.technicianId : existing.technician_id,
            nurse_id: data.nurseId !== undefined ? data.nurseId : existing.nurse_id,
            radiologist_id: data.radiologistId !== undefined ? data.radiologistId : existing.radiologist_id,
            payment_method: data.paymentMethod ?? existing.payment_method,
            payment_amount: data.paymentAmount ?? existing.payment_amount,
            receptionist_id: data.receptionistId !== undefined ? data.receptionistId : existing.receptionist_id,
            receptionist_desk: data.receptionistDesk !== undefined ? data.receptionistDesk : existing.receptionist_desk,
            appointment_source: data.appointmentSource ?? existing.appointment_source,
            preparation_status: data.preparationStatus ?? existing.preparation_status,
            cancellation_reason: existing.cancellation_reason,
            is_follow_up: followUp.is_follow_up,
            prior_exam_id: followUp.prior_exam_id,
            follow_up_reason: followUp.is_follow_up
                ? (data.followUpReason !== undefined ? data.followUpReason : existing.follow_up_reason)
                : null,
            ...orderFields
        };
        await assertClinicalAssignees(client, {
            technicianId: nextAppointment.technician_id,
            nurseId: nextAppointment.nurse_id,
            radiologistId: nextAppointment.radiologist_id
        });
        assertReceptionistRequiredForReceptionStage(
            nextAppointment.receptionist_id,
            nextAppointment.status,
            data.arrived
        );
        await assertReceptionistAssignment(client, nextAppointment.receptionist_id);

        const schedulingChanged = data.modalityId !== undefined
            || data.startTime !== undefined
            || data.endTime !== undefined
            || (existing.status === 'Cancelled' && nextAppointment.status !== 'Cancelled');
        if (nextAppointment.status !== 'Cancelled' && schedulingChanged) {
            await assertSchedulingRules(client, nextAppointment.modality_id, nextAppointment.start_time, nextAppointment.end_time);

            const conflictQuery = `
                SELECT appointment_id FROM appointments
                WHERE appointment_id != $1
                AND modality_id = $2
                AND status != 'Cancelled'
                AND tstzrange(start_time, end_time) && tstzrange($3, $4)
                FOR UPDATE
            `;

            const conflictCheck = await client.query(conflictQuery, [
                id,
                nextAppointment.modality_id,
                nextAppointment.start_time,
                nextAppointment.end_time
            ]);

            if (conflictCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return next(new AppError('This machine is already booked for the selected time slot.', 409));
            }
        }

        const updateQuery = `
            UPDATE appointments
            SET patient_id = $1,
                modality_id = $2,
                exam_type_id = $3,
                start_time = $4,
                end_time = $5,
                status = $6::varchar(20),
                notes = $7,
                referring_doctor = $8,
                referring_doctor_id = $9,
                technician_id = $10,
                nurse_id = $11,
                radiologist_id = $12,
                payment_method = $13,
                payment_amount = $14,
                receptionist_id = $15,
                receptionist_assigned_at = CASE
                    WHEN $15::uuid IS NULL THEN NULL
                    WHEN receptionist_id IS DISTINCT FROM $15::uuid THEN NOW()
                    ELSE receptionist_assigned_at
                END,
                receptionist_desk = $16,
                receptionist_assignment_version = CASE
                    WHEN receptionist_id IS DISTINCT FROM $15::uuid THEN receptionist_assignment_version + 1
                    ELSE receptionist_assignment_version
                END,
                appointment_source = $17,
                preparation_status = $18,
                cancellation_reason = $19,
                order_number = $20,
                priority = $21,
                clinical_indication = $22,
                provisional_diagnosis = $23,
                icd_code = $24,
                body_part = $25,
                contrast_required = $26,
                pregnancy_safety_status = $27,
                implant_safety_status = $28,
                renal_safety_status = $29,
                is_follow_up = $30,
                prior_exam_id = $31,
                follow_up_reason = $32,
                cancelled_by = CASE WHEN $6::varchar(20) = 'Cancelled' AND status != 'Cancelled' THEN $33 ELSE cancelled_by END,
                cancelled_at = CASE WHEN $6::varchar(20) = 'Cancelled' AND status != 'Cancelled' THEN NOW() ELSE cancelled_at END
            WHERE appointment_id = $34
            RETURNING *
        `;

        const result = await client.query(updateQuery, [
            nextAppointment.patient_id,
            nextAppointment.modality_id,
            nextAppointment.exam_type_id,
            nextAppointment.start_time,
            nextAppointment.end_time,
            nextAppointment.status,
            nextAppointment.notes,
            nextAppointment.referring_doctor,
            nextAppointment.referring_doctor_id,
            nextAppointment.technician_id,
            nextAppointment.nurse_id,
            nextAppointment.radiologist_id,
            nextAppointment.payment_method,
            nextAppointment.payment_amount,
            nextAppointment.receptionist_id,
            nextAppointment.receptionist_desk,
            nextAppointment.appointment_source,
            nextAppointment.preparation_status,
            nextAppointment.cancellation_reason,
            nextAppointment.order_number,
            nextAppointment.priority,
            nextAppointment.clinical_indication,
            nextAppointment.provisional_diagnosis,
            nextAppointment.icd_code,
            nextAppointment.body_part,
            nextAppointment.contrast_required,
            nextAppointment.pregnancy_safety_status,
            nextAppointment.implant_safety_status,
            nextAppointment.renal_safety_status,
            nextAppointment.is_follow_up,
            nextAppointment.prior_exam_id,
            nextAppointment.follow_up_reason,
            req.user.user_id,
            id
        ]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'APPOINTMENT_UPDATED',
            resourceId: id,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: {
                status: nextAppointment.status,
                priority: nextAppointment.priority,
                receptionistId: nextAppointment.receptionist_id || null,
                receptionistDesk: nextAppointment.receptionist_desk || null,
                changedFields: Object.keys(data)
            }
        });

        const updatedExamResult = await client.query(`
            UPDATE examinations
            SET patient_id = $1,
                modality_id = $2,
                exam_type_id = $3,
                performing_radiologist_id = $4,
                external_referring_doctor_id = $5,
                order_number = $6,
                priority = $7,
                clinical_indication = $8,
                provisional_diagnosis = $9,
                icd_code = $10,
                body_part = $11,
                contrast_required = $12,
                pregnancy_safety_status = $13,
                implant_safety_status = $14,
                renal_safety_status = $15,
                is_follow_up = $16,
                prior_exam_id = $17,
                follow_up_reason = $18
            WHERE appointment_id = $19
            RETURNING exam_id, performing_radiologist_id, radiologist_assignment_version
        `, [
            nextAppointment.patient_id,
            nextAppointment.modality_id,
            nextAppointment.exam_type_id,
            nextAppointment.radiologist_id,
            nextAppointment.referring_doctor_id,
            nextAppointment.order_number,
            nextAppointment.priority,
            nextAppointment.clinical_indication,
            nextAppointment.provisional_diagnosis,
            nextAppointment.icd_code,
            nextAppointment.body_part,
            nextAppointment.contrast_required,
            nextAppointment.pregnancy_safety_status,
            nextAppointment.implant_safety_status,
            nextAppointment.renal_safety_status,
            nextAppointment.is_follow_up,
            nextAppointment.prior_exam_id,
            nextAppointment.follow_up_reason,
            id
        ]);

        if (['Arrived', 'Checked-in'].includes(nextAppointment.status)) {
            await client.query(`
                UPDATE examinations
                SET status = 'Checked-in',
                    queue_stage = CASE WHEN queue_stage = 'Scheduled' THEN 'Arrived' ELSE queue_stage END,
                    arrived_at = COALESCE(arrived_at, NOW())
                WHERE appointment_id = $1
            `, [id]);
        }

        const requestedReportStatus = data.imagesOnly === true ? 'NotRequested' : data.imagesOnly === false ? 'Requested' : data.reportRequestStatus;
        if (requestedReportStatus) {
            await client.query(`
                UPDATE examinations
                SET report_request_status = $2,
                    report_request_source = 'Reception'
                WHERE appointment_id = $1
            `, [id, requestedReportStatus]);
        }

        let currentExamAssignment = updatedExamResult.rows[0] || null;
        if (updatedExamResult.rowCount === 0 && nextAppointment.status !== 'Cancelled') {
            const examStatus = ['Arrived', 'Checked-in'].includes(nextAppointment.status) ? 'Checked-in' : 'Scheduled';
            const queueStage = ['Arrived', 'Checked-in'].includes(nextAppointment.status) ? 'Arrived' : 'Scheduled';
            const arrivedAt = ['Arrived', 'Checked-in'].includes(nextAppointment.status) ? new Date().toISOString() : null;

            const examResult = await client.query(`
                INSERT INTO examinations (
                    appointment_id, patient_id, modality_id, exam_type_id, performing_radiologist_id,
                    external_referring_doctor_id, status, queue_stage, current_station, arrived_at, order_number, priority, clinical_indication,
                    provisional_diagnosis, icd_code, body_part, contrast_required, pregnancy_safety_status,
                    implant_safety_status, renal_safety_status,
                    is_follow_up, prior_exam_id, follow_up_reason
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23
                )
                RETURNING exam_id, performing_radiologist_id, radiologist_assignment_version
            `, [
                id,
                nextAppointment.patient_id,
                nextAppointment.modality_id,
                nextAppointment.exam_type_id,
                nextAppointment.radiologist_id,
                nextAppointment.referring_doctor_id,
                examStatus,
                queueStage,
                'Reception',
                arrivedAt,
                nextAppointment.order_number,
                nextAppointment.priority,
                nextAppointment.clinical_indication,
                nextAppointment.provisional_diagnosis,
                nextAppointment.icd_code,
                nextAppointment.body_part,
                nextAppointment.contrast_required,
                nextAppointment.pregnancy_safety_status,
                nextAppointment.implant_safety_status,
                nextAppointment.renal_safety_status,
                nextAppointment.is_follow_up,
                nextAppointment.prior_exam_id,
                nextAppointment.follow_up_reason
            ]);

            await insertOrderHistory(client, {
                appointmentId: id,
                examId: examResult.rows[0].exam_id,
                newStatus: examStatus,
                eventType: 'ExamScheduled',
                notes: `Exam ${nextAppointment.order_number || examResult.rows[0].exam_id} scheduled after radiologist assignment`,
                userId: req.user.user_id
            });
            currentExamAssignment = examResult.rows[0];
        }

        if (currentExamAssignment) {
            await recordClinicalAssignmentChanges(client, {
                examId: currentExamAssignment.exam_id,
                appointmentId: id,
                actorId: req.user.user_id,
                previous: {
                    ...existing,
                    performing_radiologist_id: existing.radiologist_id
                },
                next: {
                    ...result.rows[0],
                    performing_radiologist_id: currentExamAssignment.performing_radiologist_id,
                    radiologist_assignment_version: currentExamAssignment.radiologist_assignment_version
                },
                reason: data.assignmentReason
            });
        }

        if (existing.is_follow_up !== nextAppointment.is_follow_up || existing.prior_exam_id !== nextAppointment.prior_exam_id) {
            await insertOrderHistory(client, {
                appointmentId: id,
                newStatus: nextAppointment.status,
                eventType: nextAppointment.is_follow_up ? 'FollowUpLinked' : 'FollowUpCleared',
                notes: nextAppointment.is_follow_up
                    ? `Linked to prior examination ${followUp.followUp?.order_number || nextAppointment.prior_exam_id}`
                    : 'Follow-up relationship cleared',
                userId: req.user.user_id
            });
        }

        if (existing.status !== result.rows[0].status) {
            await insertOrderHistory(client, {
                appointmentId: id,
                oldStatus: existing.status,
                newStatus: result.rows[0].status,
                eventType: 'AppointmentStatusChanged',
                notes: data.cancellationReason || null,
                userId: req.user.user_id
            });
        }

        const reminderChanged = existing.patient_id !== result.rows[0].patient_id
            || getAppointmentOccurrenceKey(existing.start_time) !== getAppointmentOccurrenceKey(result.rows[0].start_time);
        const reminderBecameIneligible = ['Scheduled', 'Confirmed'].includes(existing.status)
            && !['Scheduled', 'Confirmed'].includes(result.rows[0].status);
        if (reminderChanged || reminderBecameIneligible) {
            const replacementOccurrence = reminderChanged
                && existing.patient_id === result.rows[0].patient_id
                && ['Scheduled', 'Confirmed'].includes(result.rows[0].status)
                ? getAppointmentOccurrenceKey(result.rows[0].start_time)
                : null;
            await cancelPendingAppointmentReminders(client, id, replacementOccurrence);
        }

        // Sync cancellation to the linked exam, but never infer report finalization
        // from an administrative appointment status change. Acquisition completion
        // must go through the dedicated workflow where the result path is explicit.
        const newApptStatus = result.rows[0].status;
        if (newApptStatus === 'Completed' && existing.status !== newApptStatus) {
            const linkedExam = await client.query(`
                SELECT exam_id, status, queue_stage
                FROM examinations
                WHERE appointment_id = $1
                FOR UPDATE
            `, [id]);
            if (linkedExam.rows.some((exam) => !['Completed', 'Finalized'].includes(exam.status))) {
                await client.query('ROLLBACK');
                return next(new AppError(
                    'Complete the linked examination from the acquisition workspace and choose its result path.',
                    409,
                    true,
                    'ACQUISITION_COMPLETION_REQUIRED'
                ));
            }
        }
        if (
            newApptStatus === 'Cancelled' &&
            existing.status !== newApptStatus
        ) {
            await client.query(`
                UPDATE examinations
                SET status = 'Scheduled'::exam_status
                WHERE appointment_id = $1
                  AND status != 'Finalized'
            `, [id]);
        }

        await client.query('COMMIT');

        if (reminderChanged && ['Scheduled', 'Confirmed'].includes(result.rows[0].status)) {
            scheduleAppointmentReminder(db, result.rows[0]).catch(() => {});
        }

        // Fire notification when status changes to Cancelled
        if (existing.status !== 'Cancelled' && result.rows[0].status === 'Cancelled') {
            triggerEvent(db, 'AppointmentCancelled', {
                patientId: result.rows[0].patient_id,
                doctorId: result.rows[0].referring_doctor_id || undefined,
                entityType: 'Appointment',
                entityId: id,
                channels: ['Email', 'SMS'],
                variables: {
                    order_number: result.rows[0].order_number || '',
                    cancellation_reason: data.cancellationReason || 'N/A'
                }
            });
        }

        try { triggerMwlRegeneration(db); } catch {}
        res.json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
        }
        if (error.code === '23P01') {
            return next(new AppError('Time slot occupied.', 409));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const markNoShow = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const { reason } = req.body;

        // #2 — Open a transaction so status update + history are atomic
        client = await db.connect();
        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT * FROM appointments WHERE appointment_id = $1 FOR UPDATE',
            [id]
        );
        if (!existingResult.rows[0]) throw new AppError('Appointment not found', 404);
        const existing = existingResult.rows[0];
        if (!['Scheduled', 'Confirmed'].includes(existing.status)) {
            throw new AppError(`A ${existing.status} appointment cannot be marked as no-show`, 409);
        }
        if (new Date(existing.start_time) > new Date()) {
            throw new AppError('An appointment cannot be marked as no-show before its scheduled start time', 409);
        }

        const result = await client.query(`
            UPDATE appointments a
            SET status = 'No-Show',
                no_show_reason = $1,
                no_show_at = NOW()
            FROM (SELECT $3::varchar AS status) previous
            WHERE a.appointment_id = $2
            RETURNING a.*, previous.status as old_status
        `, [reason || null, id, existing.status]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Appointment not found', 404));
        }

        // Pass client (not pool) so this is inside the same transaction
        await insertOrderHistory(client, {
            appointmentId: id,
            oldStatus: result.rows[0].old_status,
            newStatus: 'No-Show',
            eventType: 'AppointmentNoShow',
            notes: reason || null,
            userId: req.user.user_id
        });

        await logAction(client, {
            userId: req.user.user_id,
            action: 'APPOINTMENT_NO_SHOW',
            resourceId: id,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: { reason: reason || null }
        });

        await cancelPendingAppointmentReminders(client, id);

        await client.query('COMMIT');

        const noShowPayload = {
            entityType: 'Appointment',
            entityId: id,
            priority: 'Warning',
            variables: {
                order_number: result.rows[0].order_number || '',
                appointment_time: new Date(result.rows[0].start_time).toLocaleString(),
                reason: reason || 'N/A'
            }
        };
        triggerEventForRole(db, 'AppointmentNoShow', 'Receptionist', noShowPayload);
        triggerEventForRole(db, 'AppointmentNoShow', 'Admin', noShowPayload);
        triggerEvent(db, 'PatientAppointmentNoShowNotice', {
            ...noShowPayload,
            patientId: result.rows[0].patient_id,
            channels: ['InApp', 'Email']
        });

        try { triggerMwlRegeneration(db); } catch {}
        res.json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const rescheduleAppointment = (db) => async (req, res, next) => {
    let client;

    try {
        const { id } = req.params;
        const { startTime, endTime, reason } = req.body;

        await ensureCatalogArchiveSchema(db);
        client = await db.connect();
        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT * FROM appointments WHERE appointment_id = $1 FOR UPDATE',
            [id]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Appointment not found', 404));
        }

        const existing = existingResult.rows[0];

        // #15 — Completed orders are terminal. Cancelled ones can be revived:
        // the UI exposes reschedule on cancelled rows, and rescheduling a
        // cancelled order back to 'Confirmed' is the documented reopen path.
        if (existing.status === 'Completed') {
            await client.query('ROLLBACK');
            return next(new AppError(`Cannot reschedule a ${existing.status} appointment.`, 422));
        }

        const revivingCancelled = existing.status === 'Cancelled';

        await assertSchedulingRules(client, existing.modality_id, startTime, endTime);

        const conflictResult = await client.query(`
            SELECT appointment_id FROM appointments
            WHERE appointment_id != $1
            AND modality_id = $2
            AND status != 'Cancelled'
            AND tstzrange(start_time, end_time) && tstzrange($3, $4)
            FOR UPDATE
        `, [id, existing.modality_id, startTime, endTime]);

        if (conflictResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return next(new AppError('This machine is already booked for the selected time slot.', 409));
        }

        await client.query(`
            INSERT INTO appointment_reschedule_history (
                appointment_id, old_start_time, old_end_time, new_start_time, new_end_time, reason, changed_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            id,
            existing.start_time,
            existing.end_time,
            startTime,
            endTime,
            reason || null,
            req.user.user_id
        ]);

        const result = await client.query(`
            UPDATE appointments
            SET start_time = $1,
                end_time = $2,
                status = CASE
                    WHEN status IN ('No-Show', 'Cancelled') THEN 'Confirmed'
                    ELSE status
                END
            WHERE appointment_id = $3
            RETURNING *
        `, [startTime, endTime, id]);

        if (revivingCancelled) {
            await client.query(`
                UPDATE appointments
                SET cancellation_reason = NULL,
                    cancelled_by = NULL,
                    cancelled_at = NULL
                WHERE appointment_id = $1
            `, [id]);

            await client.query(`
                UPDATE examinations
                SET queue_stage = 'Scheduled'
                WHERE appointment_id = $1 AND queue_stage = 'Cancelled'
            `, [id]);

            await insertOrderHistory(client, {
                appointmentId: id,
                oldStatus: 'Cancelled',
                newStatus: 'Confirmed',
                eventType: 'AppointmentReactivated',
                notes: reason || 'Revived through reschedule',
                userId: req.user.user_id
            });
        }

        await syncInvoicesAfterAppointmentReschedule(client, id, startTime);

        await insertOrderHistory(client, {
            appointmentId: id,
            oldStatus: existing.status,
            newStatus: result.rows[0].status,
            eventType: 'AppointmentRescheduled',
            notes: reason || null,
            userId: req.user.user_id
        });

        await logAction(client, {
            userId: req.user.user_id,
            action: 'APPOINTMENT_RESCHEDULED',
            resourceId: id,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: {
                oldStartTime: existing.start_time,
                oldEndTime: existing.end_time,
                newStartTime: startTime,
                newEndTime: endTime,
                reason: reason || null
            }
        });

        await cancelPendingAppointmentReminders(
            client,
            id,
            getAppointmentOccurrenceKey(result.rows[0].start_time)
        );

        await client.query('COMMIT');
        scheduleAppointmentReminder(db, result.rows[0]).catch(() => {});
        // Fire notification (fire-and-forget)
        const newTime = result.rows[0].start_time ? new Date(result.rows[0].start_time).toLocaleString() : '';
        triggerEvent(db, 'AppointmentRescheduled', {
            patientId: result.rows[0].patient_id,
            entityType: 'Appointment',
            entityId: id,
            occurrenceKey: result.rows[0].start_time
                ? new Date(result.rows[0].start_time).toISOString()
                : undefined,
            channels: ['Email', 'SMS'],
            variables: {
                order_number: result.rows[0].order_number,
                appointment_time: newTime,
                reschedule_reason: reason || 'N/A'
            }
        });
        try { triggerMwlRegeneration(db); } catch {}
        res.json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
        }
        if (error.code === '23P01') {
            return next(new AppError('Time slot occupied.', 409));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getOrderTimeline = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;

        const orderResult = await db.query(`
            SELECT a.appointment_id, e.exam_id, COALESCE(a.order_number, e.order_number) as order_number
            FROM appointments a
            LEFT JOIN examinations e ON e.appointment_id = a.appointment_id
            WHERE a.appointment_id::text = $1
               OR e.exam_id::text = $1
               OR a.order_number = $1
               OR e.order_number = $1
            LIMIT 1
        `, [id]);

        if (orderResult.rows.length === 0) {
            return next(new AppError('Order not found', 404));
        }

        const order = orderResult.rows[0];
        const historyResult = await db.query(`
            SELECT h.*, u.full_name as changed_by_name
            FROM order_status_history h
            LEFT JOIN users u ON h.changed_by = u.user_id
            WHERE h.appointment_id = $1
               OR ($2::uuid IS NOT NULL AND h.exam_id = $2::uuid)
            ORDER BY h.created_at ASC
        `, [order.appointment_id, order.exam_id]);

        res.json({
            orderNumber: order.order_number,
            appointmentId: order.appointment_id,
            examId: order.exam_id,
            timeline: historyResult.rows
        });
    } catch (error) {
        next(error);
    }
};

const getAvailability = (db) => async (req, res, next) => {
    try {
        await ensureCatalogArchiveSchema(db);
        const date = getRequestQuery(req).date || new Date().toISOString().slice(0, 10);
        const startDate = getRequestQuery(req).startDate || date;
        const endDate = getRequestQuery(req).endDate || date;

        // Single SQL query with JSON aggregation replaces the O(n*m) in-memory filtering.
        const [machineAvailability, staffAvailability] = await Promise.all([
            db.query(`
                SELECT
                    m.*,
                    CASE WHEN m.status = 'Active' THEN true ELSE false END as is_schedulable,
                    COALESCE(json_agg(
                        json_build_object(
                            'appointment_id', a.appointment_id,
                            'start_time', a.start_time,
                            'end_time', a.end_time,
                            'status', a.status,
                            'mrn', p.mrn,
                            'exam_type_name', et.name
                        )
                        ORDER BY a.start_time ASC
                    ) FILTER (WHERE a.appointment_id IS NOT NULL), '[]') as appointments
                FROM modalities m
                LEFT JOIN appointments a
                    ON a.modality_id = m.modality_id
                    AND a.start_time >= $1::date
                    AND a.start_time < ($2::date + '1 day'::interval)
                    AND a.status != 'Cancelled'
                LEFT JOIN patients p ON a.patient_id = p.patient_id
                LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
                WHERE m.deleted_at IS NULL
                GROUP BY m.modality_id
                ORDER BY m.name
            `, [startDate, endDate]),
            db.query(`
                SELECT
                    u.user_id, u.full_name, u.role,
                    COALESCE(json_agg(
                        json_build_object(
                            'appointment_id', a.appointment_id,
                            'start_time', a.start_time,
                            'end_time', a.end_time,
                            'status', a.status,
                            'machine_name', m.name,
                            'mrn', p.mrn,
                            'exam_type_name', et.name
                        )
                        ORDER BY a.start_time ASC
                    ) FILTER (WHERE a.appointment_id IS NOT NULL), '[]') as appointments
                FROM users u
                LEFT JOIN appointments a
                    ON (a.technician_id = u.user_id OR a.nurse_id = u.user_id OR a.radiologist_id = u.user_id)
                    AND a.start_time >= $1::date
                    AND a.start_time < ($2::date + '1 day'::interval)
                    AND a.status != 'Cancelled'
                LEFT JOIN modalities m ON a.modality_id = m.modality_id
                LEFT JOIN patients p ON a.patient_id = p.patient_id
                LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
                WHERE u.role IN ('Radiologist', 'Technician', 'Nurse')
                  AND u.is_active = true
                GROUP BY u.user_id
                ORDER BY u.role, u.full_name
            `, [startDate, endDate])
        ]);

        const machines = machineAvailability.rows;
        const staff = staffAvailability.rows;

        const workingHours = await getWorkingHours(db);

        res.json({
            workingHours: { start: workingHours.start, end: workingHours.end, holidays: workingHours.holidays },
            startDate,
            endDate,
            machines,
            staff
        });
    } catch (error) {
        next(error);
    }
};

const cancelAppointment = (db) => async (req, res, next) => {
    let client;

    try {
        const { reason } = req.body;
        const { id } = req.params;

        client = await db.connect();
        await client.query('BEGIN');

        const appointment = await client.query(
            'SELECT status, modality_id, exam_type_id, start_time FROM appointments WHERE appointment_id = $1 FOR UPDATE',
            [id]
        );
        if (!appointment.rows[0]) throw new AppError('Appointment not found', 404);
        const apptData = appointment.rows[0];
        if (['Cancelled', 'No-Show', 'Completed'].includes(apptData.status)) {
            throw new AppError(`This appointment is already ${apptData.status.toLowerCase()} and cannot be cancelled again`, 409);
        }


        // #14 — Guard: prevent deletion if there are associated payments/invoices
        const invoiceCheck = await client.query(`
            SELECT i.invoice_id, i.invoice_status
            FROM invoices i
            WHERE i.appointment_id = $1
              AND i.invoice_status NOT IN ('Voided', 'Draft')
            LIMIT 1
        `, [id]);

        if (invoiceCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return next(new AppError(
                'Cannot delete an appointment with active invoices or payments. Please void the invoice first.',
                422
            ));
        }

        // #14 — Guard: prevent deletion if a report has been finalized
        const examCheck = await client.query(`
            SELECT exam_id, status
            FROM examinations
            WHERE appointment_id = $1
              AND status IN ('Finalized', 'Reporting', 'Scanning')
            LIMIT 1
        `, [id]);

        if (examCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return next(new AppError(
                `Cannot delete an appointment while its exam is in ${examCheck.rows[0].status} status. Cancel the appointment instead.`,
                422
            ));
        }

        const result = await client.query(
            `UPDATE appointments
             SET status = 'Cancelled',
                 cancellation_reason = $3,
                 cancelled_by = $2,
                 cancelled_at = NOW()
             WHERE appointment_id = $1 AND status <> 'Cancelled'
             RETURNING appointment_id, patient_id, order_number`,
            [id, req.user.user_id, reason || 'Cancelled by staff']
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Appointment not found', 404));
        }

        await client.query(`
            UPDATE examinations
            SET queue_stage = 'Cancelled'
            WHERE appointment_id = $1 AND queue_stage NOT IN ('Finalized', 'Delivered')
        `, [id]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'APPOINTMENT_CANCELLED',
            resourceId: id,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: { reason: reason || 'Cancelled by staff' },
            required: true
        });

        await cancelPendingAppointmentReminders(client, id);

        await client.query('COMMIT');

        let matchingWaitlistCount = 0;
        try {
            const dateStr = apptData.start_time ? new Date(apptData.start_time).toISOString().slice(0, 10) : null;
            const waitlistCheck = await db.query(`
                SELECT COUNT(*)::int as match_count
                FROM waiting_list
                WHERE status IN ('Waiting', 'Contacted', 'Offered')
                  AND (modality_id IS NULL OR modality_id = $1)
                  AND (exam_type_id IS NULL OR exam_type_id = $2)
                  AND (preferred_date IS NULL OR preferred_date = $3::date)
            `, [apptData.modality_id, apptData.exam_type_id, dateStr]);
            matchingWaitlistCount = waitlistCheck.rows[0]?.match_count || 0;
        } catch (matchErr) {
            // non-fatal
        }

        await triggerEvent(db, 'AppointmentCancelled', {
            patientId: result.rows[0].patient_id,
            entityType: 'Appointment',
            entityId: id,
            variables: { order_number: result.rows[0].order_number, cancellation_reason: reason || 'Cancelled by staff' }
        });

        try { triggerMwlRegeneration(db); } catch {}
        res.json({
            message: 'Appointment cancelled; its history was preserved',
            matchingWaitlistCount
        });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getAppointments = (db) => async (req, res, next) => {
    try {
        const {
            date,
            startDate,
            endDate,
            modalityId,
            patientId,
            status,
            appointmentSource,
            preparationStatus,
            priority,
            assignedStaffId,
            roomId,
            roomNumber,
            receptionistId
        } = getRequestQuery(req);
        const { getPagination } = require('../utils/pagination');
        const { limit: safeLimit, offset } = getPagination(getRequestQuery(req), { defaultLimit: 200, maxLimit: 500 });
        let query = `
            SELECT a.*, p.mrn, p.first_name_enc, p.last_name_enc, m.name as machine_name, m.type as modality_type,
                   COALESCE(r.name, 'جناح فحص ' || m.room_number) as room_name,
                   COALESCE(r.room_number, m.room_number) as room_number,
                   r.status as room_status,
                   m.status as machine_status,
                   rec.full_name as receptionist_name,
                   et.name as exam_type_name,
                   et.preparation_instructions, et.body_part as exam_type_body_part, et.contrast_required as exam_type_contrast_required,
                   u.full_name as created_by_name,
                   tech.full_name as technician_name,
                   nurse.full_name as nurse_name,
                   rad.full_name as radiologist_name,
                   COALESCE(rd.full_name, a.referring_doctor) as referring_doctor_name,
                   e.exam_id,
                   e.queue_stage,
                   e.current_station,
                   e.delivered_at,
                   prior_e.order_number AS prior_order_number,
                   prior_e.status AS prior_exam_status,
                   prior_e.report_status AS prior_report_status,
                   COALESCE(prior_a.start_time, prior_e.created_at) AS prior_exam_time,
                   prior_et.name AS prior_exam_type_name,
                   prior_m.name AS prior_modality_name,
                   prior_m.type AS prior_modality_type
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            JOIN modalities m ON a.modality_id = m.modality_id
            LEFT JOIN rooms r ON COALESCE(a.room_id, m.room_id) = r.room_id
            LEFT JOIN users rec ON a.receptionist_id = rec.user_id
            LEFT JOIN examinations e ON a.appointment_id = e.appointment_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            LEFT JOIN users u ON a.created_by = u.user_id
            LEFT JOIN users tech ON a.technician_id = tech.user_id
            LEFT JOIN users nurse ON a.nurse_id = nurse.user_id
            LEFT JOIN users rad ON a.radiologist_id = rad.user_id
            LEFT JOIN referring_doctors rd ON a.referring_doctor_id = rd.doctor_id
            LEFT JOIN examinations prior_e ON prior_e.exam_id = a.prior_exam_id
            LEFT JOIN appointments prior_a ON prior_a.appointment_id = prior_e.appointment_id
            LEFT JOIN examination_types prior_et ON prior_et.type_id = prior_e.exam_type_id
            LEFT JOIN modalities prior_m ON prior_m.modality_id = prior_e.modality_id
            WHERE 1=1
        `;

        const queryParams = [];
        if (date) {
            queryParams.push(date);
            // Sargable day window (index-friendly range instead of ::date casts
            // on the column). Branch 1 matches the session-timezone (UTC) day,
            // branch 2 the center-timezone day — union preserves the previous
            // OR-of-casts semantics exactly while letting idx_appointments_start_time
            // serve both branches through BitmapOr.
            query += ` AND (
                (a.start_time >= $${queryParams.length}::date AND a.start_time < $${queryParams.length}::date + interval '1 day')
                OR (
                    a.start_time >= ($${queryParams.length}::date::timestamp AT TIME ZONE COALESCE(NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''), 'Africa/Cairo'))
                    AND a.start_time < (($${queryParams.length}::date::timestamp AT TIME ZONE COALESCE(NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''), 'Africa/Cairo')) + interval '1 day')
                )
            )`;
        }
        if (startDate) {
            queryParams.push(startDate);
            query += ` AND a.start_time >= $${queryParams.length}::timestamp`;
        }
        if (endDate) {
            queryParams.push(endDate);
            query += ` AND a.start_time < $${queryParams.length}::timestamp + interval '1 day'`;
        }
        if (modalityId) {
            queryParams.push(modalityId);
            query += ` AND a.modality_id = $${queryParams.length}`;
        }
        if (patientId) {
            queryParams.push(patientId);
            query += ` AND a.patient_id = $${queryParams.length}`;
        }
        if (roomId) {
            queryParams.push(roomId);
            query += ` AND COALESCE(a.room_id, m.room_id) = $${queryParams.length}`;
        }
        if (roomNumber) {
            queryParams.push(roomNumber);
            query += ` AND LOWER(COALESCE(r.room_number, m.room_number)) = LOWER($${queryParams.length})`;
        }
        if (receptionistId) {
            queryParams.push(receptionistId);
            query += ` AND a.receptionist_id = $${queryParams.length}`;
        }
        if (status) {
            queryParams.push(status);
            query += ` AND a.status = $${queryParams.length}`;
        }
        if (appointmentSource) {
            queryParams.push(appointmentSource);
            query += ` AND a.appointment_source = $${queryParams.length}`;
        }
        if (preparationStatus) {
            queryParams.push(preparationStatus);
            query += ` AND a.preparation_status = $${queryParams.length}`;
        }
        if (priority) {
            queryParams.push(priority);
            query += ` AND a.priority = $${queryParams.length}`;
        }
        query += appendAppointmentVisibility(req, queryParams);
        if (assignedStaffId) {
            const effectiveStaffId = ['Technician', 'Nurse', 'Radiologist'].includes(req.user.role)
                ? req.user.user_id
                : assignedStaffId;
            queryParams.push(effectiveStaffId);
            query += ` AND (a.technician_id = $${queryParams.length} OR a.nurse_id = $${queryParams.length} OR a.radiologist_id = $${queryParams.length})`;
        }

        query += ` ORDER BY a.start_time ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(safeLimit, offset);

        const result = await db.query(query, queryParams);

        const appointments = result.rows.map(row => {
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

        res.json(appointments);
    } catch (error) {
        next(error);
    }
};

const getAppointmentById = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        let targetId = id;
        let attachedPayment = null;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
            const payCheck = await db.query(`
                SELECT p.payment_id, p.amount, p.method, p.payment_reference, p.transaction_date, p.created_at,
                       inv.invoice_id, inv.invoice_number, inv.appointment_id, inv.exam_id, inv.patient_id,
                       e.appointment_id AS exam_appointment_id
                FROM payments p
                JOIN invoices inv ON inv.invoice_id = p.invoice_id
                LEFT JOIN examinations e ON e.exam_id = inv.exam_id
                WHERE p.payment_id = $1::uuid
            `, [id]).catch(() => ({ rows: [] }));

            if (payCheck.rows.length) {
                const payRow = payCheck.rows[0];
                attachedPayment = {
                    payment_id: payRow.payment_id,
                    amount: payRow.amount,
                    method: payRow.method,
                    payment_reference: payRow.payment_reference,
                    transaction_date: payRow.transaction_date || payRow.created_at,
                    invoice_number: payRow.invoice_number,
                    invoice_id: payRow.invoice_id,
                };
                if (payRow.appointment_id || payRow.exam_appointment_id) {
                    targetId = payRow.appointment_id || payRow.exam_appointment_id;
                }
            } else {
                const invCheck = await db.query(`
                    SELECT inv.appointment_id, inv.exam_id, e.appointment_id AS exam_appointment_id
                    FROM invoices inv
                    LEFT JOIN examinations e ON e.exam_id = inv.exam_id
                    WHERE inv.invoice_id = $1::uuid
                `, [id]).catch(() => ({ rows: [] }));
                if (invCheck.rows.length && (invCheck.rows[0].appointment_id || invCheck.rows[0].exam_appointment_id)) {
                    targetId = invCheck.rows[0].appointment_id || invCheck.rows[0].exam_appointment_id;
                }
            }
        }

        const query = `
            SELECT a.*, p.mrn, p.first_name_enc, p.last_name_enc, m.name as machine_name, m.type as modality_type, et.name as exam_type_name,
                   et.preparation_instructions, et.body_part as exam_type_body_part, et.contrast_required as exam_type_contrast_required,
                   u.full_name as created_by_name,
                   tech.full_name as technician_name,
                   nurse.full_name as nurse_name,
                   rad.full_name as radiologist_name,
                   COALESCE(rd.full_name, a.referring_doctor) as referring_doctor_name,
                   p.date_of_birth_enc, p.gender,
                   e.exam_id,
                   e.queue_stage,
                   e.current_station,
                   e.delivered_at,
                   prior_e.order_number AS prior_order_number,
                   prior_e.status AS prior_exam_status,
                   prior_e.report_status AS prior_report_status,
                   COALESCE(prior_a.start_time, prior_e.created_at) AS prior_exam_time,
                   prior_et.name AS prior_exam_type_name,
                   prior_m.name AS prior_modality_name,
                   prior_m.type AS prior_modality_type,
                   COALESCE(r.name, 'جناح فحص ' || m.room_number) as room_name,
                   COALESCE(r.room_number, m.room_number) as room_number,
                   r.status as room_status,
                   m.status as machine_status,
                   rec.full_name as receptionist_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            JOIN modalities m ON a.modality_id = m.modality_id
            LEFT JOIN rooms r ON COALESCE(a.room_id, m.room_id) = r.room_id
            LEFT JOIN users rec ON a.receptionist_id = rec.user_id
            LEFT JOIN examinations e ON a.appointment_id = e.appointment_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            LEFT JOIN users u ON a.created_by = u.user_id
            LEFT JOIN users tech ON a.technician_id = tech.user_id
            LEFT JOIN users nurse ON a.nurse_id = nurse.user_id
            LEFT JOIN users rad ON a.radiologist_id = rad.user_id
            LEFT JOIN referring_doctors rd ON a.referring_doctor_id = rd.doctor_id
            LEFT JOIN examinations prior_e ON prior_e.exam_id = a.prior_exam_id
            LEFT JOIN appointments prior_a ON prior_a.appointment_id = prior_e.appointment_id
            LEFT JOIN examination_types prior_et ON prior_et.type_id = prior_e.exam_type_id
            LEFT JOIN modalities prior_m ON prior_m.modality_id = prior_e.modality_id
            WHERE a.appointment_id = $1
        `;
        const queryParams = [targetId];
        const result = await db.query(`${query}${appendAppointmentVisibility(req, queryParams)}`, queryParams);
        if (result.rows.length === 0) {
            if (attachedPayment) {
                const invoiceDetails = await db.query(`
                    SELECT inv.*, p.mrn, p.first_name_enc, p.last_name_enc, p.date_of_birth_enc, p.gender,
                           m.name as machine_name, m.type as modality_type,
                           et.name as exam_type_name, et.preparation_instructions
                    FROM invoices inv
                    JOIN patients p ON inv.patient_id = p.patient_id
                    LEFT JOIN examinations e ON inv.exam_id = e.exam_id
                    LEFT JOIN modalities m ON e.modality_id = m.modality_id
                    LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
                    WHERE inv.invoice_id = $1
                `, [attachedPayment.invoice_id]).catch(() => ({ rows: [] }));

                if (invoiceDetails.rows.length) {
                    const invRow = invoiceDetails.rows[0];
                    const [itemsRes, paymentsRes] = await Promise.all([
                        db.query(`SELECT item_id, description, quantity, unit_price, total_price, item_type FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC`, [invRow.invoice_id]).catch(() => ({ rows: [] })),
                        db.query(`SELECT p.payment_id, p.amount, p.method, p.payment_reference, p.transaction_date, p.created_at, p.payment_status, u.full_name as cashier_name FROM payments p LEFT JOIN users u ON p.cashier_id = u.user_id WHERE p.invoice_id = $1 ORDER BY p.transaction_date ASC, p.created_at ASC`, [invRow.invoice_id]).catch(() => ({ rows: [] }))
                    ]);
                    const synthesized = {
                        appointment_id: attachedPayment.payment_id,
                        order_number: invRow.invoice_number,
                        patient_id: invRow.patient_id,
                        mrn: invRow.mrn,
                        gender: invRow.gender,
                        exam_type_name: invRow.exam_type_name || 'Medical Examination',
                        machine_name: invRow.machine_name || 'Center',
                        modality_type: invRow.modality_type || 'General',
                        start_time: attachedPayment.transaction_date,
                        created_at: invRow.created_at,
                        payment: attachedPayment,
                        invoice: {
                            invoice_id: invRow.invoice_id,
                            invoice_number: invRow.invoice_number,
                            total_amount: invRow.total_amount,
                            patient_payable_amount: invRow.patient_payable_amount,
                            insurance_covered_amount: invRow.insurance_covered_amount,
                            invoice_status: invRow.invoice_status
                        },
                        items: itemsRes.rows,
                        payments: paymentsRes.rows
                    };
                    if (invRow.first_name_enc || invRow.last_name_enc) {
                        synthesized.patient_name = [decrypt(invRow.first_name_enc), decrypt(invRow.last_name_enc)].filter(Boolean).join(' ');
                    }
                    if (invRow.date_of_birth_enc) {
                        synthesized.date_of_birth = decrypt(invRow.date_of_birth_enc);
                    }
                    return res.json(synthesized);
                }
            }
            return res.status(404).json({ error: 'Appointment not found' });
        }
        
        const row = result.rows[0];
        const mapped = { ...row };
        if (row.first_name_enc || row.last_name_enc) {
            mapped.patient_name = [decrypt(row.first_name_enc), decrypt(row.last_name_enc)]
                .filter(Boolean)
                .join(' ');
        }
        if (row.date_of_birth_enc) {
            mapped.date_of_birth = decrypt(row.date_of_birth_enc);
        }
        delete mapped.first_name_enc;
        delete mapped.last_name_enc;
        delete mapped.date_of_birth_enc;

        const resolvedInvoiceId = attachedPayment?.invoice_id || (await db.query(`
            SELECT invoice_id FROM invoices
            WHERE appointment_id = $1
            ORDER BY created_at DESC LIMIT 1
        `, [mapped.appointment_id]).then(r => r.rows[0]?.invoice_id).catch(() => null));

        if (resolvedInvoiceId) {
            const [invRowRes, itemsRes, paymentsRes] = await Promise.all([
                db.query(`SELECT invoice_id, invoice_number, total_amount, patient_payable_amount, insurance_covered_amount, invoice_status FROM invoices WHERE invoice_id = $1`, [resolvedInvoiceId]).catch(() => ({ rows: [] })),
                db.query(`SELECT item_id, description, quantity, unit_price, total_price, item_type FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC`, [resolvedInvoiceId]).catch(() => ({ rows: [] })),
                db.query(`SELECT p.payment_id, p.amount, p.method, p.payment_reference, p.transaction_date, p.created_at, p.payment_status, u.full_name as cashier_name FROM payments p LEFT JOIN users u ON p.cashier_id = u.user_id WHERE p.invoice_id = $1 ORDER BY p.transaction_date ASC, p.created_at ASC`, [resolvedInvoiceId]).catch(() => ({ rows: [] }))
            ]);
            mapped.invoice = invRowRes.rows[0] || null;
            mapped.items = itemsRes.rows;
            mapped.payments = paymentsRes.rows;
            if (attachedPayment) {
                mapped.payment = attachedPayment;
            } else if (paymentsRes.rows.length) {
                mapped.payment = paymentsRes.rows[paymentsRes.rows.length - 1];
            }
        } else if (attachedPayment) {
            mapped.payment = attachedPayment;
        }

        const relatedAppts = await db.query(`
            SELECT a.appointment_id, a.order_number, a.start_time, a.status,
                   et.name as exam_type_name, m.type as modality_type, m.name as machine_name,
                   COALESCE(r.name, 'جناح ' || m.room_number) as room_name,
                   COALESCE(r.room_number, m.room_number) as room_number
            FROM appointments a
            JOIN modalities m ON a.modality_id = m.modality_id
            LEFT JOIN rooms r ON COALESCE(a.room_id, m.room_id) = r.room_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            WHERE a.patient_id = $1
              AND a.appointment_id != $2
              AND a.start_time::date = $3::date
            ORDER BY a.start_time ASC
        `, [mapped.patient_id, mapped.appointment_id, mapped.start_time || new Date()]).catch(() => ({ rows: [] }));
        mapped.related_appointments = relatedAppts.rows;

        res.json(mapped);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createAppointment,
    getAppointments,
    getAppointmentById,
    updateAppointment,
    markNoShow,
    rescheduleAppointment,
    getAvailability,
    cancelAppointment,
    getOrderTimeline,
    assertSchedulingRules,
    getExamDefaults,
    buildOrderFields,
    resolveFollowUp
};
