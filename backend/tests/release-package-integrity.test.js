const fs = require('fs');
const path = require('path');

describe('Customer release package integrity', () => {
    const packageDir = path.resolve(__dirname, '../../viara-production-package');
    const compose = fs.readFileSync(path.join(packageDir, 'docker-compose.yml'), 'utf8');
    const ohifNginx = fs.readFileSync(path.resolve(__dirname, '../../pacs/ohif/nginx.conf'), 'utf8');
    const ohifEntrypoint = fs.readFileSync(path.resolve(__dirname, '../../pacs/ohif/entrypoint.sh'), 'utf8');
    const ohifDockerfile = fs.readFileSync(path.resolve(__dirname, '../../pacs/ohif/Dockerfile'), 'utf8');
    const frontendNginx = fs.readFileSync(path.resolve(__dirname, '../../frontend/nginx.conf.template'), 'utf8');
    const reverseProxyGuide = fs.readFileSync(path.resolve(__dirname, '../../docs/REVERSE_PROXY_TLS.md'), 'utf8');
    const linuxLauncher = fs.readFileSync(path.join(packageDir, 'scripts/start.sh'), 'utf8');
    const windowsLauncher = fs.readFileSync(path.join(packageDir, 'scripts/start.bat'), 'utf8');
    const environmentTemplate = fs.readFileSync(path.join(packageDir, '.env.example'), 'utf8');
    const windowsHostLauncher = fs.readFileSync(path.join(packageDir, 'START_VIARA.bat'), 'utf8');

    it('uses prebuilt images pinned to required immutable references', () => {
        const imageLines = compose.match(/^\s+image:\s+.+$/gm) || [];
        expect(imageLines.length).toBeGreaterThan(0);
        expect(imageLines.every(line => /\$\{[A-Z0-9_]+:\?/.test(line))).toBe(true);
        expect(compose).not.toMatch(/^\s+build:/m);
        expect(linuxLauncher).toContain("@sha256:[[:xdigit:]]{64}$");
        expect(windowsLauncher).toContain("@sha256:[0-9a-fA-F]{64}$");
        expect(linuxLauncher).toContain("docker info --format '{{.OSType}}'");
        expect(windowsLauncher).toContain('docker info --format "{{.OSType}}"');
    });

    it('binds published ports to loopback unless DICOM is explicitly configured otherwise', () => {
        const portMappings = [...compose.matchAll(/^\s+- "([^"]+:[^"]+:[^"]+)"\s*$/gm)]
            .map(([, mapping]) => mapping);
        expect(portMappings.length).toBeGreaterThan(0);
        expect(portMappings.filter(mapping => mapping.startsWith('${VPN_PORT:-'))).toEqual(['${VPN_PORT:-51820}:51820/udp']);
        expect(portMappings.filter(mapping => mapping.startsWith('${PACS_DICOM_BIND:-')).length).toBe(1);
        expect(portMappings
            .filter(mapping => !mapping.startsWith('${PACS_DICOM_BIND:-') && !mapping.startsWith('${VPN_PORT:-'))
            .every(mapping => mapping.startsWith('127.0.0.1:') || /^\$\{(?:FRONTEND|PORTAL)_BIND:-127\.0\.0\.1\}:/.test(mapping))).toBe(true);
    });

    it('persists license activation files in the dedicated volume', () => {
        expect(compose).toContain('license_data:/app/license');
        expect(compose).toContain('LICENSE_STORAGE_FILE: /app/license/.viara-license');
        expect(compose).toContain('LICENSE_ACTIVATION_FILE: /app/license/.viara-activation');
        expect(environmentTemplate).toMatch(/^LICENSE_KEY=$/m);
        expect(compose).toMatch(/LICENSE_KEY:\s+\$\{LICENSE_KEY:\?/);
        expect(environmentTemplate).not.toContain('TRIAL-CLIENT');
    });

    it('ships scheduled backups, a durable cold archive, and dependency readiness', () => {
        expect(compose).toContain('BACKUP_SCHEDULE_ENABLED: "true"');
        expect(compose).toContain('PACS_BACKUP_ENABLED: "true"');
        expect(compose).toContain('pacs_cold_archive:/app/pacs-cold');
        expect(compose).toContain('BACKUP_OFFSITE_SECRET_KEY:');
        expect(compose).toContain("fetch('http://127.0.0.1:3000/health/ready')");
        expect(compose).not.toContain('r.status !== 401');
    });

    it('permits the same-origin QR camera while restricting metrics scraping', () => {
        expect(frontendNginx).toContain('camera=(self)');
        const metricsLocation = reverseProxyGuide.match(/location \/metrics \{([\s\S]*?)\n    \}/)?.[1];
        expect(metricsLocation).toContain('deny all;');
        expect(metricsLocation).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
        expect(reverseProxyGuide).toContain('client_max_body_size 250m;');
        expect(compose).toContain('METRICS_TOKEN:');
    });

    it('waits for configured Linux health checks and reports startup failure', () => {
        for (const service of ['postgres', 'clamav', 'orthanc', 'backend', 'frontend', 'portal', 'ohif']) {
            expect(linuxLauncher).toContain(service);
        }
        expect(linuxLauncher).toContain('services did not become healthy');
        expect(linuxLauncher).toContain('Orthanc API health is checked');
        expect(compose).toContain('urllib.request.urlopen(request, timeout=5)');
        expect(windowsLauncher).toContain('wait-healthy.ps1');
    });

    it('verifies offline image archives before loading them', () => {
        expect(linuxLauncher).toContain('sha256sum "$archive"');
        expect(linuxLauncher).toContain('docker load --input "$archive"');
        expect(linuxLauncher).toContain('Offline image checksum verification failed');
    });

    it('does not claim or attempt a Windows-native production deployment', () => {
        expect(windowsHostLauncher).toContain('supported only as a host for the supported Linux VM');
        expect(windowsHostLauncher).toContain('./scripts/start.sh');
        expect(windowsHostLauncher).not.toContain('docker compose up');
        expect(windowsHostLauncher).not.toContain('Docker Desktop');
    });

    it('does not present loopback addresses as customer-facing URLs', () => {
        expect(windowsLauncher).not.toContain('http://localhost');
        expect(linuxLauncher).not.toContain('http://localhost');
        expect(windowsLauncher).toContain('customer-approved HTTPS URLs');
        expect(linuxLauncher).toContain('customer-approved HTTPS URLs');
    });

    it('restricts OHIF embedding to the same origin used by the PACS session', () => {
        expect(ohifNginx).toContain(`frame-ancestors 'self' \${VIARA_APP_ORIGIN}`);
        expect(ohifNginx).not.toMatch(/frame-ancestors\s+https?:\/\/localhost/);
        expect(ohifNginx).toContain('proxy_pass http://$VIARA_backend/health/ready;');
        expect(ohifEntrypoint).toMatch(/envsubst '\$\{VIARA_API_UPSTREAM\} \$\{VIARA_APP_ORIGIN\}'/);
        expect(ohifEntrypoint).toContain('The application origin must not include a path');
        expect(ohifDockerfile).toContain('ENTRYPOINT ["/bin/sh", "/usr/src/viara-entrypoint.sh"]');
        expect(frontendNginx).toContain("frame-src 'self'");
        expect(frontendNginx).not.toContain('${VITE_OHIF_URL}');
        expect(fs.readFileSync(path.resolve(__dirname, '../../pacs/ohif/app-config.js'), 'utf8'))
            .toContain("routerBasename: window.location.pathname.startsWith('/pacs-viewer/') ? '/pacs-viewer/' : '/'");
        expect(reverseProxyGuide).toContain('location /pacs-viewer/');
        expect(reverseProxyGuide).toContain('add_header X-Frame-Options "" always;');
        expect(compose).toMatch(/VIARA_APP_ORIGIN:\s+\$\{CLIENT_URL:\?/);
        expect(compose).toContain('condition: service_healthy');
        expect(compose).toContain('/health/ready');
    });
});
