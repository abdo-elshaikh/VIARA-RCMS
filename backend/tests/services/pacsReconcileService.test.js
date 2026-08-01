const { reconcileInstance } = require('../../src/services/pacsReconcileService');

// Silence the service logger during tests.
jest.mock('../../src/config/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

/**
 * Build a mock pool whose client.query routes by SQL substring. `handlers` is a
 * list of [matcher, result] where matcher is a string the SQL must include.
 * Every query is recorded on `calls` for assertions.
 */
const makeMockPool = (handlers) => {
    const calls = [];
    const client = {
        query: jest.fn(async (sql, params) => {
            calls.push({ sql, params });
            for (const [needle, result] of handlers) {
                if (sql.includes(needle)) {
                    return typeof result === 'function' ? result(sql, params) : result;
                }
            }
            return { rows: [], rowCount: 0 };
        }),
        release: jest.fn()
    };
    const pool = { connect: jest.fn(async () => client) };
    return { pool, client, calls };
};

const basePayload = {
    OrthancInstanceId: 'orth-1',
    PatientID: 'MRN100',
    PatientName: 'DOE^JOHN',
    AccessionNumber: 'ORD-0001',
    StudyInstanceUID: '1.2.3.4',
    SeriesInstanceUID: '1.2.3.4.1',
    SOPInstanceUID: '1.2.3.4.1.1',
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
    Modality: 'CT',
    SeriesNumber: 1,
    InstanceNumber: 1
};

describe('pacsReconcileService.reconcileInstance', () => {
    it('reconciles a stored instance to a matching examination', async () => {
        const { pool, calls } = makeMockPool([
            ['WHERE e.order_number', { rows: [{ exam_id: 'exam-1', patient_id: 'p1', study_instance_uid: '1.2.3.4', status: 'Scheduled', mrn: 'MRN100' }] }],
            ['COUNT(*)::int AS n', { rows: [{ n: 3 }] }],
            // series/instance upserts, examinations UPDATE, audit, BEGIN/COMMIT → default {rows:[]}
        ]);

        const result = await reconcileInstance(pool, basePayload, { remoteIp: '10.0.0.5' });

        expect(result).toEqual({ status: 'reconciled', exam_id: 'exam-1', image_count: 3 });

        const sqls = calls.map((c) => c.sql).join('\n');
        expect(sqls).toContain('BEGIN');
        expect(sqls).toContain('INSERT INTO pacs_series');
        expect(sqls).toContain('INSERT INTO pacs_instances');
        expect(sqls).toContain('UPDATE examinations');
        expect(sqls).toContain('INSERT INTO pacs_audit');
        expect(sqls).toContain('INSERT INTO system_logs');
        expect(sqls).toContain('COMMIT');
        expect(sqls).not.toContain('ROLLBACK');
    });

    it('quarantines a study when the accession matches no examination', async () => {
        const { pool, calls } = makeMockPool([
            ['WHERE e.order_number', { rows: [] }],
            ['WHERE e.study_instance_uid', { rows: [] }]
        ]);

        const result = await reconcileInstance(pool, basePayload);

        expect(result.status).toBe('quarantined');
        expect(result.reason).toBe('ACCESSION_NUMBER_NOT_FOUND');

        const sqls = calls.map((c) => c.sql).join('\n');
        expect(sqls).toContain('INSERT INTO pacs_quarantine_studies');
        expect(sqls).toContain('COMMIT');
        // RIS tables must not be touched on a no-match.
        expect(sqls).not.toContain('UPDATE examinations');
        expect(sqls).not.toContain('INSERT INTO pacs_series');
    });

    it('ignores an instance with neither accession nor study UID', async () => {
        const { pool, calls } = makeMockPool([]);

        const result = await reconcileInstance(pool, { OrthancInstanceId: 'x', Modality: 'CT' });

        expect(result.status).toBe('ignored');
        const sqls = calls.map((c) => c.sql).join('\n');
        expect(sqls).toContain('BEGIN');
        expect(sqls).toContain('COMMIT');
        expect(sqls).not.toContain('INSERT INTO pacs_quarantine_studies');
        expect(sqls).not.toContain('UPDATE examinations');
    });

    it('is idempotent: a replayed instance re-upserts and recomputes count', async () => {
        const { pool, calls } = makeMockPool([
            ['WHERE e.order_number', { rows: [{ exam_id: 'exam-1', patient_id: 'p1', study_instance_uid: '1.2.3.4', status: 'Scanning', mrn: 'MRN100' }] }],
            ['COUNT(*)::int AS n', { rows: [{ n: 3 }] }]
        ]);

        const result = await reconcileInstance(pool, basePayload);

        // Same count (no double-count); status stays reconciled.
        expect(result).toEqual({ status: 'reconciled', exam_id: 'exam-1', image_count: 3 });
        // Upserts use ON CONFLICT so replays are safe.
        const seriesInsert = calls.find((c) => c.sql.includes('INSERT INTO pacs_series'));
        const instanceInsert = calls.find((c) => c.sql.includes('INSERT INTO pacs_instances'));
        expect(seriesInsert.sql).toContain('ON CONFLICT');
        expect(instanceInsert.sql).toContain('ON CONFLICT');
    });

    it('rolls back and rethrows when a query fails mid-transaction', async () => {
        const { pool, client } = makeMockPool([
            ['WHERE e.order_number', () => { throw new Error('db down'); }]
        ]);

        await expect(reconcileInstance(pool, basePayload)).rejects.toThrow('db down');

        const sqls = client.query.mock.calls.map((c) => c[0]).join('\n');
        expect(sqls).toContain('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });

    it('quarantines when accession matches but PatientID belongs to another patient', async () => {
        const { pool, calls } = makeMockPool([
            ['WHERE e.order_number', { rows: [{ exam_id: 'exam-1', patient_id: 'p1', study_instance_uid: '1.2.3.4', status: 'Scheduled', mrn: 'MRN999' }] }]
        ]);

        const result = await reconcileInstance(pool, basePayload);

        expect(result).toEqual({ status: 'quarantined', reason: 'PATIENT_ID_MISMATCH' });
        const sqls = calls.map((c) => c.sql).join('\n');
        expect(sqls).toContain('INSERT INTO pacs_quarantine_studies');
        expect(sqls).not.toContain('UPDATE examinations');
        expect(sqls).not.toContain('INSERT INTO pacs_series');
    });

    it('quarantines when an accession matches an exam already bound to a different study', async () => {
        const { pool, calls } = makeMockPool([
            ['WHERE e.order_number', { rows: [{ exam_id: 'exam-1', patient_id: 'p1', study_instance_uid: '9.9.9', status: 'Scheduled', mrn: 'MRN100' }] }]
        ]);

        const result = await reconcileInstance(pool, basePayload);

        expect(result).toEqual({ status: 'quarantined', reason: 'STUDY_INSTANCE_UID_MISMATCH' });
        const sqls = calls.map((c) => c.sql).join('\n');
        expect(sqls).toContain('INSERT INTO pacs_quarantine_studies');
        expect(sqls).not.toContain('UPDATE examinations');
        expect(sqls).not.toContain('INSERT INTO pacs_series');
    });
});
