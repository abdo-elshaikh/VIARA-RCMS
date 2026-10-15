'use strict';
// Runs only in a fresh, disposable release-verification database.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Client } = require('/app/node_modules/pg');

(async () => {
    assert.equal(process.env.VIARA_AUDIT_SYNTHETIC, '1');
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
        const users = (await db.query('SELECT user_id,email FROM users')).rows;
        assert.deepEqual(users.map(row => row.email), ['admin@synthetic.example.test']);
        for (const table of ['patients', 'invoices', 'payments', 'cashier_shifts']) {
            assert.equal(Number((await db.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count), 0);
        }
        // The fixture provisions an already-onboarded synthetic administrator.
        await db.query('UPDATE users SET must_change_password=FALSE WHERE user_id=$1', [users[0].user_id]);
        await db.query('INSERT INTO cashier_shifts(cashier_id) VALUES ($1)', [users[0].user_id]);
        const origin = 'http://127.0.0.1:3000';
        const login = await fetch(origin + '/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: users[0].email, password: 'Synthetic-first-admin-password-123' }),
            signal: AbortSignal.timeout(15000)
        });
        assert.equal(login.status, 200);
        const { token } = await login.json();
        assert.ok(token);
        const csrf = await fetch(origin + '/api/csrf-token');
        assert.equal(csrf.status, 200);
        const cookie = csrf.headers.getSetCookie().find(value => value.startsWith('csrf_token='))?.split(';')[0];
        assert.ok(cookie);
        const durations = [];
        const pay = async (id, key, amount = 1) => {
            const start = performance.now();
            const response = await fetch(`${origin}/api/invoices/${id}/payment`, {
                method: 'POST', headers: {
                    'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
                    Cookie: cookie, 'x-csrf-token': cookie.slice('csrf_token='.length), 'Idempotency-Key': key
                }, body: JSON.stringify({ amount, method: 'Cash' }), signal: AbortSignal.timeout(30000)
            });
            const body = await response.json();
            durations.push(performance.now() - start);
            return { status: response.status, body };
        };
        const invoice = async amount => (await db.query(
            'INSERT INTO invoices(subtotal_amount,total_amount,patient_payable_amount) VALUES($1,$1,$1) RETURNING invoice_id',
            [amount]
        )).rows[0].invoice_id;
        const virtualUsers = 8;
        const rounds = 5;
        const ids = await Promise.all(Array.from({ length: virtualUsers }, () => invoice(100)));
        const started = performance.now();
        await Promise.all(ids.map(async id => {
            for (let round = 0; round < rounds; round++) {
                const key = randomUUID();
                const first = await pay(id, key);
                assert.equal(first.status, 201, JSON.stringify(first.body));
                assert.ok(first.body.payment.payment_id);
                const replay = await pay(id, key);
                assert.equal(replay.status, 201, JSON.stringify(replay.body));
                assert.deepEqual(replay.body, first.body);
            }
        }));
        const elapsedSeconds = (performance.now() - started) / 1000;
        const collisionId = await invoice(100);
        const collisionKey = randomUUID();
        const collisions = await Promise.all(Array.from({ length: virtualUsers }, () => pay(collisionId, collisionKey)));
        for (const result of collisions) {
            assert.equal(result.status, 201, JSON.stringify(result.body));
            assert.deepEqual(result.body, collisions[0].body);
        }
        const conflict = await pay(collisionId, collisionKey, 2);
        assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
        const lastBalanceId = await invoice(1);
        const lastBalance = await Promise.all([pay(lastBalanceId, randomUUID()), pay(lastBalanceId, randomUUID())]);
        assert.deepEqual(lastBalance.map(result => result.status).sort(), [201, 409]);
        const expectedCount = virtualUsers * rounds + 2;
        const payments = (await db.query('SELECT payment_id,invoice_id,amount FROM payments')).rows;
        assert.equal(payments.length, expectedCount);
        assert.equal(payments.reduce((sum, row) => sum + Number(row.amount), 0), expectedCount);
        for (const id of ids) assert.equal(payments.filter(row => row.invoice_id === id).length, rounds);
        const batches = (await db.query(`
            SELECT b.source_id,COUNT(e.entry_id)::integer AS entries,SUM(e.debit) AS debit,SUM(e.credit) AS credit
            FROM journal_batches b JOIN journal_entries e ON e.batch_id=b.batch_id
            WHERE b.source_type='Payment' GROUP BY b.batch_id,b.source_id
        `)).rows;
        assert.equal(batches.length, expectedCount);
        for (const payment of payments) {
            const matching = batches.filter(row => row.source_id === payment.payment_id);
            assert.equal(matching.length, 1);
            assert.equal(matching[0].entries, 2);
            assert.equal(Number(matching[0].debit), Number(payment.amount));
            assert.equal(Number(matching[0].credit), Number(payment.amount));
        }
        assert.equal((await db.query('SELECT invoice_status FROM invoices WHERE invoice_id=$1', [lastBalanceId])).rows[0].invoice_status, 'Paid');
        const sorted = durations.slice().sort((a, b) => a - b);
        const percentile = fraction => Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(1));
        console.log('AUDIT_PAYMENT_RESULT=' + JSON.stringify({
            passed: true, virtualUsers, rounds, requests: durations.length, committedPayments: expectedCount,
            exactReplay: true, concurrentSameKey: virtualUsers, changedPayloadDenied: true,
            concurrentOverpaymentDenied: true, balancedPaymentBatches: batches.length,
            baseline: { requests: virtualUsers * rounds * 2, elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
                requestsPerSecond: Number((virtualUsers * rounds * 2 / elapsedSeconds).toFixed(2)) },
            latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: percentile(1) },
            scope: 'synthetic cash invoices; single administrator; local backend HTTP; not a production capacity certification'
        }));
    } finally { await db.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
