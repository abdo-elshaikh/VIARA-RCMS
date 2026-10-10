const {
    buildStructuredImageAnalysisDraft,
    buildPreliminaryDraftPayload,
    isImageAnalysisUsable,
    parseJsonObject
} = require('../src/services/aiReportService');

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
        evidence: [{ seriesInstanceUid: 'series-1', sopInstanceUid: 'instance-1' }],
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

    test('does not accept a metadata-only result as image-backed analysis', () => {
            const metadataOnly = {
                summary: 'Invented finding from metadata.',
                findings: [{ label: 'Effusion', present: true }],
                quality: { supported: true, imageCountAnalyzed: 1 },
                evidence: [{ seriesInstanceUid: 'series-1', sopInstanceUid: 'instance-1' }],
                provenance: { mode: 'metadata-only-analysis' }
            };

            expect(isImageAnalysisUsable(metadataOnly)).toBe(false);
            expect(buildStructuredImageAnalysisDraft({
                imageAnalysis: { payload: metadataOnly }
            })).toBeNull();
        });

    test('minimizes report-provider payload and omits ineligible image analysis', () => {
            const payload = buildPreliminaryDraftPayload({
                exam: {
                    order_number: 'ORDER-SENSITIVE',
                    patient_name: 'SYNTHETIC-PATIENT',
                    date_of_birth: '1900-01-01',
                    clinical_indication: 'Cough',
                    provisional_diagnosis: 'Pneumonia',
                    is_follow_up: true,
                    prior_exam_id: 'PRIOR-ORDER-SENSITIVE',
                    prior_report_content: 'SENSITIVE PRIOR REPORT'
                },
                imaging: { instance_count: 2, series_count: 1 },
                imageAnalysis: {
                    payload: {
                        findings: [{ label: 'Invented', present: true }],
                        quality: { supported: true, imageCountAnalyzed: 1 },
                        provenance: { mode: 'metadata-only-analysis' }
                    }
                }
            });

            const serialized = JSON.stringify(payload);
            expect(serialized).not.toMatch(/ORDER-SENSITIVE|SYNTHETIC-PATIENT|1900-01-01|SENSITIVE PRIOR REPORT|Invented/);
            expect(payload.imageAnalysis).toBeNull();
            expect(payload.exam).toEqual(expect.objectContaining({
                clinicalIndication: 'Cough',
                provisionalDiagnosis: 'Pneumonia'
            }));
            expect(payload.priorStudy).toEqual(expect.objectContaining({ comparisonAvailable: true }));
    });

    test('does not describe a below-threshold result as normal', () => {
        const draft = buildStructuredImageAnalysisDraft({
            imageAnalysis: {
                summary: 'No score exceeded threshold.',
                payload: {
                    summary: 'No score exceeded threshold.',
                    findings: [],
                    quality: { supported: true, imageCountAnalyzed: 1 },
                    evidence: [{ seriesInstanceUid: 'series-1', sopInstanceUid: 'instance-1' }],
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
                    quality: { supported: true, imageCountAnalyzed: 1 },
                    evidence: [{ seriesInstanceUid: 'series-1', sopInstanceUid: 'instance-1' }],
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
