// Restrict browser connections to explicitly configured HTTP origins and their
// WebSocket equivalents. Invalid/wildcard inputs never expand the policy.
const buildConnectSources = origins => {
    const sources = new Set(["'self'"]);
    for (const value of origins) {
        try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol) || url.hostname.includes('*') || url.username || url.password) continue;
            sources.add(url.origin);
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            sources.add(url.origin);
        } catch { /* Invalid origins cannot grant browser network access. */ }
    }
    return [...sources];
};

module.exports = { buildConnectSources };
