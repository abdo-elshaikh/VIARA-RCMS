jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));
jest.mock('../src/controllers/authController', () => ({ generateTokens: jest.fn() }));
jest.mock('../src/utils/crypto', () => ({ decrypt: jest.fn(() => 'Name') }));

const bcrypt = require('bcrypt');
const { generateTokens } = require('../src/controllers/authController');
const { patientLogin } = require('../src/controllers/portalController');
const { doctorLogin } = require('../src/controllers/doctorPortalController');

const request = (body) => ({ body });
const response = () => ({ cookie: jest.fn(), json: jest.fn() });

const expectGenericFailure = (next) => {
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid credentials',
        statusCode: 401
    }));
};

describe('portal login security', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test.each([
        ['unknown patient', patientLogin, { mrn: 'missing', password: 'secret' }],
        ['unknown doctor', doctorLogin, { email: 'missing@example.test', password: 'secret' }]
    ])('%s performs bcrypt work and returns a generic error', async (_name, factory, body) => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const next = jest.fn();
        bcrypt.compare.mockResolvedValue(false);

        await factory(db)(request(body), response(), next);

        expect(bcrypt.compare).toHaveBeenCalledWith(body.password, expect.stringMatching(/^\$2b\$10\$/));
        expectGenericFailure(next);
    });

    test.each([
        ['globally inactive', { is_active: false, portal_password_hash: 'hash', portal_is_active: true }],
        ['unactivated', { portal_password_hash: null, portal_is_active: false }],
        ['inactive', { portal_password_hash: 'hash', portal_is_active: false }],
        ['locked', { portal_password_hash: 'hash', portal_is_active: true, portal_locked_until: '2999-01-01T00:00:00Z' }]
    ])('doctor %s account returns the same public error', async (_state, account) => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ doctor_id: 'doctor-1', is_active: true, ...account }] }) };
        const next = jest.fn();
        bcrypt.compare.mockResolvedValue(true);

        await doctorLogin(db)(request({ email: 'doctor@example.test', password: 'secret' }), response(), next);

        expectGenericFailure(next);
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['unactivated', { password_hash: null, patient_status: 'Active' }],
        ['inactive', { password_hash: 'hash', patient_status: 'Inactive' }],
        ['locked', { password_hash: 'hash', patient_status: 'Active', portal_locked_until: '2999-01-01T00:00:00Z' }]
    ])('patient %s account returns the same public error', async (_state, account) => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ patient_id: 'patient-1', ...account }] }) };
        const next = jest.fn();
        bcrypt.compare.mockResolvedValue(true);

        await patientLogin(db)(request({ mrn: 'MRN-1', password: 'secret' }), response(), next);

        expectGenericFailure(next);
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('wrong patient password uses an atomic progressive lockout update', async () => {
        const patient = {
            patient_id: 'patient-1', password_hash: 'hash', patient_status: 'Active'
        };
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [patient] }).mockResolvedValueOnce({ rows: [] }) };
        const next = jest.fn();
        bcrypt.compare.mockResolvedValue(false);

        await patientLogin(db)(request({ mrn: 'MRN-1', password: 'wrong' }), response(), next);

        expect(db.query.mock.calls[1][0]).toContain('portal_failed_login_attempts = portal_failed_login_attempts + 1');
        expect(db.query.mock.calls[1][0]).toContain('POWER(2');
        expect(db.query.mock.calls[1][1]).toEqual(['patient-1']);
        expectGenericFailure(next);
    });

    test('wrong doctor password uses an atomic progressive lockout update', async () => {
        const doctor = {
            doctor_id: 'doctor-1', is_active: true, portal_password_hash: 'hash', portal_is_active: true
        };
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [doctor] }).mockResolvedValueOnce({ rows: [] }) };
        const next = jest.fn();
        bcrypt.compare.mockResolvedValue(false);

        await doctorLogin(db)(request({ email: 'doctor@example.test', password: 'wrong' }), response(), next);

        expect(db.query.mock.calls[1][0]).toContain('portal_failed_login_attempts = portal_failed_login_attempts + 1');
        expect(db.query.mock.calls[1][0]).toContain('POWER(2');
        expect(db.query.mock.calls[1][1]).toEqual(['doctor-1']);
        expectGenericFailure(next);
    });

    test('successful doctor login resets lockout state', async () => {
        const doctor = {
            doctor_id: 'doctor-1', is_active: true, portal_password_hash: 'hash', portal_is_active: true,
            full_name: 'Doctor', email: 'doctor@example.test'
        };
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [doctor] }).mockResolvedValueOnce({ rows: [] }) };
        const res = response();
        bcrypt.compare.mockResolvedValue(true);
        generateTokens.mockResolvedValue({ token: 'token', refreshToken: 'refresh' });

        await doctorLogin(db)(request({ email: doctor.email, password: 'correct' }), res, jest.fn());

        expect(db.query.mock.calls[1][0]).toContain('portal_failed_login_attempts = 0');
        expect(db.query.mock.calls[1][0]).toContain('portal_locked_until = NULL');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'token' }));
        expect(res.cookie).toHaveBeenCalledWith('portalRefreshToken', 'refresh', expect.objectContaining({ path: '/api/portal', httpOnly: true }));
    });

    test('successful patient login resets lockout state', async () => {
        const patient = {
            patient_id: 'patient-1', password_hash: 'hash', patient_status: 'Active',
            first_name_enc: 'first', last_name_enc: 'last'
        };
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [patient] }).mockResolvedValueOnce({ rows: [] }) };
        const res = response();
        bcrypt.compare.mockResolvedValue(true);
        generateTokens.mockResolvedValue({ token: 'token', refreshToken: 'refresh' });

        await patientLogin(db)(request({ mrn: 'MRN-1', password: 'correct' }), res, jest.fn());

        expect(db.query.mock.calls[1][0]).toContain('portal_failed_login_attempts = 0');
        expect(db.query.mock.calls[1][0]).toContain('portal_locked_until = NULL');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: 'token' }));
        expect(res.cookie).toHaveBeenCalledWith('portalRefreshToken', 'refresh', expect.objectContaining({ path: '/api/portal', httpOnly: true }));
    });
});
