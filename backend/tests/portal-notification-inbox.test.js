jest.mock('../src/utils/crypto', () => ({ decrypt: jest.fn((value) => `decrypted:${value}`) }));

const {
    getMyNotifications: getPatientNotifications,
    getMyNotificationUnreadCount: getPatientUnreadCount,
    markMyNotificationRead: markPatientRead,
    markAllMyNotificationsRead: markAllPatientRead
} = require('../src/controllers/portalController');
const {
    getMyNotifications: getDoctorNotifications,
    getMyNotificationUnreadCount: getDoctorUnreadCount,
    markMyNotificationRead: markDoctorRead,
    markAllMyNotificationsRead: markAllDoctorRead
} = require('../src/controllers/doctorPortalController');

const buildRes = () => ({ json: jest.fn() });

const notificationRow = {
    notification_id: 'notification-1',
    channel: 'InApp',
    event_type: 'ReportReady',
    entity_id: 'exam-1',
    subject: 'v2:encrypted-subject',
    content: 'v2:encrypted-content',
    status: 'Sent',
    priority: 'Action',
    category: 'Clinical',
    is_read: false,
    read_at: null,
    created_at: '2026-08-28T12:00:00Z'
};

describe.each([
    {
        persona: 'patient',
        factory: getPatientNotifications,
        user: { userId: 'patient-1' },
        ownerSql: 'n.patient_id = $1',
        ownerCountSql: 'patient_id = $1',
        ownerReadSql: 'patient_id = $2',
        ownerId: 'patient-1',
        expectedAction: '/patient/dashboard?tab=records&entityId=exam-1',
        unreadFactory: getPatientUnreadCount,
        readFactory: markPatientRead,
        readAllFactory: markAllPatientRead
    },
    {
        persona: 'doctor',
        factory: getDoctorNotifications,
        user: { doctorId: 'doctor-1' },
        ownerSql: 'n.referring_doctor_id = $1',
        ownerCountSql: 'referring_doctor_id = $1',
        ownerReadSql: 'referring_doctor_id = $2',
        ownerId: 'doctor-1',
        expectedAction: '/doctor/dashboard?tab=reports&entityId=exam-1',
        unreadFactory: getDoctorUnreadCount,
        readFactory: markDoctorRead,
        readAllFactory: markAllDoctorRead
    }
])('$persona portal notification inbox', ({ factory, user, ownerSql, ownerCountSql, ownerReadSql, ownerId, expectedAction, unreadFactory, readFactory, readAllFactory }) => {
    test('returns an owned, paginated envelope with metadata and safe action', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [notificationRow] })
                .mockResolvedValueOnce({ rows: [{ total: 25, unread_count: 7 }] })
        };
        const res = buildRes();
        const next = jest.fn();

        await factory(db)({ user, query: { limit: '10', offset: '5' } }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.query.mock.calls[0][0]).toContain(ownerSql);
        expect(db.query.mock.calls[0][1]).toEqual([ownerId, 10, 5]);
        expect(db.query.mock.calls[1][0]).toContain(ownerCountSql);
        expect(db.query.mock.calls[1][1]).toEqual([ownerId]);
        expect(res.json).toHaveBeenCalledWith({
            items: [expect.objectContaining({
                notification_id: 'notification-1',
                subject: 'decrypted:v2:encrypted-subject',
                priority: 'Action',
                category: 'Clinical',
                action: expect.objectContaining({ url: expectedAction })
            })],
            unreadCount: 7,
            pagination: {
                limit: 10,
                offset: 5,
                total: 25,
                hasMore: true,
                nextOffset: 6
            }
        });
    });

    test('scopes unread and read mutations to the authenticated owner', async () => {
        const unreadDb = { query: jest.fn().mockResolvedValue({ rows: [{ unread_count: 3 }] }) };
        const readDb = {
            query: jest.fn().mockResolvedValue({
                rows: [{ notification_id: 'notification-1', is_read: true, read_at: '2026-08-28T12:00:00Z' }]
            })
        };
        const readAllDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = buildRes();

        await unreadFactory(unreadDb)({ user }, res, jest.fn());
        await readFactory(readDb)({ user, params: { id: 'notification-1' } }, res, jest.fn());
        await readAllFactory(readAllDb)({ user }, res, jest.fn());

        expect(unreadDb.query.mock.calls[0][0]).toContain(ownerCountSql);
        expect(unreadDb.query.mock.calls[0][1]).toEqual([ownerId]);
        expect(readDb.query.mock.calls[0][0]).toContain(ownerReadSql);
        expect(readDb.query.mock.calls[0][1]).toEqual(['notification-1', ownerId]);
        expect(readAllDb.query.mock.calls[0][0]).toContain(ownerCountSql);
        expect(readAllDb.query.mock.calls[0][1]).toEqual([ownerId]);
    });
});
