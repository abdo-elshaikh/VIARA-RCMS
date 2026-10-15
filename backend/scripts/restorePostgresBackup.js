#!/usr/bin/env node
require('dotenv').config({ quiet: true });
const path = require('path');
const {
    listBackupFiles,
    restorePostgresBackup,
    isValidBackupFilename
} = require('../src/services/postgresBackupService');

const parseArgs = () => {
    const args = process.argv.slice(2);
    const options = {
        list: false,
        file: null,
        confirm: false,
        verifyOnly: false,
        skipPacs: false,
        allowNonEmptyPacs: false
    };

    for (const arg of args) {
        if (arg === '--list' || arg === '-l') options.list = true;
        else if (arg.startsWith('--file=')) options.file = arg.slice(7);
        else if (arg === '--confirm') options.confirm = true;
        else if (arg === '--verify-only') options.verifyOnly = true;
        else if (arg === '--skip-pacs') options.skipPacs = true;
        else if (arg === '--allow-non-empty-pacs') options.allowNonEmptyPacs = true;
        else if (!arg.startsWith('--') && !options.file) options.file = arg;
    }
    return options;
};

const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
};

async function main() {
    const options = parseArgs();

    if (options.list || !options.file) {
        console.log('\n======================================================');
        console.log('       VIARA-RCMS Available System Backups');
        console.log('======================================================');
        const backups = await listBackupFiles();
        if (backups.length === 0) {
            console.log('No backup archives found in BACKUP_DIR.\n');
            return;
        }

        console.table(backups.map(b => ({
            Filename: b.filename,
            Type: b.type,
            Size: formatBytes(b.size_bytes),
            Created: new Date(b.created_at).toLocaleString()
        })));

        console.log('\nUsage:');
        console.log('  node scripts/restorePostgresBackup.js --file=<filename> [--confirm] [--verify-only] [--skip-pacs]');
        console.log('\nExample (dry-run check):');
        console.log(`  node scripts/restorePostgresBackup.js --file=${backups[0].filename} --verify-only`);
        console.log('\nExample (execute restore):');
        console.log(`  node scripts/restorePostgresBackup.js --file=${backups[0].filename} --confirm\n`);
        return;
    }

    if (!isValidBackupFilename(options.file)) {
        console.error(`[ERROR] Invalid backup filename: ${options.file}`);
        process.exitCode = 1;
        return;
    }

    if (!options.verifyOnly && !options.confirm) {
        console.error('\n======================================================');
        console.error(' [SAFETY INTERLOCK] Confirmation Required');
        console.error('======================================================');
        console.error(`Restoring archive '${options.file}' will overwrite`);
        console.error('the active PostgreSQL database and reload PACS archives.');
        console.error('');
        console.error('To proceed, re-run with either:');
        console.error('  --confirm      Execute restore against database & PACS');
        console.error('  --verify-only  Test decryption, checksums, and dump integrity only');
        console.error('======================================================\n');
        process.exitCode = 1;
        return;
    }

    console.log('\n======================================================');
    console.log(` VIARA-RCMS Restore: ${options.verifyOnly ? 'Integrity Verification (Dry-Run)' : 'Execution'}`);
    console.log('======================================================');
    console.log(`Archive: ${options.file}`);
    console.log(`PACS Restore: ${options.skipPacs ? 'Skipped' : 'Enabled'}`);
    console.log('Starting operation...\n');

    const result = await restorePostgresBackup(options.file, {
        verifyOnly: options.verifyOnly,
        restorePacs: !options.skipPacs,
        allowNonEmptyPacs: options.allowNonEmptyPacs
    });

    console.log('\n======================================================');
    console.log(options.verifyOnly ? ' [SUCCESS] Backup Verification Passed' : ' [SUCCESS] Restore Completed Successfully');
    console.log('======================================================');
    console.log(`Filename:   ${result.filename}`);
    console.log(`Verified:   ${result.verified}`);
    console.log(`Dry Run:    ${result.dry_run}`);
    console.log(`Timestamp:  ${result.restored_at}`);
    if (result.pacs) {
        console.log(`PACS Image: ${result.pacs.restored !== undefined ? result.pacs.restored + ' instances restored' : result.pacs.instance_count + ' instances verified'}`);
    }
    console.log('======================================================\n');
}

if (require.main === module) {
    main().catch(err => {
        console.error(`\n[FATAL RESTORE ERROR] ${err.message}`);
        process.exitCode = 1;
    });
}

module.exports = { main, parseArgs };
