-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default PACS configurations
INSERT INTO system_settings (setting_key, setting_value)
VALUES 
    ('pacs_server_aet', 'MiPACS2'),
    ('pacs_server_ip', '127.0.0.1'),
    ('pacs_server_port', '4242'),
    ('orthanc_api_url', 'http://orthanc:8042'),
    ('orthanc_username', 'VIARA'),
    ('orthanc_password', 'VIARA_secure_password_2024')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
