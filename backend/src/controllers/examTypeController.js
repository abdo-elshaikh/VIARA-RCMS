const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');

let schemaEnsured = false;
let examTypeSoftDeleteSchemaPromise = null;
const ensureExamTypeSoftDeleteSchema = async (db) => {
    if (schemaEnsured) return;
    if (!examTypeSoftDeleteSchemaPromise) {
        examTypeSoftDeleteSchemaPromise = db.query(`
            ALTER TABLE examination_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
            ALTER TABLE examination_types ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
            ALTER TABLE examination_types DROP CONSTRAINT IF EXISTS examination_types_modality_id_name_key;
            DROP INDEX IF EXISTS idx_examination_types_modality_name;
            DROP INDEX IF EXISTS idx_examination_types_code_unique;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_examination_types_modality_name_active
                ON examination_types (modality_id, LOWER(name))
                WHERE deleted_at IS NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_examination_types_code_unique_active
                ON examination_types (UPPER(code))
                WHERE code IS NOT NULL AND deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_examination_types_not_deleted
                ON examination_types (modality_id, is_active, name)
                WHERE deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_modalities_not_deleted
                ON modalities (status, type, name)
                WHERE deleted_at IS NULL;
        `).then(() => {
            schemaEnsured = true;
        }).catch((error) => {
            examTypeSoftDeleteSchemaPromise = null;
            // Suppress duplicate DDL notice or concurrent lock error to avoid request failures
            schemaEnsured = true;
        });
    }
    return examTypeSoftDeleteSchemaPromise;
};

const EXAM_TYPES_CACHE_TTL_MS = 10000;
const examTypesCache = new Map();

const getExamTypes = db => async (req, res, next) => {
    try {
        const { modalityId, roomId, includeInactive = false } = req.query;
        const cacheKey = `${modalityId || ''}:${roomId || ''}:${includeInactive}`;
        const now = Date.now();
        const cached = examTypesCache.get(cacheKey);
        if (cached && (now - cached.timestamp < EXAM_TYPES_CACHE_TTL_MS)) {
            return res.json(cached.data);
        }

        await ensureExamTypeSoftDeleteSchema(db);

        const values = [];
        const filters = ['et.deleted_at IS NULL'];
        if (modalityId) {
            values.push(modalityId);
            filters.push(`et.modality_id = $${values.length}`);
        }
        if (roomId) {
            values.push(roomId);
            filters.push(`m.room_id = $${values.length}`);
        }
        if (!includeInactive) filters.push('et.is_active = TRUE');
        const result = await db.query(`
            SELECT et.*, m.name AS modality_name, m.type AS modality_type, m.status AS modality_status,
                   m.room_id,
                   COALESCE(r.name, m.room_number) AS room_name,
                   COALESCE(r.room_number, m.room_number) AS room_number,
                   r.status AS room_status
            FROM examination_types et
            JOIN modalities m ON m.modality_id = et.modality_id
                AND m.deleted_at IS NULL
            LEFT JOIN rooms r ON m.room_id = r.room_id
            ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
            ORDER BY m.name, et.name
        `, values);

        examTypesCache.set(cacheKey, { timestamp: now, data: result.rows });
        if (examTypesCache.size > 200) {
            for (const [k, v] of examTypesCache.entries()) {
                if (now - v.timestamp > EXAM_TYPES_CACHE_TTL_MS) examTypesCache.delete(k);
            }
        }

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const ensureModality = async (client, modalityId) => {
    const result = await client.query('SELECT modality_id FROM modalities WHERE modality_id = $1 AND deleted_at IS NULL', [modalityId]);
    if (!result.rows.length) throw new AppError('Selected machine was not found', 400);
};

const getExamTypeById = async (client, typeId) => {
    const result = await client.query(`
        SELECT et.*, et.type_id AS id,
               m.name AS modality_name,
               m.type AS modality_type,
               m.status AS modality_status
        FROM examination_types et
        JOIN modalities m ON m.modality_id = et.modality_id
            AND m.deleted_at IS NULL
        WHERE et.type_id = $1
          AND et.deleted_at IS NULL
    `, [typeId]);
    return result.rows[0] || null;
};

const createExamType = db => async (req, res, next) => {
    let client;
    try {
        await ensureExamTypeSoftDeleteSchema(db);
        client = await db.connect();
        await client.query('BEGIN');
        const data = req.body;
        await ensureModality(client, data.modalityId);
        const duplicate = await client.query(`
            SELECT 1 FROM examination_types
            WHERE modality_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL
        `, [data.modalityId, data.name]);
        if (duplicate.rows.length) throw new AppError('An examination with this name already exists for the selected machine', 409);

        const result = await client.query(`
            INSERT INTO examination_types (
                modality_id, code, name, price, duration_minutes, body_part,
                preparation_instructions, contrast_required, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            data.modalityId, data.code?.toUpperCase() || null, data.name, data.price,
            data.durationMinutes, data.bodyPart || null, data.preparationInstructions || null,
            data.contrastRequired, data.isActive
        ]);
        await logAction(client, {
            userId: req.user.user_id, action: 'EXAMINATION_TYPE_CREATED',
            resourceId: result.rows[0].type_id, resourceTable: 'examination_types', ipAddress: req.ip,
            details: { name: data.name, code: data.code || null, modalityId: data.modalityId }, required: true
        });
        const savedExam = await getExamTypeById(client, result.rows[0].type_id);
        await client.query('COMMIT');
        examTypesCache.clear();
        res.status(201).json(savedExam || result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error.code === '23505') return next(new AppError('Examination code or machine/name combination already exists', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateExamType = db => async (req, res, next) => {
    let client;
    try {
        await ensureExamTypeSoftDeleteSchema(db);
        client = await db.connect();
        await client.query('BEGIN');
        const existingResult = await client.query('SELECT * FROM examination_types WHERE type_id = $1 AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
        if (!existingResult.rows.length) throw new AppError('Examination type not found', 404);
        const existing = existingResult.rows[0];
        const data = req.body;
        const modalityId = data.modalityId ?? existing.modality_id;
        const modalityChanged = data.modalityId !== undefined && String(data.modalityId) !== String(existing.modality_id);
        if (modalityChanged) {
            await ensureModality(client, modalityId);

            const targetModality = await client.query('SELECT room_id, name FROM modalities WHERE modality_id = $1', [modalityId]);
            const targetRoomId = targetModality.rows[0]?.room_id || null;
            const targetMachineName = targetModality.rows[0]?.name || 'the new machine';

            // Check if any active appointments of this exam collide with existing appointments on the target machine
            const conflicts = await client.query(`
                SELECT a1.appointment_id AS migrating_id, a1.start_time, a1.end_time,
                       a2.appointment_id AS conflict_id
                FROM appointments a1
                JOIN appointments a2 ON a2.modality_id = $1
                  AND a2.status NOT IN ('Completed', 'Cancelled', 'No-Show')
                  AND tstzrange(a1.start_time, a1.end_time) && tstzrange(a2.start_time, a2.end_time)
                WHERE a1.exam_type_id = $2
                  AND a1.status NOT IN ('Completed', 'Cancelled', 'No-Show')
                LIMIT 3
            `, [modalityId, existing.type_id]);

            if (conflicts.rows.length > 0) {
                const dates = conflicts.rows.map(c => new Date(c.start_time).toLocaleString()).join(', ');
                throw new AppError(`Cannot reassign procedure to ${targetMachineName}: conflicting appointments already exist on the target machine at [${dates}]. Please reschedule them first.`, 409);
            }

            // Update active/pending appointments of this procedure to point to the new machine and room
            await client.query(`
                UPDATE appointments 
                SET modality_id = $1,
                    room_id = $2
                WHERE exam_type_id = $3 
                  AND status NOT IN ('Completed', 'Cancelled', 'No-Show')
            `, [modalityId, targetRoomId, existing.type_id]);
        }
        const name = data.name ?? existing.name;
        const duplicate = await client.query(`
            SELECT 1 FROM examination_types
            WHERE modality_id = $1 AND LOWER(name) = LOWER($2) AND type_id <> $3 AND deleted_at IS NULL
        `, [modalityId, name, existing.type_id]);
        if (duplicate.rows.length) throw new AppError('An examination with this name already exists for the selected machine', 409);

        const result = await client.query(`
            UPDATE examination_types SET
                modality_id = $1, code = $2, name = $3, price = $4, duration_minutes = $5,
                body_part = $6, preparation_instructions = $7, contrast_required = $8,
                is_active = $9, updated_at = CURRENT_TIMESTAMP
            WHERE type_id = $10 RETURNING *
        `, [
            modalityId,
            data.code !== undefined ? (data.code?.toUpperCase() || null) : existing.code,
            name, data.price ?? existing.price, data.durationMinutes ?? existing.duration_minutes,
            data.bodyPart !== undefined ? (data.bodyPart || null) : existing.body_part,
            data.preparationInstructions !== undefined ? (data.preparationInstructions || null) : existing.preparation_instructions,
            data.contrastRequired ?? existing.contrast_required, data.isActive ?? existing.is_active, existing.type_id
        ]);
        await logAction(client, {
            userId: req.user.user_id, action: 'EXAMINATION_TYPE_UPDATED',
            resourceId: existing.type_id, resourceTable: 'examination_types', ipAddress: req.ip,
            details: {
                changedFields: Object.keys(data),
                active: result.rows[0].is_active,
                modalityChanged,
                previousModalityId: existing.modality_id,
                nextModalityId: result.rows[0].modality_id
            },
            required: true
        });
        const savedExam = await getExamTypeById(client, result.rows[0].type_id);
        await client.query('COMMIT');
        examTypesCache.clear();
        res.json(savedExam || result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error.code === '23505') return next(new AppError('Examination code or machine/name combination already exists', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const deleteExamType = db => async (req, res, next) => {
    let client;
    try {
        await ensureExamTypeSoftDeleteSchema(db);
        const { id } = req.params;
        client = await db.connect();
        await client.query('BEGIN');

        const checkResult = await client.query('SELECT name, deleted_at FROM examination_types WHERE type_id = $1 FOR UPDATE', [id]);
        if (checkResult.rows.length === 0) {
            throw new AppError('Examination procedure not found', 404);
        }
        if (checkResult.rows[0].deleted_at) {
            await client.query('COMMIT');
            return res.status(204).end();
        }
        const examName = checkResult.rows[0].name;

        const deleteResult = await client.query(`
            UPDATE examination_types
            SET is_active = FALSE,
                deleted_at = CURRENT_TIMESTAMP,
                deleted_by = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE type_id = $1
              AND deleted_at IS NULL
        `, [id, req.user.user_id]);
        if (deleteResult.rowCount !== 1) {
            throw new AppError('Examination procedure was not deleted. Please refresh and try again.', 409);
        }

        // Log audit trail
        await logAction(client, {
            userId: req.user.user_id,
            action: 'EXAMINATION_TYPE_DELETED',
            resourceId: id,
            resourceTable: 'examination_types',
            ipAddress: req.ip,
            details: { name: examName },
            required: true
        });

        await client.query('COMMIT');
        examTypesCache.clear();
        res.status(204).end();
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

module.exports = { getExamTypes, createExamType, updateExamType, deleteExamType };
