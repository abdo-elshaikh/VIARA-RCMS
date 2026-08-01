const logger = require('../config/logger');
const { z } = require('zod');
const settingsService = require('./settingsService');
const { decrypt } = require('../utils/crypto');
const { writeAudit } = require('./pacsReconcileService');
const cloudVisionService = require('./cloudVisionService');
const aiProfileService = require('./aiProfileService');
const { GEMINI_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL, normalizeAiModel } = require('./aiModelPolicy');

const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_BATCH_SIZE = 2;
const DEFAULT_PROVIDER = 'local-torchxrayvision';
const DEFAULT_MODEL = 'densenet121-res224-all';
const DEFAULT_MODELS = {
    'cloud-gemini': GEMINI_DEFAULT_MODEL,
    'cloud-openrouter': 'openrouter/auto',
    'cloud-openai': OPENAI_DEFAULT_MODEL,
    'cloud-custom': '',
    'local-torchxrayvision': DEFAULT_MODEL,
    'local-medgemma': 'google/medgemma-1.5-4b-it',
    custom: ''
};
const MAX_WORKER_RESPONSE_BYTES = 2 * 1024 * 1024;

// Providers that dispatch to built-in cloud services instead of a local HTTP worker.
// When the active provider is in this set, PACS_AI_WORKER_URL is not required.
const CLOUD_PROVIDERS = new Set(['cloud-gemini', 'cloud-openrouter', 'cloud-openai', 'cloud-custom']);
const CLOUD_PROVIDERS_WITH_FIXED_ENDPOINTS = new Set(['cloud-gemini', 'cloud-openrouter', 'cloud-openai']);

const workerResultSchema = z.object({
    success: z.literal(true),
    status: z.literal('Completed'),
    resultType: z.string().min(1).max(80),
    summary: z.string().min(1).max(4000),
    findings: z.array(z.object({
        label: z.string().min(1).max(120),
        present: z.boolean().default(true),
        confidence: z.number().min(0).max(1).nullable().optional(),
        location: z.string().max(160).nullable().optional(),
        description: z.string().max(1000).default(''),
        evidence: z.array(z.number().int().nonnegative()).max(20).default([])
    }).passthrough()).max(40),
    impression: z.string().max(4000).default(''),
    limitations: z.array(z.string().max(1000)).max(20),
    quality: z.object({
        diagnostic: z.boolean(),
        supported: z.boolean(),
        modality: z.string().max(20),
        views: z.array(z.string().max(30)).max(10).default([]),
        imageCountAnalyzed: z.number().int().nonnegative()
    }).passthrough(),
    model: z.object({
        provider: z.string().min(1).max(100),
        name: z.string().min(1).max(200),
        revision: z.string().min(1).max(200),
        backend: z.string().min(1).max(100)
    }).passthrough(),
    evidence: z.array(z.object({
        seriesInstanceUid: z.string().min(1).max(128),
        sopInstanceUid: z.string().min(1).max(128),
        viewPosition: z.string().max(30).nullable().optional()
    }).passthrough()).max(20).default([]),
    provenance: z.record(z.unknown()).default({})
}).passthrough();

const validateWorkerResult = (value) => workerResultSchema.parse(value);

const isAbortLikeError = (error) => (
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    /aborted|abort/i.test(String(error?.message || ''))
);

const normalizeFailureMessage = (error, fallback = 'PACS AI analysis failed') => {
    if (error?.code === 'REQUEST_TIMEOUT' || error?.name === 'TimeoutError') {
        return String(error.message || fallback);
    }
    if (isAbortLikeError(error)) {
        return 'PACS AI provider request was aborted, most likely because the configured timeout was reached.';
    }
    return String(error?.message || error || fallback);
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

const normalizeWorkerUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
const normalizeProvider = (value) => ({
    'local-worker': 'local-torchxrayvision',
    gemini: 'cloud-gemini',
    openrouter: 'cloud-openrouter',
    openai: 'cloud-openai'
}[String(value || '').toLowerCase()] || String(value || '').toLowerCase());

const getPacsAiConfig = async () => {
    const activeProfile = await aiProfileService.getActiveConfig('pacs');
    if (activeProfile) {
        return {
            enabled: Boolean(activeProfile.enabled),
            provider: activeProfile.provider,
            model: normalizeAiModel(
                'pacs',
                activeProfile.provider,
                activeProfile.model,
                DEFAULT_MODELS[activeProfile.provider] || DEFAULT_MODEL
            ),
            modelVersion: activeProfile.modelVersion || '',
            workerUrl: normalizeWorkerUrl(activeProfile.workerUrl),
            baseUrl: activeProfile.baseUrl || '',
            apiKey: activeProfile.apiKey || '',
            timeoutMs: Number(process.env.PACS_AI_WORKER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
            profileId: activeProfile.id,
            profileName: activeProfile.name
        };
    }
    const settings = await settingsService.getAll();
    const provider = normalizeProvider(settings['ai.pacs.provider'] || process.env.PACS_AI_PROVIDER || DEFAULT_PROVIDER);
    const keyProvider = normalizeProvider(settings['ai.pacs.api_key_provider'] || provider);
    const storedApiKey = keyProvider === provider
        ? safeDecrypt(settings['ai.pacs.api_key_enc'])
        : '';
    const providerEnvKey = provider === 'cloud-gemini'
        ? process.env.GEMINI_API_KEY
        : (provider === 'cloud-openrouter'
            ? process.env.OPENROUTER_API_KEY
            : (provider === 'cloud-openai' ? process.env.OPENAI_API_KEY : ''));
    const apiKey = storedApiKey || process.env.PACS_AI_API_KEY || providerEnvKey || '';
    const workerUrl = normalizeWorkerUrl(settings['ai.pacs.worker_url'] || process.env.PACS_AI_WORKER_URL || '');

    return {
        enabled: parseBool(settings['ai.pacs.enabled'], parseBool(process.env.PACS_AI_ENABLED, false)),
        provider,
        model: normalizeAiModel(
            'pacs',
            provider,
            settings['ai.pacs.model'] || process.env.PACS_AI_MODEL,
            DEFAULT_MODELS[provider] || DEFAULT_MODEL
        ),
        modelVersion: settings['ai.pacs.model_version'] || process.env.PACS_AI_MODEL_VERSION || '',
        workerUrl,
        baseUrl: settings['ai.pacs.base_url'] || process.env.PACS_AI_BASE_URL || '',
        apiKey,
        timeoutMs: Number(process.env.PACS_AI_WORKER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
    };
};

const claimQueuedJobs = async (pool, limit = DEFAULT_BATCH_SIZE) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `WITH picked AS (
                SELECT job_id
                FROM pacs_ai_analysis_jobs
                WHERE status = 'Queued'
                ORDER BY
                    CASE priority
                        WHEN 'Emergency' THEN 1
                        WHEN 'Urgent' THEN 2
                        ELSE 3
                    END,
                    created_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
             )
             UPDATE pacs_ai_analysis_jobs j
             SET status = 'Running',
                 started_at = COALESCE(j.started_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP,
                 error_message = NULL,
                 result_payload = COALESCE(j.result_payload, '{}'::jsonb) || $2::jsonb
             FROM picked
             WHERE j.job_id = picked.job_id
             RETURNING j.*`,
            [
                Math.max(1, Number(limit) || DEFAULT_BATCH_SIZE),
                JSON.stringify({ state: 'running', message: 'PACS AI worker dispatch started.' })
            ]
        );
        await client.query('COMMIT');
        return rows;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const getExamContext = async (pool, job) => {
    const { rows } = await pool.query(
        `SELECT e.exam_id, e.order_number, e.study_instance_uid, e.orthanc_study_id,
                e.status, e.priority, e.clinical_indication, e.provisional_diagnosis,
                e.body_part, e.contrast_required, e.image_count,
                e.pregnancy_safety_status, e.implant_safety_status, e.renal_safety_status,
                et.name AS exam_type_name, et.code AS exam_type_code,
                m.name AS modality_name, m.type AS modality_type,
                p.mrn, p.gender
         FROM examinations e
         JOIN patients p ON p.patient_id = e.patient_id
         LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
         LEFT JOIN modalities m ON m.modality_id = e.modality_id
         WHERE e.exam_id = $1
         LIMIT 1`,
        [job.exam_id]
    );

    return rows[0] || null;
};

const getSeriesContext = async (pool, studyInstanceUid) => {
    const { rows } = await pool.query(
        `SELECT ps.series_instance_uid, ps.series_number, ps.modality,
                ps.series_description, ps.body_part_examined,
                COUNT(pi.sop_instance_uid)::int AS instance_count,
                JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'sopInstanceUid', pi.sop_instance_uid,
                        'instanceNumber', pi.instance_number,
                        'orthancId', pi.orthanc_id,
                        'sopClassUid', pi.sop_class_uid,
                        'storageTier', pi.storage_tier
                    )
                    ORDER BY pi.instance_number ASC NULLS LAST
                ) FILTER (WHERE pi.sop_instance_uid IS NOT NULL) AS instances
         FROM pacs_series ps
         LEFT JOIN pacs_instances pi ON pi.series_instance_uid = ps.series_instance_uid
         WHERE ps.study_instance_uid = $1
         GROUP BY ps.series_instance_uid
         ORDER BY ps.series_number ASC NULLS LAST`,
        [studyInstanceUid]
    );

    return rows.map((row) => ({
        seriesInstanceUid: row.series_instance_uid,
        seriesNumber: row.series_number,
        modality: row.modality,
        description: row.series_description,
        bodyPart: row.body_part_examined,
        instanceCount: Number(row.instance_count || 0),
        instances: row.instances || []
    }));
};

const buildWorkerPayload = async (pool, job, config) => {
    const exam = await getExamContext(pool, job);
    const series = await getSeriesContext(pool, job.study_instance_uid);

    return {
        job: {
            id: job.job_id,
            analysisType: job.analysis_type,
            priority: job.priority,
            requestedAt: job.created_at
        },
        ai: {
            provider: job.provider || config.provider,
            model: job.model || config.model,
            modelVersion: job.model_version || config.modelVersion
        },
        study: {
            examId: job.exam_id,
            orderNumber: exam?.order_number || null,
            studyInstanceUid: job.study_instance_uid,
            orthancStudyId: job.orthanc_study_id || exam?.orthanc_study_id || null,
            modality: exam?.modality_type || exam?.modality_name || null,
            examType: exam?.exam_type_name || null,
            examCode: exam?.exam_type_code || null,
            bodyPart: exam?.body_part || null,
            contrastRequired: Boolean(exam?.contrast_required),
            imageCount: Number(exam?.image_count || 0),
            clinicalIndication: exam?.clinical_indication || null,
            provisionalDiagnosis: exam?.provisional_diagnosis || null,
            safety: {
                pregnancy: exam?.pregnancy_safety_status || null,
                implants: exam?.implant_safety_status || null,
                renal: exam?.renal_safety_status || null
            }
        },
        patient: {
            mrn: exam?.mrn || null,
            gender: exam?.gender || null
        },
        series
    };
};

const parseJsonResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_WORKER_RESPONSE_BYTES) {
        throw new Error('PACS AI worker response exceeds the 2 MB limit');
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_WORKER_RESPONSE_BYTES) {
        throw new Error('PACS AI worker response exceeds the 2 MB limit');
    }
    if (!text) return {};
    if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(`PACS AI worker returned non-JSON response (${response.status})`);
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('PACS AI worker returned invalid JSON');
    }
};

const summarizeResult = (result) => {
    if (typeof result?.summary === 'string' && result.summary.trim()) return result.summary.trim();
    if (typeof result?.result_summary === 'string' && result.result_summary.trim()) return result.result_summary.trim();
    if (typeof result?.impression === 'string' && result.impression.trim()) return result.impression.trim();
    if (Array.isArray(result?.findings) && result.findings.length) {
        return result.findings
            .map((finding) => finding?.label || finding?.text || finding?.description)
            .filter(Boolean)
            .slice(0, 5)
            .join('; ');
    }
    return 'PACS AI analysis completed. Review the structured result before using it in a report.';
};

const completeJob = async (pool, job, result) => {
    const resultPayload = {
        state: 'completed',
        completedAt: new Date().toISOString(),
        progress: {
            phase: 'completed',
            current: result?.quality?.imageCountAnalyzed || 0,
            total: result?.quality?.imageCountAnalyzed || 0,
            studyImageCount: result?.provenance?.coverage?.studyImageCount || 0
        },
        worker: result
    };

    const { rows } = await pool.query(
        `UPDATE pacs_ai_analysis_jobs
         SET status = 'Completed',
             result_summary = $2,
             result_payload = COALESCE(result_payload, '{}'::jsonb) || $3::jsonb,
             error_message = NULL,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE job_id = $1
         RETURNING *`,
        [job.job_id, summarizeResult(result), JSON.stringify(resultPayload)]
    );

    await writeAudit(pool, {
        eventType: 'AI_ANALYSIS_COMPLETED',
        studyInstanceUid: job.study_instance_uid,
        detail: {
            job_id: job.job_id,
            exam_id: job.exam_id,
            requested_provider: job.provider,
            requested_model: job.model,
            actual_provider: result?.model?.provider || job.provider,
            actual_model: result?.model?.name || job.model
        }
    });

    return rows[0];
};

const failJob = async (pool, job, error) => {
    const message = normalizeFailureMessage(error).slice(0, 1000);
    const { rows } = await pool.query(
        `UPDATE pacs_ai_analysis_jobs
         SET status = 'Failed',
             error_message = $2,
             result_payload = COALESCE(result_payload, '{}'::jsonb) || $3::jsonb,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE job_id = $1
         RETURNING *`,
        [
            job.job_id,
            message,
            JSON.stringify({ state: 'failed', failedAt: new Date().toISOString(), message })
        ]
    );

    await writeAudit(pool, {
        eventType: 'AI_ANALYSIS_FAILED',
        studyInstanceUid: job.study_instance_uid,
        detail: {
            job_id: job.job_id,
            exam_id: job.exam_id,
            error: message
        }
    });

    return rows[0];
};

const dispatchJobToWorker = async (pool, job, config) => {
    const effectiveProvider = job.provider || config.provider;
    const effectiveModel = job.model || config.model;

    if (effectiveProvider !== config.provider) {
        throw new Error(
            `AI provider profile changed from ${effectiveProvider} to ${config.provider}. Retry the job to use the active profile.`
        );
    }
    const payload = await buildWorkerPayload(pool, job, config);

    // ── Cloud dispatch (built-in, no external HTTP worker required) ──────────
    if (CLOUD_PROVIDERS.has(effectiveProvider)) {
        if (!cloudVisionService.isConfigured(config.apiKey || undefined, effectiveProvider, config.baseUrl || undefined)) {
            throw new Error(`Cloud vision is not fully configured for provider ${effectiveProvider} (missing API key or Base URL).`);
        }
        if (config.baseUrl && CLOUD_PROVIDERS_WITH_FIXED_ENDPOINTS.has(effectiveProvider)) {
            logger.warn('[PacsAI] PACS AI baseUrl is ignored for fixed cloud provider; use cloud-custom for OpenAI-compatible endpoints.', {
                job_id: job.job_id,
                provider: effectiveProvider,
                baseUrl: config.baseUrl
            });
        }

        logger.info('[PacsAI] Using built-in cloud vision dispatch', {
            job_id: job.job_id,
            provider: effectiveProvider,
            model: effectiveModel
        });
        const result = cloudVisionService.analyzeStudy(payload, {
            apiKey: config.apiKey || undefined,
            baseUrl: config.baseUrl || undefined,
            provider: effectiveProvider,
            model: effectiveModel,
            onProgress: async (progress) => {
                const message = progress.phase === 'provider_retry'
                    ? `OpenAI rate limit reached. Retrying in ${Math.ceil(Number(progress.retryAfterMs || 0) / 1000)} seconds (${progress.current}/${progress.total}).`
                    : `Preparing case images ${progress.current}/${progress.total}`;
                await pool.query(
                    `UPDATE pacs_ai_analysis_jobs
                     SET result_payload = COALESCE(result_payload, '{}'::jsonb) || $2::jsonb,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE job_id = $1 AND status = 'Running'`,
                    [
                        job.job_id,
                        JSON.stringify({
                            state: 'running',
                            message,
                            progress
                        })
                    ]
                );
            }
        });
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const error = new Error(`Cloud vision timed out after ${config.timeoutMs}ms`);
                error.name = 'TimeoutError';
                error.code = 'REQUEST_TIMEOUT';
                reject(error);
            }, config.timeoutMs);
        });
        const resolved = await Promise.race([result, timeout]).finally(() => clearTimeout(timeoutId));
        const validated = workerResultSchema.safeParse(resolved);
        if (!validated.success) {
            logger.error('Cloud vision returned an invalid result contract', {
                job_id: job.job_id,
                issues: validated.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }))
            });
            throw new Error('Cloud vision returned an invalid result contract');
        }
        return completeJob(pool, job, validated.data);
    }

    // ── Local HTTP worker dispatch ────────────────────────────────────────────
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };
        if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

        const response = await fetch(`${config.workerUrl}/analyze`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        const result = await parseJsonResponse(response);

        if (!response.ok || result?.success === false || result?.status === 'Failed') {
            throw new Error(result?.message || result?.error || `PACS AI worker failed (${response.status})`);
        }

        const validated = workerResultSchema.safeParse(result);
        if (!validated.success) {
            logger.error('PACS AI worker returned an invalid result contract', {
                job_id: job.job_id,
                issues: validated.error.issues.slice(0, 10).map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message
                }))
            });
            throw new Error('PACS AI worker returned an invalid result contract');
        }

        return completeJob(pool, job, validated.data);
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`PACS AI worker timed out after ${config.timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const resetStaleRunningJobs = async (pool) => {
    const staleMinutes = Math.max(10, Number(process.env.PACS_AI_RUNNING_TIMEOUT_MINUTES || 60));
    const { rowCount } = await pool.query(
        `UPDATE pacs_ai_analysis_jobs
         SET status = 'Failed',
             error_message = $2,
             result_payload = COALESCE(result_payload, '{}'::jsonb) || $3::jsonb,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE status = 'Running'
           AND started_at < CURRENT_TIMESTAMP - ($1::text || ' minutes')::interval`,
        [
            staleMinutes,
            `PACS AI worker did not complete within ${staleMinutes} minutes.`,
            JSON.stringify({ state: 'failed', message: 'Running job exceeded worker timeout window.' })
        ]
    );

    return rowCount;
};

const processQueuedPacsAiJobs = async (pool, limit = DEFAULT_BATCH_SIZE) => {
    const config = await getPacsAiConfig();
    if (!config.enabled) return { processed: 0, skipped: true, reason: 'disabled' };

    // Cloud providers don't need a workerUrl — check key availability instead
    if (CLOUD_PROVIDERS.has(config.provider)) {
        if (!cloudVisionService.isConfigured(
            config.apiKey || undefined,
            config.provider,
            config.baseUrl || undefined
        )) {
            return { processed: 0, skipped: true, reason: 'missing_cloud_api_key' };
        }
    } else if (!config.workerUrl) {
        return { processed: 0, skipped: true, reason: 'missing_worker_url' };
    }

    const staleFailed = await resetStaleRunningJobs(pool);
    const jobs = await claimQueuedJobs(pool, limit);
    let completed = 0;
    let failed = 0;
    const actualProviders = new Set();
    const actualModels = new Set();

    for (const job of jobs) {
        try {
            const completedJob = await dispatchJobToWorker(pool, job, config);
            const actualModel = completedJob?.result_payload?.worker?.model;
            if (actualModel?.provider) actualProviders.add(actualModel.provider);
            if (actualModel?.name) actualModels.add(actualModel.name);
            completed += 1;
        } catch (error) {
            failed += 1;
            await failJob(pool, job, error).catch((failError) => {
                logger.error('PACS AI job failure update failed', {
                    job_id: job.job_id,
                    error: failError.message
                });
            });
            logger.error('PACS AI job failed', {
                job_id: job.job_id,
                exam_id: job.exam_id,
                error: normalizeFailureMessage(error),
                errorCode: error?.code || null,
                errorName: error?.name || null,
                provider: config.provider,
                baseUrl: config.baseUrl || null,
                orthancUrl: process.env.ORTHANC_URL || process.env.ORTHANC_API_URL || 'http://orthanc:8042'
            });
        }
    }

    return {
        processed: jobs.length,
        completed,
        failed,
        staleFailed,
        workerUrl: config.workerUrl,
        provider: config.provider,
        model: config.model,
        actualProviders: [...actualProviders],
        actualModels: [...actualModels]
    };
};

module.exports = {
    getPacsAiConfig,
    processQueuedPacsAiJobs,
    buildWorkerPayload,
    claimQueuedJobs,
    normalizeFailureMessage,
    validateWorkerResult
};
