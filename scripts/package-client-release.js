#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');
const { pipeline } = require('stream/promises');

// Resolve yazl from backend/node_modules if not in root
let yazl;
try {
    yazl = require('yazl');
} catch {
    yazl = require(path.resolve(__dirname, '../backend/node_modules/yazl'));
}

const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_DIR = path.join(ROOT_DIR, 'viara-production-package');
const DIST_DIR = path.resolve(process.env.VIARA_RELEASE_OUTPUT_DIR || path.join(ROOT_DIR, 'dist', 'client-release'));
const VERSION = require(path.join(ROOT_DIR, 'package.json')).version;
const IMAGE_VARIABLES = [
    'VIARA_BACKEND_IMAGE',
    'VIARA_FRONTEND_IMAGE',
    'VIARA_PORTAL_IMAGE',
    'VIARA_OHIF_IMAGE',
    'POSTGRES_IMAGE',
    'CLAMAV_IMAGE',
    'ORTHANC_IMAGE',
    'CADDY_IMAGE',
    'REDIS_IMAGE',
    'WIREGUARD_IMAGE'
];
const RELEASE_ENGINEERING_FILES = new Set([
    'BUILD_AND_PUSH.md',
    'build-images.ps1',
    'build-images.sh',
    'scripts/package-release.ps1',
    'scripts/package-release.sh'
]);

// Files and patterns strictly excluded from the release archive
const EXCLUDED_PATTERNS = [
    /^\.env$/,
    /^\.env\.local$/,
    /^\.env\..*\.local$/,
    /^client_license_.*\.txt$/,
    /\.(dump|dump\.enc|pacs\.zip\.enc)$/,
    /^\.git/,
    /^backups(\/|\\)/,
    /^uploads(\/|\\)/,
    /^license(\/|\\)/,
    /^pacs-cold(\/|\\)/
];

const isExcluded = (relativePath) => {
    const normalized = relativePath.replace(/\\/g, '/');
    if (normalized === 'pacs-worklists' || normalized.startsWith('pacs-worklists/')) return true;
    const base = path.basename(normalized);
    if (base === '__pycache__' || base.endsWith('.pyc') || base.startsWith('.setup-') || /^site-settings.*\.json$/i.test(base)
        || /(?:\.key$|private.*\.pem$|\.log$|\.zip$)/i.test(base)) return true;
    if (RELEASE_ENGINEERING_FILES.has(normalized)) {
        return true;
    }
    if (base === '.env.example') {
        return false;
    }
    if (base.startsWith('.env')) {
        return true;
    }
    for (const pattern of EXCLUDED_PATTERNS) {
        if (pattern.test(base) || pattern.test(normalized)) {
            return true;
        }
    }
    return false;
};

const collectFiles = async (dir, baseDir = dir) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

        if (isExcluded(relativePath)) {
            continue;
        }

        if (entry.isDirectory()) {
            const nested = await collectFiles(fullPath, baseDir);
            files = files.concat(nested);
        } else if (entry.isFile()) {
            files.push({
                fullPath,
                relativePath,
                size: (await fsp.stat(fullPath)).size
            });
        }
    }
    return files;
};

const computeFileSha256 = async (filepath) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filepath);
    await new Promise((resolve, reject) => {
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
    });
    return hash.digest('hex');
};

const parseEnvTemplate = (content) => {
    const values = new Map();
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const separator = trimmed.indexOf('=');
        if (separator < 1) {
            continue;
        }
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim();
        if (values.has(key)) {
            throw new Error(`Duplicate setting in .env.example: ${key}`);
        }
        values.set(key, value);
    }
    return values;
};

const validateReleaseInputs = (packageDir = PACKAGE_DIR, mode = 'Online') => {
    const issues = [];
    const templatePath = path.join(packageDir, '.env.example');
    const composePath = path.join(packageDir, 'docker-compose.yml');
    const readmePath = path.join(packageDir, 'README.md');
    if (!fs.existsSync(templatePath) || !fs.existsSync(composePath) || !fs.existsSync(readmePath)) {
        return ['Required .env.example, docker-compose.yml, or README.md is missing.'];
    }

    const values = parseEnvTemplate(fs.readFileSync(templatePath, 'utf8'));
    for (const variable of IMAGE_VARIABLES) {
        const image = values.get(variable) || '';
        if (!image) {
            issues.push(`${variable} is empty; supply the approved image@sha256 digest.`);
        } else if (!/^[^@\s]+@sha256:[a-f0-9]{64}$/i.test(image)
            && !(mode === 'Offline' && /^sha256:[a-f0-9]{64}$/i.test(image))) {
            issues.push(`${variable} must be an immutable image@sha256:<64 hex> reference.`);
        }
    }

    if (values.get('LICENSE_KEY')) {
        issues.push('Do not embed a client license in .env.example; provide it separately through the approved secure channel.');
    }
    const compose = fs.readFileSync(composePath, 'utf8');
    if (!/\$\{LICENSE_KEY:\?[^}]+\}/.test(compose)) {
        issues.push('docker-compose.yml must require LICENSE_KEY and must not supply a default license.');
    }
    const readme = fs.readFileSync(readmePath, 'utf8');
    if (readme.includes('غير معتمد للتسليم كإصدار عميل') || readme.includes('مسودات مؤرشفة وليست تعليمات تشغيل معتمدة')) {
        issues.push('README.md marks this package or its deployment documentation as unapproved; complete release approval first.');
    }
    return issues;
};

const exportOfflineImages = (images, directory) => {
    fs.mkdirSync(directory, { recursive: true });
    const archives = [];
    for (const image of images) {
        const safeName = image.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const archivePath = path.join(directory, `${safeName}.tar`);
        execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore' });
        execFileSync('docker', ['image', 'save', '--output', archivePath, image], { stdio: 'inherit' });
        archives.push(archivePath);
    }
    return archives;
};

async function main(options = {}) {
    const packageDir = path.resolve(options.packageDir || process.env.VIARA_RELEASE_PACKAGE_DIR || PACKAGE_DIR);
    const mode = options.mode || process.argv[2] || 'Online';
    if (!['Online', 'Offline'].includes(mode)) {
        throw new Error('Packaging mode must be Online or Offline.');
    }
    console.log('================================================================');
    console.log(` 📦 VIARA-RCMS Client Release Packaging Tool (v${VERSION}, ${mode})`);
    console.log('================================================================\n');

    // 1. Ensure source production package directory exists
    if (!fs.existsSync(packageDir)) {
        throw new Error(`Production package directory not found at: ${packageDir}`);
    }

    const inputIssues = validateReleaseInputs(packageDir, mode);
    if (inputIssues.length) {
        throw new Error(`Release preflight failed:\n- ${inputIssues.join('\n- ')}`);
    }

    const values = parseEnvTemplate(fs.readFileSync(path.join(packageDir, '.env.example'), 'utf8'));
    const images = IMAGE_VARIABLES.map(variable => values.get(variable));
    let stagingDir;
    let imageDirectory;
    let partialZipPath;
    try {
        if (mode === 'Offline') {
            if (process.env.VIARA_RELEASE_IMAGE_CACHE_DIR) {
                imageDirectory = path.resolve(process.env.VIARA_RELEASE_IMAGE_CACHE_DIR);
                for (const image of images) {
                    const archive = `${image.replace(/[^a-zA-Z0-9._-]+/g, '_')}.tar`;
                    const archivePath = path.join(imageDirectory, archive);
                    const expected = (await fsp.readFile(`${archivePath}.sha256`, 'utf8')).trim().split(/\s+/)[0];
                    if (!/^[a-f0-9]{64}$/.test(expected) || await computeFileSha256(archivePath) !== expected) throw new Error(`Offline cache checksum mismatch: ${archive}`);
                    execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore' });
                }
            } else {
                stagingDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'viara-release-'));
                imageDirectory = path.join(stagingDir, 'images');
                await exportOfflineImages(images, imageDirectory);
            }
            for (const archive of await fsp.readdir(imageDirectory)) {
                if (!archive.endsWith('.tar') || process.env.VIARA_RELEASE_IMAGE_CACHE_DIR) continue;
                const archivePath = path.join(imageDirectory, archive);
                const digest = await computeFileSha256(archivePath);
                await fsp.writeFile(`${archivePath}.sha256`, `${digest}  ${archive}\n`, { flag: 'wx' });
            }
        }

        // 2. Scan and collect files only after release inputs have passed validation.
        console.log(`[INFO] Scanning ${PACKAGE_DIR} for distributable assets...`);
        const files = (await collectFiles(packageDir)).filter(file => !file.relativePath.startsWith('images/'));
        if (mode === 'Offline') {
            const names = images.flatMap(image => {
                const archive = `${image.replace(/[^a-zA-Z0-9._-]+/g, '_')}.tar`;
                return [archive, `${archive}.sha256`];
            });
            for (const name of names) {
                const fullPath = path.join(imageDirectory, name);
                files.push({
                    fullPath,
                    relativePath: `images/${name}`,
                    size: (await fsp.stat(fullPath)).size
                });
            }
        }
        console.log(`[INFO] Found ${files.length} release files (excluding secrets and temp data).\n`);

        // Verify key assets are present
        const relativeNames = files.map(f => f.relativePath);
        const requiredAssets = [
            'setup.sh',
            'scripts/setup-client.py',
            'CLIENT_INSTALLATION_AR.md',
            'docker-compose.yml',
            '.env.example',
            'README.md',
            'scripts/start.sh',
            'scripts/start.bat',
            'scripts/backup.sh',
            'scripts/backup.bat',
            'scripts/restore.sh',
            'scripts/restore.bat',
            'database/migrate.js'
        ];

        for (const req of requiredAssets) {
            if (!relativeNames.includes(req)) {
                throw new Error(`CRITICAL: Required release asset missing: ${req}`);
            }
        }

        // 3. Create an immutable, timestamped ZIP; never replace an existing artifact.
        await fsp.mkdir(DIST_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
        const zipFilename = `viara-rcms-client-v${VERSION}-${mode}-${timestamp}.zip`;
        const zipFilePath = path.join(DIST_DIR, zipFilename);
        partialZipPath = `${zipFilePath}.partial-${process.pid}`;
        const manifestFilename = `release-manifest-v${VERSION}-${mode}-${timestamp}.json`;
        const manifestFilePath = path.join(DIST_DIR, manifestFilename);
        const checksumPath = `${zipFilePath}.sha256`;
        if ([zipFilePath, manifestFilePath, checksumPath].some(filepath => fs.existsSync(filepath))) {
            throw new Error(`Release output already exists for timestamp ${timestamp}; retry after the next second.`);
        }
        const zipFile = new yazl.ZipFile();

        console.log(`[INFO] Assembling compressed release bundle: ${zipFilename}...`);
        for (const file of files) {
            const isScript = file.relativePath.endsWith('.sh') || file.relativePath.endsWith('.bat');
            const fileMode = isScript ? 0o100755 : 0o100644;
            const archivePath = `viara-production-package/${file.relativePath}`;
            if (/\.(sh|py)$/.test(file.relativePath)) {
                const payload = Buffer.from((await fsp.readFile(file.fullPath, 'utf8')).replace(/\r\n/g, '\n'));
                file.size = payload.length;
                zipFile.addBuffer(payload, archivePath, { mode: fileMode });
            } else zipFile.addFile(file.fullPath, archivePath, { mode: fileMode });
        }

        zipFile.end({ forceZip64Format: true });
        await pipeline(zipFile.outputStream, fs.createWriteStream(partialZipPath, { flags: 'wx' }));

        // 4. Compute the archive checksum and write a versioned manifest.
        const zipSha256 = await computeFileSha256(partialZipPath);
        const zipStat = await fsp.stat(partialZipPath);

        const manifest = {
            product: 'VIARA-RCMS Enterprise Radiology Information & PACS System',
            version: VERSION,
            mode,
            build_timestamp: new Date().toISOString(),
            archive_name: zipFilename,
            archive_size_bytes: zipStat.size,
            archive_size_mb: (zipStat.size / (1024 * 1024)).toFixed(2) + ' MB',
            sha256: zipSha256,
            file_count: files.length,
            image_references: images,
            files: files.map(f => ({ path: f.relativePath, size_bytes: f.size }))
        };

        const partialManifestPath = `${manifestFilePath}.partial-${process.pid}`;
        const partialChecksumPath = `${checksumPath}.partial-${process.pid}`;
        try {
            await fsp.writeFile(partialManifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', flag: 'wx' });
            await fsp.writeFile(partialChecksumPath, `${zipSha256}  ${zipFilename}\n`, { flag: 'wx' });
            await fsp.rename(partialZipPath, zipFilePath);
            await fsp.rename(partialManifestPath, manifestFilePath);
            await fsp.rename(partialChecksumPath, checksumPath);
        } catch (error) {
            await Promise.all([
                fsp.rm(partialManifestPath, { force: true }),
                fsp.rm(partialChecksumPath, { force: true })
            ]);
            throw error;
        }

        console.log('\n================================================================');
        console.log(' ✅ RELEASE PACKAGE CREATED SUCCESSFULLY');
        console.log('================================================================');
        console.log(`Package Archive:  ${zipFilePath}`);
        console.log(`Package Size:     ${manifest.archive_size_mb}`);
        console.log(`Files Included:   ${files.length}`);
        console.log(`SHA-256 Digest:   ${zipSha256}`);
        console.log(`Release Manifest: ${manifestFilePath}`);
        console.log('================================================================\n');
    } finally {
        if (partialZipPath) {
            await fsp.rm(partialZipPath, { force: true });
        }
        if (stagingDir) {
            await fsp.rm(stagingDir, { recursive: true, force: true });
        }
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error(`\n[FATAL ERROR] Packaging failed: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { main, isExcluded, collectFiles, parseEnvTemplate, validateReleaseInputs };
