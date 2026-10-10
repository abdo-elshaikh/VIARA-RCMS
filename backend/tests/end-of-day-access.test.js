const mockGetPendingExams = jest.fn();
const mockGetDaySummary = jest.fn();
const mockFetchReviewLog = jest.fn();

jest.mock('../src/services/endOfDayService', () => ({
    getPendingExams: (...args) => mockGetPendingExams(...args),
    getDaySummary: (...args) => mockGetDaySummary(...args),
    resolveExam: jest.fn(),
    bulkResolveExams: jest.fn(),
    onShiftClose: jest.fn(),
    getReviewLog: (...args) => mockFetchReviewLog(...args),
}));

jest.mock('../src/utils/crypto', () => ({
    decrypt: (value) => value ? `decrypted:${value}` : '',
}));

const endOfDayController = require('../src/controllers/endOfDayController');
const actualEndOfDayService = jest.requireActual('../src/services/endOfDayService');

const createResponse = () => ({
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
});

describe('end-of-day reception access boundaries', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('pending response derives receptionist scope and removes encrypted patient fields', async () => {
        mockGetPendingExams.mockResolvedValue({
            total: 1,
            rows: [{
                appointment_id: 'appointment-1',
                first_name_enc: 'first-ciphertext',
                last_name_enc: 'last-ciphertext',
                receptionist_name: 'Sara',
            }],
        });
        const req = {
            query: { date: '2026-09-22', receptionistId: 'attacker-controlled-id' },
            user: { user_id: 'receptionist-1', role: 'Receptionist' },
        };
        const res = createResponse();
        const next = jest.fn();

        await endOfDayController.getPending({})(req, res, next);

        expect(mockGetPendingExams).toHaveBeenCalledWith({}, expect.objectContaining({
            receptionistId: 'receptionist-1',
            actorRole: 'Receptionist',
        }));
        const payload = res.json.mock.calls[0][0];
        expect(payload.data[0]).toMatchObject({
            appointment_id: 'appointment-1',
            patient_name: 'decrypted:first-ciphertext decrypted:last-ciphertext',
            receptionist_name: 'Sara',
        });
        expect(payload.data[0]).not.toHaveProperty('first_name_enc');
        expect(payload.data[0]).not.toHaveProperty('last_name_enc');
        expect(next).not.toHaveBeenCalled();
    });

    test('summary is scoped to the authenticated receptionist', async () => {
        mockGetDaySummary.mockResolvedValue({ total: 3, completed: 1 });
        const req = {
            query: { date: '2026-09-22' },
            user: { user_id: 'receptionist-1', role: 'Receptionist' },
        };
        const res = createResponse();

        await endOfDayController.getSummary({})(req, res, jest.fn());

        expect(mockGetDaySummary).toHaveBeenCalledWith({}, '2026-09-22', {
            sessionId: null,
            receptionistId: 'receptionist-1',
            actorRole: 'Receptionist',
        });
    });

    test('receptionist review log omits internal risk fields', async () => {
        mockFetchReviewLog.mockResolvedValue({
            total: 1,
            rows: [{ log_id: 'log-1', risk_score: 50, risk_reason: 'internal', metadata: { secret: true } }],
        });
        const req = {
            query: { date: '2026-09-22' },
            user: { user_id: 'receptionist-1', role: 'Receptionist' },
        };
        const res = createResponse();

        await endOfDayController.getReviewLog({})(req, res, jest.fn());

        expect(mockFetchReviewLog).toHaveBeenCalledWith({}, expect.objectContaining({ actorUserId: 'receptionist-1' }));
        expect(res.json.mock.calls[0][0].rows[0]).toEqual({ log_id: 'log-1' });
    });

    test('receptionist cannot resolve a case assigned to another receptionist', async () => {
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({})
                .mockResolvedValueOnce({
                    rows: [{
                        exam_id: 'exam-1',
                        queue_stage: 'Scheduled',
                        exam_status: 'Scheduled',
                        receptionist_id: 'receptionist-2',
                    }],
                })
                .mockResolvedValueOnce({}),
            release: jest.fn(),
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };

        await expect(actualEndOfDayService.resolveExam(db, {
            appointmentId: 'appointment-1',
            action: 'no_show',
            actorUserId: 'receptionist-1',
            actorRole: 'Receptionist',
        })).rejects.toMatchObject({ statusCode: 404 });

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });

    test('pending and summary queries apply receptionist ownership at the database layer', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ total: 0 }] })
                .mockResolvedValueOnce({ rows: [{ total: 0, completed: 0 }] }),
        };

        await actualEndOfDayService.getPendingExams(db, {
            date: '2026-09-22',
            sessionId: 'session-1',
            receptionistId: 'receptionist-1',
            actorRole: 'Receptionist',
        });
        await actualEndOfDayService.getDaySummary(db, '2026-09-22', {
            receptionistId: 'receptionist-1',
            actorRole: 'Receptionist',
        });

        const pendingSql = db.query.mock.calls[0][0];
        const pendingValues = db.query.mock.calls[0][1];
        const summarySql = db.query.mock.calls[2][0];
        expect(pendingSql).toContain('rwi.shift_session_id = $3::uuid');
        expect(pendingSql).toContain('a.receptionist_id = $4::uuid');
        expect(pendingSql).toContain('rec.full_name AS receptionist_name');
        expect(pendingValues).toEqual(expect.arrayContaining(['session-1', 'receptionist-1']));
        expect(summarySql).toContain('a.receptionist_id = $3::uuid');
        expect(summarySql).toContain('e.exam_completed_at IS NOT NULL');
    });

    test('carry-forward actually moves the booking to the next day and resets the exam workflow', async () => {
        const queryResults = [
            {},
            {
                rows: [{
                    exam_id: 'exam-1',
                    queue_stage: 'Ready for Exam',
                    current_station: 'Nurse',
                    exam_status: 'Checked-in',
                    receptionist_id: 'receptionist-1',
                    status: 'Checked-in',
                    start_time: '2026-09-22T10:00:00.000Z',
                    end_time: '2026-09-22T10:30:00.000Z',
                    modality_id: 'modality-1',
                }],
            },
            { rows: [] },
        ];
        const client = {
            query: jest.fn().mockImplementation(() => Promise.resolve(queryResults.shift() || { rows: [] })),
            release: jest.fn(),
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };

        const result = await actualEndOfDayService.resolveExam(db, {
            appointmentId: 'appointment-1',
            action: 'carry_forward',
            notes: 'Patient confirmed tomorrow',
            actorUserId: 'receptionist-1',
            actorRole: 'Receptionist',
        });

        expect(result.newStage).toBe('Scheduled');
        const appointmentUpdate = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE appointments SET start_time'));
        expect(appointmentUpdate[1][1]).toBe('2026-09-23T10:00:00');
        expect(client.query.mock.calls.some(([sql]) => sql.includes("SET queue_stage = 'Scheduled', status = 'Scheduled'"))).toBe(true);
        expect(client.query.mock.calls.some(([sql]) => sql.includes("event_type") && sql.includes("'EndOfDayResolution'"))).toBe(true);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
    });
});
