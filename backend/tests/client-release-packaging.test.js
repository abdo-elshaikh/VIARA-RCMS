'use strict';

const path = require('path');
const fs = require('fs');
const { isExcluded, collectFiles, validateReleaseInputs } = require('../../scripts/package-client-release');
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

describe('Client Release Packaging Automated Verifier', () => {
    const packageDir = path.resolve(__dirname, '../../viara-production-package');

    it('strictly excludes secrets, environments, and local data from release payload', () => {
        expect(isExcluded('.env')).toBe(true);
        expect(isExcluded('.env.local')).toBe(true);
        expect(isExcluded('.env.production')).toBe(true);
        expect(isExcluded('sub/.env.production.local')).toBe(true);
        expect(isExcluded('client_license_14days.txt')).toBe(true);
        expect(isExcluded('database.dump')).toBe(true);
        expect(isExcluded('archive.dump.enc')).toBe(true);
        expect(isExcluded('pacs.pacs.zip.enc')).toBe(true);
        expect(isExcluded('backups/some_file.sql')).toBe(true);
        expect(isExcluded('uploads/patient_doc.pdf')).toBe(true);
        expect(isExcluded('scripts/package-release.sh')).toBe(true);
        expect(isExcluded('build-images.ps1')).toBe(true);
        expect(isExcluded('.setup-complete')).toBe(true);
        expect(isExcluded('site-settings-customer.json')).toBe(true);
        expect(isExcluded('scripts/__pycache__/setup-client.pyc')).toBe(true);
        expect(isExcluded('pacs-worklists/patient.wl')).toBe(true);
        expect(isExcluded('tls/server.key')).toBe(true);

        // Allowed files
        expect(isExcluded('.env.example')).toBe(false);
        expect(isExcluded('docker-compose.yml')).toBe(false);
        expect(isExcluded('database/migrate.js')).toBe(false);
        expect(isExcluded('scripts/restore.sh')).toBe(false);
        expect(isExcluded('scripts/restore.bat')).toBe(false);
    });

    it('blocks release packaging until every image is immutably pinned and licenses are external', () => {
        const issues = validateReleaseInputs(packageDir);
        expect(issues.filter(issue => issue.includes('is empty'))).toHaveLength(IMAGE_VARIABLES.length);
        expect(issues).toHaveLength(IMAGE_VARIABLES.length + 1);
        expect(issues).toContain('README.md marks this package or its deployment documentation as unapproved; complete release approval first.');
        expect(fs.readFileSync(path.join(packageDir, 'docker-compose.yml'), 'utf8'))
            .toMatch(/LICENSE_KEY:\s+\$\{LICENSE_KEY:\?/);
    });

    it('accepts a synthetic release input set with pinned digests and a required external license', () => {
        const os = require('os');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viara-release-test-'));
        try {
            const template = IMAGE_VARIABLES.map(name => `${name}=registry.example.test/viara/${name.toLowerCase()}@sha256:${'a'.repeat(64)}`);
            template.push('LICENSE_KEY=');
            fs.writeFileSync(path.join(tempDir, '.env.example'), template.join('\n'));
            fs.writeFileSync(path.join(tempDir, 'docker-compose.yml'), 'LICENSE_KEY: ${LICENSE_KEY:?license required}\n');
            fs.writeFileSync(path.join(tempDir, 'README.md'), 'Approved release instructions.\n');
            expect(validateReleaseInputs(tempDir)).toEqual([]);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('rejects mutable image tags and a license embedded in the template', () => {
        const os = require('os');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viara-release-test-'));
        try {
            const template = IMAGE_VARIABLES.map(name => `${name}=registry.example.test/viara:latest`);
            template.push('LICENSE_KEY=signed-client-license');
            fs.writeFileSync(path.join(tempDir, '.env.example'), template.join('\n'));
            fs.writeFileSync(path.join(tempDir, 'docker-compose.yml'), 'LICENSE_KEY: ${LICENSE_KEY:?license required}\n');
            fs.writeFileSync(path.join(tempDir, 'README.md'), 'Approved release instructions.\n');
            const issues = validateReleaseInputs(tempDir);
            expect(issues.filter(issue => issue.includes('immutable'))).toHaveLength(IMAGE_VARIABLES.length);
            expect(issues).toContain('Do not embed a client license in .env.example; provide it separately through the approved secure channel.');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('accepts immutable local image IDs only for offline bundles', () => {
        const os = require('os');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viara-offline-test-'));
        try {
            fs.writeFileSync(path.join(tempDir, '.env.example'), IMAGE_VARIABLES.map(name => `${name}=sha256:${'b'.repeat(64)}`).join('\n'));
            fs.writeFileSync(path.join(tempDir, 'docker-compose.yml'), 'LICENSE_KEY: ${LICENSE_KEY:?license required}\n');
            fs.writeFileSync(path.join(tempDir, 'README.md'), 'Client setup instructions.\n');
            expect(validateReleaseInputs(tempDir, 'Offline')).toEqual([]);
            expect(validateReleaseInputs(tempDir, 'Online')).toHaveLength(IMAGE_VARIABLES.length);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('collects all required deployment files without omitting core components', async () => {
        const files = await collectFiles(packageDir);
        expect(files.length).toBeGreaterThan(50);

        const relativePaths = files.map(f => f.relativePath);

        // Required launchers and scripts
        expect(relativePaths).toContain('docker-compose.yml');
        expect(relativePaths).toContain('.env.example');
        expect(relativePaths).toContain('README.md');
        expect(relativePaths).toContain('scripts/start.sh');
        expect(relativePaths).toContain('scripts/start.bat');
        expect(relativePaths).toContain('scripts/backup.sh');
        expect(relativePaths).toContain('scripts/backup.bat');
        expect(relativePaths).toContain('scripts/restore.sh');
        expect(relativePaths).toContain('scripts/restore.bat');
        expect(relativePaths).not.toContain('scripts/package-release.sh');
        expect(relativePaths).not.toContain('scripts/package-release.ps1');
        expect(relativePaths).not.toContain('build-images.ps1');

        // Required migrations & database runner
        expect(relativePaths).toContain('database/migrate.js');
        expect(relativePaths).toContain('database/migrations/001_add_roles.sql');
        expect(relativePaths).toContain('database/migrations/191_pacs_measurement_drafts.sql');

        // Forbidden files must never be collected
        expect(relativePaths).not.toContain('.env');
        expect(relativePaths.some(p => p.includes('client_license'))).toBe(false);
        expect(relativePaths.some(p => p.endsWith('.dump'))).toBe(false);
    });
});
