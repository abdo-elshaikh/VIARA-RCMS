jest.mock('../src/services/settingsService', () => ({
    getAll: jest.fn()
}));

jest.mock('../src/utils/crypto', () => ({
    decrypt: jest.fn((value) => value)
}));

jest.mock('../src/services/aiProfileService', () => ({
    getActiveConfig: jest.fn()
}));

const settingsService = require('../src/services/settingsService');
const aiProfileService = require('../src/services/aiProfileService');
const aiReportService = require('../src/services/aiReportService');
const { getPacsAiConfig } = require('../src/services/pacsAiAnalysisService');

describe('AI provider profiles', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.AI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.PACS_AI_API_KEY;
        delete process.env.PACS_AI_MODEL;
        delete process.env.PACS_AI_PROVIDER;
    });

    afterAll(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });

    it('does not reuse a report key owned by another provider', async () => {
        aiProfileService.getActiveConfig.mockResolvedValue({
            enabled: true, provider: 'openai', model: 'gpt-4o-mini', apiKey: ''
        });

        await expect(aiReportService.isConfigured()).resolves.toBe(false);
    });

    it('uses the key when it belongs to the active report provider', async () => {
        aiProfileService.getActiveConfig.mockResolvedValue({
            enabled: true, provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'gemini-secret'
        });

        await expect(aiReportService.isConfigured()).resolves.toBe(true);
    });

    it('uses a cloud-specific PACS model default', async () => {
        aiProfileService.getActiveConfig.mockResolvedValue({
            enabled: true, provider: 'cloud-gemini', model: '', apiKey: 'gemini-secret'
        });

        await expect(getPacsAiConfig()).resolves.toMatchObject({
            provider: 'cloud-gemini',
            model: 'gemini-3.5-flash'
        });
    });

    it('uses the OpenAI PACS vision default for an OpenAI cloud profile', async () => {
        aiProfileService.getActiveConfig.mockResolvedValue({
            enabled: true, provider: 'cloud-openai', model: '', apiKey: 'openai-secret'
        });

        await expect(getPacsAiConfig()).resolves.toMatchObject({
            provider: 'cloud-openai',
            model: 'gpt-5.6-terra'
        });
    });

    it('replaces a retired Gemini PACS model defensively', async () => {
        aiProfileService.getActiveConfig.mockResolvedValue({
            enabled: true,
            provider: 'cloud-gemini',
            model: 'gemini-1.5-flash',
            apiKey: 'gemini-secret'
        });

        await expect(getPacsAiConfig()).resolves.toMatchObject({
            provider: 'cloud-gemini',
            model: 'gemini-3.5-flash'
        });
    });

    it('normalizes the legacy local-worker profile', async () => {
        aiProfileService.getActiveConfig.mockResolvedValue({
            enabled: true, provider: 'local-torchxrayvision', model: '', workerUrl: 'http://localhost:3015'
        });

        await expect(getPacsAiConfig()).resolves.toMatchObject({
            provider: 'local-torchxrayvision',
            model: 'densenet121-res224-all'
        });
    });

    it('falls back to structured PACS findings when OpenRouter returns no content', async () => {
        aiProfileService.getActiveConfig.mockResolvedValue({
            id: 'profile-1',
            name: 'OpenRouter Free',
            enabled: true,
            provider: 'openrouter',
            model: 'openrouter/free',
            apiKey: 'openrouter-secret',
            baseUrl: 'https://openrouter.ai/api/v1/chat/completions'
        });
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                choices: [{ finish_reason: 'stop', message: { content: '' } }]
            })
        });

        const result = await aiReportService.generatePreliminaryDraft({
            exam: { clinical_indication: 'Cough' },
            imaging: { instance_count: 1, series_count: 1 },
            imageAnalysis: {
                payload: {
                    findings: [{ label: 'Effusion', present: true }],
                    summary: 'Pleural effusion.',
                    quality: { supported: true, imageCountAnalyzed: 1 },
                    model: { provider: 'pacs-worker', name: 'test-model' }
                }
            }
        });

        expect(result.sections.findings).toBe('- Effusion.');
        expect(result.provenance.fallbackReason).toBe('report-provider-failed');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(requestBody.response_format).toBeUndefined();
    });

    it('uses the GPT-5.6 compatible Chat Completions parameters for OpenAI reports', async () => {
        aiProfileService.getActiveConfig.mockResolvedValue({
            id: 'openai-profile',
            name: 'OpenAI reporting',
            enabled: true,
            provider: 'openai',
            model: 'gpt-5.6-terra',
            apiKey: 'openai-secret',
            baseUrl: ''
        });
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                choices: [{ message: { content: JSON.stringify({
                    clinicalHistory: 'Pain',
                    technique: 'MRI without contrast.',
                    findings: 'Radiologist review is required.',
                    impression: 'Preliminary review pending.',
                    recommendations: '',
                    limitations: ['Preliminary draft.']
                }) } }]
            })
        });

        await aiReportService.generatePreliminaryDraft({
            exam: { clinical_indication: 'Pain' },
            imaging: { instance_count: 0, series_count: 0 }
        });

        const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(global.fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
        expect(requestBody).toMatchObject({
            model: 'gpt-5.6-terra',
            reasoning_effort: 'none',
            max_completion_tokens: 1800,
            response_format: { type: 'json_object' }
        });
        expect(requestBody.max_tokens).toBeUndefined();
        expect(requestBody.temperature).toBeUndefined();
    });
});
