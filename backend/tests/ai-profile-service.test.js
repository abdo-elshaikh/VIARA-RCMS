const state = {};

jest.mock('dns', () => ({
    promises: {
        lookup: jest.fn().mockResolvedValue({ address: '93.184.216.34' })
    }
}));

jest.mock('../src/services/settingsService', () => ({
    getAll: jest.fn(async () => ({ ...state })),
    get: jest.fn(async (key, fallback = null) => state[key] ?? fallback),
    set: jest.fn(async (key, value) => { state[key] = value; }),
    updateAll: jest.fn(async (updates) => Object.assign(state, updates))
}));

jest.mock('../src/utils/crypto', () => ({
    encrypt: jest.fn((value) => `encrypted:${value}`),
    decrypt: jest.fn((value) => String(value || '').replace(/^encrypted:/, ''))
}));

const profileService = require('../src/services/aiProfileService');

describe('AI profile service', () => {
    beforeEach(() => {
        Object.keys(state).forEach((key) => delete state[key]);
    });

    it('imports legacy settings as named active profiles', async () => {
        state['ai.report.provider'] = 'gemini';
        state['ai.report.model'] = 'gemini-2.0-flash';
        state['ai.report.api_key_enc'] = 'encrypted:legacy-key';

        const groups = await profileService.listProfiles();

        expect(groups.report.profiles[0]).toMatchObject({
            name: 'Primary report AI',
            provider: 'gemini',
            active: true,
            apiKeyConfigured: true
        });
        expect(groups.pacs.profiles[0].active).toBe(true);
    });

    it('creates and activates a reusable custom-named profile', async () => {
        await profileService.listProfiles();
        const created = await profileService.createProfile({
            target: 'report',
            name: 'Gemini backup',
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            apiKey: 'backup-key'
        });
        await profileService.activateProfile(created.id);

        const active = await profileService.getActiveConfig('report');
        expect(active).toMatchObject({
            id: created.id,
            name: 'Gemini backup',
            apiKey: 'backup-key'
        });
    });

    it('migrates retired Gemini model IDs in saved profiles', async () => {
        state['ai.provider_profiles'] = JSON.stringify([
            {
                id: 'pacs-old',
                target: 'pacs',
                name: 'Legacy PACS Gemini',
                enabled: true,
                provider: 'cloud-gemini',
                model: 'gemini-1.5-flash'
            }
        ]);
        state['ai.pacs.active_profile_id'] = 'pacs-old';

        const groups = await profileService.listProfiles();

        expect(groups.pacs.profiles[0].model).toBe('gemini-3.5-flash');
        expect(state['ai.pacs.model']).toBe('gemini-3.5-flash');
    });

    it('creates an OpenAI PACS profile with the current balanced vision default', async () => {
        await profileService.listProfiles();
        const created = await profileService.createProfile({
            target: 'pacs',
            name: 'OpenAI vision',
            provider: 'cloud-openai',
            baseUrl: 'https://wrong.example/v1',
            apiKey: 'openai-secret'
        });

        expect(created).toMatchObject({
            provider: 'cloud-openai',
            model: 'gpt-5.6-terra',
            baseUrl: ''
        });
    });

    it('hides stale PACS base URLs for fixed cloud providers but keeps custom URLs', async () => {
        state['ai.provider_profiles'] = JSON.stringify([
            {
                id: 'pacs-gemini',
                target: 'pacs',
                name: 'Gemini PACS',
                enabled: true,
                provider: 'cloud-gemini',
                model: 'gemini-3.5-flash',
                baseUrl: 'https://logfare.ai/v1'
            },
            {
                id: 'pacs-custom',
                target: 'pacs',
                name: 'Custom PACS',
                enabled: true,
                provider: 'cloud-custom',
                model: 'glm-5.2',
                baseUrl: 'https://agentrouter.org/v1'
            }
        ]);
        state['ai.pacs.active_profile_id'] = 'pacs-gemini';

        const groups = await profileService.listProfiles();
        expect(groups.pacs.profiles.find((item) => item.id === 'pacs-gemini').baseUrl).toBe('');
        expect(groups.pacs.profiles.find((item) => item.id === 'pacs-custom').baseUrl).toBe('https://agentrouter.org/v1');
        await expect(profileService.getActiveConfig('pacs')).resolves.toMatchObject({
            provider: 'cloud-gemini',
            baseUrl: ''
        });
    });

    it('creates an OpenAI report profile with the current balanced default', async () => {
        await profileService.listProfiles();
        const created = await profileService.createProfile({
            target: 'report',
            name: 'OpenAI reporting',
            provider: 'openai',
            apiKey: 'openai-secret'
        });

        expect(created).toMatchObject({
            provider: 'openai',
            model: 'gpt-5.6-terra'
        });
    });

    it('rejects unsafe custom endpoints before persistence', async () => {
        await profileService.listProfiles();

        await expect(profileService.createProfile({
            target: 'report',
            name: 'Unsafe custom provider',
            provider: 'custom',
            model: 'custom-model',
            baseUrl: 'https://127.0.0.1/v1',
            apiKey: 'secret'
        })).rejects.toMatchObject({ statusCode: 400 });

        expect(JSON.parse(state['ai.provider_profiles']))
            .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Unsafe custom provider' })]));
    });

    it('preserves local PACS worker URLs', async () => {
        await profileService.listProfiles();
        const profile = await profileService.createProfile({
            target: 'pacs',
            name: 'Local PACS worker',
            provider: 'local-torchxrayvision',
            workerUrl: 'http://127.0.0.1:5000',
            model: 'densenet121-res224-all'
        });

        expect(profile.workerUrl).toBe('http://127.0.0.1:5000');
    });

    it('does not allow deleting the active profile', async () => {
        const groups = await profileService.listProfiles();
        await expect(profileService.deleteProfile(groups.report.activeProfileId))
            .rejects.toMatchObject({ statusCode: 409 });
    });
});
