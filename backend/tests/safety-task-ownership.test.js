const { submitSafetyResponse } = require('../src/controllers/safetyController');

const examId = '00000000-0000-4000-8000-000000000401';
const templateId = '00000000-0000-4000-8000-000000000402';
const technicianId = '00000000-0000-4000-8000-000000000403';

const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

describe('safety response task ownership', () => {
    test('does not grant an administrator implicit access to a private task', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = response();
        const next = jest.fn();

        await submitSafetyResponse(db)({
            params: { examId },
            body: { templateId, answers: { cleared: true } },
            user: { user_id: technicianId, role: 'Admin' }
        }, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(res.json).not.toHaveBeenCalled();
    });

    test('allows the assigned technician to submit the safety response', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT e.status')) return { rows: [{ status: 'Checked-in' }] };
                if (text.includes('FROM safety_templates')) return { rows: [{ '?column?': 1 }] };
                if (text.includes('INSERT INTO exam_safety_responses')) {
                    return { rows: [{ exam_id: examId, template_id: templateId }] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };
        const res = response();
        const next = jest.fn();

        await submitSafetyResponse(db)({
            params: { examId },
            body: { templateId, answers: { cleared: true } },
            user: { user_id: technicianId, role: 'Technician' }
        }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Safety form submitted successfully'
        }));
    });
});
