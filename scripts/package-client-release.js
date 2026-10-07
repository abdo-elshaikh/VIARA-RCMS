#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
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
const DIST_DIR = path.join(ROOT_DIR, 'dist', 'client-release');
const VERSION = '1.0.0';

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
    const base = path.basename(normalized);
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

async function main() {
    console.log('================================================================');
    console.log(` 📦 VIARA-RCMS Client Release Packaging Tool (v${VERSION})`);
    console.log('================================================================\n');

    // 1. Ensure source production package directory exists
    if (!fs.existsSync(PACKAGE_DIR)) {
        throw new Error(`Production package directory not found at: ${PACKAGE_DIR}`);
    }

    // 2. Ensure dist directory exists
    await fsp.mkdir(DIST_DIR, { recursive: true });

    // 3. Scan and collect files to package
    console.log(`[INFO] Scanning ${PACKAGE_DIR} for distributable assets...`);
    const files = await collectFiles(PACKAGE_DIR);
    console.log(`[INFO] Found ${files.length} release files (excluding secrets and temp data).\n`);

    // Verify key assets are present
    const relativeNames = files.map(f => f.relativePath);
    const requiredAssets = [
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

    // 4. Create ZIP archive
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
    const zipFilename = `viara-rcms-client-v${VERSION}-${timestamp}.zip`;
    const zipFilePath = path.join(DIST_DIR, zipFilename);
    const zipFile = new yazl.ZipFile();

    console.log(`[INFO] Assembling compressed release bundle: ${zipFilename}...`);
    for (const file of files) {
        // Maintain proper file permissions (0755 for scripts, 0644 for others)
        const isScript = file.relativePath.endsWith('.sh') || file.relativePath.endsWith('.bat');
        const mode = isScript ? 0o100755 : 0o100644;
        zipFile.addFile(file.fullPath, `viara-production-package/${file.relativePath}`, { mode });
    }

    zipFile.end({ forceZip64Format: true });
    await pipeline(zipFile.outputStream, fs.createWriteStream(zipFilePath));

    // 5. Compute archive checksum
    const zipSha256 = await computeFileSha256(zipFilePath);
    const zipStat = await fsp.stat(zipFilePath);

    // 6. Generate Release Manifest
    const manifest = {
        product: 'VIARA-RCMS Enterprise Radiology Information & PACS System',
        version: VERSION,
        build_timestamp: new Date().toISOString(),
        archive_name: zipFilename,
        archive_size_bytes: zipStat.size,
        archive_size_mb: (zipStat.size / (1024 * 1024)).toFixed(2) + ' MB',
        sha256: zipSha256,
        file_count: files.length,
        files: files.map(f => ({ path: f.relativePath, size_bytes: f.size }))
    };

    const manifestFilename = `release-manifest-v${VERSION}-${timestamp}.json`;
    const manifestFilePath = path.join(DIST_DIR, manifestFilename);
    await fsp.writeFile(manifestFilePath, JSON.stringify(manifest, null, 2), 'utf8');

    // Also update current latest symlink/copy
    const latestZipPath = path.join(DIST_DIR, `viara-rcms-client-latest.zip`);
    const latestManifestPath = path.join(DIST_DIR, `release-manifest-latest.json`);
    await fsp.copyFile(zipFilePath, latestZipPath);
    await fsp.copyFile(manifestFilePath, latestManifestPath);

    console.log('\n================================================================');
    console.log(' ✅ RELEASE PACKAGE CREATED SUCCESSFULLY');
    console.log('================================================================');
    console.log(`Package Archive:  ${zipFilePath}`);
    console.log(`Package Size:     ${manifest.archive_size_mb}`);
    console.log(`Files Included:   ${files.length}`);
    console.log(`SHA-256 Digest:   ${zipSha256}`);
    console.log(`Release Manifest: ${manifestFilePath}`);
    console.log('================================================================\n');
}

if (require.main === module) {
    main().catch(err => {
        console.error(`\n[FATAL ERROR] Packaging failed: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { main, isExcluded, collectFiles };
