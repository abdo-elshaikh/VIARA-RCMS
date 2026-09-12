const { getQueueDisplay, DISPLAY_STAGES } = require('../src/controllers/queueDisplayController');

jest.mock('../src/utils/crypto', () => ({
    decrypt: (value) => (value ? `Decrypted:${value}` : null)
}));

const buildQueueRow = () => ({
    exam_id: 'exam-1',
    order_number: 'ORD-2026-0001',
    queue_number: 4,
    queue_stage: 'Ready for Exam',
    priority: 'Routine',
    modality_id: 'mod-1',
    modality_name: 'CT Scanner 1',
    modality_type: 'CT',
    room_number: 'CT-101',
    machine_status: 'Active',
    status_changed_at: new Date('2026-09-03T09:20:00Z'),
    first_name_enc: 'Ahmed',
    last_name_enc: 'Mahmoud'
});

const buildDb = (rows, displayMode) => ({
    query: jest.fn(async (sql, values) => {
        const text = String(sql);
        if (text.includes('display.patient_display_mode')) {
            return { rows: displayMode ? [{ setting_value: displayMode }] : [] };
        }
        // Mirror the SQL `CASE WHEN $2::boolean THEN order_number ELSE NULL END`
        const showOrderNumbers = values ? values[1] !== false : true;
        return { rows: showOrderNumbers ? rows : rows.map(({ order_number, ...rest }) => ({ ...rest, order_number: null })) };
    })
});

const callEndpoint = async (db, query = {}) => {
    const res = { set: jest.fn(), json: jest.fn() };
    await getQueueDisplay(db)({ query }, res, jest.fn());
    return { res, payload: res.json.mock.calls[0][0] };
};

describe('public queue display controller', () => {
    test('exposes numbered queue items with patient names by default', async () => {
        const db = buildDb([buildQueueRow()]);
        const { res, payload } = await callEndpoint(db);

        expect(res.set).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('max-age=10'));
        expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0]).toMatchObject({
            order_number: 'ORD-2026-0001',
            patient_name: 'Decrypted:Ahmed Decrypted:Mahmoud',
            queue_number: 4,
            queue_stage: 'Ready for Exam',
            room_number: 'CT-101',
            modality_name: 'CT Scanner 1'
        });

        const serialized = JSON.stringify(payload);
        expect(serialized).not.toMatch(/"mrn"|first_name_enc|last_name_enc/i);
    });

    test('strips patient names in order_only privacy mode', async () => {
        const db = buildDb([buildQueueRow()], 'order_only');
        const { payload } = await callEndpoint(db);

        expect(payload.items[0].order_number).toBe('ORD-2026-0001');
        expect(payload.items[0].patient_name).toBeUndefined();
        expect(JSON.stringify(payload)).not.toMatch(/Decrypted:/);
    });

    test('hides order numbers in name-only mode', async () => {
        const db = buildDb([buildQueueRow()], 'name');
        const { payload } = await callEndpoint(db);

        expect(payload.items[0].order_number).toBeNull();
        expect(payload.items[0].patient_name).toBe('Decrypted:Ahmed Decrypted:Mahmoud');
    });

    test('rejects malformed dates before touching the case queries', async () => {
        const db = buildDb([]);
        const next = jest.fn();
        const res = { set: jest.fn(), json: jest.fn() };

        await getQueueDisplay(db)({ query: { date: "'; DROP TABLE examinations; --" } }, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        expect(db.query).not.toHaveBeenCalled();
    });

    test('tracks only the operational waiting-room stages', () => {
        expect(DISPLAY_STAGES).toEqual([
            'Arrived',
            'Payment Pending',
            'Prep Pending',
            'Ready for Exam',
            'In Exam'
        ]);
    });
});
