/**
 * Scenario 04: Billing & Payment Idempotency
 * Tests Journey 5, PF-13 & Section 11 (Invoice lookup, payment processing, duplicate prevention)
 */

const crypto = require('crypto');

async function runBillingPaymentScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '04_billing_payment';
    const client = await userPool.createAuthenticatedClient('cashier');

    // 1. Query Invoices List
    let res = await client.get('/api/invoices?openOnly=true&limit=20');
    metricsCollector.record({
        scenario,
        action: 'Query Invoices List',
        method: 'GET',
        endpoint: '/api/invoices',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    const rawInvoices = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    const payableInvoices = rawInvoices.filter(i => !i.contrast_required && i.invoice_status !== 'Voided' && i.invoice_status !== 'Paid');
    const invoices = payableInvoices.length ? payableInvoices : rawInvoices;
    const invoice = invoices[vuId % (invoices.length || 1)];

    if (invoice && invoice.invoice_id) {
        // 2. Lookup Invoice Details
        res = await client.get(`/api/invoices/${invoice.invoice_id}`);
        metricsCollector.record({
            scenario,
            action: 'Lookup Invoice Details',
            method: 'GET',
            endpoint: '/api/invoices/:id',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        // 3. Payment Attempt with Idempotency Key
        const idempotencyKey = crypto.randomUUID();
        const paymentPayload = {
            amount: 1.00,
            method: 'Cash',
            paymentReference: `PERF_REF_${vuId}`
        };

        res = await client.post(`/api/invoices/${invoice.invoice_id}/payment`, paymentPayload, {
            headers: { 'idempotency-key': idempotencyKey }
        });


        metricsCollector.record({
            scenario,
            action: 'Record Payment',
            method: 'POST',
            endpoint: '/api/invoices/:id/payment',
            duration: res.duration,
            status: res.status,
            // 200, 201, 400 (validation), or 409 (already paid or balance exceeded) are valid business outcomes
            ok: res.ok || res.status === 400 || res.status === 409,
            error: (res.ok || res.status === 400 || res.status === 409) ? null : res.error
        });

        // 4. Duplicate Attempt with SAME Idempotency Key (Must prevent double-charge)
        const dupRes = await client.post(`/api/invoices/${invoice.invoice_id}/payment`, paymentPayload, {
            headers: { 'idempotency-key': idempotencyKey }
        });

        metricsCollector.record({
            scenario,
            action: 'Duplicate Payment Replay Prevention',
            method: 'POST',
            endpoint: '/api/invoices/:id/payment (replay)',
            duration: dupRes.duration,
            status: dupRes.status,
            ok: dupRes.ok || dupRes.status === 409 || dupRes.status === 400,
            error: dupRes.error
        });
    }

    // 5. Query Invoices Summary Aggregation
    res = await client.get('/api/invoice-summary');
    metricsCollector.record({
        scenario,
        action: 'Query Invoices Summary',
        method: 'GET',
        endpoint: '/api/invoice-summary',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 6. Query Current Cashier Shift
    res = await client.get('/api/cashier/shifts/current');
    metricsCollector.record({
        scenario,
        action: 'Current Cashier Shift',
        method: 'GET',
        endpoint: '/api/cashier/shifts/current',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });
}

module.exports = runBillingPaymentScenario;
