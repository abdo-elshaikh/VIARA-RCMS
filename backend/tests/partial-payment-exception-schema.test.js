const {
    requestPartialPaymentExceptionSchema,
    reviewPartialPaymentExceptionSchema
} = require('../src/schemas/partialPaymentExceptionSchema');

describe('partial payment exception expiry validation', () => {
    test('rejects an expired request date', () => {
        const result = requestPartialPaymentExceptionSchema.safeParse({
            transactionType: 'ClinicalQueueTransition',
            targetStage: 'In Exam',
            reason: 'Approved operational exception',
            expiresAt: '2020-01-01'
        });

        expect(result.success).toBe(false);
    });

    test('rejects an expired review date', () => {
        const result = reviewPartialPaymentExceptionSchema.safeParse({
            status: 'Approved',
            reviewNotes: 'Approved for documented operational reason',
            expiresAt: '2020-01-01'
        });

        expect(result.success).toBe(false);
    });

    test('accepts a future exception date', () => {
        const result = requestPartialPaymentExceptionSchema.safeParse({
            transactionType: 'ClinicalQueueTransition',
            targetStage: 'In Exam',
            reason: 'Approved operational exception',
            expiresAt: '2099-01-01'
        });

        expect(result.success).toBe(true);
    });
});
