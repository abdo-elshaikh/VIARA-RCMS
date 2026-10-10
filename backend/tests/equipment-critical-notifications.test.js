jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn(),
    triggerEventForRole: jest.fn()
}));

jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined)
}));

const { triggerEvent, triggerEventForRole } = require('../src/services/notificationJobService');
const { createMaintenance, updateMaintenance, createDowntime, updateDowntime } = require('../src/controllers/machineController');
const { updateReport, acknowledgeCriticalResult } = require('../src/controllers/examController');
const { acknowledgeCriticalResult: acknowledgeDoctorCriticalResult } = require('../src/controllers/doctorPortalController');

const MODALITY_ID = '00000000-0000-4000-8000-000000000001';
const MAINTENANCE_ID = '00000000-0000-4000-8000-000000000002';
const DOWNTIME_ID = '00000000-0000-4000-8000-000000000003';
const EXAM_ID = '00000000-0000-4000-8000-000000000004';

const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
});

describe('equipment notification workflows', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        triggerEventForRole.mockResolvedValue(undefined);
    });

    test('maintenance creation commits before notifying technicians and admins', async () => {
        const timeline = [];
        const createdAt = new Date('2026-08-28T20:00:00.000Z');
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
                    timeline.push(text);
                    return { rows: [] };
                }
                if (text.includes('INSERT INTO equipment_maintenance')) {
                    return { rows: [{
                        maintenance_id: MAINTENANCE_ID,
                        modality_id: MODALITY_ID,
                        modality_name: 'CT-01',
                        maintenance_type: 'Calibration',
                        scheduled_date: '2026-09-01',
                        completed_date: null,
                        performed_by: 'Vendor',
                        status: 'Scheduled',
                        created_at: createdAt
                    }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        triggerEventForRole.mockImplementation(async (_db, eventType, role) => {
            timeline.push(`notify:${eventType}:${role}`);
        });
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const res = makeResponse();
        const next = jest.fn();

        await createMaintenance(db)({
            body: {
                modalityId: MODALITY_ID,
                maintenanceType: 'Calibration',
                scheduledDate: '2026-09-01',
                performedBy: 'Vendor'
            }
        }, res, next);

        expect(timeline).toEqual([
            'BEGIN',
            'COMMIT',
            'notify:EquipmentMaintenanceCreated:Technician',
            'notify:EquipmentMaintenanceCreated:Admin'
        ]);
        expect(triggerEventForRole).toHaveBeenCalledTimes(2);
        expect(triggerEventForRole).toHaveBeenCalledWith(db, 'EquipmentMaintenanceCreated', 'Technician', expect.objectContaining({
            entityType: 'EquipmentMaintenance',
            entityId: MAINTENANCE_ID,
            occurrenceKey: createdAt.toISOString(),
            priority: 'Normal',
            variables: expect.objectContaining({ modality_name: 'CT-01', status: 'Scheduled' })
        }));
        expect(client.release).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(next).not.toHaveBeenCalled();
    });

    test('maintenance update emits the updated event to technicians and admins', async () => {
        const updatedAt = new Date('2026-08-28T20:30:00.000Z');
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT * FROM equipment_maintenance')) {
                    return { rows: [{
                        maintenance_id: MAINTENANCE_ID,
                        modality_id: MODALITY_ID,
                        maintenance_type: 'Calibration',
                        scheduled_date: '2026-09-01',
                        completed_date: null,
                        status: 'Scheduled'
                    }] };
                }
                if (text.includes('UPDATE equipment_maintenance')) {
                    return { rows: [{
                        maintenance_id: MAINTENANCE_ID,
                        modality_id: MODALITY_ID,
                        modality_name: 'CT-01',
                        maintenance_type: 'Calibration',
                        scheduled_date: '2026-09-01',
                        completed_date: null,
                        performed_by: 'Vendor',
                        status: 'In Progress',
                        updated_at: updatedAt
                    }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const next = jest.fn();

        await updateMaintenance(db)({
            params: { id: MAINTENANCE_ID },
            body: { status: 'In Progress' }
        }, makeResponse(), next);

        expect(triggerEventForRole.mock.calls.map(([, eventType, role]) => [eventType, role])).toEqual([
            ['EquipmentMaintenanceUpdated', 'Technician'],
            ['EquipmentMaintenanceUpdated', 'Admin']
        ]);
        expect(triggerEventForRole).toHaveBeenCalledWith(db, 'EquipmentMaintenanceUpdated', 'Technician', expect.objectContaining({
            entityId: MAINTENANCE_ID,
            occurrenceKey: updatedAt.toISOString(),
            priority: 'Action',
            variables: expect.objectContaining({ changed_fields: 'status' })
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('unplanned downtime creation emits a critical event to operational roles', async () => {
        const createdAt = new Date('2026-08-28T20:45:00.000Z');
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT downtime_id')) return { rows: [] };
                if (text.includes('INSERT INTO equipment_downtime')) {
                    return { rows: [{
                        downtime_id: DOWNTIME_ID,
                        modality_id: MODALITY_ID,
                        modality_name: 'MRI-01',
                        start_time: '2026-08-28T18:00:00.000Z',
                        end_time: '2026-08-28T20:00:00.000Z',
                        reason: 'Scanner fault',
                        status: 'Unplanned',
                        created_at: createdAt
                    }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const next = jest.fn();

        await createDowntime(db)({
            body: {
                modalityId: MODALITY_ID,
                startTime: '2026-08-28T18:00:00.000Z',
                endTime: '2026-08-28T20:00:00.000Z',
                reason: 'Scanner fault',
                status: 'Unplanned'
            },
            user: { user_id: '00000000-0000-4000-8000-000000000009' }
        }, makeResponse(), next);

        expect(triggerEventForRole.mock.calls.map(([, eventType, role]) => [eventType, role])).toEqual([
            ['EquipmentDowntimeCreated', 'Technician'],
            ['EquipmentDowntimeCreated', 'Receptionist'],
            ['EquipmentDowntimeCreated', 'Admin']
        ]);
        expect(triggerEventForRole).toHaveBeenCalledWith(db, 'EquipmentDowntimeCreated', 'Receptionist', expect.objectContaining({
            occurrenceKey: createdAt.toISOString(),
            priority: 'Critical'
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('non-resolved downtime update emits the updated event to operational roles', async () => {
        const updatedAt = new Date('2026-08-28T20:50:00.000Z');
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT * FROM equipment_downtime')) {
                    return { rows: [{
                        downtime_id: DOWNTIME_ID,
                        modality_id: MODALITY_ID,
                        start_time: '2026-08-28T18:00:00.000Z',
                        end_time: '2026-08-28T22:00:00.000Z',
                        reason: 'Scanner fault',
                        status: 'Planned'
                    }] };
                }
                if (text.includes('SELECT downtime_id')) return { rows: [] };
                if (text.includes('UPDATE equipment_downtime')) {
                    return { rows: [{
                        downtime_id: DOWNTIME_ID,
                        modality_id: MODALITY_ID,
                        modality_name: 'MRI-01',
                        start_time: '2026-08-28T18:00:00.000Z',
                        end_time: '2026-08-28T23:00:00.000Z',
                        reason: 'Scanner fault',
                        status: 'Planned',
                        updated_at: updatedAt
                    }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const next = jest.fn();

        await updateDowntime(db)({
            params: { id: DOWNTIME_ID },
            body: { endTime: '2026-08-28T23:00:00.000Z' }
        }, makeResponse(), next);

        expect(triggerEventForRole.mock.calls.map(([, eventType, role]) => [eventType, role])).toEqual([
            ['EquipmentDowntimeUpdated', 'Technician'],
            ['EquipmentDowntimeUpdated', 'Receptionist'],
            ['EquipmentDowntimeUpdated', 'Admin']
        ]);
        expect(triggerEventForRole).toHaveBeenCalledWith(db, 'EquipmentDowntimeUpdated', 'Admin', expect.objectContaining({
            occurrenceKey: updatedAt.toISOString(),
            priority: 'Warning',
            variables: expect.objectContaining({ changed_fields: 'endTime' })
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('resolved downtime uses the explicit resolved event for all operational roles', async () => {
        const updatedAt = new Date('2026-08-28T21:00:00.000Z');
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT * FROM equipment_downtime')) {
                    return { rows: [{
                        downtime_id: DOWNTIME_ID,
                        modality_id: MODALITY_ID,
                        start_time: '2026-08-28T18:00:00.000Z',
                        end_time: '2026-08-28T22:00:00.000Z',
                        reason: 'Scanner fault',
                        status: 'Unplanned'
                    }] };
                }
                if (text.includes('UPDATE equipment_downtime')) {
                    return { rows: [{
                        downtime_id: DOWNTIME_ID,
                        modality_id: MODALITY_ID,
                        modality_name: 'MRI-01',
                        start_time: '2026-08-28T18:00:00.000Z',
                        end_time: '2026-08-28T22:00:00.000Z',
                        reason: 'Scanner fault',
                        status: 'Resolved',
                        resolution_notes: 'Replaced failed component',
                        updated_at: updatedAt
                    }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const next = jest.fn();

        await updateDowntime(db)({
            params: { id: DOWNTIME_ID },
            body: { status: 'Resolved', resolutionNotes: 'Replaced failed component' }
        }, makeResponse(), next);

        expect(triggerEventForRole.mock.calls.map(([, eventType, role]) => [eventType, role])).toEqual([
            ['EquipmentDowntimeResolved', 'Technician'],
            ['EquipmentDowntimeResolved', 'Receptionist'],
            ['EquipmentDowntimeResolved', 'Admin']
        ]);
        for (const [, , , payload] of triggerEventForRole.mock.calls) {
            expect(payload).toEqual(expect.objectContaining({
                entityType: 'EquipmentDowntime',
                entityId: DOWNTIME_ID,
                occurrenceKey: updatedAt.toISOString(),
                priority: 'Normal'
            }));
        }
        expect(next).not.toHaveBeenCalled();
    });

    test('failed downtime creation rolls back without notifying any role', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT downtime_id')) return { rows: [] };
                if (text.includes('INSERT INTO equipment_downtime')) throw new Error('write failed');
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const next = jest.fn();

        await createDowntime(db)({
            body: {
                modalityId: MODALITY_ID,
                startTime: '2026-08-28T18:00:00.000Z',
                endTime: '2026-08-28T20:00:00.000Z',
                reason: 'Scanner fault',
                status: 'Unplanned'
            },
            user: { user_id: '00000000-0000-4000-8000-000000000009' }
        }, makeResponse(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(triggerEventForRole).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'write failed' }));
    });
});

describe('critical result acknowledgement', () => {
    test('acknowledges only the critical-result task assigned to the current staff user', async () => {
        const acknowledgement = {
            acknowledgement_id: '00000000-0000-4000-8000-000000000005',
            exam_id: EXAM_ID,
            recipient_role: 'Radiologist',
            status: 'Acknowledged',
            acknowledged_at: new Date('2026-08-28T22:00:00.000Z'),
            notes: 'Referrer contacted'
        };
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [acknowledgement] })
        };
        const req = {
            params: { id: EXAM_ID },
            body: { notes: 'Referrer contacted' },
            user: { user_id: '00000000-0000-4000-8000-000000000009', role: 'Radiologist' },
            ip: '127.0.0.1'
        };
        const res = makeResponse();
        const next = jest.fn();

        await acknowledgeCriticalResult(db)(req, res, next);

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('cra.recipient_user_id = $2'), [
            EXAM_ID,
            req.user.user_id,
            'Referrer contacted'
        ]);
        expect(res.json).toHaveBeenCalledWith({ success: true, acknowledgement });
        expect(next).not.toHaveBeenCalled();
    });

    test('does not allow a user to acknowledge an unassigned critical result', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const next = jest.fn();

        await acknowledgeCriticalResult(db)({
            params: { id: EXAM_ID },
            body: {},
            user: { user_id: '00000000-0000-4000-8000-000000000009' }
        }, makeResponse(), next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 404,
            message: 'Critical-result acknowledgement is not assigned to this user'
        }));
    });

    test('allows only the assigned referring doctor to acknowledge a critical result', async () => {
        const db = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [{
                acknowledgement_id: 'ack-doctor',
                exam_id: EXAM_ID,
                recipient_role: 'Doctor',
                status: 'Acknowledged',
                acknowledged_at: new Date('2026-08-28T22:05:00.000Z'),
                notes: 'Reviewed'
            }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] }) };
        const res = makeResponse();
        const next = jest.fn();

        await acknowledgeDoctorCriticalResult(db)({
            params: { id: EXAM_ID },
            body: { notes: 'Reviewed' },
            user: { doctorId: '00000000-0000-4000-8000-000000000010' },
            ip: '127.0.0.1'
        }, res, next);

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('cra.referring_doctor_id = $2'), [
            EXAM_ID,
            '00000000-0000-4000-8000-000000000010',
            'Reviewed'
        ]);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(next).not.toHaveBeenCalled();
    });
});

describe('critical result notification workflow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        triggerEvent.mockResolvedValue(undefined);
        triggerEventForRole.mockResolvedValue(undefined);
    });

    const makeFinalizationClient = ({ failUpdate = false, referringDoctorId = '00000000-0000-4000-8000-000000000006' } = {}) => {
        const timeline = [];
        const markedAt = new Date('2026-08-28T22:00:00.000Z');
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
                    timeline.push(text);
                    return { rows: [] };
                }
                if (text.includes('SELECT e.status') && text.includes('FROM examinations e')) {
                    return { rows: [{
                        status: 'Reporting',
                        appointment_id: '00000000-0000-4000-8000-000000000005',
                        report_locked: false,
                        report_sections: { findings: 'Confirmed finding', impression: 'Critical diagnosis' },
                        report_content: 'Existing report',
                        report_status: 'Approved',
                        critical_result: false,
                        order_number: 'ORD-CRITICAL-1',
                        referring_doctor_id: referringDoctorId
                    }] };
                }
                if (text.includes('UPDATE examinations')) {
                    if (failUpdate) throw new Error('finalization failed');
                    return { rows: [{
                        exam_id: EXAM_ID,
                        order_number: 'ORD-CRITICAL-1',
                        status: 'Finalized',
                        critical_result: true,
                        critical_result_marked_at: markedAt
                    }] };
                }
                if (text.includes('INSERT INTO critical_result_acknowledgements') && text.includes('referring_doctor_id')) {
                    return { rows: [{
                        acknowledgement_id: '00000000-0000-4000-8000-000000000008',
                        referring_doctor_id: referringDoctorId,
                        recipient_role: 'Doctor'
                    }] };
                }
                if (text.includes('INSERT INTO critical_result_acknowledgements') && text.includes('u.role = \'Nurse\'')) {
                    return { rows: [{
                        acknowledgement_id: '00000000-0000-4000-8000-000000000010',
                        recipient_user_id: '00000000-0000-4000-8000-000000000011',
                        recipient_role: 'Nurse'
                    }, {
                        acknowledgement_id: '00000000-0000-4000-8000-000000000012',
                        recipient_user_id: '00000000-0000-4000-8000-000000000013',
                        recipient_role: 'Nurse'
                    }] };
                }
                if (text.includes('SELECT COALESCE(MAX(version_number)')) return { rows: [{ version_number: 2 }] };
                if (text.includes('FROM ready')) return { rows: [] };
                return { rows: [] };
            }),
            release: jest.fn()
        };
        return { client, timeline, markedAt };
    };

    test('critical finalization creates acknowledgements atomically and notifies after commit', async () => {
        const { client, timeline, markedAt } = makeFinalizationClient();
        triggerEvent.mockImplementation(async (_db, eventType, payload) => {
            if (eventType === 'CriticalResultFinalized') {
                timeline.push(`notify:${payload.doctorId ? 'Doctor' : payload.staffRole}`);
            }
        });
        const db = {
            connect: jest.fn().mockResolvedValue(client),
            query: jest.fn().mockResolvedValue({ rows: [] })
        };
        const res = makeResponse();
        const next = jest.fn();

        await updateReport(db)({
            body: {
                examId: EXAM_ID,
                status: 'Finalized',
                criticalResult: true,
                sections: { findings: 'Confirmed finding', impression: 'Critical diagnosis' }
            },
            user: { user_id: '00000000-0000-4000-8000-000000000007', role: 'Radiologist', name: 'Dr Test' },
            ip: '127.0.0.1'
        }, res, next);

        const statements = client.query.mock.calls.map(([sql]) => String(sql));
        expect(statements.filter(sql => sql.includes('INSERT INTO critical_result_acknowledgements'))).toHaveLength(1);
        expect(timeline.indexOf('COMMIT')).toBeLessThan(timeline.indexOf('notify:Radiologist'));
        expect(timeline.indexOf('COMMIT')).toBeLessThan(timeline.indexOf('notify:Doctor'));
        expect(triggerEvent).toHaveBeenCalledWith(db, 'CriticalResultFinalized', expect.objectContaining({
            staffRole: 'Radiologist',
            entityType: 'Exam',
            entityId: EXAM_ID,
            priority: 'Critical'
        }));
        expect(triggerEvent).toHaveBeenCalledWith(db, 'CriticalResultFinalized', expect.objectContaining({
            doctorId: '00000000-0000-4000-8000-000000000006',
            occurrenceKey: '00000000-0000-4000-8000-000000000008'
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ critical_result: true }));
        expect(next).not.toHaveBeenCalled();
    });

    test('failed critical finalization rolls back and emits no critical notification', async () => {
        const { client } = makeFinalizationClient({ failUpdate: true });
        const db = { connect: jest.fn().mockResolvedValue(client), query: jest.fn() };
        const next = jest.fn();

        await updateReport(db)({
            body: {
                examId: EXAM_ID,
                status: 'Finalized',
                criticalResult: true,
                sections: { findings: 'Confirmed finding', impression: 'Critical diagnosis' }
            },
            user: { user_id: '00000000-0000-4000-8000-000000000007', role: 'Radiologist' }
        }, makeResponse(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(triggerEventForRole).not.toHaveBeenCalled();
        expect(triggerEvent).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'finalization failed' }));
    });

    test('critical finalization without a referring doctor assigns acknowledgements to active nurses', async () => {
        const { client } = makeFinalizationClient({ referringDoctorId: null });
        triggerEvent.mockImplementation(async () => ({ scheduled: 1 }));
        const db = {
            connect: jest.fn().mockResolvedValue(client),
            query: jest.fn().mockResolvedValue({ rows: [] })
        };
        const next = jest.fn();

        await updateReport(db)({
            body: {
                examId: EXAM_ID,
                status: 'Finalized',
                criticalResult: true,
                sections: { findings: 'Confirmed finding', impression: 'Critical diagnosis' }
            },
            user: { user_id: '00000000-0000-4000-8000-000000000007', role: 'Radiologist' },
            ip: '127.0.0.1'
        }, makeResponse(), next);

        const nurseInsert = client.query.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO critical_result_acknowledgements') &&
            String(sql).includes("u.role = 'Nurse'")
        );
        expect(nurseInsert).toBeDefined();
        expect(nurseInsert[0]).toContain('u.is_active = TRUE');
        expect(triggerEvent).toHaveBeenCalledWith(db, 'CriticalResultFinalized', expect.objectContaining({
            staffId: '00000000-0000-4000-8000-000000000011',
            staffRole: 'Nurse',
            occurrenceKey: '00000000-0000-4000-8000-000000000010'
        }));
        expect(triggerEvent).toHaveBeenCalledWith(db, 'CriticalResultFinalized', expect.objectContaining({
            staffId: '00000000-0000-4000-8000-000000000013',
            staffRole: 'Nurse',
            occurrenceKey: '00000000-0000-4000-8000-000000000012'
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('critical marker cannot be inferred or set during a draft save', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT e.status')) return { rows: [{
                    status: 'Reporting',
                    appointment_id: '00000000-0000-4000-8000-000000000005',
                    report_locked: false,
                    report_sections: {},
                    report_content: null,
                    report_status: 'Draft',
                    critical_result: false
                }] };
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const next = jest.fn();

        await updateReport({ connect: jest.fn().mockResolvedValue(client) })({
            body: { examId: EXAM_ID, criticalResult: true, reportContent: 'Critical words in free text' },
            user: { user_id: '00000000-0000-4000-8000-000000000007', role: 'Radiologist' }
        }, makeResponse(), next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE examinations'))).toBe(false);
        expect(triggerEventForRole).not.toHaveBeenCalled();
    });
});
