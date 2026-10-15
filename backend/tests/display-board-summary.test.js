const { getDisplayBoard } = require('../src/controllers/displayBoardController');

jest.mock('../src/utils/crypto', () => ({
    decrypt: (value) => (value ? `Decrypted:${value}` : null)
}));

const modalityId = '00000000-0000-4000-8000-00000000bb01';
const roomId = '00000000-0000-4000-8000-00000000bb02';

const buildDb = ({ rows, summaryRow }) => ({
    query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('FROM modalities m')) {
            return { rows: [{
                modality_id: modalityId,
                machine_name: 'CT 1',
                machine_type: 'CT',
                machine_status: 'Active',
                room_id: roomId,
                room_name: 'جناح 1',
                room_number: 'CT-1',
                room_status: 'Active'
            }] };
        }
        if (text.includes('COUNT(*) FILTER')) {
            return { rows: [summaryRow] };
        }
        if (text.includes('first_name_enc')) {
            return { rows };
        }
        if (text.includes('FROM system_settings')) {
            return { rows: [] };
        }
        if (text.includes('FROM display_announcements')) {
            return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${text}`);
    })
});

const callEndpoint = async (db) => {
    const res = { set: jest.fn(), json: jest.fn() };
    await getDisplayBoard(db)({}, res, jest.fn());
    return res.json.mock.calls[0][0];
};

describe('public display board summary scope', () => {
    test('exposes summary counts that match the list scope for the same day', async () => {
        const db = buildDb({
            rows: [
                { modality_id: modalityId, order_number: 'A', priority: 'Routine', queue_stage: 'Arrived', is_on_hold: false, arrived_at: new Date(), exam_started_at: null, report_finalized_at: null, delivered_at: null, created_at: new Date(), first_name_enc: 'x', last_name_enc: 'y' },
                { modality_id: modalityId, order_number: 'B', priority: 'Urgent', queue_stage: 'In Exam', is_on_hold: false, arrived_at: new Date(), exam_started_at: new Date(), report_finalized_at: null, delivered_at: null, created_at: new Date(), first_name_enc: 'a', last_name_enc: 'b' }
            ],
            summaryRow: { waiting: 1, in_exam: 1, completed_today: 4, delivered_today: 2, average_waiting_minutes: 9 }
        });
        const payload = await callEndpoint(db);
        expect(payload.summary).toMatchObject({ waiting: 1, inExam: 1, completedToday: 4, deliveredToday: 2 });
        expect(payload.rooms[0].machines[0].queue.count).toBe(1);
        expect(payload.rooms[0].machines[0].current).not.toBeNull();
    });

    test('returns zero counts when the queue has no current-day rows', async () => {
        const db = buildDb({
            rows: [],
            summaryRow: { waiting: 0, in_exam: 0, completed_today: 0, delivered_today: 0, average_waiting_minutes: 0 }
        });
        const payload = await callEndpoint(db);
        expect(payload.summary).toMatchObject({ waiting: 0, inExam: 0 });
        expect(payload.rooms[0].machines[0].current).toBeNull();
    });
});
