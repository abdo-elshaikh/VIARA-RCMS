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
                ON CONFLICT (setting_key) DO NOTHING;
            `, [
                process.env.ORTHANC_API_URL || process.env.ORTHANC_URL || 'http://orthanc:8042',
                process.env.ORTHANC_USERNAME || 'orthanc',
                process.env.ORTHANC_PASSWORD || 'orthanc',
                process.env.ORTHANC_AET || 'MiPACS2',
                process.env.PACS_SERVER_IP || process.env.ORTHANC_DICOM_HOST || '127.0.0.1',
                process.env.PACS_DICOM_PORT || '4242'
            ]);

            await this.pool.query(`
                -- Ensure PACS permissions exist
                INSERT INTO permissions (name, module, description) VALUES
                ('VIEW_PACS_IMAGES', 'PACS', 'View DICOM studies in the diagnostic image viewer'),
                ('MANAGE_PACS', 'PACS', 'Configure PACS/modality settings and operate the imaging archive'),
                ('RECONCILE_STUDIES', 'PACS', 'Reconcile quarantined DICOM studies to scheduled examinations')
                ON CONFLICT (name) DO NOTHING;

                -- Ensure Admin role has them
                INSERT INTO role_permissions (role_name, permission_id)
                SELECT CAST('Admin' AS user_role), permission_id FROM permissions
                WHERE name IN ('VIEW_PACS_IMAGES', 'MANAGE_PACS', 'RECONCILE_STUDIES')
                ON CONFLICT DO NOTHING;

                -- Ensure Radiologist and Technician can view images and
                -- reconcile quarantined studies (they operate the imaging
                -- workflow day-to-day; MANAGE_PACS stays Admin-only).
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
        const keys = Object.keys(settingsObj);
        for (const key of keys) {
            await this.set(key, settingsObj[key]);
        }
        this.cacheTime = 0; // invalidate cache
    }
}

module.exports = new SettingsService();
