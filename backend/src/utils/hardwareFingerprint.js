/**
 * hardwareFingerprint.js
 * ----------------------
 * Generates a deterministic SHA-256 fingerprint of the current server hardware.
 * Used to bind a VIARA license to a specific machine so it cannot be copied and
 * replayed on a different server.
 *
 * Components that contribute to the fingerprint:
 *   - MAC addresses of physical non-loopback network interfaces (sorted & deduplicated)
 *   - CPU model string (first core)
 *   - OS hostname
 *
 * The hash is hex-encoded and stable across reboots as long as the hardware
 * and hostname do not change.
 */

'use strict';

const os     = require('os');
const crypto = require('crypto');

function isVirtualInterface(name = '') {
    const n = name.toLowerCase();
    return (
        n.includes('virtual') ||
        n.includes('hyper-v') ||
        n.includes('vethernet') ||
        n.includes('wsl') ||
        n.includes('docker') ||
        n.includes('vmware') ||
        n.includes('vbox') ||
        n.includes('loopback') ||
        n.includes('pseudo') ||
        n.includes('tap') ||
        n.includes('tun') ||
        n.startsWith('veth') ||
        n.startsWith('br-')
    );
}

/**
 * Returns a stable, hex-encoded SHA-256 fingerprint of this machine.
 * @returns {string} 64-character hex string
 */
function getFingerprint() {
    const interfaces = os.networkInterfaces();

    const physicalMacs = [];
    const allMacs = [];

    for (const [name, ifaceList] of Object.entries(interfaces)) {
        if (!ifaceList) continue;
        const isVirtual = isVirtualInterface(name);
        for (const iface of ifaceList) {
            if (iface.internal || !iface.mac || iface.mac === '00:00:00:00:00:00') continue;
            const mac = iface.mac.toLowerCase();
            allMacs.push(mac);
            if (!isVirtual) {
                physicalMacs.push(mac);
            }
        }
    }

    // Prioritize non-virtual physical MACs for stability across WSL/Docker reboots
    const chosenMacs = physicalMacs.length > 0 ? physicalMacs : allMacs;
    const uniqueSortedMacs = [...new Set(chosenMacs)].sort();

    const macPart    = uniqueSortedMacs.length > 0 ? uniqueSortedMacs.join('|') : 'no-mac';
    const cpuPart    = (os.cpus()[0]?.model || 'unknown-cpu').trim();
    const hostPart   = os.hostname();

    const raw = `${macPart}::${cpuPart}::${hostPart}`;

    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

module.exports = { getFingerprint };

