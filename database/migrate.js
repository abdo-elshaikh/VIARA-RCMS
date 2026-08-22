/**
 * Unified database migration and seed runner.
 * Usage:
 *   node database/migrate.js              # apply pending migrations after schema
 *   node database/migrate.js --fresh      # drop schema, apply schema + all migrations
 *   node database/migrate.js --seed       # run seeds after migrations
 *   node database/migrate.js --fresh --seed
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const localBackendPackage = path.join(__dirname, '../backend/package.json');
const runtimePackage = path.join(process.cwd(), 'package.json');
const backendRequire = createRequire(fs.existsSync(localBackendPackage) ? localBackendPackage : runtimePackage);
const { Pool } = backendRequire('pg');

const rootEnvPath = path.join(__dirname, '../.env');
const backendEnvPath = path.join(__dirname, '../backend/.env');
const envPath = fs.existsSync(rootEnvPath) ? rootEnvPath : backendEnvPath;
backendRequire('dotenv').config({ path: envPath });

if (!process.env.DATABASE_URL && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD) {
    const user = encodeURIComponent(process.env.POSTGRES_USER || 'VIARA');
    const password = encodeURIComponent(process.env.POSTGRES_PASSWORD);
    const database = encodeURIComponent(process.env.POSTGRES_DB || 'VIARA');
    const port = process.env.POSTGRES_PORT || '5432';
    process.env.DATABASE_URL = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
}

const MIGRATION_FILES = [
    '001_add_roles.sql',
    '002_add_notifications.sql',
    '003_add_inventory.sql',
    '004_expand_appointments.sql',
    '005_add_exam_types.sql',
    '100_performance_indexes.sql',
    '006_dashboard_indexes.sql',
    '007_fix_user_roles_enum.sql',
    '008_fix_appointment_overlap.sql',
    '009_patient_auth_and_search.sql',
    '010_refresh_tokens.sql',
    '011_user_profile_fields.sql',
    '012_patient_engagement_fields.sql',
    '013_extend_patient_demographics.sql',
    '014_scheduling_enhancements.sql',
    '015_referring_doctors.sql',
    '016_order_management.sql',
    '017_patient_queue_management.sql',
    '018_billing_cashier.sql',
    '019_insurance_contracts_claims.sql',
    '020_reporting_typing_workflow.sql',
    '021_result_delivery_management.sql',
    '022_patient_portal_online_access.sql',
    '023_doctor_portal.sql',
    '024_notifications_expanded.sql',
    '025_advanced_inventory.sql',
    '026_equipment_management.sql',
    '027_financial_management.sql',
    '028_hr_management.sql',
    '029_crm_marketing.sql',
    '030_security_events_and_roles.sql',
    '102_encrypt_pii_fields.sql',
    '031_portal_schema_consistency.sql',
    '103_refresh_token_audit.sql',
    '032_notification_preferences_consistency.sql',
    '104_performance_indexes.sql',
    '101_reporting_indices.sql',
    '033_expand_rbac_permissions.sql',
    '034_invoice_payment_discounts.sql',
    '035_patient_anonymized_status.sql',
    '036_refund_review_workflow.sql',
    '037_refund_cashier_shift.sql',
    '038_tamper_evident_audit.sql',
    '039_patient_merge_lineage.sql',
    '040_financial_integrity.sql',
    '041_claim_status_history.sql',
    '042_encrypt_notification_content.sql',
    '043_user_preferences.sql',
    '044_refresh_session_metadata.sql',
    '045_api_access_tokens.sql',
    '046_split_refund_permissions.sql',
    '047_add_cashier_role.sql',
    '048_payment_governance.sql',
    '049_examination_catalog_governance.sql',
    '050_machine_status_consistency.sql',
    '051_reception_cashier_permissions.sql',
    '052_pacs_imaging.sql',
    '053_modality_dicom_config.sql',
    '054_system_settings.sql',
    '055_pacs_permissions.sql',
    '056_pacs_quarantine_legacy_schema.sql',
    '057_case_report_permissions.sql',
    '058_seed_report_templates.sql',
    '059_seed_more_report_templates.sql',
    '060_inventory_supply_pricing.sql',
    '061_queue_governance.sql',
    '062_reception_supply_permissions.sql',
    '063_ai_report_drafts.sql',
    '064_pacs_ai_analysis_jobs.sql',
    '065_follow_up_cases.sql',
    '066_financial_reporting_v2.sql',
    '067_financial_integrity_constraints.sql',
    '068_financial_journal_backfill.sql',
    '069_reconcile_invoice_item_totals.sql',
    '070_claim_written_off_at.sql',
    '071_realtime_chat_and_messaging.sql',
    '072_notification_delivery_receipts.sql',
    '073_marketing_campaign_delivery_controls.sql',
    '074_marketing_campaign_content.sql',
    '075_add_developer_role.sql',
    '076_developer_permissions.sql',
    '077_audit_classification.sql',
    '078_privacy_workflow_hardening.sql',
    '079_privacy_export_retention_indexes.sql',
    '080_radiologist_report_ai_permissions.sql',
    '081_chat_rich_messages.sql',
    '082_insurance_contract_integrity.sql',
    '083_payroll_deductions_penalties.sql',
    '084_payroll_finance_posting.sql',
    '085_add_audit_change_columns.sql',
    '086_structured_audit_events.sql',
    '087_audit_governance_permissions.sql',
    '088_payroll_control_hardening.sql',
    '089_payroll_rule_approval_workflow.sql',
    '090_notifications_hardening.sql',
    '091_partial_payment_exceptions.sql',
    '092_final_delivery_full_payment.sql',
    '093_portal_login_lockout.sql',
    '094_move_startup_schema_changes.sql',
    '095_notification_permissions_and_routing.sql',
    '096_notification_templates_new_events.sql',
    '097_notification_missing_audience_policies.sql',
    '098_integration_hardening.sql',
    '105_cleanup_duplicate_constraints.sql',
    '106_exclusion_constraint_appointments.sql',
    '107_rename_duplicate_migrations_tracking.sql',
    '108_pacs_reconciliation_queue.sql',
    '109_appointment_idempotency_keys.sql',
    '110_expense_idempotency_key.sql',
    '111_waitlist_integrity.sql',
    '112_single_session_tracking.sql',
    '113_ensure_core_rbac_permissions.sql',
    '114_financial_branch_integrity.sql',
    '115_reception_integrity.sql',
    '116_audit_alert_idempotency.sql',
    '117_hr_payroll_integrity.sql',
    '118_attendance_stale_session_guard.sql',
    '119_staff_passkeys.sql'
];

const SEED_FILES = [
    'seed-rbac.sql',
    'seed.sql',
    'seed-demo-modules.sql'
];

const checksum = (sql) => crypto.createHash('sha256').update(sql).digest('hex');

const requireFiles = (files, directory, kind) => files.map((filename) => {
    const filePath = path.join(directory, filename);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing ${kind} file: ${filePath}`);
    }
    return { filename, filePath, sql: fs.readFileSync(filePath, 'utf8') };
});

const applySqlFile = async (client, migration, label) => {
    console.log(`  → ${label}`);
    await client.query(migration.sql);
};

const ensureMigrationTable = async (client, migrations) => {
    await client.query('BEGIN');
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename VARCHAR(255) PRIMARY KEY,
                checksum VARCHAR(64),
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)');

        const applied = await client.query('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
        const migrationsByName = new Map(migrations.map((migration) => [migration.filename, migration]));
        for (const row of applied.rows) {
            if (row.checksum) continue;
            const migration = migrationsByName.get(row.filename);
            if (!migration) {
                throw new Error(`Cannot checksum legacy migration not present in the manifest: ${row.filename}`);
            }
            await client.query(
                'UPDATE schema_migrations SET checksum = $2 WHERE filename = $1 AND checksum IS NULL',
                [row.filename, checksum(migration.sql)]
            );
        }

        await client.query('ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL');
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
};

const runMigrations = async (pool, { fresh = false } = {}) => {
    const migrations = requireFiles(MIGRATION_FILES, path.join(__dirname, 'migrations'), 'migration');
    const schema = fresh
        ? requireFiles(['schema.sql'], __dirname, 'schema')[0]
        : null;
    const client = await pool.connect();
    let lockAcquired = false;
    try {
        await client.query("SELECT pg_advisory_lock(hashtext('VIARA_schema_migrations'))");
        lockAcquired = true;

        if (fresh) {
            console.log('🧹 Dropping public schema...');
            await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
            console.log('🏗️  Applying schema.sql...');
            await applySqlFile(client, schema, 'schema.sql');
        }

        await ensureMigrationTable(client, migrations);

        for (const migration of migrations) {
            const migrationChecksum = checksum(migration.sql);
            const applied = await client.query(
                'SELECT checksum FROM schema_migrations WHERE filename = $1',
                [migration.filename]
            );
            if (applied.rows.length > 0) {
                if (applied.rows[0].checksum !== migrationChecksum) {
                    console.log(`  ℹ Updating checksum for modified migration: ${migration.filename}`);
                    await client.query('UPDATE schema_migrations SET checksum = $2 WHERE filename = $1', [migration.filename, migrationChecksum]);
                }
                continue;
            }

            console.log(`📦 Applying migration: ${migration.filename}`);
            await client.query('BEGIN');
            try {
                await applySqlFile(client, migration, migration.filename);
                await client.query(
                    'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
                    [migration.filename, migrationChecksum]
                );
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }

        console.log('✅ Migrations complete.');
    } finally {
        if (lockAcquired) {
            await client.query("SELECT pg_advisory_unlock(hashtext('VIARA_schema_migrations'))");
        }
        client.release();
    }
};

const runSeeds = async (pool) => {
    const seeds = requireFiles(SEED_FILES, __dirname, 'seed');
    const client = await pool.connect();
    try {
        for (const seed of seeds) {
            console.log(`🌱 Applying seed: ${seed.filename}`);
            await applySqlFile(client, seed, seed.filename);
        }
        console.log('✅ Seeds complete.');
    } finally {
        client.release();
    }
};

async function main() {
    const args = process.argv.slice(2);
    const fresh = args.includes('--fresh');
    const seed = args.includes('--seed');

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required but not set');
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await runMigrations(pool, { fresh });
        if (seed || fresh) {
            await runSeeds(pool);
        }
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { MIGRATION_FILES, SEED_FILES, runMigrations, runSeeds };
