/**
 * Scenario 07: PACS Orthanc Integration & Imaging Queries
 * Tests Journey 9 & PF-16 (PACS status, storage metrics, modality machines & diagnostics)
 */

async function runPacsImagingScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '07_pacs_imaging';
    const client = await userPool.createAuthenticatedClient('admin');

    // 1. Query Registered Imaging Machines (Modalities)
    let res = await client.get('/api/machines');
    metricsCollector.record({
        scenario,
        action: 'Query Imaging Machines',
        method: 'GET',
        endpoint: '/api/machines',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 2. Query PACS Orthanc System Health & Connection
    res = await client.get('/api/pacs/settings/system');
    metricsCollector.record({
        scenario,
        action: 'Query PACS Orthanc Status',
        method: 'GET',
        endpoint: '/api/pacs/settings/system',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 3. Query PACS Storage Summary & Archive Usage
    res = await client.get('/api/pacs/storage');
    metricsCollector.record({
        scenario,
        action: 'Query PACS Storage Summary',
        method: 'GET',
        endpoint: '/api/pacs/storage',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 4. Query PACS Worklist Preview
    res = await client.get('/api/pacs/worklist/preview');
    metricsCollector.record({
        scenario,
        action: 'Query PACS Worklist Preview',
        method: 'GET',
        endpoint: '/api/pacs/worklist/preview',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 5. Query PACS Study Series & TTFI (Time to First Image Diagnostic Retrieval)
    res = await client.get('/api/pacs/dicom-web/studies?limit=1');
    metricsCollector.record({
        scenario,
        action: 'Query PACS Studies (TTFI Search)',
        method: 'GET',
        endpoint: '/api/pacs/dicom-web/studies',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
        const studyUid = res.data[0]?.['0020000D']?.Value?.[0] || res.data[0]?.studyInstanceUid;
        if (studyUid) {
            const seriesRes = await client.get(`/api/pacs/dicom-web/studies/${studyUid}/series`);
            metricsCollector.record({
                scenario,
                action: 'Query PACS Series (TTFI First Metadata)',
                method: 'GET',
                endpoint: '/api/pacs/dicom-web/studies/:studyUid/series',
                duration: seriesRes.duration,
                status: seriesRes.status,
                ok: seriesRes.ok,
                error: seriesRes.error
            });
        }
    }
}

module.exports = runPacsImagingScenario;
