const crypto = require('crypto');
const settingsService = require('./settingsService');
const { encrypt, decrypt } = require('../utils/crypto');
const { AppError } = require('../middleware/errorHandler');
const { GEMINI_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL, normalizeAiModel } = require('./aiModelPolicy');

const PROFILES_KEY = 'ai.provider_profiles';
const ACTIVE_KEYS = { report: 'ai.report.active_profile_id', pacs: 'ai.pacs.active_profile_id' };
const DEFAULT_MODELS = {
    report: { anthropic: 'claude-3-5-sonnet-latest', openai: OPENAI_DEFAULT_MODEL, gemini: GEMINI_DEFAULT_MODEL, openrouter: 'openrouter/auto', groq: 'meta-llama/llama-4-scout-17b-16e-instruct', custom: '' },
    pacs: { 'cloud-gemini': GEMINI_DEFAULT_MODEL, 'cloud-openrouter': 'openrouter/auto', 'cloud-openai': OPENAI_DEFAULT_MODEL, 'cloud-custom': '', 'local-torchxrayvision': 'densenet121-res224-all', 'local-medgemma': 'google/medgemma-1.5-4b-it', custom: '' }
};
const CLOUD_PACS = new Set(['cloud-gemini', 'cloud-openrouter', 'cloud-openai', 'cloud-custom']);
const FIXED_ENDPOINT_PACS = new Set(['cloud-gemini', 'cloud-openrouter', 'cloud-openai']);

const parseBool = (value, fallback = false) => value === undefined || value === null || value === ''
    ? fallback
    : String(value).toLowerCase() === 'true';
const parseProfiles = (value) => {
    try { return Array.isArray(JSON.parse(value || '[]')) ? JSON.parse(value || '[]') : []; } catch { return []; }
};
const safeDecrypt = (value) => { try { return value ? decrypt(value) || '' : ''; } catch { return ''; } };
const maskSecret = (value) => value ? (value.length <= 8 ? '••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`) : '';
const normalizePacsProvider = (value) => ({ 'local-worker': 'local-torchxrayvision', gemini: 'cloud-gemini', openrouter: 'cloud-openrouter', openai: 'cloud-openai' }[String(value || '').toLowerCase()] || String(value || '').toLowerCase());
const normalizeProvider = (target, value) => target === 'pacs' ? normalizePacsProvider(value) : String(value || '').toLowerCase();
const secretKey = (id) => `ai.profile.${id}.key`;
const normalizeBaseUrl = (target, provider, value) => (
    target === 'pacs' && FIXED_ENDPOINT_PACS.has(provider)
        ? ''
        : String(value || '').trim()
);

const envSecret = (target, provider) => {
    if (target === 'report') {
        if (provider === 'gemini') return process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
        if (provider === 'openrouter') return process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || '';
        if (provider === 'groq') return process.env.GROQ_API_KEY || process.env.AI_API_KEY || '';
        if (provider === 'openai') return process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
        return process.env.AI_API_KEY || '';
    }
    if (provider === 'cloud-gemini') return process.env.PACS_AI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (provider === 'cloud-openrouter') return process.env.PACS_AI_API_KEY || process.env.OPENROUTER_API_KEY || '';
    if (provider === 'cloud-openai') return process.env.PACS_AI_API_KEY || process.env.OPENAI_API_KEY || '';
    return process.env.PACS_AI_API_KEY || '';
};

const legacyProfile = (target, settings) => {
    const isReport = target === 'report';
    const provider = normalizeProvider(target, settings[`ai.${target}.provider`] || (isReport ? process.env.AI_PROVIDER || 'gemini' : process.env.PACS_AI_PROVIDER || 'local-torchxrayvision'));
    return {
        id: `${target}-default`, target,
        name: isReport ? 'Primary report AI' : 'Primary PACS AI',
        enabled: parseBool(settings[`ai.${target}.enabled`], isReport && Boolean(envSecret(target, provider))),
        provider,
        model: normalizeAiModel(
            target,
            provider,
            settings[`ai.${target}.model`] || (isReport ? process.env.AI_MODEL : process.env.PACS_AI_MODEL),
            DEFAULT_MODELS[target][provider] || ''
        ),
        baseUrl: normalizeBaseUrl(
            target,
            provider,
            settings[`ai.${target}.base_url`] || (isReport ? process.env.AI_BASE_URL : process.env.PACS_AI_BASE_URL)
        ),
        workerUrl: isReport ? '' : settings['ai.pacs.worker_url'] || process.env.PACS_AI_WORKER_URL || '',
        modelVersion: isReport ? '' : settings['ai.pacs.model_version'] || process.env.PACS_AI_MODEL_VERSION || '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
};

let initializing;
const ensureProfiles = async () => {
    if (initializing) return initializing;
    initializing = (async () => {
        const settings = await settingsService.getAll();
        let profiles = parseProfiles(settings[PROFILES_KEY]);
        if (profiles.length) {
            let changed = false;
            profiles = profiles.map((profile) => {
                const model = normalizeAiModel(
                    profile.target,
                    profile.provider,
                    profile.model,
                    DEFAULT_MODELS[profile.target]?.[profile.provider] || ''
                );
                if (model === profile.model) return profile;
                changed = true;
                return { ...profile, model, updatedAt: new Date().toISOString() };
            });
            if (changed) {
                const updates = { [PROFILES_KEY]: JSON.stringify(profiles) };
                for (const target of ['report', 'pacs']) {
                    const activeId = settings[ACTIVE_KEYS[target]];
                    const active = profiles.find((profile) => profile.target === target && profile.id === activeId);
                    if (active) updates[`ai.${target}.model`] = active.model;
                }
                await settingsService.updateAll(updates);
                return { settings: await settingsService.getAll(), profiles };
            }
            return { settings, profiles };
        }
        profiles = [legacyProfile('report', settings), legacyProfile('pacs', settings)];
        const updates = {
            [PROFILES_KEY]: JSON.stringify(profiles),
            [ACTIVE_KEYS.report]: profiles[0].id,
            [ACTIVE_KEYS.pacs]: profiles[1].id
        };
        if (settings['ai.report.api_key_enc']) updates[secretKey(profiles[0].id)] = settings['ai.report.api_key_enc'];
        if (settings['ai.pacs.api_key_enc']) updates[secretKey(profiles[1].id)] = settings['ai.pacs.api_key_enc'];
        await settingsService.updateAll(updates);
        return { settings: await settingsService.getAll(), profiles };
    })();
    try { return await initializing; } finally { initializing = null; }
};

const readiness = (profile, hasKey) => {
    if (!profile.enabled || !profile.model) return false;
    if (profile.target === 'report') return hasKey && (profile.provider !== 'custom' || Boolean(profile.baseUrl));
    if (CLOUD_PACS.has(profile.provider)) return profile.provider === 'cloud-custom' ? Boolean(profile.baseUrl) : hasKey;
    return Boolean(profile.workerUrl);
};

const hydrate = (profile, settings, activeId) => {
    const stored = safeDecrypt(settings[secretKey(profile.id)]);
    const environment = envSecret(profile.target, profile.provider);
    const key = stored || environment;
    return {
        ...profile,
        baseUrl: normalizeBaseUrl(profile.target, profile.provider, profile.baseUrl),
        active: profile.id === activeId,
        configured: readiness(profile, Boolean(key)),
        apiKeyConfigured: Boolean(key),
        apiKeyPreview: maskSecret(key),
        source: stored ? 'settings' : (environment ? 'env' : 'none')
    };
};

const listProfiles = async () => {
    const { settings, profiles } = await ensureProfiles();
    return ['report', 'pacs'].reduce((result, target) => {
        const targetProfiles = profiles.filter((item) => item.target === target);
        const activeId = settings[ACTIVE_KEYS[target]] || targetProfiles[0]?.id || null;
        result[target] = { activeProfileId: activeId, profiles: targetProfiles.map((item) => hydrate(item, settings, activeId)) };
        return result;
    }, {});
};

const getActiveConfig = async (target) => {
    const data = await listProfiles();
    const profile = data[target]?.profiles.find((item) => item.active) || data[target]?.profiles[0];
    if (!profile) return null;
    const settings = await settingsService.getAll();
    return {
        ...profile,
        baseUrl: normalizeBaseUrl(profile.target, profile.provider, profile.baseUrl),
        apiKey: safeDecrypt(settings[secretKey(profile.id)]) || envSecret(target, profile.provider)
    };
};

const saveProfiles = (profiles) => settingsService.set(PROFILES_KEY, JSON.stringify(profiles));
const validateTarget = (target) => { if (!['report', 'pacs'].includes(target)) throw new AppError('Invalid AI profile target', 400); };

const createProfile = async (input) => {
    validateTarget(input.target);
    const { profiles } = await ensureProfiles();
    if (profiles.filter((item) => item.target === input.target).length >= 12) throw new AppError('Maximum 12 profiles per AI category', 409);
    if (profiles.some((item) => item.target === input.target && item.name.toLowerCase() === input.name.trim().toLowerCase())) {
        throw new AppError('A profile with this name already exists', 409);
    }
    const provider = normalizeProvider(input.target, input.provider);
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_MODELS[input.target], provider)) throw new AppError('Unsupported AI provider', 400);
    const now = new Date().toISOString();
    const profile = {
        id: crypto.randomUUID(), target: input.target, name: input.name.trim(),
        enabled: input.enabled !== false, provider,
        model: normalizeAiModel(
            input.target,
            provider,
            input.model,
            DEFAULT_MODELS[input.target][provider] || ''
        ),
        baseUrl: normalizeBaseUrl(input.target, provider, input.baseUrl),
        workerUrl: input.workerUrl || '',
        modelVersion: input.modelVersion || '',
        createdAt: now, updatedAt: now
    };
    await saveProfiles([...profiles, profile]);
    if (input.apiKey) await settingsService.set(secretKey(profile.id), encrypt(input.apiKey));
    return profile;
};

const updateProfile = async (id, input) => {
    const { profiles } = await ensureProfiles();
    const index = profiles.findIndex((item) => item.id === id);
    if (index < 0) throw new AppError('AI profile not found', 404);
    const current = profiles[index];
    const provider = normalizeProvider(current.target, input.provider || current.provider);
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_MODELS[current.target], provider)) throw new AppError('Unsupported AI provider', 400);
    const nextName = String(input.name || current.name).trim();
    if (profiles.some((item) => item.id !== id && item.target === current.target && item.name.toLowerCase() === nextName.toLowerCase())) {
        throw new AppError('A profile with this name already exists', 409);
    }
    const requestedModel = input.model !== undefined
        ? input.model
        : (provider === current.provider ? current.model : DEFAULT_MODELS[current.target][provider]);
    const updated = {
        ...current,
        ...input,
        id,
        target: current.target,
        provider,
        name: nextName,
        model: normalizeAiModel(
            current.target,
            provider,
            requestedModel,
            DEFAULT_MODELS[current.target][provider] || ''
        ),
        baseUrl: normalizeBaseUrl(current.target, provider, input.baseUrl !== undefined ? input.baseUrl : current.baseUrl),
        updatedAt: new Date().toISOString()
    };
    delete updated.apiKey; delete updated.clearApiKey;
    profiles[index] = updated;
    await saveProfiles(profiles);
    if (provider !== current.provider && !input.apiKey) await settingsService.set(secretKey(id), '');
    if (input.clearApiKey) await settingsService.set(secretKey(id), '');
    if (input.apiKey) await settingsService.set(secretKey(id), encrypt(input.apiKey));
    if ((await settingsService.get(ACTIVE_KEYS[current.target])) === id) await mirrorActive(updated);
    return updated;
};

const mirrorActive = async (profile) => {
    const prefix = `ai.${profile.target}`;
    const baseUrl = normalizeBaseUrl(profile.target, profile.provider, profile.baseUrl);
    const updates = {
        [ACTIVE_KEYS[profile.target]]: profile.id,
        [`${prefix}.enabled`]: String(profile.enabled), [`${prefix}.provider`]: profile.provider,
        [`${prefix}.model`]: profile.model || '', [`${prefix}.base_url`]: baseUrl
    };
    if (profile.target === 'pacs') {
        updates['ai.pacs.worker_url'] = profile.workerUrl || '';
        updates['ai.pacs.model_version'] = profile.modelVersion || '';
    }
    await settingsService.updateAll(updates);
};

const activateProfile = async (id) => {
    const { profiles } = await ensureProfiles();
    const profile = profiles.find((item) => item.id === id);
    if (!profile) throw new AppError('AI profile not found', 404);
    await mirrorActive(profile);
    return profile;
};

const deleteProfile = async (id) => {
    const { settings, profiles } = await ensureProfiles();
    const profile = profiles.find((item) => item.id === id);
    if (!profile) throw new AppError('AI profile not found', 404);
    if (settings[ACTIVE_KEYS[profile.target]] === id) throw new AppError('Activate another profile before deleting this one', 409);
    if (profiles.filter((item) => item.target === profile.target).length <= 1) throw new AppError('At least one profile is required', 409);
    await saveProfiles(profiles.filter((item) => item.id !== id));
    await settingsService.set(secretKey(id), '');
};

module.exports = { listProfiles, getActiveConfig, createProfile, updateProfile, activateProfile, deleteProfile, DEFAULT_MODELS, CLOUD_PACS };
