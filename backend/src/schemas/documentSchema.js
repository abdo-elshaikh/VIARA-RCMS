const { z } = require('zod');

// ─── Document Schemas ───────────────────────────────────────────────────────

const documentTypeSchema = z.enum([
    'Consent Form',
    'Patient ID',
    'Passport',
    'Insurance Card',
    'Insurance Approval',
    'Prescription',
    'Previous Report',
    'Lab Result',
    'Invoice',
    'Signed Form',
    'Other'
]);

const uploadDocumentSchema = z.object({
    patient_id: z.string().uuid(),
    appointment_id: z.string().uuid().optional().nullable(),
    exam_id: z.string().uuid().optional().nullable(),
    type: documentTypeSchema,
    notes: z.string().max(1000).optional().nullable()
});

const updateDocumentSchema = z.object({
    type: documentTypeSchema.optional(),
    notes: z.string().max(1000).optional().nullable()
});

module.exports = {
    uploadDocumentSchema,
    updateDocumentSchema
};
