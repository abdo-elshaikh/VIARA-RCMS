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
const { createRequire } = require('module');

const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));
const { Pool } = backendRequire('pg');

backendRequire('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const MIGRATION_FILES = [
    '001_add_roles.sql',
    '002_add_notifications.sql',
    '003_add_inventory.sql',
    '004_expand_appointments.sql',
    '005_add_exam_types.sql',
    '004_performance_indexes.sql',
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
    '030_encrypt_pii_fields.sql',
    '031_portal_schema_consistency.sql',
    '031_refresh_token_audit.sql',
    '032_notification_preferences_consistency.sql',
    '032_performance_indexes.sql',
    '024_reporting_indices.sql',
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
    '093_portal_login_lockout.sql'
];

const SEED_FILES = [
    'seed-rbac.sql',
    'seed.sql',
    'seed-demo-modules.sql'
];

const applySqlFile = async (client, filePath, label) => {
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`  → ${label}`);
    await client.query(sql);
};

const ensureMigrationTable = async (client) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);
};

const runMigrations = async (pool, { fresh = false } = {}) => {
    const client = await pool.connect();
    try {
        if (fresh) {
            console.log('🧹 Dropping public schema...');
            await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
            console.log('🏗️  Applying schema.sql...');
            await applySqlFile(client, path.join(__dirname, 'schema.sql'), 'schema.sql');
        }

        await ensureMigrationTable(client);

        for (const file of MIGRATION_FILES) {
            const filePath = path.join(__dirname, 'migrations', file);
            if (!fs.existsSync(filePath)) {
                console.warn(`  ⚠ Skipping missing migration: ${file}`);
                continue;
            }

            const applied = await client.query(
                'SELECT 1 FROM schema_migrations WHERE filename = $1',
                [file]
            );
            if (!fresh && applied.rows.length > 0) {
                continue;
            }

            console.log(`📦 Applying migration: ${file}`);
            await client.query('BEGIN');
            try {
                await applySqlFile(client, filePath, file);
                await client.query(
                    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
                    [file]
                );
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }

        console.log('✅ Migrations complete.');
    } finally {
        client.release();
    }
};

const runSeeds = async (pool) => {
    const client = await pool.connect();
    try {
        for (const file of SEED_FILES) {
            const filePath = path.join(__dirname, file);
            if (!fs.existsSync(filePath)) {
                console.warn(`  ⚠ Skipping missing seed: ${file}`);
                continue;
            }
            console.log(`🌱 Applying seed: ${file}`);
            await applySqlFile(client, filePath, file);
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

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
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
