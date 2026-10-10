const { AppError } = require('../middleware/errorHandler');
const { triggerEvent } = require('../services/notificationJobService');
const { assertInvoiceFullyPaid } = require('../services/partialPaymentExceptionService');
const { handleVisitCompletionReward } = require('../services/loyaltyRewardService');
const { decrypt } = require('../utils/crypto');

const methodDefaultStatus = {
    Printed: 'Printed',
    Email: 'Pending',
    'SMS Link': 'Pending',
    'WhatsApp Link': 'Pending',
    'Patient Portal': 'Pending',
    'Doctor Portal': 'Pending',
    'Physical Pickup': 'Picked Up'
};
const providerConfirmedChannels = new Set(['Email', 'SMS Link', 'WhatsApp Link', 'Patient Portal', 'Doctor Portal']);

const getExamForDelivery = async (db, examId) => {
    const result = await db.query(`
        SELECT e.exam_id, e.appointment_id, e.patient_id, e.external_referring_doctor_id, e.order_number,
               e.status, e.report_status, e.report_locked, e.report_finalized_at,
               e.report_request_status, e.exam_completed_at, e.images_ready_at, e.images_delivered_at,
               e.delivered_at, e.queue_stage, e.current_station,
               p.mrn, p.phone_enc, rd.full_name AS doctor_name, rd.phone AS doctor_phone
        FROM examinations e
        JOIN patients p ON e.patient_id = p.patient_id
        LEFT JOIN referring_doctors rd ON e.external_referring_doctor_id = rd.doctor_id
        WHERE e.exam_id = $1
        FOR UPDATE OF e
    `, [examId]);

    if (result.rows.length === 0) return null;

    const { phone_enc, ...exam } = result.rows[0];
    return { ...exam, patient_phone: decrypt(phone_enc) };
};

const deliverResult = (db) => async (req, res, next) => {
    let client;
    let transactionStarted = false;
    let committed = false;

    try {
        const { examId } = req.params;
        const data = req.body;
        client = await db.connect();
        await client.query('BEGIN');
        transactionStarted = true;

        const exam = await getExamForDelivery(client, examId);

        if (!exam) {
            throw new AppError('Exam not found', 404);
        }

        const resultType = data.resultType || 'Report';
        const includesReport = ['Report', 'ImagesAndReport'].includes(resultType);
        const includesImages = ['Images', 'ImagesAndReport'].includes(resultType);

        if (providerConfirmedChannels.has(data.deliveryMethod) && data.deliveryStatus !== undefined) {
            throw new AppError('Electronic delivery status must be assigned by the delivery workflow', 422);
        }

        if ((includesReport && exam.delivered_at) || (includesImages && exam.images_delivered_at)) {
            throw new AppError('This result has already been delivered', 409);
        }

        if (includesReport
            && (!['Finalized', 'Amended'].includes(exam.report_status) || !exam.report_locked)) {
            throw new AppError('Only a finalized and locked report can be delivered', 400);
        }
        if (resultType === 'Images'
            && (exam.status !== 'Completed'
                || exam.report_request_status !== 'NotRequested'
                || exam.queue_stage !== 'Images Ready')) {
            throw new AppError('Images-only delivery is available only after an images-only examination is completed', 409);
        }
        if (includesImages && !exam.exam_completed_at) {
            throw new AppError('The acquisition must be completed before images can be delivered', 409);
        }

        const invoiceResult = await client.query(`
            SELECT invoice_id
            FROM invoices
            WHERE invoice_status <> 'Voided'
              AND (exam_id = $1 OR appointment_id = $2)
            ORDER BY generated_at DESC
            LIMIT 1
        `, [exam.exam_id, exam.appointment_id]);

        if (invoiceResult.rows.length === 0) {
            throw new AppError('Create and settle an invoice before final result delivery', 409);
        }

        await assertInvoiceFullyPaid(client, {
            invoiceId: invoiceResult.rows[0].invoice_id,
            transactionType: 'ResultDelivery',
            transactionLabel: 'delivering this result'
        });

        await client.query(`
            UPDATE partial_payment_exceptions
            SET status = 'Used',
                metadata = metadata || jsonb_build_object('usedAt', NOW(), 'deliveredAt', NOW(), 'deliveryChannel', 'ResultDelivery')
            WHERE invoice_id = $1 AND status = 'Approved'
        `, [invoiceResult.rows[0].invoice_id]);

        const status = data.deliveryStatus || methodDefaultStatus[data.deliveryMethod] || 'Delivered';
        const acknowledged = ['Acknowledged', 'Picked Up'].includes(status);
        const printCopies = data.deliveryMethod === 'Printed'
            ? Math.max(Number(data.printCopyCount || 1), 1)
            : Number(data.printCopyCount || 0);

        const result = await client.query(`
            INSERT INTO result_deliveries (
                exam_id, appointment_id, patient_id, referring_doctor_id,
                delivery_method, result_type, recipient_name, recipient_contact, delivery_status,
                delivered_by, print_copy_count, acknowledged_at, acknowledged_by_name,
                notes, access_ip, user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                    CASE WHEN $12 THEN NOW() ELSE NULL END, $13, $14, $15, $16)
            RETURNING *
        `, [
            exam.exam_id,
            exam.appointment_id,
            exam.patient_id,
            exam.external_referring_doctor_id,
            data.deliveryMethod,
            resultType,
            data.recipientName || null,
            data.recipientContact || null,
            status,
            req.user.user_id || null,
            printCopies,
            acknowledged,
            data.acknowledgedByName || null,
            data.notes || null,
            req.ip || null,
            req.get('user-agent') || null
        ]);

        if (['Delivered', 'Picked Up', 'Accessed', 'Printed', 'Acknowledged'].includes(status)) {
            const deliveredQueueStage = resultType === 'Images' ? 'Images Delivered' : 'Delivered';
            await client.query(`
                UPDATE examinations
                SET delivered_at = CASE WHEN $2::boolean THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
                images_delivered_at = CASE WHEN $3::boolean THEN COALESCE(images_delivered_at, NOW()) ELSE images_delivered_at END,
                queue_stage = CASE
                    WHEN $4 = 'Images Delivered' AND queue_stage = 'Images Ready' THEN 'Images Delivered'
                    WHEN $4 = 'Delivered' AND queue_stage = 'Finalized' THEN 'Delivered'
                    ELSE queue_stage
                END,
                current_station = CASE WHEN current_station = 'Delivery' THEN 'Delivery' ELSE current_station END
                WHERE exam_id = $1
            `, [exam.exam_id, includesReport, includesImages, deliveredQueueStage]);

            const queueMoved = (resultType === 'Images' && exam.queue_stage === 'Images Ready')
                || (includesReport && exam.queue_stage === 'Finalized');
            if (queueMoved) {
                await client.query(`
                    INSERT INTO queue_events (
                        exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                        event_type, reason, changed_by
                    )
                    VALUES ($1, $2, $3, $4, $5, 'Delivery', 'Transition', $6, $7)
                `, [
                    exam.exam_id,
                    exam.appointment_id,
                    exam.queue_stage,
                    deliveredQueueStage,
                    exam.current_station,
                    resultType === 'Images' ? 'Images Delivered' : 'Report Delivered',
                    req.user.user_id || null
                ]);

                await client.query(`
                    INSERT INTO order_status_history (
                        appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by
                    )
                    VALUES ($1, $2, $3, $4, 'QueueTransition', $5, $6)
                `, [
                    exam.appointment_id,
                    exam.exam_id,
                    exam.queue_stage,
                    deliveredQueueStage,
                    resultType === 'Images' ? 'Images Delivered' : 'Report Delivered',
                    req.user.user_id || null
                ]);
            }
        }

        await client.query('COMMIT');
        committed = true;

        // Instant Loyalty Reward: Visit Completion / Milestones / Recall (+25 to +100 pts)
        handleVisitCompletionReward(db, {
            patientId: exam.patient_id,
            appointmentId: exam.appointment_id
        }).catch(err => console.warn('Failed to award delivery visit completion reward:', err.message));

        // Notifications are deliberately outside the transaction.
        if (['Email', 'SMS Link', 'WhatsApp Link', 'Patient Portal'].includes(data.deliveryMethod)) {
            const channel = {
                Email: 'Email',
                'SMS Link': 'SMS',
                'WhatsApp Link': 'WhatsApp',
                'Patient Portal': 'Email'
            }[data.deliveryMethod];
            await triggerEvent(db, 'ResultDelivered', {
                patientId: exam.patient_id,
                entityType: 'Exam',
                entityId: exam.exam_id,
                channels: [channel],
                variables: {
                    order_number: exam.order_number || '',
                    delivery_method: data.deliveryMethod
                }
            });

            // Schedule automated post-delivery CSAT feedback survey (2 hours post-delivery)
            triggerEvent(db, 'PatientFeedbackRequest', {
                patientId: exam.patient_id,
                entityType: 'Exam',
                entityId: exam.exam_id,
                channels: [channel],
                scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000),
                variables: {
                    patient_name: exam.patient_name || 'Patient',
                    order_number: exam.order_number || ''
                }
            }).catch(error => console.error('[ResultDeliveryController] Feedback scheduling failed:', error.message));
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client && transactionStarted && !committed) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {
                // Preserve the original delivery error.
            }
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getDeliveryHistory = (db) => async (req, res, next) => {
    try {
        const { examId } = req.params;
        const result = await db.query(`
            SELECT rd.*, u.full_name as delivered_by_name
            FROM result_deliveries rd
            LEFT JOIN users u ON rd.delivered_by = u.user_id
            WHERE rd.exam_id = $1
            ORDER BY rd.delivered_at DESC, rd.created_at DESC
        `, [examId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    deliverResult,
    getDeliveryHistory
};
