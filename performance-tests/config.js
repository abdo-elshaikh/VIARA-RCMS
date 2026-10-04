/**
 * VIARA Performance & Load Testing Configuration
 * Aligned with PERFORMANCE_TEST_PLAN.md
 */

const path = require('path');
const fs = require('fs');

// Read environment variables from root .env without requiring external modules
const rootEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(rootEnvPath)) {
    const envContent = fs.readFileSync(rootEnvPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (!process.env[key]) {
                process.env[key] = val;
            }
        }
    }
}

const config = {
    // Target Base URL (defaults to backend port 3000 or Vite proxy 5173)
    baseUrl: process.env.PERF_BASE_URL || process.env.VITE_API_URL || 'http://localhost:3000',
    
    // Default Timeout per HTTP request (ms)
    timeoutMs: Number(process.env.PERF_TIMEOUT_MS) || 15000,

    // Test Users Pool (passwords match seeded environment)
    users: {
        admin: {
            email: process.env.PERF_ADMIN_EMAIL || 'developer@VIARA.com',
            password: process.env.PERF_ADMIN_PASSWORD || process.env.TEST_USER_PASSWORD || 'ViaraAdmin@2026',
            role: 'Developer'
        },
        receptionist: {
            email: process.env.PERF_RECEPTION_EMAIL || 'reception@VIARA.com',
            password: process.env.PERF_RECEPTION_PASSWORD || process.env.TEST_USER_PASSWORD || 'ViaraAdmin@2026',
            role: 'Receptionist'
        },
        radiologist: {
            email: process.env.PERF_RADIOLOGIST_EMAIL || 'mona.ibrahim@VIARA.com',
            password: process.env.PERF_RADIOLOGIST_PASSWORD || process.env.TEST_USER_PASSWORD || 'ViaraAdmin@2026',
            role: 'Radiologist'
        },
        cashier: {
            email: process.env.PERF_CASHIER_EMAIL || 'cashier@VIARA.com',
            password: process.env.PERF_CASHIER_PASSWORD || process.env.TEST_USER_PASSWORD || 'ViaraAdmin@2026',
            role: 'Cashier'
        },
        patient: {
            mrn: process.env.PERF_PATIENT_MRN || 'MRN-000001',
            password: process.env.PERF_PATIENT_PASSWORD || 'Patient@123',
            role: 'Patient'
        },
        referringDoctor: {
            email: process.env.PERF_REF_DOCTOR_EMAIL || 'hossam.ref@VIARA.com',
            password: process.env.PERF_REF_DOCTOR_PASSWORD || process.env.TEST_USER_PASSWORD || 'ViaraAdmin@2026',
            role: 'Referring_Doctor'
        }
    },

    // Workload Distribution (% of VUs) from Section 4 of PERFORMANCE_TEST_PLAN.md
    workloadDistribution: {
        reception: 0.30,   // 30% Receptionist journeys
        radiologist: 0.20, // 20% Clinical & reporting
        nursing: 0.15,     // 15% Worklist & exam intake
        cashier: 0.10,     // 10% Cashier & billing
        portal: 0.20,      // 20% Patient & doctor portal
        admin: 0.05        // 5% Management & analytics
    },

    // Acceptable SLA Thresholds from Section 6 of PERFORMANCE_TEST_PLAN.md
    thresholds: {
        apiRead: {
            p95: 500,     // ms
            p99: 1500     // ms
        },
        apiWriteAndSearch: {
            p95: 1000,    // ms
            p99: 2500     // ms
        },
        diagnosticImageFirstLoad: {
            p95: 5000     // ms
        },
        maxErrorRatePercent: 1.0 // <1% unexpected errors
    },

    // Think time between user actions (simulates human pauses)
    thinkTime: {
        minMs: Number(process.env.PERF_THINK_MIN_MS) || 500,
        maxMs: Number(process.env.PERF_THINK_MAX_MS) || 2000
    },

    // Output directory for reports and metrics
    outputDir: path.resolve(__dirname, 'reports')
};

module.exports = config;
