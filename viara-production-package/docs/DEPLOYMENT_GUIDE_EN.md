# VIARA RCMS — Client Server Deployment & Operations Manual

> **Archived draft:** This legacy guide is not approved; its deployment and access instructions are obsolete. Do not use any `.env`, demo credentials, or trial license referenced below. Use the [current client operations guide](../../docs/CLIENT_DEPLOYMENT_OPERATIONS_AR.md) and deploy only a vendor-approved release package and images.

## 1. Minimum System Requirements

| Component | Minimum for Evaluation / Trial | Recommended for Production |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 / Windows Server 2022 | Ubuntu 24.04 LTS / RHEL 9 |
| **Processor (CPU)** | 4 Cores | 8+ Cores (Xeon / AMD EPYC) |
| **Memory (RAM)** | 8 GB | 16 - 32 GB |
| **Disk Storage** | 50 GB SSD | 500 GB+ NVMe SSD (based on DICOM imaging volume) |
| **Software** | Docker Engine v24+ with Docker Compose v2.24+ | Docker Engine + Nginx Reverse Proxy with TLS/SSL |

---

## 2. Quick Installation & Launch

### Step 1: Transfer & Extract Package
Move the `viara-production-package` directory to your target destination on the server (e.g. `/opt/viara`):
```bash
sudo mv viara-production-package /opt/viara
cd /opt/viara
```

### Step 2: Review Environment Configuration
This guide is archived; this workspace does not contain a valid deployment configuration. Obtain the approved release package, pinned image references, secrets, and license from VIARA through an approved secure channel.
```bash
chmod 600 .env
chmod +x scripts/*.sh
```
*(Optional)*: If your center uses a custom domain (e.g., `https://viara.client-clinic.com`), edit `.env` to update:
```env
CLIENT_URL=https://viara.client-clinic.com
ALLOWED_ORIGINS=https://viara.client-clinic.com
```

### Step 3: Start Services
* **On Linux / macOS:**
  ```bash
  ./scripts/start.sh
  ```
* **On Windows Server:**
  Double-click:
  ```cmd
  scripts\start.bat
  ```

---

## 3. Clinical Demo Data Options — Include or Skip

VIARA RCMS provides full flexibility for evaluating demo data vs starting with a clean database:

### A. Initial Onboarding Wizard
On first login, the setup wizard provides an interactive choice:
* **Include exploratory demo data (Recommended for trial evaluation):** Automatically configures diagnostic rooms, imaging modalities, examination types, sample patients, and clinical workflow appointments.
* **Skip demo data (Clean start):** Begins with an empty database ready for real clinic and patient data entry.

### B. Admin Settings Web Hub
Administrators can manage demo data at any time under **Admin Settings → Governance & Maintenance** (`/settings?tab=admin&subtab=governance`):
* Click **"🌱 Seed Demo Data"** to load clinical sample data.
* Click **"🗑️ Clear Demo Data"** to safely remove only sample demo records and restore a clean database.

### C. Command Line Scripts
* **Linux / macOS:** `./scripts/seed-demo.sh`
* **Windows Server:** `scripts\seed-demo.bat`

---

## 4. Initial Administrator Access

Initial administrator details are delivered through the release-specific secure onboarding procedure. Do not use default credentials or local development configuration.

---

## 5. Licensing & Hardware Fingerprint Management

1. **Check License Status & Quotas:**
   Navigate to: **System Settings → Licensing & Edition** (`/settings?tab=admin&subtab=license`).
   Here you can review:
   * Customer ID encoded in the vendor-issued license for this release.
   * Countdown timer and expiration date.
   * Real-time quota consumption (Patients, Appointments, Staff seats, Daily reports).
   * **Server Hardware Fingerprint:** A single-click copyable SHA-256 fingerprint for node-locked enterprise contracts.

2. **Perpetual Upgrade Without Downtime (Hot Upgrade):**
   When purchasing a permanent license:
   * **Via UI:** In the Licensing tab, drag and drop the new `.txt` license key file and click **"Activate License Now"**.
   * **Via Command Line:**
     ```bash
     ./scripts/update-license.sh "<NEW_LICENSE_KEY>"
     ```
   The license is re-verified and activated immediately in memory without server restarts or data loss.

---

## 6. Backups & Maintenance

* **Create Instant Database Snapshot:**
  ```bash
  ./scripts/backup.sh
  ```
  Snapshots are compressed and stored in `backups/`.
* **Graceful Stack Shutdown:**
  ```bash
  ./scripts/stop.sh
  ```
