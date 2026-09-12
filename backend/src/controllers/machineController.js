const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const {
    createMachineSchema, updateMachineSchema,
    createServiceContractSchema, updateServiceContractSchema,
    createMaintenanceSchema, updateMaintenanceSchema,
    createDowntimeSchema, updateDowntimeSchema
} = require('../schemas/equipmentSchema');
const { getWorkingHours } = require('../services/schedulingService');
const { decrypt } = require('../utils/crypto');
const { triggerEventForRole } = require('../services/notificationJobService');

const occurrenceKeyFor = (record, timestampField) => {
    const timestamp = record?.[timestampField];
    const parsed = timestamp ? new Date(timestamp) : null;
    return parsed && !Number.isNaN(parsed.getTime())
        ? parsed.toISOString()
        : `${record?.maintenance_id || record?.downtime_id}:${timestampField}`;
};

const notifyEquipmentRoles = async (db, eventType, roles, payload) => {
    // The database transaction is already committed. A delivery provider failure
    // must not turn a successfully persisted equipment change into an API error.
    await Promise.allSettled(roles.map(role => triggerEventForRole(db, eventType, role, payload)));
};

// ─── Modalities (Registry) ───────────────────────────────────────────────────

const getMachines = (db) => async (req, res, next) => {
    try {
        const includeInfrastructure = ['Developer', 'Admin', 'Technician'].includes(req.user.role);
        const infrastructureFields = includeInfrastructure
            ? ', serial_number, aet, ip_address, port, dicom_role'
            : '';
        const result = await db.query(`
            SELECT m.modality_id, m.name, m.type, m.room_id, m.manufacturer, m.model,
                   m.installation_date, m.location, m.status, m.dicom_synced, m.created_at, m.updated_at,
                   COALESCE(r.name, m.room_number) AS room_name,
                   COALESCE(r.room_number, m.room_number) AS room_number,
                   r.status AS room_status,
                   COUNT(et.type_id) FILTER (WHERE et.deleted_at IS NULL AND et.is_active = TRUE)::int AS active_procedures_count,
                   COUNT(et.type_id) FILTER (WHERE et.deleted_at IS NULL)::int AS total_procedures_count
                   ${infrastructureFields}
            FROM modalities m
            LEFT JOIN rooms r ON m.room_id = r.room_id
            LEFT JOIN examination_types et ON m.modality_id = et.modality_id
            WHERE m.deleted_at IS NULL
            GROUP BY m.modality_id, r.name, r.room_number, r.status
            ORDER BY m.name
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getMachineById = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const includeInfrastructure = ['Developer', 'Admin', 'Technician'].includes(req.user.role);
        const infrastructureFields = includeInfrastructure
            ? ', m.serial_number, m.aet, m.ip_address, m.port, m.dicom_role'
            : '';
        const result = await db.query(`
            SELECT m.modality_id, m.name, m.type, m.room_id, m.manufacturer, m.model,
                   m.installation_date, m.location, m.status, m.dicom_synced, m.created_at, m.updated_at,
                   COALESCE(r.name, m.room_number) AS room_name,
                   COALESCE(r.room_number, m.room_number) AS room_number,
                   r.status AS room_status
                   ${infrastructureFields}
            FROM modalities m
            LEFT JOIN rooms r ON m.room_id = r.room_id
            WHERE m.modality_id = $1 AND m.deleted_at IS NULL
        `, [id]);
        if (result.rows.length === 0) return next(new AppError('Machine not found', 404));
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const createMachine = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createMachineSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        const duplicate = await client.query('SELECT 1 FROM modalities WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL', [data.name]);
        if (duplicate.rows.length) throw new AppError('A machine with this name already exists', 409);

        let roomId = null;
        if (data.roomId) {
            roomId = data.roomId;
        } else if (data.roomNumber) {
            const rMatch = await client.query('SELECT room_id FROM rooms WHERE LOWER(room_number) = LOWER($1)', [data.roomNumber]);
            if (rMatch.rows.length) {
                roomId = rMatch.rows[0].room_id;
            } else {
                const newRoom = await client.query(`
                    INSERT INTO rooms (name, room_number, type, floor, status)
                    VALUES ($1, $2, 'Imaging', $3, 'Active')
                    ON CONFLICT (room_number) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                    RETURNING room_id
                `, [`جناح ${data.roomNumber}`, data.roomNumber, data.location || null]);
                roomId = newRoom.rows[0].room_id;
            }
        }

        const query = `
            INSERT INTO modalities (name, type, room_number, room_id, serial_number, manufacturer, model, installation_date, location, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `;
        const result = await client.query(query, [
            data.name, data.type, data.roomNumber, roomId, data.serialNumber,
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

        let roomId = curr.room_id;
        if (data.roomId !== undefined) {
            roomId = data.roomId;
        } else if (updated.roomNumber && updated.roomNumber !== curr.room_number) {
            const rMatch = await client.query('SELECT room_id FROM rooms WHERE LOWER(room_number) = LOWER($1)', [updated.roomNumber]);
            if (rMatch.rows.length) {
                roomId = rMatch.rows[0].room_id;
            } else {
                const newRoom = await client.query(`
                    INSERT INTO rooms (name, room_number, type, floor, status)
                    VALUES ($1, $2, 'Imaging', $3, 'Active')
                    ON CONFLICT (room_number) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                    RETURNING room_id
                `, [`جناح ${updated.roomNumber}`, updated.roomNumber, updated.location || null]);
                roomId = newRoom.rows[0].room_id;
            }
        }

        const result = await client.query(`
            UPDATE modalities
            SET name = $1, type = $2, room_number = $3, room_id = $4, serial_number = $5, manufacturer = $6, model = $7,
                installation_date = $8, location = $9, status = $10, updated_at = CURRENT_TIMESTAMP
            WHERE modality_id = $11 RETURNING *
        `, [
            updated.name, updated.type, updated.roomNumber, roomId, updated.serialNumber, updated.manufacturer, updated.model,
            updated.installationDate || null, updated.location, updated.status, id
        ]);

        let impactedAppointments = [];
        if (['Under Maintenance', 'Out of Service'].includes(updated.status) && curr.status !== updated.status) {
            const apptQuery = await client.query(`
                SELECT a.appointment_id, a.start_time, a.end_time, a.status, a.order_number,
                       p.mrn, p.first_name_enc, p.last_name_enc, p.phone,
                       et.name AS exam_type_name
                FROM appointments a
                JOIN patients p ON a.patient_id = p.patient_id
                LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
                WHERE a.modality_id = $1
                  AND a.start_time > NOW()
                  AND a.status NOT IN ('Completed', 'Cancelled', 'No-Show')
                ORDER BY a.start_time ASC
                LIMIT 50
            `, [id]);
            impactedAppointments = apptQuery.rows.map(row => {
                const mapped = { ...row };
                if (row.first_name_enc || row.last_name_enc) {
                    mapped.patient_name = [decrypt(row.first_name_enc), decrypt(row.last_name_enc)].filter(Boolean).join(' ');
                }
                delete mapped.first_name_enc;
                delete mapped.last_name_enc;
                return mapped;
            });
        }

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
                impactedAppointmentsCount: impactedAppointments.length,
                pacsRegistrationMarkedStale: Boolean(curr.dicom_synced && pacsIdentityChanged)
            },
            required: true
        });
        await client.query('COMMIT');
        res.json({
            ...result.rows[0],
            impactedAppointmentsCount: impactedAppointments.length,
            impactedAppointments
        });
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
        const existing = await db.query('SELECT * FROM service_contracts WHERE contract_id = $1', [id]);
        if (!existing.rows[0]) return next(new AppError('Service contract not found', 404));
        const nextStartDate = data.startDate ?? existing.rows[0].start_date;
        const nextEndDate = data.endDate ?? existing.rows[0].end_date;
        if (nextEndDate < nextStartDate) {
            return next(new AppError('Contract end date must be on or after start date', 400));
        }
        
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
    let client;
    try {
        const data = createMaintenanceSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(`
            WITH created AS (
                INSERT INTO equipment_maintenance (modality_id, maintenance_type, scheduled_date, completed_date, performed_by, cost, status, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
            )
            SELECT created.*, m.name AS modality_name
            FROM created
            JOIN modalities m ON m.modality_id = created.modality_id
        `, [data.modalityId, data.maintenanceType, data.scheduledDate, data.completedDate || null, data.performedBy, data.cost, data.status, data.notes]);
        const maintenance = result.rows[0];
        await client.query('COMMIT');

        await notifyEquipmentRoles(db, 'EquipmentMaintenanceCreated', ['Technician', 'Admin'], {
            entityType: 'EquipmentMaintenance',
            entityId: maintenance.maintenance_id,
            occurrenceKey: occurrenceKeyFor(maintenance, 'created_at'),
            priority: 'Normal',
            variables: {
                maintenance_id: maintenance.maintenance_id,
                modality_id: maintenance.modality_id,
                modality_name: maintenance.modality_name,
                maintenance_type: maintenance.maintenance_type,
                scheduled_date: maintenance.scheduled_date,
                status: maintenance.status
            }
        });
        res.status(201).json(maintenance);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateMaintenance = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = updateMaintenanceSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query('SELECT * FROM equipment_maintenance WHERE maintenance_id = $1 FOR UPDATE', [id]);
        if (!existing.rows[0]) throw new AppError('Maintenance record not found', 404);
        const nextScheduledDate = data.scheduledDate ?? existing.rows[0].scheduled_date;
        const nextCompletedDate = data.completedDate !== undefined ? data.completedDate : existing.rows[0].completed_date;
        const nextStatus = data.status ?? existing.rows[0].status;
        if (nextCompletedDate && nextCompletedDate < nextScheduledDate) {
            throw new AppError('Completion date cannot be before the scheduled date', 400);
        }
        if (nextStatus === 'Completed' && !nextCompletedDate) {
            throw new AppError('Completed maintenance requires a completion date', 400);
        }
        
        const keys = Object.keys(data);
        if (keys.length === 0) throw new AppError('No data provided', 400);
        
        const setClauses = keys.map((k, i) => {
            const dbKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            return `${dbKey} = $${i + 1}`;
        });
        const values = Object.values(data);
        values.push(id);
        
        const result = await client.query(`
            WITH updated AS (
                UPDATE equipment_maintenance
                SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE maintenance_id = $${values.length} RETURNING *
            )
            SELECT updated.*, m.name AS modality_name
            FROM updated
            JOIN modalities m ON m.modality_id = updated.modality_id
        `, values);
        const maintenance = result.rows[0];
        await client.query('COMMIT');

        await notifyEquipmentRoles(db, 'EquipmentMaintenanceUpdated', ['Technician', 'Admin'], {
            entityType: 'EquipmentMaintenance',
            entityId: maintenance.maintenance_id,
            occurrenceKey: occurrenceKeyFor(maintenance, 'updated_at'),
            priority: 'Action',
            variables: {
                maintenance_id: maintenance.maintenance_id,
                modality_id: maintenance.modality_id,
                modality_name: maintenance.modality_name,
                maintenance_type: maintenance.maintenance_type,
                scheduled_date: maintenance.scheduled_date,
                status: maintenance.status,
                changed_fields: keys.join(', ')
            }
        });
        res.json(maintenance);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
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
    let client;
    try {
        const data = createDowntimeSchema.parse(req.body);
        const userId = req.user.user_id;
        client = await db.connect();
        await client.query('BEGIN');

        const overlap = await client.query(`
            SELECT downtime_id
            FROM equipment_downtime
            WHERE modality_id = $1
              AND status <> 'Resolved'
              AND tstzrange(start_time, end_time, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
            FOR UPDATE
        `, [data.modalityId, data.startTime, data.endTime]);
        if (overlap.rows.length) throw new AppError('This downtime window overlaps an existing unresolved record', 409);

        const result = await client.query(`
            WITH created AS (
                INSERT INTO equipment_downtime (modality_id, start_time, end_time, reason, status, resolution_notes, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
            )
            SELECT created.*, m.name AS modality_name
            FROM created
            JOIN modalities m ON m.modality_id = created.modality_id
        `, [data.modalityId, data.startTime, data.endTime, data.reason, data.status, data.resolutionNotes, userId]);
        const downtime = result.rows[0];
        await client.query('COMMIT');

        await notifyEquipmentRoles(db, 'EquipmentDowntimeCreated', ['Technician', 'Receptionist', 'Admin'], {
            entityType: 'EquipmentDowntime',
            entityId: downtime.downtime_id,
            occurrenceKey: occurrenceKeyFor(downtime, 'created_at'),
            priority: downtime.status === 'Unplanned' ? 'Critical' : 'Action',
            variables: {
                downtime_id: downtime.downtime_id,
                modality_id: downtime.modality_id,
                modality_name: downtime.modality_name,
                start_time: downtime.start_time,
                end_time: downtime.end_time,
                reason: downtime.reason,
                status: downtime.status
            }
        });
        res.status(201).json(downtime);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateDowntime = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = updateDowntimeSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        const existingResult = await client.query(
            'SELECT * FROM equipment_downtime WHERE downtime_id = $1 FOR UPDATE',
            [id]
        );
        if (!existingResult.rows[0]) throw new AppError('Downtime record not found', 404);
        const existing = existingResult.rows[0];
        if (existing.status === 'Resolved') throw new AppError('Resolved downtime records are immutable', 409);

        const nextModalityId = data.modalityId ?? existing.modality_id;
        const nextStartTime = data.startTime ?? existing.start_time;
        const nextEndTime = data.endTime ?? existing.end_time;
        if (new Date(nextEndTime) <= new Date(nextStartTime)) {
            throw new AppError('Downtime end time must be after start time', 400);
        }
        if (data.status !== 'Resolved') {
            const overlap = await client.query(`
                SELECT downtime_id
                FROM equipment_downtime
                WHERE modality_id = $1
                  AND downtime_id <> $2
                  AND status <> 'Resolved'
                  AND tstzrange(start_time, end_time, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
                FOR UPDATE
            `, [nextModalityId, id, nextStartTime, nextEndTime]);
            if (overlap.rows.length) throw new AppError('This downtime window overlaps an existing unresolved record', 409);
        }

        const keys = Object.keys(data);
        if (keys.length === 0) throw new AppError('No data provided', 400);
        
        const setClauses = keys.map((k, i) => {
            const dbKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            return `${dbKey} = $${i + 1}`;
        });
        const values = Object.values(data);
        values.push(id);
        
        const result = await client.query(`
            WITH updated AS (
                UPDATE equipment_downtime
                SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE downtime_id = $${values.length} RETURNING *
            )
            SELECT updated.*, m.name AS modality_name
            FROM updated
            JOIN modalities m ON m.modality_id = updated.modality_id
        `, values);
        const downtime = result.rows[0];
        await client.query('COMMIT');

        const resolved = downtime.status === 'Resolved';
        await notifyEquipmentRoles(
            db,
            resolved ? 'EquipmentDowntimeResolved' : 'EquipmentDowntimeUpdated',
            ['Technician', 'Receptionist', 'Admin'],
            {
                entityType: 'EquipmentDowntime',
                entityId: downtime.downtime_id,
                occurrenceKey: occurrenceKeyFor(downtime, 'updated_at'),
                priority: resolved ? 'Normal' : 'Warning',
                variables: {
                    downtime_id: downtime.downtime_id,
                    modality_id: downtime.modality_id,
                    modality_name: downtime.modality_name,
                    start_time: downtime.start_time,
                    end_time: downtime.end_time,
                    reason: downtime.reason,
                    status: downtime.status,
                    resolution_notes: downtime.resolution_notes,
                    changed_fields: keys.join(', ')
                }
            }
        );
        res.json(downtime);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getUtilizationReport = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const parseDate = (value, label) => {
            const parsed = new Date(`${value}T00:00:00.000Z`);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(parsed.getTime())
                || parsed.toISOString().slice(0, 10) !== value) {
                throw new AppError(`Invalid ${label}`, 400);
            }
            return parsed;
        };

        const today = new Date();
        const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
        const inclusiveEnd = endDate ? parseDate(endDate, 'endDate') : todayUtc;
        const rangeEnd = new Date(inclusiveEnd);
        rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
        const rangeStart = startDate ? parseDate(startDate, 'startDate') : new Date(rangeEnd.getTime() - 30 * 86400000);
        if (rangeStart >= rangeEnd) throw new AppError('startDate must be on or before endDate', 400);

        const workingHours = await getWorkingHours(db);
        const hoursPerDay = Math.max(0, Math.min(24, Number(workingHours.end) - Number(workingHours.start)));
        const holidaySet = new Set(workingHours.holidays || []);
        const workingDays = new Set(workingHours.workingDays || [0, 1, 2, 3, 4, 5, 6]);
        let availableDays = 0;
        for (let day = new Date(rangeStart); day < rangeEnd; day.setUTCDate(day.getUTCDate() + 1)) {
            if (workingDays.has(day.getUTCDay()) && !holidaySet.has(day.toISOString().slice(0, 10))) {
                availableDays += 1;
            }
        }
        const totalAvailableHours = availableDays * hoursPerDay;

        const query = `
            WITH available AS (
                SELECT modality_id, name,
                       $3::numeric as total_available_hours
                FROM modalities
                WHERE status != 'Out of Service'
                  AND deleted_at IS NULL
            ),
            scheduled AS (
                SELECT modality_id,
                       SUM(EXTRACT(EPOCH FROM (LEAST(end_time, $2) - GREATEST(start_time, $1)))/3600) as scheduled_hours
                FROM appointments
                WHERE status NOT IN ('Cancelled', 'No-Show')
                  AND start_time < $2 AND end_time > $1
                GROUP BY modality_id
            ),
            downtime AS (
                SELECT modality_id,
                       SUM(EXTRACT(EPOCH FROM (LEAST(end_time, $2) - GREATEST(start_time, $1)))/3600) as downtime_hours
                FROM equipment_downtime
                WHERE start_time < $2 AND end_time > $1
                GROUP BY modality_id
            )
            SELECT a.modality_id, a.name, a.total_available_hours,
                   COALESCE(s.scheduled_hours, 0) as scheduled_hours,
                   COALESCE(d.downtime_hours, 0) as downtime_hours
            FROM available a
            LEFT JOIN scheduled s ON a.modality_id = s.modality_id
            LEFT JOIN downtime d ON a.modality_id = d.modality_id
        `;

        const result = await db.query(query, [rangeStart.toISOString(), rangeEnd.toISOString(), totalAvailableHours]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const deleteMachine = (db) => async (req, res, next) => {
    let client;
    try {
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
