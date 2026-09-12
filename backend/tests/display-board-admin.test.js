const {
    getDisplayConfig,
    updateDisplayConfig,
    createDisplayAnnouncement,
    updateDisplayAnnouncement,
    deleteDisplayAnnouncement
} = require('../src/controllers/displayBoardAdminController');

jest.mock('../src/services/settingsService', () => ({
    set: jest.fn(async (key, value) => { global.__settingsWrites[key] = value; })
}));
const settingsService = require('../src/services/settingsService');
jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn(async () => undefined)
}));
const { logAction } = require('../src/services/auditService');

const adminUser = { user_id: '00000000-0000-4000-8000-000000000601', role: 'Admin' };
const announcementId = '00000000-0000-4000-8000-000000000602';

const buildClient = () => {
    const client = {
        query: jest.fn(),
        release: jest.fn()
    };
    client.query.mockImplementation(async (sql, values) => {
        const text = String(sql);
        if (text.includes('INSERT INTO display_announcements')) {
            return {
                rows: [{
                    announcement_id: announcementId,
                    title: values[0],
                    message: values[1],
                    tone: values[2],
                    is_active: values[3],
                    display_order: values[4]
                }]
            };
        }
        if (text.includes('UPDATE display_announcements')) {
            return {
                rows: [{
                    announcement_id: announcementId,
                    title: 'Updated',
                    message: 'Updated message',
                    tone: 'info',
                    is_active: false,
                    display_order: 2
                }]
            };
        }
        if (text.includes('FOR UPDATE')) {
            return { rows: [{ announcement_id: announcementId, title: 'Peak hours' }] };
        }
        if (text.includes('DELETE FROM display_announcements')) {
            return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${text}`);
    });
    return client;
};

describe('display board admin controller', () => {
    beforeEach(() => {
        global.__settingsWrites = {};
        jest.clearAllMocks();
    });

    test('returns merged config defaults with full announcement list', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('display.patient_display_mode')) return { rows: [{ setting_value: 'order_only' }] };
                if (text.includes('display.show_ticker')) return { rows: [{ setting_value: 'false' }] };
                if (text.includes('display.board_title')) return { rows: [] };
                if (text.includes('FROM display_announcements')) {
                    return {
                        rows: [{
                            announcement_id: announcementId,
                            title: 'Ø£ÙˆÙ‚Ø§Øª Ø§Ù„Ø°Ø±ÙˆØ©',
                            message: 'Ù‚Ø¯ ÙŠØ²ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±',
                            tone: 'warning',
                            is_active: true,
                            display_order: 1,
                            created_at: new Date('2026-09-03T10:00:00Z'),
                            updated_at: new Date('2026-09-03T10:00:00Z')
                        }]
                    };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };
        const res = { json: jest.fn() };

        await getDisplayConfig(db)({}, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload.config).toEqual({
            patientDisplayMode: 'order_only',
            showTicker: false,
            boardTitle: null
        });
        expect(payload.announcements).toHaveLength(1);
        expect(payload.announcements[0]).toMatchObject({
            id: announcementId,
            title: 'Ø£ÙˆÙ‚Ø§Øª Ø§Ù„Ø°Ø±ÙˆØ©',
            tone: 'warning',
            isActive: true,
            displayOrder: 1
        });
    });

    test('persists each config field and audits the change', async () => {
        const db = { query: jest.fn() };
        const res = { json: jest.fn() };

        await updateDisplayConfig(db)(
            { user: adminUser, ip: '127.0.0.1', body: { patientDisplayMode: 'name', showTicker: true, boardTitle: 'Ø¬Ù†Ø§Ø­ Ø§Ù„Ø£Ø´Ø¹Ø©' } },
            res,
            jest.fn()
        );

        expect(settingsService.set).toHaveBeenCalledWith('display.patient_display_mode', 'name');
        expect(settingsService.set).toHaveBeenCalledWith('display.show_ticker', 'true');
        expect(settingsService.set).toHaveBeenCalledWith('display.board_title', 'Ø¬Ù†Ø§Ø­ Ø§Ù„Ø£Ø´Ø¹Ø©');
        expect(logAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            action: 'DISPLAY_BOARD_CONFIG_UPDATED'
        }));
        expect(res.json.mock.calls[0][0].config).toEqual({
            patientDisplayMode: 'name',
            showTicker: true,
            boardTitle: 'Ø¬Ù†Ø§Ø­ Ø§Ù„Ø£Ø´Ø¹Ø©'
        });
    });

    test('rejects invalid patient display modes', async () => {
        const res = { json: jest.fn() };
        const next = jest.fn();

        await updateDisplayConfig({ query: jest.fn() })(
            { user: adminUser, body: { patientDisplayMode: 'everything' } },
            res,
            next
        );

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(settingsService.set).not.toHaveBeenCalled();
    });

    test('creates an announcement and audits it', async () => {
        const client = buildClient();
        const db = { connect: jest.fn(async () => client) };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await createDisplayAnnouncement(db)(
            { user: adminUser, ip: '127.0.0.1', body: { title: 'Welcome', message: 'Welcome to the center', tone: 'info' } },
            res,
            jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0]).toMatchObject({ announcement_id: announcementId, title: 'Welcome', tone: 'info' });
        expect(logAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'DISPLAY_ANNOUNCEMENT_CREATED' }));
        expect(client.release).toHaveBeenCalled();
    });

    test('updates announcement fields dynamically', async () => {
        const client = buildClient();
        const db = { connect: jest.fn(async () => client) };
        const res = { json: jest.fn() };

        await updateDisplayAnnouncement(db)(
            { user: adminUser, ip: '127.0.0.1', params: { id: announcementId }, body: { isActive: false, displayOrder: 2 } },
            res,
            jest.fn()
        );

        expect(res.json.mock.calls[0][0]).toMatchObject({ is_active: false, display_order: 2 });
        expect(logAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'DISPLAY_ANNOUNCEMENT_UPDATED' }));
    });

    test('returns 404 when updating a missing announcement', async () => {
        const client = buildClient();
        client.query.mockImplementation(async (sql) => {
            if (String(sql).includes('FOR UPDATE')) return { rows: [] };
            throw new Error(`Unexpected SQL: ${sql}`);
        });
        const db = { connect: jest.fn(async () => client) };
        const next = jest.fn();

        await updateDisplayAnnouncement(db)(
            { user: adminUser, params: { id: announcementId }, body: { isActive: false } },
            { json: jest.fn() },
            next
        );

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
        expect(client.release).toHaveBeenCalled();
    });

    test('deletes an announcement permanently', async () => {
        const client = buildClient();
        const db = { connect: jest.fn(async () => client) };
        const res = { status: jest.fn().mockReturnThis(), end: jest.fn() };

        await deleteDisplayAnnouncement(db)(
            { user: adminUser, ip: '127.0.0.1', params: { id: announcementId } },
            res,
            jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(204);
        expect(logAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'DISPLAY_ANNOUNCEMENT_DELETED' }));
    });

    test('rejects malformed announcement ids', async () => {
        const next = jest.fn();
        await deleteDisplayAnnouncement({ connect: jest.fn() })(
            { user: adminUser, params: { id: 'not-a-uuid' } },
            { status: jest.fn() },
            next
        );
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
});
