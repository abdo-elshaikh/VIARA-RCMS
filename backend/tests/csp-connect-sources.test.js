const express = require('express');
const helmet = require('helmet');
const request = require('supertest');
const { buildConnectSources } = require('../src/utils/cspConnectSources');

describe('browser connection policy', () => {
    test('serves a CSP limited to configured HTTPS origins and secure WebSocket equivalents', async () => {
        const app = express();
        app.use(helmet({ contentSecurityPolicy: { directives: {
            connectSrc: buildConnectSources(new Set(['https://staff.example.test', 'https://patients.example.test']))
        } } }));
        app.get('/', (_req, res) => res.send('synthetic'));
        const response = await request(app).get('/').expect(200);
        const directive = response.headers['content-security-policy'].split(';').find(value => value.startsWith('connect-src'));
        expect(directive).toContain('https://staff.example.test');
        expect(directive).toContain('https://patients.example.test');
        expect(directive).toContain('wss://staff.example.test');
        expect(directive).toContain('wss://patients.example.test');
        expect(directive).not.toContain('*');
        expect(directive).not.toContain('ws://');
    });

    test('rejects wildcards, non-network schemes, malformed origins and embedded credentials', () => {
        expect(buildConnectSources(['*', 'https://*', 'ws://*', 'wss://*', 'https://*.example.test',
            'data:text/plain,synthetic', 'file:///tmp', 'not-an-origin', 'https://user:password@example.test']))
            .toEqual(["'self'"]);
    });

    test('preserves explicitly allowed development ports and deduplicates normalized origins', () => {
        const sources = buildConnectSources(['http://localhost:5173/path', 'http://localhost:5173/', 'https://staff.example.test:8443']);
        expect(new Set(sources).size).toBe(sources.length);
        expect(sources).toContain('http://localhost:5173');
        expect(sources).toContain('ws://localhost:5173');
        expect(sources).toContain('wss://staff.example.test:8443');
        expect(sources).not.toContain('http://localhost:5174');
    });
});
