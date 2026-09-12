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
    roomId: z.preprocess(
        (value) => (value === '' || value === undefined) ? null : value,
        z.string().uuid().nullable().optional()
    ),
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

const manualAttendanceSchema = z.object({
    userId: z.string().uuid(),
    clockIn: z.string().datetime(),
    clockOut: z.preprocess((value) => value === '' ? null : value, z.string().datetime().nullable().optional()),
    status: z.enum(['Present', 'Late', 'Absent', 'Half-Day']),
    notes: z.string().trim().min(3).max(500)
}).refine(
    data => !data.clockOut || new Date(data.clockOut) >= new Date(data.clockIn),
    { path: ['clockOut'], message: 'Clock-out must be on or after clock-in' }
);

const leaveRequestFields = z.object({
    userId: z.string().uuid().optional(),
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

const cancelLeaveSchema = z.object({
    notes: optionalTrimmedString(500)
});

const updateLeaveBalanceSchema = z.object({
    year: z.number().int().min(2000).max(2100).optional(),
    leaveType: z.enum(['Sick', 'Vacation', 'Personal']),
    entitlementDays: z.number().min(0).max(365),
    notes: optionalTrimmedString(500)
});

const credentialFields = z.object({
    userId: z.string().uuid(),
    credentialType: z.string().trim().min(2).max(100),
    credentialNumber: nullableTrimmedString(100),
    issuingAuthority: nullableTrimmedString(150),
    issuedDate: z.preprocess((value) => value === '' ? null : value, dateString.nullable().optional()),
    expiresAt: dateString,
    notes: nullableTrimmedString(500)
});

const credentialDateOrder = data => !data.issuedDate || !data.expiresAt || data.expiresAt >= data.issuedDate;

const createStaffCredentialSchema = credentialFields.refine(credentialDateOrder, {
    path: ['expiresAt'],
    message: 'Credential expiry must be on or after its issue date'
});
const updateStaffCredentialSchema = credentialFields.partial().refine(credentialDateOrder, {
    path: ['expiresAt'],
    message: 'Credential expiry must be on or after its issue date'
});

const createAttendancePermissionSchema = z.object({
    userId: z.string().uuid().optional(),
    shiftId: z.string().uuid().nullable().optional(),
    permissionType: z.enum(['EarlyDeparture', 'LateArrival', 'EmergencyAccess']),
    effectiveDate: dateString,
    allowedTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
    minutesGranted: z.number().int().min(0).max(480).optional(),
    reason: z.string().trim().min(3).max(500)
});

const updateAttendancePermissionStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    reviewNotes: optionalTrimmedString(500)
});

const updateAttendanceSettingsSchema = z.object({
    gracePeriodLateMinutes: z.number().int().min(0).max(120).optional(),
    gracePeriodEarlyMinutes: z.number().int().min(0).max(120).optional(),
    deductFullDelayAfterGrace: z.boolean().optional(),
    requireEarlyLeaveApproval: z.boolean().optional(),
    enforceShiftLoginRestriction: z.boolean().optional(),
    loginBufferBeforeMinutes: z.number().int().min(0).max(180).optional(),
    loginBufferAfterMinutes: z.number().int().min(0).max(180).optional(),
    exemptRolesFromLoginRestriction: z.string().trim().max(255).optional()
});

const createShiftRequestSchema = z.object({
    shiftId: z.string().uuid().nullable().optional(),
    targetUserId: z.string().uuid().nullable().optional(),
    targetShiftId: z.string().uuid().nullable().optional(),
    requestType: z.enum(['Swap', 'Modification', 'Drop']),
    requestedStartTime: z.string().optional().nullable(),
    requestedEndTime: z.string().optional().nullable(),
    reason: z.string().trim().min(3).max(500)
});

const updateShiftRequestStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected', 'Cancelled']),
    reviewNotes: optionalTrimmedString(500)
});

const createStaffEvaluationSchema = z.object({
    userId: z.string().uuid(),
    evaluationPeriod: z.string().trim().min(2).max(50).optional(),
    overallRating: z.number().min(1).max(5),
    punctualityScore: z.number().int().min(1).max(5).optional(),
    clinicalQualityScore: z.number().int().min(1).max(5).optional(),
    teamworkScore: z.number().int().min(1).max(5).optional(),
    productivityScore: z.number().int().min(1).max(5).optional(),
    strengths: optionalTrimmedString(2000),
    areasForImprovement: optionalTrimmedString(2000),
    goals: optionalTrimmedString(2000),
    status: z.enum(['Draft', 'Finalized', 'Acknowledged']).optional()
});

module.exports = {
    updateProfileSchema,
    createShiftSchema, updateShiftSchema,
    clockInSchema, clockOutSchema, updateAttendanceSchema,
    manualAttendanceSchema,
    createLeaveRequestSchema, updateLeaveStatusSchema, cancelLeaveSchema,
    updateLeaveBalanceSchema,
    createStaffCredentialSchema, updateStaffCredentialSchema,
    createAttendancePermissionSchema,
    updateAttendancePermissionStatusSchema,
    updateAttendanceSettingsSchema,
    createShiftRequestSchema,
    updateShiftRequestStatusSchema,
    createStaffEvaluationSchema
};

