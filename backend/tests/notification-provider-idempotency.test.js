const mockSendSMS = jest.fn().mockResolvedValue({
    success: true,
    deduped: false,
    providerMessageId: 'provider-message-1'
});

jest.mock('../src/services/integrationService', () => jest.fn().mockImplementation(() => ({ sendSMS: mockSendSMS })));
jest.mock('../src/services/realtimeService', () => ({
    broadcastToStaff: jest.fn(),
    sendToUser: jest.fn(),
    sendToRole: jest.fn(),
    sendToPatient: jest.fn(),
    sendToDoctor: jest.fn()
}));
jest.mock('../src/utils/crypto', () => ({
    encrypt: jest.fn(value => `enc:${value}`),
    decrypt: jest.fn(value => String(value || '').replace(/^enc:/, ''))
}));

const { sendSms } = require('../src/services/notificationService');

describe('notification provider idempotency', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSendSMS.mockResolvedValue({
            success: true,
            deduped: false,
            providerMessageId: 'provider-message-1'
        });
    });

    test('passes the deterministic notification job key to the SMS integration', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ notification_id: 'notification-1' }] })
                .mockResolvedValueOnce({ rows: [] })
        };

        const result = await sendSms('+201000000000', 'Reminder', db, {
            idempotencyKey: 'notification-job:job-1:SMS',
            eventType: 'AppointmentReminder',
            entityId: 'appointment-1',
            patientId: 'patient-1',
            audienceType: 'Patient'
        });

        expect(result).toEqual(expect.objectContaining({ success: true, notificationId: 'notification-1' }));
        expect(mockSendSMS).toHaveBeenCalledWith('+201000000000', 'Reminder', expect.objectContaining({
            idempotencyKey: 'notification-job:job-1:SMS'
        }));
    });
});
