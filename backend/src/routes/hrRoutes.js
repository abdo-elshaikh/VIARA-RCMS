const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { strictLimiter } = require('../middleware/rateLimiter');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const { createUserSchema, updateUserSchema } = require('../schemas/userSchema');
const {
    createExamTypeSchema,
    updateExamTypeSchema,
    getExamTypesQuerySchema
} = require('../schemas/examTypeSchema');
const {
    updateProfileSchema: updateHrProfileSchema,
    createShiftSchema,
    clockInSchema,
    clockOutSchema,
    updateAttendanceSchema,
    createLeaveRequestSchema,
    updateLeaveStatusSchema
} = require('../schemas/hrSchema');
const {
    createPayrollPeriodSchema,
    cancelPayrollPeriodSchema,
    createCompensationProfileSchema,
    updateCompensationProfileSchema,
    createPayrollRuleSchema,
    updatePayrollRuleStatusSchema,
    createDeductionSchema,
    updateDeductionStatusSchema,
    createPenaltySchema,
    updatePenaltyStatusSchema,
    calculatePayrollSchema,
    updatePayrollRunStatusSchema,
    payrollQuerySchema
} = require('../schemas/payrollSchema');

const {
    getAllStaff,
    createStaff,
    updateStaff,
    deleteStaff
} = require('../controllers/staffController');
const {
    getExamTypes,
    createExamType,
    updateExamType,
    deleteExamType
} = require('../controllers/examTypeController');
const {
    getEmployeeProfiles,
    updateEmployeeProfile,
    getShifts,
    createShift,
    deleteShift,
    getAttendance,
    clockIn,
    clockOut,
    updateAttendance,
    getLeaveRequests,
    createLeaveRequest,
    updateLeaveStatus,
    getProductivityReport
} = require('../controllers/hrController');
const {
    getPayrollEmployees,
    getPayrollOverview,
    getPayrollPeriods,
    createPayrollPeriod,
    cancelPayrollPeriod,
    getCompensationProfiles,
    createCompensationProfile,
    updateCompensationProfile,
    getPayrollRules,
    createPayrollRule,
    updatePayrollRuleStatus,
    getDeductions,
    createDeduction,
    updateDeductionStatus,
    getPenalties,
    createPenalty,
    updatePenaltyStatus,
    getPayrollRun,
    calculatePayroll,
    updatePayrollRunStatus
} = require('../controllers/payrollController');

const employeeLeaveRoles = ['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'];
const employeeAttendanceRoles = ['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'];

module.exports = function hrRoutes(pool, auditService) {
    const router = express.Router();

    // ─── Staff & Exam Catalog Routes ──────────────────────────────────────────
    router.get('/exam-types', authenticateToken, validateQuery(getExamTypesQuerySchema), getExamTypes(pool));
    router.post('/exam-types', authenticateToken, hasPermission(pool, 'MANAGE_EXAM_CATALOG'), validateRequest(createExamTypeSchema), createExamType(pool));
    router.put('/exam-types/:id', authenticateToken, hasPermission(pool, 'MANAGE_EXAM_CATALOG'), validateRequest(updateExamTypeSchema), updateExamType(pool));
    router.delete('/exam-types/:id', authenticateToken, hasPermission(pool, 'MANAGE_EXAM_CATALOG'), deleteExamType(pool));

    router.get('/staff',
        authenticateToken,
        authorizeRole(['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']),
        getAllStaff(pool)
    );
    router.post('/staff',
        authenticateToken,
        authorizeRole(['HR', 'Admin']),
        hasPermission(pool, 'MANAGE_STAFF'),
        validateRequest(createUserSchema),
        createStaff(pool)
    );
    router.put('/staff/:id',
        authenticateToken,
        authorizeRole(['HR', 'Admin']),
        hasPermission(pool, 'MANAGE_STAFF'),
        validateRequest(updateUserSchema),
        updateStaff(pool)
    );
    router.delete('/staff/:id',
        strictLimiter,
        authenticateToken,
        authorizeRole(['HR', 'Admin']),
        hasPermission(pool, 'MANAGE_STAFF'),
        deleteStaff(pool)
    );

    // ─── HR Profiles, Shifts & Attendance ─────────────────────────────────────
    router.get('/hr/profiles', authenticateToken, authorizeRole(['HR', 'Admin']), auditRead(auditService, { resourceTable: 'employee_profiles' }), getEmployeeProfiles(pool));
    router.put('/hr/profiles/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_STAFF'), validateRequest(updateHrProfileSchema), updateEmployeeProfile(pool));

    router.get('/hr/shifts', authenticateToken, authorizeRole(employeeAttendanceRoles), getShifts(pool));
    router.post('/hr/shifts', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_SHIFTS'), validateRequest(createShiftSchema), createShift(pool));
    router.delete('/hr/shifts/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_SHIFTS'), deleteShift(pool));

    router.get('/hr/attendance', authenticateToken, authorizeRole(employeeAttendanceRoles), auditRead(auditService, { resourceTable: 'attendance_logs' }), getAttendance(pool));
    router.post('/hr/attendance/clock-in', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(clockInSchema), clockIn(pool));
    router.post('/hr/attendance/clock-out', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(clockOutSchema), clockOut(pool));
    router.put('/hr/attendance/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_ATTENDANCE'), validateRequest(updateAttendanceSchema), updateAttendance(pool));

    router.get('/hr/leave', authenticateToken, authorizeRole(employeeLeaveRoles), getLeaveRequests(pool));
    router.post('/hr/leave', authenticateToken, authorizeRole(employeeLeaveRoles), validateRequest(createLeaveRequestSchema), createLeaveRequest(pool));
    router.put('/hr/leave/:id/status', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_LEAVE'), validateRequest(updateLeaveStatusSchema), updateLeaveStatus(pool));

    router.get('/hr/productivity', authenticateToken, authorizeRole(['HR', 'Admin']), getProductivityReport(pool));

    // ─── Payroll, Deductions & Penalties ──────────────────────────────────────
    router.get('/payroll/employees', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), auditRead(auditService, { resourceTable: 'employee_profiles' }), getPayrollEmployees(pool));
    router.get('/payroll/overview', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), auditRead(auditService, { resourceTable: 'payroll_periods' }), getPayrollOverview(pool));
    router.get('/payroll/periods', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), auditRead(auditService, { resourceTable: 'payroll_periods' }), getPayrollPeriods(pool));
    router.post('/payroll/periods', authenticateToken, hasPermission(pool, 'MANAGE_PAYROLL_PERIODS'), validateRequest(createPayrollPeriodSchema), createPayrollPeriod(pool));
    router.put('/payroll/periods/:periodId/status', authenticateToken, hasPermission(pool, 'MANAGE_PAYROLL_PERIODS'), validateRequest(cancelPayrollPeriodSchema), cancelPayrollPeriod(pool));

    router.get('/payroll/compensation', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), auditRead(auditService, { resourceTable: 'employee_compensation_profiles' }), getCompensationProfiles(pool));
    router.post('/payroll/compensation', authenticateToken, hasPermission(pool, 'MANAGE_EMPLOYEE_COMPENSATION'), validateRequest(createCompensationProfileSchema), createCompensationProfile(pool));
    router.put('/payroll/compensation/:profileId', authenticateToken, hasPermission(pool, 'MANAGE_EMPLOYEE_COMPENSATION'), validateRequest(updateCompensationProfileSchema), updateCompensationProfile(pool));

    router.get('/payroll/rules', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), auditRead(auditService, { resourceTable: 'payroll_rules' }), getPayrollRules(pool));
    router.post('/payroll/rules', authenticateToken, hasPermission(pool, 'MANAGE_PAYROLL_RULES'), validateRequest(createPayrollRuleSchema), createPayrollRule(pool));
    router.put('/payroll/rules/:ruleId/status', authenticateToken, hasPermission(pool, 'APPROVE_PAYROLL'), validateRequest(updatePayrollRuleStatusSchema), updatePayrollRuleStatus(pool));

    router.get('/payroll/deductions', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), auditRead(auditService, { resourceTable: 'employee_deductions' }), getDeductions(pool));
    router.post('/payroll/deductions', authenticateToken, hasPermission(pool, 'MANAGE_DEDUCTIONS'), validateRequest(createDeductionSchema), createDeduction(pool));
    router.put('/payroll/deductions/:deductionId/status', authenticateToken, hasPermission(pool, 'APPROVE_PAYROLL'), validateRequest(updateDeductionStatusSchema), updateDeductionStatus(pool));

    router.get('/payroll/penalties', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), auditRead(auditService, { resourceTable: 'employee_penalties' }), getPenalties(pool));
    router.post('/payroll/penalties', authenticateToken, hasPermission(pool, 'MANAGE_PENALTIES'), validateRequest(createPenaltySchema), createPenalty(pool));
    router.put('/payroll/penalties/:penaltyId/status', authenticateToken, hasPermission(pool, 'APPROVE_PAYROLL'), validateRequest(updatePenaltyStatusSchema), updatePenaltyStatus(pool));

    router.get('/payroll/periods/:periodId/run', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), auditRead(auditService, { resourceTable: 'payroll_runs', resourceIdParam: 'periodId' }), getPayrollRun(pool));
    router.post('/payroll/runs/calculate', authenticateToken, hasPermission(pool, 'CALCULATE_PAYROLL'), validateRequest(calculatePayrollSchema), calculatePayroll(pool));
    router.put(
        '/payroll/runs/:runId/status',
        authenticateToken,
        validateRequest(updatePayrollRunStatusSchema),
        (req, res, next) => {
            const permissionByStatus = {
                Reviewed: 'REVIEW_PAYROLL',
                Approved: 'APPROVE_PAYROLL',
                Paid: 'PAY_PAYROLL',
                Locked: 'LOCK_PAYROLL',
                Cancelled: 'MANAGE_PAYROLL_PERIODS'
            };
            return hasPermission(pool, permissionByStatus[req.body.status])(req, res, next);
        },
        updatePayrollRunStatus(pool)
    );

    return router;
};
