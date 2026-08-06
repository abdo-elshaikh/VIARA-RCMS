jest.mock('../src/config/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('dns', () => ({
    promises: {
        lookup: jest.fn().mockResolvedValue({ address: '93.184.216.34' })
    }
}));

const {
    analyzeStudy,
    isConfigured,
    selectRepresentativeInstances,
    normalizeOpenAiCompatibleChatUrl
} = require('../src/services/cloudVisionService');

const originalFetch = global.fetch;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
const originalPacsProviderTimeout = process.env.PACS_AI_PROVIDER_TIMEOUT_MS;
const originalPacsTotalImageBytes = process.env.PACS_AI_MAX_CLOUD_TOTAL_IMAGE_BYTES;
const originalOrthancPassword = process.env.ORTHANC_PASSWORD;

const restoreEnv = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
};

const makeSeries = (uid, count) => ({
    seriesInstanceUid: uid,
    seriesNumber: Number(uid),
    modality: 'MR',
    description: `Series ${uid}`,
    instances: Array.from({ length: count }, (_, index) => ({
        sopInstanceUid: `${uid}.${index + 1}`,
        instanceNumber: index + 1,
        orthancId: `orthanc-${uid}-${index + 1}`
    }))
});

describe('cloud vision study sampling', () => {
    afterEach(() => {
        global.fetch = originalFetch;
        restoreEnv('OPENAI_API_KEY', originalOpenAiApiKey);
        restoreEnv('OPENROUTER_API_KEY', originalOpenRouterApiKey);
        restoreEnv('PACS_AI_PROVIDER_TIMEOUT_MS', originalPacsProviderTimeout);
        restoreEnv('PACS_AI_MAX_CLOUD_TOTAL_IMAGE_BYTES', originalPacsTotalImageBytes);
        restoreEnv('ORTHANC_PASSWORD', originalOrthancPassword);
    });

    beforeEach(() => {
        process.env.ORTHANC_PASSWORD = 'test-orthanc-password';
    });

    it('represents every series and allocates extra frames to longer series', () => {
        const selected = selectRepresentativeInstances([
            makeSeries('1', 10),
            makeSeries('2', 4),
            makeSeries('3', 1)
        ], 6);

        expect(selected).toHaveLength(6);
        expect(new Set(selected.map((item) => item.seriesInstanceUid))).toEqual(new Set(['1', '2', '3']));
        expect(selected.filter((item) => item.seriesInstanceUid === '1')).toHaveLength(4);
        expect(selected.map((item) => item.sopInstanceUid)).toEqual([
            '1.1', '2.2', '3.1', '1.4', '1.7', '1.10'
        ]);
    });

    it('selects series uniformly when the series count exceeds the image limit', () => {
        const selected = selectRepresentativeInstances([
            makeSeries('1', 3),
            makeSeries('2', 3),
            makeSeries('3', 3),
            makeSeries('4', 3)
        ], 2);

        expect(selected.map((item) => item.seriesInstanceUid)).toEqual(['1', '4']);
        expect(selected.every((item) => item.instanceNumber === 2)).toBe(true);
    });

    it('ignores instances that cannot be resolved in Orthanc', () => {
        const selected = selectRepresentativeInstances([
            {
                ...makeSeries('1', 1),
                instances: [{ sopInstanceUid: '1.1', instanceNumber: 1, orthancId: null }]
            }
        ], 4);

        expect(selected).toEqual([]);
    });

    it('recognizes an OpenAI key for the OpenAI cloud provider only', () => {
        process.env.OPENAI_API_KEY = 'openai-secret';
        delete process.env.OPENROUTER_API_KEY;

        expect(isConfigured('', 'cloud-openai')).toBe(true);
        expect(isConfigured('', 'cloud-openrouter')).toBe(false);
    });

    it('normalizes OpenAI-compatible custom provider URLs', () => {
        expect(normalizeOpenAiCompatibleChatUrl('https://api.example.com'))
            .toBe('https://api.example.com/v1/chat/completions');
        expect(normalizeOpenAiCompatibleChatUrl('https://api.example.com/v1'))
            .toBe('https://api.example.com/v1/chat/completions');
        expect(normalizeOpenAiCompatibleChatUrl('https://api.example.com/v1/chat/completions'))
            .toBe('https://api.example.com/v1/chat/completions');
    });

    it('rejects an HTML webpage configured as a custom provider API', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => 'text/html; charset=utf-8' },
            text: async () => '<!doctype html><html><body>Website</body></html>'
        });

        await expect(analyzeStudy({
            study: { modality: 'MR', examType: 'MRI knee', bodyPart: 'Knee', imageCount: 1 },
            series: [makeSeries('1', 1)]
        }, {
            provider: 'cloud-custom',
            baseUrl: 'https://agentrouter.org/',
            model: 'custom-model'
        })).rejects.toThrow('Custom endpoint returned HTML');

        expect(global.fetch.mock.calls[0][0]).toBe('https://agentrouter.org/v1/chat/completions');
        expect(global.fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    });

    it('dispatches OpenAI vision with high-detail de-identified previews', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'image/jpeg' },
                arrayBuffer: async () => Uint8Array.from([255, 216, 255, 217]).buffer
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    choices: [{ message: { content: JSON.stringify({
                        resultType: 'AI screening',
                        summary: 'Review completed.',
                        findings: [],
                        impression: 'No automated finding.',
                        limitations: ['Radiologist review required.'],
                        quality: { diagnostic: false, supported: true, modality: 'MR', views: [], imageCountAnalyzed: 1 }
                    }) } }]
                })
            });

        const result = await analyzeStudy({
            study: { modality: 'MR', examType: 'MRI knee', bodyPart: 'Knee', imageCount: 1 },
            series: [makeSeries('1', 1)]
        }, {
            provider: 'cloud-openai',
            apiKey: 'openai-secret',
            model: 'gpt-5.6-terra'
        });

        const request = JSON.parse(global.fetch.mock.calls[1][1].body);
        expect(global.fetch.mock.calls[1][0]).toBe('https://api.openai.com/v1/chat/completions');
        expect(request).toMatchObject({
            model: 'gpt-5.6-terra',
            reasoning_effort: 'none',
            max_completion_tokens: 2048,
            response_format: { type: 'json_object' }
        });
        expect(request.messages[0].content[1]).toMatchObject({
            type: 'image_url',
            image_url: { detail: 'high' }
        });
        expect(result.model).toMatchObject({ provider: 'openai', name: 'gpt-5.6-terra' });
    });

    it('does not retry an OpenAI request when the project quota is exhausted', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'image/jpeg' },
                arrayBuffer: async () => Uint8Array.from([255, 216, 255, 217]).buffer
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: { get: () => null },
                text: async () => JSON.stringify({
                    error: {
                        type: 'insufficient_quota',
                        code: 'insufficient_quota',
                        message: 'You exceeded your current quota.'
                    }
                })
            });

        await expect(analyzeStudy({
            study: { modality: 'MR', examType: 'MRI knee', bodyPart: 'Knee', imageCount: 1 },
            series: [makeSeries('1', 1)]
        }, {
            provider: 'cloud-openai',
            apiKey: 'openai-secret',
            model: 'gpt-5.6-terra'
        })).rejects.toThrow('OpenAI API quota is exhausted');

        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('retries an aborted provider request as a transient timeout', async () => {
        process.env.PACS_AI_PROVIDER_TIMEOUT_MS = '10000';
        const abortError = new Error('This operation was aborted');
        abortError.name = 'AbortError';

        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'image/jpeg' },
                arrayBuffer: async () => Uint8Array.from([255, 216, 255, 217]).buffer
            })
            .mockRejectedValueOnce(abortError)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    choices: [{ message: { content: JSON.stringify({
                        resultType: 'AI screening',
                        summary: 'Completed after retry.',
                        findings: [],
                        impression: 'No automated finding.',
                        limitations: [],
                        quality: { diagnostic: false, supported: true, modality: 'MR', views: [], imageCountAnalyzed: 1 }
                    }) } }]
                })
            });

        const result = await analyzeStudy({
            study: { modality: 'MR', examType: 'MRI knee', bodyPart: 'Knee', imageCount: 1 },
            series: [makeSeries('1', 1)]
        }, {
            provider: 'cloud-openai',
            apiKey: 'openai-secret',
            model: 'gpt-5.6-terra'
        });

        expect(result.summary).toBe('Completed after retry.');
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('records budget-limited image sampling in result provenance', async () => {
        process.env.PACS_AI_MAX_CLOUD_TOTAL_IMAGE_BYTES = '300000';
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'image/jpeg' },
                arrayBuffer: async () => new Uint8Array(160000).fill(1).buffer
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'image/jpeg' },
                arrayBuffer: async () => new Uint8Array(160000).fill(2).buffer
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    choices: [{ message: { content: JSON.stringify({
                        resultType: 'AI screening',
                        summary: 'Review completed.',
                        findings: [],
                        impression: 'No automated finding.',
                        limitations: [],
                        quality: { diagnostic: false, supported: true, modality: 'MR', views: [], imageCountAnalyzed: 1 }
                    }) } }]
                })
            });

        const result = await analyzeStudy({
            study: { modality: 'MR', examType: 'MRI knee', bodyPart: 'Knee', imageCount: 2 },
            series: [makeSeries('1', 2)]
        }, {
            provider: 'cloud-openai',
            apiKey: 'openai-secret',
            model: 'gpt-5.6-terra'
        });

        expect(result.provenance.coverage).toMatchObject({
            strategy: 'series-aware-uniform-sampling-budget-limited',
            analyzedImageCount: 1,
            selectedImageCount: 2,
            omittedByByteBudget: 1,
            inlineByteLimit: 300000
        });
        expect(result.limitations).toEqual(expect.arrayContaining([
            expect.stringContaining('Series-aware sampling analyzed 1 of 2 indexed images')
        ]));
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('repairs malformed OpenRouter JSON without resending DICOM images', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'image/jpeg' },
                arrayBuffer: async () => Uint8Array.from([255, 216, 255, 217]).buffer
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'vision-model',
                    choices: [{
                        finish_reason: 'stop',
                        message: { content: '{"summary":"Abnormal signal, "findings":[]}' }
                    }]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'repair-model',
                    choices: [{
                        finish_reason: 'stop',
                        message: { content: JSON.stringify({
                            resultType: 'AI screening',
                            summary: 'Abnormal signal.',
                            findings: [],
                            impression: 'Review the abnormal signal.',
                            limitations: [],
                            quality: { diagnostic: false, supported: true, modality: 'MR', views: [], imageCountAnalyzed: 1 }
                        }) }
                    }]
                })
            });

        const result = await analyzeStudy({
            study: { modality: 'MR', examType: 'MRI knee', bodyPart: 'Knee', imageCount: 1 },
            series: [makeSeries('1', 1)]
        }, {
            provider: 'cloud-openrouter',
            apiKey: 'openrouter-secret',
            model: 'openrouter/auto'
        });

        const repairRequest = JSON.parse(global.fetch.mock.calls[2][1].body);
        expect(repairRequest.messages).toEqual(expect.arrayContaining([
            expect.objectContaining({ role: 'system', content: expect.stringContaining('syntax repair') })
        ]));
        expect(JSON.stringify(repairRequest.messages)).not.toContain('image_url');
        expect(result).toMatchObject({
            status: 'Completed',
            summary: 'Abnormal signal.',
            model: { provider: 'openrouter', name: 'openrouter/auto' },
            provenance: {
                providerSelectedModel: 'repair-model',
                structuredOutputRecovery: 'json-repair'
            }
        });
        expect(result.limitations).toEqual(expect.arrayContaining([
            expect.stringContaining('structured-output recovery')
        ]));
    });

    it('retries a truncated OpenRouter analysis once with a larger output budget', async () => {
        const validResult = {
            resultType: 'AI screening',
            summary: 'Completed after retry.',
            findings: [],
            impression: 'No automated finding.',
            limitations: [],
            quality: { diagnostic: false, supported: true, modality: 'MR', views: [], imageCountAnalyzed: 1 }
        };
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'image/jpeg' },
                arrayBuffer: async () => Uint8Array.from([255, 216, 255, 217]).buffer
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    choices: [{ finish_reason: 'length', message: { content: '{"summary":"Partial' } }]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(validResult) } }]
                })
            });

        const result = await analyzeStudy({
            study: { modality: 'MR', examType: 'MRI knee', bodyPart: 'Knee', imageCount: 1 },
            series: [makeSeries('1', 1)]
        }, {
            provider: 'cloud-openrouter',
            apiKey: 'openrouter-secret'
        });

        const retryRequest = JSON.parse(global.fetch.mock.calls[2][1].body);
        expect(retryRequest.max_tokens).toBe(4096);
        expect(JSON.stringify(retryRequest.messages)).toContain('image_url');
        expect(result.summary).toBe('Completed after retry.');
        expect(result.provenance.structuredOutputRecovery).toBe('larger-output-retry');
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });
});
