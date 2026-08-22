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

    # Health & Metrics (no auth required for scraping)
    location /metrics {
        proxy_pass http://VIARA-backend;
        proxy_http_version 1.1;
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
    reverse_proxy /api/* VIARA-backend:3000
    reverse_proxy /pacs-viewer/* VIARA-ohif:3005
    reverse_proxy VIARA-frontend:5173

    encode gzip
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
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
  - hostname: api.VIARA.example.com
    service: http://127.0.0.1:3000
  - hostname: VIARA.example.com
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
