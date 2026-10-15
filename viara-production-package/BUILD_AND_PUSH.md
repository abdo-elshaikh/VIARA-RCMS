# VIARA RCMS — Docker Registry Strategy & Deployment Guide

This document covers how to build, tag, push, and deploy the three VIARA
application images: **backend**, **frontend**, and **portal**.

> Third-party images (`POSTGRES_IMAGE`, `REDIS_IMAGE`, `CLAMAV_IMAGE`,
> `ORTHANC_IMAGE`, `VIARA_OHIF_IMAGE`) are pulled directly from their
> upstream registries and are **not** built here.

---

## 1. Building Images Locally

Run these commands from the **repository root** (`d:\VIARA` or its Linux
equivalent), where each sub-directory (`backend/`, `frontend/`, `portal/`)
contains its own `Dockerfile`.

```bash
# Backend
docker build -t viara-backend:1.0.0 ./backend

# Frontend
docker build -t viara-frontend:1.0.0 ./frontend

# Portal
docker build -t viara-portal:1.0.0 ./portal
```

Replace `1.0.0` with the actual release version as needed.

---

## 2. Tag & Push to a Registry

### Scenario A — GitHub Container Registry (GHCR)

```bash
# Authenticate once
echo $GITHUB_PAT | docker login ghcr.io -u <github-username> --password-stdin

# Backend
docker tag viara-backend:1.0.0 ghcr.io/<org>/viara-backend:1.0.0
docker push ghcr.io/<org>/viara-backend:1.0.0

# Frontend
docker tag viara-frontend:1.0.0 ghcr.io/<org>/viara-frontend:1.0.0
docker push ghcr.io/<org>/viara-frontend:1.0.0

# Portal
docker tag viara-portal:1.0.0 ghcr.io/<org>/viara-portal:1.0.0
docker push ghcr.io/<org>/viara-portal:1.0.0
```

Replace `<org>` with your GitHub organisation or username (e.g. `viara-health`).

### Scenario B — Private / Self-Hosted Registry

```bash
# Authenticate once
docker login registry.yourdomain.com

# Backend
docker tag viara-backend:1.0.0 registry.yourdomain.com/viara-backend:1.0.0
docker push registry.yourdomain.com/viara-backend:1.0.0

# Frontend
docker tag viara-frontend:1.0.0 registry.yourdomain.com/viara-frontend:1.0.0
docker push registry.yourdomain.com/viara-frontend:1.0.0

# Portal
docker tag viara-portal:1.0.0 registry.yourdomain.com/viara-portal:1.0.0
docker push registry.yourdomain.com/viara-portal:1.0.0
```

---

## 3. Updating `.env` with Image References

`docker-compose.yml` reads these three variables for the VIARA application
images (plus one for the bundled OHIF viewer):

| Variable               | Image                  |
|------------------------|------------------------|
| `VIARA_BACKEND_IMAGE`  | Node.js API server     |
| `VIARA_FRONTEND_IMAGE` | Nginx staff web console |
| `VIARA_PORTAL_IMAGE`   | Nginx patient/doctor portal |
| `VIARA_OHIF_IMAGE`     | OHIF DICOM viewer (pre-built) |

Edit `.env` in `viara-production-package/` and set the full image references:

```dotenv
# GHCR example
VIARA_BACKEND_IMAGE=ghcr.io/<org>/viara-backend:1.0.0
VIARA_FRONTEND_IMAGE=ghcr.io/<org>/viara-frontend:1.0.0
VIARA_PORTAL_IMAGE=ghcr.io/<org>/viara-portal:1.0.0

# Private registry example
# VIARA_BACKEND_IMAGE=registry.yourdomain.com/viara-backend:1.0.0
# VIARA_FRONTEND_IMAGE=registry.yourdomain.com/viara-frontend:1.0.0
# VIARA_PORTAL_IMAGE=registry.yourdomain.com/viara-portal:1.0.0
```

> Always use an **immutable** tag (e.g. `1.0.0`, `1.0.0-20240601`) rather
> than `latest` to guarantee reproducible deployments and safe rollbacks.

---

## 4. First Deployment

Complete these steps in order on the target server.

```bash
# 1. Clone or copy viara-production-package/ to the server
scp -r ./viara-production-package user@server:/opt/viara

# 2. SSH into the server
ssh user@server

# 3. Change into the deployment directory
cd /opt/viara

# 4. Copy the example env file and fill in all required values
cp .env.example .env
nano .env   # or vi .env

# 5. Authenticate with the registry (run only once per server)
echo $REGISTRY_PAT | docker login ghcr.io -u <username> --password-stdin
# or: docker login registry.yourdomain.com

# 6. Pull all images (verifies credentials and network access)
docker compose pull

# 7. Run the database migration (runs once; container exits on success)
docker compose run --rm migrate

# 8. Start all services in the background
docker compose up -d

# 9. Confirm every service is healthy
docker compose ps
docker compose logs --tail=50 backend
```

---

## 5. Update Deployment

Use this procedure whenever you release a new version (e.g. `1.1.0`).

```bash
# Step 1 — Build & push the new image(s) from the development machine
docker build -t viara-backend:1.1.0 ./backend
docker tag  viara-backend:1.1.0 ghcr.io/<org>/viara-backend:1.1.0
docker push ghcr.io/<org>/viara-backend:1.1.0

# Repeat for frontend and/or portal as needed

# Step 2 — On the server: update image references in .env
nano /opt/viara/.env
# Change:
#   VIARA_BACKEND_IMAGE=ghcr.io/<org>/viara-backend:1.0.0
# To:
#   VIARA_BACKEND_IMAGE=ghcr.io/<org>/viara-backend:1.1.0

# Step 3 — Pull the new images and restart
cd /opt/viara
docker compose pull
docker compose up -d

# Step 4 — Verify
docker compose ps
docker compose logs --tail=50 backend
```

Docker Compose restarts only the services whose image has changed; unaffected
services (postgres, redis, etc.) keep running without interruption.

---

## 6. Rollback to a Previous Version

If a deployment causes issues, revert to the last known-good image in minutes.

```bash
# Step 1 — On the server: revert the image tag in .env
nano /opt/viara/.env
# Change:
#   VIARA_BACKEND_IMAGE=ghcr.io/<org>/viara-backend:1.1.0
# Back to:
#   VIARA_BACKEND_IMAGE=ghcr.io/<org>/viara-backend:1.0.0

# Step 2 — Restart the affected service(s)
cd /opt/viara
docker compose up -d

# (Docker Compose pulls the previous tag from cache or registry automatically)

# Step 3 — Confirm the service is healthy
docker compose ps
docker compose logs --tail=50 backend
```

> **Database note:** if the new version ran schema migrations that are not
> backwards-compatible, a rollback may require restoring a database backup.
> Always take a backup before applying a new release.

---

## 7. Quick Reference

| Action                    | Command                                      |
|---------------------------|----------------------------------------------|
| Build all images          | `./build-images.sh --version 1.0.0`          |
| Build & push (GHCR)       | `./build-images.sh --version 1.0.0 --registry ghcr.io/<org> --push` |
| Pull latest images        | `docker compose pull`                        |
| Start / update stack      | `docker compose up -d`                       |
| View service status       | `docker compose ps`                          |
| Follow logs (backend)     | `docker compose logs -f backend`             |
| Stop all services         | `docker compose down`                        |
| Stop + remove volumes     | `docker compose down -v` *(destructive!)*    |
