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
                ('VIEW_PATIENTS', 'Patients', 'View patient list and basic details'),
                ('CREATE_PATIENTS', 'Patients', 'Register new patients'),
                ('EDIT_PATIENTS', 'Patients', 'Modify patient details'),
                ('DELETE_PATIENTS', 'Patients', 'Delete or archive patients'),
                ('MERGE_PATIENTS', 'Patients', 'Merge duplicate patient records'),
                ('VIEW_APPOINTMENTS', 'Scheduling', 'View appointments calendar and list'),
                ('CREATE_APPOINTMENTS', 'Scheduling', 'Create new appointments'),
                ('EDIT_APPOINTMENTS', 'Scheduling', 'Reschedule or modify appointments'),
                ('DELETE_APPOINTMENTS', 'Scheduling', 'Cancel or delete appointments'),
                ('MANAGE_WAITLIST', 'Scheduling', 'Manage waitlist and scheduling offers'),
                ('VIEW_INVOICES', 'Billing', 'View invoices and transactions'),
                ('CREATE_INVOICES', 'Billing', 'Create new invoices'),
                ('EDIT_INVOICES', 'Billing', 'Modify invoices'),
                ('PROCESS_PAYMENTS', 'Billing', 'Collect and reconcile payments'),
                ('OPEN_CASHIER_SHIFT', 'Billing', 'Open cashier shifts'),
                ('CLOSE_CASHIER_SHIFT', 'Billing', 'Close cashier shifts'),
                ('REQUEST_REFUNDS', 'Billing', 'Request invoice refunds'),
                ('PROCESS_REFUNDS', 'Billing', 'Process invoice refunds'),
                ('VIEW_INSURANCE', 'Insurance', 'View insurance providers and policies'),
                ('MANAGE_INSURANCE_APPROVALS', 'Insurance', 'Manage insurance approvals'),
                ('VIEW_REFERRING_DOCTORS', 'Referrals', 'View referring doctors directory'),
                ('MANAGE_REFERRING_DOCTORS', 'Referrals', 'Manage referring doctors'),
                ('VIEW_REPORTS', 'Clinical', 'View case reports'),
                ('MANAGE_QUEUE', 'Clinical Operations', 'Manage exam queue stages'),
                ('PERFORM_EXAMS', 'Clinical', 'Start and complete radiological exams'),
                ('WRITE_REPORTS', 'Clinical', 'Draft and edit diagnostic reports'),
                ('FINALIZE_REPORTS', 'Clinical', 'Approve and finalize diagnostic reports'),
                ('AMEND_REPORTS', 'Clinical', 'Amend finalized reports'),
                ('VIEW_STAFF', 'HR', 'View employee profiles and attendance'),
                ('MANAGE_STAFF', 'HR', 'Manage employee profiles, shifts, and leave'),
                ('VIEW_MARKETING', 'Marketing', 'View marketing and campaign data'),
                ('MANAGE_CRM', 'Marketing', 'Manage CRM campaigns, segments, and feedback'),
                ('MANAGE_ROLES', 'System', 'Modify role permissions'),
                ('MANAGE_SETTINGS', 'System', 'Manage facility and operational settings'),
                ('VIEW_AUDIT_LOGS', 'System', 'View system audit trails'),
                ('VIEW_AUDIT_TRAILS', 'System', 'View system logs, structured audit events, and audit alerts'),
                ('EXPORT_AUDIT_TRAILS', 'System', 'Export system audit trails and event logs'),
                ('CREATE_PRIVACY_REQUESTS', 'Privacy', 'Create privacy requests'),
                ('MANAGE_CONSENTS', 'Privacy', 'Manage patient consents'),
                ('VIEW_PACS_IMAGES', 'PACS', 'View DICOM studies in the diagnostic image viewer'),
                ('MANAGE_PACS', 'PACS', 'Configure PACS/modality settings and operate the imaging archive'),
                ('RECONCILE_STUDIES', 'PACS', 'Reconcile quarantined DICOM studies to scheduled examinations'),
                ('MANAGE_DOWNTIME', 'Equipment', 'Manage machine downtime'),
                ('MANAGE_EQUIPMENT', 'Equipment', 'Manage equipment service contracts'),
                ('MANAGE_MAINTENANCE', 'Equipment', 'Manage equipment maintenance')
                ON CONFLICT (name) DO NOTHING;

                -- Ensure Receptionist role has core patient and operational permissions
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT 'Receptionist'::user_role, permission_id FROM permissions
                WHERE name IN (
                    'VIEW_PATIENTS', 'CREATE_PATIENTS', 'EDIT_PATIENTS',
                    'VIEW_APPOINTMENTS', 'CREATE_APPOINTMENTS', 'EDIT_APPOINTMENTS',
                    'MANAGE_WAITLIST', 'VIEW_INSURANCE', 'MANAGE_INSURANCE_APPROVALS',
                    'VIEW_REFERRING_DOCTORS', 'MANAGE_REFERRING_DOCTORS', 'VIEW_MARKETING',
                    'VIEW_INVOICES', 'CREATE_INVOICES', 'PROCESS_PAYMENTS',
                    'OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT', 'REQUEST_REFUNDS', 'PROCESS_REFUNDS',
                    'CONSUME_INVENTORY', 'VIEW_REPORTS', 'MANAGE_QUEUE',
                    'CREATE_PRIVACY_REQUESTS', 'MANAGE_CONSENTS', 'MANAGE_DOWNTIME'
                )
                ON CONFLICT DO NOTHING;

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

                -- Ensure Radiologist and Technician can view images and reconcile studies
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT CAST(role AS user_role), permission_id
                FROM permissions
                CROSS JOIN (VALUES ('Radiologist'), ('Technician')) AS roles(role)
                WHERE name IN ('VIEW_PACS_IMAGES', 'RECONCILE_STUDIES')
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
