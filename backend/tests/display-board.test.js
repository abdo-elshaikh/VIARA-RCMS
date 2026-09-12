const { getDisplayBoard } = require('../src/controllers/displayBoardController');

jest.mock('../src/utils/crypto', () => ({
    decrypt: (value) => (value ? `Decrypted:${value}` : null)
}));

const modalityId = '00000000-0000-4000-8000-000000000501';
const roomId = '00000000-0000-4000-8000-000000000502';

const buildDb = ({ queueRows = [], settingsRows = [], announcementRows = [], summaryRow } = {}) => ({
    query: jest.fn(async (sql, values) => {
        const text = String(sql);
        if (text.includes('FROM modalities m')) {
            return {
                rows: [{
                    modality_id: modalityId,
                    machine_name: 'CT Scanner 1',
                    machine_type: 'CT',
                    machine_status: 'Active',
                    room_id: roomId,
                    room_name: 'جناح الأشعة المقطعية',
                    room_number: 'CT-101',
                    room_status: 'Active'
                }]
            };
        }
        if (text.includes('COUNT(*) FILTER')) {
            return {
                rows: [summaryRow || { waiting: 1, in_exam: 1, completed_today: 3, delivered_today: 2, average_waiting_minutes: 18 }]
            };
        }
        if (text.includes('first_name_enc')) {
            return { rows: queueRows };
        }
        if (text.includes('FROM system_settings')) {
            return { rows: settingsRows.map(([setting_key, setting_value]) => ({ setting_key, setting_value })) };
        }
        if (text.includes('FROM display_announcements')) {
            return { rows: announcementRows };
        }
        throw new Error(`Unexpected SQL: ${text}`);
    })
});

const baseQueueRows = () => ([
    {
        modality_id: modalityId,
        order_number: 'ORD-2026-0001',
        priority: 'Emergency',
        queue_stage: 'In Exam',
        is_on_hold: false,
        arrived_at: new Date('2026-09-03T09:00:00Z'),
        exam_started_at: new Date('2026-09-03T09:10:00Z'),
        report_finalized_at: null,
        delivered_at: null,
        created_at: new Date('2026-09-03T08:50:00Z'),
        first_name_enc: 'Ahmed',
        last_name_enc: 'Mahmoud'
    },
    {
        modality_id: modalityId,
        order_number: 'ORD-2026-0002',
        priority: 'Routine',
        queue_stage: 'Ready for Exam',
        is_on_hold: false,
        arrived_at: new Date('2026-09-03T09:20:00Z'),
        exam_started_at: null,
        report_finalized_at: null,
        delivered_at: null,
        created_at: new Date('2026-09-03T09:15:00Z'),
        first_name_enc: 'Sara',
        last_name_enc: 'Ibrahim'
    }
]);

const baseSettings = () => ([
    ['center.name', 'VIARA Imaging Center'],
    ['center.name_ar', 'مركز فيارا للأشعة'],
    ['center.phone', '+20 100 000 0000'],
    ['center.hotline', '16090'],
    ['center.email', 'care@viara.example'],
    ['center.address', '12 Nile Street, Cairo'],
]);

describe('public display board controller', () => {
    test('exposes decrypted patient names only when explicitly enabled', async () => {
        const db = buildDb({
            queueRows: baseQueueRows(),
            settingsRows: [...baseSettings(), ['display.patient_display_mode', 'name_and_order']]
        });
        const res = { set: jest.fn(), json: jest.fn() };

        await getDisplayBoard(db)({}, res, jest.fn());

        const payload = res.json.mock.calls[0][0];

        expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store, max-age=0');
        expect(payload.config).toEqual({
            patientDisplayMode: 'name_and_order',
            showTicker: true,
            boardTitle: null
        });
        expect(payload.center).toMatchObject({
            name: 'VIARA Imaging Center',
            phone: '+20 100 000 0000',
            hotline: '16090',
            email: 'care@viara.example',
            address: '12 Nile Street, Cairo'
        });
        expect(payload.summary).toMatchObject({
            waiting: 1,
            inExam: 1,
            completedToday: 3,
            deliveredToday: 2,
            averageWaitingMinutes: 18
        });

        const machine = payload.rooms[0].machines[0];
        expect(machine.current.patient_name).toBe('Decrypted:Ahmed Decrypted:Mahmoud');
        expect(machine.current.order_number).toBe('ORD-2026-0001');
        expect(machine.current.phase).toBe('imaging');
        expect(machine.current.progress).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'imaging', state: 'current' })
        ]));
        expect(machine.queue.next).toHaveLength(1);
        expect(machine.queue.next[0]).toMatchObject({
            patient_name: 'Decrypted:Sara Decrypted:Ibrahim',
            order_number: 'ORD-2026-0002'
        });
    });

    test('strips patient names by default when no privacy mode is configured', async () => {
        const db = buildDb({
            queueRows: baseQueueRows(),
            settingsRows: baseSettings()
        });
        const res = { set: jest.fn(), json: jest.fn() };

        await getDisplayBoard(db)({}, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload.config.patientDisplayMode).toBe('order_only');

        const machine = payload.rooms[0].machines[0];
        expect(machine.current.order_number).toBe('ORD-2026-0001');
        expect(machine.current.patient_name).toBeNull();
        expect(machine.queue.next[0].patient_name).toBeNull();

        const serialized = JSON.stringify(payload);
        expect(serialized).not.toMatch(/patient_name":"[A-Z]/i);
        expect(serialized).not.toMatch(/Decrypted:/);
    });

    test('returns active announcements and custom board config', async () => {
        const db = buildDb({
            queueRows: baseQueueRows(),
            settingsRows: [
                ...baseSettings(),
                ['display.patient_display_mode', 'name_and_order'],
                ['display.show_ticker', 'false'],
                ['display.board_title', 'جناح الأشعة التخصصي']
            ],
            announcementRows: [
                { announcement_id: 'ann-1', title: 'أوقات الذروة', message: 'قد يزيد الانتظار بين 12 و 2', tone: 'warning', display_order: 1 }
            ]
        });
        const res = { set: jest.fn(), json: jest.fn() };

        await getDisplayBoard(db)({}, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload.config).toEqual({
            patientDisplayMode: 'name_and_order',
            showTicker: false,
            boardTitle: 'جناح الأشعة التخصصي'
        });
        expect(payload.announcements).toEqual([
            { id: 'ann-1', title: 'أوقات الذروة', message: 'قد يزيد الانتظار بين 12 و 2', tone: 'warning' }
        ]);
    });

    test('never exposes MRNs or encrypted identity fields', async () => {
        const db = buildDb({ queueRows: baseQueueRows(), settingsRows: baseSettings() });
        const res = { set: jest.fn(), json: jest.fn() };

        await getDisplayBoard(db)({}, res, jest.fn());

        const serialized = JSON.stringify(res.json.mock.calls[0][0]);
        expect(serialized).not.toMatch(/"mrn"|first_name_enc|last_name_enc|clinical_indication/i);
    });

    test('keeps machines without an active case renderable', async () => {
        const db = buildDb({
            queueRows: [],
            settingsRows: baseSettings(),
            summaryRow: { waiting: 0, in_exam: 0, completed_today: 0, delivered_today: 0, average_waiting_minutes: 0 }
        });
        db.query.mockImplementation(async (sql) => {
            const text = String(sql);
            if (text.includes('FROM modalities m')) {
                return {
                    rows: [{
                        modality_id: modalityId,
                        machine_name: 'MRI 1',
                        machine_type: 'MRI',
                        machine_status: 'Under Maintenance',
                        room_id: null,
                        room_name: 'جناح غير محدد',
                        room_number: 'MRI-9',
                        room_status: 'Active'
                    }]
                };
            }
            if (text.includes('COUNT(*) FILTER')) {
                return { rows: [{ waiting: 0, in_exam: 0, completed_today: 0, delivered_today: 0, average_waiting_minutes: 0 }] };
            }
            if (text.includes('first_name_enc')) return { rows: [] };
            if (text.includes('FROM system_settings')) return { rows: [] };
            if (text.includes('FROM display_announcements')) return { rows: [] };
            throw new Error(`Unexpected SQL: ${text}`);
        });

        const res = { set: jest.fn(), json: jest.fn() };
        await getDisplayBoard(db)({}, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        const machine = payload.rooms[0].machines[0];
        expect(machine.current).toBeNull();
        expect(machine.machine_status).toBe('Under Maintenance');
        expect(machine.queue.count).toBe(0);
    });
});
