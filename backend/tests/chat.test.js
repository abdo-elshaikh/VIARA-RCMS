process.env.JWT_SECRET = 'test-auth-secret-at-least-32-characters';

const fs = require('fs');
const path = require('path');

const queryText = (sql) => String(sql || '').replace(/\s+/g, ' ');

const mockDefaultQueryResponse = async (sql, params = []) => {
    const text = queryText(sql);

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
});