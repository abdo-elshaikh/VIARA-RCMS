/**
 * cloudVisionService.js
 *
 * Free-tier cloud vision AI for radiology image analysis.
 *
 * Primary:  Google Gemini Flash      (https://aistudio.google.com)
 * Fallback: OpenRouter auto-router    (https://openrouter.ai)
 *
 * Key design decisions
 * ────────────────────
 * • Zero GPU required — inference runs on provider infrastructure.
 * • De-identification enforced: only the rendered JPEG pixel data is sent;
 *   no patient name, MRN, DOB or other PHI is included in the request.
 * • Exponential backoff on 429/503 (1 s → 2 s → 4 s, up to 3 attempts).
 * • Optional round-robin API key rotation via GEMINI_API_KEY_1/2/3 to
 *   multiply the free-tier daily quota.
 * • Result is normalised to the existing workerResultSchema shape so no
 *   downstream changes are needed.
 */

'use strict';

const logger = require('../config/logger');
const { GEMINI_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL, normalizeGeminiModel } = require('./aiModelPolicy');
const { validateCustomAiEndpointUrl } = require('../utils/customAiEndpointUrl');
const pLimit = require('p-limit');

// ─── Configuration ────────────────────────────────────────────────────────────

const GEMINI_MODEL = GEMINI_DEFAULT_MODEL;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'openrouter/auto';   // auto-selects best free vision model
const OPENAI_BASE = 'https://api.openai.com/v1/chat/completions';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_PROVIDER_RETRY_DELAY_MS = 60_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;     // 4 MB — Gemini inline limit
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
const DEFAULT_GEMINI_IMAGE_LIMIT = 12;
const DEFAULT_OPENROUTER_IMAGE_LIMIT = 8;
const DEFAULT_OPENAI_IMAGE_LIMIT = 8;
const DEFAULT_ORTHANC_PREVIEW_TIMEOUT_MS = 20_000;

const getProviderTimeoutMs = () => Math.max(
    10_000,
    Number(process.env.PACS_AI_PROVIDER_TIMEOUT_MS || FETCH_TIMEOUT_MS)
);
const readPositiveInt = (value, fallback, min = 1) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min ? Math.floor(parsed) : fallback;
};
const getMaxImageBytes = () => readPositiveInt(
    process.env.PACS_AI_MAX_CLOUD_IMAGE_BYTES,
    MAX_IMAGE_BYTES,
    64 * 1024
);
const getMaxTotalInlineImageBytes = () => readPositiveInt(
    process.env.PACS_AI_MAX_CLOUD_TOTAL_IMAGE_BYTES,
    MAX_TOTAL_IMAGE_BYTES,
    256 * 1024
);

// ─── API Key Rotator ──────────────────────────────────────────────────────────

class ApiKeyRotator {
    constructor(keys) {
        this.keys = keys.filter(Boolean);
        this.cursor = 0;
        this.rateLimitedUntil = {};
    }

    /** Returns the next available key, skipping keys that are rate-limited. */
    getNext() {
        const now = Date.now();
        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[(this.cursor + i) % this.keys.length];
            if (!this.rateLimitedUntil[key] || this.rateLimitedUntil[key] < now) {
                this.cursor = (this.cursor + i + 1) % this.keys.length;
                return key;
            }
        }
        return null; // all keys rate-limited
    }

    markRateLimited(key, retryAfterMs = 60_000) {
        this.rateLimitedUntil[key] = Date.now() + retryAfterMs;
    }
}

const geminiRotator = new ApiKeyRotator([
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
]);

const normalizeOpenAiCompatibleChatUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        const path = url.pathname.replace(/\/+$/, '');
        if (/\/chat\/completions$/i.test(path)) return url.toString();
        url.pathname = /\/v1$/i.test(path)
            ? `${path}/chat/completions`
            : path
                ? `${path}/chat/completions`
                : '/v1/chat/completions';
        return url.toString();
    } catch {
        return raw;
    }
};

// ─── Prompt ───────────────────────────────────────────────────────────────────

/**
 * Builds a structured radiology analysis prompt.
 * The response MUST be valid JSON matching the VIARA workerResultSchema.
 */
const buildRadiologyPrompt = (context = {}) => {
    const modality = context.modality || 'Unknown';
    const examType = context.examType || 'Unknown';
    const bodyPart = context.bodyPart || 'Unknown';
    const clinInd = context.clinicalIndication || 'Not provided';
    const images = context.images || [];
    const totalImageCount = Number(context.totalImageCount || images.length);
    const seriesCount = Number(context.seriesCount || 0);
    const imageManifest = images.map((image, index) => (
        `  Image ${index + 1}: series ${image.seriesNumber ?? '-'} (${image.seriesDescription || image.modality || 'Unspecified'}), instance ${image.instanceNumber ?? '-'}`
    ));

    return [
        'You are an expert radiologist performing a preliminary AI-assisted image analysis.',
        'Analyse the supplied medical images together as one case and return a structured JSON report.',
        '',
        `Exam context (for reference only — do NOT include patient identifiers):`,
        `  Modality: ${modality}`,
        `  Exam type: ${examType}`,
        `  Body part: ${bodyPart}`,
        `  Clinical indication: ${clinInd}`,
        `  Study coverage: ${images.length} rendered images supplied from ${seriesCount} series; ${totalImageCount} indexed images in the case.`,
        ...(imageManifest.length ? ['  Supplied image order:', ...imageManifest] : []),
        '',
        'Return ONLY valid JSON — no markdown fences, no preamble — in this exact shape:',
        JSON.stringify({
            success: true,
            status: 'Completed',
            resultType: 'AI screening',
            summary: '<2-4 sentence clinical overview>',
            findings: [
                {
                    label: '<finding name>',
                    present: true,
                    confidence: 0.85,
                    location: '<anatomical location or null>',
                    description: '<1-2 sentence clinical description>',
                    evidence: []
                }
            ],
            impression: '<concise radiological impression, 1-3 sentences>',
            limitations: [
                'AI-generated preliminary draft. A licensed radiologist must review all source images before report sign-off.',
                'This analysis is not a substitute for professional medical judgment.'
            ],
            quality: {
                diagnostic: true,
                supported: true,
                modality,
                views: [],
                imageCountAnalyzed: images.length
            },
            model: {
                provider: '__PROVIDER__',
                name: '__MODEL__',
                revision: '1.0',
                backend: 'cloud-api'
            },
            evidence: [],
            provenance: { mode: 'cloud-vision-api' }
        }, null, 2),
        '',
        'Rules:',
        '- Fill __PROVIDER__ and __MODEL__ with the actual provider/model identifiers.',
        '- Set confidence values between 0.0 and 1.0.',
        '- If the image quality is insufficient, set quality.diagnostic = false and explain in limitations.',
        '- Correlate findings across all supplied images; do not interpret a single frame in isolation.',
        `- This request ${images.length >= totalImageCount ? 'contains every indexed image' : 'contains a representative series-aware sample'}; state sampling limitations accurately.`,
        '- NEVER invent findings that are not visible in the image.',
        '- NEVER include patient names, IDs, or any identifying information.',
    ].join('\n');
};

/**
 * Builds a text-only radiology analysis prompt for non-vision LLMs.
 * Uses structured DICOM metadata instead of pixel data.
 */
const buildTextOnlyPrompt = (context = {}) => {
    const modality = context.modality || 'Unknown';
    const examType = context.examType || 'Unknown';
    const bodyPart = context.bodyPart || 'Unknown';
    const clinInd = context.clinicalIndication || 'Not provided';
    const imageCount = context.imageCount || 'Unknown';
    const seriesCount = context.seriesCount || 'Unknown';

    return [
        'You are an expert radiologist performing a preliminary AI-assisted analysis based on structured DICOM exam metadata.',
        'No pixel image is available — analyse the clinical context and metadata to produce a structured preliminary report.',
        '',
        'DICOM Exam Metadata:',
        `  Modality: ${modality}`,
        `  Exam / Series Type: ${examType}`,
        `  Body Part Examined: ${bodyPart}`,
        `  Clinical Indication: ${clinInd}`,
        `  Number of Series: ${seriesCount}`,
        `  Total Images: ${imageCount}`,
        '',
        'Return ONLY valid JSON — no markdown fences, no preamble — in this exact shape:',
        JSON.stringify({
            success: true,
            status: 'Completed',
            resultType: 'AI metadata-based screening',
            summary: '<2-4 sentence preliminary clinical overview based on the exam metadata>',
            findings: [
                {
                    label: '<expected or common finding for this exam type>',
                    present: true,
                    confidence: 0.5,
                    location: '<anatomical location or null>',
                    description: '<1-2 sentence description based on expected findings for this modality/body part>',
                    evidence: []
                }
            ],
            impression: '<concise radiological impression based on the exam type and clinical indication>',
            limitations: [
                'IMPORTANT: No pixel image was analysed — this report is based on exam metadata only. Direct image review is mandatory.',
                'AI-generated preliminary draft. A licensed radiologist must review all source images before report sign-off.',
                'This analysis is not a substitute for professional medical judgment.'
            ],
            quality: {
                diagnostic: false,
                supported: true,
                modality,
                views: [],
                imageCountAnalyzed: 0
            },
            model: {
                provider: '__PROVIDER__',
                name: '__MODEL__',
                revision: '1.0',
                backend: 'cloud-api-text-only'
            },
            evidence: [],
            provenance: { mode: 'metadata-only-analysis', imageAnalyzed: false }
        }, null, 2),
        '',
        'Rules:',
        '- Fill __PROVIDER__ and __MODEL__ with the actual provider/model identifiers.',
        '- Set confidence values appropriately low (0.3-0.6) since no image was analysed.',
        '- quality.diagnostic MUST be false since no image was reviewed.',
        '- NEVER claim findings you cannot see — base everything on the clinical indication and modality context.',
        '- NEVER include patient names, IDs, or any identifying information.',
    ].join('\n');
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * Wraps fetch with an AbortController timeout.
 */
const isAbortError = (error) => (
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    /aborted|abort/i.test(String(error?.message || ''))
);

const createTimeoutError = (url, timeoutMs, cause) => {
    const error = new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    error.name = 'TimeoutError';
    error.code = 'REQUEST_TIMEOUT';
    error.retryable = true;
    error.cause = cause;
    return error;
};

const fetchWithTimeout = async (url, init, timeoutMs = FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (isAbortError(error)) throw createTimeoutError(url, timeoutMs, error);
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Retries an async function with exponential backoff on rate-limit errors.
 *
 * @param {() => Promise<any>} fn
 * @param {{ maxAttempts?: number, onRetry?: Function }} options
 */
const withRetry = async (fn, options = {}) => {
    const maxAttempts = options.maxAttempts || MAX_RETRY_ATTEMPTS;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isRateLimit =
                err?.status === 429 ||
                err?.statusCode === 429 ||
                String(err?.message).includes('429') ||
                String(err?.message).includes('RESOURCE_EXHAUSTED');
            const isNetworkError =
                !err?.status &&
                (String(err?.message).includes('fetch failed') ||
                    String(err?.message).includes('UND_ERR') ||
                    String(err?.message).includes('ENOTFOUND') ||
                    String(err?.message).includes('ECONNREFUSED') ||
                    String(err?.message).includes('timeout') ||
                    isAbortError(err));
            const isTransient =
                err?.status === 503 ||
                err?.code === 'REQUEST_TIMEOUT' ||
                String(err?.message).includes('overloaded') ||
                isNetworkError;

            if (err?.retryable === false || attempt === maxAttempts || (!isRateLimit && !isTransient)) throw err;

            const baseDelay = isRateLimit ? 15_000 : 2_000;
            const delay = Math.min(
                MAX_PROVIDER_RETRY_DELAY_MS,
                Math.max(Number(err?.retryAfterMs || 0), baseDelay * Math.pow(2, attempt - 1))
            );
            logger.warn(`[CloudVision] Provider error: ${err.message || 'fetch failed'}. Retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})`);
            if (options.onRetry) {
                try {
                    await options.onRetry({
                        attempt,
                        maxAttempts,
                        delayMs: delay,
                        status: err?.status || err?.statusCode || null,
                        code: err?.code || null,
                        message: err?.message || 'Provider request failed'
                    });
                } catch (progressError) {
                    logger.warn('[CloudVision] Retry progress could not be persisted', {
                        error: progressError.message
                    });
                }
            }
            await new Promise((r) => setTimeout(r, delay));
        }
    }
};

const parseRetryAfterMs = (headers) => {
    const milliseconds = Number(headers?.get?.('retry-after-ms'));
    if (Number.isFinite(milliseconds) && milliseconds > 0) return milliseconds;

    const retryAfter = headers?.get?.('retry-after');
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

    const retryDate = Date.parse(retryAfter || '');
    return Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 0;
};

const createOpenAiHttpError = async (response) => {
    const raw = await response.text().catch(() => '');
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* Keep the plain response text. */ }

    const providerError = payload?.error || {};
    const code = String(providerError.code || providerError.type || '').toLowerCase();
    const detail = String(providerError.message || raw || '').trim();
    const quotaExhausted = ['insufficient_quota', 'billing_hard_limit_reached', 'billing_not_active']
        .some((value) => code.includes(value));
    const message = quotaExhausted
        ? 'OpenAI API quota is exhausted. Check project billing, usage limits, and the API key project.'
        : response.status === 429
            ? `OpenAI rate limit reached (429)${detail ? `: ${detail.slice(0, 240)}` : ''}`
            : `OpenAI API error (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = code || null;
    error.retryable = quotaExhausted
        ? false
        : (response.status === 429 || response.status >= 500);
    error.retryAfterMs = parseRetryAfterMs(response.headers);
    return error;
};

// ─── DICOM image fetch from Orthanc ──────────────────────────────────────────

/**
 * Fetches a rendered JPEG preview of a DICOM instance from Orthanc.
 * Returns { base64: string, mimeType: string }.
 *
 * Privacy: This endpoint returns rendered pixels only — no DICOM metadata,
 * no patient identifiers. Safe to send to external cloud APIs.
 *
 * @param {string} orthancInstanceId  e.g. "a1b2c3d4-..."
 * @param {object} auth               { url, username, password }
 */
const fetchDicomPreviewAsBase64 = async (orthancInstanceId, auth) => {
    const previewUrl = `${auth.url.replace(/\/+$/, '')}/instances/${orthancInstanceId}/preview`;
    const basicAuth = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    const timeoutMs = Math.max(
        5_000,
        Number(process.env.PACS_AI_ORTHANC_PREVIEW_TIMEOUT_MS || DEFAULT_ORTHANC_PREVIEW_TIMEOUT_MS)
    );

    const response = await fetchWithTimeout(previewUrl, {
        method: 'GET',
        headers: { Authorization: `Basic ${basicAuth}`, Accept: 'image/jpeg' }
    }, timeoutMs);

    if (!response.ok) {
        throw new Error(`Orthanc preview fetch failed (${response.status}) for instance ${orthancInstanceId}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');

    const maxImageBytes = getMaxImageBytes();
    if (buffer.byteLength > maxImageBytes) {
        throw new Error(`DICOM preview too large (${buffer.byteLength} bytes) - configured limit is ${maxImageBytes} bytes`);
    }

    return {
        base64,
        mimeType: response.headers.get('content-type') || 'image/jpeg',
        byteLength: buffer.byteLength,
        inlineByteLength: Buffer.byteLength(base64, 'ascii')
    };
};

const evenlySpacedIndexes = (length, count) => {
    if (count <= 0 || length <= 0) return [];
    if (count === 1) return [Math.floor((length - 1) / 2)];
    return Array.from({ length: Math.min(count, length) }, (_, index) => (
        Math.round((index * (length - 1)) / (Math.min(count, length) - 1))
    ));
};

const selectRepresentativeInstances = (seriesList, requestedLimit) => {
    const limit = Math.max(1, Number(requestedLimit) || 1);
    const available = (seriesList || [])
        .map((series) => ({
            ...series,
            instances: (series.instances || []).filter((instance) => instance?.orthancId)
        }))
        .filter((series) => series.instances.length > 0);

    if (!available.length) return [];

    const participating = available.length <= limit
        ? available
        : evenlySpacedIndexes(available.length, limit).map((index) => available[index]);
    const quotas = new Map(participating.map((series) => [series.seriesInstanceUid, 1]));
    let remaining = limit - participating.length;

    while (remaining > 0) {
        const candidate = participating
            .filter((series) => quotas.get(series.seriesInstanceUid) < series.instances.length)
            .sort((left, right) => {
                const leftQuota = quotas.get(left.seriesInstanceUid);
                const rightQuota = quotas.get(right.seriesInstanceUid);
                return (right.instances.length / (rightQuota + 1)) -
                    (left.instances.length / (leftQuota + 1));
            })[0];
        if (!candidate) break;
        quotas.set(candidate.seriesInstanceUid, quotas.get(candidate.seriesInstanceUid) + 1);
        remaining -= 1;
    }

    const perSeries = participating.map((series) => (
        evenlySpacedIndexes(series.instances.length, quotas.get(series.seriesInstanceUid))
            .map((index) => ({
                ...series.instances[index],
                seriesInstanceUid: series.seriesInstanceUid,
                seriesNumber: series.seriesNumber,
                seriesDescription: series.description,
                modality: series.modality,
                bodyPart: series.bodyPart
            }))
    ));

    // Interleave series so request-size truncation still preserves broad study coverage.
    const selected = [];
    const rounds = Math.max(...perSeries.map((instances) => instances.length));
    for (let round = 0; round < rounds; round += 1) {
        for (const instances of perSeries) {
            if (instances[round]) selected.push(instances[round]);
        }
    }
    return selected.slice(0, limit);
};

// ─── JSON Parser Helper ──────────────────────────────────────────────────────

/**
 * Robustly parses a JSON string, stripping markdown code blocks if necessary.
 */
const safeParseJson = (text) => {
    const raw = String(text || '').trim();
    if (!raw) {
        const error = new Error('AI provider returned an empty structured response');
        error.code = 'AI_EMPTY_RESPONSE';
        error.rawResponse = '';
        throw error;
    }

    const requireObject = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            const error = new Error('AI provider response must be one JSON object');
            error.code = 'AI_INVALID_JSON';
            error.rawResponse = raw.slice(0, 20_000);
            throw error;
        }
        return value;
    };

    try {
        return requireObject(JSON.parse(raw));
    } catch (parseError) {
        // Strip markdown code fences if present (e.g. ```json ... ```)
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return requireObject(JSON.parse(match[0]));
            } catch {
                // fall through to throw original error
            }
        }
        const error = new Error(`AI provider returned malformed JSON: ${parseError.message}`);
        error.code = 'AI_INVALID_JSON';
        error.rawResponse = raw.slice(0, 20_000);
        throw error;
    }
};

const addOpenRouterProvenance = (result, completion, recovery = null) => ({
    ...result,
    provenance: {
        ...(result?.provenance && typeof result.provenance === 'object' && !Array.isArray(result.provenance)
            ? result.provenance
            : {}),
        providerSelectedModel: completion.actualModel || null,
        providerFinishReason: completion.finishReason || null,
        ...(recovery ? { structuredOutputRecovery: recovery } : {})
    }
});

const extractAssistantText = (message = {}) => {
    if (typeof message.content === 'string') return message.content;
    if (!Array.isArray(message.content)) return '';
    return message.content
        .map((part) => typeof part === 'string' ? part : part?.text || '')
        .filter(Boolean)
        .join('\n');
};

// ─── Gemini Flash ─────────────────────────────────────────────────────────────

/**
 * Calls the Gemini generateContent endpoint with a rendered image + prompt.
 */
const callGemini = async (images, prompt, apiKey, model = GEMINI_MODEL) => {
    const effectiveModel = normalizeGeminiModel(model);
    const url = `${GEMINI_API_BASE}/${effectiveModel}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                ...images.map(({ base64, mimeType }) => ({
                    inlineData: { mimeType, data: base64 }
                }))
            ]
        }],
        generationConfig: {
            responseMimeType: 'application/json',  // Force JSON output
            temperature: 0.1,                       // Low = consistent, reduces hallucinations
            maxOutputTokens: 2048                  // Increased to prevent JSON truncation
        }
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }, getProviderTimeoutMs());

    if (response.status === 429) {
        const err = new Error('Gemini rate limit hit (429)');
        err.status = 429;
        throw err;
    }

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Gemini API error (${response.status}): ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return safeParseJson(text);
};

// ─── OpenRouter fallback ──────────────────────────────────────────────────────

/**
 * Calls OpenRouter using the OpenAI-compatible chat/completions endpoint.
 * Uses `openrouter/auto` which auto-selects the best available free vision model.
 */
const requestOpenRouterCompletion = async (body, apiKey) => {
    const response = await fetchWithTimeout(OPENROUTER_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/VIARA',
            'X-Title': 'VIARA Radiology AI'
        },
        body: JSON.stringify(body)
    }, getProviderTimeoutMs());

    if (response.status === 429) {
        const err = new Error('OpenRouter rate limit hit (429)');
        err.status = 429;
        err.retryAfterMs = parseRetryAfterMs(response.headers);
        throw err;
    }

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`OpenRouter API error (${response.status}): ${detail.slice(0, 200)}`);
    }

    try {
        return await response.json();
    } catch {
        throw new Error('OpenRouter returned an invalid API response instead of JSON');
    }
};

const buildOpenRouterAnalysisBody = (images, prompt, model, maxTokens) => ({
    model,
    messages: [{
        role: 'user',
        content: [
            { type: 'text', text: prompt },
            ...images.map(({ base64, mimeType }) => ({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64}` }
            }))
        ]
    }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: maxTokens
});

const parseOpenRouterChoice = (data) => {
    const choice = data?.choices?.[0] || {};
    return {
        text: extractAssistantText(choice.message),
        finishReason: choice.finish_reason || null,
        actualModel: data?.model || null
    };
};

/**
 * Calls OpenRouter and performs one bounded recovery when the selected model
 * returns truncated or syntactically invalid structured output.
 */
const callOpenRouter = async (images, prompt, apiKey, model = OPENROUTER_MODEL) => {
    let responseData = await requestOpenRouterCompletion(
        buildOpenRouterAnalysisBody(images, prompt, model, 2048),
        apiKey
    );
    let completion = parseOpenRouterChoice(responseData);
    let parseError;

    try {
        return addOpenRouterProvenance(safeParseJson(completion.text), completion);
    } catch (error) {
        parseError = error;
    }

    if (completion.finishReason === 'length' || parseError.code === 'AI_EMPTY_RESPONSE') {
        logger.warn('[CloudVision] OpenRouter structured output was truncated or empty; retrying once with a larger output budget', {
            model,
            actual_model: completion.actualModel,
            finish_reason: completion.finishReason,
            output_length: completion.text.length
        });
        responseData = await requestOpenRouterCompletion(
            buildOpenRouterAnalysisBody(images, prompt, model, 4096),
            apiKey
        );
        completion = parseOpenRouterChoice(responseData);
        try {
            return addOpenRouterProvenance(
                safeParseJson(completion.text),
                completion,
                'larger-output-retry'
            );
        } catch (error) {
            parseError = error;
        }
    }

    logger.warn('[CloudVision] OpenRouter returned malformed structured output; attempting one JSON repair pass', {
        model,
        actual_model: completion.actualModel,
        finish_reason: completion.finishReason,
        output_length: completion.text.length
    });

    const repairBody = {
        model,
        messages: [
            {
                role: 'system',
                content: [
                    'You are a strict JSON syntax repair utility.',
                    'Repair the supplied JSON without adding, removing, or changing clinical facts.',
                    'Preserve the original English text and return one JSON object only.',
                    'Do not use markdown fences or explanatory text.'
                ].join(' ')
            },
            {
                role: 'user',
                content: `Repair this malformed JSON:\n\n${String(parseError.rawResponse || completion.text).slice(0, 20_000)}`
            }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 4096
    };
    const repairedData = await requestOpenRouterCompletion(repairBody, apiKey);
    const repaired = parseOpenRouterChoice(repairedData);

    try {
        return addOpenRouterProvenance(
            safeParseJson(repaired.text),
            repaired,
            'json-repair'
        );
    } catch (repairError) {
        const error = new Error('OpenRouter returned invalid structured JSON after one repair attempt');
        error.code = 'AI_INVALID_JSON';
        error.cause = repairError;
        throw error;
    }
};

/**
 * Calls OpenAI Chat Completions with de-identified rendered study images.
 */
const callOpenAI = async (images, prompt, apiKey, model = OPENAI_DEFAULT_MODEL) => {
    const body = {
        model,
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                ...images.map(({ base64, mimeType }) => ({
                    type: 'image_url',
                    image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' }
                }))
            ]
        }],
        response_format: { type: 'json_object' },
        reasoning_effort: 'none',
        max_completion_tokens: 2048
    };

    const response = await fetchWithTimeout(OPENAI_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    }, getProviderTimeoutMs());

    if (!response.ok) {
        throw await createOpenAiHttpError(response);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    return safeParseJson(text);
};

// ─── Custom Cloud Vision (OpenAI compatible) ──────────────────────────────────

/**
 * Calls custom OpenAI-compatible vision endpoint.
 */
const callCustomCloudVision = async (base64Image, mimeType, prompt, apiKey, baseUrl, model) => {
    const body = {
        model,
        messages: [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                { type: 'text', text: prompt }
            ]
        }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2048
    };

    const safeBaseUrl = await validateCustomAiEndpointUrl(baseUrl);
    const url = `${safeBaseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'error'
    }, getProviderTimeoutMs());

    if (response.status === 429) {
        const err = new Error('Custom vision provider rate limit hit (429)');
        err.status = 429;
        throw err;
    }

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Custom vision API error (${response.status}): ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    return safeParseJson(text);
};

// ─── Result normaliser ────────────────────────────────────────────────────────

/**
 * Normalises the raw JSON response from any cloud provider into the shape
 * expected by the VIARA `workerResultSchema` (Zod).
 *
 * Fills in mandatory fields that the model may have omitted.
 */
const normaliseResult = (raw, providerName, modelName, analysisContext = {}) => {
    // Provider identity is execution metadata and must not come from model output.
    const provider = String(providerName);
    const model = String(modelName);

    const findings = (Array.isArray(raw.findings) ? raw.findings : []).map((f) => ({
        label: String(f.label || 'Unspecified signal').trim(),
        present: f.present !== false,
        confidence: typeof f.confidence === 'number' ? Math.min(1, Math.max(0, f.confidence)) : null,
        location: f.location ? String(f.location).trim() : null,
        description: f.description ? String(f.description).trim() : '',
        evidence: Array.isArray(f.evidence) ? f.evidence.filter(Number.isInteger) : []
    }));

    const analyzedImages = analysisContext.images || [];
    const selection = analysisContext.selection || {};
    const totalImageCount = Number(analysisContext.totalImageCount || analyzedImages.length);
    const totalSeriesCount = Number(analysisContext.totalSeriesCount || 0);
    const analyzedSeriesCount = new Set(analyzedImages.map((image) => image.seriesInstanceUid)).size;
    const completePixelCoverage = analyzedImages.length > 0 && analyzedImages.length >= totalImageCount;
    const quality = {
        diagnostic: raw?.quality?.diagnostic !== false,
        supported: raw?.quality?.supported !== false,
        modality: String(raw?.quality?.modality || 'Unknown'),
        views: Array.isArray(raw?.quality?.views) ? raw.quality.views : [],
        imageCountAnalyzed: analyzedImages.length || Number(raw?.quality?.imageCountAnalyzed || 0)
    };

    const limitations = [
        ...(Array.isArray(raw.limitations) ? raw.limitations.map(String) : []),
        ...(raw?.provenance?.structuredOutputRecovery
            ? ['The provider response required automatic structured-output recovery; verify all generated findings against the source images.']
            : []),
        ...(!completePixelCoverage && analyzedImages.length
            ? [`Series-aware sampling analyzed ${analyzedImages.length} of ${totalImageCount} indexed images. Full DICOM review remains required.`]
            : []),
        'AI-generated preliminary analysis. A licensed radiologist must review all source images before report sign-off.'
    ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

    return {
        success: true,
        status: 'Completed',
        resultType: String(raw.resultType || 'AI screening'),
        summary: String(raw.summary || raw.impression || '').trim() || 'AI analysis completed.',
        findings,
        impression: String(raw.impression || raw.summary || '').trim(),
        limitations,
        quality,
        model: {
            provider,
            name: model,
            revision: String(raw?.model?.revision || '1.0'),
            backend: 'cloud-api'
        },
        evidence: analyzedImages.map((image) => ({
            seriesInstanceUid: String(image.seriesInstanceUid),
            sopInstanceUid: String(image.sopInstanceUid),
            ...(image.viewPosition ? { viewPosition: String(image.viewPosition) } : {})
        })),
        provenance: {
            ...(raw.provenance && typeof raw.provenance === 'object' && !Array.isArray(raw.provenance)
                ? raw.provenance
                : {}),
            mode: 'cloud-vision-api',
            provider,
            model,
            declaredModel: raw?.model || null,
            coverage: {
                strategy: selection.omittedByByteBudget > 0
                    ? 'series-aware-uniform-sampling-budget-limited'
                    : (completePixelCoverage ? 'all-indexed-images' : 'series-aware-uniform-sampling'),
                studyImageCount: totalImageCount,
                studySeriesCount: totalSeriesCount,
                analyzedImageCount: analyzedImages.length,
                analyzedSeriesCount,
                completePixelCoverage,
                selectedImageCount: selection.selectedImageCount || analyzedImages.length,
                requestedImageLimit: selection.requestedImageLimit || analyzedImages.length,
                omittedByByteBudget: selection.omittedByByteBudget || 0,
                skippedRenderCount: selection.skippedRenderCount || 0,
                analyzedInlineBytes: selection.analyzedInlineBytes || 0,
                inlineByteLimit: selection.inlineByteLimit || 0
            }
        }
    };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve Orthanc credentials from environment variables.
 * The auth object is used only to fetch the pixel-rendered JPEG preview.
 */
const getOrthancAuth = () => {
    const password = process.env.ORTHANC_PASSWORD;
    if (!password) {
        throw new Error('ORTHANC_PASSWORD is required but not set');
    }
    return {
        url: process.env.ORTHANC_URL || process.env.ORTHANC_API_URL || 'http://orthanc:8042',
        username: process.env.ORTHANC_USERNAME || 'VIARA',
        password
    };
};

/**
 * Analyses a study using a de-identified JPEG preview and Gemini or OpenRouter.
 *
 * @param {object} payload   The `buildWorkerPayload()` output (study + series metadata)
 * @param {object} [options]
 * @param {string} [options.apiKey]  API key from DB settings (takes precedence over env vars)
 * @param {string} [options.baseUrl] Custom base URL for custom providers
 * @param {string} [options.provider] Target cloud provider
 * @param {string} [options.model] Target model
 * @returns {Promise<object>} Normalised result matching workerResultSchema
 */
const analyzeStudy = async (payload, options = {}) => {
    const study = payload.study || {};
    const series = payload.series || [];

    const provider = options.provider || 'cloud-gemini';
    const apiKey = options.apiKey || null;
    const modelName = options.model || null;
    const baseUrl = options.baseUrl || null;
    const totalImageCount = series.reduce((sum, item) => sum + (item.instances?.length || 0), 0) || Number(study.imageCount || 0);
    const providerImageLimit = provider === 'cloud-openrouter'
        ? DEFAULT_OPENROUTER_IMAGE_LIMIT
        : provider === 'cloud-openai'
            ? DEFAULT_OPENAI_IMAGE_LIMIT
            : DEFAULT_GEMINI_IMAGE_LIMIT;
    const configuredImageLimit = Math.max(
        1,
        Math.min(providerImageLimit, Number(process.env.PACS_AI_MAX_CLOUD_IMAGES || providerImageLimit))
    );
    const selectedInstances = selectRepresentativeInstances(series, configuredImageLimit);

    // ── 4. Dispatch based on configured provider ──────────────────────────
    //
    // cloud-custom uses a text-only metadata path — no Orthanc image fetch needed.
    // All other providers require a rendered JPEG preview from Orthanc.
    //
    // Rendered previews contain pixels only. All DICOM references remain in the
    // worker payload and sampled SOP/series UIDs are persisted as result evidence.
    let imageCache = null;
    let imageCoverage = {
        requestedImageLimit: configuredImageLimit,
        selectedImageCount: selectedInstances.length,
        analyzedInlineBytes: 0,
        inlineByteLimit: getMaxTotalInlineImageBytes(),
        omittedByByteBudget: 0,
        skippedRenderCount: 0
    };
    const fetchImagesForVision = async () => {
        if (imageCache) return imageCache;
        if (!selectedInstances.length) {
            throw new Error('No DICOM instance with an Orthanc ID found in the study — cannot fetch image for cloud analysis');
        }
        const images = [];
        let totalInlineBytes = 0;
        const inlineByteLimit = getMaxTotalInlineImageBytes();
        imageCoverage = { ...imageCoverage, inlineByteLimit };

        // Fetch previews concurrently with a bounded concurrency limit.
        const CONCURRENCY = Number(process.env.PACS_AI_FETCH_CONCURRENCY || 4);
        const limit = pLimit(CONCURRENCY);

        const fetchResults = await Promise.allSettled(
            selectedInstances.map((instance) => limit(() => fetchDicomPreviewAsBase64(instance.orthancId, getOrthancAuth())))
        );

        for (let index = 0; index < selectedInstances.length; index++) {
            const instance = selectedInstances[index];
            const result = fetchResults[index];
            logger.info('[CloudVision] Fetching sampled DICOM preview', {
                current: index + 1,
                total: selectedInstances.length,
                orthanc_id: instance.orthancId,
                series_instance_uid: instance.seriesInstanceUid,
                instance_number: instance.instanceNumber
            });
            if (result.status === 'rejected') {
                imageCoverage.skippedRenderCount += 1;
                logger.warn('[CloudVision] Sampled DICOM preview could not be rendered; continuing with remaining images', {
                    orthanc_id: instance.orthancId,
                    error: result.reason?.message || String(result.reason)
                });
                continue;
            }
            try {
                const image = result.value;
                const inlineBytes = image.inlineByteLength || Buffer.byteLength(image.base64 || '', 'ascii');
                if (images.length && totalInlineBytes + inlineBytes > inlineByteLimit) {
                    imageCoverage.omittedByByteBudget = selectedInstances.length - index;
                    logger.info('[CloudVision] Inline image budget reached; remaining sampled previews were omitted from this provider request', {
                        selected: images.length,
                        omitted: imageCoverage.omittedByByteBudget,
                        inline_bytes: totalInlineBytes,
                        inline_byte_limit: inlineByteLimit
                    });
                    break;
                }
                totalInlineBytes += inlineBytes;
                images.push({ ...instance, ...image });
                if (options.onProgress) {
                    try {
                        await options.onProgress({
                            phase: 'preparing_images',
                            current: images.length,
                            total: selectedInstances.length,
                            studyImageCount: totalImageCount
                        });
                    } catch (progressError) {
                        logger.warn('[CloudVision] Analysis progress could not be persisted', {
                            error: progressError.message
                        });
                    }
                }
            } catch (error) {
                imageCoverage.skippedRenderCount += 1;
                logger.warn('[CloudVision] Sampled DICOM preview could not be processed; continuing with remaining images', {
                    orthanc_id: instance.orthancId,
                    error: error.message
                });
            }
        }
        if (!images.length) throw new Error('Orthanc could not render any sampled DICOM previews for cloud analysis');
        imageCoverage = {
            ...imageCoverage,
            analyzedInlineBytes: totalInlineBytes,
            omittedByByteBudget: imageCoverage.omittedByByteBudget || Math.max(0, selectedInstances.length - images.length - imageCoverage.skippedRenderCount)
        };
        imageCache = images;
        logger.info('[CloudVision] DICOM case image set prepared', {
            analyzed_images: images.length,
            indexed_images: totalImageCount,
            represented_series: new Set(images.map((image) => image.seriesInstanceUid)).size,
            total_series: series.length,
            inline_bytes: totalInlineBytes,
            inline_byte_limit: inlineByteLimit,
            omitted_by_byte_budget: imageCoverage.omittedByByteBudget
        });
        return imageCache;
    };
    const buildPrompt = (images) => buildRadiologyPrompt({
        modality: study.modality,
        examType: study.examType,
        bodyPart: study.bodyPart,
        clinicalIndication: study.clinicalIndication,
        images,
        totalImageCount,
        seriesCount: series.length
    });

    if (provider === 'cloud-openrouter') {
        const key = apiKey || process.env.OPENROUTER_API_KEY;
        if (!key) throw new Error('OpenRouter API key is not configured');
        const targetModel = modelName || OPENROUTER_MODEL;
        const images = await fetchImagesForVision();
        const prompt = buildPrompt(images);
        logger.info(`[CloudVision] Calling OpenRouter with model ${targetModel} and ${images.length} images...`);
        const raw = await withRetry(() => callOpenRouter(images, prompt, key, targetModel));
        logger.info('[CloudVision] OpenRouter analysis succeeded');

        return normaliseResult(raw, 'openrouter', targetModel, {
            images,
            totalImageCount,
            totalSeriesCount: series.length,
            selection: imageCoverage
        });

    } else if (provider === 'cloud-openai') {
        const key = apiKey || process.env.OPENAI_API_KEY;
        if (!key) throw new Error('OpenAI API key is not configured');
        const targetModel = modelName || OPENAI_DEFAULT_MODEL;
        const images = await fetchImagesForVision();
        const prompt = buildPrompt(images);
        logger.info(`[CloudVision] Calling OpenAI with model ${targetModel} and ${images.length} images...`);
        const raw = await withRetry(
            () => callOpenAI(images, prompt, key, targetModel),
            {
                onRetry: async ({ attempt, maxAttempts, delayMs, message }) => {
                    if (!options.onProgress) return;
                    await options.onProgress({
                        phase: 'provider_retry',
                        provider: 'openai',
                        current: attempt,
                        total: Math.max(1, maxAttempts - 1),
                        retryAfterMs: delayMs,
                        studyImageCount: totalImageCount,
                        message
                    });
                }
            }
        );
        logger.info('[CloudVision] OpenAI analysis succeeded');

        return normaliseResult(raw, 'openai', targetModel, {
            images,
            totalImageCount,
            totalSeriesCount: series.length,
            selection: imageCoverage
        });

    } else if (provider === 'cloud-custom') {
        if (!baseUrl) throw new Error('Custom provider selected but no Base URL is configured');
        const safeBaseUrl = await validateCustomAiEndpointUrl(baseUrl);
        const key = apiKey || ''; // custom endpoint may not require key
        const targetModel = modelName || 'custom-vision-model';

        // Text-only path: Logfare and many custom endpoints are text-only LLMs
        // that do not support image_url content parts. Use metadata-based analysis.
        logger.info(`[CloudVision] cloud-custom: using text-only metadata analysis with ${targetModel} at ${safeBaseUrl}`);

        const textPrompt = buildTextOnlyPrompt({
            modality: study.modality,
            examType: study.examType,
            bodyPart: study.bodyPart,
            clinicalIndication: study.clinicalIndication,
            imageCount: series.reduce((sum, s) => sum + (s.instances?.length || 0), 0),
            seriesCount: series.length
        });

        const textBody = {
            model: targetModel,
            messages: [{ role: 'user', content: textPrompt }],
            temperature: 0.2,
            max_tokens: 2048
        };

        const textUrl = normalizeOpenAiCompatibleChatUrl(safeBaseUrl);
        const textHeaders = { 'Content-Type': 'application/json' };
        if (key) textHeaders.Authorization = `Bearer ${key}`;

        let raw;
        try {
            const textResponse = await withRetry(async () => {
                const resp = await fetchWithTimeout(textUrl, {
                    method: 'POST',
                    headers: textHeaders,
                    body: JSON.stringify(textBody),
                    redirect: 'error'
                }, getProviderTimeoutMs());
                if (resp.status === 429) {
                    const err = new Error('Custom provider rate limit (429)');
                    err.status = 429;
                    throw err;
                }
                if (!resp.ok) {
                    const detail = await resp.text().catch(() => '');
                    throw new Error(`Custom API error (${resp.status}): ${detail.slice(0, 200)}`);
                }
                return resp;
            });
            const contentType = textResponse.headers?.get?.('content-type') || '';
            const responseText = await textResponse.text();
            if (contentType.toLowerCase().includes('text/html') || /^\s*<!doctype\s+html/i.test(responseText) || /^\s*<html/i.test(responseText)) {
                throw new Error(
                    `Custom endpoint returned HTML from ${textUrl}. Enter an OpenAI-compatible API base URL ending in /v1 or the full /chat/completions endpoint.`
                );
            }
            let data;
            try {
                data = responseText ? JSON.parse(responseText) : {};
            } catch {
                throw new Error(`Custom endpoint returned invalid JSON from ${textUrl}`);
            }
            const text = data?.choices?.[0]?.message?.content || '';
            raw = safeParseJson(text);
        } catch (apiErr) {
            throw new Error(`Custom cloud provider call failed: ${apiErr.message}`);
        }

        logger.info('[CloudVision] cloud-custom text-only analysis succeeded');
        return normaliseResult(raw, 'custom', targetModel, {
            images: [],
            totalImageCount,
            totalSeriesCount: series.length,
            selection: imageCoverage
        });

    } else {
        // Default: cloud-gemini (with OpenRouter fallback)
        const geminiKey = apiKey || geminiRotator.getNext();
        if (geminiKey) {
            try {
                const targetModel = normalizeGeminiModel(modelName || GEMINI_MODEL);
                const images = await fetchImagesForVision();
                const prompt = buildPrompt(images);
                logger.info(`[CloudVision] Calling Gemini ${targetModel} with ${images.length} images...`);
                const raw = await withRetry(() => callGemini(images, prompt, geminiKey, targetModel));
                logger.info('[CloudVision] Gemini analysis succeeded');
                return normaliseResult(raw, 'google', targetModel, {
                    images,
                    totalImageCount,
                    totalSeriesCount: series.length,
                    selection: imageCoverage
                });
            } catch (geminiError) {
                if (geminiError?.status === 429 && !apiKey) geminiRotator.markRateLimited(geminiKey);
                logger.warn(`[CloudVision] Gemini failed (${geminiError.message}), trying OpenRouter fallback...`);
            }
        } else {
            logger.warn('[CloudVision] No Gemini API key available — skipping to OpenRouter fallback');
        }

        // Fallback to OpenRouter (only if using Gemini as default and Gemini failed)
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        if (!openRouterKey) {
            throw new Error('Gemini failed and no OPENROUTER_API_KEY is configured — cloud vision analysis unavailable');
        }
        logger.info('[CloudVision] Calling OpenRouter fallback (openrouter/auto)...');
        const images = (await fetchImagesForVision()).slice(0, DEFAULT_OPENROUTER_IMAGE_LIMIT);
        const fbPrompt = buildPrompt(images);
        const raw = await withRetry(() => callOpenRouter(images, fbPrompt, openRouterKey, OPENROUTER_MODEL));
        logger.info('[CloudVision] OpenRouter fallback analysis succeeded');
        return normaliseResult(raw, 'openrouter', OPENROUTER_MODEL, {
            images,
            totalImageCount,
            totalSeriesCount: series.length,
            selection: imageCoverage
        });
    }
};

/**
 * Returns true if at least one cloud vision key is available.
 * Accepts an optional key from DB settings so callers don't need to
 * re-read the environment themselves.
 *
 * @param {string} [dbKey]  Decrypted key from system_settings (ai.pacs.api_key_enc)
 * @param {string} [provider] Target cloud provider
 * @param {string} [baseUrl] Base URL for custom provider
 */
const isConfigured = (dbKey, provider = 'cloud-gemini', baseUrl = '') => {
    if (provider === 'cloud-custom') {
        return Boolean(baseUrl);
    }
    if (provider === 'cloud-openai') return Boolean(dbKey || process.env.OPENAI_API_KEY);
    if (provider === 'cloud-openrouter') return Boolean(dbKey || process.env.OPENROUTER_API_KEY);
    return Boolean(dbKey) || geminiRotator.keys.length > 0 || Boolean(process.env.OPENROUTER_API_KEY);
};

module.exports = {
    analyzeStudy,
    isConfigured,
    geminiRotator,
    selectRepresentativeInstances,
    normalizeOpenAiCompatibleChatUrl
};
