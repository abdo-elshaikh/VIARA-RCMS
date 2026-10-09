const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const settingsService = require('../services/settingsService');
const { reconcileInstance, reconcileQuarantine, discardQuarantine, writeAudit } = require('../services/pacsReconcileService');
const { enqueueReconciliation } = require('../services/pacsReconciliationQueue');
const { proxyToOrthanc, getOrthancUrl, getOrthancAuthHeader } = require('../services/pacsDicomWebService');
const { uploadFilesToExam, getUploadProgress } = require('../services/pacsUploadService');
const { fetchScheduledWorklist, regenerateWorklists, validateWorklistRow, WORKLIST_DIR } = require('../services/pacsMwlService');
const { tierColdInstances, TIERING_DAYS, BATCH_SIZE, COLD_PREFIX } = require('../services/pacsTieringService');
const { getPacsAiConfig, processQueuedPacsAiJobs } = require('../services/pacsAiAnalysisService');
const { buildOrthancHeaders, registerModalityInOrthanc } = require('../services/pacsModalityRegistryService');
const { decrypt, encrypt } = require('../utils/crypto');
const { triggerEventForRole } = require('../services/notificationJobService');
const {
    safeEqual,
    safeDecrypt,
    getRemoteIp,
    parseStudyUidList,
    hasEffectivePermission,
    hasGlobalPacsAccess,
    hasEmergencyClinicalPacsAccess,
    isValidStudyUid,
    decodeDicomUid,
    getRequestedStudyUids,
    getPathStudyUids,
    getDicomEntityUids,
    resolveDicomWebStudyScope,
    assertStudyAccess,
    assertExamViewerAccess,
    assertExamImagingAccess,
    assertDicomWebStudyScope,
    shouldReturnEmptyScopedStudyBrowse,
    assertPacsAiJobAccess,
    auditPacsAccessDenied
} = require('../services/pacsAccessPolicyService');
const {
    safeFileStem,
    parseOrthancLookupResult,
    fetchOrthancJson,
    lookupOrthancStudyId,
    resolveExportStudyContext,
    auditPacsStudyExport,
    streamOrthancStudyPackage,
    extensionForImage,
    exportRenderedImagesZip
} = require('../services/pacsExportService');

const authorizeExamImagingAccess = (db) => async (req, res, next) => {
    try {
        req.pacsExamContext = await assertExamImagingAccess(db, req.user, req.params.examId);
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Webhook auth middleware for the Orthanc -> VIARA reconcile bridge.
 *
 * This endpoint is machine-to-machine (called by Orthanc's Lua script on the
 * compose-internal network), so it uses a shared secret in X-Pacs-Signature
 * rather than a user JWT. The secret is compared timing-safe. Rotating
 * PACS_WEBHOOK_SECRET revokes access. Mirrors middleware/webhookAuth.js.
 */
const verifyPacsWebhook = (req, res, next) => {
    const configured = process.env.PACS_WEBHOOK_SECRET || '';
    if (!configured) {
        logger.error('PACS webhook rejected: PACS_WEBHOOK_SECRET not configured');
        return next(new AppError('PACS webhook not configured', 503));
    }
    const provided = req.headers['x-pacs-signature'];
    if (!provided || !safeEqual(provided, configured)) {
        return next(new AppError('Invalid PACS webhook signature', 401));
    }
    next();
};

/**
 * POST /api/pacs/webhook — receive one stored-instance notification from Orthanc.
 * Acknowledges immediately and enqueues reconciliation for background processing.
 * This prevents webhook timeouts from Orthanc and decouples reconciliation from the request lifecycle.
 */
const handleWebhook = (db) => async (req, res, next) => {
    try {
        const payload = req.body || {};
        const remoteIp = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || null;

        // Enqueue for async processing — return immediately so Orthanc doesn't retry
        await enqueueReconciliation(db, payload, { remoteIp });

        res.status(200).json({ success: true, message: 'Webhook accepted for async processing' });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/pacs/settings/system
 * Fetches Orthanc system health and statistics.
 */
const getOrthancSystemStatus = () => async (req, res, next) => {
    try {
        const { getOrthancConnection } = require('../services/pacsModalityRegistryService');
        const { url: orthancUrl, username, password } = await getOrthancConnection();

        let authHeader = {};
        if (username) {
            authHeader['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        }

        const headers = { 'Content-Type': 'application/json', ...authHeader };

        const [systemRes, statsRes] = await Promise.all([
            fetch(`${orthancUrl}/system`, { headers }),
            fetch(`${orthancUrl}/statistics`, { headers })
        ]);

        if (!systemRes.ok || !statsRes.ok) {
            return res.status(200).json({
                status: 'unreachable',
                message: 'Orthanc server health check failing. Check REST URL, credentials, or DICOM service status.',
                version: null,
                aet: null,
                databaseVersion: null,
                totalDiskSizeMB: 0,
                countPatients: 0,
                countStudies: 0,
                countSeries: 0,
                countInstances: 0
            });
        }

        const system = await systemRes.json();
        const stats = await statsRes.json();

        res.json({
            version: system.Version,
            aet: system.DicomAet,
            databaseVersion: system.DatabaseVersion,
            totalDiskSizeMB: Math.round(stats.TotalDiskSizeMB || 0),
            countPatients: stats.CountPatients || 0,
            countStudies: stats.CountStudies || 0,
            countSeries: stats.CountSeries || 0,
            countInstances: stats.CountInstances || 0
        });
    } catch (error) {
        logger.warn(`Orthanc system status unavailable: ${error.message}`);
        res.status(200).json({
            status: 'unreachable',
            message: 'PACS is currently unreachable. Check Orthanc service, REST URL, credentials, host networking, and firewall rules.',
            version: null,
            aet: null,
            databaseVersion: null,
            totalDiskSizeMB: 0,
            countPatients: 0,
            countStudies: 0,
            countSeries: 0,
            countInstances: 0
        });
    }
};

/**
 * POST /api/pacs/settings/modalities/:id/sync
 * Pushes modality AET/IP/Port to Orthanc's registered modalities list
 */
const syncModalityToOrthanc = (db) => async (req, res, next) => {
    try {
        await ensureModalityDicomSchema(db);
        const { id } = req.params;

        // The admin form supplies the connection details. Validate and persist
        // them here — earlier this handler ignored the body and pushed whatever
        // (often NULL) was already on the row, so the UI edits were silently lost.
        const aet = String(req.body?.aet ?? '').trim();
        const ipAddress = String(req.body?.ip_address ?? '').trim();
        const port = parseInt(req.body?.port, 10);

        if (!aet) return next(new AppError('Application Entity Title (AET) is required', 400));
        if (!aet || aet.length > 16 || /[\\\x00-\x1f\x7f]/.test(aet)) return next(new AppError('AET must contain 1-16 valid characters', 400));
        if (!isValidDicomHost(ipAddress)) {
            return next(new AppError('A valid modality host or IPv4 address is required', 400));
        }
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return next(new AppError('Port must be between 1 and 65535', 400));
        }

        const { rows } = await db.query('SELECT name, dicom_role FROM modalities WHERE modality_id = $1', [id]);
        if (!rows.length) return next(new AppError('Modality not found', 404));

        const modality = rows[0];
        const orthancId = modality.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        const dicomRole = normalizeDicomRole(req.body?.dicom_role, normalizeDicomRole(modality.dicom_role));

        // Persist the entered details first so they survive even if Orthanc is
        // currently unreachable (dicom_synced stays false until the push works).
        await db.query(
            'UPDATE modalities SET aet = $1, ip_address = $2, port = $3, dicom_role = $4 WHERE modality_id = $5',
            [aet, ipAddress, port, dicomRole, id]
        );

        const { getOrthancConnection } = require('../services/pacsModalityRegistryService');
        const { url: orthancUrl, username, password } = await getOrthancConnection();
        if (!password) {
            throw new Error('ORTHANC_PASSWORD is required but not set');
        }

        try {
            await registerModalityInOrthanc({
                orthancUrl,
                username,
                password,
                name: modality.name,
                aet,
                ipAddress,
                port
            });
        } catch (error) {
            // Details are saved; only the live registration failed.
            await db.query('UPDATE modalities SET dicom_synced = false WHERE modality_id = $1', [id]);
            await writeAudit(db, {
                eventType: 'PACS_MODALITY_SYNC_FAILED',
                actorUserId: req.user?.user_id || null,
                remoteIp: req.headers['x-forwarded-for'] || req.ip || null,
                detail: { modality_id: id, name: modality.name, aet, ip_address: ipAddress, port, dicom_role: dicomRole, orthanc_id: orthancId, error: error.message }
            });
            return next(new AppError(`Connection details saved, but Orthanc rejected the registration: ${error.message}`, 502));
        }

        await db.query('UPDATE modalities SET dicom_synced = true WHERE modality_id = $1', [id]);
        await writeAudit(db, {
            eventType: 'PACS_MODALITY_SYNCED',
            actorUserId: req.user?.user_id || null,
            remoteIp: req.headers['x-forwarded-for'] || req.ip || null,
            detail: { modality_id: id, name: modality.name, aet, ip_address: ipAddress, port, dicom_role: dicomRole, orthanc_id: orthancId }
        });

        res.json({ success: true, message: 'Modality synchronized with PACS' });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/pacs/settings/modalities/:id/echo
 * Sends a DICOM C-ECHO from Orthanc/PACS to a registered modality.
 *
 * This is an outbound destination test for C-MOVE / push-back workflows. It is
 * intentionally not used as proof that the modality can query MWL, because MWL
 * is the opposite direction: modality -> PACS.
 */
const pingModality = (db) => async (req, res, next) => {
    try {
        await ensureModalityDicomSchema(db);
        const { id } = req.params;
        const { rows } = await db.query('SELECT name, aet, ip_address, port, dicom_synced, dicom_role FROM modalities WHERE modality_id = $1', [id]);

        if (!rows.length) return next(new AppError('Modality not found', 404));
        if (!rows[0].dicom_synced) return next(new AppError('Modality must be synced to PACS before testing connection', 400));

        const modality = rows[0];
        const dicomRole = normalizeDicomRole(modality.dicom_role);
        if (dicomRole === 'mwl_client') {
            return res.status(200).json({
                success: true,
                skipped: true,
                message: 'Outbound echo skipped. This device is configured as an MWL/storage client, so PACS does not need to reach it as a DICOM destination.',
                data: {
                    direction: 'modality_to_pacs',
                    source: modality.name,
                    destination: 'PACS',
                    aet: modality.aet,
                    host: modality.ip_address,
                    port: modality.port,
                    endpoint: `${modality.aet}@${modality.ip_address}:${modality.port}`,
                    role: dicomRole,
                    status: 'not_required',
                    workflow: 'Workstation queries MWL and sends studies to PACS',
                    guidance: 'Use workstation-side Echo/MWL refresh to validate this workflow. Change the role to PACS destination only if Orthanc must push or move studies back to this console.'
                }
            });
        }
        const orthancId = modality.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

        const { url: orthancUrl, username, password } = await getOrthancConnection();

        let authHeader = {};
        if (username) {
            authHeader['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        }

        const response = await fetch(`${orthancUrl}/modalities/${orthancId}/echo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader }
        });

        const echoPayload = {
            direction: 'pacs_to_modality',
            source: 'PACS',
            destination: modality.name,
            aet: modality.aet,
            host: modality.ip_address,
            port: modality.port,
            endpoint: `${modality.aet}@${modality.ip_address}:${modality.port}`,
            role: dicomRole,
            workflow: 'Outbound C-ECHO for C-MOVE / push-back destination readiness',
            mwl_note: 'MWL queries are tested from the workstation to PACS and can work even if this outbound echo fails.'
        };

        if (!response.ok) {
            await writeAudit(db, {
                eventType: 'PACS_MODALITY_ECHO_FAILED',
                actorUserId: req.user?.user_id || null,
                remoteIp: req.headers['x-forwarded-for'] || req.ip || null,
                detail: { modality_id: id, name: modality.name, aet: modality.aet, ip_address: modality.ip_address, port: modality.port, direction: echoPayload.direction }
            });
            return res.status(200).json({
                success: false,
                message: 'PACS -> device C-ECHO failed. This device is not reachable as a DICOM destination from PACS.',
                data: {
                    ...echoPayload,
                    status: 'failed',
                    guidance: 'Check the workstation DICOM listener, device IP/port, Windows firewall, and whether this console supports inbound DICOM echo/storage.'
                }
            });
        }

        await writeAudit(db, {
            eventType: 'PACS_MODALITY_ECHO_OK',
            actorUserId: req.user?.user_id || null,
            remoteIp: req.headers['x-forwarded-for'] || req.ip || null,
            detail: { modality_id: id, name: modality.name, aet: modality.aet, ip_address: modality.ip_address, port: modality.port, direction: echoPayload.direction }
        });
        res.status(200).json({
            success: true,
            message: 'PACS -> device C-ECHO successful. The device is reachable as a DICOM destination.',
            data: {
                ...echoPayload,
                status: 'ok',
                guidance: 'This supports destination workflows such as C-MOVE or direct push-back from PACS to the device.'
            }
        });
    } catch (error) {
        next(error);
    }
};

// The only settings the PACS config screen is allowed to read/write. Anything
// else in system_settings (feature flags, unrelated keys) is never exposed here,
// and the write path can never be used to inject arbitrary keys.
const PACS_CONFIG_KEYS = [
    'pacs_server_aet',
    'pacs_server_ip',
    'pacs_server_port',
    'orthanc_api_url',
    'orthanc_username',
    'pacs_is_enabled',
    'pacs_auto_import',
    'pacs_storage_mode',
    'pacs_local_storage_path',
    'pacs_cloud_provider',
    'pacs_s3_bucket',
    'pacs_s3_region',
    'pacs_s3_endpoint',
    'pacs_s3_access_key',
    'pacs_s3_storage_class',
    'pacs_azure_container',
    'pacs_peer_url',
    'pacs_peer_aet',
    'pacs_peer_username',
    'pacs_auto_sync_enabled',
    'pacs_tiering_days',
    'pacs_cold_prefix',
    'pacs_external_viewer_url'
];

const diagnosticCheck = (key, label, status, detail = '', meta = {}) => ({
    key,
    label,
    status,
    detail,
    meta
});

const DICOM_ROLE_VALUES = new Set(['mwl_client', 'destination', 'bidirectional']);
const normalizeDicomRole = (value, fallback = 'mwl_client') => {
    const role = String(value || '').trim();
    return DICOM_ROLE_VALUES.has(role) ? role : fallback;
};

const connectTcp = (host, port, timeoutMs = 2500) => new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done({ ok: true }));
    socket.once('timeout', () => done({ ok: false, error: `Timed out after ${timeoutMs}ms` }));
    socket.once('error', (error) => done({ ok: false, error: error.message }));
    socket.connect(port, host);
});

const getHostFromUrl = (value) => {
    try {
        return new URL(value).hostname;
    } catch {
        return '';
    }
};

const isValidIpv4 = (value) => {
    const input = String(value || '').trim();
    if (!/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(input)) return false;
    return input.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
};

const isValidHostname = (value) => {
    const input = String(value || '').trim();
    if (!input || input.length > 253) return false;
    if (input === 'localhost') return true;
    return input
        .split('.')
        .every((label) => /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
};

const isValidDicomHost = (value) => isValidIpv4(value) || isValidHostname(value);

let modalityDicomSchemaPromise = null;
const ensureModalityDicomSchema = async (db) => {
    if (!modalityDicomSchemaPromise) {
        modalityDicomSchemaPromise = db.query(`
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS aet VARCHAR(50);
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS ip_address VARCHAR(255);
            ALTER TABLE modalities ALTER COLUMN ip_address TYPE VARCHAR(255);
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS port INTEGER;
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS dicom_synced BOOLEAN DEFAULT FALSE;
            ALTER TABLE modalities ADD COLUMN IF NOT EXISTS dicom_role VARCHAR(30) DEFAULT 'mwl_client';
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'modalities'::regclass
                      AND conname IN ('chk_modality_port', 'modalities_port_check')
                ) THEN
                    ALTER TABLE modalities
                        ADD CONSTRAINT chk_modality_port CHECK (port IS NULL OR (port > 0 AND port <= 65535));
                END IF;
            END $$;
        `).catch((error) => {
            modalityDicomSchemaPromise = null;
            throw error;
        });
    }
    return modalityDicomSchemaPromise;
};

/**
 * GET /api/pacs/settings/config
 *
 * Returns only the whitelisted PACS keys. The Orthanc password is NEVER sent to
 * the browser — we return an empty string plus a boolean so the UI can show
 * "a password is set" without leaking it. Submitting a blank password on save
 * leaves the stored one untouched (see updatePacsConfig).
 */
const getPacsConfig = () => async (req, res, next) => {
    try {
        const all = await settingsService.getAll();
        const data = {};
        for (const key of PACS_CONFIG_KEYS) {
            data[key] = all[key] ?? '';
        }
        data.orthanc_password = '';
        data.has_orthanc_password = Boolean(all.orthanc_password);
        data.pacs_s3_secret_key = '';
        data.has_s3_secret = Boolean(all.pacs_s3_secret_key);
        data.pacs_peer_password = '';
        data.has_peer_password = Boolean(all.pacs_peer_password);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const getPacsDiagnostics = (db) => async (req, res, next) => {
    try {
        const all = await settingsService.getAll();
        const pacsAet = String(all.pacs_server_aet || process.env.ORTHANC_AET || '').trim();
        const pacsIp = String(all.pacs_server_ip || '').trim();
        const pacsPort = parseInt(all.pacs_server_port || process.env.PACS_DICOM_PORT || 4242, 10);
        const orthancUrl = String(all.orthanc_api_url || process.env.ORTHANC_API_URL || process.env.ORTHANC_URL || 'http://orthanc:8042').replace(/\/+$/, '');
        const orthancDicomHost = process.env.ORTHANC_DICOM_HOST || getHostFromUrl(orthancUrl);
        const orthancUsername = String(all.orthanc_username || process.env.ORTHANC_USERNAME || '').trim();
        const orthancPassword = safeDecrypt(all.orthanc_password) || process.env.ORTHANC_PASSWORD || '';
        const headers = buildOrthancHeaders(orthancUsername, orthancPassword);
        const checks = [];
        const network = {
            configured_dicom_host: pacsIp,
            configured_dicom_port: pacsPort,
            configured_dicom_endpoint: pacsIp ? `${pacsIp}:${pacsPort}` : '',
            orthanc_rest_url: orthancUrl,
            orthanc_rest_host: getHostFromUrl(orthancUrl),
            suggested_dicom_host: orthancDicomHost || '127.0.0.1',
            suggested_dicom_endpoint: `${orthancDicomHost || '127.0.0.1'}:${pacsPort}`,
            mode: pacsIp && pacsIp === orthancDicomHost ? 'local_or_same_host' : 'split_or_lan',
            guidance: pacsIp && pacsIp !== orthancDicomHost
                ? `REST is configured at ${orthancDicomHost || 'the Orthanc API host'}, while DICOM is configured at ${pacsIp}. Keep this only when Orthanc DICOM is exposed on that LAN/VPN address.`
                : 'REST and DICOM appear to target the same host. This is ideal for local or single-server deployments.'
        };

        checks.push(diagnosticCheck(
            'server_identity',
            'PACS server identity',
            pacsAet && pacsIp && Number.isInteger(pacsPort) && pacsPort > 0 && pacsPort <= 65535 ? 'ok' : 'warning',
            pacsAet && pacsIp ? `${pacsAet} at ${pacsIp}:${pacsPort}` : 'PACS AET, LAN IP, or DICOM port is incomplete.',
            { aet: pacsAet, host: pacsIp, port: pacsPort }
        ));

        checks.push(diagnosticCheck(
            'network_mode',
            'Network mode',
            !pacsIp ? 'warning' : pacsIp !== orthancDicomHost && ['127.0.0.1', 'localhost'].includes(orthancDicomHost) ? 'warning' : 'ok',
            !pacsIp
                ? 'No DICOM host is configured.'
                : pacsIp !== orthancDicomHost && ['127.0.0.1', 'localhost'].includes(orthancDicomHost)
                    ? `Orthanc REST is local (${orthancDicomHost}) but DICOM is configured for ${pacsIp}. Use the local host for development, or expose Orthanc DICOM on the LAN address for scanner access.`
                    : network.guidance,
            network
        ));

        try {
            const response = await fetch(`${orthancUrl}/system`, { headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const system = await response.json();
            checks.push(diagnosticCheck('orthanc_api', 'Orthanc REST API', 'ok', `Orthanc ${system.Version || 'reachable'}`, {
                url: orthancUrl,
                aet: system.DicomAet
            }));
            if (system.DicomAet && pacsAet && String(system.DicomAet) !== pacsAet) {
                checks.push(diagnosticCheck(
                    'aet_alignment',
                    'AET alignment',
                    'warning',
                    `VIARA is configured as ${pacsAet}, but Orthanc reports ${system.DicomAet}. Modalities should use ${system.DicomAet}.`,
                    { configured_aet: pacsAet, orthanc_aet: system.DicomAet }
                ));
            }
        } catch (error) {
            checks.push(diagnosticCheck('orthanc_api', 'Orthanc REST API', 'error', error.message, { url: orthancUrl }));
        }

        try {
            const response = await fetch(`${orthancUrl}/statistics`, { headers });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const stats = await response.json();
            checks.push(diagnosticCheck('storage', 'Archive storage', 'ok', `${Math.round(stats.TotalDiskSizeMB || 0)} MB indexed`, {
                studies: stats.CountStudies || 0,
                series: stats.CountSeries || 0,
                instances: stats.CountInstances || 0,
                totalDiskSizeMB: Math.round(stats.TotalDiskSizeMB || 0)
            }));
        } catch (error) {
            checks.push(diagnosticCheck('storage', 'Archive storage', 'warning', `Could not read Orthanc statistics: ${error.message}`));
        }

        try {
            const response = await fetch(`${orthancUrl}/dicom-web/studies?limit=1`, {
                headers: buildOrthancHeaders(orthancUsername, orthancPassword, { Accept: 'application/dicom+json, application/json' })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            checks.push(diagnosticCheck('dicomweb', 'DICOMweb QIDO', 'ok', 'DICOMweb plugin responded to a study query.'));
        } catch (error) {
            checks.push(diagnosticCheck('dicomweb', 'DICOMweb QIDO', 'error', error.message));
        }

        if (pacsIp && Number.isInteger(pacsPort)) {
            const tcp = await connectTcp(pacsIp, pacsPort);
            checks.push(diagnosticCheck(
                'dicom_listener',
                'DICOM listener',
                tcp.ok ? 'ok' : 'error',
                tcp.ok
                    ? `Configured scanner endpoint ${pacsIp}:${pacsPort} accepts TCP connections from the backend.`
                    : `${tcp.error}. If this is local development, set PACS Server IP to ${orthancDicomHost || '127.0.0.1'}; if scanners must connect from LAN, expose Orthanc DICOM on the server LAN IP/VPN.`,
                { host: pacsIp, port: pacsPort }
            ));
        } else {
            checks.push(diagnosticCheck('dicom_listener', 'DICOM listener', 'warning', 'No valid PACS LAN IP/port configured.'));
        }

        if (orthancDicomHost && Number.isInteger(pacsPort) && orthancDicomHost !== pacsIp) {
            const internalTcp = await connectTcp(orthancDicomHost, pacsPort);
            checks.push(diagnosticCheck(
                'orthanc_dicom_endpoint',
                'Orthanc DICOM endpoint',
                internalTcp.ok ? 'ok' : 'warning',
                internalTcp.ok
                    ? `Backend can reach Orthanc DICOM at ${orthancDicomHost}:${pacsPort}.`
                    : `Backend could not reach ${orthancDicomHost}:${pacsPort}: ${internalTcp.error}`,
                { host: orthancDicomHost, port: pacsPort }
            ));
        }

        checks.push(diagnosticCheck(
            'webhook_secret',
            'Webhook secret',
            process.env.PACS_WEBHOOK_SECRET ? 'ok' : 'error',
            process.env.PACS_WEBHOOK_SECRET ? 'Machine webhook authentication is configured.' : 'PACS_WEBHOOK_SECRET is missing.'
        ));

        try {
            const { rows } = await db.query(
                `SELECT
                    (SELECT COUNT(*)::int FROM pacs_series) AS series_count,
                    (SELECT COUNT(*)::int FROM pacs_instances) AS instance_count,
                    (SELECT COUNT(*)::int FROM pacs_quarantine_studies WHERE status = 'Pending') AS pending_quarantine`
            );
            checks.push(diagnosticCheck('ris_index', 'RIS imaging index', 'ok', 'PACS index tables are reachable.', rows[0] || {}));
        } catch (error) {
            checks.push(diagnosticCheck('ris_index', 'RIS imaging index', 'error', error.message));
        }

        const hasError = checks.some((check) => check.status === 'error');
        const hasWarning = checks.some((check) => check.status === 'warning');
        res.json({
            status: hasError ? 'error' : hasWarning ? 'warning' : 'ok',
            generated_at: new Date().toISOString(),
            network,
            checks
        });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/pacs/settings/config
 *
 * Validates and persists only the whitelisted keys. The password is only
 * overwritten when a non-empty value is supplied, so the UI can safely omit it.
 */
const updatePacsConfig = (db) => async (req, res, next) => {
    try {
        const body = req.body || {};
        const updates = {};

        if (body.pacs_server_aet !== undefined) {
            const aet = String(body.pacs_server_aet).trim();
            if (!aet || aet.length > 16 || /[\\\x00-\x1f\x7f]/.test(aet)) return next(new AppError('AET must contain 1-16 valid characters', 400));
            updates.pacs_server_aet = aet;
        }
        if (body.pacs_server_ip !== undefined) {
            const host = String(body.pacs_server_ip).trim();
            if (host && !isValidDicomHost(host)) {
                return next(new AppError('A valid DICOM host or IPv4 address is required', 400));
            }
            updates.pacs_server_ip = host;
        }
        if (body.pacs_server_port !== undefined) {
            const port = parseInt(body.pacs_server_port, 10);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                return next(new AppError('Port must be between 1 and 65535', 400));
            }
            updates.pacs_server_port = String(port);
        }
        if (body.orthanc_api_url !== undefined) {
            const url = String(body.orthanc_api_url).trim();
            try {
                // eslint-disable-next-line no-new
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid protocol or embedded credentials');
            } catch {
                return next(new AppError('A valid Orthanc API URL is required', 400));
            }
            updates.orthanc_api_url = url;
        }
        if (body.orthanc_username !== undefined) {
            updates.orthanc_username = String(body.orthanc_username).trim();
        }
        if (body.is_pacs_enabled !== undefined) {
            updates.pacs_is_enabled = String(body.is_pacs_enabled === true);
        }
        if (body.auto_import_dicom !== undefined) {
            updates.pacs_auto_import = String(body.auto_import_dicom === true);
        }
        // Only overwrite the password when a real value is provided.
        if (body.orthanc_password !== undefined && String(body.orthanc_password).length > 0) {
            updates.orthanc_password = encrypt(String(body.orthanc_password));
        }

        // Storage & Cloud Sync Configuration
        if (body.pacs_storage_mode !== undefined) {
            const mode = String(body.pacs_storage_mode).trim().toLowerCase();
            if (['local', 'cloud', 'hybrid'].includes(mode)) {
                updates.pacs_storage_mode = mode;
            }
        }
        if (body.pacs_local_storage_path !== undefined) {
            updates.pacs_local_storage_path = String(body.pacs_local_storage_path).trim().slice(0, 500);
        }
        if (body.pacs_cloud_provider !== undefined) {
            const provider = String(body.pacs_cloud_provider).trim().toLowerCase();
            if (['s3', 'wasabi', 'r2', 'azure', 'minio', 'gcs'].includes(provider)) {
                updates.pacs_cloud_provider = provider;
            }
        }
        if (body.pacs_s3_bucket !== undefined) updates.pacs_s3_bucket = String(body.pacs_s3_bucket).trim().slice(0, 100);
        if (body.pacs_s3_region !== undefined) updates.pacs_s3_region = String(body.pacs_s3_region).trim().slice(0, 50);
        if (body.pacs_s3_endpoint !== undefined) updates.pacs_s3_endpoint = String(body.pacs_s3_endpoint).trim().slice(0, 255);
        if (body.pacs_s3_access_key !== undefined) updates.pacs_s3_access_key = String(body.pacs_s3_access_key).trim().slice(0, 150);
        if (body.pacs_s3_storage_class !== undefined) updates.pacs_s3_storage_class = String(body.pacs_s3_storage_class).trim().slice(0, 50);
        if (body.pacs_s3_secret_key !== undefined && String(body.pacs_s3_secret_key).length > 0) {
            updates.pacs_s3_secret_key = encrypt(String(body.pacs_s3_secret_key));
        }
        if (body.pacs_azure_container !== undefined) updates.pacs_azure_container = String(body.pacs_azure_container).trim().slice(0, 100);
        if (body.pacs_peer_url !== undefined) updates.pacs_peer_url = String(body.pacs_peer_url).trim().slice(0, 255);
        if (body.pacs_peer_aet !== undefined) updates.pacs_peer_aet = String(body.pacs_peer_aet).trim().slice(0, 50);
        if (body.pacs_peer_username !== undefined) updates.pacs_peer_username = String(body.pacs_peer_username).trim().slice(0, 100);
        if (body.pacs_peer_password !== undefined && String(body.pacs_peer_password).length > 0) {
            updates.pacs_peer_password = encrypt(String(body.pacs_peer_password));
        }
        if (body.pacs_auto_sync_enabled !== undefined) {
            updates.pacs_auto_sync_enabled = String(body.pacs_auto_sync_enabled === true);
        }
        if (body.pacs_tiering_days !== undefined) {
            const days = parseInt(body.pacs_tiering_days, 10);
            if (Number.isInteger(days) && days > 0) {
                updates.pacs_tiering_days = String(days);
            }
        }
        if (body.pacs_cold_prefix !== undefined) {
            updates.pacs_cold_prefix = String(body.pacs_cold_prefix).trim().slice(0, 255);
        }
        if (body.pacs_external_viewer_url !== undefined) {
            updates.pacs_external_viewer_url = String(body.pacs_external_viewer_url).trim().slice(0, 500);
        }

        if (!Object.keys(updates).length) {
            return next(new AppError('No valid PACS configuration fields supplied', 400));
        }

        await settingsService.updateAll(updates);
        await writeAudit(db, {
            eventType: 'PACS_CONFIG_UPDATED',
            actorUserId: req.user?.user_id || null,
            remoteIp: req.headers['x-forwarded-for'] || req.ip || null,
            detail: {
                changed_keys: Object.keys(updates),
                pacs_server_aet: updates.pacs_server_aet,
                pacs_server_ip: updates.pacs_server_ip,
                pacs_server_port: updates.pacs_server_port,
                orthanc_api_url: updates.orthanc_api_url,
                password_changed: Object.prototype.hasOwnProperty.call(updates, 'orthanc_password')
            }
        });

        triggerEventForRole(db, 'PACS_CONFIG_UPDATED', 'Radiologist', {
            priority: 'Warning',
            variables: {
                updated_by: req.user?.full_name || req.user?.email || 'Unknown',
                changes: Object.keys(updates).join(', ')
            }
        }).catch(() => { });

        triggerEventForRole(db, 'PACS_CONFIG_UPDATED', 'Technician', {
            priority: 'Warning',
            variables: {
                updated_by: req.user?.full_name || req.user?.email || 'Unknown',
                changes: Object.keys(updates).join(', ')
            }
        }).catch(() => { });

        triggerEventForRole(db, 'PACS_CONFIG_UPDATED', 'Admin', {
            priority: 'Warning',
            variables: {
                updated_by: req.user?.full_name || req.user?.email || 'Unknown',
                changes: Object.keys(updates).join(', ')
            }
        }).catch(() => { });

        res.json({ success: true, message: 'PACS configuration updated successfully' });
    } catch (error) {
        next(error);
    }
};

const getPacsAudit = (db) => async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const eventType = String(req.query.eventType || '').trim();
        const values = [];
        const where = [];

        if (eventType) {
            values.push(eventType);
            where.push(`event_type = $${values.length}`);
        }

        values.push(limit);
        const { rows } = await db.query(
            `SELECT audit_id, event_type, actor_user_id, accession_number,
                    study_instance_uid, remote_ip, detail, created_at
             FROM pacs_audit
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY created_at DESC
             LIMIT $${values.length}`,
            values
        );

        res.json(rows);
    } catch (error) {
        next(error);
    }
};

const PACS_WORKLIST_PREVIEW_CACHE_TTL_MS = 3000;
const pacsWorklistPreviewCache = new Map();

const getPacsWorklistPreview = (db) => async (req, res, next) => {
    try {
        const date = String(req.query.date || '').trim() || null;
        const modalityId = String(req.query.modalityId || '').trim() || null;
        const includeInvalid = String(req.query.includeInvalid || 'true').toLowerCase() !== 'false';
        const cacheKey = `${date || ''}:${modalityId || ''}:${includeInvalid}`;
        const cached = pacsWorklistPreviewCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < PACS_WORKLIST_PREVIEW_CACHE_TTL_MS)) {
            return res.json(cached.data);
        }

        const rows = await fetchScheduledWorklist(db, { date, modalityId, includeInvalid, autoProvision: false });
        const items = rows.map((row) => {
            const validation = validateWorklistRow(row);
            return {
                exam_id: row.exam_id,
                order_number: row.order_number,
                mrn: row.mrn,
                scheduled_datetime: row.scheduled_datetime,
                procedure_name: row.procedure_name,
                procedure_code: row.procedure_code,
                body_part: row.body_part,
                modality_type: row.modality_type,
                dicom_modality: validation.dicom_modality,
                valid: validation.valid,
                warnings: validation.warnings
            };
        });

        const responsePayload = {
            date: date || new Date().toISOString().slice(0, 10),
            worklist_dir: WORKLIST_DIR,
            total: items.length,
            valid: items.filter((item) => item.valid).length,
            warnings: items.filter((item) => !item.valid).length,
            items
        };

        pacsWorklistPreviewCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });
        if (pacsWorklistPreviewCache.size > 100) {
            const oldest = pacsWorklistPreviewCache.keys().next().value;
            pacsWorklistPreviewCache.delete(oldest);
        }

        res.json(responsePayload);
    } catch (error) {
        next(error);
    }
};

const refreshPacsWorklist = (db) => async (req, res, next) => {
    try {
        pacsWorklistPreviewCache.clear();
        const result = await regenerateWorklists(db);
        await writeAudit(db, {
            eventType: 'PACS_MWL_REGENERATED',
            actorUserId: req.user?.user_id || null,
            remoteIp: req.headers['x-forwarded-for'] || req.ip || null,
            detail: { ...result, worklist_dir: WORKLIST_DIR }
        });
        res.json({ success: true, worklist_dir: WORKLIST_DIR, ...result });
    } catch (error) {
        next(error);
    }
};

const getPacsStorageSummary = (db) => async (req, res, next) => {
    try {
        const tieringEnabled = String(process.env.PACS_TIERING_ENABLED || 'true').toLowerCase() !== 'false';
        const { rows: tierRows } = await db.query(
            `SELECT storage_tier, COUNT(*)::int AS instances,
                    COALESCE(SUM(file_size_bytes), 0)::bigint AS bytes,
                    COUNT(*) FILTER (WHERE file_size_bytes IS NULL)::int AS unknown_size_instances,
                    MIN(created_at) AS oldest_instance_at,
                    MAX(created_at) AS newest_instance_at
             FROM pacs_instances
             GROUP BY storage_tier`
        );
        const { rows: indexRows } = await db.query(
            `SELECT
                (SELECT COUNT(DISTINCT study_instance_uid)::int FROM pacs_series) AS study_count,
                (SELECT COUNT(*)::int FROM pacs_series) AS series_count,
                (SELECT COUNT(*)::int FROM pacs_instances) AS instance_count,
                (SELECT COUNT(*)::int FROM pacs_quarantine_studies WHERE status = 'Pending') AS pending_quarantine,
                (SELECT COUNT(*)::int FROM examinations WHERE images_available = TRUE) AS exams_with_images`
        );
        const { rows: eligibilityRows } = await db.query(
            `SELECT COUNT(*)::int AS eligible_instances,
                    COALESCE(SUM(file_size_bytes), 0)::bigint AS eligible_bytes,
                    MIN(created_at) AS oldest_eligible_at
             FROM pacs_instances
             WHERE storage_tier = 'hot'
               AND created_at < (CURRENT_TIMESTAMP - ($1 || ' days')::interval)`,
            [TIERING_DAYS]
        );
        const { rows: auditRows } = await db.query(
            `SELECT event_type, detail, created_at
             FROM pacs_audit
             WHERE event_type IN ('PACS_TIERING_TRIGGERED', 'STUDY_EXPORTED')
               AND (
                    event_type = 'PACS_TIERING_TRIGGERED'
                    OR detail->>'action' = 'tier_to_cold'
               )
             ORDER BY created_at DESC
             LIMIT 1`
        );

        let orthanc = null;
        let orthancError = null;
        try {
            const all = await settingsService.getAll();
            const orthancUrl = String(all.orthanc_api_url || process.env.ORTHANC_API_URL || process.env.ORTHANC_URL || 'http://orthanc:8042').replace(/\/+$/, '');
            const headers = buildOrthancHeaders(
                String(all.orthanc_username || process.env.ORTHANC_USERNAME || '').trim(),
                safeDecrypt(all.orthanc_password) || process.env.ORTHANC_PASSWORD || ''
            );
            const response = await fetch(`${orthancUrl}/statistics`, { headers, signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const stats = await response.json();
            orthanc = {
                studies: stats.CountStudies || 0,
                series: stats.CountSeries || 0,
                instances: stats.CountInstances || 0,
                totalDiskSizeMB: Math.round(stats.TotalDiskSizeMB || 0),
                totalUncompressedSizeMB: Math.round(stats.TotalUncompressedSizeMB || 0)
            };
        } catch (error) {
            orthancError = error.message;
        }

        const tiers = { hot: null, warm: null, cold: null };
        for (const row of tierRows) {
            tiers[row.storage_tier] = {
                instances: row.instances,
                bytes: Number(row.bytes || 0),
                unknown_size_instances: Number(row.unknown_size_instances || 0),
                oldest_instance_at: row.oldest_instance_at,
                newest_instance_at: row.newest_instance_at
            };
        }
        for (const tier of Object.keys(tiers)) {
            if (!tiers[tier]) tiers[tier] = { instances: 0, bytes: 0, oldest_instance_at: null, newest_instance_at: null };
        }
        const indexedBytes = Object.values(tiers).reduce((sum, tier) => sum + Number(tier.bytes || 0), 0);
        const unknownSizeInstances = Object.values(tiers).reduce((sum, tier) => sum + Number(tier.unknown_size_instances || 0), 0);
        const indexedInstances = Number(indexRows[0]?.instance_count || 0);
        const orthancInstances = Number(orthanc?.instances || 0);
        const instanceGap = orthanc ? orthancInstances - indexedInstances : null;
        const eligible = eligibilityRows[0] || {};
        const lastTiering = auditRows[0] || null;
        const pendingQuarantine = Number(indexRows[0]?.pending_quarantine || 0);
        const storageStatus = orthancError
            ? 'warning'
            : pendingQuarantine > 0 || Number(eligible.eligible_instances || 0) > 0 || Number(instanceGap || 0) !== 0
                ? 'attention'
                : 'ok';

        res.json({
            generated_at: new Date().toISOString(),
            status: storageStatus,
            tiering: {
                enabled: tieringEnabled,
                threshold_days: TIERING_DAYS,
                batch_size: BATCH_SIZE,
                cold_prefix: COLD_PREFIX,
                eligible_instances: Number(eligible.eligible_instances || 0),
                eligible_bytes: Number(eligible.eligible_bytes || 0),
                oldest_eligible_at: eligible.oldest_eligible_at || null,
                last_run_at: lastTiering?.created_at || null,
                last_result: lastTiering?.detail || null,
                physical_archiver: Boolean(process.env.PACS_COLD_STORAGE_DIR),
                archive_mode: 'verified-encrypted-copy',
                hot_eviction: false
            },
            index: indexRows[0] || {},
            totals: {
                indexed_bytes: indexedBytes,
                unknown_size_instances: unknownSizeInstances,
                indexed_instances: indexedInstances,
                orthanc_instances: orthancInstances,
                instance_gap: instanceGap
            },
            tiers,
            orthanc,
            orthanc_error: orthancError
        });
    } catch (error) {
        next(error);
    }
};

const runPacsTiering = (db) => async (req, res, next) => {
    try {
        if (String(process.env.PACS_TIERING_ENABLED || 'true').toLowerCase() === 'false') {
            return next(new AppError('PACS tiering is disabled by configuration', 409));
        }
        const result = await tierColdInstances(db);
        await writeAudit(db, {
            eventType: 'PACS_TIERING_TRIGGERED',
            actorUserId: req.user?.user_id || null,
            remoteIp: req.headers['x-forwarded-for'] || req.ip || null,
            detail: { ...result, threshold_days: TIERING_DAYS }
        });
        res.json({ success: true, threshold_days: TIERING_DAYS, ...result });
    } catch (error) {
        next(error);
    }
};

const runPacsAiAnalysisQueue = (db) => async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.body?.limit, 10) || 2, 1), 10);
        const result = await processQueuedPacsAiJobs(db, limit);
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

const getPacsRequests = (db) => async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const { rows } = await db.query(
            `WITH recent_audit AS (
                SELECT 'audit'::text AS source, audit_id::text AS id, event_type AS type,
                       accession_number, study_instance_uid, remote_ip, detail, created_at,
                       NULL::text AS status
                FROM pacs_audit
                WHERE event_type IN (
                    'INSTANCE_RECEIVED', 'STUDY_IMPORTED', 'STUDY_QUARANTINED',
                    'IMAGE_VIEW', 'RECONCILE_ACTION', 'PACS_MODALITY_SYNCED',
                    'PACS_MODALITY_SYNC_FAILED', 'PACS_MODALITY_ECHO_OK',
                    'PACS_MODALITY_ECHO_FAILED', 'PACS_CONFIG_UPDATED',
                    'PACS_MWL_REGENERATED', 'PACS_TIERING_TRIGGERED',
                    'STUDY_EXPORTED', 'AI_ANALYSIS_REQUESTED',
                    'AI_ANALYSIS_COMPLETED', 'AI_ANALYSIS_FAILED'
                )
                ORDER BY created_at DESC
                LIMIT $1
             ),
             quarantine AS (
                SELECT 'quarantine'::text AS source, quarantine_id::text AS id,
                       quarantine_reason AS type, raw_accession_number AS accession_number,
                       study_instance_uid, NULL::text AS remote_ip,
                       jsonb_build_object(
                           'patient_id', raw_patient_id,
                           'patient_name', raw_patient_name,
                           'modality', modality,
                           'orthanc_study_id', orthanc_study_id
                       ) AS detail,
                       created_at, status
                FROM pacs_quarantine_studies
                ORDER BY created_at DESC
                LIMIT $1
             )
             SELECT * FROM (
                SELECT * FROM recent_audit
                UNION ALL
                SELECT * FROM quarantine
             ) stream
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );

        res.json(rows);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/pacs/exams/:examId/imaging — imaging status for a single exam, used
 * by the report page to enable/disable the "View Images" button.
 */
const getExamImagingStatus = (db) => async (req, res, next) => {
    try {
        const { examId } = req.params;
        const exam = req.pacsExamContext || await assertExamImagingAccess(db, req.user, examId);
        const { rows: seriesRows } = await db.query(
            `SELECT ps.series_instance_uid, ps.series_number, ps.modality,
                    ps.series_description, ps.body_part_examined,
                    COUNT(pi.sop_instance_uid)::int AS instance_count
             FROM pacs_series ps
             LEFT JOIN pacs_instances pi ON pi.series_instance_uid = ps.series_instance_uid
             WHERE ps.study_instance_uid = $1
             GROUP BY ps.series_instance_uid
             ORDER BY ps.series_number ASC NULLS LAST`,
            [exam.study_instance_uid]
        );

        res.json({ ...exam, series: seriesRows });
    } catch (error) {
        await auditPacsAccessDenied(db, req, error, { exam_id: req.params?.examId });
        next(error);
    }
};

const getExamAiAnalysisJobs = (db) => async (req, res, next) => {
    try {
        const { examId } = req.params;
        await assertExamImagingAccess(db, req.user, examId);

        const { rows } = await db.query(
            `SELECT j.job_id, j.exam_id, j.study_instance_uid, j.orthanc_study_id,
                    j.analysis_type, j.priority, j.status, j.provider, j.model,
                    j.model_version, j.result_summary, j.result_payload,
                    j.error_message, j.radiologist_status, j.started_at,
                    j.completed_at, j.created_at, j.updated_at,
                    requester.full_name AS requested_by_name,
                    reviewer.full_name AS reviewed_by_name
             FROM pacs_ai_analysis_jobs j
             LEFT JOIN users requester ON requester.user_id = j.requested_by
             LEFT JOIN users reviewer ON reviewer.user_id = j.reviewed_by
             WHERE j.exam_id = $1
             ORDER BY j.created_at DESC
             LIMIT 20`,
            [examId]
        );

        const config = await getPacsAiConfig();
        res.set('Cache-Control', 'no-store');
        res.json({
            jobs: rows.map((row) => ({
                ...row,
                provider: row.provider || config.provider || null,
                model: row.model || config.model || null,
                model_version: row.model_version || config.modelVersion || null
            }))
        });
    } catch (error) {
        await auditPacsAccessDenied(db, req, error, { exam_id: req.params?.examId, action: 'list_ai_jobs' });
        next(error);
    }
};

const getPacsAiAnalysisQueue = (db) => async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 80, 1), 200);
        const status = String(req.query.status || '').trim();
        const values = [];
        const where = [];

        if (status && ['Queued', 'Running', 'Completed', 'Failed', 'Canceled'].includes(status)) {
            values.push(status);
            where.push(`j.status = $${values.length}`);
        }

        values.push(limit);
        const { rows } = await db.query(
            `SELECT j.job_id, j.exam_id, j.study_instance_uid, j.orthanc_study_id,
                    j.analysis_type, j.priority, j.status, j.provider, j.model,
                    j.model_version, j.result_summary, j.error_message,
                    j.radiologist_status, j.started_at, j.completed_at,
                    j.created_at, j.updated_at,
                    e.order_number, e.image_count, e.images_available,
                    et.name AS exam_type_name,
                    m.name AS modality_name, m.type AS modality_type,
                    p.mrn,
                    requester.full_name AS requested_by_name,
                    reviewer.full_name AS reviewed_by_name
             FROM pacs_ai_analysis_jobs j
             JOIN examinations e ON e.exam_id = j.exam_id
             JOIN patients p ON p.patient_id = e.patient_id
             LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
             LEFT JOIN modalities m ON m.modality_id = e.modality_id
             LEFT JOIN users requester ON requester.user_id = j.requested_by
             LEFT JOIN users reviewer ON reviewer.user_id = j.reviewed_by
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY
                CASE j.status
                    WHEN 'Running' THEN 1
                    WHEN 'Queued' THEN 2
                    WHEN 'Failed' THEN 3
                    ELSE 4
                END,
                CASE j.priority
                    WHEN 'Emergency' THEN 1
                    WHEN 'Urgent' THEN 2
                    ELSE 3
                END,
                j.created_at DESC
             LIMIT $${values.length}`,
            values
        );

        const totalsResult = await db.query(
            `SELECT status, COUNT(*)::int AS count
             FROM pacs_ai_analysis_jobs
             GROUP BY status`
        );
        const config = await getPacsAiConfig();
        const processorStatus = !config.enabled
            ? 'disabled'
            : !config.workerUrl
                ? 'missing_worker_url'
                : 'ready';
        const processorMessage = processorStatus === 'disabled'
            ? 'PACS image AI is disabled. Enable it in Settings > AI providers.'
            : processorStatus === 'missing_worker_url'
                ? 'PACS AI queue is waiting for a worker URL. Jobs are saved but cannot process automatically.'
                : 'PACS AI worker is configured. Queued jobs will be dispatched by the background processor.';

        res.json({
            jobs: rows.map((row) => ({
                ...row,
                provider: row.provider || config.provider || null,
                model: row.model || config.model || null,
                model_version: row.model_version || config.modelVersion || null
            })),
            processor: {
                status: processorStatus,
                message: processorMessage,
                enabled: Boolean(config.enabled),
                workerConfigured: Boolean(config.workerUrl),
                workerUrl: config.workerUrl || null,
                provider: config.provider || null,
                model: config.model || null,
                modelVersion: config.modelVersion || null,
                intervalMs: Number(process.env.PACS_AI_QUEUE_INTERVAL_MS || 30 * 1000),
                batchSize: Number(process.env.PACS_AI_QUEUE_BATCH_SIZE || 2)
            },
            totals: totalsResult.rows.reduce((acc, row) => {
                acc[row.status] = row.count;
                return acc;
            }, {})
        });
    } catch (error) {
        next(error);
    }
};

const requestExamAiAnalysis = (db) => async (req, res, next) => {
    try {
        const { examId } = req.params;
        const analysisType = String(req.body?.analysisType || 'preliminary_image_review').trim();
        const allowedTypes = new Set(['preliminary_image_review', 'triage_assist', 'quality_check']);
        if (!allowedTypes.has(analysisType)) {
            return next(new AppError('Unsupported AI analysis type', 400));
        }

        const exam = await assertExamImagingAccess(db, req.user, examId);
        if (!exam.study_instance_uid || !exam.images_available || Number(exam.image_count || 0) <= 0) {
            return next(new AppError('This exam has no linked DICOM images to analyze', 409));
        }

        const priority = ['Emergency', 'Urgent'].includes(exam.priority) ? exam.priority : 'Routine';
        const { rows: activeRows } = await db.query(
            `SELECT job_id, status, created_at
             FROM pacs_ai_analysis_jobs
             WHERE exam_id = $1
               AND analysis_type = $2
               AND status IN ('Queued', 'Running')
             ORDER BY created_at DESC
             LIMIT 1`,
            [examId, analysisType]
        );

        if (activeRows.length) {
            return res.status(200).json({ success: true, existing: true, job: activeRows[0] });
        }

        const config = await getPacsAiConfig();
        const CLOUD_PACS_PROVIDERS = new Set(['cloud-gemini', 'cloud-openrouter', 'cloud-openai', 'cloud-custom']);
        const isCloud = CLOUD_PACS_PROVIDERS.has(config.provider);
        const willProcessAutomatically = Boolean(
            config.enabled && (isCloud
                ? (config.provider === 'cloud-custom' ? config.baseUrl : config.apiKey)
                : config.workerUrl)
        );
        const { rows } = await db.query(
            `INSERT INTO pacs_ai_analysis_jobs (
                exam_id, study_instance_uid, orthanc_study_id, requested_by,
                analysis_type, priority, provider, model, model_version, result_payload
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
             RETURNING job_id, exam_id, study_instance_uid, analysis_type, priority,
                       status, provider, model, model_version, radiologist_status,
                       created_at, updated_at`,
            [
                examId,
                exam.study_instance_uid,
                exam.orthanc_study_id || null,
                req.user?.user_id || null,
                analysisType,
                priority,
                config.provider,
                config.model,
                config.modelVersion || '',
                JSON.stringify({
                    state: 'queued',
                    message: willProcessAutomatically
                        ? 'Image AI job queued for asynchronous processing.'
                        : isCloud
                            ? 'PACS image AI is in queue-only mode. Add the selected cloud provider API key to process jobs automatically.'
                            : 'PACS image AI is in queue-only mode. Add a worker URL to process jobs automatically.',
                    exam: {
                        orderNumber: exam.order_number,
                        modality: exam.modality_type || exam.modality_name || null,
                        examType: exam.exam_type_name || null,
                        imageCount: Number(exam.image_count || 0)
                    }
                })
            ]
        );

        await writeAudit(db, {
            eventType: 'AI_ANALYSIS_REQUESTED',
            actorUserId: req.user?.user_id || null,
            studyInstanceUid: exam.study_instance_uid,
            accessionNumber: exam.order_number,
            remoteIp: req.headers['x-forwarded-for'] || req.ip || null,
            detail: {
                job_id: rows[0].job_id,
                exam_id: examId,
                analysis_type: analysisType,
                provider: config.provider,
                model: config.model,
                queued_only: !willProcessAutomatically,
                worker_configured: Boolean(config.workerUrl)
            }
        });

        triggerEventForRole(db, 'AI_ANALYSIS_REQUESTED', 'Radiologist', {
            priority: 'Normal',
            variables: {
                accession_number: exam.order_number || '',
                ai_model: config.model || ''
            }
        }).catch(() => { });

        triggerEventForRole(db, 'AI_ANALYSIS_REQUESTED', 'Admin', {
            priority: 'Normal',
            variables: {
                accession_number: exam.order_number || '',
                ai_model: config.model || ''
            }
        }).catch(() => { });

        res.status(202).json({ success: true, existing: false, job: rows[0] });
    } catch (error) {
        await auditPacsAccessDenied(db, req, error, { exam_id: req.params?.examId, action: 'request_ai_analysis' });
        next(error);
    }
};

/**
 * GET /api/pacs/quarantine — list studies awaiting manual reconciliation.
 */
const getQuarantine = (db) => async (req, res, next) => {
    try {
        const status = req.query.status || 'Pending';
        const { rows } = await db.query(
            `SELECT quarantine_id, study_instance_uid, orthanc_study_id,
                    raw_patient_id, raw_patient_name, raw_accession_number,
                    modality, quarantine_reason, status, created_at
             FROM pacs_quarantine_studies
             WHERE status = $1
             ORDER BY created_at DESC`,
            [status]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
};

/**
 * ALL /api/pacs/dicom-web/* — authenticated DICOMweb proxy to Orthanc.
 *
 * This URL is the stable "swap-later" contract the browser viewer (OHIF) talks
 * to; Orthanc is never exposed to the browser. The JWT + VIEW_PACS_IMAGES guard
 * runs in the route chain before this handler. We record a lightweight view
 * audit for study-level reads before proxying PHI.
 */
const dicomWebProxy = (db) => async (req, res, next) => {
    try {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next(new AppError('DICOMweb writes are not supported through the viewer proxy; use the PACS upload endpoint', 405));
        }

        req.setTimeout(5 * 60 * 1000);
        res.setTimeout(5 * 60 * 1000);

        const prefix = req.params[0] || 'dicom-web';
        const rest = req.params[1] || '';
        const subPath = `/${prefix}${rest}`;

        if (shouldReturnEmptyScopedStudyBrowse(req, subPath)) {
            res.setHeader('Content-Type', 'application/dicom+json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-VIARA-DICOMweb-Scoped', 'empty-study-browse');
            return res.status(200).json([]);
        }

        await assertDicomWebStudyScope(db, req, subPath);
        await require('../services/pacsColdStorageService').ensureArchivedStudiesAvailable(db, getRequestedStudyUids(subPath, req.query || {}));

        // Audit study-level access (WADO/QIDO on a specific study) without
        // spamming on every per-frame request.
        const pathStudy = subPath.match(/^\/(?:dicom-web|wado)\/studies\/([0-9.]+)(?=\/|$)/);
        const queriedStudies = /^\/dicom-web\/studies\/?$/.test(subPath)
            ? getRequestedStudyUids(subPath, req.query || {})
            : [];
        const studyUidsToAudit = pathStudy && !/\/frames(?:\/|$)/.test(subPath)
            ? [pathStudy[1]]
            : queriedStudies;
        if (req.method === 'GET' && studyUidsToAudit.length) {
            const remoteIp = req.headers?.['x-forwarded-for'] || req.ip || null;
            for (const studyInstanceUid of studyUidsToAudit) {
                await writeAudit(db, {
                    eventType: 'IMAGE_VIEW',
                    actorUserId: req.user?.user_id || null,
                    actorRole: req.user?.role || null,
                    studyInstanceUid,
                    remoteIp,
                    detail: { path: '/api/pacs/dicom-web/studies/:studyUid' },
                    httpMethod: req.method,
                    requestPath: '/api/pacs/dicom-web/studies/:studyUid',
                    required: true
                });
            }
            triggerEventForRole(db, 'IMAGE_VIEW', 'Radiologist', {
                priority: 'Normal',
                variables: {
                    accession_number: '',
                    viewed_by: req.user?.full_name || req.user?.email || 'Unknown'
                }
            }).catch(() => { });
        } else if (req.method === 'GET' && /^\/dicom-web\/studies\/?$/.test(subPath)) {
            await writeAudit(db, {
                eventType: 'PACS_STUDY_SEARCH',
                actorUserId: req.user?.user_id || null,
                actorRole: req.user?.role || null,
                remoteIp: req.headers?.['x-forwarded-for'] || req.ip || null,
                detail: { path: '/api/pacs/dicom-web/studies' },
                httpMethod: req.method,
                requestPath: '/api/pacs/dicom-web/studies',
                required: true
            });
        }

        await proxyToOrthanc(req, res, subPath);
    } catch (error) {
        await auditPacsAccessDenied(db, req, error);
        next(error);
    }
};

/**
 * POST /api/pacs/quarantine/:id/reconcile — link a quarantined study to an exam.
 * Body: { examId }.
 */
const reconcileQuarantineStudy = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const { examId } = req.body || {};
        if (!examId) return next(new AppError('examId is required', 400));
        const remoteIp = req.headers['x-forwarded-for'] || req.ip || null;
        const result = await reconcileQuarantine(db, {
            quarantineId: id,
            examId,
            actorUserId: req.user?.user_id || null,
            remoteIp
        });
        res.json({ success: true, ...result });
    } catch (error) {
        if (error.statusCode) return next(new AppError(error.message, error.statusCode));
        next(error);
    }
};

/**
 * POST /api/pacs/quarantine/:id/discard — mark a quarantined study discarded.
 */
const discardQuarantineStudy = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const remoteIp = req.headers['x-forwarded-for'] || req.ip || null;
        const result = await discardQuarantine(db, {
            quarantineId: id,
            actorUserId: req.user?.user_id || null,
            remoteIp
        });
        res.json({ success: true, ...result });
    } catch (error) {
        if (error.statusCode) return next(new AppError(error.message, error.statusCode));
        next(error);
    }
};

/**
 * GET /api/pacs/scheduled-exams?q=... — typeahead of candidate examinations an
 * operator can map a quarantined study to. Matches order_number/MRN.
 */
const searchScheduledExams = (db) => async (req, res, next) => {
    try {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) return res.json([]);
        const searchTerms = q.toLowerCase().split(/\s+/).filter(Boolean);

        // 1. Fetch active examinations
        const examResult = await db.query(
            `SELECT e.exam_id, COALESCE(e.order_number, a.order_number) AS order_number, e.study_instance_uid, e.status,
                    COALESCE(a.start_time, e.created_at) AS scheduled_datetime,
                    et.name AS exam_type_name, et.code AS exam_type_code,
                    m.name AS modality_name, m.type AS modality_type,
                    p.mrn, p.first_name_enc, p.last_name_enc
             FROM examinations e
             JOIN patients p ON e.patient_id = p.patient_id
             LEFT JOIN appointments a ON e.appointment_id = a.appointment_id
             LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
             LEFT JOIN modalities m ON e.modality_id = m.modality_id
             WHERE e.status::text IN ('Scheduled', 'Checked-in', 'Scanning', 'Reporting', 'Arrived', 'In-Progress', 'Completed', 'Finalized')
             ORDER BY COALESCE(a.start_time, e.created_at) DESC
             LIMIT 150`
        );

        // 2. Fetch active appointments that may not have an examination created yet
        const apptResult = await db.query(
            `SELECT a.appointment_id, a.patient_id, a.modality_id, a.exam_type_id,
                    COALESCE(a.order_number, 'APT-' || SUBSTRING(a.appointment_id::text, 1, 8)) AS order_number,
                    a.status, a.start_time AS scheduled_datetime,
                    et.name AS exam_type_name, et.code AS exam_type_code,
                    m.name AS modality_name, m.type AS modality_type,
                    p.mrn, p.first_name_enc, p.last_name_enc,
                    e.exam_id
             FROM appointments a
             JOIN patients p ON a.patient_id = p.patient_id
             LEFT JOIN examinations e ON e.appointment_id = a.appointment_id
             LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
             LEFT JOIN modalities m ON a.modality_id = m.modality_id
             WHERE a.status::text IN ('Scheduled', 'Confirmed', 'Arrived', 'In-Progress', 'Checked-in', 'Completed')
             ORDER BY a.start_time DESC
             LIMIT 150`
        );

        const existingExamIds = new Set(examResult.rows.map(r => r.exam_id));
        const apptExamRows = [];

        for (const appt of apptResult.rows) {
            let examId = appt.exam_id;
            if (!examId) {
                try {
                    const ins = await db.query(
                        `INSERT INTO examinations (
                            appointment_id, patient_id, modality_id, exam_type_id,
                            status, queue_stage, order_number
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                         RETURNING exam_id`,
                        [
                            appt.appointment_id,
                            appt.patient_id,
                            appt.modality_id,
                            appt.exam_type_id,
                            appt.status === 'Arrived' ? 'Checked-in' : 'Scheduled',
                            appt.status === 'Arrived' ? 'Arrived' : 'Scheduled',
                            appt.order_number
                        ]
                    );
                    if (ins.rows.length) {
                        examId = ins.rows[0].exam_id;
                    }
                } catch {
                    // Ignore insert conflicts
                }
            }

            if (examId && !existingExamIds.has(examId)) {
                existingExamIds.add(examId);
                apptExamRows.push({
                    exam_id: examId,
                    order_number: appt.order_number,
                    study_instance_uid: null,
                    status: appt.status,
                    scheduled_datetime: appt.scheduled_datetime,
                    exam_type_name: appt.exam_type_name,
                    exam_type_code: appt.exam_type_code,
                    modality_name: appt.modality_name,
                    modality_type: appt.modality_type,
                    mrn: appt.mrn,
                    first_name_enc: appt.first_name_enc,
                    last_name_enc: appt.last_name_enc
                });
            }
        }

        const combinedRows = [...examResult.rows, ...apptExamRows];

        const candidates = combinedRows
            .map(({ first_name_enc, last_name_enc, ...row }) => {
                const firstName = safeDecrypt(first_name_enc) || '';
                const lastName = safeDecrypt(last_name_enc) || '';
                return {
                    ...row,
                    patient_name: [firstName, lastName].filter(Boolean).join(' ')
                };
            })
            .filter((row) => {
                const text = [
                    row.order_number,
                    row.mrn,
                    row.patient_name,
                    row.exam_type_name,
                    row.exam_type_code,
                    row.modality_name,
                    row.modality_type,
                    row.status
                ].filter(Boolean).join(' ').toLowerCase();
                return searchTerms.every(term => text.includes(term));
            })
            .slice(0, 30);

        res.json(candidates);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/pacs/exams/:examId/images — upload local DICOM and/or JPEG/PNG files
 * and attach them to an examination. Files arrive as multipart/form-data under
 * the field "files". Each is stamped with the exam's identity, stored in Orthanc,
 * and reconciled into the RIS study. Writes a STUDY_IMPORTED audit summary.
 */
const uploadExamImages = (db) => async (req, res, next) => {
    try {
        const timeoutMs = Number(process.env.PACS_UPLOAD_TIMEOUT_MS || 10 * 60 * 1000);
        req.setTimeout(timeoutMs);
        res.setTimeout(timeoutMs);

        const { examId } = req.params;
        const files = req.files || [];
        if (!files.length) return next(new AppError('No files uploaded (field "files")', 400));
        await assertExamImagingAccess(db, req.user, examId);

        const remoteIp = req.headers['x-forwarded-for'] || req.ip || null;
        const requestedTotal = Number.parseInt(req.body?.totalFiles, 10);
        const expectedTotal = Number.isFinite(requestedTotal)
            ? Math.min(10000, Math.max(files.length, requestedTotal))
            : files.length;
        const result = await uploadFilesToExam(db, {
            examId,
            files,
            uploadSessionId: req.body?.uploadSessionId || null,
            expectedTotal,
            actorUserId: req.user?.user_id || null,
            remoteIp
        });

        await writeAudit(db, {
            eventType: 'STUDY_IMPORTED',
            actorUserId: req.user?.user_id || null,
            studyInstanceUid: result.study_instance_uid,
            remoteIp,
            detail: {
                exam_id: examId,
                stored: result.stored,
                reconciled: result.reconciled,
                unreconciled: result.unreconciled,
                failed: result.failed,
                rejected: result.rejected,
                total: result.total
            }
        });

        triggerEventForRole(db, 'STUDY_IMPORTED', 'Radiologist', {
            priority: 'Normal',
            variables: {
                accession_number: result.order_number || '',
                patient_name: result.patient_name || '',
                modality: result.modality_name || ''
            }
        }).catch(() => { });

        triggerEventForRole(db, 'STUDY_IMPORTED', 'Technician', {
            priority: 'Normal',
            variables: {
                accession_number: result.order_number || '',
                patient_name: result.patient_name || '',
                modality: result.modality_name || ''
            }
        }).catch(() => { });

        triggerEventForRole(db, 'STUDY_IMPORTED', 'Admin', {
            priority: 'Normal',
            variables: {
                accession_number: result.order_number || '',
                patient_name: result.patient_name || '',
                modality: result.modality_name || ''
            }
        }).catch(() => { });

        if (res.headersSent) return;
        const complete = result.reconciled === result.total;
        return res.status(complete ? 201 : 207).json({ success: result.reconciled > 0, ...result });
    } catch (error) {
        if (res.headersSent) {
            logger.error('PACS upload failed after response was sent', { error: error.message });
            return;
        }
        await auditPacsAccessDenied(db, req, error, { exam_id: req.params?.examId, action: 'upload_images' });
        if (error.statusCode) return next(new AppError(error.message, error.statusCode));
        return next(error);
    } finally {
        await Promise.all((req.files || []).map(async (file) => {
            if (!file?.path) return;
            try { await fs.promises.unlink(file.path); } catch (cleanupError) {
                if (cleanupError.code !== 'ENOENT') {
                    logger.warn('PACS upload controller cleanup failed', { path: file.path, error: cleanupError.message });
                }
            }
        }));
    }
};

const getExamUploadProgress = (db) => async (req, res, next) => {
    try {
        const { examId, uploadSessionId } = req.params;
        const progress = getUploadProgress(uploadSessionId, {
            examId,
            actorUserId: req.user?.user_id || null
        });
        if (!progress) return next(new AppError('Upload session not found for this examination', 404));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, ...progress });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/pacs/viewer-session — mint a short-lived, httpOnly cookie the OHIF
 * iframe uses to authenticate its browser-originated DICOMweb requests.
 *
 * The SPA's Bearer JWT lives in sessionStorage and cannot be attached to iframe
 * sub-requests (metadata/series/frames). Instead we sign a narrowly-scoped
 * (`scope: 'pacs-viewer'`) token and set it as a cookie limited to the DICOMweb
 * proxy path. authenticateDicomWeb accepts it there; authenticateToken rejects
 * it everywhere else, so it is not a general-purpose credential.
 */
const exportPacsStudy = (db) => async (req, res, next) => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 30 * 60 * 1000);
    deadline.unref();
    const cancel = () => { if (!res.writableFinished) controller.abort(); };
    res.on('close', cancel);
    let studyInstanceUid;
    const format = String(req.query?.format || 'dicom').toLowerCase();
    try {
        studyInstanceUid = decodeDicomUid(req.params.studyInstanceUid || '');
        if (!isValidStudyUid(studyInstanceUid)) {
            throw new AppError('Invalid StudyInstanceUID', 400);
        }
        if (!['dicom', 'images', 'cd'].includes(format)) {
            throw new AppError('Unsupported PACS export format', 400);
        }

        req.setTimeout(30 * 60 * 1000);
        res.setTimeout(30 * 60 * 1000);

        const study = await resolveExportStudyContext(db, req, studyInstanceUid);
        const auditStudy = { ...study, study_instance_uid: studyInstanceUid };
        await auditPacsStudyExport(db, req, auditStudy, format, { phase: 'started' }, { required: true, notify: false });
        const orthancUrl = await getOrthancUrl();
        const auth = await getOrthancAuthHeader();
        const orthancStudyId = study.orthanc_study_id || await lookupOrthancStudyId(orthancUrl, auth, studyInstanceUid);
        const baseName = safeFileStem(study.order_number || study.mrn || studyInstanceUid, 'pacs-case');

        if (format === 'images') {
            const result = await exportRenderedImagesZip({
                orthancUrl,
                auth,
                orthancStudyId,
                study: { ...study, orthanc_study_id: orthancStudyId },
                filename: `${baseName}-images.zip`,
                res, signal: controller.signal
            });
            await auditPacsStudyExport(db, req, { ...study, study_instance_uid: studyInstanceUid, orthanc_study_id: orthancStudyId }, format, { ...result, phase: 'completed' });
            return;
        }

        await streamOrthancStudyPackage({
            orthancUrl,
            auth,
            orthancStudyId,
            mode: format === 'cd' ? 'cd' : 'dicom',
            filename: `${baseName}-${format === 'cd' ? 'cd-media' : 'dicom'}.zip`,
            res, signal: controller.signal
        });
        await auditPacsStudyExport(db, req, { ...study, study_instance_uid: studyInstanceUid, orthanc_study_id: orthancStudyId }, format, { phase: 'completed' });
    } catch (error) {
        if (studyInstanceUid && !res.headersSent) {
            try {
                await auditPacsStudyExport(db, req, { study_instance_uid: studyInstanceUid }, format, {
                    phase: 'failed',
                    error_code: error.code || 'EXPORT_FAILED',
                    statusCode: error.statusCode || 500
                }, { required: true, notify: false });
            } catch (auditError) {
                logger.error('PACS export failure audit could not be persisted', {
                    error: auditError.message,
                    code: auditError.code
                });
            }
        }
        await auditPacsAccessDenied(db, req, error, {
            requested_study_uids: [studyInstanceUid],
            action: 'export_study',
            format
        });
        if (res.headersSent) res.destroy(error);
        else next(error);
    } finally {
        clearTimeout(deadline);
        res.off('close', cancel);
    }
};

const createViewerSession = (db) => async (req, res, next) => {
    try {
        if (!req.user.session_id) throw new AppError('An active staff login is required for the viewer', 401);
        const requestedUids = parseStudyUidList(req.body?.studyInstanceUids || req.body?.StudyInstanceUIDs);
        const accessionNumber =
            req.body?.accessionNumber ||
            req.body?.orderNumber ||
            req.body?.order_number ||
            null;
        const examContext = await assertExamViewerAccess(db, req.user, {
            examId: req.body?.examId || req.body?.exam_id,
            accessionNumber,
            studyUids: requestedUids
        });
        const studyUids = examContext
            ? [examContext.study_instance_uid]
            : await assertStudyAccess(db, req.user, requestedUids);

        const token = jwt.sign(
            {
                user_id: req.user.user_id,
                session_id: req.user.session_id,
                parent_session_expires_at: req.user.exp,
                role: req.user.role,
                scope: 'pacs-viewer',
                study_instance_uids: studyUids,
                exam_id: examContext?.exam_id || null,
                order_number: examContext?.order_number || null
            },
            process.env.JWT_SECRET,
            { expiresIn: 10 * 60 }
        );
        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            studyInstanceUids: studyUids,
            viewerSessionReady: true,
            authMode: 'scopedBearer',
            viewerToken: token,
            expiresInSeconds: 10 * 60,
            exam: examContext || null
        });
    } catch (error) {
        await auditPacsAccessDenied(db, req, error, {
            exam_id: req.body?.examId || req.body?.exam_id || null,
            requested_study_uids: parseStudyUidList(req.body?.studyInstanceUids || req.body?.StudyInstanceUIDs)
        });
        next(error);
    }
};

const retryPacsAiJob = (db) => async (req, res, next) => {
    try {
        const { jobId } = req.params;
        await assertPacsAiJobAccess(db, req.user, jobId);
        const config = await getPacsAiConfig();
        const { rows } = await db.query(
            `UPDATE pacs_ai_analysis_jobs
             SET status = 'Queued',
                 error_message = NULL,
                 started_at = NULL,
                 completed_at = NULL,
                 provider = $2,
                 model = $3,
                 model_version = $4,
                 result_payload = '{}'::jsonb,
                 updated_at = CURRENT_TIMESTAMP
             WHERE job_id = $1 AND status IN ('Failed', 'Canceled', 'Completed')
             RETURNING *`,
            [jobId, config.provider, config.model, config.modelVersion || '']
        );
        if (!rows.length) {
            return next(new AppError('Job is not in a retryable state', 400));
        }
        res.json({ success: true, job: rows[0] });
    } catch (error) {
        await auditPacsAccessDenied(db, req, error, { job_id: req.params.jobId, action: 'retry' });
        next(error);
    }
};

const cancelPacsAiJob = (db) => async (req, res, next) => {
    try {
        const { jobId } = req.params;
        await assertPacsAiJobAccess(db, req.user, jobId);
        const { rows } = await db.query(
            `UPDATE pacs_ai_analysis_jobs
             SET status = 'Canceled',
                 error_message = 'Canceled by user',
                 completed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE job_id = $1 AND status IN ('Queued', 'Running')
             RETURNING *`,
            [jobId]
        );
        if (!rows.length) {
            return next(new AppError('Job is not in a cancelable state (Queued or Running)', 400));
        }
        res.json({ success: true, job: rows[0] });
    } catch (error) {
        await auditPacsAccessDenied(db, req, error, { job_id: req.params.jobId, action: 'cancel' });
        next(error);
    }
};

const deletePacsAiJob = (db) => async (req, res, next) => {
    try {
        const { jobId } = req.params;
        if (!hasGlobalPacsAccess(req.user)) {
            return next(new AppError('Only PACS managers can delete AI job history', 403));
        }
        const { rowCount } = await db.query(
            `DELETE FROM pacs_ai_analysis_jobs
             WHERE job_id = $1`,
            [jobId]
        );
        if (!rowCount) {
            return next(new AppError('Job not found', 404));
        }
        res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
        await auditPacsAccessDenied(db, req, error, { job_id: req.params.jobId, action: 'delete' });
        next(error);
    }
};

const retryAllPacsAiJobs = (db) => async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `UPDATE pacs_ai_analysis_jobs
             SET status = 'Queued',
                 error_message = NULL,
                 started_at = NULL,
                 completed_at = NULL,
                 result_payload = '{}'::jsonb,
                 updated_at = CURRENT_TIMESTAMP
             WHERE status IN ('Failed', 'Canceled')
             RETURNING *`
        );
        res.json({ success: true, count: rows.length });
    } catch (error) {
        next(error);
    }
};

const cancelAllPacsAiJobs = (db) => async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `UPDATE pacs_ai_analysis_jobs
             SET status = 'Canceled',
                 error_message = 'Stopped by user',
                 completed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE status IN ('Queued', 'Running')
             RETURNING *`
        );
        res.json({ success: true, count: rows.length });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    verifyPacsWebhook,
    handleWebhook,
    getExamImagingStatus,
    getExamAiAnalysisJobs,
    getPacsAiAnalysisQueue,
    requestExamAiAnalysis,
    getQuarantine,
    reconcileQuarantineStudy,
    discardQuarantineStudy,
    searchScheduledExams,
    uploadExamImages,
    getExamUploadProgress,
    dicomWebProxy,
    syncModalityToOrthanc,
    getOrthancSystemStatus,
    pingModality,
    getPacsConfig,
    getPacsDiagnostics,
    updatePacsConfig,
    getPacsAudit,
    getPacsRequests,
    getPacsWorklistPreview,
    refreshPacsWorklist,
    getPacsStorageSummary,
    runPacsTiering,
    runPacsAiAnalysisQueue,
    authorizeExamImagingAccess,
    createViewerSession,
    retryPacsAiJob,
    cancelPacsAiJob,
    deletePacsAiJob,
    retryAllPacsAiJobs,
    cancelAllPacsAiJobs,
    exportPacsStudy
};
