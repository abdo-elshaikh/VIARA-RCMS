const { z } = require('zod');

const codeSchema = z.preprocess(
    value => (value === '' || value === undefined || value === null ? undefined : String(value).trim()),
    z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).optional()
);
const optionalUuidQuery = z.preprocess(
    value => (value === '' || value === undefined || value === null ? undefined : value),
    z.string().uuid().optional()
);
const booleanQuery = z.preprocess((value) => {
    if (value === '' || value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    return value;
}, z.boolean().optional());
const optionalTrimmedString = (max) => z.preprocess(
    value => (value === '' || value === undefined || value === null ? undefined : String(value).trim()),
    z.string().trim().max(max).optional()
);

const createExamTypeSchema = z.object({
    modalityId: z.string().uuid(),
    code: codeSchema,
    name: z.string().trim().min(2).max(100),
    price: z.coerce.number().min(0).max(10000000),
    durationMinutes: z.coerce.number().int().min(1).max(1440),
    bodyPart: optionalTrimmedString(100),
    preparationInstructions: optionalTrimmedString(4000),
    contrastRequired: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true)
});

const updateExamTypeSchema = createExamTypeSchema.partial().refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one examination field is required' }
);

const getExamTypesQuerySchema = z.object({
    modalityId: optionalUuidQuery,
    roomId: optionalUuidQuery,
    includeInactive: booleanQuery
});

module.exports = { createExamTypeSchema, updateExamTypeSchema, getExamTypesQuerySchema };
