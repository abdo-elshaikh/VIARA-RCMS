const { z } = require('zod');

// ─── Modalities (Machines) ────────────────────────────────────────────────────

const createMachineSchema = z.object({
    name: z.string().trim().min(2).max(50),
    type: z.enum(['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography', 'Cath Lab', 'Panoramic X-Ray', 'PET-CT', 'Fluoroscopy', 'DEXA']),
    roomNumber: z.string().trim().max(20).optional(),
    serialNumber: z.string().trim().max(100).optional(),
    manufacturer: z.string().trim().max(100).optional(),
    model: z.string().trim().max(100).optional(),
    installationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cost: z.number().min(0).optional(),
    status: z.enum(['Active', 'Expired', 'Terminated']).default('Active'),
    notes: z.string().optional()
});

const updateServiceContractSchema = createServiceContractSchema.partial();

// ─── Equipment Maintenance ────────────────────────────────────────────────────

const createMaintenanceSchema = z.object({
    modalityId: z.string().uuid(),
    maintenanceType: z.enum(['Routine', 'Repair', 'Calibration', 'Inspection']),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    performedBy: z.string().max(255).optional(),
    cost: z.number().min(0).optional(),
    status: z.enum(['Scheduled', 'In Progress', 'Completed', 'Cancelled']).default('Scheduled'),
    notes: z.string().optional()
});

const updateMaintenanceSchema = createMaintenanceSchema.partial();

// ─── Equipment Downtime ───────────────────────────────────────────────────────

const createDowntimeSchema = z.object({
    modalityId: z.string().uuid(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    reason: z.string().min(1).max(255),
    status: z.enum(['Planned', 'Unplanned', 'Resolved']).default('Planned'),
    resolutionNotes: z.string().optional()
});

const updateDowntimeSchema = createDowntimeSchema.partial();

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
