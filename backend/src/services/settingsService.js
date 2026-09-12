class SettingsService {
    constructor() {
        this.cache = {};
        this.cacheTime = 0;
        this.CACHE_TTL = 60000; // 1 minute
        this.pool = null;
    }

    async initDb(pool) {
        if (pool) this.pool = pool;
        if (!this.pool) return;
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    setting_key VARCHAR(100) PRIMARY KEY,
                    setting_value TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await this.pool.query(`
                INSERT INTO system_settings (setting_key, setting_value)
                VALUES 
                    ('pacs_server_aet', $4),
                    ('pacs_server_ip', $5),
                    ('pacs_server_port', $6),
                    ('orthanc_api_url', $1),
                    ('orthanc_username', $2),
                    ('orthanc_password', $3)
                ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
            `, [
                process.env.ORTHANC_API_URL || process.env.ORTHANC_URL || 'http://orthanc:8042',
                process.env.ORTHANC_USERNAME || 'VIARA',
                process.env.ORTHANC_PASSWORD,
                process.env.ORTHANC_AET || 'MiPACS2',
                process.env.PACS_SERVER_IP || process.env.ORTHANC_DICOM_HOST || '127.0.0.1',
                process.env.PACS_DICOM_PORT || '4242'
            ]);

            await this.pool.query(`
                -- Ensure Base Permissions exist
                INSERT INTO permissions (name, module, description) VALUES
                -- Patients
                ('VIEW_PATIENTS', 'Patients', 'View patient list and basic details'),
                ('CREATE_PATIENTS', 'Patients', 'Register new patients'),
                ('EDIT_PATIENTS', 'Patients', 'Modify patient details'),
                ('DELETE_PATIENTS', 'Patients', 'Delete or archive patients'),
                ('MERGE_PATIENTS', 'Patients', 'Merge duplicate patient records'),
                ('EXPORT_PATIENT_DATA', 'Patients', 'Export patient records and history'),
                ('ANONYMIZE_PATIENT_DATA', 'Patients', 'Perform irreversible patient anonymization'),

                -- Scheduling
                ('VIEW_APPOINTMENTS', 'Scheduling', 'View appointments calendar and list'),
                ('CREATE_APPOINTMENTS', 'Scheduling', 'Create new appointments'),
                ('EDIT_APPOINTMENTS', 'Scheduling', 'Reschedule or modify appointments'),
                ('DELETE_APPOINTMENTS', 'Scheduling', 'Cancel or delete appointments'),
                ('MANAGE_WAITLIST', 'Scheduling', 'Manage waitlist and scheduling offers'),

                -- Clinical
                ('VIEW_EXAMS', 'Clinical', 'View exam worklist and details'),
                ('PERFORM_EXAMS', 'Clinical', 'Start and complete radiological exams'),
                ('WRITE_REPORTS', 'Clinical', 'Draft and edit diagnostic reports'),
                ('REVIEW_REPORTS', 'Clinical', 'Review diagnostic reports before approval'),
                ('FINALIZE_REPORTS', 'Clinical', 'Approve and finalize diagnostic reports'),
                ('AMEND_REPORTS', 'Clinical', 'Amend finalized reports'),
                ('VIEW_REPORTS', 'Clinical', 'View case reports worklist, print, and export'),
                ('DELIVER_RESULTS', 'Clinical', 'Release and deliver diagnostic results to patients'),
                ('IMPROVE_REPORT_FORMAT', 'Clinical', 'Use AI to reformat and polish report text'),

                -- Clinical Operations & Safety
                ('MANAGE_QUEUE', 'Clinical Operations', 'Change exam queue stages and operational routing'),
                ('MANAGE_SAFETY', 'Clinical Operations', 'Record and review examination safety screening'),
                ('OVERRIDE_SAFETY_CHECKLIST', 'Clinical Operations', 'Override clinical safety warnings with justification'),

                -- Billing & Invoicing
                ('VIEW_INVOICES', 'Billing', 'View financial invoices and payments'),
                ('CREATE_INVOICES', 'Billing', 'Generate new invoices'),
                ('EDIT_INVOICES', 'Billing', 'Modify invoices and apply adjustments'),
                ('DELETE_INVOICES', 'Billing', 'Cancel or delete invoices'),
                ('PROCESS_PAYMENTS', 'Billing', 'Collect and reconcile payments'),
                ('OPEN_CASHIER_SHIFT', 'Billing', 'Open cashier shift'),
                ('CLOSE_CASHIER_SHIFT', 'Billing', 'Close cashier shift'),
                ('RECONCILE_SHIFTS', 'Billing', 'Audit and reconcile cashier drawer shifts'),
                ('APPROVE_SHIFT_VARIANCE', 'Billing', 'Approve cashier drawer variances'),
                ('REQUEST_REFUNDS', 'Billing', 'Request invoice refunds'),
                ('PROCESS_REFUNDS', 'Billing', 'Process invoice refunds'),
                ('APPROVE_REFUNDS', 'Billing', 'Approve invoice refund requests'),
                ('APPLY_DISCOUNTS', 'Billing', 'Apply promotional or discretionary discounts'),
                ('OVERRIDE_PRICING', 'Billing', 'Override catalog examination pricing'),
                ('VOID_INVOICES', 'Billing', 'Void issued invoices'),
                ('DELIVER_FINAL_REPORT_INVOICE', 'Billing', 'Deliver final report conditioned on full payment'),
                ('APPLY_PARTIAL_PAYMENT_EXCEPTION', 'Billing', 'Apply exception for partial payment release'),

                -- Insurance
                ('VIEW_INSURANCE', 'Insurance', 'View insurance providers and policies'),
                ('MANAGE_INSURANCE_PROVIDERS', 'Insurance', 'Create and maintain insurance providers'),
                ('MANAGE_INSURANCE_CONTRACTS', 'Insurance', 'Manage insurance contracts and fee schedules'),
                ('MANAGE_INSURANCE_APPROVALS', 'Insurance', 'Manage insurance preauthorizations'),
                ('MANAGE_INSURANCE_CLAIMS', 'Insurance', 'Prepare and batch insurance claims'),
                ('SUBMIT_INSURANCE_CLAIMS', 'Insurance', 'Submit insurance reimbursement claims'),
                ('RECONCILE_INSURANCE_CLAIMS', 'Insurance', 'Reconcile payer remittances and claims'),

                -- Finance
                ('VIEW_FINANCIALS', 'Finance', 'View financial performance and accounting reports'),
                ('MANAGE_EXPENSES', 'Finance', 'Create and maintain operational expenses'),
                ('MANAGE_COMMISSIONS', 'Finance', 'Review and settle physician commissions'),
                ('PAY_COMMISSIONS', 'Finance', 'Execute physician commission payouts'),
                ('MANAGE_RECEIVABLES', 'Finance', 'Review and manage outstanding receivables'),
                ('CLOSE_FINANCIAL_PERIODS', 'Finance', 'Create and finalize controlled financial periods'),
                ('POST_PAYROLL_TO_FINANCE', 'Finance', 'Post approved payroll batches to general ledger'),

                -- Inventory
                ('VIEW_INVENTORY', 'Inventory', 'View stock, movements, suppliers, and alerts'),
                ('MANAGE_INVENTORY', 'Inventory', 'Create items and adjust inventory balances'),
                ('CONSUME_INVENTORY', 'Inventory', 'Record clinical consumption of inventory'),
                ('MANAGE_PURCHASE_ORDERS', 'Inventory', 'Create, approve, receive, and close purchase orders'),
                ('MANAGE_SUPPLIERS', 'Inventory', 'Create and maintain supplier records'),

                -- Equipment
                ('VIEW_EQUIPMENT', 'Equipment', 'View equipment, service, maintenance, and downtime records'),
                ('MANAGE_EQUIPMENT', 'Equipment', 'Create and maintain equipment registry records'),
                ('MANAGE_MAINTENANCE', 'Equipment', 'Schedule and update equipment maintenance'),
                ('MANAGE_DOWNTIME', 'Equipment', 'Record and update equipment downtime'),

                -- PACS
                ('VIEW_PACS_IMAGES', 'PACS', 'View DICOM studies in the diagnostic image viewer'),
                ('MANAGE_PACS', 'PACS', 'Configure PACS/modality settings and operate imaging archive'),
                ('RECONCILE_STUDIES', 'PACS', 'Reconcile quarantined DICOM studies to scheduled examinations'),
                ('DOWNLOAD_PACS_DICOM', 'PACS', 'Download raw DICOM image series'),
                ('UPLOAD_PACS_STUDIES', 'PACS', 'Upload and import external DICOM studies'),

                -- HR
                ('VIEW_STAFF', 'HR', 'View employee profiles and attendance'),
                ('MANAGE_STAFF', 'HR', 'Manage employee profiles and records'),
                ('MANAGE_SHIFTS', 'HR', 'Create and maintain staff shift schedules'),
                ('MANAGE_LEAVE', 'HR', 'Review and decide staff leave requests'),
                ('MANAGE_ATTENDANCE', 'HR', 'Correct and audit employee attendance logs'),

                -- Payroll
                ('VIEW_PAYROLL', 'Payroll', 'View payroll periods, calculations, deductions, and penalties'),
                ('MANAGE_PAYROLL_PERIODS', 'Payroll', 'Create and maintain payroll periods'),
                ('CALCULATE_PAYROLL', 'Payroll', 'Calculate and recalculate payroll runs'),
                ('REVIEW_PAYROLL', 'Payroll', 'Review payroll runs before approval'),
                ('APPROVE_PAYROLL', 'Payroll', 'Approve payroll runs for payment'),
                ('PAY_PAYROLL', 'Payroll', 'Record payroll payment execution'),
                ('LOCK_PAYROLL', 'Payroll', 'Lock paid payroll runs against further changes'),
                ('MANAGE_PAYROLL_RULES', 'Payroll', 'Configure payroll rules and calculation inputs'),
                ('MANAGE_EMPLOYEE_COMPENSATION', 'Payroll', 'Manage employee compensation profiles'),
                ('MANAGE_DEDUCTIONS', 'Payroll', 'Manage employee deductions and advances'),
                ('MANAGE_PENALTIES', 'Payroll', 'Manage employee payroll penalties'),
                ('EXPORT_PAYROLL', 'Payroll', 'Export payroll reports and payment files'),

                -- Marketing & Referrals
                ('VIEW_MARKETING', 'Marketing', 'View CRM activity, campaigns, segments, and feedback'),
                ('MANAGE_MARKETING', 'Marketing', 'Create and launch marketing campaigns'),
                ('VIEW_CRM', 'Marketing', 'View customer relationship history and surveys'),
                ('MANAGE_CRM', 'Marketing', 'Manage CRM campaigns, segments, and feedback'),
                ('VIEW_REFERRING_DOCTORS', 'Referrals', 'View referring-doctor directory and performance'),
                ('MANAGE_REFERRING_DOCTORS', 'Referrals', 'Create and maintain referring-doctor records'),
                ('VIEW_REFERRAL_ANALYTICS', 'Referrals', 'View referring doctor revenue analytics'),

                -- Communications
                ('MANAGE_CHAT', 'Communications', 'Allows staff members to use direct chat, channels, and reply to portals'),

                -- Analytics
                ('VIEW_ANALYTICS', 'Analytics', 'View operational and financial analytics'),
                ('EXPORT_ANALYTICS', 'Analytics', 'Export operational and financial analytics'),

                -- Privacy
                ('VIEW_PRIVACY_REQUESTS', 'Privacy', 'View patient privacy and data-subject requests'),
                ('CREATE_PRIVACY_REQUESTS', 'Privacy', 'Create privacy requests for patients'),
                ('MANAGE_PRIVACY_REQUESTS', 'Privacy', 'Review and manage privacy requests'),
                ('RESOLVE_PRIVACY_REQUESTS', 'Privacy', 'Resolve, reject, and complete privacy requests'),
                ('MANAGE_CONSENTS', 'Privacy', 'Record and revoke patient consent history'),

                -- System Administration & Security
                ('VIEW_USERS', 'System', 'View system user accounts'),
                ('MANAGE_USERS', 'System', 'Create and maintain system user accounts'),
                ('MANAGE_ROLES', 'System', 'Modify role permissions'),
                ('VIEW_AUDIT_LOGS', 'System', 'View system audit trails'),
                ('VIEW_AUDIT_TRAILS', 'System', 'View system logs, structured audit events, and audit alerts'),
                ('EXPORT_AUDIT_TRAILS', 'System', 'Export system audit trails and event logs'),
                ('VERIFY_AUDIT_CHAIN', 'System', 'Verify tamper-evident audit hash chains'),
                ('RUN_AUDIT_DETECTIONS', 'System', 'Run audit detection rules and create audit alerts'),
                ('REVIEW_AUDIT_ALERTS', 'System', 'Resolve or dismiss audit detection alerts'),
                ('VIEW_SECURITY_EVENTS', 'System', 'View security events and access anomalies'),
                ('MANAGE_SETTINGS', 'System', 'Update facility and system settings'),
                ('MANAGE_INTEGRATIONS', 'System', 'Configure and operate external integrations'),
                ('MANAGE_BACKUPS', 'System', 'Create and manage system backups'),
                ('DOWNLOAD_BACKUPS', 'System', 'Download generated backup artifacts'),
                ('MANAGE_NOTIFICATIONS', 'System', 'Configure notification templates and preferences'),

                -- Developer Platform (Developer Only)
                ('MANAGE_DEVELOPER_ROLE', 'Developer', 'Create, assign, and govern Developer accounts'),
                ('MANAGE_PROTECTED_ROLES', 'Developer', 'Manage Developer and Admin role permissions and assignments'),
                ('MANAGE_DATABASE_CONFIG', 'Developer', 'View, test, and update database connection configuration'),
                ('VIEW_SYSTEM_DIAGNOSTICS', 'Developer', 'View runtime, database, and service health diagnostics'),
                ('MANAGE_SYSTEM_RUNTIME', 'Developer', 'Operate runtime cache, background jobs, and maintenance controls'),
                ('MANAGE_FEATURE_FLAGS', 'Developer', 'Create and update system feature flags'),
                ('VIEW_MIGRATION_STATUS', 'Developer', 'View database migration status and history'),
                ('MANAGE_SECRET_SETTINGS', 'Developer', 'Create and rotate secret-bearing provider settings'),
                ('RESTORE_BACKUPS', 'Developer', 'Restore backups into the active system')

                ON CONFLICT (name) DO UPDATE
                SET module = EXCLUDED.module,
                    description = EXCLUDED.description;

                -- Ensure Admin role has all operational permissions
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT CAST('Admin' AS user_role), permission_id FROM permissions
                WHERE name NOT IN (
                    'MANAGE_DEVELOPER_ROLE', 'MANAGE_PROTECTED_ROLES', 'MANAGE_DATABASE_CONFIG',
                    'VIEW_SYSTEM_DIAGNOSTICS', 'MANAGE_SYSTEM_RUNTIME', 'MANAGE_FEATURE_FLAGS',
                    'VIEW_MIGRATION_STATUS', 'MANAGE_SECRET_SETTINGS', 'RESTORE_BACKUPS'
                )
                ON CONFLICT DO NOTHING;

                -- Ensure Developer role has all permissions
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT 'Developer'::user_role, permission_id FROM permissions
                ON CONFLICT DO NOTHING;
            `);
        } catch (err) {
            console.error('Failed to initialize system_settings table:', err);
        }
    }

    async loadSettings() {
        if (Date.now() - this.cacheTime < this.CACHE_TTL && Object.keys(this.cache).length > 0) {
            return this.cache;
        }
        if (!this.pool) return this.cache;

        try {
            const { rows } = await this.pool.query('SELECT setting_key, setting_value FROM system_settings');
            const newCache = {};
            for (const row of rows) {
                newCache[row.setting_key] = row.setting_value;
            }
            this.cache = newCache;
            this.cacheTime = Date.now();
            return this.cache;
        } catch (err) {
            console.error('Error loading settings:', err);
            return this.cache; // return stale cache if db fails
        }
    }

    async get(key, defaultValue = null) {
        const settings = await this.loadSettings();
        return settings[key] !== undefined ? settings[key] : defaultValue;
    }

    async set(key, value) {
        if (!this.pool) throw new Error('SettingsService not initialized with pool');
        await this.pool.query(
            `INSERT INTO system_settings (setting_key, setting_value, updated_at) 
             VALUES ($1, $2, CURRENT_TIMESTAMP) 
             ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
            [key, value]
        );
        this.cache[key] = value;
    }

    async getAll() {
        return await this.loadSettings();
    }

    async updateAll(settingsObj) {
        if (!this.pool) throw new Error('SettingsService not initialized with pool');
        const keys = Object.keys(settingsObj);
        if (keys.length === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const key of keys) {
                const value = settingsObj[key];
                await client.query(
                    `INSERT INTO system_settings (setting_key, setting_value, updated_at) 
                     VALUES ($1, $2, CURRENT_TIMESTAMP) 
                     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
                    [key, value]
                );
                this.cache[key] = value;
            }
            await client.query('COMMIT');
            this.cacheTime = Date.now();
        } catch (error) {
            await client.query('ROLLBACK');
            this.cacheTime = 0; // invalidate cache on failure
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = new SettingsService();
