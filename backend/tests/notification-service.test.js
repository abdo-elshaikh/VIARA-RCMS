jest.mock('../src/services/realtimeService', () => ({
    sendToUser: jest.fn(),
    sendToRole: jest.fn(),
    sendToPatient: jest.fn(),
    sendToDoctor: jest.fn(),
    broadcastToStaff: jest.fn()
}));

jest.mock('../src/utils/crypto', () => ({
    encrypt: jest.fn(value => `enc:${value}`),
    decrypt: jest.fn(value => String(value || '').replace(/^(enc:|v2:)/, ''))
}));

const realtimeService = require('../src/services/realtimeService');
const { notifyClients } = require('../src/services/notificationService');

const buildDb = (row) => ({
    query: jest.fn().mockResolvedValue({ rows: row ? [row] : [] })
});

describe('notification realtime routing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('routes in-app notifications to an explicit staff user before broad audiences', async () => {
        const row = {
            notification_id: 'n-1',
            channel: 'InApp',
            recipient_user_id: 'user-1',
            audience_role: 'Admin',
            recipient: 'v2:user-1',
            subject: 'v2:Subject',
            content: 'v2:Body'
        };

        await notifyClients(buildDb(row), 'n-1');

        expect(realtimeService.sendToUser).toHaveBeenCalledWith('user-1', 'NEW_NOTIFICATION', expect.objectContaining({
            recipient: 'user-1',
            subject: 'Subject',
            content: 'Body'
        }));
        expect(realtimeService.sendToRole).not.toHaveBeenCalled();
        expect(realtimeService.broadcastToStaff).not.toHaveBeenCalled();
    });

    test('routes in-app notifications by role, patient, and doctor audiences', async () => {
        await notifyClients(buildDb({
            notification_id: 'n-role',
            channel: 'InApp',
            audience_role: 'Marketing',
            recipient: 'v2:marketing',
            subject: 'v2:Campaign',
            content: 'v2:Open campaign'
        }), 'n-role');
        expect(realtimeService.sendToRole).toHaveBeenCalledWith('Marketing', 'NEW_NOTIFICATION', expect.objectContaining({ notification_id: 'n-role' }));

        await notifyClients(buildDb({
            notification_id: 'n-patient',
            channel: 'InApp',
            patient_id: 'patient-1',
            recipient: 'v2:patient',
            subject: 'v2:Portal',
            content: 'v2:Ready'
        }), 'n-patient');
        expect(realtimeService.sendToPatient).toHaveBeenCalledWith('patient-1', 'NEW_NOTIFICATION', expect.objectContaining({ notification_id: 'n-patient' }));

        await notifyClients(buildDb({
            notification_id: 'n-doctor',
            channel: 'InApp',
            referring_doctor_id: 'doctor-1',
            recipient: 'v2:doctor',
            subject: 'v2:Doctor',
            content: 'v2:Report'
        }), 'n-doctor');
        expect(realtimeService.sendToDoctor).toHaveBeenCalledWith('doctor-1', 'NEW_NOTIFICATION', expect.objectContaining({ notification_id: 'n-doctor' }));
    });

    test('broadcasts only non-sensitive metadata for external notification log updates', async () => {
        await notifyClients(buildDb({
            notification_id: 'n-sms',
            channel: 'SMS',
            recipient: 'v2:+201000000000',
            content: 'v2:Sent'
        }), 'n-sms');

        const [, payload] = realtimeService.broadcastToStaff.mock.calls[0];
        expect(realtimeService.broadcastToStaff).toHaveBeenCalledWith('NOTIFICATION_LOG_UPDATE', expect.objectContaining({
            notification_id: 'n-sms',
            channel: 'SMS'
        }));
        expect(payload).not.toHaveProperty('recipient');
        expect(payload).not.toHaveProperty('content');
    });
});
