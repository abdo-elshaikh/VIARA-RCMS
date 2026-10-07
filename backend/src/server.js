// Load environment variables first
const path = require('path');
const fs = require('fs');
const rootEnvPath = path.resolve(__dirname, '../../.env');
const backendEnvPath = path.resolve(__dirname, '../.env');

const savedNodeEnv = process.env.NODE_ENV;

// Load root .env first for workspace defaults, then override with backend-specific .env
if (fs.existsSync(rootEnvPath)) {
    require('dotenv').config({ path: rootEnvPath });
}
if (fs.existsSync(backendEnvPath)) {
    require('dotenv').config({ path: backendEnvPath, override: true });
}
if (savedNodeEnv) {
    process.env.NODE_ENV = savedNodeEnv;
}

if (!process.env.DATABASE_URL && process.env.POSTGRES_PASSWORD) {
    const user = encodeURIComponent(process.env.POSTGRES_USER || 'VIARA');
    const password = encodeURIComponent(process.env.POSTGRES_PASSWORD);
    const database = encodeURIComponent(process.env.POSTGRES_DB || 'VIARA');
    const port = process.env.POSTGRES_PORT || '5432';
    process.env.DATABASE_URL = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
}
process.env.PORT ||= '3000';

if (!fs.existsSync(rootEnvPath) && !fs.existsSync(backendEnvPath)) {
    console.warn('⚠️ No root or backend .env file found — relying on environment variables');
}

// NOTE: minor no-op change to trigger nodemon reload when env files are updated

// Validate environment variables before proceeding
const validateEnv = require('./config/validateEnv');
try {
    validateEnv();
} catch (error) {
    console.error('\n❌ Environment Validation Failed:\n');
    console.error(error.message);
    console.error('\nPlease check the root .env file or the backend process environment.\n');
    process.exit(1);
}

// ── License Engine ────────────────────────────────────────────────────────────
// Must run BEFORE the HTTP server starts so we fail fast on invalid/missing keys.
const { loadLicense } = require('./services/licenseService');
try {
    loadLicense();
} catch (licenseError) {
    console.error('\n❌ License Validation Failed:\n');
    console.error(licenseError.message);
    console.error('\nSet a valid LICENSE_KEY in .env or contact VIARA support.\n');
    process.exit(1);
}

const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const {
    patientDataLimiter, invoiceLimiter, sensitiveOpLimiter, notificationLimiter, publicCaseStatusLimiter
} = require('./middleware/rateLimiters');

const { Pool } = require('pg');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Middlewares
const auditLogger = require('./middleware/auditLogger');
const auditRead = require('./middleware/auditRead');
const { authenticateToken, authorizeRole, configureAuthDatabase } = require('./middleware/authMiddleware');
const { authLimiter, apiLimiter, strictLimiter } = require('./middleware/rateLimiter');
const { authAccountLimiter, passwordResetRequestLimiter } = require('./middleware/rateLimiters');
const sanitizeInput = require('./middleware/sanitize');
const { csrfProtection } = require('./middleware/csrf');
const { validateRequest, validateQuery } = require('./middleware/validateRequest');
const { tracingMiddleware } = require('./middleware/tracing');
const { errorHandler, notFoundHandler, AppError } = require('./middleware/errorHandler');
const logger = require('./config/logger');
const AuditService = require('./services/auditService');
const trialGuard = require('./middleware/trialGuard');
const checkFeature = require('./middleware/checkFeature');

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
const licenseRoutes = require('./routes/licenseRoutes');
const safetyRoutes = require('./routes/safetyRoutes');
const importRoutes = require('./routes/importRoutes');
const { verifyWebhookSignature } = require('./middleware/webhookAuth');
const IntegrationService = require('./services/integrationService');
const pacsRoutes = require('./routes/pacsRoutes');
const docsRoutes = require('./routes/docsRoutes');
const v1Router = require('./routes/v1');
const tokenController = require('./controllers/tokenController');

// Modular Domain Routers
const patientRoutes = require('./routes/patientRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const financeRoutes = require('./routes/financeRoutes');
const insuranceRoutes = require('./routes/insuranceRoutes');
const clinicalExamRoutes = require('./routes/clinicalExamRoutes');
const hrRoutes = require('./routes/hrRoutes');
const crmRoutes = require('./routes/crmRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const chatRoutes = require('./routes/chatRoutes');
const portalRoutes = require('./routes/portalRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const roomRoutes = require('./routes/roomRoutes');
const receptionRoutes = require('./routes/receptionRoutes');
const displayRoutes = require('./routes/displayRoutes');
const endOfDayRoutes = require('./routes/endOfDayRoutes');

// Background Workers
const { startIntegrationWorker } = require('./jobs/integrationWorker');
const { scheduleDataRetentionJobs } = require('./jobs/dataRetentionJob');
const { startPacsMwlJob } = require('./jobs/pacsMwlJob');
const { startPacsTieringJob } = require('./jobs/pacsTieringJob');
const { startPacsAiAnalysisJob } = require('./jobs/pacsAiAnalysisJob');
const { startAuditDetectionJob } = require('./jobs/auditDetectionJob');
const { startShiftGuardJob, settleStaleAttendanceSessions } = require('./jobs/shiftGuardJob');
const { startEndOfDayJob } = require('./jobs/endOfDayJob');
const { startLicensePingJob } = require('./jobs/licensePingJob');
const { startTrialReportJob } = require('./jobs/trialReportJob');
const { startCredentialExpiryJob } = require('./jobs/credentialExpiryJob');
const { startWorker: startPacsReconciliationWorker } = require('./services/pacsReconciliationQueue');
const { syncRegisteredModalitiesToOrthanc } = require('./services/pacsModalityRegistryService');

// RBAC Cache Initialization
const { refreshPermissionCache, hasPermission, hasAnyPermission } = require('./middleware/rbacMiddleware');

// Validation Schemas
const { loginSchema, createUserSchema, enable2FASchema, verify2FASchema } = require('./schemas/userSchema');
const {
    passkeyAuthenticationOptionsSchema, passkeyAuthenticationVerifySchema,
    passkeyRegistrationOptionsSchema, passkeyRegistrationVerifySchema,
    passkeyRenameSchema, passkeyRevokeSchema
} = require('./schemas/passkeySchema');
const { updateProfileSchema, changePasswordSchema, profilePreferencesSchema } = require('./schemas/profileSchema');
const { doctorLoginSchema } = require('./schemas/doctorPortalSchema');

// Controllers
const { login, register, refresh, logout, setup2FA, enable2FA, verify2FA, changePortalPassword, forgotPassword, resetPassword } = require('./controllers/authController');
const passkeyController = require('./controllers/passkeyController');
const { getReportPdf } = require('./controllers/examController');
const { patientLogin } = require('./controllers/portalController');
const { doctorLogin } = require('./controllers/doctorPortalController');
const { startPolling, stopPolling } = require('./services/notificationJobService');
const { startInventoryAlertPolling, stopInventoryAlertPolling } = require('./services/inventoryAlertService');
const { startBackupScheduler, stopBackupScheduler } = require('./services/backupScheduler');
const { createServerLifecycle } = require('./services/serverLifecycle');

const { getDashboardStats } = require('./controllers/dashboardController');
const { getPublicLandingOverview, lookupPublicCaseStatus, authorizePublicFinalReport } = require('./controllers/publicLandingController');
const {
    getProfile, updateProfile, changePassword,
    getPreferences: getProfilePreferences,
    updatePreferences: updateProfilePreferences,
    getSessions: getProfileSessions,
    revokeSession: revokeProfileSession,
    exportPersonalData
} = require('./controllers/profileController');
const { getMyAuditLogs } = require('./controllers/auditController');

// Realtime
const realtimeService = require('./services/realtimeService');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust named proxy networks, never a hop count that clients can shorten.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

const RETRYABLE_DATABASE_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH'
]);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const waitForDatabaseConnection = async (pool, {
    maxAttempts = 10,
    baseDelayMs = 1000,
    maxDelayMs = 10000
} = {}) => {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let client;
        try {
            client = await pool.connect();
            return client;
        } catch (error) {
            lastError = error;

            if (!RETRYABLE_DATABASE_ERROR_CODES.has(error?.code)) {
                throw error;
            }

            if (attempt === maxAttempts) {
                break;
            }

            const delayMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
            logger.warn(
                `Database connection attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms: ${error.message || error.name || error.toString()}`
            );
            await sleep(delayMs);
        }
    }

    throw lastError;
};

// Database Connection
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required but not set');
}
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    min: Number(process.env.DB_POOL_MIN || 5),
    max: Number(process.env.DB_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT || 30000),
    connectionTimeoutMillis: Number(process.env.DB_POOL_TIMEOUT || 5000),
    statement_timeout: 30000,
    query_timeout: 30000
});
require('./services/attendanceConfigCache').setAttendanceConfigPool(pool);
configureAuthDatabase(pool);
realtimeService.setRealtimePool(pool);
// Failed-login actor attribution in auditLogger (best-effort only).
auditLogger.setDbPoolForAudit(pool);

const lifecycle = createServerLifecycle({
    pool,
    logger,
    shutdownTimeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS || 30000)
});
lifecycle.addStopCallback(require('./services/rateLimitStore').closeRateLimitStore);

const auditService = new AuditService(pool);

const checkClamAv = async () => {
    if (!process.env.CLAMAV_HOST) return;

    const net = require('net');
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await new Promise((resolve, reject) => {
                const socket = net.createConnection({
                    host: process.env.CLAMAV_HOST,
                    port: Number(process.env.CLAMAV_PORT || 3310),
                });
                const timeout = setTimeout(() => socket.destroy(new Error('ClamAV readiness timed out')), 2000);
                socket.setEncoding('utf8');
                socket.once('connect', () => socket.write('zPING\0'));
                socket.once('data', (data) => {
                    clearTimeout(timeout);
                    socket.end();
                    if (data.includes('PONG')) resolve();
                    else reject(new Error('ClamAV readiness returned an unexpected response'));
                });
                socket.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
            return;
        } catch (err) {
            if (attempt >= maxRetries) throw err;
            const backoff = baseDelay * Math.pow(2, attempt - 1);
            logger.warn(`ClamAV readiness check failed (attempt ${attempt}/${maxRetries}), retrying in ${backoff}ms`, { error: err.message });
            await new Promise(r => setTimeout(r, backoff));
        }
    }
};

// Test database connection
if (process.env.NODE_ENV !== 'test') {
    waitForDatabaseConnection(pool)
        .then(async (client) => {
            try {
                await client.query('SELECT password_reset_token, password_reset_expires FROM users LIMIT 0');
                await require('./services/rateLimitStore').initializeRateLimitStore();
            } catch (error) {
                client.release();
                throw error;
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

            client.release();

            const httpServer = app.listen(PORT, () => {
                logger.info(`🚀 VIARA Server running on port ${PORT}`);
                logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
                logger.info(`🌝 Client URL: ${process.env.CLIENT_URL}`);

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
                lifecycle.addStopCallback(startShiftGuardJob(pool));
                lifecycle.addStopCallback(startEndOfDayJob(pool));
                lifecycle.addStopCallback(startLicensePingJob(pool));
                lifecycle.addStopCallback(startTrialReportJob(pool));
                lifecycle.addStopCallback(startCredentialExpiryJob(pool));
                settleStaleAttendanceSessions(pool).catch((err) => logger.error('Initial stale attendance sweep error', { error: err.message }));

                // Start PACS reconciliation queue worker
                const pacsQueueWorker = startPacsReconciliationWorker(pool);
                lifecycle.addStopCallback(pacsQueueWorker);
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
        })
        .catch((err) => {
            logger.error(`❌ Error acquiring client from database pool: ${err.message || err.name || err.toString()}`, { stack: err.stack });
            process.exit(1);
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

// CORS / CSP origin helpers (defined before helmet which uses them)
const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3005',
    'http://127.0.0.1:3005',
];
const DEV_ALLOWED_PORTS = new Set(['5173', '5174', '5175', '5176', '3005']);

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

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https://*"],
            connectSrc: ["'self'", "ws://*", "wss://*", ...Array.from(getAllowedOrigins()).map(o => o.replace(/^http/, 'ws'))],
            frameSrc: ["'self'", ...Array.from(getAllowedOrigins())],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        },
    },
}));

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

// Raw body capture for webhook signature verification (must run BEFORE express.json)
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/api/webhooks/twilio', express.raw({ type: 'application/x-www-form-urlencoded' }));

app.use(compression({
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// Global JSON limit: 1mb. DICOM/file upload routes define their own higher limits.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// Input Sanitization to prevent XSS globally
app.use(sanitizeInput);

// CSRF protection (double-submit cookie pattern)
// Validates x-csrf-token header against csrf_token cookie for state-changing methods.
app.use(csrfProtection());

// Apply general API rate limiting (excluding health check)
app.use('/api', apiLimiter);

// Audit logging for all state-changing methods
app.use(auditLogger(auditService));

// Trial enforcement, applied once across the whole API.
//
// It used to be attached per-router, which left the first several route
// groups (patients, appointments, dashboard, profile) unguarded, so an expired
// trial could still read patient data. Mounting it here makes the lock
// uniform. /api/license/* stays readable so the SPA can render the expiry
// banner; see trialGuard.js.
app.use('/api', trialGuard);

// --- ROUTES ---

// Interactive API Documentation (OpenAPI 3.0.3)
app.use('/api/docs', docsRoutes());

// V1 API Router
app.use('/api/v1', v1Router(pool, authenticateToken, authorizeRole));

app.get('/', (req, res) => {
    res.json({
        name: 'VIARA Radiology Center Management System API',
        status: 'online',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        health: '/health/ready',
        docs: '/api/docs'
    });
});

app.get('/health/live', (req, res) => {
    res.json({ status: 'OK' });
});

const readinessHandler = async (req, res) => {
    if (!lifecycle.isReady() && process.env.NODE_ENV !== 'test') {
        return res.status(503).json({ status: 'NOT_READY' });
    }

    try {
        await Promise.all([pool.query('SELECT 1'), checkClamAv()]);
        return res.json({ status: 'OK' });
    } catch (error) {
        return res.status(503).json({ status: 'NOT_READY' });
    }
};

app.get('/health', readinessHandler);
app.get('/health/ready', readinessHandler);

// CSRF Token endpoint — returns a fresh CSRF token in the cookie.
// The client reads it from the cookie and echoes it back in the x-csrf-token header.
app.get('/api/csrf-token', (req, res) => {
    res.json({ ok: true });
});

// Central Prometheus exporter (see src/config/metrics.js): bounded route
// labels, real histogram buckets, status label, process/pool/backup metrics.
const { register: metricsRegistry, metricsMiddleware, setDbPool } = require('./config/metrics');

app.use(metricsMiddleware);
setDbPool(pool);

app.get('/metrics', async (req, res) => {
    const configuredToken = process.env.METRICS_TOKEN;
    if (configuredToken) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${configuredToken}`) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    } else {
        // No token configured — restrict to loopback and private RFC-1918 ranges only.
        const ip = req.ip || req.socket?.remoteAddress || '';
        const stripped = ip.replace(/^::ffff:/, '');
        const isLocal = stripped === '127.0.0.1'
            || stripped === '::1'
            || /^10\./.test(stripped)
            || /^172\.(1[6-9]|2\d|3[01])\./.test(stripped)
            || /^192\.168\./.test(stripped);
        if (!isLocal) {
            return res.status(403).json({ error: 'Forbidden: metrics endpoint requires METRICS_TOKEN or private network access' });
        }
    }
    try {
        res.set('Content-Type', metricsRegistry.contentType);
        res.set('Cache-Control', 'no-store');
        res.send(await metricsRegistry.metrics());
    } catch (error) {
        res.status(500).end();
    }
});

// Auth Routes (Public) - with rate limiting and validation
app.post('/api/auth/login',
    authLimiter,
    validateRequest(loginSchema),
    login(pool)
);
app.post('/api/auth/passkeys/authenticate/options', authLimiter, validateRequest(passkeyAuthenticationOptionsSchema), passkeyController.authenticationOptions(pool));
app.post('/api/auth/passkeys/authenticate/verify', authLimiter, validateRequest(passkeyAuthenticationVerifySchema), passkeyController.authenticationVerify(pool));

app.post('/api/auth/refresh', refresh(pool));
app.post('/api/auth/logout', logout(pool));
app.post('/api/portal/auth/refresh', refresh(pool));
app.post('/api/portal/auth/logout', logout(pool));

// Password Reset (public – no auth required)
app.post('/api/auth/forgot-password', authLimiter, passwordResetRequestLimiter, forgotPassword(pool));
app.post('/api/auth/reset-password',  authLimiter, resetPassword(pool));

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
app.post('/api/public/final-report', publicCaseStatusLimiter, authorizePublicFinalReport, getReportPdf(pool));
app.get('/api/public/final-report/:accessToken', publicCaseStatusLimiter, authorizePublicFinalReport, (req, _res, next) => {
    req.publicReportFormat = 'pdf';
    req.publicReportDisposition = 'inline';
    next();
}, getReportPdf(pool));

// Auth Routes (Protected - Admin Only)
app.post('/api/auth/register',
    authenticateToken,
    authorizeRole(['Admin']),
    hasPermission(pool, 'MANAGE_USERS'),
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
app.post('/api/auth/change-password', authenticateToken, validateRequest(changePasswordSchema), changePortalPassword(pool));
app.get('/api/profile/preferences', authenticateToken, getProfilePreferences(pool));
app.put('/api/profile/preferences', authenticateToken, validateRequest(profilePreferencesSchema), updateProfilePreferences(pool));
app.get('/api/profile/audit', authenticateToken, getMyAuditLogs(pool));
app.get('/api/profile/export', authenticateToken, sensitiveOpLimiter, exportPersonalData(pool));
app.get('/api/auth/sessions', authenticateToken, getProfileSessions(pool));
app.delete('/api/auth/sessions/:id', authenticateToken, sensitiveOpLimiter, revokeProfileSession(pool));

app.get('/api/auth/passkeys', authenticateToken, passkeyController.listPasskeys(pool));
app.post('/api/auth/passkeys/register/options', authenticateToken, sensitiveOpLimiter, validateRequest(passkeyRegistrationOptionsSchema), passkeyController.registrationOptions(pool));
app.post('/api/auth/passkeys/register/verify', authenticateToken, sensitiveOpLimiter, validateRequest(passkeyRegistrationVerifySchema), passkeyController.registrationVerify(pool));
app.patch('/api/auth/passkeys/:id', authenticateToken, sensitiveOpLimiter, validateRequest(passkeyRenameSchema), passkeyController.renamePasskey(pool));
app.delete('/api/auth/passkeys/:id', authenticateToken, sensitiveOpLimiter, validateRequest(passkeyRevokeSchema), passkeyController.revokePasskey(pool));

app.get('/api/profile/tokens', authenticateToken, tokenController.getTokens(pool));
app.post('/api/profile/tokens', authenticateToken, tokenController.createToken(pool));
app.delete('/api/profile/tokens/:id', authenticateToken, tokenController.revokeToken(pool));

// ─── Modular Domain Routers: Patients, Equipment & Appointments ──────────────
app.use('/api/patients', patientRoutes(pool, auditService));
app.use('/api', equipmentRoutes(pool));
app.use('/api', appointmentRoutes(pool, auditService));

// ─── Modular Domain Routers: Finance & Insurance ─────────────────────────────
// The licence gate now lives inside each router (see financeRoutes.js). It was
// previously mounted on the bare '/api' prefix here, which made it run for every
// route registered below and refuse trial licences on unrelated endpoints.
app.use('/api', financeRoutes(pool, auditService));
app.use('/api', insuranceRoutes(pool, auditService));

// ─── Modular Domain Routers: Clinical Exams & HR/Payroll ─────────────────────
app.use('/api', clinicalExamRoutes(pool, auditService));
app.use('/api', hrRoutes(pool, auditService));

// Phase 17: CRM & Marketing Routes
app.use('/api/audit-logs', checkFeature('audit'), auditRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/rbac', rbacRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/privacy', privacyRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/analytics', checkFeature('analytics'), analyticsRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/documents', documentRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/integrations', integrationRoutes(pool, authenticateToken, authorizeRole));

// ─── Webhook Routes (raw body enabled above, no JWT required) ──────────────────
app.post('/api/webhooks/stripe', verifyWebhookSignature(pool, 'Stripe'), async (req, res) => {
    const integrationService = new IntegrationService(pool);
    try {
        const event = req.body;
        const integration = await integrationService.getProviderConfig('Stripe');
        if (!integration) {
            return res.status(400).json({ error: 'Stripe integration not configured' });
        }

        const payload = { event_type: event.type, event_id: event.id, data: event.data };
        const idempotencyKey = `stripe:webhook:${event.id}`;

        if (event.type === 'payment_intent.succeeded') {
            const invoiceId = event.data?.object?.metadata?.invoiceId;
            const amount = event.data?.object?.amount / 100;
            const currency = event.data?.object?.currency;
            if (invoiceId && amount) {
                await integrationService.capturePayment(invoiceId, amount, currency, {
                    idempotencyKey,
                    webhookId: event.id,
                    providerResponse: payload
                });
            }
        }

        await integrationService.logEvent(
            integration.integration_id,
            `Stripe Webhook: ${event.type}`,
            payload,
            'Success',
            { idempotencyKey, webhookId: event.id }
        );

        res.json({ received: true });
    } catch (error) {
        console.error('[StripeWebhook] Error:', error.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

app.post('/api/webhooks/twilio', verifyWebhookSignature(pool, 'Twilio'), async (req, res) => {
    const integrationService = new IntegrationService(pool);
    try {
        const { MessageSid, MessageStatus, To, Body } = req.body;
        const integration = await integrationService.getProviderConfig('Twilio');
        if (!integration) {
            return res.status(400).json({ error: 'Twilio integration not configured' });
        }

        const payload = { message_sid: MessageSid, status: MessageStatus, to: To };
        const idempotencyKey = `twilio:webhook:${MessageSid}`;

        if (MessageSid) {
            await pool.query(`
                UPDATE notifications
                SET status = CASE WHEN $1::text IN ('delivered', 'sent') THEN 'Delivered' ELSE 'Failed' END
                WHERE provider_message_id = $2
                  AND status NOT IN ('Delivered', 'Failed')
            `, [MessageStatus || 'unknown', MessageSid]);
        }

        await integrationService.logEvent(
            integration.integration_id,
            `Twilio Webhook: ${MessageStatus || 'unknown'}`,
            payload,
            'Success',
            { idempotencyKey, webhookId: MessageSid }
        );

        res.sendStatus(204);
    } catch (error) {
        console.error('[TwilioWebhook] Error:', error.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
app.use('/api/settings', settingsRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/backups', checkFeature('backup'), backupRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/system', systemRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/license', licenseRoutes(pool, authenticateToken));

// Trial Analytics (Admin only - sales dashboard data)
app.get('/api/admin/trial-analytics', authenticateToken, authorizeRole(['Admin']), async (req, res, next) => {
    try {
        const { getTrialDashboardStats, getWeeklySummary } = require('./services/trialAnalyticsService');
        const [stats, weekly] = await Promise.all([
            getTrialDashboardStats(pool),
            getWeeklySummary(pool),
        ]);
        res.json({ stats, weekly });
    } catch (err) { next(err); }
});
app.use('/api/clinical', safetyRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/import', checkFeature('import'), importRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/pacs', checkFeature('pacs'), pacsRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/rooms', roomRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/reception', receptionRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/display', displayRoutes(pool, authenticateToken, authorizeRole));
app.use('/api/end-of-day', checkFeature('end-of-day'), endOfDayRoutes(pool, authenticateToken, authorizeRole));

app.use('/api/crm', checkFeature('crm'), crmRoutes(pool));
app.use('/api', inventoryRoutes(pool));
app.use('/api', portalRoutes(pool, auditService));
app.use('/api', notificationRoutes(pool));
app.use('/api', chatRoutes(pool, auditService));

// ─── Real-time SSE Connection ────────────────────────────────────────────────
// SSE session endpoint: exchanges a valid Bearer JWT for a short-lived
// purpose-scoped SSE session token. The frontend must call this before
// opening the EventSource stream to avoid placing the access JWT in the URL.
app.post('/api/realtime/session', authenticateToken, (req, res) => {
    const sessionToken = realtimeService.createSseSession(req.user);
    res.cookie('viaraSseSession', sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 5 * 60 * 1000,
        path: '/api/realtime'
    });
    res.json({ ok: true });
});
app.get('/api/realtime/stream', realtimeService.registerClient);

// 404 Handler - Must be after all routes
app.use(notFoundHandler);

// Centralized Error Handler - Must be last
app.use(errorHandler);

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
