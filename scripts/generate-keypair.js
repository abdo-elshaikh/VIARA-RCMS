#!/usr/bin/env node
/**
 * generate-keypair.js
 * -------------------
 * ONE-TIME vendor utility: generates the ECDSA P-256 key pair used to sign
 * VIARA license keys.
 *
 * Run once and store the output carefully:
 *   node scripts/generate-keypair.js
 *
 * Output:
 *   - privateKey.pem  → keep secret, used by generate-license.js
 *   - publicKey.pem   → embed in licenseService.js (or set LICENSE_PUBLIC_KEY env var)
 *
 * NEVER commit privateKey.pem to version control.
 */

'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve:            'P-256',
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const outDir = path.resolve(__dirname, '../keys');
fs.mkdirSync(outDir, { recursive: true });

const privPath = path.join(outDir, 'privateKey.pem');
const pubPath  = path.join(outDir, 'publicKey.pem');

fs.writeFileSync(privPath, privateKey,  { mode: 0o600 });
fs.writeFileSync(pubPath,  publicKey);

console.log('\n✅ Key pair generated successfully\n');
console.log('Private key (keep secret):');
console.log('  ', privPath);
console.log('\nPublic key (embed in licenseService.js):');
console.log('  ', pubPath);
console.log('\n--- PUBLIC KEY PEM ---');
console.log(publicKey);
console.log('---------------------\n');
console.log('⚠️  Add keys/ to .gitignore — never commit privateKey.pem!\n');
