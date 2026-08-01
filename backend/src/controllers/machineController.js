const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const {
    createMachineSchema, updateMachineSchema,
    createServiceContractSchema, updateServiceContractSchema,
    createMaintenanceSchema, updateMaintenanceSchema,
    createDowntimeSchema, updateDowntimeSchema
} = require('../schemas/equipmentSchema');

let modalityDicomSchemaPromise = null;
const ensureModalityDicomSchema = async (db) => {
    if (!modalityDicomSchemaPromise) {
        modalityDicomSchemaPromise = db.query(`
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS aet VARCHAR(50);
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS ip_address VARCHAR(255);
            ALTER TABLE modalities ALTER COLUMN ip_address TYPE VARCHAR(255);
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS port INTEGER;
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS dicom_synced BOOLEAN DEFAULT FALSE;
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS dicom_role VARCHAR(30) DEFAULT 'mwl_client';
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
            ALTER TABLE examination_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
            ALTER TABLE examination_types ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
            ALTER TABLE examination_types DROP CONSTRAINT IF EXISTS examination_types_modality_id_name_key;
            CREATE INDEX IF NOT EXISTS idx_modalities_not_deleted
                ON modalities (status, type, name)
                WHERE deleted_at IS NULL;
        `).catch((error) => {
            modalityDicomSchemaPromise = null;
            throw error;
        });
    }
    return modalityDicomSchemaPromise;
};

// ─── Modalities (Registry) ───────────────────────────────────────────────────

const getMachines = (db) => async (req, res, next) => {
    try {
        await ensureModalityDicomSchema(db);
        const result = await db.query('SELECT * FROM modalities WHERE deleted_at IS NULL ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getMachineById = (db) => async (req, res, next) => {
    try {
        await ensureModalityDicomSchema(db);
        const { id } = req.params;
        const result = await db.query('SELECT * FROM modalities WHERE modality_id = $1 AND deleted_at IS NULL', [id]);
        if (result.rows.length === 0) return next(new AppError('Machine not found', 404));
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const createMachine = (db) => async (req, res, next) => {
    let client;
    try {
        await ensureModalityDicomSchema(db);
        const data = createMachineSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        const duplicate = await client.query('SELECT 1 FROM modalities WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL', [data.name]);
        if (duplicate.rows.length) throw new AppError('A machine with this name already exists', 409);

        const query = `
            INSERT INTO modalities (name, type, room_number, serial_number, manufacturer, model, installation_date, location, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const result = await client.query(query, [
            data.name, data.type, data.roomNumber, data.serialNumber, 
            data.manufacturer, data.model, data.installationDate || null, data.location, data.status
        ]);
        await logAction(client, {
            userId: req.user.user_id,
            action: 'MACHINE_CREATED',
            resourceId: result.rows[0].modality_id,
            resourceTable: 'modalities',
            ipAddress: req.ip,
            details: { name: data.name, type: data.type, roomNumber: data.roomNumber || null, status: data.status },
            required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateMachine = (db) => async (req, res, next) => {
    let client;
    try {
        await ensureModalityDicomSchema(db);
        const { id } = req.params;
        const data = updateMachineSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM modalities WHERE modality_id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
        if (existing.rows.length === 0) throw new AppError('Machine not found', 404);
        const curr = existing.rows[0];
        const duplicate = await client.query('SELECT 1 FROM modalities WHERE LOWER(name) = LOWER($1) AND modality_id <> $2 AND deleted_at IS NULL', [data.name ?? curr.name, id]);
        if (duplicate.rows.length) throw new AppError('A machine with this name already exists', 409);
        if (data.type && data.type !== curr.type) {
            const usage = await client.query('SELECT 1 FROM appointments WHERE modality_id = $1 LIMIT 1', [id]);
            if (usage.rows.length) throw new AppError('The modality type of a used machine cannot be changed', 409);
        }

        const updated = {
            name: data.name ?? curr.name,
            type: data.type ?? curr.type,
            roomNumber: data.roomNumber ?? curr.room_number,
            serialNumber: data.serialNumber ?? curr.serial_number,
            manufacturer: data.manufacturer ?? curr.manufacturer,
            model: data.model ?? curr.model,
            installationDate: data.installationDate !== undefined ? data.installationDate : curr.installation_date,
            location: data.location ?? curr.location,
            status: data.status ?? curr.status
        };

        const result = await client.query(`
            UPDATE modalities 
            SET name = $1, type = $2, room_number = $3, serial_number = $4, manufacturer = $5, model = $6, 
                installation_date = $7, location = $8, status = $9, updated_at = CURRENT_TIMESTAMP
            WHERE modality_id = $10 RETURNING *
        `, [
            updated.name, updated.type, updated.roomNumber, updated.serialNumber, updated.manufacturer, updated.model,
            updated.installationDate || null, updated.location, updated.status, id
        ]);

        const pacsIdentityChanged =
            (Object.prototype.hasOwnProperty.call(data, 'name') && updated.name !== curr.name) ||
            (Object.prototype.hasOwnProperty.call(data, 'status') && updated.status !== curr.status);
        if (curr.dicom_synced && pacsIdentityChanged) {
            const stale = await client.query(
                `UPDATE modalities
                 SET dicom_synced = FALSE, updated_at = CURRENT_TIMESTAMP
                 WHERE modality_id = $1
                 RETURNING *`,
                [id]
            );
            result.rows[0] = stale.rows[0] || result.rows[0];
        }

        await logAction(client, {
            userId: req.user.user_id,
            action: 'MACHINE_UPDATED',
            resourceId: id,
            resourceTable: 'modalities',
            ipAddress: req.ip,
            details: {
                changedFields: Object.keys(data),
                status: result.rows[0].status,
                pacsRegistrationMarkedStale: Boolean(curr.dicom_synced && pacsIdentityChanged)
            },
            required: true
        });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) {
            return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

// ─── Service Contracts ───────────────────────────────────────────────────────

const getServiceContracts = (db) => async (req, res, next) => {
    try {
        const { modalityId } = req.query;
        let query = `
            SELECT sc.*, m.name as modality_name 
            FROM service_contracts sc
            JOIN modalities m ON sc.modality_id = m.modality_id
        `;
        const params = [];
        if (modalityId) {
            query += ` WHERE sc.modality_id = $1`;
            params.push(modalityId);
        }
        query += ` ORDER BY sc.end_date DESC`;
        
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createServiceContract = (db) => async (req, res, next) => {
    try {
        const data = createServiceContractSchema.parse(req.body);
        const result = await db.query(`
            INSERT INTO service_contracts (modality_id, provider_name, contact_info, start_date, end_date, cost, status, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [data.modalityId, data.providerName, data.contactInfo, data.startDate, data.endDate, data.cost, data.status, data.notes]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const updateServiceContract = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateServiceContractSchema.parse(req.body);
        
        // Build dynamic update query
        const keys = Object.keys(data);
        if (keys.length === 0) return res.status(400).json({ message: 'No data provided' });
        
        const setClauses = keys.map((k, i) => {
            const dbKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            return `${dbKey} = $${i + 1}`;
        });
        const values = Object.values(data);
        values.push(id);
        
        const result = await db.query(`
            UPDATE service_contracts 
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE contract_id = $${values.length} RETURNING *
        `, values);
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

// ─── Equipment Maintenance ───────────────────────────────────────────────────

const getMaintenanceRecords = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT em.*, m.name as modality_name 
            FROM equipment_maintenance em
            JOIN modalities m ON em.modality_id = m.modality_id
            ORDER BY em.scheduled_date ASC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createMaintenance = (db) => async (req, res, next) => {
    try {
        const data = createMaintenanceSchema.parse(req.body);
        const result = await db.query(`
            INSERT INTO equipment_maintenance (modality_id, maintenance_type, scheduled_date, completed_date, performed_by, cost, status, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [data.modalityId, data.maintenanceType, data.scheduledDate, data.completedDate || null, data.performedBy, data.cost, data.status, data.notes]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const updateMaintenance = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateMaintenanceSchema.parse(req.body);
        
        const keys = Object.keys(data);
        if (keys.length === 0) return res.status(400).json({ message: 'No data provided' });
        
        const setClauses = keys.map((k, i) => {
            const dbKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            return `${dbKey} = $${i + 1}`;
        });
        const values = Object.values(data);
        values.push(id);
        
        const result = await db.query(`
            UPDATE equipment_maintenance 
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE maintenance_id = $${values.length} RETURNING *
        `, values);
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

// ─── Equipment Downtime ──────────────────────────────────────────────────────

const getDowntimeRecords = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT ed.*, m.name as modality_name, u.full_name as created_by_name
            FROM equipment_downtime ed
            JOIN modalities m ON ed.modality_id = m.modality_id
            LEFT JOIN users u ON ed.created_by = u.user_id
            ORDER BY ed.start_time DESC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createDowntime = (db) => async (req, res, next) => {
    try {
        const data = createDowntimeSchema.parse(req.body);
        const userId = req.user.user_id;
        
        const result = await db.query(`
            INSERT INTO equipment_downtime (modality_id, start_time, end_time, reason, status, resolution_notes, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [data.modalityId, data.startTime, data.endTime, data.reason, data.status, data.resolutionNotes, userId]);
        
        // Optionally update machine status to 'Under Maintenance' if downtime is currently active
        await db.query(`
            UPDATE modalities 
            SET status = 'Under Maintenance' 
            WHERE modality_id = $1 
              AND status = 'Active' 
              AND CURRENT_TIMESTAMP >= $2::timestamp 
              AND CURRENT_TIMESTAMP <= $3::timestamp
        `, [data.modalityId, data.startTime, data.endTime]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const updateDowntime = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateDowntimeSchema.parse(req.body);
        
        const keys = Object.keys(data);
        if (keys.length === 0) return res.status(400).json({ message: 'No data provided' });
        
        const setClauses = keys.map((k, i) => {
            const dbKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            return `${dbKey} = $${i + 1}`;
        });
        const values = Object.values(data);
        values.push(id);
        
        const result = await db.query(`
            UPDATE equipment_downtime 
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE downtime_id = $${values.length} RETURNING *
        `, values);
        if (!result.rows[0]) return next(new AppError('Downtime record not found', 404));
        
        // Reactivate only when no other current outage still blocks this machine.
        if (data.status === 'Resolved') {
            await db.query(`
                UPDATE modalities m
                SET status = 'Active'
                WHERE m.modality_id = $1
                  AND m.status = 'Under Maintenance'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM equipment_downtime ed
                      WHERE ed.modality_id = m.modality_id
                        AND ed.status <> 'Resolved'
                        AND ed.start_time <= CURRENT_TIMESTAMP
                        AND ed.end_time >= CURRENT_TIMESTAMP
                  )
            `, [result.rows[0].modality_id]);
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const getUtilizationReport = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        // Basic utilization: For each machine, compare total available hours vs scheduled exam hours
        // Simplification: We assume a 10-hour workday (e.g., 8am-6pm)
        // This calculates scheduled time from appointments.
        
        const query = `
            WITH available AS (
                SELECT modality_id, name,
                       (EXTRACT(EPOCH FROM ($2::timestamp - $1::timestamp))/3600 * (10.0/24.0)) as total_available_hours
                FROM modalities
                WHERE status != 'Out of Service'
                  AND deleted_at IS NULL
            ),
            scheduled AS (
                SELECT modality_id,
                       SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as scheduled_hours
                FROM appointments
                WHERE status != 'Cancelled' 
                  AND start_time >= $1 AND end_time <= $2
                GROUP BY modality_id
            ),
            downtime AS (
                SELECT modality_id,
                       SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as downtime_hours
                FROM equipment_downtime
                WHERE start_time >= $1 AND end_time <= $2
                GROUP BY modality_id
            )
            SELECT a.modality_id, a.name, a.total_available_hours,
                   COALESCE(s.scheduled_hours, 0) as scheduled_hours,
                   COALESCE(d.downtime_hours, 0) as downtime_hours
            FROM available a
            LEFT JOIN scheduled s ON a.modality_id = s.modality_id
            LEFT JOIN downtime d ON a.modality_id = d.modality_id
        `;
        
        // Defaults: last 30 days
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : new Date();
        if (!startDate) start.setDate(end.getDate() - 30);
        
        const result = await db.query(query, [start.toISOString(), end.toISOString()]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const deleteMachine = (db) => async (req, res, next) => {
    let client;
    try {
        await ensureModalityDicomSchema(db);
        const { id } = req.params;
        client = await db.connect();
        await client.query('BEGIN');

        // Check if machine exists
        const checkResult = await client.query('SELECT name, deleted_at FROM modalities WHERE modality_id = $1 FOR UPDATE', [id]);
        if (checkResult.rows.length === 0) {
            await client.query('COMMIT');
            return res.status(204).end();
        }
        if (checkResult.rows[0].deleted_at) {
            await client.query('COMMIT');
            return res.status(204).end();
        }
        const machineName = checkResult.rows[0].name;

        // Check if linked to any active upcoming appointments
        const appointmentsResult = await client.query(`
            SELECT 1 FROM appointments 
            WHERE modality_id = $1 
              AND status NOT IN ('Completed', 'Cancelled', 'No-Show')
              AND start_time > NOW()
            LIMIT 1
        `, [id]);
        if (appointmentsResult.rows.length > 0) {
            throw new AppError('Cannot delete this machine because it has active upcoming appointments scheduled. Please reschedule or reassign those appointments first.', 400);
        }

        const archivedProcedures = await client.query(`
            UPDATE examination_types
            SET is_active = FALSE,
                deleted_at = CURRENT_TIMESTAMP,
                deleted_by = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE modality_id = $1
              AND deleted_at IS NULL
            RETURNING type_id
        `, [id, req.user.user_id]);

        const deleteResult = await client.query(`
            UPDATE modalities
            SET status = 'Out of Service',
                deleted_at = CURRENT_TIMESTAMP,
                deleted_by = $2,
                dicom_synced = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE modality_id = $1
              AND deleted_at IS NULL
        `, [id, req.user.user_id]);
        if (deleteResult.rowCount !== 1) {
            throw new AppError('Machine was not deleted. Please refresh and try again.', 409);
        }

        // Log audit trail
        await logAction(client, {
            userId: req.user.user_id,
            action: 'MACHINE_DELETED',
            resourceId: id,
            resourceTable: 'modalities',
            ipAddress: req.ip,
            details: { name: machineName, archivedProcedures: archivedProcedures.rowCount },
            required: true
        });

        await client.query('COMMIT');
        res.status(204).end();
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

module.exports = { 
    getMachines, getMachineById, createMachine, updateMachine, deleteMachine,
    getServiceContracts, createServiceContract, updateServiceContract,
    getMaintenanceRecords, createMaintenance, updateMaintenance,
    getDowntimeRecords, createDowntime, updateDowntime, getUtilizationReport
};
