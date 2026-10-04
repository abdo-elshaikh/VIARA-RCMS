/**
 * Scenario 08: Blended Concurrency & Stress Workload
 * Simulates real-world traffic matching Section 4 distribution:
 * - 30% Receptionist (Search, Registration, Rooms, Schedule)
 * - 20% Radiologist (Worklist, Exams, Reports)
 * - 10% Cashier (Invoices, Payments, Idempotency)
 * - 20% Patient Portal (Public Overview, Login, Reports)
 * - 10% Admin & Analytics (Stats, Matrices, Audits)
 * - 10% PACS & Imaging (Studies, Modalities)
 */

const runAuthSessionScenario = require('./01_auth_session');
const runReceptionBookingScenario = require('./02_reception_booking');
const runClinicalReportingScenario = require('./03_clinical_reporting');
const runBillingPaymentScenario = require('./04_billing_payment');
const runPatientPortalScenario = require('./05_patient_portal');
const runAdminAnalyticsScenario = require('./06_admin_analytics');
const runPacsImagingScenario = require('./07_pacs_imaging');

async function runConcurrencyStressScenario({ vuId, userPool, metricsCollector }) {
    // Determine user journey based on VU index (1 to 100)
    const slot = vuId % 10;

    if (slot >= 0 && slot <= 2) {
        // 30% Receptionist
        await runReceptionBookingScenario({ vuId, userPool, metricsCollector });
    } else if (slot === 3 || slot === 4) {
        // 20% Radiologist
        await runClinicalReportingScenario({ vuId, userPool, metricsCollector });
    } else if (slot === 5) {
        // 10% Cashier
        await runBillingPaymentScenario({ vuId, userPool, metricsCollector });
    } else if (slot === 6 || slot === 7) {
        // 20% Patient Portal
        await runPatientPortalScenario({ vuId, userPool, metricsCollector });
    } else if (slot === 8) {
        // 10% Admin & Analytics
        await runAdminAnalyticsScenario({ vuId, userPool, metricsCollector });
    } else {
        // 10% PACS & Imaging
        await runPacsImagingScenario({ vuId, userPool, metricsCollector });
    }
}

module.exports = runConcurrencyStressScenario;
