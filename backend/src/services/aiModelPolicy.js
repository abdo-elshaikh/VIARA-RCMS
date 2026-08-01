'use strict';

const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash';
const OPENAI_DEFAULT_MODEL = 'gpt-5.6-terra';

const normalizeModelId = (value) => String(value || '').trim().replace(/^models\//i, '');

const isRetiredGeminiModel = (value) => {
    const model = normalizeModelId(value).toLowerCase();
    return /^gemini-(?:1(?:\.0|\.5)?|2\.0)(?:-|$)/.test(model);
};

const normalizeGeminiModel = (value) => {
    const model = normalizeModelId(value);
    return !model || isRetiredGeminiModel(model) ? GEMINI_DEFAULT_MODEL : model;
};

const normalizeAiModel = (target, provider, value, fallback = '') => {
    const normalizedProvider = String(provider || '').toLowerCase();
    if (
        (target === 'report' && normalizedProvider === 'gemini') ||
        (target === 'pacs' && normalizedProvider === 'cloud-gemini')
    ) {
        return normalizeGeminiModel(value || fallback);
    }
    return normalizeModelId(value || fallback);
};

module.exports = {
    GEMINI_DEFAULT_MODEL,
    OPENAI_DEFAULT_MODEL,
    isRetiredGeminiModel,
    normalizeAiModel,
    normalizeGeminiModel,
    normalizeModelId
};
