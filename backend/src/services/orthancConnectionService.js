const settingsService = require('./settingsService');
const { decrypt } = require('../utils/crypto');

const decodeSecret = (value) => {
    if (!value) return '';
    if (value.startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(value)) return decrypt(value);
    return value;
};

const getOrthancConnection = async () => {
    const envUrl = process.env.ORTHANC_API_URL || process.env.ORTHANC_URL || 'http://orthanc:8042';
    let url = await settingsService.get('orthanc_api_url', envUrl);
    if (!url || url === 'orthanc' || (url === 'http://orthanc:8042' && envUrl !== url)) url = envUrl;
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error('Invalid Orthanc REST URL');
    }
    const username = await settingsService.get('orthanc_username', process.env.ORTHANC_USERNAME || 'VIARA');
    const password = decodeSecret(await settingsService.get('orthanc_password', null)) || process.env.ORTHANC_PASSWORD;
    if (!password) throw new Error('Orthanc password must be configured');
    return { url: url.replace(/\/+$/, ''), username: username || 'VIARA', password };
};

module.exports = { getOrthancConnection, decodeSecret };
