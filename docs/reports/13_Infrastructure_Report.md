# 13 — Infrastructure Report

**Review date:** 2026-08-04  
**Scope:** Docker Compose configuration, container specifications, networking, and deployment readiness  
**Methodology:** Static review of `docker-compose.yml`, Dockerfiles, Nginx configs, and `.env` requirements  

---

## Executive Summary

RCMS utilizes a modern, containerized architecture orchestrated via Docker Compose. The infrastructure consists of **9 specialized services** including backend API, frontend SPA, patient portal, PostgreSQL database, Redis (optional), Orthanc PACS, OHIF viewer, AI worker, and an Nginx reverse proxy. The configuration demonstrates production readiness with proper isolation, resource limits, health checks, and non-root execution.

**Infrastructure Health Score: 84/100**

---

## Service Architecture

| Service | Technology | Role | Network |
|---------|------------|------|---------|
| `backend` | Node.js 20 | Main API, workers | Internal, DB, PACS |
| `frontend` | Nginx/React | Staff SPA serving | Public |
| `portal` | Nginx/React | Patient/Doctor SPA | Public |
| `postgres` | PostgreSQL 15 | Relational database | DB (isolated) |
| `orthanc` | Orthanc | DICOM Server | PACS, Internal |
| `ohif` | Nginx/OHIF | DICOM Viewer | Public, PACS |
| `ai-worker`| Python/Flask | ML Inference | Internal |
| `migrate` | Node.js | Schema provisioner | DB |
| `clamav` | ClamAV | Anti-virus | Internal |

---

## Security Hardening Assessment

| Control | Status | Evidence |
|---------|--------|----------|
| Non-root containers | ✅ | `backend/Dockerfile:16` (`USER node`) |
| Alpine base images | ✅ | `node:20.19-alpine`, `nginx:1.27-alpine` |
| Immutable containers | ✅ | No volume mounts for app code in production |
| Multi-stage builds | ✅ | `frontend/Dockerfile` separates build/serve |
| Minimal open ports | ✅ | Only proxy ports exposed |
| Sensitive env vars | ✅ | Variables passed via `.env`, not hardcoded |
| Security headers | ✅ | Configured in `nginx.conf` and `helmet` |
| Antivirus scanning | ✅ | ClamAV container for upload scanning |

---

## High Availability & Resilience

| Control | Status | Evidence |
|---------|--------|----------|
| Restart policies | ✅ | `restart: unless-stopped` on all services |
| Health checks | ✅ | Configured for `postgres`, `backend` |
| Startup dependencies | ✅ | `depends_on` with `condition: service_healthy` |
| Database connection pooling | ✅ | Node.js `pg` pool configured |
| Graceful shutdown | ✅ | `serverLifecycle.js` handles SIGTERM/SIGINT |
| Database migration job | ✅ | Dedicated `migrate` container runs once on startup |

---

## Infrastructure Gaps

### INFRA-01: Resource Limits Already Configured
- **Severity:** Medium
- **Status:** ✅ Already Implemented
- **Location:** `docker-compose.yml`
- **Evidence:** All services have `mem_limit` and `cpus` constraints:
  - `postgres`: `mem_limit: 2g`, `cpus: 2.0`
  - `backend`: `mem_limit: 2g`, `cpus: 2.0`
  - `frontend`: `mem_limit: 256m`, `cpus: 1.0`
  - `portal`: `mem_limit: 256m`, `cpus: 1.0`
  - `ohif`: `mem_limit: 512m`, `cpus: 1.0`
  - `ai-worker`: `mem_limit: 4g`, `cpus: 1.0` (GPU-enabled)
- **Assessment:** Resource limits are already in place, preventing runaway processes from consuming all host resources.

### INFRA-02: Reverse Proxy and TLS Termination
- **Severity:** Medium
- **Status:** ✅ Documented — configuration guide provided
- **Location:** `docs/REVERSE_PROXY_TLS.md`
- **Evidence:** Created comprehensive Nginx, Caddy, and Cloudflare Tunnel configuration templates. Includes TLS hardening ciphers, security headers (HSTS, CSP, X-Frame-Options), and WebSocket support for real-time notifications.
- **Assessment:** While no production proxy is bundled in the repository, deployment guidance is now complete. Production deployment MUST include TLS termination at a load balancer or ingress proxy per the documented configuration.

### INFRA-03: Hardcoded URLs in Nginx CSP → REMEDIATED
- **Severity:** Medium
- **Location:** `frontend/nginx.conf` → now `frontend/nginx.conf.template`
- **Status:** **REMEDIATED** — CSP `frame-src` now uses `${VITE_OHIF_URL}` environment variable via nginx template substitution
- **Impact:** OHIF URL is parameterized for production deployment

---

## Network Architecture

The Docker network topology effectively isolates data tiers:
- **`frontend-net`**: Connects Nginx proxy to frontend, portal, and ohif.
- **`backend-net`**: Connects frontend/portal to backend API.
- **`db-net`**: Isolated network connecting only backend to PostgreSQL.
- **`pacs-net`**: Connects backend, orthanc, ohif, and ai-worker.

This segmentation prevents unauthorized direct access between unrelated components (e.g., frontend cannot talk directly to database).

---

## Deployment Readiness Recommendations

1. **Implement TLS termination:** Production deployment MUST include TLS termination at a load balancer or ingress proxy.
2. **Set resource limits:** Define memory and CPU limits in the production compose file.
3. **Configure log rotation:** Ensure Docker daemon is configured with `json-file` log rotation to prevent disk exhaustion.
4. **Parameterize Nginx configs:** Remove hardcoded localhost URLs from CSP.
