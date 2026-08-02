# Radiology Center Management System (RCMS)

![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)
![Security Audit](https://img.shields.io/badge/security%20audit-verified-success.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-blue.svg)
![PostgreSQL](https://img.shields.io/badge/postgresql-15-blue.svg)
![React](https://img.shields.io/badge/react-18-blue.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.9-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)

**RCMS** is a high-availability, enterprise-grade **Radiology Information System (RIS)** and **Picture Archiving and Communication System (PACS)** orchestrator. It connects clinical radiology operations, DICOM image acquisition, web diagnostic viewing, AI-assisted finding analysis, patient self-service, referring physician collaboration, and financial management into a unified platform.

---

## 📐 System Architecture Diagram

```mermaid
flowchart TB
    subgraph Clients ["Client Layer"]
        A[Staff Web App - React/Vite\n:5173]
        B[Patient & Doctor Portal - React/TS\n:5174]
        C[Modality / Scanner\nCT, MRI, X-Ray]
    end

    subgraph Edge ["API Gateway & Reverse Proxy"]
        D[Express 5 REST API Server\n:3000]
        E[OHIF Diagnostic Viewer v3.12\n:3005]
    end

    subgraph PACS ["PACS & Imaging Layer"]
        F[Orthanc DICOM Server\nC-STORE :4242 / REST :8042]
        G[Modality Worklist Directory\npacs-worklists/ .wl]
        H[Lua Reconciliation Webhook]
    end

    subgraph Intelligence ["AI & Security Workers"]
        I[Local PyTorch AI Worker\nDenseNet-121 / MedGemma]
        J[Cloud AI Fallback\nGemini / Groq / OpenRouter]
        K[ClamAV Malware Container\n:3310]
    end

    subgraph Data ["Data & Storage Layer"]
        L[(PostgreSQL 15 Database\nAES-256 Field Encryption)]
        M[(Orthanc Storage Volume)]
        N[(Encrypted Backups & Uploads)]
    end

    A -->|HTTPS / JWT| D
    B -->|HTTPS / JWT| D
    A -->|Embedded Viewer| E
    C -->|DICOM C-ECHO / C-STORE| F
    C -->|Fetch MWL| G
    F -->|Lua Webhook Event| H
    H -->|X-Pacs-Signature| D
    D -->|PostgreSQL Query| L
    D -->|DICOMweb Proxy| F
    D -->|Sanitize Uploads| K
    D -->|Dispatch DICOM AI Job| I
    D -->|Cloud AI Request| J
    F --> M
    D --> N
```

---

## 🔄 End-to-End Clinical DICOM Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Rec as Receptionist
    actor Tech as Radiographer
    actor Scanner as DICOM Modality
    actor Rad as Radiologist
    participant API as RCMS Backend API
    participant MWL as MWL Generator
    participant Orthanc as Orthanc PACS
    participant AI as AI Worker
    participant Viewer as OHIF Viewer

    Rec->>API: 1. Register Patient & Create Study Order
    API->>MWL: 2. Generate DICOM Worklist (.wl file)
    Tech->>Scanner: 3. Select Patient from Modality Worklist
    Scanner->>Orthanc: 4. Perform Exam & DICOM C-STORE Images
    Orthanc->>API: 5. Trigger Lua Webhook (Study Arrived)
    API->>AI: 6. Dispatch Automated AI Finding Analysis
    AI-->>API: 7. Store Computer Vision AI Predictions
    Rad->>Viewer: 8. Launch OHIF Viewer with Study JWT
    Rad->>API: 9. Draft & Digitally Sign Impression Report
    API-->>Rec: 10. Report Ready for Distribution / Portal Access
```

---

## 🗄️ Database Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    USERS ||--o{ PATIENTS : manages
    USERS ||--o{ REPORTS : signs
    PATIENTS ||--o{ ORDERS : requests
    MODALITIES ||--o{ EXAMINATION_TYPES : offers
    EXAMINATION_TYPES ||--o{ ORDERS : includes
    ORDERS ||--o{ STUDIES : generates
    STUDIES ||--o{ REPORTS : documented_by
    STUDIES ||--o{ PACS_AI_JOBS : analyzed_by
    ORDERS ||--o{ INVOICES : billed_in
    INVOICES ||--o{ PAYMENTS : settled_by
    USERS ||--o{ AUDIT_LOGS : performs

    USERS {
        uuid user_id PK
        string full_name
        string email UK
        enum role
        boolean is_active
        string two_factor_secret
    }

    PATIENTS {
        uuid patient_id PK
        string mrn UK
        string first_name_enc
        string last_name_enc
        string first_name_hash
        string last_name_hash
        string phone_enc
        string national_id_hash
    }

    MODALITIES {
        uuid modality_id PK
        string name
        string type
        string aet
        enum status
    }

    ORDERS {
        uuid order_id PK
        uuid patient_id FK
        enum status
        enum priority
        timestamp scheduled_at
    }

    STUDIES {
        uuid study_id PK
        uuid order_id FK
        string dicom_study_uid UK
        string patient_mrn
        string modality_code
        integer instance_count
    }

    REPORTS {
        uuid report_id PK
        uuid study_id FK
        uuid radiologist_id FK
        text findings
        text impression
        enum status
        timestamp signed_at
    }

    INVOICES {
        uuid invoice_id PK
        uuid order_id FK
        decimal total_amount
        enum payment_status
    }

    AUDIT_LOGS {
        uuid log_id PK
        uuid user_id FK
        string action
        string entity_name
        string prev_hash
        string curr_hash
    }
```

---

## 🌟 Key Features

### 🩺 Radiology Information System (RIS)
* **Patient Lifecycle & Scheduling:** Complete workflow management from appointment scheduling, check-in, modality assignment, scan completion, to reporting and archiving.
* **Modality Worklist (MWL):** Real-time generation of standard DICOM `.wl` worklists for CT, MRI, X-Ray, Ultrasound, and Mammography modalities using `dcmjs` Explicit VR Little Endian (`1.2.840.10008.1.2.1`).
* **Structured Radiology Reporting:** Feature-rich reporting editor supporting pre-configured templates, macros, AI assistance, digital signatures, and PDF generation.

### 🖼️ PACS & Diagnostic Web Viewing
* **Orthanc DICOM Storage:** Native DICOM C-STORE, C-ECHO, QIDO-RS, and WADO-RS web services.
* **OHIF Diagnostic Viewer v3.12:** Embedded zero-footprint web viewer with study-scoped, short-lived JWT authentication for secure DICOMweb image streaming.
* **Real-time Webhook Reconciliation:** Lua script event handlers triggering immediate database state sync upon study receipt (`X-Pacs-Signature`).

### 🤖 AI-Assisted Radiographic Finding Analysis
* **Local Computer Vision Worker:** PyTorch / TorchXRayVision container trained on chest radiography datasets (DenseNet-121, MedGemma) analyzing 14 pathology classifications.
* **Multi-Provider Cloud LLM Engine:** Automated fallback supporting Google Gemini Flash, Groq, OpenRouter, Anthropic Claude, and OpenAI.
* **De-identification & SSRF Protection:** Strict automated pixel & metadata de-identification prior to cloud calls, with private loopback IP range validation.

### 👥 Patient & Referring Physician Portal
* **Patient Self-Service:** Portal for reviewing report history, downloading invoices, and launching web image previews.
* **Referring Doctor Hub:** Real-time order status tracking, digital requisition forms, and secure document access.

### 🌐 Multi-Lingual Support (i18n)
* Built-in internationalization across staff application and patient portal supporting English, Arabic, French, and Spanish, with language auto-detection and right-to-left (RTL) layout support.

### 🛡️ Enterprise Security & Data Protection
* **Field-Level PII Encryption:** AES-256-GCM encryption for sensitive patient fields (`first_name_enc`, `last_name_enc`, `phone_enc`, `national_id_enc`) with blind indexing (`*_hash`) for exact-match database queries.
* **Tamper-Evident Audit Chaining:** Cryptographically linked audit logs (`SHA-256(prev_hash + log_payload)`) guaranteeing non-repudiation of data modifications.
* **Malware & Upload Protection:** ClamAV socket scanning for attachments and disk-quarantine byte caps for DICOM uploads (`PACS_MAX_REQUEST_BYTES`).
* **Fail-Closed Startup Validation:** Strict environment schema validator (`validateEnv.js`) enforcing secret entropy, CORS rules, and backup parameters.

---

## 🔒 Security & HIPAA / GDPR Safeguards

RCMS complies with international healthcare data protection frameworks (HIPAA & GDPR):

| Safeguard Category | Implemented Mechanism | Description |
| :--- | :--- | :--- |
| **Data at Rest** | AES-256-GCM Field Encryption | Sensitive PII fields encrypted with unique IVs; database backups encrypted via `BACKUP_ENCRYPTION_KEY`. |
| **Data in Transit** | TLS 1.3 / HTTPS | All client-to-API and viewer-to-PACS web communications strictly enforced over TLS. |
| **Access Control** | RBAC & OTP 2FA | Role-based permission enforcement with mandatory TOTP 2FA for administrative & clinical staff. |
| **Audit Controls** | SHA-256 Cryptographic Chain | Immutably linked audit log entries preventing tampering or deletion of access records. |
| **GDPR Compliance** | Data Export & Anonymization | Built-in endpoints for automated PII data export (`/api/v1/privacy/gdpr-export`) and record anonymization. |
| **SSRF Safeguards** | IP Filtering Middleware | AI and external endpoint proxy requests validate destination IPs against private/loopback CIDR blocks. |

---

## 📡 DICOM Modality Worklist (MWL) & Scanner Integration

RCMS generates standard DICOM Modality Worklist `.wl` files automatically whenever an examination order is scheduled or checked in.

### DICOM Modality Mapping Table

| RIS Modality Code | DICOM (0008,0060) Code | Transfer Syntax | Supported Modalities |
| :---: | :---: | :---: | :--- |
| `MRI` / `MR` | `MR` | `1.2.840.10008.1.2.1` | Magnetic Resonance Imaging |
| `CT` | `CT` | `1.2.840.10008.1.2.1` | Computed Tomography |
| `X-RAY` / `DX` / `DR` | `DX` | `1.2.840.10008.1.2.1` | Digital Radiography / X-Ray |
| `CR` | `CR` | `1.2.840.10008.1.2.1` | Computed Radiography |
| `ULTRASOUND` / `US` | `US` | `1.2.840.10008.1.2.1` | Diagnostic Ultrasound |
| `MAMMOGRAPHY` / `MG` | `MG` | `1.2.840.10008.1.2.1` | Digital Mammography |
| `PET` | `PT` | `1.2.840.10008.1.2.1` | Positron Emission Tomography |

### Testing DICOM Modality Connectivity via Terminal

Engineers can test C-ECHO and MWL queries using standard `dcmtk` command line tools:

```bash
# 1. Verification (C-ECHO)
echoscu -v -aec MiPACS2 127.0.0.1 4242

# 2. Modality Worklist Query (C-FIND)
findscu -v -aec MiPACS2 -aet MY_SCANNER 127.0.0.1 4242 -k 0010,0010="" -k 0008,0060="DX"

# 3. Test DICOM Image Store (C-STORE)
storescu -v -aec MiPACS2 127.0.0.1 4242 sample_study.dcm
```

---

## 💾 Database Backup, Decryption & Key Rotation Playbook

RCMS contains automated background database backup capabilities and emergency decryption tools.

### Encrypted Backup Format
Backups are generated with an `RCMSBKP2` magic header, 12-byte initialization vector, AES-256-GCM cipher payload, and 16-byte authentication tag.

### Backup & Decryption Commands
```bash
# 1. Decrypt an encrypted PostgreSQL database backup file
node backend/scripts/decryptBackup.js ./backups/rcms_backup_2026-08-02.pgdump.enc ./backups/restored.pgdump

# 2. Restore decrypted database dump into PostgreSQL
pg_restore -U rcms -d rcms --clean --if-exists ./backups/restored.pgdump

# 3. Rotate database field encryption keys
node backend/scripts/reencryptData.js
```

---

## 📊 Structured Logging, Correlation & Observability

* **JSON Winston Logger:** All application log events are emitted as structured JSON objects containing timestamps, log levels, correlation IDs, and stack trace details.
* **Correlation Tracing:** Every HTTP request assigns a unique `X-Request-ID` header propagated across microservices, database operations, and Orthanc webhooks.
* **Automatic Redaction:** Sensitive keys (`password`, `jwt`, `two_factor_secret`, `credit_card`, `authorization`, `encrypted_pii`) are automatically redacted before log serialization.

---

## 🏗️ Technology Stack

| Layer | Component | Technologies & Frameworks |
| :--- | :--- | :--- |
| **Backend** | API Server | Node.js (Express 5), Zod validation, Winston logger, `bcrypt`, `pg`, `dcmjs` |
| | Authentication | JWT Bearer Tokens, TOTP 2FA (`otplib`), Progressive Lockout |
| **Frontend** | Staff Client | React 18, Vite, Redux Toolkit, React Router v6, Tailwind CSS, Lucide Icons, Vitest |
| | Patient Portal | React 18, Vite, TypeScript 5.9, Redux Toolkit, Tailwind CSS, Sonner |
| **PACS / DICOM**| DICOM Core | Orthanc DICOM Server (v24.3.5), GDCM plugin |
| | Web Viewer | OHIF Diagnostic Viewer (v3.12.6) |
| **Database** | RDBMS | PostgreSQL 15 (Alpine), 94+ Transactional Migrations with Advisory Locks |
| **AI / Security**| Local Inference | Python 3.10, PyTorch, TorchXRayVision |
| | Security Scanner| ClamAV Container |
| **Orchestration**| System Runtime | Docker Engine v24+, Docker Compose v2, Node.js Orchestrator (`start-services.js`) |

---

## 📂 Detailed Repository Structure

```
RCMS/
├── .github/workflows/        # GitHub Actions CI/CD pipeline (`quality-gates.yml`)
├── backend/                  # Express.js REST API Server
│   ├── src/
│   │   ├── config/           # Database pool, Winston logger, CORS & env settings
│   │   ├── controllers/      # Business logic handlers (Auth, Patients, PACS, Reports, Billing)
│   │   ├── middleware/       # Auth JWT, RBAC role guard, rate limiters, upload validators
│   │   ├── routes/           # Modular REST API routes (/api/v1/...)
│   │   ├── schemas/          # Zod input validation schemas
│   │   ├── services/         # Encryption, audit chaining, DICOM MWL, AI dispatcher
│   │   ├── utils/            # Role governance, PII blind indexers, helper utilities
│   │   └── server.js         # API entry point & graceful connection draining
│   ├── scripts/              # Developer scripts (migrate, user create, backup decrypt)
│   └── tests/                # Jest backend unit and integration test suite
├── frontend/                 # Staff Web Client (React + Vite + Redux)
│   └── src/                  # Workstation components, DICOM viewer integration, i18n
├── portal/                   # Patient & Referring Doctor Portal (React + TS + Vite)
│   └── src/                  # Self-service portal pages, authentication, report viewer
├── pacs/                     # PACS & DICOM Services
│   ├── orthanc/              # Orthanc configuration (`orthanc.json`) & `reconcile.lua`
│   ├── ohif/                 # OHIF Viewer Nginx config & Docker context
│   └── ai-worker/            # Local PyTorch AI inference engine
├── pacs-worklists/           # DICOM Modality Worklist directory (.wl files)
├── database/                 # SQL schemas, seeders, and transactional migration engine (`migrate.js`)
├── start-services.js         # Master cross-platform launcher & process manager
├── start-services.bat        # Windows Command Prompt launcher
├── start-services.ps1        # PowerShell launcher
├── start-services.sh         # Linux/macOS Shell launcher
├── docker-compose.yml        # Multi-container production & development orchestration
└── WINDOWS_SERVER_2019_...   # Detailed Windows Server production deployment guide
```

---

## ⚙️ Environment Variables Reference

Below is the complete configuration matrix for `.env`. Copy from `.env.example` to start.

| Parameter | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `development` | Runtime mode (`development`, `production`, `test`) |
| `POSTGRES_USER` | Yes | `rcms` | PostgreSQL database user |
| `POSTGRES_PASSWORD` | **Yes** | — | High-entropy database password |
| `POSTGRES_DB` | Yes | `rcms` | Database name |
| `POSTGRES_PORT` | No | `5432` | Host port binding for PostgreSQL |
| `JWT_SECRET` | **Yes** | — | Minimum 32-character secret for signing JWT tokens |
| `ENCRYPTION_KEY` | **Yes** | — | Exactly 64 hex characters (32 bytes) for PII field encryption |
| `BACKUP_ENCRYPTION_KEY`| **Yes** | — | Separate 64 hex characters key for database backups |
| `BLIND_INDEX_KEY` | **Yes** | — | Separate secret key for HMAC blind indexing |
| `CLIENT_URL` | **Yes** | `http://localhost:5173` | Public HTTPS URL of the staff web application |
| `PORTAL_CLIENT_URL` | **Yes** | `http://localhost:5174` | Public HTTPS URL of the patient portal |
| `ALLOWED_ORIGINS` | **Yes** | — | Comma-separated list of allowed CORS origins |
| `ORTHANC_URL` | Yes | `http://orthanc:8042` | Orthanc REST API endpoint |
| `ORTHANC_USERNAME` | Yes | `rcms` | Orthanc REST authentication username |
| `ORTHANC_PASSWORD` | **Yes** | — | Orthanc REST authentication password |
| `ORTHANC_AET` | Yes | `MiPACS2` | Application Entity Title of the PACS server |
| `PACS_SERVER_IP` | Yes | `127.0.0.1` | LAN/VPN IP address used by modalities |
| `PACS_DICOM_PORT` | Yes | `4242` | Port modalities connect to for DICOM C-STORE |
| `PACS_WEBHOOK_SECRET` | **Yes** | — | Shared HMAC secret for Orthanc Lua webhooks |
| `GEMINI_API_KEY` | Optional | — | Google Gemini Flash API key for cloud AI report assistance |
| `OPENROUTER_API_KEY` | Optional | — | OpenRouter API key for fallback cloud AI models |
| `GROQ_API_KEY` | Optional | — | Groq API key for high-speed cloud inference |

---

## 👥 Staff Roles & Governance Matrix

RCMS enforces fine-grained Role-Based Access Control (RBAC):

| Role | System & Governance | Patient & Clinical | PACS & Viewing | Billing & Financial |
| :--- | :---: | :---: | :---: | :---: |
| **Developer** | Full System Control & Role Mgmt | Full Access | Full Access | Full Access |
| **Admin** | Manage Staff (except Protected) | Full Access | Full Access | Full Access |
| **Radiologist** | Read-Only Settings | Full Clinical & Reporting | Full OHIF & AI Tools | Read Invoices |
| **Technician / Nurse**| Read-Only Settings | Patient Check-in & Worklists | Modality & MWL Sync | None |
| **Receptionist** | None | Registration & Scheduling | View Study Status | Generate Invoices |
| **Cashier / Accountant**| None | View Patient Basic Info | None | Full Payment & Refund |
| **Insurance_Staff** | None | View Patient & Policy Info | None | Process Claims |
| **Referring_Doctor**| Portal Only | Assigned Patients Only | Portal Study Viewer | None |
| **Marketing / HR** | Manage HR/Marketing | None | None | None |

---

## 🔌 API Endpoint Directory

Below is a summary of core API routes available in RCMS:

| Group | Route | Method | Access Level | Function |
| :--- | :--- | :---: | :--- | :--- |
| **Authentication** | `/api/v1/auth/login` | `POST` | Public | Staff login with progressive lockout |
| | `/api/v1/auth/2fa/verify` | `POST` | Public | TOTP 2FA verification |
| | `/api/v1/auth/refresh` | `POST` | Authenticated | Token refresh |
| **Patients** | `/api/v1/patients` | `GET` / `POST` | Staff | List/Search patients (via blind index) or register new patient |
| | `/api/v1/patients/:id` | `GET` / `PUT` | Staff | Retrieve decrypted patient record or update PII |
| **PACS & Worklist**| `/api/v1/pacs/studies` | `GET` | Radiologist / Tech | Search PACS studies |
| | `/api/v1/pacs/ohif-token/:uid` | `GET` | Radiologist | Obtain short-lived OHIF study viewer bearer token |
| | `/api/v1/pacs/webhook` | `POST` | PACS System | Reconciler webhook signed with `X-Pacs-Signature` |
| **Reports & AI** | `/api/v1/reports` | `GET` / `POST` | Radiologist | List radiology reports or create report draft |
| | `/api/v1/reports/:id/sign` | `POST` | Radiologist | Digitally sign finalized report |
| | `/api/v1/reports/:id/ai-draft`| `POST` | Radiologist | Generate AI-assisted report draft |
| **Billing** | `/api/v1/billing/invoices` | `GET` / `POST` | Cashier / Admin | Invoice generation and payment tracking |
| | `/api/v1/billing/refunds` | `POST` | Admin / Accountant | Process refund audit separation |
| **Audit & Security** | `/api/v1/audit/logs` | `GET` | Admin / Developer | Search tamper-evident cryptographic audit logs |
| | `/api/v1/privacy/gdpr-export`| `POST` | Admin | Export PII data for compliance |
| **Health** | `/health/ready` | `GET` | Public | Readiness check (validates DB connectivity) |
| | `/health/live` | `GET` | Public | Liveness ping |

---

## 🗃️ Database Migration Engine & Zero-Downtime Design

Database schema updates are managed exclusively by the transactional runner [`database/migrate.js`](file:///d:/RCMS/database/migrate.js).

### Migration Principles
1. **Advisory Locking:** Acquires PostgreSQL lock `pg_advisory_lock(847291)` before executing DDL scripts, preventing parallel container startup races during rolling cluster upgrades.
2. **Transactional Execution:** Each `.sql` file executes inside an isolated transaction block (`BEGIN` $\rightarrow$ `COMMIT`), rolling back completely if any statement fails.
3. **Checksum Tracking:** Records applied migration hashes in the `schema_migrations` tracking table to detect modified historical migrations.
4. **Zero-Downtime Web Startup:** No DDL queries run during Express HTTP server startup (`server.js`), keeping API servers light and preventing database locks during traffic spikes.

### Migration Commands
```bash
# Apply pending SQL migrations
node database/migrate.js

# Wipe schema, re-apply schema.sql, all 94 migrations, and seed data (Dev/CI)
node database/migrate.js --fresh --seed
```

---

## 🐋 Docker Infrastructure Topology

RCMS runs as an orchestrated set of Docker containers defined in `docker-compose.yml`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Docker Compose Topology                         │
├─────────────────┬───────────────────┬──────────────────────────────────┤
│ Container Name  │ Resource Limits   │ Network Isolations               │
├─────────────────┼───────────────────┼──────────────────────────────────┤
│ rcms_db         │ 2 CPU, 2 GB RAM   │ data                             │
│ rcms_clamav     │ 2 CPU, 2 GB RAM   │ data, scanner-egress             │
│ rcms_backend    │ 2 CPU, 2 GB RAM   │ app, data                        │
│ rcms_frontend   │ 1 CPU, 256 MB RAM │ app                              │
│ rcms_portal     │ 1 CPU, 256 MB RAM │ app                              │
│ rcms_orthanc    │ 2 CPU, 2 GB RAM   │ app, data                        │
│ rcms_ohif       │ 1 CPU, 512 MB RAM │ app                              │
│ pacs-ai-worker  │ GPU Profile (ai)  │ data                             │
└─────────────────┴───────────────────┴──────────────────────────────────┘
```

---

## ⚡ Automated CI/CD & Quality Gates

Every pull request and main branch push triggers the GitHub Actions pipeline ([.github/workflows/quality-gates.yml](file:///d:/RCMS/.github/workflows/quality-gates.yml)):

1. **Docker Validation:** Validates `docker-compose.yml` syntactical purity and builds production container images (`backend`, `frontend`, `portal`, `ohif`).
2. **Container Security Auditing:** Executes Aqua Security **Trivy** vulnerability scans on container images, failing the build on any unfixed `HIGH` or `CRITICAL` vulnerability.
3. **Python & AI Inference Verification:** Installs Python 3.11, audits dependencies using `pip-audit`, compiles source code, and runs PyTest unit tests on `pacs/ai-worker`.
4. **Supply Chain Dependency Audit:** Runs `npm audit --omit=dev --audit-level=high` across backend, frontend, and portal trees.
5. **Static Analysis & Testing:** Runs Jest backend tests, Vitest frontend tests, ESLint linting, and TypeScript compilation.
6. **Database Migration & Live Harness:** Runs `database/migrate.js --fresh --seed` against a live PostgreSQL service container and executes the 44-check live API deployment validation harness.

---

## 🚀 Quick Start & Development

### 1. Clone & Install
```bash
git clone https://github.com/abdo-elshaikh/RCMS.git
cd RCMS
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and supply valid random secret strings
```

### 3. Launch Services

```bash
# Standard Dev Mode (Docker for DB/PACS/ClamAV, Node local for app code)
npm start

# Full Containerized Mode (Everything in Docker)
npm run dev:docker-all

# Bare-Metal Mode (Local Node processes against local DB/PACS)
npm run dev:no-docker
```

---

## 🧪 Testing & Validation Harness

```bash
# Execute backend unit test suite
npm test --prefix backend

# Execute frontend unit test suite
npm test --prefix frontend

# Run frontend ESLint checks
npm run lint --prefix frontend

# Verify TypeScript types on the patient portal
npm run typecheck --prefix portal

# Run complete pre-deployment verification harness
npm run validate-deployment --prefix backend
```

---

## ❓ Frequently Asked Questions & Troubleshooting

<details>
<summary><b>1. Error: "Environment validation failed: Missing secret key" on startup</b></summary>
RCMS uses a fail-closed environment validator (<code>validateEnv.js</code>). Ensure that <code>JWT_SECRET</code>, <code>ENCRYPTION_KEY</code>, <code>BACKUP_ENCRYPTION_KEY</code>, <code>BLIND_INDEX_KEY</code>, and <code>PACS_WEBHOOK_SECRET</code> are populated in your <code>.env</code> file with sufficient length/entropy.
</details>

<details>
<summary><b>2. DICOM Modality cannot send images to port 4242</b></summary>
Ensure that <code>PACS_DICOM_BIND</code> in <code>.env</code> is bound to the server's actual LAN IP (e.g. <code>192.168.1.100</code>) rather than <code>127.0.0.1</code>, and verify that firewall port <code>4242/TCP</code> is open for the modality subnet.
</details>

<details>
<summary><b>3. OHIF Viewer fails to load DICOM images (CORS error)</b></summary>
Check that <code>ALLOWED_ORIGINS</code> contains the exact origin URL where the staff application is being accessed (e.g. <code>http://localhost:5173</code> or <code>https://ris.center.com</code>).
</details>

<details>
<summary><b>4. How do I create the initial Admin / Developer account?</b></summary>
Run <code>npm run create:developer --prefix backend</code> from the project root. This CLI script will interactively guide you through generating an initial administrative account.
</details>

---

## 📄 License & Confidentiality

This codebase is **Proprietary & Confidential**. All rights reserved. Unauthorized copying, modification, or distribution is strictly prohibited.
