const { z } = require('zod');
const { calendarDateSchema } = require('../utils/dateValidation');
const calendarDate = calendarDateSchema();

// ─── Modalities (Machines) ────────────────────────────────────────────────────

const createMachineSchema = z.object({
    name: z.string().trim().min(2).max(50),
    type: z.enum(['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography', 'Cath Lab', 'Panoramic X-Ray', 'PET-CT', 'Fluoroscopy', 'DEXA']),
    roomNumber: z.string().trim().max(20).optional(),
    serialNumber: z.string().trim().max(100).optional(),
    manufacturer: z.string().trim().max(100).optional(),
    model: z.string().trim().max(100).optional(),
    installationDate: calendarDate.optional(),
    location: z.string().trim().max(255).optional(),
    status: z.enum(['Active', 'Out of Service', 'Under Maintenance']).optional().default('Active')
});

const updateMachineSchema = createMachineSchema.partial().extend({
    status: z.enum(['Active', 'Out of Service', 'Under Maintenance']).optional()
}).refine(data => Object.keys(data).length > 0, { message: 'At least one machine field is required' });

// ─── Service Contracts ────────────────────────────────────────────────────────

const createServiceContractSchema = z.object({
    modalityId: z.string().uuid(),
    providerName: z.string().min(1).max(255),
    contactInfo: z.string().max(255).optional(),
    startDate: calendarDate,
    endDate: calendarDate,
    cost: z.number().min(0).optional(),
    status: z.enum(['Active', 'Expired', 'Terminated']).default('Active'),
    notes: z.string().optional()
}).refine(data => data.endDate >= data.startDate, {
    path: ['endDate'], message: 'Contract end date must be on or after start date'
});

const updateServiceContractSchema = createServiceContractSchema.innerType().partial();

// ─── Equipment Maintenance ────────────────────────────────────────────────────

const createMaintenanceSchema = z.object({
    modalityId: z.string().uuid(),
    maintenanceType: z.enum(['Routine', 'Repair', 'Calibration', 'Inspection']),
    scheduledDate: calendarDate,
    completedDate: calendarDate.optional().nullable(),
    performedBy: z.string().max(255).optional(),
    cost: z.number().min(0).optional(),
    status: z.enum(['Scheduled', 'In Progress', 'Completed', 'Cancelled']).default('Scheduled'),
    notes: z.string().optional()
}).superRefine((data, context) => {
    if (data.completedDate && data.completedDate < data.scheduledDate) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedDate'], message: 'Completion date cannot be before the scheduled date' });
    }
    if (data.status === 'Completed' && !data.completedDate) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['completedDate'], message: 'Completed maintenance requires a completion date' });
    }
});

const updateMaintenanceSchema = createMaintenanceSchema.innerType().partial();

// ─── Equipment Downtime ───────────────────────────────────────────────────────

const createDowntimeSchema = z.object({
    modalityId: z.string().uuid(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    reason: z.string().min(1).max(255),
    status: z.enum(['Planned', 'Unplanned']).default('Planned'),
    resolutionNotes: z.string().optional()
}).refine(data => new Date(data.endTime) > new Date(data.startTime), {
    path: ['endTime'], message: 'Downtime end time must be after start time'
});

const updateDowntimeSchema = z.object({
    modalityId: z.string().uuid().optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    reason: z.string().min(1).max(255).optional(),
    status: z.enum(['Planned', 'Unplanned', 'Resolved']).optional(),
    resolutionNotes: z.string().optional()
}).superRefine((data, context) => {
    if (data.startTime && data.endTime && new Date(data.endTime) <= new Date(data.startTime)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Downtime end time must be after start time' });
    }
    if (data.status === 'Resolved' && !data.resolutionNotes?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionNotes'], message: 'Resolution notes are required' });
    }
});

module.exports = {
    createMachineSchema,
    updateMachineSchema,
    createServiceContractSchema,
    updateServiceContractSchema,
    createMaintenanceSchema,
    updateMaintenanceSchema,
    createDowntimeSchema,
    updateDowntimeSchema
};
