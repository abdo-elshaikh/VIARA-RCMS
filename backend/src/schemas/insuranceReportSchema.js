'use strict';

const { z } = require('zod');
const { calendarDateSchema } = require('../utils/dateValidation');

const dateSchema = calendarDateSchema();

const claimsSummaryQuerySchema = z.object({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    providerId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    format: z.enum(['json', 'csv']).optional()
});

const payerStatementQuerySchema = z.object({
    providerId: z.string().uuid(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    branchId: z.string().uuid().optional(),
    format: z.enum(['json', 'csv']).optional()
});

const insuranceAgingQuerySchema = z.object({
    asOfDate: dateSchema.optional(),
    branchId: z.string().uuid().optional(),
    format: z.enum(['json', 'csv']).optional()
});

const contractsPerformanceQuerySchema = z.object({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    branchId: z.string().uuid().optional(),
    format: z.enum(['json', 'csv']).optional()
});

module.exports = {
    claimsSummaryQuerySchema,
    payerStatementQuerySchema,
    insuranceAgingQuerySchema,
    contractsPerformanceQuerySchema
};
