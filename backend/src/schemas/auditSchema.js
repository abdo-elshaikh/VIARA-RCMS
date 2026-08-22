const { z } = require('zod');

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max) => z.string().trim().min(1).max(max).optional();

const auditFilterFields = {
    userId: z.string().uuid().optional(),
    action: optionalText(120),
    resourceId: z.string().uuid().optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    category: z.enum(['AUTH', 'RBAC', 'PHI_ACCESS', 'PRIVACY', 'BILLING', 'CONFIG', 'DATA_WRITE', 'SECURITY']).optional(),
    outcome: z.enum(['success', 'failure', 'denied']).optional(),
    q: optionalText(160),
    actorType: z.enum(['USER', 'SYSTEM', 'PATIENT', 'API_TOKEN', 'INTEGRATION']).optional(),
    eventCode: optionalText(120),
    targetType: optionalText(100),
    targetId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
    examId: z.string().uuid().optional(),
    invoiceId: z.string().uuid().optional(),
    requestId: optionalText(160),
    minSeverity: z.coerce.number().int().min(0).max(100).optional(),
    minRisk: z.coerce.number().int().min(0).max(100).optional(),
};

const dateRange = (schema) => schema.refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    { message: 'startDate must be on or before endDate', path: ['endDate'] }
);

const auditLogsQuerySchema = dateRange(z.object({
    ...auditFilterFields,
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
}));

const auditExportQuerySchema = dateRange(z.object({
    ...auditFilterFields,
    limit: z.coerce.number().int().min(1).max(50000).default(10000),
}));

const auditVerifyQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100000).optional(),
    startLogId: z.coerce.number().int().min(0).default(0),
});

const auditAlertsQuerySchema = z.object({
    status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']).optional(),
    severity: z.enum(['info', 'warning', 'critical']).optional(),
    actorUserId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
    alertType: optionalText(100),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
});

const auditAlertReviewSchema = z.object({
    status: z.enum(['reviewing', 'resolved', 'dismissed']),
    resolutionNotes: z.string().trim().max(2000).nullable().optional(),
}).strict();

const auditDetectionSchema = z.object({
    failedAuthThreshold: z.coerce.number().int().min(1).max(10000).optional(),
    deniedThreshold: z.coerce.number().int().min(1).max(10000).optional(),
    phiAccessCountThreshold: z.coerce.number().int().min(1).max(100000).optional(),
    phiPatientThreshold: z.coerce.number().int().min(1).max(100000).optional(),
}).strict().default({});

module.exports = {
    auditLogsQuerySchema,
    auditExportQuerySchema,
    auditVerifyQuerySchema,
    auditAlertsQuerySchema,
    auditAlertReviewSchema,
    auditDetectionSchema,
};
