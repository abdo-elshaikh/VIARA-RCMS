const { z } = require('zod');

const isRealDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
};

const dateString = z.string().refine(isRealDate, 'Invalid calendar date');

const nullableTrimmedString = (max) => z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}, z.string().max(max).nullable().optional());

const optionalTrimmedString = (max) => z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}, z.string().max(max).optional());

const updateProfileSchema = z.object({
    employeeId: nullableTrimmedString(50),
    department: nullableTrimmedString(100),
    jobTitle: nullableTrimmedString(100),
    hireDate: z.preprocess(
        (value) => value === '' ? null : value,
        dateString.nullable().optional()
    ),
    terminationDate: z.preprocess(
        (value) => value === '' ? null : value,
        dateString.nullable().optional()
    ),
    employmentStatus: z.enum(['Full-Time', 'Part-Time', 'Contract']).optional(),
}).refine(
    data => !data.hireDate || !data.terminationDate || data.terminationDate >= data.hireDate,
    { path: ['terminationDate'], message: 'Termination date must be on or after hire date' }
);

const shiftFields = z.object({
    userId: z.string().uuid(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    notes: optionalTrimmedString(500)
});

const validShiftRange = data => !data.startTime || !data.endTime || new Date(data.endTime) > new Date(data.startTime);
const createShiftSchema = shiftFields.refine(validShiftRange, { path: ['endTime'], message: 'Shift end time must be after start time' });
const updateShiftSchema = shiftFields.partial().refine(validShiftRange, { path: ['endTime'], message: 'Shift end time must be after start time' });

const clockInSchema = z.object({
    notes: optionalTrimmedString(500)
});

const clockOutSchema = z.object({
    notes: optionalTrimmedString(500)
});

const updateAttendanceSchema = z.object({
    clockIn: z.string().datetime(),
    clockOut: z.preprocess((value) => value === '' ? null : value, z.string().datetime().nullable()),
    status: z.enum(['Present', 'Late', 'Absent', 'Half-Day']),
    notes: z.string().trim().min(3).max(500)
}).refine(
    data => !data.clockOut || new Date(data.clockOut) >= new Date(data.clockIn),
    { path: ['clockOut'], message: 'Clock-out must be on or after clock-in' }
);

const leaveRequestFields = z.object({
    startDate: dateString,
    endDate: dateString,
    leaveType: z.enum(['Sick', 'Vacation', 'Unpaid', 'Personal']),
    reason: optionalTrimmedString(500)
});

const createLeaveRequestSchema = leaveRequestFields.refine(
    data => data.endDate >= data.startDate,
    { path: ['endDate'], message: 'Leave end date must be on or after start date' }
);

const updateLeaveStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    notes: optionalTrimmedString(500)
});

module.exports = {
    updateProfileSchema,
    createShiftSchema, updateShiftSchema,
    clockInSchema, clockOutSchema, updateAttendanceSchema,
    createLeaveRequestSchema, updateLeaveStatusSchema
};
