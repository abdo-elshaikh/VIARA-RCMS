const { z } = require('zod');

const sectionString = z.string().trim().max(10000).optional();

const reportTemplateSchema = z.object({
    name: z.string().trim().min(1).max(150),
    modalityType: z.string().trim().max(30).optional(),
    examTypeId: z.string().uuid().optional(),
    clinicalHistory: sectionString,
    technique: sectionString,
    findings: sectionString,
    impression: sectionString,
    recommendations: sectionString,
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional()
});

const updateReportTemplateSchema = reportTemplateSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one template field is required' }
);

const getReportTemplatesQuerySchema = z.object({
    modalityType: z.string().trim().max(30).optional(),
    examTypeId: z.string().uuid().optional(),
    active: z.enum(['true', 'false']).optional()
});

const amendReportSchema = z.object({
    reason: z.string().trim().min(3).max(1000),
    reportContent: z.string().trim().min(10).max(20000).optional(),
    sections: z.object({
        clinicalHistory: sectionString,
        technique: sectionString,
        findings: sectionString,
        impression: sectionString,
        recommendations: sectionString
    }).partial().optional()
}).refine((data) => data.reportContent || data.sections, {
    message: 'Report content or structured sections are required',
    path: ['reportContent']
});

module.exports = {
    reportTemplateSchema,
    updateReportTemplateSchema,
    getReportTemplatesQuerySchema,
    amendReportSchema
};
