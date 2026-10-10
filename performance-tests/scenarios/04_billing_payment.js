/**
 * Scenario 04: Billing & Payment Idempotency
 * Tests Journey 5, PF-13 & Section 11 (Invoice lookup, payment processing, duplicate prevention)
 */

const crypto = require('crypto');
const { paymentIntegrity } = require('../lib/paymentIntegrity');

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
    const invoices = payableInvoices;
    const invoice = invoices[vuId % (invoices.length || 1)];

    if (!invoice?.invoice_id) {
        metricsCollector.record({scenario,action:'Payable invoice fixture required',method:'POST',endpoint:'/api/invoices/:id/payment',duration:0,status:0,ok:false,error:'No payable synthetic invoice; payment journey was not executed'});
        return;
    }

    if (invoice && invoice.invoice_id) {
        // 2. Lookup Invoice Details
        res = await client.get(`/api/invoices/${invoice.invoice_id}`);
        const before = res.data;
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
            ok: res.ok,
            error: res.ok ? null : (res.error || 'Payment business operation failed')
        });
        if (!res.ok) return;
        const firstPayment = res.data;

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
            ok: dupRes.ok && firstPayment?.payment?.payment_id === dupRes.data?.payment?.payment_id,
            error: dupRes.ok ? null : (dupRes.error || 'Idempotent replay failed')
        });
        const after = await client.get(`/api/invoices/${invoice.invoice_id}`);
        const integrity = after.ok && paymentIntegrity({first:firstPayment,replay:dupRes.data,before,after:after.data,amount:paymentPayload.amount});
        metricsCollector.record({scenario,action:'Payment record and paid balance after replay',method:'GET',endpoint:'/api/invoices/:id (integrity)',duration:after.duration,status:after.status,ok:integrity,error:integrity?null:'Replay must preserve one payment record and one increase in paid balance'});
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
