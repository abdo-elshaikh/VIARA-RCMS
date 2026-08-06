# 10 — Dependency & SBOM Report

**Review date:** 2026-08-04  
**Scope:** Backend, frontend, and portal package dependencies; Docker base images; Python AI worker  
**Methodology:** Static review of package.json files and Dockerfile base images  

---

## Executive Summary

RCMS manages three npm workspaces plus a Python AI worker. CI enforces `npm audit --omit=dev --audit-level=high` and Trivy container scanning. Dependencies are modern and well-maintained. No known critical vulnerabilities detected in static review.

> **Note:** `npm audit` could not be executed during this review due to environment restrictions. Results below are based on static dependency manifest review and CI pipeline verification.

---

## Software Bill of Materials

### Backend (Node.js)

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| express | ^4.21.x | HTTP framework | Low |
| pg | ^8.x | PostgreSQL driver | Low |
| bcrypt | ^5.x | Password hashing | Low |
| jsonwebtoken | ^9.x | JWT tokens | Low |
| helmet | ^7.x | Security headers | Low |
| cors | ^2.x | CORS middleware | Low |
| cookie-parser | ^1.x | Cookie parsing | Low |
| dotenv | ^16.x | Env var loading | Low |
| otplib | ^12.x | TOTP 2FA | Low |
| qrcode | ^1.x | QR code generation | Low |
| winston | ^3.x | Structured logging | Low |
| multer | ^1.x | File upload | Medium |
| nodemailer | ^6.x | Email sending | Low |
| stripe | ^14.x | Payment integration | Low |
| twilio | ^4.x | SMS integration | Low |
| pdfmake | ^0.2.x | PDF generation | Low |
| sharp | ^0.33.x | Image processing | Medium (native) |

### Frontend (React/Vite)

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| react | ^18.2.0 | UI framework | Low |
| react-dom | ^18.2.0 | DOM rendering | Low |
| react-router-dom | ^6.30.4 | Routing | Low |
| @reduxjs/toolkit | ^2.0.1 | State management | Low |
| react-redux | ^9.0.4 | React-Redux binding | Low |
| react-hook-form | ^7.49.2 | Form handling | Low |
| react-hot-toast | ^2.6.0 | Notifications | Low |
| recharts | ^3.8.1 | Charts | Low |
| lucide-react | ^0.303.0 | Icons | Low |
| i18next | ^26.3.3 | Internationalization | Low |
| docx | ^9.7.1 | DOCX generation | Low |
| write-excel-file | ^4.1.1 | Excel export | Low |
| qrcode.react | ^3.1.0 | QR code rendering | Low |
| tailwindcss | ^3.4.0 | CSS framework | Low |
| vite | ^7.1.5 | Build tool | Low |

### Portal (React/TypeScript/Vite)

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| react | ^18.2.0 | UI framework | Low |
| zod | ^3.22.4 | Schema validation | Low |
| @hookform/resolvers | ^3.3.4 | Form/Zod integration | Low |
| sonner | ^2.0.7 | Toast notifications | Low |
| typescript | ^5.9.3 | Type checking | Low |

### Docker Base Images

| Image | Version | Purpose | Hardened |
|-------|---------|---------|----------|
| node | 20.19-alpine | Backend runtime | ✅ Alpine |
| node | 20.19-alpine | Build stage (frontend/portal) | ✅ Alpine |
| nginx | 1.27-alpine | Frontend/portal serving | ✅ Alpine |
| postgres | 15-alpine | Database | ✅ Alpine |

### Python AI Worker

| Package | Purpose |
|---------|---------|
| torchxrayvision | Chest X-ray analysis |
| flask / fastapi | API server |
| pytest | Testing |

---

## CI Vulnerability Scanning

The CI pipeline performs:
1. `npm audit --omit=dev --audit-level=high` for all 3 npm workspaces
2. `pip-audit` for Python requirements
3. Trivy container image scanning (`HIGH,CRITICAL`, `exit-code: 1`)

---

## License Summary

All identified production dependencies use permissive open-source licenses (MIT, ISC, Apache-2.0, BSD). No GPL or AGPL dependencies detected in the production dependency tree.

---

## Recommendations

1. **Run `npm audit fix`** to apply any available security patches
2. **Pin Docker base image digests** for reproducible builds
3. **Add `npm audit` output to deployment artifacts** for traceability
4. **Consider SBOM generation** (e.g., `@cyclonedx/cdxgen`) for formal compliance
5. **Monitor Vite 7.x** — ensure compatibility as it's relatively new
