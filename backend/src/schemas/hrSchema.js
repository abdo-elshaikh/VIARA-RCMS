const { z } = require('zod');

// ─── Employee Profiles ────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
    employeeId: z.string().max(50).optional(),
    department: z.string().max(100).optional(),
    jobTitle: z.string().max(100).optional(),
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    employmentStatus: z.string().max(50).optional(),
    salary: z.number().min(0).optional()
});

// ─── Staff Shifts ─────────────────────────────────────────────────────────────

const shiftFields = z.object({
    userId: z.string().uuid(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    notes: z.string().optional()
});

const validShiftRange = data => !data.startTime || !data.endTime || new Date(data.endTime) > new Date(data.startTime);
const createShiftSchema = shiftFields.refine(validShiftRange, { path: ['endTime'], message: 'Shift end time must be after start time' });
const updateShiftSchema = shiftFields.partial().refine(validShiftRange, { path: ['endTime'], message: 'Shift end time must be after start time' });

// ─── Attendance ───────────────────────────────────────────────────────────────

const clockInSchema = z.object({
    notes: z.string().optional()
});

const clockOutSchema = z.object({
    notes: z.string().optional()
});

// ─── Leave Requests ───────────────────────────────────────────────────────────

const leaveRequestFields = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    leaveType: z.enum(['Sick', 'Vacation', 'Unpaid', 'Personal']),
    reason: z.string().optional()
});
const createLeaveRequestSchema = leaveRequestFields.refine(data => data.endDate >= data.startDate, { path: ['endDate'], message: 'Leave end date must be on or after start date' });

const updateLeaveStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected'])
});

module.exports = {
    updateProfileSchema,
    createShiftSchema, updateShiftSchema,
    clockInSchema, clockOutSchema,
    createLeaveRequestSchema, updateLeaveStatusSchema
};
