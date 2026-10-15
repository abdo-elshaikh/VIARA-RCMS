const {
    createUnsubscribeToken,
    verifyUnsubscribeToken,
    MAX_TTL_SECONDS
} = require('../src/utils/notificationUnsubscribeToken');
const { unsubscribeSchema } = require('../src/schemas/notificationSchema');

describe('notification unsubscribe tokens', () => {
    const now = Date.UTC(2026, 7, 28, 12, 0, 0);

    test('verifies the signed contact and channel before expiry', () => {
        const token = createUnsubscribeToken({
            contact: 'Patient@Example.com',
            channel: 'Email',
            ttlSeconds: 600,
            now
        });

        expect(verifyUnsubscribeToken({
            token,
            contact: 'patient@example.com',
            channel: 'Email',
            now: now + 599_000
        })).toBe(true);
    });

    test.each([
        ['different contact', { contact: 'other@example.com', channel: 'Email', now: now + 1_000 }],
        ['different channel', { contact: 'patient@example.com', channel: 'SMS', now: now + 1_000 }],
        ['expired token', { contact: 'patient@example.com', channel: 'Email', now: now + 600_000 }]
    ])('rejects a %s', (_label, verification) => {
        const token = createUnsubscribeToken({
            contact: 'patient@example.com',
            channel: 'Email',
            ttlSeconds: 600,
            now
        });

        expect(verifyUnsubscribeToken({ token, ...verification })).toBe(false);
    });

    test('rejects tokens whose claimed expiry exceeds the maximum lifetime', () => {
        const token = createUnsubscribeToken({
            contact: '+15555550123',
            channel: 'SMS',
            ttlSeconds: MAX_TTL_SECONDS,
            now
        });

        expect(verifyUnsubscribeToken({
            token,
            contact: '+15555550123',
            channel: 'SMS',
            now: now - 1_000
        })).toBe(false);
    });

    test('unsubscribe input requires one contact and a token', () => {
        expect(unsubscribeSchema.safeParse({
            email: 'patient@example.com',
            token: 'signed-token-value-long-enough'
        }).success).toBe(true);
        expect(unsubscribeSchema.safeParse({ email: 'patient@example.com' }).success).toBe(false);
        expect(unsubscribeSchema.safeParse({
            email: 'patient@example.com',
            phone: '+15555550123',
            token: 'signed-token-value-long-enough'
        }).success).toBe(false);
    });
});
