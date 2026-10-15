const { getPatients, getPatientHistory } = require('../src/controllers/patientController');

const technicianId = '00000000-0000-4000-8000-000000000501';
const patientId = '00000000-0000-4000-8000-000000000502';

const response = () => ({ json: jest.fn() });

describe('patient visibility follows active clinical task ownership', () => {
    test('technician patient search only includes owned tasks or unassigned Modality tasks', async () => {
        const db = {
            query: jest.fn(async (_sql, _values) => {
                const call = db.query.mock.calls.length;
                if (call === 1) return { rows: [] };
                if (call === 2) return { rows: [{ count: '0' }] };
                return { rows: [{ all_count: 0, male_count: 0, female_count: 0, other_count: 0 }] };
            })
        };
        const res = response();
        const next = jest.fn();

        await getPatients(db)({
            query: { page: '1', limit: '20' },
            user: { user_id: technicianId, role: 'Technician' }
        }, res, next);

        const [sql, values] = db.query.mock.calls[0];
        expect(sql).toContain('JOIN examinations scope_exam ON scope_exam.appointment_id = scope_appt.appointment_id');
        expect(sql).toContain("scope_exam.current_station = 'Modality'");
        expect(sql).toContain('scope_appt.technician_id IS NULL');
        expect(values).toEqual([technicianId, 20, 0]);
        expect(next).not.toHaveBeenCalled();
    });

    test('patient history applies the same Nurse station ownership scope', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = response();
        const next = jest.fn();

        await getPatientHistory(db)({
            params: { id: patientId },
            branchContext: { branchId: '00000000-0000-4000-8000-000000000001' },
            user: { user_id: technicianId, role: 'Nurse' }
        }, res, next);

        const [sql, values] = db.query.mock.calls[0];
        expect(sql).toContain("scope_exam.current_station = 'Nurse'");
        expect(sql).toContain('scope_appt.nurse_id IS NULL');
        expect(values).toEqual([patientId, technicianId]);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    test('patient history reports confirmed deliveries and orders status by its latest event', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ patient_id: patientId }] })
                .mockResolvedValue({ rows: [] })
        };
        const res = response();
        const next = jest.fn();

        await getPatientHistory(db)({
            params: { id: patientId },
            branchContext: { branchId: '00000000-0000-4000-8000-000000000001' },
            user: { user_id: 'admin-1', role: 'Admin' }
        }, res, next);

        const historyQuery = db.query.mock.calls[1][0];
        expect(historyQuery).toContain('AND a.branch_id = $2::uuid');
        expect(historyQuery).toContain('prior_e.branch_id = a.branch_id');
        expect(db.query.mock.calls[1][1]).toEqual([patientId, '00000000-0000-4000-8000-000000000001']);
        expect(historyQuery).toContain("MAX(rd.delivered_at) FILTER (WHERE rd.delivery_status IN (");
        expect(historyQuery).toContain('AS has_completed_delivery');
        expect(historyQuery).toContain('ORDER BY rdv.created_at DESC, rdv.delivery_id DESC');
        expect(historyQuery).not.toContain('MAX(rd.delivery_status)');
        expect(next).not.toHaveBeenCalled();
    });
});
