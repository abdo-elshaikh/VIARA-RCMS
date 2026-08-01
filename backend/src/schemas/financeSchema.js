const { z } = require('zod');

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const branchId = z.string().uuid().optional();

const validateDateRange = (schema) => schema.superRefine((data, context) => {
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'End date must be on or after start date'
        });
    }
});

const createExpenseCategorySchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional()
});

const updateExpenseCategorySchema = createExpenseCategorySchema.partial();

const expenseBaseSchema = z.object({
    categoryId: z.string().uuid(),
    supplierId: z.string().uuid().optional().nullable(),
    amount: z.coerce.number().positive(),
    taxAmount: z.coerce.number().min(0).default(0),
    expenseDate: dateString,
    paymentMethod: z.string().max(50).optional(),
    referenceNumber: z.string().max(100).optional(),
    receiptUrl: z.string().max(255).optional(),
    notes: z.string().optional()
});

const validateExpenseTax = (data, context) => {
    if (data.taxAmount !== undefined && data.amount !== undefined && data.taxAmount > data.amount) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['taxAmount'],
            message: 'Tax amount cannot exceed the total expense amount'
        });
    }
};

const createExpenseSchema = expenseBaseSchema.superRefine(validateExpenseTax);

const updateExpenseSchema = expenseBaseSchema.partial().superRefine(validateExpenseTax);

const getExpensesQuerySchema = validateDateRange(z.object({
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    categoryId: z.string().uuid().optional(),
    branchId
}));

const payCommissionSchema = z.object({
    doctorId: z.string().uuid(),
    amount: z.coerce.number().positive(),
    transactionRef: z.string().max(100).optional(),
    paidDate: z.string().datetime().optional(),
    idempotencyKey: z.string().uuid()
});

const reverseExpenseSchema = z.object({
    reason: z.string().trim().min(5).max(500)
});

const createClosureSchema = z.object({
    closureDate: dateString
});

const finalizeClosureSchema = z.object({
    status: z.literal('Finalized')
});

const getFinancialClosuresQuerySchema = validateDateRange(z.object({
    status: z.enum(['Draft', 'Finalized']).optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional()
}));

const financialReportQuerySchema = validateDateRange(z.object({
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    asOfDate: dateString.optional(),
    groupBy: z.enum(['day', 'week', 'month', 'year']).optional(),
    branchId
}));

const journalLedgerQuerySchema = validateDateRange(z.object({
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    branchId,
    accountCode: z.string().trim().min(1).max(30).optional(),
    sourceType: z.string().trim().min(1).max(50).optional(),
    sourceTypePrefix: z.string().trim().min(1).max(50).optional(),
    sourceId: z.string().uuid().optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
}));

module.exports = {
    createExpenseCategorySchema,
    updateExpenseCategorySchema,
    createExpenseSchema,
    updateExpenseSchema,
    getExpensesQuerySchema,
    reverseExpenseSchema,
    payCommissionSchema,
    createClosureSchema,
    finalizeClosureSchema,
    getFinancialClosuresQuerySchema,
    financialReportQuerySchema,
    journalLedgerQuerySchema
};
