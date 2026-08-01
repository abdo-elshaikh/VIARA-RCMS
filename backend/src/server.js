// Load environment variables first
const path = require('path');
const dotenvPath = path.resolve(__dirname, '../.env');
const result = require('dotenv').config({ path: dotenvPath });

if (result.error) {
    console.error('❌ DOTENV Error:', result.error);
    process.exit(1);
}

// Validate environment variables before proceeding
const validateEnv = require('./config/validateEnv');
try {
    validateEnv();
} catch (error) {
    console.error('\n❌ Environment Validation Failed:\n');
    console.error(error.message);
    console.error('\nPlease check your .env file in the backend directory.\n');
    process.exit(1);
}

const express = require('express');
const helmet = require('helmet');
const {
    patientDataLimiter, invoiceLimiter, sensitiveOpLimiter, notificationLimiter, publicCaseStatusLimiter
} = require('./middleware/rateLimiters');

const { Pool } = require('pg');
const cors = require('cors');

// Middlewares
const auditLogger = require('./middleware/auditLogger');
const auditRead = require('./middleware/auditRead');
const { authenticateToken, authorizeRole, configureAuthDatabase } = require('./middleware/authMiddleware');
const { authLimiter, apiLimiter, strictLimiter } = require('./middleware/rateLimiter');
const sanitizeInput = require('./middleware/sanitize');
const { validateRequest, validateQuery } = require('./middleware/validateRequest');
const { tracingMiddleware } = require('./middleware/tracing');
const { errorHandler, notFoundHandler, AppError } = require('./middleware/errorHandler');
const logger = require('./config/logger');
const AuditService = require('./services/auditService');

// Routes
const auditRoutes = require('./routes/auditRoutes');
const rbacRoutes = require('./routes/rbacRoutes');
const privacyRoutes = require('./routes/privacyRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const documentRoutes = require('./routes/documentRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const backupRoutes = require('./routes/backupRoutes');
const systemRoutes = require('./routes/systemRoutes');
const safetyRoutes = require('./routes/safetyRoutes');
const importRoutes = require('./routes/importRoutes');
const pacsRoutes = require('./routes/pacsRoutes');
const v1Router = require('./routes/v1');
const reportController = require('./controllers/reportController');
const tokenController = require('./controllers/tokenController');

// Background Workers
const { startIntegrationWorker } = require('./jobs/integrationWorker');
const { scheduleDataRetentionJobs } = require('./jobs/dataRetentionJob');
const { startPacsMwlJob } = require('./jobs/pacsMwlJob');
const { startPacsTieringJob } = require('./jobs/pacsTieringJob');
const { startPacsAiAnalysisJob } = require('./jobs/pacsAiAnalysisJob');
const { startAuditDetectionJob } = require('./jobs/auditDetectionJob');
const { syncRegisteredModalitiesToOrthanc } = require('./services/pacsModalityRegistryService');

// RBAC Cache Initialization
const { refreshPermissionCache, hasPermission, hasAnyPermission } = require('./middleware/rbacMiddleware');

// Validation Schemas
const {
    createPatientSchema,
    getPatientsQuerySchema,
    getDuplicatePatientsQuerySchema,
    mergePatientsSchema
} = require('./schemas/patientSchema');
const {
    createReferringDoctorSchema,
    updateReferringDoctorSchema,
    getReferringDoctorsQuerySchema
} = require('./schemas/referringDoctorSchema');
const {
    createAppointmentSchema,
    updateAppointmentSchema,
    getAppointmentsQuerySchema,
    availabilityQuerySchema,
    noShowAppointmentSchema,
    rescheduleAppointmentSchema,
    createWaitingListSchema,
    updateWaitingListSchema,
    getWaitingListQuerySchema
} = require('./schemas/appointmentSchema');
const { loginSchema, createUserSchema, updateUserSchema, enable2FASchema, verify2FASchema } = require('./schemas/userSchema');
const { updateProfileSchema, changePasswordSchema, profilePreferencesSchema } = require('./schemas/profileSchema');
const { updateExamReportSchema, getWorklistQuerySchema, improveReportSchema, generatePreliminaryReportSchema, markAiReportDraftAppliedSchema } = require('./schemas/examSchema');
const { getQueueQuerySchema, transitionQueueSchema } = require('./schemas/queueSchema');
const { createExamTypeSchema, updateExamTypeSchema, getExamTypesQuerySchema } = require('./schemas/examTypeSchema');
const {
    createInvoiceSchema,
    updateInvoiceSchema,
    getInvoicesQuerySchema,
    collectPaymentSchema,
    refundSchema,
    getRefundsQuerySchema,
    reviewRefundSchema
} = require('./schemas/invoiceSchema');
const {
    requestPartialPaymentExceptionSchema,
    reviewPartialPaymentExceptionSchema,
    getPartialPaymentExceptionsQuerySchema
} = require('./schemas/partialPaymentExceptionSchema');
const {
    openShiftSchema,
    closeShiftSchema,
    reviewClosureSchema,
    reconciliationQuerySchema
} = require('./schemas/cashierSchema');
const {
    providerSchema,
    contractSchema,
    policySchema,
    coverageRuleSchema,
    approvalSchema,
    updateApprovalStatusSchema,
    coverageQuerySchema
} = require('./schemas/insuranceSchema');
const {
    createClaimSchema,
    updateClaimStatusSchema,
    getClaimsQuerySchema
} = require('./schemas/claimSchema');
const {
    reportTemplateSchema,
    updateReportTemplateSchema,
    getReportTemplatesQuerySchema,
    amendReportSchema
} = require('./schemas/reportTemplateSchema');
const { deliverResultSchema } = require('./schemas/resultDeliverySchema');
const {
    appointmentRequestSchema,
    profileUpdateRequestSchema,
    reviewAppointmentRequestSchema,
    reviewProfileUpdateRequestSchema
} = require('./schemas/portalSchema');
const {
    doctorLoginSchema,
    setPortalPasswordSchema,
    doctorOrderSchema,
    doctorMessageSchema
} = require('./schemas/doctorPortalSchema');
const {
    getNotificationsQuerySchema,
    getNotificationJobsQuerySchema,
    notificationTemplateSchema,
    updateNotificationTemplateSchema,
    manualSendSchema,
    updatePreferencesSchema,
    notificationPreferencesQuerySchema,
    reminderSchema,
    unsubscribeSchema
} = require('./schemas/notificationSchema');
const {
    createInventoryItemSchema, updateInventoryStockSchema,
    createSupplierSchema, updateSupplierSchema,
    createPurchaseOrderSchema, updatePurchaseOrderStatusSchema, receiveStockSchema,
    consumeStockSchema, adjustStockSchema
} = require('./schemas/inventorySchema');
const {
    createMachineSchema, updateMachineSchema,
    createServiceContractSchema, updateServiceContractSchema,
    createMaintenanceSchema, updateMaintenanceSchema,
    createDowntimeSchema, updateDowntimeSchema
} = require('./schemas/equipmentSchema');
const {
    createExpenseCategorySchema, updateExpenseCategorySchema,
    createExpenseSchema, updateExpenseSchema, getExpensesQuerySchema, reverseExpenseSchema, payCommissionSchema,
    createClosureSchema, finalizeClosureSchema, getFinancialClosuresQuerySchema,
    financialReportQuerySchema, journalLedgerQuerySchema
} = require('./schemas/financeSchema');
const {
    updateProfileSchema: updateHrProfileSchema,
    createShiftSchema, updateShiftSchema,
    clockInSchema, clockOutSchema,
    createLeaveRequestSchema, updateLeaveStatusSchema
} = require('./schemas/hrSchema');
const {
    createPayrollPeriodSchema,
    createCompensationProfileSchema,
    createPayrollRuleSchema,
    updatePayrollRuleStatusSchema,
    createDeductionSchema,
    updateDeductionStatusSchema,
    createPenaltySchema,
    updatePenaltyStatusSchema,
    calculatePayrollSchema,
    updatePayrollRunStatusSchema,
    payrollQuerySchema
} = require('./schemas/payrollSchema');
const {
    createCrmActivitySchema, updateCrmActivitySchema,
    createSegmentSchema, addSegmentMemberSchema,
    createCampaignSchema, updateCampaignStatusSchema,
    submitFeedbackSchema, updateLoyaltySchema
} = require('./schemas/crmSchema');

// Controllers
const {
    createPatient,
    getPatients,
    updatePatient,
    deletePatient,
    getDuplicatePatients,
    mergePatients,
    generatePortalPassword
} = require('./controllers/patientController');
const { login, register, refresh, logout, setup2FA, enable2FA, verify2FA } = require('./controllers/authController');
const {
    createMachine, getMachines, getMachineById, updateMachine, deleteMachine,
    getServiceContracts, createServiceContract, updateServiceContract,
    getMaintenanceRecords, createMaintenance, updateMaintenance,
    getDowntimeRecords, createDowntime, updateDowntime, getUtilizationReport
} = require('./controllers/machineController');
const {
    createAppointment,
    getAppointments,
    getAppointmentById,
    updateAppointment,
    cancelAppointment,
    markNoShow,
    rescheduleAppointment,
    getAvailability,
    getOrderTimeline
} = require('./controllers/appointmentController');
const {
    getWaitingList,
    createWaitingListEntry,
    updateWaitingListEntry
} = require('./controllers/waitingListController');
const {
    getReferringDoctors,
    createReferringDoctor,
    updateReferringDoctor,
    deleteReferringDoctor,
    getReferringDoctorStats
} = require('./controllers/referringDoctorController');
const {
    getRevenueReport, getOutstandingClaims, getDoctorCommissions,
    getReceivablesAging, getTaxSummary, getProfitAndLoss,
    getProfitAndLossSeries, getCashFlowSeries, getDiscountReport,
    getTrialBalance, getJournalLedger
} = require('./controllers/reportController');
const {
    getExpenseCategories, createExpenseCategory, updateExpenseCategory,
    getExpenses, createExpense, updateExpense, deleteExpense,
    getCommissionPayables, payCommission,
    getFinancialClosures, createFinancialClosure, finalizeFinancialClosure
} = require('./controllers/financeController');
const {
    getEmployeeProfiles, updateEmployeeProfile,
    getShifts, createShift, deleteShift,
    getAttendance, clockIn, clockOut,
    getLeaveRequests, createLeaveRequest, updateLeaveStatus,
    getProductivityReport
} = require('./controllers/hrController');
const {
    getPayrollOverview,
    getPayrollPeriods,
    createPayrollPeriod,
    getCompensationProfiles,
    createCompensationProfile,
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
} = require('./controllers/payrollController');
const {
    getCrmActivities, createCrmActivity, updateCrmActivity,
    getSegments, createSegment, addSegmentMember,
    getCampaigns, createCampaign, updateCampaignStatus,
    submitFeedback, getFeedback, updateLoyaltyPoints
} = require('./controllers/crmController');
const {
    createInvoice,
    getInvoices,
    getInvoiceById,
    updateInvoice,
    collectPayment,
    refundInvoice,
    getRefunds,
    reviewRefund,
    getInvoicePdf
} = require('./controllers/invoiceController');
const {
    openShift,
    closeShift,
    getReconciliation,
    reviewCashierClosure
} = require('./controllers/cashierController');
const {
    getPartialPaymentExceptions,
    requestPartialPaymentException,
    reviewPartialPaymentException
} = require('./controllers/partialPaymentExceptionController');
const {
    getProviders,
    createProvider,
    getContracts,
    createContract,
    getPolicies,
    createPolicy,
    getCoverageRules,
    createCoverageRule,
    previewCoverage,
    getApprovals,
    createApproval,
    updateApprovalStatus
} = require('./controllers/insuranceController');
const {
    getClaims,
    createClaim,
    updateClaimStatus
} = require('./controllers/claimsController');
const { getWorklist, getCaseReports, lookupCaseReport, getExamById, updateReport, getReportPdf, amendReport, improveReportFormat, listAiReportDrafts, generatePreliminaryReportDraft, markAiReportDraftApplied } = require('./controllers/examController');
const {
    getTemplates: getReportTemplates,
    createTemplate: createReportTemplate,
    updateTemplate: updateReportTemplate,
    deleteTemplate: deleteReportTemplate
} = require('./controllers/templateController');
const {
    deliverResult,
    getDeliveryHistory
} = require('./controllers/resultDeliveryController');
const { getQueue, transitionQueue } = require('./controllers/queueController');
const { getExamTypes, createExamType, updateExamType, deleteExamType } = require('./controllers/examTypeController');
const { getAllStaff, createStaff, updateStaff, deleteStaff } = require('./controllers/staffController');
const { getInventory, addItem, updateStock, consumeStock, adjustStock, getStockMovements, getExpiryAlerts } = require('./controllers/inventoryController');
const { getSuppliers, getSupplierById, createSupplier, updateSupplier } = require('./controllers/supplierController');
const { getPurchaseOrders, getPurchaseOrderById, createPurchaseOrder, updatePurchaseOrderStatus, receiveStock } = require('./controllers/purchaseOrderController');
const {
    patientLogin,
    getMyRecords,
    getMyInvoices,
    getMyDocuments,
    downloadMyDocument,
    getMyAppointmentRequests,
    createAppointmentRequest,
    createProfileUpdateRequest,
    getPendingPortalReviewRequests,
    reviewPortalAppointmentRequest,
    reviewPortalProfileUpdateRequest,
    getMyProfile,
    getMyNotifications: getMyPortalNotifications,
    getMyNotificationUnreadCount: getMyPortalNotificationUnreadCount,
    markMyNotificationRead: markMyPortalNotificationRead,
    markAllMyNotificationsRead: markAllMyPortalNotificationsRead
} = require('./controllers/portalController');
const {
    doctorLogin,
    setPortalPassword,
    getDoctorCases,
    getDoctorReport,
    getDoctorReportPdf,
    createDoctorOrder,
    getMessages: getDoctorMessages,
    sendMessage: sendDoctorMessage,
    getUnreadMessageCount,
    getMyNotifications: getDoctorNotifications,
    getMyNotificationUnreadCount: getDoctorNotificationUnreadCount,
    markMyNotificationRead: markDoctorNotificationRead,
    markAllMyNotificationsRead: markAllDoctorNotificationsRead
} = require('./controllers/doctorPortalController');
const {
    getNotifications, getUnreadCount, markAllRead, markNotificationRead,
    getTemplates: getNotifTemplates,
    createTemplate: createNotifTemplate,
    updateTemplate: updateNotifTemplate,
    deleteTemplate: deleteNotifTemplate,
    getJobs, retryJob, triggerProcessJobs,
    sendManual, sendReminder, unsubscribe,
    getPreferences: getNotificationPreferences,
    updatePreferences: updateNotificationPreferences,
    handleTwilioWebhook
} = require('./controllers/notificationController');
const { startPolling, stopPolling } = require('./services/notificationJobService');
const { startInventoryAlertPolling, stopInventoryAlertPolling } = require('./services/inventoryAlertService');
const { startBackupScheduler, stopBackupScheduler } = require('./services/backupScheduler');
const { createServerLifecycle } = require('./services/serverLifecycle');

const { getDashboardStats } = require('./controllers/dashboardController');
const { getPublicLandingOverview, lookupPublicCaseStatus } = require('./controllers/publicLandingController');
const {
    getProfile, updateProfile, changePassword,
    getPreferences: getProfilePreferences,
    updatePreferences: updateProfilePreferences,
    getSessions: getProfileSessions,
    revokeSession: revokeProfileSession,
    exportPersonalData
} = require('./controllers/profileController');
const { getMyAuditLogs } = require('./controllers/auditController');

// Realtime Chat & Communications
const realtimeService = require('./services/realtimeService');
const {
    getChatUsers,
    getChatMessages,
    sendChatMessage,
    getUnreadSummary,
    getPatientConversations,
    getPatientMessageHistory,
    replyToPatient,
    getDoctorConversations,
    getDoctorMessageHistory,
    replyToDoctor
} = require('./controllers/chatController');
const {
    getMyMessages,
    sendPortalMessage
} = require('./controllers/portalChatController');
const {
    chatAttachmentUpload,
    validateChatAttachments,
    serveChatAttachment
} = require('./utils/chatAttachmentUpload');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Database Connection
const connectionString = process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms';

const pool = new Pool({
    connectionString,
    min: 5,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000,
    query_timeout: 30000
});
configureAuthDatabase(pool);

const lifecycle = createServerLifecycle({
    pool,
    logger,
    shutdownTimeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS || 30000)
});

const auditService = new AuditService(pool);

// Test database connection
if (process.env.NODE_ENV !== 'test') {
    pool.connect((err, client, release) => {
        if (err) {
            logger.error('❌ Error acquiring client from database pool:', err.stack);
            process.exit(1);
        }

        logger.info('✅ Successfully connected to PostgreSQL Database');

        // Initialize global settings cache
        const settingsService = require('./services/settingsService');
        settingsService.initDb(pool).catch(err => {
            logger.error('Failed to initialize settingsService:', err);
        });

        // Initialize RBAC Cache
        refreshPermissionCache(pool).then(() => {
            logger.info('✅ RBAC permissions cache initialized');
        });

        release();
    });
}

// Global Middleware
app.use(tracingMiddleware);
app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        logger.info('HTTP_REQUEST', {
            requestId: req.id,
            method: req.method,
            path: req.originalUrl.split('?')[0],
            statusCode: res.statusCode,
            durationMs: Number(durationMs.toFixed(2)),
            userId: req.user?.user_id || req.user?.userId || null
        });
    });
    next();
});
app.use(helmet());

const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3005',
    'http://127.0.0.1:3005',
];
const DEV_ALLOWED_PORTS = new Set(['5173', '5174', '3005']);

const normalizeOrigin = (value) => {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
        return new URL(trimmed).origin;
    } catch (_) {
        return trimmed.replace(/\/+$/, '');
    }
};

const parseOriginList = (value) => String(value || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

const getAllowedOrigins = () => new Set([
    ...(process.env.NODE_ENV === 'production' ? [] : DEFAULT_ALLOWED_ORIGINS.map(normalizeOrigin)),
    ...(process.env.NODE_ENV === 'production' ? [] : parseOriginList(process.env.CLIENT_URL)),
    ...(process.env.NODE_ENV === 'production' ? [] : parseOriginList(process.env.PORTAL_CLIENT_URL)),
    ...(process.env.NODE_ENV === 'production' ? [] : parseOriginList(process.env.OHIF_CLIENT_URL)),
    ...parseOriginList(process.env.ALLOWED_ORIGINS),
    ...(process.env.NODE_ENV === 'production' ? [] : parseOriginList('http://localhost:5175')),
].filter(Boolean));

const isDevOriginAllowed = (origin) => {
    if (process.env.NODE_ENV === 'production') return false;
    try {
        const url = new URL(origin);
        return ['http:', 'https:'].includes(url.protocol) && DEV_ALLOWED_PORTS.has(url.port);
    } catch (_) {
        return false;
    }
};

// CORS Configuration (Restrictive in production, ergonomic for local portal development)
app.use(cors({
    origin: (origin, callback) => {
        const normalizedOrigin = normalizeOrigin(origin);
        const allowedOrigins = getAllowedOrigins();

        if (!normalizedOrigin || allowedOrigins.has(normalizedOrigin) || isDevOriginAllowed(normalizedOrigin)) {
            callback(null, true);
            return;
        }

        logger.warn('CORS origin rejected', {
            origin: normalizedOrigin,
            allowedOrigins: Array.from(allowedOrigins),
            path: 'global-cors',
        });
        callback(new AppError(`Not allowed by CORS: ${normalizedOrigin}`, 403));
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

const DEFAULT_REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
const PACS_UPLOAD_TIMEOUT_MS = Number(process.env.PACS_UPLOAD_TIMEOUT_MS || 10 * 60 * 1000);
const DICOMWEB_TIMEOUT_MS = Number(process.env.DICOMWEB_TIMEOUT_MS || 5 * 60 * 1000);
const AI_REPORT_TIMEOUT_MS = Number(process.env.AI_REPORT_TIMEOUT_MS || 2 * 60 * 1000);

const getRequestTimeoutMs = (req) => {
    if (req.method === 'POST' && /^\/api\/pacs\/exams\/[^/]+\/images(?:\/)?$/.test(req.path)) {
        return PACS_UPLOAD_TIMEOUT_MS;
    }
    if (/^\/api\/pacs\/(?:dicom-web|wado)(?:\/|$)/.test(req.path)) {
        return DICOMWEB_TIMEOUT_MS;
    }
    if (
        /^\/api\/exams\/[^/]+\/ai-preliminary-draft(?:\/)?$/.test(req.path)
        || /^\/api\/exams\/report\/improve-format(?:\/)?$/.test(req.path)
        || /^\/api\/settings\/ai\/test(?:\/)?$/.test(req.path)
    ) {
        return AI_REPORT_TIMEOUT_MS;
    }
    return DEFAULT_REQUEST_TIMEOUT_MS;
};

// Global Request Timeout Protection
app.use((req, res, next) => {
    const timeoutMs = getRequestTimeoutMs(req);
    let timeoutHandled = false;
    const handleTimeout = (message, statusCode) => {
        if (timeoutHandled || res.headersSent || res.writableEnded) return;
        timeoutHandled = true;
        req.requestTimedOut = true;
        const err = new Error(message);
        err.statusCode = statusCode;
        next(err);
    };
    req.setTimeout(timeoutMs, () => {
        handleTimeout('Request Timeout', 408);
    });
    res.setTimeout(timeoutMs, () => {
        handleTimeout('Service Unavailable (Timeout)', 503);
    });
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Input Sanitization to prevent XSS globally
app.use(sanitizeInput);

// Apply general API rate limiting (excluding health check)
app.use('/api', apiLimiter);

// Audit logging for all state-changing methods
app.use(auditLogger(auditService));

// --- ROUTES ---

// V1 API Router
app.use('/api/v1', v1Router(pool, authenticateToken, authorizeRole));

app.get('/health/live', (req, res) => {
    res.json({ status: 'OK' });
});

const readinessHandler = async (req, res) => {
    if (!lifecycle.isReady() && process.env.NODE_ENV !== 'test') {
        return res.status(503).json({ status: 'NOT_READY' });
    }

    try {
        await pool.query('SELECT 1');
        return res.json({ status: 'OK' });
    } catch (error) {
        return res.status(503).json({ status: 'NOT_READY' });
    }
};

app.get('/health', readinessHandler);
app.get('/health/ready', readinessHandler);

// Auth Routes (Public) - with rate limiting and validation
app.post('/api/auth/login',
    authLimiter,
    validateRequest(loginSchema),
    login(pool)
);

app.post('/api/auth/refresh', refresh(pool));
app.post('/api/auth/logout', logout(pool));

// 2FA Routes (Protected & Public)
app.post('/api/auth/setup-2fa', authenticateToken, setup2FA(pool));
app.post('/api/auth/enable-2fa', authenticateToken, validateRequest(enable2FASchema), enable2FA(pool));
app.post('/api/auth/verify-2fa', authLimiter, validateRequest(verify2FASchema), verify2FA(pool));

app.post('/api/portal/login',
    authLimiter,
    patientLogin(pool)
);

// Doctor Portal Login (Public)
app.post('/api/doctor-portal/login',
    authLimiter,
    validateRequest(doctorLoginSchema),
    doctorLogin(pool)
);

// Public landing summary (aggregate operational data only; never patient data)
app.get('/api/public/landing-overview', getPublicLandingOverview(pool));
app.post('/api/public/case-status', publicCaseStatusLimiter, lookupPublicCaseStatus(pool));

// Auth Routes (Protected - Admin Only)
app.post('/api/auth/register',
    authenticateToken,
    authorizeRole(['Admin']),
    validateRequest(createUserSchema),
    register(pool)
);

// Dashboard Routes (Protected - All Authenticated Users)
app.get('/api/dashboard/stats',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'HR', 'Receptionist', 'Cashier', 'Radiologist', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing']),
    getDashboardStats(pool)
);

// Profile Routes
app.get('/api/profile', authenticateToken, getProfile(pool));
app.put('/api/profile', authenticateToken, validateRequest(updateProfileSchema), updateProfile(pool));
app.put('/api/profile/password', authenticateToken, validateRequest(changePasswordSchema), changePassword(pool));
app.get('/api/profile/preferences', authenticateToken, getProfilePreferences(pool));
app.put('/api/profile/preferences', authenticateToken, validateRequest(profilePreferencesSchema), updateProfilePreferences(pool));
app.get('/api/profile/audit', authenticateToken, getMyAuditLogs(pool));
app.get('/api/profile/export', authenticateToken, sensitiveOpLimiter, exportPersonalData(pool));
app.get('/api/auth/sessions', authenticateToken, getProfileSessions(pool));
app.delete('/api/auth/sessions/:id', authenticateToken, sensitiveOpLimiter, revokeProfileSession(pool));

app.get('/api/profile/tokens', authenticateToken, tokenController.getTokens(pool));
app.post('/api/profile/tokens', authenticateToken, tokenController.createToken(pool));
app.delete('/api/profile/tokens/:id', authenticateToken, tokenController.revokeToken(pool));

// Patient Routes (Protected - with validation)
app.get('/api/patients',
    authenticateToken,
    patientDataLimiter,
    authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Marketing']),
    validateQuery(getPatientsQuerySchema),
    getPatients(pool)
);

app.post('/api/patients',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateRequest(createPatientSchema),
    createPatient(pool)
);

app.post('/api/patients/:id/generate-password',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    generatePortalPassword(pool)
);

app.get('/api/patients/duplicates',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateQuery(getDuplicatePatientsQuerySchema),
    getDuplicatePatients(pool)
);

app.post('/api/patients/:id/merge',
    authenticateToken,
    authorizeRole(['Admin']),
    validateRequest(mergePatientsSchema),
    mergePatients(pool)
);

app.put('/api/patients/:id',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateRequest(require('./schemas/patientSchema').updatePatientSchema),
    updatePatient(pool, auditService)
);

app.delete('/api/patients/:id',
    sensitiveOpLimiter,
    authenticateToken,
    authorizeRole(['Admin']),
    deletePatient(pool)
);

app.get('/api/patients/:id/history',
    authenticateToken,
    patientDataLimiter,
    authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Nurse']),
    require('./controllers/patientController').getPatientHistory(pool)
);

// Machine / Equipment Routes (Protected)
app.get('/api/machines', authenticateToken, getMachines(pool));
app.get('/api/machines/utilization', authenticateToken, authorizeRole(['Admin', 'Receptionist']), getUtilizationReport(pool));
app.get('/api/machines/:id', authenticateToken, getMachineById(pool));
app.post('/api/machines', authenticateToken, hasPermission(pool, 'MANAGE_EQUIPMENT'), validateRequest(createMachineSchema), createMachine(pool));
app.put('/api/machines/:id', authenticateToken, hasPermission(pool, 'MANAGE_EQUIPMENT'), validateRequest(updateMachineSchema), updateMachine(pool));
app.delete('/api/machines/:id', authenticateToken, hasPermission(pool, 'MANAGE_EQUIPMENT'), deleteMachine(pool));

// Equipment Contracts
app.get('/api/equipment/contracts', authenticateToken, authorizeRole(['Admin']), getServiceContracts(pool));
app.post('/api/equipment/contracts', authenticateToken, authorizeRole(['Admin']), validateRequest(createServiceContractSchema), createServiceContract(pool));
app.put('/api/equipment/contracts/:id', authenticateToken, authorizeRole(['Admin']), validateRequest(updateServiceContractSchema), updateServiceContract(pool));

// Equipment Maintenance
app.get('/api/equipment/maintenance', authenticateToken, authorizeRole(['Admin', 'Technician']), getMaintenanceRecords(pool));
app.post('/api/equipment/maintenance', authenticateToken, authorizeRole(['Admin', 'Technician']), validateRequest(createMaintenanceSchema), createMaintenance(pool));
app.put('/api/equipment/maintenance/:id', authenticateToken, authorizeRole(['Admin', 'Technician']), validateRequest(updateMaintenanceSchema), updateMaintenance(pool));

// Equipment Downtime
app.get('/api/equipment/downtime', authenticateToken, authorizeRole(['Admin', 'Technician', 'Receptionist']), getDowntimeRecords(pool));
app.post('/api/equipment/downtime', authenticateToken, authorizeRole(['Admin', 'Technician', 'Receptionist']), validateRequest(createDowntimeSchema), createDowntime(pool));
app.put('/api/equipment/downtime/:id', authenticateToken, authorizeRole(['Admin', 'Technician', 'Receptionist']), validateRequest(updateDowntimeSchema), updateDowntime(pool));

// Appointment Routes (Protected - with validation)
app.get('/api/appointments',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Accountant']),
    validateQuery(getAppointmentsQuerySchema),
    getAppointments(pool)
);

app.get('/api/appointments/:id',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Accountant']),
    getAppointmentById(pool)
);

app.post('/api/appointments',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse']),
    validateRequest(createAppointmentSchema),
    createAppointment(pool)
);

app.put('/api/appointments/:id',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse']),
    validateRequest(updateAppointmentSchema),
    updateAppointment(pool)
);

app.delete('/api/appointments/:id',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    cancelAppointment(pool)
);

app.post('/api/appointments/:id/no-show',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateRequest(noShowAppointmentSchema),
    markNoShow(pool)
);

app.post('/api/appointments/:id/reschedule',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateRequest(rescheduleAppointmentSchema),
    rescheduleAppointment(pool)
);

app.get('/api/schedule/availability',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse']),
    validateQuery(availabilityQuerySchema),
    getAvailability(pool)
);

app.get('/api/orders/:id/timeline',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Accountant']),
    getOrderTimeline(pool)
);

app.get('/api/waiting-list',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateQuery(getWaitingListQuerySchema),
    getWaitingList(pool)
);

app.post('/api/waiting-list',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateRequest(createWaitingListSchema),
    createWaitingListEntry(pool)
);

app.put('/api/waiting-list/:id',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateRequest(updateWaitingListSchema),
    updateWaitingListEntry(pool)
);

// Referring Doctor Routes
app.get('/api/referring-doctors',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Accountant']),
    validateQuery(getReferringDoctorsQuerySchema),
    getReferringDoctors(pool)
);

app.post('/api/referring-doctors',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin']),
    validateRequest(createReferringDoctorSchema),
    createReferringDoctor(pool)
);

app.put('/api/referring-doctors/:id',
    authenticateToken,
    authorizeRole(['Admin']),
    validateRequest(updateReferringDoctorSchema),
    updateReferringDoctor(pool)
);

app.delete('/api/referring-doctors/:id',
    authenticateToken,
    authorizeRole(['Admin']),
    deleteReferringDoctor(pool)
);

app.get('/api/referring-doctors/:id/stats',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Receptionist']),
    getReferringDoctorStats(pool)
);

// Report Routes (Admin & Accountant)
app.get('/api/reports/revenue', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getRevenueReport(pool));
app.get('/api/reports/claims', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']), validateQuery(financialReportQuerySchema), getOutstandingClaims(pool));
app.get('/api/reports/commissions', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getDoctorCommissions(pool));
app.get('/api/reports/receivables-aging', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']), validateQuery(financialReportQuerySchema), getReceivablesAging(pool));
app.get('/api/reports/tax-summary', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getTaxSummary(pool));
app.get('/api/reports/profit-and-loss', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getProfitAndLoss(pool));
app.get('/api/reports/profit-and-loss-series', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getProfitAndLossSeries(pool));
app.get('/api/reports/cash-flow-series', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getCashFlowSeries(pool));
app.get('/api/reports/discounts', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getDiscountReport(pool));
app.get('/api/reports/trial-balance', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getTrialBalance(pool));
app.get('/api/reports/journal-ledger', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(journalLedgerQuerySchema), getJournalLedger(pool));

// Phase 15: Financial Management Routes (Expenses & Payables)
app.get('/api/finance/categories', authenticateToken, authorizeRole(['Admin', 'Accountant']), getExpenseCategories(pool));
app.post('/api/finance/categories', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateRequest(createExpenseCategorySchema), createExpenseCategory(pool));
app.put('/api/finance/categories/:id', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateRequest(updateExpenseCategorySchema), updateExpenseCategory(pool));

app.get('/api/finance/expenses', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(getExpensesQuerySchema), getExpenses(pool));
app.post('/api/finance/expenses', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateRequest(createExpenseSchema), createExpense(pool));
app.put('/api/finance/expenses/:id', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateRequest(updateExpenseSchema), updateExpense(pool));
app.delete('/api/finance/expenses/:id', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateRequest(reverseExpenseSchema), deleteExpense(pool));

app.get('/api/finance/payables', authenticateToken, authorizeRole(['Admin', 'Accountant']), getCommissionPayables(pool));
app.post('/api/finance/payables/pay', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateRequest(payCommissionSchema), payCommission(pool));

// Financial Closures (daily/monthly close)
app.get('/api/finance/closures', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(getFinancialClosuresQuerySchema), getFinancialClosures(pool));
app.post('/api/finance/closures', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateRequest(createClosureSchema), createFinancialClosure(pool));
app.put('/api/finance/closures/:id', authenticateToken, authorizeRole(['Admin']), validateRequest(finalizeClosureSchema), finalizeFinancialClosure(pool));

// Billing, Invoicing & Cashier
app.post('/api/invoices',
    invoiceLimiter,
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Receptionist']),
    validateRequest(createInvoiceSchema),
    createInvoice(pool)
);

app.get('/api/invoices',
    invoiceLimiter,
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Receptionist', 'Cashier']),
    validateQuery(getInvoicesQuerySchema),
    getInvoices(pool)
);

app.get('/api/invoices/:id',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Receptionist', 'Cashier']),
    getInvoiceById(pool)
);

app.put('/api/invoices/:id',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant']),
    validateRequest(updateInvoiceSchema),
    updateInvoice(pool)
);

app.post('/api/invoices/:id/payment',
    authenticateToken,
    hasPermission(pool, 'PROCESS_PAYMENTS'),
    validateRequest(collectPaymentSchema),
    collectPayment(pool)
);

app.post('/api/invoices/:id/refund',
    authenticateToken,
    hasPermission(pool, 'REQUEST_REFUNDS'),
    validateRequest(refundSchema),
    refundInvoice(pool)
);

app.get('/api/refunds',
    authenticateToken,
    hasAnyPermission(pool, ['REQUEST_REFUNDS', 'APPROVE_REFUNDS', 'PROCESS_REFUNDS', 'ISSUE_REFUNDS']),
    validateQuery(getRefundsQuerySchema),
    getRefunds(pool)
);

app.patch('/api/refunds/:id/status',
    authenticateToken,
    hasAnyPermission(pool, ['APPROVE_REFUNDS', 'PROCESS_REFUNDS', 'ISSUE_REFUNDS']),
    validateRequest(reviewRefundSchema),
    reviewRefund(pool)
);

app.get('/api/partial-payment-exceptions',
    authenticateToken,
    hasAnyPermission(pool, ['REQUEST_PARTIAL_PAYMENT_EXCEPTION', 'APPROVE_PARTIAL_PAYMENT_EXCEPTION']),
    validateQuery(getPartialPaymentExceptionsQuerySchema),
    getPartialPaymentExceptions(pool)
);

app.post('/api/invoices/:id/partial-payment-exceptions',
    authenticateToken,
    hasPermission(pool, 'REQUEST_PARTIAL_PAYMENT_EXCEPTION'),
    validateRequest(requestPartialPaymentExceptionSchema),
    requestPartialPaymentException(pool)
);

app.patch('/api/partial-payment-exceptions/:id/status',
    authenticateToken,
    hasPermission(pool, 'APPROVE_PARTIAL_PAYMENT_EXCEPTION'),
    validateRequest(reviewPartialPaymentExceptionSchema),
    reviewPartialPaymentException(pool)
);

app.get('/api/invoices/:id/pdf',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Receptionist', 'Cashier']),
    getInvoicePdf(pool)
);

app.post('/api/cashier/shifts/open',
    authenticateToken,
    hasPermission(pool, 'OPEN_CASHIER_SHIFT'),
    validateRequest(openShiftSchema),
    openShift(pool)
);

app.post('/api/cashier/shifts/:id/close',
    authenticateToken,
    hasPermission(pool, 'CLOSE_CASHIER_SHIFT'),
    validateRequest(closeShiftSchema),
    closeShift(pool)
);

app.get('/api/cashier/reconciliation',
    authenticateToken,
    hasAnyPermission(pool, ['PROCESS_PAYMENTS', 'RECONCILE_SHIFTS']),
    validateQuery(reconciliationQuerySchema),
    getReconciliation(pool)
);

app.patch('/api/cashier/closures/:id/review',
    authenticateToken,
    hasPermission(pool, 'APPROVE_SHIFT_VARIANCE'),
    validateRequest(reviewClosureSchema),
    reviewCashierClosure(pool)
);

// Insurance & Claims
app.get('/api/insurance/providers',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
    getProviders(pool)
);

app.post('/api/insurance/providers',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
    validateRequest(providerSchema),
    createProvider(pool)
);

app.get('/api/insurance/contracts',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
    getContracts(pool)
);

app.post('/api/insurance/contracts',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
    validateRequest(contractSchema),
    createContract(pool)
);

app.get('/api/insurance/policies',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist', 'Nurse']),
    getPolicies(pool)
);

app.post('/api/insurance/policies',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
    validateRequest(policySchema),
    createPolicy(pool)
);

app.get('/api/insurance/coverage-rules',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
    getCoverageRules(pool)
);

app.post('/api/insurance/coverage-rules',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
    validateRequest(coverageRuleSchema),
    createCoverageRule(pool)
);

app.get('/api/insurance/coverage-preview',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
    validateQuery(coverageQuerySchema),
    previewCoverage(pool)
);

app.get('/api/insurance/approvals',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist', 'Nurse']),
    getApprovals(pool)
);

app.post('/api/insurance/approvals',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist', 'Nurse']),
    validateRequest(approvalSchema),
    createApproval(pool)
);

app.put('/api/insurance/approvals/:approvalId/status',
    authenticateToken,
    hasPermission(pool, 'MANAGE_INSURANCE_APPROVALS'),
    validateRequest(updateApprovalStatusSchema),
    updateApprovalStatus(pool)
);

app.get('/api/claims',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
    validateQuery(getClaimsQuerySchema),
    getClaims(pool)
);

app.post('/api/claims',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
    validateRequest(createClaimSchema),
    createClaim(pool)
);

app.put('/api/claims/:id/status',
    authenticateToken,
    authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
    validateRequest(updateClaimStatusSchema),
    updateClaimStatus(pool)
);

// Clinical Routes (Radiologist & Technician & Nurse) - with validation
app.get('/api/exams/worklist',
    authenticateToken,
    authorizeRole(['Radiologist', 'Technician', 'Nurse']),
    validateQuery(getWorklistQuerySchema),
    getWorklist(pool)
);

app.get('/api/case-reports',
    authenticateToken,
    hasAnyPermission(pool, ['VIEW_REPORTS']),
    getCaseReports(pool)
);

app.get('/api/case-reports/lookup',
    authenticateToken,
    hasAnyPermission(pool, ['VIEW_REPORTS']),
    lookupCaseReport(pool)
);

app.get('/api/exams/:id',
    authenticateToken,
    authorizeRole(['Admin', 'Radiologist']),
    getExamById(pool)
);

app.put('/api/exams/report',
    authenticateToken,
    hasAnyPermission(pool, ['WRITE_REPORTS', 'AMEND_REPORTS']),
    validateRequest(updateExamReportSchema),
    updateReport(pool)
);

app.post('/api/exams/report/improve-format',
    authenticateToken,
    hasAnyPermission(pool, ['IMPROVE_REPORT_FORMAT']),
    validateRequest(improveReportSchema),
    improveReportFormat(pool)
);

app.post('/api/exams/:id/ai-preliminary-draft',
    authenticateToken,
    hasAnyPermission(pool, ['WRITE_REPORTS', 'IMPROVE_REPORT_FORMAT']),
    validateRequest(generatePreliminaryReportSchema),
    generatePreliminaryReportDraft(pool)
);

app.get('/api/exams/:id/ai-drafts',
    authenticateToken,
    hasAnyPermission(pool, ['WRITE_REPORTS', 'IMPROVE_REPORT_FORMAT']),
    listAiReportDrafts(pool)
);

app.post('/api/exams/:id/ai-drafts/:draftId/applied',
    authenticateToken,
    hasAnyPermission(pool, ['WRITE_REPORTS', 'IMPROVE_REPORT_FORMAT']),
    validateRequest(markAiReportDraftAppliedSchema),
    markAiReportDraftApplied(pool)
);

app.get('/api/report-templates',
    authenticateToken,
    authorizeRole(['Admin', 'Radiologist', 'Technician', 'Nurse']),
    validateQuery(getReportTemplatesQuerySchema),
    getReportTemplates(pool)
);

app.post('/api/report-templates',
    authenticateToken,
    authorizeRole(['Admin', 'Radiologist']),
    validateRequest(reportTemplateSchema),
    createReportTemplate(pool)
);

app.put('/api/report-templates/:id',
    authenticateToken,
    authorizeRole(['Admin', 'Radiologist']),
    validateRequest(updateReportTemplateSchema),
    updateReportTemplate(pool)
);

app.delete('/api/report-templates/:id',
    authenticateToken,
    authorizeRole(['Admin', 'Radiologist']),
    deleteReportTemplate(pool)
);

// Report PDF is reachable both by staff (permission-gated) and by portal
// self-service roles (Patient / referring doctor) whose row-level access is
// enforced inside getReportPdf. Compose the guards so neither path is broken.
const allowReportPdfAccess = (req, res, next) => {
    const portalRoles = ['Patient', 'Doctor', 'Referring Doctor', 'Referring_Doctor'];
    if (portalRoles.includes(req.user?.role)) return next();
    return hasAnyPermission(pool, ['VIEW_REPORTS'])(req, res, next);
};

app.get('/api/exams/:id/report/pdf',
    authenticateToken,
    allowReportPdfAccess,
    getReportPdf(pool)
);

app.post('/api/exams/:id/report/amend',
    authenticateToken,
    authorizeRole(['Admin', 'Radiologist']),
    validateRequest(amendReportSchema),
    amendReport(pool)
);

app.post('/api/results/:examId/deliver',
    authenticateToken,
    hasAnyPermission(pool, ['DELIVER_RESULTS']),
    validateRequest(deliverResultSchema),
    deliverResult(pool)
);

app.get('/api/results/:examId/delivery-history',
    authenticateToken,
    hasAnyPermission(pool, ['VIEW_REPORTS']),
    getDeliveryHistory(pool)
);

app.get('/api/queue',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Accountant', 'Radiologist', 'Technician', 'Nurse']),
    validateQuery(getQueueQuerySchema),
    getQueue(pool)
);

app.post('/api/queue/:examId/transition',
    authenticateToken,
    authorizeRole(['Receptionist', 'Admin', 'Accountant', 'Radiologist', 'Technician', 'Nurse']),
    hasPermission(pool, 'MANAGE_QUEUE'),
    validateRequest(transitionQueueSchema),
    transitionQueue(pool)
);

// HR Routes
// Exam Types Routes
app.get('/api/exam-types', authenticateToken, validateQuery(getExamTypesQuerySchema), getExamTypes(pool));
app.post('/api/exam-types', authenticateToken, hasPermission(pool, 'MANAGE_EXAM_CATALOG'), validateRequest(createExamTypeSchema), createExamType(pool));
app.put('/api/exam-types/:id', authenticateToken, hasPermission(pool, 'MANAGE_EXAM_CATALOG'), validateRequest(updateExamTypeSchema), updateExamType(pool));
app.delete('/api/exam-types/:id', authenticateToken, hasPermission(pool, 'MANAGE_EXAM_CATALOG'), deleteExamType(pool));

// HR/Staff Routes (with strict rate limiting on deletions)
app.get('/api/staff',
    authenticateToken,
    authorizeRole(['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']),
    getAllStaff(pool)
);

app.post('/api/staff',
    authenticateToken,
    authorizeRole(['HR', 'Admin']),
    validateRequest(createUserSchema),
    createStaff(pool)
);

app.put('/api/staff/:id',
    authenticateToken,
    authorizeRole(['HR', 'Admin']),
    validateRequest(updateUserSchema),
    updateStaff(pool)
);

app.delete('/api/staff/:id',
    strictLimiter,
    authenticateToken,
    authorizeRole(['HR', 'Admin']),
    deleteStaff(pool)
);

// Phase 16: Extended HR Routes
app.get('/api/hr/profiles', authenticateToken, authorizeRole(['HR', 'Admin']), getEmployeeProfiles(pool));
app.put('/api/hr/profiles/:id', authenticateToken, authorizeRole(['HR', 'Admin']), validateRequest(updateHrProfileSchema), updateEmployeeProfile(pool));

app.get('/api/hr/shifts', authenticateToken, authorizeRole(['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']), getShifts(pool));
app.post('/api/hr/shifts', authenticateToken, authorizeRole(['HR', 'Admin']), validateRequest(createShiftSchema), createShift(pool));
app.delete('/api/hr/shifts/:id', authenticateToken, authorizeRole(['HR', 'Admin']), deleteShift(pool));

app.get('/api/hr/attendance', authenticateToken, authorizeRole(['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']), getAttendance(pool));
app.post('/api/hr/attendance/clock-in', authenticateToken, validateRequest(clockInSchema), clockIn(pool));
app.post('/api/hr/attendance/clock-out', authenticateToken, validateRequest(clockOutSchema), clockOut(pool));

app.get('/api/hr/leave', authenticateToken, authorizeRole(['HR', 'Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']), getLeaveRequests(pool));
app.post('/api/hr/leave', authenticateToken, validateRequest(createLeaveRequestSchema), createLeaveRequest(pool));
app.put('/api/hr/leave/:id/status', authenticateToken, authorizeRole(['HR', 'Admin']), validateRequest(updateLeaveStatusSchema), updateLeaveStatus(pool));

app.get('/api/hr/productivity', authenticateToken, authorizeRole(['HR', 'Admin']), getProductivityReport(pool));

// Payroll, deductions, and penalties
app.get('/api/payroll/overview', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), getPayrollOverview(pool));
app.get('/api/payroll/periods', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), getPayrollPeriods(pool));
app.post('/api/payroll/periods', authenticateToken, hasPermission(pool, 'MANAGE_PAYROLL_PERIODS'), validateRequest(createPayrollPeriodSchema), createPayrollPeriod(pool));

app.get('/api/payroll/compensation', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), getCompensationProfiles(pool));
app.post('/api/payroll/compensation', authenticateToken, hasPermission(pool, 'MANAGE_EMPLOYEE_COMPENSATION'), validateRequest(createCompensationProfileSchema), createCompensationProfile(pool));

app.get('/api/payroll/rules', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), getPayrollRules(pool));
app.post('/api/payroll/rules', authenticateToken, hasPermission(pool, 'MANAGE_PAYROLL_RULES'), validateRequest(createPayrollRuleSchema), createPayrollRule(pool));
app.put('/api/payroll/rules/:ruleId/status', authenticateToken, hasPermission(pool, 'APPROVE_PAYROLL'), validateRequest(updatePayrollRuleStatusSchema), updatePayrollRuleStatus(pool));

app.get('/api/payroll/deductions', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), getDeductions(pool));
app.post('/api/payroll/deductions', authenticateToken, hasPermission(pool, 'MANAGE_DEDUCTIONS'), validateRequest(createDeductionSchema), createDeduction(pool));
app.put('/api/payroll/deductions/:deductionId/status', authenticateToken, hasPermission(pool, 'APPROVE_PAYROLL'), validateRequest(updateDeductionStatusSchema), updateDeductionStatus(pool));

app.get('/api/payroll/penalties', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), validateQuery(payrollQuerySchema), getPenalties(pool));
app.post('/api/payroll/penalties', authenticateToken, hasPermission(pool, 'MANAGE_PENALTIES'), validateRequest(createPenaltySchema), createPenalty(pool));
app.put('/api/payroll/penalties/:penaltyId/status', authenticateToken, hasPermission(pool, 'APPROVE_PAYROLL'), validateRequest(updatePenaltyStatusSchema), updatePenaltyStatus(pool));

app.get('/api/payroll/periods/:periodId/run', authenticateToken, hasPermission(pool, 'VIEW_PAYROLL'), getPayrollRun(pool));
app.post('/api/payroll/runs/calculate', authenticateToken, hasPermission(pool, 'CALCULATE_PAYROLL'), validateRequest(calculatePayrollSchema), calculatePayroll(pool));
app.put(
    '/api/payroll/runs/:runId/status',
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

// Phase 17: CRM & Marketing Routes
app.use('/api/audit-logs', auditRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/rbac', rbacRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/privacy', privacyRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/analytics', analyticsRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/documents', documentRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/integrations', integrationRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/settings', settingsRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/backups', backupRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/system', systemRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/clinical', safetyRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/import', importRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/pacs', pacsRoutes(pool, authenticateToken, authorizeRole));

app.get('/api/crm/activities', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'HR', 'Marketing']), getCrmActivities(pool));
app.post('/api/crm/activities', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'HR', 'Marketing']), validateRequest(createCrmActivitySchema), createCrmActivity(pool));
app.put('/api/crm/activities/:id', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'HR', 'Marketing']), validateRequest(updateCrmActivitySchema), updateCrmActivity(pool));

app.get('/api/crm/segments', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), getSegments(pool));
app.post('/api/crm/segments', authenticateToken, authorizeRole(['Admin', 'Marketing']), validateRequest(createSegmentSchema), createSegment(pool));
app.post('/api/crm/segments/:segmentId/members', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), validateRequest(addSegmentMemberSchema), addSegmentMember(pool));

app.get('/api/crm/campaigns', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), getCampaigns(pool));
app.post('/api/crm/campaigns', authenticateToken, authorizeRole(['Admin', 'Marketing']), validateRequest(createCampaignSchema), createCampaign(pool));
app.put('/api/crm/campaigns/:id/status', authenticateToken, authorizeRole(['Admin', 'Marketing']), validateRequest(updateCampaignStatusSchema), updateCampaignStatus(pool));

app.post('/api/crm/feedback', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing', 'Patient']), validateRequest(submitFeedbackSchema), submitFeedback(pool));
app.get('/api/crm/feedback', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), getFeedback(pool));

app.put('/api/crm/loyalty/:patientId', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), validateRequest(updateLoyaltySchema), updateLoyaltyPoints(pool));

// Notification Routes (Legacy reminder kept for backward compat)
app.post('/api/notifications/remind',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist']),
    notificationLimiter,
    validateRequest(reminderSchema),
    sendReminder(pool)
);

// Inventory & Consumables Routes
// Suppliers
app.get('/api/suppliers', authenticateToken, authorizeRole(['Admin', 'Accountant']), getSuppliers(pool));
app.get('/api/suppliers/:id', authenticateToken, authorizeRole(['Admin', 'Accountant']), getSupplierById(pool));
app.post('/api/suppliers', authenticateToken, authorizeRole(['Admin']), validateRequest(createSupplierSchema), createSupplier(pool));
app.put('/api/suppliers/:id', authenticateToken, authorizeRole(['Admin']), validateRequest(updateSupplierSchema), updateSupplier(pool));

// Purchase Orders
app.get('/api/purchase-orders', authenticateToken, authorizeRole(['Admin', 'Accountant']), getPurchaseOrders(pool));
app.get('/api/purchase-orders/:id', authenticateToken, authorizeRole(['Admin', 'Accountant']), getPurchaseOrderById(pool));
app.post('/api/purchase-orders', authenticateToken, authorizeRole(['Admin']), validateRequest(createPurchaseOrderSchema), createPurchaseOrder(pool));
app.put('/api/purchase-orders/:id/status', authenticateToken, authorizeRole(['Admin']), validateRequest(updatePurchaseOrderStatusSchema), updatePurchaseOrderStatus(pool));
app.post('/api/purchase-orders/:id/receive', authenticateToken, authorizeRole(['Admin', 'Technician']), validateRequest(receiveStockSchema), receiveStock(pool));

// Inventory Catalog & Movements
app.get('/api/inventory', authenticateToken, authorizeRole(['Admin', 'Technician', 'Accountant', 'Nurse', 'Radiologist', 'Receptionist', 'Cashier']), hasAnyPermission(pool, ['VIEW_INVENTORY', 'CONSUME_INVENTORY']), getInventory(pool));
app.post('/api/inventory', authenticateToken, authorizeRole(['Admin']), validateRequest(createInventoryItemSchema), addItem(pool));
app.put('/api/inventory/:itemId', authenticateToken, authorizeRole(['Admin']), validateRequest(updateInventoryStockSchema), updateStock(pool));

app.post('/api/inventory/consume', authenticateToken, authorizeRole(['Admin', 'Technician', 'Nurse', 'Receptionist', 'Cashier']), hasPermission(pool, 'CONSUME_INVENTORY'), validateRequest(consumeStockSchema), consumeStock(pool));
app.post('/api/inventory/adjust', authenticateToken, authorizeRole(['Admin']), validateRequest(adjustStockSchema), adjustStock(pool));
app.get('/api/inventory/movements', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Receptionist', 'Cashier', 'Nurse', 'Technician']), getStockMovements(pool));
app.get('/api/inventory/expiry-alerts', authenticateToken, authorizeRole(['Admin', 'Nurse', 'Technician']), getExpiryAlerts(pool));

// Patient Portal Records (login route moved up with auth routes)
app.get('/api/portal/review-requests',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist']),
    getPendingPortalReviewRequests(pool)
);

app.put('/api/portal/appointment-requests/:requestId/review',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist']),
    validateRequest(reviewAppointmentRequestSchema),
    reviewPortalAppointmentRequest(pool)
);

app.put('/api/portal/profile-update-requests/:requestId/review',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist']),
    validateRequest(reviewProfileUpdateRequestSchema),
    reviewPortalProfileUpdateRequest(pool)
);

app.get('/api/portal/records',
    authenticateToken,
    authorizeRole(['Patient']),
    auditRead(auditService, { resourceTable: 'patient_records' }),
    getMyRecords(pool)
);

app.get('/api/portal/profile',
    authenticateToken,
    authorizeRole(['Patient']),
    getMyProfile(pool)
);

app.get('/api/portal/invoices',
    authenticateToken,
    authorizeRole(['Patient']),
    getMyInvoices(pool)
);

app.get('/api/portal/documents',
    authenticateToken,
    authorizeRole(['Patient']),
    auditRead(auditService, { resourceTable: 'portal_documents' }),
    getMyDocuments(pool)
);

app.get('/api/portal/documents/:documentId/download',
    authenticateToken,
    authorizeRole(['Patient']),
    auditRead(auditService, { resourceTable: 'portal_documents', resourceIdParam: 'documentId' }),
    downloadMyDocument(pool)
);

app.get('/api/portal/appointment-requests',
    authenticateToken,
    authorizeRole(['Patient']),
    getMyAppointmentRequests(pool)
);

app.post('/api/portal/appointment-requests',
    authenticateToken,
    authorizeRole(['Patient']),
    validateRequest(appointmentRequestSchema),
    createAppointmentRequest(pool)
);

app.post('/api/portal/profile-update-requests',
    authenticateToken,
    authorizeRole(['Patient']),
    validateRequest(profileUpdateRequestSchema),
    createProfileUpdateRequest(pool)
);

// ─── Doctor Portal Routes ───────────────────────────────────────────────────

// Admin: Set portal password for a referring doctor
app.post('/api/referring-doctors/:id/set-portal-password',
    authenticateToken,
    authorizeRole(['Admin']),
    validateRequest(setPortalPasswordSchema),
    setPortalPassword(pool)
);

// Doctor authenticated routes
app.get('/api/doctor-portal/cases',
    authenticateToken,
    authorizeRole(['Doctor']),
    getDoctorCases(pool)
);

app.get('/api/doctor-portal/reports/:examId',
    authenticateToken,
    authorizeRole(['Doctor']),
    auditRead(auditService, { resourceTable: 'examinations', resourceIdParam: 'examId' }),
    getDoctorReport(pool)
);

app.get('/api/doctor-portal/reports/:examId/pdf',
    authenticateToken,
    authorizeRole(['Doctor']),
    auditRead(auditService, { resourceTable: 'examinations', resourceIdParam: 'examId' }),
    getDoctorReportPdf(pool)
);

app.post('/api/doctor-portal/orders',
    authenticateToken,
    authorizeRole(['Doctor']),
    validateRequest(doctorOrderSchema),
    createDoctorOrder(pool)
);

app.get('/api/doctor-portal/messages',
    authenticateToken,
    authorizeRole(['Doctor']),
    getDoctorMessages(pool)
);

app.post('/api/doctor-portal/messages',
    authenticateToken,
    authorizeRole(['Doctor']),
    validateRequest(doctorMessageSchema),
    sendDoctorMessage(pool)
);

app.get('/api/doctor-portal/messages/unread-count',
    authenticateToken,
    authorizeRole(['Doctor']),
    getUnreadMessageCount(pool)
);

// ─── Notification & Communication Routes ────────────────────────────────────

// Notification log (merged: Admin, Receptionist, HR)
app.get('/api/notifications',
    authenticateToken,
    authorizeRole(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']),
    validateQuery(getNotificationsQuerySchema),
    getNotifications(pool)
);
app.get('/api/notifications/unread-count',
    authenticateToken,
    authorizeRole(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']),
    getUnreadCount(pool)
);
app.put('/api/notifications/mark-all-read',
    authenticateToken,
    authorizeRole(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']),
    markAllRead(pool)
);
app.put('/api/notifications/:id/read',
    authenticateToken,
    authorizeRole(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']),
    markNotificationRead(pool)
);

// Legacy reminder (backward compat)
app.post('/api/notifications/send-reminder',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist']),
    notificationLimiter,
    validateRequest(reminderSchema),
    sendReminder(pool)
);

// Manual send
app.post('/api/notifications/send-manual',
    authenticateToken,
    authorizeRole(['Developer', 'Admin', 'Receptionist', 'Marketing']),
    notificationLimiter,
    validateRequest(manualSendSchema),
    sendManual(pool)
);

// Public unsubscribe (SMS STOP / marketing opt-out)
app.post('/api/notifications/unsubscribe', apiLimiter, validateRequest(unsubscribeSchema), unsubscribe(pool));

// Twilio delivery-receipt webhook (no auth — Twilio signs requests)
app.post('/api/notifications/webhook/twilio', handleTwilioWebhook(pool));

// Notification Templates
app.get('/api/notification-templates',
    authenticateToken,
    authorizeRole(['Developer', 'Admin']),
    getNotifTemplates(pool)
);
app.post('/api/notification-templates',
    authenticateToken,
    authorizeRole(['Developer', 'Admin']),
    validateRequest(notificationTemplateSchema),
    createNotifTemplate(pool)
);
app.put('/api/notification-templates/:id',
    authenticateToken,
    authorizeRole(['Developer', 'Admin']),
    validateRequest(updateNotificationTemplateSchema),
    updateNotifTemplate(pool)
);
app.delete('/api/notification-templates/:id',
    authenticateToken,
    authorizeRole(['Developer', 'Admin']),
    deleteNotifTemplate(pool)
);

// Job queue
app.get('/api/notification-jobs',
    authenticateToken,
    authorizeRole(['Developer', 'Admin', 'Marketing']),
    validateQuery(getNotificationJobsQuerySchema),
    getJobs(pool)
);
app.post('/api/notification-jobs/:id/retry',
    authenticateToken,
    authorizeRole(['Developer', 'Admin']),
    retryJob(pool)
);
app.post('/api/notification-jobs/process',
    authenticateToken,
    authorizeRole(['Developer', 'Admin']),
    notificationLimiter,
    triggerProcessJobs(pool)
);

// Notification preferences
app.get('/api/notification-preferences',
    authenticateToken,
    authorizeRole(['Developer', 'Admin', 'Receptionist', 'Marketing']),
    validateQuery(notificationPreferencesQuerySchema),
    getNotificationPreferences(pool)
);
app.put('/api/notification-preferences',
    authenticateToken,
    authorizeRole(['Developer', 'Admin', 'Receptionist', 'Marketing']),
    validateQuery(notificationPreferencesQuerySchema),
    validateRequest(updatePreferencesSchema),
    updateNotificationPreferences(pool)
);

// ─── Real-time SSE Connection ────────────────────────────────────────────────
app.get('/api/realtime/stream', realtimeService.registerClient);

// ─── Staff Chat Routes ────────────────────────────────────────────────────────
app.get('/api/chat/users', authenticateToken, getChatUsers(pool));
app.get('/api/chat/messages', authenticateToken, getChatMessages(pool));
app.post('/api/chat/messages', authenticateToken, chatAttachmentUpload.array('attachments'), validateChatAttachments, sendChatMessage(pool));
app.get('/api/chat/unread-summary', authenticateToken, getUnreadSummary(pool));
app.get('/api/chat/attachments/:fileName', authenticateToken, serveChatAttachment);

// ─── Patient Portal Messages (Staff Inbox) ───────────────────────────────────
app.get('/api/messages/patients',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist', 'Marketing']),
    getPatientConversations(pool)
);
app.get('/api/messages/patients/:patientId',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist', 'Marketing']),
    getPatientMessageHistory(pool)
);
app.post('/api/messages/patients/:patientId',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist', 'Marketing']),
    chatAttachmentUpload.array('attachments'),
    validateChatAttachments,
    replyToPatient(pool)
);

// ─── Referring Doctor Messages (Staff Inbox) ─────────────────────────────────
app.get('/api/messages/doctors',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist', 'Marketing']),
    getDoctorConversations(pool)
);
app.get('/api/messages/doctors/:doctorId',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist', 'Marketing']),
    getDoctorMessageHistory(pool)
);
app.post('/api/messages/doctors/:doctorId',
    authenticateToken,
    authorizeRole(['Admin', 'Receptionist', 'Marketing']),
    chatAttachmentUpload.array('attachments'),
    validateChatAttachments,
    replyToDoctor(pool)
);

// ─── Patient Portal Messages (Patient Side) ──────────────────────────────────
app.get('/api/portal/messages',
    authenticateToken,
    authorizeRole(['Patient']),
    getMyMessages(pool)
);
app.post('/api/portal/messages',
    authenticateToken,
    authorizeRole(['Patient']),
    chatAttachmentUpload.array('attachments'),
    validateChatAttachments,
    sendPortalMessage(pool)
);

// ─── Patient Portal Notification Inbox ───────────────────────────────────────
app.get('/api/portal/notifications',
    authenticateToken,
    authorizeRole(['Patient']),
    getMyPortalNotifications(pool)
);
app.get('/api/portal/notifications/unread-count',
    authenticateToken,
    authorizeRole(['Patient']),
    getMyPortalNotificationUnreadCount(pool)
);
app.put('/api/portal/notifications/mark-all-read',
    authenticateToken,
    authorizeRole(['Patient']),
    markAllMyPortalNotificationsRead(pool)
);
app.put('/api/portal/notifications/:id/read',
    authenticateToken,
    authorizeRole(['Patient']),
    markMyPortalNotificationRead(pool)
);

// ─── Doctor Portal Notification Inbox ────────────────────────────────────────
app.get('/api/doctor-portal/notifications',
    authenticateToken,
    authorizeRole(['Doctor']),
    getDoctorNotifications(pool)
);
app.get('/api/doctor-portal/notifications/unread-count',
    authenticateToken,
    authorizeRole(['Doctor']),
    getDoctorNotificationUnreadCount(pool)
);
app.put('/api/doctor-portal/notifications/mark-all-read',
    authenticateToken,
    authorizeRole(['Doctor']),
    markAllDoctorNotificationsRead(pool)
);
app.put('/api/doctor-portal/notifications/:id/read',
    authenticateToken,
    authorizeRole(['Doctor']),
    markDoctorNotificationRead(pool)
);

// 404 Handler - Must be after all routes
app.use(notFoundHandler);

// Centralized Error Handler - Must be last
app.use(errorHandler);

// Start Server conditionally
if (process.env.NODE_ENV !== 'test') {
    const httpServer = app.listen(PORT, () => {
        logger.info(`🚀 RCMS Server running on port ${PORT}`);
        logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
        logger.info(`🌐 Client URL: ${process.env.CLIENT_URL}`);
        // Start workers only after the required schema is ready and the API is listening.
        lifecycle.addStopCallback(startIntegrationWorker(pool));
        lifecycle.addStopCallback(scheduleDataRetentionJobs(pool));
        lifecycle.trackStartupTimer(setTimeout(() => {
            syncRegisteredModalitiesToOrthanc(pool)
                .then((result) => logger.info('PACS modalities synchronized to Orthanc', result))
                .catch((error) => logger.error('PACS modality startup synchronization failed', { error: error.message }));
        }, 5000));
        lifecycle.addStopCallback(startPacsMwlJob(pool));
        lifecycle.addStopCallback(startPacsTieringJob(pool));
        lifecycle.addStopCallback(startPacsAiAnalysisJob(pool));
        lifecycle.addStopCallback(startAuditDetectionJob(pool));
        // Start notification job polling (every 60 seconds)
        startPolling(pool, 60000);
        startInventoryAlertPolling(pool);
        startBackupScheduler(pool);
        lifecycle.addStopCallback(stopPolling);
        lifecycle.addStopCallback(stopInventoryAlertPolling);
        lifecycle.addStopCallback(stopBackupScheduler);
        lifecycle.markReady();
        logger.info('🔔 Notification job polling started (60s interval)');
        });
        lifecycle.setHttpServer(httpServer);
    }).catch((error) => {
        logger.error('Financial Reporting V2 migration failed', { error: error.message });
        process.exit(1);
    });
}

// Graceful Shutdown
if (process.env.NODE_ENV !== 'test') {
    const shutdown = (signal) => {
        lifecycle.shutdown(signal)
            .then(() => process.exit(0))
            .catch((error) => {
                logger.error('Graceful shutdown failed', { error: error.message, stack: error.stack });
                process.exit(1);
            });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
// Process-level unhandled exception and rejection handlers
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection; terminating process', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: String(promise),
    });
    // Continuing after an unknown asynchronous failure risks serving requests
    // from a partially corrupted process. The service manager is responsible
    // for restarting the container/process.
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception; terminating process', {
        error: error.message,
        stack: error.stack,
    });
    process.exit(1);
});
