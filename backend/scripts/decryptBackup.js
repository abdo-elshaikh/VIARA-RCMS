const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const MAGIC = Buffer.from('RCMSBKP2');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH;

const [inputPath, outputPath] = process.argv.slice(2);

const getBackupKey = () => {
    const configuredKey = process.env.BACKUP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!/^[0-9a-fA-F]{64}$/.test(configuredKey || '')) {
        throw new Error('BACKUP_ENCRYPTION_KEY or ENCRYPTION_KEY must be a 64-character hex value');
    }
    return Buffer.from(configuredKey, 'hex');
};

const assertPath = (label, value) => {
    if (!value) throw new Error(`${label} path is required`);
    return path.resolve(value);
};

const decryptBackup = async () => {
    const source = assertPath('Input', inputPath);
    const destination = assertPath('Output', outputPath);
    const stat = await fsp.stat(source);

    if (stat.size <= HEADER_LENGTH + TAG_LENGTH) {
        throw new Error('Encrypted backup is too small or truncated');
    }

    const fd = await fsp.open(source, 'r');
    try {
        const header = Buffer.alloc(HEADER_LENGTH);
        await fd.read(header, 0, HEADER_LENGTH, 0);
        if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
            throw new Error('Unsupported encrypted backup format');
        }

        const tag = Buffer.alloc(TAG_LENGTH);
        await fd.read(tag, 0, TAG_LENGTH, stat.size - TAG_LENGTH);

        const iv = header.subarray(MAGIC.length);
        const decipher = crypto.createDecipheriv('aes-256-gcm', getBackupKey(), iv);
        decipher.setAuthTag(tag);

        await pipeline(
            fs.createReadStream(source, { start: HEADER_LENGTH, end: stat.size - TAG_LENGTH - 1 }),
            decipher,
            fs.createWriteStream(destination, { mode: 0o600 })
        );
    } catch (error) {
        if (fs.existsSync(destination)) await fsp.unlink(destination);
        throw error;
    } finally {
        await fd.close();
    }
};

decryptBackup()
    .then(() => {
        console.log(`Decrypted backup written to ${path.resolve(outputPath)}`);
    })
    .catch((error) => {
        console.error(`Backup decrypt failed: ${error.message}`);
        process.exit(1);
    });
