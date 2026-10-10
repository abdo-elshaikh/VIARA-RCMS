const { deliverResultSchema } = require('../src/schemas/resultDeliverySchema');
const { deliverResult } = require('../src/controllers/resultDeliveryController');

jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/services/loyaltyRewardService', () => ({
    handleVisitCompletionReward: jest.fn().mockResolvedValue({})
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

const makeClient = ({ failOn, exam: examOverride } = {}) => {
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
                        report_status: 'Finalized', report_locked: true, report_finalized_at: new Date().toISOString(),
                        queue_stage: 'Finalized', current_station: 'Reporting',
                        phone_enc: null,
                        ...examOverride
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

    test('accepts an explicit images-only delivery type', () => {
        const parsed = deliverResultSchema.safeParse({
            deliveryMethod: 'Physical Pickup',
            resultType: 'Images',
            recipientName: 'Patient',
            acknowledgedByName: 'Patient'
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data.resultType).toBe('Images');
    });

    test('does not accept requester-asserted electronic delivery status', () => {
        expect(deliverResultSchema.safeParse({
            deliveryMethod: 'Email',
            deliveryStatus: 'Delivered'
        }).success).toBe(false);
        expect(deliverResultSchema.safeParse({
            deliveryMethod: 'Email'
        }).success).toBe(true);
    });

    test('records images-only pickup without marking a report delivered', async () => {
        const client = makeClient({
            exam: {
                status: 'Completed',
                report_status: 'Draft',
                report_locked: false,
                report_request_status: 'NotRequested',
                exam_completed_at: new Date().toISOString(),
                queue_stage: 'Images Ready',
                current_station: 'Delivery'
            }
        });
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const res = makeResponse();
        const next = jest.fn();

        await deliverResult(db)(makeRequest({
            deliveryMethod: 'Physical Pickup',
            resultType: 'Images',
            deliveryStatus: 'Picked Up',
            recipientName: 'Patient',
            acknowledgedByName: 'Patient'
        }), res, next);

        const deliveryInsert = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO result_deliveries'));
        const examUpdate = client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE examinations'));
        expect(deliveryInsert[1]).toContain('Images');
        expect(examUpdate[1]).toEqual(expect.arrayContaining([false, true, 'Images Delivered']));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects duplicate final-result delivery', async () => {
        const client = makeClient({
            exam: {
                delivered_at: new Date().toISOString()
            }
        });
        const next = jest.fn();

        await deliverResult({ connect: jest.fn().mockResolvedValue(client) })(
            makeRequest({ deliveryMethod: 'Email' }),
            makeResponse(),
            next
        );

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            message: 'This result has already been delivered'
        }));
        expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO result_deliveries'));
    });

    test('records electronic delivery as pending and queues the notification after commit', async () => {
        const client = makeClient();
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const res = makeResponse();
        const next = jest.fn();

        await deliverResult(db)(makeRequest({ deliveryMethod: 'Email' }), res, next);

        const queries = client.query.mock.calls.map(([sql]) => String(sql));
        expect(queries).toContain('BEGIN');
        expect(queries).toContain('COMMIT');
        expect(queries).not.toContain('ROLLBACK');
        expect(queries.some(query => query.includes('INSERT INTO result_deliveries'))).toBe(true);
        expect(queries.some(query => query.includes('UPDATE examinations'))).toBe(false);
        expect(queries.some(query => query.includes('INSERT INTO queue_events'))).toBe(false);
        expect(client.query.mock.calls.every(([, params]) => params === undefined || Array.isArray(params))).toBe(true);
        expect(triggerEvent).toHaveBeenCalled();
        expect(client.release).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects direct claims that an electronic result was delivered', async () => {
        const client = makeClient();
        const next = jest.fn();

        await deliverResult({ connect: jest.fn().mockResolvedValue(client) })(
            makeRequest({ deliveryMethod: 'Email', deliveryStatus: 'Delivered' }),
            makeResponse(),
            next
        );

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422 }));
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO result_deliveries'))).toBe(false);
    });

    test('rolls back and does not notify when a delivery write fails', async () => {
        const client = makeClient({ failOn: 'INSERT INTO result_deliveries' });
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const next = jest.fn();

        await deliverResult(db)(makeRequest({ deliveryMethod: 'Email' }), makeResponse(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
        expect(triggerEvent).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'delivery write failed' }));
    });
});
