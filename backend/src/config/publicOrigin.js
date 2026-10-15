const getStaffOrigin = (env = process.env) => {
    const configured = env.CLIENT_URL || env.APP_URL || (env.NODE_ENV !== 'production' ? 'http://localhost:5173' : '');
    let url;
    try { url = new URL(configured); } catch { throw new Error('CLIENT_URL must be a valid staff application origin'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || url.pathname !== '/' || (env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
        throw new Error('CLIENT_URL must be an exact HTTPS origin in production, without credentials, path, query or fragment');
    }
    return url.origin;
};

module.exports = { getStaffOrigin };
