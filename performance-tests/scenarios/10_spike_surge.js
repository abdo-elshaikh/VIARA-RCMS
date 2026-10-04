/**
 * Scenario 10: Spike & Surge Load Testing (PF-05)
 * Rapid transition from normal load to sudden surge spike, measuring burst handling and recovery.
 */

async function runSpikeSurgeScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '10_spike_surge';

    const role = vuId % 3 === 0 ? 'radiologist' : vuId % 3 === 1 ? 'receptionist' : 'cashier';
    const client = await userPool.createAuthenticatedClient(role);

    // Endpoints aligned with each role's clinical/operational authorization
    let burstEndpoints = [];
    if (role === 'radiologist') {
        burstEndpoints = [
            { method: 'GET', path: '/api/exams/worklist?scope=mine&limit=5', label: 'Worklist' },
            { method: 'GET', path: '/api/queue', label: 'Patient Queue' },
            { method: 'GET', path: '/api/machines', label: 'Machines Modalities' },
            { method: 'GET', path: '/api/rooms/matrix', label: 'Room Matrix' },
            { method: 'GET', path: '/api/exam-types', label: 'Exam Types' }
        ];
    } else if (role === 'receptionist') {
        burstEndpoints = [
            { method: 'GET', path: '/api/patients?limit=5', label: 'Patient Search' },
            { method: 'GET', path: '/api/queue', label: 'Patient Queue' },
            { method: 'GET', path: '/api/machines', label: 'Machines Modalities' },
            { method: 'GET', path: '/api/rooms/matrix', label: 'Room Matrix' },
            { method: 'GET', path: '/api/reception/shifts/current', label: 'Reception Shift' }
        ];
    } else { // cashier
        burstEndpoints = [
            { method: 'GET', path: '/api/invoices?limit=5', label: 'Recent Invoices' },
            { method: 'GET', path: '/api/invoice-summary', label: 'Invoice Summary' },
            { method: 'GET', path: '/api/cashier/shifts/current', label: 'Cashier Shift' },
            { method: 'GET', path: '/api/rooms/matrix', label: 'Room Matrix' }
        ];
    }

    // Fire batch requests concurrently to simulate an abrupt traffic spike
    const burstPromises = burstEndpoints.map(async (ep) => {
        const res = await client.get(ep.path);
        metricsCollector.record({
            scenario,
            action: `Surge Spike - ${ep.label}`,
            method: ep.method,
            endpoint: ep.path,
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });
        return res;
    });

    await Promise.all(burstPromises);
}

module.exports = runSpikeSurgeScenario;
