const {
    normalizeFailureMessage,
    validateWorkerResult
} = require('../src/services/pacsAiAnalysisService');

const validResult = () => ({
    success: true,
    status: 'Completed',
    resultType: 'preliminary_image_review',
    summary: 'Possible small right pleural effusion.',
    findings: [{
        label: 'pleural_effusion',
        present: true,
        confidence: 0.84,
        location: 'right',
        description: 'Small right pleural effusion.',
        evidence: [0]
    }],
    impression: 'Possible small right pleural effusion.',
    limitations: ['Independent radiologist review is required.'],
    quality: {
        diagnostic: true,
        supported: true,
        modality: 'DX',
        views: ['PA'],
        imageCountAnalyzed: 1
    },
    model: {
        provider: 'google-health',
        name: 'google/medgemma-1.5-4b-it',
        revision: 'abc123',
        backend: 'medgemma'
    },
    evidence: [{
        seriesInstanceUid: '1.2.3.4',
        sopInstanceUid: '1.2.3.4.5',
        viewPosition: 'PA'
    }],
    provenance: { promptVersion: 'cxr-preliminary-v1' }
});

describe('PACS AI worker result contract', () => {
    test('accepts a complete structured worker result', () => {
        const parsed = validateWorkerResult(validResult());
        expect(parsed.findings[0].confidence).toBe(0.84);
        expect(parsed.model.revision).toBe('abc123');
    });

    test('accepts an explicit unsupported-study result without findings', () => {
        const value = validResult();
        value.resultType = 'unsupported_study';
        value.summary = 'MR knee is unsupported.';
        value.findings = [];
        value.impression = '';
        value.quality = {
            diagnostic: false,
            supported: false,
            modality: 'MR',
            views: [],
            imageCountAnalyzed: 0
        };
        expect(validateWorkerResult(value).quality.supported).toBe(false);
    });

    test('rejects out-of-range confidence and missing provenance', () => {
        const invalidConfidence = validResult();
        invalidConfidence.findings[0].confidence = 1.4;
        expect(() => validateWorkerResult(invalidConfidence)).toThrow();

        const missingProvenance = validResult();
        delete missingProvenance.provenance;
        expect(validateWorkerResult(missingProvenance).provenance).toEqual({});
    });

    test('normalizes raw abort errors into actionable timeout messages', () => {
        const abortError = new Error('This operation was aborted');
        abortError.name = 'AbortError';

        expect(normalizeFailureMessage(abortError)).toContain('configured timeout');

        const timeoutError = new Error('Request timed out after 10000ms: https://example.test');
        timeoutError.name = 'TimeoutError';
        timeoutError.code = 'REQUEST_TIMEOUT';
        expect(normalizeFailureMessage(timeoutError)).toContain('Request timed out');
    });
});
