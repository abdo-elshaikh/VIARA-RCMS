const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

describe('Database Migrations and Seeds Integrity Suite', () => {
    const databaseDir = path.resolve(__dirname, '../../database');
    const migrationsDir = path.join(databaseDir, 'migrations');
    const migrateJsPath = path.join(databaseDir, 'migrate.js');

    it('ensures database/migrate.js exists and defines MIGRATION_FILES and SEED_FILES', () => {
        expect(fs.existsSync(migrateJsPath)).toBe(true);
        const content = fs.readFileSync(migrateJsPath, 'utf8');
        expect(content).toContain('MIGRATION_FILES');
        expect(content).toContain('SEED_FILES');
    });

    it('ensures every registered migration file exists on disk and is non-empty', () => {
        const content = fs.readFileSync(migrateJsPath, 'utf8');
        const match = content.match(/MIGRATION_FILES\s*=\s*\[([\s\S]*?)\];/);
        expect(match).toBeTruthy();

        // Extract file list
        const files = eval('[' + match[1] + ']');
        expect(files.length).toBeGreaterThanOrEqual(160);

        const missing = [];
        const empty = [];

        for (const filename of files) {
            const fullPath = path.join(migrationsDir, filename);
            if (!fs.existsSync(fullPath)) {
                missing.push(filename);
            } else {
                const stat = fs.statSync(fullPath);
                if (stat.size === 0) {
                    empty.push(filename);
                }
            }
        }

        expect(missing).toEqual([]);
        expect(empty).toEqual([]);
    });

    it('ensures every registered seed file exists on disk and is non-empty', () => {
        const content = fs.readFileSync(migrateJsPath, 'utf8');
        const match = content.match(/SEED_FILES\s*=\s*\[([\s\S]*?)\];/);
        expect(match).toBeTruthy();

        const files = eval('[' + match[1] + ']');
        expect(files.length).toBeGreaterThanOrEqual(3);

        const missing = [];
        for (const filename of files) {
            const fullPath = path.join(databaseDir, filename);
            if (!fs.existsSync(fullPath)) {
                missing.push(filename);
            }
        }

        expect(missing).toEqual([]);
    });

    it('validates 163_hot_path_indexes.sql covers all expected hot queries idempotently', () => {
        const file163 = path.join(migrationsDir, '163_hot_path_indexes.sql');
        expect(fs.existsSync(file163)).toBe(true);

        const sql = fs.readFileSync(file163, 'utf8');
        expect(sql).toContain('idx_examinations_patient');
        expect(sql).toContain('idx_payments_invoice');
        expect(sql).toContain('idx_invoices_patient');
        expect(sql).toContain('idx_examinations_exam_started_at');
        expect(sql).toContain('idx_examinations_exam_completed_at');
        expect(sql).toContain('idx_examinations_arrived_at');
        expect(sql).toContain('idx_refunds_payment');
        expect(sql).toContain('idx_users_email_lower');

        // All index statements must be idempotent
        const createIndexStatements = sql.split(';')
            .map(s => s.trim())
            .filter(s => s.toUpperCase().includes('CREATE INDEX'));

        expect(createIndexStatements.length).toBe(8);
        for (const statement of createIndexStatements) {
            expect(statement.toUpperCase()).toContain('IF NOT EXISTS');
        }
    });
});
