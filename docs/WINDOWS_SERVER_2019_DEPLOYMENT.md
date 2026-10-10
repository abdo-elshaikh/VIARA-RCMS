# VIARA on Windows Server 2019 Deployment Guide

VIARA is built around Linux containers and should not be deployed as native Windows containers on Windows Server 2019.

## Recommended Architecture

- Host: Windows Server 2019
- Runtime: Hyper-V Linux VM or a separate Linux VM on the same network
- Container runtime: Docker Engine on the Linux VM
- Deployment method: `docker compose` using the VIARA repository

This keeps the application aligned with its current Dockerfiles, `docker-compose.yml`, and service expectations.

## Why this approach

- The backend, frontend, portal, Orthanc, ClamAV, and OHIF images are Linux-based.
- The startup script in `start-services.js` expects Docker Compose and Linux containers.
- Native Windows container mode would require a large platform rewrite and is not the intended deployment path.

## Prerequisites

- Windows Server 2019 with Hyper-V enabled.
- An Ubuntu Server or Debian VM for VIARA.
- Docker Engine and Docker Compose installed in that VM.
- DNS or static IP for the VM.
- TLS certificate and reverse proxy if this will be exposed outside a private network.
- A secrets store or protected `.env` file on the Linux VM.

## Deployment Steps

### 1. Prepare the Linux VM

- Install Ubuntu Server 22.04 LTS or Debian 12.
- Install Docker Engine and the Compose plugin.
- Add the deployment user to the `docker` group.
- Open only the required ports on the VM firewall.
- Make sure the VM has enough RAM and disk for Postgres, Orthanc, uploads, and backups.

### 2. Copy the VIARA repository

- Clone the VIARA repository into the Linux VM.
- Keep the repo on a persistent disk.
- Do not store secrets in the repository.

### 3. Configure environment variables

Create a production `.env` file or inject equivalent secrets through your secrets manager.

Required values include:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `BACKUP_ENCRYPTION_KEY`
- `BLIND_INDEX_KEY`
- `ORTHANC_PASSWORD`
- `PACS_WEBHOOK_SECRET`
- `CLIENT_URL`
- `PORTAL_CLIENT_URL`
- `PORTAL_PUBLIC_URL`
- `ALLOWED_ORIGINS`

Use HTTPS URLs for all public-facing values.

### 4. Build and start the stack

From the repository root on the Linux VM:

```bash
docker compose config --quiet
docker compose build --pull
docker compose up -d
```

If you want to run the initial database migration separately:

```bash
docker compose up -d postgres clamav
docker compose run --rm migrate
docker compose up -d backend frontend portal orthanc ohif
```

### 5. Verify health

- Confirm Postgres is healthy.
- Confirm ClamAV is healthy.
- Confirm the backend `/health/ready` endpoint returns success.
- Confirm the frontend and portal load in a browser.
- Confirm Orthanc responds on its local health endpoint.
- Confirm logs contain no missing-secret errors.

### 6. Put a reverse proxy in front

Use IIS on the Windows host, or preferably Nginx/Traefik/HAProxy on the Linux VM, to terminate TLS and route traffic.

Recommended routing:

- Staff app: frontend service
- Portal: portal service
- API: backend service
- OHIF: OHIF service

Do not expose Postgres or Orthanc REST broadly to the internet.

## Operational Notes

- Use immutable image tags for releases.
- Take a database backup before every production migration.
- Keep uploads and backups on volumes with enough free space.
- Use health checks and restart policies.
- Keep ClamAV enabled for upload scanning.
- Keep Orthanc and the PACS network isolated from the public internet.

## Rollback

If the deployment fails:

1. Stop the newly deployed containers.
2. Re-deploy the previous image tags.
3. Re-run health checks.
4. Restore the database from the last known-good backup if the migration cannot be reversed cleanly.

## What Not to Do

- Do not run VIARA as Windows containers on Server 2019.
- Do not rely on Docker Desktop on a Windows Server production host.
- Do not expose the database or Orthanc REST ports publicly.
- Do not keep production secrets in a committed `.env` file.

## If You Must Keep Everything on the Windows Host

Only do this for development or a temporary proof of concept:

- Install Node.js on Windows.
- Run `start-services.ps1` or `start-services.bat` for local service orchestration.
- Use `--no-docker` only if you are intentionally skipping the container stack.

That path is not the recommended production deployment model for VIARA.