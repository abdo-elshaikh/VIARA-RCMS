'use strict';

/**
 * demo-lease-store.test.js
 * -----------------------
 * Tests for the demo environment lease registry.
 *
 * The load-bearing behaviour is the ownership guard: reclamation removes
 * containers and volumes, so it must be impossible to point it at anything the
 * tool did not create. These tests cover that guard first, then the ledger
 * mechanics around it.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../../scripts/lib/demoLeaseStore');

const NOW = new Date('2026-10-01T12:00:00.000Z');

describe('demoLeaseStore', () => {
    let tmpDir;
    let ledgerPath;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'VIARA-demo-leases-'));
        ledgerPath = path.join(tmpDir, 'leases.json');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── Naming ───────────────────────────────────────────────────────────

    describe('projectNameFor', () => {
        test('namespaces every project under the demo prefix', () => {
            expect(store.projectNameFor('Acme Radiology')).toBe('viara-demo-acme-radiology');
        });

        test('produces a docker-safe name from messy input', () => {
            const name = store.projectNameFor('  مركز النور / Cairo__Scans!!  ');
            expect(name).toBe(store.PROJECT_PREFIX + slugOf(name));
            expect(name).toMatch(/^viara-demo-[a-z0-9-]+$/);
        });

        test('rejects a customer reference with no usable characters', () => {
            expect(() => store.projectNameFor('///')).toThrow(/alphanumeric/);
        });
    });

    const slugOf = (name) => name.replace(store.PROJECT_PREFIX, '');

    // ── Ownership guard (the destructive-operation safety net) ───────────

    describe('assertOwnedProject', () => {
        test('allows a project that is prefixed and recorded', () => {
            const lease = store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });
            expect(store.assertOwnedProject(lease.project, { ledgerPath })).toBe(lease.project);
        });

        test('refuses an unprefixed project even when it exists on the host', () => {
            // The real production/dev stack has no prefix — this is exactly the
            // case that would otherwise delete a developer's local volumes.
            expect(() => store.assertOwnedProject('viara', { ledgerPath }))
                .toThrow(/must be named under/);
        });

        test('refuses a prefixed project that is not in the ledger', () => {
            // A leftover stack from before the ledger was adopted, or a name
            // hand-typed by an operator, must not be destroyable.
            expect(() => store.assertOwnedProject('viara-demo-orphan', { ledgerPath }))
                .toThrow(/not recorded in the demo lease ledger/);
        });

        test('refuses an empty or missing project name', () => {
            expect(() => store.assertOwnedProject('', { ledgerPath })).toThrow();
            expect(() => store.assertOwnedProject(undefined, { ledgerPath })).toThrow();
        });

        test('still guards after a lease is reclaimed', () => {
            const lease = store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });
            store.markReclaimed('Acme', { ledgerPath, now: NOW });
            // Ownership is retained for audit, but the name is namespaced, so
            // this resolves; what matters is that it is never widened.
            expect(store.assertOwnedProject(lease.project, { ledgerPath })).toBe(lease.project);
        });
    });

    // ── Ledger mechanics ─────────────────────────────────────────────────

    describe('createLease', () => {
        test('records the customer, project, and expiry window', () => {
            const lease = store.createLease({
                customerId: 'Acme',
                contactEmail: 'sales@acme.test',
                days: 14,
                ledgerPath,
                now: NOW,
            });

            expect(lease.project).toBe('viara-demo-acme');
            expect(lease.status).toBe(store.STATUS.ACTIVE);
            expect(lease.createdAt).toBe(NOW.toISOString());
            expect(new Date(lease.expiresAt).getTime()).toBe(NOW.getTime() + 14 * store.ISO_DAY_MS);
            expect(lease.contactEmail).toBe('sales@acme.test');
        });

        test('refuses a second active demo for the same customer', () => {
            store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });
            expect(() => store.createLease({ customerId: 'Acme', ledgerPath, now: NOW }))
                .toThrow(/already exists/);
        });

        test('allows re-provisioning after a previous demo was reclaimed', () => {
            store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });
            store.markReclaimed('Acme', { ledgerPath, now: NOW });

            const second = store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });
            expect(second.status).toBe(store.STATUS.ACTIVE);
        });

        test('requires a customer reference and a positive window', () => {
            expect(() => store.createLease({ ledgerPath })).toThrow(/customerId is required/);
            expect(() => store.createLease({ customerId: 'Acme', days: 0, ledgerPath }))
                .toThrow(/positive number/);
        });

        test('persists to disk so the ledger survives a process restart', () => {
            store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });
            const reloaded = require('../../scripts/lib/demoLeaseStore');
            expect(reloaded.listLeases({ ledgerPath })).toHaveLength(1);
        });
    });

    // ── Expiry and reclamation ───────────────────────────────────────────

    describe('expiry', () => {
        test('counts whole days remaining', () => {
            const lease = store.createLease({ customerId: 'Acme', days: 10, ledgerPath, now: NOW });
            expect(store.daysRemaining(lease, NOW)).toBe(10);
            expect(store.daysRemaining(lease, new Date(NOW.getTime() + 3 * store.ISO_DAY_MS))).toBe(7);
        });

        test('goes negative once overdue', () => {
            const lease = store.createLease({ customerId: 'Acme', days: 5, ledgerPath, now: NOW });
            expect(store.daysRemaining(lease, new Date(NOW.getTime() + 8 * store.ISO_DAY_MS))).toBe(-3);
        });

        test('finds only overdue, not-yet-reclaimed leases', () => {
            store.createLease({ customerId: 'ShortTrial', days: 2, ledgerPath, now: NOW });
            store.createLease({ customerId: 'LongTrial', days: 30, ledgerPath, now: NOW });

            const later = new Date(NOW.getTime() + 5 * store.ISO_DAY_MS);
            const expired = store.findExpired({ now: later, ledgerPath });

            expect(expired.map(l => l.customerId)).toEqual(['ShortTrial']);
        });

        test('does not re-report a lease that was already reclaimed', () => {
            store.createLease({ customerId: 'Acme', days: 2, ledgerPath, now: NOW });
            const later = new Date(NOW.getTime() + 5 * store.ISO_DAY_MS);
            store.markReclaimRequested('Acme', { ledgerPath });
            store.markReclaimed('Acme', { ledgerPath, now: later });

            expect(store.findExpired({ now: later, ledgerPath })).toHaveLength(0);
        });
    });

    describe('reclaim lifecycle', () => {
        test('moves through requested then reclaimed', () => {
            store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });

            const requested = store.markReclaimRequested('Acme', { ledgerPath });
            expect(requested.status).toBe(store.STATUS.RECLAIM_REQUESTED);
            expect(requested.reclaimRequestedAt).toBeTruthy();

            const reclaimed = store.markReclaimed('Acme', { ledgerPath, now: NOW });
            expect(reclaimed.status).toBe(store.STATUS.RECLAIMED);
            expect(reclaimed.reclaimedAt).toBe(NOW.toISOString());
        });

        test('excludes reclaimed leases from the active list', () => {
            store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });
            store.createLease({ customerId: 'Beta', ledgerPath, now: NOW });
            store.markReclaimed('Acme', { ledgerPath, now: NOW });

            expect(store.activeLeases({ ledgerPath }).map(l => l.customerId)).toEqual(['Beta']);
        });

        test('refuses to request a reclaim for an unknown customer', () => {
            expect(() => store.markReclaimRequested('Ghost', { ledgerPath }))
                .toThrow(/no active demo lease/);
        });
    });

    // ── Ledger integrity ─────────────────────────────────────────────────

    describe('ledger integrity', () => {
        test('fails loudly on a corrupt ledger instead of reporting zero leases', () => {
            // Silently treating corruption as "no leases" would disable the
            // ownership guard and orphan every running demo stack.
            fs.writeFileSync(ledgerPath, '{ this is not json', 'utf8');
            expect(() => store.listLeases({ ledgerPath })).toThrow(/unreadable/);
        });

        test('rejects a ledger without a leases array', () => {
            fs.writeFileSync(ledgerPath, JSON.stringify({ version: 1 }), 'utf8');
            expect(() => store.listLeases({ ledgerPath })).toThrow(/leases/);
        });

        test('treats a missing ledger as empty', () => {
            expect(store.listLeases({ ledgerPath })).toEqual([]);
        });

        test('leaves no temp file behind after a write', () => {
            store.createLease({ customerId: 'Acme', ledgerPath, now: NOW });
            const leftovers = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp'));
            expect(leftovers).toEqual([]);
        });
    });
});
