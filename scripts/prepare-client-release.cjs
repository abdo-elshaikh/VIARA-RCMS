'use strict';
// Creates a clean deployment staging tree. Never copies an existing .env/license.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { collectFiles } = require('./package-client-release');
const root = path.resolve(__dirname, '..');
const refs = {
    VIARA_BACKEND_IMAGE: 'viara-backend:release-20261009',
    VIARA_FRONTEND_IMAGE: 'viara-frontend:release-20261009',
    VIARA_PORTAL_IMAGE: 'viara-portal:release-20261009',
    VIARA_OHIF_IMAGE: 'viara-ohif:release-20261009',
    POSTGRES_IMAGE: 'postgres:15-alpine', CLAMAV_IMAGE: 'clamav/clamav:stable',
    ORTHANC_IMAGE: 'mirror.gcr.io/orthancteam/orthanc:24.12.0',
    CADDY_IMAGE: 'caddy:2-alpine', REDIS_IMAGE: 'redis:7-alpine',
    WIREGUARD_IMAGE: 'lscr.io/linuxserver/wireguard:latest'
};
async function main() {
    const stage = process.env.VIARA_RELEASE_PACKAGE_DIR
        ? path.resolve(process.env.VIARA_RELEASE_PACKAGE_DIR)
        : path.join(root, 'dist/client-release/staging-20261009');
    await fs.mkdir(path.dirname(stage), { recursive: true });
    // Refuse to mutate an existing staged release.
    const images = {};
    for (const [key, defaultRef] of Object.entries(refs)) {
        const ref = process.env[key] || defaultRef;
        const [image] = JSON.parse(execFileSync('docker', ['image', 'inspect', ref], { encoding: 'utf8' }));
        if (image.Os !== 'linux' || image.Architecture !== 'amd64' || !/^sha256:[a-f0-9]{64}$/.test(image.Id)) throw Error(`Unsupported image: ${ref}`);
        images[key] = { source: ref, id: image.Id, platform: 'linux/amd64' };
    }
    await fs.mkdir(stage);
    const source = path.join(root, 'viara-production-package');
    for (const file of await collectFiles(source)) {
        if (file.relativePath.startsWith('images/')) continue;
        const destination = path.join(stage, file.relativePath);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        if (/\.(sh|py)$/.test(file.relativePath)) await fs.writeFile(destination, (await fs.readFile(file.fullPath, 'utf8')).replace(/\r\n/g, '\n'));
        else await fs.copyFile(file.fullPath, destination);
    }
    // Database artifacts must match the source used by this release.
    for (const file of ['schema.sql', 'migrate.js']) await fs.copyFile(path.join(root, 'database', file), path.join(stage, 'database', file));
    await fs.cp(path.join(root, 'database/migrations'), path.join(stage, 'database/migrations'), { recursive: true });
    await fs.cp(path.join(root, 'deploy/remote-access'), path.join(stage, 'remote-access'), { recursive: true });
    let template = await fs.readFile(path.join(stage, '.env.example'), 'utf8');
    template = template.replace(/^([A-Z0-9_]*IMAGE)=.*$/gm, (_, key) => `${key}=${images[key].id}`);
    await fs.writeFile(path.join(stage, '.env.example'), template);
    await fs.copyFile(path.join(stage, 'CLIENT_INSTALLATION_AR.md'), path.join(stage, 'README.md'));
    await fs.writeFile(path.join(stage, 'release-info.json'), JSON.stringify({ version: '1.0.0', releaseDate: process.env.VIARA_RELEASE_DATE || '2026-10-09', sourceCommit: process.env.VIARA_RELEASE_SOURCE_COMMIT || null, releaseApproval: 'pending-audit-remediation', mode: 'Offline', platform: 'linux/amd64', images, customerLicenseIncluded: false, customerSecretsIncluded: false, clinicalAcceptanceRequired: true }, null, 2));
    console.log(`Staging ready: ${stage}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
