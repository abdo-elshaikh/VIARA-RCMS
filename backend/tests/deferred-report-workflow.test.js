const {
    completeAcquisitionSchema,
    requestReportSchema
} = require('../src/schemas/examSchema');

jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn().mockResolvedValue({}),
    triggerEventForRole: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/services/realtimeService', () => ({
    sendToRole: jest.fn(),
    sendToUser: jest.fn(),
    broadcastToStaff: jest.fn()
}));

jest.mock('../src/services/clinicalTaskAssignmentService', () => {
    const actual = jest.requireActual('../src/services/clinicalTaskAssignmentService');
    return {
        ...actual,
        completeTask: jest.fn().mockResolvedValue({ assignment_status: 'Completed' }),
        markTaskAvailable: jest.fn().mockResolvedValue({ assignment_version: 1 })
    };
});

const { completeAcquisition, requestDeferredReport, deferReportForImages, transitionQueue } = require('../src/controllers/queueController');

const EXAM_ID = '00000000-0000-4000-8000-000000000201';
const APPOINTMENT_ID = '00000000-0000-4000-8000-000000000202';
const USER_ID = '00000000-0000-4000-8000-000000000203';

const response = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });

const clientFor = (existing, updated) => ({
    query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('SELECT e.*')) return { rows: [existing] };
        if (text.includes('UPDATE examinations')) return { rows: [updated] };
        return { rows: [] };
    }),
    release: jest.fn()
});

describe('deferred reporting workflow', () => {
    test('validates the two acquisition result modes', () => {
        expect(completeAcquisitionSchema.safeParse({ resultMode: 'ReportAndImages' }).success).toBe(true);
        expect(completeAcquisitionSchema.safeParse({ resultMode: 'ImagesOnly' }).success).toBe(true);
        expect(completeAcquisitionSchema.safeParse({ resultMode: 'Finalized' }).success).toBe(false);
        expect(requestReportSchema.safeParse({}).data.source).toBe('Reception');
    });

    test('completes acquisition as images-only without creating a reporting task', async () => {
        const existing = {
            exam_id: EXAM_ID,
            appointment_id: APPOINTMENT_ID,
            queue_stage: 'In Exam',
            current_station: 'Modality',
            status: 'Scanning',
            report_request_status: 'Requested',
            contrast_required: false,
            technician_id: USER_ID,
            order_number: 'ORD-201'
        };
        const updated = {
            ...existing,
            queue_stage: 'Images Ready',
            current_station: 'Delivery',
            status: 'Completed',
            report_request_status: 'NotRequested'
        };
        const client = clientFor(existing, updated);
        const res = response();
        const next = jest.fn();

        await completeAcquisition({ connect: jest.fn().mockResolvedValue(client) })({
            params: { examId: EXAM_ID },
            body: { resultMode: 'ImagesOnly' },
            user: { user_id: USER_ID, role: 'Technician' },
            ip: '127.0.0.1'
        }, res, next);

        const update = client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE examinations'));
        expect(update[1]).toEqual(expect.arrayContaining(['Completed', 'Images Ready', 'Delivery', 'NotRequested', true]));
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith(updated);
        expect(next).not.toHaveBeenCalled();
    });

    test('reopens an images-delivered examination for a requested report', async () => {
        const existing = {
            exam_id: EXAM_ID,
            appointment_id: APPOINTMENT_ID,
            queue_stage: 'Images Delivered',
            current_station: 'Delivery',
            status: 'Completed',
            report_status: 'Draft',
            report_locked: false,
            report_request_status: 'NotRequested',
            images_delivered_at: new Date().toISOString(),
            order_number: 'ORD-201'
        };
        const updated = {
            ...existing,
            queue_stage: 'Reporting',
            current_station: 'Radiologist',
            status: 'Reporting',
            report_request_status: 'Requested'
        };
        const client = clientFor(existing, updated);
        const res = response();
        const next = jest.fn();

        await requestDeferredReport({ connect: jest.fn().mockResolvedValue(client) })({
            params: { examId: EXAM_ID },
            body: { source: 'Reception' },
            user: { user_id: USER_ID, role: 'Receptionist' },
            ip: '127.0.0.1'
        }, res, next);

        const update = client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE examinations'));
        expect(update[1]).toEqual([EXAM_ID, USER_ID, 'Reception']);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith(updated);
        expect(next).not.toHaveBeenCalled();
    });

    test('defers report and moves examination to images-ready upon patient request', async () => {
        const existing = {
            exam_id: EXAM_ID,
            appointment_id: APPOINTMENT_ID,
            queue_stage: 'Reporting',
            current_station: 'Radiologist',
            status: 'Reporting',
            report_status: 'Draft',
            report_locked: false,
            report_request_status: 'Requested',
            order_number: 'ORD-201'
        };
        const updated = {
            ...existing,
            queue_stage: 'Images Ready',
            current_station: 'Delivery',
            status: 'Completed',
            report_request_status: 'NotRequested'
        };
        const client = clientFor(existing, updated);
        const res = response();
        const next = jest.fn();

        await deferReportForImages({ connect: jest.fn().mockResolvedValue(client) })({
            params: { examId: EXAM_ID },
            body: { reason: 'Patient wants images now' },
            user: { user_id: USER_ID, role: 'Receptionist' },
            ip: '127.0.0.1'
        }, res, next);

        const update = client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE examinations'));
        expect(update).toBeTruthy();
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith(updated);
        expect(next).not.toHaveBeenCalled();
    });

    test('never allows the general queue transition to finalize a report', async () => {
        const existing = {
            exam_id: EXAM_ID,
            appointment_id: APPOINTMENT_ID,
            queue_stage: 'Reporting',
            current_station: 'Radiologist',
            status: 'Reporting',
            report_status: 'Approved',
            report_locked: false,
            performing_radiologist_id: USER_ID,
            radiologist_assignment_version: 1,
            is_on_hold: false,
            priority: 'Routine'
        };
        const client = clientFor(existing, existing);
        const next = jest.fn();

        await transitionQueue({ connect: jest.fn().mockResolvedValue(client) })({
            params: { examId: EXAM_ID },
            body: { toStage: 'Finalized' },
            user: { user_id: USER_ID, role: 'Radiologist' },
            headers: {},
            ip: '127.0.0.1'
        }, response(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            code: 'REPORT_FINALIZATION_REQUIRED'
        }));
    });

    test('requires the dedicated completion action when leaving image acquisition', async () => {
        const existing = {
            exam_id: EXAM_ID,
            appointment_id: APPOINTMENT_ID,
            queue_stage: 'In Exam',
            current_station: 'Modality',
            status: 'Scanning',
            technician_id: USER_ID,
            technician_assignment_version: 1,
            is_on_hold: false,
            priority: 'Routine'
        };
        const client = clientFor(existing, existing);
        const next = jest.fn();

        await transitionQueue({ connect: jest.fn().mockResolvedValue(client) })({
            params: { examId: EXAM_ID },
            body: { toStage: 'Reporting' },
            user: { user_id: USER_ID, role: 'Technician' },
            headers: {},
            ip: '127.0.0.1'
        }, response(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            code: 'ACQUISITION_COMPLETION_REQUIRED'
        }));
    });
});
