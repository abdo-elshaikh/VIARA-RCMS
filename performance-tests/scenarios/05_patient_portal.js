/**
 * Scenario 05: Patient Portal & Public Case Status Tracking
 * Tests Journey 6 & PF-09 (Patient portal access, records, invoices, appointment requests)
 */

async function runPatientPortalScenario({ vuId, userPool, metricsCollector }) {
    const config = userPool.config;
    const client = await userPool.createAuthenticatedClient('patient');
    const scenario = '05_patient_portal';

    // 1. Public Landing Overview (Lightweight aggregate operational metrics)
    let res = await client.get('/api/public/landing-overview');
    metricsCollector.record({
        scenario,
        action: 'Public Landing Overview',
        method: 'GET',
        endpoint: '/api/public/landing-overview',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 2. Query Patient Profile & Demographics
    res = await client.get('/api/portal/profile');
    metricsCollector.record({
        scenario,
        action: 'Patient Portal Profile',
        method: 'GET',
        endpoint: '/api/portal/profile',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 3. Query Patient Medical Records & Studies
    res = await client.get('/api/portal/records');
    metricsCollector.record({
        scenario,
        action: 'Patient Portal Records',
        method: 'GET',
        endpoint: '/api/portal/records',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 4. Query Patient Invoices & Billing
    res = await client.get('/api/portal/invoices');
    metricsCollector.record({
        scenario,
        action: 'Patient Portal Invoices',
        method: 'GET',
        endpoint: '/api/portal/invoices',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 5. Query Patient Appointment Requests
    res = await client.get('/api/portal/appointment-requests');
    metricsCollector.record({
        scenario,
        action: 'Patient Portal Appointments',
        method: 'GET',
        endpoint: '/api/portal/appointment-requests',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 6. Public Self-Service Case Status Lookup
    res = await client.post('/api/public/case-status', {
        mrn: config.users.patient.mrn,
        accessCode: '123456'
    });

    metricsCollector.record({
        scenario,
        action: 'Public Case Status Lookup',
        method: 'POST',
        endpoint: '/api/public/case-status',
        duration: res.duration,
        status: res.status,
        ok: res.status === 200 || res.status === 404 || res.status === 400,
        error: res.error
    });
}

module.exports = runPatientPortalScenario;
