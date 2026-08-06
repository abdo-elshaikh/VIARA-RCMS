const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const { spawn } = require('child_process');
const logger = require('../config/logger');

const isConfigured = () => {
    const endpoint = process.env.BACKUP_OFFSITE_ENDPOINT;
    const bucket = process.env.BACKUP_OFFSITE_BUCKET;
    const accessKey = process.env.BACKUP_OFFSITE_ACCESS_KEY;
    const secretKey = process.env.BACKUP_OFFSITE_SECRET_KEY;
    return Boolean(endpoint && bucket && accessKey && secretKey);
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

const uploadToRemote = (sourcePath, filename) => new Promise((resolve, reject) => {
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
        await uploadToRemote(filepath, filename);
        logger.info(`Offsite backup replicated: ${filename} (SHA-256: ${checksum.substring(0, 16)}...)`);
        return { replicated: true, filename, checksum };
    } catch (error) {
        logger.error(`Offsite backup replication failed for ${filename}: ${error.message}`);
        return { replicated: false, filename, error: error.message };
    }
};

module.exports = { isConfigured, replicateBackup };
