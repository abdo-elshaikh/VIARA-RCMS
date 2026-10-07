'use strict';

const path = require('path');
const fs = require('fs');
const { isExcluded, collectFiles } = require('../../scripts/package-client-release');

describe('Client Release Packaging Automated Verifier', () => {
    const packageDir = path.resolve(__dirname, '../../viara-production-package');

    it('strictly excludes secrets, environments, and local data from release payload', () => {
        expect(isExcluded('.env')).toBe(true);
        expect(isExcluded('.env.local')).toBe(true);
        expect(isExcluded('sub/.env.production.local')).toBe(true);
        expect(isExcluded('client_license_14days.txt')).toBe(true);
        expect(isExcluded('database.dump')).toBe(true);
        expect(isExcluded('archive.dump.enc')).toBe(true);
        expect(isExcluded('pacs.pacs.zip.enc')).toBe(true);
        expect(isExcluded('backups/some_file.sql')).toBe(true);
        expect(isExcluded('uploads/patient_doc.pdf')).toBe(true);

        // Allowed files
        expect(isExcluded('.env.example')).toBe(false);
        expect(isExcluded('docker-compose.yml')).toBe(false);
        expect(isExcluded('database/migrate.js')).toBe(false);
        expect(isExcluded('scripts/restore.sh')).toBe(false);
        expect(isExcluded('scripts/restore.bat')).toBe(false);
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
