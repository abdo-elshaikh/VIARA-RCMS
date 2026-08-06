const { createAppointmentSchema } = require('../src/schemas/appointmentSchema');

describe('appointment schema validation', () => {
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

describe('patient conflict detection in appointment scheduling', () => {
    test('createAppointment includes patient_id conflict check with FOR UPDATE', async () => {
        const { createAppointment } = require('../src/controllers/appointmentController');

        const mockClient = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN') return { rows: [] };
                if (text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT working_hours')) return { rows: [{ working_hours: { start: 6, end: 22, holidays: [] } }] };
                if (text.includes('SELECT modality_id, status FROM modalities')) return { rows: [{ modality_id: 'modality-1', status: 'Active' }] };
                if (text.includes('FROM equipment_downtime')) return { rows: [] };
                if (text.includes('FROM examination_types WHERE type_id')) return { rows: [{ body_part: 'Brain', contrast_required: false, modality_id: 'modality-1', is_active: true }] };
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
        }, { cookie: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }, jest.fn());

        const allQueries = mockClient.query.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : '');
        const patientConflictQuery = allQueries.find(q => q.includes('patient_id = $1'));

        expect(patientConflictQuery).toBeDefined();
        expect(patientConflictQuery).toContain('FOR UPDATE');
        expect(patientConflictQuery).toContain('FROM appointments');
    });

    test('patient conflict triggers 409 conflict error', async () => {
        const { createAppointment } = require('../src/controllers/appointmentController');

        const mockClient = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text.includes('BEGIN')) return { rows: [] };
                if (text.includes('SELECT working_hours')) return { rows: [{ working_hours: { start: 6, end: 22, holidays: [] } }] };
                if (text.includes('SELECT modality_id, status FROM modalities')) return { rows: [{ modality_id: 'modality-1', status: 'Active' }] };
                if (text.includes('FROM equipment_downtime')) return { rows: [] };
                if (text.includes('FROM examination_types WHERE type_id')) return { rows: [{ body_part: 'Brain', contrast_required: false, modality_id: 'modality-1' }] };
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
});
