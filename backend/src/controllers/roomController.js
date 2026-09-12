const { z } = require('zod');
const { AppError } = require('../utils/errors');
const { logAction } = require('../services/auditService');
const { decrypt } = require('../utils/crypto');

const roomSchema = z.object({
    name: z.string().trim().min(2).max(100),
    roomNumber: z.string().trim().min(1).max(50),
    type: z.enum(['Imaging', 'Preparation', 'Recovery', 'Reading', 'Consultation', 'Laboratory', 'Other']).default('Imaging'),
    floor: z.string().trim().max(50).optional().nullable(),
    status: z.enum(['Active', 'Under Maintenance', 'Out of Service']).default('Active'),
    notes: z.string().trim().optional().nullable()
});

const updateRoomSchema = roomSchema.partial();

const getRooms = (db) => async (req, res, next) => {
    try {
        const { status, type } = req.query;
        const filters = [];
        const params = [];

        if (status) {
            params.push(status);
            filters.push(`r.status = $${params.length}`);
        }
        if (type) {
            params.push(type);
            filters.push(`r.type = $${params.length}`);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

        const query = `
            SELECT r.room_id, r.name, r.room_number, r.type, r.floor, r.status, r.notes,
                   r.created_at, r.updated_at,
                    COUNT(m.modality_id)::int AS total_machines,
                    COUNT(m.modality_id) FILTER (WHERE m.status = 'Active')::int AS active_machines,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'modality_id', m.modality_id,
                                'name', m.name,
                                'type', m.type,
                                'status', m.status
                            )
                        ) FILTER (WHERE m.modality_id IS NOT NULL),
                        '[]'::json
                    ) AS machines
            FROM rooms r
            LEFT JOIN modalities m ON r.room_id = m.room_id
            ${whereClause}
            GROUP BY r.room_id
            ORDER BY r.type, r.room_number, r.name
        `;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getRoomById = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // 1. Get Room
        const roomResult = await db.query(`
            SELECT r.room_id, r.name, r.room_number, r.type, r.floor, r.status, r.notes,
                   r.created_at, r.updated_at
            FROM rooms r
            WHERE r.room_id = $1
        `, [id]);

        if (!roomResult.rows.length) {
            return next(new AppError('Room not found', 404));
        }
        const room = roomResult.rows[0];

        // 2. Get Machines installed in this room
        const machinesResult = await db.query(`
            SELECT m.modality_id, m.name, m.type, m.room_id, m.manufacturer, m.model,
                   m.serial_number, m.installation_date, m.location, m.status, m.dicom_synced,
                   COUNT(et.type_id) FILTER (WHERE et.is_active = TRUE)::int AS active_procedures_count
            FROM modalities m
            LEFT JOIN examination_types et ON m.modality_id = et.modality_id
            WHERE m.room_id = $1
            GROUP BY m.modality_id
            ORDER BY m.name
        `, [id]);

        // 3. Get Procedures supported on equipment in this room
        const proceduresResult = await db.query(`
            SELECT et.type_id, et.modality_id, et.code, et.name, et.price,
                   et.duration_minutes, et.body_part, et.preparation_instructions,
                   et.contrast_required, et.is_active,
                   m.name AS modality_name
            FROM examination_types et
            JOIN modalities m ON m.modality_id = et.modality_id
            WHERE m.room_id = $1
            ORDER BY et.name
        `, [id]);

        // 4. Get Upcoming Appointments in this room (either directly assigned to room_id or on modalities in this room)
        const appointmentsResult = await db.query(`
            SELECT a.appointment_id, a.start_time, a.end_time, a.status, a.order_number,
                   p.mrn, p.first_name_enc, p.last_name_enc,
                   et.name AS exam_name,
                   m.name AS modality_name
            FROM appointments a
            LEFT JOIN modalities m ON a.modality_id = m.modality_id
            LEFT JOIN patients p ON a.patient_id = p.patient_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            WHERE (a.room_id = $1 OR m.room_id = $1)
              AND a.start_time >= CURRENT_DATE
              AND a.status NOT IN ('Cancelled', 'No-Show')
            ORDER BY a.start_time ASC
            LIMIT 25
        `, [id]);

        const upcomingAppointments = appointmentsResult.rows.map(appt => ({
            ...appt,
            patient_name: appt.first_name_enc ? `${decrypt(appt.first_name_enc) || ''} ${decrypt(appt.last_name_enc) || ''}`.trim() : null
        }));

        // 5. Calculate statistics
        const todayCountResult = await db.query(`
            SELECT COUNT(a.appointment_id)::int AS today_count
            FROM appointments a
            LEFT JOIN modalities m ON a.modality_id = m.modality_id
            WHERE (a.room_id = $1 OR m.room_id = $1)
              AND a.start_time >= CURRENT_DATE AND a.start_time < CURRENT_DATE + INTERVAL '1 day'
              AND a.status NOT IN ('Cancelled')
        `, [id]);

        const statistics = {
            totalMachines: machinesResult.rows.length,
            activeMachines: machinesResult.rows.filter(m => m.status === 'Active').length,
            totalProcedures: proceduresResult.rows.length,
            activeProcedures: proceduresResult.rows.filter(p => p.is_active).length,
            todayAppointmentsCount: todayCountResult.rows[0]?.today_count || 0,
            upcomingAppointmentsCount: upcomingAppointments.length,
            maintenanceMachines: machinesResult.rows.filter(m => m.status === 'Under Maintenance').length
        };

        res.json({
            ...room,
            machines: machinesResult.rows,
            procedures: proceduresResult.rows,
            upcomingAppointments,
            statistics
        });
    } catch (error) {
        next(error);
    }
};

const createRoom = (db) => async (req, res, next) => {
    let client;
    try {
        const data = roomSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query('SELECT 1 FROM rooms WHERE LOWER(room_number) = LOWER($1)', [data.roomNumber]);
        if (existing.rows.length) {
            throw new AppError('A room with this room number already exists', 409);
        }

        const result = await client.query(`
            INSERT INTO rooms (name, room_number, type, floor, status, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [data.name, data.roomNumber, data.type, data.floor || null, data.status, data.notes || null]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'ROOM_CREATED',
            resourceId: result.rows[0].room_id,
            resourceTable: 'rooms',
            ipAddress: req.ip,
            details: { name: data.name, roomNumber: data.roomNumber, type: data.type, status: data.status },
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

const updateRoom = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = updateRoomSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [id]);
        if (!existing.rows.length) {
            throw new AppError('Room not found', 404);
        }
        const curr = existing.rows[0];

        if (data.roomNumber && data.roomNumber.toLowerCase() !== curr.room_number.toLowerCase()) {
            const dup = await client.query('SELECT 1 FROM rooms WHERE LOWER(room_number) = LOWER($1) AND room_id <> $2', [data.roomNumber, id]);
            if (dup.rows.length) {
                throw new AppError('A room with this room number already exists', 409);
            }
        }

        const updated = {
            name: data.name ?? curr.name,
            roomNumber: data.roomNumber ?? curr.room_number,
            type: data.type ?? curr.type,
            floor: data.floor !== undefined ? data.floor : curr.floor,
            status: data.status ?? curr.status,
            notes: data.notes !== undefined ? data.notes : curr.notes
        };

        const result = await client.query(`
            UPDATE rooms
            SET name = $1, room_number = $2, type = $3, floor = $4, status = $5, notes = $6, updated_at = CURRENT_TIMESTAMP
            WHERE room_id = $7
            RETURNING *
        `, [updated.name, updated.roomNumber, updated.type, updated.floor, updated.status, updated.notes, id]);

        // If room_number changed, sync it to modalities located in this room
        if (data.roomNumber && data.roomNumber !== curr.room_number) {
            await client.query('UPDATE modalities SET room_number = $1 WHERE room_id = $2', [data.roomNumber, id]);
        }

        await logAction(client, {
            userId: req.user.user_id,
            action: 'ROOM_UPDATED',
            resourceId: id,
            resourceTable: 'rooms',
            ipAddress: req.ip,
            details: { changedFields: Object.keys(data), previousStatus: curr.status, newStatus: updated.status },
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

const deleteRoom = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [id]);
        if (!existing.rows.length) {
            throw new AppError('Room not found', 404);
        }
        const room = existing.rows[0];

        // Check if machines are assigned to this room
        const activeMachines = await client.query(`
            SELECT 1 FROM modalities
            WHERE room_id = $1 AND deleted_at IS NULL
            LIMIT 1
        `, [id]);
        if (activeMachines.rows.length) {
            throw new AppError('Cannot delete this room because active imaging equipment is assigned to it. Reassign or remove the equipment first.', 409);
        }

        // Check for upcoming appointments in this room
        const upcomingAppts = await client.query(`
            SELECT 1 FROM appointments
            WHERE room_id = $1 
              AND status NOT IN ('Completed', 'Cancelled', 'No-Show')
              AND start_time > NOW()
            LIMIT 1
        `, [id]);
        if (upcomingAppts.rows.length) {
            throw new AppError('Cannot delete this room because active upcoming appointments are scheduled in it.', 409);
        }

        await client.query('DELETE FROM rooms WHERE room_id = $1', [id]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'ROOM_DELETED',
            resourceId: id,
            resourceTable: 'rooms',
            ipAddress: req.ip,
            details: { name: room.name, roomNumber: room.room_number },
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

const getClinicalHierarchyMatrix = (db) => async (req, res, next) => {
    try {
        const roomsResult = await db.query(`
            SELECT r.room_id, r.name, r.room_number, r.type, r.floor, r.status, r.notes,
                   r.created_at, r.updated_at
            FROM rooms r
            ORDER BY r.type, r.room_number, r.name
        `);

        const machinesResult = await db.query(`
            SELECT m.modality_id, m.name, m.type, m.room_id, m.manufacturer, m.model,
                   m.serial_number, m.installation_date, m.location, m.status, m.dicom_synced,
                   r.name AS room_name, r.room_number, r.status AS room_status
            FROM modalities m
            LEFT JOIN rooms r ON m.room_id = r.room_id
            WHERE m.deleted_at IS NULL
            ORDER BY m.name
        `);

        const proceduresResult = await db.query(`
            SELECT et.type_id, et.modality_id, et.code, et.name, et.price,
                   et.duration_minutes, et.body_part, et.preparation_instructions,
                   et.contrast_required, et.is_active,
                   m.name AS modality_name, m.room_id
            FROM examination_types et
            JOIN modalities m ON m.modality_id = et.modality_id AND m.deleted_at IS NULL
            WHERE et.deleted_at IS NULL
            ORDER BY et.name
        `);

        const proceduresByModality = {};
        for (const proc of proceduresResult.rows) {
            if (!proceduresByModality[proc.modality_id]) {
                proceduresByModality[proc.modality_id] = [];
            }
            proceduresByModality[proc.modality_id].push(proc);
        }

        const machinesByRoom = {};
        const unassignedMachines = [];
        for (const machine of machinesResult.rows) {
            const enrichedMachine = {
                ...machine,
                procedures: proceduresByModality[machine.modality_id] || [],
                procedures_count: (proceduresByModality[machine.modality_id] || []).length
            };
            if (machine.room_id) {
                if (!machinesByRoom[machine.room_id]) {
                    machinesByRoom[machine.room_id] = [];
                }
                machinesByRoom[machine.room_id].push(enrichedMachine);
            } else {
                unassignedMachines.push(enrichedMachine);
            }
        }

        const rooms = roomsResult.rows.map(room => {
            const roomMachines = machinesByRoom[room.room_id] || [];
            const totalProcedures = roomMachines.reduce((sum, m) => sum + m.procedures_count, 0);
            return {
                ...room,
                machines: roomMachines,
                total_machines: roomMachines.length,
                active_machines: roomMachines.filter(m => m.status === 'Active').length,
                total_procedures: totalProcedures
            };
        });

        const kpis = {
            totalRooms: rooms.length,
            activeRooms: rooms.filter(r => r.status === 'Active').length,
            maintenanceRooms: rooms.filter(r => r.status === 'Under Maintenance').length,
            totalMachines: machinesResult.rows.length,
            activeMachines: machinesResult.rows.filter(m => m.status === 'Active').length,
            maintenanceMachines: machinesResult.rows.filter(m => m.status === 'Under Maintenance').length,
            outOfServiceMachines: machinesResult.rows.filter(m => m.status === 'Out of Service').length,
            totalProcedures: proceduresResult.rows.length,
            activeProcedures: proceduresResult.rows.filter(p => p.is_active).length,
            contrastProcedures: proceduresResult.rows.filter(p => p.contrast_required).length
        };

        res.json({
            kpis,
            rooms,
            unassignedMachines
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRooms,
    getRoomById,
    createRoom,
    updateRoom,
    deleteRoom,
    getClinicalHierarchyMatrix
};
