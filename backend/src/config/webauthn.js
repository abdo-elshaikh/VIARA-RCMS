const getWebAuthnConfig = () => {
    const origin = String(process.env.WEBAUTHN_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const originUrl = new URL(origin);

    return {
        origin: originUrl.origin,
        rpID: process.env.WEBAUTHN_RP_ID || originUrl.hostname,
        rpName: process.env.WEBAUTHN_RP_NAME || 'VIARA VIARA'
    };
};

module.exports = { getWebAuthnConfig };
