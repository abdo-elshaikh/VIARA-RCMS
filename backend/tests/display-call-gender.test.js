jest.mock('../src/utils/crypto', () => ({ decrypt: value => value }));
jest.mock('../src/services/realtimeService', () => ({ broadcastToStaff: jest.fn() }));
const { broadcastPatientCall } = require('../src/controllers/displayBoardController');
const realtime = require('../src/services/realtimeService');

describe('verified patient gender in display calls', () => {
    test.each(['Male', 'Female'])('gets %s from the patient record for the response and realtime event', async gender => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ first_name_enc: 'Patient', last_name_enc: 'Name', gender, is_confidential: false }] }).mockResolvedValueOnce({ rows: [{ call_id: 'verified-call' }] }) };
        const req = { user: { user_id: 'admin', role: 'Admin' }, body: { orderNumber: 'ORD-100', roomName: 'Suite 1', callByName: true, gender: 'untrusted', patientName: 'untrusted' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        await broadcastPatientCall(db)(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ call: expect.objectContaining({ gender, patientName: 'Patient Name', callByName: true }) }));
        expect(realtime.broadcastToStaff).toHaveBeenCalledWith('DISPLAY_CALL', expect.objectContaining({ gender }));
        expect(db.query.mock.calls[0][0]).toContain('p.gender');
    });

    test.each([{ rows: [] }, { rows: [{ first_name_enc: 'Secret', gender: 'Female', is_confidential: true }] }])('does not expose an unverified or confidential gender', async ({ rows }) => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows: [{ call_id: 'private-call' }] }) };
        const req = { user: { user_id: 'admin', role: 'Admin' }, body: { orderNumber: 'ORD-100', callByName: true, gender: 'Female' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await broadcastPatientCall(db)(req, res, jest.fn());
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ call: expect.objectContaining({ gender: null, patientName: null, callByName: false }) }));
    });
});
