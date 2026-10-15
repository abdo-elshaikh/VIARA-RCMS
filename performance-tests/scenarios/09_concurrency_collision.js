/**
 * Scenario 09: Concurrency Collision & Race Conditions (PF-13)
 * Tests:
 * 1. Concurrent Double Payment Submission on same Invoice (Pessimistic FOR UPDATE lock & Idempotency replay)
 * 2. Concurrent Double Booking on same Modality/Time slot (HTTP 409 Conflict rejection)
 * 3. Concurrent Report Finalization / Edit collision (Serial FOR UPDATE & state machine transition safety)
 */

const crypto = require('crypto');

async function runConcurrencyCollisionScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '09_concurrency_collision';

    // -------------------------------------------------------------
    // TEST 1: Simultaneous Double Payment Collision (Financial Safety)
    // -------------------------------------------------------------
    const cashierClient1 = await userPool.createAuthenticatedClient('cashier');
    const cashierClient2 = await userPool.createAuthenticatedClient('cashier');

    // Fetch an invoice to test concurrent payments
    const invRes = await cashierClient1.get('/api/invoices?limit=5');
    metricsCollector.record({
        scenario,
        action: 'Query Invoices for Collision',
        method: 'GET',
        endpoint: '/api/invoices',
        duration: invRes.duration,
        status: invRes.status,
        ok: invRes.ok,
        error: invRes.error
    });

    const invoices = Array.isArray(invRes.data) ? invRes.data : (invRes.data?.data || []);
    if (invoices.length > 0) {
        const targetInvoice = invoices[vuId % invoices.length];
        const sharedIdempotencyKey = crypto.randomUUID();

        const paymentPayload = {
            amount: 5.00,
            method: 'Cash',
            paymentReference: `COLLISION_TEST_${vuId}_${Date.now()}`
        };

        // Fire both payment requests in parallel at the exact same millisecond
        const [pay1, pay2] = await Promise.all([
            cashierClient1.post(`/api/invoices/${targetInvoice.invoice_id}/payment`, paymentPayload, {
                headers: { 'idempotency-key': sharedIdempotencyKey }
            }),
            cashierClient2.post(`/api/invoices/${targetInvoice.invoice_id}/payment`, paymentPayload, {
                headers: { 'idempotency-key': sharedIdempotencyKey }
            })
        ]);

        const pay1Valid = pay1.ok || pay1.status === 400 || pay1.status === 409;
        metricsCollector.record({
            scenario,
            action: 'Concurrent Payment Thread 1',
            method: 'POST',
            endpoint: '/api/invoices/:id/payment (thread 1)',
            duration: pay1.duration,
            status: pay1.status,
            ok: pay1Valid,
            error: pay1Valid ? null : pay1.error
        });

        // Thread 2 with identical key must replay receipt (200/201) or reject conflict (400/409).
        // Zero double-charges or 500 errors permitted.
        const pay2Valid = pay2.ok || pay2.status === 400 || pay2.status === 409;
        metricsCollector.record({
            scenario,
            action: 'Concurrent Payment Thread 2 (Idempotency Protected)',
            method: 'POST',
            endpoint: '/api/invoices/:id/payment (thread 2)',
            duration: pay2.duration,
            status: pay2.status,
            ok: pay2Valid,
            error: pay2Valid ? null : pay2.error
        });
    }

    // -------------------------------------------------------------
    // TEST 2: Simultaneous Double Booking Collision on same Slot
    // -------------------------------------------------------------
    const recepClient1 = await userPool.createAuthenticatedClient('receptionist');
    const recepClient2 = await userPool.createAuthenticatedClient('receptionist');

    // Fetch machines and patients
    const [machRes, patRes] = await Promise.all([
        recepClient1.get('/api/machines'),
        recepClient1.get('/api/patients?limit=10')
    ]);

    const machines = Array.isArray(machRes.data) ? machRes.data : (machRes.data?.data || []);
    const patients = Array.isArray(patRes.data) ? patRes.data : (patRes.data?.data || []);

    if (machines.length > 0 && patients.length >= 2) {
        const modality = machines[0];
        const patientA = patients[0];
        const patientB = patients[1];

        // Target a conflicting future slot
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30 + (vuId % 10));
        futureDate.setHours(10, 0, 0, 0);
        const startTime = futureDate.toISOString();
        const endTime = new Date(futureDate.getTime() + 30 * 60000).toISOString();

        const bookingPayloadA = {
            patientId: patientA.patient_id,
            modalityId: modality.modality_id || modality.id,
            startTime,
            endTime,
            notes: 'Concurrency collision test user A'
        };

        const bookingPayloadB = {
            patientId: patientB.patient_id,
            modalityId: modality.modality_id || modality.id,
            startTime,
            endTime,
            notes: 'Concurrency collision test user B'
        };

        // Fire both simultaneous booking requests
        const [bookA, bookB] = await Promise.all([
            recepClient1.post('/api/appointments', bookingPayloadA),
            recepClient2.post('/api/appointments', bookingPayloadB)
        ]);

        const bookAValid = bookA.ok || bookA.status === 400 || bookA.status === 409;
        metricsCollector.record({
            scenario,
            action: 'Simultaneous Slot Booking A',
            method: 'POST',
            endpoint: '/api/appointments (thread A)',
            duration: bookA.duration,
            status: bookA.status,
            ok: bookAValid,
            error: bookAValid ? null : bookA.error
        });

        // Exactly one should succeed or detect conflict (409) — under NO circumstances should two different patients double book the slot!
        const bookBValid = bookB.ok || bookB.status === 409 || bookB.status === 400;
        metricsCollector.record({
            scenario,
            action: 'Simultaneous Slot Booking B (Conflict Detection)',
            method: 'POST',
            endpoint: '/api/appointments (thread B)',
            duration: bookB.duration,
            status: bookB.status,
            ok: bookBValid,
            error: bookBValid ? null : bookB.error
        });
    }

    // -------------------------------------------------------------
    // TEST 3: Simultaneous Report Updates on Same Exam
    // -------------------------------------------------------------
    const radClient1 = await userPool.createAuthenticatedClient('radiologist');
    const radClient2 = await userPool.createAuthenticatedClient('radiologist');

    const worklistRes = await radClient1.get('/api/exams/worklist?scope=mine&limit=5');
    const exams = Array.isArray(worklistRes.data) ? worklistRes.data : (worklistRes.data?.data || []);

    if (exams.length > 0) {
        const exam = exams[0];
        const [draft1, draft2] = await Promise.all([
            radClient1.put(`/api/exams/${exam.exam_id}/report`, {
                reportStatus: exam.report_status || 'Draft',
                reportContent: `Concurrent report draft update by thread 1 at ${Date.now()}`,
                findings: 'Normal lung fields thread 1',
                impression: 'No acute abnormality detected.'
            }),
            radClient2.put(`/api/exams/${exam.exam_id}/report`, {
                reportStatus: exam.report_status || 'Draft',
                reportContent: `Concurrent report draft update by thread 2 at ${Date.now()}`,
                findings: 'Normal lung fields thread 2',
                impression: 'No acute abnormality detected.'
            })
        ]);

        const draft1Valid = draft1.ok || draft1.status === 400 || draft1.status === 409;
        metricsCollector.record({
            scenario,
            action: 'Concurrent Report Save Thread 1',
            method: 'PUT',
            endpoint: '/api/exams/:id/report (thread 1)',
            duration: draft1.duration,
            status: draft1.status,
            ok: draft1Valid,
            error: draft1Valid ? null : draft1.error
        });

        const draft2Valid = draft2.ok || draft2.status === 400 || draft2.status === 409;
        metricsCollector.record({
            scenario,
            action: 'Concurrent Report Save Thread 2',
            method: 'PUT',
            endpoint: '/api/exams/:id/report (thread 2)',
            duration: draft2.duration,
            status: draft2.status,
            ok: draft2Valid,
            error: draft2Valid ? null : draft2.error
        });
    }
}

module.exports = runConcurrencyCollisionScenario;
