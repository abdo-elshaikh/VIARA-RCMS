#!/usr/bin/env node

/**
 * VIARA Performance & Load Testing CLI Runner
 * Executable according to PERFORMANCE_TEST_PLAN.md
 */

const path = require('path');
const config = require('./config');
const UserPool = require('./lib/userPool');
const MetricsCollector = require('./lib/metricsCollector');
const ReportGenerator = require('./lib/reportGenerator');

// Available scenarios
const SCENARIOS = {
    '01': { name: '01_auth_session', label: 'Auth & Session Lifecycle', fn: require('./scenarios/01_auth_session') },
    '02': { name: '02_reception_booking', label: 'Receptionist & Patient Booking', fn: require('./scenarios/02_reception_booking') },
    '03': { name: '03_clinical_reporting', label: 'Clinical Worklist & Reporting', fn: require('./scenarios/03_clinical_reporting') },
    '04': { name: '04_billing_payment', label: 'Billing & Idempotent Payments', fn: require('./scenarios/04_billing_payment') },
    '05': { name: '05_patient_portal', label: 'Patient Portal & Case Status', fn: require('./scenarios/05_patient_portal') },
    '06': { name: '06_admin_analytics', label: 'Admin Analytics & Audits', fn: require('./scenarios/06_admin_analytics') },
    '07': { name: '07_pacs_imaging', label: 'PACS Studies & Modalities', fn: require('./scenarios/07_pacs_imaging') },
    '08': { name: '08_concurrency_stress', label: 'Blended Multi-Role Concurrency', fn: require('./scenarios/08_concurrency_stress') },
    '09': { name: '09_concurrency_collision', label: 'Concurrency Collision & Race Conditions (PF-13)', fn: require('./scenarios/09_concurrency_collision') },
    '10': { name: '10_spike_surge', label: 'Spike & Surge Load Testing (PF-05)', fn: require('./scenarios/10_spike_surge') },
    '11': { name: '11_soak_memory', label: 'Endurance, Soak & Token Storms (PF-06 & PF-12)', fn: require('./scenarios/11_soak_memory') },
    '12': { name: '12_peak_load', label: 'Peak Load — Realistic Clinical Workflow (H-04)', fn: require('./scenarios/12_peak_load') },
    '13': { name: '13_soak_test', label: 'Soak Test — Long-Running Stability & Memory Leak Detection (H-04)', fn: require('./scenarios/13_soak_test') },
};

function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {
        scenario: 'all',
        users: 1,
        duration: 15,
        target: config.baseUrl,
        quick: false
    };

    for (const arg of args) {
        if (arg.startsWith('--scenario=')) {
            parsed.scenario = arg.split('=')[1].trim();
        } else if (arg.startsWith('--users=')) {
            parsed.users = Math.max(1, parseInt(arg.split('=')[1].trim(), 10) || 1);
        } else if (arg.startsWith('--duration=')) {
            parsed.duration = Math.max(2, parseInt(arg.split('=')[1].trim(), 10) || 15);
        } else if (arg.startsWith('--target=')) {
            parsed.target = arg.split('=')[1].trim();
        } else if (arg === '--quick') {
            parsed.quick = true;
            parsed.duration = 5;
            parsed.users = 1;
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
    }

    return parsed;
}

function printHelp() {
    console.log(`
VIARA Performance & Load Testing Harness
Usage: node performance-tests/run.js [options]

Options:
  --scenario=<01..13|all>   Scenario to run (default: all)
                            01: Auth & Sessions
                            02: Reception & Booking
                            03: Clinical & Reporting
                            04: Billing & Idempotency
                            05: Patient Portal
                            06: Admin & Analytics
                            07: PACS & Imaging
                            08: Blended Concurrency Stress
                            09: Concurrency Collision & Race Conditions
                            10: Spike & Surge Load
                            11: Endurance, Soak & Token Storms
                            12: Peak Load — Realistic Clinical Workflow (H-04)
                            13: Soak Test — Long-Running Stability (H-04)
  --users=<N>               Number of concurrent virtual users (default: 1)
  --duration=<N>            Test duration in seconds (default: 15)
  --target=<url>            Target API server (default: ${config.baseUrl})
  --quick                   Runs a quick 5-second smoke pass (1 VU)
  --help, -h                Show this help message

Examples:
  node performance-tests/run.js --quick
  node performance-tests/run.js --scenario=01 --users=5 --duration=10
  node performance-tests/run.js --scenario=08 --users=25 --duration=30
`);
}

async function main() {
    const args = parseArgs();
    config.baseUrl = args.target;

    console.log('\n🚀 Starting VIARA Performance Testing Harness');
    console.log(`📍 Target Server: ${config.baseUrl}`);
    console.log(`👥 Virtual Users (VUs): ${args.users}`);
    console.log(`⏱️  Duration: ${args.duration}s`);
    console.log(`🎯 Scenario: ${args.scenario}\n`);

    // 1. Health check probe
    try {
        const probeRes = await fetch(`${config.baseUrl}/health/ready`);
        if (!probeRes.ok) {
            console.warn(`⚠️  Target server readiness check returned status ${probeRes.status}. Continuing...`);
        } else {
            console.log('✅ Target server readiness check: 200 OK');
        }
    } catch (err) {
        console.error(`❌ Could not connect to target server at ${config.baseUrl}: ${err.message}`);
        console.error('Please ensure the VIARA backend server is running (e.g. node start-services.js)');
        process.exit(1);
    }

    const userPool = new UserPool(config);
    const metricsCollector = new MetricsCollector(config.thresholds);
    metricsCollector.start();
    let thresholdFailure = false;
    let thresholdIncomplete = false;

    // Determine scenarios to execute
    let selectedScenarios = [];
    if (args.scenario === 'all') {
        selectedScenarios = Object.values(SCENARIOS);
    } else if (SCENARIOS[args.scenario]) {
        selectedScenarios = [SCENARIOS[args.scenario]];
    } else {
        const match = Object.values(SCENARIOS).find(s => s.name === args.scenario);
        if (match) {
            selectedScenarios = [match];
        } else {
            console.error(`❌ Unknown scenario: ${args.scenario}. Run with --help to see available scenarios.`);
            process.exit(1);
        }
    }

    for (const sc of selectedScenarios) {
        console.log(`\n▶️  Executing Scenario: [${sc.name}] ${sc.label} (${args.users} VU(s), ${args.duration}s)...`);
        userPool.invalidate();
        const scCollector = new MetricsCollector(config.thresholds);

        await userPool.runConcurrently({
            scenarioFn: sc.fn,
            vus: args.users,
            durationSeconds: args.duration,
            metricsCollector: scCollector
        });

        const summary = scCollector.getSummary();
        thresholdFailure = thresholdFailure || summary.thresholdStatus === 'FAIL';
        thresholdIncomplete = thresholdIncomplete || summary.thresholdStatus === 'INCOMPLETE';
        ReportGenerator.printConsoleSummary(summary, `Scenario [${sc.name}] Results`);

        const { markdownPath } = ReportGenerator.saveMarkdownReport(summary, {
            title: `VIARA Performance Report - ${sc.label}`,
            scenarioName: sc.name,
            vus: args.users,
            outputDir: config.outputDir
        });

        console.log(`📁 Report generated: ${path.relative(process.cwd(), markdownPath)}`);

        // Also aggregate into global metricsCollector
        for (const rec of scCollector.records) {
            metricsCollector.record(rec);
        }
    }

    if (selectedScenarios.length > 1) {
        metricsCollector.stop();
        console.log('\n' + '='.repeat(80));
        console.log(' 🏁 Overall Test Suite Combined Summary');
        console.log('='.repeat(80));
        const combinedSummary = metricsCollector.getSummary();
        thresholdFailure = thresholdFailure || combinedSummary.thresholdStatus === 'FAIL';
        thresholdIncomplete = thresholdIncomplete || combinedSummary.thresholdStatus === 'INCOMPLETE';
        ReportGenerator.printConsoleSummary(combinedSummary, 'Combined Performance Test Run');

        const { markdownPath } = ReportGenerator.saveMarkdownReport(combinedSummary, {
            title: 'VIARA Comprehensive Performance Test Suite Report',
            scenarioName: 'Combined_All_Scenarios',
            vus: args.users,
            outputDir: config.outputDir
        });
        console.log(`📁 Master report generated: ${path.relative(process.cwd(), markdownPath)}`);
    }

    if (thresholdFailure) {
        console.error('❌ One or more measured performance thresholds failed.');
        process.exitCode = 1;
        console.log('\n⚠️  Performance test execution completed with failed acceptance thresholds.\n');
    } else if (thresholdIncomplete) {
        console.error('⚠️ One or more configured performance thresholds could not be evaluated; the run is incomplete.');
        process.exitCode = 2;
        console.log('\n⚠️  Performance test execution completed, but acceptance evidence is incomplete.\n');
    } else {
        console.log('\n✨ Performance test execution completed without measured threshold failures.\n');
    }
}

main().catch(err => {
    console.error('\n❌ Fatal execution error:', err);
    process.exit(1);
});
