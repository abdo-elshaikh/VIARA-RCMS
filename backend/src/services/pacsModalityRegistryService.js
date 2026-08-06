const logger = require('../config/logger');
const settingsService = require('./settingsService');

const buildOrthancHeaders = (username, password, extra = {}) => {
    const headers = { ...extra };
    if (username) {
        headers.Authorization = `Basic ${Buffer.from(`${username}:${password || ''}`).toString('base64')}`;
    }
    return headers;
};

const orthancIdForName = (name) => String(name || 'modality')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();

const getOrthancConnection = async () => {
    const config = {
        url: String(await settingsService.get('orthanc_api_url', process.env.ORTHANC_API_URL || process.env.ORTHANC_URL || 'http://orthanc:8042')).replace(/\/+$/, ''),
        username: await settingsService.get('orthanc_username', process.env.ORTHANC_USERNAME || 'rcms'),
        password: await settingsService.get('orthanc_password', process.env.ORTHANC_PASSWORD)
    };
    if (!config.password) {
        throw new Error('ORTHANC_PASSWORD is required but not set in environment or system_settings');
    }
    return config;
};

const registerModalityInOrthanc = async ({ orthancUrl, username, password, name, aet, ipAddress, port }) => {
    const orthancId = orthancIdForName(name);
    const response = await fetch(`${orthancUrl}/modalities/${orthancId}`, {
        method: 'PUT',
        headers: buildOrthancHeaders(username, password, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ AET: aet, Host: ipAddress, Port: Number(port) })
    });

    if (!response.ok) {
        const responseText = await response.text().catch(() => 'unknown error');
        throw new Error(`Orthanc rejected ${orthancId} registration with HTTP ${response.status}: ${responseText}`);
    }

    return { orthancId };
};

const syncRegisteredModalitiesToOrthanc = async (db) => {
    const { rows } = await db.query(`
        SELECT modality_id, name, aet, ip_address, port
        FROM modalities
        WHERE dicom_synced = TRUE
          AND COALESCE(aet, '') <> ''
          AND COALESCE(ip_address, '') <> ''
          AND port IS NOT NULL
        ORDER BY name
    `);
    if (!rows.length) return { synced: 0, failed: 0 };

    const orthanc = await getOrthancConnection();
    let synced = 0;
    let failed = 0;

    for (const modality of rows) {
        try {
            const result = await registerModalityInOrthanc({
                orthancUrl: orthanc.url,
                username: orthanc.username,
                password: orthanc.password,
                name: modality.name,
                aet: modality.aet,
                ipAddress: modality.ip_address,
                port: modality.port
            });
            synced += 1;
            logger.info('PACS modality registered in Orthanc', {
                modality_id: modality.modality_id,
                name: modality.name,
                aet: modality.aet,
                orthanc_id: result.orthancId
            });
        } catch (error) {
            failed += 1;
            logger.error('PACS modality Orthanc registration failed', {
                modality_id: modality.modality_id,
                name: modality.name,
                aet: modality.aet,
                error: error.message
            });
        }
    }

    return { synced, failed };
};

module.exports = {
    buildOrthancHeaders,
    getOrthancConnection,
    orthancIdForName,
    registerModalityInOrthanc,
    syncRegisteredModalitiesToOrthanc
};
