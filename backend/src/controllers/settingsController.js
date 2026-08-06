const { AppError } = require('../middleware/errorHandler');
const { z } = require('zod');
const { Client } = require('pg');
const {
    updateCenterSettingsSchema,
    updateAiSettingsSchema,
    testAiSettingsSchema,
    aiProfileSchema,
    updateAiProfileSchema,
    databaseConfigSchema,
    testDatabaseConfigSchema
} = require('../schemas/settingsSchema');
const settingsService = require('../services/settingsService');
const aiReportService = require('../services/aiReportService');
const { decrypt, encrypt } = require('../utils/crypto');
const { getPacsAiConfig } = require('../services/pacsAiAnalysisService');
const {
    isConfigured: isCloudVisionConfigured,
    geminiRotator,
    normalizeOpenAiCompatibleChatUrl
} = require('../services/cloudVisionService');
const aiProfileService = require('../services/aiProfileService');
const { GEMINI_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL } = require('../services/aiModelPolicy');
const { validateCustomAiEndpointUrl } = require('../utils/customAiEndpointUrl');

const CLOUD_PACS_PROVIDERS = new Set(['cloud-gemini', 'cloud-openrouter', 'cloud-openai', 'cloud-custom']);
const REPORT_DEFAULT_MODELS = {
    anthropic: 'claude-3-5-sonnet-latest',
    openai: OPENAI_DEFAULT_MODEL,
    gemini: GEMINI_DEFAULT_MODEL,
    openrouter: 'openrouter/auto',
    groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
    custom: ''
};
const PACS_DEFAULT_MODELS = {
    'cloud-gemini': GEMINI_DEFAULT_MODEL,
    'cloud-openrouter': 'openrouter/auto',
    'cloud-openai': OPENAI_DEFAULT_MODEL,
    'cloud-custom': '',
    'local-torchxrayvision': 'densenet121-res224-all',
    'local-medgemma': 'google/medgemma-1.5-4b-it',
    custom: ''
};
const normalizePacsProvider = (value) => ({
    'local-worker': 'local-torchxrayvision',
    gemini: 'cloud-gemini',
    openrouter: 'cloud-openrouter',
    openai: 'cloud-openai'
}[String(value || '').toLowerCase()] || String(value || '').toLowerCase());

const resolveReportEnvKey = (provider) => {
    if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || '';
    if (provider === 'groq') return process.env.GROQ_API_KEY || process.env.AI_API_KEY || '';
    if (provider === 'openai') return process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
    return process.env.AI_API_KEY || '';
};

const resolvePacsEnvKey = (provider) => {
    if (provider === 'cloud-gemini') return process.env.PACS_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (provider === 'cloud-openrouter') return process.env.PACS_AI_API_KEY || process.env.OPENROUTER_API_KEY || '';
    if (provider === 'cloud-openai') return process.env.PACS_AI_API_KEY || process.env.OPENAI_API_KEY || '';
    return process.env.PACS_AI_API_KEY || '';
};

const parseBool = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).toLowerCase() === 'true';
};

const safeDecrypt = (value) => {
    if (!value) return '';
    try {
        return decrypt(value) || '';
    } catch {
        return '';
    }
};

const maskSecret = (value) => {
    const raw = String(value || '');
    if (!raw) return '';
    if (raw.length <= 8) return '••••';
    return `${raw.slice(0, 4)}••••${raw.slice(-4)}`;
};

const maskDbSecret = (value) => {
    const raw = String(value || '');
    if (!raw) return '';
    if (raw.length <= 8) return '****';
    return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
};

const parseDatabaseUrl = (databaseUrl) => {
    if (!databaseUrl) return null;
    try {
        const parsed = new URL(databaseUrl);
        if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return null;
        return {
            host: parsed.hostname,
            port: Number.parseInt(parsed.port || '5432', 10),
            database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
            username: decodeURIComponent(parsed.username || ''),
            passwordConfigured: Boolean(parsed.password),
            passwordPreview: maskDbSecret(decodeURIComponent(parsed.password || '')),
            sslMode: parsed.searchParams.get('sslmode') || 'prefer'
        };
    } catch {
        return null;
    }
};

const maskDatabaseConfig = (config = {}) => ({
    host: config.host || '',
    port: Number(config.port || 5432),
    database: config.database || '',
    username: config.username || '',
    passwordConfigured: Boolean(config.password),
    passwordPreview: maskDbSecret(config.password),
    sslMode: config.sslMode || 'prefer',
    poolMax: Number(config.poolMax || 20),
    statementTimeoutMs: Number(config.statementTimeoutMs || 30000),
    idleTimeoutMs: Number(config.idleTimeoutMs || 30000)
});

const getSavedDatabaseConfig = async ({ includePassword = false } = {}) => {
    const allSettings = await settingsService.getAll();
    const password = safeDecrypt(allSettings['developer.db.password_enc']);
    const hasAnySavedValue = [
        'developer.db.host',
        'developer.db.port',
        'developer.db.database',
        'developer.db.username',
        'developer.db.password_enc',
        'developer.db.ssl_mode'
    ].some(key => allSettings[key]);

    if (!hasAnySavedValue) return null;

    const config = {
        host: allSettings['developer.db.host'] || '',
        port: Number.parseInt(allSettings['developer.db.port'] || '5432', 10),
        database: allSettings['developer.db.database'] || '',
        username: allSettings['developer.db.username'] || '',
        password,
        sslMode: allSettings['developer.db.ssl_mode'] || 'prefer',
        poolMax: Number.parseInt(allSettings['developer.db.pool_max'] || '20', 10),
        statementTimeoutMs: Number.parseInt(allSettings['developer.db.statement_timeout_ms'] || '30000', 10),
        idleTimeoutMs: Number.parseInt(allSettings['developer.db.idle_timeout_ms'] || '30000', 10)
    };

    return includePassword ? config : maskDatabaseConfig(config);
};

const toConnectionConfig = (config) => ({
    host: config.host,
    port: Number(config.port || 5432),
    database: config.database,
    user: config.username,
    password: config.password || undefined,
    connectionTimeoutMillis: 8000,
    statement_timeout: Number(config.statementTimeoutMs || 30000),
    idle_in_transaction_session_timeout: Number(config.idleTimeoutMs || 30000),
    ssl: ['require', 'verify-ca', 'verify-full'].includes(config.sslMode)
        ? { rejectUnauthorized: config.sslMode === 'verify-full' }
        : undefined
});

const buildDatabaseUrlPreview = (config) => {
    const url = new URL('postgresql://localhost');
    url.hostname = config.host;
    url.port = String(config.port || 5432);
    url.username = config.username || '';
    if (config.password) url.password = '****';
    url.pathname = `/${config.database || ''}`;
    if (config.sslMode) url.searchParams.set('sslmode', config.sslMode);
    return url.toString();
};

const runDatabaseProbe = async (connectionConfig) => {
    const client = new Client(connectionConfig);
    const started = process.hrtime.bigint();
    await client.connect();
    try {
        const result = await client.query(`
            SELECT
                NOW() AS server_time,
                current_database() AS database,
                current_user AS username,
                version() AS version
        `);
        const elapsedMs = Number((process.hrtime.bigint() - started) / 1000000n);
        const row = result.rows[0] || {};
        return {
            success: true,
            latencyMs: elapsedMs,
            serverTime: row.server_time,
            database: row.database,
            username: row.username,
            version: String(row.version || '').split(',')[0]
        };
    } finally {
        await client.end().catch(() => {});
    }
};

const getCenterSettings = (db) => async (req, res, next) => {
    try {
        const allSettings = await settingsService.getAll();
        
        // Map system_settings (center.*) to the expected JSON format
        const parseJSONSafe = (str) => {
            if (!str) return null;
            try { return JSON.parse(str); } catch { return null; }
        };

        const data = {
            center_name: allSettings['center.name'] || '',
            branch_name: allSettings['center.branch'] || '',
            logo_url: allSettings['center.logo_url'] || '',
            contact_person: allSettings['center.contact_person'] || '',
            other_details: allSettings['center.other_details'] || '',
            tax_id: allSettings['center.tax_id'] || '',
            phone: allSettings['center.phone'] || '',
            email: allSettings['center.email'] || '',
            address: allSettings['center.address'] || '',
            invoice_prefix: allSettings['center.invoice_prefix'] || '',
            report_header: allSettings['center.report_header'] || '',
            report_footer: allSettings['center.report_footer'] || '',
            working_hours: parseJSONSafe(allSettings['center.working_hours']),
            print_settings: parseJSONSafe(allSettings['center.print_settings']),
            homepage_settings: parseJSONSafe(allSettings['center.homepage_settings'])
        };

        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getPublicCenterSettings = (db) => async (req, res, next) => {
    try {
        const allSettings = await settingsService.getAll();
        const parseJSONSafe = (str) => {
            if (!str) return null;
            try { return JSON.parse(str); } catch { return null; }
        };

        res.json({
            center_name: allSettings['center.name'] || '',
            branch_name: allSettings['center.branch'] || '',
            logo_url: allSettings['center.logo_url'] || '',
            phone: allSettings['center.phone'] || '',
            email: allSettings['center.email'] || '',
            address: allSettings['center.address'] || '',
            working_hours: parseJSONSafe(allSettings['center.working_hours']),
            homepage_settings: parseJSONSafe(allSettings['center.homepage_settings'])
        });
    } catch (error) {
        next(error);
    }
};

const updateCenterSettings = (db) => async (req, res, next) => {
    try {
        const data = updateCenterSettingsSchema.parse(req.body);

        // Save back to system_settings via SettingsService
        const updates = {
            'center.name': data.center_name || '',
            'center.branch': data.branch_name || '',
            'center.logo_url': data.logo_url || '',
            'center.contact_person': data.contact_person || '',
            'center.other_details': data.other_details || '',
            'center.tax_id': data.tax_id || '',
            'center.phone': data.phone || '',
            'center.email': data.email || '',
            'center.address': data.address || '',
            'center.invoice_prefix': data.invoice_prefix || '',
            'center.report_header': data.report_header || '',
            'center.report_footer': data.report_footer || '',
            'center.working_hours': data.working_hours ? JSON.stringify(data.working_hours) : '',
            'center.print_settings': data.print_settings ? JSON.stringify(data.print_settings) : '',
            'center.homepage_settings': data.homepage_settings ? JSON.stringify(data.homepage_settings) : ''
        };

        await settingsService.updateAll(updates);

        // Return updated data to frontend in the same format
        res.json({
            ...data,
            working_hours: data.working_hours || null,
            print_settings: data.print_settings || null,
            homepage_settings: data.homepage_settings || null
        });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const buildAiSettingsResponse = async () => {
    const profileGroups = await aiProfileService.listProfiles();
    const report = profileGroups.report.profiles.find((item) => item.active) || profileGroups.report.profiles[0];
    const pacs = profileGroups.pacs.profiles.find((item) => item.active) || profileGroups.pacs.profiles[0];
    if (report && pacs) return { report, pacs, profiles: profileGroups };

    const allSettings = await settingsService.getAll();
    const reportProvider = (allSettings['ai.report.provider'] || process.env.AI_PROVIDER || 'anthropic').toLowerCase();
    const pacsProvider = normalizePacsProvider(allSettings['ai.pacs.provider'] || process.env.PACS_AI_PROVIDER || 'local-torchxrayvision');
    const storedReportKeyProvider = (allSettings['ai.report.api_key_provider'] || reportProvider).toLowerCase();
    const storedPacsKeyProvider = normalizePacsProvider(allSettings['ai.pacs.api_key_provider'] || pacsProvider);
    const storedReportKey = storedReportKeyProvider === reportProvider
        ? safeDecrypt(allSettings['ai.report.api_key_enc'])
        : '';
    const storedPacsKey = storedPacsKeyProvider === pacsProvider
        ? safeDecrypt(allSettings['ai.pacs.api_key_enc'])
        : '';
    const reportEnvKey = resolveReportEnvKey(reportProvider);
    const pacsEnvKey = resolvePacsEnvKey(pacsProvider);
    const reportKey = storedReportKey || reportEnvKey;
    const pacsKey = storedPacsKey || pacsEnvKey;
    const reportModel = allSettings['ai.report.model'] || process.env.AI_MODEL || REPORT_DEFAULT_MODELS[reportProvider] || '';
    const pacsModel = allSettings['ai.pacs.model'] || process.env.PACS_AI_MODEL || PACS_DEFAULT_MODELS[pacsProvider] || '';

    return {
        report: {
            enabled: parseBool(allSettings['ai.report.enabled'], Boolean(reportKey)),
            provider: reportProvider,
            model: reportModel,
            baseUrl: allSettings['ai.report.base_url'] || process.env.AI_BASE_URL || '',
            apiKeyConfigured: Boolean(reportKey),
            apiKeyPreview: maskSecret(reportKey),
            apiKeyProvider: storedReportKey ? storedReportKeyProvider : (reportEnvKey ? reportProvider : null),
            source: storedReportKey ? 'settings' : (reportEnvKey ? 'env' : 'none')
        },
        pacs: {
            enabled: parseBool(allSettings['ai.pacs.enabled'], false),
            provider: pacsProvider,
            model: pacsModel,
            modelVersion: allSettings['ai.pacs.model_version'] || process.env.PACS_AI_MODEL_VERSION || '',
            workerUrl: allSettings['ai.pacs.worker_url'] || process.env.PACS_AI_WORKER_URL || '',
            baseUrl: allSettings['ai.pacs.base_url'] || process.env.PACS_AI_BASE_URL || '',
            apiKeyConfigured: Boolean(pacsKey),
            apiKeyPreview: maskSecret(pacsKey),
            apiKeyProvider: storedPacsKey ? storedPacsKeyProvider : (pacsEnvKey ? pacsProvider : null),
            source: storedPacsKey ? 'settings' : (pacsEnvKey ? 'env' : 'none')
        }
    };
};

const getAiSettings = () => async (req, res, next) => {
    try {
        res.json(await buildAiSettingsResponse());
    } catch (error) {
        next(error);
    }
};

const getAiSettingsStatus = () => async (req, res, next) => {
    try {
        const settings = await buildAiSettingsResponse();
        res.json({
            report: {
                enabled: Boolean(settings.report.enabled),
                configured: Boolean(settings.report.configured),
                profileId: settings.report.id || null,
                profileName: settings.report.name || null,
                provider: settings.report.provider || null,
                model: settings.report.model || null,
                source: settings.report.source || 'none'
            },
            pacs: {
                enabled: Boolean(settings.pacs.enabled),
                configured: Boolean(settings.pacs.configured),
                profileId: settings.pacs.id || null,
                profileName: settings.pacs.name || null,
                provider: settings.pacs.provider || null,
                model: settings.pacs.model || null,
                workerConfigured: Boolean(settings.pacs.workerUrl),
                source: settings.pacs.source || 'none'
            }
        });
    } catch (error) {
        next(error);
    }
};

const updateAiSettings = () => async (req, res, next) => {
    try {
        const data = await updateAiSettingsSchema.parseAsync(req.body || {});
        const groups = await aiProfileService.listProfiles();
        if (data.report) {
            const active = groups.report.profiles.find((item) => item.active) || groups.report.profiles[0];
            await aiProfileService.updateProfile(active.id, data.report);
        }
        if (data.pacs) {
            const active = groups.pacs.profiles.find((item) => item.active) || groups.pacs.profiles[0];
            await aiProfileService.updateProfile(active.id, data.pacs);
        }
        res.json(await buildAiSettingsResponse());
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const getAiProfiles = () => async (req, res, next) => {
    try { res.json(await aiProfileService.listProfiles()); } catch (error) { next(error); }
};

const createAiProfile = () => async (req, res, next) => {
    try {
        const data = await aiProfileSchema.parseAsync(req.body || {});
        const profile = await aiProfileService.createProfile(data);
        res.status(201).json({ profile, profiles: await aiProfileService.listProfiles() });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError('Invalid AI profile configuration', 400));
        next(error);
    }
};

const updateAiProfile = () => async (req, res, next) => {
    try {
        const data = await updateAiProfileSchema.parseAsync(req.body || {});
        const profile = await aiProfileService.updateProfile(req.params.id, data);
        res.json({ profile, profiles: await aiProfileService.listProfiles() });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError('Invalid AI profile configuration', 400));
        next(error);
    }
};

const activateAiProfile = () => async (req, res, next) => {
    try {
        const profile = await aiProfileService.activateProfile(req.params.id);
        res.json({ profile, profiles: await aiProfileService.listProfiles() });
    } catch (error) { next(error); }
};

const deleteAiProfile = () => async (req, res, next) => {
    try {
        await aiProfileService.deleteProfile(req.params.id);
        res.json({ success: true, profiles: await aiProfileService.listProfiles() });
    } catch (error) { next(error); }
};

const testAiSettings = () => async (req, res, next) => {
    try {
        const { target } = testAiSettingsSchema.parse(req.body || {});
        if (target === 'report') {
            const result = await aiReportService.testConnection();
            return res.json({ success: true, target, ...result });
        }

        const config = await getPacsAiConfig();

        // ── Cloud provider test: ping provider API directly ──────────────────────
        if (CLOUD_PACS_PROVIDERS.has(config.provider)) {
            // config.apiKey is already decrypted by getPacsAiConfig (DB > env)
            if (!isCloudVisionConfigured(config.apiKey || undefined, config.provider, config.baseUrl || undefined)) {
                return res.json({
                    success: false,
                    target,
                    mode: 'cloud',
                    message: `Cloud vision is not fully configured for ${config.provider}. Save required API keys or URLs.`
                });
            }

            // Quick connectivity check:
            let pingUrl;
            let headers = {};
            let requestInit = {};
            if (config.provider === 'cloud-openrouter') {
                const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
                pingUrl = 'https://openrouter.ai/api/v1/models';
                headers = { Authorization: `Bearer ${apiKey}` };
            } else if (config.provider === 'cloud-openai') {
                const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
                pingUrl = `https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`;
                headers = { Authorization: `Bearer ${apiKey}` };
            } else if (config.provider === 'cloud-custom') {
                const apiKey = config.apiKey;
                const safeBaseUrl = await validateCustomAiEndpointUrl(config.baseUrl);
                pingUrl = normalizeOpenAiCompatibleChatUrl(safeBaseUrl);
                headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
                if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
                requestInit = {
                    method: 'POST',
                    redirect: 'error',
                    body: JSON.stringify({
                        model: config.model,
                        messages: [{ role: 'user', content: 'Reply with only: ok' }],
                        max_tokens: 8,
                        stream: false
                    })
                };
            } else {
                // Default: Gemini
                const apiKey = config.apiKey || geminiRotator.getNext() || process.env.GEMINI_API_KEY;
                pingUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}?key=${apiKey}`;
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            let pingResponse;
            try {
                pingResponse = await fetch(pingUrl, { ...requestInit, headers, signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }
            const responseContentType = pingResponse.headers?.get?.('content-type') || '';
            const pingText = await pingResponse.text().catch(() => '');
            const returnedHtml = responseContentType.toLowerCase().includes('text/html') ||
                /^\s*<!doctype\s+html/i.test(pingText) || /^\s*<html/i.test(pingText);
            let pingBody = null;
            if (!returnedHtml) {
                try { pingBody = pingText ? JSON.parse(pingText) : null; } catch { /* Invalid JSON is handled below. */ }
            }
            const providerContractValid = config.provider === 'cloud-gemini'
                ? pingBody?.supportedGenerationMethods?.includes('generateContent')
                : config.provider === 'cloud-custom'
                    ? Boolean(pingBody?.choices?.[0]?.message)
                    : Boolean(pingBody);
            const success = pingResponse.ok && providerContractValid && !returnedHtml;
            const customFailure = config.provider === 'cloud-custom'
                ? returnedHtml
                    ? 'Custom endpoint returned an HTML webpage. Enter an OpenAI-compatible API base URL ending in /v1 or a full /chat/completions endpoint.'
                    : !pingBody
                        ? 'Custom endpoint did not return valid JSON.'
                        : !providerContractValid
                            ? 'Custom endpoint JSON does not match the OpenAI chat-completions response contract.'
                            : null
                : null;
            return res.json({
                success,
                target,
                mode: 'cloud',
                provider: config.provider,
                model: config.model,
                message: success
                    ? config.provider === 'cloud-custom'
                        ? `Custom provider (${config.model}) passed an OpenAI-compatible generation test.`
                        : `Cloud vision (${config.provider}/${config.model}) is reachable and supports image analysis.`
                    : customFailure
                        ? customFailure
                    : pingResponse.ok
                        ? `Model ${config.model} does not support generateContent. Select a current multimodal model.`
                        : `Cloud vision model ${config.model} returned HTTP ${pingResponse.status}. Verify the model ID and API key.`
            });
        }

        // ── Local worker test: ping /health endpoint ────────────────────────────
        if (!config.workerUrl) {
            return res.json({
                success: true,
                target,
                mode: 'queue-only',
                message: 'PACS AI queue is configured without a worker URL. Jobs can be queued but will not be processed automatically.'
            });
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs || 120000, 15000));
        const headers = { Accept: 'application/json' };
        if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

        let response;
        try {
            response = await fetch(`${config.workerUrl}/health`, {
                headers,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }

        const contentType = response.headers.get('content-type') || '';
        const detail = contentType.toLowerCase().includes('application/json')
            ? await response.json().catch(() => null)
            : null;
        res.json({
            success: response.ok,
            target,
            status: response.status,
            mode: 'worker',
            detail,
            message: response.ok ? 'PACS AI worker responded.' : 'PACS AI worker health check failed.'
        });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error.name === 'AbortError') return next(new AppError('PACS AI worker health check timed out.', 504));
        next(error);
    }
};

const getDatabaseSettings = (db) => async (req, res, next) => {
    try {
        const active = parseDatabaseUrl(process.env.DATABASE_URL);
        const saved = await getSavedDatabaseConfig();
        res.json({
            active: active ? {
                ...active,
                source: 'env',
                poolMax: db.options?.max || null,
                idleTimeoutMs: db.options?.idleTimeoutMillis || null,
                connectionTimeoutMs: db.options?.connectionTimeoutMillis || null
            } : null,
            saved,
            pool: {
                total: db.totalCount ?? null,
                idle: db.idleCount ?? null,
                waiting: db.waitingCount ?? null
            },
            flags: {
                restartRequired: true,
                liveSwitchSupported: false,
                passwordEditable: true
            }
        });
    } catch (error) {
        next(error);
    }
};

const updateDatabaseSettings = () => async (req, res, next) => {
    try {
        const data = databaseConfigSchema.parse(req.body || {});
        const previous = await getSavedDatabaseConfig({ includePassword: true });
        const password = data.keepExistingPassword && previous?.password !== undefined
            ? previous.password
            : data.password || '';

        await settingsService.updateAll({
            'developer.db.host': data.host,
            'developer.db.port': String(data.port),
            'developer.db.database': data.database,
            'developer.db.username': data.username,
            'developer.db.password_enc': password ? encrypt(password) : '',
            'developer.db.ssl_mode': data.sslMode,
            'developer.db.pool_max': String(data.poolMax),
            'developer.db.statement_timeout_ms': String(data.statementTimeoutMs),
            'developer.db.idle_timeout_ms': String(data.idleTimeoutMs)
        });

        const saved = await getSavedDatabaseConfig();
        res.json({
            saved,
            connectionUrlPreview: buildDatabaseUrlPreview({ ...data, password }),
            restartRequired: true,
            message: 'Database configuration saved. Restart or redeploy the backend to use it as the active connection.'
        });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const testDatabaseSettings = (db) => async (req, res, next) => {
    try {
        const data = testDatabaseConfigSchema.parse(req.body || {});

        if (data.target === 'active') {
            const started = process.hrtime.bigint();
            const result = await db.query(`
                SELECT
                    NOW() AS server_time,
                    current_database() AS database,
                    current_user AS username,
                    version() AS version
            `);
            const row = result.rows[0] || {};
            return res.json({
                success: true,
                target: 'active',
                latencyMs: Number((process.hrtime.bigint() - started) / 1000000n),
                serverTime: row.server_time,
                database: row.database,
                username: row.username,
                version: String(row.version || '').split(',')[0],
                pool: {
                    total: db.totalCount ?? null,
                    idle: db.idleCount ?? null,
                    waiting: db.waitingCount ?? null
                }
            });
        }

        const savedConfig = data.target === 'saved' || data.config?.keepExistingPassword
            ? await getSavedDatabaseConfig({ includePassword: true })
            : null;
        const candidate = data.target === 'saved'
            ? savedConfig
            : data.config?.keepExistingPassword
                ? { ...data.config, password: savedConfig?.password || '' }
                : data.config;

        if (!candidate) {
            return next(new AppError('No saved database configuration is available to test', 400));
        }

        const result = await runDatabaseProbe(toConnectionConfig(candidate));
        res.json({ ...result, target: data.target });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(new AppError(`Database connection test failed: ${error.message}`, 400));
    }
};

module.exports = {
    getCenterSettings,
    getPublicCenterSettings,
    updateCenterSettings,
    getDatabaseSettings,
    updateDatabaseSettings,
    testDatabaseSettings,
    getAiSettingsStatus,
    getAiSettings,
    updateAiSettings,
    testAiSettings,
    getAiProfiles,
    createAiProfile,
    updateAiProfile,
    activateAiProfile,
    deleteAiProfile
};
