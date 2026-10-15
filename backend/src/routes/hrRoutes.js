const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { strictLimiter } = require('../middleware/rateLimiter');
const { isGlobalReviewer } = require('../services/staffSupervisorService');
const supervisorController = require('../controllers/staffSupervisorController');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const checkFeature = require('../middleware/checkFeature');

/** Every path prefix owned by this router; see the gate note below. */
const HR_PATHS = ['/hr', '/payroll', '/staff', '/exam-types'];
const { createUserSchema, updateUserSchema } = require('../schemas/userSchema');
const {
    createExamTypeSchema,
    updateExamTypeSchema,
    getExamTypesQuerySchema
} = require('../schemas/examTypeSchema');
const {
    updateProfileSchema: updateHrProfileSchema,
    createShiftSchema,
    updateShiftSchema,
    clockInSchema,
    clockOutSchema,
    updateAttendanceSchema,
    manualAttendanceSchema,
    updateAttendanceSettingsSchema,
    createAttendancePermissionSchema,
    updateAttendancePermissionStatusSchema,
    createLeaveRequestSchema,
    updateLeaveStatusSchema,
    updateLeaveBalanceSchema,
    createStaffCredentialSchema,
    updateStaffCredentialSchema,
    createShiftRequestSchema,
    updateShiftRequestStatusSchema,
    createStaffEvaluationSchema,
    breakStartSchema, breakEndSchema,
    shiftTemplateSchema, updateShiftTemplateSchema
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
    acknowledgePenaltySchema,
    resolvePenaltyDisputeSchema,
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
    updateShift,
    deleteShift,
    getShiftRequests,
    createShiftRequest,
    updateShiftRequestStatus,
    getAttendance,
    clockIn,
    clockOut,
    breakStart,
    breakEnd,
    updateAttendance,
    recordManualAttendance,
    getAttendanceSettings,
    updateAttendanceSettings,
    getAttendanceAuditLedger,
    getAttendancePermissions,
    createAttendancePermission,
    updateAttendancePermissionStatus,
    getLeaveRequests,
    createLeaveRequest,
    updateLeaveStatus,
    getLeaveBalances,
    upsertLeaveBalance,
    getStaffCredentials,
    createStaffCredential,
    updateStaffCredential,
    deleteStaffCredential,
    getStaffEvaluations,
    createStaffEvaluation,
    getProductivityReport,
    getLiveAttendanceSummary,
    getAttendancePayrollExport,
    getShiftTemplates,
    createShiftTemplate,
    updateShiftTemplate,
    deleteShiftTemplate,
    generateShiftsFromTemplates
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
    getMyPayrollPenalties,
    createPenalty,
    updatePenaltyStatus,
    acknowledgePenalty,
    resolvePenaltyDispute,
    getPayrollRun,
    calculatePayroll,
    updatePayrollRunStatus
} = require('../controllers/payrollController');

const employeeLeaveRoles = ['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'];
const employeeAttendanceRoles = ['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'];

module.exports = function hrRoutes(pool, auditService) {
    const router = express.Router();

    // Gated by explicit path prefix — see the note in financeRoutes.js. The
    // coverage invariant is enforced by tests/feature-gate-mounting.test.js.
    router.use(HR_PATHS, checkFeature('hr'));

    const managerPermissionOrSupervisor = (permission) => (req, res, next) =>
        isGlobalReviewer(req.user) ? hasPermission(pool, permission)(req, res, next) : next();

    router.get('/hr/supervision/assignments', authenticateToken, authorizeRole(employeeAttendanceRoles), supervisorController.listAssignments(pool));
    router.post('/hr/supervision/assignments', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_STAFF'), supervisorController.createAssignment(pool));
    router.put('/hr/supervision/assignments/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_STAFF'), supervisorController.updateAssignment(pool));
    router.delete('/hr/supervision/assignments/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_STAFF'), supervisorController.revokeAssignment(pool));
    router.get('/hr/supervision/inbox', authenticateToken, authorizeRole(employeeAttendanceRoles), supervisorController.getInbox(pool));
    router.get('/hr/supervision/recommendations', authenticateToken, authorizeRole(employeeAttendanceRoles), supervisorController.listRecommendations(pool));
    router.post('/hr/supervision/recommendations', authenticateToken, authorizeRole(employeeAttendanceRoles), supervisorController.createRecommendation(pool));
    router.put('/hr/supervision/recommendations/:id/status', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'APPROVE_PAYROLL'), supervisorController.reviewRecommendation(pool));

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

    // Shift Requests (Swap, Modification, Drop)
    router.get('/hr/shifts/requests', authenticateToken, authorizeRole(employeeAttendanceRoles), getShiftRequests(pool));
    router.post('/hr/shifts/requests', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(createShiftRequestSchema), createShiftRequest(pool));
    router.put('/hr/shifts/requests/:id/status', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(updateShiftRequestStatusSchema), updateShiftRequestStatus(pool));

    // Staff Shifts
    router.get('/hr/shifts', authenticateToken, authorizeRole(employeeAttendanceRoles), getShifts(pool));
    router.post('/hr/shifts', authenticateToken, authorizeRole(employeeAttendanceRoles), managerPermissionOrSupervisor('MANAGE_SHIFTS'), validateRequest(createShiftSchema), createShift(pool));
    router.put('/hr/shifts/:id', authenticateToken, authorizeRole(employeeAttendanceRoles), managerPermissionOrSupervisor('MANAGE_SHIFTS'), validateRequest(updateShiftSchema), updateShift(pool));
    router.delete('/hr/shifts/:id', authenticateToken, authorizeRole(employeeAttendanceRoles), managerPermissionOrSupervisor('MANAGE_SHIFTS'), deleteShift(pool));

    // Shift Templates
    router.get('/hr/shifts/templates', authenticateToken, authorizeRole(employeeAttendanceRoles), getShiftTemplates(pool));
    router.post('/hr/shifts/templates', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_SHIFTS'), validateRequest(shiftTemplateSchema), createShiftTemplate(pool));
    router.put('/hr/shifts/templates/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_SHIFTS'), validateRequest(updateShiftTemplateSchema), updateShiftTemplate(pool));
    router.delete('/hr/shifts/templates/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_SHIFTS'), deleteShiftTemplate(pool));
    router.post('/hr/shifts/templates/generate', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_SHIFTS'), generateShiftsFromTemplates(pool));

    // Attendance, Settings, Ledger & Permissions
    router.get('/hr/attendance', authenticateToken, authorizeRole(employeeAttendanceRoles), auditRead(auditService, { resourceTable: 'attendance_logs' }), getAttendance(pool));
    router.post('/hr/attendance/clock-in', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(clockInSchema), clockIn(pool));
    router.post('/hr/attendance/clock-out', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(clockOutSchema), clockOut(pool));
    router.post('/hr/attendance/break-start', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(breakStartSchema), breakStart(pool));
    router.post('/hr/attendance/break-end', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(breakEndSchema), breakEnd(pool));
    router.put('/hr/attendance/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_ATTENDANCE'), validateRequest(updateAttendanceSchema), updateAttendance(pool));
    router.post('/hr/attendance/manual', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_ATTENDANCE'), validateRequest(manualAttendanceSchema), recordManualAttendance(pool));
    router.get('/hr/attendance/settings', authenticateToken, authorizeRole(['HR', 'Admin']), getAttendanceSettings(pool));
    router.put('/hr/attendance/settings', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_ATTENDANCE'), validateRequest(updateAttendanceSettingsSchema), updateAttendanceSettings(pool));
    router.get('/hr/attendance/audit-ledger', authenticateToken, authorizeRole(['HR', 'Admin']), getAttendanceAuditLedger(pool));
    router.get('/hr/attendance/permissions', authenticateToken, authorizeRole(employeeAttendanceRoles), getAttendancePermissions(pool));
    router.get('/hr/attendance-permissions', authenticateToken, authorizeRole(employeeAttendanceRoles), getAttendancePermissions(pool));
    router.post('/hr/attendance/permissions', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(createAttendancePermissionSchema), createAttendancePermission(pool));
    router.post('/hr/attendance-permissions', authenticateToken, authorizeRole(employeeAttendanceRoles), validateRequest(createAttendancePermissionSchema), createAttendancePermission(pool));
    router.put('/hr/attendance/permissions/:id/status', authenticateToken, authorizeRole(employeeAttendanceRoles), managerPermissionOrSupervisor('MANAGE_ATTENDANCE'), validateRequest(updateAttendancePermissionStatusSchema), updateAttendancePermissionStatus(pool));
    router.put('/hr/attendance-permissions/:id/status', authenticateToken, authorizeRole(employeeAttendanceRoles), managerPermissionOrSupervisor('MANAGE_ATTENDANCE'), validateRequest(updateAttendancePermissionStatusSchema), updateAttendancePermissionStatus(pool));
    router.get('/hr/attendance/live-summary', authenticateToken, authorizeRole(employeeAttendanceRoles), getLiveAttendanceSummary(pool));
    router.get('/hr/attendance/export', authenticateToken, authorizeRole(['HR', 'Admin']), getAttendancePayrollExport(pool));

    // Leaves & Leave Balances
    router.get('/hr/leave', authenticateToken, authorizeRole(employeeLeaveRoles), getLeaveRequests(pool));
    router.post('/hr/leave', authenticateToken, authorizeRole(employeeLeaveRoles), validateRequest(createLeaveRequestSchema), createLeaveRequest(pool));
    router.put('/hr/leave/:id/status', authenticateToken, authorizeRole(employeeLeaveRoles), managerPermissionOrSupervisor('MANAGE_LEAVE'), validateRequest(updateLeaveStatusSchema), updateLeaveStatus(pool));
    router.get('/hr/leaves/balances', authenticateToken, authorizeRole(employeeLeaveRoles), getLeaveBalances(pool));
    router.put('/hr/leaves/balances/:userId', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_LEAVE'), validateRequest(updateLeaveBalanceSchema), upsertLeaveBalance(pool));

    // Staff Credentials & Performance Evaluations
    router.get('/staff/:staffId/credentials', authenticateToken, authorizeRole(employeeAttendanceRoles), getStaffCredentials(pool));
    router.post('/staff/:staffId/credentials', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_STAFF'), validateRequest(createStaffCredentialSchema), createStaffCredential(pool));
    router.put('/staff/:staffId/credentials/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_STAFF'), validateRequest(updateStaffCredentialSchema), updateStaffCredential(pool));
    router.delete('/staff/:staffId/credentials/:id', authenticateToken, authorizeRole(['HR', 'Admin']), hasPermission(pool, 'MANAGE_STAFF'), deleteStaffCredential(pool));

    router.get('/staff/:staffId/evaluations', authenticateToken, authorizeRole(employeeAttendanceRoles), getStaffEvaluations(pool));
    router.post('/staff/:staffId/evaluations', authenticateToken, authorizeRole(['HR', 'Admin']), validateRequest(createStaffEvaluationSchema), createStaffEvaluation(pool));

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
    router.get('/payroll/my/penalties', authenticateToken, getMyPayrollPenalties(pool));
    router.post('/payroll/penalties', authenticateToken, hasPermission(pool, 'MANAGE_PENALTIES'), validateRequest(createPenaltySchema), createPenalty(pool));
    router.put('/payroll/penalties/:penaltyId/status', authenticateToken, hasPermission(pool, 'APPROVE_PAYROLL'), validateRequest(updatePenaltyStatusSchema), updatePenaltyStatus(pool));
    router.put('/payroll/penalties/:penaltyId/acknowledgement', authenticateToken, validateRequest(acknowledgePenaltySchema), acknowledgePenalty(pool));
    router.put('/payroll/penalties/:penaltyId/dispute-resolution', authenticateToken, hasPermission(pool, 'APPROVE_PAYROLL'), validateRequest(resolvePenaltyDisputeSchema), resolvePenaltyDispute(pool));

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
