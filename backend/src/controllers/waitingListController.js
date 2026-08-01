const { AppError } = require('../middleware/errorHandler');
const { decrypt } = require('../utils/crypto');
const { validateEnum, validateUUID, VALID_WAITING_LIST_STATUSES } = require('../utils/queryValidator');

const getWaitingList = (db) => async (req, res, next) => {
    try {
        const { status, modalityId, date, limit = 100, offset = 0 } = req.query;

        validateEnum(status, VALID_WAITING_LIST_STATUSES, 'status');
        validateUUID(modalityId, 'modalityId');

        const values = [];
        let param = 1;

        let query = `
            SELECT wl.*,
                   p.mrn, p.first_name_enc, p.last_name_enc,
                   m.name as machine_name,
                   m.type as modality_type,
                   et.name as exam_type_name,
                   u.full_name as created_by_name
            FROM waiting_list wl
            JOIN patients p ON wl.patient_id = p.patient_id
            LEFT JOIN modalities m ON wl.modality_id = m.modality_id
            LEFT JOIN examination_types et ON wl.exam_type_id = et.type_id
            LEFT JOIN users u ON wl.created_by = u.user_id
            WHERE 1=1
        `;

        if (status) {
            query += ` AND wl.status = $${param++}`;
            values.push(status);
        }

        if (modalityId) {
            query += ` AND wl.modality_id = $${param++}`;
            values.push(modalityId);
        }

        // Waitlist entries shouldn't be rigidly filtered by date.
        // A Waitlisted patient wants an early slot, so they are always 
        // eligible to be pulled in today regardless of their preferred future date.
        // if (date) {
        //     query += ` AND (wl.preferred_date IS NULL OR wl.preferred_date <= $${param++}::date)`;
        //     values.push(date);
        // }

        query += ` ORDER BY
            CASE wl.priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END,
            wl.created_at ASC
            LIMIT $${param++} OFFSET $${param}
        `;
        values.push(limit, offset);

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
};

const createWaitingListEntry = (db) => async (req, res, next) => {
    try {
        const data = req.body;

        const result = await db.query(`
            INSERT INTO waiting_list (
                patient_id, modality_id, exam_type_id, preferred_date, preferred_start_time,
                preferred_end_time, priority, source, notes, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            data.patientId,
            data.modalityId || null,
            data.examTypeId || null,
            data.preferredDate || null,
            data.preferredStartTime || null,
            data.preferredEndTime || null,
            data.priority || 'Routine',
            data.source || 'Walk-in',
            data.notes || null,
            req.user.user_id
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updateWaitingListEntry = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const existingResult = await db.query('SELECT * FROM waiting_list WHERE waitlist_id = $1', [id]);
        if (existingResult.rows.length === 0) {
            return next(new AppError('Waiting list entry not found', 404));
        }

        const existing = existingResult.rows[0];
        const nextEntry = {
            patient_id: data.patientId ?? existing.patient_id,
            modality_id: data.modalityId !== undefined ? data.modalityId : existing.modality_id,
            exam_type_id: data.examTypeId !== undefined ? data.examTypeId : existing.exam_type_id,
            preferred_date: data.preferredDate !== undefined ? data.preferredDate : existing.preferred_date,
            preferred_start_time: data.preferredStartTime !== undefined ? data.preferredStartTime : existing.preferred_start_time,
            preferred_end_time: data.preferredEndTime !== undefined ? data.preferredEndTime : existing.preferred_end_time,
            priority: data.priority ?? existing.priority,
            source: data.source ?? existing.source,
            status: data.status ?? existing.status,
            notes: data.notes !== undefined ? data.notes : existing.notes,
            assigned_appointment_id: data.assignedAppointmentId !== undefined ? data.assignedAppointmentId : existing.assigned_appointment_id
        };

        const result = await db.query(`
            UPDATE waiting_list
            SET patient_id = $1,
                modality_id = $2,
                exam_type_id = $3,
                preferred_date = $4,
                preferred_start_time = $5,
                preferred_end_time = $6,
                priority = $7,
                source = $8,
                status = $9,
                notes = $10,
                assigned_appointment_id = $11,
                updated_at = NOW()
            WHERE waitlist_id = $12
            RETURNING *
        `, [
            nextEntry.patient_id,
            nextEntry.modality_id,
            nextEntry.exam_type_id,
            nextEntry.preferred_date,
            nextEntry.preferred_start_time,
            nextEntry.preferred_end_time,
            nextEntry.priority,
            nextEntry.source,
            nextEntry.status,
            nextEntry.notes,
            nextEntry.assigned_appointment_id,
            id
        ]);

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getWaitingList,
    createWaitingListEntry,
    updateWaitingListEntry
};
