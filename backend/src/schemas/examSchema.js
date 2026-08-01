const { z } = require('zod');

/**
 * Examination/Report validation schemas
 */

// Update exam report schema
const updateExamReportSchema = z.object({
    examId: z.string()
        .uuid('Invalid exam ID format'),

    status: z.enum(['Scheduled', 'Checked-in', 'Scanning', 'Reporting', 'Finalized'], {
        errorMap: () => ({ message: 'Invalid exam status' })
    }).optional(),

    reportStatus: z.enum(['Draft', 'Typed', 'Reviewed', 'Approved', 'Amended', 'Finalized']).optional(),

    templateId: z.string().uuid('Invalid template ID format').optional(),

    reportContent: z.string()
        .min(10, 'Report content must be at least 10 characters')
        .max(20000, 'Report content must be less than 20000 characters')
        .optional(),

    sections: z.object({
        clinicalHistory: z.string().max(5000).optional(),
        technique: z.string().max(5000).optional(),
        findings: z.string().max(10000).optional(),
        impression: z.string().max(5000).optional(),
        recommendations: z.string().max(5000).optional()
    }).partial().optional(),

    findings: z.string()
        .max(5000, 'Findings must be less than 5000 characters')
        .optional(),

    impression: z.string()
        .max(2000, 'Impression must be less than 2000 characters')
        .optional()
}).refine((data) => {
    // #24 — If status is Finalized, ensure report content OR at least one non-empty section is present
    if (data.status === 'Finalized') {
        if (data.reportContent && data.reportContent.trim().length >= 10) return true;
        if (data.sections) {
            const hasContent = Object.values(data.sections).some(
                (v) => typeof v === 'string' && v.trim().length > 0
            );
            if (hasContent) return true;
        }
        if (data.findings && data.findings.trim().length > 0) return true;
        if (data.impression && data.impression.trim().length > 0) return true;
        return false;
    }
    return true;
}, {
    message: 'Report content or at least one section with content is required when finalizing an exam',
    path: ['reportContent']
});

// Get worklist query schema
const getWorklistQuerySchema = z.object({
    status: z.enum(['Scheduled', 'Checked-in', 'Scanning', 'Reporting', 'Finalized']).optional(),
    modalityType: z.string().optional(),
    priority: z.enum(['Routine', 'Urgent', 'Emergency']).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

// AI report reformatting request schema
const improveReportSchema = z.object({
    reportText: z.string()
        .min(10, 'Report text must be at least 10 characters')
        .max(20000, 'Report text must be less than 20000 characters'),
    examId: z.string().uuid('Invalid exam ID format').optional(),
    modality: z.string().max(100).optional(),
    examType: z.string().max(200).optional(),
    sectionType: z.enum(['clinicalHistory', 'technique', 'findings', 'impression', 'recommendations']).optional(),
    language: z.enum(['en', 'ar']).optional()
});

const generatePreliminaryReportSchema = z.object({
    language: z.enum(['en', 'ar']).optional(),
    templateId: z.string().uuid('Invalid template ID format').optional(),
    template: z.object({
        name: z.string().max(200).optional(),
        clinical_history: z.string().max(5000).optional().nullable(),
        technique: z.string().max(5000).optional().nullable(),
        findings: z.string().max(10000).optional().nullable(),
        impression: z.string().max(5000).optional().nullable(),
        recommendations: z.string().max(5000).optional().nullable()
    }).optional()
});

const markAiReportDraftAppliedSchema = z.object({
    mode: z.enum(['fill_empty', 'replace']).optional()
});

module.exports = {
    updateExamReportSchema,
    getWorklistQuerySchema,
    improveReportSchema,
    generatePreliminaryReportSchema,
    markAiReportDraftAppliedSchema
};
