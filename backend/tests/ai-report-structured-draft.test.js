const { buildStructuredImageAnalysisDraft, parseJsonObject } = require('../src/services/aiReportService');

const imageAnalysis = {
    summary: 'CXR screening signals above threshold: Effusion (0.82).',
    payload: {
        summary: 'CXR screening signals above threshold: Effusion (0.82).',
        impression: 'CXR screening signals above threshold: Effusion (0.82).',
        findings: [{
            label: 'Effusion',
            present: true,
            confidence: 0.82,
            location: null,
            description: 'TorchXRayVision screening score 0.82 for Effusion.'
        }],
        limitations: ['Model scores are uncalibrated screening signals.'],
        quality: { supported: true, imageCountAnalyzed: 1 },
        model: { provider: 'mlmed', name: 'densenet121-res224-all', revision: 'validated-v1' }
    }
};

describe('structured PACS AI preliminary draft', () => {
    test('builds a restrained report without a language model', () => {
        const draft = buildStructuredImageAnalysisDraft({
            exam: { clinical_indication: 'Cough' },
            imaging: { instance_count: 2 },
            imageAnalysis,
            language: 'en'
        });

        expect(draft.sections.clinicalHistory).toBe('Cough');
        expect(draft.sections.findings).toBe('- Effusion.');
        expect(draft.sections.findings).not.toContain('0.82');
        expect(draft.sections.technique).toBe('');
        expect(draft.sections.impression).toBe('Reported finding: Effusion. Correlate with full image review.');
        expect(draft.limitations).toContain(
            'Generated deterministically from structured PACS image-analysis output; no language model was used.'
        );
        expect(draft.provenance).toEqual(expect.objectContaining({
            mode: 'structured-pacs-ai',
            sourceMode: 'pacs-image-analysis',
            provider: 'mlmed',
            model: 'densenet121-res224-all'
        }));
    });

    test('does not create a draft for an unsupported study', () => {
        const draft = buildStructuredImageAnalysisDraft({
            imageAnalysis: {
                payload: { findings: [], quality: { supported: false } }
            }
        });
        expect(draft).toBeNull();
    });

    test('does not describe a below-threshold result as normal', () => {
        const draft = buildStructuredImageAnalysisDraft({
            imageAnalysis: {
                summary: 'No score exceeded threshold.',
                payload: {
                    summary: 'No score exceeded threshold.',
                    findings: [],
                    quality: { supported: true, imageCountAnalyzed: 1 },
                    model: { provider: 'mlmed', name: 'densenet121-res224-all' }
                }
            }
        });
        expect(draft.sections.findings).toContain('pending radiologist review');
        expect(draft.sections.findings).not.toBe('Normal study.');
    });

    test('does not copy Arabic source text into an English report fallback', () => {
        const draft = buildStructuredImageAnalysisDraft({
            exam: { clinical_indication: 'ألم في الركبة' },
            imageAnalysis: {
                payload: {
                    summary: 'نتيجة أولية',
                    findings: [{ label: 'ارتشاح', present: true, description: 'اشتباه ارتشاح' }],
                    quality: { supported: true },
                    model: { provider: 'test', name: 'test-model' }
                }
            }
        });

        expect(draft.sections.clinicalHistory).toBe('');
        expect(draft.sections.findings).toBe('- Unspecified finding.');
        expect(Object.values(draft.sections).join(' ')).not.toMatch(/[\u0600-\u06ff]/u);
    });
});

describe('AI report provider JSON parsing', () => {
    test('accepts a JSON object wrapped in a markdown fence', () => {
        const parsed = parseJsonObject('```json\n{"findings":"No focal opacity.","impression":"No acute finding."}\n```');

        expect(parsed).toEqual(expect.objectContaining({
            findings: 'No focal opacity.',
            impression: 'No acute finding.'
        }));
    });

    test('extracts the first balanced object from provider commentary', () => {
        const parsed = parseJsonObject('Draft follows: {"sections":{"findings":"Finding with {context}.","impression":"Review."}} End.');

        expect(parsed.sections.findings).toBe('Finding with {context}.');
    });

    test('returns null for truncated JSON instead of throwing', () => {
        expect(parseJsonObject('{"findings":"Incomplete"')).toBeNull();
    });
});
