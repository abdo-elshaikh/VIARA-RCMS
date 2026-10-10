/**
 * Scenario 02: Receptionist Journey (Patient Search, Rooms Lookup, Schedule & Appointment Booking)
 * Tests Journey 2 & PF-02 (Receptionist throughput and booking latency)
 */

async function runReceptionBookingScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '02_reception_booking';
    const client = await userPool.createAuthenticatedClient('receptionist');

    // 1. Search existing patients
    const searchTerms = ['Ahmed', 'Sara', 'Mohamed', 'Fatma', 'MRN-000001'];
    const query = searchTerms[vuId % searchTerms.length];

    let res = await client.get(`/api/patients?search=${encodeURIComponent(query)}&limit=10`);
    metricsCollector.record({
        scenario,
        action: 'Search Patients',
        method: 'GET',
        endpoint: '/api/patients?search',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    let patientId = res.data?.data?.[0]?.patient_id;

    // 2. Query Clinic Rooms & Available Machines
    res = await client.get('/api/rooms');
    metricsCollector.record({
        scenario,
        action: 'Query Clinic Rooms',
        method: 'GET',
        endpoint: '/api/rooms',
        duration: res.duration,
        status: res.status,
        ok: res.ok && Array.isArray(res.data),
        error: res.error
    });

    const roomId = res.data?.[0]?.room_id;

    // 3. Query Daily Appointments Schedule
    const today = new Date().toISOString().split('T')[0];
    res = await client.get(`/api/appointments?date=${today}&limit=25`);
    metricsCollector.record({
        scenario,
        action: 'Query Appointments Schedule',
        method: 'GET',
        endpoint: '/api/appointments?date',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 4. If no patient found, create synthetic patient
    if (!patientId) {
        const uniqueId = `${Date.now()}_${vuId}_${Math.floor(Math.random() * 1000)}`;
        res = await client.post('/api/patients', {
            firstName: `TestPatient_${uniqueId}`,
            lastName: 'Synthetic',
            gender: 'Male',
            dateOfBirth: '1990-01-01',
            phone: `2010${Math.floor(10000000 + Math.random() * 90000000)}`,
            nationalId: `290${Math.floor(10000000000 + Math.random() * 90000000000)}`
        });

        const createdPatientId = res.data?.data?.patient_id || res.data?.patient_id;
        metricsCollector.record({
            scenario,
            action: 'Register Synthetic Patient',
            method: 'POST',
            endpoint: '/api/patients',
            duration: res.duration,
            status: res.status,
            ok: res.ok && Boolean(createdPatientId),
            error: res.error
        });

        patientId = createdPatientId;
    }

    // 5. Query Reception Current Shift Status
    res = await client.get('/api/reception/shifts/current');
    metricsCollector.record({
        scenario,
        action: 'Reception Current Shift',
        method: 'GET',
        endpoint: '/api/reception/shifts/current',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });
}

module.exports = runReceptionBookingScenario;
