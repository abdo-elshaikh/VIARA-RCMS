const { AppError } = require('../middleware/errorHandler');
const { triggerEvent } = require('../services/notificationJobService');
const { getWorkingHours, assertWithinWorkingHours } = require('../services/schedulingService');
const { decrypt } = require('../utils/crypto');
const { logAction } = require('../services/auditService');
const crypto = require('crypto');

const generateOrderNumber = () => {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `ORD-${datePart}-${randomPart}`;
};

let catalogArchiveSchemaPromise = null;
const ensureCatalogArchiveSchema = async (db) => {
    if (!catalogArchiveSchemaPromise) {
        catalogArchiveSchemaPromise = db.query(`
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
            ALTER TABLE examination_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
        `).catch((error) => {
            catalogArchiveSchemaPromise = null;
            throw error;
        });
    }
    return catalogArchiveSchemaPromise;
};

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

const assertSchedulingRules = async (client, modalityId, startTime, endTime) => {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        throw new AppError('Invalid appointment time range.', 400);
    }

    const workingHours = await getWorkingHours(client);
    assertWithinWorkingHours(startTime, endTime, workingHours);

    const machineResult = await client.query(
        'SELECT modality_id, status FROM modalities WHERE modality_id = $1 AND deleted_at IS NULL',
        [modalityId]
    );

    if (machineResult.rows.length === 0) {
        throw new AppError('Machine not found.', 404);
    }

    if (machineResult.rows[0].status !== 'Active') {
        throw new AppError(`This machine is ${machineResult.rows[0].status.toLowerCase()} and cannot be scheduled.`, 409);
    }

    // Phase 14: Check for equipment downtime
    const downtimeCheck = await client.query(`
        SELECT downtime_id, reason FROM equipment_downtime
        WHERE modality_id = $1 
        AND status != 'Resolved'
        AND tstzrange(start_time, end_time) && tstzrange($2, $3)
    `, [modalityId, startTime, endTime]);

    if (downtimeCheck.rows.length > 0) {
        const d = downtimeCheck.rows[0];
        throw new AppError(`This machine is under maintenance or experiencing downtime for the selected time slot. Reason: ${d.reason}`, 409);
    }
};

const createAppointment = (db) => async (req, res, next) => {
    let client;

    try {
        const data = req.body;
        const userId = req.user.user_id;

        await ensureCatalogArchiveSchema(db);
        client = await db.connect();
        await client.query('BEGIN');

        try {
            await assertSchedulingRules(client, data.modalityId, data.startTime, data.endTime);

            const conflictQuery = `
              SELECT appointment_id FROM appointments
              WHERE modality_id = $1
              AND status != 'Cancelled'
              AND tstzrange(start_time, end_time) && tstzrange($2, $3)
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

            const examDefaults = await getExamDefaults(client, data.examTypeId, data.modalityId);
            const orderFields = buildOrderFields(data, {}, examDefaults);
            const followUp = await resolveFollowUp(client, {
                isFollowUp: Boolean(data.isFollowUp),
                priorExamId: data.priorExamId,
                patientId: data.patientId,
                startTime: data.startTime
            });
            const appointmentStatus = data.arrived ? 'Checked-in' : 'Confirmed';

            const insertQuery = `
              INSERT INTO appointments (
                patient_id, modality_id, exam_type_id, start_time, end_time, notes, created_by,
                referring_doctor, referring_doctor_id, technician_id, nurse_id, radiologist_id, payment_method, payment_amount,
                appointment_source, preparation_status, order_number, priority, clinical_indication,
                provisional_diagnosis, icd_code, body_part, contrast_required, pregnancy_safety_status,
                implant_safety_status, renal_safety_status, status,
                is_follow_up, prior_exam_id, follow_up_reason
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                $28, $29, $30
              )
              RETURNING *
            `;

            const values = [
                data.patientId,
                data.modalityId,
                data.examTypeId,
                data.startTime,
                data.endTime,
                data.notes,
                userId,
                data.referringDoctor || null,
                data.referringDoctorId || null,
                data.technicianId || null,
                data.nurseId || null,
                data.radiologistId || null,
                data.paymentMethod,
                data.paymentAmount,
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

            const examInsert = `
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
                RETURNING exam_id
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
                appointment.follow_up_reason
            ]);

            await insertOrderHistory(client, {
                appointmentId: appointment.appointment_id,
                examId: examResult.rows[0].exam_id,
                newStatus: examStatus,
                eventType: 'ExamCreated',
                notes: 'Exam created from appointment order',
                userId
            });

            await client.query('COMMIT');

            // #4 — Fetch the patient's real name before firing notification
            const patientResult = await db.query(
                'SELECT first_name_enc, last_name_enc FROM patients WHERE patient_id = $1',
                [appointment.patient_id]
            );
            let patientName = appointment.order_number; // fallback
            if (patientResult.rows.length > 0) {
                const p = patientResult.rows[0];
                patientName = [decrypt(p.first_name_enc), decrypt(p.last_name_enc)]
                    .filter(Boolean)
                    .join(' ') || appointment.order_number;
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
                    exam_type: '',
                    modality: '',
                    prep_instructions: '',
                    prep_short: ''
                }
            });

            // Fire PrepInstructions notification if preparation is required
            if (appointment.preparation_status && appointment.preparation_status !== 'Not Required') {
                // Fetch exam type preparation instructions if available
                let prepText = '';
                if (data.examTypeId) {
                    const etResult = await db.query(
                        'SELECT preparation_instructions FROM examination_types WHERE type_id = $1',
                        [data.examTypeId]
                    );
                    prepText = etResult.rows[0]?.preparation_instructions || '';
                }
                if (prepText) {
                    triggerEvent(db, 'PrepInstructions', {
                        patientId: appointment.patient_id,
                        entityType: 'Appointment',
                        entityId: appointment.appointment_id,
                        channels: ['Email', 'SMS'],
                        variables: {
                            order_number: appointment.order_number,
                            appointment_time: apptTime,
                            prep_instructions: prepText,
                            prep_short: prepText.length > 100 ? prepText.slice(0, 97) + '...' : prepText
                        }
                    });
                }
            }

            res.status(201).json(appointment);
        } catch (error) {
            await client.query('ROLLBACK');
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
            limit = 200,
            offset = 0
        } = req.query;
        // #13 — Cap limit to prevent bulk enumeration
        const safeLimit = Math.min(Number(limit) || 200, 500);
        let query = `
            SELECT a.*, p.mrn, p.first_name_enc, p.last_name_enc, m.name as machine_name, m.type as modality_type, et.name as exam_type_name,
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
        const values = [];
        let paramCount = 1;

        if (modalityId) {
            query += ` AND a.modality_id = $${paramCount}`;
            values.push(modalityId);
            paramCount++;
        }

        if (patientId) {
            query += ` AND a.patient_id = $${paramCount}`;
            values.push(patientId);
            paramCount++;
        }

        if (status) {
            query += ` AND a.status = $${paramCount}`;
            values.push(status);
            paramCount++;
        }

        if (appointmentSource) {
            query += ` AND a.appointment_source = $${paramCount}`;
            values.push(appointmentSource);
            paramCount++;
        }

        if (preparationStatus) {
            query += ` AND a.preparation_status = $${paramCount}`;
            values.push(preparationStatus);
            paramCount++;
        }

        if (priority) {
            query += ` AND a.priority = $${paramCount}`;
            values.push(priority);
            paramCount++;
        }

        if (assignedStaffId) {
            if (req.user.role === 'Radiologist' && assignedStaffId === req.user.user_id) {
                query += ` AND (a.radiologist_id = $${paramCount} OR a.radiologist_id IS NULL)`;
            } else {
                query += ` AND (a.technician_id = $${paramCount} OR a.nurse_id = $${paramCount} OR a.radiologist_id = $${paramCount})`;
            }
            values.push(assignedStaffId);
            paramCount++;
        }

        if (date) {
            query += ` AND a.start_time >= $${paramCount}::date AND a.start_time < ($${paramCount}::date + '1 day'::interval)`;
            values.push(date);
            paramCount++;
        } else if (startDate || endDate) {
            if (startDate) {
                query += ` AND a.start_time >= $${paramCount}::date`;
                values.push(startDate);
                paramCount++;
            }

            if (endDate) {
                query += ` AND a.start_time < ($${paramCount}::date + '1 day'::interval)`;
                values.push(endDate);
                paramCount++;
            }
        }

        query += ` ORDER BY CASE a.priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END, a.start_time ASC LIMIT $${paramCount++} OFFSET $${paramCount}`;
        values.push(safeLimit, offset);

        const result = await db.query(query, values);
        
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
}

const updateAppointment = (db) => async (req, res, next) => {
    let client;

    try {
        const { id } = req.params;
        const data = req.body;

        await ensureCatalogArchiveSchema(db);
        client = await db.connect();
        await client.query('BEGIN');

        const existingResult = await client.query(
            'SELECT * FROM appointments WHERE appointment_id = $1',
            [id]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Appointment not found', 404));
        }

        const existing = existingResult.rows[0];
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
            appointment_source: data.appointmentSource ?? existing.appointment_source,
            preparation_status: data.preparationStatus ?? existing.preparation_status,
            cancellation_reason: data.cancellationReason ?? existing.cancellation_reason,
            is_follow_up: followUp.is_follow_up,
            prior_exam_id: followUp.prior_exam_id,
            follow_up_reason: followUp.is_follow_up
                ? (data.followUpReason !== undefined ? data.followUpReason : existing.follow_up_reason)
                : null,
            ...orderFields
        };

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
                appointment_source = $15,
                preparation_status = $16,
                cancellation_reason = $17,
                order_number = $18,
                priority = $19,
                clinical_indication = $20,
                provisional_diagnosis = $21,
                icd_code = $22,
                body_part = $23,
                contrast_required = $24,
                pregnancy_safety_status = $25,
                implant_safety_status = $26,
                renal_safety_status = $27,
                is_follow_up = $28,
                prior_exam_id = $29,
                follow_up_reason = $30,
                cancelled_by = CASE WHEN $6::varchar(20) = 'Cancelled' AND status != 'Cancelled' THEN $31 ELSE cancelled_by END,
                cancelled_at = CASE WHEN $6::varchar(20) = 'Cancelled' AND status != 'Cancelled' THEN NOW() ELSE cancelled_at END
            WHERE appointment_id = $32
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
            RETURNING exam_id
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
                RETURNING exam_id
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

        // #10 — Sync linked exam status when appointment is Cancelled or Completed
        const newApptStatus = result.rows[0].status;
        if (
            (newApptStatus === 'Cancelled' || newApptStatus === 'Completed') &&
            existing.status !== newApptStatus
        ) {
            const examStatus = newApptStatus === 'Cancelled' ? 'Scheduled' : 'Finalized';
            await client.query(`
                UPDATE examinations
                SET status = $1::exam_status,
                    queue_stage = CASE WHEN $1::exam_status = 'Finalized' THEN 'Finalized' ELSE queue_stage END,
                    current_station = CASE WHEN $1::exam_status = 'Finalized' THEN 'Delivery' ELSE current_station END
                WHERE appointment_id = $2
                  AND status != 'Finalized'
            `, [examStatus, id]);
        }

        await client.query('COMMIT');

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

        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
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

        const result = await client.query(`
            UPDATE appointments a
            SET status = 'No-Show',
                no_show_reason = $1,
                no_show_at = NOW()
            FROM (SELECT status FROM appointments WHERE appointment_id = $2) previous
            WHERE a.appointment_id = $2
            RETURNING a.*, previous.status as old_status
        `, [reason || null, id]);

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

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
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
            'SELECT * FROM appointments WHERE appointment_id = $1',
            [id]
        );

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Appointment not found', 404));
        }

        const existing = existingResult.rows[0];

        // #15 — Block rescheduling appointments that are already completed
        if (existing.status === 'Completed' || existing.status === 'Cancelled') {
            await client.query('ROLLBACK');
            return next(new AppError(`Cannot reschedule a ${existing.status} appointment.`, 422));
        }

        await assertSchedulingRules(client, existing.modality_id, startTime, endTime);

        const conflictResult = await client.query(`
            SELECT appointment_id FROM appointments
            WHERE appointment_id != $1
            AND modality_id = $2
            AND status != 'Cancelled'
            AND tstzrange(start_time, end_time) && tstzrange($3, $4)
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
                status = CASE WHEN status = 'No-Show' THEN 'Confirmed' ELSE status END
            WHERE appointment_id = $3
            RETURNING *
        `, [startTime, endTime, id]);

        await insertOrderHistory(client, {
            appointmentId: id,
            oldStatus: existing.status,
            newStatus: result.rows[0].status,
            eventType: 'AppointmentRescheduled',
            notes: reason || null,
            userId: req.user.user_id
        });

        await client.query('COMMIT');
        // Fire notification (fire-and-forget)
        const newTime = result.rows[0].start_time ? new Date(result.rows[0].start_time).toLocaleString() : '';
        triggerEvent(db, 'AppointmentRescheduled', {
            patientId: result.rows[0].patient_id,
            entityType: 'Appointment',
            entityId: id,
            channels: ['Email', 'SMS'],
            variables: {
                order_number: result.rows[0].order_number,
                appointment_time: newTime,
                reschedule_reason: reason || 'N/A'
            }
        });
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
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
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const startDate = req.query.startDate || date;
        const endDate = req.query.endDate || date;

        const [machinesResult, appointmentsResult, staffResult] = await Promise.all([
            db.query('SELECT * FROM modalities WHERE deleted_at IS NULL ORDER BY name'),
            db.query(`
                SELECT a.appointment_id, a.start_time, a.end_time, a.status, a.modality_id,
                       a.technician_id, a.nurse_id, a.radiologist_id,
                       p.mrn, m.name as machine_name, et.name as exam_type_name
                FROM appointments a
                JOIN patients p ON a.patient_id = p.patient_id
                JOIN modalities m ON a.modality_id = m.modality_id
                LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
                WHERE a.start_time >= $1::date
                  AND a.start_time < ($2::date + '1 day'::interval)
                  AND a.status != 'Cancelled'
                ORDER BY a.start_time ASC
            `, [startDate, endDate]),
            db.query(`
                SELECT user_id, full_name, role
                FROM users
                WHERE role IN ('Radiologist', 'Technician', 'Nurse')
                  AND is_active = true
                ORDER BY role, full_name
            `)
        ]);

        const appointments = appointmentsResult.rows;
        const machines = machinesResult.rows.map(machine => ({
            ...machine,
            is_schedulable: machine.status === 'Active',
            appointments: appointments.filter(appt => appt.modality_id === machine.modality_id)
        }));

        const staff = staffResult.rows.map(user => ({
            ...user,
            appointments: appointments.filter(appt =>
                appt.technician_id === user.user_id
                || appt.nurse_id === user.user_id
                || appt.radiologist_id === user.user_id
            )
        }));

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

        await logAction(client, {
            userId: req.user.user_id,
            action: 'APPOINTMENT_CANCELLED',
            resourceId: id,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: { reason: reason || 'Cancelled by staff' },
            required: true
        });
        await client.query('COMMIT');
        await triggerEvent(db, 'AppointmentCancelled', {
            patientId: result.rows[0].patient_id,
            entityType: 'Appointment',
            entityId: id,
            variables: { order_number: result.rows[0].order_number, cancellation_reason: reason || 'Cancelled by staff' }
        });
        res.json({ message: 'Appointment cancelled; its history was preserved' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getAppointmentById = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
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
                   prior_m.type AS prior_modality_type
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            JOIN modalities m ON a.modality_id = m.modality_id
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
        const result = await db.query(query, [id]);
        if (result.rows.length === 0) {
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
    getOrderTimeline
};
