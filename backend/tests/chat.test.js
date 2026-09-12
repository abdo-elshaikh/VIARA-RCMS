process.env.JWT_SECRET = 'test-auth-secret-at-least-32-characters';

const fs = require('fs');
const path = require('path');

const queryText = (sql) => String(sql || '').replace(/\s+/g, ' ');

const mockDefaultQueryResponse = async (sql, params = []) => {
    const text = queryText(sql);

    if (text.includes('FROM role_permissions rp') && text.includes('p.name = $2')) {
        return params?.[0] === 'Patient' ? { rows: [] } : { rows: [{ '?column?': 1 }] };
    }

    if (text.includes('FROM users u') && text.includes('LEFT JOIN') && text.includes('staff_messages')) {
        return {
            rows: [
                { user_id: '2', full_name: 'Receptionist Jane', email: 'jane@VIARA.com', role: 'Receptionist', is_active: true }
            ]
        };
    }

    if (text.includes('INSERT INTO staff_messages')) {
        const attachments = params?.[5] ? JSON.parse(params[5]) : [];
        return {
            rows: [{
                message_id: '1',
                sender_id: '1',
                recipient_id: params?.[1] || '2',
                channel_name: params?.[2] || null,
                body: params?.[3] || '',
                message_kind: params?.[4] || 'text',
                attachments,
                created_at: new Date()
            }]
        };
    }

    if (text.includes('SELECT full_name AS sender_name')) {
        return { rows: [{ sender_name: 'System Admin', sender_role: 'Admin' }] };
    }

    if (text.includes('FROM patient_portal_messages ppm') && text.includes('WHERE ppm.patient_id = $1')) {
        return {
            rows: [
                { message_id: '1', patient_id: '00000000-0000-4000-8000-000000000301', sender_role: 'Patient', body: 'Help please' }
            ]
        };
    }

    if (text.includes('SELECT * FROM chat_channels WHERE channel_id = $1')) {
        return {
            rows: [{
                channel_id: params?.[0] || 'ultrasound-hub',
                name: params?.[0] || 'ultrasound-hub',
                display_name: 'Ultrasound Desk',
                description: 'Ultrasound coordination',
                icon_color: 'from-teal-500 to-cyan-600',
                created_by: '00000000-0000-4000-8000-000000000001',
                created_at: new Date(),
                is_system: false,
                is_private: true,
                post_permission: 'admins_only',
                allowed_roles: ['Admin', 'Radiologist']
            }]
        };
    }

    if (text.includes('SELECT channel_role FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2')) {
        return {
            rows: [{ channel_role: 'owner' }]
        };
    }

    if (text.includes('FROM chat_channels') && text.includes('LEFT JOIN chat_channel_members')) {
        return {
            rows: [
                {
                    channel_id: 'mri-team',
                    name: 'mri-team',
                    display_name: 'MRI Coordination',
                    description: 'MRI team room',
                    icon_color: 'from-teal-500 to-cyan-600',
                    is_system: false,
                    is_private: true,
                    post_permission: 'admins_only',
                    allowed_roles: ['Admin', 'Radiologist'],
                    member_count: 3,
                    is_member: true,
                    my_channel_role: 'owner'
                }
            ]
        };
    }

    if (text.includes('INSERT INTO chat_channels')) {
        return {
            rows: [{
                channel_id: params?.[0] || 'custom-room',
                name: params?.[1] || 'custom-room',
                display_name: params?.[2] || 'Custom Room',
                description: params?.[3] || '',
                icon_color: params?.[4] || 'from-teal-500 to-cyan-600',
                created_by: params?.[5] || '00000000-0000-4000-8000-000000000001',
                created_at: new Date(),
                is_system: false,
                is_private: params?.[6] || false,
                post_permission: params?.[7] || 'all_members',
                allowed_roles: params?.[8] || []
            }]
        };
    }

    if (text.includes('UPDATE chat_channels SET') || text.includes('UPDATE chat_channels')) {
        return {
            rows: [{
                channel_id: params?.[6] || 'ultrasound-hub',
                name: 'ultrasound-hub',
                display_name: params?.[0] || 'Ultrasound Center Desk',
                description: params?.[1] || 'Updated Desc',
                icon_color: params?.[2] || 'from-teal-500 to-cyan-600',
                is_system: false,
                is_private: params?.[3] || false,
                post_permission: params?.[4] || 'all_members',
                allowed_roles: params?.[5] || []
            }]
        };
    }

    if (text.includes('DELETE FROM chat_channels WHERE channel_id = $1')) {
        return {
            rows: [{ channel_id: params?.[0] || 'ultrasound-hub', is_system: false }],
            rowCount: 1
        };
    }

    if (text.includes('FROM chat_channel_members cm') && text.includes('JOIN users u')) {
        return {
            rows: [
                {
                    id: 1,
                    channel_id: params?.[0] || 'ultrasound-hub',
                    user_id: '00000000-0000-4000-8000-000000000001',
                    full_name: 'System Admin',
                    role: 'Admin',
                    channel_role: 'owner',
                    added_at: new Date()
                }
            ]
        };
    }

    if (text.includes('INSERT INTO chat_channel_members')) {
        return {
            rows: [{
                id: 2,
                channel_id: params?.[0] || 'ultrasound-hub',
                user_id: params?.[1] || '00000000-0000-4000-8000-000000000002',
                channel_role: params?.[2] || 'member',
                added_at: new Date()
            }]
        };
    }

    if (text.includes('UPDATE chat_channel_members SET channel_role = $1')) {
        return {
            rows: [{
                channel_id: params?.[1] || 'ultrasound-hub',
                user_id: params?.[2] || '00000000-0000-4000-8000-000000000002',
                channel_role: params?.[0] || 'admin'
            }]
        };
    }

    if (text.includes('DELETE FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2')) {
        return {
            rows: [{ channel_id: params?.[0], user_id: params?.[1], channel_role: 'member' }],
            rowCount: 1
        };
    }

    return { rows: [], rowCount: 1 };
};

const mockPool = {
    connect: jest.fn().mockImplementation((callback) => {
        if (typeof callback === 'function') {
            callback(null, { query: jest.fn(), release: jest.fn() }, jest.fn());
            return undefined;
        }
        return Promise.resolve({ query: jest.fn(), release: jest.fn() });
    }),
    query: jest.fn(mockDefaultQueryResponse),
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0
};

jest.mock('pg', () => ({
    Pool: jest.fn(() => mockPool)
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');

const TEST_SECRET = process.env.JWT_SECRET;

describe('Chat API Endpoints', () => {
    let adminToken;
    let patientToken;
    let receptionistToken;
    let csrfToken = '';
    let cookies = {};

    beforeAll(async () => {
        adminToken = jwt.sign(
            { user_id: '00000000-0000-4000-8000-000000000001', role: 'Admin' },
            TEST_SECRET,
            { expiresIn: '1h' }
        );
        patientToken = jwt.sign(
            { userId: '00000000-0000-4000-8000-000000000301', role: 'Patient' },
            TEST_SECRET,
            { expiresIn: '1h' }
        );
        receptionistToken = jwt.sign(
            { user_id: '00000000-0000-4000-8000-000000000002', role: 'Receptionist' },
            TEST_SECRET,
            { expiresIn: '1h' }
        );

        const csrfRes = await request(app).get('/api/csrf-token');
        const setCookie = csrfRes.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
            const match = setCookie[0].match(/csrf_token=([^;]+)/);
            if (match) {
                csrfToken = match[1];
            }
        }
    });

    beforeEach(() => {
        mockPool.query.mockImplementation(mockDefaultQueryResponse);
    });

    afterEach(() => {
        mockPool.query.mockClear();
    });

    test('GET /api/chat/users - returns list of chat users', async () => {
        const res = await request(app)
            .get('/api/chat/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].full_name).toBe('Receptionist Jane');
    });

    test('GET /api/chat/messages - validation error if neither recipientId nor channelName is provided', async () => {
        const res = await request(app)
            .get('/api/chat/messages')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('recipientId or channelName is required');
    });

    test('staff chat routes reject portal identities without MANAGE_CHAT', async () => {
        const res = await request(app)
            .get('/api/chat/users')
            .set('Authorization', `Bearer ${patientToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`);

        expect(res.status).toBe(403);
    });

    test('GET /api/chat/messages - rejects inaccessible private channel history', async () => {
        mockPool.query.mockImplementation(async (sql, params) => {
            const text = queryText(sql);
            if (text.includes('SELECT channel_role FROM chat_channel_members')) return { rows: [] };
            return mockDefaultQueryResponse(sql, params);
        });

        const res = await request(app)
            .get('/api/chat/messages?channelName=ultrasound-hub')
            .set('Authorization', `Bearer ${receptionistToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('You do not have access to this channel');
    });

    test('POST /api/chat/messages - rejects ambiguous direct and channel recipients', async () => {
        const res = await request(app)
            .post('/api/chat/messages')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .send({ recipientId: '2', channelName: 'general', body: 'Ambiguous' });

        expect(res.status).toBe(400);
    });

    test('POST /api/chat/messages - sends staff message successfully', async () => {
        const res = await request(app)
            .post('/api/chat/messages')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .send({ recipientId: '2', body: 'Hello' });

        expect(res.status).toBe(201);
        expect(res.body.body).toBe('Hello');
        expect(res.body.sender_name).toBe('System Admin');
    });

    test('POST /api/chat/messages - sends sticker messages', async () => {
        const res = await request(app)
            .post('/api/chat/messages')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .send({ recipientId: '2', body: '✅', messageKind: 'sticker' });

        expect(res.status).toBe(201);
        expect(res.body.body).toBe('✅');
        expect(res.body.message_kind).toBe('sticker');
    });

    test('POST /api/chat/messages - sends file attachments', async () => {
        const res = await request(app)
            .post('/api/chat/messages')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .field('recipientId', '2')
            .field('body', 'See attached')
            .attach('attachments', Buffer.from('hello from chat'), {
                filename: 'note.txt',
                contentType: 'text/plain'
            });

        expect(res.status).toBe(201);
        expect(res.body.body).toBe('See attached');
        expect(res.body.message_kind).toBe('attachment');
        expect(res.body.attachments[0]).toEqual(expect.objectContaining({
            kind: 'file',
            originalName: 'note.txt',
            mimeType: 'text/plain'
        }));

        const uploadedPath = path.resolve(__dirname, '../uploads/chat', res.body.attachments[0].storedName);
        if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    });

    test('GET /api/portal/messages - returns patient messages history', async () => {
        const res = await request(app)
            .get('/api/portal/messages')
            .set('Authorization', `Bearer ${patientToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`);

        expect(res.status).toBe(200);
        expect(res.body[0].body).toBe('Help please');
    });

    test('GET /api/chat/channels - lists accessible channels with calculated permissions', async () => {
        const res = await request(app)
            .get('/api/chat/channels')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].name).toBe('mri-team');
        expect(res.body[0].can_edit).toBe(true);
        expect(res.body[0].can_manage_members).toBe(true);
    });

    test('POST /api/chat/channels - creates custom channel with privacy and permissions', async () => {
        const res = await request(app)
            .post('/api/chat/channels')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .send({
                name: 'ultrasound-hub',
                displayName: 'Ultrasound Desk',
                description: 'Ultrasound coordination',
                isPrivate: true,
                postPermission: 'admins_only',
                allowedRoles: ['Admin', 'Radiologist']
            });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('ultrasound-hub');
    });

    test('PUT /api/chat/channels/:channelId - updates channel settings', async () => {
        const res = await request(app)
            .put('/api/chat/channels/ultrasound-hub')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .send({
                displayName: 'Ultrasound Center Desk',
                description: 'Updated description',
                isPrivate: false,
                postPermission: 'all_members'
            });

        expect(res.status).toBe(200);
        expect(res.body.display_name).toBe('Ultrasound Center Desk');
    });

    test('GET /api/chat/channels/:channelId/members - lists channel members', async () => {
        const res = await request(app)
            .get('/api/chat/channels/ultrasound-hub/members')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].full_name).toBe('System Admin');
    });

    test('POST /api/chat/channels/:channelId/members - adds member to channel', async () => {
        const res = await request(app)
            .post('/api/chat/channels/ultrasound-hub/members')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .send({
                userIds: ['00000000-0000-4000-8000-000000000002'],
                channelRole: 'member'
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe('Members added successfully');
    });

    test('channel admins cannot create another channel admin through member addition', async () => {
        mockPool.query.mockImplementation(async (sql, params) => {
            const text = queryText(sql);
            if (text.includes('SELECT channel_role FROM chat_channel_members')) {
                return { rows: [{ channel_role: 'admin' }] };
            }
            return mockDefaultQueryResponse(sql, params);
        });

        const res = await request(app)
            .post('/api/chat/channels/ultrasound-hub/members')
            .set('Authorization', `Bearer ${receptionistToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .send({
                userIds: ['00000000-0000-4000-8000-000000000003'],
                channelRole: 'admin'
            });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Only the channel owner/i);
    });

    test('PUT /api/chat/channels/:channelId/members/:userId - updates member channel role', async () => {
        const res = await request(app)
            .put('/api/chat/channels/ultrasound-hub/members/00000000-0000-4000-8000-000000000002')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken)
            .send({
                channelRole: 'admin'
            });

        expect(res.status).toBe(200);
        expect(res.body.channel_role).toBe('admin');
    });

    test('DELETE /api/chat/channels/:channelId/members/:userId - removes member from channel', async () => {
        const res = await request(app)
            .delete('/api/chat/channels/ultrasound-hub/members/00000000-0000-4000-8000-000000000002')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Member removed successfully');
    });

    test('DELETE /api/chat/channels/:channelId - deletes custom channel', async () => {
        const res = await request(app)
            .delete('/api/chat/channels/ultrasound-hub')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Cookie', `csrf_token=${csrfToken}`)
            .set('x-csrf-token', csrfToken);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Channel deleted successfully');
    });
});
