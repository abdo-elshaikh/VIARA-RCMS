const { AppError } = require('../utils/errors');
const logger = require('../config/logger');
const settingsService = require('./settingsService');
const { decrypt } = require('../utils/crypto');
const aiProfileService = require('./aiProfileService');
const { GEMINI_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL, normalizeAiModel } = require('./aiModelPolicy');
const { validateCustomAiEndpointUrl } = require('../utils/customAiEndpointUrl');

/**
 * AI-assisted radiology report formatting.
 *
 * Provider-agnostic thin wrapper around a chat/completions endpoint. Configuration
 * is read from Admin settings with environment fallback:
 *   AI_PROVIDER  - 'anthropic' (default) or 'openai' (any OpenAI-compatible API)
 *   AI_API_KEY   - provider API key (required to enable the feature)
 *   AI_MODEL     - model id (sensible per-provider defaults below)
 *   AI_BASE_URL  - override base URL (e.g. Azure/OpenAI-compatible gateways)
 *
 * The model is instructed to restructure the text into standard radiology
 * sections, correct grammar, and preserve every clinical fact WITHOUT inventing
 * findings. The result is returned to the caller for human review before saving.
 */

const DEFAULTS = {
    anthropic: {
        baseUrl: 'https://api.anthropic.com/v1/messages',
        model: 'claude-3-5-sonnet-latest',
    },
    openai: {
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        model: OPENAI_DEFAULT_MODEL,
    },
    // Free-tier cloud providers (no GPU required)
    gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        model: GEMINI_DEFAULT_MODEL,
    },
    openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'openrouter/auto',
    },
    groq: {
        baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    },
    custom: {
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
    },
};

const normalizeChatCompletionsUrl = (provider, value, fallback) => {
    const raw = String(value || fallback || '').trim();
    if (!raw) return raw;

    try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase();
        const path = url.pathname.replace(/\/+$/, '');

        if (host === 'openrouter.ai' && (path === '' || path === '/v1' || path === '/api/v1')) {
            url.pathname = '/api/v1/chat/completions';
            return url.toString();
        }

        if (provider !== 'anthropic' && !/\/chat\/completions$/.test(path)) {
            url.pathname = `${path || ''}/chat/completions`.replace(/\/{2,}/g, '/');
            return url.toString();
        }

        return raw;
    } catch {
        return raw;
    }
};

const safeDecrypt = (value) => {
    if (!value) return '';
    try {
        return decrypt(value) || '';
    } catch {
        return '';
    }
};

const getProviderConfig = async () => {
    const activeProfile = await aiProfileService.getActiveConfig('report');
    if (activeProfile) {
        const providerDefaults = DEFAULTS[activeProfile.provider] || DEFAULTS.anthropic;
        return {
            enabled: Boolean(activeProfile.enabled),
            provider: activeProfile.provider,
            apiKey: activeProfile.apiKey || '',
            model: normalizeAiModel('report', activeProfile.provider, activeProfile.model, providerDefaults.model),
            baseUrl: normalizeChatCompletionsUrl(
                activeProfile.provider,
                activeProfile.baseUrl,
                providerDefaults.baseUrl
            ),
            profileId: activeProfile.id,
            profileName: activeProfile.name
        };
    }
    const allSettings = await settingsService.getAll();
    const enabledSetting = allSettings['ai.report.enabled'];
    // Support provider-specific env keys for free-tier cloud providers
    const resolveApiKey = (provider) => {
        const keyProvider = String(allSettings['ai.report.api_key_provider'] || provider).toLowerCase();
        const encrypted = keyProvider === provider
            ? safeDecrypt(allSettings['ai.report.api_key_enc'])
            : '';
        if (encrypted) return encrypted;
        if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
        if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || '';
        if (provider === 'groq') return process.env.GROQ_API_KEY || process.env.AI_API_KEY || '';
        if (provider === 'openai') return process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
        return process.env.AI_API_KEY || '';
    };
    const provider = (allSettings['ai.report.provider'] || process.env.AI_PROVIDER || 'anthropic').toLowerCase();
    const apiKey = resolveApiKey(provider);
    const enabled = enabledSetting === undefined || enabledSetting === ''
        ? Boolean(apiKey)
        : String(enabledSetting).toLowerCase() === 'true';
    const providerDefaults = DEFAULTS[provider] || DEFAULTS.anthropic;

    return {
        enabled,
        provider,
        apiKey,
        model: normalizeAiModel(
            'report',
            provider,
            allSettings['ai.report.model'] || process.env.AI_MODEL,
            providerDefaults.model
        ),
        baseUrl: normalizeChatCompletionsUrl(
            provider,
            allSettings['ai.report.base_url'] || process.env.AI_BASE_URL,
            providerDefaults.baseUrl
        )
    };
};

const isConfigured = async () => {
    const config = await getProviderConfig();
    return Boolean(config.enabled && config.apiKey);
};

// ─── Shared retry + error helpers ────────────────────────────────────────────

/**
 * Retries an async function with exponential backoff on rate-limit / transient errors.
 *
 * For 429 (rate limit) the base delay is 15 s (15 s → 30 s) so retries actually
 * fall outside Gemini's 60-second RPM window.
 * For 503 (transient overload) the base delay is 1 s (fast retry).
 */
const withRetry = async (fn, maxAttempts = 3) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isRateLimit =
                err?.status === 429 ||
                err?.statusCode === 429 ||
                String(err?.message).includes('429') ||
                String(err?.message).includes('RESOURCE_EXHAUSTED');
            const isTransient =
                err?.status === 503 ||
                String(err?.message).includes('overloaded');

            if (attempt === maxAttempts || (!isRateLimit && !isTransient)) throw err;
            // Use a longer delay for rate-limit errors so we actually escape the window
            const baseDelay = isRateLimit ? 15_000 : 1_000;
            const delay = baseDelay * Math.pow(2, attempt - 1);
            logger.warn(`[AIReport] Provider ${isRateLimit ? 'rate-limited (429)' : 'overloaded (503)'}. Retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
};

/** Builds a clear user-facing message from a failed HTTP response. */
const providerErrorMessage = async (response, providerName) => {
    if (response.status === 429) {
        return `The ${providerName} API rate limit was reached. Please wait a moment and try again, or switch to a different provider in AI settings.`;
    }
    if (response.status === 503) {
        return `The ${providerName} API is temporarily unavailable (503). Please try again shortly.`;
    }
    const detail = await response.text().catch(() => '');
    return `AI provider error (${response.status})${detail ? `: ${detail.slice(0, 120)}` : ''}`;
};

const normalizeLanguage = (language) => language === 'ar' ? 'ar' : 'en';

const languageInstruction = (language) => normalizeLanguage(language) === 'ar'
    ? 'Respond entirely in Arabic using clear Modern Standard Arabic. Translate non-Arabic source text when needed.'
    : 'Respond entirely in English. Translate non-English source text when needed.';

const buildSystemPrompt = (language = 'en') => {
    return [
        'You are a senior radiology report editor.',
        'Reformat the radiologist\'s draft into a clean, professional diagnostic imaging report.',
        'Use standard radiology-report style and organization:',
        '- Clinical Indication: one concise sentence when supplied.',
        '- Technique: acquisition details only; do not include interpretation.',
        '- Comparison: include only when a comparison study is explicitly mentioned.',
        '- Findings: organized anatomic/systematic observations in complete sentences.',
        '- Impression: concise diagnosis-oriented summary, numbered when there is more than one item.',
        '- Recommendations: include only explicit follow-up or management recommendations from the draft.',
        'Rules:',
        '- Preserve every clinical fact, measurement, and laterality exactly.',
        '- Do NOT invent, infer, or add findings that are not present in the draft.',
        '- Do NOT provide a diagnosis beyond what the draft states.',
        '- Do not overcall uncertain statements; keep uncertainty language when the draft uses it.',
        '- Fix grammar, spelling, punctuation, and structure only.',
        '- Remove duplicate wording, markdown formatting, and non-clinical filler.',
        '- Keep AI/model/provider names, confidence scores, and processing details out of the report.',
        '- Omit a section entirely if the draft has no content for it.',
        '- Return only the formatted report text, with no preamble or commentary.',
        languageInstruction(language),
    ].join('\n');
};

const buildPreliminaryDraftPrompt = (language = 'en') => {
    return [
        'You are a senior radiology report drafting assistant.',
        'Create a PRELIMINARY report draft from the supplied exam metadata, template default text, and any available PACS AI image analysis results.',
        'Use professional diagnostic report conventions:',
        '- clinicalHistory: short indication/history only.',
        '- technique: modality acquisition details only; no interpretation and no AI-processing text.',
        '- findings: clear, organized, clinically phrased observations. Prefer concise paragraphs or short anatomic lines over long bullet lists.',
        '- impression: the shortest clinically useful summary. Use numbered lines when there is more than one impression.',
        '- recommendations: only explicit follow-up recommendations supported by the supplied context.',
        'Important safety rules:',
        '- Do NOT invent imaging findings.',
        '- Use the PACS AI findings provided in the "imageAnalysis" payload if present to populate the findings and impression. Translate abnormality labels and location descriptions into clinical narrative sentences without including numeric model scores.',
        '- If no PACS AI findings are provided, write cautious placeholder findings stating that radiologist image review is required.',
        '- Do NOT treat template default text as image-proven evidence and do not state that the study is normal based on a template.',
        '- State a normal finding only when it is explicitly supported by the PACS AI image analysis. Otherwise use a review-required placeholder.',
        '- Keep AI provider names, model names, confidence scores, image counts, and processing details out of the clinical report sections. Those belong only in limitations and provenance.',
        '- Technique may describe acquisition details supplied in exam metadata, but must never describe AI processing.',
        '- Do not include section headings inside JSON values.',
        '- Do not include markdown, tables, citations, disclaimers, or patient identifiers inside report sections.',
        '- Return JSON only. No markdown, no commentary.',
        '- JSON shape must be: {"clinicalHistory":"","technique":"","findings":"","impression":"","recommendations":"","limitations":[]}',
        languageInstruction(language),
    ].join('\n');
};

const buildSectionImprovePrompt = (sectionType, language = 'en') => {
    const sectionGuidance = {
        clinicalHistory: 'Polish as a brief Clinical Indication/History sentence. Preserve symptoms, dates, laterality, and relevant prior diagnosis. Do not add findings.',
        technique: 'Polish as a Technique section. Include only acquisition/protocol details present in the text. Do not add contrast, sequences, or views unless stated.',
        findings: 'Polish as a Findings section. Organize observations logically by anatomy/system. Use complete, concise sentences. Do not summarize into diagnosis unless already stated.',
        impression: 'Polish as an Impression section. Keep only the key diagnostic conclusions from the text. Number multiple items. Do not add recommendations unless already stated.',
        recommendations: 'Polish as Recommendations. Include only follow-up or management recommendations explicitly present in the text.'
    };

    return [
        'You are a senior radiology report editor.',
        sectionGuidance[sectionType] || 'Polish this radiology report section using professional diagnostic-report style.',
        'Rules:',
        '- Preserve every clinical fact, measurement, laterality, severity, and uncertainty exactly.',
        '- Do not invent, infer, or add imaging findings.',
        '- Do not include section headings unless they are already part of the requested text.',
        '- Remove markdown, duplicate wording, and non-clinical filler.',
        '- Keep AI/model/provider names, confidence scores, and processing details out of the report section.',
        '- Return only the improved section text.',
        languageInstruction(language)
    ].join('\n');
};

/**
 * Calls the Gemini generateContent endpoint (text-only, report drafting).
 */
const callGemini = async ({ model, apiKey, systemPrompt, userContent, maxTokens = 2000, jsonMode = false }) => {
    const url = `${DEFAULTS.gemini.baseUrl}/${model}:generateContent?key=${apiKey}`;
    const body = {
        contents: [{
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userContent}` }]
        }],
        generationConfig: {
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
            temperature: 0.2,
            maxOutputTokens: maxTokens
        }
    };

    return withRetry(async () => {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const msg = await providerErrorMessage(response, 'Gemini');
            logger.error('AI provider (gemini) returned an error', { status: response.status });
            const err = new AppError(msg, response.status === 429 ? 429 : 502);
            err.status = response.status;
            throw err;
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return text.trim();
    });
};

const callAnthropic = async ({ baseUrl, model, apiKey, systemPrompt, userContent, maxTokens = 2000 }) => {
    return withRetry(async () => {
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: [{ role: 'user', content: userContent }],
            }),
        });

        if (!response.ok) {
            const msg = await providerErrorMessage(response, 'Anthropic');
            logger.error('AI provider (anthropic) returned an error', { status: response.status });
            const err = new AppError(msg, response.status === 429 ? 429 : 502);
            err.status = response.status;
            throw err;
        }

        const raw = await response.text();
        let data;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            logger.error('AI provider (anthropic) returned non-JSON response', {
                status: response.status,
                baseUrl,
                preview: raw.slice(0, 120)
            });
            throw new AppError('AI provider returned a non-JSON response. Check the provider and base URL.', 502);
        }
        const text = Array.isArray(data.content)
            ? data.content.filter((part) => part.type === 'text').map((part) => part.text).join('').trim()
            : '';
        return text;
    });
};

const callOpenAiCompatible = async ({ provider, baseUrl, model, apiKey, systemPrompt, userContent, maxTokens = 2000, jsonMode = false }) => {
    if (baseUrl) await validateCustomAiEndpointUrl(baseUrl);
    return withRetry(async () => {
        const isCurrentOpenAiModel = provider === 'openai' && /^gpt-5\.(?:[4-9]|\d{2,})(?:-|$)/i.test(String(model));
        const nativeJsonMode = jsonMode
            && provider !== 'custom'
            && !(provider === 'openrouter' && String(model).toLowerCase() === 'openrouter/free');
        const requestBody = {
            model,
            ...(isCurrentOpenAiModel
                ? { max_completion_tokens: maxTokens, reasoning_effort: 'none' }
                : { max_tokens: maxTokens, temperature: 0.1 }),
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            ...(nativeJsonMode ? { response_format: { type: 'json_object' } } : {})
        };
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                ...(provider === 'openrouter' ? {
                    'HTTP-Referer': 'https://github.com/VIARA',
                    'X-Title': 'VIARA Radiology Reports'
                } : {})
            },
            body: JSON.stringify(requestBody),
            ...(provider === 'custom' ? { redirect: 'error' } : {}),
        });

        if (!response.ok) {
            const msg = await providerErrorMessage(response, model || 'OpenAI-compatible');
            logger.error('AI provider (openai) returned an error', { status: response.status });
            const err = new AppError(msg, response.status === 429 ? 429 : 502);
            err.status = response.status;
            throw err;
        }

        const raw = await response.text();
        let data;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            logger.error('AI provider (openai-compatible) returned non-JSON response', {
                status: response.status,
                baseUrl,
                preview: raw.slice(0, 120)
            });
            throw new AppError('AI provider returned a non-JSON response. Check the provider and base URL.', 502);
        }

        const choice = data?.choices?.[0] || {};
        const content = choice?.message?.content;
        const output = typeof content === 'string'
            ? content.trim()
            : Array.isArray(content)
                ? content
                    .map((part) => typeof part === 'string' ? part : part?.text || part?.content || '')
                    .join('')
                    .trim()
                : '';
        if (output) return output;

        const providerMessage = data?.error?.message || choice?.error?.message || choice?.message?.refusal;
        logger.warn('[AIReport] OpenAI-compatible provider returned an empty completion', {
            provider,
            model,
            finishReason: choice?.finish_reason || null,
            nativeFinishReason: choice?.native_finish_reason || null,
            hasProviderError: Boolean(providerMessage)
        });
        throw new AppError(
            providerMessage
                ? `AI provider returned no report content: ${String(providerMessage).slice(0, 160)}`
                : 'AI provider returned no report content. Select a specific report model or try again.',
            502
        );
    });
};

const callProvider = async ({ systemPrompt, userContent, maxTokens = 2000, includeProvenance = false, jsonMode = false }) => {
    const config = await getProviderConfig();
    if (!config.enabled || !config.apiKey) {
        throw new AppError('AI report drafting is not configured on this server', 503);
    }

    let output;
    if (config.provider === 'anthropic') {
        output = await callAnthropic({ ...config, systemPrompt, userContent, maxTokens });
    } else if (config.provider === 'gemini') {
        output = await callGemini({ ...config, systemPrompt, userContent, maxTokens, jsonMode });
    } else {
        // openrouter, groq, openai, custom all use the OpenAI-compatible endpoint.
        output = await callOpenAiCompatible({ ...config, systemPrompt, userContent, maxTokens, jsonMode });
    }

    return includeProvenance
        ? { output, provenance: { provider: config.provider, model: config.model, profileId: config.profileId, profileName: config.profileName } }
        : output;
};

const parseJsonObject = (value) => {
    const raw = String(value || '')
        .replace(/^\uFEFF/, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
    if (!raw) return null;

    const candidates = [raw];
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) candidates.push(fenced[1].trim());

    const firstBrace = raw.indexOf('{');
    if (firstBrace >= 0) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = firstBrace; index < raw.length; index += 1) {
            const character = raw[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === '"') inString = false;
                continue;
            }
            if (character === '"') inString = true;
            else if (character === '{') depth += 1;
            else if (character === '}') {
                depth -= 1;
                if (depth === 0) {
                    candidates.push(raw.slice(firstBrace, index + 1));
                    break;
                }
            }
        }
    }

    for (const candidate of [...new Set(candidates)]) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
            // Try the next safely extracted candidate.
        }
    }
    return null;
};

const containsArabicScript = (value) => /[\u0600-\u06ff]/u.test(String(value || ''));

const SECTION_HEADING_PATTERN = /^(clinical\s*(history|indication)|history|indication|technique|comparison|findings?|impression|conclusion|recommendations?|plan)\s*:?\s*/i;
const TECHNICAL_REPORT_PATTERN = /\b(ai|artificial intelligence|model|algorithm|confidence|probability|threshold|classifier|heatmap|inference|processing|worker|provider)\b/i;

const stripSectionHeading = (value) => String(value || '')
    .replace(/^\s*(#{1,6}\s*)?/gm, '')
    .split('\n')
    .map((line) => line.replace(SECTION_HEADING_PATTERN, '').trim())
    .join('\n');

const normalizeReportTextBlock = (value, { removeTechnicalSentences = true } = {}) => {
    const lines = stripSectionHeading(value)
        .replace(/\*\*/g, '')
        .replace(/[`_]/g, '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line
            .replace(/[ \t]+/g, ' ')
            .replace(/^\s*[-*\u2022]\s+/u, '- ')
            .replace(/^\s*(\d+)[.)]\s+/, '$1. ')
            .trim())
        .filter(Boolean)
        .filter((line) => !removeTechnicalSentences || !TECHNICAL_REPORT_PATTERN.test(line));

    return lines.join('\n').trim();
};

const ensureTerminalPunctuation = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || /[.!?)]$/.test(trimmed)) return trimmed;
    return `${trimmed}.`;
};

const normalizeClinicalHistory = (value) => (
    normalizeReportTextBlock(value, { removeTechnicalSentences: false })
        .split('\n')
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim()
);

const normalizeNarrativeSection = (value) => (
    normalizeReportTextBlock(value)
        .split('\n')
        .map((line) => {
            if (/^[-]\s+/.test(line)) return `- ${ensureTerminalPunctuation(line.replace(/^-\s+/, ''))}`;
            if (/^\d+\.\s+/.test(line)) return line.replace(/^(\d+\.)\s+(.*)$/, (_, prefix, text) => `${prefix} ${ensureTerminalPunctuation(text)}`);
            return ensureTerminalPunctuation(line);
        })
        .join('\n')
        .trim()
);

const normalizeImpression = (value) => {
    const cleaned = normalizeReportTextBlock(value);
    if (!cleaned) return '';

    const rawLines = cleaned
        .split('\n')
        .map((line) => line.replace(/^[-]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
        .filter(Boolean);

    if (rawLines.length <= 1) {
        return ensureTerminalPunctuation(rawLines[0] || cleaned);
    }

    return rawLines
        .map((line, index) => `${index + 1}. ${ensureTerminalPunctuation(line)}`)
        .join('\n');
};

const sectionValue = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join('\n');
    return String(value || '');
};

const isImageAnalysisUsable = (worker) => (
    worker?.quality?.supported === true &&
    Number(worker?.quality?.imageCountAnalyzed) > 0 &&
    Array.isArray(worker?.findings) &&
    Array.isArray(worker?.evidence) &&
    worker.evidence.length > 0 &&
    worker?.provenance?.mode !== 'metadata-only-analysis'
);

const normalizeDraftSections = (draft = {}) => ({
    clinicalHistory: normalizeClinicalHistory(sectionValue(draft.clinicalHistory || draft.clinical_history || '')),
    technique: normalizeNarrativeSection(sectionValue(draft.technique || '')),
    findings: normalizeNarrativeSection(sectionValue(draft.findings || '')),
    impression: normalizeImpression(sectionValue(draft.impression || '')),
    recommendations: normalizeNarrativeSection(sectionValue(draft.recommendations || ''))
});

const buildStructuredImageAnalysisDraft = ({ exam = {}, imaging = {}, imageAnalysis = null }) => {
    const worker = imageAnalysis?.payload;
    if (!isImageAnalysisUsable(worker) || !Array.isArray(worker.findings)) {
        return null;
    }

    const findings = worker.findings.filter((finding) => finding?.present !== false);
    const findingLabels = findings.map((finding) => {
        const rawLabel = String(finding?.label || '').trim();
        return rawLabel && !containsArabicScript(rawLabel) ? rawLabel : 'Unspecified finding';
    });
    const technicalOutputPattern = /\b(ai|model|score|confidence|probability|threshold|screening|classifier)\b/i;
    const findingLines = findings.map((finding, index) => {
        const label = findingLabels[index];
        const rawLocation = String(finding?.location || '').trim();
        const location = containsArabicScript(rawLocation) ? '' : rawLocation;
        const description = String(finding?.description || '').trim();
        const clinicalDescription = description && !technicalOutputPattern.test(description) && !containsArabicScript(description)
            ? description
            : label;
        return `- ${clinicalDescription}${location && !clinicalDescription.toLowerCase().includes(location.toLowerCase()) ? `; location: ${location}` : ''}.`;
    });

    const summary = String(worker.summary || worker.impression || imageAnalysis?.summary || '').trim();
    const clinicalSummary = summary && !technicalOutputPattern.test(summary) && !containsArabicScript(summary)
        ? summary
        : findings.length
            ? `Reported ${findings.length === 1 ? 'finding' : 'findings'}: ${findingLabels.join(', ')}. Correlate with full image review.`
            : '';
    const noSignalText = 'Findings are pending radiologist review of the complete study.';
    const clinicalHistory = [exam.clinical_indication, exam.provisional_diagnosis]
        .map((value) => String(value || '').trim())
        .filter((value) => value && !containsArabicScript(value))
        .join('; ');
    const coverage = worker?.provenance?.coverage || {
        analyzedImageCount: Number(worker?.quality?.imageCountAnalyzed || 0),
        studyImageCount: Number(imaging.instance_count || 0),
        analyzedSeriesCount: 0,
        studySeriesCount: Number(imaging.series_count || 0),
        completePixelCoverage: false
    };
    const limitations = [
        ...(Array.isArray(worker.limitations)
            ? worker.limitations.map(String).filter((value) => !containsArabicScript(value))
            : []),
        'Generated deterministically from structured PACS image-analysis output; no language model was used.',
        'A radiologist must review every source image and edit this draft before report approval.'
    ].map((value) => value.trim()).filter(Boolean);

    const sections = normalizeDraftSections({
        clinicalHistory,
        technique: '',
        findings: findingLines.length ? findingLines.join('\n') : noSignalText,
        impression: clinicalSummary || noSignalText,
        recommendations: ''
    });

    return {
        sections: {
            ...sections
        },
        limitations: [...new Set(limitations)],
        provenance: {
            mode: 'structured-pacs-ai',
            sourceMode: 'pacs-image-analysis',
            provider: worker?.model?.provider || 'pacs-ai-worker',
            model: worker?.model?.name || null,
            modelRevision: worker?.model?.revision || null,
            coverage
        }
    };
};

/**
 * @param {{ reportText: string, modality?: string, examType?: string, sectionType?: string, language?: string }} input
 * @returns {Promise<string>} polished report text
 */
const improveReportFormat = async ({ reportText, modality, examType, sectionType, language = 'en' }) => {
    const responseLanguage = normalizeLanguage(language);
    const trimmed = (reportText || '').trim();
    if (!trimmed) {
        throw new AppError('Report text is required', 400);
    }

    const systemPrompt = sectionType
        ? buildSectionImprovePrompt(sectionType, responseLanguage)
        : buildSystemPrompt(responseLanguage);
    const contextLines = [
        modality ? `Modality: ${modality}` : null,
        examType ? `Exam type: ${examType}` : null,
        sectionType ? `Report section: ${sectionType}` : null,
        '',
        sectionType ? 'Draft section:' : 'Draft report:',
        trimmed,
    ].filter((line) => line !== null).join('\n');

    try {
        const improved = await callProvider({ systemPrompt, userContent: contextLines });

        if (!improved) {
            throw new AppError('AI provider returned an empty response', 502);
        }
        if (sectionType === 'clinicalHistory') return normalizeClinicalHistory(improved) || trimmed;
        if (sectionType === 'impression') return normalizeImpression(improved) || trimmed;
        if (['technique', 'findings', 'recommendations'].includes(sectionType)) {
            return normalizeNarrativeSection(improved) || trimmed;
        }
        return improved
            .replace(/\*\*/g, '')
            .replace(/[`_]/g, '')
            .trim();
    } catch (error) {
        if (error instanceof AppError) throw error;
        logger.error('AI report formatting failed', { error: error.message });
        throw new AppError('Failed to reach the AI provider', 502);
    }
};

const testConnection = async () => {
    const config = await getProviderConfig();
    if (!config.enabled || !config.apiKey) {
        throw new AppError('AI report provider is not configured', 503);
    }

    // For free-tier cloud providers, use a lightweight ping that does NOT count
    // against the generation RPM quota (listing models is a metadata call).
    if (config.provider === 'gemini') {
        const pingUrl = `${DEFAULTS.gemini.baseUrl}?key=${config.apiKey}&pageSize=1`;
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(pingUrl, { signal: controller.signal }).catch((err) => {
            throw new AppError(`Gemini connectivity check failed: ${err.message}`, 502);
        });
        if (!response.ok) {
            const msg = await providerErrorMessage(response, 'Gemini');
            throw new AppError(msg, response.status === 429 ? 429 : 502);
        }
        return {
            provider: config.provider,
            model: config.model,
            configured: true,
            responsePreview: 'Gemini API reachable (model list ping)'
        };
    }

    if (config.provider === 'openrouter') {
        // OpenRouter models endpoint — free metadata call
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 10_000);
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${config.apiKey}` },
            signal: controller.signal
        }).catch((err) => {
            throw new AppError(`OpenRouter connectivity check failed: ${err.message}`, 502);
        });
        if (!response.ok) {
            const msg = await providerErrorMessage(response, 'OpenRouter');
            throw new AppError(msg, response.status === 429 ? 429 : 502);
        }
        return {
            provider: config.provider,
            model: config.model,
            configured: true,
            responsePreview: 'OpenRouter API reachable (models ping)'
        };
    }

    // For paid providers (Anthropic / OpenAI) use a minimal generation call
    const output = await callProvider({
        systemPrompt: 'You are a health software configuration test. Reply with only: ok',
        userContent: 'Return ok.',
        maxTokens: 16
    });
    return {
        provider: config.provider,
        model: config.model,
        configured: true,
        responsePreview: String(output || '').slice(0, 80)
    };
};

const generatePreliminaryDraft = async ({ exam, template = null, imaging = null, imageAnalysis = null, language = 'en' }) => {
    const responseLanguage = normalizeLanguage(language);
    const usableImageAnalysis = isImageAnalysisUsable(imageAnalysis?.payload) ? imageAnalysis : null;
    const structuredDraft = buildStructuredImageAnalysisDraft({
        exam,
        imaging: imaging || {},
        imageAnalysis: usableImageAnalysis,
        language: responseLanguage
    });
    if (!(await isConfigured())) {
        if (structuredDraft && responseLanguage === 'en') return structuredDraft;
        throw new AppError('AI report drafting is not configured on this server', 503);
    }

    const systemPrompt = buildPreliminaryDraftPrompt(responseLanguage);
    const payload = buildPreliminaryDraftPayload({
        exam,
        template,
        imaging,
        imageAnalysis: usableImageAnalysis
    });

    const userContent = [
        'Create a preliminary report draft for this exam metadata.',
        'If a template is supplied, use it as style/structure only and do not treat its normal findings as image-proven facts unless explicitly provided by the user.',
        'If PACS AI image analysis findings are present in the "imageAnalysis" block, synthesize them into the findings/impression.',
        'When "priorStudy" is present, use it only as comparison history. Clearly distinguish prior findings from current findings and never claim interval change unless current evidence supports it.',
        'Use concise radiology style: clean technique, organized findings, numbered impression when there are multiple conclusions, and recommendations only when explicitly supported.',
        JSON.stringify(payload, null, 2)
    ].join('\n\n');

    try {
        let generated;
        try {
            generated = await callProvider({
                systemPrompt,
                userContent,
                maxTokens: 1800,
                includeProvenance: true,
                jsonMode: true
            });
        } catch (providerError) {
            if (!structuredDraft || responseLanguage !== 'en') throw providerError;
            logger.warn('[AIReport] Report provider failed; using structured PACS draft', {
                error: providerError.message
            });
            return {
                ...structuredDraft,
                limitations: [
                    ...(structuredDraft.limitations || []),
                    'The configured report language provider was unavailable, so this draft uses the validated structured image-analysis output directly.'
                ],
                provenance: {
                    ...structuredDraft.provenance,
                    fallbackReason: 'report-provider-failed'
                }
            };
        }
        const output = generated.output;
        if (!String(output || '').trim()) {
            if (structuredDraft && responseLanguage === 'en') {
                return {
                    ...structuredDraft,
                    limitations: [
                        ...(structuredDraft.limitations || []),
                        'The configured report language provider returned no content, so this draft uses the validated structured image-analysis output directly.'
                    ],
                    provenance: {
                        ...structuredDraft.provenance,
                        fallbackReason: 'empty-provider-output',
                        requestedReportProvider: generated.provenance?.provider || null,
                        requestedReportModel: generated.provenance?.model || null
                    }
                };
            }
            throw new AppError('AI provider returned no report content. Select a specific report model or try again.', 502);
        }
        let parsed = parseJsonObject(output);
        if (!parsed) {
            logger.warn('[AIReport] Provider returned a non-JSON preliminary draft; attempting one repair pass', {
                provider: generated.provenance?.provider,
                model: generated.provenance?.model,
                outputLength: String(output || '').length
            });
            try {
                const repairedOutput = await callProvider({
                    systemPrompt: [
                        'You are a strict JSON repair utility.',
                        'Convert the supplied radiology draft into valid JSON without adding or changing clinical facts.',
                        'Return JSON only with this shape:',
                        '{"clinicalHistory":"","technique":"","findings":"","impression":"","recommendations":"","limitations":[]}',
                        languageInstruction(responseLanguage)
                    ].join('\n'),
                    userContent: `Repair this provider output:\n\n${String(output || '').slice(0, 20000)}`,
                    maxTokens: 1800,
                    jsonMode: true
                });
                parsed = parseJsonObject(repairedOutput);
            } catch (repairError) {
                logger.warn('[AIReport] Draft JSON repair pass failed', {
                    provider: generated.provenance?.provider,
                    model: generated.provenance?.model,
                    error: repairError.message
                });
            }
        }
        if (!parsed && structuredDraft && responseLanguage === 'en') {
            return {
                ...structuredDraft,
                limitations: [
                    ...(structuredDraft.limitations || []),
                    'The configured report language provider returned an invalid format, so this draft uses the validated structured image-analysis output directly.'
                ],
                provenance: {
                    ...structuredDraft.provenance,
                    fallbackReason: 'invalid-provider-json',
                    requestedReportProvider: generated.provenance?.provider || null,
                    requestedReportModel: generated.provenance?.model || null
                }
            };
        }
        if (!parsed) {
            throw new AppError('The AI provider did not return a usable report draft. Try again or select a different report model.', 502);
        }
        const parsedDraft = [parsed.sections, parsed.report, parsed.draft]
            .find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate))
            || parsed;
        const sections = normalizeDraftSections(parsedDraft);
        if (!sections.findings && !sections.impression) {
            throw new AppError('AI provider returned an empty draft', 502);
        }
        const hasRequestedLanguage = responseLanguage === 'ar'
            ? Object.values(sections).some(containsArabicScript)
            : !Object.values(sections).some(containsArabicScript);
        if (!hasRequestedLanguage) {
            logger.warn('[AIReport] Provider returned report content in the wrong language', {
                provider: generated.provenance?.provider,
                model: generated.provenance?.model,
                requestedLanguage: responseLanguage
            });
            if (structuredDraft && responseLanguage === 'en') {
                return {
                    ...structuredDraft,
                    limitations: [
                        ...(structuredDraft.limitations || []),
                        'The configured report provider returned non-English content, so this draft uses the English structured image-analysis output directly.'
                    ],
                    provenance: {
                        ...structuredDraft.provenance,
                        fallbackReason: 'non-english-provider-output',
                        requestedReportProvider: generated.provenance?.provider || null,
                        requestedReportModel: generated.provenance?.model || null
                    }
                };
            }
            throw new AppError('The AI provider returned report content in a different language than requested. Try again or select a different report model.', 502);
        }
        if (!usableImageAnalysis) {
            const reviewRequired = responseLanguage === 'ar'
                ? 'بانتظار مراجعة اختصاصي الأشعة لكامل الصور.'
                : 'Findings are pending radiologist review of the complete study.';
            sections.findings = reviewRequired;
            sections.impression = reviewRequired;
            sections.recommendations = '';
        }
        return {
            sections,
            limitations: [
                ...(Array.isArray(parsed.limitations || parsedDraft.limitations)
                ? (parsed.limitations || parsedDraft.limitations)
                    .map(String)
                    .filter((value) => value && (responseLanguage !== 'en' || !containsArabicScript(value)))
                : []),
                ...(!usableImageAnalysis
                    ? [responseLanguage === 'ar'
                        ? 'لم تُحلل صور الدراسة؛ أُبقيت النتائج والانطباع بانتظار مراجعة اختصاصي الأشعة.'
                        : 'No study images were analyzed; findings and impression are placeholders pending radiologist review.']
                    : [])
            ],
            provenance: {
                ...generated.provenance,
                sourceMode: usableImageAnalysis ? 'pacs-image-analysis' : 'exam-metadata',
                imageAnalysisProvider: usableImageAnalysis?.payload?.model?.provider || null,
                imageAnalysisModel: usableImageAnalysis?.payload?.model?.name || null,
                coverage: usableImageAnalysis?.payload?.provenance?.coverage || null
            }
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        logger.error('AI preliminary draft generation failed', { error: error.message });
        throw new AppError('Failed to generate preliminary AI draft', 502);
    }
};

const buildPreliminaryDraftPayload = ({ exam, template, imaging, imageAnalysis }) => {
    const payload = {
        exam: {
            modality: exam.modality_type || exam.modality_name,
            examType: exam.exam_type_name,
            bodyPart: exam.body_part,
            clinicalIndication: exam.clinical_indication,
            provisionalDiagnosis: exam.provisional_diagnosis,
            contrastRequired: exam.contrast_required
        },
        priorStudy: exam.is_follow_up && exam.prior_exam_id ? {
            examType: exam.prior_exam_type_name,
            modality: exam.prior_modality_name,
            examDate: exam.prior_exam_time,
            comparisonAvailable: true
        } : null,
        imaging: {
            instanceCount: Number(imaging?.instance_count || 0),
            seriesCount: Number(imaging?.series_count || 0)
        },
        imageAnalysis: null,
        template: template ? {
            name: template.name,
            clinicalHistory: template.clinical_history,
            technique: template.technique,
            findings: template.findings,
            impression: template.impression,
            recommendations: template.recommendations
        } : null
    };

    if (isImageAnalysisUsable(imageAnalysis?.payload)) {
        const worker = imageAnalysis.payload;
        payload.imageAnalysis = {
            summary: String(worker.summary || worker.impression || '').slice(0, 1000),
            findings: worker.findings.map((finding) => ({
                label: String(finding.label || '').slice(0, 120),
                present: finding.present !== false,
                location: finding.location ? String(finding.location).slice(0, 160) : null,
                description: String(finding.description || '').slice(0, 1000)
            })),
            quality: { supported: true }
        };
    }

    return payload;
};

module.exports = {
    improveReportFormat,
    generatePreliminaryDraft,
    testConnection,
    isConfigured,
    buildStructuredImageAnalysisDraft,
    buildPreliminaryDraftPayload,
    isImageAnalysisUsable,
    parseJsonObject
};
