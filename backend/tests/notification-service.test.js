jest.mock('../src/services/realtimeService', () => ({
    sendToUser: jest.fn(),
    sendToRole: jest.fn(),
    sendToPatient: jest.fn(),
    sendToDoctor: jest.fn(),
    broadcastToStaff: jest.fn(),
    broadcastToStaffMatching: jest.fn()
}));

jest.mock('../src/utils/crypto', () => ({
    encrypt: jest.fn(value => `enc:${value}`),
    decrypt: jest.fn(value => String(value || '').replace(/^(enc:|v2:)/, ''))
}));

const realtimeService = require('../src/services/realtimeService');
const {
    notifyClients,
    renderTemplate,
    sendInApp,
    computeActionUrl
} = require('../src/services/notificationService');

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

    test('routes legacy Global in-app notifications only to inbox-authorized roles', async () => {
        const notification = {
            notification_id: 'n-global',
            channel: 'InApp',
            audience_type: 'Global',
            recipient: 'v2:all-staff',
            subject: 'v2:System update',
            content: 'v2:Maintenance'
        };

        await notifyClients(buildDb(notification), 'n-global');

        expect(realtimeService.sendToRole).toHaveBeenNthCalledWith(
            1, 'Admin', 'NEW_NOTIFICATION', expect.objectContaining({ notification_id: 'n-global' })
        );
        expect(realtimeService.sendToRole).toHaveBeenNthCalledWith(
            2, 'Developer', 'NEW_NOTIFICATION', expect.objectContaining({ notification_id: 'n-global' })
        );
        expect(realtimeService.broadcastToStaff).not.toHaveBeenCalledWith('NEW_NOTIFICATION', expect.anything());
    });
});

describe('notification template rendering', () => {
    test('renders simple and dotted placeholders', () => {
        expect(renderTemplate('Hello {{ patient.name }} ({{order_number}})', {
            patient: { name: 'Mona' },
            order_number: 'ORD-1'
        })).toBe('Hello Mona (ORD-1)');
    });

    test('renders safe fallback values without evaluating expressions', () => {
        expect(renderTemplate('User: {{user_email || "Unknown"}}', {})).toBe('User: Unknown');
        expect(renderTemplate('User: {{user_email || "Unknown"}}', {
            user_email: 'user@example.test'
        })).toBe('User: user@example.test');
    });

    test('supports simple conditional sections', () => {
        const template = 'Updated.{{#if staff_notes}} Notes: {{staff_notes}}{{/if}}';
        expect(renderTemplate(template, { staff_notes: 'Call patient' })).toBe('Updated. Notes: Call patient');
        expect(renderTemplate(template, {})).toBe('Updated.');
    });

    test('removes unsupported template source instead of exposing it', () => {
        expect(renderTemplate('Alert {{ dangerous + expression }} complete', {}))
            .toBe('Alert  complete');
    });
});

describe('notification audience enforcement', () => {
    test('refuses to persist an in-app notification without an explicit audience', async () => {
        const db = { query: jest.fn() };

        await expect(sendInApp('unknown', 'Subject', 'Body', db, {
            eventType: 'TEST_EVENT'
        })).resolves.toEqual(expect.objectContaining({
            success: false,
            error: 'Persisted notifications require an explicit audience'
        }));
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects an external send before calling the provider when audience is absent', async () => {
        const db = { query: jest.fn() };
        const { sendEmail } = require('../src/services/notificationService');

        await expect(sendEmail('patient@example.test', 'Subject', 'Body', db, {
            eventType: 'TEST_EVENT'
        })).resolves.toEqual(expect.objectContaining({
            success: false,
            error: 'Persisted notifications require an explicit audience'
        }));
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('notification action routing', () => {
    test('uses patient portal routes for patient clinical and financial events', () => {
        expect(computeActionUrl({
            event_type: 'ReportReady',
            entity_id: 'exam 1',
            audience_type: 'Patient'
        })).toBe('/patient/dashboard?tab=records&examId=exam%201');
        expect(computeActionUrl({
            event_type: 'PaymentDue',
            audience_type: 'Patient'
        })).toBe('/patient/dashboard?tab=invoices');
    });

    test('uses doctor portal case routes for doctor clinical events', () => {
        expect(computeActionUrl({
            event_type: 'CRITICAL_RESULT',
            entity_id: 'exam-1',
            audience_type: 'Doctor'
        })).toBe('/doctor/dashboard?tab=cases&examId=exam-1');
    });

    test('keeps staff clinical actions in the authenticated staff application', () => {
        expect(computeActionUrl({
            event_type: 'ExamStatusChanged',
            entity_id: 'exam-1',
            audience_type: 'Staff'
        })).toBe('/worklist?examId=exam-1');
    });

    test('routes partial-payment decisions to the receiving clinical workspace', () => {
        expect(computeActionUrl({
            event_type: 'PartialPaymentException',
            audience_type: 'Staff',
            audience_role: 'Nurse'
        })).toBe('/nurse');
        expect(computeActionUrl({
            event_type: 'PartialPaymentException',
            audience_type: 'Staff',
            audience_role: 'Technician'
        })).toBe('/modality');
        expect(computeActionUrl({
            event_type: 'PartialPaymentException',
            audience_type: 'Staff',
            audience_role: 'Accountant'
        })).toBe('/approvals');
    });
});
