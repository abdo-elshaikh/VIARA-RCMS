const { z } = require('zod');

const boundedObject = z.record(z.unknown()).refine(value => JSON.stringify(value).length <= 65536, 'WebAuthn response is too large');

const passkeyAuthenticationOptionsSchema = z.object({
    email: z.string().email().max(150).toLowerCase().trim()
});

const passkeyAuthenticationVerifySchema = z.object({
    ceremonyId: z.string().uuid(),
    response: boundedObject
});

const passkeyRegistrationOptionsSchema = z.object({
    currentPassword: z.string().min(1).max(100)
});

const passkeyRegistrationVerifySchema = z.object({
    ceremonyId: z.string().uuid(),
    label: z.string().trim().min(1).max(80),
    response: boundedObject
});

const passkeyRenameSchema = z.object({ label: z.string().trim().min(1).max(80) });
const passkeyRevokeSchema = z.object({ currentPassword: z.string().max(100).optional() });

module.exports = {
    passkeyAuthenticationOptionsSchema,
    passkeyAuthenticationVerifySchema,
    passkeyRegistrationOptionsSchema,
    passkeyRegistrationVerifySchema,
    passkeyRenameSchema,
    passkeyRevokeSchema
};
