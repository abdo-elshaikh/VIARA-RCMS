require('dotenv').config({ path: '.env.test' }); // Load test environment variables

jest.mock('pg', () => {
    const ids = {
        admin: '00000000-0000-4000-8000-000000000001',
        patient: '00000000-0000-4000-8000-000000000301',
        appointment: '00000000-0000-4000-8000-000000000401',
        modality: '00000000-0000-4000-8000-000000000101',
        examType: '00000000-0000-4000-8000-000000000201'
    };

    const passwordHash = '***REMOVED***';

    const normalize = (sql) => String(sql).replace(/\s+/g, ' ').trim();

    const queryImpl = async (sql, params = []) => {
        const text = normalize(sql);

        if (text.includes('SELECT * FROM users WHERE email = $1')) {
            if (params[0] === 'admin@rcms.com') {
                return {
                    rows: [{
                        user_id: ids.admin,
                        full_name: 'System Admin',
                        email: 'admin@rcms.com',
                        password_hash: passwordHash,
                        role: 'Admin',
                        is_active: true,
                        failed_login_attempts: 0,
                        locked_until: null,
                        is_2fa_enabled: false
                    }]
                };
            }
            return { rows: [] };
        }

        if (text.includes('INSERT INTO patients')) {
            return { rows: [{ patient_id: ids.patient, mrn: 'PAT-TEST-0001', created_at: new Date().toISOString() }] };
        }

        if (text.includes('SELECT working_hours FROM center_settings')) {
            return { rows: [{ working_hours: { start: 6, end: 22, holidays: [] } }] };
        }

        if (text.includes('SELECT modality_id, status FROM modalities')) {
            return { rows: [{ modality_id: ids.modality, status: 'Active' }] };
        }

        if (text.includes('FROM equipment_downtime')) {
            return { rows: [] };
        }

        if (text.includes('FROM examination_types WHERE type_id')) {
            return { rows: [{ body_part: 'Brain', contrast_required: false }] };
        }

        if (text.includes('SELECT appointment_id FROM appointments')) {
            return { rows: [] };
        }

        if (text.includes('INSERT INTO appointments')) {
            return {
                rows: [{
                    appointment_id: ids.appointment,
                    patient_id: ids.patient,
                    modality_id: ids.modality,
                    exam_type_id: ids.examType,
                    start_time: params[3],
                    end_time: params[4],
                    status: 'Confirmed',
                    order_number: 'ORD-TEST-0001',
                    priority: 'Routine',
                    preparation_status: 'Not Required'
                }]
            };
        }

        if (text.startsWith('SELECT e.exam_id') && text.includes('FROM examinations e')) {
            return { rows: [] };
        }

        if (text.includes('FROM examinations e') && text.includes('queue_stage')) {
            return { rows: [] };
        }

        if (text.startsWith('SELECT')) {
            return { rows: [] };
        }

        return { rows: [] };
    };

    const query = jest.fn((sql, params, callback) => {
        if (typeof params === 'function') {
            queryImpl(sql).then(result => params(null, result)).catch(error => params(error));
            return undefined;
        }

        if (typeof callback === 'function') {
            queryImpl(sql, params).then(result => callback(null, result)).catch(error => callback(error));
            return undefined;
        }

        return queryImpl(sql, params);
    });

    return {
        Pool: jest.fn().mockImplementation(() => ({
            query,
            connect: jest.fn().mockResolvedValue({
                query,
                release: jest.fn()
            }),
            end: jest.fn((callback) => {
                if (callback) callback();
                return Promise.resolve();
            })
        }))
    };
});

// Create a pool for testing if needed, though usually we import the app/db from server or config
// For integration tests, we just ensuring basic environment is healthy

beforeAll(async () => {
    // Global setup if needed
    process.env.NODE_ENV = 'test';
});

afterAll(async () => {
    // Global teardown
});
