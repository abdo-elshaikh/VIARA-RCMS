const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { assertInvoiceFullyPaid, assertInvoiceTransactionAllowed } = require('../services/partialPaymentExceptionService');
const { validateEnum, validateUUID, VALID_QUEUE_STAGES, VALID_STATIONS, VALID_PRIORITIES } = require('../utils/queryValidator');
const { decrypt } = require('../utils/crypto');

const QUEUE_STAGES = [
    'Registered',
    'Scheduled',
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Reporting',
    'Finalized',
    'Delivered',
    'Cancelled'
];

const VALID_TRANSITIONS = {
    Registered: ['Scheduled', 'Cancelled'],
    Scheduled: ['Arrived', 'Cancelled'],
    Arrived: ['Payment Pending', 'Prep Pending', 'Ready for Exam', 'Cancelled'],
    'Payment Pending': ['Prep Pending', 'Ready for Exam', 'Cancelled'],
    'Prep Pending': ['Ready for Exam', 'Cancelled'],
    'Ready for Exam': ['In Exam', 'Cancelled'],
    'In Exam': ['Reporting', 'Cancelled'],
    Reporting: ['Finalized', 'Cancelled'],
    Finalized: ['Delivered'],
    Delivered: [],
    Cancelled: []
};

const ROLE_STAGE_PERMISSIONS = {
    Admin: QUEUE_STAGES,
    Receptionist: ['Registered', 'Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam', 'Delivered', 'Cancelled'],
    Accountant: ['Payment Pending', 'Prep Pending', 'Ready for Exam'],
    Nurse: ['Arrived', 'Prep Pending', 'Ready for Exam', 'Cancelled'],
    Technician: ['In Exam', 'Reporting', 'Cancelled'],
    Radiologist: ['Reporting', 'Finalized']
};

const STAGE_STATION = {
    Registered: 'Reception',
    Scheduled: 'Reception',
    Arrived: 'Reception',
    'Payment Pending': 'Cashier',
    'Prep Pending': 'Nurse',
    'Ready for Exam': 'Modality',
    'In Exam': 'Modality',
    Reporting: 'Radiologist',
    Finalized: 'Delivery',
    Delivered: 'Delivery'
};

const STAGE_EXAM_STATUS = {
    Registered: 'Scheduled',
    Scheduled: 'Scheduled',
    Arrived: 'Checked-in',
    'Payment Pending': 'Checked-in',
    'Prep Pending': 'Checked-in',
    'Ready for Exam': 'Checked-in',
    'In Exam': 'Scanning',
    Reporting: 'Reporting',
    Finalized: 'Finalized',
    Delivered: 'Finalized',
    Cancelled: 'Scheduled'
};

const OVERDUE_MINUTES = {
    Registered: 15,
    Scheduled: 60,
    Arrived: 20,
    'Payment Pending': 15,
    'Prep Pending': 30,
    'Ready for Exam': 20,
    'In Exam': 60,
    Reporting: 120,
    Finalized: 60,
    Delivered: 0,
    Cancelled: 0
};

const timestampAssignments = (stage) => {
    const assignments = [];

    if (stage === 'Arrived') assignments.push('arrived_at = COALESCE(arrived_at, NOW())');
    if (stage === 'Prep Pending') assignments.push('prep_started_at = COALESCE(prep_started_at, NOW())');
    if (stage === 'Ready for Exam') assignments.push('prep_completed_at = COALESCE(prep_completed_at, NOW())');
    if (stage === 'In Exam') assignments.push('exam_started_at = COALESCE(exam_started_at, NOW())');
    if (stage === 'Reporting') {
        assignments.push('exam_completed_at = COALESCE(exam_completed_at, NOW())');
        assignments.push('reporting_started_at = COALESCE(reporting_started_at, NOW())');
    }
    if (stage === 'Finalized') assignments.push('report_finalized_at = COALESCE(report_finalized_at, NOW())');
    if (stage === 'Delivered') assignments.push('delivered_at = COALESCE(delivered_at, NOW())');

    return assignments;
};

const canRoleTransition = (role, toStage) => {
    const allowed = ROLE_STAGE_PERMISSIONS[role] || [];
    return allowed.includes(toStage);
};

const getQueue = (db) => async (req, res, next) => {
    try {
        const {
            stage,
            station,
            priority,
            date,
            includeDelivered = 'false',
            limit = 200,
            offset = 0
        } = req.query;

        // Input validation to prevent SQL injection
        validateEnum(stage, VALID_QUEUE_STAGES, 'stage');
        validateEnum(station, VALID_STATIONS, 'station');
        validateEnum(priority, VALID_PRIORITIES, 'priority');

        const values = [];
        let param = 1;
        let query = `
            WITH last_event AS (
                SELECT DISTINCT ON (exam_id)
                    exam_id,
                    created_at as last_event_at
                FROM queue_events
                ORDER BY exam_id, created_at DESC
            )
            SELECT e.exam_id, e.appointment_id, e.status, e.queue_stage, e.current_station,
                   e.arrived_at, e.prep_started_at, e.prep_completed_at, e.exam_started_at,
                   e.exam_completed_at, e.reporting_started_at, e.report_finalized_at, e.delivered_at,
                   e.is_on_hold, e.hold_started_at, e.hold_released_at, e.hold_reason,
                   e.order_number, e.priority, e.clinical_indication, e.body_part, e.contrast_required,
                   e.pregnancy_safety_status, e.implant_safety_status, e.renal_safety_status,
                   e.is_follow_up, e.prior_exam_id, e.follow_up_reason,
                   e.report_content,
                   e.created_at,
                   a.start_time, a.end_time, a.preparation_status,
                   p.mrn, p.gender, p.first_name_enc, p.last_name_enc,
                   m.name as modality_name, m.type as modality_type,
                   et.name as exam_type_name, et.preparation_instructions,
                   tech.full_name as technician_name,
                   nurse.full_name as nurse_name,
                   rad.full_name as radiologist_name,
                   COALESCE(le.last_event_at, e.arrived_at, e.created_at) as stage_started_at,
                   ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(le.last_event_at, e.arrived_at, e.created_at))) / 60) as waiting_minutes,
                   ROUND(EXTRACT(EPOCH FROM (COALESCE(e.delivered_at, e.report_finalized_at, NOW()) - e.created_at)) / 60) as turnaround_minutes,
                   prior_e.order_number AS prior_order_number,
                   prior_e.report_status AS prior_report_status,
                   COALESCE(prior_a.start_time, prior_e.created_at) AS prior_exam_time,
                   prior_et.name AS prior_exam_type_name
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.appointment_id
            JOIN patients p ON e.patient_id = p.patient_id
            JOIN modalities m ON e.modality_id = m.modality_id
            LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
            LEFT JOIN users tech ON a.technician_id = tech.user_id
            LEFT JOIN users nurse ON a.nurse_id = nurse.user_id
            LEFT JOIN users rad ON e.performing_radiologist_id = rad.user_id
            LEFT JOIN last_event le ON le.exam_id = e.exam_id
            LEFT JOIN examinations prior_e ON prior_e.exam_id = e.prior_exam_id
            LEFT JOIN appointments prior_a ON prior_a.appointment_id = prior_e.appointment_id
            LEFT JOIN examination_types prior_et ON prior_et.type_id = prior_e.exam_type_id
            WHERE 1=1
        `;

        if (stage) {
            query += ` AND e.queue_stage = $${param++}`;
            values.push(stage);
        }

        if (station) {
            query += ` AND e.current_station = $${param++}`;
            values.push(station);
        }

        if (priority) {
            query += ` AND e.priority = $${param++}`;
            values.push(priority);
        }

        if (date) {
            query += ` AND a.start_time >= $${param}::date AND a.start_time < ($${param}::date + '1 day'::interval)`;
            values.push(date);
            param++;
        }

        if (includeDelivered !== 'true') {
            query += ` AND e.queue_stage != 'Delivered'`;
        }

        if (req.user.role === 'Nurse') {
            query += ` AND (a.nurse_id = $${param} OR a.nurse_id IS NULL)`;
            values.push(req.user.user_id);
            param++;
        } else if (req.user.role === 'Technician') {
            query += ` AND (a.technician_id = $${param} OR a.technician_id IS NULL)`;
            values.push(req.user.user_id);
            param++;
        } else if (req.user.role === 'Radiologist') {
            query += ` AND (e.performing_radiologist_id = $${param} OR e.performing_radiologist_id IS NULL)`;
            values.push(req.user.user_id);
            param++;
        }

        query += `
            ORDER BY
                CASE e.priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END,
                e.is_on_hold ASC,
                COALESCE(le.last_event_at, e.arrived_at, e.created_at) ASC
            LIMIT $${param++} OFFSET $${param}
        `;
        values.push(limit, offset);

        const result = await db.query(query, values);
        const rows = result.rows.map(row => {
            const mapped = {
                ...row,
                is_overdue: Number(row.waiting_minutes || 0) > (OVERDUE_MINUTES[row.queue_stage] || 60)
            };
            if (row.first_name_enc || row.last_name_enc) {
                mapped.patient_name = [decrypt(row.first_name_enc), decrypt(row.last_name_enc)]
                    .filter(Boolean)
                    .join(' ');
            }
            delete mapped.first_name_enc;
            delete mapped.last_name_enc;
            return mapped;
        });

        const kpis = rows.reduce((acc, row) => {
            acc.total += 1;
            acc.onHold += row.is_on_hold ? 1 : 0;
            acc.overdue += row.is_overdue ? 1 : 0;
            acc.averageWaitingMinutes += Number(row.waiting_minutes || 0);
            acc.averageTurnaroundMinutes += Number(row.turnaround_minutes || 0);
            acc.byStage[row.queue_stage] = (acc.byStage[row.queue_stage] || 0) + 1;
            return acc;
        }, { total: 0, onHold: 0, overdue: 0, averageWaitingMinutes: 0, averageTurnaroundMinutes: 0, byStage: {} });

        if (kpis.total > 0) {
            kpis.averageWaitingMinutes = Math.round(kpis.averageWaitingMinutes / kpis.total);
            kpis.averageTurnaroundMinutes = Math.round(kpis.averageTurnaroundMinutes / kpis.total);
        }

        res.json({ data: rows, kpis });
    } catch (error) {
        next(error);
    }
};

const transitionQueue = (db) => async (req, res, next) => {
    let client;

    try {
        const { examId } = req.params;
        const { toStage, action, reason, notes } = req.body;

        if (!examId) {
            return next(new AppError('Examination ID is required', 400));
        }
        validateUUID(examId, 'examId');

        client = await db.connect();
        await client.query('BEGIN');

        const existingResult = await client.query(`
            SELECT e.*, a.technician_id, a.nurse_id
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.appointment_id
            WHERE e.exam_id = $1
            FOR UPDATE
        `, [examId]);

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Queue item not found', 404));
        }

        const existing = existingResult.rows[0];

        if (action === 'update_complaint') {
            if (!['Developer', 'Admin', 'Nurse', 'Radiologist', 'Technician'].includes(req.user.role)) {
                await client.query('ROLLBACK');
                return next(new AppError('You are not allowed to update the clinical complaint', 403));
            }

            const result = await client.query(`
                UPDATE examinations SET clinical_indication = $1 WHERE exam_id = $2 RETURNING *
            `, [req.body.complaint || null, examId]);

            await client.query(`
                UPDATE appointments SET clinical_indication = $1 WHERE appointment_id = $2
            `, [req.body.complaint || null, existing.appointment_id]);

            await client.query(`
                INSERT INTO queue_events (
                    exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                    event_type, notes, changed_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                examId,
                existing.appointment_id,
                existing.queue_stage,
                existing.queue_stage,
                existing.current_station,
                existing.current_station,
                'Update_Complaint',
                'Clinical complaint updated',
                req.user.user_id
            ]);

            await client.query('COMMIT');
            await logAction(client, {
                userId: req.user.user_id,
                action: 'QUEUE_COMPLAINT_UPDATED',
                resourceId: examId,
                resourceTable: 'examinations',
                ipAddress: req.ip,
                details: { complaint: req.body.complaint || null, appointmentId: existing.appointment_id }
            });
            return res.json(result.rows[0]);
        }

        if (action === 'update_safety') {
            if (!['Developer', 'Admin', 'Nurse', 'Radiologist', 'Technician'].includes(req.user.role)) {
                await client.query('ROLLBACK');
                return next(new AppError('You are not allowed to update safety checklists', 403));
            }

            const { pregnancySafetyStatus, implantSafetyStatus, renalSafetyStatus } = req.body;
            const fields = [];
            const values = [];
            let paramIdx = 1;

            if (pregnancySafetyStatus) {
                fields.push(`pregnancy_safety_status = $${paramIdx++}`);
                values.push(pregnancySafetyStatus);
            }
            if (implantSafetyStatus) {
                fields.push(`implant_safety_status = $${paramIdx++}`);
                values.push(implantSafetyStatus);
            }
            if (renalSafetyStatus) {
                fields.push(`renal_safety_status = $${paramIdx++}`);
                values.push(renalSafetyStatus);
            }

            let resultRow = existing;
            if (fields.length > 0) {
                values.push(examId);
                const updateRes = await client.query(`
                    UPDATE examinations SET ${fields.join(', ')} WHERE exam_id = $${paramIdx} RETURNING *
                `, values);
                resultRow = updateRes.rows[0];

                values[values.length - 1] = existing.appointment_id;
                await client.query(`
                    UPDATE appointments SET ${fields.join(', ')} WHERE appointment_id = $${paramIdx}
                `, values);
            }

            await client.query(`
                INSERT INTO queue_events (
                    exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                    event_type, notes, changed_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                examId,
                existing.appointment_id,
                existing.queue_stage,
                existing.queue_stage,
                existing.current_station,
                existing.current_station,
                'Update_Safety',
                'Clinical safety checklist updated',
                req.user.user_id
            ]);

            await client.query('COMMIT');
            await logAction(client, {
                userId: req.user.user_id,
                action: 'QUEUE_SAFETY_UPDATED',
                resourceId: examId,
                resourceTable: 'examinations',
                ipAddress: req.ip,
                details: {
                    pregnancySafetyStatus,
                    implantSafetyStatus,
                    renalSafetyStatus,
                    appointmentId: existing.appointment_id
                }
            });
            return res.json(resultRow);
        }

        if (action === 'hold' || action === 'release') {
            if (!['Developer', 'Admin', 'Receptionist', 'Accountant', 'Nurse', 'Technician', 'Radiologist'].includes(req.user.role)) {
                await client.query('ROLLBACK');
                return next(new AppError('You are not allowed to hold or release this queue item', 403));
            }

            const isHold = action === 'hold';
            const result = await client.query(`
                UPDATE examinations
                SET is_on_hold = $1,
                    hold_started_at = CASE WHEN $1 = true THEN NOW() ELSE hold_started_at END,
                    hold_released_at = CASE WHEN $1 = false THEN NOW() ELSE hold_released_at END,
                    hold_reason = CASE WHEN $1 = true THEN $2 ELSE hold_reason END
                WHERE exam_id = $3
                RETURNING *
            `, [isHold, reason || null, examId]);

            await client.query(`
                INSERT INTO queue_events (
                    exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                    event_type, reason, notes, changed_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                examId,
                existing.appointment_id,
                existing.queue_stage,
                existing.queue_stage,
                existing.current_station,
                existing.current_station,
                isHold ? 'Hold' : 'Release',
                reason || null,
                notes || null,
                req.user.user_id
            ]);

            await client.query('COMMIT');
            await logAction(client, {
                userId: req.user.user_id,
                action: isHold ? 'QUEUE_ITEM_HELD' : 'QUEUE_ITEM_RELEASED',
                resourceId: examId,
                resourceTable: 'examinations',
                ipAddress: req.ip,
                details: { reason: reason || null, holdStartedAt: isHold, appointmentId: existing.appointment_id }
            });
            return res.json(result.rows[0]);
        }

        if (!toStage) {
            await client.query('ROLLBACK');
            return next(new AppError('Target queue stage is required', 400));
        }

        if (existing.is_on_hold && toStage !== 'Cancelled') {
            await client.query('ROLLBACK');
            return next(new AppError('Release this queue item before moving it forward', 409));
        }

        if (!canRoleTransition(req.user.role, toStage)) {
            await client.query('ROLLBACK');
            return next(new AppError('Your role cannot move an item to this queue stage', 403));
        }

        const allowedNextStages = VALID_TRANSITIONS[existing.queue_stage] || [];
        if (!allowedNextStages.includes(toStage) && !['Developer', 'Admin'].includes(req.user.role)) {
            await client.query('ROLLBACK');
            return next(new AppError(`Invalid queue transition from ${existing.queue_stage} to ${toStage}`, 409));
        }

        const enteringClinical = ['Prep Pending', 'Ready for Exam', 'In Exam'].includes(toStage);
        if (enteringClinical && existing.priority !== 'Emergency') {
            const invoiceResult = await client.query(`
                WITH latest_invoice AS (
                    SELECT i.invoice_id, i.invoice_status, i.patient_payable_amount
                    FROM invoices i
                    WHERE i.invoice_status <> 'Voided'
                      AND (i.exam_id = $1 OR i.appointment_id = $2)
                    ORDER BY i.generated_at DESC
                    LIMIT 1
                ),
                paid_totals AS (
                    SELECT
                        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'Completed'), 0) AS paid_amount,
                        COALESCE((SELECT SUM(r.amount) FROM refunds r
                                  WHERE r.invoice_id = li.invoice_id AND r.status = 'Processed'), 0) AS refunded_amount,
                        COALESCE((SELECT SUM(cn.patient_amount) FROM credit_notes cn
                                  WHERE cn.invoice_id = li.invoice_id AND cn.reversed_at IS NULL), 0) AS credited_amount
                    FROM latest_invoice li
                    LEFT JOIN payments p ON p.invoice_id = li.invoice_id
                    GROUP BY li.invoice_id
                )
                SELECT li.invoice_id,
                       li.invoice_status,
                       li.patient_payable_amount,
                       COALESCE(pt.paid_amount, 0) AS paid_amount,
                       COALESCE(pt.refunded_amount, 0) AS refunded_amount,
                       COALESCE(pt.credited_amount, 0) AS credited_amount
                FROM latest_invoice li
                LEFT JOIN paid_totals pt ON TRUE
            `, [examId, existing.appointment_id]);

            if (invoiceResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return next(new AppError('Create an invoice before moving this exam to clinical stages', 409));
            }

            const invoice = invoiceResult.rows[0];
            try {
                await assertInvoiceTransactionAllowed(client, {
                    invoiceId: invoice.invoice_id,
                    transactionType: 'ClinicalQueueTransition',
                    transactionLabel: 'moving this exam forward'
                });
            } catch (error) {
                await client.query('ROLLBACK');
                return next(error);
            }
        }

        if (toStage === 'Delivered') {
            const invoiceResult = await client.query(`
                SELECT invoice_id
                FROM invoices
                WHERE invoice_status <> 'Voided'
                  AND (exam_id = $1 OR appointment_id = $2)
                ORDER BY generated_at DESC
                LIMIT 1
            `, [examId, existing.appointment_id]);

            if (invoiceResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return next(new AppError('Create and settle an invoice before final delivery', 409));
            }

            try {
                await assertInvoiceFullyPaid(client, {
                    invoiceId: invoiceResult.rows[0].invoice_id,
                    transactionType: 'QueueFinalDelivery',
                    transactionLabel: 'final delivery'
                });
            } catch (error) {
                await client.query('ROLLBACK');
                return next(error);
            }
        }

        const toStation = STAGE_STATION[toStage];
        const examStatus = STAGE_EXAM_STATUS[toStage];
        const assignments = [
            'queue_stage = $1',
            'current_station = $2',
            'status = $3',
            ...timestampAssignments(toStage)
        ];

        const updateResult = await client.query(`
            UPDATE examinations
            SET ${assignments.join(', ')}
            WHERE exam_id = $4
            RETURNING *
        `, [toStage, toStation, examStatus, examId]);

        if (toStage === 'Arrived') {
            await client.query(`
                UPDATE appointments
                SET status = 'Checked-in'
                WHERE appointment_id = $1
            `, [existing.appointment_id]);
        } else if (['Finalized', 'Delivered'].includes(toStage)) {
            await client.query(`
                UPDATE appointments
                SET status = 'Completed'
                WHERE appointment_id = $1
            `, [existing.appointment_id]);
        } else if (toStage === 'Cancelled') {
            await client.query(`
                UPDATE appointments
                SET status = 'Cancelled'
                WHERE appointment_id = $1
            `, [existing.appointment_id]);
        }

        await client.query(`
            INSERT INTO queue_events (
                exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                event_type, reason, notes, changed_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'Transition', $7, $8, $9)
        `, [
            examId,
            existing.appointment_id,
            existing.queue_stage,
            toStage,
            existing.current_station,
            toStation,
            reason || null,
            notes || null,
            req.user.user_id
        ]);

        await client.query(`
            INSERT INTO order_status_history (
                appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by
            )
            VALUES ($1, $2, $3, $4, 'QueueTransition', $5, $6)
        `, [
            existing.appointment_id,
            examId,
            existing.queue_stage,
            toStage,
            notes || reason || null,
            req.user.user_id
        ]);

        await client.query('COMMIT');

        await logAction(client, {
            userId: req.user.user_id,
            action: 'QUEUE_TRANSITION',
            resourceId: examId,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: {
                fromStage: existing.queue_stage,
                toStage,
                fromStation: existing.current_station,
                toStation,
                action: action || null,
                reason: reason || null,
                appointmentId: existing.appointment_id
            }
        });

        res.json(updateResult.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

module.exports = {
    getQueue,
    transitionQueue
};
