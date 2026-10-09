/**
 * demoLeaseStore.js
 * -----------------
 * Registry of per-prospect demo environments.
 *
 * WHY THIS IS INFRASTRUCTURE ISOLATION, NOT TENANT ISOLATION
 * ==========================================================
 * VIARA has no tenant scoping. `branch_id` exists only on financial tables;
 * `patients`, `appointments`, `examinations` and `users` are global, and the
 * controllers filter by no branch at all. A single shared instance would
 * therefore show one prospect another prospect's patients — unacceptable for a
 * system that claims HIPAA/GDPR compliance, and unacceptable in a radiology
 * system where the data is diagnostic images.
 *
 * So each demo is a SEPARATE STACK with its own PostgreSQL and its own Orthanc
 * volume. Isolation comes from the database boundary, not from application
 * code. This module tracks those stacks so they can be audited and, crucially,
 * reclaimed when a trial ends — a demo that lives forever is a liability that
 * keeps prospect data on disk after the evaluation is over.
 *
 * DESTRUCTIVE-OPERATION GUARD
 * ===========================
 * Teardown removes containers and volumes. A typo or a stale ledger must never
 * be able to target a production stack. Every project name is namespaced under
 * `viara-demo-`, and `assertOwnedProject` refuses any name that is not both
 * correctly prefixed AND present in the ledger. Reclaiming is therefore always
 * an explicit, auditable act against a stack this tool created.
 *
 * Storage is a single JSON file written atomically (temp file + rename) so a
 * crash mid-write cannot leave an unparseable ledger, which would either lose
 * every lease or, worse, disable the ownership guard.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Every demo stack this tool is allowed to create or destroy. */
const PROJECT_PREFIX = 'viara-demo-';

/** Lease lifecycle states. */
const STATUS = {
    ACTIVE: 'active',
    RECLAIM_REQUESTED: 'reclaim_requested',
    RECLAIMED: 'reclaimed',
};

const DEFAULT_LEDGER_PATH = path.resolve(__dirname, '../../.demo/leases.json');

const ISO_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Convert a free-form customer reference into a container-safe slug.
 * Untrusted input reaches this from a sales rep, so it is restricted to
 * characters that are safe in a Docker project name, and truncated.
 *
 * @param {string} value
 * @returns {string}
 */
const slugify = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/**
 * Build the namespaced compose project name for a customer.
 *
 * @param {string} customerId
 * @returns {string}
 */
const projectNameFor = (customerId) => {
    const slug = slugify(customerId);
    if (!slug) throw new Error('customerId must contain at least one alphanumeric character');
    return `${PROJECT_PREFIX}${slug}`;
};

/** Read the ledger, treating a missing file as an empty one. */
const readLedger = (ledgerPath) => {
    try {
        const raw = fs.readFileSync(ledgerPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.leases)) {
            throw new Error('ledger is missing a "leases" array');
        }
        return parsed;
    } catch (error) {
        if (error.code === 'ENOENT') return { version: 1, leases: [] };
        // A corrupt ledger must not silently become "no leases" — that would
        // disable the ownership guard and orphan every running demo stack.
        throw new Error(`demo lease ledger at ${ledgerPath} is unreadable: ${error.message}`);
    }
};

/** Write the ledger atomically so a crash cannot corrupt it. */
const writeLedger = (ledgerPath, ledger) => {
    const dir = path.dirname(ledgerPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${ledgerPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, ledgerPath);
};

// Overridable so tests (and operators managing a ledger kept off the repo) can
// point at another file. Falls back to the default inside the repo.
const resolvePath = (ledgerPath) => {
    if (ledgerPath) return path.resolve(ledgerPath);
    if (process.env.VIARA_DEMO_LEDGER) return path.resolve(process.env.VIARA_DEMO_LEDGER);
    return DEFAULT_LEDGER_PATH;
};

/**
 * Record a new demo lease.
 *
 * @param {object} input
 * @param {string} input.customerId
 * @param {string} [input.displayName]
 * @param {string} [input.contactEmail]
 * @param {number} [input.days]        Validity window in days.
 * @param {string} [input.notes]
 * @param {Date}   [input.now]         Injected for deterministic tests.
 * @param {string} [ledgerPath]
 * @returns {object} The stored lease.
 */
const createLease = ({
    customerId, displayName = '', contactEmail = '', days = 14, notes = '', now = new Date(), ledgerPath,
} = {}) => {
    if (!customerId || !String(customerId).trim()) {
        throw new Error('customerId is required');
    }
    if (!Number.isFinite(days) || days <= 0) {
        throw new Error('days must be a positive number');
    }

    const file = resolvePath(ledgerPath);
    const ledger = readLedger(file);
    const project = projectNameFor(customerId);

    const existing = ledger.leases.find(
        lease => lease.project === project && lease.status !== STATUS.RECLAIMED
    );
    if (existing) {
        throw new Error(
            `an active demo already exists for "${customerId}" (project ${existing.project}, ` +
            `expires ${existing.expiresAt}) — reclaim it before provisioning another`
        );
    }

    const createdAt = new Date(now);
    const lease = {
        customerId: String(customerId).trim(),
        displayName: String(displayName || '').trim(),
        contactEmail: String(contactEmail || '').trim(),
        project,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + days * ISO_DAY_MS).toISOString(),
        status: STATUS.ACTIVE,
        notes: String(notes || ''),
    };

    ledger.leases.push(lease);
    writeLedger(file, ledger);
    return lease;
};

/** All leases, newest last. */
const listLeases = ({ ledgerPath } = {}) => readLedger(resolvePath(ledgerPath)).leases;

/** Leases that have not yet been reclaimed. */
const activeLeases = ({ ledgerPath } = {}) =>
    listLeases({ ledgerPath }).filter(lease => lease.status !== STATUS.RECLAIMED);

/** Look up a single lease by customer reference. */
const getLease = (customerId, { ledgerPath } = {}) => {
    const project = projectNameFor(customerId);
    const matching = listLeases({ ledgerPath }).filter(lease => lease.project === project);
    return matching[matching.length - 1] || null;
};

/** Whole days left before expiry; negative once overdue. */
const daysRemaining = (lease, now = new Date()) =>
    Math.ceil((new Date(lease.expiresAt).getTime() - now.getTime()) / ISO_DAY_MS);

/**
 * Leases that are past their expiry and not yet reclaimed. These are the stacks
 * holding prospect data that should no longer exist.
 */
const findExpired = ({ now = new Date(), ledgerPath } = {}) =>
    activeLeases({ ledgerPath }).filter(lease => daysRemaining(lease, now) <= 0);

/** Mark a lease as due for teardown. */
const markReclaimRequested = (customerId, { ledgerPath } = {}) => {
    const file = resolvePath(ledgerPath);
    const ledger = readLedger(file);
    const project = projectNameFor(customerId);
    const lease = ledger.leases.find(entry => entry.project === project && entry.status !== STATUS.RECLAIMED);
    if (!lease) throw new Error(`no active demo lease for "${customerId}"`);

    lease.status = STATUS.RECLAIM_REQUESTED;
    lease.reclaimRequestedAt = new Date().toISOString();
    writeLedger(file, ledger);
    return lease;
};

/** Mark a lease as fully torn down. */
const markReclaimed = (customerId, { now = new Date(), ledgerPath } = {}) => {
    const file = resolvePath(ledgerPath);
    const ledger = readLedger(file);
    const project = projectNameFor(customerId);
    const matching = ledger.leases.filter(entry => entry.project === project);
    const lease = matching[matching.length - 1];
    if (!lease) throw new Error(`no demo lease for "${customerId}"`);

    lease.status = STATUS.RECLAIMED;
    lease.reclaimedAt = new Date(now).toISOString();
    writeLedger(file, ledger);
    return lease;
};

/**
 * Ownership guard for destructive operations.
 *
 * Throws unless the project name is namespaced under the demo prefix AND is
 * recorded in the ledger. This is what stops a reaper from deleting volumes
 * that belong to a production or a developer's local stack.
 *
 * @param {string} project
 * @param {object} [options]
 * @returns {string} The validated project name.
 */
const assertOwnedProject = (project, { ledgerPath } = {}) => {
    if (!project || !String(project).startsWith(PROJECT_PREFIX)) {
        throw new Error(
            `refusing to touch "${project}": demo stacks must be named under "${PROJECT_PREFIX}"`
        );
    }
    const ledger = readLedger(resolvePath(ledgerPath));
    const owned = ledger.leases.some(lease => lease.project === project);
    if (!owned) {
        throw new Error(
            `refusing to touch "${project}": it is not recorded in the demo lease ledger`
        );
    }
    return project;
};

module.exports = {
    PROJECT_PREFIX,
    STATUS,
    ISO_DAY_MS,
    DEFAULT_LEDGER_PATH,
    slugify,
    projectNameFor,
    createLease,
    listLeases,
    activeLeases,
    getLease,
    daysRemaining,
    findExpired,
    markReclaimRequested,
    markReclaimed,
    assertOwnedProject,
    readLedger,
    writeLedger,
};
