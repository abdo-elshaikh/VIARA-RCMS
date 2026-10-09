# Reverse Proxy and TLS Termination Guide

## Overview

VIARA backend and frontend are designed to run behind a reverse proxy that handles TLS termination, request forwarding, and optional static asset serving. This document provides production-ready configurations for common reverse proxies.

## Nginx (Recommended)

### Full Configuration

```nginx
# /etc/nginx/sites-available/VIARA
upstream VIARA-backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream VIARA-frontend {
    server 127.0.0.1:5173;
    keepalive 16;
}

upstream VIARA-portal {
    server 127.0.0.1:5174;
    keepalive 16;
}

server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name VIARA.example.com;

    # TLS Configuration
    ssl_certificate /etc/ssl/certs/VIARA.crt;
    ssl_certificate_key /etc/ssl/private/VIARA.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security Headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss:; frame-ancestors 'none';" always;

    # HSTS Preload (optional — submit to https://hstspreload.org)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Backend API
    location /api/ {
        # Match the staff gateway's upload envelope. PACS enforces its own
        # 200 MiB aggregate budget and 25 MiB per-file limit in the backend.
        client_max_body_size 250m;
        proxy_pass http://VIARA-backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Connection "";
        proxy_read_timeout 10m;
        proxy_send_timeout 10m;
        proxy_connect_timeout 30s;
    }

    # Metrics: only a local scraper may access this location by default.
    # Add explicit monitoring-network CIDRs here before remote scraping.
    location /metrics {
        allow 127.0.0.1;
        allow ::1;
        deny all;
        proxy_pass http://VIARA-backend;
        proxy_http_version 1.1;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Connection "";
        access_log off;
    }

    # PACS Viewer (OHIF)
    location /pacs-viewer/ {
        proxy_pass http://127.0.0.1:3005/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 5m;
        # The global frontend policy forbids framing. OHIF is intentionally
        # frameable only by this same origin, and must not inherit X-Frame-Options: DENY.
        add_header Content-Security-Policy "frame-ancestors 'self'" always;
        add_header X-Frame-Options "" always;
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    }

    # Frontend (Staff)
    location / {
        proxy_pass http://VIARA-frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 5m;
    }
}
```

### Sub-path Proxying (if backend is behind a path prefix)

If your backend is served under `/api`, adjust the `CLIENT_URL` environment variable:

```bash
CLIENT_URL=https://VIARA.example.com
# The frontend proxy config in vite.config.js handles /api forwarding
```

## Caddy (Automatic HTTPS)

```caddy
VIARA.example.com {
    route {
        handle_path /api/* {
            reverse_proxy VIARA-backend:3000
        }
        handle_path /pacs-viewer/* {
            header {
                Content-Security-Policy "frame-ancestors 'self'"
                -X-Frame-Options
                Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
                X-Content-Type-Options "nosniff"
                Referrer-Policy "strict-origin-when-cross-origin"
            }
            reverse_proxy VIARA-ohif:3005
        }
        handle {
            reverse_proxy VIARA-frontend:5173
        }
    }

    encode gzip
}
```

The OHIF proxy path must remain on the **same HTTPS origin** as the staff application. Do not assign it a separate hostname: the viewer authorization is scoped to the browser origin. `CLIENT_URL` must be the exact staff origin (scheme and host, with no path), and the release OHIF image must be built with the VIARA OHIF Dockerfile, runtime entrypoint, app config, and Nginx template. The OHIF readiness check proxies `/health/ready` to the backend.

## Dual-Domain Zero-Trust Architecture (Recommended for Remote Access)

To strictly enforce the 3-tier security separation (Level A: Public Portal, Level B: Remote Clinical, Level C: On-Premises Core LAN), configure two separate server blocks:

### 1. Level A: Public Portal (`portal.ris.example.org`)
Exposed to public internet via Cloudflare Tunnel / WAF with TLS 1.3 only, serving only the Patient/Referring Physician portal and read/write request APIs, with absolute blocking of any diagnostic viewer paths:

```nginx
server {
    listen 443 ssl http2;
    server_name portal.ris.example.org;

    ssl_protocols TLSv1.3;
    ssl_prefer_server_ciphers off;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none';" always;

    # Public Portal SPA
    location / {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Whitelisted Public / Patient APIs only
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        limit_except GET POST { deny all; }   # Portal is read/request-only
    }

    # Strict Denial: Diagnostic Viewer is NEVER exposed on the public domain
    location /pacs-viewer/ {
        return 404;
    }
}
```

### 2. Level B: Remote Clinical (`ris.ris.example.org`)
Accessible only via WireGuard VPN or Cloudflare Zero-Trust Network Access (ZTNA) with mandatory mTLS device certificate verification:

```nginx
server {
    listen 443 ssl http2;
    server_name ris.ris.example.org;

    # Enforce mTLS: reject devices without organization CA certificate
    ssl_client_certificate /etc/nginx/clinical-ca.crt;
    ssl_verify_client on;
    ssl_verify_depth 2;

    ssl_protocols TLSv1.2 TLSv1.3;

    # Extract device identity for audit logging
    add_header X-Device-Id $ssl_client_serial always;

    # Staff SPA
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Core RIS API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Device-Serial $ssl_client_serial;
        proxy_read_timeout 10m;
    }

    # OHIF Diagnostic Viewer on the SAME HTTPS ORIGIN
    location /pacs-viewer/ {
        proxy_pass http://127.0.0.1:3005/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;                 # Direct WADO-RS streaming
        proxy_read_timeout 300s;
        add_header Content-Security-Policy "frame-ancestors 'self'" always;
        add_header X-Frame-Options "" always;
    }
}
```

## Cloudflare Tunnel

For zero-trust or edge deployments, configure a Cloudflare Tunnel:

```yaml
# ~/.cloudflared/config.yml
tunnel: VIARA-tunnel
credentials-file: /etc/cloudflared/credentials.yml
ingress:
  - hostname: portal.ris.example.org
    service: http://127.0.0.1:5174
  - hostname: ris.ris.example.org
    service: http://127.0.0.1:5173
  - service: http_status:404
```

## HTTPS Enforcement in the Application

The backend is already configured to enforce HTTPS in production:

```javascript
// server.js — HTTP-to-HTTPS redirect is handled by the reverse proxy.
// The application itself does not force redirects but validates
// X-Forwarded-Proto to set secure cookies and prevent HTTPS downgrade attacks.
```

Ensure the following headers are forwarded:
- `X-Forwarded-Proto: https`
- `X-Forwarded-Host: <your-domain>`
- `X-Real-IP: <client-ip>`

## WebSocket Support (for real-time notifications)

```nginx
location /api/v1/notifications/stream {
    proxy_pass http://VIARA-backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}
```

## Testing TLS Configuration

After deployment, verify TLS settings using SSL Labs:

```bash
curl -I https://VIARA.example.com/
# Expected: HTTP/2 200, Strict-Transport-Security header present
```

## Remote Access: three-tier deployment kit

For splitting public portal access from clinical (viewer + worklist) access,
use the production-ready kit in [`deploy/remote-access/`](../deploy/remote-access/README.md):

| Tier | Audience | Artifact |
| :--- | :--- | :--- |
| Public | Patients / referring physicians (WAF + Tunnel) | `deploy/remote-access/nginx/portal-edge.conf` |
| Clinical | Radiologists: Worklist + OHIF behind WireGuard + mTLS | `deploy/remote-access/nginx/clinical-edge.conf` |
| On-prem | Modalities, DB, Orthanc, AI | existing `docker-compose.yml` + network ACLs |

Hard rules: OHIF is never public; it stays on the staff origin under
`/pacs-viewer/`; the portal edge returns 404 for viewer/admin paths; DICOM 4242
binds to the modality interface only. Verify with
`deploy/remote-access/scripts/verify-remote-access.sh`.
