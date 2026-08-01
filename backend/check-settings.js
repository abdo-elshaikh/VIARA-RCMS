const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function check() {
    try {
        const { rows } = await pool.query("SELECT * FROM system_settings WHERE setting_key IN ('orthanc_api_url', 'orthanc_username', 'orthanc_password')");
        console.log('Current PACS credentials in DB:', rows);
        
        // Let's check what env variables are loaded
        console.log('ENV Orthanc Username:', process.env.ORTHANC_USERNAME);
        console.log('ENV Orthanc Password:', process.env.ORTHANC_PASSWORD);
        
        // If DB has values, let's make sure they match the env values
        await pool.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('orthanc_username', 'rcms') ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'rcms'");
        await pool.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('orthanc_password', '***REMOVED***') ON CONFLICT (setting_key) DO UPDATE SET setting_value = '***REMOVED***'");
        console.log('Forced DB credentials to match ENV.');
    } catch (e) {
        console.error('Failed:', e.message);
    } finally {
        pool.end();
    }
}
check();
