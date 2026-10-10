const { findMatchingExam } = require('../src/services/pacsReconcileService');

// Routing helpers: select which query a mocked client is answering.
const isAccession = (sql) => sql.includes('order_number = $1');
const isNormalized = (sql) => sql.includes('REGEXP_REPLACE');
const isStudy = (sql) => sql.includes('study_instance_uid = $1');
const isMrnFallback = (sql) => sql.includes('CASE UPPER(m.type)');

const clientReturning = (route) => ({
    query: jest.fn(async (sql) => ({ rows: route(sql) || [] }))
});

describe('PACS findMatchingExam ambiguity safety (F05)', () => {
    test('two accession matches are ambiguous, never auto-linked', async () => {
        const client = clientReturning((sql) => (isAccession(sql) ? [{ exam_id: 'a' }, { exam_id: 'b' }] : null));
        await expect(findMatchingExam(client, { accessionNumber: 'ACC1' })).resolves.toEqual({ ambiguous: true });
    });

    test('a single accession match links by accession', async () => {
        const client = clientReturning((sql) => (isAccession(sql) ? [{ exam_id: 'a', patient_id: 'p', mrn: 'M1' }] : null));
        await expect(findMatchingExam(client, { accessionNumber: 'ACC1' }))
            .resolves.toMatchObject({ exam_id: 'a', match_type: 'accession' });
    });

    test('normalized-accession collisions are ambiguous', async () => {
        const client = clientReturning((sql) => {
            if (isAccession(sql)) return [];
            if (isNormalized(sql)) return [{ exam_id: 'a' }, { exam_id: 'b' }];
            return null;
        });
        await expect(findMatchingExam(client, { accessionNumber: 'ACC-1' })).resolves.toEqual({ ambiguous: true });
    });

    test('two study-UID matches are ambiguous', async () => {
        const client = clientReturning((sql) => (isStudy(sql) ? [{ exam_id: 'a' }, { exam_id: 'b' }] : null));
        await expect(findMatchingExam(client, { studyInstanceUid: '1.2.3' })).resolves.toEqual({ ambiguous: true });
    });

    test('MRN fallback links only with an unambiguous single match and a modality', async () => {
        const client = clientReturning((sql) => (isMrnFallback(sql) ? [{ exam_id: 'm', mrn: 'M1' }] : null));
        await expect(findMatchingExam(client, { patientId: 'M1', modality: 'CT' }))
            .resolves.toMatchObject({ exam_id: 'm', match_type: 'patient_mrn' });
    });

    test('two MRN matches are ambiguous', async () => {
        const client = clientReturning((sql) => (isMrnFallback(sql) ? [{ exam_id: 'a' }, { exam_id: 'b' }] : null));
        await expect(findMatchingExam(client, { patientId: 'M1', modality: 'CT' })).resolves.toEqual({ ambiguous: true });
    });

    test('MRN fallback is not attempted without a modality', async () => {
        const client = clientReturning(() => [{ exam_id: 'a' }]);
        await expect(findMatchingExam(client, { patientId: 'M1' })).resolves.toBeNull();
        expect(client.query.mock.calls.some(([sql]) => isMrnFallback(sql))).toBe(false);
    });

    test('no candidate returns null', async () => {
        const client = clientReturning(() => null);
        await expect(findMatchingExam(client, { patientId: 'M1', modality: 'CT' })).resolves.toBeNull();
    });
});