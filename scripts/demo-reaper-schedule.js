#!/usr/bin/env node
'use strict';

/**
 * demo-reaper-schedule.js — register the demo reaper to run unattended.
 *
 * Why this exists
 * ---------------
 * The lease store records when each demo expires, but nothing acted on it. An
 * expired demo therefore kept prospect patient data on disk indefinitely — the
 * exact failure the lease store was built to prevent. Registration is the step
 * that makes expiry real.
 *
 * It installs a schedule; it never deletes anything itself. The scheduled task
 * runs `demo-provision.js reap --yes`, which re-applies the ownership guard.
 *
 *   node scripts/demo-reaper-schedule.js install
 *   node scripts/demo-reaper-schedule.js status
 *   node scripts/demo-reaper-schedule.js uninstall
 *
 * Windows uses Task Scheduler (survives reboots, no resident process).
 * Linux/macOS falls back to a crontab entry.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'scripts', 'demo-provision.js');
const TASK_NAME = 'VIARA Demo Reaper';
const CRON_MARKER = '# viara-demo-reaper';

// Daily at 04:17 rather than on the hour. Every host that installs this
// script would otherwise wake at 00:00 together, and a demo host is small.
const HOUR = 4;
const MINUTE = 17;

const isWindows = process.platform === 'win32';

const run = (cmd, args, opts = {}) => {
    try {
        return {
            code: 0,
            out: execFileSync(cmd, args, {
                encoding: 'utf8',
                // execFileSync forwards child stderr to the parent by default,
                // which makes a routine "task not found" query look like a crash.
                stdio: ['ignore', 'pipe', 'pipe'],
                ...opts,
            }),
        };
    } catch (err) {
        return {
            code: err.status ?? 1,
            out: `${err.stdout || ''}${err.stderr || ''}`.trim(),
        };
    }
};

function reaperCommand() {
    return process.execPath.includes('node')
        ? `"${process.execPath}" "${CLI}" reap --yes`
        : `node "${CLI}" reap --yes`;
}

// ── Windows Task Scheduler ────────────────────────────────────────────────

function windowsTask() {
    const time = `${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')}`;
    return { time, action: `/c node "${CLI}" reap --yes` };
}

function windowsInstall() {
    const { time, action } = windowsTask();
    const result = run('schtasks', [
        '/Create',
        '/F',
        '/TN', TASK_NAME,
        '/TR', action,
        '/SC', 'DAILY',
        '/ST', time,
        '/RL', 'HIGHEST',
    ]);
    if (result.code !== 0) {
        throw new Error(`schtasks failed:\n${result.out}`);
    }
    return `Registered "${TASK_NAME}" to run daily at ${time}.`;
}

function windowsUninstall() {
    const result = run('schtasks', ['/Delete', '/TN', TASK_NAME, '/F']);
    if (result.code !== 0) {
        throw new Error(`schtasks failed:\n${result.out}`);
    }
    return `Removed "${TASK_NAME}".`;
}

function windowsStatus() {
    const result = run('schtasks', ['/Query', '/TN', TASK_NAME]);
    if (result.code !== 0) {
        return 'NOT REGISTERED';
    }
    const start = result.out.split(/\r?\n/).find((l) => /Start Time/.test(l));
    const status = result.out.split(/\r?\n/).find((l) => /Status/.test(l));
    return [status && status.trim(), start && start.trim()].filter(Boolean).join(' | ');
}

// ── cron (Linux / macOS) ──────────────────────────────────────────────────

function cronLine() {
    return `${MINUTE} ${HOUR} * * * cd ${ROOT} && node scripts/demo-provision.js reap --yes ${CRON_MARKER}`;
}

function cronInstall() {
    const current = run('crontab', ['-l'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const existing = current.code === 0 ? current.out : '';
    if (existing.includes(CRON_MARKER)) {
        return 'Already installed.';
    }
    // Drop any stale marker line first so re-running does not duplicate entries.
    const kept = existing.split(/\r?\n/).filter((l) => l && !l.includes(CRON_MARKER));
    const next = [...kept, cronLine(), ''].join('\n');
    const result = run('bash', ['-c', `printf '%s' ${JSON.stringify(next)} | crontab -`]);
    if (result.code !== 0) {
        throw new Error(`crontab write failed:\n${result.out}`);
    }
    return `Installed crontab entry running daily at ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')}.`;
}

function cronUninstall() {
    const current = run('crontab', ['-l'], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (current.code !== 0) return 'Nothing installed.';
    const kept = current.out.split(/\r?\n/).filter((l) => l && !l.includes(CRON_MARKER));
    const result = run('bash', ['-c', `printf '%s' ${JSON.stringify([...kept, ''].join('\n'))} | crontab -`]);
    if (result.code !== 0) throw new Error(result.out);
    return 'Removed crontab entry.';
}

function cronStatus() {
    const current = run('crontab', ['-l'], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (current.code !== 0) return 'NO CRONTAB';
    return current.out.includes(CRON_MARKER) ? 'INSTALLED' : 'NOT INSTALLED';
}

// ── entry ─────────────────────────────────────────────────────────────────

function main() {
    const action = process.argv[2];

    if (!fs.existsSync(CLI)) {
        throw new Error(`reaper CLI not found at ${CLI}`);
    }

    let out;
    switch (action) {
        case 'install':
            out = isWindows ? windowsInstall() : cronInstall();
            break;
        case 'uninstall':
            out = isWindows ? windowsUninstall() : cronUninstall();
            break;
        case 'status':
            out = isWindows ? windowsStatus() : cronStatus();
            break;
        default:
            out = `Usage: node scripts/demo-reaper-schedule.js <install|status|uninstall>\n`
                + `Platform: ${os.platform()} (${isWindows ? 'Task Scheduler' : 'cron'})\n`;
            process.stdout.write(out);
            return;
    }
    process.stdout.write(`${out}\n`);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
    }
}

module.exports = { cronLine, windowsTask, TASK_NAME, CRON_MARKER, HOUR, MINUTE };
