const { z } = require('zod');

const claimStatusSchema = z.enum([
    'Draft',
    'Pending Approval',
    'Approved',
    'Submitted',
    'Paid',
    'Partially Paid',
    'Rejected',
    'Resubmitted',
    'Written Off'
]);

const createClaimSchema = z.object({
    invoiceId: z.string().uuid().optional(),
    patientId: z.string().uuid(),
    providerId: z.string().uuid(),
    policyId: z.string().uuid().optional(),
    approvalId: z.string().uuid().optional(),
    claimReferenceNumber: z.string().trim().max(100).optional(),
    expectedAmount: z.coerce.number().min(0).optional()
});

const updateClaimStatusSchema = z.object({
    status: claimStatusSchema,
    claimReferenceNumber: z.string().trim().max(100).optional(),
    receivedAmount: z.coerce.number().min(0).optional(),
    rejectionReason: z.string().trim().max(1000).optional(),
    resubmissionNotes: z.string().trim().max(1000).optional()
}).superRefine((data, context) => {
    if (data.status === 'Rejected' && (!data.rejectionReason || data.rejectionReason.length < 3)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['rejectionReason'], message: 'A rejection reason is required' });
    }
    if (data.status === 'Resubmitted' && (!data.resubmissionNotes || data.resubmissionNotes.length < 3)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['resubmissionNotes'], message: 'Resubmission notes are required' });
    }
    if (['Paid', 'Partially Paid'].includes(data.status) && data.receivedAmount === undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['receivedAmount'], message: 'Received amount is required for payment status' });
    }
});

const getClaimsQuerySchema = z.object({
    status: claimStatusSchema.optional(),
    providerId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
    rejectedOnly: z.enum(['true', 'false']).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

module.exports = {
    createClaimSchema,
    updateClaimStatusSchema,
    getClaimsQuerySchema
};
