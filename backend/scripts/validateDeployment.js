const assert = require('assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL || !/validation/i.test(process.env.DATABASE_URL)) {
    throw new Error('Refusing to run: DATABASE_URL must identify a disposable validation database');
}

if (!process.env.TEST_USER_PASSWORD) {
    throw new Error('Refusing to run: TEST_USER_PASSWORD must be set for deployment validation');
}

process.env.NODE_ENV = 'test';
const app = require('../src/server');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const checks = [];
const check = (name, condition, details = '') => {
    assert.ok(condition, `${name}${details ? `: ${details}` : ''}`);
    checks.push(name);
};
const bearer = token => ({ Authorization: `Bearer ${token}` });

const createPatient = async (token, suffix) => {
    const response = await request(app)
        .post('/api/patients')
        .set(bearer(token))
        .send({
            firstName: `Validation${suffix}`,
            lastName: 'Patient',
            dateOfBirth: '1990-01-01',
            phone: `2010${String(suffix).padStart(7, '0').slice(-7)}`,
            gender: 'Male',
            email: `validation.${suffix}@example.test`
        });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return {
        id: response.body.data.patient_id,
        mrn: response.body.data.mrn,
        password: response.body.portalPassword
    };
};

const main = async () => {
    const ready = await request(app).get('/health/ready');
    check('database readiness', ready.status === 200 && ready.body.database === 'connected');

    const adminLogin = await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'VIARA-Validation-Primary/1.0')
        .send({ email: 'admin@VIARA.com', password: process.env.TEST_USER_PASSWORD });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));
    const adminToken = adminLogin.body.token;
    const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];
    check('administrator login', Boolean(adminToken));

    const dashboard = await request(app).get('/api/dashboard/stats').set(bearer(adminToken));
    check('authorized dashboard', dashboard.status === 200);

    const secondaryAdminLogin = await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'VIARA-Validation-Secondary/1.0')
        .send({ email: 'admin@VIARA.com', password: process.env.TEST_USER_PASSWORD });
    assert.equal(secondaryAdminLogin.status, 200, JSON.stringify(secondaryAdminLogin.body));
    const sessions = await request(app)
        .get('/api/auth/sessions')
        .set(bearer(adminToken))
        .set('Cookie', adminCookie);
    const currentSessions = sessions.body.sessions?.filter(session => session.isCurrent) || [];
    const secondarySession = sessions.body.sessions?.find(session => session.userAgent === 'VIARA-Validation-Secondary/1.0');
    check('real session inventory', sessions.status === 200 && currentSessions.length === 1 && Boolean(secondarySession));
    const revokedSession = await request(app)
        .delete(`/api/auth/sessions/${secondarySession.id}`)
        .set(bearer(adminToken))
        .set('Cookie', adminCookie);
    const revokedSessionRow = await db.query('SELECT revoked, revoked_reason FROM refresh_tokens WHERE token_id = $1', [secondarySession.id]);
    check('user-controlled session revocation', revokedSession.status === 204
        && revokedSessionRow.rows[0].revoked === true
        && revokedSessionRow.rows[0].revoked_reason === 'user_revoked_session');
    const currentSessionRevoke = await request(app)
        .delete(`/api/auth/sessions/${currentSessions[0].id}`)
        .set(bearer(adminToken))
        .set('Cookie', adminCookie);
    check('current-session sign-out guard', currentSessionRevoke.status === 409);

    const preferenceUpdate = await request(app)
        .put('/api/profile/preferences')
        .set(bearer(adminToken))
        .send({
            theme: 'system', primaryColor: 'cyan', density: 'comfortable', language: 'en',
            timezone: 'Africa/Cairo',
            emailNotifications: { dailySummary: true, systemAlerts: true, promotionalUpdates: false }
        });
    const persistedPreferences = await db.query('SELECT preferences FROM users WHERE user_id = $1', [adminLogin.body.user.id]);
    check('persisted advanced preferences', preferenceUpdate.status === 200
        && persistedPreferences.rows[0].preferences.timezone === 'Africa/Cairo'
        && persistedPreferences.rows[0].preferences.emailNotifications.systemAlerts === true);
    const personalExport = await request(app).get('/api/profile/export').set(bearer(adminToken));
    const exportAudit = await db.query("SELECT 1 FROM system_logs WHERE user_id = $1 AND action = 'PERSONAL_DATA_EXPORTED'", [adminLogin.body.user.id]);
    check('audited personal-data export', personalExport.status === 200
        && personalExport.body.profile.user_id === adminLogin.body.user.id
        && Array.isArray(personalExport.body.securityActivity)
        && exportAudit.rows.length === 1);

    const readTokenCreate = await request(app)
        .post('/api/profile/tokens')
        .set(bearer(adminToken))
        .send({ name: 'Validation read client', accessLevel: 'read' });
    assert.equal(readTokenCreate.status, 201, JSON.stringify(readTokenCreate.body));
    const readToken = readTokenCreate.body.rawToken;
    const patProfile = await request(app).get('/api/profile').set(bearer(readToken));
    const patLastUsed = await db.query('SELECT last_used_at FROM api_tokens WHERE token_id = $1', [readTokenCreate.body.token.id]);
    check('hashed personal-token authentication', patProfile.status === 200 && Boolean(patLastUsed.rows[0].last_used_at));
    const readOnlyWrite = await request(app)
        .put('/api/profile/preferences')
        .set(bearer(readToken))
        .send({ theme: 'system', primaryColor: 'cyan', density: 'comfortable', language: 'en' });
    check('read-only token enforcement', readOnlyWrite.status === 403 && readOnlyWrite.body.code === 'TOKEN_READ_ONLY');
    const tokenRevoke = await request(app)
        .delete(`/api/profile/tokens/${readTokenCreate.body.token.id}`)
        .set(bearer(adminToken));
    const revokedPatUse = await request(app).get('/api/profile').set(bearer(readToken));
    check('personal-token revocation', tokenRevoke.status === 200 && revokedPatUse.status === 403);

    const patient = await createPatient(adminToken, 1000001);
    const portalLogin = await request(app)
        .post('/api/portal/login')
        .send({ mrn: patient.mrn, password: patient.password });
    assert.equal(portalLogin.status, 200, JSON.stringify(portalLogin.body));
    const portalDashboard = await request(app)
        .get('/api/dashboard/stats')
        .set(bearer(portalLogin.body.token));
    check('portal dashboard isolation', portalDashboard.status === 403);

    const technicianLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'tech@VIARA.com', password: process.env.TEST_USER_PASSWORD });
    assert.equal(technicianLogin.status, 200, JSON.stringify(technicianLogin.body));
    const reportWrite = await request(app)
        .put('/api/exams/report')
        .set(bearer(technicianLogin.body.token))
        .send({ examId: crypto.randomUUID(), status: 'Reporting', reportContent: 'Unauthorized diagnosis' });
    check('technician report-authority boundary', reportWrite.status === 403);

    const machineCreate = await request(app)
        .post('/api/machines')
        .set(bearer(adminToken))
        .send({ name: 'Validation CT', type: 'CT', roomNumber: 'V-01', serialNumber: 'VALIDATION-CT-001', manufacturer: 'Validation Medical', model: 'CT-Safe', location: 'Validation wing' });
    assert.equal(machineCreate.status, 201, JSON.stringify(machineCreate.body));
    const machineUpdate = await request(app)
        .put(`/api/machines/${machineCreate.body.modality_id}`)
        .set(bearer(adminToken))
        .send({ status: 'Under Maintenance', location: 'Validation service bay' });
    check('audited machine catalog management', machineUpdate.status === 200 && machineUpdate.body.status === 'Under Maintenance');

    const examCreate = await request(app)
        .post('/api/exam-types')
        .set(bearer(adminToken))
        .send({ modalityId: machineCreate.body.modality_id, code: 'VAL-CT-01', name: 'Validation CT examination', price: 750, durationMinutes: 25, bodyPart: 'Chest', preparationInstructions: 'Validation preparation', contrastRequired: true, isActive: true });
    assert.equal(examCreate.status, 201, JSON.stringify(examCreate.body));
    const forbiddenExamUpdate = await request(app)
        .put(`/api/exam-types/${examCreate.body.type_id}`)
        .set(bearer(technicianLogin.body.token))
        .send({ price: 1 });
    check('examination catalog permission boundary', forbiddenExamUpdate.status === 403);
    const examUpdate = await request(app)
        .put(`/api/exam-types/${examCreate.body.type_id}`)
        .set(bearer(adminToken))
        .send({ price: 800, isActive: false });
    check('examination catalog update and deactivation', examUpdate.status === 200 && Number(examUpdate.body.price) === 800 && examUpdate.body.is_active === false);
    const activeExamList = await request(app).get('/api/exam-types').set(bearer(adminToken));
    const completeExamList = await request(app).get('/api/exam-types?includeInactive=true').set(bearer(adminToken));
    check('inactive examination booking isolation', !activeExamList.body.some(item => item.type_id === examCreate.body.type_id)
        && completeExamList.body.some(item => item.type_id === examCreate.body.type_id));

    const invoiceCreate = await request(app)
        .post('/api/invoices')
        .set(bearer(adminToken))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
            patientId: patient.id,
            items: [{ description: 'Validation radiology service', quantity: 1, unitPrice: 100 }],
            discountAmount: 10,
            discountReason: 'Validated contractual adjustment'
        });
    assert.equal(invoiceCreate.status, 201, JSON.stringify(invoiceCreate.body));
    const invoiceId = invoiceCreate.body.invoice_id;
    check('reasoned discount governance', Number(invoiceCreate.body.discount_amount) === 10
        && invoiceCreate.body.discount_reason === 'Validated contractual adjustment');

    const accountantLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'accountant@VIARA.com', password: process.env.TEST_USER_PASSWORD });
    assert.equal(accountantLogin.status, 200, JSON.stringify(accountantLogin.body));
    const accountantToken = accountantLogin.body.token;
    const receptionLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'reception@VIARA.com', password: process.env.TEST_USER_PASSWORD });
    assert.equal(receptionLogin.status, 200, JSON.stringify(receptionLogin.body));

    const cashierTemporaryPassword = 'CashierTemporary123!';
    const cashierPassword = 'CashierReplacement456!';
    const cashierCreate = await request(app)
        .post('/api/staff')
        .set(bearer(adminToken))
        .send({ fullName: 'Validation Cashier', email: 'validation.cashier@example.test', password: cashierTemporaryPassword, role: 'Cashier' });
    assert.equal(cashierCreate.status, 201, JSON.stringify(cashierCreate.body));
    const cashierTemporaryLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'validation.cashier@example.test', password: cashierTemporaryPassword });
    assert.equal(cashierTemporaryLogin.status, 200, JSON.stringify(cashierTemporaryLogin.body));
    const cashierPasswordChange = await request(app)
        .put('/api/profile/password')
        .set(bearer(cashierTemporaryLogin.body.token))
        .send({ currentPassword: cashierTemporaryPassword, newPassword: cashierPassword });
    assert.equal(cashierPasswordChange.status, 200, JSON.stringify(cashierPasswordChange.body));
    const cashierLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'validation.cashier@example.test', password: cashierPassword });
    assert.equal(cashierLogin.status, 200, JSON.stringify(cashierLogin.body));
    const cashierToken = cashierLogin.body.token;

    const shift = await request(app)
        .post('/api/cashier/shifts/open')
        .set(bearer(cashierToken))
        .send({ openingBalance: 0, notes: 'Deployment validation' });
    assert.equal(shift.status, 201, JSON.stringify(shift.body));

    const receptionPayment = await request(app)
        .post(`/api/invoices/${invoiceId}/payment`)
        .set(bearer(receptionLogin.body.token))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ amount: 1, method: 'Cash' });
    const accountantPayment = await request(app)
        .post(`/api/invoices/${invoiceId}/payment`)
        .set(bearer(accountantToken))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ amount: 1, method: 'Cash' });
    check(
        'payment role and shift separation',
        receptionPayment.status === 409 && accountantPayment.status === 403,
        `reception=${receptionPayment.status}, accountant=${accountantPayment.status}`
    );

    const missingIdempotency = await request(app)
        .post(`/api/invoices/${invoiceId}/payment`)
        .set(bearer(cashierToken))
        .send({ amount: 50, method: 'Cash' });
    check('payment idempotency requirement', missingIdempotency.status === 400);

    const paymentKey = crypto.randomUUID();
    const payment = await request(app)
        .post(`/api/invoices/${invoiceId}/payment`)
        .set(bearer(cashierToken))
        .set('Idempotency-Key', paymentKey)
        .send({ amount: 50, method: 'Cash' });
    assert.equal(payment.status, 201, JSON.stringify(payment.body));
    check('payment invariants', payment.body.invoice.invoice_status === 'Partial');
    const paymentReplay = await request(app)
        .post(`/api/invoices/${invoiceId}/payment`)
        .set(bearer(cashierToken))
        .set('Idempotency-Key', paymentKey)
        .send({ amount: 50, method: 'Cash' });
    const paymentCount = await db.query('SELECT COUNT(*)::int AS count FROM payments WHERE invoice_id = $1', [invoiceId]);
    check('payment idempotent replay', paymentReplay.status === 201
        && paymentReplay.body.payment.payment_id === payment.body.payment.payment_id
        && paymentCount.rows[0].count === 1);
    const mismatchedReplay = await request(app)
        .post(`/api/invoices/${invoiceId}/payment`)
        .set(bearer(cashierToken))
        .set('Idempotency-Key', paymentKey)
        .send({ amount: 10, method: 'Cash' });
    check('idempotency payload mismatch guard', mismatchedReplay.status === 409);

    const refund = await request(app)
        .post(`/api/invoices/${invoiceId}/refund`)
        .set(bearer(cashierToken))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ amount: 20, method: 'Cash', reason: 'Validation refund' });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));
    check('refund request staging', refund.body.refund.status === 'Pending');
    const refundId = refund.body.refund.refund_id;
    const selfApproval = await request(app)
        .patch(`/api/refunds/${refundId}/status`)
        .set(bearer(cashierToken))
        .send({ status: 'Approved', reason: 'Should not self approve' });
    check('refund self-approval guard', selfApproval.status === 403);
    const approvedRefund = await request(app)
        .patch(`/api/refunds/${refundId}/status`)
        .set(bearer(accountantToken))
        .send({ status: 'Approved', reason: 'Independent finance approval' });
    assert.equal(approvedRefund.status, 200, JSON.stringify(approvedRefund.body));
    const accountantProcessing = await request(app)
        .patch(`/api/refunds/${refundId}/status`)
        .set(bearer(accountantToken))
        .send({ status: 'Processed', reason: 'Should be cashier controlled' });
    check('refund processing role separation', accountantProcessing.status === 403);
    const processedRefund = await request(app)
        .patch(`/api/refunds/${refundId}/status`)
        .set(bearer(cashierToken))
        .send({ status: 'Processed', reason: 'Cash returned to patient' });
    check('refund reconciliation', processedRefund.status === 200 && processedRefund.body.refund?.status === 'Processed');

    const concurrentRefunds = await Promise.all([
        request(app)
            .post(`/api/invoices/${invoiceId}/refund`)
            .set(bearer(cashierToken))
            .set('Idempotency-Key', crypto.randomUUID())
            .send({ amount: 25, method: 'Cash', reason: 'Concurrent refund A' }),
        request(app)
            .post(`/api/invoices/${invoiceId}/refund`)
            .set(bearer(cashierToken))
            .set('Idempotency-Key', crypto.randomUUID())
            .send({ amount: 25, method: 'Cash', reason: 'Concurrent refund B' })
    ]);
    const concurrentStatuses = concurrentRefunds.map(response => response.status).sort();
    const refundTotal = await db.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM refunds
        WHERE invoice_id = $1 AND status <> 'Rejected'
    `, [invoiceId]);
    check(
        'concurrency-safe refund cap',
        concurrentStatuses[0] === 201
        && concurrentStatuses[1] === 409
        && Number(refundTotal.rows[0].total) === 45
    );
    const concurrentRefund = concurrentRefunds.find(response => response.status === 201).body.refund;
    const concurrentApproval = await request(app)
        .patch(`/api/refunds/${concurrentRefund.refund_id}/status`)
        .set(bearer(accountantToken))
        .send({ status: 'Approved', reason: 'Validation concurrent refund approval' });
    assert.equal(concurrentApproval.status, 200, JSON.stringify(concurrentApproval.body));
    const concurrentProcessing = await request(app)
        .patch(`/api/refunds/${concurrentRefund.refund_id}/status`)
        .set(bearer(cashierToken))
        .send({ status: 'Processed', reason: 'Validation concurrent refund payment' });
    check('concurrent refund lifecycle completion', concurrentProcessing.status === 200);

    const closeWithoutReason = await request(app)
        .post(`/api/cashier/shifts/${shift.body.shift_id}/close`)
        .set(bearer(cashierToken))
        .send({ countedCash: 40 });
    check('material cash variance reason requirement', closeWithoutReason.status === 400);
    const closedShift = await request(app)
        .post(`/api/cashier/shifts/${shift.body.shift_id}/close`)
        .set(bearer(cashierToken))
        .send({ countedCash: 40, varianceReason: 'Validated ten pound overage', notes: 'Blind count complete' });
    assert.equal(closedShift.status, 200, JSON.stringify(closedShift.body));
    check('blind cash closure variance staging', closedShift.body.closure.review_status === 'Requires Review');
    const cashierSelfReview = await request(app)
        .patch(`/api/cashier/closures/${closedShift.body.closure.closure_id}/review`)
        .set(bearer(cashierToken))
        .send({ reviewNotes: 'Should not self review' });
    check('cash variance self-review guard', cashierSelfReview.status === 403);
    const reviewedClosure = await request(app)
        .patch(`/api/cashier/closures/${closedShift.body.closure.closure_id}/review`)
        .set(bearer(accountantToken))
        .send({ reviewNotes: 'Count sheet and transaction log independently verified' });
    check('independent cash variance review', reviewedClosure.status === 200 && reviewedClosure.body.review_status === 'Reviewed');

    let provider = await db.query('SELECT provider_id FROM insurance_providers LIMIT 1');
    if (!provider.rows.length) {
        provider = await db.query("INSERT INTO insurance_providers (name) VALUES ('Validation Provider') RETURNING provider_id");
    }
    const claimCreate = await request(app)
        .post('/api/claims')
        .set(bearer(adminToken))
        .send({ patientId: patient.id, providerId: provider.rows[0].provider_id, expectedAmount: 100 });
    assert.equal(claimCreate.status, 201, JSON.stringify(claimCreate.body));
    const claimId = claimCreate.body.claim_id;
    const invalidClaim = await request(app)
        .put(`/api/claims/${claimId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'Paid', receivedAmount: 100 });
    check('claim transition enforcement', invalidClaim.status === 409);
    const submittedClaim = await request(app)
        .put(`/api/claims/${claimId}/status`)
        .set(bearer(adminToken))
        .send({ status: 'Submitted', claimReferenceNumber: 'VALIDATION-CLAIM-1' });
    assert.equal(submittedClaim.status, 200, JSON.stringify(submittedClaim.body));
    const partialClaim = await request(app)
        .put(`/api/claims/${claimId}/status`)
        .set(bearer(adminToken))
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ status: 'Partially Paid', receivedAmount: 40 });
    check('claim amount reconciliation', partialClaim.status === 200 && Number(partialClaim.body.received_amount) === 40);

    const mergeTarget = await createPatient(adminToken, 1000002);
    const mergeSource = await createPatient(adminToken, 1000003);
    const merge = await request(app)
        .post(`/api/patients/${mergeTarget.id}/merge`)
        .set(bearer(adminToken))
        .send({ sourcePatientId: mergeSource.id, reason: 'Duplicate validation record' });
    assert.equal(merge.status, 200, JSON.stringify(merge.body));
    const mergedRow = await db.query('SELECT patient_status, merged_into_patient_id FROM patients WHERE patient_id = $1', [mergeSource.id]);
    check('patient merge lineage', mergedRow.rows[0].patient_status === 'Merged' && mergedRow.rows[0].merged_into_patient_id === mergeTarget.id);

    const restrict = await request(app)
        .delete(`/api/patients/${patient.id}`)
        .set(bearer(adminToken));
    assert.equal(restrict.status, 200, JSON.stringify(restrict.body));
    const preserved = await db.query(`
        SELECT p.patient_status, COUNT(i.invoice_id)::int AS invoices
        FROM patients p LEFT JOIN invoices i ON i.patient_id = p.patient_id
        WHERE p.patient_id = $1 GROUP BY p.patient_id
    `, [patient.id]);
    check('history-preserving patient restriction', preserved.rows[0].patient_status === 'Restricted' && preserved.rows[0].invoices === 1);

    const temporaryPassword = 'TemporaryPass123!';
    const staffCreate = await request(app)
        .post('/api/staff')
        .set(bearer(adminToken))
        .send({ fullName: 'Validation Staff', email: 'validation.staff@example.test', password: temporaryPassword, role: 'Nurse' });
    assert.equal(staffCreate.status, 201, JSON.stringify(staffCreate.body));
    const staffLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'validation.staff@example.test', password: temporaryPassword });
    assert.equal(staffLogin.status, 200, JSON.stringify(staffLogin.body));
    check('temporary-password login flag', staffLogin.body.user.mustChangePassword === true);
    const blockedDashboard = await request(app).get('/api/dashboard/stats').set(bearer(staffLogin.body.token));
    check('forced-password API gate', blockedDashboard.status === 403 && blockedDashboard.body.code === 'PASSWORD_CHANGE_REQUIRED');
    const passwordChange = await request(app)
        .put('/api/profile/password')
        .set(bearer(staffLogin.body.token))
        .send({ currentPassword: temporaryPassword, newPassword: 'ReplacementPass456!' });
    assert.equal(passwordChange.status, 200, JSON.stringify(passwordChange.body));
    const staffRelogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'validation.staff@example.test', password: 'ReplacementPass456!' });
    check('forced-password completion', staffRelogin.status === 200 && staffRelogin.body.user.mustChangePassword === false);

    const currentBusinessDate = await db.query('SELECT CURRENT_DATE::text AS business_date');
    const date = currentBusinessDate.rows[0].business_date;
    const closureCreate = await request(app)
        .post('/api/finance/closures')
        .set(bearer(adminToken))
        .send({ closureDate: date });
    assert.equal(closureCreate.status, 201, JSON.stringify(closureCreate.body));
    const closureFinalize = await request(app)
        .put(`/api/finance/closures/${closureCreate.body.closure_id}`)
        .set(bearer(adminToken))
        .send({ status: 'Finalized' });
    assert.equal(closureFinalize.status, 200, JSON.stringify(closureFinalize.body));
    const closedInvoiceEdit = await request(app)
        .put(`/api/invoices/${invoiceId}`)
        .set(bearer(adminToken))
        .send({ notes: 'Should be blocked after close' });
    check('finalized-period lock', closedInvoiceEdit.status === 409);

    const originalCookie = accountantLogin.headers['set-cookie'][0].split(';')[0];
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', originalCookie);
    assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', originalCookie);
    check('refresh-token replay detection', replay.status === 401);

    const history = await db.query('SELECT COUNT(*)::int AS count FROM claim_status_history WHERE claim_id = $1', [claimId]);
    check('append-only claim history', history.rows[0].count === 3);
    const auditHashes = await db.query('SELECT COUNT(*)::int AS count FROM system_logs WHERE entry_hash IS NOT NULL');
    check('tamper-evident audit chain', auditHashes.rows[0].count > 0);

    console.log(`Deployment validation passed: ${checks.length} checks`);
    checks.forEach(name => console.log(`  ✓ ${name}`));
};

main()
    .then(async () => {
        await new Promise(resolve => setTimeout(resolve, 250));
        await db.end();
        process.exit(0);
    })
    .catch(async error => {
        console.error(`Deployment validation failed: ${error.stack || error.message}`);
        await db.end().catch(() => { });
        process.exit(1);
    });
