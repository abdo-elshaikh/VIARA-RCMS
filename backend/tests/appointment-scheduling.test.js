const { createAppointmentSchema } = require('../src/schemas/appointmentSchema');
const { VALID_WAITING_LIST_STATUSES } = require('../src/utils/queryValidator');

describe('appointment schema validation', () => {
    test('waiting-list booking accepts a waitlist reference', () => {
        const result = createAppointmentSchema.safeParse({
            patientId: '00000000-0000-4000-8000-000000000301',
            modalityId: '00000000-0000-4000-8000-000000000101',
            startTime: '2030-01-15T10:00:00Z',
            endTime: '2030-01-15T11:00:00Z',
            waitlistId: '00000000-0000-4000-8000-000000000601'
        });
        expect(result.success).toBe(true);
    });

    test('createAppointmentSchema rejects invalid UUID format', () => {
        const result = createAppointmentSchema.safeParse({
            patientId: 'not-a-uuid',
            modalityId: '00000000-0000-4000-8000-000000000101',
            startTime: '2030-01-15T10:00:00Z',
            endTime: '2030-01-15T11:00:00Z'
        });
        expect(result.success).toBe(false);
        expect(result.error.issues.some(i => i.path.includes('patientId'))).toBe(true);
    });

    test('createAppointmentSchema rejects end time before start time', () => {
        const result = createAppointmentSchema.safeParse({
            patientId: '00000000-0000-4000-8000-000000000301',
            modalityId: '00000000-0000-4000-8000-000000000101',
            startTime: '2030-01-15T11:00:00Z',
            endTime: '2030-01-15T10:00:00Z'
        });
        expect(result.success).toBe(false);
        expect(result.error.issues.some(i => i.message.includes('after'))).toBe(true);
    });

    test('follow-up appointments require priorExamId', () => {
        const result = createAppointmentSchema.safeParse({
            patientId: '00000000-0000-4000-8000-000000000301',
            modalityId: '00000000-0000-4000-8000-000000000101',
            startTime: '2030-01-15T10:00:00Z',
            endTime: '2030-01-15T11:00:00Z',
            isFollowUp: true
        });
        expect(result.success).toBe(false);
        expect(result.error.issues.some(i => i.path.includes('priorExamId'))).toBe(true);
    });

    test('follow-up appointments with priorExamId pass validation', () => {
        const result = createAppointmentSchema.safeParse({
            patientId: '00000000-0000-4000-8000-000000000301',
            modalityId: '00000000-0000-4000-8000-000000000101',
            startTime: '2030-01-15T10:00:00Z',
            endTime: '2030-01-15T11:00:00Z',
            isFollowUp: true,
            priorExamId: '00000000-0000-4000-8000-000000000501'
        });
        expect(result.success).toBe(true);
    });
});

test('waiting-list query statuses include contacted and offered entries', () => {
    expect(VALID_WAITING_LIST_STATUSES).toEqual(['Waiting', 'Contacted', 'Offered', 'Scheduled', 'Declined', 'Expired', 'Cancelled']);
});

describe('marketing conversion tracking', () => {
    test('marks active campaign recipients as converted when a patient books an appointment', async () => {
        const { markPatientCampaignConversion } = require('../src/services/notificationJobService');
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ campaign_id: 'campaign-1', patient_id: 'patient-1', channel: 'Email' }] })
        };

        await markPatientCampaignConversion(db, 'patient-1');

        expect(db.query).toHaveBeenCalledTimes(1);
        const sql = db.query.mock.calls[0][0];
        expect(sql).toContain("status = 'Converted'");
        expect(sql).toContain('converted_at = NOW()');
        expect(db.query.mock.calls[0][1]).toEqual(['patient-1']);
    });
});

describe('patient conflict detection in appointment scheduling', () => {
    test('createAppointment includes patient_id conflict check with FOR UPDATE', async () => {
        const { createAppointment } = require('../src/controllers/appointmentController');

        const mockClient = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN') return { rows: [] };
                if (text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT working_hours')) return { rows: [{ working_hours: { start: 6, end: 22, holidays: [] } }] };
                if (text.includes('FROM modalities')) return { rows: [{ modality_id: 'modality-1', status: 'Active', room_status: 'Active' }] };
                if (text.includes('FROM equipment_downtime')) return { rows: [] };
                if (text.includes('FROM equipment_maintenance')) return { rows: [] };
                if (text.includes('FROM examination_types WHERE type_id')) return { rows: [{ body_part: 'Brain', contrast_required: false, modality_id: '00000000-0000-4000-8000-000000000101', is_active: true, duration_minutes: 30 }] };
                if (text.includes('FROM appointments') && text.includes('modality_id = $1')) return { rows: [] };
                if (text.includes('FROM appointments') && text.includes('patient_id = $1')) return { rows: [] };
                if (text.includes('INSERT INTO appointments')) return { rows: [{ appointment_id: 'appt-1' }] };
                if (text.includes('INSERT INTO examinations')) return { rows: [{ exam_id: 'exam-1' }] };
                if (text.includes('INSERT INTO order_status_history')) return { rows: [] };
                if (text.includes('UPDATE appointments')) return { rows: [] };
                if (text.includes('INSERT INTO appointment_idempotency_keys')) return { rows: [] };
                return { rows: [] };
            }),
            release: jest.fn()
        };

        const db = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text.includes('ALTER TABLE')) return { rows: [] };
                if (text.includes('SELECT working_hours')) return { rows: [{ working_hours: { start: 6, end: 22, holidays: [] } }] };
                return { rows: [] };
            }),
            connect: jest.fn().mockResolvedValue(mockClient)
        };

        const next = jest.fn();
        await createAppointment(db)({
            body: {
                patientId: '00000000-0000-4000-8000-000000000301',
                modalityId: '00000000-0000-4000-8000-000000000101',
                startTime: '2030-06-15T10:00:00Z',
                endTime: '2030-06-15T11:00:00Z',
                examTypeId: '00000000-0000-4000-8000-000000000201'
            },
            user: { user_id: 'user-1' },
            get: jest.fn(),
            originalUrl: '/api/appointments'
        }, { cookie: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }, next);

        const allQueries = mockClient.query.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : '');
        const patientConflictQuery = allQueries.find(q => q.includes('patient_id = $1'));

        expect(patientConflictQuery).toBeDefined();
        expect(patientConflictQuery).toContain('FOR UPDATE');
        expect(patientConflictQuery).toContain('FROM appointments');
        expect(next).not.toHaveBeenCalled();
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('patient conflict triggers 409 conflict error', async () => {
        const { createAppointment } = require('../src/controllers/appointmentController');

        const mockClient = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text.includes('BEGIN')) return { rows: [] };
                if (text.includes('SELECT working_hours')) return { rows: [{ working_hours: { start: 6, end: 22, holidays: [] } }] };
                if (text.includes('FROM modalities')) return { rows: [{ modality_id: 'modality-1', status: 'Active', room_status: 'Active' }] };
                if (text.includes('FROM equipment_downtime')) return { rows: [] };
                if (text.includes('FROM equipment_maintenance')) return { rows: [] };
                if (text.includes('FROM examination_types WHERE type_id')) return { rows: [{ body_part: 'Brain', contrast_required: false, modality_id: 'modality-1', duration_minutes: 30 }] };
                if (text.includes('FROM appointments') && text.includes('modality_id = $1')) return { rows: [] };
                if (text.includes('FROM appointments') && text.includes('patient_id = $1')) return { rows: [{ appointment_id: 'conflict-1' }] };
                if (text.includes('ROLLBACK')) return { rows: [] };
                return { rows: [] };
            }),
            release: jest.fn()
        };

        const db = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text.includes('ALTER TABLE')) return { rows: [] };
                if (text.includes('SELECT working_hours')) return { rows: [{ working_hours: { start: 6, end: 22, holidays: [] } }] };
                return { rows: [] };
            }),
            connect: jest.fn().mockResolvedValue(mockClient)
        };

        const next = jest.fn();

        await createAppointment(db)({
            body: {
                patientId: '00000000-0000-4000-8000-000000000301',
                modalityId: '00000000-0000-4000-8000-000000000101',
                startTime: '2030-06-15T10:00:00Z',
                endTime: '2030-06-15T11:00:00Z',
                examTypeId: '00000000-0000-4000-8000-000000000201'
            },
            user: { user_id: 'user-1' },
            get: jest.fn(),
            originalUrl: '/api/appointments'
        }, { cookie: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringMatching(/patient.*already has an appointment/i),
            statusCode: 409
        }));
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('idempotency key cannot be reused for a different appointment payload', async () => {
        const crypto = require('crypto');
        const { createAppointment } = require('../src/controllers/appointmentController');
        const body = { patientId: 'patient-2' };
        const key = '11111111-1111-4111-8111-111111111111';
        const mockClient = {
            query: jest.fn().mockImplementation(async (sql) => {
                if (String(sql).includes('SELECT resource_id AS appointment_id')) {
                    return {
                        rows: [{
                            appointment_id: 'appointment-1',
                            request_fingerprint: crypto.createHash('sha256').update(JSON.stringify({ patientId: 'patient-1' })).digest('hex')
                        }]
                    };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            connect: jest.fn().mockResolvedValue(mockClient)
        };
        const next = jest.fn();

        await createAppointment(db)({
            body,
            user: { user_id: 'user-1' },
            get: (header) => header === 'Idempotency-Key' ? key : undefined,
            originalUrl: '/api/appointments'
        }, { status: jest.fn().mockReturnThis(), json: jest.fn() }, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringMatching(/different appointment request/i),
            statusCode: 409
        }));
        expect(db.query).not.toHaveBeenCalled();
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
});
