const { deliverResultSchema } = require('../src/schemas/resultDeliverySchema');
const { deliverResult } = require('../src/controllers/resultDeliveryController');

jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn()
}));

jest.mock('../src/services/partialPaymentExceptionService', () => ({
    assertInvoiceFullyPaid: jest.fn().mockResolvedValue({ allowed: true })
}));

const { triggerEvent } = require('../src/services/notificationJobService');

const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
});

const makeRequest = (body = { deliveryMethod: 'Email' }) => ({
    params: { examId: 'exam-1' },
    body,
    user: { user_id: 'user-1' },
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('jest')
});

const makeClient = ({ failOn } = {}) => {
    const client = {
        query: jest.fn(async (sql) => {
            const text = String(sql);
            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
            if (failOn && text.includes(failOn)) throw new Error('delivery write failed');
            if (text.includes('FROM examinations e')) {
                return {
                    rows: [{
                        exam_id: 'exam-1', appointment_id: 'appointment-1', patient_id: 'patient-1',
                        external_referring_doctor_id: null, order_number: 'ORD-1', status: 'Finalized',
                        report_status: 'Finalized', queue_stage: 'Finalized', current_station: 'Reporting',
                        phone_enc: null
                    }]
                };
            }
            if (text.includes('FROM invoices')) return { rows: [{ invoice_id: 'invoice-1' }] };
            if (text.includes('INSERT INTO result_deliveries')) return { rows: [{ delivery_id: 'delivery-1' }] };
            return { rows: [] };
        }),
        release: jest.fn()
    };
    return client;
};

describe('result delivery', () => {
    beforeEach(() => triggerEvent.mockClear());

    test('requires recipient and acknowledging names for physical pickup', () => {
        expect(deliverResultSchema.safeParse({ deliveryMethod: 'Physical Pickup' }).success).toBe(false);
        expect(deliverResultSchema.safeParse({
            deliveryMethod: 'Physical Pickup', recipientName: 'Patient', acknowledgedByName: 'Staff'
        }).success).toBe(true);
    });

    test('requires acknowledging name for acknowledged statuses', () => {
        expect(deliverResultSchema.safeParse({ deliveryMethod: 'Printed', deliveryStatus: 'Picked Up' }).success).toBe(false);
        expect(deliverResultSchema.safeParse({
            deliveryMethod: 'Printed', deliveryStatus: 'Picked Up', acknowledgedByName: 'Staff'
        }).success).toBe(true);
    });

    test('commits all delivery writes before notifying', async () => {
        const client = makeClient();
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const res = makeResponse();
        const next = jest.fn();

        await deliverResult(db)(makeRequest({ deliveryMethod: 'Email', deliveryStatus: 'Delivered' }), res, next);

        const queries = client.query.mock.calls.map(([sql]) => String(sql));
        expect(queries).toContain('BEGIN');
        expect(queries).toContain('COMMIT');
        expect(queries).not.toContain('ROLLBACK');
        expect(queries.some(query => query.includes('INSERT INTO result_deliveries'))).toBe(true);
        expect(queries.some(query => query.includes('UPDATE examinations'))).toBe(true);
        expect(queries.some(query => query.includes('INSERT INTO queue_events'))).toBe(true);
        expect(queries.some(query => query.includes('INSERT INTO order_status_history'))).toBe(true);
        expect(client.query.mock.calls.every(([, params]) => params === undefined || Array.isArray(params))).toBe(true);
        expect(triggerEvent).toHaveBeenCalled();
        expect(client.release).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(next).not.toHaveBeenCalled();
    });

    test('rolls back and does not notify when a delivery write fails', async () => {
        const client = makeClient({ failOn: 'UPDATE examinations' });
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const next = jest.fn();

        await deliverResult(db)(makeRequest({ deliveryMethod: 'Email', deliveryStatus: 'Delivered' }), makeResponse(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
        expect(triggerEvent).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'delivery write failed' }));
    });
});
