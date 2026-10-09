export const normalizeReportReference = raw => {
    const value = String(raw || '').trim();
    if (!value) return '';
    try {
        const url = new URL(value);
        for (const key of ['receipt', 'receiptNumber', 'invoice', 'invoiceNumber', 'order', 'orderNumber', 'examId', 'id']) {
            const candidate = url.searchParams.get(key);
            if (candidate) return candidate.trim();
        }
        if (url.searchParams.has('mrn')) return '';
        const last = url.pathname.split('/').filter(Boolean).pop();
        if (last) return decodeURIComponent(last).trim();
    } catch { /* Scanner text is handled below. */ }
    return (value.match(/(RCT-\d{8}-[A-Z0-9]+|INV-\d{8}-[A-Z0-9]+|ORD-\d{8}-[A-Z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i)?.[1] || value).trim();
};

export const findExactReportMatch = (items, raw) => {
    const reference = normalizeReportReference(raw);
    if (!reference || !Array.isArray(items)) return undefined;
    return items.find(item => [item.receipt_number, item.invoice_number, item.order_number, item.exam_id]
        .some(value => String(value || '').trim() === reference));
};
