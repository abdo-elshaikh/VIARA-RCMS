const logger = require('../config/logger');
const settingsService = require('./settingsService');
const dcmjs = require('dcmjs');
const jpegLossless = require('jpeg-lossless-decoder-js');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { createCircuitBreaker } = require('../utils/circuitBreaker');

// Orthanc connection — the ONLY place that knows Orthanc's URL/credentials.
// A future native DIMSE+DICOMweb engine swaps this module out while the
// frontend keeps talking to /api/pacs/dicom-web unchanged.

const LEGACY_DEFAULTS = {
    url: 'http://orthanc:8042',
    username: 'rcms'
};

const envOrthancUrl = () => process.env.ORTHANC_API_URL || process.env.ORTHANC_URL || LEGACY_DEFAULTS.url;

const preferEnvOverLegacyDefault = (settingValue, envValue, legacyDefault) => {
    if (envValue && settingValue === legacyDefault && envValue !== legacyDefault) return envValue;
    return settingValue || envValue || legacyDefault;
};

const getOrthancConfig = async () => {
    const envUrl = envOrthancUrl();
    const envUsername = process.env.ORTHANC_USERNAME || LEGACY_DEFAULTS.username;
    const envPassword = process.env.ORTHANC_PASSWORD;
    if (!envPassword) {
        throw new Error('ORTHANC_PASSWORD environment variable is required but not set');
    }

    const settingUrl = await settingsService.get('orthanc_api_url', envUrl);
    const settingUsername = await settingsService.get('orthanc_username', envUsername);
    const settingPassword = await settingsService.get('orthanc_password', envPassword);

    const url = preferEnvOverLegacyDefault(settingUrl, envUrl, LEGACY_DEFAULTS.url).replace(/\/+$/, '');
    const username = preferEnvOverLegacyDefault(settingUsername, envUsername, LEGACY_DEFAULTS.username);
    const password = preferEnvOverLegacyDefault(settingPassword, envPassword, envPassword);

    return {
        url,
        authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
    };
};

const getOrthancUrl = async () => (await getOrthancConfig()).url;

const getOrthancAuthHeader = async () => (await getOrthancConfig()).authorization;

const orthancCircuitBreaker = createCircuitBreaker(
    async (input, init) => fetch(input, init),
    {
        name: 'orthanc-api',
        timeout: 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
    }
);

const orthancFetch = async (url, options = {}) => {
    const config = await getOrthancConfig();
    const requestUrl = url.startsWith('http') ? url : `${config.url}${url}`;
    const headers = { ...options.headers };
    if (!headers.Authorization) headers.Authorization = config.authorization;
    return orthancCircuitBreaker.fire(requestUrl, { ...options, headers });
};

// Hop-by-hop and auth headers we must not forward in either direction.
const STRIP_REQUEST_HEADERS = new Set([
    'host', 'authorization', 'cookie', 'connection', 'content-length', 'accept-encoding'
]);
const STRIP_RESPONSE_HEADERS = new Set([
    'connection', 'keep-alive', 'transfer-encoding', 'content-encoding',
    'www-authenticate', 'set-cookie'
]);

const DICOM_WEB_PROXY_ROOT = '/api/pacs/dicom-web';

const rewriteBulkDataUri = (value) => {
    if (typeof value !== 'string') return value;

    try {
        const parsed = new URL(value, 'http://orthanc.invalid');
        const dicomWebIndex = parsed.pathname.indexOf('/dicom-web');
        if (dicomWebIndex < 0) return value;

        const suffix = parsed.pathname.slice(dicomWebIndex + '/dicom-web'.length);
        return `${DICOM_WEB_PROXY_ROOT}${suffix}${parsed.search}${parsed.hash}`;
    } catch {
        return value;
    }
};

const rewriteDicomJsonBulkDataUris = (value) => {
    if (Array.isArray(value)) {
        value.forEach(rewriteDicomJsonBulkDataUris);
        return value;
    }
    if (!value || typeof value !== 'object') return value;

    for (const [key, nestedValue] of Object.entries(value)) {
        if (key === 'BulkDataURI') {
            value[key] = rewriteBulkDataUri(nestedValue);
        } else {
            rewriteDicomJsonBulkDataUris(nestedValue);
        }
    }
    return value;
};

const getSopInstanceUid = (req, subPath) => {
    if (subPath.startsWith('/wado')) {
        const queryParams = new URL(req.originalUrl, 'http://localhost').searchParams;
        return queryParams.get('objectUID');
    }

    const renderedMatch = subPath.match(/\/instances\/([^/]+)\/rendered$/);
    if (renderedMatch) {
        return decodeURIComponent(renderedMatch[1]);
    }

    return null;
};

const parseLookupResult = (data) => {
    if (!Array.isArray(data)) return null;

    for (const item of data) {
        if (typeof item === 'string') return item;
        if (item?.Type === 'Instance' && item?.ID) return item.ID;
        if (item?.ID) return item.ID;
    }

    return null;
};

const numberFromDicomValue = (value, fallback = null) => {
    if (Array.isArray(value)) return numberFromDicomValue(value[0], fallback);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const getPixelDataBuffer = (dataset) => {
    const pixelData = dataset.PixelData;
    if (!pixelData) return null;

    if (pixelData instanceof ArrayBuffer) return pixelData;
    if (ArrayBuffer.isView(pixelData)) {
        return pixelData.buffer.slice(pixelData.byteOffset, pixelData.byteOffset + pixelData.byteLength);
    }

    if (Array.isArray(pixelData) && pixelData[0] instanceof ArrayBuffer) {
        const firstBytes = new Uint8Array(pixelData[0], 0, Math.min(4, pixelData[0].byteLength));
        const isJpeg = firstBytes[0] === 0xff && firstBytes[1] === 0xd8;
        if (isJpeg) {
            return new jpegLossless.Decoder().decompress(pixelData[0], 0, pixelData[0].byteLength);
        }
        return pixelData[0];
    }

    return null;
};

const getPixelValue = (view, offset, bitsAllocated, signed) => {
    if (bitsAllocated === 8) return signed ? view.getInt8(offset) : view.getUint8(offset);
    if (bitsAllocated === 16) return signed ? view.getInt16(offset, true) : view.getUint16(offset, true);
    return null;
};

const encodeGrayscaleBmp = (pixels, width, height) => {
    const rowStride = Math.ceil((width * 3) / 4) * 4;
    const imageSize = rowStride * height;
    const fileSize = 54 + imageSize;
    const buffer = Buffer.alloc(fileSize);

    buffer.write('BM', 0, 'ascii');
    buffer.writeUInt32LE(fileSize, 2);
    buffer.writeUInt32LE(54, 10);
    buffer.writeUInt32LE(40, 14);
    buffer.writeInt32LE(width, 18);
    buffer.writeInt32LE(height, 22);
    buffer.writeUInt16LE(1, 26);
    buffer.writeUInt16LE(24, 28);
    buffer.writeUInt32LE(0, 30);
    buffer.writeUInt32LE(imageSize, 34);

    for (let y = 0; y < height; y += 1) {
        const srcY = height - 1 - y;
        const rowOffset = 54 + y * rowStride;
        for (let x = 0; x < width; x += 1) {
            const value = pixels[srcY * width + x];
            const offset = rowOffset + x * 3;
            buffer[offset] = value;
            buffer[offset + 1] = value;
            buffer[offset + 2] = value;
        }
    }

    return buffer;
};

const renderDicomFileToBmp = async (orthancUrl, authorization, instanceId) => {
    const fileRes = await fetch(`${orthancUrl}/instances/${instanceId}/file`, {
        headers: { Authorization: authorization, Accept: 'application/dicom' }
    });
    if (!fileRes.ok) return null;

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const dicomBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
    const { DicomMessage, DicomMetaDictionary } = dcmjs.data;
    const parsed = DicomMessage.readFile(dicomBuffer, { ignoreErrors: true });
    const dataset = DicomMetaDictionary.naturalizeDataset(parsed.dict);

    const width = numberFromDicomValue(dataset.Columns);
    const height = numberFromDicomValue(dataset.Rows);
    const samplesPerPixel = numberFromDicomValue(dataset.SamplesPerPixel, 1);
    const bitsAllocated = numberFromDicomValue(dataset.BitsAllocated);
    const signed = numberFromDicomValue(dataset.PixelRepresentation, 0) === 1;
    if (!width || !height || samplesPerPixel !== 1 || ![8, 16].includes(bitsAllocated)) {
        return null;
    }

    const pixelBuffer = getPixelDataBuffer(dataset);
    if (!pixelBuffer) return null;

    const bytesPerPixel = bitsAllocated / 8;
    const framePixels = width * height;
    if (pixelBuffer.byteLength < framePixels * bytesPerPixel) return null;

    const view = new DataView(pixelBuffer);
    const raw = new Float32Array(framePixels);
    let min = Infinity;
    let max = -Infinity;
    const slope = numberFromDicomValue(dataset.RescaleSlope, 1) || 1;
    const intercept = numberFromDicomValue(dataset.RescaleIntercept, 0) || 0;

    for (let i = 0; i < framePixels; i += 1) {
        const value = getPixelValue(view, i * bytesPerPixel, bitsAllocated, signed);
        if (value === null) return null;
        const scaled = value * slope + intercept;
        raw[i] = scaled;
        if (scaled < min) min = scaled;
        if (scaled > max) max = scaled;
    }

    const center = numberFromDicomValue(dataset.WindowCenter);
    const widthValue = numberFromDicomValue(dataset.WindowWidth);
    if (center !== null && widthValue && widthValue > 0) {
        min = center - widthValue / 2;
        max = center + widthValue / 2;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        min = 0;
        max = 1;
    }

    const invert = String(dataset.PhotometricInterpretation || '').toUpperCase() === 'MONOCHROME1';
    const output = Buffer.alloc(framePixels);
    const range = max - min;
    for (let i = 0; i < framePixels; i += 1) {
        const normalized = Math.max(0, Math.min(1, (raw[i] - min) / range));
        output[i] = invert ? Math.round((1 - normalized) * 255) : Math.round(normalized * 255);
    }

    return encodeGrayscaleBmp(output, width, height);
};

const lookupInstanceId = async (orthancUrl, authorization, sopInstanceUid) => {
    const findRes = await fetch(`${orthancUrl}/tools/find`, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            Level: 'Instance',
            Query: { SOPInstanceUID: sopInstanceUid },
            Limit: 1
        })
    });

    if (findRes.ok) {
        const instanceId = parseLookupResult(await findRes.json());
        if (instanceId) return instanceId;
    }

    // Orthanc >= 1.12.11 also exposes /tools/lookup. Keep this as a secondary
    // path for newer archives while /tools/find covers the bundled image.
    const lookupRes = await fetch(`${orthancUrl}/tools/lookup`, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'text/plain' },
        body: sopInstanceUid
    });

    if (!lookupRes.ok) return null;
    return parseLookupResult(await lookupRes.json());
};

const fetchPreviewFallback = async (orthancUrl, authorization, sopInstanceUid) => {
    if (!sopInstanceUid) return null;

    const instanceId = await lookupInstanceId(orthancUrl, authorization, sopInstanceUid);
    if (!instanceId) return null;

    const previewRes = await fetch(`${orthancUrl}/instances/${instanceId}/preview`, {
        headers: { Authorization: authorization, Accept: 'image/jpeg, image/png;q=0.9, */*;q=0.1' }
    });

    if (previewRes.ok) return previewRes;

    const bmp = await renderDicomFileToBmp(orthancUrl, authorization, instanceId);
    if (!bmp) return null;

    logger.warn('PACS: Orthanc preview failed, rendered DICOM pixels in RCMS fallback', {
        instanceId, status: previewRes.status
    });

    return new Response(bmp, {
        status: 200,
        headers: {
            'Content-Type': 'image/bmp',
            'Content-Length': String(bmp.length),
            'Cache-Control': 'no-store'
        }
    });
};

/**
 * Forward a read-only DICOMweb request (QIDO/WADO) to Orthanc with server-side basic
 * auth injected, and stream the response back. `subPath` is the path AFTER
 * /dicom-web (e.g. "/studies/1.2.3/series"). Pixel-data responses are streamed;
 * DICOM JSON is buffered briefly so internal Orthanc BulkDataURI values can be
 * rewritten to the authenticated browser-facing proxy.
 */
const proxyToOrthanc = async (req, res, subPath) => {
    const search = req.originalUrl.includes('?')
        ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
        : '';
    const orthancUrl = await getOrthancUrl();
    const target = `${orthancUrl}${subPath}${search}`;
    const isWadoUri = subPath.startsWith('/wado');
    const isRendered = subPath.endsWith('/rendered');

    const headers = { Authorization: await getOrthancAuthHeader() };
    for (const [key, value] of Object.entries(req.headers)) {
        if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
            headers[key] = value;
        }
    }

    // Orthanc's DICOMweb plugin strictly requires an image Accept header for /rendered
    // Browser <img> tags send complex Accept headers that cause 406 Not Acceptable.
    if (isRendered) {
        headers['accept'] = 'image/jpeg';
    }

    const abortController = new AbortController();
    const onClientClosed = () => abortController.abort();
    req.on('aborted', onClientClosed);
    res.on('close', onClientClosed);

    const init = { method: req.method, headers, signal: abortController.signal };

    let upstream;
    try {
        upstream = await fetch(target, init);

        // If WADO-URI or DICOMweb rendered retrieval fails (plugin engine exception,
        // unsupported transfer syntax, missing rendered support), fall back to
        // Orthanc's REST preview endpoint which lets GDCM transcode.
        if (!upstream.ok && (isWadoUri || isRendered) && req.method === 'GET') {
            const sopInstanceUid = getSopInstanceUid(req, subPath);
            logger.debug('PACS: rendered request failed, attempting REST preview fallback', {
                sopInstanceUid, status: upstream.status, path: subPath
            });

            const previewRes = await fetchPreviewFallback(orthancUrl, headers.Authorization, sopInstanceUid);
            if (previewRes) {
                upstream = previewRes;
            } else {
                logger.warn('PACS: REST preview fallback failed', {
                    sopInstanceUid, status: upstream.status, path: subPath
                });
            }
        }
    } catch (error) {
        req.off('aborted', onClientClosed);
        res.off('close', onClientClosed);
        if (abortController.signal.aborted) {
            logger.debug('DICOMweb proxy client aborted before upstream response', {
                path: subPath
            });
            if (!res.headersSent) res.end();
            return;
        }
        logger.error('DICOMweb proxy upstream error', { target, error: error.message });
        res.status(502).json({ success: false, message: 'PACS backend unreachable' });
        return;
    }

    if (!upstream.ok) {
        logger.warn('DICOMweb proxy upstream returned non-success status', {
            status: upstream.status,
            path: subPath
        });
    }

    res.status(upstream.status);
    res.setHeader('X-RCMS-DICOMweb-Status', String(upstream.status));

    const contentType = upstream.headers.get('content-type') || '';
    const isDicomJson = /(?:application\/dicom\+json|application\/json)/i.test(contentType);
    let bufferedBody = null;

    if (upstream.body && req.method !== 'HEAD' && isDicomJson) {
        const upstreamBody = Buffer.from(await upstream.arrayBuffer());
        try {
            const payload = JSON.parse(upstreamBody.toString('utf8'));
            rewriteDicomJsonBulkDataUris(payload);
            bufferedBody = Buffer.from(JSON.stringify(payload));
        } catch (error) {
            bufferedBody = upstreamBody;
            logger.warn('DICOMweb proxy received invalid JSON from upstream', {
                path: subPath,
                error: error.message
            });
        }
    }

    upstream.headers.forEach((value, key) => {
        const normalizedKey = key.toLowerCase();
        const staleBufferedHeader = bufferedBody && ['content-length', 'etag', 'content-md5'].includes(normalizedKey);
        if (!STRIP_RESPONSE_HEADERS.has(normalizedKey) && !staleBufferedHeader) {
            res.setHeader(key, value);
        }
    });

    if (bufferedBody) {
        res.setHeader('Content-Length', String(bufferedBody.length));
        req.off('aborted', onClientClosed);
        res.off('close', onClientClosed);
        res.end(bufferedBody);
        return;
    }

    if (!upstream.body) {
        req.off('aborted', onClientClosed);
        res.off('close', onClientClosed);
        res.end();
        return;
    }

    try {
        await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (error) {
        if (abortController.signal.aborted || error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
            logger.debug('DICOMweb proxy stream closed by client', {
                path: subPath
            });
            return;
        }
        logger.error('DICOMweb proxy stream error', { target, error: error.message });
        if (!res.headersSent) res.status(502).json({ success: false, message: 'DICOMweb stream failed' });
        else res.end();
    } finally {
        req.off('aborted', onClientClosed);
        res.off('close', onClientClosed);
    }
};

module.exports = {
    proxyToOrthanc,
    getOrthancUrl,
    getOrthancAuthHeader,
    rewriteDicomJsonBulkDataUris
};
