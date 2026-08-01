const net = require('net');

const CUSTOM_AI_URL_MESSAGE = 'Custom AI endpoint must be a valid URL';

const parseIpv4 = (hostname) => hostname.split('.').map(Number);

const isProhibitedIpv4 = (hostname) => {
    const [a, b, c] = parseIpv4(hostname);
    return a === 0
        || a === 10
        || a === 127
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 0 && c === 0)
        || (a === 192 && b === 0 && c === 2)
        || (a === 192 && b === 88 && c === 99)
        || (a === 192 && b === 168)
        || (a === 198 && (b === 18 || b === 19))
        || (a === 198 && b === 51 && c === 100)
        || (a === 203 && b === 0 && c === 113)
        || a >= 224;
};

const expandIpv6 = (hostname) => {
    let value = hostname.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
    const ipv4Match = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
    if (ipv4Match) {
        const octets = parseIpv4(ipv4Match[1]);
        value = `${value.slice(0, -ipv4Match[1].length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    }
    const halves = value.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const groups = halves.length === 2
        ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
        : left;
    return groups.map((group) => Number.parseInt(group || '0', 16));
};

const isProhibitedIpv6 = (hostname) => {
    const groups = expandIpv6(hostname);
    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
    const isIpv4Mapped = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff;
    if (isIpv4Mapped) {
        return isProhibitedIpv4(`${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`);
    }
    return groups.every((group) => group === 0)
        || (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1)
        || (g0 & 0xfe00) === 0xfc00
        || (g0 & 0xffc0) === 0xfe80
        || (g0 & 0xff00) === 0xff00
        || (g0 === 0x0064 && g1 === 0xff9b && g2 === 0x0001)
        || (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0)
        || (g0 >= 0x2001 && g0 <= 0x2001 && g1 <= 0x01ff)
        || (g0 === 0x2001 && g1 === 0x0db8)
        || g0 === 0x2002;
};

const validateCustomAiEndpointUrl = (value, { production = process.env.NODE_ENV === 'production' } = {}) => {
    let url;
    try {
        url = new URL(String(value || '').trim());
    } catch {
        throw new TypeError(CUSTOM_AI_URL_MESSAGE);
    }

    if (!url.hostname || !['http:', 'https:'].includes(url.protocol)) {
        throw new TypeError(`${CUSTOM_AI_URL_MESSAGE} using HTTP or HTTPS`);
    }
    if (production && url.protocol !== 'https:') {
        throw new TypeError('Custom AI endpoint must use HTTPS in production');
    }
    if (url.username || url.password) {
        throw new TypeError('Custom AI endpoint must not include URL credentials');
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const ipVersion = net.isIP(hostname);
    if ((ipVersion === 4 && isProhibitedIpv4(hostname)) || (ipVersion === 6 && isProhibitedIpv6(hostname))) {
        throw new TypeError('Custom AI endpoint must not target a loopback, private, link-local, or reserved IP address');
    }

    return url.toString();
};

module.exports = { validateCustomAiEndpointUrl };
