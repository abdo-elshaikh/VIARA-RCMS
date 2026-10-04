const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { spawn } = require('child_process');
const logger = require('../config/logger');

const isConfigured = () => {
    const endpoint = process.env.BACKUP_OFFSITE_ENDPOINT;
    const bucket = process.env.BACKUP_OFFSITE_BUCKET;
    const accessKey = process.env.BACKUP_OFFSITE_ACCESS_KEY;
    const secretKey = process.env.BACKUP_OFFSITE_SECRET_KEY;
    return Boolean(endpoint && bucket && accessKey && secretKey);
};

const getSignatureKey = (key, dateStamp, regionName, serviceName) => {
    const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
};

const buildS3CmdArgs = (sourcePath, filename) => {
    const endpoint = process.env.BACKUP_OFFSITE_ENDPOINT;
    const bucket = process.env.BACKUP_OFFSITE_BUCKET;
    const region = process.env.BACKUP_OFFSITE_REGION || 'us-east-1';
    const prefix = (process.env.BACKUP_OFFSITE_PREFIX || '').replace(/\/+$/, '');
    const key = prefix ? `${prefix}/${filename}` : filename;
    const endpointUrl = /^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`;
    return [
        'cp',
        sourcePath,
        `s3://${bucket}/${key}`,
        '--endpoint-url', endpointUrl,
        '--region', region,
        '--sse', 'AES256',
        '--storage-class', 'STANDARD_IA',
    ];
};

/**
 * Native Node.js S3 / MinIO / Cloudflare R2 uploader with AWS SigV4 authorization.
 * Eliminates external dependency on `aws` CLI binary.
 */
const uploadNativeS3 = async (sourcePath, filename, contentSha256) => {
    const rawEndpoint = process.env.BACKUP_OFFSITE_ENDPOINT;
    const bucket = process.env.BACKUP_OFFSITE_BUCKET;
    const accessKey = process.env.BACKUP_OFFSITE_ACCESS_KEY;
    const secretKey = process.env.BACKUP_OFFSITE_SECRET_KEY;
    const region = process.env.BACKUP_OFFSITE_REGION || 'us-east-1';
    const prefix = (process.env.BACKUP_OFFSITE_PREFIX || '').replace(/\/+$/, '');
    const key = prefix ? `${prefix}/${filename}` : filename;

    const endpointUrl = /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`;
    const parsedUrl = new URL(endpointUrl);
    const isHttps = parsedUrl.protocol === 'https:';

    const stat = await fsp.stat(sourcePath);
    const contentLength = stat.size;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const s3Path = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const host = parsedUrl.host;

    const canonicalHeaders = 
        `content-length:${contentLength}\n` +
        `content-type:application/octet-stream\n` +
        `host:${host}\n` +
        `x-amz-content-sha256:${contentSha256}\n` +
        `x-amz-date:${amzDate}\n`;

    const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
        'PUT',
        s3Path,
        '',
        canonicalHeaders,
        signedHeaders,
        contentSha256
    ].join('\n');

    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        canonicalRequestHash
    ].join('\n');

    const signingKey = getSignatureKey(secretKey, dateStamp, region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers = {
        'Host': host,
        'Content-Length': contentLength,
        'Content-Type': 'application/octet-stream',
        'x-amz-content-sha256': contentSha256,
        'x-amz-date': amzDate,
        'Authorization': authorization
    };

    const reqOptions = {
        method: 'PUT',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: s3Path,
        headers,
        timeout: 120000
    };

    return new Promise((resolve, reject) => {
        const client = isHttps ? https : http;
        const req = client.request(reqOptions, (res) => {
            let resBody = '';
            res.on('data', (d) => { if (resBody.length < 2000) resBody += d.toString(); });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ statusCode: res.statusCode });
                } else {
                    reject(new Error(`S3 upload failed with status ${res.statusCode}: ${resBody.trim() || res.statusMessage}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('S3 upload timed out after 120s'));
        });

        const readStream = fs.createReadStream(sourcePath);
        readStream.on('error', (err) => {
            req.destroy();
            reject(err);
        });
        readStream.pipe(req);
    });
};

const uploadWithCli = (sourcePath, filename) => new Promise((resolve, reject) => {
    const args = buildS3CmdArgs(sourcePath, filename);
    const child = spawn('aws', args, {
        env: {
            ...process.env,
            AWS_ACCESS_KEY_ID: process.env.BACKUP_OFFSITE_ACCESS_KEY,
            AWS_SECRET_ACCESS_KEY: process.env.BACKUP_OFFSITE_SECRET_KEY,
        },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { if (stdout.length < 4000) stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { if (stderr.length < 4000) stderr += chunk.toString(); });
    child.once('error', (error) => {
        if (error.code === 'ENOENT') {
            return reject(new Error('aws CLI is not installed or not on PATH'));
        }
        reject(error);
    });
    child.once('close', (code) => {
        if (code === 0) return resolve();
        reject(new Error(`aws s3 cp exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
    });
});

const uploadToRemote = async (sourcePath, filename, contentSha256) => {
    try {
        return await uploadNativeS3(sourcePath, filename, contentSha256);
    } catch (nativeErr) {
        logger.warn('Native S3 upload failed, checking AWS CLI fallback...', { error: nativeErr.message });
        try {
            return await uploadWithCli(sourcePath, filename);
        } catch (cliErr) {
            // Throw the original native error if CLI also fails
            throw new Error(`Offsite S3 upload failed (Native: ${nativeErr.message}; CLI: ${cliErr.message})`);
        }
    }
};

const computeChecksum = async (filepath) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filepath);
    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
    });
    return hash.digest('hex');
};

const replicateBackup = async (backup) => {
    if (!isConfigured()) {
        logger.warn('Backup offsite replication skipped — BACKUP_OFFSITE_* environment variables not set');
        return { replicated: false, reason: 'not_configured' };
    }

    const { filename, filepath } = backup;
    if (!filepath || !await fsp.stat(filepath).then(() => true).catch(() => false)) {
        return { replicated: false, reason: 'source_not_found' };
    }

    try {
        const checksum = await computeChecksum(filepath);
        await uploadToRemote(filepath, filename, checksum);
        for (const companion of backup.companions || []) {
            await uploadToRemote(companion.filepath, companion.filename, await computeChecksum(companion.filepath));
        }
        logger.info(`Offsite backup replicated: ${filename} (SHA-256: ${checksum.substring(0, 16)}...)`);
        return { replicated: true, filename, checksum };
    } catch (error) {
        logger.error(`Offsite backup replication failed for ${filename}: ${error.message}`);
        return { replicated: false, filename, error: error.message };
    }
};

module.exports = {
    isConfigured,
    replicateBackup,
    uploadNativeS3,
    buildS3CmdArgs,
    getSignatureKey,
    computeChecksum
};
