const { z } = require('zod');

const emptyToUndefined = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

// ─── Patient Consents ────────────────────────────────────────────────────────

const addConsentSchema = z.object({
    type: z.enum(['Treatment', 'DataSharing', 'Marketing']),
    document_url: z.string().url().optional().nullable(),
    source: z.enum(['Staff', 'PatientPortal', 'Paper', 'Imported']).optional(),
    notes: z.string().max(1000).optional()
});

const revokeConsentSchema = z.object({
    reason: z.string().trim().min(5).max(1000)
});

// ─── Privacy Requests ────────────────────────────────────────────────────────

const createPrivacyRequestSchema = z.object({
    patient_id: z.string().uuid().optional(),
    request_type: z.enum(['Export', 'Anonymize', 'Correction']),
    notes: z.string().optional()
});

const resolvePrivacyRequestSchema = z.object({
    action: z.enum(['Export', 'Anonymize', 'Resolve', 'Reject']),
    notes: z.preprocess(emptyToUndefined, z.string().min(5).max(2000).optional())
});

module.exports = {
    addConsentSchema,
    revokeConsentSchema,
    createPrivacyRequestSchema,
    resolvePrivacyRequestSchema
};
