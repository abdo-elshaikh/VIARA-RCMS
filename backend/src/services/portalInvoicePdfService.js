const path = require('node:path');
const PDFDocument = require('pdfkit');
const { getLicense } = require('./licenseService');
const { resolveDocumentIdentity } = require('./documentIdentityService');

const fonts = path.resolve(__dirname, '../../assets/fonts');
const money = value => Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Native PDF output: no HTML execution, browser process, or external font/logo fetch.
const buildPortalInvoicePdf = (invoice, items, payments, settings = {}) => new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45, info: { Title: `Invoice ${invoice.invoice_number}`, Author: 'VIARA' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
        doc.registerFont('Latin', path.join(fonts, 'NotoSans-Regular.ttf'));
        doc.registerFont('Arabic', path.join(fonts, 'NotoSansArabic-Regular.ttf'));
        const text = (value, size = 11, options = {}) => {
            const content = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
            const arabic = /[\u0600-\u06ff]/.test(content);
            // Request full-run shaping. PDFKit's default per-word cache would
            // concatenate Arabic words in left-to-right order.
            doc.font(arabic ? 'Arabic' : 'Latin').fontSize(size).text(content, {
                align: arabic ? 'right' : 'left', ...(arabic ? { features: {} } : {}), ...options
            });
        };
        const identity = resolveDocumentIdentity(settings, invoice, { language: 'ar' });
        const trial = getLicense()?.edition === 'trial';
        const heading = () => {
            doc.fillColor('#075e4b');
            text(identity.displayName || identity.centerName || 'VIARA', 19);
            text('Invoice', 17);
            text('فاتورة', 17);
            if (trial) { doc.fillColor('#b45309'); text('TRIAL — Evaluation copy', 10); }
            doc.fillColor('#152c27');
            doc.moveDown(0.4);
        };
        heading();
        doc.on('pageAdded', heading);
        text(invoice.invoice_number, 13);
        text(`Date: ${new Date(invoice.generated_at).toISOString().slice(0, 10)}   Status: ${invoice.invoice_status}`);
        text(`MRN: ${invoice.mrn}`);
        text(invoice.patient_name);
        doc.moveDown();
        text('Description / Quantity / Unit price / Amount', 11);
        for (const item of items) {
            text(item.description, 11);
            text(`${item.quantity} x ${money(item.unit_price)} = ${money(item.total_amount)}`, 10, { align: 'right' });
            doc.moveDown(0.3);
        }
        doc.moveDown();
        for (const [label, value] of [
            ['Subtotal', invoice.subtotal_amount], ['Discount', invoice.discount_amount],
            ['Tax', invoice.tax_amount], ['Total', invoice.total_amount],
            ['Insurance', invoice.insurance_covered_amount], ['Patient payable', invoice.patient_payable_amount],
            ['Payments', invoice.paid_amount], ['Refunds', invoice.refunded_amount],
            ['Credit notes', invoice.credited_amount], ['Balance due', invoice.balance_amount]
        ]) text(`${label}: ${money(value)}`, 11);
        if (payments.length) {
            doc.moveDown(); text('Payment history', 13);
            for (const payment of payments) text(`${new Date(payment.transaction_date).toISOString().slice(0, 10)}   ${payment.method || ''}   ${money(payment.amount)}`, 10);
        }
        doc.end();
    } catch (error) { doc.destroy(); reject(error); }
});

module.exports = { buildPortalInvoicePdf };
