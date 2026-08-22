const { AppError } = require('../middleware/errorHandler');
const { triggerEvent } = require('../services/notificationJobService');
const { assertInvoiceFullyPaid } = require('../services/partialPaymentExceptionService');
const { decrypt } = require('../utils/crypto');

const methodDefaultStatus = {
    Printed: 'Printed',
    Email: 'Sent',
    'SMS Link': 'Sent',
    'WhatsApp Link': 'Sent',
    'Patient Portal': 'Delivered',
    'Doctor Portal': 'Delivered',
    'Physical Pickup': 'Picked Up'
};

const getExamForDelivery = async (db, examId) => {
    const result = await db.query(`
        SELECT e.exam_id, e.appointment_id, e.patient_id, e.external_referring_doctor_id, e.order_number,
               e.status, e.report_status, e.report_finalized_at, e.delivered_at, e.queue_stage, e.current_station,
               p.mrn, p.phone_enc, rd.full_name AS doctor_name, rd.phone AS doctor_phone
        FROM examinations e
        JOIN patients p ON e.patient_id = p.patient_id
        LEFT JOIN referring_doctors rd ON e.external_referring_doctor_id = rd.doctor_id
        WHERE e.exam_id = $1
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

        if (exam.status !== 'Finalized' && exam.report_status !== 'Finalized' && exam.report_status !== 'Amended') {
            throw new AppError('Only finalized reports can be delivered', 400);
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

        const status = data.deliveryStatus || methodDefaultStatus[data.deliveryMethod] || 'Delivered';
        const acknowledged = ['Acknowledged', 'Picked Up'].includes(status);
        const printCopies = data.deliveryMethod === 'Printed'
            ? Math.max(Number(data.printCopyCount || 1), 1)
            : Number(data.printCopyCount || 0);

        const result = await client.query(`
            INSERT INTO result_deliveries (
                exam_id, appointment_id, patient_id, referring_doctor_id,
                delivery_method, recipient_name, recipient_contact, delivery_status,
                delivered_by, print_copy_count, acknowledged_at, acknowledged_by_name,
                notes, access_ip, user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    CASE WHEN $11 THEN NOW() ELSE NULL END, $12, $13, $14, $15)
            RETURNING *
        `, [
            exam.exam_id,
            exam.appointment_id,
            exam.patient_id,
            exam.external_referring_doctor_id,
            data.deliveryMethod,
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
            await client.query(`
                UPDATE examinations
                SET delivered_at = COALESCE(delivered_at, NOW()),
                    queue_stage = CASE WHEN queue_stage = 'Finalized' THEN 'Delivered' ELSE queue_stage END,
                    current_station = CASE WHEN current_station = 'Delivery' THEN 'Delivery' ELSE current_station END
                WHERE exam_id = $1
            `, [exam.exam_id]);

            if (exam.queue_stage === 'Finalized') {
                await client.query(`
                    INSERT INTO queue_events (
                        exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                        event_type, reason, changed_by
                    )
                    VALUES ($1, $2, $3, 'Delivered', $4, 'Delivery', 'Transition', 'Result Delivered', $5)
                `, [exam.exam_id, exam.appointment_id, exam.queue_stage, exam.current_station, req.user.user_id || null]);
                
                await client.query(`
                    INSERT INTO order_status_history (
                        appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by
                    )
                    VALUES ($1, $2, $3, 'Delivered', 'QueueTransition', 'Result Delivered', $4)
                `, [exam.appointment_id, exam.exam_id, exam.queue_stage, req.user.user_id || null]);
            }
        }

        await client.query('COMMIT');
        committed = true;

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
