jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn().mockResolvedValue(undefined),
    triggerEventForRole: jest.fn().mockResolvedValue(undefined),
    scheduleAppointmentReminder: jest.fn().mockResolvedValue(undefined),
    cancelPendingAppointmentReminders: jest.fn().mockResolvedValue(undefined),
    getAppointmentOccurrenceKey: jest.fn(() => '2030-06-20T09:00:00.000Z')
}));
jest.mock('../src/services/pacsMwlService', () => ({
    triggerMwlRegeneration: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../src/services/insuranceAuthorizationService', () => ({
    syncInvoicesAfterAppointmentReschedule: jest.fn().mockResolvedValue([])
}));

const { rescheduleAppointment } = require('../src/controllers/appointmentController');

const buildDb = (existingAppointment) => {
    const calls = [];
    const client = {
        query: jest.fn(async (sql, params = []) => {
            const text = String(sql);
            calls.push({ text, params });
            if (text.includes('SELECT * FROM appointments WHERE appointment_id')) {
                return { rows: existingAppointment ? [existingAppointment] : [] };
            }
            if (text.includes('FROM system_settings')) {
                return { rows: [] };
            }
            if (text.includes('SELECT working_hours FROM center_settings')) {
                return { rows: [{ working_hours: { start: 0, end: 24, holidays: [], workingDays: [0, 1, 2, 3, 4, 5, 6] } }] };
            }
            if (text.includes('FROM modalities m')) {
                return { rows: [{ modality_id: 'modality-1', name: 'MRI 1', status: 'Active', room_id: null, room_number: 'R1', room_name: null, room_status: null }] };
            }
            if (text.includes('FROM equipment_downtime')) return { rows: [] };
            if (text.includes('FROM equipment_maintenance')) return { rows: [] };
            if (text.includes('appointment_id != $1')) return { rows: [] };
            if (text.includes('UPDATE appointments') && text.includes('SET start_time')) {
                return {
                    rows: [{
                        ...existingAppointment,
                        status: existingAppointment.status === 'Completed' ? 'Completed' : 'Confirmed',
                        start_time: params[0],
                        end_time: params[1]
                    }]
                };
            }
            return { rows: [] };
        }),
        release: jest.fn()
    };
    return {
        calls,
        client,
        db: { query: jest.fn().mockResolvedValue({ rows: [] }), connect: jest.fn().mockResolvedValue(client) }
    };
};

const reqFor = (id) => ({
    params: { id },
    body: {
        startTime: '2030-06-20T09:00:00.000Z',
        endTime: '2030-06-20T09:45:00.000Z',
        reason: 'Patient requested a new slot'
    },
    user: { user_id: 'user-1' }
});

const respond = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });

describe('rescheduleAppointment status guard', () => {
    test('reschedules a Cancelled appointment and revives it to Confirmed', async () => {
        const existing = {
            appointment_id: 'appt-cancelled',
            status: 'Cancelled',
            modality_id: 'modality-1',
            patient_id: 'patient-1',
            order_number: 'ORD-1',
            start_time: '2030-06-10T10:00:00.000Z',
            end_time: '2030-06-10T10:45:00.000Z'
        };
        const { calls, db } = buildDb(existing);
        const res = respond();
        const next = jest.fn();

        await rescheduleAppointment(db)(reqFor('appt-cancelled'), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'Confirmed' }));

        const cancelMetadataClear = calls.find(({ text }) => text.includes('UPDATE appointments') && text.includes('cancellation_reason = NULL'));
        expect(cancelMetadataClear).toBeDefined();

        const queueRestore = calls.find(({ text }) => text.includes('UPDATE examinations') && text.includes("queue_stage = 'Scheduled'"));
        expect(queueRestore).toBeDefined();

        const reactivationHistory = calls.find(({ text, params }) => text.includes('INSERT INTO order_status_history') && params.includes('AppointmentReactivated'));
        expect(reactivationHistory).toBeDefined();

        expect(calls.some(({ text }) => text === 'COMMIT')).toBe(true);
    });

    test('reschedules a No-Show appointment to Confirmed', async () => {
        const existing = {
            appointment_id: 'appt-noshow',
            status: 'No-Show',
            modality_id: 'modality-1',
            patient_id: 'patient-1',
            order_number: 'ORD-2',
            start_time: '2030-06-10T10:00:00.000Z',
            end_time: '2030-06-10T10:45:00.000Z'
        };
        const { calls, db } = buildDb(existing);
        const res = respond();
        const next = jest.fn();

        await rescheduleAppointment(db)(reqFor('appt-noshow'), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'Confirmed' }));
        expect(calls.some(({ text }) => text.includes('cancellation_reason = NULL'))).toBe(false);
    });

    test('still blocks rescheduling a Completed appointment with 422', async () => {
        const existing = {
            appointment_id: 'appt-completed',
            status: 'Completed',
            modality_id: 'modality-1',
            patient_id: 'patient-1',
            order_number: 'ORD-3',
            start_time: '2030-06-10T10:00:00.000Z',
            end_time: '2030-06-10T10:45:00.000Z'
        };
        const { calls, db } = buildDb(existing);
        const res = respond();
        const next = jest.fn();

        await rescheduleAppointment(db)(reqFor('appt-completed'), res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 422,
            message: 'Cannot reschedule a Completed appointment.'
        }));
        expect(calls.some(({ text }) => text.includes('appointment_reschedule_history'))).toBe(false);
        expect(calls.some(({ text }) => text === 'ROLLBACK')).toBe(true);
    });
});
