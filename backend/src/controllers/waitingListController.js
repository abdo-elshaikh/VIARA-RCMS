const { AppError } = require('../middleware/errorHandler');
const { decrypt } = require('../utils/crypto');
const { validateEnum, validateUUID, VALID_WAITING_LIST_STATUSES } = require('../utils/queryValidator');

const getWaitingList = (db) => async (req, res, next) => {
    try {
        const { status, active, modalityId, date, q, limit = 100, offset = 0 } = req.query;

        if (status) validateEnum(status, VALID_WAITING_LIST_STATUSES, 'status');
        if (modalityId) validateUUID(modalityId, 'modalityId');

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
        } else if (active === 'true') {
            query += ` AND wl.status IN ('Waiting', 'Contacted', 'Offered')`;
        } else if (active === 'false') {
            query += ` AND wl.status IN ('Scheduled', 'Declined', 'Expired', 'Cancelled')`;
        }

        if (modalityId) {
            query += ` AND wl.modality_id = $${param++}`;
            values.push(modalityId);
        }

        if (date) {
            query += ` AND (wl.preferred_date = $${param++} OR wl.preferred_date IS NULL)`;
            values.push(date);
        }

        query += ` ORDER BY
            CASE wl.priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END,
            wl.created_at ASC
            LIMIT $${param++} OFFSET $${param}
        `;
        values.push(limit, offset);

        const result = await db.query(query, values);
        
        let mappedRows = result.rows.map(row => {
            const mapped = { ...row };
            if (row.first_name_enc || row.last_name_enc) {
                mapped.patient_name = [decrypt(row.first_name_enc), decrypt(row.last_name_enc)]
                    .filter(Boolean)
                    .join(' ');
            }
            delete row.first_name_enc;
            delete row.last_name_enc;
            delete mapped.first_name_enc;
            delete mapped.last_name_enc;
            return mapped;
        });

        if (q && q.trim()) {
            const term = q.trim().toLowerCase();
            mappedRows = mappedRows.filter(r =>
                (r.mrn && r.mrn.toLowerCase().includes(term)) ||
                (r.patient_name && r.patient_name.toLowerCase().includes(term)) ||
                (r.exam_type_name && r.exam_type_name.toLowerCase().includes(term)) ||
                (r.machine_name && r.machine_name.toLowerCase().includes(term))
            );
        }

        res.json(mappedRows);
    } catch (error) {
        next(error);
    }
};

const createWaitingListEntry = (db) => async (req, res, next) => {
    let client;
    try {
        const data = req.body;
        const modalityId = data.modalityId && data.modalityId.trim() !== '' ? data.modalityId.trim() : null;
        const examTypeId = data.examTypeId && data.examTypeId.trim() !== '' ? data.examTypeId.trim() : null;
        const preferredDate = data.preferredDate && data.preferredDate.trim() !== '' ? data.preferredDate.trim() : null;
        const preferredStartTime = data.preferredStartTime && data.preferredStartTime.trim() !== '' ? data.preferredStartTime.trim() : null;
        const preferredEndTime = data.preferredEndTime && data.preferredEndTime.trim() !== '' ? data.preferredEndTime.trim() : null;

        if (preferredStartTime && preferredEndTime && preferredEndTime <= preferredStartTime) {
            throw new AppError('Preferred end time must be after start time.', 400);
        }

        if (preferredDate) {
            const today = new Date().toISOString().slice(0, 10);
            if (preferredDate < today) {
                throw new AppError('Preferred date cannot be in the past.', 400);
            }
        }

        client = await db.connect();
        await client.query('BEGIN');

        const duplicateKey = [
            data.patientId,
            modalityId || '',
            examTypeId || '',
            preferredDate || '',
            preferredStartTime || '',
            preferredEndTime || ''
        ].join('|');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [duplicateKey]);

        const duplicate = await client.query(`
            SELECT waitlist_id
            FROM waiting_list
            WHERE patient_id = $1
              AND modality_id IS NOT DISTINCT FROM $2::uuid
              AND exam_type_id IS NOT DISTINCT FROM $3::uuid
              AND preferred_date IS NOT DISTINCT FROM $4::date
              AND preferred_start_time IS NOT DISTINCT FROM $5::time
              AND preferred_end_time IS NOT DISTINCT FROM $6::time
              AND status IN ('Waiting', 'Contacted', 'Offered')
            LIMIT 1
        `, [
            data.patientId,
            modalityId,
            examTypeId,
            preferredDate,
            preferredStartTime,
            preferredEndTime
        ]);
        if (duplicate.rows.length) {
            throw new AppError('An active waiting list entry already exists for this patient and preference.', 409);
        }

        const result = await client.query(`
            INSERT INTO waiting_list (
                patient_id, modality_id, exam_type_id, preferred_date, preferred_start_time,
                preferred_end_time, priority, source, notes, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            data.patientId,
            modalityId,
            examTypeId,
            preferredDate,
            preferredStartTime,
            preferredEndTime,
            data.priority || 'Routine',
            data.source || 'Walk-in',
            data.notes || null,
            req.user.user_id
        ]);

        await client.query(
            `INSERT INTO waiting_list_events
             (waitlist_id, from_status, to_status, reason, changed_by)
             VALUES ($1, NULL, 'Waiting', $2, $3)`,
            [result.rows[0].waitlist_id, 'Added to waiting list', req.user.user_id]
        );

        await client.query('COMMIT');

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rollbackError) { /* ignore */ }
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateWaitingListEntry = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = req.body;

        if (data.status === 'Scheduled' || data.assignedAppointmentId !== undefined) {
            throw new AppError('Schedule waiting list entries through appointment booking.', 409);
        }

        client = await db.connect();
        await client.query('BEGIN');

        const existingResult = await client.query('SELECT * FROM waiting_list WHERE waitlist_id = $1 FOR UPDATE', [id]);
        if (existingResult.rows.length === 0) {
            throw new AppError('Waiting list entry not found', 404);
        }

        const existing = existingResult.rows[0];
        if (['Scheduled', 'Cancelled', 'Expired'].includes(existing.status)) {
            throw new AppError('Completed waiting list entries cannot be changed.', 409);
        }
        if (data.status && !['Waiting', 'Contacted', 'Offered', 'Declined', 'Cancelled'].includes(data.status)) {
            throw new AppError(`Invalid waiting list transition from ${existing.status} to ${data.status}.`, 409);
        }

        const nextModalityId = data.modalityId !== undefined ? (data.modalityId && data.modalityId.trim() !== '' ? data.modalityId.trim() : null) : existing.modality_id;
        const nextExamTypeId = data.examTypeId !== undefined ? (data.examTypeId && data.examTypeId.trim() !== '' ? data.examTypeId.trim() : null) : existing.exam_type_id;
        const nextPreferredDate = data.preferredDate !== undefined ? (data.preferredDate && data.preferredDate.trim() !== '' ? data.preferredDate.trim() : null) : existing.preferred_date;
        const nextPreferredStartTime = data.preferredStartTime !== undefined ? (data.preferredStartTime && data.preferredStartTime.trim() !== '' ? data.preferredStartTime.trim() : null) : existing.preferred_start_time;
        const nextPreferredEndTime = data.preferredEndTime !== undefined ? (data.preferredEndTime && data.preferredEndTime.trim() !== '' ? data.preferredEndTime.trim() : null) : existing.preferred_end_time;

        if (nextPreferredStartTime && nextPreferredEndTime && nextPreferredEndTime <= nextPreferredStartTime) {
            throw new AppError('Preferred end time must be after start time.', 400);
        }

        const nextEntry = {
            patient_id: data.patientId ?? existing.patient_id,
            modality_id: nextModalityId,
            exam_type_id: nextExamTypeId,
            preferred_date: nextPreferredDate,
            preferred_start_time: nextPreferredStartTime,
            preferred_end_time: nextPreferredEndTime,
            priority: data.priority ?? existing.priority,
            source: data.source ?? existing.source,
            status: data.status ?? existing.status,
            notes: data.notes !== undefined ? data.notes : existing.notes,
            assigned_appointment_id: data.assignedAppointmentId !== undefined ? data.assignedAppointmentId : existing.assigned_appointment_id
        };

        const result = await client.query(`
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

        if (nextEntry.status !== existing.status) {
            let reason = 'Status updated by staff';
            if (nextEntry.status === 'Cancelled') reason = 'Cancelled by staff';
            else if (nextEntry.status === 'Contacted') reason = 'Patient contacted by staff';
            else if (nextEntry.status === 'Offered') reason = 'Slot offered to patient';
            else if (nextEntry.status === 'Declined') reason = 'Patient declined slot offer';

            await client.query(
                `INSERT INTO waiting_list_events
                 (waitlist_id, from_status, to_status, reason, changed_by)
                 VALUES ($1, $2, $3, $4, $5)`,
                [id, existing.status, nextEntry.status, reason, req.user.user_id]
            );
        }

        await client.query('COMMIT');

        res.json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rollbackError) { /* ignore */ }
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getWaitlistMatches = (db) => async (req, res, next) => {
    try {
        const { modalityId, examTypeId, date } = req.query;

        if (modalityId) validateUUID(modalityId, 'modalityId');
        if (examTypeId) validateUUID(examTypeId, 'examTypeId');

        let query = `
            SELECT wl.*,
                   p.mrn, p.first_name_enc, p.last_name_enc,
                   m.name as machine_name,
                   et.name as exam_type_name
            FROM waiting_list wl
            JOIN patients p ON wl.patient_id = p.patient_id
            LEFT JOIN modalities m ON wl.modality_id = m.modality_id
            LEFT JOIN examination_types et ON wl.exam_type_id = et.type_id
            WHERE wl.status IN ('Waiting', 'Contacted', 'Offered')
        `;

        const values = [];
        let param = 1;

        if (modalityId) {
            query += ` AND (wl.modality_id = $${param++} OR wl.modality_id IS NULL)`;
            values.push(modalityId);
        }
        if (examTypeId) {
            query += ` AND (wl.exam_type_id = $${param++} OR wl.exam_type_id IS NULL)`;
            values.push(examTypeId);
        }
        if (date) {
            query += ` AND (wl.preferred_date = $${param++} OR wl.preferred_date IS NULL)`;
            values.push(date);
        }

        query += ` ORDER BY
            CASE wl.priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END,
            wl.created_at ASC
            LIMIT 10
        `;

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

        res.json({
            count: mappedRows.length,
            matches: mappedRows
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getWaitingList,
    createWaitingListEntry,
    updateWaitingListEntry,
    getWaitlistMatches
};
